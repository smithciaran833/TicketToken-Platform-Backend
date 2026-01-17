# Auth Service Errors Analysis
## Purpose: Integration Testing Documentation
## Source: src/errors/index.ts
## Generated: January 15, 2026

---

## ERROR HIERARCHY

```
Error (built-in)
  └── AppError (base class)
        ├── ValidationError
        ├── NotFoundError
        ├── AuthenticationError
        ├── AuthorizationError
        ├── ConflictError
        ├── RateLimitError
        ├── TokenError
        ├── TenantError
        ├── MFARequiredError
        ├── CaptchaError
        └── SessionError
```

---

## BASE CLASS: `AppError`

| Property | Type | Description |
|----------|------|-------------|
| `message` | string | Error message (inherited from Error) |
| `statusCode` | number | HTTP status code |
| `code` | string | Error code identifier |
| `isOperational` | boolean | Always `true` (distinguishes operational vs programming errors) |

### Constructor Signature
```typescript
constructor(message: string, statusCode: number, code: string = 'INTERNAL_ERROR')
```

---

## ERROR CLASSES SUMMARY

| Class | HTTP Status | Error Code | Default Message | Extra Properties |
|-------|-------------|------------|-----------------|------------------|
| `AppError` | *(custom)* | `INTERNAL_ERROR` (default) | *(custom)* | - |
| `ValidationError` | **422** | `VALIDATION_ERROR` | "Validation failed" | `errors: any[]` |
| `NotFoundError` | **404** | `NOT_FOUND` | "{resource} not found" | - |
| `AuthenticationError` | **401** | `AUTHENTICATION_FAILED` (default) | "Authentication failed" | - |
| `AuthorizationError` | **403** | `ACCESS_DENIED` | "Access denied" | - |
| `ConflictError` | **409** | `CONFLICT` | "Resource conflict" | - |
| `RateLimitError` | **429** | `RATE_LIMIT_EXCEEDED` | "Too many requests" | `ttl?: number` |
| `TokenError` | **401** | `TOKEN_INVALID` | "Invalid or expired token" | - |
| `TenantError` | **400** | `TENANT_INVALID` | "Invalid tenant context" | - |
| `MFARequiredError` | **401** | `MFA_REQUIRED` | "MFA verification required" | - |
| `CaptchaError` | **400** | `CAPTCHA_REQUIRED` (default) | "CAPTCHA verification required" | - |
| `SessionError` | **401** | `SESSION_EXPIRED` | "Session expired" | - |

---

## DETAILED ERROR CLASS DEFINITIONS

### 1. `ValidationError`
```typescript
constructor(errors: any[])
// HTTP 422, code: VALIDATION_ERROR
// Extra: errors array containing validation details
```

**Use Cases:**
- Input validation failures from Joi schemas
- Expected response: `{ error: "Validation failed", code: "VALIDATION_ERROR", errors: [...] }`

---

### 2. `NotFoundError`
```typescript
constructor(resource = 'Resource')
// HTTP 404, code: NOT_FOUND
// Message: "{resource} not found"
```

**Use Cases:**
- User not found
- Session not found
- Expected response: `{ error: "User not found", code: "NOT_FOUND" }`

---

### 3. `AuthenticationError`
```typescript
constructor(message = 'Authentication failed', code = 'AUTHENTICATION_FAILED')
// HTTP 401, code: customizable (default AUTHENTICATION_FAILED)
```

**Use Cases:**
- Invalid credentials (wrong password)
- Account not verified
- Account locked
- Expected response: `{ error: "Invalid credentials", code: "AUTHENTICATION_FAILED" }`

---

### 4. `AuthorizationError`
```typescript
constructor(message = 'Access denied')
// HTTP 403, code: ACCESS_DENIED
```

**Use Cases:**
- Insufficient permissions
- Wrong tenant access attempt
- Expected response: `{ error: "Access denied", code: "ACCESS_DENIED" }`

---

### 5. `ConflictError`
```typescript
constructor(message = 'Resource conflict')
// HTTP 409, code: CONFLICT
```

**Use Cases:**
- Email already exists
- Username taken
- Duplicate registration
- Expected response: `{ error: "Email already in use", code: "CONFLICT" }`

---

