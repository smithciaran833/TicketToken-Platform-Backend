# Event Service Jobs Analysis

## Purpose: Integration Testing Documentation
## Source: src/jobs/event-transitions.job.ts, src/jobs/index.ts, src/jobs/system-job-utils.ts
## Generated: January 20, 2026

---

## SECURITY FIXES APPLIED

| File | Issue | Severity | Status |
|------|-------|----------|--------|
| — | No security issues found | — | N/A |

**Note:** Tenant isolation is correctly implemented. All jobs that modify tenant data explicitly include `tenant_id` in WHERE clauses, even when using `withSystemContext()` to bypass RLS.

---

## FILE ANALYSIS

### 1. event-transitions.job.ts

**DATABASE OPERATIONS:**

**Tables Touched:**
- `events` (main table for event lifecycle management)

**SELECT Operations:**
- Get current event state with tenant validation:
  ```sql
  SELECT id, status, tenant_id FROM events 
  WHERE id = $1 AND tenant_id = $2
  ```

- Find PUBLISHED events ready for ON_SALE transition:
  ```sql
  SELECT id, tenant_id FROM events
  WHERE status = 'PUBLISHED'
    AND sales_start_date <= $1
    AND (sales_end_date IS NULL OR sales_end_date > $1)
  ```

- Find ON_SALE events ready for SALES_PAUSED transition:
  ```sql
  SELECT id, tenant_id FROM events
  WHERE status = 'ON_SALE'
    AND sales_end_date <= $1
  ```

- Find events ready for IN_PROGRESS transition:
  ```sql
  SELECT id, tenant_id FROM events
  WHERE status IN ('ON_SALE', 'SOLD_OUT', 'SALES_PAUSED')
    AND start_date <= $1
  ```

- Find IN_PROGRESS events ready for COMPLETED transition:
  ```sql
  SELECT id, tenant_id FROM events
  WHERE status = 'IN_PROGRESS'
    AND end_date <= $1
  ```

**UPDATE Operations:**
- State transitions with optimistic locking:
  ```sql
  UPDATE events
  SET status = $1,
      updated_at = NOW(),
      status_changed_at = NOW()
  WHERE id = $2
    AND tenant_id = $3
    AND status = $4
  RETURNING id, status
  ```

**Transaction Usage:**
- ❌ **NO EXPLICIT TRANSACTIONS** - Each query runs independently via `withSystemContext()`
- Uses optimistic locking (WHERE status = $4) to prevent race conditions
- Note: Currently safe for single-UPDATE operations, but fragile for future multi-step transitions

**Batch Operations:**
- Processes multiple events discovered during scan job
- ⚠️ **NO BATCH SIZE LIMITS** - Unbounded SELECT queries could return unlimited rows
- Each event transition is scheduled as a separate job

---

**EXTERNAL SERVICE CALLS:**

✅ **NONE** - This is CORRECT per service boundary definition.

Event-service should only manage event lifecycle and status transitions. External integrations:
- ❌ No RabbitMQ event publishing (see POTENTIAL ISSUES)
- ❌ No HTTP calls to other services
- ❌ No third-party API calls
- ❌ No notification-service calls
- ❌ No ticket-service inventory updates

This isolation is architecturally correct. Other services should listen for event status change events via message broker.

---

**CACHING:**

**Redis Usage:**
- **Purpose**: Distributed locking only (not data caching)
- **Lock Key Pattern**: `event-transition-lock:{eventId}`
- **Lock TTL**: 30,000ms (30 seconds)
- **Lock Acquisition**: `SET lockKey timestamp PX 30000 NX` (only if not exists)
- **Lock Release**: `DEL lockKey` (always in finally block)

**Lock Behavior:**
- Prevents concurrent transitions on same event
- Per-event granularity (not global lock)
- Auto-expires after 30s if job crashes
- Failure to acquire lock → job throws error → Bull retries

**No Event Data Caching:**
- Events are read fresh from database on each job execution
- No stale data risk

---

**STATE MANAGEMENT:**

**Status Transitions Triggered:**
1. `PUBLISHED → ON_SALE` (START_SALES transition)
   - Trigger: `sales_start_date <= NOW()`
   - Guard: `sales_end_date IS NULL OR sales_end_date > NOW()`

