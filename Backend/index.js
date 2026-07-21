import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import publicRoutes from "./routes/publicRoutes.js";
// import your other routes here...

dotenv.config();

const app = express();
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
const FRONTEND_URLS = process.env.FRONTEND_URLS || "";

function normalizeOrigin(value) {
  return value.trim().replace(/\/+$/, "");
}

function expandOriginVariants(origin) {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return [];

  const variants = new Set([normalized]);

  try {
    const url = new URL(normalized);
    if (url.protocol === "http:") variants.add(`https://${url.host}`);
    if (url.protocol === "https:") variants.add(`http://${url.host}`);
    if (!url.host.startsWith("www.")) {
      variants.add(`${url.protocol}//www.${url.host}`);
    }
  } catch {
    return [normalized];
  }

  return Array.from(variants);
}

const allowedOrigins = new Set(
  [
    FRONTEND_URL,
    ...FRONTEND_URLS.split(","),
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    "http://127.0.0.1:3002",
    "http://app.motabhai.abspldev.com",
    "https://app.motabhai.abspldev.com",
    "http://motabhai.abspldev.com",
    "https://motabhai.abspldev.com",
    "http://www.motabhai.abspldev.com",
    "https://www.motabhai.abspldev.com",
  ]
    .flatMap(expandOriginVariants)
    .filter(Boolean)
);

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Routes ────────────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.send("Backend is running 🚀");
});

// Public routes — NO auth required (for the website frontend)
app.use("/api/public", publicRoutes);

// Add your other authenticated routes here:
// app.use("/api/auth", authRoutes);
// app.use("/api/categories", authMiddleware, categoryRoutes);
// etc.

// ── Start server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
