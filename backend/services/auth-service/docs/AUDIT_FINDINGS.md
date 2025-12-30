# Auth-Service Audit Findings

**Generated:** 2025-12-28
**Audit Files Reviewed:** 18
**Total Findings:** 221 (118 FAIL, 103 PARTIAL)

---

## Summary by Severity

| Severity | FAIL | PARTIAL | Total |
|----------|------|---------|-------|
| CRITICAL | 10 | 0 | 10 |
| HIGH | 52 | 38 | 90 |
| MEDIUM | 45 | 52 | 97 |
| LOW | 11 | 13 | 24 |

---

## Summary by Audit File

| File | Pass Rate | FAIL | PARTIAL | Total |
|------|-----------|------|---------|-------|
| 01-security.md | 87% | 1 | 7 | 8 |
| 02-input-validation.md | 90% | 2 | 3 | 5 |
| 03-error-handling.md | 47% | 12 | 11 | 23 |
| 04-logging-observability.md | 66% | 1 | 9 | 10 |
| 05-s2s-auth.md | 61% | 5 | 9 | 14 |
| 06-database-integrity.md | 79% | 2 | 4 | 6 |
| 07-idempotency.md | 0% | 4 | 2 | 6 |
| 08-rate-limiting.md | 58% | 4 | 6 | 10 |
| 09-multi-tenancy.md | 88% | 2 | 2 | 4 |
| 10-testing.md | 87% | 2 | 1 | 3 |
| 11-documentation.md | 54% | 16 | 10 | 26 |
| 12-health-checks.md | 58% | 5 | 3 | 8 |
| 13-graceful-degradation.md | 45% | 15 | 3 | 18 |
| 19-configuration-management.md | 72% | 4 | 8 | 12 |
| 20-deployment-cicd.md | 52% | 12 | 4 | 16 |
| 21-database-migrations.md | 70% | 10 | 6 | 16 |
| 25-compliance-legal.md | 62% | 20 | 15 | 35 |
| 37-wallet-key-management.md | 85% | 1 | 1 | 2 |

---

## CRITICAL Findings (10)

### From 03-error-handling.md

#### RH3: NotFound handler registered
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1: Route Handler
- **Issue:** No `setNotFoundHandler` exists.
- **Remediation:** Add 404 handler with RFC 7807 format.

#### DB4: Connection pool errors handled
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.3: Database
- **Issue:** No `pool.on('error')` handler.
- **Remediation:** Add pool error event handler.

#### DB9: Pool error event handler
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.3: Database
- **Issue:** (Same as DB4)

#### DS4: Circuit breaker
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.5: Distributed Systems
- **Issue:** None implemented.
- **Remediation:** Add circuit breaker for external services.

#### unhandledRejection handler
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.6: Process-Level
- **Issue:** Missing - unhandled rejections will crash process.
- **Remediation:**
```typescript
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason });
});
```

#### uncaughtException handler
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.6: Process-Level
- **Issue:** Missing - uncaught exceptions will crash process.
- **Remediation:**
```typescript
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error });
  process.exit(1);
});
```

### From 04-logging-observability.md

#### DT1-DT8: OpenTelemetry
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.5: Distributed Tracing
- **Issue:** No distributed tracing implemented whatsoever.
- **Remediation:**
```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

const sdk = new NodeSDK({
  serviceName: 'auth-service',
  instrumentations: [getNodeAutoInstrumentations()]
});
sdk.start();
```

### From 08-rate-limiting.md

#### RateLimit-Limit header
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.5: Response Headers
- **Issue:** Missing rate limit response header.

#### RateLimit-Remaining header
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.5: Response Headers
- **Issue:** Missing rate limit response header.

#### RateLimit-Reset header
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.5: Response Headers
- **Issue:** Missing rate limit response header.

### From 09-multi-tenancy.md

#### SET LOCAL app.current_tenant_id
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.3: Database Queries
- **Issue:** RLS policies defined but context never set.
- **Remediation:**
```typescript
await pool.query(`SET LOCAL app.current_tenant_id = '${tenantId}'`);
```

### From 13-graceful-degradation.md

#### GD-HC5: Circuit breaker
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.2: HTTP Clients
- **Issue:** No circuit breaker implementation.

#### GD-CB1-CB5: All circuit breaker checks
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.6: Circuit Breaker
- **Issue:** No circuit breaker implementation.
- **Remediation:** Implement opossum circuit breaker.

### From 20-deployment-cicd.md

#### CD-P1: CI/CD pipeline exists
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1: CI/CD Pipeline Configuration
- **Issue:** No CI/CD pipeline defined for auth-service.
- **Evidence:** No .github, .gitlab-ci.yml, or Jenkinsfile found.
- **Remediation:** Create .github/workflows/ci.yml with build, test, scan, deploy stages.

#### CD-P2: Pipeline configuration is version controlled
- **Status:** FAIL
- **Severity:** CRITICAL
- **Section:** 3.1: CI/CD Pipeline Configuration
- **Issue:** No pipeline config files exist to version control.

---

## HIGH Findings

### From 01-security.md

#### SEC-R14: HSTS header enabled
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.1: Route Layer
- **Issue:** Strict-Transport-Security header not set.
- **Remediation:** Add `@fastify/helmet` with HSTS config.

#### SEC-DB1: Database connection uses TLS
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.3: Database Layer
- **Issue:** No explicit SSL config in code.
- **Remediation:** Add SSL config to pg pool with `rejectUnauthorized: true`.

#### SEC-EXT8: Private keys encrypted at rest
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.4: External Integrations
- **Issue:** JWT private keys stored in plaintext files.
- **Remediation:** Use HSM, AWS KMS, or HashiCorp Vault.

#### SEC-EXT9: Keys loaded from secure storage
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.4: External Integrations
- **Issue:** JWT keys from filesystem while other secrets use secrets manager.
- **Remediation:** Load JWT keys from secrets manager.

