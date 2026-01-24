# SEARCH-SERVICE COMPREHENSIVE AUDIT REPORT

**Audit Date:** 2026-01-23
**Service:** search-service
**Location:** `backend/services/search-service/`
**Files Analyzed:** 48 TypeScript source files

---

## 1. SERVICE CAPABILITIES

### Public Endpoints

| Method | Path | Controller | Purpose |
|--------|------|------------|---------|
| GET | `/api/v1/search/` | search.controller.ts | Main multi-type search (venues, events) |
| GET | `/api/v1/search/venues` | search.controller.ts | Venue-specific search |
| GET | `/api/v1/search/events` | search.controller.ts | Event-specific search with date filters |
| GET | `/api/v1/search/suggest` | search.controller.ts | Autocomplete suggestions |
| POST | `/api/v1/pro/advanced` | professional-search.controller.ts | Advanced search with filters/facets |
| GET | `/api/v1/pro/near-me` | professional-search.controller.ts | Geo-location based search |
| GET | `/api/v1/pro/trending` | professional-search.controller.ts | Trending search queries |
| GET | `/api/v1/pro/:index/:id/similar` | professional-search.controller.ts | Similar items (More Like This) |

### Internal/Health Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Basic health check |
| GET | `/health/db` | Database connectivity check |

### Business Operations

1. **Event Search** - Full-text search with fuzzy matching, date filtering
2. **Venue Search** - Location-aware search with capacity filters
3. **Ticket Search** - Search by event, venue, user, marketplace status (via indexing)
4. **Marketplace Search** - Search listings with seller reputation, pricing percentile
5. **Autocomplete** - Real-time suggestions using Elasticsearch completion suggester
6. **Professional Search** - Advanced filters (performer, genre, amenities, accessibility, ratings)
7. **Geo-location Search** - Distance-based filtering with geo_distance queries
8. **Similar Items** - More-Like-This queries for recommendations
9. **Trending Searches** - Analytics-based popular query tracking
10. **A/B Testing** - Search algorithm variant testing (standard vs ML-boosted)
11. **Data Enrichment** - Multi-source data aggregation for search documents
12. **Consistency Management** - Version-tracked indexing with consistency tokens

---

## 2. DATABASE SCHEMA

### Tables (3 total - all tenant-scoped)

**From Migration:** `001_consolidated_baseline.ts`

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `index_versions` | Track entity versions for consistency | `entity_type`, `entity_id`, `version`, `index_status` |
| `index_queue` | Pending index operations queue | `entity_type`, `entity_id`, `operation`, `payload`, `priority` |
| `read_consistency_tokens` | Client read tracking for consistency | `token`, `client_id`, `required_versions`, `expires_at` |

### Row Level Security

All tables have RLS enabled with:
- `ENABLE ROW LEVEL SECURITY`
- `FORCE ROW LEVEL SECURITY`
- Tenant isolation policy using `app.current_tenant_id` session variable
- System user bypass via `app.is_system_user`

**Note:** The search service is primarily Elasticsearch-based. PostgreSQL tables are only used for consistency tracking, not primary data storage.

---

## 3. ELASTICSEARCH INTEGRATION

### Connection Configuration

```typescript
// From: src/config/dependencies.ts
elasticsearch: asValue(new Client({
  node: process.env.ELASTICSEARCH_NODE || 'http://elasticsearch:9200'
}))
```

### Index Structure

| Index | Document Type | Approx. Fields | Description |
|-------|---------------|----------------|-------------|
| `venues` | EnrichedVenue | ~60 | Venues with sections, amenities, accessibility, ratings |
| `events` | EnrichedEvent | ~50 | Events with performers, venue data, pricing, ratings |
| `tickets` | EnrichedTicket | ~100+ | Tickets with transfer history, blockchain, validation, marketplace |
| `marketplace` | EnrichedMarketplaceListing | ~150+ | Listings with seller reputation, offers, analytics, blockchain |
| `search_analytics` | Search tracking | ~5 | Query tracking for trending/analytics |

### Alias Management

Zero-downtime reindexing implemented in `scripts/reindex-with-alias.ts`:
1. Creates versioned index (e.g., `venues_1702749600000`)
2. Reindexes data from old to new index
3. Atomic alias update
4. Old index deletion

