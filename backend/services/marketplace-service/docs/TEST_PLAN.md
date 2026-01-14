---

## Test Categories

| Category | Count | Priority |
|----------|-------|----------|
| Unit Tests | ~2,622 | High |
| Integration Tests | ~195 | High |
| E2E Tests | ~22 | Medium |

---

## Critical Issues to Address

Before testing, these critical issues from audit findings should be verified as resolved:

| Issue | Severity | Impact on Testing |
|-------|----------|-------------------|
| JWT algorithm whitelist (SEC-H1) - must enforce HS256/RS256 only | 🔴 Critical | Auth tests must verify algorithm restriction |
| No hardcoded secret fallback (SEC-1) | 🔴 Critical | Config tests must verify env-only secrets |
| Payment sum validation (PAY-1) - fees must sum correctly | 🔴 Critical | Fee calculation tests are critical path |
| No negative payouts (PAY-H1) | 🔴 Critical | Fee tests must verify non-negative amounts |
| Redis-backed idempotency (IDP-3) | 🔴 High | Webhook dedup tests require Redis mock |
| HMAC signature verification (S2S-1) | 🔴 High | Service-to-service auth tests |
| Timing-safe comparison (S2S-2) | 🔴 High | Security tests for signature verification |
| Rate limiting per-user/per-IP (RL-H1/H2) | 🟠 Medium | Rate limit tests need both key modes |
| Tenant context propagation (MT-H3) | 🟠 Medium | Multi-tenancy isolation tests |
| Circuit breaker states (S2S-3/S2S-5) | 🟠 Medium | External service failure simulation |

---

## File-by-File Test Specifications

### 1. Entry Points

#### `src/index.ts` - Main Bootstrap

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should load dotenv config` | Environment variables loaded |
| 🧪 Unit | `should call startServer` | Bootstrap sequence initiated |
| 🧪 Unit | `should log error on startup failure` | Error logging works |
| 🧪 Unit | `should exit with code 1 on failure` | Process exits correctly |

#### `src/server.ts` - Server Initialization

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `should test database connection on start` | DB connectivity verified |
| 🔗 Integration | `should log database connected on success` | Success path logging |
| 🔗 Integration | `should continue without database on error` | Graceful degradation |
| 🔗 Integration | `should initialize Redis connection` | Redis connectivity |
| 🔗 Integration | `should ping Redis after init` | Redis health check |
| 🔗 Integration | `should continue without Redis on error` | Graceful degradation |
| 🔗 Integration | `should build Fastify app` | App construction |
| 🔗 Integration | `should listen on configured PORT and HOST` | Server binding |
| 🔗 Integration | `should start escrow monitor service` | Background job init |
| 🔗 Integration | `should handle SIGTERM with graceful shutdown` | Clean shutdown |
| 🔗 Integration | `should handle SIGINT with graceful shutdown` | Clean shutdown |
| 🔗 Integration | `should stop escrow monitor on shutdown` | Service cleanup |
| 🔗 Integration | `should destroy database connection on shutdown` | DB cleanup |
| 🔗 Integration | `should close Redis connections on shutdown` | Redis cleanup |

#### `src/app.ts` - Fastify App Factory

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `should create Fastify instance` | App instantiation |
| 🧪 Unit | `should configure logger with LOG_LEVEL from env` | Logger config |
| 🧪 Unit | `should set trustProxy to true` | Proxy trust setting |
| 🧪 Unit | `should generate UUID for request IDs` | Request tracing |
| 🔗 Integration | `should decorate app with database instance` | DB decoration |
| 🔗 Integration | `should register cors plugin` | CORS middleware |
| 🧪 Unit | `should configure cors origin for production` | Prod CORS config |
| 🧪 Unit | `should allow all origins in development` | Dev CORS config |
| 🔗 Integration | `should register helmet plugin` | Security headers |
| 🧪 Unit | `should enable CSP only in production` | CSP config |
| 🔗 Integration | `should connect Redis for rate limiting` | Redis rate limit store |
| 🧪 Unit | `should fall back to memory store when Redis fails` | Rate limit fallback |
| 🧪 Unit | `should use user ID in rate limit key when available` | User-based limiting |
| 🧪 Unit | `should use IP in rate limit key when no user` | IP-based limiting |
| 🧪 Unit | `should return standard 429 error response` | Rate limit response |
| 🔗 Integration | `should register multipart plugin` | File upload support |
| 🔗 Integration | `should set tenant context on each request` | Multi-tenancy |
| 🧪 Unit | `should skip tenant context for public paths` | Public route bypass |
| 🧪 Unit | `should add X-Request-Id header to responses` | Response headers |
| 🔗 Integration | `should register routes with /api/v1/marketplace prefix` | Route mounting |
| 🔗 Integration | `should set custom error handler` | Error handling |

---

### 2. Configuration Files

#### `src/config/index.ts` - Central Config Export

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should export config object` | Module export |
| 🧪 Unit | `should export db instance` | Database export |
| 🧪 Unit | `should export Redis utilities` | Redis export |

#### `src/config/environment.ts` - Environment Configuration

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should parse PORT from environment` | Port parsing |
| 🧪 Unit | `should default PORT to 3003` | Default port |
| 🧪 Unit | `should parse NODE_ENV from environment` | Env mode |
| 🧪 Unit | `should default NODE_ENV to development` | Default env |
| 🧪 Unit | `should parse LOG_LEVEL from environment` | Log level |
| 🧪 Unit | `should parse JWT_SECRET from environment` | JWT config |
| 🧪 Unit | `should throw when JWT_SECRET missing in production` | Security check |
| 🧪 Unit | `should parse DATABASE_URL from environment` | DB config |
| 🧪 Unit | `should parse individual DB params as fallback` | DB fallback |
| 🧪 Unit | `should parse REDIS_URL from environment` | Redis config |
| 🧪 Unit | `should parse STRIPE_SECRET_KEY from environment` | Stripe config |
| 🧪 Unit | `should parse SOLANA_RPC_URL from environment` | Blockchain config |

#### `src/config/database.ts` - Knex Database Instance

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `should create Knex client instance` | Client creation |
| 🔗 Integration | `should use DATABASE_URL when provided` | Connection string mode |
| 🔗 Integration | `should use individual params when no URL` | Param mode |
| 🔗 Integration | `should configure connection pool min/max` | Pool settings |
| 🔗 Integration | `should set timezone to UTC` | Timezone config |
| 🧪 Unit | `should export db as default` | Module export |

#### `src/config/redis.ts` - Redis Connection Manager

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `initRedis should create Redis client` | Client creation |
| 🔗 Integration | `initRedis should configure from REDIS_URL` | URL config |
| 🔗 Integration | `initRedis should configure from individual params` | Param config |
| 🔗 Integration | `getRedis should return initialized client` | Client getter |
| 🔗 Integration | `getRedis should throw when not initialized` | Error handling |
| 🔗 Integration | `getPub should return publisher client` | Pub client |
| 🔗 Integration | `getSub should return subscriber client` | Sub client |
| 🔗 Integration | `closeRedisConnections should close all clients` | Cleanup |
| 🧪 Unit | `cache.get should return cached value` | Cache read |
| 🧪 Unit | `cache.set should store value with TTL` | Cache write |
| 🧪 Unit | `cache.del should remove cached value` | Cache delete |
| 🧪 Unit | `cache.exists should check key existence` | Cache check |

#### `src/config/blockchain.ts` - Solana Configuration

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should parse SOLANA_RPC_URL from environment` | RPC URL |
| 🧪 Unit | `should parse SOLANA_NETWORK from environment` | Network selection |
| 🧪 Unit | `should default to devnet when not specified` | Default network |
| 🧪 Unit | `should parse PROGRAM_ID from environment` | Program address |
| 🧪 Unit | `should parse ESCROW_TIMEOUT_SECONDS from environment` | Timeout config |
| 🧪 Unit | `should default escrow timeout to 300 seconds` | Default timeout |
| 🧪 Unit | `should validate PROGRAM_ID format` | Address validation |

#### `src/config/fees.ts` - Fee Configuration

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should parse PLATFORM_FEE_PERCENTAGE from environment` | Platform fee |
| 🧪 Unit | `should default platform fee to 2.5%` | Default platform fee |
| 🧪 Unit | `should parse DEFAULT_VENUE_FEE_PERCENTAGE from environment` | Venue fee |
| 🧪 Unit | `should default venue fee to 5.0%` | Default venue fee |
| 🧪 Unit | `should validate fee percentages are positive` | Positive validation |
| 🧪 Unit | `should validate fee percentages are below 100` | Max validation |
| 🧪 Unit | `should parse MIN_PAYOUT_AMOUNT from environment` | Min payout |
| 🧪 Unit | `should express fees as decimal (5.0 = 5%)` | Format validation |

#### `src/config/stripe.ts` - Stripe Configuration

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should parse STRIPE_SECRET_KEY from environment` | Secret key |
| 🧪 Unit | `should parse STRIPE_WEBHOOK_SECRET from environment` | Webhook secret |
| 🧪 Unit | `should throw when STRIPE_SECRET_KEY missing in production` | Prod validation |
| 🧪 Unit | `should parse STRIPE_API_VERSION from environment` | API version |
| 🧪 Unit | `should default to latest stable API version` | Default version |

---

### 3. Utilities

#### `src/utils/logger.ts` - Logging Utility

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should create logger with service name` | Logger creation |
| 🧪 Unit | `should use LOG_LEVEL from environment` | Level config |
| 🧪 Unit | `should default to info level` | Default level |
| 🧪 Unit | `should format logs as JSON in production` | Prod format |
| 🧪 Unit | `should format logs as pretty in development` | Dev format |
| 🧪 Unit | `logger.child should create child logger with context` | Child loggers |
| 🧪 Unit | `should include timestamp in log entries` | Timestamps |
| 🧪 Unit | `should include requestId when available` | Request context |

#### `src/utils/errors.ts` - Error Utilities

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `AppError should extend Error` | Inheritance |
| 🧪 Unit | `AppError should set statusCode property` | Status code |
| 🧪 Unit | `AppError should set code property` | Error code |
| 🧪 Unit | `AppError should set isOperational flag` | Operational flag |
| 🧪 Unit | `NotFoundError should set 404 status` | Not found |
| 🧪 Unit | `ValidationError should set 400 status` | Validation |
| 🧪 Unit | `UnauthorizedError should set 401 status` | Unauthorized |
| 🧪 Unit | `ForbiddenError should set 403 status` | Forbidden |
| 🧪 Unit | `ConflictError should set 409 status` | Conflict |

#### `src/utils/circuit-breaker.ts` - Circuit Breaker Implementation

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `createCircuitBreaker should return breaker instance` | Creation |
| 🧪 Unit | `should start in CLOSED state` | Initial state |
| 🧪 Unit | `should transition to OPEN after failure threshold` | Open transition |
| 🧪 Unit | `should transition to HALF_OPEN after reset timeout` | Half-open transition |
| 🧪 Unit | `should transition to CLOSED on successful call in HALF_OPEN` | Recovery |
| 🧪 Unit | `should throw CircuitOpenError when OPEN` | Open behavior |
| 🧪 Unit | `should track failure count` | Failure tracking |
| 🧪 Unit | `should reset failure count on success` | Success reset |
| 🧪 Unit | `getCircuitState should return current state` | State getter |
| 🧪 Unit | `getAllCircuitStates should return all breaker states` | All states |
| 🔗 Integration | `should integrate with external service calls` | Real usage |

#### `src/utils/distributed-lock.ts` - Redis Distributed Locking

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `acquireLock should set lock in Redis` | Lock acquisition |
| 🔗 Integration | `acquireLock should return true when lock acquired` | Success return |
| 🔗 Integration | `acquireLock should return false when lock exists` | Failure return |
| 🔗 Integration | `acquireLock should set TTL on lock` | Lock expiration |
| 🔗 Integration | `releaseLock should remove lock from Redis` | Lock release |
| 🔗 Integration | `releaseLock should only release own lock` | Owner check |
| 🔗 Integration | `withLock should execute function with lock held` | Lock wrapper |
| 🔗 Integration | `withLock should release lock after function completes` | Auto release |
| 🔗 Integration | `withLock should release lock on error` | Error cleanup |
| 🔗 Integration | `withLock should throw when lock cannot be acquired` | Lock failure |

#### `src/utils/retry.ts` - Retry Logic

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `withRetry should execute function once on success` | Success path |
| 🧪 Unit | `withRetry should retry on failure` | Retry behavior |
| 🧪 Unit | `withRetry should respect maxRetries limit` | Retry limit |
| 🧪 Unit | `withRetry should use exponential backoff` | Backoff timing |
| 🧪 Unit | `withRetry should throw after all retries exhausted` | Final failure |
| 🧪 Unit | `withRetry should call onRetry callback` | Retry callback |
| 🧪 Unit | `withRetry should not retry non-retryable errors` | Error filtering |
| 🧪 Unit | `calculateBackoff should return correct delays` | Backoff calculation |

#### `src/utils/validation.ts` - Input Validation Helpers

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `isValidUUID should return true for valid UUIDs` | UUID validation |
| 🧪 Unit | `isValidUUID should return false for invalid UUIDs` | Invalid UUID |
| 🧪 Unit | `isValidSolanaAddress should validate Base58 format` | Solana address |
| 🧪 Unit | `isValidSolanaAddress should reject short addresses` | Length check |
| 🧪 Unit | `isValidSolanaAddress should reject invalid characters` | Character check |
| 🧪 Unit | `sanitizeInput should trim whitespace` | Trim |
| 🧪 Unit | `sanitizeInput should remove control characters` | Sanitize |

#### `src/utils/metrics.ts` - Prometheus Metrics

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `registry should be Prometheus Registry instance` | Registry creation |
| 🧪 Unit | `incrementCounter should increment named counter` | Counter increment |
| 🧪 Unit | `observeHistogram should record histogram value` | Histogram observe |
| 🧪 Unit | `setGauge should set gauge value` | Gauge set |
| 🧪 Unit | `should include default labels` | Default labels |
| 🧪 Unit | `should support custom labels` | Custom labels |
| 🔗 Integration | `should expose metrics endpoint` | Metrics endpoint |

#### `src/utils/response-filter.ts` - Response Filtering

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `filterSensitiveData should remove password fields` | Password filter |
| 🧪 Unit | `filterSensitiveData should remove token fields` | Token filter |
| 🧪 Unit | `filterSensitiveData should remove secret fields` | Secret filter |
| 🧪 Unit | `filterSensitiveData should handle nested objects` | Nested handling |
| 🧪 Unit | `filterSensitiveData should handle arrays` | Array handling |
| 🧪 Unit | `filterSensitiveData should preserve non-sensitive data` | Data preservation |

#### `src/utils/crypto.ts` - Cryptographic Utilities

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `generateHMAC should create SHA256 HMAC` | HMAC generation |
| 🧪 Unit | `verifyHMAC should return true for valid signature` | HMAC verification |
| 🧪 Unit | `verifyHMAC should return false for invalid signature` | Invalid signature |
| 🧪 Unit | `verifyHMAC should use timing-safe comparison` | Timing safety |
| 🧪 Unit | `hashData should create SHA256 hash` | Hashing |
| 🧪 Unit | `generateRandomToken should return hex string` | Token generation |
| 🧪 Unit | `generateRandomToken should respect length param` | Token length |

#### `src/utils/data-lifecycle.ts` - Data Retention

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `calculateRetentionDate should add days to current date` | Date calculation |
| 🧪 Unit | `isExpired should return true for past dates` | Expiration check |
| 🧪 Unit | `isExpired should return false for future dates` | Future dates |
| 🔗 Integration | `cleanupExpiredRecords should delete old records` | Cleanup execution |
| 🔗 Integration | `cleanupExpiredRecords should respect retention policy` | Policy enforcement |

---

### 4. Middleware

#### `src/middleware/auth.middleware.ts` - Authentication Middleware

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `authMiddleware should extract token from Authorization header` | Token extraction |
| 🧪 Unit | `authMiddleware should reject missing Authorization header` | Missing header |
| 🧪 Unit | `authMiddleware should reject malformed Bearer token` | Malformed token |
| 🧪 Unit | `authMiddleware should verify JWT signature` | Signature verification |
| 🧪 Unit | `authMiddleware should reject expired tokens` | Expiration check |
| 🧪 Unit | `authMiddleware should only allow HS256/RS256 algorithms` | Algorithm whitelist (SEC-H1) |
| 🧪 Unit | `authMiddleware should reject tokens with none algorithm` | None algorithm rejection |
| 🧪 Unit | `authMiddleware should attach user to request` | User attachment |
| 🧪 Unit | `authMiddleware should extract tenant_id from token` | Tenant extraction |
| 🧪 Unit | `requireAdmin should reject non-admin users` | Admin check |
| 🧪 Unit | `requireAdmin should allow admin users` | Admin access |
| 🧪 Unit | `requireVenueOwner should check venue ownership` | Venue owner check |
| 🧪 Unit | `verifyListingOwnership should verify user owns listing` | Listing ownership |
| 🔗 Integration | `should integrate with JWT library` | JWT integration |

#### `src/middleware/internal-auth.ts` - Service-to-Service Auth

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should extract X-Service-Signature header` | Header extraction |
| 🧪 Unit | `should extract X-Service-Timestamp header` | Timestamp extraction |
| 🧪 Unit | `should extract X-Service-Name header` | Service name extraction |
| 🧪 Unit | `should reject missing signature header` | Missing signature |
| 🧪 Unit | `should reject missing timestamp header` | Missing timestamp |
| 🧪 Unit | `should reject requests outside replay window (60s)` | Replay prevention |
| 🧪 Unit | `should verify HMAC-SHA256 signature` | Signature verification (S2S-1) |
| 🧪 Unit | `should use timing-safe comparison` | Timing safety (S2S-2) |
| 🧪 Unit | `should validate service identity` | Service validation |
| 🧪 Unit | `should attach service info to request` | Service attachment |
| 🧪 Unit | `should propagate X-Request-ID header` | Request ID propagation (S2S-6) |
| 🧪 Unit | `generateServiceSignature should create valid signature` | Signature generation |