### From 02-input-validation.md

#### RD5: Response schema defined
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.1: Route Definition
- **Issue:** No response schemas - controllers return raw objects.
- **Remediation:** Add Fastify response schemas to prevent accidental data leakage.

### From 03-error-handling.md

#### RH2: Error handler registered BEFORE routes
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.1: Route Handler
- **Issue:** Error handler registered AFTER routes in app.ts.
- **Remediation:** Move `setErrorHandler` before `app.register(authRoutes)`.

#### RH5: RFC 7807 Problem Details format
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.1: Route Handler
- **Issue:** Returns `{error: message}` not `{type, title, status, detail, instance}`.
- **Remediation:** Implement RFC 7807 format with `application/problem+json` content type.

#### RH6: Correlation ID in error responses
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.1: Route Handler
- **Issue:** `x-request-id` header accepted but not included in response body.
- **Remediation:** Add `correlation_id: request.id` to all error responses.

#### DS2: Correlation ID propagated
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.5: Distributed Systems
- **Issue:** Not passed to downstream services.

#### DB1: Queries wrapped in try/catch
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.3: Database
- **Issue:** `profile.controller.ts` has unwrapped queries.
- **Evidence:** `profile.controller.ts`
- **Remediation:** Wrap all queries.

#### DS1: Correlation ID generated
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.5: Distributed Systems
- **Issue:** Accepts but doesn't generate if missing.

### From 04-logging-observability.md

#### LC4: Correlation ID middleware
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.1: Log Configuration
- **Issue:** Accepts `x-request-id` but doesn't generate if missing or propagate to child loggers.
- **Remediation:** Add middleware to generate and propagate correlation IDs.

#### SE2: Logout
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.3: Security Event Logging
- **Issue:** No explicit logout audit method.
- **Remediation:** Add `logLogout()` to AuditService.

#### SE4: MFA enable/disable
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.3: Security Event Logging
- **Issue:** `logMFAEnabled()` exists but not `logMFADisabled()`.
- **Remediation:** Add MFA disable audit.

#### SE7: Session events
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.3: Security Event Logging
- **Issue:** Revocation logged, creation not explicitly audited.

#### M2: HTTP request rate
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.6: Metrics
- **Issue:** Only auth-specific counters, no general HTTP metrics.
- **Remediation:** Add `fastify-metrics` plugin.

### From 05-s2s-auth.md

#### Check 10: Correlation ID propagation
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Service Client Checklist
- **Issue:** No correlation ID forwarding in any HTTP client.
- **Remediation:** Add correlation ID to all outbound requests.

#### Check 11-12: Timeouts/Circuit breaker
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Service Client Checklist
- **Issue:** No circuit breaker.

#### Check 8: Service identity verified
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Service Endpoint Checklist
- **Issue:** No S2S service identity verification middleware.
- **Remediation:**
```typescript
async function verifyServiceToken(request, reply) {
  const serviceToken = request.headers['x-service-token'];
  const decoded = jwt.verify(serviceToken, servicePublicKey);
  if (!allowedServices.includes(decoded.sub)) {
    throw new Error('Unauthorized service');
  }
  request.callerService = decoded.sub;
}
```

#### Check 10: Service allowlist
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** Service Endpoint Checklist
- **Issue:** No service ACL for internal endpoints.
- **Remediation:** Implement service-level allowlists.

#### Check 1: All endpoints require auth
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** Service Endpoint Checklist
- **Issue:** No separate internal endpoint protection.
- **Evidence:** Public routes exist (login, register, etc.) - intentional.
- **Remediation:** Add S2S middleware for internal-only endpoints if any exist.

#### Check 2: Auth middleware applied globally
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** Service Endpoint Checklist
- **Issue:** Applied to route group, public routes outside.

#### Check 19: JWT secret from secrets manager
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** Service Endpoint Checklist
- **Issue:** Keys loaded from files, not secrets manager.
- **Remediation:** Migrate JWT keys to secrets manager.

#### Check 8: Public key retrieved securely
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** JWT Identity Verification
- **Issue:** From file, not key vault.

### From 06-database-integrity.md

#### Partial Unique Index
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.1: Soft Delete
- **Issue:** Email unique constraint is full, not partial. Soft-deleted users block email reuse.
- **Remediation:**
```sql
DROP INDEX users_email_unique;
CREATE UNIQUE INDEX idx_users_email_active ON users (email) WHERE deleted_at IS NULL;
```

#### RLS Context Set
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.2: Multi-Tenant Queries
- **Issue:** RLS policies exist but `app.current_tenant_id` not set in middleware.
- **Remediation:**
```typescript
await pool.query(`SET app.current_tenant_id = '${tenantId}'`);
await pool.query(`SET app.current_user_id = '${userId}'`);
```

### From 07-idempotency.md

#### Check 1: POST endpoints support idempotency keys
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** State-Changing Operations
- **Issue:** No `Idempotency-Key` header handling.
- **Remediation:** Add idempotency middleware for register, forgot-password, MFA setup.

#### Check 3-10: Atomicity, replay headers, tenant scoping, etc.
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** State-Changing Operations
- **Issue:** No idempotency system to evaluate.

#### Check 2: Persistent idempotency storage
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** State-Changing Operations
- **Issue:** Redis available but not used for idempotency.

### From 08-rate-limiting.md

#### CAPTCHA after N failures
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.3: Auth Endpoints
- **Issue:** No CAPTCHA integration.
- **Remediation:** Add CAPTCHA after 3 failed attempts.

#### /auth/verify-otp strict limits
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.3: Auth Endpoints
- **Issue:** No OTP-specific rate limiter.
- **Remediation:** Add 5 attempts per 5 minutes for OTP.

