import { db } from '../config/db.js';
import { incrementSINumber } from './invoiceSettingsController.js';

const normalizeVariant = (value) => {
  const trimmed = String(value ?? '').trim();
  return trimmed || null;
};


const groupSerialsByColor = (flatRows) => {
  const map   = new Map();
  const order = [];
  for (const row of flatRows) {
    const key = row.color || '';
    if (!map.has(key)) { map.set(key, []); order.push(key); }
    map.get(key).push(row.serialNo);
  }
  return order.map((key) => ({
    color: key || null,
    srNo:  map.get(key).join(',') + ',',
  }));
};


// ─── OPTIMIZED: insertSaleSerials ────────────────────────────────────────────
// BEFORE: 3 sequential queries per serial (SELECT + INSERT + UPDATE) → O(n) round-trips
// AFTER : 1 bulk SELECT  +  1 bulk INSERT  +  1 bulk UPDATE           → O(1) round-trips
const insertSaleSerials = async (salesInvoiceItemId, serialRows, saleCtx = {}) => {
  if (!Array.isArray(serialRows) || serialRows.length === 0) return;

  // 1. Flatten all (serialNo, color) pairs
  const serialEntries = []; // { serialNo, color }
  for (const row of serialRows) {
    const color  = row.color || null;
    const tokens = String(row.srNo || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const serialNo of tokens) {
      serialEntries.push({ serialNo, color });
    }
  }
  if (serialEntries.length === 0) return;

  const serialNos = serialEntries.map((e) => e.serialNo);

  // 2. One batch SELECT for all serial numbers
  const [purchaseSerials] = await db.query(
    `SELECT id, serialNo, purchaseParty, purchaseBillNo, purchaseDate, purchaseRate, branchName
       FROM purchase_invoice_item_serials
      WHERE serialNo IN (?) AND status = 'in_stock'`,
    [serialNos]
  );

  // Build a map: serialNo → purchase serial row
  const purchaseSerialMap = new Map();
  for (const ps of purchaseSerials) {
    // Keep first match per serialNo (mimics the original LIMIT 1 per serial)
    if (!purchaseSerialMap.has(ps.serialNo)) purchaseSerialMap.set(ps.serialNo, ps);
  }

  // 3. Bulk INSERT into sales_invoice_item_serials
  const insertRows = serialEntries.map(({ serialNo, color }) => {
    const ps = purchaseSerialMap.get(serialNo);
    return [
      salesInvoiceItemId,
      ps?.id             ?? null,
      serialNo,
      color,
      ps?.purchaseParty  ?? null,
      ps?.purchaseBillNo ?? null,
      ps?.purchaseDate   ?? null,
      ps?.purchaseRate   ?? null,
      ps?.branchName     ?? null,
    ];
  });

  await db.query(
    `INSERT INTO sales_invoice_item_serials
       (salesInvoiceItemId, purchaseSerialId, serialNo, color,
        purchaseParty, purchaseBillNo, purchaseDate, purchaseRate, branchName)
     VALUES ?`,
    [insertRows]
  );

  // 4. Bulk UPDATE matched purchase serials in one statement
  const matchedIds = serialEntries
    .map(({ serialNo }) => purchaseSerialMap.get(serialNo)?.id)
    .filter(Boolean);

  if (matchedIds.length > 0) {
    await db.query(
      `UPDATE purchase_invoice_item_serials SET
         status = 'sold',
         saleInvoiceId = ?,
         saleParty     = ?,
         saleDate      = ?,
         saleRate      = ?,
         saleBillNo    = ?
       WHERE id IN (?) AND status = 'in_stock'`,
      [
        saleCtx.salesInvoiceId || null,
        saleCtx.partyName      || null,
        saleCtx.billDate       || null,
        saleCtx.rate           || null,
        saleCtx.billNumber     || null,
        matchedIds,
      ]
    );
  }
};


