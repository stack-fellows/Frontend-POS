import { BrowserWindow } from 'electron';
import { ReceiptData } from './printer';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { getPrintRuntime } from './printer';

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

export function printHtmlReceipt(
  deviceName: string,
  data: ReceiptData,
  logoBase64?: string,
  showPreview: boolean = false
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    // Generate the HTML content
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Receipt Preview - ${data.orderNumber}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap');
    @page { size: 80mm auto; margin: 0; }
    body {
      font-family: 'Roboto', 'Segoe UI', Arial, sans-serif;
      margin: 0; padding: 10px 5px; width: 80mm;
      box-sizing: border-box; color: #333; font-size: 12px; line-height: 1.5;
      background: #fff;
    }
    .text-center { text-align: center; }
    .logo-container { margin-bottom: 15px; text-align: center; width: 100%; }
    .logo-container img { max-width: 100%; height: auto; max-height: 90px; object-fit: contain; }
    .shop-title { font-size: 16px; font-weight: 500; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 2px; }
    .shop-subtitle { font-size: 11px; }
    
    .divider { border-top: 1px dashed #666; margin: 10px 0; }
    
    .receipt-header { font-size: 14px; font-weight: 500; text-align: center; margin: 10px 0; letter-spacing: 0.5px; }
    
    .meta-info { font-size: 11px; margin-bottom: 10px; }
    .meta-info div { display: flex; justify-content: space-between; margin: 2px 0; }
    
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 5px; }
    th { padding: 4px 0; text-align: left; font-weight: 500; font-size: 11px; }
    td { padding: 4px 0; vertical-align: top; }
    .col-qty { width: 25px; }
    .col-desc { text-align: left; }
    .col-price { text-align: right; width: 60px; }
    
    .item-name { font-weight: 400; }
    .item-modifiers { font-size: 10px; color: #555; padding-left: 5px; }
    
    .items-sold { text-align: center; font-size: 11px; margin: 8px 0; }
    
    .totals-row { display: flex; justify-content: space-between; margin: 4px 0; }
    .total-line { font-size: 14px; font-weight: 500; margin-top: 5px; }
    
    .footer { text-align: center; font-size: 11px; margin-top: 15px; padding-bottom: 10px; }
  </style>
</head>
<body>
  <div class="logo-container">
    ${logoBase64 ? `<img src="${logoBase64}" />` : `<div class="shop-title">CHIMNEY CORNER</div>`}
  </div>
  <div class="text-center">
    ${logoBase64 ? `<div class="shop-title">CHIMNEY CORNER</div>` : ''}
    <div class="shop-subtitle">+92300 4792829<br/>Gulberg 3 Lahore</div>
  </div>

  <div class="divider"></div>
  <div class="meta-info">
    <div><span>Order: #${data.orderNumber || 'Pending'}</span><span>Date: ${formatDateWithSeconds(data.dateTime)}</span></div>
    <div><span>Cashier: ${data.employeeName || 'Staff'}</span><span>Type: ${data.orderType || 'Take Away'}</span></div>
    ${(data.waiterInfo || data.tableNumber) ? `
      <div>
        ${data.waiterInfo ? `<span>Waiter: ${data.waiterInfo}</span>` : ''}
        ${data.tableNumber ? `<span>Table: ${data.tableNumber}</span>` : ''}
      </div>
    ` : ''}
    ${data.customerName ? `<div><span>Customer: ${data.customerName}</span></div>` : ''}
  </div>

  <div class="divider"></div>
  <div class="receipt-header">SALES RECEIPT</div>
  <div class="divider"></div>

  <table>
    <thead><tr><th class="col-desc">Item Description</th><th class="col-qty">Qty</th><th class="col-price">Price</th></tr></thead>
    <tbody>
      ${data.items.map((item: any) => `
        <tr>
          <td class="col-desc">
            <div class="item-name">${item.name}</div>
            ${item.modifiers && item.modifiers.length > 0 ? `<div class="item-modifiers">*** ${item.modifiers.join(', ')}</div>` : ''}
          </td>
          <td class="col-qty">${item.qty}</td>
          <td class="col-price">${(item.price * item.qty).toFixed(0)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="divider"></div>
  
  <div class="totals-row"><span>Sub Total:</span><span>${data.subtotal.toFixed(0)}</span></div>
  <div class="divider"></div>

  ${(data.discountAmount && data.discountAmount > 0) ? `
    <div class="totals-row"><span>Discount (${data.discountName || 'Promo'}):</span><span>-${data.discountAmount.toFixed(0)}</span></div>
    <div class="divider"></div>
  ` : ''}

  ${(data.tax && data.tax > 0) ? `
    <div class="totals-row"><span>Tax:</span><span>${data.tax.toFixed(0)}</span></div>
    <div class="divider"></div>
  ` : ''}
  
  <div class="totals-row total-line"><span>Total:</span><span>${data.total.toFixed(0)}</span></div>
  <div class="totals-row"><span>MOP:</span><span>${data.paymentMethod || 'CASH'}</span></div>
  
  ${(data.cashReceived && data.cashReceived > 0 && data.paymentMethod === 'CASH') ? `
    <div class="divider"></div>
    <div class="totals-row"><span>Tendered Total:</span><span>${data.cashReceived.toFixed(0)}</span></div>
    <div class="totals-row"><span>Change:</span><span>${(data.changeGiven || 0).toFixed(0)}</span></div>
  ` : ''}

  <div class="divider"></div>
  <div class="footer">
    <div>THANK YOU</div>
    <div style="margin-top: 10px; font-size: 9px; color: #888;">Powered by Zeeshan POS<br/>https://zeesho.dev</div>
  </div>
</body>
</html>
    `;

    const tmpFile = path.join(os.tmpdir(), `receipt_${Date.now()}.html`);

    if (getPrintRuntime() === 'simulation') {
      const debugFolder = path.join(process.cwd(), '.print-debug');
      const debugFile = path.join(debugFolder, `receipt_${Date.now()}.html`);
      try {
        fs.mkdirSync(debugFolder, { recursive: true });
        fs.writeFileSync(debugFile, htmlContent, 'utf-8');
        console.log(`[Sandbox Log] HTML receipt simulated for "${deviceName}" (${htmlContent.length} characters)`);
        console.log(`[Sandbox Log] HTML artifact: ${debugFile}`);
        resolve(true);
      } catch (err) {
        reject(err);
      }
      return;
    }

    try {
      fs.writeFileSync(tmpFile, htmlContent, 'utf-8');
    } catch (err) {
      return reject(err);
    }

    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    const cleanup = () => {
      if (!win.isDestroyed()) win.close();
      try { fs.unlinkSync(tmpFile); } catch (e) {}
    };
    const loadTimer = setTimeout(() => {
      cleanup();
      reject(new Error('Receipt preview timed out while loading'));
    }, 10000);

    win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
      clearTimeout(loadTimer);
      cleanup();
      reject(new Error(`Receipt preview failed to load (${errorCode}): ${errorDescription}`));
    });

    win.loadFile(tmpFile).catch((err) => {
      clearTimeout(loadTimer);
      cleanup();
      reject(err);
    });

    win.webContents.on('did-finish-load', () => {
      clearTimeout(loadTimer);
      setTimeout(() => {
        win.webContents.print({
          silent: !showPreview,
          deviceName: deviceName,
          printBackground: true,
          margins: { marginType: 'none' },
          pageSize: {
            width: 80000,   // 80mm in microns
            height: 250000  // 250mm in microns
          }
        }, (success, failureReason) => {
          cleanup();
          if (success || failureReason === 'cancelled') {
            resolve(true);
          } else {
            reject(new Error(`Print failed: ${failureReason}`));
          }
        });
      }, 500);
    });
  });
}
