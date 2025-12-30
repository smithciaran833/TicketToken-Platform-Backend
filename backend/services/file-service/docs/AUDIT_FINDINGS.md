# File Service - Master Audit Findings

**Generated:** 2024-12-29
**Service:** file-service
**Port:** 3013
**Audits Reviewed:** 17 files

---

## Executive Summary

| Severity | Count |
|----------|-------|
| 🔴 CRITICAL | 77 |
| 🟠 HIGH | 67 |
| 🟡 MEDIUM | 0 |
| ✅ PASS | 98 |

---

## Audit Scores by Category

| Audit | CRITICAL | HIGH | MEDIUM | PASS | Score |
|-------|----------|------|--------|------|-------|
| 01-security | 4 | 4 | 0 | 17 | 72/100 |
| 02-input-validation | 5 | 4 | 0 | 2 | 38/100 |
| 03-error-handling | 6 | 6 | 0 | 7 | 45/100 |
| 04-logging-observability | 6 | 5 | 0 | 7 | 42/100 |
| 05-s2s-auth | 8 | 5 | 0 | 6 | 32/100 |
| 06-database-integrity | 6 | 5 | 0 | 8 | 52/100 |
| 07-idempotency | 5 | 4 | 0 | 3 | 15/100 |
| 08-rate-limiting | 3 | 4 | 0 | 5 | 35/100 |
| 09-multi-tenancy | 6 | 4 | 0 | 3 | 22/100 |
| 10-testing | 7 | 0 | 0 | 5 | 28/100 |
| 11-documentation | 5 | 4 | 0 | 5 | 48/100 |
| 12-health-checks | 3 | 4 | 0 | 6 | 42/100 |
| 13-graceful-degradation | 3 | 4 | 0 | 6 | 45/100 |
| 19-configuration-management | 4 | 5 | 0 | 5 | 45/100 |
| 20-deployment-cicd | 3 | 5 | 0 | 7 | 52/100 |
| 21-database-migrations | 3 | 4 | 0 | 6 | 55/100 |

---

## 🔴 CRITICAL Issues (77)

### 01-security (4 CRITICAL)
1. **Cache routes unprotected** - `/cache/stats`, `/cache/flush` exposed without auth
2. **Ticket PDF generation unprotected** - `/generate` missing auth
3. **Database SSL not configured** - No SSL in database config
4. **HTTPS not enforced** - Missing redirect middleware

### 02-input-validation (5 CRITICAL)
1. **No Fastify schema validation** - No schema definitions on ANY route
2. **Validators not integrated** - Joi validators exist but NOT used
3. **as any type casting** - Controllers cast request.body as any
4. **bulkDelete no array limit** - Could pass thousands of IDs
5. **SVG watermark XSS risk** - Text embedded without sanitization

### 03-error-handling (6 CRITICAL)
1. **No unhandledRejection handler** - Missing process handler
2. **No uncaughtException handler** - Missing process handler
3. **Error responses not RFC 7807** - Non-standard format
4. **No correlation ID support** - Cannot trace requests
5. **No database pool error handler** - Missing pool.on('error')
6. **No setNotFoundHandler** - Missing 404 handler

### 04-logging-observability (6 CRITICAL)
1. **No correlation ID support** - Missing middleware
2. **No sensitive data redaction** - No redaction config
3. **Metrics not integrated** - Defined but not called
4. **No OpenTelemetry tracing** - No SDK
5. **Winston instead of Pino** - Wrong logger for Fastify
6. **No request ID generation** - No genReqId configured

### 05-s2s-auth (8 CRITICAL)
1. **Shared JWT secret across services** - No per-service credentials
2. **No service identity verification** - Missing service identity claim
3. **JWT secret from env var** - Should use secrets manager
4. **Symmetric JWT algorithm** - Should use RS256/ES256
5. **No issuer validation** - Missing issuer check
6. **No audience validation** - Missing audience check
7. **Unprotected sensitive endpoints** - cache routes, PDF generate
8. **No service-level ACLs** - No per-endpoint allowlists

### 06-database-integrity (6 CRITICAL)
1. **No transactions in file upload** - DB + S3 not atomic
2. **Missing FK on files.uploaded_by** - No referential integrity
3. **No RLS on files table** - Main table unprotected
4. **tenant_id not in queries** - No tenant filtering
5. **No RLS context setting** - No middleware for app.current_tenant
6. **SSL cert verification disabled** - `rejectUnauthorized: false`

