import { db } from '../config/db.js';

const getItemWithDetails = async (itemId) => {
  const [rows] = await db.query(
    `SELECT i.*, b.name AS brandName, ig.name AS itemGroupName
     FROM items i
     LEFT JOIN brands b       ON i.brandId     = b.id
     LEFT JOIN item_groups ig ON i.itemGroupId = ig.id
     WHERE i.id = ? AND i.isActive = 1`,
    [itemId]
  );
  return rows[0] || null;
};

const getEditorId = (req) => {
  const u = req.user;
  if (!u) return null;
  return u.id || u.userId || u.user_id || u.sub || null;
};

export const getAllIncentiveLogs = async (req, res) => {
  try {
    const { brandId, itemGroupId, itemId, fromDate, toDate, search, page, limit, sortKey, sortDirection } = req.query;

    const pageNumber = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.max(1, parseInt(limit, 10) || 25);
    const paginationEnabled = Number.isFinite(parseInt(page, 10)) && Number.isFinite(parseInt(limit, 10));

    const sortFieldMap = {
      item: 'i.itemName',
      brandGroup: 'b.name',
      date: 'il.effectiveDate',
      nlc: 'il.newNlc',
      incentive: 'il.newIncentive',
      margin: 'il.newMargin',
      editedBy: 'u.email',
    };
    const resolvedSortField = sortFieldMap[sortKey] || null;
    const resolvedSortDirection = String(sortDirection || '').toLowerCase() === 'desc'
      ? 'DESC'
      : 'ASC';

    const baseFrom = `
      FROM incentive_logs il
      LEFT JOIN items       i  ON il.itemId      = i.id
      LEFT JOIN brands      b  ON il.brandId     = b.id
      LEFT JOIN item_groups ig ON il.itemGroupId = ig.id
      LEFT JOIN users       u  ON il.editedBy    = u.id
    `;
    const whereClauses = ['il.isActive = 1'];
    const params = [];

    if (brandId)     { whereClauses.push('il.brandId = ?');        params.push(brandId); }
    if (itemGroupId) { whereClauses.push('il.itemGroupId = ?');    params.push(itemGroupId); }
    if (itemId)      { whereClauses.push('il.itemId = ?');         params.push(itemId); }
    if (fromDate)    { whereClauses.push('il.effectiveDate >= ?'); params.push(fromDate); }
    if (toDate)      { whereClauses.push('il.effectiveDate <= ?'); params.push(toDate); }
    if (search) {
      const term = `%${search}%`;
      whereClauses.push(
        "(COALESCE(i.itemName, '') LIKE ? OR COALESCE(b.name, '') LIKE ? OR COALESCE(ig.name, '') LIKE ? OR COALESCE(u.email, '') LIKE ?)"
      );
      params.push(term, term, term, term);
    }

    const whereSql = `WHERE ${whereClauses.join(' AND ')}`;
    const orderSql = resolvedSortField
      ? `ORDER BY ${resolvedSortField} ${resolvedSortDirection}`
      : 'ORDER BY il.createdAt DESC';

    let query = `
      SELECT il.*, i.itemName, b.name AS brandName, ig.name AS itemGroupName, u.email AS editedByEmail
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
    return res.status(200).json(payload);
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch incentive logs', error: error.message });
  }
};

export const getIncentiveLogById = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT il.*, i.itemName, b.name AS brandName, ig.name AS itemGroupName, u.email AS editedByEmail
       FROM incentive_logs il
       LEFT JOIN items       i  ON il.itemId      = i.id
       LEFT JOIN brands      b  ON il.brandId     = b.id
       LEFT JOIN item_groups ig ON il.itemGroupId = ig.id
       LEFT JOIN users       u  ON il.editedBy    = u.id
       WHERE il.id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Incentive log not found' });
    return res.status(200).json({ success: true, data: rows[0] });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch incentive log', error: error.message });
  }
};

export const getItemDefaults = async (req, res) => {
  try {
    const item = await getItemWithDetails(req.params.itemId);
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    return res.status(200).json({
      success: true,
      data: {
        itemId: item.id, itemName: item.itemName,
        brandId: item.brandId || null, brandName: item.brandName || null,
        itemGroupId: item.itemGroupId || null, itemGroupName: item.itemGroupName || null,
        nlc: item.nlc, incentive: item.incentive, margin: item.margin,
        offerPrice: item.offerPrice,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch item defaults', error: error.message });
  }
};

export const registerIncentiveLog = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const editedBy  = getEditorId(req);
    const { itemId, effectiveDate, oldNlc, oldIncentive, oldMargin, oldOfferPrice, newNlc, newIncentive, newMargin, newOfferPrice, remarks } = req.body;

    if (!itemId)        return res.status(400).json({ success: false, message: 'Item is required' });
    if (!effectiveDate) return res.status(400).json({ success: false, message: 'Effective date is required' });

    const item = await getItemWithDetails(itemId);
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

    //  FIX: No manual ID — MySQL AUTO_INCREMENT assigns it
    const [result] = await conn.query(
      `INSERT INTO incentive_logs (
        itemId, brandId, itemGroupId, effectiveDate,
        oldNlc, oldIncentive, oldMargin, oldOfferPrice,
        newNlc, newIncentive, newMargin, newOfferPrice, remarks, editedBy
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        itemId,
        item.brandId || null, item.itemGroupId || null, effectiveDate,
        parseFloat(oldNlc) || 0, parseFloat(oldIncentive) || 0,
        parseFloat(oldMargin) || 0, parseFloat(oldOfferPrice) || 0,
        parseFloat(newNlc) || 0, parseFloat(newIncentive) || 0,
        parseFloat(newMargin) || 0, parseFloat(newOfferPrice) || 0,
        remarks || null, editedBy,
      ]
    );

    await conn.query(
      `UPDATE items SET nlc = ?, incentive = ?, margin = ?, offerPrice = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      [parseFloat(newNlc) || 0, parseFloat(newIncentive) || 0, parseFloat(newMargin) || 0, parseFloat(newOfferPrice) || 0, itemId]
    );

    await conn.commit();

    const [newLog] = await conn.query(
      `SELECT il.*, i.itemName, b.name AS brandName, ig.name AS itemGroupName, u.email AS editedByEmail
       FROM incentive_logs il
       LEFT JOIN items i ON il.itemId = i.id LEFT JOIN brands b ON il.brandId = b.id
       LEFT JOIN item_groups ig ON il.itemGroupId = ig.id LEFT JOIN users u ON il.editedBy = u.id
       WHERE il.id = ?`,
      [result.insertId]
    );

    return res.status(201).json({ success: true, message: 'Incentive log created and item master updated', data: newLog[0] });
  } catch (error) {
    await conn.rollback();
    console.error('Register incentive log error:', error);
    return res.status(500).json({ success: false, message: 'Failed to create incentive log', error: error.message });
  } finally {
    conn.release();
  }
};

export const updateIncentiveLog = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const { id } = req.params;
    const editedBy = getEditorId(req);
    const { effectiveDate, oldNlc, oldIncentive, oldMargin, oldOfferPrice, newNlc, newIncentive, newMargin, newOfferPrice, remarks } = req.body;

    const [existing] = await conn.query('SELECT * FROM incentive_logs WHERE id = ?', [id]);
    if (existing.length === 0) return res.status(404).json({ success: false, message: 'Incentive log not found' });

    await conn.query(
      `UPDATE incentive_logs SET effectiveDate=?, oldNlc=?, oldIncentive=?, oldMargin=?, oldOfferPrice=?,
        newNlc=?, newIncentive=?, newMargin=?, newOfferPrice=?, remarks=?, editedBy=?, updatedAt=CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        effectiveDate,
        parseFloat(oldNlc) || 0, parseFloat(oldIncentive) || 0, parseFloat(oldMargin) || 0, parseFloat(oldOfferPrice) || 0,
        parseFloat(newNlc) || 0, parseFloat(newIncentive) || 0, parseFloat(newMargin) || 0, parseFloat(newOfferPrice) || 0,
        remarks || null, editedBy, id,
      ]
    );

    await conn.query(
      `UPDATE items SET nlc=?, incentive=?, margin=?, offerPrice=?, updatedAt=CURRENT_TIMESTAMP WHERE id=?`,
      [parseFloat(newNlc) || 0, parseFloat(newIncentive) || 0, parseFloat(newMargin) || 0, parseFloat(newOfferPrice) || 0, existing[0].itemId]
    );

    await conn.commit();

    const [updated] = await conn.query(
      `SELECT il.*, i.itemName, b.name AS brandName, ig.name AS itemGroupName, u.email AS editedByEmail
       FROM incentive_logs il
       LEFT JOIN items i ON il.itemId = i.id LEFT JOIN brands b ON il.brandId = b.id
       LEFT JOIN item_groups ig ON il.itemGroupId = ig.id LEFT JOIN users u ON il.editedBy = u.id
       WHERE il.id = ?`,
      [id]
    );

    return res.status(200).json({ success: true, message: 'Incentive log updated', data: updated[0] });
  } catch (error) {
    await conn.rollback();
    return res.status(500).json({ success: false, message: 'Failed to update incentive log', error: error.message });
  } finally {
    conn.release();
  }
};

export const deleteIncentiveLog = async (req, res) => {
  try {
    const [existing] = await db.query('SELECT id FROM incentive_logs WHERE id = ?', [req.params.id]);
    if (existing.length === 0) return res.status(404).json({ success: false, message: 'Incentive log not found' });
    await db.query('UPDATE incentive_logs SET isActive = 0, updatedAt = CURRENT_TIMESTAMP WHERE id = ?', [req.params.id]);
    return res.status(200).json({ success: true, message: 'Incentive log deleted successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to delete incentive log', error: error.message });
  }
};