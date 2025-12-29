# Minting Service - 04 Logging & Observability Audit

**Service:** minting-service
**Document:** 04-logging-observability.md
**Date:** 2024-12-24
**Auditor:** Cline
**Pass Rate:** 65% (51/78 checks)

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 5 | No distributed tracing, No request ID, No prod log transport, No data redaction, Missing Redis/Queue health |
| HIGH | 2 | No request logging, No query timing |
| MEDIUM | 0 | None |
| LOW | 0 | None |

## 3.1 Logger Configuration (6/10)

- LC1: Winston JSON format - PASS
- LC2: Log level configurable - PASS
- LC3: Service name in meta - PASS
- LC4: Timestamp included - PASS
- LC5: Error stacks captured - PASS
- LC6: Console transport dev - PASS
- LC7: File/external prod - FAIL
- LC8: Log rotation - FAIL
- LC9: Sensitive redaction - FAIL
- LC10: Request ID correlation - FAIL

## 3.2 Log Content (5/10)

- LCN1: Request start logged - FAIL
- LCN2: Request completion - FAIL
- LCN3: Error with context - PASS
- LCN4: Business events - PASS
- LCN5: Auth failures - PASS
- LCN6: External calls - PASS
- LCN7: DB query times - FAIL
- LCN8: Queue operations - PASS
- LCN9: Startup/shutdown - PASS
- LCN10: No sensitive data - PARTIAL

## 3.3 Structured Logging (6/10)

- SL1: JSON in production - PASS
- SL2: Consistent fields - PARTIAL
- SL3: Levels appropriate - PASS
- SL4: Context objects - PASS
- SL5: Tenant ID included - PASS
- SL6: Request ID - FAIL
- SL7: User ID - FAIL
- SL8: Machine-readable - PASS
- SL9: No circular refs - PASS
- SL10: Large objects truncated - FAIL

## 3.4 Metrics (15/15 PASS)

- M1-15: All Prometheus metrics checks PASS
- Business: mintsTotal, mintsSuccess, mintsFailed
- Resource: queueDepth, walletBalance, dbConnections
- Latency: ipfsUpload, solanaTx durations
- Labels: tenant_id on metrics

## 3.5 Health Checks (13/15)

- HC1-6: All basic health checks PASS
- HC7: Redis check - FAIL
- HC8: Queue check - FAIL
- HC9-15: Remaining checks PASS
- Includes: Solana, DB, wallet balance, latency

## 3.6 Distributed Tracing (0/12)

- DT1-12: All tracing checks FAIL
- No OpenTelemetry configured
- No trace/span propagation
- No instrumentation

## 3.7 Alerting Config (6/6 PASS)

- System health gauge
- Error rate metric
- Latency SLI metrics
- Queue depth gauge
- Wallet balance gauge
- Helper functions

## Critical Remediations

### P0: Add OpenTelemetry
```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

const sdk = new NodeSDK({
  serviceName: 'minting-service',
  instrumentations: [getNodeAutoInstrumentations()]
});
sdk.start();
```

### P0: Add Request ID Middleware
```typescript
app.addHook('onRequest', (request, reply, done) => {
  request.id = request.headers['x-request-id'] || uuidv4();
  done();
});
```

### P0: Add Production Log Transport
```typescript
if (process.env.NODE_ENV === 'production') {
  logger.add(new winston.transports.File({
    filename: '/var/log/minting-service.log',
    maxsize: 10 * 1024 * 1024,
    maxFiles: 5
  }));
}
```

### P0: Add Sensitive Data Redaction
```typescript
const redactFormat = winston.format((info) => {
  if (info.password) info.password = '[REDACTED]';
  if (info.token) info.token = '[REDACTED]';
  return info;
});
```

### P1: Add Redis/Queue Health
```typescript
const redisHealth = await redis.ping();
const queueHealth = await mintQueue.isReady();
```

## Strengths

- Comprehensive Prometheus metrics (15/15)
- Excellent health checks with K8s probes
- Wallet balance monitoring
- Component latency reporting
- Degraded status support
- JSON logging with context objects
- System health gauge for alerting

Logging & Observability Score: 65/100
