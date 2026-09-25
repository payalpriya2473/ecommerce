"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { reportAPI, type ReportParams, type ReportResponse } from "@/lib/api";
import { DEFAULT_PAGE_SIZE } from "@/components/ui/table-pagination";

export type ReportFilters = Record<string, string>;

interface UseReportOptions {
  reportKey: string;
  /** Default filter values; every key here is synced to the URL. */
  defaults: ReportFilters;
  /** Filter keys whose changes are debounced (free-text search). */
  debounceKeys?: string[];
  defaultSort?: { key: string; direction: "asc" | "desc" };
}

/**
 * State + data loading for a server-side report:
 * filters / paging / sorting live in the URL (shareable, survive refresh),
 * requests are debounced for text inputs and cancelled when superseded.
 */
export function useReport<Row = Record<string, unknown>>({
  reportKey,
  defaults,
  debounceKeys = ["search"],
  defaultSort,
}: UseReportOptions) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const initial = useMemo(() => {
    const f: ReportFilters = { ...defaults };
    Object.keys(defaults).forEach((k) => {
      const v = searchParams.get(k);
      if (v !== null) f[k] = v;
    });
    return {
      filters: f,
      page: Math.max(1, Number(searchParams.get("page")) || 1),
      limit: Number(searchParams.get("limit")) || DEFAULT_PAGE_SIZE,
      sortKey: searchParams.get("sortKey") || defaultSort?.key || "",
      sortDirection: (searchParams.get("sortDirection") as "asc" | "desc") || defaultSort?.direction || "desc",
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [filters, setFilters] = useState<ReportFilters>(initial.filters);
  const [debounced, setDebounced] = useState<ReportFilters>(initial.filters);
  const [page, setPage] = useState(initial.page);
  const [limit, setLimit] = useState(initial.limit);
  const [sort, setSort] = useState({ key: initial.sortKey, direction: initial.sortDirection });

  const [data, setData] = useState<ReportResponse<Row> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState<"" | "xlsx" | "csv">("");
  const [reloadKey, setReloadKey] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  // Debounce text filters, apply the rest immediately.
  useEffect(() => {
    const changedDebounced = debounceKeys.some((k) => filters[k] !== debounced[k]);
    if (!changedDebounced) {
      setDebounced(filters);
      return;
    }
    const t = setTimeout(() => setDebounced(filters), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const params: ReportParams = useMemo(
    () => ({ ...debounced, page, limit, sortKey: sort.key || undefined, sortDirection: sort.key ? sort.direction : undefined }),
    [debounced, page, limit, sort]
  );

  // Keep the URL in sync (replace, no scroll jump).
  useEffect(() => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v === undefined || v === null || v === "") return;
      if (k in defaults && defaults[k] === v) return;
      if (k === "page" && v === 1) return;
      if (k === "limit" && v === DEFAULT_PAGE_SIZE) return;
      qs.set(k, String(v));
    });
    const next = qs.toString();
    if (next !== searchParams.toString()) router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  useEffect(() => {
    const token = typeof window !== "undefined" ? sessionStorage.getItem("authToken") : null;
    if (!token) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    reportAPI
      .run<Row>(token, reportKey, params, controller.signal)
      .then((res) => {
        if (controller.signal.aborted) return;
        if (res?.success) {
          setData(res);
          setError("");
        } else {
          setError(res?.message || "Could not load the report");
        }
      })
      .catch((e) => {
        if (e?.name !== "AbortError") setError("Could not load the report. Check your connection and try again.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reportKey, params, reloadKey]);

  const setFilter = useCallback((key: string, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  }, []);

  const setMany = useCallback((values: ReportFilters) => {
    setFilters((f) => ({ ...f, ...values }));
    setPage(1);
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(defaults);
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSort = useCallback((key: string) => {
    setSort((s) => (s.key === key ? { key, direction: s.direction === "asc" ? "desc" : "asc" } : { key, direction: "desc" }));
    setPage(1);
  }, []);

  const exportReport = useCallback(
    async (format: "xlsx" | "csv") => {
      const token = sessionStorage.getItem("authToken");
      if (!token) return;
      setExporting(format);
      const res = await reportAPI.export(token, reportKey, params, format).catch(() => ({ success: false, message: "Export failed" }));
      setExporting("");
      if (!res.success) setError(res.message || "Export failed");
    },
    [reportKey, params]
  );

  const activeFilterCount = Object.keys(defaults).filter(
    (k) => !["from", "to", "view", "groupBy"].includes(k) && filters[k] !== defaults[k]
  ).length;

  return {
    filters,
    setFilter,
    setMany,
    resetFilters,
    activeFilterCount,
    page,
    setPage,
    limit,
    setLimit: (n: number) => {
      setLimit(n);
      setPage(1);
    },
    sort,
    toggleSort,
    data,
    rows: data?.data ?? [],
    columns: data?.columns ?? [],
    summary: data?.summary ?? {},
    total: data?.pagination?.totalItems ?? 0,
    loading,
    error,
    clearError: () => setError(""),
    reload: () => setReloadKey((k) => k + 1),
    exporting,
    exportReport,
  };
}
