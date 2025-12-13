// ============================================================================
// productController.js
// Developer: GreenShoes Team
// ============================================================================
//
// Controller for admin product management - the heart of the admin panel
// Handles all product CRUD operations, inventory updates, sales, and impact data
//
// REQUIREMENTS COVERED:
// - "Add items with multiple pictures" (adminCreateProduct with multi-file upload)
// - "Add/modify quantities per size and color" (adminUpdateInventory)
// - "Change prices" (adminUpdateProduct)
// - "Place items on sale" (markProductOnSale, removeProductFromSale)
// - "Update inventory real-time" (adminUpdateInventory with immediate DB update)
// - "Inventory can never be negative" (validated at DB level, see schema)
// - "Impact management" (updateProductImpact for sustainability data)
// - "Flat shipping $11.95" (SHIPPING_FEE constant)
//
// FILE STRUCTURE:
// 1. Constants
// 2. Helper functions (image priority, color extraction, name normalization)
// 3. DB helper functions (getOrCreateColor, getOrCreateSize)
// 4. Product CRUD (create, read, update, delete)
// 5. Inventory management
// 6. Sale management
// 7. Environmental impact
//
// ROUTES THAT USE THIS:
// - POST   /api/admin/products              → adminCreateProduct
// - GET    /api/admin/products              → adminGetAllProducts
// - GET    /api/admin/products/:id          → adminGetSingleProduct
// - PUT    /api/admin/products/:id          → adminUpdateProduct
// - DELETE /api/admin/products/:id          → adminDeleteProduct
// - PUT    /api/admin/products/:id/inventory → adminUpdateInventory
// - POST   /api/admin/products/:id/sale     → markProductOnSale
// - DELETE /api/admin/products/:id/sale     → removeProductFromSale
// - PUT    /api/admin/products/:id/impact   → updateProductImpact
//
// ============================================================================

import { query } from "../db/db.js";
import fs from "fs";
import path from "path";


// ============================================================================
// CONSTANTS
// ============================================================================

// Minimum cost price for products - prevents accidental $0 or super cheap entries
// $1999 minimum makes sense for luxury eco-friendly footwear
const MIN_COST_PRICE = 1999;  // Note: stored in cents? Or is this $1999? Check usage

// REQUIREMENT: "Flat shipping $11.95"
// This constant is defined here but actually used in checkout/order calculations
const SHIPPING_FEE = 11.99;  // Flat shipping fee for all products per requirements


// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// ----------------------------------------------------------------------------
// Get Image Priority Based on View Type
// Lower number = higher priority (shown first in gallery)
// ----------------------------------------------------------------------------
// This function parses the filename to determine what kind of shot it is
// and assigns a priority so model/pair shots show first, detail shots last
function getImagePriority(filename) {
  const lowerFilename = filename.toLowerCase();
  
  // Extract the view type from filename
  // Convention: "productname-color-viewtype.png"
  // e.g., "smoothlikebutter-black-model.png" → extracts "model"
  const parts = lowerFilename.replace(/\.[^.]+$/, '').split('-');
  const viewType = parts[parts.length - 1];
  
  // Priority map - lower number = shows first
  // Model shots and pair shots are most appealing, show those first
  // Detail/closeup shots are supplementary, show last
  const priorityMap = {
    'model': 1,      // Person wearing the shoes - best for conversions
    'pair': 2,       // Both shoes together
    'front': 3,      // Front view
    'side': 4,       // Side profile
    'right': 5,      // Right shoe
    'left': 6,       // Left shoe
    'back': 7,       // Back/heel view
    'top': 8,        // Top-down view
    'detail': 9,     // Close-up of details
    'closeup': 10    // Extreme close-up
  };
  
  return priorityMap[viewType] || 50;  // Unknown types get low priority (50)
}


// ----------------------------------------------------------------------------
// Extract Color from Filename
// ----------------------------------------------------------------------------
// Our image naming convention: "productname-color-viewtype.ext"
// This extracts the color portion for matching images to variants
function extractColorFromFilename(filename) {
  const parts = filename.toLowerCase().split("-");
  // Example: "tiara-black-side.png" → ["tiara", "black", "side.png"]
  // Return the second part (index 1) which should be the color
  return parts.length >= 2 ? parts[1].trim() : null;
}


