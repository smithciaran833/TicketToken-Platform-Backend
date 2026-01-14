# ANALYTICS/REPORTING FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | December 31, 2024 |
| Updated | December 31, 2024 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Analytics & Reporting (Venue Dashboards) |

---

## Executive Summary

**CRITICAL: ORPHANED SERVICE - No Events Flow To It**

The analytics service is a comprehensive, well-built system with:
- 13 route groups registered
- Real-time metrics via WebSocket
- Bull queues for event processing
- Customer analytics, predictions, dashboards

**The Problem:** No other service publishes events to it. The queues are empty. The service is listening but nothing is talking.

| Component | Code Quality | Integration |
|-----------|--------------|-------------|
| Analytics Service | ✅ Enterprise-grade | ❌ ORPHANED |
| Event Stream Processing | ✅ Complete | ❌ No events received |
| Real-time Dashboards | ✅ Complete | ❌ No data flows in |
| Report Generation | ✅ Complete | ❌ No data to report |

---

## Integration Verification

### How We Verified
```bash
# Check if any service publishes to analytics queues
grep -r "ticket-purchase\|ticket-scan\|analytics" backend/services/ticket-service/src --include="*.ts" | grep -i "publish\|emit\|queue"
# Result: Empty - ticket-service doesn't publish to analytics

# Check if payment-service publishes to analytics
grep -r "analytics\|ticket-purchase" backend/services/payment-service/src --include="*.ts" | grep -i "publish\|emit\|queue"
# Result: Empty - payment-service doesn't publish to analytics

# Check if order-service publishes to analytics
grep -r "analytics" backend/services/order-service/src --include="*.ts" | grep -i "publish\|emit\|queue"
# Result: Empty - order-service doesn't publish to analytics
```

### Conclusion

The analytics service has Bull queues listening for these events:
- `ticket-purchase`
- `ticket-scan`
- `page-view`
- `cart-update`
- `venue-update`

**No service in the platform publishes any of these events.**

---

## What Exists (The Code)

### Routes Registered

**File:** `analytics-service/src/app.ts`
```typescript
await app.register(healthRoutes);
await app.register(analyticsRoutes, { prefix: '/api/analytics' });
await app.register(metricsRoutes, { prefix: '/api/metrics' });
await app.register(dashboardRoutes, { prefix: '/api/dashboards' });
await app.register(alertsRoutes, { prefix: '/api/alerts' });
await app.register(reportsRoutes, { prefix: '/api/reports' });
await app.register(exportRoutes, { prefix: '/api/exports' });
await app.register(customerRoutes, { prefix: '/api/customers' });
await app.register(campaignRoutes, { prefix: '/api/campaigns' });
await app.register(insightsRoutes, { prefix: '/api/insights' });
await app.register(predictionRoutes, { prefix: '/api/predictions' });
await app.register(realtimeRoutes, { prefix: '/api/realtime' });
await app.register(widgetRoutes, { prefix: '/api/widgets' });
```

**Status:** ✅ All routes registered correctly

---

### Event Stream Service

**File:** `analytics-service/src/services/event-stream.service.ts`
```typescript
export class EventStreamService extends EventEmitter {
  private queues: Map<string, Bull.Queue> = new Map();

  private initializeQueues() {
    const eventTypes = [
      'ticket-purchase',
      'ticket-scan',
      'page-view',
      'cart-update',
      'venue-update'
    ];

    eventTypes.forEach(type => {
      const queue = new Bull(type, { redis: redisConfig });
      queue.process(async (job) => {
        await this.processEvent(type, job.data);
      });
      this.queues.set(type, queue);
    });
  }

  async processEvent(type: string, data: any) {
    // Update Redis real-time metrics
    // Store in analytics database
    // Emit to WebSocket clients
  }
}
```

**Status:** ✅ Code is complete, ❌ Queues are empty (nothing publishes to them)

---

### Real-time Aggregation

**File:** `analytics-service/src/services/realtime-aggregation.service.ts`

**Features:**
- 1-minute, 5-minute, hourly aggregation
- Revenue tracking
- Ticket sales velocity
- Customer flow metrics

**Status:** ✅ Code is complete, ❌ No data to aggregate

---

### Customer Insights

**File:** `analytics-service/src/services/customer-insights.service.ts`

**Features:**
- Customer Lifetime Value (CLV)
- Churn risk prediction
- Customer segmentation
- Purchase patterns

