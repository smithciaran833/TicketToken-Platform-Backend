# Venue-Service Audit Findings

**Generated:** 2025-12-28
**Audit Files Reviewed:** 18
**Total Findings:** 200 (121 FAIL, 79 PARTIAL)

---

## Summary by Severity

| Severity | FAIL | PARTIAL | Total |
|----------|------|---------|-------|
| CRITICAL | 12 | 2 | 14 |
| HIGH | 35 | 18 | 53 |
| MEDIUM | 55 | 42 | 97 |
| LOW | 19 | 17 | 36 |

---

## Summary by Audit File

| File | FAIL | PARTIAL | Total |
|------|------|---------|-------|
| 01-security.md | 4 | 5 | 9 |
| 02-input-validation.md | 5 | 5 | 10 |
| 03-error-handling.md | 5 | 9 | 14 |
| 04-logging-observability.md | 10 | 4 | 14 |
| 05-s2s-auth.md | 16 | 5 | 21 |
| 06-database-integrity.md | 6 | 4 | 10 |
| 07-idempotency.md | 11 | 2 | 13 |
| 08-rate-limiting.md | 7 | 5 | 12 |
| 09-multi-tenancy.md | 14 | 4 | 18 |
| 10-testing.md | 8 | 9 | 17 |
| 11-documentation.md | 6 | 6 | 12 |
| 12-health-checks.md | 2 | 4 | 6 |
| 13-graceful-degradation.md | 5 | 1 | 6 |
| 14-file-handling.md | 2 | 0 | 2 |
| 19-configuration-management.md | 9 | 8 | 17 |
| 20-deployment-cicd.md | 5 | 4 | 9 |
| 21-database-migrations.md | 4 | 3 | 7 |
| 29-resale-business-rules.md | 2 | 1 | 3 |

---

## CRITICAL Findings (14)

### From 01-security.md

#### SEC-R1: All protected routes use auth middleware
- **Status:** PARTIAL
- **Severity:** CRITICAL
- **Section:** 3.1: Route Layer
- **Issue:** `venue-stripe.routes.ts:19,28,38` - Stripe Connect routes have NO authentication (TODO comments only).
- **Evidence:** Most routes use `authenticate` preHandler.
- **Remediation:** Add `authenticate` and `requireVenueAccess` middleware.

#### SEC-DB6: API keys/tokens hashed
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.3: Database Layer
- **Evidence:** API `key` stored as plain string.
- **Remediation:** Hash with SHA-256, only return plaintext on creation.

### From 02-input-validation.md

#### RD1: All routes have schema validation
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1: Route Definition Checklist
- **Evidence:** `settings.controller.ts:54-57` - PUT endpoint imports but doesn't apply schema.
- **Remediation:** Add `validate(updateSettingsSchema)` to preHandler array.

#### SD6: No Type.Any() or equivalent
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.2: Schema Definition Checklist
- **Evidence:** `integration.schema.ts` - `.unknown(true)` allows arbitrary properties.
- **Remediation:** Define explicit credential schemas per provider.

### From 04-logging-observability.md

#### LC3: Redaction configured for sensitive fields
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1: Log Configuration Checklist
- **Remediation:** Add redaction paths for password, token, apiKey, secret, authorization header.

#### SD1-SD5: Passwords, tokens, PII, session tokens redacted
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.2: Sensitive Data Protection Checklist
- **Issue:** No redaction configuration.

### From 05-s2s-auth.md

#### SC2: Service credentials NOT hardcoded
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Service Client Checklist
- **Evidence:** Default secret in code: 'internal-service-secret-change-in-production'
- **Remediation:** Remove default value, fail startup if secret missing.

#### RS9: Service identity included in every request
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Service Client Checklist

#### SM2: No secrets in source code
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Secrets Management
- **Evidence:** Default secret value in code.

### From 07-idempotency.md

