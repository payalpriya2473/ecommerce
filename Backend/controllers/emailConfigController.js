import pool from "../config/db.js";
import nodemailer from "nodemailer";

function normalizeEmail(value = "") {
  return String(value).trim().toLowerCase();
}

function isValidEmail(value) {
  // This deliberately stays small: it prevents malformed addresses and header
  // injection without rejecting valid, less-common email addresses.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
}

function normalizeSmtpSecurity({ smtp_port, smtp_secure }) {
  const port = Number(smtp_port);
  const security = String(smtp_secure || "").toLowerCase();

  // 465 is implicit TLS; 587 is STARTTLS.  In particular, never allow an old
  // "none" setting to silently make a Gmail/587 connection insecure.
  if (port === 465) return "ssl";
  if (port === 587) return "tls";
  return ["none", "tls", "ssl"].includes(security) ? security : "tls";
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
  const security = normalizeSmtpSecurity(cfg);

  return {
    host: cfg.smtp_host,
    port: Number(cfg.smtp_port),
    secure: security === "ssl",
    requireTLS: security === "tls",
    // Fail fast instead of hanging for minutes when the SMTP server is unreachable.
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
    auth: {
      user: authUser,
      pass: cfg.smtp_password,
    },
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
      // Show the effective setting, including a safe correction for legacy
      // configurations that stored `none` with port 587.
      smtpSecure: normalizeSmtpSecurity(r),
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

    const hostToSave = String(smtpHost || "").trim();
    const suppliedPort = String(smtpPort ?? "").trim();
    const portToSave = suppliedPort ? Number(suppliedPort) : 587;
    const userToSave = String(smtpUser || "").trim() || String(fromEmail || "").trim();
    const fromEmailToSave = String(fromEmail || "").trim();

    if (!hostToSave || !userToSave) {
      return res.status(400).json({ message: "SMTP host and username are required." });
    }
    if (!Number.isInteger(portToSave) || portToSave < 1 || portToSave > 65535) {
      return res.status(400).json({ message: "SMTP port must be between 1 and 65535." });
    }
    if (!isValidEmail(userToSave)) {
      return res.status(400).json({ message: "Enter a valid SMTP username/email address." });
    }
    if (fromEmailToSave && !isValidEmail(fromEmailToSave)) {
      return res.status(400).json({ message: "Enter a valid From Email address." });
    }

    let passwordToSave = smtpPassword;
    if (!smtpPassword || smtpPassword === "••••••••") {
      const [existing] = await pool.query("SELECT smtp_password FROM email_config WHERE id = 1");
      passwordToSave = existing[0]?.smtp_password || "";
    }

    const securityToSave = normalizeSmtpSecurity({
      smtp_port: portToSave,
      smtp_secure: smtpSecure,
    });

    // The row may be missing (fresh or truncated DB): an UPDATE alone would
    // silently save nothing and every email would fail.
    await pool.query("INSERT IGNORE INTO email_config (id) VALUES (1)");
    await pool.query(
      `UPDATE email_config SET
        smtp_host = ?, smtp_port = ?, smtp_secure = ?,
        smtp_user = ?, smtp_password = ?,
        from_name = ?, from_email = ?, is_active = ?
      WHERE id = 1`,
      [
        hostToSave,
        portToSave,
        securityToSave,
        userToSave,
        passwordToSave,
        fromName || "AppleNext Enterprise Suite",
        fromEmailToSave,
        isActive ? 1 : 0,
      ],
    );

    res.json({
      message:
        portToSave === 587 && String(smtpSecure).toLowerCase() !== "tls"
          ? "Email configuration saved. TLS was enabled automatically for port 587."
          : "Email configuration saved successfully",
      smtpSecure: securityToSave,
    });
  } catch (err) {
    console.error("saveEmailConfig error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

function buildProfessionalTestEmail(cfg) {
  const security = normalizeSmtpSecurity(cfg).toUpperCase();
  const sender = `${cfg.from_name} <${cfg.from_email || cfg.smtp_user}>`;
  const server = `${cfg.smtp_host}:${cfg.smtp_port}`;

  return `
    <div style="margin:0;background:#f6f7fb;padding:32px 16px;font-family:Arial,sans-serif;color:#1f2937;">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(15,23,42,.08);">
        <div style="background:linear-gradient(135deg,#e11d48,#dc2626);padding:24px 28px;color:#fff;">
          <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;opacity:.9;">AppleNext Enterprise Suite</div>
          <div style="font-size:28px;font-weight:700;line-height:1.2;margin-top:8px;">SMTP Test Email</div>
          <div style="font-size:14px;opacity:.95;margin-top:8px;">Your outgoing mail configuration has been verified successfully.</div>
        </div>

        <div style="padding:28px;">
          <p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:#111827;">Hello,</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.7;color:#374151;">
            This is a professional test message from the AppleNext Enterprise Suite email system. If you are receiving this email, your SMTP settings are working correctly.
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
          Sent by AppleNext Enterprise Suite SMTP settings
        </div>
      </div>
    </div>
  `;
}

// POST /api/settings/email/test
export const testEmailConfig = async (req, res) => {
  try {
    const toEmail = String(req.body.toEmail || "").trim();
    if (!isValidEmail(toEmail)) {
      return res.status(400).json({ message: "Enter a valid test email address." });
    }

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

    const info = await transporter.sendMail({
      from: `"${cfg.from_name}" <${cfg.from_email || cfg.smtp_user}>`,
      to: toEmail,
      subject: "AppleNext Enterprise Suite | SMTP Test Email",
      html: buildProfessionalTestEmail(cfg),
    });

    if (!info.accepted?.length || info.rejected?.length) {
      return res.status(502).json({
        message: `The SMTP server did not accept delivery to ${toEmail}. ${
          info.response || "Check the recipient address and SMTP account."
        }`,
      });
    }

    // SMTP acceptance means the provider has queued the message; it does not
    // guarantee Inbox placement, which Gmail's spam filters decide later.
    res.json({
      message: `SMTP accepted the test email for delivery to ${toEmail}. Check Inbox and Spam.`,
      messageId: info.messageId,
    });
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
/**
 * Current SMTP settings + a list of problems that would stop mail going out.
 * Used by sendEmail and by the admin "email health" check.
 */
export async function getEmailConfigStatus() {
  const [rows] = await pool.query("SELECT * FROM email_config WHERE id = 1");
  const cfg = rows[0] || null;
  const problems = [];
  if (!cfg) problems.push("No SMTP settings saved. Open Settings → Email Config and save them.");
  else {
    if (!cfg.smtp_host) problems.push("SMTP host is empty.");
    if (!cfg.smtp_port) problems.push("SMTP port is empty.");
    if (!cfg.smtp_user && !cfg.from_email) problems.push("SMTP username is empty.");
    if (!cfg.smtp_password) problems.push("SMTP password is empty.");
    if (Number(cfg.is_active) !== 1) problems.push('Email sending is switched off — tick "Active" in Settings → Email Config.');
  }
  return { cfg, problems };
}

/** Verify the SMTP login without sending anything. */
export async function verifySmtp() {
  const { cfg, problems } = await getEmailConfigStatus();
  if (problems.length) return { ok: false, problems };
  try {
    await nodemailer.createTransport(buildTransportOptions(cfg)).verify();
    return { ok: true, problems: [], server: `${cfg.smtp_host}:${cfg.smtp_port}`, from: cfg.from_email || cfg.smtp_user };
  } catch (err) {
    let message = err.message;
    if (err.code === "EAUTH") message = `SMTP login failed (${err.response || err.message}). For Gmail use an App Password, not the normal password.`;
    if (err.code === "ECONNECTION" || err.code === "ETIMEDOUT" || err.code === "ESOCKET")
      message = `Cannot reach ${cfg.smtp_host}:${cfg.smtp_port} (${err.message}). Check host/port and that the server allows outgoing SMTP.`;
    return { ok: false, problems: [message] };
  }
}

export const sendEmail = async ({ to, subject, html, text, attachments, replyTo }) => {
  const { cfg, problems } = await getEmailConfigStatus();
  if (problems.length) throw new Error(problems.join(" "));
  const transporter = nodemailer.createTransport(buildTransportOptions(cfg));

  return transporter.sendMail({
    from: `"${cfg.from_name}" <${cfg.from_email || cfg.smtp_user}>`,
    to,
    subject,
    html,
    text,
    ...(attachments?.length ? { attachments } : {}),
    ...(replyTo ? { replyTo } : {}),
  });
};
