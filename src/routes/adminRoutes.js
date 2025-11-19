import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";

const router = express.Router();

router.get(
  "/dashboard",
  authMiddleware,
  requireRole("ADMIN"),
  (req, res) => {
    res.json({
      message: "Welcome Admin — dashboard loaded.",
      user: req.user
    });
  }
);

export default router;
