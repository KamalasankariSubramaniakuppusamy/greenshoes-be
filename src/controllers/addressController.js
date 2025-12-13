// ============================================================================
// addressController.js
// Developer: GreenShoes Team
// ============================================================================
//
// Controller for managing user addresses (shipping/billing)
// Handles CRUD operations for the addresses table
//
// REQUIREMENTS SUPPORTED:
// - "Display order ID, color, size, addresses, total" (addresses stored for orders)
// - User can save multiple addresses for quick checkout
// - One address can be marked as "default" for faster checkout flow
//
// SECURITY NOTES:
// - All endpoints require authentication (req.user comes from auth middleware)
// - Users can ONLY access their own addresses (user_id check on every query)
// - No cross-user address access possible
//
// ROUTES THAT USE THIS:
// - GET    /api/addresses         → getAllAddresses
// - GET    /api/addresses/:id     → getAddress
// - POST   /api/addresses         → addAddress
// - PUT    /api/addresses/:id     → updateAddress
// - PATCH  /api/addresses/:id/default → setDefaultAddress
// - DELETE /api/addresses/:id     → deleteAddress
//
// ============================================================================

import { query } from "../db/db.js";


// ============================================================================
// GET ALL ADDRESSES
// Returns all addresses for the logged-in user
// ============================================================================