### Mapping Configuration

Mappings loaded from external JSON files:
- `database/elasticsearch/mappings/venues_mapping.json`
- `database/elasticsearch/mappings/events_mapping.json`
- `database/elasticsearch/mappings/tickets_mapping.json`
- `database/elasticsearch/mappings/marketplace_mapping.json`

### Search Features

| Feature | Implementation |
|---------|----------------|
| Full-text search | `multi_match` with `fuzziness: 'AUTO'` |
| Autocomplete | Completion suggester with fuzzy matching |
| Geo-search | `geo_distance` filter |
| Facets | Aggregations (terms, range, histogram, nested) |
| Highlighting | `<mark>` tags on name, description, artist |
| Spell correction | Phrase suggester |
| Nested objects | Performers, validation history, offers |

---

## 4. SECURITY ANALYSIS

### A. Search Injection Prevention

**Assessment: GOOD - Proper sanitization implemented**

**File:** `src/utils/sanitizer.ts`

```typescript
static sanitizeQuery(query: string | any): string {
  // Handle null/undefined/non-string inputs
  if (!query || typeof query !== 'string') {
    return '';
  }

  let sanitized = query
    .replace(/[<>]/g, '')           // HTML/XML tags
    .replace(/[{}[\]]/g, '')        // JSON/array brackets
    .replace(/\\/g, '')             // Escape characters
    .replace(/['"]/g, '')           // Quotes
    .replace(/[;|&$]/g, '')         // Command injection chars
    .replace(/\0/g, '')             // Null bytes
    .trim();

  sanitized = sanitized.substring(0, this.MAX_QUERY_LENGTH); // 200 chars
  return sanitized;
}
```

**Protection Measures:**
| Protection | Status | Notes |
|------------|--------|-------|
| HTML/XML injection | ✅ | `<>` stripped |
| JSON injection | ✅ | `{}[]` stripped |
| Script injection | ✅ | Dangerous chars removed |
| Query length limits | ✅ | Max 200 characters |
| Null byte injection | ✅ | `\0` stripped |
| Number sanitization | ✅ | `sanitizeNumber()` with min/max |
| Coordinate validation | ✅ | Lat/Lon range validation |
| Filter whitelisting | ✅ | Only allowed fields passed through |

**Usage in Controller:** `src/controllers/search.controller.ts`
```typescript
// SECURITY: Sanitize all inputs
const sanitizedQuery = SearchSanitizer.sanitizeQuery(q);
const sanitizedType = type ? SearchSanitizer.sanitizeQuery(type) : undefined;
const sanitizedLimit = SearchSanitizer.sanitizeNumber(limit, 20, 1, 100);
```

### B. Tenant Isolation

**Assessment: PARTIALLY IMPLEMENTED - Professional Search lacks tenant filter**

**Tenant Filter Utility:** `src/utils/tenant-filter.ts`

```typescript
export function addTenantFilter(query: any, options: TenantFilterOptions): any {
  if (options.allowCrossTenant) {
    return query; // Admin bypass
  }

  if (!options.venueId) {
    throw new Error('venueId is required for tenant isolation');
  }

  // Add venue_id term filter
  query.bool.filter.push({
    term: { venue_id: options.venueId }
  });

  return query;
}
```

**Cross-tenant access control:**
```typescript
export function canAccessCrossTenant(role: string): boolean {
  const crossTenantRoles = ['admin', 'super-admin', 'system'];
  return crossTenantRoles.includes(role.toLowerCase());
}
```

**Tenant Isolation Coverage:**

| Endpoint | Auth Required | Tenant Required | Tenant Filter Applied |
|----------|---------------|-----------------|----------------------|
| `/search/` | ✅ | ✅ | ✅ |
| `/search/venues` | ✅ | ✅ | ✅ |
| `/search/events` | ✅ | ✅ | ✅ |
| `/search/suggest` | ✅ | ✅ | ❌ (no tenant filter) |
| `/pro/advanced` | ✅ | ❌ | ❌ **CRITICAL** |
| `/pro/near-me` | ✅ | ❌ | ❌ **CRITICAL** |
| `/pro/trending` | ✅ | ❌ | ❌ (global analytics) |
| `/pro/:index/:id/similar` | ✅ | ❌ | ❌ **CRITICAL** |