#### `src/middleware/rate-limit.ts` - Rate Limiting Middleware

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should use sliding window algorithm` | Algorithm type |
| 🧪 Unit | `should rate limit per user when authenticated` | Per-user limiting (RL-H1) |
| 🧪 Unit | `should rate limit per IP when unauthenticated` | Per-IP limiting (RL-H2) |
| 🧪 Unit | `should read limits from environment` | Configurable limits (RL-H3) |
| 🧪 Unit | `should support per-endpoint limits` | Endpoint limits (RL-H4) |
| 🧪 Unit | `should apply user tier multipliers` | Tier multipliers |
| 🧪 Unit | `should return 429 when limit exceeded` | Limit exceeded response |
| 🧪 Unit | `should include Retry-After header` | Retry header |
| 🔗 Integration | `should use Redis for distributed limiting` | Redis storage |
| 🧪 Unit | `should gracefully degrade without Redis` | Fallback mode |

#### `src/middleware/purchase-cooldown.ts` - Purchase Rate Limiting

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should enforce global cooldown (5s)` | Global cooldown |
| 🧪 Unit | `should enforce per-event cooldown (10s)` | Event cooldown |
| 🧪 Unit | `should enforce per-ticket cooldown (300s)` | Ticket cooldown (TIME-2) |
| 🧪 Unit | `should prevent rapid purchases` | Rapid purchase prevention (TIME-H3) |
| 🧪 Unit | `should return 429 during cooldown` | Cooldown response |
| 🧪 Unit | `should include cooldown remaining in response` | Time remaining |
| 🔗 Integration | `should use Redis for cooldown tracking` | Redis storage |
| 🧪 Unit | `should fail open when Redis unavailable` | Graceful degradation |

#### `src/middleware/idempotency.ts` - Idempotency Middleware

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should extract Idempotency-Key header` | Key extraction (IDP-1) |
| 🧪 Unit | `should generate key if not provided` | Auto-generation (IDP-2) |
| 🧪 Unit | `should detect duplicate requests` | Duplicate detection |
| 🧪 Unit | `should return cached response for duplicates` | Response replay |
| 🧪 Unit | `should track request status (processing/completed/failed)` | Status tracking |
| 🧪 Unit | `should use 24hr TTL for idempotency records` | TTL enforcement |
| 🧪 Unit | `should increment metrics for replayed requests` | Metrics |
| 🔗 Integration | `should use Redis for idempotency storage` | Redis storage (IDP-3) |
| 🧪 Unit | `should fall back to memory when Redis unavailable` | Memory fallback |

#### `src/middleware/request-id.ts` - Request ID Middleware

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should extract X-Request-ID from incoming headers` | ID extraction |
| 🧪 Unit | `should generate UUID when no header present` | ID generation |
| 🧪 Unit | `should store ID in AsyncLocalStorage` | Context storage |
| 🧪 Unit | `getCurrentRequestId should return current ID` | ID retrieval |
| 🧪 Unit | `should propagate ID to downstream services` | ID propagation (S2S-6) |
| 🧪 Unit | `should support correlation ID` | Correlation support (LOG-3) |

#### `src/middleware/request-logger.ts` - Request Logging Middleware

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should log request method and URL` | Basic logging |
| 🧪 Unit | `should log request duration` | Duration logging (LOG-H3) |
| 🧪 Unit | `should log response status code` | Status logging |
| 🧪 Unit | `should use structured JSON format` | JSON format (LOG-H1) |
| 🧪 Unit | `should correlate request/response logs` | Correlation (LOG-H2) |
| 🧪 Unit | `should sanitize PII from logs` | PII sanitization (LOG-H4) |
| 🧪 Unit | `should redact Authorization header` | Header redaction |
| 🧪 Unit | `should redact sensitive body fields` | Body redaction |

#### `src/middleware/tenant-context.ts` - Multi-Tenancy Middleware

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should extract tenant ID from JWT` | JWT extraction (MT-H1) |
| 🧪 Unit | `should extract tenant ID from X-Tenant-ID header` | Header extraction |
| 🧪 Unit | `should extract tenant ID from query param` | Query extraction |
| 🧪 Unit | `should validate tenant exists in database` | Tenant validation (MT-H2) |
| 🧪 Unit | `should store tenant in AsyncLocalStorage` | Context storage (MT-H3) |
| 🧪 Unit | `should enrich logs with tenant ID` | Log enrichment (MT-H4) |
| 🧪 Unit | `getTenantId should return current tenant` | Tenant retrieval |
| 🧪 Unit | `scopeQueryToTenant should add tenant filter` | Query scoping (MT-H5) |
| 🔗 Integration | `should cache tenant lookups (5min TTL)` | Tenant caching |

#### `src/middleware/wallet.middleware.ts` - Wallet Validation Middleware

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should extract wallet address from request` | Address extraction |
| 🧪 Unit | `should validate Solana address format` | Format validation |
| 🧪 Unit | `should reject invalid addresses` | Invalid rejection |
| 🧪 Unit | `should verify wallet signature when provided` | Signature verification |
| 🧪 Unit | `should attach wallet info to request` | Info attachment |
| 🔗 Integration | `should fetch wallet info from service` | Service integration |

#### `src/middleware/venue-access.middleware.ts` - Venue Access Control

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should check venue_access table for user` | Access lookup |
| 🧪 Unit | `should attach venue role to request` | Role attachment |
| 🧪 Unit | `should allow owner access` | Owner access |
| 🧪 Unit | `should allow manager access` | Manager access |
| 🧪 Unit | `should allow admin access` | Admin access |
| 🧪 Unit | `should reject unauthorized users` | Unauthorized rejection |
| 🔗 Integration | `should query database for access` | DB integration |

#### `src/middleware/cache.middleware.ts` - Response Caching

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should only cache GET requests` | Method filter |
| 🧪 Unit | `should generate cache key from URL and params` | Key generation |
| 🧪 Unit | `should return cached response when available` | Cache hit |
| 🧪 Unit | `should cache response with configurable TTL` | TTL config |
| 🧪 Unit | `should skip caching for authenticated requests` | Auth bypass |
| 🔗 Integration | `should use Redis for cache storage` | Redis storage |

#### `src/middleware/error.middleware.ts` - Error Handling

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should handle AppError instances` | AppError handling |
| 🧪 Unit | `should handle Joi validation errors` | Joi errors |
| 🧪 Unit | `should handle unknown errors as 500` | Unknown errors |
| 🧪 Unit | `should log error details` | Error logging |
| 🧪 Unit | `should not expose stack traces in production` | Stack hiding |
| 🧪 Unit | `should include request ID in error response` | Request ID |

#### `src/middleware/validation.middleware.ts` - Request Validation

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should validate request body against schema` | Body validation |
| 🧪 Unit | `should validate query params against schema` | Query validation |
| 🧪 Unit | `should validate path params against schema` | Params validation |
| 🧪 Unit | `should return 400 for validation failures` | Error response |
| 🧪 Unit | `should include field-level errors` | Field errors |
| 🧪 Unit | `should strip unknown fields` | Unknown stripping |
| 🧪 Unit | `should coerce types when possible` | Type coercion |

---

### 5. Models

#### `src/models/listing.model.ts` - Listing Data Model

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `create should generate UUID for id` | ID generation |
| 🧪 Unit | `create should set created_at timestamp` | Timestamp |
| 🧪 Unit | `create should set status to active` | Default status |
| 🧪 Unit | `findById should return listing or null` | Single lookup |
| 🧪 Unit | `findByTicketId should return listing for ticket` | Ticket lookup |
| 🧪 Unit | `findBySellerId should return user's listings` | Seller lookup |
| 🧪 Unit | `findByEventId should return event listings` | Event lookup |
| 🧪 Unit | `update should set updated_at timestamp` | Update timestamp |
| 🧪 Unit | `updateStatus should change listing status` | Status update |
| 🧪 Unit | `updatePrice should update price field` | Price update |
| 🧪 Unit | `markAsSold should set sold_at and buyer_id` | Mark sold |
| 🧪 Unit | `search should apply filters` | Search filters |
| 🧪 Unit | `search should handle pagination` | Pagination |
| 🧪 Unit | `search should apply sorting` | Sorting |
| 🔗 Integration | `should execute queries against database` | DB integration |

#### `src/models/transfer.model.ts` - Transfer Data Model

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `create should generate UUID for id` | ID generation |
| 🧪 Unit | `create should set initiated_at timestamp` | Timestamp |
| 🧪 Unit | `create should set status to initiated` | Default status |
| 🧪 Unit | `findById should return transfer or null` | Single lookup |
| 🧪 Unit | `findByListingId should return transfer for listing` | Listing lookup |
| 🧪 Unit | `findByBuyerId should return user's purchases` | Buyer lookup |
| 🧪 Unit | `findBySellerId should return user's sales` | Seller lookup |
| 🧪 Unit | `findByStripePaymentIntentId should return transfer` | Stripe lookup |
| 🧪 Unit | `updateStatus should change transfer status` | Status update |
| 🧪 Unit | `markCompleted should set completed_at` | Mark completed |
| 🧪 Unit | `markFailed should set failed_at and reason` | Mark failed |
| 🧪 Unit | `setBlockchainSignature should store signature` | Signature storage |
| 🔗 Integration | `should execute queries against database` | DB integration |

#### `src/models/dispute.model.ts` - Dispute Data Model

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `create should generate UUID for id` | ID generation |
| 🧪 Unit | `create should set filed_at timestamp` | Timestamp |
| 🧪 Unit | `create should set status to open` | Default status |
| 🧪 Unit | `create should determine respondent` | Respondent logic |
| 🧪 Unit | `findById should return dispute or null` | Single lookup |
| 🧪 Unit | `findByTransferId should return transfer disputes` | Transfer lookup |
| 🧪 Unit | `findByUserId should return user's disputes` | User lookup |
| 🧪 Unit | `updateStatus should change dispute status` | Status update |
| 🧪 Unit | `addEvidence should insert evidence record` | Evidence addition |
| 🧪 Unit | `resolve should set resolution and resolved_at` | Resolution |
| 🔗 Integration | `should execute queries against database` | DB integration |

