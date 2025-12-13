// ============================================================================
// Seeding Admin (only one for this website)
// Developer: Kamalasankari Subramaniakuppusamy
// ============================================================================
// One-time script to create the initial admin user
// Run this after setting up the database: node scripts/seedAdmin.js
//
// Creates a default admin account that can be used to access the admin panel
// In production, you'd want to change the password immediately after first login

import dotenv from "dotenv";
dotenv.config();  // Load DATABASE_URL and other env vars

import bcrypt from "bcrypt";
import { query } from "../db/db.js";

async function seedAdmin() {
  try {
    // First check if we already have an admin
    // Don't want to create duplicates or overwrite an existing admin
    console.log("Checking for existing admin...");

    const exists = await query(
      `SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1`
    );

    if (exists.rows.length > 0) {
      console.log("Admin already exists:", exists.rows[0].id);
      return;  // Nothing to do, exit gracefully
    }

    // No admin exists, create one
    console.log("Creating admin user...");

    // Hash the password - same bcrypt cost (12) as regular registration
    // Default password is "Admin@123" - CHANGE THIS IN PRODUCTION
    const hashed = await bcrypt.hash("Admin@123", 12);

    const result = await query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ($1, $2, $3, 'ADMIN')
       RETURNING id, full_name, email, role`,
      ["GreenShoes Admin", "admin@greenshoes.com", hashed]
    );

    console.log("Admin created:", result.rows[0]);

  } catch (err) {
    console.error("Error seeding admin:", err);
  } finally {
    // Always exit the process when done
    // Script shouldn't hang - it's meant to run once and finish
    process.exit(0);
  }
}

// Run immediately when script is executed
seedAdmin();

// ----------------------------------------------------------------------------
// DEFAULT CREDENTIALS (change after first login!)
// Email:    admin@greenshoes.com
// Password: Admin@123
// ----------------------------------------------------------------------------
//
// Usage:
//   node scripts/seedAdmin.js
//
// The script is idempotent - safe to run multiple times
// If admin exists, it just logs that and exits
//
// For production deployment:
// 1. Run this script once after DB setup
// 2. Log in with default credentials
// 3. Change password immediately (when that feature exists)
// Or better: set admin credentials via environment variables instead of hardcoding