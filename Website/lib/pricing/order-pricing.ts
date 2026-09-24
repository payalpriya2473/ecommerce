// lib/pricing/order-pricing.ts
// Cart / checkout money maths on the client (display only).
// Mirrors Backend/routes/customerOrders.js — the backend re-prices every order,
// and checkout shows the server quote (POST /customer/orders/quote).
//
// Prices from the API are already GST-INCLUSIVE (Backend services/pricing.js),
// so GST is shown as "included", never added on top.

export interface PriceableLine {
  offerPrice?: number | string | null;
  originalPrice?: number | string | null;
  qty?: number | string | null;
  gst?: number | string | null; // item GST rate %, used for the "incl. GST" line
}

export type DeliveryType = "free" | "express" | "scheduled";
export type PaymentMethod = "upi" | "card" | "netbanking" | "wallet" | "cod";

export interface Coupon {
  pct?: number;
  flat?: number;
  max?: number;
  minOrder?: number;
  title?: string | null;
  label: string;
}

/**
 * Active coupons, managed in admin → Offers → Coupon. Filled by loadCoupons();
 * components re-render through useCoupons().
 */
export const COUPONS: Record<string, Coupon> = {};

type ApiCoupon = {
  code: string;
  type: "percent" | "amount";
  value: number;
  maxOff?: number | null;
  minOrder?: number | null;
  title?: string | null;
  label: string;
};

let couponsPromise: Promise<Record<string, Coupon>> | null = null;
const couponListeners = new Set<() => void>();

export function loadCoupons(force = false): Promise<Record<string, Coupon>> {
  if (couponsPromise && !force) return couponsPromise;
  couponsPromise = (async () => {
    try {
      const { PUBLIC_API_PROXY_BASE } = await import("@/lib/api/config");
      const res = await fetch(`${PUBLIC_API_PROXY_BASE}/coupons`, { cache: "no-store" });
      const body = await res.json();
      const list: ApiCoupon[] = Array.isArray(body?.data) ? body.data : [];
      for (const key of Object.keys(COUPONS)) delete COUPONS[key];
      for (const c of list) {
        if (!c?.code) continue;
        COUPONS[String(c.code).toUpperCase()] = {
          pct: c.type === "percent" ? Number(c.value) || 0 : undefined,
          flat: c.type === "amount" ? Number(c.value) || 0 : undefined,
          max: c.maxOff ? Number(c.maxOff) : undefined,
          minOrder: c.minOrder ? Number(c.minOrder) : undefined,
          title: c.title ?? null,
          label: c.label,
        };
      }
    } catch {
      /* keep whatever we had — the server validates coupons anyway */
    }
    couponListeners.forEach((fn) => fn());
    return COUPONS;
  })();
  return couponsPromise;
}

export function subscribeCoupons(listener: () => void): () => void {
  couponListeners.add(listener);
  return () => couponListeners.delete(listener);
}

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

/** Why a known coupon doesn't apply yet (e.g. minimum order), or null. */
export function couponBlockReason(code: string | null | undefined, subtotal: number): string | null {
  const normalized = normalizeCouponCode(code);
  if (!normalized) return "Invalid or expired coupon code";
  const coupon = COUPONS[normalized];
  if (coupon.minOrder && subtotal < coupon.minOrder) {
    return `Add items worth Rs ${formatRupees(coupon.minOrder - subtotal)} more to use ${normalized}`;
  }
  return null;
}

export function couponDiscountFor(code: string | null | undefined, subtotal: number): number {
  const normalized = normalizeCouponCode(code);
  if (!normalized) return 0;
  const coupon = COUPONS[normalized];
  if (coupon.minOrder && subtotal < coupon.minOrder) return 0;
  let discount = coupon.flat
    ? Math.min(coupon.flat, subtotal)
    : Math.floor((subtotal * (coupon.pct ?? 0)) / 100);
  if (coupon.max) discount = Math.min(discount, coupon.max);
  return Math.max(0, discount);
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
  let includedGst = 0;

  for (const line of lines) {
    const qty = toQty(line.qty ?? 1);
    const offer = toAmount(line.offerPrice);
    const original = Math.max(toAmount(line.originalPrice), offer);
    const rate = toAmount(line.gst);
    subtotal += offer * qty;
    originalTotal += original * qty;
    unitCount += qty;
    if (rate > 0) includedGst += offer * qty - (offer * qty) / (1 + rate / 100);
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

  // Prices already include GST: `tax` is the GST contained in the goods value
  // (reduced in proportion to order discounts) — shown as "incl. GST".
  const payableGoods = Math.max(0, subtotal - couponDiscount - platformDiscount);
  const tax = subtotal > 0 ? Math.round(((includedGst * payableGoods) / subtotal) * 100) / 100 : 0;
  const total = Math.max(0, Math.round((payableGoods + deliveryCharge + codFee) * 100) / 100);

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
  // Stored as typed; validity is checked when coupons load / on the server.
  const normalized = (code ?? "").trim().toUpperCase() || null;
  if (normalized) window.localStorage.setItem(CHECKOUT_COUPON_KEY, normalized);
  else window.localStorage.removeItem(CHECKOUT_COUPON_KEY);
}

export function readCheckoutCoupon(): string | null {
  if (typeof window === "undefined") return null;
  return (window.localStorage.getItem(CHECKOUT_COUPON_KEY) || "").trim().toUpperCase() || null;
}

export function clearCheckoutCoupon() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(CHECKOUT_COUPON_KEY);
}
