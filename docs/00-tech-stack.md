# ⚙️ Technical Stack & API Services – GreenShoes Backend

## 1. Overview
The **GreenShoes Platform** is a secure, scalable, and modular e-commerce application that integrates modern backend practices, AI-enhanced personalization (future module), and enterprise-grade authentication.  
This document summarizes all core technologies, frameworks, libraries, and services powering the backend.

---

## 2. Architecture Overview
| Layer | Technology | Purpose |
|-------|-------------|----------|
| **Backend Framework** | **Express.js (Node.js)** | RESTful API layer for handling client requests |
| **Database** | **MongoDB Atlas (Cloud)** | Stores users, products, orders, and sessions |
| **ORM / ODM** | **Mongoose** | Object modeling and schema enforcement for MongoDB |
| **Authentication** | **JWT (JSON Web Token)** | Secure token-based login with stateless sessions |
| **2FA** | **Speakeasy + QRCode (Google Authenticator Integration)** | Backend-generated TOTP authentication with scannable QR |
| **Security Middleware** | **Helmet + CORS + Cookie-Parser** | HTTP header hardening, cross-origin control, cookie safety |
| **Logging** | **Morgan** | Request logging for monitoring and debugging |
| **Encryption** | **bcrypt** | Secure password hashing algorithm |
| **Environment Management** | **dotenv** | Centralized environment variable handling |
| **Server Monitoring** | **Nodemon (Dev Only)** | Auto-reload server for smoother local development |

---

## 3. Developer Tooling
| Tool | Description |
|------|--------------|
| **Jest** | Testing framework for unit and integration tests |
| **Supertest** | HTTP testing library for API endpoints |
| **MongoDB Memory Server** | In-memory mock DB for unit testing without live Atlas connection |
| **VS Code** | Primary IDE for development |
| **Postman** | API testing and verification tool |
| **GitHub** | Version control and collaboration |
| **Docker (Planned)** | Future deployment containerization |

---

## 4. External Integrations (Planned)
| Service | Description |
|----------|-------------|
| **Google Authenticator App** | User-facing 2FA app integrated via backend TOTP |
| **Cloudinary / AWS S3 (Future)** | Media storage for product images |
| **Stripe / PayPal (Future)** | Payment gateway integration |
| **SendGrid / Nodemailer (Future)** | Transactional email services |
| **AI Fashion Recommender (Phase 2)** | ML microservice for outfit suggestions |

---

## 5. API Layer Summary
| API Category | Endpoint Prefix | Description |
|---------------|----------------|--------------|
| **Auth APIs** | `/api/auth` | Handles registration, login, JWT issuance, and logout |
| **2FA APIs** | `/api/auth/2fa` | Setup and verification for Google Authenticator |
| **User APIs** | `/api/users` | View and manage user profiles |
| **Admin APIs** | `/api/admin` | Admin dashboard functions, protected by RBAC |
| **Product APIs** | `/api/products` | CRUD operations for catalog and inventory |
| **Order APIs** | `/api/orders` | Checkout, order tracking, and payment linking |
| **Health Check** | `/health` | Monitors service uptime |

---

## 6. Security Highlights
* Passwords are hashed using `bcrypt`  
* JWT tokens stored as **HttpOnly cookies**  
* 2FA uses **RFC 6238 TOTP standard** compatible with Google Authenticator  
* Sensitive variables stored only in `.env`  
* Helmet ensures secure HTTP headers and disables unsafe browser behaviors  

---

## 7. Testing & QA
| Category | Tools | Purpose |
|-----------|-------|----------|
| **Unit Tests** | Jest | Isolates business logic correctness |
| **API Tests** | Supertest | Verifies endpoint responses |
| **Database Tests** | MongoDB Memory Server | Simulates real queries safely |
| **Manual Tests** | Postman | Exploratory and regression validation |

---

## 8. Deployment Readiness
| Environment | Description |
|--------------|-------------|
| **Development** | Local setup with Nodemon and test DB |
| **Staging** | Planned – Dockerized version connected to Atlas staging DB |
| **Production** | Planned – Cloud deployment (Render, AWS, or Vercel) |

---

## 9. Outcome
* Established a full-stack-ready, modular backend foundation. 

* All key layers – from database to authentication – are documented, tested, and scalable.  

* 2FA, RBAC, and JWT foundations are built for enterprise-level security.

---

**Author:** Kamalasankari Subramaniakuppusamy (on behalf of Team GreenShoes)

**Date:** October 30, 2025

**Document Version:** v1.0  

**Module:** GreenShoes Backend – Tech Stack Overview
