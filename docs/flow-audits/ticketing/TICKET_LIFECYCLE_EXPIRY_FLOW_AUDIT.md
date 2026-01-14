# TICKET LIFECYCLE & EXPIRY FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Ticket Lifecycle State Machine & Expiry |

---

## Executive Summary

**PARTIAL - State machine complete, post-event expiry missing**

| Component | Status |
|-----------|--------|
| Ticket state machine | ✅ Complete |
| Valid state transitions | ✅ Defined |
| Terminal states | ✅ Defined |
| RBAC on transitions | ✅ Complete |
| Check-in time window validation | ✅ Complete |
| Reservation expiry worker | ✅ Working |
| Reservation cleanup worker | ✅ Working |
| Orphan reservation detection | ✅ Working |
| Inventory reconciliation | ✅ Working |
| Post-event ticket expiry | ❌ Not implemented |
| Ticket expiry notifications | ⚠️ Partial (reservations only) |

**Bottom Line:** The ticket state machine is comprehensive with proper RBAC and validation. Reservation expiry works well with cleanup workers. However, there is NO worker to expire tickets after events end - tickets remain in ACTIVE/TRANSFERRED status forever.

---

## Architecture Overview

### Ticket State Machine
```
┌─────────────────────────────────────────────────────────────┐
│                  TICKET STATE MACHINE                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   AVAILABLE ──┬──→ RESERVED ──┬──→ SOLD ──→ MINTED ──→ ACTIVE
│               │               │                         │
│               │               ↓                         │
│               └──→ SOLD ──────┘                         │
│                               ↓                         │
│                           CANCELLED                     │
│                                                         │
│   ACTIVE ────┬──→ TRANSFERRED ──┬──→ CHECKED_IN (terminal)
│              │                  │
│              └──→ CHECKED_IN    │
│              │                  │
│              └──→ REFUNDED ←────┘
│              │
│              └──→ REVOKED
│                                                              │
│   TERMINAL STATES (no outgoing transitions):                │
│   • CHECKED_IN / USED                                       │
│   • REVOKED                                                 │
│   • REFUNDED                                                │
│   • EXPIRED                                                 │
│   • CANCELLED                                               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## What Works ✅

### 1. Ticket State Machine

**File:** `backend/services/ticket-service/src/services/ticket-state-machine.ts`

**Status Enum:**
```typescript
export enum TicketStatus {
  // Pre-purchase states
  AVAILABLE = 'available',
  RESERVED = 'reserved',

  // Purchase states
  SOLD = 'sold',
  MINTED = 'minted',

  // Active ownership states
  ACTIVE = 'active',
  TRANSFERRED = 'transferred',

  // Usage states
  CHECKED_IN = 'checked_in',
  USED = 'used',

  // Terminal/Invalid states
  REVOKED = 'revoked',
  REFUNDED = 'refunded',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}
