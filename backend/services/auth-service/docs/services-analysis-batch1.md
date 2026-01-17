# Auth Service Services Analysis - Batch 1
## Core Auth & Security
## Purpose: Integration Testing Documentation
## Source: auth.service.ts, auth-extended.service.ts, jwt.service.ts, lockout.service.ts, brute-force-protection.service.ts, rate-limit.service.ts, password-security.service.ts
## Generated: 2026-01-15

---

## 1. auth.service.ts (AuthService)

### DATABASE OPERATIONS
| Operation | Table | Columns/Conditions | Notes |
|-----------|-------|-------------------|-------|
| SELECT | `users` | `id WHERE email = $1 AND deleted_at IS NULL` | Check existing user |
| SELECT | `tenants` | `id WHERE id = $1` | Validate tenant |
| INSERT | `users` | `email, password_hash, first_name, last_name, phone, email_verified, email_verification_token, tenant_id, created_at` | Create user |
| INSERT | `user_sessions` | `user_id, tenant_id, ip_address, user_agent, started_at` | Create session |
| SELECT | `users` | `id, email, password_hash, first_name, last_name, email_verified, mfa_enabled, permissions, role, tenant_id, failed_login_attempts, locked_until WHERE email = $1 AND deleted_at IS NULL` | Login lookup |
| UPDATE | `users` | `failed_login_attempts = 0, locked_until = NULL WHERE id = $1` | Clear lockout |
| UPDATE | `users` | `failed_login_attempts = $1, locked_until = $2 WHERE id = $3` | Set lockout |
| UPDATE | `users` | `failed_login_attempts = 0, locked_until = NULL, login_count = login_count + 1, last_login_at = NOW(), last_login_ip = $2, last_active_at = NOW() WHERE id = $1` | Successful login |
| INSERT | `invalidated_tokens` | `token, user_id, tenant_id, invalidated_at, expires_at` | Logout - `ON CONFLICT (token) DO NOTHING` |
| UPDATE | `user_sessions` | `ended_at = NOW() WHERE user_id = $1 AND ended_at IS NULL` | Logout |
| UPDATE | `users` | `email_verified = true WHERE email_verification_token = $1` | Verify email |
| SELECT | `users` | `id, email, password_reset_token, password_reset_expires WHERE email = $1 AND deleted_at IS NULL` | Forgot password |
| UPDATE | `users` | `password_reset_token = $1, password_reset_expires = $2 WHERE id = $3` | Set reset token |
| SELECT | `users` | `id WHERE password_reset_token = $1 AND password_reset_expires > NOW() AND deleted_at IS NULL FOR UPDATE` | Reset password (with row lock) |
| UPDATE | `users` | `password_hash = $1, password_reset_token = NULL, password_reset_expires = NULL, password_changed_at = NOW() WHERE id = $2` | Complete reset |
| SELECT | `users` | `password_hash WHERE id = $1 AND deleted_at IS NULL FOR UPDATE` | Change password (with row lock) |
| UPDATE | `users` | `password_hash = $1, password_changed_at = NOW() WHERE id = $2` | Update password |

### TRANSACTIONS
| Method | Transaction Type |
|--------|-----------------|
| `register` | BEGIN → INSERT user → INSERT session → COMMIT (ROLLBACK on error) |
| `login` | BEGIN → UPDATE user → INSERT session → COMMIT (ROLLBACK on error) |
| `resetPassword` | BEGIN → SELECT FOR UPDATE → UPDATE → COMMIT (ROLLBACK on error) |
| `changePassword` | BEGIN → SELECT FOR UPDATE → UPDATE → COMMIT (ROLLBACK on error) |

### REDIS OPERATIONS
None direct - delegates to JWTService

### CRYPTOGRAPHIC OPERATIONS
| Operation | Library | Details |
|-----------|---------|---------|
| Password hashing | bcrypt | `bcrypt.hash(password, 10)` - cost factor 10 |
| Password verify | bcrypt | `bcrypt.compare(data.password, passwordHash)` |
| Timing attack prevention | bcrypt | Pre-computed dummy hash `$2b$10$...` compared when user not found |
| Token generation | crypto | `crypto.randomBytes(32).toString('hex')` for email verification & password reset |
| Random jitter | crypto | `crypto.randomInt(0, 50)` - 0-50ms delay |

