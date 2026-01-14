# API Versioning Strategy

## Overview

The event-service uses URI-based versioning with semantic version compatibility guarantees.

## Versioning Scheme

### URI Path Versioning

All API endpoints are prefixed with a major version number:
```
/api/v1/events
/api/v1/events/:id
/api/v1/capacity
/api/v1/pricing
```

### Version Format

- **Major version**: Breaking changes (v1 → v2)
- **Minor version**: Backward-compatible additions (documented in CHANGELOG)
- **Patch version**: Bug fixes (no API changes)

## Compatibility Guarantees

### Within a Major Version (v1.x.x)

We guarantee:
- ✅ Existing endpoints will not be removed
- ✅ Existing fields in responses will not be removed
- ✅ Existing required fields in requests will not change
- ✅ Field types will not change
- ✅ Enum values will not be removed

We may:
- ➕ Add new optional fields to responses
- ➕ Add new optional fields to requests
- ➕ Add new endpoints
- ➕ Add new enum values
- ➕ Add new query parameters

### Breaking Changes (v1 → v2)

The following require a major version bump:
- ❌ Removing an endpoint
- ❌ Removing a response field
- ❌ Changing a field type
- ❌ Making an optional field required
- ❌ Changing authentication requirements
- ❌ Changing error response format
- ❌ Removing enum values

## Deprecation Policy

### Timeline

1. **Announcement**: Deprecation announced in CHANGELOG and API docs
2. **Warning Period**: 6 months with `Deprecation` header
3. **Sunset Period**: 3 months with `Sunset` header
4. **Removal**: Endpoint removed in next major version

### Headers

Deprecated endpoints return:
```http
Deprecation: true
Sunset: Sat, 01 Jan 2026 00:00:00 GMT
Link: </api/v2/events>; rel="successor-version"
```

### Documentation

Deprecated endpoints are marked in OpenAPI spec:
```yaml
/api/v1/events/legacy:
  get:
    deprecated: true
    x-sunset-date: "2026-01-01"
    description: |
      **DEPRECATED**: Use /api/v1/events instead.
      This endpoint will be removed on 2026-01-01.
```

## Version Negotiation

### Request Headers

Clients can request specific minor versions:
```http
Accept: application/json; version=1.2
```

If not specified, the latest minor version is returned.

### Response Headers

All responses include:
```http
X-API-Version: 1.2.3
X-API-Deprecated: false
```

## Multi-Version Support

### Parallel Versions

During major transitions, both versions run simultaneously:
- `/api/v1/*` - Current stable version
- `/api/v2/*` - Next major version (beta)

### Migration Path

1. **Beta Period**: v2 available at `/api/v2` for testing
2. **GA Release**: v2 becomes stable, v1 enters deprecation
3. **Sunset**: v1 removed after deprecation period

## Client Guidelines

### Best Practices

1. **Always specify version** in the URL path
2. **Handle new fields gracefully** - ignore unknown fields
3. **Watch for deprecation headers** - plan migrations early
4. **Subscribe to changelog** - stay informed of changes

### Version Detection
```javascript
// Check API version in response
const version = response.headers['x-api-version'];
const deprecated = response.headers['x-api-deprecated'] === 'true';

if (deprecated) {
  console.warn('API endpoint is deprecated, plan migration');
}
```

## Changelog

See [CHANGELOG.md](../CHANGELOG.md) for version history.
