# Event-Service Architecture Map - Part 2

## Table of Contents
1. [Additional Controllers](#1-additional-controllers)
2. [Additional Services](#2-additional-services)
3. [MongoDB Operations](#3-mongodb-operations)
4. [Serializers (SAFE/FORBIDDEN Fields)](#4-serializers)
5. [Background Jobs](#5-background-jobs)
6. [Utils & Helpers](#6-utils--helpers)

---

## 1. Additional Controllers

### 1.1 Event Content Controller
**File:** `src/controllers/event-content.controller.ts`

**Endpoints:**
| Method | Path | Handler | Line |
|--------|------|---------|------|
| POST | `/events/:eventId/content` | `createContent()` | 19-53 |
| GET | `/events/:eventId/content` | `getEventContent()` | 55-79 |
| GET | `/events/:eventId/content/:contentId` | `getContent()` | 81-102 |
| PUT | `/events/:eventId/content/:contentId` | `updateContent()` | 104-140 |
| DELETE | `/events/:eventId/content/:contentId` | `deleteContent()` | 142-163 |
| POST | `/events/:eventId/content/:contentId/publish` | `publishContent()` | 165-189 |
| POST | `/events/:eventId/content/:contentId/archive` | `archiveContent()` | 191-215 |
| GET | `/events/:eventId/gallery` | `getGallery()` | 217-233 |
| GET | `/events/:eventId/lineup` | `getLineup()` | 235-251 |
| GET | `/events/:eventId/schedule` | `getSchedule()` | 253-269 |
| GET | `/events/:eventId/performers` | `getPerformers()` | 271-287 |

**Security Features:**
- Line 26-28: Authentication required (no 'system' fallback)
- Line 30: TenantId extraction from request
- All operations are tenant-scoped

**External Dependencies:**
- `EventContentService` (MongoDB)

---

### 1.2 Event Reviews Controller
**File:** `src/controllers/event-reviews.controller.ts`

**Endpoints:**
| Method | Path | Handler | Line |
|--------|------|---------|------|
| POST | `/events/:eventId/reviews` | `createReview()` | 44-78 |
| GET | `/events/:eventId/reviews` | `getReviews()` | 84-129 |
| GET | `/events/:eventId/reviews/:reviewId` | `getReview()` | 135-159 |
| PUT | `/events/:eventId/reviews/:reviewId` | `updateReview()` | 165-198 |
| DELETE | `/events/:eventId/reviews/:reviewId` | `deleteReview()` | 204-237 |
| POST | `/events/:eventId/reviews/:reviewId/helpful` | `markHelpful()` | 243-266 |
| POST | `/events/:eventId/reviews/:reviewId/report` | `reportReview()` | 272-296 |
| POST | `/events/:eventId/ratings` | `submitRating()` | 302-336 |
| GET | `/events/:eventId/ratings/summary` | `getRatingSummary()` | 342-363 |
| GET | `/events/:eventId/ratings/me` | `getUserRating()` | 369-395 |

**Critical Security:**
- Line 20-38: `validateEventOwnership()` - Validates tenant isolation before ALL review operations
- Line 33: Resolves eventService from DI container
- Line 93-101: Pagination bounds validation (page >= 1, limit 1-100)

**External Dependencies:**
- `@tickettoken/shared` → `ReviewService`, `RatingService`
- Redis for caching

---

### 1.3 Report Analytics Controller
**File:** `src/controllers/report-analytics.controller.ts`

**Handlers:**

#### `getSalesReport()` (Lines 5-48)
```sql
SELECT events.id, events.name as event_name,
       SUM(event_capacity.sold_count) as tickets_sold,
       SUM(event_capacity.sold_count * event_pricing.base_price) as revenue
FROM event_capacity
JOIN events ON event_capacity.event_id = events.id
JOIN event_pricing ON event_capacity.id = event_pricing.capacity_id
WHERE events.tenant_id = $1
GROUP BY events.id, events.name
ORDER BY revenue DESC
```

#### `getVenueComparisonReport()` (Lines 50-90)
```sql
SELECT events.venue_id,
       COUNT(DISTINCT events.id) as event_count,
       SUM(event_capacity.sold_count) as total_sold,
       SUM(event_capacity.total_capacity) as total_capacity
FROM events
LEFT JOIN event_capacity ON events.id = event_capacity.event_id
WHERE events.tenant_id = $1
GROUP BY events.venue_id
ORDER BY total_sold DESC
```

#### `getCustomerInsightsReport()` (Lines 92-134)
```sql
SELECT event_categories.name as category,
       SUM(event_capacity.sold_count) as tickets_sold,
       AVG(event_pricing.base_price) as avg_ticket_price
FROM events
JOIN event_categories ON events.primary_category_id = event_categories.id
LEFT JOIN event_capacity ON events.id = event_capacity.event_id
LEFT JOIN event_pricing ON event_capacity.id = event_pricing.capacity_id
WHERE events.tenant_id = $1
GROUP BY event_categories.id, event_categories.name
ORDER BY tickets_sold DESC
```

**Critical:** All queries enforce `tenant_id` filter for RLS compliance.

---

### 1.4 Venue Analytics Controller
**File:** `src/controllers/venue-analytics.controller.ts`

**Handlers:**

#### `getVenueDashboard()` (Lines 5-61)
```sql
-- Query 1: Get events for venue
SELECT * FROM events
WHERE venue_id = $1 AND tenant_id = $2 AND deleted_at IS NULL

-- Query 2: Get capacity stats
SELECT SUM(total_capacity), SUM(sold_count), SUM(reserved_capacity), SUM(available_capacity)
FROM event_capacity
JOIN events ON event_capacity.event_id = events.id
WHERE events.venue_id = $1 AND events.tenant_id = $2
```

#### `getVenueAnalytics()` (Lines 63-107)
```sql
SELECT COUNT(DISTINCT events.id) as total_events,
       SUM(event_capacity.sold_count * event_pricing.base_price) as total_revenue,
       SUM(event_capacity.sold_count) as total_tickets_sold
FROM events
LEFT JOIN event_capacity ON events.id = event_capacity.event_id
LEFT JOIN event_pricing ON event_capacity.id = event_pricing.capacity_id
WHERE events.venue_id = $1 AND events.tenant_id = $2
```

**Note:** Safe parseInt/parseFloat with null checks (Lines 45-48, 92-94)

---

### 1.5 Customer Analytics Controller
**File:** `src/controllers/customer-analytics.controller.ts`

#### `getCustomerProfile()` (Lines 6-69)
```sql
SELECT events.name, events.id, event_pricing.name, event_pricing.base_price
FROM event_pricing
JOIN events ON event_pricing.event_id = events.id
WHERE event_pricing.is_active = true
  AND events.tenant_id = $1
  AND events.created_by = $2  -- Filter by customer ID
LIMIT 10
```

**Note:** Line 34 - This is mock data. Real purchase history comes from ticket-service.

---

### 1.6 Tickets Controller
**File:** `src/controllers/tickets.controller.ts`

**Endpoints:**
| Method | Path | Handler | Line |
|--------|------|---------|------|
| GET | `/events/:id/tickets` | `getTicketTypes()` | 35-61 |
| POST | `/events/:id/tickets` | `createTicketType()` | 63-105 |
| PUT | `/events/:id/tickets/:typeId` | `updateTicketType()` | 107-206 |
| GET | `/events/:id/tickets/:typeId` | `getTicketType()` | 208-241 |

**Critical Business Logic (Lines 140-186):**
- Blocks price changes if tickets have been sold
- Checks `event_capacity.sold_count` locally (efficient, no external call)
- Two-level check: specific capacity_id, then total event sold_count

```sql
-- Check sold_count before allowing price change
SELECT * FROM event_capacity
WHERE id = $1 AND tenant_id = $2

-- If no capacity_id, check total event sold count
SELECT SUM(sold_count) as total
FROM event_capacity
WHERE event_id = $1 AND tenant_id = $2
```

---

### 1.7 Schedule Controller
**File:** `src/controllers/schedule.controller.ts`

**Endpoints:**
| Method | Path | Handler | Line |
|--------|------|---------|------|
| GET | `/events/:eventId/schedules` | `getSchedules()` | 23-52 |
| POST | `/events/:eventId/schedules` | `createSchedule()` | 54-95 |
| GET | `/events/:eventId/schedules/:scheduleId` | `getSchedule()` | 97-129 |
| PUT | `/events/:eventId/schedules/:scheduleId` | `updateSchedule()` | 131-174 |
| GET | `/events/:eventId/schedules/upcoming` | `getUpcomingSchedules()` | 176-204 |
| GET | `/events/:eventId/schedules/next` | `getNextSchedule()` | 206-238 |

**Uses:** `serializeSchedule()`, `serializeSchedules()` from serializers.

---

### 1.8 Cancellation Controller
**File:** `src/controllers/cancellation.controller.ts`

#### `cancelEvent()` (Lines 19-95)
**Flow:**
1. Validates cancellation_reason is provided
2. Resolves `cancellationService` from DI container
3. Calls `canCancelEvent()` for permission check
4. Calls `cancelEvent()` with full options

**Error Handling (Lines 66-93):**
- `NotFoundError` → 404
- `BadRequestError`/`ValidationError` → 400
- `ConflictError` → 409
- `ForbiddenError` → 403
- Unknown → 500

---

## 2. Additional Services

### 2.1 Event Content Service (MongoDB)
**File:** `src/services/event-content.service.ts`

**Operations:**

| Method | Line | MongoDB Collection | Query Pattern |
|--------|------|--------------------|---------------|
| `createContent()` | 52-76 | `event_content` | `new EventContentModel().save()` |
| `updateContent()` | 78-115 | `event_content` | `findOne({ _id, tenantId })` then `.save()` |
| `deleteContent()` | 117-126 | `event_content` | `findOneAndDelete({ _id, tenantId })` |
| `getContent()` | 128-137 | `event_content` | `findOne({ _id, tenantId })` |
| `getEventContent()` | 139-147 | `event_content` | `find({ eventId, tenantId }).sort({ displayOrder: 1 })` |
| `publishContent()` | 149-165 | `event_content` | `findOne().save()` with status='published' |
| `archiveContent()` | 167-183 | `event_content` | `findOne().save()` with status='archived' |
| `getGallery()` | 185-195 | `event_content` | `find({ contentType: 'GALLERY', status: 'published' })` |
| `getLineup()` | 197-207 | `event_content` | `findOne({ contentType: 'LINEUP', status: 'published' })` |
| `getSchedule()` | 209-219 | `event_content` | `findOne({ contentType: 'SCHEDULE', status: 'published' })` |
| `getPerformers()` | 221-231 | `event_content` | `find({ contentType: 'PERFORMER_BIO' })` |

**Security Features:**
- Line 39-49: `validateTenantContext()` - UUID v4 validation + required check
- All queries include `tenantId` in filter
- Line 88-95: Optimistic locking with `expectedVersion` check

**Version Control:**
- Creates with `version: 1`
- Increments version on update/publish/archive

---

### 2.2 Reservation Cleanup Service
**File:** `src/services/reservation-cleanup.service.ts`

**Background Job:** Releases expired capacity reservations

**Key Properties:**
```typescript
private intervalMinutes: number = 1; // Runs every minute
private consecutiveFailures: number = 0;
private maxConsecutiveFailures: number = 5;
private backoffMs: number = 0;
private isCleanupInProgress: boolean = false; // Mutex lock
```

**Methods:**
| Method | Line | Purpose |
|--------|------|---------|
| `start()` | 43-59 | Starts interval job |
| `stop()` | 64-77 | Stops interval job |
| `runCleanup()` | 84-166 | Core cleanup logic with mutex |
| `calculateBackoff()` | 171-178 | Exponential backoff: 1s → 2s → 4s → 8s → 16s → 32s → 60s max |
| `triggerCleanup()` | 190-193 | Manual trigger for testing |
| `getStatus()` | 200-226 | Returns job metrics |
| `resetMetrics()` | 232-239 | Resets all counters |

**Resilience Features:**
- Mutex lock prevents overlapping executions (Line 86-93)
- Exponential backoff after 5 consecutive failures
- Tracks metrics: totalCleanups, totalReservationsReleased, skippedCleanups

**Database Touch:**
- Calls `capacityService.releaseExpiredReservations()` (Line 111)

---

### 2.3 Cache Integration Service
**File:** `src/services/cache-integration.ts`

**Singleton:** `serviceCache`

**Redis Operations:**
| Method | Line | Redis Command | Key Pattern |
|--------|------|---------------|-------------|
| `get()` | 96-115 | `GET` | `tenant:${tenantId}:${key}` |
| `set()` | 125-141 | `SETEX` | `tenant:${tenantId}:${key}` |
| `delete()` | 150-175 | `DEL` or `SCAN+DEL` | `tenant:${tenantId}:${key}` |
| `invalidateCache()` | 217-219 | Delegates to `delete()` | |
| `flushTenant()` | 226-234 | `SCAN+DEL` | `tenant:${tenantId}:*` |

**Security Features:**
- Line 86-88: All keys prefixed with `tenant:${tenantId}:` for isolation
- Line 182-209: Uses SCAN instead of KEYS (non-blocking)
- No global flush() method (security removed)

**Resilience Features:**
- Circuit breaker (Lines 40-64):
  - 1s timeout
  - 50% error threshold
  - 30s reset timeout
  - 5 volume threshold
- 1s command timeout (Line 37)
- 5s connection timeout (Line 35)

---

### 2.4 Database Service
**File:** `src/services/databaseService.ts`

**Singleton:** `DatabaseService`

**Pool Configuration (Lines 51-84):**
```typescript
{
  max: process.env.DB_POOL_MAX || 20,
  min: process.env.DB_POOL_MIN || 2,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  statement_timeout: process.env.DB_STATEMENT_TIMEOUT || 30000,
}
```

**Methods:**
| Method | Line | Purpose |
|--------|------|---------|
| `initialize()` | 17-46 | Creates pool with retry logic |
| `getPool()` | 111-115 | Returns pg Pool |
| `getPoolStats()` | 120-134 | Returns total/idle/waiting counts |
| `close()` | 139-154 | Graceful shutdown |

**Resilience Features:**
- Retry on connection errors: ECONNREFUSED, ENOTFOUND, ETIMEDOUT (Lines 38-43)
- Max 5 retries with exponential backoff (1s → 10s)

---

### 2.5 Health Check Service
**File:** `src/services/healthCheck.service.ts`

**Methods:**
| Method | Line | Purpose |
|--------|------|---------|
| `performLivenessCheck()` | 96-100 | K8s liveness probe (fast, no deps) |
| `performReadinessCheck()` | 109-125 | K8s readiness probe (DB + Redis) |
| `performHealthCheck()` | 137-172 | Full health check for dashboards |
| `checkDatabase()` | 179-214 | DB connectivity with timeout |
| `checkRedis()` | 222-258 | Redis connectivity with timeout |
| `checkClockDrift()` | 381-407 | Compares DB time vs local time |
| `performDetailedHealthCheck()` | 415-444 | Detailed health (auth required) |

**Thresholds:**
- DB slow threshold: 1000ms (returns 'degraded')
- Redis slow threshold: 500ms (returns 'degraded')
- DB health timeout: 2000ms
- Redis health timeout: 1000ms
- Max clock drift: 5000ms

**External Dependency Caching:**
- 30s TTL for external service status (Line 84)
- External deps don't affect overall health status

---

### 2.6 Cancellation Service
**File:** `src/services/cancellation.service.ts`

**Method:** `cancelEvent()` (Lines 19-135)

**Flow:**
1. Fetch event within transaction
2. Validate not already cancelled
3. Validate state transition via state machine
4. Check cancellation deadline (based on schedule)
5. Update event status to CANCELLED
6. Log to audit_logs

**Database Operations:**
```sql
-- Line 23-26: Fetch event
SELECT * FROM events WHERE id=$1 AND tenant_id=$2 AND deleted_at IS NULL

-- Line 51-57: Get earliest schedule for deadline check
SELECT * FROM event_schedules WHERE event_id=$1 ORDER BY starts_at ASC LIMIT 1

-- Line 67-75: Update event status
UPDATE events SET status='CANCELLED', cancelled_at=$1, cancelled_by=$2, ... WHERE id=$3

-- Line 78-92: Insert audit log
INSERT INTO audit_logs (tenant_id, entity_type, entity_id, action, actor_id, changes, ...)
```

**Method:** `validateCancellationPermission()` (Lines 137-152)
- Checks if user is the event creator

---

### 2.7 Blockchain Service
**File:** `src/services/blockchain.service.ts`

**Methods:**
| Method | Line | Purpose |
|--------|------|---------|
| `createEventOnChain()` | 153-196 | Creates event on Solana blockchain |
| `validateVenueTenant()` | 318-368 | Security: Validates venue belongs to tenant |
| `deriveVenuePDA()` | 303-306 | Derives PDA from venue ID |

**Circuit Breaker Config (Lines 68-74):**
```typescript
{
  timeout: 15000,           // 15s for blockchain transactions
  errorThresholdPercentage: 50,
  resetTimeout: 60000,      // 1 minute reset
  volumeThreshold: 3,
}
```

**Retry Logic (Lines 167-179):**
- Max 2 retries (3 total attempts)
- Initial delay: 1000ms
- Max delay: 5000ms
- Only retries transient errors (network, rate limit, blockhash)

**Security:**
- Line 164: Validates venue ownership before blockchain operation
- Uses `venueServiceClient.getVenueInternal()` with tenant context

---

## 3. MongoDB Operations

### Collection: `event_content`

**Model File:** `src/models/mongodb/event-content.model.ts`

**Schema Fields:**
```typescript
{
  tenantId: String,           // Required, indexed
  eventId: ObjectId,          // Required, indexed
  contentType: enum,          // DESCRIPTION, COVER_IMAGE, GALLERY, VIDEO, TRAILER, PERFORMER_BIO, LINEUP, SCHEDULE, FAQ, SPONSOR, PROMOTIONAL
  status: enum,               // draft, published, archived
  content: Mixed,             // Varies by contentType
  displayOrder: Number,
  featured: Boolean,
  primaryImage: Boolean,
  version: Number,
  previousVersionId: ObjectId,
  publishedAt: Date,
  archivedAt: Date,
  createdBy: String,
  updatedBy: String,
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes (Lines 226-233):**
```javascript
{ tenantId: 1, eventId: 1 }
{ tenantId: 1, eventId: 1, contentType: 1, status: 1 }
{ tenantId: 1, eventId: 1, status: 1, displayOrder: 1 }
{ tenantId: 1, contentType: 1, status: 1 }
{ tenantId: 1, eventId: 1, 'content.media.type': 1 }
{ tenantId: 1, featured: 1, status: 1 }
{ 'content.lineup.setTime': 1 }
{ archivedAt: 1 }  // TTL index: 30 days
```

**Content Subtypes:**
- **DESCRIPTION:** description.short, description.full, description.highlights[], description.tags[]
- **MEDIA:** media.url, media.thumbnailUrl, media.type, media.caption, media.altText, media.dimensions, media.duration
- **PERFORMER_BIO:** performer.performerId, performer.name, performer.bio, performer.image, performer.genre[], performer.socialMedia{}
- **LINEUP:** lineup[].performerId, lineup[].name, lineup[].role, lineup[].setTime, lineup[].duration, lineup[].stage, lineup[].order
- **SCHEDULE:** schedule[].startTime, schedule[].endTime, schedule[].title, schedule[].description, schedule[].location, schedule[].type
- **FAQ:** faqs[].question, faqs[].answer, faqs[].category, faqs[].order
- **SPONSOR:** sponsor.name, sponsor.logo, sponsor.website, sponsor.tier, sponsor.description
- **PROMOTIONAL:** promo.title, promo.description, promo.image, promo.ctaText, promo.ctaLink, promo.validFrom, promo.validUntil

---

## 4. Serializers

### 4.1 Event Serializer
**File:** `src/serializers/event.serializer.ts`

#### SAFE_EVENT_FIELDS (75 fields - Lines 28-75):
```typescript
'id', 'tenant_id', 'venue_id', 'venue_layout_id', 'name', 'slug', 'description',
'short_description', 'event_type', 'primary_category_id', 'secondary_category_ids',
'tags', 'status', 'visibility', 'is_featured', 'priority_score', 'banner_image_url',
'thumbnail_image_url', 'image_gallery', 'video_url', 'virtual_event_url',
'age_restriction', 'dress_code', 'special_requirements', 'accessibility_info',
'is_virtual', 'is_hybrid', 'streaming_platform', 'cancellation_policy',
'refund_policy', 'cancellation_deadline_hours', 'start_date', 'allow_transfers',
'max_transfers_per_ticket', 'transfer_blackout_start', 'transfer_blackout_end',
'require_identity_verification', 'meta_title', 'meta_description', 'meta_keywords',
'view_count', 'interest_count', 'share_count', 'external_id', 'created_at', 'updated_at'
```

#### FORBIDDEN_EVENT_FIELDS (Lines 88-115):
```typescript
// CRITICAL - Blockchain signing/wallet data
'mint_authority', 'artist_wallet', 'event_pda', 'collection_address',

// HIGH RISK - Business confidential royalty splits
'artist_percentage', 'venue_percentage', 'royalty_percentage', 'blockchain_status',

// HIGH RISK - May contain API keys/credentials
'streaming_config',

// MEDIUM RISK - Internal tracking
'created_by', 'updated_by', 'version', 'deleted_at', 'status_reason',
'status_changed_by', 'status_changed_at', 'metadata'
```

**Functions:**
- `serializeEvent()` (Line 183): Single event → SafeEvent
- `serializeEvents()` (Line 244): Array → SafeEvent[]
- `serializeEventSummary()` (Line 255): Minimal fields for lists
- `findForbiddenEventFields()` (Line 284): Test helper
- `findMissingSafeEventFields()` (Line 318): Test helper

---

### 4.2 Pricing Serializer
**File:** `src/serializers/pricing.serializer.ts`

#### SAFE_PRICING_FIELDS (Lines 20-53):
```typescript
'id', 'tenant_id', 'event_id', 'schedule_id', 'capacity_id', 'name', 'description',
'tier', 'base_price', 'service_fee', 'facility_fee', 'tax_rate', 'is_dynamic',
'min_price', 'max_price', 'current_price', 'early_bird_price', 'early_bird_ends_at',
'last_minute_price', 'last_minute_starts_at', 'group_size_min', 'group_discount_percentage',
'currency', 'sales_start_at', 'sales_end_at', 'max_per_order', 'max_per_customer',
'is_active', 'is_visible', 'display_order', 'created_at', 'updated_at'
```

#### FORBIDDEN_PRICING_FIELDS (Lines 63-72):
```typescript
// HIGH RISK - Pricing algorithm/business logic
'price_adjustment_rules',

// MEDIUM RISK - Internal tracking
'created_by', 'updated_by', 'version', 'deleted_at'
```

---

### 4.3 Capacity Serializer
**File:** `src/serializers/capacity.serializer.ts`

#### SAFE_CAPACITY_FIELDS (Lines 21-41):
```typescript
'id', 'tenant_id', 'event_id', 'schedule_id', 'section_name', 'section_code',
'tier', 'total_capacity', 'available_capacity', 'reserved_capacity', 'buffer_capacity',
'sold_count', 'pending_count', 'is_active', 'is_visible', 'minimum_purchase',
'maximum_purchase', 'created_at', 'updated_at'
```

#### FORBIDDEN_CAPACITY_FIELDS (Lines 51-66):
```typescript
// HIGH RISK - Internal pricing locks
'locked_price_data', 'reserved_at', 'reserved_expires_at',

// MEDIUM RISK - Internal layout data
'seat_map', 'row_config',

// MEDIUM RISK - Internal tracking
'created_by', 'updated_by', 'version', 'deleted_at'
```

---

### 4.4 Schedule Serializer
**File:** `src/serializers/schedule.serializer.ts`

#### SAFE_SCHEDULE_FIELDS (Lines 20-40):
```typescript
'id', 'tenant_id', 'event_id', 'starts_at', 'ends_at', 'doors_open_at',
'is_recurring', 'recurrence_rule', 'recurrence_end_date', 'occurrence_number',
'timezone', 'utc_offset', 'status', 'capacity_override', 'check_in_opens_at',
'check_in_closes_at', 'notes', 'created_at', 'updated_at'
```

#### FORBIDDEN_SCHEDULE_FIELDS (Lines 50-60):
```typescript
// MEDIUM RISK - May contain internal notes
'metadata', 'status_reason',

// MEDIUM RISK - Internal tracking
'created_by', 'updated_by', 'version', 'deleted_at'
```

---

## 5. Background Jobs

### 5.1 Event Transitions Job
**File:** `src/jobs/event-transitions.job.ts`

**Queue:** `event-transitions`

**Job Types (Lines 29-36):**
```typescript
SCAN_PENDING_TRANSITIONS: 'scan-pending-transitions',
TRANSITION_EVENT: 'transition-event',
SALES_START: 'sales-start',
SALES_END: 'sales-end',
EVENT_START: 'event-start',
EVENT_END: 'event-end',
```

**Automatic Transitions:**
| From State | To State | Trigger |
|------------|----------|---------|
| PUBLISHED | ON_SALE | `sales_start_date <= NOW()` |
| ON_SALE | SALES_PAUSED | `sales_end_date <= NOW()` |
| ON_SALE/SOLD_OUT/SALES_PAUSED | IN_PROGRESS | `start_date <= NOW()` |
| IN_PROGRESS | COMPLETED | `end_date <= NOW()` |

**Scan Job (Lines 287-415):**
- Runs every 5 minutes via cron: `*/5 * * * *`
- Uses distributed lock (`event-transitions:scan-lock`)
- Processes up to 1000 events per scan (BATCH_SIZE)

**Transition Job (Lines 200-282):**
- Distributed lock per event: `event-transition-lock:${eventId}`
- Lock TTL: 45s (1.5x job timeout of 30s)
- 5 retry attempts with exponential backoff (2s start)

**Database Operations:**
```sql
-- Line 121-128: Update event status with optimistic locking
UPDATE events SET status=$1, updated_at=NOW(), status_changed_at=NOW()
WHERE id=$2 AND tenant_id=$3 AND status=$4

-- Line 133-136: Insert status history audit
INSERT INTO event_status_history (event_id, tenant_id, previous_status, new_status, transition_type, changed_by)

-- Line 304-315: Find events needing sales start
SELECT id, tenant_id FROM events
WHERE status='PUBLISHED' AND sales_start_date <= NOW() AND (sales_end_date IS NULL OR sales_end_date > NOW())
ORDER BY sales_start_date ASC, created_at ASC LIMIT 1000

-- Similar queries for sales_end, event_start, event_end
```

---

### 5.2 Blockchain Sync Job
**File:** `src/jobs/blockchain-sync.job.ts`

**Queue:** `blockchain-sync`

**Configuration:**
- 3 retry attempts
- Exponential backoff: 2s → 4s → 8s
- 60s timeout per attempt (blockchain calls can be slow)

**`queueBlockchainSync()` (Lines 39-79):**
- Queues sync job with event-specific job ID to prevent duplicates

**`processBlockchainSyncJob()` (Lines 84-179):**
1. Fetch event from database
2. Skip if already synced (`blockchain_status='synced'` and `event_pda` exists)
3. Build `EventBlockchainData` from event record
4. Call `blockchainService.createEventOnChain()`
5. Update event with blockchain result

**Database Operations:**
```sql
-- Line 98-100: Get event for sync
SELECT * FROM events WHERE id=$1 AND tenant_id=$2

-- Line 140-149: Update with blockchain data on success
UPDATE events SET blockchain_status='synced', blockchain_event_id=$1, event_pda=$2, blockchain_signature=$3, blockchain_synced_at=NOW() WHERE id=$4

-- Line 168-174: Update status on failure
UPDATE events SET blockchain_status='retrying'/'failed', blockchain_error=$1 WHERE id=$2
```

---

### 5.3 System Job Utils
**File:** `src/jobs/system-job-utils.ts`

**`withSystemContext()`** (Lines 14-27):
- Sets `app.is_system_user = 'true'` to bypass RLS
- Used by background jobs needing cross-tenant access
- Properly resets config in finally block

```typescript
async function withSystemContext<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  await client.query(`SELECT set_config('app.is_system_user', 'true', false)`);
  try {
    return await fn(client);
  } finally {
    await client.query(`SELECT set_config('app.is_system_user', 'false', false)`);
  }
}
```

---

## 6. Utils & Helpers

### 6.1 Retry Utility
**File:** `src/utils/retry.ts`
- Used by DatabaseService, BlockchainService, and jobs
- Supports exponential backoff
- Configurable: maxRetries, initialDelayMs, maxDelayMs
- Custom `retryOn` predicate for selective retry

### 6.2 Error Classes
**File:** `src/utils/errors.ts`
- `NotFoundError`, `BadRequestError`, `ConflictError`, `ForbiddenError`, `ValidationError`
- `hasErrorCode()` type guard for checking error format

### 6.3 Metrics
**File:** `src/utils/metrics.ts`
- Prometheus metrics for monitoring
- `eventTransitionsTotal` - Counter with labels: transition_type, result
- `eventTransitionDuration` - Histogram for timing
- `scanEventsFound` - Gauge for scan results
- `lockAcquisitionFailuresTotal` - Counter for lock failures

### 6.4 Timezone Validator
**File:** `src/utils/timezone-validator.ts`
- Validates timezone strings (e.g., "America/New_York")
- Used in event creation/update

### 6.5 Shutdown Manager
**File:** `src/utils/shutdown-manager.ts`
- Graceful shutdown handling
- Closes database pools, Redis connections, job queues

### 6.6 Saga Utility
**File:** `src/utils/saga.ts`
- Saga pattern for distributed transactions
- Compensation on failure

---

## Summary Statistics

### Files Analyzed in Part 2

| Category | Count | Files |
|----------|-------|-------|
| Controllers | 8 | event-content, event-reviews, report-analytics, venue-analytics, customer-analytics, tickets, schedule, cancellation |
| Services | 6 | event-content, reservation-cleanup, cache-integration, databaseService, healthCheck, blockchain, cancellation |
| Serializers | 4 | event, pricing, capacity, schedule |
| Jobs | 3 | event-transitions, blockchain-sync, system-job-utils |
| Models | 1 | mongodb/event-content |

### Database Tables Touched

| Table | Operations |
|-------|------------|
| `events` | SELECT, UPDATE (status, blockchain fields) |
| `event_capacity` | SELECT (sold_count), JOIN |
| `event_pricing` | SELECT, JOIN |
| `event_schedules` | SELECT |
| `event_categories` | JOIN |
| `event_status_history` | INSERT (audit) |
| `audit_logs` | INSERT |

### MongoDB Collections

| Collection | Operations |
|------------|------------|
| `event_content` | find, findOne, save, findOneAndDelete |

### External Service Calls

| Service | Client | Purpose |
|---------|--------|---------|
| venue-service | `venueServiceClient.getVenueInternal()` | Validate venue ownership for blockchain |
| ticket-service | N/A | Note: Customer analytics uses mock data |
| shared ReviewService | `@tickettoken/shared` | Review/rating operations |
| shared RatingService | `@tickettoken/shared` | Rating operations |
