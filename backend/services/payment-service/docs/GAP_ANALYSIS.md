# Payment Service - Frontend/Backend Gap Analysis

Generated: 2024-12-27
Status: REVIEWED

---

## Summary

| Type | Count | Severity |
|------|-------|----------|
| Money Flow | 1 | CRITICAL |
| Multi-tenancy | 2 | CRITICAL |
| Refunds/Disputes | 4 | HIGH |
| Security | 3 | HIGH |
| Operational | 2 | MEDIUM |
| Frontend Features | 3 | MEDIUM |

**HEADLINE: Stripe Connect transfers are not implemented. Venues and artists are not getting paid.**

---

## CRITICAL Issues

### GAP-PAYMENT-001: Stripe Connect Transfers NOT IMPLEMENTED
- **Severity:** CRITICAL
- **Audit:** 32-payment-processing-security.md
- **Current:** Payment splits are calculated but NO `stripe.transfers.create()` calls exist
- **Reality:**
  - Customer pays $100 for ticket
  - Code calculates: venue $80, artist $10, platform $10
  - All $100 stays with platform
  - Venues/artists receive nothing via Stripe
- **Risk:**
  - Venues not getting paid automatically
  - Requires manual bank transfers
  - Likely violates money transmission laws
  - Platform holding funds illegally
- **Fix:**
```typescript
// After payment captured
await stripe.transfers.create({
  amount: venueAmountCents,
  currency: 'usd',
  destination: venue.stripeConnectAccountId,
  transfer_group: `order_${orderId}`,
  source_transaction: chargeId,
});

await stripe.transfers.create({
  amount: artistRoyaltyCents,
  currency: 'usd', 
  destination: artist.stripeConnectAccountId,
  transfer_group: `order_${orderId}`,
  source_transaction: chargeId,
});
```

### GAP-PAYMENT-002: No Row Level Security on Payment Tables
- **Severity:** CRITICAL
- **Audit:** 09-multi-tenancy.md
- **Current:** No `ENABLE ROW LEVEL SECURITY`, no RLS policies
- **Risk:** Payment data from all tenants in same tables with no DB-level isolation
- **Fix:** Add RLS policies to all payment tables

### GAP-PAYMENT-003: Missing Tenant Validation
- **Severity:** CRITICAL
- **Audit:** 09-multi-tenancy.md
- **Current:**
  - Missing tenant doesn't return 401 - proceeds anyway
  - No UUID format validation
  - Some routes accept tenant from body (bypassable)
  - tenant_id columns are NULLABLE
- **Fix:** 
  - Require tenant from JWT only
  - Return 401 if missing
  - Make tenant_id NOT NULL

---

## HIGH Issues

### GAP-PAYMENT-004: Refund Handler is Placeholder
- **Severity:** HIGH
- **Audit:** 32-payment-processing-security.md
- **Current:**
```typescript
private async handleRefund(charge: Stripe.Charge): Promise<void> {
  log.info('Processing refund', {...});
  // This is a placeholder  <-- LITERALLY SAYS THIS IN CODE
}
```
- **Risk:** Refunds don't actually process. Customer thinks refunded, money never returned.
- **Fix:** Implement actual refund logic with Stripe API

### GAP-PAYMENT-005: No Dispute Handling
- **Severity:** HIGH
- **Audit:** 33-refund-dispute-handling.md
- **Current:** No webhook handlers for:
  - `charge.dispute.created`
  - `charge.dispute.updated`
  - `charge.dispute.closed`
- **Risk:**
  - Don't know when disputes occur
  - No automatic evidence submission
  - Will lose every dispute by default
  - Stripe shuts down accounts with >1% dispute rate
- **Fix:** Implement dispute webhook handlers, auto-submit evidence

### GAP-PAYMENT-006: Connect Refund Missing Parameters
- **Severity:** HIGH
- **Audit:** 33-refund-dispute-handling.md
- **Current:** Refunds don't include Connect parameters
- **Missing:**
```typescript
await stripe.refunds.create({
  charge: chargeId,
  reverse_transfer: true,        // MISSING - reverses venue transfer
  refund_application_fee: true,  // MISSING - reverses platform fee
});
```
- **Risk:** Refund comes only from platform. Venue keeps their split. Platform loses money on every refund.

### GAP-PAYMENT-007: No Transfer Failure Handling
- **Severity:** HIGH
- **Audit:** 32-payment-processing-security.md
- **Current:** No handlers for:
  - `transfer.reversed`
  - `payout.failed`
  - No retry job for failed transfers
  - No alerting
- **Risk:** Transfers fail silently, venue doesn't get paid, nobody knows

### GAP-PAYMENT-008: 6+ Default Secrets in Code
- **Severity:** HIGH
- **Audit:** 05-s2s-auth.md
- **Current:** Hardcoded defaults for HMAC, JWT, Stripe keys, DB creds, Redis, RabbitMQ
- **Risk:** Anyone reading code knows secrets. If env vars not set, defaults used in production.
- **Fix:** Remove all defaults, fail fast on startup if missing

### GAP-PAYMENT-009: Stripe in Readiness Probe
- **Severity:** HIGH
- **Audit:** 12-health-checks.md
- **Current:** `/health/ready` calls `stripe.balance.retrieve()`
- **Risk:** Stripe outage → your service "not ready" → K8s restarts pods → cascading failure
- **Fix:** Remove Stripe from readiness check. Only check internal dependencies.

