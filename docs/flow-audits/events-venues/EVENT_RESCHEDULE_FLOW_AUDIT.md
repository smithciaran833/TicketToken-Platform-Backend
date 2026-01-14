# EVENT RESCHEDULE FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Event Reschedule |

---

## Executive Summary

**PARTIAL - State machine exists, no routes/service methods**

| Component | Status |
|-----------|--------|
| RESCHEDULED state in state machine | ✅ Exists |
| RESCHEDULE transition defined | ✅ Exists |
| Valid transitions from RESCHEDULED | ✅ Defined (PUBLISH, START_SALES, CANCEL) |
| Reschedule endpoint | ❌ Not implemented |
| Reschedule service method | ❌ Not implemented |
| Update event date/time | ⚠️ Can use event update, but no reschedule flow |
| Ticket holder notification | ⚠️ Placeholder only |
| Schedule update | ✅ Can update via schedule controller |

**Bottom Line:** Same as postponement - the state machine defines RESCHEDULED properly, but there's no dedicated endpoint to reschedule an event. Users could manually update the event date and change status, but there's no orchestrated flow.

---

## What Exists

### 1. State Machine Definition

**File:** `backend/services/event-service/src/services/event-state-machine.ts`
```typescript
// Transition from POSTPONED to RESCHEDULED
POSTPONED: {
  RESCHEDULE: 'RESCHEDULED',
  CANCEL: 'CANCELLED'
}

// From RESCHEDULED, can republish
RESCHEDULED: {
  PUBLISH: 'PUBLISHED',
  START_SALES: 'ON_SALE',
  CANCEL: 'CANCELLED'
}
```

### 2. Schedule Controller

Can update schedules with new dates:
```typescript
export const updateSchedule: AuthenticatedHandler = async (request, reply) => {
  // Can update starts_at, ends_at, etc.
  const updated = await scheduleModel.updateWithTenant(scheduleId, tenantId, updates);
};
```

---

## What's Missing

### 1. No Reschedule Endpoint

Expected:
```
POST /api/v1/events/:eventId/reschedule
{
  "newStartDate": "2025-03-15T19:00:00Z",
  "newEndDate": "2025-03-15T23:00:00Z",
  "reason": "Venue availability",
  "notifyTicketHolders": true
}
```

### 2. No Orchestrated Flow

Rescheduling should:
1. Validate event is POSTPONED
2. Update event/schedule dates
3. Transition state to RESCHEDULED
4. Notify all ticket holders of new date
5. Update any external calendars/integrations
6. Audit log

---

## Recommendations

### P2 - Implement with Postponement

Since reschedule follows postponement, implement together. See EVENT_POSTPONEMENT_FLOW_AUDIT.md.

| Task | Effort |
|------|--------|
| Included in postponement implementation | 0.5 day |

---

## Related Documents

- `EVENT_POSTPONEMENT_FLOW_AUDIT.md` - Prerequisite flow
- `EVENT_EDIT_UPDATE_FLOW_AUDIT.md` - General event updates