### From 09-multi-tenancy.md

#### Redis keys tenant-prefixed
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.4: Redis Isolation
- **Issue:** Keys like `login:192.168.1.1` have no tenant prefix.
- **Remediation:**
```typescript
const fullKey = `tenant:${tenantId}:${this.keyPrefix}:${key}`;
```

### From 11-documentation.md

#### DOC-P1: README.md
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.1: Project-Level Documentation
- **Issue:** No README.md exists.

#### DOC-API2: Swagger UI accessible
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.3: API Documentation
- **Issue:** No /docs endpoint.

#### DOC-OP1: Runbooks
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.4: Operational Documentation
- **Issue:** No runbooks exist.

#### DOC-API1: OpenAPI/Swagger exists
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.3: API Documentation
- **Issue:** NOT registered in app.ts - Swagger inactive.
- **Evidence:** `swagger.ts` config exists, dependencies installed.

### From 12-health-checks.md

#### HC-F3: /health/startup
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.1: Fastify Health Checks
- **Issue:** No startup probe endpoint.

#### HC-F7: @fastify/under-pressure
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.1: Fastify Health Checks
- **Issue:** Not installed.

#### HC-F1: /health/live (liveness)
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.1: Fastify Health Checks
- **Issue:** MonitoringService.setupMonitoring() NOT called - endpoints not registered.
- **Evidence:** `/health` exists in app.ts, `/live` in monitoring.service.ts.

#### HC-F2: /health/ready (readiness)
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.1: Fastify Health Checks
- **Issue:** Same - exists but not registered.

### From 13-graceful-degradation.md

#### GD-F9: Request timeout
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.1: Fastify Server
- **Issue:** No connectionTimeout, keepAliveTimeout, requestTimeout.

#### GD-F10: Body size limits
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.1: Fastify Server
- **Issue:** No body size limits configured.

#### GD-HC3-HC4: Retry with backoff/jitter
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.2: HTTP Clients
- **Issue:** No retry with backoff implemented.

#### GD-PG3: Statement timeout
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.4: PostgreSQL
- **Issue:** No statement timeout configured.

#### GD-PG6: Transaction timeout
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.4: PostgreSQL
- **Issue:** No transaction timeout configured.

#### GD-BH1-BH2: All bulkhead checks
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.7: Bulkhead
- **Issue:** No bulkhead pattern implemented.

### From 19-configuration-management.md

#### CM-R4: Pre-commit hooks
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.1: Repository & Version Control
- **Issue:** No git-secrets or detect-secrets.

#### CM-JWT2: Key rotation
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.4: JWT Secrets
- **Issue:** No key rotation mechanism.

#### CM-R5: CI secret scanning
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.1: Repository & Version Control
- **Issue:** No CI secret scanning.

#### CM-JWT1: Private key secured
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.4: JWT Secrets
- **Issue:** Keys from filesystem, not secrets manager.

### From 20-deployment-cicd.md

#### CD-P5: Secret scanning in CI pipeline
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.1: CI/CD Pipeline Configuration
- **Issue:** No CI pipeline to run secret scanning.
- **Remediation:** Add gitleaks or trufflehog to CI.

#### CD-P6: SAST enabled
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.1: CI/CD Pipeline Configuration
- **Issue:** No static analysis in CI.

#### CD-P8: Container image scanning
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.1: CI/CD Pipeline Configuration
- **Issue:** No Trivy or similar scanner in pipeline.
- **Remediation:** Add Trivy scan step in CI.

#### CD-E1: Production requires approval
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.3: Deployment Safeguards
- **Issue:** No CI/CD pipeline with approval gates.
- **Remediation:** Add GitHub Environment protection rules.

#### CD-S3: Rollback procedure documented
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.3: Deployment Safeguards
- **Issue:** No rollback procedures documented.
- **Remediation:** Create docs/ROLLBACK.md

### From 21-database-migrations.md

#### MIG-PL1: Large table operations use CONCURRENTLY
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.1: Performance & Locking
- **Issue:** On existing tables with data, this blocks all writes.
- **Evidence:** Indexes created without CONCURRENTLY.
- **Remediation:** Use CREATE INDEX CONCURRENTLY for production.

#### MIG-PL3: lock_timeout set for operations on busy tables
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.1: Performance & Locking
- **Issue:** No lock_timeout set before DDL operations.
- **Remediation:** Add at start of up(): SET lock_timeout = '5s'

#### MIG-PL4: Index creation uses CREATE INDEX CONCURRENTLY
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.1: Performance & Locking
- **Issue:** 15+ indexes created without CONCURRENTLY.

#### MIG-CI3: Production requires approval gate
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.2: CI/CD Integration
- **Issue:** No production approval gate for migrations.

### From 25-compliance-legal.md

#### CL-ACC1: Ability to export all user data
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.3: Right of Access (Article 15)
- **Issue:** No /gdpr/export endpoint.
- **Evidence:** REMEDIATION_PLAN.md identifies this as a gap.

#### CL-ACC2: Machine-readable format available
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.3: Right of Access (Article 15)
- **Issue:** No machine-readable export format.

#### CL-ACC3: Copy provided within 30 days
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.3: Right of Access (Article 15)
- **Issue:** No process to provide data within 30 days.

#### CL-PORT1: Export in machine-readable format
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.3: Right to Data Portability (Article 20)
- **Issue:** No data portability export.

#### CL-PORT2: Commonly used, structured format (JSON, CSV)
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.3: Right to Data Portability (Article 20)
- **Issue:** No structured export format.

#### CL-CONW1: Easy mechanism to withdraw consent
- **Status:** FAIL
- **Severity:** HIGH
- **Section:** 3.4: Consent Withdrawal
- **Issue:** No consent withdrawal mechanism.
- **Remediation:** Add PUT /api/auth/consent endpoint.

