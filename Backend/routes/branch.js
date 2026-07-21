import express from 'express';
import {
  registerBranch,
  getAllBranches,
  getBranchById,
  updateBranch,
  deleteBranch,
  getBranchesByCompany,
} from '../controllers/branchController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Branch routes
router.post('/register', registerBranch);
router.get('/', getAllBranches);
router.get('/company/:companyId', getBranchesByCompany);
router.get('/:id', getBranchById);
router.put('/:id', updateBranch);
router.delete('/:id', deleteBranch);

export default router;
