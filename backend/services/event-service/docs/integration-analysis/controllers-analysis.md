# Event Service Controllers Analysis
## Purpose: Integration Testing Documentation
## Source Files Analyzed:
- `src/controllers/cancellation.controller.ts` (65 lines)
- `src/controllers/capacity.controller.ts` (145 lines)
- `src/controllers/customer-analytics.controller.ts` (55 lines)
- `src/controllers/event-content.controller.ts` (165 lines)
- `src/controllers/event-reviews.controller.ts` (250 lines)
- `src/controllers/events.controller.ts` (130 lines)
- `src/controllers/notification.controller.ts` (35 lines)
- `src/controllers/pricing.controller.ts` (115 lines)
- `src/controllers/report-analytics.controller.ts` (95 lines)
- `src/controllers/schedule.controller.ts` (175 lines)
- `src/controllers/tickets.controller.ts` (175 lines)
- `src/controllers/venue-analytics.controller.ts` (95 lines)

## Generated: January 20, 2026

---

## FILE-BY-FILE ANALYSIS

### 1. cancellation.controller.ts (65 lines)

**Purpose:** Handle event cancellation requests with permission validation and refund triggering.

#### DATABASE OPERATIONS
N/A - Delegates to CancellationService

#### EXTERNAL SERVICE CALLS
- `CancellationService.validateCancellationPermission()`
- `CancellationService.cancelEvent()`

#### CACHING
N/A

#### STATE MANAGEMENT
- Sets event status to CANCELLED via service

#### TENANT ISOLATION

**Status:** ✅ ENFORCED
```typescript
const { userId, tenantId } = (request as any).auth;
// Passed to service
await cancellationService.cancelEvent({ ... }, tenantId);
```

#### BUSINESS LOGIC

**Input Validation:**
- `cancellation_reason` required (non-empty string)
- `trigger_refunds` defaults to `true`

**Permission Check:**
- Calls `validateCancellationPermission(eventId, userId, tenantId)`
- Returns 403 if not permitted

**Response Codes:**
| Condition | Status |
|-----------|--------|
| Success | 200 |
| Missing reason | 400 |
| No permission | 403 |
| Event not found | 404 |
| Deadline passed | 400 |
| Already cancelled | 409 |
| Other errors | 500 |

#### ERROR HANDLING

**Pattern:** Try-catch with message-based status mapping
```typescript
const statusCode = error.message.includes('not found') ? 404 :
                  error.message.includes('deadline') ? 400 :
                  error.message.includes('already cancelled') ? 409 : 500;
```

⚠️ **HIGH:** String matching for error codes is fragile

#### CONCURRENCY
N/A - Handled by service layer

#### POTENTIAL ISSUES

⚠️ **HIGH:**
1. Error status mapping via string matching is fragile
   - Should use custom error classes with status codes

🟡 **MEDIUM:**
1. Creates new `CancellationService` instance per request
   - Should use DI container

---

### 2. capacity.controller.ts (145 lines)

**Purpose:** Event capacity management - query, reserve, and update capacity sections.

#### DATABASE OPERATIONS
N/A - Delegates to CapacityService

#### EXTERNAL SERVICE CALLS
- `CapacityService.getEventCapacity()`
- `CapacityService.getCapacityById()`
- `CapacityService.createCapacity()`
- `CapacityService.updateCapacity()`
- `CapacityService.checkAvailability()`
- `CapacityService.reserveCapacity()`
- `CapacityService.getLockedPrice()`

#### CACHING
N/A

#### STATE MANAGEMENT
- Manages capacity reservation states
- Handles price locking during reservation

#### TENANT ISOLATION

**Status:** ✅ ENFORCED
```typescript
const tenantId = (request as any).tenantId;
// Passed to all service calls
await capacityService.getEventCapacity(eventId, tenantId);
```

#### BUSINESS LOGIC

