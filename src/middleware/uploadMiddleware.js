// ============================================================================
// Developer: GreenShoes Team
// ============================================================================
// File upload handling using Multer
// Used for product images in the admin panel

import multer from "multer";
import path from "path";
import fs from "fs";

// ----------------------------------------------------------------------------
// Storage configuration
// ----------------------------------------------------------------------------
// Using diskStorage instead of memoryStorage because:
// 1. Product images can be large (multiple high-res photos)
// 2. Memory storage would eat up RAM with multiple uploads
// 3. We need to move files to final location anyway
//
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Files go to uploads/temp first, then get moved to their final location
    // in productController after we know the product slug and category
    // This avoids creating orphan folders if the product creation fails
    const uploadPath = path.join("uploads", "temp");
    
    // Create the folder if it doesn't exist
    // recursive: true means it'll create parent folders too if needed
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    
    cb(null, uploadPath);
  },
  
  filename: (req, file, cb) => {
    // Clean up the filename - replace spaces with dashes, lowercase everything
    // "Product Photo 1.PNG" becomes "product-photo-1.png"
    // Keeps the original name so we can parse color/view info from it
    // (naming convention: productname-color-viewtype.ext)
    const name = file.originalname.replace(/\s+/g, "-").toLowerCase();
    cb(null, name);
  }
});

// ----------------------------------------------------------------------------
// Export configured multer instance
// ----------------------------------------------------------------------------
export const upload = multer({ 
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024,   // 50MB per file - product photos can be big
    fieldSize: 50 * 1024 * 1024,  // 50MB for non-file fields (probably overkill)
    fields: 50,                    // max 50 non-file fields in the form
    files: 20                      // max 20 files per request - enough for all product angles
  }
});

// Usage in routes:
//   import { upload } from '../middleware/uploadMiddleware.js';
//
//   // Single file
//   router.post('/upload', upload.single('image'), handler);
//
//   // Multiple files under one field name
//   router.post('/product', upload.array('images', 20), createProduct);
//
//   // Multiple fields with different names
//   router.post('/product', upload.fields([
//     { name: 'main_image', maxCount: 1 },
//     { name: 'gallery', maxCount: 10 }
//   ]), createProduct);

// TODO: should probably add file type validation
// Right now you could upload a .exe and it would save it
// Something like:
//
//   fileFilter: (req, file, cb) => {
//     const allowed = ['image/jpeg', 'image/png', 'image/webp'];
//     if (allowed.includes(file.mimetype)) {
//       cb(null, true);
//     } else {
//       cb(new Error('Only JPEG, PNG, and WebP images allowed'), false);
//     }
//   }