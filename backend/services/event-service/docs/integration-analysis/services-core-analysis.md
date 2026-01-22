# Event Service Core Services Analysis
## Purpose: Integration Testing Documentation
## Source Files Analyzed:
- `src/services/event.service.ts` (621 lines)
- `src/services/event-state-machine.ts` (466 lines)
- `src/services/event-content.service.ts` (115 lines)
- `src/services/event-cancellation.service.ts` (527 lines)
- `src/services/cancellation.service.ts` (109 lines)
- `src/services/capacity.service.ts` (310 lines)
- `src/services/pricing.service.ts` (186 lines)

## Generated: January 20, 2026

---

## SECURITY FIXES APPLIED

| File | Issue | Severity | Status |
|------|-------|----------|--------|
| `event-content.service.ts` | No tenant isolation - all MongoDB queries missing tenantId filter | 🔴 CRITICAL | ✅ FIXED |
| `event-content.service.ts` | No tenant validation - UUID format not validated | 🔴 CRITICAL | ✅ FIXED |
| `event-content.controller.ts` | Controller not extracting tenantId from request | 🔴 CRITICAL | ✅ FIXED |

**Fix Details:**
- Added `validateTenantContext()` helper with UUID v4 validation
- Added `tenantId` parameter to all 11 public methods in service
- Added `tenantId` filter to all MongoDB queries (find, findOne, findOneAndDelete)
- Updated controller to extract `tenantId` from request and pass to all service calls
- Added security comments marking tenant validation points

---

## ORPHANED FILES (Not Analyzed)

| File | Reason | Recommendation |
|------|--------|----------------|
| N/A - All files are imported | All analyzed files are actively used | Continue monitoring |

**NOTE:** `event-cancellation.service.ts` and `cancellation.service.ts` are BOTH used - see Duplicate Services section below.

---

## FILE-BY-FILE ANALYSIS

### 1. event.service.ts (621 lines)

**Purpose:** Main event CRUD operations, lifecycle management, state transitions

#### DATABASE OPERATIONS

**Tables Touched:**
- `events` (PRIMARY) - Full CRUD + soft delete
- `event_schedules` - INSERT, SELECT
- `event_capacity` - INSERT, SELECT, aggregate (SUM)
- `event_metadata` - INSERT
- `event_audit_log` - INSERT
- `tickets` - SELECT, COUNT (⚠️ conditional - may not exist in this service)

**Transaction Usage:**
- ✅ `createEvent()` - wraps event + schedule + capacity + metadata creation
- ✅ `updateEvent()` - wraps update + audit log
- ✅ `deleteEvent()` - wraps soft delete + audit log

**Joins:** None (uses multiple queries instead)

**Soft Delete Pattern:** ✅ Enforced
- All queries include `whereNull('deleted_at')`
- Delete sets `deleted_at` timestamp and status to 'CANCELLED'

#### EXTERNAL SERVICE CALLS

**HTTP Clients:**
| Service | Method | Purpose | Error Handling |
|---------|--------|---------|----------------|
| VenueServiceClient | `validateVenueAccess()` | Permission check | Throws on failure |
| VenueServiceClient | `getVenue()` | Get venue details (timezone, capacity) | Throws on failure |
| EventBlockchainService | `createEventOnChain()` | Sync event to blockchain | Try-catch, sets status to 'failed' |

**Message Queue (RabbitMQ):**
- `publishSearchSync('event.created')` - Index new event in search service
- `publishSearchSync('event.updated')` - Update search index
- `publishSearchSync('event.deleted')` - Remove from search index

**🔴 CRITICAL ISSUES:**
1. Venue service calls are synchronous HTTP with no visible circuit breaker
2. Blockchain sync is synchronous and blocks event creation
3. No retry logic for blockchain failures

#### CACHING

**Redis Patterns:**
| Key Pattern | TTL | Operations | Trigger |
|-------------|-----|------------|---------|
| `venue:events:{venue_id}` | Not set | DEL only | Create, update, delete |
| `event:{eventId}` | Not set | DEL only | Update, delete |

**Metrics:** ✅ `cacheInvalidationTotal.inc()` tracked

**🟡 MEDIUM ISSUE:** Cache is only invalidated, never read or set in this service

#### STATE MANAGEMENT

**Current State Tracking:** Uses `status` field with state machine validation

**Valid Transitions:**
```
DRAFT → REVIEW, PUBLISHED
REVIEW → APPROVED, DRAFT  
APPROVED → PUBLISHED
PUBLISHED → ON_SALE, CANCELLED, POSTPONED
ON_SALE → SOLD_OUT, SALES_PAUSED, IN_PROGRESS, CANCELLED, POSTPONED
SALES_PAUSED → ON_SALE, CANCELLED
SOLD_OUT → IN_PROGRESS, CANCELLED
IN_PROGRESS → COMPLETED, CANCELLED
POSTPONED → RESCHEDULED, CANCELLED
RESCHEDULED → PUBLISHED, ON_SALE, CANCELLED
```

