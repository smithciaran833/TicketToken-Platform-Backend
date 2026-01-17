# Auth Service Middleware Analysis
## Purpose: Integration Testing Documentation
## Source: src/middleware/*.ts
## Generated: January 15, 2026

---

# 1. AUTH MIDDLEWARE (`auth.middleware.ts`)

## Purpose
Authenticates users via JWT and handles RBAC permission checks.

## Exported Functions

### `createAuthMiddleware(jwtService, rbacService)`
Factory function that returns:

---

### 1.1 `authenticate`

| Aspect | Details |
|--------|---------|
| **Trigger** | Routes with `preHandler: [authMiddleware.authenticate]` |
| **Checks** | `Authorization` header format (`Bearer <token>`) |
| **Verifies** | JWT access token via `jwtService.verifyAccessToken()` |
| **Request Modifications** | Sets `request.user` with: `{ id, tenant_id, email, role, permissions }` |
| **Dependencies** | `JWTService`, `RBACService` |
| **Headers Used** | `Authorization: Bearer <token>` |

**Rejection Conditions:**

| Condition | HTTP Status | Error Code | Message |
|-----------|-------------|------------|---------|
| Missing/invalid auth header | 401 | `AUTHENTICATION_FAILED` | "Missing or invalid authorization header" |
| Invalid/expired token | 401 | `AUTHENTICATION_FAILED` | "Invalid token" |

---

### 1.2 `requirePermission(permission)`

| Aspect | Details |
|--------|---------|
| **Trigger** | Routes with specific permission requirements |
| **Checks** | `request.user` exists, permission via `rbacService.checkPermission()` |
| **Input Sources** | `params.venueId`, `body.venueId` |
| **Dependencies** | `RBACService`, `auditLogger` |

**Rejection Conditions:**

| Condition | HTTP Status | Error Code | Message |
|-----------|-------------|------------|---------|
| No user on request | 401 | `AUTHENTICATION_FAILED` | "Authentication required" |
| Permission denied | 403 | `ACCESS_DENIED` | "Missing required permission: {permission}" |

---

### 1.3 `requireVenueAccess`

| Aspect | Details |
|--------|---------|
| **Trigger** | Venue-specific routes |
| **Checks** | User has any role for the venue |
| **Input Sources** | `params.venueId` |
| **Dependencies** | `RBACService`, `auditLogger` |

**Rejection Conditions:**

| Condition | HTTP Status | Error Code | Message |
|-----------|-------------|------------|---------|
| No user on request | 401 | `AUTHENTICATION_FAILED` | "Authentication required" |
| Missing venueId param | Error thrown | - | "Venue ID required" |
| No venue access | 403 | `ACCESS_DENIED` | "No access to this venue" |

---

# 2. VALIDATION MIDDLEWARE (`validation.middleware.ts`)

## Purpose
Validates request body/query/params against Joi schemas.

## Exported Functions

### `validate(schema, source)`

| Aspect | Details |
|--------|---------|
| **Trigger** | Routes with `preHandler: [validate(schema, 'body')]` |
| **Source Options** | `'body'` (default), `'query'`, `'params'` |
| **Checks** | Data against provided Joi schema |
| **Request Modifications** | Replaces `request.body/query/params` with validated & stripped data |
| **Dependencies** | Joi |
| **Bypass** | None - always validates when applied |

**Validation Options:**
- `abortEarly: false` - collect all errors
- `stripUnknown: true` - remove undeclared fields

**Rejection Conditions:**

| Condition | HTTP Status | Error Code | Message |
|-----------|-------------|------------|---------|
| Joi validation fails | 400 | *(none set)* | Concatenated error messages |

**Error Response Shape:**
```json
{
  "error": "field1 message, field2 message",
  "errors": [
    { "field": "email", "message": "\"email\" must be a valid email" }
  ]
}
```

---

# 3. TENANT MIDDLEWARE (`tenant.middleware.ts`)

## Purpose
Validates tenant context from JWT and sets PostgreSQL RLS session variables.

## Exported Functions

### `validateTenant`

| Aspect | Details |
|--------|---------|
| **Trigger** | All authenticated routes accessing tenant-specific data |
| **Prerequisites** | `request.user` must be set (run after auth middleware) |
| **Checks** | `user.tenant_id` exists and is valid UUID, `user.id` is valid UUID |
| **Request Modifications** | None directly (uses existing `request.user`) |
| **Dependencies** | PostgreSQL `pool`, UUID regex validation |
| **Headers Used** | None (reads from JWT payload) |

**Database Operations:**
```sql
SELECT set_config('app.current_tenant_id', $tenant_id, true);
SELECT set_config('app.current_user_id', $user_id, true);
```

**Rejection Conditions:**