**CRITICAL SECURITY ISSUE:** Professional search endpoints (`/pro/*`) do NOT apply tenant filters to Elasticsearch queries. Users can search across ALL tenants' data.

### C. S2S Authentication

**Assessment: JWT-BASED, NO HMAC-SHA256**

**File:** `src/middleware/auth.middleware.ts`

```typescript
const decoded = jwt.verify(token, jwtSecret || 'dev-secret-key-change-in-production') as any;

request.user = {
  id: decoded.userId || decoded.id,
  venueId: decoded.venueId,
  tenant_id: decoded.tenant_id || decoded.venueId,
  role: decoded.role || 'user',
  permissions: decoded.permissions || []
};
```

**Security Notes:**
- Uses JWT verification (standard)
- Fallback to dev secret in development only
- Production requires `JWT_SECRET` environment variable

**Outbound HTTP Calls:**

| File | Line | Service | Endpoint | Auth Method | Notes |
|------|------|---------|----------|-------------|-------|
| N/A | - | - | - | - | No HTTP calls to other services found |

The search service does NOT make HTTP calls to other services. It accesses data via:
1. Direct database queries (PostgreSQL)
2. Direct MongoDB queries
3. RabbitMQ message consumption

### D. Service Boundary Violations

**Assessment: CRITICAL - Direct database access to other services' tables**

The enrichment services directly query tables owned by other services:

| File | Line | Table | Owned By | Purpose |
|------|------|-------|----------|---------|
| event-enrichment.service.ts | 31 | `events` | event-service | Event data |
| event-enrichment.service.ts | 40 | `venues` | venue-service | Venue data |
| event-enrichment.service.ts | 45 | `event_performers` | event-service | Performer links |
| event-enrichment.service.ts | 46 | `performers` | event-service | Performer data |
| event-enrichment.service.ts | 58 | `tickets` | ticket-service | Pricing stats |
| venue-enrichment.service.ts | 31 | `venues` | venue-service | Venue data |
| venue-enrichment.service.ts | 40 | `venue_sections` | venue-service | Section data |
| ticket-enrichment.service.ts | 25 | `tickets` | ticket-service | Ticket data |
| ticket-enrichment.service.ts | 34 | `ticket_transfers` | transfer-service | Transfer history |
| ticket-enrichment.service.ts | 41 | `ticket_validations` | scanning-service | Validation history |
| ticket-enrichment.service.ts | 51 | `ticket_price_history` | ticket-service | Price history |
| ticket-enrichment.service.ts | 61 | `nfts` | blockchain-service | NFT data |
| ticket-enrichment.service.ts | 69 | `marketplace_listings` | marketplace-service | Listing data |
| marketplace-enrichment.service.ts | 25 | `marketplace_listings` | marketplace-service | Listing data |
| marketplace-enrichment.service.ts | 34 | `tickets` | ticket-service | Ticket data |
| marketplace-enrichment.service.ts | 39 | `events` | event-service | Event data |
| marketplace-enrichment.service.ts | 44 | `venues` | venue-service | Venue data |
| marketplace-enrichment.service.ts | 49 | `users` | auth-service | Seller data |
| marketplace-enrichment.service.ts | 74 | `marketplace_offers` | marketplace-service | Offers data |
| marketplace-enrichment.service.ts | 82 | `nfts` | blockchain-service | NFT data |
| content-sync.service.ts | 2-3 | MongoDB models | venue/event-service | Direct model imports |
| sync-data.ts | 14 | `venues` | venue-service | Bulk sync |
| sync-data.ts | 57 | `events` | event-service | Bulk sync |

**Import Violations (Direct Model Imports):**
```typescript
// content-sync.service.ts:2-3
import { VenueContentModel } from '../../../venue-service/src/models/mongodb/venue-content.model';
import { EventContentModel } from '../../../event-service/src/models/mongodb/event-content.model';
```

---

## 5. DATA SYNCHRONIZATION

### Synchronization Mechanisms

**1. Real-time Sync (RabbitMQ Events)**

**File:** `src/config/rabbitmq.ts`

