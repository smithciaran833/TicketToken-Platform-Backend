# API Gateway Testing Strategy

> **Last Updated:** January 2025
> **Total Files:** 66
> **Files to Test:** 35
> **Files to Skip:** 31

---

## Testing Approach

We follow the Testing Trophy:
- **Static Analysis:** TypeScript + ESLint
- **Unit Tests (Some):** Pure functions, security utils, helpers
- **Integration Tests (Most):** Middleware with real Redis, full proxy flows
- **E2E Tests (Few):** Full user journeys through gateway to services

---

## Infrastructure Requirements

**Unit Tests:** No infrastructure needed

**Integration Tests:** Docker Compose with:
- Redis (port 6380)
- Mock downstream services (auth, venue, ticket, payment)

---

## File Inventory Summary

| Category | Count |
|----------|-------|
| Pure Unit | 11 |
| Unit + Mock | 12 |
| Integration | 13 |
| Skip | 31 |
| **Total** | **66** |

---

## Pure Unit Tests (11 files)

### `config/env-validation.ts`
**Priority:** HIGH
**What it does:** Zod schema validation for 30+ env vars. Production schema stricter (requires strong JWT_SECRET, REDIS_PASSWORD).
**Dependencies:** zod
**Test Cases:**
- Valid env passes validation
- Missing required service URLs fail
- JWT_SECRET < 32 chars fails
- Production rejects default JWT_SECRET value
- Production requires REDIS_PASSWORD >= 8 chars
- Type coercion works (PORT string to number)
- Defaults applied for optional vars
- ZodError formatted with field paths
- logSanitizedConfig doesn't expose password

---

