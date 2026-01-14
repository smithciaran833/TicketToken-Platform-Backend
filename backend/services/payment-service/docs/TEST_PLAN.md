# Payment Service Test Plan

**Version:** 1.0  
**Date:** January 5, 2026  
**Service:** TicketToken Payment Service  
**Author:** Generated from comprehensive code review

---

## Table of Contents

1. [Overview](#1-overview)
2. [Test Strategy](#2-test-strategy)
3. [Entry Points & Configuration](#3-entry-points--configuration)
4. [Controllers](#4-controllers)
5. [Routes](#5-routes)
6. [Core Services](#6-core-services)
7. [Fraud Detection Services](#7-fraud-detection-services)
8. [Marketplace Services](#8-marketplace-services)
9. [Blockchain Services](#9-blockchain-services)
10. [Compliance Services](#10-compliance-services)
11. [Group Payment Services](#11-group-payment-services)
12. [High-Demand Services](#12-high-demand-services)
13. [Middleware](#13-middleware)
14. [Utilities](#14-utilities)
15. [Validators](#15-validators)
16. [Background Jobs](#16-background-jobs)
17. [Critical Test Scenarios](#17-critical-test-scenarios)
18. [Test Environment Setup](#18-test-environment-setup)

---

## 1. Overview

### 1.1 Scope

This test plan covers comprehensive testing for the TicketToken Payment Service, including:

- **Unit Tests**: Individual function/class testing with mocked dependencies
- **Integration Tests**: Component interaction testing with real databases/Redis
- **End-to-End Tests**: Full API workflow testing

### 1.2 Key Testing Principles

1. **All monetary values are in INTEGER CENTS** - No floating point for money
2. **Multi-tenant isolation** - Every test must validate tenant context
3. **PCI-DSS compliance** - No sensitive card data in logs
4. **Idempotency** - Payment operations must be idempotent
5. **Security first** - JWT validation, HMAC signatures, timing-safe comparisons

### 1.3 Coverage Targets

| Category | Target |
|----------|--------|
| Unit Tests | 80% line coverage |
| Integration Tests | All critical paths |
| E2E Tests | Core user journeys |

---

## 2. Test Strategy

### 2.1 Test Pyramid
```
        /\
       /E2E\        <- Few, slow, high-value
      /------\
     /Integr- \     <- Medium, test interactions
    / ation    \
   /------------\
  /   Unit Tests \  <- Many, fast, isolated
 /________________\
```

### 2.2 Test Categories

| Category | Description | Tools |
|----------|-------------|-------|
| Unit | Isolated function testing | Jest, ts-jest |
| Integration | Database/Redis/API testing | Jest, supertest, testcontainers |
| E2E | Full workflow testing | Jest, supertest |
| Security | Auth, injection, PCI compliance | Custom security tests |
| Performance | Load and stress testing | k6, artillery |

### 2.3 Mocking Strategy

| Dependency | Mock Approach |
|------------|---------------|
| Stripe API | `stripe-mock` or Jest mocks |
| PostgreSQL | Testcontainers or in-memory |
| Redis | Testcontainers or ioredis-mock |
| External Services | nock or msw |

---

## 3. Entry Points & Configuration

### 3.1 `src/app.ts` - Application Bootstrap

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | Fastify instance created with correct options | High |
| Unit | All plugins registered (cors, helmet, etc.) | High |
| Unit | Routes mounted at correct prefixes | High |
| Unit | Error handlers registered | High |
| Unit | Graceful shutdown handlers registered | Medium |
| Integration | App starts and responds to health check | Critical |
| Integration | App connects to database on startup | Critical |
| Integration | App connects to Redis on startup | Critical |

### 3.2 `src/server.ts` - Server Entry Point

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | Server binds to configured port | High |
| Unit | Server binds to configured host | High |
| Unit | Startup logs contain correct info | Low |
| Integration | Server accepts HTTP connections | Critical |

### 3.3 `src/config/index.ts` - Configuration

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | All required env vars validated | Critical |
| Unit | Missing required vars throw descriptive errors | Critical |
| Unit | Default values applied correctly | High |
| Unit | Port parsed as integer | Medium |
| Unit | Boolean env vars parsed correctly | Medium |
| Unit | Stripe keys validated for environment | High |

### 3.4 `src/config/database.ts` - Database Configuration

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | Pool created with correct connection string | High |
| Unit | Pool size configurable via env | Medium |
| Unit | SSL enabled in production | Critical |
| Unit | Statement timeout configured | High |
| Integration | Pool connects to database | Critical |
| Integration | Pool handles connection failures gracefully | High |

### 3.5 `src/config/redis.ts` - Redis Configuration

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | Client created with correct URL | High |
| Unit | Reconnect strategy configured | High |
| Unit | `getRedis()` returns singleton | Medium |
| Integration | Client connects to Redis | Critical |
| Integration | Client handles reconnection | High |

### 3.6 `src/config/stripe.ts` - Stripe Configuration

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | Client created with correct API version | High |
| Unit | Timeout configured | Medium |
| Unit | Max retries configured | Medium |
| Unit | Telemetry disabled | Low |
| Unit | `getStripe()` returns singleton | Medium |

---

## 4. Controllers

### 4.1 `src/controllers/fee.controller.ts`

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | `calculateFees()` validates required fields | High |
| Unit | `calculateFees()` returns all fee components | High |
| Unit | `calculateFees()` handles service errors gracefully | High |
| Unit | Response includes platform, gas, tax, total | High |
| Unit | All amounts in integer cents | Critical |

### 4.2 `src/controllers/payment.controller.ts` ⭐

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | `processPayment()` extracts user from request | High |
| Unit | `processPayment()` validates payment request | Critical |
| Unit | `processPayment()` calls service with correct params | High |
| Unit | `processPayment()` returns transaction ID on success | High |
| Unit | `processPayment()` handles PaymentError correctly | Critical |
| Unit | `processPayment()` handles FraudError correctly | Critical |
| Unit | `processPayment()` handles generic errors | High |
| Unit | `getTransactionStatus()` validates transaction ID | High |
| Unit | `getTransactionStatus()` returns 404 for not found | High |
| Unit | `processRefund()` validates refund request | High |
| Unit | `processRefund()` handles partial refunds | High |
| Unit | Error responses use RFC 7807 format | High |

### 4.3 `src/controllers/webhook.controller.ts` ⭐

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | `handleStripeWebhook()` verifies signature | Critical |
| Unit | `handleStripeWebhook()` rejects invalid signatures | Critical |
| Unit | `handleStripeWebhook()` rejects missing signature | Critical |
| Unit | `handleStripeWebhook()` routes events to correct handlers | High |
| Unit | `handleStripeWebhook()` returns 200 for unknown events | Medium |
| Unit | `handleStripeWebhook()` handles processing errors | High |
| Unit | Idempotency check prevents duplicate processing | Critical |
| Integration | Full webhook flow with real signature | Critical |

---

## 5. Routes

### 5.1 `src/routes/health.routes.ts` ⭐ (Critical for K8s)

| Endpoint | Test Case | Priority |
|----------|-----------|----------|
| `GET /health` | Returns 200 with response time | Critical |
| `GET /health/live` | Returns 200 when event loop healthy | Critical |
| `GET /health/live` | Returns 503 when event loop lagging | Critical |
| `GET /health/startup` | Returns 200 when all deps ready | Critical |
| `GET /health/startup` | Returns 503 when DB unavailable | Critical |
| `GET /health/ready` | Does NOT check external services | Critical |
| `GET /health/ready` | Returns 503 when pool exhausted | High |
| `GET /health/db` | Returns pool statistics | Medium |
| `GET /health/redis` | Returns Redis connection status | Medium |

### 5.2 `src/routes/payment.routes.ts`

| Endpoint | Test Case | Priority |
|----------|-----------|----------|
| `POST /process` | Requires authentication | Critical |
| `POST /process` | Requires idempotency key | Critical |
| `POST /process` | Validates request body | High |
| `POST /process` | Enforces rate limit (10/min) | High |
| `POST /process` | Returns transaction on success | High |
| `POST /calculate-fees` | Validates venue ID format | High |
| `POST /calculate-fees` | Returns fee breakdown | High |
| `GET /transaction/:id` | Returns transaction status | High |
| `GET /transaction/:id` | Returns 404 for not found | High |
| `POST /transaction/:id/refund` | Validates refund amount | High |
| `POST /transaction/:id/refund` | Enforces rate limit (5/min) | High |

### 5.3 `src/routes/refund.routes.ts` ⭐

| Endpoint | Test Case | Priority |
|----------|-----------|----------|
| `POST /create` | Validates payment intent ID format | High |
| `POST /create` | Validates amount is positive integer | High |
| `POST /create` | Validates reason enum | High |
| `POST /create` | Enforces rate limit (5/min) | High |
| `POST /create` | Returns RFC 7807 on validation error | High |
| `GET /:refundId` | Validates refund ID format | High |
| `GET /:refundId` | Returns 404 for not found | High |
| `GET /` | Validates pagination params | Medium |
| `GET /` | Validates date range (createdAfter <= createdBefore) | High |
| `GET /info/:paymentIntentId` | Returns refundable amount | High |

### 5.4 `src/routes/escrow.routes.ts`

| Endpoint | Test Case | Priority |
|----------|-----------|----------|
| `POST /` | Validates order ID is UUID | High |
| `POST /` | Validates payment intent ID format | High |
| `POST /` | Creates escrow record | High |
| `GET /:escrowId` | Validates escrow ID is UUID | High |
| `GET /:escrowId` | Enforces tenant isolation | Critical |
| `POST /:escrowId/release` | Validates release amount | High |
| `POST /:escrowId/release` | Supports partial release | High |
| `POST /:escrowId/cancel` | Requires cancellation reason | High |

### 5.5 `src/routes/fraud.routes.ts` ⭐

| Endpoint | Test Case | Priority |
|----------|-----------|----------|
| `POST /check` | Performs multi-layer fraud check | High |
| `GET /review-queue` | Lists pending reviews with filters | High |
| `POST /review-queue/:id/assign` | Assigns to analyst | Medium |
| `POST /review-queue/:id/complete` | Records decision | High |
| `GET /stats` | Returns fraud statistics | Medium |
| `POST /rules` | Creates custom fraud rule | High |
| `PUT /rules/:id` | Updates existing rule | Medium |
| `POST /ip/:ipAddress/block` | Blocks IP address | High |

### 5.6 `src/routes/group-payment.routes.ts`

| Endpoint | Test Case | Priority |
|----------|-----------|----------|
| `POST /create` | Requires authentication | High |
| `POST /create` | Creates group with members | High |
| `POST /:groupId/contribute/:memberId` | No auth required (public link) | High |
| `POST /:groupId/contribute/:memberId` | Records contribution | High |
| `GET /:groupId/status` | Returns group status | High |
| `POST /:groupId/reminders` | Sends reminders to unpaid | Medium |

### 5.7 `src/routes/webhook.routes.ts`

| Endpoint | Test Case | Priority |
|----------|-----------|----------|
| `POST /stripe` | Accepts raw body | Critical |
| `POST /stripe` | Verifies Stripe signature | Critical |
| `POST /stripe` | Rejects invalid signatures | Critical |
| `POST /stripe` | Handles all event types | High |

### 5.8 `src/routes/admin.routes.ts`

| Endpoint | Test Case | Priority |
|----------|-----------|----------|
| All endpoints | Require admin role | Critical |
| `GET /status` | Returns service status | Medium |
| `POST /circuit-breakers/:name/reset` | Resets specific breaker | Medium |
| `POST /escrow/:escrowId/force-release` | Admin override works | High |
| `POST /maintenance/mode` | Toggles maintenance | Medium |

### 5.9 `src/routes/metrics.routes.ts`

| Endpoint | Test Case | Priority |
|----------|-----------|----------|
| `GET /metrics` | Returns Prometheus format | High |
| `GET /metrics` | Includes all registered metrics | High |
| `GET /metrics/json` | Returns JSON format | Medium |

### 5.10 `src/routes/venue.routes.ts`

| Endpoint | Test Case | Priority |
|----------|-----------|----------|
| `GET /:venueId/balance` | Returns venue balance | High |
| `POST /:venueId/payout` | Initiates payout | High |
| `GET /:venueId/payouts` | Returns payout history | Medium |

---

## 6. Core Services

### 6.1 `src/services/core/fee-calculator.service.ts` ⭐

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | `calculateDynamicFees()` returns all fee components | Critical |
| Unit | `getVenueTier()` returns STARTER for <$10k monthly | High |
| Unit | `getVenueTier()` returns PRO for $10k-$100k monthly | High |
| Unit | `getVenueTier()` returns ENTERPRISE for >$100k monthly | High |
| Unit | `percentOfCents()` calculates 250 bps = 2.5% correctly | Critical |
| Unit | `percentOfCents()` rounds correctly | Critical |
| Unit | Venue tier cache expires after 1 hour | Medium |
| Unit | Gas fee fallback to 50¢/ticket when service unavailable | High |
| Unit | Tax fallback to state rates when TaxJar unavailable | High |
| Integration | `VenueAnalyticsService` integration | High |
| Integration | `TaxCalculatorService` integration | High |

### 6.2 `src/services/core/gas-fee-estimator.service.ts`

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | `estimateGasFee()` calculates Solana in lamports | High |
| Unit | `estimateGasFee()` calculates Polygon in MATIC | High |
| Unit | `estimateGasFee()` calculates Ethereum in ETH | High |
| Unit | `convertToUSD()` uses CoinGecko prices | High |
| Unit | Gas estimates cached for 5 minutes | Medium |
| Unit | Fallback estimates: Solana 5¢, Polygon 10¢, ETH $5 | High |
| Unit | Network congestion detection | Medium |

### 6.3 `src/services/core/payment-processor.service.ts` ⭐ (Critical)

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | `processPayment()` creates Stripe PaymentIntent | Critical |
| Unit | `processPayment()` uses idempotency key | Critical |
| Unit | `processPayment()` handles card_error (non-retryable) | Critical |
| Unit | `processPayment()` handles rate_limit (retryable) | High |
| Unit | `processPayment()` handles network_error (retryable) | High |
| Unit | Circuit breaker opens after 5 failures | High |
| Unit | Circuit breaker closes after 2 successes in half-open | High |
| Unit | User-friendly error messages for decline codes | High |
| Unit | Transaction persisted to database | Critical |
| Integration | Full payment flow with Stripe mock | Critical |

### 6.4 `src/services/core/tax-calculator.service.ts`

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | `calculateTax()` calls TaxJar API | High |
| Unit | `calculateTax()` converts cents to dollars for TaxJar | Critical |
| Unit | `calculateTax()` converts TaxJar response back to cents | Critical |
| Unit | Tennessee: 7% state + local + 1% entertainment | High |
| Unit | Nashville/Memphis entertainment tax applied | High |
| Unit | Tax results cached for 24 hours | Medium |
| Unit | Fallback to state rates when TaxJar unavailable | High |
| Unit | Nexus checking for state obligations | Medium |

### 6.5 `src/services/core/venue-analytics.service.ts`

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | `getMonthlyVolume()` calculates 30-day rolling | High |
| Unit | `getYTDVolume()` calculates year-to-date | High |
| Unit | `getMonthlyTrends()` returns monthly breakdown | Medium |
| Unit | `getTierQualification()` determines upgrade eligibility | High |
| Integration | Database queries return correct aggregations | High |

### 6.6 `src/services/core/venue-balance.service.ts`

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | `getBalance()` returns available, pending, reserved | High |
| Unit | `calculatePayout()` applies risk-based reserve (5%/10%/15%) | High |
| Unit | `calculatePayout()` enforces $100 minimum | High |
| Unit | `calculatePayout()` enforces $50k daily maximum | High |
| Unit | Risk level determination based on history | High |

---

## 7. Fraud Detection Services

### 7.1 `src/services/fraud/advanced-fraud-detection.service.ts` ⭐ (Critical)

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | Orchestrates all fraud checks in parallel | High |
| Unit | IP reputation: detects proxy/VPN/Tor | High |
| Unit | IP reputation: flags risk score >70 | High |
| Unit | Velocity limits per user (5/5min) | Critical |
| Unit | Velocity limits per IP (10/5min) | Critical |
| Unit | Velocity limits per device (5/5min) | Critical |
| Unit | Velocity limits per card (5/5min) | Critical |
| Unit | Behavioral: detects copy-paste patterns | High |
| Unit | Behavioral: detects autofill | Medium |
| Unit | Behavioral: analyzes mouse movements | High |
| Unit | Behavioral: checks page time | Medium |
| Unit | Card reputation: checks chargeback history | High |
| Unit | Account takeover detection | High |
| Unit | Custom fraud rules evaluation | High |
| Unit | Decision: DECLINE at score ≥0.8 | Critical |
| Unit | Decision: REVIEW at score ≥0.6 | High |
| Unit | Decision: CHALLENGE at score ≥0.4 | High |
| Unit | Decision: APPROVE at score <0.4 | High |
| Unit | Signal aggregation calculates weighted score | High |
| Unit | Reputation updates on review decision | High |
| Integration | Full fraud check pipeline | Critical |

### 7.2 `src/services/fraud/device-fingerprint.service.ts`

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | SHA-256 fingerprint from device characteristics | High |
| Unit | Multi-factor risk scoring | High |
| Unit | Account count risk factor | High |
| Unit | Activity risk factor | High |
| Unit | Geographic anomaly detection | High |
| Unit | Device age factor | Medium |
| Unit | Failure history factor | High |
| Unit | Impossible travel detection | Critical |
| Unit | Hamming distance similarity calculation | Medium |

### 7.3 `src/services/fraud/fraud-review.service.ts`

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | Review queue with filters | High |
| Unit | Analyst assignment | Medium |
| Unit | Decision handling (approve/decline/escalate) | High |
| Unit | Statistics calculation | Medium |
| Unit | Trend analysis | Medium |
| Unit | Top signals identification | Medium |
| Unit | False positive recording | High |
| Unit | Reputation updates on review completion | High |

### 7.4 `src/services/fraud/scalper-detector.service.ts`

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | Rapid purchase detection (>3 in 10 min) | Critical |
| Unit | Multiple event detection (>3 in 24h) | High |
| Unit | Payment method diversity analysis | High |
| Unit | Device flagging | High |
| Unit | Decision: DECLINE at score ≥50 | High |
| Unit | Decision: REVIEW at score ≥30 | High |
| Unit | Redis velocity tracking | High |

### 7.5 `src/services/fraud/velocity-checker.service.ts`

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | Per-user limit: 5 per 5 minutes | Critical |
| Unit | Per-IP limit: 10 per 5 minutes | Critical |
| Unit | Per-payment-method limit: 5 per 5 minutes | Critical |
| Unit | Redis counter operations | High |
| Unit | Counter expiry after 5 minutes | High |
| Unit | Fail-open on Redis errors | High |

---

## 8. Marketplace Services

### 8.1 `src/services/marketplace/escrow.service.ts` ⭐ (Critical)

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | `createEscrow()` creates record in CREATED state | High |
| Unit | `fundEscrow()` uses Stripe manual capture | Critical |
| Unit | `fundEscrow()` transitions to FUNDED state | High |
| Unit | `releaseEscrow()` calculates payment splits | Critical |
| Unit | Split: seller amount | Critical |
| Unit | Split: venue royalty | Critical |
| Unit | Split: platform fee (5%) | Critical |
| Unit | `releaseEscrow()` checks release conditions | High |
| Unit | Release condition: NFT transfer verified | High |
| Unit | Release condition: cooling period passed | High |
| Unit | `refundEscrow()` transitions to REFUNDED | High |
| Unit | State transitions validated (CREATED→FUNDED→RELEASED) | Critical |
| Unit | Database transaction rollback on error | Critical |
| Integration | Full escrow lifecycle | Critical |

### 8.2 `src/services/marketplace/price-enforcer.service.ts`

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | Maximum markup cap: 150% of face value | Critical |
| Unit | Minimum price cap: 50% of face value | High |
| Unit | Dynamic cap: last-minute adjustment | High |
| Unit | Dynamic cap: high demand adjustment | High |
| Unit | Dynamic cap: charity event exception | Medium |
| Unit | Suspicious pattern: round number detection | High |
| Unit | Suspicious pattern: high markup patterns | High |
| Unit | Price validation returns detailed errors | High |

### 8.3 `src/services/marketplace/royalty-splitter.service.ts`

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | Venue royalty calculation | High |
| Unit | Artist royalty calculation | High |
| Unit | Platform fee calculation (5%) | High |
| Unit | Seller payout calculation | High |
| Unit | Event-specific royalty overrides | High |
| Unit | Fallback to venue defaults | High |
| Unit | Distribution recording | High |
| Unit | Reporting by recipient | Medium |

---

## 9. Blockchain Services

### 9.1 `src/services/blockchain/gas-estimator.service.ts`

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | Solana gas estimation | High |
| Unit | Polygon gas estimation | High |
| Unit | 60-second cache | Medium |
| Unit | Congestion detection (time-based) | Medium |
| Unit | Congestion detection (gas price-based) | Medium |

### 9.2 `src/services/blockchain/mint-batcher.service.ts`

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | 5-second delay batching | High |
| Unit | Auto-processing at max batch size | High |
| Unit | Exponential backoff retry | High |
| Unit | Batch status tracking | High |

### 9.3 `src/services/blockchain/nft-queue.service.ts`

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | Bull queue creation | High |
| Unit | Priority processing (urgent/high/standard) | High |
| Unit | Auto-batching when queue busy | High |
| Unit | Job completion handling | High |

---

## 10. Compliance Services

### 10.1 `src/services/compliance/aml-checker.service.ts` ⭐ (Critical)

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | Transaction threshold check ($10k) | Critical |
| Unit | Aggregate threshold check (30-day rolling, $50k) | Critical |
| Unit | Rapid high-value pattern (3+ in 24h) | Critical |
| Unit | Structuring detection (just under $10k, low std dev) | Critical |
| Unit | Geographic pattern (5+ countries) | High |
| Unit | High-risk country detection | High |
| Unit | Sanctions list matching | Critical |
| Unit | PEP (Politically Exposed Person) checking | High |
| Unit | Risk score: requiresReview at ≥0.5 | High |
| Unit | Risk score: sanctions match = 1.0 | Critical |
| Unit | SAR generation with 30-day deadline | High |

### 10.2 `src/services/compliance/form-1099-da.service.ts`

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | $600 threshold for reporting | Critical |
| Unit | Effective date: 2025-01-01 | High |
| Unit | Converts cents to dollars for tax forms | Critical |
| Unit | Batch generation | High |
| Unit | Error handling in batch processing | High |

### 10.3 `src/services/compliance/tax-calculator.service.ts`

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | Tennessee: 7% state tax | High |
| Unit | Tennessee: city local tax rates | High |
| Unit | Nashville/Memphis: 1% entertainment tax | High |
| Unit | TaxJar API integration | High |
| Unit | Cents-to-dollars conversion for TaxJar | Critical |
| Unit | Dollars-to-cents conversion from TaxJar | Critical |
| Unit | Fallback rates by state | High |
| Unit | Nexus threshold checking | Medium |
| Unit | All calculations in INTEGER CENTS | Critical |

---

## 11. Group Payment Services

### 11.1 `src/services/group/group-payment.service.ts` ⭐

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | `createGroupPayment()` calculates per-member amounts | High |
| Unit | `createGroupPayment()` creates group and members in transaction | High |
| Unit | `createGroupPayment()` schedules expiry check | High |
| Unit | `createGroupPayment()` rolls back on error | Critical |
| Unit | 10-minute expiration window | High |
| Unit | `recordMemberPayment()` validates member exists | High |
| Unit | `recordMemberPayment()` rejects already paid | High |
| Unit | `recordMemberPayment()` marks group complete when all paid | High |
| Unit | `sendReminders()` only to unpaid members | High |
| Unit | `sendReminders()` respects 3 reminder limit | High |
| Unit | `handleExpiredGroup()` cancels if no payments | High |
| Unit | `handleExpiredGroup()` handles partial payments | High |
| Integration | Bull queue processing | High |
| Integration | Database transactions | Critical |

### 11.2 `src/services/group/reminder-engine.service.ts`

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | Schedules reminders at 5, 8, 9.5 minutes | High |
| Unit | Creates 3 delayed jobs | High |
| Unit | Marks final reminder | High |
| Unit | Escalating urgency in templates | Medium |
| Unit | Reminder effectiveness analytics | Low |
| Integration | Bull queue with Redis | High |

### 11.3 `src/services/group/contribution-tracker.service.ts`

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | `trackContribution()` updates member status | High |
| Unit | `getContributionHistory()` returns timeline | Medium |
| Unit | `handleFailedContribution()` marks failure | High |
| Unit | Analytics: success rate calculation | Medium |
| Unit | Analytics: average group size | Low |
| Unit | Analytics: average completion time | Low |

---

## 12. High-Demand Services

### 12.1 `src/services/high-demand/bot-detector.service.ts` ⭐

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | `detectBot()` aggregates all indicator scores | High |
| Unit | Timing: rapid clicking (<100ms) | Critical |
| Unit | Timing: consistent timing (low variance) | High |
| Unit | Timing: impossible speed (<50ms) | Critical |
| Unit | Mouse: no movement detection | High |
| Unit | Mouse: linear paths (>0.9 linearity) | High |
| Unit | Mouse: no scrolling | Medium |
| Unit | Browser: webdriver detection | Critical |
| Unit | Browser: headless indicators | High |
| Unit | Browser: suspicious user agents | High |
| Unit | Historical: multiple bot detections | High |
| Unit | Recommendation: block_immediately at ≥0.9 | Critical |
| Unit | Recommendation: require_captcha at ≥0.7 | High |
| Unit | Recommendation: increase_monitoring at ≥0.5 | High |

### 12.2 `src/services/high-demand/purchase-limiter.service.ts`

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | Per-user limit: 4 tickets | High |
| Unit | Per-payment-method limit: 4 tickets | High |
| Unit | Per-household limit: 8 tickets | High |
| Unit | 10-minute cooldown period | High |
| Unit | Address normalization | Medium |
| Unit | Dynamic limits at >90% sold (reduce to 2) | High |
| Unit | Fail-open on Redis errors | High |
| Integration | Redis cooldown operations | High |

### 12.3 `src/services/high-demand/waiting-room.service.ts` ⭐ (Critical - Security)

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | `joinWaitingRoom()` returns existing position | High |
| Unit | `joinWaitingRoom()` adds to Redis sorted set | High |
| Unit | `joinWaitingRoom()` applies priority boost | High |
| Unit | `joinWaitingRoom()` sets 2-hour expiry | High |
| Unit | `checkPosition()` returns expired for unknown | High |
| Unit | `checkPosition()` returns ready with token when eligible | High |
| Unit | `processQueue()` respects max active users | High |
| Unit | `processQueue()` respects rate limit (100/min) | High |
| Unit | `generateAccessToken()` creates valid JWT | Critical |
| Unit | JWT includes correct claims (sub, evt, qid, scope) | Critical |
| Unit | JWT has 10-minute expiry | High |
| Unit | `validateAccessToken()` validates signature | Critical |
| Unit | `validateAccessToken()` checks scope claim | Critical |
| Unit | `validateAccessToken()` checks Redis for revocation | Critical |
| Unit | `validateAccessToken()` rejects expired tokens | Critical |
| Unit | `validateAccessToken()` rejects invalid signatures | Critical |
| Integration | Redis sorted set operations | High |
| Integration | JWT signing and verification | Critical |

---

## 13. Middleware

### 13.1 `src/middleware/auth.middleware.ts` ⭐ (Critical)

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | `requireAuth()` skips public routes | High |
| Unit | `requireAuth()` throws without auth header | Critical |
| Unit | `requireAuth()` throws for non-Bearer scheme | High |
| Unit | `verifyToken()` validates issuer | Critical |
| Unit | `verifyToken()` validates audience | Critical |
| Unit | `verifyToken()` allows 60s clock skew | High |
| Unit | `verifyToken()` throws if missing subject | High |
| Unit | `verifyToken()` throws if missing tenantId | Critical |
| Unit | `verifyToken()` defaults to ['user'] role | Medium |
| Unit | `requireAdmin()` checks admin/superadmin roles | High |
| Unit | `requirePermission()` validates specific permission | High |
| Unit | `optionalAuth()` doesn't throw on invalid token | Medium |

### 13.2 `src/middleware/auth.ts` (Enhanced Auth)

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | `isValidUUID()` validates UUID v4 format | High |
| Unit | `authenticate()` returns 401 without token | Critical |
| Unit | `authenticate()` returns 401 for missing tenant | Critical |
| Unit | `authenticate()` returns 401 for invalid tenant UUID | High |
| Unit | `authenticate()` returns 403 for URL/JWT tenant mismatch | Critical |
| Unit | `authenticate()` returns 400 for body tenant (VAL-3) | High |
| Unit | `authenticate()` returns 401 for expired token | Critical |
| Unit | `requireVenueAccess()` validates venue UUID | High |
| Unit | `requireVenueAccess()` allows admin access to all | High |
| Unit | `registerGlobalAuth()` excludes configured paths | High |

### 13.3 `src/middleware/tenant.middleware.ts` ⭐ (Critical)

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | `isPublicRoute()` skips health/metrics/webhooks | High |
| Unit | `tenantMiddleware()` accepts X-Tenant-ID for service calls | High |
| Unit | `tenantMiddleware()` validates JWT issuer | Critical |
| Unit | `tenantMiddleware()` validates JWT audience | Critical |
| Unit | `tenantMiddleware()` extracts tenantId from JWT | Critical |
| Unit | `tenantMiddleware()` validates tenant UUID format | High |
| Unit | `tenantMiddleware()` rejects URL/JWT tenant mismatch | Critical |
| Unit | `tenantMiddleware()` removes body tenant (doesn't reject) | High |
| Unit | `setRlsContext()` calls set_config for tenant | Critical |
| Unit | `withTenantContext()` validates tenant UUID | High |
| Unit | `withTenantContext()` sets statement/lock timeout | High |
| Unit | `withTenantContext()` commits on success | High |
| Unit | `withTenantContext()` rolls back on error | Critical |
| Unit | `withTenantReadContext()` uses READ ONLY | Medium |
| Unit | `bypassRlsForAdmin()` sets bypass_rls for admins | High |
| Integration | Database RLS policy enforcement | Critical |

### 13.4 `src/middleware/idempotency.middleware.ts` ⭐

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | Skips GET requests | High |
| Unit | Skips non-payment endpoints | High |
| Unit | Throws BadRequestError without key | Critical |
| Unit | Validates key format (8-64 chars) | High |
| Unit | Request fingerprint hashes method+path+body | High |
| Unit | Returns 409 if key used with different request | Critical |
| Unit | Returns 409 if request still processing | High |
| Unit | Returns cached response with X-Idempotent-Replay | High |
| Unit | Stores processing state before handler | High |
| Unit | `onResponseIdempotencyHook()` stores completed response | High |
| Integration | Redis caching operations | High |

### 13.5 `src/middleware/rate-limiter.middleware.ts` ⭐

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | `extractClientIp()` uses rightmost X-Forwarded-For | Critical |
| Unit | `extractClientIp()` validates IP format | High |
| Unit | `extractClientIp()` falls back to request.ip | High |
| Unit | `isValidIp()` validates IPv4 | High |
| Unit | `isValidIp()` validates IPv6 | High |
| Unit | `feeCalculatorRateLimit()` allows 10/min | High |
| Unit | `paymentRateLimit()` allows 5/min | High |
| Unit | `apiRateLimit()` allows 100/15min | High |
| Unit | Returns 429 with Retry-After header | Critical |
| Unit | Sets X-RateLimit-* headers | High |
| Unit | `atomicRateLimiter()` uses Lua script | High |
| Unit | `atomicRateLimiter()` bans after 5 violations | High |
| Unit | `systemOverloadProtection()` returns 503 when overloaded | High |
| Integration | Redis operations for rate limiting | High |

### 13.6 `src/middleware/global-error-handler.ts` ⭐

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | `getCorrelationId()` extracts from various headers | High |
| Unit | Returns RFC 7807 format | Critical |
| Unit | Includes correlation ID in response | High |
| Unit | Maps ValidationError correctly | High |
| Unit | Maps UnauthorizedError to 401 | High |
| Unit | Maps ForbiddenError to 403 | High |
| Unit | Maps NotFoundError to 404 | High |
| Unit | Maps PostgreSQL 23505 to 409 Conflict | High |
| Unit | Maps PostgreSQL 23503 to 400 constraint | High |
| Unit | `notFoundHandler()` returns RFC 7807 | High |

### 13.7 `src/middleware/service-auth.ts`

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | `requireServiceAuth()` rejects missing headers | Critical |
| Unit | `requireServiceAuth()` rejects unknown service | High |
| Unit | `requireServiceAuth()` rejects expired timestamp | High |
| Unit | `requireServiceAuth()` verifies HMAC signature | Critical |
| Unit | `requireServiceAuth()` checks endpoint permission | High |
| Unit | `checkEndpointPermission()` matches exact paths | High |
| Unit | `checkEndpointPermission()` matches parameter wildcards | High |
| Unit | `matchPath()` handles :id parameters | High |
| Unit | `matchPath()` handles /* glob | High |
| Unit | `generateServiceAuthHeaders()` creates valid headers | High |

### 13.8 `src/middleware/internal-auth.ts`

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | Returns 401 without required headers | Critical |
| Unit | Returns 401 for invalid timestamp | High |
| Unit | Returns 401 for expired timestamp (>5 min) | High |
| Unit | Returns 401 for invalid signature | Critical |
| Unit | Uses timing-safe comparison | Critical |
| Unit | Throws in production without secret | Critical |

### 13.9 `src/middleware/request-context.ts`

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | `parseTraceContext()` parses W3C traceparent | High |
| Unit | `parseTraceContext()` parses B3 headers | Medium |
| Unit | `generateTraceId()` creates 32 hex chars | High |
| Unit | `generateSpanId()` creates 16 hex chars | High |
| Unit | `getRequestContext()` returns from AsyncLocalStorage | High |
| Unit | `getTracePropagationHeaders()` returns all headers | High |

### 13.10 `src/middleware/validation.middleware.ts`

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | `validateRequest()` validates processPayment schema | High |
| Unit | `validateRequest()` validates calculateFees schema | High |
| Unit | `validateRequest()` strips unknown fields | High |
| Unit | `validateRequest()` returns field-level errors | High |
| Unit | `validateQueryParams()` validates query params | High |

---

## 14. Utilities

### 14.1 `src/utils/circuit-breaker.ts` ⭐

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | `execute()` succeeds when CLOSED | High |
| Unit | `execute()` throws CircuitBreakerError when OPEN | High |
| Unit | Transitions CLOSED→OPEN after failureThreshold | Critical |
| Unit | Respects volumeThreshold before opening | High |
| Unit | Transitions OPEN→HALF_OPEN after timeout | High |
| Unit | Transitions HALF_OPEN→CLOSED after successes | High |
| Unit | Transitions HALF_OPEN→OPEN on single failure | High |
| Unit | `forceOpen()` immediately opens | Medium |
| Unit | `forceClose()` immediately closes | Medium |
| Unit | `reset()` clears all stats | Medium |
| Unit | Half-open allows only one request at a time | High |

### 14.2 `src/utils/crypto.util.ts` ⭐ (Security Critical)

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | `secureCompare()` returns true for equal strings | Critical |
| Unit | `secureCompare()` returns false for different lengths | Critical |
| Unit | `secureCompare()` is constant time | Critical |
| Unit | `generateSecureToken()` returns correct length | High |
| Unit | `generateSecureUUID()` returns valid UUID | High |
| Unit | `generateHmac()` produces correct SHA-256 | High |
| Unit | `verifyHmac()` validates correct signature | Critical |
| Unit | `verifyHmac()` rejects incorrect signature | Critical |
| Unit | `verifyTimestampedHmac()` rejects expired | High |
| Unit | `encrypt()` / `decrypt()` roundtrip works | High |
| Unit | `decrypt()` throws on tampered ciphertext | High |
| Unit | `signServiceRequest()` creates valid signature | High |
| Unit | `verifyServiceRequest()` validates signature | High |

### 14.3 `src/utils/database-transaction.util.ts` ⭐ (Critical)

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | `buildLockedQuery()` appends lock clause | High |
| Unit | `LockedQuery.forUpdate()` sets FOR UPDATE | High |
| Unit | `LockedQuery.forUpdateSkipLocked()` sets SKIP LOCKED | High |
| Unit | `TransactionManager.withTransaction()` commits | Critical |
| Unit | `TransactionManager.withTransaction()` rolls back | Critical |
| Unit | Retries on serialization failure (40001) | High |
| Unit | Retries on deadlock (40P01) | High |
| Unit | Exponential backoff between retries | High |
| Unit | `withSerializableTransaction()` uses SERIALIZABLE | High |
| Unit | `withReadOnlyTransaction()` uses READ ONLY | Medium |
| Unit | Sets lock_timeout correctly | High |
| Unit | Sets statement_timeout correctly | High |
| Unit | Sets RLS context (app.tenant_id) | Critical |
| Unit | `selectPaymentForUpdate()` locks row | High |
| Unit | `selectPendingTransfersForProcessing()` SKIP LOCKED | High |
| Integration | Database locking behavior | Critical |

### 14.4 `src/utils/errors.ts` ⭐

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | `AppError.toProblemDetails()` returns RFC 7807 | High |
| Unit | `BadRequestError` has status 400 | High |
| Unit | `ValidationError` includes field errors | High |
| Unit | `ValidationError.fromZod()` converts Zod errors | High |
| Unit | `UnauthorizedError` has status 401 | High |
| Unit | `ForbiddenError` has status 403 | High |
| Unit | `NotFoundError` has status 404 | High |
| Unit | `PaymentFailedError` has status 402 | High |
| Unit | `StripeError` maps error types correctly | High |
| Unit | `RateLimitedError` includes retryAfter | High |
| Unit | `toAppError()` wraps Stripe errors | High |
| Unit | `sendProblemResponse()` sets Content-Type | High |

### 14.5 `src/utils/graceful-degradation.ts`

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | MINIMAL when database or Stripe down | High |
| Unit | PARTIAL when Redis/TaxJar/Blockchain down | High |
| Unit | FULL when all services healthy | High |
| Unit | `isFeatureAvailable()` respects level | High |
| Unit | `calculateTaxWithFallback()` tries TaxJar first | High |
| Unit | `calculateTaxWithFallback()` uses static rates | High |
| Unit | `estimateGasWithFallback()` uses 50¢/ticket | High |

### 14.6 `src/utils/logger.ts` ⭐

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | `redactSensitiveData()` redacts cardNumber | Critical |
| Unit | `redactSensitiveData()` redacts cvv/cvc | Critical |
| Unit | `redactSensitiveData()` redacts password/secret | Critical |
| Unit | `redactSensitiveData()` recurses nested objects | High |
| Unit | `maskValue()` masks email correctly | High |
| Unit | `getLogLevel()` respects LOG_LEVEL env | Medium |
| Unit | Logger outputs JSON format | High |
| Unit | Logger includes timestamp in ISO format | High |
| Unit | `getCorrelationId()` returns correct ID | High |

### 14.7 `src/utils/pci-log-scrubber.util.ts` ⭐ (PCI Compliance)

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | `scrubSensitiveData()` replaces 16-digit cards | Critical |
| Unit | `scrubSensitiveData()` replaces cards with separators | Critical |
| Unit | `scrubSensitiveData()` replaces CVV patterns | Critical |
| Unit | `scrubSensitiveData()` replaces expiration dates | Critical |
| Unit | `scrubSensitiveData()` replaces SSN patterns | Critical |
| Unit | `scrubSensitiveData()` replaces track 1 data | Critical |
| Unit | `scrubSensitiveData()` replaces track 2 data | Critical |
| Unit | `scrubObject()` scrubs nested objects | High |
| Unit | `scrubObject()` redacts sensitive field names | High |
| Unit | `maskCardNumber()` shows last 4 digits | High |
| Unit | `containsPCIData()` detects card numbers | High |

### 14.8 `src/utils/webhook-signature.ts` ⭐ (Security)

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | `parseStripeSignature()` extracts timestamp | High |
| Unit | `parseStripeSignature()` extracts signatures | High |
| Unit | `verifyStripeWebhook()` validates correct signature | Critical |
| Unit | `verifyStripeWebhook()` rejects incorrect signature | Critical |
| Unit | `verifyStripeWebhook()` rejects old timestamp | Critical |
| Unit | `verifyStripeWebhook()` rejects future timestamp | High |
| Unit | `generateStripeSignature()` creates valid signature | High |
| Unit | Signature roundtrip works | High |
| Unit | `replayProtection.checkAndRecord()` detects duplicates | High |

### 14.9 `src/utils/validation.util.ts`

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | `validatePaymentAmount()` rejects non-numbers | High |
| Unit | `validatePaymentAmount()` rejects decimals | Critical |
| Unit | `validatePaymentAmount()` rejects <$1 | High |
| Unit | `validatePaymentAmount()` rejects >$1M | High |
| Unit | `validateTicketCount()` rejects non-integers | High |
| Unit | `validateTicketCount()` rejects >100 | High |
| Unit | `validateVenueId()` validates UUID v4 | High |
| Unit | `validateCurrencyCode()` requires 3 letters | High |
| Unit | `validatePaymentRequest()` validates all fields | High |

### 14.10 `src/utils/retry.ts`

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | `withRetry()` succeeds on first try | High |
| Unit | `withRetry()` retries on failure | High |
| Unit | `withRetry()` respects maxAttempts | High |
| Unit | Uses exponential backoff | High |
| Unit | Respects maxDelayMs cap | High |
| Unit | `withRetryJitter()` adds random jitter | High |
| Unit | `retryBatch()` separates successes/failures | High |

### 14.11 `src/utils/metrics.ts`

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | `httpRequestsTotal` increments correctly | High |
| Unit | `httpRequestDuration` observes duration | High |
| Unit | `stripeRateLimitRemaining` sets gauge | High |
| Unit | `recordHttpRequest()` records all metrics | High |
| Unit | `normalizePath()` replaces UUIDs with :id | High |

### 14.12 `src/utils/money.ts`

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | `percentOfCents(10000, 700)` returns 700 | Critical |
| Unit | `percentOfCents(10000, 250)` returns 250 | Critical |
| Unit | `percentOfCents()` rounds correctly | Critical |
| Unit | `addCents()` adds multiple amounts | High |
| Unit | `subtractCents()` subtracts correctly | High |

---

## 15. Validators

### 15.1 `src/validators/payment.validator.ts` ⭐

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | `uuidSchema` validates UUID format | High |
| Unit | `stripePaymentIntentSchema` validates pi_ prefix | High |
| Unit | `stripeCustomerSchema` validates cus_ prefix | High |
| Unit | `amountSchema` rejects < 50 cents | High |
| Unit | `amountSchema` rejects > $1,000,000 | High |
| Unit | `amountSchema` requires integer | Critical |
| Unit | `currencySchema` validates 3-char codes | High |
| Unit | `createPaymentIntentSchema` validates payload | High |
| Unit | `escrowIdParamSchema` validates UUID | High |
| Unit | `validateBody()` handles Zod errors | High |
| Unit | `validateParams()` handles param errors | High |
| Unit | `validateQuery()` handles query errors | High |

### 15.2 `src/validators/refund.validator.ts` ⭐

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | `filterSensitiveFields()` removes sensitive keys | High |
| Unit | `createRefundSchema` validates pi_ format | High |
| Unit | `createRefundSchema` requires positive amount | High |
| Unit | `listRefundsSchema` cross-validates date range | High |
| Unit | `bulkRefundSchema` limits to 100 refunds | High |
| Unit | `validateRefundAmount()` rejects exceeding remaining | Critical |
| Unit | `validateRefundTiming()` rejects >120 days | High |
| Unit | `validatePaymentStatusForRefund()` accepts succeeded | High |
| Unit | `validatePaymentStatusForRefund()` rejects refunded | High |
| Unit | Validator re-validates after transform | High |

### 15.3 `src/validators/payment-request.ts`

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | `validate()` rejects amount <= 0 | High |
| Unit | `validate()` rejects invalid currency | High |
| Unit | `validate()` rejects missing orderId | High |
| Unit | `sanitize()` rounds amount to integer | High |
| Unit | `sanitize()` uppercases currency | High |

---

## 16. Background Jobs

### 16.1 `src/jobs/background-job-processor.ts` ⭐ (Critical)

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | `isValidTenantId()` validates UUID format | High |
| Unit | `registerHandler()` stores handler by type | High |
| Unit | `processNextJob()` uses FOR UPDATE SKIP LOCKED | High |
| Unit | `processNextJob()` validates tenant ID presence | Critical |
| Unit | `processNextJob()` validates tenant ID format | Critical |
| Unit | `processNextJob()` sets RLS context | Critical |
| Unit | `calculateRetryDelay()` uses exponential backoff | High |
| Unit | `calculateRetryDelay()` caps at maxRetryDelayMs | High |
| Unit | `calculateRetryDelay()` adds ±10% jitter | High |
| Unit | `moveToDeadLetterQueue()` inserts to DLQ | High |
| Unit | `retryFromDeadLetter()` creates new job | High |
| Unit | `enqueue()` validates tenant ID | Critical |
| Unit | `enqueue()` includes tenant in payload | Critical |
| Unit | `recoverStalledJobs()` finds stuck jobs | High |
| Integration | Full job lifecycle | Critical |

### 16.2 `src/jobs/transfer-retry.job.ts` ⭐

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | `processPendingTransfers()` processes pending_retry | High |
| Unit | Uses SKIP LOCKED for parallel workers | High |
| Unit | Sets tenant context before processing | Critical |
| Unit | `isTerminalError()` detects account_invalid | High |
| Unit | `isTerminalError()` detects insufficient_funds | High |
| Unit | `isTerminalError()` treats 4xx as terminal | High |
| Unit | Retries with exponential backoff | High |
| Unit | Moves to failed after MAX_RETRY_ATTEMPTS | High |
| Unit | Sends alert on permanent failure | High |
| Unit | `queueTransferForRetry()` creates pending transfer | High |
| Integration | Full retry cycle | Critical |

### 16.3 `src/jobs/tenant-job.utils.ts` ⭐

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | `createTenantJobContext()` validates tenant UUID | High |
| Unit | `createTenantJobContext()` sets RLS context | Critical |
| Unit | `withTenantJobContext()` cleans up on success | High |
| Unit | `withTenantJobContext()` cleans up on error | High |
| Unit | `getActiveTenants()` returns active tenant IDs | High |
| Unit | `executeForAllTenants()` processes all tenants | High |
| Unit | `executeForAllTenants()` respects parallelism | High |
| Unit | `getTenantQueueName()` creates scoped name | High |
| Unit | `moveToTenantDLQ()` validates tenant | High |
| Unit | `retryFromTenantDLQ()` verifies tenant ownership | Critical |
| Integration | Multi-tenant job execution | Critical |

### 16.4 `src/jobs/royalty-reconciliation.job.ts`

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | `runDailyReconciliation()` calculates yesterday | High |
| Unit | `runWeeklyReconciliation()` calculates 7-day range | High |
| Unit | Error handling logs and re-throws | High |

### 16.5 `src/jobs/process-webhook-queue.job.ts`

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | `execute()` fetches pending webhooks | High |
| Unit | `processWebhook()` routes to Stripe handler | High |
| Unit | `processWebhook()` marks as processed | High |
| Unit | `processWebhook()` increments retry on error | High |

### 16.6 `src/jobs/retry-failed-payments.job.ts`

| Test Type | Test Case | Priority |
|-----------|-----------|----------|
| Unit | `execute()` queries failed payments | High |
| Unit | `retryPayment()` creates retry record | High |
| Unit | `retryPayment()` checks payment intent status | High |
| Unit | `retryPayment()` handles requires_payment_method | High |

---

## 17. Critical Test Scenarios

### 17.1 Payment Flow E2E Tests

| Scenario | Description | Priority |
|----------|-------------|----------|
| Happy Path | Complete payment from intent to completion | Critical |
| Declined Card | Payment declined with proper error | Critical |
| Idempotency | Duplicate request returns same result | Critical |
| Partial Refund | Refund part of a payment | High |
| Full Refund | Refund entire payment | High |
| Rate Limited | Request blocked after exceeding limit | High |

### 17.2 Fraud Detection E2E Tests

| Scenario | Description | Priority |
|----------|-------------|----------|
| Known Scalper | Scalper flagged and blocked | Critical |
| Bot Detection | Automated request blocked | Critical |
| Velocity Exceeded | Too many requests blocked | Critical |
| Legitimate User | Clean user approved | Critical |

### 17.3 Escrow E2E Tests

| Scenario | Description | Priority |
|----------|-------------|----------|
| Full Lifecycle | Create → Fund → Release | Critical |
| Escrow Refund | Create → Fund → Refund | High |
| Partial Release | Release portion of escrow | High |
| Expired Escrow | Auto-refund after expiry | High |

### 17.4 Group Payment E2E Tests

| Scenario | Description | Priority |
|----------|-------------|----------|
| Full Collection | All members pay, tickets issued | Critical |
| Partial Expiry | Some pay, group expires | High |
| Reminder Flow | Reminders sent at intervals | Medium |

### 17.5 Multi-Tenant Isolation Tests

| Scenario | Description | Priority |
|----------|-------------|----------|
| Cross-Tenant Block | Tenant A cannot access B's data | Critical |
| RLS Enforcement | Database queries scoped to tenant | Critical |
| JWT Tenant Match | URL tenant must match JWT | Critical |

### 17.6 Security Tests

| Scenario | Description | Priority |
|----------|-------------|----------|
| Invalid JWT | Rejected with 401 | Critical |
| Expired JWT | Rejected with 401 | Critical |
| Missing Tenant | Rejected with 401 | Critical |
| Invalid Webhook Sig | Rejected with 400 | Critical |
| PCI Data Scrubbed | No card data in logs | Critical |

---

## 18. Test Environment Setup

### 18.1 Required Dependencies
```json
{
  "devDependencies": {
    "@types/jest": "^29.5.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.0",
    "supertest": "^6.3.0",
    "@testcontainers/postgresql": "^10.0.0",
    "@testcontainers/redis": "^10.0.0",
    "nock": "^13.5.0",
    "ioredis-mock": "^8.9.0",
    "stripe-mock": "^0.0.1"
  }
}
```

### 18.2 Jest Configuration
```javascript
// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/*.test.ts', '**/*.spec.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/types/**',
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
```

### 18.3 Test Directory Structure
```
tests/
├── setup.ts                    # Global test setup
├── fixtures/                   # Test data fixtures
│   ├── payments.ts
│   ├── users.ts
│   └── webhooks.ts
├── mocks/                      # Mock implementations
│   ├── stripe.mock.ts
│   ├── redis.mock.ts
│   └── database.mock.ts
├── unit/                       # Unit tests
│   ├── controllers/
│   ├── services/
│   ├── middleware/
│   ├── utils/
│   └── validators/
├── integration/                # Integration tests
│   ├── api/
│   ├── database/
│   └── redis/
└── e2e/                        # End-to-end tests
    ├── payment-flow.e2e.ts
    ├── refund-flow.e2e.ts
    ├── escrow-flow.e2e.ts
    └── group-payment-flow.e2e.ts
```

### 18.4 Environment Variables for Testing
```bash
# .env.test
NODE_ENV=test
LOG_LEVEL=error
DATABASE_URL=postgresql://test:test@localhost:5432/payment_test
REDIS_URL=redis://localhost:6379/1
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_test_xxx
JWT_SECRET=test-jwt-secret-at-least-32-chars
SERVICE_AUTH_SECRET=test-service-auth-secret-32chars
```

### 18.5 CI/CD Integration
```yaml
# .github/workflows/test.yml
name: Test Suite
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run test:coverage
      - uses: codecov/codecov-action@v3
```

---

## Appendix A: Test File Naming Conventions

| Type | Pattern | Example |
|------|---------|---------|
| Unit Test | `*.test.ts` | `payment-processor.service.test.ts` |
| Integration Test | `*.integration.ts` | `payment-api.integration.ts` |
| E2E Test | `*.e2e.ts` | `payment-flow.e2e.ts` |

## Appendix B: Priority Legend

| Priority | Description |
|----------|-------------|
| Critical | Must pass for deployment |
| High | Should pass for deployment |
| Medium | Important but not blocking |
| Low | Nice to have |

## Appendix C: Coverage Requirements by Module

| Module | Line Coverage | Branch Coverage |
|--------|--------------|-----------------|
| Controllers | 85% | 80% |
| Services (Core) | 90% | 85% |
| Services (Fraud) | 85% | 80% |
| Middleware (Auth) | 95% | 90% |
| Middleware (Tenant) | 95% | 90% |
| Utilities (Crypto) | 100% | 95% |
| Utilities (PCI) | 100% | 95% |
| Validators | 90% | 85% |
| Jobs | 80% | 75% |

---

*End of Test Plan Document*
