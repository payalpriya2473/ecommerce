

import db from '../config/db.js';
import { isDirectOdbcConfigured, fetchLiveStockRows } from './accessStockService.js';

const API_URL        = process.env.PHP_STOCK_API_URL;
const API_MASTER_URL = process.env.PHP_STOCK_MASTER_API_URL || '';
const API_USER       = process.env.PHP_STOCK_API_USER;
const API_PASS       = process.env.PHP_STOCK_API_PASS;

function lc(row) {
  const out = {};
  for (const k of Object.keys(row || {})) out[String(k).toLowerCase()] = row[k];
  return out;
}
function pick(row, keys) {
  for (const k of keys) {
    const v = row[k.toLowerCase()];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return undefined;
}
function num(v) {
  if (v === undefined || v === null || String(v).trim() === '') return undefined;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : undefined;
}
function num0(v) { const n = num(v); return n === undefined ? 0 : n; }
function str(v) {
  if (v === undefined || v === null) return undefined;
  let s = String(v).trim();
  if (s === '') return undefined;

  s = s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
       .replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  return s;
}

function splitVariant(rawName, explicitVariant, groupName) {
  const name = (rawName || '').trim();
  if (explicitVariant) return { itemName: name, variant: explicitVariant, isDemo: false };


  const m = name.match(/\s+(\d{1,4}\s*\/\s*\d{1,4})(\s+D)?\s*$/i);
  if (m) {
    const core = m[1].replace(/\s+/g, '');
    const isDemo = Boolean(m[2]);
    return {
      itemName: name.slice(0, m.index).trim(),
      variant: isDemo ? `${core} D` : core,   
      isDemo,
    };
  }

  if (/\s+D$/i.test(name) && /DEMO/i.test(groupName || '')) {
    return { itemName: name.replace(/\s+D$/i, '').trim(), variant: 'D', isDemo: true };
  }

  return { itemName: name, variant: '', isDemo: false };
}

function mapRow(rawRow) {
  const r = lc(rawRow);
  const rawName     = str(pick(r, ['description', 'item', 'itemname'])) || '';
  const explicitVar = str(pick(r, ['variant']));
  const groupName   = str(pick(r, ['group1', 'itemgroup']));
  const { itemName, variant, isDemo } = splitVariant(rawName, explicitVar, groupName);
  const demoRaw = pick(r, ['demo']);

  return {
    itemName,
    variant,
    categoryName: str(pick(r, ['category', 'head'])),
    groupName,
    combineGroup: str(pick(r, ['cgroup', 'group1', 'itemgroup'])),
    brandName:    str(pick(r, ['brand'])),
    sourceItemCode: str(pick(r, ['itemcode', 'code', 'item', 'description'])),

    uom:           str(pick(r, ['uom'])),
    gst:           num(pick(r, ['gst'])),
    hsnCode:       str(pick(r, ['hsncode', 'hsn'])),
    maxQty:        num(pick(r, ['maxqty'])),
    incentive:     num(pick(r, ['dsltd', 'incentive'])),
    maxMOPPercent: num(pick(r, ['mopprc'])),
    maxMOPAmount:  num(pick(r, ['mopamt'])),
    offerPrice:    num(pick(r, ['mrp', 'srate', 'offerprice'])),
    nlc:           num(pick(r, ['show', 'nlc'])),

    openingStock:  num(pick(r, ['opqty', 'tstock', 'totalstock'])),
    minimumQty:    num(pick(r, ['minqty'])),
    warranty:      str(pick(r, ['packing', 'mangsty', 'warranty'])),
    freeService:   str(pick(r, ['freeservice'])),

    hasDemoInstallation: demoRaw !== undefined
                         ? (/^(y|yes|1|true)$/i.test(String(demoRaw).trim()) ? 1 : 0)
                         : (isDemo ? 1 : undefined),

    margin:        num(pick(r, ['margin_prc', 'width', 'marko', 'margin'])),
    width:         num(pick(r, ['margin_prc', 'width', 'marko', 'margin'])),
    length:        num(pick(r, ['gst'])),

    // live stock quantities
    liveOpqty:       num(pick(r, ['opqty'])),   
    totalStock:      num0(pick(r, ['tstock', 'totalstock'])),
    damagedStock:    num0(pick(r, ['dstock', 'damagedstock'])),
    agedStock:       num0(pick(r, ['astock', 'agedstock'])),
    pendingDelivery: num0(pick(r, ['pdel', 'pendingdelivery'])),
    pendingOrders:   num0(pick(r, ['penord', 'pendingorders'])),
    schemeAmount:    num0(pick(r, ['schamt', 'schemeamount'])),
    stockValue:      num0(pick(r, ['stkval', 'stockvalue'])),
    liveIncentive:   num0(pick(r, ['incentive', 'dsltd'])),
    liveOfferPrice:  num0(pick(r, ['offerprice', 'mrp', 'srate'])),
    branch:          str(pick(r, ['branch'])),
  };
}

// ── PHP fetch (master endpoint, basic fallback) ──────────────────────────────
async function callEndpoint(url, companyCode, filters) {
  const params = new URLSearchParams();
  params.append('company_code', companyCode);
  if (filters.itemgroup) params.append('itemgroup', filters.itemgroup);
  if (filters.item)      params.append('item', filters.item);
  if (filters.brand)     params.append('brand', filters.brand);
  if (filters.branch)    params.append('branch', filters.branch);

  const credentials = Buffer.from(`${API_USER}:${API_PASS}`).toString('base64');
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${credentials}` },
    body: params.toString(),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const text = await resp.text();
  let data;
  try { data = JSON.parse(text); }
  catch { throw new Error(`invalid JSON (${text.slice(0, 120)})`); }
  if (data && data.message && data.flag === undefined && !data.stock_search) throw new Error(data.message);
  if (data.flag === 0) return { rows: [], source: url };
  if (!Array.isArray(data.stock_search)) return { rows: [], source: url };
  return { rows: data.stock_search, source: url };
}

async function fetchFromApi(companyCode, filters = {}) {
  if (!companyCode) throw new Error('companyCode is required for sync');

  if (isDirectOdbcConfigured()) {
    try {
      const rows = await fetchLiveStockRows(companyCode, filters);
      console.log(`[stock-sync] using DIRECT ODBC (${rows.length} rows)`);
      return { rows, source: 'direct-odbc', sourceType: 'ODBC' };
    } catch (err) {
      console.warn(`[stock-sync] direct ODBC failed (${err.message}) — falling back to PHP API`);
    }
  }

  // 2) Fallback: the existing PHP HTTP API.
  const candidates = [...new Set([API_MASTER_URL, API_URL].filter(Boolean))];
  if (candidates.length === 0) throw new Error('No PHP stock API URL configured in .env (and direct ODBC is not configured/working)');

  const errors = [];
  for (const url of candidates) {
    try {
      const result = await callEndpoint(url, companyCode, filters);
      result.sourceType = (url === API_MASTER_URL && !!API_MASTER_URL) ? 'MASTER' : 'BASIC';
      console.log(`[stock-sync] using ${result.sourceType} endpoint (${result.rows.length} rows) → ${url}`);
      return result;
    } catch (err) {
      console.warn(`[stock-sync] endpoint failed (${url}): ${err.message}`);
      errors.push(`${url}: ${err.message}`);
    }
  }
  throw new Error(`All PHP stock endpoints failed → ${errors.join(' | ')}`);
}

// ── master upserts ───────────────────────────────────────────────────────────
function makeCaches() {
  return { category: new Map(), group: new Map(), brand: new Map(), sortOrder: new Map(),
           created: { categories: 0, groups: 0, brands: 0 } };
}

async function upsertCategory(conn, cache, name) {
  if (!name) return null;
  if (cache.category.has(name)) return cache.category.get(name);
  const [rows] = await conn.execute('SELECT id FROM categories WHERE name = ? LIMIT 1', [name]);
  if (rows.length) { cache.category.set(name, rows[0].id); return rows[0].id; }
  const [res] = await conn.execute('INSERT INTO categories (name, isActive) VALUES (?, 1)', [name]);
  cache.created.categories++; cache.category.set(name, res.insertId); return res.insertId;
}

async function upsertBrand(conn, cache, name) {
  if (!name) return null;
  if (cache.brand.has(name)) return cache.brand.get(name);
  const [rows] = await conn.execute('SELECT id FROM brands WHERE name = ? LIMIT 1', [name]);
  if (rows.length) { cache.brand.set(name, rows[0].id); return rows[0].id; }
  const [res] = await conn.execute('INSERT INTO brands (name, isActive) VALUES (?, 1)', [name]);
  cache.created.brands++; cache.brand.set(name, res.insertId); return res.insertId;
}

async function upsertItemGroup(conn, cache, rec, categoryId) {
  const name = rec.groupName;
  if (!name) return null;
  if (cache.group.has(name)) return cache.group.get(name);

  const [rows] = await conn.execute('SELECT id FROM item_groups WHERE name = ? LIMIT 1', [name]);
  let groupId;
  if (rows.length) {
    groupId = rows[0].id;
    const sets = [], vals = [];
    if (categoryId != null)                    { sets.push('categoryId = ?');          vals.push(categoryId); }
    if (rec.gst !== undefined)                 { sets.push('gst = ?');                 vals.push(rec.gst); }
    if (rec.hsnCode !== undefined)             { sets.push('hsnCode = ?');             vals.push(rec.hsnCode); }
    if (rec.maxQty !== undefined)              { sets.push('maxQty = ?');              vals.push(rec.maxQty); }
    if (rec.hasDemoInstallation !== undefined) { sets.push('hasDemoInstallation = ?'); vals.push(rec.hasDemoInstallation); }
    if (rec.combineGroup !== undefined)        { sets.push('combineGroup = ?');        vals.push(rec.combineGroup); }
    if (sets.length) { vals.push(groupId); await conn.execute(`UPDATE item_groups SET ${sets.join(', ')} WHERE id = ?`, vals); }
  } else {
    const [res] = await conn.execute(
      `INSERT INTO item_groups (categoryId, name, combineGroup, hsnCode, gst, hasDemoInstallation, buyBackValue, maxQty, isActive)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [categoryId ?? null, name, rec.combineGroup ?? null, rec.hsnCode ?? null,
       rec.gst ?? 0, rec.hasDemoInstallation ?? 0, null, rec.maxQty ?? 0]
    );
    groupId = res.insertId; cache.created.groups++;
  }
  cache.group.set(name, groupId);
  return groupId;
}

