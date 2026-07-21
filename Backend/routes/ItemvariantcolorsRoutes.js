// routes/itemVariantRoutes.js
import express from 'express';
import {
  getItemVariants,
  upsertItemVariants,
  deleteItemVariant,
  deleteItemVariantColor,
  uploadVariantImages,
} from '../controllers/itemVariantController.js';
import { authenticate } from '../middleware/auth.js'; // your existing auth middleware

const router = express.Router();

// GET /api/item-variants?itemName=&companyId=&itemGroupId=&brandId=
router.get('/', authenticate, getItemVariants);

// POST /api/item-variants  (multipart/form-data)
router.post('/', authenticate, uploadVariantImages, upsertItemVariants);

// DELETE /api/item-variants/:id
router.delete('/:id', authenticate, deleteItemVariant);

// DELETE /api/item-variants/colors/:id
router.delete('/colors/:id', authenticate, deleteItemVariantColor);

export default router;