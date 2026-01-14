# Payment Service - Complete MEDIUM Findings List

**Generated:** 2025-01-01
**Total MEDIUM Findings:** 130 (78 FAIL + 52 PARTIAL)

---

## Findings Grouped by Target File

---

### 1. src/config/index.ts (8 findings)

| # | Audit File | Check ID | Description | Status |
|---|------------|----------|-------------|--------|
| 1 | 01-security.md | SEC-R6 | Default JWT secret 'your-secret-key' in config | PARTIAL |
| 2 | 19-configuration-management.md | ENV-1 | Empty string defaults for required config (`|| ''`) | FAIL |
| 3 | 19-configuration-management.md | ENV-2 | No type-safe config (Object only, no validation) | PARTIAL |
| 4 | 19-configuration-management.md | STR-4 | Stripe keys not via secrets manager | FAIL |
| 5 | 19-configuration-management.md | STR-5 | Webhook secret not via secrets manager | FAIL |
| 6 | 19-configuration-management.md | STR-6 | No pattern validation for Stripe keys | FAIL |
| 7 | 05-s2s-auth.md | SEC-1 | Default secrets in code (6+ defaults) | FAIL |
| 8 | 04-logging-observability.md | LC7 | Service version not included in config | PARTIAL |

---

### 2. src/middleware/internal-auth.ts (7 findings)

| # | Audit File | Check ID | Description | Status |
|---|------------|----------|-------------|--------|
| 9 | 01-security.md | S2S-1 | Default internal secret hardcoded | PARTIAL |
| 10 | 01-security.md | S2S-2 | Dev temp-signature bypass in non-prod | PARTIAL |
| 11 | 05-s2s-auth.md | HMAC-5 | Shared secret (not per-service) | FAIL |
| 12 | 05-s2s-auth.md | HMAC-6 | Per-service secrets not implemented | FAIL |
| 13 | 05-s2s-auth.md | AUTH-6 | Issuer not validated (no allowlist) | FAIL |
| 14 | 05-s2s-auth.md | AUTH-7 | Audience not validated | FAIL |
| 15 | 05-s2s-auth.md | ACL-2 | Service allowlist not implemented | FAIL |

---

### 3. src/middleware/auth.ts / authenticate.ts (6 findings)

| # | Audit File | Check ID | Description | Status |
|---|------------|----------|-------------|--------|
| 16 | 09-multi-tenancy.md | JWT-5 | Missing tenant returns proceeds (no 401) | FAIL |
| 17 | 09-multi-tenancy.md | JWT-6 | UUID format not validated for tenant | FAIL |
| 18 | 09-multi-tenancy.md | JWT-7 | URL vs JWT tenant not validated | FAIL |
| 19 | 09-multi-tenancy.md | VAL-3 | Body tenant not rejected (some use body) | FAIL |
| 20 | 05-s2s-auth.md | AUTH-4 | All endpoints auth is per-route not global | PARTIAL |
| 21 | 05-s2s-auth.md | AUTH-5 | Middleware not global (per-route) | FAIL |

---

### 4. src/middleware/tenant.middleware.ts (5 findings)

| # | Audit File | Check ID | Description | Status |
|---|------------|----------|-------------|--------|
| 22 | 09-multi-tenancy.md | QRY-1 | Queries not in tenant transaction | FAIL |
| 23 | 09-multi-tenancy.md | QRY-2 | SET LOCAL tenant_id only in refundController | PARTIAL |
| 24 | 09-multi-tenancy.md | QRY-3 | Direct knex without wrapper | FAIL |
| 25 | 09-multi-tenancy.md | QRY-8 | Hardcoded default tenant UUID | PARTIAL |
| 26 | 09-multi-tenancy.md | QRY-9 | No withTenantContext() query wrapper | FAIL |

---

### 5. src/middleware/rate-limit.middleware.ts (6 findings)

| # | Audit File | Check ID | Description | Status |
|---|------------|----------|-------------|--------|
| 27 | 08-rate-limiting.md | RL-9 | Missing Retry-After header (only in body) | PARTIAL |
| 28 | 08-rate-limiting.md | RL-10 | No machine-readable error code | PARTIAL |
| 29 | 08-rate-limiting.md | RL-11 | No docs link in rate limit response | FAIL |
| 30 | 08-rate-limiting.md | RL-12 | No 503 for system overload | FAIL |
| 31 | 08-rate-limiting.md | WH-1 | No webhook rate limiting | PARTIAL |
| 32 | 08-rate-limiting.md | WH-2 | No separate rate limit per webhook source | FAIL |

