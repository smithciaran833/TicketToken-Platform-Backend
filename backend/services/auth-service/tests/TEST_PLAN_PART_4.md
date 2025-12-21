# Auth Service Test Plan - Part 4: Middleware, Errors & Utilities

> **Target Coverage:** 80-100% code coverage  
> **Files Covered:** 8 middleware, error, and utility files  
> **Estimated Tests:** ~127 tests

---

## FILE 22: `src/middleware/auth.middleware.ts`

### Functions & Coverage Requirements

#### 1. `createAuthMiddleware(jwtService, rbacService)` - Factory Function

**Returns object with 3 methods:**
- `authenticate`
- `requirePermission`
- `requireVenueAccess`

---

#### 2. `authenticate(request, reply)` - 4 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | No authorization header | Omit `Authorization` header |
| 2 | Header doesn't start with "Bearer " | Use `Basic` or malformed header |
| 3 | Token verification fails | Invalid/expired token |
| 4 | Success | Valid Bearer token |

**Errors:**
- `AuthenticationError: Missing or invalid authorization header`
- `AuthenticationError: Invalid token` (catch block)
- Propagated `AuthenticationError` from jwtService

**Test Cases:**
```
✓ Should throw AuthenticationError when no Authorization header
✓ Should throw AuthenticationError when header is "Basic xxx"
✓ Should throw AuthenticationError when header is "Bearerxxx" (no space)
✓ Should call jwtService.verifyAccessToken with extracted token
✓ Should call rbacService.getUserPermissions with payload.sub
✓ Should set request.user with id, tenant_id, email, role, permissions
✓ Should propagate AuthenticationError from jwtService
✓ Should wrap non-AuthenticationError as "Invalid token"
```

---

#### 3. `requirePermission(permission)` - 3 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | No request.user | Call without authenticate middleware |
| 2 | Missing permission | User lacks permission |
| 3 | Has permission | User has permission |

**Errors:**
- `AuthenticationError: Authentication required`
- `AuthorizationError: Missing required permission: ${permission}`

**Test Cases:**
```
✓ Should throw AuthenticationError when request.user is undefined
✓ Should extract venueId from request.params.venueId
✓ Should extract venueId from request.body.venueId if not in params
✓ Should call rbacService.checkPermission with userId, permission, venueId
✓ Should throw AuthorizationError when hasPermission is false
✓ Should pass silently when hasPermission is true
```

---

#### 4. `requireVenueAccess(request, reply)` - 4 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | No request.user | Not authenticated |
| 2 | No venueId in params | Missing path parameter |
| 3 | No access to venue | User has no role for venue |
| 4 | Has access | User has venue role |

**Errors:**
- `AuthenticationError: Authentication required`
- `Error: Venue ID required`
- `AuthorizationError: No access to this venue`

**Test Cases:**
```
✓ Should throw AuthenticationError when request.user undefined
✓ Should throw Error when venueId missing from params
✓ Should call rbacService.getUserVenueRoles
✓ Should throw AuthorizationError when no matching venue_id in roles
✓ Should pass silently when user has role for venue
```

---

## FILE 23: `src/middleware/tenant.middleware.ts`

### Functions & Coverage Requirements

#### 1. `validateTenant(request, reply)` - 3 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | No user | Not authenticated |
| 2 | No tenant_id in user | JWT missing tenant_id |
| 3 | Valid tenant | User has tenant_id |

**Response Codes:**
- 401: `AUTH_REQUIRED`
- 403: `MISSING_TENANT_ID`

**Test Cases:**
```
✓ Should return 401 when request.user is undefined
✓ Should return 403 when user.tenant_id is null/undefined
✓ Should log error when tenant_id missing
✓ Should log debug when validation passes
✓ Should not send reply when validation passes
```

---

#### 2. `validateResourceTenant(userTenantId, resourceTenantId)` - 2 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Match | Same tenant_id |
| 2 | Mismatch | Different tenant_ids |

**Test Cases:**
```
✓ Should return true when tenant IDs match
✓ Should return false when tenant IDs differ
✓ Should be case-sensitive
```

---

#### 3. `addTenantFilter(tenantId)` - 1 branch

**Test Cases:**
```
✓ Should return object with tenant_id property
```

---

#### 4. `TenantIsolationError` class - 1 branch

