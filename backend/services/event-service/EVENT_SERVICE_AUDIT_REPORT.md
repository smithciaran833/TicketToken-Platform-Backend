# EVENT-SERVICE COMPREHENSIVE AUDIT REPORT

**Audit Date:** 2026-01-23
**Service:** event-service
**Files Analyzed:** 100+ TypeScript files
**Auditor:** Claude Opus 4.5

---

## EXECUTIVE SUMMARY

Event-service is a well-architected service managing the full event lifecycle (draft → published → on_sale → in_progress → completed/cancelled). The service demonstrates strong security practices with **HMAC-SHA256 authentication** for internal endpoints and proper **RLS (Row Level Security)** enforcement. However, there is **one critical service boundary violation** where the service directly queries the `tickets` table owned by ticket-service.

| Category | Status | Details |
|----------|--------|---------|
| S2S Authentication | ✅ COMPLIANT | HMAC-SHA256 via @tickettoken/shared |
| Service Boundaries | ❌ 1 VIOLATION | Direct `db('tickets')` query in internal.routes.ts |
| Database Security | ✅ GOOD | RLS on 5 tables, optimistic locking |
| Code Quality | ⚠️ FAIR | 194 `any` usages, ~40 TODOs |
| State Machine | ✅ EXCELLENT | Well-implemented event lifecycle |

---

## 1. SERVICE CAPABILITIES

### Public Endpoints

| Method | Path | Controller | Purpose |
|--------|------|------------|---------|
| GET | /events | events.controller.listEvents | List events with pagination |
| GET | /events/:id | events.controller.getEvent | Get single event details |
| POST | /events | events.controller.createEvent | Create new event |
| PUT | /events/:id | events.controller.updateEvent | Update event |
| DELETE | /events/:id | events.controller.deleteEvent | Soft-delete event |
| POST | /events/:id/publish | events.controller.publishEvent | Publish event |
| GET | /venues/:venueId/events | events.controller.getVenueEvents | Get events by venue |
| GET | /events/:eventId/capacity | capacity.controller.getEventCapacity | Get capacity sections |
| GET | /events/:eventId/capacity/total | capacity.controller.getTotalCapacity | Get aggregated capacity |
| GET | /capacity/:id | capacity.controller.getCapacityById | Get single capacity section |
| POST | /events/:eventId/capacity | capacity.controller.createCapacity | Create capacity section |
| PUT | /capacity/:id | capacity.controller.updateCapacity | Update capacity |
| POST | /capacity/:id/check | capacity.controller.checkAvailability | Check availability |
| POST | /capacity/:id/reserve | capacity.controller.reserveCapacity | Reserve capacity |
| GET | /events/:eventId/pricing | pricing.controller.getEventPricing | Get pricing tiers |
| GET | /events/:eventId/pricing/active | pricing.controller.getActivePricing | Get active pricing |
| GET | /pricing/:id | pricing.controller.getPricingById | Get single pricing |
| POST | /events/:eventId/pricing | pricing.controller.createPricing | Create pricing tier |
| PUT | /pricing/:id | pricing.controller.updatePricing | Update pricing |
| POST | /pricing/:id/calculate | pricing.controller.calculatePrice | Calculate final price |
| POST | /events/:eventId/cancel | cancellation.controller.cancelEvent | Cancel event with refunds |

### Internal Endpoints (S2S Only)

| Method | Path | Called By | Purpose |
|--------|------|-----------|---------|
| GET | /internal/events/:eventId | minting-service, payment-service | Get event with blockchain fields |
| GET | /internal/events/:eventId/pda | minting-service, blockchain-service | Get blockchain PDA data |
| GET | /internal/events/:eventId/scan-stats | scanning-service | Get ticket scan statistics |

### Business Operations