### TIME-SENSITIVE LOGIC
| Timing | Value | Purpose |
|--------|-------|---------|
| MIN_RESPONSE_TIME | 500ms | Login timing attack prevention |
| MIN_RESPONSE_TIME | 300ms | Forgot password timing attack prevention |
| MAX_FAILED_ATTEMPTS | 5 | Account lockout threshold |
| LOCKOUT_DURATION_MINUTES | 15 | Account lockout duration |
| Password reset expiry | 1 hour | `new Date(Date.now() + 3600000)` |
| PASSWORD_RESET_IDEMPOTENCY_WINDOW | 15 minutes | Don't resend email if token exists |
| Invalidated token expiry | 7 days | Refresh token blacklist TTL |

### ERROR HANDLING
| Error | Condition | Code/Message |
|-------|-----------|--------------|
| Duplicate email | `existingResult.rows.length > 0` | code: 'DUPLICATE_EMAIL', statusCode: 409 |
| Invalid tenant | `tenantResult.rows.length === 0` | code: 'INVALID_TENANT', statusCode: 400 |
| Account locked | `locked_until > NOW()` | Message includes minutes remaining |
| Invalid credentials | `!user || !valid` | Generic "Invalid credentials" |
| Invalid reset token | `result.rows.length === 0` | "Invalid or expired reset token" |
| User not found | `result.rows.length === 0` | "User not found" |
| Invalid current password | `!valid` | "Invalid current password" |
| Same password | `oldPassword === newPassword` | "New password must be different from current password" |

### SIDE EFFECTS
| Effect | Method | Details |
|--------|--------|---------|
| Audit log | `register`, `login` | `auditService.logSessionCreated()` |
| Email | `register` | `emailService.sendVerificationEmail()` |
| Email | `forgotPassword` | `sendPasswordResetEmail()` (async, fire-and-forget) |
| Logging | All methods | Logger with component='AuthService' |

### SERVICE DEPENDENCIES
- JWTService: `generateTokenPair()`, `refreshTokens()`, `decode()`
- EmailService: `sendVerificationEmail()`
- AuditService: `logSessionCreated()`

---

## 2. auth-extended.service.ts (AuthExtendedService)

### DATABASE OPERATIONS
| Operation | Table | Columns/Conditions | Notes |
|-----------|-------|-------------------|-------|
| SELECT | `users` | `WHERE email = $1 AND deleted_at IS NULL` (knex) | Find user for reset |
| UPDATE | `users` | `password_hash, password_changed_at, updated_at WHERE id = $1` | Reset/change password |
| INSERT | `audit_logs` | `service, action, action_type, resource_type, user_id, ip_address, created_at` | Audit logging |
| SELECT | `users` | `WHERE id = $1 AND deleted_at IS NULL` | Verify email / resend / change password |
| UPDATE | `users` | `email_verified = true, email_verified_at, updated_at WHERE id = $1 AND deleted_at IS NULL` | Mark verified |
| UPDATE | `user_sessions` | `revoked_at, metadata WHERE user_id = $1 AND revoked_at IS NULL` | Invalidate sessions on password change |

### REDIS OPERATIONS
| Method | Key Pattern | Operation | TTL |
|--------|-------------|-----------|-----|
| `resetPassword` | `password-reset:{token}` | GET | - |
| `resetPassword` | `tenant:*:password-reset:{token}` | SCAN + GET | - |
| `resetPassword` | `password-reset:{token}` | DEL | - |
| `resetPassword` | `tenant:{tenantId}:password-reset:{token}` | DEL | - |
| `resetPassword` | `tenant:{tenantId}:refresh_token:*` or `refresh_token:*` | SCAN + DEL | - |
| `verifyEmail` | `email-verify:{token}` | GET | - |
| `verifyEmail` | `tenant:*:email-verify:{token}` | SCAN + GET | - |
| `verifyEmail` | `email-verify:{token}` | DEL | - |
| `resendVerification` | `resend-verify:{userId}` | INCR | 3600s (1 hour) |

**Non-blocking SCAN:** Uses cursor-based SCAN instead of blocking KEYS command with COUNT 100

### CRYPTOGRAPHIC OPERATIONS
| Operation | Library | Details |
|-----------|---------|---------|
| Password hashing | bcrypt | `bcrypt.hash(newPassword, 10)` |
| Password verify | bcrypt | `bcrypt.compare(currentPassword, user.password_hash)` |

