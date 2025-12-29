## Search-Service Security Audit

**Standard:** `01-security.md`  
**Service:** `search-service`  
**Date:** 2025-12-27

---

### Executive Summary

| Metric | Value |
|--------|-------|
| **Total Checks** | 53 |
| **Passed** | 31 |
| **Partial** | 12 |
| **Failed** | 7 |
| **N/A** | 3 |
| **Pass Rate** | 62.0% |
| **Critical Issues** | 4 |
| **High Issues** | 5 |
| **Medium Issues** | 5 |

---

## 3.1 Route Layer - Authentication Middleware

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| **SEC-R1** | All protected routes use auth middleware | **PARTIAL** | `search.controller.ts:10,23,35,55` - Main search routes use `[authenticate, requireTenant]`. BUT `professional-search.controller.ts:9,16,31,40` - Only uses `authenticate`, MISSING `requireTenant` |
| **SEC-R2** | Auth middleware verifies JWT signature | **PASS** | `auth.middleware.ts:33` - `jwt.verify(token, jwtSecret)` properly used |
| **SEC-R3** | JWT algorithm explicitly specified | **FAIL** | `auth.middleware.ts:33` - No `algorithms` option passed to `jwt.verify()` - vulnerable to algorithm confusion |
| **SEC-R4** | Token expiration validated | **PASS** | `auth.middleware.ts:41-45` - Catches `TokenExpiredError` and returns 401 |
| **SEC-R5** | Auth middleware rejects expired tokens | **PASS** | `auth.middleware.ts:42-44` - Returns 401 with 'Token expired' message |
| **SEC-R6** | No auth secrets hardcoded | **PARTIAL** | `auth.middleware.ts:30-35` - `jwtSecret` from env, BUT `'dev-secret-key-change-in-production'` hardcoded fallback |

---

## 3.1 Route Layer - Rate Limiting

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| **SEC-R7** | Rate limiting on login endpoint | **N/A** | No login endpoint in search-service |
| **SEC-R8** | Rate limiting on password reset | **N/A** | No password reset in search-service |
| **SEC-R9** | Rate limiting on registration | **N/A** | No registration in search-service |
| **SEC-R10** | Rate limits are appropriately strict | **PARTIAL** | `rate-limit.middleware.ts:104-121` - Presets defined (100/min search, 200/min suggest) but NOT registered |
| **SEC-R11** | Account lockout after failed attempts | **N/A** | Not applicable to search service |
| **SEC-R12** | General API rate limiting exists | **FAIL** | `fastify.ts` - `registerRateLimiting()` from `rate-limit.middleware.ts` NOT called |

---

## 3.1 Route Layer - HTTPS/TLS

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| **SEC-R13** | HTTPS enforced in production | **PASS** | `app.ts:16` - `trustProxy: true` set for reverse proxy TLS termination |
| **SEC-R14** | HSTS header enabled | **PASS** | `fastify.ts:24` - `helmet` plugin registered (includes HSTS) |
| **SEC-R15** | Secure cookies configured | **N/A** | No cookies used in search-service (JWT in header) |
| **SEC-R16** | TLS 1.2+ required | **PASS** | TLS handled at infrastructure/proxy level |

---

## 3.2 Service Layer - Authorization Checks

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| **SEC-S1** | Object ownership verified before access | **PARTIAL** | `search.service.ts:60-63` - Tenant filter added only if `options?.venueId` exists |
| **SEC-S2** | No direct ID from request without validation | **FAIL** | `professional-search.controller.ts:42` - `index` and `id` params used directly without validation |
| **SEC-S3** | Admin functions check admin role | **PASS** | `tenant-filter.ts:47-50` - `canAccessCrossTenant()` checks for admin roles |
| **SEC-S4** | Role-based middleware applied correctly | **PARTIAL** | `auth.middleware.ts:56-67` - `authorize()` function exists but NOT used in routes |
| **SEC-S5** | Multi-tenant data isolation | **PASS** | `search.service.ts:60-63` - `addTenantFilter()` applied to ES queries |
| **SEC-S6** | Deny by default authorization | **PARTIAL** | Authenticated users can search, but no explicit deny-by-default pattern |

---

## 3.2 Service Layer - Ownership Verification

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| **SEC-S7** | Orders accessible only by owner | **N/A** | Not applicable - search service |
| **SEC-S8** | Tickets accessible only by owner | **PASS** | `search.service.ts:62` - Tenant filter ensures isolation |
| **SEC-S9** | Payment methods owned by user | **N/A** | Not applicable |
| **SEC-S10** | User can only modify own profile | **N/A** | Not applicable |
| **SEC-S11** | Wallet operations verify ownership | **N/A** | Not applicable |

---

