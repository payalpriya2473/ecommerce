"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { AlertCircle, ArrowDownRight, ArrowUpRight, Minus, RefreshCw, ShoppingCart } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { analyticsAPI, type AnalyticsKpi, type AnalyticsNamedValue, type SalesOverview } from "@/lib/api";
import { ReportPageShell } from "@/components/reports/report-page-shell";
import { DateRangeFilter, FilterSelect, datePreset } from "@/components/reports/report-ui";
import { formatCurrency, formatNumber, formatDate } from "@/components/reports/report-format";
import { cn } from "@/lib/utils";

const SHOWROOM_COLOR = "#c8102e";
const WEBSITE_COLOR = "#2563eb";

const trendConfig = {
  showroom: { label: "Showroom", color: SHOWROOM_COLOR },
  website: { label: "Website", color: WEBSITE_COLOR },
} satisfies ChartConfig;

const valueConfig = { value: { label: "Sales", color: SHOWROOM_COLOR } } satisfies ChartConfig;

const compactINR = (v: number) => {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(1)}Cr`;
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
  if (Math.abs(n) >= 1e3) return `₹${(n / 1e3).toFixed(0)}k`;
  return `₹${n.toFixed(0)}`;
};

function periodLabel(period: string, granularity: "day" | "month") {
  const d = new Date(granularity === "month" ? `${period}-01T00:00:00` : `${period}T00:00:00`);
  return granularity === "month"
    ? d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" })
    : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

function Change({ kpi, invert = false }: { kpi: AnalyticsKpi; invert?: boolean }) {
  if (kpi.changePct === null) return <span className="text-xs text-muted-foreground">new vs previous</span>;
  const up = kpi.changePct > 0;
  const flat = kpi.changePct === 0;
  const good = invert ? !up : up;
  return (
    <span className={cn("inline-flex items-center text-xs font-medium", flat ? "text-muted-foreground" : good ? "text-green-700" : "text-red-600")}>
      {flat ? <Minus className="h-3 w-3 mr-0.5" /> : up ? <ArrowUpRight className="h-3 w-3 mr-0.5" /> : <ArrowDownRight className="h-3 w-3 mr-0.5" />}
      {Math.abs(kpi.changePct).toLocaleString("en-IN", { maximumFractionDigits: 1 })}%
      <span className="text-muted-foreground font-normal ml-1">vs previous</span>
    </span>
  );
}

function KpiCard({ label, kpi, currency = true, invert }: { label: string; kpi?: AnalyticsKpi; currency?: boolean; invert?: boolean }) {
  return (
    <Card className="border-border/50 shadow-sm py-0 gap-0">
      <CardContent className="p-4">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        {kpi ? (
          <>
            <div className="text-xl font-bold mt-1 tabular-nums">{currency ? formatCurrency(kpi.value) : formatNumber(kpi.value)}</div>
            <Change kpi={kpi} invert={invert} />
          </>
        ) : (
          <div className="h-7 mt-1.5 w-24 rounded bg-muted animate-pulse" />
        )}
      </CardContent>
    </Card>
  );
}

function Panel({ title, children, action, className }: { title: string; children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <Card className={cn("border-border/50 shadow-sm", className)}>
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Empty({ text = "No sales in this period." }: { text?: string }) {
  return <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground text-center px-6">{text}</div>;
}

/** Ranked list with an inline share bar — compact and readable for top-N data. */
function RankList({ rows, total, showQty }: { rows: AnalyticsNamedValue[]; total: number; showQty?: boolean }) {
  if (!rows.length) return <Empty />;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="space-y-2.5">
      {rows.map((r, i) => (
        <div key={`${r.name}-${i}`}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className={cn("truncate", r.name === "Others" && "text-muted-foreground")} title={r.name}>
              {r.name}
            </span>
            <span className="tabular-nums font-medium whitespace-nowrap">
              {formatCurrency(r.value)}
              <span className="text-xs text-muted-foreground font-normal ml-1.5">
                {total > 0 ? `${((r.value / total) * 100).toFixed(1)}%` : ""}
                {showQty && r.qty != null ? ` · ${formatNumber(r.qty)} pcs` : ""}
              </span>
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted mt-1 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${(r.value / max) * 100}%`, backgroundColor: r.name === "Others" ? "#94a3b8" : SHOWROOM_COLOR }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function SalesOverviewContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initial = useMemo(() => {
    const def = datePreset("this_month");
    return {
      from: searchParams.get("from") || def.from,
      to: searchParams.get("to") || def.to,
      channel: searchParams.get("channel") || "all",
      granularity: searchParams.get("granularity") || "auto",
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [filters, setFilters] = useState(initial);
  const [data, setData] = useState<SalesOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const qs = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && v !== "all" && v !== "auto" && qs.set(k, v));
    router.replace(`${pathname}?${qs.toString()}`, { scroll: false });

    const token = sessionStorage.getItem("authToken");
    if (!token) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    analyticsAPI
      .overview(token, { ...filters, granularity: filters.granularity === "auto" ? undefined : filters.granularity }, controller.signal)
      .then((res) => {
        if (controller.signal.aborted) return;
        if (res.success && res.data) {
          setData(res.data);
          setError("");
        } else setError(res.message || "Could not load sales analytics");
      })
      .catch((e) => e?.name !== "AbortError" && setError("Could not load sales analytics. Check your connection and try again."))
      .finally(() => !controller.signal.aborted && setLoading(false));
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, reload]);

  const k = data?.kpis;
  const trend = (data?.trend || []).map((t) => ({ ...t, label: periodLabel(t.period, data!.period.granularity) }));
  const hasSales = (k?.bills.value || 0) > 0;
  const channelShare =
    k && k.net.value > 0
      ? { showroom: (k.showroomNet.value / k.net.value) * 100, website: (k.websiteNet.value / k.net.value) * 100 }
      : null;

  return (
    <ReportPageShell permission="analytics" backHref={null}>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Sales Overview</h1>
          <p className="text-muted-foreground mt-1">Showroom and website sales at a glance, compared with the previous period</p>
        </div>
        <div className="flex gap-2">
          <Link href="/reports/sales">
            <Button variant="outline">Open Sales Report</Button>
          </Link>
          <Button variant="outline" onClick={() => setReload((r) => r + 1)} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} /> Refresh
          </Button>
        </div>
      </div>

      {/* Headline — fixed periods */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        {(
          [
            ["today", "Today"],
            ["month", "This month"],
            ["financialYear", "This financial year"],
          ] as const
        ).map(([key, label]) => (
          <Card key={key} className="border-border/50 shadow-sm py-0 gap-0 bg-gradient-to-br from-background to-muted/40">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <div className="text-xs font-medium text-muted-foreground">{label}</div>
                <div className="text-2xl font-bold tabular-nums mt-0.5">
                  {data ? formatCurrency(data.headline[key].net) : <span className="inline-block h-7 w-28 rounded bg-muted animate-pulse" />}
                </div>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <ShoppingCart className="h-4 w-4 ml-auto mb-1 opacity-60" />
                {data ? `${formatNumber(data.headline[key].bills)} bills` : ""}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card className="mb-6 border-border/50 shadow-sm py-0 gap-0">
        <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          <DateRangeFilter from={filters.from} to={filters.to} onChange={(r) => setFilters((f) => ({ ...f, ...r }))} />
          <FilterSelect
            label="Channel"
            value={filters.channel}
            onChange={(v) => setFilters((f) => ({ ...f, channel: v }))}
            options={[
              { value: "showroom", label: "Showroom" },
              { value: "website", label: "Website" },
            ]}
            allLabel="Showroom + Website"
          />
          <FilterSelect
            label="Trend by"
            value={filters.granularity}
            onChange={(v) => setFilters((f) => ({ ...f, granularity: v }))}
            options={[
              { value: "auto", label: "Automatic" },
              { value: "day", label: "Day" },
              { value: "month", label: "Month" },
            ]}
            allLabel={null}
          />
        </CardContent>
      </Card>

      {error && (
        <Card className="mb-6 border-destructive/40">
          <CardContent className="p-4 flex items-center gap-3 text-sm">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <span className="flex-1">{error}</span>
            <Button size="sm" variant="outline" onClick={() => setReload((r) => r + 1)}>
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {/* KPIs for the selected period */}
      <div className={cn("grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-2 transition-opacity", loading && data && "opacity-60")}>
        <KpiCard label="Net sales" kpi={k?.net} />
        <KpiCard label="Bills" kpi={k?.bills} currency={false} />
        <KpiCard label="Units sold" kpi={k?.qty} currency={false} />
        <KpiCard label="Avg. bill value" kpi={k?.avgBill} />
        <KpiCard label="Customers" kpi={k?.customers} currency={false} />
        <KpiCard label="Discount given" kpi={k?.discount} invert />
      </div>
      {data && (
        <p className="text-xs text-muted-foreground mb-6">
          {formatDate(data.period.from)} – {formatDate(data.period.to)} compared with {formatDate(data.previousPeriod.from)} –{" "}
          {formatDate(data.previousPeriod.to)}. Website figures include valid orders only (not unpaid, cancelled or returned).
        </p>
      )}

      <div className={cn("grid grid-cols-1 xl:grid-cols-3 gap-6 transition-opacity", loading && data && "opacity-60")}>
        <Panel
          title={`Sales trend (${data?.period.granularity === "month" ? "monthly" : "daily"})`}
          className="xl:col-span-2"
          action={
            channelShare ? (
              <span className="text-xs text-muted-foreground">
                Showroom {channelShare.showroom.toFixed(0)}% · Website {channelShare.website.toFixed(0)}%
              </span>
            ) : null
          }
        >
          {!data && loading ? (
            <div className="h-[300px] rounded bg-muted/50 animate-pulse" />
          ) : hasSales ? (
            <ChartContainer config={trendConfig} className="h-[300px] w-full aspect-auto">
              <BarChart data={trend} margin={{ top: 8, right: 8, left: 4 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
                <YAxis tickLine={false} axisLine={false} tickMargin={6} width={56} tickFormatter={(v) => compactINR(Number(v))} />
                <ChartTooltip content={<ChartTooltipContent formatter={(value, name) => `${trendConfig[name as "showroom"]?.label ?? name}: ${formatCurrency(Number(value))}`} />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="showroom" stackId="s" fill="var(--color-showroom)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="website" stackId="s" fill="var(--color-website)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          ) : (
            <Empty />
          )}
        </Panel>

        <Panel title="Sales by category">
          <RankList rows={data?.byCategory || []} total={data?.goodsValue || 0} showQty />
        </Panel>

        <Panel title="Top selling items" className="xl:col-span-2">
          {data?.topItems.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b">
                    <th className="py-2 font-medium">#</th>
                    <th className="py-2 font-medium">Item</th>
                    <th className="py-2 font-medium text-right">Qty</th>
                    <th className="py-2 font-medium text-right">Bills</th>
                    <th className="py-2 font-medium text-right">Sales</th>
                    <th className="py-2 font-medium text-right">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topItems.map((it, i) => (
                    <tr key={`${it.id}-${i}`} className="border-b last:border-0">
                      <td className="py-2 text-muted-foreground">{i + 1}</td>
                      <td className="py-2 max-w-[320px] truncate" title={it.name}>
                        {it.name}
                      </td>
                      <td className="py-2 text-right tabular-nums">{formatNumber(it.qty)}</td>
                      <td className="py-2 text-right tabular-nums">{formatNumber(it.bills)}</td>
                      <td className="py-2 text-right tabular-nums font-medium">{formatCurrency(it.value)}</td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">
                        {data.goodsValue ? `${((it.value / data.goodsValue) * 100).toFixed(1)}%` : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty />
          )}
        </Panel>

        <Panel title="Sales by brand">
          <RankList rows={data?.byBrand || []} total={data?.goodsValue || 0} />
        </Panel>

        <Panel title="Sales by day of week">
          {data && hasSales ? (
            <ChartContainer config={valueConfig} className="h-[220px] w-full aspect-auto">
              <BarChart data={data.byWeekday} margin={{ top: 8, right: 8, left: 4 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis tickLine={false} axisLine={false} width={52} tickFormatter={(v) => compactINR(Number(v))} />
                <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatCurrency(Number(value))} />} />
                <Bar dataKey="value" fill="var(--color-value)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          ) : (
            <Empty />
          )}
        </Panel>

        <Panel title="Top salesmen (showroom)">
          <RankList rows={data?.topSalesmen || []} total={k?.showroomNet.value || 0} />
        </Panel>

        <Panel title="Top cities">
          <RankList rows={data?.topCities || []} total={k?.net.value || 0} />
        </Panel>

        <Panel title="Payment modes">
          <RankList
            rows={(data?.byPaymentMode || []).map((p) => ({ ...p, name: p.name === "cod" ? "Cash on Delivery" : p.name.charAt(0).toUpperCase() + p.name.slice(1) }))}
            total={k?.net.value || 0}
          />
        </Panel>

        <Panel title="Showroom vs website" className="xl:col-span-2">
          {k && hasSales ? (
            <div className="grid grid-cols-2 gap-4">
              {(
                [
                  ["Showroom", k.showroomNet, SHOWROOM_COLOR],
                  ["Website", k.websiteNet, WEBSITE_COLOR],
                ] as const
              ).map(([label, kpi, color]) => (
                <div key={label} className="rounded-lg border p-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} /> {label}
                  </div>
                  <div className="text-2xl font-bold tabular-nums mt-1">{formatCurrency(kpi.value)}</div>
                  <Change kpi={kpi} />
                  <div className="h-2 rounded-full bg-muted mt-3 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${k.net.value ? (kpi.value / k.net.value) * 100 : 0}%`, backgroundColor: color }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty />
          )}
        </Panel>
      </div>
    </ReportPageShell>
  );
}
