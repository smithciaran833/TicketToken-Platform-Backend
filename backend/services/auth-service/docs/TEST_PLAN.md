# Auth Service Testing Strategy

> **Last Updated:** January 2025
> **Total Files:** 65
> **Files to Test:** 50
> **Files to Skip:** 15

---

## Testing Approach

We follow the Testing Trophy:
- **Static Analysis:** TypeScript + ESLint
- **Unit Tests (Some):** Pure functions, complex algorithms
- **Integration Tests (Most):** Services with real DB + Redis
- **E2E Tests (Few):** Full flows via API Gateway

---

## Infrastructure Requirements

**Unit Tests:** No infrastructure needed
**Integration Tests:** Docker Compose with:
- PostgreSQL (port 5433)
- Redis (port 6380)

---

## File Analysis

### Config (10 files)

#### `config/env.ts`
**Test Type:** 🔶 Unit + Mock
**Priority:** HIGH
**What it does:** Zod schema validation for 50+ env vars. Validates server settings, database config, Redis, JWT keys (RS256), OAuth providers, security settings, MFA, CAPTCHA, email (Resend), service URLs, multi-tenancy. Production schema is stricter.
**Dependencies:** Zod, process.env
**Test Cases:**
- Valid env passes validation
- Missing required vars in production throws
- Dev mode allows fallbacks
- Type coercion works (string to number for PORT)
- Invalid values rejected (bad URL format, etc)

#### `config/database.ts`
**Test Type:** ⏭️ Skip
**Reason:** Pool configuration only, tested implicitly via integration tests

#### `config/redis.ts`
**Test Type:** 🔶 Unit + Mock
**Priority:** MEDIUM
**What it does:** Lazy init wrapper around @tickettoken/shared Redis client. Exports initRedis(), getRedis(), getPub(), getSub(), closeRedisConnections().
**Dependencies:** @tickettoken/shared
**Test Cases:**
- getRedis() throws if called before initRedis()
- initRedis() initializes client
- Multiple getRedis() calls return same instance

#### `config/dependencies.ts`
**Test Type:** ⏭️ Skip
**Reason:** Awilix DI container wiring, tested implicitly

#### `config/oauth.ts`
**Test Type:** ⏭️ Skip
**Reason:** Static config object for OAuth providers

#### `config/secrets.ts`
**Test Type:** 🔶 Unit + Mock
**Priority:** MEDIUM
**What it does:** Loads secrets from AWS Secrets Manager. Handles Postgres creds, Redis password, JWT keys (current + previous for rotation), S2S keys, encryption key, OAuth creds, Resend API key.
**Dependencies:** @tickettoken/shared secretsManager
**Test Cases:**
- Production requires core secrets
- Dev mode warns but continues on missing secrets
- Loaded secrets set as env vars
- Handles secretsManager errors gracefully

#### `config/priorities.ts`
**Test Type:** ✅ Pure Unit
**Priority:** HIGH
**What it does:** Load shedding priority system. 4 levels: CRITICAL (login, refresh, MFA verify, health), HIGH (register, password reset, logout), NORMAL (profile, sessions), LOW (exports, audit logs, metrics, docs).
**Dependencies:** None
**Test Cases:**
- getRoutePriority() exact match works
- getRoutePriority() wildcard match works
- getRoutePriority() defaults to NORMAL for unknown
- shouldShedRoute() never sheds CRITICAL even at 99% load
- shouldShedRoute() sheds LOW at 50%, NORMAL at 70%, HIGH at 85%
- getPriorityName() returns correct strings

#### `config/logger.ts`
**Test Type:** ⏭️ Skip
**Reason:** Pino logger setup, infrastructure concern

#### `config/swagger.ts`
**Test Type:** ⏭️ Skip
**Reason:** OpenAPI config object

#### `config/tracing.ts`
**Test Type:** ⏭️ Skip
**Reason:** OpenTelemetry setup, infrastructure concern

---

### Utils (12 files)

#### `utils/sanitize.ts`
**Test Type:** ✅ Pure Unit
**Priority:** HIGH
**What it does:** XSS prevention - stripHtml, escapeHtml, sanitizeName, sanitizeObject
**Dependencies:** None
**Test Cases:**
- stripHtml removes script tags
- stripHtml removes event handlers (onerror, onclick)
- stripHtml preserves plain text
- escapeHtml converts < > & " '
- sanitizeName allows letters, spaces, hyphens, apostrophes
- sanitizeName removes special characters
- sanitizeObject recursively sanitizes nested objects
- sanitizeObject handles arrays

#### `utils/normalize.ts`
**Test Type:** ✅ Pure Unit
**Priority:** HIGH
**What it does:** String normalization - normalizeEmail, normalizeUsername, normalizePhone, normalizedEquals
**Dependencies:** None
**Test Cases:**
- normalizeEmail lowercases
- normalizeEmail trims whitespace
- normalizeUsername lowercases and trims
- normalizePhone removes non-numeric except leading +
- normalizePhone handles various formats (+1 (555) 123-4567)
- normalizedEquals compares case-insensitively
- normalizedEquals trims before comparing

#### `utils/redisKeys.ts`
**Test Type:** ✅ Pure Unit
**Priority:** HIGH
**What it does:** Redis key builders with tenant isolation. buildKey() helper, redisKeys object with methods for all key types.
**Dependencies:** None
**Test Cases:**
- buildKey without tenant: "type:id"
- buildKey with tenant: "tenant:{tenantId}:type:id"
- redisKeys.refreshToken() correct format
- redisKeys.mfaSetup() correct format
- redisKeys.mfaRecent() correct format
- redisKeys.walletNonce() correct format
- redisKeys.biometricChallenge() correct format
- redisKeys.passwordReset() correct format
- redisKeys.emailVerify() correct format
- redisKeys.rateLimit() correct format

#### `utils/bulkhead.ts`
**Test Type:** ✅ Pure Unit
**Priority:** HIGH
**What it does:** Limits concurrent executions. Queues requests if at limit, rejects if queue full. Timeout for queued requests.
**Dependencies:** logger (can mock or ignore)
**Test Cases:**
- Under maxConcurrent: executes immediately
- At maxConcurrent: queues request
- Queue full: throws BulkheadRejectError
- Timeout in queue: throws BulkheadTimeoutError
- Completion dequeues and runs next
- getStats() returns current state
- Pre-configured bulkheads have correct settings (database, externalApi, auth, email)

