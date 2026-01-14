# SEATED TICKETS/SEAT SELECTION FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | December 31, 2024 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Seated Tickets & Seat Selection |

---

## Executive Summary

**PARTIAL IMPLEMENTATION - Schema exists, logic missing**

| Component | Status |
|-----------|--------|
| Venue layouts table | ✅ Schema exists |
| Layout model | ✅ Exists |
| Sections/rows/seats in layout | ✅ Schema supports |
| Ticket seat fields | ✅ section, row, seat columns exist |
| Layout management API | ❌ No routes |
| Seat selection UI flow | ❌ Not implemented |
| Seat availability checking | ❌ Not implemented |
| Seat assignment during purchase | ❌ Not implemented |
| Seat map visualization | ❌ Not implemented |

**Bottom Line:** The database supports seated tickets but there's no logic to manage layouts, check availability, or assign seats during purchase.

---

## Files Verified

| Component | File | Status |
|-----------|------|--------|
| Venue Layouts Table | venue-service/migrations/001_baseline_venue.ts | ✅ Verified |
| Layout Model | venue-service/models/layout.model.ts | ✅ Verified |
| Venue Controller | venue-service/controllers/venues.controller.ts | ✅ Verified |
| Ticket Model | ticket-service/models/Ticket.ts | ✅ Verified |
| Tickets Table | ticket-service/migrations/001_baseline_ticket.ts | ✅ Verified |

---

## What Exists

### 1. Venue Layouts Table

**File:** `venue-service/migrations/001_baseline_venue.ts`
```sql
CREATE TABLE venue_layouts (
  id UUID PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES venues(id),
  name VARCHAR(200) NOT NULL,
  type VARCHAR(50) NOT NULL,    -- 'fixed', 'general_admission', 'mixed'
  sections JSONB,               -- Section configuration
  capacity INTEGER NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  deleted_at TIMESTAMP
);
```

### 2. Layout Model

**File:** `venue-service/models/layout.model.ts`
```typescript
interface ISection {
  id: string;
  name: string;
  rows: number;
  seatsPerRow: number;
  pricing?: {
    basePrice: number;
    dynamicPricing?: boolean;
  };
}

interface ILayout {
  id?: string;
  venue_id: string;
  name: string;
  type: 'fixed' | 'general_admission' | 'mixed';
  sections?: ISection[];
  capacity: number;
  is_default: boolean;
}

class LayoutModel {
  async findByVenue(venueId: string): Promise<ILayout[]>;
  async getDefaultLayout(venueId: string): Promise<ILayout | undefined>;
  async setAsDefault(layoutId: string, venueId: string): Promise<void>;
}
```

### 3. Ticket Seat Fields

**File:** `ticket-service/models/Ticket.ts`
```typescript
interface ITicket {
  // ... other fields
  section?: string;
  row?: string;
  seat?: string;
  // ...
}
```

**Database columns in tickets table:**
```sql
table.string('section', 20);
table.string('row', 10);
table.string('seat', 10);
```

### 4. Layout Types

| Type | Description |
|------|-------------|
| `fixed` | Assigned seating (theater, arena) |
| `general_admission` | No assigned seats |
| `mixed` | Some sections assigned, some GA |

---

## What's Missing

### 1. Layout Management API ❌

No routes to create/manage layouts:
```
POST   /venues/:venueId/layouts           - Create layout ❌
GET    /venues/:venueId/layouts           - List layouts ❌
GET    /venues/:venueId/layouts/:layoutId - Get layout ❌
PUT    /venues/:venueId/layouts/:layoutId - Update layout ❌
DELETE /venues/:venueId/layouts/:layoutId - Delete layout ❌
```

### 2. Seat Availability Service ❌

No service to check/manage seat availability:
```typescript
// DOES NOT EXIST
class SeatAvailabilityService {
  async getAvailableSeats(eventId: string, section?: string): Promise<Seat[]>;
  async isSeatAvailable(eventId: string, section: string, row: string, seat: string): Promise<boolean>;
  async reserveSeats(eventId: string, seats: Seat[], userId: string): Promise<Reservation>;
  async releaseSeats(reservationId: string): Promise<void>;
}
```

### 3. Seat Selection During Purchase ❌

The purchase flow doesn't include seat selection:

**Current flow:**
```
1. User selects ticket type + quantity
2. System reserves inventory count
3. User completes payment
4. Ticket created (section/row/seat = NULL)
```