**Validation:** ✅ Enforced via `validateStateTransition()` calling `event-state-machine.ts`

**🟡 MEDIUM ISSUE:** Transition map duplicated between service and state-machine file

#### TENANT ISOLATION

**Status:** ✅ ENFORCED

**Implementation:**
- All queries include `tenant_id` in WHERE clauses
- Event creation sets `tenant_id` from request
- Child tables (schedules, capacity, metadata, audit) include `tenant_id`

**No critical issues found**

#### BUSINESS LOGIC

**Permission Checks:**
- ✅ Admin bypass: `isAdmin(user)` check
- ✅ Ownership: `event.created_by !== userId && !userIsAdmin`
- ✅ Venue access: via VenueServiceClient

**Validation Rules:**
- ✅ Timezone validation with `validateTimezoneOrThrow()`
- ✅ Event date validation (past dates rejected)
- ✅ Venue capacity validation
- ✅ Sold ticket count check before deletion/modification
- ✅ Status must be in valid enumeration
- ✅ Duplicate event detection (venue + date + name)

**Time-Sensitive Operations:**
- 🟢 Properly handles timezones - validates and uses venue timezone as fallback
- ✅ Stores timezone with schedule data

**Multi-Step Workflows:**

1. **Create Event:**
   - Validate venue access
   - Validate timezone
   - Check for duplicates
   - Create event + schedule + capacity + metadata (transaction)
   - Sync to blockchain (async attempt)
   - Invalidate cache
   - Publish to search service

2. **Update Event:**
   - Check permissions (ownership or admin)
   - Validate venue access
   - Check sold ticket count
   - Validate state transition
   - Apply optimistic locking
   - Update (transaction)
   - Invalidate cache
   - Publish to search

3. **Delete Event:**
   - Check permissions
   - Validate venue access
   - Check sold ticket count
   - Soft delete + audit (transaction)
   - Invalidate cache
   - Publish to search

**🟡 MEDIUM ISSUE:** `getSoldTicketCount()` queries tickets table which belongs to ticket-service

#### ERROR HANDLING

**Custom Errors:**
- `ConflictError` - Optimistic locking version mismatch
- `EventStateError` - Invalid state transition (includes current/target state)
- `NotFoundError` - Entity not found
- `ValidationError` - Validation failures with field details
- `ForbiddenError` - Permission denied

**No explicit error codes** - uses error class names

#### CONCURRENCY

**Optimistic Locking:** ✅ IMPLEMENTED
- Uses `version` field: `COALESCE(version, 0) + 1`
- WHERE clause checks `expectedVersion` if client provides it
- Throws `ConflictError` on version mismatch

**Transaction Isolation:** ✅ Used for all multi-table operations

**Race Condition Protection:** ✅ Good - optimistic locking prevents concurrent updates

#### POTENTIAL ISSUES

🔴 **CRITICAL:**
1. Blockchain sync is synchronous - blocks event creation if blockchain is slow
2. No retry logic for blockchain failures - status marked as 'failed' permanently
3. `getSoldTicketCount()` queries tickets table - should call ticket-service API instead

⚠️ **HIGH:**
1. Venue service calls have no visible timeout/circuit breaker configuration
2. Duplicate check queries could be expensive on large datasets

🟡 **MEDIUM:**
1. State transition map duplicated in service and state-machine
2. Cache is never read, only invalidated (inefficient)
3. No metrics for venue-service call failures
4. Blockchain event ID generation could collide (uses first 8 hex chars of UUID)

---

### 2. event-state-machine.ts (466 lines)

**Purpose:** Pure state machine logic for event lifecycle management

#### DATABASE OPERATIONS
**None** - Pure logic service, no database access

#### EXTERNAL SERVICE CALLS
**None** - Pure logic service

#### CACHING
**None**

#### STATE MANAGEMENT

**State Definitions:** 12 total states
- DRAFT, REVIEW, APPROVED, PUBLISHED
- ON_SALE, SALES_PAUSED, SOLD_OUT
- IN_PROGRESS, COMPLETED
- CANCELLED, POSTPONED, RESCHEDULED

**Terminal States:** COMPLETED, CANCELLED (no further transitions allowed)

**Transition Guards:**
- `isTerminal()` - Check if state is terminal
- `canSellTickets()` - Returns true only for ON_SALE
- `canModify()` - False if tickets sold or not in modification-allowed states
- `canDelete()` - False if tickets sold or not in deletion-allowed states

