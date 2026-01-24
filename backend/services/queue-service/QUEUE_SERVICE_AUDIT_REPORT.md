# QUEUE-SERVICE COMPREHENSIVE AUDIT REPORT

**Service:** queue-service
**Date:** 2026-01-23
**Auditor:** Claude Code (Opus 4.5)
**Source Files Analyzed:** 80+ files

---

## 1. SERVICE CAPABILITIES

### What This Service Does

The queue-service is the **CRITICAL INFRASTRUCTURE** for async job processing in the TicketToken platform. It handles:
- **NFT Minting** - Blockchain transactions for ticket NFTs
- **Payment Processing** - Stripe payment intents and captures
- **Refund Processing** - Payment reversals and refunds
- **Email Notifications** - Transactional emails via nodemailer
- **Webhook Delivery** - External system notifications
- **Analytics Events** - Background analytics processing

**Framework:** pg-boss (PostgreSQL-backed job queue) with Bull-compatibility adapters

### Queues Defined

| Queue Name | Job Types | Priority | Concurrency | Persistence |
|------------|-----------|----------|-------------|-------------|
| money-queue | payment, refund, nft-mint | CRITICAL (1-3) | 5 | PostgreSQL |
| communication-queue | email, sms, webhook | NORMAL (5) | 20 | Redis |
| background-queue | analytics, cleanup, reports | LOW (7-10) | 10 | Redis |

### Job Types

1. **Payment Jobs** (`payment.process`, `payment.retry`)
   - Process Stripe payment intents
   - Handle payment confirmations
   - Retry failed payments with exponential backoff

2. **Refund Jobs** (`refund.process`)
   - Process Stripe refunds
   - Send refund confirmation emails
   - Trigger webhooks

3. **NFT Mint Jobs** (`ticket.mint`)
   - Upload metadata to Arweave/IPFS via Metaplex
   - Mint NFTs on Solana blockchain
   - Send NFT confirmation emails

4. **Communication Jobs** (`email.send`, `webhook.process`)
   - Transactional emails (payment confirmation, refund, NFT minted)
   - Webhook delivery to external systems

5. **Background Jobs** (`analytics`, `cleanup`, `maintenance`)
   - Analytics event tracking
   - Data cleanup and archival
   - System maintenance tasks

### Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | /jobs | JWT | Add new job to queue |
| GET | /jobs/:id | JWT | Get job details |
| POST | /jobs/:id/retry | JWT (admin) | Retry failed job |
| DELETE | /jobs/:id | JWT (admin) | Cancel job |
| POST | /jobs/batch | JWT (admin) | Add batch jobs (max 100) |
| GET | /queues | JWT | List all queues with metrics |
| GET | /queues/:name/status | JWT | Queue status with samples |
| GET | /queues/:name/jobs | JWT | List jobs by status |
| POST | /queues/:name/pause | JWT (admin) | Pause queue |
| POST | /queues/:name/resume | JWT (admin) | Resume queue |
| POST | /queues/:name/clear | JWT (admin) | Clear queue |
| GET | /health/live | None | Liveness probe |
| GET | /health/ready | None | Readiness probe |
| GET | /health/startup | None | Startup probe |
| GET | /metrics | None | Prometheus metrics |
| GET | /metrics/json | None | JSON metrics |
| GET | /alerts | JWT | Recent alerts |
| POST | /alerts/:id/acknowledge | JWT | Acknowledge alert |
| GET | /rate-limits/status/:key | None | Rate limit status |
| POST | /rate-limits/reset/:key | JWT (admin) | Reset rate limit |

### Business Capabilities
- Job enqueueing with priority levels
- Job retry with configurable backoff strategies
- Dead letter queue for failed jobs
- Idempotency key handling for duplicate prevention
- Rate limiting per external service (Stripe, Solana)
- Queue health monitoring with Twilio alerts
- Prometheus metrics exposure
- Grafana dashboard available

---

## 2. QUEUE ARCHITECTURE & RELIABILITY

### Queue Backend
- **Framework:** pg-boss (with Bull-compatibility adapters)
- **Storage:** PostgreSQL (primary), Redis (communication/background queues)
- **Persistence:** Yes - all jobs stored in PostgreSQL tables

### Job Persistence

| Aspect | Implementation |
|--------|----------------|
| Jobs stored in DB | **YES** - `jobs` and `critical_jobs` tables |
| Recovery on crash | pg-boss handles automatically via PostgreSQL |
| Job history | 90 days for jobs, 365 days for minting |
| Archive strategy | Automatic archival via pg-boss |

