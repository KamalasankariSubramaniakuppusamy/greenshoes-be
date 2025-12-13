// ============================================================================
//RBAC
// Developer: Kamalasankari Subramaniakuppusamy
// ============================================================================
// Role-based access control middleware
// Use this after authMiddleware to restrict routes to specific roles
//
// Example usage in routes:
//   router.use(authMiddleware);          // first verify they're logged in
//   router.use(requireRole('ADMIN'));    // then check they're an admin

export const requireRole = (role) => {
  // Returns a middleware function - this is the closure pattern
  // Lets us pass the required role as a parameter
  return (req, res, next) => {
    // req.user should be set by authMiddleware running before this
    // If it's not set, either authMiddleware didn't run or token was invalid
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({
        error: "Access denied — insufficient permissions."
      });
    }
    next();
  };
};

// 403 Forbidden vs 401 Unauthorized:
// - 401 = "who are you?" (not logged in)
// - 403 = "I know who you are, but you can't do this" (wrong role)
//
// Right now we only have two roles: CUSTOMER and ADMIN
// But this pattern scales if we ever add more (MANAGER, SUPPORT, etc)