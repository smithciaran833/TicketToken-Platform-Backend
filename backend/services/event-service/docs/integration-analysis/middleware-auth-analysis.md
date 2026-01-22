# Event Service Middleware Analysis (Auth & Tenant)

## Purpose: Integration Testing Documentation
## Source Files Analyzed:
- `src/middleware/api-key.middleware.ts`
- `src/middleware/auth.ts`
- `src/middleware/tenant.ts`
- `src/middleware/error-handler.ts`

## Generated: 2026-01-20

---

## SECURITY FIXES APPLIED

| File | Issue | Severity | Status |
|------|-------|----------|--------|
| — | No fixes applied | — | **Requires architectural review with team** |

**Note:** Critical tenant isolation and authentication issues identified below require team discussion before implementing fixes. Changes affect core security architecture.

---

## FILE ANALYSIS

### 1. api-key.middleware.ts

#### PURPOSE
- **Service-to-service (S2S) authentication** using API keys or service tokens
- Runs on routes requiring S2S auth (not applied globally - route-specific)
- Provides 4 middleware variants:
  - `apiKeyMiddleware` - Requires X-API-Key header
  - `serviceTokenMiddleware` - Requires X-Service-Token header
  - `s2sAuthMiddleware` - Accepts either (combined)
  - `optionalS2sMiddleware` - Sets context if present, doesn't block if absent

#### REQUEST MODIFICATION
**Attaches to request:**
```typescript
request.serviceContext = {
  isServiceRequest: boolean,
  serviceId?: string,
  serviceName?: string  // Defined but never populated
}
```

**Headers read:**
- `X-API-Key` - Static API key for service authentication
- `X-Service-Token` - Dynamic signed token for service authentication

#### TENANT ISOLATION
🔴 **CRITICAL ISSUE - NO TENANT EXTRACTION**
- This middleware does **NOT** extract or validate `tenant_id`
- Only sets service context (`serviceId`)
- **Missing:** No `tenant_id` attached to request
- **Missing:** No `X-Tenant-Id` header processing for S2S calls
- **Consequence:** Service requests bypass tenant isolation unless chained with `tenant.ts` middleware

#### EXTERNAL CALLS
- `verifyApiKey(apiKey)` - From `config/service-auth`
- `verifyServiceToken(serviceToken)` - From `config/service-auth`
- `isTrustedService(serviceId)` - From `config/service-auth`

**NOTE:** These appear to be in-memory validations (need to verify in service-auth config).

#### ERROR HANDLING
**Format:** ✅ RFC 7807 compliant
```typescript
{
  type: "https://api.tickettoken.com/errors/unauthorized",
  title: "API Key Required",
  status: 401,
  detail: "A valid API key is required for service-to-service requests.",
  code: "API_KEY_REQUIRED"
}
```

**Status codes:**
- `401` - Missing or invalid credentials

**Error codes:**
- `API_KEY_REQUIRED`
- `INVALID_API_KEY`
- `SERVICE_TOKEN_REQUIRED`
- `INVALID_SERVICE_TOKEN`
- `S2S_AUTH_REQUIRED`
- `INVALID_S2S_CREDENTIALS`

#### POTENTIAL ISSUES

🔴 **CRITICAL:**
1. **No tenant isolation for service requests** - Services can access any tenant's data unless `tenant.ts` middleware is also applied
2. `serviceName` property defined in `ServiceContext` interface but never populated (dead code)

⚠️ **HIGH:**
3. No logging of failed authentication attempts (only warnings, no metrics)
4. No rate limiting on S2S endpoints
5. Service context uses `(request as any)` - Should use Fastify type augmentation

🟡 **MEDIUM:**
6. `optionalS2sMiddleware` always sets `isServiceRequest` even when credentials are invalid (should be undefined)
7. No documentation on which routes should use which middleware variant
8. No helper function to check if service is authenticated (inconsistent with auth.ts pattern)

---

### 2. auth.ts

#### PURPOSE
- **JWT token verification** for user authentication using RSA public key
- **Combined user OR service authentication** (`authenticateUserOrService`)
- **Role-based access control** (requireAdmin, requireRole)
- **Source differentiation** (user vs service vs internal)
- Loads RSA public key from filesystem at startup (fails if missing)

