import express from 'express';
import {
  createSalesInvoice,
  getAllSalesInvoices,
  getSalesInvoiceById,
  updateSalesInvoice,
  deleteSalesInvoice,
  lookupSerial,
} from '../controllers/salesInvoiceController.js';
import { authenticateToken } from '../middleware/auth.js';
import { getNextSINumber } from '../controllers/invoiceSettingsController.js';

const router = express.Router();

router.use(authenticateToken);

// Serial lookup — must come BEFORE /:id to avoid route collision
router.get('/lookup-serial/:serialNo', lookupSerial);

router.post('/',     createSalesInvoice);
router.get('/',      getAllSalesInvoices);
router.get('/:id',   getSalesInvoiceById);
router.put('/:id',   updateSalesInvoice);
router.delete('/:id', deleteSalesInvoice);
router.get('/next-number', authenticateToken, getNextSINumber);

export default router;