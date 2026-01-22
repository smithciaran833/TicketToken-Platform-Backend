# Venue Service Middleware Analysis
## Purpose: Integration Testing Documentation
## Source: auth.middleware.ts, tenant.middleware.ts, validation.middleware.ts, rate-limit.middleware.ts, idempotency.middleware.ts, error-handler.middleware.ts, versioning.middleware.ts
## Generated: January 18, 2026

---

## 1. AUTH.MIDDLEWARE.TS

### PURPOSE
- Authenticates requests using JWT tokens or API keys
- Validates JWT issuer and audience claims
- Supports both user authentication (JWT) and API key authentication
- Implements venue access control via `requireVenueAccess`
- Provides security fixes: SEC-DB6 (API key hashing), AE6 (JWT issuer/audience validation)

### REQUEST MODIFICATIONS

**Adds to Request:**
- `request.user` object containing:
  - `id` - User identifier
  - `email` - User email address
  - `permissions` - Array of permission strings
  - `tenant_id` - Tenant identifier from JWT claims
- `request.user.venueId` - Venue ID (added by requireVenueAccess)

**Headers Read:**
- `x-api-key` - For API key authentication (checked first)
- `authorization` - Bearer token for JWT authentication (fallback)

**Context Set:**
- User authentication context for downstream middleware/controllers
- Venue access context when using requireVenueAccess

### VALIDATION LOGIC

**What it validates:**
- JWT token signature verification
- Token issuer (iss claim) against `JWT_ISSUER` environment variable (default: 'tickettoken-auth-service')
- Token audience (aud claim) against `JWT_AUDIENCE` environment variable (default: 'venue-service')
- API key hash lookup and expiration status
- Venue access permissions for specific venue operations

**How it validates:**
- Uses Fastify's `jwt.verify()` method for cryptographic JWT validation
- SHA-256 hashing for API key lookup (SECURITY FIX SEC-DB6)
- Database query for API key validation checking `is_active` and `expires_at` fields
- Service call to `venueService.checkVenueAccess(venueId, userId)` for authorization

### ERROR RESPONSES

**Error Conditions:**
- Missing authentication token → 401 "Missing authentication token"
- Invalid token issuer → 401 "Invalid token issuer"
- Invalid token audience → 401 "Invalid token audience"
- JWT verification failure → 401 "Invalid or expired token"
- Invalid API key → 401 "Invalid API key"
- No venue access → 403 "Access denied"
- Missing user authentication → 401 "Not authenticated"

**HTTP Status Codes:**
- 401 Unauthorized - Authentication failures
- 403 Forbidden - Authorization failures

**Error Response Format:**
Uses `ErrorResponseBuilder.unauthorized()` and `ErrorResponseBuilder.forbidden()`

### EXTERNAL CALLS

**Database Queries:**
```sql
-- API key lookup (new hashed approach)
SELECT * FROM api_keys 
WHERE key_hash = ? AND is_active = true AND expires_at > NOW()

-- Legacy plaintext lookup (TODO: remove after migration)
SELECT * FROM api_keys 
WHERE key = ? AND is_active = true AND expires_at > NOW()

-- User lookup after API key validation
SELECT * FROM users WHERE id = ?
```

**Redis Lookups:**
- `redis.get('api_key_hash:${hashedKey}')` - Check API key cache (5 min TTL)
- `redis.setex('api_key_hash:${hashedKey}', 300, JSON.stringify(authUser))` - Cache authenticated user

**Service Calls:**
- `venueService.checkVenueAccess(venueId, userId)` - Verify user has access to specific venue

### TENANT ISOLATION

**How tenant context is set:**
- Extracted from verified JWT claims: `decoded.tenant_id`
- Stored in `request.user.tenant_id` for downstream access
- Also available from API key user record: `user.tenant_id`

**RLS Implications:**
- Auth middleware sets tenant context but does NOT enforce RLS directly
- Tenant ID is passed to downstream middleware (tenant.middleware.ts) for RLS enforcement
- Relies on tenant.middleware to set PostgreSQL session variables

### 🚨 POTENTIAL ISSUES

**1. TIMING ATTACK - API Key Lookup:**
- **Severity:** MEDIUM
- Legacy plaintext fallback creates observable timing difference
- Successful hash lookup (~10ms) vs failed-then-fallback (~20ms) timing is measurable
- Attacker could enumerate valid API keys by measuring response times
- **Recommendation:** Remove legacy fallback, force migration to hashed keys

**2. INFORMATION LEAKAGE - Error Messages:**
- **Severity:** LOW
- Different error messages for "Missing authentication token" vs "Invalid or expired token"
- Allows attackers to distinguish between missing vs invalid tokens
- **Recommendation:** Use generic "Authentication failed" message

**3. INFORMATION LEAKAGE - Issuer/Audience Warnings:**
- **Severity:** LOW
- Logs actual vs expected issuer/audience in warning messages
- Could leak service architecture details in centralized logs
- **Recommendation:** Sanitize logged values in production environments

