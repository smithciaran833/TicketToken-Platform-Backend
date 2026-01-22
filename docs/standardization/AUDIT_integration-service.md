# Audit Report: integration-service Internal Endpoints

**Date:** January 21, 2026
**Auditor:** Claude Code
**Service Port:** 3009
**Purpose:** Determine if integration-service needs /internal/ endpoints

---

## Executive Summary

**Recommendation: MINIMAL /internal/ endpoints needed**

integration-service is a **third-party integration hub** that connects to external providers (Stripe, Square, Mailchimp, QuickBooks). It has a sophisticated internal auth middleware but currently exposes **NO** dedicated `/internal/` routes.

**Key Architecture Pattern:**
- **venue-service** manages integration configurations locally (stores encrypted credentials, status)
- **integration-service** handles actual sync operations with external providers
- These are **decoupled** - venue-service doesn't call integration-service directly

Other services don't currently make HTTP calls to integration-service. All access is via API Gateway for external clients.

---

## 1. HTTP Calls TO integration-service

### Search Methodology
- Searched for: `INTEGRATION_SERVICE_URL`, `integration-service`, `integrationClient`, `:3009`
- Examined: All `*Client.ts` files, service configurations

### Findings: NO direct service-to-service HTTP calls

| Service | Makes HTTP calls to integration-service? | Notes |
|---------|------------------------------------------|-------|
| api-gateway | **Yes (proxy only)** | Routes `/api/v1/integrations/*` to integration-service |
| venue-service | **No** | Has LOCAL IntegrationService class (not HTTP client) |
| event-service | No | Has `INTEGRATION_SERVICE_URL` configured but unused |
| ticket-service | No | Has `INTEGRATION_SERVICE_URL` configured but unused |
| payment-service | No | Has `INTEGRATION_SERVICE_URL` configured but unused |
| analytics-service | No | - |
| compliance-service | No | - |
| monitoring-service | No | Has `INTEGRATION_SERVICE_URL` configured but unused |

### api-gateway Configuration

```typescript
// backend/services/api-gateway/src/config/services.ts
integration: getServiceUrl('INTEGRATION_SERVICE_URL', 'integration-service', 3009),

// backend/services/api-gateway/src/services/proxy.service.ts
'integration-service': serviceUrls.integration,
```

### venue-service's Local IntegrationService

**Important Discovery:** venue-service has its OWN `IntegrationService` class that manages integration records locally:

```typescript
// backend/services/venue-service/src/services/integration.service.ts
export class IntegrationService {
  // Manages integration records in venue-service's database
  // Does NOT call integration-service via HTTP

  async createIntegration(venueId: string, tenantId: string, data: any): Promise<IIntegration> {
    // Encrypts credentials and stores in local database
    const encryptedCreds = encryptCredentials(data.credentials);
    return this.integrationModel.create({
      venue_id: venueId,
      tenant_id: tenantId,
      type: data.type,
      encrypted_credentials: encryptedCreds
    });
  }
}
```

This is a **decoupled architecture** where:
1. venue-service stores integration configurations (what integrations exist)
2. integration-service performs actual sync operations (how to sync with providers)

---

## 2. Queue Messages FROM integration-service

### Search Methodology
- Searched for: `publish`, `emit`, `queue`, `Bull`, `amqplib`
- Examined: `src/config/queue.ts`, `src/services/*.ts`

### Findings: Bull (Redis) - INTERNAL only

**Library:** Bull (Redis-backed job queue)

**Queue Architecture:**
| Queue | Priority | Purpose |
|-------|----------|---------|
| `integration-critical` | 1 | Webhook processing, urgent syncs |
| `integration-high` | 2 | User-initiated syncs |
| `integration-normal` | 3 | Scheduled background syncs |
| `integration-low` | 4 | Batch operations, cleanup |

**Job Types:**
| Job Type | Queue | Description |
|----------|-------|-------------|
| `webhook` | Critical | Process incoming provider webhooks |
| `sync` | High | User-initiated data sync |
| `scheduled-sync` | Normal | Background scheduled sync |
| `batch` | Low | Batch import/export operations |

**Key Finding:** These queues are **internal to integration-service**. They do NOT publish events to other services. All job processing happens within the service.

**Events NOT Published:**
| Potential Event | Would be consumed by | Current Implementation |
|-----------------|---------------------|----------------------|
| `integration.sync.started` | monitoring-service | Not published |
| `integration.sync.completed` | analytics-service, monitoring-service | Not published |
| `integration.sync.failed` | notification-service, monitoring-service | Not published |
| `external.event.imported` | event-service | Not published |

**Analysis:** These events could be useful for cross-service observability but are not required for core functionality since integration-service operates independently.

---

## 3. Current /internal/ Routes

