# PAYMENT-SERVICE COMPREHENSIVE AUDIT REPORT

**Audit Date:** 2026-01-23
**Service:** payment-service
**Location:** backend/services/payment-service/
**Files Analyzed:** 80+ TypeScript source files

---

## 1. SERVICE CAPABILITIES

### Public Endpoints

| Method | Path | Controller | Purpose |
|--------|------|------------|---------|
| POST | `/payments` | payment.controller | Create payment |
| GET | `/payments/:id` | payment.controller | Get payment details |
| GET | `/payments` | payment.controller | List payments |
| POST | `/payments/:id/capture` | payment.controller | Capture authorized payment |
| POST | `/payments/:id/cancel` | payment.controller | Cancel payment |
| POST | `/payments/confirm` | payment.controller | Confirm payment intent |
| GET | `/payments/history` | payment.controller | Get payment history |
| POST | `/payment-intents` | intentsController | Create Stripe PaymentIntent |
| GET | `/payment-intents/:intentId` | intentsController | Get payment intent |
| POST | `/payment-intents/:intentId/confirm` | intentsController | Confirm payment intent |
| POST | `/refunds` | refundController | Request refund |
| GET | `/refunds/:id` | refundController | Get refund status |
| GET | `/refunds` | refundController | List refunds |
| POST | `/group-payments` | group-payment.controller | Create group payment |
| GET | `/group-payments/:id` | group-payment.controller | Get group payment |
| POST | `/group-payments/:id/contribute` | group-payment.controller | Contribute to group |
| POST | `/group-payments/:id/finalize` | group-payment.controller | Finalize group payment |
| POST | `/webhooks/stripe` | webhook.controller | Stripe webhooks (raw body) |
| POST | `/webhooks/stripe-connect` | webhook.controller | Stripe Connect webhooks |
| GET | `/escrow/:id` | escrow.routes | Get escrow account |
| POST | `/escrow/:id/release` | escrow.routes | Release escrow funds |
| GET | `/marketplace/payment/:listingId` | marketplace.controller | Get marketplace payment |
| POST | `/marketplace/purchase` | marketplace.controller | Initiate marketplace purchase |
| GET | `/compliance/aml/:userId` | compliance.routes | Get AML check status |
| POST | `/compliance/kyc/verify` | compliance.routes | Submit KYC verification |
| GET | `/fees/calculate` | fee-calculator.routes | Calculate fees for amount |
| POST | `/royalties/distribute` | royalty.routes | Distribute royalties |
| GET | `/fraud/check/:id` | fraud.routes | Get fraud check result |
| POST | `/fraud/review/:id/approve` | fraud.routes | Approve fraud review |
| POST | `/fraud/review/:id/reject` | fraud.routes | Reject fraud review |
| GET | `/venues/:venueId/balance` | venue.controller | Get venue balance |
| GET | `/venues/:venueId/payouts` | venue.controller | Get venue payout history |

### Internal Endpoints (S2S)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/internal/process-payment` | Process payment from order-service |
| POST | `/internal/refund` | Process refund request |
| GET | `/internal/payment/:id` | Get payment by ID |
| GET | `/internal/order/:orderId/payment` | Get payment by order |
| POST | `/internal/validate-payment-method` | Validate payment method |
| POST | `/internal/reserve-funds` | Reserve funds for order |
| POST | `/internal/release-funds` | Release reserved funds |
| POST | `/internal/tax/calculate` | Calculate tax for order |
| GET | `/internal/tax/rates` | Get tax rates for jurisdiction |
| POST | `/internal/webhook/payment-completed` | Notify of completed payment |
| GET | `/internal/health` | Health check |

### Admin Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/admin/transactions` | List all transactions |
| GET | `/admin/metrics` | Get payment metrics |
| POST | `/admin/reconciliation/run` | Trigger manual reconciliation |
| GET | `/admin/reconciliation/reports` | Get reconciliation reports |
| POST | `/admin/cache/clear` | Clear payment caches |
| GET | `/admin/audit-log` | Get audit log entries |
| POST | `/admin/maintenance-mode` | Toggle maintenance mode |

