import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { enable2FA, verify2FA } from "../controllers/twoFactorController.js";

const router = express.Router();

router.post("/enable", authMiddleware, enable2FA);
router.post("/verify", authMiddleware, verify2FA);

export default router;