#### CL-RET1: Documented retention periods for ALL data categories
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.2: Data Retention Policy
- **Issue:** Not all data categories documented.
- **Evidence:** cleanup_expired_data() function has rules (sessions 30 days, audit logs 7 years).

#### CL-ERA1: Complete deletion workflow implemented
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.3: Right to Erasure (Article 17)
- **Issue:** Not yet implemented.
- **Evidence:** REMEDIATION_PLAN.md proposes soft delete but not yet implemented.

#### CL-ERA2: All data locations mapped and included
- **Status:** PARTIAL
- **Severity:** HIGH
- **Section:** 3.3: Right to Erasure (Article 17)
- **Issue:** wallet_connections, oauth_connections not addressed.
- **Evidence:** Users anonymized but wallet_connections, oauth_connections not addressed.

---

## MEDIUM Findings

### From 01-security.md

#### SEC-R12: General API rate limiting exists
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.1: Route Layer
- **Issue:** No global catch-all rate limiter at service level.
- **Remediation:** Add global rate limiter middleware in app.ts.

#### SEC-R13: HTTPS enforced in production
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.1: Route Layer
- **Issue:** No code-level HTTPS enforcement.
- **Remediation:** Add redirect middleware or verify at API Gateway level.

#### SEC-EXT16: Secret rotation capability
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.4: External Integrations
- **Issue:** keyid support exists but no active rotation mechanism.
- **Remediation:** Implement JWKS endpoint with key rotation.

### From 02-input-validation.md

#### SEC8: Unicode normalized
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** 3.5: Security-Specific
- **Issue:** No `.normalize('NFC')` before string comparison.
- **Remediation:** Add normalization to email/username before storage/comparison.

#### SD5: Phone numbers have pattern
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.2: Schema Definition
- **Issue:** `phone: Joi.string().max(20)` - no format validation.
- **Remediation:** Add E.164 pattern: `.pattern(/^\+?[1-9]\d{1,14}$/)`.

#### SL5: Cross-field validation
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.3: Service Layer
- **Issue:** No check that newPassword != currentPassword.
- **Remediation:** Add comparison in `changePassword` service.

### From 03-error-handling.md

#### DB8: Query timeouts configured
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** 3.3: Database
- **Issue:** No `statement_timeout` in pool config.
- **Remediation:** Add 30s timeout.

#### RH7: Stack traces not exposed in production
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.1: Route Handler
- **Issue:** Raw error messages exposed for 500 errors.
- **Remediation:** Use generic "Internal server error" for 5xx.

#### SL5: Error codes documented
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.2: Service Layer
- **Issue:** No `code` property for machine-readable identification.
- **Remediation:** Add `code` to each error class.

#### SL7: External errors wrapped
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.2: Service Layer
- **Issue:** Some external errors not wrapped with full context.

#### SL8: Timeouts for I/O operations
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.2: Service Layer
- **Issue:** No explicit timeout config found.

#### DB7: FK violations = 400/422
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.3: Database
- **Issue:** Only tenant FK explicitly validated.

#### DS3: Correlation ID in logs
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.5: Distributed Systems
- **Issue:** Incomplete correlation ID logging.

#### DS9: Health checks verify dependencies
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.5: Distributed Systems
- **Issue:** Doesn't check DB/Redis connectivity.
- **Remediation:** Add dependency health checks.

#### DS10: Graceful degradation
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.5: Distributed Systems
- **Issue:** Graceful shutdown exists, not runtime degradation.

#### DS5: Inter-service timeouts
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** 3.5: Distributed Systems
- **Issue:** No inter-service timeouts.

#### DS6: Retry with exponential backoff
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** 3.5: Distributed Systems
- **Issue:** No retry with backoff.

### From 04-logging-observability.md

#### SD9: Error stack traces controlled
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.2: Sensitive Data Protection
- **Issue:** Stack traces included in all environments.
- **Remediation:** Exclude stacks in production.

#### SE15: Config changes
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.3: Security Event Logging
- **Issue:** No config change logging.

#### M4: Error rate trackable
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.6: Metrics
- **Issue:** No status_code labels on HTTP metrics.

#### M8: Histogram buckets
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.6: Metrics
- **Issue:** Uses default buckets.
- **Remediation:** Add explicit buckets for auth operations.

### From 05-s2s-auth.md

#### Check 7: Automatic rotation
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** Secrets Management
- **Issue:** No automatic secret rotation.
- **Remediation:** Implement automated rotation.

#### Check 1: mTLS or signed tokens for outbound calls
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** Service Client Checklist
- **Issue:** No explicit S2S client auth for potential downstream calls.

#### Check 4: Unique credentials per service
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** Service Client Checklist
- **Issue:** JWT signing keys used for both user and potentially service tokens.
- **Remediation:** Separate key pairs for user vs service tokens.

#### Check 6: Automated credential rotation
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** Service Client Checklist
- **Issue:** `keyid: '1'` prepared but no automation.
- **Remediation:** Implement JWKS endpoint + rotation.

#### Check 3: No secrets in env vars (prod)
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** Secrets Management
- **Issue:** `JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-change-in-production'`
- **Remediation:** Remove defaults, require secrets manager in prod.

#### Check 8: Secret access audited
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** Secrets Management
- **Issue:** Secret access not fully audited.

### From 06-database-integrity.md

#### FOR UPDATE on Critical Operations
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.2: Locking
- **Issue:** Session revocation and similar operations don't use FOR UPDATE.
- **Remediation:**
```typescript
const sessionResult = await pool.query(
  `SELECT * FROM user_sessions WHERE id = $1 FOR UPDATE`,
  [sessionId]
);
```

#### Statement Timeout
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.5: Knex.js Config
- **Issue:** No query timeout configured.
- **Remediation:**
```typescript
pool.on('connect', async (client) => {
  await client.query('SET statement_timeout = 30000');
});
```

