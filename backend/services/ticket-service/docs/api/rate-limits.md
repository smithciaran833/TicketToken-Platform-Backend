# Rate Limits

## Default Limits

| Endpoint Type | Limit | Window |
|---------------|-------|--------|
| Read (GET) | 100 req | 1 minute |
| Write (POST/PUT) | 20 req | 1 minute |
| Purchase | 5 req | 1 minute |
| Transfer | 5 req | 1 minute |

## Rate Limit Headers

Every response includes rate limit headers:
```
RateLimit-Limit: 100
RateLimit-Remaining: 95
RateLimit-Reset: 1704067200
Retry-After: 30
```

| Header | Description |
|--------|-------------|
| `RateLimit-Limit` | Maximum requests allowed |
| `RateLimit-Remaining` | Requests remaining in window |
| `RateLimit-Reset` | Unix timestamp when window resets |
| `Retry-After` | Seconds to wait (only on 429) |

## Rate Limited Response
```json
{
  "type": "https://api.tickettoken.com/errors/RATE_LIMITED",
  "title": "Too Many Requests",
  "status": 429,
  "detail": "Rate limit exceeded. Retry after 30 seconds.",
  "code": "RATE_LIMITED",
  "retryAfter": 30
}
```

## Tenant-Specific Limits

Enterprise tenants may have custom limits. Contact support for details.

## Exemptions

Health check endpoints (`/health/*`) are exempt from rate limiting.

## Ban Policy

Repeated rate limit violations may result in temporary ban:
- 10 violations in 5 minutes → 15 minute ban
- Bans are per-user and per-IP

## Best Practices

1. **Implement backoff** - Use exponential backoff on 429 responses
2. **Check headers** - Monitor `RateLimit-Remaining` proactively
3. **Batch requests** - Combine operations where possible
4. **Use idempotency** - Safe retries with `Idempotency-Key` header

## Exemption Process

To request rate limit exemption:

1. **Submit request** - Email api-support@tickettoken.com
2. **Include details**:
   - Tenant ID
   - Use case description
   - Expected request volume
   - Endpoints affected
3. **Review period** - 3-5 business days
4. **Implementation** - Custom limits applied to tenant

## Increase Request Process

To request higher limits:

1. **Document need** - Explain business requirement
2. **Current usage** - Provide current metrics
3. **Requested limits** - Specific numbers needed
4. **Submit ticket** - Via support portal
5. **Review** - Technical review of impact
6. **Approval** - Based on infrastructure capacity
