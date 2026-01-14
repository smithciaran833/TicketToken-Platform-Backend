# FAILED PAYMENT RETRY FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Failed Payment Retry |

---

## Executive Summary

**DEAD CODE - Job exists, never scheduled**

| Component | Status |
|-----------|--------|
| payment_retries table | ✅ Exists |
| RetryFailedPaymentsJob class | ✅ Exists |
| Retry logic (max 3 attempts) | ✅ Implemented |
| 1 hour backoff | ✅ Implemented |
| Job scheduling/cron | ❌ Never called |
| User notification on retry | ❌ Not implemented |
| Manual retry trigger | ❌ Not implemented |

**Bottom Line:** The `RetryFailedPaymentsJob` class and `payment_retries` table exist with proper retry logic (max 3 attempts, 1 hour backoff). However, the job is never scheduled or called from anywhere - it's dead code.

---

## What Exists

### 1. Database Table

**File:** `backend/services/payment-service/src/migrations/001_baseline_payment.ts`
```sql
CREATE TABLE payment_retries (
  id UUID PRIMARY KEY,
  payment_id UUID REFERENCES payment_transactions(id),
  attempt_number INT,
  status VARCHAR(20),  -- 'pending', 'success', 'failed', 'requires_action'
  error_message TEXT,
  created_at TIMESTAMP
);
```

### 2. Retry Job

**File:** `backend/services/payment-service/src/jobs/retry-failed-payments.ts`
```typescript
export class RetryFailedPaymentsJob {
  async execute(): Promise<void> {
    // Find failed payments eligible for retry
    const failedPayments = await this.db.query(
      `SELECT pt.*,
              COALESCE(pr.retry_count, 0) as retry_count
       FROM payment_transactions pt
       LEFT JOIN (
         SELECT payment_id, COUNT(*) as retry_count
         FROM payment_retries
         GROUP BY payment_id
       ) pr ON pt.id = pr.payment_id
       WHERE pt.status = 'failed'
       AND COALESCE(pr.retry_count, 0) < 3      -- Max 3 retries
       AND pt.updated_at < NOW() - INTERVAL '1 hour'  -- 1 hour backoff
       LIMIT 10`
    );

    for (const payment of failedPayments.rows) {
      await this.retryPayment(payment);
    }
  }

  private async retryPayment(payment: any): Promise<void> {
    // Record retry attempt
    await this.db.query(
      `INSERT INTO payment_retries (payment_id, attempt_number, status)
       VALUES ($1, $2, 'pending')`,
      [payment.id, (payment.retry_count || 0) + 1]
    );

    // Check Stripe PaymentIntent status
    if (payment.stripe_payment_intent_id) {
      const paymentIntent = await this.stripe.paymentIntents.retrieve(
        payment.stripe_payment_intent_id
      );

      if (paymentIntent.status === 'requires_payment_method') {
        // Needs new card - can't auto-retry
        // Update status to 'requires_action'
      } else if (paymentIntent.status === 'requires_confirmation') {
        // Can retry - confirm the intent
        await this.stripe.paymentIntents.confirm(payment.stripe_payment_intent_id);
      }
    }
  }
}
```

### 3. Retry Logic

| Feature | Value |
|---------|-------|
| Max retries | 3 |
| Backoff | 1 hour after failure |
| Batch size | 10 payments at a time |
| Auto-retry possible | Only if `requires_confirmation` |
| Requires user action | If `requires_payment_method` |

---

## What's Missing

### 1. Job Never Scheduled

**File:** `backend/services/payment-service/src/index.ts`

The job is never imported or started:
```typescript
// NOT PRESENT in index.ts:
// import { RetryFailedPaymentsJob } from './jobs/retry-failed-payments';
// const retryJob = new RetryFailedPaymentsJob(db, stripe);
// setInterval(() => retryJob.execute(), 60 * 60 * 1000); // hourly
```

### 2. No User Notification

When a payment fails and requires new payment method, user should be notified. Not implemented.

### 3. No Manual Retry Endpoint

Expected but not implemented:
```
POST /api/v1/payments/:paymentId/retry
```

### 4. No Admin Dashboard

No way for admins to see failed payments and trigger retries.

---

## Recommendations

### P2 - Enable Retry Job

| Task | Effort |
|------|--------|
| Schedule job in index.ts | 0.25 day |
| Add user notification on failure | 0.5 day |
| Add manual retry endpoint | 0.5 day |
| Add to admin dashboard | 0.5 day |
| **Total** | **1.75 days** |

### Quick Fix

Add to `index.ts`:
```typescript
import { RetryFailedPaymentsJob } from './jobs/retry-failed-payments';

// After DB init
const retryJob = new RetryFailedPaymentsJob(pool, stripe);

// Run every hour
setInterval(() => {
  retryJob.execute().catch(err => 
    log.error('Retry job failed', { error: err.message })
  );
}, 60 * 60 * 1000);

// Also run on startup
retryJob.execute().catch(err => 
  log.error('Initial retry job failed', { error: err.message })
);
```

---

## Files Involved

| File | Status |
|------|--------|
| `payment-service/src/migrations/001_baseline_payment.ts` | ✅ Table exists |
| `payment-service/src/jobs/retry-failed-payments.ts` | ✅ Job exists |
| `payment-service/src/index.ts` | ❌ Job not scheduled |
| `payment-service/src/cron/` | ❌ Not included here |

---

## Related Documents

- `PRIMARY_PURCHASE_FLOW_AUDIT.md` - Initial payment
- `REFUND_CANCELLATION_FLOW_AUDIT.md` - Failed refund handling