**Transition Map:**
```typescript
DRAFT → [SUBMIT_FOR_REVIEW, PUBLISH, CANCEL]
REVIEW → [APPROVE, REJECT, CANCEL]
APPROVED → [PUBLISH, CANCEL]
PUBLISHED → [START_SALES, CANCEL, POSTPONE]
ON_SALE → [PAUSE_SALES, SOLD_OUT, START_EVENT, CANCEL, POSTPONE]
SALES_PAUSED → [RESUME_SALES, START_EVENT, CANCEL, POSTPONE]
SOLD_OUT → [START_EVENT, CANCEL, POSTPONE]
IN_PROGRESS → [END_EVENT, CANCEL]
COMPLETED → [] (terminal)
CANCELLED → [] (terminal)
POSTPONED → [RESCHEDULE, CANCEL]
RESCHEDULED → [PUBLISH, START_SALES, CANCEL]
```

**State Change Metadata:** ✅ IMPLEMENTED
- `statusReason` - Human-readable explanation
- `statusChangedBy` - User ID or 'system'
- `statusChangedAt` - Timestamp

**Side Effects:**
- ✅ Metadata tracking on every transition
- 🟡 `notifyTicketHoldersOfModification()` is placeholder (TODO)

**States Requiring Notification:**
- RESCHEDULED
- POSTPONED
- CANCELLED

#### TENANT ISOLATION
N/A - No database access

#### BUSINESS LOGIC

**Class Architecture:**
- `EventStateMachine` - Stateful instance with context
- `validateTransition()` - Stateless validation function
- `areSalesBlocked()` - Check if sales allowed in given state
- `createEventStateMachine()` - Factory function

**Admin Override:**
- ✅ `forceState()` - Bypass transition rules (logs warning)

**Error Strategy:**
- Returns `TransitionResult` object with `success: boolean`
- No exceptions thrown - returns error messages in result

#### ERROR HANDLING

**Return-Based Errors:**
```typescript
interface TransitionResult {
  success: boolean;
  previousState: EventState;
  currentState: EventState;
  error?: string;
  reason?: string;
  changedBy?: string;
  changedAt?: Date;
}
```

No exceptions thrown - graceful error returns

#### CONCURRENCY
N/A - Stateless validation logic

#### POTENTIAL ISSUES

🟡 **MEDIUM:**
1. `notifyTicketHoldersOfModification()` is TODO placeholder - not implemented
2. XState integration is commented out - if planning to use, should implement
3. No database persistence of state metadata (reason, changedBy, changedAt)

🟢 **LOW:**
- Clean separation of concerns
- Well-documented state transitions
- Good metadata tracking structure

---

### 3. event-content.service.ts (115 lines) ✅ FIXED

**Purpose:** Manages event content (images, lineup, schedule, performer bios)

#### DATABASE OPERATIONS

**Database:** ⚠️ **MONGODB** (not PostgreSQL like other services)

**Collection:** `event_content`

**Operations:**
- INSERT - `new EventContentModel().save()`
- UPDATE - `findOne()` + modify + `save()`
- DELETE - `findOneAndDelete()`
- SELECT - `find()`, `findOne()`

**Transactions:** ❌ Not supported (MongoDB single document)

🔴 **CRITICAL ISSUE:** Uses MongoDB while all other services use PostgreSQL - data isolation risk

#### EXTERNAL SERVICE CALLS
**None**

#### CACHING
**None** - No Redis usage

🟡 **MEDIUM ISSUE:** No caching despite managing media content (images, videos)

#### STATE MANAGEMENT

**Content Status:**
- `draft` - Default on creation
- `published` - Via `publishContent()`
- `archived` - Via `archiveContent()`

**No state machine** - Simple status flags

#### TENANT ISOLATION

**Status:** ✅ FIXED

**Previous Issues (RESOLVED):**
- ~~❌ No tenantId in queries~~
- ~~❌ No tenant validation~~

**Current Implementation (AFTER FIX):**
- ✅ `validateTenantContext()` validates tenant UUID format
- ✅ All 11 methods now require `tenantId` parameter
- ✅ All MongoDB queries filter by `tenantId`
- ✅ Controller extracts and passes `tenantId` to all service calls

#### BUSINESS LOGIC

**Content Types:**
- `GALLERY` - Multiple images for image gallery
- `LINEUP` - Performer lineup information
- `SCHEDULE` - Event schedule/timeline
- `PERFORMER_BIO` - Individual performer biographies

**Features:**
- Display order management
- Featured content flag
- Primary image designation for galleries
- Version tracking (increments on update)

