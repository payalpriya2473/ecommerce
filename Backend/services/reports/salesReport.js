// services/reports/salesReport.js
// Sales Report — Showroom (Sales Invoices) + Website (Online Orders).
//
// Views
//   bills   one row per invoice / order
//   lines   one row per product sold
//   period  day-wise or month-wise totals
//
// Filters: from, to, channel (all|showroom|website), search, categoryId,
// brandId, itemGroupId, paymentMode, salesmanId (showroom only),
// status (website: 'sales' = valid sales (default) | 'all' | a single status),
// groupBy (period view: day|month).

import { db } from "../../config/db.js";
import {
  ReportError,
  parseDateRange,
  parsePaging,
  toId,
  oneOf,
  cleanSearch,
  likePattern,
  normaliseRows,
  round2,
  num,
} from "./reportEngine.js";
import { CHANNELS, WEBSITE_ALL_STATUSES, lineSource, billSource, unionSources } from "./salesSources.js";

const VIEWS = {
  bills: { label: "Bills" },
  lines: { label: "Item lines" },
  period: { label: "Day / Month summary" },
};

const COLUMNS = {
  bills: [
    { key: "docDate", label: "Date", type: "date", sortable: true },
    { key: "docNumber", label: "Bill / Order No.", type: "text", sortable: true },
    { key: "channel", label: "Channel", type: "badge", sortable: true },
    { key: "customerName", label: "Customer", type: "text", sortable: true, width: 24 },
    { key: "customerPhone", label: "Phone", type: "text" },
    { key: "city", label: "City", type: "text", sortable: true },
    { key: "salesmanName", label: "Salesman", type: "text", sortable: true },
    { key: "paymentMode", label: "Payment", type: "text", sortable: true },
    { key: "status", label: "Status", type: "badge", sortable: true },
    { key: "qty", label: "Qty", type: "number", sortable: true, total: true },
    { key: "grossAmount", label: "Gross", type: "currency", sortable: true, total: true },
    { key: "discount", label: "Discount", type: "currency", sortable: true, total: true },
    { key: "taxableAmount", label: "Taxable", type: "currency", sortable: true, total: true },
    { key: "taxAmount", label: "GST", type: "currency", sortable: true, total: true },
    { key: "otherCharges", label: "Other Charges", type: "currency", sortable: true, total: true },
    { key: "netAmount", label: "Net Amount", type: "currency", sortable: true, total: true },
  ],
  lines: [
    { key: "docDate", label: "Date", type: "date", sortable: true },
    { key: "docNumber", label: "Bill / Order No.", type: "text", sortable: true },
    { key: "channel", label: "Channel", type: "badge", sortable: true },
    { key: "customerName", label: "Customer", type: "text", sortable: true, width: 22 },
    { key: "itemName", label: "Item", type: "text", sortable: true, width: 30 },
    { key: "variant", label: "Variant", type: "text" },
    { key: "brandName", label: "Brand", type: "text", sortable: true },
    { key: "categoryName", label: "Category", type: "text", sortable: true },
    { key: "qty", label: "Qty", type: "number", sortable: true, total: true },
    { key: "rate", label: "Rate", type: "currency", sortable: true },
    { key: "discount", label: "Discount", type: "currency", sortable: true, total: true },
    { key: "taxableAmount", label: "Taxable", type: "currency", sortable: true, total: true },
    { key: "gstPercent", label: "GST %", type: "percent", sortable: true },
    { key: "taxAmount", label: "GST", type: "currency", sortable: true, total: true },
    { key: "lineValue", label: "Line Value", type: "currency", sortable: true, total: true },
  ],
  period: [
    { key: "period", label: "Period", type: "text", sortable: true },
    { key: "billCount", label: "Bills", type: "number", sortable: true, total: true },
    { key: "qty", label: "Qty", type: "number", sortable: true, total: true },
    { key: "showroomNet", label: "Showroom", type: "currency", sortable: true, total: true },
    { key: "websiteNet", label: "Website", type: "currency", sortable: true, total: true },
    { key: "discount", label: "Discount", type: "currency", sortable: true, total: true },
    { key: "taxableAmount", label: "Taxable", type: "currency", sortable: true, total: true },
    { key: "taxAmount", label: "GST", type: "currency", sortable: true, total: true },
    { key: "netAmount", label: "Net Amount", type: "currency", sortable: true, total: true },
    { key: "avgBillValue", label: "Avg. Bill", type: "currency", sortable: true },
  ],
};

