# Event Service Routes Analysis
## Purpose: Integration Testing Documentation
## Source Files Analyzed:
- `src/routes/cancellation.routes.ts` (12 lines)
- `src/routes/capacity.routes.ts` (75 lines)
- `src/routes/customers.routes.ts` (12 lines)
- `src/routes/event-content.routes.ts` (25 lines)
- `src/routes/event-reviews.routes.ts` (30 lines)
- `src/routes/events.routes.ts` (250 lines)
- `src/routes/health.routes.ts` (130 lines)
- `src/routes/index.ts` (30 lines)
- `src/routes/internal.routes.ts` (280 lines)
- `src/routes/notifications.routes.ts` (20 lines)
- `src/routes/pricing.routes.ts` (65 lines)
- `src/routes/reports.routes.ts` (20 lines)
- `src/routes/schedules.routes.ts` (40 lines)
- `src/routes/tickets.routes.ts` (25 lines)
- `src/routes/venue-analytics.routes.ts` (15 lines)

## Generated: January 20, 2026

---

## FILE-BY-FILE ANALYSIS

### 1. cancellation.routes.ts (12 lines)

**Purpose:** Event cancellation endpoint.

**Endpoints:**
| Method | Path | Auth | Tenant | Controller |
|--------|------|------|--------|------------|
| POST | `/events/:eventId/cancel` | ✅ | ✅ | `cancelEvent` |

**Middleware Chain:** `authenticateFastify` → `tenantHook`

**Schema Validation:** ❌ None

**Potential Issues:**
- 🟡 No input schema validation for request body

---

### 2. capacity.routes.ts (75 lines)

**Purpose:** Event capacity management - sections, availability, reservations.

**Endpoints:**
| Method | Path | Auth | Tenant | Idempotency | Schema |
|--------|------|------|--------|-------------|--------|
| GET | `/events/:eventId/capacity` | ✅ | ✅ | ❌ | ✅ params |
| GET | `/events/:eventId/capacity/total` | ✅ | ✅ | ❌ | ✅ params |
| GET | `/capacity/:id` | ✅ | ✅ | ❌ | ✅ params |
| POST | `/events/:eventId/capacity` | ✅ | ✅ | ✅ | ✅ params+body |
| PUT | `/capacity/:id` | ✅ | ✅ | ❌ | ✅ params+body |
| POST | `/capacity/:id/check` | ✅ | ✅ | ❌ | ✅ params+body |
| POST | `/capacity/:id/reserve` | ✅ | ✅ | ✅ | ✅ params+body |

**Middleware Chain:** `authenticateFastify` → `tenantHook` → `idempotencyPreHandler` (POST only)

**Schema Imports:**
- `capacityIdParamSchema`, `eventIdParamSchema`
- `createCapacityBodySchema`, `updateCapacityBodySchema`
- `checkAvailabilityBodySchema`, `reserveCapacityBodySchema`

**Audit Fixes Applied:**
- RD5: Response schemas defined
- SD9: Reusable schema definitions

✅ **GOOD:** Well-structured with idempotency on mutations

---

### 3. customers.routes.ts (12 lines)

**Purpose:** Customer profile/analytics endpoint.

**Endpoints:**
| Method | Path | Auth | Tenant | Controller |
|--------|------|------|--------|------------|
| GET | `/customers/:customerId/profile` | ✅ | ✅ | `getCustomerProfile` |

**Middleware Chain:** `authenticateFastify` → `tenantHook`

**Schema Validation:** ❌ None

**Potential Issues:**
- 🔴 Controller has NO tenant isolation (see controllers-analysis.md)
- 🟡 No param validation for customerId

---

### 4. event-content.routes.ts (25 lines)

**Purpose:** Event content CRUD (gallery, lineup, schedule, performers) via MongoDB.

