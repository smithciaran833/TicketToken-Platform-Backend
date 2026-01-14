# Queue-Service - Master Audit Findings

**Generated:** 2025-12-27
**Last Updated:** 2025-01-03
**Service:** queue-service
**Port:** 3008 (config) / 3011 (hardcoded - BUG)
**Audits Reviewed:** 15 files

---

## Executive Summary

| Severity | Count | Fixed | Remaining |
|----------|-------|-------|-----------|
| 🔴 CRITICAL | 12 | 0 | 12 |
| 🟠 HIGH | 33 | 0 | 33 |
| 🟡 MEDIUM | 26 | 0 | 26 |
| 🔵 LOW | 9 | 0 | 9 |
| **TOTAL** | **80** | **0** | **80** |

**Progress: 0% Complete**
**Risk Level:** 🟠 HIGH
**Average Audit Score: 80/100**

**Key Concerns:**
- Hardcoded JWT secret fallback (`dev-secret-change-in-production`)
- Solana private key not encrypted, not in secrets manager
- No correlation ID propagation across services
- Kubernetes health probe paths don't match service endpoints
- Webhooks sent without HMAC signature (can be spoofed)
- No JWT issuer/audience/algorithm validation
- No jitter in exponential backoff (thundering herd risk)

**Service Strengths:**
- Excellent three-tier queue architecture (money/communication/background)
- Comprehensive token bucket rate limiting with PostgreSQL
- Full idempotency implementation with configurable TTL
- Dead letter queue with bulk retry/delete
- Circuit breakers for all external services
- RLS enabled on all 10 database tables
- Multi-channel alerting (SMS/phone for critical)
- HPA, PDB, ServiceMonitor configured for K8s

---

## 🔴 CRITICAL Issues (12)

### SEC - Security (3)
| ID | Issue | File | Line | Evidence |
|----|-------|------|------|----------|
| SEC-1 | Hardcoded JWT secret fallback | `src/middleware/auth.middleware.ts` | 6 | `const JWT_SECRET = process.env.JWT_SECRET \|\| 'dev-secret-change-in-production'` |
| SEC-2 | Solana private key not encrypted at rest | `src/config/solana.config.ts` | 32-37 | Private key loaded from env, decoded directly, no encryption |
| SEC-3 | Solana key not loaded from secrets manager | `src/config/solana.config.ts` | 13 | `const SOLANA_PRIVATE_KEY = process.env.SOLANA_PRIVATE_KEY` - uses env directly |

### ERR - Error Handling (2)
| ID | Issue | File | Line | Evidence |
|----|-------|------|------|----------|
| ERR-1 | No correlation ID implementation | Entire service | - | No `x-correlation-id` header generation or propagation |
| ERR-2 | Job data lacks correlation ID | `src/controllers/job.controller.ts` | 49-53 | Job payload doesn't include correlationId for tracing |

### LOG - Logging (1)
| ID | Issue | File | Line | Evidence |
|----|-------|------|------|----------|
| LOG-1 | No correlation ID in log entries | `src/middleware/logging.middleware.ts` | 12-14 | Logs include `ip`, `query` but no `correlationId` |

### S2S - Service Auth (3)
| ID | Issue | File | Line | Evidence |
|----|-------|------|------|----------|
| S2S-1 | Webhooks sent without HMAC signature | `src/services/webhook.service.ts` | 28-32 | Only sends `Content-Type` and `User-Agent` headers, no signature |
| S2S-2 | No auth header on outbound service calls | `src/workers/money/payment.processor.ts` | 77-79 | Only sets `Content-Type` and `X-Idempotency-Key`, no `Authorization` |
| S2S-3 | Hardcoded JWT secret fallback | `src/middleware/auth.middleware.ts` | 6 | Same as SEC-1 |

### HEALTH - Health Checks (1)
| ID | Issue | File | Line | Evidence |
|----|-------|------|------|----------|
| HEALTH-1 | K8s probe paths don't match service | `k8s/deployment.yaml` vs `src/routes/health.routes.ts` | 46-66 | K8s expects `/health/live`, `/health/ready`, `/health/startup` but service only provides `/health` |

