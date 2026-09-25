// services/reports/index.js — report registry.
// To add a report: create services/reports/<name>Report.js exporting an object
// with { key, title, columns(view), run(query, { all }), describe(result) } and
// register it here. The route, export and permission handling come for free.
import { itemReport } from "./itemReport.js";
import { salesReport } from "./salesReport.js";

export const REPORTS = {
  [itemReport.key]: itemReport,
  [salesReport.key]: salesReport,
};

export { ReportError, buildExport } from "./reportEngine.js";
