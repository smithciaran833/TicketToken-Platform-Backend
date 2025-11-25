# AUTH SERVICE - COMPLETE FUNCTION INVENTORY

**Last Updated:** October 22, 2025  
**Total Functions:** 200+  
**Total Files:** 54

This document lists EVERY function in auth-service with signatures, purposes, and dependencies.

---

## 📋 TABLE OF CONTENTS

1. [Controllers (4 files, 21 functions)](#controllers)
2. [Services (21 files, ~150 functions)](#services)
3. [Middleware (6 files, 14 functions)](#middleware)
4. [Utils (3 files, ~15 functions)](#utils)
5. [Routes (Endpoints reference)](#routes)

---

## CONTROLLERS

### File: auth.controller.ts

#### 1. register(request, reply)
- **Purpose:** Create new user account with email/password
- **Parameters:** 
  - request.body: { email, password, full_name }
- **Returns:** 201 with { user, accessToken, refreshToken }
- **Dependencies:** 
  - authService.register()
  - userCache.setUser()
- **Complexity:** Medium
- **Error Cases:** Duplicate email (409), validation errors (422)

#### 2. login(request, reply)
- **Purpose:** Authenticate user and generate tokens (supports MFA)
- **Parameters:**
  - request.body: { email, password, mfaToken?, backupCode? }
- **Returns:** { user, tokens } OR { requiresMFA: true }
- **Dependencies:**
  - authService.login()
  - mfaService.verifyTOTP()
  - mfaService.verifyBackupCode()
  - userCache.setUser()
  - sessionCache.setSession()
- **Complexity:** High
- **Error Cases:** Invalid credentials (401), account locked (423), MFA required (200)

#### 3. refreshTokens(request, reply)
- **Purpose:** Generate new access/refresh token pair
- **Parameters:**
  - request.body: { refreshToken }
- **Returns:** { accessToken, refreshToken }
- **Dependencies:**
  - authService.refreshTokens()
- **Complexity:** Medium
- **Error Cases:** Invalid token (401), expired token (401)

#### 4. logout(request, reply)
- **Purpose:** End user session and invalidate tokens
- **Parameters:**
  - request.user: authenticated user
- **Returns:** 204 No Content
- **Dependencies:**
  - authService.logout()
  - userCache.deleteUser()
  - sessionCache.deleteUserSessions()
- **Complexity:** Low
- **Error Cases:** None (always succeeds)

#### 5. getMe(request, reply)
- **Purpose:** Get current authenticated user profile
- **Parameters:**
  - request.user: authenticated user
- **Returns:** { user } object
- **Dependencies:**
  - userCache.getUser() (cache-first)
  - Direct DB query (cache miss)
- **Complexity:** Low
- **Error Cases:** User not found (404)

#### 6. getCacheStats(request, reply)
- **Purpose:** Get cache performance metrics
- **Parameters:** None
- **Returns:** { hits, misses, hitRate }
- **Dependencies:** Cache service
- **Complexity:** Low
- **Error Cases:** None

#### 7. verifyToken(request, reply)
- **Purpose:** Verify JWT token validity
- **Parameters:**
  - request.headers.authorization: Bearer token
- **Returns:** { valid: true, user }
- **Dependencies:**
  - jwtService.verifyAccessToken()
- **Complexity:** Low
- **Error Cases:** Invalid token (401)

#### 8. getCurrentUser(request, reply)
- **Purpose:** Get authenticated user details
- **Parameters:**
  - request.user: authenticated user
- **Returns:** { user }
- **Dependencies:** Direct DB query
- **Complexity:** Low
- **Error Cases:** User not found (404)

#### 9. setupMFA(request, reply)
- **Purpose:** Initialize MFA for user account
- **Parameters:**
  - request.user: authenticated user
- **Returns:** { secret, qrCode, backupCodes }
- **Dependencies:**
  - mfaService.generateTOTPSecret()
  - mfaService.generateBackupCodes()
- **Complexity:** Medium
- **Error Cases:** MFA already enabled (409)

#### 10. verifyMFA(request, reply)
- **Purpose:** Verify MFA token during login or setup
- **Parameters:**
  - request.body: { token } OR { backupCode }
- **Returns:** { verified: true }
- **Dependencies:**
  - mfaService.verifyTOTP()
  - mfaService.verifyBackupCode()
- **Complexity:** Medium
- **Error Cases:** Invalid token (401), expired token (401)

#### 11. disableMFA(request, reply)
- **Purpose:** Disable MFA on user account
- **Parameters:**
  - request.user: authenticated user
  - request.body: { password }
- **Returns:** { success: true }
- **Dependencies:**
  - mfaService.disableMFA()
  - passwordService.comparePassword()
- **Complexity:** Medium
- **Error Cases:** Wrong password (401), MFA not enabled (400)
I just
---

### File: auth-extended.controller.ts

#### 12. forgotPassword(request, reply)
- **Purpose:** Request password reset (email enumeration protected)
- **Parameters:**
  - request.body: { email }
- **Returns:** { message: 'Check email' } (always same response)
- **Dependencies:**
  - authExtendedService.requestPasswordReset()
  - emailService.sendPasswordReset()
- **Complexity:** Medium
- **Error Cases:** None (always returns success to prevent enumeration)

#### 13. resetPassword(request, reply)
- **Purpose:** Reset password with valid token
- **Parameters:**
  - request.body: { token, newPassword }
- **Returns:** { success: true }
- **Dependencies:**
  - authExtendedService.resetPassword()
  - passwordService.hashPassword()
  - passwordService.validatePasswordStrength()
- **Complexity:** Medium
- **Error Cases:** Invalid token (400), weak password (422), expired token (400)

#### 14. verifyEmail(request, reply)
- **Purpose:** Verify user email address with token
- **Parameters:**
  - request.query: { token }
- **Returns:** { verified: true }
- **Dependencies:**
  - authExtendedService.verifyEmail()
- **Complexity:** Low
- **Error Cases:** Invalid token (400), expired token (400), already verified (400)

#### 15. resendVerification(request, reply)
- **Purpose:** Resend email verification link
- **Parameters:**
  - request.user: authenticated user
- **Returns:** { sent: true }
- **Dependencies:**
  - authExtendedService.resendVerification()
  - emailService.sendVerification()
- **Complexity:** Low
- **Error Cases:** Already verified (400), rate limited (429)

#### 16. changePassword(request, reply)
- **Purpose:** Change password for authenticated user
- **Parameters:**
  - request.user: authenticated user
  - request.body: { currentPassword, newPassword }
- **Returns:** { success: true }
- **Dependencies:**
  - authExtendedService.changePassword()
  - passwordService.comparePassword()
  - passwordService.hashPassword()
  - passwordService.checkPasswordHistory()
- **Complexity:** Medium
- **Error Cases:** Wrong current password (401), password reused (422), weak password (422)

---

### File: profile.controller.ts

#### 17. getProfile(request, reply)
- **Purpose:** Get user profile with selected fields
- **Parameters:**
  - request.user: authenticated user
- **Returns:** { id, email, first_name, last_name, phone, email_verified, mfa_enabled, role, timestamps }
- **Dependencies:** Direct DB query
- **Complexity:** Low
- **Error Cases:** User not found (404)

#### 18. updateProfile(request, reply)
- **Purpose:** Update user profile with audit logging
- **Parameters:**
  - request.user: authenticated user
  - request.body: { first_name?, last_name?, phone? }
- **Returns:** Updated profile
- **Dependencies:**
  - Direct DB update
  - Audit log insertion
  - getProfile()
- **Complexity:** Medium
- **Error Cases:** Validation errors (422), user not found (404)

---

### File: session.controller.ts

#### 19. listSessions(request, reply)
- **Purpose:** Get all active sessions for user
- **Parameters:**
  - request.user: authenticated user
- **Returns:** { sessions: [{ id, device, ip, created_at, is_current }] }
- **Dependencies:** Direct DB query
- **Complexity:** Low
- **Error Cases:** None

#### 20. revokeSession(request, reply)
- **Purpose:** Revoke specific session by ID
- **Parameters:**
  - request.user: authenticated user
  - request.params: { sessionId }
- **Returns:** { success: true }
- **Dependencies:**
  - Direct DB update
  - Audit logging
- **Complexity:** Low
- **Error Cases:** Session not found (404), unauthorized (403)

#### 21. invalidateAllSessions(request, reply)
- **Purpose:** Revoke all sessions except current
- **Parameters:**
  - request.user: authenticated user
- **Returns:** { revokedCount: number }
- **Dependencies:**
  - Direct DB update
  - Audit logging
- **Complexity:** Medium
- **Error Cases:** None

---

## SERVICES

### File: auth.service.ts (Core Authentication - ~20 functions)

#### 1. register(userData)
- **Purpose:** Create new user in database
- **Parameters:** { email, password, full_name, tenant_id }
- **Returns:** Promise<User>
- **Dependencies:**
  - passwordService.hashPassword()
  - db.insert()
  - emailService.sendVerification()
- **Complexity:** Medium

#### 2. login(credentials)
- **Purpose:** Validate credentials and create session
- **Parameters:** { email, password, mfaToken?, backupCode? }
- **Returns:** Promise<{ user, tokens } | { requiresMFA: true }>
- **Dependencies:**
  - getUserByEmail()
  - passwordService.comparePassword()
  - mfaService (if enabled)
  - jwtService.generateTokens()
  - createSession()
- **Complexity:** High

#### 3. logout(userId, sessionId)
- **Purpose:** Invalidate session and blacklist tokens
- **Parameters:** userId, sessionId
- **Returns:** Promise<void>
- **Dependencies:**
  - revokeSession()
  - jwtService.blacklistToken()
  - cache.delete()
- **Complexity:** Low

#### 4. refreshTokens(refreshToken)
- **Purpose:** Generate new token pair
- **Parameters:** refreshToken
- **Returns:** Promise<{ accessToken, refreshToken }>
- **Dependencies:**
  - jwtService.verifyRefreshToken()
  - jwtService.rotateRefreshToken()
  - jwtService.generateAccessToken()
- **Complexity:** Medium

#### 5. validateCredentials(email, password)
- **Purpose:** Check if credentials are valid
- **Parameters:** email, password
- **Returns:** Promise<User | null>
- **Dependencies:**
  - getUserByEmail()
  - passwordService.comparePassword()
  - bruteForceService.checkAttempts()
- **Complexity:** Medium

#### 6. createUser(userData)
- **Purpose:** Insert user into database
- **Parameters:** { email, hashed_password, full_name, tenant_id }
- **Returns:** Promise<User>
- **Dependencies:** db.insert()
- **Complexity:** Low

#### 7. getUserById(userId)
- **Purpose:** Get user by ID
- **Parameters:** userId
- **Returns:** Promise<User | null>
- **Dependencies:** db.query()
- **Complexity:** Low

#### 8. getUserByEmail(email)
- **Purpose:** Get user by email address
- **Parameters:** email
- **Returns:** Promise<User | null>
- **Dependencies:** db.query()
- **Complexity:** Low

#### 9. updateUser(userId, updates)
- **Purpose:** Update user fields
- **Parameters:** userId, updates object
- **Returns:** Promise<User>
- **Dependencies:** db.update()
- **Complexity:** Low

#### 10. deleteUser(userId)
- **Purpose:** Soft delete user
- **Parameters:** userId
- **Returns:** Promise<void>
- **Dependencies:** db.update({ deleted_at })
- **Complexity:** Low

#### 11. verifyEmail(token)
- **Purpose:** Mark email as verified
- **Parameters:** verification token
- **Returns:** Promise<void>
- **Dependencies:**
  - db.query() (find token)
  - db.update() (set email_verified)
- **Complexity:** Medium

#### 12. createSession(userId, deviceInfo)
- **Purpose:** Create new session record
- **Parameters:** userId, { device, ip, user_agent }
- **Returns:** Promise<Session>
- **Dependencies:** db.insert()
- **Complexity:** Low

#### 13. getSession(sessionId)
- **Purpose:** Get session by ID
- **Parameters:** sessionId
- **Returns:** Promise<Session | null>
- **Dependencies:** db.query()
- **Complexity:** Low

#### 14. revokeSession(sessionId)
- **Purpose:** Mark session as revoked
- **Parameters:** sessionId
- **Returns:** Promise<void>
- **Dependencies:** db.update({ revoked_at })
- **Complexity:** Low

#### 15. listUserSessions(userId)
- **Purpose:** Get all active sessions
- **Parameters:** userId
- **Returns:** Promise<Session[]>
- **Dependencies:** db.query()
- **Complexity:** Low

*Additional methods: checkAccountLocked, unlockAccount, recordLoginAttempt, etc.*

---

### File: jwt.service.ts (~10 functions)

#### 1. generateAccessToken(payload)
- **Purpose:** Create JWT access token
- **Parameters:** { userId, email, role, permissions }
- **Returns:** string (JWT)
- **Dependencies:** jsonwebtoken.sign()
- **Complexity:** Low
- **Algorithm:** RS256
- **Expiry:** 15 minutes

#### 2. generateRefreshToken(payload)
- **Purpose:** Create JWT refresh token
- **Parameters:** { userId, sessionId }
- **Returns:** string (JWT)
- **Dependencies:** jsonwebtoken.sign()
- **Complexity:** Low
- **Algorithm:** RS256
- **Expiry:** 7 days

#### 3. verifyAccessToken(token)
- **Purpose:** Verify and decode access token
- **Parameters:** token string
- **Returns:** Promise<DecodedToken>
- **Dependencies:**
  - jsonwebtoken.verify()
  - isTokenBlacklisted()
- **Complexity:** Medium
- **Error Cases:** Expired, invalid, blacklisted

#### 4. verifyRefreshToken(token)
- **Purpose:** Verify and decode refresh token
- **Parameters:** token string
- **Returns:** Promise<DecodedToken>
- **Dependencies:**
  - jsonwebtoken.verify()
  - isTokenBlacklisted()
- **Complexity:** Medium
- **Error Cases:** Expired, invalid, blacklisted

#### 5. decodeToken(token)
- **Purpose:** Decode token without verification
- **Parameters:** token string
- **Returns:** DecodedToken | null
- **Dependencies:** jsonwebtoken.decode()
- **Complexity:** Low

#### 6. blacklistToken(token, expiry)
- **Purpose:** Add token to blacklist
- **Parameters:** token, expirySeconds
- **Returns:** Promise<void>
- **Dependencies:** redis.setex()
- **Complexity:** Low

#### 7. isTokenBlacklisted(token)
- **Purpose:** Check if token is blacklisted
- **Parameters:** token string
- **Returns:** Promise<boolean>
- **Dependencies:** redis.exists()
- **Complexity:** Low

#### 8. rotateRefreshToken(oldToken)
- **Purpose:** Generate new refresh token and blacklist old one
- **Parameters:** old refresh token
- **Returns:** Promise<string> (new token)
- **Dependencies:**
  - verifyRefreshToken()
  - generateRefreshToken()
  - blacklistToken()
- **Complexity:** Medium

#### 9. generateTokenPair(user)
- **Purpose:** Generate both access and refresh tokens
- **Parameters:** user object
- **Returns:** { accessToken, refreshToken }
- **Dependencies:**
  - generateAccessToken()
  - generateRefreshToken()
- **Complexity:** Low

#### 10. getTokenExpiry(token)
- **Purpose:** Get expiration time from token
- **Parameters:** token string
- **Returns:** Date | null
- **Dependencies:** decodeToken()
- **Complexity:** Low

---

### File: password-security.service.ts (~8 functions)

#### 1. hashPassword(password)
- **Purpose:** Hash password with bcrypt/argon2
- **Parameters:** plain text password
- **Returns:** Promise<string> (hashed)
- **Dependencies:** bcrypt.hash() or argon2.hash()
- **Complexity:** Medium (computationally expensive)

#### 2. comparePassword(plainPassword, hashedPassword)
- **Purpose:** Compare plain and hashed passwords
- **Parameters:** plainPassword, hashedPassword
- **Returns:** Promise<boolean>
- **Dependencies:** bcrypt.compare() or argon2.verify()
- **Complexity:** Medium (computationally expensive)

#### 3. validatePasswordStrength(password)
- **Purpose:** Check password meets requirements
- **Parameters:** password string
- **Returns:** { valid: boolean, errors: string[] }
- **Requirements:**
  - Minimum 8 characters
  - At least 1 uppercase
  - At least 1 lowercase
  - At least 1 number
  - At least 1 special character
- **Complexity:** Low

#### 4. isCommonPassword(password)
- **Purpose:** Check against common password list
- **Parameters:** password string
- **Returns:** boolean
- **Dependencies:** commonPasswords.includes()
- **Complexity:** Low

#### 5. generateResetToken()
- **Purpose:** Generate secure password reset token
- **Parameters:** None
- **Returns:** string (secure random token)
- **Dependencies:** crypto.randomBytes()
- **Complexity:** Low

#### 6. hashResetToken(token)
- **Purpose:** Hash reset token for storage
- **Parameters:** plain token
- **Returns:** string (hashed)
- **Dependencies:** crypto.createHash()
- **Complexity:** Low

#### 7. verifyResetToken(token, hashedToken)
- **Purpose:** Verify reset token matches hash
- **Parameters:** plainToken, hashedToken
- **Returns:** boolean
- **Dependencies:** hashResetToken()
- **Complexity:** Low

#### 8. checkPasswordHistory(userId, newPassword)
- **Purpose:** Ensure password not recently used
- **Parameters:** userId, newPassword
- **Returns:** Promise<boolean> (true if reused)
- **Dependencies:**
  - db.query() (get password history)
  - comparePassword() (for each old password)
- **Complexity:** High

---

### File: rbac.service.ts (~8 functions)

#### 1. checkPermission(userId, permission, resourceId?)
- **Purpose:** Check if user has specific permission
- **Parameters:** userId, permission, optional resourceId (for venue-scoped)
- **Returns:** Promise<boolean>
- **Dependencies:**
  - getUserRoles()
  - getRolePermissions()
- **Complexity:** Medium

#### 2. getUserRoles(userId, venueId?)
- **Purpose:** Get all roles for user
- **Parameters:** userId, optional venueId
- **Returns:** Promise<Role[]>
- **Dependencies:** db.query()
- **Complexity:** Low

#### 3. assignRole(userId, role, venueId?)
- **Purpose:** Assign role to user
- **Parameters:** userId, role, optional venueId
- **Returns:** Promise<void>
- **Dependencies:**
  - db.insert()
  - auditService.log()
- **Complexity:** Low

#### 4. revokeRole(userId, role, venueId?)
- **Purpose:** Remove role from user
- **Parameters:** userId, role, optional venueId
- **Returns:** Promise<void>
- **Dependencies:**
  - db.delete()
  - auditService.log()
- **Complexity:** Low

#### 5. getRolePermissions(role)
- **Purpose:** Get all permissions for a role
- **Parameters:** role name
- **Returns:** string[] (permissions)
- **Dependencies:** Static role definitions
- **Complexity:** Low

#### 6. hasRole(userId, role, venueId?)
- **Purpose:** Check if user has specific role
- **Parameters:** userId, role, optional venueId
- **Returns:** Promise<boolean>
- **Dependencies:** getUserRoles()
- **Complexity:** Low

#### 7. createVenueRole(userId, venueId, role)
- **Purpose:** Create venue-scoped role
- **Parameters:** userId, venueId, role
- **Returns:** Promise<void>
- **Dependencies:**
  - db.insert()
  - auditService.log()
- **Complexity:** Low

#### 8. listVenueRoles(venueId)
- **Purpose:** List all roles for a venue
- **Parameters:** venueId
- **Returns:** Promise<{ userId, role, permissions }[]>
- **Dependencies:** db.query()
- **Complexity:** Low

---

### File: mfa.service.ts (~10 functions)

#### 1. generateTOTPSecret()
- **Purpose:** Generate TOTP secret for MFA
- **Parameters:** None
- **Returns:** { secret, otpauthUrl, qrCode }
- **Dependencies:** speakeasy.generateSecret()
- **Complexity:** Low

#### 2. verifyTOTP(secret, token)
- **Purpose:** Verify TOTP token
- **Parameters:** secret, user-provided token
- **Returns:** boolean
- **Dependencies:** speakeasy.totp.verify()
- **Complexity:** Low
- **Window:** ±1 time step (30 seconds)

#### 3. generateBackupCodes(count = 10)
- **Purpose:** Generate backup codes for MFA
- **Parameters:** count (default 10)
- **Returns:** string[] (hashed codes)
- **Dependencies:** crypto.randomBytes()
- **Complexity:** Low

#### 4. verifyBackupCode(userId, code)
- **Purpose:** Verify and consume backup code
- **Parameters:** userId, backup code
- **Returns:** Promise<boolean>
- **Dependencies:**
  - db.query() (get unused codes)
  - bcrypt.compare()
  - db.update() (mark as used)
- **Complexity:** Medium

#### 5. enableMFA(userId, secret)
- **Purpose:** Enable MFA on user account
- **Parameters:** userId, TOTP secret
- **Returns:** Promise<void>
- **Dependencies:**
  - db.update() (set mfa_enabled, mfa_secret)
  - generateBackupCodes()
  - auditService.log()
- **Complexity:** Medium

#### 6. disableMFA(userId)
- **Purpose:** Disable MFA on account
- **Parameters:** userId
- **Returns:** Promise<void>
- **Dependencies:**
  - db.update() (clear mfa fields)
  - db.delete() (remove backup codes)
  - auditService.log()
- **Complexity:** Low

#### 7. regenerateBackupCodes(userId)
- **Purpose:** Generate new backup codes
- **Parameters:** userId
- **Returns:** Promise<string[]> (new codes)
- **Dependencies:**
  - generateBackupCodes()
  - db.delete() (old codes)
  - db.insert() (new codes)
- **Complexity:** Medium

#### 8. isMFAEnabled(userId)
- **Purpose:** Check if MFA is enabled
- **Parameters:** userId
- **Returns:** Promise<boolean>
- **Dependencies:** db.query()
- **Complexity:** Low

#### 9. getMFAStatus(userId)
- **Purpose:** Get MFA status details
- **Parameters:** userId
- **Returns:** { enabled, backupCodesRemaining }
- **Dependencies:** db.query()
- **Complexity:** Low

#### 10. verifyMFASetup(userId, token)
- **Purpose:** Verify MFA setup is working
- **Parameters:** userId, test token
- **Returns:** Promise<boolean>
- **Dependencies:**
  - db.query() (get secret)
  - verifyTOTP()
- **Complexity:** Low

---

*Continued in next section...*

### Remaining Service Files (13 files):
- oauth.service.ts (~12 functions) - OAuth provider integration
- email.service.ts (~8 functions) - Email sending
- audit.service.ts (~6 functions) - Audit logging
- cache.service.ts (~10 functions) - Caching operations
- cache-integration.ts (~8 functions) - Cache integration
- device-trust.service.ts (~8 functions) - Device fingerprinting
- biometric.service.ts (~10 functions) - Biometric auth
- wallet.service.ts (~12 functions) - Crypto wallet auth
- rate-limit.service.ts (~6 functions) - Rate limiting
- brute-force-protection.service.ts (~8 functions) - Brute force prevention
- lockout.service.ts (~6 functions) - Account lockout
- security-enhanced.service.ts (~10 functions) - Enhanced security
- monitoring.service.ts (~8 functions) - Metrics/monitoring

*Full details available in source file documentation*

---

## MIDDLEWARE

### File: auth.middleware.ts (3 functions)

#### 1. authenticate(request, reply)
- **Purpose:** Verify JWT or API key authentication
- **Parameters:** request, reply
- **Returns:** void (sets request.user)
- **Dependencies:**
  - fastify.jwt.verify()
  - authenticateWithApiKey()
- **Complexity:** Medium
- **Priority:** Checks API key first, then JWT

#### 2. requireRole(role)
- **Purpose:** Middleware factory requiring specific role
- **Parameters:** role name
- **Returns:** Middleware function
- **Dependencies:** request.user.role
- **Complexity:** Low

#### 3. requirePermission(permission)
- **Purpose:** Middleware factory requiring permission
- **Parameters:** permission name
- **Returns:** Middleware function
- **Dependencies:** rbacService.checkPermission()
- **Complexity:** Medium

---

### File: validation.middleware.ts (3 functions)

#### 1. validate(schema)
- **Purpose:** Validate request against Joi schema
- **Parameters:** { body?, querystring?, params? }
- **Returns:** Middleware function
- **Dependencies:** Joi validation
- **Complexity:** Low

#### 2. validateBody(schema)
- **Purpose:** Validate request body only
- **Parameters:** Joi schema
- **Returns:** Middleware function
- **Dependencies:** Joi validation
- **Complexity:** Low

#### 3. validateQuery(schema)
- **Purpose:** Validate query parameters
- **Parameters:** Joi schema
- **Returns:** Middleware function
- **Dependencies:** Joi validation
- **Complexity:** Low

---

### File: security.middleware.ts (3 functions)

#### 1. helmet()
- **Purpose:** Set security headers
- **Returns:** Middleware function
- **Dependencies:** helmet package
- **Headers:** CSP, HSTS, X-Frame-Options, etc.

#### 2. cors()
- **Purpose:** Configure CORS
- **Returns:** Middleware function
- **Dependencies:** @fastify/cors
- **Complexity:** Low

#### 3. rateLimitMiddleware()
- **Purpose:** Apply rate limiting
- **Returns:** Middleware function
- **Dependencies:** rateLimitService
- **Complexity:** Medium

---

### Additional Middleware Files:
- enhanced-security.ts (2 functions)
- token-validator.ts (2 functions)
- cache-middleware.ts (1 function)

---

## UTILS

### File: logger.ts (~5 functions)

#### 1. createLogger(name)
- **Purpose:** Create named logger instance
- **Parameters:** logger name
- **Returns:** Logger instance
- **Dependencies:** winston/pino
- **Complexity:** Low

#### 2. log(level, message, meta)
- **Purpose:** Log message at level
- **Parameters:** level, message, metadata
- **Returns:** void
- **Dependencies:** winston/pino
- **Complexity:** Low

#### 3. sanitizeLog(data)
- **Purpose:** Remove PII from logs
- **Parameters:** log data object
- **Returns:** Sanitized object
- **Dependencies:** None
- **Complexity:** Medium
- **Removes:** Passwords, tokens, SSN, credit cards

#### 4. error(message, error, meta)
- **Purpose:** Log error with stack trace
- **Parameters:** message, error object, metadata
- **Returns:** void
- **Dependencies:** log()
- **Complexity:** Low

#### 5. audit(action, userId, data)
- **Purpose:** Log audit trail
- **Parameters:** action, userId, data
- **Returns:** void
- **Dependencies:** log() + db.insert()
- **Complexity:** Low

---

### File: metrics.ts (~5 functions)

#### 1. incrementCounter(name, labels)
- **Purpose:** Increment Prometheus counter
- **Parameters:** metric name, labels object
- **Returns:** void
- **Dependencies:** prom-client
- **Complexity:** Low

#### 2. observeHistogram(name, value, labels)
- **Purpose:** Record histogram observation
- **Parameters:** metric name, value, labels
- **Returns:** void
- **Dependencies:** prom-client
- **Complexity:** Low

#### 3. setGauge(name, value, labels)
- **Purpose:** Set gauge value
- **Parameters:** metric name, value, labels
- **Returns:** void
- **Dependencies:** prom-client
- **Complexity:** Low

#### 4. startTimer(name)
- **Purpose:** Start duration timer
- **Parameters:** metric name
- **Returns:** Timer function
- **Dependencies:** prom-client
- **Complexity:** Low

#### 5. getMetrics()
- **Purpose:** Get all metrics in Prometheus format
- **Parameters:** None
- **Returns:** string (Prometheus format)
- **Dependencies:** prom-client.register
- **Complexity:** Low

---

### File: rateLimiter.ts (~5 functions)

#### 1. checkRateLimit(key, limit, window)
- **Purpose:** Check if rate limit exceeded
- **Parameters:** key, limit count, time window
- **Returns:** Promise<{ allowed, remaining, resetTime }>
- **Dependencies:** redis
- **Complexity:** Medium

#### 2. incrementLimit(key, window)
- **Purpose:** Increment rate limit counter
- **Parameters:** key, time window
- **Returns:** Promise<number> (current count)
- **Dependencies:** redis.incr()
- **Complexity:** Low

#### 3. getRemainingLimit(key, limit, window)
- **Purpose:** Get remaining requests
- **Parameters:** key, limit, window
- **Returns:** Promise<number>
- **Dependencies:** redis.get()
- **Complexity:** Low

#### 4. resetLimit(key)
- **Purpose:** Reset rate limit for key
- **Parameters:** key
- **Returns:** Promise<void>
- **Dependencies:** redis.del()
- **Complexity:** Low

#### 5. createRateLimiter(config)
- **Purpose:** Factory for rate limiter
- **Parameters:** config object
- **Returns:** Rate limiter instance
- **Dependencies:** redis
- **Complexity:** Medium

---

## ROUTES (Endpoint Reference)

### Authentication Routes (/auth)

#### Public Endpoints:
- POST /register - register()
- POST /login - login()
- POST /refresh - refreshTokens()
- POST /forgot-password - forgotPassword()
- POST /reset-password - resetPassword()
- GET /verify-email - verifyEmail()

#### Authenticated Endpoints:
- GET /me - getMe()
- POST /logout - logout()
- GET /verify - verifyToken()
- PUT /change-password - changePassword()
- POST /resend-verification - resendVerification()

#### MFA Endpoints:
- POST /mfa/setup - setupMFA()
- POST /mfa/verify - verifyMFA()
- DELETE /mfa/disable - disableMFA()

#### Profile Endpoints:
- GET /profile - getProfile()
- PUT /profile - updateProfile()

#### Session Endpoints:
- GET /sessions - listSessions()
- DELETE /sessions/:sessionId - revokeSession()
- DELETE /sessions/all - invalidateAllSessions()

#### OAuth Endpoints:
- POST /oauth/:provider/login - OAuth login
- POST /oauth/:provider/link - Link OAuth account

#### Wallet Endpoints:
- GET /wallet/nonce/:address - Get wallet nonce
- POST /wallet/login - Wallet login
- POST /wallet/connect - Connect wallet

#### Biometric Endpoints:
- POST /biometric/register - Register biometric
- GET /biometric/challenge - Get challenge

#### RBAC Endpoints:
- POST /venues/:venueId/roles - Grant venue role
- DELETE /venues/:venueId/roles/:userId - Revoke venue role
- GET /venues/:venueId/roles - List venue roles

---

## 📝 NOTES

- This inventory covers all documented functions from the auth-service breakdown
- Some service files have additional helper/private methods not listed
- Complexity ratings: Low (< 10 LOC), Medium (10-50 LOC), High (> 50 LOC)
- All async functions return Promises
- Error handling details in 02-TEST-SPECIFICATIONS.md

**For detailed test specifications, see:** `02-TEST-SPECIFICATIONS.md`
