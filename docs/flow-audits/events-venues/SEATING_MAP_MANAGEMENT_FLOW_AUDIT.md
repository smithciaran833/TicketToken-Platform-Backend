# SEATING MAP MANAGEMENT FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Seating Map / Layout Management |

---

## Executive Summary

**PARTIAL - Model exists, no API routes**

| Component | Status |
|-----------|--------|
| venue_layouts table | ✅ Exists |
| LayoutModel class | ✅ Exists |
| ILayoutService interface | ✅ Defined |
| Create during onboarding | ✅ Working |
| List layouts for venue | ⚠️ Model only, no route |
| Create layout | ⚠️ Onboarding only, no route |
| Update layout | ❌ Not implemented |
| Delete layout | ❌ Not implemented |
| Set default layout | ⚠️ Model only, no route |
| Section/seat management | ❌ Not implemented |

**Bottom Line:** The venue_layouts table and model exist. Layouts can only be created during venue onboarding. There are no API routes to manage layouts after creation - no list, update, delete, or seat management endpoints.

---

## What Exists

### 1. Database Schema

**File:** `backend/services/venue-service/src/migrations/001_baseline_venue.ts`
```typescript
await knex.schema.createTable('venue_layouts', (table) => {
  // id, venue_id, name, type, sections, capacity, is_default, timestamps
});
```

### 2. Layout Model

**File:** `backend/services/venue-service/src/models/layout.model.ts`
```typescript
export interface ISection {
  id: string;
  name: string;
  rows: number;
  seatsPerRow: number;
  pricing?: {
    basePrice: number;
    dynamicPricing?: boolean;
  };
}

export interface ILayout {
  id?: string;
  venue_id: string;
  name: string;
  type: 'fixed' | 'general_admission' | 'mixed';
  sections?: ISection[];
  capacity: number;
  is_default: boolean;
}

export class LayoutModel extends BaseModel {
  async findByVenue(venueId: string): Promise<ILayout[]>
  async getDefaultLayout(venueId: string): Promise<ILayout | undefined>
  async setAsDefault(layoutId: string, venueId: string): Promise<void>
}
```

### 3. Layout Service Interface

**File:** `backend/services/venue-service/src/services/interfaces.ts`
```typescript
export interface ILayoutService {
  createLayout(venueId: string, data: any): Promise<ILayout>;
  getLayouts(venueId: string): Promise<ILayout[]>;
  getLayout(layoutId: string): Promise<ILayout | null>;
  updateLayout(layoutId: string, updates: any): Promise<ILayout>;
  deleteLayout(layoutId: string): Promise<void>;
  setDefaultLayout(venueId: string, layoutId: string): Promise<void>;
}
```

**Note:** Interface defined but no implementation found.

### 4. Creation During Onboarding

**File:** `backend/services/venue-service/src/services/onboarding.service.ts`
```typescript
const steps = ['basic_info', 'layout', 'integrations', 'staff'];

// Layout step
{
  id: 'layout',
  name: 'Seating Layout',
  completed: await this.hasLayout(venueId),
}

// Create layout during onboarding
private async createLayout(venueId: string, data: any): Promise<void> {
  await this.layoutModel.create({
    venue_id: venueId,
    name: data.name,
    type: data.type,
    sections: data.sections,
    capacity: data.capacity,
    is_default: true,
  });
}
```

---

## What's Missing

### 1. No API Routes

Expected but not implemented:
```
GET    /api/v1/venues/:venueId/layouts         - List layouts
POST   /api/v1/venues/:venueId/layouts         - Create layout
GET    /api/v1/venues/:venueId/layouts/:id     - Get layout
PUT    /api/v1/venues/:venueId/layouts/:id     - Update layout
DELETE /api/v1/venues/:venueId/layouts/:id     - Delete layout
PUT    /api/v1/venues/:venueId/layouts/:id/default - Set as default
```

### 2. No Section Management

Sections are stored as JSON but no CRUD for:
- Add section
- Update section
- Delete section
- Reorder sections

### 3. No Seat Management

No individual seat operations:
- Mark seat as accessible
- Block seat (broken, obstructed view)
- Set seat-level pricing
- Reserve for specific purposes

### 4. No Visual Editor Support

No endpoints for:
- Upload seating chart image
- SVG/interactive map data
- Coordinate mapping

---

## Recommendations

### P2 - Expose Layout Routes

| Task | Effort |
|------|--------|
| Create layout routes file | 0.25 day |
| Implement layout controller | 0.5 day |
| Implement layout service | 0.5 day |
| Add section CRUD | 1 day |
| **Total** | **2.25 days** |

### P3 - Full Seating Management

| Task | Effort |
|------|--------|
| Seat-level management | 2 days |
| Visual editor support | 3 days |
| Accessibility features | 1 day |
| **Total** | **6 days** |

---

## Files Involved

| File | Status |
|------|--------|
| `venue-service/src/migrations/001_baseline_venue.ts` | ✅ Table exists |
| `venue-service/src/models/layout.model.ts` | ✅ Model exists |
| `venue-service/src/services/interfaces.ts` | ✅ Interface defined |
| `venue-service/src/services/onboarding.service.ts` | ✅ Creates during onboarding |
| `venue-service/src/routes/layouts.routes.ts` | ❌ Does not exist |
| `venue-service/src/controllers/layouts.controller.ts` | ❌ Does not exist |
| `venue-service/src/services/layout.service.ts` | ❌ Does not exist |

---

## Related Documents

- `VENUE_ONBOARDING_FLOW_AUDIT.md` - Layout created during onboarding
- `SEATED_TICKETS_FLOW_AUDIT.md` - Seat selection for tickets
- `ACCESSIBLE_SEATING_ADA_FLOW_AUDIT.md` - Accessibility requirements
