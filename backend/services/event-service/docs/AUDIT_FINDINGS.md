# Event-Service Audit Findings

**Generated:** 2025-12-28
**Audit Files Reviewed:** 18
**Total Findings:** 350 (239 FAIL, 111 PARTIAL)

---

## Summary by Severity

| Severity | FAIL | PARTIAL | Total |
|----------|------|---------|-------|
| CRITICAL | 22 | 3 | 25 |
| HIGH | 68 | 28 | 96 |
| MEDIUM | 112 | 58 | 170 |
| LOW | 37 | 22 | 59 |

---

## Summary by Audit File

| File | FAIL | PARTIAL | Total |
|------|------|---------|-------|
| 01-security.md | 1 | 8 | 9 |
| 02-input-validation.md | 13 | 9 | 22 |
| 03-error-handling.md | 18 | 10 | 28 |
| 04-logging-observability.md | 5 | 12 | 17 |
| 05-s2s-auth.md | 23 | 5 | 28 |
| 06-database-integrity.md | 2 | 9 | 11 |
| 07-idempotency.md | 16 | 9 | 25 |
| 08-rate-limiting.md | 12 | 5 | 17 |
| 09-multi-tenancy.md | 13 | 3 | 16 |
| 10-testing.md | 14 | 8 | 22 |
| 11-documentation.md | 25 | 6 | 31 |
| 12-health-checks.md | 11 | 2 | 13 |
| 13-graceful-degradation.md | 18 | 6 | 24 |
| 19-configuration-management.md | 1 | 4 | 5 |
| 20-deployment-cicd.md | 2 | 3 | 5 |
| 21-database-migrations.md | 3 | 2 | 5 |
| 28-event-state-management.md | 38 | 8 | 46 |
| 38-time-sensitive-operations.md | 24 | 2 | 26 |

---

## CRITICAL Findings (25)

### From 02-input-validation.md

#### RD1: All routes have schema
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1 Route Definition Checklist
- **Evidence:** pricing.routes.ts, capacity.routes.ts have no schemas

#### RD6: additionalProperties: false
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1 Route Definition Checklist
- **Evidence:** No schemas include this

#### SEC1: Prototype pollution blocked
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.5 Security Checklist
- **Evidence:** No additionalProperties: false

### From 03-error-handling.md

#### RH5: Consistent error format
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1 Route Handler Checklist
- **Evidence:** {error,code,details} vs {error,message}

#### RH10: No internal state exposed
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1 Route Handler Checklist
- **Evidence:** pricing.controller.ts returns error.message

### From 05-s2s-auth.md

#### SI2: Identity from env/secrets
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1 Service Identity
- **Evidence:** No service identity config

#### SI3: Service certificate/token
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1 Service Identity
- **Evidence:** No mechanism

#### OR1: S2S calls authenticated
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.2 Outbound Requests
- **Evidence:** Uses user token, no service token

#### OR2: Dedicated service credentials
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.2 Outbound Requests
- **Evidence:** Uses user's authToken

#### IA2: Service token validation
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.3 Inbound Authentication
- **Evidence:** No service token middleware

#### IA3: API key middleware
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.3 Inbound Authentication
- **Evidence:** api-key.middleware.ts doesn't exist

### From 07-idempotency.md

#### RL1: Idempotency-Key on POST
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1 Route Layer
- **Evidence:** No idempotency middleware

### From 09-multi-tenancy.md

#### RLS enabled on tenant tables
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** PostgreSQL RLS Configuration
- **Evidence:** No ENABLE ROW LEVEL SECURITY in migration

#### FORCE ROW LEVEL SECURITY
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** PostgreSQL RLS Configuration
- **Evidence:** Not implemented

#### RLS policies use current_setting
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** PostgreSQL RLS Configuration
- **Evidence:** No RLS policies exist

#### Queries in tenant context transaction
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Knex Query Patterns
- **Evidence:** No SET LOCAL calls

#### SET LOCAL app.current_tenant_id
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Knex Query Patterns
- **Evidence:** Not implemented

### From 11-documentation.md

#### README.md exists
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Project-Level Documentation
- **Evidence:** Not present

### From 12-health-checks.md

#### venue-service NOT in readiness
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** External Services
- **Evidence:** Checked in /health
- **Issue:** healthCheck.service.ts lines 88-125 - checkVenueService() and checkAuthService() cause cascading failure risk

#### auth-service NOT in readiness
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** External Services
- **Evidence:** Checked in /health

### From 28-event-state-management.md

#### Sales status separate
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Event States
- **Evidence:** Single status field

#### Valid transitions defined
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** State Transitions
- **Evidence:** No state machine

#### Invalid transitions rejected
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** State Transitions
- **Evidence:** Any status can be set

