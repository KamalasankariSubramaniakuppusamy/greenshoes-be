// ============================================================================
// app.js– This is the regular procedure just like any other Express based 
// software application. 
// ============================================================================
// Express application setup and middleware configuration
// This file creates and configures the Express app but doesn't start the server
// (server startup happens in server.js which imports this)
//
// Separating app config from server startup makes testing easier
// You can import the app and test routes without actually starting a server

import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";

import routes from "./routes/index.js";
import notFound from "./middleware/notFound.js";
import errorHandler from "./middleware/errorHandler.js";

import { NODE_ENV } from "./config/env.js";

const app = express();


// ============================================================================
// MIDDLEWARE STACK
// ============================================================================
// Order matters here - middleware runs in the order it's registered
// Request flows: parsing -> security -> logging -> routes -> error handling

// ----------------------------------------------------------------------------
// Body parsing
// ----------------------------------------------------------------------------
// Parse JSON bodies (for API requests with Content-Type: application/json)
app.use(express.json());

// Parse URL-encoded bodies (for form submissions)
// extended: false uses the querystring library (simpler, sufficient for most cases)
app.use(express.urlencoded({ extended: false }));

// ----------------------------------------------------------------------------
// Security middleware
// ----------------------------------------------------------------------------

// CORS - Cross-Origin Resource Sharing
// Allows the frontend (running on a different port/domain) to call our API
// Default config allows all origins - tighten this in production
app.use(cors());

// Helmet - sets various HTTP headers for security
// X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, etc
app.use(helmet());

// ----------------------------------------------------------------------------
// Logging
// ----------------------------------------------------------------------------
// Morgan logs HTTP requests to the console
// "dev" format: colored, concise - GET /api/products 200 45.123 ms
app.use(morgan("dev"));


// ============================================================================
// ROUTES
// ============================================================================
// Main route handler - currently just mounts health routes
// Other routes are mounted directly in server.js
app.use("/", routes);


// ============================================================================
// ERROR HANDLING
// ============================================================================
// Must come AFTER routes - catches anything that falls through

// 404 handler - no route matched
app.use(notFound);

// Global error handler - catches thrown errors
app.use(errorHandler);


export default app;