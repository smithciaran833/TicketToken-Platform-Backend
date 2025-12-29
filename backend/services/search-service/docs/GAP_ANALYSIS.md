# Search Service - Frontend/Backend Gap Analysis

Generated: 2024-12-27
Status: REVIEWED (No audit files - reviewed codebase directly)

---

## Summary

| Type | Count | Severity |
|------|-------|----------|
| Multi-Tenancy | 1 | HIGH |
| Frontend Features | 2 | MEDIUM |

**Good News:** This service is relatively well-built with proper authentication and input sanitization.

---

## What Works Well ✅

### Authentication
- All search routes use `authenticate` middleware
- All routes require tenant context via `requireTenant`
- Input sanitization via `SearchSanitizer`

### Security
- Query sanitization prevents injection
- Number bounds validation
- Proper user context passed to services

### Routes
- Main search with type filtering
- Venue-specific search
- Event-specific search with date filtering
- Autocomplete suggestions

---

## HIGH Issues

### GAP-SEARCH-001: Tenant Context Errors Swallowed
- **Severity:** HIGH
- **Location:** fastify.ts line 36
- **Current:**
```typescript
} catch (error) {
  fastify.log.error({ error }, 'Failed to set tenant context');
  // Allow request to proceed - RLS will block unauthorized access
}
```
- **Risk:** If RLS fails, cross-tenant access possible
- **Fix:** Return 500 on tenant context failure

---

## Frontend-Related Gaps

### GAP-SEARCH-002: No Nearby/Location Search
- **Severity:** MEDIUM
- **User Story:** "Find events near me"
- **Current:** No geolocation-based search
- **Needed:**
  - GET /api/v1/search/nearby?lat=X&lng=Y&radius=10mi
  - Returns events/venues sorted by distance
- **Impact:** Can't build "Near Me" feature

### GAP-SEARCH-003: No Trending/Popular Search
- **Severity:** MEDIUM
- **User Story:** "Show me what's popular right now"
- **Current:** No trending endpoint
- **Needed:**
  - GET /api/v1/search/trending - popular searches
  - GET /api/v1/search/popular - popular events/venues
- **Impact:** Can't build trending section

### GAP-SEARCH-004: Search History Not Saved
- **Severity:** LOW
- **User Story:** "Show my recent searches"
- **Current:** No search history
- **Needed:**
  - Save user searches
  - GET /api/v1/search/history - recent searches
- **Impact:** No personalized search experience

---

## All Routes Inventory

### search.controller.ts (4 routes) - AUTH ✅ TENANT ✅
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | /api/v1/search | ✅ | Main search |
| GET | /api/v1/search/venues | ✅ | Search venues |
| GET | /api/v1/search/events | ✅ | Search events |
| GET | /api/v1/search/suggest | ✅ | Autocomplete |

### professional-search.controller.ts
- Additional professional search routes (need to verify)

### Health
| Method | Path | Purpose |
|--------|------|---------|
| GET | /health | Health check |

---

## Cross-Service Dependencies

| This service needs from | What |
|------------------------|------|
| event-service | Event data for indexing |
| venue-service | Venue data for indexing |
| MongoDB | Read-only content sync |
| PostgreSQL | Structured data |

---

## Priority Order for Fixes

### This Week
1. GAP-SEARCH-001: Don't swallow tenant context errors

### This Month (Frontend Features)
2. GAP-SEARCH-002: Nearby/location search
3. GAP-SEARCH-003: Trending/popular endpoint
4. GAP-SEARCH-004: Search history