```typescript
await channel.assertExchange('search.sync', 'topic', { durable: true });
await channel.assertQueue('search.sync.queue', { durable: true });
await channel.bindQueue('search.sync.queue', 'search.sync', '#');
```

**File:** `src/services/sync.service.ts`

Processes routing keys:
- `venue.created`, `venue.updated`, `venue.deleted`
- `event.created`, `event.updated`, `event.deleted`
- `ticket.created`, `ticket.updated`, `ticket.deleted`

**2. Batch Sync (Scripts)**

| Script | Purpose |
|--------|---------|
| `sync-data.ts` | Bulk index all venues and events |
| `sync-content.ts` | Sync MongoDB content to Elasticsearch |

**3. Content Sync (MongoDB to ES)**

**File:** `src/services/content-sync.service.ts`

- Syncs amenities, accessibility, images, performers, ratings
- Bulk sync methods for venues and events

### Consistency Management

**File:** `src/services/consistency.service.ts`

| Feature | Implementation |
|---------|----------------|
| Version tracking | `index_versions` table with incrementing version |
| Idempotency | SHA-256 hash of operation for deduplication |
| Consistency tokens | Client-facing tokens with 60-second expiry |
| Wait for consistency | Polling with 5-second max wait |
| Background processor | 5-second interval queue processing |
| Priority indexing | High priority (9+) processed immediately |

### Conflict Resolution

- Last-write-wins based on version number
- Idempotency key prevents duplicate operations
- High-priority operations bypass queue

---

## 6. INDEXING STRATEGY

### Index Documents

**Events Index (`events`):**
- Full-text fields: `title`, `description`
- Nested: `performers` (name, genre, headliner)
- Nested: `venue` (venueId, name, city, state, country, location)
- Pricing: minPrice, maxPrice, averagePrice
- Search boost based on: featured, ratings, ticket sales, upcoming date

**Venues Index (`venues`):**
- Full-text fields: `name`, `description`
- Nested: `sections` (sectionId, name, capacity, type)
- Arrays: `amenities`, `accessibilityFeatures`
- Geo-point: `location` (lat/lon)
- Search boost based on: featured, ratings, capacity

**Tickets Index (`tickets`):**
- Nested: `transferHistory`, `validation.validationHistory`, `pricing.priceHistory`
- Blockchain data: nftId, contractAddress, tokenId
- Marketplace data: isListed, listingPrice, viewCount

**Marketplace Index (`marketplace`):**
- Nested: `offers`, `pricing.priceHistory`
- Seller data: reputation, totalSales, responseTime, powerSeller
- Analytics: views, watchers, clickThroughRate

### Geo-location Indexing

```typescript
location: venue?.location
  ? { lat: venue.location.lat, lon: venue.location.lon }
  : undefined,
```

Geo-search uses `geo_distance` filter with configurable radius (default 10km).

---

## 7. SEARCH FEATURES

### A. Autocomplete

**File:** `src/services/autocomplete.service.ts`

| Feature | Implementation |
|---------|----------------|
| Algorithm | Completion suggester with prefix matching |
| Fuzzy matching | `fuzziness: 'AUTO'`, `min_length: 3` |
| Deduplication | `skip_duplicates: true` |
| Max suggestions | 5 per type (venues, events) |
| Context-aware | Optional city/category context filtering |

### B. Professional Search

**File:** `src/services/professional-search.service.ts`

**Advanced Filters:**
- Text search with field boosting (name^3, description^2, artist^2)
- Price range (min/max)
- Date range
- Categories (multi-select)
- Capacity range
- Performer (nested query with fuzzy matching)
- Genre (nested query)
- Amenities (terms filter)
- Accessibility features
- Minimum rating

**Aggregations (Facets):**
- categories, price_ranges, venues, dates (monthly histogram)
- performers (nested), genres (nested), amenities, accessibility
- ratings histogram, average rating

**Sorting Options:**
- `_score` (relevance)
- `distance` (geo-sort)
- `date_asc`, `date_desc`
- `price_asc`, `price_desc`
- `popularity`

### C. A/B Testing

**File:** `src/services/ab-testing.service.ts`

