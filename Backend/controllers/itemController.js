import { db } from '../config/db.js';
import fs from 'fs';
import path from 'path';

const BASE_URL = process.env.BASE_URL?.replace(/\/+$/, '') || '';

function toAbsUrl(p) {
  if (!p) return null;
  if (p.startsWith('http')) return p;
  return `${BASE_URL}/${p.replace(/^\//, '')}`;
}

function parseBooleanLike(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

// Some DB dumps don't have items.description. Cache whether it exists so the
// item save works with or without it (and persists description when present).
let _hasDescriptionCol = null;
async function itemsHasDescription() {
  if (_hasDescriptionCol !== null) return _hasDescriptionCol;
  try {
    const [rows] = await db.query(
      `SELECT 1 FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'items' AND COLUMN_NAME = 'description' LIMIT 1`
    );
    _hasDescriptionCol = rows.length > 0;
  } catch {
    _hasDescriptionCol = false;
  }
  return _hasDescriptionCol;
}

// ─────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────

/**
 * Fetch colors + their images for a list of itemIds.
 * Returns a Map<itemId, colorRows[]>
 */
async function _fetchColorsForItems(itemIds) {
  if (!itemIds.length) return new Map();

  const [colors] = await db.query(
    `SELECT * FROM item_variant_colors WHERE itemId IN (?) AND isActive = 1 ORDER BY itemId ASC, sortOrder ASC`,
    [itemIds]
  );
  if (!colors.length) return new Map();

  const colorIds = colors.map((c) => c.id);
  const [images] = await db.query(
    `SELECT * FROM item_variant_images WHERE itemVariantColorId IN (?) ORDER BY sortOrder ASC`,
    [colorIds]
  );

  const imgMap = {};
  for (const img of images) {
    if (!imgMap[img.itemVariantColorId]) imgMap[img.itemVariantColorId] = [];
    imgMap[img.itemVariantColorId].push({
      ...img,
      imageUrl: toAbsUrl(img.imageUrl),
    });
  }

  const colorMap = new Map();
  for (const c of colors) {
    if (!colorMap.has(c.itemId)) colorMap.set(c.itemId, []);
    colorMap.get(c.itemId).push({
      ...c,
      images: imgMap[c.id] || [],
      primaryImage: imgMap[c.id]?.[0]?.imageUrl || null,
    });
  }
  return colorMap;
}

/**
 * Save colors from FormData to the DB, and save uploaded images.
 * colorsJson: parsed array of { id?, colorName, colorHex, deleteImageIds[] }
 * files: req.files (from multer .any())
 * primaryItemId: the first-inserted or existing item row id
 */
async function _saveColorsAndImages(primaryItemId, colorsJson, files) {
  if (!Array.isArray(colorsJson) || colorsJson.length === 0) return;

  // Build a map of uploaded files: productColorImages_<ci>_<imageIdx> → file
  const colorFileMap = {};
  for (const file of files || []) {
    const match = file.fieldname.match(/^productColorImages_(\d+)_(\d+)$/);
    if (match) {
      const ci = parseInt(match[1]);
      if (!colorFileMap[ci]) colorFileMap[ci] = [];
      colorFileMap[ci].push(file);
    }
  }

  for (let ci = 0; ci < colorsJson.length; ci++) {
    const c = colorsJson[ci];
    let colorId = c.id ? parseInt(c.id) : null;

    if (colorId) {
      // Update existing color
      await db.query(
        `UPDATE item_variant_colors SET colorName = ?, colorHex = ?, updatedAt = NOW() WHERE id = ?`,
        [c.colorName || 'Default', c.colorHex || null, colorId]
      );

      // Delete requested images
      const deleteIds = (c.deleteImageIds || []).filter(Boolean);
      if (deleteIds.length) {
        const [imgs] = await db.query(
          'SELECT id, imageUrl FROM item_variant_images WHERE id IN (?) AND itemVariantColorId = ?',
          [deleteIds, colorId]
        );
        for (const img of imgs) {
          const relativePath = img.imageUrl.startsWith('http')
            ? img.imageUrl.replace(BASE_URL, '').replace(/^\//, '')
            : img.imageUrl.replace(/^\//, '');
          const fp = path.join(process.cwd(), relativePath);
          if (fs.existsSync(fp)) fs.unlinkSync(fp);
        }
        if (imgs.length) {
          await db.query('DELETE FROM item_variant_images WHERE id IN (?)', [imgs.map((i) => i.id)]);
        }
      }

    } else {
      // Insert new color row
      const [r] = await db.query(
        `INSERT INTO item_variant_colors (itemId, colorName, colorHex, sortOrder) VALUES (?, ?, ?, ?)`,
        [primaryItemId, c.colorName || 'Default', c.colorHex || null, ci]
      );
      colorId = r.insertId;
    }

    // Append new images for this color
    const newFiles = colorFileMap[ci] || [];
    if (newFiles.length) {
      const [[{ maxOrder }]] = await db.query(
        'SELECT COALESCE(MAX(sortOrder), -1) AS maxOrder FROM item_variant_images WHERE itemVariantColorId = ?',
        [colorId]
      );
      const imageRows = newFiles.map((f, i) => [
        colorId,
        `/uploads/item-variant-images/${f.filename}`,
        f.originalname,
        f.size,
        f.mimetype,
        maxOrder + 1 + i,
      ]);
      await db.query(
        `INSERT INTO item_variant_images (itemVariantColorId, imageUrl, fileName, fileSize, mimeType, sortOrder) VALUES ?`,
        [imageRows]
      );
    }
  }
}

/**
 * Full item fetch: master row + siblings (variants) + colors + images
 */
async function _fetchItemWithVariants(itemId) {
  const [rows] = await db.query(
    `SELECT i.*,
            ig.name AS itemGroupName,
            b.name  AS brandName,
            c.name  AS categoryName
     FROM items i
     LEFT JOIN item_groups ig ON i.itemGroupId = ig.id
     LEFT JOIN categories  c  ON ig.categoryId  = c.id
     LEFT JOIN brands      b  ON i.brandId      = b.id
     WHERE i.id = ?`,
    [itemId]
  );
  if (!rows.length) return null;

  const master = rows[0];

  // All sibling variant rows
  const [siblings] = await db.query(
    `SELECT * FROM items
     WHERE itemName = ? AND (itemGroupId <=> ?) AND (brandId <=> ?)
       AND isActive = 1
     ORDER BY sortOrder ASC`,
    [master.itemName, master.itemGroupId, master.brandId]
  );
  master.variants = siblings;

  const primaryId = siblings.length > 0 ? siblings[0].id : itemId;

  // Legacy item_images (attached to primary row)
  const [images] = await db.query(
    'SELECT * FROM item_images WHERE itemId = ? ORDER BY sortOrder ASC',
    [primaryId]
  );
  master.images = images.map((img) => ({ ...img, imageUrl: toAbsUrl(img.imageUrl) }));
  master.primaryImage = master.images[0] || null;

  // Colors (attached to each variant row, but UI treats them as shared)
  // Fetch colors for all sibling ids
  const siblingIds = siblings.map((s) => s.id);
  const colorMap = await _fetchColorsForItems(siblingIds.length ? siblingIds : [primaryId]);

  // Attach per-variant colors
  const variantsWithColors = siblings.map((s) => ({
    ...s,
    colors: colorMap.get(s.id) || [],
  }));
  master.variantsWithColors = variantsWithColors;

  // Also collect unique colors (merged across all variants for UI)
  const seenColorNames = new Set();
  const mergedColors = [];
  for (const vc of variantsWithColors) {
    for (const c of vc.colors) {
      const key = `${c.colorName}::${c.colorHex}`;
      if (!seenColorNames.has(key)) {
        seenColorNames.add(key);
        mergedColors.push(c);
      }
    }
  }
  master.colors = mergedColors;

  return master;
}

// ─────────────────────────────────────────────
// Register Item
// ─────────────────────────────────────────────
export const registerItem = async (req, res) => {
  try {
    const {
      itemGroupId, brandId, itemName, uom, hsnCode, gst,
      hasDemoInstallation, isActive, description, freeService, billPrintNote, warranty,
    } = req.body;

    let variants = [];
    try { variants = JSON.parse(req.body.variants || '[]'); } catch { variants = []; }
    if (!Array.isArray(variants) || variants.length === 0) variants = [{}];

    let colorsJson = [];
    try { colorsJson = JSON.parse(req.body.colors || '[]'); } catch { colorsJson = []; }

    if (!itemName) {
      return res.status(400).json({ success: false, message: 'Item name is required' });
    }

    // FK checks
    if (itemGroupId) {
      const [ig] = await db.query('SELECT id FROM item_groups WHERE id = ? AND isActive = 1', [itemGroupId]);
      if (!ig.length) return res.status(404).json({ success: false, message: 'Item group not found' });
    }
    if (brandId) {
      const [br] = await db.query('SELECT id FROM brands WHERE id = ? AND isActive = 1', [brandId]);
      if (!br.length) return res.status(404).json({ success: false, message: 'Brand not found' });
    }

    const hasDesc = await itemsHasDescription();
    const masterCols = [
      itemGroupId || null,
      brandId     || null,
      itemName.trim(),
      uom         || 'Pcs',
      hsnCode     || null,
      parseFloat(gst) || 0,
      parseBooleanLike(hasDemoInstallation) ? 1 : 0,
      parseBooleanLike(isActive, true) ? 1 : 0,
      ...(hasDesc ? [description || null] : []),
      freeService   || null,
      billPrintNote || null,
      warranty      || null,
    ];

    const masterColNames = [
      'itemGroupId', 'brandId', 'itemName', 'uom', 'hsnCode', 'gst',
      'hasDemoInstallation', 'isActive', ...(hasDesc ? ['description'] : []),
      'freeService', 'billPrintNote', 'warranty',
    ];
    const itemCols = [
      ...masterColNames,
      'variant', 'openingStock', 'minimumQty', 'maxMOPPercent',
      'offerPrice', 'stockValue', 'margin', 'incentive', 'maxMOPAmount', 'nlc', 'sortOrder',
    ];
    const itemPlaceholders = itemCols.map(() => '?').join(', ');

    const insertedIds = [];
    for (let i = 0; i < variants.length; i++) {
      const v = variants[i];
      const [result] = await db.query(
        `INSERT INTO items (${itemCols.join(', ')}) VALUES (${itemPlaceholders})`,
        [
          ...masterCols,
          v.variant?.trim()          || null,
          parseFloat(v.openingStock)  || 0,
          parseFloat(v.minimumQty)    || 0,
          parseFloat(v.maxMOPPercent) || 0,
          parseFloat(v.offerPrice)    || 0,
          parseFloat(v.stockValue)    || 0,
          parseFloat(v.margin)        || 0,
          parseFloat(v.incentive)     || 0,
          parseFloat(v.maxMOPAmount)  || 0,
          parseFloat(v.nlc)           || 0,
          i,
        ]
      );
      insertedIds.push(result.insertId);
    }

    // Legacy item_images (field name: itemImages)
    const legacyFiles = (req.files || []).filter((f) => f.fieldname === 'itemImages');
    if (legacyFiles.length && insertedIds.length) {
      const imageRows = legacyFiles.map((file, idx) => [
        insertedIds[0],
        `/uploads/items/${file.filename}`,
        file.originalname,
        file.size,
        file.mimetype,
        idx,
      ]);
      await db.query(
        `INSERT INTO item_images (itemId, imageUrl, fileName, fileSize, mimeType, sortOrder) VALUES ?`,
        [imageRows]
      );
    }

    // Save colors (attached to the FIRST variant row / primary item)
    if (colorsJson.length && insertedIds.length) {
      await _saveColorsAndImages(insertedIds[0], colorsJson, req.files || []);
    }

    const item = await _fetchItemWithVariants(insertedIds[0]);
    return res.status(201).json({ success: true, message: 'Item registered successfully', data: item });
  } catch (error) {
    console.error('Register item error:', error);
    return res.status(500).json({ success: false, message: 'Failed to register item', error: error.message });
  }
};

// ─────────────────────────────────────────────
// Get All Items
// ─────────────────────────────────────────────
export const getAllItems = async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');

    const {
      itemGroupId,
      brandId,
      search,
      status,
      brandIds,
      itemGroupIds,
      categoryIds,
      stock,
      stockSearch,
      page,
      limit,
      sortKey,
      sortDirection,
    } = req.query;

    const normalizeCsv = (value) => String(value || '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);

    const statuses = normalizeCsv(status).filter((entry) => entry === 'active' || entry === 'inactive');
    const selectedBrandIds = normalizeCsv(brandIds);
    const selectedItemGroupIds = normalizeCsv(itemGroupIds);
    const selectedCategoryIds = normalizeCsv(categoryIds);
    const selectedStockFilters = normalizeCsv(stock).filter((entry) => entry === 'inStock' || entry === 'outOfStock');
    const trimmedStockSearch = String(stockSearch || '').trim();
    const hasExactStockSearch = trimmedStockSearch !== '' && /^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(trimmedStockSearch);
    // Lightweight mode: return all master rows WITHOUT variant/image/color
    // enrichment (used by pickers like the Offers product selector).
    const liteMode = req.query.lite === '1' || req.query.lite === 'true';
    const pageNumber = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.max(1, parseInt(limit, 10) || 15);
    const paginationEnabled = !liteMode && Number.isFinite(parseInt(page, 10)) && Number.isFinite(parseInt(limit, 10));

    const sortFieldMap = {
      itemName: 'i.itemName',
      group: 'ig.name',
      brand: 'b.name',
      hsn: 'i.hsnCode',
      gst: 'i.gst',
      uom: 'i.uom',
      stock: 'i.openingStock',
      margin: 'i.margin',
      createdAt: 'i.createdAt',
    };
    const resolvedSortField = sortFieldMap[sortKey] || 'i.itemName';
    const resolvedSortDirection = String(sortDirection || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    const baseSelect = `
      FROM items i
      LEFT JOIN item_groups ig ON i.itemGroupId = ig.id
      LEFT JOIN categories  c  ON ig.categoryId  = c.id
      LEFT JOIN brands      b  ON i.brandId      = b.id
    `;
    const whereClauses = ['i.sortOrder = 0'];
    const params = [];
    const addWhere = (clause, values = []) => {
      whereClauses.push(clause);
      params.push(...values);
    };

    if (statuses.length === 1) {
      addWhere('i.isActive = ?', [statuses[0] === 'active' ? 1 : 0]);
    } else if (statuses.length > 1 && statuses.length < 3) {
      const mappedStatuses = [...new Set(statuses.map((entry) => entry === 'active' ? 1 : 0))];
      addWhere(`i.isActive IN (${mappedStatuses.map(() => '?').join(', ')})`, mappedStatuses);
    } else if (statuses.length === 0) {
      addWhere('i.isActive = 1');
    }

    if (itemGroupId) addWhere('i.itemGroupId = ?', [itemGroupId]);
    if (brandId) addWhere('i.brandId = ?', [brandId]);
    if (selectedItemGroupIds.length) {
      addWhere(`i.itemGroupId IN (${selectedItemGroupIds.map(() => '?').join(', ')})`, selectedItemGroupIds);
    }
    if (selectedBrandIds.length) {
      addWhere(`i.brandId IN (${selectedBrandIds.map(() => '?').join(', ')})`, selectedBrandIds);
    }
    if (selectedCategoryIds.length) {
      addWhere(`ig.categoryId IN (${selectedCategoryIds.map(() => '?').join(', ')})`, selectedCategoryIds);
    }
    if (hasExactStockSearch) {
      addWhere('COALESCE(i.openingStock, 0) = ?', [Number(trimmedStockSearch)]);
    } else if (selectedStockFilters.length === 1) {
      addWhere(
        selectedStockFilters[0] === 'inStock'
          ? 'COALESCE(i.openingStock, 0) > 0'
          : 'COALESCE(i.openingStock, 0) <= 0',
      );
    }
    if (search) {
      const searchTerm = `%${search}%`;
      addWhere(
        `(
          i.itemName LIKE ? OR
          COALESCE(i.variant, '') LIKE ? OR
          COALESCE(ig.name, '') LIKE ? OR
          COALESCE(b.name, '') LIKE ? OR
          COALESCE(c.name, '') LIKE ? OR
          COALESCE(i.hsnCode, '') LIKE ? OR
          CAST(COALESCE(i.openingStock, 0) AS CHAR) LIKE ?
        )`,
        [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm],
      );
    }

    const whereSql = `WHERE ${whereClauses.join(' AND ')}`;
    const orderSql = `ORDER BY ${resolvedSortField} ${resolvedSortDirection}, i.createdAt DESC, i.id DESC`;
    let query = `
      SELECT i.*,
             ig.name AS itemGroupName,
             b.name  AS brandName,
             c.name  AS categoryName
      ${baseSelect}
      ${whereSql}
      ${orderSql}
    `;

    let totalItems = null;
    if (paginationEnabled) {
      const [countRows] = await db.query(
        `
          SELECT COUNT(*) AS total
          ${baseSelect}
          ${whereSql}
        `,
        params
      );
      totalItems = Number(countRows?.[0]?.total || 0);
      query += ' LIMIT ? OFFSET ?';
      params.push(pageSize, (pageNumber - 1) * pageSize);
    }

    const [masterItems] = await db.query(query, params);

    if (!liteMode && masterItems.length) {
      const itemNames = masterItems.map((i) => i.itemName);

      let variantsQuery = 'SELECT * FROM items WHERE itemName IN (?)';
      const variantParams = [itemNames];
      if (statuses.length === 1) {
        variantsQuery += ' AND isActive = ?';
        variantParams.push(statuses[0] === 'active' ? 1 : 0);
      } else if (statuses.length > 1 && statuses.length < 3) {
        const mappedStatuses = [...new Set(statuses.map((entry) => entry === 'active' ? 1 : 0))];
        variantsQuery += ` AND isActive IN (${mappedStatuses.map(() => '?').join(', ')})`;
        variantParams.push(...mappedStatuses);
      } else if (statuses.length === 0) {
        variantsQuery += ' AND isActive = 1';
        variantParams.push(1);
      }
      variantsQuery += ' ORDER BY itemName ASC, sortOrder ASC';

      const [allVariants] = await db.query(variantsQuery, variantParams);

      const variantMap = {};
      for (const v of allVariants) {
        const key = `${v.itemName}__${v.itemGroupId}__${v.brandId}`;
        if (!variantMap[key]) variantMap[key] = [];
        variantMap[key].push(v);
      }

      // Primary images
      const primaryIds = masterItems.map((i) => i.id);
      const [allPrimaryImgs] = await db.query(
        `SELECT ii.* FROM item_images ii
         INNER JOIN (
           SELECT itemId, MIN(sortOrder) AS minOrder
           FROM item_images WHERE itemId IN (?) GROUP BY itemId
         ) sub ON ii.itemId = sub.itemId AND ii.sortOrder = sub.minOrder`,
        [primaryIds]
      );
      const imgMap = {};
      for (const img of allPrimaryImgs) {
        imgMap[img.itemId] = { ...img, imageUrl: toAbsUrl(img.imageUrl) };
      }

      // Colors for primary rows
      const colorMap = await _fetchColorsForItems(primaryIds);

      for (const item of masterItems) {
        const key = `${item.itemName}__${item.itemGroupId}__${item.brandId}`;
        item.variants     = variantMap[key] || [item];
        item.variantCount = item.variants.length;
        item.primaryImage = imgMap[item.id] || null;
        item.colors       = colorMap.get(item.id) || [];
      }
    }

    const responsePayload = { success: true, data: masterItems };
    if (paginationEnabled) {
      responsePayload.pagination = {
        page: pageNumber,
        limit: pageSize,
        totalItems,
        totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
      };
    }

    return res.status(200).json(responsePayload);
  } catch (error) {
    console.error('Get items error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch items', error: error.message });
  }
};

// ─────────────────────────────────────────────
// Get Item By ID
// ─────────────────────────────────────────────
export const getItemById = async (req, res) => {
  try {
    const { id } = req.params;
    const item = await _fetchItemWithVariants(id);
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    return res.status(200).json({ success: true, data: item });
  } catch (error) {
    console.error('Get item error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch item', error: error.message });
  }
};

// ─────────────────────────────────────────────
// Update Item
// ─────────────────────────────────────────────
export const updateItem = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const [existing] = await db.query('SELECT * FROM items WHERE id = ?', [id]);
    if (!existing.length)
      return res.status(404).json({ success: false, message: 'Item not found' });

    const orig = existing[0];
    const origIsActive = Number(orig.isActive) === 1;
    let variants = null;
    try { variants = JSON.parse(updateData.variants || 'null'); } catch { variants = null; }

    let colorsJson = null;
    try { colorsJson = JSON.parse(updateData.colors || 'null'); } catch { colorsJson = null; }

    if (Array.isArray(variants)) {
      // ── Full variant replace (ATOMIC: delete + re-insert in one transaction,
      //    so a failed insert can never destroy the item) ──
      const newMaster = {
        itemGroupId:         updateData.itemGroupId   !== undefined ? (updateData.itemGroupId   || null) : orig.itemGroupId,
        brandId:             updateData.brandId       !== undefined ? (updateData.brandId       || null) : orig.brandId,
        itemName:            (updateData.itemName     || orig.itemName).trim(),
        uom:                 updateData.uom           || orig.uom,
        hsnCode:             updateData.hsnCode       !== undefined ? (updateData.hsnCode       || null) : orig.hsnCode,
        gst:                 updateData.gst           !== undefined ? parseFloat(updateData.gst) || 0     : orig.gst,
        hasDemoInstallation: updateData.hasDemoInstallation !== undefined
                               ? (parseBooleanLike(updateData.hasDemoInstallation) ? 1 : 0)
                               : orig.hasDemoInstallation,
        isActive:            updateData.isActive !== undefined
                               ? (parseBooleanLike(updateData.isActive, origIsActive) ? 1 : 0)
                               : orig.isActive,
        description:         updateData.description   !== undefined ? (updateData.description   || null) : (orig.description ?? null),
        freeService:         updateData.freeService   !== undefined ? (updateData.freeService   || null) : orig.freeService,
        billPrintNote:       updateData.billPrintNote !== undefined ? (updateData.billPrintNote || null) : orig.billPrintNote,
        warranty:            updateData.warranty      !== undefined ? (updateData.warranty      || null) : orig.warranty,
      };

      // Omit `description` from the INSERT if this DB doesn't have that column.
      const hasDesc = await itemsHasDescription();
      const insertCols = [
        'itemGroupId', 'brandId', 'itemName', 'uom', 'hsnCode', 'gst',
        'hasDemoInstallation', 'isActive', ...(hasDesc ? ['description'] : []),
        'freeService', 'billPrintNote', 'warranty',
        'variant', 'openingStock', 'minimumQty', 'maxMOPPercent',
        'offerPrice', 'stockValue', 'margin', 'incentive', 'maxMOPAmount', 'nlc', 'sortOrder',
      ];
      const placeholders = insertCols.map(() => '?').join(', ');

      const newIds = [];
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query(
          `DELETE FROM items
           WHERE itemName = ? AND (itemGroupId <=> ?) AND (brandId <=> ?)`,
          [orig.itemName, orig.itemGroupId, orig.brandId]
        );
        for (let i = 0; i < variants.length; i++) {
          const v = variants[i];
          const vals = [
            newMaster.itemGroupId, newMaster.brandId,
            newMaster.itemName, newMaster.uom, newMaster.hsnCode, newMaster.gst,
            newMaster.hasDemoInstallation, newMaster.isActive,
            ...(hasDesc ? [newMaster.description] : []),
            newMaster.freeService, newMaster.billPrintNote, newMaster.warranty,
            v.variant?.trim()          || null,
            parseFloat(v.openingStock)  || 0,
            parseFloat(v.minimumQty)    || 0,
            parseFloat(v.maxMOPPercent) || 0,
            parseFloat(v.offerPrice)    || 0,
            parseFloat(v.stockValue)    || 0,
            parseFloat(v.margin)        || 0,
            parseFloat(v.incentive)     || 0,
            parseFloat(v.maxMOPAmount)  || 0,
            parseFloat(v.nlc)           || 0,
            i,
          ];
          const [result] = await conn.query(
            `INSERT INTO items (${insertCols.join(', ')}) VALUES (${placeholders})`, vals
          );
          newIds.push(result.insertId);
        }
        await conn.commit();
      } catch (txErr) {
        await conn.rollback();
        conn.release();
        throw txErr;   // rolled back → item is preserved, no data loss
      }
      conn.release();

      // Move legacy item_images to new primary row
      if (newIds.length) {
        await db.query('UPDATE item_images SET itemId = ? WHERE itemId = ?', [newIds[0], id]);
      }

      // Handle deleteImageIds for legacy images
      let deleteIds = updateData['deleteImageIds[]'] || updateData['deleteImageIds'] || [];
      if (!Array.isArray(deleteIds)) deleteIds = [deleteIds];
      const validDeleteIds = deleteIds.filter(Boolean);
      if (validDeleteIds.length) {
        const [imgsToDelete] = await db.query(
          'SELECT id, imageUrl FROM item_images WHERE id IN (?)',
          [validDeleteIds]
        );
        await Promise.all(imgsToDelete.map((img) => {
          const fp = path.join(process.cwd(), img.imageUrl);
          if (fs.existsSync(fp)) fs.unlinkSync(fp);
        }));
        if (imgsToDelete.length) {
          await db.query('DELETE FROM item_images WHERE id IN (?)', [imgsToDelete.map((i) => i.id)]);
        }
      }

      // Legacy itemImages files
      const legacyFiles = (req.files || []).filter((f) => f.fieldname === 'itemImages');
      if (legacyFiles.length && newIds.length) {
        const [[{ maxOrder }]] = await db.query(
          'SELECT COALESCE(MAX(sortOrder), -1) AS maxOrder FROM item_images WHERE itemId = ?',
          [newIds[0]]
        );
        const imageRows = legacyFiles.map((file, i) => [
          newIds[0],
          `/uploads/items/${file.filename}`,
          file.originalname,
          file.size,
          file.mimetype,
          maxOrder + 1 + i,
        ]);
        await db.query(
          `INSERT INTO item_images (itemId, imageUrl, fileName, fileSize, mimeType, sortOrder) VALUES ?`,
          [imageRows]
        );
      }

      // Move existing item_variant_colors to new primary row, then upsert colors
      if (newIds.length) {
        await db.query('UPDATE item_variant_colors SET itemId = ? WHERE itemId = ?', [newIds[0], id]);
      }

      if (Array.isArray(colorsJson) && newIds.length) {
        await _saveColorsAndImages(newIds[0], colorsJson, req.files || []);
      }

      const updated = await _fetchItemWithVariants(newIds[0]);
      return res.status(200).json({ success: true, message: 'Item updated successfully', data: updated });
    }

    // ── Master-only field update (no variant change) ──────────
    const allowedFields = [
      'itemGroupId', 'brandId', 'itemName', 'uom', 'hsnCode', 'gst',
      'hasDemoInstallation', 'freeService', 'billPrintNote', 'warranty', 'isActive',
    ];
    if (await itemsHasDescription()) allowedFields.push('description');
    const updates = [];
    const values  = [];
    allowedFields.forEach((field) => {
      if (updateData[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(field === 'isActive' ? (updateData[field] ? 1 : 0) : updateData[field] === '' ? null : updateData[field]);
      }
    });

    if (updates.length) {
      values.push(orig.itemName, orig.itemGroupId, orig.brandId);
      await db.query(
        `UPDATE items
         SET ${updates.join(', ')}, updatedAt = CURRENT_TIMESTAMP
         WHERE itemName = ? AND (itemGroupId <=> ?) AND (brandId <=> ?)`,
        values
      );
    }

    // Colors (no variant replacement)
    if (Array.isArray(colorsJson)) {
      await _saveColorsAndImages(id, colorsJson, req.files || []);
    }

    // Legacy delete images
    let deleteIds = updateData['deleteImageIds[]'] || updateData['deleteImageIds'] || [];
    if (!Array.isArray(deleteIds)) deleteIds = [deleteIds];
    const validDeleteIds = deleteIds.filter(Boolean);
    if (validDeleteIds.length) {
      const [imgsToDelete] = await db.query(
        'SELECT id, imageUrl FROM item_images WHERE id IN (?) AND itemId = ?',
        [validDeleteIds, id]
      );
      await Promise.all(imgsToDelete.map((img) => {
        const fp = path.join(process.cwd(), img.imageUrl);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
      }));
      if (imgsToDelete.length) {
        await db.query('DELETE FROM item_images WHERE id IN (?)', [imgsToDelete.map((i) => i.id)]);
      }
    }

    // New legacy images
    const legacyFiles = (req.files || []).filter((f) => f.fieldname === 'itemImages');
    if (legacyFiles.length) {
      const [[{ maxOrder }]] = await db.query(
        'SELECT COALESCE(MAX(sortOrder), -1) AS maxOrder FROM item_images WHERE itemId = ?',
        [id]
      );
      const imageRows = legacyFiles.map((file, i) => [
        id,
        `/uploads/items/${file.filename}`,
        file.originalname,
        file.size,
        file.mimetype,
        maxOrder + 1 + i,
      ]);
      await db.query(
        `INSERT INTO item_images (itemId, imageUrl, fileName, fileSize, mimeType, sortOrder) VALUES ?`,
        [imageRows]
      );
    }

    const updated = await _fetchItemWithVariants(id);
    return res.status(200).json({ success: true, message: 'Item updated successfully', data: updated });
  } catch (error) {
    console.error('Update item error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update item', error: error.message });
  }
};

