# Event-Service Architecture Map

## Table of Contents
1. [Major Workflows](#1-major-workflows)
2. [File Dependency Graph](#2-file-dependency-graph)
3. [Database Touch Points](#3-database-touch-points)
4. [Critical Business Logic](#4-critical-business-logic)
5. [External Dependencies](#5-external-dependencies)

---

## 1. Major Workflows

### Workflow: Create Event

**Entry Point:** `POST /events`

**Flow:**
1. `src/routes/events.routes.ts:86-200` → Route with schema validation
2. `src/middleware/auth.ts:authenticateFastify()` → JWT verification
3. `src/middleware/tenant.ts:tenantHook()` → Tenant validation + RLS context
4. `src/middleware/idempotency.middleware.ts:idempotencyPreHandler()` → Duplicate request prevention
5. `src/controllers/events.controller.ts:createEvent()` (line 33-68)
6. `src/services/event.service.ts:createEvent()` (lines 166-398)
   - Validates venue exists via `venueServiceClient.venueExists()`
   - Validates timezone via `validateTimezoneOrThrow()`
   - Validates event dates (ends_at > starts_at, doors_open <= starts_at)
   - Validates blockchain percentages (artist + venue <= 100%)
   - Validates virtual event requirements
   - Checks for duplicate events at same venue/date
   - **TRANSACTION:** Creates event, metadata, schedule, capacity
   - Queues async blockchain sync via RabbitMQ
   - Clears Redis cache
   - Publishes `event.created` to search service and RabbitMQ
7. `src/serializers/event.serializer.ts` → Sanitizes response

**Files Involved:**
- `src/routes/events.routes.ts`
- `src/middleware/auth.ts`
- `src/middleware/tenant.ts`
- `src/middleware/idempotency.middleware.ts`
- `src/controllers/events.controller.ts`
- `src/services/event.service.ts`
- `src/models/event.model.ts`
- `src/models/event-schedule.model.ts`
- `src/models/event-capacity.model.ts`
- `src/models/event-metadata.model.ts`
- `src/config/rabbitmq.ts`
- `src/serializers/event.serializer.ts`

**Database Operations (within transaction):**
```
Line 303: INSERT into events (via eventModelTrx.createWithDefaults)
Line 305-311: INSERT into event_metadata
Line 315-319: INSERT into event_schedules (if schedule data provided)
Line 324-329: INSERT into event_capacity (if capacity provided)
Line 332: INSERT into event_audit_log (via auditLogger.logEventAction)
```

**Critical Logic:**
- Venue validation via external service call
- Slug uniqueness check (ON CONFLICT handles race conditions)
- Date validation (ends_at > starts_at)
- Blockchain percentage validation (artist + venue <= 100%)
- Virtual event URL requirement when is_virtual=true
- Tenant ID injection for RLS

---

### Workflow: Update Event

**Entry Point:** `PUT /events/:id`

**Flow:**
1. `src/routes/events.routes.ts:203-258` → Route with schema validation
2. Auth + Tenant middleware
3. `src/controllers/events.controller.ts:updateEvent()` (lines 106-135)
4. `src/services/event.service.ts:updateEvent()` (lines 577-725)
   - Validates event exists and user has permission
   - Validates venue access
   - Gets sold ticket count (respects service boundary)
   - Validates modification allowed based on sold tickets
   - Validates state transition if status changing
   - **TRANSACTION with optimistic locking:**
     - Updates event with version increment
     - Logs update to audit table
   - Clears Redis cache
   - Publishes `event.updated`

**Database Operations:**
```
Line 586-589: SELECT from events (fetch existing)
Line 602: SELECT via venueServiceClient (external call)
Line 610-612: SELECT from event_schedules
Line 662-679: UPDATE events with version check (optimistic locking)
Line 681-684: INSERT into event_audit_log
```

**Critical Logic:**
- Optimistic locking via version column
- Critical fields blocked after ticket sales (venue_id, starts_at, ends_at, etc.)
- State machine transition validation
- Admin override capability for blocked changes

---

### Workflow: Delete Event (Soft Delete)

**Entry Point:** `DELETE /events/:id`

**Flow:**
1. `src/routes/events.routes.ts:261-280` → Route
2. Auth + Tenant middleware
3. `src/controllers/events.controller.ts:deleteEvent()` (lines 137-155)
4. `src/services/event.service.ts:deleteEvent()` (lines 727-806)
   - Validates event exists and user has permission
   - Validates venue access
   - Gets sold ticket count
   - **Blocks deletion if tickets sold** (unless admin override)
   - **TRANSACTION:**
     - Soft deletes event (sets deleted_at, status=CANCELLED)
     - Logs deletion to audit
   - Clears Redis cache
   - Publishes `event.deleted`

**Database Operations:**
```
Line 736-739: SELECT from events
Line 752-755: SELECT via venueServiceClient
Line 759-762: SELECT from event_schedules
Line 777-782: UPDATE events SET deleted_at, status='CANCELLED'
Line 784-787: INSERT into event_audit_log
```

**Critical Logic:**
- Cannot delete event with sold tickets (without admin override)
- Cannot delete event that has already started
- Cannot delete completed event

---

### Workflow: Publish Event

**Entry Point:** `POST /events/:id/publish`

**Flow:**
1. `src/routes/events.routes.ts:283-303` → Route
2. Auth + Tenant middleware
3. `src/controllers/events.controller.ts:publishEvent()` (lines 157-175)
4. `src/services/event.service.ts:publishEvent()` (lines 808-841)
   - Validates event exists
   - Updates status to PUBLISHED
   - Publishes `event.published`

**Database Operations:**
```
Line 809-812: SELECT from events
Line 818-824: UPDATE events SET status='PUBLISHED'
```

---

### Workflow: Event Cancellation

**Entry Point:** `POST /events/:id/cancel` (via cancellation.routes.ts)

**Flow:**
1. `src/routes/cancellation.routes.ts` → Route
2. Auth + Tenant middleware
3. `src/controllers/cancellation.controller.ts`
4. `src/services/event-cancellation.service.ts:cancelEvent()` (lines 83-238)
   - **TRANSACTION:**
     - Updates event status to CANCELLED
     - Invalidates all tickets (via ticket-service call)
     - Records cancellation audit log
     - Generates cancellation report
   - **Post-transaction (external calls):**
     - Triggers refunds (via payment-service)
     - Cancels resale listings (via marketplace-service)
     - Notifies ticket holders (via notification-service)
   - Publishes `event.cancelled` to RabbitMQ

**Files Involved:**
- `src/routes/cancellation.routes.ts`
- `src/controllers/cancellation.controller.ts`
- `src/services/event-cancellation.service.ts`

**Database Operations (within transaction):**
```
Line 362-371: UPDATE events SET status='CANCELLED', cancelled_at, cancellation_reason
Line 518-524: UPDATE event_capacity SET available_capacity=0, is_active=false
Line 674-692: INSERT into event_audit_log
Line 308-314: INSERT into event_cancellation_reports (report storage)
```

**External Service Calls (post-transaction):**
```
Line 389-403: ticketServiceClient.getTicketsByEvent() - Get all tickets
Line 439-456: paymentServiceClient.processBulkRefunds() - Trigger refunds
Line 488-508: ticketServiceClient.cancelTicketsBatch() - Invalidate tickets
Line 547-561: marketplaceServiceClient.cancelEventListings() - Cancel resales
Line 635-646: notificationServiceClient.sendBatchNotification() - Notify holders
```

**Critical Logic:**
- Entire local workflow wrapped in transaction
- External service calls happen AFTER transaction commits
- Partial failure tracking (status can be 'partial')
- Generates detailed cancellation report

---

### Workflow: Capacity Management

**Entry Point:** `POST /events/:eventId/capacity` (create section)

**Flow:**
1. `src/routes/capacity.routes.ts`
2. Auth + Tenant middleware
3. `src/controllers/capacity.controller.ts:createCapacity()` (lines 75-102)
4. `src/services/capacity.service.ts:createCapacity()` (lines 154-198)
   - Validates required fields
   - Validates capacity is non-negative
   - Validates venue capacity limit (via venueServiceClient)
   - Validates capacity math (available + reserved + sold <= total)
   - Validates purchase limits (min <= max)
   - Validates row configuration math (if provided)
   - Inserts capacity record

**Database Operations:**
```
Line 169: SELECT via venueServiceClient (external call)
Line 191-194: INSERT into event_capacity
```

---

### Workflow: Reserve Capacity (Ticket Hold)

**Entry Point:** `POST /capacity/:id/reserve`

**Flow:**
1. `src/routes/capacity.routes.ts`
2. Auth + Tenant middleware
3. `src/controllers/capacity.controller.ts:reserveCapacity()` (lines 154-201)
4. `src/services/capacity.service.ts:reserveCapacity()` (lines 243-338)
   - Validates quantity > 0
   - **TRANSACTION with FOR UPDATE (row lock):**
     - Locks capacity row
     - Validates available >= quantity
     - Calculates reservation expiry
     - Locks pricing if pricing_id provided
     - Updates capacity: available -= qty, reserved += qty

**Database Operations:**
```
Line 259-262: SELECT from event_capacity FOR UPDATE (row lock)
Line 280-289: SELECT from event_pricing (price lock)
Line 312-322: UPDATE event_capacity (atomic capacity adjustment)
```

**Critical Logic:**
- FOR UPDATE row locking prevents overselling
- Locked price data stored for checkout
- Reservation expiry tracked for cleanup

---

### Workflow: Release Expired Reservations

**Entry Point:** Background job / scheduled task

**Flow:**
1. `src/services/capacity.service.ts:releaseExpiredReservations()` (lines 380-422)
   - **TRANSACTION with FOR UPDATE:**
     - Finds all expired reservations
     - Releases reserved capacity back to available
     - Clears locked price data

**Database Operations:**
```
Line 386-391: SELECT from event_capacity WHERE reserved_expires_at <= NOW() FOR UPDATE
Line 400-410: UPDATE event_capacity SET available += reserved, reserved = 0
```

---

### Workflow: Pricing Management

**Entry Point:** `POST /events/:eventId/pricing`

**Flow:**
1. `src/routes/pricing.routes.ts`
2. Auth + Tenant middleware
3. `src/controllers/pricing.controller.ts:createPricing()` (lines 48-77)
4. `src/services/pricing.service.ts:createPricing()` (lines 239-272)
   - Validates base_price >= 0
   - Validates pricing dates (sales_end > sales_start)
   - Validates price ranges (min <= base <= max for dynamic)
   - Validates dynamic pricing requirements
   - Validates group discount configuration
   - Inserts pricing with version=1

**Database Operations:**
```
Line 265-267: INSERT into event_pricing
```

---

### Workflow: Update Dynamic Price

**Entry Point:** `PUT /pricing/:id/dynamic`

**Flow:**
1. `src/routes/pricing.routes.ts`
2. Auth + Tenant middleware
3. `src/controllers/pricing.controller.ts`
4. `src/services/pricing.service.ts:updateDynamicPrice()` (lines 377-442)
   - **TRANSACTION with FOR UPDATE (row lock):**
     - Validates pricing is dynamic
     - Validates new price within min/max bounds
     - Updates current_price with version increment

**Database Operations:**
```
Line 386-389: SELECT from event_pricing FOR UPDATE
Line 424-430: UPDATE event_pricing SET current_price, version++
```

---

### Workflow: Event State Transitions

**State Machine Location:** `src/services/event-state-machine.ts`

**Valid States:**
- DRAFT → REVIEW, PUBLISHED, CANCELLED
- REVIEW → APPROVED, DRAFT (reject), CANCELLED
- APPROVED → PUBLISHED, CANCELLED
- PUBLISHED → ON_SALE, CANCELLED, POSTPONED
- ON_SALE → SALES_PAUSED, SOLD_OUT, IN_PROGRESS, CANCELLED, POSTPONED
- SALES_PAUSED → ON_SALE, IN_PROGRESS, CANCELLED, POSTPONED
- SOLD_OUT → IN_PROGRESS, CANCELLED, POSTPONED
- IN_PROGRESS → COMPLETED, CANCELLED
- COMPLETED → (terminal)
- CANCELLED → (terminal)
- POSTPONED → RESCHEDULED, CANCELLED
- RESCHEDULED → PUBLISHED, ON_SALE, CANCELLED

**Terminal States:** COMPLETED, CANCELLED

**Sales Allowed States:** ON_SALE only

**Modification Allowed States:** DRAFT, REVIEW, APPROVED, PUBLISHED

**Deletion Allowed States:** DRAFT, CANCELLED

---

## 2. File Dependency Graph

```
Entry Points
├── src/index.ts
│   └── src/app.ts
│       └── src/routes/index.ts
│           ├── events.routes.ts
│           ├── capacity.routes.ts
│           ├── pricing.routes.ts
│           ├── schedules.routes.ts
│           ├── cancellation.routes.ts
│           ├── tickets.routes.ts
│           ├── internal.routes.ts
│           └── health.routes.ts

Controllers (Request Handlers)
├── events.controller.ts
│   └── calls → EventService
├── capacity.controller.ts
│   └── calls → CapacityService
├── pricing.controller.ts
│   └── calls → PricingService
├── cancellation.controller.ts
│   └── calls → EventCancellationService
├── schedule.controller.ts
├── tickets.controller.ts
└── customer-analytics.controller.ts

Services (Business Logic)
├── event.service.ts
│   ├── uses → EventModel
│   ├── uses → EventScheduleModel
│   ├── uses → EventCapacityModel
│   ├── uses → EventMetadataModel
│   ├── uses → EventSecurityValidator
│   ├── uses → EventAuditLogger
│   ├── uses → EventBlockchainService
│   ├── uses → EventLifecyclePublisher (RabbitMQ)
│   └── calls → venueServiceClient (external)
│
├── capacity.service.ts
│   ├── uses → EventCapacityModel
│   └── calls → venueServiceClient (external)
│
├── pricing.service.ts
│   └── uses → EventPricingModel
│
├── event-cancellation.service.ts
│   ├── uses → EventLifecyclePublisher (RabbitMQ)
│   ├── calls → ticketServiceClient (external)
│   ├── calls → paymentServiceClient (external)
│   ├── calls → marketplaceServiceClient (external)
│   └── calls → notificationServiceClient (external)
│
├── event-state-machine.ts
│   ├── calls → ticketServiceClient (external)
│   └── calls → notificationServiceClient (external)
│
└── blockchain.service.ts

Models (Database Access)
├── base.model.ts
├── event.model.ts
│   └── table: events
├── event-schedule.model.ts
│   └── table: event_schedules
├── event-capacity.model.ts
│   └── table: event_capacity
├── event-pricing.model.ts
│   └── table: event_pricing
├── event-metadata.model.ts
│   └── table: event_metadata
└── event-category.model.ts
    └── table: event_categories

Middleware
├── auth.ts
│   └── JWT verification with RSA
├── tenant.ts
│   └── RLS context setting
├── idempotency.middleware.ts
├── rate-limit.ts
├── error-handler.ts
└── internal-auth.middleware.ts
    └── HMAC-based S2S auth

Config
├── database.ts → PostgreSQL (Knex)
├── redis.ts → Redis (ioredis)
├── rabbitmq.ts → RabbitMQ (amqplib)
├── mongodb.ts → MongoDB (mongoose)
├── dependencies.ts → Awilix DI container
└── service-auth.ts → S2S auth config
```

---

## 3. Database Touch Points

### Table: `events`

| File | Line | Operation | Description |
|------|------|-----------|-------------|
| event.service.ts | 303 | INSERT | Create new event |
| event.service.ts | 517-520 | SELECT | Get event by ID |
| event.service.ts | 547-559 | SELECT | List events |
| event.service.ts | 586-589 | SELECT | Get event for update |
| event.service.ts | 669-671 | UPDATE | Update event with version check |
| event.service.ts | 777-782 | UPDATE | Soft delete (set deleted_at) |
| event.service.ts | 809-812 | SELECT | Get event for publish |
| event.service.ts | 818-824 | UPDATE | Set status to PUBLISHED |
| event.service.ts | 844-848 | SELECT | Get venue events |
| event.service.ts | 461-466 | UPDATE | Update blockchain status (pending) |
| event.service.ts | 480-485 | UPDATE | Update blockchain status (queued) |
| event.service.ts | 501-507 | UPDATE | Update blockchain status (failed) |
| event.model.ts | 216-222 | INSERT | Create with ON CONFLICT |
| event.model.ts | 282-288 | INSERT | Upsert with ON CONFLICT |
| event.model.ts | 302-309 | UPDATE | Update event |
| event.model.ts | 346-352 | SELECT | Get featured events |
| event.model.ts | 385-421 | SELECT | Search events |
| event.model.ts | 433-435 | UPDATE | Increment view count |
| event-cancellation.service.ts | 362-371 | UPDATE | Set status to CANCELLED |
| event-state-machine.ts | 458-460 | SELECT | Get event for notification |
| internal.routes.ts | 105-126 | SELECT | Internal event lookup |
| internal.routes.ts | 246-264 | SELECT | Internal PDA lookup |
| internal.routes.ts | 389-397 | SELECT | Verify event for blockchain update |
| internal.routes.ts | 419-421 | UPDATE | Update blockchain status |
| internal.routes.ts | 533-546 | SELECT | Internal scan stats lookup |

### Table: `event_schedules`

| File | Line | Operation | Description |
|------|------|-----------|-------------|
| event.service.ts | 315-319 | INSERT | Create schedule for new event |
| event.service.ts | 526-528 | SELECT | Get schedules for event |
| event.service.ts | 610-612 | SELECT | Get schedule for update validation |
| event.service.ts | 759-762 | SELECT | Get schedule for delete validation |
| event.service.ts | 1001-1004 | SELECT | Check duplicate event schedules |

### Table: `event_capacity`

| File | Line | Operation | Description |
|------|------|-----------|-------------|
| event.service.ts | 324-329 | INSERT | Create capacity for new event |
| event.service.ts | 530-531 | SELECT | Get capacities for event |
| event.service.ts | 868-872 | SELECT | Get sold ticket count |
| capacity.service.ts | 135-138 | SELECT | Get event capacity |
| capacity.service.ts | 143-150 | SELECT | Get capacity by ID |
| capacity.service.ts | 191-194 | INSERT | Create capacity section |
| capacity.service.ts | 225-231 | UPDATE | Update capacity |
| capacity.service.ts | 259-262 | SELECT | Reserve capacity (FOR UPDATE) |
| capacity.service.ts | 280-289 | SELECT | Get pricing for lock |
| capacity.service.ts | 312-322 | UPDATE | Apply reservation |
| capacity.service.ts | 341-355 | UPDATE | Release reservation |
| capacity.service.ts | 359-373 | UPDATE | Confirm reservation (sold) |
| capacity.service.ts | 386-391 | SELECT | Find expired reservations (FOR UPDATE) |
| capacity.service.ts | 400-410 | UPDATE | Release expired reservations |
| capacity.service.ts | 430-436 | SELECT | Get total capacity |
| capacity.service.ts | 459 | SELECT | Get event for venue validation |
| event-cancellation.service.ts | 518-524 | UPDATE | Deactivate capacity on cancel |
| event-cancellation.service.ts | 269-270 | SELECT | Get ticket breakdown |
| event-cancellation.service.ts | 724-727 | SELECT | Get sold count for cancel check |

### Table: `event_pricing`

| File | Line | Operation | Description |
|------|------|-----------|-------------|
| pricing.service.ts | 220-224 | SELECT | Get event pricing |
| pricing.service.ts | 228-236 | SELECT | Get pricing by ID |
| pricing.service.ts | 265-267 | INSERT | Create pricing tier |
| pricing.service.ts | 304-307 | SELECT | Get pricing for update (FOR UPDATE) |
| pricing.service.ts | 328-331 | UPDATE | Update pricing with version |
| pricing.service.ts | 386-389 | SELECT | Get dynamic pricing (FOR UPDATE) |
| pricing.service.ts | 424-430 | UPDATE | Update dynamic price |
| pricing.service.ts | 447-458 | SELECT | Get active pricing |
| pricing.service.ts | 482-488 | SELECT | Get early bird pricing |
| pricing.service.ts | 512-517 | SELECT | Get last minute pricing |
| capacity.service.ts | 280-289 | SELECT | Get pricing for price lock |
| event-cancellation.service.ts | 259-265 | SELECT | Get pricing for breakdown |

### Table: `event_metadata`

| File | Line | Operation | Description |
|------|------|-----------|-------------|
| event.service.ts | 305-311 | INSERT | Create metadata for new event |

### Table: `event_categories`

| File | Line | Operation | Description |
|------|------|-----------|-------------|
| event-category.model.ts | various | SELECT | Category lookups |
| Migration | 81-93 | INSERT | Seed default categories |

### Table: `event_audit_log`

| File | Line | Operation | Description |
|------|------|-----------|-------------|
| audit-logger.ts | various | INSERT | Log event actions |
| event.service.ts | 332 | INSERT | Log create |
| event.service.ts | 681-684 | INSERT | Log update |
| event.service.ts | 784-787 | INSERT | Log delete |
| event-cancellation.service.ts | 674-692 | INSERT | Log cancellation |

### Table: `event_cancellation_reports`

| File | Line | Operation | Description |
|------|------|-----------|-------------|
| event-cancellation.service.ts | 308-314 | INSERT | Store cancellation report |
| event-cancellation.service.ts | 335-344 | SELECT | Get cancellation report |

### Table: `tenants` (read-only from event-service)

| File | Line | Operation | Description |
|------|------|-----------|-------------|
| tenant.ts | 94-103 | SELECT | Validate tenant exists and active |

### Table: `idempotency_keys` (for idempotency middleware)

| File | Line | Operation | Description |
|------|------|-----------|-------------|
| idempotency.middleware.ts | various | INSERT/SELECT | Idempotency tracking |

---

## 4. Critical Business Logic

### 4.1 Money Calculations

**Location:** `src/services/pricing.service.ts:339-372`

```typescript
// Price calculation logic
const unitPrice = pricing.current_price || pricing.base_price;
const baseTotal = unitPrice * quantity;
const serviceFee = (pricing.service_fee || 0) * quantity;
const facilityFee = (pricing.facility_fee || 0) * quantity;
const subtotal = baseTotal + serviceFee + facilityFee;
const taxRate = pricing.tax_rate || 0;
const tax = subtotal * taxRate;
const total = subtotal + tax;
```

**Critical Validations:**
- All prices must be >= 0 (database CHECK constraints)
- Tax rate must be between 0 and 1 (0-100%)
- For dynamic pricing: min_price <= base_price <= max_price
- Early bird price < base price
- Group discount percentage between 0-100%
- Blockchain percentages: artist + venue <= 100%

### 4.2 Capacity Tracking

**Location:** `src/services/capacity.service.ts`

**Invariant:** `available + reserved + sold <= total_capacity`

**Critical Operations:**
1. **Reserve:** Atomic decrement available, increment reserved (with row lock)
2. **Confirm:** Move from reserved to sold
3. **Release:** Move from reserved back to available
4. **Cleanup:** Expired reservations automatically released

**Row Locking:** `FOR UPDATE` used in transactions to prevent race conditions

### 4.3 State Machine Transitions

**Location:** `src/services/event-state-machine.ts`

**Critical Rules:**
- COMPLETED and CANCELLED are terminal states (no transitions out)
- Sales only allowed in ON_SALE state
- Modifications only allowed in DRAFT, REVIEW, APPROVED, PUBLISHED
- Deletion only allowed in DRAFT, CANCELLED
- Tickets sold blocks: deletion, returning to DRAFT, critical field changes

### 4.4 Date Validations

**Location:** `src/services/event.service.ts:134-164`

**Rules:**
- `ends_at` must be after `starts_at`
- `doors_open` must be before or at `starts_at`
- Event must be scheduled 2+ hours in advance
- Event cannot be scheduled more than 365 days in advance

### 4.5 Tenant Isolation (RLS)

**Location:** `src/middleware/tenant.ts`

**How it works:**
1. Tenant ID extracted from JWT
2. Tenant validated (exists, active)
3. `SET LOCAL app.current_tenant_id = ?` executed
4. PostgreSQL RLS policies enforce isolation

**Critical:** All tenant tables have RLS enabled with policies checking `app.current_tenant_id`

### 4.6 Optimistic Locking

**Location:** Used in events, schedules, capacity, pricing tables

**How it works:**
1. Each table has `version` column (default 1)
2. Updates include `WHERE version = expected_version`
3. If no rows updated, throw `ConflictError`
4. Trigger auto-increments version on each update

### 4.7 Security Validator

**Location:** `src/validations/event-security.ts`

**Critical Fields After Sales:**
- venue_id
- starts_at
- ends_at
- event_date
- total_capacity
- timezone

**Blocked Actions After Ticket Sales:**
- Deletion (without admin override)
- Changes to critical fields (without admin override)

**Confirmation Flow:**
- Critical changes generate confirmation token
- Token must be provided to proceed
- Token expires in 5 minutes

---

## 5. External Dependencies

### 5.1 Redis

**Usage:**
- Tenant validation cache (5 min TTL)
- Event cache invalidation
- Confirmation token storage
- Job queue backend (Bull)
- Rate limiting

**Key Patterns:**
- `tenant:valid:{tenant_id}` - Cached tenant data
- `venue:events:{venue_id}` - Venue events cache
- `event:{event_id}` - Individual event cache
- `event:confirm:{token}` - Critical change confirmations

### 5.2 RabbitMQ

**Exchanges:**
- `tickettoken_events` (topic) - Main platform events
- `event-lifecycle` (topic) - Event-specific lifecycle

**Events Published:**
| Routing Key | Description | Consumers |
|-------------|-------------|-----------|
| `event.created` | New event created | notification, ticket, analytics, search |
| `event.updated` | Event modified | search, analytics |
| `event.published` | Event published | search, notification |
| `event.cancelled` | Event cancelled | ticket, payment, notification, marketplace |
| `event.deleted` | Event deleted | search |
| `event.reminder` | Event reminder | notification |
| `event.soldout` | Event sold out | notification, analytics |
| `event.rescheduled` | Event rescheduled | notification, ticket |
| `event.capacity.warning` | 80% capacity | notification |
| `event.capacity.critical` | 95% capacity | notification |
| `event.blockchain_sync_requested` | Blockchain sync needed | blockchain-service |

### 5.3 External Service Calls

**venue-service (via venueServiceClient):**
- `venueExists(venueId, ctx)` - Check venue exists and accessible
- `getVenueInternal(venueId, ctx)` - Get venue details including capacity

**ticket-service (via ticketServiceClient):**
- `getTicketsByEvent(eventId, ctx)` - Get all tickets for event
- `cancelTicketsBatch(ticketIds, reason, idempotencyKey, ctx)` - Cancel tickets

**payment-service (via paymentServiceClient):**
- `processBulkRefunds(params, ctx)` - Trigger refunds for cancelled event

**marketplace-service (via marketplaceServiceClient):**
- `cancelEventListings(eventId, tenantId, reason, notifySellers, ctx)` - Cancel resales

**notification-service (via notificationServiceClient):**
- `sendBatchNotification(params, ctx)` - Send batch notifications

**auth-service:**
- `GET /internal/token-status/{jti}` - Check if token revoked

### 5.4 MongoDB

**Usage:** Event content documents (rich text, reviews)

**Collections:**
- Event content (descriptions, FAQs)
- Event reviews

### 5.5 Blockchain (Solana)

**Integration:**
- Events can have blockchain data (event_pda, artist_wallet, percentages)
- Blockchain sync is **async** via RabbitMQ
- `event.blockchain_sync_requested` triggers blockchain-service
- blockchain-service calls back via `PUT /internal/events/{eventId}/blockchain-status`

---

## Database Schema Summary

### Main Tables (with RLS)

```sql
-- 1. events (main event table)
id, tenant_id, venue_id, name, slug, description, status, event_type,
starts_at, ends_at, doors_open, timezone, capacity, is_virtual,
artist_wallet, artist_percentage, venue_percentage, event_pda,
blockchain_status, version, created_at, updated_at, deleted_at

-- 2. event_schedules
id, tenant_id, event_id, starts_at, ends_at, doors_open_at, timezone,
status, is_recurring, recurrence_rule, version

-- 3. event_capacity
id, tenant_id, event_id, schedule_id, section_name, total_capacity,
available_capacity, reserved_capacity, sold_count, pending_count,
reserved_at, reserved_expires_at, locked_price_data, version

-- 4. event_pricing
id, tenant_id, event_id, schedule_id, capacity_id, name, base_price,
current_price, service_fee, facility_fee, tax_rate, is_dynamic,
min_price, max_price, early_bird_price, sales_start_at, sales_end_at, version

-- 5. event_metadata
id, tenant_id, event_id, performers, headliner, supporting_acts,
production_company, sponsors, custom_fields

-- 6. event_categories (GLOBAL - no tenant_id, no RLS)
id, name, slug, description, parent_id, is_active
```

### Key Indexes

- `idx_events_tenant_id` - Tenant isolation
- `idx_events_venue_status` - Venue + status queries
- `idx_events_tenant_status` - Tenant + status queries
- `idx_events_search` - Full-text search (GIN)
- `idx_events_venue_slug` - Unique constraint (per venue)
- `idx_event_capacity_reserved_expires` - Reservation cleanup

### Constraints

- All prices >= 0
- Tax rate between 0 and 1
- Capacity counts >= 0
- Minimum purchase >= 1
- Status must be valid enum value
- Visibility must be PUBLIC/PRIVATE/UNLISTED
- Event type must be single/recurring/series

---

## Test File Mapping

Each source file has a corresponding test file:

| Source | Test |
|--------|------|
| `src/services/event.service.ts` | `tests/unit/services/event.service.test.ts` |
| `src/services/capacity.service.ts` | `tests/unit/services/capacity.service.test.ts` |
| `src/services/pricing.service.ts` | `tests/unit/services/pricing.service.test.ts` |
| `src/services/event-cancellation.service.ts` | `tests/unit/services/event-cancellation.service.test.ts` |
| `src/services/event-state-machine.ts` | `tests/unit/services/event-state-machine.test.ts` |
| `src/controllers/events.controller.ts` | `tests/unit/controllers/events.controller.test.ts` |
| `src/controllers/capacity.controller.ts` | `tests/unit/controllers/capacity.controller.test.ts` |
| `src/controllers/pricing.controller.ts` | `tests/unit/controllers/pricing.controller.test.ts` |
| `src/models/event.model.ts` | `tests/unit/models/event.model.test.ts` |
| `src/models/event-capacity.model.ts` | `tests/unit/models/event-capacity.model.test.ts` |
| `src/models/event-pricing.model.ts` | `tests/unit/models/event-pricing.model.test.ts` |
| `src/middleware/auth.ts` | `tests/unit/middleware/auth.middleware.test.ts` |
| `src/middleware/tenant.ts` | `tests/unit/middleware/tenant.middleware.test.ts` |
| `src/routes/events.routes.ts` | `tests/unit/routes/events.routes.test.ts` |
