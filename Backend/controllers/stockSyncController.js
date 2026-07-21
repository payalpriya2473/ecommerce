

import db from '../config/db.js';
import { runStockSync } from '../services/stockSyncService.js';

const DEFAULT_COMPANY_CODE = process.env.STOCK_SYNC_COMPANY_CODE || '';


export const syncNow = async (req, res) => {
  try {
    const company_code = req.body.company_code || DEFAULT_COMPANY_CODE;
    if (!company_code) {
      return res.status(400).json({ success: false, message: 'company_code is required (or set STOCK_SYNC_COMPANY_CODE in .env)' });
    }
    const { itemgroup, item, brand, branch } = req.body;
    const result = await runStockSync({ trigger: 'manual', companyCode: company_code, filters: { itemgroup, item, brand, branch } });

    const d = result.diagnostics || {};
    let note;
    if (!d.masterKeysPresent || d.masterKeysPresent.length === 0) {
      note = `⚠ API response did NOT contain master fields. The deployed PHP is still the OLD version — `
           + `add the master fields to $itemData in stock-for-new-program.php. Keys returned: [${(d.firstRowKeys || []).join(', ')}]`;
    } else if (!d.masterFieldsOk) {
      note = `Master fields present but EMPTY in source data: [${d.masterKeysPresent.join(', ')}].`;
    } else {
      note = `Master fields received OK: [${d.masterKeysWithValues.join(', ')}].`;
    }
    return res.json({ success: result.success, message: `Sync completed. ${note}`, result });
  } catch (err) {
    console.error('[stockSyncController] syncNow error:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};


export const getSyncStatus = async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT * FROM stock_sync_log ORDER BY startedAt DESC LIMIT 10');
    return res.json({ success: true, latest: rows[0] || null, history: rows });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};


export const getLiveStock = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page, 10)  || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 100));
    const offset = (page - 1) * limit;

    const where = [];
    const params = [];
    if (req.query.search) {
      where.push('(itemName LIKE ? OR brand LIKE ? OR itemGroup LIKE ? OR category LIKE ? OR hsnCode LIKE ?)');
      const s = `%${req.query.search}%`; params.push(s, s, s, s, s);
    }
    if (req.query.itemgroup) { where.push('itemGroup = ?'); params.push(req.query.itemgroup); }
    if (req.query.brand)     { where.push('brand = ?');     params.push(req.query.brand); }
    if (req.query.category)  { where.push('category = ?');  params.push(req.query.category); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [countRows] = await db.execute(`SELECT COUNT(*) AS total FROM live_stock ${whereSql}`, params);
    const [rows] = await db.execute(
      `SELECT * FROM live_stock ${whereSql} ORDER BY itemGroup, brand, itemName LIMIT ${limit} OFFSET ${offset}`, params
    );
    const [totals] = await db.execute(
      `SELECT COALESCE(SUM(totalStock),0) AS totalStock, COALESCE(SUM(damagedStock),0) AS damagedStock,
              COALESCE(SUM(agedStock),0) AS agedStock, COALESCE(SUM(pendingOrders),0) AS pendingOrders,
              COALESCE(SUM(pendingDelivery),0) AS pendingDelivery
       FROM live_stock ${whereSql}`, params
    );
    return res.json({ success: true, data: rows, totals: totals[0], pagination: { page, limit, total: countRows[0].total } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export default { syncNow, getSyncStatus, getLiveStock };
