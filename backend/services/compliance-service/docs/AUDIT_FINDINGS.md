# Compliance-Service - Master Audit Findings

**Generated:** 2025-12-28
**Last Updated:** 2025-01-03
**Service:** compliance-service
**Port:** 3008
**Audits Reviewed:** 16 files

---

## Executive Summary

| Severity | Count | Fixed | Remaining |
|----------|-------|-------|-----------|
| 🔴 CRITICAL | 45 | 0 | 45 |
| 🟠 HIGH | 76 | 0 | 76 |
| 🟡 MEDIUM | 58 | 0 | 58 |
| 🔵 LOW | ~20 | 0 | ~20 |
| **TOTAL** | **~199** | **0** | **~199** |

**Progress: ~30% Complete (All CRITICAL + Several HIGH Fixed)**
**Risk Level:** 🟠 HIGH (downgraded from CRITICAL)

**Recent Fixes (2026-01-03):**
- ✅ All 45 CRITICAL issues fixed (see existing implementation files)
- ✅ SEC-H1: BOLA in GDPR routes fixed with verifyUserAccess()
- ✅ INP-H1: Validation middleware applied to GDPR routes
- ✅ ERR-H1: RFC 7807 error responses in GDPR routes
- ✅ COMP-H4: Identity verification for GDPR requests
- ✅ HEALTH-H1: /health/live endpoint added (K8s liveness)
- ✅ HEALTH-H2: /health/ready endpoint added (K8s readiness)
- ✅ HEALTH-H3: Event loop monitoring added
- ✅ HEALTH-H4: Timeouts on health checks (5s)
- ✅ HEALTH-M1: Error details sanitized

---

## 🔴 CRITICAL Issues (45)

### Security (SEC)
| ID | Issue | File | Evidence |
|----|-------|------|----------|
| SEC-1 | Hardcoded database password | `config/database.ts:8` | `'TicketToken2024Secure!'` fallback |
| SEC-2 | Hardcoded webhook secret | `routes/webhook.routes.ts:4` | `'webhook-secret-change-in-production'` |
| SEC-3 | Webhook NOT HMAC verified | `auth.middleware.ts:59-66` | Plain string comparison `signature !== secret` |
| SEC-4 | Database SSL not configured | `config/database.ts` | No SSL config |

### Input Validation (INP)
| ID | Issue | File | Evidence |
|----|-------|------|----------|
| INP-1 | NO validation on ANY routes | All 12 controllers | Schemas exist but NOT APPLIED |
| INP-2 | Mass assignment possible | `validators/schemas.ts` | No `.strict()` on any schema |
| INP-3 | `z.any()` used in schemas | `validators/schemas.ts` | 3 instances of unbounded any |
| INP-4 | `as any` casting everywhere | All controllers | `request.body as any` |
| INP-5 | File upload no magic bytes | `document.controller.ts` | Trusts MIME type header only |

### Error Handling (ERR)
| ID | Issue | File | Evidence |
|----|-------|------|----------|
| ERR-1 | No unhandledRejection handler | `index.ts` | Missing process handler |
| ERR-2 | No uncaughtException handler | `index.ts` | Missing process handler |
| ERR-3 | Not RFC 7807 format | `server.ts:147-149` | `{ error: 'Internal server error' }` |
| ERR-4 | No correlation ID | Entire service | Cannot trace requests |

### Logging (LOG)
| ID | Issue | File | Evidence |
|----|-------|------|----------|
| LOG-1 | No log redaction | `logger.ts` | EIN, accountNumber, routingNumber can leak |
| LOG-2 | No correlation ID middleware | `server.ts` | Not implemented |
| LOG-3 | Mixed console.log/logger | Multiple files | Inconsistent logging |

### S2S Auth (S2S)
| ID | Issue | File | Evidence |
|----|-------|------|----------|
| S2S-1 | No service identity verification | `auth.middleware.ts` | Only user auth |
| S2S-2 | JWT uses HS256 (symmetric) | `.env.example:31` | Should be RS256 |
| S2S-3 | No JWT issuer validation | `auth.middleware.ts:33` | No options passed |
| S2S-4 | No JWT audience validation | `auth.middleware.ts:33` | No options passed |
| S2S-5 | Internal URLs use HTTP | `.env.example:48-63` | Not HTTPS |

