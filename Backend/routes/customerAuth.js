// routes/customerAuth.js
// Handles: register, login (email/phone+OTP), Google, Facebook, logout, refresh

import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { db } from "../config/db.js";

const router = express.Router();
const SALT_ROUNDS = 10;
const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "30d";
const OTP_EXPIRY_MINUTES = 10;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ok(res, data, msg = "Success") {
  return res.json({ success: true, message: msg, data });
}

function fail(res, msg, status = 400) {
  return res.status(status).json({ success: false, message: msg });
}

function makeAccessToken(customer) {
  return jwt.sign(
    { id: customer.id, email: customer.email, type: "customer" },
    process.env.AUTH_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

function makeRefreshToken(customer) {
  return jwt.sign(
    { id: customer.id, type: "customer_refresh" },
    process.env.AUTH_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function getOtpDeliveryDetails(otp) {
  const isDev = process.env.NODE_ENV === "dev" || process.env.NODE_ENV === "development";

  if (isDev) {
    return {
      sent: true,
      delivery: "dev",
      otp,
      message: "SMS gateway is not configured in development. OTP is returned in the API response.",
    };
  }

  return {
    sent: false,
    delivery: "unconfigured",
    message: "SMS gateway is not configured. Add a provider such as MSG91, Twilio, or AWS SNS.",
  };
}

function safeCustomer(row) {
  const { passwordHash, ...safe } = row;
  return safe;
}

function normalizeEmail(value = "") {
  return String(value).trim().toLowerCase();
}

function normalizePhone(value = "") {
  const digits = String(value).replace(/\D/g, "");
  return digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
}

function isPhoneIdentifier(value = "") {
  return /^\d{10}$/.test(normalizePhone(value));
}

function phoneSqlExpression(columnName = "phone") {
  return `REPLACE(REPLACE(REPLACE(REPLACE(${columnName}, ' ', ''), '-', ''), '(', ''), ')', '')`;
}

async function getOrCreateCustomerByPhone(phone) {
  const [rows] = await db.query(
    `SELECT * FROM website_customers
      WHERE ${phoneSqlExpression("phone")} = ?
        AND COALESCE(isActive, 1) = 1`,
    [normalizePhone(phone)]
  );
  if (rows.length) return rows[0];

  const [result] = await db.query(
    `INSERT INTO website_customers (phone, isPhoneVerified) VALUES (?, 1)`,
    [phone]
  );
  const [newRows] = await db.query(
    "SELECT * FROM website_customers WHERE id = ?",
    [result.insertId]
  );
  return newRows[0];
}

// ─── REGISTER (email + password) ─────────────────────────────────────────────

/**
 * POST /api/customer/auth/register
 * Body: { firstName, lastName, phone, email, password, dob? }
 */
router.post("/register", async (req, res) => {
  try {
    const { firstName, lastName, password, dob } = req.body;
    const phone = normalizePhone(req.body.phone);
    const email = normalizeEmail(req.body.email);

    if (!firstName || !phone || !email || !password) {
      return fail(res, "firstName, phone, email, and password are required");
    }
    if (password.length < 8) {
      return fail(res, "Password must be at least 8 characters");
    }

    // Check duplicates
    const [existing] = await db.query(
      `SELECT id
         FROM website_customers
        WHERE LOWER(TRIM(email)) = ?
           OR ${phoneSqlExpression("phone")} = ?`,
      [email, phone]
    );
    if (existing.length) {
      return fail(res, "An account with this email or phone already exists", 409);
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const [result] = await db.query(
      `INSERT INTO website_customers
         (firstName, lastName, email, phone, passwordHash, dob)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [firstName, lastName, email, phone, passwordHash, dob || null]
    );

    const [[customer]] = await db.query(
      "SELECT * FROM website_customers WHERE id = ?",
      [result.insertId]
    );

    // Issue tokens
    const accessToken = makeAccessToken(customer);
    const refreshToken = makeRefreshToken(customer);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await db.query(
      `INSERT INTO customer_sessions (customerId, refreshToken, ipAddress, expiresAt)
       VALUES (?, ?, ?, ?)`,
      [customer.id, refreshToken, req.ip, expiresAt]
    );

    return ok(res, { customer: safeCustomer(customer), accessToken, refreshToken }, "Account created");
  } catch (e) {
    console.error("[customerAuth/register]", e);
    return fail(res, "Server error", 500);
  }
});

// ─── LOGIN (email + password) ─────────────────────────────────────────────────

/**
 * POST /api/customer/auth/login
 * Body: { email?, phone?, identifier?, password }
 */
router.post("/login", async (req, res) => {
  try {
    const { password } = req.body;
    const rawIdentifier = req.body.identifier || req.body.email || req.body.phone;
    const identifier = String(rawIdentifier || "").trim();

    if (!identifier || !password) {
      return fail(res, "Email or phone and password are required");
    }

    const lookupByPhone = isPhoneIdentifier(identifier);
    const normalizedIdentifier = lookupByPhone
      ? normalizePhone(identifier)
      : normalizeEmail(identifier);

    const customerQuery = lookupByPhone
      ? `SELECT * FROM website_customers
          WHERE ${phoneSqlExpression("phone")} = ?
            AND COALESCE(isActive, 1) = 1
          LIMIT 1`
      : `SELECT * FROM website_customers
          WHERE LOWER(TRIM(email)) = ?
            AND COALESCE(isActive, 1) = 1
          LIMIT 1`;

    const [[customer]] = await db.query(customerQuery, [normalizedIdentifier]);
    if (!customer) {
      const inactiveQuery = lookupByPhone
        ? `SELECT id, isActive FROM website_customers
            WHERE ${phoneSqlExpression("phone")} = ?
            LIMIT 1`
        : `SELECT id, isActive FROM website_customers
            WHERE LOWER(TRIM(email)) = ?
            LIMIT 1`;

      const [[inactiveCustomer]] = await db.query(inactiveQuery, [normalizedIdentifier]);
      if (inactiveCustomer && Number(inactiveCustomer.isActive) === 0) {
        return fail(res, "Your account is inactive. Please contact support.", 401);
      }
      return fail(res, "Invalid email, phone, or password", 401);
    }
    if (!customer.passwordHash) return fail(res, "Please login with your social account or use OTP", 401);

    const valid = await bcrypt.compare(password, customer.passwordHash);
    if (!valid) return fail(res, "Invalid email, phone, or password", 401);

    const accessToken = makeAccessToken(customer);
    const refreshToken = makeRefreshToken(customer);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await db.query(
      `INSERT INTO customer_sessions (customerId, refreshToken, ipAddress, expiresAt)
       VALUES (?, ?, ?, ?)`,
      [customer.id, refreshToken, req.ip, expiresAt]
    );

    return ok(res, { customer: safeCustomer(customer), accessToken, refreshToken });
  } catch (e) {
    console.error("[customerAuth/login]", e);
    return fail(res, "Server error", 500);
  }
});

// ─── SEND OTP ─────────────────────────────────────────────────────────────────

/**
 * POST /api/customer/auth/send-otp
 * Body: { phone, purpose: 'login' | 'register' | 'forgot_password' }
 */
router.post("/send-otp", async (req, res) => {
  try {
    const purpose = req.body.purpose || "login";
    const phone = normalizePhone(req.body.phone);
    if (!phone) return fail(res, "Phone number is required");

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    // Invalidate previous unused OTPs for this phone
    await db.query(
      "UPDATE customer_otps SET isUsed = 1 WHERE phone = ? AND purpose = ? AND isUsed = 0",
      [phone, purpose]
    );

    await db.query(
      "INSERT INTO customer_otps (phone, otp, purpose, expiresAt) VALUES (?, ?, ?, ?)",
      [phone, otp, purpose, expiresAt]
    );

    console.log(`[OTP] ${phone} → ${otp} (${purpose})`);
    const delivery = getOtpDeliveryDetails(otp);
    if (!delivery.sent) {
      return fail(res, delivery.message, 503);
    }

    return ok(res, delivery, "OTP generated successfully");
  } catch (e) {
    console.error("[customerAuth/send-otp]", e);
    return fail(res, "Server error", 500);
  }
});

// ─── VERIFY OTP ───────────────────────────────────────────────────────────────

/**
 * POST /api/customer/auth/verify-otp
 * Body: { phone, otp, purpose, firstName?, lastName? }
 */
router.post("/verify-otp", async (req, res) => {
  try {
    const { otp, purpose = "login", firstName, lastName } = req.body;
    const phone = normalizePhone(req.body.phone);
    if (!phone || !otp) return fail(res, "Phone and OTP are required");

    const [[record]] = await db.query(
      `SELECT * FROM customer_otps
       WHERE phone = ? AND otp = ? AND purpose = ? AND isUsed = 0
         AND expiresAt > NOW()
       ORDER BY createdAt DESC LIMIT 1`,
      [phone, otp, purpose]
    );

    if (!record) return fail(res, "Invalid or expired OTP", 401);

    // Mark OTP used
    await db.query("UPDATE customer_otps SET isUsed = 1 WHERE id = ?", [record.id]);

    // Get or create customer
    let customer;
    if (purpose === "register" && firstName) {
      // Registration flow — ensure account doesn't already exist
      const [[existingByPhone]] = await db.query(
        `SELECT * FROM website_customers WHERE ${phoneSqlExpression("phone")} = ?`,
        [phone]
      );
      if (existingByPhone) {
        customer = existingByPhone;
      } else {
        const [result] = await db.query(
          `INSERT INTO website_customers (firstName, lastName, phone, isPhoneVerified)
           VALUES (?, ?, ?, 1)`,
          [firstName, lastName || "", phone]
        );
        [[customer]] = await db.query(
          "SELECT * FROM website_customers WHERE id = ?",
          [result.insertId]
        );
      }
    } else {
      customer = await getOrCreateCustomerByPhone(phone);
    }

    // Mark phone verified
    await db.query(
      "UPDATE website_customers SET isPhoneVerified = 1 WHERE id = ?",
      [customer.id]
    );

    const accessToken = makeAccessToken(customer);
    const refreshToken = makeRefreshToken(customer);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await db.query(
      `INSERT INTO customer_sessions (customerId, refreshToken, ipAddress, expiresAt)
       VALUES (?, ?, ?, ?)`,
      [customer.id, refreshToken, req.ip, expiresAt]
    );

    return ok(res, { customer: safeCustomer(customer), accessToken, refreshToken });
  } catch (e) {
    console.error("[customerAuth/verify-otp]", e);
    return fail(res, "Server error", 500);
  }
});

// ─── SOCIAL LOGIN (Google / Facebook) ────────────────────────────────────────

/**
 * POST /api/customer/auth/social
 * Body: { provider: 'google'|'facebook', providerUid, email?, firstName?, lastName?,
 *         avatarUrl?, accessToken?, tokenExpiry?, profileData? }
 *
 * The frontend must validate the token with the OAuth provider and
 * send us the verified providerUid. Never trust the uid without verification in production.
 */
router.post("/social", async (req, res) => {
  try {
    const {
      provider,
      providerUid,
      email,
      firstName = "",
      lastName = "",
      avatarUrl,
      accessToken: socialAccessToken,
      tokenExpiry,
      profileData,
    } = req.body;

    if (!provider || !providerUid) {
      return fail(res, "provider and providerUid are required");
    }
    if (!["google", "facebook", "apple"].includes(provider)) {
      return fail(res, "Unsupported provider");
    }

    // 1. Check if this social account is already linked
    const [[social]] = await db.query(
      "SELECT * FROM customer_social_accounts WHERE provider = ? AND providerUid = ?",
      [provider, providerUid]
    );

    let customer;

    if (social) {
      // Existing social link → load customer
      const [[existingCustomer]] = await db.query(
        "SELECT * FROM website_customers WHERE id = ? AND isActive = 1",
        [social.customerId]
      );
      if (!existingCustomer) return fail(res, "Account deactivated", 403);
      customer = existingCustomer;

      // Update social tokens
      await db.query(
        `UPDATE customer_social_accounts
         SET accessToken = ?, tokenExpiry = ?, profileData = ?, updatedAt = NOW()
         WHERE id = ?`,
        [
          socialAccessToken || null,
          tokenExpiry ? new Date(tokenExpiry) : null,
          profileData ? JSON.stringify(profileData) : null,
          social.id,
        ]
      );
    } else {
      // New social login — find or create customer by email
      let existingCustomer = null;

      if (email) {
        const [[byEmail]] = await db.query(
          "SELECT * FROM website_customers WHERE email = ? AND isActive = 1",
          [email]
        );
        existingCustomer = byEmail || null;
      }

      if (!existingCustomer) {
        // Create new customer
        const [result] = await db.query(
          `INSERT INTO website_customers
             (firstName, lastName, email, avatarUrl, isEmailVerified)
           VALUES (?, ?, ?, ?, ?)`,
          [
            firstName,
            lastName,
            email || null,
            avatarUrl || null,
            email ? 1 : 0,
          ]
        );
        [[existingCustomer]] = await db.query(
          "SELECT * FROM website_customers WHERE id = ?",
          [result.insertId]
        );
      } else if (avatarUrl && !existingCustomer.avatarUrl) {
        await db.query(
          "UPDATE website_customers SET avatarUrl = ? WHERE id = ?",
          [avatarUrl, existingCustomer.id]
        );
        existingCustomer.avatarUrl = avatarUrl;
      }

      customer = existingCustomer;

      // Link social account
      await db.query(
        `INSERT INTO customer_social_accounts
           (customerId, provider, providerUid, accessToken, tokenExpiry, profileData)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          customer.id,
          provider,
          providerUid,
          socialAccessToken || null,
          tokenExpiry ? new Date(tokenExpiry) : null,
          profileData ? JSON.stringify(profileData) : null,
        ]
      );
    }

    const accessToken = makeAccessToken(customer);
    const refreshToken = makeRefreshToken(customer);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await db.query(
      `INSERT INTO customer_sessions (customerId, refreshToken, ipAddress, expiresAt)
       VALUES (?, ?, ?, ?)`,
      [customer.id, refreshToken, req.ip, expiresAt]
    );

    return ok(res, { customer: safeCustomer(customer), accessToken, refreshToken });
  } catch (e) {
    console.error("[customerAuth/social]", e);
    return fail(res, "Server error", 500);
  }
});

// ─── REFRESH TOKEN ────────────────────────────────────────────────────────────

/**
 * POST /api/customer/auth/refresh
 * Body: { refreshToken }
 */
router.post("/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return fail(res, "Refresh token required", 401);

    let payload;
    try {
      payload = jwt.verify(refreshToken, process.env.AUTH_SECRET);
    } catch {
      return fail(res, "Invalid or expired refresh token", 401);
    }

    if (payload.type !== "customer_refresh") {
      return fail(res, "Invalid token type", 401);
    }

    const [[session]] = await db.query(
      `SELECT * FROM customer_sessions
       WHERE refreshToken = ? AND isRevoked = 0 AND expiresAt > NOW()`,
      [refreshToken]
    );
    if (!session) return fail(res, "Session expired or revoked", 401);

    const [[customer]] = await db.query(
      "SELECT * FROM website_customers WHERE id = ? AND isActive = 1",
      [payload.id]
    );
    if (!customer) return fail(res, "Account not found", 401);

    const newAccessToken = makeAccessToken(customer);
    return ok(res, { accessToken: newAccessToken });
  } catch (e) {
    console.error("[customerAuth/refresh]", e);
    return fail(res, "Server error", 500);
  }
});

// ─── LOGOUT ───────────────────────────────────────────────────────────────────

/**
 * POST /api/customer/auth/logout
 * Body: { refreshToken }
 */
router.post("/logout", async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await db.query(
        "UPDATE customer_sessions SET isRevoked = 1 WHERE refreshToken = ?",
        [refreshToken]
      );
    }
    return ok(res, null, "Logged out");
  } catch (e) {
    console.error("[customerAuth/logout]", e);
    return fail(res, "Server error", 500);
  }
});
// ─── FORGOT PASSWORD: send OTP via phone ──────────────────────────────────────
/**
 * POST /api/customer/auth/forgot-password/send-otp
 * Body: { phone }
 * Verifies the phone exists in website_customers, then sends a forgot_password OTP
 */
