# Queue Service - Frontend/Backend Gap Analysis

Generated: 2024-12-27
Status: REVIEWED

---

## Summary

| Type | Count | Severity |
|------|-------|----------|
| Security | 2 | HIGH |
| S2S Auth | 1 | HIGH |
| Error Handling | 1 | MEDIUM |
| Frontend Features | 0 | - |

**Note:** This is primarily an internal service with admin-facing APIs.

---

## What Works Well ✅

### Security
- JWT authentication on all routes
- Role-based authorization (admin, venue_admin)
- Multi-tenant RLS on all 10 tables
- Stripe webhook signature verification
- Comprehensive rate limiting with token bucket

### Queue Features
- Full idempotency implementation
- Dead letter queue for failed jobs
- Circuit breaker for external services
- Job retry with backoff
- Queue health monitoring with alerts

---

## HIGH Issues

### GAP-QUEUE-001: JWT Algorithm Not Specified
- **Severity:** HIGH
- **Audit:** 01-security.md
- **Current:** Missing `algorithms` option in JWT verification
- **Risk:** Algorithm confusion attacks
- **Fix:** Specify `algorithms: ['HS256']` or RS256

### GAP-QUEUE-002: No Spending Limits
- **Severity:** HIGH
- **Audit:** 01-security.md
- **Current:** No per-transaction or daily limits for blockchain ops
- **Risk:** Accidental or malicious over-spending
- **Fix:** Implement spending limits

### GAP-QUEUE-003: Webhook Failures Lost
- **Severity:** HIGH
- **Audit:** 05-service-to-service-auth.md
- **Current:** Failed outgoing webhooks are not retried
- **Fix:** Add retry queue for failed webhooks

---

## MEDIUM Issues

### GAP-QUEUE-004: Not RFC 7807 Error Format
- **Severity:** MEDIUM
- **Audit:** 03-error-handling.md
- **Current:** Custom error format
- **Fix:** Implement RFC 7807 Problem Details

### GAP-QUEUE-005: Authorization Failures Not Logged
- **Severity:** MEDIUM
- **Audit:** 01-security.md
- **Current:** `authorize()` doesn't log failures
- **Fix:** Add logging to authorization middleware

---

## All Routes Inventory

### queue.routes.ts (6 routes) - AUTH ✅
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | /queues | ✅ | List queues |
| GET | /queues/:name | ✅ | Queue details |
| GET | /queues/:name/jobs | ✅ | List jobs |
| POST | /queues/:name/pause | ✅ Admin | Pause queue |
| POST | /queues/:name/resume | ✅ Admin | Resume queue |
| POST | /queues/:name/clean | ✅ Admin | Clean queue |

### job.routes.ts (5 routes) - AUTH ✅
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | /jobs | ✅ | Add job |
| GET | /jobs/:id | ✅ | Get job |
| POST | /jobs/:id/retry | ✅ Admin | Retry job |
| DELETE | /jobs/:id | ✅ Admin | Remove job |
| POST | /jobs/:id/promote | ✅ Admin | Promote job |

### alerts.routes.ts (3 routes) - AUTH ✅
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | /alerts | ✅ | List alerts |
| POST | /alerts/:id/acknowledge | ✅ | Acknowledge |
| POST | /alerts/:id/resolve | ✅ Admin | Resolve |

### rate-limit.routes.ts (4 routes) - AUTH ✅
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | /rate-limits | ✅ | Get limits |
| POST | /rate-limits | ✅ | Create limit |
| PUT | /rate-limits/:id | ✅ | Update limit |
| DELETE | /rate-limits/:id | ✅ | Delete limit |

### metrics.routes.ts (4 routes)
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | /metrics | - | Prometheus |
| GET | /metrics/json | - | JSON metrics |
| GET | /metrics/queue-stats | - | Queue stats |
| GET | /metrics/system | - | System stats |

### health.routes.ts (3 routes)
| Method | Path | Purpose |
|--------|------|---------|
| GET | /health/live | Liveness |
| GET | /health/ready | Readiness |
| GET | /health/startup | Startup |

---

## Frontend-Related Gaps

**None identified.** This is an internal infrastructure service. The admin routes are for operations dashboards, not end-user features.

---

## Priority Order

### This Week (Security)
1. GAP-QUEUE-001: Specify JWT algorithm
2. GAP-QUEUE-002: Implement spending limits
3. GAP-QUEUE-003: Webhook retry queue

### This Month
4. GAP-QUEUE-004: RFC 7807 errors
5. GAP-QUEUE-005: Log authorization failures

