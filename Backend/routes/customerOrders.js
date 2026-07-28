// routes/customerOrders.js
// Order placement + order history for logged-in website customers.
//
// Pricing is ALWAYS recomputed on the server from the live `items` table —
// the client may send its own totals, but they are only used for logging /
// mismatch detection, never trusted.

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

function absoluteImage(value) {
  if (!value) return null;
  if (String(value).startsWith("http")) return value;
  return `${baseUrl()}/${String(value).replace(/^\/+/, "")}`;
}

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

// ─── Pricing rules (kept in sync with Website/lib/pricing) ────────────────────

export const COUPONS = {
  MOTAB10:   { pct: 10, max: 3000, label: "10% off up to Rs 3,000" },
  HDFC5:     { pct: 5,  max: 2000, label: "5% off up to Rs 2,000 (HDFC)" },
  NEWUSER15: { pct: 15, max: 2000, label: "15% off up to Rs 2,000" },
  SAVE500:   { flat: 500, label: "Flat Rs 500 off" },
};

const DELIVERY_OPTIONS = {
  free:      { label: "Standard Delivery",  cost: 0 },
  express:   { label: "Express Delivery",   cost: 79 },
  scheduled: { label: "Scheduled Delivery", cost: 49 },
};

const PAYMENT_METHODS = new Set(["upi", "card", "netbanking", "wallet", "cod"]);

function couponDiscountFor(code, subtotal) {
  const coupon = COUPONS[String(code || "").toUpperCase()];
  if (!coupon) return 0;
  if (coupon.flat) return Math.min(coupon.flat, subtotal);
  return Math.min(Math.floor((subtotal * coupon.pct) / 100), coupon.max);
}

function priceOrder({ lines, couponCode, deliveryType, paymentMethod }) {
  const subtotal = round2(lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0));
  const originalTotal = round2(
    lines.reduce((sum, l) => sum + Math.max(l.originalPrice, l.unitPrice) * l.qty, 0)
  );
  const productDiscount = round2(Math.max(0, originalTotal - subtotal));

  const couponDiscount = round2(couponDiscountFor(couponCode, subtotal));
  const platformDiscount = subtotal > 50000 ? 500 : 0;

  const option = DELIVERY_OPTIONS[deliveryType] || DELIVERY_OPTIONS.free;
  const deliveryCharge =
    deliveryType === "free" || !DELIVERY_OPTIONS[deliveryType]
      ? subtotal >= 999
        ? 0
        : 99
      : option.cost;

  const codFee = paymentMethod === "cod" && subtotal > 0 && subtotal < 1000 ? 29 : 0;

  const taxable = Math.max(0, subtotal - couponDiscount - platformDiscount);
  const taxAmount = Math.round(taxable * 0.018);
  const totalAmount = round2(
    Math.max(0, taxable + deliveryCharge + codFee + taxAmount)
  );

  return {
    subtotal,
    productDiscount,
    couponDiscount,
    platformDiscount,
    deliveryCharge,
    codFee,
    taxAmount,
    totalAmount,
    deliveryLabel: option.label,
  };
}

// ─── Schema bootstrap (idempotent) ───────────────────────────────────────────

let schemaReady = null;