| Condition | HTTP Status | Error Code | Message |
|-----------|-------------|------------|---------|
| No `request.user` | 401 | `AUTH_REQUIRED` | "Authentication required" |
| Missing tenant_id in JWT | 403 | `MISSING_TENANT_ID` | "Invalid tenant context" |
| Invalid tenant_id UUID format | 403 | `INVALID_TENANT_ID_FORMAT` | "Invalid tenant_id format" |
| Invalid user_id UUID format | 403 | `INVALID_USER_ID_FORMAT` | "Invalid user_id format" |
| RLS set_config fails | 500 | `RLS_CONTEXT_ERROR` | "Internal server error" |

### Helper Functions

- `validateResourceTenant(userTenantId, resourceTenantId)` - returns boolean
- `addTenantFilter(tenantId)` - returns `{ tenant_id: tenantId }` for queries
- `TenantIsolationError` class - HTTP 403, code `TENANT_ISOLATION_VIOLATION`

---

# 4. S2S MIDDLEWARE (`s2s.middleware.ts`)

## Purpose
Authenticates service-to-service (internal) requests using separate JWT keys.

## Service Allowlist

| Service | Allowed Endpoints |
|---------|-------------------|
| `ticket-service` | `/auth/verify`, `/auth/internal/validate-permissions` |
| `payment-service` | `/auth/verify`, `/auth/internal/validate-permissions` |
| `event-service` | `/auth/verify`, `/auth/internal/validate-permissions` |
| `notification-service` | `/auth/verify` |
| `api-gateway` | `/auth/verify`, `/auth/internal/*` (wildcard) |

## Exported Functions

### `verifyServiceToken`

| Aspect | Details |
|--------|---------|
| **Trigger** | Internal API routes (`/auth/internal/*`) |
| **Checks** | `x-service-token` header, token type, service allowlist |
| **Verifies** | JWT with RS256 using **separate S2S keys** (not user JWT keys) |
| **Request Modifications** | Sets `request.service = { name, authenticated: true }` |
| **Dependencies** | `jsonwebtoken`, `S2SKeyManager`, filesystem/env for keys |
| **Headers Used** | `x-service-token` |

**Token Payload:**
```typescript
{
  sub: string;       // Service name
  type: 'service';
  iat: number;
  exp: number;
}
```

**Rejection Conditions:**

| Condition | HTTP Status | Error Code | Message |
|-----------|-------------|------------|---------|
| Missing service token | 401 | `MISSING_SERVICE_TOKEN` | "Service authentication required" |
| Invalid token type | 401 | `INVALID_SERVICE_TOKEN` | "Invalid service token" |
| Service not in allowlist | 403 | `SERVICE_NOT_ALLOWED` | "Service not authorized for this endpoint" |
| Token expired | 401 | `SERVICE_TOKEN_EXPIRED` | "Service token expired" |
| Invalid token | 401 | `INVALID_SERVICE_TOKEN` | "Invalid service token" |

### `allowUserOrService(userAuthMiddleware)`

| Aspect | Details |
|--------|---------|
| **Purpose** | Allows either user JWT OR service token |
| **Checks** | Presence of `x-service-token` or `Authorization` header |
| **Logic** | If service token present → S2S auth, else if user token → user auth |

**Rejection Conditions:**

| Condition | HTTP Status | Error Code | Message |
|-----------|-------------|------------|---------|
| No auth token at all | 401 | `NO_AUTH_TOKEN` | "Authentication required" |

### `generateServiceToken(serviceName)`
Generates a service token for internal use.

---

# 5. IDEMPOTENCY MIDDLEWARE (`idempotency.middleware.ts`)

## Purpose
Prevents duplicate processing of state-changing requests using Redis.

## Configuration

| Setting | Value |
|---------|-------|
| **Default TTL** | 24 hours |
| **Key Format** | `idempotency:tenant:{tenant_id}:{key}` or `idempotency:{key}` |
| **Lock TTL** | 30 seconds |

## Idempotent Endpoints

```
/auth/register
/auth/forgot-password
/auth/mfa/setup
/auth/wallet/register
/auth/gdpr/delete
```

## Exported Functions

### `idempotencyMiddleware`

| Aspect | Details |
|--------|---------|
| **Trigger** | POST/PUT/DELETE to idempotent endpoints |
| **Checks** | `Idempotency-Key` header, key length (16-64 chars), request body hash |
| **Request Modifications** | Sets `request.idempotencyKey`, `idempotencyRedisKey`, `idempotencyRequestHash`, `idempotencyLockKey` |
| **Dependencies** | Redis |
| **Headers Used** | `Idempotency-Key` |
| **Bypass** | GET requests, non-idempotent endpoints, missing header |

**Rejection Conditions:**

| Condition | HTTP Status | Error Code | Message |
|-----------|-------------|------------|---------|
| Key too short/long | 400 | `INVALID_IDEMPOTENCY_KEY` | "Idempotency-Key must be between 16 and 64 characters" |
| Key reused with different body | 422 | `IDEMPOTENCY_KEY_MISMATCH` | "Idempotency key already used with different request" |
| Request in progress | 409 | `IDEMPOTENCY_CONFLICT` | "A request with this Idempotency-Key is currently being processed" |

