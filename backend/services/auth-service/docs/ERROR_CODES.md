# Error Codes Reference

All errors follow RFC 7807 Problem Details format.

## Authentication Errors (401)
| Code | Description |
|------|-------------|
| INVALID_CREDENTIALS | Email or password incorrect |
| TOKEN_EXPIRED | JWT access token expired |
| TOKEN_INVALID | JWT signature invalid |
| TOKEN_REVOKED | Refresh token was revoked |
| MFA_REQUIRED | MFA token required |
| MFA_INVALID | MFA token incorrect |

## Authorization Errors (403)
| Code | Description |
|------|-------------|
| INSUFFICIENT_PERMISSIONS | User lacks required permission |
| ACCOUNT_LOCKED | Too many failed attempts |
| ACCOUNT_SUSPENDED | Account suspended by admin |
| CSRF_ERROR | Invalid or missing CSRF token |

## Validation Errors (400)
| Code | Description |
|------|-------------|
| VALIDATION_ERROR | Request body validation failed |
| INVALID_EMAIL | Email format invalid |
| WEAK_PASSWORD | Password doesn't meet requirements |
| INVALID_PHONE | Phone format invalid |

## Conflict Errors (409)
| Code | Description |
|------|-------------|
| DUPLICATE_EMAIL | Email already registered |
| DUPLICATE_USERNAME | Username taken |

## Rate Limiting (429)
| Code | Description |
|------|-------------|
| RATE_LIMIT_EXCEEDED | Too many requests |
| CAPTCHA_REQUIRED | CAPTCHA verification needed |

## Server Errors (5xx)
| Code | Description |
|------|-------------|
| SERVICE_OVERLOADED | Server under pressure (503) |
| INTERNAL_ERROR | Unexpected server error (500) |