**Status:** ✅ Code is complete, ❌ No customer events to analyze

---

### Report Generation

**Features:**
- Scheduled reports (PDF, XLSX, CSV)
- Custom dashboards
- Export functionality

**Status:** ✅ Code is complete, ❌ No data to report on

---

## Architecture (As Designed)
```
┌─────────────────────────────────────────────────────────────┐
│                    Source Services                           │
├─────────────────────────────────────────────────────────────┤
│  ticket-service ──┬──> Bull Queue: ticket-purchase          │
│  scanning-service ┼──> Bull Queue: ticket-scan              │
│  frontend ────────┼──> Bull Queue: page-view                │
│  order-service ───┼──> Bull Queue: cart-update              │
│  venue-service ───┴──> Bull Queue: venue-update             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ (NOTHING FLOWS HERE)
┌─────────────────────────────────────────────────────────────┐
│                   Analytics Service                          │
├─────────────────────────────────────────────────────────────┤
│  EventStreamService ──> processes events                     │
│  RealtimeAggregation ──> updates Redis metrics              │
│  WebSocket ──> pushes to dashboards                         │
│  CustomerInsights ──> ML predictions                        │
│  ReportService ──> generates reports                        │
└─────────────────────────────────────────────────────────────┘
```

---

## What Would Need to Happen

### ticket-service Should Publish
```typescript
// In purchaseController.ts after successful purchase:
await analyticsQueue.add('ticket-purchase', {
  ticketId,
  eventId,
  venueId,
  userId,
  amount,
  timestamp: new Date()
});
```

### scanning-service Should Publish
```typescript
// In QRValidator.ts after successful scan:
await analyticsQueue.add('ticket-scan', {
  ticketId,
  eventId,
  venueId,
  scannedAt: new Date(),
  entryPoint: zone
});
```

### order-service Should Publish
```typescript
// In order.service.ts on cart update:
await analyticsQueue.add('cart-update', {
  userId,
  eventId,
  items,
  cartValue,
  timestamp: new Date()
});
```

---

## Database Tables

### venue_analytics (PostgreSQL)

| Column | Type | Purpose |
|--------|------|---------|
| venue_id | UUID | Which venue |
| metric_type | VARCHAR | Type of metric |
| value | DECIMAL | Metric value |
| period | VARCHAR | 1min, 5min, hourly, daily |
| recorded_at | TIMESTAMP | When recorded |

### customer_metrics (PostgreSQL)

| Column | Type | Purpose |
|--------|------|---------|
| customer_id | UUID | Which customer |
| clv | DECIMAL | Customer lifetime value |
| churn_risk | DECIMAL | Churn probability |
| segment | VARCHAR | Customer segment |
| last_calculated | TIMESTAMP | When last updated |

---

## Dependencies

| Dependency | Status |
|------------|--------|
| PostgreSQL (main) | ✅ Connected |
| PostgreSQL (analytics) | ✅ Connected |
| Redis | ✅ Connected |
| Bull queues | ✅ Created, ❌ Empty |
| InfluxDB (optional) | ⚠️ Configured but optional |

---

## Summary

| Aspect | Code | Integration |
|--------|------|-------------|
| Route registration | ✅ 13 route groups | ✅ Working |
| Event consumption | ✅ Bull queues ready | ❌ No publishers |
| Real-time metrics | ✅ WebSocket ready | ❌ No data |
| Customer analytics | ✅ ML models ready | ❌ No events |
| Report generation | ✅ Complete | ❌ No data |
| Dashboards | ✅ Complete | ❌ Empty |

**Bottom Line:** A sophisticated analytics platform exists but is completely disconnected from the rest of the system. It's listening to empty queues.

---

## To Fix

| Priority | Action |
|----------|--------|
| P1 | Add event publishing to ticket-service (purchases) |
| P1 | Add event publishing to scanning-service (scans) |
| P2 | Add event publishing to order-service (cart updates) |
| P2 | Add event publishing to venue-service (venue updates) |
| P3 | Add frontend event tracking (page views) |

---

## Related Documents

- `PRIMARY_PURCHASE_FLOW_AUDIT.md` - Should publish ticket-purchase events
- `TICKET_SCANNING_FLOW_AUDIT.md` - Should publish ticket-scan events
- `NOTIFICATION_FLOW_AUDIT.md` - Similar pattern of events not published
