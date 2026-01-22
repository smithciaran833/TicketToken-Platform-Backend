# Audit Report: monitoring-service Internal Endpoints

**Date:** January 21, 2026
**Service:** monitoring-service
**Port:** 3014 (configured), 3017 (some docs reference)
**Purpose:** Determine if monitoring-service needs `/internal/` endpoints

---

## Executive Summary

**RECOMMENDATION: monitoring-service does NOT need internal endpoints**

The monitoring-service operates as an **observer** that PULLS data from other services. No services make business logic HTTP calls to monitoring-service. It collects metrics by polling `/health` endpoints of other services, stores them locally, and publishes to Kafka for streaming/dashboards.

---

## 1. HTTP Calls TO monitoring-service

### Search Methodology
Searched the entire codebase (21 services) for:
- `MONITORING_SERVICE_URL` or `MONITOR_URL` environment variables
- `http://monitoring-service` URL patterns
- `monitoringClient` or monitoring HTTP client references
- `localhost:3014` or `:3014` port references

### Findings

| Service | Reference Type | Actual HTTP Calls? |
|---------|---------------|-------------------|
| **ticket-service** | `.env.example` + env-validation | **NO** - Config only, no HTTP client |
| **payment-service** | `.env.example` | **NO** - Config only |
| **marketplace-service** | `.env.example` | **NO** - Config only |
| **file-service** | `.env.example` | **NO** - Config only |
| **event-service** | `.env.example` + env-validation | **NO** - Config only |
| **blockchain-service** | `.env.example` | **NO** - Config only |
| **search-service** | `.env.example` | **NO** - Config only |
| **venue-service** | `.env.example` | **NO** - Config only |
| **api-gateway** | `.env.example` + proxy config | **Proxy only** - Routes requests to monitoring |

### Critical Finding: Local MonitoringService Classes

Several services have their own **local** `MonitoringService` classes that provide internal metrics - these are NOT HTTP calls to the central monitoring-service:

```typescript
// queue-service/src/index.ts
const monitoringService = MonitoringService.getInstance();  // LOCAL class
await monitoringService.start();

// auth-service/src/services/monitoring.service.ts
const health = await monitoringService.performHealthCheck();  // LOCAL class

// integration-service/src/controllers/admin.controller.ts
const summary = await monitoringService.getHealthSummary();  // LOCAL class
```

### Conclusion
**No service makes business logic HTTP calls to monitoring-service.**
- MONITORING_SERVICE_URL is configured but never used for HTTP clients
- Services have their own local monitoring utilities for internal metrics
- Only api-gateway proxies requests through to monitoring (for dashboards)

---

## 2. Queue Messages FROM monitoring-service

### Kafka Topics Published

| Topic | Purpose | Consumers |
|-------|---------|-----------|
| `metrics-stream` | Aggregated metrics for streaming | Internal only |
| `alerts-stream` | Triggered alerts | Internal only |
| `fraud-events` | Fraud detection events | Internal only |

### Key Insight: Self-Contained Kafka Usage
The monitoring-service both **produces** AND **consumes** these Kafka topics for internal stream processing. No other services subscribe to these topics.

### Alert Notifications (External)
Alerts are sent to external systems, NOT other TicketToken services:
- **Email** - via SMTP
- **Slack** - via Slack API
- **PagerDuty** - via PagerDuty API
- **Webhooks** - custom webhook URLs

### RabbitMQ Usage
**None** - monitoring-service does not use RabbitMQ.

### Conclusion
**monitoring-service publishes events for its own consumption and external alerting, not for other services.**

---

## 3. Current Routes

### Public Routes (via api-gateway proxy)

| Route | Method | Purpose | Auth Required |
|-------|--------|---------|---------------|
| `/health/*` | GET | Health checks | No |
| `/status/*` | GET | Service status | No |
| `/api/v1/monitoring/metrics` | GET | Get all metrics | Yes |
| `/api/v1/monitoring/metrics/latest` | GET | Latest metric values | Yes |
| `/api/v1/monitoring/metrics/service/:service` | GET | Metrics by service | Yes |
| `/api/v1/monitoring/metrics` | POST | Push metrics | Admin only |
| `/api/v1/monitoring/metrics/export` | GET | Prometheus scrape | No |
| `/api/v1/monitoring/alerts` | GET | Active alerts | Yes |
| `/api/v1/monitoring/alerts/:id` | GET | Alert by ID | Yes |
| `/api/v1/monitoring/alerts/:id/acknowledge` | POST | Acknowledge alert | Admin/Operator |
| `/api/v1/monitoring/alerts/:id/resolve` | POST | Resolve alert | Admin/Operator |
| `/api/v1/monitoring/alerts/history` | GET | Alert history | Yes |
| `/api/v1/monitoring/alerts/rules` | GET/POST/PUT/DELETE | Alert rules | Admin |
| `/api/v1/monitoring/dashboard/*` | Various | Dashboard data | Yes |
| `/cache/stats` | GET | Cache statistics | No |
| `/cache/flush` | DELETE | Clear cache | No |

### Internal Routes
**None** - No `/internal/` routes exist.

---

## 4. Analysis: Push vs Pull Metrics Pattern

### Current Pattern: PULL