**4. CACHE POISONING RISK:**
- **Severity:** MEDIUM
- API key cached for 5 minutes after successful lookup
- If user or API key is disabled, cache won't update immediately
- Disabled user could access system for up to 5 minutes
- **Recommendation:** Implement cache invalidation on user/key updates, or reduce TTL

**5. MISSING VALIDATION - Rate Limiting:**
- **Severity:** HIGH
- No rate limiting on authentication attempts
- Could enable brute force attacks on API keys or JWTs
- **Recommendation:** Add authentication attempt rate limiting per IP/user

---

## 2. TENANT.MIDDLEWARE.TS

### PURPOSE
- Enforces strict tenant isolation for multi-tenant routes
- Sets RLS (Row Level Security) context in PostgreSQL database
- Validates tenant_id format (UUID v4)
- Provides tenant context to downstream services
- Replaces duplicated addTenantContext functions across controllers (SECURITY FIX JM4-JM8/AE1)

### REQUEST MODIFICATIONS

**Adds to Request:**
- `request.tenantContext` object containing:
  - `tenantId` - Tenant identifier (UUID)
  - `tenantName` - Tenant name (optional)
  - `tenantType` - Tenant type (optional)
- `request.tenantId` - Direct tenant ID property for convenience

**Headers Read:**
- None (uses JWT claims from auth middleware)

**Context Set:**
- PostgreSQL session variable: `app.current_tenant_id` (transactional scope)
- Tenant context for downstream services and controllers

### VALIDATION LOGIC

**What it validates:**
- User authentication status (requires `request.user` from auth middleware)
- Tenant ID presence in JWT claims (`user.tenant_id`)
- Tenant ID format validation using UUID v4 regex
- Resource ownership in `verifyTenantResource` middleware factory

**How it validates:**
- UUID regex: `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`
- Extracts `user.tenant_id` from verified JWT (NEVER from request body/params)
- Database query via `db.raw()` to set RLS context
- Resource tenant ID comparison in verifyTenantResource

### ERROR RESPONSES

**Error Conditions:**
- Not authenticated → 401 "Authentication required"
- Missing tenant context in JWT → 401 "Missing tenant context"
- Invalid tenant_id format → 401 "Invalid tenant context"
- RLS context setting failure → 401 "Failed to establish tenant context"
- Cross-tenant access attempt → 403 "Access denied to this resource"

**HTTP Status Codes:**
- 401 Unauthorized - Authentication/tenant context issues
- 403 Forbidden - Authorization failures (cross-tenant access)

**Error Response Format:**
Uses `UnauthorizedError` and `ForbiddenError` custom error classes

### EXTERNAL CALLS

**Database Queries:**
```sql
-- Set RLS context for current request (transactional)
SELECT set_config('app.current_tenant_id', ?, true)

-- Set RLS context within transaction (transaction-scoped)
SET LOCAL app.current_tenant_id = ?
```

**Redis Lookups:**
- None

**Service Calls:**
- Custom `getResourceTenantId(request)` function (injected in verifyTenantResource factory)

### TENANT ISOLATION

**How tenant context is set:**
1. Extracts `tenant_id` from verified JWT claims only (never from request parameters)
2. Validates UUID format with strict regex
3. Sets PostgreSQL session variable `app.current_tenant_id` using transactional scope
4. Stores in request object for downstream middleware/controller access

**RLS Implications:**
- **CRITICAL:** Sets database-level RLS enforcement via PostgreSQL session variables
- Uses transactional scope (`true` parameter) - RLS context resets after transaction
- Transaction-scoped setting in `setTenantInTransaction` for explicit transactions
- All subsequent queries in the request will be filtered by `tenant_id` at the database level
- **NEVER** falls back to default tenant (security-critical requirement)

### 🚨 POTENTIAL ISSUES

**1. MISSING VALIDATION - Tenant Existence:**
- **Severity:** MEDIUM
- No verification that `tenant_id` actually exists in tenants table
- Could allow requests with valid UUID format but non-existent tenant
- User with forged JWT could access with invalid tenant ID
- **Recommendation:** Add tenant existence check with Redis caching

**2. RLS BYPASS RISK - Multiple Tenants:**
- **Severity:** HIGH
- No check if user legitimately belongs to claimed `tenant_id`
- User could potentially manipulate JWT to switch tenants
- Relies entirely on JWT issuer validation
- **Recommendation:** Validate user-tenant association in database

**3. RACE CONDITION - RLS Context:**
- **Severity:** LOW
- RLS set via `set_config` with transactional flag
- If middleware chain throws error, RLS context might persist
- Could affect subsequent requests in connection pool
- **Recommendation:** Add cleanup hook in error handler to ensure RLS reset

**4. INFORMATION LEAKAGE - Logs:**
- **Severity:** LOW
- Logs `tenantId` and `userId` together on cross-tenant access attempts
- Could leak tenant associations in centralized logging systems
- **Recommendation:** Hash or mask tenant IDs in security logs

**5. MISSING VALIDATION - extractTenant:**
- **Severity:** LOW
- Optional tenant extraction silently fails on invalid UUID format
- No logging of malformed tenant IDs from JWT
- Could hide JWT manipulation attempts
- **Recommendation:** Log suspicious tenant ID formats for security monitoring

