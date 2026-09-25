// services/emailTemplates/orderEmail.js
// One responsive, email-client-safe layout for every order email
// (placed → confirmed → packed → shipped → out for delivery → delivered,
// plus cancelled / returned / refunds and store alerts).
//
// Email-client rules followed here:
//   • table layout only (no flex/grid), all styles inline, web-safe fonts
//   • 600px centred container with an Outlook (MSO) ghost table
//   • bulletproof buttons (table cell with bgcolor), no background images
//   • images always have width/height/alt, content still reads with images off
//   • a small <style> block only for mobile tweaks and link colour resets —
//     everything still works if a client strips it

const C = {
  brand: "#C8102E",
  brandDark: "#9E0C24",
  tint: "#FFF3F4",
  ink: "#141414",
  body: "#3F3F46",
  muted: "#71717A",
  line: "#ECECEE",
  bg: "#F4F4F5",
  card: "#FFFFFF",
  success: "#15803D",
  successTint: "#ECFDF3",
  warn: "#B45309",
  warnTint: "#FFF7E6",
  danger: "#B91C1C",
  dangerTint: "#FEF2F2",
};
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const TONES = {
  brand: { accent: C.brand, tint: C.tint },
  success: { accent: C.success, tint: C.successTint },
  warn: { accent: C.warn, tint: C.warnTint },
  danger: { accent: C.danger, tint: C.dangerTint },
};

export const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const inr = (v) => `₹${(Number(v) || 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const fmtDate = (d, withTime = false) =>
  d
    ? new Date(d).toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        ...(withTime ? { hour: "numeric", minute: "2-digit" } : { year: "numeric" }),
        timeZone: "Asia/Kolkata",
      })
    : "";
const PAYMENT = { cod: "Cash on Delivery", upi: "UPI", card: "Card", netbanking: "Net Banking", wallet: "Wallet", emi: "EMI" };

// ─── building blocks ────────────────────────────────────────────────────────

const spacer = (h) =>
  `<tr><td style="height:${h}px;line-height:${h}px;font-size:${h}px;">&nbsp;</td></tr>`;

const divider = () =>
  `<tr><td class="px" style="padding:0 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid ${C.line};height:1px;line-height:1px;font-size:1px;">&nbsp;</td></tr></table></td></tr>`;

const sectionTitle = (text) =>
  `<div style="font-family:${FONT};font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${C.muted};margin:0 0 12px;">${esc(text)}</div>`;

function button(href, label, { color = C.brand, outline = false } = {}) {
  const bg = outline ? C.card : color;
  const fg = outline ? color : "#FFFFFF";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
    <tr><td align="center" bgcolor="${bg}" style="border-radius:8px;${outline ? `border:1.5px solid ${color};` : ""}">
      <a href="${esc(href)}" target="_blank" style="display:inline-block;padding:13px 28px;font-family:${FONT};font-size:15px;font-weight:700;line-height:18px;color:${fg};text-decoration:none;border-radius:8px;">${esc(label)}</a>
    </td></tr></table>`;
}

// Order progress: Placed → Confirmed → Packed → Shipped → Out for delivery → Delivered
const STEPS = [
  { key: "processing", label: "Placed", at: "placedAt" },
  { key: "confirmed", label: "Confirmed", at: "confirmedAt" },
  { key: "packed", label: "Packed", at: "packedAt" },
  { key: "shipped", label: "Shipped", at: "shippedAt" },
  { key: "out_for_delivery", label: "Out for delivery", at: null },
  { key: "delivered", label: "Delivered", at: "deliveredAt" },
];

