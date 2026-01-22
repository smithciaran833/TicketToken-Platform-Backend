# Audit Report: queue-service Internal Endpoints

**Date:** January 21, 2026
**Auditor:** Claude Code
**Service Port:** 3011
**Purpose:** Determine if queue-service needs /internal/ endpoints

---

## Executive Summary

**Recommendation: MINIMAL /internal/ endpoints needed**

queue-service is a **queue management and monitoring service**, NOT the queue infrastructure itself. The actual queue infrastructure is **Redis + Bull/BullMQ**, which services connect to directly.

**Critical Architecture Finding:**
- Services do NOT call queue-service to publish jobs
- Services use Bull/BullMQ clients connected directly to Redis
- queue-service provides monitoring, management, and admin operations
- All access is via api-gateway with JWT authentication (admin users)

Internal endpoints are NOT needed for job publishing since services connect to Redis/Bull directly. The only potential internal endpoints would be for:
1. Programmatic queue management (pause/resume from monitoring-service)
2. Internal metrics aggregation

---

## 1. HTTP Calls TO queue-service

### Search Methodology
- Searched for: `QUEUE_SERVICE_URL`, `queue-service`, `queueClient`, `:3011`
- Examined: All `*Client.ts` files, service configurations

### Findings: NO direct service-to-service HTTP calls

| Service | Makes HTTP calls to queue-service? | Notes |
|---------|-----------------------------------|-------|
| api-gateway | **Yes (proxy only)** | Routes `/queue/*` to queue-service |
| monitoring-service | No | Has `QUEUE_SERVICE_URL` configured but unused |
| notification-service | No | Uses Bull/BullMQ directly to Redis |
| payment-service | No | Uses Bull directly to Redis |
| marketplace-service | No | Uses Bull directly to Redis |
| event-service | No | Uses Bull directly to Redis |
| blockchain-service | No | Uses Bull directly to Redis |
| minting-service | No | Uses Bull directly to Redis |
| analytics-service | No | Uses Bull directly to Redis |
| integration-service | No | Uses Bull directly to Redis |
| All other services | No | No queue-service client exists |

**Key Finding:** Services have `QUEUE_SERVICE_URL` in environment variables but **none actually use it**. Instead, services:
1. Connect to Redis directly via Bull/BullMQ clients
2. Create their own queue instances locally
3. Process jobs within their own service

### How Services Actually Use Queues

**Services connect to Redis directly, NOT via queue-service:**

```typescript
// notification-service uses Bull/BullMQ directly
this.queue = new Bull(queueName, { redis: redisConfig });

// payment-service creates its own queues
this.reminderQueue = new Bull('payment-reminders', { redis: redisConfig });
this.mintQueue = new Bull('nft-minting', { redis: redisConfig });

// minting-service
mintQueue = new Bull('ticket-minting', { redis: redisConfig });
retryQueue = new Bull('ticket-minting-retry', { redis: redisConfig });
dlq = new Bull('minting-dlq', { redis: redisConfig });

// integration-service
critical: new Bull('integration-critical', { redis: redisConfig }),
high: new Bull('integration-high', { redis: redisConfig }),
```

**Services with their own Bull queues:**
| Service | Queue Names |
|---------|-------------|
| notification-service | notification queues via BullMQ |
| payment-service | `payment-reminders`, `group-payment-reminders`, `group-payment-expiry`, `nft-minting`, `nft-batch-minting` |
| marketplace-service | `retry-queue`, DLQ |
| event-service | event processing queue |
| blockchain-service | blockchain queues |
| minting-service | `ticket-minting`, `ticket-minting-retry`, `minting-dlq` |
| analytics-service | type-specific queues (ticket-purchase, etc.) |
| integration-service | `integration-critical`, `integration-high`, `integration-normal`, `integration-low` |

---

## 2. Queue Messages FROM queue-service

### Search Methodology
- Searched for: `publish`, `emit`, `queue`, `amqplib`
- Examined: `src/services/*.ts`, `src/queues/*.ts`

### Findings: queue-service manages queues, does NOT publish business events

