# Event Service Utils Analysis
## Purpose: Integration Testing Documentation
## Source Files Analyzed:
- `src/utils/audit-logger.ts` (95 lines)
- `src/utils/error-response.ts` (55 lines)
- `src/utils/errors.ts` (230 lines)
- `src/utils/logger.ts` (230 lines)
- `src/utils/metrics.ts` (250 lines)
- `src/utils/retry.ts` (180 lines)
- `src/utils/saga.ts` (280 lines)
- `src/utils/time-sensitive.ts` (250 lines)
- `src/utils/timezone-validator.ts` (75 lines)
- `src/utils/tracing.ts` (260 lines)

## Generated: January 20, 2026

---

## FILE-BY-FILE ANALYSIS

### 1. audit-logger.ts (95 lines)

**Purpose:** Database-backed audit logging for event operations.

#### DATABASE OPERATIONS

**Table:** `audit_logs`

**Insert Schema:**
```typescript
{
  service: 'event-service',
  user_id: string,
  action: string,           // 'event_created', 'event_updated', etc.
  action_type: string,      // 'CREATE', 'UPDATE', 'DELETE', 'ACCESS'
  resource_type: 'event',
  resource_id: string,
  ip_address: string | null,
  user_agent: string | null,
  metadata: object,
  success: boolean
}
```

#### EXTERNAL SERVICE CALLS
N/A

#### CACHING
N/A

#### STATE MANAGEMENT
N/A

#### TENANT ISOLATION

**Status:** ❌ NOT ENFORCED
- No `tenant_id` in audit log entries
- Cannot filter audit logs by tenant

🔴 **CRITICAL:** Audit logs should include tenant_id

#### BUSINESS LOGIC

**Methods:**
| Method | Action Type | Purpose |
|--------|-------------|---------|
| `logEventCreation()` | CREATE | Log event creation |
| `logEventUpdate()` | UPDATE | Log event updates |
| `logEventDeletion()` | DELETE | Log event deletion |
| `logEventAccess()` | ACCESS | Log access attempts |

#### ERROR HANDLING

**Pattern:** Silent failure - doesn't throw
```typescript
catch (error) {
  logger.error({ error, userId, eventId, action }, 'Failed to write audit log to database');
  // Don't throw - audit logging failure shouldn't break the operation
}
```

✅ **GOOD:** Audit failures don't break business operations

#### CONCURRENCY
N/A

#### POTENTIAL ISSUES

🔴 **CRITICAL:**
1. **No tenant_id in audit logs** - Add to schema and methods

🟡 **MEDIUM:**
1. Silent failure means lost audit records
2. Debug logging includes full metadata (could be verbose)

---

### 2. error-response.ts (55 lines)

**Purpose:** Standardized error response builder for Fastify.

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

**Response Format:**
```typescript
interface ErrorResponse {
  success: false;
  error: string;
  code: string;
  details?: any;
  requestId?: string;
}
```

**Helper Methods:**
| Method | Status | Code |
|--------|--------|------|
| `validation()` | 422 | VALIDATION_ERROR |
| `unauthorized()` | 401 | UNAUTHORIZED |
| `forbidden()` | 403 | FORBIDDEN |
| `notFound()` | 404 | NOT_FOUND |
| `conflict()` | 409 | CONFLICT |
| `tooManyRequests()` | 429 | RATE_LIMIT_EXCEEDED |
| `internal()` | 500 | INTERNAL_ERROR |

**Error Codes Enum:**
```typescript
enum ErrorCodes {
  VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND,
  CONFLICT, RATE_LIMIT_EXCEEDED, INTERNAL_ERROR,
  BAD_REQUEST, SERVICE_UNAVAILABLE
}
```

#### ERROR HANDLING
N/A - This IS the error handling utility

#### CONCURRENCY
N/A

#### POTENTIAL ISSUES

🟢 **LOW:**
- Well-structured
- Includes requestId for tracing
- Consistent format

---

### 3. errors.ts (230 lines)

**Purpose:** Custom error classes with HTTP status codes and machine-readable codes.

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

