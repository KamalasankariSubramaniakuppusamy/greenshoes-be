// ============================================================================
// paymentCardController.js
// Developer: Kamalasankari Subramaniakuppusamy
// ============================================================================
//
// Payment card management controller - handles saved cards and payment processing
// DEMO SYSTEM - No real payments are processed!
//
// IMPORTANT SECURITY NOTES:
// This is a demonstration system for educational purposes.
// In a real production system:
// - NEVER store full card numbers (use payment processor tokens instead)
// - NEVER implement your own card encryption (use Stripe, Square, etc.)
// - NEVER store CVC at all (PCI-DSS prohibits this)
// - The "expected CVC" generation is purely for demo - real CVCs come from the bank
//
// REQUIREMENTS COVERED:
// - "GreenShoes supports payments only through debit cards"
// - "One user can have only one card"
// - Card storage with encryption (demo implementation)
//
// ROUTES THAT USE THIS:
// - POST   /api/payment/card           -> saveCard
// - GET    /api/payment/card           -> getSavedCard
// - DELETE /api/payment/card           -> deleteSavedCard
// - GET    /api/payment/test-cvc       -> getTestCardCVC (DEMO ONLY!)
//
// INTERNAL FUNCTIONS (used by checkoutController):
// - verifyCardForPayment(userId, cvc)  -> Verifies saved card + CVC
// - processOneTimePayment(cardData)    -> Processes new card payment
//
// ============================================================================

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


// ============================================================================
// HELPER FUNCTIONS - CVC HASHING
// ============================================================================

// ----------------------------------------------------------------------------
// Hash CVC (One-Way Hash for Verification)
// ----------------------------------------------------------------------------
// CVC is hashed with a salt so we can verify it later without storing plaintext
// SHA-256 is one-way - can't recover CVC from hash, only verify it matches
//
// PRODUCTION NOTE: PCI-DSS prohibits storing CVC at all, even hashed!
// This is for demo purposes only. Real systems verify CVC with the bank
// at transaction time and never store it.
//
function hashCVC(cvc, salt) {
  return crypto.createHash('sha256').update(cvc + salt).digest('hex');
}


// ----------------------------------------------------------------------------
// Generate Salt for CVC Hashing
// ----------------------------------------------------------------------------
// Random salt prevents rainbow table attacks
// Each card gets its own unique salt
//
function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}


// ============================================================================
// DEMO SECURITY FUNCTIONS
// These simulate real-world CVC verification for demonstration purposes
// ============================================================================

// ----------------------------------------------------------------------------
// Generate Expected CVC from Card Number (DEMO ONLY!)
// ----------------------------------------------------------------------------
// In production, CVC validation happens at the payment processor/bank level
// We never know the "correct" CVC - the bank validates it during authorization
//
// For this demo, we deterministically generate a CVC from the card number
// so testers can know what CVC to enter for any test card number
//
// WARNING: THIS IS NOT HOW REAL PAYMENT SYSTEMS WORK!
//
function generateExpectedCVC(cardNumber) {
  const cleaned = cardNumber.replace(/\s+/g, '');
  
  // Use a hash of the card number to generate a deterministic 3-digit CVC
  // This ensures the same card always requires the same CVC
  const hash = crypto.createHash('sha256')
    .update(cleaned + 'DEMO_CVC_SECRET')  // Secret ensures we control the generation
    .digest('hex');
  
  // Convert first 6 hex chars to a number, then mod 900 + 100 to get 3-digit CVC
  // This gives us a number between 100-999 (valid CVC range)
  const numericValue = parseInt(hash.substring(0, 6), 16);
  const expectedCVC = (numericValue % 900) + 100;
  
  return expectedCVC.toString();
}


// ----------------------------------------------------------------------------
// Verify CVC for Card (DEMO ONLY!)
// Simulates bank-side CVC verification
// ----------------------------------------------------------------------------
//
// Real flow: Card number + CVC sent to payment processor -> Bank validates CVC
// Demo flow: We calculate expected CVC from card number and compare
//
function verifyCVCForCard(cardNumber, providedCVC) {
  const expectedCVC = generateExpectedCVC(cardNumber);
  
  // Check if provided CVC matches what we expect for this card
  if (providedCVC === expectedCVC) {
    return { valid: true };
  }
  
  // CVC doesn't match - reject the payment
  // In production, this error would come from the bank
  return { 
    valid: false, 
    message: `Invalid CVC. Payment declined by bank. Enter the correct security for your card to proceed checkout!`,
    expectedCVC: expectedCVC // Only for demo - NEVER expose in production!
  };
}


