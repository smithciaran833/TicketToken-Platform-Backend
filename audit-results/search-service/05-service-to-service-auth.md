## Search-Service Service-to-Service Auth Audit

**Standard:** `05-service-to-service-auth.md`  
**Service:** `search-service`  
**Date:** 2025-12-27

---

### Executive Summary

| Metric | Value |
|--------|-------|
| **Total Checks** | 38 |
| **Passed** | 8 |
| **Partial** | 7 |
| **Failed** | 18 |
| **N/A** | 5 |
| **Pass Rate** | 24.2% |
| **Critical Issues** | 6 |
| **High Issues** | 5 |
| **Medium Issues** | 4 |

---

## Service Client Checklist (Calling Other Services)

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| 1 | Service uses mTLS OR signed tokens for outbound calls | **FAIL** | No mTLS or signed tokens for ES calls - plain HTTP |
| 2 | Service credentials NOT hardcoded | **FAIL** | `rabbitmq.ts:8` - `'amqp://admin:admin@rabbitmq:5672'` hardcoded fallback |
| 3 | Credentials from secrets manager at runtime | **PASS** | `secrets.ts:7` - Uses `secretsManager` from shared utils |
| 4 | Each service has unique credentials | **PARTIAL** | Secrets manager used but credentials may be shared |
| 5 | Short-lived credentials used | **FAIL** | Static passwords for RabbitMQ, no token rotation |
| 6 | Credential rotation automated | **FAIL** | No rotation mechanism visible |
| 7 | Failed auth attempts logged | **PARTIAL** | `rabbitmq.ts:27` - Errors logged but not specifically auth failures |

---

## Request Security (Outbound)

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| 8 | All internal HTTP calls use HTTPS/TLS | **FAIL** | `env.validator.ts:30-32` - Accepts `http://` for ES |
| 9 | Service identity in every request | **FAIL** | No service identity headers in ES or RabbitMQ calls |
| 10 | Correlation ID propagated downstream | **FAIL** | `sync.service.ts` - No correlation ID passed to ES |
| 11 | Request timeout configured | **PARTIAL** | `env.validator.ts:90-94` - Timeout defined but not used in ES client |
| 12 | Circuit breaker for downstream failures | **FAIL** | No circuit breaker for ES or RabbitMQ |

---

## Service Endpoint Checklist (Receiving Requests)

### Authentication Enforcement

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| 13 | ALL endpoints require authentication | **PARTIAL** | Main routes have auth, but `/health` and `/metrics` may not |
| 14 | Auth middleware applied globally | **PARTIAL** | Applied per-route, not globally: `search.controller.ts:10` |
| 15 | Token verification uses crypto validation | **PASS** | `auth.middleware.ts:33` - Uses `jwt.verify()` |
| 16 | Token verified with signature (not decoded) | **PASS** | `auth.middleware.ts:33` - `jwt.verify()` not `decode()` |
| 17 | Token expiration checked | **PASS** | `auth.middleware.ts:41-45` - Catches `TokenExpiredError` |
| 18 | Token issuer validated | **FAIL** | `auth.middleware.ts:33` - No `issuer` validation in options |
| 19 | Token audience validated | **FAIL** | No `audience` validation |

---

### Service Identity Authorization

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| 20 | Service identity extracted from request | **PARTIAL** | User identity extracted, not service identity |
| 21 | Per-endpoint authorization rules | **PASS** | `search.controller.ts` - Routes specify allowed handlers |
| 22 | Allowlist of services per endpoint | **FAIL** | No service-level allowlist |
| 23 | Unauthorized access logged | **FAIL** | `tenant.middleware.ts:25` - Returns 403 without logging |
| 24 | No default-allow policy | **PASS** | All routes require explicit auth middleware |

---