**Error Class Hierarchy:**
```
AppError (abstract base)
├── ValidationError (422)
├── BadRequestError (400)
├── NotFoundError (404)
├── UnauthorizedError (401)
├── ForbiddenError (403)
├── ConflictError (409)
├── RateLimitError (429)
├── InternalError (500)
├── ServiceUnavailableError (503)
├── GatewayTimeoutError (504)
├── DatabaseConnectionError (503)
├── DatabaseTimeoutError (504)
├── TenantError (400)
├── EventStateError (409)
└── CapacityError (409)
```

**Domain-Specific Errors:**
| Error | Status | Use Case |
|-------|--------|----------|
| `TenantError` | 400 | Invalid/missing tenant |
| `EventStateError` | 409 | Invalid state transition |
| `CapacityError` | 409 | Insufficient capacity |

**Error Codes Object:**
- General: BAD_REQUEST, NOT_FOUND, UNAUTHORIZED, etc.
- Database: DATABASE_CONNECTION_ERROR, DATABASE_TIMEOUT, DUPLICATE_RESOURCE
- Tenant: TENANT_REQUIRED, TENANT_INVALID, TENANT_MISMATCH
- Event: EVENT_NOT_FOUND, INVALID_EVENT_STATE, EVENT_CANCELLED
- Capacity: INSUFFICIENT_CAPACITY, CAPACITY_NOT_FOUND
- Idempotency: INVALID_IDEMPOTENCY_KEY, IDEMPOTENCY_CONFLICT

**Helper Functions:**
```typescript
hasErrorCode(error): error is AppError
toAppError(error): AppError  // Converts unknown to AppError
```

#### ERROR HANDLING
N/A - This IS the error handling utility

#### CONCURRENCY
N/A

#### POTENTIAL ISSUES

✅ **GOOD:** Comprehensive, well-structured error hierarchy

---

### 4. logger.ts (230 lines)

**Purpose:** Pino-based logging with PII redaction, request hooks, and data sanitization.

#### DATABASE OPERATIONS
N/A

#### EXTERNAL SERVICE CALLS
N/A

#### CACHING
N/A

#### STATE MANAGEMENT
N/A

#### TENANT ISOLATION

**Status:** ✅ Included in request logging
```typescript
tenantId: (request as any).user?.tenant_id,
userId: (request as any).user?.id,
```

#### BUSINESS LOGIC

**PII Redaction (30+ fields):**
```typescript
const REDACT_FIELDS = [
  'email', 'password', 'token', 'authorization',
  'creditCard', 'ssn', 'phone', 'address',
  'apiKey', 'secret', 'refreshToken', 'accessToken',
  '*.email', '*.password', // Nested fields
  'req.headers.authorization', 'req.headers.cookie',
  'req.body.password', 'req.body.email',
  // etc.
];
```

**Log Sampling:**
```typescript
const LOG_SAMPLING_RATE = parseFloat(process.env.LOG_SAMPLING_RATE || '1.0');
```

**Request Logging Hooks:**
- `onRequestLoggingHook` - Starts timing, assigns request ID
- `onResponseLoggingHook` - Logs completion with duration

**Log Levels by Status:**
- 5xx → `error`
- 4xx → `warn`
- 2xx/3xx → `info`

**Data Sanitization Functions:**
| Function | Fields Allowed |
|----------|----------------|
| `sanitizeEventData()` | id, tenant_id, status, name, dates, counts |
| `sanitizePricingData()` | id, event_id, prices, is_active, dates |
| `sanitizeCapacityData()` | id, event_id, capacities, counts |

#### ERROR HANDLING
N/A

#### CONCURRENCY
N/A

#### POTENTIAL ISSUES

✅ **GOOD:**
- Comprehensive PII redaction
- Request timing and correlation
- Sampling for production
- Data sanitization helpers

---

### 5. metrics.ts (250 lines)

**Purpose:** Prometheus metrics for monitoring and alerting.

#### DATABASE OPERATIONS
N/A

#### EXTERNAL SERVICE CALLS
N/A

#### CACHING
N/A

#### STATE MANAGEMENT
N/A

#### TENANT ISOLATION

