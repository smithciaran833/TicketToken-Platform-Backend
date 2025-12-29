# Marketplace Service - 23 Webhooks Audit

**Service:** marketplace-service
**Document:** 23-webhooks-outbound.md
**Date:** 2024-12-24
**Auditor:** Cline
**Pass Rate:** 60% (12/20 checks)

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 2 | Local EventEmitter only, No dead letter queue |
| HIGH | 2 | In-memory idempotency, No retry on publish |
| MEDIUM | 0 | None |
| LOW | 0 | None |

## 3.1 Outbound Event Publishing (2/6)

- OUT1: Event publisher - PASS
- OUT2: Events typed - PASS
- OUT3: Events logged - PARTIAL
- OUT4: Message queue - FAIL (local EventEmitter)
- OUT5: Retry on failure - FAIL
- OUT6: Event persistence - PARTIAL

## 3.2 Inbound Webhook Handling (5/6)

- IN1: Signature verification - PASS
- IN2: Idempotency check - PASS
- IN3: Raw body for signature - PASS
- IN4: Error handling - PASS
- IN5: Event type routing - PASS
- IN6: Webhook secret from env - PARTIAL

## 3.3 Webhook Security (3/4)

- SEC1: Signature verification - PASS
- SEC2: Secret not logged - PASS
- SEC3: Internal webhook auth - PASS
- SEC4: Rate limited - FAIL

## 3.4 Webhook Reliability (2/4)

- REL1: Quick acknowledgment - PASS
- REL2: Idempotency TTL - PASS (1 hour)
- REL3: Idempotency persistent - PARTIAL (in-memory)
- REL4: Failed webhook queue - FAIL

## Webhook Endpoints

| Endpoint | Auth | Idempotency |
|----------|------|-------------|
| POST /webhooks/stripe | Signature | In-memory |
| POST /webhooks/payment-completed | x-internal-service | None |

## Remediations

### P0: Integrate RabbitMQ
Replace local EventEmitter with RabbitMQ for cross-service events

### P0: Add Dead Letter Queue
Capture failed webhooks for retry

### P1: Move Idempotency to Redis
```
await redis.setex(webhook:processed:eventId, 3600, 'processed')
```

### P1: Add Retry on Publish
Exponential backoff with outbox pattern fallback

## Strengths

- Stripe signature verification
- Idempotency check with TTL
- Internal webhook auth header
- Quick acknowledgment pattern
- Typed event definitions

Webhooks Score: 60/100
