# VENUE FEATURES FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | December 31, 2024 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Venue Features (Analytics, Staff, Box Office, Templates) |

---

## Executive Summary

**PARTIAL IMPLEMENTATION - Staff management solid, analytics proxied**

| Component | Status |
|-----------|--------|
| Staff management | ✅ Implemented |
| Staff roles (owner/manager/box_office/door_staff) | ✅ Implemented |
| Staff permissions | ✅ Implemented |
| Venue analytics (proxy) | ⚠️ Proxies to analytics-service |
| Event cloning/templates | ❌ Not implemented |
| Box office sales | ❌ Not implemented |
| Will-call/pickup | ❌ Not implemented |
| Settlement reports | ❌ Not implemented |

**Bottom Line:** Staff management is comprehensive with roles, permissions, and scheduling. Analytics proxies to analytics-service (which has issues noted in prior audit). Event templates, box office, and settlement features don't exist.

---

## What Works ✅

### 1. Staff Management

**File:** `venue-service/src/models/staff.model.ts`

**Staff Roles:**
```typescript
type StaffRole = 'owner' | 'manager' | 'box_office' | 'door_staff' | 'viewer';
```

**Staff Member Interface:**
```typescript
interface IStaffMember {
  venue_id: string;
  user_id: string;
  role: StaffRole;
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
}
```

**Methods:**
| Method | Purpose | Status |
|--------|---------|--------|
| `addStaffMember()` | Add staff to venue | ✅ Works |
| `getVenueStaff()` | List all venue staff | ✅ Works |
| `getStaffByRole()` | Filter by role | ✅ Works |
| `findByVenueAndUser()` | Check if user is staff | ✅ Works |
| `update()` | Update staff details | ✅ Works |
| `delete()` | Soft delete (is_active=false) | ✅ Works |

---

### 2. Role-Based Permissions

**File:** `venue-service/tests/integration/setup.ts`
```typescript
const ROLE_PERMISSIONS = {
  owner: ['*'],  // All permissions
  manager: ['events:*', 'staff:manage', 'tickets:*', 'reports:view'],
  box_office: ['tickets:sell', 'tickets:view', 'tickets:validate'],
  door_staff: ['tickets:validate', 'tickets:view'],
  viewer: ['events:view', 'tickets:view', 'reports:view']
};
```

---

### 3. Analytics (Proxy)

**File:** `venue-service/src/services/analytics.service.ts`
```typescript
class AnalyticsService {
  async getVenueAnalytics(venueId: string, options: any = {}) {
    // Proxies to analytics-service
    return this.httpClient.get(`/venues/${venueId}/analytics`, { params: options });
  }

  async trackEvent(eventData: any) {
    return this.httpClient.post('/events', eventData);
  }
}
```

**Note:** This proxies to analytics-service which has event publishing issues (see ANALYTICS_REPORTING_FLOW_AUDIT).

---

## What's NOT Implemented ❌

### 1. Event Cloning/Templates

**Expected:**
```typescript
// Clone existing event
POST /events/:eventId/clone
{
  "newName": "Event Copy",
  "newDate": "2025-02-01"
}

// Create from template
POST /events/from-template
{
  "templateId": "uuid",
  "name": "New Event",
  "date": "2025-02-01"
}

// Save as template
POST /events/:eventId/save-as-template
{
  "templateName": "Weekly Concert Template"
}
```

**Database needed:**
```sql
CREATE TABLE event_templates (
  id UUID PRIMARY KEY,
  tenant_id UUID,
  venue_id UUID,
  name VARCHAR(255),
  description TEXT,
  template_data JSONB,  -- Event config without dates
  created_by UUID,
  created_at TIMESTAMP
);
```

**Status:** No clone or template functionality exists

---

### 2. Box Office Sales

**Expected:**
```typescript
// Walk-up sale (no user account)
POST /box-office/sell
{
  "eventId": "uuid",
  "ticketTypeId": "uuid",
  "quantity": 2,
  "paymentMethod": "cash" | "card",
  "customerName": "John Doe",
  "customerEmail": "john@example.com"  // Optional
}

// Comp tickets
POST /box-office/comp
{
  "eventId": "uuid",
  "ticketTypeId": "uuid",
  "quantity": 1,
  "reason": "VIP guest",
  "recipientName": "Jane Smith"
}
```

**Status:** No box office endpoints. Role exists (`box_office`) but no dedicated sales flow.

---

### 3. Will-Call / Pickup

**Expected:**
```typescript
// Mark ticket for will-call
POST /tickets/:ticketId/will-call
{
  "pickupName": "John Doe",
  "pickupId": "Driver License"
}

// Search will-call list
GET /box-office/will-call?eventId=xxx&search=John

// Mark as picked up
POST /box-office/will-call/:ticketId/pickup
{
  "verifiedBy": "staff-user-id",
  "idVerified": true
}
```

**Status:** Not implemented

---

### 4. Settlement Reports

**Expected:**
```typescript
// Generate settlement for event
POST /venues/:venueId/settlements
{
  "eventId": "uuid",
  "period": "2024-12-01/2024-12-31"
}

// Get settlement details
GET /venues/:venueId/settlements/:settlementId

// Response:
{
  "grossRevenue": 50000,
  "refunds": 500,
  "platformFees": 2500,
  "paymentProcessingFees": 1500,
  "netToVenue": 45500,
  "breakdown": {
    "ticketSales": 48000,
    "resaleFees": 2000
  }
}
```

**Status:** Not implemented (relates to VENUE_PAYOUT issues)

