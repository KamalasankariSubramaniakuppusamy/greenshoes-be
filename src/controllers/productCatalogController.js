import { query } from "../db/db.js";

// --------------------------------------
// GET FULL PRODUCT CATALOG
// --------------------------------------
export const getCatalog = async (req, res) => {
  try {
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

    const finalOutput = [];

    for (const product of products.rows) {
      // MAIN IMAGE
      const mainImage = await query(`
        SELECT image_url 
        FROM product_images 
        WHERE product_id=$1 
        ORDER BY priority ASC LIMIT 1
      `, [product.id]);

      // ALL IMAGES
      const gallery = await query(`
        SELECT image_url, color_id 
        FROM product_images 
        WHERE product_id=$1
        ORDER BY priority ASC
      `, [product.id]);

      // COLORS
      const colors = await query(`
        SELECT c.id, c.value
        FROM product_colors pc
        JOIN colors c ON c.id = pc.color_id
        WHERE pc.product_id=$1
      `, [product.id]);

      // SIZES PER COLOR
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

      // STOCK STATUS (frontend shows badges)
      const totalQty = sizes.rows.reduce((sum, v) => sum + v.quantity, 0);

      let status = "in_stock";
      if (totalQty === 0) status = "out_of_stock";
      else if (totalQty < 10) status = "running_out";

      finalOutput.push({
        ...product,
        status,
        main_image: mainImage.rows[0]?.image_url || null,
        gallery: gallery.rows,
        colors: colors.rows,
        sizes: sizes.rows
      });
    }

    return res.json({
      success: true,
      products: finalOutput
    });

  } catch (err) {
    console.error("CATALOG ERROR:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// --------------------------------------
// GET SINGLE PRODUCT PAGE DATA
// --------------------------------------
export const getSingleProduct = async (req, res) => {
  try {
    const { id } = req.params;

    // Get product with stock status calculated
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

    if (product.rows.length === 0)
      return res.status(404).json({ error: "Product not found" });

    const colors = await query(`
      SELECT c.id, c.value
      FROM product_colors pc
      JOIN colors c ON c.id = pc.color_id
      WHERE pc.product_id=$1
    `, [id]);

    const images = await query(`
      SELECT image_url, color_id, priority
      FROM product_images
      WHERE product_id=$1
      ORDER BY priority ASC
    `, [id]);

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

    return res.json({
      success: true,
      product: product.rows[0],
      colors: colors.rows,
      images: images.rows,
      sizes: sizes.rows
    });

  } catch (err) {
    console.error("SINGLE PRODUCT ERROR:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};