### 07-idempotency (5 CRITICAL)
1. **No idempotency on file upload** - Missing Idempotency-Key header
2. **No idempotency_keys table** - No storage for idempotency
3. **No hash-based deduplication** - Hash computed but NOT checked
4. **No recovery points** - Multi-step uploads vulnerable
5. **Race condition vulnerability** - No atomic idempotency checks

### 08-rate-limiting (3 CRITICAL)
1. **No Redis storage** - Not distributed
2. **IP-based limiting only** - No userId in keyGenerator
3. **No onExceeded logging** - Rate limit events not logged

### 09-multi-tenancy (6 CRITICAL)
1. **Files table lacks RLS** - Main table unprotected
2. **No tenant_id in queries** - `findById()` has no tenant filter
3. **No tenant middleware** - Missing tenant context
4. **S3 paths lack tenant isolation** - Should be `tenants/{tenantId}/`
5. **INSERT lacks tenant_id** - Not included in inserts
6. **File ownership checks tenant-blind** - No tenant_id filter

### 10-testing (7 CRITICAL)
1. **No integration tests** - 0% integration coverage
2. **No route tests** - No Fastify inject() tests
3. **No multi-tenant tests** - Cross-tenant prevention untested
4. **Upload controller untested** - Critical component
5. **File model untested** - Data layer untested
6. **Storage service untested** - S3/local untested
7. **No security tests** - No OWASP tests

### 11-documentation (5 CRITICAL)
1. **No README.md** - Missing quick start
2. **No OpenAPI spec** - No API documentation
3. **No runbooks** - No operational docs
4. **No ADRs** - Architecture decisions undocumented
5. **No data breach playbook** - Critical for file service

### 12-health-checks (3 CRITICAL)
1. **No /health/live endpoint** - Missing liveness probe
2. **No /health/ready endpoint** - Missing readiness probe
3. **No /health/startup endpoint** - Missing startup probe

### 13-graceful-degradation (3 CRITICAL)
1. **No circuit breaker pattern** - No opossum for external services
2. **No S3 timeout configuration** - Operations can hang
3. **No HTTP client timeouts** - External calls unbounded

### 19-configuration-management (4 CRITICAL)
1. **No config validation at startup** - No envalid/zod validation
2. **process.env scattered throughout** - Not centralized
3. **No fail-fast on missing config** - Runtime errors instead
4. **Database SSL not enforced** - No sslmode=require

### 20-deployment-cicd (3 CRITICAL)
1. **TypeScript strict mode disabled** - `strict: false`
2. **No rollback procedure** - Missing runbook
3. **No container image signing** - No Cosign

### 21-database-migrations (3 CRITICAL)
1. **No RLS on files table** - Main table unprotected
2. **Missing foreign keys on files** - No referential integrity
3. **SSL cert verification disabled** - `rejectUnauthorized: false`

---

## 🟠 HIGH Issues (67)

### 01-security (4 HIGH)
1. Rate limiters defined but not applied
2. JWT algorithm not explicitly specified
3. Default database credentials
4. JWT secret not validated at startup

### 02-input-validation (4 HIGH)
1. UUID params not validated
2. No response schemas
3. Video transcode accepts any format
4. QR endpoints no validation

### 03-error-handling (6 HIGH)
1. Raw error messages exposed
2. No PostgreSQL error code handling
3. Error classes lack context support
4. No circuit breaker
5. No transactions for multi-step operations
6. No retry logic

### 04-logging-observability (5 HIGH)
1. Rate limit events not logged
2. Auth failures not metered
3. No log rotation
4. Stack traces in production
5. HTTP metrics not tracked

### 05-s2s-auth (5 HIGH)
1. No mTLS implementation
2. No correlation ID propagation
3. No circuit breaker
4. Authentication not global
5. Service identity not in logs

### 06-database-integrity (5 HIGH)
1. No FOR UPDATE locking
2. Missing statement timeout
3. No unique constraint on hash
4. No pool timeouts
5. No partial unique indexes

### 07-idempotency (4 HIGH)
1. Chunked init not idempotent
2. PDF generation not idempotent
3. No response caching for duplicates
4. No idempotency middleware

### 08-rate-limiting (4 HIGH)
1. Same limit for all operations
2. No skipOnError
3. Upload endpoints too permissive
4. Cache flush unprotected