#### `src/models/fee.model.ts` - Fee Data Model

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `create should generate UUID for id` | ID generation |
| 🧪 Unit | `create should calculate all fee fields` | Fee calculation |
| 🧪 Unit | `findByTransferId should return fees for transfer` | Transfer lookup |
| 🧪 Unit | `findByVenueId should return venue fees` | Venue lookup |
| 🧪 Unit | `markPlatformFeeCollected should update flag` | Collection flag |
| 🧪 Unit | `markVenueFeePaid should update flag` | Payment flag |
| 🧪 Unit | `aggregateByVenue should sum venue fees` | Aggregation |
| 🧪 Unit | `aggregateByDateRange should sum fees by date` | Date aggregation |
| 🔗 Integration | `should execute queries against database` | DB integration |

#### `src/models/venue-settings.model.ts` - Venue Settings Model

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `findByVenueId should return settings or null` | Settings lookup |
| 🧪 Unit | `create should insert new settings` | Settings creation |
| 🧪 Unit | `update should modify settings` | Settings update |
| 🧪 Unit | `getMaxMarkup should return max_resale_multiplier` | Markup getter |
| 🧪 Unit | `getRoyaltyPercentage should return royalty_percentage` | Royalty getter |
| 🧪 Unit | `getRoyaltyWallet should return royalty_wallet_address` | Wallet getter |
| 🔗 Integration | `should execute queries against database` | DB integration |
| 🔗 Integration | `should cache settings with TTL` | Cache integration |

#### `src/models/blacklist.model.ts` - Blacklist Data Model

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `isUserBlacklisted should return true for banned user` | User check |
| 🧪 Unit | `isWalletBlacklisted should return true for banned wallet` | Wallet check |
| 🧪 Unit | `isBlacklisted should check both user and wallet` | Combined check |
| 🧪 Unit | `should respect is_active flag` | Active flag |
| 🧪 Unit | `should check expires_at for temporary bans` | Expiration check |
| 🧪 Unit | `addToBlacklist should insert new record` | Add entry |
| 🧪 Unit | `removeFromBlacklist should set is_active false` | Remove entry |
| 🔗 Integration | `should execute queries against database` | DB integration |

#### `src/models/anti-bot.model.ts` - Anti-Bot Data Model

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `logActivity should insert activity record` | Activity logging |
| 🧪 Unit | `logViolation should insert violation record` | Violation logging |
| 🧪 Unit | `getRecentActivities should return user activities` | Activity retrieval |
| 🧪 Unit | `getViolationCount should count user violations` | Violation count |
| 🧪 Unit | `getActivityCountInWindow should count by time window` | Windowed count |
| 🔗 Integration | `should execute queries against database` | DB integration |

#### `src/models/price-history.model.ts` - Price History Model

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `create should record price change` | Change recording |
| 🧪 Unit | `create should calculate price_change field` | Change calculation |
| 🧪 Unit | `findByListingId should return price history` | Listing history |
| 🧪 Unit | `findByEventId should return event price history` | Event history |
| 🧪 Unit | `getAveragePrice should calculate mean price` | Average calculation |
| 🔗 Integration | `should execute queries against database` | DB integration |

#### `src/models/tax-reporting.model.ts` - Tax Reporting Model

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `recordSale should insert tax transaction` | Sale recording |
| 🧪 Unit | `recordSale should calculate tax_year` | Year calculation |
| 🧪 Unit | `findBySellerId should return user transactions` | User lookup |
| 🧪 Unit | `findByYear should filter by tax year` | Year filter |
| 🧪 Unit | `aggregateByYear should sum by year` | Year aggregation |
| 🧪 Unit | `isReportable should check $600 threshold` | Threshold check |
| 🔗 Integration | `should execute queries against database` | DB integration |

---

### 6. Services

#### `src/services/listing.service.ts` - Listing Business Logic

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `createListing should acquire distributed lock` | Lock acquisition |
| 🧪 Unit | `createListing should validate user is not blacklisted` | Blacklist check |
| 🧪 Unit | `createListing should validate ticket ownership` | Ownership check |
| 🧪 Unit | `createListing should validate price within venue limits` | Price validation |
| 🧪 Unit | `createListing should validate markup limits` | Markup validation |
| 🧪 Unit | `createListing should publish listing.created event` | Event publishing |
| 🧪 Unit | `updateListingPrice should acquire distributed lock` | Lock acquisition |
| 🧪 Unit | `updateListingPrice should validate new price` | Price validation |
| 🧪 Unit | `updateListingPrice should record price history` | History recording |
| 🧪 Unit | `updateListingPrice should publish price.changed event` | Event publishing |
| 🧪 Unit | `cancelListing should acquire distributed lock` | Lock acquisition |
| 🧪 Unit | `cancelListing should only allow owner to cancel` | Owner check |
| 🧪 Unit | `cancelListing should set status to cancelled` | Status update |
| 🧪 Unit | `markAsSold should update listing and transfer` | Mark sold |
| 🧪 Unit | `searchListings should apply all filters` | Search filters |
| 🧪 Unit | `searchListings should use cache when available` | Cache usage |
| 🔗 Integration | `should integrate with database` | DB integration |
| 🔗 Integration | `should integrate with Redis for locks` | Lock integration |

#### `src/services/transfer.service.ts` - Transfer Business Logic

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `initiateTransfer should create transfer record` | Transfer creation |
| 🧪 Unit | `initiateTransfer should validate listing is active` | Status check |
| 🧪 Unit | `initiateTransfer should validate buyer is not seller` | Self-buy check |
| 🧪 Unit | `initiateTransfer should check buyer is not blacklisted` | Blacklist check |
| 🧪 Unit | `initiateFiatTransfer should store Stripe payment intent ID` | Stripe storage |
| 🧪 Unit | `completeTransfer should mark transfer completed` | Completion |
| 🧪 Unit | `completeTransfer should mark listing as sold` | Listing update |
| 🧪 Unit | `completeTransfer should sync blockchain ownership` | Blockchain sync |
| 🧪 Unit | `completeFiatTransfer should execute Stripe transfers` | Stripe transfers |
| 🧪 Unit | `completeFiatTransfer should handle venue royalty split` | Royalty split |
| 🧪 Unit | `completeFiatTransfer should use source_transaction` | Atomic transfers |
| 🧪 Unit | `failTransfer should mark transfer failed` | Failure handling |
| 🧪 Unit | `failTransfer should record failure reason` | Reason recording |
| 🧪 Unit | `should handle ENABLE_VENUE_ROYALTY_SPLIT flag` | Feature flag |
| 🔗 Integration | `should integrate with blockchain service` | Blockchain integration |
| 🔗 Integration | `should integrate with Stripe service` | Stripe integration |

#### `src/services/blockchain.service.ts` - Solana Blockchain Integration

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `transferNFT should build Anchor transaction` | TX building |
| 🧪 Unit | `transferNFT should use correct program address` | Program address |
| 🧪 Unit | `transferNFT should derive PDAs correctly` | PDA derivation |
| 🧪 Unit | `transferNFT should implement retry with exponential backoff` | Retry logic |
| 🧪 Unit | `createEscrow should create escrow account` | Escrow creation |
| 🧪 Unit | `releaseEscrow should release funds to seller` | Escrow release |
| 🧪 Unit | `refundEscrow should return funds to buyer` | Escrow refund |
| 🧪 Unit | `getWalletBalance should return SOL and USDC balance` | Balance check |
| 🧪 Unit | `validateTransaction should verify TX on chain` | TX validation |
| 🔗 Integration | `should connect to Solana RPC` | RPC connection |
| 🔗 Integration | `should use circuit breaker for RPC calls` | Circuit breaker |

#### `src/services/stripe-payment.service.ts` - Stripe Payment Integration

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `createPaymentIntent should calculate correct amount` | Amount calculation |
| 🧪 Unit | `createPaymentIntent should calculate application fee` | Fee calculation |
| 🧪 Unit | `createPaymentIntent should use destination charges` | Destination charges |
| 🧪 Unit | `createPaymentIntent should use separate charges when flag enabled` | Separate charges |
| 🧪 Unit | `createTransfer should use source_transaction` | Atomic transfers |
| 🧪 Unit | `createTransfer should transfer to seller` | Seller transfer |
| 🧪 Unit | `createTransfer should transfer to venue` | Venue transfer |
| 🧪 Unit | `createRefund should process full refund` | Full refund |
| 🧪 Unit | `createRefund should process partial refund` | Partial refund |
| 🧪 Unit | `verifyWebhookSignature should validate Stripe signature` | Signature verification |
| 🧪 Unit | `verifyWebhookSignature should reject invalid signatures` | Invalid signature |
| 🧪 Unit | `getSellerStripeAccountId should lookup Connect account` | Account lookup |
| 🔗 Integration | `should integrate with Stripe API` | Stripe integration |

#### `src/services/fee.service.ts` - Fee Calculation Service

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `calculateFees should use integer cents` | Integer math |
| 🧪 Unit | `calculateFees should calculate platform fee correctly` | Platform fee |
| 🧪 Unit | `calculateFees should calculate venue fee correctly` | Venue fee |
| 🧪 Unit | `calculateFees should calculate seller proceeds correctly` | Seller proceeds |
| 🧪 Unit | `calculateFees should ensure sum equals sale price` | Sum validation (PAY-1) |
| 🧪 Unit | `calculateFees should never produce negative amounts` | Non-negative (PAY-H1) |
| 🧪 Unit | `calculateFees should use percentOfCents utility` | Utility usage |
| 🧪 Unit | `getVenueRoyaltyData should fetch from database` | DB lookup |
| 🧪 Unit | `getVenueRoyaltyData should use cached data` | Cache usage |
| 🧪 Unit | `validatePaymentSplit should verify all amounts` | Split validation |
| 🔗 Integration | `should integrate with venue settings` | Settings integration |

#### `src/services/refund.service.ts` - Refund Processing Service

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `processRefund should validate transfer exists` | Transfer validation |
| 🧪 Unit | `processRefund should validate transfer is completed` | Status validation |
| 🧪 Unit | `processRefund should create refund record` | Record creation (REF-1) |
| 🧪 Unit | `processRefund should call payment service` | Payment call |
| 🧪 Unit | `processRefund should update transfer status` | Status update |
| 🧪 Unit | `processBulkRefund should handle event cancellation` | Bulk refund (REF-2) |
| 🧪 Unit | `processBulkRefund should refund all event transfers` | All transfers |
| 🧪 Unit | `should create audit trail for refunds` | Audit trail (REF-3) |
| 🧪 Unit | `should track refund status` | Status tracking |
| 🧪 Unit | `should use circuit breaker for payment calls` | Circuit breaker |
| 🔗 Integration | `should integrate with Stripe for refunds` | Stripe integration |

#### `src/services/dispute.service.ts` - Dispute Management Service

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `createDispute should validate transfer exists` | Transfer validation |
| 🧪 Unit | `createDispute should determine respondent` | Respondent logic |
| 🧪 Unit | `createDispute should create dispute record` | Record creation |
| 🧪 Unit | `addEvidence should validate dispute is open` | Status check |
| 🧪 Unit | `addEvidence should validate user is party to dispute` | Party validation |
| 🧪 Unit | `addEvidence should insert evidence record` | Evidence insertion |
| 🧪 Unit | `getUserDisputes should return user's disputes` | User lookup |
| 🧪 Unit | `resolveDispute should update status and resolution` | Resolution |
| 🔗 Integration | `should integrate with database` | DB integration |

#### `src/services/anti-bot.service.ts` - Bot Detection Service

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `checkVelocity should count recent purchases` | Purchase velocity |
| 🧪 Unit | `checkVelocity should count recent listings` | Listing velocity |
| 🧪 Unit | `checkVelocity should flag exceeding threshold` | Threshold check |
| 🧪 Unit | `calculateBotScore should analyze user patterns` | Score calculation |
| 🧪 Unit | `calculateBotScore should weight different factors` | Factor weighting |
| 🧪 Unit | `checkRateLimit should enforce per-action limits` | Rate limiting |
| 🧪 Unit | `blockUser should add to blacklist` | User blocking |
| 🧪 Unit | `isUserBlocked should check blacklist` | Block check |
| 🔗 Integration | `should integrate with database` | DB integration |

#### `src/services/seller-onboarding.service.ts` - Stripe Connect Onboarding

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `createConnectAccount should create Express account` | Account creation |
| 🧪 Unit | `createConnectAccountAndOnboardingLink should return URL` | Link generation |
| 🧪 Unit | `getAccountStatus should return account details` | Status retrieval |
| 🧪 Unit | `getAccountStatus should return requirements` | Requirements check |
| 🧪 Unit | `refreshOnboardingLink should generate new link` | Link refresh |
| 🧪 Unit | `canAcceptFiatPayments should check capabilities` | Capability check |
| 🧪 Unit | `handleAccountUpdated should process webhook` | Webhook handling |
| 🔗 Integration | `should integrate with Stripe Connect API` | Stripe integration |

#### `src/services/notification.service.ts` - Notification Dispatch

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `notifyListingSold should send to notification service` | Sold notification |
| 🧪 Unit | `notifyPriceChange should send to notification service` | Price notification |
| 🧪 Unit | `notifyDisputeUpdate should send to notification service` | Dispute notification |
| 🧪 Unit | `notifyTransferComplete should send to notification service` | Transfer notification |
| 🧪 Unit | `notifyListingExpiring should send to notification service` | Expiring notification |
| 🧪 Unit | `should not throw on notification failure` | Non-blocking |
| 🧪 Unit | `should log notification errors` | Error logging |
| 🔗 Integration | `should integrate with notification service` | Service integration |

