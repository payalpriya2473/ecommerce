import db from '../config/db.js';

// ─────────────────────────────────────────────────────────────
// Offers — website offers/flash-sale entries built from Item Master
// ─────────────────────────────────────────────────────────────

const OFFER_FIELDS = [
  'section', 'badge', 'couponCode', 'discountType', 'discountPercent',
  'discountAmount', 'offerPrice', 'soldPercent', 'stockLeft', 'priority',
  'isActive', 'startAt', 'endAt',
  // ── Bank offer fields (used when section = 'bank_offer') ──
  'bankName', 'bankAbbr', 'offerText', 'offerSub', 'description', 'tags', 'colorTheme',
  // ── Combo deal fields (used when section = 'combo') ──
  'comboTitle', 'comboItems',
  // ── Coupon fields (used when section = 'coupon') ──
  'couponTitle', 'categoryLabel', 'minOrder', 'maxOff', 'validTill',
  // ── Brand deal fields (used when section = 'brand_deal') ──
  'brandDealName', 'discountLabel',
];

// datetime-local ("2026-07-03T17:30") → MySQL datetime ("2026-07-03 17:30:00")
const toMysqlDate = (v) => {
  if (!v) return null;
  const s = String(v).replace('T', ' ').trim();
  return s.length === 16 ? `${s}:00` : s; // add seconds if missing
};

const cleanValue = (field, raw) => {
  if (raw === undefined) return undefined;
  if (field === 'startAt' || field === 'endAt') return toMysqlDate(raw);
  if (field === 'isActive') return raw ? 1 : 0;
  if (field === 'comboItems') {
    if (raw == null || raw === '') return null;
    return typeof raw === 'string' ? raw : JSON.stringify(raw);
  }
  if (raw === '' ) return null;
  return raw;
};

// Parse the comboItems JSON column into an array for API responses
const parseComboItems = (row) => {
  if (!row || row.comboItems == null) return row;
  try {
    row.comboItems = typeof row.comboItems === 'string' ? JSON.parse(row.comboItems) : row.comboItems;
  } catch {
    row.comboItems = [];
  }
  return row;
};

const SELECT_BASE = `
  SELECT o.*,
         i.itemName        AS itemName,
         i.variant         AS variant,
         i.offerPrice      AS mrp,
         b.name            AS brandName,
         ig.name           AS itemGroupName
  FROM offers o
  LEFT JOIN items       i  ON o.itemId       = i.id
  LEFT JOIN brands      b  ON i.brandId      = b.id
  LEFT JOIN item_groups ig ON i.itemGroupId  = ig.id
`;

// ── GET /api/offers ───────────────────────────────────────────
export const getAllOffers = async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const { section, status, search, page, limit } = req.query;

    const where = [];
    const params = [];
    if (section) { where.push('o.section = ?'); params.push(section); }
    if (status === 'active')   { where.push('o.isActive = 1'); }
    if (status === 'inactive') { where.push('o.isActive = 0'); }
    if (search) {
      const term = `%${search}%`;
      where.push('(i.itemName LIKE ? OR COALESCE(b.name, \'\') LIKE ? OR COALESCE(o.badge, \'\') LIKE ? OR COALESCE(o.bankName, \'\') LIKE ?)');
      params.push(term, term, term, term);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    let query = `${SELECT_BASE} ${whereSql} ORDER BY o.priority ASC, o.createdAt DESC`;

    const pageNumber = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.max(1, parseInt(limit, 10) || 25);
    const paginationEnabled = Number.isFinite(parseInt(page, 10)) && Number.isFinite(parseInt(limit, 10));

    let totalItems = null;
    if (paginationEnabled) {
      const [countRows] = await db.query(
        `SELECT COUNT(*) AS total FROM offers o
         LEFT JOIN items i ON o.itemId = i.id
         LEFT JOIN brands b ON i.brandId = b.id
         ${whereSql}`,
        params,
      );
      totalItems = Number(countRows?.[0]?.total || 0);
      query += ' LIMIT ? OFFSET ?';
      params.push(pageSize, (pageNumber - 1) * pageSize);
    }

    const [rows] = await db.query(query, params);
    const payload = { success: true, data: rows.map(parseComboItems) };
    if (paginationEnabled) {
      payload.pagination = {
        page: pageNumber, limit: pageSize, totalItems,
        totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
      };
    }
    return res.status(200).json(payload);
  } catch (error) {
    console.error('Get offers error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch offers', error: error.message });
  }
};

// ── GET /api/offers/:id ───────────────────────────────────────
export const getOfferById = async (req, res) => {
  try {
    const [rows] = await db.query(`${SELECT_BASE} WHERE o.id = ?`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Offer not found' });
    const one = parseComboItems(rows[0]);
    one.productIds = await getOfferProductIds(req.params.id);
    return res.status(200).json({ success: true, data: one });
  } catch (error) {
    console.error('Get offer error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch offer', error: error.message });
  }
};

// Insert one offer row from a body-like object; returns the new id
const insertOfferRow = async (rowBody, itemId) => {
  const cols = ['itemId'];
  const placeholders = ['?'];
  const values = [itemId ?? null];

  for (const f of OFFER_FIELDS) {
    const v = cleanValue(f, rowBody[f]);
    if (v !== undefined) { cols.push(f); placeholders.push('?'); values.push(v); }
  }

  const [result] = await db.query(
    `INSERT INTO offers (${cols.join(', ')}) VALUES (${placeholders.join(', ')})`,
    values,
  );
  return result.insertId;
};

