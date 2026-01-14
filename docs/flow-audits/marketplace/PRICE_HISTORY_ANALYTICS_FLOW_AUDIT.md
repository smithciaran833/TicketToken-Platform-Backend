# PRICE HISTORY ANALYTICS FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Price History / Analytics |

---

## Executive Summary

**PARTIAL - Model exists, no API routes**

| Component | Status |
|-----------|--------|
| marketplace_price_history table | ✅ Exists |
| PriceHistoryModel class | ✅ Exists |
| Record price changes | ✅ Working |
| Get listing price history | ✅ Working |
| Get average price by event | ✅ Working |
| Get price trends | ✅ Working |
| API endpoints | ❌ Not implemented |
| Price alerts | ❌ Not implemented |

**Bottom Line:** The `PriceHistoryModel` provides comprehensive price tracking and analytics functionality including recording changes, retrieving history, calculating averages, and determining price trends. However, there are no API routes exposing this functionality to users.

---

## What Exists

### 1. Price History Model

**File:** `backend/services/marketplace-service/src/models/price-history.model.ts`

**Interface:**
```typescript
export interface PriceHistoryEntry {
  id: string;
  listing_id: string;
  old_price: number;         // INTEGER CENTS
  new_price: number;         // INTEGER CENTS
  price_change: number;      // INTEGER CENTS
  percentage_change: number; // DECIMAL (e.g., 5.5 = 5.5%)
  changed_by: string;
  reason?: string;
  changed_at: Date;
}

export interface PriceTrend {
  period: string;
  average_price: number;     // INTEGER CENTS
  min_price: number;         // INTEGER CENTS
  max_price: number;         // INTEGER CENTS
  total_changes: number;
  trend_direction: 'up' | 'down' | 'stable';
}
```

### 2. Available Methods
```typescript
class PriceHistoryModel {
  // Record a price change
  async recordPriceChange(
    listingId: string,
    oldPriceCents: number,
    newPriceCents: number,
    changedBy: string,
    reason?: string
  ): Promise<PriceHistoryEntry>

  // Get history for a listing
  async getPriceHistory(listingId: string): Promise<PriceHistoryEntry[]>

  // Get average price for an event
  async getAveragePrice(
    eventId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<number>

  // Get price trends
  async getPriceTrends(
    eventId: string,
    period: 'day' | 'week' | 'month' = 'week'
  ): Promise<PriceTrend>
}
```

### 3. Trend Calculation
```typescript
const avgChange = parseFloat(stats?.avg_change || '0');
const trendDirection = avgChange > 1 ? 'up' : avgChange < -1 ? 'down' : 'stable';

return {
  period,
  average_price: Math.round(stats.average_price),
  min_price: Math.round(stats.min_price),
  max_price: Math.round(stats.max_price),
  total_changes: stats.total_changes,
  trend_direction: trendDirection
};
```

---

## What's Missing

### 1. API Endpoints

Expected but not implemented:
```
GET /api/v1/listings/:listingId/price-history
GET /api/v1/events/:eventId/price-analytics
GET /api/v1/events/:eventId/price-trends?period=week
GET /api/v1/marketplace/trending-prices
```

### 2. Price Alerts

No system for:
- Alert when price drops below threshold
- Alert when event nearing and prices rising
- Daily price digest emails

### 3. Historical Sales Data

Model tracks listing price changes, but not actual sale prices. Would need:
```typescript
// NOT TRACKED
interface SaleRecord {
  eventId: string;
  ticketType: string;
  salePrice: number;
  faceValue: number;
  soldAt: Date;
}
```

---

## Recommendations

### P3 - Expose Price Analytics

| Task | Effort |
|------|--------|
| Create price-analytics.routes.ts | 0.25 day |
| Create controller | 0.5 day |
| Add sale price tracking | 0.5 day |
| Add price alerts | 1 day |
| **Total** | **2.25 days** |

---

## Files Involved

| File | Status |
|------|--------|
| `marketplace-service/src/models/price-history.model.ts` | ✅ Complete |
| `marketplace-service/src/migrations/001_baseline_marketplace.ts` | ✅ Table exists |
| `marketplace-service/src/routes/analytics.routes.ts` | ❌ Does not exist |

---

## Related Documents

- `DYNAMIC_PRICING_FLOW_AUDIT.md` - Price changes
- `LISTING_MANAGEMENT_FLOW_AUDIT.md` - Price updates
- `MARKETPLACE_SEARCH_FLOW_AUDIT.md` - Search by price
