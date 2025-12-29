# Marketplace Service - 32 Payment Split Accuracy Audit

**Service:** marketplace-service
**Document:** 32-payment-split-accuracy.md
**Date:** 2024-12-24
**Auditor:** Cline
**Pass Rate:** 78% (14/18 checks)

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 2 | No sum validation, No discrepancy alerting |
| HIGH | 2 | No explicit sum check, Limited reconciliation |
| MEDIUM | 0 | None |
| LOW | 0 | None |

## 3.1 Payment Split Calculation (5/6)

- SPLIT1: Integer cents math - PASS
- SPLIT2: Platform fee calculated - PASS (2.5%)
- SPLIT3: Venue fee calculated - PASS (5%)
- SPLIT4: Seller receives calculated - PASS
- SPLIT5: Split totals validated - PARTIAL
- SPLIT6: Metadata stores amounts - PASS

## 3.2 Transfer Execution (4/4 PASS)

- EXEC1: source_transaction used - PASS
- EXEC2: transfer_group used - PASS
- EXEC3: Seller transfer first - PASS
- EXEC4: Venue transfer non-fatal - PASS

## 3.3 Accuracy Validation (3/4)

- ACC1: Amounts logged - PASS
- ACC2: Transfer amounts match - PASS
- ACC3: Metadata for verification - PASS
- ACC4: Sum validation - FAIL

## 3.4 Reconciliation (2/4)

- REC1: Transfer IDs recorded - PASS
- REC2: Fee collection tracked - PASS
- REC3: Reconciliation function - PARTIAL
- REC4: Discrepancy alerting - FAIL

## Split Calculation Example
```
Listing Price:    $100.00 (10000 cents)
Platform (2.5%):   -$2.50 (250 cents)
Venue (5%):        -$5.00 (500 cents)
Seller Gets:      $92.50 (9250 cents)
Validation: 250 + 500 + 9250 = 10000
```

## Payment Flow

1. Create PaymentIntent with fee breakdown
2. Stripe Webhook: payment_intent.succeeded
3. createTransferToSeller (source_transaction)
4. createTransferToVenue (non-fatal)
5. Platform retains fees automatically

## Remediations

### P0: Add Sum Validation
```
const sum = platformFee + venueFee + sellerReceives;
if (sum !== amountCents) {
  sellerReceivesCents += (amountCents - sum);
}
assert(sum === amountCents, 'Split mismatch');
```

### P0: Add Discrepancy Alerting
```
if (missingRecords > 0) {
  await sendAlert({ type: 'fee_reconciliation_warning' });
}
```

## Strengths

- Integer cents throughout
- source_transaction for atomicity
- transfer_group links transfers
- Seller paid before venue
- Venue failure non-fatal
- Full metadata for audit
- Transfer IDs recorded

Payment Split Accuracy Score: 78/100
