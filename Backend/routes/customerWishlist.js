// routes/customerWishlist.js
// Full CRUD for a customer's wishlist — syncs with the React wishlist-context

import express from "express";
import { db } from "../config/db.js";
import { toAssetUrl } from "../utils/assetUrl.js";
import { priceItem } from "../services/pricing.js";
import { requireCustomer } from "../middleware/customerAuth.js";

const router = express.Router();
router.use(requireCustomer);

function ok(res, data, msg = "Success") {
  return res.json({ success: true, message: msg, data });
}
function fail(res, msg, status = 400) {
  return res.status(status).json({ success: false, message: msg });
}


// ─── Shared item fetch query ──────────────────────────────────────────────────
// FIX: Now fetches offerPrice, originalPrice (nlc), and primaryImage from items table
const ITEM_SELECT = `
  SELECT
    i.id,
    i.itemName,
    i.variant,
    i.gst,
    i.isActive,
    i.offerPrice,
    i.nlc,
    b.name   AS brandName,
    cat.name AS categoryName,
    (SELECT imageUrl FROM item_images WHERE itemId = i.id ORDER BY sortOrder ASC LIMIT 1) AS primaryImage,
    ww.addedAt
  FROM website_wishlists ww
  JOIN items i   ON i.id   = ww.itemId
  LEFT JOIN item_groups ig ON ig.id   = i.itemGroupId
  LEFT JOIN categories  cat ON cat.id = ig.categoryId
  LEFT JOIN brands      b   ON b.id   = i.brandId
`;

// ─── GET all wishlist items ───────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const customerId = req.customer.id;

    const [rows] = await db.query(
      `${ITEM_SELECT} WHERE ww.customerId = ? AND i.isActive = 1 ORDER BY ww.addedAt DESC`,
      [customerId]
    );

    const items = rows.map((row) => {
      // Build image URL
      const image = toAssetUrl(row.primaryImage);

      // offerPrice from items table; originalPrice from nlc if higher, else same
      const priced = priceItem(row); // GST-inclusive, see services/pricing.js
      const offerPrice = priced.sellingPrice;
      const originalPrice = priced.mrp > offerPrice ? priced.mrp : offerPrice;

      return {
        id: String(row.id),
        itemName: row.itemName,
        brandName: row.brandName || null,
        primaryImage: image,
        offerPrice,
        originalPrice,
        categoryName: row.categoryName || null,
        variant: row.variant || null,
        gst: Number(row.gst) || 0,
        isActive: Boolean(row.isActive),
        addedAt: row.addedAt,
      };
    });

    return ok(res, items);
  } catch (e) {
    console.error("[wishlist/GET]", e);
    return fail(res, "Server error", 500);
  }
});

// ─── ADD item to wishlist ────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const customerId = req.customer.id;
    const { itemId } = req.body;

    if (!itemId) return fail(res, "itemId is required");

    const [[item]] = await db.query(
      "SELECT id FROM items WHERE id = ? AND isActive = 1",
      [itemId]
    );
    if (!item) return fail(res, "Item not found", 404);

    await db.query(
      `INSERT INTO website_wishlists (customerId, itemId)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE addedAt = NOW()`,
      [customerId, itemId]
    );

    return ok(res, { itemId: String(itemId) }, "Added to wishlist");
  } catch (e) {
    console.error("[wishlist/POST]", e);
    return fail(res, "Server error", 500);
  }
});

// ─── TOGGLE item in wishlist ──────────────────────────────────────────────────
router.put("/toggle", async (req, res) => {
  try {
    const customerId = req.customer.id;
    const { itemId } = req.body;
    if (!itemId) return fail(res, "itemId is required");

    const [[existing]] = await db.query(
      "SELECT id FROM website_wishlists WHERE customerId = ? AND itemId = ?",
      [customerId, itemId]
    );

    if (existing) {
      await db.query(
        "DELETE FROM website_wishlists WHERE customerId = ? AND itemId = ?",
        [customerId, itemId]
      );
      return ok(res, { added: false, itemId: String(itemId) }, "Removed from wishlist");
    } else {
      await db.query(
        "INSERT INTO website_wishlists (customerId, itemId) VALUES (?, ?)",
        [customerId, itemId]
      );
      return ok(res, { added: true, itemId: String(itemId) }, "Added to wishlist");
    }
  } catch (e) {
    console.error("[wishlist/toggle]", e);
    return fail(res, "Server error", 500);
  }
});

// ─── REMOVE one item ──────────────────────────────────────────────────────────
router.delete("/:itemId", async (req, res) => {
  try {
    const customerId = req.customer.id;
    const { itemId } = req.params;

    await db.query(
      "DELETE FROM website_wishlists WHERE customerId = ? AND itemId = ?",
      [customerId, itemId]
    );

    return ok(res, { itemId: String(itemId) }, "Removed from wishlist");
  } catch (e) {
    console.error("[wishlist/DELETE]", e);
    return fail(res, "Server error", 500);
  }
});

// ─── CLEAR entire wishlist ────────────────────────────────────────────────────
router.delete("/", async (req, res) => {
  try {
    const customerId = req.customer.id;
    await db.query(
      "DELETE FROM website_wishlists WHERE customerId = ?",
      [customerId]
    );
    return ok(res, null, "Wishlist cleared");
  } catch (e) {
    console.error("[wishlist/clear]", e);
    return fail(res, "Server error", 500);
  }
});

// ─── SYNC wishlist (bulk upsert after guest login) ───────────────────────────
router.post("/sync", async (req, res) => {
  try {
    const customerId = req.customer.id;
    const { itemIds = [] } = req.body;

    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return ok(res, { synced: 0 });
    }

    const placeholders = itemIds.map(() => "?").join(",");
    const [validItems] = await db.query(
      `SELECT id FROM items WHERE id IN (${placeholders}) AND isActive = 1`,
      itemIds
    );

    if (validItems.length === 0) return ok(res, { synced: 0 });

    const values = validItems.map((item) => [customerId, item.id]);
    await db.query(
      `INSERT INTO website_wishlists (customerId, itemId) VALUES ?
       ON DUPLICATE KEY UPDATE addedAt = addedAt`,
      [values]
    );

    return ok(res, { synced: validItems.length });
  } catch (e) {
    console.error("[wishlist/sync]", e);
    return fail(res, "Server error", 500);
  }
});

export default router;
