// ============================================================================
// Let's seed some produqcts into the database and then later 
// upload products via the admin panel! 
// ============================================================================
// Bulk product seeder - reads from image folder structure and populates the DB
// Run after setting up images: node scripts/seedProducts.js
//
// This script looks at what images exist and creates products from them
// Saves a ton of manual data entry when you have lots of products
//
// Expected folder structure:
//   public/images/{category}/{product-slug}/{images}
//
// Image naming convention:
//   productname-COLOR-viewtype.ext (e.g., tiara-black-side.png)

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { query } from "../db/db.js";

// ES modules don't have __dirname, so we have to construct it
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Root folder where product images live
const IMAGES_ROOT = path.join(__dirname, "../../public/images");

// Only these categories will be processed
// If you add a new category folder, add it here too
const VALID_CATEGORIES = ["heels", "sneakers", "pumps", "sandals", "boots"];

// US women's shoe sizes - every product gets all these sizes
// Inventory quantities are randomized per size/color combo
const SIZES = ["5", "6", "6.5", "7", "7.5", "8", "8.5", "9", "9.5", "10", "10.5", "11"];

// ----------------------------------------------------------------------------
// Helper: Random quantity generator
// ----------------------------------------------------------------------------
// Products start with random stock between 5-30 per variant
// Gives realistic-looking inventory without manually setting each one
const randomQty = () => Math.floor(Math.random() * 26) + 5;

// ----------------------------------------------------------------------------
// Helper: Capitalize first letter
// ----------------------------------------------------------------------------
const capitalize = (str) =>
  str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();

// ----------------------------------------------------------------------------
// Helper: Convert folder name to product name
// ----------------------------------------------------------------------------
// "ocean-drift" becomes "Ocean drift"
// Folder names use dashes, display names use spaces
const formatProductName = (folderName) =>
  capitalize(folderName.replace(/-/g, " "));


// ============================================================================
// MAIN SEEDER LOGIC
// ============================================================================

async function seedProducts() {
  console.log("Starting product seeding...");

  // Loop through each category folder
  for (const category of VALID_CATEGORIES) {
    const categoryPath = path.join(IMAGES_ROOT, category);

    // Skip if category folder doesn't exist
    if (!fs.existsSync(categoryPath)) continue;

    // Each subfolder in the category is a product
    const products = fs.readdirSync(categoryPath);

    for (const prodFolder of products) {
      const productPath = path.join(categoryPath, prodFolder);
      
      // Skip files, only process directories
      if (!fs.lstatSync(productPath).isDirectory()) continue;

      const productName = formatProductName(prodFolder);
      console.log(`\n Processing product → ${productName}`);

      // ---------- 1) CREATE THE PRODUCT ----------
      const insertProduct = await query(
        `INSERT INTO products (name, category)
         VALUES ($1, $2)
         RETURNING id`,
        [productName, category]
      );
      const productId = insertProduct.rows[0].id;
      // Note: cost_price and selling_price default to 0, need to set later in admin

      // ---------- 2) SCAN IMAGES AND GROUP BY COLOR ----------
      // Look at all images in the product folder
      // Group them by color so we know which images go with which color
      const images = fs.readdirSync(productPath);

      const colorMap = {}; // { black: [img1.png, img2.png], white: [...] }

      for (const img of images) {
        const lower = img.toLowerCase();
        
        // Only process image files
        if (!lower.endsWith(".png") && !lower.endsWith(".jpg") && !lower.endsWith(".jpeg")) continue;

        // Extract color from filename using regex
        // Matches: tiara-black-side.png -> "black"
        // Add more colors to this list as needed
        const colorMatch = lower.match(/-(black|white|red|blue|beige|pink|green|brown|cream|gold|silver)/);
        if (!colorMatch) continue;  // Skip images that don't match naming convention

        const color = colorMatch[1];

        if (!colorMap[color]) colorMap[color] = [];
        colorMap[color].push(img);
      }

      // ---------- 3) PROCESS EACH COLOR ----------
      // For each color: create color record, link to product, add images, create inventory
      for (const color of Object.keys(colorMap)) {
        console.log(`Color: ${color}`);

        // Get or create the color in the colors table
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

        // Link product to color (many-to-many junction table)
        await query(
          `INSERT INTO product_colors (product_id, color_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [productId, colorId]
        );

        // ---------- INSERT IMAGES FOR THIS COLOR ----------
        // Priority determines display order (1 = main image)
        let priority = 1;
        for (const imgFile of colorMap[color]) {
          await query(
            `INSERT INTO product_images (product_id, color_id, image_url, priority)
             VALUES ($1, $2, $3, $4)`,
            [productId, colorId, `/images/${category}/${prodFolder}/${imgFile}`, priority]
          );
          priority++;
        }

        // ---------- INSERT SIZES + INVENTORY FOR THIS COLOR ----------
        // Every color gets every size with random starting quantity
        for (const size of SIZES) {
          // Get or create the size in the sizes table
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

          // Link product to size (many-to-many)
          await query(
            `INSERT INTO product_sizes (product_id, size_id)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [productId, sizeId]
          );

          // Create inventory record for this product + size + color combo
          const qty = randomQty();
          await query(
            `INSERT INTO inventory (product_id, size_id, color_id, quantity)
             VALUES ($1, $2, $3, $4)`,
            [productId, sizeId, colorId, qty]
          );
        }
      }
      
      console.log(`Product seeded: ${productName}`);
    }
  }

  console.log("\n Product seeding completed.");
  process.exit(0);
}

// Run the seeder
seedProducts().catch((err) => {
  console.error("Product seeding failed:", err);
  process.exit(1);
});


// ============================================================================
// USAGE & NOTES
// ============================================================================
//
// Run: node scripts/seedProducts.js
//
// Before running:
// 1. Make sure DATABASE_URL is set in .env
// 2. Make sure database schema is created (run migrations)
// 3. Put product images in public/images/{category}/{product}/
// 4. Name images correctly: productname-color-view.ext
//
// What gets created:
// - Product record (name, category)
// - Color records (if new colors found)
// - Size records (if new sizes found)
// - Product-color links
// - Product-size links
// - Product images with priority ordering
// - Inventory records with random quantities (5-30 per variant)
//
// What you still need to do after:
// - Set cost_price and selling_price in admin panel
// - Add product descriptions
// - Add environmental impact data
// - Adjust inventory quantities if needed
//
// Limitations:
// - Only recognizes specific color names in the regex (add more as needed)
// - Prices default to 0 (must be set manually)
// - Not idempotent - running twice creates duplicates
//   (could add ON CONFLICT handling to make it safe to re-run)
//
// ============================================================================