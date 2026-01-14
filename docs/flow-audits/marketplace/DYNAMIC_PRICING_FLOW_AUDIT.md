# DYNAMIC PRICING FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | December 31, 2024 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Dynamic & Tiered Pricing |

---

## Executive Summary

**SCHEMA COMPLETE - Logic partial**

| Component | Status |
|-----------|--------|
| Pricing tiers (base, early bird, last minute) | ✅ Schema exists |
| Dynamic pricing flag | ✅ Schema exists |
| Min/max price bounds | ✅ Schema exists |
| Price adjustment rules | ✅ JSONB field exists |
| Group discounts | ✅ Schema exists |
| Current price tracking | ✅ Schema exists |
| Automatic price adjustment | ❌ Not implemented |
| Demand-based pricing | ❌ Not implemented |
| Time-based triggers | ❌ Not implemented |

**Bottom Line:** The schema supports comprehensive dynamic pricing with early bird, last minute, group discounts, and min/max bounds. However, automatic price adjustment logic isn't implemented - prices must be manually updated.

---

## What Exists

### Event Pricing Model

**File:** `event-service/src/models/event-pricing.model.ts`
```typescript
interface IEventPricing {
  // Base pricing
  base_price: number;
  current_price?: number;
  currency?: string;
  
  // Dynamic pricing
  is_dynamic?: boolean;
  min_price?: number;
  max_price?: number;
  price_adjustment_rules?: Record<string, any>;  // JSONB for rules
  
  // Time-based pricing
  early_bird_price?: number;
  early_bird_ends_at?: Date;
  last_minute_price?: number;
  last_minute_starts_at?: Date;
  
  // Group discounts
  group_size_min?: number;
  group_discount_percentage?: number;
  
  // Fees
  service_fee?: number;
  facility_fee?: number;
  tax_rate?: number;
  
  // Limits
  max_per_order?: number;
  max_per_customer?: number;
  
  // Sales windows
  sales_start_at?: Date;
  sales_end_at?: Date;
}
```

### Pricing Service

**File:** `event-service/src/services/pricing.service.ts`
```typescript
class PricingService {
  async getEventPricing(eventId, tenantId): Promise<IEventPricing[]>;
  async createPricing(data, tenantId): Promise<IEventPricing>;
  async updatePricing(pricingId, data, tenantId): Promise<IEventPricing>;
  async getActivePricing(eventId): Promise<IEventPricing[]>;  // Respects sales windows
  async calculateTotalPrice(pricingId, quantity): Promise<number>;
}
```

### Active Pricing Query
```typescript
async getActivePricing(eventId: string): Promise<IEventPricing[]> {
  const now = new Date();
  return this.db('event_pricing')
    .where({ event_id: eventId, is_active: true, is_visible: true })
    .where(function() {
      this.whereNull('sales_start_at').orWhere('sales_start_at', '<=', now);
    })
    .where(function() {
      this.whereNull('sales_end_at').orWhere('sales_end_at', '>=', now);
    })
    .orderBy('display_order', 'asc');
}
```

---

## What's NOT Implemented ❌

### 1. Automatic Price Adjustment

**Expected:**
```typescript
// Scheduled job to adjust prices
@Cron('*/15 * * * *')  // Every 15 minutes
async adjustDynamicPrices() {
  const dynamicPricing = await getDynamicPricingEvents();
  
  for (const pricing of dynamicPricing) {
    const newPrice = calculateNewPrice(pricing, {
      soldPercentage: getSoldPercentage(pricing.event_id),
      timeToEvent: getTimeToEvent(pricing.event_id),
      demandScore: getDemandScore(pricing.event_id),
    });
    
    await updateCurrentPrice(pricing.id, newPrice);
  }
}
```

### 2. Early Bird/Last Minute Auto-Apply

**Expected:**
```typescript
// At purchase time
function getEffectivePrice(pricing: IEventPricing): number {
  const now = new Date();
  
  if (pricing.early_bird_price && pricing.early_bird_ends_at > now) {
    return pricing.early_bird_price;
  }
  
  if (pricing.last_minute_price && pricing.last_minute_starts_at <= now) {
    return pricing.last_minute_price;
  }
  
  return pricing.current_price || pricing.base_price;
}
```

**Status:** Schema exists but logic to auto-select price tier not found

---

## Summary

| Aspect | Status |
|--------|--------|
| Pricing tier schema | ✅ Complete |
| Dynamic pricing fields | ✅ Complete |
| Early bird fields | ✅ Complete |
| Last minute fields | ✅ Complete |
| Group discount fields | ✅ Complete |
| Price bounds (min/max) | ✅ Complete |
| Sales window filtering | ✅ Working |
| CRUD operations | ✅ Working |
| Auto price adjustment | ❌ Not implemented |
| Demand-based pricing | ❌ Not implemented |
| Auto tier selection | ❌ Not implemented |

**Bottom Line:** Excellent schema design for dynamic pricing, but the automatic adjustment logic isn't built. Prices can be manually updated via API.