**Endpoints:**
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/events/:eventId/capacity` | Get all capacity sections |
| GET | `/events/:eventId/capacity/total` | Get aggregated totals |
| GET | `/capacity/:id` | Get single capacity by ID |
| POST | `/events/:eventId/capacity` | Create capacity section |
| PUT | `/capacity/:id` | Update capacity |
| POST | `/capacity/:id/check` | Check availability |
| POST | `/capacity/:id/reserve` | Reserve capacity with price lock |

**Input Validation:**
- `quantity` must be >= 1 for check/reserve
- Uses `createProblemError()` for RFC 7807 errors

**Reserve Response:**
```typescript
{
  message: 'Capacity reserved successfully',
  capacity,
  locked_price: lockedPrice  // If pricing_id provided
}
```

#### ERROR HANDLING

**Pattern:** Uses `createProblemError()` for consistent RFC 7807 format
```typescript
throw createProblemError(404, 'NOT_FOUND', 'Capacity not found');
throw createProblemError(400, 'INVALID_QUANTITY', 'Quantity must be at least 1');
```

✅ **GOOD:** Consistent error format

#### CONCURRENCY
- Reservation handled atomically by service (row locking)

#### POTENTIAL ISSUES

🟡 **MEDIUM:**
1. `getTotalCapacity` does aggregation in controller
   - Could be moved to service layer
2. Creates new `CapacityService` per request (not using DI)

🟢 **LOW:**
- Good error handling pattern
- Tenant isolation enforced

---

### 3. customer-analytics.controller.ts (55 lines)

**Purpose:** Customer profile and purchase history analytics.

#### DATABASE OPERATIONS

**Direct DB Queries:**
```typescript
await db('event_pricing')
  .join('events', 'event_pricing.event_id', 'events.id')
  .select(...)
  .where('event_pricing.is_active', true)
  .limit(10);
```

#### EXTERNAL SERVICE CALLS
- Uses `EventScheduleModel` for schedule enrichment

#### CACHING
N/A

#### STATE MANAGEMENT
N/A

#### TENANT ISOLATION

**Status:** ❌ NOT ENFORCED
```typescript
// No tenant filter in query!
const purchases = await db('event_pricing')
  .join('events', 'event_pricing.event_id', 'events.id')
  .select(...)
  // Missing: .where('events.tenant_id', tenantId)
```

🔴 **CRITICAL:** Query returns data from ALL tenants

#### BUSINESS LOGIC

**Note in Response:**
```typescript
note: 'This is mock data - real purchase history comes from ticket-service'
```

This is placeholder/mock implementation.

#### ERROR HANDLING

**Pattern:** Try-catch with generic 500
```typescript
return reply.status(500).send({
  success: false,
  error: 'Failed to get customer profile'
});
```

#### CONCURRENCY
N/A

#### POTENTIAL ISSUES

🔴 **CRITICAL:**
1. **NO TENANT ISOLATION** - Returns all tenants' data
2. Mock implementation - should call ticket-service

⚠️ **HIGH:**
1. Direct DB query in controller (should be in service)
2. customerId parameter not validated or used in query

🟡 **MEDIUM:**
1. Hardcoded limit of 10
2. No pagination support

---

### 4. event-content.controller.ts (165 lines)

**Purpose:** Manage event content (gallery, lineup, schedule, performers) via MongoDB.

#### DATABASE OPERATIONS
N/A - Delegates to EventContentService (MongoDB)

#### EXTERNAL SERVICE CALLS
- `EventContentService` - All CRUD operations
- `getGallery()`, `getLineup()`, `getSchedule()`, `getPerformers()`

#### CACHING
N/A

#### STATE MANAGEMENT
- Content status: draft → published → archived

#### TENANT ISOLATION

**Status:** ✅ ENFORCED
```typescript
const tenantId = (req as any).tenantId;
// Passed to all service calls
await this.contentService.createContent({ eventId, tenantId, ... });
await this.contentService.getEventContent(eventId, tenantId, ...);
```

#### BUSINESS LOGIC

**Endpoints:**
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/events/:eventId/content` | Create content |
| GET | `/events/:eventId/content` | Get event content (filter by type/status) |
| GET | `/content/:contentId` | Get single content |
| PUT | `/content/:contentId` | Update content |
| DELETE | `/content/:contentId` | Delete content |
| POST | `/content/:contentId/publish` | Publish content |
| POST | `/content/:contentId/archive` | Archive content |
| GET | `/events/:eventId/gallery` | Get gallery |
| GET | `/events/:eventId/lineup` | Get lineup |
| GET | `/events/:eventId/schedule` | Get schedule |
| GET | `/events/:eventId/performers` | Get performers |

**User Tracking:**
```typescript
const userId = (req as any).user?.id || 'system';
```
- Falls back to 'system' if no user - could be audit issue

