# Payment Service - Architecture Overview

## Service Information
- **Port**: 3006
- **Framework**: Fastify (Node.js/TypeScript)
- **Database**: PostgreSQL (via Knex)
- **Cache**: Redis
- **Message Queue**: Bull (Redis-backed)

---

## 1. Routes (`src/routes/`)

### `/health` - Health Checks
- **GET** `/health` — Basic service health
- **GET** `/health/db` — Database connectivity check
- **GET** `/health/redis` — Redis connectivity check
- **GET** `/health/stripe` — Stripe API connectivity check
- **GET** `/health/ready` — Comprehensive readiness probe (K8s)

### `/payments` - Core Payment Operations
- **POST** `/payments/process` — Process payment with idempotency (rate: 10/min)
- **POST** `/payments/calculate-fees` — Calculate fees for order
- **GET** `/payments/transaction/:transactionId` — Get transaction status
- **POST** `/payments/transaction/:transactionId/refund` — Refund transaction (rate: 5/min)

### `/marketplace` - Secondary Market
- **POST** `/marketplace/listings` — Create resale listing
- **POST** `/marketplace/purchase` — Purchase resale ticket
- **POST** `/marketplace/escrow/:escrowId/confirm` — Confirm NFT transfer
- **GET** `/marketplace/venues/:venueId/royalties` — Get royalty report
- **GET** `/marketplace/venues/:venueId/pricing-analytics` — Get pricing analytics

### `/group-payments` - Group Buying
- **POST** `/group-payments/create` — Create group payment
- **POST** `/group-payments/:groupId/contribute/:memberId` — Member contribution
- **GET** `/group-payments/:groupId/status` — Get group status
- **POST** `/group-payments/:groupId/reminders` — Send payment reminders
- **GET** `/group-payments/:groupId/history` — Get contribution history

### `/venues` - Venue Finance
- **GET** `/venues/:venueId/balance` — Get venue balance
- **POST** `/venues/:venueId/payout` — Request payout
- **GET** `/venues/:venueId/payouts` — Get payout history

### `/compliance` - Tax & Compliance
- **GET** `/compliance/tax-forms/:year` — Get tax form
- **GET** `/compliance/tax-forms/:year/download` — Download tax form
- **GET** `/compliance/tax-summary` — Get tax summary

### `/webhooks` - External Webhooks
- **POST** `/webhooks/stripe` — Stripe webhook handler (raw body)

### `/intents` - Payment Intents
- **POST** `/intents/create` — Create payment intent with idempotency

### `/refunds` - Refund Management
- **POST** `/refunds/create` — Create refund (rate: 5/min, idempotent)

### `/fees` - Fee Calculator (Public)
- **POST** `/fees/calculate` — Calculate fees for amount
- **POST** `/fees/breakdown` — Get detailed fee breakdown

### `/fraud` - Fraud Detection Dashboard
- **POST** `/fraud/check` — Perform fraud check
- **GET** `/fraud/review-queue` — Get pending fraud reviews
- **POST** `/fraud/review-queue/:id/assign` — Assign review to analyst
- **POST** `/fraud/review-queue/:id/complete` — Complete fraud review
- **GET** `/fraud/stats` — Get fraud detection statistics
- **GET** `/fraud/trends` — Get fraud trends
- **GET** `/fraud/signals` — Get top fraud signals
- **GET** `/fraud/dashboard` — Comprehensive fraud dashboard
- **POST** `/fraud/rules` — Create fraud rule
- **GET** `/fraud/rules` — List all fraud rules
- **PUT** `/fraud/rules/:id` — Update fraud rule
- **DELETE** `/fraud/rules/:id` — Deactivate fraud rule
- **GET** `/fraud/ip/:ipAddress` — Get IP reputation
- **POST** `/fraud/ip/:ipAddress/block` — Block IP address
- **GET** `/fraud/user/:userId/history` — Get user's fraud check history