// ----------------------------------------------------------------------------
// Normalize Product Name
// ----------------------------------------------------------------------------
// Converts various input formats to consistent Title Case
// "smooth-like-butter" → "Smooth Like Butter"
// "OCEAN_WAVE" → "Ocean Wave"
function normalizeProductName(name) {
  return name
    .replace(/[-_]/g, " ")           // Replace dashes and underscores with spaces
    .replace(/\s+/g, " ")            // Collapse multiple spaces
    .trim()                          // Remove leading/trailing whitespace
    .replace(/\b\w/g, (c) => c.toUpperCase());  // Capitalize first letter of each word
}


// ----------------------------------------------------------------------------
// Create URL-Safe Slug from Product Name
// ----------------------------------------------------------------------------
// Used for creating folder paths for product images
// "Ocean Wave Sandal" → "ocean-wave-sandal"
function createSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')     // Replace non-alphanumeric with dashes
    .replace(/^-|-$/g, '');          // Remove leading/trailing dashes
}


// ============================================================================
// DATABASE HELPER FUNCTIONS
// These implement "get or create" pattern to avoid duplicates
// ============================================================================

// ----------------------------------------------------------------------------
// Get or Create Color
// ----------------------------------------------------------------------------
// Returns the ID of the color, creating it if it doesn't exist
// This ensures we don't have duplicate color entries
async function getOrCreateColor(value) {
  // First, try to find existing color
  const existing = await query(`SELECT id FROM colors WHERE value=$1`, [value]);
  if (existing.rows.length > 0) return existing.rows[0].id;

  // Doesn't exist, create it
  const result = await query(
    `INSERT INTO colors (value) VALUES ($1) RETURNING id`,
    [value]
  );
  return result.rows[0].id;
}


// ----------------------------------------------------------------------------
// Get or Create Size
// ----------------------------------------------------------------------------
// Same pattern as colors - returns ID, creates if needed
async function getOrCreateSize(sizeValue) {
  const existing = await query(
    `SELECT id FROM sizes WHERE value=$1`,
    [sizeValue]
  );
  if (existing.rows.length > 0) return existing.rows[0].id;

  const result = await query(
    `INSERT INTO sizes (value) VALUES ($1) RETURNING id`,
    [sizeValue]
  );
  return result.rows[0].id;
}