### 09-multi-tenancy (4 HIGH)
1. No SET LOCAL for RLS context
2. Missing FORCE ROW LEVEL SECURITY
3. No WITH CHECK on policies
4. Many tables lack tenant_id column

### 11-documentation (4 HIGH)
1. No SECURITY.md
2. No architecture diagrams
3. No incident response plan
4. No API examples

### 12-health-checks (4 HIGH)
1. No event loop monitoring
2. No Redis health check
3. No combined readiness check
4. Detailed health requires auth

### 13-graceful-degradation (4 HIGH)
1. No retry with backoff
2. No load shedding
3. No bulkhead pattern
4. Redis failure cascades

### 19-configuration-management (5 HIGH)
1. No log redaction
2. No secret rotation docs
3. Redis TLS not configured
4. JWT not in secrets manager
5. No secrets fallback/retry

### 20-deployment-cicd (5 HIGH)
1. No lint script
2. No type-check script
3. strictNullChecks disabled
4. No automated image rebuilds
5. CI/CD pipeline unknown

### 21-database-migrations (4 HIGH)
1. No statement timeout
2. Indexes not CONCURRENTLY
3. No lock_timeout
4. No pool acquire timeout

---

## ✅ What's Working Well (98 PASS items)

### Security
- All protected routes use auth middleware
- JWT signature verified
- Token expiration validated
- Object ownership verified before access
- Admin functions check admin role
- Multi-tenant data isolation via middleware
- Deny by default authorization
- Connection password from environment
- Parameterized queries (Knex)

### Dockerfile & Deployment
- Multi-stage Docker build
- Non-root user with explicit UID
- dumb-init for signal handling
- Docker HEALTHCHECK configured
- Alpine minimal base image
- Migrations run before app start
- No secrets in Dockerfile

### Database Schema
- UUID primary keys on all tables
- RLS on file_shares, image_metadata, video_metadata
- Comprehensive indexes
- CHECK constraints on quotas
- Connection pool configured
- All migrations have down functions

### Graceful Shutdown
- SIGTERM/SIGINT handlers
- Graceful shutdown closes connections
- Database pool timeouts
- ClamAV timeout configured
- Virus scan graceful degradation

### Testing Infrastructure
- Jest configured with 80% coverage thresholds
- Some middleware tests exist
- Some service tests exist
- Validator tests exist

### Documentation
- SERVICE_OVERVIEW.md comprehensive (800+ lines)
- All 30 endpoints documented
- Database schema documented
- Environment variables documented
- .env.example exists

---

## Priority Fix Order

### P0: Fix Immediately

1. **Add tenant_id filtering to all queries**
2. **Enable RLS on files table**
3. **Add authentication to cache and PDF routes**
4. **Add Fastify schema validation to all routes**
5. **Add unhandledRejection/uncaughtException handlers**
6. **Enable database SSL**

### P1: Fix This Week

1. Add idempotency support for file upload
2. Add circuit breakers for S3, ClamAV, Redis
3. Apply rate limiters to routes
4. Add correlation ID middleware
5. Add sensitive data redaction
6. Enable TypeScript strict mode
7. Add integration tests

### P2: Fix This Sprint

1. Add Kubernetes health probes
2. Implement RFC 7807 error format
3. Add OpenTelemetry tracing
4. Create README.md and runbooks
5. Add hash-based deduplication
6. Add S3 tenant path isolation
7. Add foreign keys to files table

---

## Remediation Effort Estimate

| Priority | Items | Estimated Hours |
|----------|-------|-----------------|
| P0 | 6 | 24 hours |
| P1 | 7 | 32 hours |
| P2 | 7 | 28 hours |
| **Total** | **20** | **84 hours** |

---

## Cross-Tenant Attack Scenarios

**Scenario 1:** User from Tenant B guesses file ID from Tenant A
- File lookup by ID only (no tenant filter)
- Returns Tenant A's file to Tenant B

**Scenario 2:** Entity enumeration across tenants
- findByEntity() has no tenant filter
- Returns files from any tenant's entities

**Scenario 3:** S3 path traversal
- No tenant prefix in S3 paths
- Direct S3 access could expose other tenants' files

---

## Storage Architecture Issue
```
Current:  uploads/{fileId}/{filename}
Expected: uploads/tenants/{tenantId}/{fileId}/{filename}
```

---