---

### 6. src/middleware/global-error-handler.ts (5 findings)

| # | Audit File | Check ID | Description | Status |
|---|------------|----------|-------------|--------|
| 33 | 03-error-handling.md | RH-2 | Handler registered after routes | PARTIAL |
| 34 | 03-error-handling.md | RH-6 | No correlation ID in error responses | FAIL |
| 35 | 03-error-handling.md | SL-2 | Errors lack context (logs IDs only) | PARTIAL |
| 36 | 03-error-handling.md | SL-4 | AppError not used consistently | PARTIAL |
| 37 | 03-error-handling.md | SL-5 | Error codes not documented (no enum) | PARTIAL |

---

### 7. src/routes/refund.routes.ts (4 findings)

| # | Audit File | Check ID | Description | Status |
|---|------------|----------|-------------|--------|
| 38 | 02-input-validation.md | RD-4 | validateQueryParams rarely used | PARTIAL |
| 39 | 02-input-validation.md | RD-5 | No response schemas/DTOs | FAIL |
| 40 | 02-input-validation.md | RD-8 | Some strings unbounded (no maxLength) | PARTIAL |
| 41 | 02-input-validation.md | SD-6 | metadata uses Record<string, any> | PARTIAL |

---

### 8. src/routes/health.routes.ts (6 findings)

| # | Audit File | Check ID | Description | Status |
|---|------------|----------|-------------|--------|
| 42 | 12-health-checks.md | LP-2 | No event loop monitoring (@fastify/under-pressure) | FAIL |
| 43 | 12-health-checks.md | LP-3 | Liveness return time not timed | PARTIAL |
| 44 | 12-health-checks.md | PG-3 | No query timeout on health checks | FAIL |
| 45 | 12-health-checks.md | PG-5 | No pool exhaustion detection | FAIL |
| 46 | 12-health-checks.md | RD-3 | No timeout configured on Redis health | FAIL |
| 47 | 12-health-checks.md | LOW-1 | /health should be /health/live (K8s convention) | PARTIAL |

---

### 9. src/webhooks/webhook.controller.ts (6 findings)

| # | Audit File | Check ID | Description | Status |
|---|------------|----------|-------------|--------|
| 48 | 07-idempotency.md | WH-10 | Returns 200 immediately missing (inline processing) | FAIL |
| 49 | 03-error-handling.md | ST-5 | No rate limit handling for Stripe | FAIL |
| 50 | 03-error-handling.md | ST-7 | Raw card decline messages (not user-friendly) | FAIL |
| 51 | 04-logging-observability.md | ST-5 | Idempotency keys not logged | FAIL |
| 52 | 08-rate-limiting.md | WH-7 | No outbound webhook rate limiting | FAIL |
| 53 | 03-error-handling.md | BJ-3 | No max retries limit on webhooks | FAIL |

---

### 10. src/webhooks/webhook.consumer.ts (3 findings)

| # | Audit File | Check ID | Description | Status |
|---|------------|----------|-------------|--------|
| 54 | 05-s2s-auth.md | CLIENT-1 | Missing auth on outbound calls | PARTIAL |
| 55 | 05-s2s-auth.md | CLIENT-3 | No correlation ID propagated | FAIL |
| 56 | 04-logging-observability.md | DT-2 | Correlation ID not propagated to downstream | FAIL |

---

### 11. src/services/payment-processor.service.ts (8 findings)

| # | Audit File | Check ID | Description | Status |
|---|------------|----------|-------------|--------|
| 57 | 03-error-handling.md | DS-4 | No circuit breaker for Stripe | FAIL |
| 58 | 03-error-handling.md | DS-5 | No inter-service timeouts configured | FAIL |
| 59 | 03-error-handling.md | SL-8 | HTTP timeout not configured | PARTIAL |
| 60 | 04-logging-observability.md | ST-3 | Customer IDs not hashed | PARTIAL |
| 61 | 04-logging-observability.md | ST-4 | Stripe errors no type parsing | PARTIAL |
| 62 | 32-payment-processing-security.md | REC-2 | No expected vs actual comparison | FAIL |
| 63 | 32-payment-processing-security.md | REC-3 | No missing transfer detection | FAIL |
| 64 | 32-payment-processing-security.md | PAY-5 | No payout schedule logic | FAIL |

