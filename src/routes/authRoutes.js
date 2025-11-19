import express from "express";
import { enable2FA, verify2FA, loginWith2FA } from "../controllers/twoFaController.js";
import { authMiddleware } from "../middleware/auth.js";

import {
  register,
  login,
  forgotPassword,
  resetPassword,
  checkEmail
} from "../controllers/authController.js";

const router = express.Router();

// REGISTER
router.post("/register", register);

// LOGIN
router.post("/login", login);

// CHECK IF EMAIL ALREADY EXISTS
router.post("/check-email", checkEmail);

// FORGOT PASSWORD (request OTP)
router.post("/forgot-password", forgotPassword);

// RESET PASSWORD (after OTP)
router.post("/reset-password", resetPassword);

// START 2FA SETUP
router.post("/2fa/setup", authMiddleware, enable2FA);

// VERIFY & ENABLE 2FA
router.post("/2fa/verify", authMiddleware, verify2FA);

// LOGIN WITH 2FA
router.post("/login-2fa", loginWith2FA);


export default router;
