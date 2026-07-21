// routes/emailConfigRoutes.js
import express from 'express';
import { getEmailConfig, saveEmailConfig, testEmailConfig } from '../controllers/emailConfigController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/',     getEmailConfig);    // GET  /api/settings/email
router.put('/',     saveEmailConfig);   // PUT  /api/settings/email
router.post('/test', testEmailConfig);  // POST /api/settings/email/test

export default router;