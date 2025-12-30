# Blockchain-Indexer Service - Master Audit Findings

**Generated:** 2024-12-29
**Service:** blockchain-indexer
**Ports:** 3012 (API), 3456 (Indexer API)
**Audits Reviewed:** 20 files

---

## Executive Summary

| Severity | Count |
|----------|-------|
| 🔴 CRITICAL | 14 |
| 🟠 HIGH | 49 |
| 🟡 MEDIUM | 50 |
| ✅ PASS | 320 |

**Overall Risk Level:** 🔴 HIGH - Service has significant security and reliability issues requiring immediate attention.

**Key Concerns:**
- NO TESTS EXIST (0% coverage) - Critical for blockchain data integrity service
- No event bus for cross-service communication - Other services can't react to blockchain events
- Tenant context errors swallowed - RLS may not be enforced
- RPC failover exists but not integrated into main indexer
- MongoDB write failures silently swallowed
- In-memory rate limiting (not distributed)
- No sensitive data redaction in logs
- Cache infrastructure exists but not used in routes

**Key Strengths:**
- Excellent documentation (88% score)
- Good health checks with startup validation
- Comprehensive RPC failover implementation (just needs integration)
- Circuit breaker and retry logic available
- Strong idempotency via signature-based deduplication
- Solid database schema with RLS on all tables

---

## Audit Scores by Category

| Audit | CRITICAL | HIGH | MEDIUM | PASS | Score |
|-------|----------|------|--------|------|-------|
| 01-security | 2 | 3 | 2 | 17 | 74/100 |
| 02-input-validation | 1 | 4 | 3 | 17 | 63/100 |
| 03-error-handling | 2 | 5 | 4 | 25 | 60/100 |
| 04-logging-observability | 2 | 6 | 5 | 22 | 56/100 |
| 05-s2s-auth | 2 | 5 | 4 | 21 | 53/100 |
| 06-database | 1 | 3 | 3 | 22 | 81/100 |
| 07-idempotency | 0 | 1 | 2 | 17 | 85/100 |
| 08-rate-limiting | 1 | 3 | 3 | 11 | 55/100 |
| 09-multi-tenancy | 1 | 2 | 3 | 18 | 72/100 |
| 10-testing | 1 | 5 | 3 | 0 | 0/100 |
| 11-documentation | 0 | 0 | 2 | 22 | 88/100 |
| 12-health-checks | 0 | 1 | 1 | 17 | 85/100 |
| 13-graceful-degradation | 0 | 2 | 2 | 18 | 78/100 |
| 19-configuration | 0 | 1 | 1 | 17 | 85/100 |
| 20-deployment | 0 | 1 | 2 | 16 | 80/100 |
| 31-external-integrations | 0 | 2 | 2 | 15 | 75/100 |
| 36-background-jobs | 0 | 2 | 3 | 18 | 72/100 |
| 37-event-driven | 1 | 2 | 3 | 12 | 60/100 |
| 38-caching | 0 | 1 | 2 | 15 | 75/100 |

---

## 🔴 All CRITICAL Issues (14)

### 01-security (2 CRITICAL)

1. **RLS context swallows errors**
   - File: `index.ts:77-80`
   - Issue: Tenant context errors are swallowed, request proceeds without RLS
   - Risk: Data leakage if RLS misconfigured
   - Evidence:
```typescript
   } catch (error) {
     // Allow request to proceed - RLS will block unauthorized access
   }
```

2. **No database SSL**
   - File: `database.ts`
   - Issue: PostgreSQL connection not encrypted
   - Risk: Data intercepted in transit

### 02-input-validation (1 CRITICAL)

1. **Missing additionalProperties: false**
   - File: All route schemas
   - Issue: Prototype pollution vulnerability
   - Risk: Mass assignment attacks

### 03-error-handling (2 CRITICAL)

1. **MongoDB write errors swallowed**
   - File: `transactionProcessor.ts:84-89`
   - Issue: Non-duplicate MongoDB errors logged but not re-thrown
   - Risk: Silent data loss
   - Evidence:
```typescript
   } catch (error) {
     logger.error({ error, signature }, 'Failed to save to MongoDB');
     // ERROR SWALLOWED - No re-throw!
   }
```

2. **Tenant context errors swallowed**
   - File: `index.ts:77-80`
   - Issue: Same as security finding - allows request without tenant context

### 04-logging-observability (2 CRITICAL)

1. **No sensitive data redaction**
   - File: `logger.ts`
   - Issue: Missing redact config for passwords, tokens, keys
   - Risk: Secrets exposed in logs

2. **Correlation ID not in logs**
   - File: Logger configuration
   - Issue: Cannot trace requests across systems

### 05-s2s-auth (2 CRITICAL)

