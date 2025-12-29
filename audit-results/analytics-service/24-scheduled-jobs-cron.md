## Scheduled Jobs / Cron Audit: analytics-service

### Audit Against: `Docs/research/24-scheduled-jobs-cron.md`

---

## Scheduled Jobs Infrastructure

| Check | Status | Evidence |
|-------|--------|----------|
| Scheduler library used | ✅ PASS | `node-schedule` |
| Jobs defined | ⚠️ PARTIAL | RFM worker only, scheduler placeholder |
| Cron expressions used | ✅ PASS | `0 2 * * *` (2 AM daily) |
| Jobs started on service start | ✅ PASS | Called in `index.ts` |
| Overlap prevention | ✅ PASS | `isRunning` flag |

---

## Scheduled Jobs Defined

| Job | Schedule | Implemented? | Purpose |
|-----|----------|--------------|---------|
| RFM Calculator | Daily 2 AM | ✅ Yes | Customer RFM scoring |
| Hourly Aggregations | Hourly | ❌ No (placeholder) | Data aggregation |
| Daily Reports | Daily | ❌ No (placeholder) | Report generation |
| Data Cleanup | TBD | ❌ No (placeholder) | Data maintenance |
| ML Model Updates | TBD | ❌ No (placeholder) | Model training |
| Event Processors | TBD | ❌ No (placeholder) | Event handling |

**scheduler.ts (Placeholder Only):**
```typescript
export async function startScheduledJobs() {
  logger.info('Starting scheduled jobs...');
  // Placeholder - we'll implement the actual scheduled jobs later
  // - Hourly aggregations
  // - Daily reports
  // - Data cleanup
  // - ML model updates
  logger.info('Scheduled jobs started');
}
```

---

## RFM Calculator Worker (Well-Implemented)

| Check | Status | Evidence |
|-------|--------|----------|
| Job scheduling | ✅ PASS | `schedule.scheduleJob('0 2 * * *', ...)` |
| Overlap prevention | ✅ PASS | `isRunning` flag prevents concurrent runs |
| Startup run | ✅ PASS | Runs immediately on startup |
| Error handling per venue | ✅ PASS | Try/catch per venue |
| Logging | ✅ PASS | Start, progress, completion logged |
| Duration tracking | ✅ PASS | Logs execution time |
| Upsert pattern | ✅ PASS | `onConflict().merge()` |

**Well-Designed Overlap Prevention:**
```typescript
schedule.scheduleJob('0 2 * * *', async () => {
  if (this.isRunning) {
    logger.warn('RFM calculation already running, skipping...');
    return;  // ✅ Prevents overlapping runs
  }
  await this.calculateAllVenueRFM();
});
```

**Error Isolation:**
```typescript
for (const venue of venues) {
  try {
    await this.calculateVenueRFM(venue.id);
    logger.info(`✓ RFM calculated for venue: ${venue.name || venue.id}`);
  } catch (error) {
    logger.error(`✗ Failed to calculate RFM for venue ${venue.id}:`, error);
    // ✅ Continues to next venue instead of failing completely
  }
}
```

---

## Job Execution Issues

| Check | Status | Evidence |
|-------|--------|----------|
| Distributed locking | ❌ FAIL | **No Redis/DB locking - will run on all instances** |
| Job timeout | ❌ FAIL | **No timeout mechanism** |
| Retry mechanism | ❌ FAIL | **No retry on failure** |
| Progress checkpointing | ❌ FAIL | **No progress saved - restarts from beginning** |
| Dead letter queue | ❌ FAIL | **Failed jobs not tracked** |

**Critical: No Distributed Lock:**
```typescript
// ❌ CURRENT - Only in-memory flag
if (this.isRunning) {
  logger.warn('RFM calculation already running, skipping...');
  return;
}

// ✅ SHOULD USE distributed lock
const lockKey = 'lock:rfm-calculator';
const acquired = await redis.set(lockKey, hostname, 'NX', 'EX', 3600);
if (!acquired) {
  logger.warn('RFM calculation locked by another instance');
  return;
}
```

---

## Job Monitoring

| Check | Status | Evidence |
|-------|--------|----------|
| Job status logging | ✅ PASS | Start/complete/error logged |
| Execution duration | ✅ PASS | Duration tracked and logged |
| Success/failure metrics | ❌ FAIL | **No Prometheus metrics** |
| Alerting on failure | ❌ FAIL | **No alert integration** |
| Job history | ❌ FAIL | **No execution history stored** |

