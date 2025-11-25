# SEARCH SERVICE - COMPLETE DOCUMENTATION

**Last Updated:** January 15, 2025  
**Version:** 1.0.0  
**Status:** PRODUCTION READY ✅

---

## EXECUTIVE SUMMARY

**Search-service is the discovery engine of the TicketToken platform.**

This service demonstrates:
- ✅ Elasticsearch full-text search with fuzzy matching
- ✅ Geospatial search (find events near me)
- ✅ Autocomplete suggestions
- ✅ Advanced filtering (price, date, category, capacity)
- ✅ Search analytics tracking
- ✅ A/B testing framework
- ✅ Redis caching for performance
- ✅ Eventual consistency guarantees
- ✅ Faceted search (aggregations)
- ✅ "More like this" similarity search
- ✅ Trending searches tracking
- ✅ 34 organized files

**This is a PRODUCTION-GRADE search system with consistency guarantees.**

---

## QUICK REFERENCE

- **Service:** search-service
- **Port:** 3012 (configurable via PORT env)
- **Framework:** Fastify
- **Database:** PostgreSQL (consistency tracking)
- **Search Engine:** Elasticsearch
- **Cache:** Redis
- **Message Queue:** RabbitMQ (sync events)
- **Dependency Injection:** Awilix

---

## BUSINESS PURPOSE

### What This Service Does

**Core Responsibilities:**
1. Full-text search across venues, events, tickets, marketplace
2. Autocomplete suggestions as users type
3. Geospatial queries (events within X km)
4. Advanced filtering (price range, dates, categories)
5. Search analytics (track popular queries)
6. Trending searches
7. Similar item recommendations
8. Search result ranking and boosting
9. Maintain search indexes in sync with source data
10. Provide consistency tokens for read-after-write scenarios

**Business Value:**
- Users can quickly find events they want
- Venue discovery drives ticket sales
- Autocomplete reduces friction
- Geolocation helps users find nearby events
- Analytics inform content strategy
- Consistency prevents showing stale results after purchase

---

## ARCHITECTURE OVERVIEW

### Technology Stack

```
Runtime: Node.js 20 + TypeScript
Framework: Fastify 4.x
Search Engine: Elasticsearch 8.x
Database: PostgreSQL (via Knex.js ORM)
Cache: Redis (ioredis)
Queue: RabbitMQ (amqplib)
DI Container: Awilix
Validation: Built-in Fastify schemas
Monitoring: Prometheus metrics, Pino logger
Testing: Jest
```

### Service Architecture Layers

```
┌─────────────────────────────────────────────────────────┐
│                   API LAYER (Fastify)                    │
│  Routes → Controllers → Services                         │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                   MIDDLEWARE LAYER                       │
│  • Authentication (RS256 JWT)                            │
│  • CORS                                                  │
│  • Helmet (Security headers)                             │
│  • Request Logging (Pino)                                │
│  • Error Handling                                        │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                    BUSINESS LOGIC                        │
│                                                          │
│  CORE SERVICES:                                          │
│  ├─ SearchService (basic search)                         │
│  ├─ ProfessionalSearchService (advanced search)          │
│  ├─ AutocompleteService (suggestions)                    │
│  ├─ ConsistencyService (read-after-write)                │
│  └─ SyncService (index updates)                          │
│                                                          │
│  FEATURES:                                               │
│  ├─ Multi-match queries (name, description, city)        │
│  ├─ Fuzzy matching (typo tolerance)                      │
│  ├─ Geospatial (geo_distance queries)                    │
│  ├─ Faceted search (aggregations)                        │
│  ├─ Highlighting (result snippets)                       │
│  ├─ "More like this" (similarity)                        │
│  ├─ Trending queries                                     │
│  └─ A/B testing framework                                │
│                                                          │
│  CONSISTENCY:                                            │
│  ├─ Version tracking (per entity)                        │
│  ├─ Index queue (async indexing)                         │
│  ├─ Consistency tokens (read guarantees)                 │
│  └─ Background processor (queue worker)                  │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                    DATA LAYER                            │
│  • Elasticsearch indices (venues, events, tickets, etc)  │
│  • PostgreSQL (consistency tracking)                     │
│  • Redis (caching, 5min TTL)                             │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                   ASYNC PROCESSING                       │
│  • RabbitMQ consumer (venue/event/ticket updates)        │
│  • Background index processor (1sec interval)            │
│  • Index refresh on high-priority operations             │
└─────────────────────────────────────────────────────────┘
```

---

## DATABASE SCHEMA

### Consistency Tracking Tables

**index_versions** (track entity index state)
```sql
- id (UUID, PK, gen_random_uuid())
- entity_type (VARCHAR(50)) - venue, event, ticket
- entity_id (VARCHAR(255)) - the actual entity UUID
- version (BIGINT, default 1) - monotonically increasing
- indexed_at (TIMESTAMP WITH TIME ZONE)
- index_status (VARCHAR(50), default 'PENDING')
  -- PENDING, INDEXED, FAILED
- retry_count (INTEGER, default 0)
- last_error (TEXT)
- created_at (TIMESTAMP WITH TIME ZONE, default NOW())
- updated_at (TIMESTAMP WITH TIME ZONE, default NOW())

UNIQUE(entity_type, entity_id)

Indexes:
- idx_index_versions_status ON (index_status, created_at)
- idx_index_versions_entity ON (entity_type, entity_id)

Purpose: Track which version of each entity is indexed
```