```

**Valid Transitions:**
```typescript
export const VALID_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  [TicketStatus.AVAILABLE]: [RESERVED, SOLD, CANCELLED],
  [TicketStatus.RESERVED]: [AVAILABLE, SOLD, EXPIRED, CANCELLED],
  [TicketStatus.SOLD]: [MINTED, REFUNDED, CANCELLED],
  [TicketStatus.MINTED]: [ACTIVE, REFUNDED, REVOKED],
  [TicketStatus.ACTIVE]: [TRANSFERRED, CHECKED_IN, REFUNDED, REVOKED],
  [TicketStatus.TRANSFERRED]: [ACTIVE, TRANSFERRED, CHECKED_IN, REFUNDED, REVOKED],
  
  // Terminal states - no outgoing transitions
  [TicketStatus.CHECKED_IN]: [],
  [TicketStatus.USED]: [],
  [TicketStatus.REVOKED]: [],
  [TicketStatus.REFUNDED]: [],
  [TicketStatus.EXPIRED]: [],
  [TicketStatus.CANCELLED]: [],
};
```

### 2. RBAC on Transitions

**Revocation/Refund Permissions:**
```typescript
const TRANSITION_PERMISSIONS: Partial<Record<TicketStatus, TransitionPermission>> = {
  [TicketStatus.REVOKED]: {
    allowedRoles: [UserRole.VENUE_ADMIN, UserRole.EVENT_ADMIN, UserRole.SUPER_ADMIN, UserRole.SYSTEM],
    requiresAdmin: true,
    requiresReason: true,
  },
  [TicketStatus.REFUNDED]: {
    allowedRoles: [UserRole.VENUE_ADMIN, UserRole.EVENT_ADMIN, UserRole.SUPER_ADMIN, UserRole.SYSTEM],
    requiresAdmin: true,
    requiresReason: true,
  },
  [TicketStatus.CANCELLED]: {
    allowedRoles: [UserRole.VENUE_ADMIN, UserRole.EVENT_ADMIN, UserRole.SUPER_ADMIN, UserRole.SYSTEM],
    requiresAdmin: true,
    requiresReason: true,
  },
};
```

### 3. Check-in Time Window Validation
```typescript
private static validateCheckIn(currentStatus: TicketStatus, context: TransitionContext): void {
  // Status must allow check-in
  if (!canCheckIn(currentStatus)) {
    throw new ValidationError(`Ticket cannot be checked in from status '${currentStatus}'`);
  }

  // Time window validation
  if (context.eventStartTime && context.eventEndTime) {
    const now = new Date();
    const checkInWindowStart = new Date(context.eventStartTime);
    checkInWindowStart.setHours(checkInWindowStart.getHours() - 4); // 4 hours before

    const checkInWindowEnd = new Date(context.eventEndTime);
    checkInWindowEnd.setHours(checkInWindowEnd.getHours() + 2); // 2 hours after

    if (now < checkInWindowStart) {
      throw new ValidationError('Check-in not yet available. Window opens 4 hours before event.');
    }

    if (now > checkInWindowEnd) {
      throw new ValidationError('Check-in window has closed.');
    }
  }
}
```

### 4. Reservation Expiry Worker

**File:** `backend/services/ticket-service/src/workers/reservation-expiry.worker.ts`

- Runs every 60 seconds
- Calls `release_expired_reservations()` stored procedure
- Writes `reservation.expired` events to outbox
- Releases inventory back to available

### 5. Reservation Cleanup Worker

**File:** `backend/services/ticket-service/src/workers/reservation-cleanup.worker.ts`

- Releases expired reservations
- Finds and fixes orphan reservations (no_order, order_failed, should_be_expired)
- Cleans up stale Redis entries
- Reconciles inventory discrepancies
- Fixes negative inventory
- Sends notifications and alerts

**Orphan Detection:**
```typescript
const orphans = await client.query<OrphanReservation>(
  'SELECT * FROM find_orphan_reservations()'
);
```

**Inventory Reconciliation:**
- Detects negative inventory (critical alert)
- Finds discrepancies between reserved and available
- Logs to outbox for manual review

---

## What's Missing ❌

### 1. Post-Event Ticket Expiry

**Problem:** After an event ends, tickets remain in `ACTIVE` or `TRANSFERRED` status forever.

**Expected behavior:**
- Tickets not checked in should transition to `EXPIRED` after event ends
- Should run as a scheduled job

**No ticket expiry worker exists:**
```bash
ls backend/services/ticket-service/src/workers/
# blockchain-reconciliation.worker.ts
# idempotency-cleanup.worker.ts
# mintWorker.ts
# reservation-cleanup.worker.ts
# reservation-expiry.worker.ts
# NO ticket-expiry.worker.ts
```

### 2. Implementation Needed
```typescript
// ticket-expiry.worker.ts (NOT IMPLEMENTED)
export class TicketExpiryWorker {
  async processExpiredTickets(): Promise<void> {
    // Find tickets for events that ended more than 24 hours ago
    // that are still in ACTIVE or TRANSFERRED status
    const expiredTickets = await db.query(`
      UPDATE tickets t
      SET status = 'expired',
          status_reason = 'event_ended',
          status_changed_at = NOW(),
          updated_at = NOW()
      FROM events e
      WHERE t.event_id = e.id
        AND e.end_time < NOW() - INTERVAL '24 hours'
        AND t.status IN ('active', 'transferred')
      RETURNING t.id, t.user_id
    `);
    
    // Notify users their unused tickets expired
    for (const ticket of expiredTickets) {
      await this.notifyUser(ticket.user_id, 'TICKET_EXPIRED', {
        ticketId: ticket.id
      });
    }
  }
}
```

---

## Revocation Reasons
```typescript
export enum RevocationReason {
  FRAUD_DETECTED = 'fraud_detected',
  CHARGEBACK = 'chargeback',
  EVENT_CANCELLED = 'event_cancelled',
  DUPLICATE_TICKET = 'duplicate_ticket',
  TERMS_VIOLATION = 'terms_violation',
  ADMIN_REQUEST = 'admin_request',
  REFUND_REQUESTED = 'refund_requested',
  TRANSFER_DISPUTE = 'transfer_dispute',
}
```

---

## Side Effects on Transitions

| Transition | Side Effects |
|------------|--------------|
| → TRANSFERRED | Record in DB, queue blockchain transfer, notify both users |
| → CHECKED_IN | Update checked_in_at, record in ticket_scans |
| → REVOKED | Notify holder, log warning |
| → REFUNDED | Queue payment refund, notify holder |

---

## Database Updates
```sql
UPDATE tickets
SET
  status = $1,
  status_reason = $2,
  status_changed_by = $3,
  status_changed_at = NOW(),
  updated_at = NOW()
WHERE id = $4 AND tenant_id = $5
```

---

## Workers Summary

| Worker | Interval | Purpose | Status |
|--------|----------|---------|--------|
| ReservationExpiryWorker | 60s | Release expired reservations | ✅ Working |
| ReservationCleanupWorker | 60s | Fix orphans, reconcile inventory | ✅ Working |
| TicketExpiryWorker | - | Expire unused tickets post-event | ❌ Missing |

---

## Files Involved

| File | Purpose |
|------|---------|
| `ticket-service/src/services/ticket-state-machine.ts` | State machine logic |
| `ticket-service/src/workers/reservation-expiry.worker.ts` | Reservation expiry |
| `ticket-service/src/workers/reservation-cleanup.worker.ts` | Orphan cleanup |
| `ticket-service/src/index.ts` | Worker startup |

---

## Recommendations

### P1 - Create Ticket Expiry Worker

| Task | Effort |
|------|--------|
| Create ticket-expiry.worker.ts | 0.5 day |
| Query for expired event tickets | 0.25 day |
| Transition to EXPIRED status | 0.25 day |
| Send user notifications | 0.25 day |
| Register worker in index.ts | 0.25 day |
| **Total** | **1.5 days** |

### P3 - Minor Improvements

| Task | Effort |
|------|--------|
| Add metrics to state transitions | 0.5 day |
| Add transition audit log | 0.5 day |

---

## Related Documents

- `TICKET_VALIDATION_ENTRY_FLOW_AUDIT.md` - Check-in flow
- `TICKET_SCANNING_FLOW_AUDIT.md` - QR scanning
- `INVENTORY_RESERVATION_FLOW_AUDIT.md` - Reservation system