### Search Methodology
- Examined: `src/routes/*.ts`, `src/server.ts`
- Searched for: `/internal/` pattern

### Findings: **NONE**

integration-service has NO `/internal/` routes. All routes are public API endpoints:

| Route Category | Path Pattern | Auth | Middleware |
|----------------|--------------|------|------------|
| Health | `/health` | None | - |
| Connections | `/api/v1/integrations/*` | JWT | authenticate |
| OAuth | `/api/v1/integrations/oauth/*` | JWT | authenticate |
| Sync | `/api/v1/integrations/sync/*` | JWT | authenticate, authorize |
| Mappings | `/api/v1/integrations/mappings/*` | JWT | authenticate |
| Webhooks | `/api/v1/integrations/webhooks/*` | Provider signature | Provider-specific |
| Health (detailed) | `/api/v1/integrations/health/*` | JWT | authenticate |
| Admin | `/api/v1/integrations/admin/*` | JWT + Admin | authenticate, authorize('admin') |
| Monitoring | `/api/v1/integrations/health/monitoring/*` | JWT | authenticate |

### Internal Auth Middleware EXISTS but is UNUSED for routes

integration-service has sophisticated internal auth middleware ready:

```typescript
// backend/services/integration-service/src/middleware/internal-auth.ts
const ALLOWED_SERVICES = new Set([
  'auth-service',
  'event-service',
  'ticket-service',
  'payment-service',
  'notification-service'
]);

const SERVICE_PERMISSIONS = {
  'auth-service': ['integrations:read', 'integrations:write', 'webhooks:*'],
  'event-service': ['integrations:read', 'sync:events', 'webhooks:receive'],
  'ticket-service': ['integrations:read', 'sync:tickets', 'webhooks:receive'],
  'payment-service': ['integrations:read', 'integrations:write', 'sync:payments', 'webhooks:*'],
  'notification-service': ['integrations:read', 'sync:contacts'],
};
```

This middleware supports:
- Service allowlist validation
- HMAC signature verification
- Replay attack prevention (5-minute window)
- Granular permission system

**But:** It's not attached to any routes. Other services would use the public API with internal auth headers.

---

## 4. Monitoring Endpoints (Already Exist)

integration-service has comprehensive monitoring endpoints under `/api/v1/integrations/health/`:

| Endpoint | Purpose |
|----------|---------|
| `GET /monitoring/metrics` | Comprehensive service metrics |
| `GET /monitoring/performance` | Detailed performance metrics |
| `GET /monitoring/dlq` | Dead letter queue status |
| `GET /monitoring/circuit-breakers` | Circuit breaker status |
| `GET /monitoring/health/deep` | Deep health check with dependencies |
| `GET /monitoring/health/live` | Kubernetes liveness probe |
| `GET /monitoring/health/ready` | Kubernetes readiness probe |
| `GET /monitoring/idempotency` | Idempotency service stats |
| `POST /monitoring/circuit-breakers/:name/reset` | Manual circuit breaker reset |

These are public API endpoints requiring JWT authentication.

---

## 5. Missing Endpoints Analysis

### What Other Services MIGHT Need

| Service | Potential Data Need | Current Solution | Priority |
|---------|---------------------|------------------|----------|
| monitoring-service | Integration sync status | `/monitoring/health/deep` (public API) | LOW |
| compliance-service | Sync audit logs | None | MEDIUM |
| analytics-service | Sync statistics | None | LOW |
| event-service | Trigger event import | `/api/v1/integrations/sync/:provider/sync` (public API) | LOW |

### Recommended /internal/ Endpoints

#### MEDIUM PRIORITY

**1. GET /internal/sync-logs/venue/:venueId**
- **Purpose:** Get sync history for compliance audits
- **Used by:** compliance-service
- **Why internal:** Bulk audit data access

```typescript
fastify.get('/internal/sync-logs/venue/:venueId', {
  preHandler: [internalAuthMiddleware, requirePermission('integrations:read')]
}, async (request, reply) => {
  const { venueId } = request.params;
  const { limit = 100, since } = request.query;

  const logs = await db('sync_logs')
    .where({ venue_id: venueId })
    .modify(qb => { if (since) qb.where('created_at', '>', since); })
    .orderBy('created_at', 'desc')
    .limit(limit);

  return reply.send({
    venueId,
    logs,
    count: logs.length
  });
});
```

#### LOW PRIORITY

**2. GET /internal/integrations/venue/:venueId/status**
- **Purpose:** Get integration status for all providers for a venue
- **Used by:** monitoring-service, compliance-service
- **Note:** Could also use public `/api/v1/integrations` with internal auth

**3. POST /internal/sync/trigger**
- **Purpose:** Trigger sync programmatically from another service
- **Used by:** event-service (import events from external systems)
- **Note:** Could also use public `/api/v1/integrations/sync/:provider/sync` with internal auth

