# Payment-Service Audit Findings

**Generated:** 2025-12-28
**Audit Files Reviewed:** 17
**Total Findings:** 316 (202 FAIL, 114 PARTIAL)

---

## Summary by Severity

| Severity | FAIL | PARTIAL | Total |
|----------|------|---------|-------|
| CRITICAL | 18 | 5 | 23 |
| HIGH | 72 | 38 | 110 |
| MEDIUM | 78 | 52 | 130 |
| LOW | 34 | 19 | 53 |

---

## Summary by Audit File

| File | FAIL | PARTIAL | Total |
|------|------|---------|-------|
| 01-security.md | 0 | 4 | 4 |
| 02-input-validation.md | 3 | 9 | 12 |
| 03-error-handling.md | 19 | 12 | 31 |
| 04-logging-observability.md | 11 | 16 | 27 |
| 05-s2s-auth.md | 18 | 9 | 27 |
| 06-database-integrity.md | 3 | 5 | 8 |
| 07-idempotency.md | 1 | 2 | 3 |
| 08-rate-limiting.md | 15 | 8 | 23 |
| 09-multi-tenancy.md | 25 | 16 | 41 |
| 10-testing.md | 5 | 3 | 8 |
| 11-documentation.md | 23 | 9 | 32 |
| 12-health-checks.md | 22 | 3 | 25 |
| 13-graceful-degradation.md | 0 | 2 | 2 |
| 19-configuration-management.md | 11 | 4 | 15 |
| 20-deployment-cicd.md | 0 | 1 | 1 |
| 21-database-migrations.md | 10 | 4 | 14 |
| 32-payment-processing-security.md | 36 | 7 | 43 |

---

## CRITICAL Findings (23)

### From 03-error-handling.md

#### ST2: Webhook returns 200 on error
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.4 Stripe Integration
- **Evidence:** Returns 500!
- **Impact:** Stripe retries indefinitely, causing duplicate processing attempts

### From 05-s2s-auth.md

#### mTLS or signed tokens
- **Status:** PARTIAL
- **Severity:** CRITICAL
- **Section:** Client - Authentication
- **Evidence:** HMAC in outbox, NONE in webhook.consumer

### From 08-rate-limiting.md

#### X-Forwarded-For not blind
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Header Manipulation
- **Evidence:** Uses first IP (spoofable!)

#### Rightmost IP used
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Header Manipulation
- **Evidence:** Uses leftmost (first)

#### Spoofing test
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Header Manipulation
- **Evidence:** First IP = bypassable

### From 09-multi-tenancy.md

#### RLS enabled
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** PostgreSQL RLS
- **Evidence:** No ENABLE ROW LEVEL SECURITY

#### FORCE RLS
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** PostgreSQL RLS
- **Evidence:** Not found

#### RLS policies exist
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** PostgreSQL RLS
- **Evidence:** None

#### NULL handling
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** PostgreSQL RLS
- **Evidence:** No policies

#### USING + WITH CHECK
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** PostgreSQL RLS
- **Evidence:** No policies

#### Bypass connection
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** PostgreSQL RLS
- **Evidence:** Not found

### From 12-health-checks.md

#### No external services
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Readiness Probe
- **Evidence:** Checks Stripe!
- **Impact:** Stripe outage causes cascading failure

#### NOT in readiness
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Stripe Health
- **Evidence:** Included!

### From 19-configuration-management.md

#### Validation at startup
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Env Variable Management
- **Evidence:** No envalid/zod

#### Fail fast missing
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Env Variable Management
- **Evidence:** All have defaults

#### No insecure default
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** JWT Configuration
- **Evidence:** 'your-secret-key'

#### Key length validation
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** JWT Configuration
- **Evidence:** None

### From 21-database-migrations.md

#### CONCURRENTLY for indexes
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Performance & Locking
- **Evidence:** All indexes block writes

#### CREATE INDEX CONCURRENTLY
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Performance & Locking
- **Evidence:** Not used

#### CONCURRENTLY
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** PostgreSQL-Specific
- **Evidence:** Not used

