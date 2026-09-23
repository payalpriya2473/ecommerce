import { db } from '../config/db.js';
import { generateDocNumber, incrementPONumber } from './invoiceSettingsController.js';

const generatePONumber = async () => {
  const [rows] = await db.query('SELECT * FROM invoice_settings WHERE id = 1');
  if (!rows.length) return 'PO-0001';
  const row = rows[0];
  let currentNumber = row.po_current_number;
  const now = new Date();
  const last = row.po_last_reset ? new Date(row.po_last_reset) : null;
  const getFY = (d) => d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  let needsReset = false;
  if (row.po_reset_frequency === 'monthly' && last) {
    needsReset = now.getFullYear() !== last.getFullYear() || now.getMonth() !== last.getMonth();
  } else if (row.po_reset_frequency === 'yearly' && last) {
    needsReset = getFY(now) !== getFY(last);
  }
  if (needsReset) {
    currentNumber = row.po_start_number;
    await db.query('UPDATE invoice_settings SET po_current_number = ?, po_last_reset = NOW() WHERE id = 1', [currentNumber]);
  }
  return generateDocNumber(row.po_prefix, row.po_suffix, currentNumber, row.po_reset_frequency);
};

const parseItems = (body) => {
  const raw = body?.items ?? body?.purchaseOrderItems ?? body?.purchase_order_items ?? null;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p : Object.values(p); } catch { return []; }
  }
  if (raw && typeof raw === 'object') return Object.values(raw);
  return [];
};

const toNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const normalizeVariant = (value) => {
  const trimmed = String(value ?? '').trim();
  return trimmed || null;
};

// ─── OPTIMIZED: updateItemNLC ─────────────────────────────────────────────────
// BEFORE: 2 separate UPDATE queries per item in a loop  → 2N round-trips
// AFTER : 1 combined UPDATE per item (folded into single SQL) → N round-trips
//         (further: items with no changes are skipped entirely)
const updateItemNLC = async (items) => {
  for (const item of items) {
    const targetItemId = item.variantId || item.itemId;
    if (!targetItemId) continue;

    const rate = toNum(item.rate);
    const qty  = toNum(item.qty);
    if (rate <= 0 && qty <= 0) continue;

    // Combine both updates into ONE query.
    // stockValue = updated_nlc * updated_openingStock
    // We compute the final value inline so MySQL only touches the row once.
    if (rate > 0 && qty > 0) {
      await db.query(
        `UPDATE items SET
           nlc          = ?,
           openingStock = openingStock + ?,
           stockValue   = ? * (openingStock + ?),
           updatedAt    = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [rate, qty, rate, qty, targetItemId]
      );
    } else if (rate > 0) {
      await db.query(
        `UPDATE items SET
           nlc        = ?,
           stockValue = ? * openingStock,
           updatedAt  = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [rate, rate, targetItemId]
      );
    } else {
      // qty > 0 only — keep existing nlc
      await db.query(
        `UPDATE items SET
           openingStock = openingStock + ?,
           stockValue   = nlc * (openingStock + ?),
           updatedAt    = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [qty, qty, targetItemId]
      );
    }
  }
};

// ─── OPTIMIZED: bulk item insert helper ──────────────────────────────────────
// BEFORE: 1 INSERT per item in a loop → N round-trips
// AFTER : single bulk INSERT VALUES ? → 1 round-trip
const bulkInsertPOItems = async (poId, items) => {
  const rows = items
    .map((item, i) => {
      if (!item.itemId) return null;
      return [
        poId,
        item.itemId    || null,
        item.variantId || null,
        normalizeVariant(item.variant),
        item.brandId   || null,
        item.remarks   || null,
        toNum(item.qty),
        toNum(item.rate),
        toNum(item.amount),
        toNum(item.marginPercent),
        toNum(item.incPercent),
        toNum(item.sgstPercent),
        toNum(item.sgstAmount),
        toNum(item.cgstPercent),
        toNum(item.cgstAmount),
        toNum(item.igstPercent),
        toNum(item.igstAmount),
        i,
      ];
    })
    .filter(Boolean);

  if (rows.length === 0) return;

  await db.query(
    `INSERT INTO purchase_order_items (
       purchaseOrderId, itemId, variantId, variant, brandId, remarks,
       qty, rate, amount, marginPercent, incPercent,
       sgstPercent, sgstAmount, cgstPercent, cgstAmount,
       igstPercent, igstAmount, sortOrder
     ) VALUES ?`,
    [rows]
  );
};

export const createPurchaseOrder = async (req, res) => {
  try {
    const items = parseItems(req.body);
    const {
      supplierId, poDate, paymentTerms, deliverySchedule, transportation,
      remarks, discountPercent, discountAmount, totalAmount,
      sgst, cgst, igst, otherCharges, netAmount,
    } = req.body || {};

    const createdBy = req.user?.userId || req.user?.id || null;

    if (!supplierId || !poDate || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Supplier, PO date, and at least one item are required' });
    }

    const poNumber = await generatePONumber();

    const [result] = await db.query(
      `INSERT INTO purchase_orders
        (poNumber, supplierId, poDate, paymentTerms, deliverySchedule,
         transportation, remarks, discountPercent, discountAmount, totalAmount,
         sgst, cgst, igst, otherCharges, netAmount, createdBy)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        poNumber, supplierId, poDate,
        paymentTerms || null, deliverySchedule || null, transportation || null, remarks || null,
        toNum(discountPercent), toNum(discountAmount), toNum(totalAmount),
        toNum(sgst), toNum(cgst), toNum(igst), toNum(otherCharges), toNum(netAmount),
        createdBy,
      ]
    );

    const poId = result.insertId;
    await incrementPONumber();

    // Bulk insert all items in one query
    await bulkInsertPOItems(poId, items);
    await updateItemNLC(items);

    const [newPO] = await db.query(
      `SELECT po.*, s.name as supplierName FROM purchase_orders po
       LEFT JOIN suppliers s ON po.supplierId = s.id WHERE po.id = ?`,
      [poId]
    );
    const [poItems] = await db.query(
      `SELECT poi.*, i.itemName, i.uom, i.hsnCode, i.gst as gstRate,
              b.name as brandName
       FROM purchase_order_items poi
       LEFT JOIN items i ON poi.itemId = i.id
       LEFT JOIN brands b ON poi.brandId = b.id
       WHERE poi.purchaseOrderId = ?
       ORDER BY poi.sortOrder`,
      [poId]
    );

    return res.status(201).json({
      success: true,
      message: 'Purchase Order created successfully',
      data: { ...newPO[0], items: poItems },
    });
  } catch (error) {
    console.error('Create PO error:', error);
    return res.status(500).json({ success: false, message: 'Server error creating purchase order', error: error.message });
  }
};

