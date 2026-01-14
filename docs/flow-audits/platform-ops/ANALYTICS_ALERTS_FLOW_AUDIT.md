# ANALYTICS ALERTS FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Analytics Alerts |

---

## Executive Summary

**NOT IMPLEMENTED - Controller stubs only**

| Component | Status |
|-----------|--------|
| Alert routes defined | ✅ Routes exist |
| Alert controller | ❌ Stub (returns empty) |
| Alert service | ❌ Not implemented |
| Alert conditions engine | ❌ Not implemented |
| Alert actions (email/webhook) | ❌ Not implemented |
| Alert scheduling | ❌ Not implemented |
| Alert instances/acknowledgment | ❌ Not implemented |

**Bottom Line:** The routes and controller structure exist for a comprehensive alerting system, but the implementation is stubbed out returning empty arrays. This would allow venues to set custom alerts on analytics thresholds.

---

## Intended API Endpoints

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/alerts/venue/:venueId` | GET | List venue alerts | ❌ Stub |
| `/alerts/:alertId` | GET | Get alert details | ❌ Stub |
| `/alerts` | POST | Create alert | ❌ Stub |
| `/alerts/:alertId` | PUT | Update alert | ❌ Stub |
| `/alerts/:alertId` | DELETE | Delete alert | ❌ Stub |
| `/alerts/:alertId/toggle` | POST | Enable/disable | ❌ Stub |
| `/alerts/:alertId/instances` | GET | Get triggered instances | ❌ Stub |
| `/alerts/instances/:instanceId/acknowledge` | POST | Acknowledge alert | ❌ Stub |
| `/alerts/:alertId/test` | POST | Test alert | ❌ Stub |

---

## Intended Data Model

### Alert Definition
```typescript
interface CreateAlertBody {
  venueId: string;
  name: string;
  description?: string;
  type: string;                    // 'threshold', 'anomaly', 'trend'
  severity: 'info' | 'warning' | 'error' | 'critical';
  conditions: AlertCondition[];    // When to trigger
  actions: AlertAction[];          // What to do when triggered
  enabled?: boolean;
  schedule?: {                     // When to evaluate
    cron?: string;
    timezone?: string;
  };
}

interface AlertCondition {
  metric: string;        // 'revenue', 'ticket_sales', 'conversion_rate'
  operator: string;      // 'gt', 'lt', 'eq', 'change_percent'
  value: number;
  window?: string;       // '1h', '24h', '7d'
}

interface AlertAction {
  type: 'email' | 'webhook' | 'slack' | 'sms';
  target: string;        // email address, webhook URL, etc.
  template?: string;
}
```

### Alert Instance (Triggered Alert)
```typescript
interface AlertInstance {
  id: string;
  alertId: string;
  status: 'active' | 'acknowledged' | 'resolved';
  triggeredAt: Date;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
  acknowledgedBy?: string;
  notes?: string;
  triggerData: {         // Data that caused the alert
    metric: string;
    value: number;
    threshold: number;
  };
}
```

---

## Use Cases (If Implemented)

1. **Revenue Drop Alert**: Alert when daily revenue drops >20% vs previous week
2. **Low Inventory Alert**: Alert when ticket inventory falls below 10%
3. **Conversion Rate Alert**: Alert when conversion rate drops below 2%
4. **Anomaly Detection**: Alert on unusual traffic patterns
5. **Refund Spike Alert**: Alert when refund rate exceeds 5%

---

## Recommendations

### P3 - Implement Analytics Alerts

| Task | Effort |
|------|--------|
| Create alerts table schema | 0.5 day |
| Implement alert CRUD service | 1 day |
| Build conditions evaluation engine | 2 days |
| Implement action executors (email, webhook) | 1.5 days |
| Add scheduled evaluation worker | 1 day |
| Alert instance management | 1 day |
| **Total** | **7 days** |

---

## Files Involved

| File | Purpose |
|------|---------|
| `analytics-service/src/routes/alerts.routes.ts` | Route definitions |
| `analytics-service/src/controllers/alerts.controller.ts` | Stub controller |

---

## Related Documents

- `NOTIFICATION_FLOW_AUDIT.md` - Notification delivery
- `WEBHOOK_OUTBOUND_FLOW_AUDIT.md` - Webhook actions