// ── item upsert ──────────────────────────────────────────────────────────────
async function findItemId(conn, rec, itemGroupId, brandId) {
  if (rec.sourceItemCode) {
    const [byCode] = await conn.execute('SELECT id FROM items WHERE sourceItemCode = ? LIMIT 1', [rec.sourceItemCode]);
    if (byCode.length) return byCode[0].id;
  }
  const [byName] = await conn.execute(
    `SELECT id FROM items WHERE itemName = ? AND IFNULL(variant,'') = IFNULL(?, '')
     ORDER BY (itemGroupId <=> ?) DESC, (brandId <=> ?) DESC LIMIT 1`,
    [rec.itemName, rec.variant || '', itemGroupId ?? null, brandId ?? null]
  );
  return byName.length ? byName[0].id : null;
}

async function upsertItem(conn, cache, rec, itemGroupId, brandId) {
  const existingId = await findItemId(conn, rec, itemGroupId, brandId);

  const orderKey = `${rec.itemName}|${itemGroupId ?? ''}|${brandId ?? ''}`;
  const nextOrder = (cache.sortOrder.get(orderKey) ?? -1) + 1;
  cache.sortOrder.set(orderKey, nextOrder);

  const optional = {
    uom: rec.uom, hsnCode: rec.hsnCode, gst: rec.gst,
    incentive: rec.incentive, maxMOPPercent: rec.maxMOPPercent, maxMOPAmount: rec.maxMOPAmount,
    offerPrice: rec.offerPrice, nlc: rec.nlc, openingStock: rec.openingStock,
    minimumQty: rec.minimumQty, warranty: rec.warranty, margin: rec.margin,
    width: rec.width, length: rec.length,
    freeService: rec.freeService, hasDemoInstallation: rec.hasDemoInstallation,
  };

  if (existingId) {
    const sets = ['itemGroupId = ?', 'brandId = ?', 'variant = ?', 'sortOrder = ?', 'lastSyncedAt = CURRENT_TIMESTAMP'];
    const vals = [itemGroupId ?? null, brandId ?? null, rec.variant || '', nextOrder];
    if (rec.sourceItemCode) { sets.push('sourceItemCode = ?'); vals.push(rec.sourceItemCode); }
    if (rec.itemName)       { sets.push('itemName = ?');       vals.push(rec.itemName); }
    for (const [col, v] of Object.entries(optional)) {
      if (v !== undefined) { sets.push(`${col} = ?`); vals.push(v); }
    }
    vals.push(existingId);
    await conn.execute(`UPDATE items SET ${sets.join(', ')} WHERE id = ?`, vals);
    return { id: existingId, created: false };
  }

  const [res] = await conn.execute(
    `INSERT INTO items
       (itemGroupId, brandId, itemName, variant, sourceItemCode,
        uom, hsnCode, gst, incentive, maxMOPPercent, maxMOPAmount,
        offerPrice, nlc, openingStock, minimumQty, warranty, margin, width, length,
        freeService, hasDemoInstallation, sortOrder, stockValue, isActive, lastSyncedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, CURRENT_TIMESTAMP)`,
    [
      itemGroupId ?? null, brandId ?? null, rec.itemName, rec.variant || '', rec.sourceItemCode ?? null,
      rec.uom ?? 'PCS', rec.hsnCode ?? null, rec.gst ?? 0, rec.incentive ?? 0,
      rec.maxMOPPercent ?? 0, rec.maxMOPAmount ?? 0, rec.offerPrice ?? 0, rec.nlc ?? 0,
      rec.openingStock ?? 0, rec.minimumQty ?? 0, rec.warranty ?? null, rec.margin ?? 0,
      rec.width ?? null, rec.length ?? null,
      rec.freeService ?? null, rec.hasDemoInstallation ?? 0, nextOrder,
    ]
  );
  return { id: res.insertId, created: true };
}

