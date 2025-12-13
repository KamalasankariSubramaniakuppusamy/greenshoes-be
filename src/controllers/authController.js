// ============================================================================
// authController.js
// Developer: Kamalasankari Subramaniakuppusamy
// ============================================================================
//
// Authentication controller - handles user registration and login
// This is the entry point for all authentication in the system
//
// REQUIREMENTS COVERED:
// - "The software shall provide user registration and login functionality"
// - "Different Admin login URL and customer login to prevent break-in attacks"
//   (Note: Same endpoints, but admin panel does client-side role check)
//
// SECURITY FEATURES:
// - Passwords hashed with bcrypt (cost factor 12)
// - JWT tokens for stateless authentication
// - Tokens expire after 1 hour
// - No password returned in responses
//
// ROUTES THAT USE THIS:
// - POST /api/auth/check-email  → checkEmail
// - POST /api/auth/register     → register
// - POST /api/auth/login        → login
//
// ============================================================================

import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { query } from "../db/db.js";


// ============================================================================
// CHECK EMAIL
// Quick check if an email is already registered
// ============================================================================
//
// Used by the frontend during registration to give real-time feedback
// "This email is already taken" before they fill out the whole form
//
// Returns: { exists: true/false }
//
export const checkEmail = async (req, res) => {
  try {
    const { email } = req.body;

    // Simple existence check - just need to know if ANY row exists
    // LIMIT 1 for efficiency (stop searching after first match)
    const result = await query(
      `SELECT id FROM users WHERE email = $1 LIMIT 1`,
      [email]
    );

    return res.json({ exists: result.rows.length > 0 });

  } catch (err) {
    console.error("CHECK EMAIL ERROR:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};


// ============================================================================
// REGISTER USER
// Creates a new customer account
// REQUIREMENT: "The software shall provide user registration"
// ============================================================================
//
// Creates a new user with role='CUSTOMER' (admins are created differently)
// Returns the user object AND a JWT token so they're logged in immediately
//
// Request body: { fullName, email, password }
// Note: Accepts both 'fullName' and 'full_name' for frontend flexibility
//
export const register = async (req, res) => {
  try {
    // ---------- EXTRACT & VALIDATE INPUT ----------
    // Support both camelCase and snake_case for fullName
    // Different frontends might send different formats
    const fullName = req.body.fullName || req.body.full_name;
    const email = req.body.email;
    const password = req.body.password;

    // All fields required
    if (!fullName || !email || !password) {
      return res.status(400).json({ error: "All fields are required." });
    }

    // ---------- CHECK FOR EXISTING USER ----------
    // Can't register with an email that's already taken
    const existing = await query(
      `SELECT id FROM users WHERE email = $1 LIMIT 1`,
      [email]
    );

    if (existing.rows.length > 0) {
      // 409 Conflict is the proper status for "resource already exists"
      return res.status(409).json({ error: "User already exists." });
    }

    // ---------- HASH PASSWORD ----------
    // bcrypt with cost factor 12 - good balance of security vs speed
    // Higher = more secure but slower (12 is recommended minimum for 2024)
    // NEVER store plain text passwords!
    const hashed = await bcrypt.hash(password, 12);

    // ---------- CREATE USER ----------
    // Role is hardcoded to 'CUSTOMER' - admins are created manually/differently
    // This prevents registration endpoint from being used to create admin accounts
    const result = await query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ($1, $2, $3, 'CUSTOMER')
       RETURNING id, full_name, email, role`,
      [fullName, email, hashed]
    );
    // Note: RETURNING gives us the created user without a separate SELECT
    // We explicitly list columns to NOT return password_hash

    const user = result.rows[0];

    // ---------- GENERATE JWT TOKEN ----------
    // User is immediately logged in after registration (better UX)
    // Token contains user ID and role for authorization checks
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }  // Tokens expire after 1 hour
    );
    // TODO: Consider refresh tokens for better UX (don't force re-login every hour)

    // 201 Created - new resource was created
    return res.status(201).json({
      message: "Registration successful.",
      user,
      token
    });

  } catch (err) {
    console.error("REGISTER ERROR:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
};


// ============================================================================
// LOGIN
// Authenticates a user and returns a JWT token
// REQUIREMENT: "The software shall provide login functionality"
// ============================================================================
//
// Used by BOTH customer frontend AND admin panel
// The admin panel checks user.role after login and rejects non-admins
// This is intentional - keeps the auth endpoint simple
//
// Request body: { email, password }
// Returns: { message, user, token }
//
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // ---------- VALIDATE INPUT ----------
    if (!email || !password)
      return res.status(400).json({ error: "Email and password required." });

    // ---------- FIND USER ----------
    const result = await query(
      `SELECT id, full_name, email, password_hash, role 
       FROM users WHERE email = $1 LIMIT 1`,
      [email]
    );

    // User not found - return 404
    // Security note: Some argue you shouldn't reveal if email exists
    // But we already have checkEmail endpoint, so it's moot
    if (result.rows.length === 0)
      return res.status(404).json({ error: "User not found." });

    const user = result.rows[0];

    // ---------- VERIFY PASSWORD ----------
    // bcrypt.compare handles the hashing internally
    // It extracts the salt from the stored hash and re-hashes the input
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok)
      return res.status(401).json({ error: "Invalid password." });

    // ---------- GENERATE JWT TOKEN ----------
    // Same structure as registration - ID and role in payload
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    // Return user info (minus password) and token
    // Frontend stores these for authenticated requests
    return res.json({
      message: "Login successful.",
      user: {
        id: user.id,
        fullName: user.full_name,  // Convert to camelCase for frontend
        email: user.email,
        role: user.role,           // CUSTOMER or ADMIN - frontend uses this for routing
      },
      token
    });

  } catch (err) {
    console.error("LOGIN ERROR:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
};


// ============================================================================
// COMMENTED OUT: FORGOT PASSWORD & RESET PASSWORD
// ============================================================================
//
// These are optional features that were started but not completed
// Keeping them here as reference for future implementation
//
// How the flow would work:
// 1. User clicks "Forgot Password" and enters email
// 2. forgotPassword generates a 6-digit OTP and stores it in DB
// 3. In production, OTP would be sent via email (not returned in response!)
// 4. User enters OTP + new password
// 5. resetPassword verifies OTP and updates password
//
// Current issues with this implementation:
// - OTP is returned in response (only for dev - NEVER do this in production!)
// - No email sending implemented
// - Would need reset_token and reset_token_expires columns in users table
//
// ============================================================================

// /**
//  * =====================================
//  * FORGOT PASSWORD (OPTIONAL)
//  * =====================================
//  * 
//  * Generates an OTP for password reset
//  * In production, this would send an email instead of returning the OTP
//  */
// export const forgotPassword = async (req, res) => {
//   try {
//     const { email } = req.body;
//
//     // Check if user exists
//     const result = await query(
//       `SELECT id FROM users WHERE email = $1 LIMIT 1`,
//       [email]
//     );
//
//     if (result.rows.length === 0)
//       return res.status(404).json({ error: "No user with this email." });
//
//     const userId = result.rows[0].id;
//
//     // Generate 6-digit OTP
//     const otp = Math.floor(100000 + Math.random() * 900000).toString();
//     // OTP expires in 10 minutes
//     const expires = new Date(Date.now() + 10 * 60 * 1000);
//
//     // Store OTP in database
//     await query(
//       `UPDATE users
//        SET reset_token = $1,
//            reset_token_expires = $2
//        WHERE id = $3`,
//       [otp, expires, userId]
//     );
//
//     // TODO: Send email with OTP instead of returning it!
//     // For dev only - remove otp from response in production
//     return res.json({
//       success: true,
//       message: "OTP generated.",
//       otp // TEMP for dev - REMOVE IN PRODUCTION!
//     });
//
//   } catch (err) {
//     console.error("FORGOT PASSWORD ERROR:", err);
//     res.status(500).json({ error: "Internal server error." });
//   }
// };


// /**
//  * =====================================
//  * RESET PASSWORD (OPTIONAL)
//  * =====================================
//  * 
//  * Verifies OTP and sets new password
//  * Request body: { email, otp, newPassword }
//  */
// export const resetPassword = async (req, res) => {
//   try {
//     const { email, otp, newPassword } = req.body;
//
//     // Get user with their reset token
//     const result = await query(
//       `SELECT id, reset_token, reset_token_expires
//        FROM users WHERE email = $1 LIMIT 1`,
//       [email]
//     );
//
//     if (result.rows.length === 0)
//       return res.status(404).json({ error: "User not found." });
//
//     const user = result.rows[0];
//
//     // Verify OTP matches
//     if (user.reset_token !== otp)
//       return res.status(400).json({ error: "Invalid OTP." });
//
//     // Check if OTP has expired
//     if (new Date() > new Date(user.reset_token_expires))
//       return res.status(400).json({ error: "OTP expired." });
//
//     // Hash new password
//     const hashed = await bcrypt.hash(newPassword, 12);
//
//     // Update password and clear reset token
//     await query(
//       `UPDATE users
//        SET password_hash = $1,
//            reset_token = NULL,
//            reset_token_expires = NULL
//        WHERE id = $2`,
//       [hashed, user.id]
//     );
//
//     return res.json({
//       success: true,
//       message: "Password reset successful."
//     });
//
//   } catch (err) {
//     console.error("RESET PASSWORD ERROR:", err);
//     res.status(500).json({ error: "Internal server error." });
//   }
// };


// ============================================================================
// NOTES & POTENTIAL IMPROVEMENTS
// ============================================================================
//
// 1. Refresh tokens
//    Current: Tokens expire after 1 hour, user must re-login
//    Better: Issue refresh token (long-lived) + access token (short-lived)
//    Refresh token stored in httpOnly cookie for security
//
// 2. Rate limiting
//    Should add rate limiting to prevent brute force attacks
//    e.g., Max 5 login attempts per minute per IP
//
// 3. Password requirements
//    Currently no validation on password strength
//    Should require: min length, uppercase, lowercase, number, special char
//
// 4. Email verification
//    Currently users can register with any email
//    Should send verification email and require confirmation
//
// 5. Logout endpoint
//    JWT is stateless so "logout" is just deleting token client-side
//    But could implement token blacklist for true server-side logout
//
// ============================================================================