// ─── OPTIMIZED: deleteSaleSerialsByItemIds ───────────────────────────────────
// BEFORE: 1 UPDATE query per purchaseSerial in a loop → O(n) round-trips
// AFTER : 1 bulk UPDATE using WHERE id IN (...)       → O(1) round-trips
const deleteSaleSerialsByItemIds = async (salesItemIds) => {
  if (!salesItemIds?.length) return;

  const [purchaseLinks] = await db.query(
    `SELECT purchaseSerialId FROM sales_invoice_item_serials
      WHERE salesInvoiceItemId IN (?)
        AND purchaseSerialId IS NOT NULL`,
    [salesItemIds]
  );

  const purchaseSerialIds = purchaseLinks.map((r) => r.purchaseSerialId).filter(Boolean);

  if (purchaseSerialIds.length > 0) {
    // Single bulk UPDATE instead of N individual UPDATEs
    await db.query(
      `UPDATE purchase_invoice_item_serials SET
         status        = 'in_stock',
         saleInvoiceId = NULL,
         saleParty     = NULL,
         saleDate      = NULL,
         saleRate      = NULL,
         saleBillNo    = NULL
       WHERE id IN (?)`,
      [purchaseSerialIds]
    );
  }

  await db.query(
    `DELETE FROM sales_invoice_item_serials
      WHERE salesInvoiceItemId IN (?)`,
    [salesItemIds]
  );
};