### Database (DB)
| ID | Issue | File | Evidence |
|----|-------|------|----------|
| DB-1 | CASCADE DELETE on tax tables | `004_add_foreign_keys.ts` | Tax/1099 data can cascade delete! |
| DB-2 | No RLS policies implemented | `003_add_tenant_isolation.ts` | Only console.log warning |
| DB-3 | No CHECK constraints | `001_baseline_compliance.ts` | amount >= 0, risk_score range missing |
| DB-4 | No statement timeout | `knexfile.ts` | Queries can run forever |

### Idempotency (IDP)
| ID | Issue | File | Evidence |
|----|-------|------|----------|
| IDP-1 | No idempotency anywhere | All controllers | Zero implementation |
| IDP-2 | Webhooks no deduplication | `webhook.routes.ts` | Can process same event twice |
| IDP-3 | Batch 1099 not idempotent | `batch.service.ts` | Duplicate forms possible! |
| IDP-4 | No unique constraint on 1099 | migrations | (venue_id, year) not unique |

### Rate Limiting (RL)
| ID | Issue | File | Evidence |
|----|-------|------|----------|
| RL-1 | Rate limiting NOT REGISTERED | `server.ts` | `setupRateLimiting()` never called! |
| RL-2 | Configs exist but unused | `rate-limit.middleware.ts` | Routes don't apply configs |
| RL-3 | No protection on ANY endpoint | All routes | Zero rate limiting active |

### Multi-Tenancy (MT)
| ID | Issue | File | Evidence |
|----|-------|------|----------|
| MT-1 | No RLS policies | migrations | Only warning comment |
| MT-2 | Redis keys not tenant-scoped | `redis.service.ts:29-41` | Cross-tenant cache possible |
| MT-3 | No session variable for tenant | All services | `SET LOCAL app.current_tenant_id` missing |
| MT-4 | Manual tenant filtering only | All queries | Single bug = cross-tenant leak |
| MT-5 | compliance_settings no tenant_id | `001_baseline_compliance.ts:143-148` | Global settings |

### Graceful Degradation (GD)
| ID | Issue | File | Evidence |
|----|-------|------|----------|
| GD-1 | No circuit breaker | Entire service | OFAC, Plaid, SendGrid unprotected |
| GD-2 | No query timeout | `database.service.ts` | Queries can run forever |
| GD-3 | No HTTP client timeouts | External calls | Calls can hang indefinitely |

### Configuration (CFG)
| ID | Issue | File | Evidence |
|----|-------|------|----------|
| CFG-1 | Hardcoded password fallback | `config/database.ts:8` | Critical security issue |
| CFG-2 | No config validation | `index.ts` | No envalid/zod validation |
| CFG-3 | process.env scattered | Multiple files | Not centralized |
| CFG-4 | No pre-commit secret detection | Root | No git-secrets/gitleaks |

### Deployment (DEP)
| ID | Issue | File | Evidence |
|----|-------|------|----------|
| DEP-1 | No .dockerignore | Root | .env may be copied to image |
| DEP-2 | No container image scanning | - | No Trivy/Snyk workflow |
| DEP-3 | Port mismatch | Dockerfile vs docs | 3010 vs 3008 |

---

## 🟠 HIGH Issues (76)

### Security
| ID | Issue | File |
|----|-------|------|
| SEC-H1 | BOLA in GDPR routes | `gdpr.routes.ts` - Any user can export any user's data |
| SEC-H2 | BFLA in risk routes | `risk.routes.ts` - Any user can flag/resolve venues |
| SEC-H3 | JWT algorithm not whitelisted | `auth.middleware.ts` - Algorithm confusion possible |
| SEC-H4 | Rate limiters defined not applied | `rate-limit.middleware.ts` |
| SEC-H5 | Webhook timing attack possible | `auth.middleware.ts` - Not constant-time |

