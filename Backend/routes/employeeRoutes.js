import express from "express"
import {
  registerEmployee,
  getAllEmployees,
  getEmployeeById,
  updateEmployee,
  deleteEmployee,
  getEmployeesByCompany,
  getEmployeesByDepartment,
  updateUserPassword,
} from "../controllers/employeeController.js"

import { authenticateToken } from "../middleware/auth.js"
import { checkPermission } from "../middleware/permissionMiddleware.js"
import { uploadEmployeePhoto } from "../middleware/uploadEmployeePhoto.js"

const router = express.Router()

//  Protect all routes
router.use(authenticateToken)

/* =========================================================
  IMPORTANT: Specific routes MUST come before /:id
========================================================= */

/* ================= PASSWORD ================= */

// Update own password OR employee password
router.put(
  "/user/update-password",
  checkPermission("employees", "update"), 
  updateUserPassword
)

/* ================= FILTER ROUTES ================= */

// Get employees by company
router.get(
  "/company/:companyId",
  checkPermission("employees", "read"),
  getEmployeesByCompany
)

// Get employees by department
router.get(
  "/department/:departmentId",
  checkPermission("employees", "read"),
  getEmployeesByDepartment
)

/* ================= CREATE ================= */

router.post(
  "/register",
  checkPermission("employees", "create"),
  uploadEmployeePhoto.single("photo"),
  registerEmployee
)

/* ================= READ ================= */

// Get all employees
router.get(
  "/",
  checkPermission("employees", "read"),
  getAllEmployees
)

// Get single employee
router.get(
  "/:id",
  checkPermission("employees", "read"),
  getEmployeeById
)

/* ================= UPDATE ================= */

router.put(
  "/:id",
  checkPermission("employees", "update"),
  uploadEmployeePhoto.single("photo"),
  updateEmployee
)

/* ================= DELETE ================= */

router.delete(
  "/:id",
  checkPermission("employees", "delete"),
  deleteEmployee
)

export default router