#### PF4: Stripe Connect operations use idempotencyKey
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Payment Flow Checklist
- **Evidence:** stripe.accounts.create() has no idempotencyKey option.
- **Remediation:** Add `idempotencyKey: 'connect:${venueId}:${Date.now()}'`

#### WH2-WH3: Webhook events table and deduplication
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Webhook Handler Checklist
- **Evidence:** No event.id deduplication check before processing.
- **Impact:** Duplicate webhooks cause duplicate operations.
- **Remediation:** Add migration for webhook_events table.

#### SC1-SC5: Idempotency implementation
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** State-Changing Operations Checklist
- **Evidence:** No idempotency storage, checks, or middleware.

### From 09-multi-tenancy.md

#### KQ1-KQ2: Transaction tenant context, SET LOCAL
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Knex Query Patterns
- **Evidence:** No SET LOCAL app.current_tenant_id in transactions.
- **Remediation:** Add `await trx.raw('SET LOCAL app.current_tenant_id = ?', [tenantId])`

#### KQ9: No hardcoded tenant IDs
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Knex Query Patterns
- **Evidence:** Default tenant fallback: '00000000-0000-0000-0000-000000000001'

#### JM2: Tenant extracted from verified JWT only
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** JWT Claims & Middleware
- **Evidence:** Fallback to default tenant allows bypass.

#### JM4-JM8: Tenant middleware
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** JWT Claims & Middleware
- **Evidence:** No dedicated tenant middleware. Controllers manually extract tenant with unsafe fallback.

#### AE1: All authenticated routes use tenant middleware
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** API Endpoints

### From 29-resale-business-rules.md

#### Price Controls
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Price Controls
- **Issue:** No price cap logic, No face_value field, No jurisdiction-specific rules, No artist policy integration

#### Transfer Limits
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** Transfer Limits
- **Issue:** No transfer count tracking, No max transfer limit field, No transfer history table
- **Evidence:** ticket_transfer_allowed flag exists but not enforced

#### Timing Rules
- **Status:** PARTIAL
- **Severity:** CRITICAL
- **Section:** Timing Rules
- **Evidence:** transfer_deadline_hours exists, timezone field exists
- **Issue:** No listing/purchase cutoff fields, No automatic cutoff at event start

---

## HIGH Findings (53)

### From 01-security.md

#### SEC-R13: HTTPS enforced
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.1: Route Layer
- **Issue:** No HTTPS redirect middleware found.

#### SEC-R14: HSTS header enabled
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.1: Route Layer
- **Evidence:** Helmet registered but no explicit HSTS config.
- **Remediation:** Add `hsts: { maxAge: 31536000 }` to helmet.

#### SEC-DB1: Database connection uses TLS
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.3: Database Layer
- **Remediation:** Add `ssl: { rejectUnauthorized: true }`.

### From 02-input-validation.md

#### RD3: Params schema defined with format validation
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.1: Route Definition Checklist
- **Issue:** Routes use `:venueId` but no UUID format validation on params.
- **Remediation:** Add `venueIdSchema` validation to all routes with venueId param.

#### RD5: Response schema defined
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.1: Route Definition Checklist
- **Issue:** No response schemas defined for any routes.
- **Remediation:** Add response schemas to prevent data leakage.

#### SD1: UUIDs validated with format validation
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.2: Schema Definition Checklist
- **Evidence:** `venueIdSchema` has UUID validation but not applied to routes.

### From 03-error-handling.md

#### RH3: Not Found handler registered
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.1: Route Handler Checklist
- **Remediation:** Add 404 handler with RFC 7807 format.

#### RH5: Error handler returns RFC 7807 Problem Details
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.1: Route Handler Checklist
- **Issue:** Custom format, missing `type`, `title`, `instance`, `detail` fields.
- **Remediation:** Use RFC 7807 format with `application/problem+json` content type.

#### RH6: Correlation ID included in all error responses
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.1: Route Handler Checklist
- **Evidence:** Request ID set but not propagated to error responses.
- **Remediation:** Add `correlation_id: request.id` to all error responses.