// ─────────────────────────────────────────────
// Delete Item
// ─────────────────────────────────────────────
export const deleteItem = async (req, res) => {
  try {
    const { id } = req.params;
    res.set('Cache-Control', 'no-store');

    const [existing] = await db.query('SELECT * FROM items WHERE id = ?', [id]);
    if (!existing.length)
      return res.status(404).json({ success: false, message: 'Item not found' });

    const orig = existing[0];

    const [siblings] = await db.query(
      `SELECT id FROM items
       WHERE itemName = ? AND (itemGroupId <=> ?) AND (brandId <=> ?)`,
      [orig.itemName, orig.itemGroupId, orig.brandId]
    );
    const siblingIds = siblings.map((s) => s.id);

    if (siblingIds.length) {
      // Delete legacy item_images
      const [images] = await db.query('SELECT imageUrl FROM item_images WHERE itemId IN (?)', [siblingIds]);
      await Promise.all(images.map((img) => {
        const fp = path.join(process.cwd(), img.imageUrl);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
      }));
      await db.query('DELETE FROM item_images WHERE itemId IN (?)', [siblingIds]);

      // Delete item_variant_colors + item_variant_images
      const [colors] = await db.query('SELECT id FROM item_variant_colors WHERE itemId IN (?)', [siblingIds]);
      if (colors.length) {
        const colorIds = colors.map((c) => c.id);
        const [colorImgs] = await db.query('SELECT imageUrl FROM item_variant_images WHERE itemVariantColorId IN (?)', [colorIds]);
        await Promise.all(colorImgs.map((img) => {
          const fp = path.join(process.cwd(), img.imageUrl);
          if (fs.existsSync(fp)) fs.unlinkSync(fp);
        }));
        await db.query('DELETE FROM item_variant_images WHERE itemVariantColorId IN (?)', [colorIds]);
        await db.query('DELETE FROM item_variant_colors WHERE id IN (?)', [colorIds]);
      }

      await db.query('DELETE FROM items WHERE id IN (?)', [siblingIds]);
    }

    return res.status(200).json({ success: true, message: 'Item deleted successfully' });
  } catch (error) {
    console.error('Delete item error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete item', error: error.message });
  }
};