- **Event Lifecycle Management**: DRAFT → REVIEW → APPROVED → PUBLISHED → ON_SALE → SOLD_OUT → IN_PROGRESS → COMPLETED
- **Capacity Management**: Section-based capacity with reservations, locking, expiration
- **Dynamic Pricing**: Base price, early bird, last minute, group discounts, min/max bounds
- **Blockchain Integration**: Event PDA creation, artist/venue royalty percentages
- **Event Cancellation**: Orchestrated cancellation with ticket invalidation, refund triggers
- **Automated Transitions**: Background jobs for sales start/end, event start/end

---

## 2. DATABASE SCHEMA

### Tables

#### events
**Columns:** id, tenant_id, venue_id, venue_layout_id, name, slug, description, short_description, event_type, primary_category_id, secondary_category_ids[], tags[], status, visibility, is_featured, priority_score, status_reason, status_changed_by, status_changed_at, banner_image_url, thumbnail_image_url, image_gallery, video_url, virtual_event_url, age_restriction, dress_code, special_requirements[], accessibility_info, collection_address, mint_authority, royalty_percentage, is_virtual, is_hybrid, streaming_platform, streaming_config, cancellation_policy, refund_policy, cancellation_deadline_hours, start_date, allow_transfers, max_transfers_per_ticket, transfer_blackout_start, transfer_blackout_end, require_identity_verification, meta_title, meta_description, meta_keywords[], view_count, interest_count, share_count, external_id, metadata, created_by, updated_by, created_at, updated_at, deleted_at, version

**Indexes:**
- idx_events_tenant_id
- idx_events_venue_id
- idx_events_venue_status
- idx_events_slug
- idx_events_status
- idx_events_primary_category_id
- idx_events_created_at
- idx_events_deleted_at
- idx_events_is_featured_priority
- idx_events_tenant_status
- idx_events_venue_slug (UNIQUE, WHERE deleted_at IS NULL)
- idx_events_metadata_gin (GIN)
- idx_events_accessibility_gin (GIN)
- idx_events_tenant_venue
- idx_events_tenant_created
- idx_events_tenant_category
- idx_events_id_version
- idx_events_status_changed_at
- idx_events_search (GIN full-text search)

**RLS:** Yes - tenant_isolation policies for SELECT, INSERT, UPDATE, DELETE

**CHECK Constraints:**
- events_status_check: DRAFT, REVIEW, APPROVED, PUBLISHED, ON_SALE, SOLD_OUT, IN_PROGRESS, COMPLETED, CANCELLED, POSTPONED
- events_visibility_check: PUBLIC, PRIVATE, UNLISTED
- events_event_type_check: single, recurring, series
- events_royalty_percentage_check: 0-100
- events_age_restriction_check: >= 0
- events_priority_score_check: >= 0
- events_view_count_check, events_interest_count_check, events_share_count_check: >= 0

**Optimistic Locking:** Yes (version column with auto-increment trigger)

#### event_schedules
**Columns:** id, tenant_id, event_id, starts_at, ends_at, doors_open_at, is_recurring, recurrence_rule, recurrence_end_date, occurrence_number, timezone, utc_offset, status, status_reason, capacity_override, check_in_opens_at, check_in_closes_at, notes, metadata, created_at, updated_at, deleted_at, version

**Indexes:** tenant_id, event_id, starts_at, status, tenant_starts, tenant_event

**RLS:** Yes
**CHECK:** status IN (SCHEDULED, CONFIRMED, IN_PROGRESS, COMPLETED, CANCELLED, POSTPONED, RESCHEDULED)

#### event_capacity
**Columns:** id, tenant_id, event_id, schedule_id, section_name, section_code, tier, total_capacity, available_capacity, reserved_capacity, buffer_capacity, sold_count, pending_count, reserved_at, reserved_expires_at, locked_price_data, row_config, seat_map, is_active, is_visible, minimum_purchase, maximum_purchase, created_at, updated_at, deleted_at, version

**Indexes:** tenant_id, event_id, schedule_id, available_capacity, reserved_expires_at, unique on (event_id, section_name, schedule_id)

