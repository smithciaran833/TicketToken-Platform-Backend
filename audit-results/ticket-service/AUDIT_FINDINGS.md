# Ticket-Service Audit Findings

**Generated:** 2025-12-28
**Audit Files Reviewed:** 18
**Total Findings:** 293 (164 FAIL, 129 PARTIAL)

---

## Summary by Severity

| Severity | FAIL | PARTIAL | Total |
|----------|------|---------|-------|
| CRITICAL | 14 | 4 | 18 |
| HIGH | 62 | 45 | 107 |
| MEDIUM | 58 | 55 | 113 |
| LOW | 30 | 25 | 55 |

---

## Summary by Audit File

| File | FAIL | PARTIAL | Total |
|------|------|---------|-------|
| 01-security.md | 4 | 5 | 9 |
| 02-input-validation.md | 7 | 10 | 17 |
| 03-error-handling.md | 6 | 14 | 20 |
| 04-logging-observability.md | 12 | 11 | 23 |
| 05-s2s-auth.md | 20 | 5 | 25 |
| 06-database-integrity.md | 3 | 7 | 10 |
| 07-idempotency.md | 9 | 4 | 13 |
| 08-rate-limiting.md | 6 | 8 | 14 |
| 09-multi-tenancy.md | 11 | 7 | 18 |
| 10-testing.md | 3 | 7 | 10 |
| 11-documentation.md | 12 | 6 | 18 |
| 12-health-checks.md | 2 | 3 | 5 |
| 13-graceful-degradation.md | 8 | 11 | 19 |
| 19-configuration-management.md | 0 | 3 | 3 |
| 20-deployment-cicd.md | 3 | 1 | 4 |
| 21-database-migrations.md | 3 | 2 | 5 |
| 30-ticket-lifecycle-management.md | 21 | 16 | 37 |
| 31-blockchain-database-consistency.md | 34 | 9 | 43 |

---

## CRITICAL Findings (18)

### From 01-security.md

#### SEC-EXT15: Secrets manager
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.4 External - Secrets
- **Evidence:** Env vars only

### From 02-input-validation.md

#### RD6: additionalProperties: false
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1 Route Definition
- **Evidence:** No .unknown(false) on schemas

#### SEC1: Prototype pollution blocked
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.5 Security
- **Evidence:** No .unknown(false)

#### SEC2: Mass assignment prevented
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.5 Security
- **Evidence:** Extra properties not rejected

### From 05-s2s-auth.md

#### mTLS or signed tokens
- **Status:** PARTIAL
- **Severity:** CRITICAL
- **Section:** Service Client - Authentication
- **Evidence:** Basic headers only

#### Credentials not hardcoded
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Service Client - Authentication
- **Evidence:** Default secret in source

#### HTTPS for internal calls
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Service Client - Request Security
- **Evidence:** Uses http://

#### Constant-time comparison
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** HMAC Signature Security
- **Evidence:** Uses !== (timing attack)

#### No secrets in source
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Secrets Management
- **Evidence:** Default secret in code

### From 08-rate-limiting.md

#### Redis storage
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Fastify Rate Limit
- **Evidence:** Uses in-memory

### From 09-multi-tenancy.md

#### Tenant from verified JWT only
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** JWT Claims & Middleware
- **Evidence:** Also accepts x-tenant-id header!

#### Body tenant ignored
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** JWT Claims & Middleware
- **Evidence:** Uses body tenantId

#### Header validated against JWT
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** JWT Claims & Middleware
- **Evidence:** Header accepted blindly

### From 30-ticket-lifecycle-management.md

#### States synced blockchain
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Ticket States
- **Evidence:** No blockchain sync visible

#### Terminal states protected
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Ticket States
- **Evidence:** No transition validation

#### Valid transitions defined
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** State Transitions
- **Evidence:** No VALID_TRANSITIONS map

#### Terminal no outgoing
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** State Transitions
- **Evidence:** No terminal checks

#### Blockchain authenticity
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Validation Rules
- **Evidence:** validateQR doesn't verify on-chain

#### Duplicate scan detection
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Validation Rules
- **Evidence:** No duplicate check

#### Updates DB & blockchain
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Revocation
- **Evidence:** DB only

#### DB waits for blockchain
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** State Consistency
- **Evidence:** Async queue, no wait

### From 31-blockchain-database-consistency.md

#### No DB as ownership source
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Source of Truth
- **Evidence:** DB IS only source

#### DB after blockchain confirmation
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Blockchain Transaction Handling
- **Evidence:** DB updated immediately

