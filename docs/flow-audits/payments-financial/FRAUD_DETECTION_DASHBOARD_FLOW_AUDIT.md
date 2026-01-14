# FRAUD DETECTION DASHBOARD FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Fraud Detection Dashboard |

---

## Executive Summary

**WORKING - Comprehensive fraud detection system**

| Component | Status |
|-----------|--------|
| Fraud check | ✅ Working |
| Review queue | ✅ Working |
| Assign review | ✅ Working |
| Complete review | ✅ Working |
| Fraud stats | ✅ Working |
| Fraud trends | ✅ Working |
| Top signals | ✅ Working |
| Dashboard | ✅ Working |
| Custom rules CRUD | ✅ Working |
| IP reputation | ✅ Working |
| IP blocking | ✅ Working |
| User fraud history | ✅ Working |

**Bottom Line:** Full fraud detection and management system with ML-based scoring, analyst review queue, custom rule engine, IP reputation tracking, and comprehensive dashboard with trends and signals.

---

## API Endpoints

### Fraud Checking

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/fraud/check` | POST | Check transaction | ✅ Working |

### Review Queue

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/fraud/review-queue` | GET | Get pending reviews | ✅ Working |
| `/fraud/review-queue/:id/assign` | POST | Assign to analyst | ✅ Working |
| `/fraud/review-queue/:id/complete` | POST | Complete review | ✅ Working |

### Analytics

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/fraud/stats` | GET | Get statistics | ✅ Working |
| `/fraud/trends` | GET | Get trends | ✅ Working |
| `/fraud/signals` | GET | Top signals | ✅ Working |
| `/fraud/dashboard` | GET | Full dashboard | ✅ Working |

### Rules

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/fraud/rules` | POST | Create rule | ✅ Working |
| `/fraud/rules` | GET | List rules | ✅ Working |
| `/fraud/rules/:id` | PUT | Update rule | ✅ Working |
| `/fraud/rules/:id` | DELETE | Deactivate rule | ✅ Working |

### IP Reputation

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/fraud/ip/:ipAddress` | GET | Get IP reputation | ✅ Working |
| `/fraud/ip/:ipAddress/block` | POST | Block IP | ✅ Working |

### User History

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/fraud/user/:userId/history` | GET | User fraud history | ✅ Working |

---

## Fraud Check
```typescript
POST /fraud/check
{
  transactionId: string,
  userId: string,
  amount: number,
  ipAddress: string,
  deviceFingerprint: string,
  paymentMethod: object,
  metadata: object
}

Response:
{
  score: 0.75,           // 0-1 risk score
  signals: [
    { type: 'velocity', weight: 0.3, details: 'High transaction velocity' },
    { type: 'ip', weight: 0.2, details: 'IP from high-risk country' }
  ],
  decision: 'review',    // 'allow', 'review', 'block'
  requiresReview: true
}
```

---

## Review Queue
```typescript
GET /fraud/review-queue?priority=high&status=pending&limit=20

Response:
{
  reviews: [
    {
      id: 'review-123',
      transactionId: 'tx-456',
      score: 0.85,
      priority: 'high',
      status: 'pending',
      assignedTo: null,
      signals: [...],
      createdAt: '2025-01-01T...'
    }
  ]
}
```

### Complete Review
```typescript
POST /fraud/review-queue/:id/complete
{
  decision: 'approve' | 'reject' | 'escalate',
  reviewerNotes: 'Customer verified via phone',
  reviewerId: 'analyst-123'
}
```

---

## Dashboard Data
```typescript
GET /fraud/dashboard?days=30

Response:
{
  reviewStats: {
    pending: 45,
    completed: 1200,
    avgReviewTime: '4.5 hours'
  },
  trends: [
    { date: '2025-01-01', fraudRate: 0.02, blockedCount: 15 }
  ],
  topSignals: [
    { signal: 'velocity', count: 234, weight: 0.35 },
    { signal: 'ip_reputation', count: 189, weight: 0.28 }
  ],
  riskDistribution: [
    { riskLevel: 'low', count: 5000 },
    { riskLevel: 'medium', count: 800 },
    { riskLevel: 'high', count: 150 }
  ],
  recentHighRisk: [
    { transactionId: 'tx-1', score: 0.92, timestamp: '...' }
  ]
}
```

---

## Custom Rules
```typescript
POST /fraud/rules
{
  ruleName: 'Block high-risk countries',
  description: 'Block transactions from high-risk countries',
  ruleType: 'ip_country',
  conditions: {
    countries: ['XX', 'YY', 'ZZ']
  },
  action: 'block',
  priority: 100
}
```

---

## IP Management

### Get Reputation
```typescript
GET /fraud/ip/1.2.3.4

Response:
{
  ip_address: '1.2.3.4',
  reputation_status: 'suspicious',
  risk_score: 65,
  transaction_count: 23,
  fraud_count: 3,
  last_seen: '2025-01-01T...'
}
```

### Block IP
```typescript
POST /fraud/ip/1.2.3.4/block
{
  reason: 'Multiple fraudulent transactions'
}
```

---

## Risk Distribution
```typescript
async function getRiskDistribution(days: number) {
  return db('fraud_checks')
    .where('timestamp', '>=', startDate)
    .select(
      db.raw("CASE WHEN score < 0.3 THEN 'low' WHEN score < 0.6 THEN 'medium' ELSE 'high' END as risk_level"),
      db.raw('COUNT(*) as count')
    )
    .groupBy('risk_level');
}
```

---

## Files Involved

| File | Purpose |
|------|---------|
| `payment-service/src/routes/fraud.routes.ts` | Routes |
| `payment-service/src/services/fraud/advanced-fraud-detection.service.ts` | ML detection |
| `payment-service/src/services/fraud/fraud-review.service.ts` | Review queue |

---

## Related Documents

- `PAYMENT_PROCESSING_FLOW_AUDIT.md` - Payment flow
- `RISK_ASSESSMENT_FLOW_AUDIT.md` - Compliance risk
- `DISPUTE_MANAGEMENT_FLOW_AUDIT.md` - Chargebacks
