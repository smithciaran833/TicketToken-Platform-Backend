# Message Queues and Background Job Processing
## Production Readiness Audit - Industry Standards & Best Practices

**Platform:** TicketToken Blockchain Ticketing SaaS  
**Technology Stack:** BullMQ, Redis, Node.js/Fastify  
**Document Version:** 1.0  
**Last Updated:** December 2024

---

## Table of Contents

1. [Standards & Best Practices](#1-standards--best-practices)
   - [Job Queue Patterns](#11-job-queue-patterns-bullmq-redis-based)
   - [Retry Strategies and Backoff](#12-retry-strategies-and-backoff)
   - [Dead Letter Queues](#13-dead-letter-queues)
   - [Job Prioritization](#14-job-prioritization)
   - [Idempotent Job Processing](#15-idempotent-job-processing)
   - [Job Monitoring and Observability](#16-job-monitoring-and-observability)
   - [Graceful Worker Shutdown](#17-graceful-worker-shutdown)
2. [Common Vulnerabilities & Mistakes](#2-common-vulnerabilities--mistakes)
3. [Audit Checklist](#3-audit-checklist)
4. [TicketToken-Specific Considerations](#4-tickettoken-specific-considerations)
5. [Sources](#5-sources)

---

## 1. Standards & Best Practices

### 1.1 Job Queue Patterns (BullMQ, Redis-based)

BullMQ is a robust, Redis-backed message queue for Node.js that provides reliable job processing with features including automatic retries, job prioritization, rate limiting, and parent-child job relationships.

#### Core Architecture

**Queue Structure:**
```typescript
import { Queue, Worker } from 'bullmq';

const connection = { host: 'localhost', port: 6379 };

// Create queue
const myQueue = new Queue('my-queue', { connection });

// Add job to queue
await myQueue.add('jobName', { data: 'payload' }, {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 }
});
```

**Worker Processing:**
```typescript
const worker = new Worker('my-queue', async (job) => {
  // Process job
  await job.updateProgress(50);
  return { result: 'success' };
}, { 
  connection,
  concurrency: 10 
});

worker.on('completed', (job, result) => {
  console.log(`Job ${job.id} completed`);
});

worker.on('failed', (job, error) => {
  console.error(`Job ${job.id} failed: ${error.message}`);
});
```

#### Job Lifecycle States

Jobs in BullMQ transition through defined states:

| State | Description |
|-------|-------------|
| `waiting` | Job is in queue, waiting to be processed |
| `delayed` | Job is waiting for a timeout or promotion |
| `active` | Job is currently being processed |
| `completed` | Job finished successfully |
| `failed` | Job threw an exception or exceeded retries |
| `stalled` | Worker didn't respond within lock duration |
| `prioritized` | Job has priority > 0 and awaits processing |

**Source:** https://docs.bullmq.io/guide/architecture

#### Key Configuration Options

| Option | Purpose | Recommended Value |
|--------|---------|-------------------|
| `concurrency` | Parallel jobs per worker | 5-50 (based on I/O vs CPU) |
| `lockDuration` | Time before job considered stalled | 30000ms (default) |
| `maxStalledCount` | Stalls before permanent failure | 1-3 |
| `removeOnComplete` | Auto-cleanup of completed jobs | `{ count: 1000, age: 86400 }` |
| `removeOnFail` | Retention of failed jobs | `{ count: 5000 }` (keep for debugging) |

**Source:** https://docs.bullmq.io/guide/queues

---

### 1.2 Retry Strategies and Backoff

BullMQ provides built-in retry mechanisms with configurable backoff strategies to handle transient failures gracefully.

#### Built-in Backoff Strategies

**Fixed Backoff:**
```typescript
await queue.add('job', data, {
  attempts: 5,
  backoff: {
    type: 'fixed',
    delay: 5000  // 5 seconds between each retry
  }
});
```

**Exponential Backoff:**
```typescript
await queue.add('job', data, {
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 1000  // 1s, 2s, 4s, 8s, 16s
  }
});
// Retry delays: 2^(attempt-1) * delay
// Attempt 3 with delay 3000ms = 2^2 * 3000 = 12000ms
```

**Exponential with Jitter:**
```typescript
await queue.add('job', data, {
  attempts: 8,
  backoff: {
    type: 'exponential',
    delay: 3000,
    jitter: 0.5  // Random variation 0-50%
  }
});
```

Jitter prevents thundering herd problems by randomizing retry delays across workers.

**Source:** https://docs.bullmq.io/guide/retrying-failing-jobs

#### Custom Backoff Strategies

```typescript
const worker = new Worker('queue', processor, {
  settings: {
    backoffStrategy: (attemptsMade: number, type: string, err: Error, job: Job) => {
      // Custom logic based on error type
      if (err.message.includes('rate limit')) {
        return 60000; // Wait 1 minute for rate limits
      }
      if (err.message.includes('connection')) {
        return Math.min(attemptsMade * 2000, 30000);
      }
      return attemptsMade * 1000; // Linear backoff
    }
  }
});
```

#### Unrecoverable Errors

Use `UnrecoverableError` to skip retries for permanent failures:

```typescript
import { Worker, UnrecoverableError } from 'bullmq';

const worker = new Worker('queue', async (job) => {
  if (job.data.userId === undefined) {
    throw new UnrecoverableError('Missing required userId');
  }
  // Process job...
});
```

**Source:** https://docs.bullmq.io/patterns/stop-retrying-jobs

#### Recommended Retry Configuration by Job Type

| Job Type | Attempts | Backoff Type | Initial Delay | Notes |
|----------|----------|--------------|---------------|-------|
| Email sending | 5 | Exponential | 1000ms | Email providers have rate limits |
| Payment processing | 3 | Exponential + jitter | 2000ms | Balance retry vs duplicate risk |
| NFT minting | 5-10 | Exponential | 5000ms | Blockchain congestion varies |
| API integrations | 5 | Exponential + jitter | 1000ms | Prevent thundering herd |
| Database operations | 3 | Fixed | 500ms | Transient connection issues |

---

### 1.3 Dead Letter Queues

A Dead Letter Queue (DLQ) captures jobs that have exhausted all retry attempts, enabling manual review, debugging, and potential reprocessing.

#### Implementation Pattern

BullMQ doesn't have a built-in DLQ, but the pattern is implemented using the `failed` event:

```typescript
const deadLetterQueue = new Queue('dead-letter-queue', { connection });

const worker = new Worker('main-queue', processor, { connection });

worker.on('failed', async (job, error) => {
  // Check if all retries exhausted
  if (job.attemptsMade >= job.opts.attempts) {
    // Move to dead letter queue
    await deadLetterQueue.add('failed-job', {
      originalQueue: 'main-queue',
      originalJobId: job.id,
      originalData: job.data,
      failedReason: error.message,
      stackTrace: error.stack,
      attemptsMade: job.attemptsMade,
      failedAt: new Date().toISOString()
    }, {
      removeOnComplete: false,
      removeOnFail: false
    });
    
    // Alert operations team
    await alertService.notify({
      type: 'JOB_DEAD_LETTERED',
      jobId: job.id,
      queue: 'main-queue',
      error: error.message
    });
  }
});
```

#### DLQ Best Practices

1. **Preserve Complete Context:** Store original job data, error details, stack trace, and metadata
2. **Never Auto-Delete:** Keep failed jobs indefinitely until manually reviewed
3. **Alert on Accumulation:** Monitor DLQ depth and alert when threshold exceeded
4. **Provide Replay Mechanism:** Build tooling to retry jobs from DLQ
5. **Categorize Failures:** Tag jobs by error type for pattern analysis

**Source:** https://dev.to/lirantal/how-to-process-scheduled-queue-jobs-in-nodejs-with-bullmq-and-redis-on-heroku-3dl7

---

### 1.4 Job Prioritization

BullMQ supports job prioritization where lower numbers indicate higher priority (Unix-style).

#### Priority Configuration

```typescript
// Priority range: 1 to 2,097,152
// Lower number = higher priority
// Jobs without priority get highest priority (processed first)

await queue.add('urgent', data, { priority: 1 });   // Highest
await queue.add('normal', data, { priority: 10 });  // Medium
await queue.add('low', data, { priority: 100 });    // Lowest

// Jobs with same priority processed in FIFO order
```

**Important:** Adding prioritized jobs has O(log n) complexity relative to the number of prioritized jobs in the queue.

**Source:** https://docs.bullmq.io/guide/jobs/prioritized

#### Dynamic Priority Changes

```typescript
const job = await Job.create(queue, 'task', data, { priority: 10 });

// Change priority after creation
await job.changePriority({ priority: 1 });

// Or use LIFO for same priority
await job.changePriority({ lifo: true });
```

#### Priority Recommendations for TicketToken

| Job Type | Priority | Rationale |
|----------|----------|-----------|
| Payment confirmations | 1 | Revenue-critical, user waiting |
| NFT minting | 2 | User-initiated, time-sensitive |
| Ticket transfers | 3 | User action, moderate urgency |
| Email notifications | 10 | Important but can tolerate delay |
| Analytics/reporting | 50 | Background, no user impact |
| Cleanup/maintenance | 100 | Lowest priority, off-peak |

---

### 1.5 Idempotent Job Processing

Idempotency ensures that processing the same job multiple times produces the same result as processing it once. This is critical because message brokers guarantee "at-least-once" delivery, not "exactly-once."

**Source:** https://microservices.io/patterns/communication-style/idempotent-consumer.html

#### Why Idempotency Matters

Jobs may be processed multiple times due to:
- Worker crashes after processing but before acknowledgment
- Network failures causing timeout and retry
- Stalled job detection triggering reprocessing
- Manual job retries from admin interface

**Source:** https://microservices.io/post/microservices/patterns/2020/10/16/idempotent-consumer.html

#### Idempotency Implementation Patterns

**Pattern 1: Idempotency Key with Database Check**

```typescript
const worker = new Worker('payments', async (job) => {
  const idempotencyKey = job.data.idempotencyKey || job.id;
  
  // Check if already processed
  const existing = await db.processedJobs.findOne({ 
    idempotencyKey 
  });
  
  if (existing) {
    return existing.result; // Return cached result
  }
  
  // Process job within transaction
  const result = await db.transaction(async (tx) => {
    // Record processing started
    await tx.processedJobs.insert({
      idempotencyKey,
      status: 'processing',
      startedAt: new Date()
    });
    
    // Perform actual work
    const paymentResult = await processPayment(job.data);
    
    // Update with result
    await tx.processedJobs.update(
      { idempotencyKey },
      { status: 'completed', result: paymentResult }
    );
    
    return paymentResult;
  });
  
  return result;
});
```

**Pattern 2: Natural Idempotency (State-Based)**

```typescript
// GOOD: Idempotent - sets absolute state
await db.users.update(
  { id: userId },
  { status: 'active', activatedAt: timestamp }
);

// BAD: Not idempotent - increments counter
await db.accounts.update(
  { id: accountId },
  { $inc: { balance: -amount } }
);
```

**Pattern 3: Outbox Pattern for External Calls**

```typescript
const worker = new Worker('notifications', async (job) => {
  const { notificationId, userId, message } = job.data;
  
  // Check if notification already sent
  const notification = await db.notifications.findOne({ id: notificationId });
  
  if (notification?.sentAt) {
    return { status: 'already_sent' };
  }
  
  // Mark as sending (within transaction)
  await db.notifications.update(
    { id: notificationId },
    { status: 'sending', attemptedAt: new Date() }
  );
  
  // Send via external service (with their idempotency key)
  await emailService.send({
    idempotencyKey: notificationId,
    to: userId,
    message
  });
  
  // Mark as sent
  await db.notifications.update(
    { id: notificationId },
    { status: 'sent', sentAt: new Date() }
  );
  
  return { status: 'sent' };
});
```

**Source:** https://particular.net/blog/what-does-idempotent-mean

#### Payment Idempotency (Stripe Pattern)

Stripe pioneered robust idempotency for payment APIs:

```typescript
// Generate idempotency key client-side
const idempotencyKey = `payment_${orderId}_${timestamp}`;

// Include in Stripe API call
const charge = await stripe.paymentIntents.create({
  amount: 2000,
  currency: 'usd',
  customer: customerId
}, {
  idempotencyKey: idempotencyKey
});

// Stripe stores result for 24 hours
// Subsequent calls with same key return cached result
```

**Source:** https://stripe.com/blog/idempotency

#### Idempotency Best Practices

1. **Use Unique Job IDs:** Generate deterministic IDs based on business context (e.g., `order_123_payment`)
2. **Check Before Processing:** Always verify if job was already processed
3. **Atomic State Transitions:** Use database transactions to combine check-and-process
4. **External Service Keys:** Pass idempotency keys to external APIs (Stripe, SendGrid, etc.)
5. **State-Based Over Delta:** Prefer "set status to X" over "increment by N"

---

### 1.6 Job Monitoring and Observability

Comprehensive monitoring is essential for production queue health.

#### BullMQ Built-in Metrics

```typescript
const worker = new Worker('queue', processor, {
  connection,
  metrics: {
    maxDataPoints: MetricsTime.TWO_WEEKS // ~120KB per queue
  }
});

// Query metrics
const queue = new Queue('queue', { connection });
const metrics = await queue.getMetrics('completed', 0, MetricsTime.ONE_WEEK);
// Returns: { data: number[], count: number, meta: {...} }
```

**Source:** https://docs.bullmq.io/guide/metrics

#### Key Metrics to Monitor

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| Queue depth (waiting) | Jobs waiting to be processed | > 1000 for > 5 min |
| Active jobs | Currently processing | > workers × concurrency |
| Failed jobs rate | Failures per minute | > 5% of throughput |
| Job processing time (p95) | 95th percentile duration | > 2× expected |
| Stalled jobs | Jobs that lost their lock | Any occurrence |
| Dead letter queue size | Permanently failed jobs | > 0 |
| Worker count | Active workers | < expected |
| Redis memory | Memory used by queues | > 80% of limit |
| Connection errors | Redis connectivity issues | Any occurrence |

#### Prometheus Metrics Exporter

```typescript
// Using bullmq-exporter pattern
import { Counter, Histogram, Gauge } from 'prom-client';

const jobCompletedCounter = new Counter({
  name: 'bullmq_jobs_completed_total',
  help: 'Total completed jobs',
  labelNames: ['queue', 'jobName']
});

const jobDurationHistogram = new Histogram({
  name: 'bullmq_job_duration_seconds',
  help: 'Job processing duration',
  labelNames: ['queue', 'jobName'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60]
});

const queueDepthGauge = new Gauge({
  name: 'bullmq_queue_depth',
  help: 'Current queue depth by status',
  labelNames: ['queue', 'status']
});

// Update on events
worker.on('completed', (job) => {
  jobCompletedCounter.inc({ queue: 'main', jobName: job.name });
  const duration = (Date.now() - job.processedOn) / 1000;
  jobDurationHistogram.observe({ queue: 'main', jobName: job.name }, duration);
});

// Periodic queue depth collection
setInterval(async () => {
  const counts = await queue.getJobCounts();
  for (const [status, count] of Object.entries(counts)) {
    queueDepthGauge.set({ queue: 'main', status }, count);
  }
}, 60000);
```

**Source:** https://github.com/ron96G/bullmq-exporter

#### Dashboard Tools

| Tool | Description | Cost |
|------|-------------|------|
| **Taskforce.sh** | Official BullMQ dashboard | Paid (free tier available) |
| **Bull Board** | Self-hosted UI, basic features | Free (open source) |
| **Upqueue.io** | Hosted monitoring with alerts | Paid |
| **Kuue** | Hosted BullMQ dashboard | Paid |
| **Custom + Grafana** | Full control, requires setup | Free (self-hosted) |

**Source:** https://taskforce.sh/, https://upqueue.io/

#### Alerting Rules

```yaml
# Prometheus alerting rules
groups:
  - name: bullmq
    rules:
      - alert: HighQueueDepth
        expr: bullmq_queue_depth{status="waiting"} > 1000
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Queue {{ $labels.queue }} has high backlog"
          
      - alert: StalledJobs
        expr: increase(bullmq_jobs_stalled_total[5m]) > 0
        labels:
          severity: critical
        annotations:
          summary: "Stalled jobs detected in {{ $labels.queue }}"
          
      - alert: HighFailureRate
        expr: rate(bullmq_jobs_failed_total[5m]) / rate(bullmq_jobs_completed_total[5m]) > 0.05
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "High failure rate in {{ $labels.queue }}"
          
      - alert: NoWorkers
        expr: bullmq_workers_active == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "No active workers for {{ $labels.queue }}"
```

---

### 1.7 Graceful Worker Shutdown

Proper shutdown handling prevents stalled jobs and data loss during deployments or restarts.

#### BullMQ Graceful Shutdown Pattern

```typescript
import { Worker } from 'bullmq';

const worker = new Worker('queue', processor, { connection });

// Graceful shutdown handler
const gracefulShutdown = async (signal: string) => {
  console.log(`Received ${signal}, starting graceful shutdown...`);
  
  // Stop accepting new jobs
  // Wait for current jobs to complete
  await worker.close();
  
  // Close other resources
  await connection.quit();
  
  console.log('Graceful shutdown completed');
  process.exit(0);
};

// Handle shutdown signals
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle unhandled errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
  // Don't exit - let graceful shutdown handle it
});

// Attach error handler to prevent crashes
worker.on('error', (error) => {
  console.error('Worker error:', error);
  // Log but don't crash
});
```

**Source:** https://docs.bullmq.io/guide/workers/graceful-shutdown

#### Kubernetes Considerations

```yaml
# Kubernetes deployment configuration
spec:
  terminationGracePeriodSeconds: 60  # Allow time for job completion
  containers:
    - name: worker
      lifecycle:
        preStop:
          exec:
            command: ["/bin/sh", "-c", "sleep 5"]  # Allow signal propagation
```

For Kubernetes deployments:
1. Set `terminationGracePeriodSeconds` longer than your longest job
2. Handle `SIGTERM` to stop accepting new jobs
3. Wait for in-progress jobs to complete
4. Use readiness probes that fail during shutdown

**Source:** https://blog.risingstack.com/graceful-shutdown-node-js-kubernetes/

#### Stalled Job Recovery

If workers crash without graceful shutdown:
- Jobs remain in "active" state without lock renewal
- BullMQ's stalled job checker runs periodically (default: 30 seconds)
- Stalled jobs are moved back to "waiting" or "failed" based on `maxStalledCount`

```typescript
const worker = new Worker('queue', processor, {
  connection,
  stalledInterval: 30000,    // Check every 30 seconds
  maxStalledCount: 1,        // Fail after 1 stall (strict)
  lockDuration: 30000        // Lock expires after 30 seconds
});
```

**Source:** https://docs.bullmq.io/guide/jobs/stalled

---

## 2. Common Vulnerabilities & Mistakes

### 2.1 Jobs That Aren't Idempotent

**Problem:** Processing the same job twice causes duplicate side effects.

**Symptoms:**
- Double charges to customers
- Duplicate emails sent
- Multiple NFTs minted for single request
- Incorrect inventory counts

**Examples:**

```typescript
// BAD: Not idempotent - will charge twice if retried
worker.process(async (job) => {
  await stripe.charges.create({
    amount: job.data.amount,
    customer: job.data.customerId
  });
});

// GOOD: Idempotent with idempotency key
worker.process(async (job) => {
  await stripe.charges.create({
    amount: job.data.amount,
    customer: job.data.customerId
  }, {
    idempotencyKey: `charge_${job.data.orderId}`
  });
});
```

**Prevention:**
- Use idempotency keys for all external API calls
- Check database for existing records before creating
- Use database transactions with unique constraints
- Prefer absolute state updates over incremental changes

---

### 2.2 No Dead Letter Queue

**Problem:** Failed jobs disappear or block retry indefinitely.

**Symptoms:**
- Jobs silently fail with no visibility
- Unable to analyze failure patterns
- No mechanism to replay failed jobs
- Critical operations lost forever

**Prevention:**

```typescript
// Implement DLQ pattern
worker.on('failed', async (job, error) => {
  if (job.attemptsMade >= job.opts.attempts) {
    await deadLetterQueue.add('failed', {
      originalJobId: job.id,
      originalData: job.data,
      error: error.message,
      stack: error.stack,
      queue: job.queueName,
      failedAt: new Date()
    });
    
    // Alert operations
    metrics.increment('jobs.dead_lettered');
    await alerting.critical('Job moved to DLQ', { jobId: job.id });
  }
});
```

---

### 2.3 Missing Job Timeout

**Problem:** Jobs run indefinitely, blocking workers and resources.

**Symptoms:**
- Workers stuck on hung jobs
- Queue backlog growing despite available workers
- Memory leaks from long-running processes
- Cascading failures as queues back up

**Prevention:**

```typescript
// Set explicit timeouts
await queue.add('api-call', data, {
  timeout: 30000  // 30 second timeout
});

// Worker-level timeout handling
const worker = new Worker('queue', async (job) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  
  try {
    await processWithSignal(job.data, controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}, {
  lockDuration: 30000  // Must be >= job timeout
});
```

---

### 2.4 Lost Jobs on Worker Crash

**Problem:** Jobs in progress are lost when workers crash unexpectedly.

**Symptoms:**
- Jobs disappear without completion or failure
- Stuck in "active" state indefinitely
- Work performed but not recorded
- Inconsistent state between systems

**Prevention:**

1. **Configure stalled job detection:**
```typescript
const worker = new Worker('queue', processor, {
  stalledInterval: 15000,   // Check frequently
  maxStalledCount: 2,       // Allow one retry
  lockDuration: 30000       // Lock timeout
});
```

2. **Implement checkpointing for long jobs:**
```typescript
async function processLongJob(job) {
  const steps = ['fetch', 'transform', 'load', 'notify'];
  const checkpoint = job.data.checkpoint || 0;
  
  for (let i = checkpoint; i < steps.length; i++) {
    await executeStep(steps[i], job.data);
    await job.updateData({ ...job.data, checkpoint: i + 1 });
    await job.updateProgress((i + 1) / steps.length * 100);
  }
}
```

**Source:** https://docs.bullmq.io/patterns/process-step-jobs

---

### 2.5 No Monitoring of Queue Depth

**Problem:** Queues silently back up until system fails.

**Symptoms:**
- User-facing delays without alerting
- Workers overwhelmed when finally noticed
- Stale jobs processed long after relevance
- SLA breaches without warning

**Prevention:**

```typescript
// Regular queue depth monitoring
setInterval(async () => {
  const counts = await queue.getJobCounts(
    'waiting', 'active', 'delayed', 'failed'
  );
  
  metrics.gauge('queue.waiting', counts.waiting);
  metrics.gauge('queue.active', counts.active);
  metrics.gauge('queue.delayed', counts.delayed);
  metrics.gauge('queue.failed', counts.failed);
  
  // Alert on thresholds
  if (counts.waiting > 1000) {
    await alerting.warning('High queue depth', { 
      queue: 'main',
      waiting: counts.waiting 
    });
  }
}, 30000);
```

---

### 2.6 Blocking Operations in Job Handlers

**Problem:** Synchronous/blocking code prevents lock renewal and causes stalls.

**Symptoms:**
- Jobs marked as stalled despite running
- High CPU usage with low throughput
- Inconsistent job durations
- Lock renewal failures

**Examples:**

```typescript
// BAD: CPU-intensive sync operation blocks event loop
worker.process(async (job) => {
  const result = heavyCryptoOperation(job.data);  // Blocks!
  return result;
});

// GOOD: Use sandboxed processor for CPU work
const worker = new Worker('queue', 
  path.join(__dirname, 'processor.js'),  // Separate process
  { concurrency: 4 }
);

// GOOD: Or break up work with setImmediate
async function processInChunks(data) {
  for (const chunk of chunks(data, 100)) {
    await new Promise(resolve => setImmediate(resolve));
    processChunk(chunk);
  }
}
```

**Source:** https://docs.bullmq.io/guide/workers/concurrency

---

## 3. Audit Checklist

### 3.1 Job Definition Checklist

#### General Job Configuration

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1 | Every job has explicit `attempts` configured | ☐ | |
| 2 | Every job has appropriate `backoff` strategy | ☐ | |
| 3 | Jobs have sensible `timeout` values | ☐ | |
| 4 | `removeOnComplete` configured (not unlimited) | ☐ | |
| 5 | `removeOnFail` preserves failures for debugging | ☐ | |
| 6 | Job priority set appropriately | ☐ | |
| 7 | Job IDs are deterministic when idempotency needed | ☐ | |
| 8 | Job data is JSON-serializable | ☐ | |
| 9 | Sensitive data encrypted or excluded from job payload | ☐ | |
| 10 | Job payload size is reasonable (< 100KB) | ☐ | |

#### Idempotency Verification

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 11 | Job handler checks for prior completion | ☐ | |
| 12 | External API calls include idempotency keys | ☐ | |
| 13 | Database operations use transactions | ☐ | |
| 14 | State changes are absolute, not incremental | ☐ | |
| 15 | Duplicate processing produces same result | ☐ | |

---

### 3.2 Worker Configuration Checklist

#### Core Worker Settings

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 16 | `concurrency` appropriate for workload type | ☐ | |
| 17 | `lockDuration` >= longest expected job time | ☐ | |
| 18 | `stalledInterval` configured | ☐ | |
| 19 | `maxStalledCount` set (1-3 recommended) | ☐ | |
| 20 | Error handler attached (`worker.on('error')`) | ☐ | |
| 21 | Failed handler attached for DLQ | ☐ | |
| 22 | Graceful shutdown on SIGTERM/SIGINT | ☐ | |
| 23 | Unhandled rejection handler installed | ☐ | |
| 24 | Worker auto-restarts on crash (PM2/systemd) | ☐ | |
| 25 | Connection retry strategy configured | ☐ | |

#### Resource Management

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 26 | Redis connection pooling configured | ☐ | |
| 27 | Memory limits appropriate | ☐ | |
| 28 | CPU-intensive work uses sandboxed processors | ☐ | |
| 29 | External connections have timeouts | ☐ | |
| 30 | Database connections released after use | ☐ | |

---

### 3.3 Monitoring & Alerting Checklist

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 31 | Queue depth (waiting jobs) monitored | ☐ | |
| 32 | Active job count monitored | ☐ | |
| 33 | Failed job rate monitored | ☐ | |
| 34 | Stalled job events tracked | ☐ | |
| 35 | Job processing duration tracked | ☐ | |
| 36 | Dead letter queue size monitored | ☐ | |
| 37 | Worker count/health monitored | ☐ | |
| 38 | Redis memory usage monitored | ☐ | |
| 39 | Alert on high queue depth | ☐ | |
| 40 | Alert on stalled jobs | ☐ | |
| 41 | Alert on high failure rate | ☐ | |
| 42 | Alert on no active workers | ☐ | |
| 43 | Alert on DLQ accumulation | ☐ | |
| 44 | Dashboard for queue visualization | ☐ | |
| 45 | Logs include job ID for tracing | ☐ | |

---

### 3.4 NFT Minting Jobs Checklist

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 46 | Idempotency key based on mint request ID | ☐ | |
| 47 | Check if NFT already minted before processing | ☐ | |
| 48 | Blockchain transaction nonce managed properly | ☐ | |
| 49 | Gas estimation with buffer included | ☐ | |
| 50 | Transaction timeout appropriate for network | ☐ | |
| 51 | Retry handles "nonce too low" errors | ☐ | |
| 52 | Failed mints don't leave orphaned records | ☐ | |
| 53 | Metadata upload to IPFS is idempotent | ☐ | |
| 54 | Wallet balance checked before minting | ☐ | |
| 55 | Priority set higher for user-initiated mints | ☐ | |
| 56 | Batch minting jobs are resumable | ☐ | |
| 57 | Gas price spikes handled gracefully | ☐ | |
| 58 | Network congestion triggers appropriate backoff | ☐ | |
| 59 | Mint confirmation waited before completion | ☐ | |
| 60 | Webhook/notification sent on mint success | ☐ | |

---

### 3.5 Email Jobs Checklist

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 61 | Idempotency key prevents duplicate sends | ☐ | |
| 62 | Email provider's idempotency used (if available) | ☐ | |
| 63 | Rate limiting respects provider limits | ☐ | |
| 64 | Bounce handling updates user records | ☐ | |
| 65 | Unsubscribe checked before sending | ☐ | |
| 66 | Template rendering errors caught | ☐ | |
| 67 | Large attachments handled separately | ☐ | |
| 68 | Email content logged (without sensitive data) | ☐ | |
| 69 | Retry backoff respects rate limits | ☐ | |
| 70 | Failed emails tracked for analysis | ☐ | |
| 71 | Priority appropriate (transactional vs marketing) | ☐ | |
| 72 | Timeout set for SMTP connections | ☐ | |

---

### 3.6 Payment Processing Jobs Checklist

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 73 | **Idempotency key always included in payment API calls** | ☐ | CRITICAL |
| 74 | Payment status checked before processing | ☐ | |
| 75 | Database record created before external call | ☐ | |
| 76 | Payment provider webhook reconciliation | ☐ | |
| 77 | Duplicate charge detection in place | ☐ | |
| 78 | Failed payments trigger customer notification | ☐ | |
| 79 | Refund jobs also idempotent | ☐ | |
| 80 | Currency and amount validation | ☐ | |
| 81 | Payment provider errors categorized (retry vs fatal) | ☐ | |
| 82 | Card decline doesn't retry indefinitely | ☐ | |
| 83 | Fraud check results respected | ☐ | |
| 84 | Payment tokens never logged | ☐ | |
| 85 | PCI compliance maintained in job data | ☐ | |
| 86 | Concurrent payment prevention per order | ☐ | |
| 87 | Settlement reconciliation jobs scheduled | ☐ | |

---

### 3.7 Redis Configuration Checklist

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 88 | `maxmemory-policy` set to `noeviction` | ☐ | CRITICAL |
| 89 | `maxmemory` configured appropriately | ☐ | |
| 90 | Persistence configured (RDB/AOF) | ☐ | |
| 91 | High availability setup (Sentinel/Cluster) | ☐ | |
| 92 | TLS encryption enabled | ☐ | |
| 93 | Authentication (AUTH/ACLs) configured | ☐ | |
| 94 | Connection limits appropriate | ☐ | |
| 95 | Backup schedule in place | ☐ | |

---

### 3.8 Infrastructure Checklist

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 96 | Workers run on separate processes/containers | ☐ | |
| 97 | Auto-scaling based on queue depth | ☐ | |
| 98 | Health checks configured | ☐ | |
| 99 | Log aggregation in place | ☐ | |
| 100 | Deployment doesn't kill active jobs | ☐ | |
| 101 | Rolling deployment strategy | ☐ | |
| 102 | Disaster recovery plan documented | ☐ | |

---

## 4. TicketToken-Specific Considerations

### 4.1 Critical Job Types

| Job Type | Priority | Idempotency Strategy | Retry Config |
|----------|----------|---------------------|--------------|
| Payment Processing | 1 | Stripe idempotency key | 3 attempts, exponential, jitter |
| NFT Minting | 2 | Mint request ID + blockchain check | 10 attempts, exponential (network variance) |
| Ticket Transfer | 3 | Transfer ID + ownership check | 5 attempts, exponential |
| QR Code Generation | 5 | Ticket ID check | 3 attempts, fixed 1s |
| Email Notifications | 10 | Notification ID in provider | 5 attempts, exponential |
| Analytics Events | 50 | Event ID deduplication | 3 attempts, fixed |
| Cleanup Jobs | 100 | Timestamp-based | 3 attempts, fixed |

### 4.2 Multi-Tenant Considerations

```typescript
// Tenant-specific queues prevent noisy neighbor issues
const getQueueForTenant = (tenantId: string, jobType: string) => {
  return new Queue(`tenant:${tenantId}:${jobType}`, { connection });
};

// Or use job grouping with BullMQ Pro
await queue.add('mint', data, {
  group: { id: tenantId }
});
```

### 4.3 Solana-Specific NFT Minting

```typescript
// Solana compressed NFT minting job pattern
const worker = new Worker('solana-mint', async (job) => {
  const { mintRequestId, metadata, recipient } = job.data;
  
  // 1. Check if already minted
  const existing = await db.mints.findOne({ requestId: mintRequestId });
  if (existing?.txSignature) {
    return { status: 'already_minted', signature: existing.txSignature };
  }
  
  // 2. Create/update mint record
  await db.mints.upsert({
    requestId: mintRequestId,
    status: 'processing',
    attemptedAt: new Date()
  });
  
  // 3. Mint with retry-safe nonce management
  const signature = await solanaService.mintCompressedNFT({
    metadata,
    recipient,
    idempotencyKey: mintRequestId
  });
  
  // 4. Wait for confirmation
  await solanaService.confirmTransaction(signature, 'finalized');
  
  // 5. Update record
  await db.mints.update(
    { requestId: mintRequestId },
    { status: 'confirmed', txSignature: signature, confirmedAt: new Date() }
  );
  
  return { status: 'minted', signature };
}, {
  concurrency: 5,
  limiter: { max: 10, duration: 1000 }  // Rate limit Solana RPC
});
```

### 4.4 Event Ticket Sales Queue Pattern

```typescript
// High-demand ticket sale with fair ordering
const saleQueue = new Queue('ticket-sale', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'fixed', delay: 500 },
    removeOnComplete: { count: 10000 }
  }
});

// Add purchase request (FIFO ordering critical)
await saleQueue.add('purchase', {
  eventId,
  userId,
  ticketTypeId,
  quantity,
  requestTime: Date.now()
}, {
  priority: 0,  // All same priority for FIFO
  jobId: `purchase_${eventId}_${userId}_${Date.now()}`  // Prevent duplicates
});

// Worker with inventory locking
const worker = new Worker('ticket-sale', async (job) => {
  const { eventId, userId, ticketTypeId, quantity } = job.data;
  
  // Distributed lock for inventory
  const lock = await redlock.acquire(
    [`ticket-inventory:${eventId}:${ticketTypeId}`],
    5000
  );
  
  try {
    // Check availability
    const available = await inventory.getAvailable(eventId, ticketTypeId);
    if (available < quantity) {
      throw new UnrecoverableError('Insufficient inventory');
    }
    
    // Reserve tickets atomically
    await inventory.reserve(eventId, ticketTypeId, quantity, userId);
    
    return { status: 'reserved', expiresAt: Date.now() + 600000 };
  } finally {
    await lock.release();
  }
}, {
  concurrency: 10,
  lockDuration: 10000
});
```

---

## 5. Sources

### Official Documentation
- BullMQ Documentation: https://docs.bullmq.io/
- BullMQ GitHub: https://github.com/taskforcesh/bullmq
- BullMQ Queues Guide: https://docs.bullmq.io/guide/queues
- BullMQ Architecture: https://docs.bullmq.io/guide/architecture
- BullMQ Retrying Jobs: https://docs.bullmq.io/guide/retrying-failing-jobs
- BullMQ Job Priority: https://docs.bullmq.io/guide/jobs/prioritized
- BullMQ Stalled Jobs: https://docs.bullmq.io/guide/jobs/stalled
- BullMQ Graceful Shutdown: https://docs.bullmq.io/guide/workers/graceful-shutdown
- BullMQ Production Guide: https://docs.bullmq.io/guide/going-to-production
- BullMQ Metrics: https://docs.bullmq.io/guide/metrics
- BullMQ Step Jobs Pattern: https://docs.bullmq.io/patterns/process-step-jobs
- BullMQ Stop Retrying: https://docs.bullmq.io/patterns/stop-retrying-jobs

### Idempotency & Message Patterns
- Microservices.io Idempotent Consumer: https://microservices.io/patterns/communication-style/idempotent-consumer.html
- Chris Richardson on Idempotent Consumer: https://microservices.io/post/microservices/patterns/2020/10/16/idempotent-consumer.html
- Stripe Idempotency Blog: https://stripe.com/blog/idempotency
- Implementing Stripe-like Idempotency Keys: https://brandur.org/idempotency-keys
- What Does Idempotent Mean: https://particular.net/blog/what-does-idempotent-mean
- Kafka Exactly-Once Semantics: https://www.confluent.io/blog/exactly-once-semantics-are-possible-heres-how-apache-kafka-does-it/
- Confluent Message Delivery Guarantees: https://docs.confluent.io/kafka/design/delivery-semantics.html

### Retry & Backoff Strategies
- BullMQ Retry Policies: https://dev.to/woovi/how-to-effectively-use-retry-policies-with-bulljsbullmq-45h9
- Custom Backoff Strategy: https://docs.bullmq.io/bull/patterns/custom-backoff-strategy

### Monitoring & Observability
- BullMQ Prometheus Exporter: https://github.com/ron96G/bullmq-exporter
- Bull Monitor: https://github.com/ejhayes/bull-monitor
- Taskforce.sh Dashboard: https://taskforce.sh/
- Upqueue.io: https://upqueue.io/
- AppSignal BullMQ Monitoring: https://www.appsignal.com/nodejs/bullmq-monitoring
- Grafana Dashboard Best Practices: https://grafana.com/docs/grafana/latest/dashboards/build-dashboards/best-practices/

### Graceful Shutdown & Production
- Node.js Graceful Shutdown: https://blog.risingstack.com/graceful-shutdown-node-js-kubernetes/
- BullMQ with Dragonfly: https://www.dragonflydb.io/blog/running-bullmq-with-dragonfly-part-3-cloud
- Better Stack BullMQ Guide: https://betterstack.com/community/guides/scaling-nodejs/bullmq-scheduled-tasks/

### Payment Processing
- Stripe Idempotency Implementation: https://newsletter.systemdesign.one/p/idempotent-api
- IEEE on Payment Idempotency: https://www.computer.org/publications/tech-news/trends/idempotency-in-payment-processing-architecture

### NFT & Blockchain
- thirdweb Nonce Management: https://thirdweb.com/learn/guides/how-to-manage-ethereum-nonces-with-thirdweb
- NFT Minting Errors: https://niftykit.com/blog/common-nft-minting-errors
- Ethereum NFT Minting Tutorial: https://ethereum.org/developers/tutorials/how-to-mint-an-nft/

### Job Queue Patterns
- Braze Job Queue Resiliency: https://www.braze.com/resources/articles/building-braze-job-queues-resiliency
- AWS SQS At-Least-Once: https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/standard-queues-at-least-once-delivery.html
- Bull Documentation: https://optimalbits.github.io/bull/

---

**Document Prepared For:** TicketToken Platform Production Readiness Audit  
**Total Checklist Items:** 102  
**Next Steps:** Apply checklist to each microservice using BullMQ job processing