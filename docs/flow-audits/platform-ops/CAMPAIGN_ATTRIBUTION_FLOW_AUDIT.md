# CAMPAIGN ATTRIBUTION FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Campaign Attribution |

---

## Executive Summary

**PARTIAL - Service implemented, controller stubbed**

| Component | Status |
|-----------|--------|
| Campaign routes | ✅ Defined |
| Campaign controller | ❌ Stub (returns empty) |
| Attribution service | ✅ Working |
| Touchpoint tracking | ✅ Working |
| Attribution models | ✅ Working (5 models) |
| Channel performance | ✅ Working |
| Campaign ROI | ✅ Working |
| Customer journey | ✅ Working |

**Bottom Line:** A full `AttributionService` exists with multiple attribution models (first touch, last touch, linear, time decay, data-driven), but the controller doesn't wire to it - returns empty responses. The service logic is production-ready.

---

## Attribution Models Implemented

| Model | Description | Status |
|-------|-------------|--------|
| First Touch | 100% credit to first interaction | ✅ Working |
| Last Touch | 100% credit to last interaction | ✅ Working |
| Linear | Equal credit to all touchpoints | ✅ Working |
| Time Decay | More credit to recent touchpoints (7-day half-life) | ✅ Working |
| Data-Driven | Channel-weighted attribution | ✅ Working |

---

## Service Implementation

### Touchpoint Tracking
```typescript
async trackTouchpoint(venueId: string, customerId: string, touchpoint: TouchPoint) {
  await CampaignSchema.trackTouchpoint({
    ...touchpoint,
    venueId,
    customerId
  });
}

interface TouchPoint {
  timestamp: Date;
  channel: string;      // 'organic', 'paid_search', 'social', 'email', 'direct'
  action: string;       // 'visit', 'click', 'conversion'
  value?: number;
  campaign?: string;
  customerId?: string;
}
```

### Attribution Calculation
```typescript
async calculateAttribution(
  venueId: string,
  conversionId: string,
  revenue: number,
  model: 'first_touch' | 'last_touch' | 'linear' | 'time_decay' | 'data_driven'
): Promise<AttributionPath> {
  const touchpoints = await this.getConversionTouchpoints(venueId, conversionId);
  const attribution = this.applyAttributionModel(touchpoints, revenue, model);
  
  return {
    customerId: touchpoints[0].customerId,
    conversionId,
    revenue,
    touchpoints,
    attribution  // Array of { touchpointIndex, credit, revenue }
  };
}
```

### Time Decay Model
```typescript
case 'time_decay':
  const halfLife = 7; // days
  const lastTouch = touchpoints[n - 1].timestamp;
  
  const weights = touchpoints.map(tp => {
    const daysFromLast = (lastTouch - tp.timestamp) / (1000 * 60 * 60 * 24);
    return Math.pow(2, -daysFromLast / halfLife);
  });
  
  // Normalize and distribute revenue
  touchpoints.forEach((_, i) => {
    const credit = weights[i] / totalWeight;
    attribution.push({ touchpointIndex: i, credit, revenue: revenue * credit });
  });
```

### Data-Driven Model
```typescript
case 'data_driven':
  const channelWeights = {
    'organic': 0.3,
    'paid_search': 0.25,
    'social': 0.2,
    'email': 0.15,
    'direct': 0.1
  };
  // Apply weights and normalize
```

### Channel Performance
```typescript
async getChannelPerformance(venueId: string, startDate: Date, endDate: Date) {
  const conversions = await this.getConversions(venueId, startDate, endDate);
  
  for (const conversion of conversions) {
    const attribution = await this.calculateAttribution(venueId, conversion.id, conversion.revenue, 'linear');
    // Aggregate by channel
  }
  
  return {
    channels: [
      { channel, visits, conversions, revenue, cost, roi, costPerAcquisition }
    ],
    multiTouchAttribution: [
      { touchpoint, attribution, revenue }
    ]
  };
}
```

### Campaign ROI
```typescript
async getCampaignROI(venueId: string, campaignId: string) {
  const performance = await CampaignSchema.getCampaignPerformance(campaignId);
  
  return {
    revenue: totals.revenue,
    cost: totals.cost,
    roi: ((revenue - cost) / cost) * 100,
    conversions: totals.conversions,
    costPerAcquisition: cost / conversions
  };
}
```

---

## API Endpoints (Stubbed)

| Endpoint | Method | Service Method | Status |
|----------|--------|----------------|--------|
| `/campaigns/venue/:venueId` | GET | - | ❌ Stub |
| `/campaigns/:campaignId` | GET | - | ❌ Stub |
| `/campaigns/:campaignId/performance` | GET | getChannelPerformance | ❌ Not wired |
| `/campaigns/:campaignId/attribution` | GET | calculateAttribution | ❌ Not wired |
| `/campaigns/venue/:venueId/channels` | GET | getChannelPerformance | ❌ Not wired |
| `/campaigns/touchpoint` | POST | trackTouchpoint | ❌ Not wired |
| `/campaigns/:campaignId/roi` | GET | getCampaignROI | ❌ Not wired |

---

## Recommendations

### P2 - Wire Controller to Service

| Task | Effort |
|------|--------|
| Wire controller methods to AttributionService | 0.5 day |
| Add campaign CRUD (create/update/delete) | 1 day |
| Replace mock data with real queries | 1 day |
| Add campaign table schema | 0.5 day |
| **Total** | **3 days** |

---

## Files Involved

| File | Purpose |
|------|---------|
| `analytics-service/src/routes/campaign.routes.ts` | Routes |
| `analytics-service/src/controllers/campaign.controller.ts` | Stub controller |
| `analytics-service/src/services/attribution.service.ts` | **Real implementation** |

---

## Related Documents

- `CUSTOMER_ANALYTICS_FLOW_AUDIT.md` - Customer journey
- `ANALYTICS_REPORTING_FLOW_AUDIT.md` - General analytics
