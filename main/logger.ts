import fs from 'fs';
import path from 'path';
import { app } from 'electron';

// Persist print diagnostics next to settings.json so it is easy to find.
// Prod: %APPDATA%/chimney-corner-pos/print-debug.log
// Dev:  <cwd>/print-debug.log
const isProd = app && app.isPackaged;
const appDataFolder = path.join(
  process.env.APPDATA || (process.platform === 'darwin' ? process.env.HOME + '/Library/Application Support' : '/tmp'),
  'chimney-corner-pos'
);

const logFilePath = path.join(isProd ? appDataFolder : process.cwd(), 'print-debug.log');

export function getPrintLogPath(): string {
  return logFilePath;
}

export function logPrint(...parts: any[]): void {
  const stamp = new Date().toISOString();
  const body = parts
    .map((p) => (typeof p === 'string' ? p : (() => { try { return JSON.stringify(p); } catch { return String(p); } })()))
    .join(' ');
  const line = `[${stamp}] ${body}\n`;

  // Always echo to the console for dev visibility.
  console.log('[PrintLog]', body);

  // Best-effort append to the on-disk log. Never throw from logging.
  try {
    const dir = path.dirname(logFilePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(logFilePath, line, 'utf8');
  } catch (err) {
    // Swallow logging errors — diagnostics must never break printing.
  }
}
