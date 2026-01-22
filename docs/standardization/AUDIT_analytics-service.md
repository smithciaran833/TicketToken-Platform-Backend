# Audit Report: analytics-service Internal Endpoints

**Date:** January 21, 2026
**Auditor:** Claude Code
**Service Port:** 3007
**Purpose:** Determine if analytics-service needs /internal/ endpoints

---

## Executive Summary

**Recommendation: MINIMAL /internal/ endpoints needed**

analytics-service is correctly designed as a **queue consumer** that aggregates data from all other services via RabbitMQ. It does **NOT** need to expose internal endpoints because:

1. **No services make HTTP calls to analytics-service** (except api-gateway proxy)
2. **Data flows TO analytics-service** via message queues, not HTTP
3. **Dashboard queries go through api-gateway** with user authentication
4. **Other services query their OWN data** or shared databases, not analytics-service

The standardization doc's assessment is **CONFIRMED**: analytics-service is a "queue consumer only" and doesn't need internal endpoints for current use cases.

---

## 1. HTTP Calls TO analytics-service

### Search Methodology
- Searched for: `ANALYTICS_SERVICE_URL`, `analytics-service`, `analyticsClient`, `:3007`
- Examined: All `*Client.ts` files, service configurations

### Findings: NO direct service-to-service HTTP calls

| Service | Makes HTTP calls to analytics-service? | Notes |
|---------|----------------------------------------|-------|
| api-gateway | **Yes (proxy only)** | Routes `/analytics/*` to analytics-service |
| monitoring-service | No | Has health check config but only for `/health` |
| venue-service | No | Has ANALYTICS_SERVICE_URL configured but unused |
| event-service | No | Has ANALYTICS_SERVICE_URL configured but unused |
| ticket-service | No | Has ANALYTICS_SERVICE_URL configured but unused |
| payment-service | No | Has ANALYTICS_SERVICE_URL configured but unused |
| marketplace-service | No | Has ANALYTICS_SERVICE_URL configured but unused |

**Key Finding:** Many services have `ANALYTICS_SERVICE_URL` configured in their environment variables but **none actually use it** to make HTTP calls. Services either:
1. Use the public API via api-gateway (for dashboard/reporting)
2. Send events via RabbitMQ (for data collection)
3. Query their own databases (for their own analytics)

---

## 2. Queue Messages FROM/TO analytics-service

### Search Methodology
- Searched for: `rabbitmq`, `amqplib`, `bull`, `queue.consume`, `subscribe`
- Examined: `src/config/rabbitmq.ts`, `src/services/event-stream.service.ts`

### Findings: analytics-service is primarily a CONSUMER

#### Inbound (Consuming)

**RabbitMQ:**
```typescript
// Consumes ALL events via wildcard binding
channel.bindQueue(queue.queue, config.rabbitmq.exchange, '#');
```

| Exchange | Queue | Binding | Purpose |
|----------|-------|---------|---------|
| `tickettoken_events` | `analytics_events` | `#` (all events) | Consume all platform events |

**Redis Pub/Sub:**
```typescript
subscriber.subscribe('analytics:events');
```

**Bull Queues (Internal Processing):**
| Queue | Purpose |
|-------|---------|
| `ticket-purchase` | Process purchase events |
| `ticket-scan` | Process scan events |
| `page-view` | Process page view events |
| `cart-update` | Process cart events |
| `venue-update` | Process venue events |

#### Outbound (Publishing)

**RabbitMQ (Notifications Only):**
| Routing Key | Purpose |
|-------------|---------|
| `messages.email` | Email notifications |
| `messages.sms` | SMS notifications |
| `messages.push` | Push notifications |
| `messages.slack` | Slack notifications |

**Events NOT Published:**
- `report.generated` - Could notify when reports are ready
- `aggregation.completed` - Could notify when aggregation is done
- `alert.triggered` - Currently handled internally

**Analysis:** analytics-service correctly follows the consumer pattern. It receives events from all services and publishes notification messages back for delivery. It does NOT need synchronous HTTP calls for event collection.

---

## 3. Current /internal/ Routes

### Search Methodology
- Examined: `src/routes/index.ts`, `src/routes/*.routes.ts`
- Searched for: `/internal/` pattern

### Findings: **NONE**

