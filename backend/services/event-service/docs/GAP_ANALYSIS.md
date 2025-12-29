# Event Service - Frontend/Backend Gap Analysis

Generated: 2024-12-27
Status: REVIEWED

---

## Critical Issues From Audits

### GAP-EVENT-001: No State Machine Implementation
- **Severity:** CRITICAL
- **Audit:** 28-event-state-management.md
- **Current:** Any status can be set without validation
- **Needed:** 
  - Valid transition map (DRAFT → PUBLISHED, etc.)
  - Terminal states enforced (COMPLETED, CANCELLED cannot transition)
  - `canSellTickets(eventId)` check for ticket-service
- **Impact:** Can sell tickets for DRAFT/CANCELLED events

### GAP-EVENT-002: Row Level Security Not Implemented
- **Severity:** CRITICAL  
- **Audit:** 09-multi-tenancy.md
- **Current:** Other services have RLS, event-service does NOT
- **Needed:**
  - Enable RLS on all tables
  - SET LOCAL app.current_tenant_id in middleware
  - Add tenant policies
- **Impact:** Potential cross-tenant data leakage

### GAP-EVENT-003: No Automatic State Transitions
- **Severity:** HIGH
- **Audit:** 28-event-state-management.md, 38-time-sensitive-operations.md
- **Current:** No scheduled jobs exist
- **Needed:**
  - Cron job: sales_start_at → ON_SALE
  - Cron job: event starts → IN_PROGRESS  
  - Cron job: event ends → COMPLETED
- **Impact:** Events stay in wrong state forever

### GAP-EVENT-004: Incomplete Cancellation Workflow
- **Severity:** HIGH
- **Audit:** 28-event-state-management.md
- **Current:** Sets status to CANCELLED, that's it
- **Needed:**
  - Pause sales immediately
  - Invalidate all tickets
  - Trigger refunds via payment-service
  - Notify all ticket holders
  - Cancel marketplace listings
  - Generate cancellation report
- **Impact:** Cancelled events leave orphaned tickets, no refunds

### GAP-EVENT-005: No Circuit Breaker
- **Severity:** HIGH
- **Audit:** 03-error-handling.md
- **Current:** venue-service client has circuit breaker, but no others
- **Needed:** Circuit breaker for all external service calls
- **Impact:** Cascading failures

---

## Frontend-Related Gaps

### GAP-EVENT-006: No Artist/Performer Table
- **Severity:** CRITICAL (Platform-wide)
- **Current:** `performers` is JSONB field on events
- **Needed:**
  - `artists` table (id, name, bio, image, genres, social_links, etc.)
  - `event_artists` junction table (event_id, artist_id, role, billing_order)
  - Link to user accounts via auth-service `user_artist_roles`
- **Impact:** Cannot build Artist Portal
- **See:** PLATFORM_GAPS.md

### GAP-EVENT-007: No User Saved Events
- **Severity:** HIGH
- **Current:** No way for users to save events
- **Needed:**
  - `user_saved_events` table (user_id, event_id, saved_at)
  - POST /events/:id/save
  - DELETE /events/:id/save  
  - GET /me/saved-events (or GET /users/:id/saved-events)
- **Impact:** Cannot build "saved events" feature in consumer app

### GAP-EVENT-008: No Follow System
- **Severity:** HIGH
- **Current:** No follow functionality
- **Needed:**
  - `user_follows` table (user_id, followable_type, followable_id)
  - POST /venues/:id/follow, DELETE /venues/:id/follow
  - POST /artists/:id/follow, DELETE /artists/:id/follow
  - GET /me/following
- **Impact:** Cannot build "following" feed, no venue/artist follow notifications
- **See:** PLATFORM_GAPS.md

### GAP-EVENT-009: No Event Recommendations Endpoint
- **Severity:** MEDIUM
- **Current:** marketplace-service has /recommended, event-service does not
- **Needed:** GET /events/recommended
- **Impact:** Cannot personalize home page

### GAP-EVENT-010: No Trending Events Endpoint
- **Severity:** MEDIUM
- **Current:** view_count, interest_count, share_count fields exist but no endpoint
- **Needed:** GET /events/trending
- **Impact:** Cannot show "hot" or "trending" events

