"use client";

import { useEffect, useState } from "react";
import { COUPONS, loadCoupons, subscribeCoupons, type Coupon } from "@/lib/pricing/order-pricing";

/**
 * Loads the admin-managed coupons once and re-renders when they arrive.
 * Returns the current coupon map (same object as COUPONS).
 */
export function useCoupons(): { coupons: Record<string, Coupon>; loaded: boolean } {
  const [version, setVersion] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeCoupons(() => setVersion((v) => v + 1));
    loadCoupons().finally(() => setLoaded(true));
    return () => {
      unsubscribe();
    };
  }, []);

  void version;
  return { coupons: COUPONS, loaded };
}
