# API Gateway - Master Audit Findings

**Generated:** 2024-12-29
**Service:** api-gateway
**Port:** 3000
**Audits Reviewed:** 20 files

---

## Executive Summary

| Severity | Count |
|----------|-------|
| 🔴 CRITICAL | 5 |
| 🟠 HIGH | 19 |
| 🟡 MEDIUM | 37 |
| ✅ PASS | 586 |

**Overall Risk Level:** 🟠 MODERATE - Gateway is well-implemented with few critical issues but some security gaps in S2S auth and input validation.

**Key Concerns:**
- x-gateway-internal header is spoofable (weak S2S auth)
- Pure proxy pattern means no gateway-level schema validation
- ProxyService re-throws errors without transformation
- Venue ID extracted from request body (should only use JWT)
- No coverage thresholds configured
- No tenant isolation in cache keys

**Key Strengths (Outstanding!):**
- Rate limiting: 94% score - Redis-backed, sliding window, bot detection
- Graceful degradation: 98% score - Opossum circuit breakers, retry with backoff
- API gateway patterns: 98% score - 15+ blocked headers, tenant from JWT only
- Documentation: 92% score - 600+ line OpenAPI, 500+ line runbooks
- Configuration: 95% score - Zod validation, production-specific rules
- CORS: 92% score - Dynamic origin validation, security logging

---

## Audit Scores by Category

| Audit | CRITICAL | HIGH | MEDIUM | PASS | Score |
|-------|----------|------|--------|------|-------|
| 01-security | 0 | 3 | 4 | 30 | 83/100 |
| 02-input-validation | 1 | 3 | 4 | 19 | 63/100 |
| 03-error-handling | 1 | 3 | 3 | 31 | 76/100 |
| 04-logging-observability | 0 | 2 | 3 | 44 | 85/100 |
| 05-s2s-auth | 1 | 3 | 3 | 28 | 72/100 |
| 07-idempotency | 0 | 0 | 1 | 9 | 90/100 |
| 08-rate-limiting | 0 | 0 | 1 | 48 | 94/100 |
| 09-multi-tenancy | 1 | 1 | 2 | 36 | 86/100 |
| 10-testing | 1 | 2 | 3 | 30 | 63/100 |
| 11-documentation | 0 | 0 | 2 | 46 | 92/100 |
| 12-health-checks | 0 | 1 | 2 | 28 | 88/100 |
| 13-graceful-degradation | 0 | 0 | 1 | 42 | 98/100 |
| 14-file-handling | 0 | 0 | 0 | 12 | 92/100 |
| 15-api-gateway | 0 | 0 | 1 | 48 | 98/100 |
| 19-configuration-management | 0 | 0 | 1 | 42 | 95/100 |
| 20-deployment-cicd | 0 | 1 | 2 | 24 | 80/100 |
| 22-api-versioning | 0 | 0 | 2 | 19 | 86/100 |
| 23-cors | 0 | 0 | 1 | 23 | 92/100 |
| 24-caching | 0 | 0 | 1 | 27 | 90/100 |

---

## 🔴 All CRITICAL Issues (5)

### 02-input-validation (1 CRITICAL)

1. **Routes use pure proxy - no gateway-level schema validation**
   - File: All proxy routes
   - Issue: Validation delegated entirely to downstream services
   - Risk: No defense-in-depth at gateway level
   - Evidence:
```typescript
   const setupProxy = createAuthenticatedProxy(server, {
     serviceUrl: `${serviceUrls.ticket}/api/v1/tickets`,
     // No schema validation at gateway level
   });
```

### 03-error-handling (1 CRITICAL)

1. **ProxyService re-throws errors without context/transformation**
   - File: `ProxyService` catch blocks
   - Issue: Raw errors passed through without proper categorization
   - Risk: Inconsistent error responses, potential information leakage
   - Evidence:
```typescript
   catch (error) {
     throw error; // Just re-throws!
   }
```

### 05-s2s-auth (1 CRITICAL)

1. **x-gateway-internal header is weak auth (spoofable)**
   - File: `AuthServiceClient.ts`
   - Issue: Static header can be spoofed by any attacker
   - Risk: Network attacker can impersonate gateway to downstream services
   - Evidence:
```typescript
   this.httpClient = axios.create({
     headers: {
       'x-gateway-internal': 'true' // Can be spoofed!
     }
   });
```

### 09-multi-tenancy (1 CRITICAL)

1. **Venue ID extracted from request body**
   - File: Venue context extraction
   - Issue: Should only use JWT/verified sources, not untrusted body
   - Risk: Tenant isolation bypass
   - Evidence:
```typescript
   const bodyVenueId = body?.venueId; // ❌ DANGEROUS
   const headerVenueId = request.headers['x-venue-id']; // ❌ DANGEROUS
```

### 10-testing (1 CRITICAL)

