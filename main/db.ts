import { app } from 'electron';
import { PrismaClient } from './generated/client';
import path from 'path';
import fs from 'fs';

const isProd = app && app.isPackaged;

// Ensure standard user-data directory path exists for SQLite in production
const appDataFolder = path.join(
  process.env.APPDATA || (process.platform === 'darwin' ? process.env.HOME + '/Library/Application Support' : '/tmp'),
  'cafe-pos-client'
);

if (isProd && !fs.existsSync(appDataFolder)) {
  fs.mkdirSync(appDataFolder, { recursive: true });
}

const dbPath = isProd
  ? path.join(appDataFolder, 'dev.db')
  : path.join(process.cwd(), 'prisma', 'dev.db');

// If in production and database file doesn't exist, we can copy the blank skeleton
if (isProd && !fs.existsSync(dbPath)) {
  const skeletonPath = path.join(app ? app.getAppPath() : process.cwd(), 'prisma', 'dev.db');
  if (fs.existsSync(skeletonPath)) {
    try {
      fs.copyFileSync(skeletonPath, dbPath);
      fs.chmodSync(dbPath, 0o666); // Fix read-only attribute from packaged files
      console.log(`[DB Initialization] Successfully copied database skeleton to: ${dbPath}`);
    } catch (err: any) {
      console.error(`[DB Initialization] Error copying database skeleton:`, err.message);
    }
  } else {
    console.error(`[DB Initialization] Database skeleton not found at: ${skeletonPath}`);
  }
}

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: `file:${dbPath}`,
    },
  },
});

// Auto-migrate schema changes for SQLite in production/development
async function runAutoMigrations() {
  try {
    const columns: any[] = await prisma.$queryRawUnsafe(`PRAGMA table_info(Product);`);
    const hasStatus = columns.some((col: any) => col.name === 'status');
    if (!hasStatus) {
      console.log('[DB Auto-Migration] Adding status column to Product table...');
      await prisma.$executeRawUnsafe(`ALTER TABLE Product ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE';`);
      console.log('[DB Auto-Migration] Successfully added status column.');
    }
    const hasBgColor = columns.some((col: any) => col.name === 'bgColor');
    if (!hasBgColor) {
      console.log('[DB Auto-Migration] Adding bgColor column to Product table...');
      await prisma.$executeRawUnsafe(`ALTER TABLE Product ADD COLUMN bgColor TEXT;`);
      console.log('[DB Auto-Migration] Successfully added bgColor column.');
    }
    const hasTextColor = columns.some((col: any) => col.name === 'textColor');
    if (!hasTextColor) {
      console.log('[DB Auto-Migration] Adding textColor column to Product table...');
      await prisma.$executeRawUnsafe(`ALTER TABLE Product ADD COLUMN textColor TEXT;`);
      console.log('[DB Auto-Migration] Successfully added textColor column.');
    }
  } catch (err: any) {
    console.error('[DB Auto-Migration] Error running auto-migrations:', err.message);
  }
}

runAutoMigrations();

