// ✅ auth.test.js
import { jest } from "@jest/globals";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import app from "../server.js";
import User from "../models/User.js";

// Give MongoMemoryServer extra time on macOS M-series
jest.setTimeout(20000);

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop(); // safety guard
});

describe("🧪 AUTH FLOW TESTS", () => {
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

    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty("message", "User registered successfully");
    expect(res.body.user).toHaveProperty("email", newUser.email);
  });

  test("should log in successfully and return a token", async () => {
    // ensure user exists
    const existingUser = new User({
      username: "Login User",
      email: "loginuser@example.com",
      role: "user",
    });
    await existingUser.setPassword("MyLogin#2025");
    await existingUser.save();

    const res = await request(app)
      .post("/api/auth/login")
      .send({
        email: "loginuser@example.com",
        password: "MyLogin#2025",
      })
      .set("Content-Type", "application/json");

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("message", "Login successful");
    expect(res.body).toHaveProperty("token");
  });
});
