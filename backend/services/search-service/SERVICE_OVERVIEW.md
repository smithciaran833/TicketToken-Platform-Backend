# Search Service - Service Overview

## Service Purpose
The **search-service** provides powerful Elasticsearch-based search functionality for events, venues, tickets, and marketplace listings. It implements:
- Full-text search with fuzzy matching and synonyms
- Geolocation-based search (near-me functionality)
- Advanced filtering and faceted search
- Autocomplete/suggestions
- Search consistency tracking and read-after-write guarantees
- Tenant isolation with Row-Level Security
- Data enrichment from PostgreSQL and MongoDB sources

---

## Routes (`routes/`)

### Health Routes (`health.routes.ts`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Basic health check |
| GET | `/health/db` | Database connectivity check |

### Search Routes (`search.controller.ts`)
**Prefix:** `/api/v1/search`  
**Middleware:** `authenticate`, `requireTenant`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Main search endpoint (events & venues) |
| GET | `/venues` | Search venues only |
| GET | `/events` | Search events (supports date filtering) |
| GET | `/suggest` | Autocomplete suggestions |

**Query Parameters:**
- `q` - Search query string
- `type` - Filter by type (venues/events)
- `limit` - Max results (1-100, default 20)
- `date_from` - Start date filter (events)
- `date_to` - End date filter (events)