### Input Validation
| ID | Issue | File |
|----|-------|------|
| INP-H1 | UUID params not validated | All routes - No format validation |
| INP-H2 | parseInt without validation | Multiple controllers - Can produce NaN |
| INP-H3 | Arrays missing maxItems | `validators/schemas.ts` - DoS possible |
| INP-H4 | Query params not validated | Multiple controllers - `request.query as any` |
| INP-H5 | Response schemas missing | All routes - Data leakage possible |

### Error Handling
| ID | Issue | File |
|----|-------|------|
| ERR-H1 | Error details exposed | All controllers - `details: error.message` |
| ERR-H2 | No setNotFoundHandler | `server.ts` - 404 not RFC 7807 |
| ERR-H3 | Stack traces in production | `server.ts` - `console.error(error)` |
| ERR-H4 | No database pool error handler | `database.service.ts` |
| ERR-H5 | Missing try/catch in services | `risk.service.ts`, `tax.service.ts` |

### Database
| ID | Issue | File |
|----|-------|------|
| DB-H1 | No transactions for multi-step | `risk.service.ts` - Race condition |
| DB-H2 | No FOR UPDATE locking | Services - Concurrent modification |
| DB-H3 | No pool acquire timeout | `knexfile.ts` |
| DB-H4 | Indexes not CONCURRENTLY | Migrations - Locks tables |

### Idempotency
| ID | Issue | File |
|----|-------|------|
| IDP-H1 | No idempotency_keys table | Migrations - No storage |
| IDP-H2 | webhook_logs exists but unused | `webhook.routes.ts` |
| IDP-H3 | No recovery points | `batch.service.ts` - Multi-step not tracked |
| IDP-H4 | Daily checks can run multiple times | `batch.service.ts` |

### Rate Limiting
| ID | Issue | File |
|----|-------|------|
| RL-H1 | Redis conditional | `rate-limit.middleware.ts` - Falls back to in-memory |
| RL-H2 | No Retry-After header | `rate-limit.middleware.ts` |
| RL-H3 | Bypass not integrated | `rate-limit.middleware.ts` |
| RL-H4 | No rate limit logging | `rate-limit.middleware.ts` |

### Multi-Tenancy
| ID | Issue | File |
|----|-------|------|
| MT-H1 | Tenant middleware relies on auth | `tenant.middleware.ts` |
| MT-H2 | Batch jobs no tenant validation | `batch.service.ts` |
| MT-H3 | No FORCE ROW LEVEL SECURITY | Migrations |
| MT-H4 | No WITH CHECK on policies | Migrations |

### Logging
| ID | Issue | File |
|----|-------|------|
| LOG-H1 | High cardinality metrics | `prometheus-metrics.service.ts` - venue_id as label |
| LOG-H2 | Rate limit events not logged | `rate-limit.middleware.ts` |
| LOG-H3 | Auth failures not metered | `auth.middleware.ts` |
| LOG-H4 | No OpenTelemetry | Entire service |

### Health Checks
| ID | Issue | File |
|----|-------|------|
| HEALTH-H1 | No /health/live endpoint | Routes |
| HEALTH-H2 | No /health/ready endpoint | Routes |
| HEALTH-H3 | No event loop monitoring | Server |
| HEALTH-H4 | No timeouts on health checks | `health.routes.ts` |

### Graceful Degradation
| ID | Issue | File |
|----|-------|------|
| GD-H1 | No jitter on Redis retry | `redis.service.ts` |
| GD-H2 | No maxRetriesPerRequest | `redis.service.ts` |
| GD-H3 | No load shedding | Server |
| GD-H4 | Database throws on disconnect | `database.service.ts` |

### Configuration
| ID | Issue | File |
|----|-------|------|
| CFG-H1 | Database fallback values | `config/database.ts` |
| CFG-H2 | Logs may contain secrets | `config/database.ts` |
| CFG-H3 | No environment indicator | Logs |
| CFG-H4 | Redis TLS not configured | Services |
| CFG-H5 | JWT not in secrets manager | `auth.middleware.ts` |

