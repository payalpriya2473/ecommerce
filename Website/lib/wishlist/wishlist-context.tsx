"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getItemOriginalPrice, getItemOfferPrice, type Item } from "@/lib/api/publicApi";
import type { CartItem } from "@/lib/cart/cart-context";
import { buildVariantKey } from "@/lib/product/variant-utils";
import {
  customerWishlistAPI,
  getStoredCustomer,
  mergeWithCache,
  onCustomerAuthChange,
  type CustomerWishlistItem,
} from "@/lib/api/customerApi";

const WISHLIST_GUEST_KEY = "applenext-wishlist:guest";
const WISHLIST_LEGACY_KEY = "applenext-wishlist";
const WISHLIST_CUSTOMER_PREFIX = "applenext-wishlist:customer:";

export interface WishlistItem {
  id: string;
  itemId: string;
  itemName: string;
  brandName?: string;
  primaryImage?: string | null;
  offerPrice: number;
  originalPrice: number;
  categoryName?: string;
  variant?: string | null;
  colorId?: string | null;
  colorName?: string | null;
  gst?: number;
  isActive: boolean;
  addedAt: string;
}

export interface WishlistItemInput {
  id: string | number;
  itemId?: string | number;
  itemName: string;
  brandName?: string;
  primaryImage?: string | null;
  offerPrice?: number;
  originalPrice?: number;
  categoryName?: string;
  variant?: string | null;
  colorId?: string | number | null;
  colorName?: string | null;
  gst?: number;
  isActive?: boolean;
  addedAt?: string;
}

interface WishlistContextValue {
  items: WishlistItem[];
  itemCount: number;
  addItem: (item: WishlistItemInput) => void;
  addItems: (items: WishlistItemInput[]) => void;
  removeItem: (id: string | number) => void;
  toggleItem: (item: WishlistItemInput) => boolean;
  clearWishlist: () => void;
  hasItem: (id: string | number) => boolean;
}

const WishlistContext = createContext<WishlistContextValue | null>(null);

function getStorageKey(customerId?: string | number | null) {
  return customerId ? `${WISHLIST_CUSTOMER_PREFIX}${customerId}` : WISHLIST_GUEST_KEY;
}

function readStoredWishlist(customerId?: string | number | null): WishlistItem[] {
  if (typeof window === "undefined") return [];

  const keys = customerId
    ? [getStorageKey(customerId), WISHLIST_LEGACY_KEY]
    : [WISHLIST_GUEST_KEY, WISHLIST_LEGACY_KEY];

  for (const key of keys) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) continue;

      return parsed
        .filter(Boolean)
        .map((item) => normalizeWishlistItem(item));
    } catch {
      // ignore malformed cached data
    }
  }

  return [];
}

function writeStoredWishlist(customerId: string | number | null | undefined, items: WishlistItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(getStorageKey(customerId), JSON.stringify(items));
}

function normalizeWishlistItem(input: WishlistItemInput | WishlistItem): WishlistItem {
  const itemId = String(input.itemId ?? input.id);
  const colorId = input.colorId != null ? String(input.colorId) : null;
  const offerPrice = Number(input.offerPrice ?? 0) || 0;
  const originalPrice = Number(input.originalPrice ?? offerPrice) || offerPrice;

  return {
    id: buildVariantKey(itemId, colorId),
    itemId,
    itemName: input.itemName,
    brandName: input.brandName,
    primaryImage: input.primaryImage ?? null,
    offerPrice,
    originalPrice: originalPrice > 0 ? originalPrice : offerPrice,
    categoryName: input.categoryName,
    variant: input.variant,
    colorId,
    colorName: input.colorName ?? null,
    gst: input.gst,
    isActive: input.isActive !== false,
    addedAt: input.addedAt ?? new Date().toISOString(),
  };
}

function toWishlistItem(row: CustomerWishlistItem, fallback?: WishlistItem): WishlistItem {
  return {
    id: fallback?.id ?? String(row.id),
    itemId: fallback?.itemId ?? String(row.id),
    itemName: row.itemName,
    brandName: row.brandName ?? fallback?.brandName,
    primaryImage: row.primaryImage ?? fallback?.primaryImage ?? null,
    offerPrice: Number(row.offerPrice ?? fallback?.offerPrice ?? 0) || 0,
    originalPrice: Number(row.originalPrice ?? fallback?.originalPrice ?? 0) || 0,
    categoryName: row.categoryName ?? fallback?.categoryName,
    variant: row.variant ?? fallback?.variant ?? null,
    colorId: fallback?.colorId ?? null,
    colorName: fallback?.colorName ?? null,
    gst: row.gst ?? fallback?.gst,
    isActive: row.isActive ?? fallback?.isActive ?? true,
    addedAt: row.addedAt ?? fallback?.addedAt ?? new Date().toISOString(),
  };
}

export function wishlistItemFromItem(item: Item): WishlistItemInput {
  const offerPrice = getItemOfferPrice(item);
  const originalPrice = getItemOriginalPrice(item);

  return {
    id: item.id,
    itemId: item.id,
    itemName: item.itemName,
    brandName: item.brandName,
    primaryImage: item.primaryImage ?? null,
    offerPrice,
    originalPrice,
    categoryName: item.categoryName,
    variant: item.variant,
    colorId: null,
    colorName: null,
    gst: item.gst,
    isActive: item.isActive,
    addedAt: item.createdAt,
  };
}