**Middleware variants:**
- `authenticate` / `authenticateFastify` - User JWT only
- `authenticateUserOrService` - Accepts JWT, X-Service-Token, or X-API-Key
- `requireAdmin` - Must have admin role
- `requireRole(roles)` - Must have one of specified roles
- `requireServiceAuth` - Service requests only (blocks users)
- `requireInternalAuth` - Trusted services only

#### REQUEST MODIFICATION
**Attaches to request:**
```typescript
request.user = {
  id: string,           // User ID or Service ID
  sub: string,          // Subject from JWT
  tenant_id: string,    // Tenant ID (CRITICAL)
  source: 'user' | 'service' | 'internal',
  serviceId?: string,   // Service ID if S2S request
  email?: string,       // User email (user requests only)
  permissions: string[], // User permissions or ['*'] for services
  role: string,         // User role or 'service'
  isInternalRequest: boolean
}
```

**Headers read:**
- `Authorization` - Bearer token for user authentication
- `X-Service-Token` - For S2S authentication
- `X-API-Key` - For S2S authentication
- `X-Tenant-Id` - For service requests (fallback to 'system')

#### TENANT ISOLATION
✅ **GOOD - Tenant extracted from JWT for users**
- User requests: `tenant_id` extracted from JWT payload
- Validates `tenant_id` is present in token

🔴 **CRITICAL ISSUE - Service tenant handling:**
```typescript
tenant_id: tenantIdHeader || 'system',
```
- **Services can provide ANY `tenant_id` via header** with no validation
- **Default 'system' tenant allows cross-tenant access**
- **No verification that service is authorized for that tenant**
- Services get `permissions: ['*']` (wildcard access)

⚠️ **HIGH:**
- Only trusted services get `isInternalRequest: true`, but **both trusted and untrusted services get wildcard permissions**

#### EXTERNAL CALLS
- `jwt.verify()` - Uses loaded RSA public key (no external call)
- `verifyServiceToken()` - From `config/service-auth`
- `verifyApiKey()` - From `config/service-auth`
- `isTrustedService()` - From `config/service-auth`

#### ERROR HANDLING
**Format:** ⚠️ **NOT RFC 7807 compliant** - Inconsistent with `error-handler.ts`

**Inconsistent formats:**
```typescript
// Simple format (most errors):
{ error: 'Authentication required' }

// Extended format (some errors):
{ 
  error: 'Admin access required',
  code: 'FORBIDDEN',
  message: 'This action requires admin privileges'
}
```

**Missing RFC 7807 fields:**
- No `type` (URI reference)
- No `title` (human-readable summary)
- No `detail` (detailed explanation)
- No `instance` (unique occurrence ID)

**Status codes:**
- `401` - Authentication required, invalid token, token expired
- `403` - Insufficient permissions, service-only endpoint

#### POTENTIAL ISSUES

🔴 **CRITICAL:**
1. **Service requests can specify any `tenant_id` via X-Tenant-Id header** - No validation that service is authorized
2. **Default 'system' tenant bypasses RLS** - Allows cross-tenant data access
3. **Service requests get wildcard permissions (`['*']`)** - No permission scoping per service
4. **Public key loaded at startup only** - No rotation support, server crashes if file missing

⚠️ **HIGH:**
5. **Error format inconsistent with RFC 7807** - Should use `error-handler.ts` format
6. **No JWT token revocation check** - Stolen tokens remain valid until expiry
7. **Role checks happen after authentication** - Can't fail fast on insufficient roles
8. **JWT validation error messages expose token structure** - Could aid attackers

🟡 **MEDIUM:**
9. Uses `(request as any).user` - Should use Fastify type augmentation
10. `authenticateFastify` and `authenticate` are exact duplicates (dead code)
11. No audit logging for failed authentication attempts
12. Helper functions (`isAdmin`, `hasRole`) access user directly - Could be undefined
13. `authenticateUserOrService` tries S2S auth first - Could log failed attempts incorrectly

🟢 **LOW:**
14. Public key path uses `process.env.HOME!` - Could be undefined in some container environments
15. `requireRole` factory doesn't validate empty `allowedRoles` array
16. Token payload interface defines optional fields but doesn't validate presence

---

### 3. tenant.ts

