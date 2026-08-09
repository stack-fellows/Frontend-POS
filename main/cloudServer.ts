import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { PrismaClient } from './generated/cloud-client';
import { requireApiKey } from './middleware/auth';
import rateLimit from 'express-rate-limit';

const prisma = new PrismaClient();
const app = express();

const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 100, // max 100 requests per window
  message: 'Too many requests, please try again later.'
});

const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(limiter);
app.use(requireApiKey);

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Map of active branch WebSocket connections: branchId -> WebSocket
const activeBranches = new Map<string, WebSocket>();



wss.on('connection', (ws) => {
  let registeredBranchId: string | null = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      if (data.type === 'REGISTER_BRANCH') {
        registeredBranchId = data.branchId;
        if (registeredBranchId) {
          activeBranches.set(registeredBranchId, ws);
          console.log(`[Embedded Cloud WS] Branch registered: ${registeredBranchId}`);
        }
      }
    } catch (err) {
      console.error('[Embedded Cloud WS] Parsing error:', err);
    }
  });

  ws.on('close', () => {
    if (registeredBranchId) {
      activeBranches.delete(registeredBranchId);
      console.log(`[Embedded Cloud WS] Branch disconnected: ${registeredBranchId}`);
    }
  });
});

// Upgrade HTTP to WS
server.on('upgrade', (request, socket, head) => {
  const authHeader = request.headers['authorization'];
  const CLOUD_API_KEY = process.env.CLOUD_API_KEY || 'enterprise-secret-key-123';
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }
  
  const token = authHeader.split(' ')[1];
  if (token !== CLOUD_API_KEY) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request as http.IncomingMessage);
  });
});

// ----------------------------------------------------
// 1. HEALTH HEARTBEAT
// ----------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Embedded Cloud Central Server is online.' });
});

