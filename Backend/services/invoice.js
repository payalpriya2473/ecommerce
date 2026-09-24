// services/invoice.js
// GST tax invoice (B2C) for website orders.
//
// • Number: assigned once, when the order is SHIPPED (ensureInvoice), from the
//   series in online_store_settings — e.g. WEB/0001/26-27, restarting every April.
// • Prices on the website are GST-inclusive, so each line's taxable value is
//   backed out of its (discount-adjusted) amount: taxable = amount / (1 + rate).
//   Order-level discounts (coupon / platform) are spread across lines pro rata.
// • Supply within the store's state → CGST + SGST; otherwise IGST.
// • Delivery / COD charges are shown as a service line at 18% (SAC 996812).
// • PDF is drawn with utils/miniPdf.js (no extra npm package needed).

import { db } from "../config/db.js";
import { getStoreSettings, takeInvoiceNumber, normState, stateCode } from "./storeSettings.js";
import { MiniPdf } from "../utils/miniPdf.js";

const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const money = (v) =>
  (Number(v) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const CHARGES_SAC = "996812";
const CHARGES_GST = 18;

export class InvoiceError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Assign an invoice number + HSN codes (idempotent). Returns the number. */
export async function ensureInvoice(orderId) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[order]] = await conn.query(
      "SELECT id, status, invoiceNumber FROM website_orders WHERE id = ? FOR UPDATE",
      [orderId]
    );
    if (!order) throw new InvoiceError("Order not found", 404);
    if (order.invoiceNumber) {
      await conn.commit();
      return order.invoiceNumber;
    }
    const number = await takeInvoiceNumber(conn);
    await conn.query("UPDATE website_orders SET invoiceNumber = ?, invoiceDate = NOW() WHERE id = ?", [number, orderId]);
    await conn.query(
      `UPDATE website_order_items oi
         LEFT JOIN items i        ON i.id  = oi.itemId
         LEFT JOIN item_groups ig ON ig.id = i.itemGroupId
          SET oi.hsnCode = COALESCE(NULLIF(oi.hsnCode, ''), ig.hsnCode)
        WHERE oi.orderId = ?`,
      [orderId]
    );
    await conn.commit();
    return number;
  } catch (e) {
    await conn.rollback().catch(() => {});
    throw e;
  } finally {
    conn.release();
  }
}

