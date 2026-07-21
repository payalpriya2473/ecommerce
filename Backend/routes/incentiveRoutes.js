import express from 'express';
import {
  getAllIncentiveLogs,
  getIncentiveLogById,
  getItemDefaults,
  registerIncentiveLog,
  updateIncentiveLog,
  deleteIncentiveLog,
} from '../controllers/incentiveController.js';
import { authenticateToken } from '../middleware/auth.js';
import { checkPermission } from '../middleware/permissionMiddleware.js';

const router = express.Router();

// Disable caching for all incentive routes
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

router.use(authenticateToken);

// ── Incentive Log CRUD ────────────────────────────────────────
router.get('/',                          checkPermission('items', 'read'),   getAllIncentiveLogs);
router.get('/item-defaults/:itemId',     checkPermission('items', 'read'),   getItemDefaults);
router.get('/:id',                       checkPermission('items', 'read'),   getIncentiveLogById);
router.post('/register',                 checkPermission('items', 'create'), registerIncentiveLog);
router.put('/:id',                       checkPermission('items', 'update'), updateIncentiveLog);
router.delete('/:id',                    checkPermission('items', 'delete'), deleteIncentiveLog);

export default router;