**RLS:** Yes
**CHECK:** total_capacity > 0, available_capacity >= 0, reserved_capacity >= 0, sold_count >= 0, minimum_purchase >= 1

#### event_pricing
**Columns:** id, tenant_id, event_id, schedule_id, capacity_id, name, description, tier, base_price, service_fee, facility_fee, tax_rate, is_dynamic, min_price, max_price, price_adjustment_rules, current_price, early_bird_price, early_bird_ends_at, last_minute_price, last_minute_starts_at, group_size_min, group_discount_percentage, currency, sales_start_at, sales_end_at, max_per_order, max_per_customer, is_active, is_visible, display_order, created_at, updated_at, deleted_at, version

**Indexes:** tenant_id, event_id, schedule_id, capacity_id, active_sales composite

**RLS:** Yes
**CHECK:** All price fields >= 0, tax_rate 0-1, group_discount_percentage 0-100

#### event_metadata
**Columns:** id, tenant_id, event_id (unique), performers, headliner, supporting_acts[], production_company, technical_requirements, stage_setup_time_hours, sponsors, primary_sponsor, performance_rights_org, licensing_requirements[], insurance_requirements, press_release, marketing_copy, social_media_copy, sound_requirements, lighting_requirements, video_requirements, catering_requirements, rider_requirements, production_budget, marketing_budget, projected_revenue, break_even_capacity, previous_events, custom_fields, created_at, updated_at, deleted_at

**RLS:** Yes
**Note:** No version column (static data, low concurrency)

#### event_categories (GLOBAL - No RLS)
**Columns:** id, parent_id, name, slug (unique), description, icon, color, display_order, is_active, is_featured, meta_title, meta_description, event_count, created_at, updated_at

**Pre-seeded:** Music, Sports, Theater, Comedy, Arts, Conference, Workshop, Festival, Family, Nightlife

### Schema Quality Assessment

| Aspect | Rating | Notes |
|--------|--------|-------|
| Index Coverage | ✅ Excellent | Comprehensive indexes including GIN for JSONB and full-text |
| RLS Policies | ✅ Excellent | All tenant tables protected with system user bypass |
| Constraints | ✅ Good | CHECK constraints prevent invalid data |
| Optimistic Locking | ✅ Good | 4 tables have version columns |
| Foreign Keys | ✅ Good | Proper cascade/restrict behaviors |
| Soft Deletes | ✅ Good | deleted_at on all tables |

---

## 3. SECURITY ANALYSIS

### A. S2S Authentication

**internal-auth.middleware.ts Analysis:**

```typescript
// Uses: HMAC-SHA256 via @tickettoken/shared
// Algorithm: HMAC-SHA256 with 60-second replay window
// Matches Standardization: ✅ YES

const hmacValidator = createHmacValidator({
  secret: INTERNAL_HMAC_SECRET,
  serviceName: SERVICE_NAME,
  replayWindowMs: 60000, // Audit #16 compliance
});
```

**Key Security Features:**
- ✅ Uses `createHmacValidator` from `@tickettoken/shared`
- ✅ Replay attack prevention (60-second window)
- ✅ Service allowlist validation (ALLOWED_SERVICES)
- ✅ Proper error handling for SignatureError, ReplayAttackError, HmacError
- ✅ Feature flag (USE_NEW_HMAC) for gradual rollout

**Outbound Service Calls:**

| Service Called | File | Line | Auth Method | Issue |
|----------------|------|------|-------------|-------|
| venue-service | event.service.ts | 168 | `venueServiceClient` (HMAC) | ✅ Correct |
| venue-service | event.service.ts | 173 | `venueServiceClient.getVenueInternal` | ✅ Correct |
| venue-service | capacity.service.ts | 411 | `venueServiceClient.getVenueInternal` | ✅ Correct |
| venue-service | blockchain.service.ts | 323 | `venueServiceClient.getVenueInternal` | ✅ Correct |

**S2S Authentication Summary:** ✅ COMPLIANT - All outbound calls use `@tickettoken/shared` clients with HMAC