### CFG - Configuration (2)
| ID | Issue | File | Line | Evidence |
|----|-------|------|------|----------|
| CFG-1 | Hardcoded JWT secret fallback | `src/middleware/auth.middleware.ts` | 6 | Same as SEC-1 |
| CFG-2 | Solana private key not encrypted | `src/config/solana.config.ts` | 32-37 | Same as SEC-2 |

---

## 🟠 HIGH Issues (33)

### Security (SEC-H) - 5 issues
| ID | Issue | File | Line | Evidence |
|----|-------|------|------|----------|
| SEC-H1 | JWT algorithm not whitelisted | `src/middleware/auth.middleware.ts` | 31 | `jwt.verify(token, JWT_SECRET)` - no `algorithms` option, vulnerable to algorithm confusion |
| SEC-H2 | No JWT issuer validation | `src/middleware/auth.middleware.ts` | 31 | No `issuer` option in verify, accepts tokens from any issuer |
| SEC-H3 | No JWT audience validation | `src/middleware/auth.middleware.ts` | 31 | No `audience` option in verify, token misuse risk |
| SEC-H4 | No spending limits on blockchain ops | `src/config/solana.config.ts` | 75-83 | Only logs warning for low balance, no per-transaction or daily limits |
| SEC-H5 | No multi-sig for high-value NFT operations | Entire service | - | Single keypair used for all operations, no approval workflow |

### Error Handling (ERR-H) - 5 issues
| ID | Issue | File | Line | Evidence |
|----|-------|------|------|----------|
| ERR-H1 | Error responses not RFC 7807 format | `src/middleware/error.middleware.ts` | 16-19 | Returns `{ error, code }` not `{ type, title, status, detail, instance }` |
| ERR-H2 | No correlation ID in error responses | `src/middleware/error.middleware.ts` | 16-19 | Error response missing correlation ID for tracing |
| ERR-H3 | Stripe errors not categorized by type | `src/services/stripe.service.ts` | 95-113 | Returns generic error, no switch on `error.type` for card/rate limit/etc |
| ERR-H4 | No database pool error handler | `src/config/database.config.ts` | - | Missing `pool.on('error', ...)` handler |
| ERR-H5 | No explicit worker error event handlers | `src/workers/base.worker.ts` | - | Missing `worker.on('error', ...)` for worker-level errors |

### Logging (LOG-H) - 3 issues
| ID | Issue | File | Line | Evidence |
|----|-------|------|------|----------|
| LOG-H1 | No sensitive data redaction | `src/middleware/logging.middleware.ts` | 12 | Query params logged directly, may contain tokens/API keys |
| LOG-H2 | No OpenTelemetry distributed tracing | Entire service | - | No tracing library, no span creation |
| LOG-H3 | No trace IDs in error logs | Error handling | - | Error logs don't include trace IDs |

### S2S Auth (S2S-H) - 3 issues
| ID | Issue | File | Line | Evidence |
|----|-------|------|------|----------|
| S2S-H1 | No service identity in JWT claims | `src/middleware/auth.middleware.ts` | 8-12 | JWTPayload has `userId`, `tenantId`, `role` but no `serviceId` |
| S2S-H2 | No correlation ID in outbound requests | `src/workers/money/payment.processor.ts` | 77-79 | Headers don't include `x-correlation-id` |
| S2S-H3 | No webhook retry queue | `src/services/webhook.service.ts` | 18-49 | Single attempt, failed webhooks are lost |

### Database (DB-H) - 2 issues
| ID | Issue | File | Line | Evidence |
|----|-------|------|------|----------|
| DB-H1 | No pool error event handler | `src/config/database.config.ts` | - | Missing `pool.on('error', callback)` |
| DB-H2 | No connection timeouts configured | `src/config/database.config.ts` | - | Missing `acquireTimeoutMillis`, `createTimeoutMillis`, `idleTimeoutMillis` |

### Idempotency (IDP-H) - 1 issue
| ID | Issue | File | Line | Evidence |
|----|-------|------|------|----------|
| IDP-H1 | Check-and-store not atomic | `src/services/idempotency.service.ts` | 51-55 | `check()` separate from `store()`, race condition possible |

