// services/coupons.js
// Coupons come from the admin Offers module (offers.section = 'coupon').
// Replaces the old hard-coded MOTAB10 / HDFC5 / NEWUSER15 / SAVE500 list.

import { db } from "../config/db.js";
import { ensureOffersSchema } from "../controllers/offerController.js";

const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const inr = (v) => `Rs ${Number(v || 0).toLocaleString("en-IN")}`;

function isLive(row, now = new Date()) {
  if (row.startAt && new Date(row.startAt) > now) return false;
  if (row.endAt && new Date(row.endAt) < now) return false;
  if (row.validTill) {
    const till = new Date(row.validTill);
    till.setHours(23, 59, 59, 999); // valid through the whole day
    if (till < now) return false;
  }
  return true;
}

function toCoupon(row) {
  const type = row.discountType === "amount" ? "amount" : "percent";
  const value = Number(type === "amount" ? row.discountAmount : row.discountPercent) || 0;
  const maxOff = Number(row.maxOff) || 0;
  const minOrder = Number(row.minOrder) || 0;
  let label =
    type === "amount"
      ? `Flat ${inr(value)} off`
      : `${value}% off${maxOff ? ` up to ${inr(maxOff)}` : ""}`;
  if (minOrder) label += ` on orders above ${inr(minOrder)}`;
  return {
    id: String(row.id),
    code: String(row.couponCode || "").trim().toUpperCase(),
    title: row.couponTitle || null,
    description: row.description || null,
    type,
    value,
    maxOff: maxOff || null,
    minOrder: minOrder || null,
    validTill: row.validTill || row.endAt || null,
    label,
  };
}

/** All coupons customers can use right now. */
export async function listActiveCoupons() {
  await ensureOffersSchema().catch(() => {});
  const [rows] = await db.query(
    `SELECT * FROM offers
      WHERE section = 'coupon' AND isActive = 1
        AND couponCode IS NOT NULL AND couponCode <> ''
      ORDER BY priority ASC, createdAt DESC`
  );
  const now = new Date();
  return rows.filter((r) => isLive(r, now)).map(toCoupon).filter((c) => c.code && c.value > 0);
}

export async function findCoupon(code) {
  const wanted = String(code || "").trim().toUpperCase();
  if (!wanted) return null;
  const coupons = await listActiveCoupons();
  return coupons.find((c) => c.code === wanted) || null;
}

/**
 * Discount for a coupon on a GST-inclusive subtotal.
 * Returns { discount, reason } — reason is set when the coupon doesn't apply.
 */
export function couponDiscount(coupon, subtotal) {
  if (!coupon) return { discount: 0, reason: "Invalid or expired coupon code" };
  const sub = Number(subtotal) || 0;
  if (coupon.minOrder && sub < coupon.minOrder) {
    return { discount: 0, reason: `Add items worth ${inr(coupon.minOrder - sub)} more to use ${coupon.code}` };
  }
  let discount =
    coupon.type === "amount"
      ? Math.min(coupon.value, sub)
      : Math.floor((sub * coupon.value) / 100);
  if (coupon.maxOff) discount = Math.min(discount, coupon.maxOff);
  return { discount: round2(Math.max(0, discount)), reason: null };
}
