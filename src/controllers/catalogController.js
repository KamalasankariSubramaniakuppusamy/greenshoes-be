// ============================================================================
// catalogController.js
// Developer: GreenShoes Team
// ============================================================================
//
// Public catalog controller - customer-facing product browsing
// No authentication required - anyone can browse the catalog
//
// REQUIREMENTS COVERED:
// - "Display color/size options with multiple images"
// - "Place items on sale" (sale items emphasized, shown first)
// - "Impact management" (environmental_impact in product details)
// - "Inventory can never be negative" (stock status alerts)
// - "Update inventory real-time" (live stock counts in responses)
//
// KEY FEATURES:
// - Dynamic filtering (category, search, price range, on sale)
// - Sorting options (date, name, price)
// - Sale items prioritized by default
// - Per-variant stock alerts ("Only 3 left in Blue Size 8!")
// - Environmental impact storytelling for eco-friendly branding
//
// ROUTES THAT USE THIS:
// - GET /api/products           → getFullCatalog
// - GET /api/products/:productId → getProductById
//
// ============================================================================

import { query } from "../db/db.js";


// ============================================================================
// GET FULL CATALOG
// Main product listing with search, filters, and stock alerts
// ============================================================================
//
// Query Parameters:
// - category: Filter by product category (e.g., "sandals", "sneakers")
// - search: Search in name and description (case-insensitive)
// - minPrice: Minimum price filter (uses effective price - sale or regular)
// - maxPrice: Maximum price filter
// - onSale: If 'true', only show items currently on sale
// - sortBy: 'created_at' (default), 'name', or 'selling_price'
// - sortOrder: 'ASC' or 'DESC' (default)
//
// Special behavior: When no sortBy specified, sale items appear FIRST
// This emphasizes discounts and helps move sale inventory
//
export const getFullCatalog = async (req, res) => {
  try {
    // ---------- EXTRACT QUERY PARAMETERS ----------
    const {
      category,
      search,
      minPrice,
      maxPrice,
      onSale,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = req.query;

    // ---------- BUILD DYNAMIC SQL QUERY ----------
    // This query does a LOT of work in one go:
    // - Joins products with inventory for stock status
    // - Calculates effective price (sale or regular)
    // - Calculates discount percentage for sale items
    // - Gets main product image
    // - Determines overall stock status (out_of_stock, running_out, in_stock)
    let queryText = `
      SELECT DISTINCT
        p.id,
        p.name,
        p.description,
        p.category,
        p.cost_price,
        p.selling_price,
        p.on_sale,
        p.sale_price,
        p.price_category,
        p.tax_percent,
        p.created_at,
        (SELECT image_url FROM product_images 
         WHERE product_id = p.id 
         ORDER BY priority ASC 
         LIMIT 1) as main_image,
        CASE 
          WHEN SUM(inv.quantity) = 0 THEN 'out_of_stock'
          WHEN SUM(inv.quantity) < 10 THEN 'running_out'
          ELSE 'in_stock'
        END as status,
        CASE 
          WHEN p.on_sale = TRUE AND p.sale_price IS NOT NULL 
          THEN p.sale_price 
          ELSE p.selling_price 
        END as effective_price,
        CASE 
          WHEN p.on_sale = TRUE AND p.sale_price IS NOT NULL 
          THEN ROUND(((p.selling_price - p.sale_price) / p.selling_price) * 100)
          ELSE NULL
        END as discount_percentage
      FROM products p
      LEFT JOIN inventory inv ON inv.product_id = p.id
      WHERE 1=1
    `;
    // Note: "WHERE 1=1" is a common pattern for dynamic query building
    // It lets us append "AND ..." clauses without checking if WHERE exists

    // Dynamic parameter handling for prepared statements
    const params = [];
    let paramIndex = 1;

    // ---------- APPLY FILTERS ----------

    // Filter by category (exact match)
    if (category) {
      queryText += ` AND p.category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    // Search by name OR description (case-insensitive with ILIKE)
    // ILIKE is PostgreSQL's case-insensitive LIKE
    if (search) {
      queryText += ` AND (p.name ILIKE $${paramIndex} OR p.description ILIKE $${paramIndex})`;
      params.push(`%${search}%`);  // % wildcards for partial match
      paramIndex++;
    }

    // Price range filters
    // Uses COALESCE to compare against effective price (sale_price if on sale, else selling_price)
    if (minPrice) {
      queryText += ` AND COALESCE(p.sale_price, p.selling_price) >= $${paramIndex}`;
      params.push(parseFloat(minPrice));
      paramIndex++;
    }

    if (maxPrice) {
      queryText += ` AND COALESCE(p.sale_price, p.selling_price) <= $${paramIndex}`;
      params.push(parseFloat(maxPrice));
      paramIndex++;
    }

    // Filter to show only sale items
    // REQUIREMENT: "Place items on sale" - customers can filter to see deals
    if (onSale === 'true') {
      queryText += ` AND p.on_sale = TRUE`;
    }

    // GROUP BY needed because we're using SUM(inv.quantity) in SELECT
    queryText += ` GROUP BY p.id`;

    // ---------- APPLY SORTING ----------
    // Whitelist allowed sort fields to prevent SQL injection
    const allowedSortFields = ['created_at', 'name', 'selling_price'];
    const allowedSortOrders = ['ASC', 'DESC'];
    
    const finalSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';
    const finalSortOrder = allowedSortOrders.includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';

    // Special handling for price sort - use effective_price (respects sale prices)
    if (finalSortBy === 'selling_price') {
      queryText += ` ORDER BY effective_price ${finalSortOrder}`;
    } else {
      queryText += ` ORDER BY p.${finalSortBy} ${finalSortOrder}`;
    }

    // ---------- DEFAULT: SALE ITEMS FIRST ----------
    // When no explicit sortBy is requested, show sale items at the top
    // This helps promote deals and move sale inventory
    // We wrap the entire query and re-sort by on_sale DESC
    if (!req.query.sortBy) {
      queryText = `
        SELECT * FROM (${queryText}) as sorted_products
        ORDER BY on_sale DESC, created_at DESC
      `;
    }

    // Execute the main product query
    const products = await query(queryText, params);

    // ---------- ENHANCE EACH PRODUCT WITH ADDITIONAL DATA ----------
    // For each product, fetch colors, sizes, images, and stock alerts
    // Yes, this is N+1 queries - could optimize but readability > performance here
    const catalog = [];

    for (const p of products.rows) {
      // Get all available colors for this product
      const colors = await query(
        `SELECT c.id, c.value 
         FROM product_colors pc
         JOIN colors c ON c.id = pc.color_id
         WHERE pc.product_id=$1`,
        [p.id]
      );

      // Get all images (multiple angles/views per product)
      // REQUIREMENT: "Display color/size options with multiple images"
      const images = await query(
        `SELECT image_url, color_id, priority
         FROM product_images
         WHERE product_id=$1
         ORDER BY priority ASC`,
        [p.id]
      );

      // Get available sizes (only those with stock > 0)
      // This prevents showing "Size 12" when it's actually sold out
      const sizes = await query(
        `SELECT DISTINCT s.value, s.id
         FROM inventory i
         JOIN sizes s ON s.id = i.size_id
         WHERE i.product_id=$1 AND i.quantity > 0
         ORDER BY s.value`,
        [p.id]
      );

      // ---------- BUILD STOCK ALERTS ----------
      // This is a nice UX feature - shows "Only 3 left!" type messages
      // Creates urgency and helps customers know what's running low
      
      // Get per-variant stock status
      const variantStock = await query(
        `SELECT 
          c.value as color,
          s.value as size,
          i.quantity,
          CASE 
            WHEN i.quantity = 0 THEN 'out_of_stock'
            WHEN i.quantity < 10 THEN 'running_out'
            ELSE 'in_stock'
          END as variant_status
         FROM inventory i
         JOIN colors c ON c.id = i.color_id
         JOIN sizes s ON s.id = i.size_id
         WHERE i.product_id = $1
         ORDER BY c.value, s.value::float`,
        [p.id]
      );
      // Note: s.value::float sorts sizes numerically (7, 8, 9) not alphabetically (10, 7, 8, 9)

      // Categorize variants by stock status
      const stockAlerts = [];
      const runningOutVariants = [];
      const outOfStockVariants = [];

      for (const variant of variantStock.rows) {
        if (variant.variant_status === 'out_of_stock') {
          outOfStockVariants.push({
            color: variant.color,
            size: variant.size,
            quantity: variant.quantity
          });
        } else if (variant.variant_status === 'running_out') {
          runningOutVariants.push({
            color: variant.color,
            size: variant.size,
            quantity: variant.quantity
          });
        }
      }

      // Create human-readable alert messages
      // If only 1-2 variants affected, list them specifically
      // If many variants affected, just show a count
      if (outOfStockVariants.length > 0) {
        if (outOfStockVariants.length <= 2) {
          // Specific messages: "Blue Size 8 - Out of Stock"
          outOfStockVariants.forEach(v => {
            stockAlerts.push({
              type: 'out_of_stock',
              message: `${v.color} Size ${v.size} - Out of Stock`,
              color: v.color,
              size: v.size
            });
          });
        } else {
          // Summary message: "5 variants out of stock"
          stockAlerts.push({
            type: 'out_of_stock',
            message: `${outOfStockVariants.length} variants out of stock`,
            variants: outOfStockVariants
          });
        }
      }

      // "Running out" alerts - creates urgency!
      // "Only 3 left in Blue Size 8!"
      if (runningOutVariants.length > 0) {
        if (runningOutVariants.length <= 2) {
          runningOutVariants.forEach(v => {
            stockAlerts.push({
              type: 'running_out',
              message: `${v.color} Size ${v.size} - Only ${v.quantity} left`,
              color: v.color,
              size: v.size,
              quantity: v.quantity
            });
          });
        } else {
          stockAlerts.push({
            type: 'running_out',
            message: `${runningOutVariants.length} variants running out`,
            variants: runningOutVariants
          });
        }
      }

      // Build the final product object for the catalog
      catalog.push({
        ...p,
        colors: colors.rows,
        sizes: sizes.rows,
        images: images.rows,
        stock_alerts: stockAlerts,
        variants_running_out: runningOutVariants.length,
        variants_out_of_stock: outOfStockVariants.length
      });
    }

    // Return catalog with applied filters info
    // Frontend can use filters_applied to show active filter badges
    return res.json({
      success: true,
      products: catalog,
      filters_applied: {
        category: category || null,
        search: search || null,
        minPrice: minPrice || null,
        maxPrice: maxPrice || null,
        onSale: onSale === 'true' || false
      }
    });

  } catch (err) {
    console.error("CATALOG ERROR:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};


// ============================================================================
// GET SINGLE PRODUCT BY ID
// Full product details for Product Detail Page (PDP)
// ============================================================================
//
// Returns everything needed for the product page:
// - Product info with pricing (including sale calculations)
// - All colors with their thumbnail images
// - All product images from multiple angles
// - Full inventory matrix (every color/size combo with stock)
// - Environmental impact story (for eco-friendly branding)
//
// REQUIREMENTS:
// - "Display color/size options with multiple images"
// - "Impact management" (environmental storytelling)
//
export const getProductById = async (req, res) => {
  try {
    const { productId } = req.params;

    // ---------- GET PRODUCT WITH PRICE CALCULATIONS ----------
    // Calculates effective_price and discount_percentage in SQL
    // So frontend doesn't have to do the math
    const product = await query(
      `SELECT 
        p.*,
        CASE 
          WHEN p.on_sale = TRUE AND p.sale_price IS NOT NULL 
          THEN p.sale_price 
          ELSE p.selling_price 
        END as effective_price,
        CASE 
          WHEN p.on_sale = TRUE AND p.sale_price IS NOT NULL 
          THEN ROUND(((p.selling_price - p.sale_price) / p.selling_price) * 100)
          ELSE NULL
        END as discount_percentage
       FROM products p
       WHERE p.id = $1`,
      [productId]
    );

    if (product.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    const productData = product.rows[0];

    // ---------- GET COLORS WITH SWATCH IMAGES ----------
    // Each color gets a thumbnail image for the color selector
    // Subquery grabs the first image for each color variant
    const colors = await query(
      `SELECT DISTINCT 
        c.id,
        c.value,
        (SELECT image_url FROM product_images 
         WHERE product_id = $1 AND color_id = c.id 
         ORDER BY priority LIMIT 1) as color_image
       FROM colors c
       JOIN product_colors pc ON pc.color_id = c.id
       WHERE pc.product_id = $1
       ORDER BY c.value`,
      [productId]
    );

    // ---------- GET ALL PRODUCT IMAGES ----------
    // REQUIREMENT: "Display color/size options with multiple images"
    // Multiple photos from different angles and colors
    // Ordered by priority (model shots first) then by color
    const images = await query(
      `SELECT 
        pi.id,
        pi.image_url,
        pi.alt_text,
        pi.priority,
        c.value as color_name,
        c.id as color_id
       FROM product_images pi
       LEFT JOIN colors c ON c.id = pi.color_id
       WHERE pi.product_id = $1
       ORDER BY pi.priority ASC, c.value`,
      [productId]
    );
    // LEFT JOIN colors because some images might not be color-specific
    // (e.g., lifestyle shots that apply to all variants)

    // ---------- GET FULL INVENTORY MATRIX ----------
    // Every color/size combination with current stock quantity
    // Frontend uses this to:
    // - Show which sizes are available for selected color
    // - Disable/gray out out-of-stock options
    // - Show "Only 3 left" warnings
    const inventory = await query(
      `SELECT 
        inv.id as inventory_id,
        c.id as color_id,
        c.value as color,
        s.id as size_id,
        s.value as size,
        inv.quantity
       FROM inventory inv
       JOIN colors c ON c.id = inv.color_id
       JOIN sizes s ON s.id = inv.size_id
       WHERE inv.product_id = $1
       ORDER BY c.value, s.value`,
      [productId]
    );

    // ---------- BUILD ENVIRONMENTAL IMPACT OBJECT ----------
    // REQUIREMENT: "Impact management"
    // This is the eco-friendly storytelling that supports
    // the "SCULPTED BY THE SEA" luxury sustainable branding
    const environmentalImpact = {
      story: productData.impact_story,              // The sustainability narrative
      sustainability_rating: productData.sustainability_rating,  // 1-5 stars
      carbon_footprint: productData.carbon_footprint,  // e.g., "2.3 kg CO2 saved"
      ethical_sourcing: productData.ethical_sourcing,  // Where materials come from
      recycled_materials: productData.recycled_materials  // Boolean
    };

    // Return everything the Product Detail Page needs
    return res.json({
      success: true,
      product: productData,
      colors: colors.rows,
      images: images.rows,
      sizes: inventory.rows,  // Full inventory matrix
      environmental_impact: environmentalImpact
    });

  } catch (err) {
    console.error("GET PRODUCT ERROR:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};


// ============================================================================
// NOTES & POTENTIAL IMPROVEMENTS
// ============================================================================
//
// 1. Pagination
//    Currently returns ALL products - will be slow with large catalogs
//    Should add: ?page=1&limit=20
//    Return: { products, total_count, page, total_pages }
//
// 2. Query optimization
//    The N+1 queries in getFullCatalog could be optimized:
//    - Use JOINs with array_agg() for colors/sizes in one query
//    - Or batch fetch all colors/sizes and map in JavaScript
//    Current approach is readable but won't scale to 10,000+ products
//
// 3. Caching
//    Catalog doesn't change often - could cache for 5-10 minutes
//    Redis or even in-memory cache would help
//    Invalidate cache when products are updated
//
// 4. Elasticsearch
//    For better search (fuzzy matching, typo tolerance, faceted search)
//    Current ILIKE search is basic but works for small catalogs
//
// 5. More filters
//    Could add: color filter, size filter, in-stock-only filter
//    Also: brand filter (if multi-brand), material filter
//
// 6. Related products
//    getProductById could return related products
//    "You might also like..." based on category or purchase history
//
// 7. Recently viewed
//    Track what products user has viewed
//    Show in "Recently Viewed" section (requires session/auth)
//
// ============================================================================