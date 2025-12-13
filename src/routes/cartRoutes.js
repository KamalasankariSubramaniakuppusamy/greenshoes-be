// ============================================================================
// cartRoutes.js
// ============================================================================
// Shopping cart routes - supports both registered users and guests
// Most routes use authMiddlewareOptional so guests can shop too

import express from "express";
import {
  addToCart,
  getCart,
  increaseQuantity,
  decreaseQuantity,
  changeCartItemVariant,
  removeCartItem,
  moveToWishlist
} from "../controllers/cartController.js";

import { authMiddleware, authMiddlewareOptional } from "../middleware/auth.js";

const router = express.Router();

// ----------------------------------------------------------------------------
// Guest vs User cart logic:
// - If req.user exists (logged in): uses user's cart via user_id
// - If req.user is null (guest): uses guest cart via x-guest-id header
// Controller handles this branching, routes just pass the request through
// ----------------------------------------------------------------------------

// POST /api/cart/add
// Add a product variant to cart
// Body: { product_id, color, size, quantity }
// Returns the cart item and guestId (frontend stores guestId for future requests)
router.post("/add", authMiddlewareOptional, addToCart);

// GET /api/cart
// Get current cart with all items, prices, and totals
// Returns: items array, subtotal, tax, shipping, total
// Also returns available colors/sizes for each item (for the variant selector)
router.get("/", authMiddlewareOptional, getCart);

// PATCH /api/cart/:itemId/increase
// Bump quantity by 1
// Validates against available stock before increasing
router.patch("/:itemId/increase", authMiddlewareOptional, increaseQuantity);

// PATCH /api/cart/:itemId/decrease
// Reduce quantity by 1
// If quantity would become 0, removes the item entirely
router.patch("/:itemId/decrease", authMiddlewareOptional, decreaseQuantity);

// PATCH /api/cart/:itemId/change-variant
// Change the color or size of a cart item
// Body: { color, size }
// Useful when user changes their mind without removing and re-adding
// Handles edge case where new variant already exists in cart (merges them)
router.patch("/:itemId/change-variant", authMiddlewareOptional, changeCartItemVariant);

// DELETE /api/cart/:itemId
// Remove an item from cart completely
router.delete("/:itemId", authMiddlewareOptional, removeCartItem);

// POST /api/cart/move-to-wishlist/:itemId
// Move a cart item to wishlist (save for later)
// REQUIRES LOGIN - guests can't have wishlists... wait actually they can
// but this endpoint requires auth. Might want to revisit this.
// Note: wishlist stores products not variants, so color/size info is lost
router.post("/move-to-wishlist/:itemId", authMiddleware, moveToWishlist);

export default router;

// Mounted at /api/cart in server.js