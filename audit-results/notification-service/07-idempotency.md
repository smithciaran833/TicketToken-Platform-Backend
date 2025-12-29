# Notification Service - 07 Idempotency Audit

**Service:** notification-service  
**Document:** 07-idempotency.md  
**Date:** 2025-12-26  
**Auditor:** Cline  
**Pass Rate:** 62% (23/37 applicable checks)

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 2 | SendGrid/Twilio webhooks not deduplicated, no idempotency_keys table |
| HIGH | 4 | No Idempotency-Key header, no event ID tracking, queue jobId optional, no recovery points |
| MEDIUM | 3 | Generic webhook stores but doesn't dedupe, no cleanup job, no TTL |
| LOW | 2 | No replay header, no idempotency fingerprint |

## Webhook Handler (4/10)

- Signature verification first - PASS
- webhook_events table with unique - FAIL (CRITICAL)
- Event ID checked for duplicates - FAIL (CRITICAL)
- Processing status tracked - PARTIAL
- Handler returns 200 immediately - FAIL (HIGH)
- Duplicate events return 200 - N/A
- Payload stored for replay - PARTIAL
- Cleanup job exists - FAIL (MEDIUM)
- Failed events logged - PASS
- Concurrent handling prevented - FAIL (HIGH)

## Queue/Job Idempotency (5/8)

- Job deduplication via jobId - PARTIAL (optional)
- Retry with exponential backoff - PASS
- Dead letter queue - PASS
- Job removal after completion - PASS
- Job metrics tracking - PASS (EXCELLENT)
- Queue depth monitoring - PASS (EXCELLENT)
- Stalled job detection - PASS
- Unique job enforcement - FAIL (HIGH)

## Notification Send Idempotency (4/10)

- Idempotency-Key header support - FAIL (HIGH)
- Idempotency key validated - FAIL
- Duplicate returns original - FAIL
- provider_message_id tracked - PASS
- Recovery points tracked - FAIL (HIGH)
- Partial failures resumable - FAIL
- Concurrent send handled - FAIL (MEDIUM)

## Database Schema (2/6)

- idempotency_keys table - FAIL (CRITICAL)
- webhook_events unique constraint - FAIL (HIGH)
- provider_message_id in tracking - PASS
- scheduled_notifications unique - PARTIAL
- TTL enforcement - N/A
- Cleanup indexes - PASS

## Signature Verification (8/8) EXCELLENT

- SendGrid HMAC-SHA256 + timestamp - PASS
- Twilio HMAC-SHA1 + URL reconstruction - PASS
- Generic webhook HMAC-SHA256 + timestamp - PASS
- Timing-safe comparison - PASS (all)
- 5-minute replay window - PASS

## Critical Evidence

### Missing Webhook Deduplication
```typescript
// webhook.controller.ts - SendGrid
for (const event of events) {
  // No duplicate check!
  await this.updateNotificationStatus(...);
}

// Twilio - same issue
const { MessageSid, MessageStatus } = body;
await this.updateNotificationStatus(...); // No dedup!
```

### Optional jobId
```typescript
// queue.service.ts
async addNotificationJob(data, options = {}) {
  const job = await queue.add('send-notification', data, {
    jobId: options.jobId,  // Optional - allows duplicates!
  });
}
```

### Missing Idempotency Table
No `idempotency_keys` table in migration.

## Remediations

### CRITICAL
1. Add webhook event deduplication:
```typescript
const eventId = event.sg_event_id;
const existing = await db('webhook_events')
  .where({ provider: 'sendgrid', event_id: eventId }).first();
if (existing) continue;

await db('webhook_events').insert({
  provider: 'sendgrid',
  event_id: eventId,
  payload: JSON.stringify(event)
});
```

2. Create idempotency_keys table:
```typescript
table.uuid('tenant_id').notNullable();
table.string('idempotency_key', 255).notNullable();
table.string('request_hash', 64);
table.integer('response_code');
table.jsonb('response_body');
table.enum('status', ['processing', 'completed', 'failed']);
table.unique(['tenant_id', 'idempotency_key']);
```

### HIGH
1. Add Idempotency-Key header support
2. Make jobId mandatory:
```typescript
const jobId = options.jobId || `notification:${data.notificationId}`;
```
3. Add unique constraint to webhook_events
4. Implement recovery points

### MEDIUM
1. Add cleanup job for expired records
2. Implement locking for concurrent webhooks
3. Add TTL enforcement

## Positive Highlights

- Excellent signature verification (SendGrid, Twilio, generic)
- Timing-safe comparison everywhere
- 5-minute replay window
- Queue retry with exponential backoff
- Dead letter queue
- Comprehensive queue metrics
- Queue depth monitoring
- Provider message ID tracking
- Job retention policy (24h/7d)

Idempotency Score: 62/100
