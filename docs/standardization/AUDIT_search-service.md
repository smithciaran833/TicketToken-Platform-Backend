# Audit Report: search-service Internal Endpoints

**Date:** January 21, 2026
**Auditor:** Claude Code
**Service Port:** 3012 (api-gateway config) / 3020 (actual deployment)
**Purpose:** Determine if search-service needs /internal/ endpoints

---

## Executive Summary

**Recommendation: NONE - No /internal/ endpoints needed**

search-service is correctly designed as a **queue consumer** that receives data synchronization messages from other services via RabbitMQ. It does **NOT** need to expose internal endpoints because:

1. **No services make direct HTTP calls to search-service** (only api-gateway proxies user requests)
2. **Data flows TO search-service** via RabbitMQ message queue, not HTTP
3. **Search queries are user-facing** and go through api-gateway with JWT authentication
4. **Other services publish to search-service**, not query from it

The standardization doc's assessment is **CONFIRMED**: search-service is a "queue consumer only" and doesn't need internal endpoints.

**Note:** There is a port discrepancy in the codebase - api-gateway/config/services.ts shows port 3012, but docker-compose.yml and the service itself use port 3020. This should be reconciled.

---

## 1. HTTP Calls TO search-service

### Search Methodology
- Searched for: `SEARCH_SERVICE_URL`, `search-service`, `searchClient`, `SearchClient`, `:3012`, `:3020`
- Examined: All `*Client.ts` files, service configurations, api-gateway routes

### Findings: NO direct service-to-service HTTP calls

| Service | Makes HTTP calls to search-service? | Notes |
|---------|----------------------------------------|-------|
| api-gateway | **Yes (proxy only)** | Routes `/search/*` to search-service |
| venue-service | No | Has `SEARCH_SERVICE_URL` configured but unused - publishes via RabbitMQ instead |
| event-service | No | Has `SEARCH_SERVICE_URL` configured but unused - publishes via RabbitMQ instead |
| ticket-service | No | Has `SEARCH_SERVICE_URL` configured but unused |
| marketplace-service | No | Publishes to search.sync via RabbitMQ |
| monitoring-service | No | Only health check at `/health` |
| All other services | No | No search service client exists |

**Key Finding:** Many services have `SEARCH_SERVICE_URL` configured in their environment variables but **none actually use it** to make HTTP calls. Instead, services:
1. Publish sync events via RabbitMQ to the `search.sync` exchange
2. Let search-service consume and index the data asynchronously
3. Users query via api-gateway with JWT authentication

### API Gateway Proxy Configuration

```typescript
// backend/services/api-gateway/src/routes/search.routes.ts
const authenticatedRoutes = createAuthenticatedProxy(server, {
  serviceUrl: `${serviceUrls.search}/api/v1`,
  serviceName: 'search',
  publicPaths: ['/*']
});
```

The api-gateway proxies all `/search/*` requests to search-service with user authentication.

---

## 2. Queue Messages FROM/TO search-service

### Search Methodology
- Searched for: `rabbitmq`, `amqplib`, `publish`, `channel`, `queue`
- Examined: `src/config/rabbitmq.ts`, `src/services/sync.service.ts`

### Findings: search-service is a PURE CONSUMER

#### Inbound (Consuming)

**RabbitMQ:**
```typescript
// backend/services/search-service/src/config/rabbitmq.ts
await channel.assertExchange('search.sync', 'topic', { durable: true });
await channel.assertQueue('search.sync.queue', { durable: true });
await channel.bindQueue('search.sync.queue', 'search.sync', '#');
await channel.consume('search.sync.queue', async (msg) => { ... });
```

| Exchange | Queue | Binding | Purpose |
|----------|-------|---------|---------|
| `search.sync` | `search.sync.queue` | `#` (all events) | Consume entity sync events |

**Event Types Consumed:**
| Routing Key | Source Service | Purpose |
|-------------|----------------|---------|
| `venue.created` | venue-service | Index new venue |
| `venue.updated` | venue-service | Update venue in index |
| `venue.deleted` | venue-service | Remove venue from index |
| `event.created` | event-service | Index new event |
| `event.updated` | event-service | Update event in index |
| `event.deleted` | event-service | Remove event from index |
| `event.status.changed` | event-service | Update event status |
| `listing.created` | marketplace-service | Index new listing |
| `listing.updated` | marketplace-service | Update listing in index |
| `listing.deleted` | marketplace-service | Remove listing from index |

#### Outbound (Publishing)

**RabbitMQ: NONE**

search-service does **NOT** publish any messages to RabbitMQ. It is a pure consumer.

**Analysis:** search-service correctly follows the consumer pattern. It receives entity change events from multiple services and indexes them into Elasticsearch. It does NOT publish events or require synchronous HTTP calls from other services.

---

## 3. Current /internal/ Routes

### Search Methodology
- Examined: `src/config/fastify.ts`, `src/routes/`, `src/controllers/`
- Searched for: `/internal/` pattern, `internal` keyword

