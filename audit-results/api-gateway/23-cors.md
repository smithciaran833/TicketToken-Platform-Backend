# API Gateway - 23 CORS Configuration Audit

**Service:** api-gateway
**Document:** 23-cors.md
**Date:** 2025-12-26
**Auditor:** Cline
**Pass Rate:** 92% (23/25 applicable checks)

## Summary

Excellent CORS implementation with dynamic origin validation, proper headers, and security logging.

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 0 | - |
| HIGH | 0 | - |
| MEDIUM | 1 | No-origin requests allowed (review needed) |
| LOW | 1 | maxAge not configured for preflight caching |

## Plugin Registration (5/5)

- @fastify/cors used - PASS
- Plugin registered - PASS
- Before routes - PASS
- Logger confirms config - PASS
- Centralized config - PASS

## Origin Validation (5/6)

- Dynamic validation function - PASS
- Origins from config - PASS
- Development localhost exception - PASS
- Blocked origins logged - PASS
- No-origin requests - PARTIAL (allows all)
- Origin checked against allowlist - PASS

## Credentials Handling (3/3)

- Credentials configured - PASS
- Default true - PASS
- No wildcard with credentials - PASS

## HTTP Methods (3/3)

- Methods explicitly listed - PASS
- OPTIONS included - PASS
- Only necessary methods - PASS

## Allowed Headers (4/4)

- allowedHeaders configured - PASS
- Content-Type - PASS
- Authorization - PASS
- Custom headers (X-API-Key, X-Venue-ID, etc.) - PASS

## Exposed Headers (3/3)

- exposedHeaders configured - PASS
- Rate limit headers - PASS
- X-Request-ID - PASS

## Preflight Caching (0/1)

- maxAge configured - FAIL

## Configuration Summary

| Setting | Value |
|---------|-------|
| Origin | Dynamic function |
| Credentials | true |
| Methods | GET, POST, PUT, PATCH, DELETE, OPTIONS |
| Allowed Headers | 9 custom |
| Exposed Headers | 6 response |
| maxAge | Not set |

## Evidence

### Dynamic Origin Validation
```typescript
origin: (origin, callback) => {
  if (!origin) return callback(null, true);
  if (process.env.NODE_ENV === 'development' && origin.includes('localhost')) {
    return callback(null, true);
  }
  if (allowedOrigins.includes(origin)) {
    return callback(null, true);
  }
  logger.warn({ origin }, 'Blocked by CORS policy');
  callback(new Error('Not allowed by CORS'), false);
}
```

### Exposed Headers
```typescript
exposedHeaders: [
  'X-Request-ID',
  'X-RateLimit-Limit',
  'X-RateLimit-Remaining',
  'X-RateLimit-Reset',
  'Retry-After',
  'Location',
]
```

## Remediations

### MEDIUM
Review no-origin request handling (consider path-based exceptions)

### LOW
Add preflight caching:
```typescript
maxAge: 86400 // 24 hours
```

## Strengths

- Dynamic origin validation
- Development localhost exception
- Blocked origins logged
- Credentials enabled
- Comprehensive allowed headers
- Rate limit headers exposed
- No wildcard with credentials

CORS Score: 92/100
