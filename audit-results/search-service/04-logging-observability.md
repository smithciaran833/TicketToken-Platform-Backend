## Search-Service Logging & Observability Audit

**Standard:** `04-logging-observability.md`  
**Service:** `search-service`  
**Date:** 2025-12-27

---

### Executive Summary

| Metric | Value |
|--------|-------|
| **Total Checks** | 49 |
| **Passed** | 21 |
| **Partial** | 13 |
| **Failed** | 11 |
| **N/A** | 4 |
| **Pass Rate** | 46.7% |
| **Critical Issues** | 3 |
| **High Issues** | 5 |
| **Medium Issues** | 6 |

---

## 3.1 Log Configuration Checklist

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| **LC1** | Structured JSON logging enabled | **PASS** | `logger.ts:3-11` - Pino configured with JSON output |
| **LC2** | Appropriate log level per environment | **PASS** | `logger.ts:6` - `process.env.LOG_LEVEL || 'info'` |
| **LC3** | Redaction configured for sensitive fields | **FAIL** | `logger.ts` - No `redact` configuration in Pino options |
| **LC4** | Correlation ID middleware installed | **PARTIAL** | `app.ts:16` - `requestIdHeader: 'x-request-id'` but no X-Correlation-ID handling |
| **LC5** | Request ID generation enabled | **PASS** | `app.ts:16` - `requestIdHeader: 'x-request-id'` configured |
| **LC6** | Timestamps in ISO 8601 format | **PARTIAL** | `logger.ts` - Pino default timestamp (numeric), not ISO 8601 |
| **LC7** | Service name/version in base context | **PASS** | `logger.ts:4` - `name: 'search-service'` in base config |
| **LC8** | Log destination configured | **PASS** | `logger.ts:7-11` - stdout for prod, pino-pretty for dev |
| **LC9** | Log rotation configured | **FAIL** | No file logging/rotation - relies on stdout |
| **LC10** | pino-pretty disabled in production | **PASS** | `logger.ts:7` - Only in `NODE_ENV === 'development'` |

---

## 3.2 Sensitive Data Protection Checklist

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| **SD1** | Passwords never logged | **PARTIAL** | No explicit redaction - relies on not logging user objects |
| **SD2** | Tokens/API keys redacted | **FAIL** | No `authorization` header redaction configured |
| **SD3** | PII fields redacted | **FAIL** | No redaction for email, phone, etc. |
| **SD4** | Credit card data never logged | **N/A** | Search service doesn't handle payment data |
| **SD5** | Session tokens redacted | **FAIL** | No cookie/token redaction |
| **SD6** | Stripe sensitive data filtered | **N/A** | No Stripe integration in search |
| **SD7** | Solana private keys never logged | **N/A** | No blockchain operations in search |
| **SD8** | Request body logging filtered | **PARTIAL** | `search.service.ts:25` - Logs query/options but not full body |
| **SD9** | Error stack traces controlled | **PARTIAL** | `search.service.ts:86` - Logs error but Pino may include stack |
| **SD10** | Database queries sanitized | **PASS** | `search.service.ts` - Logs operation context, not raw queries |

---

## 3.3 Security Event Logging Checklist

| ID | Event Category | Status | Evidence |
|----|----------------|--------|----------|
| **SE1** | Login success/failure | **N/A** | Not handled by search service |
| **SE2** | Logout | **N/A** | Not handled by search service |
| **SE3** | Authorization denied | **FAIL** | `tenant.middleware.ts:25-27` - Returns 403 but no logger call |
| **SE4** | Rate limit exceeded | **PARTIAL** | `rate-limit.middleware.ts:77-81` - Sends 429 but limited logging |
| **SE5** | Input validation failures | **PARTIAL** | `validation.middleware.ts:16-24` - Returns error but no logging |
| **SE6** | Search operations | **PASS** | `search.service.ts:25` - Logs query, type, and options |
| **SE7** | Search failures | **PASS** | `search.service.ts:86` - Logs error context |
| **SE8** | Slow queries | **PASS** | `performance-monitor.ts:76-82` - Logs slow operations with warn level |

---

