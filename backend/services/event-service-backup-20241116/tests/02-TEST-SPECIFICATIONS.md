# EVENT SERVICE - TEST SPECIFICATIONS

**Version:** 1.0  
**Last Updated:** October 22, 2025  
**Service:** event-service  
**Total Functions:** ~185  
**Total Test Cases:** ~530

---

## 📖 OVERVIEW

This document provides detailed test specifications for every function in the event service. Each function has multiple test cases covering:
- ✅ Happy path (expected behavior)
- ❌ Error cases (validation, authorization, edge cases)
- 🔒 Security (tenant isolation, access control)
- 📊 Performance (caching, rate limiting)
- 🔄 Race conditions (concurrent operations)

---

## TABLE OF CONTENTS

1. [Controllers](#controllers)
   - [events.controller.ts](#eventscontrollerts)
   - [schedule.controller.ts](#schedulecontrollerts)
   - [capacity.controller.ts](#capacitycontrollerts)
   - [tickets.controller.ts](#ticketscontrollerts)
   - [pricing.controller.ts](#pricingcontrollerts)
   - [customer-analytics.controller.ts](#customer-analyticscontrollerts)
   - [report-analytics.controller.ts](#report-analyticscontrollerts)
   - [venue-analytics.controller.ts](#venue-analyticscontrollerts)
   - [notification.controller.ts](#notificationcontrollerts)
2. [Services](#services)
   - [event.service.ts](#eventservicets)
   - [capacity.service.ts](#capacityservicets)
   - [pricing.service.ts](#pricingservicets)
   - [cache-integration.ts](#cache-integrationts)
   - [reservation-cleanup.service.ts](#reservation-cleanupservicets)
   - [venue-service.client.ts](#venue-serviceclientts)
   - [databaseService.ts](#databaseservicets)
   - [redisService.ts](#redisservicets)
3. [Middleware](#middleware)
   - [auth.ts](#authts)
   - [authenticate.ts](#authenticatets)
   - [tenant.ts](#tenantts)
   - [error-handler.ts](#error-handlerts)
4. [Models](#models)
   - [event.model.ts](#eventmodelts)
   - [event-schedule.model.ts](#event-schedulemodelts)
   - [event-capacity.model.ts](#event-capacitymodelts)
   - [event-pricing.model.ts](#event-pricingmodelts)
   - [event-category.model.ts](#event-categorymodelts)
   - [event-metadata.model.ts](#event-metadatamodelts)
   - [base.model.ts](#basemodelts)
5. [Utils](#utils)
   - [audit-logger.ts](#audit-loggerts)
   - [error-response.ts](#error-responsets)
   - [errors.ts](#errorsts)
   - [logger.ts](#loggerts)
   - [metrics.ts](#metricsts)
6. [Validations](#validations)

---

# CONTROLLERS

## events.controller.ts

**Location:** `src/controllers/events.controller.ts`  
**Purpose:** HTTP request handlers for event CRUD operations  
**Priority:** P1 Critical  
**Total Functions:** 7

---

### Function: `createEvent(request, reply)`

**Purpose:** Creates a new event with venue validation and tenant isolation  
**Priority:** P1 Critical  
**Test File:** `tests/unit/controllers/events.controller.test.ts`

**Test Cases:**
```typescript
describe('createEvent', () => {
  test('TC-EC-CE-001: should create event with valid data', async () => {
    // Given: Authenticated user with valid event data including name, venue_id, dates, capacity
    // When: createEvent is called with complete event body
    // Then: Returns 201 status
    // And: Response contains created event with auto-generated ID
    // And: Event slug auto-generated from name
    // And: Event status defaults to 'draft'
    // And: created_by set to authenticated user ID
    // And: tenant_id set to user's tenant
  });

  test('TC-EC-CE-002: should validate venue exists and belongs to tenant', async () => {
    // Given: Valid event data with venue_id
    // When: createEvent is called
    // Then: Calls VenueServiceClient.getVenue() to fetch venue
    // And: Verifies venue.tenant_id matches user.tenantId
    // And: Proceeds with event creation if validation passes
  });

  test('TC-EC-CE-003: should auto-generate unique slug from event name', async () => {
    // Given: Event with name "Summer Music Festival 2025"
    // When: createEvent is called
    // Then: Slug generated as "summer-music-festival-2025"
    // And: Slug is lowercase with hyphens
    // And: Slug is unique within tenant
  });

  test('TC-EC-CE-004: should cache created event in Redis', async () => {
    // Given: Event created successfully in database
    // When: createEvent completes
    // Then: Event cached in Redis with key "event:{event_id}"
    // And: Cache TTL set to 3600 seconds (1 hour)
    // And: Cached data includes all event fields
  });

  test('TC-EC-CE-005: should create initial pricing tiers if provided', async () => {
    // Given: Event data includes tiers array with pricing information
    // When: createEvent is called
    // Then: Creates event in database first
    // And: Creates each pricing tier linked to event_id
    // And: Returns event with pricing tiers populated
  });

  test('TC-EC-CE-006: should create audit log entry for event creation', async () => {
    // Given: Valid event creation request
    // When: createEvent is called
    // Then: Audit log entry created with action 'event.created'
    // And: Log includes user_id, tenant_id, IP address, user agent
    // And: Log includes event data in changes field
  });

  test('TC-EC-CE-007: should publish event.created event to message bus', async () => {
    // Given: Event created successfully
    // When: createEvent completes
    // Then: Publishes event.created event
    // And: Event payload includes event_id and tenant_id
  });

  test('TC-EC-CE-008: should throw 401 without authentication', async () => {
    // Given: No Authorization header or invalid token
    // When: createEvent is called
    // Then: Throws UnauthorizedError
    // And: Returns 401 status
    // And: Response includes error message
  });

  test('TC-EC-CE-009: should throw 403 if venue belongs to different tenant', async () => {
    // Given: Valid venue_id but venue.tenant_id != user.tenantId
    // When: createEvent is called
    // Then: VenueServiceClient throws ForbiddenError
    // And: Returns 403 status
    // And: Does not create event
  });

  test('TC-EC-CE-010: should throw 404 if venue not found', async () => {
    // Given: venue_id that doesn't exist in venue service
    // When: createEvent is called
    // Then: VenueServiceClient throws NotFoundError
    // And: Returns 404 status with "Venue not found"
  });

  test('TC-EC-CE-011: should validate required fields are present', async () => {
    // Given: Event data missing required field (e.g., name)
    // When: createEvent is called
    // Then: Throws ValidationError
    // And: Returns 422 status
    // And: Response includes which fields are missing
  });

  test('TC-EC-CE-012: should validate starts_at is before ends_at', async () => {
    // Given: Event with starts_at = "2025-12-31T20:00:00Z", ends_at = "2025-12-31T18:00:00Z"
    // When: createEvent is called
    // Then: Throws ValidationError
    // And: Returns 422 with message "starts_at must be before ends_at"
  });
});
```

---

### Function: `getEvent(request, reply)`

**Purpose:** Retrieves a single event by ID with tenant filtering  
**Priority:** P1 Critical  
**Test File:** `tests/unit/controllers/events.controller.test.ts`

**Test Cases:**
```typescript
describe('getEvent', () => {
  test('TC-EC-GE-001: should return event from cache if available', async () => {
    // Given: Event with ID exists in Redis cache
    // When: getEvent is called with event ID
    // Then: Returns cached event data
    // And: Does not query database
    // And: Returns 200 status
  });

  test('TC-EC-GE-002: should fetch from database if not cached', async () => {
    // Given: Event not in Redis cache
    // When: getEvent is called
    // Then: Calls EventService.getEvent() to fetch from database
    // And: Caches result in Redis with 1 hour TTL
    // And: Returns event data with 200 status
  });

  test('TC-EC-GE-003: should include venue details in response', async () => {
    // Given: Event with valid venue_id
    // When: getEvent is called
    // Then: Response includes populated venue object
    // And: Venue object contains id, name, capacity, address
  });

  test('TC-EC-GE-004: should include category details if category_id present', async () => {
    // Given: Event with category_id
    // When: getEvent is called
    // Then: Response includes populated category object
    // And: Category contains id, name, slug
  });

  test('TC-EC-GE-005: should include schedules array if schedules exist', async () => {
    // Given: Event has associated schedules
    // When: getEvent is called
    // Then: Response includes schedules array
    // And: Each schedule has starts_at, ends_at, status
  });

  test('TC-EC-GE-006: should include pricing tiers if pricing exists', async () => {
    // Given: Event has pricing tiers
    // When: getEvent is called
    // Then: Response includes pricing array
    // And: Each tier has tier_name, base_price_cents, current_price_cents
  });

  test('TC-EC-GE-007: should include metadata if exists', async () => {
    // Given: Event has extended metadata
    // When: getEvent is called
    // Then: Response includes metadata object
    // And: Metadata includes performers, sponsors, technical requirements
  });

  test('TC-EC-GE-008: should throw 404 if event not found', async () => {
    // Given: Event ID that doesn't exist
    // When: getEvent is called
    // Then: Throws NotFoundError
    // And: Returns 404 status
  });
});
```

---

### Function: `listEvents(request, reply)`

**Purpose:** Lists all events for a tenant with filtering and pagination  
**Priority:** P1 Critical  
**Test File:** `tests/unit/controllers/events.controller.test.ts`

**Test Cases:**
```typescript
describe('listEvents', () => {
  test('TC-EC-LE-001: should list events with default pagination', async () => {
    // Given: Tenant has 50 events, no query params
    // When: listEvents is called
    // Then: Returns first 20 events (default limit)
    // And: Returns pagination metadata: { total: 50, limit: 20, offset: 0 }
    // And: Returns 200 status
  });

  test('TC-EC-LE-002: should apply custom limit and offset', async () => {
    // Given: Query params limit=10, offset=5
    // When: listEvents is called
    // Then: Returns 10 events starting from position 5
    // And: Pagination reflects custom values
  });

  test('TC-EC-LE-003: should filter by status', async () => {
    // Given: Query param status="published"
    // When: listEvents is called
    // Then: Returns only events with status = 'published'
    // And: Excludes draft, cancelled events
  });

  test('TC-EC-LE-004: should filter by category_id', async () => {
    // Given: Query param category_id={uuid}
    // When: listEvents is called
    // Then: Returns only events in that category
  });

  test('TC-EC-LE-005: should filter by venue_id', async () => {
    // Given: Query param venue_id={uuid}
    // When: listEvents is called
    // Then: Returns only events at that venue
  });

  test('TC-EC-LE-006: should filter by date range', async () => {
    // Given: Query params start_date="2025-01-01", end_date="2025-12-31"
    // When: listEvents is called
    // Then: Returns events where event_date is within range
  });

  test('TC-EC-LE-007: should search events by name', async () => {
    // Given: Query param search="music"
    // When: listEvents is called
    // Then: Returns events where name contains "music" (case-insensitive)
  });

  test('TC-EC-LE-008: should combine multiple filters', async () => {
    // Given: Query params status="published", venue_id={uuid}, search="festival"
    // When: listEvents is called
    // Then: Returns events matching ALL filter criteria
  });

  test('TC-EC-LE-009: should return empty array when no matches', async () => {
    // Given: Filters that match no events
    // When: listEvents is called
    // Then: Returns { events: [], total: 0, limit: 20, offset: 0 }
  });

  test('TC-EC-LE-010: should enforce tenant isolation', async () => {
    // Given: Multiple tenants have events in database
    // When: listEvents is called
    // Then: Only returns events where tenant_id = user.tenantId
    // And: Never returns events from other tenants
  });
});
```

---

### Function: `updateEvent(request, reply)`

**Purpose:** Updates an existing event with validation and audit logging  
**Priority:** P1 Critical  
**Test File:** `tests/unit/controllers/events.controller.test.ts`

**Test Cases:**
```typescript
describe('updateEvent', () => {
  test('TC-EC-UE-001: should update specified fields only', async () => {
    // Given: Update payload with { name: "New Name", capacity: 500 }
    // When: updateEvent is called
    // Then: Only name and capacity are updated
    // And: Other fields (description, dates, etc.) remain unchanged
  });

  test('TC-EC-UE-002: should update updated_at timestamp automatically', async () => {
    // Given: Event being updated
    // When: updateEvent is called
    // Then: updated_at set to current timestamp
    // And: created_at remains unchanged
  });

  test('TC-EC-UE-003: should invalidate Redis cache after update', async () => {
    // Given: Event is cached in Redis
    // When: updateEvent is called
    // Then: Cache entry for "event:{id}" is deleted
    // And: Next getEvent fetches fresh data from database
  });

  test('TC-EC-UE-004: should create audit log entry', async () => {
    // Given: Event update with changed fields
    // When: updateEvent is called
    // Then: Audit log created with action 'event.updated'
    // And: Log includes before and after values in changes field
    // And: Includes user_id, tenant_id, IP, user agent
  });

  test('TC-EC-UE-005: should validate new venue if venue_id changed', async () => {
    // Given: Update includes new venue_id
    // When: updateEvent is called
    // Then: Calls VenueServiceClient to validate new venue
    // And: Verifies new venue belongs to same tenant
    // And: Updates venue_id if validation passes
  });

  test('TC-EC-UE-006: should not allow updating immutable fields', async () => {
    // Given: Update payload includes id, created_at, tenant_id
    // When: updateEvent is called
    // Then: Those fields are filtered out and not updated
    // And: Only mutable fields are updated
  });

  test('TC-EC-UE-007: should validate time constraints', async () => {
    // Given: Update sets starts_at to after ends_at
    // When: updateEvent is called
    // Then: Throws ValidationError
    // And: Returns 422 with error message
  });

  test('TC-EC-UE-008: should publish event.updated event', async () => {
    // Given: Event updated successfully
    // When: updateEvent completes
    // Then: Publishes event.updated to message bus
    // And: Payload includes event_id and changed fields
  });

  test('TC-EC-UE-009: should throw 404 if event not found', async () => {
    // Given: Event ID that doesn't exist
    // When: updateEvent is called
    // Then: Returns 404 status
  });

  test('TC-EC-UE-010: should enforce tenant isolation', async () => {
    // Given: Event exists but belongs to different tenant
    // When: updateEvent is called
    // Then: Returns 404 (not 403, for security)
    // And: Does not update event
  });
});
```

---

### Function: `deleteEvent(request, reply)`

**Purpose:** Soft deletes an event (sets deleted_at timestamp)  
**Priority:** P1 Critical  
**Test File:** `tests/unit/controllers/events.controller.test.ts`

**Test Cases:**
```typescript
describe('deleteEvent', () => {
  test('TC-EC-DE-001: should soft delete event by setting deleted_at', async () => {
    // Given: Valid event ID
    // When: deleteEvent is called
    // Then: Sets deleted_at to current timestamp
    // And: Event remains in database (not hard deleted)
    // And: Returns 200 status
  });

  test('TC-EC-DE-002: should invalidate cache after deletion', async () => {
    // Given: Event is cached in Redis
    // When: deleteEvent is called
    // Then: Cache entry deleted
  });

  test('TC-EC-DE-003: should create audit log for deletion', async () => {
    // Given: Event being deleted
    // When: deleteEvent is called
    // Then: Audit log created with action 'event.deleted'
  });

  test('TC-EC-DE-004: should publish event.deleted event', async () => {
    // Given: Event deleted successfully
    // When: deleteEvent completes
    // Then: Publishes event.deleted to message bus
  });

  test('TC-EC-DE-005: should soft delete associated schedules', async () => {
    // Given: Event has associated schedules
    // When: deleteEvent is called
    // Then: All schedules also soft deleted (cascade)
  });

  test('TC-EC-DE-006: should soft delete associated pricing', async () => {
    // Given: Event has pricing tiers
    // When: deleteEvent is called
    // Then: All pricing tiers soft deleted
  });

  test('TC-EC-DE-007: should throw 404 if event not found', async () => {
    // Given: Invalid event ID
    // When: deleteEvent is called
    // Then: Returns 404 status
  });

  test('TC-EC-DE-008: should enforce tenant isolation', async () => {
    // Given: Event exists in different tenant
    // When: deleteEvent is called
    // Then: Returns 404 status
  });
});
```

---

### Function: `publishEvent(request, reply)`

**Purpose:** Changes event status to 'published' making it publicly visible  
**Priority:** P1 Critical  
**Test File:** `tests/unit/controllers/events.controller.test.ts`

**Test Cases:**
```typescript
describe('publishEvent', () => {
  test('TC-EC-PE-001: should publish event with valid data', async () => {
    // Given: Draft event with all required fields
    // When: publishEvent is called
    // Then: Status changed to 'published'
    // And: is_published set to true
    // And: Returns 200 with updated event
  });

  test('TC-EC-PE-002: should validate event has all required data before publishing', async () => {
    // Given: Draft event missing pricing tiers
    // When: publishEvent is called
    // Then: Throws ValidationError
    // And: Returns 422 with "Cannot publish without pricing"
  });

  test('TC-EC-PE-003: should validate event has at least one schedule', async () => {
    // Given: Event with no schedules
    // When: publishEvent is called
    // Then: Throws ValidationError
    // And: Returns 422 with "Cannot publish without schedule"
  });

  test('TC-EC-PE-004: should invalidate cache after publishing', async () => {
    // Given: Event is cached
    // When: publishEvent is called
    // Then: Cache entry deleted
  });

  test('TC-EC-PE-005: should create audit log for publish action', async () => {
    // Given: Event being published
    // When: publishEvent is called
    // Then: Audit log created with action 'event.published'
  });

  test('TC-EC-PE-006: should publish event.published event to message bus', async () => {
    // Given: Event published successfully
    // When: publishEvent completes
    // Then: Publishes event.published event
  });

  test('TC-EC-PE-007: should throw 400 if event already published', async () => {
    // Given: Event already has status 'published'
    // When: publishEvent is called
    // Then: Returns 400 with "Event already published"
  });

  test('TC-EC-PE-008: should throw 404 if event not found', async () => {
    // Given: Invalid event ID
    // When: publishEvent is called
    // Then: Returns 404 status
  });
});
```

---

### Function: `cancelEvent(request, reply)`

**Purpose:** Changes event status to 'cancelled' and handles refunds  
**Priority:** P1 Critical  
**Test File:** `tests/unit/controllers/events.controller.test.ts`

**Test Cases:**
```typescript
describe('cancelEvent', () => {
  test('TC-EC-CAE-001: should cancel event and set status to cancelled', async () => {
    // Given: Published event with valid ID
    // When: cancelEvent is called
    // Then: Status changed to 'cancelled'
    // And: Returns 200 with updated event
  });

  test('TC-EC-CAE-002: should accept optional cancellation reason', async () => {
    // Given: Request body includes { reason: "Venue unavailable" }
    // When: cancelEvent is called
    // Then: Reason stored in event metadata
  });

  test('TC-EC-CAE-003: should trigger refund processing for sold tickets', async () => {
    // Given: Event has sold tickets
    // When: cancelEvent is called
    // Then: Calls refund service to process refunds
    // And: Queues refund jobs for each ticket
  });

  test('TC-EC-CAE-004: should release all capacity reservations', async () => {
    // Given: Event has active reservations
    // When: cancelEvent is called
    // Then: All reservations released
  });

  test('TC-EC-CAE-005: should trigger cancellation notifications', async () => {
    // Given: Event has ticket holders
    // When: cancelEvent is called
    // Then: Queues cancellation emails to all customers
  });

  test('TC-EC-CAE-006: should invalidate cache after cancellation', async () => {
    // Given: Event is cached
    // When: cancelEvent is called
    // Then: Cache entry deleted
  });

  test('TC-EC-CAE-007: should create audit log for cancellation', async () => {
    // Given: Event being cancelled
    // When: cancelEvent is called
    // Then: Audit log created with action 'event.cancelled'
    // And: Includes cancellation reason if provided
  });

  test('TC-EC-CAE-008: should publish event.cancelled event', async () => {
    // Given: Event cancelled successfully
    // When: cancelEvent completes
    // Then: Publishes event.cancelled to message bus
  });
});
```

---

## schedule.controller.ts

**Location:** `src/controllers/schedule.controller.ts`  
**Purpose:** Manages event scheduling including showtimes and recurring events  
**Priority:** P1 Critical  
**Total Functions:** 6

---

### Function: `createSchedule(request, reply)`

**Purpose:** Creates a new schedule/showtime for an event  
**Priority:** P1 Critical  
**Test File:** `tests/unit/controllers/schedule.controller.test.ts`

**Test Cases:**
```typescript
describe('createSchedule', () => {
  test('TC-SC-CS-001: should create schedule with valid data', async () => {
    // Given: Valid schedule data with event_id, starts_at, ends_at
    // When: createSchedule is called
    // Then: Returns 201 with created schedule
    // And: Schedule linked to event_id
    // And: Status defaults to 'active'
  });

  test('TC-SC-CS-002: should validate event exists before creating schedule', async () => {
    // Given: Valid schedule data with event_id
    // When: createSchedule is called
    // Then: Calls EventService.getEvent() to verify event exists
    // And: Verifies event belongs to same tenant
  });

  test('TC-SC-CS-003: should validate starts_at is before ends_at', async () => {
    // Given: Schedule with starts_at after ends_at
    // When: createSchedule is called
    // Then: Returns 422 with validation error
  });

  test('TC-SC-CS-004: should validate doors_open is before starts_at', async () => {
    // Given: Schedule with doors_open after starts_at
    // When: createSchedule is called
    // Then: Returns 422 with validation error
  });

  test('TC-SC-CS-005: should check for scheduling conflicts', async () => {
    // Given: Venue already has event at same time
    // When: createSchedule is called
    // Then: Calls VenueServiceClient to check availability
    // And: Throws ConflictError if venue occupied
  });

  test('TC-SC-CS-006: should support recurring schedule patterns', async () => {
    // Given: Schedule with recurrence_rule "FREQ=DAILY;COUNT=7"
    // When: createSchedule is called
    // Then: Creates multiple schedule entries
    // And: Each schedule follows recurrence pattern
  });

  test('TC-SC-CS-007: should create capacity entry for new schedule', async () => {
    // Given: Schedule created successfully
    // When: createSchedule completes
    // Then: Creates event_capacity entry linked to schedule
    // And: Sets total_capacity from event or override
  });

  test('TC-SC-CS-008: should invalidate event cache after schedule creation', async () => {
    // Given: Event is cached
    // When: createSchedule is called
    // Then: Event cache invalidated
  });

  test('TC-SC-CS-009: should throw 404 if event not found', async () => {
    // Given: Invalid event_id
    // When: createSchedule is called
    // Then: Returns 404 status
  });

  test('TC-SC-CS-010: should enforce tenant isolation', async () => {
    // Given: Event exists in different tenant
    // When: createSchedule is called
    // Then: Returns 404 status
  });
});
```

---

### Function: `getSchedule(request, reply)`

**Purpose:** Retrieves a specific schedule by ID  
**Priority:** P1 Critical  
**Test File:** `tests/unit/controllers/schedule.controller.test.ts`

**Test Cases:**
```typescript
describe('getSchedule', () => {
  test('TC-SC-GS-001: should return schedule with event details', async () => {
    // Given: Valid schedule ID
    // When: getSchedule is called
    // Then: Returns 200 with schedule object
    // And: Includes populated event details
  });

  test('TC-SC-GS-002: should include capacity information', async () => {
    // Given: Schedule with capacity tracking
    // When: getSchedule is called
    // Then: Response includes capacity stats (total, sold, available)
  });

  test('TC-SC-GS-003: should include pricing information', async () => {
    // Given: Schedule with associated pricing
    // When: getSchedule is called
    // Then: Response includes pricing tiers
  });

  test('TC-SC-GS-004: should throw 404 if schedule not found', async () => {
    // Given: Invalid schedule ID
    // When: getSchedule is called
    // Then: Returns 404 status
  });

  test('TC-SC-GS-005: should enforce tenant isolation', async () => {
    // Given: Schedule exists in different tenant
    // When: getSchedule is called
    // Then: Returns 404 status
  });

  test('TC-SC-GS-006: should exclude soft-deleted schedules', async () => {
    // Given: Schedule with deleted_at timestamp
    // When: getSchedule is called
    // Then: Returns 404 as if schedule doesn't exist
  });
});
```

---

### Function: `listSchedules(request, reply)`

**Purpose:** Lists schedules with filtering by event, date range, and status  
**Priority:** P1 Critical  
**Test File:** `tests/unit/controllers/schedule.controller.test.ts`

**Test Cases:**
```typescript
describe('listSchedules', () => {
  test('TC-SC-LS-001: should list all schedules for an event', async () => {
    // Given: Query param event_id={uuid}
    // When: listSchedules is called
    // Then: Returns all schedules for that event
    // And: Excludes soft-deleted schedules
  });

  test('TC-SC-LS-002: should filter by date range', async () => {
    // Given: Query params start_date, end_date
    // When: listSchedules is called
    // Then: Returns schedules where starts_at is within range
  });

  test('TC-SC-LS-003: should filter by status', async () => {
    // Given: Query param status="active"
    // When: listSchedules is called
    // Then: Returns only schedules with status 'active'
  });

  test('TC-SC-LS-004: should sort schedules by starts_at ascending', async () => {
    // Given: Multiple schedules with different start times
    // When: listSchedules is called
    // Then: Returns schedules ordered by starts_at (earliest first)
  });

  test('TC-SC-LS-005: should support pagination', async () => {
    // Given: Query params limit=10, offset=0
    // When: listSchedules is called
    // Then: Returns first 10 schedules with pagination metadata
  });

  test('TC-SC-LS-006: should return empty array if no matches', async () => {
    // Given: Filters that match no schedules
    // When: listSchedules is called
    // Then: Returns { schedules: [], total: 0 }
  });

  test('TC-SC-LS-007: should enforce tenant isolation', async () => {
    // Given: Multiple tenants have schedules
    // When: listSchedules is called
    // Then: Only returns schedules for user's tenant
  });

  test('TC-SC-LS-008: should include capacity data for each schedule', async () => {
    // Given: Schedules with capacity tracking
    // When: listSchedules is called
    // Then: Each schedule includes capacity summary
  });
});
```

---

### Function: `updateSchedule(request, reply)`

**Purpose:** Updates schedule details including times and capacity  
**Priority:** P1 Critical  
**Test File:** `tests/unit/controllers/schedule.controller.test.ts`

**Test Cases:**
```typescript
describe('updateSchedule', () => {
  test('TC-SC-US-001: should update schedule fields', async () => {
    // Given: Update payload with new starts_at, ends_at
    // When: updateSchedule is called
    // Then: Fields updated in database
    // And: Returns 200 with updated schedule
  });

  test('TC-SC-US-002: should validate time constraints', async () => {
    // Given: Update sets starts_at after ends_at
    // When: updateSchedule is called
    // Then: Returns 422 with validation error
  });

  test('TC-SC-US-003: should check for conflicts if times changed', async () => {
    // Given: Update changes starts_at or ends_at
    // When: updateSchedule is called
    // Then: Checks venue availability for new times
    // And: Throws ConflictError if venue occupied
  });

  test('TC-SC-US-004: should prevent updates if tickets sold', async () => {
    // Given: Schedule has sold tickets and major time change
    // When: updateSchedule is called
    // Then: Returns 400 with "Cannot change time after tickets sold"
  });

  test('TC-SC-US-005: should allow minor updates even with sales', async () => {
    // Given: Schedule has sold tickets, update to notes only
    // When: updateSchedule is called
    // Then: Update allowed
    // And: Returns updated schedule
  });

  test('TC-SC-US-006: should invalidate related caches', async () => {
    // Given: Schedule being updated
    // When: updateSchedule is called
    // Then: Schedule cache and event cache both invalidated
  });

  test('TC-SC-US-007: should create audit log', async () => {
    // Given: Schedule update
    // When: updateSchedule is called
    // Then: Audit log created with before/after values
  });

  test('TC-SC-US-008: should throw 404 if schedule not found', async () => {
    // Given: Invalid schedule ID
    // When: updateSchedule is called
    // Then: Returns 404 status
  });
});
```

---

### Function: `deleteSchedule(request, reply)`

**Purpose:** Soft deletes a schedule  
**Priority:** P1 Critical  
**Test File:** `tests/unit/controllers/schedule.controller.test.ts`

**Test Cases:**
```typescript
describe('deleteSchedule', () => {
  test('TC-SC-DS-001: should soft delete schedule', async () => {
    // Given: Valid schedule ID with no sold tickets
    // When: deleteSchedule is called
    // Then: Sets deleted_at timestamp
    // And: Returns 200 status
  });

  test('TC-SC-DS-002: should prevent deletion if tickets sold', async () => {
    // Given: Schedule has sold tickets
    // When: deleteSchedule is called
    // Then: Returns 400 with "Cannot delete schedule with sold tickets"
  });

  test('TC-SC-DS-003: should release any pending reservations', async () => {
    // Given: Schedule has pending reservations
    // When: deleteSchedule is called
    // Then: All reservations released
  });

  test('TC-SC-DS-004: should soft delete associated capacity entry', async () => {
    // Given: Schedule has capacity entry
    // When: deleteSchedule is called
    // Then: Capacity entry also soft deleted
  });

  test('TC-SC-DS-005: should invalidate caches', async () => {
    // Given: Schedule and event cached
    // When: deleteSchedule is called
    // Then: Both caches invalidated
  });

  test('TC-SC-DS-006: should create audit log', async () => {
    // Given: Schedule being deleted
    // When: deleteSchedule is called
    // Then: Audit log created with action 'schedule.deleted'
  });

  test('TC-SC-DS-007: should throw 404 if schedule not found', async () => {
    // Given: Invalid schedule ID
    // When: deleteSchedule is called
    // Then: Returns 404 status
  });
});
```

---

### Function: `getUpcomingShows(request, reply)`

**Purpose:** Gets all upcoming shows for an event or venue  
**Priority:** P2  
**Test File:** `tests/unit/controllers/schedule.controller.test.ts`

**Test Cases:**
```typescript
describe('getUpcomingShows', () => {
  test('TC-SC-GUS-001: should return upcoming schedules for event', async () => {
    // Given: Query param event_id={uuid}
    // When: getUpcomingShows is called
    // Then: Returns schedules where starts_at > now
    // And: Ordered by starts_at ascending
  });

  test('TC-SC-GUS-002: should return upcoming schedules for venue', async () => {
    // Given: Query param venue_id={uuid}
    // When: getUpcomingShows is called
    // Then: Returns all upcoming schedules at that venue
  });

  test('TC-SC-GUS-003: should limit to next X days', async () => {
    // Given: Query param days_ahead=30
    // When: getUpcomingShows is called
    // Then: Returns schedules within next 30 days only
  });

  test('TC-SC-GUS-004: should default to 30 days if not specified', async () => {
    // Given: No days_ahead param
    // When: getUpcomingShows is called
    // Then: Returns schedules within next 30 days
  });

  test('TC-SC-GUS-005: should exclude cancelled schedules', async () => {
    // Given: Some schedules have status 'cancelled'
    // When: getUpcomingShows is called
    // Then: Cancelled schedules not included
  });

  test('TC-SC-GUS-006: should return empty array if no upcoming shows', async () => {
    // Given: All schedules are in the past
    // When: getUpcomingShows is called
    // Then: Returns { schedules: [] }
  });
});
```

---

## capacity.controller.ts

**Location:** `src/controllers/capacity.controller.ts`  
**Purpose:** Manages event capacity tracking, reservations, and real-time availability  
**Priority:** P1 Critical  
**Total Functions:** 4

---

### Function: `getCapacity(request, reply)`

**Purpose:** Retrieves current capacity status for an event or schedule  
**Priority:** P1 Critical  
**Test File:** `tests/unit/controllers/capacity.controller.test.ts`

**Test Cases:**
```typescript
describe('getCapacity', () => {
  test('TC-CAP-GC-001: should return real-time capacity from Redis', async () => {
    // Given: Event with capacity tracking in Redis
    // When: getCapacity is called with event_id
    // Then: Returns capacity object from Redis cache
    // And: Does not query database
  });

  test('TC-CAP-GC-002: should include all capacity metrics', async () => {
    // Given: Event with capacity data
    // When: getCapacity is called
    // Then: Returns { total, sold, pending, reserved, available }
    // And: available = total - sold - pending - reserved
  });

  test('TC-CAP-GC-003: should work with schedule_id parameter', async () => {
    // Given: Query param schedule_id={uuid}
    // When: getCapacity is called
    // Then: Returns capacity for specific schedule
  });

  test('TC-CAP-GC-004: should work with event_id parameter', async () => {
    // Given: Query param event_id={uuid}
    // When: getCapacity is called
    // Then: Returns aggregated capacity across all schedules
  });

  test('TC-CAP-GC-005: should fallback to database if not in Redis', async () => {
    // Given: Capacity not cached in Redis
    // When: getCapacity is called
    // Then: Fetches from database
    // And: Caches result in Redis
  });

  test('TC-CAP-GC-006: should include utilization percentage', async () => {
    // Given: Event with some capacity used
    // When: getCapacity is called
    // Then: Returns utilization_percentage calculated field
  });

  test('TC-CAP-GC-007: should throw 404 if event/schedule not found', async () => {
    // Given: Invalid event_id or schedule_id
    // When: getCapacity is called
    // Then: Returns 404 status
  });

  test('TC-CAP-GC-008: should enforce tenant isolation', async () => {
    // Given: Event exists in different tenant
    // When: getCapacity is called
    // Then: Returns 404 status
  });
});
```

---

### Function: `reserveCapacity(request, reply)`

**Purpose:** Temporarily reserves capacity for a pending purchase  
**Priority:** P1 Critical  
**Test File:** `tests/unit/controllers/capacity.controller.test.ts`

**Test Cases:**
```typescript
describe('reserveCapacity', () => {
  test('TC-CAP-RC-001: should reserve capacity with valid request', async () => {
    // Given: Request with event_id, schedule_id, quantity, reservation_id
    // When: reserveCapacity is called
    // Then: Returns 200 with reservation confirmation
    // And: Capacity reserved in Redis
    // And: Expiration time set to 10 minutes
  });

  test('TC-CAP-RC-002: should use distributed lock to prevent overselling', async () => {
    // Given: Multiple concurrent reservation requests
    // When: reserveCapacity is called
    // Then: Uses Redis lock to ensure atomic operation
    // And: Only one request succeeds if at capacity limit
  });

  test('TC-CAP-RC-003: should check availability before reserving', async () => {
    // Given: Event has 10 available seats, request for 15
    // When: reserveCapacity is called
    // Then: Throws InsufficientCapacityError
    // And: Returns 409 with "Not enough capacity available"
  });

  test('TC-CAP-RC-004: should create reservation record in database', async () => {
    // Given: Successful capacity reservation
    // When: reserveCapacity completes
    // Then: Creates reservation record with reservation_id
    // And: Record includes quantity, expires_at
  });

  test('TC-CAP-RC-005: should lock pricing at reservation time', async () => {
    // Given: Event has dynamic pricing
    // When: reserveCapacity is called
    // Then: Current price locked for this reservation
    // And: Stored in locked_price_data field
  });

  test('TC-CAP-RC-006: should set 10-minute expiration', async () => {
    // Given: New reservation created
    // When: reserveCapacity completes
    // Then: Redis key expires in 600 seconds
    // And: expires_at timestamp set to now + 10 minutes
  });

  test('TC-CAP-RC-007: should update pending_count in Redis', async () => {
    // Given: Current pending_count = 5
    // When: reserveCapacity for quantity 2
    // Then: pending_count updated to 7
  });

  test('TC-CAP-RC-008: should throw 400 if quantity exceeds max_per_order', async () => {
    // Given: Pricing tier has max_per_order = 10, request for 15
    // When: reserveCapacity is called
    // Then: Returns 400 with "Exceeds maximum per order"
  });

  test('TC-CAP-RC-009: should throw 404 if event/schedule not found', async () => {
    // Given: Invalid event_id or schedule_id
    // When: reserveCapacity is called
    // Then: Returns 404 status
  });

  test('TC-CAP-RC-010: should enforce tenant isolation', async () => {
    // Given: Event exists in different tenant
    // When: reserveCapacity is called
    // Then: Returns 404 status
  });
});
```

---

### Function: `releaseCapacity(request, reply)`

**Purpose:** Releases a temporary capacity reservation  
**Priority:** P1 Critical  
**Test File:** `tests/unit/controllers/capacity.controller.test.ts`

**Test Cases:**
```typescript
describe('releaseCapacity', () => {
  test('TC-CAP-RLC-001: should release capacity with valid reservation_id', async () => {
    // Given: Active reservation with reservation_id
    // When: releaseCapacity is called
    // Then: Returns 200 with success message
    // And: Capacity released in Redis
  });

  test('TC-CAP-RLC-002: should decrement pending_count in Redis', async () => {
    // Given: Reservation for quantity 3, pending_count = 10
    // When: releaseCapacity is called
    // Then: pending_count updated to 7
  });

  test('TC-CAP-RLC-003: should delete reservation record from database', async () => {
    // Given: Reservation exists in database
    // When: releaseCapacity is called
    // Then: Reservation record deleted or marked released
  });

  test('TC-CAP-RLC-004: should release price lock', async () => {
    // Given: Reservation has locked pricing
    // When: releaseCapacity is called
    // Then: Price lock released
  });

  test('TC-CAP-RLC-005: should handle already expired reservations gracefully', async () => {
    // Given: Reservation already expired (past 10 minutes)
    // When: releaseCapacity is called
    // Then: Returns 200 (idempotent operation)
    // And: No error thrown
  });

  test('TC-CAP-RLC-006: should handle non-existent reservation_id', async () => {
    // Given: reservation_id that doesn't exist
    // When: releaseCapacity is called
    // Then: Returns 404 with "Reservation not found"
  });

  test('TC-CAP-RLC-007: should use distributed lock for atomic release', async () => {
    // Given: Reservation being released
    // When: releaseCapacity is called
    // Then: Uses Redis lock to ensure atomic operation
  });

  test('TC-CAP-RLC-008: should enforce tenant isolation', async () => {
    // Given: Reservation exists in different tenant
    // When: releaseCapacity is called
    // Then: Returns 404 status
  });
});
```

---

### Function: `confirmCapacity(request, reply)`

**Purpose:** Confirms purchase and converts reservation to sold status  
**Priority:** P1 Critical  
**Test File:** `tests/unit/controllers/capacity.controller.test.ts`

**Test Cases:**
```typescript
describe('confirmCapacity', () => {
  test('TC-CAP-CC-001: should confirm capacity with valid reservation', async () => {
    // Given: Active reservation with reservation_id
    // When: confirmCapacity is called
    // Then: Returns 200 with confirmation
    // And: Reservation converted to sold
  });

  test('TC-CAP-CC-002: should increment sold_count in Redis', async () => {
    // Given: Reservation for quantity 2, sold_count = 50
    // When: confirmCapacity is called
    // Then: sold_count updated to 52
  });

  test('TC-CAP-CC-003: should decrement pending_count in Redis', async () => {
    // Given: Reservation for quantity 2, pending_count = 10
    // When: confirmCapacity is called
    // Then: pending_count updated to 8
  });

  test('TC-CAP-CC-004: should update available_capacity calculation', async () => {
    // Given: total = 100, sold = 50, pending = 10, reserved = 5
    // When: confirmCapacity for quantity 2
    // Then: available = 100 - 52 - 8 - 5 = 35
  });

  test('TC-CAP-CC-005: should mark reservation as confirmed in database', async () => {
    // Given: Reservation record exists
    // When: confirmCapacity is called
    // Then: Reservation status set to 'confirmed'
    // And: confirmed_at timestamp set
  });

  test('TC-CAP-CC-006: should throw 400 if reservation expired', async () => {
    // Given: Reservation past 10-minute expiration
    // When: confirmCapacity is called
    // Then: Returns 400 with "Reservation expired"
  });

  test('TC-CAP-CC-007: should throw 404 if reservation not found', async () => {
    // Given: Invalid reservation_id
    // When: confirmCapacity is called
    // Then: Returns 404 status
  });

  test('TC-CAP-CC-008: should use distributed lock for atomic confirm', async () => {
    // Given: Reservation being confirmed
    // When: confirmCapacity is called
    // Then: Uses Redis lock to ensure atomic operation
    // And: Prevents race conditions
  });
});
```

---

## tickets.controller.ts

**Location:** `src/controllers/tickets.controller.ts`  
**Purpose:** Ticket generation, QR codes, and validation  
**Priority:** P1 Critical  
**Total Functions:** 6

---

### Function: `generateTickets(request, reply)`

**Purpose:** Generates tickets with QR codes for a confirmed order  
**Priority:** P1 Critical  
**Test File:** `tests/unit/controllers/tickets.controller.test.ts`

**Test Cases:**
```typescript
describe('generateTickets', () => {
  test('TC-TIC-GT-001: should generate tickets for valid order', async () => {
    // Given: Request with order_id, event_id, schedule_id, quantity
    // When: generateTickets is called
    // Then: Returns 201 with array of generated tickets
    // And: Each ticket has unique ID and ticket_number
  });

  test('TC-TIC-GT-002: should generate unique QR code for each ticket', async () => {
    // Given: Order for 3 tickets
    // When: generateTickets is called
    // Then: Creates 3 tickets with different QR codes
    // And: Each QR code is encrypted
  });

  test('TC-TIC-GT-003: should generate human-readable ticket numbers', async () => {
    // Given: Tickets being generated
    // When: generateTickets is called
    // Then: Each ticket has format "EVT-XXXXXX" (6 digits)
    // And: Numbers are unique within event
  });

  test('TC-TIC-GT-004: should link tickets to customer', async () => {
    // Given: Request includes customer_id
    // When: generateTickets is called
    // Then: All tickets linked to customer_id
  });

  test('TC-TIC-GT-005: should link tickets to pricing tier', async () => {
    // Given: Order specifies pricing_tier_id
    // When: generateTickets is called
    // Then: Tickets linked to pricing tier
    // And: Price at time of purchase recorded
  });

  test('TC-TIC-GT-006: should set initial status to valid', async () => {
    // Given: New tickets being generated
    // When: generateTickets completes
    // Then: All tickets have status = 'valid'
  });

  test('TC-TIC-GT-007: should queue ticket delivery emails', async () => {
    // Given: Tickets generated successfully
    // When: generateTickets completes
    // Then: Queues email job to send tickets to customer
  });

  test('TC-TIC-GT-008: should create audit log for ticket generation', async () => {
    // Given: Tickets being generated
    // When: generateTickets is called
    // Then: Audit log created with action 'tickets.generated'
  });

  test('TC-TIC-GT-009: should throw 404 if event/schedule not found', async () => {
    // Given: Invalid event_id or schedule_id
    // When: generateTickets is called
    // Then: Returns 404 status
  });

  test('TC-TIC-GT-010: should enforce tenant isolation', async () => {
    // Given: Event exists in different tenant
    // When: generateTickets is called
    // Then: Returns 404 status
  });
});
```

---

### Function: `getTicket(request, reply)`

**Purpose:** Retrieves ticket information by ID or ticket number  
**Priority:** P1 Critical  
**Test File:** `tests/unit/controllers/tickets.controller.test.ts`

**Test Cases:**
```typescript
describe('getTicket', () => {
  test('TC-TIC-GTK-001: should return ticket by ID', async () => {
    // Given: Valid ticket ID
    // When: getTicket is called
    // Then: Returns 200 with ticket object
    // And: Includes event, schedule, customer details
  });

  test('TC-TIC-GTK-002: should return ticket by ticket_number', async () => {
    // Given: Query param ticket_number="EVT-123456"
    // When: getTicket is called
    // Then: Returns ticket matching that number
  });

  test('TC-TIC-GTK-003: should include QR code data', async () => {
    // Given: Valid ticket
    // When: getTicket is called
    // Then: Response includes qr_code field
    // And: QR code is encrypted string
  });

  test('TC-TIC-GTK-004: should include scan history if ticket scanned', async () => {
    // Given: Ticket has been scanned at entry
    // When: getTicket is called
    // Then: Response includes scanned_at timestamp
    // And: Includes scanned_by user info
  });

  test('TC-TIC-GTK-005: should throw 404 if ticket not found', async () => {
    // Given: Invalid ticket ID
    // When: getTicket is called
    // Then: Returns 404 status
  });

  test('TC-TIC-GTK-006: should enforce tenant isolation', async () => {
    // Given: Ticket exists in different tenant
    // When: getTicket is called
    // Then: Returns 404 status
  });
});
```

---

### Function: `listTickets(request, reply)`

**Purpose:** Lists tickets with filtering options  
**Priority:** P1 Critical  
**Test File:** `tests/unit/controllers/tickets.controller.test.ts`

**Test Cases:**
```typescript
describe('listTickets', () => {
  test('TC-TIC-LT-001: should list tickets for event', async () => {
    // Given: Query param event_id={uuid}
    // When: listTickets is called
    // Then: Returns all tickets for that event
  });

  test('TC-TIC-LT-002: should list tickets for schedule', async () => {
    // Given: Query param schedule_id={uuid}
    // When: listTickets is called
    // Then: Returns tickets for specific schedule
  });

  test('TC-TIC-LT-003: should list tickets for customer', async () => {
    // Given: Query param customer_id={uuid}
    // When: listTickets is called
    // Then: Returns all customer's tickets
  });

  test('TC-TIC-LT-004: should filter by status', async () => {
    // Given: Query param status="valid"
    // When: listTickets is called
    // Then: Returns only valid tickets
  });

  test('TC-TIC-LT-005: should filter by scanned status', async () => {
    // Given: Query param scanned=true
    // When: listTickets is called
    // Then: Returns only tickets that have been scanned
  });

  test('TC-TIC-LT-006: should support pagination', async () => {
    // Given: Query params limit=20, offset=0
    // When: listTickets is called
    // Then: Returns paginated results with metadata
  });

  test('TC-TIC-LT-007: should enforce tenant isolation', async () => {
    // Given: Multiple tenants have tickets
    // When: listTickets is called
    // Then: Only returns tickets for user's tenant
  });

  test('TC-TIC-LT-008: should return empty array if no matches', async () => {
    // Given: Filters match no tickets
    // When: listTickets is called
    // Then: Returns { tickets: [], total: 0 }
  });
});
```

---

### Function: `validateTicket(request, reply)`

**Purpose:** Validates QR code at event entry  
**Priority:** P1 Critical  
**Test File:** `tests/unit/controllers/tickets.controller.test.ts`

**Test Cases:**
```typescript
describe('validateTicket', () => {
  test('TC-TIC-VT-001: should validate valid unscanned ticket', async () => {
    // Given: Valid QR code for unscanned ticket
    // When: validateTicket is called
    // Then: Returns 200 with { valid: true }
    // And: Does not mark as scanned yet (validation only)
  });

  test('TC-TIC-VT-002: should decrypt and verify QR code', async () => {
    // Given: Encrypted QR code string
    // When: validateTicket is called
    // Then: Decrypts QR code data
    // And: Verifies signature matches
  });

  test('TC-TIC-VT-003: should check ticket status is valid', async () => {
    // Given: Ticket with status = 'refunded'
    // When: validateTicket is called
    // Then: Returns 200 with { valid: false, reason: "Ticket refunded" }
  });

  test('TC-TIC-VT-004: should check ticket not already scanned', async () => {
    // Given: Ticket already scanned with scanned_at timestamp
    // When: validateTicket is called
    // Then: Returns 200 with { valid: false, reason: "Already scanned" }
  });

  test('TC-TIC-VT-005: should verify ticket for correct event', async () => {
    // Given: QR code scanned at wrong event
    // When: validateTicket is called with different event_id
    // Then: Returns 200 with { valid: false, reason: "Wrong event" }
  });

  test('TC-TIC-VT-006: should verify ticket for correct schedule', async () => {
    // Given: QR code for different showtime
    // When: validateTicket is called with different schedule_id
    // Then: Returns 200 with { valid: false, reason: "Wrong schedule" }
  });

  test('TC-TIC-VT-007: should check event date is today', async () => {
    // Given: Ticket for event tomorrow
    // When: validateTicket is called today
    // Then: Returns 200 with { valid: false, reason: "Event not today" }
  });

  test('TC-TIC-VT-008: should return ticket holder information', async () => {
    // Given: Valid ticket
    // When: validateTicket is called
    // Then: Response includes customer_name, ticket_type
  });

  test('TC-TIC-VT-009: should handle expired or invalid QR codes', async () => {
    // Given: Corrupted or expired QR code
    // When: validateTicket is called
    // Then: Returns 200 with { valid: false, reason: "Invalid QR code" }
  });

  test('TC-TIC-VT-010: should enforce tenant isolation', async () => {
    // Given: Valid QR code but different tenant
    // When: validateTicket is called
    // Then: Returns 200 with { valid: false }
  });
});
```

---

### Function: `transferTicket(request, reply)`

**Purpose:** Transfers ticket ownership to another user  
**Priority:** P2  
**Test File:** `tests/unit/controllers/tickets.controller.test.ts`

**Test Cases:**
```typescript
describe('transferTicket', () => {
  test('TC-TIC-TT-001: should transfer ticket to new customer', async () => {
    // Given: Valid ticket_id and new_customer_id
    // When: transferTicket is called
    // Then: Returns 200 with updated ticket
    // And: customer_id changed to new_customer_id
  });

  test('TC-TIC-TT-002: should create transfer history record', async () => {
    // Given: Ticket being transferred
    // When: transferTicket is called
    // Then: Creates history entry with from_customer, to_customer, transferred_at
  });

  test('TC-TIC-TT-003: should generate new QR code after transfer', async () => {
    // Given: Ticket transferred successfully
    // When: transferTicket completes
    // Then: New QR code generated
    // And: Old QR code invalidated
  });

  test('TC-TIC-TT-004: should send notification to new owner', async () => {
    // Given: Transfer completed
    // When: transferTicket completes
    // Then: Queues email to new customer with ticket
  });

  test('TC-TIC-TT-005: should send notification to previous owner', async () => {
    // Given: Transfer completed
    // When: transferTicket completes
    // Then: Queues confirmation email to previous owner
  });

  test('TC-TIC-TT-006: should prevent transfer of scanned tickets', async () => {
    // Given: Ticket already scanned at entry
    // When: transferTicket is called
    // Then: Returns 400 with "Cannot transfer scanned ticket"
  });

  test('TC-TIC-TT-007: should prevent transfer of refunded tickets', async () => {
    // Given: Ticket with status 'refunded'
    // When: transferTicket is called
    // Then: Returns 400 with "Cannot transfer refunded ticket"
  });

  test('TC-TIC-TT-008: should enforce ownership verification', async () => {
    // Given: User trying to transfer ticket they don't own
    // When: transferTicket is called
    // Then: Returns 403 Forbidden
  });
});
```

---

### Function: `refundTicket(request, reply)`

**Purpose:** Processes ticket refund  
**Priority:** P2  
**Test File:** `tests/unit/controllers/tickets.controller.test.ts`

**Test Cases:**
```typescript
describe('refundTicket', () => {
  test('TC-TIC-RT-001: should refund ticket and update status', async () => {
    // Given: Valid ticket_id and refund request
    // When: refundTicket is called
    // Then: Returns 200 with refund confirmation
    // And: Ticket status changed to 'refunded'
  });

  test('TC-TIC-RT-002: should release capacity back to available', async () => {
    // Given: Ticket being refunded
    // When: refundTicket is called
    // Then: Decrements sold_count in Redis
    // And: Increments available_capacity
  });

  test('TC-TIC-RT-003: should create refund record', async () => {
    // Given: Refund processed
    // When: refundTicket completes
    // Then: Creates refund record with amount, reason, refunded_at
  });

  test('TC-TIC-RT-004: should calculate refund amount based on policy', async () => {
    // Given: Event in 10 days, refund policy allows 80%
    // When: refundTicket is called
    // Then: Calculates refund as 80% of original price
  });

  test('TC-TIC-RT-005: should prevent refund if too close to event', async () => {
    // Given: Event in 2 hours, policy requires 24 hours
    // When: refundTicket is called
    // Then: Returns 400 with "Refund deadline passed"
  });

  test('TC-TIC-RT-006: should prevent refund of scanned tickets', async () => {
    // Given: Ticket already scanned
    // When: refundTicket is called
    // Then: Returns 400 with "Cannot refund used ticket"
  });

  test('TC-TIC-RT-007: should invalidate QR code after refund', async () => {
    // Given: Ticket refunded
    // When: refundTicket completes
    // Then: QR code marked as invalid
  });

  test('TC-TIC-RT-008: should queue refund confirmation email', async () => {
    // Given: Refund processed
    // When: refundTicket completes
    // Then: Queues email to customer confirming refund
  });
});
```

---

## pricing.controller.ts

**Location:** `src/controllers/pricing.controller.ts`  
**Purpose:** Manages pricing tiers and dynamic pricing  
**Priority:** P1 Critical  
**Total Functions:** 5

---

### Function: `createPricing(request, reply)`

**Purpose:** Creates a new pricing tier for an event  
**Priority:** P1 Critical  
**Test File:** `tests/unit/controllers/pricing.controller.test.ts`

**Test Cases:**
```typescript
describe('createPricing', () => {
  test('TC-PRC-CP-001: should create pricing tier with valid data', async () => {
    // Given: Valid pricing data with event_id, tier_name, base_price_cents
    // When: createPricing is called
    // Then: Returns 201 with created pricing tier
  });

  test('TC-PRC-CP-002: should validate event exists before creating pricing', async () => {
    // Given: Valid pricing data
    // When: createPricing is called
    // Then: Verifies event exists and belongs to tenant
  });

  test('TC-PRC-CP-003: should set current_price_cents to base_price_cents initially', async () => {
    // Given: New pricing tier with base_price_cents = 5000
    // When: createPricing is called
    // Then: current_price_cents also set to 5000
  });

  test('TC-PRC-CP-004: should support early bird pricing', async () => {
    // Given: Pricing data with early_bird_price_cents and early_bird_ends_at
    // When: createPricing is called
    // Then: Tier created with early bird settings
  });

  test('TC-PRC-CP-005: should support last minute pricing', async () => {
    // Given: Pricing data with last_minute_price_cents and last_minute_starts_at
    // When: createPricing is called
    // Then: Tier created with last minute settings
  });

  test('TC-PRC-CP-006: should validate min_qty_per_order <= max_qty_per_order', async () => {
    // Given: Pricing with min_qty_per_order = 5, max_qty_per_order = 3
    // When: createPricing is called
    // Then: Returns 422 with validation error
  });

  test('TC-PRC-CP-007: should validate sales window dates', async () => {
    // Given: Pricing with sales_start_at after sales_end_at
    // When: createPricing is called
    // Then: Returns 422 with validation error
  });

  test('TC-PRC-CP-008: should link to schedule if schedule_id provided', async () => {
    // Given: Pricing data with schedule_id
    // When: createPricing is called
    // Then: Tier linked to specific schedule
  });

  test('TC-PRC-CP-009: should set default values for optional fields', async () => {
    // Given: Minimal pricing data
    // When: createPricing is called
    // Then: is_active defaults to true, is_visible defaults to true
  });

  test('TC-PRC-CP-010: should throw 404 if event not found', async () => {
    // Given: Invalid event_id
    // When: createPricing is called
    // Then: Returns 404 status
  });
});
```

---

### Function: `getPricing(request, reply)`

**Purpose:** Retrieves pricing tier details  
**Priority:** P1 Critical  
**Test File:** `tests/unit/controllers/pricing.controller.test.ts`

**Test Cases:**
```typescript
describe('getPricing', () => {
  test('TC-PRC-GP-001: should return pricing tier by ID', async () => {
    // Given: Valid pricing tier ID
    // When: getPricing is called
    // Then: Returns 200 with pricing tier object
  });

  test('TC-PRC-GP-002: should include current calculated price', async () => {
    // Given: Pricing tier with dynamic pricing
    // When: getPricing is called
    // Then: current_price_cents reflects current price (early bird, surge, etc.)
  });

  test('TC-PRC-GP-003: should include availability information', async () => {
    // Given: Pricing tier with total_qty and sold_qty
    // When: getPricing is called
    // Then: Returns available_qty = total_qty - sold_qty
  });

  test('TC-PRC-GP-004: should indicate if sales window is active', async () => {
    // Given: Pricing tier with sales_start_at and sales_end_at
    // When: getPricing is called
    // Then: Returns is_currently_available boolean
  });

  test('TC-PRC-GP-005: should throw 404 if pricing not found', async () => {
    // Given: Invalid pricing ID
    // When: getPricing is called
    // Then: Returns 404 status
  });

  test('TC-PRC-GP-006: should enforce tenant isolation', async () => {
    // Given: Pricing exists in different tenant
    // When: getPricing is called
    // Then: Returns 404 status
  });
});
```

---

### Function: `listPricing(request, reply)`

**Purpose:** Lists all pricing tiers for an event  
**Priority:** P1 Critical  
**Test File:** `tests/unit/controllers/pricing.controller.test.ts`

**Test Cases:**
```typescript
describe('listPricing', () => {
  test('TC-PRC-LP-001: should list all pricing tiers for event', async () => {
    // Given: Query param event_id={uuid}
    // When: listPricing is called
    // Then: Returns all pricing tiers for that event
  });

  test('TC-PRC-LP-002: should filter by schedule if schedule_id provided', async () => {
    // Given: Query params event_id and schedule_id
    // When: listPricing is called
    // Then: Returns only pricing for that specific schedule
  });

  test('TC-PRC-LP-003: should filter to active tiers only if requested', async () => {
    // Given: Query param active_only=true
    // When: listPricing is called
    // Then: Returns only tiers with is_active = true
  });

  test('TC-PRC-LP-004: should filter to visible tiers only if requested', async () => {
    // Given: Query param visible_only=true
    // When: listPricing is called
    // Then: Returns only tiers with is_visible = true
  });

  test('TC-PRC-LP-005: should order by display_order ascending', async () => {
    // Given: Multiple pricing tiers with different display_order values
    // When: listPricing is called
    // Then: Tiers ordered by display_order (lowest first)
  });

  test('TC-PRC-LP-006: should include current availability for each tier', async () => {
    // Given: Pricing tiers with sold_qty
    // When: listPricing is called
    // Then: Each tier includes available_qty calculated field
  });
});
```

---

### Function: `updatePricing(request, reply)`

**Purpose:** Updates pricing tier details  
**Priority:** P1 Critical  
**Test File:** `tests/unit/controllers/pricing.controller.test.ts`

**Test Cases:**
```typescript
describe('updatePricing', () => {
  test('TC-PRC-UP-001: should update pricing tier fields', async () => {
    // Given: Update payload with new prices
    // When: updatePricing is called
    // Then: Fields updated and returns 200
  });

  test('TC-PRC-UP-002: should allow updating current_price_cents for dynamic pricing', async () => {
    // Given: Update with new current_price_cents
    // When: updatePricing is called
    // Then: current_price_cents updated (for surge pricing)
  });

  test('TC-PRC-UP-003: should prevent price changes if tickets sold', async () => {
    // Given: Pricing tier with sold_qty > 0
    // When: updatePricing attempts to change base_price_cents
    // Then: Returns 400 with "Cannot change price after sales"
  });

  test('TC-PRC-UP-004: should allow non-price updates even with sales', async () => {
    // Given: Pricing tier with sales, update to tier_description
    // When: updatePricing is called
    // Then: Update allowed
  });

  test('TC-PRC-UP-005: should validate new min/max quantity constraints', async () => {
    // Given: Update with min_qty_per_order > max_qty_per_order
    // When: updatePricing is called
    // Then: Returns 422 with validation error
  });

  test('TC-PRC-UP-006: should invalidate related caches', async () => {
    // Given: Event and pricing cached
    // When: updatePricing is called
    // Then: Both caches invalidated
  });

  test('TC-PRC-UP-007: should create audit log', async () => {
    // Given: Pricing being updated
    // When: updatePricing is called
    // Then: Audit log created with before/after values
  });

  test('TC-PRC-UP-008: should throw 404 if pricing not found', async () => {
    // Given: Invalid pricing ID
    // When: updatePricing is called
    // Then: Returns 404 status
  });
});
```

---

### Function: `deletePricing(request, reply)`

**Purpose:** Soft deletes a pricing tier  
**Priority:** P2  
**Test File:** `tests/unit/controllers/pricing.controller.test.ts`

**Test Cases:**
```typescript
describe('deletePricing', () => {
  test('TC-PRC-DP-001: should soft delete pricing tier', async () => {
    // Given: Valid pricing ID with no sales
    // When: deletePricing is called
    // Then: Sets deleted_at timestamp and returns 200
  });

  test('TC-PRC-DP-002: should prevent deletion if tickets sold', async () => {
    // Given: Pricing tier with sold_qty > 0
    // When: deletePricing is called
    // Then: Returns 400 with "Cannot delete tier with sales"
  });

  test('TC-PRC-DP-003: should allow disabling instead of deleting', async () => {
    // Given: Pricing tier with sales
    // When: deletePricing is called with soft_disable=true
    // Then: Sets is_active = false instead of deleting
  });

  test('TC-PRC-DP-004: should invalidate caches', async () => {
    // Given: Pricing and event cached
    // When: deletePricing is called
    // Then: Caches invalidated
  });

  test('TC-PRC-DP-005: should create audit log', async () => {
    // Given: Pricing being deleted
    // When: deletePricing is called
    // Then: Audit log created
  });

  test('TC-PRC-DP-006: should throw 404 if pricing not found', async () => {
    // Given: Invalid pricing ID
    // When: deletePricing is called
    // Then: Returns 404 status
  });
});
```

---

## customer-analytics.controller.ts

**Location:** `src/controllers/customer-analytics.controller.ts`  
**Purpose:** Customer behavior and demographics analytics  
**Priority:** P2  
**Total Functions:** 4

---

### Function: `getCustomerAnalytics(request, reply)`

**Purpose:** Retrieves customer analytics for an event or across events  
**Priority:** P2  
**Test File:** `tests/unit/controllers/customer-analytics.controller.test.ts`

**Test Cases:**
```typescript
describe('getCustomerAnalytics', () => {
  test('TC-CAA-GCA-001: should return customer analytics for event', async () => {
    // Given: Query param event_id={uuid}
    // When: getCustomerAnalytics is called
    // Then: Returns analytics data with customer metrics
  });

  test('TC-CAA-GCA-002: should include customer demographics', async () => {
    // Given: Event with customer data
    // When: getCustomerAnalytics is called
    // Then: Returns age ranges, genders, locations
  });

  test('TC-CAA-GCA-003: should include purchase patterns', async () => {
    // Given: Event with ticket sales
    // When: getCustomerAnalytics is called
    // Then: Returns average tickets per customer, repeat customers
  });

  test('TC-CAA-GCA-004: should support date range filtering', async () => {
    // Given: Query params start_date, end_date
    // When: getCustomerAnalytics is called
    // Then: Analytics calculated for date range only
  });

  test('TC-CAA-GCA-005: should aggregate across all events if no event_id', async () => {
    // Given: No event_id param
    // When: getCustomerAnalytics is called
    // Then: Returns tenant-wide customer analytics
  });

  test('TC-CAA-GCA-006: should include customer lifetime value metrics', async () => {
    // Given: Customers with multiple purchases
    // When: getCustomerAnalytics is called
    // Then: Returns CLV, average order value
  });

  test('TC-CAA-GCA-007: should enforce tenant isolation', async () => {
    // Given: Analytics request
    // When: getCustomerAnalytics is called
    // Then: Only includes data from user's tenant
  });

  test('TC-CAA-GCA-008: should cache analytics results', async () => {
    // Given: Analytics calculated
    // When: getCustomerAnalytics completes
    // Then: Results cached in Redis with 1 hour TTL
  });
});
```

---

## report-analytics.controller.ts

**Location:** `src/controllers/report-analytics.controller.ts`  
**Purpose:** Generate and export analytics reports  
**Priority:** P2  
**Total Functions:** 4

---

### Function: `generateReport(request, reply)`

**Purpose:** Generates comprehensive analytics report  
**Priority:** P2  
**Test File:** `tests/unit/controllers/report-analytics.controller.test.ts`

**Test Cases:**
```typescript
describe('generateReport', () => {
  test('TC-RAC-GR-001: should generate report for event', async () => {
    // Given: Request with event_id and report_type
    // When: generateReport is called
    // Then: Returns 200 with report data
  });

  test('TC-RAC-GR-002: should support multiple report types', async () => {
    // Given: report_type = "sales", "capacity", "revenue", or "customer"
    // When: generateReport is called
    // Then: Generates appropriate report type
  });

  test('TC-RAC-GR-003: should include executive summary', async () => {
    // Given: Report generation request
    // When: generateReport is called
    // Then: Report includes summary with key metrics
  });

  test('TC-RAC-GR-004: should include detailed breakdowns', async () => {
    // Given: Sales report requested
    // When: generateReport is called
    // Then: Includes sales by day, by tier, by channel
  });

  test('TC-RAC-GR-005: should support date range filtering', async () => {
    // Given: Query params start_date, end_date
    // When: generateReport is called
    // Then: Report covers specified date range
  });

  test('TC-RAC-GR-006: should support export formats', async () => {
    // Given: Query param format="pdf" or "csv" or "json"
    // When: generateReport is called
    // Then: Returns report in requested format
  });

  test('TC-RAC-GR-007: should queue async report generation for large datasets', async () => {
    // Given: Report for event with 10,000+ tickets
    // When: generateReport is called
    // Then: Queues background job and returns job_id
  });

  test('TC-RAC-GR-008: should enforce tenant isolation', async () => {
    // Given: Report request
    // When: generateReport is called
    // Then: Only includes data from user's tenant
  });
});
```

---

## venue-analytics.controller.ts

**Location:** `src/controllers/venue-analytics.controller.ts`  
**Purpose:** Venue utilization and performance analytics  
**Priority:** P2  
**Total Functions:** 4

---

### Function: `getVenueAnalytics(request, reply)`

**Purpose:** Retrieves venue performance metrics  
**Priority:** P2  
**Test File:** `tests/unit/controllers/venue-analytics.controller.test.ts`

**Test Cases:**
```typescript
describe('getVenueAnalytics', () => {
  test('TC-VAC-GVA-001: should return analytics for specific venue', async () => {
    // Given: Query param venue_id={uuid}
    // When: getVenueAnalytics is called
    // Then: Returns analytics for that venue
  });

  test('TC-VAC-GVA-002: should include capacity utilization', async () => {
    // Given: Venue with events
    // When: getVenueAnalytics is called
    // Then: Returns average capacity utilization percentage
  });

  test('TC-VAC-GVA-003: should include revenue metrics', async () => {
    // Given: Venue with ticket sales
    // When: getVenueAnalytics is called
    // Then: Returns total revenue, revenue per event
  });

  test('TC-VAC-GVA-004: should include event frequency metrics', async () => {
    // Given: Venue with multiple events
    // When: getVenueAnalytics is called
    // Then: Returns events per month, busiest days
  });

  test('TC-VAC-GVA-005: should support date range filtering', async () => {
    // Given: Query params start_date, end_date
    // When: getVenueAnalytics is called
    // Then: Analytics calculated for date range
  });

  test('TC-VAC-GVA-006: should aggregate across all venues if no venue_id', async () => {
    // Given: No venue_id param
    // When: getVenueAnalytics is called
    // Then: Returns tenant-wide venue analytics
  });

  test('TC-VAC-GVA-007: should include top performing events', async () => {
    // Given: Venue with multiple events
    // When: getVenueAnalytics is called
    // Then: Returns list of highest revenue/attendance events
  });

  test('TC-VAC-GVA-008: should enforce tenant isolation', async () => {
    // Given: Analytics request
    // When: getVenueAnalytics is called
    // Then: Only includes venues from user's tenant
  });
});
```

---

## notification.controller.ts

**Location:** `src/controllers/notification.controller.ts`  
**Purpose:** Manages event notifications and reminders  
**Priority:** P2  
**Total Functions:** 4

---

### Function: `sendEventReminder(request, reply)`

**Purpose:** Sends reminder notification before event  
**Priority:** P2  
**Test File:** `tests/unit/controllers/notification.controller.test.ts`

**Test Cases:**
```typescript
describe('sendEventReminder', () => {
  test('TC-NC-SER-001: should send reminder to all ticket holders', async () => {
    // Given: Event with ticket holders and request to send reminder
    // When: sendEventReminder is called
    // Then: Queues reminder emails to all customers
  });

  test('TC-NC-SER-002: should include event details in reminder', async () => {
    // Given: Reminder being sent
    // When: sendEventReminder is called
    // Then: Email includes event name, date, venue, doors time
  });

  test('TC-NC-SER-003: should include ticket information', async () => {
    // Given: Customer with tickets
    // When: sendEventReminder is called
    // Then: Email includes ticket numbers and QR codes
  });

  test('TC-NC-SER-004: should respect customer notification preferences', async () => {
    // Given: Some customers opted out of reminders
    // When: sendEventReminder is called
    // Then: Only sends to customers who opted in
  });

  test('TC-NC-SER-005: should support custom reminder timing', async () => {
    // Given: Request with hours_before = 24
    // When: sendEventReminder is called
    // Then: Schedules reminders for 24 hours before event
  });

  test('TC-NC-SER-006: should support SMS reminders', async () => {
    // Given: Request with channel = "sms"
    // When: sendEventReminder is called
    // Then: Sends SMS instead of email
  });

  test('TC-NC-SER-007: should track reminder sent status', async () => {
    // Given: Reminders sent
    // When: sendEventReminder completes
    // Then: Creates notification log entries
  });

  test('TC-NC-SER-008: should throw 404 if event not found', async () => {
    // Given: Invalid event_id
    // When: sendEventReminder is called
    // Then: Returns 404 status
  });
});
```

---

### Function: `sendCancellation(request, reply)`

**Purpose:** Sends cancellation notice to ticket holders  
**Priority:** P2  
**Test File:** `tests/unit/controllers/notification.controller.test.ts`

**Test Cases:**
```typescript
describe('sendCancellation', () => {
  test('TC-NC-SC-001: should send cancellation notice to all ticket holders', async () => {
    // Given: Cancelled event with ticket holders
    // When: sendCancellation is called
    // Then: Queues cancellation emails to all customers
  });

  test('TC-NC-SC-002: should include cancellation reason', async () => {
    // Given: Event cancelled with reason provided
    // When: sendCancellation is called
    // Then: Email includes cancellation reason
  });

  test('TC-NC-SC-003: should include refund information', async () => {
    // Given: Cancellation with automatic refunds
    // When: sendCancellation is called
    // Then: Email includes refund amount and timeline
  });

  test('TC-NC-SC-004: should provide alternative event options if available', async () => {
    // Given: Tenant has similar upcoming events
    // When: sendCancellation is called
    // Then: Email includes suggestions for alternative events
  });

  test('TC-NC-SC-005: should support immediate and scheduled sending', async () => {
    // Given: Request with send_immediately = true
    // When: sendCancellation is called
    // Then: Sends immediately rather than queuing
  });

  test('TC-NC-SC-006: should track notification delivery', async () => {
    // Given: Cancellation notices sent
    // When: sendCancellation completes
    // Then: Creates notification log entries
  });

  test('TC-NC-SC-007: should support SMS notifications', async () => {
    // Given: Request with channels including "sms"
    // When: sendCancellation is called
    // Then: Sends both email and SMS
  });

  test('TC-NC-SC-008: should throw 404 if event not found', async () => {
    // Given: Invalid event_id
    // When: sendCancellation is called
    // Then: Returns 404 status
  });
});
```

---

### Function: `sendUpdate(request, reply)`

**Purpose:** Sends event update notification to ticket holders  
**Priority:** P2  
**Test File:** `tests/unit/controllers/notification.controller.test.ts`

**Test Cases:**
```typescript
describe('sendUpdate', () => {
  test('TC-NC-SU-001: should send update to all ticket holders', async () => {
    // Given: Event update with ticket holders
    // When: sendUpdate is called
    // Then: Queues update emails to all customers
  });

  test('TC-NC-SU-002: should include what changed', async () => {
    // Given: Update with changed fields (time, venue, etc.)
    // When: sendUpdate is called
    // Then: Email clearly states what changed
  });

  test('TC-NC-SU-003: should include before/after values for changes', async () => {
    // Given: Time changed from 7pm to 8pm
    // When: sendUpdate is called
    // Then: Email shows "Time changed from 7:00 PM to 8:00 PM"
  });

  test('TC-NC-SU-004: should support custom message', async () => {
    // Given: Request with custom_message field
    // When: sendUpdate is called
    // Then: Email includes custom message from organizer
  });

  test('TC-NC-SU-005: should respect notification preferences', async () => {
    // Given: Some customers opted out of updates
    // When: sendUpdate is called
    // Then: Only sends to opted-in customers
  });

  test('TC-NC-SU-006: should track notification delivery', async () => {
    // Given: Updates sent
    // When: sendUpdate completes
    // Then: Creates notification log entries
  });

  test('TC-NC-SU-007: should throw 404 if event not found', async () => {
    // Given: Invalid event_id
    // When: sendUpdate is called
    // Then: Returns 404 status
  });
});
```

---

### Function: `getNotificationPreferences(request, reply)`

**Purpose:** Retrieves customer notification preferences  
**Priority:** P3  
**Test File:** `tests/unit/controllers/notification.controller.test.ts`

**Test Cases:**
```typescript
describe('getNotificationPreferences', () => {
  test('TC-NC-GNP-001: should return preferences for customer', async () => {
    // Given: Valid customer_id
    // When: getNotificationPreferences is called
    // Then: Returns preference settings
  });

  test('TC-NC-GNP-002: should include email preferences', async () => {
    // Given: Customer with preferences set
    // When: getNotificationPreferences is called
    // Then: Returns email_reminders, email_updates flags
  });

  test('TC-NC-GNP-003: should include SMS preferences', async () => {
    // Given: Customer with SMS preferences
    // When: getNotificationPreferences is called
    // Then: Returns sms_reminders, sms_updates flags
  });

  test('TC-NC-GNP-004: should include preferred timing', async () => {
    // Given: Customer preferences
    // When: getNotificationPreferences is called
    // Then: Returns reminder_hours_before setting
  });

  test('TC-NC-GNP-005: should throw 404 if customer not found', async () => {
    // Given: Invalid customer_id
    // When: getNotificationPreferences is called
    // Then: Returns 404 status
  });
});
```

---

# SERVICES

## event.service.ts

**Location:** `src/services/event.service.ts`  
**Purpose:** Core business logic for event management  
**Priority:** P1 Critical  
**Total Functions:** ~25

---

### Function: `createEvent(data, context)`

**Purpose:** Business logic for event creation with validation  
**Priority:** P1 Critical  
**Test File:** `tests/unit/services/event.service.test.ts`

**Test Cases:**
```typescript
describe('createEvent', () => {
  test('TC-ES-CE-001: should create event in database', async () => {
    // Given: Valid event data and context
    // When: createEvent is called
    // Then: Inserts event into events table
    // And: Returns created event object
  });

  test('TC-ES-CE-002: should generate unique slug', async () => {
    // Given: Event name "Summer Festival"
    // When: createEvent is called
    // Then: Generates slug "summer-festival"
    // And: Ensures slug is unique within tenant
  });

  test('TC-ES-CE-003: should handle slug conflicts with suffix', async () => {
    // Given: Slug "summer-festival" already exists
    // When: createEvent with same name
    // Then: Generates "summer-festival-2"
  });

  test('TC-ES-CE-004: should create default event metadata', async () => {
    // Given: Event being created
    // When: createEvent is called
    // Then: Creates event_metadata record with default values
  });

  test('TC-ES-CE-005: should create initial capacity entry', async () => {
    // Given: Event with capacity = 1000
    // When: createEvent is called
    // Then: Creates event_capacity record with total_capacity = 1000
  });

  test('TC-ES-CE-006: should validate venue exists via client', async () => {
    // Given: Event data with venue_id
    // When: createEvent is called
    // Then: Calls VenueServiceClient.getVenue()
    // And: Throws error if venue not found
  });

  test('TC-ES-CE-007: should validate category exists if provided', async () => {
    // Given: Event data with category_id
    // When: createEvent is called
    // Then: Verifies category exists in event_categories
  });

  test('TC-ES-CE-008: should use database transaction', async () => {
    // Given: Event creation with metadata and capacity
    // When: createEvent is called
    // Then: Wraps all inserts in transaction
    // And: Rolls back if any step fails
  });

  test('TC-ES-CE-009: should publish event.created event', async () => {
    // Given: Event created successfully
    // When: createEvent completes
    // Then: Publishes domain event
  });

  test('TC-ES-CE-010: should cache created event', async () => {
    // Given: Event created
    // When: createEvent completes
    // Then: Stores in Redis with key "event:{id}"
  });

  test('TC-ES-CE-011: should validate time constraints', async () => {
    // Given: starts_at after ends_at
    // When: createEvent is called
    // Then: Throws ValidationError
  });

  test('TC-ES-CE-012: should set default timezone to UTC', async () => {
    // Given: Event data without timezone
    // When: createEvent is called
    // Then: timezone field defaults to "UTC"
  });
});
```

---

### Function: `getEvent(eventId, tenantId, options)`

**Purpose:** Fetches event with caching and eager loading  
**Priority:** P1 Critical  
**Test File:** `tests/unit/services/event.service.test.ts`

**Test Cases:**
```typescript
describe('getEvent', () => {
  test('TC-ES-GE-001: should fetch from cache if available', async () => {
    // Given: Event cached in Redis
    // When: getEvent is called
    // Then: Returns cached data without database query
  });

  test('TC-ES-GE-002: should fetch from database if not cached', async () => {
    // Given: Event not in cache
    // When: getEvent is called
    // Then: Queries database
    // And: Caches result
  });

  test('TC-ES-GE-003: should eager load venue if requested', async () => {
    // Given: options.include = ['venue']
    // When: getEvent is called
    // Then: Joins with venue data (or calls venue service)
  });

  test('TC-ES-GE-004: should eager load category if requested', async () => {
    // Given: options.include = ['category']
    // When: getEvent is called
    // Then: Joins with category data
  });

  test('TC-ES-GE-005: should eager load schedules if requested', async () => {
    // Given: options.include = ['schedules']
    // When: getEvent is called
    // Then: Returns event with schedules array
  });

  test('TC-ES-GE-006: should eager load pricing if requested', async () => {
    // Given: options.include = ['pricing']
    // When: getEvent is called
    // Then: Returns event with pricing array
  });

  test('TC-ES-GE-007: should eager load metadata if requested', async () => {
    // Given: options.include = ['metadata']
    // When: getEvent is called
    // Then: Returns event with metadata object
  });

  test('TC-ES-GE-008: should enforce tenant isolation', async () => {
    // Given: Event in different tenant
    // When: getEvent is called with user tenantId
    // Then: Throws NotFoundError
  });
});
```

---

### Function: `listEvents(filters, tenantId, options)`

**Purpose:** Query events with filtering and pagination  
**Priority:** P1 Critical  
**Test File:** `tests/unit/services/event.service.test.ts`

**Test Cases:**
```typescript
describe('listEvents', () => {
  test('TC-ES-LE-001: should list all events for tenant', async () => {
    // Given: filters = {}, tenantId
    // When: listEvents is called
    // Then: Returns all non-deleted events for tenant
  });

  test('TC-ES-LE-002: should apply status filter', async () => {
    // Given: filters.status = 'published'
    // When: listEvents is called
    // Then: Returns only published events
  });

  test('TC-ES-LE-003: should apply category filter', async () => {
    // Given: filters.category_id = {uuid}
    // When: listEvents is called
    // Then: Returns events in that category
  });

  test('TC-ES-LE-004: should apply venue filter', async () => {
    // Given: filters.venue_id = {uuid}
    // When: listEvents is called
    // Then: Returns events at that venue
  });

  test('TC-ES-LE-005: should apply date range filter', async () => {
    // Given: filters.start_date, filters.end_date
    // When: listEvents is called
    // Then: Returns events within date range
  });

  test('TC-ES-LE-006: should apply search filter', async () => {
    // Given: filters.search = "music"
    // When: listEvents is called
    // Then: Returns events where name contains "music"
  });

  test('TC-ES-LE-007: should apply pagination', async () => {
    // Given: options.limit = 10, options.offset = 5
    // When: listEvents is called
    // Then: Returns 10 events starting from position 5
  });

  test('TC-ES-LE-008: should return total count', async () => {
    // Given: 100 matching events, limit = 20
    // When: listEvents is called
    // Then: Returns { events: [...20 events], total: 100 }
  });

  test('TC-ES-LE-009: should order by event_date by default', async () => {
    // Given: No order specified
    // When: listEvents is called
    // Then: Events ordered by event_date ascending
  });

  test('TC-ES-LE-010: should exclude soft-deleted events', async () => {
    // Given: Some events have deleted_at timestamp
    // When: listEvents is called
    // Then: Deleted events not included
  });
});
```

---

### Function: `updateEvent(eventId, updates, tenantId, context)`

**Purpose:** Updates event with validation and cache invalidation  
**Priority:** P1 Critical  
**Test File:** `tests/unit/services/event.service.test.ts`

**Test Cases:**
```typescript
describe('updateEvent', () => {
  test('TC-ES-UE-001: should update event fields', async () => {
    // Given: Valid updates object
    // When: updateEvent is called
    // Then: Updates fields in database
    // And: Returns updated event
  });

  test('TC-ES-UE-002: should invalidate cache', async () => {
    // Given: Event is cached
    // When: updateEvent is called
    // Then: Deletes cache entry for "event:{id}"
  });

  test('TC-ES-UE-003: should validate venue if venue_id changed', async () => {
    // Given: updates.venue_id = new venue
    // When: updateEvent is called
    // Then: Validates new venue exists and in same tenant
  });

  test('TC-ES-UE-004: should validate time constraints', async () => {
    // Given: updates.starts_at after updates.ends_at
    // When: updateEvent is called
    // Then: Throws ValidationError
  });

  test('TC-ES-UE-005: should not allow updating immutable fields', async () => {
    // Given: updates includes id, created_at, tenant_id
    // When: updateEvent is called
    // Then: Those fields filtered out
  });

  test('TC-ES-UE-006: should update updated_at timestamp', async () => {
    // Given: Event being updated
    // When: updateEvent is called
    // Then: updated_at set to current timestamp
  });

  test('TC-ES-UE-007: should publish event.updated event', async () => {
    // Given: Event updated successfully
    // When: updateEvent completes
    // Then: Publishes domain event with changes
  });

  test('TC-ES-UE-008: should enforce tenant isolation', async () => {
    // Given: Event in different tenant
    // When: updateEvent is called
    // Then: Throws NotFoundError
  });

  test('TC-ES-UE-009: should handle partial updates', async () => {
    // Given: updates with only { name: "New Name" }
    // When: updateEvent is called
    // Then: Only name updated, other fields unchanged
  });

  test('TC-ES-UE-010: should use database transaction', async () => {
    // Given: Complex update affecting multiple tables
    // When: updateEvent is called
    // Then: Wraps in transaction
  });
});
```

---

### Function: `deleteEvent(eventId, tenantId, context)`

**Purpose:** Soft deletes event and cascades to related records  
**Priority:** P1 Critical  
**Test File:** `tests/unit/services/event.service.test.ts`

**Test Cases:**
```typescript
describe('deleteEvent', () => {
  test('TC-ES-DE-001: should soft delete event', async () => {
    // Given: Valid event ID
    // When: deleteEvent is called
    // Then: Sets deleted_at timestamp
  });

  test('TC-ES-DE-002: should cascade to schedules', async () => {
    // Given: Event with schedules
    // When: deleteEvent is called
    // Then: All schedules soft deleted
  });

  test('TC-ES-DE-003: should cascade to pricing', async () => {
    // Given: Event with pricing tiers
    // When: deleteEvent is called
    // Then: All pricing tiers soft deleted
  });

  test('TC-ES-DE-004: should invalidate cache', async () => {
    // Given: Event cached
    // When: deleteEvent is called
    // Then: Cache entry deleted
  });

  test('TC-ES-DE-005: should publish event.deleted event', async () => {
    // Given: Event deleted
    // When: deleteEvent completes
    // Then: Publishes domain event
  });

  test('TC-ES-DE-006: should use database transaction', async () => {
    // Given: Cascade deletes needed
    // When: deleteEvent is called
    // Then: Wraps in transaction
  });

  test('TC-ES-DE-007: should throw error if tickets sold', async () => {
    // Given: Event with sold tickets
    // When: deleteEvent is called
    // Then: Throws BusinessRuleError
  });

  test('TC-ES-DE-008: should enforce tenant isolation', async () => {
    // Given: Event in different tenant
    // When: deleteEvent is called
    // Then: Throws NotFoundError
  });
});
```

---

### Function: `publishEvent(eventId, tenantId, context)`

**Purpose:** Validates and publishes draft event  
**Priority:** P1 Critical  
**Test File:** `tests/unit/services/event.service.test.ts`

**Test Cases:**
```typescript
describe('publishEvent', () => {
  test('TC-ES-PE-001: should publish event with valid data', async () => {
    // Given: Draft event meeting all requirements
    // When: publishEvent is called
    // Then: Status changed to 'published'
    // And: is_published set to true
  });

  test('TC-ES-PE-002: should validate event has pricing', async () => {
    // Given: Draft event without pricing tiers
    // When: publishEvent is called
    // Then: Throws ValidationError "Event must have at least one pricing tier"
  });

  test('TC-ES-PE-003: should validate event has schedule', async () => {
    // Given: Draft event without schedules
    // When: publishEvent is called
    // Then: Throws ValidationError "Event must have at least one schedule"
  });

  test('TC-ES-PE-004: should validate venue is active', async () => {
    // Given: Event with inactive venue
    // When: publishEvent is called
    // Then: Throws ValidationError "Cannot publish with inactive venue"
  });

  test('TC-ES-PE-005: should validate all required fields populated', async () => {
    // Given: Draft event missing description
    // When: publishEvent is called
    // Then: Throws ValidationError listing missing fields
  });

  test('TC-ES-PE-006: should prevent re-publishing', async () => {
    // Given: Already published event
    // When: publishEvent is called
    // Then: Throws BusinessRuleError "Event already published"
  });

  test('TC-ES-PE-007: should invalidate cache', async () => {
    // Given: Event cached
    // When: publishEvent is called
    // Then: Cache invalidated
  });

  test('TC-ES-PE-008: should publish event.published event', async () => {
    // Given: Event published
    // When: publishEvent completes
    // Then: Publishes domain event
  });

  test('TC-ES-PE-009: should enforce tenant isolation', async () => {
    // Given: Event in different tenant
    // When: publishEvent is called
    // Then: Throws NotFoundError
  });

  test('TC-ES-PE-010: should update published_at timestamp', async () => {
    // Given: Event being published
    // When: publishEvent is called
    // Then: published_at set to current timestamp
  });
});
```

---

### Function: `cancelEvent(eventId, reason, tenantId, context)`

**Purpose:** Cancels event and triggers refund workflow  
**Priority:** P1 Critical  
**Test File:** `tests/unit/services/event.service.test.ts`

**Test Cases:**
```typescript
describe('cancelEvent', () => {
  test('TC-ES-CAE-001: should cancel event and update status', async () => {
    // Given: Published event
    // When: cancelEvent is called
    // Then: Status changed to 'cancelled'
  });

  test('TC-ES-CAE-002: should store cancellation reason', async () => {
    // Given: Cancellation with reason
    // When: cancelEvent is called
    // Then: Reason stored in metadata or cancellation_reason field
  });

  test('TC-ES-CAE-003: should queue refund processing', async () => {
    // Given: Event with sold tickets
    // When: cancelEvent is called
    // Then: Queues refund jobs for all tickets
  });

  test('TC-ES-CAE-004: should release all reservations', async () => {
    // Given: Event with pending reservations
    // When: cancelEvent is called
    // Then: All reservations released
  });

  test('TC-ES-CAE-005: should queue cancellation notifications', async () => {
    // Given: Event with ticket holders
    // When: cancelEvent is called
    // Then: Queues notification jobs
  });

  test('TC-ES-CAE-006: should invalidate cache', async () => {
    // Given: Event cached
    // When: cancelEvent is called
    // Then: Cache invalidated
  });

  test('TC-ES-CAE-007: should publish event.cancelled event', async () => {
    // Given: Event cancelled
    // When: cancelEvent completes
    // Then: Publishes domain event
  });

  test('TC-ES-CAE-008: should use database transaction', async () => {
    // Given: Multiple operations needed
    // When: cancelEvent is called
    // Then: Wraps in transaction
  });

  test('TC-ES-CAE-009: should prevent cancelling already cancelled event', async () => {
    // Given: Already cancelled event
    // When: cancelEvent is called
    // Then: Throws BusinessRuleError
  });

  test('TC-ES-CAE-010: should enforce tenant isolation', async () => {
    // Given: Event in different tenant
    // When: cancelEvent is called
    // Then: Throws NotFoundError
  });
});
```

---

*Continuing with remaining service functions...*

### Function: `createSchedule(scheduleData, context)`

**Purpose:** Creates event schedule with conflict checking  
**Priority:** P1 Critical  
**Test File:** `tests/unit/services/event.service.test.ts`

**Test Cases:**
```typescript
describe('createSchedule', () => {
  test('TC-ES-CS-001: should create schedule for event', async () => {
    // Given: Valid schedule data with event_id
    // When: createSchedule is called
    // Then: Inserts schedule into event_schedules table
  });

  test('TC-ES-CS-002: should validate event exists', async () => {
    // Given: Schedule data with event_id
    // When: createSchedule is called
    // Then: Verifies event exists and belongs to tenant
  });

  test('TC-ES-CS-003: should check venue availability', async () => {
    // Given: Schedule for specific time
    // When: createSchedule is called
    // Then: Calls VenueServiceClient to check conflicts
  });

  test('TC-ES-CS-004: should create capacity entry for schedule', async () => {
    // Given: Schedule created successfully
    // When: createSchedule completes
    // Then: Creates event_capacity record linked to schedule
  });

  test('TC-ES-CS-005: should support recurring schedules', async () => {
    // Given: Schedule with recurrence_rule
    // When: createSchedule is called
    // Then: Creates multiple schedule entries following pattern
  });

  test('TC-ES-CS-006: should validate time constraints', async () => {
    // Given: Schedule with starts_at after ends_at
    // When: createSchedule is called
    // Then: Throws ValidationError
  });

  test('TC-ES-CS-007: should invalidate event cache', async () => {
    // Given: Event cached
    // When: createSchedule is called
    // Then: Event cache invalidated
  });

  test('TC-ES-CS-008: should enforce tenant isolation', async () => {
    // Given: Event in different tenant
    // When: createSchedule is called
    // Then: Throws NotFoundError
  });

  test('TC-ES-CS-009: should handle timezone correctly', async () => {
    // Given: Schedule with timezone specified
    // When: createSchedule is called
    // Then: Times stored in UTC, timezone field preserved
  });

  test('TC-ES-CS-010: should set default status to active', async () => {
    // Given: New schedule without status
    // When: createSchedule is called
    // Then: status defaults to 'active'
  });
});
```

---

### Function: `getSchedule(scheduleId, tenantId)`

**Purpose:** Fetches single schedule with event details  
**Priority:** P1 Critical  
**Test File:** `tests/unit/services/event.service.test.ts`

**Test Cases:**
```typescript
describe('getSchedule', () => {
  test('TC-ES-GSC-001: should fetch schedule by ID', async () => {
    // Given: Valid schedule ID
    // When: getSchedule is called
    // Then: Returns schedule object
  });

  test('TC-ES-GSC-002: should include event details', async () => {
    // Given: Schedule with event_id
    // When: getSchedule is called
    // Then: Returns schedule with populated event
  });

  test('TC-ES-GSC-003: should include capacity information', async () => {
    // Given: Schedule with capacity tracking
    // When: getSchedule is called
    // Then: Returns schedule with capacity stats
  });

  test('TC-ES-GSC-004: should enforce tenant isolation', async () => {
    // Given: Schedule in different tenant
    // When: getSchedule is called
    // Then: Throws NotFoundError
  });

  test('TC-ES-GSC-005: should exclude soft-deleted schedules', async () => {
    // Given: Schedule with deleted_at timestamp
    // When: getSchedule is called
    // Then: Throws NotFoundError
  });

  test('TC-ES-GSC-006: should cache schedule data', async () => {
    // Given: Schedule fetched from database
    // When: getSchedule completes
    // Then: Caches result in Redis
  });
});
```

---

### Function: `listSchedules(filters, tenantId)`

**Purpose:** Queries schedules with filtering  
**Priority:** P1 Critical  
**Test File:** `tests/unit/services/event.service.test.ts`

**Test Cases:**
```typescript
describe('listSchedules', () => {
  test('TC-ES-LSC-001: should list all schedules for event', async () => {
    // Given: filters.event_id = {uuid}
    // When: listSchedules is called
    // Then: Returns all schedules for that event
  });

  test('TC-ES-LSC-002: should filter by date range', async () => {
    // Given: filters.start_date, filters.end_date
    // When: listSchedules is called
    // Then: Returns schedules within range
  });

  test('TC-ES-LSC-003: should filter by status', async () => {
    // Given: filters.status = 'active'
    // When: listSchedules is called
    // Then: Returns only active schedules
  });

  test('TC-ES-LSC-004: should order by starts_at ascending', async () => {
    // Given: Multiple schedules
    // When: listSchedules is called
    // Then: Ordered by starts_at (earliest first)
  });

  test('TC-ES-LSC-005: should support pagination', async () => {
    // Given: filters with limit and offset
    // When: listSchedules is called
    // Then: Returns paginated results
  });

  test('TC-ES-LSC-006: should exclude soft-deleted schedules', async () => {
    // Given: Some schedules deleted
    // When: listSchedules is called
    // Then: Deleted schedules not included
  });
});
```

---

### Function: `updateSchedule(scheduleId, updates, tenantId, context)`

**Purpose:** Updates schedule with validation  
**Priority:** P1 Critical  
**Test File:** `tests/unit/services/event.service.test.ts`

**Test Cases:**
```typescript
describe('updateSchedule', () => {
  test('TC-ES-USC-001: should update schedule fields', async () => {
    // Given: Valid updates
    // When: updateSchedule is called
    // Then: Updates fields in database
  });

  test('TC-ES-USC-002: should check conflicts if times changed', async () => {
    // Given: updates changes starts_at or ends_at
    // When: updateSchedule is called
    // Then: Checks venue availability for new times
  });

  test('TC-ES-USC-003: should prevent major changes if tickets sold', async () => {
    // Given: Schedule with sold tickets, major time change
    // When: updateSchedule is called
    // Then: Throws BusinessRuleError
  });

  test('TC-ES-USC-004: should allow minor changes with sales', async () => {
    // Given: Schedule with sales, update to notes only
    // When: updateSchedule is called
    // Then: Update allowed
  });

  test('TC-ES-USC-005: should invalidate caches', async () => {
    // Given: Schedule and event cached
    // When: updateSchedule is called
    // Then: Both caches invalidated
  });

  test('TC-ES-USC-006: should validate time constraints', async () => {
    // Given: updates with starts_at after ends_at
    // When: updateSchedule is called
    // Then: Throws ValidationError
  });

  test('TC-ES-USC-007: should enforce tenant isolation', async () => {
    // Given: Schedule in different tenant
    // When: updateSchedule is called
    // Then: Throws NotFoundError
  });

  test('TC-ES-USC-008: should update updated_at timestamp', async () => {
    // Given: Schedule being updated
    // When: updateSchedule is called
    // Then: updated_at set to current time
  });
});
```

---

### Function: `deleteSchedule(scheduleId, tenantId, context)`

**Purpose:** Soft deletes schedule  
**Priority:** P1 Critical  
**Test File:** `tests/unit/services/event.service.test.ts`

**Test Cases:**
```typescript
describe('deleteSchedule', () => {
  test('TC-ES-DSC-001: should soft delete schedule', async () => {
    // Given: Valid schedule ID
    // When: deleteSchedule is called
    // Then: Sets deleted_at timestamp
  });

  test('TC-ES-DSC-002: should prevent deletion if tickets sold', async () => {
    // Given: Schedule with sold tickets
    // When: deleteSchedule is called
    // Then: Throws BusinessRuleError
  });

  test('TC-ES-DSC-003: should release pending reservations', async () => {
    // Given: Schedule with reservations
    // When: deleteSchedule is called
    // Then: All reservations released
  });

  test('TC-ES-DSC-004: should soft delete capacity entry', async () => {
    // Given: Schedule with capacity entry
    // When: deleteSchedule is called
    // Then: Capacity entry also deleted
  });

  test('TC-ES-DSC-005: should invalidate caches', async () => {
    // Given: Caches exist
    // When: deleteSchedule is called
    // Then: Schedule and event caches invalidated
  });

  test('TC-ES-DSC-006: should enforce tenant isolation', async () => {
    // Given: Schedule in different tenant
    // When: deleteSchedule is called
    // Then: Throws NotFoundError
  });
});
```

---

## capacity.service.ts

**Location:** `src/services/capacity.service.ts`  
**Purpose:** Capacity management with Redis-backed distributed locking  
**Priority:** P1 Critical  
**Total Functions:** ~12

---

### Function: `getCapacity(eventId, scheduleId, tenantId)`

**Purpose:** Retrieves real-time capacity from Redis or database  
**Priority:** P1 Critical  
**Test File:** `tests/unit/services/capacity.service.test.ts`

**Test Cases:**
```typescript
describe('getCapacity', () => {
  test('TC-CAPS-GC-001: should return capacity from Redis if available', async () => {
    // Given: Capacity cached in Redis
    // When: getCapacity is called
    // Then: Returns cached capacity without database query
  });

  test('TC-CAPS-GC-002: should fetch from database if not cached', async () => {
    // Given: Capacity not in Redis
    // When: getCapacity is called
    // Then: Queries event_capacity table
    // And: Caches result in Redis
  });

  test('TC-CAPS-GC-003: should calculate available capacity', async () => {
    // Given: total=100, sold=40, pending=10, reserved=5
    // When: getCapacity is called
    // Then: Returns available = 45 (100-40-10-5)
  });

  test('TC-CAPS-GC-004: should work with event_id parameter', async () => {
    // Given: event_id provided
    // When: getCapacity is called
    // Then: Returns aggregated capacity across all schedules
  });

  test('TC-CAPS-GC-005: should work with schedule_id parameter', async () => {
    // Given: schedule_id provided
    // When: getCapacity is called
    // Then: Returns capacity for specific schedule
  });

  test('TC-CAPS-GC-006: should include utilization percentage', async () => {
    // Given: Capacity data
    // When: getCapacity is called
    // Then: Returns calculated utilization_percentage
  });

  test('TC-CAPS-GC-007: should enforce tenant isolation', async () => {
    // Given: Event/schedule in different tenant
    // When: getCapacity is called
    // Then: Throws NotFoundError
  });

  test('TC-CAPS-GC-008: should handle missing capacity gracefully', async () => {
    // Given: Event without capacity entry
    // When: getCapacity is called
    // Then: Returns default capacity structure
  });
});
```

---

### Function: `reserveCapacity(reservationData, tenantId)`

**Purpose:** Reserves capacity with distributed locking  
**Priority:** P1 Critical  
**Test File:** `tests/unit/services/capacity.service.test.ts`

**Test Cases:**
```typescript
describe('reserveCapacity', () => {
  test('TC-CAPS-RC-001: should reserve capacity with valid request', async () => {
    // Given: Valid reservation data (event_id, schedule_id, quantity)
    // When: reserveCapacity is called
    // Then: Creates reservation and returns confirmation
  });

  test('TC-CAPS-RC-002: should use Redis lock to prevent race conditions', async () => {
    // Given: Multiple concurrent reservation requests
    // When: reserveCapacity is called simultaneously
    // Then: Uses SETNX lock to ensure atomicity
    // And: Only one succeeds if at capacity
  });

  test('TC-CAPS-RC-003: should check availability before reserving', async () => {
    // Given: available_capacity = 5, request for 10
    // When: reserveCapacity is called
    // Then: Throws InsufficientCapacityError
  });

  test('TC-CAPS-RC-004: should increment pending_count in Redis', async () => {
    // Given: pending_count = 10, reserve quantity 3
    // When: reserveCapacity is called
    // Then: pending_count updated to 13
  });

  test('TC-CAPS-RC-005: should create reservation record in database', async () => {
    // Given: Successful reservation
    // When: reserveCapacity completes
    // Then: Inserts record into reservations table
  });

  test('TC-CAPS-RC-006: should set 10-minute expiration', async () => {
    // Given: New reservation
    // When: reserveCapacity is called
    // Then: Redis key TTL = 600 seconds
    // And: expires_at = now + 10 minutes
  });

  test('TC-CAPS-RC-007: should lock pricing at reservation time', async () => {
    // Given: Pricing tier with current price
    // When: reserveCapacity is called
    // Then: Stores locked_price_data in capacity record
  });

  test('TC-CAPS-RC-008: should validate quantity against max_per_order', async () => {
    // Given: Pricing tier max_per_order = 10, request for 15
    // When: reserveCapacity is called
    // Then: Throws ValidationError
  });

  test('TC-CAPS-RC-009: should handle lock acquisition failure gracefully', async () => {
    // Given: Unable to acquire Redis lock
    // When: reserveCapacity is called
    // Then: Retries or throws ConcurrencyError
  });

  test('TC-CAPS-RC-010: should enforce tenant isolation', async () => {
    // Given: Event/schedule in different tenant
    // When: reserveCapacity is called
    // Then: Throws NotFoundError
  });

  test('TC-CAPS-RC-011: should validate reservation_id is unique', async () => {
    // Given: Duplicate reservation_id
    // When: reserveCapacity is called
    // Then: Throws ConflictError
  });

  test('TC-CAPS-RC-012: should update database capacity counters', async () => {
    // Given: Reservation created
    // When: reserveCapacity completes
    // Then: Updates pending_count in event_capacity table
  });
});
```

---

### Function: `releaseCapacity(reservationId, tenantId)`

**Purpose:** Releases capacity reservation  
**Priority:** P1 Critical  
**Test File:** `tests/unit/services/capacity.service.test.ts`

**Test Cases:**
```typescript
describe('releaseCapacity', () => {
  test('TC-CAPS-RLC-001: should release capacity reservation', async () => {
    // Given: Active reservation
    // When: releaseCapacity is called
    // Then: Decrements pending_count in Redis
    // And: Deletes reservation record
  });

  test('TC-CAPS-RLC-002: should use Redis lock for atomic operation', async () => {
    // Given: Reservation being released
    // When: releaseCapacity is called
    // Then: Acquires lock before updating counters
  });

  test('TC-CAPS-RLC-003: should decrement pending_count', async () => {
    // Given: pending_count = 10, reservation quantity = 3
    // When: releaseCapacity is called
    // Then: pending_count updated to 7
  });

  test('TC-CAPS-RLC-004: should delete reservation record', async () => {
    // Given: Reservation in database
    // When: releaseCapacity is called
    // Then: Record deleted or status set to 'released'
  });

  test('TC-CAPS-RLC-005: should release price lock', async () => {
    // Given: Reservation with locked pricing
    // When: releaseCapacity is called
    // Then: locked_price_data cleared
  });

  test('TC-CAPS-RLC-006: should handle already expired reservations', async () => {
    // Given: Reservation past expiration
    // When: releaseCapacity is called
    // Then: Completes successfully (idempotent)
  });

  test('TC-CAPS-RLC-007: should throw error if reservation not found', async () => {
    // Given: Invalid reservation_id
    // When: releaseCapacity is called
    // Then: Throws NotFoundError
  });

  test('TC-CAPS-RLC-008: should enforce tenant isolation', async () => {
    // Given: Reservation in different tenant
    // When: releaseCapacity is called
    // Then: Throws NotFoundError
  });

  test('TC-CAPS-RLC-009: should update database capacity counters', async () => {
    // Given: Release happening
    // When: releaseCapacity completes
    // Then: Updates pending_count in event_capacity table
  });

  test('TC-CAPS-RLC-010: should handle concurrent releases gracefully', async () => {
    // Given: Multiple release attempts for same reservation
    // When: releaseCapacity is called
    // Then: Only first succeeds, others return gracefully
  });
});
```

---

### Function: `confirmCapacity(reservationId, tenantId)`

**Purpose:** Confirms purchase and converts reservation to sold  
**Priority:** P1 Critical  
**Test File:** `tests/unit/services/capacity.service.test.ts`

**Test Cases:**
```typescript
describe('confirmCapacity', () => {
  test('TC-CAPS-CC-001: should confirm capacity reservation', async () => {
    // Given: Active reservation
    // When: confirmCapacity is called
    // Then: Increments sold_count, decrements pending_count
    // And: Marks reservation as confirmed
  });

  test('TC-CAPS-CC-002: should use Redis lock for atomic operation', async () => {
    // Given: Reservation being confirmed
    // When: confirmCapacity is called
    // Then: Acquires distributed lock
  });

  test('TC-CAPS-CC-003: should increment sold_count', async () => {
    // Given: sold_count = 50, reservation quantity = 2
    // When: confirmCapacity is called
    // Then: sold_count updated to 52
  });

  test('TC-CAPS-CC-004: should decrement pending_count', async () => {
    // Given: pending_count = 10, reservation quantity = 2
    // When: confirmCapacity is called
    // Then: pending_count updated to 8
  });

  test('TC-CAPS-CC-005: should update available_capacity', async () => {
    // Given: Capacity counters
    // When: confirmCapacity is called
    // Then: available = total - sold - pending - reserved
  });

  test('TC-CAPS-CC-006: should mark reservation as confirmed', async () => {
    // Given: Reservation record
    // When: confirmCapacity is called
    // Then: status = 'confirmed', confirmed_at = now
  });

  test('TC-CAPS-CC-007: should throw error if reservation expired', async () => {
    // Given: Reservation past 10-minute expiration
    // When: confirmCapacity is called
    // Then: Throws ReservationExpiredError
  });

  test('TC-CAPS-CC-008: should throw error if reservation not found', async () => {
    // Given: Invalid reservation_id
    // When: confirmCapacity is called
    // Then: Throws NotFoundError
  });

  test('TC-CAPS-CC-009: should update database capacity counters', async () => {
    // Given: Confirmation happening
    // When: confirmCapacity completes
    // Then: Updates sold_count and pending_count in database
  });

  test('TC-CAPS-CC-010: should enforce tenant isolation', async () => {
    // Given: Reservation in different tenant
    // When: confirmCapacity is called
    // Then: Throws NotFoundError
  });
});
```

---

### Function: `lockPrice(eventId, scheduleId, pricingTierId, tenantId)`

**Purpose:** Locks pricing during checkout process  
**Priority:** P1 Critical  
**Test File:** `tests/unit/services/capacity.service.test.ts`

**Test Cases:**
```typescript
describe('lockPrice', () => {
  test('TC-CAPS-LP-001: should lock current price', async () => {
    // Given: Pricing tier with current price
    // When: lockPrice is called
    // Then: Stores locked price data in Redis
    // And: Returns locked price information
  });

  test('TC-CAPS-LP-002: should include all pricing details in lock', async () => {
    // Given: Pricing tier
    // When: lockPrice is called
    // Then: Stores pricing_id, base_price, current_price, fees
  });

  test('TC-CAPS-LP-003: should set lock expiration to match reservation', async () => {
    // Given: Price being locked
    // When: lockPrice is called
    // Then: Lock expires in 10 minutes
  });

  test('TC-CAPS-LP-004: should handle surge pricing correctly', async () => {
    // Given: Pricing with dynamic pricing enabled
    // When: lockPrice is called
    // Then: Locks current calculated price, not base price
  });

  test('TC-CAPS-LP-005: should handle early bird pricing', async () => {
    // Given: Early bird pricing active
    // When: lockPrice is called
    // Then: Locks early bird price
  });

  test('TC-CAPS-LP-006: should enforce tenant isolation', async () => {
    // Given: Pricing in different tenant
    // When: lockPrice is called
    // Then: Throws NotFoundError
  });

  test('TC-CAPS-LP-007: should validate pricing tier is active', async () => {
    // Given: Inactive pricing tier
    // When: lockPrice is called
    // Then: Throws ValidationError
  });

  test('TC-CAPS-LP-008: should validate pricing is available', async () => {
    // Given: Pricing tier sold out
    // When: lockPrice is called
    // Then: Throws InsufficientCapacityError
  });
});
```

---

### Function: `unlockPrice(lockId, tenantId)`

**Purpose:** Releases price lock  
**Priority:** P1 Critical  
**Test File:** `tests/unit/services/capacity.service.test.ts`

**Test Cases:**
```typescript
describe('unlockPrice', () => {
  test('TC-CAPS-UP-001: should release price lock', async () => {
    // Given: Active price lock
    // When: unlockPrice is called
    // Then: Deletes lock from Redis
  });

  test('TC-CAPS-UP-002: should be idempotent', async () => {
    // Given: Already released or expired lock
    // When: unlockPrice is called
    // Then: Completes successfully without error
  });

  test('TC-CAPS-UP-003: should clear locked_price_data from capacity record', async () => {
    // Given: Capacity record with locked pricing
    // When: unlockPrice is called
    // Then: locked_price_data field cleared
  });

  test('TC-CAPS-UP-004: should handle concurrent unlocks gracefully', async () => {
    // Given: Multiple unlock attempts
    // When: unlockPrice is called
    // Then: Only first succeeds, others no-op
  });

  test('TC-CAPS-UP-005: should enforce tenant isolation', async () => {
    // Given: Lock in different tenant
    // When: unlockPrice is called
    // Then: Throws NotFoundError
  });

  test('TC-CAPS-UP-006: should not throw error if lock doesn't exist', async () => {
    // Given: Non-existent lock_id
    // When: unlockPrice is called
    // Then: Returns successfully (lock already released)
  });
});
```

---

### Function: `checkAvailability(eventId, scheduleId, quantity, tenantId)`

**Purpose:** Atomic availability check  
**Priority:** P1 Critical  
**Test File:** `tests/unit/services/capacity.service.test.ts`

**Test Cases:**
```typescript
describe('checkAvailability', () => {
  test('TC-CAPS-CA-001: should return true if capacity available', async () => {
    // Given: available_capacity = 100, requested = 10
    // When: checkAvailability is called
    // Then: Returns { available: true, remaining: 90 }
  });

  test('TC-CAPS-CA-002: should return false if insufficient capacity', async () => {
    // Given: available_capacity = 5, requested = 10
    // When: checkAvailability is called
    // Then: Returns { available: false, remaining: 5 }
  });

  test('TC-CAPS-CA-003: should use Redis for real-time data', async () => {
    // Given: Capacity in Redis
    // When: checkAvailability is called
    // Then: Checks Redis, not database
  });

  test('TC-CAPS-CA-004: should be atomic operation', async () => {
    // Given: Concurrent availability checks
    // When: checkAvailability is called
    // Then: Returns consistent results using locks
  });

  test('TC-CAPS-CA-005: should enforce tenant isolation', async () => {
    // Given: Event/schedule in different tenant
    // When: checkAvailability is called
    // Then: Throws NotFoundError
  });

  test('TC-CAPS-CA-006: should handle missing capacity data', async () => {
    // Given: No capacity entry for schedule
    // When: checkAvailability is called
    // Then: Returns available: false
  });
});
```

---

### Function: `cleanupExpiredReservations()`

**Purpose:** Background job to release expired reservations  
**Priority:** P2  
**Test File:** `tests/unit/services/capacity.service.test.ts`

**Test Cases:**
```typescript
describe('cleanupExpiredReservations', () => {
  test('TC-CAPS-CER-001: should find expired reservations', async () => {
    // Given: Reservations with expires_at < now
    // When: cleanupExpiredReservations is called
    // Then: Finds all expired reservations
  });

  test('TC-CAPS-CER-002: should release expired reservations', async () => {
    // Given: Expired reservations found
    // When: cleanupExpiredReservations runs
    // Then: Calls releaseCapacity for each
  });

  test('TC-CAPS-CER-003: should update Redis counters', async () => {
    // Given: Expired reservations with quantity total = 10
    // When: cleanupExpiredReservations runs
    // Then: pending_count decremented by 10
  });

  test('TC-CAPS-CER-004: should delete reservation records', async () => {
    // Given: Expired reservations
    // When: cleanupExpiredReservations runs
    // Then: Records deleted from database
  });

  test('TC-CAPS-CER-005: should process in batches', async () => {
    // Given: 10,000 expired reservations
    // When: cleanupExpiredReservations runs
    // Then: Processes in batches of 100
  });

  test('TC-CAPS-CER-006: should handle errors gracefully', async () => {
    // Given: Some releases fail
    // When: cleanupExpiredReservations runs
    // Then: Continues processing remaining reservations
  });

  test('TC-CAPS-CER-007: should log cleanup metrics', async () => {
    // Given: Cleanup completed
    // When: cleanupExpiredReservations finishes
    // Then: Logs count of cleaned reservations
  });

  test('TC-CAPS-CER-008: should run across all tenants', async () => {
    // Given: Multiple tenants with expired reservations
    // When: cleanupExpiredReservations runs
    // Then: Processes reservations from all tenants
  });
});
```

---

## pricing.service.ts

**Location:** `src/services/pricing.service.ts`  
**Purpose:** Pricing logic including dynamic pricing calculations  
**Priority:** P1 Critical  
**Total Functions:** ~10

---

### Function: `createPricing(pricingData, tenantId)`

**Purpose:** Creates new pricing tier  
**Priority:** P1 Critical  
**Test File:** `tests/unit/services/pricing.service.test.ts`

**Test Cases:**
```typescript
describe('createPricing', () => {
  test('TC-PS-CP-001: should create pricing tier', async () => {
    // Given: Valid pricing data
    // When: createPricing is called
    // Then: Inserts into event_pricing table
  });

  test('TC-PS-CP-002: should validate event exists', async () => {
    // Given: Pricing data with event_id
    // When: createPricing is called
    // Then: Verifies event exists and belongs to tenant
  });

  test('TC-PS-CP-003: should set current_price to base_price initially', async () => {
    // Given: base_price_cents = 5000
    // When: createPricing is called
    // Then: current_price_cents = 5000
  });

  test('TC-PS-CP-004: should validate min <= max quantity constraints', async () => {
    // Given: min_qty_per_order > max_qty_per_order
    // When: createPricing is called
    // Then: Throws ValidationError
  });

  test('TC-PS-CP-005: should validate sales window dates', async () => {
    // Given: sales_start_at after sales_end_at
    // When: createPricing is called
    // Then: Throws ValidationError
  });

  test('TC-PS-CP-006: should link to schedule if provided', async () => {
    // Given: pricing_data.schedule_id present
    // When: createPricing is called
    // Then: Pricing linked to specific schedule
  });

  test('TC-PS-CP-007: should link to capacity if provided', async () => {
    // Given: pricing_data.capacity_id present
    // When: createPricing is called
    // Then: Pricing linked to capacity entry
  });

  test('TC-PS-CP-008: should set defaults for optional fields', async () => {
    // Given: Minimal pricing data
    // When: createPricing is called
    // Then: is_active = true, is_visible = true
  });

  test('TC-PS-CP-009: should enforce tenant isolation', async () => {
    // Given: Event in different tenant
    // When: createPricing is called
    // Then: Throws NotFoundError
  });

  test('TC-PS-CP-010: should invalidate event cache', async () => {
    // Given: Event cached
    // When: createPricing is called
    // Then: Event cache invalidated
  });
});
```

---

### Function: `getPricing(pricingId, tenantId)`

**Purpose:** Fetches pricing tier with current calculated price  
**Priority:** P1 Critical  
**Test File:** `tests/unit/services/pricing.service.test.ts`

**Test Cases:**
```typescript
describe('getPricing', () => {
  test('TC-PS-GP-001: should fetch pricing by ID', async () => {
    // Given: Valid pricing ID
    // When: getPricing is called
    // Then: Returns pricing tier object
  });

  test('TC-PS-GP-002: should calculate current price', async () => {
    // Given: Pricing with dynamic pricing rules
    // When: getPricing is called
    // Then: current_price_cents reflects current calculated price
  });

  test('TC-PS-GP-003: should apply early bird pricing if active', async () => {
    // Given: Current time < early_bird_ends_at
    // When: getPricing is called
    // Then: current_price_cents = early_bird_price_cents
  });

  test('TC-PS-GP-004: should apply last minute pricing if active', async () => {
    // Given: Current time > last_minute_starts_at
    // When: getPricing is called
    // Then: current_price_cents = last_minute_price_cents
  });

  test('TC-PS-GP-005: should calculate availability', async () => {
    // Given: total_qty = 100, sold_qty = 60
    // When: getPricing is called
    // Then: Returns available_qty = 40
  });

  test('TC-PS-GP-006: should indicate if currently available for sale', async () => {
    // Given: Pricing with sales window
    // When: getPricing is called
    // Then: Returns is_currently_available boolean
  });

  test('TC-PS-GP-007: should enforce tenant isolation', async () => {
    // Given: Pricing in different tenant
    // When: getPricing is called
    // Then: Throws NotFoundError
  });

  test('TC-PS-GP-008: should exclude soft-deleted pricing', async () => {
    // Given: Pricing with deleted_at timestamp
    // When: getPricing is called
    // Then: Throws NotFoundError
  });
});
```

---

### Function: `listPricing(filters, tenantId)`

**Purpose:** Queries pricing tiers with filtering  
**Priority:** P1 Critical  
**Test File:** `tests/unit/services/pricing.service.test.ts`

**Test Cases:**
```typescript
describe('listPricing', () => {
  test('TC-PS-LP-001: should list all pricing for event', async () => {
    // Given: filters.event_id = {uuid}
    // When: listPricing is called
    // Then: Returns all pricing tiers for event
  });

  test('TC-PS-LP-002: should filter by schedule', async () => {
    // Given: filters.schedule_id = {uuid}
    // When: listPricing is called
    // Then: Returns pricing for specific schedule
  });

  test('TC-PS-LP-003: should filter to active tiers', async () => {
    // Given: filters.active_only = true
    // When: listPricing is called
    // Then: Returns only is_active = true tiers
  });

  test('TC-PS-LP-004: should filter to visible tiers', async () => {
    // Given: filters.visible_only = true
    // When: listPricing is called
    // Then: Returns only is_visible = true tiers
  });

  test('TC-PS-LP-005: should order by display_order', async () => {
    // Given: Multiple tiers with different display_order
    // When: listPricing is called
    // Then: Ordered by display_order ascending
  });

  test('TC-PS-LP-006: should calculate current prices for all tiers', async () => {
    // Given: Tiers with dynamic pricing
    // When: listPricing is called
    // Then: Each tier has current_price_cents calculated
  });

  test('TC-PS-LP-007: should include availability for each tier', async () => {
    // Given: Tiers with capacity limits
    // When: listPricing is called
    // Then: Each tier includes available_qty
  });

  test('TC-PS-LP-008: should exclude soft-deleted tiers', async () => {
    // Given: Some tiers deleted
    // When: listPricing is called
    // Then: Deleted tiers not included
  });
});
```

---

### Function: `updatePricing(pricingId, updates, tenantId)`

**Purpose:** Updates pricing tier  
**Priority:** P1 Critical  
**Test File:** `tests/unit/services/pricing.service.test.ts`

**Test Cases:**
```typescript
describe('updatePricing', () => {
  test('TC-PS-UP-001: should update pricing fields', async () => {
    // Given: Valid updates
    // When: updatePricing is called
    // Then: Updates fields in database
  });

  test('TC-PS-UP-002: should prevent price changes if tickets sold', async () => {
    // Given: Pricing with sold_qty > 0, update to base_price_cents
    // When: updatePricing is called
    // Then: Throws BusinessRuleError
  });

  test('TC-PS-UP-003: should allow non-price updates with sales', async () => {
    // Given: Pricing with sales, update to tier_description
    // When: updatePricing is called
    // Then: Update allowed
  });

  test('TC-PS-UP-004: should allow current_price_cents updates for dynamic pricing', async () => {
    // Given: Update to current_price_cents only
    // When: updatePricing is called
    // Then: Update allowed (for surge pricing)
  });

  test('TC-PS-UP-005: should validate new quantity constraints', async () => {
    // Given: updates with min > max
    // When: updatePricing is called
    // Then: Throws ValidationError
  });

  test('TC-PS-UP-006: should invalidate caches', async () => {
    // Given: Event and pricing cached
    // When: updatePricing is called
    // Then: Both caches invalidated
  });

  test('TC-PS-UP-007: should enforce tenant isolation', async () => {
    // Given: Pricing in different tenant
    // When: updatePricing is called
    // Then: Throws NotFoundError
  });

  test('TC-PS-UP-008: should update updated_at timestamp', async () => {
    // Given: Pricing being updated
    // When: updatePricing is called
    // Then: updated_at = current timestamp
  });
});
```

---

### Function: `deletePricing(pricingId, tenantId)`

**Purpose:** Soft deletes pricing tier  
**Priority:** P2  
**Test File:** `tests/unit/services/pricing.service.test.ts`

**Test Cases:**
```typescript
describe('deletePricing', () => {
  test('TC-PS-DP-001: should soft delete pricing', async () => {
    // Given: Valid pricing ID with no sales
    // When: deletePricing is called
    // Then: Sets deleted_at timestamp
  });

  test('TC-PS-DP-002: should prevent deletion if tickets sold', async () => {
    // Given: Pricing with sold_qty > 0
    // When: deletePricing is called
    // Then: Throws BusinessRuleError
  });

  test('TC-PS-DP-003: should allow disabling instead', async () => {
    // Given: Pricing with sales, soft_disable flag
    // When: deletePricing is called
    // Then: Sets is_active = false instead of deleting
  });

  test('TC-PS-DP-004: should invalidate caches', async () => {
    // Given: Caches exist
    // When: deletePricing is called
    // Then: Pricing and event caches invalidated
  });

  test('TC-PS-DP-005: should enforce tenant isolation', async () => {
    // Given: Pricing in different tenant
    // When: deletePricing is called
    // Then: Throws NotFoundError
  });

  test('TC-PS-DP-006: should handle already deleted pricing gracefully', async () => {
    // Given: Pricing already soft deleted
    // When: deletePricing is called
    // Then: Returns successfully (idempotent)
  });
});
```

---

### Function: `calculatePrice(pricingId, context)`

**Purpose:** Calculates current price with dynamic pricing rules  
**Priority:** P1 Critical  
**Test File:** `tests/unit/services/pricing.service.test.ts`

**Test Cases:**
```typescript
describe('calculatePrice', () => {
  test('TC-PS-CAP-001: should return base price by default', async () => {
    // Given: Pricing with no dynamic rules
    // When: calculatePrice is called
    // Then: Returns base_price_cents
  });

  test('TC-PS-CAP-002: should apply early bird pricing', async () => {
    // Given: Current time < early_bird_ends_at
    // When: calculatePrice is called
    // Then: Returns early_bird_price_cents
  });

  test('TC-PS-CAP-003: should apply last minute pricing', async () => {
    // Given: Current time > last_minute_starts_at
    // When: calculatePrice is called
    // Then: Returns last_minute_price_cents
  });

  test('TC-PS-CAP-004: should apply surge pricing based on demand', async () => {
    // Given: Capacity 90% sold
    // When: calculatePrice is called
    // Then: Returns base_price * surge_multiplier
  });

  test('TC-PS-CAP-005: should apply group discount', async () => {
    // Given: context.quantity >= group_size_min
    // When: calculatePrice is called
    // Then: Returns base_price * (1 - group_discount_percentage)
  });

  test('TC-PS-CAP-006: should prioritize early bird over base', async () => {
    // Given: Early bird active
    // When: calculatePrice is called
    // Then: Returns early bird price, not base
  });

  test('TC-PS-CAP-007: should prioritize last minute over early bird', async () => {
    // Given: Both early bird and last minute conditions met
    // When: calculatePrice is called
    // Then: Returns last minute price
  });

  test('TC-PS-CAP-008: should round to nearest cent', async () => {
    // Given: Calculation results in fractional cents
    // When: calculatePrice is called
    // Then: Returns rounded integer cents
  });
});
```

---

### Function: `applyDynamicPricing(pricingId, rules)`

**Purpose:** Applies surge pricing based on demand  
**Priority:** P2  
**Test File:** `tests/unit/services/pricing.service.test.ts`

**Test Cases:**
```typescript
describe('applyDynamicPricing', () => {
  test('TC-PS-ADP-001: should calculate surge multiplier based on capacity', async () => {
    // Given: Capacity 95% sold, surge rules configured
    // When: applyDynamicPricing is called
    // Then: Calculates multiplier (e.g., 1.5x)
  });

  test('TC-PS-ADP-002: should update current_price_cents', async () => {
    // Given: Surge pricing calculated
    // When: applyDynamicPricing is called
    // Then: Updates current_price_cents in database
  });

  test('TC-PS-ADP-003: should respect max price cap', async () => {
    // Given: Calculated price exceeds max_price_cents
    // When: applyDynamicPricing is called
    // Then: Caps at max_price_cents
  });

  test('TC-PS-ADP-004: should respect min price floor', async () => {
    // Given: Calculated price below base_price_cents
    // When: applyDynamicPricing is called
    // Then: Uses base_price_cents as floor
  });

  test('TC-PS-ADP-005: should calculate based on time remaining', async () => {
    // Given: Event in 1 hour, high demand
    // When: applyDynamicPricing is called
    // Then: Applies higher multiplier for urgency
  });

  test('TC-PS-ADP-006: should log price changes for audit', async () => {
    // Given: Price updated by dynamic pricing
    // When: applyDynamicPricing completes
    // Then: Logs before/after prices
  });

  test('TC-PS-ADP-007: should invalidate pricing cache', async () => {
    // Given: Price updated
    // When: applyDynamicPricing completes
    // Then: Cache invalidated
  });

  test('TC-PS-ADP-008: should handle multiple pricing tiers', async () => {
    // Given: Event with 3 pricing tiers
    // When: applyDynamicPricing is called
    // Then: Updates all applicable tiers
  });
});
```

---

### Function: `applyDiscount(pricingId, discountCode, context)`

**Purpose:** Applies discount code to pricing  
**Priority:** P2  
**Test File:** `tests/unit/services/pricing.service.test.ts`

**Test Cases:**
```typescript
describe('applyDiscount', () => {
  test('TC-PS-AD-001: should apply percentage discount', async () => {
    // Given: Discount code with 20% off
    // When: applyDiscount is called
    // Then: Returns price * 0.80
  });

  test('TC-PS-AD-002: should apply fixed amount discount', async () => {
    // Given: Discount code with $10 off
    // When: applyDiscount is called
    // Then: Returns price - 1000 cents
  });

  test('TC-PS-AD-003: should validate discount code exists', async () => {
    // Given: Invalid discount code
    // When: applyDiscount is called
    // Then: Throws InvalidDiscountCodeError
  });

  test('TC-PS-AD-004: should validate discount is active', async () => {
    // Given: Expired discount code
    // When: applyDiscount is called
    // Then: Throws InvalidDiscountCodeError
  });

  test('TC-PS-AD-005: should validate minimum purchase amount', async () => {
    // Given: Discount requires $50 minimum, purchase is $30
    // When: applyDiscount is called
    // Then: Throws ValidationError
  });

  test('TC-PS-AD-006: should validate usage limits', async () => {
    // Given: Discount code already used max times
    // When: applyDiscount is called
    // Then: Throws ValidationError
  });

  test('TC-PS-AD-007: should not allow price below zero', async () => {
    // Given: Discount larger than price
    // When: applyDiscount is called
    // Then: Returns 0, not negative
  });

  test('TC-PS-AD-008: should track discount usage', async () => {
    // Given: Discount applied successfully
    // When: applyDiscount completes
    // Then: Increments usage counter
  });
});
```

---

### Function: `getActivePricing(eventId, scheduleId, tenantId)`

**Purpose:** Returns currently available pricing tiers  
**Priority:** P1 Critical  
**Test File:** `tests/unit/services/pricing.service.test.ts`

**Test Cases:**
```typescript
describe('getActivePricing', () => {
  test('TC-PS-GAP-001: should return active and visible pricing', async () => {
    // Given: Event with pricing tiers
    // When: getActivePricing is called
    // Then: Returns only is_active = true AND is_visible = true
  });

  test('TC-PS-GAP-002: should filter by sales window', async () => {
    // Given: Current time outside sales_start_at to sales_end_at
    // When: getActivePricing is called
    // Then: Tier not included in results
  });

  test('TC-PS-GAP-003: should exclude sold out tiers', async () => {
    // Given: Pricing tier with available_qty = 0
    // When: getActivePricing is called
    // Then: Tier not included
  });

  test('TC-PS-GAP-004: should calculate current prices', async () => {
    // Given: Active pricing with dynamic rules
    // When: getActivePricing is called
    // Then: Each tier has current_price_cents calculated
  });

  test('TC-PS-GAP-005: should order by display_order', async () => {
    // Given: Multiple active tiers
    // When: getActivePricing is called
    // Then: Ordered by display_order ascending
  });

  test('TC-PS-GAP-006: should work with event_id or schedule_id', async () => {
    // Given: Either parameter provided
    // When: getActivePricing is called
    // Then: Returns appropriate pricing
  });

  test('TC-PS-GAP-007: should enforce tenant isolation', async () => {
    // Given: Event/schedule in different tenant
    // When: getActivePricing is called
    // Then: Throws NotFoundError
  });

  test('TC-PS-GAP-008: should return empty array if no active pricing', async () => {
    // Given: All pricing inactive or outside sales window
    // When: getActivePricing is called
    // Then: Returns []
  });
});
```

---

## venue-service.client.ts

**Location:** `src/services/venue-service.client.ts`  
**Purpose:** HTTP client for inter-service communication with venue service  
**Priority:** P1 Critical  
**Total Functions:** ~6

---

### Function: `getVenue(venueId, tenantId)`

**Purpose:** Fetches venue details from venue service  
**Priority:** P1 Critical  
**Test File:** `tests/unit/services/venue-service.client.test.ts`

**Test Cases:**
```typescript
describe('getVenue', () => {
  test('TC-VSC-GV-001: should fetch venue from venue service', async () => {
    // Given: Valid venue ID and tenant ID
    // When: getVenue is called
    // Then: Makes HTTP GET request to venue service
    // And: Returns venue object
  });

  test('TC-VSC-GV-002: should include authentication headers', async () => {
    // Given: Service-to-service request
    // When: getVenue is called
    // Then: Includes HMAC auth header or service token
  });

  test('TC-VSC-GV-003: should pass tenant context', async () => {
    // Given: Tenant ID provided
    // When: getVenue is called
    // Then: Includes tenant_id in request
  });

  test('TC-VSC-GV-004: should cache venue data', async () => {
    // Given: Venue fetched from service
    // When: getVenue completes
    // Then: Caches result in Redis with 1 hour TTL
  });

  test('TC-VSC-GV-005: should return from cache if available', async () => {
    // Given: Venue cached
    // When: getVenue is called
    // Then: Returns cached data without HTTP request
  });

  test('TC-VSC-GV-006: should throw NotFoundError if venue doesn't exist', async () => {
    // Given: Venue service returns 404
    // When: getVenue is called
    // Then: Throws NotFoundError
  });

  test('TC-VSC-GV-007: should handle service unavailable', async () => {
    // Given: Venue service down or timing out
    // When: getVenue is called
    // Then: Throws ServiceUnavailableError with retry info
  });

  test('TC-VSC-GV-008: should use circuit breaker pattern', async () => {
    // Given: Multiple failed requests to venue service
    // When: getVenue is called
    // Then: Circuit breaker opens and fails fast
  });
});
```

---

### Function: `validateVenue(venueId, tenantId)`

**Purpose:** Validates venue exists and is active  
**Priority:** P1 Critical  
**Test File:** `tests/unit/services/venue-service.client.test.ts`

**Test Cases:**
```typescript
describe('validateVenue', () => {
  test('TC-VSC-VV-001: should validate venue exists', async () => {
    // Given: Valid venue ID
    // When: validateVenue is called
    // Then: Calls getVenue and returns true if exists
  });

  test('TC-VSC-VV-002: should validate venue belongs to tenant', async () => {
    // Given: Venue in different tenant
    // When: validateVenue is called
    // Then: Returns false or throws ForbiddenError
  });

  test('TC-VSC-VV-003: should validate venue is active', async () => {
    // Given: Venue with is_active = false
    // When: validateVenue is called
    // Then: Returns false
  });

  test('TC-VSC-VV-004: should validate venue not deleted', async () => {
    // Given: Soft-deleted venue
    // When: validateVenue is called
    // Then: Returns false
  });

  test('TC-VSC-VV-005: should return validation result object', async () => {
    // Given: Validation performed
    // When: validateVenue completes
    // Then: Returns { valid: boolean, reason?: string }
  });

  test('TC-VSC-VV-006: should handle service errors gracefully', async () => {
    // Given: Venue service unavailable
    // When: validateVenue is called
    // Then: Returns { valid: false, reason: "Service unavailable" }
  });

  test('TC-VSC-VV-007: should use cached venue data if available', async () => {
    // Given: Venue cached
    // When: validateVenue is called
    // Then: Uses cache, no HTTP request
  });

  test('TC-VSC-VV-008: should be idempotent', async () => {
    // Given: Multiple validation calls
    // When: validateVenue is called multiple times
    // Then: Returns same result each time
  });
});
```

---

### Function: `checkVenueAvailability(venueId, startTime, endTime, tenantId)`

**Purpose:** Checks if venue is available for time slot  
**Priority:** P1 Critical  
**Test File:** `tests/unit/services/venue-service.client.test.ts`

**Test Cases:**
```typescript
describe('checkVenueAvailability', () => {
  test('TC-VSC-CVA-001: should check venue availability', async () => {
    // Given: Venue ID and time range
    // When: checkVenueAvailability is called
    // Then: Makes request to venue service availability endpoint
  });

  test('TC-VSC-CVA-002: should return available if no conflicts', async () => {
    // Given: No events scheduled at venue for time range
    // When: checkVenueAvailability is called
    // Then: Returns { available: true }
  });

  test('TC-VSC-CVA-003: should return unavailable if conflict exists', async () => {
    // Given: Another event scheduled at same time
    // When: checkVenueAvailability is called
    // Then: Returns { available: false, conflicting_events: [...] }
  });

  test('TC-VSC-CVA-004: should include buffer time in check', async () => {
    // Given: Venue requires 1 hour buffer between events
    // When: checkVenueAvailability is called
    // Then: Checks availability including buffer
  });

  test('TC-VSC-CVA-005: should handle timezone correctly', async () => {
    // Given: Times in specific timezone
    // When: checkVenueAvailability is called
    // Then: Converts to UTC for comparison
  });

  test('TC-VSC-CVA-006: should enforce tenant isolation', async () => {
    // Given: Venue in different tenant
    // When: checkVenueAvailability is called
    // Then: Throws ForbiddenError
  });

  test('TC-VSC-CVA-007: should handle service errors', async () => {
    // Given: Venue service unavailable
    // When: checkVenueAvailability is called
    // Then: Throws ServiceUnavailableError
  });

  test('TC-VSC-CVA-008: should cache availability checks briefly', async () => {
    // Given: Availability checked
    // When: checkVenueAvailability completes
    // Then: Caches result for 5 minutes
  });
});
```

---

### Function: `checkVenueAccess(venueId, userId, tenantId)`

**Purpose:** Verifies user has access to venue  
**Priority:** P1 Critical  
**Test File:** `tests/unit/services/venue-service.client.test.ts`

**Test Cases:**
```typescript
describe('checkVenueAccess', () => {
  test('TC-VSC-CacVA-001: should verify user owns venue', async () => {
    // Given: User ID and venue ID
    // When: checkVenueAccess is called
    // Then: Makes request to venue service to check ownership
  });

  test('TC-VSC-CacVA-002: should allow access for venue owner', async () => {
    // Given: User is venue owner
    // When: checkVenueAccess is called
    // Then: Returns { has_access: true, role: 'owner' }
  });

  test('TC-VSC-CacVA-003: should allow access for venue staff', async () => {
    // Given: User is staff member at venue
    // When: checkVenueAccess is called
    // Then: Returns { has_access: true, role: 'staff' }
  });

  test('TC-VSC-CacVA-004: should deny access for non-owner/non-staff', async () => {
    // Given: User has no relationship to venue
    // When: checkVenueAccess is called
    // Then: Returns { has_access: false }
  });

  test('TC-VSC-CacVA-005: should enforce tenant isolation', async () => {
    // Given: Venue in different tenant
    // When: checkVenueAccess is called
    // Then: Returns { has_access: false }
  });

  test('TC-VSC-CacVA-006: should cache access checks', async () => {
    // Given: Access checked
    // When: checkVenueAccess completes
    // Then: Caches result for 10 minutes
  });

  test('TC-VSC-CacVA-007: should handle service errors', async () => {
    // Given: Venue service unavailable
    // When: checkVenueAccess is called
    // Then: Returns { has_access: false } for safety
  });

  test('TC-VSC-CacVA-008: should support role-based access levels', async () => {
    // Given: User with specific role
    // When: checkVenueAccess is called
    // Then: Returns access level details
  });
});
```

---

*Due to length, I'll continue with remaining service functions, middleware, models, and utils in a streamlined format...*

## Additional Services (Streamlined)

### reservation-cleanup.service.ts - `cleanupExpiredReservations()`
- Should find expired reservations (8 test cases)
- Should release capacity (6 test cases)
- Should update Redis and database (4 test cases)
- Should handle errors gracefully (3 test cases)

### cache-integration.ts - Multiple caching functions
- Cache get/set/delete operations (15 test cases)
- TTL management (5 test cases)
- Cache invalidation patterns (8 test cases)

### databaseService.ts - Database connection management
- Connection pooling (6 test cases)
- Query execution (8 test cases)
- Transaction management (10 test cases)

### redisService.ts - Redis operations
- Basic operations (get, set, delete) (12 test cases)
- Lock acquisition/release (8 test cases)
- Pub/sub operations (6 test cases)

---

# MIDDLEWARE

## auth.ts & authenticate.ts

**Purpose:** Authentication middleware  
**Total Test Cases:** ~18
```typescript
describe('authenticate', () => {
  // TC-MW-AUTH-001 through TC-MW-AUTH-010
  // JWT validation, API key validation, token extraction, error handling
});
```

## tenant.ts

**Purpose:** Tenant context middleware  
**Total Test Cases:** ~16
```typescript
describe('enforceTenantContext', () => {
  // TC-MW-TEN-001 through TC-MW-TEN-008
  // Tenant extraction, validation, isolation enforcement
});
```

## error-handler.ts

**Purpose:** Global error handler  
**Total Test Cases:** ~8
```typescript
describe('errorHandler', () => {
  // TC-MW-ERR-001 through TC-MW-ERR-008
  // Error formatting, status codes, logging, security
});
```

---

# MODELS

All models follow standard CRUD patterns with tenant isolation:

## event.model.ts (~8 test cases per method)
- create(), findById(), findAll(), update(), delete()
- findBySlug(), search()
- Tenant isolation, soft deletes

## event-schedule.model.ts (~6 test cases per method)
- Standard CRUD operations
- findByEvent(), findByDateRange()

## event-capacity.model.ts (~6 test cases per method)
- CRUD operations
- Real-time counter updates
- Redis synchronization

## event-pricing.model.ts (~8 test cases per method)
- CRUD operations
- Price calculations
- Availability checks

## event-category.model.ts (~5 test cases per method)
- CRUD operations
- Slug-based lookups

## event-metadata.model.ts (~4 test cases per method)
- CRUD operations
- JSONB field handling

## base.model.ts (~10 test cases)
- Abstract base class methods
- Transaction support
- Common query patterns

---

# UTILS

## audit-logger.ts (~14 test cases)
- logAudit() - Audit log creation
- getAuditContext() - Context extraction
- formatAuditLog() - Log formatting

## error-response.ts (~6 test cases)
- Error formatting
- Status code mapping
- Response structure

## errors.ts (~8 test cases)
- Custom error classes
- Error inheritance
- Error serialization

## logger.ts (~6 test cases)
- Log levels
- Structured logging
- Log formatting

## metrics.ts (~6 test cases)
- Metric recording
- Counter increments
- Histogram observations

---

# VALIDATIONS

## event-security.ts (~10 test cases)
- Input sanitization
- SQL injection prevention
- XSS prevention
- Rate limiting validation

---

## 📊 SUMMARY

**Total Test Cases: ~530**

**By Priority:**
- P1 Critical: ~350 test cases
- P2 Important: ~130 test cases
- P3 Nice to Have: ~50 test cases

**By Category:**
- Controllers: ~175 test cases
- Services: ~225 test cases
- Middleware: ~30 test cases
- Models: ~70 test cases
- Utils: ~30 test cases

**Test Coverage Goals:**
- 100% function coverage
- All happy paths tested
- All error cases tested
- Security boundaries tested
- Performance scenarios tested
- Race conditions tested

---

**CONVENTIONS:**
- Test IDs: `TC-{MODULE}-{FUNCTION}-{NUMBER}`
- Given/When/Then format for all tests
- Independent, repeatable tests
- Mock external dependencies
- Use test fixtures from `tests/fixtures/`

---

**END OF TEST SPECIFICATIONS**