**Key Tables (from migration `001_consolidated_baseline.ts`):**
- `jobs` - Main job storage
- `critical_jobs` - High-priority jobs (payments, mints)
- `queue_idempotency_keys` - Idempotency tracking
- `dead_letter_jobs` - Failed jobs for analysis
- `queue_metrics` - Historical metrics
- `alert_history` - Alert tracking

### Retry Strategies

From `src/config/retry-strategies.config.ts` and `src/utils/advanced-retry.ts`:

| Job Type | Max Retries | Backoff Strategy | Base Delay | Max Delay | Jitter |
|----------|-------------|------------------|------------|-----------|--------|
| payment | 5 | exponential | 1s | 60s | Yes |
| refund | 5 | exponential | 1s | 60s | Yes |
| nft-mint | 3 | exponential | 5s | 300s | Yes |
| email | 3 | linear | 2s | 10s | No |
| webhook | 4 | fibonacci | 1s | 30s | Yes |
| default | 3 | exponential | 2s | 60s | Yes |

**Non-Retryable Errors (from `advanced-retry.ts:132-148`):**
- Invalid credentials/authentication failed
- Unauthorized/Forbidden
- Not found
- Invalid request/Bad request
- Validation errors
- Malformed requests

### Dead Letter Queue

From `src/services/dead-letter-queue.service.ts`:

| Aspect | Implementation |
|--------|----------------|
| Storage | `dead_letter_jobs` PostgreSQL table |
| Replay capability | Manual via `replayJob()` method |
| Retention | Configurable, default 90 days |
| Metadata preserved | Original job ID, queue, error, attempts |

**DLQ Methods:**
- `moveToDeadLetter(job, error)` - Move failed job to DLQ
- `getDeadLetterJobs(filters)` - Query DLQ
- `replayJob(dlqJobId)` - Retry from DLQ
- `deleteDeadLetterJob(id)` - Remove from DLQ
- `cleanupOldJobs(retentionDays)` - Cleanup old entries

### At-Least-Once Semantics

**Guaranteed by:**
1. pg-boss uses PostgreSQL transactions for job state
2. Jobs remain in `active` state until explicitly completed
3. Stalled job detection with configurable intervals
4. Retry on failure with exponential backoff

**Idempotency:**
- `queue_idempotency_keys` table stores processed keys
- Keys have TTL (expire after processing)
- Checked before job execution

### CRITICAL ISSUES

1. **[HIGH]** `BullQueueAdapter.getJobCounts()` returns hardcoded zeros
   - Location: `src/adapters/bull-queue-adapter.ts:46-61`
   - Impact: Queue monitoring shows inaccurate counts
   - The adapter comment says "pg-boss doesn't have direct equivalents" but pg-boss DOES have `getQueueSize()` method

2. **[MEDIUM]** `BullQueueAdapter.getWaiting()` returns empty array
   - Location: `src/adapters/bull-queue-adapter.ts:40-44`
   - Impact: Monitoring service can't detect stale jobs

3. **[LOW]** Queue pause/resume not fully implemented
   - Location: `src/adapters/bull-queue-adapter.ts:67-72`
   - Impact: Admin pause functionality may not work as expected

---

## 3. JOB PROCESSORS

### 3.1 mint.processor.ts

**Location:** `src/processors/mint.processor.ts`

**Purpose:** Process NFT minting jobs for ticket NFTs

**Job Types:**
- `ticket.mint`
- `nft.mint`

**External Calls:**
- Solana RPC (via `@solana/web3.js`)
- Metaplex NFT SDK
- Arweave/IPFS for metadata storage
- minting-service (via HMAC-authenticated client)

**Idempotency:**
- Uses `idempotencyKey` from job data
- Checks before minting via `IdempotencyService`

**Error Handling:**
- Captures Solana transaction errors
- Moves to DLQ after max retries
- Sends admin alert email on permanent failure

**Timeout:** 60000ms (60 seconds) - matches Solana config

**Issues:**
- ⚠️ Solana private key loaded at config level, not runtime (security concern)
- ⚠️ No balance check before minting (could fail mid-transaction)

### 3.2 payment.processor.ts

**Location:** `src/processors/payment.processor.ts` and `src/workers/money/payment.processor.ts`

**Purpose:** Process Stripe payment intents

**Job Types:**
- `payment.process`
- `payment.retry`
- `payment.capture`

**External Calls:**
- Stripe API (via `stripe` SDK)
- payment-service (via HMAC-authenticated client)
- notification-service (for emails)

**Idempotency:**
- Uses `idempotencyKey` from job data
- Passed to Stripe as `X-Idempotency-Key` header
- Stored in `queue_idempotency_keys` table

**Error Handling:**
- Distinguishes retryable vs non-retryable Stripe errors
- Card declined = non-retryable
- Network errors = retryable
- Sends webhook on completion/failure