export const getAllAddresses = async (req, res) => {
  try {
    // req.user is set by auth middleware after JWT verification
    const userId = req.user.id;

    // Fetch all addresses for this user
    // ORDER BY is_default DESC puts the default address first in the list
    // This is convenient for the frontend - default shows at top
    const addresses = await query(
      `SELECT 
        id,
        full_name,
        phone,
        address1,
        address2,
        city,
        state,
        postal_code,
        country,
        is_default
       FROM addresses
       WHERE user_id = $1
       ORDER BY is_default DESC`,
      [userId]
    );

    return res.json({
      success: true,
      addresses: addresses.rows
    });

  } catch (err) {
    console.error("GET ADDRESSES ERROR:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};


// ============================================================================
// GET SINGLE ADDRESS
// Returns one specific address by ID (must belong to the user)
// ============================================================================

export const getAddress = async (req, res) => {
  try {
    const userId = req.user.id;
    const { addressId } = req.params;

    // Note the WHERE clause: id = $1 AND user_id = $2
    // This ensures users can't fetch someone else's address by guessing IDs
    const address = await query(
      `SELECT 
        id,
        full_name,
        phone,
        address1,
        address2,
        city,
        state,
        postal_code,
        country,
        is_default
       FROM addresses
       WHERE id = $1 AND user_id = $2`,
      [addressId, userId]
    );

    // If no rows returned, either address doesn't exist OR it belongs to someone else
    // We return the same 404 for both cases (don't leak info about other users' addresses)
    if (address.rows.length === 0) {
      return res.status(404).json({ error: "Address not found" });
    }

    return res.json({
      success: true,
      address: address.rows[0]
    });

  } catch (err) {
    console.error("GET ADDRESS ERROR:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};


// ============================================================================
// ADD ADDRESS
// Creates a new address for the logged-in user
// ============================================================================

export const addAddress = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      full_name,
      phone,
      address1,
      address2,      // Optional - apt/suite number
      city,
      state,
      postal_code,
      country,
      is_default
    } = req.body;

    // ---------- VALIDATION ----------
    // These fields are required for a valid shipping address
    // address2 is optional (not everyone has an apt number)
    if (!full_name || !phone || !address1 || !city || !state || !postal_code || !country) {
      return res.status(400).json({ 
        error: "Missing required fields" 
      });
    }

    // ---------- HANDLE DEFAULT ADDRESS ----------
    // Only ONE address can be default at a time
    // If this new one is marked default, unset all others first
    if (is_default) {
      await query(
        `UPDATE addresses SET is_default = FALSE WHERE user_id = $1`,
        [userId]
      );
    }

    // ---------- INSERT NEW ADDRESS ----------
    // RETURNING gives us the created row back without a separate SELECT
    const result = await query(
      `INSERT INTO addresses (
        user_id,
        full_name,
        phone,
        address1,
        address2,
        city,
        state,
        postal_code,
        country,
        is_default
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, full_name, phone, address1, address2, city, state, postal_code, country, is_default`,
      [userId, full_name, phone, address1, address2, city, state, postal_code, country, is_default || false]
    );

    // 201 Created - the address now exists
    return res.status(201).json({
      success: true,
      message: "Address added successfully",
      address: result.rows[0]
    });

  } catch (err) {
    console.error("ADD ADDRESS ERROR:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};


// ============================================================================
// UPDATE ADDRESS
// Modifies an existing address (must belong to the user)
// ============================================================================

export const updateAddress = async (req, res) => {
  try {
    const userId = req.user.id;
    const { addressId } = req.params;
    const {
      full_name,
      phone,
      address1,
      address2,
      city,
      state,
      postal_code,
      country,
      is_default
    } = req.body;

    // ---------- OWNERSHIP CHECK ----------
    // First verify this address actually belongs to the user
    // Can't let users update someone else's address!
    const existing = await query(
      `SELECT id FROM addresses WHERE id = $1 AND user_id = $2`,
      [addressId, userId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Address not found" });
    }

    // ---------- HANDLE DEFAULT ADDRESS ----------
    // Same pattern as addAddress - unset others if this becomes default
    if (is_default) {
      await query(
        `UPDATE addresses SET is_default = FALSE WHERE user_id = $1`,
        [userId]
      );
    }

    // ---------- UPDATE ADDRESS ----------
    // Using COALESCE so we only update fields that were provided
    // If a field is null/undefined in the request, keep the existing value
    // This allows partial updates (e.g., just change the phone number)
    const result = await query(
      `UPDATE addresses
       SET full_name = COALESCE($1, full_name),
           phone = COALESCE($2, phone),
           address1 = COALESCE($3, address1),
           address2 = COALESCE($4, address2),
           city = COALESCE($5, city),
           state = COALESCE($6, state),
           postal_code = COALESCE($7, postal_code),
           country = COALESCE($8, country),
           is_default = COALESCE($9, is_default)
       WHERE id = $10
       RETURNING id, full_name, phone, address1, address2, city, state, postal_code, country, is_default`,
      [full_name, phone, address1, address2, city, state, postal_code, country, is_default, addressId]
    );

    return res.json({
      success: true,
      message: "Address updated successfully",
      address: result.rows[0]
    });

  } catch (err) {
    console.error("UPDATE ADDRESS ERROR:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};


// ============================================================================
// SET DEFAULT ADDRESS
// Marks a specific address as the user's default (for quick checkout)
// ============================================================================

export const setDefaultAddress = async (req, res) => {
  try {
    const userId = req.user.id;
    const { addressId } = req.params;

    // ---------- OWNERSHIP CHECK ----------
    // Same pattern - verify address belongs to user
    const existing = await query(
      `SELECT id FROM addresses WHERE id = $1 AND user_id = $2`,
      [addressId, userId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Address not found" });
    }

    // ---------- SWAP DEFAULT ----------
    // Two queries: first unset all, then set the new one
    // Could do this in one query with CASE WHEN, but this is clearer
    // Also handles edge case where user has no addresses yet (first query is a no-op)
    
    // Step 1: Unset all defaults for this user
    await query(
      `UPDATE addresses SET is_default = FALSE WHERE user_id = $1`,
      [userId]
    );

    // Step 2: Set the specified address as default
    await query(
      `UPDATE addresses SET is_default = TRUE WHERE id = $1`,
      [addressId]
    );

    return res.json({
      success: true,
      message: "Default address updated"
    });

  } catch (err) {
    console.error("SET DEFAULT ADDRESS ERROR:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};


// ============================================================================
// DELETE ADDRESS
// Removes an address from the user's account
// ============================================================================

export const deleteAddress = async (req, res) => {
  try {
    const userId = req.user.id;
    const { addressId } = req.params;

    // Delete in one query - WHERE clause includes user_id for security
    // RETURNING id lets us know if anything was actually deleted
    const result = await query(
      `DELETE FROM addresses WHERE id = $1 AND user_id = $2 RETURNING id`,
      [addressId, userId]
    );

    // If no rows returned, the address either didn't exist or wasn't theirs
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Address not found" });
    }

    return res.json({
      success: true,
      message: "Address deleted successfully"
    });

  } catch (err) {
    console.error("DELETE ADDRESS ERROR:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};


// ============================================================================
// NOTES & POTENTIAL IMPROVEMENTS
// ============================================================================
//
// 1. Transaction for setDefaultAddress
//    The two UPDATE queries should ideally be in a transaction
//    If the second fails, the first already ran and user has NO default
//    For now it's fine - worst case user re-clicks the button
//
// 2. Validation could be more robust
//    - Validate postal_code format based on country
//    - Validate phone number format
//    - Sanitize inputs for XSS (though we're using parameterized queries)
//
// 3. Consider soft delete
//    Instead of DELETE, could set a deleted_at timestamp
//    This preserves address history for old orders
//    But we reference addresses by ID in orders, so they're preserved anyway
//
// 4. Guest address handling
//    This controller assumes authenticated users
//    Guest checkout creates addresses differently (in checkout flow)
//    Guest addresses have user_id = NULL
//
// ============================================================================