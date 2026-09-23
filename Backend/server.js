import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.js";
import companyRoutes from "./routes/company.js";
import branchRoutes from "./routes/branch.js";
import departmentRoutes from './routes/departmentRoutes.js';
import designationRoutes from "./routes/designationRoutes.js";
import employeeRoutes from "./routes/employeeRoutes.js";
import rbacRoutes from './routes/rbacRoutes.js';
import supplierRoutes from './routes/supplierRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import brandRoutes from './routes/brandRoutes.js';
import itemGroupRoutes from './routes/itemgroupRoutes.js';
import itemRoutes from './routes/itemRoute.js';
import purchaseOrderRoutes from './routes/purchaseorderRoutes.js';
import technicianRoutes from './routes/technicianRoutes.js';
import purchaseInvoiceRoutes from './routes/purchaseinvoicesRoutes.js';
import invoiceSettingsRoutes from './routes/invoiceSettingsRoutes.js';
import incentiveRoutes from './routes/incentiveRoutes.js'; 
// Temporarily disabled: Colour Master API routes.
// import colorRoutes from './routes/colorRoutes.js';
import offerRoutes from './routes/offerRoutes.js';
// Temporarily disabled: Finance Companies API routes.
// import financeCompanyRoutes from './routes/financeCompanyRoutes.js';
import salesInvoiceRoutes from './routes/salesInvoiceRoutes.js';
import publicRoutes from "./routes/publicRoutes.js";
import customerAuthRouter    from "./routes/customerAuth.js";
import customerWishlistRouter from "./routes/customerWishlist.js";
import customerCartRouter    from "./routes/customerCart.js";
import customerProfileRouter from "./routes/customerProfile.js";
import customerOrdersRouter  from "./routes/customerOrders.js";
import contactRouter         from "./routes/contactRoutes.js";
import customerPaymentsRouter from "./routes/customerPayments.js";
import razorpayWebhookRouter from "./routes/razorpayWebhook.js";
import emailConfigRoutes from './routes/emailConfigRoutes.js';
import { checkDbConnection, dbStatus } from './config/db.js';


dotenv.config();

const BACKEND_DIR = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const router = express.Router();
const DEFAULT_PORT = 5000;
const PORT = Number(process.env.PORT) || DEFAULT_PORT;
const NODE_ENV = process.env.NODE_ENV || "development";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

function normalizeOrigin(value) {
  return value.trim().replace(/\/+$/, "");
}

function expandOriginVariants(origin) {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return [];

  const variants = new Set([normalized]);

  try {
    const url = new URL(normalized);
    if (url.protocol === "http:") {
      variants.add(`https://${url.host}`);
    }
    if (url.protocol === "https:") {
      variants.add(`http://${url.host}`);
    }
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
    "http://localhost:3000",
    "http://localhost:3001",
    "https://shop.applenext.in/"
  ]
    .flatMap(expandOriginVariants)
    .filter(Boolean)
);

// Middleware
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Payment webhooks are signature-checked against the exact bytes we received,
// so they must be mounted BEFORE the JSON body parser.
app.use("/api/webhooks", express.raw({ type: "*/*" }), razorpayWebhookRouter);
app.use("/motabhai_next_backend/api/webhooks", express.raw({ type: "*/*" }), razorpayWebhookRouter);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware (development only)
if (NODE_ENV === 'dev' || NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });
}

// Define routes on the router instead of app
router.get("/", (req, res) => {
  res.json({
    message: "AppleNext Backend API 🚀",
    status: "running",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    endpoints: {
      auth: "/api/auth",
      companies: "/api/companies",
      employees: "/api/employees",
      branches: "/api/branches",
      suppliers: "/api/suppliers",
      departments: "/api/departments",
      designations: "/api/designations",
      rbac: "/api/rbac",
      categories: "/api/categories",
      brands: "/api/brands",
      itemGroups: "/api/item-groups",
      items: "/api/items",
      purchaseOrders: "/api/purchase-orders",
      technicians: "/api/technicians",
      purchaseInvoices: "/api/purchase-invoices",
      incentiveLogs: "/api/incentive-logs",
      // Temporarily disabled: Colour Master API endpoint.
      // colors: "/api/colors",
    }
  });
});