1. **No coverage thresholds configured**
   - File: `jest.config.js`
   - Issue: Coverage can degrade without detection
   - Risk: Regressions in critical security code undetected

---

## 🟠 All HIGH Issues (19)

### 01-security (3 HIGH)
1. **Fallback JWT secret hardcoded** - `config` - `'development_secret_change_in_production'`
2. **HSTS needs explicit configuration** - Helmet config
3. **auth-with-public-routes weak** - Alternative auth file

### 02-input-validation (3 HIGH)
1. **Missing maxLength on strings** - Multiple schemas
2. **Arrays without maxItems** - Ticket purchase items
3. **ticketPurchase items missing max** - Joi schemas

### 03-error-handling (3 HIGH)
1. **No RFC 7807 format** - Error responses
2. **No setNotFoundHandler** - `error-handler.middleware.ts`
3. **Missing correlation_id** - Uses requestId instead

### 04-logging-observability (2 HIGH)
1. **Missing PII redaction (email, phone)** - Logger config
2. **trackRequestMetrics TODO** - Not implemented

### 05-s2s-auth (3 HIGH)
1. **No HTTPS enforcement** - Internal service calls
2. **No per-service credentials** - Shared weak auth
3. **Correlation ID not propagated** - Missing in outbound requests

### 09-multi-tenancy (1 HIGH)
1. **RLS context setting is TODO** - Not implemented

### 10-testing (2 HIGH)
1. **Empty integration folder** - No integration tests
2. **No contract tests** - For 19 downstream services

### 12-health-checks (1 HIGH)
1. **No startup probe endpoint** - Missing /health/startup

### 20-deployment-cicd (1 HIGH)
1. **Missing HEALTHCHECK in Dockerfile**

---

## 🟡 All MEDIUM Issues (37)

### 01-security (4 MEDIUM)
1. No HTTPS redirect middleware
2. skipOnError disabled for rate limiting
3. Weak validation in alt file
4. Cookie security needs review

### 02-input-validation (4 MEDIUM)
1. Search schema unused
2. Joi schemas not applied to routes
3. Missing constraints
4. Type coercion enabled

### 03-error-handling (3 MEDIUM)
1. Error details in non-prod
2. No circuit breaker in proxy
3. 30s timeout (too long)

### 04-logging-observability (3 MEDIUM)
1. No ECS format
2. No trace ID in logs
3. Missing some authz logging

### 05-s2s-auth (3 MEDIUM)
1. No mTLS
2. Credentials not from secrets manager
3. No request signing

### 07-idempotency (1 MEDIUM)
1. Consider idempotency key format validation

### 08-rate-limiting (1 MEDIUM)
1. skipOnError: false (secure but may cause outages)

### 09-multi-tenancy (2 MEDIUM)
1. Admin bypass without audit logging
2. Cache key missing operation type

### 10-testing (3 MEDIUM)
1. Missing route tests
2. Missing rate limiting tests
3. Missing CORS tests

### 11-documentation (2 MEDIUM)
1. .env.example has DB config (gateway has no DB)
2. Missing README.md

### 12-health-checks (2 MEDIUM)
1. Dockerfile missing HEALTHCHECK
2. No event loop monitoring

### 13-graceful-degradation (1 MEDIUM)
1. Fallback not wired to all execute() calls

### 15-api-gateway (1 MEDIUM)
1. Proxy service doesn't use circuit breaker

### 19-configuration-management (1 MEDIUM)
1. .env.example has DATABASE_URL despite no database

### 20-deployment-cicd (2 MEDIUM)
1. Node 20 only constraint (too restrictive)
2. node_modules in prod image

### 22-api-versioning (2 MEDIUM)
1. No API-Version header in responses
2. No deprecation headers (Sunset/Deprecation)

### 23-cors (1 MEDIUM)
1. No-origin requests allowed (review needed)

### 24-caching (1 MEDIUM)
1. No tenant isolation in cache keys

---

## ✅ What's Working Well (586 PASS items)

### Rate Limiting (94% - Outstanding!)
- Redis-backed distributed limiting
- Atomic sliding window (Lua scripts)
- Multi-tier keys (User > API Key > IP)
- Custom ticket purchase protection (5/min)
- Bot detection (>10 attempts logged)
- Venue tier multipliers (premium: 10x, standard: 5x)
- Dynamic load adjustment
- Full rate limit headers (Limit, Remaining, Reset, Retry-After)

### Graceful Degradation (98% - Outstanding!)
- Opossum circuit breakers for all 19 services
- Per-service timeout configuration
- Exponential backoff with 10% jitter
- Service-specific retry configs (NFT: 5 retries, 10min max)
- TimeoutController for cascade management
- Clean graceful shutdown with connection draining
- 4xx never retried (correct)

