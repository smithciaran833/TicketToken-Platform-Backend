# Analytics Service API Documentation

## Overview

The Analytics Service provides REST APIs for real-time analytics, business metrics, customer insights, RFM scoring, dashboards, and reports.

**Base URL:** `/api/v1`
**Content-Type:** `application/json`

---

## Authentication

All endpoints require authentication via JWT token in the `Authorization` header:

```
Authorization: Bearer <token>
```

### Required Headers

| Header | Description |
|--------|-------------|
| `Authorization` | JWT Bearer token |
| `X-Tenant-ID` | Tenant UUID (required for multi-tenant isolation) |
| `X-Request-ID` | Optional correlation ID for tracing |
| `Idempotency-Key` | Required for POST/PUT/DELETE (duplicate prevention) |

---

## Health Check Endpoints

### GET /health

Comprehensive health check with dependency status.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-01-03T09:00:00.000Z",
  "version": "1.0.0",
  "uptime": 86400,
  "checks": {
    "postgresql": { "status": "healthy", "latency": 5 },
    "redis": { "status": "healthy", "latency": 2 },
    "influxdb": { "status": "healthy", "latency": 10 }
  }
}
```

### GET /live

Kubernetes liveness probe.

**Response:** `200 OK` or `503 Service Unavailable`

### GET /ready

Kubernetes readiness probe.

**Response:** `200 OK` or `503 Service Unavailable`

### GET /metrics

Prometheus metrics endpoint.

**Response:** Prometheus text format

---

## Analytics Events API

### POST /api/v1/analytics/events

Track an analytics event.

**Request:**
```json
{
  "event_type": "ticket_purchase",
  "event_data": {
    "ticket_id": "uuid",
    "amount": 99.99,
    "currency": "USD"
  },
  "timestamp": "2026-01-03T09:00:00.000Z",
  "user_id": "uuid",
  "session_id": "string"
}
```

**Response:**
```json
{
  "success": true,
  "event_id": "uuid"
}
```

### POST /api/v1/analytics/query

Query analytics data.

**Request:**
```json
{
  "metric": "revenue",
  "dimensions": ["event_type", "date"],
  "filters": {
    "date_range": {
      "start": "2026-01-01",
      "end": "2026-01-31"
    }
  },
  "aggregation": "sum",
  "granularity": "day",
  "limit": 100
}
```

**Response:**
```json
{
  "data": [
    {
      "date": "2026-01-01",
      "event_type": "ticket_purchase",
      "revenue": 15000.00
    }
  ],
  "metadata": {
    "total_rows": 31,
    "query_time_ms": 45
  }
}
```

### GET /api/v1/analytics/metrics

Get metrics summary.

**Query Parameters:**
- `period`: `day` | `week` | `month` | `year`
- `metric_type`: `revenue` | `tickets` | `customers` | `events`

**Response:**
```json
{
  "period": "month",
  "metrics": {
    "revenue": {
      "current": 50000.00,
      "previous": 45000.00,
      "change_percent": 11.11
    },
    "tickets_sold": {
      "current": 1500,
      "previous": 1350,
      "change_percent": 11.11
    }
  }
}
```

---

## Dashboard API

### GET /api/v1/dashboards

List all dashboards for the tenant.

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20, max: 100)

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Sales Dashboard",
      "description": "Overview of sales metrics",
      "created_at": "2026-01-01T00:00:00.000Z",
      "updated_at": "2026-01-03T00:00:00.000Z",
      "widget_count": 6
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 5,
    "total_pages": 1
  }
}
```

### POST /api/v1/dashboards

Create a new dashboard.

**Request:**
```json
{
  "name": "My Dashboard",
  "description": "Custom analytics dashboard",
  "layout": {
    "columns": 12,
    "rows": 8
  },
  "widgets": []
}
```

**Response:**
```json
{
  "id": "uuid",
  "name": "My Dashboard",
  "created_at": "2026-01-03T09:00:00.000Z"
}
```

### GET /api/v1/dashboards/:id

Get a specific dashboard with widgets.

**Response:**
```json
{
  "id": "uuid",
  "name": "Sales Dashboard",
  "description": "Overview of sales metrics",
  "layout": {
    "columns": 12,
    "rows": 8
  },
  "widgets": [
    {
      "id": "uuid",
      "type": "chart",
      "title": "Revenue Over Time",
      "config": {
        "chart_type": "line",
        "metric": "revenue",
        "granularity": "day"
      },
      "position": {
        "x": 0,
        "y": 0,
        "width": 6,
        "height": 4
      }
    }
  ]
}
```

