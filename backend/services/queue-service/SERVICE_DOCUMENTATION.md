# QUEUE SERVICE - COMPLETE DOCUMENTATION

**Last Updated:** January 15, 2025  
**Version:** 1.0.0  
**Status:** IN DEVELOPMENT 🟡

---

## EXECUTIVE SUMMARY

**Queue-service is the asynchronous job processing backbone of the TicketToken platform.**

This service demonstrates:
- ✅ 3-tier persistence model (critical/important/ephemeral jobs)
- ✅ Idempotency for financial operations
- ✅ Rate limiting with token bucket algorithm
- ✅ Real-time monitoring with Prometheus metrics
- ✅ Critical alerting via Twilio (SMS/voice)
- ✅ Automatic job recovery on restart
- ✅ Event ordering for webhooks
- ⚠️ Payment processing (stub implementation)
- ⚠️ NFT minting (stub implementation)
- ⚠️ Email/SMS delivery (stub implementation)
- ❌ Missing comprehensive error handling
- ❌ Missing circuit breakers
- ❌ Missing distributed tracing
- ❌ Incomplete test coverage
- ❌ Analytics processor incomplete

**This is a CRITICAL INFRASTRUCTURE service with INCOMPLETE IMPLEMENTATION.**

---

## QUICK REFERENCE

- **Service:** queue-service
- **Port:** 3020 (index.ts) vs 3004 (config) ⚠️ INCONSISTENT
- **Framework:** Express.js
- **Database:** PostgreSQL (tickettoken_db)
- **Cache:** Redis (3 separate DBs for tier isolation)
- **Queue Engine:** Bull (Redis-backed)
- **Monitoring:** Prometheus + Twilio alerts
- **Default Queues:** money-queue, communication-queue, background-queue

---

## BUSINESS PURPOSE

### What This Service Does

**Core Responsibilities:**
1. Process payment transactions asynchronously (Stripe, Square)
2. Queue NFT minting after successful payments (Solana, Polygon)
3. Send emails via SendGrid (receipts, confirmations, reminders)
4. Send SMS via Twilio (notifications, alerts)
5. Track analytics events (user behavior, conversions)
6. Clean up old data (expired sessions, temp files)
7. Generate reports (sales, reconciliation, tax forms)
8. Process webhooks from external providers
9. Manage critical job persistence (PostgreSQL + Redis AOF)
10. Rate limit external API calls (prevent provider bans)
11. Monitor queue health (alert on failures/delays)
12. Recover jobs after service crashes

**Business Value:**
- Payment processing doesn't block API responses (fast checkout)
- NFT minting happens in background (user gets immediate confirmation)
- Email delivery doesn't slow down ticket purchases
- Failed jobs automatically retry (resilient system)
- Critical financial jobs never lost (persistent storage)
- External APIs protected from overload (rate limiting)
- Operations team alerted on critical issues (SMS/phone alerts)
- Service restarts don't lose jobs (automatic recovery)

---

## ARCHITECTURE OVERVIEW

### Technology Stack

```
Runtime: Node.js 20 + TypeScript
Framework: Express.js
Database: PostgreSQL (via node-postgres Pool)
ORM: Knex.js (only in models, not controllers)
Cache: Redis (ioredis) - 3 separate DBs
Queue: Bull (Redis-backed job queues)
Monitoring: prom-client (Prometheus metrics)
Alerting: Twilio (SMS + voice calls)
Logging: Winston
Validation: Joi schemas
Testing: Jest
```

### Service Architecture Layers

```
┌─────────────────────────────────────────────────────────┐
│                    API LAYER (Express)                   │
│  Routes → Middleware → Controllers → Services            │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                   MIDDLEWARE LAYER                       │
│  • Authentication (JWT verify)                           │
│  • Authorization (role-based)                            │
│  • Rate Limiting (per-service token bucket)              │
│  • Validation (Joi schemas)                              │
│  • Error Handling (centralized)                          │
│  • Request Logging (Winston)                             │
│  • Metrics Collection (Prometheus)                       │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                    BUSINESS LOGIC                        │
│                                                          │
│  QUEUE FACTORY:                                          │
│  ├─ QueueFactory (singleton manager)                     │
│  ├─ MoneyQueue (payment, refund, NFT mint)              │
│  ├─ CommunicationQueue (email, SMS, push)               │
│  └─ BackgroundQueue (analytics, cleanup, reports)       │
│                                                          │
│  PERSISTENCE:                                            │
│  ├─ PersistenceService (3-tier storage)                 │
│  ├─ Tier 1: PostgreSQL + Redis AOF (money)              │
│  ├─ Tier 2: Redis RDB (communication)                   │
│  └─ Tier 3: Memory only (background)                    │
│                                                          │
│  IDEMPOTENCY:                                            │
│  ├─ IdempotencyService (prevent duplicates)             │
│  ├─ Key generation per job type                         │
│  └─ Redis + PostgreSQL dual storage                     │
│                                                          │
│  RATE LIMITING:                                          │
│  ├─ RateLimiterService (token bucket)                   │
│  ├─ Per-provider limits (Stripe, SendGrid, etc)         │
│  ├─ Concurrent request tracking                         │
│  └─ Burst allowance + cooldown                          │
│                                                          │
│  MONITORING:                                             │
│  ├─ MonitoringService (health checks)                   │
│  ├─ Prometheus metrics (job stats)                      │
│  ├─ Alert system (Twilio SMS/calls)                     │
│  └─ Alert cooldowns (prevent spam)                      │
│                                                          │
│  RECOVERY:                                               │
│  └─ RecoveryService (job resurrection)                  │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                    DATA LAYER                            │
│  • JobModel (job records)                                │
│  • QueueModel (queue metadata)                           │
│  • RateLimitModel (rate limit state)                     │
│  • ScheduleModel (cron jobs)                             │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                   ASYNC PROCESSING                       │
│  • Job Workers (Bull processors)                         │
│  • MonitoringService (30s health checks)                 │
│  • RecoveryService (startup job recovery)                │
└─────────────────────────────────────────────────────────┘
```

### 3-Tier Persistence Model

```
TIER 1: CRITICAL (Money Queue)
├─ Jobs: payments, refunds, payouts, NFT minting
├─ Storage: PostgreSQL + Redis AOF
├─ Retention: 90 days (365 days for NFTs)
├─ Retry: 10 attempts, exponential backoff
├─ Recovery: Always recoverable from PostgreSQL
└─ Why: Financial transactions CANNOT be lost

TIER 2: IMPORTANT (Communication Queue)
├─ Jobs: emails, SMS, push notifications
├─ Storage: Redis RDB snapshots
├─ Retention: 7-30 days
├─ Retry: 3 attempts, fixed backoff
├─ Recovery: Recoverable if Redis persists
└─ Why: Communication important but not financial

TIER 3: EPHEMERAL (Background Queue)
├─ Jobs: analytics, cleanup, reports
├─ Storage: Memory only (no persistence)
├─ Retention: N/A (deleted on completion)
├─ Retry: 2 attempts, fixed backoff
├─ Recovery: Lost on restart (acceptable)
└─ Why: Non-critical, can be regenerated
```

---

## DATABASE SCHEMA

### Core Queue Tables

**jobs** (Knex model - not currently used)
```sql
- id (VARCHAR, PK) - UUID
- queue (VARCHAR) - money, communication, background
- type (VARCHAR) - payment-process, send-email, etc
- data (JSONB) - job payload
- status (ENUM: pending, processing, completed, failed)
- attempts (INTEGER, default 0)
- max_attempts (INTEGER)
- error (TEXT, nullable)
- scheduled_for (TIMESTAMP, nullable)
- started_at (TIMESTAMP, nullable)
- completed_at (TIMESTAMP, nullable)
- created_at (TIMESTAMP, default NOW())
- updated_at (TIMESTAMP, default NOW())

Indexes:
- queue + status (for polling)
- scheduled_for (for delayed jobs)
```

**queues** (Knex model - not currently used)
```sql
- id (VARCHAR, PK) - UUID
- name (VARCHAR, unique) - queue name
- type (VARCHAR) - money, communication, background
- config (JSONB) - queue configuration
- active (BOOLEAN, default true)
- pending_count (INTEGER, default 0)
- processing_count (INTEGER, default 0)
- completed_count (INTEGER, default 0)
- failed_count (INTEGER, default 0)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)

Note: Counts are updated by triggers or manually
```

**rate_limits** (Knex model - not currently used)
```sql
- id (VARCHAR, PK) - UUID
- key (VARCHAR, unique) - service identifier
- limit (INTEGER) - max requests per window
- window_seconds (INTEGER) - time window
- current_count (INTEGER, default 0)
- reset_at (TIMESTAMP)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)

Example rows:
- stripe: limit=25/sec, window=1
- sendgrid: limit=5/sec, window=1
- twilio: limit=1/sec, window=1
```

**schedules** (Knex model - not currently used)
```sql
- id (VARCHAR, PK) - UUID
- name (VARCHAR) - schedule name
- cron_expression (VARCHAR) - cron pattern
- job_type (VARCHAR) - job to execute
- job_data (JSONB) - job payload
- active (BOOLEAN, default true)
- last_run (TIMESTAMP, nullable)
- next_run (TIMESTAMP, nullable)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)

Example:
- cleanup-old-data: '0 2 * * *' (2am daily)
- payment-reconciliation: '*/5 * * * *' (every 5 min)
```

### Persistence Tables (PostgreSQL)

**critical_jobs** (Tier 1 persistence)
```sql
- id (VARCHAR, PK) - job ID from Bull
- queue_name (VARCHAR) - money-queue
- job_type (VARCHAR) - payment-process, refund-process, etc
- data (JSONB) - full job payload
- priority (INTEGER) - 1-10 (10=highest)
- idempotency_key (VARCHAR, nullable, unique per job type)
- status (VARCHAR) - pending, processing, completed, failed
- created_at (TIMESTAMP, default NOW())
- updated_at (TIMESTAMP, default NOW())

Indexes:
- status (for recovery queries)
- idempotency_key (for duplicate prevention)
- created_at (for cleanup)

CONSTRAINT: ON CONFLICT (id) DO UPDATE SET updated_at = NOW()
```

**idempotency_keys** (prevents duplicate processing)
```sql
- key (VARCHAR, PK) - generated idempotency key
- queue_name (VARCHAR) - which queue
- job_type (VARCHAR) - which job type
- result (JSONB) - job result (success/failure)
- processed_at (TIMESTAMP, default NOW())
- expires_at (TIMESTAMP) - TTL for cleanup

Example keys:
- payment-<venueId>-<userId>-<eventId>-<amount>
- refund-<transactionId>
- nft-<eventId>-<seatId>
- email-<template>-<to>-<date>

Indexes:
- key (primary)
- expires_at (for cleanup)
```

### Monitoring Tables

**queue_metrics** (time-series data)
```sql
- queue_name (VARCHAR)
- waiting_count (INTEGER)
- active_count (INTEGER)
- completed_count (INTEGER)
- failed_count (INTEGER)
- captured_at (TIMESTAMP, default NOW())

No PK - append-only time series
Retention: 30 days (cleanup cron)

Indexes:
- queue_name + captured_at (for dashboards)
```

**alert_history** (alert log)
```sql
- id (SERIAL, PK)
- severity (VARCHAR) - critical, warning, info
- alert_type (VARCHAR) - queue_depth, job_age, high_failures
- message (TEXT)
- queue_name (VARCHAR, nullable)
- metric_value (NUMERIC, nullable) - actual value
- threshold_value (NUMERIC, nullable) - threshold breached
- acknowledged (BOOLEAN, default false)
- acknowledged_by (VARCHAR, nullable) - user ID
- acknowledged_at (TIMESTAMP, nullable)
- created_at (TIMESTAMP, default NOW())

Indexes:
- severity + created_at (for filtering)
- acknowledged (for pending alerts)

Retention: 7 days
```

**rate_limit_metrics** (rate limiter stats)
```sql
- service_name (VARCHAR)
- tokens_available (INTEGER)
- concurrent_requests (INTEGER)
- max_concurrent (INTEGER)
- captured_at (TIMESTAMP, default NOW())

No PK - append-only time series
Retention: 7 days

Used for debugging rate limit issues
```

### Bull Queue Metadata (Redis)

Bull stores its own metadata in Redis:

```
bull:money-queue:id (counter for job IDs)
bull:money-queue:wait (sorted set of waiting jobs)
bull:money-queue:active (sorted set of active jobs)
bull:money-queue:completed (sorted set of completed)
bull:money-queue:failed (sorted set of failed)
bull:money-queue:delayed (sorted set of delayed)
bull:money-queue:priority (sorted set by priority)
bull:money-queue:jobs:<jobId> (hash of job data)
bull:money-queue:events (pub/sub channel)

Persistence:
- Tier 1 (money): DB 1, AOF enabled
- Tier 2 (communication): DB 2, RDB snapshots
- Tier 3 (background): DB 3, no persistence
```

---

## API ENDPOINTS

### Job Management Endpoints

#### **1. Add Job to Queue**
```
POST /api/v1/queue/jobs
Headers:
  Authorization: Bearer <JWT>

Body:
{
  "queue": "money",
  "type": "payment-process",
  "data": {
    "userId": "uuid",
    "venueId": "uuid",
    "eventId": "uuid",
    "amount": 10000,  // CENTS
    "paymentMethod": "pm_..."
  },
  "options": {
    "priority": 10,      // 1-10, optional
    "delay": 0,          // ms, optional
    "attempts": 10       // optional, defaults by queue
  }
}

Response: 201
{
  "jobId": "12345",
  "queue": "money",
  "type": "payment-process",
  "status": "queued",
  "options": {
    "priority": 10,
    "delay": 0,
    "attempts": 10
  }
}

Security Checks:
- JWT authentication required
- User context added to job data (userId, venueId)
- Priority defaults: money=HIGH(7), others=NORMAL(5)

Errors:
- 400: Invalid queue type, validation failed
- 401: Missing/invalid JWT
- 500: Queue error
```

#### **2. Add Batch Jobs**
```
POST /api/v1/queue/jobs/batch
Headers:
  Authorization: Bearer <JWT>

Body:
{
  "queue": "communication",
  "jobs": [
    {
      "type": "send-email",
      "data": { "to": "user1@example.com", ... },
      "options": { "priority": 5 }
    },
    {
      "type": "send-email",
      "data": { "to": "user2@example.com", ... }
    }
  ],
  "options": {
    "stopOnError": false,    // Continue on validation errors
    "validateAll": true      // Pre-validate all jobs
  }
}

Response: 201
{
  "queue": "communication",
  "total": 2,
  "successful": 2,
  "failed": 0,
  "jobs": [
    {
      "index": 0,
      "jobId": "12346",
      "type": "send-email",
      "status": "queued"
    },
    {
      "index": 1,
      "jobId": "12347",
      "type": "send-email",
      "status": "queued"
    }
  ],
  "errors": []
}

Features:
- Pre-validation (optional)
- Batch size limit: 100 jobs max
- Per-job validation (business rules)
- Data sanitization (XSS, SQL injection prevention)
- Rollback on error (if stopOnError=true)

Validation Per Queue:
Money queue:
  - payment: requires amount, currency, userId
  - refund: requires transactionId, amount, reason
  - Amount: 0 < amount <= 1,000,000 cents

Communication queue:
  - email: requires to (valid email), subject, template
  - sms: requires to (valid phone), message

Background queue:
  - analytics: requires targetId, eventType

Sanitization:
- Strips <script> tags
- Removes SQL keywords (SELECT, INSERT, etc)
- Skips keys starting with __ or containing 'prototype'
```

#### **3. Get Job Status**
```
GET /api/v1/queue/jobs/:id?queue=money
Headers:
  Authorization: Bearer <JWT>

Response: 200
{
  "id": "12345",
  "queue": "money-queue",
  "type": "payment-process",
  "data": { ... },
  "state": "completed",
  "progress": 100,
  "attempts": 1,
  "createdAt": "2025-01-15T10:00:00Z",
  "processedAt": "2025-01-15T10:00:02Z",
  "finishedAt": "2025-01-15T10:00:05Z"
}

Security:
- Users can only see their own jobs (filtered by userId in data)
- Admins can see all jobs

Errors:
- 400: Missing queue parameter
- 404: Job not found
```

#### **4. Retry Failed Job**
```
POST /api/v1/queue/jobs/:id/retry
Headers:
  Authorization: Bearer <JWT>

Body:
{
  "queue": "money"
}

Response: 200
{
  "jobId": "12345",
  "status": "retrying",
  "message": "Job has been queued for retry"
}

Security:
- Requires authentication
- Admin or venue_admin only
- Logs retry action with user ID

Process:
1. Fetch job from queue
2. Call job.retry() (Bull method)
3. Job re-enters queue with same data
4. Attempt counter increments
```

#### **5. Cancel Job**
```
DELETE /api/v1/queue/jobs/:id?queue=money
Headers:
  Authorization: Bearer <JWT>

Response: 200
{
  "jobId": "12345",
  "status": "cancelled",
  "message": "Job has been cancelled"
}

Security:
- Admin or venue_admin only
- Cannot cancel already-processing jobs (race condition)

Process:
1. Fetch job
2. Call job.remove()
3. Job deleted from Redis
4. If Tier 1, mark as cancelled in PostgreSQL
```

### Queue Management Endpoints

#### **6. List All Queues**
```
GET /api/v1/queue/queues
Headers:
  Authorization: Bearer <JWT>

Response: 200
[
  {
    "name": "money-queue",
    "waiting": 5,
    "active": 2,
    "completed": 1250,
    "failed": 3,
    "delayed": 1
  },
  {
    "name": "communication-queue",
    "waiting": 150,
    "active": 20,
    "completed": 5000,
    "failed": 25,
    "delayed": 0
  },
  {
    "name": "background-queue",
    "waiting": 500,
    "active": 10,
    "completed": 10000,
    "failed": 50,
    "delayed": 100
  }
]
```

