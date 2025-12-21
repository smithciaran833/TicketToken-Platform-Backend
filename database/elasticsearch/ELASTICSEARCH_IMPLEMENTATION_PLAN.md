# Elasticsearch Implementation Plan

## Executive Summary

### Current State
- **Coverage:** ~25% implemented
- **Indices defined:** 8 sophisticated mappings
- **Indices actually used:** 2 basic (venues, events) + 2 minimal (tickets, marketplace)
- **Problem:** Mappings are never loaded - developers created ad-hoc inline mappings instead

### What Competitors Have That You Don't
- **Ticketmaster:** Search by artist, genre, venue amenities, accessibility, price range, "similar events"
- **SeatGeek:** Deal scores, section-level search, "best seats under $X"
- **Eventbrite:** Search by organizer, event type, "events like this", autocomplete on everything

### What's Working
- Basic event/venue text search
- Geo-proximity ("events near me")
- Fuzzy matching
- Price/date filtering
- Basic aggregations (facets)
- Autocomplete (match_phrase_prefix only)

### What's Missing
- Search by performer/artist name
- Search by venue amenities ("venues with parking")
- Search by accessibility features
- Search by ratings
- Nested performer data in events
- Nested section data in venues
- Rich ticket search (validation history, transfer history)
- Full marketplace search (offers, seller reputation, blockchain)
- User search
- Content search
- Completion suggesters (real autocomplete)
- Custom analyzers from mappings

### Effort Estimate
- **Phase 1 - Fix mappings:** 1-2 days
- **Phase 2 - Event enrichment:** 3-4 days
- **Phase 3 - Venue enrichment:** 3-4 days
- **Phase 4 - Tickets & marketplace:** 2-3 days
- **Phase 5 - Query upgrades:** 2-3 days
- **Phase 6 - Testing & reindex:** 2-3 days
- **Total:** 13-19 days

### Dependencies
- **Requires:** MongoDB Implementation Plan (content for enrichment)
- **Coordinates with:** MongoDB plan modifies sync.service.ts first, then this plan adds search enrichment

---

## Part 1: Fix Mapping Loading

### The Problem

Mappings are defined in `database/elasticsearch/mappings/*.json` but never used.

Current code creates indices with inline mappings (only 12-15 fields).
Full mappings define 50-150 fields per index.

### The Fix

Load mappings from JSON files instead of inline definitions.

### Files to Modify

| File | Changes |
|------|---------|
| `src/scripts/create-indices.ts` | Import and use JSON mapping files |
| `src/scripts/update-indices.ts` | Import and use JSON mapping files |
| `src/scripts/fix-geo-location.ts` | Use proper mapping instead of inline |

### Reindexing Strategy (Zero-Downtime)
```
1. Create new index with version suffix (venues_v2)
2. Apply full mapping from JSON file
3. Reindex data from venues to venues_v2
4. Update alias to point to venues_v2
5. Delete old index
```

---

## Part 2: Index Enrichment Services

### 2.1 Event Enrichment

**Current Fields (15):**
```
id, name, description, date, category, price, venue_id, venue_name, 
city, state, location, status, created_at, updated_at, tenant_id
```

**Required Fields (50+):**
```
eventId, title, description, category, subcategory, tags
eventDate, endDate, status, featured, visibility

venue: { venueId, name, city, state, country, location, address }

performers: [{ performerId, name, headliner, genre }]

pricing: { minPrice, maxPrice, averagePrice, currency }

capacity, ticketsSold

images: [{ url, type, primary }]

ratings: { averageRating, totalReviews }
```

**File to Create:** `src/services/event-enrichment.service.ts`

Pulls data from:
- PostgreSQL: events, event_performers, performers
- MongoDB: event_content (images, lineup)
- MongoDB: user_content (ratings)

---

### 2.2 Venue Enrichment

**Current Fields (12):**
```
id, name, description, city, state, location, capacity, 
status, created_at, updated_at, tenant_id, address
```

**Required Fields (60+):**
```
venueId, name, description, type

address: { street, city, state, zipCode, country, fullAddress }

location, timezone, capacity

sections: [{ sectionId, name, capacity, type }]

amenities: []

accessibilityFeatures: []

images: [{ url, type, caption, primary }]

ratings: { averageRating, totalReviews, accessibility, sound, parking }

contact: { phone, email, website, boxOfficePhone }

policies: { ageRestrictions, bagPolicy, smokingPolicy }
```

**File to Create:** `src/services/venue-enrichment.service.ts`

