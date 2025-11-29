import dotenv from "dotenv";
dotenv.config();

import bcrypt from "bcrypt";
import { query } from "../db/db.js";

async function seedAdmin() {
  try {
    console.log("Checking for existing admin...");

    const exists = await query(
      `SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1`
    );

    if (exists.rows.length > 0) {
      console.log("Admin already exists:", exists.rows[0].id);
      return;
    }

    console.log("Creating admin user...");

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
    process.exit(0);
  }
}

seedAdmin();
