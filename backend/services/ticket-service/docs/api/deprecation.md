# Deprecation Policy

## Overview

We provide advance notice before removing or changing API features.

## Deprecation Timeline

| Phase | Notice | Actions |
|-------|--------|---------|
| Announced | 6 months before | Deprecation header added |
| Warning | 3 months before | Logs warning on usage |
| Sunset | 1 month before | Returns 410 Gone |
| Removed | End of life | Endpoint removed |

## Deprecation Headers

Deprecated endpoints return:
```
Deprecation: true
Sunset: Sat, 01 Jul 2026 00:00:00 GMT
X-Deprecation-Notice: This endpoint is deprecated. Use /api/v2/tickets instead.
Link: </api/v2/tickets>; rel="successor-version"
```

## Currently Deprecated

| Endpoint | Deprecated | Sunset | Replacement |
|----------|------------|--------|-------------|
| None currently | - | - | - |

## Handling Deprecation Warnings

1. **Monitor headers** - Check for `Deprecation: true`
2. **Log warnings** - Track deprecated endpoint usage
3. **Plan migration** - Before sunset date
4. **Test replacement** - In staging first
5. **Update clients** - Before sunset

## Notification Channels

Deprecation notices are announced via:
- API response headers
- Developer documentation
- Email to registered developers
- Changelog updates
