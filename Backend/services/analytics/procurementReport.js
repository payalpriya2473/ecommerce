// services/analytics/procurementReport.js
// Analytics → Future Procurement: what to buy, how much and when, per item.
//
// For every active item:
//   sales velocity  avgDaily = 0.6 × (sold last 30 d / 30) + 0.4 × (sold last 90 d / 90)
//                   (Showroom invoices + valid Website orders)
//   lead time       supplier's average days from Purchase Order date to Purchase
//                   Invoice date (last 12 months), else the default lead time
//   safety stock    max(Minimum Qty, 7 days of sales)
//   reorder point   avgDaily × leadTime + safety stock
//   suggested qty   avgDaily × (leadTime + coverDays) + safety − stock  (rounded up)
//                   items with no recent sales: top up to Minimum Qty only
//   est. cost       suggested qty × last purchase rate (else NLC)
//
// Status: reorder_now | reorder_soon | below_min | ok | overstock | dead
// Registered like a report, so paging, sorting and Excel/CSV export are shared.

import { db } from "../../config/db.js";
import {
  parsePaging,
  toId,
  oneOf,
  cleanSearch,
  likePattern,
  normaliseRows,
  round2,
  num,
  ymd,
} from "../reports/reportEngine.js";
import { WEBSITE_SALE_STATUSES } from "../reports/salesSources.js";

const STATUSES = ["reorder_now", "reorder_soon", "below_min", "ok", "overstock", "dead"];

const COLUMNS = [
  { key: "itemName", label: "Item", type: "text", sortable: true, width: 30 },
  { key: "variant", label: "Variant", type: "text" },
  { key: "brandName", label: "Brand", type: "text", sortable: true },
  { key: "categoryName", label: "Category", type: "text", sortable: true },
  { key: "status", label: "Status", type: "badge", sortable: true },
  { key: "stock", label: "Stock", type: "number", sortable: true, total: true },
  { key: "sold30", label: "Sold 30d", type: "number", sortable: true, total: true },
  { key: "sold90", label: "Sold 90d", type: "number", sortable: true, total: true },
  { key: "avgDaily", label: "Avg / Day", type: "number", sortable: true },
  { key: "daysOfStock", label: "Days of Stock", type: "number", sortable: true },
  { key: "runOutDate", label: "Runs Out", type: "date", sortable: true },
  { key: "leadTimeDays", label: "Lead Time (d)", type: "number", sortable: true },
  { key: "reorderBy", label: "Order By", type: "date", sortable: true },
  { key: "suggestedQty", label: "Suggested Qty", type: "number", sortable: true, total: true },
  { key: "unitCost", label: "Unit Cost", type: "currency", sortable: true },
  { key: "estCost", label: "Est. Cost", type: "currency", sortable: true, total: true },
  { key: "supplierName", label: "Last Supplier", type: "text", sortable: true },
  { key: "lastPurchaseDate", label: "Last Purchase", type: "date", sortable: true },
  { key: "stockValue", label: "Stock Value", type: "currency", sortable: true, total: true },
];

const SORTS = Object.fromEntries(
  COLUMNS.filter((c) => c.sortable).map((c) => [c.key, c.key === "status" ? "p.statusRank" : `p.${c.key}`])
);

const clampInt = (v, min, max, fallback) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

function parseFilters(query) {
  return {
    coverDays: clampInt(query.coverDays, 7, 180, 30),
    defaultLeadDays: clampInt(query.leadDays, 1, 60, 7),
    overstockDays: clampInt(query.overstockDays, 30, 365, 120),
    status: STATUSES.includes(query.status) ? query.status : query.status === "action" ? "action" : "all",
    search: cleanSearch(query.search),
    categoryId: toId(query.categoryId),
    brandId: toId(query.brandId),
    itemGroupId: toId(query.itemGroupId),
    supplierId: toId(query.supplierId),
  };
}

