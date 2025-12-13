// ============================================================================
// CatalogController.js
// Developer: Kamalasankari Subramaniakuppusamy
// ============================================================================
//
// Public product catalog controller - customer-facing product browsing
// No authentication required - anyone can browse products
//
// REQUIREMENTS COVERED:
// - "Display color/size options with multiple images"
// - "Place items on sale" (is_discount calculated from prices)
// - "Update inventory real-time" (stock status from current inventory)
// - Stock status badges (in_stock, running_out, out_of_stock)
//
// NOTE: This is a simpler version of catalogController.js
// - catalogController.js has filtering, sorting, search, stock alerts
// - This one returns the full catalog with all variant data
// Use whichever fits your frontend needs better
//
// ROUTES THAT USE THIS:
// - GET /api/catalog           -> getCatalog (full product listing)
// - GET /api/catalog/:id       -> getSingleProduct (product detail page)
//
// ============================================================================

import { query } from "../db/db.js";


// ============================================================================
// GET FULL PRODUCT CATALOG
// Returns all products with their images, colors, sizes, and stock status
// ============================================================================
//
// This endpoint returns EVERYTHING for each product:
// - Main image (highest priority)
// - Full image gallery
// - All available colors
// - All sizes with stock quantities per color
// - Overall stock status for badge display
//
// Good for: Product listing pages, category pages
// Tradeoff: Returns a lot of data - might be slow with many products
//
export const getCatalog = async (req, res) => {
  try {
    // ---------- FETCH ALL PRODUCTS ----------
    // Basic product info with discount calculation
    // is_discount = true when selling below cost (clearance item)
    const products = await query(`
      SELECT 
        p.id,
        p.name,
        p.category,
        p.selling_price,
        p.cost_price,
        p.selling_price < p.cost_price AS is_discount,
        p.tax_percent
      FROM products p
      ORDER BY p.created_at DESC
    `);
    // ORDER BY created_at DESC = newest products first

    // ---------- ENHANCE EACH PRODUCT WITH DETAILS ----------
    // For each product, fetch images, colors, sizes, and calculate stock status
    const finalOutput = [];

    for (const product of products.rows) {
      // Get main product image (lowest priority number = main image)
      // Used for product cards in the listing grid
      const mainImage = await query(`
        SELECT image_url 
        FROM product_images 
        WHERE product_id=$1 
        ORDER BY priority ASC LIMIT 1
      `, [product.id]);

      // Get all images for the gallery/carousel
      // REQUIREMENT: "Display color/size options with multiple images"
      const gallery = await query(`
        SELECT image_url, color_id 
        FROM product_images 
        WHERE product_id=$1
        ORDER BY priority ASC
      `, [product.id]);
      // color_id lets frontend filter images when user selects a color

      // Get all available colors for this product
      const colors = await query(`
        SELECT c.id, c.value
        FROM product_colors pc
        JOIN colors c ON c.id = pc.color_id
        WHERE pc.product_id=$1
      `, [product.id]);

      // Get all sizes with stock quantities
      // Grouped by color so frontend can show "Size 8 in Blue: 5 left"
      const sizes = await query(`
        SELECT 
          i.color_id, 
          s.id AS size_id, 
          s.value AS size_value, 
          i.quantity,
          i.id AS inventory_id
        FROM inventory i
        JOIN sizes s ON s.id = i.size_id
        WHERE i.product_id=$1
        ORDER BY s.value::float
      `, [product.id]);
      // ORDER BY s.value::float sorts sizes numerically (7, 8, 9, 10)
      // not alphabetically (10, 7, 8, 9)
      // inventory_id is included for add-to-cart functionality

      // ---------- CALCULATE STOCK STATUS ----------
      // Used for badges: "In Stock", "Running Out!", "Out of Stock"
      // REQUIREMENT: Real-time inventory visibility
      const totalQty = sizes.rows.reduce((sum, v) => sum + v.quantity, 0);

      let status = "in_stock";
      if (totalQty === 0) status = "out_of_stock";
      else if (totalQty < 10) status = "running_out";  // Creates urgency!

      // Build the final product object with all data
      finalOutput.push({
        ...product,
        status,
        main_image: mainImage.rows[0]?.image_url || null,
        gallery: gallery.rows,
        colors: colors.rows,
        sizes: sizes.rows
      });
    }
    // Note: This is an N+1 query pattern (4 queries per product)
    // For large catalogs, consider optimizing with JOINs and array_agg()
    // But for small-medium catalogs (<100 products), this is fine

    return res.json({
      success: true,
      products: finalOutput
    });

  } catch (err) {
    console.error("CATALOG ERROR:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};


// ============================================================================
// GET SINGLE PRODUCT PAGE DATA
// Returns complete details for one product (Product Detail Page)
// ============================================================================
//
// Called when customer clicks on a product to see full details
// Returns everything needed for the PDP:
// - Full product info (name, description, prices, etc.)
// - Stock status
// - All colors
// - All images (for gallery/carousel)
// - All sizes with per-color stock quantities
//
// REQUIREMENT: "Display color/size options with multiple images"
//
export const getSingleProduct = async (req, res) => {
  try {
    const { id } = req.params;

    // ---------- FETCH PRODUCT WITH STOCK STATUS ----------
    // Single query that calculates overall stock status
    // Using LEFT JOIN + GROUP BY to aggregate inventory quantities
    const product = await query(`
      SELECT 
        p.*,
        CASE 
          WHEN COALESCE(SUM(inv.quantity), 0) = 0 THEN 'out_of_stock'
          WHEN COALESCE(SUM(inv.quantity), 0) < 10 THEN 'running_out'
          ELSE 'in_stock'
        END as status
      FROM products p
      LEFT JOIN inventory inv ON inv.product_id = p.id
      WHERE p.id = $1
      GROUP BY p.id
    `, [id]);
    // COALESCE handles products with no inventory rows (returns 0)
    // GROUP BY p.id needed because of the aggregate SUM()
    // p.* works because p.id is in GROUP BY (PostgreSQL knows other cols are functionally dependent)

    if (product.rows.length === 0)
      return res.status(404).json({ error: "Product not found" });

    // ---------- FETCH COLORS ----------
    // All colors this product comes in
    const colors = await query(`
      SELECT c.id, c.value
      FROM product_colors pc
      JOIN colors c ON c.id = pc.color_id
      WHERE pc.product_id=$1
    `, [id]);

    // ---------- FETCH IMAGES ----------
    // All product images for the gallery
    // color_id allows frontend to filter images by selected color
    const images = await query(`
      SELECT image_url, color_id, priority
      FROM product_images
      WHERE product_id=$1
      ORDER BY priority ASC
    `, [id]);
    // priority ASC = main images first, detail shots last

    // ---------- FETCH SIZES WITH INVENTORY ----------
    // Every size/color combination with current stock
    // Frontend uses this to:
    // - Show available sizes for selected color
    // - Disable out-of-stock sizes
    // - Show "Only 3 left!" warnings
    const sizes = await query(`
      SELECT 
        i.color_id, 
        s.id AS size_id, 
        s.value AS size_value, 
        i.quantity,
        i.id AS inventory_id
      FROM inventory i
      JOIN sizes s ON s.id = i.size_id
      WHERE i.product_id=$1
      ORDER BY s.value::float
    `, [id]);
    // inventory_id is needed for add-to-cart (identifies exact variant)

    return res.json({
      success: true,
      product: product.rows[0],
      colors: colors.rows,
      images: images.rows,
      sizes: sizes.rows  // Full inventory matrix
    });

  } catch (err) {
    console.error("SINGLE PRODUCT ERROR:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};


// ============================================================================
// NOTES & POTENTIAL IMPROVEMENTS
// ============================================================================
//
// 1. Query Optimization
//    Current: 4 queries per product in getCatalog (N+1 pattern)
//    Better: Single query with JOINs and array_agg() for colors/sizes/images
//    Example:
//      SELECT p.*, 
//             array_agg(DISTINCT c.value) as colors,
//             array_agg(DISTINCT s.value) as sizes
//      FROM products p
//      LEFT JOIN product_colors pc ON ...
//      GROUP BY p.id
//
// 2. Pagination
//    Currently returns ALL products
//    Should add: ?page=1&limit=20
//    Returns: { products, total, page, pages }
//
// 3. Filtering
//    Consider adding query params:
//    - ?category=sandals
//    - ?minPrice=50&maxPrice=100
//    - ?inStock=true
//    (catalogController.js already has this - consider using that instead)
//
// 4. Caching
//    Product catalog doesn't change often
//    Could cache for 5-10 minutes (Redis or in-memory)
//    Invalidate when products are updated
//
// 5. Sale Price Support
//    Currently only has is_discount flag
//    Could add on_sale, sale_price, discount_percentage like catalogController
//
// 6. Related Products
//    getSingleProduct could return related products
//    "You might also like..." based on category
//
// ============================================================================