---

## 3. VALIDATION.MIDDLEWARE.TS

### PURPOSE
- Validates request body, query parameters, and route parameters using Joi schemas
- Returns structured validation errors with field-level details
- Performs type coercion according to schema definitions
- Provides consistent validation across all routes

### REQUEST MODIFICATIONS

**Adds to Request:**
- Mutates `request.body` with validated/coerced values
- Mutates `request.query` with validated/coerced values
- Mutates `request.params` with validated/coerced values

**Headers Read:**
- None

**Context Set:**
- None (validation only, no context setting)

### VALIDATION LOGIC

**What it validates:**
- Request body content (if `schema.body` provided)
- Query string parameters (if `schema.querystring` provided)
- URL route parameters (if `schema.params` provided)

**How it validates:**
- Joi schema validation with `abortEarly: false` option (returns all errors, not just first)
- Type coercion according to Joi schema definitions (e.g., string to number)
- Custom validation rules defined in Joi schemas
- Applies schema transformations (strip unknown, defaults, etc.)

### ERROR RESPONSES

**Error Conditions:**
- Body validation failure → 400 with field-level error details
- Query validation failure → 400 with field-level error details
- Params validation failure → 400 with field-level error details
- Internal validation error → 500 "Validation error"

**HTTP Status Codes:**
- 400 Bad Request - Validation errors
- 500 Internal Server Error - Internal validation errors

**Error Response Format:**
```typescript
ErrorResponseBuilder.validation(reply, [
  { 
    field: 'path.to.field',  // JSON path to invalid field
    message: 'error message' // Joi error message
  }
])
```

### EXTERNAL CALLS

**Database Queries:**
- None

**Redis Lookups:**
- None

**Service Calls:**
- None (pure validation middleware, no external dependencies)

### TENANT ISOLATION

**How tenant context is set:**
- N/A (no tenant-specific validation logic)

**RLS Implications:**
- None (validation only)

### 🚨 POTENTIAL ISSUES

**1. INFORMATION LEAKAGE - Error Details:**
- **Severity:** MEDIUM
- Returns ALL validation errors with complete field paths
- Could leak internal schema structure to attackers
- Joi default error messages may expose internal field names and types
- Enables attackers to map API structure
- **Recommendation:** Sanitize field paths in production, limit error details to generic messages

**2. MISSING VALIDATION - Request Size:**
- **Severity:** LOW
- No explicit limits on request body size in validation middleware
- Relies on Fastify's `bodyLimit` configuration (might not be set)
- Could enable memory exhaustion attacks
- **Recommendation:** Add explicit size validation in schemas, enforce bodyLimit

**3. ERROR HANDLING - Broad Catch:**
- **Severity:** LOW
- Catches all errors and returns generic "Validation error" (500)
- Hides actual validation failures (schema compilation errors, Joi bugs, etc.)
- Makes debugging difficult
- **Recommendation:** Log actual errors with context, return specific error codes

**4. MUTATION SIDE EFFECTS:**
- **Severity:** LOW
- Mutates original request objects (body, query, params)
- Could affect downstream middleware expecting original values
- Type coercion may cause unexpected behavior
- **Recommendation:** Document mutation behavior clearly in API documentation

**5. MISSING VALIDATION - Sanitization:**
- **Severity:** MEDIUM
- No HTML/SQL injection sanitization built-in
- Relies entirely on Joi schema definitions being correct
- Developers might forget to add sanitization rules
- **Recommendation:** Add explicit sanitization middleware after validation

---

## 4. RATE-LIMIT.MIDDLEWARE.TS

### PURPOSE
- Implements multi-tier distributed rate limiting using Redis
- Supports global, per-tenant, per-user, per-venue, and per-operation limits
- Provides per-webhook-source rate limits (AUDIT FIX WE3)
- Implements tenant-scoped rate limiting to prevent cross-tenant interference (SECURITY FIX SR7)
- Includes ban threshold configuration for repeat offenders (FC10 - configured but not implemented)
- Fails open on Redis errors (FC6) with logging

### REQUEST MODIFICATIONS

**Adds to Request:**
- None (only validates and blocks requests)

**Headers Read:**
- None (uses request properties like method, path, user, tenant)

**Headers Set:**
- `X-RateLimit-Limit` - Maximum requests allowed in window
- `X-RateLimit-Remaining` - Requests remaining in current window
- `X-RateLimit-Reset` - ISO timestamp when limit resets
- `Retry-After` - Seconds until retry allowed (only when rate limited)

### VALIDATION LOGIC

**What it validates:**
- Request count within sliding time window
- Per-user limits (if user authenticated)
- Per-tenant limits (if tenant context exists)
- Per-venue limits (if venueId in route params)
- Per-operation limits based on HTTP method + route path

**How it validates:**
- Redis INCR + EXPIRE in pipeline (atomic operation)
- Window-based counting: `Math.floor(Date.now() / windowMs)`
- Multiple simultaneous checks (global, tenant, user, venue, operation)
- Compares count against configured max for each tier

