import net from 'net';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * 🛠️ VIRTUAL PRINTER SANDBOX MODE TOGGLE
 * Set to true to simulate printing in your local console window.
 * Set to false when compiling the final installer EXE for the client system.
 */
const IS_VIRTUAL_SANDBOX = false;

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

export function printReceiptUsb(shareName: string, receiptData: ReceiptData): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const formattedText = formatReceipt(receiptData);
    const rawBytes = Buffer.from(formattedText, 'binary');

    if (IS_VIRTUAL_SANDBOX) {
      console.log(`[Sandbox Log] Trapped active print sequence targeting USB Share: "${shareName}"`);
      verifyAndLogVirtualReceipt(rawBytes);
      return resolve(true);
    }

    const tmpFile = path.join(os.tmpdir(), `pos_receipt_${Date.now()}.bin`);
    try {
      fs.writeFileSync(tmpFile, rawBytes);
    } catch (err: any) {
      return reject(err);
    }

    const printerUncPath = `\\\\127.0.0.1\\${shareName}`;
    const command = `copy /b "${tmpFile}" "${printerUncPath}"`;

    exec(command, { shell: 'cmd.exe' }, (error, stdout, stderr) => {
      try { fs.unlinkSync(tmpFile); } catch (_) { }
      if (error) return reject(new Error(stderr || error.message));
      resolve(true);
    });
  });
}

export function printReceiptNetwork(printerIp: string, receiptData: ReceiptData): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const formattedText = formatReceipt(receiptData);
    const rawBytes = Buffer.from(formattedText, 'binary');

    if (IS_VIRTUAL_SANDBOX) {
      console.log(`[Sandbox Log] Trapped active print sequence targeting IP: ${printerIp}:9100`);
      verifyAndLogVirtualReceipt(rawBytes);
      return resolve(true);
    }

    const socket = new net.Socket();
    socket.setTimeout(5000);

    socket.connect(9100, printerIp, () => {
      socket.write(rawBytes, () => {
        socket.destroy();
        resolve(true);
      });
    });

    socket.on('error', (err) => {
      socket.destroy();
      reject(err);
    });

    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('Network terminal connection timed out'));
    });
  });
}

export function printReceipt(
  printerTarget: string,
  receiptData: ReceiptData,
  mode: 'usb' | 'network' = 'usb'
): Promise<boolean> {
  if (mode === 'network') {
    return printReceiptNetwork(printerTarget, receiptData);
  }
  return printReceiptUsb(printerTarget, receiptData);
}