#### `src/services/escrow-monitor.service.ts` - Escrow Monitoring

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `start should begin monitoring interval` | Start monitoring |
| 🧪 Unit | `stop should clear monitoring interval` | Stop monitoring |
| 🧪 Unit | `checkTimedOutEscrows should find expired escrows` | Timeout detection |
| 🧪 Unit | `checkTimedOutEscrows should use 5min timeout` | Timeout value |
| 🧪 Unit | `processTimedOutEscrow should initiate refund` | Auto refund |
| 🧪 Unit | `getMetrics should return escrow statistics` | Metrics collection |
| 🧪 Unit | `resolveManually should allow admin resolution` | Manual resolution |
| 🔗 Integration | `should integrate with blockchain service` | Blockchain integration |

#### `src/services/tax-reporting.service.ts` - Tax Report Generation

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `recordSale should create tax transaction` | Sale recording |
| 🧪 Unit | `getYearlyReport should aggregate by year` | Year report |
| 🧪 Unit | `generate1099K should check $600 threshold` | Threshold check |
| 🧪 Unit | `generate1099K should format 1099-K data` | Format generation |
| 🧪 Unit | `getReportableTransactions should filter by year` | Transaction filter |
| 🧪 Unit | `isReportable should return true above threshold` | Reportable check |
| 🔗 Integration | `should integrate with database` | DB integration |

#### `src/services/search.service.ts` - Search Service

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `searchListings should apply filters` | Filter application |
| 🧪 Unit | `searchListings should use cache` | Cache usage |
| 🧪 Unit | `searchListings should set cache TTL` | Cache TTL |
| 🧪 Unit | `getTrendingListings should return popular listings` | Trending logic |
| 🧪 Unit | `getRecommendations should use purchase history` | Recommendations |
| 🔗 Integration | `should integrate with database` | DB integration |
| 🔗 Integration | `should integrate with Redis cache` | Cache integration |

#### `src/services/wallet.service.ts` - Wallet Service

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `getWalletInfo should fetch from wallet service` | Info fetch |
| 🧪 Unit | `getWalletInfo should use circuit breaker` | Circuit breaker (S2S-3/S2S-5) |
| 🧪 Unit | `getWalletInfo should use HMAC auth` | HMAC auth |
| 🧪 Unit | `getWalletInfo should respect timeout` | Timeout (GD-2) |
| 🧪 Unit | `verifyOwnership should validate wallet owns ticket` | Ownership check |
| 🧪 Unit | `getBalance should return wallet balance` | Balance fetch |
| 🧪 Unit | `validateTransaction should verify TX signature` | TX validation |
| 🔗 Integration | `should integrate with wallet service` | Service integration |

#### `src/services/fee-distribution.service.ts` - Fee Distribution

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `calculateFees should compute platform fee (2.5%)` | Platform calc |
| 🧪 Unit | `calculateFees should compute venue fee (5%)` | Venue calc |
| 🧪 Unit | `recordFees should insert fee record` | Fee recording |
| 🧪 Unit | `distributeFees should mark as collected` | Distribution |
| 🧪 Unit | `getFeeStatistics should aggregate fees` | Statistics |
| 🧪 Unit | `reconcileFees should verify accuracy` | Reconciliation |
| 🧪 Unit | `publishAnalyticsEvent should emit event` | Analytics |
| 🔗 Integration | `should integrate with database` | DB integration |

#### `src/services/validation.service.ts` - Validation Service

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `validateListingCreation should check price` | Price validation |
| 🧪 Unit | `validateListingCreation should check timing` | Timing validation |
| 🧪 Unit | `validateListingCreation should check user limits` | Limit validation |
| 🧪 Unit | `validateTransfer should check listing status` | Status check |
| 🧪 Unit | `validateTransfer should check buyer eligibility` | Buyer check |
| 🧪 Unit | `validateWalletAddress should verify format` | Format check |
| 🧪 Unit | `validateWalletAddress should check blacklist` | Blacklist check |
| 🔗 Integration | `should integrate with venue settings` | Settings integration |

#### `src/services/venue-rules.service.ts` - Venue Rules Service

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `validateMarkup should check against max` | Max markup check |
| 🧪 Unit | `validateMarkup should check against min` | Min markup check |
| 🧪 Unit | `requiresApproval should check venue setting` | Approval check |
| 🧪 Unit | `getRestrictions should return venue restrictions` | Restriction fetch |
| 🔗 Integration | `should integrate with venue settings` | Settings integration |

#### `src/services/ticket-lookup.service.ts` - Ticket Lookup Service

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `getTicketInfo should fetch from event service` | Info fetch |
| 🧪 Unit | `getTicketInfo should use cache (5min TTL)` | Cache usage |
| 🧪 Unit | `getEventInfo should fetch event details` | Event fetch |
| 🧪 Unit | `validateEligibility should check transferability` | Eligibility check |
| 🧪 Unit | `getSuggestedPriceRange should return range` | Price range |
| 🔗 Integration | `should integrate with event service` | Service integration |

---

### 7. Controllers

#### `src/controllers/listing.controller.ts` - Listing Controller

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `createListing should extract body and user info` | Request parsing |
| 🧪 Unit | `createListing should call listingService.createListing` | Service call |
| 🧪 Unit | `createListing should log audit action` | Audit logging |
| 🧪 Unit | `createListing should return 201 with listing` | Success response |
| 🧪 Unit | `updateListingPrice should get current listing` | Current fetch |
| 🧪 Unit | `updateListingPrice should return 404 when not found` | Not found |
| 🧪 Unit | `updateListingPrice should log price change audit` | Audit logging |
| 🧪 Unit | `updateListingPrice should log failed audit on error` | Error audit |
| 🧪 Unit | `cancelListing should call listingService.cancelListing` | Service call |
| 🧪 Unit | `cancelListing should return 404 when not found` | Not found |
| 🧪 Unit | `cancelListing should log cancel audit` | Audit logging |
| 🧪 Unit | `getListing should return listing data` | Get response |
| 🧪 Unit | `getMyListings should filter by seller` | Seller filter |
| 🧪 Unit | `getMyListings should apply pagination` | Pagination |
| 🧪 Unit | `getEventListings should filter by event` | Event filter |
| 🔗 Integration | `should integrate with listing service` | Service integration |

#### `src/controllers/transfer.controller.ts` - Transfer Controller

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `initiateTransfer should extract buyer info` | Request parsing |
| 🧪 Unit | `initiateTransfer should call transferService` | Service call |
| 🧪 Unit | `initiateTransfer should return transfer with expiry` | Response format |
| 🧪 Unit | `confirmTransfer should extract signature` | Signature extraction |
| 🧪 Unit | `confirmTransfer should call completeTransfer` | Service call |
| 🧪 Unit | `getTransfer should return transfer data` | Get response |
| 🧪 Unit | `getMyPurchases should filter by buyer` | Buyer filter |
| 🧪 Unit | `getMySales should filter by seller` | Seller filter |
| 🧪 Unit | `purchaseListing should initiate purchase flow` | Purchase flow |
| 🧪 Unit | `directTransfer should handle direct transfers` | Direct transfer |
| 🧪 Unit | `cancelTransfer should cancel pending transfer` | Cancellation |
| 🔗 Integration | `should integrate with transfer service` | Service integration |

#### `src/controllers/buy.controller.ts` - Purchase Controller

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `buyListing should extract listing ID` | ID extraction |
| 🧪 Unit | `buyListing should acquire distributed lock` | Lock acquisition |
| 🧪 Unit | `buyListing should validate listing status` | Status validation |
| 🧪 Unit | `buyListing should return 404 when not found` | Not found |
| 🧪 Unit | `buyListing should return 409 when unavailable` | Conflict |
| 🧪 Unit | `buyListing should return 400 for self-purchase` | Self-buy check |
| 🧪 Unit | `buyListing should validate offered price` | Price validation |
| 🧪 Unit | `buyListing should route to crypto flow` | Crypto routing |
| 🧪 Unit | `buyListing should route to fiat flow` | Fiat routing |
| 🧪 Unit | `buyListing should handle insufficient funds` | Insufficient funds |
| 🧪 Unit | `buyListing should handle blockchain errors` | Blockchain errors |
| 🧪 Unit | `buyListing should return 409 when locked` | Lock conflict |
| 🧪 Unit | `buyWithRetry should retry on serialization error` | Retry logic |
| 🧪 Unit | `buyWithRetry should use exponential backoff` | Backoff |
| 🧪 Unit | `processCryptoPurchase should execute blockchain transfer` | Crypto flow |
| 🧪 Unit | `processCryptoPurchase should emit ticket.sold event` | Event emission |
| 🧪 Unit | `processFiatPurchase should check seller account` | Account check |
| 🧪 Unit | `processFiatPurchase should create PaymentIntent` | Intent creation |
| 🧪 Unit | `processFiatPurchase should return clientSecret` | Client secret |
| 🔗 Integration | `should integrate with services` | Service integration |

#### `src/controllers/webhook.controller.ts` - Webhook Controller

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `handleStripeWebhook should check signature header` | Header check |
| 🧪 Unit | `handleStripeWebhook should return 400 without signature` | Missing signature |
| 🧪 Unit | `handleStripeWebhook should return 500 without secret` | Missing secret |
| 🧪 Unit | `handleStripeWebhook should verify webhook signature` | Signature verification |
| 🧪 Unit | `handleStripeWebhook should return 400 for invalid signature` | Invalid signature |
| 🧪 Unit | `handleStripeWebhook should check idempotency` | Idempotency check |
| 🧪 Unit | `handleStripeWebhook should return already_processed for duplicates` | Duplicate handling |
| 🧪 Unit | `handleStripeWebhook should handle payment_intent.succeeded` | Success event |
| 🧪 Unit | `handleStripeWebhook should return 404 when transfer not found` | Not found |
| 🧪 Unit | `handleStripeWebhook should skip completed transfers` | Already completed |
| 🧪 Unit | `handleStripeWebhook should call completeFiatTransfer` | Transfer completion |
| 🧪 Unit | `handleStripeWebhook should mark event processed` | Event marking |
| 🧪 Unit | `handleStripeWebhook should handle unhandled events` | Unhandled events |
| 🧪 Unit | `handlePaymentCompleted should verify internal header` | Internal auth |
| 🧪 Unit | `handlePaymentCompleted should return 403 for invalid service` | Invalid service |
| 🔗 Integration | `should integrate with Stripe` | Stripe integration |
| 🔗 Integration | `should integrate with Redis for idempotency` | Redis integration |

#### `src/controllers/dispute.controller.ts` - Dispute Controller

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `create should validate user ID` | User validation |
| 🧪 Unit | `create should call disputeService.createDispute` | Service call |
| 🧪 Unit | `create should return 201 with dispute` | Success response |
| 🧪 Unit | `getById should return dispute data` | Get response |
| 🧪 Unit | `getById should return 404 when not found` | Not found |
| 🧪 Unit | `addEvidence should validate user ID` | User validation |
| 🧪 Unit | `addEvidence should call disputeService.addEvidence` | Service call |
| 🧪 Unit | `getMyDisputes should call getUserDisputes` | Service call |
| 🔗 Integration | `should integrate with dispute service` | Service integration |

#### `src/controllers/admin.controller.ts` - Admin Controller

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `getStats should query listing statistics` | Stats query |
| 🧪 Unit | `getStats should return aggregated data` | Aggregation |
| 🧪 Unit | `getDisputes should filter by status` | Status filter |
| 🧪 Unit | `getDisputes should order by created_at` | Ordering |
| 🧪 Unit | `resolveDispute should update dispute status` | Status update |
| 🧪 Unit | `resolveDispute should set resolved_by` | Resolver tracking |
| 🧪 Unit | `getFlaggedUsers should query violations` | Violation query |
| 🧪 Unit | `getFlaggedUsers should aggregate by user` | User aggregation |
| 🧪 Unit | `banUser should insert blacklist record` | Blacklist insert |
| 🧪 Unit | `banUser should set expiration for temp bans` | Temp ban expiry |
| 🔗 Integration | `should integrate with database` | DB integration |

#### `src/controllers/tax.controller.ts` - Tax Controller

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `getYearlyReport should validate user ID` | User validation |
| 🧪 Unit | `getYearlyReport should parse year param` | Year parsing |
| 🧪 Unit | `getYearlyReport should return 404 when empty` | Not found |
| 🧪 Unit | `generate1099K should validate user ID` | User validation |
| 🧪 Unit | `generate1099K should return 404 when not eligible` | Not eligible |
| 🧪 Unit | `getTransactions should filter by year` | Year filter |
| 🔗 Integration | `should integrate with tax service` | Service integration |

#### `src/controllers/search.controller.ts` - Search Controller

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `searchListings should extract query params` | Param extraction |
| 🧪 Unit | `searchListings should apply defaults` | Default values |
| 🧪 Unit | `searchListings should return paginated results` | Pagination |
| 🧪 Unit | `getPriceRange should return price statistics` | Price stats |
| 🧪 Unit | `getCategories should return category list` | Categories |
| 🧪 Unit | `getRecommended should return recommendations` | Recommendations |
| 🧪 Unit | `getWatchlist should return user watchlist` | Watchlist |
| 🔗 Integration | `should integrate with search service` | Service integration |

#### `src/controllers/seller-onboarding.controller.ts` - Onboarding Controller

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `startOnboarding should validate user auth` | Auth check |
| 🧪 Unit | `startOnboarding should return 401 when not authenticated` | Unauthorized |
| 🧪 Unit | `startOnboarding should use default URLs` | Default URLs |
| 🧪 Unit | `startOnboarding should return onboarding URL` | URL return |
| 🧪 Unit | `getStatus should return account status` | Status return |
| 🧪 Unit | `refreshOnboardingLink should generate new link` | Link refresh |
| 🧪 Unit | `canAcceptFiat should return eligibility` | Eligibility check |
| 🔗 Integration | `should integrate with onboarding service` | Service integration |

#### `src/controllers/health.controller.ts` - Health Controller

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `health should return healthy status` | Health status |
| 🧪 Unit | `health should include service name` | Service name |
| 🧪 Unit | `health should include timestamp` | Timestamp |
| 🧪 Unit | `detailed should check database` | DB check |
| 🧪 Unit | `detailed should check Redis` | Redis check |
| 🧪 Unit | `detailed should return 503 when unhealthy` | Unhealthy response |
| 🧪 Unit | `readiness should verify database ready` | Readiness check |
| 🧪 Unit | `liveness should return alive` | Liveness check |
| 🔗 Integration | `should check actual dependencies` | Real checks |

