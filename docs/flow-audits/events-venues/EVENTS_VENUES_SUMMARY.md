# EVENTS-VENUES FLOW AUDIT SUMMARY

> **Generated:** January 2, 2025
> **Category:** events-venues
> **Total Files:** 19
> **Status:** ✅ Complete (10) | ⚠️ Partial (7) | ❌ Not Implemented (2)

---

## CRITICAL ISSUES

| Priority | Issue | File | Impact |
|----------|-------|------|--------|
| **P0** | Event cancellation doesn't notify ticket holders | EVENT_CANCELLATION | Users not informed, no auto-refund triggered |
| **P0** | Venue deletion has no cascade logic | VENUE_DELETION | Orphaned events, tickets, orders, payments |
| **P1** | Ticket tier deletion leaves orphaned tickets | TICKET_TIER | Sold tickets reference non-existent tiers |
| **P1** | Event status transitions not enforced | EVENT_STATUS | Can skip states, bypass refund logic |
| P2 | Venue approval is status field only | VENUE_APPROVAL | No workflow, no approval endpoints |
| P2 | Seating maps model-only | SEATING_MANAGEMENT | No visual editor, no seat selection API |
| P2 | White-label assets stored but not served | WHITE_LABEL | No CDN serving, no runtime injection |
| P3 | No fee preview before purchase | FEE_STRUCTURE | Users surprised by final price |

---

## FILE-BY-FILE BREAKDOWN

---

### 1. EVENT_CANCELLATION_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ⚠️ PARTIAL |
| Priority | **P0** |

**What Works:**
- `cancelEvent()` method exists in event-service
- Event status updated to 'cancelled'
- Cancellation reason stored in `cancellation_reason` column
- Cancellation timestamp stored in `cancelled_at`
- Basic validation prevents double-cancellation
- Cancelled events excluded from public queries

**What's Broken:**

1. **No notification to ticket holders:**
```typescript
// event-service/src/services/event-cancellation.service.ts
async cancelEvent(eventId: string, reason: string) {
  await this.eventModel.update(eventId, {
    status: 'cancelled',
    cancellation_reason: reason,
    cancelled_at: new Date()
  });
  
  // THIS IS COMMENTED OUT:
  // In production: await messageQueue.publish('notifications', {
  //   type: 'event.cancelled',
  //   eventId,
  //   reason
  // });
}
```

2. **No automatic refund trigger** - Must manually process refunds

3. **No marketplace listing cancellation** - Listings for cancelled events stay active

4. **No order cancellation** - Pending orders not cancelled

**Database Schema:**
```sql
-- Columns exist on events table
cancellation_reason TEXT,
cancelled_at TIMESTAMP,
cancelled_by UUID REFERENCES users(id)
```

**Key Files:**
- `event-service/src/services/event-cancellation.service.ts`
- `event-service/src/services/event.service.ts`

**What Should Happen on Cancellation:**
1. Update event status → cancelled
2. Publish `event.cancelled` to notification queue
3. Trigger bulk refund for all ticket holders
4. Cancel all pending orders
5. Cancel all marketplace listings
6. Notify venue admins
7. Update analytics

---

### 2. EVENT_CREATION_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ✅ COMPLETE |
| Priority | P3 |

**What Works:**
- Full event CRUD operations
- JWT authentication required
- Venue ownership validation
- Tenant isolation via RLS
- Event validation (dates, capacity, required fields)
- Draft → Published workflow
- Image upload integration
- Category assignment
- Slug generation for SEO URLs

**API Endpoints:**
| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/events` | POST | Create event | ✅ Working |
| `/events/:id` | GET | Get event | ✅ Working |
| `/events/:id` | PUT | Update event | ✅ Working |
| `/events/:id` | DELETE | Delete event | ✅ Working |
| `/events` | GET | List events | ✅ Working |
| `/events/:id/publish` | POST | Publish event | ✅ Working |
| `/events/:id/unpublish` | POST | Unpublish event | ✅ Working |

**Event Schema:**
```typescript
interface Event {
  id: string;
  venueId: string;
  tenantId: string;
  name: string;
  slug: string;
  description: string;
  shortDescription: string;
  startDate: Date;
  endDate: Date;
  doorsOpen: Date;
  status: 'draft' | 'published' | 'cancelled' | 'completed';
  visibility: 'public' | 'private' | 'unlisted';
  categoryId: string;
  imageUrl: string;
  bannerUrl: string;
  capacity: number;
  ageRestriction: string;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}