**index_queue** (pending index operations)
```sql
- id (UUID, PK, gen_random_uuid())
- entity_type (VARCHAR(50)) - venue, event, ticket
- entity_id (VARCHAR(255))
- operation (VARCHAR(20)) - CREATE, UPDATE, DELETE
- payload (JSONB) - the entity data to index
- priority (INTEGER, default 5) - 1-10 (10=highest)
- version (BIGINT) - matches index_versions.version
- idempotency_key (VARCHAR(255), UNIQUE)
- processed_at (TIMESTAMP WITH TIME ZONE)
- created_at (TIMESTAMP WITH TIME ZONE, default NOW())

Indexes:
- idx_index_queue_unprocessed ON (processed_at) 
  WHERE processed_at IS NULL
- idx_index_queue_priority ON (priority DESC, created_at ASC)
  WHERE processed_at IS NULL

Purpose: Queue of index operations to process
```

**read_consistency_tokens** (client consistency guarantees)
```sql
- token (VARCHAR(255), PK)
- client_id (VARCHAR(255))
- required_versions (JSONB)
  -- { "events": { "id1": 2, "id2": 3 }, "venues": { "id3": 1 } }
- expires_at (TIMESTAMP WITH TIME ZONE)
- created_at (TIMESTAMP WITH TIME ZONE, default NOW())

Index:
- idx_read_consistency_expires ON (expires_at)

Purpose: Allow clients to request read-after-write consistency
Cleanup: Delete where expires_at < NOW()
```

### Elasticsearch Indices

**venues**
```json
{
  "mappings": {
    "properties": {
      "id": { "type": "keyword" },
      "name": { 
        "type": "text",
        "fields": {
          "keyword": { "type": "keyword" }
        }
      },
      "description": { "type": "text" },
      "address": { "type": "text" },
      "city": { "type": "keyword" },
      "state": { "type": "keyword" },
      "capacity": { "type": "integer" },
      "location": { "type": "geo_point" },
      "amenities": { "type": "keyword" },
      "created_at": { "type": "date" },
      "_version": { "type": "long" },
      "_indexed_at": { "type": "date" }
    }
  }
}
```

**events**
```json
{
  "mappings": {
    "properties": {
      "id": { "type": "keyword" },
      "venue_id": { "type": "keyword" },
      "venue_name": { "type": "text" },
      "name": {
        "type": "text",
        "fields": {
          "keyword": { "type": "keyword" }
        }
      },
      "description": { "type": "text" },
      "date": { "type": "date" },
      "category": { "type": "keyword" },
      "artist": { "type": "text" },
      "genre": { "type": "keyword" },
      "status": { "type": "keyword" },
      "ticket_price_min": { "type": "float" },
      "ticket_price_max": { "type": "float" },
      "location": { "type": "geo_point" },
      "created_at": { "type": "date" },
      "_version": { "type": "long" },
      "_indexed_at": { "type": "date" }
    }
  }
}
```

**tickets**
```json
{
  "mappings": {
    "properties": {
      "id": { "type": "keyword" },
      "event_id": { "type": "keyword" },
      "event_name": { "type": "text" },
      "section": { "type": "keyword" },
      "row": { "type": "keyword" },
      "seat": { "type": "keyword" },
      "price": { "type": "float" },
      "status": { "type": "keyword" },
      "created_at": { "type": "date" }
    }
  }
}
```

**marketplace**
```json
{
  "mappings": {
    "properties": {
      "id": { "type": "keyword" },
      "ticket_id": { "type": "keyword" },
      "event_id": { "type": "keyword" },
      "event_name": { "type": "text" },
      "seller_id": { "type": "keyword" },
      "listing_price": { "type": "float" },
      "original_price": { "type": "float" },
      "status": { "type": "keyword" },
      "created_at": { "type": "date" }
    }
  }
}
```

**search_analytics** (track queries)
```json
{
  "mappings": {
    "properties": {
      "query": { "type": "text" },
      "results_count": { "type": "integer" },
      "user_id": { "type": "keyword" },
      "timestamp": { "type": "date" },
      "clicked_result": { "type": "keyword" }
    }
  }
}
```

---

## API ENDPOINTS

### Public Endpoints (Authentication Required)

#### **1. Basic Search**
```
GET /api/v1/search?q={query}&type={type}&limit={limit}
Headers:
  Authorization: Bearer <JWT>

Query Parameters:
  - q: Search query (optional, empty = match_all)
  - type: Index to search (venues, events) - optional, default: both
  - limit: Results limit (default: 20, max: 100)

Response: 200
{
  "success": true,
  "query": "concert nashville",
  "total": 42,
  "results": [
    {
      "type": "events",
      "id": "event_uuid",
      "score": 2.456,
      "data": {
        "id": "event_uuid",
        "name": "Nashville Symphony Concert",
        "description": "...",
        "venue_name": "Schermerhorn Symphony Center",
        "date": "2025-02-15T19:00:00Z",
        "category": "music",
        "artist": "Nashville Symphony",
        "genre": "classical",
        "status": "on_sale",
        "ticket_price_min": 35.00,
        "ticket_price_max": 125.00
      },
      "version": 5
    }
  ],
  "consistency": "none"
}

With Consistency Token:
GET /api/v1/search?q=...&consistency_token={token}

Response includes:
  "consistency": "checked"

Errors:
- 401: Invalid JWT
- 500: Search failed
```

