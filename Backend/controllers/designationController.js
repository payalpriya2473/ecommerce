import { db } from "../config/db.js";

const designationSelectQuery = `
  SELECT
    d.id, d.companyId, d.departmentId, d.name, d.level,
    d.reportsToDesignationId, d.roleIds, d.createdAt, d.updatedAt,
    parent.name AS reportsToName,
    dept.name AS departmentName,
    c.name AS companyName
  FROM designations d
  LEFT JOIN designations parent ON d.reportsToDesignationId = parent.id
  LEFT JOIN departments dept ON d.departmentId = dept.id
  LEFT JOIN companies c ON d.companyId = c.id
`;

export const createDesignation = async (req, res) => {
  try {
    const { companyId, departmentId, name, level, reportsToDesignationId, roleIds } = req.body;

    if (!companyId || !name || !level) {
      return res.status(400).json({ success: false, message: "Company ID, name, and level are required" });
    }

    const roleIdsJson = roleIds ? JSON.stringify(roleIds) : null;

    // ✅ FIX: No manual ID — MySQL AUTO_INCREMENT assigns it
    const [result] = await db.execute(
      `INSERT INTO designations (companyId, departmentId, name, level, reportsToDesignationId, roleIds)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [companyId, departmentId || null, name, level, reportsToDesignationId || null, roleIdsJson]
    );

    const [rows] = await db.execute(
      designationSelectQuery + ' WHERE d.id = ?',
      [result.insertId]
    );

    res.status(201).json({ success: true, data: rows[0], message: "Designation created successfully" });
  } catch (err) {
    console.error("Create designation error:", err);
    res.status(500).json({ success: false, message: err.message || "Failed to create designation" });
  }
};

export const getAllDesignations = async (req, res) => {
  try {
    const { companyId, departmentId, search, page, limit, sortKey, sortDirection } = req.query;
    const userRole = req.user?.role;
    const userCompanyId = req.user?.companyId;

    const pageNumber = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.max(1, parseInt(limit, 10) || 25);
    const paginationEnabled = Number.isFinite(parseInt(page, 10)) && Number.isFinite(parseInt(limit, 10));

    const sortFieldMap = {
      name: 'd.name',
      department: 'dept.name',
      company: 'c.name',
      level: 'd.level',
      roles: 'JSON_LENGTH(d.roleIds)',
    };
    const resolvedSortField = sortFieldMap[sortKey] || null;
    const requestedDir = String(sortDirection || '').toLowerCase();
    const resolvedSortDirection = requestedDir === 'desc' ? 'DESC' : requestedDir === 'asc' ? 'ASC' : 'ASC';

    // FROM/JOIN block mirrors designationSelectQuery for COUNT reuse.
    const baseFrom = `
      FROM designations d
      LEFT JOIN designations parent ON d.reportsToDesignationId = parent.id
      LEFT JOIN departments dept ON d.departmentId = dept.id
      LEFT JOIN companies c ON d.companyId = c.id
    `;

    const whereClauses = [];
    const params = [];

    if (companyId) {
      whereClauses.push("d.companyId = ?"); params.push(companyId);
    } else if (userRole !== "super_admin" && userCompanyId) {
      whereClauses.push("d.companyId = ?"); params.push(userCompanyId);
    }

    if (departmentId) { whereClauses.push("d.departmentId = ?"); params.push(departmentId); }

    if (search) {
      const term = `%${search}%`;
      whereClauses.push("(d.name LIKE ? OR COALESCE(dept.name, '') LIKE ? OR COALESCE(c.name, '') LIKE ?)");
      params.push(term, term, term);
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
    // Default order preserves existing behaviour; explicit sortKey overrides.
    const orderSql = resolvedSortField
      ? `ORDER BY ${resolvedSortField} ${resolvedSortDirection}`
      : 'ORDER BY d.level ASC, d.name ASC';

    let query = designationSelectQuery + ' ' + whereSql + ' ' + orderSql;

    let totalItems = null;
    if (paginationEnabled) {
      const [countRows] = await db.execute(`SELECT COUNT(*) AS total ${baseFrom} ${whereSql}`, params);
      totalItems = Number(countRows?.[0]?.total || 0);
      query += ' LIMIT ? OFFSET ?';
      params.push(String(pageSize), String((pageNumber - 1) * pageSize));
    }

    const [rows] = await db.execute(query, params);
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
  } catch (err) {
    console.error("Get all designations error:", err);
    res.status(500).json({ success: false, message: err.message || "Failed to fetch designations" });
  }
};

export const getDesignationById = async (req, res) => {
  try {
    const [rows] = await db.execute(designationSelectQuery + ' WHERE d.id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: "Designation not found" });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || "Failed to fetch designation" });
  }
};

export const updateDesignation = async (req, res) => {
  try {
    const { name, level, reportsToDesignationId, roleIds } = req.body;
    const roleIdsJson = roleIds ? JSON.stringify(roleIds) : null;

    const updates = [];
    const params = [];

    if (name !== undefined)                    { updates.push("name = ?");                    params.push(name); }
    if (level !== undefined)                   { updates.push("level = ?");                   params.push(level); }
    if (reportsToDesignationId !== undefined)  { updates.push("reportsToDesignationId = ?");  params.push(reportsToDesignationId || null); }
    if (roleIds !== undefined)                 { updates.push("roleIds = ?");                 params.push(roleIdsJson); }

    if (updates.length === 0) return res.status(400).json({ success: false, message: "No fields to update" });

    updates.push("updatedAt = NOW()");
    params.push(req.params.id);

    await db.execute(`UPDATE designations SET ${updates.join(", ")} WHERE id = ?`, params);

    const [rows] = await db.execute(designationSelectQuery + ' WHERE d.id = ?', [req.params.id]);
    res.json({ success: true, message: "Designation updated successfully", data: rows[0] });
  } catch (err) {
    console.error("Update designation error:", err);
    res.status(500).json({ success: false, message: err.message || "Failed to update designation" });
  }
};

export const deleteDesignation = async (req, res) => {
  try {
    const { id } = req.params;

    const [designation] = await db.execute("SELECT id FROM designations WHERE id = ?", [id]);
    if (designation.length === 0) return res.status(404).json({ success: false, message: "Designation not found" });

    const [employees] = await db.execute(
      "SELECT COUNT(*) as count FROM employees WHERE designationId = ? AND isActive = 1", [id]
    );
    if (employees[0].count > 0) {
      return res.status(400).json({ success: false, message: `Cannot delete: ${employees[0].count} active employee(s) assigned.` });
    }

    const [subordinates] = await db.execute(
      "SELECT COUNT(*) as count FROM designations WHERE reportsToDesignationId = ?", [id]
    );
    if (subordinates[0].count > 0) {
      return res.status(400).json({ success: false, message: `Cannot delete: ${subordinates[0].count} designation(s) report to this one.` });
    }

    await db.execute("DELETE FROM designations WHERE id = ?", [id]);
    res.json({ success: true, message: "Designation deleted successfully" });
  } catch (err) {
    console.error("Delete designation error:", err);
    res.status(500).json({ success: false, message: err.message || "Failed to delete designation" });
  }
};