```

**Validation Rules:**
- Name: required, 3-200 characters
- Start date: required, must be in future
- End date: must be after start date
- Capacity: positive integer
- Venue: must exist and user must have access

**Key Files:**
- `event-service/src/routes/events.routes.ts`
- `event-service/src/controllers/event.controller.ts`
- `event-service/src/services/event.service.ts`
- `event-service/src/models/event.model.ts`

---

### 3. EVENT_SCHEDULING_RECURRENCE_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ⚠️ PARTIAL |
| Priority | P3 |

**What Works:**
- Single event scheduling works
- Start/end date validation
- Doors open time
- Time zone handling via `timezone` column
- Event series concept exists (parent_event_id)

**What's Partially Implemented:**
```typescript
// event-service/src/models/event.model.ts
interface Event {
  // Recurrence fields exist but logic incomplete
  parent_event_id: string | null;  // For series
  recurrence_rule: string | null;  // RRULE format
  recurrence_end: Date | null;
  is_recurring: boolean;
}
```

**What's Missing:**
- ❌ No RRULE parsing/generation
- ❌ No bulk event creation from recurrence rule
- ❌ No "edit all in series" functionality
- ❌ No "edit this and future" functionality
- ❌ No recurrence exception handling (skip dates)

**Expected Recurrence Types:**
```typescript
// Not implemented
type RecurrenceType = 
  | 'daily'
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'custom';

interface RecurrenceRule {
  frequency: RecurrenceType;
  interval: number;        // Every N days/weeks/months
  daysOfWeek?: number[];   // For weekly: [1,3,5] = Mon,Wed,Fri
  dayOfMonth?: number;     // For monthly
  endDate?: Date;
  occurrences?: number;    // Or end after N occurrences
}
```

**Key Files:**
- `event-service/src/models/event.model.ts`
- No recurrence service exists

---

### 4. EVENT_STATUS_TRANSITIONS_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ⚠️ PARTIAL |
| Priority | **P1** |

**What Works:**
- Status column exists with enum values
- Basic status updates work
- Published events show in public listings
- Cancelled events hidden from public

**Event Statuses:**
```typescript
type EventStatus = 'draft' | 'published' | 'cancelled' | 'completed' | 'postponed';
```

**What's Broken - No Transition Validation:**
```typescript
// event-service/src/services/event.service.ts
async updateEventStatus(eventId: string, newStatus: EventStatus) {
  // PROBLEM: No validation of allowed transitions
  // Can go from 'draft' directly to 'cancelled' without refund logic
  // Can go from 'completed' back to 'draft'
  await this.eventModel.update(eventId, { status: newStatus });
}
```

**Required State Machine (Not Implemented):**
```
draft → published (requires: ticket tiers exist, dates valid)
draft → cancelled (allowed, no refunds needed)
published → cancelled (requires: trigger refunds, notify users)
published → postponed (requires: notify users, update dates)
published → completed (automatic: after end_date passes)
postponed → published (requires: new dates set)
postponed → cancelled (requires: trigger refunds)
completed → (terminal state, no transitions)
cancelled → (terminal state, no transitions)
```

**Side Effects Not Triggered:**
| Transition | Required Side Effect | Implemented |
|------------|---------------------|-------------|
| * → cancelled | Refund all tickets | ❌ No |
| * → cancelled | Notify ticket holders | ❌ No |
| * → cancelled | Cancel marketplace listings | ❌ No |
| published → postponed | Notify ticket holders | ❌ No |
| * → completed | Finalize analytics | ❌ No |

**Key Files:**
- `event-service/src/services/event.service.ts`
- No state machine implementation exists

---

### 5. FEE_STRUCTURE_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ✅ COMPLETE |
| Priority | P3 |

**What Works:**
- Platform fee configuration (default 5%)
- Payment processing fee (2.9% + $0.30 Stripe)
- Venue-specific fee overrides
- Fee calculation at purchase time
- Fee breakdown in order record
- Tiered pricing support (volume discounts)

**Fee Calculation:**
```typescript
// payment-service/src/services/fee-calculator.service.ts
interface FeeBreakdown {
  subtotal: number;           // Ticket price × quantity
  platformFee: number;        // 5% of subtotal (configurable)
  processingFee: number;      // 2.9% + $0.30
  venueFee: number;           // Optional venue service fee
  taxAmount: number;          // Calculated tax
  totalAmount: number;        // Final charge amount
}