function buildQuery(f) {
  const today = new Date();
  const d = (n) => {
    const x = new Date(today);
    x.setDate(x.getDate() - n);
    return `${ymd(x)} 00:00:00`;
  };
  const params = [];

  // Sales velocity from both channels (last 365 days for last-sold date).
  const salesSql = `
    SELECT s.itemId,
           SUM(CASE WHEN s.soldAt >= ? THEN s.qty ELSE 0 END) AS sold30,
           SUM(CASE WHEN s.soldAt >= ? THEN s.qty ELSE 0 END) AS sold90,
           MAX(s.soldAt) AS lastSoldAt
      FROM (
        SELECT sii.itemId, sii.qty, si.billDate AS soldAt
          FROM sales_invoice_items sii JOIN sales_invoices si ON si.id = sii.salesInvoiceId
         WHERE sii.itemId IS NOT NULL AND si.billDate >= ?
        UNION ALL
        SELECT oi.itemId, oi.qty, o.placedAt AS soldAt
          FROM website_order_items oi JOIN website_orders o ON o.id = oi.orderId
         WHERE oi.itemId IS NOT NULL AND o.placedAt >= ? AND o.status IN (?)
      ) s
     GROUP BY s.itemId`;
  params.push(d(29), d(89), d(365), d(365), WEBSITE_SALE_STATUSES);

  // Latest purchase line per item → supplier + rate.
  const lastPurchaseSql = `
    SELECT pii.itemId, pi.supplierId, pii.rate, pi.billDate
      FROM purchase_invoice_items pii
      JOIN purchase_invoices pi ON pi.id = pii.purchaseInvoiceId
      JOIN (SELECT itemId, MAX(id) AS maxId FROM purchase_invoice_items WHERE itemId IS NOT NULL GROUP BY itemId) lx
        ON lx.maxId = pii.id`;

  // Supplier lead time: PO date → purchase invoice date, last 12 months.
  const leadSql = `
    SELECT pi.supplierId, AVG(GREATEST(0, DATEDIFF(pi.billDate, po.poDate))) AS leadDays
      FROM purchase_invoices pi
      JOIN purchase_orders po ON po.id = pi.purchaseOrderId
     WHERE pi.billDate >= ?
     GROUP BY pi.supplierId`;
  params.push(d(365));

  const where = ["i.isActive = 1"];
  if (f.categoryId) { where.push("ig.categoryId = ?"); params.push(f.categoryId); }
  if (f.brandId) { where.push("i.brandId = ?"); params.push(f.brandId); }
  if (f.itemGroupId) { where.push("i.itemGroupId = ?"); params.push(f.itemGroupId); }
  if (f.supplierId) { where.push("lp.supplierId = ?"); params.push(f.supplierId); }
  if (f.search) {
    const like = likePattern(f.search);
    where.push("(i.itemName LIKE ? OR i.variant LIKE ? OR b.name LIKE ? OR sup.name LIKE ?)");
    params.push(like, like, like, like);
  }

  const base = `
    SELECT i.id, i.itemName, i.variant, b.name AS brandName, c.name AS categoryName,
           COALESCE(i.openingStock, 0) AS stock, COALESCE(i.minimumQty, 0) AS minimumQty,
           COALESCE(i.nlc, 0) AS nlc,
           COALESCE(sv.sold30, 0) AS sold30, COALESCE(sv.sold90, 0) AS sold90, sv.lastSoldAt,
           lp.supplierId, sup.name AS supplierName, lp.rate AS lastPurchaseRate, lp.billDate AS lastPurchaseDate,
           COALESCE(LEAST(60, GREATEST(1, ROUND(lt.leadDays))), ${f.defaultLeadDays}) AS leadTimeDays,
           (0.6 * COALESCE(sv.sold30, 0) / 30 + 0.4 * COALESCE(sv.sold90, 0) / 90) AS avgDaily
      FROM items i
      LEFT JOIN item_groups ig ON ig.id = i.itemGroupId
      LEFT JOIN categories c   ON c.id  = ig.categoryId
      LEFT JOIN brands b       ON b.id  = i.brandId
      LEFT JOIN (${salesSql}) sv ON sv.itemId = i.id
      LEFT JOIN (${lastPurchaseSql}) lp ON lp.itemId = i.id
      LEFT JOIN suppliers sup ON sup.id = lp.supplierId
      LEFT JOIN (${leadSql}) lt ON lt.supplierId = lp.supplierId
     WHERE ${where.join(" AND ")}`;

  // Planning maths on top of the base row.
  const planned = `
    SELECT q.*,
           CASE WHEN q.avgDaily > 0 THEN q.stock / q.avgDaily END AS daysOfStock,
           CASE WHEN q.avgDaily > 0 THEN DATE_ADD(CURDATE(), INTERVAL (FLOOR(GREATEST(0, q.stock) / q.avgDaily)) DAY) END AS runOutDate,
           CASE WHEN q.avgDaily > 0
                THEN DATE_ADD(CURDATE(), INTERVAL (FLOOR(GREATEST(0, q.stock) / q.avgDaily) - q.leadTimeDays) DAY) END AS reorderBy,
           CASE WHEN q.avgDaily > 0
                THEN GREATEST(0, CEIL(q.avgDaily * (q.leadTimeDays + ${f.coverDays}) + q.safetyStock - q.stock))
                ELSE GREATEST(0, q.minimumQty - q.stock) END AS suggestedQty,
           COALESCE(NULLIF(q.lastPurchaseRate, 0), q.nlc) AS unitCost,
           GREATEST(0, q.stock) * q.nlc AS stockValue
      FROM (
        SELECT b0.*, GREATEST(b0.minimumQty, CEIL(b0.avgDaily * 7)) AS safetyStock
          FROM (${base}) b0
      ) q`;

  const classified = `
    SELECT r.*,
           r.suggestedQty * r.unitCost AS estCost,
           CASE
             WHEN r.avgDaily > 0 AND r.stock <= r.avgDaily * r.leadTimeDays + r.safetyStock THEN 'reorder_now'
             WHEN r.avgDaily > 0 AND r.daysOfStock <= r.leadTimeDays + 14 THEN 'reorder_soon'
             WHEN r.avgDaily = 0 AND r.stock > 0 AND r.sold90 = 0 AND (r.lastSoldAt IS NULL OR r.lastSoldAt < '${d(89)}') THEN 'dead'
             WHEN r.avgDaily = 0 AND r.stock < r.minimumQty THEN 'below_min'
             WHEN r.avgDaily > 0 AND r.daysOfStock > ${f.overstockDays} THEN 'overstock'
             ELSE 'ok'
           END AS status
      FROM (${planned}) r`; // d() is a server-generated date, safe to inline

  const ranked = `
    SELECT p0.*,
           FIELD(p0.status, 'reorder_now', 'reorder_soon', 'below_min', 'overstock', 'dead', 'ok') AS statusRank
      FROM (${classified}) p0`;

  return { sql: ranked, params };
}

