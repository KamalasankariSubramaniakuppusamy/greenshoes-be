// ============================================================================
// authMiddleware.js
// ============================================================================
// JWT authentication middleware for protected routes
// Two versions: strict (must be logged in) and optional (guest or user)

import jwt from "jsonwebtoken";


// ----------------------------------------------------------------------------
// STRICT AUTH - user must be logged in
// ----------------------------------------------------------------------------
// Use this for routes that absolutely require a user:
// - /api/orders (order history)
// - /api/addresses (saved addresses)  
// - /api/checkout/saved-card (paying with saved card)
//
export const authMiddleware = (req, res, next) => {
  const header = req.headers.authorization;

  // Check for "Bearer <token>" format
  // Some clients send just the token, some forget the header entirely
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid token" });
  }

  const token = header.split(" ")[1];

  try {
    // jwt.verify checks signature AND expiration
    // throws if anything is wrong
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, role } - set during login in authController
    next();
  } catch (err) {
    // could be expired, malformed, wrong signature, whatever
    // don't tell the client which one (security)
    console.error("JWT ERROR:", err);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};


// ----------------------------------------------------------------------------
// OPTIONAL AUTH - works for both logged-in users and guests
// ----------------------------------------------------------------------------
// Use this for routes that support both:
// - /api/cart (user cart or guest cart)
// - /api/wishlist (user wishlist or guest wishlist)
// - /api/catalog (same for everyone, but nice to know who's browsing)
//
// Key difference from strict auth: NEVER returns 401
// If token is missing or bad, we just set req.user = null and continue
// The controller then checks req.user to decide user vs guest behavior
//
export const authMiddlewareOptional = (req, res, next) => {
  // Leaving these console.logs in for now - super helpful for debugging
  // guest vs user issues. Can remove once everything is stable.
  console.log("========================================");
  console.log("OPTIONAL AUTH MIDDLEWARE CALLED");
  console.log("Request URL:", req.originalUrl);
  console.log("Request Method:", req.method);
  
  const header = req.headers.authorization;
  console.log("Authorization header:", header ? "Present" : "Missing");
  console.log("x-guest-id header:", req.headers["x-guest-id"] || "Missing");

  // No auth header = guest user, that's totally fine
  if (!header || !header.startsWith("Bearer ")) {
    console.log("No valid auth header, setting req.user = null (guest mode)");
    req.user = null;
    console.log("========================================\n");
    return next();
  }

  const token = header.split(" ")[1];
  console.log("Token found, attempting to verify...");

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    console.log("Token verified successfully, req.user:", decoded);
    console.log("========================================\n");
    next();
  } catch (err) {
    // Token is invalid/expired but that's ok - just treat as guest
    // This happens when user's token expired but they haven't logged out yet
    // They can still browse, add to cart, etc as a guest
    console.error("JWT verification failed, continuing as guest:", err.message);
    req.user = null;
    console.log("========================================\n");
    next();
  }
};

// TODO: probably should add a requireRole('ADMIN') middleware
// for admin routes instead of checking role in each controller