import { query } from "../db/db.js";
import {
  encryptCardSegment,
  decryptCardSegment,
  validateCardNumber,
  validateExpiry,
  splitCardNumber,
  maskCardNumber
} from "../utils/cardEncryption.js";

// ---------------------------------------------------
// SAVE CARD (for registered users only)
// ---------------------------------------------------
export const saveCard = async (req, res) => {
  try {
    const userId = req.user.id;
    const { card_number, expiry, card_type } = req.body;

    // Validate card type (DEBIT only)
    if (card_type && card_type.toUpperCase() !== 'DEBIT') {
      return res.status(400).json({ 
        error: "Only debit payment is supported!" 
      });
    }

    // Validate card number
    const cardValidation = validateCardNumber(card_number);
    if (!cardValidation.valid) {
      return res.status(400).json({ error: cardValidation.message });
    }

    // Validate expiry
    const expiryValidation = validateExpiry(expiry);
    if (!expiryValidation.valid) {
      return res.status(400).json({ error: expiryValidation.message });
    }

    // Split card into segments
    const segments = splitCardNumber(card_number);

    // Encrypt each segment separately
    const segment1_encrypted = encryptCardSegment(segments.segment1);
    const segment2_encrypted = encryptCardSegment(segments.segment2);
    const segment3_encrypted = encryptCardSegment(segments.segment3);
    const segment4_encrypted = encryptCardSegment(segments.segment4);
    const expiry_encrypted = encryptCardSegment(expiry);

    // Check if user already has a card
    const existingCard = await query(
      `SELECT id FROM payment_cards WHERE user_id=$1`,
      [userId]
    );

    if (existingCard.rows.length > 0) {
      // Update existing card
      await query(
        `UPDATE payment_cards 
         SET segment1_encrypted=$1,
             segment2_encrypted=$2,
             segment3_encrypted=$3,
             segment4_encrypted=$4,
             expiry_encrypted=$5,
             last4_plain=$6,
             card_type='DEBIT'
         WHERE user_id=$7`,
        [
          segment1_encrypted,
          segment2_encrypted,
          segment3_encrypted,
          segment4_encrypted,
          expiry_encrypted,
          segments.segment4,
          userId
        ]
      );
    } else {
      // Insert new card
      await query(
        `INSERT INTO payment_cards 
         (user_id, segment1_encrypted, segment2_encrypted, segment3_encrypted, 
          segment4_encrypted, expiry_encrypted, last4_plain, card_type, is_default)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'DEBIT', TRUE)`,
        [
          userId,
          segment1_encrypted,
          segment2_encrypted,
          segment3_encrypted,
          segment4_encrypted,
          expiry_encrypted,
          segments.segment4
        ]
      );
    }

    return res.json({
      success: true,
      message: "Card saved securely (Demo - Encrypted storage)",
      masked_card: maskCardNumber(segments.segment4)
    });

  } catch (err) {
    console.error("SAVE CARD ERROR:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ---------------------------------------------------
// GET SAVED CARD (masked, for display only)
// ---------------------------------------------------
export const getSavedCard = async (req, res) => {
  try {
    const userId = req.user.id;

    const card = await query(
      `SELECT last4_plain, card_type, created_at 
       FROM payment_cards 
       WHERE user_id=$1`,
      [userId]
    );

    if (card.rows.length === 0) {
      return res.json({
        success: true,
        has_saved_card: false,
        card: null
      });
    }

    return res.json({
      success: true,
      has_saved_card: true,
      card: {
        masked_number: maskCardNumber(card.rows[0].last4_plain),
        card_type: card.rows[0].card_type,
        saved_at: card.rows[0].created_at
      }
    });

  } catch (err) {
    console.error("GET SAVED CARD ERROR:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ---------------------------------------------------
// DELETE SAVED CARD
// ---------------------------------------------------
export const deleteSavedCard = async (req, res) => {
  try {
    const userId = req.user.id;

    await query(
      `DELETE FROM payment_cards WHERE user_id=$1`,
      [userId]
    );

    return res.json({
      success: true,
      message: "Card deleted successfully"
    });

  } catch (err) {
    console.error("DELETE CARD ERROR:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ---------------------------------------------------
// VERIFY CARD FOR PAYMENT (internal use - decrypts and validates)
// ---------------------------------------------------
export async function verifyCardForPayment(userId, cvc) {
  try {
    const card = await query(
      `SELECT segment1_encrypted, segment2_encrypted, segment3_encrypted, 
              segment4_encrypted, expiry_encrypted, card_type, last4_plain
       FROM payment_cards 
       WHERE user_id=$1`,
      [userId]
    );

    if (card.rows.length === 0) {
      throw new Error("No saved card found");
    }

    // Decrypt all segments
    const segment1 = decryptCardSegment(card.rows[0].segment1_encrypted);
    const segment2 = decryptCardSegment(card.rows[0].segment2_encrypted);
    const segment3 = decryptCardSegment(card.rows[0].segment3_encrypted);
    const segment4 = decryptCardSegment(card.rows[0].segment4_encrypted);
    const expiry = decryptCardSegment(card.rows[0].expiry_encrypted);

    // Reconstruct full card number
    const fullCardNumber = segment1 + segment2 + segment3 + segment4;

    // Validate CVC format
    if (!/^\d{3}$/.test(cvc)) {
      throw new Error("Invalid CVC format");
    }

    // Validate expiry
    const expiryValidation = validateExpiry(expiry);
    if (!expiryValidation.valid) {
      throw new Error(expiryValidation.message);
    }

    // Validate card number
    const cardValidation = validateCardNumber(fullCardNumber);
    if (!cardValidation.valid) {
      throw new Error(cardValidation.message);
    }

    return {
      valid: true,
      card_number: fullCardNumber,
      expiry: expiry,
      cvc: cvc,
      card_type: card.rows[0].card_type,
      last4: card.rows[0].last4_plain
    };

  } catch (err) {
    console.error("VERIFY CARD ERROR:", err);
    throw err;
  }
}

// ---------------------------------------------------
// PROCESS ONE-TIME PAYMENT (for guest or new card)
// ---------------------------------------------------
export async function processOneTimePayment(cardData) {
  const { card_number, expiry, cvc, card_type } = cardData;

  // Validate card type
  if (card_type && card_type.toUpperCase() !== 'DEBIT') {
    throw new Error("Only debit payment is supported!");
  }

  // Validate card number
  const cardValidation = validateCardNumber(card_number);
  if (!cardValidation.valid) {
    throw new Error(cardValidation.message);
  }

  // Validate expiry
  const expiryValidation = validateExpiry(expiry);
  if (!expiryValidation.valid) {
    throw new Error(expiryValidation.message);
  }

  // Validate CVC
  if (!/^\d{3}$/.test(cvc)) {
    throw new Error("Invalid CVC format");
  }

  // Get last 4 digits
  const cleaned = card_number.replace(/\s+/g, '');
  const last4 = cleaned.substring(12, 16);

  // Simulate success
  return {
    success: true,
    transaction_id: `TXN-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    message: "Payment processed successfully (Demo)",
    last4: last4
  };
}