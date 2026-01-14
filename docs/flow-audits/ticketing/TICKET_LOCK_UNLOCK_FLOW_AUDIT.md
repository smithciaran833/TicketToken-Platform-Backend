# TICKET LOCK/UNLOCK FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Ticket Lock/Unlock (Transfer Prevention) |

---

## Executive Summary

**PARTIAL - Schema exists, no admin endpoints**

| Component | Status |
|-----------|--------|
| is_transferable column | ✅ Exists |
| Transfer check for is_transferable | ✅ Working |
| Admin lock endpoint | ❌ Not implemented |
| Admin unlock endpoint | ❌ Not implemented |
| Lock reason tracking | ❌ Not implemented |
| Bulk lock/unlock | ❌ Not implemented |
| Lock notifications | ❌ Not implemented |

**Bottom Line:** The `is_transferable` flag exists on tickets and is checked during transfers, but there is no admin endpoint to change this flag. Tickets can only be set as non-transferable at creation time.

---

## What Exists

### 1. is_transferable Column

**File:** `backend/services/ticket-service/src/migrations/001_baseline_ticket.ts`
```typescript
table.boolean('is_transferable').defaultTo(true);
```

### 2. Transfer Check

**File:** `backend/services/ticket-service/src/services/transferService.ts`
```typescript
// Check if ticket is transferable
if (ticket.is_transferable === false) {
  throw new ValidationError('This ticket is non-transferable');
}
```

### 3. Ticket Model

**File:** `backend/services/ticket-service/src/models/Ticket.ts`
```typescript
interface Ticket {
  is_transferable?: boolean;
  // ...
}
```

---

## What's Missing

### 1. Admin Lock/Unlock Endpoints

Expected but not implemented:
```
POST   /api/v1/admin/tickets/:ticketId/lock
DELETE /api/v1/admin/tickets/:ticketId/lock
POST   /api/v1/admin/tickets/bulk-lock
```

### 2. Lock Reason Tracking
```sql
-- NOT IMPLEMENTED
ALTER TABLE tickets ADD COLUMN locked_at TIMESTAMP;
ALTER TABLE tickets ADD COLUMN locked_by UUID REFERENCES users(id);
ALTER TABLE tickets ADD COLUMN lock_reason VARCHAR(100);
```

### 3. Lock Reasons Enum
```typescript
// NOT IMPLEMENTED
enum TicketLockReason {
  FRAUD_INVESTIGATION = 'fraud_investigation',
  CHARGEBACK_PENDING = 'chargeback_pending',
  DISPUTE = 'dispute',
  ADMIN_REQUEST = 'admin_request',
  EVENT_POLICY = 'event_policy',
  LEGAL_HOLD = 'legal_hold'
}
```

---

## Expected Implementation

### Lock/Unlock Flow (Not Built)
```
┌─────────────────────────────────────────────────────────────┐
│           EXPECTED LOCK/UNLOCK FLOW                          │
│                  (NOT IMPLEMENTED)                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   LOCK: POST /api/v1/admin/tickets/:ticketId/lock           │
│   ┌─────────────────────────────────────────────────────┐   │
│   │  1. Verify admin permission                         │   │
│   │  2. Set is_transferable = false                     │   │
│   │  3. Record locked_at, locked_by, lock_reason        │   │
│   │  4. Notify ticket holder                            │   │
│   │  5. Audit log                                       │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                              │
│   UNLOCK: DELETE /api/v1/admin/tickets/:ticketId/lock       │
│   ┌─────────────────────────────────────────────────────┐   │
│   │  1. Verify admin permission                         │   │
│   │  2. Set is_transferable = true                      │   │
│   │  3. Clear locked_at, locked_by, lock_reason         │   │
│   │  4. Notify ticket holder                            │   │
│   │  5. Audit log                                       │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Current Behavior

| Scenario | Behavior |
|----------|----------|
| Ticket created with is_transferable=false | Cannot be transferred |
| Ticket created with is_transferable=true | Can be transferred |
| Admin wants to lock a ticket | No way to do it |
| Admin wants to unlock a ticket | No way to do it |
| Fraud investigation | Manual DB update required |

---

## Impact

| Area | Impact |
|------|--------|
| Fraud prevention | Cannot freeze suspicious tickets |
| Dispute handling | Cannot lock tickets during disputes |
| Chargeback processing | Cannot prevent transfer during chargeback |
| Legal compliance | Cannot place legal holds on tickets |

---

## Recommendations

### P3 - Implement Lock/Unlock

| Task | Effort |
|------|--------|
| Add locked_at, locked_by, lock_reason columns | 0.25 day |
| Create admin lock endpoint | 0.5 day |
| Create admin unlock endpoint | 0.5 day |
| Add bulk lock/unlock | 0.5 day |
| Notify ticket holder on lock/unlock | 0.25 day |
| Audit logging | 0.25 day |
| **Total** | **2-3 days** |

---

## Related Documents

- `TICKET_TRANSFER_GIFT_FLOW_AUDIT.md` - Transfer flow that checks is_transferable
- `TICKET_LIFECYCLE_EXPIRY_FLOW_AUDIT.md` - State machine
- `FRAUD_INVESTIGATION_FLOW_AUDIT.md` - Would use lock feature