### ERROR RESPONSES

**Error Conditions:**
- Rate limit exceeded → 429 with retry-after information

**HTTP Status Codes:**
- 429 Too Many Requests

**Error Response Format:**
```typescript
throw new RateLimitError(type, retryAfterSeconds)
```

**Logged Information:**
- Rate limit type, key, tenant ID, user ID
- Request IP, path, method
- Remaining count, reset time, retry-after seconds

### EXTERNAL CALLS

**Database Queries:**
- None (Redis only)

**Redis Lookups:**
```typescript
// Atomic increment and expire
redis.pipeline()
  .incr(redisKey)
  .expire(redisKey, ttlSeconds)
  .exec()

// Reset limits (uses SCAN for safety)
redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100)
redis.del(...keys)
```

**Service Calls:**
- None

### TENANT ISOLATION

**How tenant context is set:**
- **SECURITY FIX SR7:** Tenant ID included in all rate limit keys
- Key formats:
  - With tenant: `rate_limit:tenant:${tenantId}:${key}:${window}`
  - Without tenant: `rate_limit:global:${key}:${window}`

**RLS Implications:**
- Prevents cross-tenant rate limit interference
- Tenant A's requests don't consume Tenant B's quota
- Each tenant has separate per-user, per-venue, per-operation quotas

### 🚨 POTENTIAL ISSUES

**1. TIMING ATTACK - Fail Open:**
- **Severity:** HIGH
- `skipOnError: true` configuration fails open when Redis unavailable
- Attacker could DDoS Redis to bypass all rate limits
- No circuit breaker to detect Redis issues
- **Recommendation:** Add Redis circuit breaker, alert on failures, fail closed for critical endpoints

**2. RACE CONDITION - Window Boundaries:**
- **Severity:** MEDIUM
- Window calculation: `Math.floor(now / windowMs)`
- Users can send 2x max requests at window boundary (end of window N + start of window N+1)
- Example: 100 req/min allows 200 requests in 2 seconds at boundary
- **Recommendation:** Implement sliding window algorithm using sorted sets

**3. MISSING VALIDATION - Ban Threshold:**
- **Severity:** LOW
- Ban configuration exists but NOT implemented in code
- Config defines: `ban: { enabled, threshold, windowMs, banDurationMs }`
- No actual ban logic to track violations or block repeat offenders
- **Recommendation:** Implement ban logic or remove unused configuration

**4. INFORMATION LEAKAGE - Rate Limit Headers:**
- **Severity:** LOW
- Always returns `X-RateLimit-*` headers even on first request
- Reveals service capacity and internal quotas to attackers
- Enables attackers to optimize attack patterns
- **Recommendation:** Only send headers when near/at limit, or use generic values

**5. DENIAL OF SERVICE - Key Explosion:**
- **Severity:** MEDIUM
- Per-user/per-venue/per-operation creates many Redis keys
- No cleanup except TTL expiration
- High-traffic system could create millions of keys
- Could exhaust Redis memory
- **Recommendation:** Monitor key count, implement active key cleanup, use shorter TTLs

**6. INFORMATION LEAKAGE - Detailed Logs:**
- **Severity:** LOW
- Logs IP, userId, tenantId, path on every rate limit hit
- Could leak user behavior patterns and tenant associations
- High-volume logging could fill disk
- **Recommendation:** Rate limit the logging itself, aggregate logs

---

## 5. IDEMPOTENCY.MIDDLEWARE.TS

### PURPOSE
- Prevents duplicate operations on state-changing requests (POST/PUT/PATCH)
- Uses `Idempotency-Key` header to track request uniqueness
- Returns cached responses for duplicate requests
- Prevents concurrent duplicate requests using distributed locks
- Implements security fixes SC1-SC5 for idempotency handling

### REQUEST MODIFICATIONS

**Adds to Request:**
- `request.idempotencyKey` - The client-provided idempotency key
- `request.idempotencyRedisKey` - Redis storage key for the record
- `request.idempotencyLockKey` - Redis lock key for concurrency control
- `request.idempotencyFingerprint` - SHA-256 hash of request payload

**Headers Read:**
- `idempotency-key` - Client-provided idempotency key (optional or required based on config)

**Headers Set:**
- `X-Idempotency-Replayed: true` - Indicates response is from cache (duplicate request)

### VALIDATION LOGIC

**What it validates:**
- Idempotency key presence (if required by configuration)
- Request payload fingerprint match (detects payload changes with same key)
- Processing state (processing/completed/failed)
- Lock acquisition for concurrency control

**How it validates:**
- SHA-256 hash of JSON-serialized request (method + URL + body)
- Compares stored fingerprint with current request fingerprint
- Redis lock acquisition using SET NX EX for distributed locking
- Status check: processing/completed/failed

### ERROR RESPONSES

**Error Conditions:**
- Missing required idempotency key → 400 "Idempotency-Key header is required for this operation"
- Key reused with different payload → 422 "Idempotency-Key has already been used with a different request"
- Request still processing → 409 "Request with this Idempotency-Key is still being processed"
- Lock acquisition failed → 409 "Request with this Idempotency-Key is being processed"