**Endpoints:**
| Method | Path | Auth | Tenant | Controller |
|--------|------|------|--------|------------|
| POST | `/:eventId/content` | ❌ | ❌ | `createContent` |
| GET | `/:eventId/content` | ❌ | ❌ | `getEventContent` |
| GET | `/:eventId/content/:contentId` | ❌ | ❌ | `getContent` |
| PUT | `/:eventId/content/:contentId` | ❌ | ❌ | `updateContent` |
| DELETE | `/:eventId/content/:contentId` | ❌ | ❌ | `deleteContent` |
| POST | `/:eventId/content/:contentId/publish` | ❌ | ❌ | `publishContent` |
| POST | `/:eventId/content/:contentId/archive` | ❌ | ❌ | `archiveContent` |
| GET | `/:eventId/gallery` | ❌ | ❌ | `getGallery` |
| GET | `/:eventId/lineup` | ❌ | ❌ | `getLineup` |
| GET | `/:eventId/schedule` | ❌ | ❌ | `getSchedule` |
| GET | `/:eventId/performers` | ❌ | ❌ | `getPerformers` |

**Middleware Chain:** ❌ NONE

**Schema Validation:** ❌ None

**Potential Issues:**
- 🔴 **CRITICAL: NO AUTH MIDDLEWARE** - All endpoints unprotected
- 🔴 **CRITICAL: NO TENANT HOOK** - No tenant isolation at route level
- 🟡 No schema validation

---

### 5. event-reviews.routes.ts (30 lines)

**Purpose:** Event reviews and ratings.

**Endpoints:**
| Method | Path | Auth | Tenant | Controller |
|--------|------|------|--------|------------|
| POST | `/:eventId/reviews` | ❌ | ❌ | `createReview` |
| GET | `/:eventId/reviews` | ❌ | ❌ | `getReviews` |
| GET | `/:eventId/reviews/:reviewId` | ❌ | ❌ | `getReview` |
| PUT | `/:eventId/reviews/:reviewId` | ❌ | ❌ | `updateReview` |
| DELETE | `/:eventId/reviews/:reviewId` | ❌ | ❌ | `deleteReview` |
| POST | `/:eventId/reviews/:reviewId/helpful` | ❌ | ❌ | `markHelpful` |
| POST | `/:eventId/reviews/:reviewId/report` | ❌ | ❌ | `reportReview` |
| POST | `/:eventId/ratings` | ❌ | ❌ | `submitRating` |
| GET | `/:eventId/ratings/summary` | ❌ | ❌ | `getRatingSummary` |
| GET | `/:eventId/ratings/me` | ❌ | ❌ | `getUserRating` |

**Middleware Chain:** ❌ NONE

**Schema Validation:** ❌ None

**Potential Issues:**
- 🔴 **CRITICAL: NO AUTH MIDDLEWARE** - All endpoints unprotected
- 🔴 **CRITICAL: NO TENANT HOOK** - No tenant isolation at route level
- 🔴 Controller also lacks tenant isolation (see controllers-analysis.md)
- 🟡 No schema validation

---

### 6. events.routes.ts (250 lines)

**Purpose:** Core event CRUD with comprehensive schema validation.

**Endpoints:**
| Method | Path | Auth | Tenant | Idempotency | Schema |
|--------|------|------|--------|-------------|--------|
| GET | `/events` | ✅ | ✅ | ❌ | ✅ query+response |
| GET | `/events/:id` | ✅ | ✅ | ❌ | ✅ params+response |
| POST | `/events` | ✅ | ✅ | ✅ | ✅ body+response |
| PUT | `/events/:id` | ✅ | ✅ | ❌ | ✅ params+body+response |
| DELETE | `/events/:id` | ✅ | ✅ | ❌ | ✅ params+response |
| POST | `/events/:id/publish` | ✅ | ✅ | ❌ | ✅ params+response |
| GET | `/venues/:venueId/events` | ✅ | ✅ | ❌ | ✅ params+query+response |

**Middleware Chain:** `authenticateFastify` → `tenantHook` → `idempotencyPreHandler` (POST create only)

