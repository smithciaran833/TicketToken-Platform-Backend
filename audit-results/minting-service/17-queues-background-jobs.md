# Minting Service - 17 Queues & Background Jobs Audit

**Service:** minting-service
**Document:** 17-queues-background-jobs.md
**Date:** 2024-12-26
**Auditor:** Cline
**Pass Rate:** 33% (12/36 checks)

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 4 | No job timeout, No deterministic ID, IPFS not idempotent, No queue shutdown |
| HIGH | 4 | No DLQ, No stalled handling, Concurrency=1, No pre-mint check |
| MEDIUM | 4 | No queue depth monitoring, No error handler, No Redis timeout, No dashboard |
| LOW | 0 | None |

## 1. Job Definition (3/7)

- Explicit attempts - PASS (3)
- Backoff strategy - PASS (exponential)
- Timeout values - FAIL
- removeOnComplete - PASS
- removeOnFail - PASS
- Priority set - FAIL
- Deterministic job ID - FAIL

## 2. Worker Configuration (0/6)

- Concurrency appropriate - FAIL (default 1)
- lockDuration configured - FAIL
- Error handler attached - FAIL
- Failed handler for DLQ - PARTIAL
- Graceful shutdown - PARTIAL
- Unhandled rejection - FAIL

## 3. Idempotency (1/4)

- Check prior completion - PARTIAL
- External API idempotency - FAIL
- Database transactions - PASS
- Duplicate same result - PARTIAL

## 4. NFT Minting Jobs (3/6)

- Pre-mint check - PARTIAL
- Wallet balance checked - PASS
- Nonce errors handled - FAIL
- No orphaned records - PASS
- IPFS idempotent - FAIL
- Network backoff - PASS

## 5. Monitoring (2/6)

- Queue depth monitored - FAIL
- Failed rate monitored - PARTIAL
- Stalled events tracked - FAIL
- Job duration tracked - PASS
- DLQ size monitored - FAIL
- Dashboard exists - FAIL

## 6. Redis Configuration (0/2)

- Redis timeout - FAIL
- Retry strategy - FAIL

## 7. Background Jobs (3/3 PASS)

- Error handling - PASS
- clearInterval on shutdown - PASS
- Alert cooldown - PASS

## Critical Remediations

### P0: Add Job Timeout
```typescript
await mintQueue.add('mint-ticket', ticketData, {
  attempts: 3,
  timeout: 300000, // 5 minutes
});
```

### P0: Add Deterministic Job ID
```typescript
await mintQueue.add('mint-ticket', ticketData, {
  jobId: `mint-${ticketData.ticketId}-${ticketData.tenantId}`,
});
```

### P0: Add Queue Cleanup to Shutdown
```typescript
process.on('SIGTERM', async () => {
  await getMintQueue().close();
  await app.close();
});
```

### P0: Add Pre-Mint Idempotency Check
```typescript
const existing = await db('nft_mints')
  .where({ ticket_id: ticketId, tenant_id: tenantId })
  .first();
if (existing?.status === 'completed') return existing;
```

### P1: Add Dead Letter Queue
```typescript
mintQueue.on('failed', async (job, err) => {
  if (job.attemptsMade >= job.opts.attempts) {
    await dlq.add('failed-mint', { ...job.data, error: err.message });
  }
});
```

### P1: Increase Worker Concurrency
```typescript
mintQueue.process('mint-ticket', 5, async (job) => {...});
```

### P1: Cache IPFS Uploads
```typescript
const cached = await redis.get(`ipfs:${ticketId}`);
if (cached) return cached;
const uri = await uploadToIPFS(metadata);
await redis.set(`ipfs:${ticketId}`, uri, 'EX', 86400);
```

## Strengths

- Exponential backoff configured
- Retry attempts = 3
- Failed jobs preserved
- Database transactions used
- Wallet balance checked
- RPC failover on rate limit
- Mint duration tracked
- Job ID in logs
- Balance monitor with cooldown
- Graceful stop for background jobs

Queues & Background Jobs Score: 33/100
