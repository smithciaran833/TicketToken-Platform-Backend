# CUSTOMER ANALYTICS FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Customer Analytics |

---

## Executive Summary

**PARTIAL - Service implemented, controller stubbed**

| Component | Status |
|-----------|--------|
| Customer routes | ✅ Defined |
| Customer controller | ❌ Stub (returns empty) |
| CustomerIntelligenceService | ✅ Working |
| Customer profiles | ✅ Working |
| Customer segmentation | ✅ Working |
| RFM analysis | ✅ Working |
| CLV prediction | ✅ Working |
| Churn probability | ✅ Working |
| Customer insights | ✅ Working |
| Privacy (hashing) | ✅ Working |

**Bottom Line:** A comprehensive `CustomerIntelligenceService` exists with customer profiling, segmentation, RFM analysis, lifetime value prediction, and churn scoring. The controller is stubbed and doesn't wire to it.

---

## Service Implementation

### Customer Profile
```typescript
async getCustomerProfile(venueId: string, customerId: string): Promise<CustomerProfile> {
  // Hash customer ID for privacy
  const hashedCustomerId = await anonymizationService.hashCustomerId(customerId);
  
  // Get purchase history
  const events = await EventSchema.getEvents(venueId, { userId: hashedCustomerId });
  
  return {
    customerId,
    venueId,
    firstSeen: Date,
    lastSeen: Date,
    totalSpent: number,
    totalTickets: number,
    averageOrderValue: number,
    purchaseFrequency: number,
    daysSinceLastPurchase: number,
    segment: CustomerSegment,
    predictedLifetimeValue: number,
    churnProbability: number,
    attributes: {
      preferences: { eventTypes: string[] },
      behavior: { purchaseTime: 'morning' | 'afternoon' | 'evening' }
    }
  };
}
```

### Customer Segments
```typescript
enum CustomerSegment {
  NEW = 'new',
  OCCASIONAL = 'occasional',
  REGULAR = 'regular',
  VIP = 'vip',
  AT_RISK = 'at_risk',
  DORMANT = 'dormant',
  LOST = 'lost'
}

private determineCustomerSegment(metrics): CustomerSegment {
  if (totalTickets === 0) return NEW;
  if (daysSinceLastPurchase > 365) return LOST;
  if (daysSinceLastPurchase > 180) return DORMANT;
  if (daysSinceLastPurchase > 90) return AT_RISK;
  if (totalSpent > 1000 && purchaseFrequency > 4) return VIP;
  if (purchaseFrequency > 2) return REGULAR;
  return OCCASIONAL;
}
```

### Churn Probability
```typescript
private calculateChurnProbability(daysSinceLastPurchase, purchaseFrequency): number {
  let probability = 0;
  
  if (daysSinceLastPurchase > 180) probability = 0.8;
  else if (daysSinceLastPurchase > 90) probability = 0.6;
  else if (daysSinceLastPurchase > 60) probability = 0.4;
  else if (daysSinceLastPurchase > 30) probability = 0.2;
  else probability = 0.1;
  
  // Adjust for frequency
  if (purchaseFrequency > 4) probability *= 0.5;
  else if (purchaseFrequency > 2) probability *= 0.7;
  
  return Math.min(probability, 1);
}
```

### RFM Analysis
```typescript
async performRFMAnalysis(venueId: string, customerId: string): Promise<RFMAnalysis> {
  const profile = await this.getCustomerProfile(venueId, customerId);
  
  return {
    customerId,
    recency: profile.daysSinceLastPurchase,
    frequency: profile.totalTickets,
    monetary: profile.totalSpent,
    recencyScore: this.scoreRecency(days),      // 1-5
    frequencyScore: this.scoreFrequency(freq),  // 1-5
    monetaryScore: this.scoreMonetary(amount),  // 1-5
    segment: this.getRFMSegment(r, f, m)        // 'Champions', 'Loyal', etc.
  };
}

// RFM Segments
const segments = {
  '555': 'Champions',
  '554': 'Champions',
  '454': 'Loyal Customers',
  '543': 'Potential Loyalists',
  '533': 'Recent Customers',
  '332': 'Promising',
  '311': 'New Customers',
  '211': 'Hibernating',
  '112': 'At Risk',
  '111': 'Lost'
};
```

### Customer Insights
```typescript
async generateCustomerInsights(venueId, customerId): Promise<CustomerInsight[]> {
  const profile = await this.getCustomerProfile(venueId, customerId);
  const insights = [];
  
  // Churn risk insight
  if (profile.churnProbability > 0.6) {
    insights.push({
      type: InsightType.CHURN_RISK,
      title: "High Churn Risk",
      impact: "high",
      suggestedActions: [
        "Send personalized retention offer",
        "Reach out with exclusive event previews"
      ]
    });
  }
  
  // Low engagement insight
  if (profile.daysSinceLastPurchase > 90) {
    insights.push({
      type: InsightType.LOW_ENGAGEMENT,
      title: "Inactive Customer",
      suggestedActions: ["Send re-engagement campaign"]
    });
  }
  
  // High value insight
  if (profile.totalSpent > 1000) {
    insights.push({
      type: InsightType.HIGH_VALUE,
      title: "VIP Customer",
      suggestedActions: ["Provide VIP treatment"]
    });
  }
  
  return insights;
}
```

### Lifetime Value Prediction
```typescript
// Simplified CLV calculation
const predictedLifetimeValue = averageOrderValue * purchaseFrequency * 3; // 3 year horizon
```

---

## API Endpoints (Stubbed)

| Endpoint | Method | Service Method | Status |
|----------|--------|----------------|--------|
| `/customers/venue/:venueId/segments` | GET | getCustomerSegments | ❌ Not wired |
| `/customers/venue/:venueId/:customerId` | GET | getCustomerProfile | ❌ Not wired |
| `/customers/venue/:venueId/:customerId/insights` | GET | generateCustomerInsights | ❌ Not wired |
| `/customers/venue/:venueId/:customerId/journey` | GET | getCustomerJourney | ❌ Not wired |
| `/customers/venue/:venueId/:customerId/rfm` | GET | performRFMAnalysis | ❌ Not wired |
| `/customers/venue/:venueId/:customerId/clv` | GET | (in profile) | ❌ Not wired |
| `/customers/venue/:venueId/search` | GET | - | ❌ Stub |

---

## Recommendations

### P2 - Wire Controller to Service

| Task | Effort |
|------|--------|
| Wire controller to CustomerIntelligenceService | 0.5 day |
| Add customer search functionality | 1 day |
| Replace mock segment counts with real queries | 0.5 day |
| **Total** | **2 days** |

---

## Files Involved

| File | Purpose |
|------|---------|
| `analytics-service/src/routes/customer.routes.ts` | Routes |
| `analytics-service/src/controllers/customer.controller.ts` | Stub controller |
| `analytics-service/src/services/customer-intelligence.service.ts` | **Real implementation** |
| `analytics-service/src/services/anonymization.service.ts` | Privacy |

---

## Related Documents

- `CAMPAIGN_ATTRIBUTION_FLOW_AUDIT.md` - Customer journey tracking
- `ANALYTICS_REPORTING_FLOW_AUDIT.md` - General analytics
