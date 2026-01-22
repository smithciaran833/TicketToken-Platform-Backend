# Event Service Config Analysis
## Purpose: Integration Testing Documentation
## Source Files Analyzed:
- `src/config/database.ts` (280 lines)
- `src/config/dependencies.ts` (45 lines)
- `src/config/env-validation.ts` (75 lines)
- `src/config/index.ts` (95 lines)
- `src/config/mongodb.ts` (100 lines)
- `src/config/redis.ts` (35 lines)
- `src/config/secrets.ts` (30 lines)
- `src/config/service-auth.ts` (550 lines)

## Generated: January 20, 2026

---

## FILE-BY-FILE ANALYSIS

### 1. database.ts (280 lines)

**Purpose:** PostgreSQL connection management via Knex with retry logic, deadlock handling, and timeout configuration.

#### DATABASE OPERATIONS

**Connection Management:**
- Creates Knex connection pool
- DNS resolution with fallback to hostname
- TLS enforcement in production (`rejectUnauthorized: true`)
- Query timeout: 30,000ms
- Statement timeout: 30,000ms

**Pool Configuration:**
| Setting | Value | Notes |
|---------|-------|-------|
| min | 0 | Allows pool to shrink (audit fix) |
| max | 10 | Maximum connections |
| acquireTimeoutMillis | 30000 | Wait for connection |
| idleTimeoutMillis | 30000 | Close idle connections |
| propagateCreateError | true | Surface connection errors |

**Transactions:** N/A - Connection layer only

**Type Parsing:**
- NUMERIC/DECIMAL (type 1700) parsed as float instead of string
- Fixes decimal handling issues noted in services

#### EXTERNAL SERVICE CALLS
N/A - Database connection only

#### CACHING
N/A

#### STATE MANAGEMENT
N/A

#### TENANT ISOLATION
N/A - Tenant isolation handled at query level via RLS

#### BUSINESS LOGIC

**Retry Logic:**
- `connectDatabase()` - 5 retries with exponential backoff (2s × attempt)
- `withDeadlockRetry()` - 3 retries for PostgreSQL deadlock errors
- `withTransactionRetry()` - Combines transaction + deadlock retry

**Retryable Error Codes:**
| Code | Name |
|------|------|
| 40P01 | DEADLOCK_DETECTED |
| 40001 | SERIALIZATION_FAILURE |
| 55P03 | LOCK_NOT_AVAILABLE |

**Backoff Calculation:**
```typescript
exponentialDelay = baseDelay * 2^attempt
cappedDelay = min(exponentialDelay, maxDelay)
jitter = cappedDelay * random(0, 0.5)
finalDelay = cappedDelay + jitter
```

#### ERROR HANDLING

**Custom Errors:**
| Error Class | HTTP Status | Code |
|-------------|-------------|------|
| `DatabaseConnectionError` | 503 | DATABASE_CONNECTION_ERROR |
| `DatabaseTimeoutError` | 504 | DATABASE_TIMEOUT |

**Error Detection:**
- Connection errors: ECONNREFUSED, ENOTFOUND, ETIMEDOUT, ECONNRESET
- Timeout errors: PostgreSQL 57014 (query_canceled)

**`withDatabaseErrorHandling()` wrapper:**
- Catches connection/timeout errors
- Maps to proper HTTP status codes
- Logs with operation name context

#### CONCURRENCY

**Deadlock Handling:** ✅ EXCELLENT
- Automatic retry on deadlock detection
- Exponential backoff with jitter prevents thundering herd
- Configurable max retries (default: 3)

#### POTENTIAL ISSUES

