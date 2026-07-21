import { db } from "../config/db.js";
import bcrypt from "bcryptjs";

const generateRandomPassword = (length = 12) => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()";
  let password = "";
  for (let i = 0; i < length; i++) password += chars.charAt(Math.floor(Math.random() * chars.length));
  return password;
};

const assignRolesFromDesignation = async (connection, userId, designationId) => {
  try {
    const [designation] = await connection.query('SELECT roleIds FROM designations WHERE id = ?', [designationId]);
    if (designation.length === 0 || !designation[0].roleIds) return [];

    let roleIds = [];
    try { roleIds = JSON.parse(designation[0].roleIds); } catch { return []; }
    if (!Array.isArray(roleIds) || roleIds.length === 0) return [];

    for (const roleId of roleIds) {
      // ✅ FIX: No manual ID for user_roles — AUTO_INCREMENT
      await connection.execute(
        `INSERT INTO user_roles (userId, roleId, assignedBy) VALUES (?, ?, ?)`,
        [userId, roleId, userId]
      );
    }
    return roleIds;
  } catch (error) {
    console.error('Error assigning roles from designation:', error);
    return [];
  }
};

export const registerEmployee = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const photoUrl = req.file ? `/uploads/employees/${req.file.filename}` : null;
    const {
      employeeNo, companyId, departmentId, designationId, name, gender, mobile, email,
      joiningDate, panNo, uidNo, weeklyOff, inTime, outTime, graceMinutes,
      basicSalary, spa, hra, conveyance, medical, bankName, bankBranch,
      accountNo, ifscCode, pfNo, esiNo,
    } = req.body;

    let userId = null;
    let plainPassword = null;
    let assignedRoles = [];

    if (email) {
      plainPassword = generateRandomPassword(12);
      const hashedPassword = await bcrypt.hash(plainPassword, 10);

      // ✅ FIX: No manual ID for users — AUTO_INCREMENT
      const [userResult] = await connection.execute(
        `INSERT INTO users (email, password, companyId, role, isActive, createdAt) VALUES (?, ?, ?, 'employee', 1, NOW())`,
        [email, hashedPassword, companyId]
      );
      userId = userResult.insertId;

      if (designationId) {
        assignedRoles = await assignRolesFromDesignation(connection, userId, designationId);
      }
    }

    // ✅ FIX: No manual ID for employees — AUTO_INCREMENT
    const [empResult] = await connection.execute(
      `INSERT INTO employees
      (userId, employeeNo, companyId, departmentId, designationId,
       name, gender, mobile, email, joiningDate, photoUrl,
       panNo, uidNo, weeklyOff, inTime, outTime, graceMinutes,
       basicSalary, spa, hra, conveyance, medical,
       bankName, bankBranch, accountNo, ifscCode, pfNo, esiNo, isActive)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        userId, employeeNo, companyId, departmentId || null, designationId || null,
        name, gender, mobile, email || null, joiningDate || null, photoUrl,
        panNo || null, uidNo || null, weeklyOff || null, inTime || null, outTime || null,
        graceMinutes || null, basicSalary || null, spa || null, hra || null,
        conveyance || null, medical || null, bankName || null, bankBranch || null,
        accountNo || null, ifscCode || null, pfNo || null, esiNo || null,
      ]
    );

    await connection.commit();

    res.status(201).json({
      success: true,
      data: { employeeId: empResult.insertId, userId, photoUrl, assignedRoles, plainPassword: plainPassword || null },
      message: "Employee, user, and roles created successfully",
    });
  } catch (err) {
    await connection.rollback();
    console.error("Employee registration failed:", err);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    connection.release();
  }
};

export const getAllEmployees = async (req, res) => {
  try {
    const {
      companyId,
      departmentId,
      status,
      search,
      page,
      limit,
      sortKey,
      sortDirection,
    } = req.query;

    const pageNumber = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.max(1, parseInt(limit, 10) || 25);
    const paginationEnabled = Number.isFinite(parseInt(page, 10)) && Number.isFinite(parseInt(limit, 10));

    const sortFieldMap = {
      employeeNo: 'e.employeeNo',
      name: 'e.name',
      department: 'd.name',
      designation: 'desg.name',
      contact: 'e.email',
      status: 'e.isActive',
      createdAt: 'e.createdAt',
    };
    const resolvedSortField = sortFieldMap[sortKey] || 'e.name';
    const resolvedSortDirection = String(sortDirection || '').toLowerCase() === 'desc'
      ? 'DESC'
      : 'ASC';

    const baseFrom = `
      FROM employees e
      LEFT JOIN users u ON e.userId = u.id
      LEFT JOIN departments d ON e.departmentId = d.id
      LEFT JOIN designations desg ON e.designationId = desg.id
      LEFT JOIN user_roles ur ON u.id = ur.userId
      LEFT JOIN roles r ON ur.roleId = r.id AND r.isActive = 1
    `;
    const whereClauses = [];
    const params = [];

    // Status filter: active/inactive. Default to active only (preserves prior behavior).
    const normalizedStatus = String(status || '').trim().toLowerCase();
    if (normalizedStatus === 'active') {
      whereClauses.push('e.isActive = 1');
    } else if (normalizedStatus === 'inactive') {
      whereClauses.push('e.isActive = 0');
    } else if (normalizedStatus === 'all') {
      // no status filter
    } else {
      whereClauses.push('e.isActive = 1');
    }

    if (companyId) {
      whereClauses.push('e.companyId = ?');
      params.push(companyId);
    }
    if (departmentId) {
      whereClauses.push('e.departmentId = ?');
      params.push(departmentId);
    }
    if (search) {
      const term = `%${search}%`;
      whereClauses.push(`(
        e.name LIKE ? OR
        COALESCE(e.employeeNo, '') LIKE ? OR
        COALESCE(e.email, '') LIKE ? OR
        COALESCE(e.mobile, '') LIKE ?
      )`);
      params.push(term, term, term, term);
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const orderSql = `ORDER BY ${resolvedSortField} ${resolvedSortDirection}`;

    let query = `
      SELECT e.*, u.id as userId, u.email as userEmail,
        d.name as departmentName, desg.name as designationName,
        desg.roleIds as designationRoleIds,
        GROUP_CONCAT(DISTINCT r.name ORDER BY r.name SEPARATOR ', ') as roleNames,
        GROUP_CONCAT(DISTINCT r.id ORDER BY r.name SEPARATOR ',') as assignedRoleIds
      ${baseFrom}
      ${whereSql}
      GROUP BY e.id, u.id, d.id, desg.id
      ${orderSql}
    `;

    let totalItems = null;
    if (paginationEnabled) {
      const [countRows] = await db.query(
        `SELECT COUNT(DISTINCT e.id) AS total ${baseFrom} ${whereSql}`,
        params
      );
      totalItems = Number(countRows?.[0]?.total || 0);
      query += ' LIMIT ? OFFSET ?';
      params.push(pageSize, (pageNumber - 1) * pageSize);
    }

    const [rows] = await db.query(query, params);

    const payload = { success: true, data: rows };
    if (paginationEnabled) {
      payload.pagination = {
        page: pageNumber,
        limit: pageSize,
        totalItems,
        totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
      };
    }

    res.json(payload);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch employees', error: error.message });
  }
};

export const getEmployeeById = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT e.*, u.id as userId, u.email as userEmail,
        d.name as departmentName, desg.name as designationName,
        desg.roleIds as designationRoleIds,
        GROUP_CONCAT(DISTINCT r.id) as userRoleIds,
        GROUP_CONCAT(DISTINCT r.name ORDER BY r.name SEPARATOR ', ') as roleNames
      FROM employees e
      LEFT JOIN users u ON e.userId = u.id
      LEFT JOIN departments d ON e.departmentId = d.id
      LEFT JOIN designations desg ON e.designationId = desg.id
      LEFT JOIN user_roles ur ON u.id = ur.userId
      LEFT JOIN roles r ON ur.roleId = r.id AND r.isActive = 1
      WHERE e.id = ?
      GROUP BY e.id, u.id, d.id, desg.id`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Employee not found" });
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch employee', error: error.message });
  }
};