**Security Features:**
- `additionalProperties: false` on all schemas (SEC1, RD6 - prevents prototype pollution)
- UUID pattern validation on IDs
- URL format validation (`format: 'uri'`)
- DateTime pattern validation
- MaxLength on all strings
- MaxItems on arrays

**Audit Fixes Applied:**
- RD5: Response schemas defined
- SD3: URL validation with format: uri
- SD4: Date validation with format: date-time
- SD9: Reusable schema definitions

✅ **GOOD:** Best-practice route implementation

---

### 7. health.routes.ts (130 lines)

**Purpose:** Kubernetes health probes and metrics.

**Endpoints:**
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/health/live` | ❌ | Liveness probe (<100ms, no deps) |
| GET | `/health/ready` | ❌ | Readiness probe (local deps only) |
| GET | `/health/startup` | ❌ | Startup probe |
| GET | `/health` | ❌ | Comprehensive health (monitoring) |
| GET | `/metrics` | ❌ | Prometheus metrics |
| GET | `/health/dependencies` | ❌ | External deps status (debugging) |

**Middleware Chain:** ❌ None (intentional - health checks must be unauthenticated)

**Key Implementation Details:**

**Liveness (`/health/live`):**
- NO async operations
- NO database checks
- NO Redis checks
- Must return <100ms

**Readiness (`/health/ready`):**
- Checks local dependencies (DB, Redis)
- Does NOT check external services (prevents cascading failures)

**Comprehensive (`/health`):**
- Optional `?include_deps=true` for external deps
- External service status does NOT affect overall health

✅ **GOOD:** Follows Kubernetes best practices

---

### 8. index.ts (30 lines)

**Purpose:** Route aggregation and registration.

**Registration Order:**
1. `healthRoutes` - No prefix, no auth
2. `internalRoutes` - S2S only, no user auth
3. `eventsRoutes`
4. `scheduleRoutes`
5. `capacityRoutes`
6. `pricingRoutes`
7. `ticketRoutes`
8. `notificationRoutes`
9. `customerRoutes`
10. `reportRoutes`
11. `venueAnalyticsRoutes`
12. `cancellationRoutes`

**Missing Registrations:**
- ❌ `event-content.routes.ts` - NOT REGISTERED
- ❌ `event-reviews.routes.ts` - NOT REGISTERED

🔴 **CRITICAL:** Two route files are not registered in index!

---

### 9. internal.routes.ts (280 lines)

**Purpose:** Service-to-service internal APIs.

**Endpoints:**
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/internal/events/:eventId` | S2S | Event details for minting/payment |
| GET | `/internal/events/:eventId/pda` | S2S | Blockchain PDA data |
| GET | `/internal/events/:eventId/scan-stats` | S2S | Scan statistics for scanning-service |

**Authentication:** HMAC signature verification
```
Headers required:
- x-internal-service: Service name
- x-internal-timestamp: Request timestamp
- x-internal-signature: HMAC-SHA256 signature
```

**Security Features:**
- Timestamp validation (5-minute window)
- Timing-safe signature comparison
- Environment-based temp signature allowance (dev only)

**Tenant Handling:**
- Uses `x-tenant-id` header (optional filter)
- If provided, filters query by tenant

**Schema Validation:** ❌ None (internal use)

**Potential Issues:**
- 🟡 `INTERNAL_SERVICE_SECRET` warning only if not set
- 🟡 No schema validation on responses
- 🟡 Raw SQL query in scan-stats endpoint

---

### 10. notifications.routes.ts (20 lines)

**Purpose:** Placeholder notification endpoints (returns 501).

**Endpoints:**
| Method | Path | Auth | Tenant | Controller |
|--------|------|------|--------|------------|
| POST | `/notifications` | ✅ | ✅ | `createNotification` (501) |
| GET | `/users/:userId/notifications` | ✅ | ✅ | `getUserNotifications` (501) |
| PUT | `/notifications/:notificationId/read` | ✅ | ✅ | `markAsRead` (501) |

**Middleware Chain:** `authenticateFastify` → `tenantHook`

