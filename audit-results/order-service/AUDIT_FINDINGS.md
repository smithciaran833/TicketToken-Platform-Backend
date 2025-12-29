# Order-Service Audit Findings

**Generated:** 2025-12-28
**Audit Files Reviewed:** 17
**Total Findings:** 292 (193 FAIL, 99 PARTIAL)

---

## Summary by Severity

| Severity | FAIL | PARTIAL | Total |
|----------|------|---------|-------|
| CRITICAL | 24 | 3 | 27 |
| HIGH | 82 | 34 | 116 |
| MEDIUM | 62 | 42 | 104 |
| LOW | 25 | 20 | 45 |

---

## Summary by Audit File

| File | FAIL | PARTIAL | Total |
|------|------|---------|-------|
| 01-security.md | 7 | 9 | 16 |
| 02-input-validation.md | 6 | 10 | 16 |
| 03-error-handling.md | 5 | 4 | 9 |
| 04-logging-observability.md | 0 | 1 | 1 |
| 05-s2s-auth.md | 22 | 8 | 30 |
| 06-database-integrity.md | 1 | 3 | 4 |
| 07-idempotency.md | 0 | 1 | 1 |
| 08-rate-limiting.md | 2 | 7 | 9 |
| 09-multi-tenancy.md | 0 | 2 | 2 |
| 10-testing.md | 28 | 11 | 39 |
| 11-documentation.md | 27 | 13 | 40 |
| 12-health-checks.md | 9 | 2 | 11 |
| 13-graceful-degradation.md | 16 | 5 | 21 |
| 19-configuration-management.md | 11 | 5 | 16 |
| 20-deployment-cicd.md | 7 | 5 | 12 |
| 21-database-migrations.md | 12 | 4 | 16 |
| 34-refund-scenarios.md | 40 | 9 | 49 |

---

## CRITICAL Findings (27)

### From 01-security.md

#### SEC-R1: Protected routes use auth
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1 Route Layer - Authentication Middleware
- **Evidence:** `routes/order.routes.ts` lines 5-7: `// TODO: Implement authentication` - STUB
- **Impact:** ALL routes are unprotected. Anyone can access any order.

#### SEC-R2: JWT signature verified
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1 Route Layer - Authentication Middleware
- **Evidence:** `plugins/jwt-auth.plugin.ts` exists but NEVER REGISTERED in app.ts
- **Impact:** JWT tokens are never validated.

#### SEC-R5: Expired tokens rejected
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1 Route Layer - Authentication Middleware
- **Evidence:** JWT plugin not active - no validation occurs

#### SEC-R6: No hardcoded secrets
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1 Route Layer - Authentication Middleware
- **Evidence:** `plugins/jwt-auth.plugin.ts` line 28: `'your-secret-key-change-in-production'`

### From 02-input-validation.md

#### RD1: All routes have schema
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1 Route Definition
- **Evidence:** `tax.routes.ts`: 0/15 routes; `refund-policy.routes.ts`: 0/13 routes
- **Impact:** 28 routes accept ANY input without validation.

#### SL2: Auth before data access
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.3 Service Layer
- **Evidence:** Auth is broken stub

### From 05-s2s-auth.md

#### S2S1: Internal endpoints have auth
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 5.1 Internal API Authentication
- **Evidence:** `middleware/index.ts`: internal-auth.middleware COMMENTED OUT

#### S2S2: Service tokens validated
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 5.1 Internal API Authentication
- **Evidence:** No token validation in service clients

#### S2S3: Token expiration checked
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 5.1 Internal API Authentication
- **Evidence:** No tokens used - plain HTTP requests

#### S2S4: Service identity verified
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 5.1 Internal API Authentication
- **Evidence:** No service identity verification

#### S2S5: mTLS configured
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 5.1 Internal API Authentication
- **Evidence:** Plain HTTP: `http://tickettoken-event:3003`

#### S2S6: API keys rotated
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 5.1 Internal API Authentication
- **Evidence:** No API keys configured