---

### 5. Venue Dashboard

**Expected:**
- Today's events
- Real-time ticket sales
- Check-in progress
- Revenue summary
- Staff on duty

**Status:** Analytics service exists but data flow issues (see ANALYTICS_REPORTING_FLOW_AUDIT)

---

## Database Schema

### Exists
```sql
-- venue_staff table
CREATE TABLE venue_staff (
  id UUID PRIMARY KEY,
  venue_id UUID REFERENCES venues(id),
  user_id UUID REFERENCES users(id),
  role VARCHAR(50),
  permissions TEXT[],
  department VARCHAR(100),
  job_title VARCHAR(100),
  employment_type VARCHAR(50),
  start_date DATE,
  end_date DATE,
  is_active BOOLEAN DEFAULT true,
  access_areas TEXT[],
  shift_schedule JSONB,
  pin_code VARCHAR(10),
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),
  emergency_contact JSONB,
  hourly_rate DECIMAL(10,2),
  commission_percentage DECIMAL(5,2),
  added_by UUID,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### Missing
```sql
-- Event templates
CREATE TABLE event_templates (
  id UUID PRIMARY KEY,
  tenant_id UUID,
  venue_id UUID REFERENCES venues(id),
  name VARCHAR(255),
  description TEXT,
  template_data JSONB,
  category VARCHAR(50),
  is_public BOOLEAN DEFAULT false,
  usage_count INTEGER DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMP
);

-- Will-call tickets
CREATE TABLE will_call_tickets (
  id UUID PRIMARY KEY,
  ticket_id UUID REFERENCES tickets(id),
  event_id UUID,
  pickup_name VARCHAR(255),
  pickup_id_type VARCHAR(50),
  pickup_id_last4 VARCHAR(4),
  status VARCHAR(50),  -- 'pending', 'picked_up'
  picked_up_at TIMESTAMP,
  picked_up_by UUID,  -- Staff member
  notes TEXT,
  created_at TIMESTAMP
);

-- Box office transactions
CREATE TABLE box_office_transactions (
  id UUID PRIMARY KEY,
  venue_id UUID,
  event_id UUID,
  transaction_type VARCHAR(50),  -- 'sale', 'comp', 'exchange'
  payment_method VARCHAR(50),    -- 'cash', 'card', 'comp'
  amount_cents INTEGER,
  quantity INTEGER,
  customer_name VARCHAR(255),
  customer_email VARCHAR(255),
  staff_id UUID,
  created_at TIMESTAMP
);

-- Venue settlements
CREATE TABLE venue_settlements (
  id UUID PRIMARY KEY,
  venue_id UUID,
  event_id UUID,
  period_start DATE,
  period_end DATE,
  gross_revenue_cents INTEGER,
  refunds_cents INTEGER,
  platform_fees_cents INTEGER,
  processing_fees_cents INTEGER,
  net_amount_cents INTEGER,
  status VARCHAR(50),  -- 'pending', 'approved', 'paid'
  generated_at TIMESTAMP,
  approved_by UUID,
  paid_at TIMESTAMP,
  payout_id UUID
);
```

---

## What Would Need to Be Built

### Phase 1: Box Office (4-5 days)

| Task | Effort |
|------|--------|
| Box office transactions table | 0.5 day |
| Walk-up sale endpoint | 1 day |
| Comp ticket endpoint | 0.5 day |
| Cash/card payment handling | 1 day |
| Receipt generation | 0.5 day |
| Box office dashboard | 1 day |

### Phase 2: Will-Call (2-3 days)

| Task | Effort |
|------|--------|
| Will-call table | 0.5 day |
| Mark for will-call endpoint | 0.5 day |
| Will-call search | 0.5 day |
| Pickup confirmation | 0.5 day |
| Staff UI | 1 day |

### Phase 3: Event Templates (2-3 days)

| Task | Effort |
|------|--------|
| Templates table | 0.5 day |
| Clone event endpoint | 1 day |
| Save as template | 0.5 day |
| Create from template | 0.5 day |
| Template management UI | 0.5 day |

### Phase 4: Settlements (3-4 days)

| Task | Effort |
|------|--------|
| Settlements table | 0.5 day |
| Settlement calculation service | 1.5 days |
| Settlement approval workflow | 1 day |
| Settlement reports/export | 1 day |

---

## Summary

| Aspect | Status |
|--------|--------|
| Staff management | ✅ Working |
| Staff roles | ✅ Working |
| Staff permissions | ✅ Working |
| Staff scheduling | ✅ Schema exists |
| Analytics proxy | ⚠️ Works (upstream issues) |
| Event cloning | ❌ Not implemented |
| Event templates | ❌ Not implemented |
| Box office sales | ❌ Not implemented |
| Comp tickets | ❌ Not implemented |
| Will-call | ❌ Not implemented |
| Settlement reports | ❌ Not implemented |
| Venue dashboard | ⚠️ Partial (analytics issues) |

**Bottom Line:** Staff management is solid. The gaps are in day-of-event operations (box office, will-call) and financial reconciliation (settlements). These are important for venues but not strictly required for online-only sales.

---

## Related Documents

- `VENUE_ONBOARDING_FLOW_AUDIT.md` - Venue setup
- `VENUE_PAYOUT_FLOW_AUDIT.md` - Venue payments
- `ANALYTICS_REPORTING_FLOW_AUDIT.md` - Analytics issues
- `TICKET_VALIDATION_ENTRY_FLOW_AUDIT.md` - Door staff scanning
