// routes/customerOrders.js
// Order placement + order history for logged-in website customers.
//
// Pricing is ALWAYS recomputed on the server from the live `items` table —
// the client may send its own totals, but they are only used for logging /
// mismatch detection, never trusted.

import express from "express";
import { db } from "../config/db.js";
import { toAssetUrl, toStoredAssetPath } from "../utils/assetUrl.js";
import { priceItem, gstIncludedIn, getPriceTaxMode } from "../services/pricing.js";
import { findCoupon, couponDiscount } from "../services/coupons.js";
import { requireCustomer } from "../middleware/customerAuth.js";
import { ensureOrderPaymentSchema } from "../services/orderPaymentService.js";
import { STATUS_LABELS, CUSTOMER_CANCELLABLE, cancelOrder, OrderError } from "../services/orderFulfilment.js";
import { notifyOrder, ORDER_ITEM_IMAGE_SQL } from "../services/orderNotifications.js";
import { ensureInvoice, getInvoicePdf, InvoiceError } from "../services/invoice.js";

const router = express.Router();
router.use(requireCustomer);

function ok(res, data, msg = "Success") {
  return res.json({ success: true, message: msg, data });
}
function fail(res, msg, status = 400) {
  return res.status(status).json({ success: false, message: msg });
}


function absoluteImage(value) {
  return toAssetUrl(value);
}

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

// ─── Pricing rules (kept in sync with Website/lib/pricing/order-pricing.ts) ──
//
// • Line prices come ONLY from the Item Master (services/pricing.js), shown
//   GST-inclusive. Nothing the browser sends is trusted for price or name.
// • GST is already inside the price; `taxAmount` = GST contained in the order
//   (for the invoice / breakup), it is NOT added on top.
// • Coupons come from the admin Offers module (services/coupons.js).

const DELIVERY_OPTIONS = {
  free:      { label: "Standard Delivery",  cost: 0 },
  express:   { label: "Express Delivery",   cost: 79 },
  scheduled: { label: "Scheduled Delivery", cost: 49 },
};

const PAYMENT_METHODS = new Set(["upi", "card", "netbanking", "wallet", "cod"]);

// Statuses a customer may still cancel from (before the order is packed).

/**
 * Price validated lines. `lines` carry GST-inclusive unitPrice/originalPrice
 * and the item GST rate. Returns totals + coupon info.
 */
async function priceOrder({ lines, couponCode, deliveryType, paymentMethod }) {
  const subtotal = round2(lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0));
  const originalTotal = round2(
    lines.reduce((sum, l) => sum + Math.max(l.originalPrice, l.unitPrice) * l.qty, 0)
  );
  const productDiscount = round2(Math.max(0, originalTotal - subtotal));

  let couponDiscountValue = 0;
  let appliedCoupon = null;
  let couponError = null;
  if (couponCode) {
    const coupon = await findCoupon(couponCode);
    const { discount, reason } = couponDiscount(coupon, subtotal);
    if (discount > 0) {
      couponDiscountValue = discount;
      appliedCoupon = coupon;
    } else {
      couponError = reason;
    }
  }

  const platformDiscount = subtotal > 50000 ? 500 : 0;

  const option = DELIVERY_OPTIONS[deliveryType] || DELIVERY_OPTIONS.free;
  const deliveryCharge =
    deliveryType === "free" || !DELIVERY_OPTIONS[deliveryType]
      ? subtotal >= 999
        ? 0
        : 99
      : option.cost;

  const codFee = paymentMethod === "cod" && subtotal > 0 && subtotal < 1000 ? 29 : 0;

  const payableGoods = Math.max(0, subtotal - couponDiscountValue - platformDiscount);

  // GST contained in the goods value, reduced in proportion to order discounts.
  const includedGst = lines.reduce((sum, l) => sum + gstIncludedIn(l.unitPrice * l.qty, l.gst), 0);
  const discountFactor = subtotal > 0 ? payableGoods / subtotal : 0;
  const taxAmount = round2(includedGst * discountFactor);

  const totalAmount = round2(Math.max(0, payableGoods + deliveryCharge + codFee));

  return {
    subtotal,
    originalTotal,
    productDiscount,
    couponDiscount: couponDiscountValue,
    couponCode: appliedCoupon ? appliedCoupon.code : null,
    couponLabel: appliedCoupon ? appliedCoupon.label : null,
    couponError,
    platformDiscount,
    deliveryCharge,
    codFee,
    taxAmount,
    taxableAmount: round2(Math.max(0, payableGoods - taxAmount)),
    totalAmount,
    deliveryLabel: option.label,
    priceTaxMode: getPriceTaxMode(),
  };
}