#### **7. Get Queue Status**
```
GET /api/v1/queue/queues/:name/status
Headers:
  Authorization: Bearer <JWT>

Response: 200
{
  "name": "money-queue",
  "metrics": {
    "waiting": 5,
    "active": 2,
    "completed": 1250,
    "failed": 3,
    "delayed": 1
  },
  "samples": {
    "waiting": [
      {
        "id": "12350",
        "type": "payment-process",
        "createdAt": "2025-01-15T10:05:00Z"
      },
      ...
    ],
    "active": [
      {
        "id": "12349",
        "type": "refund-process",
        "startedAt": "2025-01-15T10:04:50Z"
      }
    ],
    "failed": [
      {
        "id": "12340",
        "type": "payment-process",
        "failedAt": "2025-01-15T09:50:00Z",
        "reason": "Stripe API error: card_declined"
      }
    ]
  }
}

Returns first 10 of each category
```

#### **8. Pause Queue**
```
POST /api/v1/queue/queues/:name/pause
Headers:
  Authorization: Bearer <JWT>

Response: 200
{
  "queue": "money-queue",
  "status": "paused",
  "message": "Queue has been paused"
}

Security:
- Admin only
- Logs action with user ID

Effect:
- No new jobs processed
- Active jobs continue to completion
- Waiting jobs remain queued
```

#### **9. Resume Queue**
```
POST /api/v1/queue/queues/:name/resume
Headers:
  Authorization: Bearer <JWT>

Response: 200
{
  "queue": "money-queue",
  "status": "active",
  "message": "Queue has been resumed"
}

Security:
- Admin only
```

#### **10. Clear Queue**
```
POST /api/v1/queue/queues/:name/clear?type=completed
Headers:
  Authorization: Bearer <JWT>

Query Parameters:
- type: completed | failed | delayed | wait

Response: 200
{
  "queue": "money-queue",
  "action": "cleared completed",
  "message": "Queue has been cleared"
}

Security:
- Admin only
- DANGER: Irreversible action
- Logs action with user ID

Actions:
- completed: Remove completed jobs from Redis
- failed: Remove failed jobs (use with caution)
- delayed: Remove delayed jobs
- wait: Remove waiting jobs (DANGER)
- No type param: Empty entire queue (EXTREME DANGER)
```

#### **11. Get Queue Jobs (Paginated)**
```
GET /api/v1/queue/queues/:name/jobs?status=waiting&start=0&end=20
Headers:
  Authorization: Bearer <JWT>

Query Parameters:
- status: waiting | active | completed | failed (required)
- start: offset (default 0)
- end: limit (default 20)

Response: 200
{
  "queue": "money-queue",
  "status": "waiting",
  "count": 5,
  "jobs": [
    {
      "id": "12350",
      "type": "payment-process",
      "data": { ... },
      "attempts": 0,
      "progress": 0,
      "createdAt": "2025-01-15T10:05:00Z",
      "processedAt": null,
      "finishedAt": null,
      "failedReason": null
    },
    ...
  ]
}
```

### Rate Limit Management Endpoints

#### **12. Get Rate Limit Status**
```
GET /api/v1/queue/rate-limits/status/:key
Headers:
  Authorization: Bearer <JWT>

Response: 200
{
  "stripe": {
    "tokensAvailable": 25,
    "concurrent": 3,
    "maxConcurrent": 10,
    "lastActivity": "2025-01-15T10:05:30Z",
    "config": {
      "maxPerSecond": 25,
      "maxConcurrent": 10,
      "burstSize": 50,
      "cooldownMs": 1000
    }
  }
}

Returns current token bucket state
```

#### **13. Check If Rate Limited**
```
GET /api/v1/queue/rate-limits/check/:service

Response: 200
{
  "service": "stripe",
  "rateLimited": false,
  "waitTimeMs": 0,
  "waitTimeSeconds": 0
}

OR

{
  "service": "sendgrid",
  "rateLimited": true,
  "waitTimeMs": 2500,
  "waitTimeSeconds": 3
}
```

#### **14. Reset Rate Limit**
```
POST /api/v1/queue/rate-limits/reset/:service
Headers:
  Authorization: Bearer <JWT>

Response: 200
{
  "service": "stripe",
  "status": "reset",
  "message": "Rate limiter for stripe has been reset"
}

Security:
- Admin only
- Logs action with user ID

Effect:
- Resets token bucket to full
- Clears concurrent counter
- Useful for testing or after maintenance
```

#### **15. Emergency Stop**
```
POST /api/v1/queue/rate-limits/emergency-stop
Headers:
  Authorization: Bearer <JWT>

Response: 200
{
  "status": "stopped",
  "message": "All rate limiters have been paused"
}

Security:
- Admin only
- CRITICAL ACTION

Effect:
- Sets maxConcurrent=0 for ALL services
- No new API calls can be made
- Active calls complete normally
- Use when external API is down/rate limiting
```

#### **16. Resume After Emergency Stop**
```
POST /api/v1/queue/rate-limits/resume
Headers:
  Authorization: Bearer <JWT>

Response: 200
{
  "status": "resumed",
  "message": "All rate limiters have been resumed"
}

Effect:
- Restores original maxConcurrent values
- Normal operation resumes
```

### Monitoring & Metrics Endpoints

#### **17. Prometheus Metrics**
```
GET /api/v1/queue/metrics/prometheus
Headers:
  Authorization: Bearer <JWT>

Response: 200 (text/plain)
# HELP queue_depth Number of jobs in queue
# TYPE queue_depth gauge
queue_depth{queue_name="money-queue",status="waiting"} 5
queue_depth{queue_name="money-queue",status="active"} 2

# HELP job_processing_duration_seconds Time taken to process jobs
# TYPE job_processing_duration_seconds histogram
job_processing_duration_seconds_bucket{queue_name="money-queue",job_type="payment-process",le="0.1"} 0
job_processing_duration_seconds_bucket{queue_name="money-queue",job_type="payment-process",le="0.5"} 10
...

# HELP job_results_total Job completion results
# TYPE job_results_total counter
job_results_total{queue_name="money-queue",job_type="payment-process",result="success"} 1250
job_results_total{queue_name="money-queue",job_type="payment-process",result="failure"} 25

# HELP alerts_sent_total Number of alerts sent
# TYPE alerts_sent_total counter
alerts_sent_total{severity="critical",type="queue_depth",channel="sms"} 5
alerts_sent_total{severity="critical",type="queue_depth",channel="phone"} 2

# HELP oldest_job_age_seconds Age of oldest waiting job
# TYPE oldest_job_age_seconds gauge
oldest_job_age_seconds{queue_name="money-queue"} 45

# HELP failed_jobs_total Number of failed jobs
# TYPE failed_jobs_total gauge
failed_jobs_total{queue_name="money-queue"} 3

Security:
- Requires admin or monitoring role
- Used by Grafana dashboards
```

#### **18. Metrics Summary (JSON)**
```
GET /api/v1/queue/metrics/summary
Headers:
  Authorization: Bearer <JWT>

Response: 200
{
  "queues": [
    {
      "queue_name": "money-queue",
      "avg_waiting": 4.5,
      "max_waiting": 12,
      "avg_active": 2.1,
      "avg_failed": 0.3
    },
    ...
  ],
  "alerts": [
    {
      "severity": "critical",
      "count": 2
    },
    {
      "severity": "warning",
      "count": 15
    }
  ],
  "timestamp": "2025-01-15T10:10:00Z"
}

Data from last 1 hour
```

#### **19. Queue Throughput**
```
GET /api/v1/queue/metrics/throughput

Response: 200
{
  "throughput": [
    {
      "queue_name": "money-queue",
      "minute": "2025-01-15T10:09:00Z",
      "jobs_per_minute": 25
    },
    {
      "queue_name": "money-queue",
      "minute": "2025-01-15T10:08:00Z",
      "jobs_per_minute": 30
    },
    ...
  ],
  "timestamp": "2025-01-15T10:10:00Z"
}

Data from last 1 hour, grouped by minute
```

#### **20. Failure Analysis**
```
GET /api/v1/queue/metrics/failures

Response: 200
{
  "trends": [
    {
      "queue_name": "money-queue",
      "hour": "2025-01-15T10:00:00Z",
      "avg_failures": 0.5
    },
    ...
  ],
  "topFailures": [
    {
      "queue_name": "money-queue",
      "job_type": "payment-process",
      "count": 15,
      "last_failure": "2025-01-15T10:05:00Z"
    },
    {
      "queue_name": "communication-queue",
      "job_type": "send-email",
      "count": 8,
      "last_failure": "2025-01-15T09:50:00Z"
    }
  ],
  "timestamp": "2025-01-15T10:10:00Z"
}

Data from last 24 hours
Uses dead_letter_jobs table (not shown in provided code)
```

### Alert Management Endpoints

#### **21. Get Recent Alerts**
```
GET /api/v1/queue/alerts?severity=critical&limit=50
Headers:
  Authorization: Bearer <JWT>

Query Parameters:
- severity: critical | warning | info (optional)
- limit: 1-100 (default 50)

Response: 200
{
  "alerts": [
    {
      "id": 123,
      "severity": "critical",
      "alert_type": "queue_depth",
      "message": "CRITICAL: Money queue has 75 jobs waiting!",
      "queue_name": "money-queue",
      "metric_value": 75,
      "threshold_value": 50,
      "acknowledged": false,
      "created_at": "2025-01-15T10:00:00Z"
    },
    ...
  ],
  "count": 5
}

Returns alerts from last 24 hours
```

#### **22. Acknowledge Alert**
```
POST /api/v1/queue/alerts/:id/acknowledge
Headers:
  Authorization: Bearer <JWT>

Response: 200
{
  "alertId": "123",
  "status": "acknowledged",
  "acknowledgedBy": "user-uuid"
}

Effect:
- Sets acknowledged=true
- Records acknowledgedBy user ID
- Sets acknowledgedAt timestamp
```

#### **23. Test Alert System**
```
POST /api/v1/queue/alerts/test
Headers:
  Authorization: Bearer <JWT>

Body:
{
  "severity": "info",
  "channel": "log"
}

Response: 200
{
  "status": "sent",
  "severity": "info",
  "channel": "log",
  "message": "Test alert sent successfully"
}

Security:
- Admin only
- Logs test alert with user ID

Note: Doesn't actually send SMS/call in test mode
```

### Health Check Endpoints

#### **24. Health Check**
```
GET /api/v1/queue/health

Response: 200 (healthy) or 503 (degraded/unhealthy)
{
  "status": "healthy",
  "checks": {
    "service": "healthy",
    "database": "healthy",
    "redis": "healthy",
    "queues": "healthy"
  },
  "timestamp": "2025-01-15T10:10:00Z"
}

OR (degraded)

{
  "status": "degraded",
  "checks": {
    "service": "healthy",
    "database": "healthy",
    "redis": "unhealthy",  // Redis connection failed
    "queues": "healthy"
  },
  "timestamp": "2025-01-15T10:10:00Z"
}

No authentication required (used by load balancers)
```

#### **25. Readiness Check**
```
GET /api/v1/queue/health/ready

Response: 200 (ready) or 503 (not ready)
{
  "status": "ready",
  "timestamp": "2025-01-15T10:10:00Z"
}

Checks:
- Database can accept connections (SELECT 1)
- Redis can accept connections (PING)

Used by Kubernetes readiness probes
```

---

## DEPENDENCIES

### What This Service NEEDS (Upstream)

```
REQUIRED (Service fails without these):
├── PostgreSQL (localhost:5432)
│   └── Database: tickettoken_db
│   └── Tables: critical_jobs, idempotency_keys, queue_metrics, alert_history
│   └── Breaking: Tier 1 persistence fails, service degraded
│
├── Redis (localhost:6379)
│   └── DB 1: Money queue (AOF persistence)
│   └── DB 2: Communication queue (RDB snapshots)
│   └── DB 3: Background queue (no persistence)
│   └── DB 4: Idempotency keys
│   └── DB 5: Rate limiting state
│   └── Breaking: Queues fail, service unusable
│
└── JWT Public Key (RS256)
    └── File: ~/tickettoken-secrets/jwt-public.pem
    └── Breaking: Auth fails, all endpoints blocked

OPTIONAL (Service works without these):
├── Twilio (SMS/Voice)
│   └── TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
│   └── Breaking: Alerts logged but not sent
│
├── SendGrid (Email)
│   └── For email jobs (communication queue)
│   └── Breaking: Email jobs fail, retry later
│
├── Stripe (Payments)
│   └── For payment processing jobs (money queue)
│   └── Breaking: Payment jobs fail, retry later
│
├── Solana RPC
│   └── For NFT minting jobs (money queue)
│   └── Breaking: NFT jobs fail, retry later
│
└── Polygon RPC
    └── For NFT minting jobs (money queue)
    └── Breaking: NFT jobs fail, retry later
```

### What DEPENDS On This Service (Downstream)

```
DIRECT DEPENDENCIES:
├── Payment Service (port 3005)
│   └── Queues payment processing, refunds, NFT minting
│   └── Calls: POST /api/v1/queue/jobs
│   └── Impact: Payments would be synchronous (slower)
│
├── Order Service (port 3016)
│   └── Queues background tasks (analytics, cleanup)
│   └── Calls: POST /api/v1/queue/jobs
│   └── Impact: Background tasks would be synchronous
│
├── Notification Service (port 3008)
│   └── Queues email/SMS delivery
│   └── Calls: POST /api/v1/queue/jobs
│   └── Impact: Notifications would be synchronous
│
├── Ticket Service (port 3004)
│   └── May queue ticket generation tasks
│   └── Calls: POST /api/v1/queue/jobs
│   └── Impact: Ticket generation would be synchronous
│
└── Internal Monitoring
    └── Prometheus scrapes metrics
    └── Grafana dashboards visualize queues
    └── PagerDuty receives alerts
    └── Impact: No visibility into queue health

BLAST RADIUS: CRITICAL
- If queue-service is down:
  ✗ Payments become synchronous (slow checkout, timeouts)
  ✗ NFT minting queued but not processed (users wait)
  ✗ Emails/SMS delayed or lost
  ✗ No job retry mechanism
  ✗ Background tasks pile up
  ✗ No monitoring/alerting
  ✓ Other services continue working (degraded mode)
```

---

## CRITICAL FEATURES

### 1. 3-Tier Persistence ✅

**Implementation:**
```typescript
// Tier assignment in queue configs

TIER_1 (Money Queue):
- Storage: PostgreSQL critical_jobs table + Redis DB 1 (AOF)
- On job add: INSERT into critical_jobs
- On completion: UPDATE critical_jobs SET status='completed'
- On failure: UPDATE critical_jobs, job stays in table
- Recovery: SELECT * FROM critical_jobs WHERE status IN ('pending','processing')
- Retention: 90 days (365 for NFTs)

TIER_2 (Communication Queue):
- Storage: Redis DB 2 with RDB snapshots
- On job add: HSET job:{id} in Redis
- Persistence: Redis saves to disk periodically (every 100 jobs or 5 min)
- Recovery: Only if Redis didn't crash
- Retention: 7-30 days

TIER_3 (Background Queue):
- Storage: Memory only (Redis DB 3, no persistence)
- On job add: Stored in Redis (volatile)
- Recovery: Lost on Redis restart
- Retention: Deleted on completion

Code: src/services/persistence.service.ts
```

**Why it matters:**
- Financial transactions never lost (dual storage)
- Communication jobs recoverable if Redis survives
- Background jobs don't waste disk space
- Appropriate durability per criticality

### 2. Idempotency ✅

**Implementation:**
```typescript
// Redis + PostgreSQL dual storage

Key Generation (per job type):
- payment-process: payment-{venueId}-{userId}-{eventId}-{amount}
- refund-process: refund-{transactionId}
- nft-mint: nft-{eventId}-{seatId}
- send-email: email-{template}-{to}-{date}  (daily uniqueness)
- send-sms: sms-{to}-{template}-{hour}  (hourly uniqueness)
- analytics-event: analytics-{eventType}-{venueId}-{userId}-{timestamp}

Process:
1. Generate key from job data
2. Check Redis: idem:{key}
3. If exists: Return cached result (prevent duplicate)
4. Check PostgreSQL: idempotency_keys table
5. If exists: Cache in Redis, return result
6. Process job
7. Store result in both Redis (1hr TTL) + PostgreSQL (90 days)

Code: src/services/idempotency.service.ts
```

**Why it matters:**
- Prevents duplicate charges (payment-{venueId}-{userId}-{eventId}-{amount})
- Prevents duplicate refunds (refund-{transactionId})
- Prevents duplicate NFT mints (nft-{eventId}-{seatId})
- Safe to retry failed jobs
- Handles race conditions

**Issues Found:**
- ⚠️ Generic hash fallback for unknown types (should error instead)
- ⚠️ SMS uses hourly uniqueness (should be more granular for high-volume)

### 3. Rate Limiting ✅

**Implementation:**
```typescript
// Token Bucket Algorithm with concurrent request tracking

Configuration (per service):
stripe: 25/sec, 10 concurrent, burst=50, cooldown=1s
sendgrid: 5/sec, 20 concurrent, burst=100, cooldown=1s
twilio: 1/sec, 5 concurrent, burst=10, cooldown=5s
solana: 10/sec, 5 concurrent, burst=30, cooldown=1s
quickbooks: 2/sec, 3 concurrent, burst=10, cooldown=3s
internal: 100/sec, 50 concurrent, burst=200, cooldown=100ms

Token Bucket:
- Starts with maxTokens (burst size)
- Refills at refillRate per second
- consume(n): Remove n tokens, return false if insufficient
- waitForTokens(n, timeout): Wait up to timeout for tokens

Concurrent Tracking:
- acquire(service): Wait for token + increment concurrent
- release(service): Decrement concurrent counter
- Blocks if concurrent >= maxConcurrent

Rate Limit Groups (shared limits):
twilio: [twilio-sms, twilio-voice, twilio-verify]
stripe: [stripe-charges, stripe-refunds, stripe-payouts]
sendgrid: [sendgrid-transactional, sendgrid-marketing]

Code: src/services/rate-limiter.service.ts
      src/utils/token-bucket.ts
```

