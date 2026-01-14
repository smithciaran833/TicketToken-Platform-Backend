# Idempotency

## Overview

Idempotency ensures that retrying a request produces the same result. Use the `Idempotency-Key` header on POST requests to enable safe retries.

## Header Format
```
Idempotency-Key: <unique-string>
```

## Key Requirements

| Requirement | Details |
|-------------|---------|
| Format | Any string up to 255 characters |
| Uniqueness | Must be unique per tenant + operation |
| Recommended | UUID v4 or `{entity}-{timestamp}-{random}` |

## Examples
```bash
# UUID format
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000

# Structured format
Idempotency-Key: purchase-1704067200-abc123

# Client-generated
Idempotency-Key: user-123-order-456-attempt-1
```

## Supported Endpoints

| Endpoint | Operation |
|----------|-----------|
| `POST /api/v1/purchase` | Create purchase |
| `POST /api/v1/purchase/confirm` | Confirm purchase |
| `POST /api/v1/transfer` | Transfer ticket |
| `POST /api/v1/refund` | Process refund |

## Response Headers
```
X-Idempotent-Replay: true
```

When `X-Idempotent-Replay: true` is present, the response is a cached replay of the original request.

## Key Behavior

| Scenario | Result |
|----------|--------|
| First request | Processed normally |
| Same key, same payload | Returns cached response |
| Same key, different payload | 409 Conflict error |
| Key after 24 hours | Key expired, new request |

## Conflict Response
```json
{
  "type": "https://api.tickettoken.com/errors/IDEMPOTENCY_CONFLICT",
  "title": "Idempotency Conflict",
  "status": 409,
  "detail": "Idempotency key already used with different payload",
  "code": "IDEMPOTENCY_CONFLICT"
}
```

## Key Expiration

Keys expire after 24 hours. After expiration, the same key can be reused.

## Best Practices

1. **Generate client-side** - Create keys before sending request
2. **Store with request** - Save key to retry if needed
3. **Include context** - Use structured keys for debugging
4. **Don't reuse** - Generate new key for each logical operation