### From 32-payment-processing-security.md

#### Multi-party uses SCT
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1 Transfer Pattern
- **Evidence:** No transfers.create calls
- **Impact:** Cannot distribute funds to venues/artists

#### Destination charges
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1 Transfer Pattern
- **Evidence:** No transfer_data param

---

## HIGH Findings (110)

### From 02-input-validation.md

#### RD1: All routes have schema
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.1 Route Definition
- **Evidence:** refund.routes.ts MISSING validation

#### RD2: Body schema for POST/PUT
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.1 Route Definition
- **Evidence:** 6 schemas; refund create missing

#### RD3: Params schema with format
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.1 Route Definition
- **Evidence:** :escrowId no UUID validation

### From 03-error-handling.md

#### RH3: notFoundHandler
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.1 Route Handlers
- **Evidence:** Defined but NOT registered

#### RH5: RFC 7807 format
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.1 Route Handlers
- **Evidence:** Returns {error, code} not RFC 7807

#### SL1: try/catch on public methods
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.2 Service Layer
- **Evidence:** No try/catch around Stripe

#### SL7: External errors wrapped
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.2 Service Layer
- **Evidence:** Stripe errors not wrapped

#### ST4: Stripe errors categorized
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.4 Stripe Integration
- **Evidence:** No type handling

### From 04-logging-observability.md

#### LC1: Structured JSON
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.1 Log Configuration
- **Evidence:** SafeLogger JSON, main logger NOT

#### DT1: OpenTelemetry SDK
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.6 Distributed Tracing
- **Evidence:** Custom implementation

#### DT2: Auto-instrumentation
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.6 Distributed Tracing
- **Evidence:** Not using OTel

#### M1: /metrics endpoint
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.7 Metrics
- **Evidence:** Not exposed

### From 05-s2s-auth.md

#### No hardcoded secrets
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Client - Authentication
- **Evidence:** 6+ default secrets

#### HTTPS for internal
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Client - Request Security
- **Evidence:** http://ticket:3004

#### All endpoints auth
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** Endpoint - Authentication
- **Evidence:** Per-route, not global

#### Middleware global
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Endpoint - Authentication
- **Evidence:** Per-route

#### Issuer validated
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Endpoint - Authentication
- **Evidence:** No allowlist

#### Audience validated
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Endpoint - Authentication
- **Evidence:** None

#### Per-endpoint rules
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Endpoint - Authorization
- **Evidence:** None

#### Service allowlist
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Endpoint - Authorization
- **Evidence:** Any service can call any

#### No default-allow
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Endpoint - Authorization
- **Evidence:** Default allow

#### Constant-time comparison
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** HMAC Verification
- **Evidence:** Uses !==

#### Per-service secrets
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** HMAC Verification
- **Evidence:** Shared secret

#### Secrets manager
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** Secrets Management
- **Evidence:** Uses env vars

#### No secrets in code
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Secrets Management
- **Evidence:** 6+ defaults

### From 06-database-integrity.md

#### FOR UPDATE on critical
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.2 Locking
- **Evidence:** Some places, not consistent

#### Serializable isolation
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.6 Race Condition
- **Evidence:** None found

#### FOR UPDATE on inventory
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.6 Race Condition
- **Evidence:** Some services

#### Atomic inventory decrement
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.6 Race Condition
- **Evidence:** Not all paths

### From 08-rate-limiting.md

#### Trusted proxy list
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Header Manipulation
- **Evidence:** trustProxy: true (all)

### From 09-multi-tenancy.md

#### Missing tenant returns 401
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** JWT/Middleware
- **Evidence:** Proceeds without

#### UUID format validated
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** JWT/Middleware
- **Evidence:** No validation

#### URL vs JWT validated
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** JWT/Middleware
- **Evidence:** No matching

#### Queries in tenant transaction
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Query Patterns
- **Evidence:** Only 1 set_config usage

#### SET LOCAL tenant_id
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** Query Patterns
- **Evidence:** Only refundController

