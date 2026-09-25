// services/analytics/salesOverview.js
// Analytics → Sales Overview. One call returns everything the dashboard needs
// for the selected period, compared with the previous period of equal length.
// Built on the same normalised sales sources as the Sales Report, so the
// numbers always match the report.

import { db } from "../../config/db.js";
import { parseDateRange, ymd, oneOf, round2, num } from "../reports/reportEngine.js";
import { CHANNELS, billSource, lineSource, unionSources } from "../reports/salesSources.js";

const DAY = 86400000;

function previousRange(range) {
  const from = new Date(`${range.from}T00:00:00`);
  const to = new Date(`${range.to}T00:00:00`);
  const days = Math.round((to - from) / DAY) + 1;
  const prevTo = new Date(from.getTime() - DAY);
  const prevFrom = new Date(prevTo.getTime() - (days - 1) * DAY);
  return parseDateRange({ from: ymd(prevFrom), to: ymd(prevTo) });
}

const pctChange = (cur, prev) => (prev ? round2(((cur - prev) / Math.abs(prev)) * 100) : cur ? null : 0);

async function billTotals(ctx) {
  const src = unionSources(billSource, ctx.channels, ctx);
  const [[row]] = await db.query(
    `SELECT COUNT(*) AS bills, COALESCE(SUM(t.qty), 0) AS qty, COALESCE(SUM(t.netAmount), 0) AS net,
            COALESCE(SUM(t.taxAmount), 0) AS gst, COALESCE(SUM(t.discount), 0) AS discount,
            COALESCE(SUM(CASE WHEN t.channel = 'showroom' THEN t.netAmount ELSE 0 END), 0) AS showroomNet,
            COALESCE(SUM(CASE WHEN t.channel = 'website'  THEN t.netAmount ELSE 0 END), 0) AS websiteNet,
            COUNT(DISTINCT NULLIF(t.customerPhone, '')) AS customers
       FROM (${src.sql}) t`,
    src.params
  );
  const out = Object.fromEntries(Object.entries(row).map(([k, v]) => [k, round2(v)]));
  out.avgBill = out.bills ? round2(out.net / out.bills) : 0;
  return out;
}

/** Fixed headline numbers: today, month-to-date, financial-year-to-date. */
async function headline(channels) {
  const now = new Date();
  const fyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const ranges = {
    today: parseDateRange({ from: ymd(now), to: ymd(now) }),
    month: parseDateRange({ from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: ymd(now) }),
    financialYear: parseDateRange({ from: `${fyStart}-04-01`, to: ymd(now) }),
  };
  const entries = await Promise.all(
    Object.entries(ranges).map(async ([key, range]) => {
      const t = await billTotals({ range, status: "sales", channels });
      return [key, { net: t.net, bills: t.bills, from: range.from, to: range.to }];
    })
  );
  return Object.fromEntries(entries);
}

