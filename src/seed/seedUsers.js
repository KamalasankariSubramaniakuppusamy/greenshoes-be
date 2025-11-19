import dotenv from "dotenv";
dotenv.config();

import bcrypt from "bcrypt";
import { query } from "../db/db.js";

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

async function seedUsers() {
  try {
    console.log("🌱 Seeding regular users...");

    for (const user of usersToSeed) {
      const exists = await query(
        `SELECT id FROM users WHERE email = $1 LIMIT 1`,
        [user.email]
      );

      if (exists.rows.length > 0) {
        console.log(`⚠️ User already exists: ${user.email}`);
        continue;
      }

      const hashed = await bcrypt.hash(user.password, 12);

      const result = await query(
        `INSERT INTO users (full_name, email, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, full_name, email`,
        [user.fullName, user.email, hashed]
      );

      console.log("✅ User created:", result.rows[0]);
    }

    console.log("🎉 All users seeded successfully.");

  } catch (err) {
    console.error("❌ Error seeding users:", err);
  } finally {
    process.exit(0);
  }
}

seedUsers();