**Queries:**
- Get by event ID and content type
- Filter by status (draft/published/archived)
- Sort by display order

#### ERROR HANDLING

**Previous:** Generic `Error('Content not found')`
**Current:** Same - no custom error classes

🟡 **MEDIUM ISSUE:** Should use custom error classes like other services

#### CONCURRENCY

- ❌ No transaction support (MongoDB limitation)
- ❌ No row locking
- Version field incremented but not validated (no optimistic locking)

⚠️ **HIGH ISSUE:** Version field not used for optimistic locking - concurrent updates could conflict

#### POTENTIAL ISSUES

🔴 **CRITICAL (PARTIALLY RESOLVED):**
1. ~~No tenant isolation~~ ✅ FIXED
2. Uses MongoDB - data isolated from PostgreSQL events
3. Should belong in file-service or separate content-service - not core event logic

⚠️ **HIGH:**
1. Version field not used for optimistic locking
2. No validation of content schema
3. No error handling for malformed content

🟡 **MEDIUM:**
1. No caching despite media content (images should be cached)
2. No CDN integration for images
3. Should use custom error classes

---

### 4. event-cancellation.service.ts (527 lines)

**Purpose:** Comprehensive event cancellation workflow orchestration

#### DATABASE OPERATIONS

**Tables Touched:**
- `events` - UPDATE (status, cancelled_at, cancelled_by, cancellation_reason)
- `event_capacity` - SELECT, UPDATE (available_capacity, is_active)
- `event_pricing` - SELECT (for ticket breakdown in report)
- `event_cancellation_reports` - INSERT (stores JSON report)
- `event_audit_log` - INSERT

**Operations:**
- UPDATE event to CANCELLED status
- SELECT capacity/pricing for reporting
- INSERT cancellation report
- INSERT audit log

**Transactions:** ❌ NOT USED

🔴 **CRITICAL:** Multi-step workflow not wrapped in transaction - no atomicity

#### EXTERNAL SERVICE CALLS

**Message Queue Events (ALL PLACEHOLDERS):**
| Event Type | Target Service | Purpose | Status |
|------------|---------------|---------|--------|
| `EVENT_CANCELLED_REFUND_REQUEST` | payment-service | Trigger refunds | 🟡 TODO |
| `EVENT_CANCELLED_TICKETS_INVALID` | ticket-service | Invalidate tickets | 🟡 TODO |
| `EVENT_CANCELLED_RESALES_CANCELLED` | marketplace-service | Cancel listings | 🟡 TODO |
| `EVENT_CANCELLED_NOTIFICATION` | notification-service | Notify holders | 🟡 TODO |

⚠️ **HIGH:** All external calls are commented placeholders - not implemented

#### CACHING
**None**

#### STATE MANAGEMENT

**Sets Status:** CANCELLED
**Validation:** ❌ No state machine integration visible

🟡 **MEDIUM:** Should validate transition to CANCELLED using state machine

#### TENANT ISOLATION

**Status:** ✅ ENFORCED
- All queries include `tenant_id` in WHERE clauses

#### BUSINESS LOGIC

**Cancellation Workflow (8 steps):**
1. Update event status to CANCELLED
2. Fetch all tickets (calls ticket-service)
3. Trigger refunds (calls payment-service)
4. Invalidate tickets (calls ticket-service)
5. Cancel resale listings (calls marketplace-service)
6. Notify ticket holders (calls notification-service)
7. Record audit log
8. Generate cancellation report

**Refund Policies:**
- `full` - 100% refund
- `partial` - 50% refund (hardcoded)
- `none` - No refund

**Cancellation Report Includes:**
```typescript
{
  id, eventId, eventName, tenantId,
  cancelledAt, cancelledBy, reason, refundPolicy,
  summary: {
    totalTicketsSold, totalRevenue,
    refundsIssued, refundAmount,
    notificationsSent, resalesCancelled
  },
  ticketBreakdown: [{ tier, quantity, unitPrice, totalValue }],
  timeline: [{ timestamp, action, status, details }],
  errors: []
}
```

**Pre-flight Check:**
- `canCancelEvent()` - Validates event exists and not already cancelled/completed
- Warns if event has started
- Warns if tickets have been sold

**Error Handling:** ✅ GOOD
- Try-catch on each workflow step
- Collects errors in `result.errors[]`
- Continues workflow even if steps fail
- Final status: `completed`, `partial`, or `failed`

#### CONCURRENCY

**Status:** ❌ POOR
- No transaction wrapping
- No locking
- Race conditions possible (e.g., double cancellation)

#### POTENTIAL ISSUES

🔴 **CRITICAL:**
1. **NO TRANSACTION** - Multi-step workflow not atomic
   - Event could be marked CANCELLED but refunds fail
   - No rollback mechanism
   - Inconsistent state possible
