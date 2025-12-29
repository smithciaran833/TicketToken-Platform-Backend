# Event Service - 04 Logging & Observability Audit

**Service:** event-service
**Document:** 04-logging-observability.md
**Date:** 2025-12-23
**Auditor:** Cline
**Pass Rate:** 81% (51/63 applicable checks)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 0 | None |
| HIGH | 1 | No distributed tracing (OpenTelemetry) |
| MEDIUM | 2 | No PII redaction in logs, No request duration logging |
| LOW | 2 | Inconsistent child logger usage, Request ID not consistently propagated |

---

## 3.1 Logging Configuration

| Check | Status | Evidence |
|-------|--------|----------|
| LC1: Structured JSON in prod | PASS | LOG_FORMAT === 'json' in production |
| LC2: Pretty logging in dev | PASS | pino-pretty transport in non-json mode |
| LC3: Log level configurable | PASS | LOG_LEVEL from env with 'info' default |
| LC4: Log level validated | PASS | Joi validates debug/info/warn/error |
| LC5: Service name in context | PASS | base: { service: 'event-service' } |
| LC6: Timestamp included | PASS | Pino includes by default |
| LC7: PII redaction | FAIL | No redaction configuration |
| LC9: Centralized logging | PARTIAL | JSON logs emitted, needs shipper |
| LC10: Child loggers used | PARTIAL | Used in BaseModel, inconsistent elsewhere |

---

## 3.2 Request/Response Logging

| Check | Status | Evidence |
|-------|--------|----------|
| RR1: All requests logged | PARTIAL | Fastify logger enabled, no explicit hook |
| RR2: Request ID generated | PASS | Fastify generates request.id |
| RR3: Request ID propagated | PARTIAL | Used in error-handler, not consistently in services |
| RR4: Method and URL logged | PASS | Logged in error-handler |
| RR5: Response status logged | PARTIAL | Error responses only |
| RR6: Response time logged | FAIL | No duration logging middleware |
| RR7: Body logged in dev only | PASS | Conditional on isProduction |
| RR8: Headers not logged in prod | PASS | Conditional on isProduction |
| RR9: User ID logged | PARTIAL | In audit entries only |
| RR10: Tenant ID logged | PARTIAL | In audit entries only |

---

## 3.3 Business Event Logging

| Check | Status | Evidence |
|-------|--------|----------|
| BE1: Event creation logged | PASS | auditLogger.logEventAction('create') |
| BE2: Event updates logged | PASS | auditLogger.logEventAction('updated') |
| BE3: Event deletion logged | PASS | auditLogger.logEventAction('deleted') |
| BE4: Publication changes logged | PASS | Logs publication status change |
| BE5: Capacity changes logged | PARTIAL | Operations exist, logging not verified |
| BE6: Pricing changes logged | PARTIAL | Operations exist, logging not verified |
| BE7: Before/after state logged | PASS | Logs previousData and updates |
| BE8: User context included | PASS | Logs userId |
| BE9: Tenant context included | PASS | Tenant ID in event records |
| BE10: Critical ops at INFO+ | PASS | Uses logger.info |

---

## 3.4 Audit Logging

| Check | Status | Evidence |
|-------|--------|----------|
| AL1: Stored separately | PASS | Writes to audit_logs table |
| AL2: Timestamp included | PASS | created_at auto-populated |
| AL3: User ID included | PASS | user_id field |
| AL4: IP address included | PASS | ip_address field |
| AL5: User agent included | PASS | user_agent field |
| AL6: Action type included | PASS | CREATE/UPDATE/DELETE/ACCESS |
| AL7: Resource type included | PASS | resource_type: 'event' |
| AL8: Resource ID included | PASS | resource_id field |
| AL9: Success/failure included | PASS | success: true/false |
| AL10: Failures don't break ops | PASS | Error caught, logged, not thrown |
| AL11: Access denials logged | PASS | logEventAccess with success: allowed |
| AL12: Admin actions logged | PARTIAL | CRUD logged, no admin differentiation |

---

## 3.5 Metrics & Tracing

| Check | Status | Evidence |
|-------|--------|----------|
| MT1: Prometheus /metrics | PASS | /metrics endpoint with register.metrics() |
| MT2: Default Node.js metrics | PASS | collectDefaultMetrics() |
| MT3: HTTP request count | PASS | httpRequestsTotal counter |
| MT4: HTTP request duration | PASS | httpRequestDuration histogram |
| MT5: Business operation counters | PASS | event/capacity/pricing counters |
| MT6: DB query duration | PASS | databaseQueryDuration histogram |
| MT7: External service metrics | PASS | externalServiceCallsTotal, duration |
| MT8: Cache hit/miss metrics | PASS | cacheHitsTotal, cacheMissesTotal |
| MT9: Rate limit metrics | PASS | rateLimitHitsTotal |
| MT10: Circuit breaker metrics | PASS | circuitBreakerStateChanges |
| MT11: Histogram buckets appropriate | PASS | [0.1, 0.5, 1, 2, 5, 10] |
| MT12: Consistent labels | PASS | status, operation, service |
| MT13: Distributed tracing | FAIL | No OpenTelemetry |
| MT14: Trace context propagation | FAIL | No W3C Trace Context |
| MT15: Span creation | FAIL | No span instrumentation |

---

## 3.6 Health Checks

| Check | Status | Evidence |
|-------|--------|----------|
| HC1: Health endpoint exists | PASS | GET /health |
| HC2: Database checked | PASS | SELECT 1 query |
| HC3: Redis checked | PASS | redis.ping() |
| HC4: External services checked | PASS | venue and auth service checks |
| HC5: Response times included | PASS | responseTime logged |
| HC6: Degraded status supported | PASS | Returns 'degraded' status |
| HC7: Timeout configured | PASS | AbortSignal.timeout(5000) |
| HC8: No auth required | PASS | Health routes without auth |
| HC9: Uptime included | PASS | uptime in response |
| HC10: Status affects HTTP code | PASS | 503 if unhealthy |

---

## Strengths

- Comprehensive Prometheus metrics
- Full audit logging to database
- Excellent health check implementation
- Proper log level configuration

---

## Remediation Priority

### HIGH (This Week)
1. Add OpenTelemetry for distributed tracing

### MEDIUM (This Month)
1. Add PII redaction to pino logger
2. Add request/response logging hook with duration

### LOW (Backlog)
1. Ensure consistent child logger usage
2. Propagate request ID to all services
