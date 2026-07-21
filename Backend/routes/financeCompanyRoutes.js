import express from 'express';
import {
  registerFinanceCompany,
  getAllFinanceCompanies,
  getFinanceCompanyById,
  updateFinanceCompany,
  deleteFinanceCompany,
  getFinanceCompaniesByCompany,
} from '../controllers/financeCompanyController.js';
import { authenticateToken } from '../middleware/auth.js';
import { checkPermission } from '../middleware/permissionMiddleware.js';

const router = express.Router();

// No-cache headers for all finance-company routes
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

router.use(authenticateToken);

router.post('/register',          checkPermission('finance_companies', 'create'), registerFinanceCompany);
router.get('/',                   checkPermission('finance_companies', 'read'),   getAllFinanceCompanies);
router.get('/company/:companyId', checkPermission('finance_companies', 'read'),   getFinanceCompaniesByCompany);
router.get('/:id',                checkPermission('finance_companies', 'read'),   getFinanceCompanyById);
router.put('/:id',                checkPermission('finance_companies', 'update'), updateFinanceCompany);
router.delete('/:id',             checkPermission('finance_companies', 'delete'), deleteFinanceCompany);

export default router;