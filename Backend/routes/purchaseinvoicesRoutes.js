import express from 'express';
import {
    createPurchaseInvoice,
    getAllPurchaseInvoices,
    getPurchaseInvoiceById,
    updatePurchaseInvoice,
    deletePurchaseInvoice,
    getPOsBySupplier,
} from '../controllers/purchaseinvoicesController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);  

router.get('/pos-by-supplier/:supplierId', getPOsBySupplier);
router.post("/", createPurchaseInvoice);
router.get('/', getAllPurchaseInvoices);
router.get('/:id', getPurchaseInvoiceById);
router.put("/:id", updatePurchaseInvoice);
router.delete('/:id', deletePurchaseInvoice);

export default router;