**Why it matters:**
- Prevents Stripe rate limit errors (429)
- Prevents SendGrid account suspension
- Prevents Twilio overages
- Prevents Solana RPC bans
- Protects external APIs from abuse

**Features:**
- Burst allowance (handle spikes)
- Cooldown periods (recovery time)
- Emergency stop (pause all limiters)
- Metrics collection (debugging)

### 4. Monitoring & Alerting ✅

**Implementation:**
```typescript
// Real-time monitoring with tiered alerts

Health Checks (every 30 seconds):
1. Check queue depths
2. Check oldest job age
3. Check failure counts
4. Store metrics in PostgreSQL
5. Trigger alerts if thresholds breached

Alert Thresholds:
Money Queue (CRITICAL):
  - Depth: >50 jobs waiting
  - Age: >10 minutes for any job
  - Failures: >10 failed jobs

Communication Queue (WARNING):
  - Depth: >5000 jobs waiting
  - Age: >30 minutes
  - Failures: >100 failed jobs

Background Queue (INFO):
  - Depth: >50,000 jobs waiting
  - Age: >120 minutes
  - Failures: >1000 failed jobs

Alert Channels:
1. Logs (always)
2. Database (alert_history table)
3. SMS (critical only, via Twilio)
4. Phone call (money queue critical only)

Alert Cooldowns (prevent spam):
- Critical: 5 minutes
- Warning: 1 hour
- Info: 24 hours

Code: src/services/monitoring.service.ts
```

**Why it matters:**
- Ops team notified of issues immediately
- Phone calls for money queue issues (wake up on-call)
- Prevents alert spam (cooldowns)
- Historical alert tracking (troubleshooting)

**Prometheus Metrics:**
```
queue_depth{queue_name, status}
job_processing_duration_seconds{queue_name, job_type}
job_results_total{queue_name, job_type, result}
alerts_sent_total{severity, type, channel}
oldest_job_age_seconds{queue_name}
failed_jobs_total{queue_name}
```

### 5. Job Recovery ✅

**Implementation:**
```typescript
// Automatic recovery on service restart

Startup Process:
1. Connect to PostgreSQL + Redis
2. Initialize queue factory
3. Run RecoveryService.recoverPendingJobs()
4. Start monitoring service
5. Start Express server

Recovery Process:
1. Query: SELECT * FROM critical_jobs 
   WHERE status IN ('pending', 'processing')
   AND created_at > NOW() - INTERVAL '24 hours'
2. For each job:
   a. Determine queue (money, communication, background)
   b. Re-add to Bull queue with same ID
   c. Adjust attempts (10 - attempts_made)
   d. Maintain priority
3. Log recovery count

Code: src/services/recovery.service.ts
      src/index.ts (startService function)
```

**Why it matters:**
- Service crashes don't lose jobs
- Kubernetes pod restarts safe
- Maintenance windows safe
- 24-hour recovery window (configurable)

**Limitations:**
- Only Tier 1 (money queue) recoverable from PostgreSQL
- Tier 2/3 depend on Redis surviving

### 6. Queue Factory Pattern ✅

**Implementation:**
```typescript
// Singleton factory manages all queues

QueueFactory (static class):
- queues: Map<string, Queue>
- persistenceServices: Map<string, PersistenceService>
- initialized: boolean

initialize():
1. Create money queue (Tier 1)
2. Create communication queue (Tier 2)
3. Create background queue (Tier 3)
4. Setup persistence handlers
5. Setup event handlers (completed, failed, stalled)

getQueue(type):
- Returns existing queue instance
- Throws if not initialized

shutdown():
- Closes all queues
- Clears maps
- Sets initialized=false

Code: src/queues/factories/queue.factory.ts
```

**Why it matters:**
- Single source of truth for queues
- Ensures queues initialized once
- Proper lifecycle management (startup/shutdown)
- Consistent event handling

**Queue Definitions:**
```typescript
MoneyQueue:
- Processors: payment, refund, nft-mint
- Location: src/queues/definitions/money.queue.ts

CommunicationQueue:
- Processors: send-email
- Location: src/queues/definitions/communication.queue.ts

BackgroundQueue:
- Processors: analytics-track
- Location: src/queues/definitions/background.queue.ts
```

### 7. Worker Processors ⚠️

**Implementation:**
```typescript
// BaseWorker abstract class for processors

BaseWorker<T, R>:
- abstract name: string
- abstract execute(job: Job<T>): Promise<R>
- process(job): Promise<R> (handles timing, logging, errors)

Processors:
1. PaymentProcessor (money queue)
   - Type: payment-process
   - Idempotency: payment-{venueId}-{userId}-{eventId}-{amount}
   - Rate limit: Stripe (25/sec)
   - Status: STUB (simulatePaymentProcessing)

2. RefundProcessor (money queue)
   - Type: refund-process
   - Idempotency: refund-{transactionId}
   - Status: STUB (simulateRefundProcessing)

3. NFTMintProcessor (money queue)
   - Type: nft-mint
   - Idempotency: nft-{eventId}-{seatId}
   - Status: STUB (simulateNFTMinting)
   - Retention: 365 days (longest)

4. EmailProcessor (communication queue)
   - Type: send-email
   - Idempotency: email-{template}-{to}-{date}
   - Rate limit: SendGrid (5/sec)
   - Status: STUB (simulateEmailSend)

5. AnalyticsProcessor (background queue)
   - Type: analytics-track
   - Idempotency: analytics-{eventType}-{venueId}-{userId}-{timestamp}
   - Status: STUB (simulateAnalyticsProcessing)

Code: src/workers/base.worker.ts
      src/workers/money/*.processor.ts
      src/workers/communication/*.processor.ts
      src/workers/background/*.processor.ts
```

**Why it matters:**
- Consistent job processing pattern
- Built-in timing and logging
- Error handling standardized

**Issues Found:**
- ❌ All processors are STUBS (not implemented)
- ❌ No actual Stripe integration
- ❌ No actual SendGrid integration
- ❌ No actual NFT minting
- ⚠️ Simulate random failures for testing (should be removed in prod)

### 8. Event Handlers ✅

**Implementation:**
```typescript
// Queue event handlers (per queue)

queue.on('completed', (job, result) => {
  logger.info('Job completed', {
    jobId: job.id,
    jobName: job.name,
    duration: Date.now() - job.timestamp
  });
  
  // Update Prometheus metrics
  monitoring.recordJobSuccess(queueName, jobName, duration);
  
  // Mark as complete in persistence layer
  persistence.markComplete(job.id, result);
});

queue.on('failed', (job, error) => {
  logger.error('Job failed', {
    jobId: job.id,
    jobName: job.name,
    error: error.message,
    attempts: job.attemptsMade
  });
  
  // Update Prometheus metrics
  monitoring.recordJobFailure(queueName, jobName, error);
  
  // Mark as failed in persistence layer
  persistence.markFailed(job.id, error);
});

queue.on('stalled', (job) => {
  logger.warn('Job stalled', {
    jobId: job.id,
    jobName: job.name
  });
  
  // Stalled jobs are automatically retried by Bull
});

Code: src/queues/factories/queue.factory.ts (setupEventHandlers)
```

**Why it matters:**
- Centralized event handling
- Consistent logging across queues
- Metrics collection automatic
- Persistence updates automatic

### 9. State Management ❌

**Current Implementation:**
- No state machine defined
- Job states managed by Bull (pending, active, completed, failed, delayed)
- No validation of state transitions

**Missing:**
- payment_state_machine table (like payment-service)
- validate_state_transition() function
- Custom state transitions

**Impact:**
- Cannot enforce business rules on state changes
- No audit trail of state transitions
- Cannot prevent invalid state changes

### 10. Retry Strategies ✅

**Implementation:**
```typescript
// Per-queue retry configuration

Money Queue (CRITICAL):
- Attempts: 10
- Backoff: exponential, 2s base, 2x factor
- Example: 2s → 4s → 8s → 16s → 32s → 64s → ...
- RemoveOnComplete: false (keep for audit)
- RemoveOnFail: false (debug failures)

Communication Queue (IMPORTANT):
- Attempts: 3
- Backoff: fixed, 5s delay
- Example: 5s → 5s → 5s
- RemoveOnComplete: 100 (keep last 100)
- RemoveOnFail: false

Background Queue (EPHEMERAL):
- Attempts: 2
- Backoff: fixed, 10s delay
- RemoveOnComplete: true (delete immediately)
- RemoveOnFail: true (don't clutter)

Per-Job-Type Strategies (NOT USED):
- Defined in retry-strategies.config.ts
- Includes: payment, email, webhook, minting, default
- NOT actually used by queue processors

Code: src/config/queues.config.ts (QUEUE_CONFIGS)
      src/config/retry-strategies.config.ts (NOT USED)
```

**Why it matters:**
- Critical jobs retry more aggressively
- Exponential backoff prevents thundering herd
- Fixed backoff for transient failures
- Completed job retention configurable

**Issues Found:**
- ⚠️ retry-strategies.config.ts exists but NOT used
- ⚠️ calculateBackoff() function exists but NOT called
- ⚠️ Job-type-specific retry strategies ignored

---

## JOB TYPES & DATA CONTRACTS

### Money Queue Jobs

#### **1. PAYMENT_PROCESS**
```typescript
Type: 'payment-process'
Priority: CRITICAL (10)
Attempts: 10
Backoff: exponential (2s base)

Input Data:
{
  userId: string (UUID)
  venueId: string (UUID)
  eventId: string (UUID)
  amount: number (cents)
  currency: string (default 'USD')
  paymentMethod: string (Stripe payment method ID)
  deviceFingerprint?: string
  metadata?: any
}

Output Result:
{
  success: boolean
  data?: {
    transactionId: string
    chargeId: string
    amount: number
    status: 'completed'
    processedAt: string (ISO timestamp)
  }
  error?: string
}

Idempotency Key:
payment-{venueId}-{userId}-{eventId}-{amount}

Retention: 90 days
```

#### **2. REFUND_PROCESS**
```typescript
Type: 'refund-process'
Priority: CRITICAL (10)
Attempts: 10

Input Data:
{
  transactionId: string (UUID)
  amount: number (cents)
  reason: string
  userId: string (UUID)
  venueId: string (UUID)
}

Output Result:
{
  success: boolean
  data?: {
    refundId: string
    transactionId: string
    amount: number
    status: 'completed'
    processedAt: string
  }
  error?: string
}

Idempotency Key:
refund-{transactionId}

Retention: 90 days
```

#### **3. PAYOUT_PROCESS**
```typescript
Type: 'payout-process'
Priority: CRITICAL (10)
Defined: Yes (in constants)
Processor: NOT IMPLEMENTED

Expected Data:
{
  venueId: string
  amount: number
  bankAccountId: string
  type: 'instant' | 'standard'
}
```

#### **4. NFT_MINT**
```typescript
Type: 'nft-mint'
Priority: HIGH (7)
Attempts: 10

Input Data:
{
  eventId: string (UUID)
  ticketId: string (UUID)
  seatId?: string
  userId: string (UUID)
  venueId: string (UUID)
  metadata: any (NFT attributes)
}

Output Result:
{
  success: boolean
  data?: {
    mintAddress: string
    transactionSignature: string
    ticketId: string
    metadata: any
    mintedAt: string
  }
  error?: string
}

Idempotency Key:
nft-{eventId}-{seatId || ticketId}

Retention: 365 days (longest retention)
```

### Communication Queue Jobs

#### **5. SEND_EMAIL**
```typescript
Type: 'send-email'
Priority: NORMAL (5)
Attempts: 3
Backoff: fixed (5s)

Input Data:
{
  to: string (email address)
  template: string (template ID)
  data: Record<string, any> (template variables)
  subject?: string
  from?: string
}

Output Result:
{
  success: boolean
  data?: {
    messageId: string
    to: string
    template: string
    sentAt: string
  }
  error?: string
}

Idempotency Key:
email-{template}-{to}-{date}
(Daily uniqueness - prevents duplicate daily emails)

Retention: 7 days
```

#### **6. SEND_SMS**
```typescript
Type: 'send-sms'
Priority: NORMAL (5)
Defined: Yes (in constants)
Processor: NOT IMPLEMENTED

Expected Data:
{
  to: string (phone number)
  message: string
  from?: string
}

Idempotency Key:
sms-{to}-{template}-{hour}
(Hourly uniqueness)
```

#### **7. SEND_PUSH**
```typescript
Type: 'send-push'
Priority: NORMAL (5)
Defined: Yes (in constants)
Processor: NOT IMPLEMENTED

Expected Data:
{
  userId: string
  title: string
  body: string
  data?: any
}
```

### Background Queue Jobs

#### **8. ANALYTICS_TRACK**
```typescript
Type: 'analytics-track'
Priority: LOW (3)
Attempts: 2
Backoff: fixed (10s)

Input Data:
{
  eventType: string
  venueId?: string
  userId?: string
  eventId?: string
  data: Record<string, any>
  timestamp: string (ISO)
}

Output Result:
{
  success: boolean
  data?: {
    eventType: string
    processedAt: string
  }
  error?: string
}

Idempotency Key:
analytics-{eventType}-{venueId || 'global'}-{userId || 'anonymous'}-{timestamp}

Retention: 7 days
```

#### **9. CLEANUP_OLD_DATA**
```typescript
Type: 'cleanup-old-data'
Priority: BACKGROUND (1)
Defined: Yes (in constants)
Processor: NOT IMPLEMENTED

Expected Data:
{
  dataType: string ('sessions' | 'temp_files' | 'old_logs')
  olderThan: string (ISO timestamp)
}
```

#### **10. GENERATE_REPORT**
```typescript
Type: 'generate-report'
Priority: LOW (3)
Defined: Yes (in constants)
Processor: NOT IMPLEMENTED

Expected Data:
{
  reportType: string
  venueId?: string
  startDate: string
  endDate: string
  format: 'pdf' | 'csv' | 'json'
}
```

---

## RATE LIMIT CONFIGURATION

### Provider Limits

```typescript
// All configured in src/config/rate-limits.config.ts

Stripe (Primary Payment Provider):
- maxPerSecond: 25 (configurable via RATE_LIMIT_STRIPE env)
- maxConcurrent: 10
- burstSize: 50
- cooldownMs: 1000
- Group: [stripe-charges, stripe-refunds, stripe-payouts]

Square (Secondary Payment Provider):
- maxPerSecond: 8
- maxConcurrent: 5
- burstSize: 20
- cooldownMs: 2000

SendGrid (Email Provider):
- maxPerSecond: 5 (configurable via RATE_LIMIT_SENDGRID env)
- maxConcurrent: 20
- burstSize: 100
- cooldownMs: 1000
- Group: [sendgrid-transactional, sendgrid-marketing]

Twilio (SMS/Voice Provider):
- maxPerSecond: 1 (configurable via RATE_LIMIT_TWILIO env)
- maxConcurrent: 5
- burstSize: 10
- cooldownMs: 5000
- Group: [twilio-sms, twilio-voice, twilio-verify]

Solana (Blockchain RPC):
- maxPerSecond: 10 (configurable via RATE_LIMIT_SOLANA env)
- maxConcurrent: 5
- burstSize: 30
- cooldownMs: 1000

QuickBooks (Accounting Integration):
- maxPerSecond: 2
- maxConcurrent: 3
- burstSize: 10
- cooldownMs: 3000

Internal APIs (Service-to-Service):
- maxPerSecond: 100
- maxConcurrent: 50
- burstSize: 200
- cooldownMs: 100
```

### Rate Limit Groups

Rate limits are shared across related services:

```typescript
twilio:
  - twilio-sms
  - twilio-voice
  - twilio-verify
  (All share the same 1/sec limit)

stripe:
  - stripe-charges
  - stripe-refunds
  - stripe-payouts
  (All share the same 25/sec limit)

sendgrid:
  - sendgrid-transactional
  - sendgrid-marketing
  (All share the same 5/sec limit)
```

### Token Bucket Algorithm

```typescript
// src/utils/token-bucket.ts

class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per second

  Refill Logic:
  - Calculates tokens to add based on time passed
  - tokens += (timePassed * refillRate)
  - Capped at maxTokens

  consume(n):
  - Refills bucket first
  - Checks if tokens >= n
  - If yes: tokens -= n, return true
  - If no: return false

  waitForTokens(n, maxWaitMs):
  - Polls every 100ms for tokens
  - Calculates msPerToken = 1000 / refillRate
  - Waits up to maxWaitMs
  - Returns true if acquired, false if timeout
}
```

**Example Flow (Stripe 25/sec):**
```
Initial: 50 tokens (burst)
Request 1: consume(1) → 49 tokens
Request 2: consume(1) → 48 tokens
...
Request 51: consume(1) → 0 tokens
Request 52: consume(1) → WAIT 40ms → 1 token → 0 tokens

Refill: +25 tokens per second
After 1 second: 25 tokens available
After 2 seconds: 50 tokens (capped at burst size)
```

---

## MONITORING CONFIGURATION

### Alert Thresholds

