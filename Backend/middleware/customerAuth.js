// middleware/customerAuth.js
// Verifies the customer JWT access token for protected routes

import jwt from "jsonwebtoken";

export function requireCustomer(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, message: "Authentication required" });
  }

  try {
    const payload = jwt.verify(token, process.env.AUTH_SECRET);

    if (payload.type !== "customer") {
      return res.status(401).json({ success: false, message: "Invalid token type" });
    }

    req.customer = payload; // { id, email, type }
    next();
  } catch {
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
}