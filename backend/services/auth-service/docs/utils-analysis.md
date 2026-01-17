# Auth Service Utilities Analysis
## Purpose: Integration Testing Documentation
## Source: src/utils/*.ts
## Generated: January 15, 2026

---

## 1. `redisKeys.ts` - Redis Key Builder

### PURPOSE
Ensures tenant isolation for all Redis keys. All Redis keys MUST go through this utility to prevent cross-tenant data leakage.

### KEY PATTERNS & TEMPLATES

| Key Builder | Key Pattern | Example |
|-------------|-------------|---------|
| **Rate Limiting** |
| `rateLimit(action, identifier, tenantId?)` | `tenant:{tenantId}:ratelimit:{action}:{identifier}` | `tenant:uuid:ratelimit:login:192.168.1.1` |
| `rateLimitBlock(action, identifier, tenantId?)` | `tenant:{tenantId}:ratelimit:{action}:block:{identifier}` | Block key variant |
| **Authentication** |
| `refreshToken(jti, tenantId?)` | `tenant:{tenantId}:refresh_token:{jti}` | Refresh token storage |
| `passwordReset(token, tenantId?)` | `tenant:{tenantId}:password-reset:{token}` | Password reset tokens |
| `emailVerify(token, tenantId?)` | `tenant:{tenantId}:email-verify:{token}` | Email verification |
| **MFA** |
| `mfaSetup(userId, tenantId?)` | `tenant:{tenantId}:mfa:setup:{userId}` | MFA setup state |
| `mfaSecret(userId, tenantId?)` | `tenant:{tenantId}:mfa:secret:{userId}` | TOTP secret |
| `mfaVerified(userId, tenantId?)` | `tenant:{tenantId}:mfa:verified:{userId}` | MFA verified flag |
| `mfaRecent(userId, code, tenantId?)` | `tenant:{tenantId}:mfa:recent:{userId}:{code}` | Recent code replay protection |
| **Biometric** |
| `biometricChallenge(userId, tenantId?)` | `tenant:{tenantId}:biometric_challenge:{userId}` | WebAuthn challenge |
| **Wallet** |
| `walletNonce(nonce, tenantId?)` | `tenant:{tenantId}:wallet-nonce:{nonce}` | Wallet auth nonce |
| **Lockout / Brute Force** |
| `lockoutUser(userId, tenantId?)` | `tenant:{tenantId}:lockout:user:{userId}` | User lockout state |
| `lockoutIp(ip, tenantId?)` | `tenant:{tenantId}:lockout:ip:{ip}` | IP lockout state |
| `bruteForceAttempts(identifier, tenantId?)` | `tenant:{tenantId}:bf:attempts:{identifier}` | Attempt counter |
| `bruteForceLock(identifier, tenantId?)` | `tenant:{tenantId}:bf:lock:{identifier}` | Brute force lock |
| **Session** |
| `session(sessionId, tenantId?)` | `tenant:{tenantId}:session:{sessionId}` | Session data |
| `userSessions(userId, tenantId?)` | `tenant:{tenantId}:user:sessions:{userId}` | User's session list |

### BASE KEY FORMAT
```
tenant:{tenantId}:{prefix}:{identifier}
```
Without tenant: `{prefix}:{identifier}`

---

## 2. `redis-fallback.ts` - Redis Graceful Degradation

### PURPOSE
GD-RD7: Provides fallback behavior when Redis is unavailable. Falls back to in-memory cache.

### CONFIGURATION VALUES
| Setting | Value |
|---------|-------|
| MAX_MEMORY_CACHE_SIZE | `1000` entries |
| Default fallback TTL | `300000ms` (5 minutes) |

### FALLBACK BEHAVIOR
- `getWithFallback()`: Tries Redis, falls back to memory cache
- `setWithFallback()`: Tries Redis, falls back to memory cache with eviction on full
- `deleteWithFallback()`: Deletes from both Redis and memory
- `withRedisFallback()`: Generic wrapper that returns default on failure

### EVICTION STRATEGY
- When cache full (1000 entries): Evict oldest 100 entries

---

## 3. `rateLimiter.ts` - Rate Limiting

### PURPOSE
Redis-based rate limiter with tenant isolation and blocking support.

### RATE LIMITER CONFIGURATIONS