**queue-service's Role:**
- Manages 3 internal queue categories: `money`, `communication`, `background`
- Uses pg-boss (PostgreSQL-based) internally via QueueFactory
- Provides Bull adapters for compatibility
- Monitors and reports on queue health

**Outbound Events: NONE**

queue-service does NOT publish business events to RabbitMQ or other services. It is a management layer, not a message producer.

**Internal Queue Categories:**
| Category | Purpose | Priority |
|----------|---------|----------|
| `money` | Payments, refunds, NFT minting | HIGH (10 attempts) |
| `communication` | Emails, SMS, notifications | NORMAL (3 attempts) |
| `background` | Analytics, cleanup, batch jobs | NORMAL (3 attempts) |

---

## 3. Current /internal/ Routes

### Search Methodology
- Examined: `src/routes/*.ts`, `src/app.ts`
- Searched for: `/internal/` pattern

### Findings: **NONE**

queue-service has NO `/internal/` routes. All routes are public API endpoints requiring JWT authentication:

| Route Prefix | Auth | Admin Required | Purpose |
|--------------|------|----------------|---------|
| `/api/v1/queue/health` | None | No | Health checks (live, ready, startup) |
| `/api/v1/queue/metrics` | JWT | Yes | Prometheus metrics, queue stats |
| `/api/v1/queue/jobs` | JWT | No | Add/get/retry/cancel jobs |
| `/api/v1/queue/queues` | JWT | No | List queues, get status |
| `/api/v1/queue/queues/:name/pause` | JWT | **Yes** | Pause queue (admin only) |
| `/api/v1/queue/queues/:name/resume` | JWT | **Yes** | Resume queue (admin only) |
| `/api/v1/queue/queues/:name/clear` | JWT | **Yes** | Clear queue (admin only) |
| `/api/v1/queue/alerts` | JWT | - | Alert management |
| `/api/v1/queue/rate-limits` | JWT | - | Rate limit management |
| `/api/v1/queue/cache/*` | JWT | - | Cache management |

### Internal Auth Middleware: **DOES NOT EXIST**

queue-service only has JWT authentication for user requests. There is no HMAC-based service-to-service authentication middleware.

```typescript
// Current auth middleware - JWT only
export async function authenticate(request, reply): Promise<void> {
  const authHeader = request.headers.authorization;
  const token = authHeader.replace('Bearer ', '');
  const decoded = jwt.verify(token, JWT_SECRET);
  request.user = { userId: decoded.userId, tenantId: decoded.tenantId, role: decoded.role };
}
```

---

## 4. What Other Services NEED from queue-service

### Analysis of Service Needs

| Service | Needs queue-service HTTP calls? | Current Solution |
|---------|--------------------------------|------------------|
| notification-service | No | Bull/BullMQ directly to Redis |
| payment-service | No | Bull directly to Redis |
| marketplace-service | No | Bull directly to Redis |
| event-service | No | Bull directly to Redis |
| minting-service | No | Bull directly to Redis |
| monitoring-service | Maybe | Could use `/health/ready` for health aggregation |
| admin-service | Maybe | Could use internal endpoints for queue management |

### Why HTTP Calls Aren't Needed

1. **Queue Infrastructure is Redis:** Services connect to Redis/Bull directly. queue-service is NOT a message broker.

2. **Decentralized Architecture:** Each service manages its own queues. queue-service doesn't know about service-specific queues like `payment-reminders` or `ticket-minting`.

3. **Management vs Operations:** queue-service provides a management layer for its 3 internal categories (`money`, `communication`, `background`), not a centralized job submission API.

4. **Performance:** Direct Redis/Bull connections are faster than HTTP calls through queue-service.

---

## 5. Missing Endpoints Analysis

### Potential /internal/ Endpoints (LOW PRIORITY)

| Endpoint | Would serve | Priority | Recommendation |
|----------|-------------|----------|----------------|
| `POST /internal/queues/:name/pause` | monitoring-service | LOW | For programmatic circuit-breaking |
| `POST /internal/queues/:name/resume` | monitoring-service | LOW | For automatic recovery |
| `GET /internal/metrics/aggregated` | monitoring-service | LOW | Aggregated queue health |
| `GET /internal/dead-letter/count` | monitoring-service | LOW | DLQ monitoring |

