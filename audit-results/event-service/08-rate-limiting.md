# Event Service - 08 Rate Limiting Audit

**Service:** event-service
**Document:** 08-rate-limiting.md
**Date:** 2025-12-23
**Auditor:** Cline
**Pass Rate:** 73% (34/47 applicable checks)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 0 | None |
| HIGH | 1 | No endpoint-specific rate limits - POST same as GET |
| MEDIUM | 2 | Rate limit only by IP (not user/tenant), No internal service exemption |
| LOW | 2 | Hardcoded allowlist, Health check not explicitly excluded |

---

## Rate Limit Configuration (7/8 PASS)

| Check | Status | Evidence |
|-------|--------|----------|
| RC1: Enabled by default | PASS | Only disabled if ENABLE_RATE_LIMITING=false |
| RC2: Window configurable | PASS | RATE_LIMIT_WINDOW_MS (default 60000) |
| RC3: Max requests configurable | PASS | RATE_LIMIT_MAX_REQUESTS (default 100) |
| RC4: Config validated | PASS | Joi validates at startup |
| RC5: Sane defaults | PARTIAL | 100/min OK for API, sensitive need stricter |
| RC6: Fail-open documented | PASS | skipOnError: true |
| RC7: Disabled warning | PASS | Logs warn when disabled |
| RC8: Namespace isolates | PASS | event-service-rate-limit: |

---

## Endpoint-Specific Limits (0/6 applicable)

| Check | Status | Evidence |
|-------|--------|----------|
| ES2: Stricter on writes | FAIL | POST uses same 100/min as GET |
| ES3: Stricter on intensive | FAIL | No special limits for search |
| ES4: Higher for reads | FAIL | All same limit |
| ES6: Health check exempt | PARTIAL | Registered before, not explicit |
| ES7: Internal calls exempt | FAIL | No S2S exemption |
| ES8: Admin limits | FAIL | No admin-specific |

---

## Response Headers (8/8 PASS)

All headers correctly implemented via @fastify/rate-limit.

---

## Key Generation (3/7)

| Check | Status | Evidence |
|-------|--------|----------|
| KG1: IP-based | PASS | request.ip |
| KG2: X-Forwarded-For | PASS | Fallback supported |
| KG3: Fallback for unknown | PASS | Returns 'unknown' |
| KG4: User ID considered | FAIL | Only IP |
| KG5: Tenant ID considered | FAIL | Only IP |
| KG6: API key considered | FAIL | No |
| KG7: Per user AND per IP | FAIL | Only IP |

---

## Bypass & Allow Lists (2/7)

| Check | Status | Evidence |
|-------|--------|----------|
| BA1: Localhost allowed | PASS | 127.0.0.1, ::1 |
| BA2: Health exempt | PARTIAL | Not explicit |
| BA3: Internal IPs | FAIL | Not configured |
| BA4: Allowlist configurable | FAIL | Hardcoded |
| BA5: No public bypass | PASS | Only localhost |
| BA6: Dynamic allowlist | FAIL | Static array |
| BA7: Metrics exempt | PARTIAL | Not explicit |

---

## Distributed Rate Limiting (8/8 PASS)

| Check | Status | Evidence |
|-------|--------|----------|
| DR1: Redis used | PASS | getRedis() |
| DR2: Connection from pool | PASS | Shared manager |
| DR3: Redis failure safe | PASS | skipOnError: true |
| DR4: Cache fallback | PASS | cache: 10000 |
| DR5: State persists | PASS | Redis |
| DR6: Namespace prevents conflicts | PASS | Service-specific |
| DR7: Redis TTL | PASS | Handled by plugin |
| DR8: Sliding window | PASS | Default algorithm |

---

## Logging & Monitoring (6/6 PASS)

- onExceeding logs warning
- onExceeded logs error
- IP, method, URL included
- Prometheus metrics: rateLimitHitsTotal
- Endpoint labels included

---

## Strengths

- Distributed rate limiting with Redis
- Fail-open for availability
- Proper response headers
- Comprehensive logging
- Prometheus metrics
- Service-specific namespace

---

## Remediation Priority

### HIGH (This Week)
1. Add route-specific limits (20/min for POST)
2. Add user-based rate limiting for authenticated requests

### MEDIUM (This Month)
1. Make allowlist configurable via env
2. Add internal service exemption
3. Add tenant-aware rate limiting

### LOW (Backlog)
1. Composite user AND IP limits
2. Dynamic rate adjustment based on load
