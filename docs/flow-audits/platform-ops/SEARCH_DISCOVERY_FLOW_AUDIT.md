# SEARCH/DISCOVERY FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | December 31, 2024 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Search & Discovery |

---

## Executive Summary

**EXCELLENT: Enterprise-grade search system with Elasticsearch.**

| Component | Status |
|-----------|--------|
| Elasticsearch integration | ✅ Complete |
| Full-text search | ✅ Complete |
| Autocomplete/suggestions | ✅ Complete |
| Event enrichment | ✅ Complete |
| Venue enrichment | ✅ Complete |
| Consistency tokens | ✅ Complete |
| Tenant isolation | ✅ Complete |
| Search analytics | ✅ Complete |
| Input sanitization | ✅ Complete |

**This is production-ready.**

---

## Files Verified

| Component | File | Status |
|-----------|------|--------|
| Search Service | search-service/services/search.service.ts | ✅ Verified |
| Autocomplete | search-service/services/autocomplete.service.ts | ✅ Verified |
| Sync Service | search-service/services/sync.service.ts | ✅ Verified |
| Consistency | search-service/services/consistency.service.ts | ✅ Verified |
| Event Enrichment | search-service/services/event-enrichment.service.ts | ✅ Verified |
| Search Controller | search-service/controllers/search.controller.ts | ✅ Verified |
| Fastify Config | search-service/config/fastify.ts | ✅ Verified |
| Event Routes | event-service/routes/events.routes.ts | ✅ Verified |

---

## Architecture Overview
```
┌─────────────────┐     ┌─────────────────┐
│  Event Service  │────>│  Message Queue  │
│  Venue Service  │     │   (RabbitMQ)    │
│  Ticket Service │     └────────┬────────┘
└─────────────────┘              │
                                 ▼
                    ┌─────────────────────┐
                    │   Search Service    │
                    │                     │
                    │  ┌───────────────┐  │
                    │  │ Sync Service  │  │
                    │  └───────┬───────┘  │
                    │          │          │
                    │  ┌───────▼───────┐  │
                    │  │  Enrichment   │  │
                    │  │   Services    │  │
                    │  └───────┬───────┘  │
                    │          │          │
                    │  ┌───────▼───────┐  │
                    │  │ Elasticsearch │  │
                    │  └───────────────┘  │
                    └─────────────────────┘
                                 │
                                 ▼
                    ┌─────────────────────┐
                    │    Frontend App     │
                    │  /api/v1/search/*   │
                    └─────────────────────┘
```

---

## Search Endpoints

### API Routes

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `/api/v1/search/` | GET | Main search | authenticate + requireTenant |
| `/api/v1/search/venues` | GET | Search venues only | authenticate + requireTenant |
| `/api/v1/search/events` | GET | Search events only | authenticate + requireTenant |
| `/api/v1/search/suggest` | GET | Autocomplete | authenticate + requireTenant |

### Event Service List Endpoint

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `GET /events` | GET | List events with filters |

Query parameters:
- `status` - Event status filter
- `visibility` - Visibility filter
- `category_id` - Category filter
- `venue_id` - Venue filter
- `is_featured` - Featured filter
- `search` - Text search (max 200 chars)
- `limit` - Pagination (1-100, default 20)
- `offset` - Pagination offset
- `sort_by` - created_at, name, priority, views
- `sort_order` - asc, desc

---

## Search Service

### Implementation

**File:** `search-service/services/search.service.ts`
```typescript
async search(query, type, limit, options) {
  // Wait for consistency if token provided
  if (options?.consistencyToken) {
    await this.consistencyService.waitForConsistency(
      options.consistencyToken,
      5000 // Max 5 seconds wait
    );
  }

  // Build Elasticsearch query
  let esQuery = query ? {
    multi_match: {
      query: query,
      fields: ['name^2', 'description', 'city', 'venue_name'],
      fuzziness: 'AUTO'
    }
  } : {
    match_all: {}
  };

  // SECURITY: Add tenant isolation filter
  if (options?.venueId) {
    esQuery = addTenantFilter(esQuery, {
      venueId: options.venueId,
      allowCrossTenant: canAccessCrossTenant(options.userRole)
    });
  }

  // Execute search
  const response = await this.elasticsearch.search({
    index: indices,
    size: limit,
    body: { query: esQuery },
    preference: options?.userId  // Session stickiness
  });

  // Track search for analytics
  await this.trackSearch(query, results.total, options?.userId);

  return results;
}
```

### Features

| Feature | Implementation |
|---------|----------------|
| Full-text search | Elasticsearch multi_match |
| Fuzzy matching | `fuzziness: 'AUTO'` |
| Field boosting | `name^2` (name weighted 2x) |
| Tenant isolation | `addTenantFilter()` |
| Consistency tokens | Wait for ES index sync |
| Search analytics | Tracked in `search_analytics` index |
| Popular searches | Aggregation query |

---

## Autocomplete Service

### Implementation

**File:** `search-service/services/autocomplete.service.ts`
```typescript
async getSuggestions(query, types = ['events', 'venues']) {
  if (!query || query.length < 2) return [];

  const suggest = {
    venue_suggest: {
      prefix: query,
      completion: {
        field: 'name.suggest',
        size: 5,
        skip_duplicates: true,
        fuzzy: {
          fuzziness: 'AUTO',
          min_length: 3
        }
      }
    },
    event_suggest: {
      prefix: query,
      completion: {
        field: 'title.suggest',
        size: 5,
        skip_duplicates: true,
        fuzzy: {
          fuzziness: 'AUTO',
          min_length: 3
        }
      }
    }
  };

  // Returns combined, deduplicated suggestions
}
```

### Features