1. **No mTLS/signed tokens for RPC**
   - File: Solana RPC calls
   - Issue: Unauthenticated RPC requests
   - Risk: Man-in-the-middle attacks

2. **Marketplace calls unauthenticated**
   - File: Marketplace tracker
   - Issue: No API key auth for external APIs

### 06-database (1 CRITICAL)

1. **MongoDB writes fail silently without retry**
   - File: `transactionProcessor.ts:84-89`
   - Issue: Failed writes not queued for retry
   - Risk: Data inconsistency between PostgreSQL and MongoDB

### 08-rate-limiting (1 CRITICAL)

1. **In-memory rate limiting (not distributed)**
   - File: `index.ts:68-71`
   - Issue: No Redis storage for rate limits
   - Risk: Bypass with multiple server instances
   - Evidence:
```typescript
   await app.register(rateLimit, {
     max: 100,
     timeWindow: '1 minute'
     // MISSING: redis: redisClient
   });
```

### 09-multi-tenancy (1 CRITICAL)

1. **Tenant context errors swallowed, RLS may not be set**
   - File: `index.ts:77-80`
   - Issue: If setTenantContext fails, request proceeds without tenant isolation
   - Risk: Cross-tenant data access

### 10-testing (1 CRITICAL)

1. **No tests exist - Zero test coverage**
   - File: Entire service
   - Issue: No Jest, Vitest, or any test framework
   - Risk: Regressions undetected, especially critical for blockchain data integrity
   - Evidence: No `tests/` directory, no test scripts in package.json

### 37-event-driven (1 CRITICAL)

1. **No event bus/message queue for cross-service communication**
   - File: Entire service architecture
   - Issue: Other services cannot subscribe to blockchain events
   - Risk: Tight coupling, no real-time updates for other services
   - Evidence: Events processed but never published to RabbitMQ/Kafka/Redis pub-sub

---

## 🟠 All HIGH Issues (49)

### 01-security (3 HIGH)
1. **HSTS missing** - Helmet config
2. **JWT algorithm not whitelisted** - No `algorithms: ['HS256']`
3. **Rate limits may be too permissive** - 100/min may be high

### 02-input-validation (4 HIGH)
1. **No base58 pattern validation** - Address/signature fields
2. **Unbounded offset** - No maximum on pagination
3. **No extracted data validation** - `extractMintData()` doesn't validate
4. **SELECT * usage** - Should use explicit columns

### 03-error-handling (5 HIGH)
1. **No RFC 7807 format** - Error responses
2. **No correlation ID in errors** - Cannot trace
3. **No unhandledRejection handler** - Process handler missing
4. **No uncaughtException handler** - Process handler missing
5. **Main indexer lacks failover** - Doesn't use RPCFailoverManager

### 04-logging-observability (6 HIGH)
1. **No request.log usage** - Uses global logger without context
2. **No security event logging** - Missing audit trail
3. **Deprecated prettyPrint option** - Pino config
4. **Metrics not instrumented** - Defined but not called
5. **No OpenTelemetry** - No distributed tracing
6. **Duplicate metrics implementations** - Two files for metrics

### 05-s2s-auth (5 HIGH)
1. **JWT secret from env** - Not from secrets manager
2. **No issuer validation** - Missing iss claim
3. **No audience validation** - Missing aud claim
4. **No service identity** - Not in outbound requests
5. **No algorithm whitelist** - Missing `algorithms: ['RS256']`

### 06-database (3 HIGH)
1. **No database SSL** - Connection not encrypted
2. **RLS context errors swallowed** - Same as security
3. **Dual-write not transactional** - PostgreSQL + MongoDB not atomic

### 07-idempotency (1 HIGH)
1. **Race condition in check-then-insert pattern** - Could duplicate work

### 08-rate-limiting (3 HIGH)
1. **Rate limit may be too permissive** - 100/min for all
2. **No rate limit headers** - Missing RateLimit-* headers
3. **No per-endpoint limits** - Expensive queries share limit

### 09-multi-tenancy (2 HIGH)
1. **Application may use superuser role** - BYPASSRLS not verified
2. **Missing tenant context in background jobs** - Indexer runs without tenant

### 10-testing (5 HIGH)
1. **No test framework** - No Jest/Vitest installed
2. **No test scripts** - No test commands
3. **No mocks** - No mock implementations
4. **No CI integration** - No test automation
5. **No integration tests** - Empty tests directory

### 12-health-checks (1 HIGH)
1. **No MongoDB health check in runtime** - Only PostgreSQL checked

### 13-graceful-degradation (2 HIGH)
1. **MongoDB failure silently swallowed** - No retry mechanism
2. **RPC failover not used in main indexer** - Uses direct Connection

### 19-configuration (1 HIGH)
1. **JWT_SECRET not in secrets manager** - Loaded from env