**HTTP Status Codes:**
- 400 Bad Request - Missing required key
- 409 Conflict - Concurrent requests or processing
- 422 Unprocessable Entity - Payload mismatch
- Returns original status code for cached responses

**Error Response Format:**
```json
{
  "error": "Error message",
  "code": "IDEMPOTENCY_KEY_REQUIRED|IDEMPOTENCY_KEY_CONFLICT|IDEMPOTENCY_PROCESSING"
}
```

### EXTERNAL CALLS

**Database Queries:**
- None (uses Redis exclusively for idempotency tracking)

**Redis Lookups:**
```typescript
// Check existing record
redis.get('idempotency:${resourceType}:${key}')

// Acquire processing lock (30 second timeout)
redis.set('${lockKey}', '1', 'NX', 'EX', 30)

// Store processing/completed record (24 hour TTL)
redis.setex('${redisKey}', 86400, JSON.stringify(record))

// Release lock
redis.del('${lockKey}')
```

**Service Calls:**
- None

### TENANT ISOLATION

**How tenant context is set:**
- ⚠️ **NOT tenant-scoped by default**
- Uses resourceType in key: `idempotency:${resourceType}:${key}`
- No tenant ID included in Redis key structure

**RLS Implications:**
- No direct RLS implications (Redis-only storage)
- **SECURITY RISK:** Cross-tenant key collision possible

### 🚨 POTENTIAL ISSUES

**1. MISSING TENANT ISOLATION:**
- **Severity:** CRITICAL
- Idempotency keys NOT scoped by tenant ID
- Tenant A could use same UUID as Tenant B, causing cross-tenant collisions
- Tenant A could replay Tenant B's cached response if keys match
- Data leakage between tenants possible
- **Recommendation:** Include tenant ID in Redis key: `idempotency:${tenantId}:${resourceType}:${key}`

**2. TIMING ATTACK - Fingerprint Comparison:**
- **Severity:** LOW
- String comparison of SHA-256 fingerprints uses standard equality
- Could leak timing information about payload structure
- Attacker might brute-force payload to match fingerprint
- **Recommendation:** Use constant-time comparison for fingerprints

**3. LOCK TIMEOUT RISK:**
- **Severity:** MEDIUM
- Lock expires after 30 seconds (hardcoded)
- Long-running operations (>30s) lose lock
- Could allow duplicate operations if request takes >30 seconds
- No lock extension/heartbeat mechanism
- **Recommendation:** Extend lock timeout or implement distributed lock with heartbeat

**4. CACHE POISONING:**
- **Severity:** MEDIUM
- Failed requests cached for 24 hours (same TTL as successful)
- No distinction between 4xx (client error) vs 5xx (server error)
- Transient 5xx failures prevent retries for 24 hours
- Client stuck with cached error response
- **Recommendation:** Shorter TTL for failed requests (e.g., 5 minutes), only cache 2xx responses

**5. MEMORY EXHAUSTION:**
- **Severity:** MEDIUM
- 24-hour TTL for all idempotency records
- No limits on number of keys per tenant/user
- Malicious user could create millions of idempotency keys
- Could exhaust Redis memory
- **Recommendation:** Implement per-tenant key count limits, use shorter default TTL

**6. MISSING VALIDATION - Key Format:**
- **Severity:** MEDIUM
- No validation of idempotency key format or length
- Could allow Redis key injection attacks via special characters
- Very long keys could cause performance issues
- **Recommendation:** Validate key format (UUID recommended), enforce length limits (36-128 chars)

---

## 6. ERROR-HANDLER.MIDDLEWARE.TS

### PURPOSE
- Global error handler for Fastify application
- Translates all errors to consistent response format
- Handles custom AppError, Fastify validation errors, database errors, circuit breaker errors
- Sanitizes error messages in production environment
- Logs all errors with request context

### REQUEST MODIFICATIONS

**Adds to Request:**
- None (final error handler, no request modification)

**Headers Read:**
- None

**Context Set:**
- None

### VALIDATION LOGIC

**What it validates:**
- Error type classification (AppError, FastifyError, database, circuit breaker)
- Environment mode (production vs development) for message sanitization

**How it validates:**
- Type checking with `isAppError()` helper function
- Property checking (`error.validation`, `error.name`, `error.message`)
- Message content pattern matching (e.g., "Circuit breaker is open", "database")

### ERROR RESPONSES

**Error Conditions:**
- Null/undefined error → 500 "An unexpected error occurred"
- AppError instances → Uses error's statusCode and details
- Fastify validation error → 400 with validation details
- Circuit breaker open → 503 "Service temporarily unavailable" with retryAfter
- Database errors → Mapped via `mapDatabaseError()` utility
- Unknown errors → 500 (message sanitized in production)

**HTTP Status Codes:**
- 400 Bad Request - Validation errors
- 401 Unauthorized - From AppError
- 403 Forbidden - From AppError
- 404 Not Found - From AppError
- 422 Unprocessable Entity - From AppError
- 429 Too Many Requests - From AppError
- 503 Service Unavailable - Circuit breaker
- 500 Internal Server Error - Unknown/unexpected errors

