# Event Service - Service Overview

## Service Purpose
The Event Service is the core service responsible for managing events, schedules, capacity, pricing, and event-related content. It integrates with the blockchain for immutable event data and royalty splits, supports multi-tenancy, and provides comprehensive event management capabilities including dynamic pricing, capacity management with reservation locks, and MongoDB-based content management.

---

## Routes (`src/routes/`)

### `events.routes.ts`
**Base Path:** `/events`

| Method | Path | Description | Auth Required |
|--------|------|-------------|---------------|
| GET | `/events` | List events with pagination and status filter | ✅ |
| GET | `/events/:id` | Get single event details | ✅ |
| POST | `/events` | Create new event | ✅ |
| PUT | `/events/:id` | Update event | ✅ |
| DELETE | `/events/:id` | Soft delete event | ✅ |
| POST | `/events/:id/publish` | Publish event | ✅ |
| GET | `/venues/:venueId/events` | Get all events for a venue | ✅ |

### `schedules.routes.ts`
**Base Path:** `/events/:eventId/schedules`

| Method | Path | Description | Auth Required |
|--------|------|-------------|---------------|
| GET | `/events/:eventId/schedules` | Get all schedules for an event | ✅ |
| POST | `/events/:eventId/schedules` | Create schedule for event | ✅ |
| GET | `/events/:eventId/schedules/upcoming` | Get upcoming schedules | ✅ |
| GET | `/events/:eventId/schedules/next` | Get next schedule | ✅ |
| GET | `/events/:eventId/schedules/:scheduleId` | Get specific schedule | ✅ |
| PUT | `/events/:eventId/schedules/:scheduleId` | Update schedule | ✅ |

### `capacity.routes.ts`
**Base Path:** `/events/:eventId/capacity` and `/capacity`

| Method | Path | Description | Auth Required |
|--------|------|-------------|---------------|
| GET | `/events/:eventId/capacity` | Get event capacity sections | ✅ |
| GET | `/events/:eventId/capacity/total` | Get total capacity for event | ✅ |
| GET | `/capacity/:id` | Get single capacity section | ✅ |
| POST | `/events/:eventId/capacity` | Create capacity section | ✅ |
| PUT | `/capacity/:id` | Update capacity section | ✅ |
| POST | `/capacity/:id/check` | Check availability | ✅ |
| POST | `/capacity/:id/reserve` | Reserve capacity (for cart/checkout) | ✅ |

### `pricing.routes.ts`
**Base Path:** `/events/:eventId/pricing` and `/pricing`

| Method | Path | Description | Auth Required |
|--------|------|-------------|---------------|
| GET | `/events/:eventId/pricing` | Get all pricing tiers for event | ✅ |
| GET | `/events/:eventId/pricing/active` | Get active pricing tiers | ✅ |
| GET | `/pricing/:id` | Get single pricing tier | ✅ |
| POST | `/events/:eventId/pricing` | Create pricing tier | ✅ |
| PUT | `/pricing/:id` | Update pricing tier | ✅ |
| POST | `/pricing/:id/calculate` | Calculate total price for quantity | ✅ |

### `tickets.routes.ts`
**Base Path:** `/events/:id/ticket-types`

| Method | Path | Description | Auth Required |
|--------|------|-------------|---------------|
| GET | `/events/:id/ticket-types` | Get ticket types for event | ✅ |
| POST | `/events/:id/ticket-types` | Create ticket type | ✅ |
| PUT | `/events/:id/ticket-types/:typeId` | Update ticket type | ✅ |

### `notifications.routes.ts`
**Base Path:** `/notifications`

| Method | Path | Description | Auth Required |
|--------|------|-------------|---------------|
| POST | `/notifications` | Create notification | ✅ |
| GET | `/users/:userId/notifications` | Get user notifications | ✅ |
| PUT | `/notifications/:notificationId/read` | Mark notification as read | ✅ |

### `customers.routes.ts`
**Base Path:** `/customers`

| Method | Path | Description | Auth Required |
|--------|------|-------------|---------------|
| GET | `/customers/:customerId/profile` | Get customer analytics profile | ✅ |

### `reports.routes.ts`
**Base Path:** `/reports`

| Method | Path | Description | Auth Required |
|--------|------|-------------|---------------|
| GET | `/reports/sales` | Get sales report | ✅ |
| GET | `/reports/venue-comparison` | Get venue comparison report | ✅ |
| GET | `/reports/customer-insights` | Get customer insights report | ✅ |

