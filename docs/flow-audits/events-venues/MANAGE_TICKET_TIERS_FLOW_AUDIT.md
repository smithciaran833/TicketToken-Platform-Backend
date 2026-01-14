# MANAGE TICKET TIERS FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Manage Ticket Tiers (Types) |

---

## Executive Summary

**MOSTLY WORKING - CRUD exists, missing delete and sales validation**

| Component | Status |
|-----------|--------|
| List ticket types | ✅ Working |
| Create ticket type | ✅ Working |
| Update ticket type | ✅ Working |
| Delete ticket type | ❌ Not implemented |
| Early bird pricing | ✅ Working |
| Last minute pricing | ✅ Working |
| Dynamic price updates | ✅ Working |
| Validation if tickets sold | ⚠️ Noted but not enforced |
| is_active / is_visible flags | ✅ Working |

**Bottom Line:** Ticket tier (pricing) management is functional with create, read, and update operations. Early bird and last minute pricing features work. Missing: delete endpoint and validation to prevent price changes after tickets are sold.

---

## API Endpoints

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/events/:id/ticket-types` | GET | List ticket types | ✅ Working |
| `/events/:id/ticket-types` | POST | Create ticket type | ✅ Working |
| `/events/:id/ticket-types/:typeId` | PUT | Update ticket type | ✅ Working |
| `/events/:id/ticket-types/:typeId` | DELETE | Delete ticket type | ❌ Missing |

---

## Create Ticket Type

**Endpoint:** `POST /api/v1/events/:id/ticket-types`

**Schema:**
```typescript
{
  name: string;           // Required, 3-255 chars
  description?: string;
  base_price: number;     // Required, >= 0
  capacity_id?: string;   // UUID
  schedule_id?: string;   // UUID
  currency?: string;      // 3 chars, default 'USD'
  service_fee?: number;
  facility_fee?: number;
  tax_rate?: number;      // 0-1
  max_per_order?: number;
  tier?: string;
  metadata?: object;
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "event_id": "uuid",
    "name": "VIP",
    "base_price": 150.00,
    "is_active": true,
    "is_visible": true
  }
}
```

---

## Update Ticket Type

**Endpoint:** `PUT /api/v1/events/:id/ticket-types/:typeId`

**Schema:**
```typescript
{
  name?: string;
  description?: string;
  base_price?: number;
  service_fee?: number;
  facility_fee?: number;
  tax_rate?: number;
  currency?: string;
  max_per_order?: number;
  tier?: string;
  is_active?: boolean;    // Can deactivate
  is_visible?: boolean;   // Can hide from display
  metadata?: object;
}
```

**Note from code:**
```typescript
// Note: In production, you'd want to check if tickets have been sold
// via the ticket service before allowing certain updates
// For now, we'll allow all updates
```

---

## Pricing Features

### Early Bird Pricing

**File:** `backend/services/event-service/src/services/pricing.service.ts`
```typescript
async applyEarlyBirdPricing(eventId: string, tenantId: string): Promise<void> {
  const now = new Date();
  const earlyBirdPricing = await this.db('event_pricing')
    .where({ event_id: eventId, tenant_id: tenantId })
    .whereNotNull('early_bird_price')
    .whereNotNull('early_bird_end_date')
    .where('early_bird_end_date', '>', now);

  for (const pricing of earlyBirdPricing) {
    await this.updatePricing(pricing.id, {
      current_price: pricing.early_bird_price
    }, tenantId);
  }
}
```

### Last Minute Pricing
```typescript
async applyLastMinutePricing(eventId: string, tenantId: string): Promise<void> {
  const now = new Date();
  const lastMinutePricing = await this.db('event_pricing')
    .where({ event_id: eventId, tenant_id: tenantId })
    .whereNotNull('last_minute_price')
    .whereNotNull('last_minute_start_date')
    .where('last_minute_start_date', '<=', now);

  for (const pricing of lastMinutePricing) {
    await this.updatePricing(pricing.id, {
      current_price: pricing.last_minute_price
    }, tenantId);
  }
}
```

### Dynamic Price Updates
```typescript
async updateDynamicPrice(pricingId: string, newPrice: number, tenantId: string) {
  return this.updatePricing(pricingId, { current_price: newPrice }, tenantId);
}
```

---

## What's Missing

### 1. Delete Ticket Type

No endpoint exists to delete a ticket type. Would need:
- Check if any tickets sold for this type
- Soft delete or hard delete based on sales
- Cascade considerations

### 2. Sales Validation on Update

The code notes this should be added:
```typescript
// Note: In production, you'd want to check if tickets have been sold
// via the ticket service before allowing certain updates
```

Should prevent:
- Price increases after sales
- Capacity reduction below sold count
- Deactivation if tickets sold

---

## Recommendations

### P2 - Add Missing Features

| Task | Effort |
|------|--------|
| Add delete endpoint | 0.5 day |
| Add sales validation check | 0.5 day |
| Prevent price changes after sales | 0.25 day |
| **Total** | **1.25 days** |

---

## Files Involved

| File | Purpose |
|------|---------|
| `event-service/src/routes/tickets.routes.ts` | Route definitions |
| `event-service/src/controllers/tickets.controller.ts` | CRUD operations |
| `event-service/src/services/pricing.service.ts` | Business logic |
| `event-service/src/models/event-pricing.model.ts` | Database model |

---

## Related Documents

- `EVENT_CREATION_FLOW_AUDIT.md` - Event with ticket types
- `PRIMARY_PURCHASE_FLOW_AUDIT.md` - Purchasing tickets
- `DYNAMIC_PRICING_FLOW_AUDIT.md` - Price adjustments