export const procurementReport = {
  key: "procurement",
  title: "Future Procurement",
  columns: () => COLUMNS,

  async run(query, { all = false } = {}) {
    const f = parseFilters(query);
    const paging = parsePaging(query, SORTS, { key: "status", direction: "asc" });
    const q = buildQuery(f);

    const statusWhere =
      f.status === "action"
        ? "WHERE p.status IN ('reorder_now', 'reorder_soon', 'below_min')"
        : f.status !== "all"
          ? "WHERE p.status = ?"
          : "";
    const statusParams = f.status !== "all" && f.status !== "action" ? [f.status] : [];

    const [[summaryRow], [statusRows], [supplierRows]] = await Promise.all([
      db.query(
        `SELECT COUNT(*) AS itemCount, SUM(p.stock) AS stock, SUM(p.suggestedQty) AS suggestedQty,
                SUM(p.estCost) AS estCost, SUM(p.stockValue) AS stockValue,
                SUM(p.sold30) AS sold30, SUM(p.sold90) AS sold90
           FROM (${q.sql}) p ${statusWhere}`,
        [...q.params, ...statusParams]
      ),
      // Status counts ignore the status filter so the tabs always show totals.
      db.query(
        `SELECT p.status, COUNT(*) AS items, SUM(p.estCost) AS estCost, SUM(p.stockValue) AS stockValue
           FROM (${q.sql}) p GROUP BY p.status`,
        q.params
      ),
      db.query(
        `SELECT p.supplierId, COALESCE(p.supplierName, 'No purchase history') AS supplierName,
                COUNT(*) AS items, SUM(p.suggestedQty) AS qty, SUM(p.estCost) AS estCost,
                MIN(p.reorderBy) AS earliestOrderBy
           FROM (${q.sql}) p
          WHERE p.status IN ('reorder_now', 'reorder_soon', 'below_min') AND p.suggestedQty > 0
          GROUP BY p.supplierId, supplierName
          ORDER BY estCost DESC
          LIMIT 20`,
        q.params
      ),
    ]);

    const total = num(summaryRow[0]?.itemCount);
    let sql = `SELECT p.* FROM (${q.sql}) p ${statusWhere} ${paging.orderSql || ""}${paging.orderSql ? ", p.estCost DESC, p.itemName ASC" : ""}`;
    const params = [...q.params, ...statusParams];
    if (!all) {
      sql += " LIMIT ? OFFSET ?";
      params.push(paging.limit, paging.offset);
    }
    const [rows] = total ? await db.query(sql, params) : [[]];

    const statusCounts = Object.fromEntries(STATUSES.map((s) => [s, { items: 0, estCost: 0, stockValue: 0 }]));
    for (const r of statusRows) {
      statusCounts[r.status] = { items: num(r.items), estCost: round2(r.estCost), stockValue: round2(r.stockValue) };
    }

    return {
      rows: normaliseRows(rows, COLUMNS),
      total,
      summary: Object.fromEntries(Object.entries(summaryRow[0] || {}).map(([k, v]) => [k, round2(v)])),
      extra: {
        statusCounts,
        bySupplier: supplierRows.map((r) => ({
          supplierId: r.supplierId,
          supplierName: r.supplierName,
          items: num(r.items),
          qty: round2(r.qty),
          estCost: round2(r.estCost),
          earliestOrderBy: r.earliestOrderBy,
        })),
        settings: { coverDays: f.coverDays, defaultLeadDays: f.defaultLeadDays, overstockDays: f.overstockDays },
      },
      columns: COLUMNS,
      paging,
      filters: { from: ymd(new Date()), to: ymd(new Date()), status: f.status, coverDays: f.coverDays },
    };
  },

  describe(result) {
    const s = result.extra.settings;
    return [
      `As of ${result.filters.from} · Cover ${s.coverDays} days after delivery · Default lead time ${s.defaultLeadDays} days`,
      `Status filter: ${result.filters.status}`,
    ];
  },
};