### `venue-analytics.routes.ts`
**Base Path:** `/venues/:venueId`

| Method | Path | Description | Auth Required |
|--------|------|-------------|---------------|
| GET | `/venues/:venueId/dashboard` | Get venue dashboard data | ✅ |
| GET | `/venues/:venueId/analytics` | Get venue analytics | ✅ |

### `cancellation.routes.ts`
**Base Path:** `/events/:eventId/cancel`

| Method | Path | Description | Auth Required |
|--------|------|-------------|---------------|
| POST | `/events/:eventId/cancel` | Cancel event with reason | ✅ |

### `event-content.routes.ts` (MongoDB)
**Base Path:** `/:eventId/content`

| Method | Path | Description | Auth Required |
|--------|------|-------------|---------------|
| POST | `/:eventId/content` | Create event content | Not specified |
| GET | `/:eventId/content` | Get all event content | Not specified |
| GET | `/:eventId/content/:contentId` | Get specific content | Not specified |
| PUT | `/:eventId/content/:contentId` | Update content | Not specified |
| DELETE | `/:eventId/content/:contentId` | Delete content | Not specified |
| POST | `/:eventId/content/:contentId/publish` | Publish content | Not specified |
| POST | `/:eventId/content/:contentId/archive` | Archive content | Not specified |
| GET | `/:eventId/gallery` | Get gallery content | Not specified |
| GET | `/:eventId/lineup` | Get lineup content | Not specified |
| GET | `/:eventId/schedule` | Get schedule content | Not specified |
| GET | `/:eventId/performers` | Get performers content | Not specified |

### `event-reviews.routes.ts` (MongoDB)
**Base Path:** `/:eventId/reviews` and `/:eventId/ratings`

| Method | Path | Description | Auth Required |
|--------|------|-------------|---------------|
| POST | `/:eventId/reviews` | Create review | Not specified |
| GET | `/:eventId/reviews` | Get reviews | Not specified |
| GET | `/:eventId/reviews/:reviewId` | Get specific review | Not specified |
| PUT | `/:eventId/reviews/:reviewId` | Update review | Not specified |
| DELETE | `/:eventId/reviews/:reviewId` | Delete review | Not specified |
| POST | `/:eventId/reviews/:reviewId/helpful` | Mark review as helpful | Not specified |
| POST | `/:eventId/reviews/:reviewId/report` | Report review | Not specified |
| POST | `/:eventId/ratings` | Submit rating | Not specified |
| GET | `/:eventId/ratings/summary` | Get rating summary | Not specified |
| GET | `/:eventId/ratings/me` | Get user's rating | Not specified |

### `health.routes.ts`
**Base Path:** `/health` and `/metrics`

| Method | Path | Description | Auth Required |
|--------|------|-------------|---------------|
| GET | `/health` | Comprehensive health check | ❌ |
| GET | `/metrics` | Prometheus metrics | ❌ |

---

## Services (`src/services/`)

### `event.service.ts`
**Purpose:** Core event business logic with blockchain integration

**Key Methods:**
- `createEvent()` - Creates event with blockchain sync, capacity, schedule, and metadata
- `getEvent()` - Retrieves event with enriched relations
- `listEvents()` - Lists events with pagination
- `updateEvent()` - Updates event with validation and cache invalidation
- `deleteEvent()` - Soft deletes event
- `publishEvent()` - Changes event status to PUBLISHED
- `getVenueEvents()` - Gets all events for a venue
- `enrichEventWithRelations()` - Adds schedule and capacity to event object
- `checkForDuplicateEvent()` - Prevents duplicate events
- `generateBlockchainEventId()` - Converts UUID to numeric blockchain ID

**Key Features:**
- Blockchain integration for immutable event data
- Automatic slug generation
- Venue access validation via venue service client
- Timezone validation
- Duplicate event prevention
- Audit logging
- Redis cache invalidation
- Search sync publishing
- Artist/venue royalty splits on blockchain
- Transaction support for data consistency

### `blockchain.service.ts`
**Purpose:** Handles blockchain integration for events

**Key Methods:**
- `createEventOnChain()` - Creates event on Solana blockchain with royalty splits
- `deriveVenuePDA()` - Derives venue PDA address
- `getClient()` - Lazy loads blockchain client
- `close()` - Cleans up blockchain client

**Key Features:**
- Uses shared BlockchainClient from @tickettoken/shared
- Immutable royalty splits (artist % + venue %)
- Percentage to basis points conversion
- Event PDA derivation
- Circuit breaker pattern
- Comprehensive error handling

