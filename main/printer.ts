import net from 'net';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { app, nativeImage } from 'electron';
import { logPrint } from './logger';
import { loadSettings } from './settings';

/**
 * 🛠️ VIRTUAL PRINTER SANDBOX MODE TOGGLE
 * Set to true to simulate printing in your local console window.
 * Set to false when compiling the final installer EXE for the client system.
 */
export type PrintRuntime = 'simulation' | 'hardware';

function resolvePrintRuntime(): PrintRuntime {
  const configuredRuntime = process.env.POS_PRINT_RUNTIME?.toLowerCase();
  if (configuredRuntime === 'hardware' || configuredRuntime === 'simulation') {
    return configuredRuntime;
  }
  return app?.isPackaged ? 'hardware' : 'simulation';
}

export function getPrintRuntime(): PrintRuntime {
  return resolvePrintRuntime();
}

// ESC/POS Native Hardware Control Commands
const ESC = '\x1B';
const GS = '\x1D';

const CMD = {
  INIT: ESC + '@',
  ALIGN_LEFT: ESC + 'a' + '\x00',
  ALIGN_CENTER: ESC + 'a' + '\x01',
  ALIGN_RIGHT: ESC + 'a' + '\x02',
  FONT_BIG: GS + '!' + '\x11', // Double width + double height
  FONT_NORMAL: GS + '!' + '\x00',
  DRAWER_KICK: ESC + 'p' + '\x00' + '\x19' + '\x96', // Pin 2 Pulse Latch Kick
  CUT: GS + 'V' + '\x00', // Complete paper cut
};

export interface ReceiptItem {
  name: string;
  qty: number;
  price: number;
}

export interface ReceiptData {
  orderNumber: string;
  dateTime: Date;
  employeeName: string;
  items: ReceiptItem[];
  subtotal: number;
  tax: number;
  total: number;
  paymentMethod: string;
  discountAmount?: number;
  discountName?: string;
  taxRate?: number;
  paperWidth?: 32 | 42; // 32 characters for 58mm paper, 42 characters for 80mm paper
  orderType?: string;
  tableNumber?: string;
  waiterInfo?: string;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  deliveryPlatform?: string;
  shift?: string;
  cashReceived?: number;
  changeGiven?: number;
}

/**
 * Captures raw binary bytes and translates invisible control strings into readable text tags
 */
function verifyAndLogVirtualReceipt(rawBytes: Buffer): void {
  const hexString = rawBytes.toString('binary');

  const visibleLog = hexString
    .replace(/\x1B@/g, '\n[SYSTEM: PRINTER INITIALIZED]\n')
    .replace(/\x1Bp\x00\x19\x96/g, '[HARDWARE: >>> CASH DRAWER PULSE KICKED <<<]\n')
    .replace(/\x1Ba\x00/g, '[ALIGN: LEFT]')
    .replace(/\x1Ba\x01/g, '[ALIGN: CENTER]')
    .replace(/\x1Ba\x02/g, '[ALIGN: RIGHT]')
    .replace(/\x1D!\x11/g, '[FONT: DOUBLE SIZE]')
    .replace(/\x1D!\x00/g, '[FONT: NORMAL SIZE]')
    .replace(/\x1DV\x00/g, '\n[HARDWARE: >>> PAPER COMPLETELY CUT <<<]\n');

  console.log("\n============== CHIMNEY CORNER RECEIPT TRACE ==============");
  console.log(visibleLog);
  console.log("==========================================================\n");
}

function formatDate(dateInput: Date | string | number): string {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => n.toString().padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  let hours = d.getHours();
  const minutes = pad(d.getMinutes());
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'
  const hoursStr = pad(hours);
  return `${year}-${month}-${day} ${hoursStr}:${minutes} ${ampm}`;
}

function formatDateWithSeconds(dateInput: Date | string | number): string {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => n.toString().padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  let hours = d.getHours();
  const minutes = pad(d.getMinutes());
  const seconds = pad(d.getSeconds());
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const hoursStr = pad(hours);
  return `${year}-${month}-${day} ${hoursStr}:${minutes}:${seconds} ${ampm}`;
}

function formatItemRow(name: string, price: string, qty: string, total: string, width: number): string {
  const rightPart = `${price.padStart(8)} ${qty.padStart(5)} ${total.padStart(9)}`;
  const maxNameLen = width - rightPart.length - 1; // 1 space boundary
  let cleanName = name;
  if (cleanName.length > maxNameLen) {
    cleanName = cleanName.substring(0, maxNameLen - 3) + "...";
  }
  const padding = " ".repeat(Math.max(0, width - rightPart.length - cleanName.length));
  return `${cleanName}${padding}${rightPart}\n`;
}