/**
 * Validate requested cart lines against the live Item Master.
 * Every line must be an active item with a price and enough stock.
 * Returns { lines, problems } — problems are customer-readable strings.
 */
async function buildOrderLines(items) {
  const problems = [];
  const requested = [];
  for (const entry of Array.isArray(items) ? items : []) {
    const itemId = entry?.itemId ?? entry?.id;
    if (itemId == null || !/^\d+$/.test(String(itemId))) {
      problems.push(`${entry?.itemName || "A product"} is not available`);
      continue;
    }
    requested.push({
      itemId: String(itemId),
      qty: Math.max(1, Math.min(99, Math.floor(Number(entry.qty) || 1))),
      colorName: entry.colorName ? String(entry.colorName).slice(0, 100) : null,
      primaryImage: entry.primaryImage || null,
      itemName: entry.itemName || null,
    });
  }

  const ids = [...new Set(requested.map((r) => r.itemId))];
  const rowMap = new Map();
  if (ids.length) {
    const [rows] = await db.query(
      `SELECT
         i.id, i.itemName, i.variant, i.gst, i.isActive, i.openingStock,
         i.offerPrice, i.nlc,
         b.name   AS brandName,
         cat.name AS categoryName,
         (SELECT imageUrl FROM item_images WHERE itemId = i.id ORDER BY sortOrder ASC LIMIT 1) AS primaryImage
       FROM items i
       LEFT JOIN item_groups ig ON ig.id = i.itemGroupId
       LEFT JOIN categories cat ON cat.id = ig.categoryId
       LEFT JOIN brands b       ON b.id  = i.brandId
       WHERE i.id IN (${ids.map(() => "?").join(",")})`,
      ids
    );
    for (const row of rows) rowMap.set(String(row.id), row);
  }

  // Same item may appear on several lines (e.g. two colours) — check total qty.
  const qtyByItem = new Map();
  for (const r of requested) qtyByItem.set(r.itemId, (qtyByItem.get(r.itemId) || 0) + r.qty);

  const lines = [];
  const stockChecked = new Set();
  for (const r of requested) {
    const row = rowMap.get(r.itemId);
    const name = row?.itemName
      ? `${row.itemName}${row.variant ? ` (${row.variant})` : ""}`
      : r.itemName || `Item #${r.itemId}`;

    if (!row || !Number(row.isActive)) {
      problems.push(`${name} is no longer available`);
      continue;
    }
    const priced = priceItem(row);
    if (priced.sellingPrice <= 0) {
      problems.push(`${name} is not available for online purchase right now`);
      continue;
    }
    if (!stockChecked.has(r.itemId)) {
      stockChecked.add(r.itemId);
      const stock = Math.floor(Number(row.openingStock) || 0);
      const wanted = qtyByItem.get(r.itemId);
      if (stock <= 0) {
        problems.push(`${name} is out of stock`);
        continue;
      }
      if (wanted > stock) {
        problems.push(`Only ${stock} unit(s) of ${name} left in stock`);
        continue;
      }
    }

    // Keep the colour image the customer saw only if it is one of our uploads.
    const clientImage = toStoredAssetPath(r.primaryImage);
    const primaryImage =
      clientImage && String(clientImage).startsWith("/uploads/") ? clientImage : row.primaryImage || null;

    lines.push({
      itemId: row.id,
      itemName: row.itemName,
      brandName: row.brandName || null,
      categoryName: row.categoryName || null,
      variant: row.variant || null,
      colorName: r.colorName,
      primaryImage,
      qty: r.qty,
      unitPrice: priced.sellingPrice,
      originalPrice: priced.mrp > priced.sellingPrice ? priced.mrp : priced.sellingPrice,
      gst: priced.gstRate,
    });
  }

  return { lines, problems };
}

