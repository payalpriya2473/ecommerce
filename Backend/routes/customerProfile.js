// routes/customerProfile.js
// Profile management + delivery addresses for logged-in customers

import express from "express";
import bcrypt from "bcrypt";
import { db } from "../config/db.js";
import { requireCustomer } from "../middleware/customerAuth.js";

const router = express.Router();
router.use(requireCustomer);

function ok(res, data, msg = "Success") {
  return res.json({ success: true, message: msg, data });
}
function fail(res, msg, status = 400) {
  return res.status(status).json({ success: false, message: msg });
}

// ─── GET profile ──────────────────────────────────────────────────────────────

router.get("/", async (req, res) => {
  try {
    const [[customer]] = await db.query(
      `SELECT id, companyId, firstName, lastName, email, phone, dob, gender,
              avatarUrl, isEmailVerified, isPhoneVerified, mbPoints, createdAt, updatedAt
       FROM website_customers WHERE id = ? AND isActive = 1`,
      [req.customer.id]
    );
    if (!customer) return fail(res, "Customer not found", 404);
    return ok(res, customer);
  } catch (e) {
    console.error("[profile/GET]", e);
    return fail(res, "Server error", 500);
  }
});

// ─── UPDATE profile ───────────────────────────────────────────────────────────

router.patch("/", async (req, res) => {
  try {
    const { firstName, lastName, dob, gender } = req.body;
    const id = req.customer.id;

    await db.query(
      `UPDATE website_customers
       SET firstName = COALESCE(?, firstName),
           lastName  = COALESCE(?, lastName),
           dob       = COALESCE(?, dob),
           gender    = COALESCE(?, gender),
           updatedAt = NOW()
       WHERE id = ?`,
      [firstName || null, lastName || null, dob || null, gender || null, id]
    );

    const [[updated]] = await db.query(
      `SELECT id, firstName, lastName, email, phone, dob, gender, avatarUrl,
              isEmailVerified, isPhoneVerified, mbPoints, createdAt, updatedAt
       FROM website_customers WHERE id = ?`,
      [id]
    );

    return ok(res, updated, "Profile updated");
  } catch (e) {
    console.error("[profile/PATCH]", e);
    return fail(res, "Server error", 500);
  }
});

// ─── CHANGE PASSWORD ──────────────────────────────────────────────────────────

router.post("/change-password", async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return fail(res, "currentPassword and newPassword are required");
    }
    if (newPassword.length < 8) return fail(res, "Password must be at least 8 characters");

    const [[customer]] = await db.query(
      "SELECT passwordHash FROM website_customers WHERE id = ?",
      [req.customer.id]
    );

    if (!customer.passwordHash) {
      return fail(res, "This account uses social login. Please set a password via Forgot Password.");
    }

    const valid = await bcrypt.compare(currentPassword, customer.passwordHash);
    if (!valid) return fail(res, "Current password is incorrect", 401);

    const hash = await bcrypt.hash(newPassword, 10);
    await db.query(
      "UPDATE website_customers SET passwordHash = ?, updatedAt = NOW() WHERE id = ?",
      [hash, req.customer.id]
    );

    return ok(res, null, "Password changed successfully");
  } catch (e) {
    console.error("[profile/change-password]", e);
    return fail(res, "Server error", 500);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// ADDRESSES
// ════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/customer/profile/addresses
 */
router.get("/addresses", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM customer_addresses WHERE customerId = ? ORDER BY isDefault DESC, createdAt ASC",
      [req.customer.id]
    );
    return ok(res, rows);
  } catch (e) {
    console.error("[addresses/GET]", e);
    return fail(res, "Server error", 500);
  }
});

/**
 * POST /api/customer/profile/addresses
 * Body: { type, name, phone, line1, line2?, city?, state?, pinCode?, isDefault? }
 */
