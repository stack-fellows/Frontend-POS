import WebSocket from 'ws';
import { loadSettings } from './settings';
import { prisma } from './db';
import { broadcast } from './server';
import { printReceipt } from './printer';

let ws: WebSocket | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let isStopped = false;

export function connectToCloudWs() {
  if (isStopped) return;
  
  const settings = loadSettings();
  if (!settings.isMaster) {
    console.log('[Cloud WS] Worker terminal. Skipping cloud WebSocket connection.');
    return;
  }

  // Convert http://host:port to ws://host:port
  const wsUrl = settings.cloudUrl.replace(/^http/, 'ws');
  console.log(`[Cloud WS] Connecting to cloud WebSocket at: ${wsUrl}`);

  if (ws) {
    ws.removeAllListeners();
    ws.close();
  }

  ws = new WebSocket(wsUrl, {
    headers: {
      'Authorization': `Bearer ${settings.licenseKey}`
    }
  });

  ws.on('open', () => {
    console.log('[Cloud WS] Connection established. Registering branch...');
    ws?.send(JSON.stringify({
      type: 'REGISTER_BRANCH',
      branchId: settings.branchId
    }));
  });

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('[Cloud WS] Message received:', message);

      if (message.type === 'ONLINE_DELIVERY_ORDER') {
        const { aggregator, orderId, customerName, customerPhone, deliveryAddress, items, total } = message;
        console.log(`[Cloud WS] Processing delivery order ${orderId} from ${aggregator}`);

        // 1. Verify shift is open
        const activeShift = await prisma.employeeShift.findFirst({
          where: { closedAt: null }
        });

        if (!activeShift) {
          console.error('[Cloud WS] Cannot ingest delivery order: no shift is currently open.');
          return;
        }

        // 2. Map items and load recipes/deductions
        const orderItemsData: { variantId: string; name: string; quantity: number; price: number }[] = [];
        const deductions: { id: string; ingredientName: string; amount: number; minThreshold: number }[] = [];
        const lowStockAlerts: string[] = [];

        for (const item of items) {
          // Find matching variant by SKU or name
          let variant = await prisma.productVariant.findFirst({
            where: {
              OR: [
                { sku: item.sku },
                { name: item.variantName || 'Standard' }
              ]
            },
            include: { product: true }
          });

          if (!variant) {
            // Fallback: search for first variant of any product matching the name
            const firstProduct = await prisma.product.findFirst({
              include: { variants: true }
            });
            if (firstProduct && firstProduct.variants.length > 0) {
              variant = firstProduct.variants[0] as any;
            }
          }

          if (variant) {
            const itemQty = item.quantity || 1;
            const itemPrice = item.price || variant.price;

            orderItemsData.push({
              variantId: variant.id,
              name: `${variant.product.name} (${variant.name})`,
              quantity: itemQty,
              price: itemPrice
            });

            // Gather inventory recipe deductions
            const recipes = await prisma.recipeIngredient.findMany({
              where: { productVariantId: variant.id },
              include: { inventoryStock: true }
            });

            for (const r of recipes) {
              deductions.push({
                id: r.inventoryStock.id,
                ingredientName: r.inventoryStock.ingredientName,
                amount: r.amountRequired * itemQty,
                minThreshold: r.inventoryStock.minThreshold
              });
            }
          }
        }

        if (orderItemsData.length === 0) {
          console.error('[Cloud WS] Could not resolve any menu items for delivery order. Skipping.');
          return;
        }

        // 3. Generate Order Number
        const today = new Date();
        const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const orderCount = await prisma.order.count({
          where: { createdAt: { gte: startOfDay } }
        });
        const seqStr = String(orderCount + 1).padStart(4, '0');
        const orderNumber = `${settings.branchId}-DELIV-${dateStr}-${seqStr}`;

        const subtotal = total / 1.10;
        const tax = total - subtotal;

        // 4. Run database transaction: Order writing + Inventory Deductions
        const result = await prisma.$transaction(async (tx) => {
          const newOrder = await tx.order.create({
            data: {
              orderNumber,
              status: 'PENDING',
              paymentStatus: 'PAID', // Deliveries are pre-paid
              paymentMethod: 'CARD', 
              subtotal,
              tax,
              total,
              employeeId: 'DELIVERY_BOT',
              shiftId: activeShift.id,
              orderType: 'DELIVERY',
              customerName: customerName || 'Online Client',
              customerPhone: customerPhone || null,
              deliveryAddress: deliveryAddress || null,
              items: {
                create: orderItemsData.map(item => ({
                  productVariantId: item.variantId,
                  quantity: item.quantity,
                  unitPrice: item.price,
                  totalPrice: item.price * item.quantity
                }))
              }
            },
            include: {
              items: {
                include: {
                  productVariant: {
                    include: { product: true }
                  }
                }
              }
            }
          });

          // Deduct inventory
          for (const d of deductions) {
            const updatedStock = await tx.inventoryStock.update({
              where: { id: d.id },
              data: { quantity: { decrement: d.amount } }
            });
            if (updatedStock.quantity <= d.minThreshold) {
              lowStockAlerts.push(d.ingredientName);
            }
            await tx.localSyncOutbox.create({
              data: {
                entityName: 'InventoryStock',
                entityId: updatedStock.id,
                action: 'UPDATE',
                payload: JSON.stringify(updatedStock),
                status: 'PENDING'
              }
            });
          }

          // Log Order to outbox
          await tx.localSyncOutbox.create({
            data: {
              entityName: 'Order',
              entityId: newOrder.id,
              action: 'CREATE',
              payload: JSON.stringify(newOrder),
              status: 'PENDING'
            }
          });

          return newOrder;
        });

        console.log(`[Cloud WS] Order ${result.orderNumber} created locally from aggregator webhook.`);

        // 5. Trigger auto-printing using configured printer from settings
        try {
          const receiptPayload = {
            orderNumber: result.orderNumber,
            dateTime: result.createdAt,
            employeeName: `${aggregator} (${customerName || 'Online'})`,
            items: orderItemsData.map(item => ({
              name: item.name,
              qty: item.quantity,
              price: item.price
            })),
            subtotal,
            tax,
            total,
            paymentMethod: 'CARD'
          };
          const mode = settings.printerMode || 'usb';
          const target = settings.printerTarget || 'POSPrinter';
          await printReceipt(target, receiptPayload, mode, settings.printerLogoBase64);
        } catch (err: any) {
          console.error('[Cloud WS] Auto-printing failed:', err.message);
        }

        // 6. Broadcast event downstream to KDS/POS UI
        broadcast({ type: 'NEW_ORDER', order: result });
        if (lowStockAlerts.length > 0) {
          broadcast({ type: 'LOW_STOCK_WARNING', ingredients: lowStockAlerts });
        }
      }
    } catch (err: any) {
      console.error('[Cloud WS] Parsing message error:', err.message);
    }
  });

  ws.on('close', () => {
    console.log('[Cloud WS] Connection closed.');
    if (!isStopped) {
      scheduleReconnect();
    }
  });

  ws.on('error', (err) => {
    console.error('[Cloud WS] Socket error:', err.message);
  });
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    connectToCloudWs();
  }, 5000);
}

export function disconnectCloudWs() {
  isStopped = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
}
