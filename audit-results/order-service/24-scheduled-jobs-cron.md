# Order Service - 24 Scheduled Jobs & Cron Audit

**Service:** order-service
**Document:** 24-scheduled-jobs-cron.md
**Date:** 2024-12-24
**Auditor:** Cline
**Pass Rate:** 24% (16/66 applicable checks)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 3 | Lock TTL < timeout, No external monitoring, No Redlock |
| HIGH | 3 | No job persistence, In-process jobs, No execution ID |
| MEDIUM | 3 | No instance ID, No lock extension, No DLQ |
| LOW | 0 | None |

---

## 3.1 Job Definition (4/9)

| Check | Status | Evidence |
|-------|--------|----------|
| Unique identifier | PASS | name: 'order-expiration' |
| Cron documented | PARTIAL | intervalSeconds with comment |
| Timezone set | FAIL | No timezone config |
| DST avoidance | PASS | Interval-based, not time-based |
| Purpose documented | PASS | JSDoc on all jobs |
| Timeout configured | PASS | timeoutMs: 180000 |
| Memory limits | FAIL | Container-level only |
| Retry policy | PASS | maxAttempts: 3, backoff |
| Dependencies documented | FAIL | No explicit docs |

---

## 3.2 Locking (5/8)

| Check | Status | Evidence |
|-------|--------|----------|
| Lock before execution | PASS | withLock() wrapper |
| Unique lock key | PASS | job:${config.name} |
| Lock TTL > job duration | FAIL | 5min lock < 10min timeout |
| Released in finally | PASS | distributed-lock.ts:53-62 |
| Lock extension | FAIL | No renewal mechanism |
| Acquisition failure handled | PASS | Retries 3x then throws |
| Release failure logged | PASS | logger.error on failure |
| Redis failure handled | PARTIAL | Catches after retries |

---

## 3.3 Monitoring (0/14)

| Check | Status | Evidence |
|-------|--------|----------|
| Start signal | FAIL | Logs only, no external ping |
| Completion signal | FAIL | No external monitoring |
| Failure signals | FAIL | alertJobFailure is STUB |
| Grace period | FAIL | No external monitoring |
| External service | FAIL | All internal stubs |
| Missed schedule alerts | FAIL | No detection |
| Failure alerts | FAIL | Stub function |
| Duration regression | PARTIAL | Logs warning, stub alert |
| Alert routing | FAIL | No alerting system |
| Escalation policy | FAIL | None |
| Execution history | FAIL | No persistence |
| Duration trends | FAIL | Stub metrics |
| Failure rates | FAIL | Returns hardcoded 0 |
| Cross-job correlation | PARTIAL | Current status only |

---

## 3.4 Idempotency (0/8 applicable)

| Check | Status | Evidence |
|-------|--------|----------|
| Unique execution ID | FAIL | No UUID per run |
| Pre-execution check | PARTIAL | State-based queries |
| Atomic transitions | FAIL | Separate INSERT statements |
| Upserts | FAIL | INSERT without ON CONFLICT |
| Stripe idempotency | FAIL | No Stripe calls or keys |
| Double-run test | UNKNOWN | No tests examined |
| Crash recovery test | PARTIAL | gracefulShutdown only |
| Concurrent test | PARTIAL | Lock prevents, no tests |

---

## 3.5 Error Handling (4/10)

| Check | Status | Evidence |
|-------|--------|----------|
| Try/catch wrapper | PASS | Full try/catch/finally |
| Errors logged with context | PASS | jobName, duration logged |
| Errors trigger alerts | FAIL | Stub function |
| Partial progress tracked | PARTIAL | Counts logged, not persisted |
| Retry count configured | PASS | maxAttempts: 3 |
| Exponential backoff | PASS | backoffMultiplier: 2 |
| Retryable distinguished | PARTIAL | shouldRetry available unused |
| Dead letter queue | FAIL | No DLQ |
| SIGTERM handled | PASS | process.on('SIGTERM') |
| In-progress tracked | PASS | runningExecution promise |
| Lock cleanup | PARTIAL | stop() but no explicit release |

---

## 3.6 Node.js Specific (0/8)

| Check | Status | Evidence |
|-------|--------|----------|
| Production library | FAIL | Custom setInterval |
| Persistence configured | FAIL | In-memory only |
| Large datasets streamed | PARTIAL | Batched not streamed |
| Memory monitored | FAIL | None |
| GC not blocked | PARTIAL | Async but no yielding |
| Separate workers | FAIL | Same process as HTTP |
| Worker threads | FAIL | None |
| Child process timeout | FAIL | No child processes |

---

## 3.7 Multi-Instance (3/9)

| Check | Status | Evidence |
|-------|--------|----------|
| Single execution | PASS | Redis SET NX lock |
| No sticky sessions | PASS | Any instance can run |
| Instance ID in logs | FAIL | No hostname/pod ID |
| Leader election failover | PARTIAL | Lock-based coordination |
| Lock timeout recovery | PASS | TTL prevents blocking |
| Health checks for stuck | FAIL | No job-aware health |
| Independent scaling | FAIL | Jobs embedded in service |
| Contention prevented | PARTIAL | Lock yes, connections shared |
| Connection pooling | PARTIAL | Shared library |

---

## Critical Remediations

### P0: Fix Lock TTL
```typescript
// job-executor.ts
lockTTLMs: 900000, // 15 min > 10 min timeout
```

### P0: External Monitoring
```typescript
// Integrate Healthchecks.io
await fetch(`https://hc-ping.com/${jobId}/start`);
try { await executeJob(); }
finally { await fetch(`https://hc-ping.com/${jobId}`); }
```

### P0: Use Redlock
```typescript
import Redlock from 'redlock';
const redlock = new Redlock([redis1, redis2, redis3]);
const lock = await redlock.acquire([`job:${name}`], ttl);
```

### P1: Migrate to BullMQ
```typescript
import { Queue, Worker } from 'bullmq';
const queue = new Queue('order-jobs', { connection: redis });
```

### P1: Separate Worker Process
```dockerfile
# docker-compose.yml
order-worker:
  command: npm run start:worker
```

---

## Recommendations

1. Fix lock TTL > job timeout immediately
2. Add external heartbeat monitoring (Healthchecks.io)
3. Migrate to BullMQ for persistence
4. Use Redlock for distributed safety
5. Run jobs in separate containers
6. Generate execution IDs for tracing

Scheduled Jobs Score: 24/100
