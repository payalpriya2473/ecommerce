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

import { db } from "../config/db.js";
import { sendEmail } from "../controllers/emailConfigController.js";
import { getStoreSettings } from "./storeSettings.js";
import { getInvoicePdf } from "./invoice.js";

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
  const [[order]] = await db.query(
    `SELECT o.*, c.email AS customerEmail, c.firstName AS customerFirstName
       FROM website_orders o LEFT JOIN website_customers c ON c.id = o.customerId
      WHERE o.id = ?`,
    [orderId]
  );
  if (!order) return null;
  const [items] = await db
    .query(`SELECT oi.*, ${ORDER_ITEM_IMAGE_SQL} AS image FROM website_order_items oi WHERE oi.orderId = ? ORDER BY oi.id`, [orderId])
    .catch(() => db.query("SELECT oi.*, oi.primaryImage AS image FROM website_order_items oi WHERE oi.orderId = ? ORDER BY oi.id", [orderId]));
  return { order, items };
}

async function logNotification(orderId, event, audience, recipient, status, error = null) {
  try {
    await db.query(
      `INSERT INTO website_order_notifications (orderId, event, audience, recipient, status, error)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [orderId, event, audience, recipient ? String(recipient).slice(0, 500) : null, status, error ? String(error).slice(0, 500) : null]
    );
  } catch (e) {
    if (e?.code !== "ER_NO_SUCH_TABLE") console.error("[order-email/log]", e.message);
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
  const no = order.orderNumber;
  const total = inr(order.totalAmount);
  const paidOnline = order.paymentProvider === "razorpay" && ["paid", "refunded"].includes(order.paymentStatus);
  const refundLine = paidOnline
    ? extra.refundStarted === false
      ? "Our team will process your refund shortly and email you once it's initiated."
      : `Your refund of ${total} has been initiated to your original payment method and usually reaches you in 5–7 working days.`
    : order.paymentMethod === "cod" && order.paymentStatus === "paid"
      ? "Our team will contact you to arrange your refund."
      : "";

  switch (event) {
    case "placed":
      return {
        subject: `Order placed: ${no}`,
        title: "Thank you for your order!",
        lines: [
          `We've received your order <b>${escapeHtml(no)}</b>. We'll email you again as soon as it's confirmed.`,
          isCodDue(order) ? `Payment: Cash on Delivery — please keep <b>${total}</b> ready at delivery.` : `Payment of <b>${total}</b> received. Thank you!`,
        ],
      };
    case "payment_failed":
      return {
        subject: `Payment not completed for order ${no}`,
        title: "Your payment didn't go through",
        lines: [
          `We couldn't complete the payment for order <b>${escapeHtml(no)}</b>. No money has been taken — if an amount was debited, your bank will reverse it automatically.`,
          "You can try again from <b>My Orders</b>, or place the order again with Cash on Delivery.",
        ],
      };
    case "confirmed":
      return {
        subject: `Order confirmed: ${no}`,
        title: "Your order is confirmed",
        lines: [`Good news! Order <b>${escapeHtml(no)}</b> is confirmed and we're getting it ready for dispatch.`],
      };
    case "packed":
      return {
        subject: `Order packed: ${no}`,
        title: "Your order is packed",
        lines: [`Order <b>${escapeHtml(no)}</b> is packed and will be handed over to our courier partner shortly.`],
      };
    case "shipped":
      return {
        subject: `Shipped: your order ${no} is on the way`,
        title: "Your order is on the way!",
        lines: [
          `Order <b>${escapeHtml(no)}</b> has been shipped.`,
          isCodDue(order) ? `Please keep <b>${total}</b> ready for Cash on Delivery.` : "",
          extra.invoiceAttached ? `Your GST invoice <b>${escapeHtml(order.invoiceNumber || "")}</b> is attached to this email.` : "",
        ],
        tracking: true,
      };
    case "out_for_delivery":
      return {
        subject: `Out for delivery today: ${no}`,
        title: "Arriving today",
        lines: [
          `Order <b>${escapeHtml(no)}</b> is out for delivery. Please keep your phone reachable.`,
          isCodDue(order) ? `Cash on Delivery amount: <b>${total}</b>.` : "",
        ],
        tracking: true,
      };
    case "delivered":
      return {
        subject: `Delivered: ${no}`,
        title: "Your order has been delivered",
        lines: [
          `Order <b>${escapeHtml(no)}</b> has been delivered. We hope you love it!`,
          order.paymentMethod === "cod" ? `We've received your Cash on Delivery payment of <b>${total}</b>.` : "",
          "Need help with installation, warranty or a return? Just reply to this email.",
        ],
      };
    case "cancelled":
      return {
        subject: `Order cancelled: ${no}`,
        title: "Your order has been cancelled",
        lines: [
          extra.byCustomer
            ? `As requested, order <b>${escapeHtml(no)}</b> has been cancelled.`
            : `Order <b>${escapeHtml(no)}</b> has been cancelled by AppleNext${order.cancelReason ? `: ${escapeHtml(order.cancelReason)}` : "."}`,
          refundLine,
        ],
      };
    case "returned":
      return {
        subject: `Return processed: ${no}`,
        title: "Your return has been processed",
        lines: [`We've received the returned items for order <b>${escapeHtml(no)}</b>.`, refundLine],
      };
    case "refund_initiated":
      return {
        subject: `Refund initiated for order ${no}`,
        title: "Your refund is on its way",
        lines: [`A refund of <b>${total}</b> for order <b>${escapeHtml(no)}</b> has been initiated to your original payment method. It usually reaches you in 5–7 working days.`],
      };
    case "refunded":
      return {
        subject: `Refund completed for order ${no}`,
        title: "Refund completed",
        lines: [`The refund of <b>${inr(extra.amount ?? order.totalAmount)}</b> for order <b>${escapeHtml(no)}</b> has been processed by our payment partner.`],
      };
    default:
      return null;
  }
}