### `capacity.service.ts`
**Purpose:** Manages event capacity with reservation system and price locking

**Key Methods:**
- `getEventCapacity()` - Gets all capacity sections for event
- `getCapacityById()` - Gets single capacity section
- `createCapacity()` - Creates capacity section with venue validation
- `updateCapacity()` - Updates capacity with venue capacity check
- `checkAvailability()` - Checks if tickets available
- `reserveCapacity()` - Reserves capacity with row-level locks and price locking
- `releaseReservation()` - Releases reserved capacity
- `confirmReservation()` - Confirms reservation as sold
- `releaseExpiredReservations()` - Cleanup expired reservations
- `getTotalEventCapacity()` - Gets aggregate capacity stats
- `validateVenueCapacity()` - Ensures total doesn't exceed venue max
- `getLockedPrice()` - Gets locked price for reservation

**Key Features:**
- Row-level locking with `forUpdate()` for race condition prevention
- Automatic price locking during reservation
- Expiring reservations (default 15 minutes)
- Venue capacity validation
- Decimal field parsing for pricing
- Transaction support for atomic operations

### `cancellation.service.ts`
**Purpose:** Handles event cancellation with deadline enforcement

**Key Methods:**
- `cancelEvent()` - Cancels event with reason and refund trigger
- `validateCancellationPermission()` - Checks if user can cancel

**Key Features:**
- Cancellation deadline enforcement (default 24 hours before event)
- Audit logging of cancellations
- Transaction support
- Refund trigger flag

### `pricing.service.ts`
**Purpose:** Manages pricing tiers and calculations

**Key Methods:**
- `getEventPricing()` - Gets all pricing tiers
- `getPricingById()` - Gets single pricing tier
- `createPricing()` - Creates pricing tier
- `updatePricing()` - Updates pricing tier
- `calculatePrice()` - Calculates total price with fees and tax
- `updateDynamicPrice()` - Updates price for dynamic pricing
- `getActivePricing()` - Gets currently active pricing
- `applyEarlyBirdPricing()` - Applies early bird rates
- `applyLastMinutePricing()` - Applies last minute rates
- `parseDecimalFields()` - Converts string decimals to numbers

**Key Features:**
- Dynamic pricing support (min/max bounds)
- Early bird pricing
- Last minute pricing
- Service fees and facility fees
- Tax calculation
- Group discounts
- Time-based sales windows
- Decimal field parsing

### `event-content.service.ts` (MongoDB)
**Purpose:** Manages rich event content in MongoDB

**Key Methods:**
- `createContent()` - Creates event content
- `updateContent()` - Updates content with versioning
- `deleteContent()` - Deletes content
- `getContent()` - Gets single content
- `getEventContent()` - Gets all content for event (filtered by type/status)
- `publishContent()` - Publishes content
- `archiveContent()` - Archives content
- `getGallery()` - Gets gallery images
- `getLineup()` - Gets event lineup
- `getSchedule()` - Gets detailed schedule
- `getPerformers()` - Gets performer bios

**Key Features:**
- MongoDB-based for flexible schema
- Content versioning
- Status workflow (draft → published → archived)
- Content types (GALLERY, LINEUP, SCHEDULE, PERFORMER_BIO)
- Display ordering
- Featured content support

### `venue-service.client.ts`
**Purpose:** HTTP client for venue service with circuit breaker

**Key Methods:**
- `validateVenueAccess()` - Checks if user has access to venue
- `getVenue()` - Gets venue details
- `request()` - Internal HTTP request method

**Key Features:**
- Circuit breaker pattern (opossum) for resilience
- Proper error propagation (404, 403, etc.)
- Authorization header forwarding
- Timeout configuration (5s)
- Error threshold and reset timeout

### `healthCheck.service.ts`
**Purpose:** Comprehensive health checking

**Key Methods:**
- `performHealthCheck()` - Checks all dependencies
- `checkDatabase()` - PostgreSQL health
- `checkRedis()` - Redis health
- `checkVenueService()` - Venue service health
- `checkAuthService()` - Auth service health

**Key Features:**
- Multi-dependency health checks
- Response time tracking
- Overall status (healthy/degraded/unhealthy)
- Service uptime tracking
- 5s timeout for external services

### `cache-integration.ts`
**Purpose:** Redis caching abstraction