#### No direct knex without wrapper
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Query Patterns
- **Evidence:** Direct queries

#### Required for auth routes
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Tenant Validation
- **Evidence:** Not enforced

#### Missing returns 401/403
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** Tenant Validation
- **Evidence:** Only refundController

#### Body tenant rejected
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Tenant Validation
- **Evidence:** Some use body

#### Cross-tenant blocked
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** Tenant Validation
- **Evidence:** Some validation

#### Payloads include tenant
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** Background Jobs
- **Evidence:** Some outbox entries

#### Processor validates tenant
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Background Jobs
- **Evidence:** None

#### DB context set
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Background Jobs
- **Evidence:** No tenant context

#### tenant_id NOT NULL
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Database Schema
- **Evidence:** Most are nullable!

### From 10-testing.md

#### Multi-tenant flows
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** E2E Tests
- **Evidence:** No tenant isolation test

#### Multi-tenant isolation
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Security Tests
- **Evidence:** No cross-tenant tests

### From 11-documentation.md

#### README.md
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Project-Level
- **Evidence:** Not found

#### OpenAPI spec
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** API Documentation
- **Evidence:** Not found

### From 12-health-checks.md

#### /health/startup
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Required Endpoints
- **Evidence:** Not found

#### Timeout configured
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Readiness Probe
- **Evidence:** No timeout

#### Dedicated endpoint
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Startup Probe
- **Evidence:** Not found

#### Config validation
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Startup Probe
- **Evidence:** Not implemented

#### DB connection
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Startup Probe
- **Evidence:** Not implemented

#### Redis connection
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Startup Probe
- **Evidence:** Not implemented

#### Migrations complete
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Startup Probe
- **Evidence:** Not implemented

#### Query timeout
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** PostgreSQL Health
- **Evidence:** No timeout

#### Timeout configured
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Redis Health
- **Evidence:** No timeout

#### Config check only
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Stripe Health
- **Evidence:** Calls balance.retrieve()

#### Timeout configured
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Stripe Health
- **Evidence:** No timeout

### From 19-configuration-management.md

#### Stripe via manager
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Secrets Handling
- **Evidence:** From env directly

#### JWT via manager
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Secrets Handling
- **Evidence:** From env directly

#### Via secrets manager
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Stripe Configuration
- **Evidence:** From env

#### Webhook secured
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Stripe Configuration
- **Evidence:** Same issue

#### Via secrets manager
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** JWT Configuration
- **Evidence:** From env with default

### From 21-database-migrations.md

#### One change per file
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** File Structure & Naming
- **Evidence:** 60+ tables in one file

#### lock_timeout set
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Performance & Locking
- **Evidence:** Not configured

#### Transactions disabled for CONCURRENTLY
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Knex-Specific
- **Evidence:** Pattern not established

#### lock_timeout
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** PostgreSQL-Specific
- **Evidence:** Not set

### From 32-payment-processing-security.md

#### Charge type documented
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.1 Transfer Pattern
- **Evidence:** No documentation

#### transfer_group used
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.1 Transfer Pattern
- **Evidence:** Not found

#### source_transaction used
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.1 Transfer Pattern
- **Evidence:** Not found

#### Connect webhook configured
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.2 Failure Handling
- **Evidence:** account.updated only

#### charge.refunded reverses
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.2 Failure Handling
- **Evidence:** Placeholder only

#### transfer.reversed handler
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.2 Failure Handling
- **Evidence:** Not exists

#### payout.failed handler
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.2 Failure Handling
- **Evidence:** Not exists

#### Retry job for transfers
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.2 Failure Handling
- **Evidence:** Not exists

#### Alerting for failures
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.2 Failure Handling
- **Evidence:** Not implemented

#### Stripe fees factored
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.4 Fee Calculation
- **Evidence:** Not in split logic

#### Partial refund adjustment
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.4 Fee Calculation
- **Evidence:** Placeholder

#### source_transaction prevents early
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.5 Payout Timing
- **Evidence:** No transfers

