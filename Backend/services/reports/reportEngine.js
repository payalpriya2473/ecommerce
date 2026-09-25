// services/reports/reportEngine.js
// Shared building blocks for every admin report (Reports module).
//
// A report is a plain object registered in services/reports/index.js:
//
//   {
//     key, title,
//     views?: { [view]: { label } },            // optional sub-views
//     columns(view) -> ReportColumn[],          // drives the UI table AND the export
//     run(filters, { page, limit, sort, all }) -> { rows, total, summary, meta? }
//   }
//
// ReportColumn = { key, label, type: 'text'|'number'|'currency'|'date'|'datetime'|'percent'|'badge',
//                  sortable?: boolean, total?: boolean, width?: number }
//
// Everything a report needs from the request (dates, paging, sorting, ids)
// is parsed here so each report stays declarative and consistent.

import XLSX from "xlsx";

export class ReportError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export const MAX_PAGE_SIZE = 200;
export const MAX_EXPORT_ROWS = 50000;

const pad = (n) => String(n).padStart(2, "0");
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isYmd = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) && !Number.isNaN(new Date(`${v}T00:00:00`).getTime());

/**
 * Date range from ?from=YYYY-MM-DD&to=YYYY-MM-DD (inclusive).
 * Default: first day of the current month → today. Max span 5 years.
 * Returns SQL-ready bounds: start (>=) and endExclusive (<) so it works for
 * DATE, DATETIME and TIMESTAMP columns alike.
 */
export function parseDateRange(query = {}) {
  const today = new Date();
  const from = isYmd(query.from) ? query.from : ymd(new Date(today.getFullYear(), today.getMonth(), 1));
  const to = isYmd(query.to) ? query.to : ymd(today);
  if (from > to) throw new ReportError("'From' date must be on or before 'To' date.");
  const end = new Date(`${to}T00:00:00`);
  end.setDate(end.getDate() + 1);
  const spanDays = (end - new Date(`${from}T00:00:00`)) / 86400000;
  if (spanDays > 366 * 5) throw new ReportError("Please choose a date range of 5 years or less.");
  return { from, to, start: `${from} 00:00:00`, endExclusive: `${ymd(end)} 00:00:00` };
}

/** Page / limit / sort from the query, sort validated against a whitelist map. */
export function parsePaging(query = {}, sortMap = {}, defaultSort = { key: null, direction: "desc" }) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(query.limit, 10) || 25));
  const requestedKey = String(query.sortKey || "");
  const key = sortMap[requestedKey] ? requestedKey : defaultSort.key;
  const requestedDir = String(query.sortDirection || "").toLowerCase();
  const dir = ["asc", "desc"].includes(requestedDir)
    ? requestedDir.toUpperCase()
    : String(defaultSort.direction || "desc").toUpperCase();
  const expr = sortMap[key];
  return {
    page,
    limit,
    offset: (page - 1) * limit,
    sortKey: key,
    sortDirection: dir.toLowerCase(),
    orderSql: expr ? `ORDER BY ${expr} ${dir}` : "",
  };
}

export const toId = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export const oneOf = (v, allowed, fallback) => (allowed.includes(String(v)) ? String(v) : fallback);

export const cleanSearch = (v) => String(v ?? "").trim().slice(0, 100);

/** LIKE pattern with %, _ and \ escaped. */
export const likePattern = (v) => `%${String(v).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
export const round2 = (v) => Math.round(num(v) * 100) / 100;

/** Coerce DB rows to the column types (DECIMAL arrives as string from mysql2). */
export function normaliseRows(rows, columns) {
  const numeric = columns.filter((c) => ["number", "currency", "percent"].includes(c.type)).map((c) => c.key);
  return rows.map((row) => {
    const out = { ...row };
    for (const key of numeric) if (key in out) out[key] = out[key] == null ? null : round2(out[key]);
    return out;
  });
}

// ─── Export ─────────────────────────────────────────────────────────────────

const NUMBER_FORMAT = { number: "#,##0", currency: "#,##0.00", percent: "0.00" };

function cellValue(col, value) {
  if (value == null || value === "") return "";
  if (col.type === "date" || col.type === "datetime") {
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d;
  }
  if (NUMBER_FORMAT[col.type]) return num(value);
  return String(value);
}

/**
 * Build an XLSX or CSV buffer: title, filter lines, header, data rows and a
 * totals row for columns flagged `total: true`.
 */
export function buildExport({ format = "xlsx", title, subtitleLines = [], columns, rows, totals = {} }) {
  const header = columns.map((c) => c.label);
  const body = rows.map((row) => columns.map((c) => cellValue(c, row[c.key])));
  const hasTotals = columns.some((c) => c.total);
  const totalRow = hasTotals
    ? columns.map((c, i) => (c.total ? num(totals[c.key]) : i === 0 ? "Total" : ""))
    : null;

  if (format === "csv") {
    const esc = (v) => {
      const s = v instanceof Date ? ymd(v) : String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [header, ...body, ...(totalRow ? [totalRow] : [])].map((r) => r.map(esc).join(","));
    return { buffer: Buffer.from(`﻿${lines.join("\r\n")}`, "utf8"), contentType: "text/csv; charset=utf-8", ext: "csv" };
  }

  const aoa = [[title], ...subtitleLines.map((l) => [l]), [], header, ...body, ...(totalRow ? [totalRow] : [])];
  const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
  const headerRow = subtitleLines.length + 2; // 0-based index of the header row
  const lastRow = headerRow + body.length + (totalRow ? 1 : 0);

  columns.forEach((col, c) => {
    for (let r = headerRow + 1; r <= lastRow; r++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (!cell) continue;
      if (NUMBER_FORMAT[col.type] && cell.t === "n") {
        cell.z = col.type === "number" ? (Number.isInteger(cell.v) ? "#,##0" : "#,##0.00") : NUMBER_FORMAT[col.type];
      }
      if (col.type === "date" && cell.t === "d") cell.z = "dd-mmm-yyyy";
      if (col.type === "datetime" && cell.t === "d") cell.z = "dd-mmm-yyyy hh:mm";
    }
  });
  ws["!cols"] = columns.map((col) => ({
    wch: col.width || Math.min(40, Math.max(10, col.label.length + 2, col.type === "text" ? 18 : 12)),
  }));
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ r: headerRow, c: 0 }, { r: headerRow + body.length, c: columns.length - 1 }) };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 31).replace(/[\\/?*[\]:]/g, " "));
  return {
    buffer: XLSX.write(wb, { type: "buffer", bookType: "xlsx", cellDates: true }),
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ext: "xlsx",
  };
}
