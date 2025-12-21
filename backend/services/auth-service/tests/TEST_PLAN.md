# Auth Service Test Plan
## Part 1: Critical Auth Flows (100% Coverage Tier)

> **Generated:** December 7, 2025  
> **Target Coverage:** 80-100% code coverage  
> **Scope:** 6 critical source files

---

## Table of Contents

1. [auth.service.ts](#file-1-srcservicesauthservicets)
2. [jwt.service.ts](#file-2-srcservicesjwtservicets)
3. [password-security.service.ts](#file-3-srcservicespassword-securityservicets)
4. [auth.controller.ts](#file-4-srccontrollersauthcontrollerts)
5. [auth-extended.controller.ts](#file-5-srccontrollersauth-extendedcontrollerts)
6. [auth.routes.ts](#file-6-srcroutesauthroutests)
7. [Summary](#summary-test-count-estimate)

---

## FILE 1: `src/services/auth.service.ts`

### Methods & Coverage Requirements

#### 1. `constructor(jwtService)`
- **Branch**: Async bcrypt.hash for DUMMY_HASH
- **Test**: Verify constructor initializes emailService and pre-generates dummy hash

#### 2. `register(data)` - 12 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Existing user found | Pass email that already exists in DB |
| 2 | Existing user NOT found | Pass unique email |
| 3 | Invalid tenant | Pass non-existent tenant_id |
| 4 | Valid tenant | Pass valid tenant_id |
| 5 | No tenant_id provided | Omit tenant_id (uses default) |
| 6 | Transaction success | Normal registration flow |
| 7 | Transaction rollback | Mock pool.query to fail inside transaction |
| 8 | Email sent | Normal flow (async, non-blocking) |

**Errors to trigger:**
- `DUPLICATE_EMAIL` (409): Register with existing email
- `INVALID_TENANT` (400): Register with fake tenant_id
- Transaction error: Mock DB to throw inside BEGIN/COMMIT

**Test Cases:**
```
✓ Should register new user successfully with valid data
✓ Should return 409 when email already exists
✓ Should return 400 when tenant_id is invalid
✓ Should use default tenant when tenant_id not provided
✓ Should rollback transaction on insert failure
✓ Should sanitize firstName/lastName (strip HTML)
✓ Should generate email verification token
✓ Should create user session in same transaction
```

#### 3. `login(data)` - 10 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | User found | Login with existing email |
| 2 | User NOT found | Login with non-existent email |
| 3 | Password valid | Correct password |
| 4 | Password invalid | Wrong password |
| 5 | User not found OR invalid password | Either condition (same error) |
| 6 | Elapsed < MIN_RESPONSE_TIME | Fast DB response |
| 7 | Elapsed >= MIN_RESPONSE_TIME | Slow DB response |
| 8 | Transaction success | Normal login |
| 9 | Transaction rollback | Mock failure in session insert |

**Errors to trigger:**
- `Invalid credentials`: Wrong email OR wrong password

**Test Cases:**
```
✓ Should login successfully with valid credentials
✓ Should return "Invalid credentials" for non-existent user
✓ Should return "Invalid credentials" for wrong password
✓ Should use DUMMY_HASH when user not found (timing attack prevention)
✓ Should create session in transaction
✓ Should rollback transaction on session creation failure
✓ Should always take >= 500ms (timing attack prevention)
✓ Should add random jitter (0-50ms)
```

#### 4. `refreshTokens(refreshToken, ipAddress, userAgent)` - 3 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Token refresh succeeds | Valid refresh token |
| 2 | User not found after refresh | Delete user after token generation |
| 3 | JWT service throws error | Invalid/expired/reused token |

**Errors:**
- `User not found`: Valid token but user deleted
- `TokenError` from jwtService: Invalid/expired/reused token

**Test Cases:**
```
✓ Should refresh tokens successfully
✓ Should throw "User not found" when user deleted
✓ Should propagate TokenError from jwtService
✓ Should return fresh user data in response
```

#### 5. `logout(userId, refreshToken?)` - 3 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | RefreshToken provided | Pass refreshToken |
| 2 | RefreshToken NOT provided | Omit refreshToken |
| 3 | Error during logout | Mock DB error |

**Test Cases:**
```
✓ Should invalidate refresh token when provided
✓ Should update user_sessions ended_at
✓ Should return success:true even on error (never throws)
✓ Should work without refresh token
```

#### 6. `verifyEmail(token)` - 2 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Valid token | Pass valid verification token |
| 2 | Invalid token | Pass invalid/expired token |

**Errors:**
- `Invalid verification token`: Token doesn't match any user

**Test Cases:**
```
✓ Should verify email with valid token
✓ Should throw "Invalid verification token" for bad token
✓ Should set email_verified = true
```

#### 7. `forgotPassword(email)` - 3 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | User found | Existing email |
| 2 | User NOT found | Non-existent email |
| 3 | Error occurs | Mock DB error |

**Test Cases:**
```
✓ Should generate reset token for existing user
✓ Should return same message for non-existent user (enumeration prevention)
✓ Should return same message on error (enumeration prevention)
✓ Should always take >= 300ms (timing attack prevention)
✓ Should send password reset email (async)
```

#### 8. `resetPassword(token, newPassword)` - 2 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Valid non-expired token | Valid reset token |
| 2 | Invalid/expired token | Bad token or expired |

**Errors:**
- `Invalid or expired reset token`: Token not found or expired

**Test Cases:**
```
✓ Should reset password with valid token
✓ Should throw error for invalid token
✓ Should throw error for expired token
✓ Should clear reset token after use
```

#### 9. `changePassword(userId, oldPassword, newPassword)` - 3 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | User not found | Invalid userId |
| 2 | Old password invalid | Wrong current password |
| 3 | Success | Correct current password |

**Errors:**
- `User not found`
- `Invalid current password`

**Test Cases:**
```
✓ Should change password with valid credentials
✓ Should throw "User not found" for invalid userId
✓ Should throw "Invalid current password" for wrong password
```

#### 10. `getUserById(userId)` - 2 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | User found | Valid userId |
| 2 | User not found | Invalid userId |

**Test Cases:**
```
✓ Should return user for valid userId
✓ Should throw "User not found" for invalid userId
```

#### 11. `regenerateTokensAfterMFA(user)` - 1 branch
**Test Cases:**
```
✓ Should generate new token pair after MFA verification
```

#### 12. Private: `delay(ms)` - Tested implicitly
#### 13. Private: `sendPasswordResetEmail(email, token)` - Tested implicitly

---

## FILE 2: `src/services/jwt.service.ts`

### Methods & Coverage Requirements

#### 1. `generateTokenPair(user)` - 3 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | tenant_id provided | User has tenant_id |
| 2 | tenant_id NOT provided, has user.id | Fetch from DB |
| 3 | No tenant_id found in DB | DB returns empty |

**Test Cases:**
```
✓ Should generate access and refresh tokens
✓ Should use provided tenant_id
✓ Should fetch tenant_id from DB when not provided
✓ Should use default tenant when DB returns nothing
✓ Should store refresh token metadata in Redis
✓ Should include email, permissions, role in access token
✓ Should use RS256 algorithm
```

#### 2. `verifyAccessToken(token)` - 5 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Valid access token | Valid token |
| 2 | Not access type | Pass refresh token |
| 3 | Missing tenant_id | Token without tenant context |
| 4 | Token expired | Expired access token |
| 5 | Invalid token | Malformed token |

**Errors:**
- `TokenError: Invalid token type`
- `TokenError: Invalid token - missing tenant context`
- `TokenError: Access token expired`
- `TokenError: Invalid access token`

**Test Cases:**
```
✓ Should verify valid access token
✓ Should throw "Invalid token type" for refresh token
✓ Should throw "missing tenant context" for token without tenant_id
✓ Should throw "Access token expired" for expired token
✓ Should throw "Invalid access token" for malformed token
```

#### 3. `refreshTokens(refreshToken, ipAddress, userAgent)` - 5 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Not refresh type | Pass access token |
| 2 | Token not in Redis | Reused/revoked token |
| 3 | User not found in DB | User deleted |
| 4 | Success | Valid refresh flow |
| 5 | Other JWT error | Malformed token |

**Errors:**
- `TokenError: Invalid token type`
- `TokenError: Token reuse detected - possible theft`
- `TokenError: User not found`
- `TokenError: Invalid refresh token`

**Test Cases:**
```
✓ Should refresh tokens successfully
✓ Should throw "Invalid token type" for access token
✓ Should throw "Token reuse detected" when token not in Redis
✓ Should invalidate entire family on reuse detection
✓ Should throw "User not found" when user deleted
✓ Should delete old refresh token from Redis
✓ Should generate new token pair with fresh user data
```

#### 4. `invalidateTokenFamily(family)` - 2 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Tokens found in family | Family exists |
| 2 | No tokens in family | Empty/no match |

**Test Cases:**
```
✓ Should delete all tokens in family
✓ Should handle empty family gracefully
```

#### 5. `revokeAllUserTokens(userId)` - 2 branches

**Test Cases:**
```
✓ Should delete all tokens for user
✓ Should handle user with no tokens
```

#### 6. `decode(token)` - 1 branch

**Test Cases:**
```
✓ Should decode token without verification
✓ Should return null for invalid token
```

#### 7. `verifyRefreshToken(token)` - 2 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Valid token | Valid refresh token |
| 2 | Invalid token | Any invalid token |

**Test Cases:**
```
✓ Should verify valid refresh token
✓ Should throw "Invalid refresh token" for invalid token
```

#### 8. `getPublicKey()` - 1 branch

**Test Cases:**
```
✓ Should return public key string
```

---

## FILE 3: `src/services/password-security.service.ts`

### Methods & Coverage Requirements

#### 1. `hashPassword(password)` - 2 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Validation passes | Strong password |
| 2 | Validation fails | Weak password |

**Errors:**
- `Password validation failed: {errors}`

**Test Cases:**
```
✓ Should hash valid password with argon2id
✓ Should throw when password too short (< 12 chars)
✓ Should throw when password too long (> 128 chars)
✓ Should throw when missing uppercase
✓ Should throw when missing lowercase
✓ Should throw when missing number
✓ Should throw when missing special character
✓ Should throw for common passwords
✓ Should throw for repeated characters (aaa)
```

#### 2. `verifyPassword(hash, password)` - 2 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Verification succeeds | Correct password |
| 2 | Verification fails/error | Wrong password or error |

**Test Cases:**
```
✓ Should return true for correct password
✓ Should return false for incorrect password
✓ Should return false on verification error
```

#### 3. `validatePassword(password)` - 8 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Too short | < 12 characters |
| 2 | Too long | > 128 characters |
| 3 | No uppercase | All lowercase |
| 4 | No lowercase | All uppercase |
| 5 | No number | No digits |
| 6 | No special char | Only alphanumeric |
| 7 | Common password | "password123" etc |
| 8 | Repeated chars | "aaa" sequence |

**Test Cases:**
```
✓ Should return valid:true for strong password
✓ Should return error for password < 12 chars
✓ Should return error for password > 128 chars
✓ Should return error for no uppercase
✓ Should return error for no lowercase
✓ Should return error for no number
✓ Should return error for no special character
✓ Should detect common passwords (password123, qwerty123, etc)
✓ Should detect repeated characters (aaa)
✓ Should return multiple errors for multiple violations
```

#### 4. `generateSecurePassword()` - 1 branch

**Test Cases:**
```
✓ Should generate 16-character password
✓ Should include uppercase letter
✓ Should include lowercase letter
✓ Should include number
✓ Should include special character
✓ Generated password should pass validation
```

---

## FILE 4: `src/controllers/auth.controller.ts`

### Methods & Coverage Requirements

#### 1. `register(request, reply)` - 4 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Success | Valid registration |
| 2 | Duplicate email (23505) | Existing email |
| 3 | Duplicate email (DUPLICATE_EMAIL) | Service throws |
| 4 | Other error | Generic error |

**Test Cases:**
```
✓ Should return 201 with user and tokens on success
✓ Should cache new user data
✓ Should return 409 for duplicate email (Postgres 23505)
✓ Should return 409 for DUPLICATE_EMAIL code
✓ Should return 409 when message contains "already exists"
✓ Should return 500 for other errors
```

#### 2. `login(request, reply)` - 10 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | No MFA enabled | User without MFA |
| 2 | MFA enabled, no token | MFA user, no mfaToken |
| 3 | MFA enabled, TOTP valid | Correct 6-digit code |
| 4 | MFA TOTP invalid, try backup | Wrong TOTP |
| 5 | Backup code valid | Use backup code |
| 6 | Both MFA methods fail | Wrong TOTP and backup |
| 7 | TOTP throws error | Recently used token |
| 8 | Invalid credentials | Wrong email/password |
| 9 | Cache user data | On success |
| 10 | Cache session data | On success |

**Test Cases:**
```
✓ Should return 200 with tokens for non-MFA user
✓ Should return 200 with requiresMFA:true when MFA enabled no token
✓ Should return 200 with tokens when valid TOTP provided
✓ Should fallback to backup code when TOTP returns false
✓ Should fallback to backup code when TOTP throws
✓ Should return 401 when both MFA methods fail
✓ Should return 401 for invalid credentials
✓ Should return 500 for unexpected errors
✓ Should cache user and session on success
✓ Should regenerate tokens after MFA verification
```

#### 3. `refreshTokens(request, reply)` - 2 branches

**Test Cases:**
```
✓ Should return new tokens on success
✓ Should return 401 with error message on failure
✓ Should preserve "Token reuse detected" message
```

#### 4. `logout(request, reply)` - 1 branch

**Test Cases:**
```
✓ Should return 204 on logout
✓ Should clear user cache
✓ Should clear session cache
✓ Should call authService.logout
```

#### 5. `getMe(request, reply)` - 3 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Cache hit | User in cache |
| 2 | Cache miss, DB hit | User in DB not cache |
| 3 | User not found | Invalid userId |

**Test Cases:**
```
✓ Should return user from cache
✓ Should return user from DB on cache miss
✓ Should cache user after DB fetch
✓ Should return 404 when user not found
```

#### 6. `getCacheStats(request, reply)` - 1 branch

**Test Cases:**
```
✓ Should return cache statistics
```

#### 7. `verifyToken(request, reply)` - 1 branch

**Test Cases:**
```
✓ Should return valid:true with user
```

#### 8. `getCurrentUser(request, reply)` - 1 branch

**Test Cases:**
```
✓ Should return user from request
```

#### 9. `setupMFA(request, reply)` - 3 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Success | First MFA setup |
| 2 | Already enabled | MFA exists |
| 3 | Other error | Generic error |

**Test Cases:**
```
✓ Should return secret and qrCode on success
✓ Should return 400 when MFA already enabled
✓ Should return 500 for other errors
```

#### 10. `verifyMFASetup(request, reply)` - 3 branches

**Test Cases:**
```
✓ Should return backup codes on success
✓ Should return 400 for invalid token
✓ Should return 400 for expired token
✓ Should return 500 for other errors
```

#### 11. `verifyMFA(request, reply)` - 2 branches

**Test Cases:**
```
✓ Should return valid:true/false
✓ Should return 500 on error
```

#### 12. `regenerateBackupCodes(request, reply)` - 3 branches

**Test Cases:**
```
✓ Should return new backup codes
✓ Should return 400 when MFA not enabled
✓ Should return 500 for other errors
```

#### 13. `disableMFA(request, reply)` - 3 branches

**Test Cases:**
```
✓ Should return success:true on success
✓ Should return 400 for invalid password/token
✓ Should return 500 for other errors
```

---

## FILE 5: `src/controllers/auth-extended.controller.ts`

### Methods & Coverage Requirements

#### 1. `forgotPassword(request, reply)` - 3 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Success | Normal request |
| 2 | Rate limit error | Too many requests |
| 3 | Other error | Generic error |

**Test Cases:**
```
✓ Should return generic message on success
✓ Should return 429 for rate limit errors
✓ Should return 200 with generic message on other errors
```

#### 2. `resetPassword(request, reply)` - 3 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Success | Valid token and password |
| 2 | ValidationError | Invalid/expired token |
| 3 | Other error | Generic error |

**Test Cases:**
```
✓ Should return success message on valid reset
✓ Should return 400 for invalid token
✓ Should return 400 for expired token
✓ Should return 500 for other errors
```

#### 3. `verifyEmail(request, reply)` - 4 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | No token | Missing query param |
| 2 | Success | Valid token |
| 3 | ValidationError | Invalid token |
| 4 | Other error | Generic error |

**Test Cases:**
```
✓ Should return success message on valid verification
✓ Should return 400 when token missing
✓ Should return 400 for invalid token
✓ Should return 500 for other errors
```

#### 4. `resendVerification(request, reply)` - 4 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | No user | Not authenticated |
| 2 | Success | Authenticated user |
| 3 | ValidationError | Already verified / rate limit |
| 4 | Other error | Generic error |

**Test Cases:**
```
✓ Should return success message
✓ Should return 401 when not authenticated
✓ Should return 400 when already verified
✓ Should return 400 for rate limit
✓ Should return 500 for other errors
```

#### 5. `changePassword(request, reply)` - 5 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | No user | Not authenticated |
| 2 | Success | Valid current password |
| 3 | AuthenticationError | Wrong password |
| 4 | ValidationError | Weak/same password |
| 5 | Other error | Generic error |

**Test Cases:**
```
✓ Should return success message
✓ Should return 401 when not authenticated
✓ Should return 401 for wrong current password
✓ Should return 400 for weak new password
✓ Should return 400 when new = old password
✓ Should return 500 for other errors
```

---

## FILE 6: `src/routes/auth.routes.ts` (Select Routes Only)

### Routes to Test

#### POST `/register`
**Prehandlers:** `registrationRateLimiter.consume`, `validate(registerSchema)`

**Test Cases:**
```
✓ Should validate request body with registerSchema
✓ Should apply registration rate limit
✓ Should return 429 when rate limited
✓ Should call controller.register on success
```

#### POST `/login`
**Prehandlers:** `rateLimitService.consume`, `loginRateLimiter.consume`, `validate(loginSchema)`

**Test Cases:**
```
✓ Should validate request body with loginSchema
✓ Should apply both rate limiters
✓ Should return 429 when rate limited
✓ Should call controller.login on success
```

#### POST `/forgot-password`
**Prehandlers:** `rateLimitService.consume`, `validate(forgotPasswordSchema)`

**Test Cases:**
```
✓ Should validate request body
✓ Should apply rate limit
✓ Should call extendedController.forgotPassword
```

#### POST `/reset-password`
**Prehandlers:** `rateLimitService.consume`, `validate(resetPasswordSchema)`

**Test Cases:**
```
✓ Should validate request body
✓ Should return 429 when rate limited
✓ Should call extendedController.resetPassword
```

#### POST `/refresh`
**Prehandlers:** `validate(refreshTokenSchema)`

**Test Cases:**
```
✓ Should validate request body
✓ Should call controller.refreshTokens
```

#### GET `/verify-email`
**Prehandlers:** `validate(verifyEmailSchema, 'query')`

**Test Cases:**
```
✓ Should validate query params
✓ Should call extendedController.verifyEmail
```

---

## SUMMARY: TEST COUNT ESTIMATE

| File | Estimated Tests | Priority |
|------|-----------------|----------|
| auth.service.ts | 35 tests | P0 - Critical |
| jwt.service.ts | 25 tests | P0 - Critical |
| password-security.service.ts | 20 tests | P0 - Critical |
| auth.controller.ts | 40 tests | P0 - Critical |
| auth-extended.controller.ts | 20 tests | P0 - Critical |
| auth.routes.ts | 15 tests | P0 - Critical |
| **TOTAL** | **~155 tests** | |

---

## Testing Strategy

### Unit Tests
- Mock all external dependencies (database, Redis, email service)
- Test each function in isolation
- Focus on branch coverage

### Integration Tests
- Use real database (test instance)
- Use real Redis (test instance)  
- Test complete flows end-to-end

### Mocking Requirements

| Dependency | Mock Method |
|------------|-------------|
| `pool` / `db` | jest.mock('../config/database') |
| `redis` | jest.mock('../config/redis') |
| `EmailService` | jest.mock('../services/email.service') |
| `bcrypt` | jest.mock('bcrypt') for timing tests |
| `crypto` | Keep real for most, mock randomInt for jitter tests |

### Test File Structure
```
tests/
├── unit/
│   ├── services/
│   │   ├── auth.service.test.ts
│   │   ├── jwt.service.test.ts
│   │   └── password-security.service.test.ts
│   ├── controllers/
│   │   ├── auth.controller.test.ts
│   │   └── auth-extended.controller.test.ts
│   └── routes/
│       └── auth.routes.test.ts
└── integration/
    └── auth-flows.integration.test.ts
```

---

## Coverage Targets

| Metric | Target |
|--------|--------|
| Line Coverage | ≥ 80% |
| Branch Coverage | ≥ 80% |
| Function Coverage | 100% |
| Statement Coverage | ≥ 80% |

---

## Next Steps

1. Create test setup files (mocks, fixtures, helpers)
2. Implement unit tests for each file
3. Implement integration tests for critical flows
4. Run coverage report
5. Fill gaps to reach 80-100% coverage

---

## Part 2: Alternative Auth Methods (MFA, OAuth, Wallet, Biometric, Email)

---

## FILE 7: `src/services/mfa.service.ts`

### Methods & Coverage Requirements

#### 1. `setupTOTP(userId)` - 4 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | User not found | Pass invalid userId |
| 2 | MFA already enabled | User has mfa_enabled=true |
| 3 | Success | Valid user, MFA not enabled |
| 4 | Error thrown | Mock DB/Redis failure |

**Errors:**
- `Error: User not found`
- `Error: MFA is already enabled for this account`

**Test Cases:**
```
✓ Should generate secret and QR code for valid user
✓ Should throw "User not found" for invalid userId
✓ Should throw "MFA is already enabled" when mfa_enabled=true
✓ Should generate 10 backup codes
✓ Should store encrypted secret in Redis with 10 min TTL
✓ Should store hashed backup codes
✓ Should store plain backup codes temporarily for return
```

#### 2. `verifyAndEnableTOTP(userId, token)` - 4 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Setup data not found | Expired or no setup initiated |
| 2 | Invalid token | Wrong 6-digit code |
| 3 | Success | Valid token |
| 4 | Error thrown | DB update failure |

**Errors:**
- `Error: MFA setup expired or not found`
- `AuthenticationError: Invalid MFA token`

**Test Cases:**
```
✓ Should enable MFA and return backup codes on success
✓ Should throw "MFA setup expired" when Redis data not found
✓ Should throw "Invalid MFA token" for wrong code
✓ Should update user mfa_enabled=true in DB
✓ Should delete Redis setup data after success
✓ Should store hashed backup codes in DB
```

#### 3. `verifyTOTP(userId, token)` - 6 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | User not found | Invalid userId |
| 2 | MFA not enabled | mfa_enabled=false |
| 3 | No MFA secret | mfa_secret=null |
| 4 | Invalid token format | Non-6-digit token |
| 5 | Token recently used | Same token within 90s |
| 6 | Valid/Invalid TOTP | speakeasy.verify result |

**Errors:**
- `AuthenticationError: MFA token recently used`

**Test Cases:**
```
✓ Should return false when user not found
✓ Should return false when MFA not enabled
✓ Should return false when no MFA secret
✓ Should return false for non-6-digit tokens
✓ Should throw "token recently used" for replay attack
✓ Should return true for valid TOTP
✓ Should return false for invalid TOTP
✓ Should mark token as used in Redis for 90s
```

#### 4. `verifyBackupCode(userId, code)` - 5 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | User not found | Invalid userId |
| 2 | No backup codes | backup_codes=null |
| 3 | Empty backup codes array | backup_codes=[] |
| 4 | Code not found | Invalid backup code |
| 5 | Code found | Valid backup code |

**Test Cases:**
```
✓ Should return false when user not found
✓ Should return false when backup_codes null
✓ Should return false when backup_codes empty
✓ Should return false for invalid code
✓ Should return true and remove used code
✓ Should update backup_codes array in DB (minus used code)
```

#### 5. `regenerateBackupCodes(userId)` - 3 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | User not found | Invalid userId |
| 2 | MFA not enabled | mfa_enabled=false |
| 3 | Success | MFA enabled user |

**Errors:**
- `Error: User not found`
- `Error: MFA is not enabled for this account`

**Test Cases:**
```
✓ Should throw "User not found" for invalid userId
✓ Should throw "MFA not enabled" when disabled
✓ Should generate 10 new backup codes
✓ Should store hashed codes in DB
✓ Should return plain codes to user
```

#### 6. `requireMFAForOperation(userId, operation)` - 3 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Non-sensitive operation | Operation not in list |
| 2 | Recent MFA verification | Redis key exists |
| 3 | No recent MFA | Redis key absent |

**Errors:**
- `AuthenticationError: MFA required for this operation`

**Test Cases:**
```
✓ Should pass for non-sensitive operations
✓ Should pass when MFA recently verified (Redis key exists)
✓ Should throw "MFA required" when no recent MFA verification
✓ Should recognize all sensitive operations
```

#### 7. `markMFAVerified(userId)` - 1 branch

**Test Cases:**
```
✓ Should set Redis key with 5 min TTL
```

#### 8. `disableTOTP(userId, password, token)` - 4 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | User not found | Invalid userId |
| 2 | Invalid password | Wrong password |
| 3 | Invalid MFA token | Wrong TOTP |
| 4 | Success | Valid credentials |

**Errors:**
- `Error: User not found`
- `Error: Invalid password`
- `Error: Invalid MFA token`

**Test Cases:**
```
✓ Should throw "User not found" for invalid userId
✓ Should throw "Invalid password" for wrong password
✓ Should throw "Invalid MFA token" for wrong TOTP
✓ Should clear mfa_enabled, mfa_secret, backup_codes
✓ Should clear Redis keys for user
```

#### Private Methods (tested implicitly):
- `generateBackupCodes()` - Generates 10 codes
- `hashBackupCode(code)` - SHA256 hash
- `encrypt(text)` / `decrypt(text)` - AES-256-GCM

---

## FILE 8: `src/services/oauth.service.ts`

### Methods & Coverage Requirements

#### 1. `exchangeGoogleCode(code)` (private) - 3 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | No ID token | Google returns no id_token |
| 2 | Invalid payload | Missing email in token |
| 3 | Success | Valid Google auth code |

**Errors:**
- `AuthenticationError: No ID token received from Google`
- `AuthenticationError: Invalid Google token payload`
- `AuthenticationError: Google authentication failed: {message}`

**Test Cases:**
```
✓ Should return profile for valid Google code
✓ Should throw when no ID token received
✓ Should throw when token payload missing email
✓ Should extract firstName, lastName from given_name, family_name
✓ Should set verified based on email_verified
```

#### 2. `exchangeGitHubCode(code)` (private) - 3 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | No public email | email not in profile |
| 2 | No primary email | emails endpoint fails |
| 3 | Success | Valid GitHub code |

**Errors:**
- `AuthenticationError: No email found in GitHub profile`
- `AuthenticationError: GitHub authentication failed: {message}`

**Test Cases:**
```
✓ Should return profile for valid GitHub code
✓ Should fetch email from /user/emails when not public
✓ Should throw when no email found
✓ Should parse name into firstName/lastName
✓ Should use login as firstName if no name
✓ Should always set verified=true for GitHub
```

#### 3. `findOrCreateUser(profile, tenantId)` (private) - 4 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | OAuth connection exists | Returning user |
| 2 | User exists by email | New OAuth, existing email |
| 3 | New user | No existing user/oauth |
| 4 | Transaction rollback | DB failure |

**Test Cases:**
```
✓ Should find user by existing OAuth connection
✓ Should update oauth_connections profile_data on return visit
✓ Should link OAuth to existing user by email
✓ Should create new user for new email
✓ Should create oauth_connections entry
✓ Should use default tenant if not provided
✓ Should rollback on error
```

#### 4. `createSession(userId, ipAddress, userAgent)` (private) - 1 branch

**Test Cases:**
```
✓ Should insert session record
✓ Should return sessionId
```

#### 5. `authenticate(provider, code, tenantId, ipAddress, userAgent)` - 3 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Google provider | provider='google' |
| 2 | GitHub provider | provider='github' |
| 3 | Unsupported provider | Other provider name |

**Errors:**
- `ValidationError: Unsupported OAuth provider: {provider}`

**Test Cases:**
```
✓ Should authenticate with Google
✓ Should authenticate with GitHub
✓ Should throw for unsupported provider
✓ Should return user, tokens, sessionId, provider
✓ Should create session with IP and userAgent
```

#### 6. `linkProvider(userId, provider, code)` - 5 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Unsupported provider | Invalid provider name |
| 2 | Already linked to user | User already has this provider |
| 3 | Linked to other user | OAuth account in use by other user |
| 4 | Success | Valid link |

**Errors:**
- `ValidationError: Unsupported OAuth provider: {provider}`
- `ValidationError: {provider} account already linked to your account`
- `ValidationError: This OAuth account is already linked to another user`

**Test Cases:**
```
✓ Should throw for unsupported provider
✓ Should throw when already linked to this user
✓ Should throw when linked to another user
✓ Should link Google account successfully
✓ Should link GitHub account successfully
```

#### 7. `unlinkProvider(userId, provider)` - 2 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | No connection | Provider not linked |
| 2 | Success | Provider linked |

**Errors:**
- `ValidationError: No {provider} account linked to your account`

**Test Cases:**
```
✓ Should throw when no connection exists
✓ Should delete oauth_connections record
✓ Should return success message
```

#### Legacy Methods:
- `handleOAuthLogin(provider, token)` → `authenticate()`
- `linkOAuthProvider(userId, provider, token)` → `linkProvider()`

---

## FILE 9: `src/services/wallet.service.ts`

### Methods & Coverage Requirements

#### 1. `generateNonce(publicKey, chain)` - 1 branch

**Test Cases:**
```
✓ Should generate random 32-byte hex nonce
✓ Should store nonce data in Redis with 15 min TTL
✓ Should return nonce and formatted message
✓ Should include timestamp and expiry in stored data
```

#### 2. `verifySolanaSignature(publicKey, signature, message)` - 2 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Valid signature | Correct Solana signature |
| 2 | Error/invalid | Bad publicKey or signature |

**Test Cases:**
```
✓ Should return true for valid Solana signature
✓ Should return false for invalid signature
✓ Should return false on verification error
✓ Should use nacl.sign.detached.verify
```

#### 3. `verifyEthereumSignature(address, signature, message)` - 2 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Valid signature | Correct Ethereum signature |
| 2 | Error/invalid | Bad address or signature |

**Test Cases:**
```
✓ Should return true for valid Ethereum signature
✓ Should return false for invalid signature
✓ Should be case-insensitive for addresses
```

#### 4. `registerWithWallet(publicKey, signature, nonce, chain, tenantId)` - 6 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Nonce not found | Expired/invalid nonce |
| 2 | Nonce mismatch | Wrong publicKey/chain |
| 3 | Solana invalid sig | Bad Solana signature |
| 4 | Ethereum invalid sig | Bad Ethereum signature |
| 5 | Transaction rollback | DB failure |
| 6 | Success | Valid registration |

**Errors:**
- `AuthenticationError: Nonce expired or not found`
- `AuthenticationError: Nonce mismatch`
- `AuthenticationError: Invalid wallet signature`

**Test Cases:**
```
✓ Should throw "Nonce expired" when Redis key missing
✓ Should throw "Nonce mismatch" for wrong publicKey
✓ Should throw "Nonce mismatch" for wrong chain
✓ Should throw "Invalid wallet signature" for Solana
✓ Should throw "Invalid wallet signature" for Ethereum
✓ Should create user with synthetic email
✓ Should create wallet_connections record
✓ Should create user_sessions record
✓ Should generate JWT tokens
✓ Should delete nonce after use
✓ Should rollback transaction on error
```

#### 5. `loginWithWallet(publicKey, signature, nonce, chain)` - 7 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Nonce not found | Expired/invalid nonce |
| 2 | Nonce mismatch | Wrong publicKey/chain |
| 3 | Invalid signature (Solana) | Bad Solana signature |
| 4 | Invalid signature (Ethereum) | Bad Ethereum signature |
| 5 | Wallet not connected | No wallet_connections record |
| 6 | User not found | User deleted |
| 7 | Success | Valid login |

**Errors:**
- `AuthenticationError: Nonce expired or not found`
- `AuthenticationError: Nonce mismatch`
- `AuthenticationError: Invalid wallet signature`
- `AuthenticationError: Wallet not connected to any account`
- `AuthenticationError: User not found`

**Test Cases:**
```
✓ Should throw "Nonce expired" when Redis key missing
✓ Should throw "Nonce mismatch" for wrong data
✓ Should throw "Invalid wallet signature" for bad sig
✓ Should throw "Wallet not connected" for unregistered wallet
✓ Should throw "User not found" for deleted user
✓ Should update last_login_at
✓ Should create session
✓ Should generate JWT tokens
✓ Should delete nonce after use
```

#### 6. `linkWallet(userId, publicKey, signature, nonce, chain)` - 5 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Nonce not found | Expired nonce |
| 2 | Nonce mismatch | Wrong data |
| 3 | Invalid signature | Bad signature |
| 4 | Wallet linked to other user | Same wallet, different user |
| 5 | Success | Valid link |

**Errors:**
- `AuthenticationError: Nonce expired or not found`
- `AuthenticationError: Nonce mismatch`
- `AuthenticationError: Invalid wallet signature`
- `AuthenticationError: Wallet already connected to another account`

**Test Cases:**
```
✓ Should throw "Nonce expired" when missing
✓ Should throw "Nonce mismatch" for wrong data
✓ Should throw "Invalid signature" for bad sig
✓ Should throw "Wallet already connected" for other user's wallet
✓ Should create wallet_connections for new wallet
✓ Should skip insert if already linked to same user
```

#### 7. `unlinkWallet(userId, publicKey)` - 2 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Wallet not found | No matching connection |
| 2 | Success | Valid unlink |

**Errors:**
- `AuthenticationError: Wallet not found or not linked to your account`

**Test Cases:**
```
✓ Should throw when wallet not found
✓ Should delete wallet_connections record
✓ Should return success:true
```

---

## FILE 10: `src/services/biometric.service.ts`

### Methods & Coverage Requirements

#### 1. `registerBiometric(userId, deviceId, publicKey, type)` - 2 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Device already registered | Duplicate userId+deviceId |
| 2 | Success | New device |

**Errors:**
- `AuthenticationError: Device already registered`

**Test Cases:**
```
✓ Should throw "Device already registered" for duplicate
✓ Should create biometric_credentials record
✓ Should generate unique credentialId
✓ Should default type to 'faceId'
✓ Should accept touchId and fingerprint types
```

#### 2. `verifyBiometric(userId, credentialId, signature, challenge)` - 5 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Challenge not in Redis | Expired/missing challenge |
| 2 | Challenge mismatch | Wrong challenge string |
| 3 | Credential not found | Invalid credentialId |
| 4 | Invalid signature | Wrong signature |
| 5 | Success | Valid verification |

**Errors:**
- `AuthenticationError: Challenge expired or not found`
- `AuthenticationError: Invalid challenge`
- `AuthenticationError: Biometric credential not found`
- `AuthenticationError: Invalid biometric signature`

**Test Cases:**
```
✓ Should throw "Challenge expired" when not in Redis
✓ Should throw "Invalid challenge" for mismatch
✓ Should throw "Credential not found" for bad credentialId
✓ Should throw "Invalid biometric signature" for bad sig
✓ Should consume challenge (delete from Redis)
✓ Should return valid:true and userId on success
```

#### 3. `generateChallenge(userId)` - 1 branch

**Test Cases:**
```
✓ Should generate 32-byte hex challenge
✓ Should store in Redis with 5 min TTL
✓ Should return challenge string
```

#### 4. `listBiometricDevices(userId)` - 1 branch

**Test Cases:**
```
✓ Should return array of devices for user
✓ Should select id, device_id, credential_type, created_at
✓ Should return empty array if no devices
```

#### 5. `removeBiometricDevice(userId, credentialId)` - 2 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Credential not found | Invalid credentialId/userId |
| 2 | Success | Valid deletion |

**Errors:**
- `AuthenticationError: Biometric credential not found`

**Test Cases:**
```
✓ Should throw when credential not found
✓ Should delete biometric_credentials record
✓ Should return true on success
```

#### 6. `getCredential(credentialId, userId)` - 1 branch

**Test Cases:**
```
✓ Should return credential record
✓ Should return undefined if not found
```

---

## FILE 11: `src/services/email.service.ts`

### Methods & Coverage Requirements

#### 1. `constructor()` - 1 branch

**Test Cases:**
```
✓ Should initialize Resend client
✓ Should use placeholder key in dev mode
```

#### 2. `sendVerificationEmail(userId, email, firstName)` - 1 branch

**Test Cases:**
```
✓ Should generate verification token
✓ Should store token in Redis with 24h TTL
✓ Should format verification URL
✓ Should call sendEmail with correct template
```

#### 3. `sendPasswordResetEmail(userId, email, firstName)` - 1 branch

**Test Cases:**
```
✓ Should generate reset token
✓ Should store token in Redis with 1h TTL
✓ Should format reset URL
✓ Should call sendEmail with correct template
```

#### 4. `sendMFABackupCodesEmail(email, firstName, backupCodes)` - 1 branch

**Test Cases:**
```
✓ Should format backup codes in HTML list
✓ Should format backup codes in plain text
✓ Should call sendEmail with correct template
```

#### 5. `sendEmail(to, template)` (private) - 4 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Development mode | NODE_ENV='development' |
| 2 | Test mode | NODE_ENV='test' |
| 3 | Production success | Resend returns data |
| 4 | Production error | Resend returns error |

**Errors:**
- `Error: Failed to send email: {message}`
- `Error: Failed to send email. Please try again later.`

**Test Cases:**
```
✓ Should log to console in development mode
✓ Should log to console in test mode
✓ Should not call Resend API in dev/test
✓ Should call Resend API in production
✓ Should throw on Resend error
✓ Should log success with email ID
```

---

## FILE 12: `src/controllers/wallet.controller.ts`

### Methods & Coverage Requirements

#### 1. `requestNonce(request, reply)` - 2 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Success | Valid request |
| 2 | Error | Service throws |

**Test Cases:**
```
✓ Should return 200 with nonce and message
✓ Should return 500 for service errors
```

#### 2. `register(request, reply)` - 4 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Success | Valid registration |
| 2 | AuthenticationError | Signature/nonce errors |
| 3 | Duplicate wallet | Postgres 23505 error |
| 4 | Other error | Generic error |

**Test Cases:**
```
✓ Should return 201 with user, tokens, wallet on success
✓ Should return AuthenticationError status code
✓ Should return 409 for duplicate wallet (23505)
✓ Should return 409 when message contains "duplicate"
✓ Should return 500 for other errors
```

#### 3. `login(request, reply)` - 3 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Success | Valid login |
| 2 | AuthenticationError | Auth failures |
| 3 | Other error | Generic error |

**Test Cases:**
```
✓ Should return 200 with user, tokens, wallet
✓ Should return AuthenticationError status code
✓ Should return 500 for other errors
```

#### 4. `linkWallet(request, reply)` - 3 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Success | Valid link |
| 2 | AuthenticationError | Auth failures |
| 3 | Other error | Generic error |

**Test Cases:**
```
✓ Should return 200 with success and wallet
✓ Should use userId from request.user
✓ Should return AuthenticationError status code
✓ Should return 500 for other errors
```

#### 5. `unlinkWallet(request, reply)` - 3 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Success | Valid unlink |
| 2 | AuthenticationError | Wallet not found |
| 3 | Other error | Generic error |

**Test Cases:**
```
✓ Should return 200 with success
✓ Should get publicKey from request.params
✓ Should return AuthenticationError status code
✓ Should return 500 for other errors
```

---

## PART 2 SUMMARY: TEST COUNT ESTIMATE

| File | Estimated Tests | Priority |
|------|-----------------|----------|
| mfa.service.ts | 40 tests | P0 - Critical |
| oauth.service.ts | 30 tests | P0 - Critical |
| wallet.service.ts | 35 tests | P0 - Critical |
| biometric.service.ts | 20 tests | P1 - High |
| email.service.ts | 15 tests | P1 - High |
| wallet.controller.ts | 20 tests | P0 - Critical |
| **Part 2 TOTAL** | **~160 tests** | |

---

## Part 3: Security & Infrastructure Services


```markdown
------- SEARCH
## CUMULATIVE SUMMARY

| Part | Files | Estimated Tests |
|------|-------|-----------------|
| Part 1: Critical Auth Flows | 6 files | ~155 tests |
| Part 2: Alternative Auth Methods | 6 files | ~160 tests |
| **COMBINED TOTAL** | **12 files** | **~315 tests** |
