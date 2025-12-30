# Search Service - Master Audit Findings

**Generated:** 2024-12-29
**Service:** search-service
**Port:** 3020
**Audits Reviewed:** 14 files

---

## Executive Summary

| Severity | Count |
|----------|-------|
| 🔴 CRITICAL | 43 |
| 🟠 HIGH | 63 |
| 🟡 MEDIUM | 65 |
| ✅ PASS | 292 |

**Key Strengths:**
- Excellent documentation (75.6%) - Best SERVICE_OVERVIEW.md in platform
- Solid configuration management with Joi validation (68%)
- Good deployment practices with multi-stage Docker builds (65.1%)
- Comprehensive search sanitization
- Multi-level caching (L1 + L2)

**Key Concerns:**
- Critical multi-tenancy gaps (36.4% pass rate)
- Severe service-to-service auth issues (24.2% pass rate)
- Health checks missing key dependencies (29% pass rate)
- No RLS on database tables
- Professional search routes missing tenant isolation
- Hardcoded credentials in multiple locations

---

## Audit Scores by Category

| Audit | CRITICAL | HIGH | MEDIUM | PASS | Score |
|-------|----------|------|--------|------|-------|
| 01-security | 4 | 5 | 5 | 31 | 62/100 |
| 02-input-validation | 3 | 4 | 7 | 22 | 58/100 |
| 03-error-handling | 5 | 6 | 5 | 17 | 42/100 |
| 04-logging-observability | 3 | 5 | 6 | 21 | 47/100 |
| 05-s2s-auth | 6 | 5 | 4 | 8 | 24/100 |
| 06-database-integrity | 3 | 5 | 4 | 18 | 47/100 |
| 07-idempotency | 3 | 5 | 4 | 14 | 40/100 |
| 09-multi-tenancy | 5 | 5 | 5 | 16 | 36/100 |
| 10-testing | 3 | 5 | 5 | 17 | 40/100 |
| 11-documentation | 1 | 3 | 4 | 31 | 76/100 |
| 12-health-checks | 3 | 5 | 4 | 11 | 29/100 |
| 16-caching | 2 | 4 | 5 | 26 | 48/100 |
| 19-configuration | 1 | 3 | 4 | 32 | 68/100 |
| 20-deployment | 1 | 3 | 3 | 28 | 65/100 |

---

## 🔴 CRITICAL Issues (43)

### 01-security (4 CRITICAL)
1. **JWT algorithm not specified** - `auth.middleware.ts:33` - Vulnerable to algorithm confusion
2. **Hardcoded JWT secret fallback** - `auth.middleware.ts:35` - `'dev-secret-key-change-in-production'`
3. **Professional search missing tenant isolation** - `professional-search.controller.ts:9,16,31,40` - Only uses `authenticate`, NOT `requireTenant`
4. **Rate limiting not registered** - `fastify.ts` - Middleware exists but not called

### 02-input-validation (3 CRITICAL)
1. **Validation middleware not applied** - `search.controller.ts:10-74` - Joi schemas exist but not registered
2. **No UUID format validation** - `search.schemas.ts:71` - `venue_id` allows any string
3. **No response schema** - All routes - Could leak internal ES fields

### 03-error-handling (5 CRITICAL)
1. **No global error handler** - `fastify.ts` - No `setErrorHandler` registered
2. **No process-level error handlers** - `index.ts` - No `unhandledRejection`, `uncaughtException`
3. **No not found handler** - `fastify.ts` - No `setNotFoundHandler`
4. **Error classes not used** - Services return `{ success: false }` instead of throwing
5. **No database pool error handler** - `dependencies.ts` - Pool errors crash process

### 04-logging-observability (3 CRITICAL)
1. **No sensitive data redaction** - `logger.ts` - No Pino redact configuration
2. **No metrics endpoint** - `fastify.ts` - `/metrics` not exposed
3. **No OpenTelemetry tracing** - Service-wide - Zero distributed tracing

### 05-s2s-auth (6 CRITICAL)
1. **Hardcoded RabbitMQ credentials** - `rabbitmq.ts:8` - `'amqp://admin:admin@rabbitmq:5672'`
2. **RabbitMQ unencrypted** - `rabbitmq.ts:8` - Uses `amqp://` not `amqps://`
3. **No JWT issuer/audience validation** - `auth.middleware.ts:33`
4. **Elasticsearch using HTTP** - `env.validator.ts:30-32` - Allows insecure HTTP
5. **No service identity in calls** - No X-Service-Name headers
6. **Hardcoded JWT secret fallback** - Same as 01-security

