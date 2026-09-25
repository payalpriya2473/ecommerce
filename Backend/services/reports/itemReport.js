// services/reports/itemReport.js
// Item Report — one row per item / variant (items table) with master data,
// prices, current stock and sales performance across Showroom + Website.
//
// Filters: from, to (sales period), channel (all|showroom|website), search,
// categoryId, brandId, itemGroupId, status (active|inactive|all),
// stock (all|in_stock|low|out), movement (all|sold|not_sold).
//
// Stock = items.openingStock (the live stock figure used across the app).
// Low stock = stock > 0 and stock ≤ Minimum Qty (or ≤ 2 when no minimum set).
// Stock value = stock × NLC.

import { db } from "../../config/db.js";
import {
  parseDateRange,
  parsePaging,
  toId,
  oneOf,
  cleanSearch,
  likePattern,
  normaliseRows,
  round2,
  num,
  ReportError,
} from "./reportEngine.js";
import { CHANNELS, WEBSITE_SALE_STATUSES } from "./salesSources.js";

const DEFAULT_LOW_STOCK = 2;

const COLUMNS = [
  { key: "itemName", label: "Item", type: "text", sortable: true, width: 30 },
  { key: "variant", label: "Variant", type: "text", sortable: true },
  { key: "brandName", label: "Brand", type: "text", sortable: true },
  { key: "categoryName", label: "Category", type: "text", sortable: true },
  { key: "itemGroupName", label: "Item Group", type: "text", sortable: true },
  { key: "hsnCode", label: "HSN", type: "text" },
  { key: "gst", label: "GST %", type: "percent", sortable: true },
  { key: "nlc", label: "NLC (MRP)", type: "currency", sortable: true },
  { key: "offerPrice", label: "Offer Price", type: "currency", sortable: true },
  { key: "stock", label: "Stock", type: "number", sortable: true, total: true },
  { key: "stockValue", label: "Stock Value", type: "currency", sortable: true, total: true },
  { key: "stockStatus", label: "Stock Status", type: "badge", sortable: true },
  { key: "showroomQty", label: "Showroom Qty", type: "number", sortable: true, total: true },
  { key: "websiteQty", label: "Website Qty", type: "number", sortable: true, total: true },
  { key: "soldQty", label: "Total Sold", type: "number", sortable: true, total: true },
  { key: "salesValue", label: "Sales Value", type: "currency", sortable: true, total: true },
  { key: "lastSoldAt", label: "Last Sold", type: "date", sortable: true },
  { key: "isActive", label: "Status", type: "badge", sortable: true },
];

const SORTS = {
  itemName: "t.itemName", variant: "t.variant", brandName: "t.brandName", categoryName: "t.categoryName",
  itemGroupName: "t.itemGroupName", gst: "t.gst", nlc: "t.nlc", offerPrice: "t.offerPrice", stock: "t.stock",
  stockValue: "t.stockValue", stockStatus: "t.stockStatus", showroomQty: "t.showroomQty",
  websiteQty: "t.websiteQty", soldQty: "t.soldQty", salesValue: "t.salesValue", lastSoldAt: "t.lastSoldAt",
  isActive: "t.isActive",
};

function parseFilters(query) {
  const range = parseDateRange(query);
  const channel = oneOf(query.channel, ["all", ...CHANNELS], "all");
  return {
    range,
    channel,
    useShowroom: channel !== "website",
    useWebsite: channel !== "showroom",
    search: cleanSearch(query.search),
    categoryId: toId(query.categoryId),
    brandId: toId(query.brandId),
    itemGroupId: toId(query.itemGroupId),
    status: oneOf(query.status, ["active", "inactive", "all"], "active"),
    stock: oneOf(query.stock, ["all", "in_stock", "low", "out"], "all"),
    movement: oneOf(query.movement, ["all", "sold", "not_sold"], "all"),
  };
}

/**
 * The full per-item row set as a derived-table SQL. Sales are aggregated once
 * per channel: qty/value inside the period, and last-sold date across all time.
 */