export function convertBase64ToEscPosRaster(logoBase64: string, maxWidth: number = 384): Buffer | null {
  try {
    if (!logoBase64) return null;
    
    // Load the image using Electron's nativeImage
    let img = nativeImage.createFromDataURL(logoBase64);
    if (img.isEmpty()) return null;
    
    const size = img.getSize();
    if (size.width === 0 || size.height === 0) return null;
    
    // Resize image to fit thermal printer width (multiple of 8 for alignment)
    const targetWidth = Math.floor(maxWidth / 8) * 8;
    const targetHeight = Math.round((size.height / size.width) * targetWidth);
    
    img = img.resize({ width: targetWidth, height: targetHeight, quality: 'better' });
    
    const rawRgba = img.toBitmap(); // RGBA bytes
    const widthInBytes = targetWidth / 8;
    
    // ESC/POS header: GS v 0 m xL xH yL yH
    const header = Buffer.from([
      0x1D, 0x76, 0x30, 0x00,
      targetWidth & 0xFF, (targetWidth >> 8) & 0xFF,
      targetHeight & 0xFF, (targetHeight >> 8) & 0xFF
    ]);
    
    const imgData = Buffer.alloc(widthInBytes * targetHeight);
    
    for (let y = 0; y < targetHeight; y++) {
      for (let x = 0; x < targetWidth; x++) {
        const offset = (y * targetWidth + x) * 4;
        const r = rawRgba[offset];
        const g = rawRgba[offset + 1];
        const b = rawRgba[offset + 2];
        const a = rawRgba[offset + 3];
        
        let isBlack = false;
        if (a > 50) { // Alpha threshold
          const gray = 0.299 * r + 0.587 * g + 0.114 * b;
          if (gray < 160) { // Darker pixels are black
            isBlack = true;
          }
        }
        
        if (isBlack) {
          const byteIndex = y * widthInBytes + Math.floor(x / 8);
          const bitIndex = 7 - (x % 8);
          imgData[byteIndex] |= (1 << bitIndex);
        }
      }
    }
    
    return Buffer.concat([header, imgData]);
  } catch (err) {
    console.error('[ESC/POS Logo Decoder] Error:', err);
    return null;
  }
}

