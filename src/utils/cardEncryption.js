import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.CARD_ENCRYPTION_KEY; // 32 bytes
const ALGORITHM = 'aes-256-cbc';

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
  throw new Error('CARD_ENCRYPTION_KEY must be exactly 32 characters in .env file');
}

// Encrypt a card segment
export function encryptCardSegment(segment) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
  
  let encrypted = cipher.update(segment, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  // Return IV + encrypted data (both needed for decryption)
  return iv.toString('hex') + ':' + encrypted;
}

// Decrypt a card segment
export function decryptCardSegment(encryptedData) {
  const parts = encryptedData.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

// Validate card number (basic Luhn algorithm)
export function validateCardNumber(cardNumber) {
  // Remove spaces
  const cleaned = cardNumber.replace(/\s+/g, '');
  
  // Must be 16 digits
  if (!/^\d{16}$/.test(cleaned)) {
    return { valid: false, message: 'Card number must be 16 digits' };
  }
  
  // Luhn algorithm
  let sum = 0;
  let isEven = false;
  
  for (let i = cleaned.length - 1; i >= 0; i--) {
    let digit = parseInt(cleaned[i]);
    
    if (isEven) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    
    sum += digit;
    isEven = !isEven;
  }
  
  const valid = sum % 10 === 0;
  return { 
    valid, 
    message: valid ? 'Valid card number' : 'Invalid card number (Luhn check failed)' 
  };
}

// Validate expiry date
export function validateExpiry(expiry) {
  // Format: MM/YYYY
  const match = expiry.match(/^(0[1-9]|1[0-2])\/(\d{4})$/);
  
  if (!match) {
    return { valid: false, message: 'Expiry must be in MM/YYYY format' };
  }
  
  const month = parseInt(match[1]);
  const year = parseInt(match[2]);
  
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  
  if (year < currentYear || (year === currentYear && month < currentMonth)) {
    return { valid: false, message: 'Card has expired' };
  }
  
  return { valid: true, message: 'Valid expiry date' };
}

// Extract card segments
export function splitCardNumber(cardNumber) {
  const cleaned = cardNumber.replace(/\s+/g, '');
  
  return {
    segment1: cleaned.substring(0, 4),   // ABCD
    segment2: cleaned.substring(4, 8),   // EFGH
    segment3: cleaned.substring(8, 12),  // IJKL
    segment4: cleaned.substring(12, 16)  // MNOP
  };
}

// Mask card number for display
export function maskCardNumber(last4) {
  return `**** **** **** ${last4}`;
}