// ─── GET ALL (with pagination) ────────────────────────────────────────────────
// BEFORE: correlated subquery per row + no pagination
// AFTER : LEFT JOIN + GROUP BY + LIMIT/OFFSET pagination
export const getAllPurchaseOrders = async (req, res) => {
  try {
    const page    = parseInt(req.query.page  ?? 1,  10);
    const limit   = parseInt(req.query.limit ?? 50, 10);
    const offset  = (page - 1) * limit;
    const paginate = page > 0;

    // Count
    let countQuery = 'SELECT COUNT(*) AS total FROM purchase_orders po WHERE 1=1';
    const countParams = [];
    const [[{ total }]] = await db.query(countQuery, countParams);

    // Data — replace correlated subquery with JOIN + GROUP BY
    let query = `
      SELECT po.*,
             s.name AS supplierName, s.city AS supplierCity,
             (SELECT scp.email
                FROM supplier_contact_persons scp
               WHERE scp.supplierId = s.id AND scp.email IS NOT NULL AND scp.email <> ''
               ORDER BY scp.createdAt ASC
               LIMIT 1) AS supplierEmail,
             (SELECT scp.mobile
                FROM supplier_contact_persons scp
               WHERE scp.supplierId = s.id AND scp.mobile IS NOT NULL AND scp.mobile <> ''
               ORDER BY scp.createdAt ASC
               LIMIT 1) AS supplierPhone,
             COUNT(poi.id) AS itemCount
        FROM purchase_orders po
        LEFT JOIN suppliers            s   ON po.supplierId       = s.id
        LEFT JOIN purchase_order_items poi ON poi.purchaseOrderId = po.id
       WHERE 1=1
    `;
    const params = [];
    query += ' GROUP BY po.id ORDER BY po.createdAt DESC';
    if (paginate) { query += ' LIMIT ? OFFSET ?'; params.push(limit, offset); }

    const [orders] = await db.query(query, params);
    return res.json({
      success: true,
      data: orders,
      pagination: paginate ? { page, limit, total, pages: Math.ceil(total / limit) } : null,
    });
  } catch (error) {
    console.error('Get POs error:', error);
    return res.status(500).json({ success: false, message: 'Server error fetching purchase orders', error: error.message });
  }
};

export const getPurchaseOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const [orders] = await db.query(
      `SELECT po.*, s.name as supplierName, s.city as supplierCity,
              s.gstNumber as supplierGST, s.state as supplierState,
              (SELECT scp.email
                 FROM supplier_contact_persons scp
                WHERE scp.supplierId = s.id AND scp.email IS NOT NULL AND scp.email <> ''
                ORDER BY scp.createdAt ASC
                LIMIT 1) AS supplierEmail,
              (SELECT scp.mobile
                 FROM supplier_contact_persons scp
                WHERE scp.supplierId = s.id AND scp.mobile IS NOT NULL AND scp.mobile <> ''
                ORDER BY scp.createdAt ASC
                LIMIT 1) AS supplierPhone
       FROM purchase_orders po
       LEFT JOIN suppliers s ON po.supplierId = s.id
       WHERE po.id = ?`,
      [id]
    );
    if (orders.length === 0) return res.status(404).json({ success: false, message: 'Purchase Order not found' });

    const [items] = await db.query(
      `SELECT poi.*, i.itemName, i.uom, i.hsnCode, i.gst as gstRate,
              b.name as brandName
       FROM purchase_order_items poi
       LEFT JOIN items i ON poi.itemId = i.id
       LEFT JOIN brands b ON poi.brandId = b.id
       WHERE poi.purchaseOrderId = ?
       ORDER BY poi.sortOrder`,
      [id]
    );
    return res.json({ success: true, data: { ...orders[0], items } });
  } catch (error) {
    console.error('Get PO by ID error:', error);
    return res.status(500).json({ success: false, message: 'Server error fetching purchase order', error: error.message });
  }
};