### Why NOT to Add Internal Endpoints (Generally)

1. **Services Don't Need Them:** Services connect to Redis directly for job operations.

2. **Admin Operations Via Public API:** Pause/resume/clear are admin operations that should require user authentication (JWT), not service-to-service calls.

3. **Monitoring Via Prometheus:** `/metrics` endpoint already exposes Prometheus metrics for monitoring.

4. **Architecture is Correct:** queue-service is a management layer, not a central queue broker.

### What IS Missing: HMAC Middleware for Internal Auth

**If internal endpoints were added**, queue-service would need HMAC-based service authentication:

```typescript
// NEEDED if adding /internal/ endpoints
export async function verifyInternalService(request, reply): Promise<void> {
  const serviceKey = request.headers['x-service-key'];
  const serviceName = request.headers['x-service-name'];

  if (!serviceKey || !serviceName) {
    return reply.status(401).send({ error: 'Missing service credentials' });
  }

  // Verify HMAC signature
  const expectedKey = process.env.INTERNAL_SERVICE_KEY;
  if (!crypto.timingSafeEqual(Buffer.from(serviceKey), Buffer.from(expectedKey))) {
    return reply.status(401).send({ error: 'Invalid service credentials' });
  }

  request.serviceName = serviceName;
}
```

---

## 6. Port Discrepancy Note

**Issue Found:** Minor port inconsistencies in configuration:

| Location | Port |
|----------|------|
| `queue-service/src/index.ts` | 3011 |
| `queue-service/src/app.ts` (swagger) | 3011 |
| `api-gateway/src/config/services.ts` | 3011 |
| `docker-compose.yml` | 3008 (exposed) → needs verification |
| Various `.env.example` files | 3011 |

**Recommendation:** Verify docker-compose.yml port mapping matches service port.

---