const SORTS = {
  bills: {
    docDate: "t.docDate", docNumber: "t.docNumber", channel: "t.channel", customerName: "t.customerName",
    city: "t.city", salesmanName: "t.salesmanName", paymentMode: "t.paymentMode", status: "t.status",
    qty: "t.qty", grossAmount: "t.grossAmount", discount: "t.discount", taxableAmount: "t.taxableAmount",
    taxAmount: "t.taxAmount", otherCharges: "t.otherCharges", netAmount: "t.netAmount",
  },
  lines: {
    docDate: "t.docDate", docNumber: "t.docNumber", channel: "t.channel", customerName: "t.customerName",
    itemName: "t.itemName", brandName: "t.brandName", categoryName: "t.categoryName", qty: "t.qty",
    rate: "t.rate", discount: "t.discount", taxableAmount: "t.taxableAmount", gstPercent: "t.gstPercent",
    taxAmount: "t.taxAmount", lineValue: "t.lineValue",
  },
  period: {
    period: "g.period", billCount: "g.billCount", qty: "g.qty", showroomNet: "g.showroomNet",
    websiteNet: "g.websiteNet", discount: "g.discount", taxableAmount: "g.taxableAmount",
    taxAmount: "g.taxAmount", netAmount: "g.netAmount", avgBillValue: "g.avgBillValue",
  },
};

function parseFilters(query) {
  const range = parseDateRange(query);
  const view = oneOf(query.view, Object.keys(VIEWS), "bills");
  const status = query.status === "all" || WEBSITE_ALL_STATUSES.includes(query.status) ? query.status : "sales";
  const salesmanId = toId(query.salesmanId);
  let channel = oneOf(query.channel, ["all", ...CHANNELS], "all");

  // Filters that only exist on one channel narrow the channel automatically.
  let channels = channel === "all" ? [...CHANNELS] : [channel];
  if (salesmanId) channels = channels.filter((c) => c === "showroom");
  if (status !== "sales" && status !== "all") channels = channels.filter((c) => c === "website");

  return {
    range,
    view,
    channel,
    channels,
    status,
    salesmanId,
    search: cleanSearch(query.search),
    categoryId: toId(query.categoryId),
    brandId: toId(query.brandId),
    itemGroupId: toId(query.itemGroupId),
    paymentMode: cleanSearch(query.paymentMode),
    groupBy: oneOf(query.groupBy, ["day", "month"], "day"),
  };
}

