import express from 'express';
import {
  registerCompany,
  getAllCompanies,
  getCompanyById,
  updateCompany,
  toggleCompanyStatus,
  deleteCompany,
  hardDeleteCompany
} from '../controllers/companyController.js';
import { authenticateToken } from '../middleware/auth.js';
import { uploadCompanyLogo } from '../middleware/uploadCompanyLogo.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Company routes
router.post('/register', uploadCompanyLogo.single('logo'), registerCompany);
router.get('/', getAllCompanies);
router.get('/:id', getCompanyById);
router.put('/:id', uploadCompanyLogo.single('logo'), updateCompany);
router.patch('/:id/toggle-status', toggleCompanyStatus);
router.delete('/:id', deleteCompany);
router.delete('/:id/hard-delete', hardDeleteCompany);

export default router;