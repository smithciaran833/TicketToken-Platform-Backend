# EVENT CANCELLATION FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | December 31, 2024 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Event Cancellation (Mass Refunds) |

---

## Executive Summary

**FINDING:** Event cancellation workflow exists but **refunds are NOT actually triggered**. The service publishes events to message queues but:
1. No service listens for `EVENT_CANCELLED_REFUND_REQUEST`
2. `getEventTickets()` returns empty array (placeholder)
3. NFTs are never burned/invalidated on blockchain

Notifications work if the event reaches notification-service.

---

## The Flow (As Designed)
```
Venue cancels event
        ↓
POST /events/:eventId/cancel
        ↓
Update event status to CANCELLED
        ↓
Get all tickets for event
        ↓
Trigger refunds for all orders
        ↓
Invalidate all tickets
        ↓
Cancel resale listings
        ↓
Notify all ticket holders
        ↓
Audit log
```

---

## What Actually Happens
```
Venue cancels event
        ↓
POST /events/:eventId/cancel
        ↓
Update event status to CANCELLED ✅
        ↓
Audit log created ✅
        ↓
Return success ✅
        ↓
NOTHING ELSE HAPPENS ❌
```

---

## Two Cancellation Services

**Confusingly, there are TWO cancellation services:**

### 1. CancellationService (Actually Used)

**File:** `backend/services/event-service/src/services/cancellation.service.ts`

**Called by:** Controller

**What it does:**
- ✅ Validates cancellation permission
- ✅ Checks cancellation deadline
- ✅ Updates event status to CANCELLED
- ✅ Creates audit log
- ❌ Does NOT trigger refunds
- ❌ Does NOT invalidate tickets
- ❌ Does NOT cancel resale listings
- ❌ Does NOT notify users

### 2. EventCancellationService (NOT Used)

**File:** `backend/services/event-service/src/services/event-cancellation.service.ts`

**Called by:** Nobody

**What it WOULD do:**
- ✅ Update event status
- ⚠️ Get tickets (returns empty array - placeholder)
- ⚠️ Trigger refunds (publishes event, no listener)
- ⚠️ Invalidate tickets (publishes event, no listener)
- ⚠️ Cancel resale listings (publishes event, no listener)
- ⚠️ Notify users (publishes event, listener exists)
- ✅ Audit log

---

## The Controller Uses Wrong Service

**File:** `backend/services/event-service/src/controllers/cancellation.controller.ts`
```typescript
import { CancellationService } from '../services/cancellation.service';
// NOT importing EventCancellationService which has full workflow

const cancellationService = new CancellationService(db);
const result = await cancellationService.cancelEvent(...);
```

The full workflow service exists but is never used!

---

## Gaps in EventCancellationService

Even if we used the right service:

### Gap 1: getEventTickets() is a placeholder
```typescript
private async getEventTickets(eventId: string, tenantId: string) {
  // Placeholder - in production, this calls ticket-service
  logger.info({ eventId, tenantId }, 'Fetching tickets for event');
  return []; // ← ALWAYS RETURNS EMPTY
}
```

### Gap 2: No listener for refund events
```typescript
const refundEvent = {
  type: 'EVENT_CANCELLED_REFUND_REQUEST',
  eventId,
  tenantId,
  refundPolicy,
  ticketCount: tickets.length,
};
// In production: await messageQueue.publish('refunds', refundEvent);
// ↑ This is commented out AND no service listens for it
```

### Gap 3: No listener for ticket invalidation
```typescript
const invalidationEvent = {
  type: 'EVENT_CANCELLED_TICKETS_INVALID',
  eventId,
  tenantId,
};
// In production: await messageQueue.publish('tickets', invalidationEvent);
// ↑ This is commented out AND no service listens for it
```

### Gap 4: NFTs never burned

No code exists to:
- Burn NFTs on blockchain
- Invalidate NFTs on blockchain
- Mark tickets as invalid on-chain

---

## What Works

| Component | Status |
|-----------|--------|
| Cancel event endpoint | ✅ Exists |
| Permission validation | ✅ Works |
| Cancellation deadline check | ✅ Works |
| Update event status | ✅ Works |
| Audit logging | ✅ Works |
| Notification handler | ✅ Exists in notification-service |

### What's Broken