#### `src/controllers/venue-settings.controller.ts` - Venue Settings Controller

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `getSettings should return venue settings` | Settings return |
| 🧪 Unit | `updateSettings should update settings` | Settings update |
| 🧪 Unit | `getVenueListings should return venue listings` | Listings return |
| 🧪 Unit | `getSalesReport should return sales data` | Sales report |
| 🔗 Integration | `should integrate with venue service` | Service integration |

---

### 8. Routes

#### `src/routes/index.ts` - Route Registration

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `should register healthRoutes` | Health routes |
| 🔗 Integration | `should register listingsRoutes with prefix` | Listings routes |
| 🔗 Integration | `should register transfersRoutes with prefix` | Transfers routes |
| 🔗 Integration | `should register venueRoutes with prefix` | Venue routes |
| 🔗 Integration | `should register searchRoutes with prefix` | Search routes |
| 🔗 Integration | `should register adminRoutes with prefix` | Admin routes |
| 🔗 Integration | `should register disputesRoutes with prefix` | Disputes routes |
| 🔗 Integration | `should register taxRoutes with prefix` | Tax routes |
| 🔗 Integration | `should register sellerOnboardingRoutes with prefix` | Onboarding routes |
| 🔗 Integration | `should register webhookRoutes with prefix` | Webhook routes |
| 🧪 Unit | `GET /stats should require auth` | Stats auth |
| 🧪 Unit | `GET /cache/stats should require admin` | Cache stats auth |
| 🧪 Unit | `DELETE /cache/flush should require admin` | Cache flush auth |

#### `src/routes/listings.routes.ts` - Listing Routes

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `GET /:id should have param validation` | Param validation |
| 🧪 Unit | `GET /my-listings should require auth` | Auth check |
| 🧪 Unit | `GET /my-listings should validate query params` | Query validation |
| 🧪 Unit | `POST / should require auth and wallet` | Auth check |
| 🧪 Unit | `POST / should validate body with schema` | Body validation |
| 🧪 Unit | `POST / should enforce price limits` | Price limits |
| 🧪 Unit | `PUT /:id/price should require ownership` | Ownership check |
| 🧪 Unit | `PUT /:id/price should validate price` | Price validation |
| 🧪 Unit | `DELETE /:id should require ownership` | Ownership check |
| 🔗 Integration | `should register all listing routes` | Route registration |

#### `src/routes/transfers.routes.ts` - Transfer Routes

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `POST /purchase should require auth and wallet` | Auth check |
| 🧪 Unit | `POST /purchase should validate listingId` | ID validation |
| 🧪 Unit | `POST /direct should validate recipientWallet` | Wallet validation |
| 🧪 Unit | `GET /history should require auth` | Auth check |
| 🧪 Unit | `GET /:id should require auth` | Auth check |
| 🧪 Unit | `POST /:id/cancel should require auth` | Auth check |
| 🔗 Integration | `should register all transfer routes` | Route registration |

#### `src/routes/disputes.routes.ts` - Dispute Routes

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `POST / should require auth` | Auth check |
| 🧪 Unit | `POST / should validate transferId as UUID` | UUID validation |
| 🧪 Unit | `POST / should validate reason enum` | Enum validation |
| 🧪 Unit | `POST / should validate description length` | Length validation |
| 🧪 Unit | `POST / should validate evidenceUrls max 10` | Array max |
| 🧪 Unit | `GET /my-disputes should require auth` | Auth check |
| 🧪 Unit | `GET /:disputeId should validate UUID` | UUID validation |
| 🧪 Unit | `POST /:disputeId/evidence should validate body` | Body validation |
| 🔗 Integration | `should register all dispute routes` | Route registration |

#### `src/routes/admin.routes.ts` - Admin Routes

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `all routes should require auth` | Auth check |
| 🧪 Unit | `all routes should require admin role` | Admin check |
| 🧪 Unit | `GET /stats should call getStats` | Route handler |
| 🧪 Unit | `GET /disputes should call getDisputes` | Route handler |
| 🧪 Unit | `PUT /disputes/:disputeId/resolve should call resolveDispute` | Route handler |
| 🧪 Unit | `GET /flagged-users should call getFlaggedUsers` | Route handler |
| 🧪 Unit | `POST /ban-user should call banUser` | Route handler |
| 🔗 Integration | `should register all admin routes` | Route registration |

#### `src/routes/webhook.routes.ts` - Webhook Routes

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `POST /stripe should not require auth preHandler` | No auth |
| 🧪 Unit | `POST /stripe should handle raw body` | Raw body |
| 🧪 Unit | `POST /payment-completed should check internal header` | Internal auth |
| 🧪 Unit | `POST /payment-completed should return 403 for invalid service` | Forbidden |
| 🧪 Unit | `POST /payment-completed should validate body schema` | Body validation |
| 🔗 Integration | `should register webhook routes` | Route registration |

#### `src/routes/health.routes.ts` - Health Routes

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `GET /live should return alive status` | Liveness |
| 🧪 Unit | `GET /ready should check dependencies` | Readiness |
| 🧪 Unit | `GET /ready should return 503 when unhealthy` | Unhealthy |
| 🧪 Unit | `GET /health should check all dependencies` | Deep health |
| 🧪 Unit | `GET /health should include circuit breaker states` | Circuit states |
| 🧪 Unit | `GET /metrics should return Prometheus format` | Metrics format |
| 🔗 Integration | `should register health routes` | Route registration |

#### `src/routes/tax.routes.ts` - Tax Routes

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `all routes should require auth` | Auth check |
| 🧪 Unit | `GET /transactions should call getTransactions` | Route handler |
| 🧪 Unit | `GET /report/:year should validate year param` | Param validation |
| 🧪 Unit | `GET /1099k/:year should validate year param` | Param validation |
| 🔗 Integration | `should register tax routes` | Route registration |

#### `src/routes/search.routes.ts` - Search Routes

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `GET / should validate query schema` | Query validation |
| 🧪 Unit | `GET / should not require auth` | Public access |
| 🧪 Unit | `GET /recommended should require auth` | Auth check |
| 🧪 Unit | `GET /watchlist should require auth` | Auth check |
| 🔗 Integration | `should register search routes` | Route registration |

#### `src/routes/venue.routes.ts` - Venue Routes

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `all routes should require auth` | Auth check |
| 🧪 Unit | `all routes should require venue owner` | Owner check |
| 🧪 Unit | `GET /:venueId/settings should return settings` | Settings route |
| 🧪 Unit | `PUT /:venueId/settings should validate body` | Body validation |
| 🧪 Unit | `PUT /:venueId/settings should validate percentages` | Percentage validation |
| 🧪 Unit | `GET /:venueId/listings should return listings` | Listings route |
| 🧪 Unit | `GET /:venueId/sales-report should return report` | Report route |
| 🔗 Integration | `should register venue routes` | Route registration |

#### `src/routes/seller-onboarding.routes.ts` - Onboarding Routes

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `all routes should use authenticate hook` | Auth hook |
| 🧪 Unit | `POST /onboard should have schema` | Schema validation |
| 🧪 Unit | `GET /status should return account status` | Status route |
| 🧪 Unit | `POST /refresh-link should accept URLs` | URL params |
| 🧪 Unit | `GET /can-accept-fiat should return boolean` | Eligibility route |
| 🔗 Integration | `should register onboarding routes` | Route registration |

#### `src/routes/metrics.routes.ts` - Metrics Routes

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `GET /metrics should return Prometheus format` | Prometheus format |
| 🧪 Unit | `GET /metrics should include listing stats` | Listing metrics |
| 🧪 Unit | `GET /metrics should include transfer stats` | Transfer metrics |
| 🧪 Unit | `GET /metrics should include escrow metrics` | Escrow metrics |
| 🧪 Unit | `GET /metrics should include fee metrics` | Fee metrics |
| 🧪 Unit | `GET /metrics/json should return JSON format` | JSON format |
| 🔗 Integration | `should aggregate metrics from database` | DB aggregation |

---

### 9. Schemas

#### `src/schemas/validation.ts` - Validation Schemas

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `CommonFields.uuid should validate UUIDv4` | UUID validation |
| 🧪 Unit | `CommonFields.solanaAddress should validate Base58` | Address validation |
| 🧪 Unit | `CommonFields.price should enforce min $1.00` | Min price |
| 🧪 Unit | `CommonFields.price should enforce max $10M` | Max price |
| 🧪 Unit | `CommonFields.price should require integer` | Integer requirement |
| 🧪 Unit | `CommonFields.page should default to 1` | Page default |
| 🧪 Unit | `CommonFields.limit should enforce max 100` | Limit max |
| 🧪 Unit | `ListingSchemas.create should require ticketId` | Required field |
| 🧪 Unit | `ListingSchemas.create should require eventId` | Required field |
| 🧪 Unit | `ListingSchemas.create should require price` | Required field |
| 🧪 Unit | `ListingSchemas.update should require at least one field` | Min fields |
| 🧪 Unit | `PurchaseSchemas.create should require listingId` | Required field |
| 🧪 Unit | `PurchaseSchemas.create should require buyerWalletAddress` | Required field |
| 🧪 Unit | `DisputeSchemas.create should validate reason enum` | Enum validation |
| 🧪 Unit | `DisputeSchemas.create should require description min 10 chars` | Min length |
| 🧪 Unit | `RefundSchemas.create should validate reason enum` | Enum validation |
| 🧪 Unit | `validateSchema should return middleware function` | Middleware factory |
| 🧪 Unit | `validateSchema should strip unknown fields` | Field stripping |
| 🔗 Integration | `should validate real request data` | Real validation |

#### `src/schemas/wallet.schema.ts` - Wallet Validation

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `validateSolanaAddress should accept valid addresses` | Valid address |
| 🧪 Unit | `validateSolanaAddress should reject empty` | Empty rejection |
| 🧪 Unit | `validateSolanaAddress should reject too short` | Length check |
| 🧪 Unit | `validateSolanaAddress should reject too long` | Length check |
| 🧪 Unit | `validateSolanaAddress should reject invalid Base58` | Format check |
| 🧪 Unit | `validateSolanaAddress should reject blacklisted addresses` | Blacklist check |
| 🧪 Unit | `validateSolanaAddress should trim whitespace` | Trim |
| 🧪 Unit | `validateMultipleSolanaAddresses should validate array` | Array validation |
| 🧪 Unit | `looksLikeProgramId should detect program addresses` | Program detection |
| 🧪 Unit | `walletValidationMiddleware should validate request field` | Middleware |
| 🔗 Integration | `should validate real Solana addresses` | Real validation |

---

### 10. Events

#### `src/events/event-bus.ts` - Event Bus System

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `initEventBus should subscribe to marketplace events` | Subscription |
| 🧪 Unit | `initEventBus should warn if already initialized` | Idempotency |
| 🧪 Unit | `publishEvent should create event with UUID` | Event creation |
| 🧪 Unit | `publishEvent should include metadata` | Metadata |
| 🧪 Unit | `publishEvent should retry on failure` | Retry logic |
| 🧪 Unit | `publishEvent should use exponential backoff` | Backoff |
| 🧪 Unit | `publishEvent should add to DLQ after max retries` | DLQ fallback |
| 🧪 Unit | `subscribe should register handler` | Handler registration |
| 🧪 Unit | `subscribe should return unsubscribe function` | Unsubscribe |
| 🧪 Unit | `handleEvent should call registered handlers` | Handler invocation |
| 🧪 Unit | `handleEvent should add to DLQ on handler failure` | Handler failure |
| 🧪 Unit | `addToDLQ should store event in Redis` | DLQ storage |
| 🧪 Unit | `getDLQEntries should retrieve entries` | DLQ retrieval |
| 🧪 Unit | `retryDLQEntry should republish event` | DLQ retry |
| 🧪 Unit | `removeDLQEntry should delete entry` | DLQ removal |
| 🧪 Unit | `getDLQStats should return statistics` | DLQ stats |
| 🧪 Unit | `closeEventBus should unsubscribe and clear handlers` | Cleanup |
| 🔗 Integration | `should publish and subscribe via Redis` | Redis pub/sub |

#### `src/events/event-types.ts` - Event Type Definitions

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `MarketplaceEvents should include LISTING_CREATED` | Event constant |
| 🧪 Unit | `MarketplaceEvents should include LISTING_SOLD` | Event constant |
| 🧪 Unit | `MarketplaceEvents should include TRANSFER_COMPLETED` | Event constant |
| 🧪 Unit | `MarketplaceEvents should include DISPUTE_CREATED` | Event constant |
| 🧪 Unit | `MarketplaceEvent interface should have type, timestamp, payload` | Interface shape |

#### `src/events/publishers.ts` - Event Publishers

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `EventPublisher should extend EventEmitter` | Inheritance |
| 🧪 Unit | `publishEvent should emit event with correct type` | Event emission |
| 🧪 Unit | `publishListingCreated should use LISTING_CREATED type` | Type usage |
| 🧪 Unit | `publishListingSold should include buyer_id` | Payload |
| 🔗 Integration | `should emit events via EventEmitter` | Emission |

#### `src/events/handlers.ts` - Event Handlers

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `handleTicketMinted should log event` | Logging |
| 🧪 Unit | `handlePaymentCompleted should log event` | Logging |
| 🧪 Unit | `handleUserBanned should log event` | Logging |
| 🧪 Unit | `handlers should catch and log errors` | Error handling |
| 🔗 Integration | `should process events` | Event processing |

---

### 11. Jobs

