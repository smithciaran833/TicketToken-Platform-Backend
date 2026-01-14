# ACCESSIBLE SEATING/ADA COMPLIANCE FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | December 31, 2024 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Accessible Seating & ADA Compliance |

---

## Executive Summary

**MINIMAL IMPLEMENTATION - Compliance tracking only, no seat management**

| Component | Status |
|-----------|--------|
| Venue accessibility info field | ✅ Exists (JSONB) |
| Event accessibility info field | ✅ Exists (JSONB) |
| Compliance service - accessibility checks | ✅ Basic checks |
| Wheelchair accessible flag | ✅ In compliance settings |
| Accessible seat types in layout | ❌ Not implemented |
| Companion seat linking | ❌ Not implemented |
| ADA seat inventory tracking | ❌ Not implemented |
| Accessible seat selection flow | ❌ Not implemented |
| ADA ticket type designation | ❌ Not implemented |
| Hold/release for accessible seats | ❌ Not implemented |

**Bottom Line:** The platform can store accessibility information as metadata and check if a venue has declared wheelchair accessibility, but there's no actual accessible seating management - no ADA seat types, no companion seats, no accessibility-specific purchase flow.

---

## What "Accessible Seating/ADA" Should Include

### Legal Requirements (ADA)
1. **Wheelchair Spaces**: Designated wheelchair-accessible locations
2. **Companion Seats**: Adjacent seats for companions (must be sold together)
3. **Dispersal**: Accessible seats dispersed throughout venue (not just one section)
4. **Lines of Sight**: Comparable sightlines to other seats
5. **Ticket Pricing**: Same price as comparable non-accessible seats
6. **Hold Policy**: Can hold accessible seats for people with disabilities

### Technical Requirements
1. **Seat Types**: Mark specific seats as wheelchair, companion, limited mobility, etc.
2. **Linking**: Wheelchair + companion seats must be linked
3. **Inventory**: Separate inventory tracking for accessible seats
4. **Purchase Flow**: Verify need or allow release after hold period
5. **Reporting**: Track accessible seat sales for compliance

---

## What Exists

### 1. Venue Accessibility Info (Metadata Only)

**File:** `venue-service/src/services/compliance.service.ts`
```typescript
private async checkAccessibility(venueId: string): Promise<ComplianceCategory> {
  const settings = await this.getAccessibilitySettings(venueId);

  checks.push({
    name: 'Wheelchair Accessibility',
    passed: settings.wheelchairAccessible !== null,
    details: settings.wheelchairAccessible 
      ? 'Wheelchair accessible' 
      : 'Accessibility status not specified',
    severity: 'high',
  });

  checks.push({
    name: 'Accessibility Information',
    passed: settings.hasAccessibilityInfo,
    details: 'Accessibility information provided to customers',
    severity: 'medium',
  });
}

private async getAccessibilitySettings(venueId: string): Promise<any> {
  const settings = compliance?.settings?.accessibility || {};
  return {
    wheelchairAccessible: settings.wheelchairAccessible,
    hasAccessibilityInfo: !!(settings.wheelchairAccessible !== undefined),
  };
}
```

**What it does:**
- ✅ Checks if venue has declared wheelchair accessibility (yes/no)
- ✅ Checks if accessibility info is provided
- ✅ Generates compliance recommendations

**What it doesn't do:**
- ❌ Track actual accessible seat inventory
- ❌ Verify ADA compliance of seating layout
- ❌ Manage companion seat requirements

---

### 2. Event Accessibility Info

**File:** `event-service/src/models/event.model.ts`
```typescript
interface IEvent {
  // ...
  accessibility_info?: Record<string, any>;
  // ...
}
```

**What it does:**
- ✅ Stores arbitrary accessibility info as JSON

**What it doesn't do:**
- ❌ Define structured accessibility requirements
- ❌ Link to accessible seat inventory
- ❌ Enforce accessibility seat ratios

---

### 3. Venue Layout Model

**File:** `venue-service/src/models/layout.model.ts`
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
```

**What's missing:**
```typescript
// Should have:
interface ISection {
  // ... existing fields ...
  accessibleSeats?: {
    wheelchairSpaces: number;
    companionSeats: number;
    limitedMobilitySeats: number;
  };
}

