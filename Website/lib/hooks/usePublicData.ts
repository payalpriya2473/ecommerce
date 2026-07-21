"use client";
// lib/hooks/usePublicData.ts

import { useEffect, useState, useCallback, useRef } from "react";
import {
  publicCategoryAPI,
  publicBrandAPI,
  publicItemAPI,
  Category,
  Brand,
  Item,
  ItemsFilter,
  Pagination,
} from "@/lib/api/publicApi";

// ─── Generic state ────────────────────────────────────────────────────────────

interface FetchState<T> {
  data: T;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

// ─── useCategories ───────────────────────────────────────────────────────────

export function useCategories(options?: {
  companyId?: string;
  showOnWebsite?: boolean;
}): FetchState<Category[]> {
  const [data, setData] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestKeyRef = useRef<string | null>(null);

  const companyId = options?.companyId;
  const showOnWebsite = options?.showOnWebsite;
  const requestKey = JSON.stringify({
    companyId: companyId ?? "",
    showOnWebsite: Boolean(showOnWebsite),
  });

  const doFetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await publicCategoryAPI.getAll({ companyId, showOnWebsite });
      setData(result);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load categories";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [companyId, showOnWebsite]);

  useEffect(() => {
    if (requestKeyRef.current === requestKey) return;
    requestKeyRef.current = requestKey;
    doFetch();
  }, [doFetch, requestKey]);

  const refetch = useCallback(() => {
    requestKeyRef.current = null;
    void doFetch();
  }, [doFetch]);

  return { data, loading, error, refetch };
}

// ─── useBrands ───────────────────────────────────────────────────────────────

export function useBrands(options?: {
  companyId?: string;
}): FetchState<Brand[]> {
  const [data, setData] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestKeyRef = useRef<string | null>(null);

  const companyId = options?.companyId;
  const requestKey = JSON.stringify({ companyId: companyId ?? "" });

  const doFetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await publicBrandAPI.getAll({ companyId });
      setData(result);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load brands";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (requestKeyRef.current === requestKey) return;
    requestKeyRef.current = requestKey;
    doFetch();
  }, [doFetch, requestKey]);

  const refetch = useCallback(() => {
    requestKeyRef.current = null;
    void doFetch();
  }, [doFetch]);

  return { data, loading, error, refetch };
}

// ─── useItems ────────────────────────────────────────────────────────────────

interface UseItemsState extends FetchState<Item[]> {
  pagination: Pagination;
}

export function useItems(filter?: ItemsFilter): UseItemsState {
  const [data, setData] = useState<Item[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestKeyRef = useRef<string | null>(null);

  const filterKey = JSON.stringify(filter ?? {});
  const filterKeyRef = useRef(filterKey);
  filterKeyRef.current = filterKey;

  const doFetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const parsed: ItemsFilter = JSON.parse(filterKeyRef.current);
      const result = await publicItemAPI.getAll(parsed);
      setData(result.items);
      setPagination(result.pagination);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load products";
      setError(msg);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  useEffect(() => {
    if (requestKeyRef.current === filterKey) return;
    requestKeyRef.current = filterKey;
    doFetch();
  }, [doFetch, filterKey]);

  const refetch = useCallback(() => {
    requestKeyRef.current = null;
    void doFetch();
  }, [doFetch]);

  return { data, loading, error, pagination, refetch };
}

export { useCountdown } from "./useCountdown";