**Key Methods:**
- `get()` - Gets cached value
- `set()` - Sets cached value with TTL
- `delete()` - Deletes cache keys (supports patterns)
- `invalidateCache()` - Invalidates cache patterns
- `flush()` - Flushes entire cache
- `getStats()` - Gets cache connection status

**Key Features:**
- Pattern-based invalidation (wildcards)
- TTL support (default 1 hour)
- JSON serialization
- Error handling with fallback
- Retry strategy

### `reservation-cleanup.service.ts`
**Purpose:** Background job to release expired reservations

**Key Methods:**
- `start()` - Starts background job
- `stop()` - Stops background job
- `runCleanup()` - Executes cleanup logic
- `triggerCleanup()` - Manual cleanup trigger
- `getStatus()` - Gets job status

**Key Features:**
- Interval-based execution (default 1 minute)
- Uses CapacityService for cleanup
- Manual trigger support
- Status reporting

### `databaseService.ts`
**Purpose:** Database connection pooling (referenced but not analyzed in detail)

---

## Controllers (`src/controllers/`)

### `events.controller.ts`
**Exports:** 7 async functions

**Functions:**
- `createEvent()` - Handles event creation with validation
- `getEvent()` - Gets single event
- `listEvents()` - Lists events with filters
- `updateEvent()` - Updates event
- `deleteEvent()` - Deletes event (204 response)
- `publishEvent()` - Publishes event
- `getVenueEvents()` - Gets venue events

**Features:**
- Comprehensive error handling
- Custom error types (ValidationError, NotFoundError, ForbiddenError)
- Dependency injection via container
- User and tenant context extraction
- Audit logging (IP, user agent)

### `capacity.controller.ts`
**Exports:** 7 async functions

**Functions:**
- `getEventCapacity()` - Gets capacity sections
- `getTotalCapacity()` - Gets total capacity stats
- `getCapacityById()` - Gets single capacity
- `createCapacity()` - Creates capacity section
- `updateCapacity()` - Updates capacity
- `checkAvailability()` - Checks availability
- `reserveCapacity()` - Reserves capacity

### `pricing.controller.ts`
**Exports:** 6 async functions

**Functions:**
- `getEventPricing()` - Gets pricing tiers
- `getPricingById()` - Gets single pricing
- `createPricing()` - Creates pricing tier
- `updatePricing()` - Updates pricing
- `calculatePrice()` - Calculates price
- `getActivePricing()` - Gets active pricing

### `schedule.controller.ts`
**Exports:** Multiple functions (referenced but not fully analyzed)

**Functions:**
- `getSchedules()` - Gets event schedules
- `createSchedule()` - Creates schedule
- `getUpcomingSchedules()` - Gets upcoming schedules
- `getNextSchedule()` - Gets next schedule
- `getSchedule()` - Gets specific schedule
- `updateSchedule()` - Updates schedule

### `tickets.controller.ts`
**Exports:** Multiple functions (referenced)

**Functions:**
- `getTicketTypes()` - Gets ticket types
- `createTicketType()` - Creates ticket type
- `updateTicketType()` - Updates ticket type

### `notification.controller.ts`
**Exports:** Multiple functions (referenced)

**Functions:**
- `createNotification()` - Creates notification
- `getUserNotifications()` - Gets user notifications
- `markAsRead()` - Marks notification as read

### `customer-analytics.controller.ts`
**Exports:** Multiple functions (referenced)

**Functions:**
- `getCustomerProfile()` - Gets customer analytics

### `report-analytics.controller.ts`
**Exports:** Multiple functions (referenced)

**Functions:**
- `getSalesReport()` - Gets sales report
- `getVenueComparisonReport()` - Gets venue comparison
- `getCustomerInsightsReport()` - Gets customer insights

### `venue-analytics.controller.ts`
**Exports:** Multiple functions (referenced)

**Functions:**
- `getVenueDashboard()` - Gets venue dashboard
- `getVenueAnalytics()` - Gets venue analytics

### `cancellation.controller.ts`
**Exports:** Functions (referenced)

**Functions:**
- `cancelEvent()` - Cancels event

### `event-content.controller.ts` (MongoDB)
**Exports:** EventContentController class

**Methods:**
- Content CRUD operations
- Publish/archive actions
- Gallery, lineup, schedule, performers getters

### `event-reviews.controller.ts` (MongoDB)
**Exports:** EventReviewsController class

**Methods:**
- Review CRUD operations
- Rating submission
- Helpful/report actions

---

## Middleware (`src/middleware/`)

