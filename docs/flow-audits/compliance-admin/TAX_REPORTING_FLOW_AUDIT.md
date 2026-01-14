# TAX REPORTING FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Tax Reporting / 1099 |

---

## Executive Summary

**WORKING - Comprehensive tax tracking and 1099 generation**

| Component | Status |
|-----------|--------|
| Track sales | ✅ Working |
| Venue tax summary | ✅ Working |
| 1099-K threshold tracking ($600) | ✅ Working |
| Tax calculation | ✅ Working |
| Generate tax report | ✅ Working |
| Batch 1099 form generation | ✅ Working |
| Threshold alerts | ✅ Working |
| Per-transaction reporting ($200) | ✅ Defined |
| IRS filing integration | ❌ Not implemented |

**Bottom Line:** Full tax reporting system with sale tracking, YTD totals, 1099-K threshold monitoring ($600 IRS requirement), tax calculations, and batch form generation. Missing actual IRS electronic filing.

---

## API Endpoints

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/compliance/tax/track-sale` | POST | Record sale | ✅ Working |
| `/compliance/tax/summary/:venueId` | GET | Venue tax summary | ✅ Working |
| `/compliance/tax/calculate` | POST | Calculate tax | ✅ Working |
| `/compliance/tax/report/:year` | GET | Generate report | ✅ Working |
| `/compliance/batch/1099` | POST | Generate 1099 forms | ✅ Working |

---

## IRS Thresholds
```typescript
private readonly FORM_1099_THRESHOLD = 600;  // IRS 1099-K threshold
private readonly TICKET_REPORTING_THRESHOLD = 200;  // Per transaction
```

---

## Implementation Details

### Track Sale
```typescript
async trackSale(venueId: string, amount: number, ticketId: string, tenantId: string) {
  // Get current year totals
  const year = new Date().getFullYear();
  const currentTotal = await getYTDTotal(venueId, year, tenantId);
  const newTotal = currentTotal + amount;

  // Check if threshold reached
  const thresholdReached = newTotal >= this.FORM_1099_THRESHOLD;

  // Log the sale
  await db.query(
    `INSERT INTO tax_records (venue_id, year, amount, ticket_id, threshold_reached, tenant_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [venueId, year, amount, ticketId, thresholdReached, tenantId]
  );

  // Alert if threshold just crossed
  if (newTotal >= this.FORM_1099_THRESHOLD) {
    logger.info(`🚨 VENUE ${venueId} has reached $600 threshold! 1099-K required`);
  }

  return {
    venueId, year, saleAmount: amount,
    yearToDate: newTotal,
    thresholdReached,
    requires1099: thresholdReached,
    percentToThreshold: (newTotal / 600) * 100
  };
}
```

### Venue Tax Summary
```typescript
async getVenueTaxSummary(venueId: string, year: number, tenantId: string) {
  const result = await db.query(
    `SELECT COUNT(*), SUM(amount), MAX(amount), MIN(created_at), MAX(created_at)
     FROM tax_records WHERE venue_id = $1 AND year = $2 AND tenant_id = $3`,
    [venueId, year, tenantId]
  );

  return {
    venueId, year,
    totalSales: total,
    transactionCount: count,
    requires1099: total >= 600,
    thresholdStatus: {
      reached: total >= 600,
      remaining: Math.max(0, 600 - total)
    }
  };
}
```

### Generate Tax Report
```typescript
async generateTaxReport(year: number, tenantId: string) {
  const result = await db.query(
    `SELECT venue_id, COUNT(*), SUM(amount)
     FROM tax_records WHERE year = $1 AND tenant_id = $2
     GROUP BY venue_id ORDER BY total_sales DESC`,
    [year, tenantId]
  );

  const venues1099Required = result.rows.filter(r => r.total_sales >= 600);

  return {
    year,
    summary: {
      totalVenues: result.rows.length,
      venues1099Required: venues1099Required.length,
      totalTransactions: sum(transaction_count),
      totalSales: sum(total_sales)
    },
    venueDetails: result.rows,
    form1099Required: venues1099Required
  };
}
```

---

## Batch 1099 Generation
```typescript
async generate1099Forms(year: number, tenantId: string) {
  const result = await batchService.generateYear1099Forms(year, tenantId);
  
  return {
    success: true,
    message: `Generated ${result.generated} Form 1099-Ks for year ${year}`,
    data: result
  };
}
```

---

## Response Examples

### Track Sale Response
```json
{
  "success": true,
  "data": {
    "venueId": "venue-uuid",
    "year": 2025,
    "saleAmount": 150,
    "yearToDate": 575,
    "thresholdReached": false,
    "requires1099": false,
    "percentToThreshold": 95.83
  }
}
```

### Tax Summary Response
```json
{
  "success": true,
  "data": {
    "venueId": "venue-uuid",
    "year": 2025,
    "totalSales": 1250.00,
    "transactionCount": 45,
    "requires1099": true,
    "thresholdStatus": {
      "reached": true,
      "amount": 1250,
      "threshold": 600,
      "remaining": 0
    },
    "largestSale": 250,
    "firstSale": "2025-01-15T10:00:00Z",
    "lastSale": "2025-06-20T15:30:00Z"
  }
}
```

---

## What's Missing

### IRS Filing Integration
```typescript
// NOT IMPLEMENTED
async fileForm1099WithIRS(venueId: string, year: number) {
  // Use IRS FIRE system
  // Generate electronic file in IRS format
  // Submit via secure API
}
```

---

## Files Involved

| File | Purpose |
|------|---------|
| `compliance-service/src/services/tax.service.ts` | Tax logic |
| `compliance-service/src/controllers/tax.controller.ts` | Endpoints |
| `compliance-service/src/services/batch.service.ts` | Batch 1099 |

---

## Related Documents

- `TAX_1099_REPORTING_FLOW_AUDIT.md` (payments) - 1099-DA for NFT resales
- `PLATFORM_REVENUE_ACCOUNTING_FLOW_AUDIT.md` - Revenue tracking
