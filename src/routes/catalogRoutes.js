// ============================================================================
// catalogRoutes.js
// ============================================================================
// Public product catalog - no auth required
// Anyone can browse products, that's kind of the point of a store

import express from "express";
import { getFullCatalog } from "../controllers/catalogController.js";

const router = express.Router();

// GET /api/catalog
// Returns all products with images, colors, sizes, stock status
// Supports filtering via query params:
//   ?category=sandals
//   ?search=ocean
//   ?minPrice=50&maxPrice=150
//   ?onSale=true
// Also supports sorting:
//   ?sort=price_asc, price_desc, name, created_at
// Sale items are prioritized by default (shown first)
router.get("/", getFullCatalog);

export default router;

// Mounted at /api/catalog in server.js
//
// There's also a /api/products route (publicCatalogController) that does
// similar stuff - might want to consolidate these at some point to avoid
// confusion. This one has more filtering options though.