### `auth.ts`
**Purpose:** JWT authentication with RSA public key verification

**Functions:**
- `authenticateFastify()` - Main auth middleware

**Features:**
- RSA-256 signature verification
- Public key loaded from filesystem
- Token type validation (access vs refresh)
- Tenant ID validation
- User context injection
- JWT expiration handling
- Issuer and audience validation

### `tenant.ts`
**Purpose:** Multi-tenancy support

**Functions:**
- `tenantHook()` - Extracts tenant_id from JWT
- `optionalTenantHook()` - Optional tenant extraction

**Features:**
- Tenant context injection from JWT
- Required and optional variants
- Integration with auth middleware

### `error-handler.ts`
**Purpose:** Global error handling

**Functions:**
- `errorHandler()` - Centralized error handler
- `getSafeErrorMessage()` - Safe error messages for production
- `getErrorName()` - HTTP status to name mapping
- `registerErrorHandler()` - Registers handler with Fastify

**Features:**
- Environment-aware error messages
- Status code mapping
- Error sanitization
- Logging integration

### `rate-limit.ts`
**Purpose:** Rate limiting

**Functions:**
- `registerRateLimiting()` - Registers rate limiter

**Features:**
- Fastify rate limit plugin
- Configurable limits

### `input-validation.ts`
**Purpose:** Input sanitization and validation

**Functions:**
- `sanitizeString()` - Removes dangerous characters
- `validateUrl()` - URL validation
- `validateDateRange()` - Date range validation
- `sanitizeObject()` - Recursive object sanitization
- `sanitizeRequestBody()` - Request body sanitization middleware
- `validatePagination()` - Pagination parameter validation
- `validateEmail()` - Email validation
- `validateUUID()` - UUID validation

**Features:**
- XSS prevention
- SQL injection prevention
- Type validation
- Recursive sanitization
- Pagination bounds checking

---

## Config (`src/config/`)

### `index.ts`
**Purpose:** Main application configuration

**Exports:** `config` object with:
- Port and host
- Environment
- Database connection
- Redis connection
- Service URLs (venue, auth)

### `database.ts`
**Purpose:** PostgreSQL/Knex configuration

### `redis.ts`
**Purpose:** Redis connection configuration

### `mongodb.ts`
**Purpose:** MongoDB connection for content and reviews

### `secrets.ts`
**Purpose:** Secret management (JWT keys, API keys)

### `dependencies.ts`
**Purpose:** Dependency injection container (Awilix)

### `env-validation.ts`
**Purpose:** Environment variable validation

---

## Migrations (`src/migrations/`)

### `001_baseline_event.ts`
**Purpose:** Creates event service database schema

**Tables Created:**
1. **`event_categories`** - Hierarchical event categories
   - Fields: id, parent_id, name, slug, description, icon, color, display_order, is_active, is_featured, meta fields, event_count
   - Indexes: parent_id, slug, is_active
   - Seeded with 10 default categories (Music, Sports, Theater, etc.)

2. **`events`** - Main events table (50+ fields)
   - Core: id, tenant_id, venue_id, name, slug, description
   - Classification: event_type, primary_category_id, secondary_category_ids, tags
   - Status: status, visibility, is_featured, priority_score
   - Media: banner_image_url, thumbnail_image_url, image_gallery, video_url
   - Blockchain: collection_address, mint_authority, royalty_percentage, event_pda, blockchain_status
   - Virtual: is_virtual, is_hybrid, streaming_platform, streaming_config, virtual_event_url
   - Policies: cancellation_policy, refund_policy, cancellation_deadline_hours
   - Transfer: allow_transfers, max_transfers_per_ticket, transfer_blackout dates
   - SEO: meta_title, meta_description, meta_keywords
   - Analytics: view_count, interest_count, share_count
   - Audit: created_by, updated_by, created_at, updated_at, deleted_at
   - Indexes: 20+ indexes including GIN for JSONB, full-text search, composite tenant indexes
   - Constraints: status check, visibility check, event_type check
   - Foreign keys: tenant_id, venue_id, venue_layout_id, created_by, updated_by

3. **`event_schedules`** - Event date/time schedules
   - Fields: id, tenant_id, event_id, starts_at, ends_at, doors_open_at, is_recurring, recurrence_rule, timezone, utc_offset, status, capacity_override, check_in times, notes
   - Indexes: tenant_id, event_id, starts_at, status, composite tenant_starts
   - Constraints: status check
   - Foreign keys: tenant_id, event_id (CASCADE)

