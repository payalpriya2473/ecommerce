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
 * Check if user has required permission
 * @param {string} module - The module name (e.g., 'employees', 'companies')
 * @param {string} action - The action (e.g., 'create', 'read', 'update', 'delete', 'import', 'export')
 */
export const checkPermission = (module, action) => {
  return async (req, res, next) => {
    try {
      const userId = req.user?.userId ?? req.user?.id;
      const userRole = req.user?.role;


      // Super admin has all permissions
      if (userRole === 'super_admin') {
        return next();
      }

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated',
        });
      }

      // Check if user has the required permission through their roles
      const permissionFilter = buildPermissionWhere(module, action);
      const [result] = await db.query(
        `SELECT COUNT(*) as hasPermission
         FROM permissions p
         INNER JOIN role_permissions rp ON p.id = rp.permissionId
         INNER JOIN user_roles ur ON rp.roleId = ur.roleId
         INNER JOIN roles r ON ur.roleId = r.id
         WHERE ur.userId = ? 
         AND ${permissionFilter.clause}
         AND r.isActive = 1`,
        [userId, ...permissionFilter.params]
      );

      
      if (result[0].hasPermission > 0) {
        
        return next();
      }

      return res.status(403).json({
        success: false,
        message: `You don't have permission to ${action} ${module}`,
        requiredPermission: { module, action },
      });
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
 * Get all permissions for the current user
 */
export const getCurrentUserPermissions = async (req, res) => {
  try {
    const userId = req.user?.userId ?? req.user?.id;
    const userRole = req.user?.role;

    

    // Super admin has all permissions
    if (userRole === 'super_admin') {
      
      const [allPermissions] = await db.query(
        'SELECT * FROM permissions ORDER BY module, action'
      );
      return res.json({
        success: true,
        data: allPermissions,
        isSuperAdmin: true,
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
    }

    const [permissions] = await db.query(
      `SELECT DISTINCT p.*
       FROM permissions p
       INNER JOIN role_permissions rp ON p.id = rp.permissionId
       INNER JOIN user_roles ur ON rp.roleId = ur.roleId
       INNER JOIN roles r ON ur.roleId = r.id
       WHERE ur.userId = ? AND r.isActive = 1
       ORDER BY p.module, p.action`,
      [userId]
    );

    

    res.json({
      success: true,
      data: permissions,
      isSuperAdmin: false,
    });
  } catch (error) {
    console.error(' Get current user permissions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch permissions',
      error: error.message,
    });
  }
};

/**
 * Check multiple permissions at once
 */
export const checkMultiplePermissions = async (req, res) => {
  try {
    const userId = req.user?.userId ?? req.user?.id;
    const userRole = req.user?.role;
    const { permissions } = req.body; // Array of {module, action}

    if (!permissions || !Array.isArray(permissions)) {
      return res.status(400).json({
        success: false,
        message: 'permissions must be an array of {module, action} objects',
      });
    }

    // Super admin has all permissions
    if (userRole === 'super_admin') {
      const result = {};
      permissions.forEach(p => {
        const key = `${p.module}:${p.action}`;
        result[key] = true;
      });
      return res.json({
        success: true,
        data: result,
        isSuperAdmin: true,
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
    }

    const result = {};

    for (const perm of permissions) {
      const permissionFilter = buildPermissionWhere(perm.module, perm.action);
      const [check] = await db.query(
        `SELECT COUNT(*) as hasPermission
         FROM permissions p
         INNER JOIN role_permissions rp ON p.id = rp.permissionId
         INNER JOIN user_roles ur ON rp.roleId = ur.roleId
         INNER JOIN roles r ON ur.roleId = r.id
         WHERE ur.userId = ? 
         AND ${permissionFilter.clause}
         AND r.isActive = 1`,
        [userId, ...permissionFilter.params]
      );

      const key = `${perm.module}:${perm.action}`;
      result[key] = check[0].hasPermission > 0;
    }

    res.json({
      success: true,
      data: result,
      isSuperAdmin: false,
    });
  } catch (error) {
    console.error('Check multiple permissions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check permissions',
      error: error.message,
    });
  }
};
