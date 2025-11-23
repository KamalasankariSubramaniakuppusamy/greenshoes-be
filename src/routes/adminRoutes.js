import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";
// import { upload } from "../middleware/uploadMiddleware.js"; //

// Import from adminController.js (for dashboard)
import { adminDashboard } from "../controllers/adminController.js";

// Import from adminProductController.js (for products) ← ADD THIS
import {
  adminCreateProduct,
  adminUpdateProduct,
  adminDeleteProduct,
  adminGetAllProducts,
  adminGetSingleProduct,
  adminUpdateInventory
} from "../controllers/adminProductController.js";

const router = express.Router();

// ADMIN DASHBOARD
router.get(
  "/dashboard",
  authMiddleware,
  requireRole("ADMIN"),
  adminDashboard
);

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
//   upload.array("images", 10),  // ← ADD THIS
//   adminCreateProduct  // ← Now using the real function
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

// export default router;

export default router;