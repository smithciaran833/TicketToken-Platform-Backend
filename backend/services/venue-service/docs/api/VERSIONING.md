# API Versioning Strategy (AP4)

This document outlines the API versioning strategy for the Venue Service.

## Overview

We use **URL path versioning** as our primary versioning strategy:

```
https://api.tickettoken.com/api/v1/venues
https://api.tickettoken.com/api/v2/venues
```

## Versioning Format

- **Major version** in URL path: `/api/v1/`, `/api/v2/`
- **Minor/Patch** changes are backward compatible within the same major version

### URL Structure

```
https://{host}/api/v{major}/{resource}/{id}
```

Examples:
- `GET /api/v1/venues` - List venues
- `GET /api/v1/venues/123` - Get venue
- `POST /api/v2/venues` - Create venue (v2)

## Version Support Policy

| Version | Status | Support Until |
|---------|--------|---------------|
| v1 | **Current** | TBD (minimum 12 months notice) |
| v2 | Planned | N/A |

### Deprecation Timeline

1. **Announcement**: 12 months before end of support
2. **Deprecation Warning**: Headers added 6 months before EOL
3. **Sunset**: Version disabled, requests return 410 Gone

## Backward Compatibility Rules

### ✅ Allowed (Non-Breaking Changes)

These changes do NOT require a new major version:

1. **Adding new endpoints**
   ```
   POST /api/v1/venues/{id}/reviews  (new)
   ```

2. **Adding optional request fields**
   ```json
   {
     "name": "Venue",
     "newOptionalField": "value"  // New optional
   }
   ```

3. **Adding response fields**
   ```json
   {
     "id": "123",
     "name": "Venue",
     "newField": "value"  // New field
   }
   ```

4. **Adding new enum values** (where client can ignore unknown)
   ```typescript
   venue_type: 'arena' | 'stadium' | 'theater' | 'new_type'
   ```

5. **Relaxing validation** (accepting more input)
   ```
   // Before: name max 100 chars
   // After: name max 255 chars
   ```

6. **Adding new optional query parameters**
   ```
   GET /api/v1/venues?include=settings  // New param
   ```

### ❌ Not Allowed (Breaking Changes)

These changes REQUIRE a new major version:

1. **Removing endpoints**
   ```
   DELETE /api/v1/venues/{id}/legacy  // Removing
   ```

2. **Renaming or removing fields**
   ```json
   // Before
   { "venue_name": "..." }
   // After (breaking!)
   { "name": "..." }
   ```

3. **Changing field types**
   ```json
   // Before
   { "capacity": "5000" }  // string
   // After (breaking!)
   { "capacity": 5000 }    // number
   ```

4. **Adding required fields**
   ```json
   {
     "name": "Venue",
     "newRequiredField": "must provide"  // Breaking!
   }
   ```

5. **Changing authentication/authorization**
   ```
   // Requiring new scope: breaking
   ```

6. **Changing error codes or formats**
   ```json
   // Changing error structure is breaking
   ```

7. **Removing enum values**
   ```typescript
   // Before: 'arena' | 'stadium' | 'legacy_type'
   // After: 'arena' | 'stadium'  // Breaking!
   ```

## Version Migration

### Gradual Migration Path

1. **Dual Support**: Both versions run simultaneously
2. **Feature Parity**: v2 includes all v1 features
3. **Migration Guide**: Document all changes
4. **Client SDK**: Updated SDK supports both versions

### Migration Example (v1 → v2)

```typescript
// v1 client
const client = new VenueClient({ version: 'v1' });
const venue = await client.venues.get('123');
// venue.venue_name

// v2 client
const clientV2 = new VenueClient({ version: 'v2' });
const venueV2 = await clientV2.venues.get('123');
// venueV2.name  // Renamed field
```

## Deprecation Headers

When a version is deprecated, responses include:

```http
HTTP/1.1 200 OK
Deprecation: true
Sunset: Sat, 31 Dec 2025 23:59:59 GMT
Link: <https://api.tickettoken.com/api/v2/venues>; rel="successor-version"
X-API-Deprecation-Info: https://docs.tickettoken.com/api/deprecation/v1
```

## Content Negotiation (Alternative)

For minor versioning within a major version, use Accept headers:

```http
GET /api/v1/venues
Accept: application/vnd.tickettoken.v1.1+json
```

Response includes version:
```http
Content-Type: application/vnd.tickettoken.v1.1+json
X-API-Version: 1.1.0
```

## Feature Flags (Preview Features)

New features can be released under feature flags before GA:

```http
GET /api/v1/venues?preview=new-analytics
```

Or via header:
```http
X-Preview-Features: new-analytics,beta-resale
```

## Client SDK Versioning

SDK versions align with API versions:

| SDK Version | API Version | Status |
|-------------|-------------|--------|
| 1.x.x | v1 | Stable |
| 2.x.x | v2 | Planned |

```json
{
  "dependencies": {
    "@tickettoken/venue-sdk": "^1.0.0"  // Uses v1 API
  }
}
```

## Implementation

### Route Registration

```typescript
// src/routes/index.ts
app.register(venuesRoutesV1, { prefix: '/api/v1' });
app.register(venuesRoutesV2, { prefix: '/api/v2' });
```

### Version Detection Middleware

```typescript
// src/middleware/version.middleware.ts
export function versionMiddleware(request, reply, done) {
  const version = request.url.match(/\/api\/v(\d+)/)?.[1] || '1';
  request.apiVersion = parseInt(version, 10);
  done();
}
```

### Response Transformation

```typescript
// Transform v1 response to match v1 schema
function transformVenueForV1(venue: Venue): VenueV1 {
  return {
    ...venue,
    venue_name: venue.name,  // v1 uses venue_name
  };
}
```

## Monitoring

Track version usage for deprecation planning:

```typescript
// Metrics
apiRequestsTotal.labels({ version: 'v1' }).inc();
apiRequestsTotal.labels({ version: 'v2' }).inc();
```

Dashboard shows:
- Requests per version
- Clients still using deprecated versions
- Migration progress

## Documentation

Each version has separate documentation:

- `/docs/api/v1/` - v1 API Reference
- `/docs/api/v2/` - v2 API Reference
- `/docs/api/migration/v1-to-v2.md` - Migration Guide

## Changelog

All version changes documented in `CHANGELOG.md`:

```markdown
## [2.0.0] - 2025-06-01
### Breaking Changes
- Renamed `venue_name` to `name`
- Changed `capacity` from string to number

### Migration
See [v1 to v2 Migration Guide](./docs/migration-v1-v2.md)
```