2. All external service calls are placeholders - not implemented

⚠️ **HIGH:**
1. `getEventTickets()` returns empty array - needs ticket-service integration
2. No retry logic for failed steps
3. No idempotency - running twice could cause issues
4. Should use distributed transaction pattern (Saga) or event sourcing

🟡 **MEDIUM:**
1. Report stored as JSON blob - not queryable (use JSONB in PostgreSQL)
2. Hardcoded 50% partial refund - should be configurable
3. Timeline tracking is good but errors not retried
4. No circuit breaker for external calls

---

### 5. cancellation.service.ts (109 lines)

**Purpose:** Simple event cancellation with deadline enforcement

#### DATABASE OPERATIONS

**Tables Touched:**
- `events` - SELECT, UPDATE
- `event_schedules` - SELECT (for deadline calculation)
- `audit_logs` - INSERT

**Operations:**
- SELECT event with cancellation deadline
- UPDATE event status to CANCELLED
- INSERT audit log entry

**Transactions:** ✅ YES
- Wraps all operations in `db.transaction()`

#### EXTERNAL SERVICE CALLS
**None** - Returns `trigger_refunds` flag for caller to handle

#### CACHING
**None**

#### STATE MANAGEMENT

**Sets Status:** CANCELLED
**Validation:** ❌ No state machine validation

#### TENANT ISOLATION

**Status:** ✅ ENFORCED
- All queries include `tenant_id`

#### BUSINESS LOGIC

**Cancellation Deadline Logic:**
```typescript
deadlineTime = event_start_time - cancellation_deadline_hours
if (now > deadlineTime && user != event_creator) {
  throw Error('Deadline passed')
}
```

**Creator Bypass:** ✅ Event creator can cancel after deadline

**Permission Check:**
- `validateCancellationPermission()` - Checks if user is event creator

**Return Value:**
```typescript
{
  event_id, status: 'CANCELLED',
  cancelled_at, cancelled_by, cancellation_reason,
  trigger_refunds: boolean,  // Flag for caller
  event_name
}
```

#### ERROR HANDLING

Generic `Error()` - no custom error classes

#### CONCURRENCY

**Status:** ✅ GOOD
- Uses transaction wrapper
- Atomic operation

#### POTENTIAL ISSUES

⚠️ **HIGH:**
1. **DUPLICATE SERVICE** - Overlap with `event-cancellation.service.ts`
   - Which one is canonical?
   - Should be consolidated
2. Returns `trigger_refunds` flag but doesn't actually trigger refunds
3. No state machine integration

🟡 **MEDIUM:**
1. Deadline check allows creator to bypass - may not be desired for all cases
2. Should validate event hasn't already been cancelled
3. Generic error messages

🟢 **COMPARISON WITH event-cancellation.service.ts:**
- ✅ Simpler and cleaner
- ✅ Better transaction handling
- ✅ Good deadline logic
- ❌ Missing comprehensive workflow features
- ❌ No notification/refund triggering

**RECOMMENDATION:** Keep this for deadline validation, use event-cancellation for full workflow

---

### 6. capacity.service.ts (310 lines)

**Purpose:** Event capacity management with reservation system and price locking

#### DATABASE OPERATIONS

**Tables Touched:**
- `event_capacity` (PRIMARY) - Full CRUD
- `event_pricing` - SELECT (for price locking)
- `events` - SELECT (for venue_id lookup)

**Operations:**
- INSERT capacity sections
- UPDATE capacity (total, available, reserved, sold)
- SELECT with aggregation (SUM for totals)
- Atomic updates with SQL expressions

**Transactions:**
- ✅ `reserveCapacity()` uses transaction with `forUpdate()` row locking
- ❌ `releaseExpiredReservations()` not transactional

**Row Locking:** ✅ EXCELLENT
```typescript
await trx('event_capacity')
  .where({ id: capacityId, tenant_id: tenantId })
  .forUpdate()  // PostgreSQL row lock
  .first();
```

#### EXTERNAL SERVICE CALLS

**HTTP Client:**
- `VenueServiceClient.getVenue()` - Get venue max_capacity
- Used in `validateVenueCapacity()`
- Has try-catch to skip validation on error

#### CACHING
**None** - No Redis usage

🟡 **MEDIUM:** Capacity queries could benefit from short-term caching

#### STATE MANAGEMENT
**None** - Focuses on capacity tracking only

#### TENANT ISOLATION

**Status:** ✅ ENFORCED
- All queries include `tenant_id` in WHERE clauses

#### BUSINESS LOGIC

**Capacity Operations:**