#### `utils/retry.ts`
**Test Type:** 🔶 Unit + Mock
**Priority:** MEDIUM
**What it does:** Exponential backoff retry with timeout - withRetry(), withTimeout()
**Dependencies:** None (just promises/timers)
**Test Cases:**
- Succeeds on first try: no retry
- Fails then succeeds: retries correct number of times
- All retries fail: throws last error
- Exponential backoff timing correct
- withTimeout rejects after timeout
- withTimeout resolves if under timeout

#### `utils/circuit-breaker.ts`
**Test Type:** 🔶 Unit + Mock
**Priority:** MEDIUM
**What it does:** Wrapper around opossum circuit breaker. Caches breakers by name.
**Dependencies:** opossum, logger
**Test Cases:**
- Same name returns same breaker instance
- Different names create different breakers
- Breaker opens after error threshold
- Breaker half-opens after reset timeout
- Fallback executes when open
- getCircuitBreakerStats() returns correct state
- resetCircuitBreaker() closes breaker

#### `utils/http-client.ts`
**Test Type:** 🔶 Unit + Mock
**Priority:** MEDIUM
**What it does:** Axios wrapper with correlation ID injection, retries with exponential backoff, circuit breaker integration.
**Dependencies:** axios, logger, circuit-breaker
**Test Cases:**
- calculateBackoff() exponential with jitter, caps at 30s
- isRetryable() true for network errors
- isRetryable() true for 5xx errors
- isRetryable() true for 429
- isRetryable() false for 4xx (except 429)
- Correlation ID added to outbound requests
- Retries correct number of times
- getCorrelationHeaders() returns correct format

#### `utils/idempotency-helpers.ts`
**Test Type:** 🔶 Unit + Mock
**Priority:** MEDIUM
**What it does:** Redis-backed idempotency for password reset (5 min window) and MFA setup (10 min window).
**Dependencies:** Redis (getRedis), logger
**Test Cases:**
- storePasswordResetIdempotency stores with correct TTL (300s)
- getRecentPasswordReset retrieves stored token
- getRecentPasswordReset returns null on miss
- getRecentPasswordReset returns null on Redis error (fail-open)
- storeMFASetupIdempotency stores with correct TTL (600s)
- getRecentMFASetup retrieves and parses JSON
- clearMFASetupIdempotency deletes key

#### `utils/logger.ts`
**Test Type:** 🔶 Unit (minimal)
**Priority:** LOW
**What it does:** Winston logger with PII sanitization, correlation ID via AsyncLocalStorage.
**Dependencies:** winston, @tickettoken/shared PIISanitizer, async_hooks
**Test Cases:**
- withCorrelation() sets correlation ID in context
- getCorrelationId() retrieves from context
- getCorrelationId() returns undefined outside context
- createChildLogger() adds correlation ID to child

#### `utils/metrics.ts`
**Test Type:** ⏭️ Skip
**Reason:** Prometheus metric definitions only, no logic

#### `utils/rateLimiter.ts`
**Test Type:** 🔶 Unit + Mock
**Priority:** HIGH
**What it does:** Redis-backed rate limiter with blocking. Tenant-aware keys.
**Dependencies:** Redis (getRedis), RateLimitError
**Test Cases:**
- Under limit: allows (no throw)
- At limit: allows
- Over limit: throws RateLimitError, sets block key
- Already blocked: throws immediately with TTL
- Tenant prefix in key when provided
- reset() deletes both counter and block keys
- Pre-configured limiters have correct settings:
  - loginRateLimiter: 5/15min
  - registrationRateLimiter: 3/hour
  - passwordResetRateLimiter: 3/hour
  - otpRateLimiter: 5/5min
  - mfaSetupRateLimiter: 3/hour
  - backupCodeRateLimiter: 3/hour, 2hr block

#### `utils/redis-fallback.ts`
**Test Type:** 🔶 Unit + Mock
**Priority:** MEDIUM
**What it does:** Redis operations with in-memory fallback when Redis unavailable.
**Dependencies:** Redis (getRedis), logger
**Test Cases:**
- isRedisAvailable() returns true when ping succeeds
- isRedisAvailable() returns false when ping fails
- getWithFallback() uses Redis when available
- getWithFallback() falls back to memory when Redis down
- setWithFallback() uses Redis when available
- setWithFallback() falls back to memory, returns false
- Memory cache respects TTL
- Memory cache evicts when at MAX_MEMORY_CACHE_SIZE (1000)
- cleanupMemoryCache() removes expired entries
- getMemoryCacheStats() returns size and maxSize

---

### Validators (2 files)

#### `validators/auth.validators.ts`
**Test Type:** ✅ Pure Unit
**Priority:** HIGH
**What it does:** Joi schemas for all endpoints - register, login, MFA, wallet, OAuth, biometric, profile, RBAC
**Dependencies:** Joi
**Test Cases:**
- registerSchema: valid data passes
- registerSchema: invalid email rejected
- registerSchema: weak password rejected
- registerSchema: optional fields work
- loginSchema: valid data passes
- loginSchema: optional mfaToken accepted
- loginSchema: optional captchaToken accepted
- mfaSetupSchema: validates correctly
- mfaVerifySchema: accepts 6-digit token
- mfaVerifySchema: accepts backup code format (XXXX-XXXX)
- walletAuthSchema: accepts solana chain
- walletAuthSchema: accepts ethereum chain
- walletAuthSchema: rejects invalid chain
- walletNonceSchema: requires publicKey and chain
- oauthCallbackSchema: requires code and state
- profileUpdateSchema: allows partial updates
- grantRoleSchema: validates role enum
- All schemas strip unknown fields

#### `validators/response.schemas.ts`
**Test Type:** ⏭️ Skip
**Reason:** Response type definitions only

---

### Errors (1 file)

#### `errors/index.ts`
**Test Type:** ✅ Pure Unit
**Priority:** HIGH
**What it does:** Custom error classes with statusCode - AppError, ValidationError, NotFoundError, AuthenticationError, AuthorizationError, ConflictError, RateLimitError, TokenError, TenantError, MFARequiredError, CaptchaError, SessionError
**Dependencies:** None
**Test Cases:**
- AppError defaults to 500
- AppError accepts custom statusCode
- ValidationError is 400, stores errors array
- NotFoundError is 404
- AuthenticationError is 401
- AuthorizationError is 403
- ConflictError is 409
- RateLimitError is 429, stores retryAfter
- TokenError is 401
- TenantError is 403
- MFARequiredError is 403, has mfaRequired flag
- CaptchaError is 400
- SessionError is 401
- All extend Error properly

---

### Services (21 files)