#### **2. Search Venues Only**
```
GET /api/v1/search/venues?q={query}
Headers:
  Authorization: Bearer <JWT>

Query Parameters:
  - q: Search query

Response: 200
{
  "success": true,
  "query": "amphitheater",
  "total": 15,
  "results": [
    {
      "type": "venues",
      "id": "venue_uuid",
      "score": 3.12,
      "data": {
        "id": "venue_uuid",
        "name": "Red Rocks Amphitheatre",
        "type": "amphitheater",
        "capacity": 9525,
        "address": "...",
        "city": "Morrison",
        "state": "CO",
        "slug": "red-rocks",
        "is_active": true
      }
    }
  ]
}
```

#### **3. Search Events Only**
```
GET /api/v1/search/events?q={query}
GET /api/v1/search/events?date_from={date}&date_to={date}
Headers:
  Authorization: Bearer <JWT>

Query Parameters:
  - q: Search query (optional)
  - date_from: ISO date (optional)
  - date_to: ISO date (optional)

Response: 200
{
  "success": true,
  "total": 8,
  "results": [...]
}

Note: Date filtering bypasses query if provided
```

#### **4. Autocomplete Suggestions**
```
GET /api/v1/search/suggest?q={query}
Headers:
  Authorization: Bearer <JWT>

Query Parameters:
  - q: Partial query (min 2 chars)

Response: 200
{
  "suggestions": [
    "Nashville Symphony",
    "Nashville Predators",
    "Nashville SC"
  ]
}

Implementation:
- match_phrase_prefix on name field
- Max 10 expansions
- Returns up to 10 suggestions
- Empty array if query < 2 chars
```

### Professional Search Endpoints

#### **5. Advanced Search**
```
POST /api/v1/pro/advanced
Headers:
  Authorization: Bearer <JWT>

Body:
{
  "query": "rock concert",
  "type": "events",
  "filters": {
    "priceMin": 20,
    "priceMax": 100,
    "dateFrom": "2025-02-01",
    "dateTo": "2025-02-28",
    "categories": ["music", "concert"],
    "capacityMin": 1000,
    "capacityMax": 5000
  },
  "sort": "date_asc",  // _score, distance, date_asc, date_desc, 
                        // price_asc, price_desc, popularity
  "page": 1,
  "limit": 20,
  "location": {
    "lat": 36.1627,
    "lon": -86.7816
  },
  "distance": "25km"
}

Response: 200
{
  "success": true,
  "query": "rock concert",
  "total": 156,
  "page": 1,
  "pages": 8,
  "results": [
    {
      "type": "events",
      "id": "event_uuid",
      "score": 4.23,
      "distance": 12.5,  // km (if location provided)
      "data": {...},
      "highlights": {
        "name": ["<mark>Rock</mark> <mark>Concert</mark>"],
        "description": ["..."]
      }
    }
  ],
  "facets": {
    "categories": [
      { "name": "music", "count": 120 },
      { "name": "concert", "count": 100 }
    ],
    "priceRanges": [
      { "range": "Under $50", "count": 45 },
      { "range": "$50-$100", "count": 78 },
      { "range": "$100-$200", "count": 30 },
      { "range": "$200+", "count": 3 }
    ],
    "venues": [
      { "name": "Bridgestone Arena", "count": 25 }
    ],
    "months": [
      { "month": "2025-02", "count": 45 },
      { "month": "2025-03", "count": 67 }
    ],
    "avgPrice": 72.50
  },
  "suggestions": "Did you mean: 'pop concert'?"
}

Features:
- Multi-match search with fuzzy matching
- Geo-distance filtering
- Price range filtering
- Date range filtering
- Category filtering
- Capacity filtering
- Multiple sort options
- Faceted aggregations
- Search highlighting
- Query suggestions (phrase suggester)

Sort Options:
- _score: Relevance (default)
- distance: Nearest first (requires location)
- date_asc: Earliest first
- date_desc: Latest first
- price_asc: Cheapest first
- price_desc: Most expensive first
- popularity: Most popular first

Errors:
- 400: Invalid filters
- 401: Invalid JWT
```

#### **6. Near Me Search**
```
GET /api/v1/pro/near-me?lat={lat}&lon={lon}&distance={distance}&type={type}
Headers:
  Authorization: Bearer <JWT>

Query Parameters:
  - lat: Latitude (REQUIRED)
  - lon: Longitude (REQUIRED)
  - distance: Distance (default: 10km)
  - type: venues or events (optional)

Response: 200
{
  "success": true,
  "location": {
    "lat": 36.1627,
    "lon": -86.7816
  },
  "distance": "10km",
  "total": 23,
  "results": [
    {
      "type": "events",
      "id": "event_uuid",
      "distance": 2.3,  // km
      "data": {...}
    }
  ]
}

Errors:
- 400: Missing lat/lon
- 401: Invalid JWT
```

