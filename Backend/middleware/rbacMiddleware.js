import { db } from '../config/db.js';

const MODULE_ALIASES = {
  rbac: ['roles'],
  roles: ['rbac'],
  settings: ['invoice_settings'],
  invoice_settings: ['settings'],
  sales_invoices: ['sales'],
  sales: ['sales_invoices'],
  item_master: ['items'],
  items: ['item_master'],
};

const ACTION_ALIASES = {
  read: ['view'],
  view: ['read'],
  update: ['edit'],
  edit: ['update'],
};

const getCandidates = (value, aliases) => {
  const normalized = String(value || '').trim().toLowerCase();
  return Array.from(new Set([normalized, ...(aliases[normalized] || [])]));
};

const buildPermissionWhere = (module, action) => {
  const modules = getCandidates(module, MODULE_ALIASES);
  const actions = getCandidates(action, ACTION_ALIASES);
  const modulePlaceholders = modules.map(() => '?').join(', ');
  const actionPlaceholders = actions.map(() => '?').join(', ');

  return {
    clause: `p.module IN (${modulePlaceholders}) AND p.action IN (${actionPlaceholders})`,
    params: [...modules, ...actions],
  };
};

/**
 * Middleware to check if user has required permission
 * Usage: requirePermission('employees', 'create')
 */
export const requirePermission = (module, action) => {
  return async (req, res, next) => {
    try {
      const userId = req.user?.userId ?? req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
      }

      // Check if user has the required permission
      const permissionFilter = buildPermissionWhere(module, action);
      const [result] = await db.query(
        `SELECT COUNT(*) as hasPermission
         FROM permissions p
         INNER JOIN role_permissions rp ON p.id = rp.permissionId
         INNER JOIN user_roles ur ON rp.roleId = ur.roleId
         WHERE ur.userId = ? AND ${permissionFilter.clause}`,
        [userId, ...permissionFilter.params]
      );

      if (result[0].hasPermission === 0) {
        return res.status(403).json({
          success: false,
          message: `Permission denied: You don't have ${action} access to ${module}`,
        });
      }

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error checking permissions',
        error: error.message,
      });
    }
  };
};

/**
 * Middleware to check if user has ANY of the required permissions
 * Usage: requireAnyPermission([{module: 'employees', action: 'read'}, {module: 'employees', action: 'update'}])
 */ 
export const requireAnyPermission = (permissions) => {
  return async (req, res, next) => {
    try {
      const userId = req.user?.userId ?? req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
      }

      // Build query to check if user has ANY of the permissions
      const filters = permissions.map((perm) => buildPermissionWhere(perm.module, perm.action));
      const conditions = filters.map((filter) => `(${filter.clause})`).join(' OR ');
      const params = [userId];
      filters.forEach((filter) => {
        params.push(...filter.params);
      });

      const [result] = await db.query(
        `SELECT COUNT(*) as hasPermission
         FROM permissions p
         INNER JOIN role_permissions rp ON p.id = rp.permissionId
         INNER JOIN user_roles ur ON rp.roleId = ur.roleId
         WHERE ur.userId = ? AND (${conditions})`,
        params
      );

      if (result[0].hasPermission === 0) {
        return res.status(403).json({
          success: false,
          message: 'Permission denied: You don\'t have the required permissions',
        });
      }

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error checking permissions',
        error: error.message,
      });
    }
  };
};

/**
 * Middleware to check if user has ALL of the required permissions
 * Usage: requireAllPermissions([{module: 'employees', action: 'read'}, {module: 'employees', action: 'update'}])
 */
export const requireAllPermissions = (permissions) => {
  return async (req, res, next) => {
    try {
      const userId = req.user?.userId ?? req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
      }

      // Check each permission
      for (const perm of permissions) {
        const permissionFilter = buildPermissionWhere(perm.module, perm.action);
        const [result] = await db.query(
          `SELECT COUNT(*) as hasPermission
           FROM permissions p
           INNER JOIN role_permissions rp ON p.id = rp.permissionId
           INNER JOIN user_roles ur ON rp.roleId = ur.roleId
           WHERE ur.userId = ? AND ${permissionFilter.clause}`,
          [userId, ...permissionFilter.params]
        );

        if (result[0].hasPermission === 0) {
          return res.status(403).json({
            success: false,
            message: `Permission denied: You don't have ${perm.action} access to ${perm.module}`,
          });
        }
      }

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error checking permissions',
        error: error.message,
      });
    }
  };
};

/**
 * Helper function to get all user permissions (can be used in other middleware)
 */
export const getUserPermissions = async (userId) => {
  try {
    const [permissions] = await db.query(
      `SELECT DISTINCT p.module, p.action
       FROM permissions p
       INNER JOIN role_permissions rp ON p.id = rp.permissionId
       INNER JOIN user_roles ur ON rp.roleId = ur.roleId
       WHERE ur.userId = ?`,
      [userId]
    );

    return permissions;
  } catch (error) {
    console.error('Get user permissions error:', error);
    return [];
  }
};  