async function upsertLiveStock(conn, rec, itemId, companyCode) {
  await conn.execute(
    `INSERT INTO live_stock
       (itemId, companyCode, itemName, itemGroup, brand, branch,
        totalStock, damagedStock, agedStock, pendingDelivery, pendingOrders,
        schemeAmount, incentive, offerPrice, stockValue,
        category, hsnCode, gst, marginPercent, openingQty, minQty, mopPercent, mopAmount, nlc,
        lastSyncedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON DUPLICATE KEY UPDATE
        companyCode = VALUES(companyCode), itemName = VALUES(itemName), itemGroup = VALUES(itemGroup),
        brand = VALUES(brand), branch = VALUES(branch), totalStock = VALUES(totalStock),
        damagedStock = VALUES(damagedStock), agedStock = VALUES(agedStock),
        pendingDelivery = VALUES(pendingDelivery), pendingOrders = VALUES(pendingOrders),
        schemeAmount = VALUES(schemeAmount), incentive = VALUES(incentive),
        offerPrice = VALUES(offerPrice), stockValue = VALUES(stockValue),
        category = VALUES(category), hsnCode = VALUES(hsnCode), gst = VALUES(gst),
        marginPercent = VALUES(marginPercent), openingQty = VALUES(openingQty),
        minQty = VALUES(minQty), mopPercent = VALUES(mopPercent),
        mopAmount = VALUES(mopAmount), nlc = VALUES(nlc),
        lastSyncedAt = CURRENT_TIMESTAMP`,
    [
      itemId, companyCode ?? null, rec.itemName, rec.groupName ?? null, rec.brandName ?? null,
      rec.branch ?? null, rec.totalStock, rec.damagedStock, rec.agedStock,
      rec.pendingDelivery, rec.pendingOrders, rec.schemeAmount,
      rec.liveIncentive, rec.liveOfferPrice, rec.stockValue,
      rec.categoryName ?? null, rec.hsnCode ?? null, rec.gst ?? null,
      rec.margin ?? null, rec.liveOpqty ?? null, rec.minimumQty ?? null,
      rec.maxMOPPercent ?? null, rec.maxMOPAmount ?? null, rec.nlc ?? null,
    ]
  );
}