## Unprotected Endpoints

| Endpoint | Risk Level |
|----------|------------|
| GET /cache/stats | HIGH |
| DELETE /cache/flush | CRITICAL |
| POST /tickets/pdf/generate | CRITICAL |
| GET /metrics | MEDIUM |

---

## Detailed Issue Breakdown by Category

### Input Validation Gap Analysis

**Controllers NOT Using Validators:**

| Controller | Method | Issue |
|------------|--------|-------|
| image.controller.ts | resize | `request.body as any` - no validation |
| image.controller.ts | crop | `request.body as any` - no validation |
| image.controller.ts | rotate | `request.body as { angle: number }` - no validation |
| image.controller.ts | watermark | `request.body as any` - no validation |
| qr.controller.ts | generateQRCode | `request.body as any` - no validation |
| document.controller.ts | convertFormat | `request.body as { format: string }` - no validation |
| video.controller.ts | transcode | `request.body as any` - no validation |
| admin.controller.ts | bulkDelete | No UUID validation on fileIds |

**Validators Exist But Unused:**
- `src/validators/upload.validator.ts` - Has Joi schemas, not integrated
- `src/validators/qr.validator.ts` - generateQRSchema defined, not used

---

### Multi-Tenancy Schema Analysis

| Table | tenant_id | RLS Enabled | RLS Policy |
|-------|-----------|-------------|------------|
| files | ✅ Added in 003 | ❌ NOT ENABLED | N/A |
| file_access_logs | ❌ MISSING | ❌ | N/A |
| file_versions | ❌ MISSING | ❌ | N/A |
| upload_sessions | ❌ MISSING | ❌ | N/A |
| file_shares | ✅ YES | ✅ ENABLED | tenant_isolation_policy |
| image_metadata | ✅ YES | ✅ ENABLED | tenant_isolation_policy |
| video_metadata | ✅ YES | ✅ ENABLED | tenant_isolation_policy |

**Vulnerable Query Pattern:**
```typescript
// file.model.ts - NO tenant filtering!
async findById(id: string): Promise<FileRecord | null> {
  const query = 'SELECT * FROM files WHERE id = $1 AND deleted_at IS NULL';
  // ❌ No tenant_id filter!
}
```

---

### Missing Foreign Keys

| Table | Column | Should Reference | FK Defined |
|-------|--------|------------------|------------|
| files | uploaded_by | users.id | ❌ NO |
| files | tenant_id | tenants.id | ❌ NO |
| files | venue_id | venues.id | ❌ NO |
| file_uploads | user_id | users.id | ❌ NO |
| file_access_logs | accessed_by | users.id | ❌ NO |

---

### Rate Limiting Gap Analysis

| Operation | Resource Cost | Current Limit | Recommended |
|-----------|---------------|---------------|-------------|
| GET /files/:id | LOW | 100/min | 500/min |
| POST /upload | HIGH | 100/min | 20/min |
| POST /upload/from-url | HIGH | 100/min | 10/min |
| POST /images/resize | HIGH | 100/min | 30/min |
| POST /tickets/pdf/generate | VERY HIGH | 100/min | 10/min |
| DELETE /cache/flush | CRITICAL | 100/min | 5/min |

**Rate Limiters Defined But Not Applied:**
- `uploadRateLimiter` - defined in rate-limit.ts, NOT applied to routes
- `processingRateLimiter` - defined in rate-limit.ts, NOT applied to routes

---

### Idempotency Gap Analysis

| Endpoint | Idempotency Status | Risk |
|----------|-------------------|------|
| POST /upload | ❌ MISSING | HIGH |
| POST /upload/chunked/init | ❌ MISSING | HIGH |
| POST /upload/chunked/:sessionId/chunk/:chunkNumber | ⚠️ PARTIAL (sessionId) | MEDIUM |
| POST /upload/chunked/:sessionId/complete | ⚠️ PARTIAL (sessionId) | MEDIUM |
| POST /upload/from-url | ❌ MISSING | HIGH |
| POST /tickets/pdf/generate | ❌ MISSING | HIGH |
| POST /qr/generate | ❌ MISSING | MEDIUM |
| POST /images/resize | ❌ MISSING | LOW |
| DELETE /cache/flush | ❌ MISSING | HIGH |

