// routes/adminStoreSettings.js — Admin → Settings → Online Store
// Store details for the GST invoice + order email settings.
import express from "express";
import { authenticateToken } from "../middleware/auth.js";
import { checkPermission } from "../middleware/permissionMiddleware.js";
import { getStoreSettings, updateStoreSettings, financialYear } from "../services/storeSettings.js";

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

export default router;