// ============================================================================
// SAVE CARD
// Saves a payment card for a registered user
// REQUIREMENT: "One user can have only one card"
// ============================================================================
//
// Request body: { card_number, expiry, cvc, card_type }
//
// Security measures (demo level):
// - Card number split into 4 segments, each encrypted separately
// - CVC hashed with unique salt (note: real systems don't store CVC at all)
// - Only last 4 digits stored in plain text for display
//
// If user already has a card, it gets replaced (one card per user requirement)
//
export const saveCard = async (req, res) => {
  try {
    const userId = req.user.id;
    const { card_number, expiry, cvc, card_type } = req.body;

    // ---------- VALIDATE CARD TYPE ----------
    // REQUIREMENT: "GreenShoes supports payments only through debit cards"
    if (card_type && card_type.toUpperCase() !== 'DEBIT') {
      return res.status(400).json({ 
        error: "Only debit payment is supported!" 
      });
    }

    // ---------- VALIDATE CARD NUMBER ----------
    // Uses Luhn algorithm check (in cardEncryption.js)
    const cardValidation = validateCardNumber(card_number);
    if (!cardValidation.valid) {
      return res.status(400).json({ error: cardValidation.message });
    }

    // ---------- VALIDATE EXPIRY ----------
    // Checks format and that card isn't expired
    const expiryValidation = validateExpiry(expiry);
    if (!expiryValidation.valid) {
      return res.status(400).json({ error: expiryValidation.message });
    }

    // ---------- VALIDATE CVC FORMAT ----------
    // Must be 3 or 4 digits
    if (!cvc || !/^\d{3,4}$/.test(cvc)) {
      return res.status(400).json({ error: "Valid CVC is required to save card" });
    }

    // ---------- VERIFY CVC IS CORRECT (DEMO) ----------
    // In production, this verification happens at the payment processor
    // For demo, we verify against our generated expected CVC
    const cvcVerification = verifyCVCForCard(card_number, cvc);
    if (!cvcVerification.valid) {
      return res.status(400).json({ 
        error: cvcVerification.message 
      });
    }

    // ---------- SPLIT AND ENCRYPT CARD NUMBER ----------
    // Split into 4 segments of 4 digits each
    // Each segment encrypted separately (defense in depth)
    const segments = splitCardNumber(card_number);

    const segment1_encrypted = encryptCardSegment(segments.segment1);
    const segment2_encrypted = encryptCardSegment(segments.segment2);
    const segment3_encrypted = encryptCardSegment(segments.segment3);
    const segment4_encrypted = encryptCardSegment(segments.segment4);
    const expiry_encrypted = encryptCardSegment(expiry);

    // ---------- HASH CVC WITH SALT ----------
    // One-way hash - can verify later but can't recover original
    // NOTE: Real PCI-compliant systems NEVER store CVC!
    const cvcSalt = generateSalt();
    const cvcHash = hashCVC(cvc, cvcSalt);

    // ---------- SAVE TO DATABASE ----------
    // Check if user already has a card (one card per user)
    const existingCard = await query(
      `SELECT id FROM payment_cards WHERE user_id=$1`,
      [userId]
    );

    if (existingCard.rows.length > 0) {
      // Update existing card - replace the old one
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
          segments.segment4,  // Last 4 digits stored plain for display
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
      masked_card: maskCardNumber(segments.segment4)  // Returns "**** **** **** 1234"
    });

  } catch (err) {
    console.error("SAVE CARD ERROR:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};


// ============================================================================
// GET SAVED CARD
// Returns masked card info for display (never returns full card number!)
// ============================================================================
//
// Used in checkout to show "Pay with card ending in 1234"
// Also used in account settings to show saved card
//
export const getSavedCard = async (req, res) => {
  try {
    const userId = req.user.id;

    // Only fetch display-safe fields - never the encrypted segments
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
        masked_number: maskCardNumber(card.rows[0].last4_plain),  // "**** **** **** 1234"
        card_type: card.rows[0].card_type,
        saved_at: card.rows[0].created_at
      }
    });

  } catch (err) {
    console.error("GET SAVED CARD ERROR:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};


// ============================================================================
// DELETE SAVED CARD
// Removes user's saved card from the system
// ============================================================================
//
// User might want to delete card when:
// - They got a new card
// - Security concern
// - Closing their account
//
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


// ============================================================================
// VERIFY CARD FOR PAYMENT (Internal Function)
// Used by checkoutController to verify saved card before charging
// ============================================================================
//
// This function:
// 1. Retrieves the encrypted card data
// 2. Verifies the CVC against stored hash
// 3. Decrypts the card segments
// 4. Validates card number and expiry are still valid
// 5. Returns full card data for payment processing
//
// Throws error if anything fails - caller should catch and handle
//
export async function verifyCardForPayment(userId, cvc) {
  try {
    // Get all card data including encrypted segments and CVC hash
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

    // ---------- VALIDATE CVC FORMAT ----------
    if (!/^\d{3,4}$/.test(cvc)) {
      throw new Error("Invalid CVC format");
    }

    // ---------- VERIFY CVC AGAINST STORED HASH ----------
    // This is the security check - proves user still has the physical card
    if (cardData.cvc_hash && cardData.cvc_salt) {
      const providedCvcHash = hashCVC(cvc, cardData.cvc_salt);
      if (providedCvcHash !== cardData.cvc_hash) {
        throw new Error("Invalid CVC. Please enter the correct security code.");
      }
    } else {
      // Card was saved before we added CVC hashing - security risk!
      // Force user to re-add their card with the new security measures
      throw new Error("Card security data is outdated. Please delete and re-add your card in Account Settings.");
    }

    // ---------- DECRYPT CARD SEGMENTS ----------
    const segment1 = decryptCardSegment(cardData.segment1_encrypted);
    const segment2 = decryptCardSegment(cardData.segment2_encrypted);
    const segment3 = decryptCardSegment(cardData.segment3_encrypted);
    const segment4 = decryptCardSegment(cardData.segment4_encrypted);
    const expiry = decryptCardSegment(cardData.expiry_encrypted);

    // Reconstruct full card number
    const fullCardNumber = segment1 + segment2 + segment3 + segment4;

    // ---------- VALIDATE EXPIRY (might have expired since saving) ----------
    const expiryValidation = validateExpiry(expiry);
    if (!expiryValidation.valid) {
      throw new Error(expiryValidation.message);
    }

    // ---------- VALIDATE CARD NUMBER (sanity check) ----------
    const cardValidation = validateCardNumber(fullCardNumber);
    if (!cardValidation.valid) {
      throw new Error(cardValidation.message);
    }

    // All checks passed - return card data for payment processing
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
    throw err;  // Re-throw for caller to handle
  }
}


// ============================================================================
// PROCESS ONE-TIME PAYMENT (Internal Function)
// Used for guest checkout or when paying with a new card
// ============================================================================
//
// This function validates and "processes" a one-time card payment
// Card data is NOT saved (use saveCard for that)
//
// In production, this would:
// 1. Send card data to payment processor (Stripe, Square, etc.)
// 2. Payment processor contacts bank
// 3. Bank validates CVC, available funds, fraud checks
// 4. Returns approval/decline
//
// For demo, we just validate the data and return a fake transaction ID
//
export async function processOneTimePayment(cardData) {
  const { card_number, expiry, cvc, card_type } = cardData;

  // ---------- VALIDATE CARD TYPE ----------
  // REQUIREMENT: Debit cards only
  if (card_type && card_type.toUpperCase() !== 'DEBIT') {
    throw new Error("Only debit payment is supported!");
  }

  // ---------- VALIDATE CARD NUMBER ----------
  const cardValidation = validateCardNumber(card_number);
  if (!cardValidation.valid) {
    throw new Error(cardValidation.message);
  }

  // ---------- VALIDATE EXPIRY ----------
  const expiryValidation = validateExpiry(expiry);
  if (!expiryValidation.valid) {
    throw new Error(expiryValidation.message);
  }

  // ---------- VALIDATE CVC FORMAT ----------
  if (!/^\d{3,4}$/.test(cvc)) {
    throw new Error("Invalid CVC format");
  }

  // ---------- VERIFY CVC (DEMO) ----------
  // Simulates bank-side CVC verification
  const cvcVerification = verifyCVCForCard(card_number, cvc);
  if (!cvcVerification.valid) {
    throw new Error(cvcVerification.message);
  }

  // ---------- EXTRACT LAST 4 DIGITS ----------
  const cleaned = card_number.replace(/\s+/g, '');
  const last4 = cleaned.substring(12, 16);

  // ---------- SIMULATE SUCCESSFUL PAYMENT ----------
  // In production, this would be the response from the payment processor
  return {
    success: true,
    transaction_id: `TXN-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    message: "Payment processed successfully (Demo)",
    last4: last4
  };
}


// ============================================================================
// GET TEST CARD CVC (DEMO UTILITY ENDPOINT)
// Helps testers know the valid CVC for any test card number
// ============================================================================
//
// WARNING: This endpoint would NEVER exist in a production system!
// It's purely for demo/testing purposes so testers can know what CVC to enter
//
// Usage: GET /api/payment/test-cvc?card_number=4111111111111111
// Returns: { expected_cvc: "123" }
//
export const getTestCardCVC = async (req, res) => {
  try {
    const { card_number } = req.query;
    
    if (!card_number) {
      return res.status(400).json({ error: "card_number query param required" });
    }

    // Validate the card number first
    const cardValidation = validateCardNumber(card_number);
    if (!cardValidation.valid) {
      return res.status(400).json({ error: cardValidation.message });
    }

    // Generate the expected CVC for this card
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


// ============================================================================
// NOTES & SECURITY CONSIDERATIONS
// ============================================================================
//
// Why this implementation is DEMO-ONLY and not production-ready:
//
// 1. PCI-DSS Compliance
//    - Real systems NEVER store full card numbers
//    - Use tokenization from Stripe, Square, Braintree, etc.
//    - The payment processor handles all card data
//
// 2. CVC Storage
//    - PCI-DSS explicitly forbids storing CVC
//    - Even hashed storage is non-compliant
//    - CVC should only exist in memory during transaction
//
// 3. Encryption Key Management
//    - This demo stores encryption key in environment variable
//    - Production needs HSM (Hardware Security Module) or KMS
//    - Key rotation, access logging, etc.
//
// 4. The "Expected CVC" Concept
//    - Completely fictional for demo purposes
//    - Real CVCs are printed on physical cards by the bank
//    - Only the bank can validate a CVC
//
// 5. Transaction Processing
//    - Real payments require payment processor integration
//    - 3D Secure / SCA for European cards
//    - Fraud detection, AVS checks, etc.
//
//
// ============================================================================