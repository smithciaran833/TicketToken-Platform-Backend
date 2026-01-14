# Scanning-Service - Master Audit Findings

**Generated:** 2025-12-27
**Last Updated:** 2025-01-03
**Service:** scanning-service
**Port:** 3000
**Audits Reviewed:** 16 files

---

## Executive Summary

| Severity | Count | Fixed | Remaining |
|----------|-------|-------|-----------|
| 🔴 CRITICAL | 56 | 0 | 56 |
| 🟠 HIGH | 46 | 0 | 46 |
| 🟡 MEDIUM | ~10 | 0 | ~10 |
| 🔵 LOW | ~5 | 0 | ~5 |
| **TOTAL** | **~117** | **0** | **~117** |

**Progress: 0% Complete**
**Risk Level:** 🟠 HIGH
**Average Audit Score: 58/100**

**Key Concerns:**
- 10+ routes lack authentication (QR, devices, offline, policies)
- No schema validation on auxiliary routes (only scan endpoint has it)
- RLS missing FORCE and WITH CHECK clauses
- No circuit breakers for external services
- Zero test files exist
- Running as root in Docker container
- No correlation ID tracking

**Service Strengths:**
- Excellent QR code security (HMAC-SHA256, timing-safe, nonces)
- Strong tenant/venue isolation in QRValidator
- Good graceful shutdown implementation
- Comprehensive Prometheus metrics (30+)
- RLS enabled on all 7 tables
- Good offline fallback capability
- Excellent config validation with Joi

---

## 🔴 CRITICAL Issues (56)

### SEC - Security (3)
| ID | Issue | File | Evidence |
|----|-------|------|----------|
| SEC-1 | Unauthenticated QR routes | `routes/qr.ts` | /generate/:ticketId, /validate no auth |
| SEC-2 | Unauthenticated device routes | `routes/devices.ts` | /register, / no auth |
| SEC-3 | Unauthenticated offline routes | `routes/offline.ts` | /manifest, /reconcile no auth |

### INP - Input Validation (3)
| ID | Issue | File | Evidence |
|----|-------|------|----------|
| INP-1 | 10 routes without schema validation | `qr.ts`, `devices.ts`, `policies.ts`, `offline.ts` | Only scan.ts has validation |
| INP-2 | 5 POST/PUT routes without body validation | Multiple routes | Mass assignment risk |
| INP-3 | UUID params not validated | All routes except scan | No format: 'uuid' |

### ERR - Error Handling (3)
| ID | Issue | File | Evidence |
|----|-------|------|----------|
| ERR-1 | Error handler registered AFTER routes | `index.ts:158` | Should be before |
| ERR-2 | No correlation ID implementation | Entire service | Cannot trace requests |
| ERR-3 | No RFC 7807 error format | Error responses | Non-standard format |

### LOG - Logging (3)
| ID | Issue | File | Evidence |
|----|-------|------|----------|
| LOG-1 | No sensitive data redaction | `logger.ts` | PII can leak |
| LOG-2 | No correlation ID middleware | `index.ts` | Not implemented |
| LOG-3 | No context propagation | Entire service | Cannot trace across services |

### S2S - Service Auth (4)
| ID | Issue | File | Evidence |
|----|-------|------|----------|
| S2S-1 | 10+ routes without authentication | Multiple routes | Unauthorized access risk |
| S2S-2 | No JWT issuer validation | `auth.middleware.ts` | Token forgery risk |
| S2S-3 | No JWT audience validation | `auth.middleware.ts` | Token misuse risk |
| S2S-4 | Uses HS256 symmetric signing | `auth.middleware.ts` | Shared secret vulnerability |

### DB - Database (3)
| ID | Issue | File | Evidence |
|----|-------|------|----------|
| DB-1 | No FOR UPDATE locking | `QRValidator.ts` | Double-scan race condition |
| DB-2 | No serialization failure retry | `QRValidator.ts` | Transaction failures not handled |
| DB-3 | Missing statement_timeout | `database.ts` | Queries can hang |