function baseQuery(f) {
  const params = [];
  const stockExpr = "COALESCE(i.openingStock, 0)";
  const lowExpr = `COALESCE(NULLIF(i.minimumQty, 0), ${DEFAULT_LOW_STOCK})`;

  const showroomJoin = f.useShowroom
    ? `LEFT JOIN (
         SELECT sii.itemId,
                SUM(CASE WHEN si.billDate >= ? AND si.billDate < ? THEN sii.qty ELSE 0 END)    AS qty,
                SUM(CASE WHEN si.billDate >= ? AND si.billDate < ? THEN sii.amount ELSE 0 END) AS value,
                MAX(si.billDate) AS lastSold
           FROM sales_invoice_items sii
           JOIN sales_invoices si ON si.id = sii.salesInvoiceId
          WHERE sii.itemId IS NOT NULL
          GROUP BY sii.itemId
       ) sr ON sr.itemId = i.id`
    : "";
  if (f.useShowroom) params.push(f.range.start, f.range.endExclusive, f.range.start, f.range.endExclusive);

  const websiteJoin = f.useWebsite
    ? `LEFT JOIN (
         SELECT oi.itemId,
                SUM(CASE WHEN o.placedAt >= ? AND o.placedAt < ? THEN oi.qty ELSE 0 END)       AS qty,
                SUM(CASE WHEN o.placedAt >= ? AND o.placedAt < ? THEN oi.lineTotal ELSE 0 END) AS value,
                MAX(o.placedAt) AS lastSold
           FROM website_order_items oi
           JOIN website_orders o ON o.id = oi.orderId
          WHERE oi.itemId IS NOT NULL AND o.status IN (?)
          GROUP BY oi.itemId
       ) ws ON ws.itemId = i.id`
    : "";
  if (f.useWebsite) params.push(f.range.start, f.range.endExclusive, f.range.start, f.range.endExclusive, WEBSITE_SALE_STATUSES);

  const srQty = f.useShowroom ? "COALESCE(sr.qty, 0)" : "0";
  const srVal = f.useShowroom ? "COALESCE(sr.value, 0)" : "0";
  const wsQty = f.useWebsite ? "COALESCE(ws.qty, 0)" : "0";
  const wsVal = f.useWebsite ? "COALESCE(ws.value, 0)" : "0";
  const lastSold =
    f.useShowroom && f.useWebsite
      ? "CAST(NULLIF(GREATEST(COALESCE(CAST(sr.lastSold AS DATETIME), '1000-01-01 00:00:00'), COALESCE(CAST(ws.lastSold AS DATETIME), '1000-01-01 00:00:00')), '1000-01-01 00:00:00') AS DATETIME)"
      : f.useShowroom ? "CAST(sr.lastSold AS DATETIME)" : "CAST(ws.lastSold AS DATETIME)";

  const where = [];
  if (f.status !== "all") {
    where.push("i.isActive = ?");
    params.push(f.status === "active" ? 1 : 0);
  }
  if (f.categoryId) { where.push("ig.categoryId = ?"); params.push(f.categoryId); }
  if (f.brandId) { where.push("i.brandId = ?"); params.push(f.brandId); }
  if (f.itemGroupId) { where.push("i.itemGroupId = ?"); params.push(f.itemGroupId); }
  if (f.search) {
    const like = likePattern(f.search);
    where.push("(i.itemName LIKE ? OR i.variant LIKE ? OR b.name LIKE ? OR ig.name LIKE ? OR ig.hsnCode LIKE ?)");
    params.push(like, like, like, like, like);
  }
  if (f.stock === "out") where.push(`${stockExpr} <= 0`);
  if (f.stock === "in_stock") where.push(`${stockExpr} > 0`);
  if (f.stock === "low") where.push(`${stockExpr} > 0 AND ${stockExpr} <= ${lowExpr}`);
  if (f.movement === "sold") where.push(`(${srQty} + ${wsQty}) > 0`);
  if (f.movement === "not_sold") where.push(`(${srQty} + ${wsQty}) <= 0`);

  const sql = `
    SELECT i.id, i.itemName, i.variant,
           b.name AS brandName, c.name AS categoryName, ig.name AS itemGroupName, ig.hsnCode,
           i.gst, i.nlc, i.offerPrice, i.minimumQty,
           ${stockExpr} AS stock,
           ${stockExpr} * COALESCE(i.nlc, 0) AS stockValue,
           CASE WHEN ${stockExpr} <= 0 THEN 'out_of_stock'
                WHEN ${stockExpr} <= ${lowExpr} THEN 'low_stock'
                ELSE 'in_stock' END AS stockStatus,
           ${srQty} AS showroomQty, ${wsQty} AS websiteQty,
           ${srQty} + ${wsQty} AS soldQty,
           ${srVal} + ${wsVal} AS salesValue,
           ${lastSold} AS lastSoldAt,
           CASE WHEN i.isActive = 1 THEN 'active' ELSE 'inactive' END AS isActive
      FROM items i
      LEFT JOIN item_groups ig ON ig.id = i.itemGroupId
      LEFT JOIN categories c   ON c.id  = ig.categoryId
      LEFT JOIN brands b       ON b.id  = i.brandId
      ${showroomJoin}
      ${websiteJoin}
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}`;
  return { sql, params };
}

export const itemReport = {
  key: "items",
  title: "Item Report",
  columns: () => COLUMNS,

  async run(query, { all = false } = {}) {
    const f = parseFilters(query);
    const paging = parsePaging(query, SORTS, { key: "itemName", direction: "asc" });
    const base = baseQuery(f);

    const [[summaryRow]] = await db.query(
      `SELECT COUNT(*) AS itemCount,
              SUM(t.stock) AS stock, SUM(t.stockValue) AS stockValue,
              SUM(t.stockStatus = 'out_of_stock') AS outOfStockCount,
              SUM(t.stockStatus = 'low_stock') AS lowStockCount,
              SUM(t.showroomQty) AS showroomQty, SUM(t.websiteQty) AS websiteQty,
              SUM(t.soldQty) AS soldQty, SUM(t.salesValue) AS salesValue,
              SUM(t.soldQty <= 0) AS notSoldCount
         FROM (${base.sql}) t`,
      base.params
    );
    const total = num(summaryRow.itemCount);

    let sql = `SELECT t.* FROM (${base.sql}) t ${paging.orderSql || "ORDER BY t.itemName ASC"}, t.itemName ASC, t.id ASC`;
    const params = [...base.params];
    if (!all) {
      sql += " LIMIT ? OFFSET ?";
      params.push(paging.limit, paging.offset);
    } else {
      sql += " LIMIT 50001";
    }
    const [rows] = total ? await db.query(sql, params) : [[]];
    if (all && rows.length > 50000) throw new ReportError("More than 50,000 rows — add filters before exporting.", 413);

    return {
      rows: normaliseRows(rows, COLUMNS),
      total,
      summary: Object.fromEntries(Object.entries(summaryRow).map(([k, v]) => [k, round2(v)])),
      columns: COLUMNS,
      paging,
      filters: {
        from: f.range.from,
        to: f.range.to,
        channel: f.channel,
        status: f.status,
        stock: f.stock,
        movement: f.movement,
      },
    };
  },

  describe(result) {
    const fl = result.filters;
    return [
      `Sales period: ${fl.from} to ${fl.to} · Channel: ${fl.channel}`,
      `Items: ${fl.status} · Stock: ${fl.stock} · Movement: ${fl.movement}`,
    ];
  },
};
