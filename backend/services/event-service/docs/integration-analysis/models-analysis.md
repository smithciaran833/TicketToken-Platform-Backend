# Event Service Models Analysis
## Purpose: Integration Testing Documentation
## Source Files Analyzed:
- `src/models/base.model.ts` (175 lines)
- `src/models/event.model.ts` (450 lines)
- `src/models/event-capacity.model.ts` (95 lines)
- `src/models/event-category.model.ts` (70 lines)
- `src/models/event-metadata.model.ts` (65 lines)
- `src/models/event-pricing.model.ts` (105 lines)
- `src/models/event-schedule.model.ts` (100 lines)
- `src/models/index.ts` (7 lines)
- `src/models/mongodb/event-content.model.ts` (185 lines)

## Generated: January 20, 2026

---

## FILE-BY-FILE ANALYSIS

### 1. base.model.ts (175 lines)

**Purpose:** Abstract base class for all PostgreSQL models providing CRUD operations with soft delete support.

#### DATABASE OPERATIONS

**Tables Touched:** Configurable via `tableName` constructor parameter

**Operations:**
| Method | SQL Operation | Soft Delete Aware |
|--------|---------------|-------------------|
| `findAll()` | SELECT | ✅ `whereNull('deleted_at')` |
| `findOne()` | SELECT | ✅ `whereNull('deleted_at')` |
| `findById()` | SELECT | ✅ `whereNull('deleted_at')` |
| `create()` | INSERT | N/A |
| `update()` | UPDATE | ✅ `whereNull('deleted_at')` |
| `delete()` | UPDATE (soft) | ✅ Sets `deleted_at` |
| `hardDelete()` | DELETE | ❌ Permanent delete |
| `count()` | SELECT COUNT | ✅ `whereNull('deleted_at')` |
| `exists()` | SELECT | ✅ `whereNull('deleted_at')` |

**Column Selection (Audit Fix QS8/DB7):**
- `selectColumns` property for explicit column lists
- `getSelectColumns()` returns columns or `*` as fallback
- Subclasses should override `selectColumns`

**Transactions:** ✅ Accepts `Knex.Transaction` in constructor

#### EXTERNAL SERVICE CALLS
N/A - Data access layer only

#### CACHING
N/A

#### STATE MANAGEMENT
N/A

#### TENANT ISOLATION

**Status:** ⚠️ PARTIAL
- Comment mentions "tenant filter if tenant_id exists in conditions"
- Does NOT automatically add tenant filter
- Relies on caller to pass `tenant_id` in conditions
- No enforcement - caller can omit tenant_id

🟡 **MEDIUM ISSUE:** No automatic tenant enforcement in base model

#### BUSINESS LOGIC

**Soft Delete Pattern:**
- All queries exclude `deleted_at IS NOT NULL` by default
- `delete()` sets `deleted_at = new Date()`
- `findAll()` has `includeDeleted` option to bypass

**Pagination:**
- `limit` and `offset` options in `findAll()`
- No max limit enforcement

#### ERROR HANDLING

**Pattern:** Try-catch with logging
- Logs error with table name context
- Re-throws original error
- No custom error classes

#### CONCURRENCY

**Status:** ❌ NONE
- No optimistic locking in base model
- No row locking
- Subclasses must implement

#### POTENTIAL ISSUES

🟡 **MEDIUM:**
1. No automatic tenant isolation - relies on caller
2. No max limit on `findAll()` - could return unbounded results
3. `hardDelete()` available - could bypass soft delete policy
4. `selectColumns` defaults to `null` (uses SELECT *)

🟢 **LOW:**
- Good soft delete implementation
- Logging on all operations
- Transaction support

---

### 2. event.model.ts (450 lines)

**Purpose:** Main event entity model with CRUD, search, upsert, and analytics operations.

#### DATABASE OPERATIONS

**Table:** `events`

**Operations:**
| Method | SQL Operation | Notes |
|--------|---------------|-------|
| `findBySlug()` | SELECT | Soft delete aware |
| `findById()` | SELECT | Inherited, transformed |
| `createWithDefaults()` | INSERT ON CONFLICT | Race condition safe |
| `upsertEvent()` | INSERT ON CONFLICT | Explicit upsert |
| `update()` | UPDATE | Transformed data |
| `getEventsByVenue()` | SELECT | By venue_id |
| `getEventsByCategory()` | SELECT | By category_id |
| `getFeaturedEvents()` | SELECT | Featured + public + status filter |
| `searchEvents()` | SELECT | Full-text search |
| `incrementViewCount()` | UPDATE INCREMENT | Analytics |
| `incrementInterestCount()` | UPDATE INCREMENT | Analytics |
| `incrementShareCount()` | UPDATE INCREMENT | Analytics |