1. **Reserve Capacity** (with row locking)
   ```typescript
   available_capacity -= quantity
   reserved_capacity += quantity
   reserved_expires_at = now + 15 minutes
   locked_price_data = pricing snapshot
   ```

2. **Release Reservation**
   ```typescript
   available_capacity += quantity
   reserved_capacity -= quantity
   clear expiration and price lock
   ```

3. **Confirm Reservation** (convert to sold)
   ```typescript
   reserved_capacity -= quantity
   sold_count += quantity
   clear expiration and price lock
   ```

4. **Release Expired** (batch job)
   - Finds reservations past expiration
   - Returns capacity to available pool

**Price Locking:** ✅ IMPLEMENTED
- Locks current price when capacity reserved
- Stores: `locked_price`, `service_fee`, `facility_fee`, `tax_rate`
- Expires with reservation (15 min default)
- Protects against dynamic price changes during checkout

**Venue Capacity Validation:**
- ✅ Checks total doesn't exceed venue max_capacity
- ✅ Skips validation if venue client not configured
- ✅ Graceful fallback on venue service errors

**Decimal Parsing:**
- Helper function to parse string decimals to numbers
- 🟡 Suggests database decimal type configuration issue

#### ERROR HANDLING

- `NotFoundError('Capacity section')`
- `ValidationError` for capacity/quantity validation

#### CONCURRENCY

**Status:** 🟢 EXCELLENT

**Race Condition Prevention:**
1. Start transaction
2. Lock row with `forUpdate()`
3. Check availability after lock acquired
4. Atomic update with SQL expressions: `available_capacity - ?`
5. Commit transaction

**Atomic Updates:**
```typescript
available_capacity: trx.raw('available_capacity - ?', [quantity])
reserved_capacity: trx.raw('COALESCE(reserved_capacity, 0) + ?', [quantity])
```

#### POTENTIAL ISSUES

🟡 **MEDIUM:**
1. `releaseExpiredReservations()` not wrapped in transaction - could partially fail
2. No metrics on reservation success/failure rates
3. Decimal parsing helper needed - suggests data type configuration issue
4. No capacity change audit trail

🟢 **LOW:**
- Excellent concurrency control with row locking
- Good separation of concerns
- Graceful degradation when venue service unavailable
- Price locking well-implemented

---

### 7. pricing.service.ts (186 lines)

**Purpose:** Event pricing tier management and calculations

#### DATABASE OPERATIONS

**Tables Touched:**
- `event_pricing` (PRIMARY) - Full CRUD

**Operations:**
- INSERT pricing tiers
- UPDATE pricing (base_price, current_price, fees)
- SELECT with time-based filters
- Price calculations (in-memory, not DB)

**Transactions:** ❌ Not used (single-table operations)

#### EXTERNAL SERVICE CALLS
**None**

#### CACHING
**None** - Pricing changes not cached

🟡 **MEDIUM:** Active pricing queries could be cached

#### STATE MANAGEMENT
**None** - Simple CRUD

#### TENANT ISOLATION

**Status:** ✅ ENFORCED
- All queries include `tenant_id`

#### BUSINESS LOGIC

**Pricing Features:**
- Base price + dynamic pricing
- Service fees (per ticket)
- Facility fees (per ticket)
- Tax calculation (percentage)
- Early bird pricing (time-based)
- Last minute pricing (time-based)
- Min/max price constraints
- Group discounts (stored, not applied)
- Member discounts (stored, not applied)

**Price Calculation:**
```typescript
base_total = unit_price × quantity
service_fee = fee_per_ticket × quantity
facility_fee = fee_per_ticket × quantity
subtotal = base + service + facility
tax = subtotal × tax_rate
total = subtotal + tax
```

**Dynamic Pricing:**
- ✅ Validates against min/max bounds
- ✅ Only updates if `is_dynamic = true`
- Updates `current_price` field

**Time-based Pricing:**
- `applyEarlyBirdPricing()` - Sets current_price to early_bird_price
- `applyLastMinutePricing()` - Sets current_price to last_minute_price
- 🟡 **Must be called by scheduled job** - not automatic

**Active Pricing Query:**
- Filters: `is_active = true`, `is_visible = true`
- Time windows: `sales_start_at <= now`, `sales_end_at >= now`

**Decimal Parsing:**
- Helper to parse string decimals to numbers
- 🟡 Same issue as capacity.service.ts - data type config

#### ERROR HANDLING

- `NotFoundError('Pricing')`
- `ValidationError` for price validation (negative prices, min > max)

#### CONCURRENCY

**Status:** ❌ POOR
- No locking on price updates
- Concurrent price updates could conflict
- No version field or optimistic locking

⚠️ **HIGH:** Race conditions possible with concurrent dynamic pricing updates

