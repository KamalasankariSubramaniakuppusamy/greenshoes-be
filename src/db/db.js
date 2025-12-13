// ============================================================================
// Developer: Kamalasankari Subramaniakuppusamy
// ============================================================================
//
// Database query wrapper - thin abstraction layer over pg pool
//
// PURPOSE:
// This tiny file might seem unnecessary, but it serves important purposes:
// 1. Single import point - controllers import { query } from "../db/db.js"
// 2. Decouples controllers from pool implementation details
// 3. Makes it easy to add query logging, timing, or error handling later
// 4. Enables easier mocking in tests
//
// USAGE THROUGHOUT THE APPLICATION:
//   import { query } from "../db/db.js";
//   
//   const result = await query(
//     `SELECT * FROM products WHERE id=$1`,
//     [productId]
//   );
//   
//   console.log(result.rows);  // Array of matching rows
//
// WHY NOT IMPORT POOL DIRECTLY?
// We could, but this wrapper gives us a single place to:
// - Add logging for all queries
// - Add query timing/performance monitoring
// - Handle connection errors consistently
// - Implement query retries if needed
//
// ============================================================================

import pool from "./pool.js";


// ----------------------------------------------------------------------------
// Query Function
// ----------------------------------------------------------------------------
// Executes a SQL query using the connection pool
//
// Parameters:
//   text   - SQL query string with $1, $2, etc. placeholders
//   params - Array of values to substitute for placeholders
//
// Returns:
//   Promise resolving to pg Result object with:
//   - rows: Array of result rows
//   - rowCount: Number of rows affected/returned
//   - fields: Column metadata
//
// Example:
//   const users = await query(`SELECT * FROM users WHERE role=$1`, ['ADMIN']);
//   console.log(users.rows);  // [{ id: '...', email: '...', role: 'ADMIN' }, ...]
//
// Security note:
//   ALWAYS use parameterized queries ($1, $2, etc.) - never string concatenation!
//   This prevents SQL injection attacks.
//   
//   GOOD: query(`SELECT * FROM users WHERE id=$1`, [userId])
//   BAD:  query(`SELECT * FROM users WHERE id='${userId}'`)  // SQL injection risk!
//
export const query = (text, params) => {
  return pool.query(text, params);
};


// ============================================================================
// POTENTIAL ENHANCEMENTS
// ============================================================================
//
// 1. Query logging (useful for debugging):
//
//    export const query = async (text, params) => {
//      const start = Date.now();
//      const result = await pool.query(text, params);
//      const duration = Date.now() - start;
//      console.log('Query:', { text, duration: `${duration}ms`, rows: result.rowCount });
//      return result;
//    };
//
// 2. Error handling with context:
//
//    export const query = async (text, params) => {
//      try {
//        return await pool.query(text, params);
//      } catch (err) {
//        console.error('Database query failed:', { text, params, error: err.message });
//        throw err;
//      }
//    };
//
// 3. Transaction helper:
//
//    export const transaction = async (callback) => {
//      const client = await pool.connect();
//      try {
//        await client.query('BEGIN');
//        const result = await callback(client);
//        await client.query('COMMIT');
//        return result;
//      } catch (err) {
//        await client.query('ROLLBACK');
//        throw err;
//      } finally {
//        client.release();
//      }
//    };
//
//    // Usage:
//    await transaction(async (client) => {
//      await client.query('UPDATE inventory SET quantity = quantity - 1 WHERE id=$1', [invId]);
//      await client.query('INSERT INTO order_items ...', [...]);
//    });
//
// 4. Connection health check:
//
//    export const healthCheck = async () => {
//      try {
//        await pool.query('SELECT 1');
//        return { healthy: true };
//      } catch (err) {
//        return { healthy: false, error: err.message };
//      }
//    };
//
// ============================================================================