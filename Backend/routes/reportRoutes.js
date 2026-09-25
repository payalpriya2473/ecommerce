// routes/reportRoutes.js — Admin Reports module (/api/reports)
//
//   GET /api/reports/filters          lookup lists for report filter dropdowns
//   GET /api/reports/:key             JSON page: { data, columns, summary, pagination, filters }
//   GET /api/reports/:key?export=xlsx full result as Excel (or export=csv)
//
// Permission: reports:view (Super Admin always allowed).

import express from "express";
import { db } from "../config/db.js";
import { authenticateToken } from "../middleware/auth.js";
import { checkPermission } from "../middleware/permissionMiddleware.js";
import { REPORTS, ReportError, buildExport } from "../services/reports/index.js";

const router = express.Router();

router.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
router.use(authenticateToken);
router.use(checkPermission("reports", "view"));

const safeQuery = (sql, params = []) =>
  db.query(sql, params).then(([rows]) => rows).catch((e) => {
    console.error("[reports/filters]", e.message);
    return [];
  });

/** Lookup lists for report / analytics filter dropdowns. */
export async function filterOptions() {
  const [categories, brands, itemGroups, salesmen, showroomModes, websiteModes, suppliers] = await Promise.all([
    safeQuery("SELECT id, name FROM categories WHERE isActive = 1 ORDER BY name"),
    safeQuery("SELECT id, name FROM brands WHERE isActive = 1 ORDER BY name"),
    safeQuery("SELECT id, name, categoryId FROM item_groups ORDER BY name"),
    safeQuery(
      `SELECT DISTINCT e.id, e.name FROM employees e
         JOIN sales_invoices si ON si.salesmanId = e.id
        ORDER BY e.name`
    ),
    safeQuery("SELECT DISTINCT mop AS mode FROM sales_invoices WHERE mop IS NOT NULL AND mop <> '' ORDER BY mop LIMIT 50"),
    safeQuery("SELECT DISTINCT paymentMethod AS mode FROM website_orders WHERE paymentMethod IS NOT NULL ORDER BY paymentMethod LIMIT 50"),
    safeQuery(
      `SELECT DISTINCT s.id, s.name FROM suppliers s
         JOIN purchase_invoices pi ON pi.supplierId = s.id
        ORDER BY s.name`
    ),
  ]);
  return {
    categories,
    brands,
    itemGroups,
    salesmen,
    suppliers,
    paymentModes: [...new Set([...showroomModes, ...websiteModes].map((r) => r.mode))],
  };
}

router.get("/filters", async (req, res) => {
  res.json({ success: true, data: await filterOptions() });
});

/**
 * Run a registered report and reply with a JSON page, or the full result as
 * an Excel/CSV download when ?export=xlsx|csv. Shared by Reports and Analytics.
 */
export async function sendReport(report, req, res) {
  const exportFormat = ["xlsx", "csv"].includes(req.query.export) ? req.query.export : null;
  const started = Date.now();
  try {
    const result = await report.run(req.query, { all: Boolean(exportFormat) });

    if (exportFormat) {
      const { buffer, contentType, ext } = buildExport({
        format: exportFormat,
        title: report.title,
        subtitleLines: [...report.describe(result), `Generated: ${new Date().toLocaleString("en-IN")}`],
        columns: result.columns,
        rows: result.rows,
        totals: result.summary,
      });
      const stamp = `${result.filters.from}_to_${result.filters.to}`;
      res.set({
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${report.key}-report_${stamp}.${ext}"`,
      });
      return res.send(buffer);
    }

    return res.json({
      success: true,
      data: result.rows,
      columns: result.columns,
      summary: result.summary,
      filters: result.filters,
      pagination: {
        page: result.paging.page,
        limit: result.paging.limit,
        totalItems: result.total,
        totalPages: Math.max(1, Math.ceil(result.total / result.paging.limit)),
        sortKey: result.paging.sortKey,
        sortDirection: result.paging.sortDirection,
      },
      extra: result.extra || null,
      meta: { views: report.views || null, tookMs: Date.now() - started },
    });
  } catch (e) {
    if (e instanceof ReportError) return res.status(e.status).json({ success: false, message: e.message });
    console.error(`[reports/${report.key}]`, e);
    return res.status(500).json({ success: false, message: "Could not generate the report. Please try again." });
  }
}

router.get("/:key", async (req, res) => {
  const report = REPORTS[req.params.key];
  if (!report) return res.status(404).json({ success: false, message: "Unknown report" });
  return sendReport(report, req, res);
});

export default router;
