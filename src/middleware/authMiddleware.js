import jwt from "jsonwebtoken";

export const authMiddleware = (req, res, next) => {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid token" });
  }

  const token = header.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // attaches { id, role } to request
    next();
  } catch (err) {
    console.error("JWT ERROR:", err);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};

// Optional auth - allows both authenticated and guest users
export const authMiddlewareOptional = (req, res, next) => {
  console.log("========================================");
  console.log("OPTIONAL AUTH MIDDLEWARE CALLED");
  console.log("Request URL:", req.originalUrl);
  console.log("Request Method:", req.method);
  
  const header = req.headers.authorization;
  console.log("Authorization header:", header ? "Present" : "Missing");
  console.log("x-guest-id header:", req.headers["x-guest-id"] || "Missing");

  // If no auth header, continue as guest
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
    req.user = decoded; // attaches { id, role } to request
    console.log("Token verified successfully, req.user:", decoded);
    console.log("========================================\n");
    next();
  } catch (err) {
    // If token is invalid, continue as guest instead of rejecting
    console.error("JWT verification failed, continuing as guest:", err.message);
    req.user = null;
    console.log("========================================\n");
    next();
  }
};