---

## 6. Architecture Analysis

### Why Minimal /internal/ Endpoints Are Needed

1. **Decoupled Design:** venue-service manages integration configs locally, integration-service handles sync. They don't need to call each other.

2. **External Provider Focus:** integration-service primarily communicates with third-party APIs (Stripe, Square, etc.), not other internal services.

3. **Internal Auth Ready:** The middleware exists to support internal service calls via public API routes.

4. **Comprehensive Monitoring:** Existing public API provides all metrics/health data.

5. **Queue-Based Processing:** Long-running sync operations use Bull queues internally, not HTTP calls.

---

## 7. Architecture Diagram

```
                                    ┌─────────────────────┐
                                    │    api-gateway      │
                                    │   (proxy traffic)   │
                                    └──────────┬──────────┘
                                               │
                                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        integration-service:3009                         │
│                                                                         │
│  PUBLIC ROUTES (via api-gateway):                                      │
│  ├── /api/v1/integrations/*       → Connection management              │
│  ├── /api/v1/integrations/oauth/* → OAuth flows                        │
│  ├── /api/v1/integrations/sync/*  → Sync operations                    │
│  ├── /api/v1/integrations/webhooks/* → Provider webhooks               │
│  ├── /api/v1/integrations/admin/* → Admin operations                   │
│  └── /api/v1/integrations/health/* → Monitoring endpoints              │
│                                                                         │
│  INTERNAL ROUTES: **NONE**                                             │
│  (Internal auth middleware exists but no dedicated routes)             │
│                                                                         │
│  OUTBOUND CALLS:                                                       │
│  ├── Stripe API     (via stripe SDK)                                   │
│  ├── Square API     (via square SDK)                                   │
│  ├── Mailchimp API  (via @mailchimp/mailchimp_marketing SDK)           │
│  └── QuickBooks API (via intuit-oauth + REST)                          │
│                                                                         │
│  INTERNAL QUEUES (Bull/Redis):                                         │
│  ├── integration-critical  (webhooks)                                  │
│  ├── integration-high      (user-initiated sync)                       │
│  ├── integration-normal    (scheduled sync)                            │
│  └── integration-low       (batch operations)                          │
│                                                                         │
│  DATABASE (owned tables):                                              │
│  ├── integrations          (integration configs)                       │
│  ├── sync_logs             (sync history)                              │
│  ├── field_mappings        (data field mappings)                       │
│  └── webhooks              (webhook registrations)                     │
└─────────────────────────────────────────────────────────────────────────┘

DECOUPLED FROM:
┌─────────────────────────────────────────────────────────────────────────┐
│                          venue-service:3002                             │
│                                                                         │
│  LOCAL IntegrationService class (NOT HTTP client):                     │
│  ├── Stores integration configs in venue-service's database            │
│  ├── Encrypts/decrypts credentials locally                             │
│  └── Does NOT call integration-service via HTTP                        │
│                                                                         │
│  Tables: venue_integrations                                            │
└─────────────────────────────────────────────────────────────────────────┘

EXTERNAL PROVIDERS:
┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   Stripe    │  │   Square    │  │  Mailchimp  │  │  QuickBooks │
│   (POS,     │  │   (POS,     │  │   (Email    │  │ (Accounting)│
│  Payments)  │  │  Payments)  │  │  Marketing) │  │             │
└─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘
```

---

## 8. Summary

| Question | Answer |
|----------|--------|
| Services calling integration-service | **None** (only api-gateway proxies) |
| Data other services need | Sync logs (compliance), status (monitoring) |
| Current /internal/ routes | **None** |
| Missing /internal/ routes | 1 recommended: `/internal/sync-logs/venue/:venueId` |
| Queue events | Internal only (Bull/Redis) - no cross-service events |
| Internal auth middleware | Ready but unused (no dedicated routes) |
| Primary interaction model | External provider sync via SDKs |

### Priority Actions

| Priority | Action | Impact |
|----------|--------|--------|
| LOW | Consider `/internal/sync-logs/venue/:venueId` | Compliance audits |
| LOW | Consider cross-service events for sync status | Better observability |
| NONE | No changes needed for core functionality | Architecture is sound |

### Final Recommendation

integration-service requires **MINIMAL** changes. The decoupled architecture is intentional and sound:

1. **Current state is functional** - venue-service manages integration configs, integration-service handles sync
2. **Internal auth middleware is ready** - can be used with public API routes if needed
3. **Comprehensive monitoring exists** - all metrics available via public API
4. **One optional endpoint** - sync logs for compliance could be added if needed

The only potential improvement is publishing cross-service events for sync status to enable better observability in monitoring-service and analytics-service, but this is a "nice-to-have" rather than a requirement.
