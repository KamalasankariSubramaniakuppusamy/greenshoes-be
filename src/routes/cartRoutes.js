import express from "express";
import {
  addToCart,
  getCart,
  removeCartItem,
  moveToWishlist
} from "../controllers/cartController.js";

import { authMiddleware } from "../middleware/auth.js";
import { authMiddlewareOptional } from "../middleware/auth.js";

const router = express.Router();

/**
 * =====================================================
 * CART ROUTES (Guest + Registered)
 * =====================================================
 */

// ADD ITEM TO CART (guest OR registered)
router.post("/add", authMiddlewareOptional, addToCart);

// GET CART (guest OR registered)
router.get("/", authMiddlewareOptional, getCart);

// REMOVE CART ITEM
router.delete("/:itemId", authMiddlewareOptional, removeCartItem);

// MOVE CART ITEM → WISHLIST (registered only)
router.post(
  "/move-to-wishlist/:itemId",
  authMiddleware,
  moveToWishlist
);

export default router;