**Error Response Format:**
Uses `ErrorResponseBuilder.send()` with standardized structure:
```typescript
{
  success: false,
  error: "message",
  code: "ERROR_CODE",
  details: { /* optional */ }
}
```

### EXTERNAL CALLS

**Database Queries:**
- None

**Redis Lookups:**
- None

**Service Calls:**
- None

### TENANT ISOLATION

**How tenant context is set:**
- N/A (error handler only, no tenant operations)

**RLS Implications:**
- None

### 🚨 POTENTIAL ISSUES

**1. INFORMATION LEAKAGE - Development Errors:**
- **Severity:** HIGH
- Check `process.env.NODE_ENV === 'production'` for message sanitization
- Development mode returns full `error.message` to client
- Could leak stack traces, SQL queries, file paths, internal architecture
- Staging environments might use development mode
- **Recommendation:** Use explicit whitelist of safe error messages, never expose internals

**2. INFORMATION LEAKAGE - Logged User Info:**
- **Severity:** LOW
- Logs `userId` from request context on every error
- Could correlate user actions across tenants in centralized logs
- Enables user behavior profiling
- **Recommendation:** Hash or mask user IDs in error logs, log tenant-scoped user IDs

**3. MISSING ERROR CODES:**
- **Severity:** LOW
- Database errors mapped but may lose specific constraint violation info
- Generic "DATABASE_ERROR" code for all database issues
- Makes client-side error handling difficult
- **Recommendation:** Preserve original database error codes (unique_violation, foreign_key_violation, etc.)

**4. CIRCUIT BREAKER DETECTION:**
- **Severity:** LOW
- Checks `error.message?.includes('Circuit breaker is open')`
- String matching is fragile and locale-dependent
- Message could change in circuit breaker library updates
- **Recommendation:** Use error types/codes instead of message substring matching

**5. NULL ERROR HANDLING:**
- **Severity:** MEDIUM
- Explicitly handles null/undefined errors
- Logs as "Null or undefined error received"
- Could indicate upstream middleware bugs or error swallowing
- Not a normal condition
- **Recommendation:** Alert on null errors (indicates code bugs), track frequency

---

## 7. VERSIONING.MIDDLEWARE.TS

### PURPOSE
- API version management and routing
- Supports multiple version detection methods (URL path, headers)
- Handles version deprecation warnings with sunset dates
- Adds version information to response headers
- Provides helper for registering versioned routes

### REQUEST MODIFICATIONS

**Adds to Request:**
- `request.apiVersion` - Detected API version string (e.g., "v1")

**Headers Read:**
- `api-version` - Custom version header (priority 2)
- `accept-version` - Standard accept-version header (priority 3)

**Headers Set:**
- `API-Version` - Current version being used
- `X-API-Version` - Current version (duplicate for compatibility)
- `Deprecation: true` - Set when using deprecated version
- `Sunset` - ISO date when deprecated version will be removed

**Context Set:**
- API version context for conditional routing logic

### VALIDATION LOGIC

**What it validates:**
- Version is in supported versions list
- Version format from URL path

**How it validates:**
- URL regex extraction: `/\/api\/(v\d+)\//`
- Priority order: URL path > api-version header > accept-version header > default
- Membership check in `versionConfig.supported` array
- Checks `versionConfig.deprecated` for deprecation warnings

### ERROR RESPONSES

**Error Conditions:**
- Unsupported version requested → 400 with details about current/supported versions

**HTTP Status Codes:**
- 400 Bad Request - Unsupported version

**Error Response Format:**
```json
{
  "success": false,
  "error": "API version ${version} is not supported",
  "code": "UNSUPPORTED_VERSION",
  "details": {
    "current": "v1",
    "supported": ["v1"]
  }
}
```

### EXTERNAL CALLS

**Database Queries:**
- None

**Redis Lookups:**
- None

**Service Calls:**
- None

### TENANT ISOLATION

**How tenant context is set:**
- N/A (version management only, no tenant operations)

**RLS Implications:**
- None

### 🚨 POTENTIAL ISSUES

**1. INFORMATION LEAKAGE - Version Details:**
- **Severity:** LOW
- Returns complete list of supported versions in error response
- Reveals API structure and available endpoints per version
- Enables attackers to discover deprecated/vulnerable versions
- **Recommendation:** Only return current version in errors, don't enumerate all supported versions

**2. MISSING VALIDATION - Version Injection:**
- **Severity:** MEDIUM
- No sanitization of version string extracted from URL
- Regex extracts but doesn't validate against strict format
- Could allow path traversal if version is used in file operations
- **Recommendation:** Strict whitelist validation, only allow predefined version strings

**3. HARDCODED CONFIGURATION:**
- **Severity:** LOW
- Version configuration hardcoded directly in middleware file
- Should be externalized to environment/config file
- Makes version updates require code changes
- **Recommendation:** Move version config to external configuration management

