import express from 'express';
import {
  getAllOffers,
  getOfferById,
  registerOffer,
  updateOffer,
  deleteOffer,
} from '../controllers/offerController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

router.use(authenticateToken);

router.get('/', getAllOffers);
router.get('/:id', getOfferById);
router.post('/register', registerOffer);
router.put('/:id', updateOffer);
router.delete('/:id', deleteOffer);

export default router;
