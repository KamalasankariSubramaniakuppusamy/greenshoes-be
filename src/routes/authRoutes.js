import express from "express";

import { register, login, checkEmail } from "../controllers/authController.js";

const router = express.Router();

// REGISTER
router.post("/register", register);

// LOGIN
router.post("/login", login);

// CHECK IF EMAIL ALREADY EXISTS (LIVE)
router.post("/check-email", checkEmail);


export default router;