#### ERROR HANDLING

**Pattern:** Try-catch with 500 for all errors
```typescript
return reply.status(500).send({ success: false, error: error.message });
```

⚠️ **HIGH:** All errors return 500, even validation errors

#### CONCURRENCY
N/A - Service layer handles

#### POTENTIAL ISSUES

⚠️ **HIGH:**
1. All errors return 500 - should differentiate 400/404/500
2. `userId` falls back to 'system' - audit trail issue

🟡 **MEDIUM:**
1. No input validation in controller (relies on service)
2. Class-based controller pattern inconsistent with other controllers

---

### 5. event-reviews.controller.ts (250 lines)

**Purpose:** Event reviews and ratings using shared ReviewService and RatingService.

#### DATABASE OPERATIONS
N/A - Uses shared services (Redis-backed)

#### EXTERNAL SERVICE CALLS
- `ReviewService` from `@tickettoken/shared`
- `RatingService` from `@tickettoken/shared`

#### CACHING
- Services use Redis internally

#### STATE MANAGEMENT
N/A

#### TENANT ISOLATION

**Status:** ❌ NOT ENFORCED
```typescript
// No tenantId passed to shared services!
await this.reviewService.createReview(userId, 'event', eventId, { ... });
await this.ratingService.submitRating(userId, 'event', eventId, { ... });
```

🔴 **CRITICAL:** Shared services don't receive tenant context

#### BUSINESS LOGIC

**Review Endpoints:**
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/events/:eventId/reviews` | Create review |
| GET | `/events/:eventId/reviews` | List reviews (paginated) |
| GET | `/events/:eventId/reviews/:reviewId` | Get single review |
| PUT | `/events/:eventId/reviews/:reviewId` | Update review |
| DELETE | `/events/:eventId/reviews/:reviewId` | Delete review |
| POST | `/reviews/:reviewId/helpful` | Mark helpful |
| POST | `/reviews/:reviewId/report` | Report review |

**Rating Endpoints:**
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/events/:eventId/ratings` | Submit rating |
| GET | `/events/:eventId/ratings/summary` | Get summary |
| GET | `/events/:eventId/ratings/me` | Get user's rating |

**Auth Checks:**
```typescript
if (!userId) {
  return reply.status(401).send({ success: false, error: 'Unauthorized' });
}
```

#### ERROR HANDLING

**Pattern:** Try-catch with 500 for all errors
```typescript
return reply.status(500).send({
  success: false,
  error: error.message || 'Failed to create review',
});
```

#### CONCURRENCY
N/A - Handled by shared services

#### POTENTIAL ISSUES

🔴 **CRITICAL:**
1. **NO TENANT ISOLATION** - Shared services don't receive tenantId
   - Reviews could leak across tenants
   - User from tenant A could review tenant B's event

⚠️ **HIGH:**
1. All errors return 500
2. `eventId` not validated against tenant before operations

🟡 **MEDIUM:**
1. Pagination params parsed but not validated for bounds
2. Class-based controller inconsistent with others

---

### 6. events.controller.ts (130 lines)

**Purpose:** Core event CRUD operations.

#### DATABASE OPERATIONS
N/A - Delegates to EventService

#### EXTERNAL SERVICE CALLS
- `EventService.createEvent()`
- `EventService.getEvent()`
- `EventService.listEvents()`
- `EventService.updateEvent()`
- `EventService.deleteEvent()`
- `EventService.publishEvent()`
- `EventService.getVenueEvents()`

#### CACHING
N/A - Service layer handles

#### STATE MANAGEMENT
- Event status transitions via service

#### TENANT ISOLATION

**Status:** ✅ ENFORCED
```typescript
const tenantId = (request as any).tenantId;
// Passed to all service calls
await eventService.createEvent(eventData, authToken, userId, tenantId, { ... });
```

#### BUSINESS LOGIC