✅ **FIXED (Issue #9 - LOW):**
1. `db` exported as mutable `let` - ✅ **RESOLVED**
   - Changed to private `_db` with `getDb()` getter function
   - Prevents accidental reassignment
   - Deprecated export maintained for backward compatibility

🟢 **LOW:**
1. DNS resolution failure logs warning but continues - acceptable fallback

✅ **WELL IMPLEMENTED:**
- Query timeouts configured
- Connection retry with exponential backoff
- Deadlock retry with jitter
- Proper error classification (503 vs 504)
- Pool configuration tuned

---

### 2. dependencies.ts (45 lines)

**Purpose:** Awilix dependency injection container setup

#### DATABASE OPERATIONS
N/A - Wiring only

#### EXTERNAL SERVICE CALLS
N/A - Wiring only

#### CACHING
N/A

#### STATE MANAGEMENT
N/A

#### TENANT ISOLATION
N/A - DI container is tenant-agnostic

#### BUSINESS LOGIC

**Registered Dependencies:**
| Name | Type | Scope |
|------|------|-------|
| config | Value | - |
| db | Function | Singleton |
| redis | Function | Singleton |
| mongodb | Function | Singleton |
| venueServiceClient | Function | Singleton |
| eventContentService | Function | Singleton |
| eventService | Function | Singleton |
| pricingService | Function | Singleton |
| capacityService | Function | Singleton |

**Injection Mode:** PROXY (lazy resolution)

#### ERROR HANDLING
N/A - No error handling in wiring

#### CONCURRENCY
N/A

#### POTENTIAL ISSUES

✅ **FIXED (Issue #3 - HIGH):**
1. Missing services not registered - ✅ **RESOLVED**
   - Added `blockchainService` - EventBlockchainService
   - Added `cancellationService` - CancellationService
   - Added `eventCancellationService` - EventCancellationService
   - Added `reservationCleanupService` - ReservationCleanupService
   - All registered as singletons in DI container

🟢 **LOW:**
- Simple wiring, minimal risk
- Health check service registration intentionally deferred

---

### 3. env-validation.ts (75 lines)

**Purpose:** Joi schema validation for environment variables at startup

#### DATABASE OPERATIONS
N/A

#### EXTERNAL SERVICE CALLS
N/A

#### CACHING
N/A

#### STATE MANAGEMENT
N/A

#### TENANT ISOLATION
N/A

#### BUSINESS LOGIC

**Validated Environment Variables:**

| Category | Variables | Validation |
|----------|-----------|------------|
| Core | NODE_ENV, PORT, SERVICE_NAME | Required |
| Database | DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, DB_POOL_MIN, DB_POOL_MAX | Required |
| Redis | REDIS_HOST, REDIS_PORT, REDIS_PASSWORD, REDIS_DB | Required (password optional) |
| Security | JWT_SECRET (min 32 chars), JWT_EXPIRES_IN, JWT_REFRESH_EXPIRES_IN, JWT_ALGORITHM, JWT_ISSUER, JWT_AUDIENCE | Required |
| Services | 16 service URLs (AUTH, VENUE, EVENT, TICKET, etc.) | Required, must be URI |
| Logging | LOG_LEVEL, LOG_FORMAT | Optional with defaults |
| Metrics | ENABLE_METRICS, METRICS_PORT | Optional with defaults |
| Rate Limiting | ENABLE_RATE_LIMITING, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_REQUESTS | Optional with defaults |
| Jobs | RESERVATION_CLEANUP_INTERVAL_MINUTES | Optional, default 1 |

**Schema Options:**
- `abortEarly: false` - Collects all errors
- `stripUnknown: false` - Allows other env vars
- `.unknown(true)` - Permits unlisted variables

#### ERROR HANDLING

**Validation Failure:**
- Logs all validation errors
- Throws Error with combined message
- Prevents service startup with invalid config

#### CONCURRENCY
N/A

#### POTENTIAL ISSUES

✅ **FIXED (Issue #4 - MEDIUM):**
1. All 16 service URLs marked required - ✅ **RESOLVED**
   - Made conditionally required based on NODE_ENV
   - Production/staging: required
   - Development/test: optional with localhost defaults

✅ **FIXED (Issue #5 - MEDIUM):**
2. No MongoDB URI validation - ✅ **RESOLVED**
   - Added MONGODB_URI to Joi schema
   - Validates as URI format
   - Conditionally required (production) or optional with default (dev)

🟢 **LOW:**
- Good validation coverage
- Secure: JWT_SECRET requires minimum 32 characters

---

### 4. index.ts (95 lines)

**Purpose:** Central configuration export and logging settings

#### DATABASE OPERATIONS
N/A

#### EXTERNAL SERVICE CALLS
N/A

#### CACHING
N/A

#### STATE MANAGEMENT
N/A

#### TENANT ISOLATION
N/A

#### BUSINESS LOGIC

**Logging Configuration:**

| Setting | Value | Notes |
|---------|-------|-------|
| level | Based on NODE_ENV | production/staging: info, dev: debug, test: warn |
| format | Based on NODE_ENV | production: json, dev: pretty |
| samplingRate | 1.0 default | Can reduce in production |
| includeRequestBody | !production | Disabled in production |
| includeResponseBody | false | Always disabled |

**PII Redaction Fields:**
```
email, password, token, authorization, creditCard, ssn, phone, address, apiKey, secret, refreshToken, accessToken
*.email, *.password, *.token, *.authorization, *.creditCard, *.ssn, *.phone, *.address, *.apiKey, *.secret
req.headers.authorization, req.headers.cookie, req.headers["x-api-key"], req.headers["x-auth-token"], req.headers["x-service-token"]
res.headers["set-cookie"]
```

**AppConfig Export:**
| Field | Default |
|-------|---------|
| port | 3003 |
| host | 0.0.0.0 |
| database.host | postgres |
| database.port | 6432 |
| redis.host | redis |
| redis.port | 6379 |
| services.venueServiceUrl | http://venue-service:3002 |
| services.authServiceUrl | http://auth-service:3001 |

#### ERROR HANDLING
N/A - Configuration only

#### CONCURRENCY
N/A

#### POTENTIAL ISSUES

✅ **FIXED (Issue #7 - LOW):**
1. Default DB port is 6432 (PgBouncer) - ✅ **DOCUMENTED**
   - Added comprehensive comments explaining:
     - 6432 = PgBouncer (connection pooler - RECOMMENDED)
     - 5432 = Direct PostgreSQL (local dev only)
   - Benefits of connection pooling documented

✅ **WELL IMPLEMENTED:**
- Comprehensive PII redaction list
- Environment-specific log levels
- Sampling rate for high-volume production

---

### 5. mongodb.ts (100 lines)

**Purpose:** MongoDB connection management for event content

#### DATABASE OPERATIONS

**Connection Configuration:**
| Setting | Value |
|---------|-------|
| maxPoolSize | 10 |
| minPoolSize | 2 |
| socketTimeoutMS | 45000 |
| serverSelectionTimeoutMS | 5000 |
| family | 4 (IPv4) |

**Connection URI:** `MONGODB_URI` or `mongodb://localhost:27017/tickettoken_content`

#### EXTERNAL SERVICE CALLS
N/A

#### CACHING
N/A

#### STATE MANAGEMENT

**Connection States Monitored:**
- `connected` - Log success
- `error` - Log error
- `disconnected` - Log warning

#### TENANT ISOLATION
N/A - Connection layer only, tenant isolation at query level

#### BUSINESS LOGIC

**Exported Functions:**
| Function | Purpose |
|----------|---------|
| `initializeMongoDB()` | Create connection, setup event handlers |
| `getMongoDB()` | Get active connection (throws if not initialized) |
| `closeMongoDB()` | Graceful shutdown |
| `checkMongoDBHealth()` | Admin ping check |

**Health Check:**
```typescript
const ping = await adminDb.ping();
return ping.ok === 1 && connection.readyState === 1;
```

**Graceful Shutdown:**
- SIGINT handler registered
- Closes connection before exit

#### ERROR HANDLING

**Initialization Failure:**
- Logs error
- Re-throws error (prevents startup)

**getMongoDB() Guard:**
- Throws if not initialized or not connected (readyState !== 1)

#### CONCURRENCY
N/A - Connection management only

#### POTENTIAL ISSUES

✅ **FIXED (Issue #2 - HIGH):**
1. No retry logic on initial connection failure - ✅ **RESOLVED**
   - Added retry logic matching PostgreSQL pattern
   - 5 retry attempts with exponential backoff (2s × attempt)
   - Added jitter (0-50%) to prevent thundering herd
   - Proper error logging between retries

✅ **FIXED (Issue #6 - MEDIUM):**
2. SIGINT handler registered - ✅ **RESOLVED**
   - Removed individual SIGINT handler
   - Now uses centralized shutdown manager
   - Shutdown handlers registered with priority ordering

🟢 **LOW:**
- Credentials hidden in connection logs
- Pool configuration reasonable

---

### 6. redis.ts (35 lines)

**Purpose:** Redis connection wrapper using shared library

#### DATABASE OPERATIONS
N/A

#### EXTERNAL SERVICE CALLS
N/A

#### CACHING

**Connection Types:**
| Function | Purpose |
|----------|---------|
| `getRedis()` | Main Redis client |
| `getPub()` | Pub/sub publisher |
| `getSub()` | Pub/sub subscriber |

**Initialization:**
- Uses `@tickettoken/shared` library
- `getRedisClient()`, `getRedisPubClient()`, `getRedisSubClient()`

#### STATE MANAGEMENT
- `initialized` flag prevents double initialization

#### TENANT ISOLATION
N/A - Connection layer only

#### BUSINESS LOGIC

**Connection Lifecycle:**
- `initRedis()` - Initialize all three clients
- `closeRedisConnections()` - Uses shared connection manager

#### ERROR HANDLING

**Guard Checks:**
- `getRedis()` throws if not initialized
- `getPub()` throws if not initialized
- `getSub()` throws if not initialized

#### CONCURRENCY
N/A

#### POTENTIAL ISSUES

🟢 **LOW:**
- Thin wrapper, minimal risk
- Relies on shared library for actual connection management
- No visibility into shared library's resilience patterns

---

### 7. secrets.ts (30 lines)

**Purpose:** Load secrets from secrets manager at startup

#### DATABASE OPERATIONS
N/A

#### EXTERNAL SERVICE CALLS

**Secrets Manager:**
- Uses `@tickettoken/shared/utils/secrets-manager`
- Loads secrets from configured backend (Vault, AWS Secrets Manager, etc.)

#### CACHING
N/A

#### STATE MANAGEMENT
N/A

#### TENANT ISOLATION
N/A

#### BUSINESS LOGIC

**Secrets Loaded:**
| Secret | Purpose |
|--------|---------|
| POSTGRES_PASSWORD | Database auth |
| POSTGRES_USER | Database auth |
| POSTGRES_DB | Database name |
| REDIS_PASSWORD | Redis auth |

**Load Path:**
- Loads `.env` from project root first
- Then loads secrets from secrets manager

#### ERROR HANDLING

**Failure Behavior:**
- Logs error message
- Throws `Error('Cannot start service without required secrets')`
- Prevents service startup

#### CONCURRENCY
N/A

#### POTENTIAL ISSUES

✅ **FIXED (Issue #8 - LOW):**
1. Only loads 4 common secrets - ✅ **RESOLVED**
   - Added JWT_SECRET for user authentication
   - Added SERVICE_SECRET for service-to-service auth
   - Added SERVICE_SECRET_PREVIOUS for key rotation
   - All secrets automatically mapped to process.env

🟢 **LOW:**
- Fails fast on missing secrets
- Good error messaging
- Comprehensive logging of loaded secrets

---

### 8. service-auth.ts (550 lines)

**Purpose:** Service-to-service authentication, token management, scope validation, credential rotation

#### DATABASE OPERATIONS
N/A - Stateless auth logic

#### EXTERNAL SERVICE CALLS
N/A - Generates tokens for outbound calls, validates inbound tokens

#### CACHING

**In-Memory Caches:**
| Cache | Purpose | TTL |
|-------|---------|-----|
| `revokedTokens` | Token revocation list | Until token expiry |
| `revokedServices` | Service-level revocation | Manual unrevoke |
| `cachedServiceIdentity` | Service identity | Service lifetime |
| `currentToken` | Current outbound token | Auto-refresh |

**Cleanup:**
- Revocation list cleaned every 5 minutes
- Removes expired revocations

#### STATE MANAGEMENT

**Token States:**
- Valid - Active and not expired
- Expired - Past expiration time
- Revoked - In revocation list
- Expiring - Within refresh buffer (60s default)

**Service States:**
- Active - Normal operation
- Revoked - All tokens from service rejected

#### TENANT ISOLATION
N/A - Service-level auth, not tenant-level

#### BUSINESS LOGIC

**Token Scopes (TM6):**
```typescript
type TokenScope =
  | 'events:read' | 'events:write' | 'events:delete'
  | 'venues:read'
  | 'tickets:read' | 'tickets:write'
  | 'orders:read' | 'orders:write'
  | 'admin:*';
```

**Service-to-Scope Mapping:**
| Service | Scopes |
|---------|--------|
| auth-service | events:read, venues:read, admin:* |
| venue-service | events:read, events:write, venues:read |
| ticket-service | events:read, tickets:read, tickets:write |
| order-service | events:read, tickets:read, orders:read, orders:write |
| payment-service | events:read, orders:read, orders:write |
| notification-service | events:read, tickets:read, orders:read |
| search-service | events:read, venues:read |
| analytics-service | events:read, tickets:read, orders:read |

**Token Lifecycle (TM1, TM2, TM3):**
| Setting | Default | Purpose |
|---------|---------|---------|
| tokenExpirySecs | 300 (5 min) | Short-lived tokens |
| tokenRefreshBufferSecs | 60 | Refresh before expiry |

**Token Format:**
```json
{
  "iss": "service-id",
  "sub": "service-name",
  "iat": 1234567890,
  "exp": 1234568190,
  "nonce": "random-hex",
  "env": "production",
  "scopes": ["events:read", "events:write"],
  "sig": "hmac-sha256-signature"
}
```

**Credential Rotation (SI5):**
- Primary secret: `SERVICE_SECRET`
- Previous secret: `SERVICE_SECRET_PREVIOUS`
- Both valid during rotation window (24 hours default)
- `verifyWithAnyValidCredential()` accepts either secret

**S2S Headers Generated:**
```
X-Service-Token: base64(token)
X-Service-ID: service-id
X-Service-Name: service-name
X-Request-ID: random-hex
User-Agent: service-name/version
traceparent: W3C trace context
tracestate: vendor-specific trace data
```

**Token Revocation (TM8):**
| Function | Purpose |
|----------|---------|
| `revokeToken(hash, reason, expiresAt)` | Revoke specific token |
| `revokeService(serviceId, reason)` | Revoke all tokens from service |
| `unrevokeService(serviceId)` | Restore service access |
| `isTokenRevoked(hash)` | Check token status |
| `isServiceRevoked(serviceId)` | Check service status |

**Service Identity (SI1):**
- Cryptographic instance ID: `{serviceId}-{machineId}-{timestamp}-{random}`
- Public key fingerprint from secret
- Validity period: 30 days default

#### ERROR HANDLING

**Token Verification Errors:**
| Error | Cause |
|-------|-------|
| "Token revoked: {reason}" | Token in revocation list |
| "Service revoked: {reason}" | Service in revocation list |
| "Token expired" | exp < now |
| "Untrusted service" | Issuer not in trusted list |
| "Invalid signature" | HMAC mismatch |
| "Invalid token format" | Parse error |

**Timing-Safe Comparison:**
- Uses `crypto.timingSafeEqual()` for signature comparison
- Prevents timing attacks

#### CONCURRENCY

**Thread Safety:**
- In-memory caches not synchronized
- Single-threaded Node.js - acceptable
- Would need Redis for multi-instance deployments

#### POTENTIAL ISSUES

✅ **FIXED (Issue #1 - CRITICAL):**
1. In-memory revocation list doesn't scale - ✅ **RESOLVED**
   - Replaced with Redis-backed revocation storage
   - Token revocations use Redis TTL for automatic cleanup
   - Service revocations stored in Redis HASH
   - Fallback to in-memory cache if Redis unavailable
   - Works correctly across multiple pods/instances
   - `verifyServiceToken()` and `verifyApiKey()` now async

✅ **FIXED (Issue #6 - MEDIUM):**
2. `shutdownServiceAuth()` must be called on shutdown - ✅ **RESOLVED**
   - Now integrates with centralized shutdown manager
   - Added comment documenting registration pattern
   - Cleanup timers handled via shutdown coordinator

⚠️ **HIGH:**
1. `SERVICE_SECRET` fallback to 'dev-secret' in development
   - Could accidentally use weak secret in production
   - **Recommendation:** Fail if no secret in production (already validates this)

2. Trusted services hardcoded in code
   - `trustedServices` from env, but SERVICE_SCOPES hardcoded
   - **Recommendation:** Load scopes from config

🟡 **MEDIUM:**
1. Token refresh timer uses `setTimeout`
   - If event loop is blocked, refresh could be late
   - **Recommendation:** Monitor token expiry in health checks

🟢 **LOW:**
- Overall excellent implementation
- Addresses multiple audit findings (TM1-TM8, SI1-SI5, OR1-OR2)
- Critical security issue (revocation) now resolved

---

## CROSS-SERVICE DEPENDENCIES

### Config Dependencies Map

```
┌─────────────────────────────────────────────────────────────┐
│                    Event Service Startup                     │
└─────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
   ┌──────────┐        ┌──────────┐        ┌──────────┐
   │ secrets  │        │ env-val  │        │  index   │
   │  .ts     │        │  .ts     │        │   .ts    │
   └────┬─────┘        └────┬─────┘        └────┬─────┘
        │                   │                   │
        │    Secrets        │    Validates      │    Config
        │    loaded         │    all env        │    object
        │                   │                   │
         ─────────────────────────────────────────
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
   ┌──────────┐        ┌──────────┐        ┌──────────┐
   │ database │        │ mongodb  │        │  redis   │
   │   .ts    │        │   .ts    │        │   .ts    │
   └────┬─────┘        └────┬─────┘        └────┬─────┘
        │                   │                   │
        │  PostgreSQL       │  MongoDB          │  Redis
        │  connection       │  connection       │  clients
        │                   │                   │
         ─────────────────────────────────────────
                              │
                              ▼
                    ┌─────────────────┐
                    │ dependencies.ts │
                    │   (DI Container)│
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ service-auth.ts │
                    │  (S2S Tokens)   │
                    └─────────────────┘
```

### External Dependencies

| Config File | External Dependency | Failure Impact |
|-------------|--------------------|--------------------|
| database.ts | PostgreSQL | Service cannot start (after 5 retries) |
| mongodb.ts | MongoDB | Service cannot start (no retry) |
| redis.ts | Redis | Service cannot start |
| secrets.ts | Secrets Manager | Service cannot start |
| service-auth.ts | None (generates tokens) | N/A |

---

## INTEGRATION TEST FILE MAPPING

### Test Coverage Recommendations

| Config File | Test File (Proposed) | Priority | Key Scenarios |
|-------------|---------------------|----------|---------------|
| `database.ts` | `database-resilience.integration.test.ts` | ⚠️ HIGH | Connection retry, deadlock retry, timeout handling, error classification |
| `mongodb.ts` | `mongodb-connection.integration.test.ts` | 🟡 MEDIUM | Connection failure, health check, graceful shutdown |
| `service-auth.ts` | `s2s-authentication.integration.test.ts` | 🔴 CRITICAL | Token generation, token verification, scope validation, revocation, credential rotation |
| `env-validation.ts` | `config-validation.unit.test.ts` | 🟡 MEDIUM | Missing required vars, invalid values, defaults applied |
| `dependencies.ts` | `di-container.unit.test.ts` | 🟢 LOW | All services resolve, singleton behavior |

### Test Scenarios by File

#### database.ts - Integration Tests

**Connection Tests:**
- [ ] Successful connection on first attempt
- [ ] Connection succeeds after transient failure (retry)
- [ ] Connection fails after max retries (5)
- [ ] DNS resolution failure falls back to hostname
- [ ] TLS enforced in production mode

**Deadlock Retry Tests:**
- [ ] Operation succeeds on first attempt (no retry)
- [ ] Operation succeeds after deadlock retry
- [ ] Operation fails after max deadlock retries
- [ ] Exponential backoff timing verified
- [ ] Jitter applied to prevent thundering herd

**Timeout Tests:**
- [ ] Query timeout at 30 seconds
- [ ] Statement timeout enforced per connection
- [ ] Timeout error mapped to 504

**Error Classification Tests:**
- [ ] ECONNREFUSED → 503 DatabaseConnectionError
- [ ] ETIMEDOUT → 503 DatabaseConnectionError
- [ ] Query timeout → 504 DatabaseTimeoutError
- [ ] Other errors pass through unchanged

#### service-auth.ts - Integration Tests

**Token Generation Tests:**
- [ ] Token contains required claims (iss, sub, iat, exp, nonce, scopes)
- [ ] Token signature is valid HMAC-SHA256
- [ ] Token expires at configured time (5 min default)
- [ ] Scopes match service configuration

**Token Verification Tests:**
- [ ] Valid token accepted
- [ ] Expired token rejected
- [ ] Invalid signature rejected
- [ ] Untrusted service rejected
- [ ] Revoked token rejected
- [ ] Revoked service rejected

**Scope Validation Tests:**
- [ ] Service gets configured scopes
- [ ] Admin scope grants all permissions
- [ ] Missing scope returns error with list

**Credential Rotation Tests:**
- [ ] Primary secret used for signing
- [ ] Previous secret accepted during rotation window
- [ ] Rotation status reported correctly

**Token Refresh Tests:**
- [ ] Token auto-refreshes before expiry
- [ ] Refresh buffer (60s) respected
- [ ] getToken() always returns valid token

**Revocation Tests:**
- [ ] Token revocation prevents use
- [ ] Service revocation prevents all tokens
- [ ] Unrevoke restores access
- [ ] Expired revocations cleaned up

#### mongodb.ts - Integration Tests

**Connection Tests:**
- [ ] Successful connection
- [ ] Health check returns true when connected
- [ ] Health check returns false when disconnected
- [ ] getMongoDB() throws when not initialized

**Shutdown Tests:**
- [ ] closeMongoDB() closes connection
- [ ] closeMongoDB() idempotent (can call twice)

---

## REMAINING CONCERNS

### ✅ ALL CRITICAL, HIGH, MEDIUM, AND LOW ISSUES RESOLVED

**All 9 identified issues have been fixed:**

1. ✅ **Redis-backed revocation list** (CRITICAL) - Implemented in `service-auth.ts`
2. ✅ **MongoDB retry logic** (HIGH) - Added to `mongodb.ts`
3. ✅ **Missing services in DI** (HIGH) - Registered in `dependencies.ts`
4. ✅ **Service URLs conditionally required** (MEDIUM) - Updated `env-validation.ts`
5. ✅ **MongoDB URI validation** (MEDIUM) - Added to `env-validation.ts`
6. ✅ **Centralized shutdown manager** (MEDIUM) - Created `shutdown-manager.ts`
7. ✅ **PgBouncer port documented** (LOW) - Documented in `index.ts`
8. ✅ **Secrets loading expanded** (LOW) - Enhanced `secrets.ts`
9. ✅ **Database export refactored** (LOW) - Changed to getter in `database.ts`

### ⚠️ Remaining HIGH Priority (Not in Original Scope)

1. **Trusted Services Hardcoded**
   - File: `service-auth.ts`
   - Issue: SERVICE_SCOPES mapping is hardcoded
   - Impact: Requires code changes to modify service permissions
   - **Recommendation:** Load scopes from configuration/database

2. **Development Secret Fallback**
   - File: `service-auth.ts`
   - Issue: Falls back to 'dev-secret' in non-production
   - Impact: Could accidentally use weak secret
   - **Note:** Already mitigated by validateServiceIdentity() check

---

## TESTING CHECKLIST

### Must Test (P0)
- [ ] Database connection retry logic (5 attempts)
- [ ] Database deadlock retry (3 attempts with backoff)
- [ ] S2S token generation and verification
- [ ] Token scope validation
- [ ] Token revocation enforcement
- [ ] Service revocation enforcement

### Should Test (P1)
- [ ] Database timeout handling (30s)
- [ ] Error classification (503 vs 504)
- [ ] MongoDB health check
- [ ] Credential rotation (both secrets valid)
- [ ] Token auto-refresh
- [ ] Environment validation failures

### Nice to Test (P2)
- [ ] DI container resolution
- [ ] Logging PII redaction
- [ ] DNS resolution fallback
- [ ] Secrets loading
- [ ] Shutdown cleanup

---

## NOTES FOR IMPLEMENTATION

1. **Focus on service-auth.ts first** - Most complex, security-critical
2. **Database tests need real PostgreSQL** - Use testcontainers
3. **MongoDB tests need real MongoDB** - Use testcontainers
4. **Mock secrets manager** - Don't need real Vault for tests
5. **Test token timing** - Use Jest fake timers for refresh/expiry tests

---

**End of Analysis**