Pulls data from:
- PostgreSQL: venues, venue_sections
- MongoDB: venue_content (amenities, accessibility, images, policies)
- MongoDB: user_content (ratings)

---

### 2.3 Ticket Enrichment

**Current Fields (9):**
```
id, event_id, section, row, seat, price, status, created_at, tenant_id
```

**Required Fields (100+):**
```
ticketId, eventId, venueId, userId, ticketNumber

section, row, seat, seatView

barcode, qrCode, accessCode

ticketType, category

pricing: { originalPrice, purchasePrice, currentValue, fees, taxes }

priceHistory: [{ price, timestamp, source }]

transferHistory: [{ fromUserId, toUserId, transferDate, transferType }]

marketplace: { isListed, listingId, listingPrice, viewCount }

blockchain: { nftId, contractAddress, tokenId, mintTx }

validation: { lastValidated, validationCount, history: [] }

isTransferable, isResellable, isRefundable, isUpgradeable

statusHistory: [{ status, timestamp, reason }]
```

**File to Create:** `src/services/ticket-enrichment.service.ts`

Pulls data from:
- PostgreSQL: tickets, ticket_transfers, ticket_validations, ticket_price_history
- PostgreSQL: nfts, marketplace_listings

---

### 2.4 Marketplace Enrichment

**Current Fields (10):**
```
id, ticket_id, listing_price, seller_id, status, 
created_at, updated_at, event_id, section, row
```

**Required Fields (150+):**
```
listingId, ticketId, eventId, venueId, sellerId

price, originalPrice, finalPrice, currency, fees, royalties

status, listingType, deliveryMethod

event: { name, date, category, popularity, daysUntilEvent }

ticket: { section, row, seat, type, quantity, verified }

venue: { name, city, state, country, location }

seller: { username, reputationScore, totalSales, verified, powerSeller }

priceHistory: [{ price, timestamp, reason }]

marketAnalytics: { comparablePrice, marketPrice, pricePercentile }

offers: [{ offerId, buyerId, amount, status }]

blockchain: { nftId, contractAddress, tokenId, escrowAddress }

analytics: { views, uniqueViews, watchers, clickThroughRate }

urgency, featured, promoted
```

**File to Create:** `src/services/marketplace-enrichment.service.ts`

Pulls data from:
- PostgreSQL: marketplace_listings, tickets, events, venues, users
- MongoDB: user reputation data (if stored there)

---

## Part 3: Search Query Upgrades

### 3.1 Add Nested Queries

**File to Modify:** `src/services/professional-search.service.ts`
```typescript
// Search by performer name
if (filters.performer) {
  query.bool.must.push({
    nested: {
      path: 'performers',
      query: {
        match: {
          'performers.name': {
            query: filters.performer,
            fuzziness: 'AUTO'
          }
        }
      }
    }
  });
}

// Search by amenities
if (filters.amenities?.length) {
  query.bool.filter.push({
    terms: { amenities: filters.amenities }
  });
}

// Search by accessibility
if (filters.accessibility?.length) {
  query.bool.filter.push({
    terms: { accessibilityFeatures: filters.accessibility }
  });
}

// Search by minimum rating
if (filters.minRating) {
  query.bool.filter.push({
    range: { 'ratings.averageRating': { gte: filters.minRating } }
  });
}

// Search by venue section
if (filters.section) {
  query.bool.must.push({
    nested: {
      path: 'sections',
      query: {
        bool: {
          must: [
            { match: { 'sections.name': filters.section } },
            { range: { 'sections.available': { gt: 0 } } }
          ]
        }
      }
    }
  });
}
```

---

### 3.2 Add Completion Suggesters

**File to Modify:** `src/services/autocomplete.service.ts`

Replace match_phrase_prefix with completion suggester:
```typescript
async getAutocomplete(prefix: string, types: string[]): Promise<Suggestions> {
  const suggest: any = {};
  
  if (types.includes('venues')) {
    suggest.venue_suggest = {
      prefix: prefix,
      completion: {
        field: 'name.suggest',
        size: 5,
        skip_duplicates: true,
        fuzzy: { fuzziness: 'AUTO' }
      }
    };
  }
  
  if (types.includes('events')) {
    suggest.event_suggest = {
      prefix: prefix,
      completion: {
        field: 'title.suggest',
        size: 5,
        skip_duplicates: true,
        fuzzy: { fuzziness: 'AUTO' }
      }
    };
  }
  
  if (types.includes('performers')) {
    suggest.performer_suggest = {
      prefix: prefix,
      completion: {
        field: 'performers.name.suggest',
        size: 5,
        skip_duplicates: true,
        fuzzy: { fuzziness: 'AUTO' }
      }
    };
  }
  
  const results = await this.esClient.search({
    index: ['venues', 'events'],
    body: { suggest }
  });
  
  return this.formatSuggestions(results);
}
```

