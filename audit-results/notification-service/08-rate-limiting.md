# Notification Service - 08 Rate Limiting Audit

**Service:** notification-service  
**Document:** 08-rate-limiting.md  
**Date:** 2025-12-26  
**Auditor:** Cline  
**Pass Rate:** 60% (27/45 applicable checks)

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 2 | In-memory rate limiting (not Redis), X-Forwarded-For bypass vulnerability |
| HIGH | 3 | No global API rate limit, no auth endpoint limits, webhook endpoints unprotected |
| MEDIUM | 4 | Fixed window algorithm, no concurrent limiting, missing ban, bypass not integrated |
| LOW | 2 | Non-IETF headers, no rate limit on GET status |

## Fastify Rate Limit Configuration (3/10)

- Rate limit plugin registered - PARTIAL (custom impl)
- Redis storage configured - FAIL (CRITICAL - in-memory)
- trustProxy configured - FAIL (CRITICAL - trusts blindly)
- Global rate limit set - FAIL (HIGH)
- Route-specific limits - PASS
- keyGenerator uses user ID - PASS
- onExceeded logs violations - PASS
- Error response actionable - PASS
- Ban for repeat offenders - FAIL (MEDIUM)

## Channel-Specific Rate Limits (5/6)

| Channel | Per-User | Duration | Global | Duration |
|---------|----------|----------|--------|----------|
| Email | 20 | 1 hour | 1000 | 1 minute |
| SMS | 5 | 1 hour | 100 | 1 minute |
| Push | 50 | 1 hour | 5000 | 1 minute |
| Batch | 10 | - | - | 1 minute |

- Email rate limit - PASS
- SMS rate limit - PASS
- Push rate limit - PASS (config only)
- Batch rate limit - PASS
- Critical notifications bypass - PASS (EXCELLENT)
- shouldBypassRateLimit used - FAIL (MEDIUM - defined but not called)

## Response Headers (5/8)

- RateLimit-Limit - PARTIAL (X- prefix)
- RateLimit-Remaining - PARTIAL (X- prefix)
- RateLimit-Reset - PARTIAL (X- prefix)
- Retry-After on 429 - PASS
- 429 body includes error - PASS
- 429 body includes timing - PASS
- 429 includes docs link - FAIL (LOW)

## Compliance Integration (5/5) EXCELLENT

- SMS time restrictions (8am-9pm) - PASS
- Suppression list check - PASS
- Consent check for marketing - PASS
- Fail-closed on error - PASS

## Webhook Endpoints (2/8)

- Inbound webhook rate limits - FAIL (HIGH)
- Rate limit after signature - N/A
- Per-source limits - FAIL (HIGH)
- Payload size limits - PASS
- Outbound rate limited - FAIL (MEDIUM)
- Circuit breaker available - PASS

## Header Manipulation (2/7)

- X-Forwarded-For not trusted - FAIL (CRITICAL)
- Trusted proxy list - FAIL
- Prefers user ID - PASS
- Rightmost IP used - FAIL
- IP validation - FAIL

## Critical Evidence

### In-Memory Storage
```typescript
// rate-limit.middleware.ts
class RateLimiter {
  private store: RateLimitStore = {}; // Lost on restart!
}
```

### X-Forwarded-For Bypass
```typescript
function getClientKey(request: FastifyRequest): string {
  const ip = request.ip || request.headers['x-forwarded-for']; // Spoofable!
}

// Bypass:
curl -H "X-Forwarded-For: 1.2.3.4" /api/send  // New limit each IP
```

### Fixed Window Algorithm
```typescript
if (!entry || entry.resetTime < now) {
  this.store[key] = {
    count: 1,
    resetTime: now + windowMs  // Resets completely - burst problem
  };
}
```

### Bypass Not Integrated
```typescript
// rate-limits.ts - defined but never called!
export function shouldBypassRateLimit(userId?, ip?, notificationType?) {
  if (RATE_LIMITS.criticalTypes.includes(notificationType)) return true;
}
```

## Remediations

### CRITICAL
1. Migrate to Redis-based rate limiting:
```typescript
import rateLimit from '@fastify/rate-limit';
await fastify.register(rateLimit, {
  redis: new Redis(process.env.REDIS_URL),
  skipOnError: true
});
```

2. Fix X-Forwarded-For:
```typescript
const ips = String(forwardedFor).split(',');
return `ip:${ips[ips.length - 1]}`; // Rightmost
```

### HIGH
1. Add global rate limit as baseline
2. Add rate limiting to webhook endpoints
3. Integrate shouldBypassRateLimit

### MEDIUM
1. Implement sliding window algorithm
2. Add ban functionality
3. Add outbound webhook rate limiting
4. Use IETF standard headers

## Positive Highlights

- Channel-specific limits (email/SMS/push/batch)
- User-based limiting when authenticated
- Critical notification bypass defined
- Retry-After header on 429
- Clear error messages
- Rate limit violation logging
- SMS time restrictions (TCPA)
- Fail-closed compliance
- Configurable via environment
- Memory leak prevention (cleanup)

Rate Limiting Score: 60/100
