# Order Service - 17 Queues & Background Jobs Audit

**Service:** order-service
**Document:** 17-queues-background-jobs.md
**Date:** 2024-12-24
**Auditor:** Cline
**Pass Rate:** 19% (10/52 applicable checks)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 4 | Stubbed metrics, No DLQ, Incomplete reconciliation, Message loss |
| HIGH | 4 | Lock TTL < timeout, No transactions, No idempotency, In-process jobs |
| MEDIUM | 2 | No stall detection, No job persistence |
| LOW | 0 | None |

---

## 3.1 Job Definition (5/15)

| Check | Status | Evidence |
|-------|--------|----------|
| Explicit attempts | PASS | retryOptions maxAttempts: 3 |
| Backoff strategy | PASS | backoffMultiplier: 2 |
| Timeout values | PASS | timeoutMs: 600000 default |
| removeOnComplete | FAIL | Not applicable - cron based |
| removeOnFail | FAIL | No job failure persistence |
| Job priority | FAIL | No priority system |
| Deterministic job IDs | FAIL | No persistent IDs |
| JSON-serializable data | PASS | Jobs fetch from DB |
| Sensitive data excluded | PASS | No sensitive payloads |
| Payload size | PASS | No payloads |
| Prior completion check | PARTIAL | Checks running, not processed |
| Idempotency keys | FAIL | No keys on external calls |
| Database transactions | FAIL | Separate statements |
| Absolute state changes | PASS | Sets absolute state |
| Duplicate safe | PARTIAL | Some safe, some not |

---

## 3.2 Worker Configuration (4/15)

| Check | Status | Evidence |
|-------|--------|----------|
| Concurrency control | FAIL | No concurrency control |
| lockDuration >= timeout | PASS | But lockTTL 5min < timeout 10min |
| stalledInterval | FAIL | Not implemented |
| maxStalledCount | FAIL | Not implemented |
| Error handler | PASS | uncaughtException handled |
| Failed handler DLQ | FAIL | No DLQ |
| Graceful shutdown | PASS | SIGTERM/SIGINT handlers |
| Unhandled rejection | PASS | Handler installed |
| Auto-restart | PARTIAL | Depends on orchestrator |
| Connection retry | PARTIAL | Lock retry only |
| Redis pooling | PARTIAL | Shared library |
| Memory limits | FAIL | Not configured |
| Sandboxed processors | FAIL | N/A - I/O bound |
| External timeouts | PARTIAL | Circuit breaker only |
| DB connections released | PARTIAL | Pool management |

---

## 3.3 Monitoring (0/15)

| Check | Status | Evidence |
|-------|--------|----------|
| Queue depth | FAIL | No queue system |
| Active job count | PARTIAL | getAllStatus() exists |
| Failed job rate | FAIL | jobMetricsService is STUB |
| Stalled jobs | FAIL | Not implemented |
| Processing duration | PARTIAL | Calculated but stub |
| DLQ size | FAIL | No DLQ |
| Worker health | FAIL | Not tracked |
| Redis memory | FAIL | Not implemented |
| Alert high queue | FAIL | No queue |
| Alert stalled | FAIL | jobAlertingService is STUB |
| Alert failures | FAIL | Stub |
| Alert no workers | FAIL | Not implemented |
| Alert DLQ | FAIL | No DLQ |
| Dashboard | FAIL | None |
| Logs with job ID | PARTIAL | Context but no execution ID |

**Critical: Stub Services**
```typescript
const jobMetricsService = {
  recordSkipped: async () => {},
  recordExecution: async () => {},
};
const jobAlertingService = {
  alertSlowExecution: async () => {},
  alertJobFailure: async () => {},
};
```

---

## 3.4-3.5 NFT/Email Jobs - N/A

Handled by minting-service and notification-service.

---

## 3.6 Payment Jobs (0/1 applicable)

| Check | Status | Evidence |
|-------|--------|----------|
| Reconciliation complete | PARTIAL | TODO at line 144: payment verification not implemented |

---

## 3.7 Redis Config - UNKNOWN

External configuration in shared library.

---

## 3.8 Infrastructure (1/6)

| Check | Status | Evidence |
|-------|--------|----------|
| Separate processes | FAIL | Jobs in same process as HTTP |
| Auto-scaling | FAIL | No queue system |
| Health checks | PARTIAL | Job health not included |
| Log aggregation | PASS | Structured logging |
| Deployment safe | PASS | gracefulShutdown waits |
| Rolling deployment | UNKNOWN | Infrastructure config |

---

## RabbitMQ Event Consumer Issues

| Issue | Status |
|-------|--------|
| Ack before complete | FAIL |
| Error to DLQ | FAIL |
| Consumer retry | FAIL |
| Idempotent handling | FAIL |

**Critical: Message Loss**
```typescript
} catch (error) {
  channel.nack(msg, false, false); // MESSAGE LOST FOREVER
}
```

---

## Critical Remediations

### P0: Implement Real Metrics
```typescript
import { Counter, Histogram } from 'prom-client';
export const jobExecutions = new Counter({
  name: 'job_executions_total',
  labelNames: ['job_name', 'status']
});
```

### P0: Add Dead Letter Queue
```typescript
async function moveToDLQ(job, error) {
  await redis.lpush('dlq:order-service', JSON.stringify({
    jobName: job.name,
    error: error.message,
    failedAt: new Date()
  }));
}
```

### P0: Fix RabbitMQ Retry
```typescript
if (retryCount < maxRetries) {
  channel.publish(exchange, routingKey, content, {
    headers: { 'x-retry-count': retryCount + 1 }
  });
} else {
  await moveToDLQ(msg, error);
}
channel.ack(msg);
```

### P1: Fix Lock TTL
```typescript
lockTTLMs: 900000, // 15 min > timeout 10 min
```

---

## Recommendations

1. Migrate to BullMQ for proper queue semantics
2. Replace stub services with Prometheus metrics
3. Add DLQ pattern for jobs and RabbitMQ
4. Separate worker processes from HTTP server
5. Complete reconciliation job implementation

Queues & Background Jobs Score: 19/100