### From 04-logging-observability.md

#### LC4: Correlation ID middleware installed
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.1: Log Configuration Checklist
- **Evidence:** Request ID generated but not propagated as correlation ID.

#### FP5: Child loggers used for context
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.4: Fastify/Pino Configuration
- **Remediation:** Use `request.log.child({ venueId })` for context.

#### DT4: Trace ID in all logs
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.5: Distributed Tracing Checklist
- **Remediation:** Add OpenTelemetry Pino instrumentation.

### From 05-s2s-auth.md

#### SC1: Service uses mTLS OR signed tokens for outbound calls
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Service Client Checklist
- **Evidence:** httpClient.ts - No authentication headers added to outbound requests.

#### RS8: All internal HTTP calls use HTTPS/TLS
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** Service Client Checklist
- **Evidence:** Depends on baseURL param, no explicit HTTPS enforcement.

#### RS10: Correlation ID propagated to downstream
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Service Client Checklist
- **Remediation:** Add interceptor to include correlation ID.

#### NS13: HTTP client configured with TLS cert validation
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Node.js Specific

#### NS16: Client includes service identity header
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Node.js Specific

#### AE1: ALL endpoints require authentication
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** Service Endpoint Checklist
- **Evidence:** Stripe routes missing auth.

#### HM17: Request body included in signature
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** HMAC Verification
- **Evidence:** Body not included in signature payload.

#### HM18: Constant-time comparison
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** HMAC Verification
- **Evidence:** Uses string comparison, vulnerable to timing attacks.
- **Remediation:** Use crypto.timingSafeEqual()

### From 06-database-integrity.md

#### LK5: FOR UPDATE used for critical read-modify-write
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.2: Repository/Model Layer Checklist
- **Evidence:** No forUpdate() found.
- **Remediation:** Add locking for critical operations.

#### DC3: Statement timeout configured
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.4: Database Configuration
- **Remediation:** Add SET statement_timeout = 30000 in afterCreate hook.

#### DC6: SSL configured for production
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.4: Database Configuration

### From 07-idempotency.md

#### WH4-WH8: Processing status, async, payload storage, cleanup
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Webhook Handler Checklist

#### WH10: Concurrent handling prevented
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Webhook Handler Checklist
- **Evidence:** No locking mechanism for concurrent webhook processing.

#### VO5-VO7: Recovery points, resume capability, tenant scoping
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Venue Operations Checklist

#### VO8: Concurrent attempts return 409
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** Venue Operations Checklist
- **Evidence:** Slug uniqueness enforced at DB level.

### From 08-rate-limiting.md

#### FC8: onExceeded callback logs rate limit violations
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Fastify Rate Limit Configuration
- **Remediation:** Add `request.log.warn({ key, count, limit, type }, 'Rate limit exceeded')`

#### RH1-RH3: RateLimit-Limit/Remaining/Reset headers
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Response Header Verification
- **Remediation:** Add headers to all responses.

### From 09-multi-tenancy.md

#### RLS7: Both USING and WITH CHECK clauses
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** PostgreSQL RLS Configuration
- **Evidence:** Only USING clause, no WITH CHECK for INSERT.

#### KQ4-KQ5: JOINs and subqueries filter tenant
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** Knex Query Patterns
- **Evidence:** Relies on RLS, no explicit filtering.

#### KQ7: Raw SQL queries include tenant parameter
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Knex Query Patterns
- **Evidence:** internal-validation.routes.ts raw query without tenant filter.

#### AE7: Webhooks validate tenant context
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** API Endpoints

### From 10-testing.md

#### JC3: Coverage thresholds configured
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.1 Jest Configuration Checklist
- **Remediation:** Add coverageThreshold with 80% global minimums.

#### KT8: RLS policies verified
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.3 Knex Database Testing Checklist
- **Evidence:** No explicit RLS policy tests.

### From 11-documentation.md