### Rate Limiting (RL-H) - 1 issue
| ID | Issue | File | Line | Evidence |
|----|-------|------|------|----------|
| RL-H1 | Fixed delay instead of calculated wait time | `src/workers/money/payment.processor.ts` | 42-47 | Uses fixed delay when rate limited, should use `rateLimiter.getWaitTime()` |

### Multi-Tenancy (MT-H) - 2 issues
| ID | Issue | File | Line | Evidence |
|----|-------|------|------|----------|
| MT-H1 | Tenant ID not included in job data | `src/controllers/job.controller.ts` | 49-53 | Job payload has `userId` but not `tenantId` |
| MT-H2 | No explicit tenant validation on job retrieval | `src/controllers/job.controller.ts` | 82-103 | `getJob()` relies solely on RLS, no explicit check |

### Documentation (DOC-H) - 1 issue
| ID | Issue | File | Line | Evidence |
|----|-------|------|------|----------|
| DOC-H1 | No deployment documentation | `docs/` | - | Missing DEPLOYMENT.md with runbook |

### Health Checks (HEALTH-H) - 2 issues
| ID | Issue | File | Line | Evidence |
|----|-------|------|------|----------|
| HEALTH-H1 | No /health/ready endpoint | `src/routes/health.routes.ts` | - | Only provides `/health`, K8s expects `/health/ready` |
| HEALTH-H2 | No /health/startup endpoint | `src/routes/health.routes.ts` | - | Only provides `/health`, K8s expects `/health/startup` |

### Graceful Degradation (GD-H) - 1 issue
| ID | Issue | File | Line | Evidence |
|----|-------|------|------|----------|
| GD-H1 | No jitter in exponential backoff | `src/config/retry-strategies.config.ts` | 28 | `backoff: { type: 'exponential', delay: 2000 }` - no jitter, thundering herd risk |

### Queues/Background Jobs (QBJ-H) - 2 issues
| ID | Issue | File | Line | Evidence |
|----|-------|------|------|----------|
| QBJ-H1 | No jitter in exponential backoff | `src/config/retry-strategies.config.ts` | - | Same as GD-H1 |
| QBJ-H2 | No drain timeout in graceful shutdown | `src/index.ts` | 62-68 | Closes queues but doesn't wait for in-progress jobs |

### Configuration (CFG-H) - 2 issues
| ID | Issue | File | Line | Evidence |
|----|-------|------|------|----------|
| CFG-H1 | Stripe/Solana keys not in secrets manager | `src/config/stripe.config.ts`, `src/config/solana.config.ts` | - | Both loaded from process.env directly |
| CFG-H2 | No secret rotation mechanism | Config | - | Requires restart to update secrets |

### Deployment (DEP-H) - 2 issues
| ID | Issue | File | Line | Evidence |
|----|-------|------|------|----------|
| DEP-H1 | No Node.js engine constraint | `package.json` | - | Missing `"engines": { "node": ">=18.0.0" }` |
| DEP-H2 | Port hardcoded as 3011 | `src/index.ts` | 41 | Should use `config.service.port` (3008) |

### Migrations (MIG-H) - 1 issue
| ID | Issue | File | Line | Evidence |
|----|-------|------|------|----------|
| MIG-H1 | No idempotent patterns | `src/migrations/001_baseline_queue.ts` | - | `createTable` fails if exists, should use `createTableIfNotExists` |

---

## 🟡 MEDIUM Issues (26)

### Security (SEC-M) - 4 issues
| ID | Issue | File | Line | Evidence |
|----|-------|------|------|----------|
| SEC-M1 | Token expiration not explicitly validated | `src/middleware/auth.middleware.ts` | 8-12 | JWTPayload interface doesn't include `exp`, relies on jwt.verify default |
| SEC-M2 | HTTPS enforcement relies on infrastructure | `src/app.ts` | - | No explicit HTTPS redirect middleware, relies on K8s ingress |
| SEC-M3 | Database SSL not explicitly configured | `src/config/database.config.ts` | - | May be in DATABASE_URL but not explicit |
| SEC-M4 | Secrets manager only loads DB credentials | `src/config/secrets.ts` | 16-21 | Only POSTGRES_PASSWORD, POSTGRES_USER, POSTGRES_DB loaded |