### B. Service Boundary Violations

**CRITICAL FINDING: Direct Database Access to tickets Table**

| File | Line | Table Accessed | Owned By | Violation |
|------|------|----------------|----------|-----------|
| internal.routes.ts | 223 | `db('tickets')` | ticket-service | ❌ VIOLATION |

```typescript
// src/routes/internal.routes.ts:223-235
const ticketStats = await db('tickets')
  .where('event_id', eventId)
  .whereNull('deleted_at')
  .select(
    db.raw('COUNT(*) as total_tickets'),
    db.raw("COUNT(CASE WHEN status = 'SOLD' THEN 1 END) as sold_tickets"),
    // ... more aggregations
  )
  .first();
```

**Impact:** This violates service boundaries by directly querying the `tickets` table which is owned by ticket-service. This should be replaced with an HTTP call to ticket-service's internal API.

**Recommended Fix:**
```typescript
// Should call ticket-service internal endpoint instead
const ticketStats = await ticketServiceClient.getEventTicketStats(eventId, ctx);
```

**Other Boundary Compliance:**
- ✅ `getSoldTicketCount()` in event.service.ts correctly reads from `event_capacity.sold_count` (local table)
- ✅ Venue validation uses `venueServiceClient` (not direct DB access)
- ✅ No direct access to `users`, `orders`, `payments` tables

### C. SQL Injection Analysis

**String Interpolation in SQL:**
- ✅ All queries use parameterized queries via Knex query builder
- ✅ `knex.raw()` uses proper parameter binding: `$1, $2, $3`
- ✅ No string concatenation in WHERE clauses

**Example (Safe):**
```typescript
// src/services/event.service.ts:482
const event = await this.db('events')
  .where({ id: eventId, tenant_id: tenantId })  // Parameterized
  .whereNull('deleted_at')
  .first();
```

**SQL Injection Status:** ✅ NO ISSUES FOUND

### D. Other Security

**Rate Limiting:**
- ✅ @fastify/rate-limit configured (package.json)
- Location: src/middleware/rate-limit.ts

**Input Validation:**
- ✅ Comprehensive JSON Schema validation on all routes
- ✅ `additionalProperties: false` prevents prototype pollution
- ✅ UUID pattern validation for ID parameters
- ✅ URL format validation with `format: 'uri'`
- ✅ Date validation with custom dateTimePattern

**Tenant Isolation:**
- ✅ RLS policies on all tenant tables
- ✅ tenant_id required and validated in all queries
- ✅ System user bypass only with `app.is_system_user = 'true'`

### CRITICAL ISSUES SUMMARY

| # | Issue | Severity | Location | Impact |
|---|-------|----------|----------|--------|
| 1 | Direct `tickets` table query | CRITICAL | internal.routes.ts:223 | Service boundary violation |

---

## 4. CODE QUALITY

### TODO/FIXME Comments (Total: ~40)

| File | Line | Comment |
|------|------|---------|
| event-cancellation.service.ts | 371 | TODO: Replace with actual ticket-service HTTP client call |
| event-cancellation.service.ts | 387 | TODO: Replace with actual payment-service HTTP client call |
| event-cancellation.service.ts | 432 | TODO: Call ticket-service to invalidate tickets |
| event-cancellation.service.ts | 451 | TODO: Replace with actual marketplace-service HTTP client call |
| event-cancellation.service.ts | 464 | TODO: Replace with actual notification-service HTTP client call |
| event.service.ts | 431 | TODO: Publish to message queue instead of direct call |
| event.service.ts | 470 | TODO: Implement retry logic with exponential backoff |
| event.service.ts | 821 | TODO: If ticket-service API is available, call it |
| event-state-machine.ts | 444 | TODO: Implement actual notification service integration |
| auth.ts | 273 | TODO Phase 2: Query service_tenant_permissions table |
| auth.ts | 277 | TODO Phase 2: Token Revocation Check |
| auth.ts | 288 | TODO Phase 2: Granular permissions per service |
| notification.controller.ts | 26 | TODO: Implement service-to-service call to notification-service |

