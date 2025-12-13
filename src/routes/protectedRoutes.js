// ============================================================================
// RBAC for security testing - protected test route
// Developer: Kamalasankari Subramaniakuppusamy
// ============================================================================
// Test/debug routes - just for verifying things work during development
// Can probably delete this in production, but harmless to keep

import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

// GET /api/test/protected
// Simple endpoint to verify JWT authentication is working
// If you can hit this and get a response, your token is valid
// Returns the decoded user object so you can see what's in the token
router.get("/protected", authMiddleware, (req, res) => {
  res.json({
    message: "You accessed a protected route!",
    user: req.user  // { id, email, role } from the JWT
  });
});

export default router;

// Mounted at /api/test in server.js
//
// Useful for:
// - Testing auth flow during development
// - Debugging token issues ("is my token even valid?")
// - Checking what's in the JWT payload
//
// Usage:
//   curl -H "Authorization: Bearer <your-token>" http://localhost:4000/api/test/protected