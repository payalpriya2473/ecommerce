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

// Test database connection
const testConnection = async () => {
  try {
    const connection = await db.getConnection();
    console.log(' Database connected successfully');
    console.log(` Connected to database: ${process.env.DB_NAME}`);
    connection.release();
  } catch (err) {
    console.error(' Database connection failed:', err.message);
    console.error('Please check your .env file and ensure MySQL is running');
    process.exit(1);
  }
};

// Test connection on startup
testConnection();

export default db;