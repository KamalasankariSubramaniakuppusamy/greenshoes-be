import fs from "fs";
import path from "path";
import dotenv from "dotenv";
dotenv.config();

import { query } from "../db/db.js";

const ROOT = path.join(process.cwd(), "public/images");

function extractColor(filename) {
  const parts = filename.split("-");
  if (parts.length < 2) return null;

  return parts[1].toLowerCase().replace(".png", "").replace(".jpg", "").trim();
}

async function seedColors() {
  try {
    console.log("🌱 Scanning colors...");

    const categories = fs.readdirSync(ROOT);

    const colorSet = new Set();

    for (const category of categories) {
      const categoryPath = path.join(ROOT, category);

      if (!fs.statSync(categoryPath).isDirectory()) continue;

      const products = fs.readdirSync(categoryPath);

      for (const product of products) {
        const productPath = path.join(categoryPath, product);

        if (!fs.statSync(productPath).isDirectory()) continue;

        const images = fs.readdirSync(productPath);

        images.forEach((img) => {
          const color = extractColor(img);
          if (color) colorSet.add(color);
        });
      }
    }

    console.log("Detected colors:", [...colorSet]);

    for (const color of colorSet) {
      await query(
        `INSERT INTO colors (value)
         VALUES ($1)
         ON CONFLICT (value) DO NOTHING`,
        [color]
      );
    }

    console.log("✅ Colors seeded.");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error seeding colors:", err);
    process.exit(1);
  }
}

seedColors();