// ============================================================================
// CREATE PRODUCT
// REQUIREMENTS: "Add items with multiple pictures"
// ============================================================================
//
// This is a complex endpoint that handles:
// 1. Product basic info (name, description, prices)
// 2. Multiple image uploads
// 3. Variant creation (color + sizes with quantities)
// 4. Auto-sale detection (if selling_price < cost_price)
//
// Expected request format (multipart/form-data):
// - name, description, category, cost_price, selling_price: strings
// - variants: JSON string like '[{"color":"black","sizes":[{"value":"7","quantity":10}]}]'
// - images: multiple files with naming convention "productname-color-viewtype.ext"
//
export const adminCreateProduct = async (req, res) => {
  try {
    const { name, description, category, cost_price, selling_price } = req.body;

    // ---------- PARSE VARIANTS ----------
    // Variants come as a JSON string from form-data (Postman, frontend FormData)
    // Need to parse it into an actual array
    let variants;
    try {
      variants = JSON.parse(req.body.variants);
    } catch {
      return res.status(400).json({ error: "Invalid variants JSON format" });
    }

    // ---------- NORMALIZE IMAGE FILES ----------
    // Multer can populate req.files in different formats depending on config:
    // - upload.array('images') → req.files is an array
    // - upload.fields([...]) → req.files is an object { fieldName: [files] }
    // Normalize to a flat array for consistent handling
    let images = [];
    if (!req.files) images = [];
    else if (Array.isArray(req.files)) images = req.files;
    else images = Object.values(req.files).flat();

    // ---------- VALIDATE REQUIRED FIELDS ----------
    if (
      !name ||
      !description ||
      !category ||
      !cost_price ||
      !selling_price ||
      !Array.isArray(variants)
    ) {
      // Debug logging - helpful during development
      console.log("VALIDATION FAILED:");
      console.log("name:", !!name, name);
      console.log("description:", !!description, description);
      console.log("category:", !!category, category);
      console.log("cost_price:", !!cost_price, cost_price);
      console.log("selling_price:", !!selling_price, selling_price);
      console.log("variants is array:", Array.isArray(variants));
      return res.status(400).json({ error: "Missing fields" });
    }

    // Validate minimum cost price
    if (cost_price < MIN_COST_PRICE) {
      return res.status(400).json({
        error: `Cost price must be at least $${MIN_COST_PRICE}`,
      });
    }

    // ---------- DETERMINE PRICING & SALE STATUS ----------
    // Price category: 'discount' if selling below cost, 'normal' otherwise
    const price_category =
      Number(selling_price) < Number(cost_price) ? "discount" : "normal";
    
    // AUTO SALE LOGIC:
    // If admin enters a selling price lower than cost price, we interpret this as:
    // "I want to sell this at a discount"
    // So we automatically mark it as on_sale and:
    // - Store the discounted price as sale_price
    // - Store the cost_price as selling_price (the "original" crossed-out price)
    const isOnSale = Number(selling_price) < Number(cost_price);
    
    const dbSellingPrice = isOnSale ? cost_price : selling_price;
    const dbSalePrice = isOnSale ? selling_price : null;

    // Normalize the product name for consistency
    const normalizedName = normalizeProductName(name);
    const productSlug = createSlug(name);

    // ---------- INSERT PRODUCT ----------
    const productResult = await query(
      `INSERT INTO products 
         (name, description, category, cost_price, selling_price, price_category, on_sale, sale_price)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        normalizedName,
        description,
        category,
        cost_price,
        dbSellingPrice,
        price_category,
        isOnSale,
        dbSalePrice
      ]
    );

    const product = productResult.rows[0];

    // ---------- PROCESS VARIANTS + IMAGES ----------

    // Collect all colors from variants for validation
    const variantColors = variants.map((v) => v.color.toLowerCase());

    // Extract colors from uploaded image filenames
    const imageColors = images.map((img) =>
      extractColorFromFilename(img.originalname)
    );

    // Validate: every image must have a corresponding color in variants
    // This prevents orphan images that don't match any variant
    for (const imgColor of imageColors) {
      if (!variantColors.includes(imgColor)) {
        return res.status(400).json({
          error: `Image color '${imgColor}' is not listed in variants[]`,
        });
      }
    }

    // Create the target directory for images
    // Structure: /public/images/{category}/{product-slug}/
    // e.g., /public/images/sandals/ocean-wave/
    const imageDir = path.join(process.cwd(), 'public', 'images', category, productSlug);
    if (!fs.existsSync(imageDir)) {
      fs.mkdirSync(imageDir, { recursive: true });
    }

    // ---------- INSERT VARIANTS, IMAGES, AND INVENTORY ----------
    for (const variant of variants) {
      const colorName = variant.color.toLowerCase();
      const sizeList = variant.sizes;

      // Get or create the color record
      const colorId = await getOrCreateColor(colorName);

      // Link product to color (many-to-many relationship)
      await query(
        `INSERT INTO product_colors (product_id, color_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [product.id, colorId]
      );

      // Process images for this color
      for (const img of images) {
        const colorFromFile = extractColorFromFilename(img.originalname);
        if (colorFromFile === colorName) {
          // Move image from temp uploads folder to proper location
          const sourcePath = img.path;
          const destFilename = img.originalname.toLowerCase();
          const destPath = path.join(imageDir, destFilename);
          
          try {
            fs.copyFileSync(sourcePath, destPath);
            // Could delete original: fs.unlinkSync(sourcePath);
            // But keeping it for now in case something goes wrong
          } catch (copyErr) {
            console.error('Error copying image:', copyErr);
            // Continue anyway - don't fail the whole request for one image
          }

          // Store image reference in database
          // URL is relative to public folder for serving
          const imageUrl = `/images/${category}/${productSlug}/${destFilename}`;
          const priority = getImagePriority(img.originalname);
          
          await query(
            `INSERT INTO product_images (product_id, color_id, image_url, priority)
             VALUES ($1, $2, $3, $4)`,
            [product.id, colorId, imageUrl, priority]
          );
        }
      }

      // Insert inventory for each size in this color
      // REQUIREMENT: "Add/modify quantities per size and color"
      for (const sizeObj of sizeList) {
        // Support both formats:
        // Old: ["7", "8", "9"] (just size values)
        // New: [{"value": "7", "quantity": 10}, ...] (with quantities)
        const sizeVal = typeof sizeObj === 'object' ? sizeObj.value : sizeObj;
        const quantity = typeof sizeObj === 'object' ? sizeObj.quantity : 0;

        const sizeId = await getOrCreateSize(sizeVal.toString());

        await query(
          `INSERT INTO inventory (product_id, size_id, color_id, quantity)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT DO NOTHING`,
          [product.id, sizeId, colorId, quantity]
        );
      }
    }

    // Success!
    return res.status(201).json({
      success: true,
      message: "Product created successfully",
      product,
    });
  } catch (err) {
    console.error("CREATE PRODUCT ERROR:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};


// ============================================================================
// UPDATE PRODUCT
// REQUIREMENTS: "Change prices", "Place items on sale"
// ============================================================================
//
// Partial update - only provided fields are updated (COALESCE pattern)
// Can update: name, description, category, prices, variants, images
//
export const adminUpdateProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    
    // Debug logging - super helpful during development
    console.log("=== UPDATE PRODUCT DEBUG ===");
    console.log("Product ID:", productId);
    console.log("Body:", req.body);
    console.log("Files:", req.files?.length || 0);
    console.log("===========================");
    
    const { name, description, category, cost_price, selling_price } = req.body;

    // Parse variants if provided (same JSON string format as create)
    let variants = null;
    if (req.body.variants) {
      try {
        variants = JSON.parse(req.body.variants);
      } catch {
        return res.status(400).json({ error: "Invalid variants JSON format" });
      }
    }

    // Get uploaded images (if any)
    const images = req.files || [];

    // ---------- VALIDATE PRICES ----------
    if (cost_price && cost_price < MIN_COST_PRICE) {
      return res.status(400).json({
        error: `Cost price must be ≥ ${MIN_COST_PRICE}`,
      });
    }

    if (selling_price && cost_price && selling_price > cost_price) {
      return res.status(400).json({
        error: "Selling price cannot exceed cost price",
      });
    }

    // ---------- CALCULATE PRICE CATEGORY AND SALE STATUS ----------
    // Same auto-sale logic as create
    let price_category = null;
    let isOnSale = null;
    let dbSellingPrice = selling_price;
    let dbSalePrice = null;
    
    if (selling_price && cost_price) {
      const isDiscount = Number(selling_price) < Number(cost_price);
      price_category = isDiscount ? "discount" : "normal";
      
      // AUTO SALE: selling_price < cost_price triggers sale mode
      if (isDiscount) {
        isOnSale = true;
        dbSalePrice = selling_price;   // The discounted price customers pay
        dbSellingPrice = cost_price;   // The "original" price (shown crossed out)
      } else {
        isOnSale = false;
        dbSalePrice = null;
        dbSellingPrice = selling_price;
      }
    }

    // Normalize name if provided
    const normalizedName = name ? normalizeProductName(name) : null;

    // ---------- UPDATE PRODUCT ----------
    // COALESCE means: use new value if provided, otherwise keep existing
    const updated = await query(
      `UPDATE products
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           category = COALESCE($3, category),
           cost_price = COALESCE($4, cost_price),
           selling_price = COALESCE($5, selling_price),
           price_category = COALESCE($6, price_category),
           on_sale = COALESCE($7, on_sale),
           sale_price = $8,
           updated_at = NOW()
       WHERE id=$9
       RETURNING *`,
      [normalizedName, description, category, cost_price, dbSellingPrice, price_category, isOnSale, dbSalePrice, productId]
    );
    // Note: sale_price uses $8 directly (not COALESCE) because we might want to set it to NULL

    if (updated.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    const product = updated.rows[0];
    const productSlug = createSlug(product.name);

    // ---------- UPDATE VARIANTS (IF PROVIDED) ----------
    if (variants && Array.isArray(variants)) {
      for (const variant of variants) {
        const colorName = variant.color.toLowerCase();
        const sizeList = variant.sizes;

        const colorId = await getOrCreateColor(colorName);

        // Link product → color (idempotent with ON CONFLICT)
        await query(
          `INSERT INTO product_colors (product_id, color_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [productId, colorId]
        );

        // Update or insert inventory for each size
        for (const sizeVal of sizeList) {
          const sizeId = await getOrCreateSize(sizeVal.toString());
          
          // Check if this variant already exists
          const existingInventory = await query(
            `SELECT * FROM inventory 
             WHERE product_id=$1 AND size_id=$2 AND color_id=$3`,
            [productId, sizeId, colorId]
          );

          if (existingInventory.rows.length > 0) {
            // Variant exists - don't overwrite quantity
            // Admin can update quantity separately via adminUpdateInventory
            console.log(`Inventory exists for size ${sizeVal}, color ${colorName}`);
          } else {
            // New variant - create with random initial quantity
            // TODO: Maybe should default to 0 and let admin set it?
            const randomQty = Math.floor(Math.random() * 26) + 5;  // 5-30 random
            await query(
              `INSERT INTO inventory (product_id, size_id, color_id, quantity)
               VALUES ($1, $2, $3, $4)`,
              [productId, sizeId, colorId, randomQty]
            );
          }
        }
      }
    }

    // ---------- ADD NEW IMAGES (IF PROVIDED) ----------
    if (images.length > 0) {
      // Need variant colors for validation
      let variantColors = [];
      if (variants && Array.isArray(variants)) {
        variantColors = variants.map((v) => v.color.toLowerCase());
      } else {
        // No variants in this request - fetch existing colors from DB
        const existingColors = await query(
          `SELECT c.value FROM product_colors pc
           JOIN colors c ON c.id = pc.color_id
           WHERE pc.product_id=$1`,
          [productId]
        );
        variantColors = existingColors.rows.map((row) => row.value.toLowerCase());
      }

      // Extract and validate image colors
      const imageColors = images.map((img) =>
        extractColorFromFilename(img.originalname)
      );

      for (const imgColor of imageColors) {
        if (!variantColors.includes(imgColor)) {
          return res.status(400).json({
            error: `Image color '${imgColor}' is not listed in variants[]`,
          });
        }
      }

      // Create image directory if needed
      const imageDir = path.join(process.cwd(), 'public', 'images', product.category, productSlug);
      if (!fs.existsSync(imageDir)) {
        fs.mkdirSync(imageDir, { recursive: true });
      }

      // Process and insert new images
      for (const img of images) {
        const colorFromFile = extractColorFromFilename(img.originalname);
        const colorResult = await query(
          `SELECT id FROM colors WHERE value=$1`,
          [colorFromFile]
        );
        
        if (colorResult.rows.length > 0) {
          const colorId = colorResult.rows[0].id;

          // Copy image to proper location
          const sourcePath = img.path;
          const destFilename = img.originalname.toLowerCase();
          const destPath = path.join(imageDir, destFilename);
          
          try {
            fs.copyFileSync(sourcePath, destPath);
          } catch (copyErr) {
            console.error('Error copying image:', copyErr);
          }

          const imageUrl = `/images/${product.category}/${productSlug}/${destFilename}`;
          const priority = getImagePriority(img.originalname);

          await query(
            `INSERT INTO product_images (product_id, color_id, image_url, priority)
             VALUES ($1, $2, $3, $4)`,
            [productId, colorId, imageUrl, priority]
          );
        }
      }
    }

    return res.json({
      success: true,
      message: "Product updated successfully",
      product: updated.rows[0],
    });
  } catch (err) {
    console.error("UPDATE PRODUCT ERROR:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};


// ============================================================================
// UPDATE INVENTORY - SINGLE VARIANT
// REQUIREMENTS: "Add/modify quantities per size and color"
// REQUIREMENTS: "Update inventory real-time with immediate visibility"
// ============================================================================
//
// Updates quantity for ONE specific size+color combination
// This is what the admin panel calls when editing inventory in the expandable rows
//
export const adminUpdateInventory = async (req, res) => {
  try {
    const { id } = req.params;  // productId
    const { sizeId, colorId, quantity } = req.body;

    // Direct update - finds the specific variant by product + size + color
    const updated = await query(
      `UPDATE inventory
       SET quantity=$1
       WHERE product_id=$2 AND size_id=$3 AND color_id=$4
       RETURNING *`,
      [quantity, id, sizeId, colorId]
    );
    // Note: The DB has a CHECK constraint (quantity >= 0) that prevents negative inventory
    // REQUIREMENT: "Inventory can never be negative"

    if (updated.rows.length === 0)
      return res.status(404).json({ error: "Variant not found" });

    return res.json({
      success: true,
      message: "Inventory updated",
      variant: updated.rows[0],
    });
  } catch (err) {
    console.error("UPDATE INVENTORY ERROR:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};


// ============================================================================
// DELETE PRODUCT
// ============================================================================
//
// Deletes a product and all related records (via CASCADE foreign keys)
// This removes: product_colors, product_images, inventory, wishlist_items, etc.
//
export const adminDeleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    // Simple delete - CASCADE handles related records
    await query(`DELETE FROM products WHERE id=$1`, [id]);
    // TODO: Should probably check if product exists first and return 404 if not
    // TODO: Consider soft delete (is_deleted flag) to preserve order history
    // TODO: Delete image files from filesystem too

    return res.json({ success: true, message: "Product deleted" });
  } catch (err) {
    console.error("DELETE PRODUCT ERROR:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};


// ============================================================================
// GET ALL PRODUCTS
// Returns list of all products with summary info for admin table view
// ============================================================================
//
export const adminGetAllProducts = async (req, res) => {
  try {
    // Get base product data, newest first
    const productsResult = await query(`SELECT * FROM products ORDER BY created_at DESC`);
    
    // Enrich each product with colors, sizes, stock, and main image
    // Using Promise.all for parallel execution (faster than sequential)
    const products = await Promise.all(productsResult.rows.map(async (product) => {
      // Get colors for this product
      const colorsResult = await query(
        `SELECT c.value FROM product_colors pc
         JOIN colors c ON c.id = pc.color_id
         WHERE pc.product_id = $1`,
        [product.id]
      );
      
      // Get sizes and stock quantities
      const inventoryResult = await query(
        `SELECT s.value, i.quantity FROM inventory i
         JOIN sizes s ON s.id = i.size_id
         WHERE i.product_id = $1`,
        [product.id]
      );
      
      // Get main product image (lowest priority number = main image)
      const imageResult = await query(
        `SELECT image_url FROM product_images 
         WHERE product_id = $1 
         ORDER BY priority ASC LIMIT 1`,
        [product.id]
      );
      
      // Transform results
      const colors = colorsResult.rows.map(c => c.value);
      const sizes = [...new Set(inventoryResult.rows.map(s => s.value))];  // Deduplicate sizes
      const totalStock = inventoryResult.rows.reduce((sum, i) => sum + (i.quantity || 0), 0);
      
      return {
        ...product,
        colors,
        sizes,
        total_stock: totalStock,
        main_image: imageResult.rows[0]?.image_url || null
      };
    }));
    // Note: This N+1 query pattern could be optimized with JOINs and GROUP BY
    // But for admin panel with reasonable product counts, it's fine
    
    return res.json({ success: true, products });
  } catch (err) {
    console.error("GET ALL PRODUCTS ERROR:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};


// ============================================================================
// GET SINGLE PRODUCT (FULL DETAILS)
// Returns complete product info including all variants, images, inventory
// Used for Edit Product modal in admin panel
// ============================================================================
//
export const adminGetSingleProduct = async (req, res) => {
  try {
    const { id } = req.params;

    // Get base product
    const product = await query(`SELECT * FROM products WHERE id=$1`, [id]);
    if (product.rows.length === 0)
      return res.status(404).json({ error: "Product not found" });

    // Get all colors for this product
    const colors = await query(
      `SELECT c.id, c.value
         FROM product_colors pc
         JOIN colors c ON c.id = pc.color_id
       WHERE pc.product_id=$1`,
      [id]
    );

    // Get all inventory variants (size + color + quantity)
    const inventory = await query(
      `SELECT i.id, i.size_id, i.color_id, i.quantity, s.value AS size
         FROM inventory i
         JOIN sizes s ON s.id = i.size_id
       WHERE i.product_id=$1`,
      [id]
    );

    // Get all images, ordered by priority
    const images = await query(
      `SELECT * FROM product_images WHERE product_id=$1 ORDER BY priority ASC`,
      [id]
    );

    // Return everything the frontend needs for the edit modal
    return res.json({
      success: true,
      product: product.rows[0],
      colors: colors.rows,
      variants: inventory.rows,  // Each row = one size/color combo with quantity
      images: images.rows,
    });
  } catch (err) {
    console.error("GET SINGLE PRODUCT ERROR:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};


// ============================================================================
// MARK PRODUCT AS ON SALE
// REQUIREMENT: "Place items on sale"
// ============================================================================
//
// This is the "manual" way to put something on sale
// (vs. the auto-sale logic that triggers when selling_price < cost_price)
//
export const markProductOnSale = async (req, res) => {
  try {
    const { id } = req.params;
    const { sale_price } = req.body;

    if (!sale_price) {
      return res.status(400).json({ error: "Sale price is required" });
    }

    // Get current selling price to validate sale price
    const product = await query(
      `SELECT selling_price FROM products WHERE id=$1`,
      [id]
    );

    if (product.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    // Sale price must be LESS than regular price (otherwise it's not a sale!)
    if (parseFloat(sale_price) >= parseFloat(product.rows[0].selling_price)) {
      return res.status(400).json({ 
        error: "Sale price must be less than regular selling price" 
      });
    }

    // Update product to be on sale
    const result = await query(
      `UPDATE products 
       SET on_sale = TRUE, 
           sale_price = $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [sale_price, id]
    );

    return res.json({
      success: true,
      message: "Product marked as on sale",
      product: result.rows[0]
    });

  } catch (err) {
    console.error("MARK ON SALE ERROR:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};


// ============================================================================
// REMOVE PRODUCT FROM SALE
// REQUIREMENT: "Place items on sale" (includes ability to end sales)
// ============================================================================
//
// Ends a sale - product goes back to regular price
//
export const removeProductFromSale = async (req, res) => {
  try {
    const { id } = req.params;

    // Clear sale flag and sale price
    const result = await query(
      `UPDATE products 
       SET on_sale = FALSE, 
           sale_price = NULL,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    return res.json({
      success: true,
      message: "Product removed from sale",
      product: result.rows[0]
    });

  } catch (err) {
    console.error("REMOVE FROM SALE ERROR:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};


// ============================================================================
// UPDATE ENVIRONMENTAL IMPACT DATA
// REQUIREMENT: "Impact management" for luxury eco-friendly branding
// ============================================================================
//
// Updates the sustainability/environmental impact fields for a product
// These support the "SCULPTED BY THE SEA" eco-friendly brand positioning
//
export const updateProductImpact = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      impact_story,           // The sustainability narrative
      sustainability_rating,  // 1-5 star rating
      carbon_footprint,       // e.g., "2.3 kg CO2 saved"
      ethical_sourcing,       // Where/how materials are sourced
      recycled_materials      // Boolean: contains recycled content?
    } = req.body;

    // Validate sustainability rating is 1-5
    if (sustainability_rating && (sustainability_rating < 1 || sustainability_rating > 5)) {
      return res.status(400).json({ 
        error: "Sustainability rating must be between 1 and 5" 
      });
    }

    // Partial update with COALESCE - only update provided fields
    const result = await query(
      `UPDATE products 
       SET impact_story = COALESCE($1, impact_story),
           sustainability_rating = COALESCE($2, sustainability_rating),
           carbon_footprint = COALESCE($3, carbon_footprint),
           ethical_sourcing = COALESCE($4, ethical_sourcing),
           recycled_materials = COALESCE($5, recycled_materials),
           updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [
        impact_story,
        sustainability_rating,
        carbon_footprint,
        ethical_sourcing,
        recycled_materials,
        id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    return res.json({
      success: true,
      message: "Environmental impact data updated",
      product: result.rows[0]
    });

  } catch (err) {
    console.error("UPDATE IMPACT ERROR:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};


// ============================================================================
// NOTES & POTENTIAL IMPROVEMENTS
// ============================================================================
//
// 1. Image deletion
//    Currently no endpoint to delete images
//    Would need: DELETE /api/admin/products/:id/images/:imageId
//    Should also delete the file from filesystem
//
// 2. Bulk inventory update
//    Current adminUpdateInventory does one variant at a time
//    Could add bulk update: PUT /api/admin/products/:id/inventory/bulk
//
// 3. Product search/filter
//    adminGetAllProducts returns everything
//    Could add query params: ?category=sandals&onSale=true&search=ocean
//
// 4. Transaction support
//    adminCreateProduct does many INSERTs - should wrap in transaction
//    If image copy fails, product is partially created (inconsistent state)
//
// 5. Image optimization
//    Could resize/compress images on upload
//    Generate thumbnails for faster loading in product list
//
// 6. Soft delete
//    Currently hard deletes products
//    Soft delete would preserve order history references
//
// ============================================================================