// routes/items.js
import express from 'express';
import {
  registerItem,
  getAllItems,
  getItemById,
  updateItem,
  deleteItem,
  getItemsByCompany,
  getItemImages,
  deleteItemImage,
} from '../controllers/itemController.js';
import { authenticateToken }  from '../middleware/auth.js';
import { checkPermission }    from '../middleware/permissionMiddleware.js';
import { uploadItemImages }   from '../middleware/uploadItemImages.js';

const router = express.Router();

// ── No-cache headers ──────────────────────────────────────────
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma',  'no-cache');
  res.set('Expires', '0');
  next();
});

router.use(authenticateToken);

// ── Item CRUD ──────────────────────────────────────────────────
// .any() accepts:
//   itemImages                 — legacy item-level images
//   productColorImages_<ci>_<i> — color-specific images (new)
router.post(
  '/register',
  checkPermission('items', 'create'),
  uploadItemImages.any(),
  registerItem,
);

router.get('/',                   checkPermission('items', 'read'),   getAllItems);
router.get('/company/:companyId', checkPermission('items', 'read'),   getItemsByCompany);
router.get('/:id',                checkPermission('items', 'read'),   getItemById);

router.put(
  '/:id',
  checkPermission('items', 'update'),
  uploadItemImages.any(),
  updateItem,
);

router.delete('/:id', checkPermission('items', 'delete'), deleteItem);

// ── Item images sub-resource ───────────────────────────────────
router.get('/:id/images',             checkPermission('items', 'read'),   getItemImages);
router.delete('/:id/images/:imageId', checkPermission('items', 'update'), deleteItemImage);

export default router;