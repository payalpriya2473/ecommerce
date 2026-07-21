import pool from "../config/db.js";
import nodemailer from "nodemailer";

function normalizeEmail(value = "") {
  return String(value).trim().toLowerCase();
}

function domainMatches(email, patterns) {
  const normalized = normalizeEmail(email);
  if (!normalized || !normalized.includes("@")) return false;
  return patterns.some((pattern) => normalized.endsWith(pattern));
}

function resolveSmtpAuthUser(cfg) {
  const smtpUser = String(cfg.smtp_user || "").trim();
  const fromEmail = String(cfg.from_email || "").trim();
  const host = String(cfg.smtp_host || "").toLowerCase();

  if (!smtpUser && fromEmail) return fromEmail;

  const isGmailHost = host.includes("gmail.com");
  const isOutlookHost =
    host.includes("office365.com") || host.includes("outlook.com") || host.includes("hotmail.com");
  const isYahooHost = host.includes("yahoo.com");

  if (
    isGmailHost &&
    fromEmail &&
    domainMatches(fromEmail, ["@gmail.com", "@googlemail.com"]) &&
    !domainMatches(smtpUser, ["@gmail.com", "@googlemail.com"])
  ) {
    return fromEmail;
  }

  if (
    isOutlookHost &&
    fromEmail &&
    domainMatches(fromEmail, ["@outlook.com", "@hotmail.com", "@live.com", "@msn.com"]) &&
    !domainMatches(smtpUser, ["@outlook.com", "@hotmail.com", "@live.com", "@msn.com"])
  ) {
    return fromEmail;
  }

  if (
    isYahooHost &&
    fromEmail &&
    domainMatches(fromEmail, ["@yahoo.com", "@ymail.com", "@rocketmail.com"]) &&
    !domainMatches(smtpUser, ["@yahoo.com", "@ymail.com", "@rocketmail.com"])
  ) {
    return fromEmail;
  }

  return smtpUser || fromEmail;
}

function buildTransportOptions(cfg) {
  const authUser = resolveSmtpAuthUser(cfg);

  return {
    host: cfg.smtp_host,
    port: cfg.smtp_port,
    secure: cfg.smtp_secure === "ssl",
    requireTLS: cfg.smtp_secure === "tls",
    auth: {
      user: authUser,
      pass: cfg.smtp_password,
    },
    tls: cfg.smtp_secure === "none" ? { rejectUnauthorized: false } : undefined,
  };
}