#### DRAFT → PUBLISHED only
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** State Transitions
- **Evidence:** No enforcement

#### COMPLETED cannot transition
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** State Transitions
- **Evidence:** No terminal enforcement

#### CANCELLED cannot transition
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** State Transitions
- **Evidence:** No terminal enforcement

#### Sales blocked in DRAFT
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Operations per State
- **Evidence:** No state check

#### Sales blocked in CANCELLED
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Operations per State
- **Evidence:** No state check

#### Sales blocked in COMPLETED
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Operations per State
- **Evidence:** No state check

#### Sales require ON_SALE
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Operations per State
- **Evidence:** No validation

### From 38-time-sensitive-operations.md

#### Distributed lock
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Scheduled State Transitions
- **Evidence:** No jobs directory

#### Jobs idempotent
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Scheduled State Transitions
- **Evidence:** No jobs exist

#### Execution persisted
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Scheduled State Transitions
- **Evidence:** No tracking

---

## HIGH Findings (96)

### From 01-security.md

#### SEC-R16: TLS 1.2+
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.1 Route Layer
- **Issue:** rejectUnauthorized: false

#### SEC-S3: Admin role check
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.2 Service Layer
- **Issue:** Only ownership check on delete

#### SEC-DB1: DB uses TLS
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.3 Database Layer
- **Issue:** rejectUnauthorized: false

### From 02-input-validation.md

#### RD3: Params schema with format
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.1 Route Definition Checklist
- **Evidence:** events.routes.ts has UUID pattern, others missing

#### RD8: Strings have maxLength
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.1 Route Definition Checklist
- **Evidence:** No maxLength on name, description

#### RD9: Integers have min/max
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.1 Route Definition Checklist
- **Evidence:** Defaults set but no bounds

#### SEC9: Integer bounds
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.5 Security Checklist
- **Evidence:** No min/max in schemas

### From 03-error-handling.md

#### RH4: Status codes match error types
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.1 Route Handler Checklist
- **Evidence:** events.controller.ts maps types, pricing.controller.ts doesn't

#### SL1: Error classes have statusCode
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.2 Service Layer Checklist
- **Evidence:** ValidationError, NotFoundError lack statusCode

#### SL2: Errors have machine-readable codes
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.2 Service Layer Checklist
- **Evidence:** No error codes defined

#### DB3: Connection errors → 503
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.3 Database Error Handling
- **Evidence:** No ECONNREFUSED handling

#### DB4: Query timeout → 504
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.3 Database Error Handling
- **Evidence:** No timeout handling

#### EI2: Timeout errors handled
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.4 External Integration Errors
- **Evidence:** No timeout handling

#### EI3: Circuit breaker
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.4 External Integration Errors
- **Evidence:** None implemented

### From 04-logging-observability.md

#### MT13: Distributed tracing
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.5 Metrics & Tracing
- **Evidence:** No OpenTelemetry

#### MT14: Trace context propagation
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.5 Metrics & Tracing
- **Evidence:** No W3C Trace Context

#### MT15: Span creation
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.5 Metrics & Tracing
- **Evidence:** No span instrumentation

### From 05-s2s-auth.md

#### SI1: Unique identifier
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.1 Service Identity
- **Evidence:** Service name only, no cryptographic identity

#### SI4: Identity validated at startup
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.1 Service Identity
- **Evidence:** No validation

#### SI5: Identity rotation supported
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.1 Service Identity
- **Evidence:** No mechanism

#### OR7: TLS enforced
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.2 Outbound Requests
- **Evidence:** Relies on URL protocol

#### IA4: User vs service differentiated
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.3 Inbound Authentication
- **Evidence:** Only user JWT implemented

#### TM1: Service tokens have expiration
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.4 Token Management
- **Evidence:** No service tokens

#### TM2: Token refresh mechanism
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.4 Token Management
- **Evidence:** No refresh for S2S

#### TM3: Short-lived tokens
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.4 Token Management
- **Evidence:** N/A

#### NS1: mTLS for S2S
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.6 Network Security
- **Evidence:** No mTLS config

#### NS5: HTTPS for all calls
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.6 Network Security
- **Evidence:** Not enforced

### From 06-database-integrity.md

#### CP8: SSL/TLS
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.4 Connection Pool
- **Evidence:** rejectUnauthorized: false

### From 07-idempotency.md

#### RL3: Key validated
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.1 Route Layer
- **Evidence:** N/A

#### RL4: Key storage
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.1 Route Layer
- **Evidence:** No storage

#### RL6: Concurrent same-key
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.1 Route Layer
- **Evidence:** No locking

#### SL6: Version conflict detection
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.2 Service Layer
- **Evidence:** No optimistic locking

#### DB7: Idempotency key table
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.3 Database Layer
- **Evidence:** No table exists