export function wishlistItemFromCartItem(item: CartItem): WishlistItemInput {
  return {
    id: item.id,
    itemId: item.itemId,
    itemName: item.itemName,
    brandName: item.brandName,
    primaryImage: item.primaryImage ?? null,
    offerPrice: item.offerPrice,
    originalPrice: item.originalPrice,
    categoryName: item.categoryName,
    variant: item.variant,
    colorId: item.colorId ?? null,
    colorName: item.colorName ?? null,
    gst: item.gst,
    isActive: true,
  };
}

export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<WishlistItem[]>([]);
  const customerIdRef = useRef<string | null>(null);

  const loadWishlist = useCallback(async () => {
    const customer = getStoredCustomer();
    const customerId = customer ? String(customer.id) : null;
    customerIdRef.current = customerId;

    if (!customerId) {
      setItems(readStoredWishlist(null));
      return;
    }

    const cached = readStoredWishlist(customerId);
    const response = await customerWishlistAPI.getAll();

    if (response.success && Array.isArray(response.data)) {
      const remoteItems = response.data.map((row) => {
        const fallback =
          cached.find((item) => item.itemId === String(row.id) && !item.colorId) ??
          cached.find((item) => item.itemId === String(row.id));
        return toWishlistItem(row, fallback);
      });
      const merged = [
        ...mergeWithCache(remoteItems, cached),
        ...cached.filter(
          (item) =>
            !!item.colorId &&
            !remoteItems.some((remoteItem) => remoteItem.id === item.id)
        ),
      ];
      setItems(merged);
      writeStoredWishlist(customerId, merged);
      return;
    }

    setItems(cached);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadWishlist();
    }, 0);
    const unsubscribe = onCustomerAuthChange(() => {
      void loadWishlist();
    });
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, [loadWishlist]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    writeStoredWishlist(customerIdRef.current, items);
  }, [items]);

  const commit = useCallback(
    (updater: (current: WishlistItem[]) => WishlistItem[]) => {
      let nextItems: WishlistItem[] = [];
      setItems((current) => {
        nextItems = updater(current);
        return nextItems;
      });

      const customerId = customerIdRef.current;
      writeStoredWishlist(customerId, nextItems);
    },
    []
  );

  const addItem = useCallback(
    (input: WishlistItemInput) => {
      const nextItem = normalizeWishlistItem(input);
      commit((current) => {
        const existing = current.find((item) => item.id === nextItem.id);
        if (existing) {
          return current.map((item) => (item.id === nextItem.id ? { ...item, ...nextItem } : item));
        }
        return [nextItem, ...current];
      });

      if (customerIdRef.current) {
        void customerWishlistAPI.add(nextItem.itemId).catch(async () => {
          const refreshed = await customerWishlistAPI.getAll();
          if (refreshed.success && Array.isArray(refreshed.data)) {
            const cached = readStoredWishlist(customerIdRef.current);
            const merged = refreshed.data.map((row) =>
              toWishlistItem(
                row,
                cached.find((item) => item.itemId === String(row.id) && !item.colorId) ??
                  cached.find((item) => item.itemId === String(row.id))
              )
            );
            setItems(merged);
            writeStoredWishlist(customerIdRef.current, merged);
          }
        });
      }
    },
    [commit]
  );

  const addItems = useCallback(
    (inputs: WishlistItemInput[]) => {
      commit((current) => {
        let next = [...current];

        inputs.forEach((input) => {
          const nextItem = normalizeWishlistItem(input);
          const existing = next.find((item) => item.id === nextItem.id);
          if (existing) {
            next = next.map((item) => (item.id === nextItem.id ? { ...item, ...nextItem } : item));
          } else {
            next = [nextItem, ...next];
          }
        });

        return next;
      });

      if (customerIdRef.current) {
        void customerWishlistAPI
          .sync(
            Array.from(
              new Set(
                inputs.map((item) => String(item.itemId ?? item.id))
              )
            )
          )
          .catch(() => {});
      }
    },
    [commit]
  );

  const removeItem = useCallback(
    (id: string | number) => {
      const normalizedId = String(id);
      const targetItem = items.find((item) => item.id === normalizedId);
      commit((current) => current.filter((item) => item.id !== normalizedId));
      if (customerIdRef.current && targetItem) {
        void customerWishlistAPI.remove(targetItem.itemId).catch(() => {});
      }
    },
    [items, commit]
  );

  const clearWishlist = useCallback(() => {
    commit(() => []);
    if (customerIdRef.current) {
      void customerWishlistAPI.clear().catch(() => {});
    }
  }, [commit]);

  const hasItem = useCallback(
    (id: string | number) => items.some((item) => item.id === String(id)),
    [items]
  );

  const toggleItem = useCallback(
    (input: WishlistItemInput) => {
      const exists = items.some((item) => item.id === String(input.id));
      if (exists) {
        removeItem(input.id);
        return false;
      }

      addItem(input);
      return true;
    },
    [items, addItem, removeItem]
  );

  const value = useMemo<WishlistContextValue>(
    () => ({
      items,
      itemCount: items.length,
      addItem,
      addItems,
      removeItem,
      toggleItem,
      clearWishlist,
      hasItem,
    }),
    [items, addItem, addItems, removeItem, toggleItem, clearWishlist, hasItem]
  );

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist() {
  const value = useContext(WishlistContext);
  if (!value) {
    throw new Error("useWishlist must be used within WishlistProvider");
  }
  return value;
}
