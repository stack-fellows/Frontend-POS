import express from 'express';
import cors from 'cors';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { app as electronApp } from 'electron';
import { prisma } from './db';
import { loadSettings, saveSettings } from './settings';

const isProd = electronApp && electronApp.isPackaged;
const appDataFolder = path.join(
  process.env.APPDATA || (process.platform === 'darwin' ? process.env.HOME + '/Library/Application Support' : '/tmp'),
  'cafe-pos-client'
);


const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Store active WebSocket connections
const clients = new Set<WebSocket>();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`[WS] New client connected. Total: ${clients.size}`);

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[WS] Client disconnected. Total: ${clients.size}`);
  });
});

// Upgrade HTTP server to WebSocket
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

// Helper: Broadcast to all connected WebSockets
export function broadcast(message: object) {
  const payload = JSON.stringify(message);
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// ----------------------------------------------------
// 1. PRODUCTS & MENU CONFIGURATION
// ----------------------------------------------------
app.get('/api/products', async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      where: {
        status: { not: 'DELETED' }
      },
      include: {
        variants: {
          include: {
            recipeIngredients: true,
          }
        }
      }
    });
    res.json(products);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/modifiers', async (req, res) => {
  try {
    const modifierGroups = await prisma.modifierGroup.findMany({
      include: {
        modifiers: true
      }
    });
    res.json(modifierGroups);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/products', async (req, res) => {
  const { name, category, description, imageUrl, price, sku, status, bgColor, textColor } = req.body;
  try {
    const product = await prisma.product.create({
      data: {
        name,
        category,
        description,
        imageUrl,
        bgColor,
        textColor,
        status: status || 'ACTIVE',
        variants: {
          create: [{
            name: 'Standard',
            price: parseFloat(price) || 0.0,
            sku: sku || `SKU-${Date.now()}`
          }]
        }
      },
      include: {
        variants: true
      }
    });

    await prisma.localSyncOutbox.create({
      data: {
        entityName: 'Product',
        entityId: product.id,
        action: 'CREATE',
        payload: JSON.stringify(product),
        status: 'PENDING'
      }
    });

    broadcast({ type: 'CATALOG_UPDATED', product });
    res.json(product);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  const { name, category, description, imageUrl, price, sku, status, bgColor, textColor } = req.body;
  try {
    const existing = await prisma.product.findUnique({
      where: { id },
      include: { variants: true }
    });
    if (!existing) return res.status(404).json({ error: 'Product not found' });

    const variantId = existing.variants[0]?.id;

    const product = await prisma.product.update({
      where: { id },
      data: {
        name,
        category,
        description,
        imageUrl,
        bgColor,
        textColor,
        status: status || undefined,
        variants: variantId ? {
          update: {
            where: { id: variantId },
            data: {
              price: parseFloat(price) || 0.0,
              sku: sku || undefined
            }
          }
        } : undefined
      },
      include: {
        variants: true
      }
    });

    await prisma.localSyncOutbox.create({
      data: {
        entityName: 'Product',
        entityId: product.id,
        action: 'UPDATE',
        payload: JSON.stringify(product),
        status: 'PENDING'
      }
    });

    broadcast({ type: 'CATALOG_UPDATED', product });
    res.json(product);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  try {
    // Check if it is referenced in OrderItem
    const referenced = await prisma.orderItem.findFirst({
      where: { productVariant: { productId: id } }
    });

    if (referenced) {
      // Soft delete: update status to DELETED
      const product = await prisma.product.update({
        where: { id },
        data: { status: 'DELETED' },
        include: { variants: true }
      });

      await prisma.localSyncOutbox.create({
        data: {
          entityName: 'Product',
          entityId: product.id,
          action: 'UPDATE',
          payload: JSON.stringify(product),
          status: 'PENDING'
        }
      });

      broadcast({ type: 'CATALOG_UPDATED', product });
      return res.json({ success: true, message: 'Soft-deleted' });
    } else {
      // Hard delete
      const product = await prisma.product.delete({
        where: { id }
      });

      await prisma.localSyncOutbox.create({
        data: {
          entityName: 'Product',
          entityId: product.id,
          action: 'UPDATE',
          payload: JSON.stringify({ ...product, deletedAt: new Date() }),
          status: 'PENDING'
        }
      });

      broadcast({ type: 'CATALOG_UPDATED', product });
      return res.json({ success: true });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/modifiers/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.modifier.delete({
      where: { id }
    });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------
// 2. BUSINESS DAY LIFECYCLE
// ----------------------------------------------------
app.get('/api/business-day/active', async (req, res) => {
  try {
    const activeDay = await prisma.businessDay.findFirst({
      where: { closedAt: null },
      include: { shifts: { orderBy: { openedAt: 'asc' } } },
    });
    res.json(activeDay);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/business-day/open', async (req, res) => {
  try {
    const existing = await prisma.businessDay.findFirst({ where: { closedAt: null } });
    if (existing) {
      return res.status(400).json({ error: 'A business day is already open.' });
    }
    const day = await prisma.businessDay.create({ data: {} });
    res.json(day);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/business-day/close', async (req, res) => {
  const { businessDayId } = req.body;
  try {
    const day = await prisma.businessDay.findUnique({
      where: { id: businessDayId },
      include: { shifts: true },
    });
    if (!day) return res.status(404).json({ error: 'Business day not found.' });
    if (day.closedAt) return res.status(400).json({ error: 'Business day is already closed.' });

    // Block if any shift is still open
    const openShift = day.shifts.find(s => !s.closedAt);
    if (openShift) {
      return res.status(400).json({ error: 'Cannot close business day while a shift is still open.' });
    }

    // Block if unpaid orders exist
    const unpaidCount = await prisma.order.count({
      where: {
        shiftId: { in: day.shifts.map(s => s.id) },
        paymentStatus: 'PENDING',
      },
    });
    if (unpaidCount > 0) {
      return res.status(400).json({ error: `Cannot close business day. ${unpaidCount} unpaid order(s) pending.` });
    }

    const closed = await prisma.businessDay.update({
      where: { id: businessDayId },
      data: { closedAt: new Date() },
    });
    res.json(closed);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------
// 3. EMPLOYEES (from settings)
// ----------------------------------------------------
app.get('/api/employees', (req, res) => {
  try {
    const settings = loadSettings();
    // Return only name and role (never expose PIN over API)
    const safeList = (settings.employees || []).map(e => ({ name: e.name, role: e.role }));
    res.json(safeList);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Verify PIN and return employee info (used by login screen)
app.post('/api/employees/verify-pin', (req, res) => {
  try {
    const { pin } = req.body;
    const settings = loadSettings();
    const employee = (settings.employees || []).find(e => e.pin === pin);
    if (!employee) {
      return res.status(401).json({ error: 'Invalid PIN.' });
    }
    res.json({ name: employee.name, role: employee.role });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/employees', (req, res) => {
  try {
    const settings = loadSettings();
    res.json(settings.employees || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/settings/employees', (req, res) => {
  try {
    const { pin, name, role } = req.body;
    if (!pin || !name || !role) {
      return res.status(400).json({ error: 'Missing pin, name, or role.' });
    }
    const settings = loadSettings();
    if (!settings.employees) settings.employees = [];

    const idx = settings.employees.findIndex(e => e.pin === pin);
    if (idx > -1) {
      settings.employees[idx] = { pin, name, role };
    } else {
      settings.employees.push({ pin, name, role });
    }

    saveSettings(settings);
    res.json({ success: true, employees: settings.employees });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/settings/employees/:pin', (req, res) => {
  try {
    const { pin } = req.params;
    const settings = loadSettings();
    if (!settings.employees) settings.employees = [];

    settings.employees = settings.employees.filter(e => e.pin !== pin);
    saveSettings(settings);
    res.json({ success: true, employees: settings.employees });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------
// 3.5. STORE STAFF (NON-POS EMPLOYEES: Waiters, Baristas, Kitchen, etc.)
// ----------------------------------------------------
app.get('/api/settings/staff', (req, res) => {
  try {
    const settings = loadSettings();
    res.json(settings.staff || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/settings/staff', (req, res) => {
  try {
    const { code, name, fatherName, role, cnic, salary, status } = req.body;
    if (!code || !name || !role) {
      return res.status(400).json({ error: 'Missing employee code, name, or role.' });
    }
    const settings = loadSettings();
    if (!settings.staff) settings.staff = [];

    const idx = settings.staff.findIndex((s: any) => s.code === code);
    const staffMember = {
      code,
      name,
      fatherName: fatherName || '',
      role,
      cnic: cnic || '',
      salary: parseFloat(salary) || 0,
      status: status || 'ACTIVE'
    };

    if (idx > -1) {
      settings.staff[idx] = staffMember;
    } else {
      settings.staff.push(staffMember);
    }

    saveSettings(settings);
    res.json({ success: true, staff: settings.staff });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/settings/staff/:code', (req, res) => {
  try {
    const { code } = req.params;
    const settings = loadSettings();
    if (!settings.staff) settings.staff = [];

    settings.staff = settings.staff.filter((s: any) => s.code !== code);
    saveSettings(settings);
    res.json({ success: true, staff: settings.staff });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------
// 3.7. DELETION AUDIT LOGS (Punched Order Item Deletions)
// ----------------------------------------------------
const deletionsFilePath = path.join(
  isProd ? appDataFolder : process.cwd(),
  'deletions.json'
);

function loadDeletions() {
  try {
    if (fs.existsSync(deletionsFilePath)) {
      return JSON.parse(fs.readFileSync(deletionsFilePath, 'utf8')) || [];
    }
  } catch (err) {
    console.error(err);
  }
  return [];
}

function saveDeletions(logs: any[]) {
  try {
    fs.writeFileSync(deletionsFilePath, JSON.stringify(logs, null, 2), 'utf8');
  } catch (err) {
    console.error(err);
  }
}

app.get('/api/settings/deletions', (req, res) => {
  try {
    res.json(loadDeletions());
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/settings/deletions', (req, res) => {
  try {
    const { orderNumber, itemName, reason, authorizedBy, cashierName } = req.body;
    const logs = loadDeletions();
    const newLog = {
      id: `DEL-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      timestamp: new Date().toISOString(),
      orderNumber,
      itemName,
      reason,
      authorizedBy: authorizedBy || 'Admin',
      cashierName: cashierName || 'Staff'
    };
    logs.push(newLog);
    saveDeletions(logs);
    res.json(newLog);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/settings/categories', (req, res) => {
  try {
    const settings = loadSettings();
    res.json(settings.categories || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/settings/categories', (req, res) => {
  try {
    const { name, status, bgColor, textColor } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Missing category name.' });
    }
    const settings = loadSettings();
    if (!settings.categories) settings.categories = [];

    if (settings.categories.map(c => c.name.toLowerCase()).includes(name.toLowerCase())) {
      return res.status(400).json({ error: 'Category already exists.' });
    }

    settings.categories.push({ name, status: status || 'ACTIVE', bgColor, textColor });
    saveSettings(settings);
    res.json({ success: true, categories: settings.categories });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/settings/categories/:oldName', async (req, res) => {
  try {
    const { oldName } = req.params;
    const { name, status, bgColor, textColor } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Missing category name.' });
    }
    const settings = loadSettings();
    if (!settings.categories) settings.categories = [];

    const idx = settings.categories.findIndex(c => c.name.toLowerCase() === oldName.toLowerCase());
    if (idx === -1) {
      return res.status(404).json({ error: 'Category not found.' });
    }

    const exists = settings.categories.some((c, i) => i !== idx && c.name.toLowerCase() === name.toLowerCase());
    if (exists) {
      return res.status(400).json({ error: 'Category name already exists.' });
    }

    settings.categories[idx] = { name, status: status || 'ACTIVE', bgColor, textColor };
    saveSettings(settings);

    if (oldName.toLowerCase() !== name.toLowerCase()) {
      await prisma.product.updateMany({
        where: { category: oldName },
        data: { category: name }
      });
    }

    res.json({ success: true, categories: settings.categories });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/settings/categories/:name', (req, res) => {
  try {
    const { name } = req.params;
    const settings = loadSettings();
    if (!settings.categories) settings.categories = [];

    settings.categories = settings.categories.filter(c => c.name.toLowerCase() !== name.toLowerCase());
    saveSettings(settings);
    res.json({ success: true, categories: settings.categories });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/settings', (req, res) => {
  try {
    const settings = loadSettings();
    res.json({
      setupComplete: settings.setupComplete,
      businessName: settings.businessName,
      licenseKey: settings.licenseKey,
      taxEnabled: settings.taxEnabled,
      taxRate: settings.taxRate,
      isMaster: settings.isMaster,
      masterIp: settings.masterIp,
      branchId: settings.branchId,
      terminalId: settings.terminalId,
      cloudUrl: settings.cloudUrl,
      enterpriseTenantId: settings.enterpriseTenantId,
      printerMode: settings.printerMode,
      printerTarget: settings.printerTarget,
      printerType: settings.printerType,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/settings', (req, res) => {
  try {
    const { setupComplete, businessName, licenseKey, taxEnabled, taxRate, isMaster, masterIp, branchId, terminalId, cloudUrl, enterpriseTenantId, printerMode, printerTarget, printerType } = req.body;
    const settings = loadSettings();

    if (setupComplete !== undefined) settings.setupComplete = !!setupComplete;
    if (businessName !== undefined) settings.businessName = businessName;
    if (licenseKey !== undefined) settings.licenseKey = licenseKey;
    if (taxEnabled !== undefined) settings.taxEnabled = !!taxEnabled;
    if (taxRate !== undefined) settings.taxRate = parseFloat(taxRate) === 0 ? 0 : parseFloat(taxRate) || settings.taxRate;
    if (isMaster !== undefined) settings.isMaster = !!isMaster;
    if (masterIp !== undefined) settings.masterIp = masterIp;
    if (branchId !== undefined) settings.branchId = branchId;
    if (terminalId !== undefined) settings.terminalId = terminalId;
    if (cloudUrl !== undefined) settings.cloudUrl = cloudUrl;
    if (enterpriseTenantId !== undefined) settings.enterpriseTenantId = enterpriseTenantId;
    if (printerMode !== undefined) settings.printerMode = printerMode;
    if (printerTarget !== undefined) settings.printerTarget = printerTarget;
    if (printerType !== undefined) settings.printerType = printerType;

    saveSettings(settings);
    res.json({ success: true, settings });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------
// 4. SHIFT REGISTER AUDITS
// ----------------------------------------------------
app.get('/api/shifts/active', async (req, res) => {
  try {
    const activeShift = await prisma.employeeShift.findFirst({
      where: { closedAt: null },
    });
    res.json(activeShift);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/shifts/open', async (req, res) => {
  const { employeePin, openingBalance, businessDayId } = req.body;
  try {
    // Validate employee PIN
    const settings = loadSettings();
    const employee = (settings.employees || []).find(e => e.pin === employeePin);
    if (!employee) {
      return res.status(401).json({ error: 'Invalid PIN. Employee not found.' });
    }

    // Validate business day is open
    const businessDay = await prisma.businessDay.findUnique({ where: { id: businessDayId } });
    if (!businessDay || businessDay.closedAt) {
      return res.status(400).json({ error: 'No active business day. Please start the business day first.' });
    }

    // Check no shift is already open
    const activeShift = await prisma.employeeShift.findFirst({ where: { closedAt: null } });
    if (activeShift) {
      return res.status(400).json({ error: 'There is already an open shift. Please close it first.' });
    }

    const newShift = await prisma.$transaction(async (tx) => {
      const shift = await tx.employeeShift.create({
        data: {
          employeePin,
          employeeName: employee.name,
          openingBalance: parseFloat(openingBalance) || 0,
          cardSales: 0,
          cashSales: 0,
          businessDayId,
        }
      });
      await tx.localSyncOutbox.create({
        data: {
          entityName: 'EmployeeShift',
          entityId: shift.id,
          action: 'CREATE',
          payload: JSON.stringify(shift),
          status: 'PENDING',
        }
      });
      return shift;
    });

    res.json(newShift);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/shifts/close', async (req, res) => {
  const { shiftId, actualCash } = req.body;
  try {
    const shift = await prisma.employeeShift.findUnique({
      where: { id: shiftId },
    });
    if (!shift) {
      return res.status(404).json({ error: 'Shift not found.' });
    }

    const expectedCash = shift.openingBalance + shift.cashSales;
    const closingBalance = expectedCash;

    const closedShift = await prisma.$transaction(async (tx) => {
      const updated = await tx.employeeShift.update({
        where: { id: shiftId },
        data: {
          closedAt: new Date(),
          closingBalance,
          actualCash: parseFloat(actualCash),
          expectedCash,
        }
      });
      await tx.localSyncOutbox.create({
        data: {
          entityName: 'EmployeeShift',
          entityId: updated.id,
          action: 'UPDATE',
          payload: JSON.stringify(updated),
          status: 'PENDING',
        }
      });
      return updated;
    });

    res.json(closedShift);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------
// 3. ORDER TAKING & ATOMIC INVENTORY DEDUCTION
// ----------------------------------------------------
app.post('/api/orders', async (req, res) => {
  const {
    branchId,
    terminalId,
    paymentMethod,
    paymentStatus,
    subtotal,
    tax,
    total,
    employeeId,
    shiftId,
    items, // Array of: { productVariantId, quantity, unitPrice, modifiers: [modifierId] }
    memberId,
    tableNumber,
    waiterInfo,
    orderType,
    customerName,
    customerPhone,
    deliveryAddress,
    deliveryPlatform,
    isPrinted
  } = req.body;

  console.log('POST /api/orders body:', JSON.stringify(req.body, null, 2));

  try {
    // 1. Verify shift is open
    const shift = await prisma.employeeShift.findUnique({ where: { id: shiftId } });
    if (!shift || shift.closedAt) {
      return res.status(400).json({ error: 'Shift is closed or invalid.' });
    }

    // 2. Pre-fetch inventory deductions list (outside transaction for performance)
    const deductions: { id: string; ingredientName: string; amount: number; minThreshold: number }[] = [];
    const lowStockAlerts: string[] = [];

    for (const item of items) {
      // Get Recipe for Product Variant
      const variantIngredients = await prisma.recipeIngredient.findMany({
        where: { productVariantId: item.productVariantId },
        include: { inventoryStock: true }
      });
      for (const ring of variantIngredients) {
        deductions.push({
          id: ring.inventoryStock.id,
          ingredientName: ring.inventoryStock.ingredientName,
          amount: ring.amountRequired * item.quantity,
          minThreshold: ring.inventoryStock.minThreshold
        });
      }

      // Get Recipes for Modifiers
      for (const modId of item.modifiers || []) {
        const modIngredients = await prisma.recipeIngredient.findMany({
          where: { modifierId: modId },
          include: { inventoryStock: true }
        });
        for (const ring of modIngredients) {
          deductions.push({
            id: ring.inventoryStock.id,
            ingredientName: ring.inventoryStock.ingredientName,
            amount: ring.amountRequired * item.quantity,
            minThreshold: ring.inventoryStock.minThreshold
          });
        }
      }
    }

    // 3. Helper: atomically generate the next order number INSIDE a transaction
    //    Uses MAX sequence lookup (not count) so gaps never cause duplicate collisions.
    const generateOrderNumber = async (tx: any): Promise<string> => {
      // Find the most recently created order
      const lastOrder = await tx.order.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { orderNumber: true }
      });

      let nextSeq = 1;
      if (lastOrder && lastOrder.orderNumber) {
        // Extract the last number from the previous order (handles both old prefix formats and new plain numbers)
        const parts = lastOrder.orderNumber.split('-');
        const lastSeqStr = parts[parts.length - 1];
        const lastSeq = parseInt(lastSeqStr, 10);
        if (!isNaN(lastSeq)) {
          nextSeq = lastSeq + 1;
        }
      }

      // Return just the plain sequence number without any prefix or zero padding
      return String(nextSeq);
    };

    // 4. Run database transaction with retry loop.
    //    If two simultaneous orders race and both pick the same sequence number,
    //    Prisma throws P2002 (unique constraint). We catch it and retry up to 5 times.
    let result: any;
    let attempts = 0;
    const MAX_RETRIES = 5;

    while (attempts < MAX_RETRIES) {
      attempts++;
      try {
        result = await prisma.$transaction(async (tx) => {
          // Generate order number atomically inside the transaction
          const orderNumber = await generateOrderNumber(tx);

          // Create Order
          const newOrder = await tx.order.create({
            data: {
              orderNumber,
              status: 'PENDING',
              paymentStatus: paymentStatus || 'PAID',
              paymentMethod,
              subtotal: parseFloat(subtotal),
              tax: parseFloat(tax),
              total: parseFloat(total),
              employeeId,
              shiftId,
              memberId,
              tableNumber,
              waiterInfo,
              orderType,
              customerName,
              customerPhone,
              deliveryAddress,
              deliveryPlatform,
              isPrinted: isPrinted || false,
              items: {
                create: items.map((item: any) => ({
                  productVariantId: item.productVariantId,
                  quantity: item.quantity,
                  unitPrice: parseFloat(item.unitPrice),
                  totalPrice: parseFloat(item.unitPrice) * item.quantity,
                  modifiers: {
                    create: (item.modifiers || []).map((modId: string) => ({
                      modifierId: modId,
                      price: 0.00
                    }))
                  }
                }))
              }
            },
            include: {
              items: {
                include: {
                  productVariant: { include: { product: true } },
                  modifiers: { include: { modifier: true } }
                }
              }
            }
          });

          // Update Shift Cash/Card totals only if payment is collected
          const resolvedPaymentStatus = paymentStatus || 'PAID';
          if (resolvedPaymentStatus === 'PAID') {
            const numTotal = parseFloat(total);
            const updatedShift = await tx.employeeShift.update({
              where: { id: shiftId },
              data: paymentMethod === 'CASH'
                ? { cashSales: { increment: numTotal } }
                : { cardSales: { increment: numTotal } }
            });
            await tx.localSyncOutbox.create({
              data: {
                entityName: 'EmployeeShift',
                entityId: updatedShift.id,
                action: 'UPDATE',
                payload: JSON.stringify(updatedShift),
                status: 'PENDING',
              }
            });
          }

          // Deduct inventory items atomically
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
                status: 'PENDING',
              }
            });
          }

          // Write Order to sync outbox
          await tx.localSyncOutbox.create({
            data: {
              entityName: 'Order',
              entityId: newOrder.id,
              action: 'CREATE',
              payload: JSON.stringify(newOrder),
              status: 'PENDING',
            }
          });

          return newOrder;
        });

        // Transaction succeeded — exit retry loop
        break;

      } catch (txErr: any) {
        // P2002 = unique constraint violation on orderNumber (race condition)
        // Retry automatically with the next sequence number
        if (txErr.code === 'P2002' && attempts < MAX_RETRIES) {
          console.warn(`[Order] orderNumber collision detected, retrying (attempt ${attempts}/${MAX_RETRIES})...`);
          continue;
        }
        // Any other error, or retries exhausted → re-throw
        throw txErr;
      }
    }

    // 5. Broadcast Real-time Events
    broadcast({ type: 'NEW_ORDER', order: result });
    if (lowStockAlerts.length > 0) {
      broadcast({ type: 'LOW_STOCK_WARNING', ingredients: lowStockAlerts });
    }

    res.json(result);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------
// 4. KDS ENGINE & ORDER PROCESSING
// ----------------------------------------------------
app.get('/api/orders', async (req, res) => {
  try {
    const activeOrders = await prisma.order.findMany({
      where: {
        status: { in: ['PENDING', 'PREPARING', 'READY'] }
      },
      include: {
        items: {
          include: {
            productVariant: { include: { product: true } },
            modifiers: { include: { modifier: true } }
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    });
    res.json(activeOrders);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/orders/unpaid', async (req, res) => {
  try {
    const unpaidOrders = await prisma.order.findMany({
      where: {
        paymentStatus: 'PENDING'
      },
      include: {
        items: {
          include: {
            productVariant: { include: { product: true } },
            modifiers: { include: { modifier: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(unpaidOrders);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/orders/paid', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    console.log('[API] /api/orders/paid query params:', { startDate, endDate });

    const activeDay = await prisma.businessDay.findFirst({
      where: { closedAt: null },
      include: { shifts: { select: { id: true } } }
    });

    let whereClause: any = { paymentStatus: 'PAID' };

    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) {
        whereClause.createdAt.gte = new Date(`${startDate}T00:00:00`);
      }
      if (endDate) {
        whereClause.createdAt.lte = new Date(`${endDate}T23:59:59.999`);
      }
    } else if (activeDay) {
      const shiftIds = activeDay.shifts.map(s => s.id);
      whereClause.shiftId = { in: shiftIds };
    } else {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      whereClause.createdAt = { gte: startOfToday };
    }

    const paidOrders = await prisma.order.findMany({
      where: whereClause,
      include: {
        items: {
          include: {
            productVariant: { include: { product: true } },
            modifiers: { include: { modifier: true } }
          }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });
    res.json(paidOrders);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/orders/:id', async (req, res) => {
  const { id } = req.params;
  const {
    status,
    items,
    subtotal,
    tax,
    total,
    tableNumber,
    waiterInfo,
    orderType,
    customerName,
    customerPhone,
    deliveryAddress,
    deliveryPlatform,
    paymentStatus,
    paymentMethod,
    isPrinted
  } = req.body;
  try {
    const updatedOrder = await prisma.$transaction(async (tx) => {
      // Get current order state to check paymentStatus transition
      const existingOrder = await tx.order.findUnique({
        where: { id },
        select: { paymentStatus: true, shiftId: true, total: true, paymentMethod: true }
      });
      if (!existingOrder) {
        throw new Error('Order not found');
      }

      // Check for PENDING -> PAID transition
      if (existingOrder.paymentStatus === 'PENDING' && paymentStatus === 'PAID') {
        const finalTotal = total !== undefined && total !== null ? parseFloat(total) : existingOrder.total;
        
        let shiftUpdateData = {};
        if (paymentMethod === 'CASH') {
          shiftUpdateData = { cashSales: { increment: finalTotal } };
        } else if (paymentMethod === 'VOID') {
          // Do not increment any sales for voided bills
        } else {
          shiftUpdateData = { cardSales: { increment: finalTotal } };
        }

        if (Object.keys(shiftUpdateData).length > 0) {
          const updatedShift = await tx.employeeShift.update({
            where: { id: existingOrder.shiftId },
            data: shiftUpdateData
          });
          await tx.localSyncOutbox.create({
            data: {
              entityName: 'EmployeeShift',
              entityId: updatedShift.id,
              action: 'UPDATE',
              payload: JSON.stringify(updatedShift),
              status: 'PENDING',
            }
          });
        }
      }

      // Check for PAID -> PENDING transition (reopening a paid order)
      if (existingOrder.paymentStatus === 'PAID' && paymentStatus === 'PENDING') {
        const finalTotal = existingOrder.total;
        const updatedShift = await tx.employeeShift.update({
          where: { id: existingOrder.shiftId },
          data: existingOrder.paymentMethod === 'CASH'
            ? { cashSales: { decrement: finalTotal } }
            : { cardSales: { decrement: finalTotal } }
        });
        await tx.localSyncOutbox.create({
          data: {
            entityName: 'EmployeeShift',
            entityId: updatedShift.id,
            action: 'UPDATE',
            payload: JSON.stringify(updatedShift),
            status: 'PENDING',
          }
        });
      }

      // 1. If items are provided, replace them
      if (items) {
        // Delete old items
        await tx.orderItem.deleteMany({ where: { orderId: id } });

        // Re-create new items with modifiers
        for (const item of items) {
          await tx.orderItem.create({
            data: {
              orderId: id,
              productVariantId: item.productVariantId,
              quantity: item.quantity,
              unitPrice: parseFloat(item.unitPrice),
              totalPrice: parseFloat(item.unitPrice) * item.quantity,
              modifiers: {
                create: (item.modifiers || []).map((modId: string) => ({
                  modifierId: modId,
                  price: 0.00
                }))
              }
            }
          });
        }
      }

      const order = await tx.order.update({
        where: { id },
        data: {
          status,
          paymentStatus,
          paymentMethod,
          subtotal: subtotal !== undefined && subtotal !== null ? parseFloat(subtotal) : undefined,
          tax: tax !== undefined && tax !== null ? parseFloat(tax) : undefined,
          total: total !== undefined && total !== null ? parseFloat(total) : undefined,
          tableNumber,
          waiterInfo,
          orderType,
          customerName,
          customerPhone,
          deliveryAddress,
          deliveryPlatform,
          isPrinted: typeof isPrinted === 'boolean' ? isPrinted : undefined,
        },
        include: {
          items: {
            include: {
              productVariant: { include: { product: true } },
              modifiers: { include: { modifier: true } }
            }
          }
        }
      });

      await tx.localSyncOutbox.create({
        data: {
          entityName: 'Order',
          entityId: order.id,
          action: 'UPDATE',
          payload: JSON.stringify(order),
          status: 'PENDING',
        }
      });
      return order;
    });

    // Broadcast update
    broadcast({ type: 'ORDER_UPDATED', order: updatedOrder });

    res.json(updatedOrder);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------
// 5. INVENTORY ENQUIRIES
// ----------------------------------------------------
app.get('/api/inventory', async (req, res) => {
  try {
    const stock = await prisma.inventoryStock.findMany();
    res.json(stock);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------
// 6. SYNC SYSTEM STATUS
// ----------------------------------------------------
app.get('/api/sync/status', async (req, res) => {
  try {
    const pendingCount = await prisma.localSyncOutbox.count({
      where: { status: 'PENDING' }
    });
    res.json({ pendingCount });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------
// 7. LOYALTY SYSTEM BRIDGING (OFFLINE-FIRST)
// ----------------------------------------------------
async function checkCloudOnline(cloudUrl: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const response = await fetch(`${cloudUrl}/api/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response.ok;
  } catch (err) {
    return false;
  }
}

app.get('/api/loyalty/:memberId', async (req, res) => {
  const { memberId } = req.params;
  const settings = loadSettings();

  try {
    const isOnline = await checkCloudOnline(settings.cloudUrl);
    if (isOnline) {
      console.log(`[Local Server] Cloud is online. Querying loyalty points for member ${memberId}...`);
      const response = await fetch(`${settings.cloudUrl}/api/loyalty/${memberId}`);
      if (response.ok) {
        const data = await response.json();

        const snapshot = await prisma.loyaltySnapshot.upsert({
          where: { memberId },
          create: {
            memberId,
            memberName: data.memberName,
            points: data.points,
          },
          update: {
            memberName: data.memberName,
            points: data.points,
          }
        });

        return res.json({
          memberId,
          memberName: snapshot.memberName,
          points: snapshot.points,
          isOnline: true
        });
      } else {
        const errText = await response.text();
        return res.status(response.status).json({ error: `Cloud error: ${errText}` });
      }
    } else {
      console.log(`[Local Server] Cloud is offline. Reading loyalty points for member ${memberId} from local snapshot cache...`);
      const cached = await prisma.loyaltySnapshot.findUnique({
        where: { memberId }
      });
      if (cached) {
        return res.json({
          memberId,
          memberName: cached.memberName,
          points: cached.points,
          isOnline: false
        });
      } else {
        return res.status(404).json({ error: 'Member not cached locally. Connect online to lookup.' });
      }
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/loyalty/redeem', async (req, res) => {
  const { memberId, pointsToRedeem } = req.body;
  const settings = loadSettings();

  try {
    const isOnline = await checkCloudOnline(settings.cloudUrl);
    if (!isOnline) {
      return res.status(400).json({ error: 'Loyalty redemption is unavailable while offline.' });
    }

    console.log(`[Local Server] Cloud is online. Executing loyalty redemption of ${pointsToRedeem} points for member ${memberId}...`);
    const response = await fetch(`${settings.cloudUrl}/api/loyalty/redeem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId, pointsToRedeem })
    });

    if (response.ok) {
      const data = await response.json();

      await prisma.loyaltySnapshot.update({
        where: { memberId },
        data: { points: data.remainingPoints }
      });

      return res.json({ success: true, remainingPoints: data.remainingPoints });
    } else {
      const errText = await response.text();
      return res.status(response.status).json({ error: `Cloud redemption rejected: ${errText}` });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------
// 8. REPORTING ENDPOINTS
// ----------------------------------------------------

// Daily Sale Report: aggregates all orders in a given business day
app.get('/api/reports/daily', async (req, res) => {
  const { businessDayId } = req.query as { businessDayId?: string };
  try {
    let shiftIds: string[] = [];

    if (businessDayId) {
      const day = await prisma.businessDay.findUnique({
        where: { id: businessDayId },
        include: { shifts: { select: { id: true } } },
      });
      if (!day) return res.status(404).json({ error: 'Business day not found.' });
      shiftIds = day.shifts.map(s => s.id);
    } else {
      // Default: active business day
      const activeDay = await prisma.businessDay.findFirst({
        where: { closedAt: null },
        include: { shifts: { select: { id: true } } },
      });
      if (!activeDay) return res.json({ orders: [], totals: {} });
      shiftIds = activeDay.shifts.map(s => s.id);
    }

    const orders = await prisma.order.findMany({
      where: {
        shiftId: { in: shiftIds },
        paymentStatus: 'PAID',
      },
      include: {
        items: { include: { productVariant: { include: { product: true } } } }
      },
    });

    // Aggregate totals
    let totalSale = 0, cashSale = 0, cardSale = 0;
    let dineInSale = 0, takeAwaySale = 0, deliverySale = 0;
    let totalTax = 0, totalDiscount = 0;
    const deliveryByPlatform: Record<string, number> = {};
    let orderCount = 0;

    for (const order of orders) {
      const t = Number(order.total);
      const tax = Number(order.tax);
      const sub = Number(order.subtotal);
      totalSale += t;
      totalTax += tax;
      // discount = what was charged before tax vs actual subtotal
      orderCount++;

      if (order.paymentMethod === 'CASH') cashSale += t;
      else if (order.paymentMethod === 'CARD') cardSale += t;

      if (order.orderType === 'DINE_IN') dineInSale += t;
      else if (order.orderType === 'TAKE_AWAY') takeAwaySale += t;
      else if (order.orderType === 'DELIVERY') {
        deliverySale += t;
        const platform = order.deliveryPlatform || 'OTHER';
        deliveryByPlatform[platform] = (deliveryByPlatform[platform] || 0) + t;
      }
    }

    res.json({
      orderCount,
      totalSale,
      cashSale,
      cardSale,
      dineInSale,
      takeAwaySale,
      deliverySale,
      deliveryByPlatform,
      totalTax,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Item-wise Report: qty and revenue per product, grouped by category
app.get('/api/reports/items', async (req, res) => {
  const { businessDayId } = req.query as { businessDayId?: string };
  try {
    let shiftIds: string[] = [];

    if (businessDayId) {
      const day = await prisma.businessDay.findUnique({
        where: { id: businessDayId },
        include: { shifts: { select: { id: true } } },
      });
      if (!day) return res.status(404).json({ error: 'Business day not found.' });
      shiftIds = day.shifts.map(s => s.id);
    } else {
      const activeDay = await prisma.businessDay.findFirst({
        where: { closedAt: null },
        include: { shifts: { select: { id: true } } },
      });
      if (!activeDay) return res.json([]);
      shiftIds = activeDay.shifts.map(s => s.id);
    }

    const orderItems = await prisma.orderItem.findMany({
      where: {
        order: {
          shiftId: { in: shiftIds },
          paymentStatus: 'PAID',
        },
      },
      include: {
        productVariant: { include: { product: true } },
      },
    });

    // Group by category → product → variant
    const categoryMap: Record<string, Record<string, { qty: number; revenue: number }>> = {};

    for (const item of orderItems) {
      const cat = item.productVariant.product.category || 'Uncategorized';
      const itemName = `${item.productVariant.product.name} (${item.productVariant.name})`;
      if (!categoryMap[cat]) categoryMap[cat] = {};
      if (!categoryMap[cat][itemName]) categoryMap[cat][itemName] = { qty: 0, revenue: 0 };
      categoryMap[cat][itemName].qty += item.quantity;
      categoryMap[cat][itemName].revenue += Number(item.totalPrice);
    }

    const result = Object.entries(categoryMap).map(([category, items]) => ({
      category,
      items: Object.entries(items).map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.revenue - a.revenue),
      totalQty: Object.values(items).reduce((s, i) => s + i.qty, 0),
      totalRevenue: Object.values(items).reduce((s, i) => s + i.revenue, 0),
    })).sort((a, b) => b.totalRevenue - a.totalRevenue);

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Shift-wise Report: per-shift breakdown within a business day
app.get('/api/reports/shifts', async (req, res) => {
  const { businessDayId } = req.query as { businessDayId?: string };
  try {
    let dayId = businessDayId;

    if (!dayId) {
      const activeDay = await prisma.businessDay.findFirst({ where: { closedAt: null } });
      if (!activeDay) return res.json([]);
      dayId = activeDay.id;
    }

    const shifts = await prisma.employeeShift.findMany({
      where: { businessDayId: dayId },
      orderBy: { openedAt: 'asc' },
    });

    const result = shifts.map(s => ({
      id: s.id,
      employeeName: s.employeeName,
      employeePin: s.employeePin,
      openedAt: s.openedAt,
      closedAt: s.closedAt,
      openingBalance: s.openingBalance,
      closingBalance: s.closingBalance,
      actualCash: s.actualCash,
      expectedCash: s.expectedCash,
      cashSales: s.cashSales,
      cardSales: s.cardSales,
      totalSales: s.cashSales + s.cardSales,
      variance: s.actualCash != null && s.expectedCash != null
        ? s.actualCash - s.expectedCash
        : null,
    }));

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------
// 9. EXPENSE SYSTEM (stored in expenses.json)
// ----------------------------------------------------

const expensesFilePath = path.join(
  isProd ? appDataFolder : process.cwd(),
  'expenses.json'
);

interface Expense {
  id: string;
  date: string;
  category: string;
  amount: number;
  description: string;
}

function loadExpenses(): Expense[] {
  try {
    if (fs.existsSync(expensesFilePath)) {
      const content = fs.readFileSync(expensesFilePath, 'utf8');
      return JSON.parse(content) || [];
    }
  } catch (err) {
    console.error('Error reading expenses file:', err);
  }
  return [];
}

function saveExpenses(expenses: Expense[]) {
  try {
    if (!fs.existsSync(path.dirname(expensesFilePath))) {
      fs.mkdirSync(path.dirname(expensesFilePath), { recursive: true });
    }
    fs.writeFileSync(expensesFilePath, JSON.stringify(expenses, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving expenses file:', err);
  }
}

app.get('/api/expenses', (req, res) => {
  try {
    const list = loadExpenses();
    res.json(list);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/expenses', (req, res) => {
  try {
    const { category, amount, description, date } = req.body;
    if (!category || amount === undefined) {
      return res.status(400).json({ error: 'Category and amount are required.' });
    }
    const expenses = loadExpenses();
    const newExpense: Expense = {
      id: `EXP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      date: date || new Date().toISOString().split('T')[0],
      category,
      amount: parseFloat(amount) || 0,
      description: description || ''
    };
    expenses.push(newExpense);
    saveExpenses(expenses);
    res.json(newExpense);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/expenses/:id', (req, res) => {
  try {
    const { id } = req.params;
    let expenses = loadExpenses();
    expenses = expenses.filter(e => e.id !== id);
    saveExpenses(expenses);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Boot listening server
const PORT = 4000;
export function startLocalServer() {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[LAN Master Server] Listening on http://0.0.0.0:${PORT}`);
  });
}

export function stopLocalServer() {
  server.close();
}