#### `src/jobs/listing-expiration.ts` - Listing Expiration Job

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `expireListingsForPastEvents should calculate cutoff with buffer` | Cutoff calculation |
| 🧪 Unit | `expireListingsForPastEvents should process in batches` | Batch processing |
| 🧪 Unit | `expireListingsForPastEvents should update status to expired` | Status update |
| 🧪 Unit | `expireListingsForPastEvents should set expired_at timestamp` | Timestamp |
| 🧪 Unit | `expireListingsForPastEvents should create audit log` | Audit logging |
| 🧪 Unit | `expireListingsForPastEvents should notify seller` | Notification |
| 🧪 Unit | `expireListingsForPastEvents should have safety limit 10000` | Safety limit |
| 🧪 Unit | `expireListing should use transaction` | Transaction usage |
| 🧪 Unit | `expireListing should only update active listings` | Status filter |
| 🧪 Unit | `ListingExpirationJobRunner.start should begin interval` | Job start |
| 🧪 Unit | `ListingExpirationJobRunner.stop should clear interval` | Job stop |
| 🧪 Unit | `ListingExpirationJobRunner.runJob should skip if running` | Concurrency guard |
| 🔗 Integration | `should expire listings in database` | DB integration |

---

### 12. Queues

#### `src/queues/retry-queue.ts` - Retry Queue System

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should create Bull queues on init` | Queue creation |
| 🧪 Unit | `should warn if already initialized` | Idempotency |
| 🧪 Unit | `should set up completed event handler` | Event handler |
| 🧪 Unit | `should set up failed event handler` | Event handler |
| 🧪 Unit | `should set up stalled event handler` | Event handler |
| 🧪 Unit | `should move to DLQ after max retries` | DLQ handling |
| 🧪 Unit | `should initialize queue lazily on first job` | Lazy init |
| 🧪 Unit | `should create job with type and payload` | Job creation |
| 🧪 Unit | `should include metadata with timestamp` | Metadata |
| 🧪 Unit | `should apply priority option` | Priority |
| 🧪 Unit | `should apply delay option` | Delay |
| 🧪 Unit | `should return job ID` | Return value |
| 🧪 Unit | `should validate before adding when validator provided` | Pre-validation |
| 🧪 Unit | `should return null if validation fails` | Validation failure |
| 🧪 Unit | `should add failed job to DLQ with error` | DLQ entry |
| 🧪 Unit | `should increment DLQ metrics` | Metrics |
| 🧪 Unit | `should throw if queue not initialized for processing` | Error handling |
| 🧪 Unit | `should register processor for job type` | Processor registration |
| 🧪 Unit | `should observe job duration histogram` | Duration metrics |
| 🧪 Unit | `should return queue statistics` | Stats retrieval |
| 🧪 Unit | `should return DLQ statistics` | DLQ stats |
| 🧪 Unit | `should return DLQ jobs with pagination` | DLQ pagination |
| 🧪 Unit | `should retry DLQ job by ID` | DLQ retry |
| 🧪 Unit | `should remove DLQ job by ID` | DLQ removal |
| 🧪 Unit | `should pause queue` | Queue pause |
| 🧪 Unit | `should resume queue` | Queue resume |
| 🧪 Unit | `should close both queues on shutdown` | Cleanup |
| 🔗 Integration | `should process jobs with retry` | Job processing |
| 🔗 Integration | `should handle DLQ operations` | DLQ integration |

---

### 13. Errors

#### `src/errors/index.ts` - Error Classes

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should export all ErrorCode enum values` | Enum export |
| 🧪 Unit | `should include UNAUTHORIZED error code` | Error code |
| 🧪 Unit | `should include VALIDATION_FAILED error code` | Error code |
| 🧪 Unit | `should include NOT_FOUND error code` | Error code |
| 🧪 Unit | `should include INSUFFICIENT_FUNDS error code` | Error code |
| 🧪 Unit | `should include BLOCKCHAIN_ERROR error code` | Error code |
| 🧪 Unit | `should include STRIPE_ERROR error code` | Error code |
| 🧪 Unit | `should include RATE_LIMITED error code` | Error code |
| 🧪 Unit | `BaseError should extend Error` | Inheritance |
| 🧪 Unit | `BaseError should set name to constructor name` | Name property |
| 🧪 Unit | `BaseError should set statusCode property` | Status code |
| 🧪 Unit | `BaseError should set code property` | Error code |
| 🧪 Unit | `BaseError should set isOperational flag` | Operational flag |
| 🧪 Unit | `BaseError should capture stack trace` | Stack trace |
| 🧪 Unit | `toProblemDetails should return RFC 7807 format` | Problem details |
| 🧪 Unit | `toProblemDetails should include type URI` | Type URI |
| 🧪 Unit | `toProblemDetails should include requestId` | Request ID |
| 🧪 Unit | `toJSON should return serializable object` | JSON serialization |
| 🧪 Unit | `AuthenticationError should default to 401` | Status code |
| 🧪 Unit | `AuthenticationError.invalidToken should return INVALID_TOKEN` | Factory method |
| 🧪 Unit | `AuthenticationError.tokenExpired should return TOKEN_EXPIRED` | Factory method |
| 🧪 Unit | `AuthenticationError.forbidden should return 403` | Status code |
| 🧪 Unit | `ValidationError should set 400 status` | Status code |
| 🧪 Unit | `ValidationError should store violations array` | Violations |
| 🧪 Unit | `ValidationError.missingField should create error` | Factory method |
| 🧪 Unit | `ValidationError.invalidField should create error` | Factory method |
| 🧪 Unit | `NotFoundError should set 404 status` | Status code |
| 🧪 Unit | `NotFoundError should store resource name` | Resource |
| 🧪 Unit | `ConflictError should set 409 status` | Status code |
| 🧪 Unit | `ConflictError.alreadyExists should include resource` | Factory method |
| 🧪 Unit | `BusinessError should set 422 status` | Status code |
| 🧪 Unit | `BusinessError.insufficientFunds should include amounts` | Factory method |
| 🧪 Unit | `BusinessError.listingNotAvailable should include listingId` | Factory method |
| 🧪 Unit | `BusinessError.priceLimitExceeded should include limits` | Factory method |
| 🧪 Unit | `ExternalServiceError should set 503 status` | Status code |
| 🧪 Unit | `ExternalServiceError should store service name` | Service name |
| 🧪 Unit | `ExternalServiceError.blockchain should set correct code` | Factory method |
| 🧪 Unit | `ExternalServiceError.stripe should set correct code` | Factory method |
| 🧪 Unit | `ExternalServiceError.circuitOpen should include retryAfter` | Factory method |
| 🧪 Unit | `RateLimitError should set 429 status` | Status code |
| 🧪 Unit | `RateLimitError should store retryAfter` | Retry after |
| 🧪 Unit | `DatabaseError should set 500 status` | Status code |
| 🧪 Unit | `DatabaseError should set isOperational false` | Operational flag |
| 🧪 Unit | `isOperationalError should return true for operational` | Helper function |
| 🧪 Unit | `isOperationalError should return false for non-operational` | Helper function |
| 🧪 Unit | `wrapError should return BaseError unchanged` | Wrapper function |
| 🧪 Unit | `wrapError should wrap standard Error` | Wrapper function |
| 🧪 Unit | `wrapError should wrap unknown values` | Wrapper function |

---

### 14. Events

#### `src/events/event-types.ts` - Event Type Definitions

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `MarketplaceEvents should include LISTING_CREATED` | Event constant |
| 🧪 Unit | `MarketplaceEvents should include LISTING_UPDATED` | Event constant |
| 🧪 Unit | `MarketplaceEvents should include LISTING_SOLD` | Event constant |
| 🧪 Unit | `MarketplaceEvents should include LISTING_CANCELLED` | Event constant |
| 🧪 Unit | `MarketplaceEvents should include LISTING_EXPIRED` | Event constant |
| 🧪 Unit | `MarketplaceEvents should include TRANSFER_INITIATED` | Event constant |
| 🧪 Unit | `MarketplaceEvents should include TRANSFER_COMPLETED` | Event constant |
| 🧪 Unit | `MarketplaceEvents should include TRANSFER_FAILED` | Event constant |
| 🧪 Unit | `MarketplaceEvents should include DISPUTE_CREATED` | Event constant |
| 🧪 Unit | `MarketplaceEvents should include DISPUTE_RESOLVED` | Event constant |
| 🧪 Unit | `MarketplaceEvents should include PRICE_CHANGED` | Event constant |
| 🧪 Unit | `MarketplaceEvent interface should require type` | Interface |
| 🧪 Unit | `MarketplaceEvent interface should require timestamp` | Interface |
| 🧪 Unit | `MarketplaceEvent interface should require payload` | Interface |

#### `src/events/publishers.ts` - Event Publishers

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `EventPublisher should extend EventEmitter` | Inheritance |
| 🧪 Unit | `publishEvent should create event with type` | Event creation |
| 🧪 Unit | `publishEvent should create event with timestamp` | Timestamp |
| 🧪 Unit | `publishEvent should create event with payload` | Payload |
| 🧪 Unit | `publishEvent should emit on correct channel` | Emission |
| 🧪 Unit | `publishEvent should include metadata when provided` | Metadata |
| 🧪 Unit | `publishEvent should log on success` | Logging |
| 🧪 Unit | `publishEvent should log error on failure` | Error logging |
| 🧪 Unit | `publishListingCreated should use LISTING_CREATED type` | Type usage |
| 🧪 Unit | `publishListingSold should include buyer_id in payload` | Payload |
| 🔗 Integration | `should emit events via EventEmitter` | Event emission |

#### `src/events/handlers.ts` - Event Handlers

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `handleTicketMinted should log event` | Logging |
| 🧪 Unit | `handleTicketMinted should catch errors` | Error handling |
| 🧪 Unit | `handlePaymentCompleted should log event` | Logging |
| 🧪 Unit | `handlePaymentCompleted should catch errors` | Error handling |
| 🧪 Unit | `handleUserBanned should log event` | Logging |
| 🧪 Unit | `handleUserBanned should catch errors` | Error handling |
| 🔗 Integration | `should process events correctly` | Event processing |

#### `src/events/event-bus.ts` - Event Bus System

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `initEventBus should subscribe to marketplace events` | Subscription |
| 🧪 Unit | `initEventBus should warn if already initialized` | Idempotency |
| 🧪 Unit | `initEventBus should set up pmessage handler` | Handler setup |
| 🧪 Unit | `initEventBus should throw on Redis failure` | Error handling |
| 🧪 Unit | `publishEvent should create event with UUID` | Event creation |
| 🧪 Unit | `publishEvent should include correlationId in metadata` | Metadata |
| 🧪 Unit | `publishEvent should include tenantId in metadata` | Metadata |
| 🧪 Unit | `publishEvent should include userId in metadata` | Metadata |
| 🧪 Unit | `publishEvent should retry on failure` | Retry logic |
| 🧪 Unit | `publishEvent should use exponential backoff` | Backoff |
| 🧪 Unit | `publishEvent should add to DLQ after max retries` | DLQ fallback |
| 🧪 Unit | `publishEvent should store event in log` | Event log |
| 🧪 Unit | `publishEvent should increment success metrics` | Metrics |
| 🧪 Unit | `publishEvent should increment failure metrics` | Metrics |
| 🧪 Unit | `subscribe should register handler` | Handler registration |
| 🧪 Unit | `subscribe should return unsubscribe function` | Unsubscribe |
| 🧪 Unit | `handleEvent should call registered handlers` | Handler invocation |
| 🧪 Unit | `handleEvent should add to DLQ on handler failure` | Handler failure |
| 🧪 Unit | `handleEvent should increment success metrics` | Metrics |
| 🧪 Unit | `handleEvent should increment failure metrics` | Metrics |
| 🧪 Unit | `addToDLQ should store event in Redis` | DLQ storage |
| 🧪 Unit | `addToDLQ should add to sorted set` | Sorted set |
| 🧪 Unit | `addToDLQ should increment DLQ metrics` | Metrics |
| 🧪 Unit | `getDLQEntries should retrieve from sorted set` | DLQ retrieval |
| 🧪 Unit | `getDLQEntries should respect limit and offset` | Pagination |
| 🧪 Unit | `retryDLQEntry should return false if not found` | Not found |
| 🧪 Unit | `retryDLQEntry should increment retry count` | Retry count |
| 🧪 Unit | `retryDLQEntry should republish to original channel` | Republish |
| 🧪 Unit | `retryDLQEntry should remove from DLQ on success` | Removal |
| 🧪 Unit | `retryAllDLQEntries should retry all entries` | Bulk retry |
| 🧪 Unit | `retryAllDLQEntries should return success/failed counts` | Counts |
| 🧪 Unit | `removeDLQEntry should delete from Redis` | Deletion |
| 🧪 Unit | `getDLQStats should return totalEntries` | Stats |
| 🧪 Unit | `getDLQStats should return byType breakdown` | Stats |
| 🧪 Unit | `closeEventBus should unsubscribe from channels` | Cleanup |
| 🧪 Unit | `closeEventBus should clear handlers` | Cleanup |
| 🔗 Integration | `should publish and subscribe via Redis` | Redis pub/sub |
| 🔗 Integration | `should manage DLQ entries` | DLQ integration |

---

### 15. Jobs