function timeline(order, accent) {
  const current = Math.max(0, STEPS.findIndex((s) => s.key === order.status));
  const cells = STEPS.map((s, i) => {
    const done = i <= current;
    const isCurrent = i === current;
    const dot = done
      ? `<td align="center" valign="middle" width="24" height="24" bgcolor="${accent}" style="width:24px;min-width:24px;max-width:24px;height:24px;border-radius:12px;font-family:${FONT};font-size:13px;line-height:24px;color:#FFFFFF;font-weight:700;mso-line-height-rule:exactly;">&#10003;</td>`
      : `<td align="center" valign="middle" width="20" height="20" bgcolor="#FFFFFF" style="width:20px;min-width:20px;max-width:20px;height:20px;border-radius:12px;border:2px solid #D4D4D8;font-size:1px;line-height:1px;">&nbsp;</td>`;
    const lineLeft = i === 0 ? "transparent" : i <= current ? accent : "#E4E4E7";
    const lineRight = i === STEPS.length - 1 ? "transparent" : i < current ? accent : "#E4E4E7";
    const when = s.at && order[s.at] ? fmtDate(order[s.at], true) : isCurrent && s.key === "out_for_delivery" ? "Today" : "";
    return `<td valign="top" align="center" width="${Math.floor(100 / STEPS.length)}%" style="padding:0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed;"><tr>
        <td style="padding-top:11px;"><div style="height:3px;line-height:3px;font-size:3px;background:${lineLeft};">&nbsp;</div></td>
        <td width="24" align="center" style="width:24px;min-width:24px;"><table role="presentation" width="24" cellpadding="0" cellspacing="0" border="0" style="width:24px;"><tr>${dot}</tr></table></td>
        <td style="padding-top:11px;"><div style="height:3px;line-height:3px;font-size:3px;background:${lineRight};">&nbsp;</div></td>
      </tr></table>
      <div class="tl-label" style="font-family:${FONT};font-size:12px;line-height:15px;margin-top:8px;color:${isCurrent ? C.ink : done ? C.body : "#A1A1AA"};font-weight:${isCurrent ? 700 : 500};">${esc(s.label)}</div>
      ${when ? `<div class="tl-date" style="font-family:${FONT};font-size:11px;line-height:14px;color:${C.muted};margin-top:2px;">${esc(when)}</div>` : ""}
    </td>`;
  }).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cells}</tr></table>`;
}

function itemRows(items, imageUrl) {
  return items
    .map((it, idx) => {
      const img = imageUrl(it.image);
      const meta = [it.variant, it.colorName].filter(Boolean).map(esc).join(" &middot; ");
      const unit = Number(it.unitPrice) || (Number(it.lineTotal) || 0) / (Number(it.qty) || 1);
      const mrp = Number(it.originalPrice) || 0;
      return `<tr><td style="padding:${idx ? 16 : 0}px 0 16px;${idx < items.length - 1 ? `border-bottom:1px solid ${C.line};` : ""}">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td width="84" valign="top" style="width:84px;padding-right:16px;">
            ${
              img
                ? `<img src="${esc(img)}" width="84" height="84" alt="${esc(it.itemName)}" style="display:block;width:84px;height:84px;object-fit:contain;border:1px solid ${C.line};border-radius:10px;background:#FFFFFF;">`
                : `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="84" height="84" bgcolor="${C.bg}" style="width:84px;height:84px;border-radius:10px;">&nbsp;</td></tr></table>`
            }
          </td>
          <td valign="top" style="font-family:${FONT};">
            <div style="font-size:15px;line-height:21px;font-weight:700;color:${C.ink};">${esc(it.itemName)}</div>
            ${it.brandName ? `<div style="font-size:13px;line-height:19px;color:${C.muted};">${esc(it.brandName)}</div>` : ""}
            ${meta ? `<div style="font-size:13px;line-height:19px;color:${C.body};margin-top:2px;">${meta}</div>` : ""}
            <div style="font-size:13px;line-height:19px;color:${C.body};margin-top:6px;">Qty: <b>${Number(it.qty) || 1}</b>
              &nbsp;&middot;&nbsp; ${inr(unit)}${mrp > unit ? ` <span style="color:#A1A1AA;text-decoration:line-through;">${inr(mrp)}</span> <span style="color:${C.success};font-weight:600;">${Math.round(((mrp - unit) / mrp) * 100)}% off</span>` : ""}
            </div>
          </td>
          <td valign="top" align="right" style="font-family:${FONT};font-size:15px;line-height:21px;font-weight:700;color:${C.ink};white-space:nowrap;padding-left:12px;">${inr(it.lineTotal)}</td>
        </tr></table>
      </td></tr>`;
    })
    .join("");
}

function priceRows(order, items) {
  const row = (label, value, { strong = false, color = C.body, size = 14 } = {}) =>
    `<tr><td style="font-family:${FONT};font-size:${size}px;line-height:22px;color:${strong ? C.ink : color};font-weight:${strong ? 700 : 400};padding:3px 0;">${label}</td>
     <td align="right" style="font-family:${FONT};font-size:${size}px;line-height:22px;color:${strong ? C.ink : color};font-weight:${strong ? 700 : 500};padding:3px 0;white-space:nowrap;">${value}</td></tr>`;
  const qty = items.reduce((s, it) => s + (Number(it.qty) || 0), 0);
  const coupon = Number(order.couponDiscount) || 0;
  const platform = Number(order.platformDiscount) || 0;
  const delivery = Number(order.deliveryCharge) || 0;
  const cod = Number(order.codFee) || 0;
  const mrpSavings = Number(order.productDiscount) || 0;
  const saved = mrpSavings + coupon + platform;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    ${row(`Items (${qty})`, inr(order.subtotal))}
    ${coupon > 0 ? row(`Coupon${order.couponCode ? ` <span style="color:${C.muted};">(${esc(order.couponCode)})</span>` : ""}`, `&minus; ${inr(coupon)}`, { color: C.success }) : ""}
    ${platform > 0 ? row("Special discount", `&minus; ${inr(platform)}`, { color: C.success }) : ""}
    ${row("Delivery", delivery > 0 ? inr(delivery) : `<span style="color:${C.success};">FREE</span>`)}
    ${cod > 0 ? row("Cash on Delivery fee", inr(cod)) : ""}
    <tr><td colspan="2" style="padding:8px 0;"><div style="border-top:1px dashed #D4D4D8;height:1px;line-height:1px;font-size:1px;">&nbsp;</div></td></tr>
    ${row("Order total", inr(order.totalAmount), { strong: true, size: 17 })}
    <tr><td colspan="2" style="font-family:${FONT};font-size:12px;line-height:18px;color:${C.muted};padding-top:2px;">Inclusive of all taxes${Number(order.taxAmount) > 0 ? ` (GST ${inr(order.taxAmount)})` : ""}</td></tr>
    ${saved > 0 ? `<tr><td colspan="2" style="padding-top:12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${C.successTint}" style="border-radius:8px;padding:10px 14px;font-family:${FONT};font-size:13px;line-height:18px;color:${C.success};font-weight:600;">You saved ${inr(saved)} on this order</td></tr></table></td></tr>` : ""}
  </table>`;
}

