// routes/adminStoreSettings.js — Admin → Settings → Online Store
// Store details for the GST invoice + order email settings.
import express from "express";
import { authenticateToken } from "../middleware/auth.js";
import { checkPermission } from "../middleware/permissionMiddleware.js";
import { getStoreSettings, updateStoreSettings, financialYear } from "../services/storeSettings.js";
import { db } from "../config/db.js";
import { verifySmtp, sendEmail } from "../controllers/emailConfigController.js";

const router = express.Router();
router.use(authenticateToken);

const shape = (s) => ({
  legalName: s.legalName,
  tradeName: s.tradeName,
  gstin: s.gstin,
  pan: s.pan,
  addressLine1: s.addressLine1,
  addressLine2: s.addressLine2,
  city: s.city,
  state: s.state,
  pinCode: s.pinCode,
  phone: s.phone,
  email: s.email,
  website: s.website,
  alertEmail: s.alertEmail,
  invoicePrefix: s.invoicePrefix,
  invoiceTerms: s.invoiceTerms || "",
  sendCustomerEmails: Boolean(s.sendCustomerEmails),
  configured: Boolean(s.configured),
  nextInvoicePreview: `${s.invoicePrefix || ""}${String(s.invoiceFy === financialYear() ? s.nextInvoiceNumber || 1 : 1).padStart(4, "0")}/${financialYear()}`,
});

router.get("/", checkPermission("online_orders", "view"), async (req, res) => {
  try {
    res.json({ success: true, data: shape(await getStoreSettings({ fresh: true })) });
  } catch (e) {
    console.error("[store-settings/get]", e);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.put("/", checkPermission("online_orders", "edit"), async (req, res) => {
  try {
    const saved = await updateStoreSettings(req.body || {});
    res.json({ success: true, message: "Online store settings saved", data: shape(saved) });
  } catch (e) {
    if (e.status === 400) return res.status(400).json({ success: false, message: e.message });
    if (e?.code === "ER_NO_SUCH_TABLE") {
      return res.status(500).json({ success: false, message: "Run online_orders_invoice_email_queries.sql in phpMyAdmin first." });
    }
    console.error("[store-settings/put]", e);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * GET /api/admin/store-settings/email-health
 * Everything that decides whether order emails go out, with a fix for each problem.
 */
router.get("/email-health", checkPermission("online_orders", "view"), async (req, res) => {
  const checks = [];
  const add = (key, label, ok, detail, fix = null) => checks.push({ key, label, ok, detail, fix });

  const smtp = await verifySmtp().catch((e) => ({ ok: false, problems: [e.message] }));
  add("smtp", "SMTP connection & login", smtp.ok, smtp.ok ? `${smtp.server} · sending as ${smtp.from}` : smtp.problems.join(" "),
    smtp.ok ? null : "Settings → Email Config: fill host, port, username, password (Gmail: App Password), tick Active, Save, then Send Test.");

  const store = await getStoreSettings({ fresh: true });
  add("customerEmails", "Customer emails switched on", Boolean(store.sendCustomerEmails),
    store.sendCustomerEmails ? "On" : "Off", store.sendCustomerEmails ? null : "Tick “Email customers…” below and Save.");
  add("alertEmail", "Store alert email", Boolean(store.alertEmail), store.alertEmail || "Not set (store alerts are skipped)",
    store.alertEmail ? null : "Optional: add the address that should get new-order alerts.");

  const tableCheck = async (sql) => db.query(sql).then(() => true).catch(() => false);
  const logTable = await tableCheck("SELECT id FROM website_order_notifications LIMIT 1");
  add("logTable", "Email log table", logTable, logTable ? "OK" : "Missing — emails still send but are not logged or de-duplicated",
    logTable ? null : "Run online_orders_invoice_email_queries.sql in phpMyAdmin.");
  const retry = logTable && (await tableCheck("SELECT attempts, nextRetryAt, retried FROM website_order_notifications LIMIT 1"));
  add("retry", "Automatic retry of failed emails", retry, retry ? "On (after 2, 10 and 60 minutes)" : "Off",
    retry ? null : "Run online_orders_email_retry_queries.sql in phpMyAdmin.");
  const snapshot = await tableCheck("SELECT customerEmail FROM website_orders LIMIT 1");
  add("orderEmail", "Customer email saved on each order", snapshot, snapshot ? "OK" : "Using the account email instead",
    snapshot ? null : "Run online_orders_email_retry_queries.sql in phpMyAdmin.");

  const siteUrl = process.env.WEBSITE_URL || store.website;
  add("siteUrl", "Website link used in emails", Boolean(siteUrl) && !/localhost/.test(siteUrl), siteUrl || "Not set",
    /localhost/.test(siteUrl || "") ? "On the live server set WEBSITE_URL=https://shop.applenext.in in Backend/.env." : null);

  let recent = [];
  if (logTable) {
    [recent] = await db.query(
      `SELECT n.id, n.orderId, o.orderNumber, n.event, n.audience, n.recipient, n.status, n.error, n.createdAt
         FROM website_order_notifications n LEFT JOIN website_orders o ON o.id = n.orderId
        ORDER BY n.id DESC LIMIT 15`
    ).catch(() => [[]]);
  }
  res.json({ success: true, data: { ok: checks.every((c) => c.ok || ["alertEmail"].includes(c.key)), checks, recent } });
});

/** POST /api/admin/store-settings/email-test { to } — send a sample order email. */
router.post("/email-test", checkPermission("online_orders", "edit"), async (req, res) => {
  const to = String(req.body?.to || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return res.status(400).json({ success: false, message: "Enter a valid email address." });
  try {
    const store = await getStoreSettings();
    const info = await sendEmail({
      to,
      subject: `${store.tradeName || "AppleNext"} — test order email`,
      html: `<div style="font-family:Arial,sans-serif;padding:24px"><h2 style="color:#c8102e">${store.tradeName || "AppleNext"}</h2>
             <p>This is a test from Online Store settings. If you received it, order emails to customers will be delivered.</p></div>`,
      text: "Test order email — order emails are working.",
    });
    if (info?.rejected?.length) return res.status(502).json({ success: false, message: `Rejected: ${info.rejected.join(", ")}` });
    res.json({ success: true, message: `Test email accepted for delivery to ${to}. Check Inbox and Spam.` });
  } catch (e) {
    res.status(502).json({ success: false, message: `Could not send: ${e.message}` });
  }
});

export default router;