**Cached Response:**
- Returns cached response with `Idempotency-Replayed: true` header
- Only caches 2xx responses

### `captureIdempotentResponse`
Hook to capture and store successful responses.

### `registerIdempotencyHooks(app)`
Registers `preHandler` and `onSend` hooks.

---

# 6. CORRELATION MIDDLEWARE (`correlation.middleware.ts`)

## Purpose
Propagates correlation IDs for distributed tracing.

## Exported Functions

### `correlationMiddleware(app)`

| Aspect | Details |
|--------|---------|
| **Trigger** | All requests (registered as `onRequest` hook) |
| **Checks** | Existing `x-correlation-id` or `x-request-id` headers |
| **Request Modifications** | Sets `request.correlationId` |
| **Response Modifications** | Sets `x-correlation-id` and `x-request-id` headers |
| **Dependencies** | `crypto.randomUUID()` |
| **Headers Used** | `x-correlation-id`, `x-request-id` |
| **Bypass** | None - always runs |

**Logic:**
1. Check for existing `x-correlation-id` header
2. If not found, check `x-request-id`
3. If not found, use `request.id`
4. If none, generate new UUID

**Response Headers Set:**
- `x-correlation-id: {correlationId}`
- `x-request-id: {correlationId}`

### `getCorrelationHeaders(request)`
Helper to get headers for outbound requests:
```typescript
{
  'x-correlation-id': request.correlationId,
  'x-request-id': request.correlationId,
}
```

---

# 7. LOAD SHEDDING MIDDLEWARE (`load-shedding.middleware.ts`)

## Purpose
Sheds lower-priority requests under heavy load to protect critical flows.

## Load Thresholds

| Level | Load % | Priority Shed |
|-------|--------|---------------|
| Low | 50 | - |
| Normal | 70 | - |
| High | 85 | Low priority |
| Critical | 95 | Low + Normal priority |

## Load Calculation

| Factor | Weight |
|--------|--------|
| Heap usage | 50% |
| CPU load | 30% |
| Memory usage | 20% |

**Check Interval:** 1000ms (cached)

## Exported Functions

### `loadSheddingMiddleware`

| Aspect | Details |
|--------|---------|
| **Trigger** | All requests (registered as `preHandler` hook) |
| **Checks** | System load level, route priority |
| **Request Modifications** | Sets `request.routePriority` |
| **Dependencies** | `v8.getHeapStatistics()`, `os.loadavg()`, `os.totalmem/freemem()`, Prometheus metrics |
| **Bypass** | Critical priority routes, low load conditions |

**Rejection Conditions:**

| Condition | HTTP Status | Error Code | Message |
|-----------|-------------|------------|---------|
| Load too high for priority | 503 | `LOAD_SHED` | "Server is under heavy load. Please retry shortly." |

**Response Headers:**
- `Retry-After: 5`
- `X-Load-Level: {loadLevel}`
- `X-Priority: {priorityName}`
- `Content-Type: application/problem+json`

**Response Shape (RFC 7807 Problem Details):**
```json
{
  "type": "https://httpstatuses.com/503",
  "title": "Service Unavailable",
  "status": 503,
  "detail": "Server is under heavy load. Please retry shortly.",
  "instance": "/auth/login",
  "correlationId": "...",
  "code": "LOAD_SHED",
  "retryAfter": 5
}
```

### `registerLoadShedding(app)`
Registers `preHandler` hook.

### `getCurrentLoadLevel()`
Returns current load level (0-100) for monitoring.

---

# MIDDLEWARE EXECUTION ORDER

Typical order for authenticated routes:

1. **correlationMiddleware** (onRequest) - Assign correlation ID
2. **idempotencyMiddleware** (preHandler) - Check for cached response
3. **loadSheddingMiddleware** (preHandler) - Shed if overloaded
4. **authenticate** (preHandler) - Verify JWT
5. **validateTenant** (preHandler) - Set RLS context
6. **validate** (preHandler) - Validate input
7. **requirePermission** (preHandler) - Check RBAC

---

# HEADERS SUMMARY

| Header | Direction | Middleware | Purpose |
|--------|-----------|------------|---------|
| `Authorization` | Request | auth | Bearer token |
| `x-service-token` | Request | s2s | S2S JWT |
| `x-correlation-id` | Both | correlation | Distributed tracing |
| `x-request-id` | Both | correlation | Request tracing |
| `Idempotency-Key` | Request | idempotency | Duplicate prevention |
| `Idempotency-Replayed` | Response | idempotency | Indicates cached response |
| `Retry-After` | Response | load-shedding | Backoff time |
| `X-Load-Level` | Response | load-shedding | Current load % |
| `X-Priority` | Response | load-shedding | Request priority |
