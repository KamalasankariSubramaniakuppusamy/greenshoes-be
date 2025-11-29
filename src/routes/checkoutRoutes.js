import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import {
  checkoutRegisteredUserSavedCard,
  checkoutRegisteredUserNewCard,
  checkoutGuest
} from "../controllers/checkoutController.js";

const router = express.Router();

// Guest checkout (no auth required)
router.post("/guest", checkoutGuest);

// Registered user checkout with saved card
router.post("/saved-card", authMiddleware, checkoutRegisteredUserSavedCard);

// Registered user checkout with new card
router.post("/new-card", authMiddleware, checkoutRegisteredUserNewCard);

export default router;