function infoBox(title, html, tone) {
  const t = TONES[tone] || TONES.brand;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td bgcolor="${t.tint}" style="border-left:4px solid ${t.accent};border-radius:8px;padding:16px 18px;font-family:${FONT};">
      <div style="font-size:15px;line-height:20px;font-weight:700;color:${t.accent};margin-bottom:4px;">${esc(title)}</div>
      <div style="font-size:14px;line-height:21px;color:${C.body};">${html}</div>
    </td></tr></table>`;
}

function twoCards(left, right) {
  const card = (c) => `<td class="col" valign="top" width="50%" style="padding:0 6px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="border:1px solid ${C.line};border-radius:12px;padding:18px;font-family:${FONT};background:${C.card};">
          <div style="font-size:16px;line-height:22px;font-weight:700;color:${C.ink};margin-bottom:6px;">${esc(c.title)}</div>
          <div style="font-size:14px;line-height:21px;color:${C.body};">${c.html}</div>
        </td></tr></table></td>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 -6px;"><tr>${card(left)}${card(right)}</tr></table>`;
}

// ─── main ───────────────────────────────────────────────────────────────────

/**
 * copy: { subject, preheader, eyebrow, title, lines[], tone, tip?, next?, ctaLabel?,
 *         tracking?, showTimeline?, secondaryCta? }
 * links: { site, cta, logo, help? }
 */