### TIME-SENSITIVE LOGIC
| Timing | Value | Purpose |
|--------|-------|---------|
| Resend rate limit window | 1 hour | Max 3 attempts per hour |
| Resend max attempts | 3 | Within 1 hour window |

### ERROR HANDLING
| Error Type | Condition | Message |
|------------|-----------|---------|
| ValidationError | Token not found in Redis | 'Invalid or expired reset token' |
| ValidationError | Email mismatch | 'Email mismatch' |
| ValidationError | Update failed | 'Failed to update user' |
| ValidationError | Rate limited | 'Too many resend attempts. Try again later.' |
| ValidationError | Already verified | 'Email already verified' |
| ValidationError | Weak password | Multiple rules checked |
| AuthenticationError | User not found | 'User not found' |
| AuthenticationError | Wrong password | 'Current password is incorrect' |
| ValidationError | Same password | 'New password must be different from current password' |

### PASSWORD VALIDATION RULES
- Min 8 characters
- At least one uppercase
- At least one lowercase
- At least one number
- At least one special character: `!@#$%^&*(),.?":{}|<>`

### SIDE EFFECTS
| Effect | Method | Details |
|--------|--------|---------|
| Audit log INSERT | `requestPasswordReset` | action: 'password_reset_requested' |
| Audit log INSERT | `resetPassword` | action: 'password_reset_completed' |
| Audit log INSERT | `verifyEmail` | action: 'email_verified' |
| Audit log INSERT | `changePassword` | action: 'password_changed' |
| Session invalidation | `changePassword` | Revokes all user sessions with reason |
| Email | `requestPasswordReset` | Via EmailService |
| Email | `resendVerification` | Via EmailService |

### SERVICE DEPENDENCIES
- EmailService: `sendPasswordResetEmail()`, `sendVerificationEmail()`
- passwordResetRateLimiter: `consume(ipAddress)`

---

## 3. jwt.service.ts (JWTService)

### DATABASE OPERATIONS
| Operation | Table | Columns/Conditions |
|-----------|-------|-------------------|
| SELECT | `users` | `tenant_id WHERE id = $1` (if missing tenant_id) |
| SELECT | `users` | `id, tenant_id, email, permissions, role WHERE id = $1` (during refresh) |
| SELECT | `users` | `id, email, first_name, last_name, email_verified, mfa_enabled, permissions, role, tenant_id WHERE id = $1 AND deleted_at IS NULL` (get user info) |

### REDIS OPERATIONS
| Method | Key Pattern | Operation | TTL |
|--------|-------------|-----------|-----|
| `generateTokenPair` | `tenant:{tenantId}:refresh_token:{jti}` | SETEX | 7 days (604800s) |
| `refreshTokens` | `tenant:{tenantId}:refresh_token:{jti}` | GET | - |
| `refreshTokens` | `tenant:{tenantId}:refresh_token:{jti}` | DEL | - |
| `invalidateTokenFamily` | `tenant:{tenantId}:refresh_token:*` or `refresh_token:*` | SCAN + GET + DEL | - |
| `revokeAllUserTokens` | `tenant:{tenantId}:refresh_token:*` or `refresh_token:*` | SCAN + GET + DEL | - |

### CRYPTOGRAPHIC OPERATIONS
| Operation | Library | Details |
|-----------|---------|---------|
| JWT signing | jsonwebtoken | RS256 algorithm with private key |
| JWT verification | jsonwebtoken | RS256 with public key |
| Token ID generation | crypto | `crypto.randomUUID()` for jti and family |
| Key management | filesystem/env | RSA 4096-bit keys |

### TOKEN PAYLOADS
**Access Token:**
```typescript
{
  sub: string,        // user ID
  type: 'access',
  jti: string,        // UUID
  tenant_id: string,
  email?: string,
  permissions?: string[],
  role?: string
}
```

**Refresh Token:**
```typescript
{
  sub: string,        // user ID
  type: 'refresh',
  jti: string,        // UUID
  tenant_id: string,
  family: string      // UUID - for detecting token reuse
}
```