**Endpoints:**
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/events` | Create event |
| GET | `/events/:id` | Get event |
| GET | `/events` | List events (with filters) |
| PUT | `/events/:id` | Update event |
| DELETE | `/events/:id` | Delete event |
| POST | `/events/:id/publish` | Publish event |
| GET | `/venues/:venueId/events` | Get venue's events |

**Auth Validation:**
```typescript
if (!userId) {
  throw createProblemError(401, 'UNAUTHORIZED', 'Authentication required');
}
if (!tenantId) {
  throw createProblemError(400, 'TENANT_REQUIRED', 'Tenant ID required');
}
```

**Audit Context Passed:**
```typescript
{
  ip: request.ip,
  userAgent: request.headers['user-agent']
}
```

#### ERROR HANDLING

**Pattern:** Uses `createProblemError()` for RFC 7807
```typescript
throw createProblemError(404, 'NOT_FOUND', 'Event not found');
```

✅ **GOOD:** Consistent error format

#### CONCURRENCY
N/A - Service layer handles

#### POTENTIAL ISSUES

🟢 **LOW:**
- Well-structured controller
- Proper tenant isolation
- Good error handling
- Audit context passed

---

### 7. notification.controller.ts (35 lines)

**Purpose:** Placeholder endpoints - redirects to notification-service.

#### DATABASE OPERATIONS
N/A

#### EXTERNAL SERVICE CALLS
N/A - All endpoints return 501

#### CACHING
N/A

#### STATE MANAGEMENT
N/A

#### TENANT ISOLATION
N/A - Placeholder only

#### BUSINESS LOGIC

**All Endpoints Return 501:**
```typescript
return reply.status(501).send({
  success: false,
  error: 'Notification creation should be handled by notification-service',
  message: 'This endpoint is a placeholder...'
});
```

#### ERROR HANDLING
N/A - Always returns 501

#### CONCURRENCY
N/A

#### POTENTIAL ISSUES

🟡 **MEDIUM:**
1. Placeholder endpoints exist - should be removed or redirect properly
2. Returns 501 but routes still defined - confusing API

---

### 8. pricing.controller.ts (115 lines)

**Purpose:** Event pricing tier management.

#### DATABASE OPERATIONS
N/A - Delegates to PricingService

#### EXTERNAL SERVICE CALLS
- `PricingService.getEventPricing()`
- `PricingService.getPricingById()`
- `PricingService.createPricing()`
- `PricingService.updatePricing()`
- `PricingService.calculatePrice()`
- `PricingService.getActivePricing()`

#### CACHING
N/A

#### STATE MANAGEMENT
N/A

#### TENANT ISOLATION

**Status:** ✅ ENFORCED
```typescript
const tenantId = (request as any).tenantId;
// Passed to all service calls
await pricingService.getEventPricing(eventId, tenantId);
```

#### BUSINESS LOGIC

**Endpoints:**
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/events/:eventId/pricing` | Get all pricing |
| GET | `/pricing/:id` | Get single pricing |
| POST | `/events/:eventId/pricing` | Create pricing |
| PUT | `/pricing/:id` | Update pricing |
| POST | `/pricing/:id/calculate` | Calculate total price |
| GET | `/events/:eventId/pricing/active` | Get active pricing |

**Input Validation:**
```typescript
if (!quantity || quantity < 1) {
  throw createProblemError(400, 'INVALID_QUANTITY', 'Quantity must be at least 1');
}
```

#### ERROR HANDLING

**Pattern:** Uses `createProblemError()` for RFC 7807
```typescript
throw createProblemError(404, 'NOT_FOUND', 'Pricing not found');
```

✅ **GOOD:** Consistent error format

#### CONCURRENCY
N/A

#### POTENTIAL ISSUES

🟡 **MEDIUM:**
1. Creates new `PricingService` per request (not using DI container)

🟢 **LOW:**
- Good error handling
- Proper tenant isolation

---

### 9. report-analytics.controller.ts (95 lines)

**Purpose:** Analytics reports - sales, venue comparison, customer insights.

#### DATABASE OPERATIONS

**Direct DB Queries (Complex Joins):**
```typescript
// Sales report
await db('event_capacity')
  .join('events', 'event_capacity.event_id', 'events.id')
  .join('event_pricing', 'event_capacity.id', 'event_pricing.capacity_id')
  .select(...)
  .groupBy('events.id', 'events.name');

// Venue comparison
await db('events')
  .leftJoin('event_capacity', 'events.id', 'event_capacity.event_id')
  .select(...)
  .groupBy('events.venue_id');

// Customer insights
await db('events')
  .join('event_categories', 'events.primary_category_id', 'event_categories.id')
  .leftJoin('event_capacity', 'events.id', 'event_capacity.event_id')
  .leftJoin('event_pricing', 'event_capacity.id', 'event_pricing.capacity_id')
  .select(...)
  .groupBy('event_categories.id', 'event_categories.name');
```

