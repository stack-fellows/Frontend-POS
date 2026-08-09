import { prisma } from './db';
import { loadSettings } from './settings';

let syncInterval: NodeJS.Timeout | null = null;
let isSyncing = false;

async function checkCloudOnline(cloudUrl: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 seconds timeout
    
    const response = await fetch(`${cloudUrl}/api/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    return response.ok;
  } catch (err) {
    return false;
  }
}

async function performSync() {
  if (isSyncing) return;
  isSyncing = true;

  const settings = loadSettings();
  
  // Only the Master terminal syncs to the central cloud server
  if (!settings.isMaster) {
    isSyncing = false;
    return;
  }

  try {
    const isOnline = await checkCloudOnline(settings.cloudUrl);
    if (!isOnline) {
      console.log('[Sync Engine] Cloud is offline. Postponing synchronization.');
      isSyncing = false;
      return;
    }

    // Fetch oldest pending records in FIFO order
    const pendingEvents = await prisma.localSyncOutbox.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 20, // Sync in batches
    });

    if (pendingEvents.length === 0) {
      isSyncing = false;
      return;
    }

    console.log(`[Sync Engine] Batch syncing ${pendingEvents.length} events to the cloud...`);

    try {
      const response = await fetch(`${settings.cloudUrl}/api/sync/batch`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.licenseKey}`
        },
        body: JSON.stringify({
          branchId: settings.branchId,
          terminalId: settings.terminalId,
          enterpriseTenantId: settings.enterpriseTenantId,
          events: pendingEvents.map(e => ({
            id: e.id,
            entityName: e.entityName,
            entityId: e.entityId,
            action: e.action,
            payload: e.payload
          }))
        }),
      });

      if (response.ok) {
        const resultData = await response.json();
        for (const resItem of resultData.results) {
          if (resItem.success) {
            await prisma.localSyncOutbox.update({
              where: { id: resItem.id },
              data: { status: 'COMPLETED', attempts: { increment: 1 }, errorMessage: null },
            });
          } else {
            await prisma.localSyncOutbox.update({
              where: { id: resItem.id },
              data: {
                attempts: { increment: 1 },
                errorMessage: resItem.error || 'Cloud ingestion failed',
              },
            });
          }
        }
      } else {
        const errText = await response.text();
        throw new Error(`Cloud batch sync rejected: ${errText}`);
      }
    } catch (err: any) {
      console.error(`[Sync Engine] Batch sync transport failure:`, err.message);
      for (const event of pendingEvents) {
        await prisma.localSyncOutbox.update({
          where: { id: event.id },
          data: {
            attempts: { increment: 1 },
            errorMessage: err.message || 'Network transport error',
          },
        });
      }
    }
  } catch (error) {
    console.error('[Sync Engine] Critical error in sync loop:', error);
  } finally {
    isSyncing = false;
  }
}

export function startSyncEngine() {
  if (syncInterval) return;
  console.log('[Sync Engine] Initializing background outbox sync worker...');
  
  // Run once immediately, then poll every 10 seconds
  performSync();
  syncInterval = setInterval(performSync, 10000);
}

export function stopSyncEngine() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    console.log('[Sync Engine] Stopped sync worker.');
  }
}
