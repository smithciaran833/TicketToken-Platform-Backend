# REFUND/CANCELLATION FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | December 31, 2024 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Refund/Cancellation |

---

## Executive Summary

**CRITICAL FINDINGS:**

1. **Order-service calls 5 ticket-service endpoints that DON'T EXIST** - refunds will fail
2. **NFTs are never burned/invalidated** on blockchain when refunded
3. **Stripe refund works** - payment-service properly calls Stripe API
4. **Ticket cancellation exists** but requires internal endpoint that order-service doesn't call correctly

---

## The Refund Flow (As Designed)
```
User requests refund
        ↓
order-service validates order
        ↓
order-service calls ticket-service to release tickets
        ↓
order-service calls payment-service to refund Stripe
        ↓
Tickets marked as cancelled
        ↓
NFT burned on blockchain
        ↓
Money returned to user
```

---

## What Actually Happens
```
User requests refund
        ↓
order-service validates order ✅
        ↓
order-service calls ticket-service /internal/tickets/release ❌ 404 NOT FOUND
        ↓
FLOW FAILS HERE
```

---

## The Endpoint Mismatch (Same as Primary Purchase)

### Order-service Calls These Endpoints:

| Endpoint | Purpose | EXISTS? |
|----------|---------|---------|
| `POST /internal/tickets/availability` | Check stock | ❌ NO |
| `POST /internal/tickets/reserve` | Reserve tickets | ❌ NO |
| `POST /internal/tickets/confirm` | Confirm allocation | ❌ NO |
| `POST /internal/tickets/release` | Release/cancel tickets | ❌ NO |
| `POST /internal/tickets/prices` | Get prices | ❌ NO |

### Ticket-service Actually Has:

| Endpoint | Purpose | CALLED BY ORDER-SERVICE? |
|----------|---------|--------------------------|
| `GET /internal/tickets/:ticketId/status` | Check single ticket | ❌ No |
| `POST /internal/tickets/cancel-batch` | Cancel multiple tickets | ❌ No |
| `POST /internal/tickets/calculate-price` | Calculate refund amount | ❌ No |

---

## Detailed Flow Analysis

### Step 1: Cancel Order Request

**Endpoint:** `POST /orders/:orderId/cancel`

**File:** `backend/services/order-service/src/controllers/order.controller.ts`
```typescript
async cancelOrder(request, reply) {
  const result = await this.orderService.cancelOrder(tenantId, {
    orderId,
    userId,
    reason: reason || 'User cancelled',
  });
  // ...
}
```

**Status:** ✅ Controller works

---

### Step 2: Order Service Cancel Logic

**File:** `backend/services/order-service/src/services/order.service.ts`
```typescript
async cancelOrder(tenantId, request) {
  // 1. Release tickets
  await this.ticketClient.releaseTickets(order.id);  // ❌ FAILS - endpoint doesn't exist

  // 2. Handle payment refund if payment was made
  if (order.status === OrderStatus.CONFIRMED && order.paymentIntentId) {
    const refundResult = await this.paymentClient.initiateRefund({...});  // Would work if we got here
    // ...
  }
  
  // 3. Update order to CANCELLED
  const updatedOrder = await this.orderModel.update(...);
}
```

**Status:** ❌ Fails at step 1

---

### Step 3: Ticket Release (BROKEN)

**File:** `backend/services/order-service/src/services/ticket.client.ts`
```typescript
async releaseTickets(orderId: string): Promise<void> {
  await axios.post(`${TICKET_SERVICE_URL}/internal/tickets/release`, {
    orderId,
  });
}
```

**Calls:** `POST /internal/tickets/release`

**Reality:** This endpoint DOES NOT EXIST in ticket-service

**Status:** ❌ 404 Error

---

### Step 4: Refund Order Request

**Endpoint:** `POST /orders/:orderId/refund`

**File:** `backend/services/order-service/src/services/order.service.ts`
```typescript
async refundOrder(tenantId, request) {
  // 1. Initiate refund with payment service
  const refundResult = await this.paymentClient.initiateRefund({
    orderId: order.id,
    paymentIntentId: order.paymentIntentId,
    amountCents: request.amountCents,
    reason: request.reason,
  });

  // 2. Create refund record
  const refund = await this.orderRefundModel.create({...});

  // 3. Update order status
  const updatedOrder = await this.orderModel.update(order.id, tenantId, {
    status: OrderStatus.REFUNDED,
    refundedAt: new Date(),
  });
}
```

**Note:** Refund flow does NOT call ticket-service to release tickets!

**Status:** ⚠️ Partial - refunds payment but doesn't cancel tickets

---

### Step 5: Payment Service Refund

**File:** `backend/services/payment-service/src/controllers/refundController.ts`
```typescript
// REAL Stripe refund
stripeRefund = await stripe.refunds.create({
  payment_intent: paymentIntentId,
  amount: amount,
  reason: reason || 'requested_by_customer',
}, {
  idempotencyKey: idempotencyKey,
});
```

**Status:** ✅ Works - Actually calls Stripe API

---

