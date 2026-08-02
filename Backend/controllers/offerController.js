import db from '../config/db.js';

// ─────────────────────────────────────────────────────────────
// Offers — website offers/flash-sale entries built from Item Master
// ─────────────────────────────────────────────────────────────

// ─── Schema bootstrap ────────────────────────────────────────────────────────
// Exchange offers and the brand-master link were added after the original
// `offers` table shipped. Bring older databases forward automatically so the
// admin form never writes to a column that doesn't exist yet.
let offersSchemaReady = null;

async function columnExists(column, table = 'offers') {
  const [[row]] = await db.query(
    `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return Number(row?.n) > 0;
}

async function tableExists(table) {
  const [[row]] = await db.query(
    `SELECT COUNT(*) AS n FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return Number(row?.n) > 0;
}

async function columnIsNullable(column, table = 'offers') {
  const [[row]] = await db.query(
    `SELECT IS_NULLABLE AS nullable FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return String(row?.nullable || '').toUpperCase() === 'YES';
}

export function ensureOffersSchema() {
  if (!offersSchemaReady) {
    offersSchemaReady = (async () => {
      const additions = [
        // ── Shared ──
        ['description', 'TEXT DEFAULT NULL'],
        ['colorTheme', "VARCHAR(20) DEFAULT 'blue'"],
        ['icon', 'VARCHAR(20) DEFAULT NULL'],
        ['tags', 'VARCHAR(500) DEFAULT NULL'],
        // ── Bank offers ──
        ['bankName', 'VARCHAR(255) DEFAULT NULL'],
        ['bankAbbr', 'VARCHAR(50) DEFAULT NULL'],
        ['offerText', 'VARCHAR(100) DEFAULT NULL'],
        ['offerSub', 'VARCHAR(150) DEFAULT NULL'],
        // ── Brand deals ──
        ['brandDealName', 'VARCHAR(255) DEFAULT NULL'],
        ['discountLabel', 'VARCHAR(100) DEFAULT NULL'],
        ['brandId', 'BIGINT(20) DEFAULT NULL'],
        // ── Coupons ──
        ['couponTitle', 'VARCHAR(255) DEFAULT NULL'],
        ['categoryLabel', 'VARCHAR(100) DEFAULT NULL'],
        ['minOrder', 'DECIMAL(12,2) DEFAULT NULL'],
        ['maxOff', 'DECIMAL(12,2) DEFAULT NULL'],
        ['validTill', 'DATE DEFAULT NULL'],
        // ── Combo deals ──
        ['comboTitle', 'VARCHAR(255) DEFAULT NULL'],
        [
          'comboItems',
          'LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (JSON_VALID(`comboItems`))',
        ],
        // ── Exchange offers ──
        ['exchangeTitle', 'VARCHAR(255) DEFAULT NULL'],
        ['exchangePartnerName', 'VARCHAR(255) DEFAULT NULL'],
        ['ctaText', 'VARCHAR(100) DEFAULT NULL'],
      ];
      for (const [column, definition] of additions) {
        if (!(await columnExists(column))) {
          await db
            .query(`ALTER TABLE offers ADD COLUMN \`${column}\` ${definition}`)
            .catch((e) => console.warn(`[offers] could not add column ${column}:`, e.message));
        }
      }

      // Bank offers, coupons, brand deals, combos and exchange offers have no
      // single product attached, so itemId must be optional.
      if (!(await columnIsNullable('itemId'))) {
        await db
          .query('ALTER TABLE offers MODIFY COLUMN `itemId` BIGINT(20) DEFAULT NULL')
          .catch((e) => console.warn('[offers] could not make itemId nullable:', e.message));
      }

      // Widen the section enum so 'exchange_offer' can be stored.
      await db
        .query(
          `ALTER TABLE offers MODIFY COLUMN section
             ENUM('flash_sale','home_best','bank_offer','brand_deal','coupon','combo','clearance','exchange_offer')
             NOT NULL DEFAULT 'flash_sale'`
        )
        .catch((e) => console.warn('[offers] could not widen section enum:', e.message));

      // Multi-product link table — an offer can cover many items.
      if (!(await tableExists('offer_products'))) {
        await db
          .query(
            `CREATE TABLE IF NOT EXISTS \`offer_products\` (
               \`id\`      BIGINT(20) NOT NULL AUTO_INCREMENT,
               \`offerId\` BIGINT(20) NOT NULL,
               \`itemId\`  BIGINT(20) NOT NULL,
               PRIMARY KEY (\`id\`),
               UNIQUE KEY \`uniq_offer_item\` (\`offerId\`, \`itemId\`),
               KEY \`fk_offer_products_item\` (\`itemId\`),
               CONSTRAINT \`fk_offer_products_offer\` FOREIGN KEY (\`offerId\`)
                 REFERENCES \`offers\` (\`id\`) ON DELETE CASCADE,
               CONSTRAINT \`fk_offer_products_item\` FOREIGN KEY (\`itemId\`)
                 REFERENCES \`items\` (\`id\`) ON DELETE CASCADE
             ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`
          )
          .catch(async (e) => {
            // Foreign keys fail if items/offers use a different engine or key
            // type. Fall back to a plain table so offers still save.
            console.warn('[offers] offer_products with FKs failed, retrying plain:', e.message);
            await db
              .query(
                `CREATE TABLE IF NOT EXISTS \`offer_products\` (
                   \`id\`      BIGINT(20) NOT NULL AUTO_INCREMENT,
                   \`offerId\` BIGINT(20) NOT NULL,
                   \`itemId\`  BIGINT(20) NOT NULL,
                   PRIMARY KEY (\`id\`),
                   UNIQUE KEY \`uniq_offer_item\` (\`offerId\`, \`itemId\`),
                   KEY \`fk_offer_products_item\` (\`itemId\`)
                 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`
              )
              .catch((e2) => console.warn('[offers] could not create offer_products:', e2.message));
          });
      }
    })().catch((e) => {
      offersSchemaReady = null;
      throw e;
    });
  }
  return offersSchemaReady;
}

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
  'brandDealName', 'discountLabel', 'brandId',
  // ── Exchange offer fields (used when section = 'exchange_offer') ──
  'exchangeTitle', 'exchangePartnerName', 'ctaText',
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
         ig.name           AS itemGroupName,
         bd.name           AS brandMasterName,
         bd.iconUrl        AS brandLogo
  FROM offers o
  LEFT JOIN items       i  ON o.itemId       = i.id
  LEFT JOIN brands      b  ON i.brandId      = b.id
  LEFT JOIN item_groups ig ON i.itemGroupId  = ig.id
  LEFT JOIN brands      bd ON o.brandId      = bd.id