#### PURPOSE
- **Tenant validation and RLS context setting**
- Ensures tenant exists in database and is active
- Sets PostgreSQL RLS context via `SET LOCAL app.current_tenant_id`
- Provides 3 middleware variants:
  - `tenantHook` - Validates tenant exists/active + sets RLS
  - `strictTenantHook` - Sets RLS only (no DB validation)
  - `optionalTenantHook` - For public endpoints (non-blocking)

**Helper functions:**
- `setTenantContext(trx, tenantId)` - Sets RLS within transaction
- `withTenantContext(tenantId, callback)` - Wraps callback in tenant transaction

#### REQUEST MODIFICATION
**Attaches to request:**
```typescript
request.tenantId = string;  // UUID
request.tenant = {          // Full tenant object (tenantHook only)
  id: string,
  status: string,
  // ... other fields
}
```

**Headers read:**
- None directly (relies on `request.user.tenant_id` from auth middleware)

#### TENANT ISOLATION
✅ **GOOD:**
- Validates `tenant_id` format (UUID)
- Checks tenant exists in database
- Checks tenant `status` is 'active'
- Sets RLS context: `SET LOCAL app.current_tenant_id = ?`

🔴 **CRITICAL ISSUES:**

**1. RLS Context Transaction Scope:**
```typescript
await db.raw('SET LOCAL app.current_tenant_id = ?', [tenantId]);
```
- `SET LOCAL` only persists within a PostgreSQL transaction
- If this runs outside a transaction, it becomes connection-scoped
- **With connection pooling**, RLS context could leak to next request on same connection
- **Risk:** Request A sets tenant X, returns connection to pool, Request B for tenant Y gets same connection with stale tenant X context

**2. Naming Confusion:**
- `tenantHook` - Does DB lookup + RLS (more validation)
- `strictTenantHook` - Only sets RLS (less validation)
- **Naming is backwards** - "strict" should do MORE validation, not less

**3. Race Condition in `optionalTenantHook`:**
```typescript
export function optionalTenantHook(request, reply, done: HookHandlerDoneFunction) {
  // ... async DB operation ...
  db.raw('SET LOCAL app.current_tenant_id = ?', [user.tenant_id])
    .then(() => { /* ... */ })
    .catch((err) => { /* ... */ });
  
  done();  // Called immediately, doesn't wait for DB operation!
}
```
- Uses promise-based DB call but doesn't `await`
- Calls `done()` immediately (request proceeds)
- **RLS might not be set before request handler executes**

#### EXTERNAL CALLS
**Database queries:**
- `db('tenants').where({ id: tenantId }).first()` - Validates tenant exists/active
- `db.raw('SET LOCAL app.current_tenant_id = ?', [tenantId])` - Sets RLS context

**Query pattern:**
- Tenant lookup on **every authenticated request** (no caching)

#### ERROR HANDLING
**Format:** ⚠️ **NOT RFC 7807 compliant**
```typescript
{
  error: 'Tenant ID not found in authentication token',
  code: 'MISSING_TENANT_ID'
}
```

**Status codes:**
- `400` - Missing `tenant_id`, invalid UUID format
- `401` - Authentication required (missing user)
- `403` - Tenant not found, inactive tenant
- `500` - Database errors, internal errors

**Missing RFC 7807 fields:**
- No `type`, `title`, `detail`, `instance`
- Should delegate to `error-handler.ts`

#### POTENTIAL ISSUES

🔴 **CRITICAL:**
1. **SET LOCAL outside transaction = connection-scoped risk** - With connection pooling, RLS context could leak between requests
2. **optionalTenantHook race condition** - Calls `done()` before async DB operation completes
3. **strictTenantHook doesn't validate tenant** - Despite "strict" name, skips existence/status checks
4. **No cleanup of RLS context on error** - Failed requests might leave stale context on connection

⚠️ **HIGH:**
5. **Error responses bypass error-handler.ts** - Inconsistent response format
6. **Tenant lookup on every request** - No caching of active tenants (performance)
7. **No timeout on tenant DB query** - Could hang request indefinitely
8. **No connection pool safety** - Should use `BEGIN; SET LOCAL; ... COMMIT;` pattern

