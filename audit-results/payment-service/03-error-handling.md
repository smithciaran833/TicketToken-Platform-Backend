# Payment Service - 03 Error Handling Audit

**Service:** payment-service
**Document:** 03-error-handling.md
**Date:** 2025-12-23
**Auditor:** Cline
**Pass Rate:** 45% (26/58 checks)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 1 | Webhook returns 500 on error (Stripe retries indefinitely) |
| HIGH | 3 | Non-RFC 7807 format, notFoundHandler not registered, No Stripe error categorization |
| MEDIUM | 2 | No correlation ID in responses, No circuit breaker |
| LOW | 2 | No PostgreSQL error code handling, Fixed retry interval |

---

## 3.1 Route Handlers (5/9)

| Check | Status | Evidence |
|-------|--------|----------|
| RH1: Global error handler | PASS | app.setErrorHandler() |
| RH2: Handler before routes | PARTIAL | Registered after routes |
| RH3: notFoundHandler | FAIL | Defined but NOT registered |
| RH4: Validation errors consistent | PASS | Handles error.validation |
| RH5: RFC 7807 format | FAIL | Returns {error, code} not RFC 7807 |
| RH6: Correlation ID | FAIL | Not in error responses |
| RH7: No stack in prod | PASS | Development guard |
| RH8: Async/await | PASS | All handlers async |
| RH9: No floating promises | PASS | None found |

---

## 3.2 Service Layer (2/8)

| Check | Status | Evidence |
|-------|--------|----------|
| SL1: try/catch on public methods | FAIL | No try/catch around Stripe |
| SL2: Errors include context | PARTIAL | Logs IDs, errors lack context |
| SL3: No empty catch | PASS | None found |
| SL4: Domain errors extend AppError | PARTIAL | AppError exists, not used consistently |
| SL5: Error codes documented | PARTIAL | Some codes, no enum |
| SL6: No sensitive data in errors | PASS | No PII |
| SL7: External errors wrapped | FAIL | Stripe errors not wrapped |
| SL8: Timeouts configured | PARTIAL | DB yes, HTTP no |

---

## 3.3 Database (6/9)

| Check | Status | Evidence |
|-------|--------|----------|
| DB1: Queries in try/catch | PARTIAL | Webhook yes, payment no |
| DB2: Transactions for multi-ops | PASS | db.transaction() |
| DB3: Rollback on error | PASS | trx.rollback() |
| DB4: Pool errors handled | PASS | pool.on('error') |
| DB5: DB errors not exposed | PASS | Sanitized |
| DB6: Unique violation → 409 | FAIL | No PG error handling |
| DB7: FK violation → 422 | FAIL | No PG error handling |
| DB8: Query timeouts | PASS | 5000ms |
| DB9: Pool error handler | PASS | Configured |

---

## 3.4 Stripe Integration (4/8)

| Check | Status | Evidence |
|-------|--------|----------|
| ST1: Webhook signature verified | PASS | constructEvent() |
| ST2: Webhook returns 200 on error | FAIL | Returns 500! |
| ST3: Idempotency keys | PASS | idempotencyKey passed |
| ST4: Stripe errors categorized | FAIL | No type handling |
| ST5: Rate limit handling | FAIL | No backoff |
| ST6: Webhook deduplicated | PASS | Redis dedup |
| ST7: Card decline messages | FAIL | Raw errors |
| ST8: API version locked | PASS | 2023-10-16 |

---

## 3.5 Distributed Systems (1/9)

| Check | Status | Evidence |
|-------|--------|----------|
| DS1: Correlation ID generated | PARTIAL | Extracts or generates |
| DS2: Correlation ID propagated | FAIL | Not in HTTP calls |
| DS3: Correlation ID in logs | PARTIAL | Not explicit |
| DS4: Circuit breaker | FAIL | Not implemented |
| DS5: Inter-service timeouts | FAIL | Not configured |
| DS6: Retry with backoff | PASS | DB has backoff |
| DS7: Dead letter queue | PARTIAL | webhook_inbox, no DLQ |
| DS8: Source service in errors | FAIL | Not included |
| DS10: Graceful degradation | FAIL | No fallbacks |

---

## 3.6 Background Jobs (2/9)

| Check | Status | Evidence |
|-------|--------|----------|
| BJ1: Error event listener | PARTIAL | try/catch per job |
| BJ2: Retry configuration | PASS | attempts tracked |
| BJ3: Max retries | FAIL | No limit |
| BJ4: Exponential backoff | FAIL | Fixed 5-second interval |
| BJ5: Dead letter queue | FAIL | No DLQ |
| BJ6: Stalled detection | FAIL | Not implemented |
| BJ8: Cleanup | PARTIAL | processed_at set |
| BJ9: Correlation ID | FAIL | Not in webhook_inbox |
| BJ10: Errors not swallowed | PASS | Logged and recorded |

---

## 3.7 Process-Level (6/6 PASS)

| Check | Status | Evidence |
|-------|--------|----------|
| PL1: unhandledRejection | PASS | index.ts:79-82 |
| PL2: uncaughtException | PASS | index.ts:74-77 |
| PL3: SIGTERM | PASS | index.ts:72 |
| PL4: SIGINT | PASS | index.ts:73 |
| PL5: Graceful shutdown | PASS | Closes server, DB, Redis |
| PL6: Force timeout | PASS | 30 seconds |

---

## Strengths

- Process-level error handlers complete
- Graceful shutdown with force timeout
- Database pool error handler
- Connection retry with exponential backoff
- Transaction rollback on error
- Webhook signature verification
- Webhook idempotency via Redis
- Stripe API version locked
- Stack traces hidden in production
- Idempotency keys for Stripe

---

## Remediation Priority

### CRITICAL (Immediate)
1. **Webhook must return 200:**
```typescript
} catch (err) {
  log.error('Webhook processing failed', {...});
  await webhookRetryQueue.add('retry', { event });
  return reply.status(200).send({ received: true, queued: true });
}
```

### HIGH (This Week)
1. Register notFoundHandler:
```typescript
app.setNotFoundHandler(notFoundHandler);
```

2. Implement RFC 7807 error format
3. Add Stripe error categorization:
```typescript
if (error instanceof Stripe.errors.StripeCardError) {
  throw new PaymentError(error.message, { code: 'CARD_DECLINED' });
}
```

### MEDIUM (This Month)
1. Add correlation ID to error responses
2. Implement circuit breaker for Stripe

### LOW (Backlog)
1. Add PostgreSQL error code handling (23505 → 409)
2. Use exponential backoff for webhook retry