#### EXTERNAL SERVICE CALLS
N/A

#### CACHING
N/A - Should cache expensive reports

#### STATE MANAGEMENT
N/A

#### TENANT ISOLATION

**Status:** ❌ NOT ENFORCED
```typescript
// NO tenant filter in ANY query!
const sales = await db('event_capacity')
  .join('events', 'event_capacity.event_id', 'events.id')
  // Missing: .where('events.tenant_id', tenantId)
```

🔴 **CRITICAL:** All reports aggregate data from ALL tenants

#### BUSINESS LOGIC

**Endpoints:**
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/reports/sales` | Sales report |
| GET | `/reports/venue-comparison` | Venue comparison |
| GET | `/reports/customer-insights` | Customer insights by category |

#### ERROR HANDLING

**Pattern:** Try-catch with generic 500
```typescript
return reply.status(500).send({
  success: false,
  error: 'Failed to generate sales report'
});
```

#### CONCURRENCY
N/A

#### POTENTIAL ISSUES

🔴 **CRITICAL:**
1. **NO TENANT ISOLATION** - Reports aggregate ALL tenants' data
   - Sales figures include other tenants
   - Major security and data isolation breach

⚠️ **HIGH:**
1. Direct DB queries in controller (should be in service)
2. Complex joins without indexes could be slow
3. No caching for expensive aggregations

🟡 **MEDIUM:**
1. No date range filtering
2. No pagination for large datasets

---

### 10. schedule.controller.ts (175 lines)

**Purpose:** Event schedule management with tenant-scoped operations.

#### DATABASE OPERATIONS
N/A - Uses EventScheduleModel

#### EXTERNAL SERVICE CALLS
- `EventService.getEvent()` - Validate event access
- `EventScheduleModel` - CRUD operations

#### CACHING
N/A

#### STATE MANAGEMENT
- Schedule status: SCHEDULED, CONFIRMED, IN_PROGRESS, COMPLETED, CANCELLED, POSTPONED, RESCHEDULED

#### TENANT ISOLATION

**Status:** ✅ ENFORCED
```typescript
const tenantId = (request as any).tenantId;
// Event access verified
await eventService.getEvent(eventId, tenantId);
// Schedule operations use tenant
await scheduleModel.findByEventId(eventId, tenantId);
// Double-check on single schedule
if (!schedule || schedule.event_id !== eventId || schedule.tenant_id !== tenantId) {
  return reply.status(404).send({ ... });
}
```

#### BUSINESS LOGIC

**Endpoints:**
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/events/:eventId/schedules` | List schedules |
| POST | `/events/:eventId/schedules` | Create schedule |
| GET | `/events/:eventId/schedules/:scheduleId` | Get single |
| PUT | `/events/:eventId/schedules/:scheduleId` | Update |
| GET | `/events/:eventId/schedules/upcoming` | Get upcoming |
| GET | `/events/:eventId/schedules/next` | Get next |

**Input Validation (Joi):**
```typescript
const createScheduleSchema = Joi.object({
  starts_at: Joi.date().required(),
  ends_at: Joi.date().required(),
  timezone: Joi.string().required(),
  // ... more fields
});
```

**Validation Error Response:**
```typescript
return reply.status(422).send({
  success: false,
  error: 'Validation failed',
  code: 'VALIDATION_ERROR',
  details: error.details
});
```

#### ERROR HANDLING

**Pattern:** Mixed - Joi validation + throw for other errors
- 404 for event/schedule not found
- 422 for validation errors
- Re-throws other errors

#### CONCURRENCY
N/A

#### POTENTIAL ISSUES

🟢 **LOW:**
- Good tenant isolation with double-check
- Proper Joi validation
- Event access verified before schedule operations

---

### 11. tickets.controller.ts (175 lines)

**Purpose:** Ticket type management (pricing tiers as ticket types).

#### DATABASE OPERATIONS
- Uses `EventPricingModel` for direct queries

#### EXTERNAL SERVICE CALLS
- `EventService.getEvent()` - Validate access
- `PricingService` - CRUD operations

#### CACHING
N/A

#### STATE MANAGEMENT
N/A

