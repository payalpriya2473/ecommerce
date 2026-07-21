import express from 'express';
import {
  registerDepartment,
  getAllDepartments,
  getDepartmentById,
  updateDepartment,
  deleteDepartment,
} from "../controllers/departmentController.js";
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// All routes protected
router.use(authenticateToken);

router.post('/register', registerDepartment);
router.get('/', getAllDepartments);
router.get('/:id', getDepartmentById);
router.put('/:id', updateDepartment);
router.delete('/:id', deleteDepartment);

export default router;
