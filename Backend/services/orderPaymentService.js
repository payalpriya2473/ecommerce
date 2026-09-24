// services/orderPaymentService.js
// Everything that writes payment state onto an order lives here, so the
// checkout callback and the webhook can never drift apart.

import { db } from "../config/db.js";
import { refundRazorpayPayment } from "./razorpayService.js";
import { notifyOrder } from "./orderNotifications.js";

let schemaReady = null;

async function columnExists(table, column) {
  const [[row]] = await db.query(
    `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return Number(row?.n) > 0;
}

async function tableExists(table) {
  const [[row]] = await db.query(
    `SELECT COUNT(*) AS n FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return Number(row?.n) > 0;
}

/**
 * Idempotent migration for the payment columns. Safe to call on every request;
 * the work only happens once per process.
 */
export function ensureOrderPaymentSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      if (!(await tableExists("website_orders"))) return; // orders router creates it first

      const additions = [
        ["paymentProvider", "VARCHAR(30) DEFAULT NULL"],
        ["providerOrderId", "VARCHAR(80) DEFAULT NULL"],
        ["providerPaymentId", "VARCHAR(80) DEFAULT NULL"],
        ["providerSignature", "VARCHAR(255) DEFAULT NULL"],
        ["paymentError", "VARCHAR(255) DEFAULT NULL"],
        ["paidAt", "TIMESTAMP NULL DEFAULT NULL"],
      ];

      for (const [column, definition] of additions) {
        if (!(await columnExists("website_orders", column))) {
          await db.query(`ALTER TABLE website_orders ADD COLUMN ${column} ${definition}`);
        }
      }

      // Orders now start life awaiting payment, so the status enum grows.
      await db
        .query(
          `ALTER TABLE website_orders
             MODIFY COLUMN status
             ENUM('pending_payment','payment_failed','processing','confirmed','packed','shipped','out_for_delivery','delivered','cancelled','returned')
             NOT NULL DEFAULT 'processing'`
        )
        .catch((e) => console.warn("[payments] could not widen status enum:", e.message));

      await db
        .query("CREATE INDEX idx_website_orders_provider_order ON website_orders (providerOrderId)")
        .catch(() => {});
      await db
        .query("CREATE UNIQUE INDEX uq_website_orders_provider_payment ON website_orders (providerPaymentId)")
        .catch(() => {});

      await db.query(`
        CREATE TABLE IF NOT EXISTS website_payment_events (
          id BIGINT(20) NOT NULL AUTO_INCREMENT,
          orderId BIGINT(20) DEFAULT NULL,
          provider VARCHAR(30) NOT NULL DEFAULT 'razorpay',
          eventType VARCHAR(60) NOT NULL,
          providerOrderId VARCHAR(80) DEFAULT NULL,
          providerPaymentId VARCHAR(80) DEFAULT NULL,
          providerEventId VARCHAR(80) DEFAULT NULL,
          amount DECIMAL(12,2) DEFAULT NULL,
          status VARCHAR(40) DEFAULT NULL,
          source VARCHAR(20) NOT NULL DEFAULT 'callback',
          payload LONGTEXT DEFAULT NULL,
          createdAt TIMESTAMP NOT NULL DEFAULT current_timestamp(),
          PRIMARY KEY (id),
          KEY idx_payment_events_order (orderId),
          KEY idx_payment_events_payment (providerPaymentId)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await db
        .query("CREATE UNIQUE INDEX uq_payment_events_event ON website_payment_events (providerEventId)")
        .catch(() => {});
    })().catch((e) => {
      schemaReady = null;
      throw e;
    });
  }
  return schemaReady;
}

export async function recordPaymentEvent({
  orderId = null,
  eventType,
  providerOrderId = null,
  providerPaymentId = null,
  providerEventId = null,
  amount = null,
  status = null,
  source = "callback",
  payload = null,
}) {
  try {
    await db.query(
      `INSERT INTO website_payment_events
         (orderId, provider, eventType, providerOrderId, providerPaymentId, providerEventId, amount, status, source, payload)
       VALUES (?, 'razorpay', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderId,
        eventType,
        providerOrderId,
        providerPaymentId,
        providerEventId,
        amount,
        status,
        source,
        payload ? JSON.stringify(payload).slice(0, 60000) : null,
      ]
    );
  } catch (e) {
    // A duplicate providerEventId simply means we've already seen this webhook.
    if (e?.code !== "ER_DUP_ENTRY") console.error("[payments/event]", e.message);
  }
}