**Schema Validation:** ❌ None

**Note:** All endpoints return 501 - should use notification-service

🟡 **MEDIUM:** Placeholder routes should be removed or proxied

---

### 11. pricing.routes.ts (65 lines)

**Purpose:** Event pricing tier management.

**Endpoints:**
| Method | Path | Auth | Tenant | Idempotency | Schema |
|--------|------|------|--------|-------------|--------|
| GET | `/events/:eventId/pricing` | ✅ | ✅ | ❌ | ✅ params |
| GET | `/events/:eventId/pricing/active` | ✅ | ✅ | ❌ | ✅ params |
| GET | `/pricing/:id` | ✅ | ✅ | ❌ | ✅ params |
| POST | `/events/:eventId/pricing` | ✅ | ✅ | ✅ | ✅ params+body |
| PUT | `/pricing/:id` | ✅ | ✅ | ❌ | ✅ params+body |
| POST | `/pricing/:id/calculate` | ✅ | ✅ | ❌ | ✅ params+body |

**Middleware Chain:** `authenticateFastify` → `tenantHook` → `idempotencyPreHandler` (POST create only)

**Schema Imports:**
- `pricingIdParamSchema`, `eventIdParamSchema`
- `createPricingBodySchema`, `updatePricingBodySchema`
- `calculatePriceBodySchema`

**Audit Fixes Applied:**
- RD5: Response schemas defined
- SD4: Date validation
- SD9: Reusable schema definitions

✅ **GOOD:** Well-structured with idempotency

---

### 12. reports.routes.ts (20 lines)

**Purpose:** Analytics reports.

**Endpoints:**
| Method | Path | Auth | Tenant | Controller |
|--------|------|------|--------|------------|
| GET | `/reports/sales` | ✅ | ✅ | `getSalesReport` |
| GET | `/reports/venue-comparison` | ✅ | ✅ | `getVenueComparisonReport` |
| GET | `/reports/customer-insights` | ✅ | ✅ | `getCustomerInsightsReport` |

**Middleware Chain:** `authenticateFastify` → `tenantHook`

**Schema Validation:** ❌ None

**Potential Issues:**
- 🔴 Controller has NO tenant isolation (see controllers-analysis.md)
- 🟡 No schema validation
- 🟡 No date range parameters

---

### 13. schedules.routes.ts (40 lines)

**Purpose:** Event schedule management.

**Endpoints:**
| Method | Path | Auth | Tenant | Controller |
|--------|------|------|--------|------------|
| GET | `/events/:eventId/schedules` | ✅ | ✅ | `getSchedules` |
| POST | `/events/:eventId/schedules` | ✅ | ✅ | `createSchedule` |
| GET | `/events/:eventId/schedules/upcoming` | ✅ | ✅ | `getUpcomingSchedules` |
| GET | `/events/:eventId/schedules/next` | ✅ | ✅ | `getNextSchedule` |
| GET | `/events/:eventId/schedules/:scheduleId` | ✅ | ✅ | `getSchedule` |
| PUT | `/events/:eventId/schedules/:scheduleId` | ✅ | ✅ | `updateSchedule` |

**Middleware Chain:** `authenticateFastify` → `tenantHook`

**Schema Validation:** ❌ None (validation in controller via Joi)

**Potential Issues:**
- 🟡 No idempotency on POST
- 🟡 No schema validation at route level (done in controller)

---

### 14. tickets.routes.ts (25 lines)

**Purpose:** Ticket type (pricing tier) management.

**Endpoints:**
| Method | Path | Auth | Tenant | Controller |
|--------|------|------|--------|------------|
| GET | `/events/:id/ticket-types` | ✅ | ✅ | `getTicketTypes` |
| POST | `/events/:id/ticket-types` | ✅ | ✅ | `createTicketType` |
| PUT | `/events/:id/ticket-types/:typeId` | ✅ | ✅ | `updateTicketType` |

**Middleware Chain:** `authenticateFastify` → `tenantHook`

