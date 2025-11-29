import { query } from "../db/db.js";

// ---------------------------------------------------
// GET ALL ADDRESSES (for logged-in user)
// ---------------------------------------------------
export const getAllAddresses = async (req, res) => {
  try {
    const userId = req.user.id;

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

// ---------------------------------------------------
// GET SINGLE ADDRESS
// ---------------------------------------------------
export const getAddress = async (req, res) => {
  try {
    const userId = req.user.id;
    const { addressId } = req.params;

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

// ---------------------------------------------------
// ADD ADDRESS
// ---------------------------------------------------
export const addAddress = async (req, res) => {
  try {
    const userId = req.user.id;
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

    // Validate required fields
    if (!full_name || !phone || !address1 || !city || !state || !postal_code || !country) {
      return res.status(400).json({ 
        error: "Missing required fields" 
      });
    }

    // If this is set as default, unset all other defaults first
    if (is_default) {
      await query(
        `UPDATE addresses SET is_default = FALSE WHERE user_id = $1`,
        [userId]
      );
    }

    // Insert new address
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

// ---------------------------------------------------
// UPDATE ADDRESS
// ---------------------------------------------------
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

    // Verify address belongs to user
    const existing = await query(
      `SELECT id FROM addresses WHERE id = $1 AND user_id = $2`,
      [addressId, userId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Address not found" });
    }

    // If setting as default, unset all other defaults first
    if (is_default) {
      await query(
        `UPDATE addresses SET is_default = FALSE WHERE user_id = $1`,
        [userId]
      );
    }

    // Update address
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

// ---------------------------------------------------
// SET DEFAULT ADDRESS
// ---------------------------------------------------
export const setDefaultAddress = async (req, res) => {
  try {
    const userId = req.user.id;
    const { addressId } = req.params;

    // Verify address belongs to user
    const existing = await query(
      `SELECT id FROM addresses WHERE id = $1 AND user_id = $2`,
      [addressId, userId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Address not found" });
    }

    // Unset all defaults
    await query(
      `UPDATE addresses SET is_default = FALSE WHERE user_id = $1`,
      [userId]
    );

    // Set this as default
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

// ---------------------------------------------------
// DELETE ADDRESS
// ---------------------------------------------------
export const deleteAddress = async (req, res) => {
  try {
    const userId = req.user.id;
    const { addressId } = req.params;

    const result = await query(
      `DELETE FROM addresses WHERE id = $1 AND user_id = $2 RETURNING id`,
      [addressId, userId]
    );

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