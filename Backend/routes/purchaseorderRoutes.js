import express from 'express';
import {
  createPurchaseOrder,
  getAllPurchaseOrders,
  getPurchaseOrderById,
  updatePurchaseOrder,
  deletePurchaseOrder,
  getNextPONumber,
  getPendingQtyByGroup,
} from '../controllers/purchaseordercontroller.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/next-number', getNextPONumber);
router.get('/pending-qty-by-group', getPendingQtyByGroup); 
router.post('/', createPurchaseOrder);
router.get('/', getAllPurchaseOrders);
router.get('/:id', getPurchaseOrderById);
router.put('/:id', updatePurchaseOrder);
router.delete('/:id', deletePurchaseOrder);

export default router;