### `/royalty` - Royalty Management
- **GET** `/royalty/report/:venueId` — Get royalty report for venue
- **GET** `/royalty/payouts/:recipientId` — Get payout history
- **GET** `/royalty/distributions/:recipientId` — Get royalty distributions
- **POST** `/royalty/reconcile` — Trigger manual reconciliation
- **GET** `/royalty/reconciliation-runs` — Get reconciliation history
- **GET** `/royalty/discrepancies` — Get unresolved discrepancies
- **PUT** `/royalty/discrepancies/:id/resolve` — Resolve discrepancy

### `/internal` - Internal Service Routes
- **POST** `/internal/payment-complete` — Mark payment complete (internal auth)
- **POST** `/internal/calculate-tax` — Calculate tax (internal auth)

---

## 2. Services (`src/services/`)

### Core Services
- **`payment-processor.service.ts`** — Payment processing with Stripe integration
- **`fee-calculator.service.ts`** — Dynamic fee calculation based on venue tier
- **`cache.service.ts`** — Redis caching layer
- **`cache-integration.ts`** — Cache wrapper with TTL support
- **`metrics.service.ts`** — Prometheus metrics collection
- **`payment-analytics.service.ts`** — Payment insights and trends
- **`databaseService.ts`** — PostgreSQL connection pool
- **`redisService.ts`** — Redis client wrapper
- **`queueService.ts`** — Bull queue management
- **`webhookProcessor.ts`** — Stripe webhook event processing

### Blockchain Services (`blockchain/`)
- **`nft-queue.service.ts`** — NFT minting queue with batch processing
- **`gas-estimator.service.ts`** — Gas fee estimation (Solana, Polygon, Ethereum)
- **`mint-batcher.service.ts`** — Batch NFT minting for efficiency

### Compliance Services (`compliance/`)
- **`tax-calculator.service.ts`** — Sales tax calculation (TaxJar integration)
- **`aml-checker.service.ts`** — AML checks, sanctions screening, PEP verification
- **`form-1099-da.service.ts`** — 1099-DA form generation for NFT sales

### Core Business Logic (`core/`)
- **`tax-calculator.service.ts`** — Tax rate lookup with fallback
- **`gas-fee-estimator.service.ts`** — Multi-chain gas estimation
- **`venue-analytics.service.ts`** — Venue revenue metrics
- **`venue-balance.service.ts`** — Venue balance management and payouts
- **`fee-calculator.service.ts`** — Fee calculation with tiered pricing

### Fraud Detection (`fraud/`)
- **`advanced-fraud-detection.service.ts`** — Multi-signal fraud detection engine
- **`device-fingerprint.service.ts`** — Device tracking and risk scoring
- **`velocity-checker.service.ts`** — Transaction velocity monitoring
- **`scalper-detector.service.ts`** — Bot/scalper detection
- **`fraud-review.service.ts`** — Manual review queue management

### Group Payments (`group/`)
- **`group-payment.service.ts`** — Group payment orchestration
- **`contribution-tracker.service.ts`** — Member contribution tracking
- **`reminder-engine.service.ts`** — Automated payment reminders

### Marketplace Services (`marketplace/`)
- **`escrow.service.ts`** — Escrow management for resales
- **`price-enforcer.service.ts`** — Dynamic price cap enforcement
- **`royalty-splitter.service.ts`** — Royalty calculation and distribution

### Mock Services (`mock/`)
- **`mock-stripe.service.ts`** — Stripe mock for testing
- **`mock-fraud.service.ts`** — Fraud detection mock
- **`mock-nft.service.ts`** — NFT service mock
- **`mock-email.service.ts`** — Email service mock

### Reconciliation (`reconciliation/`)
- **`reconciliation-service.ts`** — Payment reconciliation and cleanup
- **`royalty-reconciliation.service.ts`** — Blockchain royalty reconciliation

### Security (`security/`)
- **`pci-compliance.service.ts`** — PCI-DSS compliance utilities

### State Machine (`state-machine/`)
- **`payment-state-machine.ts`** — Payment state transitions
- **`order-state-machine.ts`** — Order state transitions
- **`transitions.ts`** — State transition orchestration

### Webhooks (`webhooks/`)
- **`outbound-webhook.ts`** — Send webhooks to external systems