## 7. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      QUEUE ARCHITECTURE (DECENTRALIZED)                      │
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐          │
│  │ notification-svc│  │ payment-service │  │ minting-service     │          │
│  │                 │  │                 │  │                     │          │
│  │ new Bull(...)   │  │ new Bull(...)   │  │ new Bull(...)       │          │
│  └────────┬────────┘  └────────┬────────┘  └──────────┬──────────┘          │
│           │                    │                      │                      │
│           └────────────────────┼──────────────────────┘                      │
│                                │                                             │
│                                ▼                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                          REDIS + Bull                                 │  │
│  │                                                                       │  │
│  │  Queues (created by services directly):                              │  │
│  │  ├── payment-reminders (payment-service)                             │  │
│  │  ├── nft-minting (payment-service)                                   │  │
│  │  ├── ticket-minting (minting-service)                                │  │
│  │  ├── ticket-minting-retry (minting-service)                          │  │
│  │  ├── integration-critical/high/normal/low (integration-service)      │  │
│  │  ├── notification queues (notification-service)                      │  │
│  │  └── ... many more service-specific queues                           │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│                                                                              │
│                       QUEUE MANAGEMENT LAYER                                 │
│                                                                              │
│                      ┌─────────────────────┐                                 │
│                      │    api-gateway      │                                 │
│                      │   (proxy traffic)   │                                 │
│                      └──────────┬──────────┘                                 │
│                                 │                                            │
│                                 ▼                                            │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                      queue-service:3011                               │  │
│  │                                                                       │  │
│  │  PURPOSE: Admin UI/API for queue management                          │  │
│  │                                                                       │  │
│  │  PUBLIC ROUTES (via api-gateway):                                    │  │
│  │  ├── /api/v1/queue/jobs/*      → Job CRUD operations                 │  │
│  │  ├── /api/v1/queue/queues/*    → Queue status, pause, resume, clear  │  │
│  │  ├── /api/v1/queue/metrics/*   → Prometheus, system metrics          │  │
│  │  ├── /api/v1/queue/alerts/*    → Alert management                    │  │
│  │  └── /api/v1/queue/health/*    → Health checks                       │  │
│  │                                                                       │  │
│  │  INTERNAL ROUTES: **NONE**                                           │  │
│  │                                                                       │  │
│  │  MANAGES (internal categories only):                                 │  │
│  │  ├── money queue        (pg-boss via QueueFactory)                   │  │
│  │  ├── communication queue (pg-boss via QueueFactory)                  │  │
│  │  └── background queue   (pg-boss via QueueFactory)                   │  │
│  │                                                                       │  │
│  │  DATABASES:                                                          │  │
│  │  ├── PostgreSQL (pg-boss, job persistence)                           │  │
│  │  └── Redis (Bull queue adapter)                                      │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

KEY INSIGHT: Services bypass queue-service entirely for job operations.
They connect directly to Redis via Bull/BullMQ clients.
queue-service is for monitoring and admin operations only.
```

---

## 8. Comparison with Other Services

| Service | Role | Needs /internal/? | Why |
|---------|------|-------------------|-----|
| **queue-service** | **Admin/Monitoring** | **Minimal** | Services use Redis directly |
| analytics-service | Consumer | No | Queue consumer only |
| search-service | Consumer | No | Queue consumer only |
| auth-service | Provider | Yes | Token validation |
| venue-service | Provider | Yes | Venue data for other services |
| event-service | Provider | Yes | Event data for other services |
| ticket-service | Provider | Yes | Ticket data for other services |

queue-service is unique - it's an **admin layer** over the queue infrastructure, not the infrastructure itself.

---

## 9. Summary

| Question | Answer |
|----------|--------|
| Services calling queue-service | **None** (only api-gateway proxies admin requests) |
| How services use queues | Direct Bull/BullMQ → Redis connections |
| Data other services need | None - they have their own queue access |
| Current /internal/ routes | **None** |
| Missing /internal/ routes | **None critical** (1-2 optional for monitoring) |
| Queue events published | **None** (management layer, not message producer) |
| Internal auth middleware | **Does not exist** (only JWT auth) |
| Primary role | **Queue management and monitoring UI/API** |

### Priority Actions

| Priority | Action | Rationale |
|----------|--------|-----------|
| **NONE** | Keep current architecture | Services don't need HTTP calls to queue-service |
| LOW | Consider `/internal/queues/:name/pause` | For programmatic circuit-breaking by monitoring-service |
| LOW | Add HMAC middleware | Only if internal endpoints are added |
| LOW | Verify docker-compose port | Ensure consistency with service port |

### Final Recommendation

queue-service **DOES NOT** need internal endpoints for current architecture. The key insight is:

1. **queue-service is NOT the queue** - Redis + Bull is the queue infrastructure
2. **Services connect directly to Redis** - They bypass queue-service for job operations
3. **queue-service is for admins** - Provides monitoring and management UI/API
4. **Current public API is sufficient** - All needed operations are exposed via JWT-authenticated endpoints

**Only if** monitoring-service needed to programmatically pause/resume queues during incidents would internal endpoints be warranted. This is a "nice-to-have" for advanced self-healing capabilities, not a requirement.

The standardization doc's note about "HMAC validation" is technically correct if internal endpoints are added, but **no internal endpoints are currently needed** based on the decentralized queue architecture.

---

## 10. Appendix: Services with Local Queue Implementations

Services that create their own Bull queues (bypassing queue-service):

| Service | Queue Library | Queue Names Created |
|---------|---------------|---------------------|
| notification-service | Bull + BullMQ | notification queues, retry queue |
| payment-service | Bull | payment-reminders, group-payment-*, nft-minting, nft-batch-minting |
| marketplace-service | Bull | retry-queue, DLQ |
| event-service | Bull | event processing |
| blockchain-service | Bull | blockchain operations |
| minting-service | Bull | ticket-minting, ticket-minting-retry, minting-dlq |
| analytics-service | Bull | ticket-purchase, ticket-scan, page-view, cart-update, venue-update |
| integration-service | Bull | integration-critical/high/normal/low |

This decentralized architecture is intentional for:
- Service autonomy
- Independent scaling
- Failure isolation
- Simpler deployment
