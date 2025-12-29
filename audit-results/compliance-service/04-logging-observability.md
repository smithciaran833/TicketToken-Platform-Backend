## Compliance Service Logging & Observability Audit Report
### Audited Against: Docs/research/04-logging-observability.md

---

## 🔴 CRITICAL FINDINGS

### LC4 | No Correlation ID Implementation
**Severity:** CRITICAL  
**Files:** `src/server.ts`, `src/utils/logger.ts`  
**Evidence:** No correlation ID middleware exists anywhere in the codebase.
```typescript
// src/server.ts - MISSING:
// No addHook for generating/propagating correlation ID
// No X-Correlation-ID header handling

// src/utils/logger.ts - Basic config only:
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  // No base context with correlationId
  base: {
    service: 'compliance-service'  // Only service name
  },
});
```
**Impact:** Cannot trace requests across microservices or correlate logs with user reports.

---

### LC3 | No Redaction Configured for Sensitive Fields
**Severity:** CRITICAL  
**File:** `src/utils/logger.ts`  
**Evidence:**
```typescript
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  // MISSING: redact configuration!
  // No protection for passwords, tokens, PII, financial data
});
```
**Required redaction (missing):**
```typescript
redact: {
  paths: [
    '*.password', '*.token', '*.apiKey', '*.secret',
    'req.headers.authorization', 'req.headers.cookie',
    '*.creditCard', '*.cardNumber', '*.cvv', '*.ssn',
    '*.ein', '*.accountNumber', '*.routingNumber'
  ]
}
```
**Impact:** Sensitive EINs, account numbers, and routing numbers may be logged in plain text.

---

### SD1-SD4 | Sensitive Data Logged Without Protection
**Severity:** CRITICAL  
**Files:** Multiple controllers  
**Evidence from controllers:**
```typescript
// src/controllers/venue.controller.ts:29
await db.query(...[..., JSON.stringify({ ein, businessName }), ...]);
// EIN logged in audit without redaction!

// src/services/enhanced-audit.service.ts:34
logger.info({ entry }, `Audit log: ${entry.action}...`);
// Entry may contain sensitive venue data

// src/controllers/bank.controller.ts - handles accountNumber, routingNumber
const { venueId, accountNumber, routingNumber } = request.body as any;
// These could be logged in error traces
```
**Compliance Impact:** Potential PCI-DSS and financial data protection violations.

---

## 🟠 HIGH FINDINGS

### Mixed Logging (console.log vs logger)
**Severity:** HIGH  
**Files:** Multiple  
**Evidence:**
```typescript
// src/services/database.service.ts:16
console.log('✅ Database connected successfully');
console.error('❌ Database connection failed:', error);

// src/services/ofac-real.service.ts:12,33
console.log('📥 Downloading OFAC SDN list...');
console.log(`  Processed ${processed} OFAC entries...`);
console.error('❌ Failed to update OFAC list:', error);

// src/server.ts:38
console.log(`📥 ${request.method} ${request.url}`);
```
**Impact:** Inconsistent log format, harder to parse and aggregate in log systems.

---

### SE8/SE9 | Rate Limit Events Not Logged
**Severity:** HIGH  
**File:** `src/middleware/rate-limit.middleware.ts`  
**Evidence:**
```typescript
// Rate limit middleware sends response but doesn't log the event
if (isRateLimited) {
  return reply.code(429).send({
    error: 'Too Many Requests',
    message: 'Rate limit exceeded...'
  });
  // MISSING: logger.warn({ event: 'rate_limit_exceeded', ip, userId });
}
```
**Impact:** Cannot detect DDoS attempts or abuse patterns.

---

### SE1-SE4 | Authentication Events Not Fully Logged
**Severity:** HIGH  
**File:** `src/middleware/auth.middleware.ts`  
**Evidence:** The auth middleware validates tokens but doesn't log:
- Login success (handled elsewhere)
- Token validation failures with structured security events
- MFA events
- Session events
```typescript
// Missing security event logging:
// logger.warn({ event: 'authn_token_invalid', reason, ip });
```

---

### M7 | High Cardinality Labels in Metrics
**Severity:** HIGH  
**File:** `src/services/prometheus-metrics.service.ts`  
**Evidence:**
```typescript
// Line 87 - venue_id as label = HIGH CARDINALITY!
this.verificationStarted = new Counter({
  name: 'verifications_started_total',
  labelNames: ['venue_id'],  // ❌ Can be millions of unique values!
});

// Line 119 - venue_id in tax metrics
this.taxCalculations = new Counter({
  labelNames: ['venue_id'],  // ❌ High cardinality
});

// Line 163 - venue_id in risk metrics
this.riskScoresCalculated = new Counter({
  labelNames: ['venue_id', 'risk_level'],  // ❌ High cardinality
});
```
**Impact:** Prometheus database bloat, slow queries, potential OOM.

---

### DT1-DT5 | No OpenTelemetry/Distributed Tracing
**Severity:** HIGH  
**Files:** Entire codebase  
**Evidence:** No OpenTelemetry imports or configuration found:
- No `@opentelemetry/*` packages
- No trace ID propagation
- No span creation
- No context propagation to downstream services

---

## 🟡 MEDIUM FINDINGS

### LC10 | pino-pretty Enabled Based on NODE_ENV
**Severity:** MEDIUM  
**File:** `src/utils/logger.ts:4-8`  
**Evidence:**
```typescript
transport: process.env.NODE_ENV === 'development' ? {
  target: 'pino-pretty',
  options: { colorize: true }
} : undefined,
```
**Status:** ✅ Correctly disabled in production.