#### TENANT ISOLATION

**Status:** ✅ ENFORCED
```typescript
const tenantId = (request as any).tenantId;
// Event access verified
await eventService.getEvent(id, tenantId);
// Pricing checked against tenant
if (!pricing || pricing.event_id !== id || pricing.tenant_id !== tenantId) {
  return reply.status(404).send({ ... });
}
```

#### BUSINESS LOGIC

**Endpoints:**
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/events/:id/tickets` | List ticket types |
| POST | `/events/:id/tickets` | Create ticket type |
| GET | `/events/:id/tickets/:typeId` | Get single |
| PUT | `/events/:id/tickets/:typeId` | Update |

**Input Validation (Joi):**
```typescript
const createTicketTypeSchema = Joi.object({
  name: Joi.string().min(3).max(255).required(),
  base_price: Joi.number().min(0).required(),
  currency: Joi.string().length(3).default('USD'),
  tax_rate: Joi.number().min(0).max(1).optional(),
  // ... more fields
});
```

**Note in Code:**
```typescript
// Note: In production, you'd want to check if tickets have been sold
// via the ticket service before allowing certain updates
```

#### ERROR HANDLING

**Pattern:** Mixed - Joi validation + manual checks
- 422 for validation errors
- 404 for not found

#### CONCURRENCY
N/A

#### POTENTIAL ISSUES

🟡 **MEDIUM:**
1. Note mentions checking sold tickets - not implemented
2. Direct model usage alongside service usage (inconsistent)

🟢 **LOW:**
- Good tenant isolation
- Proper validation

---

### 12. venue-analytics.controller.ts (95 lines)

**Purpose:** Venue-specific analytics dashboard.

#### DATABASE OPERATIONS

**Direct DB Queries:**
```typescript
// Dashboard
await db('events')
  .where({ venue_id: venueId })
  .whereNull('deleted_at')
  .select('*');

await db('event_capacity')
  .join('events', 'event_capacity.event_id', 'events.id')
  .where('events.venue_id', venueId)
  .select(...)
  .first();

// Analytics
await db('events')
  .leftJoin('event_capacity', 'events.id', 'event_capacity.event_id')
  .leftJoin('event_pricing', 'event_capacity.id', 'event_pricing.capacity_id')
  .where('events.venue_id', venueId)
  .select(...)
  .first();
```

#### EXTERNAL SERVICE CALLS
N/A

#### CACHING
N/A

#### STATE MANAGEMENT
N/A

#### TENANT ISOLATION

**Status:** ❌ NOT ENFORCED
```typescript
// NO tenant filter!
const events = await db('events')
  .where({ venue_id: venueId })
  // Missing: .where('tenant_id', tenantId)
```

🔴 **CRITICAL:** Returns data for any venue regardless of tenant

#### BUSINESS LOGIC

**Endpoints:**
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/venues/:venueId/dashboard` | Venue dashboard |
| GET | `/venues/:venueId/analytics` | Venue analytics |

#### ERROR HANDLING

**Pattern:** Try-catch with generic 500
```typescript
return reply.status(500).send({
  success: false,
  error: 'Failed to get venue dashboard'
});
```

#### CONCURRENCY
N/A

#### POTENTIAL ISSUES

🔴 **CRITICAL:**
1. **NO TENANT ISOLATION** - Any venue accessible
   - Could view competitor's venue stats
   - Major security breach

⚠️ **HIGH:**
1. Direct DB queries in controller
2. No validation that user has access to venue
3. `parseInt` on potentially null values

🟡 **MEDIUM:**
1. Hardcoded 'Venue Dashboard' name in response
2. No date range filtering

---

## CROSS-SERVICE DEPENDENCIES

### Controller → Service Mapping

```
┌─────────────────────────────────────────────────────────────┐
│                      Controllers                             │
└─────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ Via DI Container │  │ Direct Instance │  │ Direct DB Query │
│                  │  │                  │  │                  │
│ • events.ctrl    │  │ • capacity.ctrl  │  │ • customer-ana  │
│ • schedule.ctrl  │  │ • pricing.ctrl   │  │ • report-ana    │
│ • tickets.ctrl   │  │ • cancellation   │  │ • venue-ana     │
│                  │  │ • event-content  │  │                  │
└─────────────────┘  └─────────────────┘  └─────────────────┘
       ✅                   🟡                    🔴
```