**Explicit Columns (Audit Fix QS8/DB7):**
- 55 columns explicitly listed in `selectColumns`
- Prevents over-fetching

**ON CONFLICT Handling (Audit Fix DB2):**
```sql
INSERT INTO events (...)
ON CONFLICT (venue_id, slug) WHERE deleted_at IS NULL
DO UPDATE SET updated_at = NOW()
RETURNING *, (xmax = 0) AS _inserted
```
- Uses `xmax = 0` trick to detect insert vs update
- Prevents duplicate events with same slug per venue

#### EXTERNAL SERVICE CALLS
N/A

#### CACHING
N/A

#### STATE MANAGEMENT

**Event Status Values:**
```
DRAFT | REVIEW | APPROVED | PUBLISHED | ON_SALE |
SOLD_OUT | IN_PROGRESS | COMPLETED | CANCELLED | POSTPONED
```

**Visibility Values:** `PUBLIC | PRIVATE | UNLISTED`

**Blockchain Status:** `pending | synced | failed`

#### TENANT ISOLATION

**Status:** ✅ ENFORCED in `searchEvents()`

```typescript
if (!tenant_id) {
  throw new Error('tenant_id is required for searchEvents');
}
query.where('tenant_id', tenant_id);
```

**Other Methods:** ⚠️ NOT ENFORCED
- `findBySlug()` - No tenant check
- `getFeaturedEvents()` - No tenant check
- `getEventsByVenue()` - No tenant check
- `getEventsByCategory()` - No tenant check
- `incrementViewCount()` - No tenant check

🔴 **CRITICAL:** Most query methods lack tenant isolation

#### BUSINESS LOGIC

**Slug Generation:**
```typescript
name.toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/(^-|-$)/g, '');
```

**Search Sanitization:**
```typescript
const sanitizedSearch = searchTerm.replace(/[%_\\]/g, '\\$&');
```
- Prevents SQL injection via LIKE patterns

**Sort Column Whitelist:**
```typescript
const allowedSortColumns = {
  'name': 'name',
  'priority': 'priority_score',
  'views': 'view_count',
  'created_at': 'created_at',
  'updated_at': 'updated_at'
};
```
- Prevents SQL injection via ORDER BY

**Safe Pagination:**
```typescript
const safeLimit = Math.min(Math.max(1, parseInt(limit) || 20), 100);
const safeOffset = Math.max(0, parseInt(offset) || 0);
```
- Max limit: 100
- Min limit: 1
- Default: 20

**Data Transformation:**
- `transformForDb()` - Converts IEvent to DB columns
- `transformFromDb()` - Converts DB row to IEvent
- Handles JSON parsing for `image_gallery`
- Parses decimal strings to floats for percentages

#### ERROR HANDLING

- Inherits base model try-catch
- No custom error classes
- `searchEvents()` throws on missing tenant_id

#### CONCURRENCY

**Status:** ⚠️ PARTIAL
- `createWithDefaults()` uses ON CONFLICT - race safe
- `upsertEvent()` uses ON CONFLICT - race safe
- `update()` has no optimistic locking
- `increment*()` methods are atomic

#### POTENTIAL ISSUES

🔴 **CRITICAL:**
1. **Most methods lack tenant isolation:**
   - `findBySlug()` - could return other tenant's event
   - `getFeaturedEvents()` - returns all tenants' featured events
   - `getEventsByVenue()` - no tenant check
   - `getEventsByCategory()` - no tenant check
   - `incrementViewCount/Interest/ShareCount()` - no tenant check

⚠️ **HIGH:**
1. `update()` has no optimistic locking
2. `findBySlug()` could be used to enumerate events across tenants

🟡 **MEDIUM:**
1. Legacy fields (`event_date`, `doors_open`, `capacity`, `category`, `image_url`) still in interface
2. `image_gallery` JSON parsing could fail silently (returns `[]`)

🟢 **LOW:**
- Good search sanitization
- Good pagination limits
- ON CONFLICT for idempotency

---

### 3. event-capacity.model.ts (95 lines)

**Purpose:** Event capacity and section management for ticket inventory.

#### DATABASE OPERATIONS