**Status:** ⚠️ PARTIAL
- Some metrics include labels that could include tenant
- No explicit `tenant_id` label on most metrics

🟡 **MEDIUM:** Consider adding tenant_id label for multi-tenant metrics

#### BUSINESS LOGIC

**Metric Types:**

**Counters:**
| Metric | Labels | Purpose |
|--------|--------|---------|
| `event_created_total` | status, event_type | Event creation |
| `event_updated_total` | status | Event updates |
| `event_published_total` | status | Event publishing |
| `event_deleted_total` | status | Event deletion |
| `capacity_reserved_total` | status | Reservations |
| `pricing_created_total` | status | Pricing creation |
| `http_requests_total` | method, route, status | HTTP requests |
| `errors_total` | error_type, status_code, endpoint | Errors |
| `cache_hits_total` | cache_key | Cache hits |
| `cache_misses_total` | cache_key | Cache misses |
| `rate_limit_hits_total` | endpoint | Rate limiting |
| `circuit_breaker_calls_total` | service, status | Circuit breaker |

**Histograms:**
| Metric | Buckets | Purpose |
|--------|---------|---------|
| `event_operation_duration_seconds` | 0.1-10s | Event op latency |
| `capacity_operation_duration_seconds` | 0.01-2s | Capacity op latency |
| `database_query_duration_seconds` | 0.001-1s | DB query latency |
| `http_request_duration_seconds` | 0.1-5s | HTTP latency |
| `external_service_duration_seconds` | 0.1-10s | External call latency |

**Gauges:**
| Metric | Labels | Purpose |
|--------|--------|---------|
| `capacity_available` | event_id, section_name | Available capacity |

**Helper Functions:**
```typescript
incrementErrorMetric(errorType, statusCode, endpoint)
normalizeEndpoint(path)  // Removes UUIDs for cardinality
```

#### ERROR HANDLING

**Safe Metric Recording:**
```typescript
try {
  errorsTotal.inc({ ... });
} catch (err) {
  console.error('Failed to increment error metric:', err);
}
```

#### CONCURRENCY
N/A

#### POTENTIAL ISSUES

✅ **GOOD:**
- Comprehensive metric coverage
- Endpoint normalization prevents cardinality explosion
- Safe metric recording

🟡 **MEDIUM:**
- No tenant_id label on metrics
- `capacity_available` gauge by event_id could be high cardinality

---

### 6. retry.ts (180 lines)

**Purpose:** Retry logic with exponential backoff and jitter.

#### DATABASE OPERATIONS
N/A

#### EXTERNAL SERVICE CALLS
N/A - But used FOR external calls

#### CACHING
N/A

#### STATE MANAGEMENT
N/A

#### TENANT ISOLATION
N/A

#### BUSINESS LOGIC

**Default Options:**
```typescript
{
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitter: true,
  jitterFactor: 0.3
}
```

**Retryable Errors (`isRetryableError`):**
- Network: ECONNREFUSED, ECONNRESET, ETIMEDOUT, ENOTFOUND
- HTTP: 5xx status codes
- HTTP: 429 Too Many Requests
- Circuit breaker open

**Functions:**
| Function | Purpose |
|----------|---------|
| `withRetry(fn, options)` | Execute with retry |
| `createRetryWrapper(fn, options)` | Create wrapped function |
| `Retry(options)` | Decorator for class methods |

**Abort Support:**
```typescript
signal?: AbortSignal  // For cancellation
```

#### ERROR HANDLING

- Logs retry attempts with context
- Re-throws last error after max retries
- Distinguishes retryable vs non-retryable errors

#### CONCURRENCY

**Jitter:**
```typescript
if (jitter) {
  const jitterRange = delay * jitterFactor;
  const jitterValue = Math.random() * jitterRange * 2 - jitterRange;
  delay = Math.max(0, delay + jitterValue);
}
```
- Prevents thundering herd on retry storms

#### POTENTIAL ISSUES

✅ **GOOD:**
- Exponential backoff with jitter
- Configurable retry conditions
- Abort signal support
- Method decorator available

---

### 7. saga.ts (280 lines)