async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS website_orders (
          id BIGINT(20) NOT NULL AUTO_INCREMENT,
          orderNumber VARCHAR(40) NOT NULL DEFAULT '',
          customerId BIGINT(20) NOT NULL,
          companyId BIGINT(11) DEFAULT NULL,
          status ENUM('processing','shipped','delivered','cancelled','returned') NOT NULL DEFAULT 'processing',
          statusLabel VARCHAR(80) NOT NULL DEFAULT 'Order Placed',
          paymentMethod VARCHAR(30) NOT NULL DEFAULT 'cod',
          paymentDetail VARCHAR(150) DEFAULT NULL,
          paymentStatus ENUM('pending','paid','failed','refunded') NOT NULL DEFAULT 'pending',
          deliveryType VARCHAR(30) NOT NULL DEFAULT 'free',
          deliveryLabel VARCHAR(80) DEFAULT NULL,
          couponCode VARCHAR(40) DEFAULT NULL,
          subtotal DECIMAL(12,2) NOT NULL DEFAULT 0.00,
          productDiscount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
          couponDiscount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
          platformDiscount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
          deliveryCharge DECIMAL(12,2) NOT NULL DEFAULT 0.00,
          codFee DECIMAL(12,2) NOT NULL DEFAULT 0.00,
          taxAmount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
          totalAmount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
          addressId BIGINT(20) DEFAULT NULL,
          shipType VARCHAR(20) DEFAULT 'home',
          shipName VARCHAR(150) DEFAULT NULL,
          shipPhone VARCHAR(20) DEFAULT NULL,
          shipLine1 VARCHAR(255) DEFAULT NULL,
          shipLine2 VARCHAR(255) DEFAULT NULL,
          shipCity VARCHAR(100) DEFAULT NULL,
          shipState VARCHAR(100) DEFAULT NULL,
          shipPinCode VARCHAR(10) DEFAULT NULL,
          notes TEXT DEFAULT NULL,
          placedAt TIMESTAMP NOT NULL DEFAULT current_timestamp(),
          updatedAt TIMESTAMP NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
          cancelledAt TIMESTAMP NULL DEFAULT NULL,
          PRIMARY KEY (id),
          UNIQUE KEY uq_website_orders_number (orderNumber),
          KEY idx_website_orders_customer (customerId, placedAt)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS website_order_items (
          id BIGINT(20) NOT NULL AUTO_INCREMENT,
          orderId BIGINT(20) NOT NULL,
          itemId BIGINT(11) DEFAULT NULL,
          itemName VARCHAR(255) NOT NULL,
          brandName VARCHAR(150) DEFAULT NULL,
          categoryName VARCHAR(150) DEFAULT NULL,
          variant VARCHAR(150) DEFAULT NULL,
          colorName VARCHAR(100) DEFAULT NULL,
          primaryImage VARCHAR(500) DEFAULT NULL,
          qty INT(11) NOT NULL DEFAULT 1,
          unitPrice DECIMAL(12,2) NOT NULL DEFAULT 0.00,
          originalPrice DECIMAL(12,2) NOT NULL DEFAULT 0.00,
          gst DECIMAL(5,2) NOT NULL DEFAULT 0.00,
          lineTotal DECIMAL(12,2) NOT NULL DEFAULT 0.00,
          PRIMARY KEY (id),
          KEY idx_website_order_items_order (orderId)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    })().catch((e) => {
      schemaReady = null;
      throw e;
    });
  }
  return schemaReady;
}

// ─── Row → API shape ─────────────────────────────────────────────────────────

const STATUS_LABELS = {
  processing: "Order Placed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
};

function mapOrder(order, items) {
  return {
    id: String(order.id),
    orderNumber: order.orderNumber,
    status: order.status,
    statusLabel: order.statusLabel || STATUS_LABELS[order.status] || "Order Placed",
    placedAt: order.placedAt,
    updatedAt: order.updatedAt,
    cancelledAt: order.cancelledAt,
    paymentMethod: order.paymentMethod,
    paymentDetail: order.paymentDetail,
    paymentStatus: order.paymentStatus,
    deliveryType: order.deliveryType,
    deliveryLabel: order.deliveryLabel,
    couponCode: order.couponCode,
    subtotal: Number(order.subtotal) || 0,
    productDiscount: Number(order.productDiscount) || 0,
    couponDiscount: Number(order.couponDiscount) || 0,
    platformDiscount: Number(order.platformDiscount) || 0,
    deliveryCharge: Number(order.deliveryCharge) || 0,
    codFee: Number(order.codFee) || 0,
    taxAmount: Number(order.taxAmount) || 0,
    totalAmount: Number(order.totalAmount) || 0,
    address: {
      id: order.addressId ? String(order.addressId) : null,
      type: order.shipType || "home",
      name: order.shipName || "",
      phone: order.shipPhone || "",
      line1: order.shipLine1 || "",
      line2: order.shipLine2 || "",
      city: order.shipCity || "",
      state: order.shipState || "",
      pinCode: order.shipPinCode || "",
    },
    items: (items || []).map((row) => ({
      id: String(row.id),
      itemId: row.itemId ? String(row.itemId) : null,
      itemName: row.itemName,
      brandName: row.brandName || null,
      categoryName: row.categoryName || null,
      variant: row.variant || null,
      colorName: row.colorName || null,
      primaryImage: absoluteImage(row.primaryImage),
      qty: Number(row.qty) || 1,
      unitPrice: Number(row.unitPrice) || 0,
      originalPrice: Number(row.originalPrice) || 0,
      gst: Number(row.gst) || 0,
      lineTotal: Number(row.lineTotal) || 0,
    })),
  };
}