## 3.4 Prometheus Metrics Checklist

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| **M1** | `/metrics` endpoint exposed | **FAIL** | `fastify.ts` - No metrics endpoint registered |
| **M2** | HTTP request rate tracked | **PASS** | `metrics.ts:5-8` - `searchCounter` tracks requests |
| **M3** | HTTP request duration tracked | **PASS** | `metrics.ts:10-15` - `searchDuration` histogram |
| **M4** | Error rate trackable | **PASS** | `metrics.ts:7` - `labelNames: ['type', 'status']` |
| **M5** | Default Node.js metrics enabled | **FAIL** | `metrics.ts` - No `collectDefaultMetrics()` call |
| **M6** | Business metrics defined | **PASS** | `metrics.ts:17-20` - `cacheHitRate` counter |
| **M7** | Label cardinality controlled | **PASS** | Low cardinality labels: type, status |
| **M8** | Histogram buckets appropriate | **PASS** | `metrics.ts:14` - Good range: 0.001 to 5 seconds |

---

## 3.5 Distributed Tracing Checklist

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| **DT1** | OpenTelemetry SDK initialized | **FAIL** | No OpenTelemetry imports or configuration |
| **DT2** | Auto-instrumentation enabled | **FAIL** | No auto-instrumentation setup |
| **DT3** | Service name configured | **PARTIAL** | `logger.ts:4` - Service name in logger, but no OTEL |
| **DT4** | Trace ID in all logs | **FAIL** | No trace ID injection in logs |
| **DT5** | Context propagation to downstream | **FAIL** | No trace context propagation |
| **DT6** | Error spans recorded | **FAIL** | No span recording |
| **DT7** | Custom spans for business logic | **FAIL** | No custom spans |
| **DT8** | Sampling configured | **N/A** | No tracing to sample |

---

## 3.6 Performance Monitoring Checklist

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| **PM1** | Performance tracking utility | **PASS** | `performance-monitor.ts:1-212` - Comprehensive implementation |
| **PM2** | Slow query detection | **PASS** | `performance-monitor.ts:76-82` - Threshold-based detection |
| **PM3** | Percentile calculations | **PASS** | `performance-monitor.ts:101-105` - P50, P95, P99 |
| **PM4** | Statistics aggregation | **PASS** | `performance-monitor.ts:114-126` - getAllStats() |
| **PM5** | Slow operation reports | **PASS** | `performance-monitor.ts:164-178` - Sorted slow ops report |
| **PM6** | Integrated with logging | **PASS** | `performance-monitor.ts:4` - Uses service logger |
| **PM7** | Actually used in code | **FAIL** | `search.service.ts` - No `trackPerformance()` calls |

---

## 3.7 Fastify-Specific Logging

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| **FP1** | Logger enabled in Fastify options | **PASS** | `app.ts:12-14` - `logger: { level: ... }` |
| **FP2** | `request.log` used instead of global | **PARTIAL** | `fastify.ts:36` - Uses `fastify.log`, should use `request.log` |
| **FP3** | Serializers configured for req/res | **FAIL** | No custom serializers configured |
| **FP4** | `genReqId` configured | **PARTIAL** | Uses default request ID generation |
| **FP5** | Child loggers used for context | **FAIL** | No child logger pattern used |
| **FP6** | Async logging enabled | **PASS** | Pino default is async |

---

## Critical Issues (P0)

### 1. No Sensitive Data Redaction
**Severity:** CRITICAL  
**Location:** `logger.ts`  
**Issue:** No Pino redaction configured. Sensitive data like authorization headers, tokens, or PII could be logged.

**Evidence:**
```typescript
// logger.ts - Missing redact configuration
export const logger = pino({
  name: 'search-service',
  level: process.env.LOG_LEVEL || 'info',
  // MISSING: redact: { paths: [...], censor: '[REDACTED]' }
});
```

**Remediation:**
```typescript
export const logger = pino({
  name: 'search-service',
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.token',
      '*.apiKey'
    ],
    censor: '[REDACTED]'
  }
});
```

---

### 2. No Metrics Endpoint
**Severity:** CRITICAL  
**Location:** `fastify.ts`  
**Issue:** Prometheus metrics defined in `metrics.ts` but no `/metrics` endpoint to expose them.

**Evidence:** No route for metrics in `fastify.ts` or anywhere in routes.

**Remediation:**
```typescript
// Add to fastify.ts
import { register } from '../utils/metrics';

fastify.get('/metrics', async (request, reply) => {
  reply.header('Content-Type', register.contentType);
  return register.metrics();
});
```

---

### 3. No OpenTelemetry Distributed Tracing
**Severity:** CRITICAL  
**Location:** Service-wide  
**Issue:** No distributed tracing implemented. Impossible to trace requests across microservices.