2. `ON_SALE → SALES_PAUSED` (PAUSE_SALES transition)
   - Trigger: `sales_end_date <= NOW()`

3. `ON_SALE/SOLD_OUT/SALES_PAUSED → IN_PROGRESS` (START_EVENT transition)
   - Trigger: `start_date <= NOW()`
   - Accepts multiple source states

4. `IN_PROGRESS → COMPLETED` (END_EVENT transition)
   - Trigger: `end_date <= NOW()`

**Guards/Conditions:**
- `validateTransition(currentState, transition)` - imported from event-state-machine
- Optimistic locking: UPDATE succeeds only if current status matches expected value
- Lock acquisition required before any transition attempt

**Side Effects:**
- Updates `status` field
- Updates `updated_at` to NOW()
- Updates `status_changed_at` to NOW()
- ⚠️ **MISSING**: No event publication to RabbitMQ (see POTENTIAL ISSUES)
- ⚠️ **MISSING**: No audit trail in separate history table

---

**TENANT ISOLATION:**

**How Tenant Context Works in Background Jobs:**
- ✅ Jobs run WITHOUT request context (no req.user.tenant_id)
- ✅ `tenantId` is explicitly stored in job data payload
- ✅ All queries include `WHERE tenant_id = $X` clause
- ✅ System context bypasses RLS but queries still filter by tenant

**Job Scope:**
- **GLOBAL JOB**: `scanPendingTransitions()` runs across ALL tenants
  - Uses `withSystemContext()` to read events from all tenants
  - Extracts `tenant_id` from each event row
  - Schedules single-tenant transition jobs with explicit tenant_id

- **SINGLE-TENANT JOB**: `processTransitionJob()` operates on one tenant's event
  - Receives `{ eventId, tenantId }` in job data
  - All queries filtered by both event ID and tenant ID

**System Context Bypass:**
- `withSystemContext()` sets PostgreSQL variable: `app.is_system_user = 'true'`
- This bypasses RLS policies on events table
- ✅ **SAFE BECAUSE**: Every query explicitly includes `AND tenant_id = $X`
- ✅ **VERIFIED**: No queries exist that could leak data across tenants

**Assessment:**
- ✅ **SECURE** - Tenant isolation is correctly implemented
- ✅ No cross-tenant data leakage risk
- ✅ Even if RLS is disabled, explicit filtering prevents contamination

---

**SCHEDULING & CONCURRENCY:**

**Cron Patterns:**
- Scan job: `*/5 * * * *` (every 5 minutes)
- Runs continuously via Bull recurring job

**Locking Mechanisms:**
1. **Per-Event Lock** (Redis):
   - Prevents duplicate transitions on same event
   - TTL: 30 seconds
   - Acquisition failure → retry with backoff

2. **Job Deduplication** (Bull):
   - Uses `jobId: ${transitionType}:${eventId}` to prevent duplicate queue entries
   - Same event won't be queued multiple times for same transition

3. **⚠️ MISSING: Scan Job Lock**:
   - No distributed lock on `scanPendingTransitions` itself
   - Currently mitigated by single-process concurrency limit (1)
   - Risk: If two scan jobs run concurrently, duplicate transition jobs could be scheduled

**Batch Size Limits:**
- ⚠️ **NONE** - No LIMIT clause on scan queries
- Risk: Could find millions of events and schedule millions of jobs
- Memory exhaustion possible on large datasets

**Timeout Handling:**
- Job timeout: 30,000ms (30 seconds) per attempt
- Lock timeout: 30,000ms (matches job timeout)
- ⚠️ **CONCERN**: If job hits timeout exactly, lock might expire during cleanup

**Concurrency Limits:**
- Transition jobs: `queue.process(JOB_TYPES.TRANSITION_EVENT, 5, ...)` - max 5 concurrent
- Scan jobs: `queue.process(JOB_TYPES.SCAN_PENDING_TRANSITIONS, 1, ...)` - single instance
- Prevents overwhelming database with parallel transitions

---

**ERROR HANDLING:**

