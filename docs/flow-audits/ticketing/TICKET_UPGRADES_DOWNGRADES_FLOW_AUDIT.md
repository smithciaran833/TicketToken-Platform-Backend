# TICKET UPGRADES/DOWNGRADES FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | December 31, 2024 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Ticket Upgrades & Downgrades |

---

## Executive Summary

**PARTIAL IMPLEMENTATION - Core exists, integrations missing**

| Component | Status |
|-----------|--------|
| `order_modifications` table | ✅ Complete schema |
| Modification types enum | ✅ Complete |
| Modification service | ✅ Complete |
| Routes for modifications | ✅ Complete |
| Validation schemas | ✅ Complete |
| Price calculation | ⚠️ Hardcoded to 0 (TODO) |
| Ticket-service integration | ❌ Not implemented |
| Payment processing for upgrades | ❌ Not implemented |
| Refund processing for downgrades | ❌ Not implemented |
| NFT/blockchain update | ❌ Not implemented |
| Seat change for upgrades | ❌ Not implemented |

**Bottom Line:** The order-service has a well-designed modification system with proper workflow (request → approve → process). However, critical integrations are missing: price fetching, payment collection, and ticket-service coordination.

---

## What Works ✅

### 1. Modification Types

**File:** `order-service/src/types/modification.types.ts`
```typescript
enum ModificationType {
  ADD_ITEM = 'ADD_ITEM',
  REMOVE_ITEM = 'REMOVE_ITEM',
  UPGRADE_ITEM = 'UPGRADE_ITEM',
  DOWNGRADE_ITEM = 'DOWNGRADE_ITEM',
  CHANGE_QUANTITY = 'CHANGE_QUANTITY',
}

enum ModificationStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED',
  FAILED = 'FAILED',
}
```

---

### 2. Database Schema

**File:** `order-service/src/migrations/001_baseline_orders.ts`
```sql
CREATE TABLE order_modifications (
  id UUID PRIMARY KEY,
  order_id UUID REFERENCES orders(id),
  tenant_id UUID NOT NULL,
  modification_type modification_type NOT NULL,
  status modification_status DEFAULT 'PENDING',
  original_item_id UUID REFERENCES order_items(id),
  new_item_id UUID,
  new_ticket_type_id UUID,
  quantity_change INTEGER DEFAULT 0,
  price_difference_cents INTEGER DEFAULT 0,
  additional_fees_cents INTEGER DEFAULT 0,
  total_adjustment_cents INTEGER DEFAULT 0,
  payment_intent_id VARCHAR(255),
  refund_id UUID REFERENCES order_refunds(id),
  requested_by UUID NOT NULL,
  approved_by UUID,
  rejected_by UUID,
  rejection_reason TEXT,
  reason TEXT,
  notes TEXT,
  metadata JSONB,
  requested_at TIMESTAMP,
  approved_at TIMESTAMP,
  rejected_at TIMESTAMP,
  completed_at TIMESTAMP
);
```

---

### 3. API Routes

**File:** `order-service/src/routes/order.routes.ts`

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/:orderId/modifications` | POST | Request modification | ✅ Works |
| `/:orderId/upgrade` | POST | Request upgrade | ✅ Works |
| `/:orderId/modifications` | GET | List modifications | ✅ Works |
| `/:orderId/modifications/:modificationId` | GET | Get modification | ✅ Works |

---

### 4. Modification Service

**File:** `order-service/src/services/order-modification.service.ts`

**Methods:**
| Method | Purpose | Status |
|--------|---------|--------|
| `requestModification()` | Create modification request | ✅ Works |
| `upgradeItem()` | Convenience for upgrade | ✅ Works |
| `approveModification()` | Approve pending mod | ✅ Works |
| `rejectModification()` | Reject with reason | ✅ Works |
| `processModification()` | Execute approved mod | ⚠️ Partial |
| `calculateModificationImpact()` | Calculate price diff | ❌ Broken |
| `getOrderModifications()` | List mods for order | ✅ Works |
| `getModification()` | Get single mod | ✅ Works |

---

### 5. Validation Schemas

**File:** `order-service/src/validators/modification.schemas.ts`
```typescript
// Modification request
{
  modificationType: 'UPGRADE_ITEM' | 'DOWNGRADE_ITEM' | ...,
  originalItemId: UUID,
  newTicketTypeId: UUID,
  quantityChange: number,
  reason: string (10-500 chars),
  notes: string (optional)
}

