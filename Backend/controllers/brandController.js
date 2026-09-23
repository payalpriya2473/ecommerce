import { db } from '../config/db.js';
import fs from 'fs';


// ─────────────────────────────────────────────
// Register a new brand
// ─────────────────────────────────────────────
export const registerBrand = async (req, res) => {
  try {
    const { name, removeIcon } = req.body;
    const iconFile = req.file;

    if (!name) {
      return res.status(400).json({ success: false, message: 'Brand name is required' });
    }

    const [existing] = await db.query(
      'SELECT id FROM brands WHERE name = ? AND isActive = 1',
      [name.trim()]
    );
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'A brand with this name already exists' });
    }

    const iconUrl = iconFile ? `/uploads/brands/${iconFile.filename}` : null;

    const [result] = await db.query(
      `INSERT INTO brands (name, iconUrl) VALUES (?, ?)`,
      [name.trim(), iconUrl]
    );

    const [newBrand] = await db.query(
      `SELECT b.* FROM brands b WHERE b.id = ?`,
      [result.insertId]
    );

    return res.status(201).json({ success: true, message: 'Brand registered successfully', data: newBrand[0] });
  } catch (error) {
    console.error('Register brand error:', error);
    return res.status(500).json({ success: false, message: 'Failed to register brand', error: error.message });
  }
};


export const getAllBrands = async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    const { search, page, limit, sortKey, sortDirection } = req.query;

    const pageNumber = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.max(1, parseInt(limit, 10) || 25);
    const paginationEnabled = Number.isFinite(parseInt(page, 10)) && Number.isFinite(parseInt(limit, 10));

    const sortFieldMap = {
      name: 'b.name',
      createdAt: 'b.createdAt',
    };
    const resolvedSortField = sortFieldMap[sortKey] || 'b.createdAt';
    const resolvedSortDirection = String(sortDirection || '').toLowerCase() === 'desc'
      ? 'DESC'
      : String(sortDirection || '').toLowerCase() === 'asc'
        ? 'ASC'
        : 'DESC';

    const baseFrom = `
      FROM brands b
    `;
    const whereClauses = ['b.isActive = 1'];
    const params = [];

    if (search) {
      const term = `%${search}%`;
      whereClauses.push('b.name LIKE ?');
      params.push(term);
    }

    const whereSql = `WHERE ${whereClauses.join(' AND ')}`;
    const orderSql = `ORDER BY ${resolvedSortField} ${resolvedSortDirection}`;

    let query = `
      SELECT b.*
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

    const [brands] = await db.query(query, params);
    const payload = { success: true, data: brands };
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
    console.error('Get brands error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch brands', error: error.message });
  }
};

// ─────────────────────────────────────────────
// Get brand by ID
// ─────────────────────────────────────────────
export const getBrandById = async (req, res) => {
  try {
    const { id } = req.params;

    const [brand] = await db.query(
      `SELECT b.*
       FROM brands b
       WHERE b.id = ?`,
      [id]
    );

    if (brand.length === 0) {
      return res.status(404).json({ success: false, message: 'Brand not found' });
    }

    return res.status(200).json({ success: true, data: brand[0] });
  } catch (error) {
    console.error('Get brand error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch brand', error: error.message });
  }
};

// ─────────────────────────────────────────────
// Update brand
// ─────────────────────────────────────────────
export const updateBrand = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, removeIcon } = req.body;
    const iconFile = req.file;

    const [existing] = await db.query('SELECT * FROM brands WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Brand not found' });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Brand name is required' });
    }

    let iconUrl = existing[0].iconUrl;

    if (iconFile) {
      // Delete old icon file if exists
      if (iconUrl) {
        const oldPath = `.${iconUrl}`;
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      iconUrl = `/uploads/brands/${iconFile.filename}`;
    } else if (removeIcon === "true") {
      if (iconUrl) {
        const oldPath = `.${iconUrl}`;
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      iconUrl = null;
    }

    await db.query(
      'UPDATE brands SET name = ?, iconUrl = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
      [name.trim(), iconUrl, id]
    );

    const [updated] = await db.query(
      `SELECT b.* FROM brands b WHERE b.id = ?`,
      [id]
    );

    return res.status(200).json({ success: true, message: 'Brand updated successfully', data: updated[0] });
  } catch (error) {
    console.error('Update brand error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update brand', error: error.message });
  }
};

// ─────────────────────────────────────────────
// Delete brand — HARD DELETE from DB
// ─────────────────────────────────────────────
export const deleteBrand = async (req, res) => {
  try {
    const { id } = req.params;

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');

    const [existing] = await db.query('SELECT id FROM brands WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Brand not found' });
    }

    await db.query('DELETE FROM brands WHERE id = ?', [id]);

    return res.status(200).json({ success: true, message: 'Brand deleted successfully' });
  } catch (error) {
    console.error('Delete brand error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete brand', error: error.message });
  }
};

