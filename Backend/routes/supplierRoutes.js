import express from 'express';
import {
  registerSupplier,
  getAllSuppliers,
  getSupplierById,
  updateSupplier,
  toggleSupplierStatus,
  deleteSupplier,
  hardDeleteSupplier
} from '../controllers/supplierController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Supplier routes
router.post('/register', registerSupplier);
router.get('/', getAllSuppliers);
router.get('/:id', getSupplierById);
router.put('/:id', updateSupplier);
router.patch('/:id/toggle-status', toggleSupplierStatus);
router.delete('/:id', deleteSupplier);  // Soft delete
router.delete('/:id/hard-delete', hardDeleteSupplier);  // Hard delete

export default router;