calculateFees(subtotal: number, venueId: string): FeeBreakdown {
  const platformRate = await this.getPlatformRate(venueId); // Default 0.05
  const platformFee = Math.round(subtotal * platformRate);
  
  const processingFee = Math.round(subtotal * 0.029) + 30; // Stripe
  
  const venueSettings = await this.getVenueSettings(venueId);
  const venueFee = venueSettings.serviceFee || 0;
  
  const taxableAmount = subtotal + platformFee + venueFee;
  const taxAmount = await this.calculateTax(taxableAmount, venueId);
  
  return {
    subtotal,
    platformFee,
    processingFee,
    venueFee,
    taxAmount,
    totalAmount: subtotal + platformFee + processingFee + venueFee + taxAmount
  };
}
```

**Fee Configuration (venue_settings):**
```sql
platform_fee_percentage DECIMAL(5,4) DEFAULT 0.05,
absorb_platform_fee BOOLEAN DEFAULT false,  -- Venue pays instead of buyer
service_fee_cents INTEGER DEFAULT 0,        -- Fixed venue fee
service_fee_percentage DECIMAL(5,4),        -- Or percentage
```

**What's Missing:**
- ❌ No fee preview endpoint (GET /events/:id/fee-preview?quantity=2)
- ❌ No fee comparison across ticket tiers

**Key Files:**
- `payment-service/src/services/fee-calculator.service.ts`
- `venue-service/src/models/venue-settings.model.ts`

---

### 6. SEATING_MANAGEMENT_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ⚠️ PARTIAL |
| Priority | P2 |

**What Exists (Data Model Only):**
```sql
CREATE TABLE seating_maps (
  id UUID PRIMARY KEY,
  venue_id UUID REFERENCES venues(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  layout_data JSONB,          -- SVG or coordinate data
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

CREATE TABLE seating_sections (
  id UUID PRIMARY KEY,
  seating_map_id UUID REFERENCES seating_maps(id),
  name VARCHAR(100),          -- "Orchestra", "Balcony", "GA Floor"
  section_type VARCHAR(50),   -- 'seated', 'general_admission', 'standing'
  capacity INTEGER,
  row_count INTEGER,
  seats_per_row INTEGER,
  pricing_tier_id UUID,
  coordinates JSONB,          -- Position on map
  color VARCHAR(7)            -- Hex color for display
);

CREATE TABLE seats (
  id UUID PRIMARY KEY,
  section_id UUID REFERENCES seating_sections(id),
  row_label VARCHAR(10),      -- "A", "B", "AA"
  seat_number INTEGER,
  seat_label VARCHAR(20),     -- "A1", "A2"
  status VARCHAR(20),         -- 'available', 'held', 'sold', 'blocked'
  accessibility BOOLEAN DEFAULT false,
  coordinates JSONB,          -- x, y position
  metadata JSONB              -- Obstructed view, companion seat, etc.
);
```

**What Works:**
- Tables exist with proper schema
- Basic CRUD for seating maps
- Section and seat creation
- Seat status tracking

**What's Missing:**
- ❌ No visual seating map editor
- ❌ No seat selection API for checkout
- ❌ No real-time seat availability (WebSocket)
- ❌ No seat hold/release during checkout
- ❌ No accessible seating filters
- ❌ No "best available" algorithm
- ❌ No seat map rendering endpoint (SVG generation)

**Expected But Not Implemented:**
```typescript
// Seat selection flow
POST /events/:eventId/seats/hold
{ seatIds: ['seat-1', 'seat-2'], sessionId: 'checkout-session' }
→ Holds seats for 10 minutes

POST /events/:eventId/seats/release
{ sessionId: 'checkout-session' }
→ Releases held seats

GET /events/:eventId/seats/availability
→ Returns real-time seat map with availability

GET /events/:eventId/seats/best-available?quantity=2&section=orchestra
→ Returns best available seats
```

**Key Files:**
- `event-service/src/models/seating-map.model.ts`
- `event-service/src/models/section.model.ts`
- `event-service/src/models/seat.model.ts`
- No seating service or controller

---

### 7. TICKET_TIER_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ⚠️ PARTIAL |
| Priority | **P1** |

**What Works:**
- Ticket tier CRUD operations
- Price, quantity, description
- Sale start/end dates
- Min/max per order limits
- Hidden tiers (for presale codes)
- Tier ordering/priority

**Ticket Tier Schema:**
```typescript
interface TicketTier {
  id: string;
  eventId: string;
  name: string;                    // "General Admission", "VIP"
  description: string;
  priceInCents: number;
  quantity: number;                // Total available
  quantitySold: number;            // Tracking
  maxPerOrder: number;             // Limit per purchase
  minPerOrder: number;
  saleStartsAt: Date;
  saleEndsAt: Date;
  isHidden: boolean;               // Requires access code
  accessCode: string | null;       // Unlock code for hidden tiers
  sortOrder: number;
  metadata: Record<string, any>;
}
```

**API Endpoints:**
| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/events/:eventId/tiers` | GET | List tiers | ✅ Working |
| `/events/:eventId/tiers` | POST | Create tier | ✅ Working |
| `/events/:eventId/tiers/:tierId` | PUT | Update tier | ✅ Working |
| `/events/:eventId/tiers/:tierId` | DELETE | Delete tier | ⚠️ Broken |

**What's Broken - Tier Deletion:**
```typescript
// event-service/src/services/ticket-tier.service.ts
async deleteTier(tierId: string) {
  // PROBLEM: Doesn't check for sold tickets
  // PROBLEM: Doesn't handle existing tickets referencing this tier
  await this.tierModel.delete(tierId);
  // Orphaned tickets now reference non-existent tier_id
}
```

**Required Before Deletion:**
1. Check if any tickets sold for this tier
2. If tickets exist: reject deletion OR migrate to another tier
3. If pending orders reference tier: reject deletion
4. Update marketplace listings referencing tier

**What's Also Missing:**
- ❌ No tier availability check endpoint
- ❌ No bulk tier creation
- ❌ No tier templates (copy from previous event)

**Key Files:**
- `event-service/src/routes/ticket-tier.routes.ts`
- `event-service/src/services/ticket-tier.service.ts`
- `event-service/src/models/ticket-tier.model.ts`

---

### 8. VENUE_APPROVAL_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ⚠️ PARTIAL |
| Priority | P2 |

**What Exists:**
```sql
-- venues table
status VARCHAR(30) DEFAULT 'pending',
-- Values: 'pending', 'approved', 'rejected', 'suspended'

approved_at TIMESTAMP,
approved_by UUID REFERENCES users(id),
rejection_reason TEXT,
```

**What Works:**
- Status column exists
- Can manually update status via database
- Approved venues can create events
- Pending/rejected venues blocked from event creation

**What's Missing - No Approval Workflow:**
```typescript
// Expected but doesn't exist:
POST /admin/venues/:venueId/approve
POST /admin/venues/:venueId/reject
{ reason: 'Incomplete documentation' }

GET /admin/venues/pending
// List venues awaiting approval

POST /admin/venues/:venueId/request-info
{ fields: ['taxId', 'businessLicense'] }
// Request additional documentation
```

**No Approval Business Logic:**
- ❌ No approval queue for admins
- ❌ No email notification on approval/rejection
- ❌ No required fields check before approval
- ❌ No Stripe Connect verification check
- ❌ No automatic approval for trusted venues

**Key Files:**
- `venue-service/src/models/venue.model.ts` (status field exists)
- No approval service or admin routes

---

### 9. VENUE_BRANDING_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ✅ COMPLETE |
| Priority | P3 |

**What Works:**
- Full branding configuration per venue
- Logo upload and storage
- Color scheme (primary, secondary, accent)
- Custom fonts
- Email branding (from name, reply-to)
- Social links
- Custom footer text

**Branding Schema:**
```typescript
interface VenueBranding {
  venueId: string;
  
  // Visual
  logoUrl: string;
  faviconUrl: string;
  primaryColor: string;       // Hex
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;
  
  // Email
  emailFromName: string;
  emailReplyTo: string;
  emailLogoUrl: string;
  emailFooterText: string;
  
  // Social
  facebookUrl: string;
  twitterUrl: string;
  instagramUrl: string;
  
  // Legal
  termsUrl: string;
  privacyUrl: string;
  
  // Custom
  customCss: string;          // Injected into white-label sites
  metadata: Record<string, any>;
}
```

**API Endpoints:**
| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/venues/:venueId/branding` | GET | Get branding | ✅ Working |
| `/venues/:venueId/branding` | PUT | Update branding | ✅ Working |
| `/venues/:venueId/branding/logo` | POST | Upload logo | ✅ Working |
| `/venues/:venueId/branding/preview` | GET | Preview themed page | ✅ Working |

**Key Files:**
- `venue-service/src/routes/branding.routes.ts`
- `venue-service/src/services/branding.service.ts`
- `venue-service/src/models/venue-branding.model.ts`

---

### 10. VENUE_CREATION_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ✅ COMPLETE |
| Priority | P3 |

**What Works:**
- Full venue CRUD
- JWT authentication
- Owner assignment
- Address validation
- Timezone configuration
- Capacity settings
- Contact information
- Business details
- Tenant isolation

**Venue Schema:**
```typescript
interface Venue {
  id: string;
  tenantId: string;
  ownerId: string;
  name: string;
  slug: string;
  description: string;
  
  // Location
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  latitude: number;
  longitude: number;
  timezone: string;
  
  // Capacity
  capacity: number;
  standingCapacity: number;
  seatedCapacity: number;
  
  // Contact
  phone: string;
  email: string;
  website: string;
  
  // Business
  businessName: string;
  taxId: string;
  
  // Status
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
  isActive: boolean;
  
  // Metadata
  amenities: string[];
  images: string[];
  metadata: Record<string, any>;
  
  createdAt: Date;
  updatedAt: Date;
}
```

**API Endpoints:**
| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/venues` | POST | Create venue | ✅ Working |
| `/venues/:id` | GET | Get venue | ✅ Working |
| `/venues/:id` | PUT | Update venue | ✅ Working |
| `/venues/:id` | DELETE | Soft delete | ⚠️ See deletion audit |
| `/venues` | GET | List venues | ✅ Working |
| `/venues/my` | GET | My venues | ✅ Working |

**Key Files:**
- `venue-service/src/routes/venues.routes.ts`
- `venue-service/src/controllers/venue.controller.ts`
- `venue-service/src/services/venue.service.ts`
- `venue-service/src/models/venue.model.ts`

---

### 11. VENUE_DELETION_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ❌ NOT IMPLEMENTED |
| Priority | **P0** |

**What Exists:**
```typescript
// venue-service/src/services/venue.service.ts
async deleteVenue(venueId: string) {
  // Only sets is_active = false
  await this.venueModel.update(venueId, { isActive: false });
  // That's it. Nothing else.
}
```

**What's Broken - No Cascade Logic:**

| Related Data | What Should Happen | What Actually Happens |
|--------------|-------------------|----------------------|
| Events | Cancel all, refund tickets | ❌ Orphaned |
| Tickets | Refund all active | ❌ Orphaned |
| Orders | Cancel pending, refund completed | ❌ Orphaned |
| Marketplace listings | Cancel all | ❌ Orphaned |
| Payouts | Process pending, then close | ❌ Orphaned |
| Staff/users | Remove venue access | ❌ Still have access |
| Stripe Connect | Disconnect account | ❌ Still connected |
| Branding | Archive | ❌ Still exists |
| Seating maps | Archive | ❌ Still exists |
| Integrations | Disconnect | ❌ Still connected |

**Required Deletion Flow:**
```typescript
async deleteVenue(venueId: string, options: { hardDelete?: boolean }) {
  // 1. Check for active events with future dates
  const activeEvents = await this.eventService.getActiveEvents(venueId);
  if (activeEvents.length > 0) {
    throw new Error('Cannot delete venue with active events');
  }
  
  // 2. Cancel all pending events
  await this.eventService.cancelAllByVenue(venueId, 'Venue closed');
  
  // 3. Refund all tickets
  await this.refundService.refundAllByVenue(venueId);
  
  // 4. Cancel marketplace listings
  await this.marketplaceService.cancelListingsByVenue(venueId);
  
  // 5. Process final payouts
  await this.payoutService.processFinalPayout(venueId);
  
  // 6. Disconnect Stripe
  await this.stripeService.disconnectAccount(venueId);
  
  // 7. Remove staff access
  await this.staffService.removeAllByVenue(venueId);
  
  // 8. Archive or delete data
  if (options.hardDelete) {
    await this.hardDeleteVenueData(venueId);
  } else {
    await this.archiveVenueData(venueId);
  }
  
  // 9. Mark venue as deleted
  await this.venueModel.update(venueId, {
    isActive: false,
    deletedAt: new Date()
  });
}
```

**Key Files:**
- `venue-service/src/services/venue.service.ts` (incomplete)

---

### 12. VENUE_ONBOARDING_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ✅ COMPLETE |
| Priority | P3 |

**What Works:**
- Multi-step onboarding wizard tracking
- Onboarding progress persistence
- Step completion validation
- Stripe Connect onboarding integration
- Onboarding checklist

**Onboarding Steps:**
```typescript
enum OnboardingStep {
  ACCOUNT_CREATED = 'account_created',
  VENUE_DETAILS = 'venue_details',
  BRANDING = 'branding',
  PAYMENT_SETUP = 'payment_setup',      // Stripe Connect
  FIRST_EVENT = 'first_event',
  BANK_VERIFIED = 'bank_verified',
  COMPLETED = 'completed'
}

interface OnboardingProgress {
  venueId: string;
  currentStep: OnboardingStep;
  completedSteps: OnboardingStep[];
  stepData: Record<OnboardingStep, any>;  // Data collected at each step
  startedAt: Date;
  completedAt: Date | null;
}
```

**API Endpoints:**
| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/venues/:venueId/onboarding` | GET | Get progress | ✅ Working |
| `/venues/:venueId/onboarding/step` | POST | Complete step | ✅ Working |
| `/venues/:venueId/onboarding/skip` | POST | Skip optional step | ✅ Working |

**Stripe Connect Integration:**
```typescript
async initiateStripeConnect(venueId: string) {
  const accountLink = await stripe.accountLinks.create({
    account: venue.stripeAccountId,
    refresh_url: `${baseUrl}/venues/${venueId}/onboarding/stripe-refresh`,
    return_url: `${baseUrl}/venues/${venueId}/onboarding/stripe-complete`,
    type: 'account_onboarding',
  });
  return accountLink.url;
}
```

**Key Files:**
- `venue-service/src/routes/onboarding.routes.ts`
- `venue-service/src/services/onboarding.service.ts`
- `venue-service/src/models/onboarding-progress.model.ts`

---

### 13. VENUE_PAYOUT_SETTINGS_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ✅ COMPLETE |
| Priority | P3 |

**What Works:**
- Payout schedule configuration (daily, weekly, monthly)
- Minimum payout threshold
- Payout hold period (fraud protection)
- Bank account via Stripe Connect
- Payout currency settings
- Tax withholding configuration

**Payout Settings Schema:**
```typescript
interface VenuePayoutSettings {
  venueId: string;
  
  // Schedule
  payoutSchedule: 'daily' | 'weekly' | 'monthly' | 'manual';
  payoutDay: number;              // Day of week (1-7) or month (1-28)
  minimumPayoutCents: number;     // Minimum balance to trigger payout
  
  // Timing
  holdPeriodDays: number;         // Days to hold funds (default 7)
  
  // Stripe
  stripeAccountId: string;
  stripeAccountStatus: 'pending' | 'active' | 'restricted';
  
  // Banking
  defaultCurrency: string;
  
  // Tax
  taxWithholdingPercent: number;
  tax1099Eligible: boolean;
}
```

**API Endpoints:**
| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/venues/:venueId/payout-settings` | GET | Get settings | ✅ Working |
| `/venues/:venueId/payout-settings` | PUT | Update settings | ✅ Working |
| `/venues/:venueId/payout-settings/bank` | GET | Get bank info | ✅ Working |

**Key Files:**
- `venue-service/src/routes/payout-settings.routes.ts`
- `venue-service/src/services/payout-settings.service.ts`
- `payment-service/src/services/venue-payout.service.ts`

---

### 14. VENUE_SETTINGS_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ✅ COMPLETE |
| Priority | P3 |

**What Works:**
- Comprehensive venue configuration
- Marketplace settings
- Notification preferences
- Fee configuration
- Operational settings
- Privacy settings

**Settings Categories:**

**Marketplace Settings:**
```typescript
{
  allowResale: boolean;
  maxMarkupPercent: number;       // 300% default
  minListingPrice: number;        // Floor
  autoApproveListings: boolean;
  resaleCutoffHours: number;      // Hours before event
  royaltyPercent: number;         // Venue cut of resales
}
```

**Notification Settings:**
```typescript
{
  emailNotifications: boolean;
  smsNotifications: boolean;
  pushNotifications: boolean;
  marketingEmails: boolean;
  orderConfirmation: boolean;
  eventReminders: boolean;
  reminderHoursBefore: number;
}
```

**Operational Settings:**
```typescript
{
  requireIdVerification: boolean;
  minAge: number;
  maxTicketsPerOrder: number;
  cartTimeoutMinutes: number;
  allowGuestCheckout: boolean;
  requirePhoneNumber: boolean;
}
```

**API Endpoints:**
| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/venues/:venueId/settings` | GET | Get all settings | ✅ Working |
| `/venues/:venueId/settings` | PUT | Update settings | ✅ Working |
| `/venues/:venueId/settings/:category` | GET | Get category | ✅ Working |
| `/venues/:venueId/settings/:category` | PUT | Update category | ✅ Working |

**Key Files:**
- `venue-service/src/routes/settings.routes.ts`
- `venue-service/src/services/settings.service.ts`
- `venue-service/src/models/venue-settings.model.ts`

---

### 15. VENUE_STAFF_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ✅ COMPLETE |
| Priority | P3 |

**What Works:**
- Invite staff to venue
- Role-based access (owner, admin, manager, staff, scanner)
- Permission management
- Staff removal
- Invitation email flow
- Pending invitation tracking

**Staff Roles & Permissions:**
```typescript
const rolePermissions = {
  owner: ['*'],  // All permissions
  admin: [
    'events:*',
    'tickets:*',
    'orders:read',
    'orders:refund',
    'staff:manage',
    'settings:read',
    'settings:write',
    'reports:*'
  ],
  manager: [
    'events:read',
    'events:write',
    'tickets:read',
    'tickets:checkin',
    'orders:read',
    'reports:read'
  ],
  staff: [
    'events:read',
    'tickets:read',
    'tickets:checkin'
  ],
  scanner: [
    'tickets:checkin'
  ]
};
```

**Staff Schema:**
```sql
CREATE TABLE venue_staff (
  id UUID PRIMARY KEY,
  venue_id UUID REFERENCES venues(id),
  user_id UUID REFERENCES users(id),
  role VARCHAR(50) NOT NULL,
  permissions TEXT[],                    -- Override role defaults
  invited_by UUID REFERENCES users(id),
  invited_at TIMESTAMP,
  accepted_at TIMESTAMP,
  status VARCHAR(20) DEFAULT 'pending',  -- pending, active, removed
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

**API Endpoints:**
| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/venues/:venueId/staff` | GET | List staff | ✅ Working |
| `/venues/:venueId/staff/invite` | POST | Invite staff | ✅ Working |
| `/venues/:venueId/staff/:staffId` | PUT | Update role | ✅ Working |
| `/venues/:venueId/staff/:staffId` | DELETE | Remove staff | ✅ Working |
| `/invitations/:token/accept` | POST | Accept invite | ✅ Working |

**Key Files:**
- `venue-service/src/routes/staff.routes.ts`
- `venue-service/src/services/staff.service.ts`
- `venue-service/src/models/venue-staff.model.ts`

---

### 16. VENUE_VERIFICATION_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ⚠️ PARTIAL |
| Priority | P2 |

**What Exists:**
```sql
-- venues table
is_verified BOOLEAN DEFAULT false,
verified_at TIMESTAMP,
verified_by UUID,
verification_level VARCHAR(30),  -- 'basic', 'enhanced', 'premium'

-- venue_verification_documents table
CREATE TABLE venue_verification_documents (
  id UUID PRIMARY KEY,
  venue_id UUID REFERENCES venues(id),
  document_type VARCHAR(50),      -- 'business_license', 'tax_id', 'insurance'
  file_url VARCHAR(500),
  status VARCHAR(20),             -- 'pending', 'approved', 'rejected'
  reviewed_by UUID,
  reviewed_at TIMESTAMP,
  rejection_reason TEXT
);
```

**What Works:**
- Document upload
- Document status tracking
- Basic verified flag

**What's Missing:**
- ❌ No automated verification checks
- ❌ No verification level progression
- ❌ No integration with business verification APIs
- ❌ No admin review queue
- ❌ No verification badge display logic
- ❌ No re-verification reminders (annual renewal)

**Expected Verification Levels:**
```typescript
// Not fully implemented
basic: {
  requires: ['email_verified', 'phone_verified'],
  badge: 'Verified Contact'
}
enhanced: {
  requires: ['basic', 'business_license', 'tax_id'],
  badge: 'Verified Business'
}
premium: {
  requires: ['enhanced', 'insurance', 'site_visit'],
  badge: 'Premium Partner',
  benefits: ['lower_fees', 'priority_support', 'featured_placement']
}
```

**Key Files:**
- `venue-service/src/models/venue.model.ts`
- `venue-service/src/models/venue-verification.model.ts`
- No verification service

---

### 17. WHITE_LABEL_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ⚠️ PARTIAL |
| Priority | P2 |

**What Works:**
- White-label configuration stored per venue
- Custom domain mapping table
- Branding assets (logo, colors, fonts)
- Email template customization
- White-label flag on venue

**White-Label Schema:**
```sql
CREATE TABLE white_label_configs (
  id UUID PRIMARY KEY,
  venue_id UUID REFERENCES venues(id),
  
  -- Domain
  custom_domain VARCHAR(255),
  ssl_status VARCHAR(20),         -- 'pending', 'active', 'failed'
  
  -- Branding (extends venue_branding)
  hide_powered_by BOOLEAN DEFAULT false,
  custom_footer_html TEXT,
  custom_head_scripts TEXT,       -- Analytics, etc.
  
  -- Features
  features_enabled JSONB,         -- Which platform features to show
  
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

CREATE TABLE custom_domains (
  id UUID PRIMARY KEY,
  venue_id UUID REFERENCES venues(id),
  domain VARCHAR(255) UNIQUE,
  verification_token VARCHAR(255),
  verified_at TIMESTAMP,
  ssl_certificate_id VARCHAR(255),
  is_primary BOOLEAN DEFAULT false
);
```

**What's Missing:**

1. **No CDN serving of white-label assets:**
```typescript
// Expected but not implemented:
GET /white-label/:venueSlug/assets/logo.png
GET /white-label/:venueSlug/theme.css
```

2. **No runtime theme injection:**
```typescript
// Expected in frontend:
const theme = await fetch(`/api/white-label/${venueId}/theme`);
document.documentElement.style.setProperty('--primary-color', theme.primaryColor);
```

3. **No custom domain SSL provisioning:**
```typescript
// Expected:
POST /venues/:venueId/white-label/domains
{ domain: 'tickets.venue.com' }
→ Provisions SSL via Let's Encrypt
```

4. **No domain verification flow:**
```typescript
// Expected:
GET /venues/:venueId/white-label/domains/:domainId/verify
→ Checks DNS records for verification token
```

**Key Files:**
- `venue-service/src/models/white-label.model.ts`
- `venue-service/src/models/custom-domain.model.ts`
- No white-label service or domain service

---

### 18. WAITLIST_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ✅ COMPLETE |
| Priority | P3 |

**What Works:**
- Join waitlist for sold-out events
- Position tracking
- Automatic notification when tickets available
- Waitlist expiration
- Priority ordering

**Waitlist Schema:**
```sql
CREATE TABLE event_waitlists (
  id UUID PRIMARY KEY,
  event_id UUID REFERENCES events(id),
  user_id UUID REFERENCES users(id),
  email VARCHAR(255),                   -- For guest waitlist
  ticket_tier_id UUID,                  -- Specific tier wanted
  quantity INTEGER DEFAULT 1,
  position INTEGER,                     -- Queue position
  status VARCHAR(20) DEFAULT 'waiting', -- waiting, notified, expired, converted
  notified_at TIMESTAMP,
  expires_at TIMESTAMP,                 -- Offer expiration
  converted_at TIMESTAMP,               -- When they purchased
  created_at TIMESTAMP
);
```

**API Endpoints:**
| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/events/:eventId/waitlist` | POST | Join waitlist | ✅ Working |
| `/events/:eventId/waitlist/position` | GET | Check position | ✅ Working |
| `/events/:eventId/waitlist` | DELETE | Leave waitlist | ✅ Working |

**Notification Trigger:**
```typescript
// When tickets become available (via cancellation or release):
async notifyWaitlist(eventId: string, availableQuantity: number) {
  const waitlistEntries = await this.getNextInLine(eventId, availableQuantity);
  
  for (const entry of waitlistEntries) {
    await this.notificationService.send({
      type: 'waitlist_available',
      userId: entry.userId,
      data: {
        eventId,
        expiresAt: addMinutes(new Date(), 30)  // 30 min to purchase
      }
    });
    
    await this.updateStatus(entry.id, 'notified', new Date());
  }
}
```

**Key Files:**
- `event-service/src/routes/waitlist.routes.ts`
- `event-service/src/services/waitlist.service.ts`
- `event-service/src/models/waitlist.model.ts`

---

### 19. WILL_CALL_FLOW_AUDIT.md

| Field | Value |
|-------|-------|
| Status | ❌ NOT IMPLEMENTED |
| Priority | P3 |

**What Exists:**
```sql
-- tickets table has:
delivery_method VARCHAR(30),  -- 'digital', 'will_call', 'mail'
```

**What's Missing - Everything Else:**

| Feature | Status |
|---------|--------|
| Will call list generation | ❌ Not implemented |
| ID verification workflow | ❌ Not implemented |
| Will call check-in UI | ❌ Not implemented |
| Authorized pickup (alternate names) | ❌ Not implemented |
| Will call hours configuration | ❌ Not implemented |
| Will call location/instructions | ❌ Not implemented |
| Will call pickup confirmation | ❌ Not implemented |

**Expected Implementation:**
```typescript
// Will call list for venue staff
GET /events/:eventId/will-call
→ Returns list of tickets for pickup

// Mark as picked up
POST /events/:eventId/will-call/:ticketId/pickup
{
  pickedUpBy: 'John Doe',
  idType: 'drivers_license',
  idLastFour: '1234',
  signature: 'base64...'
}

// Add authorized alternate
POST /tickets/:ticketId/will-call/authorize
{
  authorizedName: 'Jane Doe',
  relationship: 'spouse'
}
```

**Expected Schema:**
```sql
CREATE TABLE will_call_pickups (
  id UUID PRIMARY KEY,
  ticket_id UUID REFERENCES tickets(id),
  event_id UUID REFERENCES events(id),
  original_purchaser_name VARCHAR(255),
  authorized_alternates JSONB,      -- [{name, relationship}]
  picked_up_at TIMESTAMP,
  picked_up_by VARCHAR(255),
  id_verified BOOLEAN,
  id_type VARCHAR(50),
  staff_id UUID REFERENCES users(id),
  signature_url VARCHAR(500),
  notes TEXT
);
```

**Key Files:**
- `ticket-service/src/models/ticket.model.ts` (delivery_method only)
- No will call service or routes

---

## STATISTICS

| Status | Count | Percentage |
|--------|-------|------------|
| ✅ Complete | 10 | 53% |
| ⚠️ Partial | 7 | 37% |
| ❌ Not Implemented | 2 | 11% |

---

## CROSS-CUTTING CONCERNS

### Event Lifecycle Dependencies
```
Event Creation → Ticket Tiers → Seating (optional) → Publish
     ↓
Event Published → Sales Active → Waitlist (if sold out)
     ↓
Event Date Approaching → Reminders → Will Call List
     ↓
Event Completed OR Cancelled → Analytics → Payouts
```

### Venue Lifecycle Dependencies
```
Venue Creation → Onboarding → Stripe Connect → Verification
     ↓
Venue Approved → Can Create Events
     ↓
Venue Active → Events, Staff, Settings, Branding
     ↓
Venue Deletion → Cascade: Events, Tickets, Orders, Payments
```

### Integration Points
- Event cancellation must trigger: notification-service, payment-service (refunds), marketplace-service
- Venue deletion must trigger: All services for cascade cleanup
- Ticket tier changes must validate: existing tickets, pending orders
- Status transitions must enforce: business rules, side effects

---

## RECOMMENDED FIX ORDER

1. **P0: Event cancellation cascade**
   - Uncomment notification publishing
   - Add refund trigger
   - Cancel marketplace listings
   - Effort: 2-3 days

2. **P0: Venue deletion cascade**
   - Implement full deletion service
   - Add checks for active events
   - Process refunds before deletion
   - Effort: 3-4 days

3. **P1: Event status state machine**
   - Add transition validation
   - Implement side effect triggers
   - Block invalid transitions
   - Effort: 2 days

4. **P1: Ticket tier deletion safety**
   - Check for sold tickets
   - Require migration or rejection
   - Effort: 1 day

5. **P2: Venue approval workflow**
   - Add admin endpoints
   - Add approval queue
   - Add notifications
   - Effort: 2 days

6. **P2: Seating management API**
   - Add seat selection endpoints
   - Add real-time availability
   - Add hold/release logic
   - Effort: 5-7 days

7. **P2: White-label serving**
   - CDN integration
   - Runtime theme injection
   - Custom domain SSL
   - Effort: 4-5 days

8. **P3: Will call system**
   - Full implementation
   - Effort: 3-4 days
