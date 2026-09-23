// lib/api/publicApi.ts

import {
  API_BASE_URL,
  BACKEND_ORIGIN,
  PUBLIC_API_PROXY_BASE,
  buildBackendUrl,
} from "@/lib/api/config";

export { API_BASE_URL, BACKEND_ORIGIN };
export const PUBLIC_API_URL = PUBLIC_API_PROXY_BASE;

export interface Category {
  id: string | number;
  name: string;
  marginPercent?: number;
  slug?: string;
  description?: string;
  categoryImage?: string;
  category_image?: string;
  displayOrder?: number;
  display_order?: number;
  showOnWebsite?: boolean;
  show_on_website?: boolean | number | string;
  isActive: boolean;
  createdAt?: string;
}

export interface Brand {
  id: string | number;
  name: string;
  iconUrl?: string | null;
  isActive: boolean;
  createdAt?: string;
}

export interface Item {
  id: string | number;
  itemGroupId?: string;
  openingStock?: number;
  stockValue?: number;
  brandId?: string | number;
  itemName: string;
  variant?: string | null;
  gst: number;
  hasDemoInstallation: boolean;
  isActive: boolean;
  description?: string;
  offerPrice?: number;
  nlc?: number;
  margin?: number;
  brandName?: string;
  categoryName?: string;
  categoryId?: string | number;
  primaryImage?: string | null;
  colors?: Array<{
    id: string | number | null;
    colorName?: string | null;
    colorHex?: string | null;
    sortOrder?: number | null;
    primaryImage?: string | null;
  }>;
  images?: Array<{
    id: string | number;
    imageUrl: string;
    sortOrder?: number;
  }>;
  variantsWithColors?: Array<{
    id: string | number;
    itemName: string;
    variant?: string | null;
    gst: number;
    hasDemoInstallation: boolean;
    isActive: boolean;
    offerPrice?: number;
    nlc?: number;
    margin?: number;
    brandName?: string;
    categoryName?: string;
    categoryId?: string | number;
    primaryImage: string | null;
    colors: Array<{
      id: string | number | null;
      colorName: string;
      colorHex: string | null;
      sortOrder: number;
      images: Array<{
        id: string | number;
        imageUrl: string;
        sortOrder: number;
      }>;
      primaryImage: string | null;
    }>;
    images?: Array<{
      id: string | number;
      imageUrl: string;
      sortOrder?: number;
    }>;
  }>;
  itemGroupName?: string;
  createdAt?: string;
}

export interface ItemPrice {
  offerPrice: number;
  originalPrice: number;
  discountPercent: number;
}

export interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  pagination?: Pagination;
}