**Table:** `event_capacity`

**Operations:**
| Method | SQL Operation | Notes |
|--------|---------------|-------|
| `findByEventId()` | SELECT | Filters `is_active: true` |
| `findByScheduleId()` | SELECT | Filters `is_active: true` |
| `getTotalCapacity()` | SELECT SUM | Aggregation |
| `getAvailableCapacity()` | SELECT SUM | Aggregation |
| `updateSoldCount()` | UPDATE INCREMENT | Atomic |
| `updatePendingCount()` | UPDATE INCREMENT | Atomic |
| `decrementPendingCount()` | UPDATE DECREMENT | Atomic |

**Aggregations:**
```typescript
.sum('total_capacity as total')
.sum('available_capacity as available')
```

#### EXTERNAL SERVICE CALLS
N/A

#### CACHING
N/A

#### STATE MANAGEMENT

**Capacity Tracking:**
- `total_capacity` - Maximum capacity
- `available_capacity` - Currently available
- `reserved_capacity` - Temporarily held
- `buffer_capacity` - Reserved buffer
- `sold_count` - Confirmed sales
- `pending_count` - Pending transactions

**Price Locking:**
```typescript
locked_price_data?: {
  pricing_id: string;
  locked_price: number;
  locked_at: Date;
  service_fee?: number;
  facility_fee?: number;
  tax_rate?: number;
}
```

#### TENANT ISOLATION

**Status:** ❌ NOT ENFORCED
- Interface has `tenant_id` field
- No methods filter by tenant_id
- All queries only use `event_id` or `schedule_id`

🔴 **CRITICAL:** No tenant isolation in any method

#### BUSINESS LOGIC

**Active Filter:** All queries filter `is_active: true`

**Ordering:** Results ordered by `section_name ASC`

#### ERROR HANDLING

- Inherits base model (none visible)
- No custom errors

#### CONCURRENCY

**Status:** ⚠️ PARTIAL
- `increment/decrement` operations are atomic SQL
- No row locking for read-modify-write patterns
- Service layer (capacity.service.ts) handles locking

#### POTENTIAL ISSUES

🔴 **CRITICAL:**
1. **No tenant isolation** - All methods query without tenant_id
   - `findByEventId()` could return other tenant's capacity
   - `updateSoldCount()` could modify other tenant's data

⚠️ **HIGH:**
1. No soft delete check - uses `is_active` instead of `deleted_at`
2. Aggregation queries could be slow on large datasets (no indexes visible)

🟡 **MEDIUM:**
1. `parseInt` on SUM result - could overflow on very large numbers
2. No validation on increment amounts (could go negative)

---

### 4. event-category.model.ts (70 lines)

**Purpose:** Event category hierarchy for classification and filtering.

#### DATABASE OPERATIONS

**Table:** `event_categories`

**Operations:**
| Method | SQL Operation | Notes |
|--------|---------------|-------|
| `findBySlug()` | SELECT | Filters `is_active: true` |
| `findTopLevel()` | SELECT | `parent_id IS NULL` |
| `findByParentId()` | SELECT | Child categories |
| `findFeatured()` | SELECT | Featured categories, limit 10 |
| `getCategoryTree()` | SELECT + in-memory | Builds hierarchy |

#### EXTERNAL SERVICE CALLS
N/A

#### CACHING
N/A - Tree could benefit from caching

#### STATE MANAGEMENT
- `is_active` - Soft visibility toggle
- `is_featured` - Featured flag

#### TENANT ISOLATION

**Status:** ❓ UNCLEAR
- Interface has no `tenant_id` field
- Categories appear to be global/shared across tenants
- Could be intentional (shared category taxonomy)

🟡 **MEDIUM:** Unclear if categories should be tenant-scoped

#### BUSINESS LOGIC

**Category Tree Building:**
```typescript
const topLevel = categories.filter(c => !c.parent_id);
return topLevel.map(parent => ({
  ...parent,
  children: categories.filter(c => c.parent_id === parent.id)
}));
```
- Loads all categories then builds in memory
- O(n²) filtering for children

#### ERROR HANDLING

- Inherits base model
- No custom errors

#### CONCURRENCY
N/A - Read-heavy, low contention

#### POTENTIAL ISSUES

🟡 **MEDIUM:**
1. `getCategoryTree()` loads all categories - could be expensive
2. In-memory tree building is O(n²)
3. No tenant isolation (may be intentional)
4. `findFeatured()` hardcoded limit of 10

