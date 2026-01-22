# Audit Report: scanning-service Internal Endpoints

**Date:** January 21, 2026
**Auditor:** Claude Code
**Service Port:** 3020
**Purpose:** Determine if scanning-service needs /internal/ endpoints

---

## Executive Summary

**Recommendation: MINIMAL /internal/ endpoints needed**

scanning-service is primarily an **outbound caller** that consumes internal APIs from other services (ticket-service, venue-service, event-service). Other services do NOT currently make direct HTTP calls to scanning-service - they only interact through:
1. API Gateway (for external client requests)
2. Shared database (for scan data)

The service owns critical real-time scan data that could be useful to other services for analytics/reporting, but currently this data is accessed via direct database queries (documented PHASE 5c bypass exception).

---

## 1. HTTP Calls TO scanning-service

### Search Methodology
- Searched for: `SCANNING_SERVICE_URL`, `scanning-service`, `scanningClient`, `:3020`
- Examined: All `*Client.ts` files, `httpClient.ts` files, shared libraries

### Findings: NO direct HTTP callers

| Service | Makes HTTP calls to scanning-service? | Notes |
|---------|--------------------------------------|-------|
| api-gateway | **Yes (proxy only)** | Routes external traffic via `serviceUrls.scanning` |
| venue-service | No | - |
| analytics-service | No | - |
| compliance-service | No | - |
| monitoring-service | No | - |
| ticket-service | No | - |
| event-service | No | - |

**api-gateway Configuration:**
```typescript
// backend/services/api-gateway/src/config/services.ts:25
scanning: getServiceUrl('SCANNING_SERVICE_URL', 'scanning-service', 3020),

// backend/services/api-gateway/src/services/proxy.service.ts:77
'scanning-service': serviceUrls.scanning,
```

The api-gateway proxies external requests to scanning-service's public API routes (`/api/scan`, `/api/qr`, etc.), but no other backend services make direct HTTP calls to scanning-service.

---

## 2. Queue Messages FROM scanning-service

### Search Methodology
- Searched for: `publish`, `emit`, `queue`, `RabbitMQ`, `amqplib`
- Examined: `src/services/QRValidator.ts`, `src/config/` directory

### Findings: NO queue publishing (stub only)

**Current Implementation:**
```typescript
// backend/services/scanning-service/src/services/QRValidator.ts:673
async emitScanEvent(ticket: any, device: any, result: string): Promise<void> {
  // Currently just logs - NO actual queue publishing
  logger.info('Scan event:', {
    ticketId: ticket.id,
    deviceId: device.id,
    result: result,
    timestamp: new Date()
  });
}
```

**Expected Events (if implemented):**
| Event | Would be consumed by | Priority |
|-------|---------------------|----------|
| `ticket.scanned` | analytics-service, venue-service | Low |
| `entry.allowed` | analytics-service | Low |
| `entry.denied` | analytics-service, notification-service, compliance-service | Medium |
| `duplicate.scan.detected` | notification-service, compliance-service | Medium |

**Analysis:** Most scan events are fire-and-forget and don't require synchronous responses. The current design (no queue publishing) means analytics data must be pulled from the database rather than pushed via events. This is acceptable given scanning-service owns the `scans` table.

---

## 3. Current /internal/ Routes

### Search Methodology
- Examined: `src/routes/*.ts`, `src/index.ts`
- Searched for: `/internal/` pattern

### Findings: **NONE**

scanning-service has NO `/internal/` routes. All routes are public API endpoints:

| Route Prefix | Authentication | Purpose |
|--------------|----------------|---------|
| `/health` | None | Health checks |
| `/metrics` | None | Prometheus metrics |
| `/api/scan` | JWT + Role | Main scanning endpoint |
| `/api/qr` | JWT + Role | QR code generation/validation |
| `/api/devices` | None* | Device management |
| `/api/offline` | None* | Offline manifest/reconcile |
| `/api/policies` | None* | Scan policy management |

*Note: Some routes appear to lack authentication - potential security gap.

---

## 4. What Other Services NEED from scanning-service

### Services That Call scanning-service's Internal Endpoints

**None currently** - but these services might benefit from scan data:

| Service | Potential Data Need | Current Solution |
|---------|---------------------|------------------|
| analytics-service | Scan statistics | Direct DB query (shared database) |
| venue-service | Venue scan summary | Direct DB query |
| compliance-service | Audit trail of scans | Direct DB query |
| monitoring-service | Real-time scan metrics | Prometheus `/metrics` endpoint |
| event-service | Event scan stats | Already exposes `/internal/events/:eventId/scan-stats` |

### What scanning-service CALLS (Outbound)

scanning-service is an **outbound caller** - it consumes internal APIs from:

| Service | Endpoints Called | Purpose |
|---------|-----------------|---------|
| ticket-service | `/internal/tickets/:ticketId/full` | Get full ticket details |
| ticket-service | `/internal/tickets/by-event/:eventId` | Get tickets for offline cache |
| ticket-service | `/internal/tickets/:ticketId/record-scan` | Record scan event |
| ticket-service | `/internal/tickets/:ticketId/for-validation` | Optimized validation data |
| venue-service | `/internal/venues/:venueId/validate-ticket/:ticketId` | Validate ticket belongs to venue |
| event-service | `/internal/events/:eventId/scan-stats` | Get event-level context |

**ticket-service Configuration:**
```typescript
// backend/services/ticket-service/src/config/service-auth.ts:239
'scanning-service': {
  // ... allowed to call ticket internal endpoints
},

// Allowed services list includes scanning-service
allowedServices: ['event-service', 'order-service', 'marketplace-service', 'scanning-service', 'transfer-service'],
```