| Name | Key Prefix | Points | Duration | Block Duration |
|------|------------|--------|----------|----------------|
| `loginRateLimiter` | `login` | 5 | 900s (15 min) | 900s (15 min) |
| `registrationRateLimiter` | `register` | 3 | 3600s (1 hr) | 3600s (1 hr) |
| `passwordResetRateLimiter` | `password-reset` | 3 | 3600s (1 hr) | 3600s (1 hr) |
| `otpRateLimiter` | `otp-verify` | 5 | 300s (5 min) | 900s (15 min) |
| `mfaSetupRateLimiter` | `mfa-setup` | 3 | 3600s (1 hr) | 3600s (1 hr) |
| `backupCodeRateLimiter` | `backup-code` | 3 | 3600s (1 hr) | 7200s (2 hr) |

### KEY PATTERNS
- Rate key: `tenant:{tenantId}:{prefix}:{key}` or `{prefix}:{key}`
- Block key: `{fullKey}:block`

---

## 4. `retry.ts` - Exponential Backoff Retry

### PURPOSE
DS5/DS6: Retry with exponential backoff for external calls.

### RETRY CONFIGURATION

| Setting | Default |
|---------|---------|
| maxRetries | `3` |
| baseDelay | `100ms` |
| maxDelay | `5000ms` (5s) |
| timeout | `30000ms` (30s) |

### BACKOFF FORMULA
```
delay = min(baseDelay * 2^attempt + random(0-100ms), maxDelay)
```

### RETRYABLE CONDITIONS (Default)
- Network errors: `ECONNRESET`, `ETIMEDOUT`, `ENOTFOUND`
- Server errors: HTTP 5xx responses

---

## 5. `circuit-breaker.ts` - Circuit Breaker (Opossum)

### PURPOSE
Prevent cascade failures by opening circuit on repeated failures.

### CIRCUIT BREAKER CONFIGURATION

| Setting | Default |
|---------|---------|
| timeout | `3000ms` (3s) |
| errorThresholdPercentage | `50%` |
| resetTimeout | `30000ms` (30s) |
| volumeThreshold | `5` requests |

### STATES
- **Closed**: Normal operation
- **Open**: Failing fast, rejecting requests
- **Half-Open**: Testing if service recovered

### EVENTS LOGGED
- `open`, `halfOpen`, `close`, `fallback`, `timeout`, `reject`, `failure`

---

## 6. `bulkhead.ts` - Concurrent Request Limiting

### PURPOSE
Limits concurrent executions to prevent cascade failures. Rejects fast when too many requests in-flight.

### BULKHEAD CONFIGURATIONS

| Name | maxConcurrent | maxQueue | timeout |
|------|---------------|----------|---------|
| `database` | 20 | 50 | 30000ms |
| `externalApi` | 10 | 20 | 10000ms |
| `auth` | 50 | 100 | 5000ms |
| `email` | 5 | 100 | 60000ms |

### ERROR TYPES
- `BulkheadRejectError`: Queue full, request rejected immediately
- `BulkheadTimeoutError`: Request timed out while queued

---

## 7. `http-client.ts` - HTTP Client with Resilience

### PURPOSE
Axios-based HTTP client with retry, correlation ID propagation, and circuit breaker integration.

### DEFAULT CONFIGURATION

| Setting | Default |
|---------|---------|
| timeout | `5000ms` |
| retries | `3` |
| retryDelay | `1000ms` (base) |
| Max backoff cap | `30000ms` |

### RETRY BEHAVIOR
- Exponential backoff: `baseDelay * 2^attempt + jitter(0-25%)`
- Retryable: Network errors, 5xx errors, 429 (rate limited)
- Non-retryable: 4xx errors (except 429)

### HEADERS PROPAGATED
- `x-correlation-id`
- `x-request-id`

### PRE-CONFIGURED CLIENTS

| Client | Base URL | Timeout | Retries |
|--------|----------|---------|---------|
| `venueService` | `http://venue-service:3002` | 5000ms | 3 |
| `notificationService` | `http://notification-service:3008` | 5000ms | 3 |
| `apiGateway` | `http://api-gateway:3000` | 5000ms | 2 |

---

## 8. `idempotency-helpers.ts` - Idempotency for Auth Operations

### PURPOSE
Prevents duplicate operations within time windows.

### IDEMPOTENCY WINDOWS

| Operation | Key Pattern | TTL |
|-----------|-------------|-----|
| Password Reset | `idempotent:password-reset:{email}` | 300s (5 min) |
| MFA Setup | `idempotent:mfa-setup:{userId}` | 600s (10 min) |

### BEHAVIOR
- Returns existing token/data if within window
- Fails open (allows new request) if Redis unavailable

---

## 9. `sanitize.ts` - XSS Prevention

### PURPOSE
Sanitize user input to prevent XSS attacks.