#### `services/auth.service.ts`
**Test Type:** ❌ Integration
**Priority:** HIGH
**What it does:** Core auth - register, login, logout, password reset/change, email verification, token refresh. Includes timing attack prevention (500ms min response), lockout (5 attempts, 15 min), idempotency for password reset.
**Dependencies:** pool (Postgres), JWTService, EmailService, auditService, bcrypt, logger, sanitize utils, normalize utils
**Test Cases:**
- register(): creates user, hashes password, generates tokens, creates session, sends verification email
- register(): rejects duplicate email (409)
- register(): rejects invalid tenant
- register(): sanitizes firstName/lastName
- login(): returns tokens on valid credentials
- login(): rejects invalid password
- login(): uses dummy hash for nonexistent user (timing attack prevention)
- login(): response time >= 500ms regardless of outcome
- login(): increments failed_login_attempts on failure
- login(): locks account after 5 failures
- login(): rejects locked account with time remaining
- login(): resets failed attempts on success
- login(): updates last_login_at on success
- refreshTokens(): returns new token pair
- refreshTokens(): rejects invalid refresh token
- logout(): invalidates refresh token
- logout(): ends all active sessions
- verifyEmail(): updates email_verified on valid token
- verifyEmail(): rejects invalid token
- forgotPassword(): generates reset token (idempotency: reuses within 15 min)
- forgotPassword(): constant response regardless of email existence
- resetPassword(): updates password on valid token
- resetPassword(): clears reset token after use
- resetPassword(): uses FOR UPDATE to prevent race conditions
- changePassword(): verifies current password
- changePassword(): rejects if new == old
- changePassword(): uses FOR UPDATE
- getUserById(): returns user or throws

#### `services/auth-extended.service.ts`
**Test Type:** ❌ Integration
**Priority:** HIGH
**What it does:** Extended auth - password reset flow, email verification, change password with session invalidation. Uses non-blocking Redis SCAN.
**Dependencies:** db (Knex), getRedis, EmailService, passwordResetRateLimiter, redisKeys, bcrypt, ValidationError, AuthenticationError
**Test Cases:**
- requestPasswordReset(): rate limited
- requestPasswordReset(): returns success even for nonexistent email (enumeration prevention)
- requestPasswordReset(): sends email for valid user
- requestPasswordReset(): creates audit log
- resetPassword(): finds token (with or without tenant prefix)
- resetPassword(): validates password strength
- resetPassword(): updates password_hash and password_changed_at
- resetPassword(): invalidates all refresh tokens for user
- resetPassword(): creates audit log
- verifyEmail(): finds token (with or without tenant prefix)
- verifyEmail(): verifies email matches user
- verifyEmail(): updates email_verified and email_verified_at
- resendVerificationEmail(): rate limited (3/hour)
- resendVerificationEmail(): rejects if already verified
- changePassword(): verifies current password
- changePassword(): validates new password strength
- changePassword(): rejects if same as current
- changePassword(): invalidates all sessions with metadata
- validatePasswordStrength(): requires 8 chars, upper, lower, number, special

#### `services/jwt.service.ts`
**Test Type:** 🔶 Unit + Mock
**Priority:** HIGH
**What it does:** JWT token generation/verification using RS256. Key management (production: secrets manager, dev: filesystem). Refresh token rotation with family tracking for reuse detection.
**Dependencies:** jsonwebtoken, fs, env, getRedis, pool, @tickettoken/shared getScanner, redisKeys, TokenError
**Test Cases:**
- JWTKeyManager.initialize(): loads from secrets manager in production
- JWTKeyManager.initialize(): loads from filesystem in dev
- JWTKeyManager.initialize(): throws if no keys found
- JWTKeyManager.decodeKey(): handles base64 encoded keys
- JWTKeyManager.decodeKey(): passes through PEM format
- generateTokenPair(): creates access and refresh tokens
- generateTokenPair(): access token has correct claims (sub, type, tenant_id, email, permissions, role)
- generateTokenPair(): stores refresh token in Redis with tenant prefix
- generateTokenPair(): uses RS256 algorithm
- verifyAccessToken(): verifies valid token
- verifyAccessToken(): throws TokenError on expired
- verifyAccessToken(): throws TokenError if type != 'access'
- verifyAccessToken(): throws TokenError if missing tenant_id
- verifyAccessToken(): handles key rotation (tries multiple keys)
- refreshTokens(): verifies refresh token
- refreshTokens(): checks token exists in Redis
- refreshTokens(): detects reuse (missing from Redis) and invalidates family
- refreshTokens(): generates new token pair
- refreshTokens(): deletes old refresh token from Redis
- invalidateTokenFamily(): scans and deletes all tokens in family
- revokeAllUserTokens(): scans and deletes all tokens for user
- decode(): returns decoded payload without verification
- getJWKS(): returns public keys in JWKS format
- getPublicKey(): returns current public key

#### `services/mfa.service.ts`
**Test Type:** 🔶 Unit + Mock
**Priority:** HIGH
**What it does:** TOTP MFA - setup, verification, backup codes. Encryption of secrets (AES-256-GCM). Rate limiting on all operations. Idempotency for setup (5 min window).
**Dependencies:** speakeasy, qrcode, crypto, db (Knex), getRedis, env (ENCRYPTION_KEY), redisKeys, rate limiters, AuthenticationError
**Test Cases:**
- setupTOTP(): rate limited
- setupTOTP(): throws if MFA already enabled
- setupTOTP(): returns existing setup within idempotency window (5 min)
- setupTOTP(): generates new secret (32 chars, base32)
- setupTOTP(): generates QR code data URL
- setupTOTP(): generates 10 backup codes
- setupTOTP(): stores encrypted secret in Redis with 10 min TTL
- verifyAndEnableTOTP(): rate limited
- verifyAndEnableTOTP(): retrieves setup from Redis
- verifyAndEnableTOTP(): verifies TOTP token with window=2
- verifyAndEnableTOTP(): throws AuthenticationError on invalid token
- verifyAndEnableTOTP(): updates user (mfa_enabled, mfa_secret, backup_codes)
- verifyAndEnableTOTP(): cleans up Redis setup key
- verifyAndEnableTOTP(): resets rate limiter on success
- verifyAndEnableTOTP(): returns plain backup codes
- verifyTOTP(): rate limited
- verifyTOTP(): returns false if MFA not enabled
- verifyTOTP(): validates token format (6 digits)
- verifyTOTP(): checks for replay (recentKey in Redis)
- verifyTOTP(): throws if token recently used
- verifyTOTP(): verifies with window=1
- verifyTOTP(): stores used token in Redis for 90s
- verifyBackupCode(): rate limited (very strict)
- verifyBackupCode(): hashes and finds code
- verifyBackupCode(): removes used code from array
- verifyBackupCode(): returns false for invalid code
- regenerateBackupCodes(): throws if MFA not enabled
- regenerateBackupCodes(): generates 10 new codes
- regenerateBackupCodes(): updates hashed codes in DB
- requireMFAForOperation(): checks sensitive operations list
- requireMFAForOperation(): checks mfaVerified key in Redis
- markMFAVerified(): sets Redis key with 5 min TTL
- disableTOTP(): verifies password
- disableTOTP(): verifies MFA token
- disableTOTP(): clears mfa_enabled, mfa_secret, backup_codes
- disableTOTP(): cleans up Redis keys
- encrypt()/decrypt(): round-trip works
- encrypt(): produces different ciphertext each time (random IV)
- generateBackupCodes(): generates 10 codes in XXXX-XXXX format
- hashBackupCode(): deterministic SHA256

