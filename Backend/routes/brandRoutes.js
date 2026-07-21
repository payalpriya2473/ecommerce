import express from 'express';
import { uploadBrandIcon } from "../middleware/uploadBrandIcon.js";
import {
  registerBrand,
  getAllBrands,
  getBrandById,
  updateBrand,
  deleteBrand,
  getBrandsByCompany,
} from '../controllers/brandController.js';
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

// ✅ multer is included inline — only ONE route per path
router.post('/register',          checkPermission('brands', 'create'), uploadBrandIcon.single("icon"), registerBrand);
router.get('/',                   checkPermission('brands', 'read'),   getAllBrands);
router.get('/company/:companyId', checkPermission('brands', 'read'),   getBrandsByCompany);
router.get('/:id',                checkPermission('brands', 'read'),   getBrandById);
router.put('/:id',                checkPermission('brands', 'update'), uploadBrandIcon.single("icon"), updateBrand);
router.delete('/:id',             checkPermission('brands', 'delete'), deleteBrand);

export default router;