### TRANSFORMATIONS

| Function | Transformation |
|----------|----------------|
| `stripHtml(input)` | Removes ALL HTML tags (`/<[^>]*>/g`) |
| `escapeHtml(input)` | Escapes: `&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`, `"` → `&quot;`, `'` → `&#x27;` |
| `sanitizeName(input)` | Calls `stripHtml()` |
| `sanitizeObject(obj, fields)` | Strips HTML from specified fields |

### FIELDS SANITIZED
```javascript
USER_SANITIZE_FIELDS = ['firstName', 'lastName', 'first_name', 'last_name', 'display_name', 'bio', 'username']
```

---

## 10. `normalize.ts` - String Normalization

### PURPOSE
SEC8: Unicode normalization before string comparison. Prevents homograph attacks.

### TRANSFORMATIONS

| Function | Transformation |
|----------|----------------|
| `normalizeEmail(email)` | NFC normalize → lowercase → trim |
| `normalizeUsername(username, lowercase?)` | NFC normalize → trim → optional lowercase |
| `normalizeText(text)` | NFC normalize → trim |
| `normalizePhone(phone)` | Strip non-digits (keep leading +) → validate E.164 |
| `normalizedEquals(a, b)` | Compare after normalization |

### PHONE VALIDATION
- E.164 format: `^\+?[1-9]\d{7,14}$`
- Returns `null` if invalid
- Ensures leading `+`

---

## 11. `logger.ts` - Winston Logger with PII Sanitization

### PURPOSE
Structured logging with correlation ID tracking and automatic PII sanitization.

### FEATURES
- **Correlation ID**: Uses `AsyncLocalStorage` for request correlation
- **PII Sanitization**: Uses `PIISanitizer` from `@tickettoken/shared`
- **Console Override**: Patches `console.log/error/warn` to sanitize

### LOG FORMAT
- Development: Colorized, human-readable
- Production: JSON

### EXPORTED UTILITIES

| Function | Purpose |
|----------|---------|
| `withCorrelation(id, callback)` | Run callback with correlation context |
| `getCorrelationId()` | Get current correlation ID |
| `createChildLogger(correlationId)` | Create logger with fixed correlation ID |
| `logError(message, error, meta)` | Log error with sanitization |
| `logRequest(req, meta)` | Log sanitized request |
| `logResponse(req, res, body, meta)` | Log sanitized response |

---

## 12. `metrics.ts` - Prometheus Metrics

### PURPOSE
Export metrics for monitoring via Prometheus.

### METRICS EXPORTED

| Metric Name | Type | Labels | Description |
|-------------|------|--------|-------------|
| **HTTP Metrics** |
| `http_requests_total` | Counter | method, route, status_code | Total HTTP requests |
| `http_request_duration_seconds` | Histogram | method, route, status_code | Request duration |
| **Auth-Specific** |
| `auth_login_attempts_total` | Counter | status | Login attempts |
| `auth_registrations_total` | Counter | status | User registrations |
| `auth_token_refresh_total` | Counter | status | Token refreshes |
| `auth_operation_duration_seconds` | Histogram | operation | Auth operation duration |
| **Key Rotation** |
| `auth_key_rotations_total` | Counter | key_type, reason | Key rotations |
| `auth_key_age_days` | Gauge | key_type | Current key age |
| `auth_key_rotation_needed` | Gauge | key_type | Rotation needed flag |

### HISTOGRAM BUCKETS

**HTTP Duration**: `[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]`

**Auth Duration**: `[0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]`

---

## Summary for Integration Testing

### Key Mocking Requirements

1. **Redis Keys**: Mock `getRedis()` - all keys go through `redisKeys.ts`
2. **Rate Limiters**: Pre-configured instances need Redis mock
3. **Circuit Breakers**: Named registry - can be reset with `resetCircuitBreaker(name)`
4. **Bulkheads**: Pre-configured instances with concurrency limits
5. **HTTP Clients**: Pre-configured Axios instances - mock with nock or similar

### Resilience Testing Considerations

| Pattern | Test Scenarios |
|---------|----------------|
| Retry | Network failures, 5xx responses, timeout |
| Circuit Breaker | 50% error threshold, 30s reset |
| Bulkhead | Queue overflow, timeout while queued |
| Rate Limiter | Limit exceeded, block duration |
| Redis Fallback | Redis unavailable, memory cache eviction |

### Normalization & Sanitization Test Cases
- Unicode homoglyphs (Cyrillic "а" vs Latin "a")
- HTML injection in user fields
- Phone number E.164 validation