#### PD1: README.md exists
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Project-Level Documentation
- **Evidence:** No README.md, SERVICE_OVERVIEW.md exists as alternative.

### From 13-graceful-degradation.md

#### RL1-RL3: Retry with exponential backoff
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Retry Logic
- **Remediation:** Add retry wrapper with exponential backoff and jitter.

### From 14-file-handling.md

#### URL validation
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** URL Reference Handling
- **Issue:** No domain allowlist

### From 19-configuration-management.md

#### CS1: Centralized config module
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Configuration Structure
- **Evidence:** Config scattered across database.ts, redis.ts, secrets.ts, index.ts.
- **Remediation:** Create config/index.ts with envalid validation.

#### CS5: No process.env scattered in code
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Configuration Structure
- **Evidence:** Direct process.env access in multiple files.

### From 20-deployment-cicd.md

#### SC1: Image scanning enabled
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Security Scanning
- **Remediation:** Add Trivy scanning to CI.

### From 21-database-migrations.md

#### lock_timeout
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Performance & Locking

#### CONCURRENTLY
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Performance & Locking

### From 29-resale-business-rules.md

#### No jurisdiction detection
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Price Controls

#### No resale approval
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Transfer Limits

#### No transfer history
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Transfer Limits

#### No price validation
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Price Controls

#### No seller verification
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Transfer Limits

---

## MEDIUM Findings (97)

### From 01-security.md

#### SEC-DB10: Logs don't contain sensitive data
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.3: Database Layer
- **Issue:** No PII masking.
- **Remediation:** Add email/phone redaction.

#### SEC-EXT2: Raw body for verification
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.4: External Integrations
- **Issue:** Fastify may parse JSON before webhook handler.
- **Remediation:** Register raw body parser for webhook route.

#### SEC-EXT4: Webhook idempotency
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.4: External Integrations
- **Issue:** No `event.id` deduplication.
- **Remediation:** Store processed event IDs in Redis.

#### SEC-EXT16: Secret rotation
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.4: External Integrations
- **Issue:** No rotation mechanism.

### From 02-input-validation.md

#### RD6: additionalProperties: false on all object schemas
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.1: Route Definition Checklist

#### RD7: Arrays have maxItems constraint
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.1: Route Definition Checklist

#### SEC1: Prototype pollution blocked
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.5: Security-Specific Checklist

#### SEC8: Unicode normalized
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** 3.5: Security-Specific Checklist
- **Remediation:** Add `.normalize('NFC')` for slug comparisons.

### From 03-error-handling.md

#### RH10: Response status matches Problem Details status field
- **Status:** PARTIAL
- **Severity:** MEDIUM

#### SL3: No empty catch blocks
- **Status:** PARTIAL
- **Severity:** MEDIUM

#### SL7: External errors wrapped with context
- **Status:** PARTIAL
- **Severity:** MEDIUM

#### DB4: Connection pool errors handled
- **Status:** PARTIAL
- **Severity:** MEDIUM

#### DB9: Connection pool has error event handler
- **Status:** FAIL
- **Severity:** MEDIUM
- **Remediation:** Add db.client.pool.on('error') handler.

#### ST2: Webhook handler returns 200 even on processing errors
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Issue:** Returns 500 on processing errors.
- **Remediation:** Return 200 after logging/queuing the error.

#### ST6: Webhook events deduplicated
- **Status:** FAIL
- **Severity:** MEDIUM
- **Remediation:** Store processed event IDs in Redis.

#### ST8: API version locked
- **Status:** PARTIAL
- **Severity:** MEDIUM

#### DS2: Correlation ID propagated in all service calls
- **Status:** PARTIAL
- **Severity:** MEDIUM

#### DS4: Circuit breaker implemented for external services
- **Status:** FAIL
- **Severity:** MEDIUM
- **Evidence:** Circuit breaker files exist but not applied to Stripe calls.
- **Remediation:** Wrap external service calls with circuit breaker.

