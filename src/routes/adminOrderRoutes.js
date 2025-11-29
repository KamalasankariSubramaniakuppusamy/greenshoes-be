import express from "express";
import { authMiddleware, requireRole } from "../middleware/auth.js";
import {
  adminGetAllOrders,
  adminGetOrderDetails
} from "../controllers/adminOrderController.js";

const router = express.Router();

// All routes require admin authentication
router.use(authMiddleware);
router.use(requireRole("ADMIN"));

// Get all orders (guest + registered)
router.get("/", adminGetAllOrders);

// Get single order details
router.get("/:orderId", adminGetOrderDetails);

export default router;