🟡 **MEDIUM:**
9. Type safety: Uses `(request as any).tenantId`
10. `setTenantContext` exported publicly - Could encourage misuse outside middleware
11. Duplicate logic between `tenantHook` and `strictTenantHook`
12. `withTenantContext` helper appears unused (dead code or missing usage)
13. `optionalTenantHook` uses Fastify v3 callback pattern - Should be async

🟢 **LOW:**
14. Logger calls scattered - No consistent request ID tracking
15. `optionalTenantHook` sets `tenantId` to `null` - Should be `undefined`
16. Tenant object structure not typed (uses `any`)

---

### 4. error-handler.ts

#### PURPOSE
- **Centralized RFC 7807 error formatting** for all HTTP API errors
- Sanitizes errors to prevent information leakage in production
- Provides consistent error responses across all endpoints
- Integrates with metrics/monitoring system

**Exports:**
- `errorHandler()` - Fastify error handler (registered globally)
- `registerErrorHandler(app)` - Helper to register handler
- `createProblemError()` - Factory for creating consistent errors in controllers

#### REQUEST MODIFICATION
- None (error handler doesn't modify request)

**Response headers set:**
- `Content-Type: application/problem+json`
- `Cache-Control: no-store` (prevents caching of errors)

#### TENANT ISOLATION
- N/A (error handler is tenant-agnostic)

#### EXTERNAL CALLS
**Monitoring:**
- `incrementErrorMetric(errorType, statusCode, url)` - Metrics tracking
- `logger.error(...)` - Structured logging with request context

**No database or external service calls**

#### ERROR HANDLING
✅ **EXCELLENT - Full RFC 7807 compliance**

**Complete format:**
```typescript
{
  type: string,        // URI: "https://api.tickettoken.com/errors/..."
  title: string,       // Human-readable summary
  status: number,      // HTTP status code
  detail: string,      // Detailed explanation
  instance: string,    // Unique occurrence: "urn:uuid:{requestId}"
  code?: string,       // Machine-readable error code
  errors?: Array<{     // Validation errors array
    field: string,
    message: string,
    code: string
  }>
}
```

**Error types handled:**
- **Validation errors** - Fastify schema validation + custom validation
- **PostgreSQL errors** - Foreign key (23503), unique constraint (23505)
- **Named errors** - ValidationError, NotFoundError, UnauthorizedError, ForbiddenError
- **HTTP status codes** - 400, 401, 403, 404, 409, 422, 429, 5xx

**Production safety:**
- Redacts sensitive headers: `authorization`, `cookie`, `x-api-key`, `x-auth-token`
- Redacts sensitive body fields: `password`, `token`, `secret`, `apiKey`, `creditCard`, `ssn`
- Never exposes stack traces in production (`NODE_ENV === 'production'`)
- Generic messages for 5xx errors (no internal state leaked)
- Request ID tracking for correlation

**Error type URIs:**
- `validation-error` - Request validation failed
- `not-found` - Resource not found
- `unauthorized` - Authentication required
- `forbidden` - Insufficient permissions
- `conflict` - Resource conflict (duplicate)
- `rate-limited` - Too many requests
- `internal-error` - Server error (generic)
- `bad-gateway` - Upstream service error
- `service-unavailable` - Service temporarily down
- `timeout` - Request timeout
- `tenant-invalid` - Tenant reference error

#### POTENTIAL ISSUES

✅ **EXCELLENT IMPLEMENTATION - Only minor issues:**

🟡 **MEDIUM:**
1. **Not enforced across all middleware** - `auth.ts` and `tenant.ts` send raw error objects, bypassing RFC 7807 format
2. **generateRequestId is custom** - Should use `request.id` from Fastify (already generated)
3. **Error type URIs are hardcoded** - Should be configurable via environment variable for different deployments

🟢 **LOW:**
4. `registerErrorHandler` function appears unused - Should be called in server setup
5. `createProblemError` helper appears unused - Should be documented for controller developers
6. Validation error field extraction is fragile: `instancePath?.replace(/^\//, '')`
7. No i18n support for error messages (always English)
8. PostgreSQL error detection only handles two error codes (23503, 23505)
9. No handling for custom application errors (would need explicit type checks)

---

## POTENTIAL ISSUES - COMPLETE LIST

### 🔴 CRITICAL (8 issues)

**Tenant Isolation:**
1. **api-key.middleware.ts** - No tenant extraction for service requests (bypasses tenant isolation)
2. **auth.ts** - Services can specify ANY tenant_id via X-Tenant-Id header with no validation
3. **auth.ts** - Default 'system' tenant bypasses RLS policies entirely
4. **tenant.ts** - SET LOCAL outside transaction = connection pool leak risk

**Authentication:**
5. **auth.ts** - Service requests get wildcard permissions ['*'] with no scoping
6. **auth.ts** - Public key loaded at startup only (no rotation, crashes if missing)

**Race Conditions:**
7. **tenant.ts** - optionalTenantHook race condition (done() called before async DB completes)
8. **tenant.ts** - No cleanup of RLS context on error (stale context on pooled connections)

### ⚠️ HIGH (10 issues)

**Security:**
1. **api-key.middleware.ts** - No logging of failed S2S authentication attempts
2. **api-key.middleware.ts** - No rate limiting on S2S endpoints
3. **auth.ts** - No JWT token revocation check (stolen tokens valid until expiry)
4. **auth.ts** - Services get wildcard permissions even if untrusted

**Consistency:**
5. **auth.ts** - Error format inconsistent with RFC 7807 standard
6. **tenant.ts** - Error responses bypass error-handler.ts (inconsistent format)
7. **tenant.ts** - strictTenantHook naming is backwards (does less validation)

**Performance:**
8. **tenant.ts** - Tenant lookup on every request (no caching)
9. **tenant.ts** - No timeout on tenant DB query (could hang)
10. **tenant.ts** - No connection pool safety (should use transaction wrapper)

### 🟡 MEDIUM (13 issues)

**Code Quality:**
1. **api-key.middleware.ts** - serviceName property defined but never populated (dead code)
2. **api-key.middleware.ts** - Uses `(request as any)` instead of type augmentation
3. **api-key.middleware.ts** - optionalS2sMiddleware always sets isServiceRequest (incorrect)
4. **auth.ts** - authenticateFastify and authenticate are duplicates
5. **auth.ts** - Uses `(request as any).user` instead of type augmentation
6. **auth.ts** - No audit logging for failed authentication
7. **tenant.ts** - Uses `(request as any).tenantId` instead of type augmentation
8. **tenant.ts** - setTenantContext exported publicly (could encourage misuse)
9. **tenant.ts** - withTenantContext helper appears unused
10. **error-handler.ts** - Not enforced across all middleware
11. **error-handler.ts** - generateRequestId is custom (should use Fastify's)
12. **error-handler.ts** - Error type URIs hardcoded (should be configurable)

**Documentation:**
13. **api-key.middleware.ts** - No documentation on which variant to use when

### 🟢 LOW (9 issues)

**Minor Issues:**
1. **api-key.middleware.ts** - No helper to check if service is authenticated
2. **auth.ts** - Public key path uses `process.env.HOME!` (could be undefined)
3. **auth.ts** - requireRole doesn't validate empty allowedRoles array
4. **auth.ts** - Token payload interface doesn't validate optional fields
5. **tenant.ts** - Logger calls lack consistent request ID tracking
6. **tenant.ts** - optionalTenantHook sets tenantId to null (should be undefined)
7. **tenant.ts** - Tenant object not typed
8. **error-handler.ts** - registerErrorHandler appears unused
9. **error-handler.ts** - createProblemError appears unused (no documentation)

---

## POSITIVE FINDINGS

### ✅ Excellent Implementation: error-handler.ts

**RFC 7807 Compliance:**
- Full compliance with RFC 7807 Problem Details specification
- Consistent error format across all handled errors
- Proper URI-based error types
- Request ID tracking for correlation

**Production Safety:**
- Comprehensive redaction of sensitive data
- No stack traces or internal state in production
- Generic messages for server errors
- Cache-Control headers prevent error caching

**Monitoring Integration:**
- Structured logging with request context
- Metrics tracking by error type and status code
- Request/response correlation

### ✅ Service Boundary Compliance

**No boundary violations detected:**
- ❌ No ticket inventory management (belongs to ticket-service)
- ❌ No payment processing (belongs to payment-service)
- ❌ No user authentication logic (delegates to auth-service via JWT)
- ❌ No venue details management (belongs to venue-service)
- ❌ No notification sending (belongs to notification-service)
- ❌ No blockchain/NFT operations (belongs to blockchain-service)
- ❌ No file upload handling (belongs to file-service)

**Correct delegation:**
- ✅ Verifies JWT tokens issued by auth-service
- ✅ Validates tenant references in database
- ✅ Sets RLS context for event-service queries only

### ✅ Multi-Tenancy Features

**Tenant isolation mechanisms:**
- UUID validation for tenant_id
- Database tenant existence/status verification
- PostgreSQL RLS context setting via SET LOCAL
- Tenant extraction from JWT tokens

**Note:** While mechanisms exist, implementation has critical gaps (see issues above).

---

## INTEGRATION TEST FILE MAPPING

| Middleware | Test File | Priority | Key Scenarios |
|------------|-----------|----------|---------------|
| **api-key.middleware.ts** | `tests/integration/s2s-auth.test.ts` | 🔴 CRITICAL | - Valid/invalid API keys<br>- Valid/invalid service tokens<br>- Missing auth headers<br>- S2S without tenant context<br>- Combined middleware (apiKey + tenant) |
| **auth.ts** | `tests/integration/user-auth.test.ts` | 🔴 CRITICAL | - Valid/expired JWT tokens<br>- Missing tenant_id in token<br>- Service requests with X-Tenant-Id<br>- Service requests with 'system' tenant<br>- Service wildcard permissions<br>- Role-based access (admin, user) |
| **tenant.ts** | `tests/integration/tenant-isolation.test.ts` | 🔴 CRITICAL | - Tenant validation (exists, active)<br>- Invalid tenant_id format<br>- RLS context persistence<br>- **Connection pool context leak**<br>- **Concurrent requests different tenants**<br>- optionalTenantHook race condition<br>- Error during request (RLS cleanup) |
| **error-handler.ts** | `tests/integration/error-responses.test.ts` | ⚠️ HIGH | - RFC 7807 format compliance<br>- Sensitive data redaction<br>- Production vs development modes<br>- PostgreSQL error mapping<br>- Validation error formatting |
| **Combined** | `tests/integration/middleware-chain.test.ts` | 🔴 CRITICAL | - Full middleware stack (auth → tenant → handler)<br>- Error format consistency<br>- Request context propagation<br>- Transaction scope boundaries |

### Test Scenarios by Priority

**🔴 CRITICAL - Tenant Isolation:**
```typescript
describe('Tenant Isolation', () => {
  test('Service request without X-Tenant-Id header', async () => {
    // Should default to 'system' or reject?
  });
  
  test('Service request with invalid tenant_id', async () => {
    // Should be rejected, but currently no validation
  });
  
  test('Concurrent requests for different tenants', async () => {
    // Test connection pool RLS context isolation
  });
  
  test('RLS context persists across transaction only', async () => {
    // SET LOCAL should not leak between pooled connections
  });
  
  test('Error during request cleans up RLS context', async () => {
    // Failed request should not leave stale tenant context
  });
});
```

**🔴 CRITICAL - Service Authentication:**
```typescript
describe('Service Authentication', () => {
  test('Service cannot access unauthorized tenant', async () => {
    // X-Tenant-Id should be validated against service permissions
  });
  
  test('Service wildcard permissions are scoped', async () => {
    // ['*'] should not mean literal wildcard access
  });
  
  test('Untrusted service has limited permissions', async () => {
    // Trusted vs untrusted should have different permission sets
  });
});
```

**⚠️ HIGH - Error Format Consistency:**
```typescript
describe('Error Format Consistency', () => {
  test('auth.ts returns RFC 7807 format', async () => {
    // All auth errors should match error-handler.ts format
  });
  
  test('tenant.ts returns RFC 7807 format', async () => {
    // All tenant errors should match error-handler.ts format
  });
  
  test('Production mode hides sensitive details', async () => {
    // NODE_ENV=production should sanitize all error messages
  });
});
```

**⚠️ HIGH - Race Conditions:**
```typescript
describe('Race Conditions', () => {
  test('optionalTenantHook completes before handler', async () => {
    // RLS should be set before request.handler() executes
  });
  
  test('High concurrency does not cause context bleed', async () => {
    // 100 concurrent requests to different tenants
  });
});
```

---

## CROSS-SERVICE DEPENDENCIES

### Internal Dependencies

**config/service-auth:**
- `verifyApiKey(apiKey)` - Validates static API keys
- `verifyServiceToken(token)` - Validates dynamic service tokens
- `isTrustedService(serviceId)` - Checks if service is trusted

**Action Required:** Need to analyze `config/service-auth.ts` to understand:
- Where API keys are stored (environment variables, database, secrets manager?)
- How service tokens are generated and signed
- What makes a service "trusted"
- If there's tenant-to-service authorization mapping

**config/database:**
- `db` - Knex instance for PostgreSQL queries
- Connection pooling configuration
- Transaction handling

**utils/logger:**
- `logger.error()` - Structured error logging
- `logger.warn()` - Warning logging
- `logger.debug()` - Debug logging

**utils/metrics:**
- `incrementErrorMetric()` - Error tracking for monitoring

### External Dependencies

**Filesystem:**
- JWT public key loaded from:
  - `process.env.JWT_PUBLIC_KEY_PATH`
  - Default: `~/tickettoken-secrets/jwt-public.pem`
- **Risk:** Server crashes if file missing or unreadable
- **Missing:** No key rotation mechanism

**Database:**
- `tenants` table - Tenant validation queries
- RLS policies - Rely on `app.current_tenant_id` session variable
- Connection pool - Used for all queries

**Environment Variables:**
- `JWT_PUBLIC_KEY_PATH` - Path to RSA public key
- `JWT_ISSUER` - Token issuer validation (default: 'tickettoken')
- `JWT_AUDIENCE` - Token audience validation (default: same as issuer)
- `NODE_ENV` - Production vs development mode
- `HOME` - Used for default key path

**auth-service (external):**
- Issues JWT tokens with tenant_id
- Signs tokens with private key (event-service has public key only)
- **Implicit dependency:** Token format and claims must match

---

## REMAINING CONCERNS

### 1. Service-to-Service Tenant Isolation

**Current State:**
```typescript
// auth.ts - authenticateUserOrService
tenant_id: tenantIdHeader || 'system',
```

**Problems:**
1. Services can provide **any** tenant_id via X-Tenant-Id header
2. No validation that service is authorized for that tenant
3. Default 'system' tenant bypasses RLS entirely
4. No audit trail of which service accessed which tenant

**Architectural Questions:**
- Should services be tenant-scoped (1 service per tenant)?
- Should there be a service-to-tenant authorization table?
- Should 'system' tenant exist at all, or should all requests be tenant-scoped?
- Should internal services use a different authentication flow?

**Recommended Approach:**
1. Create `service_tenant_permissions` table mapping serviceId → tenantId → permissions
2. Validate X-Tenant-Id against this table in auth.ts
3. Remove 'system' default (require explicit tenant)
4. Add audit logging for all S2S requests

### 2. SET LOCAL Scope and Connection Pooling

**Current State:**
```typescript
// tenant.ts - tenantHook
await db.raw('SET LOCAL app.current_tenant_id = ?', [tenantId]);
```

**Problems:**
1. `SET LOCAL` only works inside a transaction
2. Outside transaction, it's connection-scoped
3. With connection pooling, context can leak between requests
4. No guarantee of transaction wrapping for all requests

**PostgreSQL Behavior:**
- **Inside transaction:** `SET LOCAL` reverts when transaction ends (safe)
- **Outside transaction:** `SET LOCAL` persists until connection reset (unsafe with pooling)

**Test Scenario:**
```
Request A (tenant X) → Gets connection C1 → SET LOCAL tenant=X → Query → Return C1 to pool
Request B (tenant Y) → Gets connection C1 → SET LOCAL tenant=Y not in transaction? → Uses tenant X! 🔴
```

**Recommended Approach:**
1. **Wrap all requests in transaction:**
   ```typescript
   app.addHook('onRequest', async (request, reply) => {
     request.transaction = await db.transaction();
   });
   
   app.addHook('onResponse', async (request, reply) => {
     await request.transaction.commit();
   });
   
   app.addHook('onError', async (request, reply) => {
     await request.transaction.rollback();
   });
   ```

2. **Set RLS within transaction:**
   ```typescript
   await trx.raw('SET LOCAL app.current_tenant_id = ?', [tenantId]);
   ```

3. **Or use connection-level reset:**
   ```typescript
   // After returning connection to pool
   await db.raw('RESET app.current_tenant_id');
   ```

### 3. Race Condition in optionalTenantHook

**Current Code:**
```typescript
export function optionalTenantHook(request, reply, done: HookHandlerDoneFunction) {
  const user = (request as any).user;
  if (user && user.tenant_id) {
    db.raw('SET LOCAL app.current_tenant_id = ?', [user.tenant_id])
      .then(() => { /* ... */ })
      .catch((err) => { /* ... */ });
  }
  done();  // 🔴 Called immediately, doesn't wait!
}
```

**Problem:**
- `done()` signals Fastify to proceed to next handler
- DB operation is still pending (promise not awaited)
- Request handler might execute before RLS is set

**Impact:**
- Public endpoints with optional auth might have inconsistent RLS
- First query might run without tenant context
- Subsequent queries might have it (timing-dependent)

**Recommended Approach:**
```typescript
export async function optionalTenantHook(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const user = (request as any).user;
  if (user?.tenant_id) {
    try {
      await db.raw('SET LOCAL app.current_tenant_id = ?', [user.tenant_id]);
      (request as any).tenantId = user.tenant_id;
    } catch (err) {
      request.log.warn({ error: err }, 'Failed to set optional tenant context');
    }
  } else {
    (request as any).tenantId = undefined;
  }
}
```

### 4. Error Format Inconsistency

**Current State:**
- `error-handler.ts` - Full RFC 7807 implementation ✅
- `auth.ts` - Returns `{ error, code }` ❌
- `tenant.ts` - Returns `{ error, code }` ❌

**Impact:**
- Clients receive different error formats from different endpoints
- Frontend error handling must check multiple formats
- Breaks API contract consistency

**Example:**
```typescript
// From error-handler.ts (correct):
{
  "type": "https://api.tickettoken.com/errors/unauthorized",
  "title": "Authentication Required",
  "status": 401,
  "detail": "Valid authentication credentials are required.",
  "instance": "urn:uuid:abc123",
  "code": "UNAUTHORIZED"
}

// From auth.ts (incorrect):
{
  "error": "Authentication required"
}
```

**Recommended Approach:**
1. **Throw errors instead of sending responses:**
   ```typescript
   // auth.ts - BEFORE
   return reply.status(401).send({ error: 'Authentication required' });
   
   // auth.ts - AFTER
   throw createProblemError(401, 'UNAUTHORIZED', 'Authentication required');
   ```

2. **Let error-handler.ts format all errors:**
   - Ensures RFC 7807 compliance
   - Centralizes production safety (redaction)
   - Consistent logging and metrics

3. **Update all middleware to throw, not send:**
   - `auth.ts` - All authentication errors
   - `tenant.ts` - All tenant validation errors
   - `api-key.middleware.ts` - Already compliant ✅

---

## NEXT STEPS

### Immediate Actions (Before Integration Tests)

1. **Team Architectural Review Required:**
   - Service-to-tenant authorization model
   - 'system' tenant usage and security implications
   - Service permission scoping (wildcard vs granular)
   - Transaction wrapping strategy for RLS

2. **Documentation Needed:**
   - Analyze `config/service-auth.ts` implementation
   - Document middleware chains for each route
   - Create integration test plan based on findings

3. **Code Analysis:**
   - Search for all route registrations to see middleware usage
   - Check if any routes bypass tenant isolation
   - Verify transaction usage across request handlers

### Long-Term Fixes (Post-Review)

1. **Tenant Isolation Hardening**
2. **Error Format Standardization**
3. **Connection Pool Safety**
4. **JWT Key Rotation Support**
5. **S2S Audit Logging**
6. **Permission Scoping System**

---

**Analysis Complete:** 2026-01-20
**Status:** Documentation only - No code changes made (requires team review)
**Files Analyzed:** 4 middleware files (1,169 total lines)
**Issues Identified:** 40 total (8 critical, 10 high, 13 medium, 9 low)