#### DS8: Error responses include source service
- **Status:** PARTIAL
- **Severity:** MEDIUM

### From 04-logging-observability.md

#### SE9: Rate limiting exceeded
- **Status:** FAIL
- **Severity:** MEDIUM
- **Remediation:** Add logging on rate limit trigger.

#### FP2: request.log used instead of global logger
- **Status:** PARTIAL
- **Severity:** MEDIUM

#### M5: Default Node.js metrics enabled
- **Status:** FAIL
- **Severity:** MEDIUM
- **Remediation:** Add `collectDefaultMetrics()`.

#### M7: Label cardinality controlled
- **Status:** PARTIAL
- **Severity:** MEDIUM

#### AL4: Audit uses correlation ID
- **Status:** FAIL
- **Severity:** MEDIUM
- **Remediation:** Add correlation_id field to audit entry.

### From 05-s2s-auth.md

#### SC4: Each service has unique credentials
- **Status:** PARTIAL
- **Severity:** MEDIUM

#### SC6: Credential rotation automated
- **Status:** FAIL
- **Severity:** MEDIUM

#### AE6: Token issuer validated
- **Status:** PARTIAL
- **Severity:** MEDIUM

#### AZ9-AZ10: Per-endpoint authorization, service allowlist
- **Status:** FAIL
- **Severity:** MEDIUM
- **Remediation:** Add service allowlist per endpoint.

#### AZ12: No default-allow authorization
- **Status:** FAIL
- **Severity:** MEDIUM

#### HM19: Per-service secrets
- **Status:** FAIL
- **Severity:** MEDIUM

#### SM6: Each service has unique secrets
- **Status:** FAIL
- **Severity:** MEDIUM

#### SM7: Automatic rotation configured
- **Status:** FAIL
- **Severity:** MEDIUM

### From 06-database-integrity.md

#### MD6: CHECK constraints for valid ranges
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Remediation:** Add CHECK for royalty_percentage, max_capacity.

#### QP7: Atomic updates instead of read-modify-write
- **Status:** PARTIAL
- **Severity:** MEDIUM

#### MT10-MT11: tenant_id in queries, RLS context
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Remediation:** Set RLS context via SET app.current_tenant_id in middleware.

#### RC3: Handle serialization failures with retry
- **Status:** FAIL
- **Severity:** MEDIUM

#### RC5: Version column for optimistic locking
- **Status:** FAIL
- **Severity:** MEDIUM
- **Remediation:** Add version column to venues table.

#### DC4: Pool monitoring implemented
- **Status:** PARTIAL
- **Severity:** MEDIUM

#### DC5: Error handling for pool errors
- **Status:** FAIL
- **Severity:** MEDIUM

### From 07-idempotency.md

#### VO1-VO3: Idempotency-Key header support
- **Status:** FAIL
- **Severity:** MEDIUM

#### VO9-VO10: Payload fingerprinting, TTL
- **Status:** FAIL
- **Severity:** MEDIUM

#### SC8: Retryable errors allow same-key retry
- **Status:** PARTIAL
- **Severity:** MEDIUM

### From 08-rate-limiting.md

#### FC6: skipOnError for Redis unavailability
- **Status:** FAIL
- **Severity:** MEDIUM
- **Remediation:** Add try-catch with fail-open pattern.

#### FC9: Error response includes actionable information
- **Status:** PARTIAL
- **Severity:** MEDIUM

#### FC10: Ban option for repeat offenders
- **Status:** FAIL
- **Severity:** MEDIUM

#### RI1-RI3: Redis HA, pooling, timeout
- **Status:** PARTIAL
- **Severity:** MEDIUM

#### RI7-RI10: Memory limits, fallback, monitoring
- **Status:** FAIL
- **Severity:** MEDIUM

#### WE3: Separate limits per webhook source
- **Status:** PARTIAL
- **Severity:** MEDIUM

#### WE5: Async processing with queue
- **Status:** FAIL
- **Severity:** MEDIUM

