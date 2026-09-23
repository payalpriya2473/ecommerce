import { db } from '../config/db.js';

const normalizeVariant = (value) => {
  const trimmed = String(value ?? '').trim();
  return trimmed || null;
};

const getLineKey = (itemId, variantId = null, variant = null) =>
  `${String(itemId || '')}::${String(variantId || '')}::${String(normalizeVariant(variant) || '').toLowerCase()}`;

const getRemainingQtyMap = async (poIds, excludePiId = null) => {
  if (!poIds.length) return {};
  const placeholders = poIds.map(() => '?').join(',');

  const [poItems] = await db.query(
    `SELECT purchaseOrderId, itemId, variantId, variant, qty
     FROM purchase_order_items
     WHERE purchaseOrderId IN (${placeholders})`,
    poIds
  );

  let invoicedQuery = `
    SELECT pii.purchaseOrderId, pii.itemId, pii.variantId, pii.variant, SUM(pii.qty) AS invoicedQty
    FROM purchase_invoice_items pii
    WHERE pii.purchaseOrderId IN (${placeholders})
  `;
  const invoicedParams = [...poIds];

  if (excludePiId) {
    invoicedQuery += ' AND (pii.purchaseInvoiceId IS NULL OR pii.purchaseInvoiceId != ?)';
    invoicedParams.push(excludePiId);
  }

  invoicedQuery += ' GROUP BY pii.purchaseOrderId, pii.itemId, pii.variantId, pii.variant';
  const [invoicedRows] = await db.query(invoicedQuery, invoicedParams);

  const invoicedMap = {};
  invoicedRows.forEach((row) => {
    if (!invoicedMap[row.purchaseOrderId]) invoicedMap[row.purchaseOrderId] = {};
    invoicedMap[row.purchaseOrderId][getLineKey(row.itemId, row.variantId, row.variant)] = Number(row.invoicedQty);
  });

  const remainingMap = {};
  poItems.forEach((row) => {
    if (!remainingMap[row.purchaseOrderId]) remainingMap[row.purchaseOrderId] = {};
    const lineKey = getLineKey(row.itemId, row.variantId, row.variant);
    const invoiced = (invoicedMap[row.purchaseOrderId] || {})[lineKey] || 0;
    remainingMap[row.purchaseOrderId][lineKey] = Math.max(0, Number(row.qty) - invoiced);
  });

  return remainingMap;
};

// ─── OPTIMIZED: getInvoiceMeta ────────────────────────────────────────────────
// BEFORE: two sequential await db.query calls  → 2 serial round-trips
// AFTER : Promise.all runs both queries in parallel → 1 round-trip worth of latency
const getInvoiceMeta = async (supplierId) => {
  const [supplierResult] = supplierId
    ? await db.query('SELECT name FROM suppliers WHERE id = ?', [supplierId]).catch(() => [[]])
    : [[]];

  return {
    supplierName: supplierResult?.[0]?.name ?? null,
  };
};

