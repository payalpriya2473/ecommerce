// routes/adminOrders.js
// Admin "Online Orders" — list, view and process website orders.
// Mounted at /api/admin/orders. Business rules live in services/orderFulfilment.js.

import express from "express";
import { db } from "../config/db.js";
import { authenticateToken } from "../middleware/auth.js";
import { checkPermission } from "../middleware/permissionMiddleware.js";
import { toAssetUrl } from "../utils/assetUrl.js";
import {
  STATUS_LABELS,
  ORDER_FLOW,
  OrderError,
  isPaidOnline,
  changeOrderStatus,
  cancelOrder,
  refundOrder,
  updateShipping,
  loadHistory,
} from "../services/orderFulfilment.js";
import {
  ORDER_ITEM_IMAGE_SQL,
  CUSTOMER_EVENTS,
  listNotifications,
  sendOrderEmails,
} from "../services/orderNotifications.js";
import { ensureInvoice, getInvoicePdf, InvoiceError } from "../services/invoice.js";

const router = express.Router();

router.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
router.use(authenticateToken);

const canView = checkPermission("online_orders", "view");
const canEdit = checkPermission("online_orders", "edit");

const ok = (res, data, message = "Success", extra = {}) => res.json({ success: true, message, data, ...extra });
const fail = (res, message, status = 400, extra = {}) => res.status(status).json({ success: false, message, ...extra });

function handleError(res, e, tag) {
  if (e instanceof OrderError) return fail(res, e.message, e.status, e.extra);
  if (e instanceof InvoiceError) return fail(res, e.message, e.status);
  if (e?.code === "ER_BAD_FIELD_ERROR" || e?.code === "ER_NO_SUCH_TABLE") {
    console.error(`[admin/orders] ${tag}:`, e.message);
    return fail(res, "Order tables are not up to date. Run online_orders_queries.sql in phpMyAdmin.", 500);
  }
  console.error(`[admin/orders] ${tag}:`, e);
  return fail(res, "Server error", 500);
}

function actorOf(req) {
  return {
    type: "admin",
    id: req.user?.userId ?? req.user?.id ?? null,
    name: req.user?.email || req.user?.name || "Admin",
  };
}

const num = (v) => Number(v) || 0;

function mapAdminOrder(o) {
  return {
    id: String(o.id),
    orderNumber: o.orderNumber,
    status: o.status,
    statusLabel: o.statusLabel || STATUS_LABELS[o.status] || o.status,
    nextStatuses: ORDER_FLOW[o.status] || [],
    placedAt: o.placedAt,
    updatedAt: o.updatedAt,
    paymentMethod: o.paymentMethod,
    paymentDetail: o.paymentDetail,
    paymentStatus: o.paymentStatus,
    paymentProvider: o.paymentProvider,
    providerOrderId: o.providerOrderId,
    providerPaymentId: o.providerPaymentId,
    paymentError: o.paymentError,
    paidAt: o.paidAt,
    canRefund: ["cancelled", "returned"].includes(o.status) && o.paymentStatus === "paid",
    refundMode: isPaidOnline(o) ? "razorpay" : "manual",
    invoiceNumber: o.invoiceNumber ?? null,
    invoiceDate: o.invoiceDate ?? null,
    customerHasEmail: Boolean(o.customerEmail || o.accountEmail),
    deliveryType: o.deliveryType,
    deliveryLabel: o.deliveryLabel,
    couponCode: o.couponCode,
    subtotal: num(o.subtotal),
    productDiscount: num(o.productDiscount),
    couponDiscount: num(o.couponDiscount),
    platformDiscount: num(o.platformDiscount),
    deliveryCharge: num(o.deliveryCharge),
    codFee: num(o.codFee),
    taxAmount: num(o.taxAmount),
    totalAmount: num(o.totalAmount),
    itemCount: o.itemCount != null ? num(o.itemCount) : undefined,
    customer: {
      id: o.customerId ? String(o.customerId) : null,
      name: [o.customerFirstName, o.customerLastName].filter(Boolean).join(" ") || o.shipName || "",
      email: o.customerEmail || o.accountEmail || null,
      phone: o.customerPhone || o.shipPhone || null,
    },
    address: {
      type: o.shipType,
      name: o.shipName,
      phone: o.shipPhone,
      line1: o.shipLine1,
      line2: o.shipLine2,
      city: o.shipCity,
      state: o.shipState,
      pinCode: o.shipPinCode,
    },
    notes: o.notes,
    adminNotes: o.adminNotes ?? null,
    cancelReason: o.cancelReason ?? null,
    stockDeducted: Boolean(Number(o.stockDeducted)),
    courierName: o.courierName ?? null,
    trackingNumber: o.trackingNumber ?? null,
    trackingUrl: o.trackingUrl ?? null,
    confirmedAt: o.confirmedAt ?? null,
    packedAt: o.packedAt ?? null,
    shippedAt: o.shippedAt ?? null,
    deliveredAt: o.deliveredAt ?? null,
    returnedAt: o.returnedAt ?? null,
    cancelledAt: o.cancelledAt ?? null,
  };
}

