# Minting Service - 07 Idempotency Audit

**Service:** minting-service
**Document:** 07-idempotency.md
**Date:** 2024-12-24
**Auditor:** Cline
**Pass Rate:** 31% (16/52 applicable checks)

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 6 | NFT can duplicate on retry, No distributed lock, No idempotency key, Webhook not deduplicated, Queue jobs not deduplicated, Batch not atomic |
| HIGH | 2 | No status check before mint, No RETURNING clause |
| MEDIUM | 0 | None |
| LOW | 0 | None |

## 3.1 Idempotency Key (0/7)

- IK1-5: All FAIL - No idempotency key system
- IK6: Natural key - PARTIAL (ticket_id+tenant_id unique)
- IK7: In-progress blocking - FAIL

## 3.2 Database Upsert (5/6)

- UP1: ON CONFLICT DO UPDATE - PASS
- UP2: Unique constraint - PASS
- UP3: Update necessary fields - PASS
- UP4: updated_at on conflict - PASS
- UP5: RETURNING clause - FAIL
- UP6: Upsert in transaction - PASS

## 3.3 Queue Job (2/7)

- QJ1: Deterministic job ID - FAIL
- QJ2: Job deduplication - FAIL
- QJ3: Idempotency key in data - FAIL
- QJ4: Retry no duplicate - PARTIAL
- QJ5: Failed jobs marked - PASS
- QJ6: Completed jobs tracked - PASS
- QJ7: Job result cached - FAIL

## 3.4 Webhook (0/6)

- WI1-6: All FAIL - No webhook idempotency

## 3.5 NFT Minting (3/8)

- NM1: Check before mint - PARTIAL
- NM2: Status tracked - PASS
- NM3: Status checked - FAIL
- NM4: In-progress blocks - FAIL
- NM5: Return existing - FAIL
- NM6: Signature stored - PASS
- NM7: Asset ID stored - PASS
- NM8: Partial failure - PARTIAL

## 3.6 API Endpoint (2/5)

- AE1: POST idempotent - PARTIAL
- AE2: Batch atomic - FAIL
- AE3: Partial status - PASS
- AE4: Documented - FAIL
- AE5: GET idempotent - PASS

## 3.7 Distributed Lock (0/6)

- DL1-6: All FAIL - No locking implemented

## 3.8 Retry Safety (4/6)

- RS1: Exponential backoff - PASS
- RS2: Max retry count - PASS (3)
- RS3: Retry count tracked - PASS
- RS4: Retried ops idempotent - FAIL
- RS5: Errors distinguished - PASS
- RS6: Non-retryable fail fast - PARTIAL

## Critical Remediations

### P0: Check Existing Before Mint
```typescript
async mintCompressedNFT(ticketData) {
  const existing = await this.findExistingMint(ticketData.ticketId);
  if (existing?.status === 'completed') {
    return { success: true, ...existing };
  }
  if (existing?.status === 'minting') {
    throw new Error('Mint already in progress');
  }
  // Then proceed with mint
}
```

### P0: Add Distributed Locking
```typescript
const lockKey = `mint:${tenantId}:${ticketId}`;
const lock = await redlock.acquire([lockKey], 30000);
try {
  // mint operation
} finally {
  await lock.release();
}
```

### P0: Use Deterministic Job IDs
```typescript
const jobId = `mint:${tenantId}:${ticketId}`;
await mintQueue.add('mint-ticket', ticketData, { jobId });
```

### P0: Add Webhook Deduplication
```typescript
const eventId = request.body.id;
const processed = await redis.get(`webhook:${eventId}`);
if (processed) return reply.send({ status: 'already_processed' });
await redis.setex(`webhook:${eventId}`, 86400, 'processed');
```

### P1: Add Idempotency Key Middleware
Store and check request results by X-Idempotency-Key header

## Strengths

- Upsert pattern prevents duplicate DB records
- Unique constraint on ticket_id + tenant_id
- Retry count tracking
- Status column for mint state
- Transaction signature stored
- Exponential backoff on retries
- Max retry limit (3)
- Error categorization

Idempotency Score: 31/100
