import { query } from "../db/db.js";

export const getFullCatalog = async (req, res) => {
  try {
    const products = await query(`SELECT * FROM products ORDER BY created_at DESC`);

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
        `SELECT image_url, color_id 
         FROM product_images
         WHERE product_id=$1`,
        [p.id]
      );

      const sizes = await query(
        `SELECT DISTINCT s.value, s.id
         FROM inventory i
         JOIN sizes s ON s.id = i.size_id
         WHERE i.product_id=$1`,
        [p.id]
      );

      catalog.push({
        ...p,
        colors: colors.rows,
        sizes: sizes.rows,
        images: images.rows
      });
    }

    res.json({
      success: true,
      products: catalog
    });

  } catch (err) {
    console.error("CATALOG ERROR:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};
