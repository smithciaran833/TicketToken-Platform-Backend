# MULTI-DAY/SEASON PASS FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | December 31, 2024 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Multi-day & Season Pass Handling |

---

## Executive Summary

**SCHEMA EXISTS - NO IMPLEMENTATION**

| Component | Status |
|-----------|--------|
| `ticket_bundles` table | ✅ Schema exists |
| `ticket_bundle_items` table | ✅ Schema exists |
| Event `recurring` type | ✅ Schema exists |
| Event `series` type | ✅ Schema exists |
| `event_schedules` with recurrence | ✅ Schema exists |
| Bundle service/routes | ❌ Not implemented |
| Season pass service/routes | ❌ Not implemented |
| Multi-day ticket validation | ❌ Not implemented |
| Pass-to-event linking | ❌ Not implemented |
| Recurring event generation | ❌ Not implemented |

**Bottom Line:** Database tables exist for bundles and recurring events, but there is zero application logic to create, purchase, or validate multi-day passes or season tickets.

---

## What Should Exist

### Multi-Day Pass
A ticket that grants access to multiple consecutive days of the same event (e.g., 3-day music festival).
```
┌─────────────────────────────────────────────────────────────┐
│                    MULTI-DAY PASS                            │
├─────────────────────────────────────────────────────────────┤
│  Pass ID: pass-001                                           │
│  Event: Summer Festival 2025                                 │
│  Valid Days:                                                 │
│    - Day 1: June 20, 2025                                   │
│    - Day 2: June 21, 2025                                   │
│    - Day 3: June 22, 2025                                   │
│  Access Level: GA                                            │
│  Can scan once per day                                       │
└─────────────────────────────────────────────────────────────┘
```

### Season Pass
A ticket that grants access to multiple different events (e.g., all home games for a sports team).
```
┌─────────────────────────────────────────────────────────────┐
│                    SEASON PASS                               │
├─────────────────────────────────────────────────────────────┤
│  Pass ID: season-001                                         │
│  Series: Lakers 2024-25 Season                              │
│  Valid Events: 41 home games                                 │
│  Seat: Section 101, Row A, Seat 5                           │
│  Can scan once per event                                     │
└─────────────────────────────────────────────────────────────┘
```

---

## What Exists (Schema Only)

### 1. ticket_bundles Table

