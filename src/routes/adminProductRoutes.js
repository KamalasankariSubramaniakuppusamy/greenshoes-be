// ============================================================================
// adminProductRoutes.js
// Developer: Kamala
// ============================================================================
// Admin product management routes - the heart of the admin panel
// Handles all CRUD operations for products, inventory, sales, and impact data

import express from "express";
import {
  adminCreateProduct,
  adminUpdateProduct,
  adminUpdateInventory,
  adminDeleteProduct,
  adminGetAllProducts,
  adminGetSingleProduct,
  markProductOnSale,
  removeProductFromSale,
  updateProductImpact
} from "../controllers/adminProductController.js";

import { upload } from "../middleware/uploadMiddleware.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";

const router = express.Router();

// ----------------------------------------------------------------------------
// Admin-only access
// ----------------------------------------------------------------------------
router.use(authMiddleware);
router.use(requireRole("ADMIN"));

// ----------------------------------------------------------------------------
// Multer error handler wrapper
// ----------------------------------------------------------------------------
// Multer's error handling is awkward - errors thrown in middleware don't
// go to Express's error handler properly. This wrapper catches them
// and returns a clean 400 response instead of crashing.
//
// Common errors: file too large, too many files, wrong field name
//
const handleUpload = (req, res, next) => {
  upload.array("images", 20)(req, res, (err) => {
    if (err) {
      console.error("MULTER ERROR:", err);
      return res.status(400).json({ error: `Upload error: ${err.message}` });
    }
    next();
  });
};


// ============================================================================
// PRODUCT CRUD
// ============================================================================

// POST /api/admin/products
// Create a new product with images and size/color variants
// Form data: name, category, cost_price, selling_price, description, variants (JSON), images (files)
// handleUpload runs first to process the multipart form data
router.post("/", handleUpload, adminCreateProduct);

// GET /api/admin/products
// List all products with summary info (colors, sizes, stock count, main image)
// Used for the product list table in admin dashboard
router.get("/", adminGetAllProducts);

// GET /api/admin/products/:id
// Full product details for the edit modal
// Returns everything: product data, all colors, all variants with quantities, all images
router.get("/:id", adminGetSingleProduct);

// PUT /api/admin/products/:id
// Update product details, optionally add new images or variants
// handleUpload processes any new images being added
// Supports partial updates - only send fields you want to change
router.put("/:id", handleUpload, adminUpdateProduct);

// DELETE /api/admin/products/:id
// Remove a product and all its associated data (images, variants, inventory)
// Currently hard deletes - might want soft delete later for order history
router.delete("/:id", adminDeleteProduct);


// ============================================================================
// INVENTORY MANAGEMENT
// ============================================================================

// PATCH /api/admin/products/:id/inventory
// Update stock quantity for a specific size/color combination
// Body: { color, size, quantity }
// Used when admin needs to adjust inventory for one variant
router.patch("/:id/inventory", adminUpdateInventory);


// ============================================================================
// SALE MANAGEMENT
// ============================================================================

// PATCH /api/admin/products/:id/sale/mark
// Put a product on sale
// Body: { sale_price }
// Validates that sale_price is less than selling_price
router.patch("/:id/sale/mark", markProductOnSale);

// PATCH /api/admin/products/:id/sale/remove
// End a sale - removes sale_price and sets on_sale to false
// Product goes back to regular selling_price
router.patch("/:id/sale/remove", removeProductFromSale);


// ============================================================================
// ENVIRONMENTAL IMPACT
// ============================================================================

// PATCH /api/admin/products/:id/impact
// Update the sustainability/environmental data for a product
// Body: { impact_story, sustainability_rating (1-5), carbon_footprint, ethical_sourcing, recycled_materials }
// GreenShoes brand differentiator - eco-friendly messaging
router.patch("/:id/impact", updateProductImpact);

export default router;

// Mounted at /api/admin/products in server.js