// Upgrade request
{
  originalItemId: UUID,
  newTicketTypeId: UUID,
  reason: string (10-500 chars),
  notes: string (optional)
}
```

---

## What's Broken/Missing ❌

### 1. Price Calculation Hardcoded

**File:** `order-service/src/services/order-modification.service.ts`
```typescript
async calculateModificationImpact(...) {
  // Get original item price
  const originalPrice = originalResult.rows[0]?.unit_price_cents || 0;

  // Get new ticket type price (would typically come from ticket service)
  // For now, we'll use a placeholder - in production, call ticket service
  const newPrice = 0; // TODO: Fetch from ticket service  ← HARDCODED!

  priceDifferenceCents = newPrice - originalPrice;
}
```

**Impact:** All upgrades/downgrades calculate as $0 price difference.

---

### 2. No Ticket-Service Integration

**Expected but missing:**
```typescript
// Should call ticket-service to get new ticket type price
const ticketServiceClient = new TicketServiceClient();
const newTicketType = await ticketServiceClient.getTicketType(newTicketTypeId);
const newPrice = newTicketType.price_cents;
```

**Current state:** Order-service has no client to ticket-service for price lookup.

---

### 3. No Payment Processing for Upgrades

**Expected but missing:**
```typescript
// When upgrade requires additional payment
if (calculation.requiresPayment) {
  const paymentIntent = await stripe.paymentIntents.create({
    amount: calculation.totalAdjustmentCents,
    currency: 'usd',
    customer: order.stripe_customer_id,
    metadata: { modificationId: modification.id }
  });
  
  // Wait for payment confirmation before processing
}
```

**Current state:** `requiresPayment` is calculated but never acted upon.

---

### 4. No Refund Processing for Downgrades

**Expected but missing:**
```typescript
// When downgrade requires refund
if (calculation.requiresRefund) {
  const refund = await stripe.refunds.create({
    payment_intent: order.paymentIntentId,
    amount: Math.abs(calculation.totalAdjustmentCents)
  });
  
  await db.query(
    'UPDATE order_modifications SET refund_id = $1 WHERE id = $2',
    [refund.id, modificationId]
  );
}
```

**Current state:** `requiresRefund` is calculated but never acted upon.

---

### 5. No Actual Ticket Update

**Expected but missing:**
```typescript
// After processing upgrade
await ticketService.updateTicketType(ticketId, newTicketTypeId);

// If new seat assignment needed
await ticketService.assignSeat(ticketId, newSectionId, newSeatId);
```

**Current state:** Only `order_items.ticket_type_id` is updated. The actual ticket in ticket-service is never modified.

---

### 6. No NFT/Blockchain Update

**Expected but missing:**
```typescript
// Update NFT metadata for upgraded ticket
await mintingService.updateNFTMetadata(ticketId, {
  tier: newTicketType.name,
  section: newSection,
  seat: newSeat
});
```

**Current state:** NFT would remain with original tier/metadata.

---

### 7. No Seat Change Logic

For tier upgrades (GA → VIP), user should get new seat assignment.

**Expected but missing:**
- Check seat availability in new tier
- Assign new seat
- Release old seat (if applicable)
- Update ticket with new seat info

---

## Workflow Analysis

### Current Flow (Partial)
```
1. User requests upgrade
   POST /orders/:orderId/upgrade
   { originalItemId, newTicketTypeId, reason }
         │
         ▼
2. Modification created (status: PENDING)
   - Price diff = $0 (hardcoded bug)
   - Stored in order_modifications table
         │
         ▼
3. Admin approves
   - Status → APPROVED
   - Auto-triggers processModification()
         │
         ▼
