// Developer: Kamalasankari Subramaniakuppusamy
// Unit tests for authentication flow - registration and login endpoints
//
// REQUIREMENTS TESTED:
// - "The software shall provide user registration and login functionality"
// - "Different Admin login URL and customer login to prevent break-in attacks"
//   (this file tests the shared /api/auth endpoints; admin role check happens client-side)
//
// TECH STACK:
// - Jest for test runner
// - Supertest for HTTP assertions
// - MongoMemoryServer for isolated in-memory database (no pollution of real data)

import { jest } from "@jest/globals";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import app from "../server.js";
import User from "../models/User.js";

// ============================================================================
// TEST CONFIGURATION
// ============================================================================

// Give MongoMemoryServer extra time on macOS M-series chips
// Default timeout was causing flaky failures on my MacBook - this fixed it
jest.setTimeout(20000);

let mongoServer;

// ----------------------------------------------------------------------------
// Setup: spin up in-memory MongoDB before any tests run
// This keeps tests isolated and doesn't touch the real database
// ----------------------------------------------------------------------------
beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
});

// ----------------------------------------------------------------------------
// Teardown: clean up after all tests complete
// Important to stop the server or you'll get memory leaks in CI
// ----------------------------------------------------------------------------
afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop(); // safety guard in case create() failed
});

// ============================================================================
// AUTH FLOW TESTS
// ============================================================================

describe("AUTH FLOW TESTS", () => {
  
  // --------------------------------------------------------------------------
  // Test 1: User Registration
  // REQUIREMENT: "The software shall provide user registration"
  // Verifies that a new user can sign up with valid credentials
  // --------------------------------------------------------------------------
  test("should register a new user successfully", async () => {
    const newUser = {
      username: "Test User",
      email: "testuser@example.com",
      password: "StrongPass#2025",
    };

    const res = await request(app)
      .post("/api/auth/register")
      .send(newUser)
      .set("Content-Type", "application/json");

    // Expect 201 Created - user should be in DB now
    // Response includes user object but NOT the password (security)
    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty("message", "User registered successfully");
    expect(res.body.user).toHaveProperty("email", newUser.email);
  });

  // --------------------------------------------------------------------------
  // Test 2: User Login
  // REQUIREMENT: "The software shall provide login functionality"
  // Verifies that existing users can log in and receive a JWT token
  // Note: Same endpoint used by admin panel - role verification is client-side
  // --------------------------------------------------------------------------
  test("should log in successfully and return a token", async () => {
    // First, create a user directly in the DB to log in with
    // (can't rely on registration test - tests should be independent)
    const existingUser = new User({
      username: "Login User",
      email: "loginuser@example.com",
      role: "user",
    });
    await existingUser.setPassword("MyLogin#2025"); // hashes the password
    await existingUser.save();

    const res = await request(app)
      .post("/api/auth/login")
      .send({
        email: "loginuser@example.com",
        password: "MyLogin#2025",
      })
      .set("Content-Type", "application/json");

    // Should get back a JWT token for authenticating future requests
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("message", "Login successful");
    expect(res.body).toHaveProperty("token");
  });

  // TODO: Future tests to add:
  // - Login with incorrect password (expect 401)
  // - Login with non-existent email (expect 401 or 404)
  // - Register with duplicate email (expect 409 or 400)
  // - Register with weak password (if validation exists)
  // - Token verification / protected route access
});