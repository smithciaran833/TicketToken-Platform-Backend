# Queue Service Test Plan

> **Generated**: January 2025
> **Service**: queue-service
> **Total Files Reviewed**: 73
> **Status**: Planning Phase

---

## Table of Contents

1. [Overview](#overview)
2. [Test Categories](#test-categories)
3. [Critical Issues to Address](#critical-issues-to-address)
4. [File-by-File Test Specifications](#file-by-file-test-specifications)
5. [E2E Test Scenarios](#e2e-test-scenarios)
6. [Test Infrastructure Requirements](#test-infrastructure-requirements)
7. [Priority Matrix](#priority-matrix)

---

## Overview

This document outlines the complete testing strategy for the queue-service. Tests are categorized into:

- 🧪 **Unit Tests**: Pure functions, business logic, isolated components
- 🔗 **Integration Tests**: Database, Redis, external service interactions
- 🌐 **E2E Tests**: Full workflow scenarios across the service

### Test File Naming Convention
```
src/
├── __tests__/
│   ├── unit/
│   │   ├── services/
│   │   ├── utils/
│   │   ├── middleware/
│   │   └── config/
│   ├── integration/
│   │   ├── services/
│   │   ├── queues/
│   │   └── controllers/
│   └── e2e/
│       ├── payment.flow.test.ts
│       ├── refund.flow.test.ts
│       └── nft-mint.flow.test.ts
```

---

## Test Categories

| Category | Count | Priority |
|----------|-------|----------|
| Unit Tests | ~120 | High |
| Integration Tests | ~80 | High |
| E2E Tests | ~15 | Medium |

---

## Critical Issues to Address

Before testing, these critical issues should be resolved:

| Issue | Severity | Impact on Testing |
|-------|----------|-------------------|
| Duplicate processor implementations (`src/processors/*` vs `src/workers/*`) | 🔴 Critical | Must decide which to test |
| Queue metrics return zeros | 🔴 Critical | Monitoring tests will fail |
| DLQ uses in-memory storage | 🔴 High | Persistence tests will fail |
| 3 different DB connection systems | 🟠 Medium | Mock setup complexity |
| Missing `await` on async calls | 🟠 Medium | Race conditions in tests |

---

## File-by-File Test Specifications

### 1. Entry Points

#### `src/index.ts` - Main Bootstrap

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `should start service successfully` | Full bootstrap sequence completes |
| 🔗 Integration | `should connect to PostgreSQL` | Database connection established |
| 🔗 Integration | `should initialize queue factory` | pg-boss starts successfully |
| 🔗 Integration | `should recover pending jobs on startup` | Recovery service runs |
| 🔗 Integration | `should handle graceful shutdown on SIGTERM` | Clean shutdown |
| 🔗 Integration | `should handle graceful shutdown on SIGINT` | Clean shutdown |
| 🔗 Integration | `should exit with code 1 on startup failure` | Error handling |

#### `src/app.ts` - Fastify App Factory

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `should create Fastify instance with plugins` | App creation |
| 🔗 Integration | `should skip auth for /health endpoints` | Auth bypass |
| 🔗 Integration | `should skip auth for /api/v1/queue/docs` | Swagger access |
| 🔗 Integration | `should apply auth to protected routes` | Auth enforcement |
| 🔗 Integration | `should set tenant context after auth` | Multi-tenancy |
| 🔗 Integration | `should register all route modules` | Route mounting |
| 🔗 Integration | `should configure Swagger UI` | API docs |

#### `src/server.ts` - Server Wrapper

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should export createApp function` | Module export |

---

### 2. Configuration Files

#### `src/config/index.ts` - Central Config

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should use default port 3008 when PORT not set` | Default values |
| 🧪 Unit | `should parse PORT from environment` | Env parsing |
| 🧪 Unit | `should use default redis host when not set` | Redis defaults |
| 🧪 Unit | `should parse REDIS_PORT as integer` | Type coercion |

#### `src/config/constants.ts` - Queue Constants

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should export QUEUE_NAMES with correct values` | Constant values |
| 🧪 Unit | `should export QUEUE_PRIORITIES with correct order` | Priority ordering |
| 🧪 Unit | `should export JOB_TYPES with backward compatibility aliases` | Alias mapping |
| 🧪 Unit | `should export PERSISTENCE_TIERS` | Tier definitions |

#### `src/config/database.ts` - Knex Instance

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `should create Knex client` | Client creation |
| 🔗 Integration | `should use DATABASE_URL when provided` | Connection string |
| 🔗 Integration | `should fall back to individual params` | Param-based connection |
| 🔗 Integration | `should configure connection pool` | Pool settings |

#### `src/config/database.config.ts` - PG Pool Manager

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `connectDatabase should create pool` | Pool creation |
| 🔗 Integration | `connectDatabase should return existing pool` | Singleton behavior |
| 🔗 Integration | `getPool should throw when not initialized` | Error handling |
| 🔗 Integration | `getPool should return pool after init` | Happy path |
| 🔗 Integration | `should handle pool error events` | Error logging |

#### `src/config/queues.config.ts` - Queue Configurations

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `MONEY_QUEUE should use TIER_1 persistence` | Config values |
| 🧪 Unit | `COMMUNICATION_QUEUE should use TIER_2 persistence` | Config values |
| 🧪 Unit | `BACKGROUND_QUEUE should use TIER_3 persistence` | Config values |
| 🧪 Unit | `should parse retry limits from environment` | Env overrides |
| 🧪 Unit | `PG_BOSS_CONFIG should use pgboss schema` | Schema config |

#### `src/config/workers.config.ts` - Worker Configurations

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `getWorkerConfig should return config for known queue` | Config lookup |
| 🧪 Unit | `getWorkerConfig should return defaults for unknown queue` | Fallback |
| 🧪 Unit | `email.send should have concurrency 20` | Specific config |
| 🧪 Unit | `ticket.mint should have concurrency 3` | Specific config |

#### `src/config/retry-strategies.config.ts` - Retry Configuration

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `getRetryStrategy should return strategy for known type` | Strategy lookup |
| 🧪 Unit | `getRetryStrategy should return default for unknown type` | Fallback |
| 🧪 Unit | `payment-process should use exponential backoff` | Strategy type |
| 🧪 Unit | `send-email should use fixed backoff` | Strategy type |
| 🧪 Unit | `validateRetryStrategies should warn on unusual values` | Validation |
| 🧪 Unit | `getAllRetryStrategies should return copy of strategies` | Immutability |

#### `src/config/rate-limits.config.ts` - Rate Limit Config

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `RATE_LIMITS should include stripe config` | Config presence |
| 🧪 Unit | `RATE_LIMITS should include sendgrid config` | Config presence |
| 🧪 Unit | `RATE_LIMIT_GROUPS should map twilio services` | Group mapping |
| 🧪 Unit | `should parse rate limits from environment` | Env overrides |

#### `src/config/persistence.config.ts` - Storage Strategy Config

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `getPersistenceConfig should extract category from queue name` | Category parsing |
| 🧪 Unit | `getPersistenceConfig should return default for unknown` | Fallback |
| 🧪 Unit | `payment config should use postgresql` | Provider selection |
| 🧪 Unit | `email config should use redis` | Provider selection |
| 🧪 Unit | `minting config should have 365 day retention` | Retention value |

#### `src/config/monitoring.config.ts` - Alert Thresholds

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `money queue threshold should be 50` | Threshold value |
| 🧪 Unit | `background queue threshold should be 50000` | Threshold value |
| 🧪 Unit | `critical cooldown should be 5 minutes` | Cooldown value |
| 🧪 Unit | `should parse thresholds from environment` | Env overrides |

#### `src/config/secrets.ts` - Secrets Manager Integration

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `loadSecrets should retrieve common secrets` | Secret loading |
| 🔗 Integration | `loadSecrets should throw on failure` | Error handling |
| 🔗 Integration | `should log service name on load` | Logging |

#### `src/config/solana.config.ts` - Solana/NFT Config

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `should throw if SOLANA_PRIVATE_KEY not set` | Required env |
| 🔗 Integration | `should create connection with RPC URL` | Connection |
| 🔗 Integration | `should load wallet keypair from base58` | Key parsing |
| 🔗 Integration | `should warn on low balance` | Balance check |
| 🧪 Unit | `solanaConfig should detect devnet` | Network detection |
| 🧪 Unit | `solanaConfig should detect mainnet` | Network detection |

#### `src/config/stripe.config.ts` - Stripe Client Config

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `should throw if STRIPE_SECRET_KEY not set` | Required env |
| 🔗 Integration | `should throw if key format invalid` | Key validation |
| 🔗 Integration | `should warn if webhook secret not set` | Optional warning |
| 🧪 Unit | `stripeConfig should detect test mode` | Mode detection |
| 🧪 Unit | `stripeConfig should detect live mode` | Mode detection |

---

### 3. Services

#### `src/services/queue-registry.service.ts` - Queue Singleton Registry

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `getInstance should return same instance` | Singleton |
| 🧪 Unit | `getMoneyQueue should throw before initialize` | Pre-init error |
| 🧪 Unit | `getMoneyQueue should return queue after initialize` | Post-init |
| 🧪 Unit | `getCommunicationQueue should throw before initialize` | Pre-init error |
| 🧪 Unit | `getCommunicationQueue should return queue after initialize` | Post-init |
| 🧪 Unit | `getBackgroundQueue should throw before initialize` | Pre-init error |
| 🧪 Unit | `getBackgroundQueue should return queue after initialize` | Post-init |

#### `src/services/persistence.service.ts` - Tiered Job Persistence

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `saveJob should write to DB for TIER_1` | DB write |
| 🔗 Integration | `saveJob should not write for TIER_2` | Tier filtering |
| 🔗 Integration | `saveJob should not write for TIER_3` | Tier filtering |
| 🔗 Integration | `saveJob should handle ON CONFLICT` | Upsert |
| 🔗 Integration | `markComplete should update status` | Status update |
| 🔗 Integration | `markFailed should update status` | Status update |
| 🔗 Integration | `recoverJobs should return empty for non-TIER_1` | Tier filtering |
| 🔗 Integration | `recoverJobs should return pending jobs` | Recovery query |
| 🔗 Integration | `recoverJobs should filter by 24hr window` | Time filtering |
| 🔗 Integration | `recoverJobs should order by priority desc` | Ordering |

#### `src/services/recovery.service.ts` - Job Recovery on Startup

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `recoverPendingJobs should query critical_jobs` | DB query |
| 🔗 Integration | `recoverPendingJobs should re-add jobs to queues` | Job re-add |
| 🔗 Integration | `recoverPendingJobs should use original job ID` | ID preservation |
| 🔗 Integration | `recoverPendingJobs should log on no jobs` | Empty handling |
| 🧪 Unit | `determineQueue should map money queue name` | Queue mapping |
| 🧪 Unit | `determineQueue should map communication queue name` | Queue mapping |
| 🧪 Unit | `determineQueue should map background queue name` | Queue mapping |
| 🧪 Unit | `determineQueue should return null for unknown` | Unknown handling |

#### `src/services/monitoring.service.ts` - Prometheus + Alerting

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `getInstance should return same instance` | Singleton |
| 🧪 Unit | `loadThresholds should parse env correctly` | Env parsing |
| 🧪 Unit | `recordJobSuccess should update metrics` | Metrics update |
| 🧪 Unit | `recordJobFailure should update metrics` | Metrics update |
| 🔗 Integration | `start should begin health check interval` | Interval start |
| 🔗 Integration | `stop should clear health check interval` | Interval stop |
| 🔗 Integration | `checkAllQueues should check each queue` | Queue iteration |
| 🔗 Integration | `sendAlert should respect cooldown` | Cooldown logic |
| 🔗 Integration | `sendAlert should store in database` | DB persistence |
| 🔗 Integration | `sendCriticalAlert should send SMS via Twilio` | SMS integration |
| 🔗 Integration | `sendCriticalAlert should call for money queue` | Phone call |
| 🔗 Integration | `getPrometheusMetrics should return valid format` | Prometheus format |
| 🔗 Integration | `getMetricsSummary should query database` | Summary query |

#### `src/services/idempotency.service.ts` - Duplicate Job Prevention

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `generateKey for payment-process` | `payment-{venueId}-{userId}-{eventId}-{amount}` |
| 🧪 Unit | `generateKey for refund-process` | `refund-{transactionId}` |
| 🧪 Unit | `generateKey for nft-mint` | `nft-{eventId}-{seatId}` |
| 🧪 Unit | `generateKey for nft-mint with ticketId` | `nft-{eventId}-{ticketId}` |
| 🧪 Unit | `generateKey for send-email` | `email-{template}-{to}-{date}` |
| 🧪 Unit | `generateKey for send-sms` | `sms-{to}-{template}-{hour}` |
| 🧪 Unit | `generateKey for analytics-event` | `analytics-{eventType}-{venueId}-{userId}-{timestamp}` |
| 🧪 Unit | `generateKey for unknown type should hash` | SHA256 hash |
| 🧪 Unit | `generateKey should be deterministic` | Same input = same output |
| 🔗 Integration | `check should return null for new key` | Cache miss |
| 🔗 Integration | `check should return result for existing key` | Cache hit |
| 🔗 Integration | `check should respect expiration` | TTL enforcement |
| 🔗 Integration | `store should insert new key` | Insert |
| 🔗 Integration | `store should update existing key` | ON CONFLICT |
| 🔗 Integration | `cleanup should remove expired keys` | Cleanup |
| 🔗 Integration | `cleanup should preserve unexpired keys` | Selective cleanup |

#### `src/services/dead-letter-queue.service.ts` - Failed Job Handling

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `isCriticalJob should identify payment` | Critical check |
| 🧪 Unit | `isCriticalJob should identify refund` | Critical check |
| 🧪 Unit | `isCriticalJob should not identify email` | Non-critical |
| 🧪 Unit | `getStatistics should calculate counts` | Stats |
| 🧪 Unit | `getStatistics should group by queue` | Grouping |
| 🧪 Unit | `getFailuresByErrorType should group errors` | Error grouping |
| 🧪 Unit | `clearOldJobs should remove jobs older than retention` | Retention |
| 🔗 Integration | `moveToDeadLetterQueue should store job` | DLQ storage |
| 🔗 Integration | `moveToDeadLetterQueue should add to queue` | Queue add |
| 🔗 Integration | `moveToDeadLetterQueue should record metrics` | Metrics |
| 🔗 Integration | `retryDeadLetterJob should add to original queue` | Retry |
| 🔗 Integration | `retryDeadLetterJob should remove from DLQ` | Cleanup |
| 🔗 Integration | `retryMultipleJobs should handle mixed results` | Bulk retry |
| 🔗 Integration | `deleteDeadLetterJob should remove job` | Delete |
| 🔗 Integration | `getDeadLetterJobs should return sorted list` | Retrieval |

#### `src/services/rate-limiter.service.ts` - Distributed Rate Limiting

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `getInstance should return same instance` | Singleton |
| 🧪 Unit | `getServiceGroup should return group for grouped service` | Group lookup |
| 🧪 Unit | `getServiceGroup should return null for ungrouped` | No group |
| 🔗 Integration | `acquire should consume token` | Token consumption |
| 🔗 Integration | `acquire should increment concurrent` | Concurrency tracking |
| 🔗 Integration | `acquire should block when rate limited` | Rate limiting |
| 🔗 Integration | `acquire should timeout after max retries` | Timeout |
| 🔗 Integration | `release should decrement concurrent` | Release |
| 🔗 Integration | `isRateLimited should return true when limited` | Status check |
| 🔗 Integration | `isRateLimited should return false when available` | Status check |
| 🔗 Integration | `getWaitTime should calculate delay` | Wait calculation |
| 🔗 Integration | `reset should restore full bucket` | Reset |
| 🔗 Integration | `emergencyStop should pause all limiters` | Emergency stop |
| 🔗 Integration | `resume should restore limits` | Resume |
| 🔗 Integration | `token refill should be accurate over time` | Refill calculation |
| 🔗 Integration | `group rate limiting should share limits` | Grouped services |

#### `src/services/metrics.service.ts` - Prometheus Metrics

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `recordJobProcessed should increment counter` | Counter increment |
| 🧪 Unit | `recordJobFailed should increment counter` | Counter increment |
| 🧪 Unit | `recordJobDuration should observe histogram` | Histogram observe |
| 🧪 Unit | `setActiveJobs should set gauge` | Gauge set |
| 🧪 Unit | `setQueueSize should set gauge` | Gauge set |
| 🧪 Unit | `recordPayment should increment with labels` | Labeled counter |
| 🧪 Unit | `recordRefund should increment with labels` | Labeled counter |
| 🧪 Unit | `recordNFTMint should increment counter` | Counter increment |
| 🧪 Unit | `recordEmail should handle success/failure` | Conditional increment |
| 🧪 Unit | `recordWebhook should handle success/failure` | Conditional increment |
| 🧪 Unit | `reset should clear all metrics` | Reset |
| 🔗 Integration | `getMetrics should return Prometheus format` | Format validation |
| 🔗 Integration | `getMetricsJSON should return parseable JSON` | JSON format |
| 🔗 Integration | `system metrics should update periodically` | Interval updates |

#### `src/services/stripe.service.ts` - Payment Processing

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `createPaymentIntent should call Stripe API` | API call |
| 🔗 Integration | `createPaymentIntent should handle success` | Success path |
| 🔗 Integration | `createPaymentIntent should handle failure` | Error path |
| 🔗 Integration | `createPaymentIntent with customer` | Customer param |
| 🔗 Integration | `createPaymentIntent with payment method` | Confirm flow |
| 🔗 Integration | `getPaymentIntent should retrieve intent` | Retrieval |
| 🔗 Integration | `cancelPaymentIntent should cancel intent` | Cancellation |
| 🔗 Integration | `createRefund should create full refund` | Full refund |
| 🔗 Integration | `createRefund should create partial refund` | Partial refund |
| 🔗 Integration | `createRefund should handle failure` | Error path |
| 🔗 Integration | `createCustomer should create customer` | Customer creation |
| 🔗 Integration | `attachPaymentMethod should attach method` | Method attachment |
| 🔗 Integration | `verifyWebhookSignature should verify valid sig` | Sig verification |
| 🔗 Integration | `verifyWebhookSignature should reject invalid sig` | Sig rejection |
| 🔗 Integration | `verifyWebhookSignature should skip if no secret` | No secret handling |
| 🧪 Unit | `getConfig should return test mode correctly` | Config check |

#### `src/services/nft.service.ts` - Solana NFT Minting

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `mintNFT should upload metadata` | Metadata upload |
| 🔗 Integration | `mintNFT should create NFT on-chain` | NFT creation |
| 🔗 Integration | `mintNFT should return explorer URL` | URL generation |
| 🔗 Integration | `mintNFT should handle invalid address` | Address validation |
| 🔗 Integration | `mintNFT should handle failure` | Error path |
| 🔗 Integration | `transferNFT should transfer to recipient` | Transfer |
| 🔗 Integration | `transferNFT should handle failure` | Error path |
| 🔗 Integration | `getNFTMetadata should retrieve metadata` | Metadata retrieval |
| 🔗 Integration | `verifyOwnership should return true for owner` | Ownership check |
| 🔗 Integration | `verifyOwnership should return false for non-owner` | Ownership check |
| 🔗 Integration | `getWalletBalance should return SOL balance` | Balance check |
| 🧪 Unit | `getExplorerUrl should format mainnet URL` | URL format |
| 🧪 Unit | `getExplorerUrl should format devnet URL` | URL format |
| 🧪 Unit | `getConfig should return network info` | Config check |

#### `src/services/email.service.ts` - Email Notifications

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `methods should return false when transporter not configured` | No config handling |
| 🔗 Integration | `sendPaymentConfirmation should send email` | Email sending |
| 🔗 Integration | `sendPaymentConfirmation should format HTML` | HTML template |
| 🔗 Integration | `sendRefundConfirmation should send email` | Email sending |
| 🔗 Integration | `sendRefundConfirmation should include reason` | Conditional content |
| 🔗 Integration | `sendNFTMintedConfirmation should send email` | Email sending |
| 🔗 Integration | `sendNFTMintedConfirmation should include image` | Conditional content |
| 🔗 Integration | `sendAdminAlert should send to admin email` | Admin email |
| 🔗 Integration | `sendAdminAlert should format JSON details` | JSON formatting |
| 🔗 Integration | `testConnection should verify transporter` | Connection test |

#### `src/services/webhook.service.ts` - Outbound Webhooks

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `sendWebhook should return false when URL not provided` | No URL handling |
| 🔗 Integration | `sendWebhook should POST to URL` | HTTP POST |
| 🔗 Integration | `sendWebhook should set correct headers` | Headers |
| 🔗 Integration | `sendWebhook should handle timeout` | Timeout handling |
| 🔗 Integration | `sendWebhook should handle errors` | Error handling |
| 🔗 Integration | `sendPaymentCompleted should use correct event type` | Event type |
| 🔗 Integration | `sendPaymentCompleted should use env fallback` | Fallback URL |
| 🔗 Integration | `sendRefundCompleted should use correct event type` | Event type |
| 🔗 Integration | `sendNFTMinted should use correct event type` | Event type |
| 🔗 Integration | `sendOperationFailed should use correct event type` | Event type |

#### `src/services/cache-integration.ts` - Shared Cache Wrapper

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `serviceCache.get should call underlying cache` | Cache get |
| 🔗 Integration | `serviceCache.get should use fetcher on miss` | Cache miss |
| 🔗 Integration | `serviceCache.set should set with TTL` | Cache set |
| 🔗 Integration | `serviceCache.delete should delete keys` | Cache delete |
| 🔗 Integration | `serviceCache.flush should clear all` | Cache flush |
| 🔗 Integration | `getCacheStats should return stats` | Stats retrieval |

---

### 4. Queue System

#### `src/queues/factories/queue.factory.ts` - pg-boss Factory

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `initialize should start pg-boss` | Initialization |
| 🔗 Integration | `initialize should be idempotent` | Double init |
| 🔗 Integration | `initialize should create persistence services` | Service creation |
| 🔗 Integration | `getBoss should throw before initialize` | Pre-init error |
| 🔗 Integration | `getBoss should return boss after initialize` | Post-init |
| 🔗 Integration | `getPersistenceService should return correct service` | Service lookup |
| 🔗 Integration | `getPersistenceService should throw for unknown type` | Error handling |
| 🔗 Integration | `getQueue should return adapter` | Adapter creation |
| 🔗 Integration | `shutdown should stop pg-boss` | Shutdown |
| 🔗 Integration | `getQueueMetrics should query pg-boss tables` | Metrics query |

#### `src/queues/definitions/money.queue.ts` - Critical Financial Queue

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `constructor should get boss instance` | Initialization |
| 🔗 Integration | `constructor should register payment processor` | Processor registration |
| 🔗 Integration | `constructor should register refund processor` | Processor registration |
| 🔗 Integration | `constructor should register nft processor` | Processor registration |
| 🔗 Integration | `addJob should send job to pg-boss` | Job addition |
| 🔗 Integration | `addJob should apply retry config` | Config application |
| 🔗 Integration | `payment job should invoke processor` | Job processing |
| 🔗 Integration | `refund job should invoke processor` | Job processing |
| 🔗 Integration | `nft job should invoke processor` | Job processing |

#### `src/queues/definitions/communication.queue.ts` - Email/SMS Queue

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `constructor should register email processor` | Processor registration |
| 🔗 Integration | `addJob should send job to pg-boss` | Job addition |
| 🔗 Integration | `addJob should apply retry config` | Config application |
| 🔗 Integration | `email job should invoke processor` | Job processing |

#### `src/queues/definitions/background.queue.ts` - Analytics/Cleanup Queue

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `constructor should register analytics processor` | Processor registration |
| 🔗 Integration | `addJob should send job to pg-boss` | Job addition |
| 🔗 Integration | `addJob should apply retry config` | Config application |
| 🔗 Integration | `analytics job should invoke processor` | Job processing |

---

### 5. Workers/Processors

#### `src/workers/base.worker.ts` - Abstract Worker Base Class

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `process should log job start` | Logging |
| 🧪 Unit | `process should calculate duration` | Duration calculation |
| 🧪 Unit | `process should log job completion` | Logging |
| 🧪 Unit | `process should log job failure` | Logging |
| 🧪 Unit | `process should re-throw errors` | Error propagation |
| 🧪 Unit | `process should handle Error objects` | Error handling |
| 🧪 Unit | `process should handle non-Error objects` | Error handling |

#### `src/workers/money/payment.processor.ts` - Payment Processing

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `isRetryableError should return true for ECONNREFUSED` | Error classification |
| 🧪 Unit | `isRetryableError should return true for ETIMEDOUT` | Error classification |
| 🧪 Unit | `isRetryableError should return true for rate_limit_error` | Error classification |
| 🧪 Unit | `isRetryableError should return true for 500 status` | Error classification |
| 🧪 Unit | `isRetryableError should return false for 400 status` | Error classification |
| 🧪 Unit | `isRetryableError should return false for card declined` | Error classification |
| 🔗 Integration | `execute should check idempotency first` | Idempotency check |
| 🔗 Integration | `execute should return cached result if idempotent` | Cache hit |
| 🔗 Integration | `execute should acquire rate limit` | Rate limiting |
| 🔗 Integration | `execute should call payment service` | Service call |
| 🔗 Integration | `execute should release rate limit` | Rate limit release |
| 🔗 Integration | `execute should store result for idempotency` | Cache store |
| 🔗 Integration | `execute should handle non-retryable errors` | Error handling |

#### `src/workers/money/refund.processor.ts` - Refund Processing

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `execute should check idempotency first` | Idempotency check |
| 🔗 Integration | `execute should return cached result if idempotent` | Cache hit |
| 🔗 Integration | `execute should call stripe refund service` | Service call |
| 🔗 Integration | `execute should store result for idempotency` | Cache store |

**⚠️ NOTE: Current implementation uses simulation - needs real Stripe integration**

#### `src/workers/money/nft-mint.processor.ts` - NFT Minting

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `execute should check idempotency first` | Idempotency check |
| 🔗 Integration | `execute should return cached result if idempotent` | Cache hit |
| 🔗 Integration | `execute should call nft service` | Service call |
| 🔗 Integration | `execute should store result with 1 year TTL` | Long TTL |

**⚠️ NOTE: Current implementation uses simulation - needs real Solana integration**

#### `src/workers/communication/email.processor.ts` - Email Sending

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `execute should check idempotency with daily key` | Daily uniqueness |
| 🔗 Integration | `execute should return cached result if sent today` | Cache hit |
| 🔗 Integration | `execute should acquire sendgrid rate limit` | Rate limiting |
| 🔗 Integration | `execute should call email service` | Service call |
| 🔗 Integration | `execute should release rate limit` | Rate limit release |
| 🔗 Integration | `execute should store result with 24hr TTL` | TTL |

**⚠️ NOTE: Current implementation uses simulation - needs real email integration**

#### `src/workers/background/analytics.processor.ts` - Analytics Tracking

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `execute should check idempotency with timestamp` | Timestamp uniqueness |
| 🔗 Integration | `execute should return cached result if processed` | Cache hit |
| 🔗 Integration | `execute should call analytics service` | Service call |
| 🔗 Integration | `execute should store result with 7 day TTL` | TTL |

---

### 6. Adapters

#### `src/adapters/bull-job-adapter.ts` - Job Wrapper

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `createBullJobAdapter should extract data` | Data extraction |
| 🧪 Unit | `createBullJobAdapter should handle null id` | Null handling |
| 🧪 Unit | `createBullJobAdapter should default name to unknown` | Default name |
| 🧪 Unit | `createBullJobAdapter should create queue object` | Queue creation |
| 🧪 Unit | `log function should format message` | Log formatting |
| 🧪 Unit | `progress function should be callable` | Progress function |

#### `src/adapters/bull-queue-adapter.ts` - Queue Wrapper

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `add should translate attempts to retryLimit` | Option translation |
| 🧪 Unit | `add should translate backoff.delay to retryDelay` | Option translation |
| 🧪 Unit | `add should translate exponential backoff` | Option translation |
| 🧪 Unit | `add should translate priority` | Option translation |
| 🔗 Integration | `add should send job to pg-boss` | Job sending |
| 🔗 Integration | `getJobCounts should query pg-boss tables` | Metrics query |

**⚠️ NOTE: Most methods are stubs - need implementation**

---

### 7. Controllers

#### `src/controllers/health.controller.ts` - Health Checks

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `checkHealth should return 200 when all healthy` | Happy path |
| 🔗 Integration | `checkHealth should return 503 when DB unhealthy` | DB failure |
| 🔗 Integration | `checkHealth should return 503 when queues unhealthy` | Queue failure |
| 🔗 Integration | `checkHealth should include all check results` | Response format |
| 🔗 Integration | `checkReadiness should return 200 when DB connected` | Ready check |
| 🔗 Integration | `checkReadiness should return 503 when DB down` | Not ready |

#### `src/controllers/queue.controller.ts` - Queue Management

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `listQueues should return all queue metrics` | Queue listing |
| 🔗 Integration | `getQueueStatus should return queue details` | Status retrieval |
| 🔗 Integration | `getQueueStatus should include job samples` | Sample jobs |
| 🔗 Integration | `pauseQueue should pause queue` | Pause operation |
| 🔗 Integration | `pauseQueue should log user action` | Audit logging |
| 🔗 Integration | `resumeQueue should resume queue` | Resume operation |
| 🔗 Integration | `clearQueue should clear by type` | Selective clear |
| 🔗 Integration | `clearQueue should empty all` | Full clear |
| 🔗 Integration | `getQueueJobs should filter by status` | Status filtering |
| 🔗 Integration | `getQueueJobs should paginate results` | Pagination |

#### `src/controllers/job.controller.ts` - Job Management

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `validateJobData should require amount for payment` | Validation |
| 🧪 Unit | `validateJobData should require transactionId for refund` | Validation |
| 🧪 Unit | `validateJobData should require to for email` | Validation |
| 🧪 Unit | `validateJobData should validate email format` | Email validation |
| 🧪 Unit | `validateJobData should require targetId for background` | Validation |
| 🧪 Unit | `sanitizeJobData should remove __ keys` | Sanitization |
| 🧪 Unit | `sanitizeJobData should remove prototype keys` | Sanitization |
| 🧪 Unit | `sanitizeJobData should remove script tags` | XSS prevention |
| 🧪 Unit | `sanitizeJobData should remove SQL keywords` | SQL prevention |
| 🧪 Unit | `sanitizeJobData should handle nested objects` | Recursion |
| 🧪 Unit | `isValidEmail should validate correct emails` | Email validation |
| 🧪 Unit | `isValidEmail should reject invalid emails` | Email validation |
| 🧪 Unit | `getRequiredFieldsForJobType should return correct fields` | Field mapping |
| 🔗 Integration | `addJob should add job to queue` | Job addition |
| 🔗 Integration | `addJob should add user context` | Context enrichment |
| 🔗 Integration | `addJob should apply priority defaults` | Default options |
| 🔗 Integration | `getJob should return job details` | Job retrieval |
| 🔗 Integration | `getJob should return 404 for missing job` | Not found |
| 🔗 Integration | `retryJob should retry failed job` | Job retry |
| 🔗 Integration | `cancelJob should remove job` | Job cancellation |
| 🔗 Integration | `addBatchJobs should add multiple jobs` | Batch add |
| 🔗 Integration | `addBatchJobs should validate all jobs first` | Validation |
| 🔗 Integration | `addBatchJobs should rollback on stopOnError` | Rollback |
| 🔗 Integration | `addBatchJobs should continue on partial failure` | Partial success |

#### `src/controllers/metrics.controller.ts` - Prometheus/Monitoring

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `getPrometheusMetrics should return text/plain` | Content type |
| 🔗 Integration | `getPrometheusMetrics should return valid format` | Prometheus format |
| 🔗 Integration | `getMetricsSummary should return queue stats` | Summary |
| 🔗 Integration | `getMetricsSummary should return alert counts` | Alert stats |
| 🔗 Integration | `getThroughput should calculate jobs per minute` | Throughput |
| 🔗 Integration | `getFailureAnalysis should return trends` | Failure trends |
| 🔗 Integration | `getFailureAnalysis should return top failures` | Top failures |

#### `src/controllers/alerts.controller.ts` - Alert Management

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `getAlerts should return recent alerts` | Alert retrieval |
| 🔗 Integration | `getAlerts should filter by severity` | Severity filter |
| 🔗 Integration | `getAlerts should respect limit` | Pagination |
| 🔗 Integration | `acknowledgeAlert should update alert` | Acknowledgment |
| 🔗 Integration | `acknowledgeAlert should record user` | Audit |
| 🔗 Integration | `testAlert should log test alert` | Test alert |

#### `src/controllers/rate-limit.controller.ts` - Rate Limit Admin

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `getStatus should return all limiter status` | Status retrieval |
| 🔗 Integration | `checkLimit should return limited state` | Limit check |
| 🔗 Integration | `checkLimit should return wait time` | Wait time |
| 🔗 Integration | `resetLimit should reset service limiter` | Reset |
| 🔗 Integration | `resetLimit should log user action` | Audit |
| 🔗 Integration | `emergencyStop should pause all limiters` | Emergency stop |
| 🔗 Integration | `resume should restore all limiters` | Resume |

---

### 8. Middleware

#### `src/middleware/auth.middleware.ts` - JWT Authentication

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `authenticate should return 401 without header` | No auth header |
| 🧪 Unit | `authenticate should return 401 with invalid format` | Bad format |
| 🧪 Unit | `authenticate should return 401 with invalid token` | Invalid token |
| 🧪 Unit | `authenticate should return 401 with expired token` | Expired token |
| 🧪 Unit | `authenticate should attach user to request` | Success path |
| 🧪 Unit | `authorize should return 403 without role` | No role |
| 🧪 Unit | `authorize should return 403 with wrong role` | Wrong role |
| 🧪 Unit | `authorize should pass with correct role` | Correct role |
| 🧪 Unit | `optionalAuthMiddleware should continue without token` | Optional auth |
| 🧪 Unit | `optionalAuthMiddleware should attach user if valid` | Valid token |

#### `src/middleware/error.middleware.ts` - Error Handler

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should return correct status for AppError` | AppError handling |
| 🧪 Unit | `should return 500 for generic errors` | Default status |
| 🧪 Unit | `should hide message in production` | Production mode |
| 🧪 Unit | `should show message in development` | Development mode |
| 🧪 Unit | `should log error with stack trace` | Error logging |

#### `src/middleware/validation.middleware.ts` - Joi Validation

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `validateBody should pass valid body` | Valid input |
| 🧪 Unit | `validateBody should return 400 on invalid` | Invalid input |
| 🧪 Unit | `validateBody should strip unknown fields` | Strip unknown |
| 🧪 Unit | `validateBody should return all errors` | All errors |
| 🧪 Unit | `validateBody should format error response` | Error format |
| 🧪 Unit | `validateQuery should validate query params` | Query validation |
| 🧪 Unit | `validateParams should validate route params` | Param validation |

#### `src/middleware/logging.middleware.ts` - Request Logging

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should log request method and URL` | Request logging |
| 🧪 Unit | `should log response status and duration` | Response logging |
| 🧪 Unit | `should calculate duration correctly` | Duration calculation |

#### `src/middleware/metrics.middleware.ts` - In-Memory Metrics

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should increment total requests` | Counter increment |
| 🧪 Unit | `should track requests by endpoint` | Endpoint tracking |
| 🧪 Unit | `should track requests by status` | Status tracking |
| 🧪 Unit | `should calculate average response time` | Average calculation |
| 🧪 Unit | `getMetrics should return current metrics` | Metrics retrieval |

#### `src/middleware/rate-limit.middleware.ts` - API Rate Limiting

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `should return 429 when rate limited` | Rate limit response |
| 🔗 Integration | `should set rate limit headers` | Headers |
| 🔗 Integration | `should set Retry-After header` | Retry header |
| 🔗 Integration | `should acquire rate limit` | Acquisition |
| 🔗 Integration | `should release on response finish` | Release |
| 🔗 Integration | `should allow request on error` | Fail open |

#### `src/middleware/tenant-context.ts` - Multi-Tenancy

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should extract tenant from user.tenant_id` | Extraction order |
| 🧪 Unit | `should extract tenant from user.tenantId` | Extraction order |
| 🧪 Unit | `should extract tenant from request.tenantId` | Extraction order |
| 🧪 Unit | `should use default tenant as fallback` | Default fallback |
| 🔗 Integration | `should set PostgreSQL session variable` | RLS setup |
| 🔗 Integration | `should attach tenantId to request` | Request enrichment |

---

### 9. Utils

#### `src/utils/logger.ts` - Winston Logger

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should use debug level in development` | Log level |
| 🧪 Unit | `should use info level in production` | Log level |

#### `src/utils/errors.ts` - Custom Error Classes

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `AppError should set statusCode` | Status code |
| 🧪 Unit | `AppError should set message` | Message |
| 🧪 Unit | `AppError should capture stack trace` | Stack trace |
| 🧪 Unit | `AppError should set isOperational` | Operational flag |
| 🧪 Unit | `ValidationError should set 400 status` | Status code |
| 🧪 Unit | `NotFoundError should set 404 status` | Status code |

#### `src/utils/circuit-breaker.ts` - Circuit Breaker Pattern

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `initial state should be CLOSED` | Initial state |
| 🧪 Unit | `should open after failureThreshold failures` | State transition |
| 🧪 Unit | `should reject immediately when OPEN` | Open rejection |
| 🧪 Unit | `should transition to HALF_OPEN after timeout` | Timeout transition |
| 🧪 Unit | `should close after successThreshold in HALF_OPEN` | Recovery |
| 🧪 Unit | `should return to OPEN on failure in HALF_OPEN` | Failure in half-open |
| 🧪 Unit | `forceReset should reset to CLOSED` | Manual reset |
| 🧪 Unit | `getState should return current state` | State getter |
| 🧪 Unit | `getStats should return all stats` | Stats |
| 🧪 Unit | `success in CLOSED should reset failure count` | Counter reset |

#### `src/utils/token-bucket.ts` - Token Bucket Algorithm

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `initial tokens should equal maxTokens` | Initialization |
| 🧪 Unit | `consume should reduce token count` | Consumption |
| 🧪 Unit | `consume should return false when empty` | Empty bucket |
| 🧪 Unit | `consume should accept multiple tokens` | Multi-token |
| 🧪 Unit | `tokens should refill over time` | Refill |
| 🧪 Unit | `tokens should not exceed maxTokens` | Max cap |
| 🧪 Unit | `waitForTokens should wait until available` | Wait behavior |
| 🧪 Unit | `waitForTokens should timeout` | Timeout |
| 🧪 Unit | `getTokenCount should trigger refill` | Lazy refill |
| 🧪 Unit | `getTimeUntilNextToken should calculate delay` | Time calculation |

#### `src/utils/advanced-retry.ts` - Retry Strategies

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `calculateRetryDelay exponential: 2^attempt * baseDelay` | Exponential |
| 🧪 Unit | `calculateRetryDelay linear: attempt * baseDelay` | Linear |
| 🧪 Unit | `calculateRetryDelay fibonacci: fib(attempt) * baseDelay` | Fibonacci |
| 🧪 Unit | `calculateRetryDelay fixed: always baseDelay` | Fixed |
| 🧪 Unit | `maxDelay should cap delay` | Max cap |
| 🧪 Unit | `jitter should add randomness within ±25%` | Jitter |
| 🧪 Unit | `fibonacci helper should calculate correctly` | Fibonacci calculation |
| 🧪 Unit | `shouldRetryJob should respect maxAttempts` | Max attempts |
| 🧪 Unit | `shouldRetryJob should detect non-retryable errors` | Error detection |
| 🧪 Unit | `isNonRetryableError: invalid credentials` | Pattern matching |
| 🧪 Unit | `isNonRetryableError: authentication failed` | Pattern matching |
| 🧪 Unit | `isNonRetryableError: not found` | Pattern matching |
| 🧪 Unit | `isNonRetryableError: bad request` | Pattern matching |
| 🧪 Unit | `isNonRetryableError: timeout should be retryable` | Retryable error |
| 🧪 Unit | `getRetryConfig should return preset for payment` | Preset lookup |
| 🧪 Unit | `getRetryConfig should return preset for refund` | Preset lookup |
| 🧪 Unit | `getRetryConfig should return preset for mint` | Preset lookup |
| 🧪 Unit | `getRetryConfig should return default for unknown` | Fallback |

#### `src/utils/job-priority.ts` - Priority Management

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `getPriorityForJobType: payment -> CRITICAL` | Priority mapping |
| 🧪 Unit | `getPriorityForJobType: refund -> CRITICAL` | Priority mapping |
| 🧪 Unit | `getPriorityForJobType: mint -> HIGH` | Priority mapping |
| 🧪 Unit | `getPriorityForJobType: email -> NORMAL` | Priority mapping |
| 🧪 Unit | `getPriorityForJobType: analytics -> LOW` | Priority mapping |
| 🧪 Unit | `getPriorityForJobType: cleanup -> BACKGROUND` | Priority mapping |
| 🧪 Unit | `getPriorityForJobType: unknown -> NORMAL` | Default |
| 🧪 Unit | `getAttemptsForPriority: CRITICAL -> 5` | Attempt count |
| 🧪 Unit | `getAttemptsForPriority: HIGH -> 3` | Attempt count |
| 🧪 Unit | `getAttemptsForPriority: NORMAL -> 2` | Attempt count |
| 🧪 Unit | `getBackoffForPriority: CRITICAL -> 1s exponential` | Backoff config |
| 🧪 Unit | `getBackoffForPriority: HIGH -> 2s exponential` | Backoff config |
| 🧪 Unit | `getBackoffForPriority: NORMAL -> 5s exponential` | Backoff config |
| 🧪 Unit | `shouldPrioritize should compare correctly` | Priority comparison |
| 🧪 Unit | `getDelayMultiplier should return correct values` | Delay multiplier |
| 🧪 Unit | `getJobOptionsWithPriority should return full config` | Options builder |

---

### 10. Types & Models

#### `src/models/Job.ts` - Job Database Model

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `create should insert job` | Insert |
| 🔗 Integration | `findById should return job` | Select |
| 🔗 Integration | `findById should return null for missing` | Not found |
| 🔗 Integration | `findPending should filter by queue and status` | Filtering |
| 🔗 Integration | `findPending should respect scheduled_for` | Scheduling |
| 🔗 Integration | `update should update job` | Update |
| 🔗 Integration | `markAsProcessing should atomically update` | Atomic update |
| 🔗 Integration | `delete should remove job` | Delete |

**⚠️ NOTE: Model is unused - pg-boss manages jobs**

#### `src/models/Queue.ts` - Queue Database Model

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `create should insert queue` | Insert |
| 🔗 Integration | `findByName should return queue` | Lookup |
| 🔗 Integration | `findAll should return all queues` | List |
| 🔗 Integration | `incrementCounter should increment count` | Counter |
| 🔗 Integration | `update should update queue` | Update |
| 🔗 Integration | `delete should remove queue` | Delete |

**⚠️ NOTE: Model is unused**

#### `src/models/RateLimit.ts` - Rate Limit Database Model

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `create should insert rate limit` | Insert |
| 🔗 Integration | `findByKey should return rate limit` | Lookup |
| 🔗 Integration | `increment should increment within window` | Increment |
| 🔗 Integration | `increment should not increment after reset` | Window check |
| 🔗 Integration | `reset should reset counter and window` | Reset |

**⚠️ NOTE: Model is unused - RateLimiterService uses rate_limiters table**

#### `src/models/Schedule.ts` - Schedule Database Model

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `create should insert schedule` | Insert |
| 🔗 Integration | `findById should return schedule` | Lookup |
| 🔗 Integration | `findActive should return active schedules` | Filtering |
| 🔗 Integration | `update should update schedule` | Update |
| 🔗 Integration | `delete should remove schedule` | Delete |

**⚠️ NOTE: Model is unused - pg-boss has built-in scheduling**

---

### 11. Processors (Alternative Implementations)

#### `src/processors/mint.processor.ts` - NFT Mint Processor

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `processMint should check wallet balance` | Balance check |
| 🔗 Integration | `processMint should call nftService.mintNFT` | Service call |
| 🔗 Integration | `processMint should update progress` | Progress tracking |
| 🔗 Integration | `processMint should throw on failure` | Error handling |
| 🔗 Integration | `onMintFailed should send admin alert` | Alert |
| 🔗 Integration | `onMintFailed should send failure webhook` | Webhook |
| 🔗 Integration | `onMintCompleted should send email if user data` | Email |
| 🔗 Integration | `onMintCompleted should send webhook` | Webhook |
| 🔗 Integration | `processTransfer should call nftService.transferNFT` | Transfer |
| 🔗 Integration | `processTransfer should throw on failure` | Error handling |

#### `src/processors/payment.processor.ts` - Payment Processor

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `processPayment should call stripeService` | Service call |
| 🔗 Integration | `processPayment should update progress` | Progress tracking |
| 🔗 Integration | `processPayment should throw on failure` | Error handling |
| 🔗 Integration | `onPaymentFailed should send admin alert` | Alert |
| 🔗 Integration | `onPaymentFailed should send failure webhook` | Webhook |
| 🔗 Integration | `onPaymentCompleted should send email` | Email |
| 🔗 Integration | `onPaymentCompleted should send webhook` | Webhook |

#### `src/processors/refund.processor.ts` - Refund Processor

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `processRefund should call stripeService` | Service call |
| 🔗 Integration | `processRefund should update progress` | Progress tracking |
| 🔗 Integration | `processRefund should throw on failure` | Error handling |
| 🔗 Integration | `onRefundFailed should send admin alert` | Alert |
| 🔗 Integration | `onRefundFailed should send failure webhook` | Webhook |
| 🔗 Integration | `onRefundCompleted should send email` | Email |
| 🔗 Integration | `onRefundCompleted should send webhook` | Webhook |

---

### 12. Routes

#### `src/routes/index.ts` - Route Registration

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `should mount job routes at /jobs` | Route mounting |
| 🔗 Integration | `should mount queue routes at /queues` | Route mounting |
| 🔗 Integration | `should mount health routes at /health` | Route mounting |
| 🔗 Integration | `should mount metrics routes at /metrics` | Route mounting |
| 🔗 Integration | `should mount alerts routes at /alerts` | Route mounting |
| 🔗 Integration | `should mount rate-limit routes at /rate-limits` | Route mounting |
| 🔗 Integration | `root endpoint should return API info` | API info |
| 🔗 Integration | `cache/stats should return cache stats` | Cache stats |
| 🔗 Integration | `cache/flush should flush cache` | Cache flush |

#### `src/routes/job.routes.ts` - Job API Routes

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `POST / should require authentication` | Auth check |
| 🔗 Integration | `POST / should validate body` | Validation |
| 🔗 Integration | `GET /:id should require authentication` | Auth check |
| 🔗 Integration | `POST /:id/retry should require admin role` | Role check |
| 🔗 Integration | `DELETE /:id should require admin role` | Role check |
| 🔗 Integration | `POST /batch should require admin role` | Role check |

#### `src/routes/queue.routes.ts` - Queue API Routes

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `GET / should require authentication` | Auth check |
| 🔗 Integration | `GET /:name/status should require authentication` | Auth check |
| 🔗 Integration | `GET /:name/jobs should require authentication` | Auth check |
| 🔗 Integration | `POST /:name/pause should require admin role` | Role check |
| 🔗 Integration | `POST /:name/resume should require admin role` | Role check |
| 🔗 Integration | `POST /:name/clear should require admin role` | Role check |

---

### 13. Migration

#### `src/migrations/001_baseline_queue.ts` - Database Schema

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `up should create all 10 tables` | Table creation |
| 🔗 Integration | `up should create indexes` | Index creation |
| 🔗 Integration | `up should enable RLS on all tables` | RLS enablement |
| 🔗 Integration | `up should create RLS policies` | Policy creation |
| 🔗 Integration | `up should seed rate_limiters` | Seed data |
| 🔗 Integration | `down should drop all tables` | Table dropping |
| 🔗 Integration | `down should drop RLS policies` | Policy dropping |

---

## E2E Test Scenarios

### Payment Flow
```typescript
describe('Payment E2E Flow', () => {
  it('should process payment from job to completion', async () => {
    // 1. Add payment job to queue
    // 2. Wait for job processing
    // 3. Verify Stripe API called (mocked)
    // 4. Verify idempotency key stored
    // 5. Verify email sent (mocked)
    // 6. Verify webhook sent (mocked)
    // 7. Verify job marked complete
  });

  it('should handle payment failure with retries', async () => {
    // 1. Add payment job
    // 2. Mock Stripe to fail
    // 3. Verify retries with backoff
    // 4. Verify eventual DLQ placement
    // 5. Verify admin alert sent
  });

  it('should prevent duplicate payments via idempotency', async () => {
    // 1. Add payment job
    // 2. Wait for completion
    // 3. Add same job again
    // 4. Verify cached result returned
    // 5. Verify Stripe NOT called again
  });
});
```

### Refund Flow
```typescript
describe('Refund E2E Flow', () => {
  it('should process refund from job to completion', async () => {
    // 1. Add refund job to queue
    // 2. Wait for job processing
    // 3. Verify Stripe refund API called
    // 4. Verify email sent
    // 5. Verify webhook sent
    // 6. Verify job marked complete
  });

  it('should handle partial refunds', async () => {
    // 1. Add refund job with specific amount
    // 2. Verify partial refund in Stripe
  });
});
```

### NFT Mint Flow
```typescript
describe('NFT Mint E2E Flow', () => {
  it('should mint NFT from job to completion', async () => {
    // 1. Add mint job to queue
    // 2. Wait for job processing
    // 3. Verify metadata upload (mocked)
    // 4. Verify NFT creation on Solana (mocked)
    // 5. Verify email sent with explorer link
    // 6. Verify webhook sent
  });

  it('should handle low balance warning', async () => {
    // 1. Mock low wallet balance
    // 2. Add mint job
    // 3. Verify warning logged
    // 4. Verify mint still proceeds
  });

  it('should handle mint failure', async () => {
    // 1. Mock Solana failure
    // 2. Add mint job
    // 3. Verify retries
    // 4. Verify admin alert
  });
});
```

### Email Flow
```typescript
describe('Email E2E Flow', () => {
  it('should send email and prevent duplicates same day', async () => {
    // 1. Add email job
    // 2. Wait for completion
    // 3. Verify email sent
    // 4. Add same job again
    // 5. Verify cached result
    // 6. Verify email NOT sent again
  });

  it('should allow same email next day', async () => {
    // 1. Add email job
    // 2. Wait for completion
    // 3. Advance time by 24 hours
    // 4. Add same job
    // 5. Verify email sent again
  });
});
```

### Service Startup Flow
```typescript
describe('Service Startup E2E Flow', () => {
  it('should start service with all components', async () => {
    // 1. Start service
    // 2. Verify DB connected
    // 3. Verify pg-boss started
    // 4. Verify queues initialized
    // 5. Verify recovery service ran
    // 6. Verify monitoring started
    // 7. Verify health endpoint returns 200
  });

  it('should recover pending jobs on restart', async () => {
    // 1. Add job to queue
    // 2. Simulate service crash (stop without cleanup)
    // 3. Restart service
    // 4. Verify job recovered and processed
  });

  it('should handle graceful shutdown', async () => {
    // 1. Start service
    // 2. Add jobs to queue
    // 3. Send SIGTERM
    // 4. Verify in-progress jobs complete
    // 5. Verify pg-boss stopped
    // 6. Verify clean exit
  });
});
```

---

## Test Infrastructure Requirements

### Dependencies
```json
{
  "devDependencies": {
    "jest": "^29.x",
    "@types/jest": "^29.x",
    "ts-jest": "^29.x",
    "supertest": "^6.x",
    "@types/supertest": "^2.x",
    "testcontainers": "^10.x",
    "nock": "^13.x",
    "pg-mem": "^2.x"
  }
}
```

### Test Database

- Use `testcontainers` for PostgreSQL
- Or `pg-mem` for in-memory testing
- Run migrations before tests

### Mocking Strategy

| External Service | Mock Library | Notes |
|------------------|--------------|-------|
| Stripe | `nock` or `stripe-mock` | Mock HTTP calls |
| Solana/Metaplex | Custom mocks | Mock SDK methods |
| SendGrid | `nock` | Mock HTTP calls |
| Twilio | `nock` | Mock HTTP calls |
| Redis | `ioredis-mock` | In-memory Redis |

### Test Environment Variables
```bash
NODE_ENV=test
DATABASE_URL=postgresql://test:test@localhost:5432/queue_test
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=test-secret
STRIPE_SECRET_KEY=sk_test_xxx
SOLANA_PRIVATE_KEY=<test-keypair>
```

---

## Priority Matrix

### Phase 1: Critical Path (Week 1-2)

| Priority | Component | Test Count |
|----------|-----------|------------|
| P0 | IdempotencyService | 15 |
| P0 | PaymentProcessor | 12 |
| P0 | CircuitBreaker | 10 |
| P0 | TokenBucket | 10 |
| P0 | Auth Middleware | 10 |
| P0 | Error Middleware | 5 |

### Phase 2: Core Services (Week 3-4)

| Priority | Component | Test Count |
|----------|-----------|------------|
| P1 | MonitoringService | 15 |
| P1 | RateLimiterService | 15 |
| P1 | RecoveryService | 8 |
| P1 | PersistenceService | 10 |
| P1 | QueueFactory | 10 |
| P1 | Queue Definitions | 12 |

### Phase 3: External Integrations (Week 5-6)

| Priority | Component | Test Count |
|----------|-----------|------------|
| P2 | StripeService | 15 |
| P2 | NFTService | 12 |
| P2 | EmailService | 10 |
| P2 | WebhookService | 10 |
| P2 | DeadLetterQueueService | 12 |

### Phase 4: Controllers & E2E (Week 7-8)

| Priority | Component | Test Count |
|----------|-----------|------------|
| P3 | JobController | 15 |
| P3 | QueueController | 10 |
| P3 | MetricsController | 8 |
| P3 | E2E Payment Flow | 5 |
| P3 | E2E NFT Flow | 5 |
| P3 | E2E Startup Flow | 5 |

---

## Appendix: Test File Template
```typescript
// src/__tests__/unit/services/idempotency.service.test.ts

import { IdempotencyService } from '../../../services/idempotency.service';

describe('IdempotencyService', () => {
  let service: IdempotencyService;
  let mockPool: any;

  beforeEach(() => {
    mockPool = {
      query: jest.fn(),
    };
    // Mock getPool
    jest.mock('../../../config/database.config', () => ({
      getPool: () => mockPool,
    }));
    service = new IdempotencyService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateKey', () => {
    it('should generate correct key for payment-process', () => {
      const data = {
        venueId: 'venue-1',
        userId: 'user-1',
        eventId: 'event-1',
        amount: 1000,
      };
      const key = service.generateKey('payment-process', data);
      expect(key).toBe('payment-venue-1-user-1-event-1-1000');
    });

    // ... more tests
  });

  describe('check', () => {
    it('should return null for new key', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });
      const result = await service.check('new-key');
      expect(result).toBeNull();
    });

    // ... more tests
  });
});
```

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Jan 2025 | AI Review | Initial test plan from codebase review |

---

*This document should be updated as tests are implemented and new requirements emerge.*