4. **`event_capacity`** - Capacity/inventory sections
   - Fields: id, tenant_id, event_id, schedule_id, section_name, section_code, tier, total_capacity, available_capacity, reserved_capacity, buffer_capacity, sold_count, pending_count, reserved_at, reserved_expires_at, locked_price_data, row_config, seat_map, purchase limits
   - Indexes: tenant_id, event_id, schedule_id, available_capacity, reserved_expires_at, unique constraint on event/section/schedule
   - Foreign keys: tenant_id, event_id (CASCADE), schedule_id

5. **`event_pricing`** - Pricing tiers
   - Fields: id, tenant_id, event_id, schedule_id, capacity_id, name, description, tier, base_price, service_fee, facility_fee, tax_rate, is_dynamic, min/max prices, price_adjustment_rules, current_price, early_bird pricing, last_minute pricing, group discounts, currency, sales windows, max per order/customer, display_order
   - Indexes: tenant_id, event_id, schedule_id, capacity_id, active_sales composite
   - Foreign keys: tenant_id, event_id (CASCADE), schedule_id, capacity_id

6. **`event_metadata`** - Extended event metadata
   - Fields: id, tenant_id, event_id, performers, headliner, supporting_acts, production_company, technical_requirements, stage_setup_time, sponsors, licensing, insurance, press_release, marketing_copy, social_media_copy, audio/visual requirements, catering, rider, budgets, previous_events, custom_fields
   - Indexes: event_id
   - Foreign keys: tenant_id, event_id (CASCADE - one-to-one)

**Triggers:**
- `update_updated_at_column` on all tables for automatic timestamp updates
- Audit trigger on events table for compliance

**Tenant Isolation:**
- Foreign key constraints on tenant_id for all tables
- Composite indexes for tenant-scoped queries
- RESTRICT on delete to prevent orphaned data

**Cross-Service Foreign Keys:**
- `events.venue_id` → `venues.id`
- `events.venue_layout_id` → `venue_layouts.id`
- `events.created_by` → `users.id`
- `events.updated_by` → `users.id`

---

## Validators (`src/validations/`)

### `event-security.ts`
**Purpose:** Business rule validation

**Class:** `EventSecurityValidator`

**Methods:**
- `validateTicketPurchase()` - Validates purchase limits
- `validateEventDate()` - Validates event date range (2 hours to 365 days in advance)
- `validateEventModification()` - Validates modification permissions
- `validateEventDeletion()` - Validates deletion permissions
- `validateVenueCapacity()` - Validates capacity vs venue max

**Configuration:**
- `maxAdvanceDays`: 365 days
- `minAdvanceHours`: 2 hours
- `maxTicketsPerOrder`: 10
- `maxTicketsPerCustomer`: 50

---

## Models (`src/models/`)

### `base.model.ts`
**Purpose:** Base model with common CRUD operations

**Class:** `BaseModel<T>`

**Methods:**
- `findAll()` - Find all records with conditions
- `findOne()` - Find single record
- `findById()` - Find by ID
- `create()` - Create new record
- `update()` - Update by ID
- `delete()` - Soft delete (sets deleted_at)
- `hardDelete()` - Permanent delete
- `count()` - Count records
- `exists()` - Check if exists

### `event.model.ts`
**Extends:** `BaseModel`

**Additional Methods:**
- `findBySlug()` - Find by slug
- `createWithDefaults()` - Create with defaults and slug generation
- `getEventsByVenue()` - Get events by venue
- `getEventsByCategory()` - Get events by category
- `getFeaturedEvents()` - Get featured events
- `searchEvents()` - Full-text search
- `incrementViewCount()` - Analytics tracking
- `incrementInterestCount()` - Analytics tracking
- `incrementShareCount()` - Analytics tracking
- `transformForDb()` / `transformFromDb()` - Data transformation
- `generateSlug()` - Slug generation from name

### `event-category.model.ts`
**Extends:** `BaseModel`

**Additional Methods:**
- `findBySlug()` - Find category by slug
- `findTopLevel()` - Get top-level categories (no parent)
- `findByParentId()` - Get child categories
- `findFeatured()` - Get featured categories
- `getCategoryTree()` - Get hierarchical tree

### `event-schedule.model.ts`
**Extends:** `BaseModel`

**Additional Methods:**
- `findByEventId()` - Get schedules for event
- `findUpcomingSchedules()` - Get future schedules
- `findSchedulesByDateRange()` - Date range query
- `getNextSchedule()` - Get next scheduled occurrence
- `updateWithTenant()` - Update with tenant validation

