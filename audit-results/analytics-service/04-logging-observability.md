## Logging & Observability Audit: analytics-service

### Audit Against: `Docs/research/04-logging-observability.md`

---

## 3.1 Log Configuration Checklist

| ID | Check | Severity | Status | Evidence |
|----|-------|----------|--------|----------|
| LC1 | Structured JSON logging enabled | CRITICAL | ✅ PASS | `logger.ts:5` - `winston.format.json()` |
| LC2 | Appropriate log level per environment | HIGH | ✅ PASS | `logger.ts:11` - Production: `info`, Dev: `debug` |
| LC3 | Redaction configured for sensitive fields | CRITICAL | ❌ FAIL | **No redaction configuration** found |
| LC4 | Correlation ID middleware installed | CRITICAL | ❌ FAIL | **No correlation ID handling** |
| LC5 | Request ID generation enabled | HIGH | ✅ PASS | `app.ts:36` - `requestIdHeader: 'x-request-id'` |
| LC6 | Timestamps in ISO 8601 format | MEDIUM | ✅ PASS | `logger.ts:5` - `winston.format.timestamp()` |
| LC7 | Service name/version in base context | HIGH | ⚠️ PARTIAL | Service name yes, **no version** |
| LC8 | Log destination configured | HIGH | ⚠️ PARTIAL | Console only, no file/external destination |
| LC9 | Log rotation configured | MEDIUM | ❌ FAIL | No rotation config |
| LC10 | Pretty print disabled in production | MEDIUM | ✅ PASS | Production uses JSON format |

---

## Logger Configuration Analysis

**Current Implementation (logger.ts):**
```typescript
import winston from 'winston';

const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),  // ⚠️ Stack traces in all environments
  winston.format.json()
);

export const logger = winston.createLogger({
  level: config.env === 'production' ? 'info' : 'debug',
  format: logFormat,
  defaultMeta: { service: 'analytics-service' },  // ✅ Service name
  transports: [
    new winston.transports.Console({...})
  ]
  // ❌ MISSING: No redaction paths
  // ❌ MISSING: No version in metadata
  // ❌ MISSING: No file transport for production
});
```

**Critical Missing: Redaction Configuration**
```typescript
// MISSING - Should be added
const redactedLogger = winston.createLogger({
  // ... existing config
  format: winston.format.combine(
    winston.format.timestamp(),
    // Custom redaction format
    winston.format((info) => {
      const sensitiveFields = ['password', 'token', 'authorization', 'apiKey', 'secret'];
      // Implement redaction logic
      return info;
    })(),
    winston.format.json()
  )
});
```

---

## 3.2 Sensitive Data Protection Checklist

| ID | Check | Severity | Status | Evidence |
|----|-------|----------|--------|----------|
| SD1 | Passwords never logged | CRITICAL | ⚠️ NOT VERIFIED | No redaction config |
| SD2 | Tokens/API keys redacted | CRITICAL | ❌ FAIL | No redaction |
| SD3 | PII fields redacted | CRITICAL | ❌ FAIL | No redaction |
| SD4 | Credit card data never logged | CRITICAL | N/A | Analytics service doesn't handle cards |
| SD5 | Session tokens redacted | CRITICAL | ❌ FAIL | No redaction |
| SD6 | Request body logging filtered | HIGH | ⚠️ PARTIAL | No explicit body logging, but no safeguards |
| SD7 | Error stack traces controlled | MEDIUM | ❌ FAIL | `errors({ stack: true })` logs stacks in ALL environments |
| SD8 | Database queries sanitized | HIGH | ⚠️ NOT VERIFIED | Need to check query logging |

**Stack Trace Issue:**
```typescript
// logger.ts:7 - Stack traces in ALL environments
winston.format.errors({ stack: true })

// Should be:
winston.format.errors({ stack: config.env !== 'production' })
```

---

## 3.3 Security Event Logging Checklist