```typescript
// src/config/monitoring.config.ts

Money Queue (CRITICAL):
- queueDepth: 50 jobs (configurable via ALERT_THRESHOLD_MONEY_QUEUE)
- jobAgeMinutes: 10 min (configurable via ALERT_THRESHOLD_MONEY_AGE_MINUTES)
- failureCount: 10 failed jobs

Communication Queue (WARNING):
- queueDepth: 5000 jobs (configurable via ALERT_THRESHOLD_COMM_QUEUE)
- jobAgeMinutes: 30 min
- failureCount: 100 failed jobs

Background Queue (INFO):
- queueDepth: 50,000 jobs (configurable via ALERT_THRESHOLD_BACKGROUND_QUEUE)
- jobAgeMinutes: 120 min
- failureCount: 1000 failed jobs
```

### Alert Cooldowns

```typescript
Critical Alerts: 5 minutes
- Money queue depth exceeded
- Money queue job age exceeded
- Payment failures >10

Warning Alerts: 1 hour
- Communication queue depth exceeded
- High failure rate

Info Alerts: 24 hours
- Background queue issues
- General system info
```

### Check Intervals

```typescript
Health Check: 30 seconds (30000ms)
- Polls all queues
- Checks job counts
- Checks oldest job age
- Triggers alerts if thresholds breached
- Stores metrics in PostgreSQL

Metric Cleanup: 1 hour (3600000ms)
- Deletes old metrics from queue_metrics table
- Retention: 30 days
```

### Metric Retention

```typescript
Metrics: 30 days
- queue_metrics table
- Cleanup: DELETE WHERE captured_at < NOW() - INTERVAL '30 days'

Alerts: 7 days
- alert_history table
- Cleanup: DELETE WHERE created_at < NOW() - INTERVAL '7 days'

Job History: 90 days
- critical_jobs table (Tier 1 only)
- Cleanup: DELETE WHERE created_at < NOW() - INTERVAL '90 days'
- Exception: NFT mints kept 365 days
```

### Alert Escalation

```typescript
1. Log Alert (ALWAYS)
   - Winston logger.error()
   - Includes full context
   - Searchable logs

2. Store in Database (ALWAYS)
   - INSERT INTO alert_history
   - Acknowledged tracking
   - Historical analysis

3. Send SMS (CRITICAL only)
   - Twilio messages.create()
   - On-call engineer phone
   - Alert message + context

4. Phone Call (MONEY QUEUE CRITICAL only)
   - Twilio calls.create()
   - Only for payment failures
   - Wakes up on-call engineer

Example Critical Alert:
"🚨 CRITICAL Queue Alert:
Money queue has 75 jobs waiting!
Check immediately!"

Example Warning Alert:
"⚠️ Queue Warning:
Communication queue has 6000 jobs waiting"
```

---

## SECURITY

### 1. Authentication

```typescript
// JWT verification (RS256)
// Code: src/middleware/auth.middleware.ts

Middleware: authenticate
- Extracts token from Authorization: Bearer <token>
- Verifies signature using JWT_SECRET
- Decodes user claims: { id, role, venues }
- Attaches req.user
- Returns 401 if invalid

No shared package used (unlike payment-service)
Uses jsonwebtoken library directly
```

### 2. Authorization

```typescript
// Role-based access control
// Code: src/middleware/auth.middleware.ts

Middleware: authorize(...roles)
- Checks req.user.role against allowed roles
- Returns 403 if insufficient permissions

Roles:
- admin: Full access (all endpoints)
- venue_admin: Venue-specific admin (limited)
- user: Basic access (own jobs only)
- monitoring: Read-only metrics access

Protected Actions:
- Pause/Resume Queue: admin only
- Clear Queue: admin only
- Retry Job: admin or venue_admin
- Cancel Job: admin or venue_admin
- Emergency Stop: admin only
- Test Alerts: admin only
```

### 3. Request Validation

```typescript
// Joi schemas
// Code: src/controllers/job.controller.ts

addJobSchema:
- queue: required, enum [money, communication, background]
- type: required, string
- data: required, object
- options: optional {
    priority: 1-10,
    delay: >= 0,
    attempts: 1-10
  }

batchJobSchema (per job):
- type: required, string
- data: required, object
- options: optional (same as above)

addBatchJobsSchema:
- queue: required, enum
- jobs: required, array, 1-100 items
- options: optional {
    stopOnError: boolean,
    validateAll: boolean
  }

Validation happens in validateBody() middleware
Returns 400 with detailed errors if validation fails
```

### 4. Data Sanitization

```typescript
// XSS and SQL injection prevention
// Code: src/controllers/job.controller.ts

sanitizeJobData(data):
1. Skip dangerous keys:
   - Keys starting with '__'
   - Keys containing 'prototype'
   
2. Recursively sanitize nested objects

3. String sanitization:
   - Remove <script> tags
   - Remove SQL keywords (SELECT, INSERT, UPDATE, DELETE, DROP, UNION)
   
4. Return sanitized copy

Applied to ALL batch job data before queuing
```

### 5. Rate Limiting (API Level)

```typescript
// Middleware rate limiting
// Code: src/middleware/rate-limiter.ts

rateLimitMiddleware(options):
- service: 'internal' (default)
- maxRequests: configurable
- windowMs: configurable
- message: custom error message

Implementation:
- Uses RateLimiterService.isRateLimited()
- Sets X-RateLimit-* headers
- Returns 429 if exceeded
- Includes Retry-After header

Global Rate Limit:
- 100 req/min (all endpoints)

Endpoint-Specific:
- /jobs: 60 req/min
- /queues: 60 req/min
- /metrics: 100 req/min
```

### 6. Idempotency Protection

```typescript
// Prevents duplicate job execution
// Code: src/services/idempotency.service.ts

No HTTP-level idempotency middleware (like payment-service)
Idempotency handled at job processing level

Process:
1. Generate key from job type + data
2. Check if already processed
3. Return cached result if duplicate
4. Store result after processing

Storage:
- Redis: Fast lookup (1hr TTL)
- PostgreSQL: Persistent (90 days)

Keys are NOT exposed to API clients
Keys generated internally from job data
```

### 7. Logging & Audit Trail

```typescript
// Winston structured logging
// Code: src/utils/logger.ts, src/middleware/logging.middleware.ts

Log Levels:
- Production: info
- Development: debug

Middleware Logging:
- Request: method, path, query, IP
- Response: status code, duration

Action Logging:
- Queue paused/resumed: User ID logged
- Job retried/cancelled: User ID logged
- Alert acknowledged: User ID logged
- Rate limit reset: User ID logged
- Emergency stop: User ID logged

Format: JSON
Fields: timestamp, level, message, context

No PII sanitization implemented (⚠️ Issue)
```

---

## ERROR HANDLING

### Error Classes

```typescript
// Code: src/utils/errors.ts

class AppError extends Error {
  statusCode: number
  code: string (optional)
  isOperational: boolean (default true)
}

Usage:
throw new AppError('Queue not found', 404)
throw new AppError('Invalid job data', 400, 'VALIDATION_ERROR')

Operational vs Non-Operational:
- Operational: Expected errors (validation, not found, etc)
- Non-Operational: Bugs, programmer errors
```

### Error Middleware

```typescript
// Code: src/middleware/error.middleware.ts

errorMiddleware(error, req, res, next):
1. Log error with Winston (includes stack trace)
2. If AppError: Use statusCode + message
3. If other Error: 500 Internal Server Error
4. In development: Include error message
5. In production: Hide internal errors

Response Format:
{
  "error": "Validation failed",
  "code": "VALIDATION_ERROR"
}
```

### Common Error Scenarios

```typescript
1. Queue Not Initialized
   - Cause: QueueFactory.getQueue() called before initialize()
   - Error: "Queue not initialized: money"
   - Fix: Ensure QueueFactory.initialize() called at startup

2. Database Connection Failed
   - Cause: PostgreSQL not running
   - Error: "Database not initialized"
   - Fix: Start PostgreSQL, check DATABASE_URL

3. Redis Connection Failed
   - Cause: Redis not running
   - Error: "Redis not initialized"
   - Fix: Start Redis, check REDIS_HOST/PORT

4. Job Not Found
   - Cause: Invalid job ID or job deleted
   - Error: 404 "Job not found"
   - Fix: Check job ID, verify queue name

5. Rate Limit Timeout
   - Cause: Too many concurrent requests to external API
   - Error: "Rate limit timeout for {service}"
   - Fix: Wait for rate limit to reset, check burst size

6. Validation Failed
   - Cause: Invalid request body
   - Error: 400 with Joi validation details
   - Fix: Check request format against schema

7. Authentication Failed
   - Cause: Missing/invalid JWT
   - Error: 401 "Invalid token"
   - Fix: Include valid Bearer token

8. Authorization Failed
   - Cause: Insufficient permissions
   - Error: 403 "Insufficient permissions"
   - Fix: User needs admin or venue_admin role
```

---

## ASYNC PROCESSING

### Bull Queue Architecture

```typescript
// Redis-backed job queue
// Uses Bull library (built on ioredis)

Queue Structure:
money-queue (Redis DB 1):
  - Waiting jobs: Sorted set by priority + timestamp
  - Active jobs: Sorted set by processing timestamp
  - Completed jobs: Sorted set by completion timestamp
  - Failed jobs: Sorted set by failure timestamp
  - Delayed jobs: Sorted set by delay timestamp

communication-queue (Redis DB 2):
  - Same structure as money-queue

background-queue (Redis DB 3):
  - Same structure as money-queue

Each job stored as hash:
bull:{queue}:jobs:{jobId} = {
  data: JSON,
  opts: JSON,
  progress: number,
  returnvalue: JSON (result),
  stacktrace: array (errors),
  attemptsMade: number,
  ...
}
```

### Job Lifecycle

```typescript
1. Job Added
   - POST /api/v1/queue/jobs
   - Job enters 'waiting' state
   - Placed in Redis sorted set
   - If Tier 1: INSERT into PostgreSQL
   - Event: 'waiting' emitted

2. Job Picked Up
   - Worker polls queue
   - Job moves to 'active' state
   - If Tier 1: UPDATE status='processing'
   - Event: 'active' emitted
   - Worker calls processor function

3. Job Processing
   - execute() method runs
   - Can update progress: job.progress(50)
   - Event: 'progress' emitted

4. Job Completed
   - execute() returns result
   - Job moves to 'completed' state
   - Result stored in job hash
   - If Tier 1: UPDATE status='completed'
   - Event: 'completed' emitted
   - Persistence: markComplete() called
   - Metrics: recordJobSuccess() called
   - Job removed based on removeOnComplete setting

5. Job Failed
   - execute() throws error
   - Job moves to 'failed' state
   - Error stored in job hash
   - Attempts incremented
   - If attempts < max: Job retried with backoff
   - If attempts >= max: Job moves to 'failed' permanently
   - If Tier 1: UPDATE status='failed'
   - Event: 'failed' emitted
   - Persistence: markFailed() called
   - Metrics: recordJobFailure() called

6. Job Stalled
   - Worker crashed or job taking too long
   - Bull detects stalled jobs (stalledInterval)
   - Job moved back to 'waiting'
   - Event: 'stalled' emitted
   - Automatically retried

State Transitions:
waiting → active → completed
waiting → active → failed → waiting (retry)
active → stalled → waiting (auto-recovery)
```

### Worker Concurrency

```typescript
// Per-queue worker configuration
// Code: src/config/workers.config.ts (defined but NOT used)

WORKER_CONFIGS (NOT IMPLEMENTED):
payment.process: concurrency=5, stalled=30s
payment.retry: concurrency=3, stalled=60s
order.fulfill: concurrency=10, stalled=30s
ticket.mint: concurrency=3, stalled=120s
email.send: concurrency=20, stalled=15s
webhook.process: concurrency=10, stalled=30s

ACTUAL IMPLEMENTATION:
- Bull default concurrency (1 job at a time per processor)
- No explicit worker configuration applied
- Worker configs defined but getWorkerConfig() never called

⚠️ Issue: Worker configs exist but not used
```

### Job Processors

```typescript
// How jobs are processed
// Code: src/queues/definitions/*.queue.ts

MoneyQueue Setup:
this.queue.process(JOB_TYPES.PAYMENT_PROCESS, async (job) => {
  return await this.paymentProcessor.process(job);
});

this.queue.process(JOB_TYPES.REFUND_PROCESS, async (job) => {
  return await this.refundProcessor.process(job);
});

this.queue.process(JOB_TYPES.NFT_MINT, async (job) => {
  return await this.nftMintProcessor.process(job);
});

Pattern:
- queue.process(jobType, processorFunction)
- One processor per job type
- Processors are class instances
- BaseWorker provides common functionality

Processor Execution:
1. BaseWorker.process(job) called
2. Logs start with timestamp
3. Calls child execute(job)
4. Logs completion with duration
5. Returns result
6. Catches and logs errors
```

### Background Services

```typescript
// Services that run continuously

1. MonitoringService (30s interval)
   - Checks queue health
   - Checks job age
   - Triggers alerts
   - Stores metrics
   - Started in index.ts: monitoringService.start()

2. RecoveryService (startup only)
   - Runs once on service start
   - Queries PostgreSQL for pending jobs
   - Re-adds to queues
   - Started in index.ts: recoveryService.recoverPendingJobs()

3. Outbox Processor (NOT IMPLEMENTED)
   - Mentioned in architecture but no code exists
   - Would publish events to other services
   - Would be similar to payment-service outbox

4. Cron Jobs (NOT IMPLEMENTED)
   - Mentioned in ScheduleModel but no cron setup
   - Would handle scheduled tasks:
     - Cleanup old data
     - Generate reports
     - Reconciliation
```

---

## DATABASE QUERIES

### Critical Queries

#### 1. Recover Pending Jobs (Startup)
```sql
-- Code: src/services/recovery.service.ts

SELECT * FROM critical_jobs
WHERE status IN ('pending', 'processing')
  AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY priority DESC, created_at ASC;

Purpose: Recover jobs after service restart
Frequency: Once at startup
Impact: Critical for Tier 1 job recovery
Index: status, created_at
```

#### 2. Store Metrics
```sql
-- Code: src/services/monitoring.service.ts

INSERT INTO queue_metrics
  (queue_name, waiting_count, active_count, completed_count, failed_count, captured_at)
VALUES ($1, $2, $3, $4, $5, NOW());

Purpose: Time-series metrics for dashboards
Frequency: Every 30 seconds per queue (3 queues = 6/min)
Impact: High insert volume
Index: queue_name + captured_at
Retention: 30 days (needs cleanup cron)
```

#### 3. Store Alert
```sql
-- Code: src/services/monitoring.service.ts

INSERT INTO alert_history
  (severity, alert_type, message, queue_name, metric_value, threshold_value, created_at)
VALUES ($1, $2, $3, $4, $5, $6, NOW());

Purpose: Alert audit trail
Frequency: As needed (low volume)
Impact: Low
Index: severity + created_at
```

#### 4. Get Recent Metrics
```sql
-- Code: src/controllers/metrics.controller.ts

SELECT
  queue_name,
  AVG(waiting_count) as avg_waiting,
  MAX(waiting_count) as max_waiting,
  AVG(active_count) as avg_active,
  AVG(failed_count) as avg_failed
FROM queue_metrics
WHERE captured_at > NOW() - INTERVAL '1 hour'
GROUP BY queue_name;

Purpose: Metrics summary API
Frequency: On-demand (API calls)
Impact: Read-heavy, needs index
Index: captured_at
```

#### 5. Get Throughput
```sql
-- Code: src/controllers/metrics.controller.ts

SELECT
  queue_name,
  DATE_TRUNC('minute', captured_at) as minute,
  MAX(completed_count) - MIN(completed_count) as jobs_per_minute
FROM queue_metrics
WHERE captured_at > NOW() - INTERVAL '1 hour'
GROUP BY queue_name, minute
ORDER BY minute DESC;

Purpose: Calculate jobs/min throughput
Frequency: On-demand (API calls)
Impact: Complex aggregation
Optimization: Needs materialized view for large datasets
```

#### 6. Get Recent Alerts
```sql
-- Code: src/controllers/alerts.controller.ts

SELECT * FROM alert_history
WHERE created_at > NOW() - INTERVAL '24 hours'
  [AND severity = $1]
ORDER BY created_at DESC
LIMIT $2;

Purpose: View recent alerts
Frequency: On-demand (API calls)
Impact: Read-only, low volume
Index: severity + created_at
```

#### 7. Acknowledge Alert
```sql
-- Code: src/controllers/alerts.controller.ts

UPDATE alert_history
SET acknowledged = true,
    acknowledged_by = $1,
    acknowledged_at = NOW()
WHERE id = $2;

Purpose: Mark alert as acknowledged
Frequency: On-demand (manual action)
Impact: Single row update
```

#### 8. Check Idempotency
```sql
-- Code: src/services/idempotency.service.ts

SELECT result FROM idempotency_keys
WHERE key = $1
  AND expires_at > NOW();

Purpose: Check if job already processed
Frequency: Every job execution (high volume)
Impact: Critical path query (must be fast)
Index: key (primary key)
Optimization: Redis cache checked first
```

#### 9. Store Idempotency Result
```sql
-- Code: src/services/idempotency.service.ts

INSERT INTO idempotency_keys
  (key, queue_name, job_type, result, processed_at, expires_at)
VALUES ($1, $2, $3, $4, NOW(), $5)
ON CONFLICT (key) DO UPDATE
SET result = $4, processed_at = NOW();

Purpose: Store job result for idempotency
Frequency: Every completed job (high volume)
Impact: High insert volume
Retention: Varies by job type (7-365 days)
Needs: Cleanup cron for expired keys
```

#### 10. Cleanup Expired Idempotency Keys
```sql
-- NOT IMPLEMENTED (needs cron)

DELETE FROM idempotency_keys
WHERE expires_at < NOW();

Purpose: Remove expired idempotency keys
Frequency: Should run daily
Impact: Prevents table bloat
Status: ❌ Missing
```

### Performance Considerations

