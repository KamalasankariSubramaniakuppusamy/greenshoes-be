// ============================================================================
// notFound.js
// Developer:  GreenShoes Team
// ============================================================================
// 404 handler - catches requests that don't match any route
//
// This middleware should be registered AFTER all your actual routes
// If a request makes it here, nothing else matched

export default (req, res, next) => {
  res.status(404).json({ error: "Not found" });
};

// This runs when someone hits a URL that doesn't exist, like:
// - GET /api/nonexistent
// - POST /api/produtcs (typo)
// - Any route you forgot to implement
//
// The 'next' param isn't used but keeping it for consistency
// and in case we ever want to pass to the error handler instead