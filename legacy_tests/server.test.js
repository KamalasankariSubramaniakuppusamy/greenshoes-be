// ✅ server.test.js
import request from "supertest";
import app from "../server.js"; // no curly braces — default export only

describe("🩺 HEALTH CHECK API", () => {
  test("should return { ok: true }", async () => {
    const res = await request(app).get("/health");
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("ok", true);
  });
});
