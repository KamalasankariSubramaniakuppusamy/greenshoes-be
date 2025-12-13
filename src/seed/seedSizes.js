// ============================================================================
// Seeding sizes into the database for every single product– only US sizes supported
// ============================================================================
// Seeds the basic shoe sizes into the database
// Run: node scripts/seedSizes.js
//
// This is a simpler version - just the core sizes
// seedProducts.js has a more complete list and handles sizes automatically
// Use this if you just need the sizes table populated without products

import dotenv from "dotenv";
dotenv.config();

import { query } from "../db/db.js";

// Basic US women's shoe sizes
// Note: seedProducts.js has a more complete list with half sizes
// This is the minimal set for testing
const sizes = ["5", "6", "7", "8", "9", "10"];

async function seedSizes() {
  try {
    console.log("Seeding sizes...");

    for (const value of sizes) {
      // ON CONFLICT DO NOTHING makes this idempotent
      // Safe to run multiple times - won't create duplicates
      await query(
        `INSERT INTO sizes (value)
         VALUES ($1)
         ON CONFLICT (value) DO NOTHING`,
        [value]
      );
    }

    console.log("Sizes seeded.");
    process.exit(0);

  } catch (err) {
    console.error("Error seeding sizes:", err);
    process.exit(1);
  }
}

seedSizes();

// ----------------------------------------------------------------------------
// Note: This list is missing half sizes (6.5, 7.5, 8.5, etc)
// The seedProducts.js script has a more complete list:
// ["5","6","6.5","7","7.5","8","8.5","9","9.5","10","10.5","11"]
//
// If you run seedProducts.js, it will add the missing sizes automatically
// So you might not need this script at all
// ----------------------------------------------------------------------------