### Other Services
- **`chargeback-reserve.service.ts`** — Chargeback reserve management
- **`event-ordering.service.ts`** — Event ordering guarantees
- **`refund-policy.service.ts`** — Refund eligibility checking
- **`transaction-timeout.service.ts`** — Timeout handling for stuck transactions
- **`launch-features.ts`** — IP geolocation, device fingerprinting, blacklists, currency conversion

---

## 3. Controllers (`src/controllers/`)

### PaymentController
- `processPayment()` — Process payment transaction
- `calculateFees()` — Calculate fees for order
- `getTransactionStatus()` — Retrieve transaction status
- `refundTransaction()` — Initiate refund

### WebhookController
- `handleStripeWebhook()` — Process Stripe events
- `handleSquareWebhook()` — Process Square events
- `processWebhookEvent()` — Internal event processing
- `handlePaymentSuccess()` — Payment succeeded handler
- `handlePaymentFailure()` — Payment failed handler
- `handleRefund()` — Refund event handler
- `handlePaymentCanceled()` — Payment canceled handler

### MarketplaceController
- `createListing()` — Create resale listing
- `purchaseResaleTicket()` — Purchase ticket from marketplace
- `confirmTransfer()` — Confirm NFT transfer
- `getRoyaltyReport()` — Get venue royalty report
- `getPricingAnalytics()` — Get pricing analytics

### IntentsController
- `createIntent()` — Create payment intent

### GroupPaymentController
- `createGroup()` — Create group payment
- `contributeToGroup()` — Process member contribution
- `getGroupStatus()` — Get group payment status
- `sendReminders()` — Send payment reminders
- `getContributionHistory()` — Get contribution history

### VenueController
- `getBalance()` — Get venue balance
- `requestPayout()` — Request payout
- `getPayoutHistory()` — Get payout history

### RefundController
- `createRefund()` — Create refund request

### ComplianceController
- `getTaxForm()` — Get tax form data
- `downloadTaxForm()` — Download tax form PDF
- `getTaxSummary()` — Get tax summary

---

## 4. Repositories / Data Access

**Note**: This service uses **Knex query builder** directly rather than separate repository classes. Database access is performed in:

- **Models** (`src/models/`)
  - `TransactionModel` — CRUD for `payment_transactions`
  - `RefundModel` — CRUD for `payment_refunds`
  - `VenueBalanceModel` — CRUD for `venue_balances`

- **Services** — Many services query tables directly via `db()` from `src/config/database.ts`

### Primary Tables (via migrations)
- `payment_transactions` — Core payment records
- `payment_intents` — Stripe payment intents
- `payment_refunds` — Refund records
- `venue_balances` — Venue account balances
- `payment_escrows` — Marketplace escrow transactions
- `royalty_distributions` — Royalty payment records
- `royalty_payouts` — Batched royalty payouts
- `group_payments` — Group payment records
- `group_payment_members` — Group members
- `fraud_checks` — Fraud detection results
- `fraud_review_queue` — Manual review queue
- `aml_checks` — AML screening results
- `tax_collections` — Tax collection records
- `nft_mint_queue` — NFT minting queue
- `webhook_inbox` — Incoming webhook log

---

## 5. Middleware (`src/middleware/`)

- **`auth.ts`** — JWT authentication (`authenticate()`)
- **`internal-auth.ts`** — Internal service authentication
- **`idempotency.ts`** — Idempotency key handling (30-min TTL)
- **`rate-limit.middleware.ts`** — Rate limiting per endpoint/user
- **`rate-limiter.ts`** — Generic rate limiter factory
- **`error-handler.ts`** — Global error handling
- **`request-id.middleware.ts`** — Request ID generation
- **`request-logger.ts`** — Request/response logging
- **`tracing.middleware.ts`** — Distributed tracing (trace/span IDs)
- **`validation.ts`** — Request validation middleware

---

## 6. Config (`src/config/`)

### External Services Configured

#### Payment Processors
- **Stripe** — Primary payment processor
  - `secretKey`, `publishableKey`, `webhookSecret`
- **PayPal** — Alternative payment method
  - `clientId`, `clientSecret`, `mode`
- **Square** — POS integration
  - `accessToken`, `environment`
