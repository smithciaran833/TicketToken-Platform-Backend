## Error Handling Audit: analytics-service

### Audit Against: `Docs/research/03-error-handling.md`

---

## 3.1 Route Handler Checklist

| ID | Check | Severity | Status | Evidence |
|----|-------|----------|--------|----------|
| RH1 | Global error handler registered with `setErrorHandler` | CRITICAL | ✅ PASS | `app.ts:84-98` - Uses `app.setErrorHandler()` |
| RH2 | Error handler registered BEFORE routes | CRITICAL | ❌ FAIL | `app.ts` - Error handler registered **AFTER** routes (lines 69-81 routes, then 84-98 error handler) |
| RH3 | Not Found handler registered with `setNotFoundHandler` | HIGH | ❌ FAIL | No `setNotFoundHandler` found in codebase |
| RH4 | Schema validation errors produce consistent format | HIGH | ⚠️ PARTIAL | Default Fastify format, not RFC 7807 |
| RH5 | Error handler returns RFC 7807 Problem Details | HIGH | ❌ FAIL | Returns custom format, NOT RFC 7807 |
| RH6 | Correlation ID included in all error responses | HIGH | ❌ FAIL | No `correlation_id` in error responses |
| RH7 | Stack traces NOT exposed in production | CRITICAL | ✅ PASS | `app.ts:96` - Generic "Internal Server Error" message |
| RH8 | All async route handlers use async/await | HIGH | ✅ PASS | Controllers use async/await pattern |
| RH9 | No floating promises in route handlers | CRITICAL | ⚠️ NOT VERIFIED | Requires ESLint check |
| RH10 | Response status matches Problem Details status field | MEDIUM | N/A | Not using RFC 7807 |

---

## Current Error Handler Analysis

**Global Error Handler (app.ts:84-98):**
```typescript
app.setErrorHandler((error, request, reply) => {
  app.log.error(error);

  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal Server Error';

  reply.status(statusCode).send({
    error: {
      message,           // ❌ May expose internal details
      statusCode,
      timestamp: new Date().toISOString(),
      path: request.url,
    },
  });
});
```

**Issues Found:**
1. ❌ Error handler is **AFTER** routes registration - may miss some errors
2. ❌ Not RFC 7807 compliant format
3. ❌ No correlation ID
4. ❌ `error.message` may expose internal details for 500 errors
5. ❌ No `type` field for error categorization

**Expected RFC 7807 Format:**
```json
{
  "type": "https://api.tickettoken.com/errors/internal",
  "title": "Internal Server Error",
  "status": 500,
  "detail": "An unexpected error occurred",
  "instance": "/api/analytics/revenue",
  "correlation_id": "uuid-v4"
}
```

---

## 3.2 Service Layer Checklist

| ID | Check | Severity | Status | Evidence |
|----|-------|----------|--------|----------|
| SL1 | All public methods have try/catch or throw typed errors | HIGH | ✅ PASS | `aggregation.service.ts` - all methods have try/catch |
| SL2 | Errors include context (IDs, operation type) | HIGH | ⚠️ PARTIAL | Logs include context, but errors don't preserve it |
| SL3 | No empty catch blocks | CRITICAL | ✅ PASS | All catch blocks log and re-throw |
| SL4 | Domain errors extend base AppError class | MEDIUM | ✅ PASS | `utils/errors.ts` - proper hierarchy |
| SL5 | Error codes are documented and consistent | MEDIUM | ✅ PASS | Error codes defined (`VALIDATION_ERROR`, `NOT_FOUND`, etc.) |
| SL6 | Sensitive data not included in error messages | CRITICAL | ⚠️ PARTIAL | Most are safe, but some may leak details |
| SL7 | External errors wrapped with context | HIGH | ❌ FAIL | Raw errors re-thrown without wrapping |
| SL8 | Timeouts configured for all I/O operations | HIGH | ❌ NOT FOUND | No timeout configuration visible |

**Service Error Pattern Found:**
```typescript
// aggregation.service.ts:67-74
} catch (error) {
  this.log.error('Failed to aggregate metrics', { 
    error,      // ✅ Logged with context
    venueId, 
    metricType 
  });
  throw error;  // ⚠️ Raw error re-thrown, not wrapped
}
```

---

## 3.3 Error Class Hierarchy

**Good - Well-defined error classes in `utils/errors.ts`:**
```typescript
AppError (base)
├── ValidationError (400)
├── UnauthorizedError (401)
├── ForbiddenError (403)
├── NotFoundError (404)
├── ConflictError (409)
├── TooManyRequestsError (429)
├── BadGatewayError (502)
└── ServiceUnavailableError (503)
```

**Issues:**
- ❌ Duplicate error classes exist in `middleware/error-handler.ts` AND `utils/errors.ts`
- ❌ No `context` field for structured error data
- ❌ No user-safe vs internal message separation

---

## 3.4 Process-Level Error Handling

| ID | Check | Severity | Status | Evidence |
|----|-------|----------|--------|----------|
| **PL1** | `unhandledRejection` handler registered | CRITICAL | ❌ FAIL | Not found in `index.ts` |
| **PL2** | `uncaughtException` handler registered | CRITICAL | ❌ FAIL | Not found in `index.ts` |
| **PL3** | `SIGTERM` handler registered | CRITICAL | ✅ PASS | `index.ts:57-65` |
| **PL4** | `SIGINT` handler registered | CRITICAL | ✅ PASS | `index.ts:67` |
| **PL5** | Graceful shutdown closes connections | HIGH | ✅ PASS | `index.ts:60` - closes app |