#### `services/oauth.service.ts`
**Test Type:** ❌ Integration
**Priority:** MEDIUM
**What it does:** OAuth for Google and GitHub. Circuit breaker on external calls. Creates/links users from OAuth profiles.
**Dependencies:** google-auth-library, axios, pool, JWTService, auditService, withCircuitBreaker, crypto, env, AuthenticationError, ValidationError
**Test Cases:**
- exchangeGoogleCode(): verifies ID token
- exchangeGoogleCode(): extracts profile (email, name, picture)
- exchangeGoogleCode(): throws on missing email
- exchangeGitHubCode(): exchanges code for token (circuit breaker wrapped)
- exchangeGitHubCode(): fetches user profile
- exchangeGitHubCode(): fetches emails if not in profile
- exchangeGitHubCode(): extracts primary email
- findOrCreateUser(): finds existing OAuth connection
- findOrCreateUser(): links to existing user by email
- findOrCreateUser(): creates new user if none exists
- findOrCreateUser(): respects tenant isolation
- authenticate(): full flow for Google
- authenticate(): full flow for GitHub
- authenticate(): throws on unsupported provider
- linkProvider(): links OAuth to existing user
- linkProvider(): throws if already linked
- linkProvider(): throws if OAuth account linked to different user
- unlinkProvider(): removes OAuth connection
- unlinkProvider(): throws if not linked

#### `services/wallet.service.ts`
**Test Type:** 🔶 Unit (signatures) + ❌ Integration (full flows)
**Priority:** HIGH
**What it does:** Web3 wallet auth for Solana and Ethereum. Nonce generation, signature verification, register/login/link.
**Dependencies:** @solana/web3.js, ethers, tweetnacl, bs58, pool, getRedis, JWTService, auditService, redisKeys, logger, AuthenticationError
**Test Cases:**
- generateNonce(): creates random 32-byte hex nonce
- generateNonce(): stores in Redis with 15 min TTL
- generateNonce(): returns nonce and message with timestamp
- verifySolanaSignature(): verifies valid signature (nacl.sign.detached.verify)
- verifySolanaSignature(): returns false for invalid signature
- verifySolanaSignature(): handles errors gracefully
- verifyEthereumSignature(): verifies valid signature (ethers.verifyMessage)
- verifyEthereumSignature(): case-insensitive address comparison
- verifyEthereumSignature(): returns false for invalid signature
- getNonceData(): tries tenant-prefixed key first
- getNonceData(): falls back to non-prefixed key
- registerWithWallet(): verifies signature
- registerWithWallet(): creates user with synthetic email
- registerWithWallet(): creates wallet_connection
- registerWithWallet(): creates session
- registerWithWallet(): generates tokens
- registerWithWallet(): deletes nonce after use
- loginWithWallet(): verifies signature
- loginWithWallet(): finds existing wallet_connection
- loginWithWallet(): throws if wallet not registered
- loginWithWallet(): creates session
- loginWithWallet(): generates tokens
- linkWallet(): verifies signature
- linkWallet(): throws if wallet linked to another user
- linkWallet(): creates wallet_connection
- unlinkWallet(): deletes wallet_connection
- unlinkWallet(): throws if not found

#### `services/biometric.service.ts`
**Test Type:** ❌ Integration
**Priority:** LOW
**What it does:** Biometric auth (FaceID/TouchID/fingerprint). Challenge-response with public key storage.
**Dependencies:** db (Knex), getRedis, crypto, redisKeys, AuthenticationError
**Test Cases:**
- registerBiometric(): throws if device already registered
- registerBiometric(): stores credential with public key
- generateChallenge(): creates random 32-byte hex challenge
- generateChallenge(): stores in Redis with 5 min TTL
- verifyBiometric(): retrieves challenge from Redis
- verifyBiometric(): throws if challenge expired/missing
- verifyBiometric(): throws if challenge mismatch
- verifyBiometric(): deletes challenge after use (one-time)
- verifyBiometric(): finds credential by ID and userId
- verifyBiometric(): verifies signature
- listBiometricDevices(): returns devices for user
- removeBiometricDevice(): deletes credential
- removeBiometricDevice(): throws if not found

#### `services/email.service.ts`
**Test Type:** 🔶 Unit + Mock
**Priority:** MEDIUM
**What it does:** Email sending via Resend. Stores tokens in Redis. Templates for verification, password reset, MFA backup codes.
**Dependencies:** resend, getRedis, crypto, env, redisKeys
**Test Cases:**
- sendVerificationEmail(): generates 32-byte token
- sendVerificationEmail(): stores in Redis with 24h TTL
- sendVerificationEmail(): stores userId, email, tenantId
- sendVerificationEmail(): builds correct verify URL
- sendVerificationEmail(): skips sending in dev/test (logs instead)
- sendPasswordResetEmail(): generates 32-byte token
- sendPasswordResetEmail(): stores in Redis with 1h TTL
- sendPasswordResetEmail(): builds correct reset URL
- sendMFABackupCodesEmail(): includes all codes in template
- sendEmail(): calls Resend API in production
- sendEmail(): handles Resend errors

#### `services/captcha.service.ts`
**Test Type:** 🔶 Unit + Mock
**Priority:** MEDIUM
**What it does:** CAPTCHA verification after N failed attempts. Supports reCAPTCHA v2/v3 and hCaptcha.
**Dependencies:** env, getRedis, logger, fetch
**Constants:** CAPTCHA_THRESHOLD=3, CAPTCHA_WINDOW=15min
**Test Cases:**
- isCaptchaRequired(): returns false in non-prod unless CAPTCHA_ENABLED
- isCaptchaRequired(): returns false if no secret key configured
- isCaptchaRequired(): returns false if failures < 3
- isCaptchaRequired(): returns true if failures >= 3
- recordFailure(): increments counter
- recordFailure(): sets TTL on first failure
- recordFailure(): returns requiresCaptcha and attempts
- clearFailures(): deletes key
- verify(): returns success if no secret key (skip)
- verify(): returns failure if no token
- verify(): calls correct provider URL (reCAPTCHA vs hCaptcha)
- verify(): checks score for reCAPTCHA v3
- verify(): respects minScore setting
- verify(): handles network errors
- verify(): fail-open behavior when CAPTCHA_FAIL_OPEN=true

