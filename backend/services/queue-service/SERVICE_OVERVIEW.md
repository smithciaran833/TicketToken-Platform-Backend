# Queue Service - Service Overview

## Service Purpose
The Queue Service manages asynchronous job processing for payments, refunds, NFT minting, email notifications, and background tasks using Bull queues backed by Redis. It provides reliable job execution with retry strategies, rate limiting, dead-letter queues, and comprehensive monitoring.

---

## 📁 Folder Structure Analysis

### **routes/** - API Routes

#### Main Route Registration (`index.ts`)
- `GET /` - API info endpoint
- `GET /cache/stats` - Get cache statistics
- `DELETE /cache/flush` - Flush service cache

#### **job.routes.ts** - Job Management
- `POST /jobs` - Add a new job (authenticated)
- `GET /jobs/:id` - Get job details (authenticated)
- `POST /jobs/:id/retry` - Retry a failed job (admin/venue_admin)
- `DELETE /jobs/:id` - Cancel a job (admin/venue_admin)
- `POST /jobs/batch` - Add batch jobs (admin/venue_admin)

#### **queue.routes.ts** - Queue Management
- `GET /queues` - List all queues (authenticated)
- `GET /queues/:name/status` - Get queue status (authenticated)
- `GET /queues/:name/jobs` - Get queue jobs (authenticated)
- `POST /queues/:name/pause` - Pause queue (admin only)
- `POST /queues/:name/resume` - Resume queue (admin only)
- `POST /queues/:name/clear` - Clear queue (admin only)

#### **health.routes.ts** - Health Checks
- `GET /health/live` - Liveness probe
- `GET /health/ready` - Readiness probe (checks Redis, Stripe, Solana, Email)
- `GET /health/startup` - Startup probe

#### **metrics.routes.ts** - Metrics & Monitoring
- `GET /metrics` - Prometheus metrics (text format)
- `GET /metrics/json` - JSON metrics
- `GET /metrics/queue-stats` - Detailed queue statistics
- `GET /metrics/system` - System-level metrics (memory, CPU)

#### **alerts.routes.ts** - Alert Management
- `GET /alerts` - Get recent alerts (authenticated)
- `POST /alerts/:id/acknowledge` - Acknowledge an alert (authenticated)
- `POST /alerts/test` - Test alert system (admin only)

#### **rate-limit.routes.ts** - Rate Limiting
- `GET /rate-limits/status/:key` - Get rate limit status
- `POST /rate-limits/reset/:key` - Reset rate limit for a key

---

### **services/** - Business Logic Services

#### **cache-integration.ts**
- **Purpose:** Shared cache integration for queue service
- **Key Functions:**
  - `serviceCache.get()` - Get from cache with optional fetcher
  - `serviceCache.set()` - Set cache value
  - `serviceCache.delete()` - Delete cache entries
  - `serviceCache.flush()` - Flush entire cache
  - `getCacheStats()` - Get cache statistics

#### **dead-letter-queue.service.ts**
- **Purpose:** Handles permanently failed jobs after all retry attempts
- **Key Functions:**
  - `moveToDeadLetterQueue()` - Move failed job to DLQ
  - `getDeadLetterJobs()` - Retrieve DLQ jobs
  - `retryDeadLetterJob()` - Retry job from DLQ
  - `retryMultipleJobs()` - Bulk retry DLQ jobs
  - `deleteDeadLetterJob()` - Remove job from DLQ
  - `clearOldJobs()` - Clean up old DLQ jobs
  - `getStatistics()` - Get DLQ statistics
  - `exportJobs()` - Export DLQ jobs for analysis
  - `getFailuresByErrorType()` - Group failures by error type

#### **email.service.ts**
- **Purpose:** Email notifications for payments, refunds, NFT minting
- **Key Functions:**
  - `sendPaymentConfirmation()` - Send payment success email
  - `sendRefundConfirmation()` - Send refund confirmation email
  - `sendNFTMintedConfirmation()` - Send NFT minted notification
  - `sendAdminAlert()` - Send alert to admins
  - `testConnection()` - Verify email configuration

