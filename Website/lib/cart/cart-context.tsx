"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getItemOriginalPrice, getItemOfferPrice, type Item } from "@/lib/api/publicApi";
import {
  customerCartAPI,
  getStoredCustomer,
  mergeWithCache,
  onCustomerAuthChange,
  type CustomerCartItem,
} from "@/lib/api/customerApi";

const CART_GUEST_KEY = "applenext-cart:guest";
const CART_LEGACY_KEY = "applenext-cart";
const CART_CUSTOMER_PREFIX = "applenext-cart:customer:";
const SAVED_GUEST_KEY = "applenext-cart-saved:guest";
const SAVED_LEGACY_KEY = "applenext-cart-saved";
const SAVED_CUSTOMER_PREFIX = "applenext-cart-saved:customer:";

export interface CartItem {
  id: string;
  itemId: string;
  itemName: string;
  brandName?: string;
  primaryImage?: string | null;
  offerPrice: number;
  originalPrice: number;
  qty: number;
  selected: boolean;
  categoryName?: string;
  variant?: string | null;
  colorId?: string | null;
  colorName?: string | null;
  gst?: number;
}

export interface CartItemInput {
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
}

interface CartContextValue {
  items: CartItem[];
  savedItems: CartItem[];
  itemCount: number;
  savedItemCount: number;
  totalQuantity: number;
  addItem: (item: CartItemInput, qty?: number) => void;
  removeItem: (id: string | number) => void;
  updateQty: (id: string | number, qty: number) => void;
  toggleSelected: (id: string | number, selected: boolean) => void;
  toggleSelectAll: (selected: boolean) => void;
  clearCart: () => void;
  saveForLater: (id: string | number) => void;
  moveToCart: (id: string | number) => void;
  removeSaved: (id: string | number) => void;
}

const CartContext = createContext<CartContextValue | null>(null);

function getStorageKey(customerId?: string | number | null) {
  return customerId ? `${CART_CUSTOMER_PREFIX}${customerId}` : CART_GUEST_KEY;
}

function getSavedStorageKey(customerId?: string | number | null) {
  return customerId ? `${SAVED_CUSTOMER_PREFIX}${customerId}` : SAVED_GUEST_KEY;
}

function readStoredItems(
  storageKey: string,
  legacyKey: string,
  normalize: (value: unknown) => CartItem | null
) {
  if (typeof window === "undefined") return [];

  for (const key of [storageKey, legacyKey]) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) continue;
      return parsed.map(normalize).filter(Boolean) as CartItem[];
    } catch {
      // ignore malformed cached data
    }
  }

  return [];
}

function writeStoredItems(storageKey: string, items: CartItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey, JSON.stringify(items));
}

function normalizeCartItem(input: CartItemInput | CartItem): CartItem {
  const itemId = String((input as CartItemInput).itemId ?? input.id);
  const colorId = (input as CartItemInput).colorId != null ? String((input as CartItemInput).colorId) : null;
  const offerPrice = Number(input.offerPrice ?? 0) || 0;
  const originalPrice = Number(input.originalPrice ?? offerPrice) || offerPrice;

  return {
    id: colorId ? `${itemId}::${colorId}` : String(input.id),
    itemId,
    itemName: input.itemName,
    brandName: input.brandName,
    primaryImage: input.primaryImage ?? null,
    offerPrice,
    originalPrice: originalPrice > 0 ? originalPrice : offerPrice,
    qty: Math.max(1, Number((input as CartItem).qty ?? 1) || 1),
    selected: (input as CartItem).selected !== false,
    categoryName: input.categoryName,
    variant: input.variant,
    colorId,
    colorName: (input as CartItemInput).colorName ?? null,
    gst: input.gst,
  };
}

function toCartItem(row: CustomerCartItem, fallback?: CartItem): CartItem {
  const offerPrice = Number(row.offerPrice ?? fallback?.offerPrice ?? 0) || 0;
  const originalPrice = Number(row.originalPrice ?? fallback?.originalPrice ?? offerPrice) || offerPrice;

  return {
    id: fallback?.id ?? String(row.id),
    itemId: String(row.id),
    itemName: row.itemName,
    brandName: row.brandName ?? fallback?.brandName,
    primaryImage: row.primaryImage ?? fallback?.primaryImage ?? null,
    offerPrice,
    originalPrice: originalPrice > 0 ? originalPrice : offerPrice,
    qty: Math.max(1, Number(row.qty ?? fallback?.qty ?? 1) || 1),
    selected: fallback?.selected !== false,
    categoryName: row.categoryName ?? fallback?.categoryName,
    variant: row.variant ?? fallback?.variant ?? null,
    colorId: fallback?.colorId ?? null,
    colorName: fallback?.colorName ?? null,
    gst: row.gst ?? fallback?.gst,
  };
}