#### reverse_transfer: true
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.6 Refund & Dispute
- **Evidence:** Not implemented

#### Transfer reversals
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.6 Refund & Dispute
- **Evidence:** No transfers

#### Partial refund proportional
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.6 Refund & Dispute
- **Evidence:** Not implemented

#### Dispute webhook
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.6 Refund & Dispute
- **Evidence:** No handler

#### Transfer reversal on dispute
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.6 Refund & Dispute
- **Evidence:** Not implemented

#### Re-transfer on dispute won
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.6 Refund & Dispute
- **Evidence:** Not implemented

#### Balance checked
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.6 Refund & Dispute
- **Evidence:** No checks

#### stripe_transfers table
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.7 Database Schema
- **Evidence:** Not exists

#### pending_transfers table
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.7 Database Schema
- **Evidence:** Not exists

---

## Architecture Issues Summary

### 1. Stripe Connect NOT IMPLEMENTED (CRITICAL)

The payment service can collect money but **cannot distribute it**. There is no implementation for:
- Transfers to connected accounts (venues, artists)
- Transfer groups for tracking related payments
- Destination charges
- Payout scheduling
- Transfer reversals on refund
- Dispute handling

**Evidence:**
- No `transfers.create` calls anywhere
- No `transfer_data` parameter in payment intents
- No `stripe_transfers` table
- No `pending_transfers` table
- Refund handler is a placeholder

**Impact:** Revenue cannot be distributed. Venues and artists cannot be paid.

### 2. No Row Level Security (CRITICAL)

No RLS policies exist on any table. This means:
- Any query can access any tenant's data
- Background jobs have no tenant isolation
- Cross-tenant data leakage is possible

**Required:**
```sql
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments FORCE ROW LEVEL SECURITY;

CREATE POLICY payments_tenant_isolation ON payments
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
```

### 3. Rate Limit Bypass via X-Forwarded-For (CRITICAL)

The service uses `trustProxy: true` and takes the **first** IP from X-Forwarded-For. Attackers can spoof this header to bypass rate limits.

**Evidence:**
- `trustProxy: true` trusts ALL proxies
- Uses leftmost IP (attacker-controlled)
- No IP validation

**Required:**
```typescript
// Use rightmost IP (added by YOUR proxy)
app.register(fastify, {
  trustProxy: ['10.0.0.0/8', '172.16.0.0/12'] // Your actual proxy IPs
});
```

### 4. Webhook Returns 500 (CRITICAL)

When webhook processing fails, the handler returns 500. Stripe interprets this as a temporary failure and retries indefinitely.

**Required:**
```typescript
// Always return 200, handle errors internally
app.post('/webhook', async (request, reply) => {
  try {
    await processWebhook(request.body);
  } catch (error) {
    logger.error({ error }, 'Webhook processing failed');
    // Queue for retry internally, don't tell Stripe to retry
  }
  return reply.status(200).send({ received: true });
});
```

### 5. Stripe in Health Check (CRITICAL)

The readiness probe calls `stripe.balance.retrieve()`. If Stripe has an outage, all instances report unhealthy, causing complete service failure.

**Required:** Remove Stripe from readiness check. Only check local dependencies (DB, Redis).

### 6. Insecure JWT Default (CRITICAL)

JWT secret defaults to `'your-secret-key'`. If environment variable is missing, auth is completely compromised.

**Required:**
```typescript
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters');
}
```

---

## Quick Fix Code Snippets

### Fix Webhook Response (CRITICAL)
```typescript
app.post('/stripe/webhook', async (request, reply) => {
  const event = stripe.webhooks.constructEvent(
    request.rawBody,
    request.headers['stripe-signature'],
    webhookSecret
  );
  
  try {
    await processEvent(event);
  } catch (error) {
    // Log and queue for retry, but return 200
    logger.error({ eventId: event.id, error }, 'Webhook processing failed');
    await queueForRetry(event);
  }
  
  // ALWAYS return 200
  return reply.status(200).send({ received: true });
});
```