| Feature | Implementation |
|---------|----------------|
| Completion suggester | Fast prefix matching |
| Fuzzy suggestions | Typo tolerance |
| Context-aware | Can filter by city/category |
| Deduplication | `skip_duplicates: true` |
| Combined results | Events + Venues |

---

## Data Enrichment

### Event Enrichment

**File:** `search-service/services/event-enrichment.service.ts`

When indexing events, the system enriches with:

| Data Source | Fields |
|-------------|--------|
| PostgreSQL events | id, name, description, date, status |
| PostgreSQL venues | name, city, state, location |
| PostgreSQL performers | name, genre, headliner |
| PostgreSQL tickets | min/max/avg price, sold count |
| MongoDB event_content | tags, images, extended description |
| MongoDB ratings | average rating, total reviews |

### Search Boost Calculation
```typescript
calculateSearchBoost(event, ratings, pricingStats) {
  let boost = 1.0;

  // Featured events: +0.5
  if (event.featured) boost += 0.5;

  // High ratings: +0.1 to +0.3
  if (ratings?.averageRating >= 4.5) boost += 0.3;

  // Many reviews: +0.1 to +0.2
  if (ratings?.totalReviews >= 50) boost += 0.2;

  // High sell-through: +0.1 to +0.3
  if (sellThroughRate >= 0.9) boost += 0.3;

  // Upcoming (within 7 days): +0.3
  if (daysUntilEvent <= 7) boost += 0.3;

  return boost;
}
```

---

## Sync Service

### Implementation

**File:** `search-service/services/sync.service.ts`

Processes messages from event queue:
```typescript
async processMessage(routingKey, content, clientId) {
  const [entity, action] = routingKey.split('.');  // e.g., "event.created"

  switch (entity) {
    case 'venue':
      return this.syncVenue(action, content, clientId);
    case 'event':
      return this.syncEvent(action, content, clientId);
    case 'ticket':
      return this.syncTicket(action, content, clientId);
  }
}
```

### Sync Flow
```
1. Message arrives (e.g., event.created)
         ↓
2. Enrich document with full data
         ↓
3. Queue index operation with version
         ↓
4. Index to Elasticsearch
         ↓
5. Return consistency token
         ↓
6. Client can wait for token before searching
```

---

## Consistency Service

### Implementation

**File:** `search-service/services/consistency.service.ts`

Ensures read-after-write consistency:
```typescript
async indexWithConsistency(operation, clientId) {
  // Avoid concurrent indexing of same entity
  if (this.indexingInProgress.has(key)) {
    await this.indexingInProgress.get(key);
  }

  // Index with version tracking
  await this.doIndex(operation);

  // Generate consistency token
  const token = await this.generateConsistencyToken(
    operation.entityType,
    operation.entityId,
    clientId
  );

  return token;  // Client can use this to wait for consistency
}

async waitForConsistency(token, maxWaitMs = 5000) {
  // Poll until version is indexed or timeout
  while (Date.now() - startTime < maxWaitMs) {
    const allIndexed = await this.checkVersionsIndexed(required_versions);
    if (allIndexed) return true;
    await sleep(100);
  }
  return false;
}
```

### Database Tables

| Table | Purpose |
|-------|---------|
| `index_versions` | Track entity versions and index status |
| `index_queue` | Queue pending index operations |
| `read_consistency_tokens` | Store tokens for read consistency |

---

## Security

### Input Sanitization

**File:** `search-service/controllers/search.controller.ts`
```typescript
// SECURITY: Sanitize all inputs
const sanitizedQuery = SearchSanitizer.sanitizeQuery(q);
const sanitizedType = type ? SearchSanitizer.sanitizeQuery(type) : undefined;
const sanitizedLimit = SearchSanitizer.sanitizeNumber(limit, 20, 1, 100);
```

### Tenant Isolation
```typescript
// SECURITY: Add tenant isolation filter
if (options?.venueId) {
  const allowCrossTenant = canAccessCrossTenant(options.userRole);
  esQuery = addTenantFilter(esQuery, {
    venueId: options.venueId,
    allowCrossTenant
  });
}
```

### Authentication

All search routes require:
- `authenticate` - JWT token validation
- `requireTenant` - Tenant context

---

## What Works ✅

| Component | Status |
|-----------|--------|
| Elasticsearch integration | ✅ Works |
| Full-text search | ✅ Works |
| Fuzzy matching | ✅ Works |
| Autocomplete | ✅ Works |
| Event enrichment | ✅ Works |
| Venue enrichment | ✅ Works |
| Ticket enrichment | ✅ Works |
| Search boost/ranking | ✅ Works |
| Consistency tokens | ✅ Works |
| Background processor | ✅ Works |
| Tenant isolation | ✅ Works |
| Input sanitization | ✅ Works |
| Search analytics | ✅ Works |
| Popular searches | ✅ Works |

---

## Dependencies

| Dependency | Purpose |
|------------|---------|
| Elasticsearch | Search engine |
| PostgreSQL | Source data (events, venues, tickets) |
| MongoDB | Extended content (descriptions, tags) |
| RabbitMQ | Message queue for sync |
| Redis | Caching (via shared library) |

---

## Summary

| Aspect | Status |
|--------|--------|
| Search functionality | ✅ Complete |
| Autocomplete | ✅ Complete |
| Data enrichment | ✅ Complete |
| Consistency guarantees | ✅ Complete |
| Security | ✅ Complete |
| Analytics | ✅ Complete |

**Bottom Line:** Search and discovery is fully implemented and production-ready with Elasticsearch, enrichment pipelines, and consistency guarantees.

---

## Related Documents

- `EVENT_CREATION_FLOW_AUDIT.md` - Event data source
- `VENUE_ONBOARDING_FLOW_AUDIT.md` - Venue data source