---

## Data Processing Quality

| Check | Status | Evidence |
|-------|--------|----------|
| Batch processing | ⚠️ PARTIAL | Processes customers one by one |
| Transaction safety | ❌ FAIL | **Individual inserts, not batched** |
| Memory efficiency | ⚠️ PARTIAL | Loads all customers into memory |
| Idempotent operations | ✅ PASS | Upsert pattern used |

**Issue: No Batch Processing:**
```typescript
// ❌ CURRENT - One customer at a time
for (const customer of customers) {
  await db('customer_rfm_scores')
    .insert({...})
    .onConflict(['customer_id', 'venue_id'])
    .merge();
}

// ✅ SHOULD batch inserts
const batch = customers.map(c => ({...}));
await db('customer_rfm_scores')
  .insert(batch)
  .onConflict(['customer_id', 'venue_id'])
  .merge();
```

---

## Job Configuration

| Check | Status | Evidence |
|-------|--------|----------|
| Schedule configurable | ❌ FAIL | **Hardcoded cron expression** |
| Job enabled flag | ❌ FAIL | **No disable mechanism** |
| Timezone specified | ❌ FAIL | **Uses server timezone** |
| Parameter configuration | ❌ FAIL | **Hardcoded thresholds** |

**Issue: Hardcoded Configuration:**
```typescript
// ❌ All these values are hardcoded
schedule.scheduleJob('0 2 * * *', async () => {...});  // Time

// RFM thresholds hardcoded
if (days <= 30) return 5;  // Recency
if (purchases >= 10) return 5;  // Frequency
```

---

## Summary

### Critical Issues (Must Fix)
| Issue | Location | Impact |
|-------|----------|--------|
| No distributed locking | `rfm-calculator.worker.ts` | **Duplicate processing in multi-instance deployments** |
| No job timeout | All workers | Jobs can run indefinitely |
| No retry mechanism | All workers | Failed jobs lost |
| Scheduler is placeholder | `scheduler.ts` | Most jobs not implemented |

### High Issues (Should Fix)
| Issue | Location | Impact |
|-------|----------|--------|
| No batch processing | RFM worker | Slow execution, many DB calls |
| No metrics/alerting | All workers | No observability |
| No job history | All workers | Cannot audit executions |
| Hardcoded schedules | All workers | Cannot adjust without deploy |
| No progress checkpointing | RFM worker | Restart loses progress |

### Compliance Score: 35% (8/23 checks passed)

- ✅ PASS: 8
- ⚠️ PARTIAL: 4
- ❌ FAIL: 11

### What's Working Well
| Feature | Evidence |
|---------|----------|
| Overlap prevention (in-memory) | `isRunning` flag |
| Error isolation | Continues on venue failure |
| Execution logging | Duration, progress tracked |
| Idempotent writes | Upsert pattern |
| Startup execution | Immediate data availability |

### Priority Fixes

1. **Add distributed locking:**
```typescript
import { getRedis } from '../config/redis';

async start() {
  schedule.scheduleJob('0 2 * * *', async () => {
    const redis = getRedis();
    const lockKey = 'lock:rfm-calculator';
    const lockValue = `${hostname}:${process.pid}`;
    
    const acquired = await redis.set(lockKey, lockValue, 'NX', 'EX', 7200);
    if (!acquired) {
      logger.warn('Job locked by another instance');
      return;
    }
    
    try {
      await this.calculateAllVenueRFM();
    } finally {
      await redis.del(lockKey);
    }
  });
}
```

2. **Add job timeout:**
```typescript
const timeout = setTimeout(() => {
  logger.error('Job timeout - force stopping');
  this.isRunning = false;
  // Send alert
}, 3600000); // 1 hour

try {
  await this.calculateAllVenueRFM();
} finally {
  clearTimeout(timeout);
}
```

3. **Implement remaining scheduled jobs** (aggregations, cleanup, reports)

4. **Add Prometheus metrics:**
```typescript
const jobDuration = new promClient.Histogram({
  name: 'analytics_job_duration_seconds',
  help: 'Duration of scheduled jobs',
  labelNames: ['job_name', 'status']
});
```

5. **Make schedules configurable:**
```typescript
const schedule = process.env.RFM_CRON || '0 2 * * *';
```
