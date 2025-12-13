// ============================================================================
// paymentCardRoutes.js
// Developer: Kamalasankari Subramaniakuppusamy  
// ============================================================================
// Saved payment card management for registered users
// Guests can't save cards - they enter card info fresh each checkout
//
// Reminder: This is a DEMO payment system, not PCI compliant
// Real apps should use Stripe, Square, etc.

import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import {
  saveCard,
  getSavedCard,
  deleteSavedCard
} from "../controllers/paymentCardController.js";

const router = express.Router();

// ----------------------------------------------------------------------------
// All routes require login - only registered users can save cards
// ----------------------------------------------------------------------------
router.use(authMiddleware);

// POST /api/payment/card
// Save a new card or replace existing one
// Body: { card_number, expiry, cvc, card_type }
// Only debit cards supported per requirements
// One card per user - saving a new one replaces the old one
router.post("/", saveCard);

// GET /api/payment/card
// Get saved card info for display
// Returns masked number only (****-****-****-1234), never full card
// Used in checkout to show "Pay with card ending in 1234"
// Also used in account settings to show what card is on file
router.get("/", getSavedCard);

// DELETE /api/payment/card
// Remove saved card from account
// User might do this if card was compromised, expired, or they just
// don't want it saved anymore
router.delete("/", deleteSavedCard);

export default router;

// Mounted at /api/payment/card in server.js
//
// There's also a test endpoint in paymentCardController:
// GET /api/payment/test-cvc?card_number=xxx
// Returns the expected CVC for demo purposes - would NOT exist in production