### Business Operations Summary
- **Payment Processing**: Stripe PaymentIntents, captures, cancellations
- **Refund Handling**: Full/partial refunds with policy enforcement
- **Fee Calculation**: Platform fees, processing fees, multi-currency support
- **Escrow Management**: Time-based holds, conditional release, disputes
- **Marketplace Payments**: P2P payments with escrow and royalties
- **Group Payments**: Split bills with contribution tracking
- **Royalty Distribution**: Venue/artist payment splits
- **Fraud Detection**: ML-based scoring, velocity checks, AML/OFAC
- **Compliance**: AML checks, SAR generation, PEP screening
- **Tax Calculation**: Multi-jurisdiction tax computation
- **Stripe Connect**: Connected account transfers, payout scheduling

---

## 2. DATABASE SCHEMA

### Tables Overview (72 total - 4 global, 68 tenant-scoped)

#### Global Tables (no tenant_id, no RLS)
1. **payment_state_machine** - Payment state transition rules
2. **ml_fraud_models** - Platform-wide ML fraud models
3. **ip_reputation** - Cross-tenant IP reputation tracking
4. **card_fingerprints** - Cross-tenant card fraud detection

#### Core Payment Tables
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| payment_transactions | Main payment records | id, tenant_id, user_id, event_id, order_id, amount, status, stripe_payment_intent_id |
| payment_refunds | Refund records | id, tenant_id, transaction_id, amount, status, stripe_refund_id |
| payment_intents | Stripe PaymentIntent tracking | id, tenant_id, order_id, stripe_intent_id, amount, status |
| venue_balances | Venue payout balances | id, tenant_id, venue_id, available_balance, pending_balance, held_for_disputes |

#### Royalty System Tables
| Table | Purpose |
|-------|---------|
| venue_royalty_settings | Default royalty percentages per venue |
| event_royalty_settings | Event-specific royalty overrides |
| royalty_distributions | Individual royalty payments |
| royalty_payouts | Aggregated payout batches |
| royalty_reconciliation_runs | Reconciliation job history |
| royalty_discrepancies | Identified discrepancies |
| royalty_reversals | Refund-related royalty reversals |

#### Group Payments Tables
| Table | Purpose |
|-------|---------|
| group_payments | Group payment sessions |
| group_payment_members | Individual member contributions |
| reminder_history | Payment reminder tracking |

#### Tax & Compliance Tables
| Table | Purpose |
|-------|---------|
| tax_collections | Tax collected per transaction |
| tax_forms_1099da | Generated 1099-DA forms |
| user_tax_info | User TIN and W-9 data (encrypted) |
| aml_checks | AML check results |
| sanctions_list_matches | OFAC/sanctions matches |
| pep_database | Politically Exposed Persons |
| suspicious_activity_reports | SAR filings |

#### Fraud Detection Tables
| Table | Purpose |
|-------|---------|
| fraud_checks | Fraud check results |
| device_activity | Device fingerprint activity |
| bot_detections | Bot detection results |
| known_scalpers | Scalper blacklist |
| behavioral_analytics | User behavior tracking |
| velocity_limits | Rate limit configurations |
| velocity_records | Rate limit tracking |
| fraud_rules | Configurable fraud rules |
| fraud_review_queue | Manual review queue |
| ml_fraud_predictions | ML model predictions |
| account_takeover_signals | ATO detection signals |
| scalper_reports | User-submitted reports |

#### Marketplace/Escrow Tables
| Table | Purpose |
|-------|---------|
| payment_escrows | P2P marketplace escrow |
| escrow_release_conditions | Conditional release rules |
| escrow_accounts | General order escrow |
| escrow_events | Escrow audit trail |

#### Additional Tables
| Table | Purpose |
|-------|---------|
| stripe_transfers | Stripe Connect transfer records |
| pending_transfers | Failed transfers pending retry |
| reconciliation_reports | Daily reconciliation results |
| balance_transaction_snapshots | Stripe balance snapshots |
| background_jobs | Job queue |
| webhook_inbox | Webhook idempotency tracking |

### Sensitive Data Handling

| Field | Table | Handling |
|-------|-------|----------|
| tin_encrypted | user_tax_info | AES-256-GCM encrypted |
| tin_last_four | user_tax_info | Last 4 digits only |
| card_fingerprint | card_fingerprints | Stripe tokenized fingerprint |
| payment_method_fingerprint | payment_transactions | Tokenized |
| device_fingerprint | fraud_checks | Hashed |