### From 07-idempotency.md

#### Password Reset
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** Auth-Specific Operations
- **Issue:** Each request generates new token, sends new email.
- **Remediation:** Deduplicate within 5-min window using Redis.

#### MFA Setup
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** Auth-Specific Operations
- **Issue:** Each call generates new secret.
- **Remediation:** Track pending MFA setup in Redis, return same secret within window.

#### Check 2: Persistent idempotency storage
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** State-Changing Operations
- **Issue:** Redis available but not used for idempotency.

### From 08-rate-limiting.md

#### skipOnError for fail-open
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.1: Fastify Configuration
- **Issue:** Not configured - undefined behavior if Redis down.
- **Remediation:** Add `skipOnError: true`.

#### onExceeded logging
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.1: Fastify Configuration
- **Issue:** No logging when rate limit exceeded.
- **Remediation:** Add `logger.warn()` before throwing.

#### Retry-After on 429
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.5: Response Headers
- **Issue:** TTL available in error but not set as header.
- **Remediation:**
```typescript
if (error instanceof RateLimitError && error.ttl) {
  reply.header('Retry-After', error.ttl);
}
```

#### 429 body quality
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.5: Response Headers
- **Issue:** Human-readable but no machine-readable code.

#### Trusted proxy list
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.7: Header Protection
- **Issue:** `trustProxy: true` trusts all.
- **Remediation:** Explicit IP list in production.

### From 09-multi-tenancy.md

#### Non-superuser database role
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.1: PostgreSQL RLS
- **Issue:** Default is 'postgres' - verify production uses app_user without BYPASSRLS.

#### Tenant ID format validated
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.2: JWT & Middleware
- **Issue:** No UUID format validation.
- **Remediation:** Add `isUUID(tenant_id)` check.

### From 10-testing.md

#### Coverage thresholds
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** 3.1: Jest Configuration
- **Issue:** No coverageThreshold configured.
- **Remediation:** Add coverageThreshold: { global: { branches: 80, functions: 80, lines: 80, statements: 80 } }

#### maxWorkers for CI
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** 3.1: Jest Configuration
- **Issue:** No maxWorkers configuration.
- **Remediation:** maxWorkers: process.env.CI ? 2 : '50%'

#### Coverage reporters
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.1: Jest Configuration
- **Issue:** No explicit reporters for CI.
- **Remediation:** Add coverageReporters: ['text', 'lcov', 'json-summary']

### From 11-documentation.md

#### DOC-P2: CONTRIBUTING.md
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** 3.1: Project-Level Documentation
- **Issue:** No CONTRIBUTING.md exists.

#### DOC-P3: CHANGELOG.md
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** 3.1: Project-Level Documentation
- **Issue:** No CHANGELOG.md exists.

#### DOC-P4: LICENSE
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** 3.1: Project-Level Documentation
- **Issue:** No LICENSE file exists.

#### DOC-P5: SECURITY.md
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** 3.1: Project-Level Documentation
- **Issue:** No SECURITY.md exists.

#### DOC-A1: ADRs
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** 3.2: Architecture Documentation
- **Issue:** No ADRs exist.

#### DOC-A6-A8: C4 Diagrams / Data Flow
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** 3.2: Architecture Documentation
- **Issue:** No C4 diagrams or data flow documentation.

#### DOC-API4: Versioning strategy
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** 3.3: API Documentation
- **Issue:** No versioning strategy documented.

#### DOC-API6: Error codes documented
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** 3.3: API Documentation
- **Issue:** No error codes documented.

#### DOC-OP3-OP5: On-call, Escalation, Post-mortems
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** 3.4: Operational Documentation
- **Issue:** No on-call, escalation, or post-mortem documentation.

#### DOC-SEC3: Secret rotation
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** 3.6: Environment Variables
- **Issue:** No secret rotation documentation.

#### DOC-A2-A4: Database/Framework/Infrastructure ADRs
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.2: Architecture Documentation
- **Issue:** SERVICE_OVERVIEW.md mentions tech but no formal ADRs.

#### DOC-A5: Security architecture
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.2: Architecture Documentation
- **Evidence:** SERVICE_OVERVIEW.md Lines 310-340 documents security features.

#### DOC-API3: Auth documentation
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.3: API Documentation
- **Issue:** Routes lack OpenAPI schemas.
- **Evidence:** bearerAuth defined but routes lack OpenAPI schemas.

#### DOC-API5: Rate limits documented
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.3: API Documentation
- **Issue:** Implemented but not in API docs.

### From 12-health-checks.md

#### HC-F11: Timeouts on checks
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** 3.1: Fastify Health Checks
- **Issue:** No Promise.race timeout.

#### HC-PG3: statement_timeout
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** 3.2: PostgreSQL Health
- **Issue:** No statement_timeout configured.

#### HC-RD2: Timeout
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** 3.3: Redis Health
- **Issue:** No Redis timeout configured.

### From 13-graceful-degradation.md

#### GD-F4: Delay before close
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** 3.1: Fastify Server
- **Issue:** No LB drain delay.

#### GD-F8: close-with-grace
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** 3.1: Fastify Server
- **Issue:** close-with-grace not installed.

#### GD-RD5: Error handler
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** 3.3: Redis
- **Issue:** No Redis error handler.

#### GD-RD7: Fallback when unavailable
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** 3.3: Redis
- **Issue:** CacheService exists but not used as fallback.

#### GD-FB1: Cached response fallback
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** 3.5: Fallback Strategies
- **Issue:** No cached response fallback.

#### GD-LS1: Priority-based load shedding
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** 3.8: Load Shedding
- **Issue:** No priority-based load shedding.

#### GD-LS3: Resource-based load shedding
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** 3.8: Load Shedding
- **Issue:** No resource-based load shedding.

