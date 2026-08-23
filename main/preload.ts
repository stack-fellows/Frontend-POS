import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  printReceipt: (arg1: any, arg2?: any) => ipcRenderer.invoke('print-receipt', { receiptData: arg2 ? arg2 : arg1 }),
  getInstalledPrinters: () => ipcRenderer.invoke('get-installed-printers'),
  testPrint: (target: string, mode: string, printerType?: 'esc-pos' | 'html') => ipcRenderer.invoke('test-print', { target, mode, printerType }),
  savePrinterSettings: (target: string, mode: string, logoBase64?: string, showPrintPreview?: boolean, printerType?: 'esc-pos' | 'html') => ipcRenderer.invoke('save-printer-settings', { target, mode, logoBase64, showPrintPreview, printerType }),
  getPrintLogs: () => ipcRenderer.invoke('get-print-logs'),
  closeApp: () => ipcRenderer.invoke('close-app'),
  onUpdateAvailable: (callback: (info: any) => void) => {
    ipcRenderer.removeAllListeners('update-available');
    ipcRenderer.on('update-available', (_, info) => callback(info));
  },
  onUpdateProgress: (callback: (progress: any) => void) => {
    ipcRenderer.removeAllListeners('download-progress');
    ipcRenderer.on('download-progress', (_, progress) => callback(progress));
  },
  onUpdateDownloaded: (callback: (info: any) => void) => {
    ipcRenderer.removeAllListeners('update-downloaded');
    ipcRenderer.on('update-downloaded', (_, info) => callback(info));
  },
  onUpdateError: (callback: (error: string) => void) => {
    ipcRenderer.removeAllListeners('update-error');
    ipcRenderer.on('update-error', (_, error) => callback(error));
  },
  restartAndInstall: () => ipcRenderer.invoke('restart-and-install'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
});
