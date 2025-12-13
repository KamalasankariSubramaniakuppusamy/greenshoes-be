// ============================================================================
// Seeding the users wit test accounts
// ============================================================================
// Just a summary of what I built here:
// Seed test customer accounts for development and demo purposes
// Run: node scripts/seedUsers.js
//
// I created 10 fake customers with various names from around the world 
// (that was fun!).
// Good for testing checkout flows, order history, etc without creating
// accounts manually every time you reset the database

import dotenv from "dotenv";
dotenv.config();

import bcrypt from "bcrypt";
import { query } from "../db/db.js";

// ----------------------------------------------------------------------------
// Test users to create
// ----------------------------------------------------------------------------
// Mix of international names to test character handling (umlauts, apostrophes, etc)
// Passwords follow typical requirements (uppercase, lowercase, number, special char)
// In a real app you'd never put passwords in code like this obviously
//
const usersToSeed = [
  { fullName: "Aarav Nair", email: "aarav.nair@example.com", password: "Aarav!2002" },
  { fullName: "Sofia Müller", email: "sofia.muller@example.de", password: "Sofia#Berlin" },
  { fullName: "Liam O'Connor", email: "liam.oconnor@example.ie", password: "LiamIrish@91" },
  { fullName: "Mei Ling", email: "mei.ling@example.sg", password: "MeiLing#88" },
  { fullName: "Diego Fernandez", email: "diego.fernandez@example.es", password: "Diego123@" },
  { fullName: "Amara Okafor", email: "amara.okafor@example.ng", password: "Amara2025!" },
  { fullName: "Emily Carter", email: "emily.carter@example.com", password: "Emily@100" },
  { fullName: "Noah Patel", email: "noah.patel@example.com", password: "Noah!4321" },
  { fullName: "Hana Suzuki", email: "hana.suzuki@example.jp", password: "HanaTokyo#55" },
  { fullName: "Lucas Brown", email: "lucas.brown@example.com", password: "Lucas_1998" }
];
// Using example.com/de/ie/etc domains - these are reserved for testing
// and guaranteed to never be real email addresses

async function seedUsers() {
  try {
    console.log("Seeding regular users...");

    for (const user of usersToSeed) {
      // Check if user already exists - makes this script idempotent
      // Safe to run multiple times without creating duplicates
      const exists = await query(
        `SELECT id FROM users WHERE email = $1 LIMIT 1`,
        [user.email]
      );

      if (exists.rows.length > 0) {
        console.log(`User already exists: ${user.email}`);
        continue;  // Skip to next user
      }

      // Hash password with bcrypt, cost factor 12 (same as real registration)
      const hashed = await bcrypt.hash(user.password, 12);

      // Insert user - role defaults to CUSTOMER (not specified = not admin)
      const result = await query(
        `INSERT INTO users (full_name, email, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, full_name, email`,
        [user.fullName, user.email, hashed]
      );

      console.log("User created:", result.rows[0]);
    }

    console.log("All users seeded successfully.");

  } catch (err) {
    console.error("Error seeding users:", err);
  } finally {
    // Always exit when done - this is a one-shot script
    process.exit(0);
  }
}

seedUsers();


// ============================================================================
// TEST CREDENTIALS
// ============================================================================
// Copy-paste these for quick login testing:
//
// aarav.nair@example.com     / Aarav!2002
// sofia.muller@example.de    / Sofia#Berlin
// liam.oconnor@example.ie    / LiamIrish@91
// mei.ling@example.sg        / MeiLing#88
// diego.fernandez@example.es / Diego123@
// amara.okafor@example.ng    / Amara2025!
// emily.carter@example.com   / Emily@100
// noah.patel@example.com     / Noah!4321
// hana.suzuki@example.jp     / HanaTokyo#55
// lucas.brown@example.com    / Lucas_1998
//
// ============================================================================