### 06-database-integrity (3 CRITICAL)
1. **No foreign key constraints** - `001_search_consistency_tables.ts` - Orphan records possible
2. **Missing tenant isolation** - All tables - No `tenant_id` column or RLS
3. **No statement timeout** - `database.ts:11-17` - Queries can hang forever

### 07-idempotency (3 CRITICAL)
1. **No message deduplication** - `rabbitmq.ts:14-22` - Same message processed multiple times
2. **Content sync without idempotency** - `content-sync.service.ts:17-53` - Race conditions
3. **No tenant in idempotency keys** - `consistency.service.ts:140-141` - Cross-tenant collisions

### 09-multi-tenancy (5 CRITICAL)
1. **Default tenant ID fallback** - `tenant-context.ts:3,11-13` - `00000000-0000-0000-0000-000000000001`
2. **No RLS on tables** - `001_search_consistency_tables.ts` - No database-level isolation
3. **Tenant ID not in DB operations** - `consistency.service.ts:41-50` - Missing from inserts
4. **Professional search missing requireTenant** - Same as 01-security
5. **Tenant accepted from request object** - `tenant-context.ts:11` - `(request as any).tenantId`

### 10-testing (3 CRITICAL)
1. **No coverage thresholds** - `jest.config.js` - Code merges without tests
2. **Missing search.service tests** - Core business logic untested
3. **No integration tests** - All tests use mocks, no real ES/Redis

### 11-documentation (1 CRITICAL)
1. **No OpenAPI specification** - Service root - No machine-readable API spec

### 12-health-checks (3 CRITICAL)
1. **Missing health probe endpoints** - `health.routes.ts` - No `/health/live`, `/health/ready`, `/health/startup`
2. **No Elasticsearch health check** - Primary data store not checked
3. **No event loop monitoring** - `app.ts` - No @fastify/under-pressure

### 16-caching (2 CRITICAL)
1. **No tenant isolation in cache keys** - `cache-integration.ts:26-32` - Cross-tenant data leakage
2. **No cache stampede prevention** - Service-wide - No jitter, no locking

### 19-configuration (1 CRITICAL)
1. **Default JWT secret in development** - `env.validator.ts:30-33` - Could leak to prod

### 20-deployment (1 CRITICAL)
1. **Image digest not pinned** - `Dockerfile:1` - Non-reproducible builds

---

## 🟠 HIGH Issues (63)

### Security & Auth (16 HIGH)
- Unvalidated index parameter in similar search
- Authorize function defined but not used
- No authentication event logging
- Elasticsearch TLS not enforced
- Authorization function returns void
- No correlation ID propagation
- No circuit breaker for Elasticsearch
- Authorization failures not logged
- No credential rotation mechanism
- Message processing without validation
- No query timeout on DB health check
- Error message exposure in health
- No connection pool stats
- Scattered process.env access
- No SSL mode for PostgreSQL
- No secrets manager integration

### Data & Validation (12 HIGH)
- Missing Unicode normalization
- Raw ES source returned without filtering
- Geo coordinate validation not used
- ES call inside transaction (holds locks)
- No pessimistic locking on sync status
- No serialization failure retry
- No CHECK constraints
- Hardcoded database credentials
- Token expiration/TTL not implemented
- No idempotent replay header
- Error responses not differentiated
- ES filter only applied conditionally

### Testing & Operations (13 HIGH)
- Missing controller tests
- Missing consistency service tests
- No rate limiting tests
- No contract tests
- No E2E tests
- No Redis health check
- MongoDB health function not used
- Session TTL too short (5 min)
- No version prefix for cache busting
- No Cache-Control headers
- No key normalization
- No rollback procedure documented
- No read-only filesystem

### Multi-Tenancy & Background (10 HIGH)
- No tenant validation in RabbitMQ consumer
- Content sync without tenant context
- No tenant ID format validation
- Background sync missing tenant propagation
- Race condition on sync status updates
- Bulk sync without concurrency control
- Performance monitor not used
- Default Node.js metrics not collected
- Validation failures not logged
- No .dockerignore file

### Error Handling (12 HIGH)
- Non-RFC 7807 error format
- No Elasticsearch timeout
- No circuit breaker for ES
- Correlation ID not in error responses
- No ES health check in probes
- Background processor error handling
- External ES errors not wrapped
- No retry for ES queries
- Inconsistent error return patterns
- No constraint violation mapping
- Analytics tracking silently fails
- Error responses not sanitized

---

## 🟡 MEDIUM Issues (65)