```typescript
1. Missing Indexes:
   - rate_limit_metrics: No indexes defined
   - Consider: (service_name, captured_at)

2. Missing Cleanup Crons:
   - queue_metrics: 30 day retention, no cleanup
   - alert_history: 7 day retention, no cleanup
   - idempotency_keys: Expires_at cleanup missing
   - critical_jobs: 90 day retention, no cleanup

3. High-Volume Tables:
   - queue_metrics: 6 inserts/min = 8640/day = 259k/month
   - Needs partitioning for long-term
   - Consider time-series database (TimescaleDB)

4. Connection Pooling:
   - Pool size: max 10 connections
   - Idle timeout: 30 seconds
   - May need tuning for high load

5. Query Optimization:
   - Throughput query uses DATE_TRUNC + aggregation
   - Consider pre-aggregated materialized view
   - Refresh every minute via cron
```

---

## TESTING

### Test Structure

```typescript
// Code: tests/

tests/
├── setup.ts (test environment config)
├── endpoints/
│   └── payment-endpoints.test.ts (NOT IMPLEMENTED)
├── fixtures/
│   └── payments.ts (mock data)
├── integration/
│   └── payment-idempotency.test.ts (NOT IMPLEMENTED)
└── load/
    └── retry-storm.test.ts (NOT IMPLEMENTED)

Jest Configuration:
- preset: 'ts-jest'
- testEnvironment: 'node'
- roots: ['<rootDir>/tests']
- testMatch: ['**/*.test.ts']
- setupFiles: ['<rootDir>/tests/setup.ts']
```

### Test Setup

```typescript
// Code: tests/setup.ts

Environment Variables:
- NODE_ENV=test
- JWT_SECRET=test-secret
- SERVICE_NAME=queue-service
- PORT=3011
- REDIS_URL=redis://localhost:6379

Mocks:
1. Bull Queue (mockQueue):
   - add: jest.fn().mockResolvedValue({ id: 'job-123' })
   - getJob: jest.fn()
   - getJobs: jest.fn().mockResolvedValue([])
   - pause/resume/clean/obliterate: jest.fn()
   - getJobCounts: jest.fn().mockResolvedValue({ waiting: 0, ... })
   - process/on/removeAllListeners/close: jest.fn()

2. Redis (ioredis):
   - ping: jest.fn().mockResolvedValue('PONG')
   - get/set/del: jest.fn()
   - keys: jest.fn().mockResolvedValue([])
   - quit: jest.fn()

3. Logger:
   - info/error/warn/debug: jest.fn()
```

### Test Fixtures

```typescript
// Code: tests/fixtures/payments.ts

mockJob:
{
  id: 'job-123',
  queue: 'money',
  type: 'payment-processing',
  data: {
    orderId: 'order-456',
    amount: 100,
    currency: 'USD'
  },
  status: 'pending',
  priority: 1,
  attempts: 0,
  createdAt: '2024-01-15T10:00:00Z'
}

mockQueueStatus:
{
  name: 'money',
  waiting: 5,
  active: 2,
  completed: 100,
  failed: 3,
  delayed: 1,
  paused: false
}

mockMetrics:
{
  queues: {
    money: { processed: 100, failed: 3, avgProcessTime: 1200 },
    communication: { processed: 250, failed: 5, avgProcessTime: 500 },
    background: { processed: 50, failed: 1, avgProcessTime: 3000 }
  },
  throughput: {
    last1h: 150,
    last24h: 3500,
    last7d: 25000
  }
}

mockAlert:
{
  id: 'alert-123',
  type: 'queue-threshold',
  severity: 'warning',
  message: 'Money queue has 100+ pending jobs',
  timestamp: '2024-01-15T10:00:00Z',
  acknowledged: false
}
```

### Test Coverage

```typescript
Current Status: ❌ MINIMAL

Existing Tests:
- None implemented (test files exist but empty)

Required Test Coverage:

1. Unit Tests:
   ├── Services
   │   ├── IdempotencyService
   │   ├── RateLimiterService
   │   ├── PersistenceService
   │   ├── MonitoringService
   │   └── RecoveryService
   ├── Workers
   │   ├── PaymentProcessor
   │   ├── RefundProcessor
   │   ├── NFTMintProcessor
   │   ├── EmailProcessor
   │   └── AnalyticsProcessor
   ├── Controllers
   │   ├── JobController
   │   ├── QueueController
   │   ├── MetricsController
   │   ├── AlertsController
   │   └── RateLimitController
   └── Utils
       ├── TokenBucket
       └── Money helpers

2. Integration Tests:
   ├── Queue lifecycle (add → process → complete)
   ├── Idempotency (duplicate prevention)
   ├── Rate limiting (token bucket behavior)
   ├── Job recovery (restart scenarios)
   ├── Alert triggering (threshold breach)
   └── API endpoints (full flow)

3. Load Tests:
   ├── Concurrent job submissions
   ├── Rate limit stress testing
   ├── Queue depth stress testing
   └── Recovery performance

4. E2E Tests:
   ├── Payment processing flow
   ├── NFT minting flow
   ├── Email delivery flow
   └── Multi-queue scenarios

Target Coverage: 80% (branches, functions, lines, statements)
Current Coverage: ~0%
```

### Running Tests

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage

# Specific test file
npm test -- queue.test.ts

# Verbose output
npm test -- --verbose
```

---

## DEPLOYMENT

### Environment Variables

```bash
# Service Configuration
SERVICE_NAME=queue-service
NODE_ENV=production
PORT=3020  # ⚠️ Inconsistent with config (3004)

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/tickettoken_db
DB_HOST=postgres
DB_PORT=5432
DB_NAME=tickettoken_db
DB_USER=postgres
DB_PASSWORD=<secret>

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=<secret>

# Authentication
JWT_SECRET=<256-bit-secret>

# Rate Limits (Optional - defaults in code)
RATE_LIMIT_STRIPE=25
RATE_LIMIT_SENDGRID=5
RATE_LIMIT_TWILIO=1
RATE_LIMIT_SOLANA=10

# Alert Thresholds (Optional)
ALERT_THRESHOLD_MONEY_QUEUE=50
ALERT_THRESHOLD_MONEY_AGE_MINUTES=10
ALERT_THRESHOLD_COMM_QUEUE=5000
ALERT_THRESHOLD_BACKGROUND_QUEUE=50000

# Twilio (Optional - for alerts)
TWILIO_ACCOUNT_SID=<account-sid>
TWILIO_AUTH_TOKEN=<auth-token>
TWILIO_PHONE=<from-number>
ONCALL_PHONE=<oncall-number>

# External Services (Optional - for job processors)
STRIPE_SECRET_KEY=sk_...
SENDGRID_API_KEY=SG...
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
POLYGON_RPC_URL=https://polygon-rpc.com
```

### Docker Configuration

```dockerfile
# Code: Dockerfile

FROM node:20-alpine AS builder

WORKDIR /app

# Copy shared modules first
COPY tsconfig.base.json ./tsconfig.base.json
COPY backend/shared ./backend/shared
COPY backend/services/queue-service ./backend/services/queue-service

# Build shared modules
WORKDIR /app/backend/shared
RUN npm install

WORKDIR /app/backend/shared/cache
RUN npm install

# Build queue-service
WORKDIR /app/backend/services/queue-service
RUN npm install
RUN npm install --save-dev @types/uuid
RUN npm run build

# Production image
FROM node:20-alpine

WORKDIR /app

# Install dumb-init (proper signal handling)
RUN apk add --no-cache dumb-init

# Copy built artifacts
COPY --from=builder /app/backend/shared /app/backend/shared
COPY --from=builder /app/backend/services/queue-service /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

USER nodejs

EXPOSE 3011  # ⚠️ Another port inconsistency

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
```

### Docker Compose

```yaml
version: '3.8'

services:
  queue-service:
    build:
      context: .
      dockerfile: backend/services/queue-service/Dockerfile
    ports:
      - "3020:3020"  # Or 3004? Or 3011? Fix this!
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:postgres@postgres:5432/tickettoken_db
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - JWT_SECRET=${JWT_SECRET}
    depends_on:
      - postgres
      - redis
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:3020/api/v1/queue/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=tickettoken_db
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"

volumes:
  postgres_data:
  redis_data:
```

### Kubernetes Configuration

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: queue-service
  namespace: tickettoken
spec:
  replicas: 3  # ⚠️ Careful with multiple replicas + Bull
  selector:
    matchLabels:
      app: queue-service
  template:
    metadata:
      labels:
        app: queue-service
    spec:
      containers:
      - name: queue-service
        image: tickettoken/queue-service:latest
        ports:
        - containerPort: 3020
        env:
        - name: NODE_ENV
          value: "production"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: queue-secrets
              key: database-url
        - name: REDIS_HOST
          value: "redis-service"
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: queue-secrets
              key: jwt-secret
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /api/v1/queue/health
            port: 3020
          initialDelaySeconds: 30
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /api/v1/queue/health/ready
            port: 3020
          initialDelaySeconds: 10
          periodSeconds: 10

---
apiVersion: v1
kind: Service
metadata:
  name: queue-service
  namespace: tickettoken
spec:
  selector:
    app: queue-service
  ports:
  - port: 3020
    targetPort: 3020
  type: ClusterIP
```

### Startup Sequence

```typescript
// Code: src/index.ts

async function startService() {
  1. Load environment variables
     - dotenv.config()
     - Check critical vars (DATABASE_URL, REDIS_HOST)
  
  2. Connect to databases
     - await connectDatabase() (PostgreSQL)
     - await connectRedis()
  
  3. Initialize queues
     - await QueueFactory.initialize()
     - Creates money, communication, background queues
     - Sets up persistence handlers
     - Sets up event handlers
  
  4. Initialize queue definitions
     - new MoneyQueue()
     - new CommunicationQueue()
     - new BackgroundQueue()
     - Registers job processors
  
  5. Recover pending jobs
     - new RecoveryService()
     - await recoveryService.recoverPendingJobs()
     - Re-adds jobs from PostgreSQL
  
  6. Start monitoring
     - MonitoringService.getInstance()
     - await monitoringService.start()
     - Begins 30s health checks
  
  7. Create Express app
     - const app = createApp()
     - Mounts all routes
     - Sets up middleware
  
  8. Start HTTP server
     - app.listen(PORT)
     - Ready to accept requests
  
  9. Setup graceful shutdown
     - process.on('SIGTERM')
     - process.on('SIGINT')
     - await QueueFactory.shutdown()
     - await monitoringService.stop()
     - process.exit(0)
}

Time to ready: ~5-10 seconds
```

### Health Checks

```typescript
Liveness Probe:
GET /api/v1/queue/health
- Returns 200 if service is running
- Returns 503 if any component unhealthy

Readiness Probe:
GET /api/v1/queue/health/ready
- Returns 200 if ready to accept traffic
- Checks: PostgreSQL, Redis connections
- Returns 503 if not ready

Kubernetes Configuration:
- livenessProbe: initialDelay=30s, period=30s
- readinessProbe: initialDelay=10s, period=10s
```

### Scaling Considerations

```typescript
⚠️ SCALING ISSUES:

1. Bull Queue + Multiple Replicas:
   - Bull uses Redis for coordination
   - Multiple replicas = multiple workers
   - Generally safe (Redis handles locking)
   - BUT: May cause race conditions in job recovery
   
2. Job Recovery Race Condition:
   - All replicas run recovery on startup
   - May re-add same job multiple times
   - Mitigated by idempotency
   - Better: Leader election for recovery
   
3. Monitoring Service:
   - All replicas run monitoring checks
   - Multiple alerts sent (3x if 3 replicas)
   - Better: Single monitoring instance
   - Or: Distributed locking for alerts
   
4. Rate Limiting:
   - RateLimiterService is per-instance
   - Each replica has own token bucket
   - Total rate = limit × replicas
   - Better: Redis-backed rate limiter
   
5. Connection Pool Limits:
   - Each replica has own PostgreSQL pool (max 10)
   - 3 replicas = 30 connections
   - Check PostgreSQL max_connections
   
Recommendation:
- Single replica for now (simplest)
- If scaling needed:
  1. Implement leader election
  2. Move rate limiter to Redis
  3. Coordinate monitoring across replicas
  4. Increase PostgreSQL connections
```

---

## MONITORING & OBSERVABILITY

### Prometheus Metrics

```typescript
// Code: src/services/monitoring.service.ts

Exported Metrics:

1. queue_depth (Gauge)
   - Labels: queue_name, status
   - Example: queue_depth{queue_name="money-queue",status="waiting"} 5
   - Updated: Every 30s

2. job_processing_duration_seconds (Histogram)
   - Labels: queue_name, job_type
   - Buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60]
   - Updated: On job completion

3. job_results_total (Counter)
   - Labels: queue_name, job_type, result
   - Values: success, failure
   - Updated: On job completion

4. alerts_sent_total (Counter)
   - Labels: severity, type, channel
   - Values: log, sms, phone
   - Updated: When alert sent

5. oldest_job_age_seconds (Gauge)
   - Labels: queue_name
   - Value: Age of oldest waiting job
   - Updated: Every 30s

6. failed_jobs_total (Gauge)
   - Labels: queue_name
   - Value: Current failed job count
   - Updated: Every 30s

Default Metrics (from prom-client):
- process_cpu_user_seconds_total
- process_cpu_system_seconds_total
- process_cpu_seconds_total
- process_start_time_seconds
- process_resident_memory_bytes
- nodejs_heap_size_total_bytes
- nodejs_heap_size_used_bytes
- nodejs_external_memory_bytes
- nodejs_heap_space_size_total_bytes
- nodejs_heap_space_size_used_bytes
- nodejs_heap_space_size_available_bytes
- nodejs_version_info
- nodejs_gc_duration_seconds

Scrape Endpoint:
GET /api/v1/queue/metrics/prometheus
```

### Grafana Dashboards

```json
Recommended Dashboards:

1. Queue Overview
   - Panel: Queue Depth (gauge)
     - Query: queue_depth{status="waiting"}
   - Panel: Active Jobs (gauge)
     - Query: queue_depth{status="active"}
   - Panel: Failed Jobs (gauge)
     - Query: failed_jobs_total
   - Panel: Throughput (graph)
     - Query: rate(job_results_total{result="success"}[5m])
   
2. Job Performance
   - Panel: Processing Duration (heatmap)
     - Query: job_processing_duration_seconds_bucket
   - Panel: Success Rate (gauge)
     - Query: rate(job_results_total{result="success"}[5m]) / 
              rate(job_results_total[5m])
   - Panel: Failure Rate (graph)
     - Query: rate(job_results_total{result="failure"}[5m])
   
3. Alerts
   - Panel: Alerts Sent (counter)
     - Query: alerts_sent_total
   - Panel: Alert History (table)
     - Query: PostgreSQL alert_history table
   - Panel: Critical Alerts (gauge)
     - Query: alerts_sent_total{severity="critical"}
   
4. System Health
   - Panel: CPU Usage (graph)
     - Query: rate(process_cpu_seconds_total[5m]) * 100
   - Panel: Memory Usage (graph)
     - Query: process_resident_memory_bytes / 1024 / 1024
   - Panel: Heap Usage (graph)
     - Query: nodejs_heap_size_used_bytes / nodejs_heap_size_total_bytes * 100
```

### Logging

```typescript
// Code: src/utils/logger.ts

Winston Configuration:
- Level: production=info, development=debug
- Format: JSON (structured)
- Transport: Console

Log Structure:
{
  "level": "info",
  "timestamp": "2025-01-15T10:00:00.000Z",
  "message": "Job completed in money queue",
  "jobId": "12345",
  "jobName": "payment-process",
  "duration": 2500
}

Log Middleware:
- Request: method, path, query, IP
- Response: status, duration

Action Logs:
- Job added: jobId, queue, type, userId
- Job completed: jobId, duration
- Job failed: jobId, error, attempts
- Queue paused: queue, userId
- Alert sent: severity, message, queue

⚠️ Issues:
- No log aggregation (ELK, Datadog, etc)
- No request ID tracking
- No distributed tracing
- No PII sanitization
- No log rotation (console only)
```

### Alerting Channels

```typescript
1. Logs (Always)
   - Winston logger.error()
   - Searchable if using log aggregation
   - Not actionable (requires monitoring logs)

2. Database (Always)
   - INSERT INTO alert_history
   - Queryable via API
   - Historical tracking
   - No real-time notification

3. SMS (Critical only)
   - Twilio messages.create()
   - Requires TWILIO_ACCOUNT_SID
   - Requires ONCALL_PHONE
   - Rate limited by cooldown

4. Phone (Money queue critical only)
   - Twilio calls.create()
   - Only for payment failures
   - Wakes up on-call engineer
   - Rate limited by cooldown

Missing Channels:
- Email (no SMTP configured)
- Slack (no webhook configured)
- PagerDuty (no integration)
- Webhook (no custom webhook support)
```

---

## TROUBLESHOOTING

### Common Issues

#### 1. "Queue not initialized: money"
```
Cause: QueueFactory.getQueue() called before initialize()
Location: Any controller or service trying to use queue

Fix:
1. Check index.ts startup sequence
2. Ensure QueueFactory.initialize() called
3. Ensure queues initialized before routes mounted
4. Check for race conditions

Debug:
- Add log before QueueFactory.initialize()
- Check for errors during initialization
- Verify Redis connection
```

#### 2. "Database not initialized"
```
Cause: getPool() called before connectDatabase()
Location: Persistence service, controllers

Fix:
1. Check DATABASE_URL environment variable
2. Ensure PostgreSQL is running
3. Check connectDatabase() completes successfully
4. Verify database permissions

Debug:
- Test connection: psql -h localhost -U postgres -d tickettoken_db
- Check logs for connection errors
- Verify pool configuration
```

