import express from "express";
import { sendEmail } from "../controllers/emailConfigController.js";

const router = express.Router();

// Where enquiries land. Overridable without touching code.
const SUPPORT_INBOX = process.env.CONTACT_INBOX || "support@applenext.in";

const SERVICES = [
  "Apple Repair",
  "MacBook / iMac Service",
  "iPhone / iPad Repair",
  "Data Recovery",
  "IT Services & Support",
  "Networking & Wi-Fi",
  "Software & Cloud",
  "Other",
];
const CONTACT_TIMES = ["Anytime", "Morning (10 AM – 1 PM)", "Afternoon (1 PM – 5 PM)", "Evening (5 PM – 8 PM)"];
const VISIT_TYPES = ["Walk-in to Store", "Pickup & Drop", "On-site Visit", "Remote Support"];

const clean = (value, max) => String(value ?? "").trim().slice(0, max);
const esc = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Indian mobile numbers, with or without +91 / 0 prefix.
const PHONE_RE = /^(?:\+?91[- ]?|0)?[6-9]\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Very small in-memory throttle. Not a substitute for a real rate limiter, but
 * it stops a single client hammering the SMTP account from a loop.
 */
const recent = new Map();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 3;

function isThrottled(key) {
  const now = Date.now();
  const hits = (recent.get(key) || []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= MAX_PER_WINDOW) {
    recent.set(key, hits);
    return true;
  }
  hits.push(now);
  recent.set(key, hits);
  // Opportunistic cleanup so the map can't grow without bound.
  if (recent.size > 500) {
    for (const [k, v] of recent) {
      if (!v.some((t) => now - t < WINDOW_MS)) recent.delete(k);
    }
  }
  return false;
}

// ── POST /api/contact ───────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const body = req.body || {};

    // Honeypot: real users never fill a hidden field.
    if (clean(body.company, 100)) {
      return res.status(200).json({ success: true, message: "Message received." });
    }

    const name = clean(body.name, 120);
    const phone = clean(body.phone, 20);
    const email = clean(body.email, 160);
    const service = clean(body.service, 80);
    const device = clean(body.device, 120);
    const message = clean(body.message, 4000);
    const contactTime = clean(body.contactTime, 60) || CONTACT_TIMES[0];
    const visitType = clean(body.visitType, 60) || VISIT_TYPES[0];

    const errors = {};
    if (name.length < 2) errors.name = "Please enter your name.";
    if (!PHONE_RE.test(phone.replace(/\s+/g, ""))) errors.phone = "Enter a valid 10-digit mobile number.";
    if (email && !EMAIL_RE.test(email)) errors.email = "That email address doesn't look right.";
    if (!SERVICES.includes(service)) errors.service = "Please choose a service.";
    if (message.length < 10) errors.message = "Please describe the issue in a little more detail.";

    if (Object.keys(errors).length) {
      return res.status(400).json({ success: false, message: "Please check the form.", errors });
    }

    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || "unknown";
    if (isThrottled(ip)) {
      return res
        .status(429)
        .json({ success: false, message: "Too many messages just now. Please try again in a minute." });
    }

    const rows = [
      ["Name", name],
      ["Phone", phone],
      ["Email", email || "—"],
      ["Service", service],
      ["Device", device || "—"],
      ["Preferred time", contactTime],
      ["Visit type", visitType],
    ];

    const html = `
      <div style="font-family:Segoe UI,Arial,sans-serif;max-width:620px;margin:0 auto;color:#111116">
        <h2 style="margin:0 0 4px;font-size:20px">New enquiry from the website</h2>
        <p style="margin:0 0 20px;color:#6b6b77;font-size:13px">Sent from the AppleNext support page</p>
        <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px">
          ${rows
            .map(
              ([label, value]) => `
            <tr>
              <td style="padding:9px 12px;background:#f7f7f9;border:1px solid #e6e6ec;width:150px;font-weight:600">${esc(label)}</td>
              <td style="padding:9px 12px;border:1px solid #e6e6ec">${esc(value)}</td>
            </tr>`,
            )
            .join("")}
        </table>
        <h3 style="margin:22px 0 8px;font-size:15px">Issue described</h3>
        <div style="padding:14px;border:1px solid #e6e6ec;border-radius:8px;background:#fff;white-space:pre-wrap;font-size:14px;line-height:1.6">${esc(
          message,
        )}</div>
      </div>`;

    const text = [
      "New enquiry from the website",
      ...rows.map(([label, value]) => `${label}: ${value}`),
      "",
      "Issue described:",
      message,
    ].join("\n");

    await sendEmail({
      to: SUPPORT_INBOX,
      subject: `Website enquiry — ${service} — ${name}`,
      html,
      text,
    });

    return res.status(200).json({ success: true, message: "Thanks — we'll get back to you within 2 business hours." });
  } catch (error) {
    console.error("Contact form error:", error);
    // The customer doesn't need to know whether SMTP is misconfigured.
    return res.status(500).json({
      success: false,
      message: "We couldn't send that just now. Please call or WhatsApp us on +91 99985 61006.",
    });
  }
});

// Keeps the form's dropdowns in step with what the server will accept.
router.get("/options", (_req, res) =>
  res.json({ success: true, data: { services: SERVICES, contactTimes: CONTACT_TIMES, visitTypes: VISIT_TYPES } }),
);

export default router;