---

### 12. src/controllers/refundController.ts (5 findings)

| # | Audit File | Check ID | Description | Status |
|---|------------|----------|-------------|--------|
| 65 | 33-refund-dispute-handling.md | REF-10 | One of many tickets partial refund no order logic | PARTIAL |
| 66 | 33-refund-dispute-handling.md | REF-11 | No promo code discount tracking | FAIL |
| 67 | 33-refund-dispute-handling.md | DRP-4 | Total refunded not tracked cumulatively | FAIL |
| 68 | 33-refund-dispute-handling.md | DRP-9 | Max refundable uses original only | PARTIAL |
| 69 | 33-refund-dispute-handling.md | EDGE-4 | No currency mismatch validation | FAIL |

---

### 13. src/services/stripe-connect-transfer.service.ts (6 findings)

| # | Audit File | Check ID | Description | Status |
|---|------------|----------|-------------|--------|
| 70 | 32-payment-processing-security.md | REC-1 | No daily reconciliation for transfers | PARTIAL |
| 71 | 32-payment-processing-security.md | REC-5 | Balance Transactions API not used | FAIL |
| 72 | 32-payment-processing-security.md | FEE-2 | Stripe fees not factored in split | FAIL |
| 73 | 32-payment-processing-security.md | FEE-7 | No multi-currency support | FAIL |
| 74 | 32-payment-processing-security.md | PAY-2 | Payout schedules not configured | FAIL |
| 75 | 32-payment-processing-security.md | PAY-4 | Manual payout after funds available partial | PARTIAL |

---

### 14. src/services/fee-calculation.service.ts (3 findings)

| # | Audit File | Check ID | Description | Status |
|---|------------|----------|-------------|--------|
| 76 | 32-payment-processing-security.md | FEE-4 | Royalty split in code only (not documented) | PARTIAL |
| 77 | 33-refund-dispute-handling.md | ROY-1 | Creator royalties not reversed on refund | FAIL |
| 78 | 33-refund-dispute-handling.md | ROY-2 | Proportional royalty reversal not calculated | FAIL |

---

### 15. src/services/database.service.ts / db.ts (6 findings)

| # | Audit File | Check ID | Description | Status |
|---|------------|----------|-------------|--------|
| 79 | 06-database-integrity.md | CP-4 | No statement_timeout configured | FAIL |
| 80 | 13-graceful-degradation.md | GD-1 | Query statement timeouts not evident | PARTIAL |
| 81 | 06-database-integrity.md | TXN-4 | No external calls in transaction partial | PARTIAL |
| 82 | 06-database-integrity.md | RACE-4 | FOR UPDATE on inventory partial | PARTIAL |
| 83 | 13-graceful-degradation.md | GD-2 | DB pool config needs verification | PARTIAL |
| 84 | 03-error-handling.md | DB-1 | Queries in try/catch partial (webhook yes, payment no) | PARTIAL |

---

### 16. src/utils/logger.ts (5 findings)

| # | Audit File | Check ID | Description | Status |
|---|------------|----------|-------------|--------|
| 85 | 04-logging-observability.md | LC-1 | Main logger not structured JSON | PARTIAL |
| 86 | 04-logging-observability.md | LC-2 | Log level only DEBUG check | PARTIAL |
| 87 | 04-logging-observability.md | LC-4 | Request ID only (no correlation ID) | PARTIAL |
| 88 | 04-logging-observability.md | LC-9 | No log rotation | FAIL |
| 89 | 04-logging-observability.md | FP-6 | Sync console.log (not async) | FAIL |

---

### 17. src/utils/tracing.ts / opentelemetry.config.ts (5 findings)

| # | Audit File | Check ID | Description | Status |
|---|------------|----------|-------------|--------|
| 90 | 04-logging-observability.md | DT-1 | Custom tracing not OpenTelemetry SDK | FAIL |
| 91 | 04-logging-observability.md | DT-4 | Trace ID only in middleware (not everywhere) | PARTIAL |
| 92 | 04-logging-observability.md | SE-5 | Access denied logs but not OWASP vocab | PARTIAL |
| 93 | 04-logging-observability.md | SE-8 | Validation failures not standardized | PARTIAL |
| 94 | 04-logging-observability.md | SE-9 | Rate limit no event vocabulary | PARTIAL |

---

