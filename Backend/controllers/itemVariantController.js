// routes/itemVariantColors.js
// Full CRUD for  items → colors → images
// Mount at:  app.use('/api/item-variant-colors', itemVariantColorsRouter)

import express from 'express';
import multer  from 'multer';
import path    from 'path';
import fs      from 'fs';
import { db }  from '../config/db.js';
import { authenticate } from '../middleware/auth.js'; // your existing auth middleware

const router = express.Router();
import { toAssetUrl, assetFilePath } from '../utils/assetUrl.js';

// ── Multer setup ────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination(req, file, cb) {
    const dir = 'uploads/item-variant-images';
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    const ext  = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/\s+/g, '-');
    cb(null, `${Date.now()}-${base}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const ok = /jpeg|jpg|png|webp/.test(file.mimetype);
    cb(ok ? null : new Error('Only image files are allowed'), ok);
  },
});

function imgUrl(p) {
  return toAssetUrl(p);
}

// ── Helpers ──────────────────────────────────────────────────────────────────
async function getColorsForItem(itemId) {
  const [colors] = await db.query(
    `SELECT * FROM item_variant_colors WHERE itemId = ? AND isActive = 1 ORDER BY sortOrder ASC`,
    [itemId]
  );
  if (!colors.length) return [];

  const colorIds = colors.map(c => c.id);
  const [images] = await db.query(
    `SELECT * FROM item_variant_images WHERE itemVariantColorId IN (?) ORDER BY sortOrder ASC`,
    [colorIds]
  );

  const imgMap = {};
  for (const img of images) {
    if (!imgMap[img.itemVariantColorId]) imgMap[img.itemVariantColorId] = [];
    imgMap[img.itemVariantColorId].push({ ...img, imageUrl: imgUrl(img.imageUrl) });
  }

  return colors.map(c => ({
    ...c,
    images: imgMap[c.id] || [],
    primaryImage: (imgMap[c.id]?.[0]?.imageUrl) || null,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/item-variant-colors/by-item/:itemId
// Returns all colors (+ their images) for a given variant row
// ─────────────────────────────────────────────────────────────────────────────
router.get('/by-item/:itemId', authenticate, async (req, res) => {
  try {
    const colors = await getColorsForItem(req.params.itemId);
    return res.json({ success: true, data: colors });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/item-variant-colors/by-item-group
// Returns colors for ALL variants of a product family (same itemName+group+brand)
// Query: ?masterId=<items.id>
// ─────────────────────────────────────────────────────────────────────────────
router.get('/by-item-group', authenticate, async (req, res) => {
  try {
    const { masterId } = req.query;
    if (!masterId) return res.status(400).json({ success: false, message: 'masterId required' });

    const [master] = await db.query('SELECT * FROM items WHERE id = ?', [masterId]);
    if (!master.length) return res.status(404).json({ success: false, message: 'Item not found' });

    const m = master[0];
    const [siblings] = await db.query(
      `SELECT id FROM items
       WHERE itemName = ? AND (itemGroupId <=> ?) AND (brandId <=> ?) AND isActive = 1
       ORDER BY sortOrder ASC`,
      [m.itemName, m.itemGroupId, m.brandId]
    );

    const result = [];
    for (const s of siblings) {
      const colors = await getColorsForItem(s.id);
      result.push({ variantId: s.id, colors });
    }
    return res.json({ success: true, data: result });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/item-variant-colors
// Create a new color for a variant
// Body (multipart): itemId, colorName, colorHex?, sortOrder?, images[]
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', authenticate, upload.array('images', 10), async (req, res) => {
  try {
    const { itemId, colorName, colorHex, sortOrder = 0 } = req.body;
    if (!itemId)    return res.status(400).json({ success: false, message: 'itemId required' });
    if (!colorName) return res.status(400).json({ success: false, message: 'colorName required' });

    const [r] = await db.query(
      `INSERT INTO item_variant_colors (itemId, colorName, colorHex, sortOrder) VALUES (?, ?, ?, ?)`,
      [itemId, colorName.trim(), colorHex || null, Number(sortOrder)]
    );
    const colorId = r.insertId;

    if (req.files?.length) {
      const rows = req.files.map((f, i) => [
        colorId,
        `/uploads/item-variant-images/${f.filename}`,
        f.originalname,
        f.size,
        f.mimetype,
        i,
      ]);
      await db.query(
        `INSERT INTO item_variant_images (itemVariantColorId, imageUrl, fileName, fileSize, mimeType, sortOrder) VALUES ?`,
        [rows]
      );
    }

    const [color] = await db.query('SELECT * FROM item_variant_colors WHERE id = ?', [colorId]);
    const colors  = await getColorsForItem(itemId);
    return res.status(201).json({ success: true, data: colors });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/item-variant-colors/:id
// Update color name/hex + optionally add more images
// Body (multipart): colorName?, colorHex?, sortOrder?, deleteImageIds[]?, images[]?
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id', authenticate, upload.array('images', 10), async (req, res) => {
  try {
    const { id } = req.params;
    const { colorName, colorHex, sortOrder } = req.body;

    const [existing] = await db.query('SELECT * FROM item_variant_colors WHERE id = ?', [id]);
    if (!existing.length) return res.status(404).json({ success: false, message: 'Color not found' });
    const color = existing[0];

    // Update color row
    const updates = [];
    const vals    = [];
    if (colorName  !== undefined) { updates.push('colorName = ?');  vals.push(colorName.trim()); }
    if (colorHex   !== undefined) { updates.push('colorHex = ?');   vals.push(colorHex || null); }
    if (sortOrder  !== undefined) { updates.push('sortOrder = ?');  vals.push(Number(sortOrder)); }
    if (updates.length) {
      vals.push(id);
      await db.query(`UPDATE item_variant_colors SET ${updates.join(', ')}, updatedAt = NOW() WHERE id = ?`, vals);
    }

    // Delete requested images
    let deleteIds = req.body['deleteImageIds[]'] || req.body['deleteImageIds'] || [];
    if (!Array.isArray(deleteIds)) deleteIds = [deleteIds];
    deleteIds = deleteIds.filter(Boolean);
    if (deleteIds.length) {
      const [imgs] = await db.query('SELECT * FROM item_variant_images WHERE id IN (?) AND itemVariantColorId = ?', [deleteIds, id]);
      for (const img of imgs) {
        const fp = assetFilePath(img.imageUrl);
        if (fp && fs.existsSync(fp)) fs.unlinkSync(fp);
      }
      if (imgs.length) await db.query('DELETE FROM item_variant_images WHERE id IN (?)', [imgs.map(i => i.id)]);
    }

    // Add new images
    if (req.files?.length) {
      const [[{ maxOrder }]] = await db.query(
        'SELECT COALESCE(MAX(sortOrder), -1) AS maxOrder FROM item_variant_images WHERE itemVariantColorId = ?',
        [id]
      );
      const rows = req.files.map((f, i) => [
        id,
        `/uploads/item-variant-images/${f.filename}`,
        f.originalname,
        f.size,
        f.mimetype,
        maxOrder + 1 + i,
      ]);
      await db.query(
        `INSERT INTO item_variant_images (itemVariantColorId, imageUrl, fileName, fileSize, mimeType, sortOrder) VALUES ?`,
        [rows]
      );
    }

    const colors = await getColorsForItem(color.itemId);
    return res.json({ success: true, data: colors });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/item-variant-colors/:id
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const [existing] = await db.query('SELECT * FROM item_variant_colors WHERE id = ?', [id]);
    if (!existing.length) return res.status(404).json({ success: false, message: 'Color not found' });

    // Delete image files
    const [imgs] = await db.query('SELECT imageUrl FROM item_variant_images WHERE itemVariantColorId = ?', [id]);
    for (const img of imgs) {
      const fp = assetFilePath(img.imageUrl);
      if (fp && fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    await db.query('DELETE FROM item_variant_images WHERE itemVariantColorId = ?', [id]);
    await db.query('DELETE FROM item_variant_colors WHERE id = ?', [id]);

    return res.json({ success: true, message: 'Color deleted' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC (no auth) — used by the storefront
// GET /api/public/item-variant-colors/by-item/:itemId
// ─────────────────────────────────────────────────────────────────────────────
export const publicGetColorsByItem = async (req, res) => {
  try {
    const colors = await getColorsForItem(req.params.itemId);
    return res.json({ success: true, data: colors });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

export default router;