export const getEmployeesByCompany = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT e.*, u.id as userId, d.name as departmentName, desg.name as designationName,
        GROUP_CONCAT(DISTINCT r.name ORDER BY r.name SEPARATOR ', ') as roleNames
      FROM employees e
      LEFT JOIN users u ON e.userId = u.id
      LEFT JOIN departments d ON e.departmentId = d.id
      LEFT JOIN designations desg ON e.designationId = desg.id
      LEFT JOIN user_roles ur ON u.id = ur.userId
      LEFT JOIN roles r ON ur.roleId = r.id AND r.isActive = 1
      WHERE e.companyId = ?
      GROUP BY e.id`,
      [req.params.companyId]
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch employees', error: error.message });
  }
};

export const getEmployeesByDepartment = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT e.*, u.id as userId, desg.name as designationName,
        GROUP_CONCAT(DISTINCT r.name ORDER BY r.name SEPARATOR ', ') as roleNames
      FROM employees e
      LEFT JOIN users u ON e.userId = u.id
      LEFT JOIN designations desg ON e.designationId = desg.id
      LEFT JOIN user_roles ur ON u.id = ur.userId
      LEFT JOIN roles r ON ur.roleId = r.id AND r.isActive = 1
      WHERE e.departmentId = ?
      GROUP BY e.id`,
      [req.params.departmentId]
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch employees', error: error.message });
  }
};

export const updateEmployee = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const photoUrl = req.file ? `/uploads/employees/${req.file.filename}` : null;
    const updates = { ...req.body, ...(photoUrl && { photoUrl }) };

    const fields = Object.keys(updates).map((k) => `${k} = ?`).join(", ");
    const values = Object.values(updates);

    await connection.execute(`UPDATE employees SET ${fields} WHERE id = ?`, [...values, req.params.id]);

    if (updates.designationId) {
      const [employee] = await connection.query(`SELECT userId FROM employees WHERE id = ?`, [req.params.id]);
      if (employee.length > 0 && employee[0].userId) {
        const userId = employee[0].userId;
        await connection.execute('DELETE FROM user_roles WHERE userId = ?', [userId]);
        await assignRolesFromDesignation(connection, userId, updates.designationId);
      }
    }

    await connection.commit();
    res.json({ success: true, message: "Employee updated successfully" });
  } catch (err) {
    await connection.rollback();
    console.error("Employee update failed:", err);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    connection.release();
  }
};

export const deleteEmployee = async (req, res) => {
  try {
    await db.execute(`UPDATE employees SET isActive = 0 WHERE id = ?`, [req.params.id]);
    res.json({ success: true, message: "Employee deactivated" });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete employee', error: error.message });
  }
};

export const updateUserPassword = async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    if (!email || !newPassword) {
      return res.status(400).json({ success: false, message: "Email and new password are required" });
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const [result] = await db.execute(`UPDATE users SET password = ? WHERE email = ?`, [hashedPassword, email]);
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: "User not found" });
    res.json({ success: true, message: "Password updated successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};