export function formatReceiptBuffer(data: ReceiptData, logoBase64?: string): Buffer {
  const width = data.paperWidth || 42;
  const lineDivider = "==========".repeat(Math.floor(width / 10)) + "=".repeat(width % 10) + "\n";
  const subDivider = "----------".repeat(Math.floor(width / 10)) + "-".repeat(width % 10) + "\n";

  const buffers: Buffer[] = [];

  // 1. Initialize Printer State
  buffers.push(Buffer.from(CMD.INIT, 'binary'));

  // 2. Pop Cash Drawer Immediately on Cash Transactions
  if (data.paymentMethod === 'CASH') {
    buffers.push(Buffer.from(CMD.DRAWER_KICK, 'binary'));
  }

  // 3. Print Logo if present
  let logoPrinted = false;
  if (logoBase64) {
    // 384 pixels fits nicely in standard thermal printer
    const logoBuffer = convertBase64ToEscPosRaster(logoBase64, 384);
    if (logoBuffer) {
      buffers.push(Buffer.from(CMD.ALIGN_CENTER, 'binary'));
      buffers.push(logoBuffer);
      buffers.push(Buffer.from('\n\n', 'binary'));
      logoPrinted = true;
    }
  }

  // Header Block (Logo & Contact Info)
  let headerText = '';
  headerText += CMD.ALIGN_CENTER;
  if (logoPrinted) {
    headerText += "CHIMNEY CORNER\n";
  } else {
    headerText += CMD.FONT_BIG + "CHIMNEY CORNER\n" + CMD.FONT_NORMAL;
  }
  headerText += "+92300 4792829\n";
  headerText += "Gulberg 3 Lahore\n";
  headerText += "Your Bill No Is\n";
  headerText += CMD.FONT_BIG + `${data.orderNumber}\n` + CMD.FONT_NORMAL;
  headerText += lineDivider;

  // Cashier, Shift, Date, Terminal Section
  headerText += CMD.ALIGN_LEFT;
  headerText += `Cashier: ${data.employeeName || 'Staff'}`;
  headerText += `  MOP: ${data.paymentMethod || 'CASH'}\n`;
  headerText += `Date: ${formatDate(data.dateTime)}`;
  headerText += `  Order Type: ${data.orderType || 'Take Away'}\n`;
  if (data.waiterInfo) {
    headerText += `Waiter: ${data.waiterInfo}`;
    if (data.tableNumber) {
      headerText += `  Table: ${data.tableNumber}`;
    }
    headerText += `\n`;
  } else if (data.tableNumber) {
    headerText += `Table: ${data.tableNumber}\n`;
  }
  headerText += `Terminal: ${os.hostname()}\n`;
  headerText += `Customer Id: ${data.customerName || 'N/A'}\n`;
  headerText += lineDivider;

  // Items Column Grid Header
  headerText += CMD.ALIGN_CENTER;
  headerText += "Pre Sale Bill\n";
  headerText += CMD.ALIGN_LEFT;
  headerText += formatItemRow('Name', 'Price', 'Qty', 'Total', width);
  headerText += subDivider;

  // Items Loop
  let totalQty = 0;
  for (const item of data.items) {
    totalQty += item.qty;
    const priceStr = item.price.toFixed(0);
    const qtyStr = item.qty.toString();
    const totalStr = (item.price * item.qty).toFixed(0);
    headerText += formatItemRow(item.name, priceStr, qtyStr, totalStr, width);
  }

  headerText += subDivider;

  // Total Items Count row
  const totalQtyStr = totalQty.toString();
  const rightPartQty = ` ${totalQtyStr.padStart(5)}         `;
  const leftPartQty = "Total Items";
  const paddingQty = " ".repeat(Math.max(0, width - rightPartQty.length - leftPartQty.length));
  headerText += `${leftPartQty}${paddingQty}${rightPartQty}\n`;
  headerText += lineDivider;

  // Financial Compilations Block
  headerText += CMD.ALIGN_RIGHT;
  headerText += `Sub Total: ${data.subtotal.toFixed(0)}\n`;

  if (data.discountAmount && data.discountAmount > 0) {
    headerText += `Discount (${data.discountName || 'Promo'}): -${data.discountAmount.toFixed(0)}\n`;
  }

  if (data.tax && data.tax > 0) {
    const taxRatePercent = data.taxRate !== undefined
      ? data.taxRate
      : Math.round((data.tax / data.subtotal) * 100);
    headerText += `Tax (${taxRatePercent}%): ${data.tax.toFixed(0)}\n`;
  }

  // Net Total Box
  headerText += CMD.ALIGN_CENTER;
  headerText += lineDivider;
  const netTotalStr = `Net Total: ${data.total.toFixed(0)}`;
  const paddingLength = Math.max(0, Math.floor((width - 4 - netTotalStr.length) / 2));
  const boxPadding = " ".repeat(paddingLength);
  const remainingPadding = " ".repeat(Math.max(0, width - 4 - netTotalStr.length - paddingLength));
  headerText += `|${boxPadding}${netTotalStr}${remainingPadding}|\n`;
  headerText += lineDivider;

  // Footer Brand Branding & Metadata Block
  headerText += "\n";
  headerText += "Thank You for Visiting Us\n";
  headerText += "*****Please Come Again*****\n";
  headerText += `Print Time:${formatDateWithSeconds(new Date())}\n`;
  headerText += lineDivider;
  headerText += "Software Provided By Zeeshan POS\n";
  headerText += "https://zeesho.dev\n";
  headerText += lineDivider;
  headerText += "\n\n\n";

  // 3. Trigger Physical Cutter Mechanism
  headerText += CMD.CUT;

  buffers.push(Buffer.from(headerText, 'binary'));

  return Buffer.concat(buffers);
}

