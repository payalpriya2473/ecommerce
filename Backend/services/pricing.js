// services/pricing.js
// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for customer-facing prices (website + orders).
//
// Item Master fields (per variant row in `items`):
//   • offerPrice → selling price / MOP        (what the customer pays)
//   • nlc        → MRP                          (struck-through price)
//   • gst        → GST rate % of the item (from its Item Group)
//   • maxMOP*, margin, incentive, stockValue   → showroom / internal only
//
// PRICE_TAX_MODE (Backend .env) says how Offer Price and NLC are entered:
//   • "exclusive" (default) → entered WITHOUT GST; customers see price + GST
//   • "inclusive"           → entered WITH GST already included
//
// The website always SHOWS GST-inclusive prices ("Inclusive of all taxes");
// orders store the inclusive unit price and the GST contained in it.
// ─────────────────────────────────────────────────────────────────────────────

export const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

export function getPriceTaxMode() {
  const mode = String(process.env.PRICE_TAX_MODE || "exclusive").trim().toLowerCase();
  return mode === "inclusive" ? "inclusive" : "exclusive";
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Customer (GST-inclusive) price for an amount entered in the Item Master. */
export function toInclusive(amount, gstRate, mode = getPriceTaxMode()) {
  const a = toNum(amount);
  if (!a) return 0;
  if (mode === "inclusive") return round2(a);
  // Retail prices are shown in whole rupees.
  return Math.round(a * (1 + toNum(gstRate) / 100));
}

/** GST contained in a GST-inclusive amount. */
export function gstIncludedIn(inclusiveAmount, gstRate) {
  const amt = Number(inclusiveAmount) || 0;
  const r = toNum(gstRate);
  if (!amt || !r) return 0;
  return round2(amt - amt / (1 + r / 100));
}

/**
 * Price an item row. Returns everything the website/orders need.
 *   sellingPrice  – GST-inclusive price the customer pays
 *   mrp           – GST-inclusive MRP (0 when NLC is not above the selling price)
 *   basePrice     – taxable value of one unit (ex-GST)
 *   gstAmount     – GST in one unit
 */
export function priceItem(row, mode = getPriceTaxMode()) {
  const gstRate = toNum(row?.gst);
  const sellingPrice = toInclusive(row?.offerPrice, gstRate, mode);
  const mrpRaw = toInclusive(row?.nlc, gstRate, mode);
  const mrp = mrpRaw > sellingPrice ? mrpRaw : 0;
  const gstAmount = gstIncludedIn(sellingPrice, gstRate);
  return {
    sellingPrice,
    mrp,
    basePrice: round2(sellingPrice - gstAmount),
    gstAmount,
    gstRate,
    discountPercent: mrp > 0 ? Math.round(((mrp - sellingPrice) / mrp) * 100) : 0,
    priceTaxMode: mode,
  };
}

/**
 * Replace the raw Item Master price fields on a row with customer-facing
 * (GST-inclusive) values, so every existing website screen shows the right
 * price without knowing about GST modes.
 *   offerPrice → selling price incl. GST
 *   nlc        → MRP incl. GST (0 if not higher than the selling price)
 * Raw internal fields (margin, incentive, MOP…) are removed from the output.
 */
export function toCustomerPricing(row) {
  if (!row || typeof row !== "object") return row;
  const p = priceItem(row);
  const out = {
    ...row,
    offerPrice: p.sellingPrice,
    nlc: p.mrp,
    mrp: p.mrp,
    sellingPrice: p.sellingPrice,
    basePrice: p.basePrice,
    gstAmount: p.gstAmount,
    gstRate: p.gstRate,
    discountPercent: p.discountPercent,
    priceInclusiveOfGst: true,
  };
  for (const key of ["margin", "incentive", "maxMOPPercent", "maxMOPAmount", "stockValue"]) {
    delete out[key];
  }
  return out;
}
