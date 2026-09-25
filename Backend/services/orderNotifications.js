// services/orderNotifications.js
// Order emails. Every order event goes through notifyOrder(orderId, event):
//
//  Event              When                                         Customer  Store
//  ─────────────────  ───────────────────────────────────────────  ────────  ─────
//  placed             COD order placed / online payment captured      ✓        ✓ (new order)
//  payment_failed     Razorpay payment failed                         ✓
//  confirmed          Admin → Confirm                                 ✓
//  packed             Admin → Packed                                  ✓
//  shipped            Admin → Ship (GST invoice PDF attached)         ✓
//  out_for_delivery   Admin → Out for Delivery                        ✓
//  delivered          Admin → Delivered                               ✓
//  cancelled          Customer or admin cancels                       ✓        ✓ (if by customer)
//  returned           Admin → Returned                                ✓
//  refund_initiated   Razorpay refund started (admin retry)           ✓
//  refunded           Razorpay webhook: refund processed              ✓
//  payment_issue      Amount mismatch / paid after cancel / refund     –        ✓
//                     failed
//
// Emails go to the email on the customer's account (website_customers.email).
// Sending never blocks or fails the API call; every attempt is logged in
// website_order_notifications (sent / failed / skipped) and shown in admin.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { db } from "../config/db.js";
import { toStoredAssetPath } from "../utils/assetUrl.js";
import { sendEmail } from "../controllers/emailConfigController.js";
import { getStoreSettings } from "./storeSettings.js";
import { getInvoicePdf } from "./invoice.js";
import { renderOrderEmail, esc } from "./emailTemplates/orderEmail.js";

const ONCE = new Set(["placed", "confirmed", "packed", "shipped", "out_for_delivery", "delivered", "cancelled", "returned", "refunded"]);

export const CUSTOMER_EVENTS = [
  "placed", "payment_failed", "confirmed", "packed", "shipped", "out_for_delivery",
  "delivered", "cancelled", "returned", "refund_initiated", "refunded",
];

