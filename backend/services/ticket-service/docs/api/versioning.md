# API Versioning

## Current Version
```
/api/v1/*
```

## Versioning Strategy

We use URL path versioning for major changes:
- `/api/v1/tickets` - Current stable version
- `/api/v2/tickets` - Next major version (when needed)

## Version Lifecycle

| Phase | Duration | Description |
|-------|----------|-------------|
| Current | Ongoing | Active development and support |
| Deprecated | 6 months | Security fixes only, migration warnings |
| Sunset | 3 months | Read-only, then removed |

## Breaking Changes

These require a new major version:
- Removing endpoints
- Removing required fields
- Changing field types
- Changing error codes
- Changing authentication

## Non-Breaking Changes

These are added to current version:
- Adding new endpoints
- Adding optional fields
- Adding new enum values
- Adding new error codes
- Performance improvements

## Deprecation Notices

Deprecated features return warning header:
```
Deprecation: true
Sunset: Sat, 01 Jul 2026 00:00:00 GMT
Link: </api/v2/tickets>; rel="successor-version"
```

## Schema Versioning

Request/response schemas are versioned internally:
```typescript
// v1 schema
const ticketSchemaV1 = z.object({
  id: z.string().uuid(),
  status: z.enum(['active', 'used'])
});

// v2 schema (adds field)
const ticketSchemaV2 = ticketSchemaV1.extend({
  metadata: z.record(z.string()).optional()
});
```

## Migration Guide

When upgrading versions:
1. Review changelog for breaking changes
2. Update client SDK if applicable
3. Test in staging environment
4. Update API base URL
5. Monitor for errors