export function formatReceipt(data: ReceiptData): string {
  let r = '';
  const width = data.paperWidth || 42; // Default optimized for standard 80mm Café rolls
  const lineDivider = "==========".repeat(Math.floor(width / 10)) + "=".repeat(width % 10) + "\n";
  const subDivider = "----------".repeat(Math.floor(width / 10)) + "-".repeat(width % 10) + "\n";

  // 1. Initialize Printer State
  r += CMD.INIT;

  // 2. Pop Cash Drawer Immediately on Cash Transactions
  if (data.paymentMethod === 'CASH') {
    r += CMD.DRAWER_KICK;
  }

  // Header Block (Logo & Contact Info)
  r += CMD.ALIGN_CENTER;
  r += CMD.FONT_BIG + "CHIMNEY CORNER\n" + CMD.FONT_NORMAL;
  r += "+92300 4792829\n";
  r += "Gulberg 3 Lahore\n";
  r += "Your Bill No Is\n";
  r += CMD.FONT_BIG + `${data.orderNumber}\n` + CMD.FONT_NORMAL;
  r += lineDivider;

  // Cashier, Shift, Date, Terminal Section
  r += CMD.ALIGN_LEFT;
  r += `Cashier: ${data.employeeName || 'Staff'}`;
  r += `  MOP: ${data.paymentMethod || 'CASH'}\n`;
  r += `Date: ${formatDate(data.dateTime)}`;
  r += `  Order Type: ${data.orderType || 'Take Away'}\n`;
  if (data.waiterInfo) {
    r += `Waiter: ${data.waiterInfo}`;
    if (data.tableNumber) {
      r += `  Table: ${data.tableNumber}`;
    }
    r += `\n`;
  } else if (data.tableNumber) {
    r += `Table: ${data.tableNumber}\n`;
  }
  r += `Terminal: ${os.hostname()}\n`;
  r += `Customer Id: ${data.customerName || 'N/A'}\n`;
  r += lineDivider;

  // Items Column Grid Header
  r += CMD.ALIGN_CENTER;
  r += "Pre Sale Bill\n";
  r += CMD.ALIGN_LEFT;
  r += formatItemRow('Name', 'Price', 'Qty', 'Total', width);
  r += subDivider;

  // Items Loop
  let totalQty = 0;
  for (const item of data.items) {
    totalQty += item.qty;
    const priceStr = item.price.toFixed(0);
    const qtyStr = item.qty.toString();
    const totalStr = (item.price * item.qty).toFixed(0);
    r += formatItemRow(item.name, priceStr, qtyStr, totalStr, width);
  }

  r += subDivider;

  // Total Items Count row
  const totalQtyStr = totalQty.toString();
  const rightPartQty = ` ${totalQtyStr.padStart(5)}         `; // align with Qty column
  const leftPartQty = "Total Items";
  const paddingQty = " ".repeat(Math.max(0, width - rightPartQty.length - leftPartQty.length));
  r += `${leftPartQty}${paddingQty}${rightPartQty}\n`;
  r += lineDivider;

  // Financial Compilations Block
  r += CMD.ALIGN_RIGHT;
  r += `Sub Total: ${data.subtotal.toFixed(0)}\n`;

  if (data.discountAmount && data.discountAmount > 0) {
    r += `Discount (${data.discountName || 'Promo'}): -${data.discountAmount.toFixed(0)}\n`;
  }

  if (data.tax && data.tax > 0) {
    const taxRatePercent = data.taxRate !== undefined
      ? data.taxRate
      : Math.round((data.tax / data.subtotal) * 100);
    r += `Tax (${taxRatePercent}%): ${data.tax.toFixed(0)}\n`;
  }

  // Net Total Box
  r += CMD.ALIGN_CENTER;
  r += lineDivider;
  const netTotalStr = `Net Total: ${data.total.toFixed(0)}`;
  const paddingLength = Math.max(0, Math.floor((width - 4 - netTotalStr.length) / 2));
  const boxPadding = " ".repeat(paddingLength);
  const remainingPadding = " ".repeat(Math.max(0, width - 4 - netTotalStr.length - paddingLength));
  r += `|${boxPadding}${netTotalStr}${remainingPadding}|\n`;
  r += lineDivider;

  // Footer Brand Branding & Metadata Block
  r += "\n";
  r += "Thank You for Visiting Us\n";
  r += "*****Please Come Again*****\n";
  r += `Print Time:${formatDateWithSeconds(new Date())}\n`;
  r += lineDivider;
  r += "Software Provided By Zeeshan POS\n";
  r += "https://zeesho.dev\n";
  r += lineDivider;
  r += "\n\n\n";

  // 3. Trigger Physical Cutter Mechanism
  r += CMD.CUT;

  return r;
}

