# GreenShoes Project — Progress Documentation

### Student
Kamalasankari Subramaniakuppusamy  
Manali Moger
Ankita Vilas Pimpalkar
Ian Chou
Abhi Bhardwaj
George Washington University  
Fall 2025 — Component-Based Enterprise Software Systems

---

## ✅ Phase 0: Development Environment Setup

| Task | Status | Details |
|------|:-----:|---------|
| Local project folder created | ✅ | /Users/kamala/Documents/Projects/GreenShoes |
| Git repo initialized | ✅ | 'greenshoes-be' folder with README & .gitignore |
| Private GitHub repo created | ✅ | SSH authentication working |
| Pushed first commit | ✅ | Clean initial commit present on `main` |
| Dev branch created & pushed | ✅ | Working on `dev` as primary branch |

---

## ✅ Phase 1: Governance & Security Foundations

| Task | Status | Value |
|------|:-----:|------|
| MIT License added | ✅ | Academic compliance |
| Proprietary security NOTICE added | ✅ | Protects sensitive authentication code |
| Branch protection rules active | ✅ | Professional workflow |

---

## Tools & Architecture Confirmed

| Area | Decision | Notes |
|------|----------|------|
| Backend | Node.js + Express | REST API |
| Database | MongoDB Atlas | Free Tier, JSON-friendly |
| Authentication | JWT + bcrypt | HttpOnly cookie security |
| 2FA | TOTP (Speakeasy) | Industry-standard security |
| Repo Structure | Backend/Frontend separated | Enterprise style |

---

## Summary

We have successfully set the foundation of a secure, professional-grade development environment.  
Next step: Backend implementation including Express server, DB connection, and Authentication with 2FA.

---

## Phase 2: Core Backend Verification

### **Milestones Achieved**
| Task | Status | Verification |
|------|:------:|--------------|
| Secure Express server setup | ✅ | Helmet, CORS, Morgan, Cookie Parser integrated |
| MongoDB Atlas connection | ✅ | Successfully connected via Mongoose |
| Environment management | ✅ | `.env` + `.env.example` standardized |
| Health check endpoint | ✅ | `/health` verified via Jest & Supertest |
| Unit testing environment | ✅ | Jest + Supertest configured with ES Modules |
| CI-ready configuration | ✅ | Server exports (`app`, `server`) support isolated testing |

---

### **Verification Summary**
Unit test executed successfully:
```bash
PASS src/tests/server.test.js
  Health Check API
    ✓ should return { ok: true } (10 ms)


