# Retry Configuration

## Default Retry Policy

All retries use exponential backoff with jitter to prevent thundering herd.

| Setting | Default | Description |
|---------|---------|-------------|
| Max Retries | 3 | Maximum retry attempts |
| Base Delay | 1000ms | Initial delay before first retry |
| Max Delay | 30000ms | Maximum delay between retries |
| Jitter | 30% | Random variance added to delays |

## Retry Formula
```
delay = min(baseDelay * 2^attempt, maxDelay) * (1 + random * jitter)
```

## Per-Operation Retries

| Operation | Max Retries | Base Delay | Retryable Errors |
|-----------|-------------|------------|------------------|
| Database Query | 3 | 100ms | Connection, timeout |
| Inter-Service Call | 3 | 1000ms | 5xx, timeout, ECONNREFUSED |
| Blockchain RPC | 5 | 2000ms | Rate limit, timeout |
| Redis Operation | 2 | 500ms | Connection, timeout |
| Queue Publish | 3 | 1000ms | Connection, channel closed |

## Non-Retryable Errors

These errors fail immediately without retry:
- 400 Bad Request
- 401 Unauthorized
- 403 Forbidden
- 404 Not Found
- 409 Conflict
- 422 Validation Error

## Circuit Breaker Integration

When circuit breaker is OPEN:
- Retries are skipped
- Requests fail immediately
- Recovery attempted in HALF_OPEN state

## Configuration
```typescript
// src/utils/resilience.ts
const DEFAULT_RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  jitter: 0.3
};
```
