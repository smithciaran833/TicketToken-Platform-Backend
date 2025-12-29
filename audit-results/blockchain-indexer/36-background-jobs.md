# Blockchain-Indexer Service - 36 Background Jobs Audit

**Service:** blockchain-indexer
**Document:** 36-background-jobs.md
**Date:** 2025-12-26
**Auditor:** Cline AI
**Pass Rate:** 72% (18/25 applicable checks)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 0 | - |
| HIGH | 2 | No job queue system, no overlapping execution protection |
| MEDIUM | 3 | In-flight jobs not tracked on shutdown, missing job priority, no dead letter handling |
| LOW | 2 | No job metrics beyond basic counts, limited job logging |

---

## Background Jobs Overview

| Job | Type | Interval | Purpose |
|-----|------|----------|---------|
| Transaction Polling | Interval | 5s | Poll for new blockchain transactions |
| Reconciliation | Interval | 5min (configurable) | Database vs blockchain consistency |
| Historical Sync | On-demand | N/A | Backfill historical data |
| Marketplace Polling | Interval | 30s | Backup for WebSocket subscriptions |

---

## Section 3.1: Transaction Polling Job (`indexer.ts`)

### TP1: Interval-based execution
**Status:** PASS
**Evidence:** `src/indexer.ts:54-58`
```typescript
async start(): Promise<void> {
  // ... WebSocket subscription
  
  setInterval(async () => {
    await this.pollRecentTransactions();
  }, 5000);
}
```

### TP2: Overlapping execution protection
**Status:** FAIL
**Evidence:** No mutex or flag to prevent overlapping polls.
```typescript
// Could have multiple pollRecentTransactions running simultaneously
setInterval(async () => {
  await this.pollRecentTransactions();  // No lock
}, 5000);
```
**Remediation:**
```typescript
private isPolling = false;

setInterval(async () => {
  if (this.isPolling) {
    logger.debug('Previous poll still running, skipping');
    return;
  }
  this.isPolling = true;
  try {
    await this.pollRecentTransactions();
  } finally {
    this.isPolling = false;
  }
}, 5000);
```

### TP3: State tracking
**Status:** PASS
**Evidence:** `src/indexer.ts:97-100` - Updates indexer_state table.
```typescript
await db.query(
  `UPDATE indexer_state SET last_processed_slot = $1, last_processed_signature = $2 WHERE id = 1`,
  [slot, signature]
);
```

### TP4: Error isolation
**Status:** PASS
**Evidence:** `src/indexer.ts:80-94`
```typescript
try {
  const tx = await this.connection.getParsedTransaction(signature, {...});
  await this.transactionProcessor.processTransaction(tx, signature, slot, blockTime);
} catch (error) {
  logger.error({ error, signature }, 'Failed to process transaction');
  // Error logged, continues to next transaction
}
```

### TP5: Graceful stop
**Status:** PASS
**Evidence:** `src/indexer.ts:109-123`
```typescript
async stop(): Promise<void> {
  logger.info('Stopping indexer');
  this.isRunning = false;
  
  if (this.subscription) {
    await this.connection.removeAccountChangeListener(this.subscription);
    this.subscription = null;
  }
  
  await db.query('UPDATE indexer_state SET is_running = false WHERE id = 1');
  logger.info('Indexer stopped');
}
```

---

## Section 3.2: Reconciliation Job (`reconciliationEngine.ts`)

### RC1: Configurable interval
**Status:** PASS
**Evidence:** `src/reconciliation/reconciliationEngine.ts:33-37`
```typescript
start(intervalMs: number = 300000): void {  // 5 min default
  logger.info({ intervalMs }, 'Starting reconciliation engine');
  this.intervalHandle = setInterval(async () => {
    await this.runReconciliation();
  }, intervalMs);
}
```

### RC2: Run tracking
**Status:** PASS
**Evidence:** `src/reconciliation/reconciliationEngine.ts:46-59`
```typescript
async runReconciliation(): Promise<ReconciliationResult> {
  const runId = await this.createRun();
  const startTime = Date.now();
  
  try {
    // ... reconciliation logic
    await this.completeRun(runId, results, Date.now() - startTime);
    return results;
  } catch (error) {
    await this.failRun(runId, (error as Error).message);
    throw error;
  }
}
```

### RC3: Run status recording
**Status:** PASS
**Evidence:** Database records for each run:
```typescript
// createRun - status: RUNNING
await db.query(`INSERT INTO reconciliation_runs (status, started_at) VALUES ('RUNNING', NOW())`);

// completeRun - status: COMPLETED
await db.query(`UPDATE reconciliation_runs SET status = 'COMPLETED', ...`);

// failRun - status: FAILED
await db.query(`UPDATE reconciliation_runs SET status = 'FAILED', error_message = $2`);
```

