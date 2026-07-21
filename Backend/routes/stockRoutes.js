// Backend/routes/stockRoutes.js
// Add this file to your Express backend and register it in server.js

import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { searchStock } from '../controllers/stockController.js';
import { syncNow, getSyncStatus, getLiveStock } from '../controllers/stockSyncController.js';

const router = express.Router();

// No-cache headers
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// All stock routes require login
router.use(authenticateToken);

/**
 * POST /api/stock/search
 * Body: { company_code, itemgroup?, item?, brand?, branch? }
 * Returns live stock data from PHP API
 */
router.post('/search', searchStock);

/**
 * POST /api/stock/sync          → trigger an immediate sync (PHP API → DB)
 * GET  /api/stock/sync/status   → latest sync log + history
 * GET  /api/stock/live          → read stored live stock from the DB
 */
router.post('/sync', syncNow);
router.get('/sync/status', getSyncStatus);
router.get('/live', getLiveStock);

export default router;