#### S2S8: Internal routes protected
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 5.1 Internal API Authentication
- **Evidence:** `/internal/*` routes exposed without auth

#### SC1: HTTPS enforced
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 5.2 Service Client Security
- **Evidence:** All URLs default to `http://`

#### SC2: Certificate validation
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 5.2 Service Client Security
- **Evidence:** No TLS configured

#### OR1: Auth headers added
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 5.3 Outbound Request Security
- **Evidence:** No headers in event/payment/ticket clients

#### IR2: Internal auth middleware
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 5.4 Inbound Internal Security
- **Evidence:** Middleware commented out

#### IR3: Request source validated
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 5.4 Inbound Internal Security
- **Evidence:** No source validation

### From 10-testing.md

#### JC-3: Coverage thresholds
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1 Jest Configuration
- **Evidence:** No coverageThreshold

#### FT-3: Server closes in afterAll
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.2 Fastify Testing
- **Evidence:** Empty afterAll with // Cleanup

#### CV-1: 80% line coverage
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.6 Coverage
- **Evidence:** No thresholds

#### CV-2: Critical path coverage
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.6 Coverage
- **Evidence:** No thresholds

### From 11-documentation.md

#### README.md
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1 Project-Level Documentation
- **Evidence:** File not found

#### ADRs in docs/decisions/
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.2 Architecture Documentation
- **Evidence:** Directory does not exist

### From 12-health-checks.md

#### GET /health/startup
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1 Required Endpoints
- **Evidence:** Not implemented

#### Startup probe
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.6 Probe Design
- **Evidence:** Not implemented

### From 19-configuration-management.md

#### No secrets in logs
- **Status:** PARTIAL
- **Severity:** CRITICAL
- **Section:** 3.8 Logging Security
- **Evidence:** Manual review needed

#### Request/response sanitized
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.8 Logging Security
- **Evidence:** No pino redaction

### From 20-deployment-cicd.md

#### .dockerignore
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.2 Build Security
- **Evidence:** File does not exist
- **Impact:** Sensitive files could leak into Docker image

### From 21-database-migrations.md

#### lock_timeout configured
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.5 Performance and Locking
- **Evidence:** Not set
- **Impact:** Migrations could block all queries indefinitely

### From 34-refund-scenarios.md

#### After transfer
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1 Refund Scenarios
- **Evidence:** No transfer check
- **Impact:** Can refund ticket after it's been transferred = double spend

#### Not transferred
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.3 Eligibility Validation
- **Evidence:** No transfer check

#### reverse_transfer
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.4 Multi-Party Handling
- **Evidence:** Not sent to payment-service

#### refund_application_fee
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.4 Multi-Party Handling
- **Evidence:** Not sent

#### dispute.created webhook
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.6 Chargeback Handling
- **Evidence:** No handler
- **Impact:** Chargebacks go completely unhandled

#### dispute.updated webhook
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.6 Chargeback Handling
- **Evidence:** No handler

#### dispute.closed webhook
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.6 Chargeback Handling
- **Evidence:** No handler

---

## HIGH Findings (116)

### From 01-security.md

#### SEC-R3: Algorithm whitelisted
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.1 Route Layer
- **Evidence:** Uses @fastify/jwt but no explicit algorithm whitelist

#### SEC-R4: Token expiration validated
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.1 Route Layer
- **Evidence:** `expiresIn: '24h'` configured but plugin not registered

#### SEC-S2: ID validation
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.2 Service Layer
- **Evidence:** Checks exist but depend on broken auth

#### SEC-S4: Role middleware
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.2 Service Layer
- **Evidence:** Depends on request.user which is never set

#### SEC-S14: Re-auth for sensitive ops
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.2 Service Layer
- **Evidence:** No re-authentication for refunds/cancellations

#### SEC-DB1: Database TLS
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.3 Database Layer
- **Evidence:** `config/database.ts` lines 35-44: No ssl configuration