export function renderOrderEmail({ copy, order, items, store, audience, links, imageUrl }) {
  const tone = TONES[copy.tone] || TONES.brand;
  const brand = store.tradeName || "AppleNext";
  const firstName = order.customerFirstName || String(order.shipName || "").split(" ")[0] || "there";
  const isStore = audience === "store";
  const payment = PAYMENT[order.paymentMethod] || order.paymentMethod || "-";
  const paymentState =
    order.paymentStatus === "paid" ? `<span style="color:${C.success};font-weight:600;">Paid</span>`
    : order.paymentStatus === "refunded" ? `<span style="color:${C.muted};font-weight:600;">Refunded</span>`
    : order.paymentMethod === "cod" ? `<span style="color:${C.warn};font-weight:600;">Pay ${inr(order.totalAmount)} on delivery</span>`
    : `<span style="color:${C.warn};font-weight:600;">Pending</span>`;

  const address = [
    order.shipLine1,
    order.shipLine2,
    [order.shipCity, order.shipState].filter(Boolean).join(", ") + (order.shipPinCode ? ` ${order.shipPinCode}` : ""),
  ].filter((x) => x && x.trim()).map(esc).join(", ");

  const tracking =
    copy.tracking && order.trackingNumber
      ? `<tr><td class="px" style="padding:0 32px 24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="border:1px solid ${C.line};border-radius:12px;padding:16px 18px;font-family:${FONT};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
                <td class="col" valign="middle" style="font-size:14px;line-height:21px;color:${C.body};">
                  <div style="font-size:12px;color:${C.muted};text-transform:uppercase;letter-spacing:.06em;font-weight:700;">Shipment</div>
                  <div style="color:${C.ink};font-weight:700;font-size:15px;">${esc(order.courierName || "Courier")}</div>
                  <div>Tracking ID: <b>${esc(order.trackingNumber)}</b></div>
                </td>
                ${order.trackingUrl ? `<td class="col" valign="middle" align="right" style="padding-top:8px;">${button(order.trackingUrl, "Track shipment", { outline: true })}</td>` : ""}
              </tr></table>
            </td></tr></table>
        </td></tr>`
      : "";

  const footerContact = [
    store.phone ? `<a href="tel:${esc(String(store.phone).replace(/\s+/g, ""))}" style="color:${C.muted};text-decoration:none;">${esc(store.phone)}</a>` : "",
    store.email ? `<a href="mailto:${esc(store.email)}" style="color:${C.muted};text-decoration:none;">${esc(store.email)}</a>` : "",
    `<a href="${esc(links.site)}" style="color:${C.muted};text-decoration:none;">${esc(String(links.site).replace(/^https?:\/\//, ""))}</a>`,
  ].filter(Boolean).join(" &nbsp;|&nbsp; ");
  const storeAddress = [store.legalName || brand, store.addressLine1, store.addressLine2, [store.city, store.state, store.pinCode].filter(Boolean).join(", ")]
    .filter((x) => x && String(x).trim())
    .map(esc)
    .join(", ");

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(copy.subject)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
  body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
  table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;}
  img{-ms-interpolation-mode:bicubic;border:0;outline:none;text-decoration:none;}
  a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important;}
  u + #body a{color:inherit;text-decoration:none;}
  @media only screen and (max-width:620px){
    .container{width:100%!important;}
    .px{padding-left:20px!important;padding-right:20px!important;}
    .col{display:block!important;width:100%!important;text-align:left!important;}
    .h1{font-size:24px!important;line-height:30px!important;}
    .tl-label{font-size:10px!important;line-height:13px!important;}
    .tl-date{display:none!important;}
    .hide-sm{display:none!important;}
  }
