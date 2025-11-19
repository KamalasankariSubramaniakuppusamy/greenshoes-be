import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { query } from "../db/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ROOT IMAGES FOLDER
const IMAGES_ROOT = path.join(__dirname, "../../public/images");

// Allowed categories
const VALID_CATEGORIES = ["heels", "sneakers", "pumps", "sandals", "boots"];

// Hardcoded US shoe sizes
const SIZES = ["5","6","6.5","7","7.5","8","8.5","9","9.5","10","10.5","11"];

// Random quantity generator
const randomQty = () => Math.floor(Math.random() * 26) + 5; // 5–30

// Capitalize
const capitalize = (str) =>
  str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();

// Extract product name from folder
const formatProductName = (folderName) =>
  capitalize(folderName.replace(/-/g, " "));

/**
 * ===============================================
 *  MAIN SEEDER LOGIC
 * ===============================================
 */

async function seedProducts() {
  console.log("🌱 Starting product seeding...");

  for (const category of VALID_CATEGORIES) {
    const categoryPath = path.join(IMAGES_ROOT, category);

    if (!fs.existsSync(categoryPath)) continue;

    const products = fs.readdirSync(categoryPath);

    for (const prodFolder of products) {
      const productPath = path.join(categoryPath, prodFolder);
      if (!fs.lstatSync(productPath).isDirectory()) continue;

      const productName = formatProductName(prodFolder);
      console.log(`\n📦 Processing product → ${productName}`);

      // 1) Insert product
      const insertProduct = await query(
        `INSERT INTO products (name, category)
         VALUES ($1, $2)
         RETURNING id`,
        [productName, category]
      );
      const productId = insertProduct.rows[0].id;

      // 2) Scan images grouped by color
      const images = fs.readdirSync(productPath);

      const colorMap = {}; // { black: [img1,img2], white: [...] }

      for (const img of images) {
        const lower = img.toLowerCase();
        if (!lower.endsWith(".png") && !lower.endsWith(".jpg") && !lower.endsWith(".jpeg")) continue;

        // Extract color name from filename
        // Example: Tiara-black-side.png → "black"
        const colorMatch = lower.match(/-(black|white|red|blue|beige|pink|green|brown|cream|gold|silver)/);
        if (!colorMatch) continue;

        const color = colorMatch[1];

        if (!colorMap[color]) colorMap[color] = [];
        colorMap[color].push(img);
      }

      // 3) Insert colors + images + sizes + inventory
      for (const color of Object.keys(colorMap)) {
        console.log(`  🎨 Color: ${color}`);

        // Insert color into colors table
        let colorId;

        const c = await query(`SELECT id FROM colors WHERE value = $1`, [color]);
        if (c.rows.length > 0) {
          colorId = c.rows[0].id;
        } else {
          const newColor = await query(
            `INSERT INTO colors (value) VALUES ($1) RETURNING id`,
            [color]
          );
          colorId = newColor.rows[0].id;
        }

        // Link product ↔ color
        await query(
          `INSERT INTO product_colors (product_id, color_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [productId, colorId]
        );

        // Insert IMAGES
        let priority = 1;
        for (const imgFile of colorMap[color]) {
          await query(
            `INSERT INTO product_images (product_id, color_id, image_url, priority)
             VALUES ($1, $2, $3, $4)`,
            [productId, colorId, `/images/${category}/${prodFolder}/${imgFile}`, priority]
          );
          priority++;
        }

        // Insert SIZES + inventory
        for (const size of SIZES) {
          // Insert size if missing
          let sizeId;
          const s = await query(`SELECT id FROM sizes WHERE value = $1`, [size]);
          if (s.rows.length > 0) {
            sizeId = s.rows[0].id;
          } else {
            const newSize = await query(
              `INSERT INTO sizes (value) VALUES ($1) RETURNING id`,
              [size]
            );
            sizeId = newSize.rows[0].id;
          }

          // Link product ↔ size
          await query(
            `INSERT INTO product_sizes (product_id, size_id)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [productId, sizeId]
          );

          // RANDOM QUANTITY
          const qty = randomQty();

          await query(
            `INSERT INTO inventory (product_id, size_id, color_id, quantity)
             VALUES ($1, $2, $3, $4)`,
            [productId, sizeId, colorId, qty]
          );
        }
      }
      console.log(`✅ Product seeded: ${productName}`);
    }
  }

  console.log("\n🎉 Product seeding completed.");
  process.exit(0);
}

seedProducts().catch((err) => {
  console.error("❌ Product seeding failed:", err);
  process.exit(1);
});