**Purpose:** Saga pattern for distributed transactions with compensating actions.

#### DATABASE OPERATIONS

**Used in pre-built saga:**
```typescript
ctx.db('events').update(...)
ctx.db('event_capacity').update(...)
```

#### EXTERNAL SERVICE CALLS

**Optional in saga context:**
- `notificationService`
- `refundService`
- `resaleService`

#### CACHING
N/A

#### STATE MANAGEMENT

**Saga States:**
- Steps execute in order
- On failure, compensate in reverse order
- Track: completedSteps, failedStep, compensatedSteps

#### TENANT ISOLATION

**Status:** ✅ IN CONTEXT
```typescript
interface SagaContext {
  eventId: string;
  tenantId: string;  // ✅ Included
  userId: string;
  db: any;
}
```

#### BUSINESS LOGIC

**Saga Class:**
```typescript
new Saga('name', options)
  .addStep('step-name', executeFn, compensateFn)
  .execute(context)
```

**Options:**
```typescript
{
  timeout: 30000,          // 30s default
  maxRetries: 3,
  retryDelay: 1000,
  continueCompensationOnError: true
}
```

**Pre-built Saga (`createEventCancellationSaga`):**
1. `set-cancelling-status` - Update to CANCELLING
2. `stop-ticket-sales` - Deactivate capacity
3. `queue-notifications` - Queue async notifications
4. `finalize-cancellation` - Update to CANCELLED

Each step has compensating action.

**Saga Errors:**
- `SagaTimeoutError` - Saga exceeded timeout
- `SagaCompensationError` - Compensation failed

#### ERROR HANDLING

**Non-Retryable Errors:**
```typescript
const nonRetryablePatterns = [
  'validation', 'not found', 'forbidden', 'unauthorized', 'invalid'
];
```

**Compensation on Error:**
- By default, continues compensating even if one fails
- Configurable via `continueCompensationOnError`

#### CONCURRENCY

- Steps execute sequentially
- Compensation runs in reverse order
- No parallel execution

#### POTENTIAL ISSUES

✅ **GOOD:**
- Proper saga pattern implementation
- Tenant context included
- Pre-built cancellation saga
- Retry logic per step

🟡 **MEDIUM:**
1. Pre-built saga has direct DB access (should use models)
2. `notificationService` optional - notifications might not be queued

---

### 8. time-sensitive.ts (250 lines)

**Purpose:** Server-side timing validation and deadline enforcement.

#### DATABASE OPERATIONS

**SQL Helper:**
```typescript
getTimingCheckSQL(eventAlias, scheduleAlias): string
// Returns: (s.starts_at IS NULL OR s.starts_at > NOW() + INTERVAL 'X hours')
```

#### EXTERNAL SERVICE CALLS
N/A

#### CACHING
N/A

#### STATE MANAGEMENT

**Automatic State Transitions:**
```typescript
getRequiredStateTransition(currentStatus, eventStart, eventEnd, salesStart, salesEnd)
```
- ON_SALE → IN_PROGRESS (near event start)
- IN_PROGRESS → COMPLETED (after event end)
- PUBLISHED → ON_SALE (sales start time)
- ON_SALE → PUBLISHED (sales end time)

#### TENANT ISOLATION
N/A - Pure timing logic

#### BUSINESS LOGIC

**Default Config:**
```typescript
{
  minEventAdvanceHours: 2,        // Can't create event <2h away
  maxEventAdvanceDays: 365,       // Can't create event >1yr away
  modificationCutoffHours: 24,    // Can't modify within 24h of event
  salesEndCutoffMinutes: 30,      // Sales close 30min before event
  eventStartBufferMinutes: 15,    // IN_PROGRESS 15min before start
  eventEndBufferMinutes: 60       // COMPLETED 60min after end
}
```

**Validation Methods:**
| Method | Purpose |
|--------|---------|
| `validateEventTiming()` | Check event date is valid |
| `canModifyEvent()` | Check if modifications allowed |
| `canSellTickets()` | Check if sales allowed |
| `checkDeadline()` | Check operation deadline |