---

### 3.3 Add New Aggregations

**File to Modify:** `src/services/professional-search.service.ts`
```typescript
// Performer aggregation
aggs.performers = {
  nested: { path: 'performers' },
  aggs: {
    names: {
      terms: { field: 'performers.name.keyword', size: 20 }
    },
    genres: {
      terms: { field: 'performers.genre', size: 20 }
    }
  }
};

// Amenities aggregation
aggs.amenities = {
  terms: { field: 'amenities', size: 20 }
};

// Accessibility aggregation
aggs.accessibility = {
  terms: { field: 'accessibilityFeatures', size: 20 }
};

// Rating distribution
aggs.ratings = {
  histogram: {
    field: 'ratings.averageRating',
    interval: 1,
    min_doc_count: 0
  }
};
```

---

## Part 4: Sync Coordination with MongoDB

### The Challenge

Both MongoDB and Elasticsearch plans modify `sync.service.ts`.

### Solution: Two-Phase Modification

**Phase 1 (MongoDB Plan - Days 16-18):**
- Add MongoDB connection to search-service
- Create content-sync.service.ts
- Add Kafka consumers for content events
- sync.service.ts calls content-sync for data

**Phase 2 (Elasticsearch Plan - Days 2-4):**
- Create enrichment services
- sync.service.ts calls enrichment services before indexing
- Enrichment services pull from PostgreSQL + MongoDB

### Updated sync.service.ts Flow
```typescript
// After MongoDB plan changes
async syncVenue(venueId: string): Promise<void> {
  // 1. Get base data from PostgreSQL
  const venue = await this.pgPool.query('SELECT * FROM venues WHERE id = $1', [venueId]);
  
  // 2. Get content from MongoDB (added by MongoDB plan)
  await this.contentSyncService.syncVenueContent(venueId);
  
  // 3. Enrich for search (added by Elasticsearch plan)
  const enrichedVenue = await this.venueEnrichmentService.enrichVenue(venueId);
  
  // 4. Index to Elasticsearch
  await this.esClient.index({
    index: 'venues',
    id: venueId,
    body: enrichedVenue
  });
}
```

---

## Part 5: New Search API Endpoints

### Enhanced Event Search
```
GET /search/events?
  q=concert                    # text search
  performer=taylor             # search by performer
  genre=pop                    # filter by genre
  minRating=4                  # minimum venue rating
  amenities=parking,wifi       # venue amenities
  accessibility=wheelchair     # accessibility features
  near=36.16,-86.78            # geo search
  radius=25mi                  # geo radius
  minPrice=50                  # price filter
  maxPrice=200
  dateFrom=2024-01-01
  dateTo=2024-12-31
  category=music
  sort=date|price|distance|rating
```

### Enhanced Venue Search
```
GET /search/venues?
  q=arena                      # text search
  amenities=parking,food,vip   # amenity filter
  accessibility=wheelchair     # accessibility filter
  minRating=4                  # minimum rating
  minCapacity=5000             # capacity filter
  maxCapacity=50000
  near=36.16,-86.78
  radius=50mi
  sort=distance|rating|capacity
```

### Autocomplete
```
GET /search/autocomplete?
  q=tay                        # prefix
  types=events,venues,performers
```

### New Aggregations Response
```json
{
  "results": [...],
  "aggregations": {
    "categories": [...],
    "priceRanges": [...],
    "performers": [
      { "name": "Taylor Swift", "count": 5 },
      { "name": "Ed Sheeran", "count": 3 }
    ],
    "genres": [
      { "name": "pop", "count": 8 },
      { "name": "rock", "count": 4 }
    ],
    "amenities": [
      { "name": "parking", "count": 45 },
      { "name": "food", "count": 42 }
    ],
    "accessibility": [
      { "name": "wheelchair", "count": 38 },
      { "name": "hearing_assistance", "count": 25 }
    ],
    "ratings": [
      { "rating": 5, "count": 12 },
      { "rating": 4, "count": 28 }
    ]
  }
}
```

---

## Part 6: Implementation Order

### Phase 1: Fix Mappings (Days 1-2)
1. Update create-indices.ts to load JSON mapping files
2. Update update-indices.ts to load JSON mapping files
3. Create reindex script with alias switching
4. Test index creation in dev environment
5. Run zero-downtime migration