/** Same customer + same basket + same total within 2 minutes = double submit. */
async function findRecentDuplicate(customerId, lines, totalAmount) {
  const [recent] = await db.query(
    `SELECT id FROM website_orders
      WHERE customerId = ? AND totalAmount = ?
        AND status IN ('pending_payment', 'processing')
        AND placedAt >= (NOW() - INTERVAL 2 MINUTE)
      ORDER BY id DESC LIMIT 5`,
    [customerId, totalAmount]
  );
  if (!recent.length) return null;

  const signature = (arr) =>
    arr
      .map((l) => `${l.itemId}:${l.qty}:${(l.colorName || "").toLowerCase()}`)
      .sort()
      .join("|");
  const wanted = signature(lines);

  for (const candidate of recent) {
    const [rows] = await db.query(
      "SELECT itemId, qty, colorName FROM website_order_items WHERE orderId = ?",
      [candidate.id]
    );
    if (signature(rows) === wanted) return candidate.id;
  }
  return null;
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
          status ENUM('pending_payment','payment_failed','processing','confirmed','packed','shipped','out_for_delivery','delivered','cancelled','returned') NOT NULL DEFAULT 'processing',
          statusLabel VARCHAR(80) NOT NULL DEFAULT 'Order Placed',
          paymentMethod VARCHAR(30) NOT NULL DEFAULT 'cod',
          paymentDetail VARCHAR(150) DEFAULT NULL,
          paymentStatus ENUM('pending','paid','failed','refunded') NOT NULL DEFAULT 'pending',
          deliveryType VARCHAR(30) NOT NULL DEFAULT 'free',
          deliveryLabel VARCHAR(80) DEFAULT NULL,
          paymentProvider VARCHAR(30) DEFAULT NULL,
          providerOrderId VARCHAR(80) DEFAULT NULL,
          providerPaymentId VARCHAR(80) DEFAULT NULL,
          providerSignature VARCHAR(255) DEFAULT NULL,
          paymentError VARCHAR(255) DEFAULT NULL,
          paidAt TIMESTAMP NULL DEFAULT NULL,
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
      await ensureOrderPaymentSchema();
    })().catch((e) => {
      schemaReady = null;
      throw e;
    });
  }
  return schemaReady;
}

// ─── Row → API shape ─────────────────────────────────────────────────────────


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
    paymentProvider: order.paymentProvider ?? null,
    providerOrderId: order.providerOrderId ?? null,
    providerPaymentId: order.providerPaymentId ?? null,
    paymentError: order.paymentError ?? null,
    paidAt: order.paidAt ?? null,
    requiresPayment:
      order.paymentMethod !== "cod" && order.paymentStatus !== "paid" && order.status !== "cancelled",
    canCancel: CUSTOMER_CANCELLABLE.has(order.status),
    cancelReason: order.cancelReason ?? null,
    confirmedAt: order.confirmedAt ?? null,
    packedAt: order.packedAt ?? null,
    shippedAt: order.shippedAt ?? null,
    deliveredAt: order.deliveredAt ?? null,
    returnedAt: order.returnedAt ?? null,
    courierName: order.courierName ?? null,
    trackingNumber: order.trackingNumber ?? null,
    trackingUrl: order.trackingUrl ?? null,
    invoiceNumber: order.invoiceNumber ?? null,
    hasInvoice: Boolean(order.invoiceNumber) || INVOICEABLE.has(order.status),
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
    `SELECT oi.*, ${ORDER_ITEM_IMAGE_SQL} AS primaryImage
       FROM website_order_items oi WHERE oi.orderId IN (${ids.map(() => "?").join(",")}) ORDER BY oi.id ASC`,
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
 * POST /api/customer/orders/quote
 * Server-priced totals for the checkout page (same maths as placing the order).
 * Body: { items, couponCode?, deliveryType?, paymentMethod? }
 */