// ── main entry point ─────────────────────────────────────────────────────────
export async function runStockSync({ trigger = 'manual', companyCode, filters = {} } = {}) {
  const startedAt = Date.now();
  const stats = {
    itemsProcessed: 0, itemsCreated: 0, itemsUpdated: 0,
    brandsCreated: 0, groupsCreated: 0, categoriesCreated: 0, liveStockRows: 0, errors: [],
  };

  const [logRes] = await db.execute(
    `INSERT INTO stock_sync_log (companyCode, \`trigger\`, status) VALUES (?, ?, 'running')`,
    [companyCode ?? null, trigger]
  );
  const logId = logRes.insertId;

  let conn;
  let sourceType = 'BASIC';
  let diagnostics = {};
  try {
    const fetched = await fetchFromApi(companyCode, filters);
    const rows = fetched.rows;
    sourceType = fetched.sourceType || 'BASIC';

    // DIAGNOSTIC — what did the PHP actually return?
    const sample = rows[0] ? lc(rows[0]) : {};
    const masterKeys = ['hsncode', 'gst', 'category', 'mopprc', 'mopamt', 'opqty', 'minqty', 'margin_prc', 'nlc'];
    const keysPresent    = masterKeys.filter(k => k in sample);
    const keysWithValues = masterKeys.filter(k => sample[k] !== undefined && sample[k] !== null && String(sample[k]).trim() !== '');
    diagnostics = {
      rowCount: rows.length,
      firstRowKeys: rows[0] ? Object.keys(rows[0]) : [],
      masterKeysPresent: keysPresent,
      masterKeysWithValues: keysWithValues,
      masterFieldsOk: keysWithValues.length > 0,
    };
    console.log('[stock-sync] first row keys:', diagnostics.firstRowKeys.join(', ') || '(none)');
    console.log('[stock-sync] master keys present :', keysPresent.join(', ') || '(NONE — old PHP still deployed)');
    console.log('[stock-sync] master keys w/ values:', keysWithValues.join(', ') || '(all empty)');
    if (rows[0]) console.log('[stock-sync] sample row:', JSON.stringify(rows[0]));

    conn = await db.getConnection();
    const cache = makeCaches();

    // ── PASS 1: map every row, then pick ONE canonical group per logical item.
    // Bucket = itemName + brand + (demo? D : N). All NON-demo variants of the
    // same item collapse into one entry; demo units form their own entry.
    // The group used is the MOST COMMON one seen across that bucket's rows, so
    // variants spread across groups still merge under a single item.
    const isDemoRow = (rec) =>
      /demo/i.test(rec.groupName || '') ||
      /\sD$/i.test(rec.variant || '') ||
      Number(rec.hasDemoInstallation) === 1;

    const bucketKeyOf = (rec) =>
      `${String(rec.itemName || '').toUpperCase()}||${String(rec.brandName || '').toUpperCase()}||${isDemoRow(rec) ? 'D' : 'N'}`;

    const mapped = [];
    const groupTally = new Map(); // bucketKey -> Map(groupName -> { count, categoryName })
    for (const raw of rows) {
      const rec = mapRow(raw);
      if (!rec.itemName) continue;
      rec._bucketKey = bucketKeyOf(rec);
      mapped.push(rec);
      if (!groupTally.has(rec._bucketKey)) groupTally.set(rec._bucketKey, new Map());
      const gName = rec.groupName || '';
      const gMap = groupTally.get(rec._bucketKey);
      if (!gMap.has(gName)) gMap.set(gName, { count: 0, categoryName: rec.categoryName });
      gMap.get(gName).count++;
    }

    const canonicalGroup = new Map(); // bucketKey -> { groupName, categoryName }
    for (const [bk, gMap] of groupTally) {
      let best = null;
      for (const [gName, info] of gMap) {
        if (!best || info.count > best.count) best = { groupName: gName, categoryName: info.categoryName };
      }
      canonicalGroup.set(bk, best);
    }

    // ── PASS 2: upsert every row using its bucket's canonical group ──────────
    for (const rec of mapped) {
      stats.itemsProcessed++;
      try {
        const canon = canonicalGroup.get(rec._bucketKey) || {};
        const useGroupName    = canon.groupName    || rec.groupName;
        const useCategoryName = canon.categoryName || rec.categoryName;

        const categoryId = await upsertCategory(conn, cache, useCategoryName);
        const brandId    = await upsertBrand(conn, cache, rec.brandName);
        const groupId    = await upsertItemGroup(conn, cache, { ...rec, groupName: useGroupName }, categoryId);
        const { id: itemId, created } = await upsertItem(conn, cache, rec, groupId, brandId);
        if (created) stats.itemsCreated++; else stats.itemsUpdated++;
        await upsertLiveStock(conn, rec, itemId, companyCode);
        stats.liveStockRows++;
      } catch (rowErr) {
        stats.errors.push(`${rec.itemName}: ${rowErr.message}`);
      }
    }

    stats.brandsCreated     = cache.created.brands;
    stats.groupsCreated     = cache.created.groups;
    stats.categoriesCreated = cache.created.categories;

    try {
      await conn.execute(
        `UPDATE items i
         JOIN (
           SELECT id,
                  ROW_NUMBER() OVER (
                    PARTITION BY itemName, COALESCE(itemGroupId,0), COALESCE(brandId,0), COALESCE(companyId,0)
                    ORDER BY sortOrder ASC, id ASC
                  ) - 1 AS rn
           FROM items
           WHERE isActive = 1
         ) ranked ON ranked.id = i.id
         SET i.sortOrder = ranked.rn
         WHERE i.sortOrder <> ranked.rn`
      );
    } catch (normErr) {
      stats.errors.push(`sortOrder normalize: ${normErr.message}`);
    }

    const status = stats.errors.length === 0 ? 'success' : stats.liveStockRows > 0 ? 'partial' : 'error';
    await db.execute(
      `UPDATE stock_sync_log SET status = ?, itemsProcessed = ?, itemsCreated = ?, itemsUpdated = ?,
         brandsCreated = ?, groupsCreated = ?, categoriesCreated = ?, liveStockRows = ?,
         errorMessage = ?, finishedAt = CURRENT_TIMESTAMP, durationMs = ? WHERE id = ?`,
      [status, stats.itemsProcessed, stats.itemsCreated, stats.itemsUpdated,
       stats.brandsCreated, stats.groupsCreated, stats.categoriesCreated, stats.liveStockRows,
       stats.errors.slice(0, 20).join(' | ') || null, Date.now() - startedAt, logId]
    );

    return { success: status !== 'error', logId, status, sourceType, diagnostics,
             durationMs: Date.now() - startedAt, ...stats };
  } catch (err) {
    await db.execute(
      `UPDATE stock_sync_log SET status = 'error', errorMessage = ?, finishedAt = CURRENT_TIMESTAMP, durationMs = ? WHERE id = ?`,
      [err.message, Date.now() - startedAt, logId]
    );
    throw err;
  } finally {
    if (conn) conn.release();
  }
}

export default { runStockSync };