### Error Handling (ERR-M) - 3 issues
| ID | Issue | File | Line | Evidence |
|----|-------|------|------|----------|
| ERR-M1 | No setNotFoundHandler | `src/app.ts` | - | 404 responses may not follow standard format |
| ERR-M2 | Validation errors not RFC 7807 format | `src/middleware/validation.middleware.ts` | 17-23 | Returns `{ error: 'Validation failed', details: [...] }` |
| ERR-M3 | Error codes not documented as enum/constants | Entire service | - | Ad-hoc error code strings |

### Logging (LOG-M) - 2 issues
| ID | Issue | File | Line | Evidence |
|----|-------|------|------|----------|
| LOG-M1 | User ID not in log context | `src/middleware/logging.middleware.ts` | 12-14 | Logs IP but not `userId` when authenticated |
| LOG-M2 | Health status not exposed as Prometheus metric | `src/services/monitoring.service.ts` | - | Missing `service_health_status` gauge |

### S2S Auth (S2S-M) - 2 issues
| ID | Issue | File | Line | Evidence |
|----|-------|------|------|----------|
| S2S-M1 | No JWT secret rotation support | Config | - | Single static JWT_SECRET, no multi-key support |
| S2S-M2 | Webhook retry not implemented | `src/services/webhook.service.ts` | 18-49 | Single attempt only |

### Database (DB-M) - 1 issue
| ID | Issue | File | Line | Evidence |
|----|-------|------|------|----------|
| DB-M1 | SSL configuration not explicit | `src/config/database.config.ts` | - | No explicit `ssl: { rejectUnauthorized: true }` |

### Idempotency (IDP-M) - 1 issue
| ID | Issue | File | Line | Evidence |
|----|-------|------|------|----------|
| IDP-M1 | No cleanup job for expired idempotency keys | Scheduled jobs | - | `expires_at` column exists but no DELETE job |

### Rate Limiting (RL-M) - 1 issue
| ID | Issue | File | Line | Evidence |
|----|-------|------|------|----------|
| RL-M1 | Token release not consistently called | Processors | - | `releaseToken()` exists but not always called in finally block |

### Multi-Tenancy (MT-M) - 1 issue
| ID | Issue | File | Line | Evidence |
|----|-------|------|------|----------|
| MT-M1 | Prometheus metrics not labeled by tenant | `src/services/metrics.service.ts` | - | Metrics don't include `tenantId` label |

### Documentation (DOC-M) - 2 issues
| ID | Issue | File | Line | Evidence |
|----|-------|------|------|----------|
| DOC-M1 | OpenAPI spec incomplete | `src/docs/openapi.yaml` | - | Missing /metrics, /alerts, /rate-limits, POST /jobs endpoints |
| DOC-M2 | Inconsistent JSDoc coverage | Services | - | Some files have JSDoc, others don't |

### Health Checks (HEALTH-M) - 2 issues
| ID | Issue | File | Line | Evidence |
|----|-------|------|------|----------|
| HEALTH-M1 | No explicit Redis ping check | `src/controllers/health.controller.ts` | - | Checks queue status but not explicit `redis.ping()` |
| HEALTH-M2 | Health check results not as Prometheus metric | Monitoring | - | Health status not exposed for alerting |

### Graceful Degradation (GD-M) - 2 issues
| ID | Issue | File | Line | Evidence |
|----|-------|------|------|----------|
| GD-M1 | No fallback action when circuit breaker open | Processors | - | Circuit breaker prevents calls but no queue-for-later fallback |
| GD-M2 | Single Solana RPC endpoint | `src/config/solana.config.ts` | - | No secondary/failover RPC configured |

### Queues/Background Jobs (QBJ-M) - 2 issues
| ID | Issue | File | Line | Evidence |
|----|-------|------|------|----------|
| QBJ-M1 | No idempotency key cleanup job | Scheduled jobs | - | Same as IDP-M1 |
| QBJ-M2 | Graceful shutdown may not wait for in-progress jobs | `src/index.ts` | 62-68 | No explicit drain timeout |

### Configuration (CFG-M) - 1 issue
| ID | Issue | File | Line | Evidence |
|----|-------|------|------|----------|
| CFG-M1 | Pool size/timeouts not explicitly configured | `src/config/database.config.ts` | - | Using defaults, should be explicit |

