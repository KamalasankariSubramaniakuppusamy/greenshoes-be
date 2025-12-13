// ============================================================================
// authMiddleware.js
// Developer: GreenShoes Team
// ============================================================================
//
// Authentication and authorization middleware
// Handles JWT token verification and role-based access control
//
// THREE MIDDLEWARE FUNCTIONS:
//
// 1. authMiddleware (required auth)
//    - Requires valid JWT token
//    - Returns 401 if missing or invalid
//    - Use for: user account pages, checkout, order history
//
// 2. authMiddlewareOptional (optional auth)
//    - Accepts valid token OR no token
//    - Sets req.user = null for guests
//    - Use for: cart, wishlist, catalog (works for both guests and users)
//
// 3. requireRole (role-based access)
//    - Requires specific role (e.g., 'ADMIN')
//    - Returns 403 if wrong role
//    - Use for: admin panel routes
//
// USAGE IN ROUTES:
//   router.get('/orders', authMiddleware, getOrders);           // Must be logged in
//   router.get('/cart', authMiddlewareOptional, getCart);       // Guest or user
//   router.post('/admin/products', authMiddleware, requireRole('ADMIN'), createProduct);
//
// ============================================================================

import jwt from "jsonwebtoken";


// ============================================================================
// REQUIRED AUTHENTICATION MIDDLEWARE
// User MUST be logged in to access the route
// ============================================================================
//
// Expects: Authorization header with "Bearer <token>"
// Sets: req.user with decoded token payload (id, email, role)
// Rejects: Missing header or invalid/expired token
//
// Token payload structure (set during login):
//   {
//     id: "uuid-here",
//     email: "user@example.com",
//     role: "CUSTOMER" or "ADMIN"
//   }
//
export const authMiddleware = (req, res, next) => {
  try {
    const header = req.headers.authorization;

    // No Authorization header at all
    if (!header)
      return res.status(401).json({ error: "Missing auth header" });

    // Extract token from "Bearer <token>" format
    // header.split(" ") gives ["Bearer", "<token>"]
    const token = header.split(" ")[1];

    // Verify token signature and expiration
    // jwt.verify throws if token is invalid or expired
    // JWT_SECRET must match what was used to sign the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach user info to request for downstream handlers
    // Controllers can now access req.user.id, req.user.email, req.user.role
    req.user = decoded;
    next();

  } catch (err) {
    // Token verification failed - could be:
    // - Malformed token
    // - Wrong signature (tampered or wrong secret)
    // - Expired token
    // We don't reveal which one for security
    res.status(401).json({ error: "Invalid token" });
  }
};


// ============================================================================
// OPTIONAL AUTHENTICATION MIDDLEWARE
// Supports both logged-in users AND guests
// ============================================================================
//
// Use this for routes that work differently for users vs guests:
// - Cart: user cart vs guest cart (via x-guest-id header)
// - Wishlist: user wishlist vs guest wishlist
// - Catalog: same for everyone, but could personalize for users
//
// If valid token: req.user = decoded payload
// If no token or invalid token: req.user = null (guest)
//
// IMPORTANT: This middleware NEVER returns 401
// It always calls next() - the controller decides what to do with req.user
//
export const authMiddlewareOptional = (req, res, next) => {
  const authHeader = req.headers.authorization;

  // No auth header = guest user
  if (!authHeader) {
    req.user = null;
    return next();
  }

  try {
    // Try to verify the token
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;  // Valid token - user is logged in
  } catch {
    // Invalid token - treat as guest rather than error
    // This handles cases like:
    // - User's token expired but they haven't logged out
    // - Corrupted token in localStorage
    // They can still browse as guest
    req.user = null;
  }

  next();
};


// ============================================================================
// ROLE-BASED ACCESS CONTROL MIDDLEWARE
// Requires user to have a specific role
// ============================================================================
//
// REQUIREMENT: "Single admin interface with different admin login URL"
// This enforces that only ADMIN users can access admin routes
//
// Usage:
//   router.use('/admin', authMiddleware, requireRole('ADMIN'));
//
// Returns a middleware function (closure pattern)
// This allows passing the required role as a parameter
//
// Must be used AFTER authMiddleware (needs req.user to be set)
//
// HTTP Status codes:
// - 401 Unauthorized: Not logged in at all
// - 403 Forbidden: Logged in but wrong role
//
export const requireRole = (role) => {
  return (req, res, next) => {
    // Not authenticated (shouldn't happen if authMiddleware ran first)
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // Wrong role - user exists but doesn't have permission
    // 403 = "I know who you are, but you can't do this"
    if (req.user.role !== role) {
      return res.status(403).json({ 
        error: `Access denied. ${role} role required.` 
      });
    }

    // Correct role - proceed to the route handler
    next();
  };
};


// ============================================================================
// HOW THESE WORK TOGETHER
// ============================================================================
//
// Example route setup in routes/admin.js:
//
//   import { authMiddleware, requireRole } from '../middleware/authMiddleware.js';
//
//   // All admin routes require authentication AND admin role
//   router.use(authMiddleware);       // First: verify JWT
//   router.use(requireRole('ADMIN')); // Second: check role
//
//   router.get('/products', adminGetProducts);  // Only admins reach here
//   router.post('/products', adminCreateProduct);
//
// Example route setup in routes/cart.js:
//
//   import { authMiddlewareOptional } from '../middleware/authMiddleware.js';
//
//   // Cart works for both users and guests
//   router.use(authMiddlewareOptional);
//
//   router.get('/', getCart);      // Controller checks req.user
//   router.post('/add', addToCart);  // If null, uses guest cart
//
// ============================================================================