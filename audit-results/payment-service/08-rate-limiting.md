# Payment Service - 08 Rate Limiting Audit

**Service:** payment-service
**Document:** 08-rate-limiting.md
**Date:** 2025-12-23
**Auditor:** Cline
**Pass Rate:** 45% (21/47 checks)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 1 | X-Forwarded-For spoofing - rate limit bypass |
| HIGH | 1 | trustProxy: true trusts all proxies |
| MEDIUM | 2 | Missing Retry-After header, No webhook rate limiting |
| LOW | 2 | No ban mechanism, Race condition in TTL |

---

## Fastify Config (7/10)

| Check | Status | Evidence |
|-------|--------|----------|
| Rate limit middleware | PASS | rate-limit.middleware.ts |
| Redis storage | PASS | RedisService.getClient() |
| trustProxy configured | PASS | app.ts trustProxy: true |
| Global rate limit | PASS | 100 req/15 min |
| Route-specific limits | PASS | Payment: 5/min, Fees: 10/min |
| skipOnError: true | PASS | Fails open |
| keyGenerator uses userId | PASS | userId \|\| ip |
| onExceeded logs | PASS | Logs violations |
| Actionable error info | PARTIAL | Missing Retry-After header |
| Ban for repeat offenders | FAIL | Not implemented |

---

## Redis Infrastructure (4/4 applicable)

| Check | Status | Evidence |
|-------|--------|----------|
| Atomic operations | PASS | INCR + EXPIRE |
| Key namespacing | PASS | rate-limit:${key} |
| TTL on all keys | PASS | redis.expire() |
| Fallback if unavailable | PASS | Allows request |

---

## Payment Endpoints (4/10)

| Check | Status | Evidence |
|-------|--------|----------|
| Payment creation limited | PASS | 5 req/min |
| Respects Stripe limits | PARTIAL | More restrictive (OK) |
| PaymentIntent updates | PARTIAL | No specific limit |
| Refund limited | PASS | 5/min |
| Concurrent limiting | FAIL | Not implemented |
| Webhook limited | PARTIAL | Auth but no rate limit |
| Stripe headers monitored | FAIL | Not found |
| Backoff on 429 from Stripe | FAIL | Not found |
| Stripe-Rate-Limited logged | FAIL | Not found |
| Test same as prod | PASS | No env-specific |

---

## Response Headers (3/8)

| Check | Status | Evidence |
|-------|--------|----------|
| RateLimit-Limit | PASS | Present |
| RateLimit-Remaining | PASS | Present |
| RateLimit-Reset | PASS | Present |
| Retry-After header | FAIL | Only in body |
| Error code in body | PARTIAL | No machine-readable code |
| Retry timing in body | PASS | retryAfter present |
| Docs link | FAIL | Not included |
| 503 for system overload | FAIL | Only 429 |

---

## Header Manipulation (1/7)

| Check | Status | Evidence |
|-------|--------|----------|
| X-Forwarded-For not blind | FAIL | Uses first IP (spoofable!) |
| Trusted proxy list | FAIL | trustProxy: true (all) |
| Prefers userId over IP | PASS | userId \|\| ip |
| Rightmost IP used | FAIL | Uses leftmost (first) |
| IP validation | FAIL | None |
| Spoofing test | FAIL | First IP = bypassable |
| Multiple headers | PARTIAL | Uses first |

**CRITICAL: X-Forwarded-For Spoofing:**
```typescript
// VULNERABLE - uses first IP (attacker controlled)
const ip = forwarded.split(',')[0];  // ❌

// SECURE - use rightmost (your proxy set)
const ip = forwarded.split(',').pop();  // ✅
```

---

## Webhook Endpoints (2/7)

| Check | Status | Evidence |
|-------|--------|----------|
| Inbound limited | PARTIAL | No explicit limit |
| Separate per source | FAIL | Not found |
| Payload size limits | PASS | Fastify default |
| Async processing | PASS | Webhook inbox |
| Idempotency | PASS | Event ID dedup |
| Outbound limited | FAIL | Not found |
| Circuit breaker | FAIL | Not found |

---

## Rate Limit Tiers

| Operation | Limit | Status |
|-----------|-------|--------|
| Payment creation | 5/min | PASS |
| Fee calculation | 10/min | PASS |
| Refund processing | 5/min | PASS |
| API general | 100/15min | PASS |
| Webhook inbound | None | FAIL |
| Search/Reports | None | FAIL |

---

## Strengths

- Redis-based distributed rate limiting
- TTL prevents memory leaks
- User ID preferred over IP for auth
- Different limits per operation
- IETF-compliant header names
- Fail-open on Redis errors
- Comprehensive violation logging

---

## Remediation Priority

### CRITICAL (Immediate)
1. **Fix X-Forwarded-For spoofing:**
```typescript
// Use rightmost IP (set by your proxy)
const ips = forwarded?.split(',').map(ip => ip.trim()) || [];
const clientIp = ips[ips.length - 1] || request.ip;
```

### HIGH (This Week)
1. **Restrict trustProxy:**
```typescript
trustProxy: ['127.0.0.1', '10.0.0.0/8', 'loopback']
```

### MEDIUM (This Month)
1. Add Retry-After header:
```typescript
reply.header('Retry-After', options.retryAfter);
```

2. Add webhook rate limiting (100/sec per source)

### LOW (Backlog)
1. Implement ban mechanism for repeat offenders
2. Fix INCR/EXPIRE race with Lua script
