// ============================================================================
// checkoutRoutes.js
// ============================================================================
// Checkout routes - converts cart to order and processes payment
// Three flows: guest checkout, saved card, new card

import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import {
  checkoutRegisteredUserSavedCard,
  checkoutRegisteredUserNewCard,
  checkoutGuest
} from "../controllers/checkoutController.js";

const router = express.Router();

// ----------------------------------------------------------------------------
// GUEST CHECKOUT
// ----------------------------------------------------------------------------
// POST /api/checkout/guest
// No auth required - anyone can buy without creating an account
// Body: { card_number, expiry, cvc, shipping_address, email }
// Creates a guest_user record, processes payment, creates order
// Guest should save their order_number since they can't look it up later
router.post("/guest", checkoutGuest);

// ----------------------------------------------------------------------------
// REGISTERED USER - SAVED CARD
// ----------------------------------------------------------------------------
// POST /api/checkout/saved-card
// Pay using the card already on file
// Body: { cvc, shipping_address_id, billing_address_id? }
// CVC required every time - proves user still has the physical card
// Billing address defaults to shipping if not provided
router.post("/saved-card", authMiddleware, checkoutRegisteredUserSavedCard);

// ----------------------------------------------------------------------------
// REGISTERED USER - NEW CARD
// ----------------------------------------------------------------------------
// POST /api/checkout/new-card
// Pay with a card that's not saved
// Body: { card_number, expiry, cvc, shipping_address_id, billing_address_id?, save_card? }
// If save_card is true, card gets saved for future purchases
// Good for users who don't want to save their card or are using a different one
router.post("/new-card", authMiddleware, checkoutRegisteredUserNewCard);

export default router;

// Mounted at /api/checkout in server.js
//
// All three flows do basically the same thing:
// 1. Validate cart has items
// 2. Validate payment info
// 3. Calculate totals (subtotal + 6% tax + $11.95 shipping)
// 4. "Process" payment (demo - just generates fake transaction ID)
// 5. Create order and order_items
// 6. Decrement inventory
// 7. Clear cart
// 8. Return order summary
//
// No cancel or refund endpoints - per requirements "no returns or refunds"