"use client";

import { useEffect, useMemo, useState } from "react";
import {
  publicItemAPI,
  publicCategoryAPI,
  Item,
  Category,
  Pagination,
  getCategorySlug,
} from "@/lib/api/publicApi";

export interface DerivedBrand {
  id: string;
  name: string;
  count: number;
}

export interface DerivedItemGroup {
  id: string;
  name: string;
  count: number;
}

export type SortValue =
  | "relevance"
  | "price-low"
  | "price-high"
  | "rating"
  | "discount"
  | "newest";

export interface CategoryPageFilters {
  brands: string[];
  priceRanges: string[];
  itemGroups: string[];
  stockStates: string[];
  ratings: string[];
  search: string;
}

export interface UseCategoryPageReturn {
  category: Category | null;
  allItems: Item[];
  pagination: Pagination;
  loading: boolean;
  error: string | null;
  availableBrands: DerivedBrand[];
  availableItemGroups: DerivedItemGroup[];
  filters: CategoryPageFilters;
  sortValue: SortValue;
  filteredItems: Item[];
  setFilters: (f: CategoryPageFilters) => void;
  toggleBrand: (id: string) => void;
  togglePriceRange: (range: string) => void;
  toggleItemGroup: (id: string) => void;
  toggleStockState: (state: string) => void;
  toggleRating: (r: string) => void;
  setSearch: (q: string) => void;
  setSortValue: (s: SortValue) => void;
  clearFilters: () => void;
  currentPage: number;
  setCurrentPage: (p: number) => void;
  activeFilterTags: { key: keyof CategoryPageFilters; value: string; label: string }[];
}

export const PRICE_RANGES = [
  { label: "Under Rs 15,000",          value: "0-15000",       min: 0,      max: 15000  },
  { label: "Rs 15,000 - Rs 30,000",     value: "15000-30000",   min: 15000,  max: 30000  },
  { label: "Rs 30,000 - Rs 60,000",     value: "30000-60000",   min: 30000,  max: 60000  },
  { label: "Rs 60,000 - Rs 1,00,000",   value: "60000-100000",  min: 60000,  max: 100000 },
  { label: "Above Rs 1,00,000",        value: "100000-999999", min: 100000, max: 999999 },
];

const DEFAULT_FILTERS: CategoryPageFilters = {
  brands: [],
  priceRanges: [],
  itemGroups: [],
  stockStates: [],
  ratings: [],
  search: "",
};

export const STOCK_FILTERS = [
  { label: "In Stock", value: "in-stock" },
  { label: "Out of Stock", value: "out-of-stock" },
];

function normalizeCategoryIdentifier(value?: string | number | null): string {
  if (value == null) return "";
  return String(value).trim().toLowerCase();
}

function resolveCategory(
  categories: Category[],
  categoryRef?: string,
  categoryId?: string
): Category | null {
  // 1. Try match by ID first (most reliable)
  const normalizedId = normalizeCategoryIdentifier(categoryId);
  if (normalizedId) {
    const byId = categories.find(
      (c) => normalizeCategoryIdentifier(c.id) === normalizedId
    );
    if (byId) return byId;
  }

  // 2. Fallback: match by slug or name
  const normalizedRef = normalizeCategoryIdentifier(categoryRef);
  if (!normalizedRef) return null;

  return (
    categories.find((c) => {
      const slug = normalizeCategoryIdentifier(getCategorySlug(c));
      const name = normalizeCategoryIdentifier(c.name);
      const id   = normalizeCategoryIdentifier(c.id);
      return slug === normalizedRef || name === normalizedRef || id === normalizedRef;
    }) ?? null
  );
}

