"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  customerProfileAPI,
  getStoredCustomer,
  onCustomerAuthChange,
  type CustomerAddress,
  type CustomerProfile,
} from "@/lib/api/customerApi";

const ACCOUNT_GUEST_KEY = "motabhai-account:guest";
const ACCOUNT_LEGACY_KEY = "motabhai-account";
const ACCOUNT_CUSTOMER_PREFIX = "motabhai-account:customer:";

export type AccountPanelSettingKey =
  | "orderUpdates"
  | "offersPromotions"
  | "priceDropAlerts"
  | "whatsAppNotifications"
  | "twoFactorAuth"
  | "loginActivityAlerts"
  | "personalisedRecommendations";

export interface AccountProfile {
  id?: number;
  companyId?: number | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dob: string;
  gender: "male" | "female" | "other";
  memberSince: string;
  avatarUrl?: string | null;
  isEmailVerified?: boolean;
  isPhoneVerified?: boolean;
  mbPoints?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface AccountAddress {
  id: string;
  type: "home" | "work" | "other";
  name: string;
  line1: string;
  line2: string;
  phone: string;
  city?: string;
  state?: string;
  pinCode?: string;
  isDefault: boolean;
}

export interface AccountOrderItem {
  id: string;
  name: string;
  img?: string | null;
  qty: number;
  price: number;
}

export interface AccountOrder {
  id: string;
  date: string;
  status: "processing" | "shipped" | "delivered" | "cancelled" | "returned";
  statusLabel: string;
  items: AccountOrderItem[];
  total: number;
  canReturn: boolean;
  canTrack: boolean;
}

export interface AccountSettings {
  orderUpdates: boolean;
  offersPromotions: boolean;
  priceDropAlerts: boolean;
  whatsAppNotifications: boolean;
  twoFactorAuth: boolean;
  loginActivityAlerts: boolean;
  personalisedRecommendations: boolean;
}

interface StoredAccountData {
  profile: AccountProfile;
  addresses: AccountAddress[];
  orders: AccountOrder[];
  settings: AccountSettings;
}

interface AccountContextValue {
  profile: AccountProfile;
  addresses: AccountAddress[];
  orders: AccountOrder[];
  settings: AccountSettings;
  saveProfile: (profile: AccountProfile) => Promise<void>;
  addAddress: (address: Omit<AccountAddress, "id">) => Promise<void>;
  updateAddress: (id: string, address: Omit<AccountAddress, "id">) => Promise<void>;
  removeAddress: (id: string) => Promise<void>;
  setDefaultAddress: (id: string) => Promise<void>;
  addOrder: (order: AccountOrder) => void;
  updateSetting: (key: AccountPanelSettingKey, value: boolean) => void;
}

const defaultProfile: AccountProfile = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  dob: "",
  gender: "male",
  memberSince: new Date().toISOString(),
};

const defaultSettings: AccountSettings = {
  orderUpdates: true,
  offersPromotions: true,
  priceDropAlerts: true,
  whatsAppNotifications: false,
  twoFactorAuth: false,
  loginActivityAlerts: true,
  personalisedRecommendations: true,
};

const AccountContext = createContext<AccountContextValue | null>(null);

function getStorageKey(customerId?: string | number | null) {
  return customerId ? `${ACCOUNT_CUSTOMER_PREFIX}${customerId}` : ACCOUNT_GUEST_KEY;
}

function normalizeProfile(input?: Partial<AccountProfile>): AccountProfile {
  return {
    ...defaultProfile,
    ...input,
    dob: input?.dob ?? "",
    memberSince: input?.memberSince || input?.createdAt || defaultProfile.memberSince,
  };
}

function normalizeSettings(input?: Partial<AccountSettings>): AccountSettings {
  return {
    ...defaultSettings,
    ...input,
  };
}

function normalizeAddress(address: Partial<AccountAddress> & { id: string | number }): AccountAddress {
  return {
    id: String(address.id),
    type: address.type ?? "home",
    name: address.name ?? "",
    line1: address.line1 ?? "",
    line2: address.line2 ?? "",
    phone: address.phone ?? "",
    city: address.city,
    state: address.state,
    pinCode: address.pinCode,
    isDefault: Boolean(address.isDefault),
  };
}

function normalizeOrder(order: AccountOrder): AccountOrder {
  return {
    ...order,
    id: String(order.id),
    items: order.items.map((item) => ({
      ...item,
      id: String(item.id),
    })),
  };
}

