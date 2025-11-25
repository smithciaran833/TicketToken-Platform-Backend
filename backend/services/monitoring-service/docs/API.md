# Monitoring Service API Documentation

Version: 1.0.0  
Base URL: `http://localhost:3017`

## Authentication

Most endpoints require JWT authentication via Bearer token:

```http
Authorization: Bearer <jwt-token>
```

Public endpoints (configurable):
- `/health`
- `/status`
- `/metrics` (should be IP-restricted in production)

## Endpoints

### Health & Status

#### GET /health

Returns comprehensive health status for all services and dependencies.

**Authentication:** None (configurable)

**Response:**
```json
{
  "status": "healthy" | "degraded" | "unhealthy",
  "uptime": 123456,
  "timestamp": "2025-11-18T14:00:00Z",
  "services": [
    {
      "service": "auth-service",
      "status": "healthy",
      "latency": 45,
      "details": {}
    }
  ],
  "dependencies": {
    "postgresql": {
      "status": "healthy",
      "latency": 12
    },
    "redis": {
      "status": "healthy",
      "latency": 5
    }
  }
}
```

**Status Codes:**
- `200` - Health check completed
- `503` - Service unhealthy (returned even with unhealthy status)

---

#### GET /status

Simple status check for load balancers.

**Authentication:** None

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-11-18T14:00:00Z"
}
```

**Status Codes:**
- `200` - Service is running

---

### Metrics

#### GET /metrics

Prometheus-formatted metrics export.

**Authentication:** None (should be IP-restricted)

**Headers:**
```http
Accept: text/plain
```

**Response:**
```
# HELP tickets_sold_total Total number of tickets sold
# TYPE tickets_sold_total counter
tickets_sold_total{venue_id="v1",event_id="e1",ticket_type="general"} 1234

