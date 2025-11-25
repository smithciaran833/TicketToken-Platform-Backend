# PHASE 3 - EDGE CASES & SECURITY 🛡️

**Priority:** MEDIUM  
**Time Estimate:** 4-5 hours  
**Goal:** Test security boundaries, limits, and edge cases

---

## TEST FILES TO CREATE

### 1. `rate-limiting.test.ts`
**Rate limit enforcement**
- Login endpoint rate limiting
- Registration endpoint rate limiting
- Password reset rate limiting
- Per-IP rate limits
- Per-user rate limits
- Rate limit headers returned
- Rate limit exceeded response
- Rate limit window reset

**Files Tested:**
- services/rate-limit.service.ts
- middleware/security.middleware.ts
- utils/rateLimiter.ts

---

### 2. `brute-force-protection.test.ts`
**Attack prevention**
- Failed login attempt tracking
- Account lockout after X failed attempts
- Lockout duration enforcement
- Progressive delays on failed attempts
- IP-based blocking
- CAPTCHA requirement after failures
- Lockout notification email
- Manual unlock by admin

**Files Tested:**
- services/brute-force-protection.service.ts
- services/lockout.service.ts

---

### 3. `token-edge-cases.test.ts`
**JWT edge cases**
- Token with missing claims
- Token with extra claims
- Token with wrong issuer
- Token with wrong audience
- Token used before valid time (nbf)
- Concurrent token refresh requests
- Token replay attacks
- Token with SQL injection attempt in payload

**Files Tested:**
- services/jwt.service.ts
- services/enhanced-jwt.service.ts
- middleware/token-validator.ts

---

### 4. `input-validation.test.ts`
**Malicious input handling**
- SQL injection attempts in email
- XSS attempts in name fields
- Extremely long inputs
- Special characters in passwords
- Unicode and emoji handling
- Null bytes in inputs
- Script tags in user data
- Path traversal attempts

**Files Tested:**
- validators/auth.validators.ts
- middleware/validation.middleware.ts
- middleware/security.middleware.ts

---

### 5. `concurrency.test.ts`
**Race conditions**
- Concurrent registration with same email
- Concurrent login from multiple devices
- Concurrent password changes
- Concurrent session revocation
- Concurrent token refresh
- Database deadlock handling
- Transaction isolation

**Files Tested:**
- services/auth.service.ts
- config/database.ts

---

### 6. `biometric-wallet.test.ts`
**Advanced features**
- Biometric registration
- Biometric verification
- Wallet connection (MetaMask, etc)
- Sign message with wallet
- Verify wallet signature
- Disconnect wallet
- Multiple wallet support

**Files Tested:**
- services/biometric.service.ts
- services/wallet.service.ts

---

## SUCCESS CRITERIA

- ✅ All 6 test files created
- ✅ Rate limiting working
- ✅ Brute force protection active
- ✅ Token edge cases handled
- ✅ Malicious input rejected
- ✅ Concurrency safe
