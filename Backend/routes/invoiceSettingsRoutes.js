// routes/invoiceSettingsRoutes.js
import express from 'express';
import { getInvoiceSettings, saveInvoiceSettings } from '../controllers/invoiceSettingsController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/', getInvoiceSettings);    // GET  /api/settings/invoice
router.put('/', saveInvoiceSettings);   // PUT  /api/settings/invoice

export default router;