// ─────────────────────────────────────────────
// Get Item Images
// ─────────────────────────────────────────────
export const getItemImages = async (req, res) => {
  try {
    const { id } = req.params;
    const [images] = await db.query(
      'SELECT * FROM item_images WHERE itemId = ? ORDER BY sortOrder ASC',
      [id]
    );
    return res.status(200).json({
      success: true,
      data: images.map((img) => ({ ...img, imageUrl: toAbsUrl(img.imageUrl) })),
    });
  } catch (error) {
    console.error('Get item images error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch images', error: error.message });
  }
};

// ─────────────────────────────────────────────
// Delete Single Image
// ─────────────────────────────────────────────
export const deleteItemImage = async (req, res) => {
  try {
    const { id, imageId } = req.params;
    const [img] = await db.query(
      'SELECT * FROM item_images WHERE id = ? AND itemId = ?',
      [imageId, id]
    );
    if (!img.length)
      return res.status(404).json({ success: false, message: 'Image not found' });

    const fp = path.join(process.cwd(), img[0].imageUrl);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    await db.query('DELETE FROM item_images WHERE id = ?', [imageId]);

    return res.status(200).json({ success: true, message: 'Image deleted successfully' });
  } catch (error) {
    console.error('Delete item image error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete image', error: error.message });
  }
};