### GAP-EVENT-011: No Modification Notifications
- **Severity:** MEDIUM
- **Audit:** 28-event-state-management.md
- **Current:** Events can be modified without notifying ticket holders
- **Needed:**
  - Detect significant changes (date, venue, time)
  - Notify all ticket holders via notification-service
  - Offer refund window for major changes
- **Impact:** Customers don't know event changed

---

## Existing Endpoints (Verified Working)

### Events
- GET /events ✅
- GET /events/:id ✅
- POST /events ✅
- PUT /events/:id ✅
- DELETE /events/:id ✅
- POST /events/:id/publish ✅
- GET /venues/:venueId/events ✅
- POST /events/:eventId/cancel ✅

### Schedules
- GET /events/:eventId/schedules ✅
- POST /events/:eventId/schedules ✅
- GET /events/:eventId/schedules/upcoming ✅
- GET /events/:eventId/schedules/next ✅
- GET /events/:eventId/schedules/:scheduleId ✅
- PUT /events/:eventId/schedules/:scheduleId ✅

### Capacity
- GET /events/:eventId/capacity ✅
- GET /events/:eventId/capacity/total ✅
- GET /capacity/:id ✅
- POST /events/:eventId/capacity ✅
- PUT /capacity/:id ✅
- POST /capacity/:id/check ✅
- POST /capacity/:id/reserve ✅

### Pricing
- GET /events/:eventId/pricing ✅
- GET /events/:eventId/pricing/active ✅
- GET /pricing/:id ✅
- POST /events/:eventId/pricing ✅
- PUT /pricing/:id ✅
- POST /pricing/:id/calculate ✅

### Ticket Types
- GET /events/:id/ticket-types ✅
- POST /events/:id/ticket-types ✅
- PUT /events/:id/ticket-types/:typeId ✅

### Content (MongoDB)
- POST /:eventId/content ✅
- GET /:eventId/content ✅
- GET /:eventId/gallery ✅
- GET /:eventId/lineup ✅
- GET /:eventId/performers ✅

### Reviews (MongoDB)
- POST /:eventId/reviews ✅
- GET /:eventId/reviews ✅
- POST /:eventId/ratings ✅
- GET /:eventId/ratings/summary ✅

### Analytics
- GET /venues/:venueId/dashboard ✅
- GET /venues/:venueId/analytics ✅
- GET /reports/sales ✅
- GET /customers/:customerId/profile ✅

---

## Database Tables

| Table | Status | Notes |
|-------|--------|-------|
| event_categories | ✅ | 10 seeded categories |
| events | ✅ | 50+ fields, needs RLS |
| event_schedules | ✅ | Recurring support |
| event_capacity | ✅ | Reservation system |
| event_pricing | ✅ | Dynamic pricing |
| event_metadata | ✅ | Extended data |
| artists | ❌ | MISSING |
| event_artists | ❌ | MISSING |
| user_saved_events | ❌ | MISSING |
| user_follows | ❌ | MISSING (platform-wide) |

---

## Cross-Service Dependencies

| This service needs from | What |
|------------------------|------|
| venue-service | Venue validation, capacity |
| auth-service | User-artist roles (when artists added) |
| notification-service | Event change notifications, cancellation notifications |
| payment-service | Refund triggers on cancellation |
| ticket-service | Ticket invalidation on cancellation |
| marketplace-service | Listing cancellation on event cancel |

| Other services need from this | What |
|------------------------------|------|
| ticket-service | canSellTickets(eventId) check |
| search-service | Event data for indexing |
| analytics-service | Event metrics |
| marketplace-service | Event details for listings |

---

## Priority Order for Fixes

### Immediate (Security/Data Integrity)
1. GAP-EVENT-002: Enable RLS
2. GAP-EVENT-001: Implement state machine

### This Week (Core Functionality)
3. GAP-EVENT-004: Cancellation workflow
4. GAP-EVENT-003: Automatic state transitions

### This Month (Frontend Features)
5. GAP-EVENT-006: Artist system (with auth-service)
6. GAP-EVENT-007: Saved events
7. GAP-EVENT-008: Follow system
8. GAP-EVENT-009: Recommendations
9. GAP-EVENT-010: Trending
10. GAP-EVENT-011: Modification notifications

