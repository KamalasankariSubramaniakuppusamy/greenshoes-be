import { query } from "../db/db.js";
import fs from "fs";
import path from "path";

const MIN_COST_PRICE = 1999;
const SHIPPING_FEE = 11.95; //flat shipping fee for all products according to the requirmetns doc.

// ----------------------------------------------
// Helper: Extract color from filename
// ----------------------------------------------
function extractColorFromFilename(filename) {
  const parts = filename.toLowerCase().split("-");
  // tiara-black-side.png → ["tiara", "black", "side.png"]
  return parts.length >= 2 ? parts[1].trim() : null;
}

// ----------------------------------------------
// Helper: Normalize product name
// ----------------------------------------------
function normalizeProductName(name) {
  return name
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ----------------------------------------------
// DB Helper: Insert or fetch color
// ----------------------------------------------
async function getOrCreateColor(value) {
  const existing = await query(`SELECT id FROM colors WHERE value=$1`, [value]);
  if (existing.rows.length > 0) return existing.rows[0].id;

  const result = await query(
    `INSERT INTO colors (value) VALUES ($1) RETURNING id`,
    [value]
  );
  return result.rows[0].id;
}

// ----------------------------------------------
// DB Helper: Insert or fetch size
// ----------------------------------------------
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

//
// ============================================================
//  CREATE PRODUCT 
// ============================================================
//
export const adminCreateProduct = async (req, res) => {
  try {
    const { name, description, category, cost_price, selling_price } = req.body;

    // Variants sent as JSON text (Postman form-data)
    let variants;
    try {
      variants = JSON.parse(req.body.variants);
    } catch {
      return res.status(400).json({ error: "Invalid variants JSON format" });
    }

    // Multer may populate `req.files` as an array (upload.array)
    // or an object mapping fieldName→array (upload.fields). Normalize
    // to a single array of file objects for the controller logic.
    let images = [];
    if (!req.files) images = [];
    else if (Array.isArray(req.files)) images = req.files;
    else images = Object.values(req.files).flat();

    // ----------------------
    // Validate Required Fields
    // ----------------------
    if (
      !name ||
      !description ||
      !category ||
      !cost_price ||
      !selling_price ||
      !Array.isArray(variants)
    ) {
      console.log("VALIDATION FAILED:");
      console.log("name:", !!name, name);
      console.log("description:", !!description, description);
      console.log("category:", !!category, category);
      console.log("cost_price:", !!cost_price, cost_price);
      console.log("selling_price:", !!selling_price, selling_price);
      console.log("variants is array:", Array.isArray(variants));
      return res.status(400).json({ error: "Missing fields" });
    }

    if (cost_price < MIN_COST_PRICE) {
      return res.status(400).json({
        error: `Cost price must be at least $${MIN_COST_PRICE}`,
      });
    }

    if (selling_price > cost_price) {
      return res.status(400).json({
        error: "Selling price cannot be greater than cost price",
      });
    }

    // Determine price category (YOUR LOGIC - KEPT)
    const price_category =
      Number(selling_price) < Number(cost_price) ? "discount" : "normal";

    const normalizedName = normalizeProductName(name);

    // ----------------------
    // Insert Product
    // ----------------------
    const productResult = await query(
      `INSERT INTO products 
         (name, description, category, cost_price, selling_price, price_category)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        normalizedName,
        description,
        category,
        cost_price,
        selling_price,
        price_category,
      ]
    );

    const product = productResult.rows[0];

    // ----------------------
    // Process Variants + Images
    // ----------------------

    // Collect colors from variants
    const variantColors = variants.map((v) => v.color.toLowerCase());

    // Extract colors from images
    const imageColors = images.map((img) =>
      extractColorFromFilename(img.originalname)
    );

    // Validate: every image color must exist in variants
    for (const imgColor of imageColors) {
      if (!variantColors.includes(imgColor)) {
        return res.status(400).json({
          error: `Image color '${imgColor}' is not listed in variants[]`,
        });
      }
    }

    // Now insert everything
    for (const variant of variants) {
      const colorName = variant.color.toLowerCase();
      const sizeList = variant.sizes;

      const colorId = await getOrCreateColor(colorName);

      // Link product → color
      await query(
        `INSERT INTO product_colors (product_id, color_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [product.id, colorId]
      );

      // Insert images for this color
      for (const img of images) {
        const colorFromFile = extractColorFromFilename(img.originalname);
        if (colorFromFile === colorName) {
          await query(
            `INSERT INTO product_images (product_id, color_id, image_url)
             VALUES ($1, $2, $3)`,
            [product.id, colorId, `/images/${img.filename}`]
          );
        }
      }

      // Insert inventory with admin-provided quantities
      for (const sizeObj of sizeList) {
        // Support both old format (just string) and new format (object with quantity)
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

//
// ============================================================
// UPDATE PRODUCT
// ============================================================
//
export const adminUpdateProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    
    console.log("=== UPDATE PRODUCT DEBUG ===");
    console.log("Product ID:", productId);
    console.log("Body:", req.body);
    console.log("Files:", req.files?.length || 0);
    console.log("===========================");
    
    const { name, description, category, cost_price, selling_price } = req.body;

    // Parse variants if provided
    let variants = null;
    if (req.body.variants) {
      try {
        variants = JSON.parse(req.body.variants);
      } catch {
        return res.status(400).json({ error: "Invalid variants JSON format" });
      }
    }

    // Get uploaded images
    const images = req.files || [];

    // Validate prices if provided
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

    // Update price category if prices are being updated
    let price_category = null;
    if (selling_price && cost_price) {
      price_category = Number(selling_price) < Number(cost_price) ? "discount" : "normal";
    }

    // Normalize name if provided
    const normalizedName = name ? normalizeProductName(name) : null;

    // Update basic product info
    const updated = await query(
      `UPDATE products
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           category = COALESCE($3, category),
           cost_price = COALESCE($4, cost_price),
           selling_price = COALESCE($5, selling_price),
           price_category = COALESCE($6, price_category),
           updated_at = NOW()
       WHERE id=$7
       RETURNING *`,
      [normalizedName, description, category, cost_price, selling_price, price_category, productId]
    );

    if (updated.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    // If variants are provided, update colors and inventory
    if (variants && Array.isArray(variants)) {
      for (const variant of variants) {
        const colorName = variant.color.toLowerCase();
        const sizeList = variant.sizes;

        const colorId = await getOrCreateColor(colorName);

        // Link product → color (if not already linked)
        await query(
          `INSERT INTO product_colors (product_id, color_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [productId, colorId]
        );

        // Update or insert inventory for each size
        for (const sizeVal of sizeList) {
          const sizeId = await getOrCreateSize(sizeVal.toString());
          
          // Check if inventory exists
          const existingInventory = await query(
            `SELECT * FROM inventory 
             WHERE product_id=$1 AND size_id=$2 AND color_id=$3`,
            [productId, sizeId, colorId]
          );

          if (existingInventory.rows.length > 0) {
            // Inventory exists, keep existing quantity
            console.log(`Inventory exists for size ${sizeVal}, color ${colorName}`);
          } else {
            // Insert new inventory
            const randomQty = Math.floor(Math.random() * 26) + 5;
            await query(
              `INSERT INTO inventory (product_id, size_id, color_id, quantity)
               VALUES ($1, $2, $3, $4)`,
              [productId, sizeId, colorId, randomQty]
            );
          }
        }
      }
    }

    // If images are provided, add them
    if (images.length > 0) {
      // Get variant colors to validate images
      let variantColors = [];
      if (variants && Array.isArray(variants)) {
        variantColors = variants.map((v) => v.color.toLowerCase());
      } else {
        // If no variants provided, get existing colors from DB
        const existingColors = await query(
          `SELECT c.value FROM product_colors pc
           JOIN colors c ON c.id = pc.color_id
           WHERE pc.product_id=$1`,
          [productId]
        );
        variantColors = existingColors.rows.map((row) => row.value.toLowerCase());
      }

      // Extract colors from images
      const imageColors = images.map((img) =>
        extractColorFromFilename(img.originalname)
      );

      // Validate: every image color must exist in variants
      for (const imgColor of imageColors) {
        if (!variantColors.includes(imgColor)) {
          return res.status(400).json({
            error: `Image color '${imgColor}' is not listed in variants[]`,
          });
        }
      }

      // Insert new images
      for (const img of images) {
        const colorFromFile = extractColorFromFilename(img.originalname);
        const colorResult = await query(
          `SELECT id FROM colors WHERE value=$1`,
          [colorFromFile]
        );
        
        if (colorResult.rows.length > 0) {
          const colorId = colorResult.rows[0].id;
          await query(
            `INSERT INTO product_images (product_id, color_id, image_url)
             VALUES ($1, $2, $3)`,
            [productId, colorId, `/images/${img.filename}`]
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

//
// ============================================================
// UPDATE INVENTORY — ONE COLOR + ONE SIZE
// ============================================================
//
export const adminUpdateInventory = async (req, res) => {
  try {
    const { id } = req.params; // productId
    const { sizeId, colorId, quantity } = req.body;

    const updated = await query(
      `UPDATE inventory
       SET quantity=$1
       WHERE product_id=$2 AND size_id=$3 AND color_id=$4
       RETURNING *`,
      [quantity, id, sizeId, colorId]
    );

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

//
// ============================================================
// DELETE PRODUCT
// ============================================================
//
export const adminDeleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    await query(`DELETE FROM products WHERE id=$1`, [id]);

    return res.json({ success: true, message: "Product deleted" });
  } catch (err) {
    console.error("DELETE PRODUCT ERROR:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

//
// ============================================================
// GET ALL PRODUCTS
// ============================================================
//
export const adminGetAllProducts = async (req, res) => {
  try {
    const result = await query(`SELECT * FROM products ORDER BY created_at DESC`);
    return res.json({ success: true, products: result.rows });
  } catch (err) {
    console.error("GET ALL PRODUCTS ERROR:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

//
// ============================================================
// GET SINGLE PRODUCT (FULL VARIANT DETAILS)
// ============================================================
//
export const adminGetSingleProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await query(`SELECT * FROM products WHERE id=$1`, [id]);
    if (product.rows.length === 0)
      return res.status(404).json({ error: "Product not found" });

    const colors = await query(
      `SELECT c.id, c.value
         FROM product_colors pc
         JOIN colors c ON c.id = pc.color_id
       WHERE pc.product_id=$1`,
      [id]
    );

    const inventory = await query(
      `SELECT i.id, i.size_id, i.color_id, i.quantity, s.value AS size
         FROM inventory i
         JOIN sizes s ON s.id = i.size_id
       WHERE i.product_id=$1`,
      [id]
    );

    const images = await query(
      `SELECT * FROM product_images WHERE product_id=$1 ORDER BY priority ASC`,
      [id]
    );

    return res.json({
      success: true,
      product: product.rows[0],
      colors: colors.rows,
      variants: inventory.rows,
      images: images.rows,
    });
  } catch (err) {
    console.error("GET SINGLE PRODUCT ERROR:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

//
// ============================================================
// MARK PRODUCT AS ON SALE (NEW - HYBRID APPROACH)
// ============================================================
//
export const markProductOnSale = async (req, res) => {
  try {
    const { id } = req.params;
    const { sale_price } = req.body;

    if (!sale_price) {
      return res.status(400).json({ error: "Sale price is required" });
    }

    // Get current product
    const product = await query(
      `SELECT selling_price FROM products WHERE id=$1`,
      [id]
    );

    if (product.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    // Validate sale price is less than selling price
    if (parseFloat(sale_price) >= parseFloat(product.rows[0].selling_price)) {
      return res.status(400).json({ 
        error: "Sale price must be less than regular selling price" 
      });
    }

    // Mark as on sale
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

//
// ============================================================
// REMOVE PRODUCT FROM SALE (NEW - HYBRID APPROACH)
// ============================================================
//
export const removeProductFromSale = async (req, res) => {
  try {
    const { id } = req.params;

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

//
// ============================================================
// UPDATE ENVIRONMENTAL IMPACT DATA (NEW)
// ============================================================
//
export const updateProductImpact = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      impact_story,
      sustainability_rating,
      carbon_footprint,
      ethical_sourcing,
      recycled_materials
    } = req.body;

    // Validate sustainability rating
    if (sustainability_rating && (sustainability_rating < 1 || sustainability_rating > 5)) {
      return res.status(400).json({ 
        error: "Sustainability rating must be between 1 and 5" 
      });
    }

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