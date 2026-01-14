# USER REGISTRATION/AUTH FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | December 31, 2024 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | User Registration & Authentication |

---

## Files Verified

| Component | File | Status |
|-----------|------|--------|
| Routes | `auth.routes.ts` | ✅ Verified |
| Controller | `auth.controller.ts` | ✅ Verified |
| Auth Service | `auth.service.ts` | ✅ Verified |
| JWT Service | `jwt.service.ts` | ✅ Verified |
| Email Service | `email.service.ts` | ✅ Verified |
| MFA Service | `mfa.service.ts` | ✅ Verified |
| Validators | `auth.validators.ts` | ✅ Verified |
| Database Schema | `001_auth_baseline.ts` | ✅ Verified |

---

## Registration Flow

### What Happens (Verified)
```
1. POST /register
         ↓
2. Rate limit check (registrationRateLimiter)
         ↓
3. Joi validation (registerSchema)
   - email: required, valid email, max 255
   - password: required, min 8, max 128
   - firstName/lastName: required, max 50
   - phone: optional, E.164 format
   - tenant_id: required, UUID
         ↓
4. Check for existing user (SELECT by email)
         ↓
5. Validate tenant exists
         ↓
6. Hash password (bcrypt, 10 rounds)
         ↓
7. Generate email verification token (32 bytes hex)
         ↓
8. Sanitize input (stripHtml, normalizeEmail, normalizeText)
         ↓
9. Database transaction:
   - INSERT user
   - Generate JWT token pair (RS256)
   - Create session record
         ↓
10. Audit log session creation
         ↓
11. Send verification email (Resend API in prod, console.log in dev)
         ↓
12. Return { user, tokens }
```

### Security Features (Verified in Code)

| Feature | Location | Implementation |
|---------|----------|----------------|
| Password hashing | auth.service.ts:67 | `bcrypt.hash(data.password, 10)` |
| Input sanitization | auth.service.ts:69-70 | `stripHtml()`, `normalizeEmail()`, `normalizeText()` |
| Duplicate check | auth.service.ts:42-47 | SQL query before insert |
| Email verification | email.service.ts:17-44 | Token stored in Redis, link sent |
| Rate limiting | auth.routes.ts:52 | `registrationRateLimiter.consume()` |
| Schema validation | auth.validators.ts:18-27 | Joi with `.unknown(false)` |

---

## Login Flow

### What Happens (Verified)
```
1. POST /login
         ↓
2. Rate limit check (multiple limiters)
         ↓
3. CAPTCHA check (if threshold exceeded)
         ↓
4. Joi validation (loginSchema)
         ↓
5. Lookup user by email
         ↓
6. Check account lockout (locked_until)
         ↓
7. Compare password with DUMMY_HASH if user not found (timing attack prevention)
         ↓
8. Add random jitter: crypto.randomInt(0, 50)ms
         ↓
9. Enforce minimum response time: 500ms
         ↓
10. If failed: increment failed_login_attempts
    If 5+ failures: lock account for 15 minutes
         ↓
11. If MFA enabled:
    - Return requiresMFA if no token
    - Verify TOTP (speakeasy) or backup code
         ↓
12. Reset failed attempts
         ↓
13. Generate JWT token pair
         ↓
14. Create session record
         ↓
15. Return { user, tokens }
```

### Security Features (Verified in Code)

| Feature | Location | Implementation |
|---------|----------|----------------|
| Timing attack prevention | auth.service.ts:127-128 | Dummy hash for non-existent users |
| Random jitter | auth.service.ts:132-133 | `crypto.randomInt(0, 50)` |
| Minimum response time | auth.service.ts:118,177 | 500ms floor |
| Account lockout | auth.service.ts:119-120 | 5 attempts, 15 min lockout |
| CAPTCHA | auth.controller.ts:39-58 | After N failures |
| MFA verification | auth.controller.ts:89-119 | TOTP then backup code fallback |

---

## JWT Token Management

### Implementation (Verified)

**File:** `jwt.service.ts`

| Feature | Implementation |
|---------|----------------|
| Algorithm | RS256 (asymmetric) |
| Key management | JWTKeyManager class |
| Production keys | From environment/secrets manager |
| Dev keys | From filesystem (~/.tickettoken-secrets/) |
| Access token | Contains: sub, type, jti, tenant_id, email, permissions, role |
| Refresh token | Contains: sub, type, jti, tenant_id, family |
| Token storage | Redis with tenant prefix |
| Token reuse detection | Family-based invalidation |
| JWKS endpoint | `getJWKS()` returns public keys |

### Token Refresh (Verified)
```typescript
// jwt.service.ts:184-232
async refreshTokens(refreshToken, ipAddress, userAgent) {
  // Verify signature with correct key (supports rotation)
  // Check token exists in Redis
  // If missing: invalidate entire token family (theft detection)
  // Generate new token pair
  // Delete old refresh token from Redis
}
```

---

## MFA (Multi-Factor Authentication)