```
┌─────────────────────────────────────────────────────────────┐
│                   MONITORING-SERVICE                         │
│                                                             │
│   ┌────────────────┐      ┌──────────────────┐             │
│   │  Collectors    │      │  Metrics Storage │             │
│   │                │──────│  (PostgreSQL)    │             │
│   │  - HTTP        │      └──────────────────┘             │
│   │  - Database    │                                        │
│   │  - System      │      ┌──────────────────┐             │
│   │  - Blockchain  │──────│  Kafka Streaming │             │
│   │  - Business    │      └──────────────────┘             │
│   └────────────────┘                                        │
│          │                                                  │
│          │ PULLS /health from services                      │
│          ▼                                                  │
└──────────┼──────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────┐
│                     OTHER SERVICES                            │
│                                                              │
│   api-gateway     auth-service    venue-service              │
│   GET /health     GET /health     GET /health                │
│                                                              │
│   event-service   ticket-service  payment-service            │
│   GET /health     GET /health     GET /health                │
└──────────────────────────────────────────────────────────────┘
```

### How Metrics Collection Works

From `http.collector.ts`:
```typescript
// monitoring-service PULLS metrics by calling /health endpoints
private async collect(): Promise<void> {
  for (const service of this.services) {
    const response = await axios.get(`${service.url}/health`, {
      timeout: 5000
    });

    await metricsService.pushMetrics({
      name: 'http_response_time_ms',
      service: service.name,
      value: responseTime,
    });
  }
}
```

### Services Monitored via PULL

| Service | URL | Port |
|---------|-----|------|
| api-gateway | config.services.apiGateway | 3000 |
| auth | config.services.auth | 3001 |
| venue | config.services.venue | 3002 |
| event | config.services.event | 3003 |
| ticket | config.services.ticket | 3004 |
| payment | config.services.payment | 3005 |
| marketplace | config.services.marketplace | 3006 |
| analytics | config.services.analytics | 3007 |

### Prometheus Integration

monitoring-service exposes `/api/v1/monitoring/metrics/export` for Prometheus to scrape. This is the standard Prometheus pull model.

### Push Endpoint (Rarely Used)

There IS a `POST /api/v1/monitoring/metrics` endpoint, but:
- Requires admin authentication
- Not used by any service in the codebase
- Designed for manual metric injection, not service-to-service

---

## 5. Why Internal Endpoints Are NOT Needed

### Observer Role Confirmed

The STANDARDIZATION_DECISIONS.md correctly states:
> `monitoring-service ✅ (observer role)`

### Reasons:

1. **Pull-Based Architecture**: monitoring-service actively collects metrics; services don't push
2. **No Synchronous Queries**: No service needs to query monitoring-service for business logic
3. **External Alerting**: Alerts go to external systems (Slack, PagerDuty, Email)
4. **Self-Contained**: Kafka streaming is internal to monitoring-service
5. **Prometheus Standard**: Uses industry-standard pull model

### What Would Require Internal Endpoints?

Internal endpoints would be needed if:
- Services needed to query "is service X healthy?" synchronously → **Not needed** (services handle their own circuit breakers)
- Services needed to push metrics in real-time → **Not needed** (Prometheus pull is sufficient)
- Services needed alert status for business logic → **Not needed** (alerts are operational, not business data)

---

## 6. Final Recommendation

### Decision: NO Internal Endpoints Needed

| Criterion | Assessment |
|-----------|------------|
| Services calling monitoring-service | **None** (configs only, no actual HTTP clients) |
| Queue messages consumed by others | **None** (Kafka is internal) |
| Current internal routes | **None** |
| Business need for sync queries | **None** |

### The monitoring-service role is correctly:
- **Observer**: Watches other services via health checks
- **Collector**: Aggregates system, application, and business metrics
- **Alerter**: Notifies external systems (ops team) when thresholds are exceeded
- **Dashboard Provider**: Serves metrics to dashboards via api-gateway proxy

### No Action Required

The current architecture is correct:
- Services expose `/health` and `/metrics` endpoints
- monitoring-service polls these endpoints
- Prometheus scrapes monitoring-service
- Alerts go to external notification channels

---

## Appendix: Search Results Summary

### Files Examined
- All 21 services in `backend/services/`
- All `*Client.ts` files
- All `.env.example` files
- All route files in monitoring-service

### Search Patterns Used
```bash
# Pattern 1: Environment variables
MONITORING_SERVICE_URL|MONITOR_URL|monitoring-service|monitoringClient

# Pattern 2: Port references
localhost:3014|:3014

# Pattern 3: HTTP client calls
monitoringService\.|monitoring\.get|monitoring\.post

# Pattern 4: Queue publishing
publish|emit|sendToQueue|channel\.

# Pattern 5: Kafka topics
metrics-stream|alerts-stream|fraud-events
```

### References Found
- 9 services have `MONITORING_SERVICE_URL` in `.env.example` (config only)
- 0 services have actual HTTP client calls to monitoring-service
- 3 Kafka topics published (consumed internally)
- 4 notification channels (all external: email, Slack, PagerDuty, webhook)

---

## Conclusion

**monitoring-service is correctly designed as an observer, not a service provider.**

It should:
- Pull metrics from other services via `/health` endpoints
- Store and aggregate metrics
- Expose data for Prometheus and dashboards
- Send alerts to external notification systems

It should NOT:
- Expose internal endpoints for other services
- Receive pushed metrics from services (uses pull model)
- Be called synchronously for business logic

**Status: CONFIRMED - No internal endpoints needed**
