# Payment Service - 33 Refund & Dispute Handling Audit

**Service:** payment-service
**Document:** 33-refund-dispute-handling.md
**Date:** 2025-12-23
**Auditor:** Cline
**Pass Rate:** 26% (20/76 applicable checks)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 2 | No Stripe Connect refund params (reverse_transfer), No chargeback handling |
| HIGH | 2 | No cumulative refund tracking, No bulk refund for cancelled events |
| MEDIUM | 2 | No refund notifications, No royalty reversal |
| LOW | 0 | None |

---

## 3.1 Refund Scenarios (3/12)

| Check | Status | Evidence |
|-------|--------|----------|
| Full refund event cancellation | FAIL | No bulk handler |
| Partial refund fee retention | PASS | Amount allows partial |
| Postponed event | FAIL | No postponement logic |
| Rescheduled event | FAIL | No handling |
| Duplicate purchase | PASS | reason enum includes |
| Fraudulent transaction | PASS | reason enum includes |
| Invalid resale ticket | FAIL | No resale logic |
| Non-delivery resale | FAIL | No handling |
| After ticket transfer | FAIL | No transfer check |
| One of many tickets | PARTIAL | Amount exists, no order logic |
| With promo code | FAIL | No discount tracking |
| Crossing billing periods | FAIL | No consideration |

---

## 3.2 Double Refund Prevention (4/9)

| Check | Status | Evidence |
|-------|--------|----------|
| Idempotency keys | PASS | idempotencyMiddleware |
| DB unique constraint | PARTIAL | Stripe ID only |
| State machine | PARTIAL | Checks 'refunded' only |
| Webhook idempotent | PASS | Redis dedup |
| Distributed lock | FAIL | No Redis lock |
| Stripe idempotency | PASS | idempotencyKey param |
| Amount validation | PASS | Checks original amount |
| Total refunded tracked | FAIL | No cumulative |
| Max refundable calculated | FAIL | Original only |

---

## 3.3 Refund Eligibility (4/10)

| Check | Status | Evidence |
|-------|--------|----------|
| Order exists | PASS | Query validates |
| Order status refundable | PARTIAL | Only 'refunded' check |
| Within time window | PASS | checkRefundEligibility() |
| Event not occurred | PARTIAL | Time but no cancelled |
| Not fully refunded | PARTIAL | Single not cumulative |
| Tickets not transferred | FAIL | No check |
| No active dispute | FAIL | No dispute check |
| Payment intent state | PASS | Status check |
| Requester authorized | PASS | User + tenant check |
| Max refundable | PARTIAL | Original only |

---

## 3.4 Multi-Party (Stripe Connect) (0/8)

| Check | Status | Evidence |
|-------|--------|----------|
| reverse_transfer: true | FAIL | Not in create call |
| refund_application_fee | FAIL | Not in create call |
| Seller balance checked | FAIL | No check |
| Insufficient balance | FAIL | Not implemented |
| Royalty reversed | FAIL | No reversal |
| All party amounts tracked | FAIL | Customer only |
| Proportional calculated | FAIL | No split calc |
| Platform negative balance | FAIL | Not addressed |

**CRITICAL - Missing Connect params:**
```typescript
// Current - NO CONNECT PARAMS
stripe.refunds.create({
  payment_intent: paymentIntentId,
  amount: amount,
  // MISSING: reverse_transfer: true
  // MISSING: refund_application_fee: true
});
```

---

## 3.5 Royalty Handling (0/6)

| Check | Status | Evidence |
|-------|--------|----------|
| Creator royalties reversed | FAIL | No logic |
| Proportional reversal | FAIL | No calculation |
| Reversal tracked | FAIL | No tracking |
| Creator notified | FAIL | No notification |
| Dashboard reflects | FAIL | Not implemented |
| Tax documented | FAIL | No docs |

---

## 3.6 Chargeback Handling (0/10)

| Check | Status | Evidence |
|-------|--------|----------|
| dispute.created handler | FAIL | Not implemented |
| dispute.updated handler | FAIL | Not implemented |
| dispute.closed handler | FAIL | Not implemented |
| Disputes linked to orders | PARTIAL | Table exists |
| Refund locked on dispute | FAIL | No check |
| Evidence automated | FAIL | Not implemented |
| Evidence before deadline | FAIL | Not implemented |
| Team alerted | FAIL | No alerting |
| Dispute rate monitored | FAIL | No monitoring |
| Rate alerts <0.65% | FAIL | Not configured |

---

## 3.7 Refund Communication (1/6)

| Check | Status | Evidence |
|-------|--------|----------|
| Confirmation email | FAIL | No notification |
| Timeline communicated | FAIL | Not implemented |
| Reference number | PASS | refundId returned |
| Seller notified | FAIL | No notification |
| Creator notified | FAIL | No notification |
| Support visibility | PARTIAL | Audit log only |

---

## 3.8 Audit Trail (5/7)

| Check | Status | Evidence |
|-------|--------|----------|
| Actions logged with timestamp | PASS | auditService.logAction() |
| Initiating user recorded | PASS | userId in log |
| Reason stored | PASS | reason in metadata |
| Amount breakdown | FAIL | Total only |
| Stripe refund ID | PASS | stripe_refund_id |
| Original payment linked | PASS | transaction_id |
| Policy version stored | FAIL | Not tracked |

---

## 3.9 Edge Cases (3/7)

| Check | Status | Evidence |
|-------|--------|----------|
| Expired card | PARTIAL | Stripe handles |
| Closed bank account | PARTIAL | Stripe handles |
| Failed refund retry | PASS | retryWithBackoff() |
| Currency mismatch | FAIL | No validation |
| After payout to seller | FAIL | No check |
| Bulk event cancellation | FAIL | No endpoint |
| Timeout handling | PASS | 20s timeout |

---

## Strengths

- Idempotency keys on all refund API calls
- Stripe idempotency parameter
- Retry with exponential backoff (1s, 2s, 4s)
- Comprehensive audit logging
- Time-based refund eligibility window
- Tenant-isolated processing
- 4xx errors not retried (correct)

---

## Remediation Priority

### CRITICAL (Before Launch)
1. **Add Stripe Connect refund params:**
```typescript
stripe.refunds.create({
  payment_intent: paymentIntentId,
  amount: amount,
  reverse_transfer: true,
  refund_application_fee: true
});
```

2. **Implement chargeback handlers:**
```typescript
case 'charge.dispute.created':
  await handleDisputeCreated(event.data.object);
  // Lock refunds, alert team, gather evidence
```

### HIGH (This Week)
1. **Track cumulative refunds:**
```typescript
const existing = await db.query(
  `SELECT SUM(amount) FROM payment_refunds 
   WHERE order_id = $1 AND status = 'succeeded'`
);
const maxRefundable = originalAmount - existing;
```

2. **Add bulk refund for event cancellation**

### MEDIUM (This Month)
1. Add refund confirmation emails
2. Implement royalty reversal tracking
