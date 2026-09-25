"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertCircle, Download, FileSpreadsheet, FilterX, Loader2, RefreshCw, Search, SearchX } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SortableTableHead, SORTABLE_HEADER_ROW_CLASS } from "@/components/ui/sortable-table-head";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { reportAPI, type ReportColumn, type ReportFilterOptions } from "@/lib/api";
import { cn } from "@/lib/utils";
import { BADGE_CLASSES, formatCell, formatCurrency, formatNumber, isNumericType } from "./report-format";

// ─── Page header ────────────────────────────────────────────────────────────

export function ReportHeader({
  title,
  description,
  loading,
  exporting,
  onRefresh,
  onExport,
  disableExport,
}: {
  title: string;
  description: string;
  loading?: boolean;
  exporting?: "" | "xlsx" | "csv";
  onRefresh: () => void;
  onExport: (format: "xlsx" | "csv") => void;
  disableExport?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="text-muted-foreground mt-1">{description}</p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onRefresh} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} /> Refresh
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              disabled={Boolean(exporting) || disableExport}
              className="bg-gradient-to-r from-accent to-accent-secondary hover:opacity-90"
            >
              {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              {exporting ? "Exporting…" : "Export"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onExport("xlsx")}>
              <FileSpreadsheet className="h-4 w-4 mr-2" /> Excel (.xlsx)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExport("csv")}>
              <Download className="h-4 w-4 mr-2" /> CSV
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

// ─── View tabs ──────────────────────────────────────────────────────────────

