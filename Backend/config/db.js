import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

// Create connection pool
export const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

// Last known connection state — surfaced by GET /api/health so a failing
// database is obvious instead of showing up as blanket 500s on every route.
export const dbStatus = {
  connected: false,
  database: process.env.DB_NAME || null,
  host: process.env.DB_HOST || null,
  user: process.env.DB_USER || null,
  lastError: null,
  lastCheckedAt: null,
};

export async function checkDbConnection({ quiet = false } = {}) {
  try {
    const connection = await db.getConnection();
    await connection.query("SELECT 1");
    connection.release();

    const wasDown = !dbStatus.connected;
    dbStatus.connected = true;
    dbStatus.lastError = null;
    dbStatus.lastCheckedAt = new Date().toISOString();

    if (!quiet || wasDown) {
      console.log(` Database connected successfully (${process.env.DB_NAME})`);
    }
    return true;
  } catch (err) {
    dbStatus.connected = false;
    dbStatus.lastError = `${err.code || "ERROR"}: ${err.message}`;
    dbStatus.lastCheckedAt = new Date().toISOString();

    if (!quiet) {
      console.error("=".repeat(64));
      console.error(" DATABASE CONNECTION FAILED");
      console.error(` ${err.code || ""} ${err.message}`);
      console.error(` host=${process.env.DB_HOST}  user=${process.env.DB_USER}  database=${process.env.DB_NAME}`);
      console.error(" Every API route will return 500 until this is fixed.");
      console.error(" Check that MySQL is running and that Backend/.env matches your database.");
      console.error(` Health check: http://localhost:${process.env.PORT || 5001}/api/health`);
      console.error("=".repeat(64));
    }
    return false;
  }
}

// Check on startup, then keep re-checking quietly so the API recovers on its
// own once MySQL comes back (previously the process exited and stayed down).
checkDbConnection();
const dbWatch = setInterval(() => {
  void checkDbConnection({ quiet: true });
}, 30000);
if (typeof dbWatch.unref === "function") dbWatch.unref();

export default db;
