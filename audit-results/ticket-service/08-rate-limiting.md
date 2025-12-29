# Ticket Service - 08 Rate Limiting Audit

**Service:** ticket-service
**Document:** 08-rate-limiting.md
**Date:** 2025-12-23
**Auditor:** Cline
**Pass Rate:** 58% (22/38 applicable checks)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 1 | Fastify rate-limit uses in-memory (not Redis) |
| HIGH | 2 | Custom limiters not applied to routes, trustProxy: true trusts all |
| MEDIUM | 3 | No concurrent limiting, No ban mechanism, No 503 load shedding |
| LOW | 2 | No docs link in 429, Legacy X- header prefix |

---

## Fastify Rate Limit (5/10)

| Check | Status | Evidence |
|-------|--------|----------|
| Plugin registered | PASS | app.ts - 100 req/min global |
| Redis storage | FAIL | Uses in-memory |
| trustProxy configured | PASS | trustProxy: true |
| Global baseline | PASS | 100 req/min |
| Route-specific limits | PARTIAL | Middleware exists, not integrated |
| skipOnError: true | PASS | Allows on Redis error |
| keyGenerator uses user ID | PARTIAL | Custom does, Fastify doesn't |
| onExceeded logs | PARTIAL | Custom logs, Fastify doesn't |
| Actionable error response | PASS | Includes retryAfter |
| Ban for repeat offenders | FAIL | Not configured |

---

## Custom Rate Limiter (8/8 PASS)

| Check | Status | Evidence |
|-------|--------|----------|
| Tiered limits defined | PASS | 8 tiers (global, read, write, purchase, etc) |
| Uses Redis | PASS | redis.incr(key) |
| User ID over IP | PASS | userId \|\| request.ip |
| Headers set | PASS | All 4 headers |
| Retry-After on 429 | PASS | TTL returned |
| Fails open | PASS | Catches and allows |
| Atomic operations | PASS | INCR then PEXPIRE |
| Pre-configured exports | PASS | Ready-to-use limiters |

**Tier Definitions:**
- GLOBAL: 100/min
- READ: 100/min
- WRITE: 10/min
- PURCHASE: 5/min
- TRANSFER: 5/min
- ADMIN: 20/min
- WEBHOOK: 100/min
- QR_SCAN: 30/min

---

## Redis Infrastructure (5/7)

| Check | Status | Evidence |
|-------|--------|----------|
| HA (Cluster/Sentinel) | PARTIAL | Single instance |
| Connection pooling | PASS | Shared lib handles |
| Atomic operations | PASS | INCR is atomic |
| Key namespacing | PASS | ${prefix}:${identifier} |
| TTL on keys | PASS | pexpire(key, windowMs) |
| Fallback if unavailable | PASS | Fails open |

---

## Payment/Purchase Endpoints (1/4)

| Check | Status | Evidence |
|-------|--------|----------|
| Purchase rate limited | PARTIAL | Global only, tier not applied |
| Tier exists | PASS | 5 req/min defined |
| Transfer limited | PARTIAL | Tier defined, not applied |
| Concurrent limiting | FAIL | Not implemented |

---

## Response Headers (6/8)

| Check | Status | Evidence |
|-------|--------|----------|
| RateLimit-Limit | PASS | X-RateLimit-Limit |
| RateLimit-Remaining | PASS | X-RateLimit-Remaining |
| RateLimit-Reset | PASS | X-RateLimit-Reset |
| Retry-After on 429 | PASS | TTL in header |
| Error code in 429 | PASS | Structured response |
| Retry timing in body | PASS | retryAfter field |
| Documentation link | FAIL | Not included |
| 503 for overload | FAIL | No load shedding |

---

## Header Manipulation Protection (2/5)

| Check | Status | Evidence |
|-------|--------|----------|
| X-Forwarded-For not blindly trusted | PASS | Falls back to socket |
| Trusted proxy list | PARTIAL | trustProxy: true (all) |
| User ID preferred | PASS | userId \|\| ip |
| IP validation | FAIL | No format validation |
| Multiple XFF handled | PARTIAL | Fastify default |

---

## Strengths

- 8 comprehensive tier definitions
- Redis-based custom limiter
- User ID over IP preference
- Fails open on Redis error
- Atomic Redis operations
- Complete rate limit headers
- Logging on exceeded
- Combined rate limiter utility
- QR scan specific tier

---

## Remediation Priority

### CRITICAL (Immediate)
1. **Configure Redis for Fastify rate-limit:**
```typescript
await app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  redis: RedisService.getClient(),
  keyGenerator: (req) => req.userId || req.ip
});
```

### HIGH (This Week)
1. **Apply custom limiters to routes:**
```typescript
fastify.post('/', {
  preHandler: [rateLimiters.purchase, authMiddleware]
}, ...);
```

2. **Specify trusted proxy list:**
```typescript
trustProxy: ['127.0.0.1', '10.0.0.0/8', '172.16.0.0/12']
```

### MEDIUM (This Month)
1. Add concurrent request limiting
2. Configure ban mechanism for repeat offenders
3. Implement 503 load shedding

### LOW (Backlog)
1. Update to IETF standard headers (RateLimit-* not X-RateLimit-*)
2. Add documentation link to 429 responses