router.post("/quote", async (req, res) => {
  try {
    const { items = [], couponCode = null, deliveryType = "free", paymentMethod = "cod" } = req.body || {};
    const { lines, problems } = await buildOrderLines(items);
    const totals = await priceOrder({ lines, couponCode, deliveryType, paymentMethod });
    return ok(res, {
      ...totals,
      problems,
      lines: lines.map((l) => ({
        itemId: String(l.itemId),
        qty: l.qty,
        unitPrice: l.unitPrice,
        originalPrice: l.originalPrice,
        gst: l.gst,
        lineTotal: round2(l.unitPrice * l.qty),
      })),
    });
  } catch (e) {
    console.error("[orders/quote]", e);
    return fail(res, "Could not calculate the order total", 500);
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

    // ── Validate every line against the live Item Master ─────────────────
    const { lines, problems } = await buildOrderLines(items);
    if (problems.length) {
      // Don't silently drop products — let the customer review the cart.
      return res.status(409).json({
        success: false,
        message: `Please review your cart: ${problems.join("; ")}`,
        data: { problems },
      });
    }
    if (lines.length === 0) return fail(res, "No valid products in this order");

    const totals = await priceOrder({
      lines,
      couponCode,
      deliveryType,
      paymentMethod,
    });
    if (couponCode && totals.couponError) {
      return fail(res, totals.couponError);
    }

    // ── Double-submit guard (double click / network retry) ─────────────────
    const duplicateId = await findRecentDuplicate(customerId, lines, totals.totalAmount);
    if (duplicateId) {
      const [existing] = await loadOrders(customerId, { orderId: duplicateId, limit: 1 });
      return ok(res, { ...existing, unavailable: [], duplicate: true }, "Order already placed");
    }
    const unavailable = [];

    // ── Persist ───────────────────────────────────────────────────────────
    connection = await db.getConnection();
    await connection.beginTransaction();

    // Card / UPI / netbanking / wallet orders are only "placed" once the money
    // lands. COD is placed immediately.
    const isCod = paymentMethod === "cod";
    const initialStatus = isCod ? "processing" : "pending_payment";
    const initialStatusLabel = isCod ? "Order Placed" : "Awaiting Payment";

    const [result] = await connection.query(
      `INSERT INTO website_orders
         (orderNumber, customerId, status, statusLabel,
          paymentMethod, paymentDetail, paymentStatus,
          deliveryType, deliveryLabel, couponCode,
          subtotal, productDiscount, couponDiscount, platformDiscount,
          deliveryCharge, codFee, taxAmount, totalAmount,
          addressId, shipType, shipName, shipPhone, shipLine1, shipLine2,
          shipCity, shipState, shipPinCode, notes)
       VALUES (?, ?, ?, ?,
               ?, ?, ?,
               ?, ?, ?,
               ?, ?, ?, ?,
               ?, ?, ?, ?,
               ?, ?, ?, ?, ?, ?,
               ?, ?, ?, ?)`,
      [
        "",
        customerId,
        initialStatus,
        initialStatusLabel,
        paymentMethod,
        paymentDetail,
        "pending",
        deliveryType,
        totals.deliveryLabel,
        totals.couponCode,
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

    // Online payments clear the cart in markOrderPaid() instead, so an
    // abandoned payment doesn't lose the customer's basket.
    if (clearCart !== false && isCod) {
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
    // COD orders are placed right away; online orders email after payment.
    if (isCod) notifyOrder(orderId, "placed");

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

const INVOICEABLE = new Set(["shipped", "out_for_delivery", "delivered", "returned"]);

/** GET /api/customer/orders/:id/invoice — GST invoice PDF (available once shipped). */
router.get("/:id/invoice", async (req, res) => {
  try {
    const [[order]] = await db.query(
      "SELECT id, status, invoiceNumber FROM website_orders WHERE id = ? AND customerId = ?",
      [req.params.id, req.customer.id]
    );
    if (!order) return fail(res, "Order not found", 404);
    if (!order.invoiceNumber) {
      if (!INVOICEABLE.has(order.status)) return fail(res, "Your invoice will be available once the order is shipped.", 409);
      await ensureInvoice(order.id);
    }
    const { pdf, filename } = await getInvoicePdf(order.id);
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    });
    return res.send(pdf);
  } catch (e) {
    if (e instanceof InvoiceError) return fail(res, e.message, e.status);
    console.error("[orders/invoice]", e);
    return fail(res, "Could not generate the invoice", 500);
  }
});

/**
 * POST /api/customer/orders/:id/cancel
 * Customers can cancel only before the order is packed. A paid online order
 * is refunded in full through Razorpay (the webhook then confirms it).
 */
router.post("/:id/cancel", async (req, res) => {
  try {
    await ensureSchema();
    const reason = String(req.body?.reason || "").trim().slice(0, 255) || "Cancelled by customer";
    const { refundNote } = await cancelOrder({
      orderId: req.params.id,
      customerId: req.customer.id,
      reason,
      actor: { type: "customer", id: req.customer.id, name: "Customer" },
    });
    const [updated] = await loadOrders(req.customer.id, { orderId: req.params.id, limit: 1 });
    return ok(res, updated, refundNote ? `Order cancelled. ${refundNote}` : "Order cancelled");
  } catch (e) {
    if (e instanceof OrderError) return fail(res, e.message, e.status);
    console.error("[orders/cancel]", e);
    return fail(res, "Server error", 500);
  }
});

export default router;
