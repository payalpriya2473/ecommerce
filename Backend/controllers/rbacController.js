import { db } from '../config/db.js';

export const getAllPermissions = async (req, res) => {
  try {
    const [permissions] = await db.query('SELECT * FROM permissions ORDER BY module, action');
    res.json({ success: true, data: permissions });
  } catch (error) {
    console.error('Get permissions error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch permissions', error: error.message });
  }
};

export const getAllRoles = async (req, res) => {
  try {
    const { companyId } = req.query;
    const userRole      = req.user?.role;
    const userCompanyId = req.user?.companyId;

    let query = `
      SELECT r.*, COUNT(DISTINCT rp.permissionId) as permissionCount
        FROM roles r
        LEFT JOIN role_permissions rp ON r.id = rp.roleId
       WHERE r.isActive = 1
    `;
    const params = [];

    if (companyId) {
      query += ' AND (r.companyId = ? OR r.isSystemRole = 1)';
      params.push(companyId);
    } else if (userRole !== 'super_admin') {
      query += ' AND (r.companyId = ? OR r.isSystemRole = 1)';
      params.push(userCompanyId);
    }
    query += ' GROUP BY r.id ORDER BY r.isSystemRole DESC, r.name ASC';

    const [roles] = await db.query(query, params);
    res.json({ success: true, data: roles });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch roles', error: error.message });
  }
};

export const getRoleById = async (req, res) => {
  try {
    const { id } = req.params;
    const [roles] = await db.query('SELECT * FROM roles WHERE id = ? AND isActive = 1', [id]);
    if (roles.length === 0) return res.status(404).json({ success: false, message: 'Role not found' });

    const [permissions] = await db.query(
      `SELECT p.* FROM permissions p
       INNER JOIN role_permissions rp ON p.id = rp.permissionId
       WHERE rp.roleId = ?`,
      [id]
    );

    res.json({
      success: true,
      data: {
        ...roles[0],
        permissions:       permissions.map((p) => p.id),
        permissionDetails: permissions,
      },
    });
  } catch (error) {
    console.error('Get role error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch role', error: error.message });
  }
};

// ─── OPTIMIZED: createRole ────────────────────────────────────────────────────
// BEFORE: 1 INSERT per permission in a loop  → N round-trips
// AFTER : single bulk INSERT VALUES ?        → 1 round-trip
export const createRole = async (req, res) => {
  try {
    const { name, description, permissions } = req.body;
    const userCompanyId = req.user?.companyId;

    if (!name || !permissions || permissions.length === 0) {
      return res.status(400).json({ success: false, message: 'Role name and at least one permission are required' });
    }

    const [roleResult] = await db.query(
      `INSERT INTO roles (companyId, name, description, isSystemRole, isActive) VALUES (?, ?, ?, 0, 1)`,
      [userCompanyId, name, description || null]
    );
    const roleId = roleResult.insertId;

    // Bulk insert all permissions in one query
    const permRows = permissions.map((permissionId) => [roleId, permissionId]);
    await db.query(
      `INSERT IGNORE INTO role_permissions (roleId, permissionId) VALUES ?`,
      [permRows]
    );

    const [newRole] = await db.query(
      `SELECT r.*, COUNT(rp.permissionId) as permissionCount
         FROM roles r
         LEFT JOIN role_permissions rp ON r.id = rp.roleId
        WHERE r.id = ? GROUP BY r.id`,
      [roleId]
    );

    res.status(201).json({ success: true, message: 'Role created successfully', data: newRole[0] });
  } catch (error) {
    console.error('Create role error:', error);
    res.status(500).json({ success: false, message: 'Failed to create role', error: error.message });
  }
};