**PCI Compliance Assessment:**
- **Card numbers**: NOT stored in database (uses Stripe tokens)
- **CVV/CVC**: Never stored or logged
- **TIN/SSN**: Encrypted with AES-256-GCM
- **Card fingerprints**: Stripe's tokenized fingerprints only

### Row-Level Security (RLS)
All tenant-scoped tables have RLS policies:
```sql
USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
```

### Schema Issues
1. **MEDIUM**: `tin_encrypted` uses static salt in scrypt key derivation (`'salt'`) - should use random salt
2. **LOW**: Some tables missing explicit `ON DELETE CASCADE` for foreign keys to payment_transactions

---

## 3. SECURITY ANALYSIS

### A. Payment Security (PCI Compliance)

#### PCI Log Scrubber Analysis (`src/utils/pci-log-scrubber.util.ts`)
**Rating: EXCELLENT**

| Check | Status | Details |
|-------|--------|---------|
| Card numbers scrubbed | ✅ | Pattern matches 13-19 digit sequences |
| Track data scrubbed | ✅ | Track 1 & Track 2 patterns |
| CVV scrubbed | ✅ | Multiple CVV/CVC patterns |
| Expiration dates scrubbed | ✅ | Various date formats |
| PIN blocks scrubbed | ✅ | Hex PIN block patterns |
| SSN scrubbed | ✅ | Standard SSN patterns |
| Tokens scrubbed | ✅ | Bearer tokens, API keys |
| SafeLogger class | ✅ | Auto-scrubs all log output |

#### Crypto Utilities Analysis (`src/utils/crypto.util.ts`)
**Rating: GOOD**

| Feature | Status | Details |
|---------|--------|---------|
| Timing-safe comparison | ✅ | Uses `crypto.timingSafeEqual()` |
| HMAC verification | ✅ | Proper timing-safe HMAC verify |
| AES-256-GCM encryption | ✅ | Authenticated encryption |
| Secure random generation | ✅ | Uses `crypto.randomBytes()` |
| Key derivation | ⚠️ | Static salt in `encrypt()` function |

**Issue Found:**
```typescript
// Line 197: Static salt - should be random per encryption
const derivedKey = crypto.scryptSync(key, 'salt', 32);
```

### B. S2S Authentication

#### Internal Auth Middleware (`src/middleware/internal-auth.middleware.ts`)
**Rating: GOOD**

| Feature | Status | Details |
|---------|--------|---------|
| HMAC-SHA256 | ✅ | Uses shared library validator |
| Replay attack prevention | ✅ | 60-second window |
| Service allowlist | ✅ | Configurable via env |
| Error handling | ✅ | Specific error types |

#### Outbound HTTP Calls

| File:Line | Service | Endpoint | Auth Method | Notes |
|-----------|---------|----------|-------------|-------|
| stripe-handler.ts:486 | marketplace-service | /webhooks/payment-completed | X-Internal-Service header | ⚠️ Missing HMAC signature |
| webhook.consumer.ts:71-87 | notification-service | various | axios POST | ⚠️ No auth headers |
| webhook.consumer.ts:152 | external webhooks | target.url | HMAC signature | ✅ Proper signing |
| fee-calculator.service.ts:124 | venue-service | /api/venues/:id | axios GET | ⚠️ No auth |
| fee-calculator.service.ts:131 | tier-service | /api/tiers/:id | axios GET | ⚠️ No auth |
| gas-fee-estimator.service.ts:150 | blockchain RPC | POST | None | External service |
| royalty-reconciliation.service.ts:72 | blockchain-indexer | /api/v1/marketplace/sales | axios POST | ⚠️ No auth |
| reconciliation-service.ts | various | various | axios | ⚠️ No auth |
| tax-calculator.service.ts:115 | TaxJar API | external | API key | ✅ Proper |

**Critical Issues:**
1. **HIGH**: marketplace-service notification (stripe-handler.ts:486) uses only `X-Internal-Service` header without HMAC signature
2. **MEDIUM**: Multiple internal HTTP calls to venue-service, tier-service, blockchain-indexer lack authentication headers

### C. Service Boundary Check

**Direct Database Access to Other Services' Tables:**

