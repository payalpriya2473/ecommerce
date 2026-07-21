import express from 'express';
import {
  registerCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
  getCategoriesByCompany,
} from '../controllers/categoryController.js';
import { authenticateToken } from '../middleware/auth.js';
import { checkPermission } from '../middleware/permissionMiddleware.js';
import { uploadCategoryImages } from '../middleware/uploadCategoryImages.js';

const router = express.Router();

// no-cache on all category routes
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

router.use(authenticateToken);

// multer: accept categoryImage (1)
const upload = uploadCategoryImages.fields([
  { name: 'categoryImage', maxCount: 1 },
]);

router.post('/register',          checkPermission('categories', 'create'), upload, registerCategory);
router.get('/',                   checkPermission('categories', 'read'),   getAllCategories);
router.get('/company/:companyId', checkPermission('categories', 'read'),   getCategoriesByCompany);
router.get('/:id',                checkPermission('categories', 'read'),   getCategoryById);
router.put('/:id',                checkPermission('categories', 'update'), upload, updateCategory);
router.delete('/:id',             checkPermission('categories', 'delete'), deleteCategory);

export default router;
