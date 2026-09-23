import { db } from '../config/db.js';

// ─────────────────────────────────────────────
// Register a new item group
// ─────────────────────────────────────────────
export const registerItemGroup = async (req, res) => {
  try {
    const {
      categoryId, name, combineGroup, hsnCode, gst,
      hasDemoInstallation, buyBackValue, maxQty,
    } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: 'Item group name is required' });
    }

    if (gst === undefined || gst === null || gst < 0) {
      return res.status(400).json({ success: false, message: 'A valid GST rate is required' });
    }

    const parsedMaxQty = maxQty !== undefined && maxQty !== null && maxQty !== ''
      ? parseInt(maxQty)
      : 0;

    if (categoryId) {
      const [cat] = await db.query('SELECT id FROM categories WHERE id = ? AND isActive = 1', [categoryId]);
      if (cat.length === 0) {
        return res.status(404).json({ success: false, message: 'Category not found' });
      }
    }

    const [existing] = await db.query(
      'SELECT id FROM item_groups WHERE name = ? AND isActive = 1',
      [name.trim()]
    );
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'An item group with this name already exists' });
    }

    // ✅ FIX: No manual ID — let MySQL AUTO_INCREMENT assign it
    const [result] = await db.query(
      `INSERT INTO item_groups
        (categoryId, name, combineGroup, hsnCode, gst, hasDemoInstallation, buyBackValue, maxQty)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        categoryId || null,
        name.trim(),
        combineGroup || null,
        hsnCode || null,
        parseFloat(gst) || 0,
        hasDemoInstallation ? 1 : 0,
        buyBackValue !== undefined && buyBackValue !== '' ? parseFloat(buyBackValue) : null,
        parsedMaxQty,
      ]
    );

    const insertedId = result.insertId;

    const [newGroup] = await db.query(
      `SELECT ig.*, c.name AS categoryName
       FROM item_groups ig
       LEFT JOIN categories c  ON ig.categoryId = c.id
       WHERE ig.id = ?`,
      [insertedId]
    );

    return res.status(201).json({ success: true, message: 'Item group registered successfully', data: newGroup[0] });
  } catch (error) {
    console.error('Register item group error:', error);
    return res.status(500).json({ success: false, message: 'Failed to register item group', error: error.message });
  }
};

// ─────────────────────────────────────────────
// Get all item groups
// ─────────────────────────────────────────────
export const getAllItemGroups = async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    const { categoryId, search, page, limit, sortKey, sortDirection } = req.query;

    const pageNumber = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.max(1, parseInt(limit, 10) || 25);
    const paginationEnabled = Number.isFinite(parseInt(page, 10)) && Number.isFinite(parseInt(limit, 10));

    const sortFieldMap = {
      name: 'ig.name',
      category: 'c.name',
      hsnCode: 'ig.hsnCode',
      gst: 'ig.gst',
      maxQty: 'ig.maxQty',
      demo: 'ig.hasDemoInstallation',
      createdAt: 'ig.createdAt',
    };
    const resolvedSortField = sortFieldMap[sortKey] || 'ig.createdAt';
    const resolvedSortDirection = String(sortDirection || '').toLowerCase() === 'desc'
      ? 'DESC'
      : String(sortDirection || '').toLowerCase() === 'asc'
        ? 'ASC'
        : 'DESC';

    const baseFrom = `
      FROM item_groups ig
      LEFT JOIN categories c  ON ig.categoryId = c.id
    `;
    const whereClauses = ['ig.isActive = 1'];
    const params = [];

    if (categoryId) {
      whereClauses.push('ig.categoryId = ?');
      params.push(categoryId);
    }
    if (search) {
      const term = `%${search}%`;
      whereClauses.push("(ig.name LIKE ? OR COALESCE(c.name, '') LIKE ?)");
      params.push(term, term);
    }

    const whereSql = `WHERE ${whereClauses.join(' AND ')}`;
    const orderSql = `ORDER BY ${resolvedSortField} ${resolvedSortDirection}`;

    let query = `
      SELECT ig.*, c.name AS categoryName
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

    const [groups] = await db.query(query, params);
    const payload = { success: true, data: groups };
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
    console.error('Get item groups error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch item groups', error: error.message });
  }
};

export const getItemGroupById = async (req, res) => {
  try {
    const { id } = req.params;
    const [group] = await db.query(
      `SELECT ig.*, c.name AS categoryName
       FROM item_groups ig
       LEFT JOIN categories c  ON ig.categoryId = c.id
       WHERE ig.id = ?`,
      [id]
    );
    if (group.length === 0) {
      return res.status(404).json({ success: false, message: 'Item group not found' });
    }
    return res.status(200).json({ success: true, data: group[0] });
  } catch (error) {
    console.error('Get item group error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch item group', error: error.message });
  }
};

export const updateItemGroup = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const [existing] = await db.query('SELECT id FROM item_groups WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Item group not found' });
    }

    const allowedFields = ['categoryId', 'name', 'combineGroup', 'hsnCode', 'gst', 'hasDemoInstallation', 'buyBackValue', 'maxQty'];
    const updates = [];
    const values  = [];

    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        updates.push(`${field} = ?`);
        if (field === 'maxQty') {
          values.push(updateData[field] === '' || updateData[field] === null ? 0 : parseInt(updateData[field]));
        } else {
          values.push(updateData[field] === '' ? null : updateData[field]);
        }
      }
    });

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid fields to update' });
    }

    values.push(id);
    await db.query(`UPDATE item_groups SET ${updates.join(', ')}, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`, values);

    const [updated] = await db.query(
      `SELECT ig.*, c.name AS categoryName
       FROM item_groups ig
       LEFT JOIN categories c  ON ig.categoryId = c.id
       WHERE ig.id = ?`,
      [id]
    );

    return res.status(200).json({ success: true, message: 'Item group updated successfully', data: updated[0] });
  } catch (error) {
    console.error('Update item group error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update item group', error: error.message });
  }
};

export const deleteItemGroup = async (req, res) => {
  try {
    const { id } = req.params;
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');

    const [existing] = await db.query('SELECT id FROM item_groups WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Item group not found' });
    }

    await db.query('DELETE FROM item_groups WHERE id = ?', [id]);
    return res.status(200).json({ success: true, message: 'Item group deleted successfully' });
  } catch (error) {
    console.error('Delete item group error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete item group', error: error.message });
  }
};

