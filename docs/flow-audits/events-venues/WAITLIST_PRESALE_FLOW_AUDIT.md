# WAITLIST/PRESALE FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | December 31, 2024 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Waitlist & Presale |

---

## Executive Summary

**PARTIAL IMPLEMENTATION**

| Component | Status |
|-----------|--------|
| Waitlist table | ✅ Schema exists |
| Waitlist service | ❌ NOT IMPLEMENTED |
| Waitlist routes | ❌ NOT IMPLEMENTED |
| Early bird pricing | ✅ Works |
| Last minute pricing | ✅ Works |
| Sales windows | ✅ Works |
| Access codes/presale codes | ❌ NOT IMPLEMENTED |

**Bottom Line:** The database schema for waitlist exists, but there's NO service or API to use it. Early bird/last minute pricing works through the pricing service.

---

## Files Verified

| Component | File | Status |
|-----------|------|--------|
| Waitlist Table | ticket-service/migrations/001_baseline_ticket.ts | ✅ Schema exists |
| Waitlist Service | - | ❌ Does not exist |
| Waitlist Routes | - | ❌ Does not exist |
| Pricing Service | event-service/services/pricing.service.ts | ✅ Verified |
| Pricing Schema | event-service/schemas/pricing.schema.ts | ✅ Verified |
| Event Pricing Model | event-service/models/event-pricing.model.ts | ✅ Verified |
| Event Pricing Table | event-service/migrations/001_baseline_event.ts | ✅ Verified |

---

## What Exists

### 1. Waitlist Database Table

**Location:** `ticket-service/migrations/001_baseline_ticket.ts`
```sql
CREATE TABLE waitlist (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  ticket_type_id UUID NOT NULL,
  user_id UUID NOT NULL,
  quantity INTEGER NOT NULL,
  status ENUM('active', 'notified', 'expired', 'converted') DEFAULT 'pending',
  notified_at TIMESTAMP,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Foreign keys
FOREIGN KEY (ticket_type_id) REFERENCES ticket_types(id) ON DELETE CASCADE
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE

-- Indexes
CREATE INDEX idx_waitlist_tenant_type_status ON waitlist(tenant_id, ticket_type_id, status);
CREATE INDEX idx_waitlist_created_at ON waitlist(created_at);
```

### 2. Early Bird Pricing

**Location:** `event-service/services/pricing.service.ts`
```typescript
async applyEarlyBirdPricing(eventId: string, tenantId: string): Promise<void> {
  const now = new Date();

  // Find pricing with early bird rates that are still active
  const earlyBirdPricing = await this.db('event_pricing')
    .where({ event_id: eventId, tenant_id: tenantId })
    .whereNotNull('early_bird_price')
    .whereNotNull('early_bird_ends_at')
    .where('early_bird_ends_at', '>', now)
    .select('*');

  for (const pricing of earlyBirdPricing) {
    await this.updatePricing(pricing.id, {
      current_price: pricing.early_bird_price
    }, tenantId);
  }
}
```

### 3. Last Minute Pricing
```typescript
async applyLastMinutePricing(eventId: string, tenantId: string): Promise<void> {
  const now = new Date();

  // Find pricing with last minute rates that should be active
  const lastMinutePricing = await this.db('event_pricing')
    .where({ event_id: eventId, tenant_id: tenantId })
    .whereNotNull('last_minute_price')
    .whereNotNull('last_minute_starts_at')
    .where('last_minute_starts_at', '<=', now)
    .select('*');

  for (const pricing of lastMinutePricing) {
    await this.updatePricing(pricing.id, {
      current_price: pricing.last_minute_price
    }, tenantId);
  }
}
```

### 4. Sales Windows

**Location:** `event-service/services/pricing.service.ts`
```typescript
async getActivePricing(eventId: string, tenantId: string): Promise<IEventPricing[]> {
  const now = new Date();

  const pricing = await this.db('event_pricing')
    .where({ event_id: eventId, tenant_id: tenantId, is_active: true, is_visible: true })
    .where(function() {
      this.whereNull('sales_start_at')
        .orWhere('sales_start_at', '<=', now);  // Sales have started
    })
    .where(function() {
      this.whereNull('sales_end_at')
        .orWhere('sales_end_at', '>=', now);    // Sales haven't ended
    })
    .orderBy('display_order', 'asc')
    .select('*');

  return pricing;
}
```

---

## Event Pricing Schema

### Database Fields

| Field | Type | Purpose |
|-------|------|---------|
| `base_price` | DECIMAL | Regular price |
| `current_price` | DECIMAL | Active price (may differ from base) |
| `early_bird_price` | DECIMAL | Discounted early price |
| `early_bird_ends_at` | TIMESTAMP | When early bird ends |
| `last_minute_price` | DECIMAL | Price close to event |
| `last_minute_starts_at` | TIMESTAMP | When last minute starts |
| `sales_start_at` | TIMESTAMP | When sales open |
| `sales_end_at` | TIMESTAMP | When sales close |
| `max_per_order` | INTEGER | Max tickets per order |
| `max_per_customer` | INTEGER | Max tickets per customer |
| `group_size_min` | INTEGER | Minimum for group discount |
| `group_discount_percentage` | DECIMAL | Group discount rate |