const escapeHtml = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const inr = (v) =>
  `₹${(Number(v) || 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

function siteUrl(store) {
  return String(process.env.WEBSITE_URL || store.website || "https://shop.applenext.in").replace(/\/+$/, "");
}
function adminUrl(store) {
  return String(process.env.ADMIN_URL || `${siteUrl(store)}/admin`).replace(/\/+$/, "");
}
/** Absolute image URL an email client can load (via the website's /backend-api proxy). */
function emailImage(value, store) {
  if (!value) return "";
  const v = String(value).replace(/\\/g, "/");
  if (/^https?:\/\//i.test(v) && !v.includes("localhost")) return v;
  const idx = v.indexOf("/uploads/");
  if (idx < 0) return "";
  return `${siteUrl(store)}/backend-api${v.slice(idx).split(/[?#]/)[0]}`;
}

// Order-line image, falling back to the colour / item gallery for old rows.
export const ORDER_ITEM_IMAGE_SQL = `COALESCE(
  NULLIF(oi.primaryImage, ''),
  (SELECT ivi.imageUrl FROM item_variant_colors ivc
     JOIN item_variant_images ivi ON ivi.itemVariantColorId = ivc.id
    WHERE ivc.itemId = oi.itemId AND (oi.colorName IS NULL OR oi.colorName = '' OR ivc.colorName = oi.colorName)
    ORDER BY ivc.sortOrder ASC, ivi.sortOrder ASC LIMIT 1),
  (SELECT ii.imageUrl FROM item_images ii WHERE ii.itemId = oi.itemId ORDER BY ii.sortOrder ASC LIMIT 1)
)`;

async function loadOrder(orderId) {
  // o.customerEmail = email snapshotted on the order at checkout (when the
  // column exists); accountEmail = the customer's current account email.
  const [[order]] = await db.query(
    `SELECT o.*, c.email AS accountEmail, c.firstName AS customerFirstName
       FROM website_orders o LEFT JOIN website_customers c ON c.id = o.customerId
      WHERE o.id = ?`,
    [orderId]
  );
  if (!order) return null;
  order.recipientEmail = String(order.customerEmail || order.accountEmail || "").trim() || null;
  const [items] = await db
    .query(`SELECT oi.*, ${ORDER_ITEM_IMAGE_SQL} AS image FROM website_order_items oi WHERE oi.orderId = ? ORDER BY oi.id`, [orderId])
    .catch(() => db.query("SELECT oi.*, oi.primaryImage AS image FROM website_order_items oi WHERE oi.orderId = ? ORDER BY oi.id", [orderId]));
  return { order, items };
}

// Failed sends are retried by the retry worker: 2, 10 and 60 minutes later.
export const RETRY_DELAYS_MIN = [2, 10, 60];

let retryColumns = null; // null = unknown, true/false after first insert
async function logNotification(orderId, event, audience, recipient, status, error = null, attempt = 1) {
  const base = [orderId, event, audience, recipient ? String(recipient).slice(0, 500) : null, status, error ? String(error).slice(0, 500) : null];
  const delay = RETRY_DELAYS_MIN[attempt - 1];
  try {
    if (retryColumns !== false) {
      try {
        await db.query(
          `INSERT INTO website_order_notifications
             (orderId, event, audience, recipient, status, error, attempts, nextRetryAt, retried)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
          [...base, attempt, status === "failed" && delay ? new Date(Date.now() + delay * 60000) : null]
        );
        retryColumns = true;
        return;
      } catch (e) {
        if (e?.code !== "ER_BAD_FIELD_ERROR") throw e;
        retryColumns = false; // retry columns not added yet — log without them
      }
    }
    await db.query(
      `INSERT INTO website_order_notifications (orderId, event, audience, recipient, status, error)
       VALUES (?, ?, ?, ?, ?, ?)`,
      base
    );
  } catch (e) {
    if (e?.code === "ER_NO_SUCH_TABLE") console.warn("[order-email] website_order_notifications table missing — run online_orders_invoice_email_queries.sql");
    else console.error("[order-email/log]", e.message);
  }
}

async function alreadySent(orderId, event, audience) {
  try {
    const [[row]] = await db.query(
      "SELECT id FROM website_order_notifications WHERE orderId = ? AND event = ? AND audience = ? AND status = 'sent' LIMIT 1",
      [orderId, event, audience]
    );
    return Boolean(row);
  } catch {
    return false;
  }
}

// Same email already being sent right now (e.g. payment callback + webhook
// arriving together) — never send twice in parallel.
const inFlight = new Set();

export async function listNotifications(orderId) {
  try {
    const [rows] = await db.query(
      "SELECT id, event, audience, recipient, status, error, createdAt FROM website_order_notifications WHERE orderId = ? ORDER BY createdAt ASC, id ASC",
      [orderId]
    );
    return rows;
  } catch {
    return [];
  }
}

// ─── Copy ───────────────────────────────────────────────────────────────────

function isCodDue(order) {
  return order.paymentMethod === "cod" && order.paymentStatus !== "paid";
}

function customerCopy(event, order, extra) {
  const no = esc(order.orderNumber);
  const total = inr(order.totalAmount);
  const codDue = isCodDue(order);
  const paidOnline = order.paymentProvider === "razorpay" && ["paid", "refunded"].includes(order.paymentStatus);
  const refundLine = paidOnline
    ? extra.refundStarted === false
      ? "Our team will process your refund shortly and email you once it's initiated."
      : `Your refund of <b>${total}</b> has been initiated to your original payment method and usually reaches you in 5–7 working days.`
    : order.paymentMethod === "cod" && order.paymentStatus === "paid"
      ? "Our team will contact you to arrange your refund."
      : "";
  const codTip = codDue
    ? { title: "Keep the exact amount ready", html: `Please keep <b>${total}</b> ready in cash or UPI when your order arrives.`, tone: "warn" }
    : null;
  const lifecycle = (o) => ({ showTimeline: true, tone: "brand", ...o });

  switch (event) {
    case "placed":
      return lifecycle({
        subject: `Order placed: ${order.orderNumber} — thank you for shopping with us`,
        preheader: `We've received your order ${order.orderNumber}. We'll confirm it shortly.`,
        eyebrow: "Order placed",
        statusLabel: "Order placed",
        title: "Thank you, your order is placed!",
        lines: [
          `We've received your order <b>${no}</b> and our team is reviewing it now. You'll get another email as soon as it's confirmed.`,
          codDue ? `You chose <b>Cash on Delivery</b> — nothing to pay until it arrives.` : `We've received your payment of <b>${total}</b>.`,
        ],
        tip: codTip,
        next: "We'll confirm your order, then pack and hand it to our courier partner. You'll hear from us at every step.",
        ctaLabel: "View order",
      });
    case "confirmed":
      return lifecycle({
        subject: `Order confirmed: ${order.orderNumber}`,
        preheader: `Good news! Your order ${order.orderNumber} is confirmed.`,
        eyebrow: "Order confirmed",
        statusLabel: "Confirmed",
        title: "Your order is confirmed",
        lines: [`Good news! Order <b>${no}</b> is confirmed and we're getting it ready for dispatch.`],
        tip: codTip,
        next: "Your items will be quality-checked and packed. We'll email you the moment it's packed.",
        ctaLabel: "Track order",
      });
    case "packed":
      return lifecycle({
        subject: `Order packed: ${order.orderNumber} is ready to ship`,
        preheader: `Your order ${order.orderNumber} is packed and ready for dispatch.`,
        eyebrow: "Packed",
        statusLabel: "Packed",
        title: "Your order is packed",
        lines: [`Order <b>${no}</b> has been carefully packed and will be handed over to our courier partner shortly.`],
        tip: codTip,
        next: "Once it's shipped you'll receive the courier name, tracking ID and your GST invoice.",
        ctaLabel: "Track order",
      });
    case "shipped":
      return lifecycle({
        subject: `Shipped: your order ${order.orderNumber} is on the way`,
        preheader: `Your order ${order.orderNumber} has been shipped${order.courierName ? ` via ${order.courierName}` : ""}.`,
        eyebrow: "Shipped",
        statusLabel: "Shipped",
        title: "Your order is on the way!",
        lines: [
          `Order <b>${no}</b> has left our store${order.courierName ? ` with <b>${esc(order.courierName)}</b>` : ""}.`,
          extra.invoiceAttached ? `Your GST invoice <b>${esc(order.invoiceNumber || "")}</b> is attached to this email.` : "",
        ],
        tracking: true,
        tip: codTip,
        next: "We'll let you know when it's out for delivery in your area.",
        ctaLabel: "Track order",
      });
    case "out_for_delivery":
      return lifecycle({
        subject: `Arriving today: ${order.orderNumber} is out for delivery`,
        preheader: `Your order ${order.orderNumber} is out for delivery today.`,
        eyebrow: "Out for delivery",
        statusLabel: "Out for delivery",
        title: "Your order is arriving today",
        lines: [`Our delivery partner is on the way with order <b>${no}</b>. Please keep your phone reachable${order.shipPhone ? ` on <b>${esc(order.shipPhone)}</b>` : ""}.`],
        tracking: true,
        tip: codDue
          ? { title: "Payment on delivery", html: `Please keep <b>${total}</b> ready in cash or UPI. Kindly check the package before accepting it.`, tone: "warn" }
          : { title: "Before you accept", html: "Please check that the package is sealed and undamaged before accepting it. Share the delivery OTP only with the delivery agent at your door.", tone: "warn" },
        next: "We'll send a confirmation as soon as your order is delivered.",
        ctaLabel: "Track order",
      });
    case "delivered":
      return lifecycle({
        subject: `Delivered: ${order.orderNumber} — enjoy your purchase!`,
        preheader: `Your order ${order.orderNumber} has been delivered.`,
        eyebrow: "Delivered",
        statusLabel: "Delivered",
        tone: "success",
        title: "Your order has been delivered",
        lines: [
          `Order <b>${no}</b> was delivered${order.deliveredAt ? ` on <b>${esc(new Date(order.deliveredAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", timeZone: "Asia/Kolkata" }))}</b>` : ""}. We hope you love it!`,
          order.paymentMethod === "cod" ? `We've received your payment of <b>${total}</b>. Thank you!` : "",
        ],
        tip: { title: "Keep your invoice safe", html: "Your GST invoice is available in <b>My Orders</b> and is needed for warranty claims and service.", tone: "success" },
        next: "Need installation, a demo or warranty help? Just reply to this email and our team will assist you.",
        ctaLabel: "View order & invoice",
      });
    case "payment_failed":
      return {
        subject: `Payment not completed for order ${order.orderNumber}`,
        preheader: "Your payment didn't go through — your order is saved.",
        eyebrow: "Payment failed",
        statusLabel: "Payment failed",
        tone: "danger",
        title: "Your payment didn't go through",
        lines: [`We couldn't complete the payment for order <b>${no}</b>. No money has been taken — if an amount was debited, your bank will reverse it automatically.`],
        tip: { title: "What you can do", html: "Try the payment again from <b>My Orders</b>, or place the order again with Cash on Delivery.", tone: "danger" },
        next: "Your order is saved for now. Complete the payment to confirm it.",
        ctaLabel: "Retry payment",
      };
    case "cancelled":
      return {
        subject: `Order cancelled: ${order.orderNumber}`,
        preheader: `Your order ${order.orderNumber} has been cancelled.`,
        eyebrow: "Cancelled",
        statusLabel: "Cancelled",
        tone: "danger",
        title: "Your order has been cancelled",
        lines: [
          extra.byCustomer
            ? `As requested, order <b>${no}</b> has been cancelled.`
            : `Order <b>${no}</b> has been cancelled${order.cancelReason ? `: ${esc(order.cancelReason)}` : "."}`,
          refundLine,
        ],
        next: refundLine ? "We'll email you again once the refund is completed." : "You can place a new order anytime.",
        ctaLabel: "View order",
      };
    case "returned":
      return {
        subject: `Return processed: ${order.orderNumber}`,
        preheader: `We've received your return for ${order.orderNumber}.`,
        eyebrow: "Returned",
        statusLabel: "Returned",
        tone: "warn",
        title: "Your return has been processed",
        lines: [`We've received the returned items for order <b>${no}</b>.`, refundLine],
        next: refundLine ? "We'll email you once the refund is completed." : "Thank you for shopping with us.",
        ctaLabel: "View order",
      };
    case "refund_initiated":
      return {
        subject: `Refund initiated for order ${order.orderNumber}`,
        preheader: `Refund of ${total} initiated.`,
        eyebrow: "Refund initiated",
        statusLabel: "Refund initiated",
        tone: "success",
        title: "Your refund is on its way",
        lines: [`A refund of <b>${total}</b> for order <b>${no}</b> has been initiated to your original payment method. It usually reaches you in 5–7 working days.`],
        next: "We'll email you once your bank confirms the refund.",
        ctaLabel: "View order",
      };
    case "refunded":
      return {
        subject: `Refund completed for order ${order.orderNumber}`,
        preheader: `Your refund for ${order.orderNumber} is complete.`,
        eyebrow: "Refunded",
        statusLabel: "Refunded",
        tone: "success",
        title: "Refund completed",
        lines: [`The refund of <b>${inr(extra.amount ?? order.totalAmount)}</b> for order <b>${no}</b> has been processed by our payment partner.`],
        next: "It may take a day or two to appear in your statement depending on your bank.",
        ctaLabel: "View order",
      };
    default:
      return null;
  }
}

function storeCopy(event, order, extra) {
  const no = esc(order.orderNumber);
  switch (event) {
    case "placed":
      return {
        subject: `New order ${order.orderNumber} — ${inr(order.totalAmount)} (${order.paymentMethod === "cod" ? "COD" : "Paid online"})`,
        preheader: `New website order ${order.orderNumber} is waiting to be confirmed.`,
        eyebrow: "New order",
        statusLabel: "Awaiting confirmation",
        title: "New website order",
        lines: [`Order <b>${no}</b> is waiting to be confirmed. Check stock and confirm it in Online Orders.`],
        ctaLabel: "Open in admin",
      };
    case "cancelled":
      if (!extra.byCustomer) return null;
      return {
        subject: `Order ${order.orderNumber} cancelled by customer`,
        eyebrow: "Cancelled by customer",
        statusLabel: "Cancelled",
        tone: "danger",
        title: "Order cancelled by customer",
        lines: [
          `The customer cancelled order <b>${no}</b>${order.cancelReason ? ` (${esc(order.cancelReason)})` : ""}.`,
          order.paymentProvider === "razorpay" && order.paymentStatus === "paid" ? "An online refund was triggered — check its status in Online Orders." : "",
        ],
        ctaLabel: "Open in admin",
      };
    case "payment_issue":
      return {
        subject: `Payment attention needed: order ${order.orderNumber}`,
        eyebrow: "Action needed",
        statusLabel: "Payment issue",
        tone: "danger",
        title: "Payment needs attention",
        lines: [esc(extra.message || "Please check the payment log for this order.")],
        ctaLabel: "Open in admin",
      };
    default:
      return null;
  }
}

// ─── HTML ───────────────────────────────────────────────────────────────────

// Images are embedded in the email itself (CID attachments) so they show in
// Gmail/Outlook even when the site is on localhost or not publicly reachable.
const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOGO_FILE = path.join(BACKEND_DIR, "assets", "email-logo.png");
const MAX_INLINE_BYTES = 1.5 * 1024 * 1024;
const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" };

/** Local file for an uploaded image (/uploads/...), searching both upload roots. */
function localUploadFile(value) {
  const stored = toStoredAssetPath(value);
  if (!stored || !stored.startsWith("/uploads/") || stored.includes("..")) return null;
  for (const root of [process.cwd(), BACKEND_DIR]) {
    const file = path.join(root, stored);
    try {
      const st = fs.statSync(file);
      if (st.isFile() && st.size <= MAX_INLINE_BYTES && MIME[path.extname(file).toLowerCase()]) return file;
    } catch {
      /* try next root */
    }
  }
  return null;
}

function renderEmail({ copy, order, items, store, audience, inline = [] }) {
  const site = siteUrl(store);
  const embed = (file, cid) => {
    if (!inline.some((a) => a.cid === cid)) {
      inline.push({ filename: path.basename(file), path: file, cid, contentDisposition: "inline", contentType: MIME[path.extname(file).toLowerCase()] });
    }
    return `cid:${cid}`;
  };
  let n = 0;
  const imageUrl = (v) => {
    const file = localUploadFile(v);
    if (file) return embed(file, `item-${++n}@applenext`);
    return emailImage(v, store); // external / public URL fallback
  };
  const logo = fs.existsSync(LOGO_FILE) ? embed(LOGO_FILE, "logo@applenext") : `${site}/applenext_logo.png`;
  return renderOrderEmail({
    copy,
    order,
    items,
    store,
    audience,
    imageUrl,
    links: {
      site,
      logo,
      help: `${site}/faq`,
      cta: audience === "store" ? `${adminUrl(store)}/online-orders/view?id=${order.id}` : `${site}/account#orders`,
    },
  });
}

// ─── Send ───────────────────────────────────────────────────────────────────

async function deliver({ orderId, event, audience, to, subject, html, text, attachments, replyTo, attempt = 1 }) {
  try {
    const info = await sendEmail({ to, subject, html, text, attachments, replyTo });
    if (info?.rejected?.length) throw new Error(`Rejected by mail server: ${info.rejected.join(", ")}`);
    await logNotification(orderId, event, audience, to, "sent", null, attempt);
    console.log(`[order-email] ${event} (${audience}) for order ${orderId} sent to ${to}`);
    return { status: "sent" };
  } catch (e) {
    console.error(`[order-email] ${event} (${audience}) for order ${orderId} failed (attempt ${attempt}):`, e.message);
    await logNotification(orderId, event, audience, to, "failed", e.message, attempt);
    return { status: "failed", error: e.message };
  }
}

/**
 * Send the emails for an order event. Resolves with a per-audience result.
 * options.force = true re-sends even if this event was already emailed.
 */
export async function sendOrderEmails(orderId, event, extra = {}, { force = false, only = null, attempt = 1 } = {}) {
  const loaded = await loadOrder(orderId);
  if (!loaded) return {};
  const { order, items } = loaded;
  const store = await getStoreSettings();
  const result = {};

  const withLock = async (audience, fn) => {
    const key = `${order.id}:${event}:${audience}`;
    if (inFlight.has(key)) return { status: "skipped", reason: "already being sent" };
    inFlight.add(key);
    try {
      return await fn();
    } finally {
      inFlight.delete(key);
    }
  };

  // Customer
  const cCopy = (!only || only === "customer") && customerCopy(event, order, extra);
  if (cCopy) {
    result.customer = await withLock("customer", async () => {
      if (!store.sendCustomerEmails) {
        return { status: "skipped", reason: "Customer emails are switched off in Settings → Online Store" };
      }
      if (!force && ONCE.has(event) && (await alreadySent(order.id, event, "customer"))) {
        return { status: "skipped", reason: "already sent" };
      }
      if (!order.recipientEmail) {
        const reason = "Customer has no email address on the order or account";
        await logNotification(order.id, event, "customer", null, "skipped", reason);
        return { status: "skipped", reason };
      }
      const attachments = [];
      let ex = extra;
      if (event === "shipped" && order.invoiceNumber) {
        try {
          const { pdf, filename } = await getInvoicePdf(order.id);
          attachments.push({ filename, content: pdf, contentType: "application/pdf" });
          ex = { ...extra, invoiceAttached: true };
        } catch (e) {
          console.error(`[order-email] invoice for order ${order.id} not attached:`, e.message);
        }
      }
      const copy = customerCopy(event, order, ex);
      const inline = [];
      const { html, text } = renderEmail({ copy, order, items, store, audience: "customer", inline });
      attachments.push(...inline);
      return deliver({
        orderId: order.id,
        event,
        audience: "customer",
        to: order.recipientEmail,
        subject: copy.subject,
        html,
        text,
        attachments,
        replyTo: store.email || undefined,
        attempt,
      });
    });
  }

  // Store
  const sCopy = (!only || only === "store") && storeCopy(event, order, extra);
  const storeTo = String(store.alertEmail || "")
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .join(", ");
  if (sCopy && storeTo) {
    result.store = await withLock("store", async () => {
      if (!force && ONCE.has(event) && (await alreadySent(order.id, event, "store"))) {
        return { status: "skipped", reason: "already sent" };
      }
      const inline = [];
      const { html, text } = renderEmail({ copy: sCopy, order, items, store, audience: "store", inline });
      return deliver({ orderId: order.id, event, audience: "store", to: storeTo, subject: sCopy.subject, html, text, attachments: inline, attempt });
    });
  }
  return result;
}

/** Fire-and-forget: never throws, never delays the API response. */
export function notifyOrder(orderId, event, extra = {}) {
  if (!orderId || !event) return;
  setImmediate(() => {
    sendOrderEmails(orderId, event, extra).catch((e) => console.error(`[order-email] ${event} for order ${orderId}:`, e.message));
  });
}
/**
 * Retry worker — re-sends failed emails (2, 10, 60 minutes after each failure)
 * unless a later attempt already succeeded. Needs the attempts / nextRetryAt /
 * retried columns (online_orders_email_retry_queries.sql); disables itself
 * quietly when they are missing.
 */
let retryTimer = null;
export function startOrderEmailRetryWorker(intervalMs = 60000) {
  if (retryTimer) return;
  const tick = async () => {
    try {
      const [due] = await db.query(
        `SELECT n.id, n.orderId, n.event, n.audience, n.attempts
           FROM website_order_notifications n
          WHERE n.status = 'failed' AND n.retried = 0 AND n.nextRetryAt IS NOT NULL AND n.nextRetryAt <= NOW()
          ORDER BY n.nextRetryAt ASC
          LIMIT 20`
      );
      for (const row of due) {
        await db.query("UPDATE website_order_notifications SET retried = 1 WHERE id = ?", [row.id]);
        if (await alreadySent(row.orderId, row.event, row.audience)) continue;
        await sendOrderEmails(row.orderId, row.event, {}, { only: row.audience, attempt: Number(row.attempts) + 1 });
      }
    } catch (e) {
      if (e?.code === "ER_BAD_FIELD_ERROR" || e?.code === "ER_NO_SUCH_TABLE") {
        console.warn("[order-email] retry worker off — run online_orders_email_retry_queries.sql to enable automatic retries");
        clearInterval(retryTimer);
        return;
      }
      console.error("[order-email/retry]", e.message);
    }
  };
  retryTimer = setInterval(tick, intervalMs);
  retryTimer.unref?.();
  setTimeout(tick, 15000).unref?.();
}

export { renderEmail as _renderEmail, customerCopy as _customerCopy, storeCopy as _storeCopy };