**Test Cases:**
```
✓ Should have statusCode 403
✓ Should have code TENANT_ISOLATION_VIOLATION
✓ Should use default message when none provided
✓ Should use custom message when provided
✓ Should have name TenantIsolationError
```

---

## FILE 24: `src/middleware/validation.middleware.ts`

### Functions & Coverage Requirements

#### 1. `validate(schema, source)` - 5 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | source='body' | Default or explicit 'body' |
| 2 | source='query' | Pass 'query' as source |
| 3 | source='params' | Pass 'params' as source |
| 4 | Joi.ValidationError | Schema validation fails |
| 5 | Other error | Non-Joi error |

**Errors:**
- Custom error with statusCode=400, errors array (Joi validation)
- Propagated error (non-Joi)

**Test Cases:**
```
✓ Should validate request.body by default
✓ Should validate request.query when source='query'
✓ Should validate request.params when source='params'
✓ Should replace request.body with validated data
✓ Should replace request.query with validated data
✓ Should replace request.params with validated data
✓ Should use abortEarly: false (collect all errors)
✓ Should use stripUnknown: true (remove extra fields)
✓ Should throw error with statusCode 400 for Joi.ValidationError
✓ Should include errors array with field and message
✓ Should propagate non-Joi errors unchanged
```

---

## FILE 25: `src/errors/index.ts`

### Error Classes & Coverage Requirements

#### 1. `AppError(message, statusCode)` - Base class

**Test Cases:**
```
✓ Should set message from constructor
✓ Should set statusCode from constructor
✓ Should set isOperational to true
✓ Should capture stack trace
✓ Should be instanceof Error
```

---

#### 2. `ValidationError(errors)` - 1 branch

**Test Cases:**
```
✓ Should have message "Validation failed"
✓ Should have statusCode 422
✓ Should store errors array
✓ Should be instanceof AppError
```

---

#### 3. `NotFoundError(resource)` - 2 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Default resource | No argument |
| 2 | Custom resource | Pass resource name |

**Test Cases:**
```
✓ Should have message "Resource not found" by default
✓ Should have message "User not found" when resource='User'
✓ Should have statusCode 404
```

---

#### 4. `AuthenticationError(message)` - 2 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Default message | No argument |
| 2 | Custom message | Pass message |

**Test Cases:**
```
✓ Should have message "Authentication failed" by default
✓ Should have custom message when provided
✓ Should have statusCode 401
```

---

#### 5. `AuthorizationError(message)` - 2 branches

**Test Cases:**
```
✓ Should have message "Access denied" by default
✓ Should have custom message when provided
✓ Should have statusCode 403
```

---

#### 6. `ConflictError(message)` - 2 branches

**Test Cases:**
```
✓ Should have message "Resource conflict" by default
✓ Should have custom message when provided
✓ Should have statusCode 409
```

---

#### 7. `RateLimitError(message, ttl)` - 3 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Default message, no TTL | No arguments |
| 2 | Custom message, no TTL | Message only |
| 3 | Custom message, with TTL | Both arguments |

**Test Cases:**
```
✓ Should have message "Too many requests" by default
✓ Should have custom message when provided
✓ Should have statusCode 429
✓ Should store ttl when provided
✓ Should have ttl undefined when not provided
```

---

#### 8. `TokenError(message)` - 2 branches

**Test Cases:**
```
✓ Should have message "Invalid or expired token" by default
✓ Should have custom message when provided
✓ Should have statusCode 401
```

---

## FILE 26: `src/utils/logger.ts`

### Functions & Coverage Requirements

#### 1. `logger` (winston instance) - Branches in format

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | NODE_ENV='development' | Development mode |
| 2 | NODE_ENV != 'development' | Production/test mode |

**Test Cases:**
```
✓ Should create logger with 'info' level by default
✓ Should use LOG_LEVEL from env when set
✓ Should use colorize+simple format in development
✓ Should use json format in production
✓ Should sanitize log data via PIISanitizer
✓ Should include 'auth-service' in defaultMeta
```

---

#### 2. `console.log` override - 1 branch

**Test Cases:**
```
✓ Should sanitize arguments before logging
✓ Should call original console.log
```

---

#### 3. `console.error` override - 1 branch