#### **7. Trending Searches**
```
GET /api/v1/pro/trending
Headers:
  Authorization: Bearer <JWT>

Response: 200
{
  "trending": [
    { "key": "taylor swift", "doc_count": 1250 },
    { "key": "nashville predators", "doc_count": 890 },
    { "key": "broadway shows", "doc_count": 654 }
  ]
}

Implementation:
- Aggregates search_analytics index
- Last 7 days of queries
- Top 10 by count
- Cached 1 hour in Redis
```

#### **8. Similar Items**
```
GET /api/v1/pro/{index}/{id}/similar
Headers:
  Authorization: Bearer <JWT>

Path Parameters:
  - index: venues or events
  - id: Entity UUID

Response: 200
{
  "similar": [
    {
      "id": "event_uuid",
      "score": 2.89,
      "name": "Similar Event",
      "description": "...",
      "category": "music",
      "genre": "rock"
    }
  ]
}

Implementation:
- Elasticsearch "more_like_this" query
- Fields: name, description, category, genre
- Min term freq: 1
- Max query terms: 12
```

### Health & Monitoring Endpoints

#### **9. Health Check**
```
GET /health

Response: 200
{
  "status": "ok",
  "service": "search-service"
}
```

#### **10. Database Health**
```
GET /health/db

Response: 200
{
  "status": "ok",
  "database": "connected",
  "service": "search-service"
}

Response: 503 (if unhealthy)
{
  "status": "error",
  "database": "disconnected",
  "error": "connection timeout",
  "service": "search-service"
}
```

---

## DEPENDENCIES

### What This Service NEEDS (Upstream)

```
REQUIRED (Service fails without these):
├── PostgreSQL (localhost:5432)
│   └── Database: tickettoken_db
│   └── Tables: index_versions, index_queue, read_consistency_tokens
│   └── Breaking: Service won't start
│
├── Elasticsearch (localhost:9200)
│   └── Indices: venues, events, tickets, marketplace, search_analytics
│   └── Breaking: Search fails, service unusable
│
├── Redis (localhost:6379)
│   └── Caching search results (5min TTL)
│   └── Breaking: Service runs but slower, no cache
│
└── JWT Public Key (RS256)
    └── File: ~/tickettoken-secrets/jwt-public.pem
    └── Breaking: Auth fails, service unusable

OPTIONAL (Service works without these):
├── RabbitMQ (localhost:5672)
│   └── Exchange: search.sync (topic)
│   └── Queue: search.sync.queue
│   └── Routing keys: venue.*, event.*, ticket.*
│   └── Breaking: Manual index updates required
│
├── Venue Service (port 3002)
│   └── Source data for venue indexing
│   └── Breaking: Venue sync fails
│
├── Event Service (port 3003)
│   └── Source data for event indexing
│   └── Breaking: Event sync fails
│
└── Ticket Service (port 3004)
    └── Source data for ticket indexing
    └── Breaking: Ticket sync fails
```

### What DEPENDS On This Service (Downstream)

```
DIRECT DEPENDENCIES:
├── Frontend/Mobile Apps
│   └── All search UI (navbar, browse, filters)
│   └── Calls: GET /api/v1/search/*
│   └── Calls: GET /api/v1/pro/*
│
├── Event Service (port 3003)
│   └── Event discovery pages
│   └── Calls: GET /api/v1/search/events
│
├── Venue Service (port 3002)
│   └── Venue discovery pages
│   └── Calls: GET /api/v1/search/venues
│
└── Marketplace Service (port 3008)
    └── Listing search
    └── Calls: GET /api/v1/search?type=marketplace

BLAST RADIUS: HIGH
- If search-service is down:
  ✗ Cannot search for events/venues
  ✗ Autocomplete broken
  ✗ Discovery pages fail
  ✗ Near me feature unavailable
  ✓ Direct links to events still work
  ✓ Other services (auth, payments) continue working
  
Workaround: Fallback to database queries (slower, limited features)
```

---

## CRITICAL FEATURES

### 1. Elasticsearch Full-Text Search ✅

**Implementation:**
```typescript
// Multi-match query with fuzzy matching

Query Types:
1. match_all - Empty query returns all results
2. multi_match - Search across multiple fields
3. match_phrase_prefix - Autocomplete
4. more_like_this - Similar items
5. geo_distance - Location-based

Field Boosting:
- name^3 (3x weight)
- artist^2.5
- venue_name^2
- description^1.5
- category^1.2
- city^1

Fuzzy Matching:
- fuzziness: 'AUTO'
  - 3-5 chars: 1 edit distance
  - >5 chars: 2 edit distance
- prefix_length: 2 (first 2 chars must match)
- max_expansions: 50

Code: src/services/professional-search.service.ts
```

**Why it matters:**
- Users can find events even with typos
- Searches across multiple fields
- Results ranked by relevance

### 2. Geospatial Search ✅

**Implementation:**
```typescript
// geo_point field type + geo_distance query

Index Mapping:
{
  "location": { "type": "geo_point" }
}

Query:
{
  "geo_distance": {
    "distance": "10km",
    "location": {
      "lat": 36.1627,
      "lon": -86.7816
    }
  }
}

Sort by Distance:
{
  "_geo_distance": {
    "location": { "lat": 36.1627, "lon": -86.7816 },
    "order": "asc",
    "unit": "km",
    "distance_type": "arc"
  }
}

Code: src/services/professional-search.service.ts
```

