# CAPACITY MANAGEMENT FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Capacity Management |

---

## Executive Summary

**WORKING - Full capacity management with reservations**

| Component | Status |
|-----------|--------|
| Get event capacity | ✅ Working |
| Get total capacity | ✅ Working |
| Get capacity by ID | ✅ Working |
| Create capacity section | ✅ Working |
| Update capacity | ✅ Working |
| Check availability | ✅ Working |
| Reserve capacity (cart) | ✅ Working |
| Idempotency support | ✅ Working |
| Price locking | ✅ Working |
| Tenant isolation | ✅ Working |

**Bottom Line:** Full capacity management system for events with section-based capacity tracking, real-time availability checks, temporary reservations for cart checkout, and price locking to prevent price changes during checkout.

---

## API Endpoints

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/events/:eventId/capacity` | GET | Get all sections | ✅ Working |
| `/events/:eventId/capacity/total` | GET | Get totals | ✅ Working |
| `/capacity/:id` | GET | Get section | ✅ Working |
| `/events/:eventId/capacity` | POST | Create section | ✅ Working |
| `/capacity/:id` | PUT | Update section | ✅ Working |
| `/capacity/:id/check` | POST | Check availability | ✅ Working |
| `/capacity/:id/reserve` | POST | Reserve for cart | ✅ Working |

---

## Implementation Details

### Get Event Capacity
```typescript
export async function getEventCapacity(request, reply) {
  const { eventId } = request.params;
  const tenantId = request.tenantId;

  const capacityService = new CapacityService(db);
  const sections = await capacityService.getEventCapacity(eventId, tenantId);

  return reply.send({ capacity: sections });
}
```

### Get Total Capacity
```typescript
export async function getTotalCapacity(request, reply) {
  const { eventId } = request.params;
  const capacityService = new CapacityService(db);
  const sections = await capacityService.getEventCapacity(eventId, tenantId);

  const totals = sections.reduce((acc, section) => ({
    total_capacity: acc.total_capacity + section.total_capacity,
    available_capacity: acc.available_capacity + section.available_capacity,
    reserved_capacity: acc.reserved_capacity + section.reserved_capacity,
    sold_count: acc.sold_count + section.sold_count
  }), { total_capacity: 0, available_capacity: 0, reserved_capacity: 0, sold_count: 0 });

  return reply.send(totals);
}
```

### Check Availability
```typescript
export async function checkAvailability(request, reply) {
  const { id } = request.params;
  const { quantity } = request.body;

  if (!quantity || quantity < 1) {
    throw createProblemError(400, 'INVALID_QUANTITY', 'Quantity must be at least 1');
  }

  const capacityService = new CapacityService(db);
  const available = await capacityService.checkAvailability(id, quantity, tenantId);

  return reply.send({ available, quantity });
}
```

### Reserve Capacity (Cart)
```typescript
export async function reserveCapacity(request, reply) {
  const { id } = request.params;
  const { quantity, reservation_minutes = 15, pricing_id } = request.body;

  const capacityService = new CapacityService(db);
  const capacity = await capacityService.reserveCapacity(
    id,
    quantity,
    tenantId,
    reservation_minutes,
    pricing_id,
    authToken
  );

  // Get locked price if pricing_id was provided
  let lockedPrice = null;
  if (pricing_id && capacity.locked_price_data) {
    lockedPrice = await capacityService.getLockedPrice(id, tenantId);
  }

  return reply.send({
    message: 'Capacity reserved successfully',
    capacity,
    locked_price: lockedPrice
  });
}
```

---

## Capacity Model
```typescript
interface CapacitySection {
  id: string;
  event_id: string;
  section_name: string;
  section_code?: string;
  total_capacity: number;
  available_capacity: number;
  reserved_capacity: number;    // Temporary cart reservations
  sold_count: number;
  is_active: boolean;
  schedule_id?: string;         // For multi-day events
  locked_price_data?: any;      // Price locked during checkout
  tenant_id: string;
  created_at: Date;
  updated_at: Date;
}
```

---

## Reservation Flow
```
1. User adds to cart
   → POST /capacity/:id/reserve { quantity: 2, reservation_minutes: 15 }
   
2. System reserves capacity
   → available_capacity -= 2
   → reserved_capacity += 2
   → Returns locked_price if pricing_id provided

3. User completes checkout
   → reserved_capacity -= 2
   → sold_count += 2

4. Reservation expires (15 min)
   → reserved_capacity -= 2
   → available_capacity += 2
```

---

## Features

### Idempotency

Routes use `idempotencyPreHandler` to prevent duplicate reservations:
```typescript
app.post('/events/:eventId/capacity', {
  preHandler: [authenticateFastify, tenantHook, idempotencyPreHandler],
  ...
});
```

### Price Locking

When reserving with `pricing_id`, the current price is locked to prevent price changes during checkout.

### Tenant Isolation

All queries include `tenant_id` for multi-tenant isolation.

---

## Files Involved

| File | Purpose |
|------|---------|
| `event-service/src/routes/capacity.routes.ts` | Routes |
| `event-service/src/controllers/capacity.controller.ts` | Controller |
| `event-service/src/services/capacity.service.ts` | Service |
| `event-service/src/schemas/capacity.schema.ts` | Validation |

---

## Related Documents

- `INVENTORY_MANAGEMENT_FLOW_AUDIT.md` - Ticket inventory
- `CART_CHECKOUT_FLOW_AUDIT.md` - Cart flow
- `DYNAMIC_PRICING_FLOW_AUDIT.md` - Price locking