### `config/services.ts`
**Priority:** MEDIUM
**What it does:** Service URL configuration. Falls back to Docker service names.
**Dependencies:** process.env
**Test Cases:**
- getServiceUrl returns env value when present
- getServiceUrl constructs Docker URL when env missing (http://service:port)
- serviceUrls has all 19 services
- All ports are unique
- Default ports are correct (auth:3001, venue:3002, etc.)

---

### `utils/internal-auth.ts`
**Priority:** HIGH
**What it does:** HMAC signatures for service-to-service auth. Signs payload with service name, timestamp, method, URL, body.
**Dependencies:** crypto (built-in)
**Test Cases:**
- generateInternalAuthHeaders returns x-internal-service, x-internal-timestamp, x-internal-signature
- Signature is deterministic for same inputs
- Different body produces different signature
- verifyInternalSignature returns true for valid signature
- verifyInternalSignature returns false for wrong signature
- verifyInternalSignature returns false for tampered body
- verifyInternalSignature returns false for expired timestamp (> 5 min)
- verifyInternalSignature returns false for future timestamp (> 5 min)
- verifyInternalSignature returns false for NaN timestamp
- verifyInternalSignature uses timing-safe comparison
- Round-trip: generate then verify works

---

### `utils/security.ts`
**Priority:** HIGH
**What it does:** Input sanitization, SQL escaping, API key generation, request signature validation, CSRF tokens.
**Dependencies:** crypto (built-in)
**Test Cases:**
- sanitizeInput removes null bytes
- sanitizeInput trims whitespace
- sanitizeInput strips `<script>` tags
- sanitizeInput strips event handlers (onerror, onclick)
- sanitizeInput escapes & < > " ' /
- sanitizeInput recurses into objects
- sanitizeInput handles arrays
- sanitizeInput handles null/undefined
- escapeSqlIdentifier removes special chars
- escapeSqlIdentifier allows alphanumeric and underscore
- generateApiKey returns 43-char base64url string
- generateApiKey returns unique values each call
- validateRequestSignature returns false if no x-signature header
- validateRequestSignature returns false if no x-timestamp header
- validateRequestSignature returns false if timestamp > 5 min old
- validateRequestSignature returns true for valid signature
- validateRequestSignature uses timing-safe comparison
- generateRateLimitKey returns user:id when authenticated
- generateRateLimitKey returns ip:hashedIp when anonymous
- generateCsrfToken returns 64-char hex string
- validateCsrfToken returns true for matching tokens
- validateCsrfToken returns false for mismatched tokens

---

### `utils/errors.ts`
**Priority:** MEDIUM
**What it does:** Error utilities — isOperationalError, sanitizeError.
**Dependencies:** ../types
**Test Cases:**
- isOperationalError returns true for error.isOperational = true
- isOperationalError returns false for error.isOperational = false
- isOperationalError returns true for ECONNREFUSED
- isOperationalError returns true for ETIMEDOUT
- isOperationalError returns true for ECONNRESET
- isOperationalError returns true for ENOTFOUND
- isOperationalError returns true for EPIPE
- isOperationalError returns false for unknown codes
- sanitizeError includes message, statusCode, code
- sanitizeError defaults statusCode to 500
- sanitizeError includes stack in development
- sanitizeError excludes stack in production

---

### `utils/helpers.ts`
**Priority:** MEDIUM
**What it does:** General utilities — ID generation, sleep, retry, boolean parsing, chunking, deep merge, masking, bytes formatting.
**Dependencies:** crypto (built-in)
**Test Cases:**
- generateId returns 32-char hex string
- generateId with prefix returns prefix_32chars
- generateId returns unique values
- sleep resolves after specified time
- retry succeeds on first try, no delay
- retry retries on failure
- retry gives up after max retries, throws last error
- retry uses exponential backoff (delay doubles)
- parseBoolean returns true for 'true'
- parseBoolean returns true for 'TRUE'
- parseBoolean returns false for 'false'
- parseBoolean returns default for undefined
- chunk splits [1,2,3,4,5] with size 2 into [[1,2],[3,4],[5]]
- chunk handles empty array
- chunk handles array smaller than size
- deepMerge combines objects
- deepMerge overwrites primitives
- deepMerge recursively merges nested objects
- deepMerge doesn't mutate originals
- maskSensitiveData('1234567890', 4) returns '******7890'
- maskSensitiveData masks short strings entirely
- formatBytes(0) returns '0 Bytes'
- formatBytes(1024) returns '1 KB'
- formatBytes(1048576) returns '1 MB'

---

### `utils/deprecation.ts`
**Priority:** LOW
**What it does:** RFC-compliant deprecation headers (Deprecation, Sunset, Link).
**Dependencies:** FastifyReply (typing only)
**Test Cases:**
- addDeprecationHeaders sets Deprecation: true when no date
- addDeprecationHeaders sets Deprecation to UTC date string when date provided
- addDeprecationHeaders sets Sunset header to UTC date
- addDeprecationHeaders sets Link header with rel="deprecation" for migration guide
- addDeprecationHeaders sets Link header with rel="successor-version" for alternative
- addDeprecationHeaders combines multiple links with comma
- deprecationMiddleware adds headers for registered path
- deprecationMiddleware does nothing for unregistered path
- deprecationMiddleware strips query string before lookup

---

### `services/load-balancer.service.ts`
**Priority:** MEDIUM
**What it does:** Load balancing — round-robin, least-connections, random, consistent-hash.
**Dependencies:** crypto (built-in)
**Test Cases:**
- selectInstance throws when no instances
- selectInstance filters unhealthy instances
- selectInstance uses all instances when none healthy (logs warning)
- roundRobin cycles through instances in order
- roundRobin wraps around after reaching end
- leastConnections selects instance with lowest count
- leastConnections increments count on select
- leastConnections handles tie (picks first)
- random returns valid instance
- random distributes roughly evenly over many calls
- consistentHash returns same instance for same key
- consistentHash distributes across instances for different keys
- consistentHash falls back to random without sessionKey
- releaseConnection decrements count
- releaseConnection doesn't go below 0
- reset clears specific service counters
- reset clears all counters when no service specified
- getState returns counters and connections map

---

### `services/retry.service.ts`
**Priority:** MEDIUM
**What it does:** Retry with exponential backoff, jitter, service-specific configs.
**Dependencies:** None
**Test Cases:**
- executeWithRetry returns on first success
- executeWithRetry retries on failure
- executeWithRetry throws after maxRetries exhausted
- executeWithRetry uses custom options when provided
- shouldRetry returns false when attempts exhausted
- shouldRetry returns false for 4xx errors (client errors)
- shouldRetry returns true for ECONNRESET
- shouldRetry returns true for ETIMEDOUT
- shouldRetry returns true for ECONNREFUSED
- shouldRetry returns true for 5xx errors
- shouldRetry returns true for timeout in message
- calculateDelay uses exponential backoff (base * multiplier^(attempt-1))
- calculateDelay respects maxDelay cap
- calculateDelay adds jitter when enabled (±10%)
- calculateDelay is deterministic when jitter disabled
- getServiceRetryConfig returns nft-service config (5 retries, 5s base)
- getServiceRetryConfig returns payment-service config (3 retries, 2s base)
- getServiceRetryConfig returns empty object for unknown service

---

### `services/timeout.service.ts`
**Priority:** MEDIUM
**What it does:** Timeout management, per-endpoint timeouts, cascading timeout controller.
**Dependencies:** config, timeoutConfig
**Test Cases:**
- executeWithTimeout resolves when fn completes in time
- executeWithTimeout rejects with timeout message when fn slow
- calculateTimeout returns endpoint-specific timeout when matched
- calculateTimeout returns service default when no endpoint match
- calculateTimeout returns payment timeout (30s) for /payments URLs
- calculateTimeout returns nftMinting timeout (120s) for /nft URLs
- calculateTimeout returns default (10s) for unknown paths
- TimeoutController.getRemaining decreases over time
- TimeoutController.getRemaining returns 0 after deadline
- TimeoutController.allocate returns percentage of remaining
- TimeoutController.allocate tracks consumed time
- TimeoutController.hasExpired returns false before deadline
- TimeoutController.hasExpired returns true after deadline
- TimeoutController.getElapsed returns correct duration
- TimeoutController.getStats returns full object with all fields

---

### `schemas/index.ts`
**Priority:** HIGH
**What it does:** Joi validation schemas for gateway-level defense-in-depth.
**Dependencies:** Joi
**Test Cases:**
- getSchema returns correct schema by name
- getSchema returns undefined for unknown name
- **processPayment:**
  - Validates all required fields
  - Rejects missing venueId
  - Rejects invalid UUID for eventId
  - Enforces max 10 tickets per item (quantity)
  - Enforces max 50 items in tickets array
  - Requires deviceFingerprint
  - paymentMethod.type must be card|ach|paypal|crypto
- **calculateFees:**
  - Requires venueId, amount, ticketCount
  - Enforces max amount 1000000 ($10,000)
  - Enforces max ticketCount 100
- **purchaseTickets:**
  - Requires eventId and tickets array
  - Validates nested ticketTypeId as UUID
- **createTicketType:**
  - Requires name 1-100 chars
  - Enforces priceCents max 100000000
  - Requires ISO date format for saleStartDate/saleEndDate
- **transferTicket:**
  - Requires ticketId and toUserId as UUIDs
- **validateQR:**
  - Requires qrCode (max 5000 chars) and eventId
- **login:**
  - Validates email format
  - Enforces password min 8, max 128 chars
  - mfaCode optional, must be 6 chars
- **register:**
  - Requires acceptTerms: true (boolean)
  - Validates phone pattern
- **createListing:**
  - Requires ticketId, price, venueId
  - Enforces max price 1000000

---

## Unit + Mock Tests (12 files)

### `config/index.ts`
**Priority:** MEDIUM
**What it does:** Main config object with requireEnv/optionalEnv helpers.
**Mock:** process.env
**Test Cases:**
- requireEnv throws in production if missing and no default
- requireEnv uses devDefault in non-prod
- requireEnv returns env value when present
- requireEnv logs warning when using devDefault
- optionalEnv returns env value when present
- optionalEnv returns default when missing
- config.server.port parses as number
- config.redis.port parses as number
- config.cors.origin splits comma-separated string into array
- config.rateLimit.enabled is false when RATE_LIMIT_ENABLED=false
- timeoutConfig has correct structure for ticket/nft/payment services

---

### `config/redis.ts`
**Priority:** MEDIUM
**What it does:** Lazy Redis initialization wrapper around @tickettoken/shared.
**Mock:** @tickettoken/shared (getRedisClient, getRedisPubClient, getRedisSubClient, getConnectionManager)
**Test Cases:**
- getRedis() throws if not initialized
- getPub() throws if not initialized
- getSub() throws if not initialized
- initRedis() initializes all three clients
- initRedis() is idempotent (second call is no-op)
- closeRedisConnections() calls connectionManager.disconnect()
- closeRedisConnections() resets initialized flag
- REDIS_KEYS has correct prefixes (SESSION:, REFRESH_TOKEN:, etc.)
- REDIS_TTL has correct values (CACHE_SHORT: 60, etc.)

---

### `services/proxy.service.ts`
**Priority:** HIGH
**What it does:** Core proxy logic. Forwards requests, transforms errors.
**Mock:** axios, serviceUrls
**Test Cases:**
- getServiceUrl returns correct URL for known service
- getServiceUrl returns undefined for unknown service
- setForwardedHeaders sets x-forwarded-for
- setForwardedHeaders sets x-forwarded-proto
- setForwardedHeaders sets x-forwarded-host
- setForwardedHeaders sets x-forwarded-port
- forward throws ServiceNotFoundError for unknown service
- forward makes request with correct method
- forward makes request with correct URL (serviceUrl + request.url)
- forward passes headers through
- forward passes body through
- forward uses default timeout of 10000ms
- forward uses custom timeout from options
- transformError returns ServiceUnavailableError for ECONNREFUSED
- transformError returns ServiceUnavailableError for ENOTFOUND
- transformError returns ServiceUnavailableError for ECONNRESET
- transformError returns ServiceTimeoutError for ECONNABORTED
- transformError returns ServiceTimeoutError for ETIMEDOUT
- transformError returns BadGatewayError for 5xx response
- transformError returns ProxyError with original status for 4xx
- transformError returns BadGatewayError for unknown axios error
- transformError returns BadGatewayError for non-axios error
- ServiceNotFoundError has statusCode 500, code SERVICE_NOT_FOUND
- ServiceUnavailableError has statusCode 503
- ServiceTimeoutError has statusCode 504, includes timeout value
- BadGatewayError has statusCode 502

---

### `services/aggregator.service.ts`
**Priority:** MEDIUM
**What it does:** Aggregates data from multiple services. Required sources must succeed, optional use fallback.
**Mock:** ProxyService
**Test Cases:**
- aggregate returns merged data from all sources
- aggregate includes _metadata with timestamp
- aggregate includes source status in _metadata
- executeRequired executes all in parallel
- executeRequired applies transform when provided
- executeRequired throws when any required source fails
- executeRequired error message includes source name
- executeOptional uses fallback on error
- executeOptional uses fallback on timeout (2s)
- executeOptional applies transform when provided
- executeOptional doesn't throw on failure
- mergeResults combines required and optional
- getEventDetails fetches event, venue, tickets as required
- getEventDetails fetches nftStatus, analytics as optional with fallbacks
- getUserDashboard fetches profile, tickets as required
- getUserDashboard fetches nfts, transactions as optional with fallbacks

---

### `services/circuit-breaker.service.ts`
**Priority:** MEDIUM
**What it does:** Manages opossum circuit breakers for all services.
**Mock:** opossum, config
**Test Cases:**
- Constructor initializes breakers for all services in config.services
- createBreaker uses correct timeout from config
- createBreaker uses correct errorThresholdPercentage
- createBreaker uses correct resetTimeout
- createBreaker uses correct volumeThreshold
- setupBreakerEvents logs on open
- setupBreakerEvents logs on halfOpen
- setupBreakerEvents logs on close
- execute runs function through breaker
- execute uses fallback when provided and circuit open
- execute runs directly when no breaker found (logs warning)
- getState returns OPEN when breaker.opened is true
- getState returns HALF_OPEN when breaker.pendingClose is true
- getState returns CLOSED otherwise
- getState returns CLOSED for unknown service
- getStats returns null for unknown service
- getStats returns breaker.stats for known service
- getAllStats returns stats for all services

---

### `services/service-discovery.service.ts`
**Priority:** LOW
**What it does:** Service discovery with caching. Uses static instances from config.
**Mock:** Redis, axios, config
**Test Cases:**
- discover returns cached instances within 30s
- discover fetches fresh after 30s
- discover returns static instances from config
- discover parses URL correctly (hostname, port)
- discover handles invalid URL gracefully
- discover returns empty array for unknown service
- register stores in Redis with TTL (when Redis available)
- register logs registration
- register handles missing Redis gracefully
- deregister deletes matching keys
- getHealthyInstances filters out unhealthy
- checkInstanceHealth returns true when Redis unavailable
- checkInstanceHealth reads from Redis health key
- performHealthCheck calls GET /health on instance
- performHealthCheck marks healthy on 200
- performHealthCheck marks unhealthy on error
- getServiceTopology returns all services

---

### `middleware/validation.middleware.ts`
**Priority:** MEDIUM
**What it does:** Gateway-level validation using Joi schemas.
**Mock:** schemas/getSchema
**Test Cases:**
- setupValidationMiddleware configures Fastify validator
- validateBody passes through if schema not found (logs warning)
- validateBody returns 400 with GATEWAY_VALIDATION_ERROR on failure
- validateBody error response includes field path
- validateBody error response includes message
- validateBody error response includes type
- validateBody error response includes requestId
- validateBody error response includes timestamp
- validateBody passes on valid data
- validateBody uses abortEarly: false (collects all errors)
- validateQuery returns 400 with GATEWAY_QUERY_VALIDATION_ERROR
- validateQuery collects all errors
- validateUuidParam returns 400 for invalid UUID
- validateUuidParam accepts valid UUID v1
- validateUuidParam accepts valid UUID v4
- validateUuidParam passes if param not present in request

---

### `middleware/cors.middleware.ts`
**Priority:** MEDIUM
**What it does:** CORS with strict mode option, subdomain patterns.
**Mock:** @fastify/cors, config
**Test Cases:**
- Allows no-origin requests by default (mobile apps, server-to-server)
- Blocks no-origin in strict mode (CORS_STRICT=true, production)
- Allows localhost origins in development
- Allows 127.0.0.1 in development
- Allows exact match from config.cors.origin
- Allows when origin list contains '*'
- Allows subdomain pattern *.tickettoken.com
- Blocks unknown origins not in list
- Logs blocked origins
- Sets correct methods (GET, POST, PUT, PATCH, DELETE, OPTIONS)
- Sets correct allowedHeaders
- Sets correct exposedHeaders (including rate limit headers)
- Sets maxAge to 86400 (24 hours)
- Sets credentials from config

---

### `middleware/timeout.middleware.ts`
**Priority:** MEDIUM
**What it does:** Request timeout management with cascading budgets.
**Mock:** config, timeoutConfig
**Test Cases:**
- onRequest hook sets timeoutBudget on request
- onRequest hook sets x-request-deadline header
- preHandler throws ServiceUnavailableError when budget exhausted
- preHandler updates remaining time correctly
- timeout handler returns 504 when deadline reached
- timeout handler includes requestId in response
- timeout cleared on response finish
- calculateTimeout returns endpoint-specific for matched pattern
- calculateTimeout returns payment timeout for /payment paths
- calculateTimeout returns nftMinting timeout for /nft and /mint paths
- calculateTimeout returns default for unmatched paths
- DistributedTimeoutCoordinator.calculateDownstreamTimeout subtracts 1s buffer
- DistributedTimeoutCoordinator.calculateDownstreamTimeout respects min timeout
- DistributedTimeoutCoordinator.calculateDownstreamTimeout throws when exhausted
- DistributedTimeoutCoordinator.propagateTimeout adds x-request-deadline header
- DistributedTimeoutCoordinator.propagateTimeout adds x-timeout-remaining header
- DistributedTimeoutCoordinator.propagateTimeout sets request timeout with 100ms buffer

---

### `middleware/error-handler.middleware.ts`
**Priority:** HIGH
**What it does:** RFC 7807 Problem Details error responses. Handles all error types.
**Mock:** logger
**Test Cases:**
- 404 handler returns application/problem+json content type
- 404 handler includes type as URI
- 404 handler includes title 'Not Found'
- 404 handler includes status 404
- 404 handler includes detail with URL
- 404 handler includes correlationId
- 404 handler includes timestamp
- Global error handler handles ApiError correctly
- ApiError response includes correct statusCode
- ApiError response includes code from error
- ApiError includes details in non-production
- ApiError excludes details in production
- Validation error returns status 422
- Validation error includes errors array
- formatValidationErrors maps field, message, value, constraint
- HTTP error uses statusCode from error
- HTTP error logs error level for 5xx
- HTTP error logs warn level for 4xx
- Unknown error returns 500
- Unknown error includes stack in non-production
- Unknown error excludes stack in production
- Sets Content-Type: application/problem+json
- Sets X-Correlation-ID header
- Sets X-Request-ID header (legacy)
- Sets Cache-Control: no-store
- Sets Retry-After header for 429 errors
- getErrorTypeFromStatus returns correct mappings (400→bad-request, etc.)
- getErrorTitleFromStatus returns correct mappings
- errorRecoveryMiddleware logs unhandledRejection
- errorRecoveryMiddleware exits on uncaughtException
- errorRecoveryMiddleware logs Node.js warnings

---

### `middleware/domain-routing.middleware.ts`
**Priority:** MEDIUM
**What it does:** White-label domain routing. Looks up venue by custom domain.
**Mock:** axios
**Test Cases:**
- Skips for tickettoken.com
- Skips for localhost
- Skips for 127.0.0.1
- Skips for *.tickettoken.com subdomains
- Calls venue service for custom domains
- Uses correct URL: ${VENUE_SERVICE_URL}/api/v1/branding/domain/${hostname}
- Uses 2s timeout
- Includes X-Request-ID in outbound request
- Attaches venue to request on success
- Attaches branding to request on success
- Attaches isWhiteLabel from venue.hide_platform_branding
- Attaches domainVenueContext with venueId, isWhiteLabel, pricingTier, source
- Continues on 404 (domain not found)
- Logs warning on non-404 errors
- Continues on any error (doesn't break request)

---

### `middleware/logging.middleware.ts`
**Priority:** LOW
**What it does:** Request/response logging, slow request detection.
**Mock:** logger utils
**Test Cases:**
- Skips logging for /health routes
- Skips logging for /ready
- Skips logging for /metrics
- Logs incoming requests via logRequest
- Logs responses via logResponse with responseTime
- Logs slow requests (>1000ms) with performanceLogger.warn
- Slow request log includes method, url, route, responseTime, statusCode
- onRoute hook logs route registration at debug level

---

## Integration Tests (13 files)

> **Requires:** Docker Compose with Redis + mock downstream services

### `middleware/auth.middleware.ts`
**Priority:** HIGH
**What it does:** JWT auth and RBAC. Caches user details. Checks venue-scoped permissions.
**Infrastructure:** Redis, mock auth-service, mock venue-service
**Test Cases:**
- **Authentication:**
  - Returns 401 for missing Authorization header
  - Returns 401 for non-Bearer token format
  - Returns 401 for blacklisted token (checks Redis)
  - Returns 401 for invalid/expired JWT
  - Returns 401 for token with type !== 'access'
  - Returns 401 for token missing tenant_id
  - Returns 401 when user not found in auth-service
  - Attaches user to request on success
  - User object includes id, email, role, tenant_id, permissions
  - Caches user in Redis for 5 minutes
  - Uses cached user on subsequent requests
- **Authorization (requirePermission):**
  - Calls authenticate first
  - Allows admin role (permissions: ['*'])
  - Allows exact permission match
  - Allows wildcard permission (events:* matches events:create)
  - Allows -own permissions when user owns resource
  - Returns 403 when permission denied
  - Logs security event on denial
  - Checks venue access for venue-scoped roles
  - Returns 403 when venue access denied
  - Caches venue access result
- **RBAC Config:**
  - venue-owner has all permissions, venueScoped: true
  - venue-manager has correct permissions
  - box-office has tickets:sell, payments:process, etc.
  - door-staff only has tickets:validate, tickets:view
  - customer has tickets:purchase, tickets:view-own, etc.
  - admin has all permissions, venueScoped: false
- **Token Refresh:**
  - Returns 401 for missing refreshToken
  - Returns 401 for invalid refresh token
  - Returns 401 for token with type !== 'refresh'
  - Returns 401 for reused token (not in Redis) — logs critical security event
  - Returns new accessToken and refreshToken
  - Preserves tenant_id in new tokens
  - Invalidates old refresh token in Redis
  - Stores new refresh token in Redis

---

### `middleware/rate-limit.middleware.ts`
**Priority:** HIGH
**What it does:** Multi-tier rate limiting with Redis atomic operations.
**Infrastructure:** Redis
**Test Cases:**
- **Global Rate Limit:**
  - Skips when RATE_LIMIT_ENABLED=false
  - Uses user ID as key when authenticated
  - Uses API key as key when x-api-key header present
  - Uses hashed IP as key when anonymous
  - Returns 429 with correct body when exceeded
  - Response includes rateLimit.limit, remaining, reset
  - Logs warning when approaching limit (onExceeding)
  - Logs error and security event when exceeded (onExceeded)
  - skipOnError: true allows requests when Redis down
- **Ticket Purchase Rate Limit:**
  - Only applies to /tickets/purchase
  - Uses sliding window from @tickettoken/shared
  - Key includes userId and eventId
  - Returns 429 with Retry-After header when exceeded
  - Sets X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset headers
  - Logs potential_ticket_bot when attemptCount > 10
  - Fails open on Redis error (allows request, logs error)
- **Venue Tier Rate Limiting:**
  - Multiplies base limit by 10 for premium tier
  - Multiplies base limit by 5 for standard tier
  - Uses base limit for free tier
  - Stores adjusted limit in request.rateLimitMax
- **Dynamic Adjustment:**
  - Reduces limits by 50% when memory load > 80%
  - Restores normal limits when memory load < 50%
  - Stores adjustment in Redis with 60s TTL
- **API Key Rate Limiting:**
  - Returns false for unknown API key
  - Respects per-key rateLimit from stored data
  - Falls back to venueApi.max (100) when no key limit

---

### `middleware/venue-isolation.middleware.ts`
**Priority:** HIGH
**What it does:** Enforces venue isolation. Extracts venue ID from trusted sources only.
**Infrastructure:** Redis
**Test Cases:**
- **Main Hook:**
  - Skips for /health routes
  - Skips for /ready
  - Skips for /metrics
  - Skips for /api/v1/auth routes
  - Skips when no venue ID extracted
  - Skips when no user (auth handles)
  - Throws NotFoundError (NOT AuthorizationError) when access denied
  - Logs admin bypass for audit trail
  - Attaches venueContext to request (venueId, userId, role, permissions)
- **extractVenueId (SECURITY CRITICAL):**
  - Returns route param venueId first (/:venueId)
  - Returns query param venueId second (?venueId=)
  - Returns user.venueId from JWT third
  - IGNORES request.body.venueId (untrusted)
  - IGNORES x-venue-id header (untrusted)
  - Returns null when no venue found
- **checkUserVenueAccess:**
  - Uses cached result when available
  - Returns hasAccess: true, isAdminBypass: true for admin role
  - Returns hasAccess based on userData.venueId === venueId
  - Caches result for CACHE_MEDIUM (300s)
- **API Key Validation:**
  - Validates API key has access to requested venue
  - Logs cross_venue_api_attempt at critical severity
  - Returns false for unknown API key
  - Returns true for non-venue-specific resources
- **checkVenuePermission:**
  - Returns false when user not in Redis
  - Returns true for admin (logs security event)
  - Returns false when venue mismatch
  - Checks role-based permissions
  - Handles wildcard permissions
- **checkVenueTierAccess:**
  - free < standard < premium
  - Returns true when currentTier >= requiredTier
- **getVenueRateLimit:**
  - Returns base limit * tier multiplier
  - premium: 10x, standard: 5x, free: 1x

---

### `middleware/circuit-breaker.middleware.ts`
**Priority:** MEDIUM
**What it does:** Creates circuit breakers for all services with service-specific configs.
**Infrastructure:** Redis (for state persistence, optional)
**Test Cases:**
- Creates breakers for all services in CIRCUIT_BREAKER_CONFIGS
- auth-service: timeout 5000ms
- venue-service: timeout 10000ms
- payment-service: timeout 30000ms
- blockchain-service: timeout 60000ms
- minting-service: timeout 90000ms
- compliance-service: errorThresholdPercentage 40 (lower)
- analytics-service: errorThresholdPercentage 60 (more tolerant)
- Logs error when circuit opens
- Logs info when circuit half-opens
- getCircuitBreaker returns correct breaker
- getCircuitBreaker returns undefined for unknown service
- monitorCircuitBreakers logs metrics every 60s

---

### `middleware/response-cache.ts`
**Priority:** MEDIUM
**What it does:** Response caching for GET/HEAD with Redis.
**Infrastructure:** Redis
**Test Cases:**
- Only caches GET requests
- Only caches HEAD requests
- Skips POST/PUT/DELETE/PATCH
- Skips routes not in routeCacheConfig
- Skips when condition returns false
- Cache key format: gateway:response:{method}:{path}
- Includes varyBy params in key
- Includes user ID in key when config.private: true
- Skips private cache for unauthenticated users
- Includes venue ID in key when venueContext present
- Returns cached response with X-Cache: HIT
- Returns X-Cache-Key header (truncated)
- Returns X-Cache-TTL header
- Sets X-Cache: MISS on cache miss
- Stores cacheConfig on request for onSend
- onSend stores response in cache on 200
- onSend doesn't store on non-200
- onSend handles JSON parse errors gracefully
- TTLs: /api/events: 600s, /api/venues: 1800s, /api/tickets/availability: 30s, /api/search: 300s
- Invalidation endpoint requires patterns array
- Invalidation returns 400 without patterns
- Invalidation calls cacheManager.invalidate for each pattern

---

### `middleware/redis.middleware.ts`
**Priority:** MEDIUM
**What it does:** Initializes Redis connection and decorates server.
**Infrastructure:** Redis
**Test Cases:**
- Connects to Redis with config.redis.host
- Connects with config.redis.port
- Skips password when empty/undefined
- Includes password when provided
- Pings after connect to verify
- Decorates server with redis instance
- Registers onClose hook
- Closes connection on server close
- Throws on connection failure
- Uses connectTimeout: 5000
- Uses maxRetriesPerRequest: 1
- Uses enableOfflineQueue: false
- Uses lazyConnect: true

---

### `clients/AuthServiceClient.ts`
**Priority:** MEDIUM
**What it does:** HTTP client for auth-service with circuit breaker.
**Infrastructure:** Mock auth-service
**Test Cases:**
- getUserById calls GET /users/:id
- getUserById adds internal auth headers
- getUserById uses circuit breaker when available
- getUserById returns user on success
- getUserById returns null on 404
- getUserById returns null on ECONNREFUSED
- getUserById returns null on ETIMEDOUT
- getUserById logs error appropriately
- validateToken calls POST /auth/validate
- validateToken sends token in body
- validateToken adds internal auth headers
- validateToken returns { valid: true, user } on success
- validateToken returns { valid: false } on error
- healthCheck calls GET /health
- healthCheck uses 2s timeout
- healthCheck returns true on 200
- healthCheck returns false on error

---

### `clients/VenueServiceClient.ts`
**Priority:** HIGH
**What it does:** HTTP client for venue-service. CRITICAL: fails secure.
**Infrastructure:** Mock venue-service
**Test Cases:**
- **checkUserVenueAccess (SECURITY CRITICAL):**
  - Calls POST /internal/access-check
  - Sends userId, venueId, permission in body
  - Adds internal auth headers
  - Returns true when hasAccess: true
  - Returns false when hasAccess: false
  - Logs security event on denied access
  - **RETURNS FALSE on ECONNREFUSED (fail secure)**
  - **RETURNS FALSE on ETIMEDOUT (fail secure)**
  - **RETURNS FALSE on any error (fail secure)**
  - Logs high severity on error
- getUserVenues calls GET /internal/users/:id/venues
- getUserVenues adds internal auth headers
- getUserVenues returns venues array on success
- getUserVenues returns empty array on error
- getVenueById calls GET /api/v1/venues/:id
- getVenueById returns venue on success
- getVenueById returns null on 404
- getVenueById returns null on error
- healthCheck calls GET /health with 2s timeout
- healthCheck returns boolean

---

### `routes/authenticated-proxy.ts`
**Priority:** HIGH
**What it does:** Core proxy factory. Filters headers, adds internal auth.
**Infrastructure:** Mock downstream service
**Test Cases:**
- **filterHeaders (SECURITY CRITICAL):**
  - Blocks x-gateway-internal
  - Blocks x-gateway-forwarded
  - Blocks x-venue-id
  - Blocks x-internal-service
  - Blocks x-internal-signature
  - Blocks x-internal-timestamp
  - Blocks x-admin-token
  - Blocks x-privileged
  - Blocks x-tenant-id
  - Blocks host, connection, keep-alive
  - Allows accept
  - Allows authorization
  - Allows content-type
  - Allows x-request-id
  - Allows x-correlation-id
  - Allows x-api-key
  - Allows idempotency-key
  - Allows x-custom-* headers
- **proxyHandler:**
  - Adds x-request-id from request.id
  - Adds x-correlation-id from request.id
  - Adds x-gateway-forwarded: true
  - Adds x-original-ip from request.ip
  - Extracts tenant_id from JWT and sets x-tenant-id
  - Sets x-tenant-source: jwt
  - Adds x-user-id from JWT
  - Adds internal auth headers (HMAC signed)
  - Forwards filtered headers
  - Forwards body
  - Forwards query params
  - Returns downstream response status
  - Filters x-internal-* from response headers
  - Returns 504 on ECONNABORTED
  - Returns 504 on ETIMEDOUT
  - Returns 503 on ECONNREFUSED
  - Returns 502 on other errors
  - Error responses include correlationId
- **Route Setup:**
  - Authenticates for non-public paths
  - Skips auth for exact publicPaths match
  - Skips auth for publicPaths with wildcard pattern
  - Handles wildcard routes (/*) correctly

---

### `routes/health.routes.ts`
**Priority:** MEDIUM
**What it does:** Kubernetes health probes.
**Infrastructure:** Redis, mock auth-service, mock venue-service
**Test Cases:**
- **/health (legacy):**
  - Returns status: ok
  - Returns timestamp as ISO string
  - Returns uptime in seconds
  - Returns memory usage object
  - Returns pid
  - Returns version
  - Returns circuitBreakers state for each service
- **/health/live:**
  - Always returns { status: 'ok' }
  - Never fails (liveness probe)
- **/health/ready:**
  - Returns 200 when all healthy
  - Returns 503 when Redis ping fails
  - Returns 503 when auth-service circuit breaker OPEN
  - Returns 503 when venue-service circuit breaker OPEN
  - Returns 503 when auth-service health check fails
  - Returns 503 when venue-service health check fails
  - Includes checks object with individual status
  - Times out individual checks at 2s
  - checks.memory is 'warning' when heap > 1GB
  - checks.redis is 'slow' when ping > 100ms
- **/health/startup:**
  - Returns 503 with initialized: false before markInitialized()
  - Returns 200 with initialized: true after markInitialized()
  - markInitialized() sets global flag
- **Legacy endpoints:**
  - /ready redirects to /health/ready
  - /live returns { status: 'alive' }

---

### `routes/tickets.routes.ts`
**Priority:** HIGH
**What it does:** Ticket routes with validation and idempotency.
**Infrastructure:** Mock ticket-service
**Test Cases:**
- **validateIdempotencyKey:**
  - Returns true (allows) when header missing
  - Returns true for valid format (alphanumeric, dash, underscore)
  - Returns false and 400 for invalid characters
  - Returns false and 400 for > 128 chars
  - Returns false and 400 for empty string
- **POST /purchase:**
  - Requires authentication
  - Validates body with purchaseTickets schema
  - Validates idempotency key
  - Proxies to ticket-service /purchase
  - Uses 30s timeout
- **POST /types:**
  - Requires authentication
  - Validates body with createTicketType schema
- **POST /transfer:**
  - Requires authentication
  - Validates body with transferTicket schema
  - Validates idempotency key
- **POST /validate-qr:**
  - Requires authentication
  - Validates body with validateQR schema
- **proxyToTicketService:**
  - Adds internal auth headers
  - Adds x-tenant-id from JWT
  - Adds x-user-id from JWT
  - Forwards idempotency-key header
  - Returns 503 on ECONNREFUSED
  - Returns 504 on ETIMEDOUT
  - Returns 502 on other errors
  - All errors include correlationId

---

### `routes/payment.routes.ts`
**Priority:** HIGH
**What it does:** Payment routes with validation.
**Infrastructure:** Mock payment-service
**Test Cases:**
- **POST /:**
  - Requires authentication
  - Validates body with processPayment schema
  - Proxies to payment-service
- **POST /calculate-fees:**
  - Requires authentication
  - Validates body with calculateFees schema
- **POST /:id/refund:**
  - Requires authentication
  - Validates UUID param
  - Validates body with refundTransaction schema
- **proxyToPaymentService:**
  - Adds x-request-id
  - Adds x-gateway-forwarded: true
  - Adds x-original-ip
  - Adds x-tenant-id from JWT
  - Adds x-tenant-source: jwt
  - Uses 30s timeout
  - Returns 503 on ECONNREFUSED
  - Returns 504 on ETIMEDOUT/ECONNABORTED
  - Returns 502 on other errors
- **Other routes via authenticatedProxy:**
  - Public paths: /health, /metrics, /webhooks/*

---

### `routes/webhook.routes.ts`
**Priority:** MEDIUM
**What it does:** Webhook routes with Stripe raw body handling.
**Infrastructure:** Mock payment-service
**Test Cases:**
- **POST /stripe:**
  - Preserves rawBody (doesn't JSON parse)
  - Forwards stripe-signature header exactly
  - Forwards stripe-webhook-id header
  - Sets correct content-length from raw body
  - Adds x-forwarded-for
  - Adds x-original-host
  - Removes undefined headers
  - Uses transformRequest to prevent data transformation
  - Uses 10s timeout
  - Returns 500 on error (allows Stripe retry)
- **ALL /*:**
  - Forwards to payment-service webhooks path
  - Forwards content-type header
  - Forwards x-forwarded-for
  - Uses 10s timeout
  - Returns 500 on error

---

## Files to Skip (31)

### Type Definitions (2 files)
- `types/auth-service.types.ts` — Interfaces only
- `types/venue-service.types.ts` — Interfaces only

### Config/Bootstrap (4 files)
- `config/secrets.ts` — AWS Secrets Manager loading
- `plugins/swagger.ts` — Swagger configuration
- `server.ts` — Application bootstrap
- `index.ts` — Entry point

### Infrastructure (4 files)
- `utils/metrics.ts` — Prometheus metric definitions
- `utils/tracing.ts` — OpenTelemetry setup
- `utils/logger.ts` — Pino logger configuration
- `utils/graceful-shutdown.ts` — Shutdown handlers

### Orchestration (3 files)
- `middleware/index.ts` — Middleware registration
- `services/index.ts` — DI container wiring
- `routes/index.ts` — Route registration

### Thin Proxy Wrappers (16 files)
All these just call `createAuthenticatedProxy()` with config:
- `routes/auth.routes.ts`
- `routes/venues.routes.ts`
- `routes/venue.routes.ts`
- `routes/events.routes.ts`
- `routes/event.routes.ts`
- `routes/ticket.routes.ts`
- `routes/marketplace.routes.ts`
- `routes/analytics.routes.ts`
- `routes/notification.routes.ts`
- `routes/compliance.routes.ts`
- `routes/queue.routes.ts`
- `routes/search.routes.ts`
- `routes/integration.routes.ts`
- `routes/file.routes.ts`
- `routes/monitoring.routes.ts`

### Metrics (2 files)
- `middleware/metrics.middleware.ts` — Prometheus hooks

---

## Execution Order

### Phase 1: Pure Unit Tests (No Infrastructure)
Run first, run often, fast feedback.

1. utils/internal-auth.ts (HIGH — security)
2. utils/security.ts (HIGH — security)
3. schemas/index.ts (HIGH — validation)
4. config/env-validation.ts (HIGH — startup)
5. config/services.ts (MEDIUM)
6. utils/helpers.ts (MEDIUM)
7. utils/errors.ts (MEDIUM)
8. services/load-balancer.service.ts (MEDIUM)
9. services/retry.service.ts (MEDIUM)
10. services/timeout.service.ts (MEDIUM)
11. utils/deprecation.ts (LOW)

### Phase 2: Unit + Mock Tests
Run in CI, parallelizable.

HIGH Priority:
1. services/proxy.service.ts
2. middleware/error-handler.middleware.ts

MEDIUM Priority:
3. config/index.ts
4. config/redis.ts
5. services/aggregator.service.ts
6. services/circuit-breaker.service.ts
7. middleware/validation.middleware.ts
8. middleware/cors.middleware.ts
9. middleware/timeout.middleware.ts
10. middleware/domain-routing.middleware.ts

LOW Priority:
11. services/service-discovery.service.ts
12. middleware/logging.middleware.ts

### Phase 3: Integration Tests (Docker Required)
Run before merge, require Redis + mock services.

SECURITY CRITICAL (must pass):
1. middleware/auth.middleware.ts
2. middleware/venue-isolation.middleware.ts
3. clients/VenueServiceClient.ts (fail-secure)
4. routes/authenticated-proxy.ts (header filtering)

HIGH Priority:
5. middleware/rate-limit.middleware.ts
6. routes/tickets.routes.ts
7. routes/payment.routes.ts

MEDIUM Priority:
8. middleware/circuit-breaker.middleware.ts
9. middleware/response-cache.ts
10. middleware/redis.middleware.ts
11. clients/AuthServiceClient.ts
12. routes/health.routes.ts
13. routes/webhook.routes.ts

---

## Coverage Targets

| Category | Target |
|----------|--------|
| Pure Unit | 95%+ |
| Unit + Mock | 85%+ |
| Integration | 80%+ |
| Overall | 85%+ |

**Security-critical files must have 100% coverage:**
- utils/internal-auth.ts
- utils/security.ts
- middleware/auth.middleware.ts
- middleware/venue-isolation.middleware.ts
- routes/authenticated-proxy.ts
- clients/VenueServiceClient.ts

---

## Docker Compose for Integration Tests
```yaml
version: '3.8'
services:
  redis-test:
    image: redis:7-alpine
    ports:
      - "6380:6379"
    command: redis-server --save "" --appendonly no

  mock-auth-service:
    build:
      context: ./test/mocks
      dockerfile: Dockerfile.auth
    ports:
      - "3001:3001"
    environment:
      - PORT=3001

  mock-venue-service:
    build:
      context: ./test/mocks
      dockerfile: Dockerfile.venue
    ports:
      - "3002:3002"
    environment:
      - PORT=3002

  mock-ticket-service:
    build:
      context: ./test/mocks
      dockerfile: Dockerfile.ticket
    ports:
      - "3004:3004"
    environment:
      - PORT=3004

  mock-payment-service:
    build:
      context: ./test/mocks
      dockerfile: Dockerfile.payment
    ports:
      - "3005:3005"
    environment:
      - PORT=3005
```

---

## Security Tests Checklist

Non-negotiable tests that must exist and pass:

- [ ] Header filtering blocks x-tenant-id from external requests
- [ ] Header filtering blocks x-venue-id from external requests
- [ ] Header filtering blocks x-internal-* headers
- [ ] Tenant ID extracted from JWT only, never from headers
- [ ] Venue ID extracted from trusted sources only (route, query, JWT)
- [ ] VenueServiceClient returns false on ANY error (fail-secure)
- [ ] Rate limiting uses atomic Redis operations
- [ ] Internal auth uses timing-safe comparison
- [ ] Input sanitization strips script tags
- [ ] CSRF validation uses timing-safe comparison
- [ ] Blacklisted tokens rejected
- [ ] Expired tokens rejected
- [ ] Missing tenant_id in token rejected

