import express from "express";
import { authMiddlewareOptional } from "../middleware/auth.js";
import {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  moveWishlistToCart
} from "../controllers/wishlistController.js";

const router = express.Router();

// GET WISHLIST (guest OR registered)
router.get("/", authMiddlewareOptional, getWishlist);

// ADD TO WISHLIST (guest OR registered)
router.post("/add", authMiddlewareOptional, addToWishlist);

// REMOVE FROM WISHLIST (guest OR registered)
router.delete("/:productId", authMiddlewareOptional, removeFromWishlist);

// MOVE WISHLIST → CART (guest OR registered)
router.post("/move-to-cart/:productId", authMiddlewareOptional, moveWishlistToCart);

export default router;