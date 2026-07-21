import { db } from '../config/db.js';

export const registerDepartment = async (req, res) => {
  try {
    const { companyId, name, description } = req.body;

    if (!companyId || !name) {
      return res.status(400).json({ success: false, message: 'Company and Department Name are required' });
    }

    const [company] = await db.query('SELECT id FROM companies WHERE id = ?', [companyId]);
    if (company.length === 0) {
      return res.status(404).json({ success: false, message: 'Company not found' });
    }

   
    const [result] = await db.query(
      `INSERT INTO departments (companyId, name, description) VALUES (?, ?, ?)`,
      [companyId, name, description || null]
    );

    const [department] = await db.query(
      `SELECT d.*, c.name AS companyName FROM departments d
       LEFT JOIN companies c ON d.companyId = c.id
       WHERE d.id = ?`,
      [result.insertId]
    );

    res.status(201).json({ success: true, message: 'Department created successfully', data: department[0] });
  } catch (error) {
    console.error('Register department error:', error);
    res.status(500).json({ success: false, message: 'Failed to create department', error: error.message });
  }
};

export const getAllDepartments = async (req, res) => {
  try {
    const { companyId, search, page, limit, sortKey, sortDirection } = req.query;
    const userRole = req.user?.role;
    const userCompanyId = req.user?.companyId;

    const pageNumber = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.max(1, parseInt(limit, 10) || 25);
    const paginationEnabled = Number.isFinite(parseInt(page, 10)) && Number.isFinite(parseInt(limit, 10));

    const sortFieldMap = {
      name: 'd.name',
      company: 'c.name',
      description: 'd.description',
      createdAt: 'd.createdAt',
    };
    const resolvedSortField = sortFieldMap[sortKey] || null;
    const requestedDir = String(sortDirection || '').toLowerCase();
    const resolvedSortDirection = requestedDir === 'desc' ? 'DESC' : requestedDir === 'asc' ? 'ASC' : 'ASC';

    const baseFrom = ` FROM departments d LEFT JOIN companies c ON d.companyId = c.id`;
    const whereClauses = [];
    const params = [];

    if (userRole === 'super_admin') {
      if (companyId) { whereClauses.push('d.companyId = ?'); params.push(companyId); }
    } else {
      whereClauses.push('d.companyId = ?');
      params.push(userCompanyId);
    }

    if (search) {
      const term = `%${search}%`;
      whereClauses.push("(d.name LIKE ? OR COALESCE(d.description, '') LIKE ? OR COALESCE(c.name, '') LIKE ?)");
      params.push(term, term, term);
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
    // Default order preserves existing behaviour (newest first); explicit sortKey overrides.
    const orderSql = resolvedSortField
      ? `ORDER BY ${resolvedSortField} ${resolvedSortDirection}`
      : 'ORDER BY d.createdAt DESC';

    let query = `SELECT d.*, c.name AS companyName ${baseFrom} ${whereSql} ${orderSql}`;

    let totalItems = null;
    if (paginationEnabled) {
      const [countRows] = await db.query(`SELECT COUNT(*) AS total ${baseFrom} ${whereSql}`, params);
      totalItems = Number(countRows?.[0]?.total || 0);
      query += ' LIMIT ? OFFSET ?';
      params.push(pageSize, (pageNumber - 1) * pageSize);
    }

    const [departments] = await db.query(query, params);
    const payload = { success: true, data: departments };
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
    console.error('Get departments error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch departments', error: error.message });
  }
};

export const getDepartmentById = async (req, res) => {
  try {
    const [department] = await db.query(
      `SELECT d.*, c.name AS companyName FROM departments d LEFT JOIN companies c ON d.companyId = c.id WHERE d.id = ?`,
      [req.params.id]
    );
    if (department.length === 0) return res.status(404).json({ success: false, message: 'Department not found' });
    res.json({ success: true, data: department[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch department', error: error.message });
  }
};

export const updateDepartment = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    const [exists] = await db.query('SELECT id FROM departments WHERE id = ?', [id]);
    if (exists.length === 0) return res.status(404).json({ success: false, message: 'Department not found' });

    await db.query(`UPDATE departments SET name = ?, description = ? WHERE id = ?`, [name, description || null, id]);
    const [updated] = await db.query('SELECT * FROM departments WHERE id = ?', [id]);
    res.json({ success: true, message: 'Department updated successfully', data: updated[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update department', error: error.message });
  }
};

export const deleteDepartment = async (req, res) => {
  try {
    const [exists] = await db.query('SELECT id FROM departments WHERE id = ?', [req.params.id]);
    if (exists.length === 0) return res.status(404).json({ success: false, message: 'Department not found' });
    await db.query('DELETE FROM departments WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Department deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete department', error: error.message });
  }
};