#### **idempotency.service.ts**
- **Purpose:** Prevents duplicate job processing
- **Key Functions:**
  - `generateKey()` - Generate idempotency key from job data
  - `check()` - Check if job already processed
  - `store()` - Store job result for idempotency
  - `cleanup()` - Clean up expired idempotency keys

#### **metrics.service.ts**
- **Purpose:** Collects and exposes Prometheus metrics
- **Key Functions:**
  - `recordJobProcessed()` - Record job completion
  - `recordJobFailed()` - Record job failure
  - `recordJobDuration()` - Record job execution time
  - `setActiveJobs()` - Set active job count
  - `setQueueSize()` - Set queue size metric
  - `recordPayment()` - Record payment metrics
  - `recordRefund()` - Record refund metrics
  - `recordNFTMint()` - Record NFT minting metrics
  - `recordEmail()` - Record email sending metrics
  - `recordWebhook()` - Record webhook metrics
  - `getMetrics()` - Get Prometheus format metrics
  - `getMetricsJSON()` - Get JSON format metrics

#### **monitoring.service.ts**
- **Purpose:** Queue health monitoring and alerting
- **Key Functions:**
  - `getInstance()` - Get singleton instance
  - `start()` - Start monitoring
  - `stop()` - Stop monitoring
  - `checkAllQueues()` - Check health of all queues
  - `getPrometheusMetrics()` - Get monitoring metrics
  - `getMetricsSummary()` - Get metrics summary
  - `recordJobSuccess()` - Record successful job
  - `recordJobFailure()` - Record failed job

#### **nft.service.ts**
- **Purpose:** Solana NFT operations (minting, transfers)
- **Key Functions:**
  - `mintNFT()` - Mint NFT on Solana
  - `transferNFT()` - Transfer NFT to another wallet
  - `getNFTMetadata()` - Get NFT metadata
  - `verifyOwnership()` - Verify NFT ownership
  - `getWalletBalance()` - Get wallet SOL balance
  - `getExplorerUrl()` - Get Solana Explorer URL
  - `getConfig()` - Get Solana configuration

#### **persistence.service.ts**
- **Purpose:** Persists critical jobs to database
- **Key Functions:**
  - `saveJob()` - Save job to database
  - `markComplete()` - Mark job as completed
  - `markFailed()` - Mark job as failed
  - `recoverJobs()` - Recover incomplete jobs on startup

#### **queue-registry.service.ts**
- **Purpose:** Centralized queue management registry
- **Key Functions:**
  - `getInstance()` - Get singleton instance
  - `initialize()` - Initialize all queues
  - `getMoneyQueue()` - Get money queue (payments/refunds)
  - `getCommunicationQueue()` - Get communication queue (emails)
  - `getBackgroundQueue()` - Get background queue (analytics)

#### **rate-limiter.service.ts**
- **Purpose:** Token bucket rate limiting for external services
- **Key Functions:**
  - `getInstance()` - Get singleton instance
  - `acquire()` - Acquire rate limit token
  - `release()` - Release rate limit token
  - `getStatus()` - Get rate limit status
  - `isRateLimited()` - Check if service is rate limited
  - `getWaitTime()` - Get estimated wait time
  - `reset()` - Reset rate limiter
  - `emergencyStop()` - Emergency stop all processing
  - `resume()` - Resume after emergency stop

#### **recovery.service.ts**
- **Purpose:** Recovers pending jobs on service restart
- **Key Functions:**
  - `recoverPendingJobs()` - Recover incomplete jobs from database

#### **stripe.service.ts**
- **Purpose:** Stripe payment processing
- **Key Functions:**
  - `createPaymentIntent()` - Create Stripe payment intent
  - `getPaymentIntent()` - Get payment intent details
  - `cancelPaymentIntent()` - Cancel payment intent
  - `createRefund()` - Process refund
  - `getRefund()` - Get refund details
  - `createCustomer()` - Create Stripe customer
  - `attachPaymentMethod()` - Attach payment method to customer
  - `verifyWebhookSignature()` - Verify Stripe webhook
  - `getConfig()` - Get Stripe configuration