- **Plaid** — ACH/bank transfers
  - `clientId`, `secret`, `env`

#### Compliance & Tax
- **TaxJar** — Sales tax calculation
  - `apiKey`

#### Blockchain
- **Solana RPC** — NFT minting on Solana
  - `solanaRpcUrl`
- **Polygon RPC** — NFT minting on Polygon
  - `polygonRpcUrl`

#### Infrastructure
- **PostgreSQL** — Primary database
  - `host`, `port`, `name`, `user`, `password`
- **Redis** — Caching & queues
  - `host`, `port`, `password`

#### Internal Services
- Auth Service (3001)
- Event Service (3003)
- Ticket Service (3004)
- Venue Service (3002)
- Marketplace Service (3008)

#### Other Config Files
- **`blockchain.ts`** — Blockchain connection setup
- **`compliance.ts`** — Compliance configuration
- **`database.ts`** — Knex database config & pool
- **`fees.ts`** — Fee structure configuration
- **`redis.ts`** — Redis client setup
- **`secrets.ts`** — Secret management

---

## 7. Migrations (`src/migrations/`)

### `001_baseline_payment.ts` — Creates all tables

#### Core Payment Tables
1. **payment_transactions** — Main transaction records (venue, user, event, order, amount, status, fees, tax)
2. **venue_balances** — Venue account balances
3. **payment_refunds** — Refund records
4. **payment_intents** — Payment intent tracking
5. **payment_attempts** — Retry attempts
6. **payment_chargebacks** — Chargeback disputes

#### Royalty System (10 tables)
6. **venue_royalty_settings** — Venue royalty configuration
7. **event_royalty_settings** — Event-specific royalty overrides
8. **royalty_distributions** — Individual royalty distributions
9. **royalty_payouts** — Batched payout records
10. **royalty_reconciliation_runs** — Reconciliation job history
11. **royalty_discrepancies** — Identified discrepancies

#### Group Payments (3 tables)
12. **group_payments** — Group payment orchestration
13. **group_payment_members** — Individual members
14. **reminder_history** — Reminder tracking

#### Tax & Compliance (3 tables)
15. **tax_collections** — Tax collection records
16. **tax_forms_1099da** — Generated 1099-DA forms
17. **user_tax_info** — User W-9 information (encrypted TIN)

#### Fraud Detection (16 tables)
18. **fraud_checks** — Fraud check results
19. **device_activity** — Device tracking
20. **bot_detections** — Bot detection results
21. **known_scalpers** — Scalper database
22. **ip_reputation** — IP address reputation
23. **behavioral_analytics** — User behavior analysis
24. **velocity_limits** — Velocity thresholds
25. **velocity_records** — Purchase velocity tracking
26. **fraud_rules** — Custom fraud rules
27. **fraud_review_queue** — Manual review queue
28. **card_fingerprints** — Card reputation tracking
29. **ml_fraud_models** — ML model metadata
30. **ml_fraud_predictions** — ML prediction history
31. **account_takeover_signals** — Account takeover detection
32. **scalper_reports** — User-reported scalpers
33. **purchase_limit_violations** — Limit violation log

#### AML (Anti-Money Laundering) (4 tables)
34. **aml_checks** — AML screening results
35. **sanctions_list_matches** — Sanctions list matches
36. **pep_database** — Politically exposed persons
37. **suspicious_activity_reports** — SAR filings

#### High-Demand Events (2 tables)
38. **waiting_room_activity** — Waiting room tracking
39. **event_purchase_limits** — Per-event purchase limits

#### Marketplace (5 tables)
40. **payment_escrows** — Escrow for resales
41. **escrow_release_conditions** — Release criteria
42. **venue_price_rules** — Price enforcement rules
43. **resale_listings** — Marketplace listings
44. **payment_reserves** — Chargeback reserves

#### Blockchain/NFT (1 table)
45. **nft_mint_queue** — NFT minting job queue

#### Event Sourcing & State (3 tables)
46. **payment_event_sequence** — Event log with sequence numbers
47. **payment_state_transitions** — State change audit
48. **payment_state_machine** — Valid state transitions