export function printReceiptUsb(shareName: string, receiptData: ReceiptData, logoBase64?: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const normalizedShareName = shareName.trim();
    logPrint(`[USB] request runtime=${getPrintRuntime()} target="${normalizedShareName}"`);
    if (!normalizedShareName || /[\\/:*?"<>|]/.test(normalizedShareName)) {
      logPrint(`[USB] REJECTED invalid share name "${shareName}"`);
      reject(new Error('Invalid Windows printer share name'));
      return;
    }

    const rawBytes = formatReceiptBuffer(receiptData, logoBase64);
    logPrint(`[USB] ESC/POS payload=${rawBytes.length} bytes`);

    if (getPrintRuntime() === 'simulation') {
      logPrint(`[USB] SIMULATION mode — nothing sent to printer "${normalizedShareName}". Set POS_PRINT_RUNTIME=hardware to print for real.`);
      console.log(`[Sandbox Log] Trapped active print sequence targeting USB Share: "${normalizedShareName}"`);
      console.log(`[Sandbox Log] ESC/POS payload size: ${rawBytes.length} bytes`);
      verifyAndLogVirtualReceipt(rawBytes);
      return resolve(true);
    }

    const tmpFile = path.join(os.tmpdir(), `pos_receipt_${Date.now()}.bin`);
    try {
      fs.writeFileSync(tmpFile, rawBytes);
    } catch (err: any) {
      logPrint(`[USB] FAILED writing temp file: ${err.message}`);
      return reject(err);
    }

    const printerUncPath = normalizedShareName.startsWith('\\\\')
      ? normalizedShareName
      : `\\\\127.0.0.1\\${normalizedShareName}`;
    const command = `copy /b "${tmpFile}" "${printerUncPath}"`;
    logPrint(`[USB] exec: ${command}`);

    exec(command, { shell: 'cmd.exe' }, (error, stdout, stderr) => {
      try { fs.unlinkSync(tmpFile); } catch (_) { }
      const exitCode = error ? (error.code ?? 'error') : 0;
      logPrint(`[USB] copy exit=${exitCode} target=${printerUncPath} stdout="${stdout.trim()}" stderr="${stderr.trim()}"`);
      console.log(`[Printer USB] copy exit=${exitCode} target=${printerUncPath}`);
      if (stdout.trim()) console.log(`[Printer USB] stdout: ${stdout.trim()}`);
      if (stderr.trim()) console.error(`[Printer USB] stderr: ${stderr.trim()}`);
      if (error) {
        logPrint(`[USB] REJECTED copy failed: ${stderr.trim() || error.message}`);
        return reject(new Error(stderr.trim() || error.message));
      }
      logPrint(`[USB] copy succeeded — bytes handed to spooler for "${printerUncPath}". (If nothing prints physically, the share/driver is not raw-capable.)`);
      resolve(true);
    });
  });
}

export function printReceiptNetwork(printerIp: string, receiptData: ReceiptData, logoBase64?: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const normalizedPrinterIp = printerIp.trim();
    logPrint(`[NET] request runtime=${getPrintRuntime()} target="${normalizedPrinterIp}:9100"`);
    if (!normalizedPrinterIp || /[\\s;|&<>"']/.test(normalizedPrinterIp)) {
      logPrint(`[NET] REJECTED invalid printer address "${printerIp}"`);
      reject(new Error('Invalid network printer address'));
      return;
    }

    const rawBytes = formatReceiptBuffer(receiptData, logoBase64);
    logPrint(`[NET] ESC/POS payload=${rawBytes.length} bytes`);

    if (getPrintRuntime() === 'simulation') {
      logPrint(`[NET] SIMULATION mode — nothing sent to ${normalizedPrinterIp}:9100. Set POS_PRINT_RUNTIME=hardware to print for real.`);
      console.log(`[Sandbox Log] Trapped active print sequence targeting IP: ${normalizedPrinterIp}:9100`);
      console.log(`[Sandbox Log] ESC/POS payload size: ${rawBytes.length} bytes`);
      verifyAndLogVirtualReceipt(rawBytes);
      return resolve(true);
    }

    const socket = new net.Socket();
    socket.setTimeout(5000);

    socket.connect(9100, normalizedPrinterIp, () => {
      logPrint(`[NET] connected to ${normalizedPrinterIp}:9100; sending ${rawBytes.length} bytes`);
      console.log(`[Printer Network] Connected to ${normalizedPrinterIp}:9100; sending ${rawBytes.length} bytes`);
      socket.end(rawBytes, () => {
        logPrint(`[NET] payload sent to ${normalizedPrinterIp}:9100`);
        console.log(`[Printer Network] Payload sent to ${normalizedPrinterIp}:9100`);
        resolve(true);
      });
    });

    socket.on('error', (err) => {
      logPrint(`[NET] REJECTED ${normalizedPrinterIp}:9100 failed: ${err.message}`);
      console.error(`[Printer Network] ${normalizedPrinterIp}:9100 failed: ${err.message}`);
      socket.destroy();
      reject(err);
    });

    socket.on('timeout', () => {
      logPrint(`[NET] REJECTED ${normalizedPrinterIp}:9100 timed out`);
      console.error(`[Printer Network] ${normalizedPrinterIp}:9100 timed out`);
      socket.destroy();
      reject(new Error('Network terminal connection timed out'));
    });
  });
}

export function printReceipt(
  printerTarget: string,
  receiptData: ReceiptData,
  mode: 'usb' | 'network' = 'usb',
  logoBase64?: string
): Promise<boolean> {
  if (mode === 'network') {
    return printReceiptNetwork(printerTarget, receiptData, logoBase64);
  }
  return printReceiptUsb(printerTarget, receiptData, logoBase64);
}