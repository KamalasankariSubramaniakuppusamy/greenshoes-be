// ============================================================================
// config.js
// Developer: GreenShoes Team
// ============================================================================
//
// Central configuration file - all environment variables exported from here
// This keeps env var access in one place instead of scattered process.env calls
//
// WHY THIS PATTERN?
// - Single source of truth for configuration
// - Easy to see what env vars the app needs
// - Default values defined in one place
// - Easier to mock in tests
//
// REQUIREMENTS SUPPORTED:
// - Server deployment configuration
// - JWT authentication (JWT_SECRET)
// - Database connectivity (DATABASE_URL)
//
// ============================================================================


// ----------------------------------------------------------------------------
// SERVER CONFIGURATION
// ----------------------------------------------------------------------------

// Port the server listens on
// Default 4000 for local development, but Render/Heroku/etc. will set PORT
export const PORT = process.env.PORT || 4000;

// Environment mode: 'development', 'production', or 'test'
// Controls things like error verbosity, logging level, etc.
// Default to development for local work - production should always be explicit
export const NODE_ENV = process.env.NODE_ENV || "development";


// ----------------------------------------------------------------------------
// AUTHENTICATION
// ----------------------------------------------------------------------------

// Secret key for signing JWT tokens
// CRITICAL: This MUST be set in production! No default on purpose.
// If this leaks, attackers can forge valid tokens and impersonate any user
// Generate a strong one: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
export const JWT_SECRET = process.env.JWT_SECRET;
// TODO: Could add a check here that throws if JWT_SECRET is undefined in production


// ----------------------------------------------------------------------------
// DATABASE
// ----------------------------------------------------------------------------

// PostgreSQL connection string
// Format: postgresql://user:password@host:port/database
// No default - must be provided (can't guess your database!)
export const DATABASE_URL = process.env.DATABASE_URL;


// ============================================================================
// USAGE NOTES
// ============================================================================
//
// In other files, import what you need:
//   import { PORT, JWT_SECRET } from './config.js';
//
// Required .env file for local development:
//   PORT=4000
//   NODE_ENV=development
//   JWT_SECRET=your-super-secret-key-here
//   DATABASE_URL=postgresql://postgres:password@localhost:5432/greenshoes
//
// For production (Render, Heroku, etc.):
//   Set these as environment variables in the dashboard
//   NEVER commit real secrets to git!
//
// ============================================================================