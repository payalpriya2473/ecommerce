import { db } from '../config/db.js';

// ─────────────────────────────────────────────
// Register a new color
// ─────────────────────────────────────────────
export const registerColor = async (req, res) => {
  try {
    const { brandId, colorName } = req.body;

    if (!brandId) {
      return res.status(400).json({ success: false, message: 'Brand is required' });
    }
    if (!colorName || !colorName.trim()) {
      return res.status(400).json({ success: false, message: 'Color name is required' });
    }

    // Check brand exists
    const [brand] = await db.query('SELECT id, name FROM brands WHERE id = ? AND isActive = 1', [brandId]);
    if (brand.length === 0) {
      return res.status(404).json({ success: false, message: 'Brand not found' });
    }

    // Check duplicate
    const [existing] = await db.query(
      'SELECT id FROM colors WHERE brandId = ? AND colorName = ? AND isActive = 1',
      [brandId, colorName.trim()]
    );
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'This color already exists for the selected brand' });
    }

    const [result] = await db.query(
      `INSERT INTO colors (brandId, colorName) VALUES (?, ?)`,
      [brandId, colorName.trim()]
    );

    const [newColor] = await db.query(
      `SELECT c.*, b.name AS brandName FROM colors c
       LEFT JOIN brands b ON c.brandId = b.id
       WHERE c.id = ?`,
      [result.insertId]
    );

    return res.status(201).json({ success: true, message: 'Color registered successfully', data: newColor[0] });
  } catch (error) {
    console.error('Register color error:', error);
    return res.status(500).json({ success: false, message: 'Failed to register color', error: error.message });
  }
};

// ─────────────────────────────────────────────
// Get all colors
// ─────────────────────────────────────────────
export const getAllColors = async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    const { brandId, search, page, limit, sortKey, sortDirection } = req.query;

    const pageNumber = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.max(1, parseInt(limit, 10) || 25);
    const paginationEnabled = Number.isFinite(parseInt(page, 10)) && Number.isFinite(parseInt(limit, 10));

    const sortFieldMap = {
      brandName: 'b.name',
      colorName: 'c.colorName',
      createdAt: 'c.createdAt',
    };
    const resolvedSortField = sortFieldMap[sortKey] || null;
    const resolvedSortDirection = String(sortDirection || '').toLowerCase() === 'desc'
      ? 'DESC'
      : 'ASC';

    const baseFrom = `
      FROM colors c
      LEFT JOIN brands b ON c.brandId = b.id
    `;
    const whereClauses = ['c.isActive = 1'];
    const params = [];

    if (brandId) {
      whereClauses.push('c.brandId = ?');
      params.push(brandId);
    }
    if (search) {
      const term = `%${search}%`;
      whereClauses.push("(c.colorName LIKE ? OR COALESCE(b.name, '') LIKE ?)");
      params.push(term, term);
    }

    const whereSql = `WHERE ${whereClauses.join(' AND ')}`;
    const orderSql = resolvedSortField
      ? `ORDER BY ${resolvedSortField} ${resolvedSortDirection}`
      : 'ORDER BY b.name ASC, c.colorName ASC';

    let query = `
      SELECT c.*, b.name AS brandName
      ${baseFrom}
      ${whereSql}
      ${orderSql}
    `;

    let totalItems = null;
    if (paginationEnabled) {
      const [countRows] = await db.query(`SELECT COUNT(*) AS total ${baseFrom} ${whereSql}`, params);
      totalItems = Number(countRows?.[0]?.total || 0);
      query += ' LIMIT ? OFFSET ?';
      params.push(pageSize, (pageNumber - 1) * pageSize);
    }

    const [colors] = await db.query(query, params);
    const payload = { success: true, data: colors };
    if (paginationEnabled) {
      payload.pagination = {
        page: pageNumber,
        limit: pageSize,
        totalItems,
        totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
      };
    }
    return res.status(200).json(payload);
  } catch (error) {
    console.error('Get colors error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch colors', error: error.message });
  }
};

// ─────────────────────────────────────────────
// Get color by ID
// ─────────────────────────────────────────────
export const getColorById = async (req, res) => {
  try {
    const { id } = req.params;
    const [color] = await db.query(
      `SELECT c.*, b.name AS brandName FROM colors c
       LEFT JOIN brands b ON c.brandId = b.id
       WHERE c.id = ?`,
      [id]
    );
    if (color.length === 0) {
      return res.status(404).json({ success: false, message: 'Color not found' });
    }
    return res.status(200).json({ success: true, data: color[0] });
  } catch (error) {
    console.error('Get color error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch color', error: error.message });
  }
};

// ─────────────────────────────────────────────
// Update color
// ─────────────────────────────────────────────
export const updateColor = async (req, res) => {
  try {
    const { id } = req.params;
    const { brandId, colorName } = req.body;

    const [existing] = await db.query('SELECT id FROM colors WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Color not found' });
    }

    if (!brandId) {
      return res.status(400).json({ success: false, message: 'Brand is required' });
    }
    if (!colorName || !colorName.trim()) {
      return res.status(400).json({ success: false, message: 'Color name is required' });
    }

    // Check duplicate excluding self
    const [dup] = await db.query(
      'SELECT id FROM colors WHERE brandId = ? AND colorName = ? AND isActive = 1 AND id != ?',
      [brandId, colorName.trim(), id]
    );
    if (dup.length > 0) {
      return res.status(409).json({ success: false, message: 'This color already exists for the selected brand' });
    }

    await db.query(
      `UPDATE colors SET brandId = ?, colorName = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      [brandId, colorName.trim(), id]
    );

    const [updated] = await db.query(
      `SELECT c.*, b.name AS brandName FROM colors c
       LEFT JOIN brands b ON c.brandId = b.id
       WHERE c.id = ?`,
      [id]
    );

    return res.status(200).json({ success: true, message: 'Color updated successfully', data: updated[0] });
  } catch (error) {
    console.error('Update color error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update color', error: error.message });
  }
};

// ─────────────────────────────────────────────
// Delete color (soft delete)
// ─────────────────────────────────────────────
export const deleteColor = async (req, res) => {
  try {
    const { id } = req.params;
    const [existing] = await db.query('SELECT id FROM colors WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Color not found' });
    }
    await db.query('UPDATE colors SET isActive = 0, updatedAt = CURRENT_TIMESTAMP WHERE id = ?', [id]);
    return res.status(200).json({ success: true, message: 'Color deleted successfully' });
  } catch (error) {
    console.error('Delete color error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete color', error: error.message });
  }
};

// ─────────────────────────────────────────────
// Get colors by brand
// ─────────────────────────────────────────────
export const getColorsByBrand = async (req, res) => {
  try {
    const { brandId } = req.params;
    const [colors] = await db.query(
      `SELECT c.*, b.name AS brandName FROM colors c
       LEFT JOIN brands b ON c.brandId = b.id
       WHERE c.brandId = ? AND c.isActive = 1
       ORDER BY c.colorName ASC`,
      [brandId]
    );
    return res.status(200).json({ success: true, data: colors });
  } catch (error) {
    console.error('Get colors by brand error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch colors', error: error.message });
  }
};