async function trend(ctx, granularity) {
  const src = unionSources(billSource, ctx.channels, ctx);
  const fmt = granularity === "month" ? "%Y-%m" : "%Y-%m-%d";
  const [rows] = await db.query(
    `SELECT DATE_FORMAT(t.docDate, '${fmt}') AS period,
            SUM(CASE WHEN t.channel = 'showroom' THEN t.netAmount ELSE 0 END) AS showroom,
            SUM(CASE WHEN t.channel = 'website'  THEN t.netAmount ELSE 0 END) AS website,
            COUNT(*) AS bills
       FROM (${src.sql}) t
      GROUP BY period
      ORDER BY period`,
    src.params
  );
  // Fill gaps so the chart shows zero days/months instead of skipping them.
  const byPeriod = new Map(rows.map((r) => [r.period, r]));
  const out = [];
  const cursor = new Date(`${ctx.range.from}T00:00:00`);
  const end = new Date(`${ctx.range.to}T00:00:00`);
  if (granularity === "month") cursor.setDate(1);
  while (cursor <= end) {
    const key = granularity === "month" ? ymd(cursor).slice(0, 7) : ymd(cursor);
    const r = byPeriod.get(key);
    out.push({
      period: key,
      showroom: round2(r?.showroom),
      website: round2(r?.website),
      total: round2(num(r?.showroom) + num(r?.website)),
      bills: num(r?.bills),
    });
    if (granularity === "month") cursor.setMonth(cursor.getMonth() + 1);
    else cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

/** Top groups by line value + the grand total (for an "Others" bucket). */
async function groupedLines(ctx, groupExpr, labelExpr, limit = 10) {
  const src = unionSources(lineSource, ctx.channels, ctx);
  const [[rows], [[totals]]] = await Promise.all([
    db.query(
      `SELECT ${groupExpr} AS id, ${labelExpr} AS name,
              SUM(t.lineValue) AS value, SUM(t.qty) AS qty, COUNT(DISTINCT t.channel, t.docId) AS bills
         FROM (${src.sql}) t
        GROUP BY ${groupExpr}
        ORDER BY value DESC
        LIMIT ${Number(limit) + 1}`,
      src.params
    ),
    db.query(`SELECT COALESCE(SUM(t.lineValue), 0) AS total FROM (${src.sql}) t`, src.params),
  ]);
  return {
    total: round2(totals.total),
    rows: rows.map((r) => ({ id: r.id, name: r.name || "Unassigned", value: round2(r.value), qty: round2(r.qty), bills: num(r.bills) })),
  };
}

async function groupedBills(ctx, groupExpr, limit = 5, extraWhere = "") {
  const src = unionSources(billSource, ctx.channels, ctx);
  const [rows] = await db.query(
    `SELECT ${groupExpr} AS name, SUM(t.netAmount) AS value, COUNT(*) AS bills
       FROM (${src.sql}) t
      ${extraWhere}
      GROUP BY name
      ORDER BY value DESC
      LIMIT ${Number(limit)}`,
    src.params
  );
  return rows.map((r) => ({ name: r.name || "Unassigned", value: round2(r.value), bills: num(r.bills) }));
}

async function weekdays(ctx) {
  const src = unionSources(billSource, ctx.channels, ctx);
  const [rows] = await db.query(
    `SELECT DAYOFWEEK(t.docDate) AS dow, SUM(t.netAmount) AS value, COUNT(*) AS bills
       FROM (${src.sql}) t GROUP BY dow`,
    src.params
  );
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const map = new Map(rows.map((r) => [num(r.dow), r]));
  // Monday-first
  return [2, 3, 4, 5, 6, 7, 1].map((d) => ({ day: names[d - 1], value: round2(map.get(d)?.value), bills: num(map.get(d)?.bills) }));
}

/** Top-N list + "Others" bucket from a total. */
function withOthers(list, limit, total) {
  const top = list.slice(0, limit);
  const shown = top.reduce((s, r) => s + r.value, 0);
  const rest = round2(total - shown);
  if (list.length > limit && rest > 0.5) top.push({ id: null, name: "Others", value: rest, qty: null, bills: null });
  return top;
}

export async function salesOverview(query = {}) {
  const range = parseDateRange(query);
  const channel = oneOf(query.channel, ["all", ...CHANNELS], "all");
  const channels = channel === "all" ? [...CHANNELS] : [channel];
  const ctx = { range, status: "sales", channels };
  const prevCtx = { ...ctx, range: previousRange(range) };

  const days = Math.round((new Date(`${range.to}T00:00:00`) - new Date(`${range.from}T00:00:00`)) / DAY) + 1;
  const granularity = query.granularity === "month" || (query.granularity !== "day" && days > 62) ? "month" : "day";

  const [current, previous, head, series, categories, brands, items, salesmen, cities, payment, byWeekday] =
    await Promise.all([
      billTotals(ctx),
      billTotals(prevCtx),
      headline(channels),
      trend(ctx, granularity),
      groupedLines(ctx, "t.categoryId", "MAX(t.categoryName)", 8),
      groupedLines(ctx, "t.brandId", "MAX(t.brandName)", 8),
      groupedLines(ctx, "COALESCE(CONCAT(t.itemId, ''), t.itemName)", "MAX(CONCAT_WS(' ', t.itemName, NULLIF(t.variant, '')))", 10),
      channels.includes("showroom")
        ? groupedBills({ ...ctx, channels: ["showroom"] }, "t.salesmanName", 5, "WHERE t.salesmanName IS NOT NULL")
        : Promise.resolve([]),
      groupedBills(ctx, "NULLIF(TRIM(t.city), '')", 6, "WHERE NULLIF(TRIM(t.city), '') IS NOT NULL"),
      groupedBills(ctx, "LOWER(t.paymentMode)", 6),
      weekdays(ctx),
    ]);

  // Category/brand shares use item-line values (before bill-level charges),
  // so they add up to 100% of goods sold.

  const kpis = {};
  for (const key of ["net", "bills", "qty", "avgBill", "gst", "discount", "customers", "showroomNet", "websiteNet"]) {
    kpis[key] = { value: current[key], previous: previous[key], changePct: pctChange(current[key], previous[key]) };
  }

  return {
    period: { from: range.from, to: range.to, days, granularity },
    previousPeriod: { from: prevCtx.range.from, to: prevCtx.range.to },
    channel,
    headline: head,
    kpis,
    trend: series,
    goodsValue: categories.total,
    byCategory: withOthers(categories.rows, 8, categories.total),
    byBrand: withOthers(brands.rows, 8, brands.total),
    topItems: items.rows.slice(0, 10),
    topSalesmen: salesmen,
    topCities: cities,
    byPaymentMode: payment,
    byWeekday,
  };
}
