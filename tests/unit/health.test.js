// ============================================================================
// Let's do some health check!! See if this baby is alive and kicking!
// ============================================================================
// Tests for the health check endpoint
// This is what deployment platforms (Render, AWS, etc) hit to verify the server is alive

const request = require("supertest");
const app = require("../../src/app");

describe("Health Check", () => {
  // Basic "is the server running" test
  // If this fails, something is very wrong 
  // (app won't start, routes not mounted, etc) but I won't let that happen!
  it("GET /api/health should return 200", async () => {
    const res = await request(app).get("/api/health");

    // Should return 200 OK
    expect(res.status).toBe(200);
    
    // Body should have status: "ok" and identify the service
    // Deployment platforms often check for specific response values
    expect(res.body.status).toBe("ok");
    expect(res.body.service).toBe("greenshoes-backend");
  });
});

// ----------------------------------------------------------------------------
// This test doesn't need database setup - health check shouldn't hit the DB
// That's intentional: if the DB is down, health check still works
// (though you might want a separate /api/health/db endpoint that does check DB)
//
// Run with: npm test -- health.test.js
// ----------------------------------------------------------------------------