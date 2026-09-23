import express from "express";
import { db } from "../config/db.js";
import { ensureOffersSchema } from "../controllers/offerController.js";

const router = express.Router();

const BASE_URL = process.env.BASE_URL?.replace(/\/+$/, "") || "";

// ─── helpers ─────────────────────────────────────────────────────────────────

function ok(res, data) {
  return res.json({ success: true, data });
}

function paginated(res, data, { total, page, limit }) {
  return res.json({
    success: true,
    data,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / limit) || 1,
    },
  });
}

function notFound(res, msg = "Not found") {
  return res.status(404).json({ success: false, message: msg });
}

function serverErr(res, error, msg = "Server error") {
  console.error("[publicRoutes]", error);
  return res.status(500).json({ success: false, message: msg });
}

/** Prefix relative image paths with BASE_URL */
function imgUrl(path) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${BASE_URL}/${path.replace(/^\//, "")}`;
}

/** Normalize a category row — handles both snake_case and camelCase columns */
function normalizeCategory(row) {
  return {
    ...row,
    categoryImage: imgUrl(row.categoryImage || row.category_image),
    showOnWebsite:
      row.showOnWebsite === 1 ||
      row.showOnWebsite === true ||
      row.showOnWebsite === "1" ||
      row.show_on_website === 1 ||
      row.show_on_website === true ||
      row.show_on_website === "1",
    displayOrder: row.displayOrder ?? row.display_order ?? 0,
  };
}

// ── NEW: fetch colors + images for a single item row ─────────────────────────
async function getPublicColorsForItem(itemId) {
  const [colors] = await db.query(
    `SELECT * FROM item_variant_colors
     WHERE itemId = ? AND isActive = 1
     ORDER BY sortOrder ASC`,
    [itemId]
  );
  if (!colors.length) return [];

  const colorIds = colors.map((c) => c.id);
  const [images] = await db.query(
    `SELECT * FROM item_variant_images
     WHERE itemVariantColorId IN (?)
     ORDER BY sortOrder ASC`,
    [colorIds]
  );

  const imgMap = {};
  for (const img of images) {
    const cid = img.itemVariantColorId;
    if (!imgMap[cid]) imgMap[cid] = [];
    imgMap[cid].push({ ...img, imageUrl: imgUrl(img.imageUrl) });
  }

  return colors.map((c) => ({
    ...c,
    images: imgMap[c.id] || [],
    primaryImage: imgMap[c.id]?.[0]?.imageUrl || null,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORIES
// ─────────────────────────────────────────────────────────────────────────────

router.get("/categories", async (req, res) => {
  try {
    const { showOnWebsite } = req.query;

    let sql = `
      SELECT c.*
      FROM categories c
      WHERE c.isActive = 1
    `;
    const params = [];

    if (showOnWebsite === "true") {
      sql += " AND c.show_on_website = 1";
    }

    sql += " ORDER BY c.display_order ASC, c.name ASC";

    const [rows] = await db.query(sql, params);
    return ok(res, rows.map(normalizeCategory));
  } catch (e) {
    return serverErr(res, e);
  }
});

router.get("/categories/:id", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT c.*
       FROM categories c
       WHERE c.id = ? AND c.isActive = 1`,
      [req.params.id]
    );
    if (!rows.length) return notFound(res, "Category not found");
    return ok(res, normalizeCategory(rows[0]));
  } catch (e) {
    return serverErr(res, e);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// BRANDS
// ─────────────────────────────────────────────────────────────────────────────

router.get("/brands", async (req, res) => {
  try {
    let sql = `
      SELECT b.*
      FROM brands b
      WHERE b.isActive = 1
    `;
    const params = [];

    sql += " ORDER BY b.name ASC";

    const [rows] = await db.query(sql, params);
    return ok(res, rows);
  } catch (e) {
    return serverErr(res, e);
  }
});

router.get("/brands/:id", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT b.*
       FROM brands b
       WHERE b.id = ? AND b.isActive = 1`,
      [req.params.id]
    );
    if (!rows.length) return notFound(res, "Brand not found");
    return ok(res, rows[0]);
  } catch (e) {
    return serverErr(res, e);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ITEMS / PRODUCTS
// ─────────────────────────────────────────────────────────────────────────────

// CHANGE 1: /items listing now includes primaryImage from color system
router.get("/items", async (req, res) => {
  try {
    const {
      categoryId,
      brandId,
      itemGroupId,
      search,
      ids: idsFilterParam,
      page = 1,
      limit = 20,
    } = req.query;

    const offset = (Number(page) - 1) * Number(limit);
    const conditions = ["i.isActive = 1"];
    const params = [];

    if (brandId) {
      conditions.push("i.brandId = ?");
      params.push(brandId);
    }
    if (itemGroupId) {
      conditions.push("i.itemGroupId = ?");
      params.push(itemGroupId);
    }
    if (categoryId) {
      conditions.push("ig.categoryId = ?");
      params.push(categoryId);
    }
    if (search) {
      conditions.push("(i.itemName LIKE ? OR b.name LIKE ?)");
      params.push(`%${search}%`, `%${search}%`);
    }
    // Filter to an explicit set of product IDs (e.g. products linked to a
    // specific offer via offer_products) — comma-separated list.
    if (idsFilterParam) {
      const idList = String(idsFilterParam)
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
      if (idList.length) {
        conditions.push("i.id IN (?)");
        params.push(idList);
      }
    }

    const where = conditions.join(" AND ");

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total
       FROM items i
       LEFT JOIN item_groups ig ON ig.id = i.itemGroupId
       LEFT JOIN brands b       ON b.id  = i.brandId
       WHERE ${where}`,
      params
    );

    const [rows] = await db.query(
      `SELECT
         i.*,
         b.name   AS brandName,
         ig.name  AS itemGroupName,
         cat.name AS categoryName,
         cat.id   AS categoryId,
         (
           SELECT imageUrl
           FROM item_images
           WHERE itemId = i.id
           ORDER BY sortOrder ASC
           LIMIT 1
         ) AS legacyPrimaryImage
       FROM items i
       LEFT JOIN item_groups ig  ON ig.id  = i.itemGroupId
       LEFT JOIN categories  cat ON cat.id = ig.categoryId
       LEFT JOIN brands      b   ON b.id   = i.brandId
       WHERE ${where}
       ORDER BY i.sortOrder ASC, i.itemName ASC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset]
    );

    // ── Attach color primary images from new color system ─────────────────────
    const ids = rows.map((r) => r.id);
    let colorMap = {};

    if (ids.length) {
      const [colorRows] = await db.query(
        `SELECT
           ivc.itemId,
           ivc.id        AS colorId,
           ivc.colorName,
           ivc.colorHex,
           ivc.sortOrder,
           (
             SELECT imageUrl FROM item_variant_images
             WHERE itemVariantColorId = ivc.id
             ORDER BY sortOrder ASC LIMIT 1
           ) AS firstImage
         FROM item_variant_colors ivc
         WHERE ivc.itemId IN (?) AND ivc.isActive = 1
         ORDER BY ivc.itemId ASC, ivc.sortOrder ASC`,
        [ids]
      );

      for (const cr of colorRows) {
        if (!colorMap[cr.itemId]) colorMap[cr.itemId] = [];
        colorMap[cr.itemId].push({
          id:          cr.colorId,
          colorName:   cr.colorName,
          colorHex:    cr.colorHex,
          sortOrder:   cr.sortOrder,
          // Use new color image; fall back to legacy
          primaryImage: imgUrl(cr.firstImage),
        });
      }
    }

    const mapped = rows.map((r) => ({
      ...r,
      // Prefer color system image; fall back to legacy item_images
      primaryImage:
        colorMap[r.id]?.[0]?.primaryImage || imgUrl(r.legacyPrimaryImage),
      colors: colorMap[r.id] || [],
    }));

    return paginated(res, mapped, { total, page, limit: Number(limit) });
  } catch (e) {
    return serverErr(res, e);
  }
});

// CHANGE 2: /items/:id now returns full variantsWithColors
router.get("/items/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await db.query(
      `SELECT
         i.*,
         b.name   AS brandName,
         ig.name  AS itemGroupName,
         cat.name AS categoryName,
         cat.id   AS categoryId
       FROM items i
       LEFT JOIN item_groups ig  ON ig.id  = i.itemGroupId
       LEFT JOIN categories  cat ON cat.id = ig.categoryId
       LEFT JOIN brands      b   ON b.id   = i.brandId
       WHERE i.id = ? AND i.isActive = 1`,
      [id]
    );

    if (!rows.length) return notFound(res, "Item not found");

    const item = rows[0];

    // ── Legacy images (kept for fallback) ────────────────────────────────────
    const [legacyImages] = await db.query(
      "SELECT * FROM item_images WHERE itemId = ? ORDER BY sortOrder ASC",
      [id]
    );
    item.legacyImages = legacyImages.map((img) => ({
      ...img,
      imageUrl: imgUrl(img.imageUrl),
    }));

    // ── Find all sibling variants (same product family) ───────────────────────
    // Siblings = same itemName + itemGroupId + brandId
    const [siblings] = await db.query(
      `SELECT
         i.*,
         b.name   AS brandName,
         ig.name  AS itemGroupName,
         cat.name AS categoryName,
         cat.id   AS categoryId
       FROM items i
       LEFT JOIN brands      b   ON b.id   = i.brandId
       LEFT JOIN item_groups ig  ON ig.id  = i.itemGroupId
       LEFT JOIN categories  cat ON cat.id = ig.categoryId
       WHERE i.itemName     = ?
         AND (i.itemGroupId <=> ?)
         AND (i.brandId     <=> ?)
         AND i.isActive = 1
       ORDER BY i.sortOrder ASC, i.id ASC`,
      [item.itemName, item.itemGroupId, item.brandId]
    );

    // ── For each sibling variant, attach colors + images ──────────────────────
    const variantsWithColors = [];

    for (const sib of siblings) {
      const colors = await getPublicColorsForItem(sib.id);

      // Fallback: if no new-style colors, wrap legacy item_images as "Default"
      let finalColors = colors;
      if (!finalColors.length) {
        const [sibLegacy] = await db.query(
          "SELECT * FROM item_images WHERE itemId = ? ORDER BY sortOrder ASC",
          [sib.id]
        );
        if (sibLegacy.length) {
          finalColors = [
            {
              id:          null,
              itemId:      sib.id,
              colorName:   "Default",
              colorHex:    null,
              sortOrder:   0,
              isActive:    1,
              images:      sibLegacy.map((img) => ({
                ...img,
                imageUrl: imgUrl(img.imageUrl),
              })),
              primaryImage: imgUrl(sibLegacy[0].imageUrl),
            },
          ];
        }
      }

      variantsWithColors.push({
        ...sib,
        colors:      finalColors,
        primaryImage: finalColors[0]?.primaryImage || null,
      });
    }

    item.variantsWithColors = variantsWithColors;

    // ── Set top-level images = current variant's first color images ───────────
    const currentVariant =
      variantsWithColors.find((v) => String(v.id) === String(id)) ||
      variantsWithColors[0];
    const firstColor = currentVariant?.colors[0];

    item.images       = firstColor?.images || item.legacyImages;
    item.primaryImage = item.images[0]?.imageUrl || null;

    return ok(res, item);
  } catch (e) {
    return serverErr(res, e);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// OFFERS  (flash sale, today's best, bank offers, etc.)
// ─────────────────────────────────────────────────────────────────────────────

router.get("/offers", async (req, res) => {
  try {
    // Older databases predate offer_products and the offer-type columns.
    await ensureOffersSchema().catch(() => {});
    const { section, itemId } = req.query;
    const now = new Date();

    const where = ["o.isActive = 1"];
    const params = [];
    if (section) {
      where.push("o.section = ?");
      params.push(section);
    }
    // When itemId is given, return offers assigned to that product:
    //  - offers whose own product is this item, OR
    //  - offers linked to it via offer_products (many-to-many)
    if (itemId) {
      where.push("(o.itemId = ? OR EXISTS (SELECT 1 FROM offer_products op WHERE op.offerId = o.id AND op.itemId = ?))");
      params.push(itemId, itemId);
    }

    const [rows] = await db.query(
      `SELECT
         o.*,
         i.itemName   AS itemName,
         i.variant    AS variant,
         i.offerPrice AS mrp,
         b.name       AS brandName,
         ig.name      AS itemGroupName,
         bd.name      AS brandMasterName,
         bd.iconUrl   AS brandLogoRaw,
         (
           SELECT imageUrl FROM item_images
           WHERE itemId = i.id ORDER BY sortOrder ASC LIMIT 1
         ) AS legacyPrimaryImage,
         (
           SELECT ivi.imageUrl
           FROM item_variant_colors ivc
           JOIN item_variant_images ivi ON ivi.itemVariantColorId = ivc.id
           WHERE ivc.itemId = i.id AND ivc.isActive = 1
           ORDER BY ivc.sortOrder ASC, ivi.sortOrder ASC LIMIT 1
         ) AS colorPrimaryImage,
         (
           SELECT COUNT(*) FROM offer_products op WHERE op.offerId = o.id
         ) AS productCount,
         (
           SELECT GROUP_CONCAT(op.itemId ORDER BY op.itemId)
           FROM offer_products op WHERE op.offerId = o.id
         ) AS productIdsRaw
       FROM offers o
       LEFT JOIN items       i  ON o.itemId      = i.id
       LEFT JOIN brands      b  ON i.brandId     = b.id
       LEFT JOIN item_groups ig ON i.itemGroupId = ig.id
       LEFT JOIN brands      bd ON o.brandId     = bd.id
       WHERE ${where.join(" AND ")}
       ORDER BY o.priority ASC, o.createdAt DESC`,
      params
    );

    // Keep only offers whose schedule window (if any) contains "now"
    const live = rows.filter((o) => {
      const startOk = !o.startAt || new Date(o.startAt) <= now;
      const endOk = !o.endAt || new Date(o.endAt) >= now;
      return startOk && endOk;
    });

    // Combo deals store their bundled products as JSON (comboItems) rather than
    // a single itemId, so the items JOIN above never resolves an image for them.
    // Look up the first bundled product's real photo here so combo cards on the
    // website show an actual product image instead of always falling back to
    // the generic placeholder.
    const comboFirstItemIds = [];
    for (const o of live) {
      if (o.section !== "combo" || o.comboItems == null) continue;
      try {
        const arr = typeof o.comboItems === "string" ? JSON.parse(o.comboItems) : o.comboItems;
        const firstId = Number(arr?.[0]?.itemId);
        if (Number.isFinite(firstId) && firstId > 0) comboFirstItemIds.push(firstId);
      } catch {
        // ignore malformed combo JSON
      }
    }

    let comboImageMap = {};
    if (comboFirstItemIds.length) {
      const uniqueIds = [...new Set(comboFirstItemIds)];
      const [imgRows] = await db.query(
        `SELECT i.id AS itemId,
                COALESCE(
                  (SELECT ivi.imageUrl FROM item_variant_colors ivc
                   JOIN item_variant_images ivi ON ivi.itemVariantColorId = ivc.id
                   WHERE ivc.itemId = i.id AND ivc.isActive = 1
                   ORDER BY ivc.sortOrder ASC, ivi.sortOrder ASC LIMIT 1),
                  (SELECT imageUrl FROM item_images WHERE itemId = i.id ORDER BY sortOrder ASC LIMIT 1)
                ) AS image
         FROM items i
         WHERE i.id IN (?)`,
        [uniqueIds]
      );
      for (const r of imgRows) comboImageMap[r.itemId] = imgUrl(r.image);
    }

    const data = live.map((o) => {
      let comboItems = [];
      if (o.comboItems != null) {
        try {
          comboItems = typeof o.comboItems === "string" ? JSON.parse(o.comboItems) : o.comboItems;
        } catch {
          comboItems = [];
        }
      }
      const comboImage =
        o.section === "combo" && comboItems[0]?.itemId
          ? comboImageMap[Number(comboItems[0].itemId)]
          : null;
      return {
        ...o,
        primaryImage: comboImage || imgUrl(o.colorPrimaryImage || o.legacyPrimaryImage),
        brandLogo: imgUrl(o.brandLogoRaw),
        tags: o.tags
          ? String(o.tags).split(",").map((t) => t.trim()).filter(Boolean)
          : [],
        comboItems,
        productIds: o.productIdsRaw
          ? String(o.productIdsRaw).split(",").map((v) => Number(v.trim())).filter((n) => !Number.isNaN(n))
          : [],
      };
    });

    return ok(res, data);
  } catch (e) {
    return serverErr(res, e);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SEARCH
// ─────────────────────────────────────────────────────────────────────────────

router.get("/search", async (req, res) => {
  try {
    const { q, limit = 6 } = req.query;

    if (!q || q.trim().length < 2) {
      return ok(res, { items: [], categories: [], brands: [] });
    }

    const like = `%${q}%`;

    const [items] = await db.query(
      `SELECT i.id, i.itemName, i.brandId, b.name AS brandName,
              (SELECT imageUrl FROM item_images WHERE itemId = i.id ORDER BY sortOrder LIMIT 1) AS primaryImage
       FROM items i
       LEFT JOIN brands b ON b.id = i.brandId
       WHERE i.isActive = 1 AND i.itemName LIKE ?
       LIMIT ?`,
      [like, Number(limit)]
    );

    const [categories] = await db.query(
      `SELECT id, name,
              COALESCE(categoryImage, category_image) AS categoryImage
       FROM categories
       WHERE isActive = 1 AND name LIKE ?
       LIMIT ?`,
      [like, Number(limit)]
    );

    const [brands] = await db.query(
      `SELECT id, name FROM brands
       WHERE isActive = 1 AND name LIKE ?
       LIMIT ?`,
      [like, Number(limit)]
    );

    return ok(res, { items, categories, brands });
  } catch (e) {
    return serverErr(res, e);
  }
});

export default router;
