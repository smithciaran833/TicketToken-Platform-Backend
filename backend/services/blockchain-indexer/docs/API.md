# Blockchain Indexer API Documentation

**Version:** 1.0.0  
**Base URL:** `/api/v1`  
**Service Port:** 3012

## Overview

The Blockchain Indexer service indexes Solana blockchain transactions, tracks marketplace activity, and reconciles on-chain state with the database.

## Authentication

All API endpoints (except health checks) require JWT authentication.

```
Authorization: Bearer <jwt_token>
```

### Required JWT Claims

| Claim | Type | Description |
|-------|------|-------------|
| `userId` or `serviceId` | string | User or service identifier |
| `tenant_id` | uuid | Tenant identifier for multi-tenancy |
| `iss` | string | Token issuer (expected: `tickettoken-auth-service`) |
| `aud` | string | Token audience (expected: `blockchain-indexer`) |

---

## API Versioning

AUDIT FIX: DOC-1 - API versioning documentation

The API uses URL path versioning:
- Current version: `/api/v1`
- Deprecated versions will be announced 90 days before removal
- Breaking changes require a new version

---

## Error Codes

AUDIT FIX: DOC-2 - Error code reference

All errors follow RFC 7807 Problem Details format:

```json
{
  "type": "https://api.tickettoken.com/errors/{ERROR_CODE}",
  "title": "Human readable title",
  "status": 400,
  "detail": "Detailed error message",
  "instance": "/api/v1/path",
  "timestamp": "2025-01-02T23:00:00.000Z"
}
```

### Error Code Reference

| Code | Status | Description |
|------|--------|-------------|
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `AUTHENTICATION_REQUIRED` | 401 | Missing or invalid authentication |
| `TOKEN_EXPIRED` | 401 | JWT token has expired |
| `INVALID_TOKEN` | 401 | JWT token is malformed or invalid |
| `TENANT_CONTEXT_MISSING` | 401 | Missing tenant_id in JWT |
| `FORBIDDEN` | 403 | Access denied |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource conflict |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Internal server error |

---

## Rate Limiting

- Default: 100 requests per minute per IP
- Authenticated users: 500 requests per minute
- Rate limit headers returned:
  - `X-RateLimit-Limit`: Maximum requests allowed
  - `X-RateLimit-Remaining`: Remaining requests
  - `X-RateLimit-Reset`: Time when limit resets (Unix timestamp)
  - `Retry-After`: Seconds to wait (on 429)

---

## Endpoints

### Health Endpoints (No Authentication)

#### GET /health
Full health check with all component statuses.

**Response:**
```json
{
  "status": "healthy",
  "service": "blockchain-indexer",
  "timestamp": "2025-01-02T23:00:00.000Z",
  "version": "1.0.0",
  "checks": {
    "postgresql": { "status": "ok", "responseTimeMs": 5 },
    "mongodb": { "status": "ok", "responseTimeMs": 3 },
    "redis": { "status": "ok", "responseTimeMs": 2 },
    "indexer": { "status": "ok" }
  },
  "indexer": {
    "lastProcessedSlot": 123456789,
    "lag": 50,
    "isRunning": true
  }
}
```

#### GET /live
Kubernetes liveness probe - is the process alive?

#### GET /ready
Kubernetes readiness probe - is the service ready for traffic?

#### GET /startup
Kubernetes startup probe - has the service started?

---

### Transaction Endpoints

#### GET /api/v1/transactions/:signature
Get transaction details by signature.

**Parameters:**
| Name | In | Type | Description |
|------|-----|------|-------------|
| `signature` | path | string | Base58 transaction signature (87-88 chars) |

**Response:**
```json
{
  "id": "uuid",
  "signature": "5abc...",
  "slot": 123456789,
  "block_time": "2025-01-02T23:00:00.000Z",
  "instruction_type": "transfer",
  "processed_at": "2025-01-02T23:00:01.000Z",
  "fullData": {
    "...": "MongoDB transaction document"
  }
}
```

---

### Wallet Endpoints

#### GET /api/v1/wallets/:address/activity
Get wallet activity history.

