"use client";

import { useReport } from "@/components/reports/use-report";
import {
  FilterSelect,
  ReportFilterBar,
  ReportHeader,
  ReportSummary,
  ReportTable,
  SearchFilter,
  useReportFilterOptions,
} from "@/components/reports/report-ui";
import { ReportPageShell } from "@/components/reports/report-page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDate, formatNumber } from "@/components/reports/report-format";
import { cn } from "@/lib/utils";

type Row = Record<string, unknown> & { id: number };

const DEFAULTS = {
  status: "action",
  search: "",
  categoryId: "all",
  brandId: "all",
  supplierId: "all",
  coverDays: "30",
  leadDays: "7",
};

const STATUS_TABS: { key: string; label: string; tone: string }[] = [
  { key: "action", label: "Needs ordering", tone: "text-red-700" },
  { key: "reorder_now", label: "Reorder now", tone: "text-red-700" },
  { key: "reorder_soon", label: "Reorder soon", tone: "text-amber-700" },
  { key: "below_min", label: "Below minimum", tone: "text-orange-700" },
  { key: "overstock", label: "Overstock", tone: "text-violet-700" },
  { key: "dead", label: "Dead stock", tone: "text-gray-600" },
  { key: "ok", label: "Healthy", tone: "text-green-700" },
  { key: "all", label: "All items", tone: "" },
];

