import dotenv from "dotenv";
dotenv.config();

import { query } from "../db/db.js";

const sizes = ["5", "6", "7", "8", "9", "10"];

async function seedSizes() {
  try {
    console.log("🌱 Seeding sizes...");

    for (const value of sizes) {
      await query(
        `INSERT INTO sizes (value)
         VALUES ($1)
         ON CONFLICT (value) DO NOTHING`,
        [value]
      );
    }

    console.log("✅ Sizes seeded.");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error seeding sizes:", err);
    process.exit(1);
  }
}

seedSizes();