### Phase 2: Event Enrichment (Days 3-6)
1. Create event-enrichment.service.ts
2. Update sync.service.ts to use enrichment
3. Add performer nested queries
4. Test enriched event indexing
5. Reindex all events

### Phase 3: Venue Enrichment (Days 7-10)
1. Create venue-enrichment.service.ts
2. Update sync.service.ts to use enrichment
3. Add amenity/accessibility queries
4. Add rating queries
5. Test enriched venue indexing
6. Reindex all venues

### Phase 4: Tickets & Marketplace (Days 11-13)
1. Create ticket-enrichment.service.ts
2. Create marketplace-enrichment.service.ts
3. Update sync for tickets and marketplace
4. Test and reindex

### Phase 5: Query Upgrades (Days 14-16)
1. Add nested queries to professional-search.service.ts
2. Implement completion suggesters in autocomplete.service.ts
3. Add new aggregations
4. Update search.routes.ts with new parameters
5. Update search.controller.ts to handle new filters

### Phase 6: Testing & Documentation (Days 17-19)
1. Integration testing all search features
2. Performance testing with full data
3. Search relevance tuning
4. Update API documentation

---

## Part 7: Complete File Checklist

### Scripts
- [ ] Modify: `src/scripts/create-indices.ts` - Load JSON mappings
- [ ] Modify: `src/scripts/update-indices.ts` - Load JSON mappings
- [ ] Modify: `src/scripts/sync-data.ts` - Use enrichment services
- [ ] Modify: `src/scripts/fix-geo-location.ts` - Use proper mapping
- [ ] Create: `src/scripts/reindex-with-alias.ts` - Zero-downtime reindex

### Services
- [ ] Create: `src/services/event-enrichment.service.ts`
- [ ] Create: `src/services/venue-enrichment.service.ts`
- [ ] Create: `src/services/ticket-enrichment.service.ts`
- [ ] Create: `src/services/marketplace-enrichment.service.ts`
- [ ] Modify: `src/services/sync.service.ts` - Add enrichment calls
- [ ] Modify: `src/services/consistency.service.ts` - Handle nested objects
- [ ] Modify: `src/services/search.service.ts` - Add new query types
- [ ] Modify: `src/services/professional-search.service.ts` - Add filters
- [ ] Modify: `src/services/autocomplete.service.ts` - Use completion suggesters

### Config
- [ ] Modify: `src/config/dependencies.ts` - Add MongoDB connection

### Types
- [ ] Create: `src/types/enriched-documents.ts` - TypeScript interfaces

### Routes/Controllers
- [ ] Modify: `src/routes/search.routes.ts` - Add new parameters
- [ ] Modify: `src/controllers/search.controller.ts` - Handle new filters

### Mappings (Verify)
- [ ] Verify: `database/elasticsearch/mappings/events_mapping.json`
- [ ] Verify: `database/elasticsearch/mappings/venues_mapping.json`
- [ ] Verify: `database/elasticsearch/mappings/tickets_mapping.json`
- [ ] Verify: `database/elasticsearch/mappings/marketplace_mapping.json`

---

## Summary

| Category | Files to Create | Files to Modify |
|----------|----------------|-----------------|
| Scripts | 1 | 4 |
| Services | 4 | 5 |
| Config | 0 | 1 |
| Types | 1 | 0 |
| Routes/Controllers | 0 | 2 |
| Mappings | 0 | 4 (verify) |
| **TOTAL** | **6** | **16** |

**Total files to touch: 22**
**Estimated time: 13-19 days**

---

## Dependencies

**Requires:**
- MongoDB Implementation Plan (venue_content, event_content, user_content must exist)

**Coordinates with:**
- MongoDB plan modifies sync.service.ts (content sync)
- This plan modifies sync.service.ts (search enrichment)
- MongoDB changes must be done FIRST

**Recommended order:**
1. Redis Implementation Plan (12-15 days)
2. MongoDB Implementation Plan (15-20 days)
3. Elasticsearch Implementation Plan (13-19 days)

---

## Indices Not Implemented (By Design)

### users Index
- **Status:** LOW priority
- **Reason:** Admin feature, not customer-facing
- **Can add later:** When admin user search is needed

### content Index
- **Status:** LOW priority
- **Reason:** CMS content search, recommend external CMS
- **Can add later:** If building internal CMS

### analytics Index
- **Status:** SKIP
- **Reason:** PostgreSQL handles analytics, not search use case

### logs Index
- **Status:** SKIP
- **Reason:** Use external logging (Datadog, Sentry, CloudWatch)
