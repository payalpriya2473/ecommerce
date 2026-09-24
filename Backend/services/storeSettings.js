// services/storeSettings.js
// Store details used on the GST invoice and in order emails
// (table online_store_settings, single row id = 1 — see
// online_orders_invoice_email_queries.sql). Edited from
// Admin → Settings → Online Store.

import { db } from "../config/db.js";

export const GST_STATE_CODES = {
  "jammu and kashmir": "01", "himachal pradesh": "02", punjab: "03", chandigarh: "04",
  uttarakhand: "05", haryana: "06", delhi: "07", rajasthan: "08", "uttar pradesh": "09",
  bihar: "10", sikkim: "11", "arunachal pradesh": "12", nagaland: "13", manipur: "14",
  mizoram: "15", tripura: "16", meghalaya: "17", assam: "18", "west bengal": "19",
  jharkhand: "20", odisha: "21", chhattisgarh: "22", "madhya pradesh": "23", gujarat: "24",
  "dadra and nagar haveli and daman and diu": "26", maharashtra: "27", karnataka: "29",
  goa: "30", lakshadweep: "31", kerala: "32", "tamil nadu": "33", puducherry: "34",
  "andaman and nicobar islands": "35", telangana: "36", "andhra pradesh": "37", ladakh: "38",
};

export const normState = (s) =>
  String(s || "").trim().toLowerCase().replace(/&/g, "and").replace(/\s+/g, " ");

export const stateCode = (s) => GST_STATE_CODES[normState(s)] || "";

const DEFAULTS = {
  legalName: "",
  tradeName: "AppleNext",
  gstin: "",
  pan: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "Gujarat",
  pinCode: "",
  phone: "",
  email: "",
  website: process.env.WEBSITE_URL || "https://shop.applenext.in",
  alertEmail: process.env.ORDER_ALERT_EMAIL || "",
  invoicePrefix: "WEB/",
  nextInvoiceNumber: 1,
  invoiceFy: "",
  invoiceTerms: "",
  sendCustomerEmails: true,
  configured: false,
};

export const EDITABLE_FIELDS = [
  "legalName", "tradeName", "gstin", "pan", "addressLine1", "addressLine2", "city", "state",
  "pinCode", "phone", "email", "website", "alertEmail", "invoicePrefix", "invoiceTerms",
  "sendCustomerEmails",
];

let cache = null;
let cacheAt = 0;

export async function getStoreSettings({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cacheAt < 60_000) return cache;
  try {
    const [[row]] = await db.query("SELECT * FROM online_store_settings WHERE id = 1");
    cache = row
      ? { ...DEFAULTS, ...row, sendCustomerEmails: Boolean(Number(row.sendCustomerEmails)), configured: true }
      : { ...DEFAULTS };
  } catch (e) {
    if (e?.code !== "ER_NO_SUCH_TABLE") throw e;
    cache = { ...DEFAULTS };
  }
  cacheAt = Date.now();
  return cache;
}

export async function updateStoreSettings(data = {}) {
  const sets = [];
  const params = [];
  for (const key of EDITABLE_FIELDS) {
    if (!(key in data)) continue;
    let value = data[key];
    if (key === "sendCustomerEmails") value = value ? 1 : 0;
    else value = String(value ?? "").trim();
    if (key === "gstin" || key === "pan") value = value.toUpperCase();
    if (key === "gstin" && value && !/^[0-9]{2}[A-Z0-9]{13}$/.test(value)) {
      const err = new Error("GSTIN must be 15 characters (e.g. 24ABCDE1234F1Z5).");
      err.status = 400;
      throw err;
    }
    sets.push(`${key} = ?`);
    params.push(value);
  }
  if (sets.length) {
    await db.query("INSERT IGNORE INTO online_store_settings (id) VALUES (1)");
    await db.query(`UPDATE online_store_settings SET ${sets.join(", ")} WHERE id = 1`, params);
  }
  return getStoreSettings({ fresh: true });
}

/** Indian financial year label, e.g. "26-27" (April–March). */
export function financialYear(date = new Date()) {
  const start = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  return `${String(start).slice(-2)}-${String(start + 1).slice(-2)}`;
}

/**
 * Reserve the next invoice number inside the caller's transaction.
 * Format: <prefix><NNNN>/<FY>  e.g. WEB/0001/26-27 — restarts every April.
 */
export async function takeInvoiceNumber(conn) {
  await conn.query("INSERT IGNORE INTO online_store_settings (id) VALUES (1)");
  const [[row]] = await conn.query(
    "SELECT invoicePrefix, nextInvoiceNumber, invoiceFy FROM online_store_settings WHERE id = 1 FOR UPDATE"
  );
  const fy = financialYear();
  const number = row.invoiceFy === fy ? Number(row.nextInvoiceNumber) || 1 : 1;
  await conn.query(
    "UPDATE online_store_settings SET nextInvoiceNumber = ?, invoiceFy = ? WHERE id = 1",
    [number + 1, fy]
  );
  cache = null;
  return `${row.invoicePrefix || ""}${String(number).padStart(4, "0")}/${fy}`;
}
