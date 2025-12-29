# Marketplace Service - 07 Idempotency Audit

**Service:** marketplace-service
**Document:** 07-idempotency.md
**Date:** 2024-12-24
**Auditor:** Cline
**Pass Rate:** 25% (5/20 checks)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 4 | No idempotency middleware, No header support, Webhook in-memory, Key type unused |
| HIGH | 2 | Incomplete duplicate check, Limited unique constraints |
| MEDIUM | 0 | None |
| LOW | 0 | None |

---

## 3.1 Idempotency Middleware (0/6)

| Check | Status | Evidence |
|-------|--------|----------|
| ID1: Middleware exists | FAIL | No idempotency.middleware.ts |
| ID2: Header parsed | FAIL | Not implemented |
| ID3: Key stored in Redis | FAIL | Not implemented |
| ID4: Response cached | FAIL | Not implemented |
| ID5: Duplicate returns cached | FAIL | Not implemented |
| ID6: Key expiration | FAIL | Not implemented |

---

## 3.2 Controller Patterns (2/6)

| Check | Status | Evidence |
|-------|--------|----------|
| CTL1: Distributed locks | PASS | withLock(lockKey, 5000) |
| CTL2: Lock key includes ID | PASS | LockKeys.listing(listingId) |
| CTL3: Lock timeout | PASS | 5000ms |
| CTL4: Duplicate check | PARTIAL | Only checks active status |
| CTL5: Idempotency key validated | FAIL | Type defined, not used |
| CTL6: DB unique constraint | PARTIAL | Only ticket_id unique |

---

## 3.3 Webhook Idempotency (3/4)

| Check | Status | Evidence |
|-------|--------|----------|
| WH1: Event ID tracked | PASS | processedEvents Set |
| WH2: Duplicate returns success | PASS | { status: 'already_processed' } |
| WH3: Event ID stored with TTL | PARTIAL | In-memory, lost on restart |
| WH4: Double processing prevented | PASS | Database status check backup |

---

## 3.4 Route Headers (0/4)

| Check | Status | Evidence |
|-------|--------|----------|
| RT1: POST accepts key | FAIL | Not implemented |
| RT2: PUT accepts key | FAIL | Not implemented |
| RT3: Key in response | FAIL | Not implemented |
| RT4: Key documented | FAIL | No documentation |

---

## Operations Requiring Idempotency

| Operation | Status | Action |
|-----------|--------|--------|
| POST /listings | ❌ | Add middleware |
| PUT /listings/:id/price | ⚠️ Lock only | Add middleware |
| POST /transfers/purchase | ❌ | CRITICAL: Add middleware |
| POST /transfers/direct | ❌ | CRITICAL: Add middleware |
| POST /stripe/webhook | ✅ | Move to Redis |

---

## Distributed Lock Usage

| Operation | Lock Key | Status |
|-----------|----------|--------|
| createListing | LockKeys.ticket | ✅ |
| updateListingPrice | LockKeys.listing | ✅ |
| cancelListing | LockKeys.listing | ✅ |
| initiateTransfer | NONE | ❌ Missing |
| completeFiatTransfer | NONE | ❌ Missing |

---

## Critical Remediations

### P0: Create Idempotency Middleware
```typescript
// src/middleware/idempotency.middleware.ts
export const idempotencyMiddleware = async (request, reply) => {
  const key = request.headers['idempotency-key'];
  if (!key) return;
  
  const cacheKey = `idempotency:${request.user.id}:${key}`;
  const cached = await redis.get(cacheKey);
  
  if (cached) {
    return reply.send(JSON.parse(cached));
  }
  
  const originalSend = reply.send.bind(reply);
  reply.send = async (data) => {
    await redis.setex(cacheKey, 86400, JSON.stringify(data));
    return originalSend(data);
  };
};
```

### P0: Move Webhook Idempotency to Redis
```typescript
// Instead of in-memory Set
const processed = await redis.exists(`webhook:${event.id}`);
if (processed) return reply.send({ received: true });

await redis.setex(`webhook:${event.id}`, 3600, 'processed');
```

### P0: Add Locks to Transfer Service
```typescript
async initiateTransfer(dto) {
  return withLock(LockKeys.transfer(dto.listingId), 5000, async () => {
    // ... transfer logic
  });
}
```

### P1: Add Unique Constraints
```sql
ALTER TABLE marketplace_transfers 
ADD CONSTRAINT unique_listing_buyer UNIQUE (listing_id, buyer_id);
```

---

## Strengths

- Distributed locking on listing operations
- Webhook duplicate detection with database backup
- Lock keys include resource IDs
- Idempotency key type already defined

Idempotency Score: 25/100