### `event-capacity.model.ts`
**Extends:** `BaseModel`

**Additional Methods:**
- `findByEventId()` - Get capacity sections for event
- `findByScheduleId()` - Get capacity for schedule
- `getTotalCapacity()` - Sum total capacity
- `getAvailableCapacity()` - Sum available capacity
- `updateSoldCount()` - Update sold count
- `updatePendingCount()` - Update pending count
- `decrementPendingCount()` - Decrement pending

### `event-pricing.model.ts`
**Extends:** `BaseModel`

**Additional Methods:**
- `findByEventId()` - Get pricing for event
- `findByScheduleId()` - Get pricing for schedule
- `findByCapacityId()` - Get pricing for capacity section
- `getActivePricing()` - Get currently active pricing
- `calculateTotalPrice()` - Calculate total with fees

### `event-metadata.model.ts`
**Extends:** `BaseModel`

**Additional Methods:**
- `findByEventId()` - Get metadata for event
- `upsert()` - Create or update metadata

### `mongodb/event-content.model.ts` (MongoDB/Mongoose)
**Purpose:** Flexible event content storage

**Schema Fields:**
- eventId (ObjectId reference)
- contentType (enum: GALLERY, LINEUP, SCHEDULE, PERFORMER_BIO, ANNOUNCEMENT)
- content (Mixed - flexible JSON)
- status (enum: draft, published, archived)
- displayOrder, featured, primaryImage flags
- version number
- createdBy, updatedBy
- Timestamps: createdAt, updatedAt, publishedAt, archivedAt

---

## Types (`src/types/`)

### `index.ts`
**Purpose:** TypeScript type definitions

**Exported Types:**
- `AppConfig` - Application configuration interface
- `Dependencies` - DI container types
- `AuthenticatedRequest` - Fastify request with user context
- `AuthenticatedHandler` - Handler function type
- `Event` - Legacy event type (backward compatibility)
- `TicketType` - Ticket type interface
- `PricingRule` - Pricing rule interface
- `ServiceResponse<T>` - Generic service response

**Error Classes:**
- `AppError` - Base error class
- `ValidationError` - 422 validation errors
- `NotFoundError` - 404 not found
- `UnauthorizedError` - 401 unauthorized
- `ForbiddenError` - 403 forbidden

**Re-exports:** All model interfaces (IEvent, IEventCategory, IEventSchedule, IEventCapacity, IEventPricing, IEventMetadata)

---

## Utils (`src/utils/`)

### `audit-logger.ts`
**Purpose:** Audit logging for compliance

**Class:** `EventAuditLogger`

**Methods:**
- `logEventAction()` - Log generic event action
- `logEventUpdate()` - Log event updates with diff
- `logEventDeletion()` - Log event deletion

**Features:**
- Writes to audit_logs table
- Captures IP address and user agent
- JSON change tracking
- Tenant-scoped logging

### `error-response.ts`
**Purpose:** Standardized error responses

### `errors.ts`
**Purpose:** Custom error classes

### `logger.ts`
**Purpose:** Pino logger configuration

### `metrics.ts`
**Purpose:** Prometheus metrics

**Metrics:**
- Request counters
- Response times
- Cache invalidation counters
- Error counters

### `timezone-validator.ts`
**Purpose:** Timezone validation

**Functions:**
- `validateTimezoneOrThrow()` - Validates timezone string against IANA database

---

## Other Folders

### `tests/`
**Contents:**
- `00-MASTER-DOCUMENTATION.md` - Test master doc
- `01-FUNCTION-INVENTORY.md` - Function inventory
- `02-TEST-SPECIFICATIONS.md` - Test specifications
- `e2e/` - End-to-end tests
- `integration/` - Integration tests (45+ test files)
- `unit/` - Unit tests
- `load/` - Load tests
- `fixtures/` - Test data and fixtures

### `coverage/`
**Contents:** Test coverage reports (lcov, HTML)

---

## External Service Dependencies

### Configured Services:
1. **Venue Service** (`VENUE_SERVICE_URL`)
   - Venue access validation
   - Venue details retrieval
   - Venue capacity validation

2. **Auth Service** (`AUTH_SERVICE_URL`)
   - User authentication (JWT verification done locally)
   - Health checks

