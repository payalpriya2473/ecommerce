// ============================================================================
//  STOCK SYNC CRON
//   - In-process scheduler: server.js calls startStockSyncCron() on boot.
//   - Standalone one-shot:  `node cron/syncStockCron.js` (for OS-level cron).
//  .env: STOCK_SYNC_ENABLED, STOCK_SYNC_CRON, STOCK_SYNC_COMPANY_CODE
// ============================================================================

import cron from 'node-cron';
import dotenv from 'dotenv';
import { runStockSync } from '../services/stockSyncService.js';

dotenv.config();

const ENABLED      = String(process.env.STOCK_SYNC_ENABLED || 'false').toLowerCase() === 'true';
const SCHEDULE     = process.env.STOCK_SYNC_CRON || '*/15 * * * *';
const COMPANY_CODE = process.env.STOCK_SYNC_COMPANY_CODE || '';

let isRunning = false;

async function doSync(trigger) {
  if (isRunning) { console.log('[stock-sync] previous run still in progress — skipping'); return; }
  isRunning = true;
  const t0 = Date.now();
  try {
    console.log(`[stock-sync] (${trigger}) starting for company_code=${COMPANY_CODE} ...`);
    const r = await runStockSync({ trigger, companyCode: COMPANY_CODE });
    console.log(`[stock-sync] done in ${Date.now() - t0}ms → status=${r.status} source=${r.sourceType} ` +
      `processed=${r.itemsProcessed} created=${r.itemsCreated} updated=${r.itemsUpdated} live=${r.liveStockRows}`);
  } catch (err) {
    console.error('[stock-sync] FAILED:', err.message);
  } finally {
    isRunning = false;
  }
}

export function startStockSyncCron() {
  if (!ENABLED) { console.log('[stock-sync] disabled (set STOCK_SYNC_ENABLED=true to enable)'); return; }
  if (!COMPANY_CODE) { console.warn('[stock-sync] STOCK_SYNC_COMPANY_CODE is empty — cron will not run'); return; }
  if (!cron.validate(SCHEDULE)) { console.error(`[stock-sync] invalid STOCK_SYNC_CRON "${SCHEDULE}"`); return; }
  cron.schedule(SCHEDULE, () => doSync('cron'));
  console.log(`[stock-sync] scheduled "${SCHEDULE}" for company_code=${COMPANY_CODE}`);
}

const isMain = process.argv[1] && process.argv[1].endsWith('syncStockCron.js');
if (isMain) { doSync('cron').then(() => process.exit(0)).catch(() => process.exit(1)); }

export default { startStockSyncCron };