### PUT /api/v1/dashboards/:id

Update a dashboard.

### DELETE /api/v1/dashboards/:id

Delete a dashboard.

---

## Reports API

### POST /api/v1/reports

Generate a report.

**Request:**
```json
{
  "report_type": "sales_summary",
  "parameters": {
    "date_range": {
      "start": "2026-01-01",
      "end": "2026-01-31"
    },
    "include_charts": true,
    "format": "pdf"
  }
}
```

**Response:**
```json
{
  "report_id": "uuid",
  "status": "generating",
  "estimated_completion": "2026-01-03T09:05:00.000Z"
}
```

### GET /api/v1/reports/:id

Get report status and download URL.

**Response:**
```json
{
  "report_id": "uuid",
  "status": "completed",
  "download_url": "https://...",
  "expires_at": "2026-01-04T09:00:00.000Z"
}
```

### GET /api/v1/reports/scheduled

List scheduled reports.

### POST /api/v1/reports/scheduled

Create a scheduled report.

**Request:**
```json
{
  "report_type": "weekly_summary",
  "schedule": "0 9 * * 1",
  "recipients": ["email@example.com"],
  "parameters": {
    "format": "pdf"
  }
}
```

---

## Customer Insights API

### GET /api/v1/customers/insights

Get customer insights summary.

**Query Parameters:**
- `segment`: Filter by segment ID
- `period`: Analysis period

**Response:**
```json
{
  "total_customers": 5000,
  "new_customers_30d": 150,
  "churn_rate": 2.5,
  "average_ltv": 450.00,
  "segments": [
    {
      "id": "uuid",
      "name": "High Value",
      "count": 500,
      "percentage": 10.0
    }
  ]
}
```

### GET /api/v1/customers/rfm

Get RFM (Recency, Frequency, Monetary) scores.

**Query Parameters:**
- `customer_id`: Optional specific customer
- `segment`: Filter by segment
- `min_score`: Minimum RFM score
- `limit`: Results limit

**Response:**
```json
{
  "data": [
    {
      "customer_id": "uuid",
      "recency_score": 5,
      "frequency_score": 4,
      "monetary_score": 5,
      "rfm_score": 545,
      "segment": "Champions",
      "last_purchase": "2026-01-02",
      "total_purchases": 25,
      "total_spent": 2500.00
    }
  ],
  "summary": {
    "avg_rfm_score": 334,
    "segment_distribution": {
      "Champions": 10,
      "Loyal Customers": 15,
      "At Risk": 20
    }
  }
}
```

### GET /api/v1/customers/segments

Get customer segments.

**Response:**
```json
{
  "segments": [
    {
      "id": "uuid",
      "name": "Champions",
      "description": "High value, frequent buyers",
      "criteria": {
        "rfm_min": 444,
        "rfm_max": 555
      },
      "customer_count": 500,
      "avg_revenue": 250.00
    }
  ]
}
```

---

## Error Responses

All errors follow RFC 7807 Problem Details format:

```json
{
  "type": "https://api.tickettoken.io/errors/validation",
  "title": "Validation Error",
  "status": 400,
  "detail": "The request body contains invalid data",
  "instance": "/api/v1/analytics/events",
  "errors": [
    {
      "field": "event_type",
      "message": "event_type is required"
    }
  ]
}
```

### Error Types

| Status | Type | Description |
|--------|------|-------------|
| 400 | validation | Invalid request data |
| 401 | unauthorized | Missing or invalid authentication |
| 403 | forbidden | Insufficient permissions |
| 404 | not_found | Resource not found |
| 409 | conflict | Resource conflict (duplicate) |
| 422 | unprocessable | Business rule violation |
| 429 | rate_limit | Too many requests |
| 500 | internal | Internal server error |

---

## Rate Limiting

Rate limits are enforced per tenant:

| Endpoint | Limit |
|----------|-------|
| Analytics events | 1000/minute |
| Queries | 100/minute |
| Reports | 10/minute |
| Dashboards | 100/minute |

Rate limit headers:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Requests remaining
- `X-RateLimit-Reset`: Unix timestamp when limit resets
- `Retry-After`: Seconds until retry (when limited)

---

## Versioning

The API is versioned via URL path: `/api/v1/...`

Deprecation notices will be provided via:
- `Deprecation` header with RFC 7231 date
- `Sunset` header with removal date
- API changelog notifications

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-03 | Initial release |