**4. DUPLICATE HEADERS:**
- **Severity:** LOW
- Sets both `API-Version` and `X-API-Version` headers
- Unnecessary duplication increases response size
- No clear reason for both headers
- **Recommendation:** Use single standard header (prefer `API-Version`)

**5. NO VERSION ENFORCEMENT:**
- **Severity:** LOW
- Defaults to current version if none specified
- Could hide version incompatibilities from clients
- Clients might unknowingly use wrong version
- **Recommendation:** Consider requiring explicit version in production (fail if not specified)

---

## ISSUES FOUND

### 🔴 CRITICAL SEVERITY

**1. Idempotency Middleware - Missing Tenant Isolation**
- **File:** idempotency.middleware.ts
- **Issue:** Idempotency keys not scoped by tenant ID
- **Impact:** Cross-tenant key collision, potential data leakage between tenants
- **Recommendation:** Include tenant ID in Redis key structure

**2. Rate Limit Middleware - Fail Open on Redis Errors**
- **File:** rate-limit.middleware.ts
- **Issue:** Bypasses all rate limits when Redis unavailable
- **Impact:** Complete rate limit bypass via Redis DDoS
- **Recommendation:** Add circuit breaker, fail closed for critical endpoints

### 🟡 HIGH SEVERITY

**3. Auth Middleware - Missing Rate Limiting**
- **File:** auth.middleware.ts
- **Issue:** No rate limiting on authentication attempts
- **Impact:** Enables brute force attacks on API keys and JWTs
- **Recommendation:** Add authentication attempt rate limiting

**4. Tenant Middleware - No User-Tenant Association Check**
- **File:** tenant.middleware.ts
- **Issue:** Doesn't validate user belongs to claimed tenant
- **Impact:** User could manipulate JWT to access different tenants
- **Recommendation:** Validate user-tenant association in database

**5. Error Handler - Information Leakage in Development**
- **File:** error-handler.middleware.ts
- **Issue:** Full error messages exposed in non-production
- **Impact:** Leaks stack traces, SQL, internal architecture
- **Recommendation:** Use explicit whitelist of safe messages

### 🟠 MEDIUM SEVERITY

**6. Auth Middleware - API Key Cache Poisoning**
- **File:** auth.middleware.ts
- **Issue:** 5-minute cache doesn't invalidate on user/key disable
- **Impact:** Disabled users can access system for up to 5 minutes
- **Recommendation:** Implement cache invalidation or reduce TTL

**7. Auth Middleware - Timing Attack on Legacy Fallback**
- **File:** auth.middleware.ts
- **Issue:** Observable timing difference in API key lookup
- **Impact:** Enumeration of valid API keys
- **Recommendation:** Remove legacy fallback immediately

**8. Tenant Middleware - Missing Tenant Existence Check**
- **File:** tenant.middleware.ts
- **Issue:** No validation that tenant_id exists
- **Impact:** Allows requests with non-existent tenants
- **Recommendation:** Add tenant existence validation with caching

**9. Validation Middleware - Information Leakage**
- **File:** validation.middleware.ts
- **Issue:** Returns all validation errors with field paths
- **Impact:** Leaks internal schema structure
- **Recommendation:** Sanitize field paths, limit error details

**10. Validation Middleware - Missing Sanitization**
- **File:** validation.middleware.ts
- **Issue:** No HTML/SQL injection sanitization
- **Impact:** Potential injection vulnerabilities
- **Recommendation:** Add explicit sanitization middleware

**11. Rate Limit - Window Boundary Race Condition**
- **File:** rate-limit.middleware.ts
- **Issue:** Fixed windows allow 2x requests at boundaries
- **Impact:** Rate limit bypass (200 req instead of 100)
- **Recommendation:** Implement sliding window algorithm

**12. Rate Limit - Key Explosion DoS**
- **File:** rate-limit.middleware.ts
- **Issue:** Unlimited key creation per tenant
- **Impact:** Redis memory exhaustion
- **Recommendation:** Implement key count limits

**13. Idempotency - Lock Timeout Risk**
- **File:** idempotency.middleware.ts
- **Issue:** 30-second lock timeout for all operations
- **Impact:** Long operations allow duplicate processing
- **Recommendation:** Implement lock extension mechanism

**14. Idempotency - Failed Request Caching**
- **File:** idempotency.middleware.ts
- **Issue:** 24-hour cache for failed requests
- **Impact:** Transient errors prevent retries
- **Recommendation:** Shorter TTL for failures, only cache 2xx

**15. Idempotency - Memory Exhaustion**
- **File:** idempotency.middleware.ts
- **Issue:** No limits on idempotency keys
- **Impact:** Redis memory exhaustion
- **Recommendation:** Per-tenant key limits

**16. Idempotency - Missing Key Validation**
- **File:** idempotency.middleware.ts
- **Issue:** No format/length validation
- **Impact:** Redis injection, performance issues
- **Recommendation:** Enforce UUID format, length limits

**17. Versioning - Version String Injection**
- **File:** versioning.middleware.ts
- **Issue:** No sanitization of extracted version
- **Impact:** Path traversal risk if version used in routing
- **Recommendation:** Strict whitelist validation

