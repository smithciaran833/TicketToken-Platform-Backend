# Venue Service - 07 Idempotency Audit

**Service:** venue-service
**Document:** 07-idempotency.md
**Date:** 2025-12-22
**Auditor:** Cline
**Pass Rate:** 35% (14/40 applicable checks)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 3 | No webhook event deduplication, No idempotency on venue creation, No idempotency key storage |
| HIGH | 5 | No Stripe idempotency keys, No webhook event table, No race condition prevention, No cached response return, Missing recovery points |
| MEDIUM | 4 | No Idempotency-Key header support, No replay header, Missing cleanup jobs, No TTL config |
| LOW | 2 | No monitoring, No audit logging for replays |

---

## Payment Flow Checklist - Stripe (2/10 PASS)

### PF4: Stripe Connect operations use idempotencyKey
**Status:** FAIL
**Evidence:** stripe.accounts.create() has no idempotencyKey option.
**Remediation:** Add `idempotencyKey: 'connect:${venueId}:${Date.now()}'`

### PF5-PF10: Idempotency key storage and handling
**Status:** FAIL
**Evidence:** No idempotency key implementation.

---

## Webhook Handler Checklist (3/10 PASS)

### WH1: Signature verification happens FIRST
**Status:** PASS
**Evidence:** constructEvent() called before processing.

### WH2: webhook_events table exists with unique constraint
**Status:** FAIL
**Remediation:** Add migration for webhook_events table.

### WH3: Event ID checked for duplicates
**Status:** FAIL
**Evidence:** No event.id deduplication check before processing.
**Impact:** Duplicate webhooks cause duplicate operations.

### WH4-WH8: Processing status, async, payload storage, cleanup
**Status:** FAIL

### WH9: Failed events logged with details
**Status:** PASS

### WH10: Concurrent handling prevented
**Status:** FAIL
**Evidence:** No locking mechanism for concurrent webhook processing.

---

## Venue Operations Checklist (3/10 PASS)

### VO1-VO3: Idempotency-Key header support
**Status:** FAIL
**Evidence:** No idempotency middleware on POST routes.

### VO4: Operations are atomic
**Status:** PASS
**Evidence:** venue.service.ts uses DB transactions.

### VO5-VO7: Recovery points, resume capability, tenant scoping
**Status:** FAIL

### VO8: Concurrent attempts return 409
**Status:** PARTIAL
**Evidence:** Slug uniqueness enforced at DB level.

### VO9-VO10: Payload fingerprinting, TTL
**Status:** FAIL

---

## State-Changing Operations Checklist (6/10 PASS)

### SC1-SC5: Idempotency implementation
**Status:** FAIL
**Evidence:** No idempotency storage, checks, or middleware.

### SC8: Retryable errors allow same-key retry
**Status:** PARTIAL
**Evidence:** 5xx errors would allow retry (no idempotency to block).

---

## Critical Missing Components

1. **No Idempotency Middleware** - No extraction/validation of Idempotency-Key header
2. **No Webhook Event Table** - Can't track processed webhooks
3. **No Event Deduplication** - Processes all webhooks without checking event.id

---

## Remediation Priority

### CRITICAL (Immediate)
1. Add webhook event deduplication - Check event.id before processing
2. Add idempotencyKey to Stripe Connect operations
3. Create webhook_events table migration

### HIGH (This Week)
1. Add idempotency middleware for POST endpoints
2. Add idempotency storage in Redis with 24h TTL
3. Add concurrent request prevention with Redis SETNX
4. Cache and return original response on duplicates

### MEDIUM (This Month)
1. Add Idempotency-Key header support to API routes
2. Add X-Idempotent-Replayed response header
3. Add cleanup job for expired idempotency records
4. Configure appropriate TTLs (24h operations, 7d webhooks)

### LOW (Backlog)
1. Add idempotency monitoring
2. Add audit logging for replays
3. Add payload fingerprinting