// GET /api/settings/email
export const getEmailConfig = async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM email_config WHERE id = 1");
    if (!rows.length) return res.status(404).json({ message: "Email config not found" });

    const r = rows[0];
    res.json({
      smtpHost: r.smtp_host,
      smtpPort: r.smtp_port,
      smtpSecure: r.smtp_secure,
      smtpUser: r.smtp_user,
      smtpPassword: r.smtp_password ? "••••••••" : "",
      fromName: r.from_name,
      fromEmail: r.from_email,
      isActive: r.is_active === 1,
    });
  } catch (err) {
    console.error("getEmailConfig error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// PUT /api/settings/email
export const saveEmailConfig = async (req, res) => {
  try {
    const { smtpHost, smtpPort, smtpSecure, smtpUser, smtpPassword, fromName, fromEmail, isActive } =
      req.body;

    let passwordToSave = smtpPassword;
    if (!smtpPassword || smtpPassword === "••••••••") {
      const [existing] = await pool.query("SELECT smtp_password FROM email_config WHERE id = 1");
      passwordToSave = existing[0]?.smtp_password || "";
    }

    const userToSave = String(smtpUser || "").trim() || String(fromEmail || "").trim();

    await pool.query(
      `UPDATE email_config SET
        smtp_host = ?, smtp_port = ?, smtp_secure = ?,
        smtp_user = ?, smtp_password = ?,
        from_name = ?, from_email = ?, is_active = ?
      WHERE id = 1`,
      [
        smtpHost || "",
        parseInt(smtpPort) || 587,
        smtpSecure || "tls",
        userToSave,
        passwordToSave,
        fromName || "Motabhai Enterprise Suite",
        fromEmail || "",
        isActive ? 1 : 0,
      ],
    );

    res.json({ message: "Email configuration saved successfully" });
  } catch (err) {
    console.error("saveEmailConfig error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

function buildProfessionalTestEmail(cfg) {
  const security = String(cfg.smtp_secure || "").toUpperCase() || "N/A";
  const sender = `${cfg.from_name} <${cfg.from_email || cfg.smtp_user}>`;
  const server = `${cfg.smtp_host}:${cfg.smtp_port}`;

  return `
    <div style="margin:0;background:#f6f7fb;padding:32px 16px;font-family:Arial,sans-serif;color:#1f2937;">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(15,23,42,.08);">
        <div style="background:linear-gradient(135deg,#e11d48,#dc2626);padding:24px 28px;color:#fff;">
          <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;opacity:.9;">Motabhai Enterprise Suite</div>
          <div style="font-size:28px;font-weight:700;line-height:1.2;margin-top:8px;">SMTP Test Email</div>
          <div style="font-size:14px;opacity:.95;margin-top:8px;">Your outgoing mail configuration has been verified successfully.</div>
        </div>

        <div style="padding:28px;">
          <p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:#111827;">Hello,</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.7;color:#374151;">
            This is a professional test message from the Motabhai Enterprise Suite email system. If you are receiving this email, your SMTP settings are working correctly.
          </p>

          <div style="margin:24px 0;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
              <tr style="background:#f9fafb;">
                <td style="padding:14px 16px;width:160px;font-weight:700;color:#6b7280;border-bottom:1px solid #e5e7eb;">Server</td>
                <td style="padding:14px 16px;color:#111827;border-bottom:1px solid #e5e7eb;">${server}</td>
              </tr>
              <tr>
                <td style="padding:14px 16px;font-weight:700;color:#6b7280;border-bottom:1px solid #e5e7eb;">Security</td>
                <td style="padding:14px 16px;color:#111827;border-bottom:1px solid #e5e7eb;">${security}</td>
              </tr>
              <tr style="background:#f9fafb;">
                <td style="padding:14px 16px;font-weight:700;color:#6b7280;">From</td>
                <td style="padding:14px 16px;color:#111827;">${sender}</td>
              </tr>
            </table>
          </div>

          <p style="margin:0;font-size:14px;line-height:1.7;color:#6b7280;">
            This message was generated automatically for testing purposes. No action is required.
          </p>
        </div>

        <div style="padding:18px 28px 28px;color:#9ca3af;font-size:12px;border-top:1px solid #e5e7eb;">
          Sent by Motabhai Enterprise Suite SMTP settings
        </div>
      </div>
    </div>
  `;
}

// POST /api/settings/email/test
export const testEmailConfig = async (req, res) => {
  try {
    const { toEmail } = req.body;
    if (!toEmail) return res.status(400).json({ message: "Test email address required" });

    const [rows] = await pool.query("SELECT * FROM email_config WHERE id = 1");
    if (!rows.length) return res.status(404).json({ message: "Email config not found" });

    const cfg = rows[0];
    if (!cfg.smtp_host || !cfg.smtp_user || !cfg.smtp_password) {
      return res
        .status(400)
        .json({ message: "SMTP configuration is incomplete. Please save settings first." });
    }

    const transporter = nodemailer.createTransport(buildTransportOptions(cfg));
    await transporter.verify();

    await transporter.sendMail({
      from: `"${cfg.from_name}" <${cfg.from_email || cfg.smtp_user}>`,
      to: toEmail,
      subject: "Motabhai Enterprise Suite | SMTP Test Email",
      html: buildProfessionalTestEmail(cfg),
    });

    res.json({ message: `Test email sent successfully to ${toEmail}` });
  } catch (err) {
    console.error("testEmailConfig error:", err);
    let errorMsg = err.message;
    if (err.code === "EAUTH") {
      errorMsg = "Authentication failed. Check username and password.";
      if (err?.options?.auth?.user) {
        errorMsg += ` SMTP login used: ${err.options.auth.user}.`;
      }
    }
    if (err.code === "ECONNECTION") errorMsg = "Cannot connect to SMTP server. Check host and port.";
    if (err.code === "ETIMEDOUT") errorMsg = "Connection timed out. Check host and port.";
    res.status(500).json({ message: "Test failed: " + errorMsg });
  }
};

// Helper: use this in other controllers to send emails
export const sendEmail = async ({ to, subject, html, text }) => {
  const [rows] = await pool.query(
    "SELECT * FROM email_config WHERE id = 1 AND is_active = 1",
  );
  if (!rows.length) throw new Error("Email configuration is not set up or not active");

  const cfg = rows[0];
  const transporter = nodemailer.createTransport(buildTransportOptions(cfg));

  return transporter.sendMail({
    from: `"${cfg.from_name}" <${cfg.from_email || cfg.smtp_user}>`,
    to,
    subject,
    html,
    text,
  });
};