// ----------------------------------------------------
// 2. HYBRID SYNC INGESTION (OUTBOX PATTERN)
// ----------------------------------------------------
app.post('/api/sync/batch', async (req, res) => {
  const { branchId, terminalId, enterpriseTenantId, events } = req.body;
  const results = [];

  for (const event of events) {
    const { id, entityName, entityId, action, payload } = event;
    try {
      const data = JSON.parse(payload);
      console.log(`[Embedded Cloud Sync Batch] Ingesting ${action} on ${entityName} (${entityId}) from branch ${branchId}`);

      if (entityName === 'EmployeeShift') {
        await prisma.employeeShift.upsert({
          where: { id: entityId },
          create: {
            id: entityId,
            branchId,
            terminalId,
            enterpriseTenantId,
            employeePin: data.employeePin,
            employeeName: data.employeeName,
            openedAt: new Date(data.openedAt),
            closedAt: data.closedAt ? new Date(data.closedAt) : null,
            openingBalance: data.openingBalance,
            closingBalance: data.closingBalance,
            actualCash: data.actualCash,
            expectedCash: data.expectedCash,
            cardSales: data.cardSales,
            cashSales: data.cashSales,
            synchronizedAt: new Date()
          },
          update: {
            closedAt: data.closedAt ? new Date(data.closedAt) : null,
            closingBalance: data.closingBalance,
            actualCash: data.actualCash,
            expectedCash: data.expectedCash,
            cardSales: data.cardSales,
            cashSales: data.cashSales,
            synchronizedAt: new Date()
          }
        });
      } else if (entityName === 'Product') {
        if (data.deletedAt) {
          try {
            await prisma.product.delete({
              where: { id: entityId }
            });
          } catch (e: any) {
            console.log(`[Embedded Cloud Sync Batch] Product ${entityId} already deleted:`, e.message);
          }
        } else {
          await prisma.product.upsert({
            where: { id: entityId },
            create: {
              id: entityId,
              enterpriseTenantId,
              name: data.name,
              description: data.description,
              category: data.category,
              imageUrl: data.imageUrl,
            },
            update: {
              name: data.name,
              description: data.description,
              category: data.category,
              imageUrl: data.imageUrl,
            }
          });

          if (data.variants && Array.isArray(data.variants)) {
            for (const v of data.variants) {
              await prisma.productVariant.upsert({
                where: { id: v.id },
                create: {
                  id: v.id,
                  enterpriseTenantId,
                  productId: entityId,
                  name: v.name,
                  price: v.price,
                  sku: v.sku
                },
                update: {
                  name: v.name,
                  price: v.price,
                  sku: v.sku
                }
              });
            }
          }
        }
      } else if (entityName === 'Order') {
        const shiftExists = await prisma.employeeShift.findUnique({
          where: { id: data.shiftId }
        });
        if (!shiftExists) {
          console.log(`[Embedded Cloud Sync Batch] Creating placeholder shift ${data.shiftId} for order ${entityId}`);
          await prisma.employeeShift.create({
            data: {
              id: data.shiftId,
              branchId,
              terminalId,
              enterpriseTenantId,
              employeePin: data.employeeId || '0000',
              employeeName: 'Synchronized Cashier',
              openedAt: data.createdAt ? new Date(data.createdAt) : new Date(),
              openingBalance: 0.0,
            }
          });
        }

        if (data.items && Array.isArray(data.items)) {
          for (const item of data.items) {
            if (item.productVariant) {
              const pv = item.productVariant;
              if (pv.product) {
                const prod = pv.product;
                await prisma.product.upsert({
                  where: { id: pv.productId },
                  create: {
                    id: pv.productId,
                    enterpriseTenantId,
                    name: prod.name,
                    description: prod.description,
                    category: prod.category,
                    imageUrl: prod.imageUrl,
                  },
                  update: {
                    name: prod.name,
                    description: prod.description,
                    category: prod.category,
                    imageUrl: prod.imageUrl,
                  }
                });
              }

              await prisma.productVariant.upsert({
                where: { id: item.productVariantId },
                create: {
                  id: item.productVariantId,
                  enterpriseTenantId,
                  productId: pv.productId,
                  name: pv.name,
                  price: pv.price,
                  sku: pv.sku
                },
                update: {
                  name: pv.name,
                  price: pv.price,
                  sku: pv.sku
                }
              });
            }

            if (item.modifiers && Array.isArray(item.modifiers)) {
              for (const m of item.modifiers) {
                if (m.modifier) {
                  const mod = m.modifier;
                  const groupExists = await prisma.modifierGroup.findUnique({
                    where: { id: mod.groupId }
                  });
                  if (!groupExists) {
                    await prisma.modifierGroup.create({
                      data: {
                        id: mod.groupId,
                        enterpriseTenantId,
                        name: 'Synchronized Modifier Group',
                        minSelected: 0,
                        maxSelected: 1
                      }
                    });
                  }

                  await prisma.modifier.upsert({
                    where: { id: m.modifierId },
                    create: {
                      id: m.modifierId,
                      enterpriseTenantId,
                      groupId: mod.groupId,
                      name: mod.name,
                      price: mod.price
                    },
                    update: {
                      name: mod.name,
                      price: mod.price
                    }
                  });
                }
              }
            }
          }
        }

        await prisma.order.upsert({
          where: { orderNumber: data.orderNumber },
          create: {
            id: entityId,
            branchId,
            terminalId,
            enterpriseTenantId,
            orderNumber: data.orderNumber,
            status: data.status,
            paymentStatus: data.paymentStatus,
            paymentMethod: data.paymentMethod,
            subtotal: data.subtotal,
            tax: data.tax,
            total: data.total,
            employeeId: data.employeeId,
            shiftId: data.shiftId,
            memberId: data.memberId,
            tableNumber: data.tableNumber,
            waiterInfo: data.waiterInfo,
            orderType: data.orderType,
            customerName: data.customerName,
            customerPhone: data.customerPhone,
            deliveryAddress: data.deliveryAddress,
            deliveryPlatform: data.deliveryPlatform,
            isPrinted: data.isPrinted,
            synchronizedAt: new Date(),
            createdAt: new Date(data.createdAt),
            items: {
              create: (data.items || []).map((item: any) => ({
                id: item.id,
                productVariantId: item.productVariantId,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                totalPrice: item.totalPrice,
                modifiers: {
                  create: (item.modifiers || []).map((m: any) => ({
                    id: m.id,
                    modifierId: m.modifierId,
                    price: m.price
                  }))
                }
              }))
            }
          },
          update: {
            status: data.status,
            paymentStatus: data.paymentStatus,
            tableNumber: data.tableNumber,
            waiterInfo: data.waiterInfo,
            orderType: data.orderType,
            customerName: data.customerName,
            customerPhone: data.customerPhone,
            deliveryAddress: data.deliveryAddress,
            deliveryPlatform: data.deliveryPlatform,
            isPrinted: data.isPrinted,
            synchronizedAt: new Date()
          }
        });

        if (data.memberId) {
          const pointsEarned = Math.floor(parseFloat(data.total));
          try {
            const member = await prisma.loyaltyMember.findUnique({ where: { id: data.memberId } });
            if (member) {
              const updated = await prisma.loyaltyMember.update({
                where: { id: data.memberId },
                data: { points: member.points + pointsEarned }
              });
              console.log(`[Embedded Cloud Loyalty] Credited ${pointsEarned} points to ${updated.memberName} (New total: ${updated.points})`);
            }
          } catch (e: any) {
            console.error(`[Embedded Cloud Loyalty] Failed to credit points:`, e.message);
          }
        }
      } else if (entityName === 'InventoryStock') {
        await prisma.inventoryStock.upsert({
          where: {
            branchId_ingredientName: {
              branchId,
              ingredientName: data.ingredientName
            }
          },
          create: {
            id: entityId,
            branchId,
            enterpriseTenantId,
            ingredientName: data.ingredientName,
            quantity: data.quantity,
            minThreshold: data.minThreshold
          },
          update: {
            quantity: data.quantity,
            minThreshold: data.minThreshold
          }
        });
      }

      results.push({ id, success: true });
    } catch (err: any) {
      console.error(`[Embedded Cloud Sync Batch] Failed to ingest event ${id}:`, err.message);
      results.push({ id, success: false, error: err.message });
    }
  }

  res.json({ results });
});