**File:** `ticket-service/src/migrations/001_baseline_ticket.ts`
```sql
CREATE TABLE ticket_bundles (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL,
  discount_percentage DECIMAL(5, 2),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

**What it could support:**
- Bundle name and description
- Discounted pricing
- Active/inactive status

**What's missing:**
- `bundle_type` (multi-day, season, custom)
- `valid_from` / `valid_until`
- `max_uses` (how many times can be scanned)
- `event_series_id` (link to event series)

---

### 2. ticket_bundle_items Table
```sql
CREATE TABLE ticket_bundle_items (
  id UUID PRIMARY KEY,
  bundle_id UUID REFERENCES ticket_bundles(id),
  ticket_type_id UUID REFERENCES ticket_types(id),
  quantity INTEGER NOT NULL,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

**What it could support:**
- Linking bundles to ticket types
- Quantity per ticket type

**What's missing:**
- `event_schedule_id` (link to specific date)
- `access_date` (which day this item is for)
- `is_used` (has this specific item been scanned)

---

### 3. Event Types

**File:** `event-service/src/models/event.model.ts`
```typescript
event_type: 'single' | 'recurring' | 'series';
```

**Supported but not implemented:**
- `single` - One-time event ✅ Works
- `recurring` - Repeating event (weekly show) ❌ No logic
- `series` - Related events (season) ❌ No logic

---

### 4. Event Schedules with Recurrence

**File:** `event-service/src/models/event-schedule.model.ts`
```typescript
interface IEventSchedule {
  event_id: string;
  starts_at: Date;
  ends_at: Date;
  is_recurring?: boolean;
  recurrence_rule?: string;      // e.g., "FREQ=WEEKLY;BYDAY=FR"
  recurrence_end_date?: Date;
  occurrence_number?: number;
}
```

**Supported but not implemented:**
- Storing recurrence rules ✅
- Generating occurrences from rules ❌
- Linking tickets to specific occurrences ❌

---

## What's NOT Implemented

### 1. Bundle Service ❌

**Expected file:** `ticket-service/src/services/bundle.service.ts`

**Should have:**
```typescript
class BundleService {
  async createBundle(data: CreateBundleInput): Promise<Bundle>;
  async getBundle(bundleId: string): Promise<Bundle>;
  async purchaseBundle(userId: string, bundleId: string): Promise<Order>;
  async getBundleTickets(bundleId: string): Promise<Ticket[]>;
  async validateBundleAccess(ticketId: string, eventScheduleId: string): Promise<boolean>;
}
```

**Status:** Does not exist

---

### 2. Bundle Routes ❌

**Expected file:** `ticket-service/src/routes/bundleRoutes.ts`

**Should have:**
```typescript
// Admin routes
POST   /bundles                    // Create bundle
GET    /bundles                    // List bundles
GET    /bundles/:bundleId          // Get bundle details
PUT    /bundles/:bundleId          // Update bundle
DELETE /bundles/:bundleId          // Delete bundle

// User routes
GET    /bundles/available          // List purchasable bundles
POST   /bundles/:bundleId/purchase // Purchase a bundle
GET    /my-passes                  // Get user's passes/bundles
```

**Status:** Does not exist

---

### 3. Season Pass Service ❌

**Expected file:** `ticket-service/src/services/season-pass.service.ts`

**Should have:**
```typescript
class SeasonPassService {
  async createSeasonPass(eventSeriesId: string, data: SeasonPassInput): Promise<SeasonPass>;
  async assignSeat(passId: string, seatId: string): Promise<void>;
  async getPassEvents(passId: string): Promise<Event[]>;
  async checkEventAccess(passId: string, eventId: string): Promise<boolean>;
  async getAttendanceHistory(passId: string): Promise<Attendance[]>;
}
```

**Status:** Does not exist

---

### 4. Recurring Event Generation ❌

**Expected behavior:**
```typescript
// When creating a recurring event:
const event = await eventService.create({
  name: "Friday Night Jazz",
  event_type: "recurring",
  recurrence_rule: "FREQ=WEEKLY;BYDAY=FR;COUNT=52",
  starts_at: "2025-01-03T20:00:00Z"
});

// System should auto-generate:
// - 52 event_schedules (one per Friday)
// - Each with unique occurrence_number
```

**Current behavior:** 
- Can store `is_recurring` and `recurrence_rule`
- No code to generate occurrences
- No code to link tickets to occurrences

---

### 5. Multi-Day Validation ❌

**Expected in scanning service:**
```typescript
async validateMultiDayPass(ticketId: string, currentDate: Date): Promise<ValidationResult> {
  const ticket = await getTicket(ticketId);
  const bundle = await getBundle(ticket.bundle_id);
  
  // Check if this ticket is valid for today
  const todayItem = bundle.items.find(item => 
    isSameDay(item.access_date, currentDate)
  );
  
  if (!todayItem) {
    return { valid: false, reason: 'NOT_VALID_TODAY' };
  }
  
  if (todayItem.is_used) {
    return { valid: false, reason: 'ALREADY_SCANNED_TODAY' };
  }
  
  return { valid: true };
}
```

**Current behavior:**
- No multi-day awareness
- Ticket is either valid or used (no per-day tracking)

---

## Database Schema Gaps

### Missing columns on `ticket_bundles`:
```sql
ALTER TABLE ticket_bundles ADD COLUMN bundle_type VARCHAR(50);  -- 'multi_day', 'season', 'custom'
ALTER TABLE ticket_bundles ADD COLUMN event_series_id UUID;
ALTER TABLE ticket_bundles ADD COLUMN valid_from TIMESTAMP;
ALTER TABLE ticket_bundles ADD COLUMN valid_until TIMESTAMP;
ALTER TABLE ticket_bundles ADD COLUMN max_total_uses INTEGER;
ALTER TABLE ticket_bundles ADD COLUMN current_uses INTEGER DEFAULT 0;
```

### Missing columns on `ticket_bundle_items`:
```sql
ALTER TABLE ticket_bundle_items ADD COLUMN event_schedule_id UUID;
ALTER TABLE ticket_bundle_items ADD COLUMN access_date DATE;
ALTER TABLE ticket_bundle_items ADD COLUMN is_used BOOLEAN DEFAULT false;
ALTER TABLE ticket_bundle_items ADD COLUMN used_at TIMESTAMP;
ALTER TABLE ticket_bundle_items ADD COLUMN scan_id UUID;
```

### Missing table: `event_series`
```sql
CREATE TABLE event_series (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  series_type VARCHAR(50),  -- 'season', 'festival', 'residency'
  venue_id UUID,
  starts_at DATE,
  ends_at DATE,
  total_events INTEGER,
  is_active BOOLEAN DEFAULT true,
  metadata JSONB,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### Missing table: `season_pass_seats`
```sql
CREATE TABLE season_pass_seats (
  id UUID PRIMARY KEY,
  bundle_id UUID REFERENCES ticket_bundles(id),
  section VARCHAR(50),
  row VARCHAR(10),
  seat VARCHAR(10),
  seat_id UUID,  -- If using venue layout
  created_at TIMESTAMP
);
```

---

## What Would Need to Be Built

### Phase 1: Multi-Day Passes (5-7 days)

| Task | Effort |
|------|--------|
| Add missing columns to bundle tables | 0.5 day |
| Create `BundleService` | 2 days |
| Create bundle routes (CRUD) | 1 day |
| Create bundle purchase flow | 1 day |
| Update scanning for per-day validation | 1-2 days |

### Phase 2: Recurring Events (3-5 days)

| Task | Effort |
|------|--------|
| Add recurrence rule parser (rrule library) | 1 day |
| Auto-generate event_schedules from rule | 1 day |
| Link tickets to specific schedules | 1 day |
| Update event APIs for series view | 1-2 days |

### Phase 3: Season Passes (5-7 days)

| Task | Effort |
|------|--------|
| Create `event_series` table | 0.5 day |
| Create `season_pass_seats` table | 0.5 day |
| Create `SeasonPassService` | 2 days |
| Seat assignment logic | 1-2 days |
| Season pass purchase flow | 1-2 days |
| Attendance tracking | 1 day |

---

## Integration Points

### With Scanning Service
- Must validate pass for specific date/event
- Must track per-occurrence usage
- Must support same-seat different-dates

### With Order Service
- Bundle purchase creates multiple tickets (or one pass)
- Pricing with bundle discount
- Refund handling for partial use

### With Event Service
- Recurring event generation
- Series management
- Schedule linking

---

## Summary

| Aspect | Status |
|--------|--------|
| Database schema for bundles | ✅ Basic tables exist |
| Database schema for recurrence | ✅ Fields exist |
| Bundle service | ❌ Not implemented |
| Bundle routes | ❌ Not implemented |
| Season pass service | ❌ Not implemented |
| Multi-day validation | ❌ Not implemented |
| Recurring event generation | ❌ Not implemented |
| Event series management | ❌ Not implemented |
| Per-day/per-event tracking | ❌ Not implemented |

**Bottom Line:** The schema groundwork exists but there's no application logic. This is a significant feature gap for events like:
- Music festivals (3-day passes)
- Sports seasons (season tickets)
- Theater residencies (multi-show passes)
- Conference/conventions (multi-day badges)

---

## Related Documents

- `TICKET_VALIDATION_ENTRY_FLOW_AUDIT.md` - Current scanning logic (single-use only)
- `PRIMARY_PURCHASE_FLOW_AUDIT.md` - Purchase flow (no bundle support)
- `EVENT_CREATION_FLOW_AUDIT.md` - Event creation (no series support)
