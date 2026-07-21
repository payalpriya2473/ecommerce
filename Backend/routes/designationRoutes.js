import express from "express";
import {
  createDesignation,
  getAllDesignations,
  getDesignationById,
  updateDesignation,
  deleteDesignation,
} from "../controllers/designationController.js";

import { authenticateToken } from "../middleware/auth.js";
import { checkPermission } from "../middleware/permissionMiddleware.js";

const router = express.Router();

// Protect all routes
router.use(authenticateToken);

/* ================= CREATE ================= */

// ✅ FIXED: Add both /register and / endpoints for creating designations
router.post(
  "/register",
  checkPermission("designations", "create"),
  createDesignation
);

router.post(
  "/",
  checkPermission("designations", "create"),
  createDesignation
);

/* ================= READ ================= */

// Get all designations (with optional filters)
router.get(
  "/",
  checkPermission("designations", "read"),
  getAllDesignations
);

// Get single designation
router.get(
  "/:id",
  checkPermission("designations", "read"),
  getDesignationById
);

/* ================= UPDATE ================= */

router.put(
  "/:id",
  checkPermission("designations", "update"),
  updateDesignation
);

/* ================= DELETE ================= */

router.delete(
  "/:id",
  checkPermission("designations", "delete"),
  deleteDesignation
);

export default router;