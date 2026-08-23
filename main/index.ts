import './env';
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { exec } from 'child_process';
import { loadSettings, saveSettings } from './settings';
import { startLocalServer, stopLocalServer } from './server';
import { startSyncEngine, stopSyncEngine } from './sync';
import { startEmbeddedCloudServer, stopEmbeddedCloudServer } from './cloudServer';
import { ReceiptData, getPrintRuntime, printReceipt } from './printer';
import { printHtmlReceipt } from './htmlPrinter';
import { connectToCloudWs, disconnectCloudWs } from './cloudWs';
import { autoUpdater } from 'electron-updater';

let mainWindow: BrowserWindow | null = null;
const isDev = !(app && app.isPackaged);

function createWindow() {
  const settings = loadSettings();

  // 1. If this terminal is the Store Master POS, boot the Express LAN Server & WebSocket hub
  if (settings.isMaster) {
    startLocalServer();
    startEmbeddedCloudServer();
    startSyncEngine();
    connectToCloudWs();
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    fullscreen: !isDev, // Fullscreen mode in production for kiosk operation
    frame: isDev,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (isDev) {
    // In development, load from running Next.js dev server
    const pageUrl = settings.setupComplete ? 'http://localhost:3000' : 'http://localhost:3000/setup';
    mainWindow.loadURL(pageUrl);
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load the statically exported Next.js HTML files
    const pageFile = settings.setupComplete ? 'index.html' : 'setup.html';
    const indexPath = path.join(__dirname, '..', '..', 'out', pageFile);
    mainWindow.loadFile(indexPath);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // ----------------------------------------------------
  // AUTO-UPDATER LOGIC
  // ----------------------------------------------------
  if (!isDev) {
    // Commented out to use GitHub Releases instead of local/cloud server for auto-updates.
    // electron-updater will automatically read your GitHub repo publish details from package.json/app-update.yml.
    // const cloudUrl = settings.cloudUrl || 'http://localhost:8000';
    // autoUpdater.setFeedURL(`${cloudUrl}/updates`);
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('update-available', (info) => {
      if (mainWindow) mainWindow.webContents.send('update-available', info);
    });

    autoUpdater.on('download-progress', (progressObj) => {
      if (mainWindow) mainWindow.webContents.send('download-progress', progressObj);
    });

    autoUpdater.on('update-downloaded', (info) => {
      if (mainWindow) mainWindow.webContents.send('update-downloaded', info);
    });

    autoUpdater.on('error', (err) => {
      if (mainWindow) mainWindow.webContents.send('update-error', err.message);
    });

    setTimeout(() => {
      autoUpdater.checkForUpdatesAndNotify().catch(e => console.error('AutoUpdater Error:', e));
    }, 5000);
    
    setInterval(() => {
      autoUpdater.checkForUpdatesAndNotify().catch(e => console.error('AutoUpdater Error:', e));
    }, 1000 * 60 * 60);
  }
}

ipcMain.handle('restart-and-install', () => {
  autoUpdater.quitAndInstall();
});

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  stopLocalServer();
  stopEmbeddedCloudServer();
  stopSyncEngine();
  disconnectCloudWs();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// IPC Handler: Manage settings exchange between Next.js UI and Electron Main
ipcMain.handle('get-settings', async () => {
  return loadSettings();
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});



interface PrintLog {
  id: string;
  timestamp: string;
  orderNumber: string;
  status: 'printing' | 'success' | 'error';
  error?: string;
  target: string;
  mode: string;
  printerType?: string;
  runtime?: string;
  stage?: string;
}

const printLogs: PrintLog[] = [];

function addPrintLog(orderNumber: string, target: string, mode: string, printerType?: string): PrintLog {
  const log: PrintLog = {
    id: Math.random().toString(36).substring(2, 9),
    timestamp: new Date().toLocaleTimeString(),
    orderNumber,
    status: 'printing',
    target,
    mode,
    printerType,
    runtime: getPrintRuntime(),
    stage: 'queued',
  };
  printLogs.unshift(log);
  if (printLogs.length > 50) printLogs.pop();
  return log;
}

// IPC Handler: Get local memory print logs
ipcMain.handle('get-print-logs', async () => {
  return printLogs;
});

// IPC Handler: Print receipts via USB (Windows Share) or Network socket, based on settings
ipcMain.handle('print-receipt', async (event, { receiptData }: { receiptData: ReceiptData }) => {
  const settings = loadSettings();
  const mode = settings.printerMode || 'usb';
  const target = settings.printerTarget || 'POSPrinter';
  const printerType = settings.printerType || 'esc-pos';
  const logItem = addPrintLog(receiptData.orderNumber || 'UNKNOWN', target, mode, printerType);
  
  try {
    logItem.stage = 'formatting';
    if (settings.printerType === 'html') {
      logItem.stage = 'html-print';
      await printHtmlReceipt(target, receiptData, settings.printerLogoBase64, settings.showPrintPreview);
    } else {
      logItem.stage = mode === 'network' ? 'network-send' : 'usb-send';
      await printReceipt(target, receiptData, mode, settings.printerLogoBase64);
    }
    logItem.status = 'success';
    logItem.stage = 'completed';
    return { success: true, runtime: logItem.runtime, stage: logItem.stage, diagnosticId: logItem.id };
  } catch (err: any) {
    console.error('[Electron Main IPC] Print failed:', err.message);
    logItem.status = 'error';
    logItem.stage = 'failed';
    logItem.error = err.message;
    return { success: false, runtime: logItem.runtime, stage: logItem.stage, diagnosticId: logItem.id, error: err.message };
  }
});

// IPC Handler: List all printers installed on Windows using PowerShell
ipcMain.handle('get-installed-printers', async () => {
  return new Promise((resolve) => {
    const cmd = `powershell -NoProfile -Command "Get-Printer | Select-Object Name, DriverName, PortName, PrinterStatus | ConvertTo-Json -Compress"`;
    exec(cmd, { shell: 'cmd.exe' }, (error, stdout) => {
      if (error) {
        console.error('[Printer Discovery] PowerShell failed:', error.message);
        return resolve([]);
      }
      try {
        let raw = JSON.parse(stdout.trim());
        // PowerShell returns object (not array) when only one printer found
        if (!Array.isArray(raw)) raw = [raw];
        const printers = raw.map((p: any) => ({
          name: p.Name || 'Unknown',
          driver: p.DriverName || '',
          port: p.PortName || '',
          // Detect likely USB printers by port name convention
          isUsb: (p.PortName || '').toUpperCase().startsWith('USB') ||
                 (p.PortName || '').toUpperCase().startsWith('DOT4'),
          status: p.PrinterStatus === 0 ? 'Ready' : 'Offline',
        }));
        resolve(printers);
      } catch {
        resolve([]);
      }
    });
  });
});

// IPC Handler: Save printer settings and send a test print
ipcMain.handle('test-print', async (event, { target, mode, printerType }: { target: string; mode: 'usb' | 'network'; printerType?: 'esc-pos' | 'html' }) => {
  const settings = loadSettings();
  const selectedPrinterType = printerType || settings.printerType || 'esc-pos';
  const logItem = addPrintLog('TEST-PRINT', target, mode, selectedPrinterType);
  try {
    // Save the settings first
    settings.printerMode = mode;
    settings.printerType = selectedPrinterType;
    settings.printerTarget = target;
    saveSettings(settings);

    // Build a compact test receipt
    const testReceipt: ReceiptData = {
      orderNumber: 'TEST-001',
      dateTime: new Date(),
      employeeName: 'System Test',
      items: [{ name: 'Printer Test Item', qty: 1, price: 0.00 }],
      subtotal: 0.00,
      tax: 0.00,
      total: 0.00,
      paymentMethod: 'TEST',
    };
    logItem.stage = selectedPrinterType === 'html' ? 'html-print' : mode === 'network' ? 'network-send' : 'usb-send';
    if (selectedPrinterType === 'html') {
      await printHtmlReceipt(target, testReceipt, settings.printerLogoBase64);
    } else {
      await printReceipt(target, testReceipt, mode, settings.printerLogoBase64);
    }
    logItem.status = 'success';
    logItem.stage = 'completed';
    return { success: true, runtime: logItem.runtime, stage: logItem.stage, diagnosticId: logItem.id };
  } catch (err: any) {
    console.error('[Electron Main IPC] Test print failed:', err.message);
    logItem.status = 'error';
    logItem.stage = 'failed';
    logItem.error = err.message;
    return { success: false, runtime: logItem.runtime, stage: logItem.stage, diagnosticId: logItem.id, error: err.message };
  }
});

// IPC Handler: Save printer settings without printing
ipcMain.handle('save-printer-settings', async (event, { target, mode, logoBase64, showPrintPreview, printerType }: { target: string; mode: 'usb' | 'network'; logoBase64?: string; showPrintPreview?: boolean; printerType?: 'esc-pos' | 'html' }) => {
  try {
    const settings = loadSettings();
    settings.printerMode = mode;
    settings.printerTarget = target;
    if (logoBase64 !== undefined) settings.printerLogoBase64 = logoBase64;
    if (showPrintPreview !== undefined) settings.showPrintPreview = showPrintPreview;
    if (printerType !== undefined) settings.printerType = printerType;
    saveSettings(settings);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});
ipcMain.handle('close-app', async () => {
  if (mainWindow) {
    mainWindow.close();
  }
});

