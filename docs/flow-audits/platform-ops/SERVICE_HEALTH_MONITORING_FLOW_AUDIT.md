# SERVICE HEALTH MONITORING FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Service Health Monitoring |

---

## Executive Summary

**WORKING - Comprehensive health monitoring system**

| Component | Status |
|-----------|--------|
| API Gateway health endpoints | ✅ Working |
| Kubernetes probes (live/ready/startup) | ✅ Working |
| monitoring-service | ✅ Exists |
| Health routes | ✅ Working |
| Metrics routes | ✅ Working |
| Alert routes | ✅ Working |
| Dashboard routes | ✅ Working |
| Status routes | ✅ Working |
| Circuit breaker status | ✅ Included |
| Dependency health checks | ✅ Working |
| Memory monitoring | ✅ Working |

**Bottom Line:** Comprehensive health monitoring with Kubernetes-ready probes, dependency health checks, circuit breaker monitoring, and a dedicated monitoring-service with metrics, alerts, dashboards, and status endpoints.

---

## API Gateway Health Endpoints

**File:** `backend/services/api-gateway/src/routes/health.routes.ts`

### Endpoints

| Endpoint | Purpose | K8s Use |
|----------|---------|---------|
| `/health` | Basic health + circuit breakers | Legacy |
| `/health/live` | Liveness probe | `livenessProbe` |
| `/health/ready` | Readiness probe | `readinessProbe` |
| `/health/startup` | Startup probe | `startupProbe` |

### Liveness Probe
```typescript
server.get('/health/live', async () => {
  return { status: 'ok' };
});
```

Simple check - is the event loop responsive?

### Readiness Probe
```typescript
server.get('/health/ready', async (request, reply) => {
  const checks = {};
  
  // Memory usage check
  checks.memory = memoryUsage.heapUsed < 1GB ? 'ok' : 'warning';
  
  // Redis connectivity
  checks.redis = await server.redis.ping() ? 'ok' : 'error';
  
  // Circuit breaker status
  checks.circuitBreakers = {};
  for (const [service, breaker] of circuitBreakers) {
    checks.circuitBreakers[service] = breaker.opened ? 'OPEN' : 'CLOSED';
  }
  
  // Auth service health
  checks.authService = await authClient.healthCheck() ? 'ok' : 'error';
  
  // Venue service health
  checks.venueService = await venueClient.healthCheck() ? 'ok' : 'error';
  
  if (!allHealthy) {
    return reply.code(503).send({ status: 'not ready', checks });
  }
  return { status: 'ready', checks };
});
```

### Startup Probe
```typescript
server.get('/health/startup', async (request, reply) => {
  if (!isInitialized) {
    return reply.code(503).send({ status: 'starting' });
  }
  return { status: 'ok', initialized: true };
});
```

---

## Monitoring Service

**Location:** `backend/services/monitoring-service/`

### Routes

| Route | Purpose |
|-------|---------|
| `/health/*` | Health endpoints |
| `/status/*` | Status endpoints |
| `/api/v1/monitoring/metrics/*` | Metrics endpoints |
| `/api/v1/monitoring/alerts/*` | Alert management |
| `/api/v1/monitoring/dashboard/*` | Dashboard data |
| `/cache/stats` | Cache statistics |
| `/cache/flush` | Flush cache |

### Components

| Directory | Purpose |
|-----------|---------|
| `alerting/` | Alert rules and notifications |
| `analytics/` | Analytics processing |
| `checkers/` | Health checkers |
| `collectors/` | Metrics collectors |
| `streaming/` | Real-time streaming |
| `workers/` | Background workers |
| `ml/` | ML-based anomaly detection |
| `grafana-dashboards.json` | Grafana config |

---

## Response Examples

### Basic Health
```json
GET /health
{
  "status": "ok",
  "timestamp": "2025-01-01T12:00:00Z",
  "uptime": 86400,
  "memory": {
    "heapUsed": 52428800,
    "heapTotal": 104857600,
    "rss": 157286400
  },
  "pid": 1234,
  "version": "1.0.0",
  "circuitBreakers": {
    "auth-service": { "state": "CLOSED" },
    "venue-service": { "state": "CLOSED" }
  }
}
```

### Readiness Check
```json
GET /health/ready
{
  "status": "ready",
  "checks": {
    "memory": "ok",
    "redis": "ok",
    "circuitBreakers": {
      "auth-service": "CLOSED",
      "venue-service": "CLOSED"
    },
    "authService": "ok",
    "venueService": "ok"
  }
}
```

### Unhealthy Response
```json
HTTP 503
{
  "status": "not ready",
  "error": "One or more critical dependencies are unavailable",
  "checks": {
    "memory": "ok",
    "redis": "error",
    "authService": "ok",
    "venueService": "error"
  }
}
```

---

## Kubernetes Configuration
```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /health/ready
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 5

startupProbe:
  httpGet:
    path: /health/startup
    port: 3000
  failureThreshold: 30
  periodSeconds: 10
```

---

## Files Involved

| File | Purpose |
|------|---------|
| `api-gateway/src/routes/health.routes.ts` | Gateway health |
| `monitoring-service/src/routes/*.ts` | Monitoring routes |
| `monitoring-service/src/checkers/` | Health checkers |
| `monitoring-service/src/alerting/` | Alerting |

---

## Related Documents

- `LOGGING_OBSERVABILITY_FLOW_AUDIT.md` - Logging
- `RATE_LIMITING_FLOW_AUDIT.md` - Rate limits
- `ERROR_HANDLING_FLOW_AUDIT.md` - Error handling