### GAP-PAYMENT-010: IP Spoofing Bypasses Rate Limiting
- **Severity:** HIGH
- **Audit:** 08-rate-limiting.md
- **Current:** Rate limiter uses first IP from `X-Forwarded-For`
- **Risk:** Attacker sets `X-Forwarded-For: fake.ip` → gets fresh rate limit → unlimited requests
- **Fix:** Use rightmost untrusted IP, or configure trusted proxy list

---

## MEDIUM Issues

### GAP-PAYMENT-011: Webhook Returns 500 on Error
- **Severity:** MEDIUM
- **Audit:** 07-idempotency.md
- **Current:** Failed webhook processing returns HTTP 500
- **Risk:** Stripe retries forever, eventually disables endpoint
- **Fix:** Return 200, queue failure for async retry

### GAP-PAYMENT-012: No /metrics Endpoint
- **Severity:** MEDIUM
- **Audit:** 04-logging-observability.md
- **Current:** No Prometheus metrics exposed
- **Risk:** Can't monitor payment success rates, can't alert on anomalies
- **Fix:** Add prom-client, expose /metrics

### GAP-PAYMENT-013: No OpenTelemetry Tracing
- **Severity:** MEDIUM
- **Audit:** 04-logging-observability.md
- **Current:** Custom logging, no distributed tracing
- **Risk:** Can't trace payment flow across services

---

## Frontend-Related Gaps

### GAP-PAYMENT-014: No User Payment History
- **Severity:** MEDIUM
- **User Story:** "I want to see all my past purchases"
- **Current:** No endpoint for user's payment history
- **Needed:**
  - GET /me/payments - list user's payments
  - GET /me/payments/:id - payment details with receipt
- **Impact:** Can't build "Purchase History" screen

### GAP-PAYMENT-015: No User Refund Status
- **Severity:** MEDIUM
- **User Story:** "I want to see if my refund went through"
- **Current:** No endpoint for user's refund status
- **Needed:**
  - GET /me/refunds - list user's refunds
  - GET /me/refunds/:id - refund details and status
- **Impact:** Users can't track refund progress

### GAP-PAYMENT-016: No Saved Payment Methods
- **Severity:** MEDIUM
- **User Story:** "I want to save my card for faster checkout"
- **Current:** Only payment_method_fingerprint for fraud detection, no saved cards
- **Needed:**
  - POST /me/payment-methods - save card (Stripe SetupIntent)
  - GET /me/payment-methods - list saved cards
  - DELETE /me/payment-methods/:id - remove saved card
- **Impact:** Users must re-enter card every purchase

### GAP-PAYMENT-017: No User Credit Balance
- **Severity:** LOW
- **User Story:** "I have store credit from a cancelled event"
- **Current:** Unknown if credit balance system exists
- **Needed:**
  - GET /me/balance - user's credit balance
  - Credit applied at checkout
- **Impact:** Can't implement store credit feature

---

## Existing Endpoints (Verified Working)

### Payments
- POST /payments ✅ (process payment)
- POST /intents ✅ (create payment intent)
- GET /payments/:id ✅

### Refunds
- POST /refunds ⚠️ (routes exist but handler is placeholder)
- GET /refunds/:id ✅

### Venues
- GET /:venueId/balance ✅
- POST /:venueId/payout ✅
- GET /:venueId/payouts ✅

### Royalties
- GET /payouts/:recipientId ✅

### Webhooks
- POST /webhooks/stripe ⚠️ (incomplete handlers)

### Health
- GET /health ✅
- GET /health/ready ⚠️ (includes Stripe - bad)

---

## Database Tables (60 tables)

Key tables status:
| Table | RLS | Notes |
|-------|-----|-------|
| payment_transactions | ❌ | Main payments table, NO RLS |
| refunds | ❌ | NO RLS |
| royalty_distributions | ❌ | NO RLS |
| fee_calculations | ❌ | NO RLS |
| stripe_transfers | ❌ | TABLE DOESN'T EXIST - needed |
| pending_transfers | ❌ | TABLE DOESN'T EXIST - needed |
| user_payment_methods | ❌ | TABLE DOESN'T EXIST - needed |
| user_credits | ❌ | TABLE DOESN'T EXIST - needed |

---

## Cross-Service Dependencies

| This service needs from | What |
|------------------------|------|
| auth-service | User verification |
| venue-service | Venue Stripe Connect account IDs |
| event-service | Event details for receipts |
| ticket-service | Ticket validation for refunds |
| notification-service | Payment confirmations, refund notifications |

| Other services need from this | What |
|------------------------------|------|
| order-service | Payment processing |
| marketplace-service | Escrow payments |
| ticket-service | Refund coordination |
| compliance-service | Tax calculations |

---

## Priority Order for Fixes

### BEFORE LAUNCH (Legal/Financial)
1. GAP-PAYMENT-001: Implement Stripe Connect transfers (CRITICAL - venues not getting paid)
2. GAP-PAYMENT-004: Complete refund handler
3. GAP-PAYMENT-006: Add reverse_transfer to refunds
4. GAP-PAYMENT-005: Add dispute webhook handlers

### Immediate (Security)
5. GAP-PAYMENT-002: Enable RLS on all tables
6. GAP-PAYMENT-003: Fix tenant validation
7. GAP-PAYMENT-008: Remove default secrets
8. GAP-PAYMENT-010: Fix IP spoofing

### This Week
9. GAP-PAYMENT-007: Add transfer failure handling
10. GAP-PAYMENT-009: Remove Stripe from readiness probe
11. GAP-PAYMENT-011: Fix webhook 500 responses

### This Month (Frontend Features)
12. GAP-PAYMENT-014: User payment history
13. GAP-PAYMENT-015: User refund status
14. GAP-PAYMENT-016: Saved payment methods
15. GAP-PAYMENT-012: Add /metrics endpoint

