import { query } from "../db/db.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const IMAGES_BASE = path.join(__dirname, "../../public/images");

const cleanName = (name) =>
  name
    .split(/[-_ ]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");

function validateProductFolder(category, folderName) {
  const fullPath = path.join(IMAGES_BASE, category, folderName);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Folder does not exist: ${fullPath}`);
  }
  return fullPath;
}

function extractColors(files, folderName) {
  const colors = new Set();
  files.forEach((file) => {
    const prefix = folderName.toLowerCase();
    if (file.toLowerCase().startsWith(prefix)) {
      const parts = file.toLowerCase().replace(prefix + "-", "").split("-");
      colors.add(parts[0]);
    }
  });
  return [...colors];
}

function buildColorImageMap(files, folderName, category) {
  const map = {};

  files.forEach((file) => {
    const prefix = folderName.toLowerCase();
    if (!file.toLowerCase().startsWith(prefix)) return;

    const parts = file.toLowerCase().replace(prefix + "-", "").split("-");
    const color = parts[0];

    if (!map[color]) map[color] = [];
    map[color].push(`/images/${category}/${folderName}/${file}`);
  });

  return map;
}

// ===============================================================
// CREATE PRODUCT
// ===============================================================
export const adminCreateProduct = async (req, res) => {
  try {
    const { name, category, cost_price, selling_price } = req.body;

    const productName = cleanName(name);
    const folderName = productName.replace(/ /g, "");

    const dir = validateProductFolder(category, folderName);
    const files = fs.readdirSync(dir);

    const colors = extractColors(files, folderName);
    const gallery = buildColorImageMap(files, folderName, category);

    const p = await query(
      `INSERT INTO products (name, category, cost_price, selling_price)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [productName, category, cost_price, selling_price]
    );

    const productId = p.rows[0].id;

    // --- Colors ---
    const colorIdMap = {};
    for (const c of colors) {
      let row = await query(`SELECT id FROM colors WHERE value=$1`, [c]);
      if (row.rows.length === 0) {
        row = await query(
          `INSERT INTO colors (value) VALUES ($1) RETURNING id`,
          [c]
        );
      }
      colorIdMap[c] = row.rows[0].id;

      await query(
        `INSERT INTO product_colors (product_id,color_id)
         VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [productId, colorIdMap[c]]
      );
    }

    // --- Images ---
    for (const [color, imgs] of Object.entries(gallery)) {
      const cid = colorIdMap[color];
      imgs.forEach(async (img, i) => {
        await query(
          `INSERT INTO product_images (product_id, color_id, image_url, priority)
           VALUES ($1,$2,$3,$4)`,
          [productId, cid, img, i + 1]
        );
      });
    }

    // --- Sizes ---
    const sizes = [
      "5","6","6.5","7","7.5","8","8.5","9","9.5","10","10.5","11"
    ];

    const sizeIdMap = {};
    for (const s of sizes) {
      let row = await query(`SELECT id FROM sizes WHERE value=$1`, [s]);
      if (row.rows.length === 0) {
        row = await query(
          `INSERT INTO sizes (value) VALUES ($1) RETURNING id`,
          [s]
        );
      }
      sizeIdMap[s] = row.rows[0].id;

      await query(
        `INSERT INTO product_sizes (product_id,size_id)
         VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [productId, sizeIdMap[s]]
      );
    }

    // --- Inventory ---
    for (const color of colors) {
      const cid = colorIdMap[color];
      for (const size of sizes) {
        const sid = sizeIdMap[size];
        const qty = Math.floor(Math.random() * 26) + 5;
        await query(
          `INSERT INTO inventory (product_id,size_id,color_id,quantity)
           VALUES ($1,$2,$3,$4)`,
          [productId, sid, cid, qty]
        );
      }
    }

    res.status(201).json({
      success: true,
      message: "Product created.",
      productId,
    });

  } catch (err) {
    console.error("ADMIN CREATE PRODUCT ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

// ===============================================================
// UPDATE PRODUCT (FULL)
// ===============================================================
export const adminUpdateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, category, cost_price, selling_price, tax_percent } = req.body;

    const product = await query(`SELECT * FROM products WHERE id=$1`, [id]);
    if (product.rows.length === 0)
      return res.status(404).json({ error: "Not found." });

    const productName = cleanName(name || product.rows[0].name);
    const folderName = productName.replace(/ /g, "");
    const newCategory = category || product.rows[0].category;

    const dir = validateProductFolder(newCategory, folderName);
    const files = fs.readdirSync(dir);

    const colors = extractColors(files, folderName);
    const gallery = buildColorImageMap(files, folderName, newCategory);

    // --- Update base product data ---
    await query(
      `UPDATE products SET
        name=$1, category=$2, cost_price=$3, selling_price=$4, tax_percent=$5
       WHERE id=$6`,
      [
        productName,
        newCategory,
        cost_price ?? product.rows[0].cost_price,
        selling_price ?? product.rows[0].selling_price,
        tax_percent ?? product.rows[0].tax_percent,
        id
      ]
    );

    // =============================
    // Rebuild colors
    // =============================
    await query(`DELETE FROM product_colors WHERE product_id=$1`, [id]);

    const colorIdMap = {};
    for (const c of colors) {
      let row = await query(`SELECT id FROM colors WHERE value=$1`, [c]);
      if (row.rows.length === 0) {
        row = await query(
          `INSERT INTO colors (value) VALUES ($1) RETURNING id`,
          [c]
        );
      }
      colorIdMap[c] = row.rows[0].id;

      await query(
        `INSERT INTO product_colors (product_id,color_id)
         VALUES ($1,$2)`,
        [id, colorIdMap[c]]
      );
    }

    // =============================
    // Rebuild images
    // =============================
    await query(`DELETE FROM product_images WHERE product_id=$1`, [id]);

    for (const [color, imgs] of Object.entries(gallery)) {
      const cid = colorIdMap[color];
      imgs.forEach(async (img, i) => {
        await query(
          `INSERT INTO product_images (product_id,color_id,image_url,priority)
           VALUES ($1,$2,$3,$4)`,
          [id, cid, img, i + 1]
        );
      });
    }

    // =============================
    // Sizes remain constant — only rebuild mapping
    // =============================
    const SIZES = [
      "5","6","6.5","7","7.5","8","8.5","9","9.5","10","10.5","11"
    ];

    await query(`DELETE FROM product_sizes WHERE product_id=$1`, [id]);

    const sizeIdMap = {};
    for (const s of SIZES) {
      let row = await query(`SELECT id FROM sizes WHERE value=$1`, [s]);
      if (row.rows.length === 0) {
        row = await query(
          `INSERT INTO sizes (value) VALUES ($1) RETURNING id`,
          [s]
        );
      }
      sizeIdMap[s] = row.rows[0].id;

      await query(
        `INSERT INTO product_sizes (product_id,size_id)
         VALUES ($1,$2)`,
        [id, sizeIdMap[s]]
      );
    }

    // =============================
    // Rebuild inventory
    // =============================
    await query(`DELETE FROM inventory WHERE product_id=$1`, [id]);

    for (const color of colors) {
      const cid = colorIdMap[color];

      for (const size of SIZES) {
        const sid = sizeIdMap[size];
        const qty = Math.floor(Math.random() * 26) + 5;
        await query(
          `INSERT INTO inventory (product_id,size_id,color_id,quantity)
           VALUES ($1,$2,$3,$4)`,
          [id, sid, cid, qty]
        );
      }
    }

    res.json({
      success: true,
      message: "Product updated successfully.",
    });

  } catch (err) {
    console.error("ADMIN UPDATE PRODUCT ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

// ===============================================================
// UPDATE INVENTORY (ONE VARIANT)
// ===============================================================
export const adminUpdateInventory = async (req, res) => {
  try {
    const { id } = req.params;
    const { size_id, color_id, quantity } = req.body;

    await query(
      `UPDATE inventory
       SET quantity=$1
       WHERE product_id=$2 AND size_id=$3 AND color_id=$4`,
      [quantity, id, size_id, color_id]
    );

    res.json({ success: true, message: "Inventory updated." });

  } catch (err) {
    console.error("ADMIN UPDATE INVENTORY ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

// ===============================================================
// DELETE PRODUCT
// ===============================================================
export const adminDeleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    await query(`DELETE FROM products WHERE id=$1`, [id]);

    res.json({
      success: true,
      message: "Product deleted.",
    });

  } catch (err) {
    console.error("ADMIN DELETE PRODUCT ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};