🟢 **LOW:**
- Simple read-only operations
- Minimal risk

---

### 5. event-metadata.model.ts (65 lines)

**Purpose:** Extended event metadata for production details, performers, sponsors, etc.

#### DATABASE OPERATIONS

**Table:** `event_metadata`

**Operations:**
| Method | SQL Operation | Notes |
|--------|---------------|-------|
| `findByEventId()` | SELECT | One-to-one with event |
| `upsert()` | SELECT + INSERT/UPDATE | Manual upsert |

**Upsert Pattern:**
```typescript
const existing = await this.findByEventId(eventId);
if (existing) {
  // UPDATE
} else {
  // INSERT
}
```

#### EXTERNAL SERVICE CALLS
N/A

#### CACHING
N/A

#### STATE MANAGEMENT
N/A - Pure data storage

#### TENANT ISOLATION

**Status:** ❌ NOT ENFORCED
- Interface has no `tenant_id` field
- Queries only use `event_id`
- Relies on event-level tenant isolation

🟡 **MEDIUM:** Indirect tenant isolation via event_id relationship

#### BUSINESS LOGIC

**Rich Metadata Fields:**
- Performers, headliner, supporting acts
- Production requirements (sound, lighting, video, catering)
- Budgets (production, marketing, projected revenue)
- Licensing and insurance requirements
- Press release and marketing copy

#### ERROR HANDLING

- Inherits base model
- No custom errors

#### CONCURRENCY

**Status:** ❌ POOR
- `upsert()` has race condition:
  1. SELECT existing
  2. INSERT or UPDATE
  - Another request could insert between steps

⚠️ **HIGH:** Race condition in upsert - should use ON CONFLICT

#### POTENTIAL ISSUES

⚠️ **HIGH:**
1. **Race condition in `upsert()`** - Not atomic
   - Should use `INSERT ... ON CONFLICT` like event.model.ts

🟡 **MEDIUM:**
1. No soft delete check (table may not have `deleted_at`)
2. Large JSON fields could cause performance issues

---

### 6. event-pricing.model.ts (105 lines)

**Purpose:** Event pricing tiers with dynamic pricing, time-based pricing, and fee calculations.

#### DATABASE OPERATIONS

**Table:** `event_pricing`

**Operations:**
| Method | SQL Operation | Notes |
|--------|---------------|-------|
| `findByEventId()` | SELECT | Ordered by display_order, base_price |
| `findByScheduleId()` | SELECT | By schedule |
| `findByCapacityId()` | SELECT | By capacity section |
| `getActivePricing()` | SELECT | Time-windowed + active + visible |
| `calculateTotalPrice()` | SELECT + calculate | In-memory calculation |

**Active Pricing Query:**
```typescript
.where({ event_id: eventId, is_active: true, is_visible: true })
.where(function() {
  this.whereNull('sales_start_at').orWhere('sales_start_at', '<=', now);
})
.where(function() {
  this.whereNull('sales_end_at').orWhere('sales_end_at', '>=', now);
})
```

#### EXTERNAL SERVICE CALLS
N/A

#### CACHING
N/A - Pricing queries could benefit from short TTL caching

#### STATE MANAGEMENT

**Pricing States:**
- `is_active` - Pricing tier enabled
- `is_visible` - Shown to customers
- `is_dynamic` - Dynamic pricing enabled

**Time-Based Pricing:**
- `early_bird_price` + `early_bird_ends_at`
- `last_minute_price` + `last_minute_starts_at`

#### TENANT ISOLATION

**Status:** ❌ NOT ENFORCED
- Interface has no `tenant_id` field
- All queries only use `event_id`, `schedule_id`, `capacity_id`

🔴 **CRITICAL:** No tenant isolation - relies entirely on event relationship

#### BUSINESS LOGIC

**Price Calculation:**
```typescript
const basePrice = pricing.is_dynamic && pricing.current_price
  ? pricing.current_price
  : pricing.base_price;

const subtotal = (basePrice + serviceFee + facilityFee) * quantity;
const total = subtotal * (1 + taxRate);
return Math.round(total * 100) / 100;
```
- Rounds to 2 decimal places
- Tax applied after fees

**Dynamic Pricing Fields:**
- `min_price` / `max_price` - Bounds
- `price_adjustment_rules` - Custom rules (JSON)
- `current_price` - Current dynamic price

#### ERROR HANDLING

