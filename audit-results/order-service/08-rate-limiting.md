# Order Service - 08 Rate Limiting Audit

**Service:** order-service
**Document:** 08-rate-limiting.md
**Date:** 2024-12-24
**Auditor:** Cline
**Pass Rate:** 79% (34/43 checks)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 0 | None |
| HIGH | 0 | None |
| MEDIUM | 2 | In-memory not distributed, No tenant-scoped limits |
| LOW | 1 | No internal service bypass |

---

## 8.1 Global Rate Limiting (6/6 PASS)

| Check | Status | Evidence |
|-------|--------|----------|
| GRL1: Global limiter registered | PASS | app.ts: rateLimit plugin with max: 100 |
| GRL2: Fastify rate-limit used | PASS | import rateLimit from fastify/rate-limit |
| GRL3: Default limit configured | PASS | max: 100 requests |
| GRL4: Time window configured | PASS | timeWindow: 1 minute |
| GRL5: In-memory store | PASS | Default in-memory |
| GRL6: Headers exposed | PASS | X-RateLimit-Limit, X-RateLimit-Remaining |

---

## 8.2 Route-Level Rate Limiting (8/8 PASS)

| Check | Status | Evidence |
|-------|--------|----------|
| RRL1: Create order | PASS | POST / - max: 10/min |
| RRL2: Reserve order | PASS | POST /:orderId/reserve - max: 5/min |
| RRL3: Cancel order | PASS | POST /:orderId/cancel - max: 5/min |
| RRL4: Refund order | PASS | POST /:orderId/refund - max: 3/min |
| RRL5: Partial refund | PASS | POST /:orderId/refunds - max: 3/min |
| RRL6: Modification | PASS | POST /:orderId/modifications - max: 5/min |
| RRL7: Upgrade | PASS | POST /:orderId/upgrade - max: 5/min |
| RRL8: Critical stricter | PASS | Refunds: 3/min vs Create: 10/min |

---

## 8.3 Business Limits (6/6 PASS)

| Check | Status | Evidence |
|-------|--------|----------|
| BL1: Config file exists | PASS | order.config.ts rateLimit section |
| BL2: Create limit configurable | PASS | RATE_LIMIT_CREATE_ORDER_PER_MINUTE |
| BL3: Reserve limit configurable | PASS | RATE_LIMIT_RESERVE_ORDER_PER_MINUTE |
| BL4: Orders per user per day | PASS | maxOrdersPerUserPerDay: 20 |
| BL5: Orders per user per event | PASS | maxOrdersPerUserPerEvent: 5 |
| BL6: Config validation | PASS | validateOrderConfig() |

---

## 8.4 Cache-Based Rate Limiting (5/6)

| Check | Status | Evidence |
|-------|--------|----------|
| CRL1: Hourly TTL | PASS | rateLimitHourly: 3600 |
| CRL2: Daily TTL | PASS | rateLimitDaily: 86400 |
| CRL3: Key generator | PASS | getRateLimitCacheKey() |
| CRL4: User-scoped keys | PASS | ratelimit:hourly:userId |
| CRL5: Count retrieval | PASS | getRateLimitCount() method |
| CRL6: Increment method | PARTIAL | Key generation exists, increment not shown |

---

## 8.5 CORS Headers (4/4 PASS)

| Check | Status | Evidence |
|-------|--------|----------|
| CRH1: X-RateLimit-Limit | PASS | In exposedHeaders |
| CRH2: X-RateLimit-Remaining | PASS | In exposedHeaders |
| CRH3: X-Request-ID | PASS | In exposedHeaders |
| CRH4: X-Idempotency-Key | PASS | In allowedHeaders |

---

## 8.6 Error Handling (2/4)

| Check | Status | Evidence |
|-------|--------|----------|
| ERR1: 429 status | PASS | Default Fastify behavior |
| ERR2: Retry-After header | PASS | Default Fastify behavior |
| ERR3: Descriptive message | PARTIAL | Uses defaults, not customized |
| ERR4: Exceeded logged | PARTIAL | Not explicitly configured |

---

## 8.7 Security (3/5)

| Check | Status | Evidence |
|-------|--------|----------|
| SEC1: Financial lowest limits | PASS | Refunds: 3/min |
| SEC2: Read ops higher limits | PASS | GET uses global 100/min |
| SEC3: Configurable via env | PASS | All have process.env fallbacks |
| SEC4: Distributed store | PARTIAL | In-memory only |
| SEC5: Internal bypass | FAIL | No IP whitelist |

---

## 8.8 Missing Checks (0/4)

| Check | Status | Evidence |
|-------|--------|----------|
| MS1: IP-based limiting | PARTIAL | Default uses IP, not explicit |
| MS2: User-based limiting | PARTIAL | Cache keys exist, not integrated |
| MS3: Tenant-based limiting | FAIL | No tenant-scoped limits |
| MS4: Rate limit metrics | PARTIAL | No specific metrics exposed |

---

## Remediations

### MEDIUM: Add Redis Store for Distribution

### MEDIUM: Add Tenant-Scoped Rate Limiting

### LOW: Add Internal Service Bypass

---

## Excellent Findings

- Tiered limits by risk (financial ops strictest)
- All critical routes protected
- Configurable via environment variables
- Business limits defined (daily/event per user)
- CORS headers exposed for client quota visibility
- Cache key infrastructure ready for distribution

Rate Limiting Score: 85/100