// ----------------------------------------------------
// 3. ONLINE DELIVERIES WEBHOOK (FOODPANDA / UBER EATS)
// ----------------------------------------------------
app.post('/api/deliveries/webhook', async (req, res) => {
  const { aggregator, branchId, orderId, items, customerName, total } = req.body;
  
  console.log(`[Embedded Cloud Webhook] Received delivery order ${orderId} from ${aggregator} for branch ${branchId}`);

  const branchSocket = activeBranches.get(branchId);
  
  if (!branchSocket || branchSocket.readyState !== WebSocket.OPEN) {
    console.log(`[Embedded Cloud Webhook] Branch ${branchId} is currently OFFLINE. Rejecting order.`);
    res.status(503).json({ error: 'Store branch is offline / closed' });
    return;
  }

  branchSocket.send(JSON.stringify({
    type: 'ONLINE_DELIVERY_ORDER',
    aggregator,
    orderId,
    customerName,
    items,
    total
  }));

  console.log(`[Embedded Cloud Webhook] Dispatched order ${orderId} downstream to branch ${branchId}`);
  res.json({ success: true, message: 'Order dispatched to branch terminal' });
});

// ----------------------------------------------------
// 4. LOYALTY MEMBER POINTS SYSTEM
// ----------------------------------------------------
app.get('/api/loyalty/:memberId', async (req, res) => {
  try {
    const { memberId } = req.params;
    const member = await prisma.loyaltyMember.findUnique({
      where: { id: memberId }
    });
    
    if (!member) {
      res.status(404).json({ error: 'Loyalty member not found' });
      return;
    }
    res.json({ memberId: member.id, points: member.points, memberName: member.memberName });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/loyalty/redeem', async (req, res) => {
  try {
    const { memberId, pointsToRedeem } = req.body;
    const member = await prisma.loyaltyMember.findUnique({
      where: { id: memberId }
    });
    
    if (!member) {
      res.status(404).json({ error: 'Loyalty member not found' });
      return;
    }
    if (pointsToRedeem > member.points) {
      res.status(400).json({ error: 'Insufficient points' });
      return;
    }
    
    const updated = await prisma.loyaltyMember.update({
      where: { id: memberId },
      data: { points: member.points - pointsToRedeem }
    });
    
    res.json({ success: true, remainingPoints: updated.points });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/loyalty', async (req, res) => {
  try {
    const { id, enterpriseTenantId, memberName, phone, points } = req.body;
    const newMember = await prisma.loyaltyMember.create({
      data: {
        id,
        enterpriseTenantId,
        memberName,
        phone,
        points: points || 0
      }
    });
    res.json(newMember);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/loyalty', async (req, res) => {
  try {
    const members = await prisma.loyaltyMember.findMany();
    res.json(members);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

let serverInstance: http.Server | null = null;

export function startEmbeddedCloudServer() {
  if (serverInstance) return;
  const PORT = process.env.CLOUD_PORT || 5000;
  serverInstance = server.listen(PORT, () => {
    console.log(`[Embedded Cloud Server] Running on http://localhost:${PORT}`);
  });
}

export function stopEmbeddedCloudServer() {
  if (serverInstance) {
    serverInstance.close();
    serverInstance = null;
    console.log('[Embedded Cloud Server] Stopped');
  }
}