#### GD-F5: In-flight requests complete
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.1: Fastify Server
- **Issue:** Incomplete in-flight request handling.

#### GD-RD1-RD4: Timeouts/retry
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.3: Redis
- **Issue:** Delegated to shared config.

#### GD-FB2: Default response fallback
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.5: Fallback Strategies
- **Evidence:** Logout returns success on error.

### From 19-configuration-management.md

#### CM-S6: envalid/zod validation
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** 3.2: Configuration Structure
- **Issue:** Manual validation, not envalid/zod.

#### CM-ROT1-ROT4: All rotation checks
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** 3.9: Rotation & Lifecycle
- **Issue:** No rotation docs, testing, automation, or monitoring.

#### CM-S5: No scattered process.env
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.2: Configuration Structure
- **Issue:** database.ts, secrets.ts still access process.env directly.

#### CM-DB2: Unique per service
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.5: Database Credentials
- **Issue:** Default 'postgres' user.

#### CM-RD2: TLS
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.6: Redis Credentials
- **Issue:** Redis TLS not confirmed.

#### CM-ROT5: Incident response
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.9: Rotation & Lifecycle
- **Evidence:** Basic plan in REMEDIATION_PLAN.md.

#### CM-OAUTH1: Secrets in manager
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.10: OAuth
- **Issue:** OAuth secrets in env vars, not secretsManager.

### From 20-deployment-cicd.md

#### CD-D4: Base image pinned to digest
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** 3.2: Dockerfile Security
- **Issue:** Uses tag node:20-alpine, not digest.
- **Remediation:** Use node:20-alpine@sha256:abc123... for reproducibility.

#### CD-E3: Deployment history tracked
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** 3.3: Deployment Safeguards
- **Issue:** No deployment tracking without CI/CD.

#### CD-A1: Images signed
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** 3.4: Artifact Security
- **Issue:** No Cosign/Sigstore integration.

#### CD-A2: Images scanned before deployment
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** 3.4: Artifact Security
- **Issue:** No Trivy or image scanning.

#### CD-A3: SBOM generated
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** 3.4: Artifact Security
- **Issue:** No Software Bill of Materials generation.

#### CD-P7: Dependency vulnerability scanning
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.1: CI/CD Pipeline Configuration
- **Issue:** No automated CI integration.
- **Evidence:** package.json has npm audit available but no automated CI integration.

#### CD-S1: Deployment strategy documented
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.3: Deployment Safeguards
- **Issue:** No K8s deployment strategy documented.
- **Evidence:** docker-compose.yml exists but no K8s deployment strategy documented.

#### CD-S4: Database migration rollback
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.3: Deployment Safeguards
- **Issue:** Not tested.
- **Evidence:** Knex supports rollback (knex migrate:rollback) but not tested.

### From 21-database-migrations.md

#### MIG-N1: Migration files use timestamp prefix
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** 3.1: File Structure & Naming
- **Issue:** Sequential numbering causes merge conflicts in distributed teams.
- **Evidence:** 001_auth_baseline.ts uses sequential numbering, not timestamp.
- **Remediation:** Use Knex's default timestamp format for new migrations.

#### MIG-T1: Migrations tested in CI pipeline
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** 3.2: Testing
- **Issue:** No CI pipeline exists.

#### MIG-T3: Down migration tested
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** 3.2: Testing
- **Issue:** Down migrations not tested.

#### MIG-T4: Idempotency tested
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** 3.2: Testing
- **Issue:** Migration idempotency not tested.

#### MIG-T5: Tested with production-like data
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** 3.2: Testing
- **Issue:** Not tested with production-like data.

#### MIG-KF6: Pool min set to 0
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** 3.3: Pool Configuration
- **Issue:** min: 2 keeps connections open unnecessarily during idle.
- **Evidence:** min: 2, max: 10
- **Remediation:** Set min: 0 for better resource usage.

#### MIG-U3: Handles errors appropriately
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.1: Up Function
- **Issue:** Relies on Knex transaction rollback.
- **Evidence:** No explicit try-catch. Relies on Knex transaction rollback.

#### MIG-D4: Down function tested
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.1: Down Function
- **Issue:** No automated down migration testing visible.

#### MIG-T2: Up migration tested
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.2: Testing
- **Issue:** No dedicated test.
- **Evidence:** Dockerfile runs migrations on startup but no dedicated test.

#### MIG-CI1: Migrations run automatically in pipeline
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.2: CI/CD Integration
- **Issue:** No CI pipeline.
- **Evidence:** Docker entrypoint runs migrations, but no CI pipeline.

### From 25-compliance-legal.md

#### CL-RET3: Regular review schedule (annual)
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** 3.2: Policy Documentation
- **Issue:** No annual review schedule.

#### CL-RET4: Clear ownership and responsibility
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** 3.2: Policy Documentation
- **Issue:** No clear data ownership defined.

#### CL-RET5: Exception procedures (legal holds)
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** 3.2: Policy Documentation
- **Issue:** No legal hold procedures.

#### CL-ERA3: Third-party notification process
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** 3.3: Right to Erasure (Article 17)
- **Issue:** No third-party notification process.

#### CL-ERA4: Backup handling procedures
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** 3.3: Right to Erasure (Article 17)
- **Issue:** No backup handling procedures for deletion.

#### CL-ERA5: Deletion confirmation provided
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** 3.3: Right to Erasure (Article 17)
- **Issue:** No deletion confirmation provided.

#### CL-OBJ2: Objection handling within 30 days
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** 3.3: Right to Object (Article 21)
- **Issue:** No objection handling process.

#### CL-RESTRICT1: Ability to pause processing
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** 3.3: Right to Restrict Processing (Article 18)
- **Issue:** No ability to pause processing.

