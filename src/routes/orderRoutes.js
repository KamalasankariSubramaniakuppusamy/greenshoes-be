import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import {
  getOrderHistory,
  getOrderDetails,
  reorder
} from "../controllers/orderController.js";

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

// Get order history
router.get("/", getOrderHistory);

// Get single order details
router.get("/:orderId", getOrderDetails);

// Reorder (add all items from order to cart)
router.post("/:orderId/reorder", reorder);

export default router;