**Schema Validation:** ❌ None (validation in controller via Joi)

**Potential Issues:**
- 🟡 No idempotency on POST
- 🟡 No schema validation at route level

---

### 15. venue-analytics.routes.ts (15 lines)

**Purpose:** Venue-specific analytics.

**Endpoints:**
| Method | Path | Auth | Tenant | Controller |
|--------|------|------|--------|------------|
| GET | `/venues/:venueId/dashboard` | ✅ | ✅ | `getVenueDashboard` |
| GET | `/venues/:venueId/analytics` | ✅ | ✅ | `getVenueAnalytics` |

**Middleware Chain:** `authenticateFastify` → `tenantHook`

**Schema Validation:** ❌ None

**Potential Issues:**
- 🔴 Controller has NO tenant isolation (see controllers-analysis.md)
- 🟡 No param validation for venueId

---

## CROSS-SERVICE DEPENDENCIES

### Middleware Stack

```
┌─────────────────────────────────────────────────────────────┐
│                      Request Flow                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              1. authenticateFastify                          │
│                 - Validates JWT                              │
│                 - Sets request.user                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              2. tenantHook                                   │
│                 - Extracts tenant from JWT/header            │
│                 - Sets request.tenantId                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              3. idempotencyPreHandler (optional)             │
│                 - Checks idempotency key                     │
│                 - Returns cached response if exists          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              4. Schema Validation (Fastify)                  │
│                 - Validates params, query, body              │
│                 - Returns 400 if invalid                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              5. Controller Handler                           │
└─────────────────────────────────────────────────────────────┘
```

### Auth/Tenant Coverage Summary

| Route File | Auth | Tenant | Schema | Idempotency |
|------------|------|--------|--------|-------------|
| cancellation.routes | ✅ | ✅ | ❌ | ❌ |
| capacity.routes | ✅ | ✅ | ✅ | ✅ (mutations) |
| customers.routes | ✅ | ✅ | ❌ | ❌ |
| event-content.routes | ❌ | ❌ | ❌ | ❌ |
| event-reviews.routes | ❌ | ❌ | ❌ | ❌ |
| events.routes | ✅ | ✅ | ✅ | ✅ (create) |
| health.routes | ❌ | ❌ | ❌ | ❌ |
| internal.routes | S2S | Header | ❌ | ❌ |
| notifications.routes | ✅ | ✅ | ❌ | ❌ |
| pricing.routes | ✅ | ✅ | ✅ | ✅ (create) |
| reports.routes | ✅ | ✅ | ❌ | ❌ |
| schedules.routes | ✅ | ✅ | ❌ | ❌ |
| tickets.routes | ✅ | ✅ | ❌ | ❌ |
| venue-analytics.routes | ✅ | ✅ | ❌ | ❌ |

---

## INTEGRATION TEST FILE MAPPING

### Test Coverage Recommendations

| Route File | Test File (Proposed) | Priority | Key Scenarios |
|------------|---------------------|----------|---------------|
| `event-content.routes.ts` | `event-content-auth.integration.test.ts` | 🔴 CRITICAL | Missing auth/tenant - exploit test |
| `event-reviews.routes.ts` | `event-reviews-auth.integration.test.ts` | 🔴 CRITICAL | Missing auth/tenant - exploit test |
| `index.ts` | `route-registration.integration.test.ts` | 🔴 CRITICAL | Verify all routes registered |
| `events.routes.ts` | `events-routes.integration.test.ts` | ⚠️ HIGH | Full CRUD, schema validation |
| `capacity.routes.ts` | `capacity-routes.integration.test.ts` | ⚠️ HIGH | Reservation flow, idempotency |
| `pricing.routes.ts` | `pricing-routes.integration.test.ts` | ⚠️ HIGH | CRUD, calculations |
| `internal.routes.ts` | `internal-routes.integration.test.ts` | ⚠️ HIGH | S2S auth, signature validation |
| `health.routes.ts` | `health-routes.integration.test.ts` | 🟡 MEDIUM | Probe behavior, response times |
| `schedules.routes.ts` | `schedules-routes.integration.test.ts` | 🟡 MEDIUM | CRUD flow |
| `reports.routes.ts` | `reports-tenant.integration.test.ts` | 🟡 MEDIUM | Tenant isolation (controller issue) |