### TIME-SENSITIVE LOGIC
| Timing | Source | Purpose |
|--------|--------|---------|
| Access token expiry | `env.JWT_ACCESS_EXPIRES_IN` | Short-lived access |
| Refresh token expiry | `env.JWT_REFRESH_EXPIRES_IN` | Long-lived refresh |
| Redis TTL | 7 days (604800s) | Refresh token storage |

### ERROR HANDLING
| Error Type | Condition |
|------------|-----------|
| TokenError | Invalid token type (not 'access' or 'refresh') |
| TokenError | Missing tenant context |
| TokenError | Token expired |
| TokenError | Invalid access token |
| TokenError | Token reuse detected - invalidates entire family |
| Error | User not found during refresh |

### KEY ROTATION
- Supports current + previous key for graceful rotation
- Keys identified by `kid` header in JWT
- Verification tries multiple keys based on `kid`

---

## 4. lockout.service.ts (LockoutService)

### REDIS OPERATIONS
| Method | Key Pattern | Operation | TTL |
|--------|-------------|-----------|-----|
| `recordFailedAttempt` | `lockout:user:{userId}` | INCR | lockoutDuration (seconds) |
| `recordFailedAttempt` | `lockout:ip:{ipAddress}` | INCR | lockoutDuration (seconds) |
| `recordFailedAttempt` | - | TTL | Get remaining lockout time |
| `checkLockout` | `lockout:user:{userId}` | GET | - |
| `checkLockout` | `lockout:ip:{ipAddress}` | GET | - |
| `clearFailedAttempts` | `lockout:user:{userId}` | DEL | - |
| `clearFailedAttempts` | `lockout:ip:{ipAddress}` | DEL | - |

### TIME-SENSITIVE LOGIC
| Setting | Source | Purpose |
|---------|--------|---------|
| maxAttempts | `env.LOCKOUT_MAX_ATTEMPTS` | User lockout threshold |
| maxAttempts * 2 | - | IP lockout threshold (double) |
| lockoutDuration | `env.LOCKOUT_DURATION_MINUTES * 60` | Converted to seconds |

### ERROR HANDLING
| Error Type | Condition |
|------------|-----------|
| RateLimitError | User attempts >= maxAttempts |
| RateLimitError | IP attempts >= maxAttempts * 2 |

Error message includes remaining minutes from TTL.

---

## 5. brute-force-protection.service.ts (BruteForceProtectionService)

### REDIS OPERATIONS
| Method | Key Pattern (via keyBuilder) | Operation | TTL |
|--------|------------------------------|-----------|-----|
| `recordFailedAttempt` | `failedAuth:{identifier}` | GET (via fixedWindow) | attemptWindow |
| `recordFailedAttempt` | `authLock:{identifier}` | GET | - |
| `recordFailedAttempt` | `authLock:{identifier}` | SETEX | lockoutDuration (900s) |
| `recordFailedAttempt` | `failedAuth:{identifier}` | DEL | - |
| `clearFailedAttempts` | `failedAuth:{identifier}` | DEL | - |
| `isLocked` | `authLock:{identifier}` | GET | - |
| `getLockInfo` | `authLock:{identifier}` | TTL | - |

### TIME-SENSITIVE LOGIC
| Constant | Value | Purpose |
|----------|-------|---------|
| maxAttempts | 5 | Lockout after 5 failures |
| lockoutDuration | 900 seconds (15 min) | Account locked for 15 min |
| attemptWindow | 900 seconds (15 min) | Rolling window for counting attempts |

### SERVICE DEPENDENCIES
- `@tickettoken/shared`: `getRateLimiter()`, `getKeyBuilder()`
- Uses atomic Lua scripts via shared library's `fixedWindow()` method

---

## 6. rate-limit.service.ts (RateLimitService)

### REDIS OPERATIONS
| Method | Key Pattern (via keyBuilder) | Operation | TTL |
|--------|------------------------------|-----------|-----|
| `consume` | `rateLimit:{action}:{identifier}` or `rateLimit:{action}:{venueId}:{identifier}` | fixedWindow | Varies by action |

### RATE LIMITS
| Action | Points | Duration |
|--------|--------|----------|
| login | 5 | 60 seconds |
| register | 3 | 300 seconds (5 min) |
| wallet | 10 | 60 seconds |
| default | 100 | 60 seconds |