### Security (14 MEDIUM)
- No JWT issuer/audience validation
- Database SSL not configured
- No request ID correlation
- No IP-based rate limiting
- No auth token blacklist
- Console.log instead of logger in RabbitMQ
- No virtual host isolation
- Auth middleware per-route not global
- No service-to-service allowlist
- No log sanitization
- Missing .env.example at service level
- ELASTICSEARCH_NODE accepts HTTP
- No rotation support
- No --no-new-privileges flag

### Testing & Documentation (12 MEDIUM)
- No maxWorkers config
- No testTimeout configured
- No load tests
- Missing ES error tests
- No afterAll cleanup
- No formal ADRs
- No request/response examples
- No error catalog
- No C4 diagrams in standard format
- No deployment strategy documented
- Resource limits not in Dockerfile

### Caching & Performance (12 MEDIUM)
- Event TTL could be longer
- No circuit breaker for cache
- No TTL jitter
- No cache warming
- No memory monitoring
- Session data not minimized
- Detailed health endpoints no auth
- No response time tracking
- No IETF health response format
- No timestamp in health response

### Validation & Data (15 MEDIUM)
- Filter schema not exported
- Array limit inconsistency (50 vs 10)
- No limit on search_analytics index
- Consistency token length not validated
- Missing stripUnknown on filterSchema
- Sanitizer allows 0-length strings
- Non-ISO8601 timestamps in logs
- Console.log usage in performance monitor
- No log rotation configured
- No child loggers pattern
- No custom serializers

### Multi-Tenancy & Sync (12 MEDIUM)
- No multi-tenant user support
- No tenant-specific quotas
- Inconsistent tenant context setting
- No audit logging for tenant access
- Cache keys not all tenant-scoped
- Standard Idempotency-Key header not used
- No max retry limit enforcement
- No dead letter queue
- Consistency verification logs only
- No explicit key normalization

---

## ✅ What's Working Well (292 PASS items)

### Documentation (31 PASS - 75.6%)
- Exceptional SERVICE_OVERVIEW.md (~800+ lines)
- All routes documented with complete tables
- All 10 services with methods and features
- Architecture diagram included
- Environment variables clearly documented
- Security architecture (RLS, JWT) explained
- Data flow diagrams
- Scripts documented
- Rate limit presets documented
- Future enhancements listed

### Configuration (32 PASS - 68%)
- Comprehensive Joi validation
- Fail-fast on startup
- Typed configuration
- Production-specific checks
- JWT strength enforcement (64 chars)
- Clear error messages
- Sensible defaults
- Search timeout validated
- ES auth flexibility (username/password, API key, Cloud ID)
- Database pool validation

### Deployment (28 PASS - 65.1%)
- Multi-stage Docker build
- Alpine base image
- Non-root user (UID 1001)
- dumb-init for signal handling
- Docker HEALTHCHECK defined
- Graceful shutdown handlers
- Migration handling before startup
- Migration failure stops startup
- Single EXPOSE (3020)
- Proper ENTRYPOINT

### Search & Caching (26 PASS - 48.3%)
- Service-level key prefix
- Multiple TTL configurations
- Cache-aside pattern
- Multi-level caching (L1 + L2)
- Ticket TTL appropriate (30 sec)
- Event-driven invalidation via RabbitMQ
- Cache stats available
- Redis configurable

### Input Sanitization
- SearchSanitizer removes dangerous characters
- Consistent schema patterns with stripUnknown
- Date validation with ISO8601
- Pagination limits (min/max)
- Parameterized ES and Knex queries
- Auth on main routes

---

## Priority Fix Order

### P0: Fix Immediately

1. **Remove hardcoded credentials**
   - `rabbitmq.ts:8` - Remove `admin:admin` fallback
   - `auth.middleware.ts:35` - Remove JWT secret fallback
   - `env.validator.ts:30-33` - Remove default JWT in dev

2. **Add tenant isolation to professional search**
```typescript
   preHandler: [authenticate, requireTenant]  // Add requireTenant
```

3. **Remove default tenant ID fallback**
```typescript
   if (!tenantId) throw new Error('Tenant context required');
```

4. **Register rate limiting middleware**
```typescript
   await registerRateLimiting(fastify, redis, rateLimitPresets.search);
```

5. **Add global error handler**
```typescript
   fastify.setErrorHandler((error, request, reply) => {...});
   fastify.setNotFoundHandler((request, reply) => {...});
```

6. **Add health probe endpoints**
```typescript
   fastify.get('/health/live', liveHandler);
   fastify.get('/health/ready', readyHandler);  // Check ES, Redis, PG, MongoDB
```

