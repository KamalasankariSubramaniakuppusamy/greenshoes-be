import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
dotenv.config();

console.log("Loaded DATABASE_URL:", process.env.DATABASE_URL);

import authRoutes from "./routes/authRoutes.js";
import protectedRoutes from "./routes/protectedRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";

const app = express();

// 🟢 CORS + body parsers MUST come first
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 🟢 Helmet MUST come AFTER parsers
app.use(helmet());

// Debug
app.use(morgan("dev"));

// API routes
app.use("/api/auth", authRoutes);
app.use("/api", protectedRoutes);
app.use("/api/admin", adminRoutes);

// REMOVE THIS — it conflicts with authRoutes 2FA
// ❌ app.use("/api/2fa", twoFactorRoutes);

app.get("/", (req, res) => {
  res.json({ message: "GreenShoes API is running..." });
});

app.listen(process.env.PORT || 4000, () => {
  console.log(`Server running at http://localhost:${process.env.PORT}`);
});

export default app;
