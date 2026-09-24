// services/orderFulfilment.js
// Order processing after checkout: status flow, stock, cancel / return and
// refunds. Shared by the admin "Online Orders" module and the customer
// cancel endpoint so both follow exactly the same rules.
//
// Flow:  processing (Order Placed) → confirmed → packed → shipped
//          → out_for_delivery → delivered → (returned)
//        cancel is allowed until the order is shipped.
//
// Stock:  items.openingStock is reduced when the order is CONFIRMED and put
//         back if a confirmed order is cancelled or returned (restock).
//
// Schema: see online_orders_queries.sql (run once in phpMyAdmin).

import { db } from "../config/db.js";
import { refundRazorpayPayment } from "./razorpayService.js";
import { recordPaymentEvent } from "./orderPaymentService.js";
import { notifyOrder } from "./orderNotifications.js";
import { ensureInvoice } from "./invoice.js";

export const STATUS_LABELS = {
  pending_payment: "Awaiting Payment",
  payment_failed: "Payment Failed",
  processing: "Order Placed",
  confirmed: "Order Confirmed",
  packed: "Packed",
  shipped: "Shipped",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
};

// Allowed admin moves from each status.
export const ORDER_FLOW = {
  pending_payment: ["cancelled"],
  payment_failed: ["cancelled"],
  processing: ["confirmed", "cancelled"],
  confirmed: ["packed", "cancelled"],
  packed: ["shipped", "cancelled"],
  shipped: ["out_for_delivery", "delivered", "returned"],
  out_for_delivery: ["delivered", "returned"],
  delivered: ["returned"],
  cancelled: [],
  returned: [],
};

// Customers may cancel themselves only before the order is packed.
export const CUSTOMER_CANCELLABLE = new Set(["pending_payment", "payment_failed", "processing", "confirmed"]);

