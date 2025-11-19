import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { query } from "../db/db.js";

/**
 * =====================================
 * CHECK EMAIL
 * =====================================
 */
export const checkEmail = async (req, res) => {
  try {
    const { email } = req.body;

    const result = await query(
      `SELECT id FROM users WHERE email = $1 LIMIT 1`,
      [email]
    );

    return res.json({ exists: result.rows.length > 0 });
  } catch (err) {
    console.error("CHECK EMAIL ERROR:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};


/**
 * =====================================
 * REGISTER USER
 * =====================================
 */
export const register = async (req, res) => {
  try {
    const { fullName, email, password } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({ error: "All fields are required." });
    }

    const existing = await query(
      `SELECT id FROM users WHERE email = $1 LIMIT 1`,
      [email]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "User already exists." });
    }

    const hashed = await bcrypt.hash(password, 12);

    const result = await query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ($1, $2, $3, 'CUSTOMER')
       RETURNING id, full_name, email, role`,
      [fullName, email, hashed]
    );

    const user = result.rows[0];

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    return res.status(201).json({
      message: "Registration successful.",
      user,
      token
    });

  } catch (err) {
    console.error("REGISTER ERROR:", err);
    res.status(500).json({ error: "Internal server error." });
  }
};


/**
 * =====================================
 * LOGIN
 * =====================================
 */
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ error: "Email and password required." });

    const result = await query(
      `SELECT id, full_name, email, password_hash, role 
       FROM users WHERE email = $1 LIMIT 1`,
      [email]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ error: "User not found." });

    const user = result.rows[0];

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok)
      return res.status(401).json({ error: "Invalid password." });

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    return res.json({
      message: "Login successful.",
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        role: user.role,
      },
      token
    });

  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ error: "Internal server error." });
  }
};


/**
 * =====================================
 * FORGOT PASSWORD (OPTIONAL)
 * =====================================
 */
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const result = await query(
      `SELECT id FROM users WHERE email = $1 LIMIT 1`,
      [email]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ error: "No user with this email." });

    const userId = result.rows[0].id;

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 10 * 60 * 1000);

    await query(
      `UPDATE users
       SET reset_token = $1,
           reset_token_expires = $2
       WHERE id = $3`,
      [otp, expires, userId]
    );

    return res.json({
      success: true,
      message: "OTP generated.",
      otp // TEMP for dev
    });

  } catch (err) {
    console.error("FORGOT PASSWORD ERROR:", err);
    res.status(500).json({ error: "Internal server error." });
  }
};


/**
 * =====================================
 * RESET PASSWORD (OPTIONAL)
 * =====================================
 */
export const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    const result = await query(
      `SELECT id, reset_token, reset_token_expires
       FROM users WHERE email = $1 LIMIT 1`,
      [email]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ error: "User not found." });

    const user = result.rows[0];

    if (user.reset_token !== otp)
      return res.status(400).json({ error: "Invalid OTP." });

    if (new Date() > new Date(user.reset_token_expires))
      return res.status(400).json({ error: "OTP expired." });

    const hashed = await bcrypt.hash(newPassword, 12);

    await query(
      `UPDATE users
       SET password_hash = $1,
           reset_token = NULL,
           reset_token_expires = NULL
       WHERE id = $2`,
      [hashed, user.id]
    );

    return res.json({
      success: true,
      message: "Password reset successful."
    });

  } catch (err) {
    console.error("RESET PASSWORD ERROR:", err);
    res.status(500).json({ error: "Internal server error." });
  }
};