### From 02-input-validation.md

#### RD2: Body schema for POST/PUT
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.1 Route Definition
- **Evidence:** `order.routes.ts`: Yes; tax/refund-policy: NO

#### RD3: Params schema with format
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.1 Route Definition
- **Evidence:** `order.routes.ts`: orderId validated; Others: NO

#### RD5: Response schema defined
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.1 Route Definition
- **Evidence:** No response schemas - data leakage possible

#### RD6: additionalProperties: false
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.1 Route Definition
- **Evidence:** Joi schemas don't use `.unknown(false)`

#### SEC1: Prototype pollution blocked
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.5 Security
- **Evidence:** No `.unknown(false)`

#### SEC2: Mass assignment prevented
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.5 Security
- **Evidence:** Extra fields not rejected

### From 03-error-handling.md

#### GEH5: Hides stack in prod
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.1 Global Error Handler
- **Evidence:** Line 11: `stack: error.stack` logged without env check

#### CEC2: Unique error codes
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.2 Custom Error Classes
- **Evidence:** No error codes - only message strings

### From 05-s2s-auth.md

#### S2S7: Internal secret exists
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 5.1 Internal API Authentication
- **Evidence:** reminder.job.ts uses X-Internal-Secret, clients don't

#### SC7: Credentials from secrets
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 5.2 Service Client Security
- **Evidence:** No credentials being used

#### OR2: Correlation IDs propagated
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 5.3 Outbound Request Security
- **Evidence:** No X-Request-ID forwarded

#### OR3: Tenant context propagated
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 5.3 Outbound Request Security
- **Evidence:** No X-Tenant-ID header

#### OR4: User context propagated
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 5.3 Outbound Request Security
- **Evidence:** No user context forwarded

#### IR5: Service whitelist
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 5.4 Inbound Internal Security
- **Evidence:** No service whitelist

#### SM1: Service secrets in env
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 5.5 Secret Management
- **Evidence:** INTERNAL_SERVICE_SECRET referenced but not used

### From 06-database-integrity.md

#### CP7: SSL/TLS
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 6.9 Connection Pool
- **Evidence:** No ssl option in Pool config

### From 10-testing.md

#### FT-4: All routes tested
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.2 Fastify Testing
- **Evidence:** order.controller.test.ts exists

#### FT-7: Response schema
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.2 Fastify Testing
- **Evidence:** No schema validation tests

#### FT-8: Auth/authz tested
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.2 Fastify Testing
- **Evidence:** tenant middleware only

#### KD-2: Migrations before tests
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.3 Database Testing
- **Evidence:** No migration execution

#### KD-3: DB cleaned between tests
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.3 Database Testing
- **Evidence:** No cleanup logic

#### KD-4: Connection destroyed
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.3 Database Testing
- **Evidence:** Empty afterAll

#### KD-8: RLS policies verified
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.3 Database Testing
- **Evidence:** No RLS tests

#### ST-5: Test card scenarios
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.4 Stripe Testing
- **Evidence:** No test card tests

#### ST-6: Webhook handling
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.4 Stripe Testing
- **Evidence:** No webhook tests

#### ST-7: 3D Secure flows
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.4 Stripe Testing
- **Evidence:** No 3DS tests

#### ST-8: Connect flows
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.4 Stripe Testing
- **Evidence:** No Connect tests

#### CV-4: CI enforces
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.6 Coverage
- **Evidence:** No enforcement

#### CIT-3: Auth/authz
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.7 Critical Integration Tests
- **Evidence:** No ownership tests

#### API1-API10: All OWASP tests
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.8 Security Tests
- **Evidence:** No OWASP tests implemented

#### Integration (20%)
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.9 Test Pyramid
- **Evidence:** 4/47 tests

#### Data isolation
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.11 Test Data
- **Evidence:** No cleanup

### From 11-documentation.md

#### Database selection ADR
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.2 Architecture Documentation
- **Evidence:** Not found