#### POTENTIAL ISSUES

⚠️ **HIGH:**
1. **No transaction locking** - Concurrent price updates could conflict
2. **Time-based pricing requires external scheduler** - Not documented
   - Who calls `applyEarlyBirdPricing()`?
   - How often?
   - No cron job documented

🟡 **MEDIUM:**
1. Decimal parsing helper needed (data type issue)
2. No price change audit trail
3. No notification when prices change (should notify customers with reservations)
4. Group/member discounts stored but not applied automatically
5. No caching - queries repeated frequently

🟢 **LOW:**
- Clean calculation logic
- Good validation rules
- Clear separation of base vs current price

---

## CROSS-SERVICE DEPENDENCIES

### Services Called BY Event-Service

| External Service | Methods Used | Purpose | Error Handling |
|-----------------|--------------|---------|----------------|
| **venue-service** | `validateVenueAccess()` | Permission check | Throws - blocks operation |
| **venue-service** | `getVenue()` | Get venue details | Throws - blocks operation |
| **blockchain-service** | `createEventOnChain()` | Sync event to blockchain | Try-catch - sets status |
| **search-service** | `publishSearchSync()` | Index events for search | Fire-and-forget |
| **payment-service** | Refund trigger (TODO) | Process refunds | Placeholder |
| **ticket-service** | Get tickets (TODO) | Fetch ticket data | Placeholder |
| **marketplace-service** | Cancel resales (TODO) | Cancel listings | Placeholder |
| **notification-service** | Send notifications (TODO) | Notify users | Placeholder |

### Service Boundary Compliance

✅ **Correctly Owned by Event-Service:**
- Event CRUD operations
- Event metadata and configuration
- Event status/lifecycle management
- Event scheduling
- Event capacity management
- Event pricing tiers
- Event cancellation logic

🔴 **SHOULD BE IN OTHER SERVICES:**

1. **event-content.service.ts → file-service or content-service**
   - Uses MongoDB (data isolation from PostgreSQL)
   - Manages media content (images, videos)
   - Should be separate microservice

2. **Ticket counting in event.service.ts → ticket-service**
   - `getSoldTicketCount()` queries tickets table
   - Should call ticket-service API instead

3. **Blockchain operations → blockchain-service**
   - Synchronous blockchain calls block event creation
   - Should be async via message queue

---

## INTEGRATION TEST FILE MAPPING

### High Priority Tests

| Service File | Test File | Priority | Key Scenarios |
|-------------|-----------|----------|---------------|
| `event.service.ts` | `event-crud.integration.test.ts` | 🔴 HIGH | Create/update/delete with transactions, optimistic locking, venue validation |
| `event-state-machine.ts` | `event-state-transitions.integration.test.ts` | 🔴 HIGH | All valid transitions, invalid transitions blocked, terminal states enforced |
| `capacity.service.ts` | `capacity-reservations.integration.test.ts` | 🔴 HIGH | Concurrent reservations with row locking, price locking, expired cleanup |
| `event-cancellation.service.ts` | `event-cancellation-workflow.integration.test.ts` | ⚠️ HIGH | Multi-step workflow, partial failures, report generation |
| `cancellation.service.ts` | `cancellation-deadline.integration.test.ts` | ⚠️ HIGH | Deadline enforcement, creator bypass |

### Medium Priority Tests

| Service File | Test File | Priority | Key Scenarios |
|-------------|-----------|----------|---------------|
| `event-content.service.ts` | `event-content-tenant-isolation.integration.test.ts` | 🟡 MEDIUM | Tenant isolation, MongoDB queries, content types |
| `pricing.service.ts` | `pricing-calculations.integration.test.ts` | 🟡 MEDIUM | Price calculations, dynamic pricing, time-based pricing |
| `event.service.ts` | `event-blockchain-sync.integration.test.ts` | 🟡 MEDIUM | Blockchain sync failures, retry logic, status tracking |

### Test Scenarios by Category

#### State Management Tests
- ✅ Valid state transitions (all 13 transitions)
- ✅ Invalid transitions throw errors
- ✅ Terminal states cannot transition
- ✅ Sales blocked in non-ON_SALE states
- ✅ Modifications blocked after tickets sold
- ✅ State metadata tracking (reason, changedBy, changedAt)

#### Concurrency Tests
- ✅ Concurrent event updates (optimistic locking)
- ✅ Concurrent capacity reservations (row locking)
- ✅ Version mismatch detection
- ✅ Expired reservation cleanup doesn't conflict with new reservations

#### Tenant Isolation Tests
- ✅ All queries filter by tenantId
- ✅ Cross-tenant access blocked (event-content.service.ts especially)
- ✅ UUID validation for tenantId