- Returns 0 if pricing not found in `calculateTotalPrice()`
- No custom errors

#### CONCURRENCY
N/A - Read-heavy operations

#### POTENTIAL ISSUES

🔴 **CRITICAL:**
1. **No tenant isolation** - Any pricing accessible by ID

⚠️ **HIGH:**
1. `calculateTotalPrice()` doesn't consider early bird / last minute pricing
2. No validation that `current_price` is within min/max bounds

🟡 **MEDIUM:**
1. Tax calculation: `subtotal * (1 + taxRate)` assumes taxRate is decimal (0.08 not 8%)
2. Group discounts in interface but not used in calculation

---

### 7. event-schedule.model.ts (100 lines)

**Purpose:** Event scheduling with timezone support, recurrence, and status tracking.

#### DATABASE OPERATIONS

**Table:** `event_schedules`

**Operations:**
| Method | SQL Operation | Notes |
|--------|---------------|-------|
| `findById()` | SELECT | **No soft delete check** (override) |
| `findByEventId()` | SELECT | Ordered by starts_at |
| `findUpcomingSchedules()` | SELECT | Future + SCHEDULED/CONFIRMED |
| `findSchedulesByDateRange()` | SELECT | Date range query |
| `getNextSchedule()` | SELECT | Next upcoming |
| `updateWithTenant()` | UPDATE | **Has tenant check** |

**No Soft Delete:**
```typescript
// Override findById to not check deleted_at (schedules don't have soft delete)
async findById(id: string): Promise<IEventSchedule | null> {
  return this.db(this.tableName).where({ id }).first();
}
```

#### EXTERNAL SERVICE CALLS
N/A

#### CACHING
N/A

#### STATE MANAGEMENT

**Schedule Status:**
```
SCHEDULED | CONFIRMED | IN_PROGRESS | COMPLETED | CANCELLED | POSTPONED | RESCHEDULED
```

**Recurrence:**
- `is_recurring` - Flag
- `recurrence_rule` - RRULE format
- `recurrence_end_date` - Series end
- `occurrence_number` - Instance number

#### TENANT ISOLATION

**Status:** ⚠️ PARTIAL
- `findByEventId()` - Optional `tenantId` parameter
- `findUpcomingSchedules()` - Optional `tenantId` parameter
- `getNextSchedule()` - Optional `tenantId` parameter
- `updateWithTenant()` - **Enforces tenant_id**
- `findSchedulesByDateRange()` - **No tenant check**

```typescript
async findByEventId(eventId: string, tenantId?: string): Promise<IEventSchedule[]> {
  let query = this.db(this.tableName).where({ event_id: eventId });
  if (tenantId) {
    query = query.where({ tenant_id: tenantId });
  }
  return query.orderBy('starts_at', 'asc');
}
```

🟡 **MEDIUM:** Tenant isolation optional in most methods

#### BUSINESS LOGIC

**Timezone Support:**
- `timezone` - IANA timezone string (required)
- `utc_offset` - Numeric offset

**Check-in Windows:**
- `check_in_opens_at`
- `check_in_closes_at`

#### ERROR HANDLING

- Inherits base model
- No custom errors

#### CONCURRENCY
N/A

#### POTENTIAL ISSUES

⚠️ **HIGH:**
1. `findSchedulesByDateRange()` has NO tenant isolation
   - Could return all tenants' schedules in date range

🟡 **MEDIUM:**
1. Tenant isolation is optional (parameter) not enforced
2. `findById()` override removes soft delete check
3. No validation of timezone string

---

### 8. index.ts (7 lines)

**Purpose:** Barrel export for all models

**Exports:**
- `base.model`
- `event.model`
- `event-category.model`
- `event-schedule.model`
- `event-capacity.model`
- `event-pricing.model`
- `event-metadata.model`

**Note:** Does NOT export `mongodb/event-content.model` - must be imported separately

---

### 9. mongodb/event-content.model.ts (185 lines)

**Purpose:** Mongoose schema for rich event content (images, videos, lineup, FAQs, sponsors).

#### DATABASE OPERATIONS

**Collection:** `event_content`

**Schema Only - No Methods:**
- This file only defines the Mongoose schema
- Actual operations are in `event-content.service.ts`