---

## REMAINING CONCERNS

### 🔴 CRITICAL Priority

1. **event-content.routes.ts has NO AUTH/TENANT middleware:**
   ```typescript
   // Current - UNPROTECTED
   fastify.post('/:eventId/content', controller.createContent);
   
   // Should be
   fastify.post('/:eventId/content', {
     preHandler: [authenticateFastify, tenantHook]
   }, controller.createContent);
   ```

2. **event-reviews.routes.ts has NO AUTH/TENANT middleware:**
   - Same issue as above
   - All 10 endpoints completely unprotected

3. **Routes NOT REGISTERED in index.ts:**
   - `event-content.routes.ts`
   - `event-reviews.routes.ts`
   - These files exist but are never loaded

### ⚠️ HIGH Priority

4. **Inconsistent schema validation:**
   - `events.routes.ts`, `capacity.routes.ts`, `pricing.routes.ts` have full schemas
   - Other routes have none
   - Should standardize

5. **Inconsistent idempotency:**
   - Only `events`, `capacity`, `pricing` have idempotency on creates
   - `schedules`, `tickets` mutations lack idempotency

6. **Reports/Analytics routes have middleware but controllers don't use tenant:**
   - `reports.routes.ts` - tenant hook applied but controller ignores it
   - `venue-analytics.routes.ts` - same issue
   - `customers.routes.ts` - same issue

### 🟡 MEDIUM Priority

7. **Notification routes return 501:**
   - Should be removed or proxied to notification-service

8. **Internal routes lack response schemas:**
   - Could leak unexpected data

9. **Missing DELETE endpoints:**
   - No delete for schedules
   - No delete for ticket types
   - No delete for pricing

---

## TESTING CHECKLIST

### Must Test (P0)
- [ ] event-content routes accessible without auth (exploit test)
- [ ] event-reviews routes accessible without auth (exploit test)
- [ ] Verify all route files are registered in index.ts
- [ ] events.routes schema validation rejects invalid input
- [ ] events.routes schema prevents prototype pollution

### Should Test (P1)
- [ ] capacity reservation with idempotency key
- [ ] pricing creation with idempotency key
- [ ] internal routes reject invalid signatures
- [ ] internal routes reject expired timestamps
- [ ] health/live returns in <100ms

### Nice to Test (P2)
- [ ] Response schema enforcement
- [ ] All param UUIDs validated
- [ ] All URLs validated as URIs
- [ ] Date formats validated

---

## NOTES FOR IMPLEMENTATION

1. **Fix event-content.routes.ts:**
   ```typescript
   import { authenticateFastify } from '../middleware/auth';
   import { tenantHook } from '../middleware/tenant';
   
   export default async function eventContentRoutes(fastify: FastifyInstance): Promise<void> {
     const controller = new EventContentController();
     
     // ADD middleware to ALL routes
     fastify.post('/:eventId/content', {
       preHandler: [authenticateFastify, tenantHook]
     }, controller.createContent);
     // ... same for all other routes
   }
   ```

2. **Fix event-reviews.routes.ts:**
   - Same pattern as above

3. **Register missing routes in index.ts:**
   ```typescript
   import eventContentRoutes from './event-content.routes';
   import eventReviewsRoutes from './event-reviews.routes';
   
   export default async function routes(app: FastifyInstance) {
     // ... existing registrations
     await app.register(eventContentRoutes, { prefix: '/events' });
     await app.register(eventReviewsRoutes, { prefix: '/events' });
   }
   ```

4. **Add schema validation to remaining routes:**
   - Follow pattern from `events.routes.ts`
   - Import from `schemas/` directory
   - Add `additionalProperties: false` to all body schemas

---

**End of Analysis**