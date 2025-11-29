import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
dotenv.config();

import authRoutes from "./routes/authRoutes.js";
import protectedRoutes from "./routes/protectedRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import adminProductRoutes from "./routes/adminProductRoutes.js";
import productCatalogRoutes from "./routes/productCatalogRoutes.js";
import cartRoutes from "./routes/cartRoutes.js";
import wishlistRoutes from "./routes/wishlistRoutes.js";
import catalogRoutes from "./routes/catalogRoutes.js";

// NEW IMPORTS - Add these lines
import addressRoutes from "./routes/addressRoutes.js";
import paymentCardRoutes from "./routes/paymentCardRoutes.js";
import checkoutRoutes from "./routes/checkoutRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import adminOrderRoutes from "./routes/adminOrderRoutes.js";

const app = express();

// ----------------------
// GLOBAL MIDDLEWARE
// ----------------------
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increased limit for large payloads
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // Increased limit
app.use(helmet());
app.use(morgan("dev"));

// ----------------------
// USER + AUTH
// ----------------------
app.use("/api/auth", authRoutes);
app.use("/api", protectedRoutes);

// ----------------------
// ADMIN
// ----------------------
app.use("/api/admin/products", adminProductRoutes); // More specific first!
app.use("/api/admin/orders", adminOrderRoutes);     // NEW - Admin orders
app.use("/api/admin", adminRoutes);  

// ----------------------
// CUSTOMER PRODUCT CATALOG
// ----------------------
app.use("/api/products", productCatalogRoutes);  // Product list + details
app.use("/api/catalog", catalogRoutes);          // Full catalog with images

// ----------------------
// CART + WISHLIST
// ----------------------
app.use("/api/cart", cartRoutes);
app.use("/api/wishlist", wishlistRoutes);

// ----------------------
// CHECKOUT & ORDERS - NEW SECTION
// ----------------------
app.use("/api/addresses", addressRoutes);
app.use("/api/payment-cards", paymentCardRoutes);
app.use("/api/checkout", checkoutRoutes);
app.use("/api/orders", orderRoutes);

// ----------------------
// ROOT
// ----------------------
app.get("/", (req, res) => {
  res.json({ message: "GreenShoes API is running..." });
});

// ----------------------
// SERVER
// ----------------------
app.listen(process.env.PORT || 4000, () => {
  console.log(`Server running at http://localhost:${process.env.PORT}`);
});

export default app;