### API Gateway Patterns (98% - Outstanding!)
- 15+ blocked headers (x-internal-*, x-tenant-id, x-admin-token)
- Tenant ID from verified JWT only
- x-tenant-source marker for downstream verification
- 4 load balancing strategies (round-robin, least-connections, random, consistent-hash)
- Health-aware routing
- Proper 502/503/504 error codes
- 50MB content limits
- No redirects (security)

### Documentation (92% - Outstanding!)
- 600+ line OpenAPI 3.0.3 specification
- 500+ line production runbooks with SLAs
- 700+ line SERVICE_OVERVIEW.md
- All 16 middleware documented in order
- DR procedures with RTOs
- Operation IDs for SDK generation

### Configuration (95%)
- Zod comprehensive validation
- Production schema stricter (JWT 32+ chars, Redis password 8+)
- Default value rejection in production
- Secrets never logged
- All 19 service URLs validated
- User-friendly error messages

### Security
- JWT authentication with signature verification
- Token blacklist checking with Redis
- Comprehensive header sanitization
- Role-based access control
- CSP headers via Helmet
- Request ID tracking with nanoid
- Security event logging with severity levels

### Health Checks (88%)
- Proper liveness/readiness separation
- Redis connectivity with latency warning (>100ms)
- Circuit breaker state monitoring
- Memory threshold (1GB)
- 2s timeout race pattern
- Critical service distinction

### Logging & Observability (85%)
- Pino structured JSON logging
- Custom serializers for safe logging
- Full Prometheus metrics (RED method)
- OpenTelemetry SDK initialized
- Slow request detection (>1000ms)
- Health check exclusion from logs

---

## Priority Fix Order

### P0: Fix Immediately (Security Risk)

1. **Implement proper S2S authentication**
   - Replace `x-gateway-internal: true` with JWT service tokens or HMAC signing
```typescript
   // Option A: JWT Service Tokens
   const serviceToken = await generateServiceToken({
     sub: 'api-gateway',
     iss: 'tickettoken-gateway',
     aud: ['auth-service'],
     exp: Math.floor(Date.now() / 1000) + 300
   });
   
   // Option B: HMAC Request Signing
   const signature = crypto.createHmac('sha256', secret)
     .update([method, path, timestamp, bodyHash].join('\n'))
     .digest('base64');
```

2. **Restrict venue ID extraction to trusted sources**
   - Only accept from route params, query, and JWT
   - Never accept from request body or untrusted headers

3. **Add tenant isolation to cache keys**
```typescript
   const tenantId = user?.tenant_id || 'public';
   cacheKey = `gateway:response:${tenantId}:${path}`;
```

### P1: Fix This Week (Reliability)

1. Transform proxy errors with proper context
2. Add gateway-level validation for critical endpoints (payment, ticket purchase)
3. Add HEALTHCHECK to Dockerfile
4. Add coverage thresholds to Jest config
5. Add startup probe endpoint (/health/startup)
6. Remove fallback JWT secret
7. Add RFC 7807 error format

### P2: Fix This Sprint (Quality)

1. Create integration tests with fastify.inject()
2. Add contract tests for downstream services
3. Propagate correlation ID in outbound requests
4. Add PII redaction (email, phone) to logger
5. Implement trackRequestMetrics
6. Add setNotFoundHandler
7. Wire circuit breaker to proxy service
8. Add API-Version response header

---

## Remediation Effort Estimate

| Priority | Items | Estimated Hours |
|----------|-------|-----------------|
| P0 | 3 | 16 hours |
| P1 | 7 | 24 hours |
| P2 | 8 | 32 hours |
| **Total** | **18** | **72 hours** |

**Timeline:** ~2 weeks with 1 engineer dedicated full-time

---

## Architecture Notes

### Correct Design Decisions
- Pure proxy pattern (validation in downstream services)
- No database at gateway level
- File handling delegated to file-service
- Idempotency delegated to downstream services
- Health endpoints unversioned

### Service Dependencies (19 services)
All proxied through gateway with circuit breakers:
- auth-service, venue-service, event-service
- ticket-service, payment-service, nft-service
- analytics-service, notification-service, file-service
- search-service, user-service, and others

---

## Next Steps

1. **Immediate:** Replace x-gateway-internal with proper S2S auth
2. **Immediate:** Fix venue ID extraction (JWT only)
3. **Immediate:** Add tenant ID to cache keys
4. **This Week:** Add Dockerfile HEALTHCHECK
5. **This Week:** Add coverage thresholds
6. **Next Sprint:** Create integration test suite
7. **Ongoing:** Monitor circuit breaker states

---

## Comparison to Other Services

| Metric | api-gateway | analytics-service | scanning-service |
|--------|-------------|-------------------|------------------|
| CRITICAL | 5 | 77 | 56 |
| HIGH | 19 | 57 | 31 |
| PASS | 586 | 217 | 334 |
| Best Score | 98% (graceful-deg) | 88% (health) | 100% (various) |

**api-gateway is the best-implemented service audited so far.**