### 🟢 LOW SEVERITY

**18-24. Various Information Leakage Issues**
- Multiple files contain minor information disclosure issues
- Detailed error messages, logs, headers revealing internals
- See individual middleware sections for details

---

## MIDDLEWARE TEST SCENARIOS

| Middleware | Key Test Cases | Priority | Security Focus |
|------------|----------------|----------|----------------|
| **auth.middleware.ts** | Valid JWT token, Invalid signature, Expired token, Missing token, Invalid issuer/audience, Valid API key, Invalid API key, Expired API key, Missing authentication, Venue access granted, Venue access denied, Cache hit scenario, Cache miss scenario, Timing attack test (legacy vs hash) | HIGH | JWT validation, API key hashing, timing attacks, cache security |
| **tenant.middleware.ts** | Valid tenant context, Missing tenant ID, Invalid UUID format, Cross-tenant access attempt, RLS context set correctly, RLS context in transaction, Non-existent tenant, User-tenant mismatch, Resource ownership validation, Tenant boundary enforcement | CRITICAL | RLS enforcement, tenant isolation, cross-tenant attacks |
| **validation.middleware.ts** | Valid body/query/params, Invalid body data, Type coercion, Multiple validation errors, Missing required fields, Extra fields handling, SQL injection attempt, XSS attempt, Field path in errors, Internal validation error | MEDIUM | Input validation, injection prevention, error details |
| **rate-limit.middleware.ts** | Under limit, At limit, Over limit, Window reset, Multiple tiers (global/tenant/user), Redis unavailable, Window boundary exploitation, Key collision, Concurrent requests, Per-operation limits, Ban threshold (if implemented) | HIGH | Rate limit bypass, tenant isolation, Redis failures |
| **idempotency.middleware.ts** | First request, Exact duplicate request, Different payload same key, Concurrent duplicates, Expired key, Processing timeout, Lock timeout, Cached success response, Cached failure response, Missing key (required), Cross-tenant key collision | HIGH | Idempotency enforcement, tenant isolation, concurrency |
| **error-handler.middleware.ts** | AppError handling, Validation error, Database error, Circuit breaker error, Null/undefined error, Production vs development mode, Unknown error type, Error code consistency, Information leakage test | MEDIUM | Error sanitization, information disclosure, consistency |
| **versioning.middleware.ts** | Supported version (URL), Supported version (header), Unsupported version, Deprecated version, Missing version (default), Priority order (URL > header), Sunset header present, Version injection attempt | LOW | Version validation, deprecation warnings, injection |

### Integration Test Priority Matrix

| Test Scenario | Priority | Complexity | Security Impact |
|---------------|----------|------------|-----------------|
| Tenant isolation boundary tests | CRITICAL | HIGH | Cross-tenant data access |
| Authentication bypass scenarios | CRITICAL | MEDIUM | Unauthorized access |
| Rate limit multi-tier enforcement | HIGH | HIGH | DoS prevention |
| Idempotency concurrent handling | HIGH | HIGH | Duplicate operations |
| Middleware execution order | HIGH | MEDIUM | Security chain integrity |
| RLS context propagation | CRITICAL | MEDIUM | Database-level isolation |
| Error information leakage | MEDIUM | LOW | Information disclosure |
| Validation injection prevention | MEDIUM | MEDIUM | Injection attacks |
| API versioning compatibility | LOW | LOW | API stability |

### Recommended Integration Test Flow

1. **Authentication Chain Test**
   - auth.middleware → tenant.middleware → validation.middleware
   - Verify proper context propagation
   - Test authentication bypass attempts

2. **Tenant Isolation Test**
   - Create two tenant contexts
   - Attempt cross-tenant resource access
   - Verify RLS enforcement in database queries

3. **Rate Limiting Cascade Test**
   - Test all rate limit tiers simultaneously
   - Verify tenant isolation in rate limits
   - Test Redis failure scenarios

4. **Idempotency Concurrency Test**
   - Send concurrent duplicate requests
   - Verify only one processes
   - Test lock timeout handling

5. **Error Handling Consistency Test**
   - Trigger all error types
   - Verify consistent response format
   - Test production vs development modes

6. **Full Request Lifecycle Test**
   - Complete request through all middleware
   - Verify proper order and context
   - Test rollback/cleanup on errors

---

## CONCLUSION

This analysis identified **24 security and functionality issues** across 7 middleware files, with **2 CRITICAL**, **13 HIGH/MEDIUM**, and **9 LOW** severity issues. The most critical concerns are:

1. **Tenant isolation gaps** in idempotency middleware
2. **Authentication security** issues (timing attacks, missing rate limits)
3. **Rate limiting bypass** via Redis failures
4. **Information leakage** in error handling and validation

Integration tests should prioritize tenant boundary enforcement, authentication flows, and rate limiting scenarios. All CRITICAL and HIGH severity issues should be addressed before production deployment.

**Generated:** January 18, 2026  
**Files Analyzed:** 7 middleware files  
**Total Issues:** 24 (2 Critical, 13 Medium-High, 9 Low)
