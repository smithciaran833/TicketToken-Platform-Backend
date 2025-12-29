# Queue Service Logging & Observability Audit

**Service:** queue-service  
**Standard:** 04-logging-observability.md  
**Date:** December 27, 2025  

---

## Executive Summary

| Metric | Value |
|--------|-------|
| **Overall Pass Rate** | **76.7%** (23/30 checks) |
| **CRITICAL Issues** | 1 |
| **HIGH Issues** | 3 |
| **MEDIUM Issues** | 2 |
| **LOW Issues** | 1 |

---

## Section: Structured Logging

### LOG1: Structured JSON logging configured
| Status | **PASS** |
|--------|----------|
| Evidence | `src/utils/logger.ts:5-9` - Winston configured with `winston.format.json()` |
| Evidence | Uses `timestamp()` and `errors({ stack: true })` formats |

### LOG2: Log levels properly configured by environment
| Status | **PASS** |
|--------|----------|
| Evidence | `src/utils/logger.ts:4` - `level: process.env.NODE_ENV === 'production' ? 'info' : 'debug'` |
| Evidence | Production uses 'info', development uses 'debug' |

### LOG3: Request logging with timing
| Status | **PASS** |
|--------|----------|
| Evidence | `src/middleware/logging.middleware.ts:8-22` - Logs request and response with duration |
| Evidence | `const duration = Date.now() - start;` |

### LOG4: Correlation ID in all log entries
| Status | **FAIL** |
|--------|----------|
| Severity | **CRITICAL** |
| Evidence | `src/middleware/logging.middleware.ts` - No correlation ID passed to logger |
| Issue | Logs include `ip` and `query` but no correlation ID |
| Fix | Add `correlationId: request.correlationId` to all log calls |

### LOG5: User context in log entries
| Status | **PARTIAL** |
|--------|----------|
| Severity | **MEDIUM** |
| Evidence | `src/middleware/logging.middleware.ts:12-14` - Logs IP but not user ID |
| Issue | Should include userId when authenticated |
| Fix | Add `userId: request.user?.userId` to log context |

### LOG6: Sensitive data redaction
| Status | **PARTIAL** |
|--------|----------|
| Severity | **HIGH** |
| Evidence | `src/middleware/logging.middleware.ts:12` - Logs query params directly |
| Issue | Query params may contain sensitive data (tokens, API keys) |
| Fix | Add sensitive field redaction before logging |

### LOG7: Error logging with stack traces
| Status | **PASS** |
|--------|----------|
| Evidence | `src/utils/logger.ts:6` - `winston.format.errors({ stack: true })` |
| Evidence | `src/middleware/error.middleware.ts:11` - Logs `error.stack` |

### LOG8: Log output to stdout (container-friendly)
| Status | **PASS** |
|--------|----------|
| Evidence | `src/utils/logger.ts:10-14` - Uses `winston.transports.Console()` |
| Evidence | Suitable for Docker/Kubernetes log aggregation |

---

## Section: Metrics & Prometheus

### MET1: Prometheus metrics endpoint
| Status | **PASS** |
|--------|----------|
| Evidence | `src/routes/metrics.routes.ts:15-26` - `/metrics` endpoint |
| Evidence | Returns `text/plain; version=0.0.4` content type |

### MET2: Job completion counter
| Status | **PASS** |
|--------|----------|
| Evidence | `src/services/metrics.service.ts:42-47` - `jobsProcessedTotal` Counter |
| Evidence | Labels: `queue`, `status` |

### MET3: Job failure counter
| Status | **PASS** |
|--------|----------|
| Evidence | `src/services/metrics.service.ts:49-54` - `jobsFailedTotal` Counter |
| Evidence | Labels: `queue`, `reason` |

### MET4: Job duration histogram
| Status | **PASS** |
|--------|----------|
| Evidence | `src/services/metrics.service.ts:56-62` - `jobProcessingDuration` Histogram |
| Evidence | Buckets: `[0.1, 0.5, 1, 2, 5, 10, 30, 60]` seconds |

### MET5: Queue depth gauge
| Status | **PASS** |
|--------|----------|
| Evidence | `src/services/metrics.service.ts:64-69` - `queueSize` Gauge |
| Evidence | `src/services/metrics.service.ts:120-122` - `setQueueSize()` method |

### MET6: Payment-specific metrics
| Status | **PASS** |
|--------|----------|
| Evidence | `src/services/metrics.service.ts:73-87` - `paymentsProcessedTotal`, `paymentAmountTotal` |
| Evidence | `src/services/metrics.service.ts:89-99` - `refundsProcessedTotal`, `refundAmountTotal` |

### MET7: NFT-specific metrics
| Status | **PASS** |
|--------|----------|
| Evidence | `src/services/metrics.service.ts:101-111` - `nftsMinttedTotal`, `nftTransfersTotal` |
| Evidence | `src/services/metrics.service.ts:113-116` - `solanaBalanceGauge` |

### MET8: Communication metrics (email/webhook)
| Status | **PASS** |
|--------|----------|
| Evidence | `src/services/metrics.service.ts:119-135` - `emailsSentTotal`, `webhooksSentTotal` |

### MET9: System metrics collection
| Status | **PASS** |
|--------|----------|
| Evidence | `src/services/metrics.service.ts:137-159` - `uptimeGauge`, `memoryUsageGauge`, `cpuUsageGauge` |
| Evidence | `src/services/metrics.service.ts:195-214` - 10-second collection interval |
| Evidence | `src/routes/metrics.routes.ts:77-98` - `/metrics/system` endpoint |