#### Ownership comparison
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Reconciliation Processes
- **Evidence:** No blockchain comparison

---

## HIGH Findings (107)

### From 01-security.md

#### SEC-R11: Account lockout
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.1 Route Layer
- **Evidence:** Not implemented

#### SEC-EXT11: Spending limits
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.4 External - Blockchain
- **Evidence:** Not implemented

#### SEC-EXT12: Multi-sig
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.4 External - Blockchain
- **Evidence:** Not implemented

### From 02-input-validation.md

#### RD1: All routes have schema
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.1 Route Definition
- **Evidence:** Most use validate(), some may lack

#### RD5: Response schema
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.1 Route Definition
- **Evidence:** No response schemas - data leakage risk

#### RD7: Arrays have maxItems
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.1 Route Definition
- **Evidence:** tickets has min(1), no max()

### From 03-error-handling.md

#### RH2: Error handler before routes
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.1 Route Handler
- **Evidence:** Registered AFTER routes

#### RH5: RFC 7807 Problem Details
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.1 Route Handler
- **Evidence:** Returns {error, code} not RFC 7807

#### DS4: Circuit breaker
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.5 Distributed Systems
- **Evidence:** Not implemented

### From 04-logging-observability.md

#### LC4: Correlation ID middleware
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.1 Log Configuration
- **Evidence:** X-Request-Id generated, not propagated

#### DT1: OpenTelemetry SDK
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.4 Distributed Tracing
- **Evidence:** No OTEL imports

#### DT2: Auto-instrumentation
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.4 Distributed Tracing
- **Evidence:** Not implemented

#### DT4: Trace ID in logs
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.4 Distributed Tracing
- **Evidence:** Not included

#### DT5: Context propagation
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.4 Distributed Tracing
- **Evidence:** Basic headers, no trace

#### DT6: Error spans recorded
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.4 Distributed Tracing
- **Evidence:** No span recording

#### DT7: Custom spans
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.4 Distributed Tracing
- **Evidence:** No manual instrumentation

#### M1: /metrics endpoint
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.5 Metrics
- **Evidence:** No Prometheus endpoint

#### M2: HTTP request rate
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.5 Metrics
- **Evidence:** No counter

#### M3: HTTP request duration
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.5 Metrics
- **Evidence:** No histogram

#### M4: Error rate trackable
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.5 Metrics
- **Evidence:** No status labels

#### M5: Default Node.js metrics
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.5 Metrics
- **Evidence:** No prom-client

### From 05-s2s-auth.md

#### Unique credentials per service
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** Service Client - Authentication
- **Evidence:** Shared INTERNAL_SERVICE_SECRET

#### Short-lived tokens
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Service Client - Authentication
- **Evidence:** Static API key

#### Circuit breaker
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** Service Client - Request Security
- **Evidence:** Health tracking, no breaker

#### Issuer validated against allowlist
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Service Endpoint - Authentication
- **Evidence:** No service allowlist

#### Audience validated
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Service Endpoint - Authentication
- **Evidence:** No audience validation

#### Per-endpoint authorization
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Service Endpoint - Authorization
- **Evidence:** Any service can call any endpoint

#### Per-endpoint service allowlist
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Service Endpoint - Authorization
- **Evidence:** Not implemented

#### No default-allow policy
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Service Endpoint - Authorization
- **Evidence:** Default allow if signature valid

#### Request body in signature
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** HMAC Signature Security
- **Evidence:** Only serviceName:timestamp:url

#### Per-service secrets
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** HMAC Signature Security
- **Evidence:** Single shared secret

#### TLS enabled
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** RabbitMQ Security
- **Evidence:** amqp:// not amqps://

#### Unique credentials per service
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** RabbitMQ Security
- **Evidence:** admin:admin default

#### Default guest disabled
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** RabbitMQ Security
- **Evidence:** Using admin:admin

#### Unique secrets per service
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Secrets Management
- **Evidence:** Shared secret

### From 06-database-integrity.md

#### Idempotency key
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.3 Race Conditions
- **Evidence:** Not implemented

#### Statement timeout
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.4 Connection Pool
- **Evidence:** Not configured

### From 07-idempotency.md

#### Key format includes tenant_id
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** Payment Flow
- **Evidence:** Client key, tenant validated separately

#### Idempotency includes tenant_id
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Ticket Purchase Flow
- **Evidence:** No tenant_id in table

#### Concurrent returns 409
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Ticket Purchase Flow
- **Evidence:** No locking, race window