| Component | Status |
|-----------|--------|
| Trigger mass refunds | ❌ Not implemented |
| Get tickets for event | ❌ Placeholder (empty array) |
| Invalidate tickets | ❌ Not implemented |
| Cancel resale listings | ❌ Not implemented |
| Burn/invalidate NFTs | ❌ Not implemented |
| Message queue publishing | ❌ Commented out |
| Refund event listener | ❌ Doesn't exist |

---

## Order-Service Event Subscriber

**File:** `backend/services/order-service/src/events/event-subscriber.ts`
```typescript
switch (event.type) {
  case 'payment.succeeded':
    await this.handlePaymentSucceeded(event);
    break;
  case 'payment.failed':
    await this.handlePaymentFailed(event);
    break;
  default:
    logger.debug('Unhandled event type', { type: event.type });
}
```

**Missing:** No handler for `EVENT_CANCELLED_REFUND_REQUEST`

---

## Notification Service Handler

**File:** `backend/services/notification-service/src/events/event-handler.ts`
```typescript
case 'event.cancelled':
  await this.handleEventCancelled(event as EventCancelledEvent);
  break;
```

This EXISTS and sends `event_cancelled` email template.

**But:** The event is never published to reach this handler.

---

## The Fix

### Option 1: Use EventCancellationService
```typescript
// In cancellation.controller.ts
import { eventCancellationService } from '../services/event-cancellation.service';

// Replace CancellationService with:
const result = await eventCancellationService.cancelEvent(
  eventId,
  tenantId,
  {
    reason: cancellation_reason,
    refundPolicy: 'full',
    notifyHolders: true,
    cancelResales: true,
    cancelledBy: userId,
  }
);
```

### Option 2: Implement missing pieces

1. **getEventTickets** - Call ticket-service internal API
2. **Message queue** - Actually publish events
3. **Refund listener** - Add to order-service or payment-service
4. **Ticket invalidation** - Add to ticket-service
5. **Resale cancellation** - Add to marketplace-service
6. **NFT burning** - Add blockchain call

---

## Files That Need Changes

### Critical (Refunds Don't Happen)

| File | Change | Priority |
|------|--------|----------|
| `event-service/src/controllers/cancellation.controller.ts` | Use EventCancellationService | P0 |
| `event-service/src/services/event-cancellation.service.ts` | Implement getEventTickets | P0 |
| `event-service/src/services/event-cancellation.service.ts` | Uncomment message publishing | P0 |
| `order-service/src/events/event-subscriber.ts` | Add EVENT_CANCELLED handler | P0 |
| `payment-service` | Add mass refund endpoint | P0 |

### High (Tickets Not Invalidated)

| File | Change | Priority |
|------|--------|----------|
| `ticket-service` | Add event cancellation handler | P1 |
| `marketplace-service` | Add listing cancellation handler | P1 |

### Medium (NFTs Not Burned)

| File | Change | Priority |
|------|--------|----------|
| `ticket-service` or `minting-service` | Add NFT burn logic | P2 |
| `blockchain integration` | Implement burn on Solana | P2 |

---

## Database Impact

When event is cancelled:

**events table:**
```sql
UPDATE events SET
  status = 'CANCELLED',
  cancelled_at = NOW(),
  cancelled_by = :userId,
  cancellation_reason = :reason
WHERE id = :eventId;
```

**What SHOULD also happen:**
```sql
-- tickets table
UPDATE tickets SET status = 'CANCELLED' WHERE event_id = :eventId;

-- orders table
UPDATE orders SET status = 'REFUND_INITIATED' WHERE event_id = :eventId;

-- marketplace_listings table
UPDATE marketplace_listings SET status = 'cancelled' WHERE event_id = :eventId;
```

None of these happen currently.

---

## Summary

| Aspect | Status |
|--------|--------|
| Cancel event endpoint | ✅ Works |
| Event status update | ✅ Works |
| Audit logging | ✅ Works |
| Full workflow service | ⚠️ Exists but not used |
| Mass refunds | ❌ Not implemented |
| Ticket invalidation | ❌ Not implemented |
| Resale cancellation | ❌ Not implemented |
| User notifications | ❌ Event never published |
| NFT burning | ❌ Not implemented |

---

## Related Documents

- `REFUND_CANCELLATION_FLOW_AUDIT.md` - Individual refund flow
- `PRIMARY_PURCHASE_FLOW_AUDIT.md` - Original ticket purchase
- `TICKET_SCANNING_FLOW_AUDIT.md` - Should reject cancelled event tickets

