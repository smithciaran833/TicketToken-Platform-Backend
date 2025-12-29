# Order Service - 34 Refund Scenarios Audit

**Service:** order-service
**Document:** 34-refund-scenarios.md
**Date:** 2024-12-24
**Auditor:** Cline
**Pass Rate:** 34% (25/74 applicable checks)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 3 | No chargeback handling, Missing Connect params, No transfer check |
| HIGH | 3 | No dispute lock, No event status handling, No seller balance check |
| MEDIUM | 3 | No policy version tracking, No timeline communication, No currency validation |
| LOW | 0 | None |

---

## 3.1 Refund Scenarios (2/12)

| Check | Status | Evidence |
|-------|--------|----------|
| Full refund for cancellation | PARTIAL | cancelOrder() but no auto-trigger |
| Partial refund fee retention | PASS | Processing fees retained |
| Postponed event | FAIL | None |
| Rescheduled event | FAIL | None |
| Duplicate purchase | PARTIAL | Idempotency prevents, no workflow |
| Fraudulent transaction | FAIL | None |
| Invalid ticket (resale) | FAIL | None |
| Non-delivery (resale) | FAIL | None |
| After transfer | FAIL | No transfer check |
| Partial (one of many) | PASS | Per-item refund quantities |
| Promo code reversal | PARTIAL | No explicit reversal |
| Crossing billing periods | FAIL | None |

---

## 3.2 Double Refund Prevention (6/10)

| Check | Status | Evidence |
|-------|--------|----------|
| Idempotency keys | PASS | idempotencyMiddleware on routes |
| DB unique constraint | PARTIAL | UUID but no explicit constraint |
| State machine | PARTIAL | Status checks, no formal machine |
| Webhook idempotency | FAIL | No check on messages |
| Distributed lock | PASS | withLock for refunds |
| Stripe idempotency | UNKNOWN | In payment-service |
| Amount validation | PASS | availableToRefund check |
| Total refunded tracked | PASS | total_refunded_cents |
| Max refundable calc | PASS | alreadyRefunded calculation |

---

## 3.3 Eligibility Validation (6/10)

| Check | Status | Evidence |
|-------|--------|----------|
| Order exists | PASS | Checks order exists |
| Status refundable | PASS | CONFIRMED or COMPLETED |
| Within time window | PASS | isWithinRefundWindow() |
| Event status | PARTIAL | Checks date, not cancellation |
| Not fully refunded | PASS | Tracks per-item quantities |
| Not transferred | FAIL | No transfer check |
| No active dispute | FAIL | has_dispute not checked |
| Payment refundable | FAIL | Doesnt verify Stripe status |
| Requester authorized | PASS | userId/admin check |
| Amount validated | PASS | Quantity vs available |

---

## 3.4 Multi-Party Handling (2/8)

| Check | Status | Evidence |
|-------|--------|----------|
| reverse_transfer | FAIL | Not sent to payment-service |
| refund_application_fee | FAIL | Not sent |
| Seller balance check | FAIL | None |
| Insufficient balance | FAIL | None |
| Royalty reversal | FAIL | None |
| All parties tracked | PASS | Platform/processing/tax fees |
| Proportional calc | PASS | Proportional fees calculated |
| Negative balance | UNKNOWN | payment-service |

---

## 3.5 Royalty Handling (0/6)

All FAIL - No royalty handling in order-service.

---

## 3.6 Chargeback Handling (0/10) - CRITICAL

| Check | Status | Evidence |
|-------|--------|----------|
| dispute.created webhook | FAIL | No handler |
| dispute.updated webhook | FAIL | No handler |
| dispute.closed webhook | FAIL | No handler |
| Disputes linked to orders | FAIL | No tracking |
| Refund locked on dispute | FAIL | No check |
| Evidence collection | FAIL | None |
| Evidence submission | FAIL | None |
| Team alerts | FAIL | None |
| Dispute rate monitored | FAIL | None |
| Rate alerts (<0.65%) | FAIL | None |

---

## 3.7 Communication (1/6)

| Check | Status | Evidence |
|-------|--------|----------|
| Confirmation email | PARTIAL | Events published |
| Timeline communicated | FAIL | None |
| Reference number | PASS | refundId returned |
| Seller notified | FAIL | None |
| Creator notified | FAIL | None |
| Support visibility | PARTIAL | Audit logs only |

---

## 3.8 Audit Trail (7/8)

| Check | Status | Evidence |
|-------|--------|----------|
| Actions logged | PASS | auditService.logAction() |
| User recorded | PASS | userId in audit |
| Reason stored | PASS | refundReason |
| Amount breakdown | PASS | Proportional fees stored |
| Stripe refund ID | PASS | stripeRefundId stored |
| Original payment linked | PASS | orderId links |
| Policy version | FAIL | Not tracked |
| Immutable log | PASS | Append-only |

---

## 3.9 Edge Cases (1/7)

| Check | Status | Evidence |
|-------|--------|----------|
| Expired card | UNKNOWN | payment-service |
| Closed bank account | UNKNOWN | payment-service |
| Failed refund retry | PARTIAL | retry() used |
| Currency mismatch | FAIL | No validation |
| After payout to seller | FAIL | No check |
| Bulk refund | FAIL | None |
| Refund timeout | PASS | Circuit breaker |

---

## Critical Remediations

### P0: Add Dispute Webhook Handlers
```typescript
// event-subscriber.ts
case 'charge.dispute.created':
  await this.handleDisputeCreated(event);
  break;
case 'charge.dispute.updated':
  await this.handleDisputeUpdated(event);
  break;
case 'charge.dispute.closed':
  await this.handleDisputeClosed(event);
  break;
```

### P0: Add Connect Refund Parameters
```typescript
// payment.client.ts
await paymentService.initiateRefund({
  ...data,
  reverseTransfer: true,
  refundApplicationFee: shouldRefundFee,
});
```

### P0: Add Transfer Check
```typescript
// refund-eligibility.service.ts
const hasBeenTransferred = await ticketService.hasTicketBeenTransferred(orderId);
if (hasBeenTransferred) {
  return { eligible: false, reason: 'Ticket has been transferred' };
}
```

### P1: Add Dispute Lock
```typescript
if (order.has_dispute) {
  throw new Error('Cannot refund - active dispute');
}
```

---

## Strengths

- Strong idempotency with user-scoped keys
- Distributed locking on refund operations
- Comprehensive audit logging
- Proportional fee calculation
- Eligibility validation service
- Partial refund per-item tracking

Refund Scenarios Score: 34/100