### IDP - Idempotency (3)
| ID | Issue | File | Evidence |
|----|-------|------|----------|
| IDP-1 | No Idempotency-Key header support | All routes | Client retry creates duplicates |
| IDP-2 | No recovery point tracking | `QRValidator.ts` | Cannot resume failed multi-step |
| IDP-3 | No 409 Conflict for concurrent requests | `QRValidator.ts` | Race conditions |

### RL - Rate Limiting (4)
| ID | Issue | File | Evidence |
|----|-------|------|----------|
| RL-1 | No rate limiting on QR generation | `qr.ts` | DoS risk |
| RL-2 | No rate limiting on device registration | `devices.ts` | Device enumeration |
| RL-3 | No rate limiting on offline manifest | `offline.ts` | Resource exhaustion |
| RL-4 | trustProxy: true without explicit list | `index.ts` | X-Forwarded-For spoofing |

### MT - Multi-Tenancy (4)
| ID | Issue | File | Evidence |
|----|-------|------|----------|
| MT-1 | Missing FORCE ROW LEVEL SECURITY | Migrations | Table owner can bypass RLS |
| MT-2 | RLS policy missing WITH CHECK | Migrations | INSERT/UPDATE not validated |
| MT-3 | Missing tenant returns 500 not 401 | `tenant-context.ts` | Confusing error |
| MT-4 | No tenant ID format validation | Middleware | Potential injection |

### TST - Testing (4)
| ID | Issue | File | Evidence |
|----|-------|------|----------|
| TST-1 | No test files exist | `tests/` | Zero test coverage |
| TST-2 | No coverage thresholds | `jest.config.js` | Quality regression undetected |
| TST-3 | No critical path tests | Entire service | Bugs not caught |
| TST-4 | No security tests | Entire service | Vulnerabilities undetected |

### DOC - Documentation (4)
| ID | Issue | File | Evidence |
|----|-------|------|----------|
| DOC-1 | No README.md | Root | Poor developer experience |
| DOC-2 | No OpenAPI specification | Entire service | Integration difficulty |
| DOC-3 | No runbooks | `docs/` | Incident response impaired |
| DOC-4 | No service-level .env.example | Root | Configuration confusion |

### HEALTH - Health Checks (2)
| ID | Issue | File | Evidence |
|----|-------|------|----------|
| HEALTH-1 | No startup probe endpoint | `health.routes.ts` | Slow startup not handled |
| HEALTH-2 | No explicit timeouts on health checks | `health.routes.ts` | Could hang |

### GD - Graceful Degradation (4)
| ID | Issue | File | Evidence |
|----|-------|------|----------|
| GD-1 | No circuit breakers | Entire service | Cascading failures |
| GD-2 | No explicit timeouts on DB/Redis | `config/*.ts` | Hung connections |
| GD-3 | No retry logic | `services/*.ts` | Single failure = request failure |
| GD-4 | No LB drain delay in shutdown | `index.ts` | Dropped requests during deploy |

### CFG - Configuration (4)
| ID | Issue | File | Evidence |
|----|-------|------|----------|
| CFG-1 | Secrets in env vars only | All configs | Should use secrets manager |
| CFG-2 | No .env.example at service level | Root | Developer confusion |
| CFG-3 | No log redaction configured | `logger.ts` | PII/secret leakage |
| CFG-4 | Secrets manager not implemented | `secrets.ts` | Production risk |

### DEP - Deployment (4)
| ID | Issue | File | Evidence |
|----|-------|------|----------|
| DEP-1 | Running as root in container | `Dockerfile` | Container escape risk |
| DEP-2 | No HEALTHCHECK in Dockerfile | `Dockerfile` | K8s can't detect unhealthy |
| DEP-3 | No CI/CD pipeline | Service | No automated security |
| DEP-4 | No image digest pinning | `Dockerfile` | Non-reproducible builds |

### MIG - Migrations (4)
| ID | Issue | File | Evidence |
|----|-------|------|----------|
| MIG-1 | All tables in single migration | `001_baseline_scanning.ts` | Hard to rollback |
| MIG-2 | RLS missing FORCE and WITH CHECK | Migrations | Security gap |
| MIG-3 | No migration tests | `tests/` | Untested schema |
| MIG-4 | Sequential naming not timestamps | Migrations | Merge conflicts |

