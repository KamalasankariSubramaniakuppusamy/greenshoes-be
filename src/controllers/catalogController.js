import { query } from "../db/db.js";

// ---------------------------------------------------
// GET FULL CATALOG (with search, filters, emphasis on sale)
// Now includes per-variant stock status alerts
// ---------------------------------------------------
export const getFullCatalog = async (req, res) => {
  try {
    const {
      category,
      search,
      minPrice,
      maxPrice,
      onSale,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = req.query;

    // Build dynamic query with filters
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

    const params = [];
    let paramIndex = 1;

    // Filter by category
    if (category) {
      queryText += ` AND p.category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    // Search by name or description
    if (search) {
      queryText += ` AND (p.name ILIKE $${paramIndex} OR p.description ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Filter by price range
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

    // Filter by on sale items
    if (onSale === 'true') {
      queryText += ` AND p.on_sale = TRUE`;
    }

    queryText += ` GROUP BY p.id`;

    // Sorting
    const allowedSortFields = ['created_at', 'name', 'selling_price'];
    const allowedSortOrders = ['ASC', 'DESC'];
    
    const finalSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';
    const finalSortOrder = allowedSortOrders.includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';

    if (finalSortBy === 'selling_price') {
      queryText += ` ORDER BY effective_price ${finalSortOrder}`;
    } else {
      queryText += ` ORDER BY p.${finalSortBy} ${finalSortOrder}`;
    }

    // Show sale items FIRST by default
    if (!req.query.sortBy) {
      queryText = `
        SELECT * FROM (${queryText}) as sorted_products
        ORDER BY on_sale DESC, created_at DESC
      `;
    }

    const products = await query(queryText, params);

    // Get colors, sizes, images, and STOCK ALERTS for each product
    const catalog = [];

    for (const p of products.rows) {
      const colors = await query(
        `SELECT c.id, c.value 
         FROM product_colors pc
         JOIN colors c ON c.id = pc.color_id
         WHERE pc.product_id=$1`,
        [p.id]
      );

      const images = await query(
        `SELECT image_url, color_id, priority
         FROM product_images
         WHERE product_id=$1
         ORDER BY priority ASC`,
        [p.id]
      );

      const sizes = await query(
        `SELECT DISTINCT s.value, s.id
         FROM inventory i
         JOIN sizes s ON s.id = i.size_id
         WHERE i.product_id=$1 AND i.quantity > 0
         ORDER BY s.value`,
        [p.id]
      );

      // NEW: Get per-variant stock status for alerts
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

      // Build stock alerts array
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

      // Create human-readable alerts
      if (outOfStockVariants.length > 0) {
        if (outOfStockVariants.length <= 2) {
          outOfStockVariants.forEach(v => {
            stockAlerts.push({
              type: 'out_of_stock',
              message: `${v.color} Size ${v.size} - Out of Stock`,
              color: v.color,
              size: v.size
            });
          });
        } else {
          stockAlerts.push({
            type: 'out_of_stock',
            message: `${outOfStockVariants.length} variants out of stock`,
            variants: outOfStockVariants
          });
        }
      }

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

// ---------------------------------------------------
// GET SINGLE PRODUCT BY ID
// ---------------------------------------------------
export const getProductById = async (req, res) => {
  try {
    const { productId } = req.params;

    // Get product details with sale price calculation
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

    // Get all colors for this product
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

    // Multiple photos from different angles/colors
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

    // Display sizes and colors with availability
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

    // Display environmental impact information and storytelling
    const environmentalImpact = {
      story: productData.impact_story,
      sustainability_rating: productData.sustainability_rating,
      carbon_footprint: productData.carbon_footprint,
      ethical_sourcing: productData.ethical_sourcing,
      recycled_materials: productData.recycled_materials
    };

    return res.json({
      success: true,
      product: productData,
      colors: colors.rows,
      images: images.rows,
      sizes: inventory.rows,
      environmental_impact: environmentalImpact
    });

  } catch (err) {
    console.error("GET PRODUCT ERROR:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};