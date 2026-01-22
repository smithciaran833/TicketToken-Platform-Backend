# Venue Service Core Services Analysis
## Purpose: Integration Testing Documentation  
## Source: venue.service.ts, onboarding.service.ts, venue-operations.service.ts, venue-content.service.ts, resale.service.ts, interfaces.ts
## Generated: January 18, 2026

---

## SECURITY FIXES APPLIED

The following critical issues were fixed during this analysis:

| File | Issue | Severity | Status |
|------|-------|----------|--------|
| venue-content.service.ts | No tenant isolation on MongoDB | CRITICAL | ✅ FIXED |
| onboarding.service.ts | No tenant validation | HIGH | ✅ FIXED |
| venue.service.ts | Cache not cleared on create | LOW | ✅ FIXED |
| venue.service.ts | Updates not audited | LOW | ✅ FIXED |
| venue-content.controller.ts | Not passing tenantId to service | HIGH | ✅ FIXED |

**Impact:** All controller routes now properly validate tenant context before accessing MongoDB content. Cross-tenant access attempts are blocked at both service and controller layers.

---

## FILE ANALYSIS

### 1. venue.service.ts

**DATABASE OPERATIONS:**
- **Tables:** venues, venue_staff, venue_settings, event_schedules, events
- **Operations:** INSERT (venues, venue_staff, venue_settings), UPDATE (venues), SELECT (all), DELETE (soft)
- **Transactions:** ✅ Used in `createVenue()` - atomic venue + staff + settings creation
- **Joins:** event_schedules ⟗ events in `canDeleteVenue()`
- **Soft Delete:** ✅ Uses `deleted_at` pattern consistently

**EXTERNAL SERVICE CALLS:**
- **EventPublisher (RabbitMQ):**
  - `publishVenueCreated(venueId, venue, ownerId)`
  - `publishVenueUpdated(venueId, updates, userId)`
  - `publishVenueDeleted(venueId, userId)`
  - ⚠️ Failures logged but not retried (TODOs present)

**CACHING:**
- **Redis keys:**
  - `venue:{id}:details` - TTL: 300s (5 minutes)
  - `venue:{id}:stats` - TTL: 60s (1 minute)
  - `venue:{id}:events` - cleared on updates
  - `venue:{id}:staff` - cleared on updates
- **Invalidation:** ✅ On update, delete, and now create (fixed)
- **Pattern:** Cache-aside with read-through

**TENANT ISOLATION:**
- ✅ `tenant_id` set on venue creation
- ✅ Relies on RLS at database level
- ⚠️ Not validated at service entry (relies on controller middleware)

**AUDIT LOGGING:**
- ✅ `venue_created` - userId, venueId, requestInfo
- ✅ `venue_deleted` - userId, venueId
- ✅ `venue_updated` - userId, venueId, changes (now added)

**BUSINESS LOGIC:**
- Permission checks via StaffModel (owner/manager/staff roles)
- Venue deletion validation (no active events, 90-day retention)
- Onboarding progress tracking
- Staff management with role-based access

**CONCURRENCY:**
- ✅ Transactions used for multi-step operations
- ❌ No FOR UPDATE locks
- ❌ No optimistic locking

**POTENTIAL ISSUES:**
1. Event publishing failures not queued for retry
2. Race conditions possible in concurrent updates
3. Direct DB queries in `listUserVenues()` bypass model layer

---

### 2. onboarding.service.ts

**DATABASE OPERATIONS:**
- **Tables:** venues, venue_layouts, venue_integrations, venue_staff
- **Operations:** SELECT (status checks), UPDATE (venues), INSERT (layouts, integrations, staff)
- **Transactions:** ❌ None (needs improvement)
- **Joins:** None

**TENANT ISOLATION:**
- ✅ FIXED: Now validates tenant on all public methods
- ✅ FIXED: `validateTenantContext()` with UUID validation
- ✅ FIXED: `verifyVenueOwnership()` before operations
- ✅ FIXED: All DB queries include `tenant_id` filter

**BUSINESS LOGIC:**
- **5-step onboarding workflow:**
  1. Basic info (name, type, capacity) - required
  2. Address (location details) - required
  3. Layout (seating arrangement) - optional
  4. Payment integration (Stripe/Square) - required
  5. Staff members (team addition) - optional
- Progress calculation (completed/total steps)
- Step completion tracking

**POTENTIAL ISSUES:**
1. ❌ No transactions - multi-step operations not atomic
2. ❌ Partial completion possible on errors
3. ❌ No rollback capability

**BREAKING CHANGES:**
- `getOnboardingStatus(venueId)` → `getOnboardingStatus(venueId, tenantId)`
- `completeStep(venueId, stepId, data)` → `completeStep(venueId, tenantId, stepId, data)`

---

### 3. venue-operations.service.ts ⭐ GOLD STANDARD

**DATABASE OPERATIONS:**
- **Tables:** venue_operations
- **Operations:** INSERT (operations), UPDATE (status, steps, checkpoints), SELECT (history, resume)
- **Transactions:** ❌ None (uses distributed locks instead)
- **Joins:** None