**Deadline Defaults:**
| Operation | Hours Before Event |
|-----------|-------------------|
| purchase | 0.5 (30 min) |
| cancel | 24 |
| transfer | 1 |
| refund | 48 |

#### ERROR HANDLING

Returns structured result:
```typescript
{
  valid/allowed: boolean;
  error/reason?: string;
  code?: string;
}
```

#### CONCURRENCY
N/A

#### POTENTIAL ISSUES

✅ **GOOD:**
- Comprehensive timing rules
- Server-side enforcement
- SQL helper for atomic checks
- Configurable defaults

🟡 **MEDIUM:**
1. Config not loaded from environment (hardcoded defaults)

---

### 9. timezone-validator.ts (75 lines)

**Purpose:** IANA timezone validation using Luxon.

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

**Functions:**
| Function | Purpose |
|----------|---------|
| `validateTimezone(tz)` | Returns boolean |
| `validateTimezoneOrThrow(tz)` | Throws on invalid |
| `getAllTimezones()` | Returns common timezone list |
| `getTimezoneInfo(tz)` | Returns name, offset, isValid |

**Validation:**
```typescript
IANAZone.isValidZone(timezone)
```

#### ERROR HANDLING

**Descriptive Error:**
```typescript
throw new Error(
  `Invalid timezone: "${timezone}". Must be a valid IANA timezone identifier...`
);
```

#### CONCURRENCY
N/A

#### POTENTIAL ISSUES

✅ **GOOD:**
- Uses Luxon for proper IANA validation
- Clear error messages
- Null/undefined handling

---

### 10. tracing.ts (260 lines)

**Purpose:** OpenTelemetry distributed tracing setup.

#### DATABASE OPERATIONS
N/A - But provides DB span helper

#### EXTERNAL SERVICE CALLS
N/A - But provides external call span helper

#### CACHING
N/A

#### STATE MANAGEMENT
N/A

#### TENANT ISOLATION

**Status:** ✅ IN SPAN ATTRIBUTES
```typescript
'tenant.id': (request as any).user?.tenant_id || 'unknown'
```

#### BUSINESS LOGIC

**Setup:**
```typescript
initTracing()  // Initialize provider
shutdownTracing()  // Graceful shutdown
```

**Span Creation:**
| Function | Purpose |
|----------|---------|
| `createSpan(name, kind, parentCtx)` | Create new span |
| `withSpan(name, fn, options)` | Wrap async function |
| `createDbSpan(operation, table)` | DB operation span |
| `createExternalCallSpan(service, op)` | External call span |

**Context Propagation (W3C Trace Context):**
```typescript
extractTraceContext(headers)  // Incoming request
injectTraceContext(headers)   // Outgoing request
getTraceIds()  // Get current trace/span IDs
```

**Fastify Hooks:**
```typescript
tracingHook(request, reply)  // Start span on request
tracingResponseHook(request, reply)  // End span on response
```

**Span Attributes:**
- http.method, http.url, http.route
- http.user_agent, http.status_code
- tenant.id

**Exporters:**
- Production: OTLP to collector (Jaeger, Zipkin)
- Development: Console (optional)

#### ERROR HANDLING

**Span Status:**
```typescript
if (reply.statusCode >= 400) {
  span.setStatus({ code: SpanStatusCode.ERROR, message: `HTTP ${reply.statusCode}` });
}
```

**Exception Recording:**
```typescript
span.recordException(error);
```

#### CONCURRENCY
N/A

#### POTENTIAL ISSUES

✅ **GOOD:**
- W3C Trace Context propagation
- Tenant ID in spans
- Graceful shutdown
- Conditional exporters

---

## CROSS-SERVICE DEPENDENCIES

### Utility Usage Map