4. Process modification
   - Updates order_items.ticket_type_id ✅
   - Updates orders.total_cents ✅
   - Does NOT update actual ticket ❌
   - Does NOT collect payment ❌
   - Does NOT update NFT ❌
         │
         ▼
5. Status → COMPLETED
   (But ticket hasn't actually changed)
```

### Expected Flow (Complete)
```
1. User requests upgrade
         │
         ▼
2. Calculate price difference
   - Fetch new ticket type price from ticket-service
   - Calculate: newPrice - originalPrice + fees
         │
         ▼
3. If price increase:
   - Create PaymentIntent for difference
   - Return clientSecret to user
   - Wait for payment confirmation
         │
         ▼
4. If price decrease:
   - Process partial refund
         │
         ▼
5. Update ticket in ticket-service
   - Change ticket_type_id
   - Assign new seat if tier changed
         │
         ▼
6. Update NFT metadata (if applicable)
         │
         ▼
7. Notify user of completion
         │
         ▼
8. Mark modification COMPLETED
```

---

## Integration Points Missing

### 1. ticket-service Client
```typescript
// Needed in order-service
class TicketServiceClient {
  async getTicketType(ticketTypeId: string): Promise<TicketType>;
  async updateTicket(ticketId: string, updates: TicketUpdate): Promise<void>;
  async getAvailableSeats(eventId: string, ticketTypeId: string): Promise<Seat[]>;
  async assignSeat(ticketId: string, seatId: string): Promise<void>;
}
```

### 2. payment-service Integration
```typescript
// Needed for upgrade payments
async collectUpgradePayment(modificationId: string, amount: number): Promise<PaymentIntent>;
async processDowngradeRefund(modificationId: string, amount: number): Promise<Refund>;
```

### 3. Notification
```typescript
// User should be notified
await notificationService.send(userId, {
  type: 'TICKET_UPGRADED',
  data: { oldTier, newTier, pricePaid }
});
```

---

## What Would Need to Be Built

### Phase 1: Fix Price Calculation (2-3 days)

| Task | Effort |
|------|--------|
| Create TicketServiceClient in order-service | 1 day |
| Implement `getTicketType()` call | 0.5 day |
| Fix `calculateModificationImpact()` | 0.5 day |
| Add tests | 1 day |

### Phase 2: Payment Integration (3-4 days)

| Task | Effort |
|------|--------|
| Add Stripe upgrade payment flow | 1.5 days |
| Add partial refund for downgrades | 1 day |
| Add payment confirmation webhook handling | 1 day |
| Add tests | 0.5 day |

### Phase 3: Ticket Update (2-3 days)

| Task | Effort |
|------|--------|
| Add ticket update call to ticket-service | 1 day |
| Add seat reassignment logic | 1 day |
| Add NFT metadata update (if applicable) | 1 day |

### Phase 4: Notifications (1 day)

| Task | Effort |
|------|--------|
| Add notification events for modifications | 0.5 day |
| Add email templates | 0.5 day |

---

## Summary

| Aspect | Status |
|--------|--------|
| Modification types defined | ✅ Complete |
| Database schema | ✅ Complete |
| API routes | ✅ Complete |
| Request/approve/reject workflow | ✅ Complete |
| Validation schemas | ✅ Complete |
| Price calculation | ❌ Hardcoded to $0 |
| Ticket-service integration | ❌ Not implemented |
| Payment for upgrades | ❌ Not implemented |
| Refund for downgrades | ❌ Not implemented |
| Seat reassignment | ❌ Not implemented |
| NFT update | ❌ Not implemented |
| User notifications | ❌ Not implemented |

**Bottom Line:** The modification framework is well-designed with proper status workflow, but the actual business logic (pricing, payments, ticket updates) is not implemented. Users can request upgrades, admins can approve them, but nothing actually changes except a database field in order_items.

---

## Related Documents

- `PRIMARY_PURCHASE_FLOW_AUDIT.md` - Original purchase flow
- `REFUND_CANCELLATION_FLOW_AUDIT.md` - Refund processing
- `SEATED_TICKETS_FLOW_AUDIT.md` - Seat management
- `NFT_METADATA_COLLECTIBLES_FLOW_AUDIT.md` - NFT updates