| Table | Owner | Accessed In | Justification |
|-------|-------|-------------|---------------|
| tickets | ticket-service | refund-policy.service.ts | ⚠️ BYPASS - refund eligibility checks |
| events | event-service | refund-policy.service.ts | ⚠️ BYPASS - event date for refund window |
| venues | venue-service | refund-policy.service.ts | ⚠️ BYPASS - venue refund policies |
| users | auth-service | stripe-handler.ts:411 | ⚠️ Updates stripe_connect_* fields |

**Assessment:** The `refund-policy.service.ts` file has a documented bypass exception explaining the cross-service DB access for transactional consistency. However, updating `users` table from webhook handlers is a service boundary violation.

### D. Webhook Security

#### Stripe Webhook Verification (`src/utils/webhook-signature.ts`)
**Rating: EXCELLENT**

| Feature | Status | Details |
|---------|--------|---------|
| Signature parsing | ✅ | Proper t= and v1= parsing |
| Timestamp validation | ✅ | 5-minute max age |
| Future timestamp check | ✅ | 1-minute tolerance |
| Timing-safe comparison | ✅ | Uses `secureCompare()` |
| Multiple signatures | ✅ | Supports signature rotation |

#### Stripe Webhook Handler (`src/webhooks/stripe-handler.ts`)
**Rating: GOOD**

| Feature | Status | Details |
|---------|--------|---------|
| Idempotency | ✅ | webhook_inbox table with unique constraint |
| Retry limit | ✅ | Max 5 retries (configurable) |
| Rate limiting | ✅ | OutboundRateLimiter class |
| Async processing | ✅ | Queue-based processing (WH-10) |
| User-friendly errors | ✅ | Decline code translation (ST-7) |
| Stripe rate limit handling | ✅ | Retry with backoff (ST-5) |

#### Replay Protection
```typescript
// In-memory replay protection with cleanup
class ReplayProtection {
  private seenIds: Map<string, number> = new Map();
  // 5-minute expiry, 1-minute cleanup interval
}
```
**Note:** Production should use Redis for distributed replay protection.

### E. Other Security

#### SQL Injection
**Rating: GOOD** - All database queries use parameterized queries with `$1, $2...` placeholders.

#### Input Validation
**Rating: GOOD** - Zod schemas used for request validation in routes.

#### Rate Limiting
**Rating: GOOD** - Velocity limits implemented in fraud detection, configurable per entity type.

#### Compliance Features
- **AML Checks**: Transaction threshold monitoring, aggregate analysis, pattern detection
- **OFAC Screening**: Sanctions list matching (local DB, needs external API integration)
- **PEP Screening**: Politically exposed person tracking
- **SAR Generation**: Suspicious Activity Report filing support
- **Structuring Detection**: Detects transactions just below $10k threshold

---

## 4. FEE CALCULATION

### Service: `src/services/fee-calculation.service.ts`

#### Fee Structure

| Fee Type | Rate | Minimum |
|----------|------|---------|
| Platform Fee | 5% | $1.00 |
| Stripe Processing | 2.9% + $0.30 | - |

#### Multi-Currency Support (FEE-7)

| Currency | Processing % | Fixed Fee |
|----------|--------------|-----------|
| USD | 2.9% | $0.30 |
| EUR | 2.5% | €0.25 |
| GBP | 2.5% | £0.20 |
| CAD | 2.9% | $0.30 |
| AUD | 2.9% | $0.30 |
| JPY | 3.6% | ¥0 |

#### Default Revenue Split (FEE-4)

| Recipient | Percentage | Notes |
|-----------|------------|-------|
| Venue | 70% | Primary recipient |
| Artist | 25% | Optional, rolls to venue if absent |
| Platform | 5% | Service fee |

#### Calculation Logic
```typescript
calculateFees(totalAmountInCents, recipients) {
  1. Calculate Stripe fee: (amount * 2.9%) + 30
  2. Calculate platform fee: max(amount * 5%, 100)
  3. Net distributable = total - stripeFee - platformFee
  4. Split among recipients proportionally
}
```

#### Edge Cases Handled
- ✅ Zero/negative net distributable (warning logged)
- ✅ Last recipient gets remainder (prevents rounding errors)
- ✅ Partial refunds (proportional to original splits)
- ✅ Royalty reversals (tracked in `royalty_reversals` table)

#### Rounding/Precision
- All calculations use cents (integers)
- `Math.round()` for proportional splits
- Last recipient adjustment prevents over/under allocation