**Indexes:**
| Index | Purpose |
|-------|---------|
| `{ eventId: 1, contentType: 1, status: 1 }` | Query by event + type + status |
| `{ eventId: 1, status: 1, displayOrder: 1 }` | Sorted content list |
| `{ contentType: 1, status: 1 }` | Global type queries |
| `{ eventId: 1, 'content.media.type': 1 }` | Media type filter |
| `{ featured: 1, status: 1 }` | Featured content |
| `{ 'content.lineup.setTime': 1 }` | Lineup scheduling |
| `{ archivedAt: 1 }` | **TTL: 30 days** |

**TTL Index:**
```typescript
eventContentSchema.index({ archivedAt: 1 }, { expireAfterSeconds: 2592000 }); // 30 days
```
- Archived content auto-deleted after 30 days

#### EXTERNAL SERVICE CALLS
N/A

#### CACHING
N/A

#### STATE MANAGEMENT

**Content Status:** `draft | published | archived`

**Content Types:**
```
DESCRIPTION | COVER_IMAGE | GALLERY | VIDEO | TRAILER |
PERFORMER_BIO | LINEUP | SCHEDULE | FAQ | SPONSOR | PROMOTIONAL
```

#### TENANT ISOLATION

**Status:** ❌ NOT IN SCHEMA
- No `tenantId` field in schema
- Service layer (event-content.service.ts) was fixed to add tenant isolation

🔴 **CRITICAL:** Schema lacks tenant_id field - relies entirely on service layer

#### BUSINESS LOGIC

**Content Structures:**

1. **Description:**
   - short, full, highlights[], tags[]

2. **Media (Image/Video):**
   - url, thumbnailUrl, type, caption, altText, dimensions, duration

3. **Performer:**
   - performerId, name, bio, image, genre[], socialMedia{}

4. **Lineup:**
   - Array of performers with role, setTime, duration, stage, order

5. **Schedule:**
   - Array of time blocks with type (performance, doors_open, intermission, etc.)

6. **FAQ:**
   - Array of Q&A with category (general, tickets, parking, accessibility, covid)

7. **Sponsor:**
   - name, logo, website, tier (title, platinum, gold, silver, bronze)

8. **Promotional:**
   - title, description, image, CTA, validity dates

**Versioning:**
- `version` field (default: 1)
- `previousVersionId` - Links to prior version

#### ERROR HANDLING
N/A - Schema only

#### CONCURRENCY

**Status:** ❌ NONE IN SCHEMA
- `version` field exists but not used for optimistic locking
- Service layer noted as having this issue

#### POTENTIAL ISSUES

🔴 **CRITICAL:**
1. **No `tenantId` field in schema**
   - Must add `tenantId` to schema for proper isolation
   - Service layer fix is defense-in-depth, not sufficient

⚠️ **HIGH:**
1. **TTL on archived content** - Data loss after 30 days
   - May not be desired behavior
   - No way to recover archived content

2. **eventId is ObjectId** - Mismatch with PostgreSQL UUID
   - Events in PostgreSQL use UUID
   - Content references as ObjectId
   - Requires conversion at service layer

🟡 **MEDIUM:**
1. `version` field not used for optimistic locking
2. Large nested content object could cause performance issues
3. No text indexes for content search

---

## CROSS-SERVICE DEPENDENCIES

### Model Relationships

```
┌─────────────────────────────────────────────────────────────┐
│                         events                               │
│  (tenant_id, venue_id, status, visibility, ...)             │
└─────────────────────────────────────────────────────────────┘
         │              │              │              │
         │              │              │              │
         ▼              ▼              ▼              ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│event_schedules│  │event_capacity│  │event_pricing│  │event_metadata│
│(event_id,    │  │(event_id,    │  │(event_id,   │  │(event_id)    │
│ tenant_id)   │  │ tenant_id?)  │  │ schedule_id,│  │              │
└─────────────┘  └─────────────┘  │ capacity_id)│  └─────────────┘
                                   └─────────────┘
                                          │
                                          │
         ┌────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│              event_content (MongoDB)                         │
│  (eventId - ObjectId, NO tenantId in schema!)               │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│              event_categories (shared?)                      │
│  (NO tenant_id - appears global)                            │
└─────────────────────────────────────────────────────────────┘
```

### Tenant Isolation Summary