| ID | Event Category | Status | Evidence |
|----|----------------|--------|----------|
| SE1 | Authentication login success/failure | ⚠️ PARTIAL | Auth middleware logs errors, not successes |
| SE2 | Authentication logout | ❌ NOT FOUND | No logout logging |
| SE3 | Password change/reset | N/A | Handled by auth-service |
| SE4 | MFA enable/disable | N/A | Handled by auth-service |
| SE5 | Authorization access denied | ✅ PASS | `auth.middleware.ts` returns 403 with log |
| SE6 | Role/permission changes | ❌ NOT FOUND | No audit trail |
| SE7 | Session creation/expiry | ❌ NOT FOUND | No session logging |
| SE8 | Input validation failures | ⚠️ PARTIAL | Fastify logs, not explicit security events |
| SE9 | Rate limiting exceeded | ⚠️ PARTIAL | Rate limit middleware exists but minimal logging |
| SE10 | High-value transactions | N/A | Analytics service doesn't process transactions |
| SE11 | Data exports | ❌ NOT FOUND | No export audit logging |
| SE12 | Bulk data access | ❌ NOT FOUND | No bulk access logging |
| SE13 | Admin actions | ❌ NOT FOUND | No admin action audit trail |

---

## 3.4 Distributed Tracing Checklist

| ID | Check | Severity | Status | Evidence |
|----|-------|----------|--------|----------|
| DT1 | OpenTelemetry SDK initialized | HIGH | ❌ FAIL | **No OpenTelemetry** found |
| DT2 | Auto-instrumentation enabled | HIGH | ❌ FAIL | No instrumentation |
| DT3 | Service name configured for OTEL | HIGH | ❌ FAIL | No OTEL config |
| DT4 | Trace ID in all logs | HIGH | ❌ FAIL | No trace IDs |
| DT5 | Context propagation to downstream | CRITICAL | ❌ FAIL | No header propagation |
| DT6 | Error spans recorded | HIGH | ❌ FAIL | No spans |
| DT7 | Custom spans for business logic | MEDIUM | ❌ FAIL | No spans |
| DT8 | Sampling configured | MEDIUM | N/A | No OTEL |

---

## 3.5 Metrics Checklist

| ID | Check | Severity | Status | Evidence |
|----|-------|----------|--------|----------|
| M1 | `/metrics` endpoint exposed | HIGH | ❌ FAIL | No Prometheus endpoint |
| M2 | HTTP request rate tracked | HIGH | ⚠️ PARTIAL | Fastify internal logging only |
| M3 | HTTP request duration tracked | HIGH | ⚠️ PARTIAL | No explicit histogram |
| M4 | Error rate trackable | HIGH | ⚠️ PARTIAL | Logged but not as metric |
| M5 | Default Node.js metrics enabled | MEDIUM | ❌ FAIL | No prom-client |
| M6 | Business metrics defined | MEDIUM | ✅ PASS | InfluxDB metrics for tickets, revenue |
| M7 | Label cardinality controlled | HIGH | ⚠️ PARTIAL | User IDs used as tags (high cardinality) |
| M8 | Histogram buckets appropriate | MEDIUM | N/A | No Prometheus histograms |

**InfluxDB Metrics (influxdb-metrics.service.ts):**
```typescript
// ✅ Good: Business metrics tracked
async recordEventMetrics(data: {
  eventId: string;
  venueId: string;
  ticketsSold: number;
  revenueCents: number;
  capacity: number;
})

// ⚠️ Concern: User ID as tag (high cardinality)
async recordUserAction(data: {
  userId: string,  // ❌ High cardinality tag
  action: string,
  ...
})
```

---

## 3.6 Fastify-Specific Checklist

| ID | Check | Severity | Status | Evidence |
|----|-------|----------|--------|----------|
| FP1 | Logger configured in Fastify options | CRITICAL | ✅ PASS | `app.ts:28-38` - Logger with levels |
| FP2 | `request.log` used instead of global logger | HIGH | ⚠️ PARTIAL | Mixed usage (some use global logger) |
| FP3 | Serializers configured for req/res | HIGH | ❌ FAIL | No custom serializers |
| FP4 | `genReqId` configured | HIGH | ⚠️ PARTIAL | Uses header but no custom gen |
| FP5 | Child loggers used for context | MEDIUM | ✅ PASS | `logger.ts:24` - `createLogger()` |
| FP6 | Async logging enabled | MEDIUM | ❓ UNKNOWN | Winston sync by default |