router.post("/forgot-password/send-otp", async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);
    if (!phone) return fail(res, "Phone number is required");

    const [[customer]] = await db.query(
      `SELECT id
         FROM website_customers
        WHERE ${phoneSqlExpression("phone")} = ?
          AND COALESCE(isActive, 1) = 1`,
      [phone]
    );
    if (!customer) return fail(res, "No account found with this mobile number", 404);

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    await db.query(
      "UPDATE customer_otps SET isUsed = 1 WHERE phone = ? AND purpose = 'forgot_password' AND isUsed = 0",
      [phone]
    );
    await db.query(
      "INSERT INTO customer_otps (phone, otp, purpose, expiresAt) VALUES (?, ?, 'forgot_password', ?)",
      [phone, otp, expiresAt]
    );

    console.log(`[ForgotPwd OTP] ${phone} → ${otp}`);
    const delivery = getOtpDeliveryDetails(otp);
    if (!delivery.sent) {
      return fail(res, delivery.message, 503);
    }

    return ok(res, delivery, "OTP generated successfully");
  } catch (e) {
    console.error("[customerAuth/forgot-password/send-otp]", e);
    return fail(res, "Server error", 500);
  }
});

// ─── FORGOT PASSWORD: send reset link via email ───────────────────────────────
/**
 * POST /api/customer/auth/forgot-password/send-email
 * Body: { email }
 * Sends a password reset link to the customer's email
 */
