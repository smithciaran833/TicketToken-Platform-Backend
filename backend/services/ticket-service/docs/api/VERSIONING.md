# API Versioning

## Overview

The Ticket Service API follows a versioning strategy that ensures backward compatibility while allowing for continued evolution of the API.

## Versioning Strategy

### URL Path Versioning

The primary versioning mechanism is URL path versioning:

```
https://api.tickettoken.io/v1/tickets
https://api.tickettoken.io/v2/tickets
```

### Current Versions

| Version | Status | Sunset Date |
|---------|--------|-------------|
| v1 | **Current** | - |
| v2 | Beta | - |

## Version Lifecycle

```
┌──────────┐    ┌──────────┐    ┌─────────────┐    ┌──────────┐
│  Alpha   │───▶│   Beta   │───▶│   Current   │───▶│  Sunset  │
│(internal)│    │(preview) │    │(production) │    │(retired) │
└──────────┘    └──────────┘    └─────────────┘    └──────────┘
                     │                 │
                     │                 │
            Feature complete    Deprecated APIs
            Breaking changes    Sunset warning
            OK                  12 months
```

### Version States

1. **Alpha** (internal only)
   - Not available externally
   - Rapid iteration
   - No stability guarantees

2. **Beta** (preview)
   - Available with opt-in
   - Feature complete
   - Breaking changes possible with 30-day notice

3. **Current** (production)
   - Fully supported
   - No breaking changes
   - New features added

4. **Deprecated** (sunset warning)
   - Still functional
   - No new features
   - 12-month sunset notice

5. **Sunset** (retired)
   - Returns 410 Gone
   - Migration required

## Backward Compatibility

### What We Consider Backward Compatible

✅ **Safe Changes:**
- Adding new API endpoints
- Adding optional request parameters
- Adding new response fields
- Adding new enum values (for output)
- Increasing rate limits
- Adding new error codes (with unique codes)

### What We Consider Breaking

❌ **Breaking Changes:**
- Removing or renaming endpoints
- Removing or renaming request parameters
- Removing or renaming response fields
- Changing data types
- Changing URL structure
- Reducing rate limits
- Changing authentication requirements
- Changing required parameters

## Version Header

In addition to URL versioning, you can request a specific version via header:

```http
GET /tickets HTTP/1.1
Host: api.tickettoken.io
Accept: application/json
Api-Version: 2024-01-01
```

### API Version Dates

| Api-Version | Changes |
|-------------|---------|
| 2025-01-01 | Initial v1 release |
| 2025-06-01 | Added transfer endpoints |
| 2025-12-01 | Enhanced QR validation |

## Deprecation Process

### Timeline

1. **Announcement** (T-12 months)
   - Blog post
   - Email to registered developers
   - Deprecation header added

2. **Warning Phase** (T-6 months)
   - Rate limit warnings
   - Console warnings in responses

3. **Sunset Warning** (T-1 month)
   - Daily reminders
   - Error responses include migration guide

4. **Sunset** (T=0)
   - Returns 410 Gone
   - Body includes migration information

### Deprecation Headers

When calling deprecated endpoints:

```http
HTTP/1.1 200 OK
Deprecation: true
Sunset: Sat, 01 Jun 2026 00:00:00 GMT
Link: <https://api.tickettoken.io/v2/tickets>; rel="successor-version"
X-Deprecation-Notice: This endpoint is deprecated. Please migrate to /v2/tickets
```

## Response Format

### Standard Response

All API responses include version information:

```json
{
  "data": { ... },
  "meta": {
    "apiVersion": "v1",
    "requestId": "req_abc123",
    "timestamp": "2025-01-01T12:00:00.000Z"
  }
}
```

### Deprecation Warning Response

```json
{
  "data": { ... },
  "meta": {
    "apiVersion": "v1",
    "requestId": "req_abc123",
    "deprecation": {
      "warning": "This API version is deprecated",
      "sunsetDate": "2026-06-01",
      "migrationGuide": "https://docs.tickettoken.io/migration/v1-to-v2"
    }
  }
}
```

## Migration Guides

### v1 to v2 Migration

#### Endpoint Changes

| v1 Endpoint | v2 Endpoint | Notes |
|-------------|-------------|-------|
| POST /v1/tickets/purchase | POST /v2/tickets/orders | Renamed |
| GET /v1/tickets/:id/qr | GET /v2/tickets/:id/code | New QR format |
| POST /v1/tickets/validate | POST /v2/validation/scan | Moved to validation |

#### Request Changes

**v1:**
```json
{
  "eventId": "evt_123",
  "quantity": 2,
  "userId": "user_456"
}
```

**v2:**
```json
{
  "event": {
    "id": "evt_123"
  },
  "order": {
    "quantity": 2,
    "buyer": {
      "id": "user_456"
    }
  }
}
```

#### Response Changes

**v1:**
```json
{
  "tickets": [
    { "id": "tkt_1", "status": "purchased" }
  ]
}
```

**v2:**
```json
{
  "data": {
    "order": {
      "id": "ord_789",
      "items": [
        {
          "ticket": { "id": "tkt_1" },
          "status": "confirmed"
        }
      ]
    }
  },
  "meta": { ... }
}
```

## SDK Version Support

| SDK | Supports v1 | Supports v2 |
|-----|-------------|-------------|
| JavaScript SDK 1.x | ✅ | ❌ |
| JavaScript SDK 2.x | ✅ | ✅ |
| React SDK 1.x | ✅ | ✅ |

## Feature Flags

New features can be enabled via feature flags before being added to a version:

```http
GET /v1/tickets HTTP/1.1
X-Feature-Flags: enhanced-qr,real-time-updates
```

### Available Feature Flags

| Flag | Description | Default |
|------|-------------|---------|
| enhanced-qr | New QR code format | off |
| real-time-updates | WebSocket push updates | off |
| batch-operations | Bulk ticket operations | off |

## Questions?

- **Developer Portal**: https://developers.tickettoken.io
- **API Status**: https://status.tickettoken.io
- **Support**: api-support@tickettoken.io