#### Framework choices ADR
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.2 Architecture Documentation
- **Evidence:** Not found

#### Infrastructure ADR
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.2 Architecture Documentation
- **Evidence:** Not found

#### C4 Context Diagram
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.2 Architecture Documentation
- **Evidence:** Not found

#### C4 Container Diagram
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.2 Architecture Documentation
- **Evidence:** Not found

#### Runbooks for critical ops
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.5 Operational Documentation
- **Evidence:** Degradation doc only

#### Deployment
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.6 Runbooks
- **Evidence:** Not documented

#### Rollback
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.6 Runbooks
- **Evidence:** Not documented

### From 12-health-checks.md

#### Event loop monitoring
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.2 Fastify Health Checks
- **Evidence:** No under-pressure plugin

#### Timeouts on checks
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.2 Fastify Health Checks
- **Evidence:** No explicit timeout

#### Query timeout
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.3 PostgreSQL Health
- **Evidence:** No statement_timeout

#### Timeout configured
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.4 Redis Health
- **Evidence:** No timeout on PING

### From 13-graceful-degradation.md

#### Fallback method
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.1 Circuit Breaker
- **Evidence:** No fallbacks in service clients

#### Jitter added
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.2 Retry with Backoff
- **Evidence:** No jitter in calculation

#### Default response
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.5 Fallback Strategies
- **Evidence:** No defaults when services fail

#### Pre-close delay
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.6 Graceful Shutdown
- **Evidence:** No LB drain delay

#### Payment retry
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.10 External Service Resilience
- **Evidence:** No retry in client

#### Payment fallback
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.10 External Service Resilience
- **Evidence:** No fallback behavior

#### Ticket retry
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.10 External Service Resilience
- **Evidence:** No retry in client

#### Ticket fallback
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.10 External Service Resilience
- **Evidence:** No fallback behavior

### From 19-configuration-management.md

#### No secrets in git
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.1 Repository and Version Control
- **Evidence:** Need git-secrets scan

#### Pre-commit hooks
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.1 Repository and Version Control
- **Evidence:** No pre-commit config

#### CI/CD secret scanning
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.1 Repository and Version Control
- **Evidence:** Not in pipeline

#### Schedule documented
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.9 Rotation and Lifecycle
- **Evidence:** None

#### Tested in staging
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.9 Rotation and Lifecycle
- **Evidence:** None

#### Automated
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.9 Rotation and Lifecycle
- **Evidence:** None

#### Monitoring
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.9 Rotation and Lifecycle
- **Evidence:** None

#### Incident response
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.9 Rotation and Lifecycle
- **Evidence:** None

### From 20-deployment-cicd.md

#### SAST enabled
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.5 Security Scanning
- **Evidence:** No evidence

#### Dependency scanning
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.5 Security Scanning
- **Evidence:** No npm audit

#### Container scanning
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.5 Security Scanning
- **Evidence:** No Trivy

### From 21-database-migrations.md

#### CREATE INDEX CONCURRENTLY
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.5 Performance and Locking
- **Evidence:** No CONCURRENTLY used

#### Production data test
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.6 Testing
- **Evidence:** No testing

#### Pre-migration backup
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.14 Backup and Recovery
- **Evidence:** No backup step

#### Backup verified
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.14 Backup and Recovery
- **Evidence:** No verification

#### Procedure documented
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.15 Rollback Readiness
- **Evidence:** None

### From 34-refund-scenarios.md

#### Full refund for cancellation
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.1 Refund Scenarios
- **Evidence:** cancelOrder() but no auto-trigger

#### Postponed event
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.1 Refund Scenarios
- **Evidence:** None

#### Rescheduled event
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.1 Refund Scenarios
- **Evidence:** None

#### Fraudulent transaction
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.1 Refund Scenarios
- **Evidence:** None

#### Invalid ticket (resale)
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.1 Refund Scenarios
- **Evidence:** None

#### Non-delivery (resale)
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.1 Refund Scenarios
- **Evidence:** None