#### `services/cache.service.ts`
**Test Type:** ✅ Pure Unit
**Priority:** LOW
**What it does:** Simple in-memory cache with TTL. Singleton pattern.
**Dependencies:** None
**Test Cases:**
- getInstance(): returns singleton
- get(): returns null for missing key
- get(): returns null and deletes expired key
- get(): returns value for valid key
- set(): stores with correct expiry
- checkLimit(): allows under limit
- checkLimit(): rejects at limit
- checkLimit(): window resets after TTL

#### `services/cache-fallback.service.ts`
**Test Type:** 🔶 Unit + Mock
**Priority:** MEDIUM
**What it does:** Redis-backed cache for DB fallback during outages. Caches user profiles (5 min) and permissions (1 min).
**Dependencies:** getRedis, logger, prom-client metrics
**Test Cases:**
- cacheUserProfile(): stores with 5 min TTL
- cacheUserProfile(): handles Redis errors silently
- getCachedUserProfile(): retrieves and parses JSON
- getCachedUserProfile(): increments hit metric
- getCachedUserProfile(): increments miss metric on miss
- cacheUserPermissions(): stores with 1 min TTL (shorter for security)
- invalidateUserCache(): deletes both profile and permissions
- withFallback(): returns DB result when available
- withFallback(): falls back to cache on connection error (ECONNREFUSED, ETIMEDOUT, etc)
- withFallback(): rethrows non-connection errors
- withFallback(): throws original error if cache also misses
- getCacheAge(): calculates seconds since cached_at
- isCacheFresh(): compares age to maxAgeSeconds

#### `services/cache-integration.ts`
**Test Type:** 🔶 Unit + Mock
**Priority:** LOW
**What it does:** Wrapper around @tickettoken/shared cache system.
**Dependencies:** @tickettoken/shared createCache, env
**Test Cases:**
- sessionCache.getSession/setSession/deleteSession work
- sessionCache.deleteUserSessions deletes by tag
- userCache.getUser/setUser/deleteUser work
- userCache.getUserWithFetch calls fetcher on miss
- tokenBlacklist.add stores with TTL
- tokenBlacklist.check returns correct value
- rateLimitCache.checkLimit allows/rejects correctly
- rateLimitCache.reset clears key