#### EC6: Compensating transactions
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.5 External Calls
- **Evidence:** No saga pattern

### From 08-rate-limiting.md

#### ES2: Stricter on writes
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Endpoint-Specific Limits
- **Evidence:** POST uses same 100/min as GET

#### ES3: Stricter on intensive
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Endpoint-Specific Limits
- **Evidence:** No special limits for search

### From 09-multi-tenancy.md

#### Search filters by tenant
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** API Endpoints
- **Evidence:** searchEvents has NO tenant filter

### From 10-testing.md

#### Coverage thresholds (80%)
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.1 Jest Configuration
- **Evidence:** No coverageThreshold configured

#### RLS policies verified
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.3 Knex Database Testing
- **Evidence:** No tests (RLS not implemented)

#### Lines Coverage Target
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.6 Coverage Requirements
- **Evidence:** Not set

#### E2E Tests
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Test Type Distribution
- **Evidence:** 0%

### From 11-documentation.md

#### OpenAPI specification
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** API Documentation
- **Evidence:** No openapi.yaml

#### API docs accessible
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** API Documentation
- **Evidence:** SERVICE_OVERVIEW.md has route tables

#### Runbooks
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Operational Documentation
- **Evidence:** No runbooks directory

#### Incident response playbooks
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Operational Documentation
- **Evidence:** Not present

#### Local dev setup
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Onboarding Documentation
- **Evidence:** Not present

### From 12-health-checks.md

#### GET /health/live
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Required Endpoints
- **Evidence:** Not implemented

#### GET /health/ready
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Required Endpoints
- **Evidence:** Not implemented

#### GET /health/startup
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Required Endpoints
- **Evidence:** Not implemented

#### Event loop monitoring
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Fastify Health Check
- **Evidence:** No @fastify/under-pressure

#### Liveness < 100ms
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** Fastify Health Check
- **Evidence:** /health exists but checks deps

### From 13-graceful-degradation.md

#### Fallback defined
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Circuit Breaker
- **Evidence:** No fallback - throws error

#### Retries implemented
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** HTTP Timeout/Retry
- **Evidence:** No retry logic

#### Exponential backoff
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** HTTP Timeout/Retry
- **Evidence:** Not implemented

#### Cache fallback
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Fallback Strategies
- **Evidence:** No cache fallback on venue-service failure

#### Default response fallback
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Fallback Strategies
- **Evidence:** Throws errors

#### Degraded service mode
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Fallback Strategies
- **Evidence:** Not implemented

### From 28-event-state-management.md

#### Automatic transitions
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** State Transitions
- **Evidence:** No scheduled jobs

#### Editing restricted after sales
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** Operations per State
- **Evidence:** validateEventModification()

#### Protected fields
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Operations per State
- **Evidence:** No confirmation flow

#### Deletion blocked after sales
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** Operations per State
- **Evidence:** validateEventDeletion()

#### Refund window on major mods
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Modification Controls
- **Evidence:** No logic

#### Stops sales immediately
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** Cancellation Workflow
- **Evidence:** Status set to CANCELLED

#### Triggers refunds
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Cancellation Workflow
- **Evidence:** No refund trigger

#### Notifies ticket holders
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Cancellation Workflow
- **Evidence:** No notification

#### Tickets invalidated
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Cancellation Workflow
- **Evidence:** No invalidation

#### Resale cancelled
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Cancellation Workflow
- **Evidence:** No integration

#### Sales start enforced
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Timing Enforcement
- **Evidence:** No automatic

#### Sales end enforced
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Timing Enforcement
- **Evidence:** No automatic

#### Event start triggers change
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Timing Enforcement
- **Evidence:** No scheduler

#### Event end triggers change
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Timing Enforcement
- **Evidence:** No scheduler

#### Scheduled jobs reliable
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Timing Enforcement
- **Evidence:** No jobs exist

### From 38-time-sensitive-operations.md

#### Cutoffs server-side
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Cutoff Enforcement
- **Evidence:** No enforcement

#### Deadline check
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Cutoff Enforcement
- **Evidence:** No check before ops

#### Failed job retry
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Scheduled State Transitions
- **Evidence:** No jobs

#### Time-checks in transactions
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** Race Condition Prevention
- **Evidence:** Transactions exist, no time checks

#### State validated during op
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Race Condition Prevention
- **Evidence:** No validation

---

## MEDIUM Findings (170)

*[Truncated for length - full list includes all 170 MEDIUM findings from:]*
- Input validation gaps (URLs, dates, arrays)
- Error handling inconsistencies
- Missing logging/metrics
- Rate limiting gaps
- Multi-tenancy issues (Redis keys, cache)
- Testing gaps
- Documentation gaps
- Graceful degradation gaps
- State management gaps
- Time-sensitive operation gaps