### `any` Type Usage

**Total: 194 occurrences across 49 files**

| File | Count | Severity |
|------|-------|----------|
| event.service.ts | 17 | High |
| event.model.ts | 12 | Medium |
| event-reviews.controller.ts | 10 | Medium |
| event-content.controller.ts | 11 | Medium |
| service-auth.ts | 9 | Medium |
| event-cancellation.service.ts | 8 | Medium |

### Dead Code
- No significant dead code detected
- Some placeholder controllers (notification.controller.ts) should be removed or connected

### Error Handling

**Good Practices:**
- ✅ Custom error classes (NotFoundError, ValidationError, ForbiddenError, ConflictError, EventStateError)
- ✅ RFC 7807 Problem Details format via createProblemError()
- ✅ Global error handler with consistent formatting
- ✅ Transaction rollback on errors

**Issues:**
- ⚠️ Some catch blocks only log and re-throw without enrichment
- ⚠️ Some async error paths missing proper error wrapping

### Duplicate Code
- ⚠️ Venue validation pattern repeated in multiple methods (could be abstracted)
- ⚠️ Tenant context creation pattern repeated

---

## 5. EVENT STATE MACHINE

### States

```
DRAFT → REVIEW → APPROVED → PUBLISHED → ON_SALE → SOLD_OUT
                                           ↓          ↓
                                     SALES_PAUSED     ↓
                                           ↓          ↓
                                      IN_PROGRESS ←←←←
                                           ↓
                                      COMPLETED

Any State → CANCELLED (except terminal)
Some States → POSTPONED → RESCHEDULED → PUBLISHED
```

| State | Description | Ticket Sales |
|-------|-------------|--------------|
| DRAFT | Initial creation | ❌ Blocked |
| REVIEW | Pending approval | ❌ Blocked |
| APPROVED | Ready to publish | ❌ Blocked |
| PUBLISHED | Visible, no sales | ❌ Blocked |
| ON_SALE | Tickets available | ✅ Allowed |
| SALES_PAUSED | Temporarily halted | ❌ Blocked |
| SOLD_OUT | No capacity | ❌ Blocked |
| IN_PROGRESS | Event started | ❌ Blocked |
| COMPLETED | Event ended | ❌ Blocked (terminal) |
| CANCELLED | Event cancelled | ❌ Blocked (terminal) |
| POSTPONED | Delayed | ❌ Blocked |
| RESCHEDULED | New date set | ❌ Blocked |

### Transitions

| From | To | Trigger | Guards | Side Effects |
|------|----|---------|---------|--------------|
| DRAFT | REVIEW | SUBMIT_FOR_REVIEW | - | - |
| DRAFT | PUBLISHED | PUBLISH | - | Search index update |
| DRAFT | CANCELLED | CANCEL | - | - |
| REVIEW | APPROVED | APPROVE | - | - |
| REVIEW | DRAFT | REJECT | - | - |
| APPROVED | PUBLISHED | PUBLISH | - | Search index, RabbitMQ event |
| PUBLISHED | ON_SALE | START_SALES | sales_start_date reached | RabbitMQ event |
| ON_SALE | SALES_PAUSED | PAUSE_SALES | - | - |
| ON_SALE | SOLD_OUT | SOLD_OUT | available_capacity = 0 | RabbitMQ event |
| ON_SALE | IN_PROGRESS | START_EVENT | start_date reached | - |
| SALES_PAUSED | ON_SALE | RESUME_SALES | - | - |
| IN_PROGRESS | COMPLETED | END_EVENT | end_date reached | RabbitMQ event |
| Any | CANCELLED | CANCEL | Not terminal | Refunds triggered, notifications |

### State Machine Quality

