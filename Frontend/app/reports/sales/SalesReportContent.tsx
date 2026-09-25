"use client";

import Link from "next/link";
import { useReport } from "@/components/reports/use-report";
import {
  DateRangeFilter,
  FilterSelect,
  ReportFilterBar,
  ReportHeader,
  ReportSummary,
  ReportTable,
  ReportViewTabs,
  SearchFilter,
  datePreset,
  useReportFilterOptions,
  type SummaryTile,
} from "@/components/reports/report-ui";
import { ReportPageShell } from "@/components/reports/report-page-shell";
import type { ReportColumn } from "@/lib/api";

type SalesRow = Record<string, unknown> & { channel?: string; docId?: number; docNumber?: string; period?: string };

const DEFAULTS = {
  ...datePreset("this_month"),
  view: "bills",
  groupBy: "day",
  channel: "all",
  search: "",
  categoryId: "all",
  brandId: "all",
  itemGroupId: "all",
  paymentMode: "all",
  salesmanId: "all",
  status: "sales",
};

const VIEWS = [
  { key: "bills", label: "Bills" },
  { key: "lines", label: "Item lines" },
  { key: "period", label: "Day / Month summary" },
];

const WEBSITE_STATUSES = [
  { value: "sales", label: "Valid sales" },
  { value: "delivered", label: "Delivered" },
  { value: "shipped", label: "Shipped" },
  { value: "processing", label: "New (not confirmed)" },
  { value: "cancelled", label: "Cancelled" },
  { value: "returned", label: "Returned" },
  { value: "pending_payment", label: "Awaiting payment" },
  { value: "payment_failed", label: "Payment failed" },
];

export default function SalesReportContent() {
  const report = useReport<SalesRow>({
    reportKey: "sales",
    defaults: DEFAULTS,
    defaultSort: { key: "docDate", direction: "desc" },
  });
  const options = useReportFilterOptions();
  const { filters, setFilter, summary } = report;
  const view = filters.view;

  const tiles: SummaryTile[] =
    view === "lines"
      ? [
          { label: "Item lines", value: summary.lineCount, hint: `${summary.billCount ?? 0} bills` },
          { label: "Units sold", value: summary.qty },
          { label: "Discount", value: summary.discount, type: "currency" },
          { label: "Taxable value", value: summary.taxableAmount, type: "currency" },
          { label: "GST", value: summary.taxAmount, type: "currency" },
          {
            label: "Line value",
            value: summary.lineValue,
            type: "currency",
            hint: `Showroom ₹${Math.round(summary.showroomValue ?? 0).toLocaleString("en-IN")} · Website ₹${Math.round(summary.websiteValue ?? 0).toLocaleString("en-IN")}`,
          },
        ]
      : [
          { label: "Bills", value: summary.billCount, hint: view === "bills" ? `Showroom ${summary.showroomCount ?? 0} · Website ${summary.websiteCount ?? 0}` : undefined },
          { label: "Units sold", value: summary.qty },
          { label: "Discount", value: summary.discount, type: "currency" },
          { label: "GST", value: summary.taxAmount, type: "currency" },
          { label: "Avg. bill value", value: summary.avgBillValue, type: "currency" },
          {
            label: "Net sales",
            value: summary.netAmount,
            type: "currency",
            tone: "success",
            hint: `Showroom ₹${Math.round(summary.showroomNet ?? 0).toLocaleString("en-IN")} · Website ₹${Math.round(summary.websiteNet ?? 0).toLocaleString("en-IN")}`,
          },
        ];

  const renderCell = (column: ReportColumn, row: SalesRow) => {
    if (column.key !== "docNumber" || !row.docId) return undefined;
    const href = row.channel === "website" ? `/online-orders/view?id=${row.docId}` : `/sales-invoices/view?id=${row.docId}`;
    return (
      <Link href={href} className="font-medium text-primary hover:underline">
        {String(row.docNumber || "-")}
      </Link>
    );
  };

  const channelNote =
    filters.salesmanId !== "all" && filters.status !== "sales"
      ? "Salesman (showroom only) and a website status can't be combined — clear one of them."
      : filters.salesmanId !== "all"
        ? "Salesman filter shows showroom invoices only."
        : filters.status !== "sales" && filters.status !== "all"
          ? "A website order status is selected, so only website orders are shown."
          : "";

  return (
    <ReportPageShell>
      <ReportHeader
        title="Sales Report"
        description="Showroom sales invoices and website orders in one place"
        loading={report.loading}
        exporting={report.exporting}
        onRefresh={report.reload}
        onExport={report.exportReport}
        disableExport={!report.total}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ReportViewTabs
          views={VIEWS}
          value={view}
          onChange={(v) => report.setMany({ view: v })}
        />
        {view === "period" && (
          <ReportViewTabs
            views={[
              { key: "day", label: "Day-wise" },
              { key: "month", label: "Month-wise" },
            ]}
            value={filters.groupBy}
            onChange={(v) => setFilter("groupBy", v)}
          />
        )}
      </div>

      <ReportFilterBar activeCount={report.activeFilterCount} onReset={report.resetFilters}>
        <DateRangeFilter from={filters.from} to={filters.to} onChange={(r) => report.setMany(r)} />
        <SearchFilter
          value={filters.search}
          onChange={(v) => setFilter("search", v)}
          placeholder={view === "lines" ? "Bill no., customer, phone, item…" : "Bill / order no., customer, phone…"}
          className="lg:col-span-2 xl:col-span-3"
        />
        <FilterSelect
          label="Channel"
          value={filters.channel}
          onChange={(v) => setFilter("channel", v)}
          options={[
            { value: "showroom", label: "Showroom" },
            { value: "website", label: "Website" },
          ]}
          allLabel="Showroom + Website"
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
          label="Payment mode"
          value={filters.paymentMode}
          onChange={(v) => setFilter("paymentMode", v)}
          options={options.paymentModes.map((m) => ({ value: m, label: m.toUpperCase() === m ? m : m.charAt(0).toUpperCase() + m.slice(1) }))}
          allLabel="All modes"
        />
        <FilterSelect
          label="Salesman (showroom)"
          value={filters.salesmanId}
          onChange={(v) => setFilter("salesmanId", v)}
          options={options.salesmen.map((s) => ({ value: String(s.id), label: s.name }))}
          allLabel="All salesmen"
        />
        <FilterSelect
          label="Website orders"
          value={filters.status}
          onChange={(v) => setFilter("status", v)}
          options={WEBSITE_STATUSES}
          allLabel="All statuses"
        />
      </ReportFilterBar>

      {channelNote && <p className="text-xs text-amber-700 -mt-3 mb-4">{channelNote}</p>}

      <ReportSummary loading={report.loading} tiles={tiles} />

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
        itemLabel={view === "lines" ? "lines" : view === "period" ? (filters.groupBy === "month" ? "months" : "days") : "bills"}
        rowKey={(row, i) => (view === "period" ? String(row.period) : `${row.channel}-${row.docId}-${i}`)}
        renderCell={renderCell}
        emptyTitle="No sales for these filters"
      />
      <p className="text-xs text-muted-foreground mt-3">
        Showroom figures are taken from Sales Invoices exactly as saved (Net Amount as billed). Website prices include GST: taxable value
        and GST are worked out from each item&apos;s GST rate, with coupon/platform discounts spread across items. &ldquo;Valid sales&rdquo;
        excludes website orders that are unpaid, cancelled or returned. Category/brand filters in the Bills view show bills that contain
        a matching item.
      </p>
    </ReportPageShell>
  );
}