router.post("/forgot-password/send-email", async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    if (!email) return fail(res, "Email is required");

    const [[customer]] = await db.query(
      `SELECT id, firstName
         FROM website_customers
        WHERE LOWER(TRIM(email)) = ?
          AND COALESCE(isActive, 1) = 1`,
      [email]
    );
    if (!customer) return fail(res, "No account found with this email", 404);

    const crypto = await import("crypto");
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Invalidate old tokens for this customer
    await db.query(
      "UPDATE password_reset_tokens SET isUsed = 1 WHERE customerId = ? AND isUsed = 0",
      [customer.id]
    );
    await db.query(
      "INSERT INTO password_reset_tokens (customerId, token, expiresAt) VALUES (?, ?, ?)",
      [customer.id, token, expiresAt]
    );

    const resetUrl = `${process.env.WEBSITE_URL || "http://localhost:3000"}/reset-password?token=${token}`;
    console.log(`[ForgotPwd Email] ${email} → ${resetUrl}`);

    // TODO: Integrate your email provider (nodemailer / SendGrid / AWS SES) here
    // Example: await sendEmail({ to: email, subject: "Reset your AppleNext password", html: `...` });

    const isDev = process.env.NODE_ENV === "dev" || process.env.NODE_ENV === "development";
    return ok(res, { sent: true, ...(isDev ? { resetUrl } : {}) }, "Reset link sent to your email");
  } catch (e) {
    console.error("[customerAuth/forgot-password/send-email]", e);
    return fail(res, "Server error", 500);
  }
});

