import express from "express"
import {
  getAllPermissions,
  getAllRoles,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
  getUserRoles,
  assignUserRoles,
  getUserPermissions,
  checkUserPermission,
  getUsersWithRoles,
} from "../controllers/rbacController.js"

import {
  getCurrentUserPermissions,
  checkMultiplePermissions,
  checkPermission,
} from "../middleware/permissionMiddleware.js"

import { authenticateToken } from "../middleware/auth.js"

const router = express.Router()

// All routes require authentication
router.use(authenticateToken)

/* ======================================================
   PERMISSIONS ROUTES
====================================================== */

// Current logged-in user permissions
router.get("/permissions/me", getCurrentUserPermissions)

// Check multiple permissions at once
router.post("/permissions/check-multiple", checkMultiplePermissions)

// Get all permissions (Only RBAC managers)
router.get(
  "/permissions",
  checkPermission("rbac", "read"),
  getAllPermissions
)

/* ======================================================
   ROLES ROUTES
====================================================== */

// Get all roles
router.get(
  "/roles",
  checkPermission("rbac", "read"),
  getAllRoles
)

// Create role
router.post(
  "/roles",
  checkPermission("rbac", "create"),
  createRole
)

// Get single role
router.get(
  "/roles/:id",
  checkPermission("rbac", "read"),
  getRoleById
)

// Update role
router.put(
  "/roles/:id",
  checkPermission("rbac", "update"),
  updateRole
)

// Delete role
router.delete(
  "/roles/:id",
  checkPermission("rbac", "delete"),
  deleteRole
)

/* ======================================================
   USER ROLES ROUTES
====================================================== */

// Get users with roles
router.get(
  "/users-with-roles",
  checkPermission("rbac", "read"),
  getUsersWithRoles
)

// Get roles of specific user
router.get(
  "/users/:userId/roles",
  checkPermission("rbac", "read"),
  getUserRoles
)

// Assign roles to user
router.post(
  "/users/:userId/roles",
  checkPermission("rbac", "update"),
  assignUserRoles
)

/* ======================================================
   USER PERMISSIONS ROUTES
====================================================== */

// Get specific user permissions
router.get(
  "/users/:userId/permissions",
  checkPermission("rbac", "read"),
  getUserPermissions
)

// Check specific permission for a user
router.get(
  "/users/:userId/permissions/:module/:action",
  checkPermission("rbac", "read"),
  checkUserPermission
)

export default router