#### CL-DPA1: DPA template available
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** 3.5: DPA Checklist
- **Issue:** No DPA template.

#### CL-DPA2: Sub-processor list maintained
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** 3.5: DPA Checklist
- **Issue:** No sub-processor list.

#### CL-PBD2: DPIA process defined
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** 3.7: Privacy by Design
- **Issue:** No DPIA process defined.

#### CL-RET2: Legal basis justifying each retention period
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.2: Policy Documentation
- **Issue:** Legal basis not fully documented.

#### CL-RET7: Data inventory maps all personal data locations
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.2: Technical Implementation
- **Issue:** Data inventory incomplete.

#### CL-REC2: Corrections propagated to third parties
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.3: Right to Rectification (Article 16)
- **Issue:** Corrections not propagated.

#### CL-OBJ1: Opt-out from marketing processing
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.3: Right to Object (Article 21)
- **Issue:** No API endpoint to change it.
- **Evidence:** marketing_consent field exists but no API endpoint to change it.

#### CL-CON2: Consent is specific (separate purposes)
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.4: Consent Collection
- **Issue:** Consent not separated by purpose.

#### CL-DPA3: Breach notification within 72 hours
- **Status:** PARTIAL
- **Severity:** MEDIUM
- **Section:** 3.5: DPA Checklist
- **Issue:** Breach notification process incomplete.

### From 37-wallet-key-management.md

#### WKM-DOC1: Wallet security architecture documented
- **Status:** FAIL
- **Severity:** MEDIUM
- **Section:** 3.6: Documentation
- **Issue:** No wallet security documentation.
- **Remediation:** Create docs/WALLET_SECURITY.md documenting that auth-service never handles private keys.

---

## LOW Findings

### From 01-security.md

#### SEC-R15: Secure cookies configured
- **Status:** PARTIAL
- **Severity:** LOW
- **Section:** 3.1: Route Layer
- **Issue:** Service uses Bearer tokens, but no explicit secure cookie config if cookies used.
- **Remediation:** Ensure httpOnly, secure, sameSite if cookies ever used.

### From 02-input-validation.md

#### SL8: Sensitive fields filtered from responses
- **Status:** PARTIAL
- **Severity:** LOW
- **Section:** 3.3: Service Layer
- **Issue:** password_hash excluded, but relies on code discipline not schemas.

### From 06-database-integrity.md

#### Atomic Updates
- **Status:** PARTIAL
- **Severity:** LOW
- **Section:** 3.2: Query Patterns
- **Issue:** `failed_login_attempts + 1` is atomic, but `login_count = $1` uses read-modify.
- **Remediation:** Use `login_count = login_count + 1`.

### From 07-idempotency.md

#### Registration
- **Status:** PARTIAL
- **Severity:** LOW
- **Section:** Auth-Specific Operations
- **Issue:** Returns error, not original user data.
- **Evidence:** Email unique constraint returns 409 on duplicate.

### From 11-documentation.md

#### DOC-ON1: Onboarding guide
- **Status:** FAIL
- **Severity:** LOW
- **Section:** 3.5: Onboarding Documentation
- **Issue:** No onboarding guide.

#### DOC-ON3-ON4: Access procedures, Glossary
- **Status:** FAIL
- **Severity:** LOW
- **Section:** 3.5: Onboarding Documentation
- **Issue:** No access procedures or glossary.

#### DOC-CODE1-CODE4: JSDoc
- **Status:** FAIL
- **Severity:** LOW
- **Section:** 3.7: Code Documentation
- **Issue:** No JSDoc on public functions.

#### DOC-OP2: Incident playbooks
- **Status:** PARTIAL
- **Severity:** LOW
- **Section:** 3.4: Operational Documentation
- **Evidence:** REMEDIATION_PLAN.md has basic template.

#### DOC-ON2: Local dev setup
- **Status:** PARTIAL
- **Severity:** LOW
- **Section:** 3.5: Onboarding Documentation
- **Issue:** Missing Docker/Redis details.
- **Evidence:** Basic setup in SERVICE_OVERVIEW.md, missing Docker/Redis details.

#### DOC-ENV7: Complex value formats
- **Status:** PARTIAL
- **Severity:** LOW
- **Section:** 3.6: Environment Variables
- **Issue:** DATABASE_URL format not documented.

#### DOC-CODE5: Comments explain why
- **Status:** PARTIAL
- **Severity:** LOW
- **Section:** 3.7: Code Documentation
- **Issue:** Comments don't always explain why.

#### DOC-CODE8: Complex algorithms explained
- **Status:** PARTIAL
- **Severity:** LOW
- **Section:** 3.7: Code Documentation
- **Issue:** Complex algorithms not always explained.

### From 12-health-checks.md

#### HC-RD6: Memory monitoring
- **Status:** PARTIAL
- **Severity:** LOW
- **Section:** 3.3: Redis Health
- **Issue:** Memory monitoring incomplete.

### From 19-configuration-management.md

#### CM-E3: Environment in logs
- **Status:** PARTIAL
- **Severity:** LOW
- **Section:** 3.3: Per-Environment
- **Issue:** Environment not always in logs.

### From 20-deployment-cicd.md

#### CD-D14: Package cache cleared after install
- **Status:** PARTIAL
- **Severity:** LOW
- **Section:** 3.2: Dockerfile Security
- **Issue:** Uses npm ci but doesn't clear npm cache.
- **Remediation:** Add && npm cache clean --force after install.

### From 21-database-migrations.md

#### MIG-N3: One logical change per migration
- **Status:** PARTIAL
- **Severity:** LOW
- **Section:** 3.1: File Structure & Naming
- **Issue:** Baseline migration is acceptable, but future changes should be atomic.
- **Evidence:** 001_auth_baseline.ts is 400+ lines creating multiple tables, functions, triggers.