#### `src/jobs/listing-expiration.ts` - Listing Expiration Job

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should parse EXPIRATION_BUFFER_MINUTES from env` | Config parsing |
| 🧪 Unit | `should default EXPIRATION_BUFFER_MINUTES to 30` | Default value |
| 🧪 Unit | `should parse BATCH_SIZE from env` | Config parsing |
| 🧪 Unit | `should default BATCH_SIZE to 100` | Default value |
| 🧪 Unit | `should parse JOB_INTERVAL_MS from env` | Config parsing |
| 🧪 Unit | `should default JOB_INTERVAL_MS to 300000` | Default value |
| 🧪 Unit | `expireListingsForPastEvents should calculate cutoff with buffer` | Cutoff calculation |
| 🧪 Unit | `expireListingsForPastEvents should query active listings past cutoff` | Query |
| 🧪 Unit | `expireListingsForPastEvents should process in batches` | Batch processing |
| 🧪 Unit | `expireListingsForPastEvents should continue on individual error` | Error handling |
| 🧪 Unit | `expireListingsForPastEvents should stop at 10000 safety limit` | Safety limit |
| 🧪 Unit | `expireListingsForPastEvents should return result object` | Return value |
| 🧪 Unit | `expireListingsForPastEvents should log start and completion` | Logging |
| 🧪 Unit | `expireListing should use transaction` | Transaction |
| 🧪 Unit | `expireListing should update status to expired` | Status update |
| 🧪 Unit | `expireListing should set expired_at timestamp` | Timestamp |
| 🧪 Unit | `expireListing should only update if still active` | Race condition |
| 🧪 Unit | `expireListing should warn if already processed` | Warning |
| 🧪 Unit | `expireListing should create audit log entry` | Audit log |
| 🧪 Unit | `expireListing should handle missing audit table` | Error handling |
| 🧪 Unit | `expireListing should call notifySellerOfExpiration` | Notification |
| 🧪 Unit | `notifySellerOfExpiration should log notification intent` | Logging |
| 🧪 Unit | `ListingExpirationJobRunner.start should warn if already running` | Idempotency |
| 🧪 Unit | `ListingExpirationJobRunner.start should run immediately` | Immediate run |
| 🧪 Unit | `ListingExpirationJobRunner.start should set up interval` | Interval |
| 🧪 Unit | `ListingExpirationJobRunner.stop should clear interval` | Cleanup |
| 🧪 Unit | `ListingExpirationJobRunner.runJob should skip if in progress` | Concurrency |
| 🧪 Unit | `runExpirationJobManually should call expireListingsForPastEvents` | Manual trigger |
| 🔗 Integration | `should expire listings in database` | DB integration |
| 🔗 Integration | `should handle concurrent job runs` | Concurrency |

---

### 16. Schemas

#### `src/schemas/validation.ts` - Validation Schemas

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `MIN_PRICE_CENTS should be 100` | Constant |
| 🧪 Unit | `MAX_PRICE_CENTS should be 1000000000` | Constant |
| 🧪 Unit | `DEFAULT_PAGE_SIZE should be 20` | Constant |
| 🧪 Unit | `MAX_PAGE_SIZE should be 100` | Constant |
| 🧪 Unit | `CommonFields.uuid should validate UUIDv4` | UUID validation |
| 🧪 Unit | `CommonFields.uuid should reject invalid UUID` | UUID rejection |
| 🧪 Unit | `CommonFields.solanaAddress should validate min length 32` | Min length |
| 🧪 Unit | `CommonFields.solanaAddress should validate max length 44` | Max length |
| 🧪 Unit | `CommonFields.solanaAddress should validate Base58 pattern` | Pattern |
| 🧪 Unit | `CommonFields.solanaAddress should reject blacklisted` | Blacklist |
| 🧪 Unit | `CommonFields.price should require integer` | Integer |
| 🧪 Unit | `CommonFields.price should enforce min $1.00` | Min price |
| 🧪 Unit | `CommonFields.price should enforce max $10M` | Max price |
| 🧪 Unit | `CommonFields.page should default to 1` | Default |
| 🧪 Unit | `CommonFields.page should enforce minimum 1` | Minimum |
| 🧪 Unit | `CommonFields.limit should default to 20` | Default |
| 🧪 Unit | `CommonFields.limit should enforce max 100` | Maximum |
| 🧪 Unit | `CommonFields.offset should enforce minimum 0` | Minimum |
| 🧪 Unit | `CommonFields.timestamp should validate ISO 8601` | Format |
| 🧪 Unit | `CommonFields.futureTimestamp should reject past dates` | Future only |
| 🧪 Unit | `CommonFields.sortOrder should accept asc and desc` | Values |
| 🧪 Unit | `CommonFields.sortOrder should default to desc` | Default |
| 🧪 Unit | `ListingSchemas.create should require ticketId` | Required |
| 🧪 Unit | `ListingSchemas.create should require eventId` | Required |
| 🧪 Unit | `ListingSchemas.create should require price` | Required |
| 🧪 Unit | `ListingSchemas.create should allow optional description` | Optional |
| 🧪 Unit | `ListingSchemas.create should require minOfferPrice when allowOffers true` | Conditional |
| 🧪 Unit | `ListingSchemas.create should forbid minOfferPrice when allowOffers false` | Conditional |
| 🧪 Unit | `ListingSchemas.update should require at least one field` | Min fields |
| 🧪 Unit | `ListingSchemas.getById should require id` | Required |
| 🧪 Unit | `ListingSchemas.list should accept all filter fields` | Filters |
| 🧪 Unit | `ListingSchemas.search should require query min 2 chars` | Min length |
| 🧪 Unit | `ListingSchemas.search should validate startDate before endDate` | Date order |
| 🧪 Unit | `PurchaseSchemas.create should require listingId` | Required |
| 🧪 Unit | `PurchaseSchemas.create should require buyerWalletAddress` | Required |
| 🧪 Unit | `PurchaseSchemas.create should require paymentMethodId` | Required |
| 🧪 Unit | `PurchaseSchemas.create should allow optional idempotencyKey` | Optional |
| 🧪 Unit | `DisputeSchemas.create should require transferId` | Required |
| 🧪 Unit | `DisputeSchemas.create should validate reason enum` | Enum |
| 🧪 Unit | `DisputeSchemas.create should require description min 10 chars` | Min length |
| 🧪 Unit | `DisputeSchemas.create should limit evidence to 10 items` | Max items |
| 🧪 Unit | `DisputeSchemas.update should validate resolution values` | Enum |
| 🧪 Unit | `DisputeSchemas.update should require refundAmount for partial_refund` | Conditional |
| 🧪 Unit | `RefundSchemas.create should require transferId` | Required |
| 🧪 Unit | `RefundSchemas.create should validate reason enum` | Enum |
| 🧪 Unit | `RefundSchemas.eventCancellation should require eventId` | Required |
| 🧪 Unit | `WebhookSchemas.stripe should require id` | Required |
| 🧪 Unit | `WebhookSchemas.stripe should require type` | Required |
| 🧪 Unit | `WebhookSchemas.stripe should require data` | Required |
| 🧪 Unit | `AdminSchemas.listUsers should accept role filter` | Filter |
| 🧪 Unit | `AdminSchemas.listUsers should accept status filter` | Filter |
| 🧪 Unit | `AdminSchemas.updateUser should require suspensionReason when suspended` | Conditional |
| 🧪 Unit | `AdminSchemas.bulkAction should require action` | Required |
| 🧪 Unit | `AdminSchemas.bulkAction should require ids array` | Required |
| 🧪 Unit | `AdminSchemas.bulkAction should limit ids to 100` | Max items |
| 🧪 Unit | `validateSchema should return middleware function` | Factory |
| 🧪 Unit | `validateSchema should validate body by default` | Default source |
| 🧪 Unit | `validateSchema should validate query when specified` | Query source |
| 🧪 Unit | `validateSchema should validate params when specified` | Params source |
| 🧪 Unit | `validateSchema should return 400 on error` | Error response |
| 🧪 Unit | `validateSchema should include field errors` | Field errors |
| 🧪 Unit | `validateSchema should strip unknown fields` | Strip unknown |
| 🧪 Unit | `validateSchema should replace request data with validated` | Replacement |
| 🔗 Integration | `should validate real request data` | Real validation |

#### `src/schemas/wallet.schema.ts` - Wallet Validation

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `SOLANA_MIN_LENGTH should be 32` | Constant |
| 🧪 Unit | `SOLANA_MAX_LENGTH should be 44` | Constant |
| 🧪 Unit | `BLACKLISTED_ADDRESSES should include System Program` | Blacklist |
| 🧪 Unit | `BLACKLISTED_ADDRESSES should include Token Program` | Blacklist |
| 🧪 Unit | `BLACKLISTED_ADDRESSES should include Associated Token Program` | Blacklist |
| 🧪 Unit | `validateSolanaAddress should return EMPTY for null` | Empty check |
| 🧪 Unit | `validateSolanaAddress should return EMPTY for undefined` | Empty check |
| 🧪 Unit | `validateSolanaAddress should return EMPTY for empty string` | Empty check |
| 🧪 Unit | `validateSolanaAddress should trim whitespace` | Trim |
| 🧪 Unit | `validateSolanaAddress should return INVALID_LENGTH for too short` | Length check |
| 🧪 Unit | `validateSolanaAddress should return INVALID_LENGTH for too long` | Length check |
| 🧪 Unit | `validateSolanaAddress should return INVALID_FORMAT for invalid Base58` | Format check |
| 🧪 Unit | `validateSolanaAddress should return BLACKLISTED for system programs` | Blacklist check |
| 🧪 Unit | `validateSolanaAddress should return valid true for valid address` | Valid case |
| 🧪 Unit | `validateSolanaAddress should return normalized address` | Normalization |
| 🧪 Unit | `validateMultipleSolanaAddresses should validate array` | Array validation |
| 🧪 Unit | `validateMultipleSolanaAddresses should return all results` | All results |
| 🧪 Unit | `validateMultipleSolanaAddresses should return valid false if any invalid` | Any invalid |
| 🧪 Unit | `solanaAddressSchema should have correct type` | Schema type |
| 🧪 Unit | `solanaAddressSchema should have minLength 32` | Min length |
| 🧪 Unit | `solanaAddressSchema should have maxLength 44` | Max length |
| 🧪 Unit | `solanaAddressSchema should have Base58 pattern` | Pattern |
| 🧪 Unit | `createJoiSolanaAddressValidator should return Joi schema` | Factory |
| 🧪 Unit | `walletValidationMiddleware should validate specified field` | Field validation |
| 🧪 Unit | `walletValidationMiddleware should default to walletAddress` | Default field |
| 🧪 Unit | `walletValidationMiddleware should return 400 on invalid` | Error response |
| 🧪 Unit | `walletValidationMiddleware should normalize valid addresses` | Normalization |
| 🧪 Unit | `looksLikeProgramId should return true for blacklisted` | Detection |
| 🧪 Unit | `looksLikeProgramId should return true for Program suffix` | Detection |
| 🧪 Unit | `looksLikeProgramId should return false for regular addresses` | Detection |
| 🔗 Integration | `should validate real Solana addresses` | Real validation |

---

### 17. Types

#### `src/types/common.types.ts` - Common Type Definitions

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `UUID should be string type alias` | Type alias |
| 🧪 Unit | `Timestamp should be Date type alias` | Type alias |
| 🧪 Unit | `ListingStatus should include active` | Union type |
| 🧪 Unit | `ListingStatus should include sold` | Union type |
| 🧪 Unit | `ListingStatus should include cancelled` | Union type |
| 🧪 Unit | `ListingStatus should include expired` | Union type |
| 🧪 Unit | `ListingStatus should include pending_approval` | Union type |
| 🧪 Unit | `TransferStatus should include initiated` | Union type |
| 🧪 Unit | `TransferStatus should include completed` | Union type |
| 🧪 Unit | `TransferStatus should include failed` | Union type |
| 🧪 Unit | `PaymentCurrency should include USDC` | Union type |
| 🧪 Unit | `PaymentCurrency should include SOL` | Union type |
| 🧪 Unit | `PaginationParams should require page` | Interface |
| 🧪 Unit | `PaginationParams should require limit` | Interface |
| 🧪 Unit | `ServiceResponse should be generic` | Generic |
| 🧪 Unit | `ServiceResponse should require success` | Interface |
| 🧪 Unit | `AuthUser should require id` | Interface |
| 🧪 Unit | `AuthUser should require wallet` | Interface |
| 🧪 Unit | `BaseEntity should require id` | Interface |
| 🧪 Unit | `BaseEntity should require created_at` | Interface |
| 🧪 Unit | `BaseEntity should require updated_at` | Interface |

#### `src/types/listing.types.ts` - Listing Type Definitions

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `ListingFilters should allow optional eventId` | Interface |
| 🧪 Unit | `ListingFilters should allow optional venueId` | Interface |
| 🧪 Unit | `ListingFilters should allow optional minPrice` | Interface |
| 🧪 Unit | `ListingFilters should allow optional maxPrice` | Interface |
| 🧪 Unit | `MarketplaceListing should extend BaseEntity` | Inheritance |
| 🧪 Unit | `MarketplaceListing should require ticket_id` | Interface |
| 🧪 Unit | `MarketplaceListing should require seller_id` | Interface |
| 🧪 Unit | `MarketplaceListing should require price` | Interface |
| 🧪 Unit | `MarketplaceListing should require status` | Interface |
| 🧪 Unit | `ListingWithDetails should extend MarketplaceListing` | Inheritance |
| 🧪 Unit | `ListingWithDetails should allow optional event_name` | Interface |
| 🧪 Unit | `PriceUpdate should require old_price` | Interface |
| 🧪 Unit | `PriceUpdate should require new_price` | Interface |
| 🧪 Unit | `CreateListingInput should require ticket_id` | Interface |
| 🧪 Unit | `CreateListingInput should require price` | Interface |
| 🧪 Unit | `UpdateListingInput should allow optional price` | Interface |

#### `src/types/transfer.types.ts` - Transfer Type Definitions

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `MarketplaceTransfer should extend BaseEntity` | Inheritance |
| 🧪 Unit | `MarketplaceTransfer should require listing_id` | Interface |
| 🧪 Unit | `MarketplaceTransfer should require buyer_id` | Interface |
| 🧪 Unit | `MarketplaceTransfer should require seller_id` | Interface |
| 🧪 Unit | `MarketplaceTransfer should require amount` | Interface |
| 🧪 Unit | `MarketplaceTransfer should require status` | Interface |
| 🧪 Unit | `TransferRequest should require listing_id` | Interface |
| 🧪 Unit | `TransferRequest should require buyer_wallet` | Interface |
| 🧪 Unit | `TransferValidation should require isValid` | Interface |
| 🧪 Unit | `BlockchainTransfer should require signature` | Interface |
| 🧪 Unit | `BlockchainTransfer should require block_height` | Interface |
| 🧪 Unit | `TransferMetadata should require initiated_at` | Interface |
| 🧪 Unit | `TransferMetadata should require attempts` | Interface |

#### `src/types/wallet.types.ts` - Wallet Type Definitions

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `WalletInfo should require address` | Interface |
| 🧪 Unit | `WalletInfo should require network` | Interface |
| 🧪 Unit | `WalletInfo should require is_valid` | Interface |
| 🧪 Unit | `WalletTransaction should require signature` | Interface |
| 🧪 Unit | `WalletTransaction should require from` | Interface |
| 🧪 Unit | `WalletTransaction should require to` | Interface |
| 🧪 Unit | `WalletBalance should require wallet_address` | Interface |
| 🧪 Unit | `WalletBalance should require sol_balance` | Interface |
| 🧪 Unit | `WalletBalance should require usdc_balance` | Interface |
| 🧪 Unit | `WalletVerification should require wallet_address` | Interface |
| 🧪 Unit | `WalletVerification should require verified` | Interface |

#### `src/types/venue-settings.types.ts` - Venue Settings Types

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `VenueRules should require requires_approval` | Interface |
| 🧪 Unit | `VenueRules should require blacklist_enabled` | Interface |
| 🧪 Unit | `VenueRules should require allow_international_sales` | Interface |
| 🧪 Unit | `VenueFees should require percentage` | Interface |
| 🧪 Unit | `VenueFees should require currency` | Interface |
| 🧪 Unit | `VenueMarketplaceSettings should extend BaseEntity` | Inheritance |
| 🧪 Unit | `VenueMarketplaceSettings should require venue_id` | Interface |
| 🧪 Unit | `VenueMarketplaceSettings should require is_active` | Interface |
| 🧪 Unit | `VenueMarketplaceSettings should require rules` | Interface |
| 🧪 Unit | `VenueMarketplaceSettings should require fees` | Interface |
| 🧪 Unit | `VenueRestriction should require venue_id` | Interface |
| 🧪 Unit | `VenueRestriction should require restriction_type` | Interface |

---

### 18. IDL

#### `src/idl/marketplace.json` - Anchor IDL Definition

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should have valid JSON structure` | JSON validation |
| 🧪 Unit | `should have version field` | Schema field |
| 🧪 Unit | `should have name as tickettoken` | Name field |
| 🧪 Unit | `should include initializePlatform instruction` | Instruction |
| 🧪 Unit | `should include createVenue instruction` | Instruction |
| 🧪 Unit | `should include verifyVenue instruction` | Instruction |
| 🧪 Unit | `should include createEvent instruction` | Instruction |
| 🧪 Unit | `should include purchaseTickets instruction` | Instruction |
| 🧪 Unit | `should include listTicketOnMarketplace instruction` | Instruction |
| 🧪 Unit | `should include verifyTicket instruction` | Instruction |
| 🧪 Unit | `initializePlatform should have owner account` | Account |
| 🧪 Unit | `initializePlatform should have feeBps arg` | Argument |
| 🧪 Unit | `initializePlatform should have treasury arg` | Argument |
| 🧪 Unit | `createVenue should have venueId arg` | Argument |
| 🧪 Unit | `createVenue should have name arg` | Argument |
| 🧪 Unit | `purchaseTickets should use MintTicketArgs type` | Type reference |
| 🧪 Unit | `listTicketOnMarketplace should have price arg` | Argument |
| 🧪 Unit | `listTicketOnMarketplace should have expiresAt arg` | Argument |
| 🧪 Unit | `Event account should have venue field` | Account field |
| 🧪 Unit | `Event account should have ticketPrice field` | Account field |
| 🧪 Unit | `Event account should have totalTickets field` | Account field |
| 🧪 Unit | `Event account should have transferable field` | Account field |
| 🧪 Unit | `Event account should have resaleable field` | Account field |
| 🧪 Unit | `Platform account should have owner field` | Account field |
| 🧪 Unit | `Platform account should have treasury field` | Account field |
| 🧪 Unit | `Platform account should have feeBps field` | Account field |
| 🧪 Unit | `Venue account should have verified field` | Account field |
| 🧪 Unit | `Venue account should have active field` | Account field |
| 🧪 Unit | `ReentrancyGuard should have isLocked field` | Account field |
| 🧪 Unit | `TicketMetadata type should have section field` | Type field |
| 🧪 Unit | `TicketMetadata type should have row field` | Type field |
| 🧪 Unit | `TicketMetadata type should have seat field` | Type field |
| 🧪 Unit | `MintTicketArgs type should have quantity field` | Type field |
| 🧪 Unit | `CreateEventParams type should have all fields` | Type fields |
| 🧪 Unit | `should include EventCreated event` | Event |
| 🧪 Unit | `should include VenueCreated event` | Event |
| 🧪 Unit | `should include TicketsPurchased event` | Event |
| 🧪 Unit | `should include TicketListedOnMarketplace event` | Event |
| 🧪 Unit | `should include FeeTooHigh error (6000)` | Error code |
| 🧪 Unit | `should include Unauthorized error (6002)` | Error code |
| 🧪 Unit | `should include InsufficientTickets error (6024)` | Error code |
| 🧪 Unit | `should include ReentrancyLocked error (6031)` | Error code |
| 🧪 Unit | `should include ResaleNotAllowed error (6032)` | Error code |
| 🔗 Integration | `should be valid Anchor IDL` | IDL validation |
| 🔗 Integration | `should be usable with Anchor framework` | Anchor integration |