**Why it matters:**
- Users can find nearby events
- Mobile "near me" feature
- Distance-based ranking

### 3. Eventual Consistency ✅

**Implementation:**
```typescript
// Read-after-write consistency using version tracking

Process:
1. Source service (venue/event) updates entity
2. Publishes to RabbitMQ: venue.updated
3. Search service receives message
4. Assigns version number (monotonically increasing)
5. Queues index operation in index_queue
6. Returns consistency token to client
7. Background processor indexes entity
8. Updates index_versions table
9. Client can request search with token
10. Search waits until version is indexed

Tables:
- index_versions: Track indexed version
- index_queue: Pending operations
- read_consistency_tokens: Client tokens

Example:
1. User creates event
2. Event service returns: consistencyToken = "abc123..."
3. User immediately searches
4. Search service checks token
5. Waits up to 5 seconds for index
6. Returns results with new event

Code: src/services/consistency.service.ts
```

**Why it matters:**
- Prevents stale results after writes
- Guarantees read-after-write consistency
- Optional (doesn't slow down normal searches)

### 4. Autocomplete ✅

**Implementation:**
```typescript
// match_phrase_prefix query

Query:
{
  "match_phrase_prefix": {
    "name": {
      "query": "nashv",
      "max_expansions": 10
    }
  }
}

Returns: ["Nashville Symphony", "Nashville Predators"]

Minimum: 2 characters
Maximum: 10 suggestions
Indices: venues, events
Fields: name only

Code: src/services/autocomplete.service.ts
```

**Why it matters:**
- Reduces typing friction
- Guides users to popular searches
- Fast response (<100ms)

### 5. Faceted Search (Aggregations) ✅

**Implementation:**
```typescript
// Elasticsearch aggregations

Facets:
1. Categories (terms aggregation)
   - Returns: { name: "music", count: 150 }

2. Price Ranges (range aggregation)
   - Buckets: <$50, $50-$100, $100-$200, $200+

3. Venues (terms aggregation)
   - Top 15 venues by event count

4. Months (date_histogram)
   - Events grouped by month

5. Average Price (avg aggregation)
   - Overall average price

Response Format:
{
  "facets": {
    "categories": [
      { "name": "music", "count": 120 }
    ],
    "priceRanges": [
      { "range": "Under $50", "count": 45 }
    ],
    "venues": [
      { "name": "Bridgestone Arena", "count": 25 }
    ],
    "months": [
      { "month": "2025-02", "count": 45 }
    ],
    "avgPrice": 72.50
  }
}

Code: src/services/professional-search.service.ts
```

**Why it matters:**
- Users can filter results
- Understand result distribution
- Refine searches interactively

### 6. Search Analytics ✅

**Implementation:**
```typescript
// Track every search to search_analytics index

Tracked Data:
- query: Search term
- results_count: Number of results
- user_id: Who searched (nullable)
- timestamp: When
- clicked_result: Which result clicked (nullable)

Use Cases:
1. Trending searches (last 7 days)
2. Popular queries (aggregation)
3. Zero-result queries (improve content)
4. Click-through rate (result quality)

Code: src/services/search.service.ts (trackSearch method)
```

**Why it matters:**
- Understand what users want
- Identify content gaps
- Improve search quality

### 7. A/B Testing Framework ✅

**Implementation:**
```typescript
// Variant assignment + tracking

Tests:
{
  "search_algorithm": {
    "variants": {
      "control": { algorithm: "standard", weight: 0.5 },
      "treatment": { algorithm: "ml_boosted", weight: 0.5 }
    }
  }
}

Assignment:
- Random (for now)
- TODO: Consistent hashing by userId

Tracking:
- Variant assigned
- Metric values
- Conversion events

Code: src/services/ab-testing.service.ts
```

**Why it matters:**
- Test search improvements
- Data-driven decisions
- Measure impact

### 8. Index Syncing ✅

**Implementation:**
```typescript
// RabbitMQ consumer + background processor

RabbitMQ:
- Exchange: search.sync (topic)
- Queue: search.sync.queue
- Routing keys: venue.updated, event.updated, etc

Process:
1. Source service publishes: venue.updated
2. Search consumes message
3. Creates index operation (priority=9 for high priority)
4. Background processor (1sec interval):
   - Fetches unprocessed operations
   - Processes in priority order
   - Updates Elasticsearch
   - Marks as processed

Priority Levels:
- 10: Urgent (immediate processing)
- 9: High (user-facing writes)
- 5: Standard (batch updates)
- 1: Low (background sync)

Code: 
- src/services/sync.service.ts
- src/services/consistency.service.ts
```

**Why it matters:**
- Keeps search in sync with source
- Automatic index updates
- Priority-based processing

### 9. Result Highlighting ✅

**Implementation:**
```typescript
// Elasticsearch highlight feature

Request:
{
  "highlight": {
    "fields": {
      "name": { 
        "pre_tags": ["<mark>"], 
        "post_tags": ["</mark>"] 
      },
      "description": { 
        "pre_tags": ["<mark>"], 
        "post_tags": ["</mark>"] 
      },
      "artist": { 
        "pre_tags": ["<mark>"], 
        "post_tags": ["</mark>"] 
      }
    }
  }
}

Response:
{
  "highlights": {
    "name": ["<mark>Rock</mark> <mark>Concert</mark>"],
    "description": ["A great <mark>rock</mark> band..."]
  }
}

Code: src/services/professional-search.service.ts
```

**Why it matters:**
- Shows why result matched
- Helps users scan results
- Improves relevance perception

### 10. Query Suggestions ✅

**Implementation:**
```typescript
// Elasticsearch phrase suggester

Request:
{
  "suggest": {
    "text": "nashvile symphony",  // typo
    "simple_phrase": {
      "phrase": {
        "field": "name",
        "size": 1,
        "gram_size": 3,
        "direct_generator": [{
          "field": "name",
          "suggest_mode": "always"
        }]
      }
    }
  }
}

Response:
{
  "suggestions": "Did you mean: 'nashville symphony'?"
}

Code: src/services/professional-search.service.ts
```

**Why it matters:**
- Corrects typos
- Improves search success rate
- Reduces zero-result searches

---

## SEARCH CONFIGURATION

### Synonyms

```typescript
// src/config/search-config.ts

export const SEARCH_SYNONYMS = {
  'concert': ['show', 'gig', 'performance', 'concert'],
  'theater': ['theatre', 'theater', 'playhouse'],
  'music': ['concert', 'show', 'performance'],
  'sports': ['game', 'match', 'competition'],
  'comedy': ['standup', 'stand-up', 'comic', 'humor'],
  'festival': ['fest', 'fair', 'carnival']
};
```

### Field Boosts

```typescript
export const SEARCH_BOOSTS = {
  'name': 3.0,
  'artist': 2.5,
  'venue_name': 2.0,
  'description': 1.5,
  'category': 1.2,
  'city': 1.0
};
```

### Settings

```typescript
export const SEARCH_SETTINGS = {
  maxResults: 100,
  defaultLimit: 20,
  maxQueryLength: 200,
  cacheTimeout: 300,      // 5 minutes
  minScore: 0.3,
  fuzzyDistance: 2,
  searchAsYouTypeDelay: 300  // ms
};
```

---

## SECURITY

### 1. Authentication

```typescript
// RS256 JWT (from shared package)
// src/middleware/auth.middleware.ts

export async function authenticate(
  request: AuthenticatedRequest,
  reply: FastifyReply
): Promise<void> {
  const token = request.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return reply.status(401).send({ error: 'Authentication required' });
  }

  const decoded = jwt.verify(token, publicKey);
  
  request.user = {
    id: decoded.userId || decoded.id,
    venueId: decoded.venueId,
    role: decoded.role || 'user',
    permissions: decoded.permissions || []
  };
}
```

### 2. Authorization

```typescript
export function authorize(...roles: string[]) {
  return async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'Authentication required' });
    }
    
    if (!roles.includes(request.user.role)) {
      return reply.status(403).send({ error: 'Insufficient permissions' });
    }
  };
}
```

### 3. Input Sanitization

```typescript
// src/utils/sanitizer.ts

export class SearchSanitizer {
  static sanitizeQuery(query: string): string {
    return query
      .replace(/[<>]/g, '')       // Remove HTML
      .replace(/[{}[\]]/g, '')    // Remove JSON
      .replace(/\\/g, '')         // Remove escapes
      .trim()
      .substring(0, 200);         // Max 200 chars
  }

  static sanitizeFilters(filters: any): any {
    const allowedFields = [
      'priceMin', 'priceMax',
      'dateFrom', 'dateTo',
      'categories', 'venues',
      'capacityMin', 'capacityMax'
    ];
    
    const cleaned: any = {};
    for (const field of allowedFields) {
      if (filters[field] !== undefined) {
        cleaned[field] = filters[field];
      }
    }
    return cleaned;
  }
}
```

---

## ASYNC PROCESSING

### RabbitMQ Consumer

```typescript
// src/config/rabbitmq.ts

Exchange: search.sync (topic, durable)
Queue: search.sync.queue (durable)
Binding: # (all routing keys)

Routing Keys:
- venue.created
- venue.updated
- venue.deleted
- event.created
- event.updated
- event.deleted
- ticket.created
- ticket.updated
- ticket.deleted

Message Handler:
1. Receive message
2. Parse routing key: {entity}.{action}
3. Call SyncService.processMessage()
4. Ack message on success
5. Nack (no requeue) on failure
```

### Background Index Processor

```typescript
// src/services/consistency.service.ts

Interval: 1 second

Process:
1. Query index_queue WHERE processed_at IS NULL
2. Order by priority DESC, created_at ASC
3. Limit 10 operations
4. For each operation:
   - Process index update
   - Update index_versions
   - Mark operation as processed
5. Handle errors (increment retry_count)

High Priority (>= 9):
- Processed immediately on queue
- Refresh: 'wait_for' (synchronous)
- Guarantees searchability

Standard Priority (< 9):
- Processed by background worker
- Refresh: default (async)
- Eventually consistent
```

### Index Scripts

```bash
# Create indices
npm run index:create
# Runs: src/scripts/create-indices.ts

# Sync all data from database
npm run index:sync
# Runs: src/scripts/sync-data.ts

# Optimize indices (force merge)
npm run index:optimize
# Runs: src/scripts/optimize-indices.ts
```

---

## ERROR HANDLING

### Error Classes

```typescript
// src/utils/error-handler.ts

export class SearchError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode = 500, code = 'SEARCH_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class ValidationError extends SearchError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class NotFoundError extends SearchError {
  constructor(message: string) {
    super(message, 404, 'NOT_FOUND');
  }
}

export class RateLimitError extends SearchError {
  constructor(message: string) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}
```

### Error Response Format

```json
{
  "error": "Search failed",
  "code": "SEARCH_ERROR",
  "timestamp": "2025-01-15T...",
  "path": "/api/v1/search",
  "details": {
    "query": "...",
    "index": "events"
  }
}
```

### Common Error Codes

```
AUTH_REQUIRED - Missing JWT
INVALID_TOKEN - JWT signature invalid
TOKEN_EXPIRED - JWT expired

VALIDATION_ERROR - Invalid parameters
QUERY_TOO_LONG - Query > 200 chars
INVALID_GEO - Invalid lat/lon

SEARCH_ERROR - Elasticsearch failure
INDEX_NOT_FOUND - Index doesn't exist
CONSISTENCY_TIMEOUT - Token wait timeout
```

---

## TESTING

### Test Structure

```
tests/
  setup.ts - Test configuration
  integration/
    search.test.ts - Full search flow
  unit/
    services/
      search.service.test.ts
      autocomplete.service.test.ts
      consistency.service.test.ts
```

### Running Tests

```bash
npm test                 # Run all tests
npm run test:watch      # Watch mode
npm run test:coverage   # Coverage report
```

### Test Coverage Targets

```
Branches:   70%
Functions:  70%
Lines:      70%
Statements: 70%
```

---

## DEPLOYMENT

### Environment Variables

```bash
# Service
PORT=3012
HOST=0.0.0.0
LOG_LEVEL=info

# Database
DB_HOST=postgres
DB_PORT=5432
DB_NAME=tickettoken_db
DB_USER=postgres
DB_PASSWORD=<secret>

# Elasticsearch
ELASTICSEARCH_NODE=http://elasticsearch:9200

# Redis
REDIS_HOST=redis
REDIS_PORT=6379

# RabbitMQ
RABBITMQ_URL=amqp://admin:admin@rabbitmq:5672
AMQP_URL=amqp://admin:admin@rabbitmq:5672

# JWT
JWT_SECRET=<secret>

# Service Discovery (optional)
VENUE_SERVICE_URL=http://venue-service:3002
EVENT_SERVICE_URL=http://event-service:3003
TICKET_SERVICE_URL=http://ticket-service:3004
```

### Docker

```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Build shared module
COPY backend/shared /shared
WORKDIR /shared
RUN npm install

# Build search service
WORKDIR /app
COPY backend/services/search-service/package.json ./
RUN sed -i 's|"@tickettoken/shared": "file:../../shared"|"@tickettoken/shared": "file:/shared"|' package.json
RUN npm install

COPY tsconfig.base.json /tsconfig.base.json
COPY backend/services/search-service/tsconfig.json ./
COPY backend/services/search-service/src ./src

RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Production dependencies
COPY backend/shared /shared
WORKDIR /shared
RUN npm install --only=production

WORKDIR /app
COPY backend/services/search-service/package.json ./
RUN sed -i 's|"@tickettoken/shared": "file:../../shared"|"@tickettoken/shared": "file:/shared"|' package.json
RUN npm install --only=production

COPY --from=builder /app/dist ./dist

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001
USER nodejs

EXPOSE 3012

CMD ["node", "dist/server.js"]
```

### Startup Order

```
1. PostgreSQL must be running
2. Elasticsearch must be running
3. Redis must be running (optional but recommended)
4. Run index migrations: npm run index:create
5. Sync initial data: npm run index:sync
6. Start service: npm start
7. RabbitMQ connects automatically (optional)
```

---

## MONITORING

### Metrics (Prometheus)

```typescript
// src/utils/metrics.ts

export const searchCounter = new Counter({
  name: 'search_requests_total',
  help: 'Total number of search requests',
  labelNames: ['type', 'status']
});

export const searchDuration = new Histogram({
  name: 'search_duration_seconds',
  help: 'Search request duration',
  labelNames: ['type'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5]
});

export const cacheHitRate = new Counter({
  name: 'cache_hits_total',
  help: 'Number of cache hits',
  labelNames: ['type']
});
```

Exposed at: `GET /metrics`

### Logs (Pino)

```typescript
// src/utils/logger.ts

export const logger = pino({
  name: 'search-service',
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: { colorize: true }
  } : undefined
});

// Usage
logger.info({ query, results }, 'Search completed');
logger.error({ error }, 'Search failed');
```

### Health Checks

```
GET /health - Basic liveness
GET /health/db - Database connectivity
```

---

## TROUBLESHOOTING

### Common Issues

**1. "Search returns stale results"**
```
Cause: Index not refreshed after write
Fix: Use consistency token for read-after-write
Check: index_versions table for indexed_at timestamp
Manual: POST /_refresh to Elasticsearch
```

**2. "Autocomplete not working"**
```
Cause: Query < 2 characters
Fix: Ensure query length >= 2
Check: Returns empty array if < 2 chars
```

**3. "Geospatial search returns no results"**
```
Cause: Missing location field in index
Fix: Re-index with location data
Check: GET /events/_mapping to verify geo_point type
Script: npm run index:sync
```

**4. "Consistency token timeout"**
```
Cause: Background processor not running or slow
Fix: Check index_queue for stuck operations
Increase: waitForConsistency timeout (default 5s)
Check: index_versions.index_status = 'PENDING'
```

**5. "RabbitMQ messages not consumed"**
```
Cause: RabbitMQ connection failed
Fix: Restart service, check RABBITMQ_URL
Check: Service logs for connection errors
Fallback: Manual index sync via npm run index:sync
```

**6. "High Elasticsearch memory usage"**
```
Cause: Too many indices or large caches
Fix: Optimize indices (npm run index:optimize)
Action: Force merge to 1 segment
Action: Clear field data cache
```

**7. "Slow search performance"**
```
Cause: No caching, complex queries, large result sets
Fix: Enable Redis caching (5min TTL)
Optimize: Reduce limit parameter
Optimize: Add more field boosts
Check: searchDuration metric
```

---

## API CHANGES (Breaking vs Safe)

### ✅ SAFE Changes (Won't Break Clients)

1. Add new optional query parameters
2. Add new fields to response bodies
3. Add new endpoints
4. Add new facets to aggregations
5. Improve search ranking algorithm
6. Add new indices
7. Change cache TTL
8. Add query suggestions
9. Improve error messages

### ⚠️ BREAKING Changes (Require Coordination)

1. Remove or rename endpoints
2. Remove fields from responses
3. Change field types (string → number)
4. Make optional parameters required
5. Change authentication requirements
6. Change response format structure
7. Remove indices
8. Change consistency semantics
9. Change error codes

---

## COMPARISON: Search vs Payment Service

| Feature | Search Service | Payment Service |
|---------|----------------|-----------------|
| Framework | Fastify ✅ | Express ⚠️ |
| DI Container | Awilix ✅ | Manual ⚠️ |
| Primary Store | Elasticsearch ✅ | PostgreSQL ✅ |
| Consistency | Eventual ✅ | Immediate ✅ |
| Caching | Redis (5min) ✅ | Redis (idempotency) ✅ |
| Message Queue | RabbitMQ ✅ | RabbitMQ + Bull ✅ |
| Auth | RS256 JWT ✅ | RS256 JWT ✅ |
| Error Handling | Custom classes ✅ | AppError ✅ |
| Monitoring | Prometheus ✅ | Prometheus ✅ |
| Complexity | Medium 🟡 | Very High 🔴 |
| Business Risk | Medium 🟡 | Critical 🔴 |

**Search service is LESS complex due to:**
- Read-heavy workload (no financial transactions)
- Eventual consistency acceptable
- No regulatory compliance
- Simpler error scenarios

**Search service is MORE modern:**
- Fastify (faster than Express)
- Awilix DI (cleaner architecture)
- Better structured (services pattern)

---

## FUTURE IMPROVEMENTS

### Phase 1: Performance
- [ ] Implement query caching (Redis)
- [ ] Add Elasticsearch query profiling
- [ ] Optimize index settings (shards, replicas)
- [ ] Add circuit breakers for Elasticsearch
- [ ] Implement request coalescing (dedupe concurrent identical queries)

### Phase 2: Features
- [ ] Semantic search (vector embeddings)
- [ ] Personalized search (user history)
- [ ] Search filters persistence (save searches)
- [ ] Search alerts (notify on new results)
- [ ] Voice search support
- [ ] Image search (event posters)
- [ ] Multi-language search

### Phase 3: Intelligence
- [ ] Machine learning ranking
- [ ] Query understanding (intent detection)
- [ ] Auto-correction (did you mean)
- [ ] Related searches
- [ ] Search session tracking
- [ ] A/B test framework expansion
- [ ] Click-through rate optimization

### Phase 4: Scale
- [ ] Elasticsearch cluster (multi-node)
- [ ] Index aliasing (zero-downtime updates)
- [ ] Hot-warm-cold architecture
- [ ] Cross-cluster search
- [ ] Global search (multi-region)

---

## CHANGELOG

### Version 1.0.0 (Current - January 15, 2025)
- ✅ Complete documentation created
- ✅ 34 files documented
- ✅ Elasticsearch integration complete
- ✅ Geospatial search implemented
- ✅ Autocomplete working
- ✅ Advanced filtering operational
- ✅ Consistency guarantees functional
- ✅ Search analytics tracking
- ✅ A/B testing framework
- ✅ Production ready

### Planned Changes (Version 1.1.0)
- [ ] Circuit breakers
- [ ] OpenTelemetry tracing
- [ ] Semantic search (vectors)
- [ ] Personalization engine

---

## CONTACT & SUPPORT

**Service Owner:** Platform Team  
**Repository:** backend/services/search-service  
**Documentation:** This file  
**Elasticsearch Admin:** [Admin UI](http://localhost:9200/_cat/indices)  
**Non-Critical Issues:** Project tracker

---

**END OF DOCUMENTATION**

*This documentation follows the TicketToken platform standard. Keep it updated as the service evolves.*