| Model | tenant_id Field | Enforced in Queries | Status |
|-------|-----------------|---------------------|--------|
| EventModel | ✅ Yes | ⚠️ Only in searchEvents | 🔴 CRITICAL |
| EventScheduleModel | ✅ Yes | ⚠️ Optional parameter | 🟡 MEDIUM |
| EventCapacityModel | ✅ Yes | ❌ Not enforced | 🔴 CRITICAL |
| EventPricingModel | ❌ No | ❌ Not enforced | 🔴 CRITICAL |
| EventMetadataModel | ❌ No | ❌ Not enforced | 🟡 MEDIUM |
| EventCategoryModel | ❌ No | N/A (shared?) | 🟡 UNCLEAR |
| EventContentModel | ❌ No | Service layer only | 🔴 CRITICAL |

---

## INTEGRATION TEST FILE MAPPING

### Test Coverage Recommendations

| Model File | Test File (Proposed) | Priority | Key Scenarios |
|------------|---------------------|----------|---------------|
| `event.model.ts` | `event-model-tenant-isolation.integration.test.ts` | 🔴 CRITICAL | Tenant isolation in all methods, ON CONFLICT handling, search sanitization |
| `event-capacity.model.ts` | `capacity-model-tenant-isolation.integration.test.ts` | 🔴 CRITICAL | Tenant isolation, atomic increments, aggregation accuracy |
| `event-pricing.model.ts` | `pricing-model-calculations.integration.test.ts` | ⚠️ HIGH | Price calculations, time-windowed queries, tenant isolation |
| `event-schedule.model.ts` | `schedule-model-tenant-isolation.integration.test.ts` | ⚠️ HIGH | Tenant isolation, date range queries, timezone handling |
| `event-metadata.model.ts` | `metadata-model-upsert.integration.test.ts` | ⚠️ HIGH | Upsert race conditions |
| `base.model.ts` | `base-model-operations.integration.test.ts` | 🟡 MEDIUM | Soft delete, pagination, column selection |
| `event-content.model.ts` | `content-model-schema.integration.test.ts` | 🟡 MEDIUM | TTL behavior, index usage, ObjectId handling |
| `event-category.model.ts` | `category-model-tree.integration.test.ts` | 🟢 LOW | Tree building, performance |

### Test Scenarios by Priority

#### 🔴 CRITICAL - Tenant Isolation Tests

**event.model.ts:**
- [ ] `findBySlug()` with tenant A cannot find tenant B's event
- [ ] `getFeaturedEvents()` returns only current tenant's events
- [ ] `getEventsByVenue()` enforces tenant isolation
- [ ] `getEventsByCategory()` enforces tenant isolation
- [ ] `incrementViewCount()` validates tenant ownership
- [ ] `searchEvents()` throws without tenant_id
- [ ] `searchEvents()` cannot find other tenant's events

**event-capacity.model.ts:**
- [ ] `findByEventId()` returns only current tenant's capacity
- [ ] `updateSoldCount()` validates tenant ownership
- [ ] `getTotalCapacity()` aggregates only current tenant's data

**event-pricing.model.ts:**
- [ ] `findByEventId()` returns only current tenant's pricing
- [ ] `getActivePricing()` enforces tenant isolation
- [ ] `calculateTotalPrice()` validates tenant ownership

#### ⚠️ HIGH - Data Integrity Tests

**event.model.ts:**
- [ ] `createWithDefaults()` handles concurrent creates (ON CONFLICT)
- [ ] `upsertEvent()` returns correct inserted flag
- [ ] Search sanitization prevents SQL injection via LIKE
- [ ] Sort column whitelist prevents SQL injection

**event-metadata.model.ts:**
- [ ] `upsert()` race condition - concurrent upserts don't duplicate
- [ ] Should use ON CONFLICT instead of SELECT+INSERT/UPDATE

**event-pricing.model.ts:**
- [ ] `calculateTotalPrice()` handles missing pricing gracefully
- [ ] `getActivePricing()` respects sales window boundaries
- [ ] Tax rate handled correctly (decimal vs percentage)

#### 🟡 MEDIUM - Functional Tests

**base.model.ts:**
- [ ] Soft delete excludes records with deleted_at
- [ ] `includeDeleted` option returns soft-deleted records
- [ ] Pagination limit and offset work correctly
- [ ] Column selection uses defined columns

**event-schedule.model.ts:**
- [ ] `findUpcomingSchedules()` returns only future events
- [ ] `findSchedulesByDateRange()` boundaries are inclusive
- [ ] `updateWithTenant()` enforces tenant_id

**event-content.model.ts (MongoDB):**
- [ ] TTL index deletes archived content after 30 days
- [ ] Indexes are used for common queries
- [ ] ObjectId/UUID conversion works correctly

---

## REMAINING CONCERNS

