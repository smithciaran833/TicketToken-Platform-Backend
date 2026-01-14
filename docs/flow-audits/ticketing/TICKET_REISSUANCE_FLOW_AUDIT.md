# TICKET REISSUANCE FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Ticket Reissuance (Lost/Stolen/Duplicate) |

---

## Executive Summary

**NOT IMPLEMENTED - No reissuance functionality**

| Component | Status |
|-----------|--------|
| Reissue ticket endpoint | ❌ Not implemented |
| Revoke original ticket | ✅ State machine supports |
| Generate new QR code | ❌ Not implemented |
| Track reissuance history | ❌ Not implemented |
| Lost ticket claim flow | ❌ Not implemented |
| Stolen ticket reporting | ❌ Not implemented |
| Verification before reissue | ❌ Not implemented |

**Bottom Line:** There is no way to reissue a ticket if a customer loses access to it, their phone is stolen, or they need a new QR code. The state machine supports `DUPLICATE_TICKET` as a revocation reason, but no actual reissuance flow exists.

---

## What Exists

### 1. DUPLICATE_TICKET Revocation Reason

**File:** `backend/services/ticket-service/src/services/ticket-state-machine.ts`
```typescript
export enum RevocationReason {
  DUPLICATE_TICKET = 'duplicate_ticket',
  // ... other reasons
}
```

This allows revoking the original ticket, but there's no flow to issue a replacement.

---

## What's Missing

### 1. Reissuance Endpoint

Expected but not implemented:
```
POST /api/v1/admin/tickets/:ticketId/reissue
{
  "reason": "lost_phone",
  "verificationMethod": "id_check",
  "notes": "Customer showed valid ID at box office"
}
```

### 2. Reissuance Flow
```
┌─────────────────────────────────────────────────────────────┐
│           EXPECTED REISSUANCE FLOW                           │
│                  (NOT IMPLEMENTED)                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   1. Customer reports lost/stolen ticket                    │
│   2. Admin verifies customer identity                       │
│   3. Admin initiates reissuance                             │
│   4. Original ticket is REVOKED (duplicate_ticket reason)   │
│   5. New ticket created with same event/seat/tier           │
│   6. New QR code generated                                  │
│   7. New ticket linked to same order                        │
│   8. Customer notified with new ticket                      │
│   9. Reissuance history recorded                            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 3. Reissuance History Table
```sql
-- NOT IMPLEMENTED
CREATE TABLE ticket_reissuances (
  id UUID PRIMARY KEY,
  original_ticket_id UUID REFERENCES tickets(id),
  new_ticket_id UUID REFERENCES tickets(id),
  reason VARCHAR(50), -- lost_phone, stolen, damaged_qr, etc.
  verification_method VARCHAR(50), -- id_check, email_verify, etc.
  reissued_by UUID REFERENCES users(id),
  reissued_at TIMESTAMP DEFAULT NOW(),
  notes TEXT
);
```

### 4. Self-Service Lost Ticket

No customer-facing flow to report lost tickets or request reissuance.

---

## Impact

| Area | Impact |
|------|--------|
| Customer experience | No recourse if phone lost/stolen |
| Box office operations | Cannot help customers with lost tickets |
| Fraud prevention | No way to invalidate stolen tickets |
| Customer service | Must manually handle lost ticket cases |

---

## Recommendations

### P3 - Implement Ticket Reissuance

| Task | Effort |
|------|--------|
| Create reissuance history table | 0.25 day |
| Create admin reissue endpoint | 1 day |
| Revoke original + create new | 0.5 day |
| Generate new QR code | 0.25 day |
| Email new ticket to customer | 0.25 day |
| Customer self-service request flow | 1 day |
| Audit logging | 0.25 day |
| **Total** | **3-4 days** |

---

## Related Documents

- `TICKET_LIFECYCLE_EXPIRY_FLOW_AUDIT.md` - State machine with REVOKED state
- `VIEW_SINGLE_TICKET_QR_FLOW_AUDIT.md` - QR generation
- `TICKET_SCANNING_FLOW_AUDIT.md` - Entry validation