router.post("/addresses", async (req, res) => {
  try {
    const { type = "home", name, phone, line1, line2, city, state, pinCode, isDefault = false } = req.body;
    const customerId = req.customer.id;

    if (!name || !phone || !line1) {
      return fail(res, "name, phone, and line1 are required");
    }

    // If new address is default, unset others
    if (isDefault) {
      await db.query(
        "UPDATE customer_addresses SET isDefault = 0 WHERE customerId = ?",
        [customerId]
      );
    }

    const [result] = await db.query(
      `INSERT INTO customer_addresses
         (customerId, type, name, phone, line1, line2, city, state, pinCode, isDefault)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [customerId, type, name, phone, line1, line2 || null, city || null, state || null, pinCode || null, isDefault ? 1 : 0]
    );

    const [[address]] = await db.query(
      "SELECT * FROM customer_addresses WHERE id = ?",
      [result.insertId]
    );

    return ok(res, address, "Address added");
  } catch (e) {
    console.error("[addresses/POST]", e);
    return fail(res, "Server error", 500);
  }
});

/**
 * PATCH /api/customer/profile/addresses/:id
 */
router.patch("/addresses/:id", async (req, res) => {
  try {
    const customerId = req.customer.id;
    const { id } = req.params;
    const { type, name, phone, line1, line2, city, state, pinCode, isDefault } = req.body;

    // Ensure address belongs to this customer
    const [[existing]] = await db.query(
      "SELECT id FROM customer_addresses WHERE id = ? AND customerId = ?",
      [id, customerId]
    );
    if (!existing) return fail(res, "Address not found", 404);

    if (isDefault) {
      await db.query(
        "UPDATE customer_addresses SET isDefault = 0 WHERE customerId = ?",
        [customerId]
      );
    }

    await db.query(
      `UPDATE customer_addresses
       SET type      = COALESCE(?, type),
           name      = COALESCE(?, name),
           phone     = COALESCE(?, phone),
           line1     = COALESCE(?, line1),
           line2     = COALESCE(?, line2),
           city      = COALESCE(?, city),
           state     = COALESCE(?, state),
           pinCode   = COALESCE(?, pinCode),
           isDefault = COALESCE(?, isDefault),
           updatedAt = NOW()
       WHERE id = ? AND customerId = ?`,
      [
        type || null, name || null, phone || null, line1 || null,
        line2 !== undefined ? line2 : null,
        city || null, state || null, pinCode || null,
        isDefault !== undefined ? (isDefault ? 1 : 0) : null,
        id, customerId,
      ]
    );

    const [[updated]] = await db.query(
      "SELECT * FROM customer_addresses WHERE id = ?",
      [id]
    );

    return ok(res, updated, "Address updated");
  } catch (e) {
    console.error("[addresses/PATCH]", e);
    return fail(res, "Server error", 500);
  }
});

/**
 * DELETE /api/customer/profile/addresses/:id
 */
router.delete("/addresses/:id", async (req, res) => {
  try {
    const customerId = req.customer.id;
    const { id } = req.params;

    const [[existing]] = await db.query(
      "SELECT isDefault FROM customer_addresses WHERE id = ? AND customerId = ?",
      [id, customerId]
    );
    if (!existing) return fail(res, "Address not found", 404);
    if (existing.isDefault) return fail(res, "Cannot delete default address", 400);

    await db.query(
      "DELETE FROM customer_addresses WHERE id = ? AND customerId = ?",
      [id, customerId]
    );

    return ok(res, { id }, "Address removed");
  } catch (e) {
    console.error("[addresses/DELETE]", e);
    return fail(res, "Server error", 500);
  }
});

/**
 * POST /api/customer/profile/addresses/:id/set-default
 */
router.post("/addresses/:id/set-default", async (req, res) => {
  try {
    const customerId = req.customer.id;
    const { id } = req.params;

    await db.query(
      "UPDATE customer_addresses SET isDefault = 0 WHERE customerId = ?",
      [customerId]
    );
    const [result] = await db.query(
      "UPDATE customer_addresses SET isDefault = 1 WHERE id = ? AND customerId = ?",
      [id, customerId]
    );

    if (result.affectedRows === 0) return fail(res, "Address not found", 404);
    return ok(res, { id }, "Default address updated");
  } catch (e) {
    console.error("[addresses/set-default]", e);
    return fail(res, "Server error", 500);
  }
});

export default router;