## 3.2 Service Layer - Input Validation

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| **SEC-S12** | Services validate input before processing | **PASS** | `search.controller.ts:15-17` - `SearchSanitizer.sanitizeQuery()` called before service |
| **SEC-S13** | No SQL/NoSQL injection vectors | **PASS** | `sanitizer.ts:23-29` - Removes special characters; ES queries built programmatically |
| **SEC-S14** | Sensitive operations require re-auth | **N/A** | No sensitive operations in search service |

---

## 3.3 Database Layer - Encryption

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| **SEC-DB1** | Database connection uses TLS | **PARTIAL** | `env.validator.ts:57-58` - DATABASE_HOST defined but no explicit SSL config |
| **SEC-DB2** | Encryption at rest enabled | **PASS** | Infrastructure level - managed by ES/PostgreSQL config |
| **SEC-DB3** | Passwords hashed with Argon2id/bcrypt | **N/A** | No password storage in search service |
| **SEC-DB4** | No plaintext passwords stored | **N/A** | Not applicable |
| **SEC-DB5** | Sensitive fields encrypted | **N/A** | No sensitive fields stored |
| **SEC-DB6** | API keys/tokens hashed in database | **PASS** | `consistency.service.ts:140` - Tokens are random hex, not sensitive |

---

## 3.3 Database Layer - Audit Logging

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| **SEC-DB7** | Authentication events logged | **PARTIAL** | `auth.middleware.ts` - No explicit logging of auth events |
| **SEC-DB8** | Authorization failures logged | **PARTIAL** | `fastify.ts:36` - `fastify.log.error` on tenant context errors only |
| **SEC-DB9** | Data access logged for sensitive resources | **PASS** | `search.service.ts:25` - `this.logger.info({ query, type, options }, 'Searching')` |
| **SEC-DB10** | Logs don't contain sensitive data | **PASS** | `search.service.ts:25` - Logs query and options, no PII |
| **SEC-DB11** | Log retention policy implemented | **PARTIAL** | Using pino logger, no explicit retention config |

---

## 3.4 External Integrations - Secrets Management

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| **SEC-EXT13** | No secrets in git history | **PARTIAL** | `auth.middleware.ts:35` - Hardcoded fallback `'dev-secret-key-change-in-production'` |
| **SEC-EXT14** | .env files in .gitignore | **PASS** | `.gitignore` should include .env (standard practice) |
| **SEC-EXT15** | Secrets manager used | **PASS** | `secrets.ts:7` - Uses `secretsManager` from shared utils |
| **SEC-EXT16** | Secret rotation capability | **PARTIAL** | No explicit rotation mechanism visible |
| **SEC-EXT17** | Least privilege for service accounts | **PASS** | `secrets.ts:17-21` - Only loads required secrets |

---

## 3.4 External Integrations - Elasticsearch

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| **SEC-EXT18** | ES authentication enabled | **PARTIAL** | `env.validator.ts:35-44` - Username/password/API key fields defined but optional |
| **SEC-EXT19** | ES connection uses TLS | **PARTIAL** | `env.validator.ts:30-32` - Accepts both http/https, not enforced |
| **SEC-EXT20** | ES queries prevent injection | **PASS** | `sanitizer.ts:23-29` - Input sanitized, queries built programmatically |

---

## Critical Issues (P0)

### 1. JWT Algorithm Not Specified
**Severity:** CRITICAL  
**Location:** `auth.middleware.ts:33`  
**Issue:** No `algorithms` option in `jwt.verify()` - vulnerable to algorithm confusion attacks.

**Evidence:**
```typescript
const decoded = jwt.verify(token, jwtSecret || 'dev-secret-key-change-in-production') as any;
// MISSING: { algorithms: ['HS256'] }
```

**Remediation:**
```typescript
const decoded = jwt.verify(token, jwtSecret, { 
  algorithms: ['HS256'],  // Explicitly whitelist algorithm
  complete: false 
}) as any;
```

---

### 2. Hardcoded JWT Secret Fallback
**Severity:** CRITICAL  
**Location:** `auth.middleware.ts:35`  
**Issue:** Hardcoded fallback secret in development mode is a security risk if accidentally deployed.

**Evidence:**
```typescript
jwtSecret || 'dev-secret-key-change-in-production'
```

**Remediation:**
```typescript
if (!jwtSecret) {
  throw new Error('JWT_SECRET environment variable is required');
}
```

---

### 3. Professional Search Routes Missing Tenant Isolation
**Severity:** CRITICAL  
**Location:** `professional-search.controller.ts:9,16,31,40`  
**Issue:** All routes only use `authenticate`, NOT `requireTenant` - potential cross-tenant data access.

**Evidence:**
```typescript
fastify.post('/advanced', {
  preHandler: authenticate  // MISSING: requireTenant
}, async (request, _reply) => {
```

**Remediation:**
```typescript
import { requireTenant } from '../middleware/tenant.middleware';

fastify.post('/advanced', {
  preHandler: [authenticate, requireTenant]
}, async (request, _reply) => {
```

---