#### **webhook.service.ts**
- **Purpose:** Send webhooks for job events
- **Key Functions:**
  - `sendWebhook()` - Send generic webhook
  - `sendPaymentCompleted()` - Send payment completed webhook
  - `sendRefundCompleted()` - Send refund completed webhook
  - `sendNFTMinted()` - Send NFT minted webhook
  - `sendOperationFailed()` - Send operation failed webhook

---

### **controllers/** - Request Handlers

#### **job.controller.ts**
- **Purpose:** Job management operations
- **Methods:**
  - `addJob()` - Add single job to queue
  - `getJob()` - Get job details by ID
  - `retryJob()` - Retry failed job
  - `cancelJob()` - Cancel pending/active job
  - `addBatchJobs()` - Add multiple jobs in batch

#### **queue.controller.ts**
- **Purpose:** Queue management operations
- **Methods:**
  - `listQueues()` - List all available queues
  - `getQueueStatus()` - Get queue status and metrics
  - `getQueueJobs()` - List jobs in queue
  - `pauseQueue()` - Pause queue processing
  - `resumeQueue()` - Resume queue processing
  - `clearQueue()` - Clear all jobs from queue

#### **health.controller.ts**
- **Purpose:** Health check endpoints
- **Methods:**
  - `checkHealth()` - Basic health check
  - `checkReadiness()` - Readiness check with dependencies

#### **metrics.controller.ts**
- **Purpose:** Metrics and monitoring
- **Methods:**
  - `getPrometheusMetrics()` - Get Prometheus format metrics
  - `getMetricsSummary()` - Get metrics summary
  - `getThroughput()` - Get job throughput metrics
  - `getFailureAnalysis()` - Get failure analysis

#### **alerts.controller.ts**
- **Purpose:** Alert management
- **Methods:**
  - `getAlerts()` - Get recent alerts
  - `acknowledgeAlert()` - Acknowledge alert
  - `testAlert()` - Test alert system

#### **rate-limit.controller.ts**
- **Purpose:** Rate limit management
- **Methods:**
  - `getStatus()` - Get rate limit status
  - `checkLimit()` - Check if service is rate limited
  - `resetLimit()` - Reset rate limit for service
  - `emergencyStop()` - Emergency stop processing
  - `resume()` - Resume after emergency stop

---

### **repositories/** - Database Access

**Note:** This service does not have a dedicated `repositories/` folder. Database access is handled through:
- **Knex query builder** in migrations and models
- **Direct database queries** in services (persistence, idempotency)
- **Models** (`Job.ts`, `Queue.ts`, `RateLimit.ts`, `Schedule.ts`)

---

### **middleware/** - Request Middleware

#### **auth.middleware.ts**
- `authenticate()` - JWT authentication
- `authorize(roles)` - Role-based authorization
- `optionalAuthMiddleware()` - Optional authentication

#### **error.middleware.ts**
- `errorMiddleware()` - Global error handler

#### **logging.middleware.ts**
- `loggingMiddleware()` - Request/response logging

#### **metrics.middleware.ts**
- `metricsMiddleware()` - Request metrics collection
- `getMetrics()` - Get collected metrics

#### **rate-limit.middleware.ts**
- `rateLimitMiddleware(options)` - Rate limiting for API endpoints

#### **tenant-context.ts**
- `setTenantContext()` - Set tenant context for RLS

#### **validation.middleware.ts**
- `validateBody(schema)` - Validate request body
- `validateQuery(schema)` - Validate query parameters
- `validateParams(schema)` - Validate URL parameters

---

### **config/** - Configuration Files

#### **index.ts**
- Service configuration (name, port, env, database, Redis)

#### **database.config.ts**
- `connectDatabase()` - Connect to PostgreSQL
- `getPool()` - Get database pool

#### **stripe.config.ts**
- Stripe client initialization and configuration
- Webhook secret configuration

#### **solana.config.ts**
- Solana RPC connection
- Metaplex configuration
- Wallet keypair setup