**Timeout:** 30000ms (30 seconds) - matches payment client timeout

**Issues:**
- ✅ Good idempotency implementation
- ⚠️ No explicit distributed lock for concurrent payment attempts

### 3.3 refund.processor.ts

**Location:** `src/processors/refund.processor.ts` and `src/workers/money/refund.processor.ts`

**Purpose:** Process Stripe refunds

**Job Types:**
- `refund.process`
- `refund.partial`
- `refund.full`

**External Calls:**
- Stripe Refunds API
- Email service for confirmation
- Webhook service for notifications

**Idempotency:**
- Uses `refundId` + `orderId` as idempotency key
- Checks existing refunds via Stripe before processing

**Error Handling:**
- Validates refund amount against original payment
- Handles partial vs full refund logic
- Moves to DLQ on permanent failure

**Timeout:** 30000ms (30 seconds)

**Issues:**
- ✅ Proper error categorization
- ⚠️ No explicit check for double-refund at service level

### 3.4 Workers Analysis

**email.processor.ts** (`src/workers/communication/email.processor.ts`)
- Sends transactional emails via nodemailer
- Templates: payment confirmation, refund confirmation, NFT minted
- Admin alerts for system issues
- Graceful handling of missing SMTP config

**analytics.processor.ts** (`src/workers/background/analytics.processor.ts`)
- Tracks analytics events
- Uses analytics-service client with HMAC auth
- Low priority, batch processing

**nft-mint.processor.ts** (`src/workers/money/nft-mint.processor.ts`)
- Parallel implementation to `mint.processor.ts`
- Uses Metaplex SDK for minting
- Sends NFT minted email on success

### Processor Security

| Concern | Status |
|---------|--------|
| Sensitive data in jobs | Payment amounts, user IDs, wallet addresses |
| Encryption at rest | PostgreSQL default (no explicit encryption) |
| Encryption in transit | HMAC for S2S, HTTPS for external |
| Logging | ⚠️ Payment amounts logged, PII (emails) logged |

### CRITICAL ISSUES

1. **[HIGH]** Solana private key in environment variable
   - Location: `src/config/solana.config.ts:14`
   - Risk: Key exposure if env variables leaked

2. **[MEDIUM]** No wallet balance check before minting
   - Location: `src/services/nft.service.ts:51-131`
   - Risk: Transaction failure mid-process if insufficient SOL

3. **[MEDIUM]** Payment amounts logged without redaction
   - Location: Multiple processor files
   - Risk: Sensitive financial data in logs

---

## 4. IDEMPOTENCY & DEDUPLICATION

### Idempotency Implementation

From `src/services/idempotency.service.ts`:

| Aspect | Implementation |
|--------|----------------|
| Keys used | **YES** |
| Storage | PostgreSQL (`queue_idempotency_keys` table) |
| TTL | Configurable, stored in `expires_at` column |
| Check method | `isProcessed(key)` |
| Store method | `markAsProcessed(key, queueName, jobType, result)` |

**Key Generation Strategy:**
- Payment: `payment:${userId}:${orderId}:${amount}`
- Refund: `refund:${transactionId}:${orderId}`
- Mint: `mint:${ticketId}:${userId}`
- Explicit idempotency key if provided in job data

### Per-Processor Idempotency

| Processor | Idempotent | How Enforced |
|-----------|------------|--------------|
| payment | ✅ Yes | Idempotency key → Stripe + local DB |
| refund | ✅ Yes | Idempotency key → Stripe + local DB |
| mint | ✅ Yes | Idempotency key → local DB |
| email | ⚠️ Partial | No explicit idempotency (safe to resend) |
| webhook | ⚠️ Partial | Relies on receiving service idempotency |

### Race Conditions

**Prevention Methods:**
1. PostgreSQL row-level locks via pg-boss
2. `singletonKey` option in job options for deduplication
3. Idempotency key checked atomically in transaction

**Potential Gaps:**
- No explicit distributed lock for payment processing
- Multiple queue workers could theoretically race

### CRITICAL ISSUES

1. **[MEDIUM]** Email processor lacks idempotency
   - Location: `src/workers/communication/email.processor.ts`
   - Impact: Duplicate emails possible on retry
   - Mitigation: Emails are generally safe to resend

2. **[LOW]** Webhook processor relies on receiver idempotency
   - Location: `src/services/webhook.service.ts`
   - Impact: Receiver must handle duplicates

---

## 5. RATE LIMITING & PRIORITY

### Rate Limiting

From `src/services/rate-limiter.service.ts` and `src/config/rate-limits.config.ts`:

**Strategy:** Token bucket with concurrent request limits

**Per-Service Limits:**