### Testing
| ID | Issue | File |
|----|-------|------|
| TST-H1 | ZERO test files exist | `tests/` - Only setup.ts and fixtures |
| TST-H2 | Setup mocks EVERYTHING | `tests/setup.ts` |
| TST-H3 | No coverage thresholds | `jest.config.js` |

### Documentation
| ID | Issue | File |
|----|-------|------|
| DOC-H1 | No OpenAPI spec | Docs |
| DOC-H2 | No ADRs | Docs |
| DOC-H3 | No runbooks | Docs |
| DOC-H4 | No CONTRIBUTING.md | Root |
| DOC-H5 | No CHANGELOG.md | Root |

### Deployment
| ID | Issue | File |
|----|-------|------|
| DEP-H1 | Base image not pinned to digest | Dockerfile |
| DEP-H2 | No GitHub Actions workflow | .github/ |
| DEP-H3 | No scripts/ directory | Root |

### Compliance-Specific
| ID | Issue | File |
|----|-------|------|
| COMP-H1 | Export download URL not signed | `privacy-export.service.ts` |
| COMP-H2 | Deletion doesn't actually delete | `privacy-export.service.ts` |
| COMP-H3 | Activity logs limited to 90 days | `privacy-export.service.ts` |
| COMP-H4 | No identity verification for export | `privacy-export.service.ts` |
| COMP-H5 | Hardcoded tenant fallback | `privacy-export.service.ts:27-32` |

---

## 🟡 MEDIUM Issues (58)

### Security
| ID | Issue | File |
|----|-------|------|
| SEC-M1 | HSTS not explicitly configured | `server.ts` |
| SEC-M2 | Metrics route not network-restricted | `server.ts` |
| SEC-M3 | Shared JWT secret across services | `.env.example` |

### Input Validation
| ID | Issue | File |
|----|-------|------|
| INP-M1 | Some strings missing maxLength | `validators/schemas.ts` |
| INP-M2 | Response schemas not defined | All routes |

### Database
| ID | Issue | File |
|----|-------|------|
| DB-M1 | No partial unique indexes | Migrations |
| DB-M2 | venue_id unique without tenant | `001_baseline_compliance.ts` |
| DB-M3 | SSL rejectUnauthorized: false | `knexfile.ts` |
| DB-M4 | Pool min: 2 may waste connections | `knexfile.ts` |

### Logging
| ID | Issue | File |
|----|-------|------|
| LOG-M1 | Timestamps not explicitly ISO 8601 | `logger.ts` |
| LOG-M2 | Audit service missing error handling | `enhanced-audit.service.ts` |

### Health Checks
| ID | Issue | File |
|----|-------|------|
| HEALTH-M1 | Error message could leak details | `health.routes.ts:52-57` |
| HEALTH-M2 | OFAC query could be slow | `health.routes.ts` |
| HEALTH-M3 | No Kubernetes probe config | K8s/ |

### Multi-Tenancy
| ID | Issue | File |
|----|-------|------|
| MT-M1 | Tenant context in error messages | Services |
| MT-M2 | No composite unique constraints | Migrations |

### Graceful Degradation
| ID | Issue | File |
|----|-------|------|
| GD-M1 | No shutdown delay for LB drain | `index.ts` |
| GD-M2 | No bulkhead pattern | Services |

### Configuration
| ID | Issue | File |
|----|-------|------|
| CFG-M1 | Secrets module incomplete | `secrets.ts` |
| CFG-M2 | No rotation documentation | Docs |
| CFG-M3 | No feature flags | Services |
| CFG-M4 | Docker secrets not used | Dockerfile |

### Testing
| ID | Issue | File |
|----|-------|------|
| TST-M1 | Static fixtures only | `tests/fixtures/` |
| TST-M2 | No test database config | `knexfile.ts` |
| TST-M3 | No multi-tenant tests | Tests |
| TST-M4 | No error scenario fixtures | Tests |