---

## 5. REFUND LOGIC

### Service: `src/services/refund-policy.service.ts`

#### Refund Policies

| Policy | Default Value | Notes |
|--------|---------------|-------|
| Default window | 48 hours before event | |
| Minimum window | 2 hours before event | Hard cutoff |
| Custom windows | Per venue/event type | Configurable |

#### Eligibility Check Flow
1. Query ticket, event, and venue data
2. Calculate refund deadline: `eventDate - windowHours`
3. Check if current time <= deadline
4. Check minimum window (2-hour hard cutoff)
5. Cache result for 5 minutes

#### Refund States

| Status | Description |
|--------|-------------|
| pending | Request submitted |
| completed | Refund processed |
| rejected | Policy violation |

#### Partial vs Full Refunds
- Full refunds: Ticket price returned in full
- Partial refunds: Proportional distribution to all recipients
- Stripe fees: NOT refunded back to platform (absorbed as loss)

#### Integration with Stripe
```typescript
// Creates Stripe refund via payment_refunds table
// Updates ticket status to 'refund_pending'
// Uses database transaction for atomicity
```

---

## 6. PAYMENT STATE MACHINE

### Service: `src/services/state-machine/payment-state-machine.ts`

#### States

| State | Description |
|-------|-------------|
| PENDING | Payment created, awaiting processing |
| PROCESSING | Payment being processed by Stripe |
| COMPLETED | Payment successful |
| FAILED | Payment failed |
| REFUNDED | Full refund processed |
| CANCELLED | Payment cancelled before processing |

#### Valid Transitions

| From | To | Event |
|------|----|----|
| PENDING | PROCESSING | process |
| PROCESSING | COMPLETED | complete |
| PROCESSING | FAILED | fail |
| FAILED | PROCESSING | retry |
| COMPLETED | REFUNDED | refund |
| PENDING | CANCELLED | cancel |

#### Database State Machine (`payment_state_machine` table)
Additional transitions stored in database:
- PENDING → PAID (payment.succeeded)
- PENDING → PAYMENT_FAILED (payment.failed)
- PAID → REFUNDING (refund.initiated)
- PAID → PARTIALLY_REFUNDED (refund.partial)
- REFUNDING → REFUNDED (refund.completed)

#### Validation
```typescript
canTransition(from: PaymentState, event: string): boolean {
  const key = `${from}-${event}`;
  return this.transitions.has(key);
}
```

---

## 7. STRIPE INTEGRATION

### Service: `src/services/stripe-connect-transfer.service.ts`

#### Stripe API Usage Patterns

| Feature | Implementation |
|---------|----------------|
| API Version | 2023-10-16 |
| Timeout | 30 seconds |
| PaymentIntents | Create, confirm, capture, cancel |
| Transfers | Create with transfer_group, source_transaction |
| Transfer Reversals | Partial/full reversals on refund |
| Balance Transactions | Daily reconciliation |
| Account Management | Payout schedule configuration |

#### Circuit Breaker
Not explicitly implemented in payment-service. Relies on timeout settings and retry logic.

#### Error Handling
```typescript
// ST-5: Stripe rate limit handling
if (error.type === 'StripeRateLimitError' || error.statusCode === 429) {
  // Schedule retry with backoff
}

// ST-7: User-friendly decline messages
const CARD_DECLINE_MESSAGES = {
  'insufficient_funds': 'Your card has insufficient funds...',
  'lost_card': 'This card cannot be used...',
  // ... 12 more decline codes
};
```

#### Connect Account Handling
- Account status tracking (enabled, disabled, restricted)
- Payout schedule configuration (daily/weekly/monthly)
- Transfer group for payment tracking
- source_transaction for payout timing control

---

## 8. MARKETPLACE PAYMENTS

### Services: `src/services/marketplace/`

#### Flow
1. Buyer initiates purchase for listing
2. Create PaymentIntent with listing metadata
3. Payment captured into platform account
4. Create escrow account with 7-day hold
5. On release: transfer to seller (minus fees and royalties)

#### Escrow Implementation (`src/services/escrow.service.ts`)

| Status | Description |
|--------|-------------|
| pending | Escrow created |
| held | Funds captured |
| partially_released | Some funds released |
| released | All funds released |
| cancelled | Escrow cancelled |
| disputed | Under dispute |