### Fix Rate Limit IP Extraction (CRITICAL)
```typescript
// In Fastify config
const app = Fastify({
  trustProxy: process.env.TRUSTED_PROXY_IPS?.split(',') || false
});

// In rate limiter
keyGenerator: (request) => {
  // Use the rightmost untrusted IP
  const xff = request.headers['x-forwarded-for'];
  if (xff) {
    const ips = xff.split(',').map(ip => ip.trim());
    // Rightmost IP is added by your infrastructure
    return ips[ips.length - 1];
  }
  return request.ip;
}
```

### Fix RLS (CRITICAL)
```sql
-- Run for each table
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments FORCE ROW LEVEL SECURITY;

CREATE POLICY payments_tenant_policy ON payments
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Also make tenant_id NOT NULL
ALTER TABLE payments ALTER COLUMN tenant_id SET NOT NULL;
```

### Fix Health Check (CRITICAL)
```typescript
// health.routes.ts
app.get('/health/ready', async (request, reply) => {
  const checks = {
    database: await checkDatabase(),
    redis: await checkRedis(),
    // DO NOT include Stripe here
  };
  
  const healthy = Object.values(checks).every(c => c.status === 'ok');
  return reply.status(healthy ? 200 : 503).send(checks);
});

// Stripe check should be separate and non-blocking
app.get('/health/integrations', async (request, reply) => {
  // This is informational only, not used for orchestration
  return { stripe: await checkStripe() };
});
```

### Fix JWT Validation (CRITICAL)
```typescript
// config/index.ts
import { cleanEnv, str } from 'envalid';

const env = cleanEnv(process.env, {
  JWT_SECRET: str({ 
    desc: 'JWT signing secret',
    example: 'your-32-char-minimum-secret-here'
  }),
  STRIPE_SECRET_KEY: str({ desc: 'Stripe secret key' }),
  STRIPE_WEBHOOK_SECRET: str({ desc: 'Stripe webhook signing secret' }),
  // ... other required vars
});

// Validate JWT secret length
if (env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters');
}

export const config = env;
```

### Implement Stripe Connect Transfers (CRITICAL)
```typescript
// This is the missing functionality
async function distributePayment(paymentIntentId: string) {
  const payment = await db('payments')
    .where('stripe_payment_intent_id', paymentIntentId)
    .first();
  
  const splits = await db('royalty_distributions')
    .where('order_id', payment.order_id);
  
  for (const split of splits) {
    const transfer = await stripe.transfers.create({
      amount: split.amount,
      currency: 'usd',
      destination: split.stripe_account_id,
      transfer_group: payment.order_id,
      source_transaction: payment.stripe_charge_id,
      metadata: {
        order_id: payment.order_id,
        recipient_type: split.recipient_type,
        tenant_id: payment.tenant_id
      }
    });
    
    await db('stripe_transfers').insert({
      id: generateUuid(),
      order_id: payment.order_id,
      stripe_transfer_id: transfer.id,
      destination_account: split.stripe_account_id,
      amount: split.amount,
      status: 'completed',
      tenant_id: payment.tenant_id
    });
  }
}
```

### Fix Timing-Safe Comparison (HIGH)
```typescript
import { timingSafeEqual } from 'crypto';

function verifySignature(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  
  if (a.length !== b.length) {
    return false;
  }
  
  return timingSafeEqual(a, b);
}
```

### Fix Tenant Middleware (HIGH)
```typescript
export async function requireTenant(request: FastifyRequest, reply: FastifyReply) {
  const tenantId = request.user?.tenantId;
  
  if (!tenantId) {
    return reply.status(401).send({ error: 'Missing tenant context' });
  }
  
  // Validate UUID format
  if (!isUUID(tenantId)) {
    return reply.status(401).send({ error: 'Invalid tenant ID' });
  }
  
  // Set RLS context
  await db.raw('SET LOCAL app.current_tenant_id = ?', [tenantId]);
  
  // NEVER trust tenant from body or headers
  // request.body.tenantId - IGNORE
  // request.headers['x-tenant-id'] - IGNORE
}
```