### RC4: Overlapping execution protection
**Status:** FAIL
**Evidence:** No mutex to prevent concurrent reconciliation runs.
```typescript
// Could have multiple runReconciliation running simultaneously
this.intervalHandle = setInterval(async () => {
  await this.runReconciliation();  // No lock
}, intervalMs);
```

### RC5: Batch processing
**Status:** PASS
**Evidence:** `src/reconciliation/reconciliationEngine.ts:78-87`
```typescript
private async getTicketsToReconcile(): Promise<TicketRow[]> {
  const result = await db.query(`
    SELECT id, token_id, owner_address, status, reconciled_at
    FROM tickets
    WHERE status IN ('MINTED', 'TRANSFERRED')
    ORDER BY reconciled_at ASC NULLS FIRST
    LIMIT 100
  `);
  return result.rows;
}
```

### RC6: Clean stop
**Status:** PASS
**Evidence:** `src/reconciliation/reconciliationEngine.ts:40-44`
```typescript
stop(): void {
  if (this.intervalHandle) {
    clearInterval(this.intervalHandle);
    this.intervalHandle = null;
  }
}
```
**Note:** In-flight reconciliation not awaited.

---

## Section 3.3: Historical Sync Job (`historicalSync.ts`)

### HS1: On-demand execution
**Status:** PASS
**Evidence:** `src/sync/historicalSync.ts:22-50`
```typescript
async syncRange(startSlot: number, endSlot: number): Promise<void> {
  logger.info({ startSlot, endSlot }, 'Starting historical sync');
  
  const totalSlots = endSlot - startSlot;
  let processedSlots = 0;
  
  // Process in batches
  for (let slot = startSlot; slot < endSlot; slot += this.batchSize) {
    // ...
  }
}
```

### HS2: Batch processing
**Status:** PASS
**Evidence:** `src/sync/historicalSync.ts:22-50`
```typescript
constructor(private connection: Connection, private transactionProcessor: TransactionProcessor) {
  this.batchSize = 1000;  // Slots per batch
  this.maxConcurrent = 5;  // Parallel batches
}
```

### HS3: Parallel processing with limits
**Status:** PASS
**Evidence:** `src/sync/historicalSync.ts:35-45`
```typescript
// Process batches concurrently with limit
const batchPromises: Promise<void>[] = [];
for (let i = 0; i < this.maxConcurrent && currentSlot < endSlot; i++) {
  batchPromises.push(this.processBatch(currentSlot, Math.min(currentSlot + this.batchSize, endSlot)));
  currentSlot += this.batchSize;
}
await Promise.allSettled(batchPromises);
```

### HS4: Progress tracking
**Status:** PASS
**Evidence:** `src/sync/historicalSync.ts:60-68`
```typescript
private async saveProgress(slot: number): Promise<void> {
  await db.query(
    'UPDATE indexer_state SET last_processed_slot = $1 WHERE id = 1',
    [slot]
  );
  logger.info({ slot }, 'Saved sync progress');
}
```

### HS5: Error resilience (Promise.allSettled)
**Status:** PASS
**Evidence:** Uses `Promise.allSettled` for batch processing.
```typescript
await Promise.allSettled(batchPromises);
// Failed batches don't stop other batches
```

---

## Section 3.4: Marketplace Polling (`marketplaceTracker.ts`)

### MP1: Backup polling
**Status:** PASS
**Evidence:** `src/processors/marketplaceTracker.ts:74-82`
```typescript
private startPolling(): void {
  this.pollingInterval = setInterval(async () => {
    for (const [key, marketplace] of Object.entries(this.marketplaces)) {
      await this.pollMarketplace(marketplace);
    }
  }, 30000);  // 30s
}
```

### MP2: Clean shutdown
**Status:** PASS
**Evidence:** `src/processors/marketplaceTracker.ts:69-71`
```typescript
if (this.pollingInterval) {
  clearInterval(this.pollingInterval);
}
```

---

## Section 3.5: Job Infrastructure Issues

### JI1: No job queue system
**Status:** FAIL
**Evidence:** Uses basic setInterval, not a proper job queue.
**Issue:** No BullMQ, Agenda, or similar job queue system.
**Impact:**
- No job persistence
- No job retries with backoff
- No job priority
- No distributed job execution
**Remediation:** Consider BullMQ:
```typescript
import { Queue, Worker } from 'bullmq';

const reconciliationQueue = new Queue('reconciliation');

// Add recurring job
await reconciliationQueue.add('reconcile', {}, {
  repeat: { every: 300000 }
});

// Worker with retries
const worker = new Worker('reconciliation', async job => {
  await reconciliationEngine.runReconciliation();
}, {
  connection: redis,
  concurrency: 1  // Prevent overlap
});
```

### JI2: No dead letter handling
**Status:** FAIL
**Evidence:** Failed jobs are logged but not queued for retry.
**Issue:** No mechanism to retry failed reconciliations or transactions.