#### `services/audit.service.ts`
**Test Type:** ❌ Integration
**Priority:** LOW
**What it does:** Comprehensive audit logging to Postgres. Logs all auth events.
**Dependencies:** db (Knex), logger, getCorrelationId
**Test Cases:**
- log(): inserts to audit_logs with correct fields
- log(): includes correlationId in metadata
- log(): handles DB errors gracefully (logs, doesn't throw)
- Convenience methods populate correct action/actionType:
  - logLogin, logLogout, logRegistration
  - logTokenRefresh, logSessionCreated, logSessionRevoked, logAllSessionsRevoked
  - logPasswordChange, logPasswordReset
  - logMFAEnabled, logMFADisabled, logMFAVerification
  - logFailedLoginAttempt, logAccountLockout
  - logRoleGrant, logRoleRevoke, logPermissionDenied
  - logDataExport, logDataDeletion

#### `services/monitoring.service.ts`
**Test Type:** ❌ Integration
**Priority:** LOW
**What it does:** Health checks (liveness, readiness, startup) and Prometheus metrics.
**Dependencies:** db (Knex), getRedis, pool, logger, Fastify
**Test Cases:**
- performHealthCheck(): aggregates DB, Redis, memory checks
- performHealthCheck(): returns 'healthy' when all ok
- performHealthCheck(): returns 'unhealthy' when any error
- checkDatabase(): pings DB, returns pool stats
- checkRedis(): pings Redis, gets connected_clients
- checkMemory(): flags unhealthy if heap > 500MB or > 90%
- withTimeout(): rejects after timeout
- getMetrics(): returns Prometheus-formatted string
- markStartupComplete()/markStartupFailed(): set global flags
- /health/live: always returns 200
- /health/ready: returns 503 when DB/Redis down
- /health/startup: returns 503 before markStartupComplete()
- /health: returns full health check with statusCode based on health
- /metrics: returns combined prom-client and custom metrics

#### `services/rate-limit.service.ts`
**Test Type:** 🔶 Unit + Mock
**Priority:** MEDIUM
**What it does:** Rate limiting using @tickettoken/shared atomic Lua scripts.
**Dependencies:** @tickettoken/shared getRateLimiter/getKeyBuilder
**Limits:** login: 5/60s, register: 3/300s, wallet: 10/60s
**Test Cases:**
- consume(): allows under limit
- consume(): throws on limit exceeded with retry message
- consume(): uses default limit (100/60s) for unknown action
- consume(): includes venueId in key when provided

#### `services/key-rotation.service.ts`
**Test Type:** 🔶 Unit + Mock
**Priority:** MEDIUM
**What it does:** Manages JWT and S2S key lifecycle. Zero-downtime rotation with grace periods.
**Dependencies:** crypto, getRedis, logger, pool, auditService
**Config:** gracePeriodHours=24, notifyBeforeDays=7, autoRotateEnabled=false, maxKeyAgeDays=90
**Test Cases:**
- initialize(): loads config from Redis if exists
- initialize(): uses defaults if no stored config
- checkRotationNeeded(): returns needed=true when age >= maxKeyAgeDays
- checkRotationNeeded(): returns needed=false with warning when approaching
- checkRotationNeeded(): returns currentKeyAge
- generateKeyPair(): creates RSA 4096 key pair
- generateKeyPair(): generates unique keyId
- generateKeyPair(): generates fingerprint (SHA256 of public key, first 16 chars)
- recordRotation(): stores timestamp in Redis
- recordRotation(): calls auditService
- getRotationStatus(): returns status for JWT and S2S
- updateConfig(): stores in Redis
- updateConfig(): calls auditService
- acquireRotationLock(): succeeds when no lock (SET NX)
- acquireRotationLock(): fails when locked
- releaseRotationLock(): deletes lock key

#### `services/brute-force-protection.service.ts`
**Test Type:** 🔶 Unit + Mock
**Priority:** HIGH
**What it does:** Tracks failed auth attempts, locks accounts after threshold.
**Dependencies:** @tickettoken/shared getRateLimiter/getKeyBuilder, getRedis
**Constants:** maxAttempts=5, lockoutDuration=15min, attemptWindow=15min
**Test Cases:**
- recordFailedAttempt(): returns locked=false, remainingAttempts when under limit
- recordFailedAttempt(): returns locked=true when already locked
- recordFailedAttempt(): locks and returns locked=true when limit exceeded
- recordFailedAttempt(): clears attempt counter after locking
- clearFailedAttempts(): deletes key
- isLocked(): returns true when lock key exists
- isLocked(): returns false when no lock key
- getLockInfo(): returns remainingTime when locked
- getLockInfo(): returns locked=false when TTL <= 0

#### `services/password-security.service.ts`
**Test Type:** ✅ Pure Unit
**Priority:** HIGH
**What it does:** Password validation (12+ chars, upper, lower, number, special, no common, no 3+ repeated), hashing (argon2), generation.
**Dependencies:** argon2 (for hashing tests only)
**Test Cases:**
- validatePassword(): accepts strong password
- validatePassword(): rejects < 12 characters
- validatePassword(): rejects missing uppercase
- validatePassword(): rejects missing lowercase
- validatePassword(): rejects missing number
- validatePassword(): rejects missing special character
- validatePassword(): rejects common passwords (password, 123456, etc)
- validatePassword(): rejects 3+ repeated characters
- validatePassword(): returns all errors, not just first
- hashPassword(): returns argon2 hash
- hashPassword(): different hashes for same password (salted)
- verifyPassword(): returns true for correct password
- verifyPassword(): returns false for incorrect password
- generatePassword(): generates specified length
- generatePassword(): generated password passes validation

#### `services/lockout.service.ts`
**Test Type:** 🔶 Unit + Mock
**Priority:** MEDIUM
**What it does:** Account lockout tracking via Redis. Tracks by user ID and IP.
**Dependencies:** getRedis, logger
**Constants:** MAX_ATTEMPTS=5, LOCKOUT_DURATION=15min
**Test Cases:**
- recordFailedAttempt(): increments attempt counter
- recordFailedAttempt(): tracks by user ID and IP separately
- recordFailedAttempt(): returns isLocked, remainingAttempts, lockoutUntil
- isLocked(): checks lock key
- getLockoutInfo(): returns attempts, lockoutUntil
- clearLockout(): deletes attempt counter and lock key
- Lockout triggers at 5 attempts
- Lockout lasts 15 minutes

#### `services/device-trust.service.ts`
**Test Type:** ❌ Integration
**Priority:** LOW
**What it does:** Device fingerprinting (SHA256 of UA/language/encoding/IP), trust score (0-100), requires MFA if score < 30.
**Dependencies:** db (Knex), getRedis, crypto
**Test Cases:**
- generateFingerprint(): creates SHA256 hash of device attributes
- calculateTrustScore(): returns 0-100
- calculateTrustScore(): higher score for older devices
- calculateTrustScore(): higher score for recent activity
- calculateTrustScore(): returns 0 for unknown device
- shouldRequireMFA(): returns true if score < 30
- shouldRequireMFA(): returns false if score >= 30
- registerDevice(): stores device fingerprint
- getKnownDevices(): returns devices for user

#### `services/rbac.service.ts`
**Test Type:** ❌ Integration
**Priority:** MEDIUM
**What it does:** Role-based access control. Venue-scoped roles (venue-owner, venue-manager, box-office, door-staff, customer).
**Dependencies:** db (Knex), getRedis
**Test Cases:**
- getUserPermissions(): returns permissions based on role
- getUserVenueRoles(): returns roles for user across venues
- checkPermission(): returns true if user has permission
- checkPermission(): checks venue-specific roles
- checkPermission(): venue-owner has all permissions
- checkPermission(): door-staff only has scan:tickets
- grantVenueRole(): creates user_venue_role record
- grantVenueRole(): handles expiration
- revokeVenueRole(): deactivates role
- Role hierarchy correct:
  - venue-owner: all permissions
  - venue-manager: manage events, view reports, manage box-office
  - box-office: sell tickets, view attendance
  - door-staff: scan tickets only

---

### Middleware (7 files)

#### `middleware/auth.middleware.ts`
**Test Type:** 🔶 Unit + Mock
**Priority:** HIGH
**What it does:** JWT auth and RBAC authorization. Factory returns authenticate, requirePermission, requireVenueAccess.
**Dependencies:** JWTService, RBACService, auditLogger, AuthenticationError, AuthorizationError
**Test Cases:**
- authenticate(): extracts Bearer token from header
- authenticate(): calls jwtService.verifyAccessToken
- authenticate(): fetches permissions via rbacService
- authenticate(): attaches user to request
- authenticate(): throws AuthenticationError on missing header
- authenticate(): throws AuthenticationError on non-Bearer format
- authenticate(): throws AuthenticationError on invalid token
- requirePermission(): allows with permission
- requirePermission(): throws AuthorizationError without permission
- requirePermission(): logs denial to auditLogger
- requirePermission(): checks venueId from params or body
- requireVenueAccess(): checks user has role for venue
- requireVenueAccess(): throws AuthorizationError without venue role
- requireVenueAccess(): logs denial

#### `middleware/validation.middleware.ts`
**Test Type:** ✅ Pure Unit
**Priority:** HIGH
**What it does:** Joi schema validation for body/query/params.
**Dependencies:** Joi
**Test Cases:**
- validate(schema, 'body'): passes valid body
- validate(schema, 'body'): replaces request.body with validated data
- validate(schema, 'body'): strips unknown fields
- validate(schema, 'body'): throws 400 with errors array on invalid
- validate(schema, 'body'): includes field paths in errors
- validate(schema, 'query'): validates query params
- validate(schema, 'params'): validates route params
- Multiple errors collected (abortEarly: false)

#### `middleware/correlation.middleware.ts`
**Test Type:** ✅ Pure Unit
**Priority:** LOW
**What it does:** Adds correlation ID to requests, sets response headers.
**Dependencies:** crypto
**Test Cases:**
- Uses existing x-correlation-id header
- Uses existing x-request-id header as fallback
- Uses request.id as fallback
- Generates UUID if none exist
- Sets x-correlation-id response header
- Sets x-request-id response header
- getCorrelationHeaders() returns correct object

#### `middleware/idempotency.middleware.ts`
**Test Type:** 🔶 Unit + Mock
**Priority:** MEDIUM
**What it does:** Prevents duplicate processing. Caches responses by Idempotency-Key header.
**Dependencies:** getRedis, logger, crypto
**Constants:** DEFAULT_TTL=24h, IDEMPOTENT_ENDPOINTS list
**Test Cases:**
- hashRequestBody(): deterministic SHA256 hash
- buildIdempotencyKey(): without tenant
- buildIdempotencyKey(): with tenant prefix
- shouldApplyIdempotency(): true for listed endpoints
- shouldApplyIdempotency(): false for unlisted endpoints
- Middleware skips non-POST/PUT/DELETE
- Middleware skips if no Idempotency-Key header
- Returns 400 for invalid key format (< 16 or > 64 chars)
- Returns cached response on cache hit
- Sets Idempotency-Replayed header on replay
- Returns 422 if key reused with different body hash
- Returns 409 if concurrent request in progress
- Acquires lock for new request
- captureIdempotentResponse(): caches 2xx responses
- captureIdempotentResponse(): doesn't cache non-2xx
- Releases lock after response

#### `middleware/load-shedding.middleware.ts`
**Test Type:** 🔶 Unit + Mock
**Priority:** MEDIUM
**What it does:** Priority-based load shedding. Calculates load from heap/CPU/memory.
**Dependencies:** v8, os, priorities config, logger, prom-client metrics
**Constants:** LOAD_CHECK_INTERVAL=1000ms
**Test Cases:**
- calculateLoadLevel(): weighted average (heap 50%, CPU 30%, memory 20%)
- calculateLoadLevel(): caches result within interval
- calculateLoadLevel(): returns 0-100
- getCurrentLoadLevel(): returns calculated level
- loadSheddingMiddleware(): allows all requests at low load
- loadSheddingMiddleware(): sheds LOW priority at 50% load
- loadSheddingMiddleware(): sheds NORMAL at 70%
- loadSheddingMiddleware(): sheds HIGH at 85%
- loadSheddingMiddleware(): never sheds CRITICAL
- loadSheddingMiddleware(): returns 503 with Retry-After header
- loadSheddingMiddleware(): sets X-Load-Level and X-Priority headers
- loadSheddingMiddleware(): increments metric

#### `middleware/s2s.middleware.ts`
**Test Type:** 🔶 Unit + Mock
**Priority:** HIGH
**What it does:** Service-to-service auth. Verifies x-service-token, checks service allowlist.
**Dependencies:** jsonwebtoken, fs, env, logger
**Allowlist:** ticket-service, payment-service, event-service, notification-service, api-gateway
**Test Cases:**
- S2SKeyManager loads from env in production
- S2SKeyManager loads from filesystem in dev
- S2SKeyManager falls back to JWT keys with warning
- decodeKey(): handles base64
- decodeKey(): passes through PEM
- isServiceAllowed(): allows listed service for allowed endpoint
- isServiceAllowed(): supports wildcard (api-gateway /auth/internal/*)
- isServiceAllowed(): denies unknown service
- isServiceAllowed(): denies service for non-allowed endpoint
- verifyServiceToken(): returns 401 on missing token
- verifyServiceToken(): returns 401 on invalid token
- verifyServiceToken(): returns 401 on expired token (specific code)
- verifyServiceToken(): returns 403 if service not allowed for endpoint
- verifyServiceToken(): attaches service info to request on success
- allowUserOrService(): tries S2S if x-service-token present
- allowUserOrService(): tries user auth if authorization present
- allowUserOrService(): returns 401 if neither
- generateServiceToken(): creates valid JWT
- getAllowedServices(): returns allowlist copy
- isUsingFallbackKeys(): returns fallback status

#### `middleware/tenant.middleware.ts`
**Test Type:** 🔶 Unit + Mock
**Priority:** HIGH
**What it does:** Tenant validation and RLS context setting.
**Dependencies:** pool, AuthenticatedRequest type
**Test Cases:**
- isValidUUID(): accepts valid UUID v4
- isValidUUID(): rejects invalid strings
- validateTenant(): returns 401 if user not authenticated
- validateTenant(): returns 403 if tenant_id missing
- validateTenant(): returns 403 if tenant_id invalid format
- validateTenant(): returns 403 if user_id invalid format
- validateTenant(): sets app.current_tenant_id via set_config
- validateTenant(): sets app.current_user_id via set_config
- validateTenant(): returns 500 if set_config fails
- validateResourceTenant(): returns true when match
- validateResourceTenant(): returns false when mismatch
- addTenantFilter(): returns { tenant_id: tenantId }
- TenantIsolationError has statusCode 403, code 'TENANT_ISOLATION_VIOLATION'

---

### Controllers (5 files)

#### `controllers/auth.controller.ts`
**Test Type:** ❌ Integration
**Priority:** HIGH
**What it does:** Main auth endpoints - register, login (with MFA + CAPTCHA), refresh, logout, MFA operations.
**Dependencies:** AuthService, MFAService, captchaService, db, userCache, sessionCache
**Test Cases:**
- register(): returns 201 with user and tokens
- register(): caches user
- register(): returns 409 on duplicate email
- register(): returns 500 on other errors
- login(): checks CAPTCHA if required
- login(): returns 428 if CAPTCHA required but no token
- login(): returns 400 on CAPTCHA failure
- login(): clears CAPTCHA failures on success
- login(): returns 200 with requiresMFA if MFA enabled and no token
- login(): verifies TOTP
- login(): tries backup code if TOTP fails
- login(): returns 401 on invalid MFA
- login(): regenerates tokens after MFA
- login(): caches user and session
- login(): records CAPTCHA failure on error
- refreshTokens(): returns new tokens
- refreshTokens(): returns 401 on error
- logout(): clears cache
- logout(): returns 204
- getMe(): returns cached user if available
- getMe(): fetches and caches if not cached
- getMe(): returns 404 if not found
- setupMFA(): returns secret and QR code
- setupMFA(): returns 400 if already enabled
- verifyMFASetup(): returns backup codes
- verifyMFA(): returns valid flag
- regenerateBackupCodes(): returns new codes
- disableMFA(): requires password and token

#### `controllers/auth-extended.controller.ts`
**Test Type:** ❌ Integration
**Priority:** HIGH
**What it does:** Extended auth - forgot password, reset password, verify email, resend verification, change password.
**Dependencies:** AuthExtendedService, ValidationError, AuthenticationError
**Test Cases:**
- forgotPassword(): always returns success message (enumeration prevention)
- forgotPassword(): returns 429 on rate limit
- resetPassword(): returns success on valid token
- resetPassword(): returns 400 on invalid/expired token
- resetPassword(): returns 400 on weak password
- verifyEmail(): requires token query param
- verifyEmail(): returns 400 on invalid token
- resendVerification(): requires auth
- resendVerification(): returns 400 if already verified
- resendVerification(): returns 400 on rate limit
- changePassword(): requires auth
- changePassword(): returns 401 on wrong current password
- changePassword(): returns 400 on weak/same password

#### `controllers/wallet.controller.ts`
**Test Type:** ❌ Integration
**Priority:** MEDIUM
**What it does:** Wallet auth - nonce, register, login, link, unlink.
**Dependencies:** WalletService, AuthenticationError
**Test Cases:**
- requestNonce(): returns 200 with nonce and message
- register(): returns 201 with user, tokens, wallet
- register(): returns 409 on duplicate wallet
- register(): returns AuthenticationError status on auth failure
- login(): returns 200 with user, tokens, wallet
- login(): returns AuthenticationError status on failure
- linkWallet(): requires auth
- linkWallet(): returns 200 on success
- unlinkWallet(): requires auth
- unlinkWallet(): returns 200 on success

#### `controllers/session.controller.ts`
**Test Type:** ❌ Integration
**Priority:** MEDIUM
**What it does:** Session management - list, revoke single, revoke all.
**Dependencies:** pool, AuthenticatedRequest
**Test Cases:**
- listSessions(): returns active sessions for user
- listSessions(): filters by tenant
- revokeSession(): verifies ownership
- revokeSession(): verifies tenant
- revokeSession(): returns 404 if not found
- revokeSession(): sets revoked_at and ended_at
- revokeSession(): creates audit log
- invalidateAllSessions(): verifies tenant
- invalidateAllSessions(): revokes all sessions
- invalidateAllSessions(): returns count
- invalidateAllSessions(): creates audit log

#### `controllers/profile.controller.ts`
**Test Type:** ❌ Integration
**Priority:** MEDIUM
**What it does:** Profile and GDPR - get/update profile, export data, consent, deletion.
**Dependencies:** pool, ValidationError, stripHtml, auditService, cacheFallbackService
**Test Cases:**
- getProfile(): uses cacheFallbackService.withFallback
- getProfile(): sets X-Cache header on cache hit
- getProfile(): returns 404 if not found
- updateProfile(): sanitizes input
- updateProfile(): allows partial updates
- updateProfile(): returns 422 on no valid fields
- updateProfile(): invalidates cache
- updateProfile(): creates audit log
- exportData(): returns all user data (GDPR Article 15 & 20)
- exportData(): includes sessions, wallets, OAuth, roles, addresses, audit
- exportData(): creates audit log
- updateConsent(): updates marketing_consent
- updateConsent(): invalidates cache
- updateConsent(): creates audit log
- requestDeletion(): requires email confirmation
- requestDeletion(): returns 400 on email mismatch
- requestDeletion(): soft deletes user
- requestDeletion(): revokes all sessions
- requestDeletion(): invalidates cache
- requestDeletion(): creates audit log
- getConsent(): returns consent status

---

### Models (1 file)

#### `models/user.model.ts`
**Test Type:** ⏭️ Skip
**Reason:** TypeScript interfaces only - User, UserVenueRole, UserSession, LoginAttempt

---

## Test Infrastructure

### Docker Compose for Integration Tests
```yaml
version: '3.8'
services:
  postgres-test:
    image: postgres:15
    environment:
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
      POSTGRES_DB: auth_test
    ports:
      - "5433:5432"
    tmpfs:
      - /var/lib/postgresql/data

  redis-test:
    image: redis:7-alpine
    ports:
      - "6380:6379"
```

### Test Database Setup

- Run migrations before tests
- Seed default tenant
- Truncate tables between tests (not drop - faster)
- Use transactions where possible for isolation

### Mocking Patterns

**Redis Mock:**
```typescript
const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  incr: jest.fn(),
  expire: jest.fn(),
  ttl: jest.fn(),
  ping: jest.fn(),
  scan: jest.fn(),
};
jest.mock('../config/redis', () => ({ getRedis: () => mockRedis }));
```

**Database Mock:**
```typescript
const mockDb = jest.fn(() => ({
  withSchema: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  first: jest.fn(),
  insert: jest.fn(),
  update: jest.fn(),
  del: jest.fn(),
}));
jest.mock('../config/database', () => ({ db: mockDb }));
```

---

## Execution Order

### Phase 1: Pure Unit Tests (No Dependencies)
Run first, run often, run in CI on every commit.

1. utils/sanitize.ts
2. utils/normalize.ts
3. utils/redisKeys.ts
4. utils/bulkhead.ts
5. validators/auth.validators.ts
6. errors/index.ts
7. config/priorities.ts
8. middleware/validation.middleware.ts
9. middleware/correlation.middleware.ts
10. services/cache.service.ts
11. services/password-security.service.ts

### Phase 2: Unit Tests with Mocks
Run in CI, can be parallelized.

HIGH Priority:
1. services/jwt.service.ts
2. services/mfa.service.ts
3. services/brute-force-protection.service.ts
4. utils/rateLimiter.ts
5. middleware/auth.middleware.ts
6. middleware/s2s.middleware.ts
7. middleware/tenant.middleware.ts

MEDIUM Priority:
8. config/env.ts
9. config/redis.ts
10. config/secrets.ts
11. services/wallet.service.ts (signature verification)
12. services/email.service.ts
13. services/captcha.service.ts
14. services/cache-fallback.service.ts
15. services/key-rotation.service.ts
16. services/lockout.service.ts
17. services/rate-limit.service.ts
18. middleware/idempotency.middleware.ts
19. middleware/load-shedding.middleware.ts
20. Other utils (retry, circuit-breaker, http-client, etc)

### Phase 3: Integration Tests (Docker Required)
Run in CI with Docker services, run before merge.

1. services/auth.service.ts
2. services/auth-extended.service.ts
3. services/rbac.service.ts
4. services/oauth.service.ts
5. services/wallet.service.ts (full flows)
6. services/biometric.service.ts
7. services/device-trust.service.ts
8. services/audit.service.ts
9. services/monitoring.service.ts
10. controllers/auth.controller.ts
11. controllers/auth-extended.controller.ts
12. controllers/wallet.controller.ts
13. controllers/session.controller.ts
14. controllers/profile.controller.ts

---

## Coverage Targets

| Category | Target |
|----------|--------|
| Pure Unit | 95%+ |
| Unit + Mock | 85%+ |
| Integration | 80%+ |
| Overall | 85%+ |

Critical paths (login, register, token refresh, MFA) should have 100% coverage.

