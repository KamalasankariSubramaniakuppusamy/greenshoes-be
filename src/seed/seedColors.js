// ============================================================================
// seedColors.js
// Developer: Kamala 
// ============================================================================
// Scans product image filenames to extract colors and seeds them into the DB
// Run this after adding product images: node scripts/seedColors.js
// Image naming convention: productname-COLOR-viewtype.ext
// Example: oceandrift-navy-model.png -> extracts "navy"
//
// This saves manual data entry - colors are derived from the images you have

import fs from "fs";
import path from "path";
import dotenv from "dotenv";
dotenv.config();

import { query } from "../db/db.js";

// Root folder where product images live
// Structure: public/images/{category}/{product-slug}/{images}
const ROOT = path.join(process.cwd(), "public/images");

// ----------------------------------------------------------------------------
// Extract color from filename
// ----------------------------------------------------------------------------
// Expects format: productname-color-viewtype.ext
// Splits on "-", takes the second part (index 1)
// Returns null if filename doesn't follow the convention
//
function extractColor(filename) {
  const parts = filename.split("-");
  
  // Need at least 2 parts (name-color) to extract a color
  if (parts.length < 2) return null;

  // Clean up: lowercase, remove extension
  return parts[1].toLowerCase().replace(".png", "").replace(".jpg", "").trim();
}

async function seedColors() {
  try {
    console.log("Scanning colors...");

    // Get all category folders (sandals, boots, sneakers, etc)
    const categories = fs.readdirSync(ROOT);

    // Using a Set to automatically dedupe colors
    // Multiple products might have "navy" - we only need it once
    const colorSet = new Set();

    // Walk through the folder structure
    for (const category of categories) {
      const categoryPath = path.join(ROOT, category);

      // Skip if not a directory (could be .DS_Store or something)
      if (!fs.statSync(categoryPath).isDirectory()) continue;

      const products = fs.readdirSync(categoryPath);

      for (const product of products) {
        const productPath = path.join(categoryPath, product);

        if (!fs.statSync(productPath).isDirectory()) continue;

        // Now we're in a product folder - scan all images
        const images = fs.readdirSync(productPath);

        images.forEach((img) => {
          const color = extractColor(img);
          if (color) colorSet.add(color);
        });
      }
    }

    console.log("Detected colors:", [...colorSet]);

    // Insert each color into the database
    // ON CONFLICT DO NOTHING makes this idempotent - safe to run multiple times
    for (const color of colorSet) {
      await query(
        `INSERT INTO colors (value)
         VALUES ($1)
         ON CONFLICT (value) DO NOTHING`,
        [color]
      );
    }

    console.log("Colors seeded.");
    process.exit(0);

  } catch (err) {
    console.error("Error seeding colors:", err);
    process.exit(1);  // Non-zero exit code indicates failure
  }
}

seedColors();

// ----------------------------------------------------------------------------
// Usage:
//   node scripts/seedColors.js
//
// Prerequisites:
// - Product images must be in public/images/{category}/{product}/
// - Images must follow naming convention: name-COLOR-view.ext
//
// What it does:
// 1. Walks through all product image folders
// 2. Extracts color from each filename
// 3. Dedupes the colors
// 4. Inserts into colors table (skips if already exists)
//
// This script is idempotent - running it multiple times won't create dupes – 
// tried and tested!
// ----------------------------------------------------------------------------
// This was a creative idea to avoid manual data entry of colors. 
// I'm quite proud of building this logic. This is my personal favorite 
// part of this entire project and I loved how my intuition tured out for the good
// here.