export interface ItemsFilter {
  categoryId?: string | number;
  brandId?: string | number;
  ids?: Array<string | number>;
  search?: string;
  page?: number;
  limit?: number;
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeVariantColor(color: NonNullable<Item["colors"]>[number]) {
  return {
    ...color,
    sortOrder: toNumber(color.sortOrder),
  };
}

function normalizeVariantItem(
  variant: NonNullable<Item["variantsWithColors"]>[number]
): NonNullable<Item["variantsWithColors"]>[number] {
  return {
    ...variant,
    gst: toNumber(variant.gst),
    offerPrice: toNumber(variant.offerPrice),
    nlc: toNumber(variant.nlc),
    margin: toNumber(variant.margin),
    colors: Array.isArray(variant.colors)
      ? variant.colors.map((color) => ({
          ...color,
          sortOrder: toNumber(color.sortOrder),
          images: Array.isArray(color.images)
            ? color.images.map((image) => ({
                ...image,
                sortOrder: toNumber(image.sortOrder),
              }))
            : [],
        }))
      : [],
    images: Array.isArray(variant.images)
      ? variant.images.map((image) => ({
          ...image,
          sortOrder: toNumber(image.sortOrder),
        }))
      : [],
  };
}

function normalizeItem(item: Item): Item {
  return {
    ...item,
    gst: toNumber(item.gst),
    offerPrice: toNumber(item.offerPrice),
    nlc: toNumber(item.nlc),
    margin: toNumber(item.margin),
    openingStock: toNumber(item.openingStock),
    stockValue: toNumber(item.stockValue),
    colors: Array.isArray(item.colors) ? item.colors.map(normalizeVariantColor) : [],
    images: Array.isArray(item.images)
      ? item.images.map((image) => ({
          ...image,
          sortOrder: toNumber(image.sortOrder),
        }))
      : [],
    variantsWithColors: Array.isArray(item.variantsWithColors)
      ? item.variantsWithColors.map(normalizeVariantItem)
      : [],
  };
}

async function apiFetch<T>(path: string): Promise<ApiResponse<T>> {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${PUBLIC_API_URL}${normalizedPath}`;

  try {
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });
    const contentType = res.headers.get("content-type") || "";
    const rawBody = await res.text().catch(() => "");
    const isJson = contentType.includes("application/json");
    const isHtml = contentType.includes("text/html") || /^\s*</.test(rawBody);
    const parsedBody = isJson && rawBody
      ? (JSON.parse(rawBody) as ApiResponse<T> | { message?: string })
      : null;

    if (!isJson) {
      return {
        success: false,
        data: null as T,
        message: isHtml
          ? "Server returned an HTML page instead of product data"
          : rawBody.slice(0, 200) || "Invalid response from server",
      };
    }

    if (!res.ok) {
      return {
        success: false,
        data: null as T,
        message:
          parsedBody?.message ||
          (isHtml ? "Product service is unavailable right now" : "") ||
          `${res.status} ${res.statusText}`,
      };
    }

    return parsedBody as ApiResponse<T>;
  } catch (error: unknown) {
    console.error("[publicApi] fetch error:", path, error);
    return {
      success: false,
      data: null as T,
      message: error instanceof Error ? error.message : "Network error",
    };
  }
}

function normalizeCategory(c: Category): Category {
  const fallback =
    c.show_on_website === true ||
    c.show_on_website === 1 ||
    c.show_on_website === "1" ||
    c.show_on_website === "true";

  const showOnWebsite =
    typeof c.showOnWebsite === "boolean" ? c.showOnWebsite : fallback;

  return {
    ...c,
    categoryImage: c.categoryImage || c.category_image || undefined,
    slug: c.slug || slugifyCategoryName(c.name),
    displayOrder: c.displayOrder ?? c.display_order,
    showOnWebsite: Boolean(showOnWebsite),
  };
}

export function slugifyCategoryName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getCategorySlug(category: Pick<Category, "name" | "slug">): string {
  const slug =
    typeof category.slug === "string" ? category.slug.trim() : "";
  return slug || slugifyCategoryName(category.name);
}

export function getCategoryUrl(category: Pick<Category, "id" | "name" | "slug">): string {
  const slug = getCategorySlug(category);
  return `/products?category=${encodeURIComponent(slug)}&categoryId=${encodeURIComponent(
    String(category.id)
  )}`;
}

export const publicCategoryAPI = {
  getAll: async (options?: {
    showOnWebsite?: boolean;
  }): Promise<Category[]> => {
    const params = new URLSearchParams();

    if (options?.showOnWebsite) params.append("showOnWebsite", "true");

    const qs = params.toString();
    const path = qs ? `/categories?${qs}` : "/categories";

    const res = await apiFetch<Category[]>(path);
    return res.success && Array.isArray(res.data)
      ? res.data.map(normalizeCategory)
      : [];
  },
};

export const publicBrandAPI = {
  getAll: async (): Promise<Brand[]> => {
    const res = await apiFetch<Brand[]>("/brands");
    return res.success && Array.isArray(res.data) ? res.data : [];
  },
};

export const publicItemAPI = {
  getById: async (itemId: string | number): Promise<Item | null> => {
    if (itemId == null || itemId === "") return null;

    const res = await apiFetch<Item>(`/items/${encodeURIComponent(String(itemId))}`);
    return res.success && res.data ? normalizeItem(res.data) : null;
  },

  getAll: async (
    filter?: ItemsFilter
  ): Promise<{ items: Item[]; pagination: Pagination }> => {
    const params = new URLSearchParams();

    if (filter?.categoryId != null) params.append("categoryId", String(filter.categoryId));
    if (filter?.brandId != null) params.append("brandId", String(filter.brandId));
    if (filter?.ids?.length) {
      params.append(
        "ids",
        filter.ids.map((id) => String(id)).join(",")
      );
    }
    if (filter?.search) params.append("search", filter.search);
    if (filter?.page) params.append("page", String(filter.page));
    if (filter?.limit) params.append("limit", String(filter.limit));

    const qs = params.toString();
    const path = qs ? `/items?${qs}` : "/items";

    const res = await apiFetch<Item[]>(path);
    return {
      items:
        res.success && Array.isArray(res.data)
          ? res.data.map(normalizeItem)
          : [],
      pagination: res.pagination || {
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 1,
      },
    };
  },
};

// ─── Offers (flash sale, today's best, bank offers, etc.) ───────────────────
export interface PublicOffer {
  id: string | number;
  itemId: string | number | null;
  section: string;
  badge?: string | null;
  couponCode?: string | null;
  discountType?: "percent" | "amount" | null;
  discountPercent?: number | null;
  discountAmount?: number | null;
  offerPrice?: number | null;
  soldPercent?: number | null;
  stockLeft?: number | null;
  priority?: number | null;
  isActive?: boolean | number;
  startAt?: string | null;
  endAt?: string | null;
  // joined product fields
  itemName?: string | null;
  variant?: string | null;
  brandName?: string | null;
  itemGroupName?: string | null;
  mrp?: number | null;
  primaryImage?: string | null;
  // bank offer fields
  bankName?: string | null;
  bankAbbr?: string | null;
  offerText?: string | null;
  offerSub?: string | null;
  description?: string | null;
  tags?: string[];
  colorTheme?: string | null;
  // combo deal fields
  comboTitle?: string | null;
  comboItems?: Array<{ itemId: string | number; itemName?: string; price?: number }>;
  // coupon fields
  couponTitle?: string | null;
  categoryLabel?: string | null;
  minOrder?: number | null;
  maxOff?: number | null;
  validTill?: string | null;
  // brand deal fields
  brandId?: string | number | null;
  brandDealName?: string | null;
  discountLabel?: string | null;
  // Joined from Brands Master (resolved via brandId)
  brandMasterName?: string | null;
  brandLogo?: string | null;
  // exchange offer fields
  exchangeTitle?: string | null;
  exchangePartnerName?: string | null;
  ctaText?: string | null;
  productIds?: Array<string | number>;
  productCount?: number | null;
}

export const publicOfferAPI = {
  getBySection: async (section: string): Promise<PublicOffer[]> => {
    const res = await apiFetch<PublicOffer[]>(`/offers?section=${encodeURIComponent(section)}`);
    return res.success && Array.isArray(res.data) ? res.data : [];
  },
  getAll: async (): Promise<PublicOffer[]> => {
    const res = await apiFetch<PublicOffer[]>(`/offers`);
    return res.success && Array.isArray(res.data) ? res.data : [];
  },
  // Offers assigned to a specific product (its own product offers + linked offers)
  getForProduct: async (itemId: string | number): Promise<PublicOffer[]> => {
    const res = await apiFetch<PublicOffer[]>(`/offers?itemId=${encodeURIComponent(String(itemId))}`);
    return res.success && Array.isArray(res.data) ? res.data : [];
  },
};

// Shared color themes for bank offer cards (must match admin OfferForm)
export const BANK_THEME_GRADIENTS: Record<string, string> = {
  blue:   "linear-gradient(135deg,#0052cc,#003d99)",
  green:  "linear-gradient(135deg,#1a6b3a,#145230)",
  orange: "linear-gradient(135deg,#b45309,#92400e)",
  purple: "linear-gradient(135deg,#7c3aed,#5b21b6)",
  red:    "linear-gradient(135deg,#dc2626,#991b1b)",
  teal:   "linear-gradient(135deg,#0369a1,#075985)",
  dark:   "linear-gradient(135deg,#1e293b,#0f172a)",
};

export function bankOfferGradient(theme?: string | null): string {
  return BANK_THEME_GRADIENTS[theme || "blue"] || BANK_THEME_GRADIENTS.blue;
}

// Soft pastel card backgrounds for Brand Deal cards (must match the admin
// OfferForm's BRAND_DEAL_PASTELS). Distinct from BANK_THEME_GRADIENTS, which
// are bold/dark and meant for Bank Offer / Coupon cards with white text.
export const BRAND_DEAL_PASTELS: Record<string, string> = {
  blue:   "#eff6ff",
  green:  "#f0fdf4",
  orange: "#fff7ed",
  purple: "#fdf4ff",
  red:    "#fef2f2",
  teal:   "#f0fdfa",
  dark:   "#f1f5f9",
};

export function brandDealPastel(theme?: string | null): string {
  // A custom colour picked via the admin's "+" swatch is stored as a raw hex
  // string (e.g. "#a1b2c3") instead of one of the preset keys above.
  if (theme && theme.startsWith("#")) return theme;
  return BRAND_DEAL_PASTELS[theme || "dark"] || BRAND_DEAL_PASTELS.dark;
}

export function getItemOfferPrice(item: Pick<Item, "offerPrice" | "nlc">): number {
  return Number(item.offerPrice ?? item.nlc ?? 0) || 0;
}

export function getItemOriginalPrice(
  item: Pick<Item, "offerPrice" | "nlc" | "margin">
): number {
  const offerPrice = getItemOfferPrice(item);
  const nlc = Number(item.nlc ?? 0) || 0;

  if (nlc > offerPrice) return nlc;
  if (item.margin != null && offerPrice > 0) {
    return Math.round(offerPrice * (1 + Number(item.margin) / 100));
  }

  return offerPrice;
}

export function getItemDiscountPercent(
  item: Pick<Item, "offerPrice" | "nlc" | "margin">
): number {
  const offerPrice = getItemOfferPrice(item);
  const originalPrice = getItemOriginalPrice(item);

  if (originalPrice <= offerPrice || originalPrice <= 0) return 0;
  return Math.round(((originalPrice - offerPrice) / originalPrice) * 100);
}

export function getItemPrice(item: Pick<Item, "offerPrice" | "nlc" | "margin">): ItemPrice {
  const offerPrice = getItemOfferPrice(item);
  const originalPrice = getItemOriginalPrice(item);

  return {
    offerPrice,
    originalPrice,
    discountPercent: getItemDiscountPercent(item),
  };
}

export function getImageUrl(
  path?: string | null,
  fallback = "/placeholder.svg"
): string {
  if (!path) return fallback;
  if (path.startsWith("http")) return path;
  const clean = path.startsWith("/") ? path.slice(1) : path;
  return buildBackendUrl(clean);
}
