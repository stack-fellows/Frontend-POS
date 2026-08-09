const { PrismaClient } = require('./main/generated/client');
const path = require('path');

// Resolve path to the SQLite database
const isProd = process.env.NODE_ENV === 'production';
const appDataFolder = path.join(
  process.env.APPDATA || (process.platform === 'darwin' ? process.env.HOME + '/Library/Application Support' : '/tmp'),
  'cafe-pos-client'
);
const dbPath = isProd
  ? path.join(appDataFolder, 'dev.db')
  : path.join(__dirname, 'prisma', 'dev.db');

console.log('Using database path:', dbPath);

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: `file:${dbPath}`,
    },
  },
});

async function main() {
  const shifts = await prisma.employeeShift.findMany();
  console.log('Shifts in local DB:', shifts);
  const outbox = await prisma.localSyncOutbox.findMany();
  console.log('Outbox in local DB:', outbox.map(o => ({ id: o.id, entityName: o.entityName, status: o.status })));
  const orders = await prisma.order.findMany();
  console.log('Orders in local DB:', orders);
}

main().catch(console.error).finally(() => prisma.$disconnect());
