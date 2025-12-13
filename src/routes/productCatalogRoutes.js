// ============================================================================
// productRoutes
// ============================================================================
// Public product routes - customer-facing catalog endpoints
// No auth required - anyone can browse products

import express from "express";
import { getCatalog, getSingleProduct } from "../controllers/productCatalogController.js";

const router = express.Router();

// ----------------------------------------------------------------------------
// PUBLIC ROUTES - no authentication needed
// ----------------------------------------------------------------------------

// GET /api/products
// Returns full product catalog with images, colors, sizes, stock status
// Used for the main shop page / product listing
// Each product includes: main_image, gallery, available colors/sizes, stock status
router.get("/", getCatalog);

// GET /api/products/:id
// Returns full details for a single product (Product Detail Page)
// Includes: all product info, all images, all colors, full inventory matrix
// Inventory matrix = every color/size combo with current stock quantity
router.get("/:id", getSingleProduct);

export default router;

// Mounted at /api/products in server.js
//
// Note: There's also /api/catalog (catalogRoutes.js) which does similar stuff
// but has more filtering/sorting options. These two could probably be merged
// to avoid confusion. This one is simpler, that one has more features.