```
┌─────────────────────────────────────────────────────────────┐
│                      Services/Controllers                    │
└─────────────────────────────────────────────────────────────┘
         │              │              │              │
         ▼              ▼              ▼              ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   logger    │  │   errors    │  │   metrics   │  │   tracing   │
│             │  │             │  │             │  │             │
│ - PII redact│  │ - AppError  │  │ - Counters  │  │ - Spans     │
│ - Sanitize  │  │ - Codes     │  │ - Histograms│  │ - Context   │
│ - Hooks     │  │ - Helpers   │  │ - Gauges    │  │ - Hooks     │
└─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘
         │              │              │
         ▼              ▼              ▼
┌─────────────────────────────────────────────────────────────┐
│                     error-response                           │
│                   (Fastify response builder)                 │
└─────────────────────────────────────────────────────────────┘

┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│    retry    │  │    saga     │  │time-sensitive│
│             │  │             │  │             │
│ - Backoff   │  │ - Steps     │  │ - Deadlines │
│ - Jitter    │  │ - Compensate│  │ - Cutoffs   │
│ - Decorator │  │ - Pre-built │  │ - Transitions│
└─────────────┘  └─────────────┘  └─────────────┘
         │              │
         ▼              ▼
┌─────────────────────────────────────────────────────────────┐
│                External Service Calls / DB Operations        │
└─────────────────────────────────────────────────────────────┘

┌─────────────┐  ┌─────────────┐
│audit-logger │  │tz-validator │
│             │  │             │
│ - DB writes │  │ - IANA check│
│ - Silent    │  │ - Luxon     │
└─────────────┘  └─────────────┘
```

---

## INTEGRATION TEST FILE MAPPING

### Test Coverage Recommendations

| Utility | Test File (Proposed) | Priority | Key Scenarios |
|---------|---------------------|----------|---------------|
| `audit-logger.ts` | `audit-logger-tenant.integration.test.ts` | 🔴 CRITICAL | Add tenant_id to logs |
| `saga.ts` | `saga-compensation.integration.test.ts` | ⚠️ HIGH | Compensation on failure |
| `time-sensitive.ts` | `timing-validation.unit.test.ts` | ⚠️ HIGH | Deadline enforcement |
| `retry.ts` | `retry-backoff.unit.test.ts` | 🟡 MEDIUM | Backoff, jitter, abort |
| `errors.ts` | `error-classes.unit.test.ts` | 🟡 MEDIUM | Status codes, conversion |
| `tracing.ts` | `tracing-propagation.integration.test.ts` | 🟡 MEDIUM | W3C context |
| `logger.ts` | `logger-redaction.unit.test.ts` | 🟡 MEDIUM | PII redaction |
| `timezone-validator.ts` | `timezone-validation.unit.test.ts` | 🟢 LOW | IANA validation |

---

## REMAINING CONCERNS

### 🔴 CRITICAL Priority

1. **Audit Logger Missing tenant_id:**
   ```typescript
   // Add to audit log entry
   {
     tenant_id: tenantId,  // ADD THIS
     service: 'event-service',
     user_id: userId,
     // ...
   }
   ```

### ⚠️ HIGH Priority

2. **Saga Pre-built Uses Direct DB Access:**
   - Should use models/services for consistency
   - Direct SQL could bypass tenant isolation

3. **Time-Sensitive Config Not From Environment:**
   ```typescript
   // Should be
   this.config = {
     minEventAdvanceHours: parseInt(process.env.MIN_EVENT_ADVANCE_HOURS || '2'),
     // etc.
   };
   ```

### 🟡 MEDIUM Priority

4. **Metrics Missing tenant_id Label:**
   - Consider adding for multi-tenant monitoring
   - Balance against cardinality concerns

5. **Audit Logger Silent Failures:**
   - Consider dead letter queue for failed audit writes
   - Or async retry mechanism

---

## TESTING CHECKLIST

### Must Test (P0)
- [ ] Audit logger includes tenant_id (after fix)
- [ ] Saga compensation runs on failure
- [ ] Saga compensation runs in reverse order
- [ ] Time-sensitive validation rejects invalid dates

### Should Test (P1)
- [ ] Retry with exponential backoff
- [ ] Retry jitter prevents thundering herd
- [ ] Error classes have correct status codes
- [ ] Logger redacts PII fields
- [ ] Tracing propagates W3C context

### Nice to Test (P2)
- [ ] Timezone validation for all common zones
- [ ] Metrics cardinality stays bounded
- [ ] Saga timeout triggers

---

**End of Analysis**