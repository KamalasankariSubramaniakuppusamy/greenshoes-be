import express from "express";
import {
  adminCreateProduct,
  adminUpdateProduct,
  adminUpdateInventory,
  adminDeleteProduct,
  adminGetAllProducts,
  adminGetSingleProduct,
  // NEW IMPORTS
  markProductOnSale,
  removeProductFromSale,
  updateProductImpact
} from "../controllers/adminProductController.js";

import { upload } from "../middleware/uploadMiddleware.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";

const router = express.Router();

// All routes require admin authentication
router.use(authMiddleware);
router.use(requireRole("ADMIN"));

// CREATE PRODUCT (With images + sizes per color)
router.post(
  "/",
  upload.array("images", 20),
  adminCreateProduct
);

// GET ALL PRODUCTS
router.get("/", adminGetAllProducts);

// GET SINGLE PRODUCT DETAILS
router.get("/:id", adminGetSingleProduct);

// UPDATE MAIN PRODUCT DATA (with optional images and variants)
router.put(
  "/:id",
  upload.array("images", 20), 
  adminUpdateProduct
);

// UPDATE INVENTORY OF ONE VARIANT (color + size)
router.patch("/:id/inventory", adminUpdateInventory);

// NEW: MARK PRODUCT AS ON SALE
router.patch("/:id/sale/mark", markProductOnSale);

// NEW: REMOVE PRODUCT FROM SALE
router.patch("/:id/sale/remove", removeProductFromSale);

// NEW: UPDATE ENVIRONMENTAL IMPACT DATA
router.patch("/:id/impact", updateProductImpact);

// DELETE PRODUCT
router.delete("/:id", adminDeleteProduct);

export default router;