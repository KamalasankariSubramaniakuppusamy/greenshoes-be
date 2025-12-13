import { query } from "../db/db.js";

async function fixImagePaths() {
  console.log("Fixing broken image paths...\n");

  // Get all product images with broken paths (starting with /images/17...)
  const brokenImages = await query(`
    SELECT pi.id, pi.image_url, p.name, p.category
    FROM product_images pi
    JOIN products p ON p.id = pi.product_id
    WHERE pi.image_url LIKE '/images/1%'
  `);

  console.log(`Found ${brokenImages.rows.length} images to fix\n`);

  for (const img of brokenImages.rows) {
    // Extract filename from broken path: /images/1764187797295-bubble-black-model.png
    const oldPath = img.image_url;
    const filename = oldPath.split("/").pop(); // "1764187797295-bubble-black-model.png"
    
    // Remove timestamp prefix: "bubble-black-model.png"
    const cleanFilename = filename.replace(/^\d+-/, "");
    
    // Build correct path
    const category = img.category.toLowerCase();
    const productFolder = img.name.toLowerCase().replace(/\s+/g, "-");
    const newPath = `/images/${category}/${productFolder}/${cleanFilename}`;

    console.log(`  ${oldPath}`);
    console.log(`  → ${newPath}\n`);

    // Update in database
    await query(`UPDATE product_images SET image_url = $1 WHERE id = $2`, [newPath, img.id]);
  }

  console.log("Image paths fixed!");
  process.exit(0);
}

fixImagePaths().catch((err) => {
  console.error("Fix failed:", err);
  process.exit(1);
});