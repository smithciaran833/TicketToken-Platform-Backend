# Error Codes

All API errors follow [RFC 7807](https://tools.ietf.org/html/rfc7807) Problem Details format.

## Response Format
```json
{
  "type": "https://httpstatuses.com/400",
  "title": "Bad Request",
  "status": 400,
  "detail": "Email is required",
  "instance": "/auth/register",
  "correlationId": "abc-123-def"
}
```

## Authentication Errors (401)

| Code | Description | Resolution |
|------|-------------|------------|
| `INVALID_CREDENTIALS` | Email or password incorrect | Check credentials |
| `TOKEN_EXPIRED` | JWT access token has expired | Refresh the token |
| `TOKEN_INVALID` | JWT token is malformed or invalid | Re-authenticate |
| `REFRESH_TOKEN_EXPIRED` | Refresh token has expired | Re-authenticate |
| `REFRESH_TOKEN_INVALID` | Refresh token is invalid | Re-authenticate |
| `MFA_REQUIRED` | MFA verification needed | Submit MFA code |
| `MFA_INVALID` | MFA code is incorrect | Retry with correct code |
| `ACCOUNT_LOCKED` | Too many failed attempts | Wait for lockout to expire |
| `SESSION_EXPIRED` | User session has ended | Re-authenticate |

## Authorization Errors (403)

| Code | Description | Resolution |
|------|-------------|------------|
| `FORBIDDEN` | User lacks permission | Request access or use different account |
| `INSUFFICIENT_PERMISSIONS` | Missing required permission | Contact admin |
| `VENUE_ACCESS_DENIED` | No access to this venue | Request venue access |
| `SERVICE_NOT_ALLOWED` | S2S service not in allowlist | Update service ACL |
| `CSRF_ERROR` | Invalid or missing CSRF token | Include valid CSRF token |

## Validation Errors (400)

| Code | Description | Resolution |
|------|-------------|------------|
| `VALIDATION_ERROR` | Request body validation failed | Check `errors` array |
| `INVALID_EMAIL` | Email format is invalid | Use valid email format |
| `INVALID_PASSWORD` | Password doesn't meet requirements | Use stronger password |
| `INVALID_PHONE` | Phone format is invalid | Use E.164 format |
| `MISSING_FIELD` | Required field is missing | Include all required fields |
| `INVALID_TENANT` | Tenant ID is invalid | Use valid tenant UUID |

## Conflict Errors (409)

| Code | Description | Resolution |
|------|-------------|------------|
| `DUPLICATE_EMAIL` | Email already registered | Use different email or login |
| `DUPLICATE_WALLET` | Wallet already linked | Use different wallet |
| `DUPLICATE_OAUTH` | OAuth account already linked | Unlink first or use different account |

## Rate Limiting (429)

| Code | Description | Resolution |
|------|-------------|------------|
| `RATE_LIMIT_EXCEEDED` | Too many requests | Wait for `Retry-After` seconds |

## Server Errors (5xx)

| Code | Description | Resolution |
|------|-------------|------------|
| `INTERNAL_ERROR` | Unexpected server error | Retry later, contact support if persists |
| `SERVICE_UNAVAILABLE` | Service under load | Retry after `Retry-After` seconds |
| `DATABASE_ERROR` | Database connection issue | Retry later |
| `REDIS_ERROR` | Cache connection issue | Retry later |

## S2S Errors

| Code | Description | Resolution |
|------|-------------|------------|
| `MISSING_SERVICE_TOKEN` | x-service-token header missing | Include service token |
| `INVALID_SERVICE_TOKEN` | Service token verification failed | Check token/keys |
| `SERVICE_TOKEN_EXPIRED` | Service token has expired | Generate new token |