# HELP http_request_duration_ms HTTP request duration in milliseconds
# TYPE http_request_duration_ms histogram
http_request_duration_ms_bucket{method="GET",route="/tickets",status="200",le="10"} 45
http_request_duration_ms_bucket{method="GET",route="/tickets",status="200",le="50"} 120
...
```

**Status Codes:**
- `200` - Metrics exported successfully
- `500` - Error generating metrics

---

#### GET /api/business-metrics

Business metrics in JSON format.

**Authentication:** Required (configurable)

**Response:**
```json
{
  "totalTicketsSold": 12345,
  "totalRevenue": 567890,
  "activeListings": 234,
  "totalRefunds": 45,
  "activeUsers": {
    "buyer": 1234,
    "seller": 567,
    "venue_admin": 89
  },
  "paymentMetrics": {
    "successRate": 0.98,
    "totalTransactions": 5000,
    "averageAmount": 75.50
  }
}
```

**Status Codes:**
- `200` - Success
- `401` - Unauthorized
- `500` - Server error

---

### Alerts

#### GET /api/alerts

Get current alert status.

**Authentication:** Required

**Query Parameters:**
- `status` (optional) - Filter by status: `active`, `resolved`, `acknowledged`
- `severity` (optional) - Filter by severity: `info`, `warning`, `error`, `critical`
- `limit` (optional) - Number of results (default: 100)

**Response:**
```json
{
  "active": [
    {
      "id": "alert-123",
      "ruleId": "payment_failure_spike",
      "ruleName": "Payment Failure Spike",
      "severity": "error",
      "message": "Payment failure rate at 25% (threshold: 20%)",
      "value": 0.25,
      "threshold": 0.20,
      "timestamp": "2025-11-18T14:00:00Z",
      "channels": ["email", "slack"],
      "acknowledged": false
    }
  ],
  "recent": [
    {
      "id": "alert-122",
      "ruleId": "database_slow",
      "status": "resolved",
      "resolvedAt": "2025-11-18T13:55:00Z"
    }
  ],
  "summary": {
    "total": 1,
    "critical": 0,
    "error": 1,
    "warning": 0,
    "info": 0
  }
}
```

**Status Codes:**
- `200` - Success
- `401` - Unauthorized
- `500` - Server error

---

#### POST /api/alerts/acknowledge/:alertId

Acknowledge an alert to prevent escalation.

**Authentication:** Required

**Parameters:**
- `alertId` - Alert ID to acknowledge

**Request Body:**
```json
{
  "acknowledgedBy": "user@example.com",
  "notes": "Investigating the issue"
}
```

**Response:**
```json
{
  "success": true,
  "alertId": "alert-123",
  "acknowledgedAt": "2025-11-18T14:05:00Z"
}
```

**Status Codes:**
- `200` - Alert acknowledged
- `401` - Unauthorized
- `404` - Alert not found
- `500` - Server error

---

#### GET /api/alerts/rules

Get all configured alert rules.

**Authentication:** Required

**Response:**
```json
{
  "rules": [
    {
      "id": "high_refund_rate",
      "name": "High Refund Rate",
      "description": "Triggers when refund rate exceeds 10%",
      "condition": "refund_rate > threshold",
      "threshold": 0.10,
      "severity": "warning",
      "enabled": true,
      "channels": ["email", "slack"],
      "cooldown": 3600000
    }
  ]
}
```

**Status Codes:**
- `200` - Success
- `401` - Unauthorized

---

### Dashboard

#### GET /api/v1/monitoring/dashboard/overview

Get dashboard overview data.

**Authentication:** Required

**Query Parameters:**
- `timeRange` (optional) - Time range: `1h`, `6h`, `24h`, `7d`, `30d` (default: `24h`)

**Response:**
```json
{
  "timeRange": "24h",
  "metrics": {
    "requestsPerSecond": 150.5,
    "averageLatency": 125,
    "errorRate": 0.02,
    "uptime": 0.9998
  },
  "services": {
    "healthy": 20,
    "degraded": 1,
    "unhealthy": 0
  },
  "alerts": {
    "active": 1,
    "resolvedToday": 5
  },
  "trends": {
    "requestRate": [
      { "timestamp": "2025-11-18T13:00:00Z", "value": 145 },
      { "timestamp": "2025-11-18T14:00:00Z", "value": 150 }
    ]
  }
}
```

**Status Codes:**
- `200` - Success
- `401` - Unauthorized
- `400` - Invalid time range

---

#### GET /api/v1/monitoring/dashboard/service/:serviceName

Get detailed metrics for a specific service.

**Authentication:** Required

**Parameters:**
- `serviceName` - Name of service (e.g., `auth-service`)

**Query Parameters:**
- `timeRange` (optional) - Time range (default: `1h`)
- `metrics` (optional) - Comma-separated list of metrics to include

**Response:**
```json
{
  "service": "auth-service",
  "status": "healthy",
  "metrics": {
    "requestRate": 45.5,
    "averageLatency": 85,
    "errorRate": 0.01,
    "p95Latency": 120,
    "p99Latency": 250
  },
  "history": [
    {
      "timestamp": "2025-11-18T13:00:00Z",
      "requestRate": 43.2,
      "latency": 90
    }
  ],
  "dependencies": {
    "postgresql": "healthy",
    "redis": "healthy"
  }
}
```

**Status Codes:**
- `200` - Success
- `401` - Unauthorized
- `404` - Service not found

---

### Workers

#### GET /api/v1/monitoring/workers

Get status of background workers.

**Authentication:** Required

**Response:**
```json
{
  "workers": [
    {
      "name": "alert-evaluation",
      "status": "running",
      "lastRun": "2025-11-18T14:00:00Z",
      "nextRun": "2025-11-18T14:01:00Z",
      "interval": 60000,
      "successCount": 1234,
      "errorCount": 5
    },
    {
      "name": "metric-aggregation",
      "status": "running",
      "lastRun": "2025-11-18T14:00:00Z",
      "nextRun": "2025-11-18T14:05:00Z",
      "interval": 300000
    }
  ]
}
```

**Status Codes:**
- `200` - Success
- `401` - Unauthorized

---

### Analytics

#### GET /api/v1/analytics/trends

Get metric trends over time.

**Authentication:** Required

**Query Parameters:**
- `metric` (required) - Metric name
- `timeRange` (optional) - Time range (default: `24h`)
- `interval` (optional) - Data point interval: `1m`, `5m`, `1h` (default: `5m`)
- `labels` (optional) - JSON object of label filters

**Example:**
```http
GET /api/v1/analytics/trends?metric=tickets_sold_total&timeRange=7d&interval=1h&labels={"venue_id":"v1"}
```

**Response:**
```json
{
  "metric": "tickets_sold_total",
  "timeRange": "7d",
  "interval": "1h",
  "dataPoints": [
    {
      "timestamp": "2025-11-11T14:00:00Z",
      "value": 145,
      "labels": { "venue_id": "v1" }
    },
    {
      "timestamp": "2025-11-11T15:00:00Z",
      "value": 150,
      "labels": { "venue_id": "v1" }
    }
  ]
}
```

**Status Codes:**
- `200` - Success
- `400` - Invalid parameters
- `401` - Unauthorized

---

### Cache

#### GET /cache/stats

Get cache statistics.

**Authentication:** None (should be restricted)

**Response:**
```json
{
  "redis": {
    "connected": true,
    "uptime": 123456,
    "memory": {
      "used": 10485760,
      "peak": 15728640
    },
    "stats": {
      "hits": 12345,
      "misses": 678,
      "hitRate": 0.948
    }
  },
  "local": {
    "size": 256,
    "maxSize": 1000,
    "hitRate": 0.85
  }
}
```

**Status Codes:**
- `200` - Success
- `500` - Error retrieving stats

---

#### DELETE /cache/flush

Flush all caches.

**Authentication:** Required (should be admin-only)

**Request Body:**
```json
{
  "caches": ["redis", "local"]
}
```

**Response:**
```json
{
  "success": true,
  "flushed": ["redis", "local"],
  "timestamp": "2025-11-18T14:00:00Z"
}
```

**Status Codes:**
- `200` - Cache flushed
- `401` - Unauthorized
- `500` - Error flushing cache

---

## Error Responses

All endpoints return errors in a consistent format:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "statusCode": 400,
  "timestamp": "2025-11-18T14:00:00Z",
  "path": "/api/alerts"
}
```