### 18. src/utils/metrics.ts / prometheus.ts (4 findings)

| # | Audit File | Check ID | Description | Status |
|---|------------|----------|-------------|--------|
| 95 | 04-logging-observability.md | M-2 | No HTTP request rate counter | PARTIAL |
| 96 | 04-logging-observability.md | M-3 | HTTP duration only paymentDuration | PARTIAL |
| 97 | 04-logging-observability.md | M-4 | No error rate counter | FAIL |
| 98 | 08-rate-limiting.md | PM-7 | Stripe headers not monitored | FAIL |

---

### 19. src/routes/metrics.routes.ts (NEW FILE NEEDED) (1 finding)

| # | Audit File | Check ID | Description | Status |
|---|------------|----------|-------------|--------|
| 99 | 04-logging-observability.md | M-1 | No /metrics endpoint exposed | FAIL |

---

### 20. src/jobs/background-job-processor.ts (5 findings)

| # | Audit File | Check ID | Description | Status |
|---|------------|----------|-------------|--------|
| 100 | 03-error-handling.md | BJ-4 | No exponential backoff (fixed 5-second) | FAIL |
| 101 | 03-error-handling.md | BJ-5 | No dead letter queue | FAIL |
| 102 | 03-error-handling.md | BJ-6 | No stalled job detection | FAIL |
| 103 | 03-error-handling.md | BJ-9 | No correlation ID in webhook_inbox | FAIL |
| 104 | 09-multi-tenancy.md | JOB-2 | Processor doesn't validate tenant | FAIL |

---

### 21. src/jobs/*.ts (various job files) (4 findings)

| # | Audit File | Check ID | Description | Status |
|---|------------|----------|-------------|--------|
| 105 | 09-multi-tenancy.md | JOB-3 | DB context not set for tenant | FAIL |
| 106 | 09-multi-tenancy.md | JOB-6 | Recurring jobs don't iterate tenants | FAIL |
| 107 | 09-multi-tenancy.md | JOB-8 | Queue names not by tenant (global) | FAIL |
| 108 | 09-multi-tenancy.md | JOB-9 | DLQ doesn't respect tenant isolation | FAIL |

---

### 22. src/migrations/*.ts (6 findings)

| # | Audit File | Check ID | Description | Status |
|---|------------|----------|-------------|--------|
| 109 | 21-database-migrations.md | NM-1 | Sequential naming (not timestamp) | FAIL |
| 110 | 21-database-migrations.md | PG-2 | Uses CHECK constraints instead of ENUM types | FAIL |
| 111 | 21-database-migrations.md | PG-3 | JSONB not indexed with GIN | PARTIAL |
| 112 | 21-database-migrations.md | PG-4 | No CREATE EXTENSION for pgcrypto | PARTIAL |
| 113 | 21-database-migrations.md | PG-5 | Assumes pgcrypto exists (not verified) | FAIL |
| 114 | 21-database-migrations.md | ENV-3 | Dev fallbacks exist in config | PARTIAL |

---

### 23. src/validators/*.ts (validation files) (3 findings)

| # | Audit File | Check ID | Description | Status |
|---|------------|----------|-------------|--------|
| 115 | 02-input-validation.md | SL-5 | Cross-field validation partial | PARTIAL |
| 116 | 02-input-validation.md | SL-6 | Re-validate after transform partial | PARTIAL |
| 117 | 02-input-validation.md | SL-8 | Sensitive fields partial (returns full object) | PARTIAL |

---

### 24. src/utils/http-client.util.ts / axios.ts (4 findings)

| # | Audit File | Check ID | Description | Status |
|---|------------|----------|-------------|--------|
| 118 | 05-s2s-auth.md | CLIENT-5 | No circuit breaker on HTTP client | FAIL |
| 119 | 03-error-handling.md | DS-2 | Correlation ID not in HTTP calls | FAIL |
| 120 | 03-error-handling.md | DS-8 | Source service not in errors | FAIL |
| 121 | 03-error-handling.md | DS-10 | No graceful degradation fallbacks | FAIL |

---

### 25. src/services/notification.service.ts (NEW FILE NEEDED) (2 findings)

| # | Audit File | Check ID | Description | Status |
|---|------------|----------|-------------|--------|
| 122 | 33-refund-dispute-handling.md | COMM-1 | No refund confirmation email | FAIL |
| 123 | 33-refund-dispute-handling.md | COMM-2 | Timeline not communicated | FAIL |