7. **Add tenant ID to cache keys**
```typescript
   const tenantKey = `tenant:${tenantId}:${key}`;
```

### P1: Fix This Week

1. Add JWT algorithm whitelist: `algorithms: ['HS256']`
2. Add JWT issuer/audience validation
3. Switch RabbitMQ to amqps://
4. Add tenant_id column to database tables
5. Enable RLS on all tables
6. Add validation middleware to routes
7. Add process-level error handlers
8. Add Pino redaction for sensitive fields
9. Add /metrics endpoint
10. Add Elasticsearch health check

### P2: Fix This Sprint

1. Add OpenAPI specification
2. Add coverage thresholds to jest.config.js
3. Add search.service.test.ts
4. Add integration tests with real ES
5. Add circuit breaker for Elasticsearch
6. Add OpenTelemetry tracing
7. Add message deduplication in RabbitMQ
8. Pin Docker image to digest
9. Create .dockerignore
10. Document rollback procedures

---

## Remediation Effort Estimate

| Priority | Items | Estimated Hours |
|----------|-------|-----------------|
| P0 | 7 | 16 hours |
| P1 | 10 | 28 hours |
| P2 | 10 | 32 hours |
| **Total** | **27** | **76 hours** |

---

## Multi-Tenancy Gap Summary

The search-service has the **lowest multi-tenancy score (36.4%)** of all audited services:

| Gap | Impact | Fix |
|-----|--------|-----|
| Default tenant fallback | Unauthenticated access | Remove fallback, throw error |
| No RLS on tables | No DB-level isolation | Add tenant_id, enable RLS |
| Professional search no tenant | Cross-tenant search | Add requireTenant middleware |
| Tenant from request object | Attackers can set | Only accept from JWT |
| No tenant in cache keys | Data leakage | Prefix all keys |
| No tenant in DB operations | Shared data | Add tenant_id to all queries |

---

## Service-to-Service Auth Gap Summary

The search-service has the **lowest S2S auth score (24.2%)** of all audited services:

| Gap | Impact | Fix |
|-----|--------|-----|
| Hardcoded RabbitMQ creds | Credential exposure | Use env vars only |
| Unencrypted AMQP | Credentials in plaintext | Use amqps:// |
| No JWT iss/aud validation | Token reuse attacks | Add validation |
| HTTP for Elasticsearch | Data exposure | Enforce HTTPS |
| No service identity | No attribution | Add X-Service-Name |
| No message validation | Spoofed messages | Validate sender |

---

## External Dependencies

| Dependency | Health Checked | TLS | Auth |
|------------|---------------|-----|------|
| Elasticsearch | ❌ | ❌ HTTP allowed | ✅ Optional |
| PostgreSQL | ✅ | ❌ No SSL config | ✅ Required |
| Redis | ❌ | ❌ Not verified | ✅ Optional |
| MongoDB | ❌ (function exists) | ❌ Not verified | ✅ Optional |
| RabbitMQ | ❌ | ❌ Uses amqp:// | ❌ Hardcoded |

---

## Database Tables

| Table | tenant_id | RLS | Foreign Keys |
|-------|-----------|-----|--------------|
| search_operation_log | ❌ | ❌ | ❌ |
| sync_status | ❌ | ❌ | ❌ |

**Critical:** Both tables lack tenant isolation at every level.

---

## Test Coverage Gaps

| Component | Unit | Integration | E2E |
|-----------|------|-------------|-----|
| search.service | ❌ | ❌ | ❌ |
| search.controller | ❌ | ❌ | ❌ |
| consistency.service | ❌ | ❌ | ❌ |
| sync.service | ❌ | ❌ | ❌ |
| content-sync.service | ❌ | ❌ | ❌ |
| professional-search | ❌ | ❌ | ❌ |
| tenant.middleware | ✅ | ❌ | ❌ |
| auth.middleware | ✅ | ❌ | ❌ |
| sanitizer | ✅ | ❌ | ❌ |

---

## Cache Configuration

| Data Type | Current TTL | Recommended |
|-----------|-------------|-------------|
| Session | 5 min | 30 min - 4 hr |
| User | 5 min | 10 - 30 min |
| Event | 10 min | 30 - 60 min |
| Venue | 30 min | 1 - 4 hr |
| Ticket | 30 sec | 10 - 30 sec ✓ |
| Template | 60 min | 1 - 24 hr ✓ |
| Search | 5 min | 2 - 5 min ✓ |
