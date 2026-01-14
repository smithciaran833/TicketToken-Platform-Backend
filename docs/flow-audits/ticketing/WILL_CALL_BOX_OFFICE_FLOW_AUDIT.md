# WILL CALL / BOX OFFICE FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Will Call / Box Office Ticket Pickup |

---

## Executive Summary

**NOT IMPLEMENTED - Role exists, no functionality**

| Component | Status |
|-----------|--------|
| box_office staff role | ✅ Exists |
| box_office permissions | ✅ Defined |
| Will-call delivery method | ❌ Not implemented |
| Box office ticket lookup | ❌ Not implemented |
| Box office ticket release | ❌ Not implemented |
| Customer pickup verification | ❌ Not implemented |
| Print ticket at venue | ❌ Not implemented |

**Bottom Line:** The `box_office` staff role exists with permissions like `tickets:sell` and `tickets:view`, but there is no actual will-call or box office functionality. Users cannot select "will call" as a delivery method, and there are no endpoints for box office staff to look up and release tickets.

---

## What Exists

### 1. Box Office Staff Role

**File:** `backend/services/venue-service/src/models/staff.model.ts`
```typescript
role: 'owner' | 'manager' | 'box_office' | 'door_staff' | 'viewer';
```

### 2. Box Office Permissions
```typescript
box_office: [
  'tickets:sell',
  'tickets:view',
  // ... other permissions
],
```

---

## What's Missing

### 1. Will-Call Delivery Method

No delivery method schema exists on orders or tickets:
```typescript
// Expected but missing:
interface Order {
  deliveryMethod: 'digital' | 'will_call' | 'mail';
  willCallName?: string;
  willCallId?: string;
}
```

### 2. Box Office Endpoints

Expected but not implemented:
```
GET  /api/v1/box-office/lookup?email={email}&confirmationCode={code}
POST /api/v1/box-office/release/:ticketId
POST /api/v1/box-office/print/:ticketId
GET  /api/v1/box-office/event/:eventId/will-call-list
```

### 3. Will-Call List

No way to generate a list of tickets awaiting pickup at an event.

### 4. ID Verification Flow

No flow to verify customer identity before releasing tickets.

---

## Expected Implementation

### Will-Call Flow (Not Built)
```
┌─────────────────────────────────────────────────────────────┐
│           EXPECTED WILL-CALL FLOW                            │
│                  (NOT IMPLEMENTED)                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   PURCHASE TIME:                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │  1. User selects "Will Call" delivery method        │   │
│   │  2. User provides name for pickup                   │   │
│   │  3. Order marked as will_call delivery              │   │
│   │  4. Confirmation email with pickup instructions     │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                              │
│   AT VENUE:                                                  │
│   ┌─────────────────────────────────────────────────────┐   │
│   │  1. Customer arrives at box office                  │   │
│   │  2. Provides confirmation code + ID                 │   │
│   │  3. Box office staff looks up order                 │   │
│   │  4. Verifies ID matches will_call_name              │   │
│   │  5. Releases tickets (marks as picked_up)           │   │
│   │  6. Prints physical tickets or sends to mobile      │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Impact

| Area | Impact |
|------|--------|
| Customer experience | No option for venue pickup |
| Fraud prevention | No secure ticket release process |
| Last-minute purchases | No same-day pickup option |
| Gift tickets | No third-party pickup flow |
| Corporate sales | No bulk will-call for groups |

---

## Recommendations

### P2 - Implement Will-Call

| Task | Effort |
|------|--------|
| Add delivery_method to orders schema | 0.5 day |
| Add will_call_name, will_call_id fields | 0.25 day |
| Create box-office lookup endpoint | 0.5 day |
| Create ticket release endpoint | 0.5 day |
| Create will-call list endpoint | 0.5 day |
| ID verification flow | 0.5 day |
| Print ticket functionality | 1 day |
| Box office UI (frontend) | 2 days |
| **Total** | **5-6 days** |

---

## Files That Would Need Changes

| File | Change |
|------|--------|
| `ticket-service/src/migrations/` | Add delivery_method columns |
| `ticket-service/src/routes/` | Add box-office routes |
| `ticket-service/src/controllers/` | Add box-office controller |
| `ticket-service/src/services/` | Add box-office service |
| `order-service/src/` | Add delivery method handling |
| `venue-service/src/` | Already has box_office role |

---

## Related Documents

- `VENUE_FEATURES_FLOW_AUDIT.md` - Staff roles (box_office exists)
- `TICKET_SCANNING_FLOW_AUDIT.md` - Entry validation
- `VIEW_SINGLE_TICKET_QR_FLOW_AUDIT.md` - Ticket display