---

## LOW Findings (59)

*[Truncated for length - full list includes all 59 LOW findings]*

---

## Architecture Issues Summary

### 1. No State Machine (CRITICAL)
The event-service has no state machine implementation. Any status can be set to any other status. This means:
- DRAFT events can have tickets sold
- CANCELLED events can be reactivated
- COMPLETED events can be modified
- No automatic state transitions

**Required:** Implement XState or similar state machine library.

### 2. No Multi-Tenancy Protection (CRITICAL)
- No RLS policies on event tables
- No SET LOCAL for tenant context
- searchEvents has NO tenant filter
- Redis cache keys have no tenant prefix

**Required:** Implement RLS policies and tenant context middleware.

### 3. No S2S Authentication (CRITICAL)
- Uses user tokens for service-to-service calls
- No service identity
- No API key middleware
- No mTLS

**Required:** Implement proper S2S auth with dedicated service tokens.

### 4. No Scheduled Jobs (CRITICAL)
- No jobs directory exists
- Events don't automatically transition states
- No sales start/end enforcement
- No event start/end handling

**Required:** Implement job scheduler (Bull, Agenda, or similar).

### 5. No Idempotency (CRITICAL)
- No idempotency key support
- Retried POSTs create duplicates
- No response caching
- No optimistic locking

**Required:** Implement idempotency middleware with Redis storage.

### 6. Health Check Cascading Failure (CRITICAL)
- /health endpoint calls venue-service and auth-service
- If those services are down, this service reports unhealthy
- Causes cascading failures during partial outages

**Required:** Remove external service checks from health endpoint.

---

## Quick Fix Code Snippets

### State Machine (CRITICAL)
```typescript
// event-state-machine.ts
import { createMachine } from 'xstate';

export const eventStateMachine = createMachine({
  id: 'event',
  initial: 'draft',
  states: {
    draft: {
      on: { PUBLISH: 'published' }
    },
    published: {
      on: { 
        START_SALES: 'on_sale',
        CANCEL: 'cancelled'
      }
    },
    on_sale: {
      on: {
        PAUSE_SALES: 'sales_paused',
        SOLD_OUT: 'sold_out',
        START_EVENT: 'in_progress',
        CANCEL: 'cancelled'
      }
    },
    sales_paused: {
      on: {
        RESUME_SALES: 'on_sale',
        CANCEL: 'cancelled'
      }
    },
    sold_out: {
      on: {
        START_EVENT: 'in_progress',
        CANCEL: 'cancelled'
      }
    },
    in_progress: {
      on: { END_EVENT: 'completed' }
    },
    completed: { type: 'final' },
    cancelled: { type: 'final' }
  }
});
```

### RLS Policies (CRITICAL)
```sql
-- Add to migration
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE events FORCE ROW LEVEL SECURITY;

CREATE POLICY events_tenant_isolation ON events
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
```

### Tenant Context Middleware (CRITICAL)
```typescript
// tenant.middleware.ts
export async function setTenantContext(request: FastifyRequest) {
  const tenantId = request.user?.tenantId;
  if (!tenantId) {
    throw new UnauthorizedError('Missing tenant context');
  }
  
  await db.raw('SET LOCAL app.current_tenant_id = ?', [tenantId]);
}
```

### Fix Search Tenant Filter (CRITICAL)
```typescript
// event.service.ts - searchEvents
async searchEvents(params: SearchParams, tenantId: string) {
  return this.db('events')
    .where('tenant_id', tenantId)  // ADD THIS LINE
    .where('status', 'published')
    // ... rest of query
}
```

### Fix Health Check (CRITICAL)
```typescript
// health-check.service.ts
// REMOVE these methods from health check:
// - checkVenueService()
// - checkAuthService()

// Keep only:
// - checkDatabase()
// - checkRedis()
// - checkRabbitMQ() (if local)
```

### Idempotency Middleware (CRITICAL)
```typescript
// idempotency.middleware.ts
export async function idempotencyMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const key = request.headers['idempotency-key'];
  if (!key) return;
  
  const cached = await redis.get(`idempotency:${key}`);
  if (cached) {
    reply.header('Idempotency-Replayed', 'true');
    return reply.send(JSON.parse(cached));
  }
}
```

### Scheduled Jobs Setup (CRITICAL)
```typescript
// jobs/event-transitions.job.ts
import Bull from 'bull';

const eventTransitionQueue = new Bull('event-transitions', redisConfig);

eventTransitionQueue.process(async (job) => {
  const { eventId, transition } = job.data;
  // Process state transition with distributed lock
});

// Schedule: Check every minute for events needing transitions
eventTransitionQueue.add(
  { type: 'check-transitions' },
  { repeat: { cron: '* * * * *' } }
);
```