| Service | Bucket Size | Refill Rate | Max Concurrent |
|---------|-------------|-------------|----------------|
| stripe | 25 | 5/sec | 10 |
| solana | 10 | 2/sec | 5 |
| internal | 100 | 50/sec | 50 |

**Implementation:**
- Token bucket stored in `rate_limiters` PostgreSQL table
- Refill on access (lazy refill)
- Emergency stop capability (`emergencyStop()`)

### Token Bucket Implementation

From `src/utils/token-bucket.ts`:

```typescript
- maxTokens: Maximum bucket capacity
- refillRate: Tokens per second
- consume(tokens): Take tokens, return success/fail
- waitForTokens(tokens, maxWait): Wait until available
- getTimeUntilNextToken(): Calculate wait time
```

**Issues:**
- ✅ Clean implementation
- ⚠️ No distributed coordination (each instance has own bucket)

### Priority Handling

From `src/utils/job-priority.ts`:

| Priority | Value | Use Case | Retries |
|----------|-------|----------|---------|
| CRITICAL | 1 | Payments, Refunds | 5 |
| HIGH | 3 | NFT Minting, Transfers | 3 |
| NORMAL | 5 | Emails, Webhooks | 2 |
| LOW | 7 | Analytics, Reports | 2 |
| BACKGROUND | 10 | Cleanup, Maintenance | 2 |

**Enforcement:**
- Priority set in `pg-boss.send()` options
- pg-boss processes higher priority first
- Configurable per job type

### Concurrency Limits

From `src/config/workers.config.ts`:

| Queue | Concurrent Jobs | Stalled Interval |
|-------|----------------|------------------|
| payment.process | 5 | 30s |
| payment.retry | 3 | 60s |
| order.fulfill | 10 | 30s |
| ticket.mint | 3 | 120s |
| email.send | 20 | 15s |
| webhook.process | 10 | 30s |

### Issues

1. **[LOW]** Token bucket not distributed
   - Each service instance maintains separate bucket
   - Could exceed limits in multi-instance deployment

2. **[LOW]** No dynamic rate limit adjustment
   - Limits are static from config
   - No circuit breaker integration for automatic throttling

---

## 6. MONITORING & OBSERVABILITY

### Metrics Collected

From `src/services/metrics.service.ts` and `src/services/monitoring.service.ts`:

**Job Metrics:**
- `queue_jobs_processed_total` (Counter) - Jobs processed by queue/status
- `queue_jobs_failed_total` (Counter) - Failed jobs by queue/reason
- `queue_job_processing_duration_seconds` (Histogram) - Processing time
- `queue_active_jobs` (Gauge) - Currently active jobs
- `queue_size` (Gauge) - Waiting jobs per queue
- `oldest_job_age_seconds` (Gauge) - Age of oldest waiting job

**Payment Metrics:**
- `payments_processed_total` (Counter) - Payments by currency/status
- `payment_amount_total_cents` (Counter) - Total payment volume
- `refunds_processed_total` (Counter) - Refunds by currency/status
- `refund_amount_total_cents` (Counter) - Total refund volume

**NFT Metrics:**
- `nfts_minted_total` (Counter) - NFTs minted by status
- `nft_transfers_total` (Counter) - NFT transfers by status
- `solana_wallet_balance_sol` (Gauge) - Wallet balance

**Communication Metrics:**
- `emails_sent_total` (Counter) - Emails by type
- `emails_failed_total` (Counter) - Failed emails by type
- `webhooks_sent_total` (Counter) - Webhooks by event
- `webhooks_failed_total` (Counter) - Failed webhooks by event

**System Metrics:**
- `service_uptime_seconds` (Gauge)
- `service_memory_usage_bytes` (Gauge) - RSS, heap, external
- `service_cpu_usage_percent` (Gauge)
- `alerts_sent_total` (Counter) - Alerts by severity/type/channel

### Alert Configuration

From `src/config/monitoring.config.ts` and `src/services/monitoring.service.ts`:

| Alert | Threshold | Severity | Notification |
|-------|-----------|----------|--------------|
| Money queue depth | > 50 | CRITICAL | SMS + Phone call |
| Money queue job age | > 10 min | CRITICAL | SMS + Phone call |
| Money queue failures | > 10 | CRITICAL | SMS + Phone call |
| Comm queue depth | > 5000 | WARNING | SMS |
| Background queue depth | > 50000 | WARNING | Log only |
| Low Solana balance | < 0.01 SOL | WARNING | Log + SMS |

**Alert Cooldowns:**
- Critical: 5 minutes
- Warning: 1 hour
- Info: 24 hours

### Grafana Dashboard

From `grafana/queue-service-dashboard.json`:

**Panels:**
1. Queue Depth Over Time (waiting vs active)
2. Job Processing Rate (completed/sec vs failed/sec)
3. Job Failure Rate (%)
4. Rate Limiter Status (tokens available)
5. Idempotency Hit Rate (%)
6. Worker Concurrency (current vs max)
7. Circuit Breaker States (table)
8. Job Processing Duration (p95)
9. Redis Connection Status

**Dashboard Features:**
- 30s refresh interval
- 1-hour default time range
- Prometheus datasource

### Health Checks

From `src/routes/health.routes.ts`:

| Endpoint | Checks | Failure Response |
|----------|--------|------------------|
| /health/live | Service running | N/A (always 200) |
| /health/ready | Redis, Stripe, Solana, Email | 503 if any fail |
| /health/startup | Uptime > 5s | 503 if starting |

### Issues

1. **[MEDIUM]** Queue metrics return zeros (adapter issue)
   - Location: `src/adapters/bull-queue-adapter.ts:46-61`
   - Impact: Grafana dashboard shows incorrect data

2. **[LOW]** No distributed tracing integration
   - Missing request IDs across service calls
   - No OpenTelemetry/Jaeger integration

---

## 7. DATA PERSISTENCE

### Database Schema

From `src/migrations/001_consolidated_baseline.ts`:

**10 Tables Created:**

1. **queues** - Queue definitions
   - id, tenant_id, name, type, config, active, counts, timestamps

2. **jobs** - Main job storage
   - id, tenant_id, queue, type, data, status, attempts, error, timestamps

3. **schedules** - Scheduled/recurring jobs
   - id, tenant_id, name, cron_expression, job_type, job_data, active

4. **rate_limits** - API rate limiting
   - id, tenant_id, key, limit, window_seconds, current_count, reset_at

5. **critical_jobs** - High-priority jobs (payments, mints)
   - id, tenant_id, queue_name, job_type, data, priority, idempotency_key

6. **queue_metrics** - Historical metrics snapshots
   - id, tenant_id, queue_name, waiting/active/completed/failed counts

7. **queue_idempotency_keys** - Idempotency tracking
   - id, tenant_id, key, queue_name, job_type, result, expires_at

8. **rate_limiters** - Service rate limit state
   - service_name, tokens_available, concurrent_requests, refill_rate

9. **alert_history** - Alert log
   - id, tenant_id, severity, alert_type, message, acknowledged

10. **dead_letter_jobs** - Failed jobs for analysis
    - id, tenant_id, queue_name, job_type, job_data, error, attempts

**RLS Enabled:** All tables have Row-Level Security with tenant isolation

### Job Storage

| Aspect | Value |
|--------|-------|
| All jobs stored in DB | **YES** (pg-boss uses PostgreSQL) |
| Completed job retention | 90 days (payment/webhook), 7 days (email) |
| Failed job retention | In DLQ until manually cleared |
| Minting job retention | 365 days (compliance) |

### Persistence Per Queue Type

From `src/config/persistence.config.ts`:

| Category | Provider | Retention | Archive |
|----------|----------|-----------|---------|
| payment | PostgreSQL | 90 days | Yes → payment_archive |
| webhook | PostgreSQL | 30 days | Yes → webhook_archive |
| email | Redis | 7 days | No |
| notification | Redis | 7 days | No |
| minting | PostgreSQL | 365 days | Yes → blockchain_archive |
| default | Redis | 14 days | No |

### Data Cleanup

From `src/config/monitoring.config.ts`:

| Data Type | Retention | Cleanup Method |
|-----------|-----------|----------------|
| Metrics | 30 days | Scheduled cleanup |
| Alerts | 7 days | Scheduled cleanup |
| Job history | 90 days | pg-boss archival |
| Idempotency keys | TTL-based | Automatic expiry |

### Issues

1. **[LOW]** No explicit encryption at rest
   - Relies on PostgreSQL/Redis defaults
   - Payment data stored unencrypted

2. **[LOW]** No explicit backup strategy in code
   - Relies on infrastructure-level backups

---

## 8. SECURITY ANALYSIS

### HMAC Implementation

From `src/middleware/internal-auth.middleware.ts`:

| Aspect | Status |
|--------|--------|
| Uses @tickettoken/shared | ✅ Yes |
| Matches standardization | ✅ Yes (Phase 5 complete) |
| Replay protection | ✅ Yes (60s window) |
| Nonce tracking | ✅ Yes (Redis-based) |
| Service allowlist | ✅ Yes (configurable) |

**HMAC Headers:**
- `x-internal-service` - Calling service name
- `x-internal-timestamp` - Request timestamp
- `x-internal-nonce` - Unique request ID
- `x-internal-signature` - HMAC-SHA256 signature
- `x-internal-body-hash` - Body hash for POST