export function ReportViewTabs({
  views,
  value,
  onChange,
}: {
  views: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border bg-muted/40 p-1 mb-4">
      {views.map((v) => (
        <button
          key={v.key}
          type="button"
          onClick={() => onChange(v.key)}
          className={cn(
            "px-3.5 py-1.5 text-sm font-medium rounded-md transition-colors",
            value === v.key ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}

// ─── Filters ────────────────────────────────────────────────────────────────

export function ReportFilterBar({
  children,
  activeCount = 0,
  onReset,
}: {
  children: ReactNode;
  activeCount?: number;
  onReset: () => void;
}) {
  return (
    <Card className="mb-6 border-border/50 shadow-sm py-0 gap-0">
      <CardContent className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3 items-end">
          {children}
          <div className="flex items-end">
            <Button variant="ghost" size="sm" onClick={onReset} className="h-9 text-muted-foreground" disabled={!activeCount}>
              <FilterX className="h-4 w-4 mr-1.5" /> Clear filters{activeCount ? ` (${activeCount})` : ""}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <label className="block text-xs font-medium text-muted-foreground mb-1">{children}</label>;
}

const selectClass = "h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40";

export function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel = "All",
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  allLabel?: string | null;
  className?: string;
}) {
  return (
    <div className={className}>
      <FieldLabel>{label}</FieldLabel>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
        {allLabel !== null && <option value="all">{allLabel}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function SearchFilter({
  label = "Search",
  value,
  onChange,
  placeholder,
  className,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <FieldLabel>{label}</FieldLabel>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-9 pl-8 text-sm" />
      </div>
    </div>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function datePreset(key: string): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const fyStart = m >= 3 ? y : y - 1;
  switch (key) {
    case "today":
      return { from: ymd(now), to: ymd(now) };
    case "yesterday": {
      const d = new Date(y, m, now.getDate() - 1);
      return { from: ymd(d), to: ymd(d) };
    }
    case "last7":
      return { from: ymd(new Date(y, m, now.getDate() - 6)), to: ymd(now) };
    case "last30":
      return { from: ymd(new Date(y, m, now.getDate() - 29)), to: ymd(now) };
    case "last_month":
      return { from: ymd(new Date(y, m - 1, 1)), to: ymd(new Date(y, m, 0)) };
    case "this_fy":
      return { from: `${fyStart}-04-01`, to: ymd(now) };
    case "last_fy":
      return { from: `${fyStart - 1}-04-01`, to: `${fyStart}-03-31` };
    case "this_month":
    default:
      return { from: ymd(new Date(y, m, 1)), to: ymd(now) };
  }
}

const PRESETS = [
  ["today", "Today"],
  ["yesterday", "Yesterday"],
  ["last7", "Last 7 days"],
  ["last30", "Last 30 days"],
  ["this_month", "This month"],
  ["last_month", "Last month"],
  ["this_fy", "This financial year"],
  ["last_fy", "Last financial year"],
] as const;

export function DateRangeFilter({
  from,
  to,
  onChange,
  label = "Period",
}: {
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
  label?: string;
}) {
  const matched = PRESETS.find(([k]) => {
    const r = datePreset(k);
    return r.from === from && r.to === to;
  })?.[0];
  return (
    <>
      <div>
        <FieldLabel>{label}</FieldLabel>
        <select
          value={matched || "custom"}
          onChange={(e) => e.target.value !== "custom" && onChange(datePreset(e.target.value))}
          className={selectClass}
        >
          {PRESETS.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
          <option value="custom">Custom range</option>
        </select>
      </div>
      <div>
        <FieldLabel>From</FieldLabel>
        <Input type="date" value={from} max={to} onChange={(e) => e.target.value && onChange({ from: e.target.value, to })} className="h-9 text-sm" />
      </div>
      <div>
        <FieldLabel>To</FieldLabel>
        <Input type="date" value={to} min={from} onChange={(e) => e.target.value && onChange({ from, to: e.target.value })} className="h-9 text-sm" />
      </div>
    </>
  );
}

/** Lookup lists for filter dropdowns (loaded once per page). */
export function useReportFilterOptions(source: "reports" | "analytics" = "reports") {
  const [options, setOptions] = useState<ReportFilterOptions>({
    categories: [],
    brands: [],
    itemGroups: [],
    salesmen: [],
    suppliers: [],
    paymentModes: [],
  });
  useEffect(() => {
    const token = sessionStorage.getItem("authToken");
    if (!token) return;
    reportAPI
      .filters(token, source)
      .then((res) => res.success && res.data && setOptions(res.data))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return options;
}

// ─── Summary tiles ──────────────────────────────────────────────────────────

export interface SummaryTile {
  label: string;
  value: number | undefined;
  type?: "currency" | "number";
  hint?: string;
  tone?: "default" | "success" | "warning" | "danger";
}

export function ReportSummary({ tiles, loading }: { tiles: SummaryTile[]; loading?: boolean }) {
  const toneClass = {
    default: "",
    success: "text-green-700",
    warning: "text-amber-700",
    danger: "text-red-600",
  };
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
      {tiles.map((t) => (
        <Card key={t.label} className="border-border/50 shadow-sm py-0 gap-0">
          <CardContent className="p-4">
            <div className="text-xs font-medium text-muted-foreground">{t.label}</div>
            {loading && t.value === undefined ? (
              <div className="h-7 mt-1.5 w-24 rounded bg-muted animate-pulse" />
            ) : (
              <div className={cn("text-xl font-bold mt-1 tabular-nums", toneClass[t.tone || "default"])}>
                {t.type === "currency" ? formatCurrency(t.value) : formatNumber(t.value)}
              </div>
            )}
            {t.hint && <div className="text-[11px] text-muted-foreground mt-0.5">{t.hint}</div>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Table ──────────────────────────────────────────────────────────────────

const PLACEHOLDER_COLUMNS: ReportColumn[] = Array.from({ length: 6 }, (_, i) => ({ key: `s${i}`, label: "", type: "text" }));

export function ReportTable<Row extends Record<string, unknown>>({
  columns,
  rows,
  summary,
  loading,
  error,
  onRetry,
  sort,
  onSort,
  page,
  limit,
  total,
  onPageChange,
  onLimitChange,
  itemLabel,
  rowKey,
  emptyTitle = "No data for these filters",
  emptyHint = "Try a wider date range or clear some filters.",
  renderCell,
}: {
  columns: ReportColumn[];
  rows: Row[];
  summary?: Record<string, number>;
  loading: boolean;
  error?: string;
  onRetry: () => void;
  sort: { key: string; direction: "asc" | "desc" };
  onSort: (key: string) => void;
  page: number;
  limit: number;
  total: number;
  onPageChange: (p: number) => void;
  onLimitChange: (n: number) => void;
  itemLabel: string;
  rowKey: (row: Row, index: number) => string;
  emptyTitle?: string;
  emptyHint?: string;
  renderCell?: (column: ReportColumn, row: Row) => ReactNode | undefined;
}) {
  const hasTotals = useMemo(() => columns.some((c) => c.total), [columns]);
  const firstLoad = loading && rows.length === 0 && !error;

  if (error && rows.length === 0) {
    return (
      <Card className="border-border/50">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <AlertCircle className="h-10 w-10 text-destructive mb-3" />
          <p className="font-semibold mb-1">Couldn&apos;t load the report</p>
          <p className="text-sm text-muted-foreground mb-4 max-w-md">{error}</p>
          <Button variant="outline" onClick={onRetry}>
            <RefreshCw className="h-4 w-4 mr-2" /> Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50 shadow-sm py-0 gap-0 overflow-hidden">
      {error && (
        <Alert variant="destructive" className="m-3 w-auto">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className={cn("relative overflow-x-auto transition-opacity", loading && !firstLoad && "opacity-60")}>
        <Table className="min-w-[900px]">
          <TableHeader>
            <TableRow className={SORTABLE_HEADER_ROW_CLASS}>
              {(columns.length ? columns : PLACEHOLDER_COLUMNS).map((c) =>
                c.sortable ? (
                  <SortableTableHead
                    key={c.key}
                    label={c.label}
                    active={sort.key === c.key}
                    direction={sort.direction}
                    onClick={() => onSort(c.key)}
                    className={cn("whitespace-nowrap", isNumericType(c.type) && "text-right")}
                    buttonClassName={isNumericType(c.type) ? "justify-end" : undefined}
                  />
                ) : (
                  <TableHead key={c.key} className={cn("font-semibold whitespace-nowrap", isNumericType(c.type) && "text-right")}>
                    {c.label}
                  </TableHead>
                )
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {firstLoad ? (
              Array.from({ length: 8 }).map((_, r) => (
                <TableRow key={`sk${r}`}>
                  {(columns.length ? columns : Array.from({ length: 6 })).map((_, c) => (
                    <TableCell key={c}>
                      <div className="h-4 rounded bg-muted animate-pulse" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={Math.max(1, columns.length)}>
                  <div className="flex flex-col items-center justify-center py-14 text-center">
                    <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mb-3">
                      <SearchX className="h-7 w-7 text-muted-foreground" />
                    </div>
                    <p className="font-semibold">{emptyTitle}</p>
                    <p className="text-sm text-muted-foreground">{emptyHint}</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, i) => (
                <TableRow key={rowKey(row, i)} className="hover:bg-muted/30">
                  {columns.map((c) => {
                    const custom = renderCell?.(c, row);
                    const value = row[c.key];
                    return (
                      <TableCell
                        key={c.key}
                        className={cn(
                          "text-sm whitespace-nowrap",
                          isNumericType(c.type) && "text-right tabular-nums",
                          c.type === "text" && (c.width || 0) >= 22 && "max-w-[260px] truncate"
                        )}
                        title={c.type === "text" && value ? String(value) : undefined}
                      >
                        {custom !== undefined ? (
                          custom
                        ) : c.type === "badge" && value ? (
                          <span className={cn("inline-block rounded-md border px-2 py-0.5 text-xs font-medium", BADGE_CLASSES[String(value)] || "bg-muted text-foreground border-border")}>
                            {formatCell(c.type, value)}
                          </span>
                        ) : (
                          formatCell(c.type, value)
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            )}
            {hasTotals && rows.length > 0 && summary && (
              <TableRow className="bg-muted/60 hover:bg-muted/60 font-semibold border-t-2">
                {columns.map((c, i) => (
                  <TableCell key={c.key} className={cn("text-sm whitespace-nowrap", isNumericType(c.type) && "text-right tabular-nums")}>
                    {c.total ? formatCell(c.type, summary[c.key] ?? 0) : i === 0 ? `Total (${formatNumber(total)} ${itemLabel})` : ""}
                  </TableCell>
                ))}
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {total > 0 && (
        <TablePagination
          page={page}
          pageSize={limit}
          totalItems={total}
          onPageChange={onPageChange}
          onPageSizeChange={onLimitChange}
          itemLabel={itemLabel}
        />
      )}
    </Card>
  );
}