#### 3. "Redis not initialized"
```
Cause: getRedisClient() called before connectRedis()
Location: Idempotency service, rate limiter

Fix:
1. Check REDIS_HOST and REDIS_PORT
2. Ensure Redis is running
3. Check connectRedis() completes successfully
4. Verify Redis auth (if password protected)

Debug:
- Test connection: redis-cli -h localhost -p 6379 PING
- Check logs for connection errors
- Try manual connection
```

#### 4. "Job stuck in 'processing' state"
```
Cause: Worker crashed during job processing
Location: Any queue

Fix:
1. Job will be marked 'stalled' by Bull
2. Bull automatically moves to 'waiting' for retry
3. Configure stalledInterval in worker config
4. Check worker error logs

Debug:
- Check job.stalledCount
- Look for worker crashes in logs
- Verify stalledInterval setting
- Check for long-running jobs
```

#### 5. "Rate limit timeout for stripe"
```
Cause: Too many concurrent Stripe API calls
Location: PaymentProcessor

Fix:
1. Check concurrent request limit (10 for Stripe)
2. Increase maxConcurrent if needed
3. Check for stuck acquire() calls
4. Verify release() called after API calls

Debug:
- GET /api/v1/queue/rate-limits/status/stripe
- Check tokensAvailable and concurrent values
- Look for acquire() without release()
- Check for deadlocks
```

#### 6. "Idempotency key already processed"
```
Cause: Duplicate job submission (expected behavior)
Location: IdempotencyService.check()

This is NOT an error - idempotency working correctly

Response:
- Returns cached result from previous execution
- Prevents duplicate processing
- Job not re-added to queue

Debug (if unexpected):
- Check idempotency key generation
- Verify job data uniqueness
- Check Redis/PostgreSQL for key
- Check key expiry
```

#### 7. "No alerts sent despite critical threshold"
```
Cause: Twilio not configured or cooldown active
Location: MonitoringService

Fix:
1. Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN
2. Check ONCALL_PHONE configured
3. Check alert cooldown (5 min for critical)
4. Verify Twilio account active

Debug:
- Check logs for "Twilio credentials not configured"
- GET /api/v1/queue/alerts (check alert_history)
- Check monitoring service started
- Test alert: POST /api/v1/queue/alerts/test
```

#### 8. "Jobs not recovered after restart"
```
Cause: Multiple possible issues
Location: RecoveryService

Fix:
1. Check critical_jobs table has pending jobs
2. Verify jobs created within last 24 hours
3. Check queue names match (money, communication, background)
4. Verify QueueFactory.getQueue() works

Debug:
- Query: SELECT * FROM critical_jobs WHERE status IN ('pending','processing')
- Check logs for "Recovering X Tier 1 jobs"
- Verify persistence handlers setup
- Check for recovery errors
```

#### 9. "High memory usage"
```
Cause: Too many completed jobs in Redis
Location: Bull queue storage

Fix:
1. Check removeOnComplete settings
2. Money queue: false (kept for audit)
3. Communication queue: 100 (keep last 100)
4. Background queue: true (delete immediately)
5. Manually clean: POST /api/v1/queue/queues/:name/clear?type=completed

Debug:
- Check Redis memory: redis-cli INFO memory
- Check queue counts: GET /api/v1/queue/queues
- Monitor: nodejs_heap_size_used_bytes metric
- Check for memory leaks
```

#### 10. "Port already in use"
```
Cause: Port inconsistency or process already running
Locations: 
- config.ts: PORT=3004
- index.ts: PORT=3020
- Dockerfile: EXPOSE 3011

Fix:
1. Decide on single port (recommend 3020)
2. Update all locations
3. Kill existing process: lsof -i :3020
4. Update Docker/K8s configs

Debug:
- Check running processes: ps aux | grep node
- Check port usage: lsof -i :3020
- Check environment variable: echo $PORT
```

### Debugging Tools

```bash
# Check service status
curl http://localhost:3020/api/v1/queue/health

# Check queues
curl -H "Authorization: Bearer <token>" \
  http://localhost:3020/api/v1/queue/queues

# Check specific queue
curl -H "Authorization: Bearer <token>" \
  http://localhost:3020/api/v1/queue/queues/money-queue/status

# Check rate limiters
curl -H "Authorization: Bearer <token>" \
  http://localhost:3020/api/v1/queue/rate-limits/status/stripe

# Check metrics
curl -H "Authorization: Bearer <token>" \
  http://localhost:3020/api/v1/queue/metrics/summary

# Check alerts
curl -H "Authorization: Bearer <token>" \
  http://localhost:3020/api/v1/queue/alerts

# Test alert system
curl -X POST -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"severity":"info","channel":"log"}' \
  http://localhost:3020/api/v1/queue/alerts/test

# View Prometheus metrics
curl http://localhost:3020/api/v1/queue/metrics/prometheus

# PostgreSQL queries
psql -h localhost -U postgres -d tickettoken_db

# Check critical jobs
SELECT * FROM critical_jobs WHERE status IN ('pending','processing') LIMIT 10;

# Check recent metrics
SELECT * FROM queue_metrics WHERE captured_at > NOW() - INTERVAL '1 hour' ORDER BY captured_at DESC LIMIT 50;

# Check recent alerts
SELECT * FROM alert_history WHERE created_at > NOW() - INTERVAL '24 hours' ORDER BY created_at DESC;

# Check idempotency keys
SELECT * FROM idempotency_keys WHERE expires_at > NOW() ORDER BY processed_at DESC LIMIT 10;

# Redis queries
redis-cli -h localhost -p 6379

# Check Bull queues (DB 1 = money)
SELECT 1
KEYS bull:money-queue:*
HGETALL bull:money-queue:jobs:12345

# Check idempotency (DB 4)
SELECT 4
KEYS idem:*
GET idem:payment-venue123-user456-event789-10000

# Check rate limits (DB 5)
SELECT 5
KEYS rate_limit:*
```

### Performance Profiling

```typescript
1. Memory Leaks:
   - Monitor: nodejs_heap_size_used_bytes
   - Tool: node --inspect dist/index.js
   - Chrome DevTools: chrome://inspect
   - Heap snapshot before/after load

2. Slow Queries:
   - Enable PostgreSQL slow query log
   - Check EXPLAIN ANALYZE for complex queries
   - Add missing indexes
   - Consider query optimization

3. CPU Profiling:
   - Tool: node --prof dist/index.js
   - Generate flame graph
   - Identify hot paths
   - Optimize bottlenecks

4. Bull Queue Performance:
   - Check queue depth over time
   - Monitor job processing duration
   - Identify slow job types
   - Optimize worker concurrency

5. Rate Limiter Performance:
   - Monitor token bucket metrics
   - Check concurrent request tracking
   - Identify bottleneck services
   - Adjust limits if needed
```

---

## ISSUES & BUGS

### Critical Issues 🔴

#### 1. Port Inconsistency
```
Locations:
- src/config/index.ts: PORT=3004
- src/index.ts: PORT=3020
- Dockerfile: EXPOSE 3011

Impact: Service may not start or be unreachable
Fix: Standardize to PORT=3020 everywhere
```

#### 2. Worker Processors Not Implemented
```
Status: All processors are STUBS

PaymentProcessor:
- simulatePaymentProcessing() (100ms delay)
- No actual Stripe integration
- Random 5% failure for testing

RefundProcessor:
- simulateRefundProcessing() (800ms delay)
- No actual Stripe integration

NFTMintProcessor:
- simulateNFTMinting() (2s delay)
- No actual Solana/Polygon integration

EmailProcessor:
- simulateEmailSend() (500ms delay)
- No actual SendGrid integration

AnalyticsProcessor:
- simulateAnalyticsProcessing() (100ms delay)
- No actual analytics service

Impact: Jobs appear to succeed but do nothing
Fix: Implement actual integrations with external services
```

#### 3. No Test Coverage
```
Test files exist but are empty:
- payment-endpoints.test.ts
- payment-idempotency.test.ts
- retry-storm.test.ts

Impact: No confidence in code quality
Fix: Write comprehensive test suite (target 80%)
```

#### 4. Missing Cleanup Crons
```
Tables without cleanup:
- queue_metrics (30 day retention, no cron)
- alert_history (7 day retention, no cron)
- idempotency_keys (variable retention, no cron)
- critical_jobs (90 day retention, no cron)

Impact: Database bloat over time
Fix: Implement daily cleanup cron jobs
```

#### 5. No Circuit Breakers
```
External API calls lack circuit breakers:
- Stripe API
- SendGrid API
- Twilio API
- Solana RPC
- Polygon RPC

Impact: Cascading failures if external service down
Fix: Implement circuit breaker pattern (like venue-service)
```

### Major Issues 🟡

#### 6. Worker Config Not Used
```
File: src/config/workers.config.ts
Function: getWorkerConfig()
Status: Defined but never called

Impact: Worker concurrency and stalled intervals ignored
Fix: Apply worker configs in queue definitions
```

#### 7. Retry Strategy Config Not Used
```
File: src/config/retry-strategies.config.ts
Functions: getRetryStrategy(), calculateBackoff()
Status: Defined but never called

Impact: Job-type-specific retry strategies ignored
Fix: Apply retry strategies in job processors
```

#### 8. Knex Models Not Used
```
Files: src/models/*.model.ts
- JobModel
- QueueModel
- RateLimitModel
- ScheduleModel

Status: Defined but controllers use raw SQL

Impact: Inconsistent data access patterns
Fix: Either use models or remove them
```

#### 9. Multiple Replica Issues
```
Problem: Service not designed for horizontal scaling

Issues:
- Job recovery runs on all replicas (duplicate jobs)
- Monitoring runs on all replicas (duplicate alerts)
- Rate limiters are per-instance (total rate = limit × replicas)

Impact: Can't safely scale horizontally
Fix: Implement leader election or distributed coordination
```

#### 10. No Distributed Tracing
```
Missing: OpenTelemetry, Jaeger, Zipkin

Impact: Can't trace requests across services
Fix: Add OpenTelemetry instrumentation
```

### Minor Issues 🟢

#### 11. Inconsistent Database Access
```
Controllers use:
- getPool() with raw SQL (most controllers)
- Knex models (not used anywhere)

Fix: Choose one pattern and use consistently
```

#### 12. No Request ID Tracking
```
Missing: X-Request-ID header propagation

Impact: Can't correlate logs across services
Fix: Add request ID middleware
```

#### 13. No PII Sanitization in Logs
```
Risk: User data may be logged
Impact: Privacy/compliance risk
Fix: Add PII sanitization to logger
```

#### 14. Cache Integration Incomplete
```
File: src/services/cache-integration.ts
Uses: @tickettoken/shared/cache

Status: Imported but minimal usage
Fix: Leverage cache for hot paths
```

#### 15. No Rate Limiting on Metrics Endpoint
```
Endpoint: /api/v1/queue/metrics/prometheus
Auth: Required (admin or monitoring)
Rate Limit: None

Impact: Could be abused for DoS
Fix: Add rate limiting middleware
```

---

## COMPARISON WITH OTHER SERVICES

### Queue vs Payment Service

| Feature | Queue Service | Payment Service |
|---------|--------------|-----------------|
| Framework | Express ✅ | Express ✅ |
| Dependency Injection | Manual ⚠️ | Manual ⚠️ |
| Circuit Breakers | No ❌ | No ❌ |
| Retry Logic | Custom (Bull) ✅ | Custom ⚠️ |
| Event Publishing | None ❌ | Outbox ✅ |
| Observability | Prometheus ⚠️ | Prometheus ✅ |
| Error Handling | AppError ✅ | AppError ✅ |
| Rate Limiting | Token Bucket ✅ | Multi-level ✅ |
| Health Checks | Basic ⚠️ | Basic ⚠️ |
| Idempotency | Job-level ✅ | HTTP-level ✅ |
| Code Organization | Good ✅ | Good ✅ |
| Documentation | Complete ✅ | Complete ✅ |
| Test Coverage | 0% ❌ | Unknown ⚠️ |
| Complexity | High 🟡 | Very High 🔴 |

### Queue vs Venue Service

| Feature | Queue Service | Venue Service |
|---------|--------------|---------------|
| Framework | Express ⚠️ | Fastify ✅ |
| Dependency Injection | Manual ❌ | Awilix ✅ |
| Circuit Breakers | No ❌ | Yes ✅ |
| Retry Logic | Custom (Bull) ✅ | Shared ✅ |
| Event Publishing | None ❌ | RabbitMQ ✅ |
| Observability | Prometheus ⚠️ | Full (OTel + Prom) ✅ |
| Error Handling | AppError ⚠️ | Comprehensive ✅ |
| Rate Limiting | Token Bucket ✅ | Multi-level ✅ |
| Health Checks | Basic ⚠️ | 3 levels ✅ |
| Code Organization | Good ✅ | Excellent ✅ |
| Documentation | Complete ✅ | Complete ✅ |
| Complexity | High 🟡 | Medium 🟡 |

**Key Differences:**

1. **Purpose:**
   - Queue: Infrastructure service (job processing)
   - Payment: Business service (financial transactions)
   - Venue: Business service (venue management)

2. **Maturity:**
   - Queue: 50% complete (stubs everywhere)
   - Payment: 90% complete (production-ready)
   - Venue: 100% complete (gold standard)

3. **Critical Path:**
   - Queue: CRITICAL (payment processing depends on it)
   - Payment: CRITICAL (core business function)
   - Venue: HIGH (required for operations)

4. **Scaling:**
   - Queue: Single replica only (coordination issues)
   - Payment: Can scale horizontally
   - Venue: Designed for horizontal scaling

**Recommendations:**

1. **Short Term (Queue Service):**
   - Fix port inconsistency (standardize to 3020)
   - Implement actual job processors
   - Add cleanup crons
   - Write basic test coverage (50%+)

2. **Medium Term:**
   - Implement circuit breakers
   - Add distributed tracing
   - Enable horizontal scaling
   - Apply worker configs

3. **Long Term:**
   - Consider Fastify migration (like venue-service)
   - Add dependency injection (Awilix)
   - Improve observability (OpenTelemetry)
   - Comprehensive testing (80%+)

---

## FUTURE IMPROVEMENTS

### Phase 1: Production Readiness 🔴 URGENT

**Blockers for production:**

- [ ] Fix port inconsistency (3004 vs 3020 vs 3011)
- [ ] Implement actual job processors
  - [ ] PaymentProcessor (Stripe integration)
  - [ ] RefundProcessor (Stripe integration)
  - [ ] NFTMintProcessor (Solana/Polygon integration)
  - [ ] EmailProcessor (SendGrid integration)
  - [ ] AnalyticsProcessor (real analytics service)
- [ ] Remove simulated failures from processors
- [ ] Add cleanup crons
  - [ ] queue_metrics (30 days)
  - [ ] alert_history (7 days)
  - [ ] idempotency_keys (expires_at)
  - [ ] critical_jobs (90 days)
- [ ] Write basic test coverage (minimum 50%)
  - [ ] Unit tests for services
  - [ ] Integration tests for job lifecycle
  - [ ] E2E tests for critical paths

**Timeline:** 2-3 weeks  
**Priority:** CRITICAL

### Phase 2: Resilience 🟡 HIGH

**Improve reliability:**

- [ ] Add circuit breakers (copy from venue-service pattern)
  - [ ] Stripe API circuit breaker
  - [ ] SendGrid API circuit breaker
  - [ ] Twilio API circuit breaker
  - [ ] Blockchain RPC circuit breakers
- [ ] Implement retry with exponential backoff (shared package)
- [ ] Add request ID tracking (X-Request-ID header)
- [ ] Improve health checks (3 levels like venue-service)
  - [ ] Liveness: Basic service running
  - [ ] Readiness: Can accept traffic
  - [ ] Detailed: Component-level health
- [ ] Add dead letter queue (DLQ) for failed jobs
- [ ] Implement job timeout handling

**Timeline:** 1-2 weeks  
**Priority:** HIGH

### Phase 3: Observability 🟡 HIGH

**Better monitoring and debugging:**

- [ ] Add OpenTelemetry tracing
  - [ ] Trace job lifecycle (add → process → complete)
  - [ ] Trace external API calls
  - [ ] Correlate with other services
- [ ] Implement structured logging improvements
  - [ ] Request ID in all logs
  - [ ] PII sanitization
  - [ ] Log aggregation setup (ELK/Datadog)
- [ ] Enhanced Prometheus metrics
  - [ ] Per-job-type metrics
  - [ ] Rate limiter metrics
  - [ ] Database query metrics
- [ ] Create Grafana dashboards
  - [ ] Queue overview dashboard
  - [ ] Job performance dashboard
  - [ ] Alert dashboard
  - [ ] System health dashboard

**Timeline:** 1 week  
**Priority:** HIGH

### Phase 4: Horizontal Scaling 🟢 MEDIUM

**Enable multi-replica deployments:**

- [ ] Implement leader election
  - [ ] Use Redis for leader election
  - [ ] Only leader runs job recovery
  - [ ] Only leader runs monitoring checks
- [ ] Move rate limiter to Redis
  - [ ] Centralized token bucket
  - [ ] Shared across all replicas
- [ ] Coordinate monitoring across replicas
  - [ ] Distributed alert cooldowns
  - [ ] Aggregate metrics from all replicas
- [ ] Test multi-replica scenarios
  - [ ] Job distribution
  - [ ] Recovery after leader failure
  - [ ] Alert deduplication

**Timeline:** 2-3 weeks  
**Priority:** MEDIUM

### Phase 5: Features 🟢 MEDIUM

**New capabilities:**

- [ ] Job scheduling (cron-like)
  - [ ] Implement ScheduleModel usage
  - [ ] Add cron expression parser
  - [ ] Schedule management API
- [ ] Job dependencies (DAG)
  - [ ] Parent-child job relationships
  - [ ] Wait for dependencies before processing
  - [ ] Cascade failures/cancellations