### 🔴 CRITICAL Priority

1. **Widespread Tenant Isolation Gaps**
   - Most models don't enforce tenant isolation
   - `event.model.ts` only enforces in `searchEvents()`
   - `event-capacity.model.ts` has no enforcement
   - `event-pricing.model.ts` has no enforcement
   - **Recommendation:** Add `tenant_id` parameter to ALL query methods, throw if missing

2. **MongoDB Schema Missing tenantId**
   - `event-content.model.ts` has no `tenantId` field
   - Service layer fix is defense-in-depth only
   - **Recommendation:** Add `tenantId` to Mongoose schema, add index

### ⚠️ HIGH Priority

3. **Race Condition in event-metadata.model.ts**
   - `upsert()` uses SELECT then INSERT/UPDATE
   - Not atomic - could create duplicates
   - **Recommendation:** Use `INSERT ... ON CONFLICT` pattern

4. **event-content TTL Auto-Deletion**
   - Archived content deleted after 30 days
   - No recovery possible
   - **Recommendation:** Evaluate if this is desired, add backup strategy

5. **Pricing Calculation Gaps**
   - `calculateTotalPrice()` ignores early_bird/last_minute pricing
   - No bounds checking against min_price/max_price
   - **Recommendation:** Implement full pricing logic

### 🟡 MEDIUM Priority

6. **Optional Tenant Parameter Pattern**
   - `event-schedule.model.ts` uses optional `tenantId`
   - Encourages bypassing tenant isolation
   - **Recommendation:** Make tenant_id required

7. **ObjectId vs UUID Mismatch**
   - MongoDB uses ObjectId for eventId
   - PostgreSQL uses UUID for event.id
   - **Recommendation:** Use string UUID in MongoDB or document conversion

8. **Category Tenant Isolation Unclear**
   - `event-category.model.ts` has no tenant_id
   - May be intentional (shared taxonomy)
   - **Recommendation:** Document decision, add test coverage

### 🟢 LOW Priority

9. **Base Model SELECT * Fallback**
   - `selectColumns` defaults to null (uses *)
   - **Recommendation:** Require explicit columns in all models

10. **Category Tree Performance**
    - `getCategoryTree()` is O(n²)
    - **Recommendation:** Optimize or cache

---

## TESTING CHECKLIST

### Must Test (P0)
- [ ] Tenant isolation in EventModel (all methods)
- [ ] Tenant isolation in EventCapacityModel
- [ ] Tenant isolation in EventPricingModel
- [ ] ON CONFLICT handling in createWithDefaults/upsertEvent
- [ ] Search sanitization (SQL injection prevention)
- [ ] Sort column whitelist (SQL injection prevention)

### Should Test (P1)
- [ ] EventMetadataModel upsert race condition
- [ ] Soft delete behavior across all models
- [ ] Active pricing time window logic
- [ ] Price calculation accuracy
- [ ] Schedule date range queries
- [ ] MongoDB TTL behavior

### Nice to Test (P2)
- [ ] Pagination limits
- [ ] Column selection
- [ ] Category tree building
- [ ] Increment/decrement atomicity
- [ ] Index usage verification

---

## NOTES FOR IMPLEMENTATION

1. **Tenant Isolation Pattern:**
   ```typescript
   // REQUIRED: Make tenant_id mandatory
   async findByEventId(eventId: string, tenantId: string): Promise<T[]> {
     if (!tenantId) throw new Error('tenant_id is required');
     return this.db(this.tableName)
       .where({ event_id: eventId, tenant_id: tenantId })
       ...
   }
   ```

2. **Atomic Upsert Pattern:**
   ```typescript
   // Use ON CONFLICT instead of SELECT+INSERT/UPDATE
   await this.db.raw(`
     INSERT INTO event_metadata (event_id, ...)
     VALUES (?, ...)
     ON CONFLICT (event_id)
     DO UPDATE SET ... = EXCLUDED...
     RETURNING *
   `, [eventId, ...]);
   ```

3. **MongoDB Tenant Field:**
   ```typescript
   // Add to schema
   tenantId: {
     type: String,
     required: true,
     index: true,
   },
   // Add compound index
   eventContentSchema.index({ tenantId: 1, eventId: 1 });
   ```

4. **Test Database Setup:**
   - Use testcontainers for PostgreSQL
   - Use testcontainers for MongoDB
   - Create test tenants A and B
   - Verify isolation between tenants

---

**End of Analysis**