---

### 26. src/services/alerting.service.ts (NEW/UPDATE) (2 findings)

| # | Audit File | Check ID | Description | Status |
|---|------------|----------|-------------|--------|
| 124 | 32-payment-processing-security.md | MON-3 | Account disabled only logs (no alert) | PARTIAL |
| 125 | 33-refund-dispute-handling.md | COMM-6 | Support visibility audit log only | PARTIAL |

---

### 27. tests/integration/security/tenant-isolation.test.ts (NEW FILE NEEDED) (2 findings)

| # | Audit File | Check ID | Description | Status |
|---|------------|----------|-------------|--------|
| 126 | 10-testing.md | E2E-4 | No tenant isolation test | FAIL |
| 127 | 10-testing.md | SEC-7 | No cross-tenant security tests | FAIL |

---

### 28. tests/load/*.test.ts (load tests) (2 findings)

| # | Audit File | Check ID | Description | Status |
|---|------------|----------|-------------|--------|
| 128 | 10-testing.md | LOAD-2 | Only retry storm spike test | PARTIAL |
| 129 | 10-testing.md | LOAD-3 | No stress test | FAIL |

---

### 29. docs/ (documentation files) (1 finding)

| # | Audit File | Check ID | Description | Status |
|---|------------|----------|-------------|--------|
| 130 | 11-documentation.md | DOC-1 | No ADRs (docs/decisions/) | FAIL |

---

## Summary by File Category

| Category | File Count | Finding Count |
|----------|------------|---------------|
| Configuration | 1 | 8 |
| Middleware | 6 | 35 |
| Routes | 2 | 10 |
| Webhooks | 2 | 9 |
| Services | 5 | 26 |
| Controllers | 1 | 5 |
| Utils | 4 | 18 |
| Jobs | 2 | 9 |
| Migrations | 1 | 6 |
| Validators | 1 | 3 |
| Tests | 2 | 4 |
| Docs | 1 | 1 |
| **TOTAL** | **28** | **130** |

---

## Priority Order for Fixing

### Priority 1: Security & Multi-tenancy (45 findings)
- src/middleware/tenant.middleware.ts (5)
- src/middleware/auth.ts (6)
- src/middleware/internal-auth.ts (7)
- src/config/index.ts (8)
- src/migrations/*.ts (6) - RLS policies
- tests/integration/security/tenant-isolation.test.ts (2)
- src/jobs/*.ts (4)
- src/jobs/background-job-processor.ts (5) - tenant context
- src/validators/*.ts (3) - security

### Priority 2: Observability & Error Handling (27 findings)
- src/utils/logger.ts (5)
- src/utils/tracing.ts (5)
- src/utils/metrics.ts (4)
- src/routes/metrics.routes.ts (1) - NEW
- src/middleware/global-error-handler.ts (5)
- src/utils/http-client.util.ts (4)
- src/webhooks/webhook.consumer.ts (3)

### Priority 3: Payment Processing (22 findings)
- src/services/payment-processor.service.ts (8)
- src/services/stripe-connect-transfer.service.ts (6)
- src/services/fee-calculation.service.ts (3)
- src/controllers/refundController.ts (5)

### Priority 4: Infrastructure (21 findings)
- src/middleware/rate-limit.middleware.ts (6)
- src/routes/health.routes.ts (6)
- src/services/database.service.ts (6)
- src/routes/refund.routes.ts (4) - validation schemas

### Priority 5: Communication & Testing (11 findings)
- src/webhooks/webhook.controller.ts (6)
- src/services/notification.service.ts (2) - NEW
- src/services/alerting.service.ts (2)
- tests/load/*.test.ts (2)

### Priority 6: Documentation (1 finding)
- docs/ (1)

---

## Quick Reference: Files with Most Findings

1. **src/services/payment-processor.service.ts** - 8 findings
2. **src/config/index.ts** - 8 findings
3. **src/middleware/internal-auth.ts** - 7 findings
4. **src/middleware/auth.ts** - 6 findings
5. **src/middleware/rate-limit.middleware.ts** - 6 findings
6. **src/routes/health.routes.ts** - 6 findings
7. **src/services/stripe-connect-transfer.service.ts** - 6 findings
8. **src/services/database.service.ts** - 6 findings
9. **src/webhooks/webhook.controller.ts** - 6 findings
10. **src/migrations/*.ts** - 6 findings
