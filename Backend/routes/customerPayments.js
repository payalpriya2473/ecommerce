// routes/customerPayments.js
// Razorpay checkout endpoints for logged-in customers.
//
//   GET  /api/customer/payments/config              → is the gateway on, and the public key
//   POST /api/customer/payments/razorpay/order      → create a Razorpay order for one of our orders
//   POST /api/customer/payments/razorpay/verify     → verify the checkout signature, mark paid
//   POST /api/customer/payments/razorpay/failed     → record a failed / abandoned attempt

import express from "express";
import { db } from "../config/db.js";
import { requireCustomer } from "../middleware/customerAuth.js";
import {
  createRazorpayOrder,
  fetchRazorpayPayment,
  getRazorpayConfig,
  isValidPaymentSignature,
  toPaise,
} from "../services/razorpayService.js";
import {
  ensureOrderPaymentSchema,
  markOrderPaid,
  markOrderPaymentFailed,
  recordPaymentEvent,
} from "../services/orderPaymentService.js";

const router = express.Router();

function ok(res, data, msg = "Success") {
  return res.json({ success: true, message: msg, data });
}
function fail(res, msg, status = 400) {
  return res.status(status).json({ success: false, message: msg });
}

async function loadOwnedOrder(orderId, customerId) {
  const [[order]] = await db.query(
    "SELECT * FROM website_orders WHERE id = ? AND customerId = ?",
    [orderId, customerId]
  );
  return order || null;
}

/**
 * GET /api/customer/payments/config
 * Public-safe: only ever exposes the key id, never the secret.
 */
router.get("/config", (req, res) => {
  const { configured, keyId, mode } = getRazorpayConfig();
  return ok(res, {
    provider: "razorpay",
    enabled: configured,
    keyId: configured ? keyId : null,
    mode,
  });
});

router.use(requireCustomer);

/**
 * POST /api/customer/payments/razorpay/order
 * Body: { orderId }
 */
router.post("/razorpay/order", async (req, res) => {
  try {
    const { configured, keyId, mode } = getRazorpayConfig();
    if (!configured) {
      return fail(res, "Online payment is not configured yet. Please choose Cash on Delivery.", 503);
    }

    await ensureOrderPaymentSchema();

    const { orderId } = req.body || {};
    if (!orderId) return fail(res, "orderId is required");

    const order = await loadOwnedOrder(orderId, req.customer.id);
    if (!order) return fail(res, "Order not found", 404);
    if (order.paymentStatus === "paid") return fail(res, "This order is already paid");
    if (order.paymentMethod === "cod") return fail(res, "Cash on Delivery orders do not need online payment");
    if (Number(order.totalAmount) <= 0) return fail(res, "Order total must be greater than zero");

    // Reuse the existing Razorpay order when the customer retries, so we don't
    // pile up abandoned orders in the dashboard.
    if (order.providerOrderId) {
      return ok(res, {
        keyId,
        mode,
        razorpayOrderId: order.providerOrderId,
        amount: toPaise(order.totalAmount),
        currency: "INR",
        orderId: String(order.id),
        orderNumber: order.orderNumber,
        reused: true,
      });
    }

    const razorpayOrder = await createRazorpayOrder({
      amount: order.totalAmount,
      receipt: order.orderNumber,
      notes: {
        orderId: String(order.id),
        orderNumber: order.orderNumber,
        customerId: String(req.customer.id),
      },
    });

    await db.query(
      "UPDATE website_orders SET paymentProvider = 'razorpay', providerOrderId = ? WHERE id = ?",
      [razorpayOrder.id, order.id]
    );

    await recordPaymentEvent({
      orderId: order.id,
      eventType: "order.created",
      providerOrderId: razorpayOrder.id,
      amount: order.totalAmount,
      status: razorpayOrder.status,
      source: "callback",
    });

    return ok(res, {
      keyId,
      mode,
      razorpayOrderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      orderId: String(order.id),
      orderNumber: order.orderNumber,
      reused: false,
    });
  } catch (e) {
    console.error("[payments/razorpay/order]", e);
    return fail(res, e.code === "RAZORPAY_NOT_CONFIGURED" ? e.message : "Could not start the payment. Please try again.", 500);
  }
});

/**
 * POST /api/customer/payments/razorpay/verify
 * Body: { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature }
 */