### 20-deployment (1 HIGH)
1. **TypeScript strict mode disabled** - `strict: false`, `noImplicitAny: false`

### 31-external-integrations (2 HIGH)
1. **RPC failover not integrated in indexer** - Available but not used
2. **No request timeout on RPC calls** - Could hang indefinitely

### 36-background-jobs (2 HIGH)
1. **No job queue system** - Uses basic setInterval
2. **No overlapping execution protection** - No mutex for jobs

### 37-event-driven (2 HIGH)
1. **No outbound event publishing** - Events not published
2. **No event schema versioning** - Schema evolution not supported

### 38-caching (1 HIGH)
1. **Cache not actually used in query routes** - Infrastructure exists but unused

---

## 🟡 All MEDIUM Issues (50)

### 01-security (2 MEDIUM)
1. Default tenant fallback (`00000000-0000-0000-0000-000000000001`)
2. No request ID propagation

### 02-input-validation (3 MEDIUM)
1. SELECT * in queries
2. Loose MongoDB query typing
3. No response filtering

### 03-error-handling (4 MEDIUM)
1. No 404 handler
2. No statement_timeout
3. No DLQ
4. No custom error class hierarchy

### 04-logging-observability (5 MEDIUM)
1. No child loggers
2. No tracing
3. Duplicate metrics implementations
4. No version in log context
5. No custom serializers

### 05-s2s-auth (4 MEDIUM)
1. No correlation ID propagation
2. Circuit breaker not integrated
3. No per-endpoint authorization
4. Missing S2S audit logging

### 06-database (3 MEDIUM)
1. No statement timeout
2. No FOR UPDATE locking
3. SELECT * usage

### 07-idempotency (2 MEDIUM)
1. No locking on concurrent processing
2. MongoDB duplicate handling silent

### 08-rate-limiting (3 MEDIUM)
1. Missing onExceeded logging
2. No Solana RPC rate limiting
3. Trust proxy not explicit

### 09-multi-tenancy (3 MEDIUM)
1. No explicit tenant validation in queries
2. Cache keys not tenant-prefixed
3. No FORCE ROW LEVEL SECURITY

### 10-testing (3 MEDIUM)
1. No test fixtures
2. No coverage reporting
3. No test documentation

### 11-documentation (2 MEDIUM)
1. No API versioning documentation
2. Missing error code reference

### 12-health-checks (1 MEDIUM)
1. No Redis health check in runtime

### 13-graceful-degradation (2 MEDIUM)
1. No fallback for marketplace tracker
2. Database pool exhaustion not handled

### 19-configuration (1 MEDIUM)
1. No config schema validation (beyond required checks)

### 20-deployment (2 MEDIUM)
1. No CI/CD pipeline config found
2. Healthcheck port mismatch (3012 vs 3456)

### 31-external-integrations (2 MEDIUM)
1. Missing retry on marketplace API calls
2. No rate limit handling (429 responses)

### 36-background-jobs (3 MEDIUM)
1. In-flight jobs not tracked on shutdown
2. Missing job priority
3. No dead letter handling

### 37-event-driven (3 MEDIUM)
1. WebSocket reconnection not handled
2. No event replay capability
3. Limited event metadata (no correlation IDs)

### 38-caching (2 MEDIUM)
1. No cache invalidation strategy
2. No tenant-scoped cache keys

---

## ✅ What's Working Well (320 PASS items)

### Documentation (88% - Excellent!)
- 730+ line SERVICE_OVERVIEW.md
- All components documented
- Database schema with RLS policies documented
- Architecture diagrams and data flow
- All environment variables documented
- Prometheus metrics listed

### Health Checks (85%)
- Two-tier health checks (simple liveness + comprehensive readiness)
- Startup validation for all required configs
- Connection testing for PostgreSQL, MongoDB, Solana RPC
- Indexer lag monitoring (unhealthy when >10,000 slots)
- Proper HTTP status codes (200/503)

### Idempotency (85%)
- Signature-based deduplication (cryptographically unique)
- Database unique constraints
- ON CONFLICT DO NOTHING pattern
- Resumable processing from last known state
- All GET endpoints naturally idempotent

### Configuration (85%)
- Typed configuration with interfaces
- Required variable validation
- Value format validation (ports, URLs, networks)
- Fail-fast on invalid config
- Connection testing at startup

### Database Schema (81%)
- RLS enabled on all 6 tables
- Proper indexes
- Foreign key constraints
- Unique constraints on signatures
- tenant_id on all tables

### Graceful Degradation (78%)
- Circuit breaker implementation (full state machine)
- Retry logic with exponential backoff
- RPC failover manager (excellent design)
- SIGTERM/SIGINT handlers
- Graceful shutdown with cleanup

