// lib/pricing/order-pricing.ts
// Single source of truth for cart / checkout money maths on the client.
// Mirrors Backend/routes/customerOrders.js — keep both in sync.

export interface PriceableLine {
  offerPrice?: number | string | null;
  originalPrice?: number | string | null;
  qty?: number | string | null;
}

export type DeliveryType = "free" | "express" | "scheduled";
export type PaymentMethod = "upi" | "card" | "netbanking" | "wallet" | "cod";

export interface Coupon {
  pct?: number;
  flat?: number;
  max?: number;
  label: string;
}

export const COUPONS: Record<string, Coupon> = {
  MOTAB10: { pct: 10, max: 3000, label: "10% off up to Rs 3,000" },
  HDFC5: { pct: 5, max: 2000, label: "5% off up to Rs 2,000 (HDFC)" },
  NEWUSER15: { pct: 15, max: 2000, label: "15% off up to Rs 2,000" },
  SAVE500: { flat: 500, label: "Flat Rs 500 off" },
};

export const DELIVERY_OPTIONS: Record<
  DeliveryType,
  { type: DeliveryType; label: string; cost: number; badge: string; badgeClass: string; desc: string }
> = {
  free: {
    type: "free",
    label: "Standard Delivery",
    cost: 0,
    badge: "FREE",
    badgeClass: "free",
    desc: "Delivered by tomorrow · Between 9 AM – 9 PM",
  },
  express: {
    type: "express",
    label: "Express Delivery",
    cost: 79,
    badge: "FAST",
    badgeClass: "fast",
    desc: "Delivered today by 10 PM · Priority handling",
  },
  scheduled: {
    type: "scheduled",
    label: "Scheduled Delivery",
    cost: 49,
    badge: "CHOOSE SLOT",
    badgeClass: "premium",
    desc: "Pick a 2-hour delivery window that suits you",
  },
};

export const FREE_DELIVERY_THRESHOLD = 999;
export const COD_FEE = 29;
export const COD_FEE_THRESHOLD = 1000;
export const GST_RATE = 0.018;

const CHECKOUT_COUPON_KEY = "applenext-checkout:coupon";

export function toAmount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function toQty(value: unknown): number {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(99, parsed);
}

export function normalizeCouponCode(code?: string | null): string | null {
  const normalized = (code ?? "").trim().toUpperCase();
  return normalized && COUPONS[normalized] ? normalized : null;
}

export function couponDiscountFor(code: string | null | undefined, subtotal: number): number {
  const normalized = normalizeCouponCode(code);
  if (!normalized) return 0;
  const coupon = COUPONS[normalized];
  if (coupon.flat) return Math.min(coupon.flat, subtotal);
  return Math.min(Math.floor((subtotal * (coupon.pct ?? 0)) / 100), coupon.max ?? Infinity);
}

export interface OrderTotals {
  itemCount: number;
  unitCount: number;
  subtotal: number;
  originalTotal: number;
  productDiscount: number;
  couponDiscount: number;
  platformDiscount: number;
  deliveryCharge: number;
  codFee: number;
  tax: number;
  total: number;
  totalSaving: number;
  freeDeliveryShortfall: number;
}

export function computeOrderTotals(
  lines: PriceableLine[],
  options: {
    couponCode?: string | null;
    deliveryType?: DeliveryType;
    paymentMethod?: PaymentMethod;
  } = {}
): OrderTotals {
  const { couponCode = null, deliveryType = "free", paymentMethod = "cod" } = options;

  let subtotal = 0;
  let originalTotal = 0;
  let unitCount = 0;

  for (const line of lines) {
    const qty = toQty(line.qty ?? 1);
    const offer = toAmount(line.offerPrice);
    const original = Math.max(toAmount(line.originalPrice), offer);
    subtotal += offer * qty;
    originalTotal += original * qty;
    unitCount += qty;
  }

  subtotal = Math.round(subtotal * 100) / 100;
  originalTotal = Math.round(originalTotal * 100) / 100;

  const productDiscount = Math.max(0, Math.round((originalTotal - subtotal) * 100) / 100);
  const couponDiscount = couponDiscountFor(couponCode, subtotal);
  const platformDiscount = subtotal > 50000 ? 500 : 0;

  const option = DELIVERY_OPTIONS[deliveryType] ?? DELIVERY_OPTIONS.free;
  const deliveryCharge =
    option.type === "free" ? (subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : 99) : option.cost;

  const codFee = paymentMethod === "cod" && subtotal > 0 && subtotal < COD_FEE_THRESHOLD ? COD_FEE : 0;

  const taxable = Math.max(0, subtotal - couponDiscount - platformDiscount);
  const tax = Math.round(taxable * GST_RATE);
  const total = Math.max(0, Math.round((taxable + deliveryCharge + codFee + tax) * 100) / 100);

  return {
    itemCount: lines.length,
    unitCount,
    subtotal,
    originalTotal,
    productDiscount,
    couponDiscount,
    platformDiscount,
    deliveryCharge,
    codFee,
    tax,
    total,
    totalSaving: productDiscount + couponDiscount + platformDiscount,
    freeDeliveryShortfall: Math.max(0, FREE_DELIVERY_THRESHOLD - subtotal),
  };
}

export function formatRupees(value: number): string {
  const amount = Number.isFinite(value) ? value : 0;
  return amount.toLocaleString("en-IN", {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

// ─── Coupon hand-off between /cart and /checkout ─────────────────────────────

export function saveCheckoutCoupon(code: string | null) {
  if (typeof window === "undefined") return;
  const normalized = normalizeCouponCode(code);
  if (normalized) window.localStorage.setItem(CHECKOUT_COUPON_KEY, normalized);
  else window.localStorage.removeItem(CHECKOUT_COUPON_KEY);
}

export function readCheckoutCoupon(): string | null {
  if (typeof window === "undefined") return null;
  return normalizeCouponCode(window.localStorage.getItem(CHECKOUT_COUPON_KEY));
}

export function clearCheckoutCoupon() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(CHECKOUT_COUPON_KEY);
}