export const lookupSerial = async (req, res) => {
  try {
    const { serialNo } = req.params;
    if (!serialNo?.trim())
      return res.status(400).json({ success: false, message: 'serialNo is required' });

    const [[serial]] = await db.query(
      `SELECT
         piis.id, piis.serialNo, piis.color, piis.status,
         piis.purchaseParty, piis.purchaseBillNo, piis.purchaseDate,
         piis.purchaseRate, piis.branchName,
         pii.itemId, pii.variantId, pii.variant, pii.brandId, pii.qty, pii.rate,
         im.itemName, im.gst AS gstPercent, im.hsnCode, im.uom,
         b.name AS brandName
       FROM purchase_invoice_item_serials piis
       JOIN purchase_invoice_items pii ON piis.purchaseInvoiceItemId = pii.id
       LEFT JOIN items  im ON pii.itemId  = im.id
       LEFT JOIN brands b  ON pii.brandId = b.id
       WHERE piis.serialNo = ?
       LIMIT 1`,
      [serialNo.trim()]
    );

    if (!serial)
      return res.status(404).json({ success: false, message: 'Serial number not found' });

    if (serial.status !== 'in_stock')
      return res.status(409).json({
        success: false,
        message: `Serial ${serialNo} is already ${serial.status}`,
        data: serial,
      });

    return res.json({ success: true, data: serial });
  } catch (error) {
    console.error('lookupSerial error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── LOOKUP PARTY BY MOBILE ───────────────────────────────────────────────────
export const lookupPartyByMobile = async (req, res) => {
  try {
    const { mobileNo } = req.params;
    if (!mobileNo?.trim())
      return res.status(400).json({ success: false, message: 'mobileNo is required' });

    const [[invoice]] = await db.query(
      `SELECT customerId, partyName, address, partyCityVillage, mobileNo, adharNo
         FROM sales_invoices
        WHERE mobileNo = ?
        ORDER BY createdAt DESC
        LIMIT 1`,
      [mobileNo.trim()]
    );

    if (!invoice)
      return res.json({ success: true, found: false, data: null });

    return res.json({ success: true, found: true, data: invoice });
  } catch (error) {
    console.error('lookupPartyByMobile error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── GET NEXT BILL NUMBER ─────────────────────────────────────────────────────
export const getNextBillNumber = async (req, res) => {
  try {
    const { getNextSINumber } = await import('./invoiceSettingsController.js');
    const billNumber = await getNextSINumber();
    return res.json({ success: true, billNumber });
  } catch (error) {
    console.error('getNextBillNumber error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── CREATE ───────────────────────────────────────────────────────────────────
export const createSalesInvoice = async (req, res) => {
  try {
    let {
      companyId, branchId, billNumber, billDate,
      customerId, partyName, address, partyCityVillage, mobileNo, adharNo, otpVerified,
      reference1, reference1Address, reference1City, reference1Mobile,
      reference2, reference2Address, reference2City, reference2Mobile,
      discountPercent, discountAmount, freightAmount, scheme, otherCharges,
      processingFees1, processingFees2, installationAmt, totalAmount,
      sgst, cgst, igst, netAmount,
      mop, booking, buyBack, margin, cashMargin, onlineMargin, balance,
      cashbookId, bankBookId, utrNumber, paymentAtDelivery,
      fAmt1, fComp1, dbd1, fileNo1,
      fAmt2, fComp2, dbd2, fileNo2,
      salesmanId, remarks,
      installments, items,
    } = req.body;

    const resolvedCompanyId = companyId || req.user?.companyId || null;
    const createdBy         = req.user?.userId || req.user?.id || null;

    if (!resolvedCompanyId || !billDate || !partyName?.trim())
      return res.status(400).json({
        success: false,
        message: 'companyId, billDate and partyName are required',
      });

    if (typeof items === 'string') items = [items];
    if (!items?.length)
      return res.status(400).json({ success: false, message: 'At least one item is required' });

    const parsedItems = items.map((i) => (typeof i === 'string' ? JSON.parse(i) : i));

    // ── Insert header ──────────────────────────────────────────────────────────
    const [result] = await db.query(
      `INSERT INTO sales_invoices
         (companyId, branchId, billNumber, billDate,
          customerId, partyName, address, partyCityVillage, mobileNo, adharNo, otpVerified,
          reference1, reference1Address, reference1City, reference1Mobile,
          reference2, reference2Address, reference2City, reference2Mobile,
          discountPercent, discountAmount, freightAmount, scheme, otherCharges,
          processingFees1, processingFees2, installationAmt, totalAmount,
          sgst, cgst, igst, netAmount,
          mop, booking, buyBack, margin, cashMargin, onlineMargin, balance,
          cashbookId, bankBookId, utrNumber, paymentAtDelivery,
          fAmt1, fComp1, dbd1, fileNo1,
          fAmt2, fComp2, dbd2, fileNo2,
          salesmanId, remarks, createdBy)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        resolvedCompanyId, branchId || null, billNumber || null, billDate,
        customerId || null, partyName, address || null, partyCityVillage || null,
        mobileNo || null, adharNo || null, otpVerified ? 1 : 0,
        reference1 || null, reference1Address || null, reference1City || null, reference1Mobile || null,
        reference2 || null, reference2Address || null, reference2City || null, reference2Mobile || null,
        discountPercent || 0, discountAmount || 0, freightAmount || 0, scheme || 0, otherCharges || 0,
        processingFees1 || 0, processingFees2 || 0, installationAmt || 0, totalAmount || 0,
        sgst || 0, cgst || 0, igst || 0, netAmount || 0,
        mop || null, booking || 0, buyBack || 0, margin || 0, cashMargin || 0,
        onlineMargin || 0, balance || 0,
        cashbookId || null, bankBookId || null, utrNumber || null, paymentAtDelivery ? 1 : 0,
        fAmt1 || 0, fComp1 || null, dbd1 || 0, fileNo1 || null,
        fAmt2 || 0, fComp2 || null, dbd2 || 0, fileNo2 || null,
        salesmanId || null, remarks || null, createdBy,
      ]
    );

    const salesInvoiceId = result.insertId;

    // ── Insert items + serials ─────────────────────────────────────────────────
    for (let i = 0; i < parsedItems.length; i++) {
      const item = parsedItems[i];

      const [itemResult] = await db.query(
        `INSERT INTO sales_invoice_items
           (salesInvoiceId, itemId, variantId, variant, brandId, itemName, brandName, remarks,
            qty, rate, amount, scheme, discountPercent, discountRs,
            gstPercent, sgstPercent, sgstAmount, cgstPercent, cgstAmount,
            igstPercent, igstAmount,
            incPercent, incentive, buyBack, installation, bookingAmount,
            demo, selfDelivery,
            sortOrder)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          salesInvoiceId,
          item.itemId   || null,
          item.variantId || null,
          normalizeVariant(item.variant),
          item.brandId  || null,
          item.itemName || '',
          item.brandName || null,
          item.remarks  || null,
          item.qty           || 0,
          item.rate          || 0,
          item.amount        || 0,
          item.scheme        || 0,
          item.discountPercent || 0,
          item.discountRs    || 0,
          item.gstPercent    || 0,
          item.sgstPercent   || 0,
          item.sgstAmount    || 0,
          item.cgstPercent   || 0,
          item.cgstAmount    || 0,
          item.igstPercent   || 0,
          item.igstAmount    || 0,
          item.incPercent    || 0,
          item.incentive     || 0,
          item.buyBack       || 0,
          item.installation  || 0,
          item.bookingAmount || 0,
          item.demo          ? 1 : 0,
          item.selfDelivery  ? 1 : 0,
          i,
        ]
      );

      if (item.serialRows?.length) {
        await insertSaleSerials(itemResult.insertId, item.serialRows, {
          salesInvoiceId,
          partyName,
          billDate,
          billNumber: billNumber || null,
          rate:       item.rate  || null,
        });
      }
    }

    // ── Insert installments (bulk) ─────────────────────────────────────────────
    if (Array.isArray(installments) && installments.length > 0) {
      const validInstallments = installments
        .map((inst, i) => [
          salesInvoiceId,
          inst.instAmt  || 0,
          inst.noOfInst || 0,
          inst.totalAmt || 0,
          inst.stDate   || null,
          inst.days     || 0,
          i,
        ])
        .filter(row => row[1] > 0); // filter instAmt > 0

      if (validInstallments.length > 0) {
        await db.query(
          `INSERT INTO sales_invoice_installments
             (salesInvoiceId, instAmt, noOfInst, totalAmt, stDate, days, sortOrder)
           VALUES ?`,
          [validInstallments]
        );
      }
    }

    // ── Increment SI counter AFTER successful insert ───────────────────────────
    await incrementSINumber();

    return res.status(201).json({
      success: true,
      message: 'Sales Invoice created',
      data:    { id: salesInvoiceId },
    });
  } catch (error) {
    console.error('createSalesInvoice error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── GET ALL (with pagination) ────────────────────────────────────────────────
// BEFORE: correlated subquery per row + no pagination (full table scan on large data)
// AFTER : LEFT JOIN + GROUP BY for itemCount, plus LIMIT/OFFSET pagination
export const getAllSalesInvoices = async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    const userRole  = req.user?.role;

    // Pagination params (default: page 1, 50 per page; pass page=0 to get all)
    const page    = parseInt(req.query.page  ?? 1,  10);
    const limit   = parseInt(req.query.limit ?? 50, 10);
    const offset  = (page - 1) * limit;
    const paginate = page > 0;

    // ── Count query ──────────────────────────────────────────
    let countQuery = 'SELECT COUNT(*) AS total FROM sales_invoices si WHERE 1=1';
    const countParams = [];
    if (userRole !== 'super_admin') { countQuery += ' AND si.companyId = ?'; countParams.push(companyId); }
    const [[{ total }]] = await db.query(countQuery, countParams);

    // ── Data query: replace correlated subquery with JOIN + GROUP BY ──────────
    let query = `
      SELECT si.*,
             b.name AS branchName,
             COUNT(sii.id) AS itemCount
        FROM sales_invoices si
        LEFT JOIN branches            b   ON si.branchId        = b.id
        LEFT JOIN sales_invoice_items sii ON sii.salesInvoiceId = si.id
       WHERE 1=1
    `;
    const params = [];
    if (userRole !== 'super_admin') { query += ' AND si.companyId = ?'; params.push(companyId); }
    query += ' GROUP BY si.id ORDER BY si.createdAt DESC';
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
export const getSalesInvoiceById = async (req, res) => {
  try {
    const { id } = req.params;

    const [invoices] = await db.query(
      `SELECT si.*, b.name AS branchName
         FROM sales_invoices si
         LEFT JOIN branches b ON si.branchId = b.id
        WHERE si.id = ?`,
      [id]
    );
    if (!invoices.length)
      return res.status(404).json({ success: false, message: 'Sales Invoice not found' });

    const si = invoices[0];

    // Fetch all items for this invoice
    const [items] = await db.query(
      `SELECT sii.*, im.hsnCode, im.uom
         FROM sales_invoice_items sii
         LEFT JOIN items im ON sii.itemId = im.id
        WHERE sii.salesInvoiceId = ?
        ORDER BY sii.sortOrder`,
      [id]
    );

    // ── One query for ALL serials across ALL items ─────────────────────────
    if (items.length > 0) {
      const itemIds = items.map((item) => item.id);

      const [allSerials] = await db.query(
        `SELECT id, salesInvoiceItemId, serialNo, color, purchaseParty, purchaseBillNo,
                purchaseDate, purchaseRate, branchName, purchaseSerialId
           FROM sales_invoice_item_serials
          WHERE salesInvoiceItemId IN (?)
          ORDER BY id`,
        [itemIds]
      );

      // Group serials by salesInvoiceItemId in JS
      const serialsByItemId = new Map();
      for (const serial of allSerials) {
        const list = serialsByItemId.get(serial.salesInvoiceItemId) ?? [];
        list.push(serial);
        serialsByItemId.set(serial.salesInvoiceItemId, list);
      }

      for (const item of items) {
        const serials = serialsByItemId.get(item.id) ?? [];
        item.serialRows = groupSerialsByColor(serials);
        item.serialList = serials;
      }
    }

    const [installments] = await db.query(
      `SELECT * FROM sales_invoice_installments
        WHERE salesInvoiceId = ? ORDER BY sortOrder`,
      [id]
    );

    return res.json({ success: true, data: { ...si, items, installments } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── UPDATE ───────────────────────────────────────────────────────────────────
export const updateSalesInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    let {
      branchId, billNumber, billDate,
      customerId, partyName, address, partyCityVillage, mobileNo, adharNo, otpVerified,
      reference1, reference1Address, reference1City, reference1Mobile,
      reference2, reference2Address, reference2City, reference2Mobile,
      discountPercent, discountAmount, freightAmount, scheme, otherCharges,
      processingFees1, processingFees2, installationAmt, totalAmount,
      sgst, cgst, igst, netAmount,
      mop, booking, buyBack, margin, cashMargin, onlineMargin, balance,
      cashbookId, bankBookId, utrNumber, paymentAtDelivery,
      fAmt1, fComp1, dbd1, fileNo1,
      fAmt2, fComp2, dbd2, fileNo2,
      salesmanId, remarks,
      installments, items,
    } = req.body;

    const [existing] = await db.query(
      'SELECT id FROM sales_invoices WHERE id = ?', [id]
    );
    if (!existing.length)
      return res.status(404).json({ success: false, message: 'Sales Invoice not found' });

    // ── Update header ──────────────────────────────────────────────────────────
    await db.query(
      `UPDATE sales_invoices SET
         branchId=?, billNumber=?, billDate=?,
         customerId=?, partyName=?, address=?, partyCityVillage=?, mobileNo=?,
         adharNo=?, otpVerified=?,
         reference1=?, reference1Address=?, reference1City=?, reference1Mobile=?,
         reference2=?, reference2Address=?, reference2City=?, reference2Mobile=?,
         discountPercent=?, discountAmount=?, freightAmount=?, scheme=?, otherCharges=?,
         processingFees1=?, processingFees2=?, installationAmt=?, totalAmount=?,
         sgst=?, cgst=?, igst=?, netAmount=?,
         mop=?, booking=?, buyBack=?, margin=?, cashMargin=?, onlineMargin=?, balance=?,
         cashbookId=?, bankBookId=?, utrNumber=?, paymentAtDelivery=?,
         fAmt1=?, fComp1=?, dbd1=?, fileNo1=?,
         fAmt2=?, fComp2=?, dbd2=?, fileNo2=?,
         salesmanId=?, remarks=?
       WHERE id=?`,
      [
        branchId || null, billNumber || null, billDate,
        customerId || null, partyName, address || null, partyCityVillage || null,
        mobileNo || null, adharNo || null, otpVerified ? 1 : 0,
        reference1 || null, reference1Address || null, reference1City || null, reference1Mobile || null,
        reference2 || null, reference2Address || null, reference2City || null, reference2Mobile || null,
        discountPercent || 0, discountAmount || 0, freightAmount || 0, scheme || 0, otherCharges || 0,
        processingFees1 || 0, processingFees2 || 0, installationAmt || 0, totalAmount || 0,
        sgst || 0, cgst || 0, igst || 0, netAmount || 0,
        mop || null, booking || 0, buyBack || 0, margin || 0, cashMargin || 0,
        onlineMargin || 0, balance || 0,
        cashbookId || null, bankBookId || null, utrNumber || null, paymentAtDelivery ? 1 : 0,
        fAmt1 || 0, fComp1 || null, dbd1 || 0, fileNo1 || null,
        fAmt2 || 0, fComp2 || null, dbd2 || 0, fileNo2 || null,
        salesmanId || null, remarks || null,
        id,
      ]
    );

    // ── Replace items ──────────────────────────────────────────────────────────
    if (Array.isArray(items)) {
      const parsedItems = items.map((i) => (typeof i === 'string' ? JSON.parse(i) : i));

      const [oldItems] = await db.query(
        'SELECT id FROM sales_invoice_items WHERE salesInvoiceId = ?', [id]
      );
      await deleteSaleSerialsByItemIds(oldItems.map((r) => r.id));
      await db.query('DELETE FROM sales_invoice_items WHERE salesInvoiceId = ?', [id]);

      for (let i = 0; i < parsedItems.length; i++) {
        const item = parsedItems[i];

        const [itemResult] = await db.query(
          `INSERT INTO sales_invoice_items
             (salesInvoiceId, itemId, variantId, variant, brandId, itemName, brandName, remarks,
              qty, rate, amount, scheme, discountPercent, discountRs,
              gstPercent, sgstPercent, sgstAmount, cgstPercent, cgstAmount,
              igstPercent, igstAmount,
              incPercent, incentive, buyBack, installation, bookingAmount,
              demo, selfDelivery,
              sortOrder)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            id,
            item.itemId    || null,
            item.variantId || null,
            normalizeVariant(item.variant),
            item.brandId   || null,
            item.itemName  || '',
            item.brandName || null,
            item.remarks   || null,
            item.qty           || 0,
            item.rate          || 0,
            item.amount        || 0,
            item.scheme        || 0,
            item.discountPercent || 0,
            item.discountRs    || 0,
            item.gstPercent    || 0,
            item.sgstPercent   || 0,
            item.sgstAmount    || 0,
            item.cgstPercent   || 0,
            item.cgstAmount    || 0,
            item.igstPercent   || 0,
            item.igstAmount    || 0,
            item.incPercent    || 0,
            item.incentive     || 0,
            item.buyBack       || 0,
            item.installation  || 0,
            item.bookingAmount || 0,
            item.demo          ? 1 : 0,
            item.selfDelivery  ? 1 : 0,
            i,
          ]
        );

        if (item.serialRows?.length) {
          await insertSaleSerials(itemResult.insertId, item.serialRows, {
            salesInvoiceId: id,
            partyName,
            billDate,
            billNumber: billNumber || null,
            rate:       item.rate  || null,
          });
        }
      }
    }

    // ── Replace installments (bulk) ────────────────────────────────────────────
    if (Array.isArray(installments)) {
      await db.query('DELETE FROM sales_invoice_installments WHERE salesInvoiceId = ?', [id]);

      const validInstallments = installments
        .map((inst, i) => [
          id,
          inst.instAmt  || 0,
          inst.noOfInst || 0,
          inst.totalAmt || 0,
          inst.stDate   || null,
          inst.days     || 0,
          i,
        ])
        .filter(row => row[1] > 0);

      if (validInstallments.length > 0) {
        await db.query(
          `INSERT INTO sales_invoice_installments
             (salesInvoiceId, instAmt, noOfInst, totalAmt, stDate, days, sortOrder)
           VALUES ?`,
          [validInstallments]
        );
      }
    }

    const [updated]      = await db.query(
      `SELECT si.*, b.name AS branchName
         FROM sales_invoices si
         LEFT JOIN branches b ON si.branchId = b.id
        WHERE si.id = ?`,
      [id]
    );
    const [updatedItems] = await db.query(
      `SELECT sii.* FROM sales_invoice_items sii WHERE sii.salesInvoiceId = ? ORDER BY sii.sortOrder`,
      [id]
    );

    return res.json({
      success: true,
      message: 'Sales Invoice updated',
      data:    { ...updated[0], items: updatedItems },
    });
  } catch (error) {
    console.error('updateSalesInvoice error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── DELETE ───────────────────────────────────────────────────────────────────
export const deleteSalesInvoice = async (req, res) => {
  try {
    const { id } = req.params;

    const [existing] = await db.query('SELECT id FROM sales_invoices WHERE id = ?', [id]);
    if (!existing.length)
      return res.status(404).json({ success: false, message: 'Sales Invoice not found' });

    const [itemRows] = await db.query('SELECT id FROM sales_invoice_items WHERE salesInvoiceId = ?', [id]);
    await deleteSaleSerialsByItemIds(itemRows.map((r) => r.id));
    await db.query('DELETE FROM sales_invoices WHERE id = ?', [id]);

    return res.json({ success: true, message: 'Sales Invoice deleted' });
  } catch (error) {
    console.error('deleteSalesInvoice error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