export const updatePurchaseOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const items  = parseItems(req.body);
    const {
      supplierId, poDate, paymentTerms, deliverySchedule, transportation,
      remarks, discountPercent, discountAmount, totalAmount,
      sgst, cgst, igst, otherCharges, netAmount,
    } = req.body || {};

    const [existing] = await db.query('SELECT id FROM purchase_orders WHERE id = ?', [id]);
    if (existing.length === 0) return res.status(404).json({ success: false, message: 'Purchase Order not found' });

    await db.query(
      `UPDATE purchase_orders SET
        supplierId = ?, poDate = ?, paymentTerms = ?, deliverySchedule = ?,
        transportation = ?, remarks = ?, discountPercent = ?, discountAmount = ?,
        totalAmount = ?, sgst = ?, cgst = ?, igst = ?, otherCharges = ?,
        netAmount = ?
       WHERE id = ?`,
      [
        supplierId, poDate, paymentTerms || null, deliverySchedule || null,
        transportation || null, remarks || null,
        toNum(discountPercent), toNum(discountAmount), toNum(totalAmount),
        toNum(sgst), toNum(cgst), toNum(igst), toNum(otherCharges),
        toNum(netAmount), id,
      ]
    );

    if (items.length > 0) {
      await db.query('DELETE FROM purchase_order_items WHERE purchaseOrderId = ?', [id]);
      // Bulk insert replacement items
      await bulkInsertPOItems(id, items);
      await updateItemNLC(items);
    }

    const [updatedPO] = await db.query(
      `SELECT po.*, s.name as supplierName,
              (SELECT scp.email
                 FROM supplier_contact_persons scp
                WHERE scp.supplierId = s.id AND scp.email IS NOT NULL AND scp.email <> ''
                ORDER BY scp.createdAt ASC
                LIMIT 1) AS supplierEmail,
              (SELECT scp.mobile
                 FROM supplier_contact_persons scp
                WHERE scp.supplierId = s.id AND scp.mobile IS NOT NULL AND scp.mobile <> ''
                ORDER BY scp.createdAt ASC
                LIMIT 1) AS supplierPhone
       FROM purchase_orders po
       LEFT JOIN suppliers s ON po.supplierId = s.id WHERE po.id = ?`,
      [id]
    );
    const [updatedItems] = await db.query(
      `SELECT poi.*, i.itemName, i.uom, i.hsnCode, i.gst as gstRate,
              b.name as brandName
       FROM purchase_order_items poi
       LEFT JOIN items i ON poi.itemId = i.id
       LEFT JOIN brands b ON poi.brandId = b.id
       WHERE poi.purchaseOrderId = ?
       ORDER BY poi.sortOrder`,
      [id]
    );

    return res.json({ success: true, message: 'Purchase Order updated successfully', data: { ...updatedPO[0], items: updatedItems } });
  } catch (error) {
    console.error('Update PO error:', error);
    return res.status(500).json({ success: false, message: 'Server error updating purchase order', error: error.message });
  }
};

export const deletePurchaseOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const [existing] = await db.query('SELECT id FROM purchase_orders WHERE id = ?', [id]);
    if (existing.length === 0) return res.status(404).json({ success: false, message: 'Purchase Order not found' });

    await db.query('DELETE FROM purchase_order_items WHERE purchaseOrderId = ?', [id]);
    await db.query('DELETE FROM purchase_orders WHERE id = ?', [id]);
    return res.json({ success: true, message: 'Purchase Order deleted successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getNextPONumber = async (req, res) => {
  try {
    const poNumber = await generatePONumber();
    return res.json({ success: true, data: { poNumber } });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error generating PO number' });
  }
};

export const getPendingQtyByGroup = async (req, res) => {
  try {
    const excludePoId = req.query?.excludePoId || null;

    let query = `
      SELECT i.itemGroupId, SUM(poi.qty) as pendingQty
      FROM purchase_order_items poi
      JOIN purchase_orders po ON poi.purchaseOrderId = po.id
      JOIN items i ON poi.itemId = i.id
      WHERE i.itemGroupId IS NOT NULL
    `;
    const params = [];

    if (excludePoId)                { query += ' AND po.id != ?';       params.push(excludePoId); }
    query += ' GROUP BY i.itemGroupId';

    const [rows] = await db.query(query, params);
    const result = {};
    rows.forEach((row) => { if (row.itemGroupId) result[row.itemGroupId] = Number(row.pendingQty) || 0; });

    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('getPendingQtyByGroup error:', error);
    return res.status(500).json({ success: false, message: 'Server error fetching pending quantities', error: error.message });
  }
};
