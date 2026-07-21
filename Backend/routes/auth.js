import express from 'express';
import { 
  login, 
  getCompanies, 
  verifyToken, 
  getUserProfile,
  logout 
} from '../controllers/authController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Public routes (no authentication required)
router.post('/login', login);
router.get('/companies', getCompanies);
router.get('/verify', verifyToken);

// Protected routes (authentication required)
router.get('/profile', authenticateToken, getUserProfile);
router.post('/logout', authenticateToken, logout);

export default router;