### Implementation (Verified)

**File:** `mfa.service.ts`

| Feature | Implementation |
|---------|----------------|
| TOTP library | speakeasy |
| QR generation | qrcode |
| Secret encryption | AES-256-GCM |
| Backup codes | 10 codes, SHA-256 hashed |
| Rate limiting | Separate limiters for OTP, setup, backup codes |
| Token reuse prevention | Redis with 90s TTL |
| Idempotent setup | 5 min window, returns same secret |

### MFA Setup Flow (Verified)
```
1. POST /mfa/setup
   - Rate limit check
   - Check MFA not already enabled
   - Check for existing setup in Redis (idempotency)
   - Generate TOTP secret (32 chars)
   - Generate QR code
   - Generate 10 backup codes
   - Store encrypted in Redis (10 min TTL)
   - Return { secret, qrCode }

2. POST /mfa/verify-setup
   - Rate limit check
   - Get setup data from Redis
   - Verify TOTP code (window: 2)
   - Store encrypted secret in DB
   - Store hashed backup codes in DB
   - Delete setup from Redis
   - Return { backupCodes }
```

---

## Email Service

### Implementation (Verified)

**File:** `email.service.ts`

| Feature | Implementation |
|---------|----------------|
| Provider | Resend |
| Development mode | console.log (no actual send) |
| Verification email | HTML + text, 24h expiry |
| Password reset email | HTML + text, 1h expiry |
| MFA backup codes email | List format |
| Token storage | Redis with tenant prefix |

---

## Input Validation

### Implementation (Verified)

**File:** `auth.validators.ts`

| Schema | Validations |
|--------|-------------|
| registerSchema | email, password (8-128), firstName, lastName, phone (E.164), tenant_id |
| loginSchema | email, password, optional mfaToken (6 digits) |
| resetPasswordSchema | token, newPassword (8-128) |
| walletLoginSchema | publicKey, signature, nonce, chain |
| All schemas | `.unknown(false)` - rejects extra fields |

---

## Database Schema

### Users Table (Verified)

**Key security columns:**
- `password_hash` - bcrypt hash
- `email_verified`, `email_verification_token`
- `mfa_enabled`, `mfa_secret` (encrypted)
- `backup_codes` - TEXT[] of hashed codes
- `failed_login_attempts`, `locked_until`
- `password_reset_token`, `password_reset_expires`
- `tenant_id` - multi-tenant isolation

### Security Features (Verified)

| Feature | Implementation |
|---------|----------------|
| Row Level Security | Enabled on users table |
| Tenant isolation | RLS policy + tenant_id checks |
| Audit triggers | Auto-log INSERT/UPDATE/DELETE |
| PII masking | `users_masked` view with mask_email(), mask_phone() |
| Data retention | `cleanup_expired_data()` function |
| Constraints | Email lowercase, username format, age minimum |

---

## What Works ✅

| Component | Status | Evidence |
|-----------|--------|----------|
| Registration | ✅ | Full flow in auth.service.ts |
| Login | ✅ | Full flow with security hardening |
| JWT tokens (RS256) | ✅ | jwt.service.ts with key rotation |
| Token refresh | ✅ | Family-based invalidation |
| MFA (TOTP) | ✅ | speakeasy + encrypted storage |
| Backup codes | ✅ | 10 codes, hashed, one-time use |
| Email verification | ✅ | Resend integration |
| Password reset | ✅ | Token-based, 1h expiry |
| Account lockout | ✅ | 5 attempts, 15 min |
| CAPTCHA | ✅ | Threshold-based |
| Timing attack prevention | ✅ | Dummy hash + jitter + min time |
| Input validation | ✅ | Joi with strict schemas |
| Audit logging | ✅ | Database triggers |
| Multi-tenant | ✅ | RLS + tenant_id |

---

## Minor Issues

### 1. Password Complexity

**Location:** `auth.validators.ts:20`
```typescript
password: Joi.string().min(8).max(128).required(),
```

**Issue:** Only checks length, not complexity (uppercase, numbers, symbols).

**Risk:** Low - 8 char minimum is reasonable, but could be stronger.

### 2. Email Service Dev Mode

**Location:** `email.service.ts:55-61`
```typescript
if (env.NODE_ENV === 'development' || env.NODE_ENV === 'test') {
  console.log('📧 Email would be sent:', {...});
  return;
}
```

**Note:** Emails don't actually send in dev/test. Expected behavior but worth noting.

---

## Summary

**This authentication system is production-ready and security-hardened.**

| Aspect | Rating |
|--------|--------|
| Security | ⭐⭐⭐⭐⭐ |
| Completeness | ⭐⭐⭐⭐⭐ |
| Code Quality | ⭐⭐⭐⭐⭐ |
| Multi-tenant | ⭐⭐⭐⭐⭐ |

No critical issues found. Ready for production.

---

## Related Documents

- Next: Custodial Wallet Flow (Flow 16)

