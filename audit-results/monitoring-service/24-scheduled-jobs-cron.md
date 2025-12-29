## Monitoring Service - Scheduled Jobs & Cron Audit Report

**Audit Date:** December 28, 2025  
**Service:** monitoring-service  
**Standard:** Docs/research/24-scheduled-jobs-cron.md

---

## 🟢 PASSING CHECKS

### ✅ node-cron Scheduler Present
**File:** `src/workers/index.ts:2`
```typescript
import cron from 'node-cron';
```

### ✅ Basic Error Handling Present
**File:** `src/workers/index.ts:9-14`
```typescript
cron.schedule('*/60 * * * * *', async () => {
  try {
    logger.debug('Running alert evaluation...');
  } catch (error) {
    logger.error('Alert evaluation error:', error);
  }
});
```

### ✅ Worker Classes with Start/Stop
**File:** `src/workers/alert-evaluation.worker.ts:23-43, 80-85`
```typescript
async start(): Promise<void> {
  logger.info('Starting Alert Evaluation Worker...');
}

async stop(): Promise<void> {
  if (this.interval) {
    clearInterval(this.interval);
    this.interval = null;
  }
  logger.info('Alert Evaluation Worker stopped');
}
```

### ✅ Cooldown Mechanism
**File:** `src/workers/alert-evaluation.worker.ts:65-78`
```typescript
private isInCooldown(ruleId: string, cooldownMinutes: number): boolean {
  const lastFired = this.cooldowns.get(ruleId);
  if (!lastFired) return false;
  
  const cooldownMs = cooldownMinutes * 60 * 1000;
  return (Date.now() - lastFired) < cooldownMs;
}
```

---

## 🔴 CRITICAL ISSUES

### No Distributed Locking
**Files:** `src/workers/index.ts`, `package.json`

**Issue:** NO distributed locking mechanism. In multi-instance deployment:
- Jobs run on EVERY instance simultaneously
- Duplicate alerts fired
- Duplicate cleanup operations
- Data inconsistencies

**Missing:**
```typescript
import Redlock from 'redlock';

const lock = await redlock.acquire(['job:alert-evaluation'], 60000);
try {
  await evaluateAlerts();
} finally {
  await lock.release();
}
```

### No Heartbeat Monitoring
**Issue:** No external heartbeat monitoring (Healthchecks.io, Cronitor).

**Impact:**
- Missed schedules go undetected
- Failed jobs not alerted
- No job execution history

### Jobs Not Idempotent
**Issue:** No idempotency checks. Re-running could:
- Fire duplicate alerts
- Process same metrics twice

---

## 🟠 HIGH SEVERITY ISSUES

### No Job Timeout
**File:** `src/workers/alert-evaluation.worker.ts:28-35`
```typescript
this.interval = setInterval(async () => {
  try {
    await this.evaluate();  // Could run forever
  } catch (error) {
    logger.error('Alert evaluation cycle failed:', error);
  }
}, 60000);
```

### No Execution ID Tracking
**Issue:** No unique execution ID per job run for tracing.

### No Job Overlap Prevention
**Issue:** If job takes longer than interval, next run starts anyway.

**Missing:**
```typescript
private isRunning = false;

async evaluate() {
  if (this.isRunning) {
    logger.warn('Alert evaluation already running, skipping');
    return;
  }
  this.isRunning = true;
  try {
    // ... evaluation logic
  } finally {
    this.isRunning = false;
  }
}
```

---

## 🟡 MEDIUM SEVERITY ISSUES

### No Timezone Configuration
**File:** `src/workers/index.ts:8`
```typescript
cron.schedule('*/60 * * * * *', async () => {
  // No timezone specified
});
```

**Should be:**
```typescript
cron.schedule('*/60 * * * * *', callback, {
  timezone: 'UTC'
});
```

### Stub Implementations
**File:** `src/workers/index.ts:10-12`
```typescript
try {
  logger.debug('Running alert evaluation...');
  // No actual work done!
}
```

### stopWorkers Doesn't Actually Stop Jobs
**File:** `src/workers/index.ts:37-39`
```typescript
export function stopWorkers() {
  logger.info('Stopping background workers...');
  // Doesn't actually stop cron jobs!
}
```

### No Retry Logic
**Issue:** Failed jobs don't retry with exponential backoff.

---

## Worker Files Summary

| File | Purpose | Status |
|------|---------|--------|
| index.ts | Cron scheduler | ⚠️ Stub implementations |
| alert-evaluation.worker.ts | Alert rule evaluation | ⚠️ No locking |
| cleanup.worker.ts | Data cleanup | ⚠️ No locking |
| metric-aggregation.worker.ts | Metrics aggregation | ⚠️ No locking |
| ml-analysis.worker.ts | ML analysis | ⚠️ No locking |
| report-generation.worker.ts | Report generation | ⚠️ No locking |

---

## Summary

| Severity | Count |
|----------|-------|
| 🔴 CRITICAL | 3 |
| 🟠 HIGH | 3 |
| 🟡 MEDIUM | 4 |
| ✅ PASS | 4 |

### Overall Scheduled Jobs Score: **25/100**

**Risk Level:** CRITICAL

**Warning:** In production with multiple instances, ALL jobs will run on EVERY instance simultaneously, causing duplicate alerts, duplicate cleanup, and data inconsistencies.

**Immediate Fix Required:** Add Redlock distributed locking before production deployment.