// ─── Amount in words (Indian system) ────────────────────────────────────────

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n) {
  return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`;
}
function threeDigits(n) {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", rest ? twoDigits(rest) : ""].filter(Boolean).join(" ");
}
export function amountInWords(amount) {
  const value = Math.round((Number(amount) || 0) * 100);
  let rupees = Math.floor(value / 100);
  const paise = value % 100;
  if (rupees === 0 && paise === 0) return "Rupees Zero Only";
  const parts = [];
  const crore = Math.floor(rupees / 1e7); rupees %= 1e7;
  const lakh = Math.floor(rupees / 1e5); rupees %= 1e5;
  const thousand = Math.floor(rupees / 1e3); rupees %= 1e3;
  if (crore) parts.push(`${crore > 99 ? threeDigits(crore) : twoDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (rupees) parts.push(threeDigits(rupees));
  let words = parts.length ? `Rupees ${parts.join(" ")}` : "Rupees Zero";
  if (paise) words += ` and ${twoDigits(paise)} Paise`;
  return `${words} Only`;
}

// ─── Invoice data ───────────────────────────────────────────────────────────

export async function buildInvoiceData(orderId) {
  const [[order]] = await db.query(
    `SELECT o.*, c.email AS customerEmail, c.firstName AS customerFirstName, c.lastName AS customerLastName
       FROM website_orders o LEFT JOIN website_customers c ON c.id = o.customerId
      WHERE o.id = ?`,
    [orderId]
  );
  if (!order) throw new InvoiceError("Order not found", 404);
  if (!order.invoiceNumber) throw new InvoiceError("The invoice is generated when the order is shipped.", 409);

  const [items] = await db.query("SELECT * FROM website_order_items WHERE orderId = ? ORDER BY id ASC", [orderId]);
  const store = await getStoreSettings();

  const intraState = normState(store.state) && normState(store.state) === normState(order.shipState);
  const subtotal = items.reduce((s, it) => s + Number(it.lineTotal || 0), 0);
  const orderDiscount = Number(order.couponDiscount || 0) + Number(order.platformDiscount || 0);
  const factor = subtotal > 0 ? Math.max(0, subtotal - orderDiscount) / subtotal : 1;

  const lines = items.map((it, index) => {
    const rate = Number(it.gst) || 0;
    const listAmount = Number(it.lineTotal) || 0;
    const amount = r2(listAmount * factor); // incl. GST after order discount
    const taxable = r2(amount / (1 + rate / 100));
    const tax = r2(amount - taxable);
    const qty = Number(it.qty) || 1;
    return {
      sn: index + 1,
      description: it.itemName,
      detail: [it.variant, it.colorName].filter(Boolean).join(" · "),
      hsn: it.hsnCode || "",
      qty,
      unitPrice: Number(it.unitPrice) || 0, // incl. GST, before order discount
      rate: r2(taxable / qty), // taxable value per unit
      discount: r2(listAmount - amount),
      taxable,
      gstRate: rate,
      cgst: intraState ? r2(tax / 2) : 0,
      sgst: intraState ? r2(tax - r2(tax / 2)) : 0,
      igst: intraState ? 0 : tax,
      tax,
      amount,
    };
  });

  const charges = r2(Number(order.deliveryCharge || 0) + Number(order.codFee || 0));
  if (charges > 0) {
    const taxable = r2(charges / (1 + CHARGES_GST / 100));
    const tax = r2(charges - taxable);
    const label = [Number(order.deliveryCharge) > 0 ? "Delivery charges" : "", Number(order.codFee) > 0 ? "COD charges" : ""]
      .filter(Boolean)
      .join(" + ");
    lines.push({
      sn: lines.length + 1,
      description: label,
      detail: "",
      hsn: CHARGES_SAC,
      qty: 1,
      unitPrice: charges,
      rate: taxable,
      discount: 0,
      taxable,
      gstRate: CHARGES_GST,
      cgst: intraState ? r2(tax / 2) : 0,
      sgst: intraState ? r2(tax - r2(tax / 2)) : 0,
      igst: intraState ? 0 : tax,
      tax,
      amount: charges,
    });
  }

  const sum = (key) => r2(lines.reduce((s, l) => s + l[key], 0));
  const totals = {
    taxable: sum("taxable"),
    cgst: sum("cgst"),
    sgst: sum("sgst"),
    igst: sum("igst"),
    tax: sum("tax"),
    discount: sum("discount"),
    lines: sum("amount"),
  };
  totals.grandTotal = r2(order.totalAmount);
  totals.roundOff = r2(totals.grandTotal - (totals.taxable + totals.tax));

  // HSN / rate summary
  const summaryMap = new Map();
  for (const l of lines) {
    const key = `${l.hsn}|${l.gstRate}`;
    const e = summaryMap.get(key) || { hsn: l.hsn, gstRate: l.gstRate, taxable: 0, cgst: 0, sgst: 0, igst: 0, tax: 0 };
    for (const k of ["taxable", "cgst", "sgst", "igst", "tax"]) e[k] = r2(e[k] + l[k]);
    summaryMap.set(key, e);
  }

  return {
    store,
    intraState: Boolean(intraState),
    placeOfSupply: `${order.shipState || "-"}${stateCode(order.shipState) ? ` (${stateCode(order.shipState)})` : ""}`,
    storeStateCode: stateCode(store.state),
    invoice: { number: order.invoiceNumber, date: order.invoiceDate || order.shippedAt || new Date() },
    order,
    customer: {
      name: [order.customerFirstName, order.customerLastName].filter(Boolean).join(" ") || order.shipName || "",
      email: order.customerEmail || "",
    },
    lines,
    hsnSummary: [...summaryMap.values()],
    totals,
    amountInWords: amountInWords(totals.grandTotal),
  };
}

// ─── PDF ────────────────────────────────────────────────────────────────────

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "-";

export function renderInvoicePdf(data) {
  const doc = new MiniPdf({ title: `Invoice ${data.invoice.number}` });
  const { store, order, lines, totals } = data;
  const L = 36;
  const W = doc.page.width - 72;
  const R = L + W;
  const BOTTOM = doc.page.height - 50;
  const BRAND = "#c8102e";
  const GREY = "#555555";
  const B = "Helvetica-Bold";

  // Header
  doc.text(store.tradeName || "AppleNext", L, 36, { font: B, size: 20, color: BRAND });
  doc.text("TAX INVOICE", L, 38, { width: W, align: "right", font: B, size: 14 });
  doc.text("Original for Recipient", L, 56, { width: W, align: "right", size: 7.5, color: GREY });

  let y = doc.text(store.legalName || store.tradeName || "", L, 62, { font: B, size: 9 });
  const storeAddr = [
    store.addressLine1,
    store.addressLine2,
    [store.city, store.state, store.pinCode].filter(Boolean).join(", "),
    store.gstin ? `GSTIN: ${store.gstin}${data.storeStateCode ? `   State code: ${data.storeStateCode}` : ""}` : "GSTIN: (not set)",
    [store.phone ? `Ph: ${store.phone}` : "", store.email].filter(Boolean).join("   "),
  ].filter(Boolean);
  const headerBottom = doc.text(storeAddr.join("\n"), L, y + 1, { width: 290, size: 8.5, color: "#222222" });

  const meta = [
    ["Invoice No.", data.invoice.number],
    ["Invoice Date", fmtDate(data.invoice.date)],
    ["Order No.", order.orderNumber],
    ["Order Date", fmtDate(order.placedAt)],
    ["Place of Supply", data.placeOfSupply],
    ["Payment", `${String(order.paymentMethod || "").toUpperCase()}${order.paymentStatus === "paid" ? " (Paid)" : ""}`],
  ];
  let my = 76;
  for (const [k, v] of meta) {
    doc.text(k, R - 220, my, { width: 80, size: 8.5, color: GREY });
    doc.text(String(v ?? "-"), R - 140, my, { width: 140, align: "right", size: 8.5, font: B });
    my += 12;
  }

  y = Math.max(headerBottom, my) + 8;
  doc.line(L, y, R, y, { width: 0.8, color: "#999999" });
  y += 8;

  // Bill to / Ship to
  const shipLines = [
    order.shipLine1,
    order.shipLine2,
    [order.shipCity, order.shipState, order.shipPinCode].filter(Boolean).join(", "),
    order.shipPhone ? `Ph: ${order.shipPhone}` : "",
  ].filter(Boolean);
  doc.text("BILL TO", L, y, { font: B, size: 8, color: GREY });
  doc.text("SHIP TO", L + W / 2, y, { font: B, size: 8, color: GREY });
  y += 11;
  const b1 = doc.text(
    [data.customer.name || order.shipName, data.customer.email, ...shipLines].filter(Boolean).join("\n"),
    L, y, { width: W / 2 - 10, size: 8.5 }
  );
  const b2 = doc.text([order.shipName, ...shipLines].filter(Boolean).join("\n"), L + W / 2, y, { width: W / 2, size: 8.5 });
  y = Math.max(b1, b2) + 10;

  // Items table
  const cols = [
    { k: "sn", t: "#", w: 16, a: "left" },
    { k: "description", t: "Item", w: 144, a: "left" },
    { k: "hsn", t: "HSN/SAC", w: 45, a: "left" },
    { k: "qty", t: "Qty", w: 28, a: "right" },
    { k: "rate", t: "Rate", w: 52, a: "right" },
    { k: "discount", t: "Disc.", w: 40, a: "right" },
    { k: "taxable", t: "Taxable", w: 58, a: "right" },
    { k: "gstRate", t: "GST%", w: 30, a: "right" },
    { k: "tax", t: "Tax", w: 50, a: "right" },
    { k: "amount", t: "Amount", w: 60, a: "right" },
  ];
  const drawHeader = () => {
    doc.rect(L, y, W, 16, { fill: "#f1f1f1" });
    let x = L;
    for (const c of cols) {
      doc.text(c.t, x + 2, y + 4, { width: c.w - 4, align: c.a, font: B, size: 8 });
      x += c.w;
    }
    y += 18;
  };
  drawHeader();

  for (const line of lines) {
    const dw = cols[1].w - 4;
    const rowH = Math.max(
      14,
      doc.heightOf(line.description, { width: dw, font: B, size: 8 }) +
        (line.detail ? doc.heightOf(line.detail, { width: dw, size: 7 }) : 0) + 5
    );
    if (y + rowH > BOTTOM - 150) {
      doc.addPage();
      y = 36;
      drawHeader();
    }
    let x = L;
    for (const c of cols) {
      let v = line[c.k];
      if (["rate", "discount", "taxable", "tax", "amount"].includes(c.k)) v = money(v);
      if (c.k === "gstRate") v = `${v}%`;
      if (c.k === "description") {
        const after = doc.text(String(v), x + 2, y + 3, { width: dw, font: B, size: 8 });
        if (line.detail) doc.text(line.detail, x + 2, after, { width: dw, size: 7, color: GREY });
      } else {
        doc.text(String(v ?? ""), x + 2, y + 3, { width: c.w - 4, align: c.a, size: 8 });
      }
      x += c.w;
    }
    y += rowH;
    doc.line(L, y, R, y, { width: 0.4, color: "#dddddd" });
  }

  // Tax summary (left) + totals (right)
  y += 10;
  if (y > BOTTOM - 200) {
    doc.addPage();
    y = 36;
  }
  const top = y;
  const sCols = data.intraState
    ? [["HSN/SAC", 50], ["Taxable", 60], ["CGST", 60], ["SGST", 60], ["Total Tax", 55]]
    : [["HSN/SAC", 50], ["Taxable", 70], ["IGST", 75], ["Total Tax", 70]];
  let x = L;
  for (const [t, w] of sCols) {
    doc.text(t, x, y, { width: w - 4, align: t === "HSN/SAC" ? "left" : "right", font: B, size: 7.5 });
    x += w;
  }
  y += 11;
  for (const s of data.hsnSummary) {
    const half = r2(s.gstRate / 2);
    const vals = data.intraState
      ? [s.hsn || "-", money(s.taxable), `${money(s.cgst)} @${half}%`, `${money(s.sgst)} @${half}%`, money(s.tax)]
      : [s.hsn || "-", money(s.taxable), `${money(s.igst)} @${s.gstRate}%`, money(s.tax)];
    x = L;
    vals.forEach((v, i) => {
      doc.text(String(v), x, y, { width: sCols[i][1] - 4, align: i === 0 ? "left" : "right", size: 7.5 });
      x += sCols[i][1];
    });
    y += 10;
  }
  const leftBottom = y;

  const tx = R - 200;
  let ty = top;
  const totalRow = (label, value, bold = false) => {
    const opts = { font: bold ? B : "Helvetica", size: bold ? 10 : 8.5 };
    doc.text(label, tx, ty, { width: 110, ...opts });
    doc.text(value, tx + 110, ty, { width: 90, align: "right", ...opts });
    ty += bold ? 16 : 12;
  };
  totalRow("Taxable Value", money(totals.taxable));
  if (data.intraState) {
    totalRow("CGST", money(totals.cgst));
    totalRow("SGST", money(totals.sgst));
  } else {
    totalRow("IGST", money(totals.igst));
  }
  if (Math.abs(totals.roundOff) >= 0.01) totalRow("Round Off", money(totals.roundOff));
  doc.line(tx, ty, R, ty, { width: 0.8, color: "#000000" });
  ty += 4;
  totalRow("Grand Total (Rs.)", money(totals.grandTotal), true);
  if (totals.discount > 0) {
    ty = doc.text(`Includes discount of Rs. ${money(totals.discount)}`, tx, ty, { width: 200, align: "right", size: 7.5, color: GREY });
  }

  y = Math.max(leftBottom, ty) + 8;
  y = doc.text(`Amount in words: ${data.amountInWords}`, L, y, { width: W, font: B, size: 8.5 }) + 3;
  const notes = [
    order.providerPaymentId ? `Payment ref: ${order.providerPaymentId}` : "",
    order.courierName ? `Shipped via ${order.courierName} - AWB ${order.trackingNumber || "-"}` : "",
    "Tax is not payable on reverse charge basis.",
  ].filter(Boolean);
  y = doc.text(notes.join("\n"), L, y, { width: W, size: 7.5, color: GREY }) + 10;

  // Terms + signature
  if (y > BOTTOM - 80) {
    doc.addPage();
    y = 36;
  }
  if (store.invoiceTerms) {
    const after = doc.text("Terms & Conditions", L, y, { font: B, size: 8 });
    doc.text(store.invoiceTerms, L, after + 2, { width: W / 2 + 40, size: 7.5, color: GREY });
  }
  doc.text(`For ${store.legalName || store.tradeName || "AppleNext"}`, R - 200, y, { width: 200, align: "right", font: B, size: 8.5 });
  doc.line(R - 150, y + 50, R, y + 50, { width: 0.5, color: "#999999" });
  doc.text("Authorised Signatory", R - 200, y + 54, { width: 200, align: "right", size: 7.5, color: GREY });

  doc.text("This is a computer-generated invoice and does not require a physical signature.", L, doc.page.height - 40, {
    width: W,
    align: "center",
    size: 7,
    color: "#888888",
  });

  return doc.toBuffer();
}

/** Invoice PDF buffer + suggested filename for an order that has an invoice. */
export async function getInvoicePdf(orderId) {
  const data = await buildInvoiceData(orderId);
  const pdf = renderInvoicePdf(data);
  const filename = `Invoice-${String(data.invoice.number).replace(/[^\w-]+/g, "-")}.pdf`;
  return { pdf, filename, data };
}
