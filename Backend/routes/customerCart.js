// routes/customerCart.js
// Cart + Saved-for-Later for logged-in website/app customers

import express from "express";
import { db } from "../config/db.js";
import { requireCustomer } from "../middleware/customerAuth.js";

const router = express.Router();
router.use(requireCustomer);

function ok(res, data, msg = "Success") {
  return res.json({ success: true, message: msg, data });
}
function fail(res, msg, status = 400) {
  return res.status(status).json({ success: false, message: msg });
}

const baseUrl = () => process.env.BASE_URL?.replace(/\/+$/, "") || "";

// ─── Shared enrichment query ──────────────────────────────────────────────────
// FIX: Fetches offerPrice, nlc (original price), and real image from items/item_images tables.
// priceSnapshot is kept as a fallback only (used to detect price changes).
async function fetchCartRows(customerId, table = "website_cart_items") {
  const isCart = table === "website_cart_items";
  const timeCol = isCart
    ? "wci.updatedAt AS updatedAt, wci.addedAt"
    : "wci.savedAt AS addedAt";
  const qtyCol = isCart ? "wci.qty," : "";
  const priceCol = isCart ? "wci.priceSnapshot," : "wci.priceSnapshot,";
  const orderCol = isCart ? "wci.addedAt" : "wci.savedAt";

  const [rows] = await db.query(
    `SELECT
       i.id,
       i.itemName,
       i.variant,
       i.gst,
       i.isActive,
       i.offerPrice      AS itemOfferPrice,
       i.nlc             AS itemNlc,
       b.name            AS brandName,
       cat.name          AS categoryName,
       (SELECT imageUrl FROM item_images WHERE itemId = i.id ORDER BY sortOrder ASC LIMIT 1) AS primaryImage,
       ${qtyCol}
       ${priceCol}
       ${timeCol}
     FROM ${table} wci
     JOIN items i ON i.id = wci.itemId
     LEFT JOIN item_groups ig  ON ig.id  = i.itemGroupId
     LEFT JOIN categories  cat ON cat.id = ig.categoryId
     LEFT JOIN brands      b   ON b.id   = i.brandId
     WHERE wci.customerId = ?
     ORDER BY ${orderCol} DESC`,
    [customerId]
  );

  const base = baseUrl();

  return rows.map((row) => {
    // Build full image URL
    let image = null;
    if (row.primaryImage) {
      image = row.primaryImage.startsWith("http")
        ? row.primaryImage
        : `${base}/${row.primaryImage.replace(/^\/+/, "")}`;
    }

    // Use real item price; fall back to priceSnapshot if item price is 0
    const itemOfferPrice = Number(row.itemOfferPrice) || 0;
    const itemNlc = Number(row.itemNlc) || 0;
    const snapshot = Number(row.priceSnapshot) || 0;

    const offerPrice = itemOfferPrice || snapshot;
    // originalPrice = nlc if higher than offerPrice, else same as offerPrice
    const originalPrice = itemNlc > offerPrice ? itemNlc : offerPrice;

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
      qty: row.qty ?? 1,
      addedAt: row.addedAt,
      updatedAt: row.updatedAt || null,
    };
  });
}

// ════════════════════════════════════════════════════════════════════════════
// CART ROUTES
// ════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/customer/cart
 */
router.get("/", async (req, res) => {
  try {
    const items = await fetchCartRows(req.customer.id, "website_cart_items");
    return ok(res, items);
  } catch (e) {
    console.error("[cart/GET]", e);
    return fail(res, "Server error", 500);
  }
});

/**
 * POST /api/customer/cart
 * Body: { itemId, qty?: number, priceSnapshot?: number }
 */
router.post("/", async (req, res) => {
  try {
    const customerId = req.customer.id;
    const { itemId, qty = 1, priceSnapshot } = req.body;

    if (!itemId) return fail(res, "itemId is required");
    if (qty < 1 || qty > 99) return fail(res, "qty must be between 1 and 99");

    const [[item]] = await db.query(
      "SELECT id, offerPrice FROM items WHERE id = ? AND isActive = 1",
      [itemId]
    );
    if (!item) return fail(res, "Item not found or inactive", 404);

    // Use item's real price as snapshot if not provided
    const snapshot = priceSnapshot || item.offerPrice || null;

    await db.query(
      `INSERT INTO website_cart_items (customerId, itemId, qty, priceSnapshot)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE qty = VALUES(qty), priceSnapshot = VALUES(priceSnapshot), updatedAt = NOW()`,
      [customerId, itemId, qty, snapshot]
    );

    return ok(res, { itemId: String(itemId), qty }, "Added to cart");
  } catch (e) {
    console.error("[cart/POST]", e);
    return fail(res, "Server error", 500);
  }
});

/**
 * PATCH /api/customer/cart/:itemId
 * Body: { qty }
 */
router.patch("/:itemId", async (req, res) => {
  try {
    const customerId = req.customer.id;
    const { itemId } = req.params;
    const { qty } = req.body;

    if (!qty || qty < 1 || qty > 99) return fail(res, "qty must be between 1 and 99");

    const [result] = await db.query(
      `UPDATE website_cart_items SET qty = ?, updatedAt = NOW()
       WHERE customerId = ? AND itemId = ?`,
      [qty, customerId, itemId]
    );

    if (result.affectedRows === 0) return fail(res, "Item not in cart", 404);
    return ok(res, { itemId: String(itemId), qty }, "Quantity updated");
  } catch (e) {
    console.error("[cart/PATCH]", e);
    return fail(res, "Server error", 500);
  }
});