| Test | Variants | Weight |
|------|----------|--------|
| `search_algorithm` | control (standard) | 50% |
| | treatment (ml_boosted) | 50% |

**Note:** Implementation is basic - random assignment without persistent user bucketing.

---

## 8. ENRICHMENT SERVICES

### Event Enrichment

**File:** `src/services/event-enrichment.service.ts`

| Source | Data |
|--------|------|
| PostgreSQL `events` | Basic event data |
| PostgreSQL `venues` | Venue info |
| PostgreSQL `event_performers` + `performers` | Performer list |
| PostgreSQL `tickets` | Pricing stats (min/max/avg, sold count) |
| MongoDB `event_content` | Description, tags, images |
| MongoDB (RatingService) | Average rating, review count |

**Search Boost Calculation:**
- Featured events: +0.5
- High ratings (4.5+): +0.3
- Many reviews (50+): +0.2
- High sell-through (90%+): +0.3
- Upcoming events (within 7 days): +0.3

### Venue Enrichment

**File:** `src/services/venue-enrichment.service.ts`

| Source | Data |
|--------|------|
| PostgreSQL `venues` | Basic venue data |
| PostgreSQL `venue_sections` | Section details |
| MongoDB `venue_content` | Amenities, accessibility, images, policies |
| MongoDB (RatingService) | Ratings with category breakdown |

### Ticket Enrichment

**File:** `src/services/ticket-enrichment.service.ts`

| Source | Data |
|--------|------|
| PostgreSQL `tickets` | Basic ticket data |
| PostgreSQL `ticket_transfers` | Transfer history |
| PostgreSQL `ticket_validations` | Validation history |
| PostgreSQL `ticket_price_history` | Price history |
| PostgreSQL `nfts` | Blockchain data |
| PostgreSQL `marketplace_listings` | Active listing data |

### Marketplace Enrichment

**File:** `src/services/marketplace-enrichment.service.ts`

| Source | Data |
|--------|------|
| PostgreSQL `marketplace_listings` | Listing data |
| PostgreSQL `tickets` | Ticket details |
| PostgreSQL `events` | Event data |
| PostgreSQL `venues` | Venue data |
| PostgreSQL `users` | Seller data |
| PostgreSQL `marketplace_offers` | Offers |
| PostgreSQL `nfts` | Blockchain data |

---

## 9. PERFORMANCE OPTIMIZATION

### Performance Monitoring

**File:** `src/utils/performance-monitor.ts`

| Feature | Implementation |
|---------|----------------|
| Slow query threshold | 1000ms (configurable) |
| Metrics retention | Last 10,000 per operation |
| Statistics | min, max, avg, p50, p95, p99 |
| Slow operation detection | p95 > threshold |

### Caching Strategy

**File:** `src/services/cache-integration.ts`

| TTL | Resource |
|-----|----------|
| 5 min | Session, User, Search results |
| 10 min | Events |
| 30 min | Venues, Tickets |
| 60 min | Templates |

**Professional Search Cache:**
- Cache key: `search:${JSON.stringify(params)}`
- TTL: 5 minutes
- Trending searches: 1 hour

### Index Optimization

**File:** `src/scripts/optimize-indices.ts`

- Force merge to single segment
- Refresh interval: 5s (reduced from 1s)
- Replicas: 0 (single node)
- Cache clearing after optimization

---

## 10. CODE QUALITY

### TODO/FIXME Comments

| File | Line | Comment |
|------|------|---------|
| sync-data.ts | 42 | `// TODO Phase 2: Add MongoDB content via venue-enrichment.service` |
| sync-data.ts | 88 | `// TODO Phase 2: Add MongoDB content via event-enrichment.service` |

### `any` Type Usage

**Total occurrences: 104**

**High-impact areas:**
- Elasticsearch query builders (expected - dynamic queries)
- Enrichment service constructors (should use interfaces)
- MongoDB content extraction methods
- Aggregation formatting

### Error Handling

| Pattern | Usage |
|---------|-------|
| Custom error classes | `SearchError`, `ValidationError`, `NotFoundError`, `RateLimitError` |
| Try-catch with logging | Consistent across services |
| Silent fail for analytics | Search tracking failures don't break search |
| Graceful degradation | Enrichment failures use fallback basic data |