## Message Queue Security (RabbitMQ)

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| 25 | TLS/SSL enabled for connections | **FAIL** | `rabbitmq.ts:8` - Uses `amqp://` not `amqps://` |
| 26 | Each service has unique credentials | **FAIL** | `rabbitmq.ts:8` - Hardcoded `admin:admin` |
| 27 | Permissions restricted per service | **N/A** | Cannot verify from code - server-side config |
| 28 | Virtual hosts used to isolate | **FAIL** | No vhost specified in connection URL |
| 29 | Default guest user disabled | **N/A** | Server-side config |
| 30 | Management plugin access restricted | **N/A** | Server-side config |

---

## Secrets Management Checklist

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| 31 | Secrets manager in use | **PASS** | `secrets.ts:7` - Imports `secretsManager` |
| 32 | No secrets in source code | **FAIL** | `rabbitmq.ts:8` - `admin:admin`; `auth.middleware.ts:35` - dev secret |
| 33 | No secrets in environment variables for prod | **PARTIAL** | `env.validator.ts` - Validates env vars including ES credentials |
| 34 | Secrets not logged | **PASS** | No credential logging visible |
| 35 | Secret access audited | **N/A** | Depends on secretsManager implementation |
| 36 | Emergency rotation procedure | **FAIL** | No rotation mechanism |

---

## Zero Trust Checklist

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| 37 | All service traffic uses mTLS or signed tokens | **FAIL** | Plain HTTP to ES, AMQP to RabbitMQ |
| 38 | Authorization at each service | **PASS** | Each request validated by auth middleware |

---

## Critical Issues (P0)

### 1. Hardcoded RabbitMQ Credentials
**Severity:** CRITICAL  
**Location:** `rabbitmq.ts:8`  
**Issue:** Default credentials `admin:admin` hardcoded as fallback.

**Evidence:**
```typescript
connection = await amqp.connect(
  process.env.RABBITMQ_URL || process.env.AMQP_URL || 'amqp://admin:admin@rabbitmq:5672'
);
```

**Remediation:**
```typescript
const rabbitmqUrl = process.env.RABBITMQ_URL;
if (!rabbitmqUrl) {
  throw new Error('RABBITMQ_URL environment variable required');
}
connection = await amqp.connect(rabbitmqUrl);
```

---

### 2. RabbitMQ Using Unencrypted AMQP
**Severity:** CRITICAL  
**Location:** `rabbitmq.ts:8`  
**Issue:** Uses `amqp://` protocol instead of `amqps://` - credentials sent in plaintext.

**Remediation:** Use `amqps://` with TLS configuration:
```typescript
const conn = await amqp.connect({
  protocol: 'amqps',
  hostname: process.env.RABBITMQ_HOST,
  ssl: { ca: [fs.readFileSync('/etc/ssl/rabbitmq-ca.pem')] }
});
```

---

### 3. No JWT Issuer/Audience Validation
**Severity:** CRITICAL  
**Location:** `auth.middleware.ts:33`  
**Issue:** JWT verified but `iss` and `aud` claims not validated - tokens from any issuer accepted.

**Evidence:**
```typescript
const decoded = jwt.verify(token, jwtSecret || 'dev-secret-key-change-in-production') as any;
// MISSING: { issuer: 'tickettoken-auth', audience: 'search-service' }
```

**Remediation:**
```typescript
const decoded = jwt.verify(token, jwtSecret, {
  algorithms: ['HS256'],
  issuer: 'tickettoken-auth-service',
  audience: 'tickettoken-services'
}) as any;
```

---

### 4. Elasticsearch Using HTTP (Not HTTPS)
**Severity:** CRITICAL  
**Location:** `env.validator.ts:30-32`  
**Issue:** ES connection allows HTTP - data in transit unencrypted.

**Evidence:**
```typescript
ELASTICSEARCH_NODE: Joi.string()
  .uri({ scheme: ['http', 'https'] })  // Allows insecure HTTP
```

---

### 5. No Service Identity in Inter-Service Calls
**Severity:** CRITICAL  
**Location:** `sync.service.ts`, Elasticsearch client  
**Issue:** No service identity header or certificate when calling ES or other services.

---

