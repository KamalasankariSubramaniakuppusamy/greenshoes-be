// ============================================================================
//  Let's encrypt and validate payment card data–I'm not implementing a full payment 
// gateway, but I want to show secure handling of card info for saved cards
// This also satisfies the requirement to save card info for registered users
// ============================================================================
// Utility functions for payment card handling
// Encryption, validation, and formatting helpers
//
// IMPORTANT: This is a DEMO implementation for educational purposes
// In production, you would NOT roll your own card encryption
// Use Stripe, Square, Braintree - they handle PCI compliance for you
//
// That said, this demonstrates real cryptographic concepts:
// - AES-256-CBC symmetric encryption
// - Random IVs for each encryption (same data encrypts differently each time)
// - Luhn algorithm for card validation

import crypto from 'crypto';

// ----------------------------------------------------------------------------
// ENCRYPTION SETUP
// ----------------------------------------------------------------------------
// AES-256 requires exactly 32 bytes (256 bits) for the key
// This key should be a random string, generated once, stored securely
// Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex').slice(0,32))"
//
const ENCRYPTION_KEY = process.env.CARD_ENCRYPTION_KEY;
const ALGORITHM = 'aes-256-cbc';  // CBC = Cipher Block Chaining

// Fail fast if key is missing or wrong length
// Better to crash on startup than silently fail during a transaction
if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
  throw new Error('CARD_ENCRYPTION_KEY must be exactly 32 characters in .env file');
}


// ----------------------------------------------------------------------------
// Encrypt a card segment
// ----------------------------------------------------------------------------
// We encrypt each 4-digit segment separately (defense in depth)
// Even if one segment is compromised, attacker doesn't have full card
//
// Returns format: "iv:encryptedData" (both needed for decryption)
// IV (Initialization Vector) is random each time, so encrypting "1234" twice
// gives different ciphertext - prevents pattern analysis
//
export function encryptCardSegment(segment) {
  // Generate random 16-byte IV for this encryption
  const iv = crypto.randomBytes(16);
  
  // Create cipher with our key and the random IV
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
  
  // Encrypt the segment
  let encrypted = cipher.update(segment, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  // Return IV + encrypted data together
  // We need the IV to decrypt, so store them together
  return iv.toString('hex') + ':' + encrypted;
}


// ----------------------------------------------------------------------------
// Decrypt a card segment
// ----------------------------------------------------------------------------
// Reverses the encryption - extracts IV, then decrypts
// Only works if you have the same ENCRYPTION_KEY that was used to encrypt
//
export function decryptCardSegment(encryptedData) {
  // Split the stored value into IV and ciphertext
  const parts = encryptedData.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  
  // Create decipher with same key and the stored IV
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
  
  // Decrypt back to plaintext
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}


// ----------------------------------------------------------------------------
// Validate card number using Luhn algorithm
// ----------------------------------------------------------------------------
// The Luhn algorithm (also called mod-10) is a checksum formula
// All real credit/debit cards pass this check
// It catches most typos (single digit errors, transpositions)
//
// How it works:
// 1. Starting from rightmost digit, double every second digit
// 2. If doubling results in > 9, subtract 9
// 3. Sum all digits
// 4. If sum is divisible by 10, card number is valid
//
export function validateCardNumber(cardNumber) {
  // Remove any spaces (cards are often formatted as "1234 5678 9012 3456")
  const cleaned = cardNumber.replace(/\s+/g, '');
  
  // Must be exactly 16 digits
  if (!/^\d{16}$/.test(cleaned)) {
    return { valid: false, message: 'Card number must be 16 digits' };
  }
  
  // Luhn algorithm implementation
  let sum = 0;
  let isEven = false;  // Start from right, first digit is "odd" position
  
  // Process right to left
  for (let i = cleaned.length - 1; i >= 0; i--) {
    let digit = parseInt(cleaned[i]);
    
    if (isEven) {
      digit *= 2;
      if (digit > 9) digit -= 9;  // Same as summing the two digits (e.g., 18 -> 1+8=9)
    }
    
    sum += digit;
    isEven = !isEven;  // Alternate
  }
  
  // Valid if sum is multiple of 10
  const valid = sum % 10 === 0;
  return { 
    valid, 
    message: valid ? 'Valid card number' : 'Invalid card number (Luhn check failed)' 
  };
}


// ----------------------------------------------------------------------------
// Validate expiry date
// ----------------------------------------------------------------------------
// Checks format (MM/YYYY) and that card hasn't expired
// Cards are valid through the end of their expiry month
//
export function validateExpiry(expiry) {
  // Strict format: MM/YYYY
  // Month must be 01-12
  const match = expiry.match(/^(0[1-9]|1[0-2])\/(\d{4})$/);
  
  if (!match) {
    return { valid: false, message: 'Expiry must be in MM/YYYY format' };
  }
  
  const month = parseInt(match[1]);
  const year = parseInt(match[2]);
  
  // Check if expired
  const now = new Date();
  const currentMonth = now.getMonth() + 1;  // getMonth() is 0-indexed
  const currentYear = now.getFullYear();
  
  // Expired if year is in past, or same year but month has passed
  if (year < currentYear || (year === currentYear && month < currentMonth)) {
    return { valid: false, message: 'Card has expired' };
  }
  
  return { valid: true, message: 'Valid expiry date' };
}


// ----------------------------------------------------------------------------
// Split card number into 4 segments
// ----------------------------------------------------------------------------
// We store each 4-digit chunk separately, each with its own encryption
// This is overkill for a demo but demonstrates defense in depth
//
export function splitCardNumber(cardNumber) {
  const cleaned = cardNumber.replace(/\s+/g, '');
  
  return {
    segment1: cleaned.substring(0, 4),   // First 4 digits (includes BIN/IIN)
    segment2: cleaned.substring(4, 8),   // 
    segment3: cleaned.substring(8, 12),  // 
    segment4: cleaned.substring(12, 16)  // Last 4 (safe to display)
  };
}


// ----------------------------------------------------------------------------
// Mask card number for display
// ----------------------------------------------------------------------------
// Standard format for showing a card without revealing the full number
// Only the last 4 digits are shown - this is safe and expected
//
export function maskCardNumber(last4) {
  return `**** **** **** ${last4}`;
}


// ============================================================================
// NOTES ON REAL-WORLD CARD HANDLING
// ============================================================================
//
// In a production system, you would NEVER:
// - Store full card numbers (even encrypted)
// - Handle raw card data on your servers at all
//
// Instead, you'd use a payment processor's hosted fields or SDK:
// - Stripe Elements: Card input is an iframe, card data never touches your server
// - Square Web Payments SDK: Same idea
// - Braintree Drop-in: Same idea
//
// The processor gives you a TOKEN representing the card
// You store the token, not the card
// When you charge, you send the token to the processor
// This keeps you out of PCI-DSS scope (mostly)
//
// This demo implementation exists to show the concepts of:
// - Symmetric encryption with random IVs
// - Card validation algorithms
// - Defense in depth (segmented storage)
//
// ============================================================================