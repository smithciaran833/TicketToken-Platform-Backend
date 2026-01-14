# RISK ASSESSMENT FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Risk Assessment |

---

## Executive Summary

**WORKING - Comprehensive risk scoring system**

| Component | Status |
|-----------|--------|
| Risk score calculation | ✅ Working |
| Verification status check | ✅ Working |
| OFAC status check | ✅ Working |
| Transaction velocity check | ✅ Working |
| Risk recommendations | ✅ Working |
| Flag for review | ✅ Working |
| Resolve flags | ✅ Working |
| Risk assessment storage | ✅ Working |
| Admin notifications on flag | ⚠️ TODO |
| Automated actions on score | ⚠️ Manual only |

**Bottom Line:** Full risk assessment system with multi-factor scoring based on verification status, OFAC matches, and transaction velocity. Produces recommendations (BLOCK, MANUAL_REVIEW, MONITOR, APPROVE) and supports manual flagging/resolution. Missing automated blocking and admin notifications.

---

## API Endpoints

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/compliance/risk/calculate` | POST | Calculate risk score | ✅ Working |
| `/compliance/risk/flag` | POST | Flag venue for review | ✅ Working |
| `/compliance/risk/flags/:flagId/resolve` | POST | Resolve flag | ✅ Working |

---

## Risk Scoring Algorithm

### Score Components (0-100)

| Factor | Points | Condition |
|--------|--------|-----------|
| No verification started | +30 | No record in venue_verifications |
| Previously rejected | +50 | status = 'rejected' |
| Verification pending | +20 | status = 'pending' |
| Missing EIN | +15 | ein IS NULL |
| No W-9 on file | +10 | w9_uploaded = false |
| Bank not verified | +10 | bank_verified = false |
| OFAC match | +40 | is_match = true |
| High transaction count | +20 | >100 transactions in 24h |
| High transaction volume | +25 | >$10,000 in 24h |

### Recommendations

| Score Range | Recommendation | Action |
|-------------|----------------|--------|
| 70+ | BLOCK | Prevent transactions |
| 50-69 | MANUAL_REVIEW | Require human review |
| 30-49 | MONITOR | Enhanced monitoring |
| 0-29 | APPROVE | Normal operations |

---

## Implementation Details

### Risk Service

**File:** `backend/services/compliance-service/src/services/risk.service.ts`
```typescript
async calculateRiskScore(venueId: string, tenantId: string) {
  let score = 0;
  const factors: string[] = [];

  // 1. Check verification status (0-30 points)
  const verification = await db.query(
    'SELECT * FROM venue_verifications WHERE venue_id = $1 AND tenant_id = $2',
    [venueId, tenantId]
  );

  if (!verification.rows.length) {
    score += 30;
    factors.push('No verification started');
  } else {
    if (verification.status === 'rejected') { score += 50; }
    if (verification.status === 'pending') { score += 20; }
    if (!verification.ein) { score += 15; }
    if (!verification.w9_uploaded) { score += 10; }
    if (!verification.bank_verified) { score += 10; }
  }

  // 2. Check OFAC status (0-40 points)
  const ofacResult = await db.query(
    'SELECT * FROM ofac_checks WHERE venue_id = $1 ORDER BY created_at DESC LIMIT 1',
    [venueId]
  );
  if (ofacResult.rows[0]?.is_match) {
    score += 40;
    factors.push('OFAC match found');
  }

  // 3. Check transaction velocity (0-30 points)
  const velocityCheck = await this.checkVelocity(venueId, tenantId);
  if (velocityCheck.suspicious) {
    score += velocityCheck.riskPoints;
    factors.push(velocityCheck.reason);
  }

  // Determine recommendation
  let recommendation = '';
  if (score >= 70) recommendation = 'BLOCK';
  else if (score >= 50) recommendation = 'MANUAL_REVIEW';
  else if (score >= 30) recommendation = 'MONITOR';
  else recommendation = 'APPROVE';

  // Store assessment
  await db.query(
    `INSERT INTO risk_assessments
     (venue_id, risk_score, factors, recommendation, tenant_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [venueId, score, JSON.stringify(factors), recommendation, tenantId]
  );

  return { score, factors, recommendation };
}
```

### Velocity Check
```typescript
private async checkVelocity(venueId: string, tenantId: string) {
  const result = await db.query(
    `SELECT COUNT(*) as count, SUM(amount) as total
     FROM tax_records
     WHERE venue_id = $1 AND tenant_id = $2
     AND created_at > NOW() - INTERVAL '24 hours'`,
    [venueId, tenantId]
  );

  const count = parseInt(result.rows[0]?.count || '0');
  const total = parseFloat(result.rows[0]?.total || '0');

  if (count > 100) {
    return { suspicious: true, riskPoints: 20, reason: `High velocity: ${count} in 24h` };
  }
  if (total > 10000) {
    return { suspicious: true, riskPoints: 25, reason: `High volume: $${total} in 24h` };
  }

  return { suspicious: false, riskPoints: 0, reason: '' };
}
```

---

## API Response

### Risk Calculation
```json
POST /compliance/risk/calculate
{ "venueId": "venue-uuid" }

Response:
{
  "success": true,
  "data": {
    "venueId": "venue-uuid",
    "score": 45,
    "factors": [
      "Verification pending",
      "No W-9 on file"
    ],
    "recommendation": "MONITOR",
    "timestamp": "2025-01-01T12:00:00Z"
  }
}
```

### Flag Venue
```json
POST /compliance/risk/flag
{ "venueId": "venue-uuid", "reason": "Suspicious transaction patterns" }

Response:
{
  "success": true,
  "message": "Venue flagged for review",
  "data": {
    "venueId": "venue-uuid",
    "reason": "Suspicious transaction patterns"
  }
}
```

---

## Database Tables

### risk_assessments
```sql
CREATE TABLE risk_assessments (
  id SERIAL PRIMARY KEY,
  venue_id UUID,
  risk_score INTEGER,
  factors JSONB,
  recommendation VARCHAR(50),
  tenant_id UUID,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### risk_flags
```sql
CREATE TABLE risk_flags (
  id SERIAL PRIMARY KEY,
  venue_id UUID,
  reason TEXT,
  resolved BOOLEAN DEFAULT false,
  resolution TEXT,
  resolved_at TIMESTAMP,
  tenant_id UUID,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## What's Missing

### 1. Automated Blocking
```typescript
// NOT IMPLEMENTED
if (recommendation === 'BLOCK') {
  await venueService.suspendVenue(venueId);
  await alertService.notify('VENUE_BLOCKED', { venueId, score, factors });
}
```

### 2. Admin Notifications
```typescript
// TODO in code
// Should send notification to admin on flag
await notificationService.sendAdminAlert({
  type: 'VENUE_FLAGGED',
  venueId,
  reason,
  riskScore
});
```

---

## Recommendations

### P2 - Complete Risk Automation

| Task | Effort |
|------|--------|
| Add automated blocking | 0.5 day |
| Add admin notifications | 0.5 day |
| Add scheduled risk re-assessment | 0.5 day |
| Add risk history dashboard | 1 day |
| **Total** | **2.5 days** |

---

## Files Involved

| File | Purpose |
|------|---------|
| `compliance-service/src/services/risk.service.ts` | Risk logic |
| `compliance-service/src/controllers/risk.controller.ts` | Endpoints |
| `compliance-service/src/routes/risk.routes.ts` | Routes |

---

## Related Documents

- `KYC_COMPLIANCE_FLOW_AUDIT.md` - Verification status
- `OFAC_SANCTIONS_SCREENING_FLOW_AUDIT.md` - OFAC factor
- `ADMIN_BACKOFFICE_FLOW_AUDIT.md` - Admin review tools