export async function findOrderByProviderOrderId(providerOrderId) {
  const [[order]] = await db.query(
    "SELECT * FROM website_orders WHERE providerOrderId = ? LIMIT 1",
    [providerOrderId]
  );
  return order || null;
}

/**
 * Flip an order to paid and empty the paid-for items out of the cart.
 * Idempotent: a second call (webhook after callback, or a replayed webhook)
 * is a no-op and reports alreadyPaid.
 */
export async function markOrderPaid({ orderId, paymentId, signature = null, source = "callback", paidAmountPaise = null }) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [[order]] = await connection.query(
      "SELECT * FROM website_orders WHERE id = ? FOR UPDATE",
      [orderId]
    );

    if (!order) {
      await connection.rollback();
      return { ok: false, reason: "order_not_found" };
    }

    if (order.paymentStatus === "paid") {
      await connection.commit();
      return { ok: true, alreadyPaid: true, order };
    }

    // Never mark an order paid for a different amount than its total.
    if (paidAmountPaise != null && Number(paidAmountPaise) !== Math.round(Number(order.totalAmount) * 100)) {
      await connection.rollback();
      await recordPaymentEvent({
        orderId,
        eventType: "payment.amount_mismatch",
        providerOrderId: order.providerOrderId,
        providerPaymentId: paymentId,
        amount: Number(paidAmountPaise) / 100,
        status: "mismatch",
        source,
        payload: { expected: Number(order.totalAmount), paid: Number(paidAmountPaise) / 100 },
      });
      notifyOrder(orderId, "payment_issue", {
        message: `Razorpay payment ${paymentId || ""} of Rs ${Number(paidAmountPaise) / 100} does not match the order total Rs ${order.totalAmount}. The order was NOT marked paid — check it in Razorpay.`,
      });
      return { ok: false, reason: "amount_mismatch", order };
    }

    // Money arrived for an order the customer already cancelled: record the
    // payment, keep it cancelled, and refund it.
    if (order.status === "cancelled") {
      await connection.query(
        `UPDATE website_orders
            SET paymentStatus = 'paid', statusLabel = 'Cancelled – Refund Pending',
                providerPaymentId = COALESCE(?, providerPaymentId), paidAt = NOW()
          WHERE id = ?`,
        [paymentId, orderId]
      );
      await connection.commit();
      await recordPaymentEvent({
        orderId,
        eventType: "payment.on_cancelled_order",
        providerOrderId: order.providerOrderId,
        providerPaymentId: paymentId,
        amount: order.totalAmount,
        status: "refund_pending",
        source,
      });
      let autoRefunded = false;
      if (paymentId) {
        try {
          await refundRazorpayPayment(paymentId);
          await db.query("UPDATE website_orders SET statusLabel = 'Cancelled – Refund Initiated' WHERE id = ?", [orderId]);
          autoRefunded = true;
        } catch (e) {
          console.error(`[payments] auto-refund failed for cancelled order ${orderId}:`, e.message);
        }
      }
      notifyOrder(orderId, "payment_issue", {
        message: `Payment ${paymentId || ""} arrived after the order was cancelled. ${autoRefunded ? "It was refunded automatically." : "Automatic refund FAILED — refund it from Online Orders."}`,
      });
      if (autoRefunded) notifyOrder(orderId, "refund_initiated");
      const [[updatedCancelled]] = await db.query("SELECT * FROM website_orders WHERE id = ?", [orderId]);
      return { ok: true, alreadyPaid: false, cancelled: true, order: updatedCancelled };
    }

    await connection.query(
      `UPDATE website_orders
          SET paymentStatus     = 'paid',
              status            = CASE WHEN status IN ('pending_payment','payment_failed') THEN 'processing' ELSE status END,
              statusLabel       = CASE WHEN status IN ('pending_payment','payment_failed') THEN 'Order Placed' ELSE statusLabel END,
              providerPaymentId = COALESCE(?, providerPaymentId),
              providerSignature = COALESCE(?, providerSignature),
              paymentError      = NULL,
              paidAt            = NOW()
        WHERE id = ?`,
      [paymentId, signature, orderId]
    );

    // The customer has paid for these items — take them out of the live cart.
    const [items] = await connection.query(
      "SELECT itemId FROM website_order_items WHERE orderId = ? AND itemId IS NOT NULL",
      [orderId]
    );
    const itemIds = items.map((row) => row.itemId);
    if (itemIds.length > 0) {
      await connection.query(
        `DELETE FROM website_cart_items
          WHERE customerId = ? AND itemId IN (${itemIds.map(() => "?").join(",")})`,
        [order.customerId, ...itemIds]
      );
    }

    await connection.commit();

    const [[updated]] = await db.query("SELECT * FROM website_orders WHERE id = ?", [orderId]);
    await recordPaymentEvent({
      orderId,
      eventType: "payment.paid",
      providerOrderId: order.providerOrderId,
      providerPaymentId: paymentId,
      amount: order.totalAmount,
      status: "paid",
      source,
    });
    notifyOrder(orderId, "placed");

    return { ok: true, alreadyPaid: false, order: updated };
  } catch (e) {
    await connection.rollback().catch(() => {});
    throw e;
  } finally {
    connection.release();
  }
}