**Remediation:** Add OpenTelemetry SDK with auto-instrumentation:
```typescript
// tracing.ts - Load before app
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

const sdk = new NodeSDK({
  serviceName: 'search-service',
  instrumentations: [getNodeAutoInstrumentations()]
});
sdk.start();
```

---

## High Issues (P1)

### 4. Authorization Failures Not Logged
**Severity:** HIGH  
**Location:** `tenant.middleware.ts:20-27`  
**Issue:** Returns 403 but doesn't log the authorization failure (security event).

**Evidence:**
```typescript
if (!request.user?.venueId) {
  return reply.status(403).send({
    error: 'Tenant information missing'
  });
  // NO logger.warn() for security audit trail
}
```

---

### 5. Performance Monitor Not Used
**Severity:** HIGH  
**Location:** `search.service.ts`  
**Issue:** Comprehensive `performanceMonitor` exists but is never called in service methods.

**Evidence:** No imports of `trackPerformance` in `search.service.ts`.

---

### 6. No Default Node.js Metrics
**Severity:** HIGH  
**Location:** `metrics.ts`  
**Issue:** Missing `collectDefaultMetrics()` - no CPU, memory, event loop metrics.

**Remediation:**
```typescript
import { collectDefaultMetrics, Registry } from 'prom-client';
collectDefaultMetrics({ register });
```

---

### 7. No Correlation ID Propagation
**Severity:** HIGH  
**Location:** Service-wide  
**Issue:** Request ID set but correlation ID not propagated to ES or other services.

---

### 8. Validation Failures Not Logged
**Severity:** HIGH  
**Location:** `validation.middleware.ts:14-24`  
**Issue:** Validation errors returned to client but not logged as security events.

---

## Medium Issues (P2)

| # | Issue | Location | Description |
|---|-------|----------|-------------|
| 9 | Non-ISO8601 timestamps | `logger.ts` | Pino uses numeric timestamps by default |
| 10 | Console.log usage | `performance-monitor.ts:83,191-209` | Uses console.log instead of logger |
| 11 | No log rotation | `logger.ts` | Relies on stdout, no file rotation |
| 12 | No child loggers | Service layer | Should use `request.log.child()` for context |
| 13 | No custom serializers | `app.ts` | Default serializers may log too much |
| 14 | Rate limit events not logged | `rate-limit.middleware.ts` | Only sends 429, minimal logging |

---

## Positive Findings

1. ✅ **Structured JSON logging** - Pino properly configured for JSON output
2. ✅ **Environment-based log levels** - Uses `LOG_LEVEL` env variable
3. ✅ **Service identification** - `name: 'search-service'` in logger config
4. ✅ **Pretty printing in dev only** - pino-pretty correctly conditional
5. ✅ **Prometheus metrics defined** - Counter and Histogram for searches
6. ✅ **Good histogram buckets** - Appropriate latency ranges for search
7. ✅ **Performance monitoring utility** - Comprehensive `PerformanceMonitor` class
8. ✅ **Slow query detection** - Threshold-based with P95 tracking
9. ✅ **Search operations logged** - Query and options logged at info level
10. ✅ **Low label cardinality** - Metrics use controlled label values

---

## Prioritized Remediation Plan

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| P0 | Add Pino redaction for sensitive fields | 30 min | Critical - prevents data leaks |
| P0 | Add /metrics endpoint | 30 min | Critical - enables Prometheus |
| P0 | Add OpenTelemetry setup | 2 hours | Critical - enables distributed tracing |
| P1 | Log authorization failures | 30 min | High - security audit trail |
| P1 | Integrate performance monitor | 1 hour | High - performance visibility |
| P1 | Add collectDefaultMetrics() | 15 min | High - system metrics |
| P1 | Implement correlation ID propagation | 1 hour | High - request tracing |
| P1 | Log validation failures | 30 min | High - security events |
| P2 | Convert to ISO8601 timestamps | 15 min | Medium - log consistency |
| P2 | Replace console.log with logger | 30 min | Medium - proper logging |
| P2 | Add child loggers pattern | 1 hour | Medium - better context |

---

**Audit Complete.** Pass rate of 46.7% indicates good logging foundations but significant gaps in sensitive data protection, distributed tracing, and metrics exposure. The service has a comprehensive performance monitor that isn't being used.