### Deployment (DEP-M) - 1 issue
| ID | Issue | File | Line | Evidence |
|----|-------|------|------|----------|
| DEP-M1 | No HEALTHCHECK in Dockerfile | `Dockerfile` | - | K8s handles probes but Docker standalone benefits from HEALTHCHECK |

### Migrations (MIG-M) - 1 issue
| ID | Issue | File | Line | Evidence |
|----|-------|------|------|----------|
| MIG-M1 | Seed data not explicitly deleted in down migration | `src/migrations/001_baseline_queue.ts` | - | Table drop handles it but explicit delete is cleaner |

---

## 🔵 LOW Issues (9)

### Security (SEC-L) - 2 issues
| ID | Issue | File | Line | Evidence |
|----|-------|------|------|----------|
| SEC-L1 | Authorization failures not logged | `src/middleware/auth.middleware.ts` | 60-70 | `authorize()` returns 403 but doesn't log the attempt |
| SEC-L2 | Log retention policy not configured | `src/utils/logger.ts` | - | Basic Winston logger without rotation config |

### Error Handling (ERR-L) - 1 issue
| ID | Issue | File | Line | Evidence |
|----|-------|------|------|----------|
| ERR-L1 | Limited error class hierarchy | `src/utils/errors.ts` | 1-22 | Only AppError, ValidationError, NotFoundError - missing ForbiddenError, ConflictError |

### Logging (LOG-L) - 1 issue
| ID | Issue | File | Line | Evidence |
|----|-------|------|------|----------|
| LOG-L1 | No log rotation configuration | `src/utils/logger.ts` | - | Using Winston console transport only |

### Documentation (DOC-L) - 1 issue
| ID | Issue | File | Line | Evidence |
|----|-------|------|------|----------|
| DOC-L1 | Token bucket algorithm could use more comments | `src/services/rate-limiter.service.ts` | - | Complex logic has minimal inline documentation |

### Health Checks (HEALTH-L) - 1 issue
| ID | Issue | File | Line | Evidence |
|----|-------|------|------|----------|
| HEALTH-L1 | No timeout on health check operations | `src/controllers/health.controller.ts` | - | Health check could hang if dependency is slow |

### Queues/Background Jobs (QBJ-L) - 1 issue
| ID | Issue | File | Line | Evidence |
|----|-------|------|------|----------|
| QBJ-L1 | NFT minting is simulated | `src/workers/money/nft-mint.processor.ts` | - | Actual Solana minting marked as TODO |

### Configuration (CFG-L) - 1 issue
| ID | Issue | File | Line | Evidence |
|----|-------|------|------|----------|
| CFG-L1 | SSL configuration implicit | Database config | - | May be in URL but not explicitly documented |

### Deployment (DEP-L) - 1 issue
| ID | Issue | File | Line | Evidence |
|----|-------|------|------|----------|
| DEP-L1 | Node.js version not pinned in Dockerfile | `Dockerfile` | - | Should use specific version like `node:18.19-alpine` |

---

## Priority Fix Order

### P0 - Fix Immediately (Security & K8s)
| Priority | ID | Issue | Risk |
|----------|-----|-------|------|
| 1 | SEC-1/CFG-1/S2S-3 | Remove hardcoded JWT secret fallback | Production compromise |
| 2 | SEC-2/SEC-3/CFG-2 | Move Solana private key to secrets manager | Key theft |
| 3 | S2S-1 | Add HMAC signature to webhooks | Webhook spoofing |
| 4 | HEALTH-1/HEALTH-H1/H2 | Add /health/live, /health/ready, /health/startup | K8s restart loops |
| 5 | SEC-H1/H2/H3 | Add JWT algorithm/issuer/audience validation | Token attacks |
| 6 | DEP-H2 | Fix hardcoded port 3011 → config.service.port | Wrong port |

### P1 - Fix This Week (Reliability)
| Priority | ID | Issue |
|----------|-----|-------|
| 1 | ERR-1/ERR-2/LOG-1 | Add correlation ID middleware and propagation |
| 2 | ERR-H1 | Implement RFC 7807 error format |
| 3 | GD-H1/QBJ-H1 | Add jitter to exponential backoff |
| 4 | IDP-H1 | Make idempotency check-and-store atomic |
| 5 | DB-H1/DB-H2 | Add pool error handler and timeouts |
| 6 | S2S-H2 | Add correlation ID to outbound requests |
| 7 | RL-H1 | Use calculated wait time when rate limited |