**Test Cases:**
```
✓ Should sanitize arguments before logging
✓ Should call original console.error
```

---

#### 4. `console.warn` override - 1 branch

**Test Cases:**
```
✓ Should sanitize arguments before logging
✓ Should call original console.warn
```

---

#### 5. `logError(message, error, meta)` - 2 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | With meta | Pass meta object |
| 2 | Without meta | Omit meta |

**Test Cases:**
```
✓ Should call logger.error with message
✓ Should sanitize error object
✓ Should sanitize meta object
✓ Should work without meta
```

---

#### 6. `logRequest(req, meta)` - 2 branches

**Test Cases:**
```
✓ Should call logger.info with "Request received"
✓ Should sanitize request via PIISanitizer.sanitizeRequest
✓ Should sanitize meta
✓ Should work without meta
```

---

#### 7. `logResponse(req, res, body, meta)` - 2 branches

**Test Cases:**
```
✓ Should call logger.info with "Response sent"
✓ Should include request method and url
✓ Should sanitize response and body
✓ Should sanitize meta
```

---

## FILE 27: `src/utils/metrics.ts`

### Exports & Coverage Requirements

#### 1. `register` (Registry)

**Test Cases:**
```
✓ Should export prom-client Registry instance
```

---

#### 2. `loginAttemptsTotal` (Counter)

**Test Cases:**
```
✓ Should have name 'auth_login_attempts_total'
✓ Should have 'status' label
✓ Should be registered in register
✓ Should increment with .inc()
```

---

#### 3. `registrationTotal` (Counter)

**Test Cases:**
```
✓ Should have name 'auth_registrations_total'
✓ Should have 'status' label
```

---

#### 4. `tokenRefreshTotal` (Counter)

**Test Cases:**
```
✓ Should have name 'auth_token_refresh_total'
✓ Should have 'status' label
```

---

#### 5. `authDuration` (Histogram)

**Test Cases:**
```
✓ Should have name 'auth_operation_duration_seconds'
✓ Should have 'operation' label
✓ Should observe duration with .observe()
```

---

## FILE 28: `src/utils/rateLimiter.ts`

### Methods & Coverage Requirements

#### 1. `constructor(keyPrefix, options)` - 1 branch

**Test Cases:**
```
✓ Should set keyPrefix
✓ Should set points from options
✓ Should set duration from options
✓ Should default blockDuration to duration * 2
✓ Should use custom blockDuration when provided
```

---

#### 2. `consume(key, points)` - 5 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Blocked (block key exists) | Previously exceeded limit |
| 2 | First request (currentPoints === 1) | Fresh key |
| 3 | Subsequent request | Points 2 to limit |
| 4 | Limit exceeded (points > limit) | Request after limit |
| 5 | Under limit | Request within limit |

**Errors:**
- `RateLimitError: Too many requests` (blocked)
- `RateLimitError: Rate limit exceeded` (just exceeded)

**Test Cases:**
```
✓ Should throw RateLimitError with TTL when blocked
✓ Should increment Redis counter
✓ Should set expiry on first request only
✓ Should NOT set expiry on subsequent requests
✓ Should set block key when limit exceeded
✓ Should throw RateLimitError with blockDuration when exceeded
✓ Should pass silently when under limit
```

---

#### 3. `reset(key)` - 1 branch

**Test Cases:**
```
✓ Should delete counter key
✓ Should delete block key
```

---

#### 4. Pre-configured instances

**Test Cases:**
```
✓ loginRateLimiter: Should have points=5, duration=900
✓ registrationRateLimiter: Should have points=3, duration=3600
✓ passwordResetRateLimiter: Should have points=3, duration=3600
```

---

## FILE 29: `src/utils/sanitize.ts`

### Functions & Coverage Requirements

#### 1. `stripHtml(input)` - 2 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Non-string input | Pass number/null/undefined |
| 2 | String input | Pass string |

**Test Cases:**
```
✓ Should return input unchanged if not string
✓ Should remove <b> tags
✓ Should remove <script> tags
✓ Should remove all HTML tags
✓ Should trim whitespace
✓ Should handle nested tags
✓ Should handle self-closing tags
```

---

#### 2. `escapeHtml(input)` - 2 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Non-string input | Pass number/null/undefined |
| 2 | String input | Pass string |

