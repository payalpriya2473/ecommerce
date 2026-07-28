// lib/api/customerApi.ts
// All customer-facing API calls (auth, cart, wishlist, profile)

import {
  BACKEND_ORIGIN,
  CUSTOMER_API_PROXY_BASE,
  buildBackendUrl,
} from "@/lib/api/config";

const BASE = CUSTOMER_API_PROXY_BASE;

export const CUSTOMER_AUTH_EVENT = "motabhai:customer-auth-change";

// ─── Token + session helpers ────────────────────────────────────────────────

export interface CustomerProfile {
  id: number;
  companyId?: number | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dob?: string;
  gender?: "male" | "female" | "other";
  avatarUrl?: string | null;
  isEmailVerified?: boolean;
  isPhoneVerified?: boolean;
  mbPoints?: number;
  createdAt?: string;
  updatedAt?: string;
  memberSince?: string;
}

export interface AuthResponse {
  customer: CustomerProfile;
  accessToken: string;
  refreshToken: string;
}

export interface CustomerAddress {
  id: string;
  type: "home" | "work" | "other";
  name: string;
  phone: string;
  line1: string;
  line2?: string;
  city?: string;
  state?: string;
  pinCode?: string;
  isDefault: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CustomerWishlistItem {
  id: string;
  itemName: string;
  brandName?: string | null;
  primaryImage?: string | null;
  offerPrice?: number;
  originalPrice?: number;
  categoryName?: string | null;
  variant?: string | null;
  gst?: number | null;
  isActive?: boolean;
  addedAt?: string;
}

export interface CustomerCartItem {
  id: string;
  itemName: string;
  brandName?: string | null;
  primaryImage?: string | null;
  offerPrice?: number;
  originalPrice?: number;
  categoryName?: string | null;
  variant?: string | null;
  gst?: number | null;
  isActive?: boolean;
  qty: number;
  addedAt?: string;
  updatedAt?: string | null;
}

function emitCustomerAuthChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CUSTOMER_AUTH_EVENT));
}

export function onCustomerAuthChange(handler: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CUSTOMER_AUTH_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(CUSTOMER_AUTH_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("mb_access_token");
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("mb_refresh_token");
}

export function getStoredCustomer(): CustomerProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("mb_customer");
    return raw ? (JSON.parse(raw) as CustomerProfile) : null;
  } catch {
    return null;
  }
}

export function saveTokens(accessToken: string, refreshToken: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem("mb_access_token", accessToken);
  localStorage.setItem("mb_refresh_token", refreshToken);
}

export function saveCustomer(customer: CustomerProfile) {
  if (typeof window === "undefined") return;
  localStorage.setItem("mb_customer", JSON.stringify(customer));
}

export function setAuthSession(session: AuthResponse) {
  saveTokens(session.accessToken, session.refreshToken);
  saveCustomer(session.customer);
  emitCustomerAuthChange();
}

export function clearTokens() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("mb_access_token");
  localStorage.removeItem("mb_refresh_token");
  localStorage.removeItem("mb_customer");
}

export function clearAuthSession() {
  clearTokens();
  emitCustomerAuthChange();
}

export function isLoggedIn(): boolean {
  return !!getAccessToken();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function baseUrl() {
  return BACKEND_ORIGIN;
}

function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

async function apiFetch<T>(
  url: string,
  options: RequestInit = {},
  retry = true
): Promise<{ success: boolean; data?: T; message?: string }> {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await fetch(url, { ...options, headers });
    const json = await res.json().catch(() => ({}));

    if (res.status === 401 && retry) {
      const refreshed = await tryRefresh();
      if (refreshed) return apiFetch(url, options, false);
      clearAuthSession();
      return { success: false, message: "Session expired. Please login again." };
    }

    return json;
  } catch {
    return { success: false, message: "Network error. Please try again." };
  }
}

