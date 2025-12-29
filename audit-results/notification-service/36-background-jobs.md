# Notification Service - 36 Background Jobs & Queues Audit

**Service:** notification-service  
**Document:** 36-background-jobs.md  
**Date:** 2025-12-26  
**Auditor:** Cline  
**Pass Rate:** 78% (47/60 applicable checks)

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 0 | - |
| HIGH | 2 | Campaign jobs lack idempotency, no job timeout configuration |
| MEDIUM | 4 | No DLQ handler for exhausted retries, RabbitMQ requeue loop, no graceful shutdown for cron, cron not using BullMQ |
| LOW | 7 | No progress tracking, prefetch too low, no batch limits |

## Queue Service - BullMQ (15/18)

- Queue creation with defaults - PASS (EXCELLENT)
- Retry attempts (3) - PASS
- Exponential backoff - PASS
- removeOnComplete - PASS (EXCELLENT)
- removeOnFail - PASS (EXCELLENT)
- Dead letter queue defined - PASS
- Queue events tracking - PASS (EXCELLENT)
- Completed jobs metric - PASS
- Failed jobs metric - PASS
- Stalled jobs metric - PASS
- Queue depth monitoring - PASS (EXCELLENT)
- Queue statistics API - PASS
- Job priority support - PASS
- Custom job ID support - PASS
- Graceful close - PASS
- Job timeout config - FAIL (HIGH)
- DLQ handler for exhausted - FAIL (MEDIUM)
- Job progress tracking - FAIL (LOW)

## RabbitMQ Service (10/14)

- Connection establishment - PASS
- Durable exchange - PASS
- Durable queue - PASS
- Topic-based routing - PASS (EXCELLENT)
- Connection error handling - PASS
- Auto-reconnection - PASS
- Message acknowledgment - PASS
- Message nack on error - PASS
- Persistent messages - PASS
- Connection status tracking - PASS
- Prefetch/QoS config - PARTIAL (LOW - only 1)
- Dead letter queue - FAIL (MEDIUM - requeue loop)
- Message TTL - FAIL (LOW)
- Graceful shutdown wait - PARTIAL

## Campaign Jobs (4/10)

- Job function exists - PASS
- Logging at start - PASS
- Logging at completion - PASS
- Error handling - PASS
- Idempotency checks - FAIL (HIGH)
- Progress tracking - FAIL
- Batch processing limits - FAIL (MEDIUM)
- Lock acquisition - FAIL
- Metrics tracking - FAIL
- BullMQ integration - FAIL (MEDIUM)

## Data Retention Job (6/8)

- Cron scheduling (2 AM) - PASS
- Start method - PASS
- Stop method - PASS
- Manual run support - PASS (EXCELLENT)
- Logging - PASS
- Error handling - PASS
- Graceful shutdown - FAIL (MEDIUM)
- Distributed lock - FAIL (LOW)

## Critical Evidence

### Campaign Jobs Lack Idempotency
```typescript
const campaigns = await db('notification_campaigns')
  .where('status', 'scheduled')
  .select('id');

for (const campaign of campaigns) {
  await campaignService.sendCampaign(campaign.id); // Could run twice!
}
```

### No Job Timeout
```typescript
defaultJobOptions: {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000 },
  // Missing: timeout: 30000
}
```

### RabbitMQ Infinite Requeue
```typescript
} catch (error) {
  this.channel.nack(msg, false, true); // Requeues forever
}
```

### Cron Not Using BullMQ
```typescript
// Uses node-cron instead of BullMQ repeatable jobs
cron.schedule('0 2 * * *', async () => {...});
```

## Queue Configuration

| Queue | Attempts | Backoff | Remove Complete | Remove Fail |
|-------|----------|---------|-----------------|-------------|
| notifications | 3 | exp 1s | 1000 / 24h | 5000 / 7d |
| batch | 3 | exp 1s | 1000 / 24h | 5000 / 7d |
| retry | 3 | exp 1s | 1000 / 24h | 5000 / 7d |
| dead-letter | - | - | - | - |
| webhooks | 3 | exp 1s | 1000 / 24h | 5000 / 7d |

## Remediations

### HIGH
1. Add idempotency to campaign jobs:
```typescript
const updated = await db('notification_campaigns')
  .where('id', campaign.id)
  .where('status', 'scheduled')
  .update({ status: 'processing' });
if (updated > 0) {
  await campaignService.sendCampaign(campaign.id);
}
```

2. Add job timeout:
```typescript
defaultJobOptions: {
  timeout: 30000, // 30 seconds
}
```

### MEDIUM
1. Add DLQ handler for exhausted retries
2. Configure RabbitMQ DLX:
```typescript
arguments: {
  'x-dead-letter-exchange': 'dlx.notifications',
}
```
3. Migrate cron jobs to BullMQ repeatable
4. Add graceful shutdown to data retention

### LOW
1. Increase RabbitMQ prefetch to 10-50
2. Add distributed locks for cron jobs
3. Add job progress tracking
4. Add batch limits to campaigns
5. Add metrics to campaign jobs

## Architecture
```
BullMQ/Redis              RabbitMQ              node-cron
     │                        │                     │
┌────┴────┐           External Events        ┌─────┴─────┐
│         │                                  │           │
▼         ▼                                  ▼           ▼
notifications  batch    payment.completed    campaign   data-retention
     │         │        ticket.purchased     jobs       job (2 AM)
     ▼         ▼        event.reminder
dead-letter                                  ⚠️ Should use
(needs handler)                              BullMQ repeatable
```

## Positive Highlights

- Excellent queue defaults
- Event tracking (completed/failed/stalled)
- Queue depth metrics
- Exponential backoff
- Dead letter queue defined
- Priority support
- Custom job IDs
- RabbitMQ durability
- Auto-reconnection
- Message ack/nack
- Graceful queue close
- Manual job run support
- Off-peak scheduling (2 AM)

Background Jobs Score: 78/100
