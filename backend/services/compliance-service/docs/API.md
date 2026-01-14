# Compliance Service API Documentation

**AUDIT FIX: DOC-H1, DOC-H2**

## Overview

The Compliance Service provides APIs for regulatory compliance including GDPR data management, OFAC/SDN screening, tax document generation, and risk assessment.

**Base URL:** `https://api.tickettoken.com/compliance/v1`

**API Version:** `v1`

---

## Authentication

All API endpoints require authentication via Bearer token (JWT).

```http
Authorization: Bearer <token>
```

### Required Scopes

| Endpoint Category | Required Role |
|-------------------|---------------|
| GDPR (own data) | `user` |
| GDPR (all data) | `compliance_officer`, `admin` |
| Risk Assessment | `compliance_officer`, `admin` |
| Tax Documents | `user` (own), `admin` (all) |
| Webhooks | Service-to-service (HMAC) |

---

## API Versioning (DOC-H2)

### Version Header

```http
Accept-Version: v1
```

### URL Versioning

```
/v1/gdpr/export
/v2/gdpr/export  (future)
```

### Deprecation Policy

- Deprecated versions are announced 6 months in advance
- Sunset date included in response headers
- Migration guides provided for breaking changes

```http
Deprecation: true
Sunset: Sat, 01 Jul 2027 00:00:00 GMT
Link: <https://docs.tickettoken.com/compliance/v2/migration>; rel="successor-version"
```

---

## Endpoints

### Health Checks

#### GET /health/live

Kubernetes liveness probe.

**Response:** `200 OK`
```json
{
  "status": "ok",
  "timestamp": "2026-01-03T22:00:00.000Z"
}
```

#### GET /health/ready

Kubernetes readiness probe.

**Response:** `200 OK`
```json
{
  "status": "ready",
  "checks": {
    "database": "healthy",
    "redis": "healthy"
  },
  "timestamp": "2026-01-03T22:00:00.000Z"
}
```

---

### GDPR Data Management

#### POST /v1/gdpr/export

Request export of user's personal data.

**Authorization:** `user` (own data), `compliance_officer` (any user)

**Request:**
```json
{
  "userId": "user-123",
  "format": "json",
  "includeRelated": true
}
```

**Response:** `202 Accepted`
```json
{
  "success": true,
  "data": {
    "requestId": "gdpr-exp-456",
    "status": "pending",
    "estimatedCompletion": "2026-01-03T23:00:00.000Z"
  }
}
```

**Errors:**
| Status | Type | Description |
|--------|------|-------------|
| 400 | `validation_error` | Invalid request body |
| 401 | `unauthorized` | Missing or invalid token |
| 403 | `forbidden` | Cannot access other user's data |

---

#### GET /v1/gdpr/export/:requestId

Get status of export request.

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "requestId": "gdpr-exp-456",
    "status": "completed",
    "downloadUrl": "https://...",
    "expiresAt": "2026-01-04T22:00:00.000Z"
  }
}
```

---

#### POST /v1/gdpr/delete

Request deletion of user's personal data.

**Authorization:** `user` (own data), `compliance_officer` (any user)

**Request:**
```json
{
  "userId": "user-123",
  "reason": "User requested account deletion",
  "retainTransactionHistory": true
}
```

**Response:** `202 Accepted`
```json
{
  "success": true,
  "data": {
    "requestId": "gdpr-del-789",
    "status": "pending",
    "retentionPolicy": "30-days"
  }
}
```

---

### Risk Assessment

#### POST /v1/risk/assess

Calculate risk score for an entity.

**Authorization:** `compliance_officer`, `admin`

**Request:**
```json
{
  "venueId": "venue-123",
  "includeHistorical": true,
  "factors": ["transaction_volume", "chargeback_rate"]
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "venueId": "venue-123",
    "riskScore": 35,
    "riskLevel": "low",
    "factors": {
      "transaction_volume": { "score": 20, "weight": 0.3 },
      "chargeback_rate": { "score": 50, "weight": 0.4 }
    },
    "assessedAt": "2026-01-03T22:00:00.000Z"
  }
}
```

---

#### POST /v1/risk/flag

Flag a venue for risk review.

**Authorization:** `compliance_officer`, `admin`

**Request:**
```json
{
  "venueId": "venue-123",
  "reason": "Unusual transaction patterns detected",
  "severity": "high",
  "category": "fraud"
}
```

**Response:** `201 Created`
```json
{
  "success": true,
  "data": {
    "flagId": 456,
    "venueId": "venue-123",
    "status": "open",
    "createdAt": "2026-01-03T22:00:00.000Z"
  }
}
```

---

#### POST /v1/risk/resolve

Resolve a risk flag.

**Authorization:** `compliance_officer`, `admin`

**Request:**
```json
{
  "flagId": 456,
  "resolution": "Investigated and cleared - legitimate business activity",
  "preventiveAction": "Enhanced monitoring for 30 days"
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "flagId": 456,
    "status": "resolved",
    "resolvedAt": "2026-01-03T22:00:00.000Z"
  }
}
```

---

### Webhooks

#### POST /v1/webhooks/stripe

Handle Stripe webhook events.

**Authentication:** HMAC-SHA256 signature verification

**Headers:**
```http
Stripe-Signature: t=1234567890,v1=abc123...
```

**Request:** Stripe event payload

**Response:** `200 OK`
```json
{
  "received": true
}
```

---

## Error Responses

All errors follow RFC 7807 format:

```json
{
  "type": "urn:error:compliance-service:validation",
  "title": "Validation Error",
  "status": 400,
  "detail": "Invalid venue ID format",
  "instance": "req-abc123"
}
```

### Error Types

| Status | Type | Description |
|--------|------|-------------|
| 400 | `validation` | Invalid request data |
| 401 | `unauthorized` | Missing/invalid authentication |
| 403 | `forbidden` | Insufficient permissions |
| 404 | `not-found` | Resource not found |
| 409 | `conflict` | Resource already exists |
| 422 | `unprocessable` | Business rule violation |
| 429 | `rate-limit` | Too many requests |
| 500 | `internal` | Server error |
| 503 | `service-unavailable` | Service overloaded |

---

## Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| Default | 100 | 1 minute |
| GDPR Export | 5 | 1 hour |
| Risk Assessment | 50 | 1 minute |
| Webhooks | 1000 | 1 minute |

**Response Headers:**
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1704321600
Retry-After: 60
```

---

## Pagination

List endpoints support cursor-based pagination:

```http
GET /v1/risk/flags?limit=20&cursor=abc123
```

**Response:**
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "limit": 20,
    "hasMore": true,
    "nextCursor": "def456"
  }
}
```

---

## OpenAPI Specification

See `openapi.yaml` for the full OpenAPI 3.0 specification.

---

## SDK Examples

### JavaScript

```javascript
import { ComplianceClient } from '@tickettoken/sdk';

const client = new ComplianceClient({
  apiKey: process.env.API_KEY,
  baseUrl: 'https://api.tickettoken.com'
});

// Request GDPR export
const exportRequest = await client.gdpr.requestExport({
  userId: 'user-123',
  format: 'json'
});

// Check risk score
const riskScore = await client.risk.assess({
  venueId: 'venue-123'
});
```

---

## Changelog

See [CHANGELOG.md](../CHANGELOG.md) for version history.
