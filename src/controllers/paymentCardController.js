import { query } from "../db/db.js";
import crypto from 'crypto';
import {
  encryptCardSegment,
  decryptCardSegment,
  validateCardNumber,
  validateExpiry,
  splitCardNumber,
  maskCardNumber
} from "../utils/cardEncryption.js";

// ---------------------------------------------------
// Helper: Hash CVC (one-way hash for verification)
// ---------------------------------------------------
function hashCVC(cvc, salt) {
  return crypto.createHash('sha256').update(cvc + salt).digest('hex');
}

// ---------------------------------------------------
// Helper: Generate salt for CVC hashing
// ---------------------------------------------------
function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

// ---------------------------------------------------
// DEMO SECURITY: Generate expected CVC from card number
// In production, this validation happens at the payment processor/bank.
// For demo purposes, we deterministically generate the "correct" CVC
// based on the card number, simulating real-world CVC verification.
// ---------------------------------------------------
function generateExpectedCVC(cardNumber) {
  const cleaned = cardNumber.replace(/\s+/g, '');
  
  // Use a hash of the card number to generate a deterministic 3-digit CVC
  // This ensures the same card always requires the same CVC
  const hash = crypto.createHash('sha256')
    .update(cleaned + 'DEMO_CVC_SECRET')
    .digest('hex');
  
  // Convert first 6 hex chars to a number, then mod 900 + 100 to get 3-digit CVC
  const numericValue = parseInt(hash.substring(0, 6), 16);
  const expectedCVC = (numericValue % 900) + 100; // Results in 100-999
  
  return expectedCVC.toString();
}

// ---------------------------------------------------
// DEMO SECURITY: Verify CVC for one-time payments
// Simulates bank-side CVC verification
// ---------------------------------------------------
function verifyCVCForCard(cardNumber, providedCVC) {
  const expectedCVC = generateExpectedCVC(cardNumber);
  
  // For demo convenience: Also accept the expected CVC displayed in error
  // In production, user would need to know their actual card's CVC
  if (providedCVC === expectedCVC) {
    return { valid: true };
  }
  
  return { 
    valid: false, 
    message: `Invalid CVC. Payment declined by bank. Enter the correct security for your card to proceed checkout!)`,
    expectedCVC: expectedCVC // Only for demo - NEVER expose in production!
  };
}