---

## 5. Missing Endpoints Analysis

### Potential /internal/ Endpoints (NOT CURRENTLY NEEDED)

| Endpoint | Would Serve | Priority | Recommendation |
|----------|-------------|----------|----------------|
| `GET /internal/scans/venue/:venueId/stats` | venue-service dashboards | Low | Not needed - direct DB query is faster |
| `GET /internal/scans/event/:eventId/stats` | analytics-service | Low | Not needed - data available via DB |
| `GET /internal/scans/recent` | monitoring-service | Low | Already available via `/metrics` |
| `GET /internal/tickets/:ticketId/scan-history` | compliance-service | Medium | Could be useful for audit trail |
| `GET /internal/devices/venue/:venueId` | venue-service | Low | Not needed |

### Why Most Endpoints Are NOT Needed

1. **Direct Database Access:** scanning-service owns the `scans`, `devices`, and `scan_policies` tables. Other services can query these directly (documented PHASE 5c bypass exception).

2. **Performance Requirements:** Scanning operations require <500ms latency. Adding HTTP layers for data that could be queried directly would degrade performance.

3. **Event-Driven Model:** When queue publishing is implemented, other services will receive scan events asynchronously rather than polling for data.

4. **Prometheus Metrics:** Real-time monitoring data is already exposed via `/metrics`.

---

## 6. Recommendations

### Should scanning-service Expose More /internal/ Endpoints?

**Answer: MINIMAL**

| Priority | Recommendation | Rationale |
|----------|----------------|-----------|
| **High** | Add `/internal/tickets/:ticketId/scan-history` | Useful for compliance audits and customer support |
| **Medium** | Add `/internal/health/deep` | Internal health check with dependency status |
| Low | Keep current architecture | Direct DB access is intentional for performance |
| Low | Implement queue publishing | Long-term improvement for event-driven analytics |

### Recommended New Endpoint

```typescript
/**
 * GET /internal/tickets/:ticketId/scan-history
 * Get scan history for a specific ticket
 * Used by: compliance-service, customer support tools
 */
fastify.get('/internal/tickets/:ticketId/scan-history', {
  preHandler: [verifyInternalService]
}, async (request, reply) => {
  const { ticketId } = request.params;

  const scans = await pool.query(`
    SELECT
      s.id, s.scanned_at, s.result, s.reason,
      d.device_name, d.zone
    FROM scans s
    JOIN devices d ON s.device_id = d.id
    WHERE s.ticket_id = $1
    ORDER BY s.scanned_at DESC
  `, [ticketId]);

  return reply.send({
    ticketId,
    scans: scans.rows,
    count: scans.rows.length
  });
});
```

### Security Gaps to Address

| Issue | Location | Severity | Fix |
|-------|----------|----------|-----|
| Missing auth on `/api/devices` | `src/routes/devices.ts` | High | Add JWT authentication |
| Missing auth on `/api/offline` | `src/routes/offline.ts` | Medium | Add JWT authentication |
| Missing auth on `/api/policies` | `src/routes/policies.ts` | Medium | Add JWT authentication |

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
│                          scanning-service:3020                          │
│                                                                         │
│  PUBLIC ROUTES (via api-gateway):                                      │
│  ├── /api/scan        → Main scanning                                  │
│  ├── /api/qr          → QR generation/validation                       │
│  ├── /api/devices     → Device management                              │
│  ├── /api/offline     → Offline support                                │
│  └── /api/policies    → Scan policies                                  │
│                                                                         │
│  INTERNAL ROUTES: **NONE**                                             │
│                                                                         │
│  OUTBOUND CALLS:                                                       │
│  ├── ticket-service  → /internal/tickets/* (validation, record-scan)  │
│  ├── venue-service   → /internal/venues/* (validate-ticket)           │
│  └── event-service   → /internal/events/* (scan-stats)                │
│                                                                         │
│  DATABASE (owned tables):                                              │
│  ├── scans               (scan records)                                │
│  ├── devices             (scanning devices)                            │
│  ├── scan_policies       (entry policies)                              │
│  └── offline_validation_cache (offline support)                        │
│                                                                         │
│  DATABASE (read access):                                               │
│  ├── tickets  ← Also WRITES scan_count (PHASE 5c bypass)              │
│  ├── events   ← Read event details                                     │
│  └── venues   ← Read venue info                                        │
└─────────────────────────────────────────────────────────────────────────┘

CONSUMERS OF SCAN DATA:
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ analytics-svc   │  │ compliance-svc  │  │ monitoring-svc  │
│ (direct DB)     │  │ (direct DB)     │  │ (/metrics)      │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

---

## 8. Summary

| Question | Answer |
|----------|--------|
| Services calling scanning-service | **None** (only api-gateway proxies) |
| Data other services need | Scan statistics, scan history (available via shared DB) |
| Current /internal/ routes | **None** |
| Missing /internal/ routes | 1 recommended: `/internal/tickets/:ticketId/scan-history` |
| Primary interaction model | scanning-service is an **outbound caller** |
| Queue events | Not implemented (stub only) |
| Security gaps | 3 routes missing authentication |

### Final Recommendation

**MINIMAL action required.** scanning-service's architecture is intentionally self-contained for performance reasons. The only recommended addition is a scan history endpoint for compliance/audit purposes. Other potential endpoints would add HTTP overhead without clear benefit since data is available via direct database queries.

Long-term improvements should focus on:
1. Implementing queue publishing for event-driven analytics
2. Adding authentication to unprotected routes
3. Creating the scan history endpoint for compliance