interface ISeat {
  id: string;
  row: string;
  number: string;
  type: 'standard' | 'wheelchair' | 'companion' | 'limited_mobility' | 'aisle';
  linkedSeatId?: string;  // For wheelchair + companion linking
  accessFeatures?: string[];  // ['removable_armrest', 'extra_legroom', etc.]
}
```

---

## What's NOT Implemented

### 1. Accessible Seat Types ❌

**Expected schema:**
```sql
-- Add to venue_layouts.sections JSONB or create separate table
CREATE TABLE venue_seats (
  id UUID PRIMARY KEY,
  layout_id UUID REFERENCES venue_layouts(id),
  section_id VARCHAR(50),
  row VARCHAR(10),
  seat_number VARCHAR(10),
  seat_type VARCHAR(50) NOT NULL DEFAULT 'standard',
    -- 'standard', 'wheelchair', 'companion', 'limited_mobility', 
    -- 'aisle_transfer', 'hearing_impaired', 'sight_impaired'
  linked_seat_id UUID REFERENCES venue_seats(id),  -- Companion linking
  accessibility_features JSONB,  -- ['removable_armrest', 'extra_legroom']
  is_active BOOLEAN DEFAULT true,
  UNIQUE(layout_id, section_id, row, seat_number)
);
```

**Status:** Does not exist

---

### 2. ADA Ticket Types ❌

**Expected:**
```sql
ALTER TABLE ticket_types ADD COLUMN accessibility_type VARCHAR(50);
-- Values: NULL (standard), 'wheelchair', 'wheelchair_companion', 
--         'limited_mobility', 'sensory_assistance'

ALTER TABLE ticket_types ADD COLUMN requires_companion BOOLEAN DEFAULT false;
ALTER TABLE ticket_types ADD COLUMN companion_ticket_type_id UUID;
```

**Status:** Does not exist

---

### 3. Accessible Seat Inventory ❌

**Expected service:**
```typescript
class AccessibleSeatService {
  async getAccessibleInventory(eventId: string): Promise<{
    wheelchairSpaces: { total: number; available: number; held: number };
    companionSeats: { total: number; available: number; held: number };
    limitedMobility: { total: number; available: number; held: number };
  }>;

  async holdAccessibleSeats(
    eventId: string,
    seatIds: string[],
    holdDuration: number  // ADA allows holding for patron with disability
  ): Promise<HoldResult>;

  async releaseExpiredHolds(): Promise<void>;
}
```

**Status:** Does not exist

---

### 4. Companion Seat Logic ❌

**Expected behavior:**
- When purchasing wheelchair space, companion seat auto-selected
- Cannot purchase companion seat without wheelchair space
- Companion seat pricing same as wheelchair space
- Up to 3 companions per wheelchair space (ADA requirement)

**Status:** No linking logic exists

---

### 5. Accessible Purchase Flow ❌

**Expected flow:**
```
1. User selects "Accessible Seating" option
         │
         ▼
2. Show only accessible sections/seats
         │
         ▼
3. User selects wheelchair space
         │
         ▼
4. System auto-selects linked companion seat(s)
         │
         ▼
5. User confirms companion count (1-3)
         │
         ▼
6. Proceed to checkout with wheelchair + companions
         │
         ▼
7. (Optional) Verify accessibility need or honor system
```

**Status:** Not implemented - standard purchase flow only

---

### 6. ADA Compliance Reporting ❌

**Expected reports:**
- % of accessible seats per section
- Accessible seat sales vs standard sales
- Hold duration metrics
- Unsold accessible inventory
- Dispersal compliance check

**Status:** Not implemented

---

## Database Schema Gaps

### Missing table: `accessible_seats`
```sql
CREATE TABLE accessible_seats (
  id UUID PRIMARY KEY,
  venue_layout_id UUID NOT NULL REFERENCES venue_layouts(id),
  section VARCHAR(50) NOT NULL,
  row VARCHAR(10) NOT NULL,
  seat_number VARCHAR(10) NOT NULL,
  seat_type VARCHAR(50) NOT NULL,
  companion_of UUID REFERENCES accessible_seats(id),
  accessibility_features TEXT[],
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP,
  UNIQUE(venue_layout_id, section, row, seat_number)
);
```

### Missing table: `accessible_seat_holds`
```sql
CREATE TABLE accessible_seat_holds (
  id UUID PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES events(id),
  seat_id UUID NOT NULL REFERENCES accessible_seats(id),
  held_by UUID REFERENCES users(id),
  held_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  reason VARCHAR(100),  -- 'patron_with_disability', 'companion', etc.
  released_at TIMESTAMP,
  released_reason VARCHAR(100),  -- 'purchased', 'expired', 'released'
  UNIQUE(event_id, seat_id, released_at)  -- One active hold per seat
);
```

### Missing columns on `ticket_types`:
```sql
ALTER TABLE ticket_types 
  ADD COLUMN is_accessible BOOLEAN DEFAULT false,
  ADD COLUMN accessibility_type VARCHAR(50),
  ADD COLUMN requires_companion BOOLEAN DEFAULT false,
  ADD COLUMN max_companions INTEGER DEFAULT 3;
