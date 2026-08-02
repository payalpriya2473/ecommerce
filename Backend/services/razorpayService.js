// services/razorpayService.js
// Thin Razorpay REST client + signature helpers.
//
// Deliberately dependency-free: it talks to Razorpay over plain fetch with
// HTTP Basic auth, so there is no `npm i razorpay` step and nothing new can
// break the server on boot. Node 18+ provides global fetch.

import crypto from "crypto";

const RAZORPAY_API = "https://api.razorpay.com/v1";

export function getRazorpayConfig() {
  const keyId = (process.env.RAZORPAY_KEY_ID || "").trim();
  const keySecret = (process.env.RAZORPAY_KEY_SECRET || "").trim();
  const webhookSecret = (process.env.RAZORPAY_WEBHOOK_SECRET || "").trim();

  return {
    keyId,
    keySecret,
    webhookSecret,
    configured: Boolean(keyId && keySecret),
    // rzp_test_… vs rzp_live_… — handy for showing a "TEST MODE" ribbon
    mode: keyId.startsWith("rzp_live") ? "live" : "test",
  };
}

function authHeader() {
  const { keyId, keySecret } = getRazorpayConfig();
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}

async function razorpayFetch(path, { method = "GET", body } = {}) {
  const { configured } = getRazorpayConfig();
  if (!configured) {
    throw Object.assign(new Error("Razorpay is not configured on this server"), {
      code: "RAZORPAY_NOT_CONFIGURED",
    });
  }
  if (typeof fetch !== "function") {
    throw new Error("Node 18+ is required (global fetch is missing)");
  }

  const response = await fetch(`${RAZORPAY_API}${path}`, {
    method,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const description = payload?.error?.description || `Razorpay request failed (${response.status})`;
    throw Object.assign(new Error(description), {
      code: payload?.error?.code || "RAZORPAY_ERROR",
      status: response.status,
      razorpayError: payload?.error,
    });
  }

  return payload;
}

/** Rupees (decimal) → paise (integer), which is what Razorpay expects. */
export function toPaise(amount) {
  return Math.round((Number(amount) || 0) * 100);
}

/**
 * Create a Razorpay order.
 * @param {{ amount: number, receipt: string, notes?: object, currency?: string }} input
 */
export function createRazorpayOrder({ amount, receipt, notes = {}, currency = "INR" }) {
  return razorpayFetch("/orders", {
    method: "POST",
    body: {
      amount: toPaise(amount),
      currency,
      receipt: String(receipt).slice(0, 40),
      notes,
      payment_capture: 1,
    },
  });
}

export function fetchRazorpayPayment(paymentId) {
  return razorpayFetch(`/payments/${paymentId}`);
}

export function refundRazorpayPayment(paymentId, amount) {
  return razorpayFetch(`/payments/${paymentId}/refund`, {
    method: "POST",
    body: amount ? { amount: toPaise(amount) } : {},
  });
}

/**
 * Checkout callback signature: HMAC_SHA256(order_id + "|" + payment_id, key_secret)
 */
export function isValidPaymentSignature({ razorpayOrderId, razorpayPaymentId, signature }) {
  const { keySecret } = getRazorpayConfig();
  if (!keySecret || !razorpayOrderId || !razorpayPaymentId || !signature) return false;

  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");

  return timingSafeEqual(expected, signature);
}

/**
 * Webhook signature: HMAC_SHA256(raw request body, webhook_secret)
 */
export function isValidWebhookSignature(rawBody, signature) {
  const { webhookSecret } = getRazorpayConfig();
  if (!webhookSecret || !signature || !rawBody) return false;

  const expected = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");

  return timingSafeEqual(expected, signature);
}

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