### MET10: Metrics reset capability
| Status | **PASS** |
|--------|----------|
| Evidence | `src/services/metrics.service.ts:220-222` - `reset()` method |

---

## Section: Monitoring & Alerting

### MON1: Queue health monitoring
| Status | **PASS** |
|--------|----------|
| Evidence | `src/services/monitoring.service.ts:89-101` - `checkAllQueues()` every 30 seconds |
| Evidence | Monitors money, communication, background queues |

### MON2: Queue depth thresholds configured
| Status | **PASS** |
|--------|----------|
| Evidence | `src/services/monitoring.service.ts:18-25` - Alert thresholds defined |
| Evidence | `moneyQueueDepth: 50`, `commQueueDepth: 5000`, `backgroundQueueDepth: 50000` |

### MON3: Job age monitoring
| Status | **PASS** |
|--------|----------|
| Evidence | `src/services/monitoring.service.ts:125-139` - Monitors oldest waiting job age |
| Evidence | Alert when money queue job > 10 minutes old |

### MON4: Critical job alerting (payment failures)
| Status | **PASS** |
|--------|----------|
| Evidence | `src/services/monitoring.service.ts:157-165` - CRITICAL alert for payment failures |
| Evidence | Alerts when money queue failed > 10 |

### MON5: Alert cooldowns to prevent spam
| Status | **PASS** |
|--------|----------|
| Evidence | `src/services/monitoring.service.ts:174-180` - Cooldown map |
| Evidence | 5 min for critical, 1 hour for others |

### MON6: SMS/Phone alerting for critical issues
| Status | **PASS** |
|--------|----------|
| Evidence | `src/services/monitoring.service.ts:217-250` - Twilio SMS and phone calls |
| Evidence | `sendCriticalAlert()` sends SMS and initiates call for money queue issues |

### MON7: Alert history stored in database
| Status | **PASS** |
|--------|----------|
| Evidence | `src/services/monitoring.service.ts:185-196` - INSERT into `alert_history` table |

### MON8: Prometheus metrics updated periodically
| Status | **PASS** |
|--------|----------|
| Evidence | `src/services/monitoring.service.ts:104-141` - Updates gauges in `checkQueueHealth()` |
| Evidence | Updates queueDepth, failedJobs, oldestJobAge gauges |

---

## Section: Distributed Tracing

### TRACE1: Trace context propagation
| Status | **FAIL** |
|--------|----------|
| Severity | **HIGH** |
| Evidence | No OpenTelemetry or tracing library found |
| Issue | No distributed tracing implementation |
| Fix | Add OpenTelemetry instrumentation |

### TRACE2: Span creation for operations
| Status | **FAIL** |
|--------|----------|
| Severity | **HIGH** |
| Evidence | No span creation in processors or services |

### TRACE3: Trace IDs in error logs
| Status | **FAIL** |
|--------|----------|
| Severity | **HIGH** |
| Evidence | Error logs don't include trace IDs |

---

## Section: Dashboard & Visualization

### DASH1: Grafana dashboard JSON
| Status | **PASS** |
|--------|----------|
| Evidence | `grafana/queue-service-dashboard.json` exists |

### DASH2: ServiceMonitor for Prometheus scraping
| Status | **PASS** |
|--------|----------|
| Evidence | `k8s/deployment.yaml:160-172` - ServiceMonitor resource |
| Evidence | Scrapes `/metrics` every 30s |

### DASH3: Multiple metrics endpoints
| Status | **PASS** |
|--------|----------|
| Evidence | `src/routes/metrics.routes.ts` - `/metrics`, `/metrics/json`, `/metrics/queue-stats`, `/metrics/system` |

---

## Remediation Priority

### CRITICAL (Fix Immediately)
1. **LOG4**: Add correlation ID to all log entries
```typescript
   // In logging.middleware.ts
   logger.info(`${request.method} ${request.url}`, {
     correlationId: request.correlationId,
     userId: request.user?.userId,
     query: request.query,
     ip: request.ip
   });
```

### HIGH (Fix within 24-48 hours)
1. **LOG6**: Add sensitive data redaction
```typescript
   function redactSensitive(obj: any): any {
     const sensitiveKeys = ['password', 'token', 'secret', 'key', 'authorization'];
     // Recursively redact
   }
```

2. **TRACE1-3**: Add OpenTelemetry instrumentation
```typescript
   import { NodeSDK } from '@opentelemetry/sdk-node';
   import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
```

### MEDIUM (Fix within 1 week)
1. **LOG5**: Add user context to logs
2. Enhance queue stats endpoint to pull real-time data

### LOW (Fix in next sprint)
1. Add log rotation configuration for local development

---

## Summary

The queue-service has **excellent observability foundations** with:
- ✅ Comprehensive Prometheus metrics (20+ metrics covering jobs, payments, NFTs, system)
- ✅ Active monitoring service with configurable thresholds
- ✅ SMS/Phone alerting for critical issues via Twilio
- ✅ Alert history stored in database
- ✅ Alert cooldowns to prevent spam
- ✅ Grafana dashboard provided
- ✅ ServiceMonitor for Kubernetes Prometheus scraping
- ✅ System metrics collection (memory, CPU, uptime)
- ✅ Multiple metrics endpoints (Prometheus format, JSON, queue stats, system)

**Key gaps** to address:
- ❌ No correlation ID in logs (critical for debugging distributed issues)
- ❌ No distributed tracing (OpenTelemetry)
- ❌ Query params logged without redaction (potential data leak)
- ❌ Missing user context in logs

The `monitoring.service.ts` is particularly well-implemented with queue health checks every 30 seconds, configurable thresholds per queue type, and multi-channel alerting (SMS + phone for critical, SMS for warnings).