## What's Missing

### Gap 1: Missing Internal Endpoints

**5 endpoints need to be created in ticket-service:**
```typescript
// In ticket-service/src/routes/internalRoutes.ts

POST /internal/tickets/availability
POST /internal/tickets/reserve
POST /internal/tickets/confirm
POST /internal/tickets/release  ← Critical for refunds
POST /internal/tickets/prices
```

### Gap 2: Tickets Not Cancelled on Refund

The `refundOrder` method in order-service:
- ✅ Calls payment-service to refund Stripe
- ❌ Does NOT call ticket-service to cancel tickets
- ❌ Tickets remain in database with original status

**Fix needed:**
```typescript
// In refundOrder(), add:
await this.ticketClient.cancelTickets(orderId);
```

### Gap 3: NFT Never Burned

When a ticket is refunded:
- Database: ticket status → CANCELLED ✅ (if endpoint existed)
- Blockchain: NFT still exists with original owner ❌

**No burn/invalidate logic exists anywhere.**

---

## What Works

| Component | Status |
|-----------|--------|
| Cancel order endpoint | ✅ Exists |
| Refund order endpoint | ✅ Exists |
| Partial refund endpoint | ✅ Exists |
| Payment refund (Stripe) | ✅ Works |
| Refund with retry logic | ✅ Works |
| Idempotency on refunds | ✅ Works |
| Audit logging | ✅ Works |
| Order status update | ✅ Works |

### What's Broken

| Component | Status |
|-----------|--------|
| Release tickets on cancel | ❌ Endpoint missing |
| Cancel tickets on refund | ❌ Not called |
| NFT burn on refund | ❌ Not implemented |
| Event cancellation → mass refund | ❌ Not traced |

---

## Ticket-Service Refund Handler

**File:** `backend/services/ticket-service/src/services/refundHandler.ts`

This exists but uses outbox pattern:
```typescript
async initiateRefund(orderId: string, reason: string) {
  // Update order status
  await db.query(
    `UPDATE orders SET status = 'REFUND_INITIATED'...`
  );

  // Queue refund request to payment service via outbox
  await db.query(
    `INSERT INTO outbox (event_type, payload) VALUES ('refund.requested', ...)`
  );
}
```

**Problem:** This is a separate flow from order-service's refund. Two different refund systems!

---

## Event Cancellation (Not Traced)

When an entire event is cancelled:
- All tickets should be refunded
- All NFTs should be burned
- All orders should be cancelled

**This flow was not found in the codebase.**

---

## Blockchain Impact

### Current State
```
Ticket refunded in database
        ↓
NFT still exists on Solana
        ↓
User could potentially still use ticket
        ↓
Or sell NFT on external marketplace
```

### What Should Happen
```
Ticket refunded in database
        ↓
Call blockchain to burn/invalidate NFT
        ↓
NFT marked as invalid on-chain
        ↓
Scanning rejects invalid NFT
```

---

## Files That Need Changes

### Critical (Flow Broken)

| File | Change | Priority |
|------|--------|----------|
| `ticket-service/src/routes/internalRoutes.ts` | Add 5 missing endpoints | P0 |
| `order-service/src/services/order.service.ts` | Call ticket cancel on refund | P0 |

### High (NFT Not Invalidated)

| File | Change | Priority |
|------|--------|----------|
| `ticket-service/src/services/ticketService.ts` | Add burn NFT on cancel | P1 |
| `blockchain-service` or `minting-service` | Add burn endpoint | P1 |

### Medium (Missing Features)

| File | Change | Priority |
|------|--------|----------|
| `event-service` | Add event cancellation flow | P2 |
| `order-service` | Add mass refund for event cancellation | P2 |

---

## The Two Refund Systems Problem

### System 1: order-service refund
- Endpoint: `POST /orders/:orderId/refund`
- Calls payment-service directly
- Does NOT cancel tickets

### System 2: ticket-service refundHandler
- Uses outbox pattern
- Queues refund to payment-service
- Updates order status

**These are not connected!**

---

## Dependency Chain
```
1. Create missing internal endpoints in ticket-service
         ↓
2. Order cancel/refund can release tickets
         ↓
3. Add NFT burn call when ticket cancelled
         ↓
4. Need real NFTs first (currently fake)
         ↓
5. Add event cancellation → mass refund
```

---

## Summary

| Aspect | Status |
|--------|--------|
| Refund request endpoint | ✅ Works |
| Stripe refund | ✅ Works |
| Ticket release on cancel | ❌ Endpoint missing |
| Ticket cancel on refund | ❌ Not called |
| NFT burn/invalidate | ❌ Not implemented |
| Event mass cancellation | ❌ Not implemented |
| Two disconnected refund systems | ⚠️ Problem |

---

## Related Documents

- `PRIMARY_PURCHASE_FLOW_AUDIT.md` - Same missing endpoints
- `VENUE_PAYOUT_FLOW_AUDIT.md` - Venue balance adjustment on refund?
- `TICKET_SCANNING_FLOW_AUDIT.md` - Should reject refunded tickets