// ─── RESET PASSWORD (after OTP or email token) ────────────────────────────────
/**
 * POST /api/customer/auth/reset-password
 * Body via OTP:   { phone, otp, newPassword }
 * Body via token: { token, newPassword }
 */
router.post("/reset-password", async (req, res) => {
  try {
    const { otp, token, newPassword } = req.body;
    const phone = normalizePhone(req.body.phone);

    if (!newPassword || newPassword.length < 8) {
      return fail(res, "Password must be at least 8 characters");
    }

    let customerId;

    if (phone && otp) {
      // ── OTP path ──
      const [[record]] = await db.query(
        `SELECT * FROM customer_otps
         WHERE phone = ? AND otp = ? AND purpose = 'forgot_password'
           AND isUsed = 0 AND expiresAt > NOW()
         ORDER BY createdAt DESC LIMIT 1`,
        [phone, otp]
      );
      if (!record) return fail(res, "Invalid or expired OTP", 401);

      await db.query("UPDATE customer_otps SET isUsed = 1 WHERE id = ?", [record.id]);

      const [[cust]] = await db.query(
        `SELECT id
           FROM website_customers
          WHERE ${phoneSqlExpression("phone")} = ?
            AND COALESCE(isActive, 1) = 1`,
        [phone]
      );
      if (!cust) return fail(res, "Account not found", 404);
      customerId = cust.id;

    } else if (token) {
      // ── Email token path ──
      const [[record]] = await db.query(
        "SELECT * FROM password_reset_tokens WHERE token = ? AND isUsed = 0 AND expiresAt > NOW()",
        [token]
      );
      if (!record) return fail(res, "Invalid or expired reset link", 401);

      await db.query("UPDATE password_reset_tokens SET isUsed = 1 WHERE id = ?", [record.id]);
      customerId = record.customerId;

    } else {
      return fail(res, "OTP or reset token is required");
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await db.query(
      "UPDATE website_customers SET passwordHash = ? WHERE id = ?",
      [passwordHash, customerId]
    );

    // Revoke all sessions so other devices get logged out
    await db.query(
      "UPDATE customer_sessions SET isRevoked = 1 WHERE customerId = ?",
      [customerId]
    );

    return ok(res, null, "Password reset successfully. Please login with your new password.");
  } catch (e) {
    console.error("[customerAuth/reset-password]", e);
    return fail(res, "Server error", 500);
  }
});

export default router;