</style>
</head>
<body id="body" style="margin:0;padding:0;background:${C.bg};word-spacing:normal;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${C.bg};">${esc(copy.preheader || copy.title)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.bg}" style="background:${C.bg};">
<tr><td align="center" style="padding:24px 12px;">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:${C.card};border-radius:16px;overflow:hidden;">

  <!-- brand bar -->
  <tr><td height="4" bgcolor="${C.brand}" style="height:4px;line-height:4px;font-size:4px;">&nbsp;</td></tr>
  <tr><td class="px" style="padding:22px 32px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td valign="middle"><a href="${esc(links.site)}" target="_blank" style="text-decoration:none;">
        <img src="${esc(links.logo)}" width="140" height="49" alt="${esc(brand)}" style="display:block;width:140px;height:auto;font-family:${FONT};font-size:22px;font-weight:700;color:${C.ink};">
      </a></td>
      <td valign="middle" align="right" style="font-family:${FONT};font-size:12px;line-height:16px;color:${C.muted};">
        ${isStore ? "Store alert" : "Order"}<br><span style="font-size:14px;font-weight:700;color:${C.ink};">#${esc(order.orderNumber)}</span>
      </td>
    </tr></table>
  </td></tr>
  ${divider()}

  <!-- hero -->
  <tr><td class="px" style="padding:32px 32px 8px;font-family:${FONT};">
    ${copy.eyebrow ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${tone.tint}" style="border-radius:999px;padding:5px 12px;font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:.04em;color:${tone.accent};text-transform:uppercase;">${esc(copy.eyebrow)}</td></tr></table>` : ""}
    <div style="font-size:15px;line-height:22px;color:${C.body};margin-top:16px;">${isStore ? "Hello team," : `Hello <b style="color:${C.ink};">${esc(firstName)}</b>,`}</div>
    <h1 class="h1" style="margin:6px 0 12px;font-family:${FONT};font-size:28px;line-height:35px;font-weight:800;color:${C.ink};letter-spacing:-.01em;">${esc(copy.title)}</h1>
    ${copy.lines.filter(Boolean).map((l) => `<p style="margin:0 0 10px;font-size:15px;line-height:23px;color:${C.body};">${l}</p>`).join("")}
  </td></tr>

  ${copy.showTimeline ? `<tr><td class="px" style="padding:20px 32px 8px;">${timeline(order, tone.accent)}</td></tr>` : ""}

  <!-- CTA -->
  <tr><td class="px" style="padding:24px 32px 28px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td class="col" style="padding:0 10px 10px 0;">${button(links.cta, copy.ctaLabel || (isStore ? "Open in admin" : "View order"))}</td>
      ${copy.secondaryCta ? `<td class="col" style="padding:0 0 10px 0;">${button(copy.secondaryCta.href, copy.secondaryCta.label, { outline: true })}</td>` : ""}
    </tr></table>
  </td></tr>

  ${tracking}
  ${copy.tip ? `<tr><td class="px" style="padding:0 32px 28px;">${infoBox(copy.tip.title, copy.tip.html, copy.tip.tone || copy.tone)}</td></tr>` : ""}
  ${divider()}

  <!-- order summary -->
  <tr><td class="px" style="padding:28px 32px 8px;">
    ${sectionTitle("Order summary")}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:${FONT};"><tr>
      <td class="col" valign="top" width="50%" style="padding:0 0 14px;">
        <div style="font-size:12px;line-height:16px;color:${C.muted};">Order ID</div>
        <div style="font-size:14px;line-height:20px;color:${C.ink};font-weight:700;">${esc(order.orderNumber)}</div>
      </td>
      <td class="col" valign="top" width="50%" style="padding:0 0 14px;">
        <div style="font-size:12px;line-height:16px;color:${C.muted};">Order date</div>
        <div style="font-size:14px;line-height:20px;color:${C.ink};font-weight:600;">${esc(fmtDate(order.placedAt))}</div>
      </td>
    </tr><tr>
      <td class="col" valign="top" width="50%" style="padding:0 0 14px;">
        <div style="font-size:12px;line-height:16px;color:${C.muted};">Payment</div>
        <div style="font-size:14px;line-height:20px;color:${C.ink};font-weight:600;">${esc(payment)} &middot; ${paymentState}</div>
      </td>
      <td class="col" valign="top" width="50%" style="padding:0 0 14px;">
        <div style="font-size:12px;line-height:16px;color:${C.muted};">Status</div>
        <div style="font-size:14px;line-height:20px;color:${tone.accent};font-weight:700;">${esc(copy.statusLabel || order.statusLabel || "")}</div>
      </td>
    </tr></table>
  </td></tr>

  <!-- items -->
  <tr><td class="px" style="padding:12px 32px 4px;">
    ${sectionTitle(`Items in this order`)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${itemRows(items, imageUrl)}</table>
  </td></tr>

  <!-- price -->
  <tr><td class="px" style="padding:8px 32px 28px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td bgcolor="#FAFAFA" style="border:1px solid ${C.line};border-radius:12px;padding:18px 20px;">${priceRows(order, items)}</td>
    </tr></table>
  </td></tr>

  <!-- address -->
  ${address ? `<tr><td class="px" style="padding:0 32px 28px;">
    ${sectionTitle("Delivery address")}
    <div style="font-family:${FONT};font-size:14px;line-height:22px;color:${C.body};">
      <b style="color:${C.ink};">${esc(order.shipName || "")}</b>${order.shipPhone ? ` &middot; ${esc(order.shipPhone)}` : ""}<br>${address}
    </div>
  </td></tr>` : ""}

  ${isStore ? "" : `<tr><td class="px" style="padding:0 26px 16px;">${twoCards(
    { title: "What's next?", html: copy.next || "We'll keep you posted by email at every step." },
    { title: "Need help?", html: `Questions about your order? ${store.phone ? `Call <a href="tel:${esc(String(store.phone).replace(/\s+/g, ""))}" style="color:${C.brand};text-decoration:none;font-weight:600;">${esc(store.phone)}</a> or ` : ""}<a href="${esc(links.help)}" style="color:${C.brand};text-decoration:none;font-weight:600;">contact us</a>.` }
  )}</td></tr>`}

  <!-- footer -->
  <tr><td bgcolor="#FAFAFA" class="px" style="padding:24px 32px;border-top:1px solid ${C.line};font-family:${FONT};font-size:12px;line-height:19px;color:${C.muted};">
    <div style="font-size:14px;font-weight:700;color:${C.ink};margin-bottom:4px;">${esc(brand)}</div>
    <div>${footerContact}</div>
    ${storeAddress ? `<div style="margin-top:6px;">${storeAddress}${store.gstin ? ` &middot; GSTIN ${esc(store.gstin)}` : ""}</div>` : ""}
    <div style="margin-top:10px;">${isStore ? "Internal notification for store staff." : `You're receiving this email because you placed order ${esc(order.orderNumber)} on ${esc(String(links.site).replace(/^https?:\/\//, ""))}. For your security, we never ask for passwords, OTPs or card details by email.`}</div>
  </td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>`;

  const text = [
    `${brand} — Order #${order.orderNumber}`,
    "",
    isStore ? "Hello team," : `Hello ${firstName},`,
    copy.title,
    ...copy.lines.filter(Boolean).map((l) => l.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&middot;/g, "·")),
    "",
    order.trackingNumber && copy.tracking ? `Courier: ${order.courierName || "-"} · Tracking ID: ${order.trackingNumber}${order.trackingUrl ? ` · ${order.trackingUrl}` : ""}` : "",
    "Items:",
    ...items.map((it) => `  - ${it.itemName}${it.variant ? ` (${it.variant})` : ""} × ${Number(it.qty) || 1} — ${inr(it.lineTotal)}`),
    `Order total: ${inr(order.totalAmount)} (inclusive of all taxes)`,
    `Payment: ${payment}`,
    address ? `Delivery address: ${order.shipName || ""}, ${address.replace(/&amp;/g, "&")}` : "",
    "",
    `${copy.ctaLabel || "View order"}: ${links.cta}`,
    store.phone || store.email ? `Help: ${[store.phone, store.email].filter(Boolean).join(" / ")}` : "",
  ].filter((l) => l !== null && l !== undefined).join("\n").replace(/\n{3,}/g, "\n\n");

  return { html, text };
}