**Parameters:**
| Name | In | Type | Default | Description |
|------|-----|------|---------|-------------|
| `address` | path | string | - | Base58 wallet address (32-44 chars) |
| `limit` | query | number | 50 | Results per page (max 100) |
| `offset` | query | number | 0 | Pagination offset (max 10000) |
| `activityType` | query | string | "all" | Filter: mint, transfer, burn, all |

**Response:**
```json
{
  "activities": [
    {
      "walletAddress": "ABC...",
      "activityType": "transfer",
      "assetId": "XYZ...",
      "timestamp": "2025-01-02T23:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 150,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

---

### Slot Endpoints

#### GET /api/v1/transactions/by-slot/:slot
Get all transactions in a slot.

**Parameters:**
| Name | In | Type | Description |
|------|-----|------|-------------|
| `slot` | path | string | Solana slot number |

**Response:**
```json
{
  "transactions": [
    {
      "signature": "5abc...",
      "slot": 123456789,
      "instruction_type": "mint"
    }
  ]
}
```

---

### NFT Endpoints

#### GET /api/v1/nfts/:tokenId/history
Get transfer history for an NFT.

**Parameters:**
| Name | In | Type | Description |
|------|-----|------|-------------|
| `tokenId` | path | string | Base58 NFT mint address (32-44 chars) |

**Response:**
```json
{
  "tokenId": "XYZ...",
  "history": [
    {
      "walletAddress": "ABC...",
      "activityType": "transfer",
      "timestamp": "2025-01-02T23:00:00.000Z"
    }
  ]
}
```

---

### Marketplace Endpoints

#### GET /api/v1/marketplace/activity
Get marketplace activity events.

**Parameters:**
| Name | In | Type | Default | Description |
|------|-----|------|---------|-------------|
| `marketplace` | query | string | - | Filter by marketplace |
| `limit` | query | number | 50 | Results per page (max 100) |
| `offset` | query | number | 0 | Pagination offset (max 10000) |

**Response:**
```json
{
  "events": [
    {
      "marketplace": "magic-eden",
      "eventType": "listing",
      "price": "1.5",
      "timestamp": "2025-01-02T23:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 500,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

---

### Sync Endpoints

#### GET /api/v1/sync/status
Get indexer sync status.

**Response:**
```json
{
  "lastProcessedSlot": 123456789,
  "lastProcessedSignature": "5abc...",
  "indexerVersion": "1.0.0",
  "isRunning": true,
  "startedAt": "2025-01-02T22:00:00.000Z",
  "updatedAt": "2025-01-02T23:00:00.000Z"
}
```

---

### Reconciliation Endpoints

#### GET /api/v1/reconciliation/discrepancies
Get ownership discrepancies between on-chain and database.

**Parameters:**
| Name | In | Type | Default | Description |
|------|-----|------|---------|-------------|
| `resolved` | query | boolean | - | Filter by resolution status |
| `limit` | query | number | 50 | Results per page (max 100) |
| `offset` | query | number | 0 | Pagination offset (max 10000) |

**Response:**
```json
{
  "discrepancies": [
    {
      "id": "uuid",
      "assetId": "XYZ...",
      "discrepancyType": "owner_mismatch",
      "onChainOwner": "ABC...",
      "databaseOwner": "DEF...",
      "resolved": false,
      "detectedAt": "2025-01-02T23:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 10,
    "limit": 50,
    "offset": 0
  }
}
```

---

### Metrics Endpoint

#### GET /metrics
Prometheus metrics endpoint (no authentication).

Returns metrics in Prometheus text format.

---

## Request/Response Headers

### Request Headers
| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | Yes* | Bearer token for authenticated endpoints |
| `X-Request-ID` | No | Client request ID (auto-generated if not provided) |
| `Content-Type` | No | application/json (for POST/PUT) |

### Response Headers
| Header | Description |
|--------|-------------|
| `X-Request-ID` | Request tracking ID |
| `X-Correlation-ID` | Request correlation ID |
| `X-RateLimit-*` | Rate limiting headers |
| `Strict-Transport-Security` | HSTS header |
| `Content-Security-Policy` | CSP header |

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-01-02 | Initial release |