// ─── OPTIMIZED: updateRole ────────────────────────────────────────────────────
// BEFORE: 1 INSERT per permission in a loop  → N round-trips
// AFTER : single bulk INSERT VALUES ?        → 1 round-trip
export const updateRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, permissions } = req.body;

    const [existingRole] = await db.query('SELECT * FROM roles WHERE id = ? AND isActive = 1', [id]);
    if (existingRole.length === 0) return res.status(404).json({ success: false, message: 'Role not found' });
    if (existingRole[0].isSystemRole) return res.status(403).json({ success: false, message: 'System roles cannot be modified' });

    await db.query(
      `UPDATE roles SET name = ?, description = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      [name, description || null, id]
    );

    if (Array.isArray(permissions) && permissions.length > 0) {
      await db.query('DELETE FROM role_permissions WHERE roleId = ?', [id]);
      // Bulk insert replacement permissions
      const permRows = permissions.map((permissionId) => [id, permissionId]);
      await db.query(
        `INSERT IGNORE INTO role_permissions (roleId, permissionId) VALUES ?`,
        [permRows]
      );
    }

    const [updatedRole] = await db.query(
      `SELECT r.*, COUNT(rp.permissionId) as permissionCount
         FROM roles r
         LEFT JOIN role_permissions rp ON r.id = rp.roleId
        WHERE r.id = ? GROUP BY r.id`,
      [id]
    );

    res.json({ success: true, message: 'Role updated successfully', data: updatedRole[0] });
  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({ success: false, message: 'Failed to update role', error: error.message });
  }
};

export const deleteRole = async (req, res) => {
  try {
    const { id } = req.params;
    const [existingRole] = await db.query('SELECT * FROM roles WHERE id = ?', [id]);
    if (existingRole.length === 0) return res.status(404).json({ success: false, message: 'Role not found' });

    const [userRoles] = await db.query('SELECT COUNT(*) as count FROM user_roles WHERE roleId = ?', [id]);
    if (userRoles[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete role: It is assigned to ${userRoles[0].count} user(s). Please remove the role from all users first.`,
      });
    }

    const [designations] = await db.query(
      `SELECT COUNT(*) as count FROM designations WHERE JSON_CONTAINS(roleIds, ?)`,
      [`"${id}"`]
    );
    if (designations[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete role: It is assigned to ${designations[0].count} designation(s).`,
      });
    }

    await db.query('DELETE FROM role_permissions WHERE roleId = ?', [id]);
    await db.query('DELETE FROM roles WHERE id = ?', [id]);

    res.json({ success: true, message: 'Role deleted successfully' });
  } catch (error) {
    console.error('Delete role error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete role', error: error.message });
  }
};

export const getUserRoles = async (req, res) => {
  try {
    const { userId } = req.params;
    const [userRoles] = await db.query(
      `SELECT ur.*, r.name as roleName, r.description as roleDescription,
              u.email as assignedByEmail
         FROM user_roles ur
         INNER JOIN roles r ON ur.roleId = r.id
         LEFT JOIN users u ON ur.assignedBy = u.id
        WHERE ur.userId = ? AND r.isActive = 1
        ORDER BY ur.assignedAt DESC`,
      [userId]
    );
    res.json({ success: true, data: userRoles });
  } catch (error) {
    console.error('Get user roles error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch user roles', error: error.message });
  }
};

// ─── OPTIMIZED: assignUserRoles ───────────────────────────────────────────────
// BEFORE: 1 INSERT per roleId in a loop  → N round-trips
// AFTER : single bulk INSERT VALUES ?    → 1 round-trip
export const assignUserRoles = async (req, res) => {
  try {
    const { userId }  = req.params;
    const { roleIds } = req.body;
    const assignedBy  = req.user?.id;

    if (!roleIds || !Array.isArray(roleIds)) {
      return res.status(400).json({ success: false, message: 'roleIds must be an array' });
    }

    const [user] = await db.query('SELECT id FROM users WHERE id = ?', [userId]);
    if (user.length === 0) return res.status(404).json({ success: false, message: 'User not found' });

    await db.query('DELETE FROM user_roles WHERE userId = ?', [userId]);

    if (roleIds.length > 0) {
      // Bulk insert all roles in one query
      const roleRows = roleIds.map((roleId) => [userId, roleId, assignedBy]);
      await db.query(
        `INSERT IGNORE INTO user_roles (userId, roleId, assignedBy) VALUES ?`,
        [roleRows]
      );
    }

    const [updatedUserRoles] = await db.query(
      `SELECT ur.*, r.name as roleName, r.description as roleDescription
         FROM user_roles ur
         INNER JOIN roles r ON ur.roleId = r.id
        WHERE ur.userId = ? AND r.isActive = 1`,
      [userId]
    );

    res.json({ success: true, message: 'User roles updated successfully', data: updatedUserRoles });
  } catch (error) {
    console.error('Assign user roles error:', error);
    res.status(500).json({ success: false, message: 'Failed to assign user roles', error: error.message });
  }
};

export const getUserPermissions = async (req, res) => {
  try {
    const { userId } = req.params;
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
    res.json({ success: true, data: permissions });
  } catch (error) {
    console.error('Get user permissions error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch user permissions', error: error.message });
  }
};

export const checkUserPermission = async (req, res) => {
  try {
    const { userId, module, action } = req.params;
    const [result] = await db.query(
      `SELECT COUNT(*) as hasPermission
         FROM permissions p
         INNER JOIN role_permissions rp ON p.id = rp.permissionId
         INNER JOIN user_roles ur ON rp.roleId = ur.roleId
         INNER JOIN roles r ON ur.roleId = r.id
        WHERE ur.userId = ? AND p.module = ? AND p.action = ? AND r.isActive = 1`,
      [userId, module, action]
    );
    res.json({ success: true, hasPermission: result[0].hasPermission > 0 });
  } catch (error) {
    console.error('Check user permission error:', error);
    res.status(500).json({ success: false, message: 'Failed to check user permission', error: error.message });
  }
};

export const getUsersWithRoles = async (req, res) => {
  try {
    const userCompanyId = req.user?.companyId;
    const userRole      = req.user?.role;

    let query = `
      SELECT u.id, u.email, u.companyId, u.role as legacyRole, u.isActive,
             e.name as employeeName, e.employeeNo,
             GROUP_CONCAT(DISTINCT r.name  ORDER BY r.name SEPARATOR ', ') as roleNames,
             GROUP_CONCAT(DISTINCT r.id    ORDER BY r.name SEPARATOR ',') as roleIds
        FROM users u
        LEFT JOIN employees  e  ON u.id       = e.userId
        LEFT JOIN user_roles ur ON u.id       = ur.userId
        LEFT JOIN roles      r  ON ur.roleId  = r.id AND r.isActive = 1
    `;
    const params = [];
    if (userRole !== 'super_admin') { query += ' WHERE u.companyId = ?'; params.push(userCompanyId); }
    query += ' GROUP BY u.id ORDER BY u.createdAt DESC';

    const [users] = await db.query(query, params);
    res.json({ success: true, data: users });
  } catch (error) {
    console.error('Get users with roles error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch users with roles', error: error.message });
  }
};