analytics-service has NO `/internal/` routes. All routes are public API endpoints:

| Route Category | Path | Auth | Purpose |
|---------------|------|------|---------|
| Analytics | `/analytics/*` | JWT | Core analytics queries |
| Dashboards | `/dashboards/*` | JWT | Dashboard management |
| Widgets | `/widgets/*` | JWT | Widget configuration |
| Alerts | `/alerts/*` | JWT | Alert management |
| Exports | `/exports/*` | JWT | Data export |
| Insights | `/insights/*` | JWT | Business insights |
| Metrics | `/metrics/*` | JWT | Metrics endpoints |
| Realtime | `/realtime/*` | JWT | Real-time streaming (WebSocket) |
| Customers | `/customers/*` | JWT | Customer analytics |
| Campaigns | `/campaigns/*` | JWT | Campaign analytics |
| Predictions | `/predictions/*` | JWT | Predictive analytics |
| Reports | `/reports/*` | JWT | Report generation |
| Health | `/health` | None | Health checks |
| Cache | `/cache/*` | None | Cache management |

### Internal Auth Middleware EXISTS but UNUSED

```typescript
// backend/services/analytics-service/src/middleware/internal-auth.ts
const ALLOWED_SERVICES = (process.env.ALLOWED_INTERNAL_SERVICES ||
  'api-gateway,event-service,ticket-service,order-service,notification-service').split(',');

export async function requireInternalAuth(request, reply): Promise<void> {
  // Available but not attached to any routes
}
```

---

## 4. What Other Services NEED from analytics-service

### Analysis of Service Needs

| Service | Needs analytics data? | Current Solution | HTTP Needed? |
|---------|----------------------|------------------|--------------|
| venue-service | Venue metrics | Query own DB or public API | No |
| event-service | Event metrics | Query own DB or public API | No |
| marketplace-service | Sales analytics | Query own DB or public API | No |
| monitoring-service | Platform metrics | `/health` endpoint only | No |
| admin dashboards | All metrics | Public API via api-gateway | No |

### Why HTTP Calls Aren't Needed

1. **Dashboard Queries:** Go through api-gateway with user authentication. Admin users query via public API.

2. **Service-Specific Metrics:** Services query their OWN databases for their own analytics (e.g., event-service tracks its own event metrics).

3. **Platform Metrics:** monitoring-service only needs health status, not analytics data.

4. **Data Collection:** Events flow TO analytics-service via RabbitMQ, not FROM it.

---

## 5. Missing Endpoints Analysis

### Potential Internal Endpoints (NOT RECOMMENDED)

| Endpoint | Would serve | Priority | Recommendation |
|----------|-------------|----------|----------------|
| `GET /internal/metrics/venue/:venueId` | venue-service | LOW | Use public API instead |
| `GET /internal/metrics/event/:eventId` | event-service | LOW | Use public API instead |
| `GET /internal/metrics/platform` | monitoring-service | LOW | Use public API or Prometheus |
| `GET /internal/reports/:reportId` | notification-service | LOW | Use public API instead |
| `POST /internal/reports/generate` | scheduled jobs | LOW | Use public API instead |

### Why NOT to Add Internal Endpoints

1. **No Current Need:** No services are trying to call analytics-service via HTTP

2. **Public API is Sufficient:** The public API already exposes all needed analytics endpoints

3. **Security Model:** Analytics data is tenant-scoped and should go through proper authentication

4. **Architecture Principle:** analytics-service is a **consumer**, not a **provider** of real-time service data

5. **Performance:** Adding HTTP calls would add latency when async events are more appropriate

---