### Findings: **NONE**

search-service has NO `/internal/` routes. All routes are public API endpoints requiring authentication:

| Route Category | Path | Auth | Purpose |
|---------------|------|------|---------|
| Search | `GET /api/v1/search/` | JWT + Tenant | Main search (events & venues) |
| Search | `GET /api/v1/search/venues` | JWT + Tenant | Search venues only |
| Search | `GET /api/v1/search/events` | JWT + Tenant | Search events only |
| Autocomplete | `GET /api/v1/search/suggest` | JWT + Tenant | Autocomplete suggestions |
| Professional | `POST /api/v1/pro/advanced` | JWT | Advanced search with filters |
| Professional | `GET /api/v1/pro/near-me` | JWT | Geolocation search |
| Professional | `GET /api/v1/pro/trending` | JWT | Trending searches |
| Professional | `GET /api/v1/pro/:index/:id/similar` | JWT | Similar items |
| Health | `GET /health` | None | Basic health check |
| Health | `GET /health/db` | None | Database health check |

### Internal Auth Middleware: **DOES NOT EXIST**

Unlike analytics-service which has unused internal auth middleware, search-service has no internal auth middleware at all, confirming its design as a user-facing service only.

---

## 4. What Other Services NEED from search-service

### Analysis of Service Needs

| Service | Needs search data? | Current Solution | HTTP Needed? |
|---------|-------------------|------------------|--------------|
| venue-service | No | Queries own database | No |
| event-service | No | Queries own database | No |
| ticket-service | No | Queries own database | No |
| marketplace-service | No | Queries own database | No |
| api-gateway | Yes (user queries) | Proxy to search-service | Yes (existing) |
| Frontend apps | Yes (user queries) | Via api-gateway | No (use public API) |

### Why Services Don't Need Internal Endpoints

1. **Data Ownership:** Each service owns its own data and can query it directly. They don't need to query search-service for their own data.

2. **Search is User-Facing:** Search queries are initiated by users (frontend), not by backend services. The api-gateway already handles this.

3. **Async Sync Pattern:** Services publish changes via RabbitMQ; search-service indexes asynchronously. This decoupled architecture eliminates the need for synchronous HTTP calls.

4. **No Cross-Service Search Needs:** No business logic in other services requires programmatic search queries. Services that need to find related entities query their own databases.

---

## 5. Missing Endpoints Analysis

### Potential Internal Endpoints (NOT RECOMMENDED)

| Endpoint | Would serve | Priority | Recommendation |
|----------|-------------|----------|----------------|
| `GET /internal/index/status` | monitoring-service | VERY LOW | Use Elasticsearch APIs directly |
| `POST /internal/reindex/:entity` | admin operations | VERY LOW | Use existing scripts |
| `GET /internal/consistency/:token` | debugging | VERY LOW | Debugging only, not production need |

### Why NOT to Add Internal Endpoints

1. **No Current Need:** Zero services are attempting to call search-service via HTTP for internal operations

2. **Architecture Principle:** search-service is a **consumer**, not a **provider**. Services PUSH data to it; they don't PULL data from it.

3. **Elasticsearch Direct Access:** For monitoring/admin needs, tools can query Elasticsearch directly rather than going through search-service

4. **Existing Scripts:** Reindexing and optimization are handled by CLI scripts (`scripts/reindex-with-alias.ts`, `scripts/sync-data.ts`), not HTTP endpoints

5. **Security Model:** Search results are tenant-scoped and should always go through proper user authentication via api-gateway

---