#### Uses idempotency
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Ticket Reservation
- **Evidence:** No idempotency key

#### Duplicates prevented
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** Ticket Reservation
- **Evidence:** Locking, no idempotency

#### All POST support idempotency
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** State-Changing Operations
- **Evidence:** Purchase yes, reservation no

#### Checks are atomic
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** State-Changing Operations
- **Evidence:** SELECT before INSERT

#### Keys scoped to tenant
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** State-Changing Operations
- **Evidence:** No tenant_id

### From 08-rate-limiting.md

#### Route-specific limits
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** Fastify Rate Limit
- **Evidence:** Middleware exists, not integrated

#### Purchase rate limited
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** Payment/Purchase Endpoints
- **Evidence:** Global only, tier not applied

#### Transfer limited
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** Payment/Purchase Endpoints
- **Evidence:** Tier defined, not applied

#### Trusted proxy list
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** Header Manipulation Protection
- **Evidence:** trustProxy: true (all)

### From 09-multi-tenancy.md

#### Non-superuser role
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** PostgreSQL RLS
- **Evidence:** Uses env var, unverified

#### No BYPASSRLS
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** PostgreSQL RLS
- **Evidence:** Not verified

#### Uses current_setting('app.current_tenant_id')
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** PostgreSQL RLS
- **Evidence:** Uses user_id not tenant_id

#### Missing tenant returns 401
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** JWT Claims & Middleware
- **Evidence:** No validation

#### Tenant format validated
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** JWT Claims & Middleware
- **Evidence:** No UUID validation

#### Queries in tenant transaction
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** Knex Query Patterns
- **Evidence:** Transactions, no SET LOCAL

#### SET LOCAL app.current_tenant_id
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Knex Query Patterns
- **Evidence:** Not implemented

#### DB context set before job
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Background Jobs
- **Evidence:** No SET LOCAL

### From 10-testing.md

#### Coverage thresholds 80%
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** Jest Configuration
- **Evidence:** 70% thresholds (below target)

#### Concurrent last ticket race
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Critical Business Logic
- **Evidence:** No concurrent test

### From 11-documentation.md

#### README.md
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Documentation Existence
- **Evidence:** Not found

#### OpenAPI spec
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** API Documentation
- **Evidence:** Not found

#### Restart procedure
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Runbook Documentation
- **Evidence:** No runbook

#### Scaling procedure
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Runbook Documentation
- **Evidence:** No runbook

#### Rollback procedure
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Runbook Documentation
- **Evidence:** No runbook

### From 12-health-checks.md

#### GET /health/startup
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Required Endpoints
- **Evidence:** Not implemented

#### Event loop monitoring
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Liveness Probe
- **Evidence:** No @fastify/under-pressure

### From 13-graceful-degradation.md

#### Fallback support
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Circuit Breaker
- **Evidence:** No built-in fallback

#### Jitter added
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Retry with Backoff
- **Evidence:** No jitter

#### Database query timeouts
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** Timeout Configuration
- **Evidence:** Pool only, no statement_timeout

#### Cache fallback
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** Fallback Strategies
- **Evidence:** Cache used, no explicit

#### Default response
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** Fallback Strategies
- **Evidence:** Some handlers

#### Degraded service
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Fallback Strategies
- **Evidence:** No degraded paths

#### Statement timeout
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** PostgreSQL Resilience
- **Evidence:** Not configured

### From 19-configuration-management.md

#### Different secrets required
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** Per-Environment Separation
- **Evidence:** Weak dev fallbacks

### From 20-deployment-cicd.md

#### .dockerignore exists
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Build Security
- **Evidence:** Not found

### From 21-database-migrations.md

#### CONCURRENTLY
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Performance & Locking
- **Evidence:** Standard creation

#### Lock timeout
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Performance & Locking
- **Evidence:** Not configured

### From 30-ticket-lifecycle-management.md

#### All states defined
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** Ticket States
- **Evidence:** 7 states, missing MINTED, ACTIVE, CHECKED_IN

#### States match DB/code
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** Ticket States
- **Evidence:** Enum UPPERCASE, DB lowercase

#### Invalid transitions throw
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** State Transitions
- **Evidence:** Only transfer validates

#### Validation before update
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** State Transitions
- **Evidence:** Transfer only

#### Status before check-in
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** Validation Rules
- **Evidence:** Loose status check

#### Time window validation
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Validation Rules
- **Evidence:** No event time check

#### Transfer history on-chain
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Transfer Restrictions
- **Evidence:** DB only

#### Reasons enumerated
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Revocation
- **Evidence:** No enum