#### HM2: Trusted proxy list configured
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Issue:** `trustProxy: true` trusts all, should be explicit list.

### From 09-multi-tenancy.md

#### RLS3-RLS4: Non-superuser role, no BYPASSRLS
- **Status:** PARTIAL
- **Severity:** MEDIUM

#### KQ3: No direct knex() calls - use wrapper
- **Status:** FAIL
- **Severity:** MEDIUM

#### KQ10: Query wrapper prevents dangerous patterns
- **Status:** FAIL
- **Severity:** MEDIUM

#### SR1: Redis keys prefixed with tenant
- **Status:** FAIL
- **Severity:** MEDIUM

#### SR4: Cache invalidation scoped to tenant
- **Status:** FAIL
- **Severity:** MEDIUM

#### SR7: Rate limiting per-tenant
- **Status:** FAIL
- **Severity:** MEDIUM

#### SR8: Resource quotas tracked per-tenant
- **Status:** FAIL
- **Severity:** MEDIUM

### From 10-testing.md

#### JC4: Coverage reports output to CI-readable format
- **Status:** PARTIAL
- **Severity:** MEDIUM

#### FT5: Error responses tested
- **Status:** PARTIAL
- **Severity:** MEDIUM

#### FT7: Response schema validated
- **Status:** PARTIAL
- **Severity:** MEDIUM

#### KT5: Transactions used for isolation
- **Status:** PARTIAL
- **Severity:** MEDIUM

#### KT7: Multi-tenant queries tested
- **Status:** PARTIAL
- **Severity:** MEDIUM

#### TC3: Test pyramid ratio
- **Status:** PARTIAL
- **Severity:** MEDIUM

#### MT1-MT6: E2E, Contract, Load, Security, Chaos, Stripe tests
- **Status:** FAIL
- **Severity:** MEDIUM

### From 11-documentation.md

#### PD2-PD5: CONTRIBUTING, CHANGELOG, LICENSE, SECURITY
- **Status:** FAIL
- **Severity:** MEDIUM

#### AD1: Architecture Decision Records
- **Status:** FAIL
- **Severity:** MEDIUM

#### AD2-AD5: C4 diagrams, data flow, network
- **Status:** PARTIAL
- **Severity:** MEDIUM

#### OD1-OD5: Runbooks, incident response, on-call, escalation, post-mortems
- **Status:** FAIL
- **Severity:** MEDIUM

#### RD4: Installation steps
- **Status:** FAIL
- **Severity:** MEDIUM

### From 12-health-checks.md

#### HE3: GET /health/startup
- **Status:** FAIL
- **Severity:** MEDIUM
- **Remediation:** Add /health/startup to verify initial config.

#### SC3: No version numbers exposed
- **Status:** FAIL
- **Severity:** MEDIUM
- **Evidence:** Version in health response.
- **Remediation:** Remove or require auth for /health/full.

### From 13-graceful-degradation.md

#### BH1: Bulkhead isolation
- **Status:** FAIL
- **Severity:** MEDIUM
- **Remediation:** Add semaphore for isolating external calls.

#### FB1: Fallback methods defined
- **Status:** PARTIAL
- **Severity:** MEDIUM

### From 14-file-handling.md

#### URL sanitization
- **Status:** FAIL
- **Severity:** MEDIUM
- **Issue:** URLs stored directly

### From 19-configuration-management.md

#### RV1: No secrets in git history
- **Status:** PARTIAL
- **Severity:** MEDIUM

#### RV4: Pre-commit hooks installed
- **Status:** FAIL
- **Severity:** MEDIUM

#### RV5: CI/CD secret scanning
- **Status:** PARTIAL
- **Severity:** MEDIUM

#### CS3: Type-safe configuration
- **Status:** PARTIAL
- **Severity:** MEDIUM

#### SK5: Rotation procedure documented
- **Status:** FAIL
- **Severity:** MEDIUM

#### JW2: Key rotation procedure
- **Status:** FAIL
- **Severity:** MEDIUM

