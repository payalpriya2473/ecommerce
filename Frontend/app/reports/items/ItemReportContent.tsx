"use client";

import { useMemo } from "react";
import { useReport } from "@/components/reports/use-report";
import {
  DateRangeFilter,
  FilterSelect,
  ReportFilterBar,
  ReportHeader,
  ReportSummary,
  ReportTable,
  SearchFilter,
  datePreset,
  useReportFilterOptions,
} from "@/components/reports/report-ui";
import { ReportPageShell } from "@/components/reports/report-page-shell";

type ItemRow = Record<string, unknown> & { id: number };

const DEFAULTS = {
  ...datePreset("this_month"),
  channel: "all",
  search: "",
  categoryId: "all",
  brandId: "all",
  itemGroupId: "all",
  status: "active",
  stock: "all",
  movement: "all",
};

export default function ItemReportContent() {
  const report = useReport<ItemRow>({
    reportKey: "items",
    defaults: DEFAULTS,
    defaultSort: { key: "itemName", direction: "asc" },
  });
  const options = useReportFilterOptions();
  const { filters, setFilter, summary } = report;

  const groups = useMemo(
    () =>
      options.itemGroups.filter((g) => filters.categoryId === "all" || String(g.categoryId) === filters.categoryId),
    [options.itemGroups, filters.categoryId]
  );

  return (
    <ReportPageShell>
      <ReportHeader
        title="Item Report"
        description="Item master, prices, stock and sales performance across Showroom and Website"
        loading={report.loading}
        exporting={report.exporting}
        onRefresh={report.reload}
        onExport={report.exportReport}
        disableExport={!report.total}
      />

      <ReportFilterBar activeCount={report.activeFilterCount} onReset={report.resetFilters}>
        <DateRangeFilter
          label="Sales period"
          from={filters.from}
          to={filters.to}
          onChange={(r) => report.setMany(r)}
        />
        <SearchFilter
          value={filters.search}
          onChange={(v) => setFilter("search", v)}
          placeholder="Item, variant, brand, HSN…"
          className="lg:col-span-2 xl:col-span-3"
        />
        <FilterSelect
          label="Category"
          value={filters.categoryId}
          onChange={(v) => report.setMany({ categoryId: v, itemGroupId: "all" })}
          options={options.categories.map((c) => ({ value: String(c.id), label: c.name }))}
          allLabel="All categories"
        />
        <FilterSelect
          label="Item group"
          value={filters.itemGroupId}
          onChange={(v) => setFilter("itemGroupId", v)}
          options={groups.map((g) => ({ value: String(g.id), label: g.name }))}
          allLabel="All groups"
        />
        <FilterSelect
          label="Brand"
          value={filters.brandId}
          onChange={(v) => setFilter("brandId", v)}
          options={options.brands.map((b) => ({ value: String(b.id), label: b.name }))}
          allLabel="All brands"
        />
        <FilterSelect
          label="Sales channel"
          value={filters.channel}
          onChange={(v) => setFilter("channel", v)}
          options={[
            { value: "showroom", label: "Showroom" },
            { value: "website", label: "Website" },
          ]}
          allLabel="Showroom + Website"
        />
        <FilterSelect
          label="Stock"
          value={filters.stock}
          onChange={(v) => setFilter("stock", v)}
          options={[
            { value: "in_stock", label: "In stock" },
            { value: "low", label: "Low stock" },
            { value: "out", label: "Out of stock" },
          ]}
          allLabel="Any stock"
        />
        <FilterSelect
          label="Movement in period"
          value={filters.movement}
          onChange={(v) => setFilter("movement", v)}
          options={[
            { value: "sold", label: "Sold" },
            { value: "not_sold", label: "Not sold (non-moving)" },
          ]}
          allLabel="All items"
        />
        <FilterSelect
          label="Item status"
          value={filters.status}
          onChange={(v) => setFilter("status", v)}
          options={[
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
          ]}
          allLabel="Active + inactive"
        />
      </ReportFilterBar>

      <ReportSummary
        loading={report.loading}
        tiles={[
          { label: "Items", value: summary.itemCount },
          { label: "Stock (units)", value: summary.stock },
          { label: "Stock value", value: summary.stockValue, type: "currency", hint: "Stock × NLC" },
          { label: "Units sold", value: summary.soldQty, hint: `Showroom ${summary.showroomQty ?? 0} · Website ${summary.websiteQty ?? 0}` },
          { label: "Sales value", value: summary.salesValue, type: "currency" },
          {
            label: "Out / low stock",
            value: (summary.outOfStockCount ?? 0) + (summary.lowStockCount ?? 0),
            hint: `${summary.outOfStockCount ?? 0} out · ${summary.lowStockCount ?? 0} low · ${summary.notSoldCount ?? 0} not sold`,
            tone: (summary.outOfStockCount ?? 0) > 0 ? "danger" : "default",
          },
        ]}
      />

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
        emptyTitle="No items match these filters"
      />
      <p className="text-xs text-muted-foreground mt-3">
        Stock is the item&apos;s current stock. Low stock means at or below the item&apos;s Minimum Qty (or 2 when none is set).
        Stock value = stock × NLC. Website sales count confirmed orders only (not cancelled, returned or unpaid).
      </p>
    </ReportPageShell>
  );
}