// ─── OPTIMIZED: insertSerialRows ──────────────────────────────────────────────
// BEFORE: 1 INSERT per serial token in a nested loop → O(n) round-trips
// AFTER : collect all rows, single bulk INSERT VALUES ? → O(1) round-trips
const insertSerialRows = async (purchaseInvoiceItemId, serialRows, meta = {}) => {
  if (!Array.isArray(serialRows) || serialRows.length === 0) return;

  const {
    supplierName  = null,
    billNumber    = null,
    billDate      = null,
    rate          = null,
  } = meta;

  const insertRows = [];
  for (const row of serialRows) {
    const color  = row.color || null;
    const tokens = String(row.srNo || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    for (const serialNo of tokens) {
      insertRows.push([
        purchaseInvoiceItemId,
        serialNo,
        color,
        'P',
        supplierName,
        billNumber,
        billDate || null,
        rate     || null,
        'in_stock',
      ]);
    }
  }

  if (insertRows.length === 0) return;

  await db.query(
    `INSERT INTO purchase_invoice_item_serials
       (purchaseInvoiceItemId, serialNo, color, type,
        purchaseParty, purchaseBillNo, purchaseDate,
        purchaseRate, status)
     VALUES ?`,
    [insertRows]
  );
};

const deleteSerialsByItemIds = async (itemIds) => {
  if (!itemIds?.length) return;
  await db.query(
    `DELETE FROM purchase_invoice_item_serials
      WHERE purchaseInvoiceItemId IN (?)`,
    [itemIds]
  );
};

const groupSerialsByColor = (flatRows) => {
  const map   = new Map();
  const order = [];
  for (const row of flatRows) {
    const key = row.color || '';
    if (!map.has(key)) { map.set(key, []); order.push(key); }
    map.get(key).push(row.srNo);
  }
  return order.map((key) => ({
    color: key || null,
    srNo:  map.get(key).join(',') + ',',
  }));
};

const getInvoiceItemsByInvoiceId = async (invoiceId, purchaseOrderId = null) => {
  const [items] = await db.query(
    `SELECT pii.*, im.itemName, im.hsnCode, im.uom,
            b.name AS brandName, po.poNumber
     FROM purchase_invoice_items pii
     LEFT JOIN items im ON pii.itemId = im.id
     LEFT JOIN brands b ON pii.brandId = b.id
     LEFT JOIN purchase_orders po ON pii.purchaseOrderId = po.id
     WHERE pii.purchaseInvoiceId = ?
        OR (pii.purchaseInvoiceId IS NULL AND ? IS NOT NULL AND pii.purchaseOrderId = ?)
     ORDER BY pii.sortOrder`,
    [invoiceId, purchaseOrderId, purchaseOrderId]
  );
  return items;
};

export const createPurchaseInvoice = async (req, res) => {
  try {
    let {
      billNumber, billDate, supplierId, purchaseOrderId,
      transporterId, lrNumber, lrDate, remarks,
      discountPercent, discountAmount, freightAmount,
      tcsPercent, tcsAmount, otherAmount, totalAmount,
      sgst, cgst, igst, rcmSgst, rcmCgst, rcmIgst,
      debitNoteAmount, netAmount, items,
    } = req.body;

    const createdBy = req.user?.userId || req.user?.id || null;

    if (!supplierId || !billDate) {
      return res.status(400).json({ success: false, message: 'Supplier and bill date are required' });
    }

    if (typeof items === 'string') items = [items];
    if (!items?.length) {
      return res.status(400).json({ success: false, message: 'At least one item is required' });
    }

    const parsedItems = items.map((item) => (typeof item === 'string' ? JSON.parse(item) : item));
    const allLinkedPOIds = [...new Set(parsedItems.map((item) => item.purchaseOrderId).filter(Boolean).map(String))];
    if (purchaseOrderId && !allLinkedPOIds.includes(String(purchaseOrderId))) allLinkedPOIds.push(String(purchaseOrderId));

    if (allLinkedPOIds.length) {
      const [poChecks] = await db.query(
        `SELECT id FROM purchase_orders WHERE id IN (${allLinkedPOIds.map(() => '?').join(',')})`,
        allLinkedPOIds
      );
      const foundIds = new Set(poChecks.map((row) => String(row.id)));
      for (const poId of allLinkedPOIds) {
        if (!foundIds.has(String(poId))) {
          return res.status(404).json({ success: false, message: `Linked PO ${poId} not found` });
        }
      }

      const remainingMap = await getRemainingQtyMap(allLinkedPOIds);
      for (const item of parsedItems) {
        if (!item.purchaseOrderId || !item.itemId) continue;
        const lineKey   = getLineKey(item.itemId, item.variantId, item.variant);
        const remaining = (remainingMap[item.purchaseOrderId] || {})[lineKey];
        if (remaining !== undefined && Number(item.qty) > remaining) {
          return res.status(400).json({
            success: false,
            message: `Qty ${item.qty} exceeds remaining PO qty (${remaining})`,
          });
        }
      }
    }

    const { supplierName } = await getInvoiceMeta(supplierId);

    const [result] = await db.query(
      `INSERT INTO purchase_invoices
         (billNumber, billDate, supplierId,
          purchaseOrderId, transporterId, lrNumber, lrDate,
          remarks, discountPercent, discountAmount, freightAmount,
          tcsPercent, tcsAmount, otherAmount, totalAmount,
          sgst, cgst, igst, rcmSgst, rcmCgst, rcmIgst,
          debitNoteAmount, netAmount, createdBy)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        billNumber || null, billDate, supplierId,
        purchaseOrderId || null,
        transporterId || null, lrNumber || null, lrDate || null,
        remarks || null,
        discountPercent || 0, discountAmount || 0, freightAmount || 0,
        tcsPercent || 0, tcsAmount || 0, otherAmount || 0, totalAmount || 0,
        sgst || 0, cgst || 0, igst || 0,
        rcmSgst || 0, rcmCgst || 0, rcmIgst || 0,
        debitNoteAmount || 0, netAmount || 0, createdBy || null,
      ]
    );

    const piId = result.insertId;

    for (let i = 0; i < parsedItems.length; i++) {
      const item = parsedItems[i];
      const [itemResult] = await db.query(
        `INSERT INTO purchase_invoice_items
           (purchaseInvoiceId, purchaseOrderId, itemId, variantId, variant, brandId,
            remarks, qty, rate, discountRs, amount, poRate, aTaxPercent,
            sgstPercent, sgstAmount, cgstPercent, cgstAmount,
            igstPercent, igstAmount, sortOrder)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          piId,
          item.purchaseOrderId || null,
          item.itemId          || null,
          item.variantId       || null,
          normalizeVariant(item.variant),
          item.brandId         || null,
          item.remarks         || null,
          item.qty             || 0,
          item.rate            || 0,
          item.discountRs      || 0,
          item.amount          || 0,
          item.poRate          || 0,
          item.aTaxPercent     || 0,
          item.sgstPercent     || 0,
          item.sgstAmount      || 0,
          item.cgstPercent     || 0,
          item.cgstAmount      || 0,
          item.igstPercent     || 0,
          item.igstAmount      || 0,
          i,
        ]
      );

      if (item.serialRows?.length) {
        await insertSerialRows(itemResult.insertId, item.serialRows, {
          supplierName,
          billNumber:    billNumber    || null,
          billDate:      billDate      || null,
          rate:          item.rate     || null,
        });
      }
    }

    return res.status(201).json({ success: true, message: 'Purchase Invoice created', data: { id: piId } });
  } catch (error) {
    console.error('Create PI error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── GET ALL (with pagination) ────────────────────────────────────────────────
// BEFORE: correlated subquery per row + no pagination
// AFTER : LEFT JOIN + GROUP BY for itemCount, plus LIMIT/OFFSET pagination
export const getAllPurchaseInvoices = async (req, res) => {
  try {
    // Pagination (pass page=0 to disable)
    const page    = parseInt(req.query.page  ?? 1,  10);
    const limit   = parseInt(req.query.limit ?? 50, 10);
    const offset  = (page - 1) * limit;
    const paginate = page > 0;

    // ── Count query ──────────────────────────────────────────
    let countQuery = 'SELECT COUNT(*) AS total FROM purchase_invoices pi WHERE 1=1';
    const countParams = [];
    const [[{ total }]] = await db.query(countQuery, countParams);

    // ── Data query: replace correlated subquery with JOIN + GROUP BY ──────────
    let query = `
      SELECT pi.*,
             s.name AS supplierName, s.city AS supplierCity,
             COUNT(pii.id) AS itemCount
        FROM purchase_invoices pi
        LEFT JOIN suppliers             s   ON pi.supplierId        = s.id
        LEFT JOIN purchase_invoice_items pii ON pii.purchaseInvoiceId = pi.id
       WHERE 1=1
    `;
    const params = [];
    query += ' GROUP BY pi.id ORDER BY pi.createdAt DESC';
    if (paginate) { query += ' LIMIT ? OFFSET ?'; params.push(limit, offset); }

    const [invoices] = await db.query(query, params);
    return res.json({
      success: true,
      data:    invoices,
      pagination: paginate ? { page, limit, total, pages: Math.ceil(total / limit) } : null,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── GET BY ID ────────────────────────────────────────────────────────────────
// BEFORE: 1 serial SELECT per item → N+1 queries
// AFTER : 1 serial SELECT for ALL items → 2 total queries for items + serials
export const getPurchaseInvoiceById = async (req, res) => {
  try {
    const { id } = req.params;
    const [invoices] = await db.query(
      `SELECT pi.*, s.name AS supplierName, s.city AS supplierCity,
              s.gstNumber AS supplierGST, s.state AS supplierState
       FROM purchase_invoices pi
       LEFT JOIN suppliers s ON pi.supplierId = s.id
       WHERE pi.id = ?`,
      [id]
    );

    if (!invoices.length) {
      return res.status(404).json({ success: false, message: 'Purchase Invoice not found' });
    }

    const pi    = invoices[0];
    const items = await getInvoiceItemsByInvoiceId(id, pi.purchaseOrderId || null);

    // ── One query for ALL serials across ALL items ─────────────────────────
    if (items.length > 0) {
      const itemIds = items.map((item) => item.id);

      const [allSerials] = await db.query(
        `SELECT
           id, purchaseInvoiceItemId, serialNo AS srNo, color, type, status,
           purchaseParty, purchaseBillNo, purchaseDate, purchaseRate,
           purchaseReturnDate, branchName,
           saleInvoiceId, saleParty, saleDate, saleRate, saleDiscount,
           salesMan, saleBillNo,
           saleReturnInvoiceId, saleReturnDate,
           damagedDesc,
           createdAt, updatedAt
         FROM purchase_invoice_item_serials
         WHERE purchaseInvoiceItemId IN (?)
         ORDER BY id`,
        [itemIds]
      );

      // Group serials by item in JS
      const serialsByItemId = new Map();
      for (const serial of allSerials) {
        const list = serialsByItemId.get(serial.purchaseInvoiceItemId) ?? [];
        list.push(serial);
        serialsByItemId.set(serial.purchaseInvoiceItemId, list);
      }

      for (const item of items) {
        const serials     = serialsByItemId.get(item.id) ?? [];
        item.serialRows   = groupSerialsByColor(serials);
        item.serialList   = serials;
      }
    }

    return res.json({ success: true, data: { ...pi, items } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const updatePurchaseInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      billNumber, billDate, supplierId, purchaseOrderId,
      transporterId, lrNumber, lrDate, remarks,
      discountPercent, discountAmount, freightAmount,
      tcsPercent, tcsAmount, otherAmount, totalAmount,
      sgst, cgst, igst, rcmSgst, rcmCgst, rcmIgst,
      debitNoteAmount, netAmount, items,
    } = req.body;

    let parsedItems = items;
    if (typeof parsedItems === 'string') parsedItems = [parsedItems];
    if (Array.isArray(parsedItems)) {
      parsedItems = parsedItems.map((item) => (typeof item === 'string' ? JSON.parse(item) : item));
    }

    const [existing] = await db.query(
      'SELECT id, purchaseOrderId FROM purchase_invoices WHERE id = ?',
      [id]
    );
    if (!existing.length) {
      return res.status(404).json({ success: false, message: 'Purchase Invoice not found' });
    }

    const newLinkedPOIds = [...new Set(
      [purchaseOrderId, ...(parsedItems || []).map((item) => item.purchaseOrderId)]
        .filter(Boolean)
        .map(String)
    )];

    if (newLinkedPOIds.length && parsedItems?.length) {
      const remainingMap = await getRemainingQtyMap(newLinkedPOIds, id);
      for (const item of parsedItems) {
        if (!item.purchaseOrderId || !item.itemId) continue;
        const lineKey   = getLineKey(item.itemId, item.variantId, item.variant);
        const remaining = (remainingMap[item.purchaseOrderId] || {})[lineKey];
        if (remaining !== undefined && Number(item.qty) > remaining) {
          return res.status(400).json({
            success: false,
            message: `Qty ${item.qty} exceeds remaining PO qty (${remaining})`,
          });
        }
      }
    }

    await db.query(
      `UPDATE purchase_invoices SET
        billNumber=?, billDate=?, supplierId=?,
        purchaseOrderId=?,
        transporterId=?, lrNumber=?, lrDate=?,
        remarks=?, discountPercent=?, discountAmount=?,
        freightAmount=?, tcsPercent=?, tcsAmount=?,
        otherAmount=?, totalAmount=?,
        sgst=?, cgst=?, igst=?,
        rcmSgst=?, rcmCgst=?, rcmIgst=?,
        debitNoteAmount=?, netAmount=?
       WHERE id=?`,
      [
        billNumber || null, billDate, supplierId,
        purchaseOrderId || null,
        transporterId || null, lrNumber || null, lrDate || null,
        remarks || null,
        discountPercent || 0, discountAmount || 0, freightAmount || 0,
        tcsPercent || 0, tcsAmount || 0, otherAmount || 0, totalAmount || 0,
        sgst || 0, cgst || 0, igst || 0,
        rcmSgst || 0, rcmCgst || 0, rcmIgst || 0,
        debitNoteAmount || 0, netAmount || 0,
        id,
      ]
    );

    const { supplierName } = await getInvoiceMeta(supplierId);

    if (Array.isArray(parsedItems)) {
      const [existingItems] = await db.query(
        `SELECT id FROM purchase_invoice_items
         WHERE purchaseInvoiceId = ?
            OR (purchaseInvoiceId IS NULL AND ? IS NOT NULL AND purchaseOrderId = ?)`,
        [id, existing[0].purchaseOrderId || null, existing[0].purchaseOrderId || null]
      );
      const oldItemIds = existingItems.map((row) => row.id).filter(Boolean);
      await deleteSerialsByItemIds(oldItemIds);
      await db.query(
        `DELETE FROM purchase_invoice_items
         WHERE purchaseInvoiceId = ?
            OR (purchaseInvoiceId IS NULL AND ? IS NOT NULL AND purchaseOrderId = ?)`,
        [id, existing[0].purchaseOrderId || null, existing[0].purchaseOrderId || null]
      );

      for (let i = 0; i < parsedItems.length; i++) {
        const item = parsedItems[i];
        const [itemResult] = await db.query(
          `INSERT INTO purchase_invoice_items
             (purchaseInvoiceId, purchaseOrderId, itemId, variantId, variant, brandId,
              remarks, qty, rate, discountRs, amount, poRate, aTaxPercent,
              sgstPercent, sgstAmount, cgstPercent, cgstAmount,
              igstPercent, igstAmount, sortOrder)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            id,
            item.purchaseOrderId || null,
            item.itemId          || null,
            item.variantId       || null,
            normalizeVariant(item.variant),
            item.brandId         || null,
            item.remarks         || null,
            item.qty             || 0,
            item.rate            || 0,
            item.discountRs      || 0,
            item.amount          || 0,
            item.poRate          || 0,
            item.aTaxPercent     || 0,
            item.sgstPercent     || 0,
            item.sgstAmount      || 0,
            item.cgstPercent     || 0,
            item.cgstAmount      || 0,
            item.igstPercent     || 0,
            item.igstAmount      || 0,
            i,
          ]
        );

        if (item.serialRows?.length) {
          await insertSerialRows(itemResult.insertId, item.serialRows, {
            supplierName,
            billNumber:    billNumber    || null,
            billDate:      billDate      || null,
            rate:          item.rate     || null,
          });
        }
      }
    }

    // ── Fetch updated data ─────────────────────────────────────────────────────
    const [updated]      = await db.query(
      `SELECT pi.*, s.name AS supplierName
       FROM purchase_invoices pi
       LEFT JOIN suppliers s ON pi.supplierId = s.id
       WHERE pi.id = ?`,
      [id]
    );
    const updatedItems = await getInvoiceItemsByInvoiceId(
      id, purchaseOrderId || updated[0]?.purchaseOrderId || null
    );

    // ── One query for ALL serials across updated items ─────────────────────
    if (updatedItems.length > 0) {
      const updatedItemIds = updatedItems.map((item) => item.id);
      const [allUpdatedSerials] = await db.query(
        `SELECT id, purchaseInvoiceItemId, serialNo AS srNo, color, type, status,
                purchaseParty, purchaseBillNo, purchaseDate, purchaseRate,
                saleInvoiceId, saleParty, saleDate, saleRate,
                saleDiscount, salesMan, saleBillNo,
                saleReturnInvoiceId, saleReturnDate,
                purchaseReturnDate, branchName, damagedDesc
         FROM purchase_invoice_item_serials
         WHERE purchaseInvoiceItemId IN (?)
         ORDER BY id`,
        [updatedItemIds]
      );

      const serialsByItemId = new Map();
      for (const serial of allUpdatedSerials) {
        const list = serialsByItemId.get(serial.purchaseInvoiceItemId) ?? [];
        list.push(serial);
        serialsByItemId.set(serial.purchaseInvoiceItemId, list);
      }

      for (const item of updatedItems) {
        const serials   = serialsByItemId.get(item.id) ?? [];
        item.serialRows = groupSerialsByColor(serials);
        item.serialList = serials;
      }
    }

    return res.json({
      success: true,
      message: 'Purchase Invoice updated',
      data:    { ...updated[0], items: updatedItems },
    });
  } catch (error) {
    console.error('Update PI error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const deletePurchaseInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const [existing] = await db.query(
      'SELECT id, purchaseOrderId FROM purchase_invoices WHERE id = ?',
      [id]
    );
    if (!existing.length) {
      return res.status(404).json({ success: false, message: 'Purchase Invoice not found' });
    }

    const [itemRows] = await db.query(
      `SELECT id FROM purchase_invoice_items
       WHERE purchaseInvoiceId = ?
          OR (purchaseInvoiceId IS NULL AND ? IS NOT NULL AND purchaseOrderId = ?)`,
      [id, existing[0].purchaseOrderId || null, existing[0].purchaseOrderId || null]
    );
    await deleteSerialsByItemIds(itemRows.map((row) => row.id));
    await db.query(
      `DELETE FROM purchase_invoice_items
       WHERE purchaseInvoiceId = ?
          OR (purchaseInvoiceId IS NULL AND ? IS NOT NULL AND purchaseOrderId = ?)`,
      [id, existing[0].purchaseOrderId || null, existing[0].purchaseOrderId || null]
    );
    await db.query('DELETE FROM purchase_invoices WHERE id = ?', [id]);

    return res.json({ success: true, message: 'Purchase Invoice deleted' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getPOsBySupplier = async (req, res) => {
  try {
    const { supplierId } = req.params;
    const excludePiId = req.query?.excludePiId || null;

    const [allOrders] = await db.query(
      `SELECT po.id, po.poNumber, po.poDate, po.netAmount
         FROM purchase_orders po
        WHERE po.supplierId = ?
        ORDER BY po.createdAt DESC`,
      [supplierId]
    );
    if (!allOrders.length) return res.json({ success: true, data: [] });

    const poIds        = allOrders.map((po) => String(po.id));
    const remainingMap = await getRemainingQtyMap(poIds, excludePiId);

    const availableOrders = allOrders.filter((po) =>
      Object.values(remainingMap[po.id] || {}).some((qty) => qty > 0)
    );
    if (!availableOrders.length) return res.json({ success: true, data: [] });

    const availablePoIds = availableOrders.map((po) => po.id);
    const [allPoItems]   = await db.query(
      `SELECT poi.*, b.name AS brandName, im.itemName
       FROM purchase_order_items poi
       LEFT JOIN brands b  ON poi.brandId = b.id
       LEFT JOIN items  im ON poi.itemId  = im.id
       WHERE poi.purchaseOrderId IN (?)
       ORDER BY poi.sortOrder`,
      [availablePoIds]
    );

    const itemsByPO = {};
    allPoItems.forEach((item) => {
      const poId = String(item.purchaseOrderId);
      if (!itemsByPO[poId]) itemsByPO[poId] = [];
      const remaining = (remainingMap[poId] || {})[getLineKey(item.itemId, item.variantId, item.variant)];
      itemsByPO[poId].push({
        ...item,
        remainingQty: remaining !== undefined ? Math.max(0, remaining) : Number(item.qty),
        pendingQty:   remaining !== undefined ? Math.max(0, remaining) : Number(item.qty),
      });
    });

    return res.json({
      success: true,
      data: availableOrders.map((po) => ({ ...po, items: itemsByPO[String(po.id)] || [] })),
    });
  } catch (error) {
    console.error('getPOsBySupplier error:', error);
    return res.status(500).json({ success: false, message: 'Error fetching purchase orders' });
  }
};

export const getSerialStockReport = async (req, res) => {
  try {
    const { itemId, brandId, status, fromDate, toDate, serialNo } = req.query;

    let query = `
      SELECT
        pi.id                          AS invno,
        im.itemName                    AS item,
        piis.serialNo                  AS srno,
        piis.saleInvoiceId             AS sinvno,
        piis.saleReturnInvoiceId       AS srinvno,
        piis.type                      AS type,
        piis.purchaseParty             AS pparty,
        piis.purchaseBillNo            AS pbillno,
        piis.purchaseDate              AS pdate,
        piis.saleDate                  AS SDATE,
        piis.saleParty                 AS sparty,
        piis.saleRate                  AS srate,
        piis.saleDiscount              AS sdisc,
        piis.salesMan                  AS sremarks,
        piis.saleReturnDate            AS srdate,
        piis.purchaseReturnDate        AS prdate,
        piis.saleBillNo                AS sbno,
        piis.color                     AS color,
        piis.branchName                AS branch,
        piis.purchaseRate              AS prate,
        piis.damagedDesc               AS damagedesc,
        piis.status,
        b.name                         AS brandName,
        po.poNumber,
        piis.id                        AS serialId,
        piis.purchaseInvoiceItemId
      FROM purchase_invoice_item_serials piis
      JOIN purchase_invoice_items pii ON piis.purchaseInvoiceItemId = pii.id
      JOIN purchase_invoices pi ON (pii.purchaseInvoiceId = pi.id OR (pii.purchaseInvoiceId IS NULL AND pii.purchaseOrderId = pi.purchaseOrderId))
      LEFT JOIN items im ON pii.itemId = im.id
      LEFT JOIN brands b ON pii.brandId = b.id
      LEFT JOIN purchase_orders po ON pii.purchaseOrderId = po.id
      WHERE 1=1
    `;
    const params = [];

    if (itemId)   { query += ' AND pii.itemId = ?';        params.push(itemId);  }
    if (brandId)  { query += ' AND pii.brandId = ?';       params.push(brandId); }
    if (status)   { query += ' AND piis.status = ?';       params.push(status);  }
    if (serialNo) { query += ' AND piis.serialNo LIKE ?';  params.push(`%${serialNo}%`); }
    if (fromDate) { query += ' AND pi.billDate >= ?';      params.push(fromDate); }
    if (toDate)   { query += ' AND pi.billDate <= ?';      params.push(toDate);   }

    query += ' ORDER BY piis.id DESC';
    const [rows] = await db.query(query, params);
    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Serial report error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const updateSerial = async (req, res) => {
  try {
    const { serialId } = req.params;
    const {
      status, type,
      saleInvoiceId, saleParty, saleDate, saleRate, saleDiscount,
      salesMan, saleBillNo,
      saleReturnInvoiceId, saleReturnDate,
      purchaseReturnDate,
      branchName, damagedDesc,
    } = req.body;

    const [existing] = await db.query(
      'SELECT id FROM purchase_invoice_item_serials WHERE id = ?',
      [serialId]
    );
    if (!existing.length) {
      return res.status(404).json({ success: false, message: 'Serial not found' });
    }

    await db.query(
      `UPDATE purchase_invoice_item_serials SET
        status              = COALESCE(?, status),
        type                = COALESCE(?, type),
        saleInvoiceId       = COALESCE(?, saleInvoiceId),
        saleParty           = COALESCE(?, saleParty),
        saleDate            = COALESCE(?, saleDate),
        saleRate            = COALESCE(?, saleRate),
        saleDiscount        = COALESCE(?, saleDiscount),
        salesMan            = COALESCE(?, salesMan),
        saleBillNo          = COALESCE(?, saleBillNo),
        saleReturnInvoiceId = COALESCE(?, saleReturnInvoiceId),
        saleReturnDate      = COALESCE(?, saleReturnDate),
        purchaseReturnDate  = COALESCE(?, purchaseReturnDate),
        branchName          = COALESCE(?, branchName),
        damagedDesc         = COALESCE(?, damagedDesc)
       WHERE id = ?`,
      [
        status || null, type || null,
        saleInvoiceId || null, saleParty || null, saleDate || null,
        saleRate || null, saleDiscount || null,
        salesMan || null, saleBillNo || null,
        saleReturnInvoiceId || null, saleReturnDate || null,
        purchaseReturnDate || null,
        branchName || null, damagedDesc || null,
        serialId,
      ]
    );

    const [[updated]] = await db.query(
      'SELECT * FROM purchase_invoice_item_serials WHERE id = ?',
      [serialId]
    );
    return res.json({ success: true, message: 'Serial updated', data: updated });
  } catch (error) {
    console.error('Update serial error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