#### DC4: SSL/TLS required
- **Status:** FAIL
- **Severity:** MEDIUM
- **Remediation:** Add sslmode=require to database config.

#### RC2: TLS enabled
- **Status:** FAIL
- **Severity:** MEDIUM

#### LS1-LS3: No secrets in logs, sanitization
- **Status:** PARTIAL/FAIL
- **Severity:** MEDIUM
- **Remediation:** Add Pino redact configuration.

#### RL1-RL4: Rotation schedule, testing, automation, monitoring
- **Status:** FAIL
- **Severity:** MEDIUM

### From 20-deployment-cicd.md

#### BI2: Base image version pinned
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Remediation:** Use node:20-alpine@sha256:...

#### BS6: Using npm ci
- **Status:** FAIL
- **Severity:** MEDIUM
- **Remediation:** Use npm ci --only=production.

#### PS1: Workflow files exist
- **Status:** FAIL
- **Severity:** MEDIUM

#### SC2-SC3: Secret scanning, dependency scanning
- **Status:** PARTIAL
- **Severity:** MEDIUM

#### DS3: Rollback procedure documented
- **Status:** FAIL
- **Severity:** MEDIUM

### From 21-database-migrations.md

#### One logical change per file
- **Status:** PARTIAL
- **Severity:** MEDIUM

#### Batched data
- **Status:** PARTIAL
- **Severity:** MEDIUM

#### pool.min
- **Status:** FAIL
- **Severity:** MEDIUM
- **Issue:** 2, should be 0

### From 29-resale-business-rules.md

#### No anti-scalping measures
- **Status:** FAIL
- **Severity:** MEDIUM

#### No fraud prevention
- **Status:** FAIL
- **Severity:** MEDIUM

#### Basic settings only
- **Status:** PARTIAL
- **Severity:** MEDIUM

---

## LOW Findings (36)

### From 01-security.md

#### Cookie security config
- **Status:** PARTIAL
- **Severity:** LOW
- **Issue:** No explicit cookie security config

### From 03-error-handling.md

#### Job error handling
- **Status:** N/A
- **Severity:** LOW

### From 04-logging-observability.md

#### LC6: Timestamps in ISO 8601 format
- **Status:** PARTIAL
- **Severity:** LOW
- **Remediation:** Add `timestamp: pino.stdTimeFunctions.isoTime`.

#### DT8: Sampling configured for production
- **Status:** FAIL
- **Severity:** LOW
- **Remediation:** Add sampler config for high-traffic production.

### From 05-s2s-auth.md

#### AL14: Correlation ID logged
- **Status:** FAIL
- **Severity:** LOW

### From 06-database-integrity.md

#### Down migrations may not be tested
- **Status:** PARTIAL
- **Severity:** LOW

### From 07-idempotency.md

#### No monitoring
- **Status:** FAIL
- **Severity:** LOW

#### No audit logging for replays
- **Status:** FAIL
- **Severity:** LOW

### From 08-rate-limiting.md

#### RH7: 429 body includes documentation link
- **Status:** FAIL
- **Severity:** LOW

#### RI7-RI10: Separate Redis instance
- **Status:** FAIL
- **Severity:** LOW

### From 09-multi-tenancy.md

#### No multi-tenant user support
- **Status:** FAIL
- **Severity:** LOW

#### Tenant context not in AsyncLocalStorage
- **Status:** FAIL
- **Severity:** LOW

### From 10-testing.md

#### TQ6: Tests are deterministic
- **Status:** PARTIAL
- **Severity:** LOW

#### TI3: CI-ready configuration
- **Status:** PARTIAL
- **Severity:** LOW

### From 11-documentation.md

#### AP4: Versioning strategy
- **Status:** PARTIAL
- **Severity:** LOW

#### AP6: Error codes documented
- **Status:** PARTIAL
- **Severity:** LOW

#### ON1: Onboarding guide
- **Status:** PARTIAL
- **Severity:** LOW