## 6. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        EVENT FLOW (INBOUND)                             │
│                                                                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐         │
│  │ venue-service   │  │ event-service   │  │ ticket-service  │         │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘         │
│           │                    │                    │                   │
│           ├────────────────────┼────────────────────┤                   │
│           │     RabbitMQ (tickettoken_events)       │                   │
│           │            binding: #                    │                   │
│           └────────────────────┬────────────────────┘                   │
│                                │                                        │
│                                ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     analytics-service:3007                       │   │
│  │                                                                  │   │
│  │  INBOUND QUEUES:                                                │   │
│  │  ├── RabbitMQ consumer (all events via #)                       │   │
│  │  ├── Redis Pub/Sub (analytics:events)                           │   │
│  │  └── Bull queues (internal processing)                          │   │
│  │                                                                  │   │
│  │  PUBLIC ROUTES (via api-gateway):                               │   │
│  │  ├── /analytics/*      → Analytics queries                      │   │
│  │  ├── /dashboards/*     → Dashboard management                   │   │
│  │  ├── /reports/*        → Report generation                      │   │
│  │  ├── /realtime/*       → WebSocket streaming                    │   │
│  │  └── /metrics/*        → Metrics endpoints                      │   │
│  │                                                                  │   │
│  │  INTERNAL ROUTES: **NONE** (by design)                          │   │
│  │                                                                  │   │
│  │  OUTBOUND:                                                      │   │
│  │  └── RabbitMQ → messages.{email,sms,push,slack}                 │   │
│  │                                                                  │   │
│  │  DATABASES:                                                     │   │
│  │  ├── PostgreSQL (dashboards, widgets, alerts, exports)          │   │
│  │  ├── MongoDB (raw analytics, user behavior, events)             │   │
│  │  ├── Redis (cache, sessions, realtime metrics)                  │   │
│  │  └── InfluxDB (time-series metrics - optional)                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                │                                        │
│                                ▼                                        │
│                        QUERY FLOW (OUTBOUND)                            │
│                                                                         │
│  ┌─────────────────┐                                                   │
│  │   api-gateway   │ ◄──── Dashboard queries via public API            │
│  └─────────────────┘                                                   │
└─────────────────────────────────────────────────────────────────────────┘

NO HTTP CALLS FROM OTHER SERVICES TO analytics-service
(only api-gateway proxies user requests)
```

---

## 7. Comparison with Other Services

| Service | Role | Needs Internal Endpoints? |
|---------|------|--------------------------|
| analytics-service | Consumer | **No** - receives data via queues |
| auth-service | Provider | **Yes** - other services validate tokens |
| venue-service | Provider | **Yes** - other services fetch venue data |
| event-service | Provider | **Yes** - other services fetch event data |
| ticket-service | Provider | **Yes** - other services fetch ticket data |
| compliance-service | Provider | **Yes** - other services need compliance checks |
| file-service | Provider | **Maybe** - file metadata queries |
| integration-service | Provider | **No** - decoupled architecture |
| scanning-service | Consumer | **Minimal** - mostly event-driven |

analytics-service's role as a **consumer** means it correctly doesn't need internal endpoints.

---

## 8. Summary

| Question | Answer |
|----------|--------|
| Services calling analytics-service | **None** (only api-gateway proxies) |
| Data other services need | None - they query own DBs or use public API |
| Current /internal/ routes | **None** |
| Missing /internal/ routes | **None recommended** |
| Queue events | Consumes ALL via `#` binding, publishes notifications |
| Internal auth middleware | Ready but unused (correctly) |
| Primary role | **Data consumer and aggregator** |

### Priority Actions

| Priority | Action | Rationale |
|----------|--------|-----------|
| **NONE** | Keep current architecture | analytics-service is correctly designed as consumer |
| LOW | Consider `/internal/health/deep` | For monitoring-service deep health checks |
| LOW | Consider event publishing | Could publish `report.generated`, `alert.triggered` |

### Final Recommendation

analytics-service **DOES NOT** need internal endpoints. The current architecture is correct:

1. **Receives data via RabbitMQ** - All services publish events that analytics consumes
2. **Exposes data via public API** - Dashboard queries go through api-gateway
3. **No cross-service queries** - Services don't need to query analytics in real-time

The standardization assessment is **CONFIRMED**: analytics-service is a "queue consumer only" service. Adding internal endpoints would violate the separation of concerns and introduce unnecessary coupling.

**Exception:** If monitoring-service needs programmatic access to platform-wide metrics (beyond `/health`), a single internal endpoint could be added:

```typescript
// OPTIONAL: Only if monitoring-service needs it
fastify.get('/internal/platform/health-metrics', {
  preHandler: [requireInternalAuth]
}, async (request, reply) => {
  return {
    activeUsers: await getActiveUserCount(),
    eventsPerMinute: await getEventRate(),
    avgLatency: await getAverageLatency(),
    errorRate: await getErrorRate()
  };
});
```

But this is **not currently needed** based on the codebase analysis.