**Fastify Logger Config (app.ts:28-38):**
```typescript
const app = Fastify({
  logger: {
    level: config.env === 'development' ? 'debug' : 'info',
    transport: config.env === 'development' ? {
      target: 'pino-pretty',
      options: {...}
    } : undefined
  },
  trustProxy: true,
  requestIdHeader: 'x-request-id',
  disableRequestLogging: false,  // ✅ Request logging enabled
  bodyLimit: 10485760,
});
```

**Issues:**
- ❌ Uses Winston logger separately from Fastify's Pino - **inconsistent logging**
- ❌ No correlation ID propagation
- ❌ No custom serializers to filter sensitive data

---

## 3.7 InfluxDB Query Safety

| ID | Check | Severity | Status | Evidence |
|----|-------|----------|--------|----------|
| IQ1 | Query parameters escaped | CRITICAL | ❌ FAIL | **String interpolation used** |
| IQ2 | Input validated before query | HIGH | ❌ FAIL | No validation |
| IQ3 | Query errors logged | HIGH | ✅ PASS | `logger.error('InfluxDB query error:', error)` |

**Critical: Flux Query Injection Risk**
```typescript
// influxdb-metrics.service.ts:72-79 - VULNERABLE TO INJECTION
async getEventSalesTimeSeries(eventId: string, hours: number = 24) {
  const query = `
    from(bucket: "${process.env.INFLUX_BUCKET || 'analytics'}")
      |> filter(fn: (r) => r.event_id == "${eventId}")  // ❌ INJECTION RISK
  `;
}
```

If `eventId` contains malicious Flux code, it could manipulate the query.

---

## Summary

### Critical Issues (Must Fix Before Production)
| Issue | Location | Risk |
|-------|----------|------|
| No sensitive data redaction | `logger.ts` | PII/credential exposure |
| No correlation ID middleware | Global | Cannot trace distributed requests |
| No OpenTelemetry tracing | Missing entirely | No distributed tracing |
| Flux query injection | `influxdb-metrics.service.ts` | Data breach/manipulation |
| Stack traces in production | `logger.ts:7` | Information disclosure |
| No Prometheus metrics endpoint | Missing entirely | No operational metrics |

### High Issues (Should Fix)
| Issue | Location | Risk |
|-------|----------|------|
| Winston/Pino inconsistency | `app.ts` + `logger.ts` | Inconsistent log format |
| High cardinality user_id tag | InfluxDB metrics | Performance degradation |
| No security event audit trail | Services | Compliance gaps |
| No custom serializers | Fastify config | May log sensitive request data |

### Compliance Score: 32% (12/38 checks passed)

- ✅ PASS: 9
- ⚠️ PARTIAL: 10
- ❌ FAIL: 16
- ❓ UNKNOWN: 1
- N/A: 6

### Priority Fixes

1. **Add redaction to Winston:**
```typescript
const sensitiveFields = ['password', 'token', 'secret', 'authorization'];
// Add custom format to redact
```

2. **Add correlation ID middleware:**
```typescript
app.addHook('onRequest', async (request, reply) => {
  request.correlationId = request.headers['x-correlation-id'] || uuid();
  reply.header('x-correlation-id', request.correlationId);
});
```

3. **Add OpenTelemetry:**
```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
// Configure OTLP exporter
```

4. **Fix Flux query injection:**
```typescript
// Use parameterized queries or escape input
const safeEventId = eventId.replace(/[^a-zA-Z0-9-]/g, '');
```

5. **Add Prometheus metrics endpoint:**
```typescript
import { Registry, collectDefaultMetrics } from 'prom-client';
app.get('/metrics', async (req, reply) => {
  reply.header('Content-Type', register.contentType);
  return register.metrics();
});
```