**Missing Database Schema:**
```sql
-- Required: idempotency_keys table
CREATE TABLE idempotency_keys (
  id UUID PRIMARY KEY,
  idempotency_key VARCHAR(255) NOT NULL,
  tenant_id UUID NOT NULL,
  request_path VARCHAR(500) NOT NULL,
  response_code INTEGER,
  response_body JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  UNIQUE(tenant_id, idempotency_key)
);
```

---

### Health Check Endpoints

| Endpoint | Auth | Purpose | Status |
|----------|------|---------|--------|
| GET /health | None | Basic health (Docker) | ✅ EXISTS |
| GET /health/db | None | Database connectivity | ✅ EXISTS |
| GET /health/live | None | Kubernetes liveness | ❌ MISSING |
| GET /health/ready | None | Kubernetes readiness | ❌ MISSING |
| GET /health/startup | None | Kubernetes startup | ❌ MISSING |
| GET /metrics | None | Prometheus metrics | ✅ EXISTS |
| GET /metrics/json | Admin | JSON metrics | ✅ EXISTS |
| GET /metrics/health | Admin | Detailed health | ✅ EXISTS |

**Component Health Checks:**

| Component | In Health Check | Status |
|-----------|-----------------|--------|
| PostgreSQL | /health/db | ✅ PASS |
| Redis | None | ❌ MISSING |
| S3 Storage | Admin only | ⚠️ PARTIAL |
| ClamAV | Admin only | ⚠️ PARTIAL |

---

### Test Coverage Analysis

**Tests Present (8 files):**
- auth.middleware.test.ts ✅
- file-ownership.middleware.test.ts ✅
- batch-processor.service.test.ts ✅
- cache.service.test.ts ✅
- duplicate-detector.service.test.ts ✅
- storage-quota.service.test.ts ✅
- virus-scan.service.test.ts ✅
- upload.validator.test.ts ✅

**Tests Missing (CRITICAL):**
- Upload Controller
- File Controller
- Upload Service
- Storage Service
- File Model
- All Routes (integration)
- Multi-tenant isolation
- Security/OWASP tests

**Test Pyramid:**

| Type | Expected | Actual | Gap |
|------|----------|--------|-----|
| Unit | 70% | 100% | Over-indexed |
| Integration | 20% | 0% | **Missing 20%** |
| E2E | 10% | 0% | **Missing 10%** |

---

### Error Handling Gaps

**Missing Process Handlers:**
```typescript
// Required but missing:
process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, 'Unhandled Rejection');
  // Graceful shutdown
});

process.on('uncaughtException', (error) => {
  logger.error({ error }, 'Uncaught Exception');
  process.exit(1);
});
```

**Current Error Format vs RFC 7807:**
```json
// Current
{ "error": "message", "statusCode": 500, "timestamp": "..." }

// RFC 7807 Required
{
  "type": "https://api.example.com/errors/internal",
  "title": "Internal Server Error",
  "status": 500,
  "detail": "...",
  "instance": "/files/123",
  "correlationId": "abc-123"
}
```

---

### Circuit Breaker Requirements

| Component | Current | Required |
|-----------|---------|----------|
| S3 Storage | ❌ None | opossum circuit breaker |
| ClamAV | ❌ None | opossum circuit breaker |
| Redis Cache | ❌ None | opossum circuit breaker |
| Database | ❌ None | Connection pool + circuit |

---

### Configuration Validation Required
```typescript
// Required: src/config/validate.ts
import { z } from 'zod';

const configSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  AWS_ACCESS_KEY_ID: z.string().min(16),
  AWS_SECRET_ACCESS_KEY: z.string().min(32),
  S3_BUCKET: z.string().min(3),
  REDIS_HOST: z.string().optional(),
  CLAMAV_HOST: z.string().optional(),
});

// Validate at startup, crash if invalid
configSchema.parse(process.env);
```

---

### TypeScript Configuration Issues

| Setting | Current | Required |
|---------|---------|----------|
| strict | false | true |
| strictNullChecks | false | true |
| noImplicitAny | false | true |
| noImplicitReturns | false | true |

---

## Next Steps

1. **Immediate:** Fix multi-tenancy (RLS + query filters)
2. **Immediate:** Add authentication to unprotected routes
3. **Immediate:** Add input validation schemas
4. **This Week:** Add circuit breakers
5. **This Week:** Add integration tests
6. **This Sprint:** Enable TypeScript strict mode
7. **Ongoing:** Build test coverage to 80%+