#### **workers.config.ts**
- `getWorkerConfig()` - Get worker configuration for queue

#### **secrets.ts**
- `loadSecrets()` - Load secrets from environment/vault

#### **retry-strategies.config.ts**
- `getRetryStrategy()` - Get retry strategy for job type
- `getAllRetryStrategies()` - Get all retry strategies
- `validateRetryStrategies()` - Validate retry configurations

#### **persistence.config.ts**
- `getPersistenceConfig()` - Get persistence configuration for queue

#### **queues.config.ts**
- Queue definitions and configurations

#### **rate-limits.config.ts**
- Rate limit configurations for external services

#### **monitoring.config.ts**
- Monitoring and alerting thresholds

#### **constants.ts**
- Service-wide constants (priorities, job types, etc.)

---

### **migrations/** - Database Migrations

#### **001_baseline_queue.ts**
Creates the following tables:

1. **queues** - Queue metadata and statistics
2. **jobs** - Job tracking and status
3. **schedules** - Scheduled/recurring jobs
4. **rate_limits** - Rate limit tracking
5. **critical_jobs** - High-priority persistent jobs
6. **queue_metrics** - Historical queue metrics
7. **idempotency_keys** - Idempotency tracking
8. **rate_limiters** - Token bucket rate limiter state
9. **alert_history** - Monitoring alerts
10. **dead_letter_jobs** - Failed jobs requiring attention

**RLS Policies:** All tables have Row-Level Security enabled with tenant isolation

**Initial Data:** Inserts default rate limiter configurations for Stripe, Twilio, SendGrid, and Solana RPC

---

### **validators/** - Validation Schemas

**Note:** No dedicated `validators/` folder exists. Validation is handled using **Joi schemas** defined in controllers:

#### Schemas in **job.controller.ts**:
- `addJobSchema` - Validates single job creation
- `batchJobSchema` - Validates individual batch job
- `addBatchJobsSchema` - Validates batch job request

#### Built-in Validation:
- Email format validation
- Amount range validation
- Required field validation per job type
- Data sanitization (XSS prevention, SQL injection prevention)

---

### **processors/** - Job Processors

#### **payment.processor.ts**
- `processPayment()` - Process payment jobs
- `onPaymentFailed()` - Payment failure handler
- `onPaymentCompleted()` - Payment completion handler
- `onPaymentProgress()` - Payment progress tracker

#### **refund.processor.ts**
- `processRefund()` - Process refund jobs
- `onRefundFailed()` - Refund failure handler
- `onRefundCompleted()` - Refund completion handler
- `onRefundProgress()` - Refund progress tracker

#### **mint.processor.ts**
- `processMint()` - Process NFT minting jobs
- `processTransfer()` - Process NFT transfer jobs
- `onMintFailed()` - Minting failure handler
- `onMintCompleted()` - Minting completion handler
- `onMintProgress()` - Minting progress tracker

---

### **workers/** - Worker Classes

#### **base.worker.ts**
- `BaseWorker<T, R>` - Abstract base class for all workers
- `process()` - Main processing method with error handling
- `execute()` - Abstract method for worker implementation

#### **money/payment.processor.ts**
- `PaymentProcessor` - Extends BaseWorker for payment processing
- Includes idempotency checking, rate limiting, and Stripe integration

#### **money/refund.processor.ts**
- Refund processing worker

#### **money/nft-mint.processor.ts**
- NFT minting worker

#### **communication/email.processor.ts**
- Email sending worker

#### **background/analytics.processor.ts**
- Analytics processing worker

---

### **queues/** - Queue Definitions

#### **definitions/money.queue.ts**
- Payment queue configuration
- Refund queue configuration
- NFT minting queue configuration

#### **definitions/communication.queue.ts**
- Email queue configuration
- SMS queue configuration (if applicable)

#### **definitions/background.queue.ts**
- Analytics queue configuration
- Cleanup/maintenance queue configuration

#### **factories/queue.factory.ts**
- `QueueFactory.getQueue()` - Factory for getting queue instances
- Centralized queue creation and management