---

## 🟠 HIGH Issues (46)

### Security (SEC-H)
| ID | Issue | File |
|----|-------|------|
| SEC-H1 | Unauthenticated policy routes | `routes/policies.ts` |

### Input Validation (INP-H)
| ID | Issue | File |
|----|-------|------|
| INP-H1 | QR validation POST no body schema | `qr.ts` |
| INP-H2 | Device registration no body schema | `devices.ts` |
| INP-H3 | Policy application no body schema | `policies.ts` |
| INP-H4 | Offline reconciliation no body schema | `offline.ts` |

### Error Handling (ERR-H)
| ID | Issue | File |
|----|-------|------|
| ERR-H1 | No custom error class hierarchy | Entire service |
| ERR-H2 | Stack traces possible in errors | Error handler |
| ERR-H3 | No database pool error handler | `database.ts` |

### Logging (LOG-H)
| ID | Issue | File |
|----|-------|------|
| LOG-H1 | No log rotation | `logger.ts` |
| LOG-H2 | No OpenTelemetry tracing | Entire service |

### S2S Auth (S2S-H)
| ID | Issue | File |
|----|-------|------|
| S2S-H1 | No service-level identity verification | Entire service |
| S2S-H2 | No credential rotation procedure | Docs |

### Database (DB-H)
| ID | Issue | File |
|----|-------|------|
| DB-H1 | No pool acquire timeout configured | `database.ts` |
| DB-H2 | Indexes not created CONCURRENTLY | Migrations |

### Idempotency (IDP-H)
| ID | Issue | File |
|----|-------|------|
| IDP-H1 | No idempotency_keys table | Migrations |

### Rate Limiting (RL-H)
| ID | Issue | File |
|----|-------|------|
| RL-H1 | No global baseline rate limit | `index.ts` |
| RL-H2 | No skipOnError for Redis failures | Middleware |
| RL-H3 | 429 response missing retry timing | `rate-limit.middleware.ts` |
| RL-H4 | In-memory storage by default | Middleware |

### Multi-Tenancy (MT-H)
| ID | Issue | File |
|----|-------|------|
| MT-H1 | Some queries rely solely on RLS | `devices.ts`, routes |
| MT-H2 | Redis keys missing tenant prefix | `QRValidator.ts` |
| MT-H3 | RLS policy doesn't handle NULL | Migrations |
| MT-H4 | No query wrapper enforcing tenant | Entire service |

### Testing (TST-H)
| ID | Issue | File |
|----|-------|------|
| TST-H1 | No tenant isolation tests | `tests/` |
| TST-H2 | No rate limit tests | `tests/` |
| TST-H3 | No transaction isolation | `tests/setup.ts` |
| TST-H4 | No test data factories | `tests/` |

### Documentation (DOC-H)
| ID | Issue | File |
|----|-------|------|
| DOC-H1 | No ADRs | `docs/decisions/` |
| DOC-H2 | Incomplete JSDoc | `src/services/` |
| DOC-H3 | No rate limit documentation | API docs |
| DOC-H4 | No CONTRIBUTING.md | Root |

### Graceful Degradation (GD-H)
| ID | Issue | File |
|----|-------|------|
| GD-H1 | No Redis error handler | `redis.ts` |
| GD-H2 | No statement timeout | `database.ts` |
| GD-H3 | No Redis command timeout | `redis.ts` |

### Configuration (CFG-H)
| ID | Issue | File |
|----|-------|------|
| CFG-H1 | No pre-commit secret scanning | Git |
| CFG-H2 | No secret rotation procedure | Docs |
| CFG-H3 | JWT key length not validated | `env.validator.ts` |
| CFG-H4 | SSL not enforced for DB | `database.ts` |

### Deployment (DEP-H)
| ID | Issue | File |
|----|-------|------|
| DEP-H1 | No .dockerignore | Service root |
| DEP-H2 | No npm audit in CI | CI/CD |
| DEP-H3 | No typecheck script | `package.json` |
| DEP-H4 | No rollback procedure | Docs |