const ORDER_SELECT = `
  SELECT o.*, c.firstName AS customerFirstName, c.lastName AS customerLastName,
         c.email AS accountEmail, c.phone AS customerPhone
    FROM website_orders o
    LEFT JOIN website_customers c ON c.id = o.customerId`;

/**
 * GET /api/admin/orders
 * ?status=processing|...|active|all  &search=  &from=YYYY-MM-DD &to=YYYY-MM-DD
 * &payment=cod|online  &page=1 &limit=20
 */
router.get("/", canView, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const where = [];
    const params = [];

    const status = String(req.query.status || "all");
    if (status === "active") {
      where.push("o.status IN ('processing','confirmed','packed','shipped','out_for_delivery')");
    } else if (status === "needs_action") {
      where.push("o.status IN ('processing','confirmed','packed')");
    } else if (status === "refund_pending") {
      where.push("o.status IN ('cancelled','returned') AND o.paymentStatus = 'paid' AND o.paymentProvider = 'razorpay'");
    } else if (status !== "all" && STATUS_LABELS[status]) {
      where.push("o.status = ?");
      params.push(status);
    }

    if (req.query.payment === "cod") where.push("o.paymentMethod = 'cod'");
    if (req.query.payment === "online") where.push("o.paymentMethod <> 'cod'");

    if (/^\d{4}-\d{2}-\d{2}$/.test(String(req.query.from || ""))) {
      where.push("o.placedAt >= ?");
      params.push(`${req.query.from} 00:00:00`);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to || ""))) {
      where.push("o.placedAt <= ?");
      params.push(`${req.query.to} 23:59:59`);
    }

    const search = String(req.query.search || "").trim();
    if (search) {
      const like = `%${search}%`;
      where.push(`(o.orderNumber LIKE ? OR o.shipName LIKE ? OR o.shipPhone LIKE ? OR c.email LIKE ?
                   OR c.phone LIKE ? OR o.trackingNumber LIKE ? OR o.providerPaymentId LIKE ?)`);
      params.push(like, like, like, like, like, like, like);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM website_orders o
         LEFT JOIN website_customers c ON c.id = o.customerId ${whereSql}`,
      params
    );
    const [rows] = await db.query(
      `SELECT o.*, c.firstName AS customerFirstName, c.lastName AS customerLastName,
              c.email AS accountEmail, c.phone AS customerPhone,
              (SELECT COALESCE(SUM(qty),0) FROM website_order_items i WHERE i.orderId = o.id) AS itemCount
         FROM website_orders o
         LEFT JOIN website_customers c ON c.id = o.customerId
         ${whereSql}
        ORDER BY o.placedAt DESC, o.id DESC
        LIMIT ? OFFSET ?`,
      [...params, limit, (page - 1) * limit]
    );

    const [countRows] = await db.query("SELECT status, COUNT(*) AS n FROM website_orders GROUP BY status");
    const counts = Object.fromEntries(countRows.map((r) => [r.status, num(r.n)]));

    return ok(res, rows.map(mapAdminOrder), "Success", {
      pagination: { page, limit, total: num(total), totalPages: Math.max(1, Math.ceil(num(total) / limit)) },
      counts,
    });
  } catch (e) {
    return handleError(res, e, "list");
  }
});

/** GET /api/admin/orders/:id — full order with items, timeline and payment log. */
router.get("/:id", canView, async (req, res) => {
  try {
    const [[order]] = await db.query(`${ORDER_SELECT} WHERE o.id = ?`, [req.params.id]);
    if (!order) return fail(res, "Order not found", 404);

    const [items] = await db.query(
      `SELECT oi.*, ${ORDER_ITEM_IMAGE_SQL} AS primaryImage, i.openingStock AS currentStock
         FROM website_order_items oi
         LEFT JOIN items i ON i.id = oi.itemId
        WHERE oi.orderId = ? ORDER BY oi.id ASC`,
      [order.id]
    );

    const history = await loadHistory(order.id);
    const [payments] = await db
      .query(
        `SELECT id, eventType, providerPaymentId, amount, status, source, createdAt
           FROM website_payment_events WHERE orderId = ? ORDER BY createdAt ASC, id ASC`,
        [order.id]
      )
      .catch(() => [[]]);

    const notifications = await listNotifications(order.id);

    return ok(res, {
      ...mapAdminOrder(order),
      notifications,
      items: items.map((row) => ({
        id: String(row.id),
        itemId: row.itemId ? String(row.itemId) : null,
        itemName: row.itemName,
        brandName: row.brandName,
        categoryName: row.categoryName,
        variant: row.variant,
        colorName: row.colorName,
        primaryImage: toAssetUrl(row.primaryImage),
        qty: num(row.qty),
        unitPrice: num(row.unitPrice),
        originalPrice: num(row.originalPrice),
        gst: num(row.gst),
        hsnCode: row.hsnCode ?? null,
        lineTotal: num(row.lineTotal),
        currentStock: row.currentStock == null ? null : num(row.currentStock),
      })),
      history,
      payments,
    });
  } catch (e) {
    return handleError(res, e, "detail");
  }
});

/**
 * POST /api/admin/orders/:id/status
 * { status, note?, courierName?, trackingNumber?, trackingUrl?, restock?, refund? }
 */
router.post("/:id/status", canEdit, async (req, res) => {
  try {
    const to = String(req.body?.status || "");
    await changeOrderStatus({ orderId: req.params.id, to, data: req.body || {}, actor: actorOf(req) });
    return ok(res, { id: req.params.id, status: to }, `Order marked as ${STATUS_LABELS[to] || to}`);
  } catch (e) {
    return handleError(res, e, "status");
  }
});

/** POST /api/admin/orders/:id/cancel  { reason } */
router.post("/:id/cancel", canEdit, async (req, res) => {
  try {
    const reason = String(req.body?.reason || "").trim() || "Cancelled by store";
    const { refundNote } = await cancelOrder({ orderId: req.params.id, reason, actor: actorOf(req) });
    return ok(res, { id: req.params.id }, refundNote ? "Order cancelled. Refund processed via Razorpay." : "Order cancelled");
  } catch (e) {
    return handleError(res, e, "cancel");
  }
});

/** POST /api/admin/orders/:id/refund — Razorpay refund, or record a manual (COD) refund. */
router.post("/:id/refund", canEdit, async (req, res) => {
  try {
    const result = await refundOrder({ orderId: req.params.id, actor: actorOf(req), note: req.body?.note });
    return ok(res, { id: req.params.id, ...result }, result.manual ? "Marked as refunded" : "Refund initiated");
  } catch (e) {
    return handleError(res, e, "refund");
  }
});

/** PUT /api/admin/orders/:id/shipping  { courierName, trackingNumber, trackingUrl } */
router.put("/:id/shipping", canEdit, async (req, res) => {
  try {
    await updateShipping({ orderId: req.params.id, data: req.body || {}, actor: actorOf(req) });
    return ok(res, { id: req.params.id }, "Tracking details updated");
  } catch (e) {
    return handleError(res, e, "shipping");
  }
});

const INVOICEABLE = new Set(["shipped", "out_for_delivery", "delivered", "returned"]);

/** GET /api/admin/orders/:id/invoice — GST invoice PDF (issued at shipping). */
router.get("/:id/invoice", canView, async (req, res) => {
  try {
    const [[order]] = await db.query("SELECT id, status, invoiceNumber FROM website_orders WHERE id = ?", [req.params.id]);
    if (!order) return fail(res, "Order not found", 404);
    if (!order.invoiceNumber) {
      if (!INVOICEABLE.has(order.status)) return fail(res, "The invoice is issued when the order is shipped.", 409);
      await ensureInvoice(order.id);
    }
    const { pdf, filename } = await getInvoicePdf(order.id);
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `${req.query.download ? "attachment" : "inline"}; filename="${filename}"`,
    });
    return res.send(pdf);
  } catch (e) {
    return handleError(res, e, "invoice");
  }
});

/**
 * POST /api/admin/orders/:id/notify  { event? }
 * Re-send the customer email for an event (default: the order's current status).
 */
router.post("/:id/notify", canEdit, async (req, res) => {
  try {
    const [[order]] = await db.query("SELECT id, status FROM website_orders WHERE id = ?", [req.params.id]);
    if (!order) return fail(res, "Order not found", 404);
    const event = String(req.body?.event || (order.status === "processing" ? "placed" : order.status));
    if (!CUSTOMER_EVENTS.includes(event)) return fail(res, `No customer email exists for "${event}"`);
    const result = await sendOrderEmails(order.id, event, {}, { force: true });
    const c = result.customer;
    if (!c) return fail(res, "Nothing was sent");
    if (c.status === "sent") return ok(res, result, "Email sent to the customer");
    return fail(res, c.reason || c.error || "Email could not be sent", c.status === "failed" ? 502 : 400);
  } catch (e) {
    return handleError(res, e, "notify");
  }
});

/** PUT /api/admin/orders/:id/notes  { adminNotes } — internal only. */
router.put("/:id/notes", canEdit, async (req, res) => {
  try {
    const notes = String(req.body?.adminNotes ?? "").slice(0, 5000) || null;
    const [result] = await db.query("UPDATE website_orders SET adminNotes = ? WHERE id = ?", [notes, req.params.id]);
    if (!result.affectedRows) return fail(res, "Order not found", 404);
    return ok(res, { id: req.params.id }, "Notes saved");
  } catch (e) {
    return handleError(res, e, "notes");
  }
});

export default router;
