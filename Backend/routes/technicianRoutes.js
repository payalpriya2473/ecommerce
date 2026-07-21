import express from "express";
import {
  registerTechnician,
  getAllTechnicians,
  getTechnicianById,
  updateTechnician,
  deleteTechnician,
  getTechniciansByCompany,
  uploadTechnicianDocument,
  deleteTechnicianDocument,
} from "../controllers/technicianController.js";

import { authenticateToken }     from "../middleware/auth.js";
import { checkPermission }       from "../middleware/permissionMiddleware.js";
import { uploadTechnicianPhoto } from "../middleware/uploadTechnicianPhoto.js";
import { uploadTechnicianDoc }   from "../middleware/uploadTechnicianDoc.js";

const router = express.Router();

router.use(authenticateToken);

// ── 1. Most-specific static routes first ─────────────────────

router.get(
  "/company/:companyId",
  checkPermission("technicians", "read"),
  getTechniciansByCompany
);

router.post(
  "/register",
  checkPermission("technicians", "create"),
  uploadTechnicianPhoto.single("photo"),
  registerTechnician
);

router.get(
  "/",
  checkPermission("technicians", "read"),
  getAllTechnicians
);

// ── 2. Document sub-routes BEFORE /:id wildcard ──────────────

// POST  /technicians/:technicianId/documents
router.post(
  "/:technicianId/documents",
  checkPermission("technicians", "update"),
  uploadTechnicianDoc.single("document"),
  uploadTechnicianDocument
);

// DELETE /technicians/documents/:docId  ← must be before /:id
router.delete(
  "/documents/:docId",
  checkPermission("technicians", "update"),
  deleteTechnicianDocument
);

// ── 3. Generic /:id routes LAST ───────────────────────────────

router.get(
  "/:id",
  checkPermission("technicians", "read"),
  getTechnicianById
);

router.put(
  "/:id",
  checkPermission("technicians", "update"),
  uploadTechnicianPhoto.single("photo"),
  updateTechnician
);

router.delete(
  "/:id",
  checkPermission("technicians", "delete"),
  deleteTechnician
);

export default router;