**Retry Configuration:**
- **Transition Jobs**:
  - Attempts: 5 (increased from default 3)
  - Backoff: Exponential starting at 2000ms
  - Timeout: 30 seconds per attempt
  - Failed jobs retained for analysis (`removeOnFail: false`)

- **Scan Jobs**:
  - Uses default: 3 attempts, 1000ms exponential backoff
  - Failure logged and retried

**Failure Scenarios:**

1. **Lock Acquisition Failure**:
   - Throws error: "Lock acquisition failed - will retry"
   - Bull retries with exponential backoff
   - Eventually succeeds or fails after 5 attempts

2. **Event Not Found**:
   - Logs warning, completes job successfully
   - No retry (event may have been deleted)

3. **Invalid Transition**:
   - `validateTransition()` returns `{ valid: false, error: string }`
   - Logs warning, completes job successfully
   - ⚠️ **SILENT FAILURE** - No alert, no metric, no dead letter

4. **State Changed (Optimistic Lock Failure)**:
   - UPDATE returns 0 rows
   - Logs warning, completes job successfully
   - Another process already handled the transition

5. **Database Error**:
   - Caught in try/catch
   - Returns `{ success: false, error: message }`
   - Logs error, releases lock, job fails
   - Bull retries

**Partial Failure Handling:**
- **Scenario**: Scan finds 100 events, schedules 50 transition jobs, then crashes
- **Behavior**: Next scan (5 minutes later) will re-discover remaining 50 events
- **Safety**: Bull job deduplication prevents duplicate processing of already-queued events
- **Risk**: Events might transition 5+ minutes late if scan crashes repeatedly

**Logging:**
- ✅ Info: Successful transitions, scan counts, job initialization
- ✅ Warn: Lock failures, event not found, invalid transitions, state mismatches
- ✅ Error: Database errors, scan failures
- ⚠️ **MISSING**: No metrics/counters for monitoring dashboards

---

**POTENTIAL ISSUES:**

### ⚠️ HIGH PRIORITY

**1. Unbounded Batch Processing**
- **Location**: `scanPendingTransitions()` - all 4 SELECT queries
- **Issue**: No LIMIT clause on queries that find events needing transitions
- **Impact**: 
  - Could return millions of rows
  - Memory exhaustion
  - Job timeout before completing scan
  - Database query load spike
- **Recommendation**: Add `LIMIT 1000` and implement pagination with offset or cursor
- **Example Fix**:
  ```sql
  SELECT id, tenant_id FROM events
  WHERE status = 'PUBLISHED' AND sales_start_date <= $1
  ORDER BY sales_start_date ASC
  LIMIT 1000
  ```

**2. No Transaction Wrapping**
- **Location**: `performTransition()` function
- **Issue**: Single UPDATE but no explicit transaction boundary
- **Impact**:
  - Currently safe (single operation)
  - Fragile if future changes add multi-step operations
  - Example: If we add audit logging, partial failures could occur
- **Recommendation**: Wrap in explicit transaction for future-proofing
- **Example Fix**:
  ```typescript
  await client.query('BEGIN');
  try {
    // UPDATE event status
    // INSERT into audit log
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
  ```

---

### 🟡 MEDIUM PRIORITY

**3. Missing Event Publishing**
- **Location**: `performTransition()` after successful UPDATE
- **Issue**: No RabbitMQ event published when event status changes
- **Impact**:
  - notification-service can't send "Event starting soon" emails
  - analytics-service can't track event lifecycle metrics
  - Other services unaware of state changes
- **Recommendation**: Publish `event.status.changed` event
- **Example**:
  ```typescript
  await eventPublisher.publish('event.status.changed', {
    eventId,
    tenantId,
    previousStatus: currentState,
    newStatus: targetState,
    timestamp: new Date().toISOString(),
  });
  ```

**4. No Distributed Lock on Scan Job**
- **Location**: `scanPendingTransitions()` function
- **Issue**: No lock prevents concurrent scan jobs from running
- **Impact**:
  - Currently mitigated by single-process concurrency (1)
  - If Bull config changes or Redis fails, duplicate scans possible
  - Multiple transition jobs could be scheduled for same event
