// ============================================================================
// addressRoutes.js
// Developer: Kamala
// ============================================================================
// User address management routes (shipping and billing addresses)
// All routes require authentication - users can only manage their own addresses

import express from "express";
import {
  getAllAddresses,
  getAddress,
  addAddress,
  updateAddress,
  setDefaultAddress,
  deleteAddress
} from "../controllers/addressController.js";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();

// ----------------------------------------------------------------------------
// Auth middleware applies to ALL routes in this file
// No guest access - you need an account to save addresses
// ----------------------------------------------------------------------------
router.use(authMiddleware);

// GET /api/addresses
// Returns all addresses for the logged-in user
// Used in checkout address selector and account settings
router.get("/", getAllAddresses);

// GET /api/addresses/:addressId
// Get a single address by ID
// Controller verifies the address belongs to this user
router.get("/:addressId", getAddress);

// POST /api/addresses
// Create a new address
// Body: { full_name, phone, address1, address2?, city, state, postal_code, country, is_default? }
router.post("/", addAddress);

// PUT /api/addresses/:addressId
// Update an existing address
// Partial updates supported - only send fields you want to change
router.put("/:addressId", updateAddress);

// PATCH /api/addresses/:addressId/set-default
// Mark an address as the default
// Automatically unsets any previously default address
// Using PATCH because we're updating one specific field
router.patch("/:addressId/set-default", setDefaultAddress);

// DELETE /api/addresses/:addressId
// Remove an address
// Controller checks ownership before deleting
router.delete("/:addressId", deleteAddress);

export default router;

// These routes get mounted at /api/addresses in server.js