- [ ] Job priority queues
  - [ ] Separate high-priority queue
  - [ ] Priority-based routing
  - [ ] SLA tracking
- [ ] Batch job optimization
  - [ ] Group similar jobs
  - [ ] Bulk processing
  - [ ] Reduce external API calls
- [ ] Webhook callbacks
  - [ ] Notify external services on job completion
  - [ ] Configurable retry logic
  - [ ] Signature verification

**Timeline:** 2-4 weeks  
**Priority:** MEDIUM

### Phase 6: Performance 🟢 LOW

**Optimization:**

- [ ] Database query optimization
  - [ ] Add missing indexes
  - [ ] Optimize aggregation queries
  - [ ] Consider materialized views
- [ ] Redis optimization
  - [ ] Optimize key structure
  - [ ] Add Redis Cluster support
  - [ ] Implement connection pooling
- [ ] Job processor optimization
  - [ ] Apply worker configs (concurrency)
  - [ ] Optimize rate limiter (reduce contention)
  - [ ] Batch API calls where possible
- [ ] Memory optimization
  - [ ] Tune removeOnComplete settings
  - [ ] Implement job data compression
  - [ ] Optimize idempotency storage

**Timeline:** 1-2 weeks  
**Priority:** LOW

### Phase 7: Framework Migration 🟢 LOW

**Long-term modernization:**

- [ ] Evaluate Fastify migration (like venue-service)
  - [ ] Better performance
  - [ ] Better TypeScript support
  - [ ] Better plugin ecosystem
- [ ] Implement dependency injection (Awilix)
  - [ ] Better testability
  - [ ] Better separation of concerns
  - [ ] Consistent with venue-service
- [ ] Refactor to use Knex models consistently
  - [ ] Remove raw SQL from controllers
  - [ ] Standardize data access
  - [ ] Better query building

**Timeline:** 3-4 weeks  
**Priority:** LOW (only if modernizing all services)

---

CHANGELOG
Version 1.0.0 (Current - January 2025)
Status: IN DEVELOPMENT 🟡
Implemented Features:

✅ 3-tier persistence model (Tier 1/2/3)
✅ Queue factory pattern
✅ Idempotency service (Redis + PostgreSQL)
✅ Rate limiting with token bucket
✅ Monitoring service with Prometheus metrics
✅ Alert system with Twilio (SMS + phone)
✅ Job recovery on restart
✅ Express API with authentication/authorization
✅ Batch job submission
✅ Bull queue integration
✅ Job retry with backoff strategies
✅ Event handlers (completed, failed, stalled)
✅ Graceful shutdown
✅ Prometheus metrics export
✅ Health check endpoints
✅ Alert cooldowns (prevent spam)
✅ Data sanitization (XSS, SQL injection)
✅ Request validation (Joi schemas)

Partially Implemented:

⚠️ Job processors (stubs only, no real integrations)

PaymentProcessor: Simulates Stripe calls (500ms delay)
RefundProcessor: Simulates Stripe refunds (800ms delay)
NFTMintProcessor: Simulates blockchain minting (2s delay)
EmailProcessor: Simulates SendGrid calls (500ms delay)
AnalyticsProcessor: Simulates analytics (100ms delay)


⚠️ Worker configurations (defined but not applied)

WORKER_CONFIGS exists in workers.config.ts
getWorkerConfig() defined but never called
Default Bull concurrency used (1 job at a time)


⚠️ Retry strategies (defined but not applied)

RETRY_STRATEGIES exists in retry-strategies.config.ts
getRetryStrategy() and calculateBackoff() defined but never called
Queue-level retry configs used instead


⚠️ Database models (defined but not used)

JobModel, QueueModel, RateLimitModel, ScheduleModel exist
Controllers use raw SQL with getPool() instead
Knex imported but only used in model definitions


⚠️ Cache integration (imported but minimal usage)

@tickettoken/shared/cache imported
serviceCache helper functions defined
Not used in critical paths



Not Implemented:

❌ Circuit breakers (no resilience pattern)
❌ Distributed tracing (no OpenTelemetry)
❌ Test coverage (0% - test files empty)
❌ Cleanup crons (database will bloat over time)
❌ Multi-replica support (coordination issues)
❌ Dead letter queue (failed jobs stay in Redis)
❌ Job scheduling (ScheduleModel not used)
❌ Job dependencies (no DAG support)
❌ Webhook callbacks (no outbound notifications)
❌ Job progress tracking (UI not implemented)
❌ Job cancellation (only removal, no graceful stop)
❌ Batch API optimization (no bulk processing)
❌ Event publishing (no RabbitMQ/events to other services)

Known Issues:

🐛 Port inconsistency (3004 vs 3020 vs 3011)

config/index.ts: PORT=3004
src/index.ts: PORT=3020
Dockerfile: EXPOSE 3011
Fix: Standardize to 3020


🐛 All job processors are stubs

No actual Stripe integration
No actual SendGrid integration
No actual blockchain integration
Simulated random failures (5% for payments)
Fix: Implement real integrations


🐛 No cleanup crons (database will bloat)

queue_metrics table grows unbounded
alert_history table grows unbounded
idempotency_keys table grows unbounded
critical_jobs table grows unbounded
Fix: Add daily cleanup cron


🐛 Worker configs not applied

Concurrency settings ignored
Stalled interval settings ignored
Default Bull behavior used
Fix: Apply configs in queue setup


🐛 Retry strategies not applied

Job-type-specific retry logic ignored
Queue-level retry used instead
calculateBackoff() never called
Fix: Apply strategies in processors


🐛 Cannot scale horizontally

Job recovery runs on all replicas (duplicates)
Monitoring runs on all replicas (duplicate alerts)
Rate limiters per-instance (total = limit × replicas)
Fix: Implement leader election


🐛 No test coverage

Test files exist but empty
Mocks defined in setup.ts
No actual tests written
Fix: Write comprehensive test suite


🐛 No PII sanitization in logs

User data may appear in logs
Privacy/compliance risk
Fix: Add PII sanitizer to logger


🐛 Knex models unused

Models defined but never imported
Controllers use raw SQL instead
Inconsistent data access pattern
Fix: Use models or remove them



File Count: 65 organized files
Code Quality:

Architecture: Good ✅
Separation of Concerns: Good ✅
Type Safety: Good ✅
Error Handling: Basic ⚠️
Documentation: Excellent ✅
Implementation Completeness: 50% ⚠️

Planned Changes (v1.1.0 - Q1 2025)
Target: Production Readiness
Must Have:

 Fix port inconsistency → 3020 everywhere
 Implement PaymentProcessor (Stripe integration)
 Implement RefundProcessor (Stripe integration)
 Implement NFTMintProcessor (Solana/Polygon integration)
 Implement EmailProcessor (SendGrid integration)
 Implement AnalyticsProcessor (real analytics service)
 Remove simulated failures from all processors
 Add cleanup cron (queue_metrics, alert_history, idempotency_keys, critical_jobs)
 Write basic test coverage (minimum 50%)

Unit tests for services
Integration tests for job lifecycle
E2E tests for payment flow



Nice to Have:

 Apply worker configurations
 Apply retry strategies
 Add PII sanitization to logs
 Improve error messages

Timeline: February 2025 (4 weeks)
Blocker Resolution: CRITICAL for production
Planned Changes (v1.2.0 - Q2 2025)
Target: Resilience & Observability
Features:

 Add circuit breakers (Stripe, SendGrid, Twilio, blockchain RPCs)
 Implement distributed tracing (OpenTelemetry)
 Improve health checks (3-level like venue-service)
 Add dead letter queue for permanently failed jobs
 Implement request ID tracking (X-Request-ID)
 Enhanced Prometheus metrics (per-job-type, rate limiter stats)
 Create Grafana dashboards (queue overview, job performance, alerts, system health)
 Improve structured logging (PII sanitization, log aggregation)

Timeline: March-April 2025 (6 weeks)
Priority: HIGH
Planned Changes (v2.0.0 - Q3 2025)
Target: Horizontal Scaling
Features:

 Implement leader election (Redis-based)
 Move rate limiter to Redis (shared across replicas)
 Coordinate monitoring across replicas (distributed alert cooldowns)
 Test multi-replica scenarios
 Add job scheduling (cron-like)
 Add job dependencies (DAG support)
 Implement webhook callbacks
 Batch job optimization (bulk processing)

Timeline: May-June 2025 (8 weeks)
Priority: MEDIUM
Planned Changes (v3.0.0 - Q4 2025)
Target: Framework Modernization (Optional)
Features:

 Evaluate Fastify migration (performance + TypeScript)
 Implement dependency injection (Awilix)
 Refactor to use Knex models consistently
 Database query optimization (indexes, materialized views)
 Redis optimization (clustering, connection pooling)

Timeline: TBD (only if modernizing all services)
Priority: LOW

CONTACT & SUPPORT
Service Owner: Platform Infrastructure Team
Repository: backend/services/queue-service
Documentation: This file (3 parts)
Slack Channel: #platform-infrastructure
On-Call: PagerDuty rotation
Critical Issues:

Service down: Page on-call immediately
Jobs not processing: Page on-call
Database bloat: High priority ticket
Alert spam: Medium priority ticket

Non-Critical Issues:

Feature requests: Project tracker
Documentation updates: Pull request
Performance optimization: Project tracker

Runbook Location: docs/runbooks/queue-service.md (TODO: Create)
Related Services:

Payment Service (port 3005) - Main consumer
Order Service (port 3016) - Job submitter
Notification Service (port 3008) - Job submitter
Ticket Service (port 3004) - Job submitter


API CHANGES (Breaking vs Safe)
✅ SAFE Changes (Won't Break Clients)

Add new optional fields to request bodies

typescript   // SAFE: Adding optional field
   {
     queue: "money",
     type: "payment-process",
     data: {...},
     metadata: {...}  // NEW optional field
   }

Add new fields to response bodies

typescript   // SAFE: Adding new response field
   {
     jobId: "12345",
     queue: "money",
     estimatedCompletion: "2025-01-15T10:05:00Z"  // NEW field
   }

Add new endpoints

typescript   // SAFE: New endpoint doesn't break existing
   POST /api/v1/queue/jobs/schedule

Add new job types

typescript   // SAFE: New job type (processors must be implemented)
   type: "webhook-retry"

Add new queue

typescript   // SAFE: New queue (must be initialized)
   queue: "priority"

Change internal service logic

Improve rate limiting algorithm
Optimize database queries
Change retry timing (as long as it retries)
Improve monitoring


Add database indexes

Performance improvement
No schema changes


Improve error messages

Better debugging info
Same status codes


Add new validation rules (optional fields)

typescript   // SAFE: Validating optional field if provided
   metadata: Joi.object().optional()

Change retry/timeout settings

Increase retry attempts
Change backoff timing
Adjust timeouts



⚠️ BREAKING Changes (Require Coordination)

Remove or rename endpoints

typescript   // BREAKING: Clients calling old endpoint will fail
   DELETE /api/v1/queue/jobs  // removed
   POST /api/v1/queue/jobs/add  // renamed from /jobs

Remove fields from responses

typescript   // BREAKING: Clients expecting field will break
   {
     jobId: "12345",
     // queue: "money"  // REMOVED
   }

Change field types

typescript   // BREAKING: Type mismatch
   priority: "high"  // was: priority: 7 (number)

Make optional fields required

typescript   // BREAKING: Old requests missing field will fail
   {
     queue: "money",
     type: "payment-process",
     data: {...},
     idempotencyKey: "required-uuid"  // NOW REQUIRED
   }

Change authentication requirements

typescript   // BREAKING: Previously public endpoints now require auth
   GET /api/v1/queue/metrics  // now requires JWT

Change status codes

typescript   // BREAKING: Clients checking specific codes will break
   // Was: 200 OK
   // Now: 201 Created

Change error response format

typescript   // BREAKING: Error parsing logic will break
   // Was: { error: "message" }
   // Now: { status: "error", message: "..." }

Remove support for queue types

typescript   // BREAKING: Jobs to removed queue will fail
   queue: "legacy"  // no longer supported

Change job data schema

typescript   // BREAKING: Processors expect different data structure
   // Was: { userId: "123", amount: 1000 }
   // Now: { user: { id: "123" }, payment: { amount: 1000 } }

Change idempotency key format

typescript    // BREAKING: Old keys won't match new format
    // Was: payment-{venueId}-{userId}-{amount}
    // Now: payment-{tenantId}-{venueId}-{userId}-{amount}
Migration Strategy for Breaking Changes:

Deprecation Notice (4 weeks before change)

Add deprecation warnings to logs
Document in changelog
Notify dependent services


Versioned Endpoints (for major changes)

typescript   // Support both versions temporarily
   POST /api/v1/queue/jobs  // old version
   POST /api/v2/queue/jobs  // new version

Backward Compatibility Period (4-8 weeks)

Support old and new formats
Log usage of deprecated features
Monitor migration progress


Coordinated Deployment

Update dependent services first
Deploy queue-service with breaking changes
Monitor for issues
Rollback plan ready


Feature Flags (for gradual rollout)

typescript   if (featureFlags.newJobDataFormat) {
     // Use new format
   } else {
     // Use old format
   }

SECURITY CONSIDERATIONS
Authentication & Authorization
Current Implementation:
typescriptJWT Verification:
- Algorithm: RS256
- Library: jsonwebtoken
- Secret: JWT_SECRET env variable
- Claims: { id, role, venues }

Role-Based Access:
- admin: All operations
- venue_admin: Venue-specific operations
- monitoring: Read-only metrics
- user: Own jobs only
Security Headers:
typescriptHelmet middleware:
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- X-XSS-Protection: 1; mode=block
- Strict-Transport-Security: max-age=31536000
CORS Configuration:
typescriptcors() middleware:
- All origins allowed (⚠️ Should restrict in production)
- Credentials: false
- Methods: GET, POST, PUT, DELETE
Data Security
PII Handling:
typescript⚠️ Issues:
- User data logged without sanitization
- Email addresses in logs
- Phone numbers in logs
- Payment amounts in logs

Recommendation:
- Hash PII in logs
- Redact sensitive fields
- Use structured logging with PII markers
Data at Rest:
typescriptPostgreSQL:
- Encrypted connections (SSL/TLS)
- Encrypted disk (provider-level)
- Backups encrypted

Redis:
- No encryption at rest (⚠️)
- Encrypted connections (TLS)
- Recommend: Enable Redis encryption

Recommendation:
- Enable Redis encryption at rest
- Rotate encryption keys regularly
Data in Transit:
typescriptHTTPS:
- Enforced by reverse proxy (nginx/ALB)
- TLS 1.2+ only
- Strong cipher suites

Internal Services:
- mTLS recommended for service-to-service
- Currently: Plain HTTP (⚠️)
Secrets Management
Current Approach:
typescriptEnvironment Variables:
- JWT_SECRET
- STRIPE_SECRET_KEY
- SENDGRID_API_KEY
- TWILIO_AUTH_TOKEN
- DATABASE_URL (contains password)

⚠️ Issues:
- Secrets in environment variables
- No rotation strategy
- No secret versioning
Recommended Approach:
typescriptHashiCorp Vault or AWS Secrets Manager:
- Centralized secret storage
- Automatic rotation
- Audit logging
- Version control
- Fine-grained access control

Example:
const stripe = await vault.read('secret/stripe/api-key')
Rate Limiting Security
Current Implementation:
typescriptAPI Rate Limiting:
- Global: 100 req/min
- Per endpoint: Varies
- Per user: 60 req/min

⚠️ Issues:
- No IP-based rate limiting
- No bot detection
- No DDoS protection
Recommended Improvements:
typescript1. IP-Based Rate Limiting:
   - Track by IP address
   - Stricter limits for unauthenticated
   - Temporary bans for abuse

2. Bot Detection:
   - User-Agent analysis
   - Request pattern analysis
   - CAPTCHA for suspicious traffic

3. DDoS Protection:
   - CloudFlare or AWS Shield
   - Automatic traffic filtering
   - Rate limiting at edge
Input Validation & Sanitization
Current Implementation:
typescriptJoi Validation:
- Type checking
- Format validation
- Range validation

XSS Prevention:
- Script tag removal
- SQL keyword removal

⚠️ Issues:
- Basic sanitization only
- No output encoding
- No CSP headers
Recommended Improvements:
typescript1. Enhanced Sanitization:
   - Use DOMPurify for HTML
   - Parameterized queries (already using)
   - Output encoding in responses

2. Content Security Policy:
   - Restrict script sources
   - Prevent inline scripts
   - Block mixed content

3. Input Validation:
   - Whitelist approach
   - Strict type checking
   - Length limits
Audit Logging
Current Implementation:
typescriptAction Logging:
- Queue paused/resumed: User ID logged
- Job retried/cancelled: User ID logged
- Alert acknowledged: User ID logged

⚠️ Issues:
- No centralized audit log
- No tamper protection
- No long-term retention
Recommended Implementation:
typescriptAudit Log Table:
CREATE TABLE audit_log (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMP NOT NULL,
  user_id UUID,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50),
  resource_id VARCHAR(100),
  ip_address INET,
  user_agent TEXT,
  request_id UUID,
  metadata JSONB,
  result VARCHAR(20)  -- success, failure
);

Events to Log:
- Authentication attempts
- Authorization failures
- Job operations (add, retry, cancel)
- Queue operations (pause, resume, clear)
- Rate limit resets
- Alert acknowledgments
- Configuration changes
Compliance
GDPR:
typescriptCurrent Status: ⚠️ Partial

Required:
- ✅ User consent (handled by auth-service)
- ⚠️ Data export (no API for user job data)
- ⚠️ Data deletion (no API for job data deletion)
- ❌ Right to be forgotten (not implemented)
- ❌ Data portability (not implemented)

