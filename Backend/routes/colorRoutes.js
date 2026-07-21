import express from 'express';
import {
  registerColor,
  getAllColors,
  getColorById,
  updateColor,
  deleteColor,
  getColorsByBrand,
} from '../controllers/colorController.js';
import { authenticateToken } from '../middleware/auth.js';
import { checkPermission } from '../middleware/permissionMiddleware.js';

const router = express.Router();

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

router.use(authenticateToken);

router.post('/register',           checkPermission('colors', 'create'), registerColor);
router.get('/',                    checkPermission('colors', 'read'),   getAllColors);
router.get('/brand/:brandId',      checkPermission('colors', 'read'),   getColorsByBrand);
router.get('/:id',                 checkPermission('colors', 'read'),   getColorById);
router.put('/:id',                 checkPermission('colors', 'update'), updateColor);
router.delete('/:id',              checkPermission('colors', 'delete'), deleteColor);

export default router;