#### Transaction Tests
- ✅ Event creation rolls back on failure
- ✅ Event update audit log atomicity
- ✅ Capacity reservation atomicity

#### External Service Tests
- ✅ Venue service timeout handling
- ✅ Blockchain sync failure recovery
- ✅ Search sync failures don't block operations
- ✅ Graceful degradation when venue service unavailable

---

## REMAINING CONCERNS

### 🔴 CRITICAL Priority

1. **Duplicate Cancellation Services**
   - `event-cancellation.service.ts` vs `cancellation.service.ts`
   - **Recommendation:** Consolidate or clarify ownership
   - Use `cancellation.service.ts` for deadline validation
   - Use `event-cancellation.service.ts` for full workflow

2. **Event-Cancellation Service Has No Transaction**
   - Multi-step workflow not atomic
   - **Recommendation:** Implement Saga pattern or event sourcing
   - Consider distributed transaction coordinator

3. **Event-Content Service Uses MongoDB**
   - Data isolated from PostgreSQL events
   - No tenant isolation (FIXED)
   - **Recommendation:** Move to file-service or separate content-service

4. **Blockchain Sync is Synchronous**
   - Blocks event creation
   - **Recommendation:** Make async via message queue
   - Implement retry with exponential backoff

### ⚠️ HIGH Priority

5. **getSoldTicketCount Queries Tickets Table**
   - Should call ticket-service API
   - **Recommendation:** Implement HTTP client for ticket-service

6. **No Circuit Breaker for Venue Service**
   - **Recommendation:** Add circuit breaker pattern (e.g., Hystrix-like)

7. **Pricing Service Concurrency Issues**
   - No locking on price updates
   - **Recommendation:** Add optimistic locking with version field

8. **Time-based Pricing Requires Scheduler**
   - Not documented
   - **Recommendation:** Document cron job requirements

9. **Event-Cancellation External Calls are Placeholders**
   - Refunds, notifications, etc. not implemented
   - **Recommendation:** Implement message queue integration

### 🟡 MEDIUM Priority

10. **State Transition Map Duplicated**
    - In both event.service.ts and state-machine.ts
    - **Recommendation:** Use only state-machine.ts version

11. **Cache Only Invalidated, Never Read**
    - Inefficient
    - **Recommendation:** Implement cache-aside pattern

12. **No Price Change Audit Trail**
    - **Recommendation:** Add audit logging for pricing changes

13. **Decimal Parsing Helpers Needed**
    - Suggests PostgreSQL decimal type configuration issue
    - **Recommendation:** Review column types (use NUMERIC instead of VARCHAR)

14. **Event-Content Has No Caching**
    - Media content should be cached
    - **Recommendation:** Add Redis caching for published content

15. **ReleaseExpiredReservations Not Transactional**
    - Could partially fail
    - **Recommendation:** Wrap in transaction

---

## TESTING CHECKLIST

### Must Test (P0)
- [ ] State machine all valid transitions
- [ ] State machine invalid transitions throw errors
- [ ] Optimistic locking version conflicts
- [ ] Capacity reservation row locking (concurrent tests)
- [ ] Capacity price locking during reservation
- [ ] Tenant isolation enforcement (all services)
- [ ] Event creation transaction rollback on failure
- [ ] Cancellation deadline enforcement

### Should Test (P1)
- [ ] Blockchain sync failure handling
- [ ] Venue service timeout/circuit breaker
- [ ] Cache invalidation on all operations
- [ ] Expired reservation cleanup
- [ ] Duplicate event detection
- [ ] Dynamic pricing min/max constraints
- [ ] Time-based pricing application

### Nice to Test (P2)
- [ ] Search service sync (fire-and-forget)
- [ ] Venue capacity validation
- [ ] Timezone validation
- [ ] Soft delete enforcement
- [ ] Audit log creation

---

## NOTES FOR IMPLEMENTATION

1. **Focus on High-Risk Areas First:**
   - Concurrency (capacity reservations)
   - State transitions
   - Transaction atomicity
   - Tenant isolation

2. **Use Test Fixtures:**
   - Create reusable event factory
   - Mock venue-service responses
   - Mock blockchain-service responses

3. **Database Considerations:**
   - Run tests against real PostgreSQL (not SQLite)
   - Use database transactions to rollback test data
   - Test MongoDB separately for event-content

4. **Mock External Services:**
   - Mock VenueServiceClient
   - Mock EventBlockchainService
   - Mock message queue (RabbitMQ)

5. **Performance Tests:**
   - Load test capacity reservations
   - Test expired reservation cleanup with large datasets
   - Test duplicate event detection performance

---

**End of Analysis**