---

### LC6 | Timestamps Present but Not Explicitly ISO 8601
**Severity:** MEDIUM  
**File:** `src/utils/logger.ts`  
**Evidence:**
```typescript
timestamp: pino.stdTimeFunctions.isoTime  // ✅ ISO format
```
**Status:** ✅ Correct ISO 8601 format.

---

### Audit Service Missing Error Handling
**Severity:** MEDIUM  
**File:** `src/services/enhanced-audit.service.ts`  
**Evidence:**
```typescript
async log(entry: ...): Promise<void> {
  await db.query(...);  // No try/catch!
  logger.info({ entry }, `Audit log...`);
}
// If DB fails, audit log is lost without notification
```

---

## ✅ PASSING CHECKS

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| **LC1** | Structured JSON logging | ✅ PASS | Pino outputs JSON in `logger.ts` |
| **LC2** | Log level configurable | ✅ PASS | `process.env.LOG_LEVEL` |
| **LC7** | Service name in base | ✅ PASS | `base: { service: 'compliance-service' }` |
| **M1** | /metrics endpoint exposed | ✅ PASS | `metrics.routes.ts` |
| **M2-M3** | HTTP rate/duration tracked | ✅ PASS | `httpRequestDuration`, `httpRequestTotal` |
| **M4** | Error rate trackable | ✅ PASS | `httpRequestErrors` with labels |
| **M5** | Default Node.js metrics | ✅ PASS | `collectDefaultMetrics()` |
| **M6** | Business metrics defined | ✅ PASS | Verification, tax, OFAC, risk metrics |
| **SE10-SE11** | Transaction logging | ✅ PASS | Tax calculations logged |
| **Audit Trail** | Security events stored | ✅ PASS | `enhanced-audit.service.ts` |

---

## 📊 SUMMARY

| Severity | Count | Description |
|----------|-------|-------------|
| 🔴 CRITICAL | 3 | No correlation IDs, no redaction, sensitive data exposure |
| 🟠 HIGH | 5 | Mixed logging, rate limit logging, auth events, high cardinality, no tracing |
| 🟡 MEDIUM | 2 | Audit error handling |
| ✅ PASS | 10 | Structured logging, metrics endpoint, business metrics, audit trail |

---

## 🛠️ REQUIRED FIXES

### IMMEDIATE (CRITICAL)

**1. Add Pino redaction in `src/utils/logger.ts`:**
```typescript
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: [
      '*.password', '*.token', '*.apiKey', '*.secret',
      'req.headers.authorization', 'req.headers.cookie',
      '*.ein', '*.accountNumber', '*.routingNumber',
      '*.creditCard', '*.cardNumber', '*.cvv', '*.ssn',
      '*.privateKey', '*.mnemonic'
    ],
    censor: '[REDACTED]'
  },
  base: {
    service: 'compliance-service',
    version: process.env.APP_VERSION
  },
  timestamp: pino.stdTimeFunctions.isoTime
});
```

**2. Add correlation ID middleware in `src/server.ts`:**
```typescript
import crypto from 'crypto';

app.addHook('onRequest', async (request, reply) => {
  const correlationId = request.headers['x-correlation-id'] as string 
    || request.headers['x-request-id'] as string
    || crypto.randomUUID();
  request.correlationId = correlationId;
  reply.header('x-correlation-id', correlationId);
  
  // Add to request logger
  request.log = logger.child({ correlationId });
});
```

**3. Replace console.log with logger in:**
- `src/services/database.service.ts`
- `src/services/ofac-real.service.ts`
- `src/server.ts`

### 24-48 HOURS (HIGH)

**4. Remove venue_id from metric labels:**
```typescript
// Instead of:
labelNames: ['venue_id']

// Use:
labelNames: ['status']  // or other low-cardinality labels
// Track venue-specific metrics in database, not Prometheus
```

**5. Add rate limit logging:**
```typescript
// In rate-limit.middleware.ts
if (isRateLimited) {
  logger.warn({
    event: 'rate_limit_exceeded',
    ip: request.ip,
    userId: request.user?.id,
    route: request.url
  });
  return reply.code(429).send({...});
}
```

**6. Add security event logging to auth middleware:**
```typescript
if (!token) {
  logger.warn({ event: 'authn_missing_token', ip: request.ip });
}
if (tokenInvalid) {
  logger.warn({ event: 'authn_token_invalid', ip: request.ip, reason });
}
```

### 1 WEEK (MEDIUM)

7. Add OpenTelemetry for distributed tracing
8. Add error handling to audit service
9. Create centralized security event logger

---

## Metrics Service Summary

The `prometheus-metrics.service.ts` is well-structured with:
- ✅ Default Node.js metrics
- ✅ HTTP request metrics (rate, duration, errors)
- ✅ Business metrics (verification, tax, OFAC, risk, documents, GDPR)
- ✅ Database metrics (query duration, connections)
- ✅ Cache metrics (hits, misses)
- ⚠️ High cardinality labels (venue_id) - needs fixing

---

## Enhanced Audit Service Summary

The `enhanced-audit.service.ts` provides:
- ✅ Structured audit entries with severity levels
- ✅ IP address and user agent tracking
- ✅ Search and filter capabilities
- ✅ Report generation
- ⚠️ Missing try/catch for DB operations
- ⚠️ Missing redaction for sensitive entry data
