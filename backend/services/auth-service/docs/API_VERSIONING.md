# API Versioning Strategy

## Current Version
v1 (implicit - no version prefix)

## Versioning Approach
- **Method:** URL path prefix (`/v1/auth/login`, `/v2/auth/login`)
- **Breaking changes:** New major version
- **Non-breaking changes:** Same version, additive only

## Compatibility Rules
- Adding fields to responses: OK
- Adding optional request fields: OK
- Removing fields: BREAKING
- Changing field types: BREAKING
- Changing validation rules: BREAKING

## Deprecation Policy
1. Announce deprecation 6 months before removal
2. Add `Deprecation` header to responses
3. Log usage of deprecated endpoints
4. Remove after deprecation period

## Version Lifecycle
- **Active:** Current recommended version
- **Deprecated:** Still works, migration recommended
- **Sunset:** Removed, returns 410 Gone
