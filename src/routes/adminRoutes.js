// ============================================================================
// Developer: Kamalasankari
// ============================================================================
// Admin routes - mostly deprecated in favor of separate route files
//
// This file used to have all admin routes but we split them out:
// - Product routes → adminProductRoutes.js
// - Order routes → adminOrderRoutes.js
//
// Keeping this file around for the dashboard endpoint and in case
// we need to add other admin stuff that doesn't fit elsewhere

import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";
// import { upload } from "../middleware/uploadMiddleware.js"; // not needed here anymore

// Dashboard controller - just a simple "admin access works" check for now
import { adminDashboard } from "../controllers/adminController.js";

// These imports aren't used anymore since routes moved to adminProductRoutes.js
// Leaving them commented as reference for what moved where
import {
  adminCreateProduct,
  adminUpdateProduct,
  adminDeleteProduct,
  adminGetAllProducts,
  adminGetSingleProduct,
  adminUpdateInventory
} from "../controllers/adminProductController.js";

const router = express.Router();

// ----------------------------------------------------------------------------
// ADMIN DASHBOARD
// ----------------------------------------------------------------------------
// GET /api/admin/dashboard
// Simple endpoint to verify admin access is working
// Could expand this later to return actual dashboard stats
// (total orders, revenue, low stock alerts, etc)
router.get(
  "/dashboard",
  authMiddleware,
  requireRole("ADMIN"),
  adminDashboard
);

// ============================================================================
// DEPRECATED ROUTES - moved to adminProductRoutes.js
// ============================================================================
// Keeping these commented out as documentation of what used to be here
// and in case we need to reference the old structure
//
// All these routes are now at /api/admin/products/* via adminProductRoutes.js
// which is cleaner and keeps this file from getting huge

// // GET ALL PRODUCTS
// router.get(
//   "/products",
//   authMiddleware,
//   requireRole("ADMIN"),
//   adminGetAllProducts
// );

// // GET SINGLE PRODUCT
// router.get(
//   "/products/:id",
//   authMiddleware,
//   requireRole("ADMIN"),
//   adminGetSingleProduct
// );

// // CREATE PRODUCT (with images)
// router.post(
//   "/products",
//   authMiddleware,
//   requireRole("ADMIN"),
//   upload.array("images", 10),
//   adminCreateProduct
// );

// // UPDATE PRODUCT
// router.put(
//   "/products/:id",
//   authMiddleware,
//   requireRole("ADMIN"),
//   adminUpdateProduct
// );

// // UPDATE INVENTORY
// router.patch(
//   "/products/:id/inventory",
//   authMiddleware,
//   requireRole("ADMIN"),
//   adminUpdateInventory
// );

// // DELETE PRODUCT
// router.delete(
//   "/products/:id",
//   authMiddleware,
//   requireRole("ADMIN"),
//   adminDeleteProduct
// );

export default router;

// Mounted at /api/admin in server.js
//
// TODO: Could probably delete this file entirely and move dashboard
// to its own route file, or just put it in server.js directly since
// it's just one endpoint. But leaving it for now in case we add more
// general admin stuff (settings, user management, etc)