| Aspect | Rating | Notes |
|--------|--------|-------|
| Transition Validation | ✅ Excellent | `validateTransition()` enforces valid paths |
| Terminal State Protection | ✅ Excellent | COMPLETED/CANCELLED cannot transition |
| Sales Blocking | ✅ Excellent | `areSalesBlocked()` checks correctly |
| Modification Guards | ✅ Good | `canModify()` considers tickets sold |
| Audit Trail | ✅ Good | status_reason, status_changed_by, status_changed_at tracked |
| Notification Triggers | ⚠️ Placeholder | `notifyTicketHoldersOfModification()` not fully implemented |

---

## 6. SERVICE INTEGRATION

### Inbound Dependencies (Services calling event-service)

| Service | Endpoint | Purpose |
|---------|----------|---------|
| minting-service | /internal/events/:eventId | Get event for ticket minting |
| minting-service | /internal/events/:eventId/pda | Get blockchain PDA |
| payment-service | /internal/events/:eventId | Get event details for payment |
| scanning-service | /internal/events/:eventId/scan-stats | Get scan statistics |
| blockchain-service | /internal/events/:eventId/pda | Get blockchain data |

### Outbound Dependencies

| Service | Endpoint | File | Line | Method | Status |
|---------|----------|------|------|--------|--------|
| venue-service | /internal/venues/:id | event.service.ts | 168 | `venueServiceClient` (HMAC) | ✅ Correct |
| venue-service | /internal/venues/:id | event.service.ts | 173 | `venueServiceClient.getVenueInternal` | ✅ Correct |
| venue-service | /internal/venues/:id | capacity.service.ts | 411 | `venueServiceClient.getVenueInternal` | ✅ Correct |
| venue-service | /internal/venues/:id | blockchain.service.ts | 323 | `venueServiceClient.getVenueInternal` | ✅ Correct |
| ticket-service | (direct DB) | internal.routes.ts | 223 | `db('tickets')` | ❌ VIOLATION |
| ticket-service | (TODO) | event-cancellation.service.ts | 371 | Placeholder | ⚠️ Not implemented |
| payment-service | (TODO) | event-cancellation.service.ts | 387 | Placeholder | ⚠️ Not implemented |
| marketplace-service | (TODO) | event-cancellation.service.ts | 451 | Placeholder | ⚠️ Not implemented |
| notification-service | (TODO) | event-cancellation.service.ts | 464 | Placeholder | ⚠️ Not implemented |

### RabbitMQ Events

**Exchange:** `tickettoken_events` (topic)

**Published Events:**

| Routing Key | Trigger | Payload |
|-------------|---------|---------|
| event.created | Event creation | eventId, name, organizerId, venueId, startDate, status |
| event.updated | Event update | eventId, changes object |
| event.cancelled | Event cancellation | eventId, reason, cancelledBy, affectedTickets |
| event.published | Event published | eventId, name, startDate, venueId |
| event.deleted | Event soft-delete | eventId |
| event.reminder | Scheduled (not impl) | eventId, type, hoursUntilEvent |
| event.soldout | Capacity exhausted | eventId, totalCapacity, ticketsSold |
| event.rescheduled | Date change | eventId, oldStartDate, newStartDate, reason |
| event.capacity.warning | 80% sold | eventId, percentSold, remaining |
| event.capacity.critical | 95% sold | eventId, percentSold, remaining |

**Consumed Events:** None (event-service is primarily a producer)

---

## 7. TIME-SENSITIVE OPERATIONS

### Timezone Handling

**Implementation:** src/utils/timezone-validator.ts

```typescript
// Uses Luxon's IANAZone for validation
import { IANAZone } from 'luxon';

export function validateTimezone(timezone: string): boolean {
  return IANAZone.isValidZone(timezone);
}
```

**Features:**
- ✅ IANA timezone validation (e.g., 'America/New_York')
- ✅ Throws descriptive error with Wikipedia link for invalid timezones
- ✅ Default timezone fallback to 'UTC' or venue timezone

### Time-Sensitive Operations

