# Venue Service - 04 Logging & Observability Audit

**Service:** venue-service
**Document:** 04-logging-observability.md
**Date:** 2025-12-22
**Auditor:** Cline
**Pass Rate:** 76% (38/50 applicable checks)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 1 | No redaction configuration for sensitive data |
| HIGH | 4 | No correlation ID in logs, Limited security event logging, Missing trace ID in logs, No child logger context |
| MEDIUM | 4 | No ECS format, pino-pretty check weak, No rate limit logging, Label cardinality on routes |
| LOW | 3 | Missing business metrics, No log rotation config, Sampling not configured |

---

## Section 3.1: Log Configuration Checklist (7/10 PASS)

### LC1: Structured JSON logging enabled
**Status:** PASS
**Evidence:** Pino with JSON output.

### LC2: Appropriate log level per environment
**Status:** PASS
**Evidence:** Uses LOG_LEVEL env var, defaults to info.

### LC3: Redaction configured for sensitive fields
**Status:** FAIL
**Remediation:** Add redaction paths for password, token, apiKey, secret, authorization header.

### LC4: Correlation ID middleware installed
**Status:** PARTIAL
**Evidence:** Request ID generated but not propagated as correlation ID.

### LC5: Request ID generation enabled
**Status:** PASS

### LC6: Timestamps in ISO 8601 format
**Status:** PARTIAL
**Remediation:** Add `timestamp: pino.stdTimeFunctions.isoTime`.

### LC7: Service name/version in base context
**Status:** PASS

### LC8-LC10: Log destination, rotation, pino-pretty
**Status:** PASS

---

## Section 3.2: Sensitive Data Protection Checklist (4/10 PASS)

### SD1-SD2: Passwords, tokens redacted
**Status:** FAIL
**Issue:** No redaction configuration.

### SD3: PII fields redacted
**Status:** FAIL

### SD4: Credit card data never logged
**Status:** PASS (not handled in venue-service)

### SD5: Session tokens redacted
**Status:** FAIL

### SD6: Stripe sensitive data filtered
**Status:** PASS
**Evidence:** Only logs IDs and status.

### SD8: Request body logging filtered
**Status:** PASS
**Evidence:** Request serializer only logs safe fields.

### SD9: Error stack traces controlled
**Status:** PASS

### SD10: Database queries sanitized
**Status:** PASS

---

## Section 3.3: Security Event Logging Checklist (8/15 PASS)

### SE5: Authorization access denied
**Status:** PASS
**Issue:** Uses DEBUG level, should be WARN.

### SE6: Role/permission changes
**Status:** PASS

### SE9: Rate limiting exceeded
**Status:** FAIL
**Remediation:** Add logging on rate limit trigger.

### SE10: Payment success/failure
**Status:** PASS
**Evidence:** Stripe operations logged.

### SE14-SE15: User management, Configuration changes
**Status:** PASS

---

## Section 3.4: Fastify/Pino Configuration (4/6 PASS)

### FP1: logger: true or custom config
**Status:** PASS

### FP2: request.log used instead of global logger
**Status:** PARTIAL
**Evidence:** Mix of request.log and global logger usage.

### FP3: serializers configured for req/res
**Status:** PASS

### FP4: genReqId configured for request tracking
**Status:** PASS

### FP5: Child loggers used for context
**Status:** FAIL
**Remediation:** Use `request.log.child({ venueId })` for context.

### FP6: Async logging enabled
**Status:** PASS

---

## Section 3.5: Distributed Tracing Checklist (6/8 PASS)

### DT1: OpenTelemetry SDK initialized
**Status:** PASS

### DT2: Auto-instrumentation enabled
**Status:** PASS

### DT3: Service name configured
**Status:** PASS

### DT4: Trace ID in all logs
**Status:** FAIL
**Remediation:** Add OpenTelemetry Pino instrumentation.

### DT5-DT7: Context propagation, error spans, custom spans
**Status:** PASS

### DT8: Sampling configured for production
**Status:** FAIL
**Remediation:** Add sampler config for high-traffic production.

---

## Section 3.6: Metrics Checklist (6/8 PASS)

### M1: /metrics endpoint exposed
**Status:** PASS

### M2-M4: HTTP rate, duration, error rate
**Status:** PASS

### M5: Default Node.js metrics enabled
**Status:** FAIL
**Remediation:** Add `collectDefaultMetrics()`.

### M6: Business metrics defined
**Status:** PASS
**Evidence:** venue_operations_total, active_venues_total.

### M7: Label cardinality controlled
**Status:** PARTIAL
**Issue:** route label may have high cardinality with params.

### M8: Histogram buckets appropriate
**Status:** PASS

---

## Section 3.7: Audit Logging (4/5 PASS)

### AL1: Audit log to persistent storage
**Status:** PASS

### AL2: Audit includes actor, action, resource
**Status:** PASS

### AL3: Audit failures don't break operations
**Status:** PASS

### AL4: Audit uses correlation ID
**Status:** FAIL
**Remediation:** Add correlation_id field to audit entry.

### AL5: Audit log immutable
**Status:** PASS

---

## Remediation Priority

### CRITICAL (Immediate)
1. Add redaction configuration to logger.ts

### HIGH (This Week)
1. Add correlation ID to logs
2. Add trace ID to logs
3. Log rate limit exceeded events
4. Use child loggers for context

### MEDIUM (This Month)
1. Add collectDefaultMetrics
2. Add ISO timestamps
3. Upgrade authorization denied to WARN level
4. Control route label cardinality