### P2 - Fix This Sprint (Quality)
| Priority | ID | Issue |
|----------|-----|-------|
| 1 | MT-H1/MT-H2 | Add tenantId to job data and validate on retrieval |
| 2 | IDP-M1/QBJ-M1 | Add idempotency key cleanup scheduled job |
| 3 | LOG-H1 | Add sensitive data redaction |
| 4 | DOC-H1 | Create DEPLOYMENT.md |
| 5 | DEP-H1 | Add Node.js engine constraint |
| 6 | CFG-H1 | Move Stripe key to secrets manager |
| 7 | QBJ-H2 | Add drain timeout in graceful shutdown |

---

## Files to Create

| File | Purpose | Fixes |
|------|---------|-------|
| `src/middleware/correlation-id.ts` | Request tracing | ERR-1, ERR-2, LOG-1 |
| `src/errors/index.ts` | RFC 7807 errors | ERR-H1, ERR-M2 |
| `src/routes/health-probes.routes.ts` | K8s probe endpoints | HEALTH-1, HEALTH-H1, HEALTH-H2 |
| `src/jobs/cleanup-idempotency.job.ts` | Scheduled cleanup | IDP-M1, QBJ-M1 |
| `docs/DEPLOYMENT.md` | Deployment guide | DOC-H1 |

## Files to Modify

| File | Changes | Fixes |
|------|---------|-------|
| `src/middleware/auth.middleware.ts` | Remove fallback, add JWT options, log auth failures | SEC-1, SEC-H1-H3, SEC-L1 |
| `src/config/solana.config.ts` | Load from secrets manager | SEC-2, SEC-3 |
| `src/config/stripe.config.ts` | Load from secrets manager | CFG-H1 |
| `src/services/webhook.service.ts` | Add HMAC signature, add retry queue | S2S-1, S2S-H3, S2S-M2 |
| `src/config/retry-strategies.config.ts` | Add jitter to all backoff configs | GD-H1, QBJ-H1 |
| `src/services/idempotency.service.ts` | Atomic check-and-store with ON CONFLICT | IDP-H1 |
| `src/index.ts` | Use config.service.port, add drain timeout | DEP-H2, QBJ-H2 |
| `src/controllers/job.controller.ts` | Add tenantId to job data, validate on get | MT-H1, MT-H2 |
| `src/config/database.config.ts` | Add pool error handler, timeouts, SSL | DB-H1, DB-H2, DB-M1 |
| `src/middleware/logging.middleware.ts` | Add redaction, userId, correlationId | LOG-H1, LOG-M1 |
| `src/workers/money/payment.processor.ts` | Use calculated wait time, add auth header | RL-H1, S2S-2, S2S-H2 |
| `src/middleware/error.middleware.ts` | RFC 7807 format, correlation ID | ERR-H1, ERR-H2 |
| `src/app.ts` | Add setNotFoundHandler | ERR-M1 |
| `package.json` | Add engines constraint | DEP-H1 |
| `Dockerfile` | Add HEALTHCHECK, pin Node version | DEP-M1, DEP-L1 |

---

## Changelog

| Date | Author | Changes |
|------|--------|---------|
| 2025-12-27 | Audit | Initial findings |
| 2025-01-03 | Claude | Consolidated 15 audit files - 80 total issues |

---

## Service Status: 0% Complete

**0/80 issues fixed**
**80 issues remaining**

### Critical Deployment Blockers
- ⚠️ K8s probes will fail - pods will restart continuously
- ⚠️ Hardcoded JWT fallback - production security vulnerability
- ⚠️ Hardcoded port 3011 mismatches config (3008)

### Key Security Risks
- ⚠️ Solana private key unencrypted in env vars
- ⚠️ Webhooks can be spoofed - no HMAC signature
- ⚠️ JWT accepts any algorithm/issuer/audience

### Reliability Risks  
- ⚠️ No correlation ID - debugging impossible
- ⚠️ Thundering herd risk - no jitter in backoff
- ⚠️ Idempotency race condition possible