#### Webhook idempotency
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.2 Double Refund Prevention
- **Evidence:** No check on messages

#### Event status
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.3 Eligibility Validation
- **Evidence:** Checks date, not cancellation

#### No active dispute
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.3 Eligibility Validation
- **Evidence:** has_dispute not checked

#### Payment refundable
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.3 Eligibility Validation
- **Evidence:** Doesnt verify Stripe status

#### Seller balance check
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.4 Multi-Party Handling
- **Evidence:** None

#### Insufficient balance
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.4 Multi-Party Handling
- **Evidence:** None

#### Royalty reversal
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.4 Multi-Party Handling
- **Evidence:** None

#### All Royalty Handling (6 checks)
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.5 Royalty Handling
- **Evidence:** No royalty handling in order-service

#### Disputes linked to orders
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.6 Chargeback Handling
- **Evidence:** No tracking

#### Refund locked on dispute
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.6 Chargeback Handling
- **Evidence:** No check

#### Seller notified
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.7 Communication
- **Evidence:** None

#### Creator notified
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.7 Communication
- **Evidence:** None

#### After payout to seller
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.9 Edge Cases
- **Evidence:** No check

---

## Architecture Issues Summary

### 1. Authentication Is Completely Broken (CRITICAL)

The order service has **NO working authentication**:
- JWT plugin exists but is NEVER REGISTERED in app.ts
- Routes have `// TODO: Implement authentication` stub
- Internal auth middleware is COMMENTED OUT
- Hardcoded secret: `'your-secret-key-change-in-production'`

**Evidence:**
```typescript
// routes/order.routes.ts lines 5-7
// TODO: Implement authentication - STUB

// middleware/index.ts
internal-auth.middleware COMMENTED OUT

// plugins/jwt-auth.plugin.ts line 28
secret: process.env.JWT_SECRET || 'your-secret-key-change-in-production'
```

**Impact:** ANYONE can access ANY order. No authentication occurs.

### 2. 28 Routes Have Zero Input Validation (CRITICAL)

- `tax.routes.ts`: 0/15 routes validated
- `refund-policy.routes.ts`: 0/13 routes validated
- No `.unknown(false)` on any Joi schema
- No response schemas

**Impact:** Mass assignment, prototype pollution, data leakage all possible.

### 3. No Chargeback Handling (CRITICAL)

No webhook handlers for:
- `dispute.created`
- `dispute.updated`
- `dispute.closed`

No logic for:
- Linking disputes to orders
- Locking refunds during disputes
- Evidence collection/submission
- Dispute rate monitoring

**Impact:** Chargebacks go completely unhandled. Stripe account could be terminated.

### 4. No Transfer Check Before Refund (CRITICAL)

When processing a refund, the service does not check if the ticket has been transferred. This allows:
1. User A buys ticket
2. User A transfers ticket to User B
3. User A requests refund
4. Refund granted → User A has money AND User B has ticket

**Impact:** Double spend vulnerability.

### 5. S2S Communication Completely Open (CRITICAL)

- All service clients use plain HTTP
- No authentication headers added
- Internal routes exposed without auth
- No service whitelist

**Evidence:**
```typescript
// Default URLs
http://tickettoken-event:3003
http://tickettoken-payment:3002
http://tickettoken-ticket:3004
```

---

## Quick Fix Code Snippets

### Enable JWT Authentication (CRITICAL)
```typescript
// app.ts - ADD THIS
import jwtAuthPlugin from './plugins/jwt-auth.plugin';

// Register BEFORE routes
app.register(jwtAuthPlugin);

// Then register routes
app.register(orderRoutes, { prefix: '/api/orders' });
```

### Fix JWT Secret (CRITICAL)
```typescript
// plugins/jwt-auth.plugin.ts
const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 32) {
  throw new Error('JWT_SECRET must be set and at least 32 characters');
}

// REMOVE the default fallback entirely
```