### Tenant Isolation Summary

| Controller | Tenant Enforced | Method |
|------------|-----------------|--------|
| cancellation.controller | ✅ Yes | Passed to service |
| capacity.controller | ✅ Yes | Passed to service |
| customer-analytics.controller | ❌ **NO** | Missing in query |
| event-content.controller | ✅ Yes | Passed to service |
| event-reviews.controller | ❌ **NO** | Not passed to shared service |
| events.controller | ✅ Yes | Passed to service |
| notification.controller | N/A | Placeholder |
| pricing.controller | ✅ Yes | Passed to service |
| report-analytics.controller | ❌ **NO** | Missing in queries |
| schedule.controller | ✅ Yes | Double-checked |
| tickets.controller | ✅ Yes | Double-checked |
| venue-analytics.controller | ❌ **NO** | Missing in queries |

---

## INTEGRATION TEST FILE MAPPING

### Test Coverage Recommendations

| Controller | Test File (Proposed) | Priority | Key Scenarios |
|------------|---------------------|----------|---------------|
| `customer-analytics.controller.ts` | `customer-analytics-tenant.integration.test.ts` | 🔴 CRITICAL | Tenant isolation breach |
| `event-reviews.controller.ts` | `reviews-tenant-isolation.integration.test.ts` | 🔴 CRITICAL | Cross-tenant review access |
| `report-analytics.controller.ts` | `reports-tenant-isolation.integration.test.ts` | 🔴 CRITICAL | Cross-tenant data aggregation |
| `venue-analytics.controller.ts` | `venue-analytics-tenant.integration.test.ts` | 🔴 CRITICAL | Cross-tenant venue access |
| `events.controller.ts` | `events-crud.integration.test.ts` | ⚠️ HIGH | Full CRUD flow, auth, tenant |
| `capacity.controller.ts` | `capacity-reservation.integration.test.ts` | ⚠️ HIGH | Reserve flow, price locking |
| `cancellation.controller.ts` | `cancellation-workflow.integration.test.ts` | ⚠️ HIGH | Permission, deadline, refund |
| `schedule.controller.ts` | `schedule-crud.integration.test.ts` | 🟡 MEDIUM | CRUD, validation, tenant |
| `tickets.controller.ts` | `tickets-crud.integration.test.ts` | 🟡 MEDIUM | CRUD, validation |
| `pricing.controller.ts` | `pricing-crud.integration.test.ts` | 🟡 MEDIUM | CRUD, calculations |
| `event-content.controller.ts` | `content-crud.integration.test.ts` | 🟡 MEDIUM | MongoDB CRUD, publish flow |
| `notification.controller.ts` | N/A | 🟢 LOW | Placeholder - remove or redirect |

### Test Scenarios by Priority

#### 🔴 CRITICAL - Tenant Isolation Tests

**customer-analytics.controller.ts:**
- [ ] Tenant A cannot see tenant B's customer data
- [ ] Query must filter by tenant_id

**event-reviews.controller.ts:**
- [ ] Tenant A cannot create review on tenant B's event
- [ ] Tenant A cannot see tenant B's reviews
- [ ] Rating summary scoped to tenant

**report-analytics.controller.ts:**
- [ ] Sales report only includes current tenant's data
- [ ] Venue comparison only includes current tenant's venues
- [ ] Customer insights scoped to tenant

**venue-analytics.controller.ts:**
- [ ] Dashboard only shows tenant's venue data
- [ ] Analytics only aggregates tenant's events
- [ ] Cannot access other tenant's venue by ID

#### ⚠️ HIGH - Business Logic Tests

**events.controller.ts:**
- [ ] Create event requires auth and tenant
- [ ] Get event returns 404 for other tenant's event
- [ ] Update validates ownership
- [ ] Delete requires permission
- [ ] Publish changes status correctly

**capacity.controller.ts:**
- [ ] Reserve locks price correctly
- [ ] Check availability returns correct counts
- [ ] Concurrent reservations handled (service layer)

**cancellation.controller.ts:**
- [ ] Permission check works
- [ ] Deadline enforcement
- [ ] Already cancelled returns 409
- [ ] Refund trigger flag passed correctly

#### 🟡 MEDIUM - Validation Tests

**schedule.controller.ts:**
- [ ] Joi validation rejects invalid input
- [ ] 422 returned with details
- [ ] Timezone required