**Test Cases:**
```
✓ Should return input unchanged if not string
✓ Should escape & to &amp;
✓ Should escape < to &lt;
✓ Should escape > to &gt;
✓ Should escape " to &quot;
✓ Should escape ' to &#x27;
✓ Should escape multiple characters
```

---

#### 3. `sanitizeName(input)` - 1 branch

**Test Cases:**
```
✓ Should call stripHtml on input
✓ Should strip HTML from names
```

---

#### 4. `sanitizeObject(obj, fields)` - 3 branches

| Branch | Condition | How to Trigger |
|--------|-----------|----------------|
| 1 | Field is string | String field in fields list |
| 2 | Field is not string | Number/boolean field |
| 3 | Field not in object | Field in list but not in obj |

**Test Cases:**
```
✓ Should sanitize specified string fields
✓ Should leave non-string fields unchanged
✓ Should not modify fields not in list
✓ Should not throw for missing fields
✓ Should return new object (not mutate original)
```

---

#### 5. `USER_SANITIZE_FIELDS` constant

**Test Cases:**
```
✓ Should include firstName, lastName
✓ Should include first_name, last_name
✓ Should include display_name, bio, username
```

---

## PART 4 SUMMARY: TEST COUNT ESTIMATE

| File | Estimated Tests | Priority |
|------|-----------------|----------|
| auth.middleware.ts | 20 tests | P0 - Critical |
| tenant.middleware.ts | 12 tests | P0 - Critical |
| validation.middleware.ts | 12 tests | P0 - Critical |
| errors/index.ts | 25 tests | P1 - High |
| utils/logger.ts | 15 tests | P1 - High |
| utils/metrics.ts | 10 tests | P2 - Medium |
| utils/rateLimiter.ts | 15 tests | P0 - Critical |
| utils/sanitize.ts | 18 tests | P1 - High |
| **Part 4 TOTAL** | **~127 tests** | |

---

## Testing Strategy

### Unit Tests
- Mock all external dependencies (JWT, RBAC services)
- Test each function in isolation
- Focus on branch coverage
- Test error paths explicitly

### Middleware Testing Pattern
```typescript
// Example: Testing authenticate middleware
const mockRequest = {
  headers: { authorization: 'Bearer valid-token' }
};
const mockReply = {};
const mockJwtService = {
  verifyAccessToken: jest.fn()
};
const mockRbacService = {
  getUserPermissions: jest.fn()
};

const { authenticate } = createAuthMiddleware(mockJwtService, mockRbacService);
await authenticate(mockRequest, mockReply);

expect(mockRequest.user).toBeDefined();
```

### Error Testing Pattern
```typescript
// Example: Testing custom error classes
const error = new AuthenticationError('Custom message');
expect(error.statusCode).toBe(401);
expect(error.message).toBe('Custom message');
expect(error.isOperational).toBe(true);
expect(error).toBeInstanceOf(AppError);
```

### Utility Testing Pattern
```typescript
// Example: Testing sanitize functions
const dirty = '<script>alert("xss")</script>Hello';
const clean = stripHtml(dirty);
expect(clean).toBe('Hello');
expect(clean).not.toContain('<script>');
```

---

## Mocking Requirements

| Dependency | Mock Method |
|------------|-------------|
| `jwtService` | jest.fn() for all methods |
| `rbacService` | jest.fn() for all methods |
| `winston` | jest.mock('winston') |
| `prom-client` | jest.mock('prom-client') |
| `redis` | jest.mock('../config/redis') |

---

## Test File Structure
```
tests/
├── unit/
│   ├── middleware/
│   │   ├── auth.middleware.test.ts
│   │   ├── tenant.middleware.test.ts
│   │   └── validation.middleware.test.ts
│   ├── errors/
│   │   └── index.test.ts
│   └── utils/
│       ├── logger.test.ts
│       ├── metrics.test.ts
│       ├── rateLimiter.test.ts
│       └── sanitize.test.ts
└── integration/
    └── middleware-stack.integration.test.ts
```

---

## Coverage Targets

| Metric | Target |
|--------|--------|
| Line Coverage | ≥ 80% |
| Branch Coverage | ≥ 80% |
| Function Coverage | 100% |
| Statement Coverage | ≥ 80% |