**Implementation:** src/utils/time-sensitive.ts

**Configuration (from environment):**
```typescript
{
  minEventAdvanceHours: 2,       // MIN_EVENT_ADVANCE_HOURS
  maxEventAdvanceDays: 365,      // MAX_EVENT_ADVANCE_DAYS
  modificationCutoffHours: 24,   // MODIFICATION_CUTOFF_HOURS
  salesEndCutoffMinutes: 30,     // SALES_END_CUTOFF_MINUTES
  eventStartBufferMinutes: 15,   // EVENT_START_BUFFER_MINUTES
  eventEndBufferMinutes: 60,     // EVENT_END_BUFFER_MINUTES
}
```

**Key Methods:**
- `validateEventTiming()` - Ensures events not too soon or too far
- `canModifyEvent()` - Blocks modifications within cutoff
- `canSellTickets()` - Validates sales window
- `checkDeadline()` - Operation-specific deadline enforcement
- `getRequiredStateTransition()` - Determines auto-transition needed

### Automated Transitions

**Job:** src/jobs/event-transitions.job.ts

**Schedule:** Every 5 minutes (`*/5 * * * *`)

**Transitions Automated:**
| Trigger | From | To |
|---------|------|----|
| sales_start_date reached | PUBLISHED | ON_SALE |
| sales_end_date reached | ON_SALE | SALES_PAUSED |
| start_date reached | ON_SALE/SOLD_OUT | IN_PROGRESS |
| end_date reached | IN_PROGRESS | COMPLETED |

**Quality:**
- ✅ Distributed locking (Redis) prevents duplicate processing
- ✅ Batch processing (1000 events max per scan)
- ✅ Exponential backoff retry (5 attempts)
- ✅ Metrics tracking (Prometheus)
- ✅ Audit trail (event_status_history table)
- ✅ 45-second lock TTL (1.5x job timeout for safety)

---

## 8. BACKGROUND JOBS

### event-transitions.job.ts

| Aspect | Details |
|--------|---------|
| **Purpose** | Automatic event state transitions based on time |
| **Schedule** | Every 5 minutes (cron: `*/5 * * * *`) |
| **Queue** | Bull queue: EVENT_TRANSITIONS |
| **Concurrency** | 5 concurrent transition jobs, 1 scan job |
| **Timeout** | 30 seconds per job |
| **Retries** | 5 attempts with exponential backoff (2s start, 2x multiplier) |
| **Lock Type** | Redis distributed lock |
| **Lock TTL** | 45 seconds (scan: 60 seconds) |
| **Batch Size** | 1000 events per scan |
| **Error Handling** | ✅ Transaction rollback, audit logging, failed job retention |

**Metrics Exposed:**
- `event_transitions_total` - Counter by transition_type and result
- `event_transition_duration` - Histogram of transition times
- `scan_events_found` - Gauge of events found per transition type
- `lock_acquisition_failures_total` - Counter of lock failures

### Reservation Cleanup

**Implementation:** src/services/reservation-cleanup.service.ts

- Releases expired capacity reservations
- Uses transaction with row locking
- Returns released count for monitoring

---

## 9. COMPARISON TO PREVIOUS SERVICES

| Issue | Auth Service | Venue Service | Event Service |
|-------|--------------|---------------|---------------|
| S2S Auth Method | HMAC ✅ | HMAC ✅ | HMAC ✅ |
| Service Boundaries | Clean ✅ | Clean ✅ | 1 Violation ❌ |
| SQL Injection | 1 issue fixed | 0 issues | 0 issues |
| `any` Type Usage | 195 | 375 | 194 |
| RLS Coverage | 100% | 100% | 100% |
| Optimistic Locking | Yes | Yes | Yes |
| State Machine | N/A | N/A | ✅ Excellent |
| Background Jobs | Token cleanup | None | ✅ Event transitions |
| RabbitMQ | Producer | Consumer | Producer |

**Event-service is WORSE than auth/venue in:**
- Service boundary compliance (1 direct tickets table query)