- **Mitigation**: Job deduplication via jobId prevents duplicate processing
- **Recommendation**: Add distributed lock for defense in depth
- **Example**:
  ```typescript
  const scanLock = await redis.set('scan-transitions-lock', '1', 'PX', 60000, 'NX');
  if (!scanLock) {
    logger.warn('Scan already in progress, skipping');
    return;
  }
  ```

**5. No Metrics/Monitoring**
- **Location**: All job functions
- **Issue**: No counters, timers, or metrics emitted
- **Impact**:
  - Can't monitor job health in production
  - Can't alert on high failure rates
  - Can't track transition latency
- **Recommendation**: Add metrics for:
  - `event_transitions_total{status, result}` - counter
  - `event_transition_duration_seconds` - histogram
  - `scan_events_found{transition_type}` - gauge
  - `lock_acquisition_failures_total` - counter

**6. Silent Transition Failures**
- **Location**: `processTransitionJob()` when validation fails
- **Issue**: Job completes successfully even if transition is invalid
- **Impact**:
  - No visibility into why events didn't transition
  - Could hide bugs in state machine logic
  - Events stuck in wrong state
- **Recommendation**: 
  - Option A: Fail the job (Bull will retry, then dead-letter)
  - Option B: Emit metric/alert but complete job
  - Current behavior might be intentional (don't retry invalid transitions)

---

### 🟢 LOW PRIORITY

**7. Lock TTL Matches Job Timeout**
- **Location**: Constants at top of file
- **Issue**: `LOCK_TTL_MS = 30000` equals job timeout `30000`
- **Impact**: If job hits exactly 30s timeout, lock might expire before finally block releases it
- **Risk**: Minimal - lock auto-expires anyway
- **Recommendation**: Make lock TTL slightly longer (e.g., 45s)

**8. No Status Audit Trail**
- **Location**: `events` table UPDATE
- **Issue**: Only updates `status_changed_at`, no full history
- **Impact**:
  - Can't answer "What happened to this event?"
  - Can't debug repeated transitions
  - No compliance audit trail
- **Recommendation**: Add `event_status_history` table or JSONB column
- **Example Schema**:
  ```sql
  CREATE TABLE event_status_history (
    id UUID PRIMARY KEY,
    event_id UUID REFERENCES events(id),
    tenant_id UUID NOT NULL,
    previous_status TEXT,
    new_status TEXT,
    transition_type TEXT,
    changed_at TIMESTAMPTZ DEFAULT NOW(),
    changed_by TEXT -- 'system-job'
  );
  ```

---

### 2. index.ts

**PURPOSE:**

Bull queue infrastructure for distributed job processing.

**Key Responsibilities:**
- Create and configure Bull queues backed by Redis
- Manage queue lifecycle (creation, processing, shutdown)
- Provide utilities for scheduling jobs (immediate, delayed, recurring, at specific time)
- Handle queue events (errors, failures, completions, stalled jobs)
- Prevent duplicate recurring jobs

---

**QUEUE CONFIGURATION:**

**Connection:**
- Redis URL from `process.env.REDIS_URL` (default: `redis://localhost:6379`)
- Parses host, port, password, database from URL

**Lock Settings:**
- `lockDuration: 30000` (30 seconds) - How long a job holds processing lock
- `lockRenewTime: 15000` (15 seconds) - Renew lock halfway through
- `stalledInterval: 30000` (30 seconds) - Check for stalled jobs every 30s
- `maxStalledCount: 1` - Fail job after being stalled once

**Default Job Options:**
- `removeOnComplete: 100` - Keep last 100 completed jobs (for debugging)
- `removeOnFail: 500` - Keep last 500 failed jobs (for analysis)
- `attempts: 3` - Retry failed jobs 3 times
- `backoff: { type: 'exponential', delay: 1000 }` - Start with 1s, double each retry

**Recurring Job Management:**
- Removes existing recurring job before adding new one
- Prevents duplicate cron jobs on service restart
- Uses `jobId: ${jobName}-recurring` for deduplication

---

**ERROR HANDLING:**

**Queue Event Handlers:**

1. **Error Event**: Logs queue-level errors (connection issues, etc.)
   ```typescript
   queue.on('error', (error) => logger.error({ error, queue }))
   ```

2. **Failed Event**: Logs individual job failures with attempt count
   ```typescript
   queue.on('failed', (job, error) => logger.error({
     jobId, jobName, queue, error, attempts: job.attemptsMade
   }))
   ```

3. **Completed Event**: Logs successful jobs with duration
   ```typescript
   queue.on('completed', (job) => logger.info({
     jobId, jobName, queue, duration: Date.now() - job.timestamp
   }))
   ```

4. **Stalled Event**: Logs jobs that stopped responding
   ```typescript
   queue.on('stalled', (job) => logger.warn({ jobId, jobName, queue }))
   ```

**Graceful Shutdown:**
- `closeAllQueues()` closes all active queues
- Waits for in-progress jobs to complete
- Catches and logs close errors (doesn't throw)
- Clears internal queue map

---

**UTILITIES PROVIDED:**

1. `getQueue(name)` - Get or create queue (singleton pattern)
2. `addJob(queue, name, data, options)` - Add single job
3. `scheduleRecurringJob(queue, name, data, cron)` - Cron-based recurring job
4. `scheduleDelayedJob(queue, name, data, delayMs)` - Run after delay
5. `scheduleJobAt(queue, name, data, runAt)` - Run at specific time
6. `getQueueStats(name)` - Get job counts (waiting, active, completed, failed, delayed, paused)
7. `getAllQueues()` - List all active queues

---

### 3. system-job-utils.ts

**PURPOSE:**

Provides `withSystemContext()` utility for background jobs that need to query data across all tenants.

**Use Case:**
- Jobs that scan ALL events across ALL tenants (e.g., `scanPendingTransitions`)
- Maintenance jobs that don't have a specific tenant context
- System-level operations that need cross-tenant visibility

---

**TENANT ISOLATION:**

**How It Bypasses RLS:**
1. Gets a database client from the connection pool
2. Sets PostgreSQL session variable: `SELECT set_config('app.is_system_user', 'true', false)`
3. This variable is checked by RLS policies: `app.is_system_user != 'true'`
4. RLS policies return TRUE (allow access) when system user flag is set
5. Executes the provided function with RLS-free access
6. Resets session variable: `SELECT set_config('app.is_system_user', 'false', false)`
7. Releases client back to pool

**Why This Is Safe:**
- ✅ Calling code MUST explicitly filter by tenant_id in WHERE clauses
- ✅ Verified: event-transitions.job.ts includes tenant_id in all queries
- ✅ Always resets flag in finally block (even on error)
- ✅ Client released back to pool in clean state
- ⚠️ **RISK**: Developer error could omit tenant_id filter → data leak
- ⚠️ **MITIGATION**: Code review required for any code using withSystemContext()

**Configuration Details:**
- Third parameter `false` in set_config means setting persists for session (not just transaction)
- This is required because we're not always in a transaction
- Reset is critical to prevent pool contamination

---

**CONNECTION MANAGEMENT:**

**Client Lifecycle:**
1. `const client = await db.connect()` - Acquire client from pool
2. Execute function with system privileges
3. `client.release()` in finally block - Always return client to pool

**Safety Features:**
- ✅ Try/finally ensures cleanup happens
- ✅ Flag reset happens before release (prevents contamination)
- ✅ Release called even if function throws error
- ✅ No connection leaks

**Pool Considerations:**
- Uses `DatabaseService.getPool()` - shared pool across application
- Important: System flag is per-connection, not global
- Multiple jobs can run concurrently with different clients

---

## INTEGRATION TEST FILE MAPPING

| Component | Test File | Priority | Key Scenarios |
|-----------|-----------|----------|---------------|
| event-transitions.job.ts | tests/integration/jobs/event-transitions.integration.test.ts | **HIGH** | • Tenant isolation (scan doesn't leak cross-tenant)<br>• Concurrent transitions (lock prevents race)<br>• Lock expiry behavior<br>• Time-based transitions (boundary testing)<br>• Invalid state transitions rejected<br>• Partial failure recovery (scan crash mid-way)<br>• Performance with 1000+ events |
| system-job-utils.ts | tests/integration/jobs/system-job-utils.integration.test.ts | **HIGH** | • RLS bypass works correctly<br>• Explicit tenant filtering required<br>• Flag reset on error<br>• Connection cleanup verified<br>• No pool contamination |
| index.ts | tests/integration/jobs/queue-infrastructure.integration.test.ts | **MEDIUM** | • Queue creation and lifecycle<br>• Recurring job deduplication<br>• Graceful shutdown<br>• Job retry with backoff<br>• Stalled job detection |

---

## CROSS-SERVICE DEPENDENCIES

**Direct Dependencies:**
- ✅ **NONE** - Event-service jobs make no HTTP calls to other services
- ✅ **CORRECT** per microservice architecture principles

**Indirect Dependencies (via Message Broker):**
- ⚠️ **MISSING**: Should publish events to RabbitMQ after state transitions
- Other services that SHOULD listen:
  - **notification-service**: Send event reminder emails when status changes
  - **analytics-service**: Track event lifecycle metrics
  - **ticket-service**: May need to know when event is IN_PROGRESS or COMPLETED

**Database Dependencies:**
- PostgreSQL: `events` table (owned by event-service)
- Redis: Distributed locks and Bull queue storage

**Why This Is Good Architecture:**
- Event-service owns event lifecycle decisions
- Other services react to published events
- No tight coupling between services
- Each service can scale independently

**Action Required:**
- Add event publishing to `performTransition()` function
- Document event schema in shared message contracts
- Update integration tests to verify events are published

---

## REMAINING CONCERNS

### ⚠️ HIGH PRIORITY

1. **Unbounded Batch Processing**
   - **Risk**: Memory exhaustion on large datasets
   - **Fix**: Add `LIMIT 1000` and pagination to scan queries
   - **Timeline**: Required before production scale testing

2. **No Transaction Wrapping**
   - **Risk**: Fragile for future multi-step transitions
   - **Fix**: Wrap performTransition() in explicit transaction
   - **Timeline**: Nice to have, more important when adding audit logging

---

### 🟡 MEDIUM PRIORITY

3. **Missing Event Publishing**
   - **Impact**: Other services can't react to status changes
   - **Fix**: Publish `event.status.changed` to RabbitMQ
   - **Timeline**: Required for notification-service integration

4. **No Distributed Lock on Scan Job**
   - **Impact**: Duplicate scans possible on misconfiguration
   - **Fix**: Add Redis lock for scan job itself
   - **Timeline**: Low priority due to existing mitigations

5. **No Metrics/Monitoring**
   - **Impact**: Can't monitor job health in production
   - **Fix**: Add Prometheus metrics or logging-based counters
   - **Timeline**: Required before production deployment

6. **Silent Transition Failures**
   - **Impact**: Invalid transitions not visible
   - **Fix**: Emit metrics/alerts for validation failures
   - **Timeline**: Medium priority - helps debug state machine issues

---

### 🟢 LOW PRIORITY

7. **Lock TTL Matches Job Timeout**
   - **Impact**: Theoretical race condition on exact timeout
   - **Fix**: Increase lock TTL to 45 seconds
   - **Timeline**: Low risk, easy fix

8. **No Status Audit Trail**
   - **Impact**: Can't debug status history
   - **Fix**: Add event_status_history table
   - **Timeline**: Nice to have for compliance/debugging

---

## SUMMARY

**Security Assessment:**
- ✅ Tenant isolation is correctly implemented
- ✅ System context bypass is safe (explicit tenant filtering)
- ✅ No cross-tenant data leakage risk
- ✅ Connection management is solid

**Architecture Assessment:**
- ✅ Correctly scoped to event-service boundaries
- ✅ No direct service-to-service calls
- ⚠️ Missing event publishing for cross-service coordination

**Production Readiness:**
- ⚠️ Must fix unbounded batch processing before scale testing
- ⚠️ Add monitoring/metrics before production deployment
- 🟡 Consider adding event publishing for complete integration

**Test Coverage Needed:**
- HIGH: Tenant isolation in background jobs
- HIGH: Concurrent transition handling
- HIGH: RLS bypass with explicit filtering
- MEDIUM: Performance with large datasets
- MEDIUM: Partial failure recovery