### Migrations (MIG-H)
| ID | Issue | File |
|----|-------|------|
| MIG-H1 | No lock_timeout | Migrations |
| MIG-H2 | FKs without explicit cascade behavior | Migrations |
| MIG-H3 | String enums not DB enums | Schema |
| MIG-H4 | No CONCURRENTLY for indexes | Migrations |

---

## 🟡 MEDIUM Issues (~10)

| ID | Issue | File |
|----|-------|------|
| SEC-M1 | HTTPS redirect not enforced | Server |
| INP-M1 | Response schemas not defined | All routes |
| LOG-M1 | Timestamps not explicitly ISO 8601 | `logger.ts` |
| MT-M1 | Rate limits per-device not per-tenant | Rate limiting |
| HEALTH-M1 | No Kubernetes probe manifests | K8s/ |
| GD-M1 | No bulkhead pattern | Services |
| CFG-M1 | Environment indicator not in logs | Logger |
| DEP-M1 | npm install instead of npm ci | Dockerfile |
| MIG-M1 | Using timestamps() not timestamptz | Schema |
| DOC-M1 | No CHANGELOG.md | Root |

---

## Priority Fix Order

### P0 - Fix Immediately (Authentication & Security)
1. SEC-1,2,3: Add authentication to ALL routes (qr, devices, offline, policies)
2. INP-1,2,3: Add schema validation to all routes
3. MT-1,2: Fix RLS - add FORCE and WITH CHECK
4. DEP-1: Add non-root user to Dockerfile
5. DEP-2: Add HEALTHCHECK to Dockerfile
6. ERR-1: Move error handler before routes

### P1 - Fix This Week (Reliability)
1. S2S-2,3: Add JWT issuer/audience validation
2. LOG-1,2: Add redaction and correlation ID
3. GD-1: Add circuit breakers
4. RL-1,2,3: Add rate limiting to unprotected routes
5. CFG-3: Add log redaction
6. DB-1: Add FOR UPDATE locking

### P2 - Fix This Sprint (Quality)
1. TST-1-4: Create actual test files
2. DOC-1-4: Add README, OpenAPI, runbooks
3. IDP-1: Add Idempotency-Key support
4. ERR-3: Implement RFC 7807 errors

---

## Files to Create

| File | Purpose | Fixes |
|------|---------|-------|
| `src/middleware/correlation-id.ts` | Request tracing | ERR-2, LOG-2 |
| `src/errors/index.ts` | RFC 7807 errors | ERR-3 |
| `src/utils/circuit-breaker.ts` | External resilience | GD-1 |
| `src/middleware/idempotency.ts` | Request deduplication | IDP-1 |
| `migrations/002_fix_rls.ts` | RLS hardening | MT-1,2 |
| `.dockerignore` | Build optimization | DEP-H1 |
| `.env.example` | Config documentation | CFG-2 |
| `README.md` | Developer docs | DOC-1 |

## Files to Modify

| File | Changes | Fixes |
|------|---------|-------|
| `routes/qr.ts` | Add auth + validation | SEC-1, INP-1 |
| `routes/devices.ts` | Add auth + validation | SEC-2, INP-1 |
| `routes/offline.ts` | Add auth + validation | SEC-3, INP-1 |
| `routes/policies.ts` | Add auth + validation | SEC-H1, INP-1 |
| `middleware/auth.middleware.ts` | Add issuer/audience | S2S-2,3 |
| `index.ts` | Move error handler, add correlation | ERR-1, LOG-2 |
| `utils/logger.ts` | Add redaction | LOG-1, CFG-3 |
| `Dockerfile` | Non-root user, HEALTHCHECK | DEP-1,2 |

---

## Changelog

| Date | Author | Changes |
|------|--------|---------|
| 2025-12-27 | Audit | Initial findings |
| 2025-01-03 | Claude | Consolidated 117 issues |

---

## Service Status: 0% Complete

**0/117 issues fixed**
**117 issues remaining**

### Key Risks
- ⚠️ 10+ routes have NO authentication - anyone can generate QR codes
- ⚠️ RLS incomplete - table owner can bypass, INSERT not validated
- ⚠️ Zero tests exist - no confidence in service correctness
- ⚠️ Running as root - container escape vulnerability
- ⚠️ No circuit breakers - cascading failure risk