function readStoredAccount(customerId?: string | number | null): StoredAccountData | null {
  if (typeof window === "undefined") return null;

  const keys = customerId
    ? [getStorageKey(customerId), ACCOUNT_LEGACY_KEY]
    : [ACCOUNT_GUEST_KEY, ACCOUNT_LEGACY_KEY];

  for (const key of keys) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as Partial<StoredAccountData>;
      return {
        profile: normalizeProfile(parsed.profile),
        addresses: Array.isArray(parsed.addresses) ? parsed.addresses.map(normalizeAddress) : [],
        orders: Array.isArray(parsed.orders) ? parsed.orders.map(normalizeOrder) : [],
        settings: normalizeSettings(parsed.settings),
      };
    } catch {
      // ignore malformed cache
    }
  }

  return null;
}

function writeStoredAccount(customerId: string | number | null | undefined, data: StoredAccountData) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(getStorageKey(customerId), JSON.stringify(data));
}

function profileFromApi(customer: CustomerProfile): AccountProfile {
  return normalizeProfile({
    id: customer.id,
    companyId: customer.companyId ?? null,
    firstName: customer.firstName ?? "",
    lastName: customer.lastName ?? "",
    email: customer.email ?? "",
    phone: customer.phone ?? "",
    dob: customer.dob ?? "",
    gender: customer.gender ?? "male",
    avatarUrl: customer.avatarUrl ?? null,
    isEmailVerified: customer.isEmailVerified,
    isPhoneVerified: customer.isPhoneVerified,
    mbPoints: customer.mbPoints ?? 0,
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt,
    memberSince: customer.memberSince ?? customer.createdAt ?? new Date().toISOString(),
  });
}