export async function markOrderPaymentFailed({ orderId, paymentId = null, reason = null, source = "callback" }) {
  const [[before]] = await db.query("SELECT status FROM website_orders WHERE id = ?", [orderId]);
  await db.query(
    `UPDATE website_orders
        SET paymentStatus     = 'failed',
            status            = CASE WHEN status = 'pending_payment' THEN 'payment_failed' ELSE status END,
            statusLabel       = CASE WHEN status = 'pending_payment' THEN 'Payment Failed' ELSE statusLabel END,
            providerPaymentId = COALESCE(?, providerPaymentId),
            paymentError      = ?
      WHERE id = ? AND paymentStatus <> 'paid'`,
    [paymentId, reason ? String(reason).slice(0, 255) : null, orderId]
  );

  await recordPaymentEvent({
    orderId,
    eventType: "payment.failed",
    providerPaymentId: paymentId,
    status: "failed",
    source,
    payload: reason ? { reason } : null,
  });
  if (before?.status === "pending_payment") notifyOrder(orderId, "payment_failed");
}

export async function markOrderRefunded({ orderId, paymentId = null, amount = null, totalRefunded = null, source = "webhook" }) {
  const [[order]] = await db.query("SELECT totalAmount, status FROM website_orders WHERE id = ?", [orderId]);
  const refundedSoFar = totalRefunded != null ? Number(totalRefunded) : Number(amount);
  const isFull =
    !order || !Number.isFinite(refundedSoFar) || refundedSoFar >= Number(order.totalAmount) - 0.01;

  if (isFull) {
    await db.query(
      `UPDATE website_orders
          SET paymentStatus = 'refunded',
              statusLabel   = CASE WHEN status = 'cancelled' THEN 'Cancelled – Refunded'
                                   WHEN status = 'returned'  THEN 'Returned – Refunded'
                                   ELSE 'Refunded' END
        WHERE id = ?`,
      [orderId]
    );
  } else {
    // Partial refund: money is still (partly) with us — keep it "paid".
    await db.query("UPDATE website_orders SET statusLabel = 'Partially Refunded' WHERE id = ?", [orderId]);
  }

  await recordPaymentEvent({
    orderId,
    eventType: "refund.processed",
    providerPaymentId: paymentId,
    amount,
    status: "refunded",
    source,
  });
  if (isFull) notifyOrder(orderId, "refunded", { amount: refundedSoFar || amount });
}