**tickets.controller.ts:**
- [ ] Price validation (min 0)
- [ ] Currency validation (3 chars)
- [ ] Tax rate validation (0-1)

---

## REMAINING CONCERNS

### 🔴 CRITICAL Priority

1. **4 Controllers Have No Tenant Isolation:**
   - `customer-analytics.controller.ts`
   - `event-reviews.controller.ts`
   - `report-analytics.controller.ts`
   - `venue-analytics.controller.ts`
   - **Impact:** Cross-tenant data leakage
   - **Recommendation:** Add `where('tenant_id', tenantId)` to all queries

2. **Shared Services Don't Receive Tenant Context:**
   - `ReviewService` and `RatingService` from `@tickettoken/shared`
   - **Impact:** Reviews/ratings could leak across tenants
   - **Recommendation:** Update shared services to accept tenantId or validate event ownership

### ⚠️ HIGH Priority

3. **Direct DB Queries in Controllers:**
   - `customer-analytics.controller.ts`
   - `report-analytics.controller.ts`
   - `venue-analytics.controller.ts`
   - **Impact:** Bypasses service layer protections
   - **Recommendation:** Move to dedicated analytics service

4. **Inconsistent Service Instantiation:**
   - Some use DI container: `container.resolve('eventService')`
   - Some create new instances: `new CapacityService(db)`
   - **Impact:** Inconsistent patterns, harder to test
   - **Recommendation:** Use DI container consistently

5. **Error Handling Inconsistency:**
   - Some use `createProblemError()` (RFC 7807)
   - Some use string matching on error messages
   - Some return generic 500 for all errors
   - **Recommendation:** Standardize on `createProblemError()`

### 🟡 MEDIUM Priority

6. **Placeholder Notification Controller:**
   - Returns 501 for all endpoints
   - **Recommendation:** Remove routes or implement proxy to notification-service

7. **Missing Sold Ticket Check:**
   - `tickets.controller.ts` notes this but doesn't implement
   - **Impact:** Could modify pricing after tickets sold
   - **Recommendation:** Implement check via ticket-service

8. **No Caching for Analytics:**
   - Complex aggregation queries run every time
   - **Impact:** Performance
   - **Recommendation:** Add Redis caching with short TTL

---

## TESTING CHECKLIST

### Must Test (P0)
- [ ] Tenant isolation in customer-analytics
- [ ] Tenant isolation in event-reviews
- [ ] Tenant isolation in report-analytics
- [ ] Tenant isolation in venue-analytics
- [ ] Event CRUD with proper auth
- [ ] Capacity reservation flow

### Should Test (P1)
- [ ] Cancellation permission and deadline
- [ ] Schedule validation
- [ ] Ticket type validation
- [ ] Pricing calculations
- [ ] Content CRUD and publish flow

### Nice to Test (P2)
- [ ] Error response formats
- [ ] Pagination
- [ ] Input sanitization
- [ ] Audit context passing

---

## NOTES FOR IMPLEMENTATION

1. **Fix Tenant Isolation Pattern:**
   ```typescript
   // ALWAYS extract and use tenantId
   const tenantId = (request as any).tenantId;
   if (!tenantId) {
     throw createProblemError(400, 'TENANT_REQUIRED', 'Tenant ID required');
   }
   
   // Add to ALL queries
   await db('events')
     .where({ venue_id: venueId })
     .where('tenant_id', tenantId)  // REQUIRED
     .whereNull('deleted_at');
   ```

2. **Standardize Error Handling:**
   ```typescript
   // Use createProblemError everywhere
   throw createProblemError(404, 'NOT_FOUND', 'Event not found');
   throw createProblemError(403, 'FORBIDDEN', 'Permission denied');
   throw createProblemError(400, 'VALIDATION_ERROR', 'Invalid input');
   ```

3. **Use DI Container Consistently:**
   ```typescript
   // Instead of: new CapacityService(db)
   const capacityService = container.resolve('capacityService');
   ```

4. **Move Analytics to Service Layer:**
   ```typescript
   // Create new service
   class AnalyticsService {
     async getSalesReport(tenantId: string, options: ReportOptions) {
       // Ensure tenant isolation
       // Add caching
       // Return structured data
     }
   }
   ```

---

**End of Analysis**