### SERVICE DEPENDENCIES
- `@tickettoken/shared`: `getRateLimiter()`, `getKeyBuilder()`
- Uses atomic Lua scripts for race-condition-free rate limiting

### ERROR HANDLING
| Error | Condition |
|-------|-----------|
| Error | `!result.allowed` - "Rate limit exceeded. Try again in {retryAfter} seconds." |

---

## 7. password-security.service.ts (PasswordSecurityService)

### DATABASE OPERATIONS
None

### REDIS OPERATIONS
None

### CRYPTOGRAPHIC OPERATIONS
| Operation | Library | Details |
|-----------|---------|---------|
| Password hashing | argon2 | argon2id variant |
| Password verification | argon2 | `argon2.verify(hash, password)` |
| Salt generation | crypto | `crypto.randomBytes(16)` |

### ARGON2 PARAMETERS
| Parameter | Value |
|-----------|-------|
| type | argon2id |
| memoryCost | 65536 (64 MB) |
| timeCost | 3 |
| parallelism | 4 |
| salt | 16 random bytes |

### PASSWORD VALIDATION RULES
| Rule | Requirement |
|------|-------------|
| minLength | 12 characters |
| maxLength | 128 characters |
| Uppercase | At least 1 |
| Lowercase | At least 1 |
| Numbers | At least 1 |
| Special chars | At least 1 from `!@#$%^&*()_+-=[]{}|;:,.<>?` |
| Common passwords | Not in blocklist |
| Repeated chars | No more than 2 in sequence |

### COMMON PASSWORD BLOCKLIST
```
password123, 12345678, qwerty123, letmein, welcome123,
password, admin123, root1234, master123, pass1234
```

### ERROR HANDLING
| Error | Condition |
|-------|-----------|
| Error | Validation fails before hashing - "Password validation failed: {errors}" |

---

## Summary: Cross-Service Dependencies

```
                    ┌─────────────────┐
                    │  AuthService    │
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
   ┌───────────┐     ┌───────────┐      ┌──────────────┐
   │ JWTService│     │EmailService│      │ AuditService │
   └─────┬─────┘     └───────────┘      └──────────────┘
         │
         ▼
   ┌───────────┐
   │   Redis   │  (refresh tokens, invalidation)
   └───────────┘
   
   
   ┌─────────────────────────┐
   │  AuthExtendedService    │
   └───────────┬─────────────┘
               │
    ┌──────────┼──────────┐
    │          │          │
    ▼          ▼          ▼
┌────────┐ ┌────────┐ ┌──────────────────────┐
│  Redis │ │  DB    │ │ passwordResetLimiter │
└────────┘ └────────┘ └──────────────────────┘


   ┌──────────────────────────────────────┐
   │  Security Layer (all use Redis)     │
   ├─────────────────┬────────────────────┤
   │ LockoutService  │ BruteForceService  │
   │ RateLimitService│                    │
   └─────────────────┴────────────────────┘
           │
           ▼
   ┌───────────────────────┐
   │  @tickettoken/shared  │
   │  (atomic rate limits) │
   └───────────────────────┘
```

---

## Integration Testing Implications

### Database Setup Requirements
1. **Tables required:**
   - `users` - with all columns mentioned above
   - `tenants` - for tenant validation
   - `user_sessions` - for session tracking
   - `invalidated_tokens` - for token blacklist
   - `audit_logs` - for audit trail

2. **Constraints to test:**
   - `ON CONFLICT (token) DO NOTHING` on invalidated_tokens
   - `FOR UPDATE` row locking on password operations

### Redis Setup Requirements
1. **Key prefixes to seed/verify:**
   - `tenant:{id}:refresh_token:{jti}` - refresh tokens
   - `password-reset:{token}` - password reset tokens
   - `email-verify:{token}` - email verification tokens
   - `lockout:user:{userId}` - user lockout counters
   - `lockout:ip:{ipAddress}` - IP lockout counters
   - `failedAuth:{identifier}` - brute force counters
   - `authLock:{identifier}` - brute force locks
   - `rateLimit:{action}:{identifier}` - rate limit counters
   - `resend-verify:{userId}` - resend rate limits

### Time-Based Testing Considerations
- Test lockout expiration (15 min windows)
- Test token expiration (1 hour for password reset)
- Test timing attack prevention (500ms minimum response)
- Test idempotency windows (15 min for password reset)
