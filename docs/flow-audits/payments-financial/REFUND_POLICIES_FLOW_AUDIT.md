# REFUND POLICIES FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Refund Policies |

---

## Executive Summary

**WORKING - Comprehensive refund policy system**

| Component | Status |
|-----------|--------|
| Policy CRUD | ✅ Working |
| Policy rules | ✅ Working |
| Refund reasons | ✅ Working |
| Eligibility check | ✅ Working |
| Auto-approve logic | ✅ Working |
| Manual review logic | ✅ Working |
| Response schemas | ✅ Working |

**Bottom Line:** Full configurable refund policy system with rules (time-based, percentage-based), reason codes, eligibility checking with auto-approve/manual-review logic, and RFC 7807 compliant error responses.

---

## API Endpoints

### Policies

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/policies` | POST | Create policy | ✅ Working |
| `/policies` | GET | List policies | ✅ Working |
| `/policies/:policyId` | GET | Get policy | ✅ Working |
| `/policies/:policyId` | PATCH | Update policy | ✅ Working |
| `/policies/:policyId` | DELETE | Deactivate policy | ✅ Working |

### Rules

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/rules` | POST | Create rule | ✅ Working |
| `/policies/:policyId/rules` | GET | Get rules | ✅ Working |
| `/rules/:ruleId` | GET | Get rule | ✅ Working |
| `/rules/:ruleId` | PATCH | Update rule | ✅ Working |
| `/rules/:ruleId` | DELETE | Delete rule | ✅ Working |

### Reasons

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/reasons` | POST | Create reason | ✅ Working |
| `/reasons` | GET | List reasons | ✅ Working |
| `/reasons/:reasonId` | GET | Get reason | ✅ Working |
| `/reasons/:reasonId` | PATCH | Update reason | ✅ Working |
| `/reasons/:reasonId` | DELETE | Deactivate reason | ✅ Working |

### Eligibility

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/check-eligibility` | POST | Check eligibility | ✅ Working |

---

## Data Models

### Policy
```typescript
interface RefundPolicy {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  isDefault: boolean;
  isActive: boolean;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
}
```

### Rule
```typescript
interface RefundRule {
  id: string;
  policyId: string;
  name: string;
  conditionType: string;       // 'days_before_event', 'hours_before_event', 'always'
  conditionValue?: number;     // e.g., 7 (days)
  refundPercentage: number;    // 0-100
  priority: number;
  isActive: boolean;
}

// Example rules:
// - More than 7 days before: 100% refund
// - 3-7 days before: 75% refund
// - 1-3 days before: 50% refund
// - Less than 24 hours: No refund
```

### Reason
```typescript
interface RefundReason {
  id: string;
  tenantId: string;
  code: string;               // 'EVENT_CANCELLED', 'DUPLICATE', 'CHANGED_MIND'
  name: string;
  description?: string;
  requiresApproval: boolean;  // Some reasons auto-approve
  isActive: boolean;
}
```

---

## Eligibility Check
```typescript
POST /check-eligibility
{
  orderId: string;
  reason?: string;
}

Response:
{
  eligible: boolean,
  reason: string,                    // Why eligible/not
  maxRefundAmountCents: number,      // Maximum refund amount
  refundPercentage: number,          // Percentage of order
  warnings: string[],                // Potential issues
  blockers: string[],                // Why blocked
  autoApprove: boolean,              // Can auto-approve
  requiresManualReview: boolean,     // Needs human review
  manualReviewReason?: string        // Why manual review
}
```

---

## Auto-Approve vs Manual Review

**Auto-Approve Conditions:**
- Event cancelled by venue
- Duplicate purchase detected
- Within full-refund window
- Standard reason code

**Manual Review Conditions:**
- Reason requires approval
- Partial refund (complex calculation)
- High-value order
- Customer has refund history
- Near refund deadline

---

## Files Involved

| File | Purpose |
|------|---------|
| `order-service/src/routes/refund-policy.routes.ts` | Routes with full schemas |
| `order-service/src/controllers/refund-policy.controller.ts` | Controller |
| `order-service/src/validators/refund-policy.schemas.ts` | Validation |

---

## Related Documents

- `REFUND_PROCESSING_FLOW_AUDIT.md` - Processing refunds
- `PAYMENT_PROCESSING_FLOW_AUDIT.md` - Payment system
- `DISPUTE_MANAGEMENT_FLOW_AUDIT.md` - Disputes
