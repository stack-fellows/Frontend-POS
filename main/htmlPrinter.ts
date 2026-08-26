import { BrowserWindow } from 'electron';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getPrintRuntime, ReceiptData } from './printer';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(value: Date | string | number): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
}

function buildReceiptHtml(data: ReceiptData, logoBase64?: string): string {
  const items = data.items.map((item) => `
    <tr>
      <td>${escapeHtml(item.name)}</td>
      <td class="qty">${item.qty}</td>
      <td class="money">${(item.price * item.qty).toFixed(2)}</td>
    </tr>`).join('');
  const logo = logoBase64 ? `<img class="logo" src="${escapeHtml(logoBase64)}" alt="Logo">` : '';

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Receipt ${escapeHtml(data.orderNumber)}</title>
<style>
  @page { size: 80mm 297mm; margin: 0; }
  body { width: 100%; margin: 0; padding: 2mm; box-sizing: border-box; font-family: Arial, sans-serif; font-size: 11px; color: #111; }
  .center { text-align: center; } .logo { max-width: 65mm; max-height: 24mm; object-fit: contain; }
  h1 { font-size: 18px; margin: 2mm 0 1mm; } .muted { font-size: 10px; }
  hr { border: 0; border-top: 1px dashed #111; margin: 3mm 0; }
  .meta { display: flex; justify-content: space-between; gap: 4mm; } table { width: 100%; border-collapse: collapse; }
  th, td { padding: 1.5mm 0; text-align: left; } th { border-bottom: 1px solid #111; }
  .qty { width: 10mm; text-align: center; } .money { text-align: right; white-space: nowrap; }
  .total { font-size: 14px; font-weight: bold; } .footer { margin-top: 5mm; text-align: center; }
</style></head><body>
  <div class="center">${logo}<h1>CHIMNEY CORNER</h1><div class="muted">+92300 4792829<br>Gulberg 3 Lahore</div></div>
  <hr><div class="meta"><span>Order: ${escapeHtml(data.orderNumber)}</span><span>${escapeHtml(formatDate(data.dateTime))}</span></div>
  <div class="meta"><span>Cashier: ${escapeHtml(data.employeeName || 'Staff')}</span><span>${escapeHtml(data.paymentMethod || 'CASH')}</span></div>
  <hr><table><thead><tr><th>Item</th><th class="qty">Qty</th><th class="money">Total</th></tr></thead><tbody>${items}</tbody></table>
  <hr><div class="meta"><span>Subtotal</span><span>${data.subtotal.toFixed(2)}</span></div>
  ${data.discountAmount ? `<div class="meta"><span>Discount</span><span>-${data.discountAmount.toFixed(2)}</span></div>` : ''}
  ${data.tax ? `<div class="meta"><span>Tax</span><span>${data.tax.toFixed(2)}</span></div>` : ''}
  <div class="meta total"><span>Total</span><span>${data.total.toFixed(2)}</span></div>
  <div class="footer">Thank you for visiting us<br><span class="muted">Powered by Zeeshan POS</span></div>
</body></html>`;
}

export function printHtmlReceipt(deviceName: string, data: ReceiptData, logoBase64?: string, showPreview = false): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const target = deviceName.trim();
    if (!target) {
      reject(new Error('Windows printer name is required'));
      return;
    }

    const html = buildReceiptHtml(data, logoBase64);
    if (getPrintRuntime() === 'simulation') {
      try {
        const debugFolder = path.join(process.cwd(), '.print-debug');
        fs.mkdirSync(debugFolder, { recursive: true });
        const artifact = path.join(debugFolder, `receipt-${Date.now()}.html`);
        fs.writeFileSync(artifact, html, 'utf8');
        console.log(`[Print Simulation] HTML receipt generated for "${target}": ${artifact}`);
        resolve(true);
      } catch (error) {
        reject(error);
      }
      return;
    }

    const tempFile = path.join(os.tmpdir(), `pos-receipt-${Date.now()}.html`);
    let window: BrowserWindow | null = null;
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (window && !window.isDestroyed()) window.close();
      try { fs.unlinkSync(tempFile); } catch { /* best effort cleanup */ }
      if (error) reject(error); else resolve(true);
    };

    try {
      fs.writeFileSync(tempFile, html, 'utf8');
      window = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true } });
      window.webContents.once('did-fail-load', (_event, code, description) => finish(new Error(`Receipt load failed (${code}): ${description}`)));
      window.webContents.once('did-finish-load', () => {
        setTimeout(() => {
          if (!window || window.isDestroyed()) return finish(new Error('Print window closed before printing'));
          window.webContents.print({
            silent: !showPreview,
            deviceName: target,
            printBackground: true,
            margins: { marginType: 'none' },
            pageSize: { width: 80000, height: 297000 }
          }, (success, reason) => finish(success ? undefined : new Error(`Print failed: ${reason || 'unknown error'}`)));
        }, 300);
      });
      window.loadFile(tempFile).catch((error) => finish(error instanceof Error ? error : new Error(String(error))));
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