// Replace the set of products an offer is assigned to (many-to-many)
const syncOfferProducts = async (offerId, productIds) => {
  if (!Array.isArray(productIds)) return;
  await db.query('DELETE FROM offer_products WHERE offerId = ?', [offerId]);
  const ids = [...new Set(productIds.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))];
  if (!ids.length) return;
  const values = ids.map((itemId) => [offerId, itemId]);
  await db.query('INSERT INTO offer_products (offerId, itemId) VALUES ?', [values]);
};

// Fetch assigned product ids for an offer
const getOfferProductIds = async (offerId) => {
  const [rows] = await db.query('SELECT itemId FROM offer_products WHERE offerId = ?', [offerId]);
  return rows.map((r) => r.itemId);
};

// ── POST /api/offers/register ─────────────────────────────────
export const registerOffer = async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.section) return res.status(400).json({ success: false, message: 'section is required' });

    const isBankOffer = body.section === 'bank_offer';

    // Bank offers may be sent as a batch: { section, priority, ..., banks: [ {bankName,...}, ... ] }
    if (isBankOffer && Array.isArray(body.banks)) {
      const shared = {
        section: body.section,
        priority: body.priority,
        isActive: body.isActive,
        startAt: body.startAt,
        endAt: body.endAt,
      };
      const valid = body.banks.filter((b) => b && b.bankName);
      if (!valid.length) return res.status(400).json({ success: false, message: 'At least one bank offer with a bank name is required' });

      const ids = [];
      for (const bank of valid) {
        const newBankId = await insertOfferRow({ ...shared, ...bank }, null);
        await syncOfferProducts(newBankId, body.productIds);
        ids.push(newBankId);
      }
      const [rows] = await db.query(`${SELECT_BASE} WHERE o.id IN (?)`, [ids]);
      return res.status(201).json({ success: true, message: `${ids.length} bank offer(s) created`, data: rows });
    }

    const isCombo = body.section === 'combo';
    const isCoupon = body.section === 'coupon';
    const isBrand = body.section === 'brand_deal';
    const isProductBased = !isBankOffer && !isCombo && !isCoupon && !isBrand;

    if (isBankOffer) {
      if (!body.bankName) return res.status(400).json({ success: false, message: 'bankName is required for a bank offer' });
    } else if (isCombo) {
      if (!body.comboTitle) return res.status(400).json({ success: false, message: 'A combo title is required' });
      const items = Array.isArray(body.comboItems) ? body.comboItems.filter((x) => x && x.itemId) : [];
      if (items.length < 2) return res.status(400).json({ success: false, message: 'A combo needs at least 2 products' });
    } else if (isCoupon) {
      if (!body.couponCode) return res.status(400).json({ success: false, message: 'A coupon code is required' });
      if (!body.couponTitle) return res.status(400).json({ success: false, message: 'A coupon title is required' });
    } else if (isBrand) {
      if (!body.brandDealName) return res.status(400).json({ success: false, message: 'A brand name is required' });
    } else {
      if (!body.itemId) return res.status(400).json({ success: false, message: 'itemId is required' });
      const [itemRows] = await db.query('SELECT id FROM items WHERE id = ? LIMIT 1', [body.itemId]);
      if (!itemRows.length) return res.status(400).json({ success: false, message: 'Selected product does not exist in Item Master' });
    }

    const newId = await insertOfferRow(body, isProductBased ? body.itemId : null);
    await syncOfferProducts(newId, body.productIds);
    const [rows] = await db.query(`${SELECT_BASE} WHERE o.id = ?`, [newId]);
    const created = parseComboItems(rows[0]);
    created.productIds = await getOfferProductIds(newId);
    return res.status(201).json({ success: true, message: 'Offer created', data: created });
  } catch (error) {
    console.error('Create offer error:', error);
    return res.status(500).json({ success: false, message: 'Failed to create offer', error: error.message });
  }
};

// ── PUT /api/offers/:id ───────────────────────────────────────
export const updateOffer = async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};

    const [existing] = await db.query('SELECT id FROM offers WHERE id = ?', [id]);
    if (!existing.length) return res.status(404).json({ success: false, message: 'Offer not found' });

    const sets = [];
    const values = [];
    if (body.itemId !== undefined) { sets.push('itemId = ?'); values.push(body.itemId); }
    for (const f of OFFER_FIELDS) {
      const v = cleanValue(f, body[f]);
      if (v !== undefined) { sets.push(`${f} = ?`); values.push(v); }
    }

    if (sets.length) {
      values.push(id);
      await db.query(`UPDATE offers SET ${sets.join(', ')} WHERE id = ?`, values);
    }

    // Sync assigned products if provided
    if (Array.isArray(body.productIds)) await syncOfferProducts(id, body.productIds);

    const [rows] = await db.query(`${SELECT_BASE} WHERE o.id = ?`, [id]);
    const updated = parseComboItems(rows[0]);
    updated.productIds = await getOfferProductIds(id);
    return res.status(200).json({ success: true, message: 'Offer updated', data: updated });
  } catch (error) {
    console.error('Update offer error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update offer', error: error.message });
  }
};

// ── DELETE /api/offers/:id ────────────────────────────────────
export const deleteOffer = async (req, res) => {
  try {
    await db.query('DELETE FROM offer_products WHERE offerId = ?', [req.params.id]);
    const [result] = await db.query('DELETE FROM offers WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Offer not found' });
    return res.status(200).json({ success: true, message: 'Offer deleted' });
  } catch (error) {
    console.error('Delete offer error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete offer', error: error.message });
  }
};