## 6. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      DATA FLOW (INBOUND via RabbitMQ)                       │
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐         │
│  │ venue-service   │  │ event-service   │  │ marketplace-service │         │
│  │                 │  │                 │  │                     │         │
│  │ publishSearch   │  │ publishSearch   │  │ publishSearchSync() │         │
│  │ Sync()          │  │ Sync()          │  │                     │         │
│  └────────┬────────┘  └────────┬────────┘  └──────────┬──────────┘         │
│           │                    │                      │                     │
│           └────────────────────┼──────────────────────┘                     │
│                                │                                            │
│                                ▼                                            │
│                   ┌─────────────────────────┐                               │
│                   │  RabbitMQ Exchange      │                               │
│                   │  'search.sync' (topic)  │                               │
│                   │                         │                               │
│                   │  Routing Keys:          │                               │
│                   │  - venue.*              │                               │
│                   │  - event.*              │                               │
│                   │  - listing.*            │                               │
│                   └────────────┬────────────┘                               │
│                                │                                            │
│                                ▼                                            │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                      search-service:3020                              │  │
│  │                                                                       │  │
│  │  INBOUND:                                                            │  │
│  │  └── RabbitMQ consumer (search.sync.queue, binding: #)               │  │
│  │                                                                       │  │
│  │  SYNC PROCESSING:                                                    │  │
│  │  ├── SyncService → processes venue/event/listing messages            │  │
│  │  ├── EventEnrichmentService → enriches event data                    │  │
│  │  ├── VenueEnrichmentService → enriches venue data                    │  │
│  │  ├── TicketEnrichmentService → enriches ticket data                  │  │
│  │  └── MarketplaceEnrichmentService → enriches listing data            │  │
│  │                                                                       │  │
│  │  PUBLIC ROUTES (via api-gateway):                                    │  │
│  │  ├── /api/v1/search/*    → Standard search endpoints                 │  │
│  │  └── /api/v1/pro/*       → Professional search endpoints             │  │
│  │                                                                       │  │
│  │  INTERNAL ROUTES: **NONE** (by design)                               │  │
│  │                                                                       │  │
│  │  OUTBOUND: **NONE** (pure consumer)                                  │  │
│  │                                                                       │  │
│  │  DATABASES:                                                          │  │
│  │  ├── Elasticsearch (primary search index)                            │  │
│  │  ├── PostgreSQL (consistency tracking, enrichment queries)           │  │
│  │  ├── MongoDB (content enrichment - read-only)                        │  │
│  │  └── Redis (cache, trending searches)                                │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│                                                                             │
│                       QUERY FLOW (USER REQUESTS)                            │
│                                                                             │
│  ┌─────────────┐     ┌─────────────────┐     ┌─────────────────────┐       │
│  │   Frontend  │ ──► │   api-gateway   │ ──► │   search-service    │       │
│  │   Apps      │     │                 │     │                     │       │
│  └─────────────┘     │   /search/* ────┼────►│   /api/v1/search/*  │       │
│                      │   (JWT auth)    │     │   (tenant-scoped)   │       │
│                      └─────────────────┘     └─────────────────────┘       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

NO SERVICE-TO-SERVICE HTTP CALLS TO search-service
(only api-gateway proxies user requests)
```

---

## 7. Comparison with Other Services

| Service | Role | Has /internal/? | Needs /internal/? |
|---------|------|-----------------|-------------------|
| **search-service** | **Consumer** | **No** | **No** |
| analytics-service | Consumer | No | No |
| auth-service | Provider | Yes | Yes - token validation |
| venue-service | Provider | Yes | Yes - venue data for other services |
| event-service | Provider | Yes | Yes - event data for other services |
| ticket-service | Provider | Yes | Yes - ticket data for other services |
| compliance-service | Provider | Yes | Yes - compliance checks |
| file-service | Provider | Yes | Yes - file access |
| integration-service | Bridge | No | No - external integrations |
| scanning-service | Consumer | Minimal | Minimal - event-driven |

search-service's role as a **pure consumer** confirms it doesn't need internal endpoints. It follows the same pattern as analytics-service.

---

## 8. Port Discrepancy Note

**Issue Found:** There is a port configuration discrepancy:

| Location | Port |
|----------|------|
| `api-gateway/src/config/services.ts` | 3012 |
| `docker-compose.yml` | 3020 |
| `search-service/src/server.ts` | 3020 (default) |
| `search-service/Dockerfile` | 3020 |

**Impact:** The api-gateway may be routing to the wrong port (3012) while search-service listens on 3020. This should be verified and reconciled.

**Recommendation:** Update `api-gateway/src/config/services.ts` to use port 3020, or ensure environment variables properly override the default.

---

## 9. Summary

| Question | Answer |
|----------|--------|
| Services calling search-service | **None** (only api-gateway proxies) |
| Data other services need | **None** - they publish to search, not query |
| Current /internal/ routes | **None** |
| Missing /internal/ routes | **None recommended** |
| Queue events consumed | `venue.*`, `event.*`, `listing.*` via RabbitMQ |
| Queue events published | **None** (pure consumer) |
| Internal auth middleware | **Does not exist** (correctly) |
| Primary role | **Data consumer and search provider** |

### Priority Actions

| Priority | Action | Rationale |
|----------|--------|-----------|
| **NONE** | Keep current architecture | search-service is correctly designed as consumer |
| MEDIUM | Fix port discrepancy | api-gateway shows 3012, service uses 3020 |
| LOW | Consider `/health/deep` | For enhanced monitoring (optional) |

### Final Recommendation

search-service **DOES NOT** need internal endpoints. The current architecture is correct:

1. **Receives data via RabbitMQ** - Services publish entity changes that search-service consumes
2. **Exposes search via public API** - User queries go through api-gateway with JWT authentication
3. **No cross-service queries** - Services don't need to query search for internal operations
4. **Pure consumer pattern** - Does not publish events, only consumes

The standardization assessment is **CONFIRMED**: search-service is a "queue consumer only" service. Adding internal endpoints would violate the separation of concerns and introduce unnecessary coupling.

### Data Flow Summary

```
venue/event/marketplace services
            │
            │ publishSearchSync()
            ▼
    RabbitMQ (search.sync)
            │
            │ consume()
            ▼
    search-service (index to ES)
            │
            │ query via api-gateway
            ▼
    Frontend users (search results)
```

This unidirectional flow is intentional and should be preserved.
