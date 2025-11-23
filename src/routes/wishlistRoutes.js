import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import {
  getWishlist,
  addToWishlist,
  removeFromWishlist
} from "../controllers/wishlistController.js";

const router = express.Router();

// Get wishlist (requires login)
router.get("/", authMiddleware, getWishlist);

// Add to wishlist
router.post("/add", authMiddleware, addToWishlist);

// Remove from wishlist
router.delete("/remove/:productId", authMiddleware, removeFromWishlist);

export default router;