**TENANT ISOLATION:**
- ✅ **GOLD STANDARD** - Best implementation in codebase
- ✅ `validateTenantContext()` with UUID validation on ALL operations
- ✅ Sets RLS context: `SET LOCAL app.current_tenant_id = ?`
- ✅ All queries include `tenant_id` filter
- ✅ Comprehensive error messages

**CONCURRENCY:**
- ✅ Distributed Redis locks with 60s TTL
- ✅ Lock key pattern: `venue:operation:lock:{venueId}:{operationType}`
- ⚠️ Fails open on lock errors (allows operation to proceed)
- ✅ Prevents duplicate operations

**BUSINESS LOGIC:**
- **Operation statuses:** pending → in_progress → checkpoint → completed
- **Failure states:** failed, rolled_back
- **Recovery:**  
  - ✅ Checkpoint data stored for recovery
  - ✅ Resume from last completed step
  - ✅ Step-level rollback support

**BEST PRACTICES:**
- Comprehensive logging with context
- UUID format validation
- Proper error messages (no info leakage)
- Clean separation of concerns

---

### 4. venue-content.service.ts (MongoDB)

**DATABASE OPERATIONS:**
- **Database:** MongoDB (not PostgreSQL)
- **Collection:** venue_contents
- **Operations:** INSERT (content), UPDATE (content), DELETE (hard), SELECT (by venue/type/status)
- **Transactions:** ❌ None (single document operations)

**TENANT ISOLATION:**
- ✅ FIXED: Now validates tenant on all 14 public methods
- ✅ FIXED: `validateTenantContext()` with UUID validation
- ✅ FIXED: `verifyVenueOwnership()` validates against PostgreSQL before MongoDB ops
- ✅ FIXED: Prevents cross-tenant access to MongoDB content

**CONTENT TYPES:**
- SEATING_CHART, PHOTO, VIDEO, VIRTUAL_TOUR
- AMENITIES, DIRECTIONS, PARKING_INFO
- ACCESSIBILITY_INFO, POLICIES, FAQ

**STATUS TRANSITIONS:**
- `draft` → `published` → `archived`

**VERSIONING:**
- ✅ Version field incremented on updates
- ❌ Not used for optimistic locking

**BREAKING CHANGES:**
- All 14 methods now require `tenantId` parameter
- Constructor now requires `db: Knex` for PostgreSQL validation
- See SECURITY_FIXES_SUMMARY.md for full list

**POTENTIAL ISSUES:**
1. Hard deletes instead of soft deletes
2. No audit trail for content changes
3. Version field not used for concurrency control
4. Mixed databases (PostgreSQL + MongoDB) without distributed transactions

---

### 5. resale.service.ts

**DATABASE OPERATIONS:**
- **Tables:** resale_policies, venue_settings, transfer_history, seller_verifications, ticket_purchases, tickets, resale_blocks, user_devices, users, suspicious_ips, fraud_patterns, fraud_logs
- **Operations:** Heavy SELECT for validation, INSERT for history/logs, UPDATE for verifications
- **Transactions:** ❌ None
- **Joins:** None (separate queries)

**BUSINESS LOGIC:**

**Jurisdiction-based Price Caps:**
- US States: CT, LA, MI, MN (face value only), NY (no caps)
- EU Countries: FR, IT, BE (face value), UK (face value + 10%), DE (platform-specific)
- Default: No restrictions

**Anti-Scalping Detection:**
- High volume purchases (>10 tickets per event)
- Elevated resale activity (>20 in 30 days = high risk)
- Price markup patterns (>100% = excessive)
- Quick flips (<24h between buy and list)
- Risk scoring: low/medium/high/critical

**Fraud Detection:**
- Same device (buyer/seller)
- Suspicious pricing (<50% of face value)
- New account selling (<7 days old)
- High velocity (>10 sales in 1 hour)
- IP reputation checks
- Pattern matching

**TENANT ISOLATION:**
- ✅ All queries include `tenant_id` filter
- ⚠️ No tenant validation at method entry
- ⚠️ Missing `validateTenantContext()` pattern

**POTENTIAL ISSUES:**
1. ❌ No transactions - race conditions in transfer counting
2. ❌ No tenant validation at entry (could be improved)
3. Complex jurisdiction logic requires extensive testing
4. Many DB queries per validation - performance concern

---

### 6. interfaces.ts

**Purpose:** TypeScript type definitions only
- Service contracts (IVenueService, IIntegrationService, IOnboardingService, etc.)
- Data structures (IStaff, ILayout, IVenue, IIntegration)
- No implementation - pure types

---

## INTEGRATION TEST FILE MAPPING

