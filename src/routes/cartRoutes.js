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


// ADD ITEM TO CART (guest OR registered)
router.post("/add", authMiddlewareOptional, addToCart);

// GET CART (guest OR registered)
router.get("/", authMiddlewareOptional, getCart);

// INCREASE QUANTITY (+1)
router.patch("/:itemId/increase", authMiddlewareOptional, increaseQuantity);

// DECREASE QUANTITY (-1)
router.patch("/:itemId/decrease", authMiddlewareOptional, decreaseQuantity);

// CHANGE VARIANT (color/size)
router.patch("/:itemId/change-variant", authMiddlewareOptional, changeCartItemVariant);

// REMOVE CART ITEM
router.delete("/:itemId", authMiddlewareOptional, removeCartItem);

// MOVE CART ITEM → WISHLIST (registered only)
router.post("/move-to-wishlist/:itemId", authMiddleware, moveToWishlist);

export default router;