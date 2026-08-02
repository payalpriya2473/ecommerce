// routes/razorpayWebhook.js
// POST /api/webhooks/razorpay
//
// The webhook — not the browser callback — is the source of truth. It still
// fires when the customer closes the tab straight after paying.
//
// IMPORTANT: this router is mounted with express.raw() in server.js. The
// signature is computed over the exact bytes Razorpay sent, so it must run
// before express.json() parses (and re-serialises) the body.

import express from "express";
import { isValidWebhookSignature, getRazorpayConfig } from "../services/razorpayService.js";
import {
  ensureOrderPaymentSchema,
  findOrderByProviderOrderId,
  markOrderPaid,
  markOrderPaymentFailed,
  markOrderRefunded,
  recordPaymentEvent,
} from "../services/orderPaymentService.js";

const router = express.Router();

router.post("/razorpay", async (req, res) => {
  const signature = req.get("X-Razorpay-Signature");
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body || "");
  const { webhookSecret } = getRazorpayConfig();

  if (!webhookSecret) {
    console.warn("[webhook/razorpay] RAZORPAY_WEBHOOK_SECRET is not set — ignoring event");
    return res.status(200).json({ success: true, message: "Webhook secret not configured" });
  }

  if (!isValidWebhookSignature(rawBody, signature)) {
    console.warn("[webhook/razorpay] invalid signature — rejected");
    return res.status(400).json({ success: false, message: "Invalid signature" });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ success: false, message: "Malformed payload" });
  }

  // Acknowledge fast — Razorpay retries on anything that isn't a quick 2xx.
  res.status(200).json({ success: true, received: true });

  try {
    await ensureOrderPaymentSchema();
    await handleEvent(event, req.get("X-Razorpay-Event-Id") || null);
  } catch (e) {
    console.error("[webhook/razorpay] handler failed:", e);
  }
});

async function handleEvent(event, eventId) {
  const type = event?.event;
  const payment = event?.payload?.payment?.entity || null;
  const refund = event?.payload?.refund?.entity || null;
  const order = event?.payload?.order?.entity || null;

  const providerOrderId = payment?.order_id || order?.id || refund?.payment_id || null;
  const notesOrderId = payment?.notes?.orderId || order?.notes?.orderId || null;

  let localOrder = null;
  if (providerOrderId) localOrder = await findOrderByProviderOrderId(providerOrderId);
  if (!localOrder && notesOrderId) {
    const [[row]] = await (await import("../config/db.js")).db.query(
      "SELECT * FROM website_orders WHERE id = ?",
      [notesOrderId]
    );
    localOrder = row || null;
  }

  await recordPaymentEvent({
    orderId: localOrder?.id ?? null,
    eventType: type || "unknown",
    providerOrderId,
    providerPaymentId: payment?.id || refund?.payment_id || null,
    providerEventId: eventId,
    amount: payment?.amount != null ? Number(payment.amount) / 100 : null,
    status: payment?.status || refund?.status || order?.status || null,
    source: "webhook",
    payload: event,
  });

  if (!localOrder) {
    console.warn(`[webhook/razorpay] ${type}: no matching local order (${providerOrderId})`);
    return;
  }

  switch (type) {
    case "payment.captured":
    case "order.paid":
      await markOrderPaid({
        orderId: localOrder.id,
        paymentId: payment?.id || null,
        source: "webhook",
      });
      break;

    case "payment.failed":
      await markOrderPaymentFailed({
        orderId: localOrder.id,
        paymentId: payment?.id || null,
        reason: payment?.error_description || payment?.error_reason || "Payment failed",
        source: "webhook",
      });
      break;

    case "refund.processed":
    case "refund.created":
      await markOrderRefunded({
        orderId: localOrder.id,
        paymentId: refund?.payment_id || null,
        amount: refund?.amount != null ? Number(refund.amount) / 100 : null,
        source: "webhook",
      });
      break;

    default:
      // Logged above; nothing else to do.
      break;
  }
}

export default router;
