# PLATFORM REVENUE ACCOUNTING FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Platform Revenue Accounting |

---

## Executive Summary

**PARTIAL - Fee tracking exists, no aggregation/reporting**

| Component | Status |
|-----------|--------|
| platform_fee column on transactions | ✅ Exists |
| Fee calculation service | ✅ Working |
| Payment analytics (total revenue) | ✅ Working |
| Platform fee aggregation | ❌ Not implemented |
| Platform revenue dashboard | ❌ Not implemented |
| Fee reconciliation | ❌ Not implemented |
| Revenue by period report | ❌ Not implemented |
| Export platform earnings | ❌ Not implemented |

**Bottom Line:** Each transaction stores `platform_fee`, and there's a `PaymentAnalyticsService` that reports on total transaction revenue. However, there's no specific aggregation or reporting for platform fees (your revenue as the platform operator). You'd need to manually query the database to see how much you've earned.

---

## What Exists

### 1. Platform Fee Storage

**File:** `backend/services/payment-service/src/migrations/001_baseline_payment.ts`
```sql
-- On payment_transactions
table.decimal('platform_fee', 10, 2).notNullable();

-- On transfers
table.integer('platform_fee').nullable();

-- Constraint
ADD CONSTRAINT payments_fee_non_negative CHECK (platform_fee >= 0);
```

### 2. Payment Analytics Service

**File:** `backend/services/payment-service/src/services/payment-analytics.service.ts`

Reports on:
- Total transactions
- Total revenue (gross)
- Success rate
- Breakdown by method, status, venue tier
- Performance metrics
- Top venues
- Failure analysis

**Missing:** Platform fee aggregation

### 3. Fee Calculation

Fees are calculated and stored per transaction, but not aggregated for platform-level reporting.

---

## What's Missing

### 1. Platform Revenue Aggregation
```typescript
// NOT IMPLEMENTED
async getPlatformRevenue(startDate: Date, endDate: Date) {
  const query = `
    SELECT
      DATE_TRUNC('day', created_at) as date,
      SUM(platform_fee) as total_platform_fees,
      COUNT(*) as transaction_count,
      SUM(amount_cents) as gross_revenue
    FROM payment_transactions
    WHERE status = 'completed'
      AND created_at BETWEEN $1 AND $2
    GROUP BY DATE_TRUNC('day', created_at)
    ORDER BY date
  `;
}
```

### 2. Platform Dashboard Endpoint

Expected but not implemented:
```
GET /api/v1/admin/revenue/summary
GET /api/v1/admin/revenue/by-period?start=&end=&groupBy=day|week|month
GET /api/v1/admin/revenue/by-venue
GET /api/v1/admin/revenue/export
```

### 3. Revenue Reconciliation

No way to reconcile:
- Platform fees collected vs Stripe application fees
- Expected fees vs actual fees
- Fee disputes or adjustments

### 4. Financial Reports

No built-in reports for:
- Monthly revenue summaries
- Year-over-year comparisons
- Revenue forecasting
- Fee breakdown by venue tier

---

## Current Workaround

To see platform revenue, you'd have to query the database directly:
```sql
SELECT 
  DATE_TRUNC('month', created_at) as month,
  SUM(platform_fee) as platform_revenue,
  SUM(amount_cents) as gross_revenue,
  COUNT(*) as transactions
FROM payment_transactions
WHERE status = 'completed'
GROUP BY DATE_TRUNC('month', created_at)
ORDER BY month DESC;
```

---

## Recommendations

### P2 - Implement Platform Revenue Reporting

| Task | Effort |
|------|--------|
| Add platform fee aggregation methods | 0.5 day |
| Create admin revenue endpoints | 0.5 day |
| Build revenue dashboard queries | 0.5 day |
| Add CSV/Excel export | 0.5 day |
| Add to admin UI | 1 day |
| **Total** | **3 days** |

---

## Files Involved

| File | Status |
|------|--------|
| `payment-service/src/migrations/001_baseline_payment.ts` | ✅ Fee column exists |
| `payment-service/src/services/payment-analytics.service.ts` | ⚠️ No fee aggregation |
| `payment-service/src/routes/admin.routes.ts` | ❌ No revenue endpoints |

---

## Related Documents

- `FEE_CALCULATION_DISTRIBUTION_FLOW_AUDIT.md` - How fees are calculated
- `ANALYTICS_REPORTING_FLOW_AUDIT.md` - General analytics
- `ADMIN_BACKOFFICE_FLOW_AUDIT.md` - Admin tools