### External Integrations (75%)
- Multi-marketplace tracking (Magic Eden, Tensor, Solanart)
- WebSocket subscriptions with polling fallback
- On-chain verification utilities
- Per-endpoint circuit breakers
- Health checks every 30s

---

## Priority Fix Order

### P0: Fix Immediately (Security & Data Integrity)

1. **Add test framework and write critical tests**
```bash
   npm install -D jest @types/jest ts-jest supertest
```
   - Priority tests: transaction processing, reconciliation, RLS

2. **Don't swallow tenant context errors**
```typescript
   app.addHook('onRequest', async (request, reply) => {
     try {
       await setTenantContext(request, reply);
     } catch (error) {
       logger.error({ error }, 'Failed to set tenant context');
       return reply.code(500).send({ error: 'Tenant context failed' });
     }
   });
```

3. **Add Redis storage for rate limiting**
```typescript
   await app.register(rateLimit, {
     max: 100,
     timeWindow: '1 minute',
     redis: redis,
     skipOnError: true
   });
```

4. **Track failed MongoDB writes for retry**
```typescript
   } catch (error) {
     if (error.code !== 11000) {
       await this.queueFailedWrite(signature, tx);
       throw error; // Don't swallow
     }
   }
```

5. **Add sensitive data redaction to logger**
```typescript
   redact: {
     paths: ['*.password', '*.token', '*.secret', '*.apiKey'],
     censor: '[REDACTED]'
   }
```

### P1: Fix This Week (Reliability)

1. Integrate RPC failover into main indexer
2. Add database SSL configuration
3. Add unhandledRejection/uncaughtException handlers
4. Add overlapping execution protection for jobs
5. Add JWT algorithm whitelist
6. Enable TypeScript strict mode
7. Add event publishing to message queue

### P2: Fix This Sprint (Quality)

1. Add additionalProperties: false to all schemas
2. Add base58 pattern validation
3. Add correlation ID to all logs
4. Implement RFC 7807 error format
5. Add per-endpoint rate limits
6. Add tenant ID to cache keys
7. Actually use cache in query routes
8. Add MongoDB health check to runtime endpoint

---

## Remediation Effort Estimate

| Priority | Items | Estimated Hours |
|----------|-------|-----------------|
| P0 | 5 | 24 hours |
| P1 | 7 | 28 hours |
| P2 | 8 | 32 hours |
| **Total** | **20** | **84 hours** |

**Timeline:** ~2.5 weeks with 1 engineer dedicated full-time

---

## Architecture Notes

### Data Flow
```
Solana Blockchain
      ↓ (WebSocket + RPC polling)
TransactionProcessor
      ↓
   ┌──────┴──────┐
   ↓             ↓
PostgreSQL    MongoDB
      ↓
   ❌ NO EVENT BUS ❌
   (Other services can't subscribe)
```

### External Dependencies
- **Solana RPC** - Blockchain data (has failover manager, not used)
- **PostgreSQL** - Primary database (via PgBouncer:6432)
- **MongoDB** - Document storage
- **Redis** - Cache (infrastructure exists, not fully used)

### Background Jobs
| Job | Interval | Protection |
|-----|----------|------------|
| Transaction Polling | 5s | ❌ No overlap protection |
| Reconciliation | 5min | ❌ No overlap protection |
| Marketplace Polling | 30s | ❌ No overlap protection |

---

## Comparison to Other Services

| Metric | blockchain-indexer | api-gateway | analytics-service |
|--------|-------------------|-------------|-------------------|
| CRITICAL | 14 | 5 | 77 |
| HIGH | 49 | 19 | 57 |
| PASS | 320 | 586 | 217 |
| Tests | 0% | 63% | ~0% |
| Docs | 88% | 92% | N/A |

**blockchain-indexer needs significant work, especially testing.**

---

## Next Steps

1. **Immediate:** Add test framework and write critical path tests
2. **Immediate:** Fix tenant context error handling
3. **Immediate:** Add Redis to rate limiting
4. **This Week:** Integrate RPC failover into indexer
5. **This Week:** Add event publishing (RabbitMQ/Redis)
6. **This Sprint:** Enable TypeScript strict mode
7. **Ongoing:** Build out test coverage to 70%+

---

## Risk Assessment

| Risk | Impact | Likelihood | Severity |
|------|--------|------------|----------|
| Data inconsistency (MongoDB failures) | HIGH | HIGH | CRITICAL |
| Cross-tenant data access | HIGH | MEDIUM | CRITICAL |
| Regression bugs (no tests) | HIGH | HIGH | CRITICAL |
| RPC provider outage | MEDIUM | MEDIUM | HIGH |
| Rate limit bypass | MEDIUM | HIGH | HIGH |

**This service handles blockchain data integrity. Without tests and proper error handling, production issues are likely.**
