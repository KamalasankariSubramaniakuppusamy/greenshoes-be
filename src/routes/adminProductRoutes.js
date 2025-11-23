import express from "express";
import {
  adminCreateProduct,
  adminUpdateProduct,
  adminUpdateInventory,
  adminDeleteProduct,
  adminGetAllProducts,
  adminGetSingleProduct
} from "../controllers/adminProductController.js";

import { upload } from "../middleware/uploadMiddleware.js";
import { authMiddleware } from "../middleware/auth.js";
import { requireRole } from "../middleware/roleMiddleware.js";

const router = express.Router();

// CREATE PRODUCT (With images + sizes per color)
router.post(
  "/",
  authMiddleware,
  requireRole("ADMIN"),
  upload.array("images", 20),
  adminCreateProduct
);

// GET ALL PRODUCTS
router.get(
  "/",
  authMiddleware,
  requireRole("ADMIN"),
  adminGetAllProducts
);

// GET SINGLE PRODUCT DETAILS
router.get(
  "/:id",
  authMiddleware,
  requireRole("ADMIN"),
  adminGetSingleProduct
);

// UPDATE MAIN PRODUCT DATA (with optional images and variants)
router.put(
  "/:id",
  authMiddleware,
  requireRole("ADMIN"),
  upload.array("images", 20), 
  adminUpdateProduct
);

// UPDATE INVENTORY OF ONE VARIANT (color + size)
router.patch(
  "/:id/inventory",
  authMiddleware,
  requireRole("ADMIN"),
  adminUpdateInventory
);

// DELETE PRODUCT
router.delete(
  "/:id",
  authMiddleware,
  requireRole("ADMIN"),
  adminDeleteProduct
);

export default router;