#### Release Conditions
- Time-based: Automatic after hold period
- Event-based: Ticket transfer confirmed
- Manual: Admin release

#### Royalty Distribution (`src/services/marketplace/royalty-splitter.service.ts`)
- Venue royalty: Configured per event
- Artist royalty: Optional, configured per event
- Platform fee: 5% minimum
- Seller payout: Remainder after fees

#### Payout Logic
```typescript
async handleRefundWithReversals(paymentId, refundAmount, tenantId) {
  // Get all transfers for payment
  // Calculate proportional reversals
  // Create Stripe transfer reversals
}
```

---

## 9. COMPLIANCE

### Services: `src/services/compliance/`

#### AML Checks (`aml-checker.service.ts`)

| Check | Threshold | Risk Score Impact |
|-------|-----------|-------------------|
| Transaction amount | $10,000+ | +0.30 |
| 30-day aggregate | $10,000+ | +0.25 |
| Rapid high-value | 3+ txns >$5k in 24h | +0.20 |
| Structuring | Multiple $9k-$9.99k txns | +0.30 |
| Unusual geography | 5+ countries or high-risk | +0.15 |
| Sanctions match | Any | =1.00 |
| PEP status | Any | +0.30 |

**Review threshold:** Risk score >= 0.50

#### OFAC Screening
- Local database check (`sanctions_list_matches` table)
- **Note:** Production should integrate with external OFAC API

#### Transaction Monitoring
- Pattern detection for structuring (smurfing)
- Geographic anomaly detection
- High-risk country flagging (KP, IR, SY, CU, VE)

#### SAR Generation
```typescript
async generateSAR(userId, transactionIds, suspiciousActivity) {
  // Creates SAR with 30-day filing deadline
  // Status tracking: pending -> filed
}
```

---

## 10. BACKGROUND JOBS

### Job Processor: `src/jobs/background-job-processor.ts`

#### Configuration

| Setting | Default | Purpose |
|---------|---------|---------|
| Base retry delay | 60 seconds | Initial retry wait |
| Max retry delay | 1 hour | Maximum backoff |
| Backoff multiplier | 2x | Exponential backoff |
| Jitter factor | 10% | Prevent thundering herd |
| Stalled timeout | 5 minutes | Detect stuck jobs |
| Dead letter enabled | true | Move failed jobs |

#### Job Types

| Job File | Purpose |
|----------|---------|
| background-job-processor.ts | Main job orchestrator with tenant context |
| process-webhook-queue.ts | Process queued Stripe webhooks |
| retry-failed-payments.ts | Retry failed payment intents |
| royalty-reconciliation.job.ts | Daily royalty reconciliation |
| transfer-retry.job.ts | Retry failed Stripe transfers |
| tenant-job-utils.ts | Tenant context utilities |

#### Key Features
- **BJ-3**: Max retry limit with dead letter queue
- **BJ-4**: Exponential backoff with jitter
- **BJ-5**: Dead letter queue for failed jobs
- **BJ-6**: Stalled job detection and recovery
- **BJ-9**: Correlation ID tracking

### Workers

| Worker | Purpose |
|--------|---------|
| webhook.consumer.ts | Process webhook events |
| webhook.processor.ts | Webhook processing orchestration |
| outbox.processor.ts | Transactional outbox pattern |

### Cron Jobs

| Job | Schedule | Purpose |
|-----|----------|---------|
| payment-reconciliation.ts | Daily | Reconcile payments with Stripe |

---

## 11. CODE QUALITY

### TODO/FIXME Comments

| Location | Comment |
|----------|---------|
| controllers/venue.controller.ts:79 | TODO: Implement getPayoutHistory method |
| controllers/group-payment.controller.ts:75 | TODO: Make getGroupPayment public |
| jobs/background-job-processor.ts:699 | TODO: Implement actual event publishing |
| routes/admin.routes.ts:282 | TODO: Implement cache clearing |
| routes/admin.routes.ts:299 | TODO: Implement audit log query |
| routes/admin.routes.ts:324 | TODO: Implement maintenance mode toggle |

### `any` Type Usage
**Total occurrences:** 287 across 81 files

**High-usage files:**
- logger.ts: 13 occurrences
- controllers/refundController.ts: 11 occurrences
- services/fraud/advanced-fraud-detection.service.ts: 10 occurrences
- workers/outbox.processor.ts: 10 occurrences