// ---------------------------------------------------
// SAVE CARD (for registered users only)
// Now also stores hashed CVC for verification
// ---------------------------------------------------
export const saveCard = async (req, res) => {
  try {
    const userId = req.user.id;
    const { card_number, expiry, cvc, card_type } = req.body;

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

    // Validate CVC format
    if (!cvc || !/^\d{3,4}$/.test(cvc)) {
      return res.status(400).json({ error: "Valid CVC is required to save card" });
    }

    // SECURITY FIX: Verify CVC is correct before allowing card to be saved
    const cvcVerification = verifyCVCForCard(card_number, cvc);
    if (!cvcVerification.valid) {
      return res.status(400).json({ 
        error: cvcVerification.message 
      });
    }

    // Split card into segments
    const segments = splitCardNumber(card_number);

    // Encrypt each segment separately
    const segment1_encrypted = encryptCardSegment(segments.segment1);
    const segment2_encrypted = encryptCardSegment(segments.segment2);
    const segment3_encrypted = encryptCardSegment(segments.segment3);
    const segment4_encrypted = encryptCardSegment(segments.segment4);
    const expiry_encrypted = encryptCardSegment(expiry);

    // Hash CVC with salt for secure storage
    const cvcSalt = generateSalt();
    const cvcHash = hashCVC(cvc, cvcSalt);

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
             card_type='DEBIT',
             cvc_hash=$7,
             cvc_salt=$8
         WHERE user_id=$9`,
        [
          segment1_encrypted,
          segment2_encrypted,
          segment3_encrypted,
          segment4_encrypted,
          expiry_encrypted,
          segments.segment4,
          cvcHash,
          cvcSalt,
          userId
        ]
      );
    } else {
      // Insert new card
      await query(
        `INSERT INTO payment_cards 
         (user_id, segment1_encrypted, segment2_encrypted, segment3_encrypted, 
          segment4_encrypted, expiry_encrypted, last4_plain, card_type, is_default,
          cvc_hash, cvc_salt)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'DEBIT', TRUE, $8, $9)`,
        [
          userId,
          segment1_encrypted,
          segment2_encrypted,
          segment3_encrypted,
          segment4_encrypted,
          expiry_encrypted,
          segments.segment4,
          cvcHash,
          cvcSalt
        ]
      );
    }

    return res.json({
      success: true,
      message: "Card saved securely (Demo - Encrypted storage with CVC verification)",
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
// NOW VERIFIES CVC AGAINST STORED HASH
// ---------------------------------------------------
export async function verifyCardForPayment(userId, cvc) {
  try {
    const card = await query(
      `SELECT segment1_encrypted, segment2_encrypted, segment3_encrypted, 
              segment4_encrypted, expiry_encrypted, card_type, last4_plain,
              cvc_hash, cvc_salt
       FROM payment_cards 
       WHERE user_id=$1`,
      [userId]
    );

    if (card.rows.length === 0) {
      throw new Error("No saved card found");
    }

    const cardData = card.rows[0];

    // Validate CVC format
    if (!/^\d{3,4}$/.test(cvc)) {
      throw new Error("Invalid CVC format");
    }

    // SECURITY FIX: Verify CVC against stored hash
    if (cardData.cvc_hash && cardData.cvc_salt) {
      const providedCvcHash = hashCVC(cvc, cardData.cvc_salt);
      if (providedCvcHash !== cardData.cvc_hash) {
        throw new Error("Invalid CVC. Please enter the correct security code.");
      }
    } else {
      // Legacy card without CVC hash - BLOCK the transaction for security
      throw new Error("Card security data is outdated. Please delete and re-add your card in Account Settings.");
    }

    // Decrypt all segments
    const segment1 = decryptCardSegment(cardData.segment1_encrypted);
    const segment2 = decryptCardSegment(cardData.segment2_encrypted);
    const segment3 = decryptCardSegment(cardData.segment3_encrypted);
    const segment4 = decryptCardSegment(cardData.segment4_encrypted);
    const expiry = decryptCardSegment(cardData.expiry_encrypted);

    // Reconstruct full card number
    const fullCardNumber = segment1 + segment2 + segment3 + segment4;

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
      card_type: cardData.card_type,
      last4: cardData.last4_plain
    };

  } catch (err) {
    console.error("VERIFY CARD ERROR:", err.message);
    throw err;
  }
}

// ---------------------------------------------------
// PROCESS ONE-TIME PAYMENT (for guest or new card)
// SECURITY FIX: Now validates CVC against expected value
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

  // Validate CVC format
  if (!/^\d{3,4}$/.test(cvc)) {
    throw new Error("Invalid CVC format");
  }

  // SECURITY FIX: Verify CVC is correct for this card
  // This simulates bank-side CVC verification that happens in production
  const cvcVerification = verifyCVCForCard(card_number, cvc);
  if (!cvcVerification.valid) {
    throw new Error(cvcVerification.message);
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

// ---------------------------------------------------
// UTILITY: Get expected CVC for a test card (DEMO ONLY)
// This endpoint helps testers know the valid CVC for test cards
// REMOVE IN PRODUCTION!
// ---------------------------------------------------
export const getTestCardCVC = async (req, res) => {
  try {
    const { card_number } = req.query;
    
    if (!card_number) {
      return res.status(400).json({ error: "card_number query param required" });
    }

    const cardValidation = validateCardNumber(card_number);
    if (!cardValidation.valid) {
      return res.status(400).json({ error: cardValidation.message });
    }

    const expectedCVC = generateExpectedCVC(card_number);

    return res.json({
      success: true,
      card_number_masked: maskCardNumber(card_number.slice(-4)),
      expected_cvc: expectedCVC,
      note: "DEMO ONLY - This endpoint would not exist in production!"
    });

  } catch (err) {
    console.error("GET TEST CVC ERROR:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};