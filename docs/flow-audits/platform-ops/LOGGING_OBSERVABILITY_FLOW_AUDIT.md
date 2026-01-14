# LOGGING & OBSERVABILITY FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Logging & Observability |

---

## Executive Summary

**WORKING - Comprehensive logging and tracing**

| Component | Status |
|-----------|--------|
| Pino structured logging | ✅ Working |
| PII/secret redaction | ✅ Working |
| OpenTelemetry tracing | ✅ Working |
| Request/response logging | ✅ Working |
| Audit logging | ✅ Working |
| Performance logging | ✅ Working |
| Slow request detection | ✅ Working |
| Correlation IDs | ✅ Working |
| Pretty print (dev) | ✅ Working |
| JSON format (prod) | ✅ Working |

**Bottom Line:** Full observability stack with Pino for structured logging, OpenTelemetry for distributed tracing, automatic PII redaction, audit logging for security events, and performance monitoring for slow requests.

---

## Logging (Pino)

**File:** `backend/services/api-gateway/src/utils/logger.ts`

### Features

| Feature | Status |
|---------|--------|
| Structured JSON logging | ✅ |
| Log levels (debug, info, warn, error) | ✅ |
| Request serialization | ✅ |
| Response serialization | ✅ |
| Child loggers (context) | ✅ |
| Pretty printing (dev) | ✅ |
| ISO timestamps (prod) | ✅ |

### PII Redaction

Automatically redacts sensitive data:
```typescript
redact: {
  paths: [
    // Auth secrets
    'password', 'authorization', 'token', 'apiKey', 'secret',
    'headers.authorization', 'headers.cookie', 'headers.x-api-key',
    
    // Personal data
    'email', 'phone', 'ssn', 'dateOfBirth',
    'user.email', 'user.phone',
    
    // Financial data
    'creditCard', 'cardNumber', 'cvv', 'accountNumber',
    'body.creditCard', 'body.cvv',
    
    // Addresses
    'address.street', 'address.line1'
  ],
  censor: '[REDACTED]'
}
```

### Logger Types
```typescript
// Main logger
export const logger = pino({ ... });

// Context-specific loggers
export const createLogger = (context: string) => logger.child({ context });
export const createRequestLogger = (requestId, venueId) => logger.child({ ... });

// Specialized loggers
export const auditLogger = logger.child({ context: 'audit', type: 'security' });
export const performanceLogger = logger.child({ context: 'performance', type: 'metrics' });
```

### Helper Functions
```typescript
logSecurityEvent(event, details, severity);
logPerformanceMetric(metric, value, unit, tags);
logError(error, context, additional);
logRequest(req);
logResponse(req, reply, responseTime);
```

---

## Distributed Tracing (OpenTelemetry)

**File:** `backend/services/api-gateway/src/utils/tracing.ts`

### Configuration
```typescript
const sdk = new NodeSDK({
  spanProcessor: new BatchSpanProcessor(otlpExporter, {
    maxQueueSize: 2048,
    maxExportBatchSize: 512,
    scheduledDelayMillis: 5000,
    exportTimeoutMillis: 30000,
  }),
  instrumentations: [
    getNodeAutoInstrumentations(),
    new FastifyInstrumentation(),
    new HttpInstrumentation(),
    new RedisInstrumentation(),
  ],
});
```

### Auto-Instrumentation

- Fastify requests
- HTTP outbound calls
- Redis operations
- File system (disabled)

### Custom Spans
```typescript
// Create span manually
const span = createSpan('operation-name', { key: 'value' });

// Trace async operations
const result = await traceAsync('operation-name', async (span) => {
  span.setAttribute('custom', 'attribute');
  return await doWork();
});
```

### Span Attributes
```typescript
span.setAttribute('http.route', route);
span.setAttribute('http.tenant_id', tenantId);
span.setAttribute('http.downstream', true);
span.setAttribute('http.error', true);
```

---

## Request/Response Logging

**File:** `backend/services/api-gateway/src/middleware/logging.middleware.ts`
```typescript
// Log all incoming requests (except health/metrics)
server.addHook('onRequest', async (request) => {
  if (!isHealthCheck(request.url)) {
    logRequest(request);
  }
});

// Log all responses with timing
server.addHook('onResponse', async (request, reply) => {
  const responseTime = reply.elapsedTime;
  logResponse(request, reply, responseTime);
  
  // Alert on slow requests (>1 second)
  if (responseTime > 1000) {
    performanceLogger.warn({
      requestId: request.id,
      method: request.method,
      url: request.url,
      responseTime,
      statusCode: reply.statusCode,
    }, `Slow request detected: ${responseTime}ms`);
  }
});
```

---

## Log Output Examples

### Development (Pretty)
```
12:34:56 INFO: GET /api/v1/events - 200 [req-123]
12:34:57 WARN: Slow request detected: 1234ms [req-124]
12:34:58 ERROR: Error in payment: Connection refused [req-125]
```

### Production (JSON)
```json
{
  "level": "info",
  "time": "2025-01-01T12:34:56.789Z",
  "service": "api-gateway",
  "environment": "production",
  "requestId": "req-123",
  "method": "GET",
  "url": "/api/v1/events",
  "statusCode": 200,
  "responseTime": 45,
  "message": "GET /api/v1/events - 200"
}
```

---

## Files Involved

| File | Purpose |
|------|---------|
| `api-gateway/src/utils/logger.ts` | Main logger |
| `api-gateway/src/utils/tracing.ts` | OpenTelemetry |
| `api-gateway/src/middleware/logging.middleware.ts` | Request logging |

---

## Related Documents

- `SERVICE_HEALTH_MONITORING_FLOW_AUDIT.md` - Health checks
- `ERROR_HANDLING_FLOW_AUDIT.md` - Error logging
- `RATE_LIMITING_FLOW_AUDIT.md` - Rate limit logging