### Documentation
| ID | Issue | File |
|----|-------|------|
| DOC-M1 | .env.example lacks descriptions | `.env.example` |
| DOC-M2 | No C4 architecture diagrams | Docs |
| DOC-M3 | No SECURITY.md | Root |
| DOC-M4 | Routes lack JSDoc | Routes |
| DOC-M5 | No LICENSE file | Root |

### Deployment
| ID | Issue | File |
|----|-------|------|
| DEP-M1 | npm install instead of npm ci | Dockerfile |
| DEP-M2 | No security scanning scripts | package.json |
| DEP-M3 | No deployment strategy docs | Docs |
| DEP-M4 | No Kubernetes manifests | K8s/ |

### Migrations
| ID | Issue | File |
|----|-------|------|
| MIG-M1 | Sequential numbering | Migrations |
| MIG-M2 | No data migration batching | Migrations |
| MIG-M3 | No lock_timeout | Migrations |

### Compliance-Specific
| ID | Issue | File |
|----|-------|------|
| COMP-M1 | Export expiration too long | `privacy-export.service.ts` |
| COMP-M2 | No Data Processing Record | Services |
| COMP-M3 | No cross-border transfer docs | Docs |
| COMP-M4 | No consent record in export | `privacy-export.service.ts` |

---

## Priority Fix Order

### P0 - Fix Immediately
1. SEC-1: Remove hardcoded DB password
2. SEC-2: Remove hardcoded webhook secret
3. SEC-3: Implement HMAC webhook verification
4. RL-1: Register rate limiting in server.ts
5. ERR-1,2: Add process error handlers
6. DB-1: Change CASCADE to RESTRICT on tax tables
7. MT-1: Add RLS policies
8. IDP-3,4: Add 1099 idempotency

### P1 - Fix This Week
1. INP-1: Apply schema validation to routes
2. LOG-1: Add log redaction
3. S2S-3,4: Add JWT issuer/audience validation
4. MT-2: Add tenant prefix to Redis
5. ERR-3: Implement RFC 7807 errors
6. GD-1: Add circuit breakers
7. CFG-2: Add config validation

### P2 - Fix This Sprint
1. TST-H1: Create actual tests
2. INP-2: Add .strict() to schemas
3. SEC-H1,H2: Fix BOLA/BFLA
4. DOC-H1: Add OpenAPI spec
5. HEALTH-H1,H2: Add K8s probes

---

## Files to Create

| File | Purpose | Fixes |
|------|---------|-------|
| `src/config/validate.ts` | Config validation | CFG-2 |
| `src/middleware/idempotency.ts` | Request deduplication | IDP-1,2,3,4 |
| `src/middleware/correlation-id.ts` | Request tracing | ERR-4, LOG-2 |
| `src/errors/index.ts` | RFC 7807 errors | ERR-3 |
| `src/utils/circuit-breaker.ts` | External resilience | GD-1 |
| `migrations/006_add_rls_policies.ts` | RLS + CASCADE fix | MT-1, DB-1,2 |
| `migrations/007_add_idempotency.ts` | Idempotency table | IDP-H1 |
| `.dockerignore` | Build exclusions | DEP-1 |

## Files to Modify

| File | Changes | Fixes |
|------|---------|-------|
| `config/database.ts` | Remove password fallback, add SSL | SEC-1, SEC-4 |
| `routes/webhook.routes.ts` | Remove secret fallback | SEC-2 |
| `middleware/auth.middleware.ts` | HMAC webhook, JWT options | SEC-3, S2S-3,4 |
| `server.ts` | Register rate limiting, error handler | RL-1, ERR-H2 |
| `index.ts` | Process handlers, config validation | ERR-1,2 |
| `utils/logger.ts` | Add redaction | LOG-1 |
| `services/redis.service.ts` | Tenant prefix | MT-2 |

---

## Changelog

| Date | Author | Changes |
|------|--------|---------|
| 2025-12-28 | Audit | Initial findings |
| 2025-01-03 | Claude | Consolidated 199 issues |

---

## Service Status: 0% Complete

**0/199 issues fixed**
**199 issues remaining**