### 6. Hardcoded JWT Secret Fallback
**Severity:** CRITICAL  
**Location:** `auth.middleware.ts:35`  
**Issue:** Hardcoded dev secret used as fallback - could be deployed to production.

**Evidence:**
```typescript
jwt.verify(token, jwtSecret || 'dev-secret-key-change-in-production')
```

---

## High Issues (P1)

### 7. No Correlation ID Propagation
**Severity:** HIGH  
**Location:** `sync.service.ts`  
**Issue:** Sync operations don't propagate correlation ID to downstream services.

---

### 8. No Circuit Breaker for Elasticsearch
**Severity:** HIGH  
**Location:** `search.service.ts`, `sync.service.ts`  
**Issue:** ES failures not protected by circuit breaker.

---

### 9. Authorization Failures Not Logged
**Severity:** HIGH  
**Location:** `tenant.middleware.ts:20-27`  
**Issue:** 403 returned without logging for security audit.

---

### 10. No Credential Rotation Mechanism
**Severity:** HIGH  
**Location:** Service-wide  
**Issue:** No mechanism for rotating RabbitMQ, ES, or DB credentials.

---

### 11. Message Processing Without Validation
**Severity:** HIGH  
**Location:** `rabbitmq.ts:14-22`  
**Issue:** Messages consumed without validating sender identity.

**Evidence:**
```typescript
await channel.consume('search.sync.queue', async (msg) => {
  // No sender validation - accepts messages from anyone
  console.log('Processing message:', msg.content.toString());
});
```

---

## Medium Issues (P2)

| # | Issue | Location | Description |
|---|-------|----------|-------------|
| 12 | Console.log instead of logger | `rabbitmq.ts:18,20,24,27` | Uses `console.log/error` not structured logger |
| 13 | No virtual host isolation | `rabbitmq.ts:8` | Default vhost used |
| 14 | Auth middleware per-route | `search.controller.ts` | Should be global middleware |
| 15 | No service-to-service allowlist | Routes | No whitelist of which services can call endpoints |

---

## Positive Findings

1. ✅ **Secrets manager integration** - `secrets.ts` properly uses shared secretsManager
2. ✅ **JWT signature verification** - Uses `jwt.verify()` not `jwt.decode()`
3. ✅ **Token expiration handling** - Properly catches `TokenExpiredError`
4. ✅ **Auth middleware on routes** - All search routes require authentication
5. ✅ **Tenant isolation enforced** - `requireTenant` middleware validates tenant context
6. ✅ **No credentials in logs** - Sensitive data not logged
7. ✅ **Production JWT secret enforcement** - Throws error if missing in production mode

---

## Prioritized Remediation Plan

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| P0 | Remove hardcoded RabbitMQ credentials | 15 min | Critical - prevents credential exposure |
| P0 | Switch RabbitMQ to amqps:// | 1 hour | Critical - encrypts credentials |
| P0 | Add JWT issuer/audience validation | 30 min | Critical - prevents token reuse |
| P0 | Enforce HTTPS for Elasticsearch | 30 min | Critical - data in transit |
| P0 | Remove hardcoded JWT fallback | 15 min | Critical - prevents secret exposure |
| P0 | Add service identity to inter-service calls | 2 hours | Critical - zero trust |
| P1 | Add correlation ID propagation | 1 hour | High - traceability |
| P1 | Add circuit breaker for ES | 2 hours | High - resilience |
| P1 | Log authorization failures | 30 min | High - security audit |
| P1 | Implement credential rotation | 4 hours | High - security hygiene |
| P1 | Validate RabbitMQ message senders | 2 hours | High - message integrity |
| P2 | Replace console.log with logger | 30 min | Medium - observability |
| P2 | Make auth middleware global | 1 hour | Medium - consistency |

---

**Audit Complete.** Pass rate of 24.2% indicates significant gaps in service-to-service authentication. Critical issues include hardcoded credentials, unencrypted transport, and missing token claim validation. The service relies on secrets manager but has dangerous fallbacks that could expose credentials.