#### MIG-DS4: Foreign keys use RESTRICT not CASCADE
- **Status:** PARTIAL
- **Severity:** LOW
- **Section:** 3.1: Data Safety
- **Issue:** Mixed approach (appropriate).
- **Evidence:** Mixed approach - RESTRICT for tenant_id, CASCADE for session/child data (appropriate).

### From 25-compliance-legal.md

#### CL-DOC1: Privacy Policy
- **Status:** FAIL
- **Severity:** LOW
- **Section:** 3.8: Documentation Checklist
- **Issue:** No privacy policy document.

#### CL-DOC2: Data Processing Agreement template
- **Status:** FAIL
- **Severity:** LOW
- **Section:** 3.8: Documentation Checklist
- **Issue:** No DPA template.

#### CL-DOC3: Records of Processing Activities (ROPA)
- **Status:** FAIL
- **Severity:** LOW
- **Section:** 3.8: Documentation Checklist
- **Issue:** No ROPA document.

#### CL-CONR1: Timestamp of consent recorded
- **Status:** PARTIAL
- **Severity:** LOW
- **Section:** 3.4: Consent Records
- **Evidence:** terms_accepted_at, marketing_consent_date fields exist.

#### CL-CONR3: What specifically was consented to
- **Status:** PARTIAL
- **Severity:** LOW
- **Section:** 3.4: Consent Records
- **Issue:** Consent specifics not fully recorded.

#### CL-LOG3: Log integrity protected
- **Status:** PARTIAL
- **Severity:** LOW
- **Section:** 3.6: Audit Logging
- **Issue:** Log integrity not fully protected.

#### CL-PBD1: Privacy considered in new features
- **Status:** PARTIAL
- **Severity:** LOW
- **Section:** 3.7: Privacy by Design
- **Issue:** Privacy not always considered.

#### CL-DOC4: Data Subject Request procedures
- **Status:** PARTIAL
- **Severity:** LOW
- **Section:** 3.8: Documentation Checklist
- **Issue:** DSR procedures incomplete.

#### CL-DOC5: Breach notification procedures
- **Status:** PARTIAL
- **Severity:** LOW
- **Section:** 3.8: Documentation Checklist
- **Issue:** Breach notification procedures incomplete.

### From 37-wallet-key-management.md

#### WKM-ERR3: Failed verifications logged
- **Status:** PARTIAL
- **Severity:** LOW
- **Section:** 3.5: Error Handling & Security
- **Issue:** Minimal logging context.
- **Remediation:** Add structured logging with public key for audit trail.

---

## File Reference Index

| File Path | Finding IDs |
|-----------|-------------|
| app.ts | SEC-R12, RH2, GD-F9, GD-F10 |
| profile.controller.ts | DB1 |
| auth.service.ts | unhandledRejection, uncaughtException |
| jwt.service.ts | SEC-EXT8, SEC-EXT9, CM-JWT1, CM-JWT2 |
| monitoring.service.ts | HC-F1, HC-F2 |
| swagger.ts | DOC-API1 |
| database.ts | CM-S5, Statement Timeout |
| secrets.ts | CM-S5 |
| knexfile.ts | MIG-KF6 |
| 001_auth_baseline.ts | MIG-N1, MIG-N3, MIG-PL1, MIG-PL4 |
| SERVICE_OVERVIEW.md | DOC-A2-A4, DOC-A5, DOC-ON2 |
| REMEDIATION_PLAN.md | DOC-OP2, CM-ROT5, CL-ACC1, CL-ERA1 |

---

## Quick Fix Code Snippets

### Process-Level Error Handlers (CRITICAL)
```typescript
// Add to index.ts
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error });
  process.exit(1);
});
```

### RLS Context (CRITICAL)
```typescript
// Add to tenant middleware
await pool.query(`SET LOCAL app.current_tenant_id = '${tenantId}'`);
await pool.query(`SET LOCAL app.current_user_id = '${userId}'`);
```

### Circuit Breaker (CRITICAL)
```typescript
import CircuitBreaker from 'opossum';

const options = {
  timeout: 3000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000
};

const breaker = new CircuitBreaker(asyncFunction, options);
```

### OpenTelemetry (CRITICAL)
```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

const sdk = new NodeSDK({
  serviceName: 'auth-service',
  instrumentations: [getNodeAutoInstrumentations()]
});
sdk.start();
```

### Fastify Timeouts (HIGH)
```typescript
const app = Fastify({
  connectionTimeout: 10000,
  keepAliveTimeout: 72000,
  requestTimeout: 30000,
  bodyLimit: 1048576,
});
```

### Statement Timeout (HIGH)
```typescript
pool.on('connect', async (client) => {
  await client.query('SET statement_timeout = 30000');
});
```

### Redis Tenant Prefix (HIGH)
```typescript
const fullKey = `tenant:${tenantId}:${this.keyPrefix}:${key}`;
```

### Partial Unique Index for Soft Delete (HIGH)
```sql
DROP INDEX users_email_unique;
CREATE UNIQUE INDEX idx_users_email_active ON users (email) WHERE deleted_at IS NULL;
```

### S2S Token Verification (HIGH)
```typescript
async function verifyServiceToken(request, reply) {
  const serviceToken = request.headers['x-service-token'];
  const decoded = jwt.verify(serviceToken, servicePublicKey);
  if (!allowedServices.includes(decoded.sub)) {
    throw new Error('Unauthorized service');
  }
  request.callerService = decoded.sub;
}
```

### Retry-After Header (MEDIUM)
```typescript
if (error instanceof RateLimitError && error.ttl) {
  reply.header('Retry-After', error.ttl);
}
```

### FOR UPDATE Locking (MEDIUM)
```typescript
const sessionResult = await pool.query(
  `SELECT * FROM user_sessions WHERE id = $1 FOR UPDATE`,
  [sessionId]
);
```
