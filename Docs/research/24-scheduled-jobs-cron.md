# Scheduled Job and Cron Best Practices
## Production Readiness Audit Guide for TicketToken

**Prepared for:** TicketToken Platform Audit  
**Stack:** Node.js, TypeScript, Fastify, PostgreSQL, Redis, 23 Microservices  
**Date:** December 2025

---

## Table of Contents

1. [Standards & Best Practices](#1-standards--best-practices)
2. [Common Vulnerabilities & Mistakes](#2-common-vulnerabilities--mistakes)
3. [Audit Checklist](#3-audit-checklist)

---

## 1. Standards & Best Practices

### 1.1 Distributed Cron (Preventing Duplicate Runs)

In multi-instance deployments like TicketToken's 23 microservices, scheduled jobs will execute on **every instance** simultaneously unless explicitly prevented.

**Industry Standard Approaches:**

1. **Leader Election with Locking**
   - Designate one instance as the "leader" to execute cron jobs
   - Backup instances stand ready for failover
   - Slack's distributed cron implementation uses this pattern with Kubernetes and Kafka
   - *Source: [The New Stack - How Slack Transformed Cron](https://thenewstack.io/how-slack-transformed-cron-into-a-distributed-job-scheduler/)*

2. **Distributed Locking (Recommended for Redis users)**
   - Acquire a lock before job execution; only the instance holding the lock runs the job
   - Redis-based Redlock algorithm is the industry standard
   - *Source: [Redis Distributed Locks Documentation](https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/)*

3. **External Scheduler Service**
   - Centralized scheduler microservice triggers jobs via HTTP/message queue
   - Job execution is separate from scheduling decisions
   - *Source: [Microservices Practitioner Articles](https://articles.microservices.com/designing-a-cron-scheduler-microservice-18a52471d13f)*

4. **Database-Backed Job Queues**
   - Libraries like Agenda (MongoDB) or Bull (Redis) handle distributed execution automatically
   - Built-in deduplication prevents multiple executions
   - *Source: [AppSignal Blog - Job Schedulers for Node](https://blog.appsignal.com/2023/09/06/job-schedulers-for-node-bull-or-agenda.html)*

**Recommendation for TicketToken:** Given your existing Redis infrastructure, use Redis-based distributed locking with the Redlock algorithm.

---

### 1.2 Job Locking Mechanisms

**Redlock Algorithm (Redis):**
The Redlock algorithm provides strong guarantees for distributed locks:

- **Safety Property:** Mutual exclusion - only one client can hold a lock at any time
- **Liveness Property A:** Deadlock-free - locks can always eventually be acquired
- **Liveness Property B:** Fault tolerant - works as long as majority of Redis nodes are up

*Source: [Redis Distributed Locks](https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/)*

**Node.js Implementation Options:**

| Library | Description | GitHub Stars |
|---------|-------------|--------------|
| `redlock` | Official Redlock implementation for Node.js | Most popular |
| `redislock` | Simpler single-instance locking | Lightweight |
| `ioredis` + custom | Build your own with Lua scripts | Full control |

*Source: [node-redlock on GitHub](https://github.com/mike-marcacci/node-redlock)*

**Lock Configuration Best Practices:**

```javascript
// Recommended lock settings
const lockConfig = {
  timeout: 30000,       // Lock TTL - must exceed max job duration
  retries: 3,           // Retry attempts if lock is held
  delay: 200,           // Delay between retries (ms)
  driftFactor: 0.01     // Clock drift compensation
};
```

**Critical Considerations:**

1. **Lock TTL must exceed maximum job duration** - If a job runs longer than the lock TTL, another instance may acquire the lock
2. **Implement lock extension** for long-running jobs - Renew the lock periodically during execution
3. **Always release locks in finally blocks** - Prevent orphaned locks on job failure
4. **Use unique lock identifiers** - UUID per lock acquisition prevents accidental release by other processes

*Source: [npm redlock documentation](https://www.npmjs.com/package/redlock)*

---

### 1.3 Monitoring Scheduled Jobs

**Heartbeat Monitoring Pattern:**

The industry standard is "dead man's switch" monitoring - jobs send HTTP pings to a monitoring service, which alerts if pings stop arriving.

*Source: [Healthchecks.io Documentation](https://healthchecks.io/docs/monitoring_cron_jobs/)*

**Key Monitoring Components:**

1. **Start/Complete Signals**
   - Send "start" ping when job begins
   - Send "complete" ping when job finishes
   - Enables tracking of job duration and detection of hung jobs

2. **Grace Period Configuration**
   - Set grace time slightly above expected job duration
   - Prevents false alerts for jobs running slightly late

3. **Failure Detection Types:**
   - **Missed schedule:** Job never started
   - **Timeout:** Job started but didn't complete
   - **Error exit:** Job completed with error status
   - **Duration regression:** Job taking longer than historical average

*Source: [Cronitor Job Monitoring](https://cronitor.io/docs/cron-job-monitoring)*

**Monitoring Services:**

| Service | Key Features |
|---------|--------------|
| Cronitor | Schedule-aware, integrations, SDKs |
| Healthchecks.io | Open-source, self-hostable |
| PagerDuty | Incident management integration |
| Uptime.com | Heartbeat + uptime monitoring |

**Self-Hosted Alternative:**

Healthchecks.io is available as open-source software for self-hosting.

*Source: [Healthchecks GitHub](https://github.com/healthchecks/healthchecks)*

---

### 1.4 Idempotent Scheduled Jobs

**Definition:** An idempotent job produces the same result whether run once or multiple times with the same input.

*Source: [Forter Tech Blog - Production Grade Scheduled Jobs](https://tech.forter.com/best-practices-for-production-grade-scheduled-jobs/)*

**Why Idempotency Matters:**

- Jobs may run twice due to lock failures, retries, or operator error
- Non-idempotent jobs cause duplicate data, double billing, or duplicate notifications
- Google SRE recommends idempotency as a core design principle for distributed cron

*Source: [Google SRE Book - Distributed Periodic Scheduling](https://sre.google/sre-book/distributed-periodic-scheduling/)*

**Implementation Strategies:**

1. **Unique Identifiers / Idempotency Keys**
   ```javascript
   // Track processed items with unique keys
   await db.query(`
     INSERT INTO processed_jobs (job_id, processed_at)
     VALUES ($1, NOW())
     ON CONFLICT (job_id) DO NOTHING
   `, [jobId]);
   ```

2. **Status Tracking**
   ```javascript
   // Check state before processing
   const order = await Order.findById(orderId);
   if (order.status === 'shipped') {
     return; // Already processed, skip
   }
   ```

3. **Upsert Operations**
   ```javascript
   // Use upserts instead of inserts
   await elasticsearch.index({
     id: documentId,  // Explicit ID prevents duplicates
     body: document
   });
   ```

*Source: [GitLab Sidekiq Idempotent Jobs](https://docs.gitlab.com/ee/development/sidekiq/idempotent_jobs.html)*

**TicketToken-Specific Considerations:**

| Job Type | Idempotency Strategy |
|----------|---------------------|
| NFT Minting | Check if NFT already exists for ticket |
| Royalty Payouts | Track payout status per sale ID |
| Email Notifications | Store sent notification IDs |
| Data Sync | Use upserts with deterministic IDs |

---

### 1.5 Timezone Handling

**Best Practice: Use UTC Everywhere**

- Store all timestamps in UTC
- Run all cron jobs based on UTC time
- Convert to local time only at display layer

*Source: [Google Cloud Scheduler Documentation](https://docs.cloud.google.com/scheduler/docs/configuring/cron-job-schedules)*

**Daylight Saving Time (DST) Considerations:**

| Scenario | Behavior |
|----------|----------|
| Spring Forward (2 AM → 3 AM) | Jobs scheduled for 2-3 AM may not run |
| Fall Back (2 AM → 1 AM) | Jobs scheduled for 1-2 AM may run twice |

*Source: [AWS EventBridge Scheduler - Schedule Types](https://docs.aws.amazon.com/scheduler/latest/UserGuide/schedule-types.html)*

**Recommendations:**

1. **Never schedule jobs during DST transition hours** (typically 1-3 AM local time)
2. **Use timezone-aware libraries:**
   - Node.js: `luxon`, `date-fns-tz`, or `node-schedule` with timezone support
3. **Document timezone assumptions** in job configurations
4. **Test DST transitions** before they occur

*Source: [Inventive HQ - Time Zones in Cron Jobs](https://inventivehq.com/blog/how-do-i-handle-time-zones-daylight-saving-time-cron)*

**Node.js Implementation:**

```javascript
// Explicit timezone handling
const schedule = require('node-schedule');
const { DateTime } = require('luxon');

// Schedule in specific timezone
const rule = new schedule.RecurrenceRule();
rule.hour = 9;
rule.minute = 0;
rule.tz = 'America/New_York';

schedule.scheduleJob(rule, function() {
  // Runs at 9 AM Eastern, handling DST automatically
});
```

---

### 1.6 Job Execution Logging

**Structured Logging Requirements:**

Every job execution should log:

1. **Job Start**
   ```json
   {
     "level": "info",
     "message": "Job started",
     "jobName": "royalty-payout",
     "executionId": "uuid-here",
     "scheduledTime": "2025-12-20T00:00:00Z",
     "actualStartTime": "2025-12-20T00:00:02Z",
     "instanceId": "service-1"
   }
   ```

2. **Job Completion**
   ```json
   {
     "level": "info",
     "message": "Job completed",
     "jobName": "royalty-payout",
     "executionId": "uuid-here",
     "duration": 1523,
     "itemsProcessed": 150,
     "status": "success"
   }
   ```

3. **Job Failure**
   ```json
   {
     "level": "error",
     "message": "Job failed",
     "jobName": "royalty-payout",
     "executionId": "uuid-here",
     "error": "Database connection timeout",
     "stack": "...",
     "itemsProcessedBeforeFailure": 45
   }
   ```

*Source: [MOSS - How to Monitor Cron Jobs](https://moss.sh/reviews/how-to-monitor-cron-jobs/)*

**Log Aggregation Best Practices:**

- Centralize logs from all 23 microservices
- Include correlation IDs across distributed operations
- Retain job logs for compliance/audit requirements
- Enable searchable job history (Elasticsearch integration)

---

## 2. Common Vulnerabilities & Mistakes

### 2.1 Jobs Running on Multiple Instances Simultaneously

**The Problem:**
In clustered environments, each instance runs its own cron scheduler, causing duplicate execution.

*Source: [Hashnode - Distributed Lock in Microservices](https://rsaw409.hashnode.dev/distributed-lock-in-microservices)*

**Symptoms:**
- Duplicate emails sent
- Double-charged payments
- Inconsistent data between instances
- NFTs minted multiple times for same ticket

**Solutions:**
- Implement distributed locking (see Section 1.2)
- Use leader election patterns
- Migrate to persistent job queues (Bull, Agenda)

---

### 2.2 No Monitoring for Failed Jobs

**The Problem:**
Jobs fail silently without anyone noticing, sometimes for days or weeks.

*Source: [DEV Community - How to Monitor Cron Jobs](https://dev.to/hexshift/how-to-monitor-cron-jobs-and-get-notified-on-failures-automatically-4loa)*

**Symptoms:**
- Backups not running
- Data not syncing
- Royalty payments missed
- Compliance violations

**Solutions:**
- Implement heartbeat monitoring
- Set up alerting for missed schedules
- Create job status dashboards
- Regular audit of job execution history

---

### 2.3 Jobs That Aren't Idempotent

**The Problem:**
Jobs assume exactly-once execution but receive at-least-once delivery.

*Source: [JobRunr - Idempotence in Java Job Scheduling](https://www.jobrunr.io/en/blog/idempotence-in-java-job-scheduling/)*

**Symptoms:**
- Duplicate records in database
- Users charged multiple times
- Duplicate NFTs minted
- Incorrect aggregations/reports

**TicketToken High-Risk Areas:**
- Payment processing and royalty distribution
- NFT minting operations
- Email/notification sending
- Blockchain transaction submission

---

### 2.4 Missing Error Handling

**The Problem:**
Unhandled exceptions crash jobs without proper logging or recovery.

*Source: [Medium - Node.js Advanced Patterns: Retry Logic](https://v-checha.medium.com/advanced-node-js-patterns-implementing-robust-retry-logic-656cf70f8ee9)*

**Anti-Patterns:**
```javascript
// BAD: Swallowing exceptions
try {
  await processJob();
} catch (e) {
  console.log(e);  // No alerting, no retry, no recovery
}

// BAD: No error handling at all
cron.schedule('0 * * * *', async () => {
  await riskyOperation();  // Uncaught exceptions kill the scheduler
});
```

**Best Practices:**
```javascript
// GOOD: Comprehensive error handling
cron.schedule('0 * * * *', async () => {
  const executionId = uuid();
  try {
    logger.info({ executionId, event: 'job_started' });
    await processJob();
    logger.info({ executionId, event: 'job_completed' });
    await heartbeat.complete();
  } catch (error) {
    logger.error({ executionId, error, event: 'job_failed' });
    await heartbeat.fail(error.message);
    await alerting.notify(error);
    throw error;  // Let scheduler know job failed
  }
});
```

---

### 2.5 No Alerting for Missed Schedules

**The Problem:**
Jobs that never start (crashed scheduler, misconfigured cron) go undetected.

*Source: [Cronitor Documentation](https://cronitor.io/docs/cron-job-monitoring)*

**Causes:**
- Scheduler process crashed
- Wrong cron expression
- Job disabled and forgotten
- Environment misconfiguration

**Solutions:**
- External heartbeat monitoring (Healthchecks.io, Cronitor)
- "Expected to run" tracking in monitoring system
- Daily job execution summary reports
- Automated alerts for jobs with no recent execution

---

### 2.6 Long-Running Jobs Without Heartbeat

**The Problem:**
Jobs that run for hours may appear hung when they're actually processing normally.

*Source: [Healthchecks.io Documentation](https://healthchecks.io/docs/)*

**Symptoms:**
- False alerts for "stuck" jobs
- Inability to distinguish hung jobs from slow jobs
- Lock expiration during execution

**Solutions:**
```javascript
// Implement periodic heartbeat during long jobs
async function longRunningJob() {
  const items = await getItemsToProcess();
  
  for (let i = 0; i < items.length; i++) {
    await processItem(items[i]);
    
    // Heartbeat every 100 items
    if (i % 100 === 0) {
      await heartbeat.ping();
      await lock.extend(30000);  // Extend lock
      logger.info({ progress: i, total: items.length });
    }
  }
}
```

---

## 3. Audit Checklist

### 3.1 Job Definition Checklist

For each scheduled job in TicketToken, verify:

#### Job Configuration

- [ ] **Job has unique identifier** - Each job has a distinct name/ID for tracking
- [ ] **Cron expression is documented** - Human-readable comment explaining schedule
- [ ] **Timezone is explicitly set** - Uses UTC or has documented timezone
- [ ] **Schedule avoids DST transition hours** - Not scheduled during 1-3 AM local time
- [ ] **Job purpose is documented** - Clear description of what job does and why

#### Execution Context

- [ ] **Timeout is configured** - Maximum execution time is set
- [ ] **Memory limits are set** - Container/process memory limits defined
- [ ] **Retry policy is defined** - Number of retries and backoff strategy documented
- [ ] **Dependencies are documented** - External services/databases required

### 3.2 Locking Verification Checklist

For Redis-based distributed locking:

#### Lock Implementation

- [ ] **Lock acquired before job execution** - Job does not run without lock
- [ ] **Lock key is unique per job type** - Different jobs use different lock keys
- [ ] **Lock TTL exceeds maximum job duration** - With buffer for safety
- [ ] **Lock is released in finally block** - Ensures release on success or failure
- [ ] **Lock extension implemented for long jobs** - Prevents premature lock expiration

#### Failure Scenarios

- [ ] **Job handles lock acquisition failure** - Graceful skip if lock held
- [ ] **Lock release failure is logged** - Alert on orphaned locks
- [ ] **Redis connection failure handled** - Job behavior defined when Redis unavailable

#### Code Review Points

```javascript
// Verify this pattern exists:
const lock = await redlock.acquire([`job:${jobName}`], ttl);
try {
  // Job logic here
} finally {
  await lock.release();
}
```

### 3.3 Monitoring Requirements Checklist

#### Heartbeat Monitoring

- [ ] **Each job sends start signal** - Ping sent when job begins
- [ ] **Each job sends completion signal** - Ping sent when job ends successfully
- [ ] **Failure signals are sent** - Explicit failure notification on error
- [ ] **Grace period is configured** - Matches expected job duration
- [ ] **Monitoring service is external** - Not dependent on same infrastructure

#### Alerting Configuration

- [ ] **Alerts configured for missed schedules** - Detect jobs that never start
- [ ] **Alerts configured for failures** - Detect jobs that start but fail
- [ ] **Alerts configured for duration regression** - Detect unusually slow jobs
- [ ] **Alert routing is correct** - Right team receives alerts
- [ ] **Escalation policy exists** - Alerts escalate if not acknowledged

#### Dashboard Requirements

- [ ] **Job execution history visible** - Last N executions with status
- [ ] **Duration trends tracked** - Historical performance data
- [ ] **Failure rates monitored** - Success/failure ratio over time
- [ ] **Cross-job correlation available** - View all jobs in system

### 3.4 Idempotency Verification Checklist

For each job, verify idempotent design:

#### State Management

- [ ] **Unique execution ID per run** - Used for deduplication
- [ ] **Pre-execution state check** - Verify item not already processed
- [ ] **Atomic state transitions** - Use database transactions
- [ ] **Upserts instead of inserts** - Where applicable

#### TicketToken-Specific Checks

| Job Type | Idempotency Check |
|----------|-------------------|
| NFT Minting | Check if NFT already exists for ticket before minting |
| Royalty Payout | Verify payout not already sent for transaction ID |
| Email Notifications | Check notification log before sending |
| Stripe Sync | Use Stripe idempotency keys for API calls |
| Elasticsearch Indexing | Use document IDs for upsert operations |

#### Testing

- [ ] **Double-run test** - Job can run twice without side effects
- [ ] **Crash recovery test** - Job handles restart mid-execution
- [ ] **Concurrent execution test** - Verify locking prevents duplicates

### 3.5 Error Handling Checklist

#### Exception Management

- [ ] **All jobs wrapped in try/catch** - No unhandled exceptions
- [ ] **Errors are logged with context** - Include execution ID, job name, stack trace
- [ ] **Errors trigger alerts** - Automatic notification on failure
- [ ] **Partial progress is tracked** - Know how much completed before failure

#### Retry Configuration

- [ ] **Retry count is configured** - Maximum attempts defined
- [ ] **Exponential backoff implemented** - Increasing delays between retries
- [ ] **Retryable vs non-retryable errors distinguished** - Don't retry permanent failures
- [ ] **Dead letter queue exists** - Failed jobs captured for manual review

#### Graceful Shutdown

- [ ] **SIGTERM handled** - Jobs complete current work before shutdown
- [ ] **In-progress jobs tracked** - State preserved for recovery
- [ ] **Lock cleanup on shutdown** - Release locks when process terminates

### 3.6 Node.js Specific Checklist

#### Scheduler Library

- [ ] **Using production-grade library** - Bull, Agenda, or BullMQ recommended
- [ ] **Library version is current** - No known security vulnerabilities
- [ ] **Persistence configured** - Jobs survive restarts (if using Bull/Agenda)

#### Memory Management

- [ ] **Large datasets streamed** - Not loaded entirely into memory
- [ ] **Memory usage monitored** - Alerts on excessive consumption
- [ ] **Garbage collection not blocked** - Long-running loops yield periodically

#### Process Isolation

- [ ] **Jobs run in separate workers** - Don't block main event loop
- [ ] **Worker threads for CPU-intensive jobs** - Prevent scheduler blocking
- [ ] **Child process timeout** - Kill hung worker processes

### 3.7 Multi-Instance Deployment Checklist

For TicketToken's 23 microservices:

#### Coordination

- [ ] **Single execution guaranteed** - Only one instance runs each job
- [ ] **No reliance on sticky sessions** - Jobs work regardless of routing
- [ ] **Instance ID tracked in logs** - Know which instance executed job

#### Failover

- [ ] **Leader election has failover** - Another instance takes over on failure
- [ ] **Lock timeout enables recovery** - Crashed instance doesn't block forever
- [ ] **Health checks detect stuck instances** - Kubernetes/orchestrator aware

#### Scaling

- [ ] **Job execution scales independently** - Can add workers without adding schedulers
- [ ] **Resource contention prevented** - Jobs don't compete for same resources
- [ ] **Database connection pooling configured** - Prevent pool exhaustion

---

## Quick Reference Card

### Critical Items for TicketToken

| Priority | Item | Risk if Missing |
|----------|------|-----------------|
| 🔴 P0 | Distributed locking | Duplicate NFT mints, double payments |
| 🔴 P0 | Idempotent payment jobs | Customer overcharges, compliance issues |
| 🟡 P1 | Heartbeat monitoring | Missed payouts undetected |
| 🟡 P1 | Error alerting | Silent failures in royalty distribution |
| 🟢 P2 | Structured logging | Difficult debugging and audit trail |
| 🟢 P2 | UTC timezone usage | Inconsistent execution times |

### Recommended Tools for Stack

| Purpose | Tool | Integration |
|---------|------|-------------|
| Job Queue | Bull or BullMQ | Redis (existing) |
| Distributed Lock | node-redlock | Redis (existing) |
| Monitoring | Healthchecks.io or Cronitor | HTTP webhooks |
| Logging | Pino or Winston | Elasticsearch (existing) |

---

## Sources & References

1. Redis Distributed Locks - https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/
2. Google SRE Book - Distributed Periodic Scheduling - https://sre.google/sre-book/distributed-periodic-scheduling/
3. Forter Tech Blog - Production Grade Scheduled Jobs - https://tech.forter.com/best-practices-for-production-grade-scheduled-jobs/
4. node-redlock - https://github.com/mike-marcacci/node-redlock
5. Healthchecks.io Documentation - https://healthchecks.io/docs/
6. Cronitor Job Monitoring - https://cronitor.io/docs/cron-job-monitoring
7. AWS EventBridge Scheduler - https://docs.aws.amazon.com/scheduler/latest/UserGuide/schedule-types.html
8. Google Cloud Scheduler - https://docs.cloud.google.com/scheduler/docs/configuring/cron-job-schedules
9. GitLab Sidekiq Idempotent Jobs - https://docs.gitlab.com/ee/development/sidekiq/idempotent_jobs.html
10. AppSignal Blog - Job Schedulers for Node - https://blog.appsignal.com/2023/09/06/job-schedulers-for-node-bull-or-agenda.html
11. LogRocket - Comparing Node.js Schedulers - https://blog.logrocket.com/comparing-best-node-js-schedulers/
12. The New Stack - Slack's Distributed Cron - https://thenewstack.io/how-slack-transformed-cron-into-a-distributed-job-scheduler/
13. Better Stack - Job Scheduling with Agenda - https://betterstack.com/community/guides/scaling-nodejs/node-scheduled-tasks/
14. npm retry package - https://www.npmjs.com/package/retry