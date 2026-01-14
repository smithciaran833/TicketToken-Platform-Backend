# MARKETPLACE SEARCH FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Marketplace Search |

---

## Executive Summary

**WORKING - Full search implementation**

| Component | Status |
|-----------|--------|
| Search listings endpoint | ✅ Working |
| Filter by event | ✅ Working |
| Filter by venue | ✅ Working |
| Filter by price range | ✅ Working |
| Filter by date range | ✅ Working |
| Pagination | ✅ Working |
| Sorting | ✅ Working |
| Caching | ✅ Working |
| Trending listings | ✅ Working |
| Personalized recommendations | ✅ Working |
| Watchlist | ✅ Route exists |
| Full-text search | ❌ Not implemented |

**Bottom Line:** Marketplace search is fully functional with filtering, pagination, sorting, caching, trending, and personalized recommendations based on purchase history. Only missing full-text search on event/venue names.

---

## API Endpoints

| Endpoint | Method | Purpose | Auth | Status |
|----------|--------|---------|------|--------|
| `/search` | GET | Search listings | Public | ✅ Working |
| `/search/recommended` | GET | Personalized recommendations | Required | ✅ Working |
| `/search/watchlist` | GET | User's watchlist | Required | ✅ Working |

---

## Search Filters

**Endpoint:** `GET /api/v1/search`

| Parameter | Type | Description |
|-----------|------|-------------|
| `eventId` | UUID | Filter by event |
| `venueId` | UUID | Filter by venue |
| `minPrice` | number | Minimum price |
| `maxPrice` | number | Maximum price |
| `date` | ISO date | Filter by event date |
| `limit` | integer | Results per page (1-100, default 20) |
| `offset` | integer | Pagination offset |

---

## Implementation Details

### Search Query Building

**File:** `backend/services/marketplace-service/src/services/search.service.ts`
```typescript
async searchListings(filters, pagination) {
  const query = db('marketplace_listings as ml')
    .leftJoin('events as e', 'ml.event_id', 'e.id')
    .leftJoin('venues as v', 'ml.venue_id', 'v.id')
    .leftJoin('users as u', 'ml.seller_id', 'u.id')
    .where('ml.status', 'active');

  // Apply filters
  if (filters.eventId) query.where('ml.event_id', filters.eventId);
  if (filters.venueId) query.where('ml.venue_id', filters.venueId);
  if (filters.minPrice) query.where('ml.price', '>=', filters.minPrice);
  if (filters.maxPrice) query.where('ml.price', '<=', filters.maxPrice);
  if (filters.dateFrom) query.where('e.start_date', '>=', filters.dateFrom);
  if (filters.dateTo) query.where('e.start_date', '<=', filters.dateTo);

  // Pagination and sorting
  query.limit(pagination.limit).offset(offset);
  query.orderBy(sortBy, sortOrder);

  return { listings, total };
}
```

### Caching
```typescript
const cacheKey = `search:${JSON.stringify({ filters, pagination })}`;
const cached = await cache.get(cacheKey);
if (cached) return JSON.parse(cached);

// ... execute query ...

await cache.set(cacheKey, JSON.stringify(result), { ttl: SEARCH_CACHE_TTL });
```

### Trending Listings
```typescript
async getTrending(limit = 10) {
  return db('marketplace_listings as ml')
    .where('ml.status', 'active')
    .where('e.start_date', '>', new Date())  // Future events only
    .orderBy('ml.view_count', 'desc')        // Most viewed
    .limit(limit);
}
```

### Personalized Recommendations
```typescript
async getRecommendations(userId, limit = 10) {
  // Get user's purchase history
  const userHistory = await db('marketplace_transfers')
    .where('buyer_id', userId)
    .select('event_id')
    .distinct('event_id');

  // Find similar events at same venues
  return db('marketplace_listings as ml')
    .whereIn('ml.venue_id', /* venues from user's history */)
    .whereNotIn('ml.event_id', /* events already purchased */)
    .limit(limit);
}
```

---

## Response Format
```json
{
  "listings": [
    {
      "id": "uuid",
      "ticket_id": "uuid",
      "event_id": "uuid",
      "venue_id": "uuid",
      "seller_id": "uuid",
      "price": 15000,
      "status": "active",
      "listed_at": "2025-01-01T12:00:00Z",
      "event_name": "Summer Concert",
      "event_date": "2025-06-15T19:00:00Z",
      "venue_name": "Madison Square Garden",
      "seller_username": "john_doe"
    }
  ],
  "total": 150
}
```

---

## What's Missing

### Full-Text Search

No search by event name or venue name:
```typescript
// NOT IMPLEMENTED
if (filters.query) {
  query.where(function() {
    this.whereILike('e.name', `%${filters.query}%`)
        .orWhereILike('v.name', `%${filters.query}%`);
  });
}
```

Could integrate with Elasticsearch (already used in event-service).

---

## Recommendations

### P3 - Add Full-Text Search

| Task | Effort |
|------|--------|
| Add query parameter for text search | 0.5 day |
| Integrate with Elasticsearch | 1 day |
| Add category/genre filtering | 0.5 day |
| **Total** | **2 days** |

---

## Files Involved

| File | Purpose |
|------|---------|
| `marketplace-service/src/routes/search.routes.ts` | Routes |
| `marketplace-service/src/controllers/search.controller.ts` | Controller |
| `marketplace-service/src/services/search.service.ts` | Business logic |

---

## Related Documents

- `SEARCH_DISCOVERY_FLOW_AUDIT.md` - Event search (Elasticsearch)
- `LISTING_MANAGEMENT_FLOW_AUDIT.md` - Listing creation