### Enable Internal Auth Middleware (CRITICAL)
```typescript
// middleware/index.ts
// UNCOMMENT this line:
export { internalAuthMiddleware } from './internal-auth.middleware';

// Apply to internal routes
app.register(async (instance) => {
  instance.addHook('preHandler', internalAuthMiddleware);
  instance.register(internalRoutes);
}, { prefix: '/internal' });
```

### Add Input Validation to Tax Routes (CRITICAL)
```typescript
// routes/tax.routes.ts
import Joi from 'joi';

const taxRateSchema = Joi.object({
  name: Joi.string().max(100).required(),
  rate: Joi.number().min(0).max(100).required(),
  country: Joi.string().length(2).required(),
  state: Joi.string().max(50).optional(),
  // ... other fields
}).unknown(false); // CRITICAL: Reject extra fields

app.post('/tax-rates', {
  schema: { body: taxRateSchema },
  preHandler: [authenticate, requireAdmin],
  handler: createTaxRate
});
```

### Add Transfer Check to Refund (CRITICAL)
```typescript
// services/refund.service.ts
async processRefund(orderId: string, userId: string) {
  const order = await this.orderModel.findById(orderId);
  
  // Check if ticket has been transferred
  const ticket = await this.ticketClient.getTicket(order.ticketId);
  if (ticket.ownerId !== order.originalBuyerId) {
    throw new ValidationError('Cannot refund transferred ticket');
  }
  
  // Check for active disputes
  if (order.hasDispute) {
    throw new ValidationError('Cannot refund order with active dispute');
  }
  
  // Proceed with refund...
}
```

### Add Dispute Webhook Handlers (CRITICAL)
```typescript
// webhooks/stripe.webhook.ts
async handleDisputeCreated(event: Stripe.Event) {
  const dispute = event.data.object as Stripe.Dispute;
  
  // Find and lock the order
  await db('orders')
    .where('stripe_payment_intent_id', dispute.payment_intent)
    .update({
      has_dispute: true,
      dispute_id: dispute.id,
      dispute_status: dispute.status,
      dispute_reason: dispute.reason,
      refund_locked: true
    });
  
  // Alert team
  await alerting.critical('DISPUTE_CREATED', {
    disputeId: dispute.id,
    amount: dispute.amount,
    reason: dispute.reason
  });
  
  // Start evidence collection
  await disputeService.collectEvidence(dispute.id);
}

async handleDisputeClosed(event: Stripe.Event) {
  const dispute = event.data.object as Stripe.Dispute;
  
  await db('orders')
    .where('dispute_id', dispute.id)
    .update({
      dispute_status: dispute.status,
      refund_locked: dispute.status !== 'won'
    });
  
  if (dispute.status === 'lost') {
    // Handle lost dispute - may need to reverse transfers
    await this.handleLostDispute(dispute);
  }
}
```

### Create .dockerignore (CRITICAL)
```bash
# Create .dockerignore
cat << 'IGNORE' > .dockerignore
.git
.gitignore
.env
.env.*
*.log
node_modules
npm-debug.log
coverage
.nyc_output
tests
__tests__
*.test.ts
*.spec.ts
docs
README.md
CHANGELOG.md
.vscode
.idea
*.md
Makefile
docker-compose*.yml
IGNORE
```

### Enable HTTPS for Service Clients (CRITICAL)
```typescript
// config/services.ts
export const serviceUrls = {
  event: process.env.EVENT_SERVICE_URL || 'https://tickettoken-event:3003',
  payment: process.env.PAYMENT_SERVICE_URL || 'https://tickettoken-payment:3002',
  ticket: process.env.TICKET_SERVICE_URL || 'https://tickettoken-ticket:3004',
};

// Enforce HTTPS in production
if (process.env.NODE_ENV === 'production') {
  Object.entries(serviceUrls).forEach(([name, url]) => {
    if (!url.startsWith('https://')) {
      throw new Error(`${name} service URL must use HTTPS in production`);
    }
  });
}
```