#### Revoked unusable
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** Revocation
- **Evidence:** Status check exists

#### Holder notified
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Revocation
- **Evidence:** No notification

#### Refund triggered
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** Revocation
- **Evidence:** Separate handler

#### Admin auth required
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Revocation
- **Evidence:** No admin check

#### Authorized roles only
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Revocation
- **Evidence:** No RBAC

### From 31-blockchain-database-consistency.md

#### NFT ownership documented
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Source of Truth
- **Evidence:** Not documented

#### Transaction history
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Source of Truth
- **Evidence:** Not documented

#### User profiles
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Source of Truth
- **Evidence:** Not documented

#### Event metadata
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Source of Truth
- **Evidence:** Not documented

#### Pricing
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Source of Truth
- **Evidence:** Not documented

#### Tracking lastValidBlockHeight
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Blockchain Transaction Handling
- **Evidence:** No blockhash tracking

#### Pending transactions table
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Blockchain Transaction Handling
- **Evidence:** Doesn't exist

#### Expired transaction detection
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Blockchain Transaction Handling
- **Evidence:** No handling

#### Confirmation callback
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Blockchain Transaction Handling
- **Evidence:** Not implemented

#### Balance comparison
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Reconciliation Processes
- **Evidence:** Not implemented

#### Real-time blockchain listener
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Event Synchronization
- **Evidence:** No WebSocket

#### Auto reconnection
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Event Synchronization
- **Evidence:** No listener

#### Missed event detection
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Event Synchronization
- **Evidence:** Not implemented

#### Block reorg handling
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Event Synchronization
- **Evidence:** Not implemented

#### RPC failover
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Failure Handling
- **Evidence:** Single endpoint

#### Circuit breaker for RPC
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Failure Handling
- **Evidence:** None

#### Manual procedure documented
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Failure Handling
- **Evidence:** No docs

#### On-call runbook
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Alerting & Monitoring
- **Evidence:** None

#### pending_transactions table
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Database Schema
- **Evidence:** Doesn't exist

#### blockchain_sync_log table
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Database Schema
- **Evidence:** Doesn't exist

---

## Architecture Issues Summary

### 1. Blockchain Is Not Real (CRITICAL)
The ticket-service simulates blockchain operations. The database is updated immediately without waiting for blockchain confirmation. There is no ownership reconciliation between DB and blockchain.

**Evidence:**
- DB updated before blockchain confirmation
- No pending_transactions table
- No blockchain_sync_log table
- No ownership comparison job
- No real-time blockchain listener

**Required:** Implement proper blockchain integration with confirmation waiting, pending transaction tracking, and reconciliation jobs.

### 2. Tenant ID Spoofable (CRITICAL)
Tenant ID is accepted from:
- x-tenant-id header (spoofable)
- Request body tenantId field (spoofable)
- Neither is validated against JWT

**Evidence:**
- `Also accepts x-tenant-id header!`
- `Uses body tenantId`
- `Header accepted blindly`

**Required:**
```typescript
// ONLY accept tenant from verified JWT
const tenantId = request.user?.tenantId;
if (!tenantId) {
  throw new UnauthorizedError('Missing tenant');
}
// NEVER use header or body tenant
```

### 3. No State Transition Validation (CRITICAL)
There is no state machine. Any ticket status can be set to any other status. Terminal states (CANCELLED, REFUNDED) are not protected.

**Required:**
```typescript
const VALID_TRANSITIONS = {
  reserved: ['purchased', 'expired'],
  purchased: ['transferred', 'refunded', 'checked_in'],
  transferred: ['transferred', 'refunded', 'checked_in'],
  checked_in: [], // terminal
  refunded: [],   // terminal
  expired: [],    // terminal
  cancelled: []   // terminal
};

function validateTransition(from: string, to: string): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}
```

### 4. No Duplicate Scan Detection (CRITICAL)
The same ticket can be scanned multiple times. There is no check for previous scans.

**Required:**
```typescript
// Check if already scanned
const existing = await db('ticket_scans')
  .where('ticket_id', ticketId)
  .where('event_id', eventId)
  .first();

if (existing) {
  throw new ConflictError('Ticket already scanned');
}
```

### 5. S2S Security Failures (CRITICAL)
- Uses http:// not https:// for internal calls
- Hardcoded secret: default in source code
- Timing attack: uses !== for comparison
- RabbitMQ: using admin:admin credentials

**Required:**
```typescript
// Fix timing attack
import { timingSafeEqual } from 'crypto';

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
```