/**
 * GET /api/health
 * Quick diagnosis endpoint — tells you whether the API process is alive and
 * whether it can actually reach MySQL. If every route is returning 500, open
 * this first: it names the real error instead of a generic "Server error".
 */
router.get("/api/health", async (req, res) => {
  await checkDbConnection({ quiet: true });

  const healthy = dbStatus.connected;
  return res.status(healthy ? 200 : 503).json({
    success: healthy,
    message: healthy
      ? "API and database are up"
      : "API is up but the database is unreachable — every data route will fail until this is fixed",
    data: {
      server: "up",
      uptimeSeconds: Math.round(process.uptime()),
      environment: NODE_ENV,
      port: PORT,
      database: {
        connected: dbStatus.connected,
        name: dbStatus.database,
        host: dbStatus.host,
        user: dbStatus.user,
        lastError: dbStatus.lastError,
        lastCheckedAt: dbStatus.lastCheckedAt,
      },
    },
  });
});

router.use("/api/auth", authRoutes);
router.use("/api/companies", companyRoutes);
router.use("/api/branches", branchRoutes);
router.use('/api/departments', departmentRoutes);
router.use("/api/designations", designationRoutes);
router.use("/api/employees", employeeRoutes);
// Uploaded images/icons. Multer writes to "<cwd>/uploads/..."; also serve
// "<Backend folder>/uploads" in case PM2/node is started from another folder.
router.use("/uploads", express.static(path.resolve(process.cwd(), "uploads"), { maxAge: "7d" }));
if (path.resolve(BACKEND_DIR, "uploads") !== path.resolve(process.cwd(), "uploads")) {
  router.use("/uploads", express.static(path.resolve(BACKEND_DIR, "uploads"), { maxAge: "7d" }));
}
router.use('/api/rbac', rbacRoutes);
router.use('/api/suppliers', supplierRoutes);
router.use('/api/categories',  categoryRoutes);
router.use('/api/brands',      brandRoutes);
router.use('/api/item-groups', itemGroupRoutes);
router.use('/api/items',       itemRoutes);
router.use('/api/purchase-orders', purchaseOrderRoutes);
router.use('/api/technicians', technicianRoutes);
router.use('/api/purchase-invoices', purchaseInvoiceRoutes);
router.use('/api/settings/invoice', invoiceSettingsRoutes);
router.use('/api/settings/email', emailConfigRoutes);
router.use('/api/incentive-logs', incentiveRoutes);
// Temporarily disabled: Colour Master API route.
// router.use('/api/colors', colorRoutes);
router.use('/api/offers', offerRoutes);
// Temporarily disabled: Finance Companies API route.
// router.use('/api/finance-companies', financeCompanyRoutes);
router.use('/api/sales-invoices', salesInvoiceRoutes);
router.use("/api/public", publicRoutes);

router.use("/api/customer/auth",     customerAuthRouter);
router.use("/api/customer/wishlist", customerWishlistRouter);
router.use("/api/customer/cart",     customerCartRouter);
router.use("/api/customer/profile",  customerProfileRouter);
router.use("/api/customer/orders",   customerOrdersRouter);
router.use("/api/customer/payments", customerPaymentsRouter);
router.use("/api/contact",           contactRouter);



// Mount the router to both root and subdirectory
app.use('/', router);
app.use('/motabhai_next_backend', router);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
    path: req.path
  });
});

// Global error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Something went wrong!",
    error: process.env.NODE_ENV === 'dev' ? err.stack : undefined
  });
});

app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

const server = app.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log(` Server running on http://localhost:${PORT}`);
  console.log(` Environment: ${NODE_ENV}`);
  console.log(` Frontend: ${FRONTEND_URL}`);
  console.log(` Health check: http://localhost:${PORT}/api/health`);
  console.log('='.repeat(50));
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(` Port ${PORT} is already in use.`);
    console.error(` Update Backend/.env with another PORT such as ${DEFAULT_PORT}.`);
    return;
  }

  console.error(" Server startup failed:", err);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection:', err);
  // In production, you might want to exit the process
  // process.exit(1);
});