### 6. `RateLimitError`
```typescript
constructor(message = 'Too many requests', ttl?: number)
// HTTP 429, code: RATE_LIMIT_EXCEEDED
// Extra: ttl (time to live in seconds until retry allowed)
```

**Use Cases:**
- Login attempts exceeded
- Password reset requests throttled
- Expected response: `{ error: "Too many requests", code: "RATE_LIMIT_EXCEEDED" }`
- May include `Retry-After` header based on `ttl`

---

### 7. `TokenError`
```typescript
constructor(message = 'Invalid or expired token')
// HTTP 401, code: TOKEN_INVALID
```

**Use Cases:**
- Expired JWT
- Malformed token
- Password reset token expired
- Expected response: `{ error: "Invalid or expired token", code: "TOKEN_INVALID" }`

---

### 8. `TenantError`
```typescript
constructor(message = 'Invalid tenant context')
// HTTP 400, code: TENANT_INVALID
```

**Use Cases:**
- Missing tenant_id header
- Invalid tenant UUID
- Tenant not found
- Expected response: `{ error: "Invalid tenant context", code: "TENANT_INVALID" }`

---

### 9. `MFARequiredError`
```typescript
constructor(message = 'MFA verification required')
// HTTP 401, code: MFA_REQUIRED
```

**Use Cases:**
- User has MFA enabled but didn't provide token
- MFA token required for sensitive action
- Expected response: `{ error: "MFA verification required", code: "MFA_REQUIRED" }`

---

### 10. `CaptchaError`
```typescript
constructor(message = 'CAPTCHA verification required', code = 'CAPTCHA_REQUIRED')
// HTTP 400, code: customizable (default CAPTCHA_REQUIRED)
```

**Use Cases:**
- Too many failed login attempts triggers CAPTCHA
- Bot detection
- Expected response: `{ error: "CAPTCHA verification required", code: "CAPTCHA_REQUIRED", requiresCaptcha: true }`

---

### 11. `SessionError`
```typescript
constructor(message = 'Session expired')
// HTTP 401, code: SESSION_EXPIRED
```

**Use Cases:**
- Session timeout
- Session revoked
- Expected response: `{ error: "Session expired", code: "SESSION_EXPIRED" }`

---

## ERROR CODES QUICK REFERENCE

| Code | HTTP Status | When to Expect |
|------|-------------|----------------|
| `INTERNAL_ERROR` | 500 | Unexpected server error |
| `VALIDATION_ERROR` | 422 | Invalid input data |
| `NOT_FOUND` | 404 | Resource doesn't exist |
| `AUTHENTICATION_FAILED` | 401 | Bad credentials |
| `ACCESS_DENIED` | 403 | No permission |
| `CONFLICT` | 409 | Duplicate resource |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `TOKEN_INVALID` | 401 | Bad/expired token |
| `TENANT_INVALID` | 400 | Bad tenant context |
| `MFA_REQUIRED` | 401 | Need MFA token |
| `CAPTCHA_REQUIRED` | 400 | Need CAPTCHA |
| `SESSION_EXPIRED` | 401 | Session timeout |

---

## INTEGRATION TEST ASSERTIONS

For integration tests, assert error responses like:

```typescript
// Example: Login with wrong password
expect(response.status).toBe(401);
expect(response.body.code).toBe('AUTHENTICATION_FAILED');
expect(response.body.error).toContain('Invalid');

// Example: Duplicate email registration
expect(response.status).toBe(409);
expect(response.body.code).toBe('CONFLICT');

// Example: Validation error
expect(response.status).toBe(422);
expect(response.body.code).toBe('VALIDATION_ERROR');
expect(response.body.errors).toBeArray();

// Example: Rate limited
expect(response.status).toBe(429);
expect(response.body.code).toBe('RATE_LIMIT_EXCEEDED');
```

---

## NOTES

1. **isOperational Flag**: All custom errors have `isOperational = true`, distinguishing them from programming errors that shouldn't be exposed to users.

2. **Customizable Codes**: `AuthenticationError` and `CaptchaError` allow custom error codes for more specific error identification.

3. **Extra Metadata**: 
   - `ValidationError` carries `errors[]` array
   - `RateLimitError` carries `ttl` for retry timing

4. **No Enum**: Error codes are inline strings, not a centralized enum. This means error codes must be matched as strings in tests.