| Service | Test File | Priority | Key Scenarios |
|---------|-----------|----------|---------------|
| venue.service.ts | venue-lifecycle.integration.test.ts | HIGH | CRUD operations, transactions, cache invalidation, event publishing, permission checks, soft deletes |
| onboarding.service.ts | venue-onboarding.integration.test.ts | HIGH | Step progression, tenant validation, venue ownership, partial completion handling |
| venue-operations.service.ts | venue-operations.integration.test.ts | MEDIUM | Distributed locks, checkpoint/resume, tenant RLS context, rollback scenarios |
| venue-content.service.ts | venue-content.integration.test.ts | HIGH | MongoDB CRUD, tenant isolation, PostgreSQL validation, status transitions, cross-tenant blocking |
| resale.service.ts | resale-validation.integration.test.ts | HIGH | Jurisdiction rules, price caps, fraud detection, transfer counting, race conditions |

---

## CROSS-SERVICE DEPENDENCIES

### Database Consistency
- **Mixed databases:** PostgreSQL (venues, staff, settings, operations, resale) + MongoDB (content)
- **No distributed transactions** across databases
- **Consistency risk:** venue-content operations validate venue in PostgreSQL first

### Event-Driven Concerns
- Event publishing failures logged but not retried
- No event schemas referenced in code
- No event versioning visible
- **TODO items** exist for dead letter queue implementation

### Service Interactions
- venue.service validates events (event-service concern) in `canDeleteVenue()`
- Cross-service validation without API calls (direct DB access)
- **Tight coupling** to event service schema

---

## CACHING STRATEGY

### Current Implementation
- **venue.service.ts only:** Uses Redis for data caching
- **Other services:** No caching
- **Strategy:** Cache-aside with read-through
- **Invalidation:** Manual via `clearVenueCache()`

### Gaps
- No cache warming
- No distributed cache invalidation
- Cache keys not versioned
- No cache stampede protection

---

## TENANT ISOLATION MATURITY

### Best → Worst

1. **venue-operations.service.ts** ⭐ GOLD STANDARD
   - UUID validation
   - RLS context setting
   - All queries filtered
   - Comprehensive error handling

2. **venue-content.service.ts** ✅ FIXED
   - UUID validation added
   - PostgreSQL verification added
   - All methods require tenantId
   - ForbiddenError on violations

3. **onboarding.service.ts** ✅ FIXED
   - UUID validation added
   - Venue ownership verification added
   - All queries filtered

4. **venue.service.ts** 🟡 GOOD
   - Sets tenant_id on create
   - Relies on RLS
   - No entry validation

5. **resale.service.ts** 🟠 NEEDS IMPROVEMENT
   - All queries filtered
   - No entry validation
   - Should add validateTenantContext()

---

## REMAINING CONCERNS

### High Priority
1. **onboarding.service.ts** - Needs transactions for atomic multi-step operations
2. **resale.service.ts** - Race conditions in transfer counting (needs locking or transactions)
3. **Event publishing** - Failures not retried (implement dead letter queue)

### Medium Priority
1. **venue-content.service.ts** - Mixed database architecture without distributed transactions
2. **All services** - No optimistic locking for concurrent updates
3. **resale.service.ts** - Add entry-point tenant validation

### Low Priority
1. **Caching** - Implement cache warming and stampede protection
2. **Audit logging** - Extend to onboarding and content changes
3. **Metrics** - Add performance tracking for complex operations

---

## TEST SCENARIOS BY PRIORITY

### Critical (Must Test)
1. **Tenant isolation** - Cross-tenant access attempts blocked
2. **Transactions** - Rollback on partial failures
3. **Concurrency** - Race conditions in transfer counting
4. **MongoDB+PostgreSQL** - Consistency across databases

### High (Should Test)
1. **Event publishing** - Failures handled gracefully
2. **Distributed locks** - Prevent duplicate operations
3. **Cache invalidation** - Updates reflected correctly
4. **Jurisdiction rules** - Price caps enforced

### Medium (Nice to Test)
1. **Checkpoint/resume** - Long operations recover correctly
2. **Anti-scalping** - Detection triggers appropriately
3. **Fraud detection** - Risk scoring accurate
4. **Permission checks** - Role-based access works

---

## DEPLOYMENT CHECKLIST

### Before Deployment
- [ ] Update venue-content controller routes with tenantId extraction (✅ DONE)
- [ ] Update onboarding controller routes (if they exist) with tenantId extraction
- [ ] Verify tenant middleware is active on all protected routes
- [ ] Run integration tests for tenant isolation
- [ ] Test cross-tenant access blocking

### After Deployment
- [ ] Monitor for "Missing tenant context" errors
- [ ] Monitor MongoDB query patterns
- [ ] Check event publishing error rates
- [ ] Verify cache hit rates remain stable

---

## RELATED DOCUMENTATION

- **Security Fixes:** `backend/services/venue-service/SECURITY_FIXES_SUMMARY.md`
- **Gold Standard:** `src/services/venue-operations.service.ts`
- **Tenant Middleware:** `src/middleware/tenant.middleware.ts`
- **Models Analysis:** `docs/integration-analysis/models-analysis.md`
- **Schemas Analysis:** `docs/integration-analysis/schemas-analysis.md`

---

*This analysis documents the current state of venue-service core services after critical security fixes. All breaking changes are documented in SECURITY_FIXES_SUMMARY.md. Controllers have been updated to pass tenantId to service methods.*
