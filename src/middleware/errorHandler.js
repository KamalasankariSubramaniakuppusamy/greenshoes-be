// ============================================================================
// errorHandler.js
// ============================================================================
// Global error handler middleware - catches anything that slips through
//
// Express calls this when:
// 1. A route handler throws an uncaught exception
// 2. A route calls next(err) with an error
// 3. A promise rejection isn't caught (with express-async-errors or similar)
//
// This is the last line of defense before the app crashes

export default (err, req, res, next) => {
  // Log the full error server-side so we can debug it
  // In production you'd probably send this to a logging service
  // like Sentry, LogRocket, or just CloudWatch
  console.error("ERROR:", err);

  // Send generic message to client - don't leak stack traces or internal details
  // Showing "Cannot read property 'id' of undefined" to users is ugly and insecure
  res.status(500).json({ error: "Server error" });
};

// NOTE: Express knows this is an error handler because it has 4 parameters
// (err, req, res, next) - that's how Express identifies error middleware
// Don't remove the 'next' param even though we don't use it!

// TODO: could make this smarter:
// - Check if err has a statusCode property and use that
// - Different messages for different error types
// - Include request ID for easier log correlation
//
// Something like:
//
//   const statusCode = err.statusCode || 500;
//   const message = statusCode === 500 ? "Server error" : err.message;
//   res.status(statusCode).json({ error: message });