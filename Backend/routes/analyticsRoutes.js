// routes/analyticsRoutes.js — Admin Analytics (/api/analytics)
//
//   GET /api/analytics/filters       lookup lists (categories, brands, suppliers …)
//   GET /api/analytics/overview      sales overview dashboard (?from&to&channel&granularity)
//   GET /api/analytics/procurement   future procurement plan (paged; ?export=xlsx|csv)
//
// Permission: analytics:view (Super Admin always allowed).

import express from "express";
import { authenticateToken } from "../middleware/auth.js";
import { checkPermission } from "../middleware/permissionMiddleware.js";
import { ReportError } from "../services/reports/reportEngine.js";
import { salesOverview } from "../services/analytics/salesOverview.js";
import { procurementReport } from "../services/analytics/procurementReport.js";
import { filterOptions, sendReport } from "./reportRoutes.js";

const router = express.Router();

router.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
router.use(authenticateToken);
router.use(checkPermission("analytics", "view"));

router.get("/filters", async (req, res) => {
  res.json({ success: true, data: await filterOptions() });
});

router.get("/overview", async (req, res) => {
  try {
    res.json({ success: true, data: await salesOverview(req.query) });
  } catch (e) {
    if (e instanceof ReportError) return res.status(e.status).json({ success: false, message: e.message });
    console.error("[analytics/overview]", e);
    res.status(500).json({ success: false, message: "Could not load sales analytics. Please try again." });
  }
});

router.get("/procurement", (req, res) => sendReport(procurementReport, req, res));

export default router;