`;

// ── GET /api/offers ───────────────────────────────────────────
export const getAllOffers = async (req, res) => {
  try {
  await ensureOffersSchema().catch(() => {});
    res.set('Cache-Control', 'no-store');
    const { section, status, search, page, limit } = req.query;

    const where = [];
    const params = [];
    if (section) { where.push('o.section = ?'); params.push(section); }
    if (status === 'active')   { where.push('o.isActive = 1'); }
    if (status === 'inactive') { where.push('o.isActive = 0'); }
    if (search) {
      const term = `%${search}%`;
      where.push(`(
        i.itemName LIKE ? OR COALESCE(b.name, '') LIKE ? OR COALESCE(o.badge, '') LIKE ?
        OR COALESCE(o.bankName, '') LIKE ? OR COALESCE(o.comboTitle, '') LIKE ?
        OR COALESCE(o.couponCode, '') LIKE ? OR COALESCE(o.couponTitle, '') LIKE ?
        OR COALESCE(o.categoryLabel, '') LIKE ? OR COALESCE(o.brandDealName, '') LIKE ?
        OR COALESCE(o.exchangeTitle, '') LIKE ?
      )`);
      params.push(term, term, term, term, term, term, term, term, term, term);
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
  await ensureOffersSchema().catch(() => {});
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
  await ensureOffersSchema().catch(() => {});
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
    const isExchange = body.section === 'exchange_offer';
    const isProductBased = !isBankOffer && !isCombo && !isCoupon && !isBrand && !isExchange;

    // Belt-and-suspenders: once the offer type is classified above, pin
    // `section` to its exact canonical string instead of trusting whatever
    // the client sent through. This guarantees a bank/exchange/coupon/brand/
    // combo offer can never be persisted with a blank or mismatched section
    // (which would make it invisible in its own admin list and on the
    // website, even though every other field saved correctly).
    if (isBankOffer) body.section = 'bank_offer';
    else if (isExchange) body.section = 'exchange_offer';
    else if (isCombo) body.section = 'combo';
    else if (isCoupon) body.section = 'coupon';
    else if (isBrand) body.section = 'brand_deal';

    if (isBankOffer) {
      if (!body.bankName) return res.status(400).json({ success: false, message: 'bankName is required for a bank offer' });
    } else if (isExchange) {
      if (!body.exchangeTitle) return res.status(400).json({ success: false, message: 'An exchange offer title is required' });
    } else if (isCombo) {
      if (!body.comboTitle) return res.status(400).json({ success: false, message: 'A combo title is required' });
      const items = Array.isArray(body.comboItems) ? body.comboItems.filter((x) => x && x.itemId) : [];
      if (items.length < 2) return res.status(400).json({ success: false, message: 'A combo needs at least 2 products' });
    } else if (isCoupon) {
      if (!body.couponCode) return res.status(400).json({ success: false, message: 'A coupon code is required' });
      if (!body.couponTitle) return res.status(400).json({ success: false, message: 'A coupon title is required' });
      const [dupRows] = await db.query(
        "SELECT id FROM offers WHERE section = 'coupon' AND isActive = 1 AND UPPER(couponCode) = UPPER(?) LIMIT 1",
        [body.couponCode],
      );
      if (dupRows.length) {
        return res.status(409).json({ success: false, message: `An active coupon with code "${body.couponCode}" already exists` });
      }
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
  await ensureOffersSchema().catch(() => {});
    const { id } = req.params;
    const body = req.body || {};

    const [existing] = await db.query('SELECT id FROM offers WHERE id = ?', [id]);
    if (!existing.length) return res.status(404).json({ success: false, message: 'Offer not found' });

    // Never let an edit blank out an offer's section — a missing/empty value
    // here would silently make the offer invisible in its own admin list and
    // on the website without any validation error being raised.
    if (body.section !== undefined && !body.section) delete body.section;

    if (body.section === 'coupon' && body.couponCode) {
      const [dupRows] = await db.query(
        "SELECT id FROM offers WHERE section = 'coupon' AND isActive = 1 AND UPPER(couponCode) = UPPER(?) AND id != ? LIMIT 1",
        [body.couponCode, id],
      );
      if (dupRows.length) {
        return res.status(409).json({ success: false, message: `An active coupon with code "${body.couponCode}" already exists` });
      }
    }

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
  await ensureOffersSchema().catch(() => {});
    await db.query('DELETE FROM offer_products WHERE offerId = ?', [req.params.id]);
    const [result] = await db.query('DELETE FROM offers WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Offer not found' });
    return res.status(200).json({ success: true, message: 'Offer deleted' });
  } catch (error) {
    console.error('Delete offer error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete offer', error: error.message });
  }
};