**Event-service is BETTER than auth/venue in:**
- State machine implementation (comprehensive event lifecycle)
- Background job architecture (distributed locking, metrics, retry logic)
- RabbitMQ integration (full event lifecycle publishing)

**Event-service is SIMILAR to auth/venue in:**
- S2S authentication (all use HMAC via shared library)
- `any` type usage (all services have ~200-400 instances)
- Database security (RLS, constraints, optimistic locking)

---

## CRITICAL ISSUES (Blocking Production)

### 1. Service Boundary Violation - Direct Tickets Table Query

**Location:** `src/routes/internal.routes.ts:223`

**Current Code:**
```typescript
const ticketStats = await db('tickets')
  .where('event_id', eventId)
  .whereNull('deleted_at')
  .select(/* aggregations */)
  .first();
```

**Impact:**
- Violates microservices architecture principles
- Tight coupling between event-service and ticket-service database
- Schema changes in tickets table will break event-service
- RLS policies may not apply correctly across service boundaries

**Recommended Fix:**
```typescript
// Create internal endpoint in ticket-service
// GET /internal/tickets/event/:eventId/stats

// Then call from event-service:
const ticketStats = await ticketServiceClient.getEventTicketStats(eventId, ctx);
```

**Priority:** CRITICAL - Fix before production deployment

---

## HIGH PRIORITY ISSUES

### 1. Event Cancellation Service Integration Incomplete

**Files Affected:** `src/services/event-cancellation.service.ts`

**Issue:** Multiple TODOs for service integration:
- Ticket invalidation via ticket-service (line 371, 432)
- Refund triggering via payment-service (line 387)
- Resale cancellation via marketplace-service (line 451)
- Notification via notification-service (line 464)

**Impact:** Event cancellation workflow is incomplete - refunds and notifications won't work

### 2. Token Revocation Not Implemented

**File:** `src/middleware/auth.ts:277`

**Issue:** TODO for token revocation check - compromised tokens cannot be invalidated

---

## MEDIUM PRIORITY ISSUES

### 1. High `any` Type Usage (194 instances)

Reduces type safety and makes refactoring risky

### 2. Missing Response Schemas on Some Endpoints

Some internal endpoints don't have response schemas defined

### 3. Notification Controller Placeholder

`src/controllers/notification.controller.ts` has placeholder implementations that should be removed or connected

---

## BUSINESS CAPABILITIES

**What does event-service do?**
- Manages the entire event lifecycle from creation to completion/cancellation
- Handles capacity management with reservations and locking
- Provides dynamic pricing with time-based tiers
- Integrates with blockchain for on-chain event creation
- Automates state transitions based on time
- Publishes events to RabbitMQ for cross-service communication

**What breaks if event-service is down?**
- No new events can be created
- Event details cannot be retrieved (affects ticket purchase flow)
- Capacity reservations will timeout but not be properly managed
- Minting service cannot get event PDA data
- Payment service cannot validate events
- Automated state transitions stop (events stuck in wrong states)
- Search index updates stop

---

## SUMMARY

| Metric | Value |
|--------|-------|
| **Files Analyzed** | 100+ TypeScript files |
| **Critical Issues** | 1 (service boundary violation) |
| **High Priority Issues** | 2 (cancellation flow, token revocation) |
| **Medium Priority Issues** | 3 |
| **`any` Type Usage** | 194 instances |
| **TODO Comments** | ~40 |
| **Code Quality** | Fair |
| **S2S Authentication** | ✅ Compliant (HMAC-SHA256) |
| **Database Security** | ✅ Excellent (RLS, constraints, locking) |
| **State Machine** | ✅ Excellent |

**Recommendation:** Fix the critical service boundary violation in `internal.routes.ts:223` before production deployment. The direct `db('tickets')` query must be replaced with an HTTP call to ticket-service's internal API.

---

**Report Generated:** 2026-01-23
**Auditor:** Claude Opus 4.5