#### Webhooks (3 tables)
49. **webhook_inbox** — Incoming webhooks
50. **webhook_events** — Processed webhook events
51. **outbound_webhooks** — Outgoing webhooks to partners

#### Other (7 tables)
52. **payment_idempotency** — Idempotency key cache
53. **inventory_reservations** — Ticket holds during checkout
54. **payment_notifications** — User notifications
55. **reconciliation_reports** — Daily reconciliation reports
56. **settlement_batches** — Payment settlement batches
57. **payment_retries** — Retry tracking
58. **outbox_dlq** — Dead letter queue for failed events

### Database Functions
- `update_updated_at_column()` — Auto-update updated_at timestamp
- `validate_payment_state_transition()` — Enforce state machine rules
- `get_next_sequence_number()` — Event sequence generation
- `update_user_total_spent()` — Update user aggregates on payment

---

## 8. Validators (`src/validators/`)

### PaymentRequestValidator (`payment-request.ts`)
- `validate(request)` — Validates payment request schema
- `sanitize(request)` — Sanitizes payment data

### WebhookPayloadValidator (`webhook-payload.ts`)
- `validateStripePayload()` — Validates Stripe webhook structure
- `validatePaymentIntent()` — Validates PaymentIntent object
- `validateCharge()` — Validates Charge object
- `validateSquarePayload()` — Validates Square webhook structure

---

## 9. Other Folders

### `src/cron/`
Scheduled jobs:
- **`payment-reconciliation.ts`** — Daily payment reconciliation
- **`webhook-cleanup.ts`** — Clean old webhook records

### `src/jobs/`
Background workers:
- **`process-webhook-queue.ts`** — Process queued webhooks
- **`retry-failed-payments.ts`** — Retry failed payments
- **`royalty-reconciliation.job.ts`** — Blockchain royalty reconciliation

### `src/models/`
Data models (as noted in section 4):
- **`transaction.model.ts`** — Transaction CRUD
- **`refund.model.ts`** — Refund CRUD
- **`venue-balance.model.ts`** — Venue balance CRUD

### `src/processors/`
Event processors:
- **`order-event-processor.ts`** — Process order events
- **`payment-event-processor.ts`** — Process payment events

### `src/types/`
TypeScript type definitions:
- **`payment.types.ts`** — Payment-related types
- **`fraud.types.ts`** — Fraud detection types
- **`group.types.ts`** — Group payment types
- **`marketplace.types.ts`** — Marketplace types
- **`blockchain.types.ts`** — Blockchain types

### `src/utils/`
Utility functions:
- **`logger.ts`** — Winston logger configuration
- **`metrics.ts`** — Metrics helpers
- **`money.ts`** — Currency/decimal utilities
- **`validation.util.ts`** — Validation helpers
- **`circuit-breaker.ts`** — Circuit breaker pattern
- **`graceful-degradation.ts`** — Graceful degradation helpers
- **`retry.ts`** — Retry logic with backoff
- **`pci-log-scrubber.util.ts`** — Remove PCI data from logs

### `src/webhooks/`
Webhook handlers:
- **`stripe-handler.ts`** — Stripe webhook processing

### `src/workers/`
Background workers:
- **`outbox.processor.ts`** — Outbox pattern processor
- **`webhook.consumer.ts`** — Webhook consumer
- **`webhook.processor.ts`** — Webhook processing worker

### `tests/`
Comprehensive test suite:
- **`e2e/`** — End-to-end tests (complete flows)
- **`integration/`** — Integration tests (service layer)
- **`unit/`** — Unit tests (individual functions)
- **`load/`** — Load/performance tests
- **`endpoints/`** — API endpoint tests
- **`fixtures/`** — Test data fixtures

### `docs/`
Technical documentation:
- **`FEE_CALCULATOR_ARCHITECTURE.md`**
- **`MULTI_PROCESSOR_INTEGRATION_WORK_PLAN.md`**
- **`PAYMENT_SERVICE_AUDIT.md`**
- **`PAYMENT_SERVICE_IMPROVEMENT_PLAN.md`**
- **`PHASE_3_COMPLETION.md`**
- **`PHASE1_QUICK_WINS_COMPLETION.md`**
- **`SERVICE_DOCUMENTATION.md`**
- **`TAX_CALCULATOR_ANALYSIS.md`**
- **`TEST_SUITE_SUMMARY.md`**

