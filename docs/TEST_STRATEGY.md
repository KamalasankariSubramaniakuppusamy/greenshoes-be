# GreenShoes Backend – Test Strategy

This document outlines the complete testing methodology for the GreenShoes backend system.  
The goal is to ensure correctness, stability, security, and confidence at every development phase.

---

# Testing Philosophy

GreenShoes uses a **Test-Driven Development (TDD-inspired approach)** where:
- Small units are tested independently
- Each module has its own test suite
- Database operations are tested after schema creation
- Integration tests verify complete request–response flows
- Security-sensitive functions (e.g., 2FA, password hashing) receive additional coverage

Testing is built using:
- **Jest** for unit testing
- **Supertest** for HTTP endpoint testing
- **Prisma test client** (Phase 2+) for DB-layer validation

---

# Test Categories

## 1. Unit Tests
Tests for isolated logic components (e.g., services, utilities).

**Current Unit Tests (Phase 1):**
- `/tests/unit/health.test.js`  
  - Validates `/api/health` returns 200  
  - Confirms response body includes `status: "ok"`  

**Future Unit Tests:**
- Auth service (password hashing, JWT creation, 2FA)
- User service (addresses, profile updates)
- Product service (filters, variants, inventory)
- Cart service (add/remove/update)
- Order service (transactional logic, rollback)

---

## 2. Integration Tests
Tests for Express routes using Supertest.

**Phase 2 goal:**  
Add route integration tests after DB is configured.

**Planned Integration Suites:**
- `/api/auth/*`
- `/api/products/*`
- `/api/cart/*`
- `/api/orders/*`
- `/api/admin/*`

These will validate:
- Route correctness  
- HTTP status codes  
- Input validation  
- Authentication + 2FA enforcement  
- Database interactions  

---

## 3. Database Tests (Phase 2+)  
Once Prisma schema is ready:
- Test DB connectivity
- Test CRUD operations for each model
- Test relational integrity (foreign keys)
- Test transaction logic (orders, inventory deduction)

These tests ensure:
- Schema correctness  
- No regression in migrations  
- No broken relations  

---

## 4. Security Tests (Phase 3+)  
Security-sensitive components require dedicated tests:
- Password hashing and verification  
- JWT signing and expiration  
- 2FA TOTP token generation + validation  
- Attempt rate-limiting behavior  
- Unauthorized access prevention  

---

# Current Test Coverage (Phase 1)

| Test Type          | Files Tested            | Status      |
|--------------------|--------------------------|------------|
| Unit Tests         | `health.test.js`         | Passed     |
| Integration Tests  | None (DB not ready yet)  | Pending    |
| DB Tests           | None (schema pending)    | Pending    |
| Security Tests     | None (auth not built)    | Pending    |

---

# Folder Structure for Tests
tests/
    unit/
    health.test.js
    integration/

(all empty till phase 2)


# Future Testing Enhancements

### Once database is ready:
- Add Test DB URL (for isolated testing)
- Auto-reset DB between tests
- Use Prisma’s `db.$transaction` for transactional integrity tests

### Once full backend is implemented:
- Add coverage reports (`--coverage`)
- Implement CI automation (GitHub Actions)
- Add load testing (optional)
- Add security scan tests (optional)

---

# Conclusion

The testing foundation for GreenShoes is officially established.  
Phase 1’s tests confirm the backend is functioning correctly and stable.

Phase 2 will introduce database testing, significantly expanding coverage and reliability.