function addressFromApi(address: CustomerAddress): AccountAddress {
  return normalizeAddress({
    id: address.id,
    type: address.type,
    name: address.name,
    line1: address.line1,
    line2: address.line2 ?? "",
    phone: address.phone,
    city: address.city,
    state: address.state,
    pinCode: address.pinCode,
    isDefault: address.isDefault,
  });
}

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<AccountProfile>(defaultProfile);
  const [addresses, setAddresses] = useState<AccountAddress[]>([]);
  const [orders, setOrders] = useState<AccountOrder[]>([]);
  const [settings, setSettings] = useState<AccountSettings>(defaultSettings);
  const customerIdRef = useRef<string | null>(null);

  const loadAccount = useCallback(async () => {
    const customer = getStoredCustomer();
    const customerId = customer ? String(customer.id) : null;
    customerIdRef.current = customerId;

    const cached = readStoredAccount(customerId);
    if (!customerId) {
      if (cached) {
        setProfile(cached.profile);
        setAddresses(cached.addresses);
        setOrders(cached.orders);
        setSettings(cached.settings);
      } else {
        setProfile(defaultProfile);
        setAddresses([]);
        setOrders([]);
        setSettings(defaultSettings);
      }
      return;
    }

    if (cached) {
      setProfile(cached.profile);
      setAddresses(cached.addresses);
      setOrders(cached.orders);
      setSettings(cached.settings);
    }

    const [profileResponse, addressesResponse] = await Promise.all([
      customerProfileAPI.get(),
      customerProfileAPI.getAddresses(),
    ]);

    const nextProfile = profileResponse.success && profileResponse.data
      ? profileFromApi(profileResponse.data)
      : cached?.profile ?? profileFromApi(customer as CustomerProfile);
    const nextAddresses =
      addressesResponse.success && Array.isArray(addressesResponse.data)
        ? addressesResponse.data.map(addressFromApi)
        : cached?.addresses ?? [];

    setProfile(nextProfile);
    setAddresses(nextAddresses);
    setOrders(cached?.orders ?? []);
    setSettings(cached?.settings ?? defaultSettings);

    writeStoredAccount(customerId, {
      profile: nextProfile,
      addresses: nextAddresses,
      orders: cached?.orders ?? [],
      settings: cached?.settings ?? defaultSettings,
    });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAccount();
    }, 0);
    const unsubscribe = onCustomerAuthChange(() => {
      void loadAccount();
    });
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, [loadAccount]);

  useEffect(() => {
    writeStoredAccount(customerIdRef.current, {
      profile,
      addresses,
      orders,
      settings,
    });
  }, [profile, addresses, orders, settings]);

  const saveProfile = useCallback(async (nextProfile: AccountProfile) => {
    const normalized = normalizeProfile(nextProfile);
    setProfile(normalized);
    writeStoredAccount(customerIdRef.current, {
      profile: normalized,
      addresses,
      orders,
      settings,
    });

    if (!customerIdRef.current) return;

    const response = await customerProfileAPI.update({
      firstName: normalized.firstName,
      lastName: normalized.lastName,
      dob: normalized.dob || undefined,
      gender: normalized.gender,
    });

    if (response.success && response.data) {
      const refreshed = profileFromApi(response.data);
      setProfile(refreshed);
      writeStoredAccount(customerIdRef.current, {
        profile: refreshed,
        addresses,
        orders,
        settings,
      });
    }
  }, [addresses, orders, settings]);

  const addAddress = useCallback(async (address: Omit<AccountAddress, "id">) => {
    const nextAddress = normalizeAddress({ ...address, id: `${Date.now()}` });
    if (!customerIdRef.current) {
      setAddresses((current) => {
        const next = address.isDefault
          ? current.map((item) => ({ ...item, isDefault: false }))
          : current;
        return [...next, nextAddress];
      });
      return;
    }

    const response = await customerProfileAPI.addAddress({
      type: address.type,
      name: address.name,
      phone: address.phone,
      line1: address.line1,
      line2: address.line2 || undefined,
      city: address.city || undefined,
      state: address.state || undefined,
      pinCode: address.pinCode || undefined,
      isDefault: address.isDefault,
    });

    if (response.success && response.data) {
      const created = addressFromApi(response.data as CustomerAddress);
      setAddresses((current) => {
        const next = address.isDefault
          ? current.map((item) => ({ ...item, isDefault: false }))
          : current;
        return [...next, created];
      });
    }
  }, []);

  const updateAddress = useCallback(async (id: string, address: Omit<AccountAddress, "id">) => {
    if (!customerIdRef.current) {
      setAddresses((current) =>
        current.map((item) =>
          item.id === id
            ? { ...address, id }
            : address.isDefault
              ? { ...item, isDefault: false }
              : item
        )
      );
      return;
    }

    const response = await customerProfileAPI.updateAddress(id, {
      type: address.type,
      name: address.name,
      phone: address.phone,
      line1: address.line1,
      line2: address.line2,
      city: address.city,
      state: address.state,
      pinCode: address.pinCode,
      isDefault: address.isDefault,
    });

    if (response.success && response.data) {
      const updated = addressFromApi(response.data as CustomerAddress);
      setAddresses((current) =>
        current.map((item) =>
          item.id === id
            ? updated
            : address.isDefault
              ? { ...item, isDefault: false }
              : item
        )
      );
    }
  }, []);

  const removeAddress = useCallback(async (id: string) => {
    const target = addresses.find((item) => item.id === id);
    if (target?.isDefault) return;

    if (!customerIdRef.current) {
      setAddresses((current) => current.filter((item) => item.id !== id));
      return;
    }

    const response = await customerProfileAPI.deleteAddress(id);
    if (response.success) {
      setAddresses((current) => current.filter((item) => item.id !== id));
    }
  }, [addresses]);

  const setDefaultAddress = useCallback(async (id: string) => {
    if (!customerIdRef.current) {
      setAddresses((current) =>
        current.map((item) => ({
          ...item,
          isDefault: item.id === id,
        }))
      );
      return;
    }

    const response = await customerProfileAPI.setDefaultAddress(id);
    if (response.success) {
      setAddresses((current) =>
        current.map((item) => ({
          ...item,
          isDefault: item.id === id,
        }))
      );
    }
  }, []);

  const addOrder = useCallback((order: AccountOrder) => {
    setOrders((current) => [normalizeOrder(order), ...current]);
  }, []);

  const updateSetting = useCallback((key: AccountPanelSettingKey, value: boolean) => {
    setSettings((current) => ({
      ...current,
      [key]: value,
    }));
  }, []);

  const value = useMemo<AccountContextValue>(
    () => ({
      profile,
      addresses,
      orders,
      settings,
      saveProfile,
      addAddress,
      updateAddress,
      removeAddress,
      setDefaultAddress,
      addOrder,
      updateSetting,
    }),
    [
      profile,
      addresses,
      orders,
      settings,
      saveProfile,
      addAddress,
      updateAddress,
      removeAddress,
      setDefaultAddress,
      addOrder,
      updateSetting,
    ]
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount() {
  const value = useContext(AccountContext);
  if (!value) {
    throw new Error("useAccount must be used within AccountProvider");
  }
  return value;
}