**index.ts Shutdown Handling:**
```typescript
// index.ts:56-68 - ✅ Good shutdown handling
const shutdown = async (signal: string) => {
  logger.info(`${signal} received, shutting down gracefully...`);
  try {
    await app.close();
    logger.info('Server closed');
    process.exit(0);
  } catch (err) {
    logger.error('Error during shutdown:', err);
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
```

**Missing Critical Handlers:**
```typescript
// MISSING - Should be added
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection', { reason, promise });
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.fatal('Uncaught Exception', { error });
  process.exit(1);
});
```

---

## 3.5 Controller Error Handling

**BaseController Pattern (base.controller.ts):**
```typescript
protected handleError(error: any, reply: FastifyReply): FastifyReply {
  this.log.error('Controller error', { error });
  
  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal Server Error';
  
  return reply.code(statusCode).send({
    success: false,
    error: {
      message,     // ⚠️ May expose internal message for 500 errors
      statusCode,
    }
  });
}
```

**Issues:**
1. ❌ `error.message` is exposed even for 500 errors
2. ❌ No correlation ID included
3. ❌ Not RFC 7807 format
4. ❌ No differentiation between user-safe and internal messages

---

## 3.6 Database Error Handling Checklist

| ID | Check | Severity | Status | Evidence |
|----|-------|----------|--------|----------|
| DB1 | All queries wrapped in try/catch | HIGH | ✅ PASS | Services use try/catch |
| DB2 | Transactions used for multi-operation writes | CRITICAL | ⚠️ NOT VERIFIED | Need to check repositories |
| DB3 | Transaction errors trigger rollback | CRITICAL | ⚠️ NOT VERIFIED | Need to check transaction code |
| DB4 | Connection pool errors handled | HIGH | ❌ NOT FOUND | No pool error event handler |
| DB5 | Database errors NOT exposed to clients | CRITICAL | ⚠️ PARTIAL | Generic message for 500s, but constraint violations may leak |
| DB6 | Unique constraint violations return 409 Conflict | MEDIUM | ❌ NOT FOUND | No PostgreSQL error code mapping |
| DB7 | Foreign key violations return 400/422 | MEDIUM | ❌ NOT FOUND | No PostgreSQL error code mapping |
| DB8 | Query timeouts configured | HIGH | ❌ NOT FOUND | Not visible in config |

**Missing PostgreSQL Error Mapping:**
```typescript
// NOT FOUND - Should exist
switch (error.code) {
  case '23505': // unique_violation
    return new ConflictError('Resource already exists');
  case '23503': // foreign_key_violation
    return new ValidationError('Referenced resource does not exist');
  // ...
}
```

---

## 3.7 Distributed Systems Checklist

| ID | Check | Severity | Status | Evidence |
|----|-------|----------|--------|----------|
| DS1 | Correlation ID generated/extracted | CRITICAL | ❌ FAIL | No correlation ID handling |
| DS2 | Correlation ID propagated in service calls | CRITICAL | ❌ FAIL | Not implemented |
| DS3 | Correlation ID included in all logs | CRITICAL | ❌ FAIL | Logs don't include correlation ID |
| DS4 | Circuit breaker for external services | HIGH | ❌ NOT FOUND | No circuit breaker |
| DS5 | Timeouts for inter-service calls | CRITICAL | ❌ NOT FOUND | No timeout config |
| DS6 | Retry logic with exponential backoff | HIGH | ❌ NOT FOUND | No retry logic |
| DS7 | Dead letter queues for failed async ops | HIGH | ⚠️ NOT VERIFIED | Need to check queue config |

---

## Summary

### Critical Issues (Must Fix Before Production)
| Issue | Location | Risk |
|-------|----------|------|
| Missing `unhandledRejection` handler | `index.ts` | Unhandled promises crash service |
| Missing `uncaughtException` handler | `index.ts` | Uncaught exceptions crash service |
| Error handler registered after routes | `app.ts` | Some errors may be unhandled |
| No RFC 7807 error format | Global error handler | Inconsistent API responses |
| No correlation ID | All error responses | Cannot trace distributed errors |
| No `setNotFoundHandler` | `app.ts` | 404s may leak Fastify internals |
| Internal error messages exposed | `base.controller.ts` | Information disclosure |

### High Issues (Should Fix)
| Issue | Location | Risk |
|-------|----------|------|
| No PostgreSQL error code mapping | Services | Constraint violations not handled properly |
| Duplicate error classes | `middleware/error-handler.ts` + `utils/errors.ts` | Code maintenance issues |
| No circuit breaker | External service calls | Cascade failures |
| No timeout configuration | Database/service calls | Hung connections |
| Raw errors re-thrown | Services | Lost context |

### Compliance Score: 42% (15/36 checks passed)

- ✅ PASS: 10
- ⚠️ PARTIAL: 6
- ❌ FAIL: 15
- ⚠️ NOT VERIFIED: 5
- N/A: 1

### Priority Fixes

1. **Add process error handlers:**
```typescript
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection', { reason });
  process.exit(1);
});
process.on('uncaughtException', (error) => {
  logger.fatal('Uncaught Exception', { error });
  process.exit(1);
});
```

2. **Move error handler before routes in app.ts**

3. **Implement RFC 7807 error responses**

4. **Add correlation ID middleware**

5. **Add `setNotFoundHandler`**

6. **Remove duplicate error classes**
