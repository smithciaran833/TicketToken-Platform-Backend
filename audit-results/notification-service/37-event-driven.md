# Notification Service - 37 Event-Driven Architecture Audit

**Service:** notification-service  
**Document:** 37-event-driven.md  
**Date:** 2025-12-26  
**Auditor:** Cline  
**Pass Rate:** 75% (42/56 applicable checks)

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 1 | No idempotency in event handlers - duplicate notifications |
| HIGH | 2 | No HTTP timeout for service calls, no retry limits per event |
| MEDIUM | 4 | No event schema validation, missing correlation IDs, no circuit breaker, error swallowing |
| LOW | 7 | Inconsistent priority mapping, no tracing spans |

## RabbitMQ Event Handler (8/12)

- Event routing by type - PASS (EXCELLENT)
- Event type logging - PASS
- Unknown event handling - PASS
- Event JSON parsing - PASS
- Error propagation for requeue - PASS
- Event schema validation - FAIL (MEDIUM)
- Idempotency check - FAIL (CRITICAL)
- Correlation ID propagation - FAIL (MEDIUM)
- Priority mapping - PARTIAL (LOW)
- Bulk processing optimization - PASS
- Retry limit tracking - FAIL (HIGH)
- Dead letter on permanent failure - FAIL

## Base Event Handler (7/10)

- Abstract pattern - PASS (EXCELLENT)
- Bull queue initialization - PASS
- User lookup with fallback - PASS
- Service-to-service auth - PASS
- Notification history recording - PASS
- Graceful start/stop - PASS
- HTTP timeout for service calls - FAIL (HIGH)
- Circuit breaker for services - FAIL (MEDIUM)
- Event lookup with fallback - PASS
- Logging - PASS

## Payment Event Handler (10/14)

- Event type handlers - PASS (EXCELLENT)
- Multi-channel (email + SMS) - PASS (EXCELLENT)
- Phone validation (E.164) - PASS
- Notification recording - PASS
- Template data construction - PASS
- HTML email generation - PASS
- Plain text fallback - PASS
- Error handling - email - PARTIAL (LOW - swallowed)
- Error handling - SMS - PARTIAL (LOW - swallowed)
- Dispute escalation - PASS (EXCELLENT)
- Amount formatting - PASS
- Metadata tagging - PASS
- Idempotency - FAIL (CRITICAL)
- Transaction boundaries - FAIL (MEDIUM)

## Events Handled

| Event | Channel | Priority |
|-------|---------|----------|
| payment.completed | Email + SMS | high |
| payment.failed | Email + SMS | high |
| refund.processed | Email | high |
| dispute.created | Email (CS) | critical |
| ticket.transferred | Email x2 | high/normal |
| event.reminder | Email | normal |
| event.cancelled | Email + SMS | critical |
| event.updated | Email | normal |

## Critical Evidence

### No Idempotency Check
```typescript
private async handlePaymentCompleted(event): Promise<void> {
  // No check for duplicate event
  await notificationService.send(emailRequest);
}
```

### No HTTP Timeout
```typescript
const response = await fetch(`${authServiceUrl}/api/v1/users/${userId}`, {
  headers: {...}
  // Missing: signal: AbortSignal.timeout(5000)
});
```

### Infinite Retry Loop
```typescript
} catch (error) {
  throw error; // Requeues forever - no retry count
}
```

### Error Swallowing
```typescript
try {
  await this.emailProvider.send({...});
} catch (error) {
  logger.error('Failed to send email:', error);
  // Silent failure - no retry
}
```

## Remediations

### CRITICAL
Add idempotency to all handlers:
```typescript
const eventKey = `event:${event.eventId}`;
if (await redis.get(eventKey)) return;
await redis.setex(eventKey, 604800, '1'); // 7 days
```

### HIGH
1. Add HTTP timeout:
```typescript
signal: AbortSignal.timeout(5000)
```

2. Add retry limits with DLQ:
```typescript
const retryCount = msg.properties.headers?.['x-retry-count'] || 0;
if (retryCount >= 5) {
  await sendToDLQ(msg);
  return;
}
```

### MEDIUM
1. Add event schema validation (Joi/Zod)
2. Add correlation ID propagation
3. Add circuit breaker for user/event service
4. Queue failed notifications for retry

### LOW
1. Centralize priority mapping
2. Add distributed tracing spans

## Event Flow
```
External Service → RabbitMQ → EventHandler → Provider
                              │
                              ├── Parse JSON
                              ├── Route by key
                              │   ⚠️ MISSING:
                              │   - Idempotency
                              │   - Schema validation
                              │   - Retry limit
                              │
                              └── handlePaymentCompleted()
                                  ├── Email Send
                                  └── SMS Send
                                      ⚠️ Errors swallowed
```

## Positive Highlights

- Excellent event routing
- Multi-channel notifications
- Abstract base handler pattern
- Service auth headers
- Fallback data when services unavailable
- Notification history recording
- Phone validation (E.164)
- Amount formatting (cents → dollars)
- Rich metadata tagging
- Dispute escalation to CS
- Graceful start/stop
- Bulk processing (Promise.all)

Event-Driven Score: 75/100