### Price Types

| Type | Condition |
|------|-----------|
| Early Bird | `NOW() < early_bird_ends_at` |
| Regular | `early_bird_ends_at <= NOW() < last_minute_starts_at` |
| Last Minute | `NOW() >= last_minute_starts_at` |

---

## What's Missing

### 1. Waitlist Service ❌

No service exists to:
- Add users to waitlist
- Notify users when tickets available
- Convert waitlist to purchases
- Manage waitlist priority

**Would need:**
```typescript
// DOES NOT EXIST
class WaitlistService {
  async joinWaitlist(userId, ticketTypeId, quantity, tenantId);
  async leaveWaitlist(waitlistId, userId, tenantId);
  async getWaitlistPosition(waitlistId, tenantId);
  async notifyWaitlistUsers(ticketTypeId, availableQuantity, tenantId);
  async convertToPurchase(waitlistId, tenantId);
  async expireOldEntries(tenantId);
}
```

### 2. Waitlist Routes ❌

No API endpoints exist:
```
POST   /waitlist              - Join waitlist
DELETE /waitlist/:id          - Leave waitlist
GET    /waitlist/position/:id - Check position
GET    /waitlist/my           - User's waitlist entries
```

### 3. Presale/Access Codes ❌

No mechanism for:
- Presale access codes
- Early access for members
- Unlock codes for special pricing
- Fan club presales

**Would need:**
```typescript
// DOES NOT EXIST
interface AccessCode {
  code: string;
  event_id: string;
  pricing_id: string;
  valid_from: Date;
  valid_until: Date;
  max_uses: number;
  uses_remaining: number;
}
```

### 4. Waitlist Notification Integration ❌

When tickets become available:
- No event published
- No notification sent
- No automatic waitlist processing

---

## Current Flow vs. Ideal Flow

### Current: Early Bird Pricing
```
1. Event created with early_bird_price and early_bird_ends_at
         ↓
2. Admin manually calls applyEarlyBirdPricing() (or scheduled job?)
         ↓
3. current_price updated to early_bird_price
         ↓
4. Users see discounted price
         ↓
5. After early_bird_ends_at, price reverts (manually? automatically?)
```

**Issue:** No automatic price switching - requires manual intervention or cron job.

### Ideal: Full Waitlist Flow
```
1. User tries to buy sold-out ticket
         ↓
2. POST /waitlist - User joins waitlist
         ↓
3. Tickets released/cancelled
         ↓
4. System detects availability
         ↓
5. Waitlist users notified (by priority)
         ↓
6. User has X minutes to complete purchase
         ↓
7. If not purchased, next user notified
```

---

## What Works ✅

| Component | Status |
|-----------|--------|
| Early bird price field | ✅ In schema |
| Last minute price field | ✅ In schema |
| Sales start/end dates | ✅ In schema |
| getActivePricing() | ✅ Respects sales windows |
| applyEarlyBirdPricing() | ✅ Method exists |
| applyLastMinutePricing() | ✅ Method exists |
| max_per_order limit | ✅ In schema |
| max_per_customer limit | ✅ In schema |
| Group discounts | ✅ In schema |

## What's Missing ❌

| Component | Status |
|-----------|--------|
| Waitlist service | ❌ Not implemented |
| Waitlist routes | ❌ Not implemented |
| Waitlist notifications | ❌ Not implemented |
| Presale access codes | ❌ Not implemented |
| Automatic price switching | ❌ Not implemented |
| Member early access | ❌ Not implemented |

---

## Implementation Effort

### To Build Waitlist Feature

| Task | Effort |
|------|--------|
| WaitlistService | 2-3 days |
| Waitlist routes | 1 day |
| Notification integration | 1-2 days |
| Automatic processing worker | 1-2 days |
| **Total** | **5-8 days** |

### To Build Presale Codes

| Task | Effort |
|------|--------|
| access_codes table | 0.5 day |
| AccessCodeService | 1-2 days |
| Integration with purchase flow | 1-2 days |
| **Total** | **2.5-4.5 days** |

---

## Summary

| Aspect | Status |
|--------|--------|
| Waitlist schema | ✅ Exists |
| Waitlist functionality | ❌ Missing |
| Early bird pricing | ⚠️ Schema only, no automation |
| Last minute pricing | ⚠️ Schema only, no automation |
| Sales windows | ✅ Works |
| Presale codes | ❌ Missing |
| Purchase limits | ✅ In schema |

**Bottom Line:** The pricing framework supports time-based pricing, but waitlist and presale code features are not implemented despite having database tables.

---

## Related Documents

- `PRIMARY_PURCHASE_FLOW_AUDIT.md` - Purchase flow
- `NOTIFICATION_FLOW_AUDIT.md` - Would send waitlist notifications

