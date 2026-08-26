import fs from 'fs';
import path from 'path';
import { app } from 'electron';

export interface Employee {
  pin: string;
  name: string;
  role: 'CASHIER' | 'MANAGER';
}

export interface Category {
  name: string;
  status: 'ACTIVE' | 'DISABLED';
  imageUrl?: string;
  bgColor?: string;
  textColor?: string;
}

export interface Staff {
  code: string;
  name: string;
  fatherName?: string;
  role: string;
  cnic?: string;
  salary: number;
  status: 'ACTIVE' | 'DISABLED';
}

export interface TerminalSettings {
  setupComplete: boolean;
  businessName: string;
  licenseKey: string;
  isMaster: boolean;
  masterIp: string;
  branchId: string;
  terminalId: string;
  enterpriseTenantId: string;
  cloudUrl: string;
  employees: Employee[];
  categories: Category[];
  taxEnabled: boolean;
  taxRate: number;
  printerMode: 'usb' | 'network';
  printerTarget: string;
  printerLogoBase64?: string;
  showPrintPreview?: boolean;
  printerType: 'esc-pos' | 'html';
  simulatePrinting?: boolean; // true = no physical printer; simulate print jobs and report success
  staff?: Staff[];
}

const isProd = app && app.isPackaged;
const appDataFolder = path.join(
  process.env.APPDATA || (process.platform === 'darwin' ? process.env.HOME + '/Library/Application Support' : '/tmp'),
  'chimney-corner-pos'
);

const settingsFilePath = path.join(
  isProd ? appDataFolder : process.cwd(),
  'settings.json'
);

const defaultSettings: TerminalSettings = {
  setupComplete: false,
  businessName: 'My Cafe',
  licenseKey: '',
  isMaster: true,
  masterIp: '127.0.0.1',
  branchId: 'BR01',
  terminalId: 'T01',
  enterpriseTenantId: 'TENANT-CAFE-CORP',
  cloudUrl: 'http://localhost:5000',
  employees: [
    { pin: '1234', name: 'Alex', role: 'CASHIER' },
    { pin: '5678', name: 'Sam', role: 'CASHIER' },
    { pin: '9012', name: 'Jane', role: 'CASHIER' },
    { pin: '0000', name: 'Manager', role: 'MANAGER' },
  ],
  categories: [
    { name: 'Coffee', status: 'ACTIVE' },
    { name: 'Drinks', status: 'ACTIVE' },
    { name: 'Bakery', status: 'ACTIVE' },
    { name: 'Sides', status: 'ACTIVE' },
    { name: 'Merch', status: 'ACTIVE' }
  ],
  taxEnabled: true,
  taxRate: 10,
  // Printer: USB via Windows shared printer named 'POSPrinter'
  printerMode: 'usb',
  printerTarget: 'POSPrinter',
  printerType: 'html',
};

export function loadSettings(): TerminalSettings {
  try {
    if (fs.existsSync(settingsFilePath)) {
      const content = fs.readFileSync(settingsFilePath, 'utf8');
      const loaded = JSON.parse(content);
      
      // Migrate categories from string[] to Category[] if needed
      if (loaded.categories && loaded.categories.length > 0 && typeof loaded.categories[0] === 'string') {
        loaded.categories = loaded.categories.map((c: string) => ({ name: c, status: 'ACTIVE' }));
      }
      
      const merged = { ...defaultSettings, ...loaded };
      if (loaded.setupComplete === undefined && Object.keys(loaded).length > 0) {
        merged.setupComplete = true;
      }
      if (merged.taxEnabled === undefined) merged.taxEnabled = true;
      if (merged.taxRate === undefined) merged.taxRate = 10;
      if (merged.printerType !== 'esc-pos' && merged.printerType !== 'html') merged.printerType = 'html';
      return merged;
    }
  } catch (err) {
    console.error('Error reading settings file, loading defaults:', err);
  }
  
  // Write default settings file if not exists
  saveSettings(defaultSettings);
  return defaultSettings;
}

export function saveSettings(settings: TerminalSettings) {
  try {
    if (!fs.existsSync(path.dirname(settingsFilePath))) {
      fs.mkdirSync(path.dirname(settingsFilePath), { recursive: true });
    }
    fs.writeFileSync(settingsFilePath, JSON.stringify(settings, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving settings file:', err);
  }
}
