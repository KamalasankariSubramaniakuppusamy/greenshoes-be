// ============================================================================
// authRoutes.js
// ============================================================================
// Authentication routes - registration and login
// All routes are public (no auth middleware needed obviously)

import express from "express";
import { register, login, checkEmail } from "../controllers/authController.js";

const router = express.Router();

// POST /api/auth/register
// Create a new user account
// Body: { email, password, full_name }
// Returns: user object + JWT token
// New users are always CUSTOMER role (admins created differently)
router.post("/register", register);

// POST /api/auth/login
// Authenticate existing user
// Body: { email, password }
// Returns: user object + JWT token
// Same endpoint for customers and admins - frontend checks role after login
router.post("/login", login);

// POST /api/auth/check-email
// Check if email is already registered (for real-time validation)
// Body: { email }
// Returns: { exists: true/false }
// Called on blur in the registration form so user knows immediately
// if their email is taken instead of waiting until form submit
router.post("/check-email", checkEmail);

export default router;

// Mounted at /api/auth in server.js
//
// Commented out in authController but could add later:
// - POST /forgot-password - send reset email with OTP
// - POST /reset-password - verify OTP and set new password
// - POST /logout - if we implement token blacklisting