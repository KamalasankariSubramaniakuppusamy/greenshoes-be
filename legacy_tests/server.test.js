// Developer: Kamalasankari Subramaniakuppusamy
// Basic server health check test - makes sure the server is alive and responding
//
// Why health checks matter:
// - Deployment platforms (Render, AWS, etc.) ping this endpoint to know if the app is up
// - If /health stops responding, the platform can auto-restart the container
// - Super simple test but catches "server won't even start" issues early
//
// REQUIREMENT: Implicitly supports deployment readiness and monitoring
// (not explicitly in requirements doc, but essential for production)

import request from "supertest";
import app from "../server.js"; // no curly braces — default export only

// ============================================================================
// HEALTH CHECK API TEST
// ============================================================================

describe("HEALTH CHECK API", () => {
  
  // --------------------------------------------------------------------------
  // Test: Basic health endpoint
  // This is the simplest possible test - if this fails, something is very wrong
  // The /health endpoint should always return { ok: true } when server is running
  // --------------------------------------------------------------------------
  test("should return { ok: true }", async () => {
    const res = await request(app).get("/health");
    
    // 200 OK means the server is up and responding
    expect(res.statusCode).toBe(200);
    // The { ok: true } response is a convention for health checks
    // Some teams use { status: "healthy" } or similar - same idea
    expect(res.body).toHaveProperty("ok", true);
  });

  // Note: This test doesn't need MongoMemoryServer because /health 
  // typically doesn't hit the database - it's just a "are you alive?" check
  // If your health endpoint DOES check DB connection, you'd need the setup
});