### JI3: No job priority
**Status:** FAIL
**Evidence:** All jobs have equal priority.
**Issue:** High-priority reconciliations can't preempt lower-priority work.

### JI4: No distributed locking
**Status:** FAIL
**Evidence:** No Redis-based locking for multi-instance deployment.
**Issue:** Multiple service instances would run duplicate jobs.
**Remediation:**
```typescript
import { Redlock } from 'redlock';

const redlock = new Redlock([redis]);

async function runReconciliation() {
  const lock = await redlock.acquire(['reconciliation:lock'], 300000);
  try {
    // ... run reconciliation
  } finally {
    await lock.release();
  }
}
```

---

## Section 3.6: Job Observability

### JO1: Job start/complete logging
**Status:** PASS
**Evidence:** Reconciliation logs:
```typescript
logger.info({ runId }, 'Starting reconciliation run');
logger.info({ runId, duration, discrepancies }, 'Reconciliation completed');
```

### JO2: Job metrics
**Status:** PARTIAL
**Evidence:** Basic metrics exist but limited:
```typescript
// Counters exist
metricsCollector.recordReconciliation('COMPLETED');
metricsCollector.recordDiscrepancy('OWNERSHIP_MISMATCH');
```
**Missing:** Job queue depth, job latency histograms, jobs in progress gauge.

### JO3: Error tracking
**Status:** PASS
**Evidence:** Errors logged with context:
```typescript
logger.error({ error, runId }, 'Reconciliation failed');
```

---

## Section 3.7: Job Configuration

| Job | Configurable | Default | Environment Variable |
|-----|--------------|---------|---------------------|
| Polling | ❌ | 5s | - |
| Reconciliation | ✅ | 300000ms | RECONCILIATION_INTERVAL |
| Historical Sync | ✅ | 1000 slots | INDEXER_BATCH_SIZE |
| Marketplace Poll | ❌ | 30s | - |

---

## Remediation Priority

### HIGH (This Week)
1. **Add overlapping execution protection** - Mutex/flag for all interval jobs
```typescript
private isReconciling = false;

setInterval(async () => {
  if (this.isReconciling) return;
  this.isReconciling = true;
  try {
    await this.runReconciliation();
  } finally {
    this.isReconciling = false;
  }
}, intervalMs);
```

2. **Add distributed locking** - For multi-instance deployment
```typescript
const lock = await redis.set('reconciliation:lock', instanceId, 'NX', 'EX', 300);
if (!lock) {
  logger.debug('Another instance running reconciliation');
  return;
}
```

### MEDIUM (This Month)
1. **Evaluate job queue system** - BullMQ for persistence, retries, priority
2. **Add job-specific metrics** - Queue depth, latency, active jobs
3. **Make all intervals configurable** - Via environment variables

### LOW (Backlog)
1. **Add dead letter queue** - For failed jobs
2. **Add job history UI** - Dashboard for job monitoring
3. **Add job scheduling** - Cron-like scheduling for specific times

---

## Pass/Fail Summary by Section

| Section | Pass | Fail | Partial | N/A | Total |
|---------|------|------|---------|-----|-------|
| Transaction Polling | 4 | 1 | 0 | 0 | 5 |
| Reconciliation | 5 | 1 | 0 | 0 | 6 |
| Historical Sync | 5 | 0 | 0 | 0 | 5 |
| Marketplace Polling | 2 | 0 | 0 | 0 | 2 |
| Job Infrastructure | 0 | 4 | 0 | 0 | 4 |
| Job Observability | 2 | 0 | 1 | 0 | 3 |
| **Total** | **18** | **6** | **1** | **0** | **25** |

**Applicable Checks:** 25
**Pass Rate:** 72% (18/25 pass cleanly)
**Pass + Partial Rate:** 76% (19/25)

---

## Job Comparison Table

| Feature | Transaction Poll | Reconciliation | Historical Sync | Marketplace Poll |
|---------|-----------------|----------------|-----------------|------------------|
| Type | Interval | Interval | On-demand | Interval |
| Interval | 5s | 5min | N/A | 30s |
| Configurable | ❌ | ✅ | ✅ | ❌ |
| State Tracking | ✅ | ✅ | ✅ | ❌ |
| Overlap Protection | ❌ | ❌ | N/A | ❌ |
| Error Isolation | ✅ | ✅ | ✅ | ✅ |
| Clean Stop | ✅ | ⚠️ | ✅ | ✅ |
| Run History | ❌ | ✅ | ❌ | ❌ |

---

## Positive Findings

1. **Configurable reconciliation interval** - Via environment variable
2. **Run tracking for reconciliation** - Database records for each run
3. **Batch processing** - Historical sync uses parallel batches
4. **Progress persistence** - Indexer state saved to database
5. **Error isolation** - Individual transaction failures don't stop job
6. **Promise.allSettled** - Parallel processing continues on errors
7. **Graceful shutdown** - Interval handles cleared on stop