function storeCopy(event, order, extra) {
  const no = order.orderNumber;
  switch (event) {
    case "placed":
      return {
        subject: `New order ${no} — ${inr(order.totalAmount)} (${order.paymentMethod === "cod" ? "COD" : "Paid online"})`,
        title: "New website order",
        lines: [`Order <b>${escapeHtml(no)}</b> is waiting to be confirmed.`],
      };
    case "cancelled":
      if (!extra.byCustomer) return null;
      return {
        subject: `Order ${no} cancelled by customer`,
        title: "Order cancelled by customer",
        lines: [
          `The customer cancelled order <b>${escapeHtml(no)}</b>${order.cancelReason ? ` (${escapeHtml(order.cancelReason)})` : ""}.`,
          order.paymentProvider === "razorpay" && order.paymentStatus === "paid" ? "An online refund was triggered — check its status in Online Orders." : "",
        ],
      };
    case "payment_issue":
      return {
        subject: `Payment attention needed: order ${no}`,
        title: "Payment needs attention",
        lines: [escapeHtml(extra.message || "Please check the payment log for this order.")],
      };
    default:
      return null;
  }
}

// ─── HTML ───────────────────────────────────────────────────────────────────

function renderEmail({ copy, order, items, store, audience }) {
  const site = siteUrl(store);
  const brand = escapeHtml(store.tradeName || "AppleNext");
  const cta =
    audience === "store"
      ? { href: `${adminUrl(store)}/online-orders/view?id=${order.id}`, label: "Open in admin" }
      : { href: `${site}/account#orders`, label: "View my order" };

  const itemRows = items
    .map((it) => {
      const img = emailImage(it.image, store);
      return `<tr>
        <td style="padding:10px 0;border-bottom:1px solid #eee;width:64px;vertical-align:top;">
          ${img ? `<img src="${escapeHtml(img)}" width="56" height="56" alt="" style="display:block;border:1px solid #eee;border-radius:8px;object-fit:contain;background:#fff;">` : ""}
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;vertical-align:top;font-size:14px;color:#111;">
          <div style="font-weight:600;">${escapeHtml(it.itemName)}</div>
          <div style="font-size:12px;color:#6b7280;">${escapeHtml([it.variant, it.colorName].filter(Boolean).join(" · "))}${it.variant || it.colorName ? " · " : ""}Qty ${Number(it.qty) || 1}</div>
        </td>
        <td style="padding:10px 0;border-bottom:1px solid #eee;vertical-align:top;text-align:right;font-size:14px;color:#111;white-space:nowrap;">${inr(it.lineTotal)}</td>
      </tr>`;
    })
    .join("");

  const discount = Number(order.couponDiscount || 0) + Number(order.platformDiscount || 0);
  const charges = Number(order.deliveryCharge || 0) + Number(order.codFee || 0);
  const totalsRows = [
    ["Subtotal", inr(order.subtotal)],
    discount > 0 ? ["Discount", `− ${inr(discount)}`] : null,
    charges > 0 ? ["Delivery / COD charges", inr(charges)] : null,
    ["Total (incl. GST)", `<b>${inr(order.totalAmount)}</b>`],
  ]
    .filter(Boolean)
    .map(([k, v]) => `<tr><td style="padding:3px 0;font-size:13px;color:#6b7280;">${k}</td><td style="padding:3px 0;font-size:13px;color:#111;text-align:right;">${v}</td></tr>`)
    .join("");

  const tracking =
    copy.tracking && order.trackingNumber
      ? `<div style="margin:18px 0;padding:14px 16px;border:1px solid #fde2e4;background:#fff7f8;border-radius:10px;font-size:14px;color:#111;">
          <div><b>Courier:</b> ${escapeHtml(order.courierName || "-")}</div>
          <div><b>Tracking / AWB:</b> ${escapeHtml(order.trackingNumber)}</div>
          ${order.trackingUrl ? `<div style="margin-top:8px;"><a href="${escapeHtml(order.trackingUrl)}" style="color:#c8102e;font-weight:600;">Track your shipment →</a></div>` : ""}
        </div>`
      : "";

  const address = [
    order.shipName,
    order.shipLine1,
    order.shipLine2,
    [order.shipCity, order.shipState, order.shipPinCode].filter(Boolean).join(", "),
    order.shipPhone,
  ]
    .filter(Boolean)
    .map(escapeHtml)
    .join("<br>");

  const greeting =
    audience === "customer" ? `<p style="margin:0 0 12px;font-size:15px;color:#111;">Hi ${escapeHtml(order.customerFirstName || order.shipName || "there")},</p>` : "";

  const html = `<!doctype html><html><body style="margin:0;background:#f5f5f7;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #eee;">
    <div style="background:#c8102e;padding:20px 24px;color:#fff;">
      <div style="font-size:22px;font-weight:700;letter-spacing:.5px;">${brand}</div>
      <div style="font-size:12px;opacity:.9;margin-top:2px;">Order ${escapeHtml(order.orderNumber)}</div>
    </div>
    <div style="padding:24px;">
      <h1 style="margin:0 0 14px;font-size:20px;color:#111;">${escapeHtml(copy.title)}</h1>
      ${greeting}
      ${copy.lines.filter(Boolean).map((l) => `<p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:#374151;">${l}</p>`).join("")}
      ${tracking}
      <div style="margin:20px 0;"><a href="${escapeHtml(cta.href)}" style="display:inline-block;background:#c8102e;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 20px;border-radius:8px;">${cta.label}</a></div>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:8px;">${itemRows}</table>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:10px;">${totalsRows}</table>
      ${address ? `<div style="margin-top:18px;font-size:13px;color:#374151;"><div style="font-weight:700;color:#111;margin-bottom:4px;">Delivery address</div>${address}</div>` : ""}
    </div>
    <div style="padding:16px 24px;border-top:1px solid #eee;font-size:12px;color:#9ca3af;">
      ${brand}${store.phone ? ` · ${escapeHtml(store.phone)}` : ""}${store.email ? ` · ${escapeHtml(store.email)}` : ""} · <a href="${escapeHtml(site)}" style="color:#9ca3af;">${escapeHtml(site.replace(/^https?:\/\//, ""))}</a>
    </div>
  </div></body></html>`;

  const text = [copy.title, "", ...copy.lines.filter(Boolean).map((l) => l.replace(/<[^>]+>/g, "")), "", `${cta.label}: ${cta.href}`].join("\n");
  return { html, text };
}

// ─── Send ───────────────────────────────────────────────────────────────────

async function deliver({ orderId, event, audience, to, subject, html, text, attachments, replyTo }) {
  try {
    const info = await sendEmail({ to, subject, html, text, attachments, replyTo });
    if (info?.rejected?.length) throw new Error(`Rejected: ${info.rejected.join(", ")}`);
    await logNotification(orderId, event, audience, to, "sent");
    return { status: "sent" };
  } catch (e) {
    console.error(`[order-email] ${event} (${audience}) for order ${orderId} failed:`, e.message);
    await logNotification(orderId, event, audience, to, "failed", e.message);
    return { status: "failed", error: e.message };
  }
}

/**
 * Send the emails for an order event. Resolves with a per-audience result.
 * options.force = true re-sends even if this event was already emailed.
 */
export async function sendOrderEmails(orderId, event, extra = {}, { force = false } = {}) {
  const loaded = await loadOrder(orderId);
  if (!loaded) return {};
  const { order, items } = loaded;
  const store = await getStoreSettings();
  const result = {};

  // Customer
  const cCopy = customerCopy(event, order, extra);
  if (cCopy) {
    if (!store.sendCustomerEmails) {
      result.customer = { status: "skipped", reason: "Customer emails are switched off in Online Store settings" };
    } else if (!force && ONCE.has(event) && (await alreadySent(order.id, event, "customer"))) {
      result.customer = { status: "skipped", reason: "already sent" };
    } else if (!order.customerEmail) {
      result.customer = { status: "skipped", reason: "Customer has no email address on their account" };
      await logNotification(order.id, event, "customer", null, "skipped", result.customer.reason);
    } else {
      const attachments = [];
      if (event === "shipped" && order.invoiceNumber) {
        try {
          const { pdf, filename } = await getInvoicePdf(order.id);
          attachments.push({ filename, content: pdf, contentType: "application/pdf" });
          extra = { ...extra, invoiceAttached: true };
        } catch (e) {
          console.error(`[order-email] invoice for order ${order.id} not attached:`, e.message);
        }
      }
      const copy = customerCopy(event, order, extra);
      const { html, text } = renderEmail({ copy, order, items, store, audience: "customer" });
      result.customer = await deliver({
        orderId: order.id,
        event,
        audience: "customer",
        to: order.customerEmail,
        subject: copy.subject,
        html,
        text,
        attachments,
        replyTo: store.email || undefined,
      });
    }
  }

  // Store
  const sCopy = storeCopy(event, order, extra);
  const storeTo = String(store.alertEmail || "")
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(", ");
  if (sCopy && storeTo) {
    if (!force && ONCE.has(event) && (await alreadySent(order.id, event, "store"))) {
      result.store = { status: "skipped", reason: "already sent" };
    } else {
      const { html, text } = renderEmail({ copy: sCopy, order, items, store, audience: "store" });
      result.store = await deliver({ orderId: order.id, event, audience: "store", to: storeTo, subject: sCopy.subject, html, text });
    }
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
export { renderEmail as _renderEmail, customerCopy as _customerCopy, storeCopy as _storeCopy };