### Error Handling
**Rating: GOOD**
- Custom error classes with status codes
- Try-catch blocks around database operations
- Stripe error handling with specific error types
- User-friendly decline messages

### Dependencies (`package.json`)
Key dependencies:
- stripe: Payment processing
- pg: PostgreSQL client
- fastify: HTTP framework
- axios: HTTP client for internal calls
- uuid: ID generation

---

## 12. COMPARISON TO OTHER SERVICES

| Metric | payment-service | event-service | ticket-service |
|--------|-----------------|---------------|----------------|
| Source files | 80+ | 45+ | 50+ |
| Tables | 72 | 12 | 18 |
| Critical issues | 3 | 2 | 1 |
| S2S auth | Partial | Full | Full |
| RLS coverage | 100% | 100% | 100% |
| Test coverage | Unknown | Unknown | Unknown |

---

## FINAL SUMMARY

### CRITICAL ISSUES

1. **CRITICAL: Missing HMAC on Internal HTTP Calls**
   - File: `src/webhooks/stripe-handler.ts:486`
   - Issue: Marketplace notification uses only `X-Internal-Service` header
   - Risk: Spoofable internal requests
   - Fix: Add HMAC signature using shared library

2. **CRITICAL: Service Boundary Violation**
   - File: `src/webhooks/stripe-handler.ts:411-434`
   - Issue: Directly updates `users` table (auth-service owned)
   - Risk: Data consistency issues
   - Fix: Call auth-service API to update Connect status

3. **CRITICAL: Multiple Unauthenticated Internal Calls**
   - Files: fee-calculator.service.ts, royalty-reconciliation.service.ts
   - Issue: HTTP calls to venue-service, tier-service without auth
   - Risk: Unauthorized access to internal APIs
   - Fix: Add HMAC authentication to all internal HTTP calls

### HIGH PRIORITY

1. **HIGH: Static Salt in Encryption**
   - File: `src/utils/crypto.util.ts:197`
   - Issue: `scryptSync(key, 'salt', 32)` uses static salt
   - Risk: Weakened encryption, rainbow table attacks
   - Fix: Generate and store random salt per encryption

2. **HIGH: In-Memory Replay Protection**
   - File: `src/utils/webhook-signature.ts:301`
   - Issue: ReplayProtection uses local Map, not distributed
   - Risk: Replay attacks in multi-instance deployment
   - Fix: Use Redis for distributed replay protection

### MEDIUM PRIORITY

1. **MEDIUM: Cross-Service DB Access in Refund Policy**
   - File: `src/services/refund-policy.service.ts`
   - Issue: Queries tickets, events, venues tables directly
   - Note: Has documented bypass exception
   - Recommendation: Consider API calls for cleaner separation

2. **MEDIUM: TODO Items in Admin Routes**
   - Files: `src/routes/admin.routes.ts`
   - Issue: Cache clearing, audit log, maintenance mode not implemented
   - Fix: Implement or remove stubs

3. **MEDIUM: High `any` Usage**
   - Issue: 287 `any` type occurrences
   - Risk: Type safety gaps
   - Fix: Replace with proper TypeScript types

### PAYMENT SECURITY ASSESSMENT

| Area | Rating | Notes |
|------|--------|-------|
| PCI Compliance | **EXCELLENT** | No card data stored, comprehensive log scrubbing |
| Webhook Security | **EXCELLENT** | Proper signature verification, replay protection |
| Refund Logic | **GOOD** | Policy enforcement, transactional consistency |
| Fee Calculation | **EXCELLENT** | Multi-currency, proper rounding, edge cases handled |
| Fraud Detection | **GOOD** | ML-based, AML, velocity checks |
| Stripe Integration | **GOOD** | Connect support, error handling, user-friendly messages |
| S2S Authentication | **NEEDS WORK** | Multiple gaps in internal HTTP calls |

---

**Files Analyzed:** 80+
**Critical Issues:** 3
**High Priority:** 2
**Medium Priority:** 3

**Overall Assessment:** Payment-service has excellent PCI compliance and payment security fundamentals. The primary concerns are around service-to-service authentication for internal HTTP calls and a service boundary violation when updating user records. These should be addressed before production deployment.
