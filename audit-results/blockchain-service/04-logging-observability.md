# Blockchain Service - 04 Logging & Observability Audit

**Service:** blockchain-service
**Document:** 04-logging-observability.md
**Date:** 2024-12-26
**Auditor:** Cline
**Pass Rate:** 51% (21/41 applicable checks)

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 4 | No log redaction, No correlation ID, Fastify Pino disabled, No OpenTelemetry |
| HIGH | 3 | Global logger not request-scoped, Stack traces always logged, No default Node metrics |
| MEDIUM | 0 | None |
| LOW | 1 | Missing version in log metadata |

## 3.1 Log Configuration (5/8)

- LC1: Structured JSON logging - PASS
- LC2: Log level per environment - PASS
- LC3: Redaction configured - FAIL
- LC4: Correlation ID middleware - FAIL
- LC5: Request ID generation - PASS
- LC6: ISO 8601 timestamps - PASS
- LC7: Service name/version - PARTIAL
- LC8: Log destination - PASS

## 3.2 Sensitive Data Protection (0/7)

- SD1: Passwords never logged - FAIL
- SD2: Tokens redacted - FAIL
- SD3: PII fields redacted - FAIL
- SD5: Session tokens redacted - FAIL
- SD7: Solana private keys - PARTIAL
- SD8: Request body filtered - FAIL
- SD9: Stack traces controlled - PARTIAL

## 3.3 Security Events (2/2)

- SE5: Access denied logged - PASS
- SE8: Validation failures logged - PASS

## 3.4 Fastify/Pino (2/5)

- FP1: Fastify logger enabled - FAIL
- FP2: request.log used - FAIL
- FP3: Serializers configured - FAIL
- FP4: genReqId configured - PASS
- FP5: Child loggers - PARTIAL

## 3.5 Solana Logging (5/5 PASS)

- SOL1: Transaction signatures - PASS
- SOL2: Wallet addresses (public) - PASS
- SOL3: Private keys never logged - PASS
- SOL4: RPC errors with endpoint - PASS
- SOL5: Confirmation status - PASS

## 3.6 Distributed Tracing (0/5)

- DT1: OpenTelemetry SDK - FAIL
- DT2: Auto-instrumentation - FAIL
- DT4: Trace ID in logs - FAIL
- DT5: Context propagation - FAIL

## 3.7 Metrics (7/8)

- M1: /metrics endpoint - PASS
- M2: HTTP request rate - PASS
- M3: HTTP duration - PASS
- M4: Error rate trackable - PASS
- M5: Default Node.js metrics - FAIL
- M6: Business metrics - PASS
- M7: Label cardinality - PASS
- M8: Histogram buckets - PASS

## 3.8 Health Checks (PASS)

- Comprehensive endpoints
- Dependency status reported

## Critical Remediations

### P0: Add Log Redaction
```typescript
const redactFormat = format((info) => {
  const sensitiveKeys = ['password', 'token', 'secret', 'authorization'];
  // Redact matching keys
  return info;
});
```

### P0: Add Correlation ID Middleware
```typescript
app.addHook('onRequest', async (request) => {
  request.correlationId = request.headers['x-correlation-id'] || uuidv4();
});
```

### P0: Enable Fastify Pino Logger
```typescript
const app = fastify({ logger: true });
```

### P0: Add OpenTelemetry
```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
const sdk = new NodeSDK({ serviceName: 'blockchain-service' });
```

### P1: Enable Default Metrics
```typescript
collectDefaultMetrics({ register });
```

## Strengths

- Structured JSON logging
- Environment-based log levels
- Transaction signatures logged
- Public keys only logged
- Private keys never logged
- Comprehensive metrics
- Multiple health endpoints
- Good histogram buckets
- Authorization failures logged

Logging & Observability Score: 51/100
