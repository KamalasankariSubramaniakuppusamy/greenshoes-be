import express from "express";
import {
  adminCreateProduct,
  adminUpdateProduct,
  adminUpdateInventory,
  adminDeleteProduct
} from "../controllers/adminProductController.js";

import { authMiddleware } from "../middleware/auth.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";

const router = express.Router();

// CREATE
router.post(
  "/products",
  authMiddleware,
  roleMiddleware("ADMIN"),
  adminCreateProduct
);

// UPDATE
router.put(
  "/products/:id",
  authMiddleware,
  roleMiddleware("ADMIN"),
  adminUpdateProduct
);

// UPDATE INVENTORY OF ONE VARIANT
router.patch(
  "/products/:id/inventory",
  authMiddleware,
  roleMiddleware("ADMIN"),
  adminUpdateInventory
);

// DELETE
router.delete(
  "/products/:id",
  authMiddleware,
  roleMiddleware("ADMIN"),
  adminDeleteProduct
);

export default router;
