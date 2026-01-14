# Service-to-Service Authentication

## Overview

Inter-service calls use short-lived JWT tokens with HMAC signatures for authentication.

## Token Format
```
Authorization: Bearer <jwt-token>
```

## JWT Claims

| Claim | Description |
|-------|-------------|
| `iss` | Issuer (calling service name) |
| `aud` | Audience (target service name) |
| `sub` | Subject (service identity) |
| `iat` | Issued at timestamp |
| `exp` | Expiration (60 seconds from iat) |
| `jti` | Unique token ID (nonce) |
| `bodyHash` | SHA-256 hash of request body |

## Example Token Payload
```json
{
  "iss": "payment-service",
  "aud": "ticket-service",
  "sub": "payment-service",
  "iat": 1704067200,
  "exp": 1704067260,
  "jti": "abc123-unique-nonce",
  "bodyHash": "sha256:a1b2c3..."
}
```

## Signature Verification

1. Verify JWT signature using service-specific secret
2. Check `exp` is in the future
3. Check `iat` is within 5 minutes (replay protection)
4. Verify `aud` matches this service
5. Verify `iss` is in allowed callers list
6. Verify `bodyHash` matches request body
7. Check `jti` not recently used (replay protection)

## Per-Service Secrets

Each calling service has its own secret:
```bash
AUTH_SERVICE_SECRET=<secret>
PAYMENT_SERVICE_SECRET=<secret>
EVENT_SERVICE_SECRET=<secret>
```

## Endpoint Authorization

Not all services can call all endpoints:

| Endpoint | Allowed Services |
|----------|------------------|
| `POST /internal/mint` | minting-service |
| `POST /internal/validate` | scanning-service |
| `GET /internal/tickets` | event-service, order-service |

## Error Responses

| Status | Code | Description |
|--------|------|-------------|
| 401 | `INVALID_TOKEN` | Token missing or malformed |
| 401 | `TOKEN_EXPIRED` | Token has expired |
| 403 | `SERVICE_NOT_ALLOWED` | Service cannot call endpoint |
| 403 | `INVALID_SIGNATURE` | Signature verification failed |
