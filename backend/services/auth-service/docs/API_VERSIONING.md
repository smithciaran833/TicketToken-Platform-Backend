# API Versioning Strategy

## Current Version

**v1** - All endpoints are currently at version 1.

Base path: `/auth/*` (no version prefix currently)

## Versioning Approach

We use **URL path versioning** for major versions:
```
/v1/auth/login
/v2/auth/login
```

## Version Lifecycle

| Phase | Duration | Description |
|-------|----------|-------------|
| Current | Ongoing | Active development, full support |
| Deprecated | 6 months | Security fixes only, migration warnings |
| Sunset | 3 months | Read-only announcements |
| Removed | - | No longer available |

## Breaking vs Non-Breaking Changes

### Non-Breaking (no version bump)
- Adding new optional fields to responses
- Adding new endpoints
- Adding new optional query parameters
- Performance improvements
- Bug fixes

### Breaking (requires new version)
- Removing or renaming fields
- Changing field types
- Removing endpoints
- Changing authentication mechanism
- Changing error response format

## Deprecation Process

1. **Announce**: Add `Deprecation` header to responses
2. **Document**: Update changelog and migration guide
3. **Warn**: Log warnings for deprecated endpoint usage
4. **Sunset**: Return 410 Gone after sunset date

### Deprecation Headers
```http
Deprecation: true
Sunset: Sat, 31 Dec 2025 23:59:59 GMT
Link: </v2/auth/login>; rel="successor-version"
```

## Migration Guides

When a new version is released, a migration guide will be published at:
`docs/migrations/v1-to-v2.md`

## Client Recommendations

- Always specify API version explicitly
- Subscribe to changelog notifications
- Test against beta versions before GA
- Plan migrations during deprecation period

## Version History

| Version | Released | Status | Sunset Date |
|---------|----------|--------|-------------|
| v1 | 2024-XX-XX | Current | - |