async function tryRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    const json = await res.json().catch(() => ({}));
    if (json.success && json.data?.accessToken) {
      localStorage.setItem("mb_access_token", json.data.accessToken);
      emitCustomerAuthChange();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function extractImageUrl(value?: string | null) {
  if (!value) return null;
  return value.startsWith("http") ? value : buildBackendUrl(value);
}

function normalizeWishlistItem(
  row: CustomerWishlistItem,
  fallback?: Partial<CustomerWishlistItem>
): CustomerWishlistItem {
  return {
    id: String(row.id),
    itemName: row.itemName,
    brandName: row.brandName ?? fallback?.brandName ?? null,
    primaryImage: extractImageUrl(row.primaryImage ?? fallback?.primaryImage ?? null),
    offerPrice: Number(row.offerPrice ?? fallback?.offerPrice ?? 0) || 0,
    originalPrice: Number(row.originalPrice ?? fallback?.originalPrice ?? 0) || 0,
    categoryName: row.categoryName ?? fallback?.categoryName ?? null,
    variant: row.variant ?? fallback?.variant ?? null,
    gst: row.gst ?? fallback?.gst ?? null,
    isActive: row.isActive ?? fallback?.isActive ?? true,
    addedAt: row.addedAt ?? fallback?.addedAt ?? new Date().toISOString(),
  };
}

function normalizeCartItem(
  row: CustomerCartItem,
  fallback?: Partial<CustomerCartItem>
): CustomerCartItem {
  return {
    id: String(row.id),
    itemName: row.itemName,
    brandName: row.brandName ?? fallback?.brandName ?? null,
    primaryImage: extractImageUrl(row.primaryImage ?? fallback?.primaryImage ?? null),
    offerPrice: Number(row.offerPrice ?? fallback?.offerPrice ?? 0) || 0,
    originalPrice: Number(row.originalPrice ?? fallback?.originalPrice ?? 0) || 0,
    categoryName: row.categoryName ?? fallback?.categoryName ?? null,
    variant: row.variant ?? fallback?.variant ?? null,
    gst: row.gst ?? fallback?.gst ?? null,
    isActive: row.isActive ?? fallback?.isActive ?? true,
    qty: Math.max(1, Number(row.qty ?? fallback?.qty ?? 1) || 1),
    addedAt: row.addedAt ?? fallback?.addedAt ?? new Date().toISOString(),
    updatedAt: row.updatedAt ?? fallback?.updatedAt ?? null,
  };
}

function normalizeProfile(customer: CustomerProfile): CustomerProfile {
  return {
    ...customer,
    id: Number(customer.id),
    memberSince: customer.memberSince || customer.createdAt || new Date().toISOString(),
  };
}

function normalizeAddress(address: Partial<CustomerAddress> & { id: string | number }): CustomerAddress {
  return {
    id: String(address.id ?? ""),
    type: address.type || "home",
    name: address.name ?? "",
    phone: address.phone ?? "",
    line1: address.line1 ?? "",
    line2: address.line2 ?? undefined,
    city: address.city ?? undefined,
    state: address.state ?? undefined,
    pinCode: address.pinCode ?? undefined,
    isDefault: Boolean(address.isDefault),
    createdAt: address.createdAt ?? undefined,
    updatedAt: address.updatedAt ?? undefined,
  };
}

export function mergeWithCache<T extends { id: string }>(
  remoteItems: T[],
  cacheItems: T[]
): T[] {
  const cacheMap = new Map(cacheItems.map((item) => [String(item.id), item]));
  return remoteItems.map((item) => {
    const cached = cacheMap.get(String(item.id));
    return cached ? ({ ...cached, ...item, id: String(item.id) } as T) : item;
  });
}

// ─── AUTH APIs ────────────────────────────────────────────────────────────────

export const customerAuthAPI = {
  register: async (data: {
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    password: string;
    dob?: string;
    companyId?: number;
  }) => {
    const res = await fetch(`${BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return res.json() as Promise<{ success: boolean; data?: AuthResponse; message?: string }>;
  },

  login: async (identifier: string, password: string) => {
    const res = await fetch(`${BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password }),
    });
    return res.json() as Promise<{ success: boolean; data?: AuthResponse; message?: string }>;
  },

  sendOtp: async (phone: string, purpose: "login" | "register" | "forgot_password" = "login") => {
    const res = await fetch(`${BASE}/auth/send-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, purpose }),
    });
    return res.json() as Promise<{
      success: boolean;
      data?: { sent: boolean; otp?: string; delivery?: "dev" | "sms" | "unconfigured"; message?: string };
      message?: string;
    }>;
  },

  verifyOtp: async (data: {
    phone: string;
    otp: string;
    purpose?: string;
    firstName?: string;
    lastName?: string;
    companyId?: number;
  }) => {
    const res = await fetch(`${BASE}/auth/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return res.json() as Promise<{ success: boolean; data?: AuthResponse; message?: string }>;
  },

  socialLogin: async (data: {
    provider: "google" | "facebook";
    providerUid: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    avatarUrl?: string;
    profileData?: object;
  }) => {
    const res = await fetch(`${BASE}/auth/social`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return res.json() as Promise<{ success: boolean; data?: AuthResponse; message?: string }>;
  },

  logout: async () => {
    const refreshToken = getRefreshToken();
    await fetch(`${BASE}/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    }).catch(() => {});
    clearAuthSession();
  },
  forgotPasswordSendOtp: async (phone: string) => {
    const res = await fetch(`${BASE}/auth/forgot-password/send-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    return res.json() as Promise<{
      success: boolean;
      data?: { sent: boolean; otp?: string; delivery?: "dev" | "sms" | "unconfigured"; message?: string };
      message?: string;
    }>;
  },

  forgotPasswordSendEmail: async (email: string) => {
    const res = await fetch(`${BASE}/auth/forgot-password/send-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    return res.json() as Promise<{ success: boolean; data?: { sent: boolean; resetUrl?: string }; message?: string }>;
  },

  resetPassword: async (data: { phone?: string; otp?: string; token?: string; newPassword: string }) => {
    const res = await fetch(`${BASE}/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return res.json() as Promise<{ success: boolean; message?: string }>;
  },
};



// ─── WISHLIST APIs ────────────────────────────────────────────────────────────

export const customerWishlistAPI = {
  getAll: () => apiFetch<CustomerWishlistItem[]>(`${BASE}/wishlist`),

  add: (itemId: string | number) =>
    apiFetch(`${BASE}/wishlist`, {
      method: "POST",
      body: JSON.stringify({ itemId }),
    }),

  toggle: (itemId: string | number) =>
    apiFetch<{ added: boolean; itemId: string }>(`${BASE}/wishlist/toggle`, {
      method: "PUT",
      body: JSON.stringify({ itemId }),
    }),

  remove: (itemId: string | number) => apiFetch(`${BASE}/wishlist/${itemId}`, { method: "DELETE" }),

  clear: () => apiFetch(`${BASE}/wishlist`, { method: "DELETE" }),

  sync: (itemIds: (string | number)[]) =>
    apiFetch(`${BASE}/wishlist/sync`, {
      method: "POST",
      body: JSON.stringify({ itemIds }),
    }),

  normalizeItem: normalizeWishlistItem,
};

// ─── CART APIs ───────────────────────────────────────────────────────────────

export const customerCartAPI = {
  getAll: () => apiFetch<CustomerCartItem[]>(`${BASE}/cart`),

  add: (itemId: string | number, qty = 1, priceSnapshot?: number) =>
    apiFetch(`${BASE}/cart`, {
      method: "POST",
      body: JSON.stringify({ itemId, qty, priceSnapshot }),
    }),

  updateQty: (itemId: string | number, qty: number) =>
    apiFetch(`${BASE}/cart/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify({ qty }),
    }),

  remove: (itemId: string | number) => apiFetch(`${BASE}/cart/${itemId}`, { method: "DELETE" }),

  clear: () => apiFetch(`${BASE}/cart`, { method: "DELETE" }),

  sync: (items: { itemId: string | number; qty: number; priceSnapshot?: number }[]) =>
    apiFetch(`${BASE}/cart/sync`, {
      method: "POST",
      body: JSON.stringify({ items }),
    }),

  getSaved: () => apiFetch<CustomerCartItem[]>(`${BASE}/cart/saved`),

  saveForLater: (itemId: string | number) =>
    apiFetch(`${BASE}/cart/save-for-later`, {
      method: "POST",
      body: JSON.stringify({ itemId }),
    }),

  moveToCart: (itemId: string | number) =>
    apiFetch(`${BASE}/cart/move-to-cart`, {
      method: "POST",
      body: JSON.stringify({ itemId }),
    }),

  removeSaved: (itemId: string | number) =>
    apiFetch(`${BASE}/cart/saved/${itemId}`, { method: "DELETE" }),

  normalizeItem: normalizeCartItem,
};

// ─── ORDER APIs ──────────────────────────────────────────────────────────────

export interface CustomerOrderItem {
  id: string;
  itemId: string | null;
  itemName: string;
  brandName?: string | null;
  categoryName?: string | null;
  variant?: string | null;
  colorName?: string | null;
  primaryImage?: string | null;
  qty: number;
  unitPrice: number;
  originalPrice: number;
  gst: number;
  lineTotal: number;
}

export interface CustomerOrder {
  id: string;
  orderNumber: string;
  status: "processing" | "shipped" | "delivered" | "cancelled" | "returned";
  statusLabel: string;
  placedAt: string;
  updatedAt?: string | null;
  cancelledAt?: string | null;
  paymentMethod: string;
  paymentDetail?: string | null;
  paymentStatus: "pending" | "paid" | "failed" | "refunded";
  deliveryType: string;
  deliveryLabel?: string | null;
  couponCode?: string | null;
  subtotal: number;
  productDiscount: number;
  couponDiscount: number;
  platformDiscount: number;
  deliveryCharge: number;
  codFee: number;
  taxAmount: number;
  totalAmount: number;
  address: {
    id: string | null;
    type: string;
    name: string;
    phone: string;
    line1: string;
    line2?: string;
    city?: string;
    state?: string;
    pinCode?: string;
  };
  items: CustomerOrderItem[];
  unavailable?: string[];
}

export interface PlaceOrderPayload {
  items: Array<{
    itemId: string | number | null;
    qty: number;
    unitPrice?: number;
    originalPrice?: number;
    itemName?: string;
    brandName?: string | null;
    categoryName?: string | null;
    variant?: string | null;
    colorName?: string | null;
    primaryImage?: string | null;
    gst?: number | null;
  }>;
  addressId?: string | number | null;
  address?: {
    type?: string;
    name: string;
    phone: string;
    line1: string;
    line2?: string;
    city?: string;
    state?: string;
    pinCode?: string;
  };
  paymentMethod: "upi" | "card" | "netbanking" | "wallet" | "cod";
  paymentDetail?: string | null;
  deliveryType?: "free" | "express" | "scheduled";
  couponCode?: string | null;
  notes?: string | null;
}

export const customerOrderAPI = {
  getAll: () => apiFetch<CustomerOrder[]>(`${BASE}/orders`),

  getOne: (id: string | number) => apiFetch<CustomerOrder>(`${BASE}/orders/${id}`),

  place: (payload: PlaceOrderPayload) =>
    apiFetch<CustomerOrder>(`${BASE}/orders`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  cancel: (id: string | number) =>
    apiFetch<CustomerOrder>(`${BASE}/orders/${id}/cancel`, { method: "POST" }),
};

// ─── PROFILE APIs ────────────────────────────────────────────────────────────

export const customerProfileAPI = {
  get: () =>
    apiFetch<CustomerProfile>(`${BASE}/profile`).then((res) => {
      if (!res.success || !res.data) return res;
      return { ...res, data: normalizeProfile(res.data) };
    }),

  update: (data: Partial<CustomerProfile>) =>
    apiFetch<CustomerProfile>(`${BASE}/profile`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  changePassword: (currentPassword: string, newPassword: string) =>
    apiFetch(`${BASE}/profile/change-password`, {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  getAddresses: () =>
    apiFetch<CustomerAddress[]>(`${BASE}/profile/addresses`).then((res) => {
      if (!res.success || !res.data) return res;
      return { ...res, data: res.data.map(normalizeAddress) };
    }),

  addAddress: (address: Omit<CustomerAddress, "id">) =>
    apiFetch<CustomerAddress>(`${BASE}/profile/addresses`, {
      method: "POST",
      body: JSON.stringify(address),
    }),

  updateAddress: (id: string, address: Partial<CustomerAddress>) =>
    apiFetch<CustomerAddress>(`${BASE}/profile/addresses/${id}`, {
      method: "PATCH",
      body: JSON.stringify(address),
    }),

  deleteAddress: (id: string) => apiFetch(`${BASE}/profile/addresses/${id}`, { method: "DELETE" }),

  setDefaultAddress: (id: string) =>
    apiFetch(`${BASE}/profile/addresses/${id}/set-default`, { method: "POST" }),
};

export {
  baseUrl,
  extractImageUrl as getCustomerImageUrl,
  normalizeAddress,
  normalizeCartItem,
  normalizeProfile,
  normalizeWishlistItem,
  safeJsonParse,
};
