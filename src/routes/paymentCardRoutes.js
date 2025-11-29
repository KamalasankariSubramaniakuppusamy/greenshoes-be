import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import {
  saveCard,
  getSavedCard,
  deleteSavedCard
} from "../controllers/paymentCardController.js";

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

// Save/update card
router.post("/", saveCard);

// Get saved card (masked)
router.get("/", getSavedCard);

// Delete saved card
router.delete("/", deleteSavedCard);

export default router;