### 6. Rate Limiting Uses In-Memory (CRITICAL)
Fastify rate limiter uses in-memory storage instead of Redis. This means:
- Rate limits don't work across multiple instances
- Limits reset on restart

**Required:**
```typescript
import rateLimit from '@fastify/rate-limit';
import Redis from 'ioredis';

app.register(rateLimit, {
  redis: new Redis(redisConfig),
  max: 100,
  timeWindow: '1 minute'
});
```

---

## Quick Fix Code Snippets

### Fix Tenant Validation (CRITICAL)
```typescript
// middleware/tenant.middleware.ts
export async function validateTenant(request: FastifyRequest) {
  const tenantId = request.user?.tenantId;
  
  if (!tenantId) {
    throw new UnauthorizedError('Missing tenant context');
  }
  
  // Validate UUID format
  if (!isUUID(tenantId)) {
    throw new UnauthorizedError('Invalid tenant ID format');
  }
  
  // IGNORE any tenant from headers or body
  // request.headers['x-tenant-id'] - DO NOT USE
  // request.body.tenantId - DO NOT USE
  
  // Set RLS context
  await db.raw('SET LOCAL app.current_tenant_id = ?', [tenantId]);
}
```

### Fix Blockchain Confirmation Wait (CRITICAL)
```typescript
// Create pending_transactions table
await db.schema.createTable('pending_transactions', (table) => {
  table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
  table.string('tx_signature', 128).notNullable().unique();
  table.uuid('ticket_id').references('tickets.id');
  table.enum('status', ['pending', 'confirmed', 'failed', 'expired']);
  table.integer('confirmation_count').defaultTo(0);
  table.timestamp('submitted_at').defaultTo(db.fn.now());
  table.timestamp('confirmed_at');
  table.jsonb('error_details');
});

// Wait for confirmation before DB update
async function waitForConfirmation(txSignature: string, maxRetries = 30) {
  for (let i = 0; i < maxRetries; i++) {
    const status = await connection.getSignatureStatus(txSignature);
    if (status?.confirmationStatus === 'finalized') {
      return true;
    }
    await sleep(1000);
  }
  throw new Error('Transaction not confirmed');
}
```

### Fix Duplicate Scan Detection (CRITICAL)
```typescript
async function validateTicketScan(ticketId: string, eventId: string) {
  // Check for existing scan
  const existingScan = await db('ticket_scans')
    .where('ticket_id', ticketId)
    .where('event_id', eventId)
    .first();
  
  if (existingScan) {
    throw new ConflictError('TICKET_ALREADY_SCANNED', {
      scannedAt: existingScan.scanned_at,
      scannedBy: existingScan.scanned_by
    });
  }
  
  // Record this scan
  await db('ticket_scans').insert({
    ticket_id: ticketId,
    event_id: eventId,
    scanned_at: new Date(),
    scanned_by: request.user.id
  });
}
```

### Fix State Transitions (CRITICAL)
```typescript
const VALID_TRANSITIONS: Record<string, string[]> = {
  reserved: ['purchased', 'expired', 'cancelled'],
  purchased: ['transferred', 'refunded', 'checked_in'],
  transferred: ['transferred', 'refunded', 'checked_in'],
  checked_in: [],
  refunded: [],
  expired: [],
  cancelled: []
};

async function updateTicketStatus(ticketId: string, newStatus: string) {
  const ticket = await db('tickets').where('id', ticketId).first();
  
  const allowed = VALID_TRANSITIONS[ticket.status] || [];
  if (!allowed.includes(newStatus)) {
    throw new ValidationError(`Cannot transition from ${ticket.status} to ${newStatus}`);
  }
  
  await db('tickets').where('id', ticketId).update({ status: newStatus });
}
```

### Fix Timing-Safe Comparison (CRITICAL)
```typescript
import { timingSafeEqual, createHmac } from 'crypto';

function verifySignature(payload: string, signature: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  
  if (sigBuf.length !== expectedBuf.length) {
    return false;
  }
  
  return timingSafeEqual(sigBuf, expectedBuf);
}
```

### Fix Rate Limiter (CRITICAL)
```typescript
import rateLimit from '@fastify/rate-limit';
import Redis from 'ioredis';

const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  tls: config.redis.tls ? {} : undefined
});

app.register(rateLimit, {
  global: true,
  max: 100,
  timeWindow: '1 minute',
  redis,
  keyGenerator: (request) => {
    return `${request.user?.tenantId}:${request.user?.id || request.ip}`;
  }
});
```