#### RD3: Prerequisites listed
- **Status:** PARTIAL
- **Severity:** LOW

### From 12-health-checks.md

#### PG4: Query timeout configured
- **Status:** PARTIAL
- **Severity:** LOW
- **Remediation:** Add Promise.race with 2s timeout.

#### RD2: Timeout configured
- **Status:** PARTIAL
- **Severity:** LOW

#### SC2: No internal hostnames
- **Status:** PARTIAL
- **Severity:** LOW
- **Evidence:** RabbitMQ host exposed.

#### SC5: Detailed endpoints restricted
- **Status:** PARTIAL
- **Severity:** LOW

### From 13-graceful-degradation.md

#### PC6: Statement timeout configured
- **Status:** FAIL
- **Severity:** LOW
- **Remediation:** Add SET statement_timeout = 30000 in afterCreate hook.

#### PC7: Pool monitoring
- **Status:** FAIL
- **Severity:** LOW

### From 19-configuration-management.md

#### SK1: Secret keys in secrets manager
- **Status:** PARTIAL
- **Severity:** LOW

#### JW1: RS256 private key secured
- **Status:** PARTIAL
- **Severity:** LOW

#### DC2: Unique credentials per service
- **Status:** PARTIAL
- **Severity:** LOW

#### DC3: Least privilege access
- **Status:** PARTIAL
- **Severity:** LOW

### From 20-deployment-cicd.md

#### BS5: Package cache cleared
- **Status:** PARTIAL
- **Severity:** LOW

#### DI6: Missing items in .dockerignore
- **Status:** PARTIAL
- **Severity:** LOW

### From 21-database-migrations.md

#### Timestamp prefix
- **Status:** PARTIAL
- **Severity:** LOW
- **Issue:** Uses 001_ instead

#### Missing rollback docs
- **Status:** FAIL
- **Severity:** LOW

#### No migration tests
- **Status:** FAIL
- **Severity:** LOW

### From 29-resale-business-rules.md

#### Settings not exposed via API
- **Status:** FAIL
- **Severity:** LOW

#### No documentation
- **Status:** FAIL
- **Severity:** LOW

---

## Quick Fix Code Snippets

### RLS Context (CRITICAL)
```typescript
// Add to tenant middleware
await trx.raw('SET LOCAL app.current_tenant_id = ?', [tenantId]);
```

### Remove Default Tenant Fallback (CRITICAL)
```typescript
// REMOVE THIS:
const tenantId = request.user?.tenantId || '00000000-0000-0000-0000-000000000001';

// REPLACE WITH:
const tenantId = request.user?.tenantId;
if (!tenantId) {
  throw new UnauthorizedError('Missing tenant context');
}
```

### Hash API Keys (CRITICAL)
```typescript
import { createHash } from 'crypto';

function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}
```

### Stripe Idempotency Key (CRITICAL)
```typescript
await stripe.accounts.create({
  // ... params
}, {
  idempotencyKey: `connect:${venueId}:${Date.now()}`
});
```

### Webhook Deduplication (CRITICAL)
```sql
CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id VARCHAR(255) UNIQUE NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  processed_at TIMESTAMP DEFAULT NOW(),
  tenant_id UUID REFERENCES tenants(id)
);
```

### Log Redaction (CRITICAL)
```typescript
const logger = pino({
  redact: ['password', 'token', 'apiKey', 'secret', 'authorization', 'req.headers.authorization']
});
```

### Constant-Time Comparison (HIGH)
```typescript
import { timingSafeEqual } from 'crypto';

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
```

### Statement Timeout (HIGH)
```typescript
pool.on('connect', async (client) => {
  await client.query('SET statement_timeout = 30000');
});
```

### Rate Limit Headers (HIGH)
```typescript
reply.header('RateLimit-Limit', limit);
reply.header('RateLimit-Remaining', remaining);
reply.header('RateLimit-Reset', resetTime);
```
