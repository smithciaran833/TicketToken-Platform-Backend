# VENUE STAFF MANAGEMENT FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Venue Staff Management |

---

## Executive Summary

**PARTIAL - Comprehensive model, no API routes**

| Component | Status |
|-----------|--------|
| venue_staff table | ✅ Exists |
| StaffModel class | ✅ Comprehensive |
| Role-based permissions | ✅ Defined |
| Add staff (internal) | ✅ Working |
| Permission checking | ✅ Working |
| Add staff via onboarding | ✅ Working |
| Staff CRUD API routes | ❌ Not implemented |
| Invite staff by email | ❌ Not implemented |
| Staff shift scheduling | ⚠️ Schema only |

**Bottom Line:** The StaffModel is comprehensive with roles (owner, manager, box_office, door_staff, viewer), permission management, and staff limits. However, there are NO API routes to manage staff - it's only used internally or during onboarding. Venue admins cannot add/remove staff via API.

---

## What Exists

### 1. Staff Model

**File:** `backend/services/venue-service/src/models/staff.model.ts`

**Interface:**
```typescript
export interface IStaffMember {
  id?: string;
  venue_id: string;
  user_id: string;
  role: 'owner' | 'manager' | 'box_office' | 'door_staff' | 'viewer';
  permissions?: string[];
  department?: string;
  job_title?: string;
  employment_type?: string;
  start_date?: Date;
  end_date?: Date;
  is_active?: boolean;
  access_areas?: string[];
  shift_schedule?: any;
  pin_code?: string;
  contact_email?: string;
  contact_phone?: string;
  emergency_contact?: any;
  hourly_rate?: number;
  commission_percentage?: number;
  added_by?: string;
}
```

**Methods:**
```typescript
class StaffModel {
  findByVenueAndUser(venueId, userId): Promise<IStaffMember | null>
  getVenueStaff(venueId, includeInactive?): Promise<IStaffMember[]>
  getStaffByRole(venueId, role): Promise<IStaffMember[]>
  addStaffMember(staffData): Promise<IStaffMember>
  updateRole(id, role, permissions?): Promise<IStaffMember>
  deactivateStaffMember(id): Promise<boolean>
  reactivateStaffMember(id): Promise<boolean>
  getUserVenues(userId): Promise<Array<{venue_id, role}>>
  hasPermission(venueId, userId, permission): Promise<boolean>
  validateStaffLimit(venueId): Promise<{canAdd, limit, current}>
}
```

### 2. Role Permissions
```typescript
const permissionMap = {
  owner: ['*'],
  manager: [
    'venue:read', 'venue:update',
    'events:create', 'events:update', 'events:delete',
    'tickets:view', 'tickets:validate',
    'reports:view', 'reports:export',
    'staff:view', 'settings:view',
  ],
  box_office: [
    'tickets:sell', 'tickets:view', 'tickets:validate',
    'payments:process', 'reports:daily', 'customers:view',
  ],
  door_staff: [
    'tickets:validate', 'tickets:view', 'events:view',
  ],
  viewer: [
    'events:view', 'reports:view',
  ],
};
```

### 3. Staff Limit Validation
```typescript
async validateStaffLimit(venueId: string) {
  const currentStaff = await this.db('venue_staff')
    .where({ venue_id: venueId, is_active: true })
    .count('* as count');

  const limit = 50; // Per venue

  return {
    canAdd: currentStaff < limit,
    limit,
    current: currentStaff,
  };
}
```

### 4. Internal Usage

**Venue Service:**
```typescript
// Owner added when venue created
await staffModel.addStaffMember({
  venue_id: venue.id,
  user_id: userId,
  role: 'owner',
  added_by: userId,
});

// Permission checking
const hasPermission = await staffModel.hasPermission(venueId, userId, 'venue:update');
```

**Onboarding:**
```typescript
// Staff step during onboarding
case 'staff':
  await this.staffModel.addStaffMember({...});
```

---

## What's Missing

### 1. No API Routes

Expected but not implemented:
```
GET    /api/v1/venues/:venueId/staff         - List staff
POST   /api/v1/venues/:venueId/staff         - Add staff member
GET    /api/v1/venues/:venueId/staff/:id     - Get staff member
PUT    /api/v1/venues/:venueId/staff/:id     - Update staff member
DELETE /api/v1/venues/:venueId/staff/:id     - Remove staff member
POST   /api/v1/venues/:venueId/staff/invite  - Invite by email
```

### 2. No Staff Invitation Flow

Cannot invite users by email to join as staff. Would need:
- Generate invitation token
- Send email with link
- Accept invitation → create staff record

### 3. No Controller

No `staff.controller.ts` exists.

### 4. Shift Scheduling Not Implemented

`shift_schedule` field exists but no logic to:
- Define shifts
- Assign staff to shifts
- View schedules

---

## Recommendations

### P2 - Expose Staff Routes

| Task | Effort |
|------|--------|
| Create staff.routes.ts | 0.25 day |
| Create staff.controller.ts | 0.5 day |
| CRUD endpoints | 0.5 day |
| Permission validation | 0.25 day |
| **Total** | **1.5 days** |

### P3 - Staff Invitation

| Task | Effort |
|------|--------|
| Invitation token generation | 0.5 day |
| Email integration | 0.5 day |
| Accept invitation flow | 0.5 day |
| **Total** | **1.5 days** |

---

## Files Involved

| File | Status |
|------|--------|
| `venue-service/src/models/staff.model.ts` | ✅ Comprehensive |
| `venue-service/src/services/venue.service.ts` | ✅ Uses staff model |
| `venue-service/src/services/onboarding.service.ts` | ✅ Adds staff |
| `venue-service/src/routes/staff.routes.ts` | ❌ Does not exist |
| `venue-service/src/controllers/staff.controller.ts` | ❌ Does not exist |

---

## Related Documents

- `VENUE_ONBOARDING_FLOW_AUDIT.md` - Staff added during onboarding
- `VENUE_FEATURES_FLOW_AUDIT.md` - Staff roles mentioned
- `WILL_CALL_BOX_OFFICE_FLOW_AUDIT.md` - box_office role