router.post("/razorpay/verify", async (req, res) => {
  try {
    await ensureOrderPaymentSchema();

    const {
      orderId,
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: signature,
    } = req.body || {};

    if (!orderId || !razorpayOrderId || !razorpayPaymentId || !signature) {
      return fail(res, "Incomplete payment confirmation");
    }

    const order = await loadOwnedOrder(orderId, req.customer.id);
    if (!order) return fail(res, "Order not found", 404);

    // The order id must be the one we issued for this order — otherwise a
    // customer could replay someone else's (valid) payment signature.
    if (!order.providerOrderId || order.providerOrderId !== razorpayOrderId) {
      return fail(res, "Payment does not belong to this order", 409);
    }

    if (!isValidPaymentSignature({ razorpayOrderId, razorpayPaymentId, signature })) {
      await markOrderPaymentFailed({
        orderId: order.id,
        paymentId: razorpayPaymentId,
        reason: "Signature verification failed",
        source: "callback",
      });
      return fail(res, "We could not verify this payment. If money was debited it will be refunded automatically.", 400);
    }

    // Signature is good; confirm with Razorpay that the payment actually
    // captured (defence in depth — the signature alone proves origin, not state).
    let capturedAmount = null;
    try {
      const payment = await fetchRazorpayPayment(razorpayPaymentId);
      capturedAmount = payment?.amount ?? null;

      if (payment?.status && !["captured", "authorized"].includes(payment.status)) {
        await markOrderPaymentFailed({
          orderId: order.id,
          paymentId: razorpayPaymentId,
          reason: `Payment status: ${payment.status}`,
          source: "callback",
        });
        return fail(res, "Payment was not completed. Please try again.");
      }

      if (capturedAmount != null && capturedAmount !== toPaise(order.totalAmount)) {
        console.error(
          `[payments] amount mismatch on order ${order.id}: paid ${capturedAmount}, expected ${toPaise(order.totalAmount)}`
        );
        return fail(res, "Paid amount does not match the order total. Our team will contact you.", 409);
      }
    } catch (e) {
      // Verification API hiccup. Still safe: the signature proves this payment
      // belongs to OUR Razorpay order (checked above), and that Razorpay order
      // was created for exactly this order's total. The webhook re-checks.
      console.warn("[payments/verify] payment fetch failed:", e.message);
    }

    const result = await markOrderPaid({
      orderId: order.id,
      paymentId: razorpayPaymentId,
      signature,
      source: "callback",
      paidAmountPaise: capturedAmount,
    });

    if (!result.ok && result.reason === "amount_mismatch") {
      return fail(res, "Paid amount does not match the order total. Our team will contact you.", 409);
    }
    if (!result.ok) return fail(res, "Could not confirm the payment", 500);

    return ok(
      res,
      {
        orderId: String(order.id),
        orderNumber: order.orderNumber,
        paymentId: razorpayPaymentId,
        alreadyPaid: result.alreadyPaid,
        status: result.order?.status,
        paymentStatus: result.order?.paymentStatus,
      },
      "Payment verified"
    );
  } catch (e) {
    console.error("[payments/razorpay/verify]", e);
    return fail(res, "Could not verify the payment", 500);
  }
});

/**
 * POST /api/customer/payments/razorpay/failed
 * Body: { orderId, reason?, razorpay_payment_id? }
 * Called when checkout reports an error or the customer closes the modal.
 */
router.post("/razorpay/failed", async (req, res) => {
  try {
    await ensureOrderPaymentSchema();

    const { orderId, reason, razorpay_payment_id: paymentId } = req.body || {};
    if (!orderId) return fail(res, "orderId is required");

    const order = await loadOwnedOrder(orderId, req.customer.id);
    if (!order) return fail(res, "Order not found", 404);
    if (order.paymentStatus === "paid") return ok(res, { alreadyPaid: true });

    await markOrderPaymentFailed({
      orderId: order.id,
      paymentId: paymentId || null,
      reason: reason || "Payment not completed",
      source: "callback",
    });

    return ok(res, { orderId: String(order.id) }, "Payment attempt recorded");
  } catch (e) {
    console.error("[payments/razorpay/failed]", e);
    return fail(res, "Server error", 500);
  }
});

export default router;