**Allowed Services:**
- ticket-service
- order-service
- event-service
- payment-service
- auth-service

**Toggle:** `USE_NEW_HMAC=true` environment variable

### Job Data Security

| Concern | Status |
|---------|--------|
| Sensitive data in jobs | ⚠️ Yes - amounts, emails, wallet addresses |
| Encryption at rest | ❌ No explicit encryption |
| Encryption in transit | ✅ HTTPS + HMAC |
| PII handling | ⚠️ Emails stored in job data |

**Sensitive Fields in Job Data:**
- `userId`, `email` - User identification
- `amount`, `currency` - Payment amounts
- `walletAddress`, `recipientAddress` - Crypto addresses
- `paymentMethodId`, `paymentIntentId` - Stripe identifiers

### Access Control

| Operation | Required Auth |
|-----------|---------------|
| Enqueue jobs | JWT (any authenticated user) |
| View job status | JWT (own jobs only - no enforcement!) |
| Cancel jobs | JWT (admin, venue_admin) |
| Replay DLQ | JWT (admin) |
| Pause/resume queue | JWT (admin) |
| Clear queue | JWT (admin) |

### Logging Security

From `src/utils/logger.ts` and throughout:

| Concern | Status |
|---------|--------|
| PII in logs | ⚠️ Emails logged |
| Payment data in logs | ⚠️ Amounts logged |
| Secrets in logs | ✅ No secret leakage found |
| Error details | ⚠️ Full stack traces in dev |

### CRITICAL VULNERABILITIES

1. **[HIGH]** Solana private key in environment variable
   - Location: `src/config/solana.config.ts:14`
   - Risk: Private key exposure if env variables leaked
   - Recommendation: Use secrets manager (AWS KMS, Vault)

2. **[HIGH]** Stripe secret key validation but stored in memory
   - Location: `src/config/stripe.config.ts:10-20`
   - Risk: Memory dump could expose key
   - Recommendation: Use secrets manager

3. **[MEDIUM]** Job ownership not enforced on GET /jobs/:id
   - Location: `src/controllers/job.controller.ts:87-120`
   - Risk: Any authenticated user can view any job
   - Recommendation: Add tenant/user ownership check

4. **[MEDIUM]** Email logged with full address
   - Location: Multiple service files
   - Risk: PII in logs
   - Recommendation: Redact to `j***@example.com`

5. **[LOW]** No input sanitization on webhook URLs
   - Location: `src/services/webhook.service.ts:19-53`
   - Risk: SSRF if user-supplied URLs allowed
   - Mitigation: Currently only uses env-configured URLs

---

## 9. SERVICE CLIENTS

### 9.1 payment-service.client.ts

**Location:** `src/clients/payment-service.client.ts`

**Calls:**
- `POST /api/v1/payments/process`
- `GET /api/v1/payments/{id}/status`

| Aspect | Status |
|--------|--------|
| HMAC Signing | ✅ Yes (via BaseServiceClient) |
| Circuit Breaker | ✅ Yes (inherited from shared) |
| Timeout | 30000ms |
| Idempotency Header | ✅ Yes (`X-Idempotency-Key`) |

**Issues:** None - well implemented

### 9.2 minting-service.client.ts

**Location:** `src/clients/minting-service.client.ts`

**Calls:**
- `POST /api/v1/internal/mint`
- `GET /api/v1/internal/mint/{ticketId}/status`

| Aspect | Status |
|--------|--------|
| HMAC Signing | ✅ Yes (via BaseServiceClient) |
| Circuit Breaker | ✅ Yes (inherited from shared) |
| Timeout | 60000ms |
| Retry | ✅ Inherited from BaseServiceClient |

**Issues:** None - well implemented

### 9.3 analytics-service.client.ts

**Location:** `src/clients/analytics-service.client.ts`

**Calls:**
- `POST /api/v1/events/track`
- `POST /api/v1/events/batch`

| Aspect | Status |
|--------|--------|
| HMAC Signing | ✅ Yes (via BaseServiceClient) |
| Circuit Breaker | ✅ Yes (inherited from shared) |
| Timeout | 5000ms |
| Batch Support | ✅ Yes |

**Issues:** None - well implemented

### 9.4 Shared Library Usage

From `src/clients/index.ts`:

```typescript
export {
  mintingServiceClient,
  analyticsServiceClient,
  createRequestContext,
} from '@tickettoken/shared';
```

**All clients using @tickettoken/shared:** ✅ Yes
**Consistent auth:** ✅ Yes - HMAC-SHA256

---

## 10. CONFIGURATION MANAGEMENT

### Queue Configurations

From `src/config/queues.config.ts`:

| Queue | Persistence | Attempts | Backoff | Remove on Complete |
|-------|-------------|----------|---------|-------------------|
| money | PostgreSQL | 5 | exponential, 2s | No |
| communication | Redis | 3 | exponential, 1s | After 7 days |
| background | Redis | 2 | fixed, 5s | After 1 day |

### Retry Strategies

From `src/config/retry-strategies.config.ts`:

| Job Type | Strategy | Base Delay | Max Delay |
|----------|----------|------------|-----------|
| payment | exponential | 1000ms | 60000ms |
| refund | exponential | 1000ms | 60000ms |
| nft-mint | exponential | 5000ms | 300000ms |
| email | linear | 2000ms | 10000ms |
| webhook | fibonacci | 1000ms | 30000ms |

### Rate Limits

From `src/config/rate-limits.config.ts`:

| Service | Rate (per sec) | Bucket Size | Max Concurrent |
|---------|---------------|-------------|----------------|
| stripe | 5 | 25 | 10 |
| solana | 2 | 10 | 5 |
| internal | 50 | 100 | 50 |

### Worker Configurations

From `src/config/workers.config.ts`:

| Worker | Concurrency | Max Stalled | Stalled Interval |
|--------|-------------|-------------|------------------|
| payment-processor | 5 | 3 | 30s |
| payment-retry | 3 | 2 | 60s |
| order-fulfillment | 10 | 3 | 30s |
| ticket-minting | 3 | 1 | 120s |
| email-sender | 20 | 5 | 15s |
| webhook-processor | 10 | 3 | 30s |

### Hardcoded Values

| Location | Value | Should Be |
|----------|-------|-----------|
| `auth.middleware.ts:5` | `'dev-secret-change-in-production'` | Env var (exists as fallback) |
| `tenant-context.ts:4` | `'00000000-0000-0000-0000-000000000001'` | Env var |
| `health.routes.ts:131` | `5` seconds startup | Env var |
| `monitoring.service.ts:143` | `30000` ms check interval | Already from env |

---

## 11. CODE QUALITY

### Dead Code

| File | Line | Issue |
|------|------|-------|
| `rate-limit.routes.ts:20-32` | Commented out routes | Dead code |
| `bull-queue-adapter.ts:63-93` | Methods return empty/null | Stub implementation |
| `queue.controller.ts:33-35` | Unused getJobs variables | Dead code pattern |

### TODO/FIXME (Total: 0)

No TODO or FIXME comments found in source files.

### `any` Type Usage

**Approximate Count:** 45+ occurrences

**Key Locations:**
- `job.controller.ts` - Request body casting
- `queue.controller.ts` - Job mapping
- `monitoring.service.ts` - Metrics objects
- `bull-queue-adapter.ts` - pg-boss compatibility layer
- `modules.d.ts` - Third-party type stubs

### Dependencies

From `package.json`:

| Package | Version | Status |
|---------|---------|--------|
| pg-boss | ^9.0.3 | ✅ Current |
| stripe | ^14.25.0 | ✅ Current |
| @solana/web3.js | ^1.91.6 | ✅ Current |
| @metaplex-foundation/js | ^0.20.1 | ⚠️ Check for updates |
| fastify | ^4.26.2 | ✅ Current |
| winston | ^3.13.0 | ✅ Current |
| joi | ^17.12.3 | ✅ Current |
| nodemailer | ^6.9.13 | ✅ Current |
| twilio | ^5.0.4 | ✅ Current |
| prom-client | ^15.1.2 | ✅ Current |
| bull | ^4.12.2 | ⚠️ Not used (adapter only) |

**Unused Dependencies:**
- `bull` - Only used for type reference in adapters, actual impl is pg-boss

---

## 12. TEST COVERAGE

### Test Files

**Unit Tests:** 67 files in `tests/unit/`

| Category | Files | Coverage Areas |
|----------|-------|----------------|
| Adapters | 2 | bull-job-adapter, bull-queue-adapter |
| Config | 10 | All config files |
| Controllers | 6 | All controllers |
| Middleware | 8 | All middleware |
| Models | 4 | Job, Queue, RateLimit, Schedule |
| Processors | 3 | mint, payment, refund |
| Queues | 4 | money, communication, background, factory |
| Routes | 7 | All route files |
| Services | 13 | All services |
| Utils | 7 | All utilities |
| Workers | 3 | base, email, analytics |

**Integration Tests:** 1 file
- `tests/hmac-integration.test.ts` - HMAC authentication tests

### Coverage Areas

| Component | Test Coverage |
|-----------|---------------|
| Processors | ✅ mint, payment, refund |
| Services | ✅ All 13 services |
| Workers | ⚠️ Base + 2 workers (missing nft-mint, refund) |
| Controllers | ✅ All 6 controllers |
| Middleware | ✅ All 8 middleware |

