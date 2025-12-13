// ============================================================================
// adminOrderRoutes.js
// Developer: GreenShoes Team
// ============================================================================
// Admin-only order management routes
// For viewing and managing all orders (both registered users and guests)
//
// Note: These are READ-ONLY endpoints
// Per requirements: "no returns or refunds" so no update/cancel routes

import express from "express";
import { authMiddleware, requireRole } from "../middleware/auth.js";
import {
  adminGetAllOrders,
  adminGetOrderDetails
} from "../controllers/adminOrderController.js";

const router = express.Router();

// ----------------------------------------------------------------------------
// Double authentication: must be logged in AND be an admin
// authMiddleware runs first (sets req.user from JWT)
// requireRole runs second (checks req.user.role === 'ADMIN')
// ----------------------------------------------------------------------------
router.use(authMiddleware);
router.use(requireRole("ADMIN"));

// GET /api/admin/orders
// List all orders in the system - customers and guests
// Returns summary info: order number, customer name, total, status, item count
// Sorted newest first for the admin dashboard
router.get("/", adminGetAllOrders);

// GET /api/admin/orders/:orderId
// Full order details for a specific order
// Includes: line items with color/size, shipping address, payment info, price breakdown
// Used when admin clicks on an order to see everything
router.get("/:orderId", adminGetOrderDetails);

export default router;

// Mounted at /api/admin/orders in server.js
//
// If we ever need to add order management (unlikely given "no refunds" requirement):
// - PATCH /:orderId/status - update order status
// - POST /:orderId/refund - process refund
// But for now, orders are final once placed