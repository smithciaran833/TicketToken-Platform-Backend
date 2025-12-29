# Payment Service - 04 Logging & Observability Audit

**Service:** payment-service
**Document:** 04-logging-observability.md
**Date:** 2025-12-23
**Auditor:** Cline
**Pass Rate:** 42% (22/53 checks)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 0 | None |
| HIGH | 2 | Not using Pino (custom logger), No /metrics endpoint |
| MEDIUM | 3 | Custom tracing not OTel, No OWASP vocabulary, No correlation propagation |
| LOW | 1 | Not using request.log |

---

## 3.1 Log Configuration (4/9)

| Check | Status | Evidence |
|-------|--------|----------|
| LC1: Structured JSON | PARTIAL | SafeLogger JSON, main logger NOT |
| LC2: Log level per env | PARTIAL | Only DEBUG check |
| LC3: Redaction configured | PASS | pci-log-scrubber.util.ts |
| LC4: Correlation ID middleware | PARTIAL | Request ID only |
| LC5: Request ID generation | PASS | uuidv4() fallback |
| LC6: ISO 8601 timestamps | PASS | toISOString() |
| LC7: Service name/version | PARTIAL | Name only, no version |
| LC8: Log destination | PASS | stdout |
| LC9: Log rotation | FAIL | No rotation |

---

## 3.2 Sensitive Data Protection (6/9)

| Check | Status | Evidence |
|-------|--------|----------|
| SD1: Passwords redacted | PASS | sensitiveFields |
| SD2: Tokens redacted | PASS | tokens pattern |
| SD3: PII redacted | PASS | email, SSN patterns |
| SD4: Credit cards redacted | PASS | [CARD_REDACTED] |
| SD5: Session tokens | PASS | tokens pattern |
| SD6: Stripe data | PASS | Card patterns |
| SD7: Solana keys | PARTIAL | No specific patterns |
| SD8: Request body filtered | PASS | PIISanitizer |
| SD9: Stack traces controlled | FAIL | Not env-controlled |

**Excellent PCI Scrubbing:**
- Track data (magnetic stripe)
- Credit card patterns (16-digit)
- CVV/CVC patterns
- Expiration dates
- PIN blocks
- SSN and bank accounts

---

## 3.3 Security Events (2/10 applicable)

| Check | Status | Evidence |
|-------|--------|----------|
| SE5: Access denied | PARTIAL | Logs but not OWASP vocab |
| SE8: Validation failures | PARTIAL | Not standardized |
| SE9: Rate limit exceeded | PARTIAL | No event vocab |
| SE10: Payment success/fail | PASS | Webhook logs |
| SE11: Refunds issued | PASS | Controller logs |
| SE13: Sensitive data access | FAIL | No audit trail |
| SE15: Config changes | FAIL | Not logged |

---

## 3.4 Fastify/Pino Config (2/6)

| Check | Status | Evidence |
|-------|--------|----------|
| FP1: logger: true | PASS | app.ts |
| FP2: request.log used | FAIL | Global logger used |
| FP3: Serializers configured | FAIL | None |
| FP4: genReqId configured | PARTIAL | Manual in middleware |
| FP5: Child loggers | PASS | .child() pattern |
| FP6: Async logging | FAIL | Sync console.log |

---

## 3.5 Stripe Logging (2/5)

| Check | Status | Evidence |
|-------|--------|----------|
| ST1: Event ID logged | PASS | eventId: event.id |
| ST2: Payment intent IDs | PASS | Only ID, not card |
| ST3: Customer IDs hashed | PARTIAL | No explicit hashing |
| ST4: Stripe errors with code | PARTIAL | No type parsing |
| ST5: Idempotency keys logged | FAIL | Not logged |

---

## 3.6 Distributed Tracing (3/7)

| Check | Status | Evidence |
|-------|--------|----------|
| DT1: OpenTelemetry SDK | FAIL | Custom implementation |
| DT2: Auto-instrumentation | FAIL | Not using OTel |
| DT3: Service name | PASS | payment-service |
| DT4: Trace ID in logs | PARTIAL | Only in middleware |
| DT5: Context propagation | PASS | W3C traceparent |
| DT6: Error spans | PASS | status: 'ERROR' |
| DT7: Custom spans | PASS | createChildSpan() |

---

## 3.7 Metrics (3/7)

| Check | Status | Evidence |
|-------|--------|----------|
| M1: /metrics endpoint | FAIL | Not exposed |
| M2: HTTP request rate | PARTIAL | No counter |
| M3: HTTP duration | PARTIAL | paymentDuration only |
| M4: Error rate | FAIL | No error counter |
| M5: Default Node.js metrics | PASS | collectDefaultMetrics() |
| M6: Business metrics | PASS | paymentTotal, refundTotal |
| M7: Label cardinality | PASS | Limited labels |

---

## Strengths

- Comprehensive PCI DSS log scrubbing
- Track data (magnetic stripe) redaction
- Credit card, CVV, expiration redaction
- SSN and bank account redaction
- Token/API key redaction
- ISO 8601 timestamps
- Request ID generation
- Child logger pattern
- Prometheus business metrics defined
- Default Node.js metrics
- W3C traceparent extraction
- Custom span utilities
- Webhook event IDs logged

---

## Remediation Priority

### HIGH (This Week)
1. **Replace custom logger with Pino:**
```typescript
import pino from 'pino';
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
```

2. **Add /metrics endpoint:**
```typescript
fastify.get('/metrics', async (req, reply) => {
  reply.header('Content-Type', register.contentType);
  return register.metrics();
});
```

### MEDIUM (This Month)
1. Integrate OpenTelemetry SDK
2. Implement OWASP security event vocabulary
3. Propagate correlation ID to downstream services

### LOW (Backlog)
1. Use request.log instead of global logger