export function useCategoryPage(
  categoryRef?: string,
  selectedCategoryId?: string
): UseCategoryPageReturn {
  const categoryStateKey = `${categoryRef ?? ""}::${selectedCategoryId ?? ""}`;

  const [category,   setCategory  ] = useState<Category | null>(null);
  const [allItems,   setAllItems  ] = useState<Item[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ total: 0, page: 1, limit: 200, totalPages: 1 });
  const [loading,    setLoading   ] = useState(true);
  const [error,      setError     ] = useState<string | null>(null);
  const [filtersState, setFiltersState] = useState<{
    key: string;
    value: CategoryPageFilters;
  }>({
    key: categoryStateKey,
    value: DEFAULT_FILTERS,
  });
  const [sortValue,  setSortValue ] = useState<SortValue>("relevance");
  const [currentPageState, setCurrentPageState] = useState<{
    key: string;
    value: number;
  }>({
    key: categoryStateKey,
    value: 1,
  });

  const filters =
    filtersState.key === categoryStateKey ? filtersState.value : DEFAULT_FILTERS;
  const currentPage =
    currentPageState.key === categoryStateKey ? currentPageState.value : 1;

  function setFilters(next: CategoryPageFilters | ((f: CategoryPageFilters) => CategoryPageFilters)) {
    setFiltersState((state) => {
      const baseFilters =
        state.key === categoryStateKey ? state.value : DEFAULT_FILTERS;
      return {
        key: categoryStateKey,
        value: typeof next === "function" ? next(baseFilters) : next,
      };
    });
  }

  function setCurrentPage(page: number) {
    setCurrentPageState({
      key: categoryStateKey,
      value: page,
    });
  }

  // ── Core fetch: re-runs whenever category params change ──────────────────
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setAllItems([]);
      setCategory(null);

      try {
        // Step 1: Fetch all categories to resolve the current one
        const categories = await publicCategoryAPI.getAll();

        const resolvedCategory = resolveCategory(
          categories,
          categoryRef,
          selectedCategoryId
        );

        // If a specific category was requested but not found → show error
        if ((categoryRef || selectedCategoryId) && !resolvedCategory) {
          if (!cancelled) {
            setError("Category not found");
            setLoading(false);
          }
          return;
        }

        if (!cancelled) setCategory(resolvedCategory);

        // Step 2: Fetch items filtered by categoryId
        // Backend joins items → item_groups → categories via ig.categoryId
        // So passing categoryId here correctly returns only that category's items
        const result = await publicItemAPI.getAll({
          categoryId: resolvedCategory?.id,   // ← undefined = all products
          limit: 500,
          page:  1,
        });

        if (!cancelled) {
          setAllItems(result.items);
          setPagination(result.pagination);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load products");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    // Cleanup: if categoryRef/selectedCategoryId changes mid-flight, ignore old result
    return () => { cancelled = true; };

  }, [categoryRef, selectedCategoryId]);  // ← re-fetch on every category change

  // ── Derive available brands FROM the fetched items (not from brand API) ──
  // This ensures only brands present in THIS category are shown in the filter
  const availableBrands = useMemo<DerivedBrand[]>(() => {
    const map = new Map<string, { name: string; count: number }>();
    for (const item of allItems) {
      if (!item.brandId || !item.brandName) continue;
      const key   = String(item.brandId);
      const entry = map.get(key);
      if (entry) entry.count++;
      else map.set(key, { name: item.brandName, count: 1 });
    }
    return Array.from(map.entries())
      .map(([id, v]) => ({ id, name: v.name, count: v.count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allItems]);

  const availableItemGroups = useMemo<DerivedItemGroup[]>(() => {
    const map = new Map<string, { name: string; count: number }>();
    for (const item of allItems) {
      const rawName = item.itemGroupName?.trim();
      if (!rawName) continue;
      const key = String(item.itemGroupId ?? rawName).trim();
      const entry = map.get(key);
      if (entry) entry.count++;
      else map.set(key, { name: rawName, count: 1 });
    }
    return Array.from(map.entries())
      .map(([id, value]) => ({ id, name: value.name, count: value.count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allItems]);

  // ── Client-side filter + sort on top of the already-category-filtered items
  const filteredItems = useMemo<Item[]>(() => {
    let result = [...allItems];

    // Brand filter
    if (filters.brands.length) {
      result = result.filter(
        (item) => item.brandId != null && filters.brands.includes(String(item.brandId))
      );
    }

    // Price range filter
    if (filters.priceRanges.length) {
      result = result.filter((item) => {
        const price = item.offerPrice ?? item.nlc ?? 0;
        return filters.priceRanges.some((rv) => {
          const range = PRICE_RANGES.find((r) => r.value === rv);
          return range ? price >= range.min && price <= range.max : false;
        });
      });
    }

    if (filters.itemGroups.length) {
      result = result.filter((item) => {
        const rawName = item.itemGroupName?.trim();
        if (!rawName) return false;
        const groupKey = String(item.itemGroupId ?? rawName).trim();
        return filters.itemGroups.includes(groupKey);
      });
    }

    if (filters.stockStates.length) {
      result = result.filter((item) => {
        const inStock = Number(item.openingStock ?? 0) > 0;
        return filters.stockStates.some((state) =>
          state === "in-stock" ? inStock : !inStock
        );
      });
    }

    // Search filter
    if (filters.search.trim()) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (item) =>
          item.itemName.toLowerCase().includes(q) ||
          (item.brandName    ?? "").toLowerCase().includes(q) ||
          (item.categoryName ?? "").toLowerCase().includes(q)
      );
    }

    // Sort
    if (sortValue === "price-low")  result.sort((a, b) => (a.offerPrice ?? 0) - (b.offerPrice ?? 0));
    if (sortValue === "price-high") result.sort((a, b) => (b.offerPrice ?? 0) - (a.offerPrice ?? 0));

    return result;
  }, [allItems, filters, sortValue]);

  // ── Toggle helpers ────────────────────────────────────────────────────────
  function toggleBrand(id: string) {
    setFilters((f) => ({
      ...f,
      brands: f.brands.includes(id) ? f.brands.filter((b) => b !== id) : [...f.brands, id],
    }));
    setCurrentPage(1);
  }

  function togglePriceRange(range: string) {
    setFilters((f) => ({
      ...f,
      priceRanges: f.priceRanges.includes(range)
        ? f.priceRanges.filter((r) => r !== range)
        : [...f.priceRanges, range],
    }));
    setCurrentPage(1);
  }

  function toggleItemGroup(id: string) {
    setFilters((f) => ({
      ...f,
      itemGroups: f.itemGroups.includes(id)
        ? f.itemGroups.filter((groupId) => groupId !== id)
        : [...f.itemGroups, id],
    }));
    setCurrentPage(1);
  }

  function toggleStockState(state: string) {
    setFilters((f) => ({
      ...f,
      stockStates: f.stockStates.includes(state)
        ? f.stockStates.filter((value) => value !== state)
        : [...f.stockStates, state],
    }));
    setCurrentPage(1);
  }

  function toggleRating(r: string) {
    setFilters((f) => ({
      ...f,
      ratings: f.ratings.includes(r) ? f.ratings.filter((x) => x !== r) : [...f.ratings, r],
    }));
    setCurrentPage(1);
  }

  function setSearch(q: string) {
    setFilters((f) => ({ ...f, search: q }));
    setCurrentPage(1);
  }

  function clearFilters() {
    setFilters(DEFAULT_FILTERS);
    setCurrentPage(1);
  }

  // ── Active filter tags (for the chips bar) ────────────────────────────────
  const activeFilterTags = useMemo(() => {
    const tags: { key: keyof CategoryPageFilters; value: string; label: string }[] = [];

    filters.brands.forEach((id) => {
      const brand = availableBrands.find((b) => b.id === id);
      if (brand) tags.push({ key: "brands", value: id, label: `Brand: ${brand.name}` });
    });

    filters.priceRanges.forEach((value) => {
      const range = PRICE_RANGES.find((r) => r.value === value);
      if (range) tags.push({ key: "priceRanges", value, label: range.label });
    });

    filters.itemGroups.forEach((id) => {
      const group = availableItemGroups.find((itemGroup) => itemGroup.id === id);
      if (group) tags.push({ key: "itemGroups", value: id, label: `Item Group: ${group.name}` });
    });

    filters.stockStates.forEach((value) => {
      const stock = STOCK_FILTERS.find((option) => option.value === value);
      if (stock) tags.push({ key: "stockStates", value, label: stock.label });
    });

    filters.ratings.forEach((value) => {
      tags.push({ key: "ratings", value, label: `${value}+ Stars` });
    });

    if (filters.search.trim()) {
      tags.push({ key: "search", value: filters.search, label: `Search: "${filters.search}"` });
    }

    return tags;
  }, [filters, availableBrands, availableItemGroups]);

  return {
    category,
    allItems,
    pagination,
    loading,
    error,
    availableBrands,
    availableItemGroups,
    filters,
    sortValue,
    filteredItems,
    setFilters,
    toggleBrand,
    togglePriceRange,
    toggleItemGroup,
    toggleStockState,
    toggleRating,
    setSearch,
    setSortValue,
    clearFilters,
    currentPage,
    setCurrentPage,
    activeFilterTags,
  };
}