### `scripts/`
Utility scripts:
- **`test-endpoints.sh`** — API endpoint testing script

---

## Key Features

### ✅ Implemented
- Payment processing (Stripe, PayPal, Square, Plaid)
- Dynamic fee calculation (tiered pricing)
- Sales tax calculation (TaxJar integration)
- Refund management with policies
- Group payment orchestration
- Marketplace escrow & royalties
- Comprehensive fraud detection (ML-powered, multi-signal)
- AML/KYC compliance (sanctions, PEP screening)
- 1099-DA tax form generation
- NFT minting queue (Solana, Polygon)
- Gas fee estimation
- Event sourcing with sequence guarantees
- Payment state machine
- Idempotency support (30-min TTL)
- Rate limiting per endpoint
- Webhook processing (Stripe, Square)
- Chargeback reserve management
- Transaction timeout handling
- Payment reconciliation
- Royalty reconciliation (blockchain)
- Distributed tracing
- PCI-compliant logging

### 🔒 Security Features
- JWT authentication
- Internal service auth
- Request validation
- PCI log scrubbing
- Encrypted TIN storage
- Rate limiting
- Fraud detection
- AML screening
- Bot detection
- IP reputation tracking
- Device fingerprinting

### 📊 Observability
- Prometheus metrics
- Structured logging (Winston)
- Distributed tracing
- Request ID tracking
- Comprehensive health checks
- Performance analytics

---

## Database Schema Summary

**60 tables** covering:
- Payment transactions & intents
- Refunds & chargebacks
- Venue balances & payouts
- Royalty system (distribution, payouts, reconciliation)
- Group payments
- Tax & compliance (1099-DA, W-9, AML)
- Fraud detection (16 tables)
- Marketplace & escrow
- NFT minting queue
- Event sourcing & state machine
- Webhooks (inbound/outbound)
- Reconciliation & settlement

---

## Integration Points

### Upstream Dependencies
- **Auth Service** — User authentication
- **Event Service** — Event data
- **Ticket Service** — Ticket inventory
- **Venue Service** — Venue configuration
- **Marketplace Service** — Secondary market listings

### Downstream Integrations
- **Stripe** — Payment processing
- **PayPal** — Alternative payments
- **Square** — POS integration
- **Plaid** — Bank transfers
- **TaxJar** — Tax calculation
- **Solana/Polygon** — NFT minting
- **Redis** — Caching & queues
- **PostgreSQL** — Persistent storage

---

## Development Notes

### Running the Service
```bash
# Install dependencies
npm install

# Run migrations
npm run migrate:up

# Start in development
npm run dev

# Run tests
npm test

# Production
npm start
```

### Environment Variables
See `.env.example` for required configuration:
- Database credentials
- Redis connection
- Stripe keys
- PayPal credentials
- Square credentials
- Plaid credentials
- TaxJar API key
- Blockchain RPC URLs
- Service URLs

---

## Architecture Patterns

- **Event Sourcing** — Payment events with sequence numbers
- **State Machine** — Validated payment state transitions
- **Outbox Pattern** — Reliable event publishing
- **Idempotency** — Duplicate request prevention
- **Circuit Breaker** — External service fault tolerance
- **Rate Limiting** — API protection
- **Queue-based Processing** — Async job handling (Bull)
- **Escrow Pattern** — Marketplace transaction safety
- **Reserve Pattern** — Chargeback risk management

---

## Monitoring & Alerts

### Health Endpoints
- `/health` — Basic liveness
- `/health/ready` — Readiness (DB + Redis + Stripe)
- `/health/db` — Database health
- `/health/redis` — Redis health
- `/health/stripe` — Stripe API health

### Metrics Exposed
- Payment volume by status
- Fee calculations
- Tax calculations
- Gas fee estimations
- Fraud detection scores
- API latency
- Database query performance
- Cache hit rates

---

**Generated:** 2025-12-21  
**Service Version:** 1.0  
**Schema Version:** 001_baseline_payment