async function loadOrders(customerId, { orderId, limit = 50 } = {}) {
  const params = [customerId];
  let where = "o.customerId = ?";
  if (orderId) {
    where += " AND o.id = ?";
    params.push(orderId);
  }

  const [orders] = await db.query(
    `SELECT * FROM website_orders o WHERE ${where} ORDER BY o.placedAt DESC LIMIT ${Number(limit) || 50}`,
    params
  );
  if (orders.length === 0) return [];

  const ids = orders.map((o) => o.id);
  const [items] = await db.query(
    `SELECT * FROM website_order_items WHERE orderId IN (${ids.map(() => "?").join(",")}) ORDER BY id ASC`,
    ids
  );

  const grouped = new Map();
  for (const row of items) {
    const key = String(row.orderId);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }

  return orders.map((order) => mapOrder(order, grouped.get(String(order.id)) || []));
}

// ════════════════════════════════════════════════════════════════════════════
// ROUTES
// ════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/customer/orders
 */
router.get("/", async (req, res) => {
  try {
    await ensureSchema();
    const orders = await loadOrders(req.customer.id, { limit: req.query.limit });
    return ok(res, orders);
  } catch (e) {
    console.error("[orders/GET]", e);
    return fail(res, "Server error", 500);
  }
});

/**
 * GET /api/customer/orders/:id
 */
router.get("/:id", async (req, res) => {
  try {
    await ensureSchema();
    const [order] = await loadOrders(req.customer.id, { orderId: req.params.id, limit: 1 });
    if (!order) return fail(res, "Order not found", 404);
    return ok(res, order);
  } catch (e) {
    console.error("[orders/GET/:id]", e);
    return fail(res, "Server error", 500);
  }
});

/**
 * POST /api/customer/orders
 * Body: {
 *   items: [{ itemId, qty, colorName?, variant?, unitPrice?, originalPrice?, itemName?, brandName?, primaryImage? }],
 *   addressId?, address?: { type, name, phone, line1, line2, city, state, pinCode },
 *   paymentMethod: "upi" | "card" | "netbanking" | "wallet" | "cod",
 *   paymentDetail?: string,
 *   deliveryType?: "free" | "express" | "scheduled",
 *   couponCode?: string,
 *   notes?: string,
 *   clearCart?: boolean (default true)
 * }
 */