/** WHERE clause on the normalised derived table `t`. */
function buildWhere(f, kind) {
  const where = [];
  const params = [];
  if (f.search) {
    const like = likePattern(f.search);
    const fields = ["t.docNumber", "t.customerName", "t.customerPhone"];
    if (kind === "lines") fields.push("t.itemName", "t.brandName", "t.variant");
    where.push(`(${fields.map((fld) => `${fld} LIKE ?`).join(" OR ")})`);
    params.push(...fields.map(() => like));
  }
  if (f.paymentMode) {
    where.push("t.paymentMode = ?");
    params.push(f.paymentMode);
  }
  if (f.salesmanId) {
    where.push("t.salesmanId = ?");
    params.push(f.salesmanId);
  }

  const itemFilters = [];
  const itemParams = [];
  if (f.categoryId) { itemFilters.push("categoryId = ?"); itemParams.push(f.categoryId); }
  if (f.brandId) { itemFilters.push("brandId = ?"); itemParams.push(f.brandId); }
  if (f.itemGroupId) { itemFilters.push("itemGroupId = ?"); itemParams.push(f.itemGroupId); }

  if (itemFilters.length) {
    if (kind === "lines") {
      where.push(...itemFilters.map((c) => `t.${c}`));
      params.push(...itemParams);
    } else {
      // Bills that contain at least one matching item.
      const lines = unionSources(lineSource, f.channels, f);
      where.push(`(t.channel, t.docId) IN (SELECT l.channel, l.docId FROM (${lines.sql}) l WHERE ${itemFilters.map((c) => `l.${c}`).join(" AND ")})`);
      params.push(...lines.params, ...itemParams);
    }
  }
  return { sql: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
}

const EMPTY = { rows: [], total: 0, summary: {} };

async function runBillsOrLines(f, paging, all) {
  const kind = f.view === "lines" ? "lines" : "bills";
  const source = unionSources(kind === "lines" ? lineSource : billSource, f.channels, f);
  const where = buildWhere(f, kind);
  const base = `FROM (${source.sql}) t ${where.sql}`;
  const baseParams = [...source.params, ...where.params];

  const summarySql =
    kind === "lines"
      ? `SELECT COUNT(*) AS lineCount, COUNT(DISTINCT t.channel, t.docId) AS billCount,
                SUM(t.qty) AS qty, SUM(t.discount) AS discount, SUM(t.taxableAmount) AS taxableAmount,
                SUM(t.taxAmount) AS taxAmount, SUM(t.lineValue) AS lineValue,
                SUM(CASE WHEN t.channel = 'showroom' THEN t.lineValue ELSE 0 END) AS showroomValue,
                SUM(CASE WHEN t.channel = 'website'  THEN t.lineValue ELSE 0 END) AS websiteValue
           ${base}`
      : `SELECT COUNT(*) AS billCount, SUM(t.qty) AS qty, SUM(t.grossAmount) AS grossAmount,
                SUM(t.discount) AS discount, SUM(t.taxableAmount) AS taxableAmount, SUM(t.taxAmount) AS taxAmount,
                SUM(t.otherCharges) AS otherCharges, SUM(t.netAmount) AS netAmount,
                SUM(t.channel = 'showroom') AS showroomCount, SUM(t.channel = 'website') AS websiteCount,
                SUM(CASE WHEN t.channel = 'showroom' THEN t.netAmount ELSE 0 END) AS showroomNet,
                SUM(CASE WHEN t.channel = 'website'  THEN t.netAmount ELSE 0 END) AS websiteNet
           ${base}`;
  const [[summaryRow]] = await db.query(summarySql, baseParams);

  const total = num(kind === "lines" ? summaryRow.lineCount : summaryRow.billCount);
  const tie = kind === "lines" ? ", t.docId DESC, t.itemName ASC" : ", t.docId DESC";
  let rowsSql = `SELECT t.* ${base} ${paging.orderSql}${paging.orderSql ? tie : ""}`;
  const rowsParams = [...baseParams];
  if (!all) {
    rowsSql += " LIMIT ? OFFSET ?";
    rowsParams.push(paging.limit, paging.offset);
  } else {
    rowsSql += " LIMIT 50001";
  }
  const [rows] = total ? await db.query(rowsSql, rowsParams) : [[]];

  const summary = Object.fromEntries(Object.entries(summaryRow).map(([k, v]) => [k, round2(v)]));
  if (kind === "bills") summary.avgBillValue = summary.billCount ? round2(summary.netAmount / summary.billCount) : 0;
  return { rows, total, summary };
}

async function runPeriod(f, paging, all) {
  const source = unionSources(billSource, f.channels, f);
  const where = buildWhere(f, "bills");
  const fmt = f.groupBy === "month" ? "%Y-%m" : "%Y-%m-%d";
  const grouped = `
    SELECT DATE_FORMAT(t.docDate, '${fmt}') AS period,
           COUNT(*) AS billCount, SUM(t.qty) AS qty,
           SUM(CASE WHEN t.channel = 'showroom' THEN t.netAmount ELSE 0 END) AS showroomNet,
           SUM(CASE WHEN t.channel = 'website'  THEN t.netAmount ELSE 0 END) AS websiteNet,
           SUM(t.discount) AS discount, SUM(t.taxableAmount) AS taxableAmount,
           SUM(t.taxAmount) AS taxAmount, SUM(t.netAmount) AS netAmount,
           SUM(t.netAmount) / NULLIF(COUNT(*), 0) AS avgBillValue
      FROM (${source.sql}) t ${where.sql}
     GROUP BY period`;
  const params = [...source.params, ...where.params];

  const [[summaryRow]] = await db.query(
    `SELECT COUNT(*) AS periodCount, SUM(g.billCount) AS billCount, SUM(g.qty) AS qty,
            SUM(g.showroomNet) AS showroomNet, SUM(g.websiteNet) AS websiteNet, SUM(g.discount) AS discount,
            SUM(g.taxableAmount) AS taxableAmount, SUM(g.taxAmount) AS taxAmount, SUM(g.netAmount) AS netAmount
       FROM (${grouped}) g`,
    params
  );
  const total = num(summaryRow.periodCount);
  let sql = `SELECT g.* FROM (${grouped}) g ${paging.orderSql || "ORDER BY g.period DESC"}`;
  const rowsParams = [...params];
  if (!all) {
    sql += " LIMIT ? OFFSET ?";
    rowsParams.push(paging.limit, paging.offset);
  }
  const [rows] = total ? await db.query(sql, rowsParams) : [[]];
  const summary = Object.fromEntries(Object.entries(summaryRow).map(([k, v]) => [k, round2(v)]));
  summary.avgBillValue = summary.billCount ? round2(summary.netAmount / summary.billCount) : 0;
  return { rows, total, summary };
}

export const salesReport = {
  key: "sales",
  title: "Sales Report",
  views: VIEWS,
  columns: (view) => COLUMNS[view] || COLUMNS.bills,

  async run(query, { all = false } = {}) {
    const f = parseFilters(query);
    const defaultSort = f.view === "period" ? { key: "period", direction: "desc" } : { key: "docDate", direction: "desc" };
    const paging = parsePaging(query, SORTS[f.view], defaultSort);
    const columns = COLUMNS[f.view];

    const result = !f.channels.length
      ? EMPTY
      : f.view === "period"
        ? await runPeriod(f, paging, all)
        : await runBillsOrLines(f, paging, all);

    if (all && result.rows.length > 50000) {
      throw new ReportError("More than 50,000 rows — narrow the date range or filters before exporting.", 413);
    }

    return {
      rows: normaliseRows(result.rows, columns),
      total: result.total,
      summary: result.summary,
      columns,
      paging,
      filters: {
        from: f.range.from,
        to: f.range.to,
        view: f.view,
        channel: f.channel,
        channels: f.channels,
        status: f.status,
        groupBy: f.groupBy,
      },
    };
  },

  /** Lines printed under the title in exports. */
  describe(result) {
    const fl = result.filters;
    return [
      `Period: ${fl.from} to ${fl.to}`,
      `View: ${VIEWS[fl.view].label}${fl.view === "period" ? ` (${fl.groupBy})` : ""} · Channel: ${fl.channels.join(" + ") || "none"}`
        + ` · Website orders: ${fl.status === "sales" ? "valid sales" : fl.status}`,
    ];
  },
};