### Coverage Gaps

1. **Integration Tests**
   - No end-to-end queue processing tests
   - No Stripe webhook simulation tests
   - No Solana transaction simulation tests

2. **Missing Worker Tests**
   - `workers/money/nft-mint.processor.ts`
   - `workers/money/refund.processor.ts`

3. **No Load Testing**
   - No performance/stress tests
   - No rate limit verification tests

---

## FINAL SUMMARY

### CRITICAL ISSUES (Must Fix)

1. **[CRITICAL] Solana Private Key Exposure**
   - Location: `src/config/solana.config.ts:14`
   - Impact: Private key in environment variable
   - Fix: Use AWS Secrets Manager, HashiCorp Vault, or similar

2. **[HIGH] BullQueueAdapter Returns Incorrect Metrics**
   - Location: `src/adapters/bull-queue-adapter.ts:46-61`
   - Impact: Monitoring/alerting completely broken
   - Fix: Implement pg-boss `getQueueSize()` and state queries

3. **[HIGH] Job Ownership Not Enforced**
   - Location: `src/controllers/job.controller.ts:87-120`
   - Impact: Any user can view any job details
   - Fix: Add tenant/user ownership check

### HIGH PRIORITY (Should Fix)

1. **[HIGH] No Wallet Balance Check Before Minting**
   - Location: `src/services/nft.service.ts`
   - Impact: Minting could fail mid-transaction
   - Fix: Pre-flight balance check with minimum threshold

2. **[MEDIUM] PII in Logs**
   - Location: Multiple files
   - Impact: GDPR/privacy compliance
   - Fix: Redact email addresses, mask payment amounts

3. **[MEDIUM] No Distributed Rate Limiting**
   - Location: `src/utils/token-bucket.ts`
   - Impact: Multi-instance deployment exceeds limits
   - Fix: Use Redis-based rate limiting

### MEDIUM PRIORITY

1. Email processor lacks explicit idempotency
2. Webhook processor relies on receiver idempotency
3. No distributed tracing/OpenTelemetry
4. Stripe secret key in memory (should use secrets manager)

### TECHNICAL DEBT

1. `bull` dependency unused (only for type reference)
2. ~45+ `any` type usages
3. Some dead code (commented routes, stub implementations)
4. Missing integration tests for critical paths
5. Some worker tests missing

---

## QUEUE SERVICE SUMMARY

**What queue-service does:**
- Central job queue for all async operations
- Processes payments via Stripe
- Processes refunds
- Mints NFT tickets on Solana blockchain
- Sends transactional emails
- Delivers webhooks to external systems
- Tracks analytics events

**What breaks if it goes down:**
- ❌ No new ticket purchases complete
- ❌ No NFTs minted
- ❌ No refunds processed
- ❌ No email notifications sent
- ❌ No webhook deliveries
- ❌ Revenue loss for every minute of downtime

---

## RELIABILITY ASSESSMENT

**Job Loss Risk:** LOW-MEDIUM

**Reasons:**
- ✅ pg-boss uses PostgreSQL transactions (durable)
- ✅ Idempotency keys prevent duplicates
- ✅ Dead letter queue captures failures
- ✅ Retry strategies with exponential backoff
- ⚠️ Monitoring metrics not working (can't detect issues)
- ⚠️ No wallet balance pre-check for minting

**Biggest Risks:**
1. Silent failures due to broken monitoring
2. Solana minting failures if wallet runs out of SOL
3. Rate limit exceeded on multi-instance deployment

---

## FILES ANALYZED VERIFICATION

**Total source files read:** 80+

**By category:**
- Adapters: 2
- Clients: 4
- Config: 13
- Controllers: 6
- Middleware: 8
- Processors: 3
- Services: 13
- Utils: 6
- Workers: 5
- Models: 4
- Queues: 4
- Routes: 7
- Types: 3
- Migrations: 2
- Entry points: 3
- Other (package.json, grafana): 2
- Test files (HMAC integration): 1

**Files Analyzed:** 80+
**Critical Issues:** 3
**High Priority Issues:** 3
**Code Quality:** Fair (some `any` usage, missing tests)

---

## 📬 QUEUE SERVICE ASSESSMENT

**Production Ready:** WITH FIXES

**Must fix before production:**
1. Implement proper queue metrics in BullQueueAdapter
2. Add wallet balance pre-check for minting
3. Secure secrets management for Solana/Stripe keys
4. Add job ownership enforcement

**Reliability:** GOOD (with functioning monitoring)

**Job Loss Risk:** LOW (pg-boss is PostgreSQL-backed and durable)

---

*This is CRITICAL INFRASTRUCTURE - job loss = money loss.*