### Professional Search Routes (`professional-search.controller.ts`)
**Prefix:** `/api/v1/pro`  
**Middleware:** `authenticate`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/advanced` | Advanced search with filters, sorting, facets |
| GET | `/near-me` | Geolocation-based search |
| GET | `/trending` | Get trending searches |
| GET | `/:index/:id/similar` | Find similar items (more-like-this) |

**Advanced Search Features:**
- Text search with fuzzy matching
- Geolocation filtering (within distance)
- Price range filtering
- Date range filtering
- Category/genre filtering
- Performer/artist filtering
- Amenities/accessibility filtering
- Minimum rating filtering
- Sorting (distance, date, price, popularity)
- Aggregations/facets (categories, price ranges, venues, dates, performers, amenities)

---

## Services (`services/`)

### `search.service.ts`
**Purpose:** Core search functionality with consistency support

**Key Methods:**
- `search(query, type?, limit?, options?)` - Main search with tenant filtering
- `searchVenues(query, options?)` - Search venues only
- `searchEvents(query, options?)` - Search events only
- `searchEventsByDate(dateFrom?, dateTo?, options?)` - Date-based event search
- `trackSearch(query, resultsCount, userId?)` - Analytics tracking
- `getPopularSearches(limit?)` - Get popular search queries

**Features:**
- Multi-match queries with fuzzy matching
- Tenant isolation filtering
- Read-after-write consistency support
- Session stickiness via preference parameter
- Search analytics tracking

### `professional-search.service.ts`
**Purpose:** Advanced search with comprehensive filtering and aggregations

**Key Methods:**
- `search(params)` - Advanced search with all filters/facets
- `searchNearMe(lat, lon, distance?, type?)` - Geolocation search
- `getTrending(limit?)` - Get trending searches (last 7 days)
- `findSimilar(index, id)` - More-like-this search

**Features:**
- Redis caching (5 min TTL)
- Complex boolean queries
- Geo-distance filtering
- Nested queries (performers, genres)
- Price/date/capacity range filtering
- Aggregations (categories, prices, venues, dates, performers, amenities, ratings)
- Search highlighting
- Phrase suggestions
- Result personalization

### `autocomplete.service.ts`
**Purpose:** Fast autocomplete suggestions using completion suggesters

**Key Methods:**
- `getSuggestions(query, types?)` - Get autocomplete suggestions
- `getSuggestionsWithContext(query, context?)` - Context-aware suggestions

**Features:**
- Elasticsearch completion suggesters
- Fuzzy matching for typos
- Duplicate skipping
- Context filtering (city, category)
- Combined results from multiple indices

### `consistency.service.ts`
**Purpose:** Search consistency tracking and read-after-write guarantees

**Key Methods:**
- `indexWithConsistency(operation, clientId?)` - Index with version tracking
- `waitForConsistency(token, maxWaitMs?)` - Wait for data to be indexed
- `generateConsistencyToken(entityType, entityId, clientId?)` - Create consistency token
- `forceRefresh(indices?)` - Force index refresh

**Features:**
- Version-based consistency tracking
- Idempotent indexing operations
- Consistency tokens for clients
- Background queue processing
- Retry logic with exponential backoff
- Index operation prioritization

**Tables:**
- `index_versions` - Track entity versions and index status
- `index_queue` - Queue of pending index operations
- `read_consistency_tokens` - Client consistency tokens

### `sync.service.ts`
**Purpose:** Syncs data from RabbitMQ to Elasticsearch with enrichment

**Key Methods:**
- `processMessage(routingKey, content, clientId?)` - Process sync messages
- `syncVenue(action, venue, clientId?)` - Sync venue with enrichment
- `syncEvent(action, event, clientId?)` - Sync event with enrichment
- `syncTicket(action, ticket, clientId?)` - Sync ticket with enrichment

**Features:**
- Enriches entities before indexing
- Consistency token generation
- Fallback to basic data if enrichment fails
- High priority indexing
- Event re-indexing on ticket changes

### `event-enrichment.service.ts`
**Purpose:** Enriches events with data from PostgreSQL and MongoDB

**Data Sources:**
- PostgreSQL: events, venues, performers, tickets, event_performers
- MongoDB: event_content, ratings

**Key Methods:**
- `enrich(eventId)` - Enrich single event
- `bulkEnrich(eventIds)` - Enrich multiple events
- `getRatings(eventId)` - Get event ratings
- `calculateSearchBoost(event, ratings, pricingStats)` - Calculate boost score

**Enrichment Data:**
- Event details (title, description, category, tags)
- Venue information (name, city, location)
- Performers/lineup
- Pricing stats (min/max/avg price)
- Ticket sales/capacity
- Images from MongoDB
- Ratings and reviews

### `venue-enrichment.service.ts`
**Purpose:** Enriches venues with data from PostgreSQL and MongoDB

**Data Sources:**
- PostgreSQL: venues, venue_sections
- MongoDB: venue_content, ratings

**Key Methods:**
- `enrich(venueId)` - Enrich single venue
- `bulkEnrich(venueIds)` - Enrich multiple venues
- `getRatings(venueId)` - Get venue ratings
- `calculateSearchBoost(venue, ratings)` - Calculate boost score

**Enrichment Data:**
- Venue details (name, type, capacity)
- Address and geolocation
- Sections with pricing
- Amenities and accessibility features
- Images from MongoDB
- Ratings (overall + category ratings)
- Contact information
- Operating hours
- Parking info
- Policies

### `ticket-enrichment.service.ts`
**Purpose:** Enriches tickets with transfer history, validations, NFT data

**Data Sources:**
- PostgreSQL: tickets, ticket_transfers, ticket_validations, nfts, marketplace_listings, ticket_price_history

**Key Methods:**
- `enrich(ticketId)` - Enrich single ticket
- `bulkEnrich(ticketIds)` - Enrich multiple tickets
- `calculateSearchScore(ticket, transfers, validations)` - Calculate search score

**Enrichment Data:**
- Ticket details (section, row, seat)
- Pricing history
- Transfer history
- Marketplace listing info
- NFT/blockchain data
- Validation history
- Delivery information
- Perks, restrictions, flags

### `marketplace-enrichment.service.ts`
**Purpose:** Enriches marketplace listings with ticket, event, seller data

**Data Sources:**
- PostgreSQL: marketplace_listings, tickets, events, venues, users, marketplace_offers, nfts

**Key Methods:**
- `enrich(listingId)` - Enrich single listing
- `bulkEnrich(listingIds)` - Enrich multiple listings
- `calculateRecommendationScore(listing, seller, daysUntilEvent)` - Calculate recommendation
- `calculateUrgency(daysUntilEvent, listing)` - Calculate urgency level
- `calculateQualityScore(listing, seller, ticket)` - Calculate quality score
- `calculateSearchBoost(listing, seller, daysUntilEvent)` - Calculate boost score

**Enrichment Data:**
- Event and venue details
- Ticket information
- Seller reputation and stats
- Buyer protection info
- Pricing breakdown with comparables
- Offers on listing
- NFT/blockchain data
- Analytics (views, watchers, etc.)
- Recommendations and urgency
- Compliance checks
- Shipping information

### `content-sync.service.ts`
**Purpose:** Syncs MongoDB content to Elasticsearch

**Key Methods:**
- `syncVenueContent(venueId)` - Sync venue content (amenities, images, ratings)
- `syncEventContent(eventId)` - Sync event content (images, performers, ratings)
- `syncRatings(targetType, targetId)` - Sync ratings only
- `bulkSyncVenues()` - Bulk sync all venues
- `bulkSyncEvents()` - Bulk sync all events

### `ab-testing.service.ts`
**Purpose:** A/B testing framework for search algorithms

**Features:**
- Test variant assignment
- Weighted distribution
- Conversion tracking

### `cache-integration.ts`
**Purpose:** Shared cache integration from `@tickettoken/shared`

**Features:**
- Redis-backed caching
- Service-specific key prefixes
- Configurable TTLs
- Cache strategies and invalidation

---

## Controllers (`controllers/`)

### `search.controller.ts`
**Routes Registered:** `/api/v1/search`

**Methods:**
- `GET /` - Main search
- `GET /venues` - Venue search
- `GET /events` - Event search
- `GET /suggest` - Autocomplete

**Security:**
- Input sanitization (SearchSanitizer)
- Authentication required
- Tenant isolation required
- Query length limits

### `professional-search.controller.ts`
**Routes Registered:** `/api/v1/pro`

**Methods:**
- `POST /advanced` - Advanced search
- `GET /near-me` - Geolocation search
- `GET /trending` - Trending searches
- `GET /:index/:id/similar` - Similar items

**Security:**
- Authentication required
- Input validation (lat/lon)

---

## Repositories
**Status:** No dedicated repository layer - services interact directly with Knex, Elasticsearch, and MongoDB clients.

**Database Tables Queried:**
Via enrichment services:
- **events** - Event data
- **venues** - Venue data
- **venue_sections** - Venue seating sections
- **tickets** - Ticket data
- **ticket_transfers** - Transfer history
- **ticket_validations** - Validation history
- **ticket_price_history** - Price changes
- **event_performers** - Event performer relationships
- **performers** - Performer data
- **marketplace_listings** - Marketplace listings
- **marketplace_offers** - Offers on listings
- **nfts** - NFT/blockchain data
- **users** - User/seller data

Via consistency service:
- **index_versions** - Entity version tracking (RLS enabled)
- **index_queue** - Pending index operations (RLS enabled)
- **read_consistency_tokens** - Consistency tokens (RLS enabled)

**MongoDB Collections:**
- **venue_content** - Venue amenities, images, accessibility
- **event_content** - Event images, performers, lineup
- **ratings** - Ratings and reviews (via RatingService)

---

## Middleware (`middleware/`)

### `auth.middleware.ts`
**Purpose:** JWT authentication

**Functions:**
- `authenticate(request, reply)` - Verify JWT token
- `authorize(...roles)` - Role-based authorization
- `requireTenant(request, reply)` - Require tenant context

**Features:**
- JWT verification with configurable secret
- Token expiration handling
- User object population (id, venueId, role, permissions)

### `tenant.middleware.ts`
**Purpose:** Tenant validation

**Functions:**
- `requireTenant(request, reply)` - Enforce tenant requirement
- `optionalTenant(request, reply)` - Allow optional tenant

**Features:**
- venueId validation
- Format checking
- Error responses for missing/invalid tenant

### `tenant-context.ts`
**Purpose:** Sets PostgreSQL session variable for RLS

**Function:**
- `setTenantContext(request, reply)` - Set `app.current_tenant` session variable

**Features:**
- Extracts tenant from user/request
- Sets PostgreSQL session variable
- Fallback to default tenant
- Error handling with logging

### `rate-limit.middleware.ts`
**Purpose:** Advanced per-user and per-tenant rate limiting

**Classes:**
- `RateLimiter` - Rate limit checker with Redis
- `createRateLimitMiddleware(redis, config)` - Factory function
- `registerRateLimiting(fastify, redis, config?)` - Registration helper

**Features:**
- Per-user rate limiting
- Per-tenant aggregate limits
- Redis-backed counters
- Configurable windows and max requests
- Rate limit headers (X-RateLimit-*)
- 429 responses with retry-after

**Presets:**
- `search` - 100 req/min
- `suggest` - 200 req/min (higher for UX)
- `admin` - 1000 req/min
- `analytics` - 20 req/min (expensive ops)

### `validation.middleware.ts`
**Purpose:** Request validation using Joi schemas

**Functions:**
- `validateSearch` - Validate main search
- `validateVenues` - Validate venue search
- `validateEvents` - Validate event search
- `validateSuggestions` - Validate autocomplete
- `handleValidationError` - Error handler

**Features:**
- Schema-based validation
- Parameter sanitization
- Detailed error responses

---

## Config (`config/`)

### `database.ts`
**Purpose:** PostgreSQL/Knex configuration

**Exports:**
- `dbConfig` - Knex configuration object
- `db` - Knex instance
- `connectDatabase()` - Connection test function

**Connection:**
- Host: `DB_HOST` (default: postgres)
- Port: `DB_PORT` (default: 6432 - pgBouncer)
- Database: `DB_NAME`
- Pool: min 5, max 20

### `mongodb.ts`
**Purpose:** MongoDB configuration (read-only)

**Exports:**
- `mongoConfig` - Connection config with read-only settings
- `initializeMongoDB()` - Initialize connection
- `getMongoDB()` - Get active connection
- `closeMongoDB()` - Close connection
- `checkMongoDBHealth()` - Health check

**Features:**
- Read-only connection (secondaryPreferred)
- Connection pooling (2-10)
- Timeout configuration
- Event listeners
- SIGINT handler

### `rabbitmq.ts`
**Purpose:** RabbitMQ configuration for sync messages

**Exports:**
- `connectRabbitMQ()` - Connect and setup queues
- `channel` - AMQP channel

**Setup:**
- Exchange: `search.sync` (topic, durable)
- Queue: `search.sync.queue` (durable)
- Binding: All topics (#)
- Auto-reconnect on failure (5s delay)

### `dependencies.ts`
**Purpose:** Dependency injection container (Awilix)

**Function:**
- `initializeContainer()` - Setup DI container

**Registered Dependencies:**
- Infrastructure: db, logger, redis, elasticsearch, mongodb
- Shared: ratingService
- Core Services: searchService, autocompleteService, syncService, professionalSearchService
- Consistency: consistencyService, abTestingService
- Enrichment: eventEnrichmentService, venueEnrichmentService, ticketEnrichmentService, marketplaceEnrichmentService

### `fastify.ts`
**Purpose:** Fastify configuration and plugin registration

**Function:**
- `configureFastify(fastify, container)` - Setup Fastify

**Registered:**
- CORS (allow credentials)
- Helmet (security headers)
- Tenant context middleware (onRequest hook)
- Health check route
- Search routes (`/api/v1/search`)
- Professional routes (`/api/v1/pro`)

### `search-config.ts`
**Purpose:** Search-specific configuration constants

**Exports:**
- `SEARCH_SYNONYMS` - Synonym mappings
- `SEARCH_BOOSTS` - Field boost weights
- `SEARCH_SETTINGS` - Max results, limits, timeouts, cache TTL

### `env.validator.ts`
**Purpose:** Environment variable validation

**Functions:**
- `validateEnv()` - Validate all env vars with Joi
- `checkProductionEnv()` - Production-specific checks
- `getConfig()` - Get typed config object

**Validated Variables:**
- Server: NODE_ENV, PORT, HOST
- Security: JWT_SECRET
- Elasticsearch: ELASTICSEARCH_NODE, auth settings
- Redis: REDIS_HOST, REDIS_PORT, REDIS_PASSWORD
- PostgreSQL: DATABASE_* settings
- RabbitMQ: RABBITMQ_URL
- Rate Limiting: RATE_LIMIT_*
- Search: SEARCH_* settings
- Logging: LOG_LEVEL
- Metrics: METRICS_ENABLED, METRICS_PORT

---

## Migrations (`migrations/`)

### `001_search_consistency_tables.ts`
**Purpose:** Create consistency tracking tables with RLS

**Tables Created:**
1. **index_versions**
   - Tracks version numbers for indexed entities
   - Columns: entity_type, entity_id, version, indexed_at, index_status, retry_count, last_error, tenant_id
   - Indexes: (entity_type, entity_id) unique, status+created_at, tenant_id
   - RLS: tenant_isolation_policy

2. **index_queue**
   - Queue of pending index operations
   - Columns: entity_type, entity_id, operation, payload, priority, version, idempotency_key, processed_at, tenant_id
   - Indexes: processed_at, priority+created_at, tenant_id
   - RLS: tenant_isolation_policy

3. **read_consistency_tokens**
   - Client read consistency tokens
   - Columns: token (PK), client_id, required_versions (JSONB), expires_at, tenant_id
   - Indexes: expires_at, tenant_id
   - RLS: tenant_isolation_policy

**Features:**
- Row-Level Security on all tables
- Tenant isolation policies
- Idempotency key for queue operations
- JSONB for flexible version tracking

---

## Validators (`validators/`)

### `search.schemas.ts`
**Purpose:** Joi validation schemas for all search endpoints

**Schemas:**
- `searchQuerySchema` - Main search (q, type, limit, offset)
- `venueSearchSchema` - Venue search (q, limit, city, capacity_min/max)
- `eventSearchSchema` - Event search (q, date_from/to, limit, category, venue_id)
- `suggestSchema` - Autocomplete (q, limit)
- `geoSearchSchema` - Geolocation (lat, lon, radius, limit)
- `filterSchema` - Advanced filters (price, date, categories, venues, capacity, status)

**Validation Functions:**
- `validateSearchQuery(data)`
- `validateVenueSearch(data)`
- `validateEventSearch(data)`
- `validateSuggest(data)`
- `validateGeoSearch(data)`

**Features:**
- Max query length: 200 chars
- Max results: 1-100
- Date validation (ISO 8601)
- Geolocation bounds (-90/90, -180/180)
- Array limits (max 10 items)
- Unknown fields stripped

---

## Other Folders

### `types/` (`types/enriched-documents.ts`)
**Purpose:** TypeScript interfaces for Elasticsearch documents

**Interfaces:**
- `EnrichedVenue` - Full venue document structure
- `EnrichedEvent` - Full event document structure
- `EnrichedTicket` - Full ticket document structure
- `EnrichedMarketplaceListing` - Full marketplace listing structure

**Features:**
- Matches Elasticsearch mappings
- Includes all enriched data fields
- Nested objects (address, location, pricing, etc.)
- Optional fields clearly marked

### `utils/`
**Files:**
- `error-handler.ts` - Error handling utilities
- `logger.ts` - Pino logger configuration
- `metrics.ts` - Metrics collection
- `performance-monitor.ts` - Performance tracking
- `sanitizer.ts` - Input sanitization (SearchSanitizer)
- `tenant-filter.ts` - Tenant filtering utilities

**Key Utils:**
- `SearchSanitizer.sanitizeQuery()` - Sanitize search queries
- `SearchSanitizer.sanitizeNumber()` - Sanitize numeric inputs
- `addTenantFilter()` - Add tenant filter to ES query
- `canAccessCrossTenant()` - Check cross-tenant access
- `validateVenueId()` - Validate venue ID format

### `scripts/`
**Purpose:** Elasticsearch index management scripts

**Scripts:**
- `create-indices.ts` - Create ES indices with mappings
- `reindex-with-alias.ts` - Zero-downtime reindexing
- `optimize-indices.ts` - Optimize index performance
- `update-indices.ts` - Update index settings/mappings
- `fix-geo-location.ts` - Fix geolocation data
- `sync-content.ts` - Sync MongoDB content to ES
- `sync-data.ts` - Initial data sync from PostgreSQL

### `indexers/`
**Purpose:** Background indexing workers (if folder has files)

**Note:** Based on directory listing, this folder appears to be empty or contain indexing logic integrated into services.

---

## External Services Configured

### Elasticsearch
- **Purpose:** Primary search engine
- **Config:** `ELASTICSEARCH_NODE`, auth settings
- **Indices:** events, venues, tickets, marketplace_listings, search_analytics
- **Features:** Full-text search, geo queries, aggregations, completion suggesters

### Redis
- **Purpose:** Caching and rate limiting
- **Config:** `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`
- **Usage:** Search result caching (5 min), rate limit counters, trending searches cache

### PostgreSQL
- **Purpose:** Consistency tracking and source data
- **Config:** `DATABASE_*` settings via Knex
- **Tables:** index_versions, index_queue, read_consistency_tokens + all entity tables
- **Features:** Row-Level Security for tenant isolation

### MongoDB
- **Purpose:** Content and ratings (read-only)
- **Config:** `MONGODB_URI`
- **Collections:** venue_content, event_content, ratings
- **Read Preference:** secondaryPreferred

### RabbitMQ
- **Purpose:** Event-driven sync
- **Config:** `RABBITMQ_URL`
- **Exchange:** search.sync (topic)
- **Queue:** search.sync.queue
- **Routing:** venue.*, event.*, ticket.*

---

## Key Features

### 🔍 Search Capabilities
- **Full-Text Search** - Multi-match queries with fuzzy matching
- **Geolocation Search** - Near-me functionality with distance filtering
- **Faceted Search** - Aggregations for categories, prices, venues, dates, etc.
- **Autocomplete** - Fast suggestions using completion suggesters
- **Similar Items** - More-like-this queries
- **Trending Searches** - Popular queries in last 7 days

### 🔒 Security & Isolation
- **Row-Level Security** - PostgreSQL RLS on all tables
- **Tenant Isolation** - Filters applied to all searches
- **JWT Authentication** - Required for all endpoints
- **Input Sanitization** - All queries sanitized
- **Rate Limiting** - Per-user and per-tenant limits

### ⚡ Performance & Consistency
- **Read-After-Write** - Consistency tokens ensure data visibility
- **Caching** - Redis caching with 5-min TTL
- **Session Stickiness** - Preference parameter for consistent reads
- **Background Processing** - Async queue for index operations
- **Retry Logic** - Exponential backoff for failed operations

### 📊 Data Enrichment
- **Multi-Source** - Combines PostgreSQL + MongoDB + Elasticsearch
- **Real-Time** - Enriches on sync for latest data
- **Comprehensive** - Events, venues, tickets, marketplace listings
- **Search Boost** - Calculated scores based on quality, ratings, urgency

### 🎯 Advanced Features
- **A/B Testing** - Test different search algorithms
- **Personalization** - User-based result ranking (placeholder)
- **Analytics** - Search query tracking
- **Synonyms** - Configurable synonym expansion
- **Highlighting** - Match highlighting in results
- **Spell Suggestions** - Phrase suggestions for typos

---

## Environment Variables

**Required:**
- `ELASTICSEARCH_NODE` - Elasticsearch connection URL
- `DATABASE_NAME` - PostgreSQL database
- `DATABASE_USER` - PostgreSQL user
- `DATABASE_PASSWORD` - PostgreSQL password
- `JWT_SECRET` - JWT signing secret (min 64 chars in production)

**Optional:**
- `NODE_ENV` - Environment (default: development)
- `PORT` - Service port (default: 3000)
- `DB_HOST` - PostgreSQL host (default: postgres)
- `DB_PORT` - PostgreSQL port (default: 6432)
- `REDIS_HOST` - Redis host (default: redis)
- `REDIS_PORT` - Redis port (default: 6379)
- `REDIS_PASSWORD` - Redis password
- `MONGODB_URI` - MongoDB connection string
- `RABBITMQ_URL` - RabbitMQ connection URL
- `RATE_LIMIT_MAX` - Max requests per window (default: 100)
- `RATE_LIMIT_WINDOW` - Rate limit window in ms (default: 60000)
- `SEARCH_MAX_RESULTS` - Max results (default: 100)
- `LOG_LEVEL` - Log level (default: info)

---

## Service Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Search Service                        │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │   Routes   │→ │ Controllers  │→ │   Services     │  │
│  └────────────┘  └──────────────┘  └────────────────┘  │
│        ↓                ↓                    ↓          │
│  ┌────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ Middleware │  │ Validators   │  │  Enrichment    │  │
│  │ - Auth     │  │ - Joi        │  │  - Event       │  │
│  │ - Tenant   │  │ - Sanitize   │  │  - Venue       │  │
│  │ - RateLimit│  │              │  │  - Ticket      │  │
│  └────────────┘  └──────────────┘  │  - Marketplace │  │
│                                     └────────────────┘  │
│                                              ↓          │
│  ┌─────────────────────────────────────────────────┐   │
│  │          Data Sources & Infrastructure          │   │
│  ├─────────────────────────────────────────────────┤   │
│  │  Elasticsearch  │  PostgreSQL  │  MongoDB       │   │
│  │  - Search       │  - Tracking  │  - Content     │   │
│  │  - Index        │  - RLS       │  - Ratings     │   │
│  │                                                  │   │
│  │  Redis          │  RabbitMQ                     │   │
│  │  - Cache        │  - Event Sync                 │   │
│  │  - RateLimit    │                               │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## Dependencies

**Core:**
- `fastify` - Web framework
- `@elastic/elasticsearch` - Elasticsearch client
- `knex` + `pg` - PostgreSQL query builder
- `mongodb` - MongoDB driver
- `ioredis` - Redis client
- `amqplib` - RabbitMQ client

**Utilities:**
- `awilix` - Dependency injection
- `joi` - Validation
- `jsonwebtoken` - JWT auth
- `pino` - Logging

**Shared:**
- `@tickettoken/shared` - Shared utilities (cache, ratings)

---

## Notes

### Tenant Isolation Implementation
- All consistency tracking tables have `tenant_id` column
- Row-Level Security policies enforce `app.current_tenant` session variable
- Middleware sets session variable on every request
- Elasticsearch queries include tenant filter
- Cross-tenant access only for admin roles

### Consistency Model
- Write operations generate version numbers
- Index operations queued with priority
- Clients receive consistency tokens
- Reads can wait for specific versions to be indexed
- Background processor handles queue (5s interval)
- Retry logic with exponential backoff

### Search Flow
1. Client sends search request
2. Auth middleware validates JWT
3. Tenant middleware validates tenant
4. Rate limit middleware checks limits
5. Validator sanitizes inputs
6. Service adds tenant filter to ES query
7. Elasticsearch executes search
8. Results returned with consistency info

### Enrichment Flow
1. RabbitMQ message received (venue.created, event.updated, etc.)
2. SyncService processes message
3. Enrichment service fetches data from PostgreSQL + MongoDB
4. Full document created with all related data
5. ConsistencyService queues index operation
6. Background processor indexes to Elasticsearch
7. Version tracked in index_versions table

---

## Future Enhancements

**Suggested Improvements:**
- [ ] Implement personalized search results
- [ ] Add machine learning relevance tuning
- [ ] Implement search analytics dashboard
- [ ] Add search result click tracking
- [ ] Implement semantic search
- [ ] Add voice search support
- [ ] Implement search result clustering
- [ ] Add multi-language support
- [ ] Implement search query understanding (NLU)
- [ ] Add search performance monitoring

**Monitoring:**
- Search latency metrics
- Cache hit rates
- Consistency lag tracking
- Rate limit violations
- Failed index operations
- Search quality metrics (CTR, conversion)