export function cartItemFromItem(item: Item): CartItemInput {
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
    // Product cards carry the colour they represent (Product + Colour = card)
    colorId: item.selectedColorId ?? null,
    colorName: item.selectedColorName ?? null,
    gst: item.gst,
  };
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [savedItems, setSavedItems] = useState<CartItem[]>([]);
  const customerIdRef = useRef<string | null>(null);

  const loadCart = useCallback(async () => {
    const customer = getStoredCustomer();
    const customerId = customer ? String(customer.id) : null;
    customerIdRef.current = customerId;

    if (!customerId) {
      setItems(
        readStoredItems(getStorageKey(null), CART_LEGACY_KEY, (value) => normalizeCartItem(value as CartItem))
      );
      setSavedItems(
        readStoredItems(getSavedStorageKey(null), SAVED_LEGACY_KEY, (value) =>
          normalizeCartItem(value as CartItem)
        )
      );
      return;
    }

    const cachedCart = readStoredItems(
      getStorageKey(customerId),
      CART_LEGACY_KEY,
      (value) => normalizeCartItem(value as CartItem)
    );
    const cachedSaved = readStoredItems(
      getSavedStorageKey(customerId),
      SAVED_LEGACY_KEY,
      (value) => normalizeCartItem(value as CartItem)
    );

    const [cartResponse, savedResponse] = await Promise.all([
      customerCartAPI.getAll(),
      customerCartAPI.getSaved(),
    ]);

    if (cartResponse.success && Array.isArray(cartResponse.data)) {
      const remoteCart = cartResponse.data.map((row) => {
        const fallback = cachedCart.find((item) => item.itemId === String(row.id));
        return toCartItem(row, fallback);
      });
      const mergedCart = mergeWithCache(remoteCart, cachedCart);
      setItems(mergedCart);
      writeStoredItems(getStorageKey(customerId), mergedCart);
    } else {
      setItems(cachedCart);
    }

    if (savedResponse.success && Array.isArray(savedResponse.data)) {
      const remoteSaved = savedResponse.data.map((row) => {
        const fallback = cachedSaved.find((item) => item.itemId === String(row.id));
        return toCartItem(row, fallback);
      });
      const mergedSaved = mergeWithCache(remoteSaved, cachedSaved);
      setSavedItems(mergedSaved);
      writeStoredItems(getSavedStorageKey(customerId), mergedSaved);
    } else {
      setSavedItems(cachedSaved);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadCart();
    }, 0);
    const unsubscribe = onCustomerAuthChange(() => {
      void loadCart();
    });
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, [loadCart]);

  useEffect(() => {
    writeStoredItems(getStorageKey(customerIdRef.current), items);
  }, [items]);

  useEffect(() => {
    writeStoredItems(getSavedStorageKey(customerIdRef.current), savedItems);
  }, [savedItems]);

  const commitItems = useCallback((updater: (current: CartItem[]) => CartItem[]) => {
    setItems((current) => updater(current));
  }, []);

  const commitSaved = useCallback((updater: (current: CartItem[]) => CartItem[]) => {
    setSavedItems((current) => updater(current));
  }, []);

  const reloadCartOnFailure = useCallback(async (request: Promise<{ success: boolean }>) => {
    try {
      const response = await request;
      if (!response.success) {
        await loadCart();
      }
    } catch {
      await loadCart();
    }
  }, [loadCart]);

  const addItem = useCallback(
    (input: CartItemInput, qty = 1) => {
      const nextItem = normalizeCartItem({ ...input, qty } as CartItem);
      let existingQty = 0;
      let nextQty = qty;
      commitItems((current) => {
        const existing = current.find((item) => item.id === nextItem.id);
        if (existing) {
          existingQty = existing.qty;
          nextQty = Math.min(99, existing.qty + qty);
          return current.map((item) =>
            item.id === nextItem.id ? { ...item, qty: nextQty, selected: true } : item
          );
        }
        return [...current, nextItem];
      });

      if (customerIdRef.current) {
        if (existingQty > 0) {
          void reloadCartOnFailure(customerCartAPI.updateQty(nextItem.itemId, nextQty));
        } else {
          void reloadCartOnFailure(customerCartAPI.add(nextItem.itemId, qty, nextItem.offerPrice));
        }
      }
    },
    [commitItems, reloadCartOnFailure]
  );

  const removeItem = useCallback(
    (id: string | number) => {
      const normalizedId = String(id);
      const item = items.find((entry) => entry.id === normalizedId);
      commitItems((current) => current.filter((item) => item.id !== normalizedId));
      if (customerIdRef.current && item) {
        void reloadCartOnFailure(customerCartAPI.remove(item.itemId));
      }
    },
    [items, commitItems, reloadCartOnFailure]
  );

  const updateQty = useCallback(
    (id: string | number, qty: number) => {
      const normalizedId = String(id);
      const item = items.find((entry) => entry.id === normalizedId);
      const nextQty = Math.max(1, Math.min(99, Number(qty) || 1));
      commitItems((current) =>
        current.map((item) => (item.id === normalizedId ? { ...item, qty: nextQty } : item))
      );
      if (customerIdRef.current && item) {
        void reloadCartOnFailure(customerCartAPI.updateQty(item.itemId, nextQty));
      }
    },
    [items, commitItems, reloadCartOnFailure]
  );

  const toggleSelected = useCallback((id: string | number, selected: boolean) => {
    const normalizedId = String(id);
    commitItems((current) =>
      current.map((item) => (item.id === normalizedId ? { ...item, selected } : item))
    );
  }, [commitItems]);

  const toggleSelectAll = useCallback(
    (selected: boolean) => {
      commitItems((current) => current.map((item) => ({ ...item, selected })));
    },
    [commitItems]
  );

  const clearCart = useCallback(() => {
    commitItems(() => []);
    if (customerIdRef.current) {
      void reloadCartOnFailure(customerCartAPI.clear());
    }
  }, [commitItems, reloadCartOnFailure]);

  const saveForLater = useCallback(
    (id: string | number) => {
      const normalizedId = String(id);
      const item = items.find((entry) => entry.id === normalizedId);
      if (!item) return;

      commitItems((current) => current.filter((entry) => entry.id !== normalizedId));
      commitSaved((current) => {
        const existing = current.find((entry) => entry.id === normalizedId);
        if (existing) {
          return current.map((entry) => (entry.id === normalizedId ? { ...item, qty: 1 } : entry));
        }
        return [{ ...item, qty: 1, selected: true }, ...current];
      });

      if (customerIdRef.current) {
        void reloadCartOnFailure(customerCartAPI.saveForLater(item.itemId));
      }
    },
    [items, commitItems, commitSaved, reloadCartOnFailure]
  );

  const moveToCart = useCallback(
    (id: string | number) => {
      const normalizedId = String(id);
      const item = savedItems.find((entry) => entry.id === normalizedId);
      if (!item) return;

      commitSaved((current) => current.filter((entry) => entry.id !== normalizedId));
      commitItems((current) => {
        const existing = current.find((entry) => entry.id === normalizedId);
        if (existing) {
          return current.map((entry) =>
            entry.id === normalizedId ? { ...entry, qty: entry.qty + 1, selected: true } : entry
          );
        }
        return [...current, { ...item, qty: 1, selected: true }];
      });

      if (customerIdRef.current) {
        void reloadCartOnFailure(customerCartAPI.moveToCart(item.itemId));
      }
    },
    [savedItems, commitItems, commitSaved, reloadCartOnFailure]
  );

  const removeSaved = useCallback(
    (id: string | number) => {
      const normalizedId = String(id);
      const item = savedItems.find((entry) => entry.id === normalizedId);
      commitSaved((current) => current.filter((entry) => entry.id !== normalizedId));
      if (customerIdRef.current && item) {
        void reloadCartOnFailure(customerCartAPI.removeSaved(item.itemId));
      }
    },
    [savedItems, commitSaved, reloadCartOnFailure]
  );

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      savedItems,
      itemCount: items.length,
      savedItemCount: savedItems.length,
      totalQuantity: items.reduce((sum, item) => sum + item.qty, 0),
      addItem,
      removeItem,
      updateQty,
      toggleSelected,
      toggleSelectAll,
      clearCart,
      saveForLater,
      moveToCart,
      removeSaved,
    }),
    [
      items,
      savedItems,
      addItem,
      removeItem,
      updateQty,
      toggleSelected,
      toggleSelectAll,
      clearCart,
      saveForLater,
      moveToCart,
      removeSaved,
    ]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const value = useContext(CartContext);
  if (!value) {
    throw new Error("useCart must be used within CartProvider");
  }
  return value;
}