### Dependencies

**Core:**
- `@elastic/elasticsearch` - Elasticsearch client
- `fastify` - HTTP framework
- `awilix` - Dependency injection
- `knex` - PostgreSQL query builder
- `mongodb` / `mongoose` - MongoDB access
- `ioredis` - Redis client
- `amqplib` - RabbitMQ client
- `pino` - Logging
- `joi` - Validation

**Shared:**
- `@tickettoken/shared` - QUEUES, RatingService, createCache

---

## 11. COMPARISON TO PREVIOUS AUDITS

| Aspect | Other Services | Search Service |
|--------|----------------|----------------|
| JWT Auth | Standard | Standard |
| HMAC S2S | Present in some | Not implemented |
| RLS Policies | Standard pattern | Standard pattern |
| Service Boundaries | Some violations | **Heavy violations** |
| Input Sanitization | Varies | Comprehensive |
| Error Handling | Standard | Standard with custom classes |
| Type Safety | Varies | 104 `any` usages |

---

## FINAL SUMMARY

### CRITICAL ISSUES

1. **Professional Search No Tenant Isolation** - `/pro/advanced`, `/pro/near-me`, `/pro/:index/:id/similar` endpoints do NOT apply tenant filters to Elasticsearch queries. Users can search across ALL tenants' data.
   - **Files:** `src/controllers/professional-search.controller.ts`, `src/services/professional-search.service.ts`
   - **Impact:** Data leakage across tenants
   - **Fix:** Add tenant filter to all professional search queries

2. **Massive Service Boundary Violations** - Enrichment services directly query 15+ tables owned by other services
   - **Files:** All `*-enrichment.service.ts`, `content-sync.service.ts`
   - **Impact:** Tight coupling, schema change fragility, security boundary bypass
   - **Fix:** Use service APIs or event-driven data delivery

3. **Direct Model Imports from Other Services**
   - **File:** `src/services/content-sync.service.ts:2-3`
   - **Code:** `import { VenueContentModel } from '../../../venue-service/...'`
   - **Impact:** Breaks service isolation
   - **Fix:** Use shared packages or HTTP APIs

### HIGH PRIORITY

1. **Autocomplete Missing Tenant Filter** - `/search/suggest` endpoint requires tenant but doesn't filter results
   - **File:** `src/controllers/search.controller.ts:74-85`

2. **A/B Testing Not Persistent** - Random variant assignment without user bucketing
   - **File:** `src/services/ab-testing.service.ts`
   - **Impact:** Inconsistent user experience

3. **No HMAC-SHA256 for S2S** - Uses JWT only, no standardized HMAC auth for internal calls
   - **Note:** Search service doesn't make outbound HTTP calls, so lower impact

### MEDIUM PRIORITY

1. **104 `any` Type Usages** - Reduces type safety
2. **Default Tenant ID Fallback** - `DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001'` used when tenant missing
3. **Dev Secret Fallback** - JWT secret falls back in non-production (correctly guarded)

### SEARCH EFFECTIVENESS ASSESSMENT

| Aspect | Assessment | Notes |
|--------|------------|-------|
| **Injection Prevention** | ✅ GOOD | Comprehensive sanitization in `SearchSanitizer` |
| **Tenant Isolation** | ⚠️ PARTIAL | Main search OK, professional search MISSING |
| **Data Sync** | ✅ BOTH | Real-time (RabbitMQ) + Batch (scripts) |
| **Index Health** | ✅ GOOD | Zero-downtime reindex, optimization scripts |
| **Search Quality** | ✅ GOOD | Fuzzy matching, highlighting, facets, geo-search |
| **Caching** | ✅ GOOD | Multi-level caching with appropriate TTLs |
| **Performance Monitoring** | ✅ GOOD | Percentile tracking, slow query detection |

---

**Files Analyzed:** 48
**Critical Issues:** 3
**High Priority Issues:** 3
**Medium Priority Issues:** 3

**Overall Assessment:** The search service has excellent search functionality and input sanitization, but has critical tenant isolation gaps in professional search endpoints and significant architectural issues with service boundary violations. The direct database access pattern should be refactored to use event-driven synchronization or API calls to maintain proper service isolation.