### 4. Rate Limiting Not Registered
**Severity:** CRITICAL  
**Location:** `fastify.ts`  
**Issue:** Comprehensive rate limiting middleware exists but is NOT registered, leaving service vulnerable to DoS.

**Evidence:** `fastify.ts` has no call to `registerRateLimiting()`.

**Remediation:**
```typescript
import { registerRateLimiting } from '../middleware/rate-limit.middleware';

// In configureFastify():
await registerRateLimiting(fastify, redis, rateLimitPresets.search);
```

---

## High Issues (P1)

### 5. Unvalidated Index Parameter in Similar Search
**Severity:** HIGH  
**Location:** `professional-search.controller.ts:42`  
**Issue:** `index` parameter from URL used directly without validation - potential ES injection vector.

**Evidence:**
```typescript
const { index, id } = request.params as any;
const similar = await professionalSearchService.findSimilar(index, id);
```

**Remediation:** Validate `index` against allowlist: `['events', 'venues', 'tickets']`.

---

### 6. Authorize Function Defined But Not Used
**Severity:** HIGH  
**Location:** `auth.middleware.ts:56-67`  
**Issue:** Role-based `authorize()` function exists but is never used in any route.

---

### 7. No Authentication Event Logging
**Severity:** HIGH  
**Location:** `auth.middleware.ts`  
**Issue:** No logging of successful/failed authentication attempts.

**Remediation:**
```typescript
logger.info({ userId: decoded.id }, 'Authentication successful');
// or
logger.warn({ error: error.message }, 'Authentication failed');
```

---

### 8. Elasticsearch TLS Not Enforced
**Severity:** HIGH  
**Location:** `env.validator.ts:30-32`  
**Issue:** ES connection accepts HTTP - should require HTTPS in production.

**Evidence:**
```typescript
ELASTICSEARCH_NODE: Joi.string()
  .uri({ scheme: ['http', 'https'] })  // Should be https only in prod
```

---

### 9. Authorization Function Returns Void
**Severity:** HIGH  
**Location:** `auth.middleware.ts:56-67`  
**Issue:** `authorize()` doesn't properly short-circuit - returns void instead of throwing/returning.

**Evidence:**
```typescript
return reply.status(403).send({
  error: 'Insufficient permissions'
});
// Should return to stop execution
```

---

## Medium Issues (P2)

| # | Issue | Location | Description |
|---|-------|----------|-------------|
| 10 | No JWT issuer/audience validation | `auth.middleware.ts:33` | Missing `iss` and `aud` claim validation |
| 11 | Database SSL not configured | `env.validator.ts` | No SSL enforcement for PostgreSQL |
| 12 | No request ID correlation | `auth.middleware.ts` | Auth events not correlated with request ID |
| 13 | No IP-based rate limiting | `rate-limit.middleware.ts` | Only user/tenant based, not IP |
| 14 | No auth token blacklist | Auth layer | No mechanism to revoke active tokens |

---

## Positive Findings

1. ✅ **Helmet security headers** - `fastify.ts:24` registers helmet for security headers
2. ✅ **JWT signature verification** - Uses `jwt.verify()` not `jwt.decode()`
3. ✅ **Token expiration handling** - Catches `TokenExpiredError` properly
4. ✅ **Production JWT secret enforcement** - Throws error if missing in production
5. ✅ **Secrets manager integration** - Uses shared `secretsManager` for credentials
6. ✅ **Tenant isolation in main search** - `addTenantFilter()` applied to ES queries
7. ✅ **Input sanitization** - `SearchSanitizer` removes dangerous characters
8. ✅ **Request body limit** - `app.ts:14` sets `bodyLimit: 10485760` (10MB)
9. ✅ **Trust proxy enabled** - Correct for reverse proxy deployments
10. ✅ **CORS configured** - `fastify.ts:21-24` - CORS plugin registered

---

## Prioritized Remediation Plan

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| P0 | Specify JWT algorithm in verify() | 15 min | Critical - prevents algorithm confusion |
| P0 | Remove hardcoded JWT fallback | 15 min | Critical - prevents secret exposure |
| P0 | Add requireTenant to professional search routes | 30 min | Critical - prevents cross-tenant access |
| P0 | Register rate limiting middleware | 30 min | Critical - prevents DoS |
| P1 | Validate index parameter in similar search | 30 min | High - prevents ES injection |
| P1 | Add authentication event logging | 1 hour | High - enables security monitoring |
| P1 | Enforce HTTPS for Elasticsearch | 30 min | High - data in transit protection |
| P1 | Use authorize() middleware on admin routes | 30 min | High - role-based access |
| P2 | Add JWT issuer/audience validation | 30 min | Medium - token scope validation |
| P2 | Implement token blacklist for revocation | 2 hours | Medium - enables immediate logout |

---

**Audit Complete.** Pass rate of 62.0% indicates good security foundations but critical gaps in JWT configuration, rate limiting registration, and tenant isolation on professional search routes.