**Required flow:**
```
1. User selects ticket type
2. User opens seat map
3. User clicks on specific seats
4. System checks availability
5. System reserves specific seats
6. User completes payment
7. Ticket created with section/row/seat assigned
```

### 4. Seat Map Visualization ❌

No endpoint to get seat map data for frontend rendering:
```
GET /events/:eventId/seat-map              - Get seat map with availability ❌
GET /events/:eventId/sections/:sectionId   - Get section detail ❌
```

### 5. Event-Layout Association ❌

Events reference `venue_layout_id` but there's no logic to:
- Validate layout belongs to venue
- Copy layout sections to event
- Track per-event seat inventory

---

## Current vs. Required Architecture

### Current (General Admission Only)
```
Ticket Types → Quantity Tracking
     ↓
Purchase: decrement available_quantity
     ↓
Ticket created with NO seat assignment
```

### Required (Assigned Seating)
```
Venue Layout → Sections → Rows → Seats
     ↓
Event uses layout → Creates seat inventory
     ↓
User selects specific seats
     ↓
System reserves seats (not just quantity)
     ↓
Ticket created with section/row/seat
```

---

## Database Schema Gaps

### Missing: event_seats Table
```sql
-- DOES NOT EXIST - NEEDS TO BE BUILT
CREATE TABLE event_seats (
  id UUID PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES events(id),
  section VARCHAR(50) NOT NULL,
  row VARCHAR(10) NOT NULL,
  seat VARCHAR(10) NOT NULL,
  ticket_type_id UUID REFERENCES ticket_types(id),
  status VARCHAR(20) DEFAULT 'available', -- available, reserved, sold, blocked
  price_cents INTEGER,
  reserved_by UUID,
  reserved_until TIMESTAMP,
  ticket_id UUID REFERENCES tickets(id),
  created_at TIMESTAMP,
  
  UNIQUE(event_id, section, row, seat)
);
```

### Missing: Indexes for Seat Queries
```sql
CREATE INDEX idx_event_seats_event_status ON event_seats(event_id, status);
CREATE INDEX idx_event_seats_section ON event_seats(event_id, section, status);
```

---

## Implementation Effort

### Phase 1: Layout Management

| Task | Effort |
|------|--------|
| Layout CRUD routes | 1-2 days |
| Layout validation | 0.5 day |
| **Total** | **1.5-2.5 days** |

### Phase 2: Seat Inventory

| Task | Effort |
|------|--------|
| event_seats table migration | 0.5 day |
| SeatInventoryService | 2-3 days |
| Generate seats from layout | 1 day |
| **Total** | **3.5-4.5 days** |

### Phase 3: Purchase Integration

| Task | Effort |
|------|--------|
| Seat availability endpoint | 1 day |
| Seat reservation flow | 2 days |
| Update purchase flow | 2 days |
| **Total** | **5 days** |

### Phase 4: Seat Map API

| Task | Effort |
|------|--------|
| Seat map data endpoint | 1 day |
| Section availability endpoint | 0.5 day |
| **Total** | **1.5 days** |

### Grand Total: ~12-14 days

---

## What Works ✅

| Component | Status |
|-----------|--------|
| venue_layouts table | ✅ Exists |
| Layout model with CRUD | ✅ Exists |
| Layout types (fixed/GA/mixed) | ✅ Supported |
| Section schema in JSONB | ✅ Supported |
| Ticket seat fields | ✅ Exist |
| Event → layout reference | ✅ venue_layout_id field |

## What's Missing ❌

| Component | Status |
|-----------|--------|
| Layout management routes | ❌ Missing |
| Seat inventory table | ❌ Missing |
| Seat availability service | ❌ Missing |
| Seat selection in purchase | ❌ Missing |
| Seat map API | ❌ Missing |
| Seat reservation logic | ❌ Missing |

---

## Summary

| Aspect | Status |
|--------|--------|
| Database schema | ⚠️ Partial (layouts exist, seat inventory missing) |
| Layout model | ✅ Exists |
| Layout API | ❌ Missing |
| Seat inventory | ❌ Missing |
| Seat selection flow | ❌ Missing |
| Purchase integration | ❌ Missing |

**Bottom Line:** The foundation exists (layouts table, ticket seat fields) but the actual seat selection functionality is not implemented. Currently only general admission (quantity-based) ticketing works.

---

## Related Documents

- `PRIMARY_PURCHASE_FLOW_AUDIT.md` - Current purchase flow (no seat selection)
- `VENUE_ONBOARDING_FLOW_AUDIT.md` - Venue creation

