import { query } from "../db/db.js";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import jwt from "jsonwebtoken";

export const enable2FA = async (req, res) => {
  try {
    const userId = req.user.id; // from auth middleware

    // Generate secret
    const secret = authenticator.generateSecret();

    // Build app label
    const otpauth = authenticator.keyuri(
      req.user.email,
      "GreenShoes",
      secret
    );

    // Save secret (but not enabled yet)
    await query(
      `UPDATE users SET twofa_secret = $1 WHERE id = $2`,
      [secret, userId]
    );

    // Generate QR URL
    const qr = await QRCode.toDataURL(otpauth);

    res.json({
      success: true,
      secret,
      qrCode: qr,
      otpauth
    });

  } catch (err) {
    console.error("ENABLE 2FA ERROR:", err);
    res.status(500).json({ error: "Server error enabling 2FA" });
  }
};

export const verify2FA = async (req, res) => {
  try {
    const userId = req.user.id;
    const { otp } = req.body;

    const found = await query(
      `SELECT twofa_secret FROM users WHERE id = $1`,
      [userId]
    );

    if (found.rows.length === 0) {
      return res.status(404).json({ error: "User not found." });
    }

    const secret = found.rows[0].twofa_secret;

    const isValid = authenticator.verify({ token: otp, secret });

    if (!isValid) {
      return res.status(400).json({ error: "Invalid OTP" });
    }

    // enable 2FA
    await query(
      `UPDATE users SET twofa_enabled = true WHERE id = $1`,
      [userId]
    );

    return res.json({ success: true, message: "2FA enabled!" });

  } catch (err) {
    console.error("VERIFY 2FA ERROR:", err);
    res.status(500).json({ error: "Server error verifying 2FA" });
  }
};


export const loginWith2FA = async (req, res) => {
  try {
    const { email, password, otp } = req.body;

    // Validate user credentials first
    const result = await query(
      `SELECT id, password_hash, twofa_secret, twofa_enabled, role
       FROM users WHERE email = $1 LIMIT 1`,
      [email]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ error: "User not found" });

    const user = result.rows[0];

    // Check password
    const correctPw = await bcrypt.compare(password, user.password_hash);
    if (!correctPw) return res.status(401).json({ error: "Bad password" });

    // If 2FA enabled, require OTP
    if (user.twofa_enabled) {
      const ok = authenticator.verify({
        token: otp,
        secret: user.twofa_secret,
      });
      if (!ok) return res.status(400).json({ error: "Bad 2FA OTP" });
    }

    // Issue token
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({
      success: true,
      token,
      message: "Login OK"
    });

  } catch (err) {
    console.error("LOGIN 2FA ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
};