export class OrderError extends Error {
  constructor(message, status = 400, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const clean = (value, max) => {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, max) : null;
};

export function isPaidOnline(order) {
  return (
    order.paymentStatus === "paid" &&
    order.paymentProvider === "razorpay" &&
    Boolean(order.providerPaymentId)
  );
}

// ─── History ────────────────────────────────────────────────────────────────

let historyWarned = false;
async function addHistory(conn, { orderId, from = null, to, note = null, actor = {} }) {
  try {
    await conn.query(
      `INSERT INTO website_order_status_history
         (orderId, fromStatus, toStatus, note, actorType, actorId, actorName)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        orderId,
        from,
        to,
        clean(note, 500),
        actor.type || "admin",
        actor.id ?? null,
        clean(actor.name, 150),
      ]
    );
  } catch (e) {
    if (e?.code === "ER_NO_SUCH_TABLE") {
      if (!historyWarned) console.warn("[orders] website_order_status_history missing — run online_orders_queries.sql");
      historyWarned = true;
      return;
    }
    throw e;
  }
}

export async function loadHistory(orderId) {
  try {
    const [rows] = await db.query(
      `SELECT id, fromStatus, toStatus, note, actorType, actorName, createdAt
         FROM website_order_status_history WHERE orderId = ? ORDER BY createdAt ASC, id ASC`,
      [orderId]
    );
    return rows;
  } catch (e) {
    if (e?.code === "ER_NO_SUCH_TABLE") return [];
    throw e;
  }
}

// ─── Stock ──────────────────────────────────────────────────────────────────

async function orderLines(conn, orderId) {
  const [lines] = await conn.query(
    `SELECT itemId, SUM(qty) AS qty, MAX(itemName) AS itemName, MAX(variant) AS variant
       FROM website_order_items
      WHERE orderId = ? AND itemId IS NOT NULL
      GROUP BY itemId`,
    [orderId]
  );
  return lines;
}

async function deductStock(conn, orderId) {
  const lines = await orderLines(conn, orderId);
  if (!lines.length) return;

  const [items] = await conn.query(
    "SELECT id, openingStock FROM items WHERE id IN (?) FOR UPDATE",
    [lines.map((l) => l.itemId)]
  );
  const byId = new Map(items.map((row) => [String(row.id), row]));

  const problems = [];
  for (const line of lines) {
    const item = byId.get(String(line.itemId));
    const stock = Math.floor(Number(item?.openingStock) || 0);
    const name = [line.itemName, line.variant].filter(Boolean).join(" ");
    if (!item) problems.push(`${name}: item no longer exists`);
    else if (stock < Number(line.qty)) problems.push(`${name}: need ${line.qty}, only ${stock} in stock`);
  }
  if (problems.length) {
    throw new OrderError("Not enough stock to confirm this order. Update the stock in Items and try again.", 409, { problems });
  }

  for (const line of lines) {
    // MySQL applies SET left to right, so stockValue uses the new openingStock.
    await conn.query(
      `UPDATE items
          SET openingStock = openingStock - ?,
              stockValue   = COALESCE(nlc, 0) * openingStock
        WHERE id = ?`,
      [Number(line.qty), line.itemId]
    );
  }
}

async function restoreStock(conn, orderId) {
  const lines = await orderLines(conn, orderId);
  for (const line of lines) {
    await conn.query(
      `UPDATE items
          SET openingStock = openingStock + ?,
              stockValue   = COALESCE(nlc, 0) * openingStock
        WHERE id = ?`,
      [Number(line.qty), line.itemId]
    );
  }
}

// ─── Refund ─────────────────────────────────────────────────────────────────

async function refundOnline(order, { labelPrefix, source }) {
  try {
    const refund = await refundRazorpayPayment(order.providerPaymentId);
    await db.query("UPDATE website_orders SET statusLabel = ? WHERE id = ?", [`${labelPrefix} – Refund Initiated`, order.id]);
    await recordPaymentEvent({
      orderId: order.id,
      eventType: "refund.requested",
      providerOrderId: order.providerOrderId,
      providerPaymentId: order.providerPaymentId,
      amount: order.totalAmount,
      status: refund?.status || "requested",
      source,
    });
    return { refunded: true };
  } catch (err) {
    console.error(`[orders] refund failed for order ${order.id}:`, err.message);
    await db.query("UPDATE website_orders SET statusLabel = ? WHERE id = ?", [`${labelPrefix} – Refund Pending`, order.id]);
    await recordPaymentEvent({
      orderId: order.id,
      eventType: "refund.failed",
      providerPaymentId: order.providerPaymentId,
      amount: order.totalAmount,
      status: "failed",
      source,
      payload: { error: err.message },
    });
    notifyOrder(order.id, "payment_issue", {
      message: `Automatic Razorpay refund of Rs ${order.totalAmount} failed (${err.message}). Use "Refund via Razorpay" in Online Orders to retry.`,
    });
    return { refunded: false, error: err.message };
  }
}

/**
 * Admin refund for a cancelled / returned order that is still marked paid:
 *  • paid online (Razorpay) → refund through Razorpay (webhook confirms it)
 *  • COD / offline → record that the store refunded the customer manually
 */
export async function refundOrder({ orderId, actor, note = null }) {
  const [[order]] = await db.query("SELECT * FROM website_orders WHERE id = ?", [orderId]);
  if (!order) throw new OrderError("Order not found", 404);
  if (!["cancelled", "returned"].includes(order.status)) throw new OrderError("Only cancelled or returned orders can be refunded");
  if (order.paymentStatus !== "paid") throw new OrderError("This order has no received payment to refund");
  const prefix = order.status === "returned" ? "Returned" : "Cancelled";

  if (isPaidOnline(order)) {
    const result = await refundOnline(order, { labelPrefix: prefix, source: "admin_refund" });
    await addHistory(db, {
      orderId,
      from: order.status,
      to: order.status,
      note: result.refunded ? "Razorpay refund initiated" : `Refund failed: ${result.error}`,
      actor,
    });
    if (!result.refunded) throw new OrderError(`Razorpay refund failed: ${result.error}`, 502);
    notifyOrder(order.id, "refund_initiated");
    return { ...result, manual: false };
  }

  await db.query("UPDATE website_orders SET paymentStatus = 'refunded', statusLabel = ? WHERE id = ?", [`${prefix} – Refunded`, order.id]);
  await addHistory(db, {
    orderId,
    from: order.status,
    to: order.status,
    note: `Refund paid manually${note ? `: ${note}` : ""}`,
    actor,
  });
  notifyOrder(order.id, "refunded", { amount: order.totalAmount });
  return { refunded: true, manual: true };
}

// ─── Cancel ─────────────────────────────────────────────────────────────────

/**
 * Cancel an order. Pass customerId for a customer-initiated cancel (limited
 * to CUSTOMER_CANCELLABLE); leave it null for admin.
 */
export async function cancelOrder({ orderId, customerId = null, reason = null, actor = {} }) {
  const conn = await db.getConnection();
  let order;
  try {
    await conn.beginTransaction();
    const [[row]] = await conn.query(
      customerId
        ? "SELECT * FROM website_orders WHERE id = ? AND customerId = ? FOR UPDATE"
        : "SELECT * FROM website_orders WHERE id = ? FOR UPDATE",
      customerId ? [orderId, customerId] : [orderId]
    );
    order = row;
    if (!order) throw new OrderError("Order not found", 404);
    if (order.status === "cancelled") throw new OrderError("Order is already cancelled");

    const allowed = customerId
      ? CUSTOMER_CANCELLABLE.has(order.status)
      : (ORDER_FLOW[order.status] || []).includes("cancelled");
    if (!allowed) {
      throw new OrderError(
        customerId
          ? "This order can no longer be cancelled. Please contact support."
          : `A ${STATUS_LABELS[order.status] || order.status} order cannot be cancelled. Use Returned instead.`
      );
    }

    if (Number(order.stockDeducted)) await restoreStock(conn, order.id);

    const paid = isPaidOnline(order);
    await conn.query(
      `UPDATE website_orders
          SET status = 'cancelled', statusLabel = ?, cancelledAt = NOW(),
              cancelReason = ?, stockDeducted = 0
        WHERE id = ?`,
      [paid ? "Cancelled – Refund Pending" : "Cancelled", clean(reason, 255), order.id]
    );
    await addHistory(conn, {
      orderId: order.id,
      from: order.status,
      to: "cancelled",
      note: reason || (customerId ? "Cancelled by customer" : "Cancelled"),
      actor,
    });
    await conn.commit();
  } catch (e) {
    await conn.rollback().catch(() => {});
    throw e;
  } finally {
    conn.release();
  }

  let refundNote = null;
  let refundStarted;
  if (isPaidOnline(order)) {
    const result = await refundOnline(order, {
      labelPrefix: "Cancelled",
      source: customerId ? "customer_cancel" : "admin_cancel",
    });
    refundStarted = result.refunded;
    refundNote = result.refunded
      ? "Your refund has been initiated and will reach your account in 5–7 working days."
      : "Your order is cancelled. Our team will process the refund shortly.";
  }
  notifyOrder(order.id, "cancelled", { byCustomer: Boolean(customerId), refundStarted });
  return { refundNote };
}

// ─── Status change ──────────────────────────────────────────────────────────

/**
 * Move an order to the next status (admin).
 * data: { note, courierName, trackingNumber, trackingUrl, restock, refund }
 */
export async function changeOrderStatus({ orderId, to, data = {}, actor = {} }) {
  if (to === "cancelled") return cancelOrder({ orderId, reason: data.note, actor });
  if (!STATUS_LABELS[to]) throw new OrderError("Unknown status");

  const conn = await db.getConnection();
  let order;
  const sets = [];
  const params = [];
  const set = (sql, ...values) => {
    sets.push(sql);
    params.push(...values);
  };

  try {
    await conn.beginTransaction();
    const [[row]] = await conn.query("SELECT * FROM website_orders WHERE id = ? FOR UPDATE", [orderId]);
    order = row;
    if (!order) throw new OrderError("Order not found", 404);

    const allowed = ORDER_FLOW[order.status] || [];
    if (!allowed.includes(to)) {
      throw new OrderError(
        `Cannot move an order from "${STATUS_LABELS[order.status] || order.status}" to "${STATUS_LABELS[to]}".`
      );
    }

    let statusLabel = STATUS_LABELS[to];
    set("status = ?", to);

    if (to === "confirmed") {
      if (order.paymentMethod !== "cod" && order.paymentStatus !== "paid") {
        throw new OrderError("Online payment has not been received for this order yet.");
      }
      if (!Number(order.stockDeducted)) {
        await deductStock(conn, order.id);
        set("stockDeducted = 1");
      }
      set("confirmedAt = NOW()");
    }

    if (to === "packed") set("packedAt = NOW()");

    if (to === "shipped") {
      const courierName = clean(data.courierName, 100);
      const trackingNumber = clean(data.trackingNumber, 100);
      if (!courierName || !trackingNumber) {
        throw new OrderError("Courier name and tracking / AWB number are required to ship.");
      }
      set("courierName = ?", courierName);
      set("trackingNumber = ?", trackingNumber);
      set("trackingUrl = ?", clean(data.trackingUrl, 500));
      set("shippedAt = NOW()");
    }

    if (to === "delivered") {
      set("deliveredAt = NOW()");
      if (order.paymentMethod === "cod" && order.paymentStatus !== "paid") {
        set("paymentStatus = 'paid'");
        set("paidAt = NOW()");
      }
    }

    if (to === "returned") {
      set("returnedAt = NOW()");
      if (data.restock !== false && Number(order.stockDeducted)) {
        await restoreStock(conn, order.id);
        set("stockDeducted = 0");
      }
      if (isPaidOnline(order) && data.refund) statusLabel = "Returned – Refund Pending";
    }

    set("statusLabel = ?", statusLabel);
    await conn.query(`UPDATE website_orders SET ${sets.join(", ")} WHERE id = ?`, [...params, order.id]);

    const notes = [data.note];
    if (to === "shipped") notes.push(`${clean(data.courierName, 100)} · AWB ${clean(data.trackingNumber, 100)}`);
    if (to === "returned") notes.push(data.restock === false ? "Not restocked" : "Restocked");
    await addHistory(conn, {
      orderId: order.id,
      from: order.status,
      to,
      note: notes.filter(Boolean).join(" — ") || null,
      actor,
    });

    await conn.commit();
  } catch (e) {
    await conn.rollback().catch(() => {});
    throw e;
  } finally {
    conn.release();
  }

  let refundStarted;
  if (to === "returned" && isPaidOnline(order)) {
    refundStarted = data.refund ? (await refundOnline(order, { labelPrefix: "Returned", source: "admin_return" })).refunded : false;
  }
  if (to === "shipped") {
    // GST invoice number is issued at dispatch; the PDF goes with the email.
    await ensureInvoice(order.id).catch((e) => console.error(`[orders] invoice for order ${order.id}:`, e.message));
  }
  notifyOrder(order.id, to, { refundStarted });
  return { ok: true };
}

/** Edit courier / tracking after shipping (typo fixes, courier change). */
export async function updateShipping({ orderId, data = {}, actor = {} }) {
  const courierName = clean(data.courierName, 100);
  const trackingNumber = clean(data.trackingNumber, 100);
  if (!courierName || !trackingNumber) throw new OrderError("Courier name and tracking number are required.");
  const [result] = await db.query(
    "UPDATE website_orders SET courierName = ?, trackingNumber = ?, trackingUrl = ? WHERE id = ?",
    [courierName, trackingNumber, clean(data.trackingUrl, 500), orderId]
  );
  if (!result.affectedRows) throw new OrderError("Order not found", 404);
  const [[order]] = await db.query("SELECT status FROM website_orders WHERE id = ?", [orderId]);
  await addHistory(db, {
    orderId,
    from: order.status,
    to: order.status,
    note: `Tracking updated: ${courierName} · AWB ${trackingNumber}`,
    actor,
  });
}