3. **Blockchain** (`SOLANA_RPC_URL`, `TICKETTOKEN_PROGRAM_ID`)
   - Event creation on-chain
   - Immutable royalty splits
   - Event PDA management

### Database Services:
1. **PostgreSQL** - Primary data store (via Knex.js)
2. **Redis** - Caching and session management
3. **MongoDB** - Rich content and reviews (via Mongoose)

### Shared Packages:
- `@tickettoken/shared` - Blockchain client, search sync, utilities

---

## Key Features Summary

### Multi-Tenancy
- Tenant isolation at database level with FK constraints
- Tenant context from JWT in all operations
- Composite indexes for tenant-scoped queries
- RESTRICT deletion to prevent orphaned data

### Blockchain Integration
- Creates events on Solana blockchain
- Immutable artist/venue royalty splits
- Event PDA derivation
- Blockchain status tracking (pending, synced, failed)
- Automatic retry and error handling

### Capacity Management
- Row-level locking for race condition prevention
- Reservation system with expiration (15 min default)
- Price locking during reservation
- Automatic cleanup of expired reservations
- Venue capacity validation
- Buffer capacity support

### Dynamic Pricing
- Time-based pricing (early bird, last minute)
- Min/max price bounds
- Service and facility fees
- Tax calculation
- Group discounts
- Currency support

### Event Content (MongoDB)
- Flexible schema for rich content
- Content types: gallery, lineup, schedule, performer bios
- Versioning and status workflow
- Display ordering and featured content

### Security
- RSA-256 JWT verification
- Input sanitization (XSS, SQL injection prevention)
- Rate limiting
- Audit logging for compliance
- Business rule validation (purchase limits, date ranges)

### Performance
- Redis caching with pattern-based invalidation
- Composite indexes for common queries
- Connection pooling
- Circuit breaker for external services
- GIN indexes for JSONB and full-text search

### Observability
- Comprehensive health checks
- Prometheus metrics
- Pino structured logging
- Error tracking
- Response time monitoring

---

## Database Schema Summary

**Tables Owned by Event Service:**
- `event_categories` (10 seeded categories)
- `events` (50+ fields, blockchain integration)
- `event_schedules` (recurring event support)
- `event_capacity` (section-based capacity)
- `event_pricing` (dynamic pricing, fees, tax)
- `event_metadata` (extended event data)

**MongoDB Collections:**
- `event_content` (flexible content storage)
- `event_reviews` (reviews and ratings - referenced)

**Cross-Service References:**
- Uses `tenants`, `users`, `venues`, `venue_layouts` tables from other services
- Uses shared `audit_logs` table

**Indexes:** 20+ indexes for performance, including GIN for JSONB and full-text search

---

## API Authentication

All routes (except `/health` and `/metrics`) require:
- **Bearer Token:** JWT in Authorization header
- **Token Type:** Access token (not refresh)
- **Required Claims:** sub (user ID), tenant_id, type='access'
- **Verification:** RSA-256 signature with public key

---

## Environment Variables

### Required:
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` - PostgreSQL
- `REDIS_HOST`, `REDIS_PORT` - Redis
- `MONGODB_URI` - MongoDB connection string
- `JWT_PUBLIC_KEY_PATH` - Path to RSA public key for JWT verification
- `VENUE_SERVICE_URL` - Venue service endpoint
- `AUTH_SERVICE_URL` - Auth service endpoint
- `SOLANA_RPC_URL` - Solana RPC endpoint
- `TICKETTOKEN_PROGRAM_ID` - Smart contract program ID
- `PLATFORM_WALLET_PATH` - Platform wallet for blockchain transactions

### Optional:
- `PORT` (default: 3003)
- `HOST` (default: 0.0.0.0)
- `NODE_ENV` (default: development)
- `JWT_ISSUER`, `JWT_AUDIENCE` - JWT validation
- `ORACLE_FEED_ADDRESS` - Price oracle for blockchain
- `DEFAULT_MERKLE_TREE` - Default merkle tree for NFTs

---

## Service Port
**Default:** `3003`

## Technology Stack
- **Framework:** Fastify
- **Language:** TypeScript
- **Databases:** PostgreSQL (Knex.js), Redis, MongoDB (Mongoose)
- **Blockchain:** Solana (@solana/web3.js)
- **Authentication:** JWT (jsonwebtoken, RSA-256)
- **DI Container:** Awilix
- **Resilience:** Opossum (circuit breaker)
- **Logging:** Pino
- **Metrics:** Prom-client (Prometheus)
- **Testing:** Jest