/**
 * DELETE /api/customer/cart/:itemId
 */
router.delete("/:itemId", async (req, res) => {
  try {
    await db.query(
      "DELETE FROM website_cart_items WHERE customerId = ? AND itemId = ?",
      [req.customer.id, req.params.itemId]
    );
    return ok(res, { itemId: String(req.params.itemId) }, "Removed from cart");
  } catch (e) {
    console.error("[cart/DELETE]", e);
    return fail(res, "Server error", 500);
  }
});

/**
 * DELETE /api/customer/cart   — clear entire cart
 */
router.delete("/", async (req, res) => {
  try {
    await db.query(
      "DELETE FROM website_cart_items WHERE customerId = ?",
      [req.customer.id]
    );
    return ok(res, null, "Cart cleared");
  } catch (e) {
    console.error("[cart/clear]", e);
    return fail(res, "Server error", 500);
  }
});

/**
 * POST /api/customer/cart/sync
 * Body: { items: Array<{ itemId, qty, priceSnapshot? }> }
 */
router.post("/sync", async (req, res) => {
  try {
    const customerId = req.customer.id;
    const { items = [] } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return ok(res, { synced: 0 });
    }

    const itemIds = items.map((i) => i.itemId);
    const placeholders = itemIds.map(() => "?").join(",");
    const [validItems] = await db.query(
      `SELECT id, offerPrice FROM items WHERE id IN (${placeholders}) AND isActive = 1`,
      itemIds
    );

    const validMap = new Map(validItems.map((v) => [String(v.id), v]));
    const toInsert = items.filter((i) => validMap.has(String(i.itemId)));

    if (toInsert.length === 0) return ok(res, { synced: 0 });

    const values = toInsert.map((i) => {
      const itemData = validMap.get(String(i.itemId));
      return [
        customerId,
        i.itemId,
        Math.min(Math.max(1, i.qty || 1), 99),
        i.priceSnapshot || itemData?.offerPrice || null,
      ];
    });

    await db.query(
      `INSERT INTO website_cart_items (customerId, itemId, qty, priceSnapshot) VALUES ?
       ON DUPLICATE KEY UPDATE qty = VALUES(qty), priceSnapshot = VALUES(priceSnapshot), updatedAt = NOW()`,
      [values]
    );

    return ok(res, { synced: toInsert.length });
  } catch (e) {
    console.error("[cart/sync]", e);
    return fail(res, "Server error", 500);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// SAVED FOR LATER ROUTES
// ════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/customer/cart/saved
 */
router.get("/saved", async (req, res) => {
  try {
    const items = await fetchCartRows(req.customer.id, "website_saved_for_later");
    return ok(res, items);
  } catch (e) {
    console.error("[cart/saved/GET]", e);
    return fail(res, "Server error", 500);
  }
});

/**
 * POST /api/customer/cart/save-for-later
 * Body: { itemId }
 */
router.post("/save-for-later", async (req, res) => {
  try {
    const customerId = req.customer.id;
    const { itemId } = req.body;
    if (!itemId) return fail(res, "itemId is required");

    const [[cartRow]] = await db.query(
      "SELECT priceSnapshot FROM website_cart_items WHERE customerId = ? AND itemId = ?",
      [customerId, itemId]
    );

    await db.query(
      "DELETE FROM website_cart_items WHERE customerId = ? AND itemId = ?",
      [customerId, itemId]
    );

    await db.query(
      `INSERT INTO website_saved_for_later (customerId, itemId, priceSnapshot)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE savedAt = NOW(), priceSnapshot = VALUES(priceSnapshot)`,
      [customerId, itemId, cartRow?.priceSnapshot || null]
    );

    return ok(res, { itemId: String(itemId) }, "Saved for later");
  } catch (e) {
    console.error("[cart/save-for-later]", e);
    return fail(res, "Server error", 500);
  }
});

/**
 * POST /api/customer/cart/move-to-cart
 * Body: { itemId }
 */
router.post("/move-to-cart", async (req, res) => {
  try {
    const customerId = req.customer.id;
    const { itemId } = req.body;
    if (!itemId) return fail(res, "itemId is required");

    const [[savedRow]] = await db.query(
      "SELECT priceSnapshot FROM website_saved_for_later WHERE customerId = ? AND itemId = ?",
      [customerId, itemId]
    );

    await db.query(
      "DELETE FROM website_saved_for_later WHERE customerId = ? AND itemId = ?",
      [customerId, itemId]
    );

    await db.query(
      `INSERT INTO website_cart_items (customerId, itemId, qty, priceSnapshot)
       VALUES (?, ?, 1, ?)
       ON DUPLICATE KEY UPDATE qty = qty + 1, updatedAt = NOW()`,
      [customerId, itemId, savedRow?.priceSnapshot || null]
    );

    return ok(res, { itemId: String(itemId) }, "Moved to cart");
  } catch (e) {
    console.error("[cart/move-to-cart]", e);
    return fail(res, "Server error", 500);
  }
});

/**
 * DELETE /api/customer/cart/saved/:itemId
 */
router.delete("/saved/:itemId", async (req, res) => {
  try {
    await db.query(
      "DELETE FROM website_saved_for_later WHERE customerId = ? AND itemId = ?",
      [req.customer.id, req.params.itemId]
    );
    return ok(res, { itemId: String(req.params.itemId) }, "Removed from saved");
  } catch (e) {
    console.error("[cart/saved/DELETE]", e);
    return fail(res, "Server error", 500);
  }
});

export default router;