```

### Missing columns on `tickets`:
```sql
ALTER TABLE tickets
  ADD COLUMN is_accessible BOOLEAN DEFAULT false,
  ADD COLUMN accessibility_type VARCHAR(50),
  ADD COLUMN companion_ticket_id UUID REFERENCES tickets(id);
```

---

## What Would Need to Be Built

### Phase 1: Schema & Basic Tracking (3-4 days)

| Task | Effort |
|------|--------|
| Create `accessible_seats` table | 0.5 day |
| Create `accessible_seat_holds` table | 0.5 day |
| Add accessibility columns to ticket_types | 0.5 day |
| Add accessibility columns to tickets | 0.5 day |
| Create AccessibleSeatModel | 1 day |
| Create AccessibleSeatService | 1 day |

### Phase 2: Inventory & Holds (3-4 days)

| Task | Effort |
|------|--------|
| Accessible inventory tracking | 1 day |
| Hold/release logic for ADA seats | 1 day |
| Companion seat linking logic | 1 day |
| Expired hold cleanup job | 0.5 day |

### Phase 3: Purchase Flow (4-5 days)

| Task | Effort |
|------|--------|
| Accessible seat selection API | 1.5 days |
| Companion seat auto-selection | 1 day |
| Update purchase flow for accessible tickets | 1.5 days |
| Validation rules (companion requirements) | 1 day |

### Phase 4: Compliance & Reporting (2-3 days)

| Task | Effort |
|------|--------|
| ADA dispersal compliance check | 1 day |
| Accessible seat sales reporting | 1 day |
| Admin UI for accessible seat management | 1 day |

---

## Compliance Risk

### Current State: HIGH RISK

Without proper accessible seating management:
1. **ADA Violation**: No designated wheelchair spaces in system
2. **Companion Seats**: Cannot enforce companion seat requirements
3. **Hold Policy**: Cannot hold accessible seats for patrons with disabilities
4. **Pricing Parity**: Cannot ensure accessible seats priced same as comparable
5. **Dispersal**: Cannot verify accessible seats are dispersed throughout venue

### Mitigation

If accessible seating features aren't built:
1. Manual management by venue staff (outside system)
2. Reserve sections for accessible patrons (less optimal)
3. Phone/email booking for accessible seats (poor UX)

---

## Summary

| Aspect | Status |
|--------|--------|
| Venue accessibility flag | ✅ Basic (yes/no) |
| Event accessibility info | ✅ JSONB metadata |
| Compliance reporting | ✅ Basic checks |
| Accessible seat types | ❌ Not implemented |
| Wheelchair spaces | ❌ Not implemented |
| Companion seat linking | ❌ Not implemented |
| ADA seat holds | ❌ Not implemented |
| Accessible inventory | ❌ Not implemented |
| Purchase flow integration | ❌ Not implemented |
| Dispersal compliance | ❌ Not implemented |

**Bottom Line:** The platform has placeholder fields for accessibility metadata but no actual accessible seating functionality. This is a significant compliance gap for any venue in the United States, where ADA requirements mandate specific accommodations for patrons with disabilities.

---

## Related Documents

- `SEATED_TICKETS_FLOW_AUDIT.md` - General seat selection (also limited)
- `VENUE_ONBOARDING_FLOW_AUDIT.md` - Venue setup
- `KYC_COMPLIANCE_FLOW_AUDIT.md` - Compliance tracking
- `TICKET_UPGRADES_DOWNGRADES_FLOW_AUDIT.md` - Seat changes
