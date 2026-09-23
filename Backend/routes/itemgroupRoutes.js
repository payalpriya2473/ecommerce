import express from 'express';
import {
  registerItemGroup,
  getAllItemGroups,
  getItemGroupById,
  updateItemGroup,
  deleteItemGroup,
} from '../controllers/itemgroupController.js';
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

router.post('/register',          checkPermission('item_groups', 'create'), registerItemGroup);
router.get('/',                   checkPermission('item_groups', 'read'),   getAllItemGroups);
router.get('/:id',                checkPermission('item_groups', 'read'),   getItemGroupById);
router.put('/:id',                checkPermission('item_groups', 'update'), updateItemGroup);
router.delete('/:id',             checkPermission('item_groups', 'delete'), deleteItemGroup);

export default router;