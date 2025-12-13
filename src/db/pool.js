// ============================================================================
// pool.js
// Developer: Kamalasankari Subramaniakuppusamy
// ============================================================================
//
// PostgreSQL connection pool configuration
// This is the foundation of all database operations in GreenShoes
//
// WHY CONNECTION POOLING?
// Without pooling: Each query opens a new connection, uses it, closes it
// - Opening connections is SLOW (TCP handshake, authentication, etc.)
// - Under load, you'd constantly open/close connections
//
// With pooling: Pool maintains a set of open connections ready to use
// - Query needs a connection? Borrow one from the pool
// - Query done? Return it to the pool (stays open for next query)
// - Much faster, handles concurrent requests efficiently
//
// pg.Pool handles all this automatically - we just call pool.query()
//
// ============================================================================

import pg from "pg";
import dotenv from "dotenv";

// Load environment variables from .env file
// This must happen before we try to read DATABASE_URL
dotenv.config();


// ============================================================================
// CREATE CONNECTION POOL
// ============================================================================
//
// DATABASE_URL format (PostgreSQL connection string):
//   postgresql://username:password@hostname:port/database_name
//
// Examples:
//   Local:      postgresql://postgres:mypassword@localhost:5432/greenshoes
//   Render:     postgresql://user:pass@oregon-postgres.render.com:5432/greenshoes_db
//   Supabase:   postgresql://postgres:pass@db.xxxxx.supabase.co:5432/postgres
//
// The pool will parse this string and extract host, port, user, password, database
//
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  
  // ---------- SSL CONFIGURATION ----------
  // Production databases (Render, Heroku, AWS RDS, etc.) require SSL
  // Local development typically doesn't use SSL
  //
  // rejectUnauthorized: false
  //   - Accepts self-signed certificates (common on managed DB services)
  //   - Not ideal for security, but required by many cloud providers
  //   - For maximum security, you'd provide the CA certificate instead
  //
  // In development (NODE_ENV !== 'production'):
  //   - SSL disabled (ssl: false)
  //   - Local PostgreSQL usually doesn't have SSL configured
  //
  ssl: process.env.NODE_ENV === "production" 
    ? { rejectUnauthorized: false } 
    : false
});

export default pool;


// ============================================================================
// NOTES ON POOL CONFIGURATION
// ============================================================================
//
// DEFAULT POOL SETTINGS (pg.Pool):
// - max: 10 connections (usually sufficient for small-medium apps)
// - idleTimeoutMillis: 10000 (close idle connections after 10 seconds)
// - connectionTimeoutMillis: 0 (wait indefinitely for connection)
//
// For high-traffic production, you might want to tune these:
//
//   const pool = new pg.Pool({
//     connectionString: process.env.DATABASE_URL,
//     ssl: { rejectUnauthorized: false },
//     max: 20,                        // More concurrent connections
//     idleTimeoutMillis: 30000,       // Keep idle connections longer
//     connectionTimeoutMillis: 5000,  // Fail fast if can't connect
//   });
//
// ============================================================================
// ENVIRONMENT VARIABLES REQUIRED
// ============================================================================
//
// DATABASE_URL (required):
//   The PostgreSQL connection string
//   Set in .env for local dev, in platform settings for production
//
// NODE_ENV (optional, defaults to development):
//   'production' - enables SSL for database connection
//   'development' or undefined - disables SSL
//
//
// ============================================================================