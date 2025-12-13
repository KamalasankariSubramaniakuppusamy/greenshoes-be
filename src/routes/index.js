// ============================================================================
// index(routes)
// ============================================================================
// Route aggregator - combines all route modules into one export
// This file exists so server.js can import routes more cleanly
//
// Though right now it only has health routes... the rest are probably
// imported directly in server.js. Could consolidate everything here
// eventually for consistency.

import express from "express";
import healthRoutes from "./health.routes.js";

const router = express.Router();

// GET /api/health - server health check
router.use("/health", healthRoutes);

export default router;

// If we wanted to consolidate all routes here, it would look like:
//
//   import authRoutes from "./authRoutes.js";
//   import cartRoutes from "./cartRoutes.js";
//   import catalogRoutes from "./catalogRoutes.js";
//   // ... etc
//
//   router.use("/auth", authRoutes);
//   router.use("/cart", cartRoutes);
//   router.use("/catalog", catalogRoutes);
//
// Then server.js just does:
//   import routes from "./routes/index.js";
//   app.use("/api", routes);
//
// But for now, routes are mounted individually in server.js which is fine too