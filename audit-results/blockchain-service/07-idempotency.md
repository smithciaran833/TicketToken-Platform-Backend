# Blockchain Service - 07 Idempotency Audit

**Service:** blockchain-service
**Document:** 07-idempotency.md
**Date:** 2024-12-26
**Auditor:** Cline
**Pass Rate:** 15% (4/26 applicable checks)

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 5 | No API idempotency keys, Race conditions in mint, Job ID has timestamp, No tenant scoping, Non-atomic DB ops |
| HIGH | 4 | No recovery points, No error classification, No replay header, DB check without lock |
| MEDIUM | 0 | None |
| LOW | 0 | None |

## NFT Minting (2/8)

- Unique idempotency key - PARTIAL (timestamp in ID)
- Key includes ticket_id - PASS
- Tx hash stored before retry - FAIL
- Pending tx monitored - FAIL
- Failure vs timeout distinguished - FAIL
- Atomic ticket update - PARTIAL
- Duplicate returns existing - PASS

## Ticket Purchase Flow (0/9)

- Idempotency-Key header - FAIL
- Key validated - FAIL
- Duplicate returns original - FAIL
- Atomic reservation - FAIL
- Recovery points tracked - PARTIAL
- Resume from last step - FAIL
- Tenant_id in key - FAIL
- 409 on concurrent - FAIL
- 422 on payload mismatch - FAIL

## State-Changing Operations (2/9)

- POST supports idempotency - FAIL
- Persistent storage - PARTIAL
- Atomic checks - FAIL
- Replay header - FAIL
- Tenant scoped - FAIL
- Error responses not cached - PASS
- 5xx allows retry - PASS
- 4xx requires new key - FAIL
- Monitoring exists - FAIL

## Critical Evidence

### Job ID Has Timestamp
```typescript
jobId: `mint_${ticketId}_${Date.now()}` // Not idempotent!
```

### Race Condition
```typescript
const existing = await this.checkExistingMint(ticketId);
if (existing) return existing;
// Race window here
await this.updateTicketStatus(ticketId, 'RESERVED');
```

### No API Idempotency
```typescript
fastify.post('/internal/mint-tickets', {
  // No Idempotency-Key header handling
});
```

## Critical Remediations

### P0: Fix Job ID
```typescript
jobId: `mint:${tenantId}:${ticketId}` // No timestamp
```

### P0: Add Idempotency Key Middleware
```typescript
const idempotencyKey = request.headers['idempotency-key'];
const existing = await redis.get(`idempotency:${tenantId}:${idempotencyKey}`);
if (existing) {
  reply.header('X-Idempotent-Replayed', 'true');
  return reply.send(JSON.parse(existing));
}
```

### P0: Atomic Mint Check
```typescript
'SELECT * FROM tickets WHERE id = $1 FOR UPDATE SKIP LOCKED'
```

### P0: Add Tenant to Keys
```typescript
jobId: `mint:${tenantId}:${ticketId}`
```

### P1: Wrap in Transaction
```typescript
await client.query('BEGIN');
// storeTransaction + updateTicket atomically
await client.query('COMMIT');
```

## Strengths

- checkExistingMint returns existing NFT
- BullMQ retry with exponential backoff
- Only successful mints cached (is_minted=true)
- Job progress tracking exists

Idempotency Score: 15/100