Action Items:
1. Add API to export user's job history
2. Add API to delete user's job data
3. Implement data retention policies
4. Add consent tracking
PCI DSS:
typescriptCurrent Status: ✅ Compliant (with notes)

Compliant:
- ✅ No card data stored (only Stripe tokens)
- ✅ Encrypted connections
- ✅ Access controls (JWT)
- ✅ Audit logging

Notes:
- Payment data only in job payloads (transient)
- Stripe handles actual card data
- Job data includes amounts but no card numbers
SOC 2:
typescriptCurrent Status: ⚠️ Partial

Required:
- ⚠️ Access controls (implemented but basic)
- ⚠️ Encryption (partial - no Redis encryption)
- ⚠️ Monitoring (implemented)
- ❌ Incident response (not documented)
- ❌ Change management (not documented)
- ❌ Vendor management (not documented)

Action Items:
1. Document incident response procedures
2. Implement change management workflow
3. Document vendor assessments (Stripe, SendGrid, etc)
4. Enable Redis encryption
5. Implement comprehensive audit logging

PERFORMANCE BENCHMARKS
Expected Performance
Job Throughput:
typescriptMoney Queue:
- Target: 100 jobs/second
- Peak: 500 jobs/second (burst)
- Processor: 5 concurrent workers per replica
- Bottleneck: External API rate limits (Stripe 25/sec)

Communication Queue:
- Target: 500 jobs/second
- Peak: 2000 jobs/second (burst)
- Processor: 20 concurrent workers per replica
- Bottleneck: SendGrid rate limit (5/sec per account)

Background Queue:
- Target: 1000 jobs/second
- Peak: 5000 jobs/second (burst)
- Processor: 10 concurrent workers per replica
- Bottleneck: CPU/memory for processing

Overall:
- Target: 1600 jobs/second
- Peak: 7500 jobs/second (with burst)
API Response Times:
typescriptAdd Job: <50ms (p95)
- Validation: <5ms
- Redis write: <10ms
- PostgreSQL write (Tier 1): <30ms
- Response: <5ms

Get Job Status: <20ms (p95)
- Redis read: <5ms
- Format response: <5ms

List Queues: <100ms (p95)
- Bull getJobCounts: <50ms per queue
- 3 queues = ~150ms worst case

Queue Status: <200ms (p95)
- getJobCounts: <50ms
- Get sample jobs: <100ms
- Format response: <50ms

Metrics Summary: <500ms (p95)
- PostgreSQL query: <300ms
- Aggregation: <100ms
- Format response: <100ms
Database Performance:
typescriptPostgreSQL:
- Connection pool: 10 connections
- Query timeout: 30 seconds
- Idle timeout: 30 seconds

Critical Queries:
- INSERT critical_jobs: <10ms (p95)
- SELECT pending jobs: <50ms (p95)
- INSERT queue_metrics: <5ms (p95)
- INSERT alert_history: <5ms (p95)

Heavy Queries:
- Throughput calculation: <500ms (p95)
- Failure analysis: <1s (p95)
- Metrics summary: <300ms (p95)
Redis Performance:
typescriptConnection Pool:
- Connections: 1 per queue + 3 for services
- Total: ~6 connections per replica

Operations:
- HSET (job data): <2ms (p95)
- HGETALL (job data): <2ms (p95)
- ZADD (queue operations): <1ms (p95)
- ZRANGE (get jobs): <5ms (p95)
- GET (idempotency): <1ms (p95)
- SET (idempotency): <1ms (p95)

Memory Usage:
- Per job: ~1KB (depends on data size)
- 10,000 waiting jobs: ~10MB
- 100,000 waiting jobs: ~100MB
- Recommend: Monitor memory usage
Load Testing Results
⚠️ NOT YET CONDUCTED
Planned Tests:

Sustained Load Test

typescript   Test: Constant 1000 jobs/second for 1 hour
   Expected:
   - All jobs processed
   - API response times <100ms (p95)
   - No memory leaks
   - No connection pool exhaustion

Burst Load Test

typescript   Test: 5000 jobs/second for 5 minutes
   Expected:
   - Queue depth increases but recovers
   - No job loss
   - API remains responsive
   - Rate limiters prevent external API overload

Failure Recovery Test

typescript   Test: Kill service during heavy load, restart
   Expected:
   - All Tier 1 jobs recovered
   - Processing resumes within 1 minute
   - No duplicate job execution (idempotency)

Multi-Replica Test

typescript   Test: 3 replicas with 500 jobs/second each
   Expected:
   - Jobs distributed evenly
   - No duplicate alerts
   - Rate limiters coordinated (⚠️ Current issue)

Database Stress Test

typescript   Test: 1 million jobs over 24 hours
   Expected:
   - Database size manageable (<10GB)
   - Query performance stable
   - Cleanup cron needed (⚠️ Missing)
Bottlenecks
Identified:

External API Rate Limits (CRITICAL)

Stripe: 25/sec
SendGrid: 5/sec
Twilio: 1/sec
Solution: Rate limiter (implemented) ✅


Database Writes (MEDIUM)

critical_jobs INSERT on every Tier 1 job
queue_metrics INSERT every 30s
Solution: Batch writes, optimize indexes


Redis Memory (MEDIUM)

Completed jobs accumulate
removeOnComplete not aggressive enough
Solution: More aggressive cleanup ⚠️


Monitoring Overhead (LOW)

getJobCounts every 30s for 3 queues
PostgreSQL writes every 30s
Solution: Increase interval or async processing


Job Recovery (LOW)

SELECT all pending jobs on startup
Could be slow with many jobs
Solution: Pagination or parallel recovery



Potential:

Connection Pool Exhaustion

Current: 10 PostgreSQL connections
With 3 replicas: 30 connections
Monitor: PostgreSQL max_connections


Redis Connection Limits

Current: ~6 connections per replica
With 3 replicas: 18 connections
Monitor: Redis maxclients


CPU Saturation

Heavy JSON serialization/deserialization
Crypto operations (JWT verification)
Monitor: process_cpu_seconds_total




DISASTER RECOVERY
Backup Strategy
PostgreSQL:
typescriptCurrent: ⚠️ Not documented

Recommended:
- Automated backups: Every 6 hours
- Point-in-time recovery: Enabled
- Retention: 30 days
- Off-site storage: S3 or equivalent
- Test restores: Monthly

Critical Tables:
- critical_jobs (Tier 1 persistence)
- idempotency_keys (prevent duplicates)
- alert_history (audit trail)
Redis:
typescriptCurrent: Varies by tier

Tier 1 (Money Queue - DB 1):
- Persistence: AOF (Append-Only File)
- Fsync: everysec (1 second data loss max)
- Backup: RDB snapshots every hour
- Retention: 7 days

Tier 2 (Communication Queue - DB 2):
- Persistence: RDB snapshots
- Frequency: Every 5 minutes or 100 writes
- Backup: Copy RDB file daily
- Retention: 7 days

Tier 3 (Background Queue - DB 3):
- Persistence: None
- Acceptable: Jobs lost on crash

Recommended:
- Test Redis restore monthly
- Monitor AOF rewrite performance
- Alert on fsync delays
Recovery Procedures
Service Crash:
typescriptAutomatic Recovery:
1. Kubernetes/Docker restarts container
2. Service runs startup sequence
3. RecoveryService queries critical_jobs table
4. Pending/processing jobs re-added to queues
5. MonitoringService resumes health checks
6. Service ready in ~30 seconds

Manual Intervention: None required
Redis Crash:
typescriptAutomatic Recovery (if persistence enabled):
1. Redis restarts
2. Loads AOF file (Tier 1) or RDB file (Tier 2)
3. Data restored
4. Service reconnects
5. Processing resumes

Data Loss:
- Tier 1: Max 1 second (AOF fsync everysec)
- Tier 2: Max 5 minutes (RDB snapshot interval)
- Tier 3: All in-memory jobs lost

Manual Recovery:
1. Check Redis logs for corruption
2. If AOF corrupted: redis-check-aof --fix
3. If RDB corrupted: Restore from backup
4. Restart queue-service to recover jobs from PostgreSQL
PostgreSQL Crash:
typescriptAutomatic Recovery:
1. PostgreSQL restarts
2. Replays WAL (Write-Ahead Log)
3. Database back online
4. Service reconnects

Data Loss: None (WAL ensures ACID)

Manual Recovery (if database corrupted):
1. Stop queue-service
2. Restore PostgreSQL from latest backup
3. Apply WAL files for point-in-time recovery
4. Start queue-service
5. Monitor for job recovery
Complete Data Center Failure:
typescriptRecovery Steps:
1. Failover to DR site (if multi-region)
2. Restore PostgreSQL from off-site backup
3. Restore Redis from off-site backup (Tier 1/2 only)
4. Deploy queue-service to DR environment
5. Verify health checks pass
6. Resume processing

Data Loss:
- PostgreSQL: Up to last backup (6 hours max)
- Redis Tier 1: Up to last backup + 1 second
- Redis Tier 2: Up to last backup + 5 minutes
- Redis Tier 3: All jobs lost (acceptable)

RTO (Recovery Time Objective): 2 hours
RPO (Recovery Point Objective): 6 hours
Monitoring & Alerting for DR
Critical Alerts:
typescript1. Service Down:
   - Trigger: Health check fails
   - Alert: PagerDuty immediately
   - Action: Check service logs, restart if needed

2. PostgreSQL Connection Lost:
   - Trigger: Database health check fails
   - Alert: PagerDuty immediately
   - Action: Check PostgreSQL status, failover if needed

3. Redis Connection Lost:
   - Trigger: Redis PING fails
   - Alert: PagerDuty immediately
   - Action: Check Redis status, restart if needed

4. Job Recovery Failed:
   - Trigger: RecoveryService errors
   - Alert: Slack + email
   - Action: Manual job recovery from PostgreSQL

5. Backup Failed:
   - Trigger: Backup job fails
   - Alert: Email daily summary
   - Action: Investigate backup system
Monitoring Metrics:
typescriptUptime:
- Target: 99.9% (8.7 hours downtime/year)
- Current: Unknown ⚠️
- Monitor: External uptime service

Data Loss:
- Target: Zero for Tier 1 jobs
- Current: Unknown ⚠️
- Monitor: Compare PostgreSQL vs completed jobs

Recovery Time:
- Target: <5 minutes
- Current: ~30 seconds (observed)
- Monitor: Time from crash to first job processed

OPERATIONAL RUNBOOK
Daily Operations
Morning Checklist:
typescript1. Check service health
   curl https://queue-service/api/v1/queue/health

2. Review overnight alerts
   - Check PagerDuty incidents
   - Review alert_history table
   - Acknowledge resolved alerts

3. Check queue depths
   curl -H "Authorization: Bearer $TOKEN" \
     https://queue-service/api/v1/queue/queues

   Thresholds:
   - Money: <20 waiting (normal), >50 investigate
   - Communication: <1000 waiting (normal), >5000 investigate
   - Background: <10000 waiting (normal), >50000 investigate

4. Review failed jobs
   - Check failed counts per queue
   - Investigate if >10 failures in money queue
   - Review error patterns

5. Check rate limiter status
   curl -H "Authorization: Bearer $TOKEN" \
     https://queue-service/api/v1/queue/rate-limits/status/stripe

   - Ensure tokens available
   - Check for stuck concurrent requests
Weekly Checklist:
typescript1. Review metrics dashboard (Grafana)
   - Job throughput trends
   - Processing duration trends
   - Failure rate trends
   - System resource usage

2. Check database size
   SELECT pg_size_pretty(pg_database_size('tickettoken_db'));
   
   - Alert if >50GB growth per week

3. Review alert patterns
   - Recurring alerts? Fix root cause
   - Alert spam? Adjust thresholds
   - False positives? Tune monitoring

4. Test backup restore (monthly)
   - Restore to staging environment
   - Verify data integrity
   - Document any issues

5. Review slow queries
   - PostgreSQL slow query log
   - Optimize or add indexes
Common Operational Tasks
1. Pause Queue for Maintenance:
bash# Pause queue
curl -X POST -H "Authorization: Bearer $TOKEN" \
  https://queue-service/api/v1/queue/queues/money-queue/pause

# Verify paused
curl -H "Authorization: Bearer $TOKEN" \
  https://queue-service/api/v1/queue/queues/money-queue/status

# Wait for active jobs to complete (check active count = 0)

# Perform maintenance...

# Resume queue
curl -X POST -H "Authorization: Bearer $TOKEN" \
  https://queue-service/api/v1/queue/queues/money-queue/resume
2. Clear Old Completed Jobs:
bash# Clear completed jobs from queue
curl -X POST -H "Authorization: Bearer $TOKEN" \
  https://queue-service/api/v1/queue/queues/money-queue/clear?type=completed

# Clear failed jobs (CAUTION: Review failures first!)
curl -X POST -H "Authorization: Bearer $TOKEN" \
  https://queue-service/api/v1/queue/queues/money-queue/clear?type=failed
3. Retry Failed Job:
bash# Get failed jobs
curl -H "Authorization: Bearer $TOKEN" \
  "https://queue-service/api/v1/queue/queues/money-queue/jobs?status=failed"

# Retry specific job
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"queue":"money"}' \
  https://queue-service/api/v1/queue/jobs/12345/retry
4. Emergency Stop Rate Limiter:
bash# If external API is down, stop all calls
curl -X POST -H "Authorization: Bearer $TOKEN" \
  https://queue-service/api/v1/queue/rate-limits/emergency-stop

# Resume when API back online
curl -X POST -H "Authorization: Bearer $TOKEN" \
  https://queue-service/api/v1/queue/rate-limits/resume
5. Manual Job Recovery:
sql-- Query stuck jobs
SELECT * FROM critical_jobs
WHERE status IN ('pending', 'processing')
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY priority DESC, created_at ASC;

-- Manual recovery (restart service or run recovery script)
-- RecoveryService will automatically pick them up
6. Database Cleanup (Manual - Until Cron Implemented):
sql-- Clean old metrics (keep 30 days)
DELETE FROM queue_metrics
WHERE captured_at < NOW() - INTERVAL '30 days';

-- Clean old alerts (keep 7 days)
DELETE FROM alert_history
WHERE created_at < NOW() - INTERVAL '7 days';

-- Clean expired idempotency keys
DELETE FROM idempotency_keys
WHERE expires_at < NOW();

-- Clean old critical jobs (keep 90 days, 365 for NFTs)
DELETE FROM critical_jobs
WHERE created_at < NOW() - INTERVAL '90 days'
  AND job_type != 'nft-mint';

DELETE FROM critical_jobs
WHERE created_at < NOW() - INTERVAL '365 days'
  AND job_type = 'nft-mint';
Incident Response
Level 1: Service Down
typescriptSymptoms:
- Health check fails
- 503 errors on all endpoints
- No jobs processing

Response:
1. Check service status: kubectl get pods
2. Check logs: kubectl logs queue-service-xxx
3. If crashed: Auto-restart (Kubernetes/Docker)
4. If unhealthy: Check dependencies (PostgreSQL, Redis)
5. If persistent: Rollback deployment
6. Escalate to senior engineer if not resolved in 15 min

Resolution Time: <15 minutes
Level 2: Queue Backlog
typescriptSymptoms:
- Queue depth >1000 (money queue)
- Jobs not processing
- No alerts (monitoring may be down)

Response:
1. Check queue status
2. Check active workers (should be >0)
3. Check rate limiter (may be blocking)
4. Check external API status (Stripe, SendGrid, etc)
5. If external API down: Pause queue until restored
6. If workers stuck: Restart service
7. If rate limited: Increase limits temporarily

Resolution Time: <30 minutes
Level 3: Data Loss
typescriptSymptoms:
- Jobs missing after crash
- Idempotency check failures
- User reports missing transactions

Response:
1. STOP: Do not restart service yet
2. Check PostgreSQL: SELECT * FROM critical_jobs WHERE status='pending'
3. Check Redis: KEYS bull:money-queue:jobs:*
4. If data missing: Restore from backup
5. If data present: Safe to restart service
6. After restart: Verify job recovery logs
7. Escalate to senior engineer immediately

Resolution Time: <1 hour
Impact: CRITICAL - Potential financial loss
Level 4: Duplicate Job Execution
typescriptSymptoms:
- Double charges reported
- Duplicate emails sent
- Idempotency not working

Response:
1. STOP: Pause affected queue immediately
2. Check idempotency_keys table for gaps
3. Check Redis for idempotency key misses
4. Review recent job submissions for key conflicts
5. Identify affected jobs/users
6. Refund duplicate charges (if applicable)
7. Fix idempotency key generation if broken
8. Test in staging before resuming

Resolution Time: <2 hours
Impact: CRITICAL - Financial and reputation damage

GLOSSARY
Terms specific to queue-service:

AOF (Append-Only File): Redis persistence mode where every write operation is logged. Used for Tier 1 jobs.
Bull: Node.js job queue library built on Redis. Powers all queues in this service.
Circuit Breaker: (Not implemented) Pattern to prevent cascading failures when external services are down.
Idempotency Key: Unique identifier ensuring a job is only processed once, even if submitted multiple times.
Job: A unit of work to be processed asynchronously (e.g., payment processing, email sending).
Persistence Tier: Classification of job criticality determining storage strategy (Tier 1/2/3).
Queue: FIFO structure holding jobs to be processed (money, communication, background).
Rate Limiter: Token bucket algorithm preventing overload of external APIs.
RDB (Redis Database): Redis persistence mode using periodic snapshots. Used for Tier 2 jobs.
Stalled Job: Job that was being processed but worker crashed. Bull automatically retries.
Token Bucket: Rate limiting algorithm allowing burst traffic while enforcing average rate.
Worker: Process that picks up and executes jobs from a queue.


END OF DOCUMENTATION
This documentation covers the queue-service comprehensively. Keep updated as the service evolves.