---

### 19. Migrations

#### `src/migrations/001_baseline_marketplace.ts` - Baseline Migration

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `up should enable UUID extension` | Extension |
| 🧪 Unit | `up should create marketplace_listings table` | Table creation |
| 🧪 Unit | `up should create marketplace_listings with all columns` | Columns |
| 🧪 Unit | `up should create marketplace_listings indexes` | Indexes |
| 🧪 Unit | `up should create marketplace_transfers table` | Table creation |
| 🧪 Unit | `up should create marketplace_transfers with Stripe fields` | Columns |
| 🧪 Unit | `up should create marketplace_transfers indexes` | Indexes |
| 🧪 Unit | `up should add payment_method check constraint` | Constraint |
| 🧪 Unit | `up should create platform_fees table` | Table creation |
| 🧪 Unit | `up should create venue_marketplace_settings table` | Table creation |
| 🧪 Unit | `up should create marketplace_price_history table` | Table creation |
| 🧪 Unit | `up should create marketplace_disputes table` | Table creation |
| 🧪 Unit | `up should create dispute_evidence table` | Table creation |
| 🧪 Unit | `up should create tax_transactions table` | Table creation |
| 🧪 Unit | `up should create anti_bot_activities table` | Table creation |
| 🧪 Unit | `up should create anti_bot_violations table` | Table creation |
| 🧪 Unit | `up should create marketplace_blacklist table` | Table creation |
| 🧪 Unit | `up should create expire_marketplace_listings function` | Function |
| 🧪 Unit | `up should create calculate_marketplace_fees function` | Function |
| 🧪 Unit | `up should create get_user_active_listings_count function` | Function |
| 🧪 Unit | `up should enable RLS on all tables` | RLS |
| 🧪 Unit | `up should create tenant_isolation_policy on all tables` | Policy |
| 🧪 Unit | `up should add internal foreign keys` | Foreign keys |
| 🧪 Unit | `up should add cross-service foreign keys` | Foreign keys |
| 🧪 Unit | `down should drop RLS policies` | Rollback |
| 🧪 Unit | `down should disable RLS on all tables` | Rollback |
| 🧪 Unit | `down should drop functions` | Rollback |
| 🧪 Unit | `down should drop tables in correct order` | Rollback |
| 🔗 Integration | `migration should run without errors` | Execution |
| 🔗 Integration | `migration should be reversible` | Rollback |

---

### 20. Seeds

#### `src/seeds/test-data.ts` - Test Data Seed

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should check if user1 exists before creating` | Idempotency |
| 🧪 Unit | `should create seller user with correct fields` | User creation |
| 🧪 Unit | `should check if user2 exists before creating` | Idempotency |
| 🧪 Unit | `should create buyer user with correct fields` | User creation |
| 🧪 Unit | `should hash passwords with bcrypt` | Password hashing |
| 🧪 Unit | `should check if venue exists before creating` | Idempotency |
| 🧪 Unit | `should create venue with correct fields` | Venue creation |
| 🧪 Unit | `should check if venue settings exist before creating` | Idempotency |
| 🧪 Unit | `should create venue marketplace settings` | Settings creation |
| 🧪 Unit | `should check if event exists before creating` | Idempotency |
| 🧪 Unit | `should create event with correct fields` | Event creation |
| 🧪 Unit | `should create ticket type` | Ticket type creation |
| 🧪 Unit | `should create tickets for each ticket ID` | Ticket creation |
| 🧪 Unit | `should check if listings exist before creating` | Idempotency |
| 🧪 Unit | `should create listings with different prices` | Listing creation |
| 🔗 Integration | `seed should run without errors` | Execution |
| 🔗 Integration | `seed should be idempotent` | Idempotency |

#### `src/seeds/marketplace-test-data.ts` - Marketplace Test Data

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should query existing users` | User query |
| 🧪 Unit | `should error if no users found` | Error handling |
| 🧪 Unit | `should query existing venues` | Venue query |
| 🧪 Unit | `should error if no venues found` | Error handling |
| 🧪 Unit | `should create venue settings if not exists` | Settings creation |
| 🧪 Unit | `should query existing events` | Event query |
| 🧪 Unit | `should create event if none exists` | Event creation |
| 🧪 Unit | `should query tickets for event` | Ticket query |
| 🧪 Unit | `should create ticket type if no tickets` | Type creation |
| 🧪 Unit | `should create test tickets` | Ticket creation |
| 🧪 Unit | `should create listings for tickets` | Listing creation |
| 🧪 Unit | `should not duplicate existing listings` | Idempotency |
| 🧪 Unit | `should log summary statistics` | Logging |
| 🔗 Integration | `seed should run without errors` | Execution |
| 🔗 Integration | `seed should handle existing data` | Existing data |

---

## E2E Test Scenarios

### Listing Lifecycle

| Test Name | Description |
|-----------|-------------|
| `should create listing with valid data` | Full listing creation flow |
| `should update listing price` | Price update flow |
| `should cancel listing` | Cancellation flow |
| `should expire listing when event passes` | Expiration job flow |
| `should enforce venue markup limits` | Venue rules enforcement |
| `should require approval when venue configured` | Approval workflow |

### Crypto Purchase Flow

| Test Name | Description |
|-----------|-------------|
| `should complete crypto purchase end-to-end` | Full crypto flow |
| `should initiate transfer and execute blockchain TX` | Blockchain integration |
| `should handle insufficient wallet balance` | Balance check |
| `should handle blockchain service failure` | Error handling |
| `should prevent double purchase with locking` | Concurrency |

### Fiat Purchase Flow

| Test Name | Description |
|-----------|-------------|
| `should complete fiat purchase end-to-end` | Full fiat flow |
| `should create PaymentIntent with correct amounts` | Stripe integration |
| `should process webhook and complete transfer` | Webhook flow |
| `should handle webhook idempotency` | Duplicate handling |
| `should split fees to venue correctly` | Fee distribution |

### Refund Flow

| Test Name | Description |
|-----------|-------------|
| `should process individual refund` | Single refund |
| `should process bulk event cancellation refund` | Bulk refund |
| `should create audit trail for refunds` | Audit logging |

### Dispute Flow

| Test Name | Description |
|-----------|-------------|
| `should create dispute with evidence` | Dispute creation |
| `should allow evidence submission` | Evidence flow |
| `should resolve dispute with refund` | Resolution flow |

### Authentication & Authorization

| Test Name | Description |
|-----------|-------------|
| `should authenticate with valid JWT` | Auth success |
| `should reject invalid JWT` | Auth failure |
| `should enforce admin-only routes` | Admin check |
| `should enforce venue owner routes` | Owner check |
| `should enforce listing ownership` | Ownership check |

---

## Test Infrastructure Requirements

### Dependencies

| Package | Purpose |
|---------|---------|
| `jest` | Test runner |
| `ts-jest` | TypeScript support |
| `@types/jest` | Type definitions |
| `supertest` | HTTP testing |
| `@faker-js/faker` | Test data generation |
| `testcontainers` | Docker containers for integration tests |
| `ioredis-mock` | Redis mocking |
| `stripe-mock` | Stripe API mocking |

### Docker Services for Integration Tests

| Service | Purpose |
|---------|---------|
| PostgreSQL | Database testing |
| Redis | Cache and pub/sub testing |
| LocalStack | AWS service mocking (if needed) |

### Environment Variables for Testing

| Variable | Value |
|----------|-------|
| `NODE_ENV` | `test` |
| `DATABASE_URL` | `postgresql://test:test@localhost:5433/marketplace_test` |
| `REDIS_URL` | `redis://localhost:6380` |
| `JWT_SECRET` | `test-secret-key` |
| `STRIPE_SECRET_KEY` | `sk_test_xxx` |
| `LOG_LEVEL` | `error` |

---

## Priority Matrix

### P0 - Critical (Must Have)

| Area | Reason |
|------|--------|
| Fee calculation tests | Financial accuracy (PAY-1, PAY-H1) |
| JWT auth middleware tests | Security (SEC-H1) |
| HMAC signature tests | Service auth (S2S-1, S2S-2) |
| Stripe webhook tests | Payment processing |
| Idempotency tests | Data integrity (IDP-3) |
| Distributed lock tests | Concurrency safety |

### P1 - High (Should Have)

| Area | Reason |
|------|--------|
| Listing service tests | Core business logic |
| Transfer service tests | Core business logic |
| Rate limiting tests | Abuse prevention (RL-H1, RL-H2) |
| Tenant isolation tests | Multi-tenancy (MT-H3) |
| Circuit breaker tests | Resilience (S2S-3) |
| Refund service tests | Financial operations |

### P2 - Medium (Nice to Have)

| Area | Reason |
|------|--------|
| Search service tests | Non-critical feature |
| Tax reporting tests | Reporting feature |
| Anti-bot tests | Fraud prevention |
| Event bus tests | Async processing |
| Metrics tests | Observability |

### P3 - Low (Future)

| Area | Reason |
|------|--------|
| Type definition tests | Compile-time validation |
| IDL schema tests | Contract validation |
| Seed tests | Dev tooling |
| Controller tests | Thin layer |