export default function ProcurementContent() {
  const report = useReport<Row>({
    reportKey: "analytics/procurement",
    defaults: DEFAULTS,
    defaultSort: { key: "status", direction: "asc" },
  });
  const options = useReportFilterOptions("analytics");
  const { filters, setFilter, summary } = report;
  const extra = report.data?.extra as
    | {
        statusCounts: Record<string, { items: number; estCost: number; stockValue: number }>;
        bySupplier: { supplierId: number | null; supplierName: string; items: number; qty: number; estCost: number; earliestOrderBy: string | null }[];
        settings: { coverDays: number; defaultLeadDays: number; overstockDays: number };
      }
    | undefined;
  const counts = extra?.statusCounts;
  const countFor = (key: string) =>
    !counts
      ? undefined
      : key === "action"
        ? (counts.reorder_now?.items || 0) + (counts.reorder_soon?.items || 0) + (counts.below_min?.items || 0)
        : key === "all"
          ? Object.values(counts).reduce((s, c) => s + c.items, 0)
          : counts[key]?.items || 0;

  const orderCost = counts ? (counts.reorder_now?.estCost || 0) + (counts.reorder_soon?.estCost || 0) + (counts.below_min?.estCost || 0) : undefined;

  return (
    <ReportPageShell permission="analytics" backHref="/analytics" backLabel="Sales overview">
      <ReportHeader
        title="Future Procurement"
        description="What to buy, how much and by when — from each item's sales speed, stock and supplier delivery time"
        loading={report.loading}
        exporting={report.exporting}
        onRefresh={report.reload}
        onExport={report.exportReport}
        disableExport={!report.total}
      />

      <ReportSummary
        loading={report.loading}
        tiles={[
          { label: "Items to order", value: countFor("action"), tone: (countFor("action") || 0) > 0 ? "danger" : "default", hint: `${counts?.reorder_now?.items ?? 0} urgent` },
          { label: "Estimated purchase cost", value: orderCost, type: "currency", hint: "For all items that need ordering" },
          { label: "Overstock value", value: counts?.overstock?.stockValue, type: "currency", tone: "warning", hint: `${counts?.overstock?.items ?? 0} items · >${extra?.settings.overstockDays ?? 120} days of stock` },
          { label: "Dead stock value", value: counts?.dead?.stockValue, type: "currency", tone: "warning", hint: `${counts?.dead?.items ?? 0} items · no sale in 90 days` },
          { label: "Units sold (30 days)", value: summary.sold30, hint: "Items in current view" },
          { label: "Stock value", value: summary.stockValue, type: "currency", hint: "Items in current view, at NLC" },
        ]}
      />

      <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
        {STATUS_TABS.map((t) => {
          const n = countFor(t.key);
          const active = filters.status === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setFilter("status", t.key)}
              className={cn(
                "whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                active ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted border-border"
              )}
            >
              {t.label}
              {n !== undefined && (
                <span className={cn("ml-2 rounded-full px-1.5 py-0.5 text-xs", active ? "bg-white/20" : cn("bg-muted-foreground/10", t.tone))}>
                  {formatNumber(n)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <ReportFilterBar activeCount={report.activeFilterCount} onReset={report.resetFilters}>
        <SearchFilter
          value={filters.search}
          onChange={(v) => setFilter("search", v)}
          placeholder="Item, variant, brand, supplier…"
          className="lg:col-span-2"
        />
        <FilterSelect
          label="Category"
          value={filters.categoryId}
          onChange={(v) => setFilter("categoryId", v)}
          options={options.categories.map((c) => ({ value: String(c.id), label: c.name }))}
          allLabel="All categories"
        />
        <FilterSelect
          label="Brand"
          value={filters.brandId}
          onChange={(v) => setFilter("brandId", v)}
          options={options.brands.map((b) => ({ value: String(b.id), label: b.name }))}
          allLabel="All brands"
        />
        <FilterSelect
          label="Supplier (last purchase)"
          value={filters.supplierId}
          onChange={(v) => setFilter("supplierId", v)}
          options={(options.suppliers || []).map((s) => ({ value: String(s.id), label: s.name }))}
          allLabel="All suppliers"
        />
        <FilterSelect
          label="Stock to cover after delivery"
          value={filters.coverDays}
          onChange={(v) => setFilter("coverDays", v)}
          options={["15", "30", "45", "60", "90"].map((d) => ({ value: d, label: `${d} days` }))}
          allLabel={null}
        />
        <FilterSelect
          label="Default lead time"
          value={filters.leadDays}
          onChange={(v) => setFilter("leadDays", v)}
          options={["3", "5", "7", "10", "14", "21", "30"].map((d) => ({ value: d, label: `${d} days` }))}
          allLabel={null}
        />
      </ReportFilterBar>

      {extra?.bySupplier?.length ? (
        <Card className="mb-6 border-border/50 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Suggested orders by supplier</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              {extra.bySupplier.slice(0, 8).map((s) => (
                <button
                  key={`${s.supplierId}-${s.supplierName}`}
                  type="button"
                  disabled={!s.supplierId}
                  onClick={() => s.supplierId && report.setMany({ supplierId: String(s.supplierId), status: "action" })}
                  className={cn(
                    "text-left rounded-lg border p-3 transition-colors",
                    s.supplierId ? "hover:border-primary/50 hover:bg-muted/40" : "opacity-80 cursor-default",
                    filters.supplierId === String(s.supplierId) && "border-primary bg-primary/5"
                  )}
                >
                  <div className="font-medium text-sm truncate" title={s.supplierName}>
                    {s.supplierName}
                  </div>
                  <div className="text-lg font-bold tabular-nums">{formatCurrency(s.estCost)}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatNumber(s.items)} items · {formatNumber(s.qty)} pcs
                    {s.earliestOrderBy ? ` · order by ${formatDate(s.earliestOrderBy)}` : ""}
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <ReportTable
        columns={report.columns}
        rows={report.rows}
        summary={summary}
        loading={report.loading}
        error={report.error}
        onRetry={report.reload}
        sort={report.sort}
        onSort={report.toggleSort}
        page={report.page}
        limit={report.limit}
        total={report.total}
        onPageChange={report.setPage}
        onLimitChange={report.setLimit}
        itemLabel="items"
        rowKey={(row) => String(row.id)}
        emptyTitle={filters.status === "action" ? "Nothing needs ordering right now" : "No items match these filters"}
        emptyHint={filters.status === "action" ? "Stock covers expected sales for all items." : "Try another status tab or clear filters."}
        renderCell={(col, row) => {
          if (col.key === "reorderBy" && row.reorderBy) {
            const overdue = new Date(String(row.reorderBy)) < new Date(new Date().toDateString());
            return <span className={cn(overdue && "text-red-600 font-semibold")}>{overdue ? "Overdue" : formatDate(row.reorderBy)}</span>;
          }
          if (col.key === "daysOfStock" && row.daysOfStock != null) return `${formatNumber(Math.round(Number(row.daysOfStock)))} d`;
          return undefined;
        }}
      />

      <Card className="mt-4 border-border/50 bg-muted/30 py-0 gap-0">
        <CardContent className="p-4 text-xs text-muted-foreground space-y-1">
          <p>
            <b className="text-foreground">How it&apos;s calculated.</b> Sales speed = 60% of the last-30-day daily average + 40% of the
            last-90-day daily average (showroom invoices + valid website orders). Lead time = the supplier&apos;s average days from purchase
            order to purchase invoice over the last year, otherwise the default above.
          </p>
          <p>
            Safety stock = the larger of Minimum Qty and 7 days of sales. Reorder now when stock ≤ sales during lead time + safety stock.
            Suggested qty covers the lead time plus the chosen cover days, plus safety stock, minus current stock. Cost uses the last purchase
            rate (NLC when there is none). Dead stock = in stock but no sale in 90 days.
          </p>
        </CardContent>
      </Card>
    </ReportPageShell>
  );
}