router.post("/", async (req, res) => {
  const customerId = req.customer.id;
  let connection;

  try {
    await ensureSchema();

    const {
      items = [],
      addressId,
      address,
      paymentMethod = "cod",
      paymentDetail = null,
      deliveryType = "free",
      couponCode = null,
      notes = null,
      clearCart = true,
    } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return fail(res, "Your cart is empty");
    }
    if (!PAYMENT_METHODS.has(String(paymentMethod))) {
      return fail(res, "Unsupported payment method");
    }

    // ── Resolve delivery address ──────────────────────────────────────────
    let shipping = null;

    if (addressId) {
      const [[row]] = await db.query(
        "SELECT * FROM customer_addresses WHERE id = ? AND customerId = ?",
        [addressId, customerId]
      );
      if (row) {
        shipping = {
          id: row.id,
          type: row.type,
          name: row.name,
          phone: row.phone,
          line1: row.line1,
          line2: row.line2,
          city: row.city,
          state: row.state,
          pinCode: row.pinCode,
        };
      }
    }

    // Fall back to the address snapshot the client sent (covers addresses that
    // only exist locally, e.g. saved while the API was unreachable).
    if (!shipping && address && address.name && address.phone && address.line1) {
      shipping = {
        id: null,
        type: address.type || "home",
        name: address.name,
        phone: address.phone,
        line1: address.line1,
        line2: address.line2 || null,
        city: address.city || null,
        state: address.state || null,
        pinCode: address.pinCode || null,
      };
    }

    if (!shipping) return fail(res, "A delivery address is required");

    // ── Re-price every line from the live items table ──────────────────────
    const requestedIds = [
      ...new Set(items.map((i) => i.itemId ?? i.id).filter((id) => id != null).map(String)),
    ];

    let itemRows = [];
    if (requestedIds.length > 0) {
      const [rows] = await db.query(
        `SELECT
           i.id, i.itemName, i.variant, i.gst, i.isActive, i.companyId,
           i.offerPrice AS itemOfferPrice, i.nlc AS itemNlc,
           b.name   AS brandName,
           cat.name AS categoryName,
           (SELECT imageUrl FROM item_images WHERE itemId = i.id ORDER BY sortOrder ASC LIMIT 1) AS primaryImage
         FROM items i
         LEFT JOIN item_groups ig ON ig.id = i.itemGroupId
         LEFT JOIN categories cat ON cat.id = ig.categoryId
         LEFT JOIN brands b       ON b.id  = i.brandId
         WHERE i.id IN (${requestedIds.map(() => "?").join(",")})`,
        requestedIds
      );
      itemRows = rows;
    }

    const itemMap = new Map(itemRows.map((row) => [String(row.id), row]));

    const lines = [];
    const unavailable = [];

    for (const entry of items) {
      const itemId = entry.itemId ?? entry.id;
      const qty = Math.max(1, Math.min(99, Number(entry.qty) || 1));
      const row = itemId != null ? itemMap.get(String(itemId)) : null;

      if (row && !row.isActive) {
        unavailable.push(row.itemName || `Item #${itemId}`);
        continue;
      }

      const dbOffer = row ? Number(row.itemOfferPrice) || 0 : 0;
      const dbNlc = row ? Number(row.itemNlc) || 0 : 0;
      const clientOffer = Number(entry.unitPrice ?? entry.offerPrice) || 0;
      const clientOriginal = Number(entry.originalPrice) || 0;

      const unitPrice = round2(dbOffer || clientOffer);
      const originalPrice = round2(
        Math.max(dbNlc > unitPrice ? dbNlc : 0, clientOriginal, unitPrice)
      );

      if (unitPrice <= 0) {
        unavailable.push(row?.itemName || entry.itemName || `Item #${itemId}`);
        continue;
      }

      lines.push({
        itemId: row ? row.id : null,
        itemName: row?.itemName || entry.itemName || "Product",
        brandName: row?.brandName || entry.brandName || null,
        categoryName: row?.categoryName || entry.categoryName || null,
        variant: row?.variant || entry.variant || null,
        colorName: entry.colorName || null,
        primaryImage: row?.primaryImage || entry.primaryImage || null,
        qty,
        unitPrice,
        originalPrice,
        gst: row ? Number(row.gst) || 0 : Number(entry.gst) || 0,
        companyId: row?.companyId ?? null,
      });
    }

    if (lines.length === 0) {
      return fail(
        res,
        unavailable.length
          ? `These products are no longer available: ${unavailable.join(", ")}`
          : "No valid products in this order"
      );
    }

    const totals = priceOrder({
      lines,
      couponCode,
      deliveryType,
      paymentMethod,
    });

    const companyId = lines.find((l) => l.companyId != null)?.companyId ?? null;

    // ── Persist ───────────────────────────────────────────────────────────
    connection = await db.getConnection();
    await connection.beginTransaction();

    const [result] = await connection.query(
      `INSERT INTO website_orders
         (orderNumber, customerId, companyId, status, statusLabel,
          paymentMethod, paymentDetail, paymentStatus,
          deliveryType, deliveryLabel, couponCode,
          subtotal, productDiscount, couponDiscount, platformDiscount,
          deliveryCharge, codFee, taxAmount, totalAmount,
          addressId, shipType, shipName, shipPhone, shipLine1, shipLine2,
          shipCity, shipState, shipPinCode, notes)
       VALUES (?, ?, ?, 'processing', 'Order Placed',
               ?, ?, ?,
               ?, ?, ?,
               ?, ?, ?, ?,
               ?, ?, ?, ?,
               ?, ?, ?, ?, ?, ?,
               ?, ?, ?, ?)`,
      [
        "",
        customerId,
        companyId,
        paymentMethod,
        paymentDetail,
        paymentMethod === "cod" ? "pending" : "paid",
        deliveryType,
        totals.deliveryLabel,
        couponCode ? String(couponCode).toUpperCase() : null,
        totals.subtotal,
        totals.productDiscount,
        totals.couponDiscount,
        totals.platformDiscount,
        totals.deliveryCharge,
        totals.codFee,
        totals.taxAmount,
        totals.totalAmount,
        shipping.id,
        shipping.type,
        shipping.name,
        shipping.phone,
        shipping.line1,
        shipping.line2,
        shipping.city,
        shipping.state,
        shipping.pinCode,
        notes,
      ]
    );

    const orderId = result.insertId;
    const orderNumber = `MB${new Date().getFullYear()}${String(orderId).padStart(6, "0")}`;

    await connection.query("UPDATE website_orders SET orderNumber = ? WHERE id = ?", [
      orderNumber,
      orderId,
    ]);

    await connection.query(
      `INSERT INTO website_order_items
         (orderId, itemId, itemName, brandName, categoryName, variant, colorName,
          primaryImage, qty, unitPrice, originalPrice, gst, lineTotal)
       VALUES ?`,
      [
        lines.map((l) => [
          orderId,
          l.itemId,
          l.itemName,
          l.brandName,
          l.categoryName,
          l.variant,
          l.colorName,
          l.primaryImage,
          l.qty,
          l.unitPrice,
          l.originalPrice,
          l.gst,
          round2(l.unitPrice * l.qty),
        ]),
      ]
    );

    if (clearCart !== false) {
      const orderedIds = lines.map((l) => l.itemId).filter((id) => id != null);
      if (orderedIds.length > 0) {
        await connection.query(
          `DELETE FROM website_cart_items
           WHERE customerId = ? AND itemId IN (${orderedIds.map(() => "?").join(",")})`,
          [customerId, ...orderedIds]
        );
      }
    }

    await connection.commit();
    connection.release();
    connection = null;

    const [order] = await loadOrders(customerId, { orderId, limit: 1 });

    return ok(
      res,
      { ...order, unavailable },
      unavailable.length
        ? `Order placed. Some products were skipped: ${unavailable.join(", ")}`
        : "Order placed successfully"
    );
  } catch (e) {
    if (connection) {
      try {
        await connection.rollback();
      } catch {
        /* ignore */
      }
      connection.release();
    }
    console.error("[orders/POST]", e);
    return fail(res, "Could not place the order. Please try again.", 500);
  }
});

/**
 * POST /api/customer/orders/:id/cancel
 */
router.post("/:id/cancel", async (req, res) => {
  try {
    await ensureSchema();

    const [[order]] = await db.query(
      "SELECT id, status FROM website_orders WHERE id = ? AND customerId = ?",
      [req.params.id, req.customer.id]
    );
    if (!order) return fail(res, "Order not found", 404);
    if (order.status === "cancelled") return fail(res, "Order is already cancelled");
    if (order.status === "delivered") return fail(res, "Delivered orders cannot be cancelled");

    await db.query(
      `UPDATE website_orders
         SET status = 'cancelled', statusLabel = 'Cancelled', cancelledAt = NOW()
       WHERE id = ? AND customerId = ?`,
      [req.params.id, req.customer.id]
    );

    const [updated] = await loadOrders(req.customer.id, { orderId: req.params.id, limit: 1 });
    return ok(res, updated, "Order cancelled");
  } catch (e) {
    console.error("[orders/cancel]", e);
    return fail(res, "Server error", 500);
  }
});

export default router;
