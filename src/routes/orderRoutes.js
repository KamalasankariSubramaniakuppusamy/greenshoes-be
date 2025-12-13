// ============================================================================
// orderRoutes.js
// ============================================================================
// Customer order routes - view past orders and reorder
// All routes require authentication (guests can't have order history)
//
// Note: This is the CUSTOMER view of orders
// Admin order management is in adminOrderRoutes.js

import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import {
  getOrderHistory,
  getOrderDetails,
  reorder
} from "../controllers/orderController.js";

const router = express.Router();

// ----------------------------------------------------------------------------
// All routes require login
// Guests don't have order history - their orders are fire-and-forget
// (they should have saved their order_number during checkout)
// ----------------------------------------------------------------------------
router.use(authMiddleware);

// GET /api/orders
// Returns all orders for the logged-in user
// Shows summary: order number, date, total, item count, status
// Used for the "My Orders" page in account section
router.get("/", getOrderHistory);

// GET /api/orders/:orderId
// Full details for a single order
// Returns: line items with color/size, shipping address, billing address,
// payment info, price breakdown (subtotal, tax, shipping, total)
// Controller verifies order belongs to this user before returning
router.get("/:orderId", getOrderDetails);

// POST /api/orders/:orderId/reorder
// "Buy it again" feature - adds all items from a past order to cart
// Checks stock availability for each item:
//   - If in stock: adds to cart
//   - If out of stock: skips it, includes in response so user knows
// Handles items already in cart by increasing quantity
router.post("/:orderId/reorder", reorder);

export default router;

// Mounted at /api/orders in server.js
//
// No update or cancel routes because "no returns or refunds"
// Once an order is placed, it's final