### Common Error Codes

- `UNAUTHORIZED` - Missing or invalid authentication token
- `FORBIDDEN` - Insufficient permissions
- `NOT_FOUND` - Resource not found
- `VALIDATION_ERROR` - Invalid request parameters
- `INTERNAL_ERROR` - Server error
- `SERVICE_UNAVAILABLE` - Service temporarily unavailable

---

## Rate Limiting

API endpoints are rate-limited to prevent abuse:

- **Default:** 1000 requests per minute per IP
- **Metrics endpoint:** 100 requests per minute (Prometheus scraping)
- **Alert endpoints:** 100 requests per minute

Rate limit headers:
```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 950
X-RateLimit-Reset: 1637251200
```

When rate limit is exceeded:
```json
{
  "error": "Rate limit exceeded",
  "code": "RATE_LIMIT_EXCEEDED",
  "statusCode": 429,
  "retryAfter": 60
}
```

---

## Webhooks

The monitoring service can send webhooks for alert events.

### Webhook Payload

```json
{
  "event": "alert.triggered" | "alert.resolved" | "alert.acknowledged",
  "timestamp": "2025-11-18T14:00:00Z",
  "alert": {
    "id": "alert-123",
    "ruleId": "payment_failure_spike",
    "severity": "error",
    "message": "Payment failure rate exceeded threshold",
    "value": 0.25,
    "threshold": 0.20
  }
}
```

### Webhook Security

Webhooks include a signature header for verification:

```http
X-Monitoring-Signature: sha256=<signature>
```

Verify using:
```javascript
const crypto = require('crypto');
const signature = crypto
  .createHmac('sha256', webhookSecret)
  .update(JSON.stringify(payload))
  .digest('hex');
```

---

## Grafana Integration

The monitoring service provides endpoints for Grafana dashboards.

### GET /grafana/datasource

Grafana JSON datasource endpoint.

**Authentication:** Grafana API key

**Supports:**
- Time series queries
- Table queries
- Annotations

See Grafana JSON datasource documentation for query format.

---

## Examples

### Curl Examples

**Check service health:**
```bash
curl http://localhost:3017/health
```

**Get Prometheus metrics:**
```bash
curl http://localhost:3017/metrics
```

**Get active alerts:**
```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:3017/api/alerts?status=active
```

**Acknowledge alert:**
```bash
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"acknowledgedBy":"ops@example.com","notes":"Investigating"}' \
  http://localhost:3017/api/alerts/acknowledge/alert-123
```

### JavaScript/TypeScript Examples

```typescript
import axios from 'axios';

const monitoringClient = axios.create({
  baseURL: 'http://localhost:3017',
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

// Get health status
const health = await monitoringClient.get('/health');
console.log('Service status:', health.data.status);

// Get active alerts
const alerts = await monitoringClient.get('/api/alerts', {
  params: { status: 'active', severity: 'critical' }
});
console.log('Critical alerts:', alerts.data.active);

// Acknowledge alert
await monitoringClient.post(`/api/alerts/acknowledge/${alertId}`, {
  acknowledgedBy: 'admin@example.com',
  notes: 'Working on fix'
});
```

---

## WebSocket API (Future)

Real-time event streaming via WebSocket (planned for v1.1):

```javascript
const ws = new WebSocket('ws://localhost:3017/ws');

ws.on('message', (data) => {
  const event = JSON.parse(data);
  
  switch(event.type) {
    case 'alert':
      console.log('New alert:', event.alert);
      break;
    case 'metric':
      console.log('Metric update:', event.metric);
      break;
  }
});
```

---

## Versioning

API version is included in the URL for v1 endpoints:
- `/api/v1/monitoring/...`

Deprecated endpoints will be supported for at least 6 months.

Changes:
- **v1.0.0** (2025-11-18) - Initial release

---

**For support, see [README.md](../README.md)**
