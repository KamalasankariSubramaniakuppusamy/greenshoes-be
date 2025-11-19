import speakeasy from "speakeasy";
import qrcode from "qrcode";
import { query } from "../db/db.js";

export const enable2FA = async (req, res) => {
  const userId = req.user.id;

  // 1. Generate a new TOTP secret
  const secret = speakeasy.generateSecret({
    name: `GreenShoes (${req.user.email})`
  });

  // 2. Store (or update) DB
  await query(
    `INSERT INTO user_2fa (user_id, secret, enabled)
     VALUES ($1, $2, false)
     ON CONFLICT (user_id) DO UPDATE SET secret = $2`,
    [userId, secret.base32]
  );

  // 3. Generate QR code for authenticator apps
  const qr = await qrcode.toDataURL(secret.otpauth_url);

  res.json({
    message: "Scan this QR code with Google Authenticator.",
    qrCode: qr,
    manualKey: secret.base32
  });
};

export const verify2FA = async (req, res) => {
  const userId = req.user.id;
  const { token } = req.body;

  const result = await query(
    `SELECT secret FROM user_2fa WHERE user_id = $1`,
    [userId]
  );

  if (result.rows.length === 0) {
    return res.status(400).json({ error: "2FA not initialized." });
  }

  const { secret } = result.rows[0];

  const verified = speakeasy.totp.verify({
    secret,
    encoding: "base32",
    token
  });

  if (!verified) {
    return res.status(401).json({ error: "Invalid 2FA code." });
  }

  // enable 2FA permanently
  await query(
    `UPDATE user_2fa SET enabled = true WHERE user_id = $1`,
    [userId]
  );

  res.json({ message: "2FA enabled successfully!" });
};