---

### **models/** - Data Models

#### **Job.ts**
- Job data model and TypeScript interface

#### **Queue.ts**
- Queue metadata model

#### **RateLimit.ts**
- Rate limit tracking model

#### **Schedule.ts**
- Scheduled job model

---

### **adapters/** - External Library Adapters

#### **bull-queue-adapter.ts**
- Adapter for Bull queue operations
- Wraps Bull queue functionality

#### **bull-job-adapter.ts**
- Adapter for Bull job operations
- Type-safe job interface

---

### **types/** - TypeScript Types

#### **job.types.ts**
- Job data interfaces
- Job result types
- Job options types

#### **queue.types.ts**
- Queue configuration types
- Queue status types

---

### **utils/** - Utility Functions

#### **logger.ts**
- Centralized logging with Winston/Pino

#### **errors.ts**
- Custom error classes
- Error handling utilities

#### **advanced-retry.ts**
- Advanced retry strategies
- Exponential backoff
- Jitter calculations

#### **circuit-breaker.ts**
- Circuit breaker pattern implementation
- Prevents cascading failures

#### **job-priority.ts**
- Job priority calculations
- Priority queue management

#### **token-bucket.ts**
- Token bucket rate limiting algorithm

---

## 📊 Service Dependencies

### External Services Configured:
- **Redis** - Queue backend and caching
- **PostgreSQL** - Job persistence and metrics
- **Stripe** - Payment processing
- **Solana** - NFT minting and transfers
- **Email (SMTP)** - Email notifications
- **Twilio** (optional) - SMS alerts
- **SendGrid** (optional) - Email delivery

### Internal Service Dependencies:
- **payment-service** - Payment processing
- **shared** - Cache and common utilities
- **auth-service** - Authentication (JWT verification)

---

## 🎯 Key Features

1. **Reliable Job Processing** - Bull queues with Redis backend
2. **Dead Letter Queue** - Handles permanently failed jobs
3. **Idempotency** - Prevents duplicate processing
4. **Rate Limiting** - Token bucket algorithm for external APIs
5. **Circuit Breakers** - Prevents cascading failures
6. **Retry Strategies** - Exponential backoff with jitter
7. **Job Persistence** - Critical jobs saved to PostgreSQL
8. **Monitoring & Metrics** - Prometheus metrics and alerts
9. **Multi-tenant Support** - RLS for tenant isolation
10. **Batch Processing** - Efficient bulk job submission

---

## 🔒 Security Features

- JWT authentication for all routes
- Role-based authorization (admin, venue_admin)
- Input validation and sanitization
- XSS prevention
- SQL injection prevention
- Row-Level Security (RLS) for multi-tenancy
- Idempotency key validation
- Rate limiting on API endpoints

---

## 📈 Monitoring & Observability

- **Prometheus metrics** exposed at `/metrics`
- **Health checks** for Kubernetes/Docker
- **Alert system** for queue depth, failures, job age
- **Dead letter queue** monitoring
- **Rate limit** status tracking
- **System metrics** (CPU, memory)
- **Job metrics** (throughput, latency, success rate)

---

## 🚀 Job Types Supported

### Money Queue:
- `payment-process` - Process payments via Stripe
- `refund-process` - Process refunds
- `nft-mint` - Mint NFTs on Solana
- `nft-transfer` - Transfer NFTs

### Communication Queue:
- `email-send` - Send emails
- `sms-send` - Send SMS notifications

### Background Queue:
- `analytics-process` - Process analytics events
- `cleanup` - Data cleanup tasks
- `scheduled-task` - Scheduled/recurring jobs

---

## 📝 Notes

- Service uses **Bull** (Redis-based) for queue management
- **pg-boss** references exist but primary implementation is Bull
- All critical jobs are persisted to PostgreSQL for disaster recovery
- Queue service is designed for high reliability and fault tolerance
- Comprehensive retry strategies with different configurations per job type
- Rate limiting ensures compliance with external API limits (Stripe, Solana, etc.)
