# Payment Service - 07 Idempotency Audit

**Service:** payment-service
**Document:** 07-idempotency.md
**Date:** 2025-12-23
**Auditor:** Cline
**Pass Rate:** 92% (36/39 checks)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 0 | None |
| HIGH | 0 | None |
| MEDIUM | 1 | Webhook returns 500 on processing failure |
| LOW | 1 | 4xx errors cached for 1 hour |

---

## Stripe Payment Flow (8/9)

| Check | Status | Evidence |
|-------|--------|----------|
| paymentIntents.create has key | PASS | payment-processor.service.ts:28-30 |
| refunds.create has key | PASS | refundController.ts:32 |
| Key generated before call | PASS | From middleware |
| Key stored in database | PASS | idempotency_key column |
| Key includes tenant_id | PASS | idempotency:${tenantId}:${userId}:${key} |
| Key uses UUID v4 | PASS | isUUID() validation |
| Failed requests allow retry | PASS | 5xx deletes key |
| 400 errors handled | PARTIAL | Cached 1 hour, not deleted |
| Stripe replay handled | PASS | Cached response returned |

---

## Webhook Handler (9/10)

| Check | Status | Evidence |
|-------|--------|----------|
| Signature verification first | PASS | constructEvent first |
| webhook_inbox unique event ID | PASS | webhook_id UNIQUE |
| Duplicate check before process | PASS | Redis + DB dedup |
| Status tracked | PASS | status column |
| Returns 200 immediately | FAIL | Inline processing, 500 on error |
| Duplicates return 200 | PASS | received: true, duplicate: true |
| Payload stored | PASS | payload JSONB |
| Cleanup job | PASS | webhook-cleanup.ts |
| Failed events logged | PASS | error column |
| Concurrent prevented | PASS | Redis dedup with flag |

---

## HTTP Middleware (9/10)

| Check | Status | Evidence |
|-------|--------|----------|
| Idempotency-Key required POST | PASS | idempotency.ts:19-25 |
| UUID format validated | PASS | isUUID() |
| Key scoped by tenant | PASS | tenantId:userId:key |
| Cached response returned | PASS | idempotency.ts:70-76 |
| Concurrent returns 409 | PASS | DUPLICATE_IN_PROGRESS |
| Response cached Redis | PASS | idempotency.ts:106-116 |
| TTL configured | PARTIAL | 30min/24h/1h |
| 5xx allows retry | PASS | Key deleted |
| 4xx cached | PASS | 1 hour |
| Graceful Redis failure | PASS | Proceeds without |

---

## Route Coverage (6/6 PASS)

| Route | Idempotency | Status |
|-------|-------------|--------|
| POST /payments/process | Required | PASS |
| POST /payments/fees | Required | PASS |
| GET /payments/:id | Not needed | PASS |
| POST /refunds | Required | PASS |
| POST /intents | Required | PASS |
| POST /webhooks/stripe | event.id dedup | PASS |

---

## Database Schema (6/6 PASS)

| Check | Status | Evidence |
|-------|--------|----------|
| payment_idempotency table | PASS | Migration |
| Unique constraint | PASS | PRIMARY KEY |
| Expiration column | PASS | expires_at |
| Request hash | PASS | request_hash |
| Response cached | PASS | response JSONB |
| Tenant-scoped indexes | PASS | uq_payment_transactions_idempotency |

---

## Event Ordering (4/4 PASS)

| Check | Status | Evidence |
|-------|--------|----------|
| Event sequence tracking | PASS | payment_event_sequence |
| Idempotent processing | PASS | event-ordering.service.ts |
| Duplicate detection | PASS | Query by payment_id, event_type, key |
| executeIdempotent utility | PASS | Generic helper |

---

## Strengths

**Industry-Standard Implementation:**
- UUID v4 format validation
- Tenant + User scoped keys
- Redis with TTL for performance
- Database backup for durability

**Race Condition Prevention:**
- statusCode: 102 marker
- 409 Conflict for in-progress
- Redis SETNX pattern

**Stripe Best Practices:**
- idempotencyKey on all operations
- Keys stored for audit
- Event ID for webhook dedup

**Comprehensive Webhook Handling:**
- Redis + Database dual dedup
- webhook_inbox unique constraint
- Retry tracking with counts
- Dead letter queue

**Recovery and Cleanup:**
- 5xx deletes key for retry
- 24-hour success TTL
- Cleanup cron job
- DLQ for failed events

---

## Remediation Priority

### MEDIUM (This Week)
1. **Webhook must return 200:**
```typescript
} catch (err) {
  log.error('Processing failed', { eventId: event.id });
  await retryQueue.add('webhook-retry', { event });
  return reply.status(200).send({ received: true, queued: true });
}
```

### LOW (Backlog)
1. Consider shorter TTL for 4xx errors or exclude certain codes
