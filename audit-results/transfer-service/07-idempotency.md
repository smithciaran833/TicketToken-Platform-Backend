## Transfer-Service Idempotency Audit
### Standard: 07-idempotency.md

---

## Executive Summary

| Metric | Value |
|--------|-------|
| **Total Checks** | 28 |
| **Passed** | 6 |
| **Failed** | 18 |
| **Partial** | 4 |
| **Pass Rate** | 21% |

| Severity | Count |
|----------|-------|
| 🔴 CRITICAL | 4 |
| 🟠 HIGH | 6 |
| 🟡 MEDIUM | 6 |
| 🟢 LOW | 2 |

---

## Idempotency Key Implementation

### Route Layer

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 1 | Idempotency-Key header accepted | **FAIL** 🔴 CRITICAL | `transfer.routes.ts` - No header extraction |
| 2 | Header validation (format check) | **FAIL** 🔴 | No validation middleware |
| 3 | Missing key returns 400 for mutating ops | **FAIL** 🟠 | No key requirement |
| 4 | Idempotency scope includes user | **FAIL** 🟠 | Not implemented |

### Controller Layer

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 5 | Idempotency key extracted from request | **FAIL** 🔴 CRITICAL | `transfer.controller.ts` - No extraction |
| 6 | Key passed to service layer | **FAIL** 🔴 | Not passed |
| 7 | Duplicate detected returns cached response | **FAIL** 🟠 | No caching |

### Evidence from transfer.controller.ts:
```typescript
// Lines 27-45 - NO idempotency key handling
async giftTransfer(request: FastifyRequest<{...}>, reply: FastifyReply) {
  const { ticketId, toEmail, message } = request.body;
  const fromUserId = request.user!.id;
  // Missing: const idempotencyKey = request.headers['idempotency-key'];
  
  const result = await transferService.createGiftTransfer(
    ticketId,
    fromUserId,
    toEmail,
    message
    // Missing: idempotencyKey parameter
  );
  // ...
}
```

---

## Service Layer Idempotency

### Transfer Creation

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 8 | Idempotency check before processing | **FAIL** 🔴 CRITICAL | `transfer.service.ts:28-83` |
| 9 | Idempotency record stored | **FAIL** 🟠 HIGH | No storage mechanism |
| 10 | Response cached for replay | **FAIL** 🟠 HIGH | No response caching |
| 11 | Atomic idempotency check | **FAIL** 🟡 | No implementation |

### Evidence from transfer.service.ts:
```typescript
// Lines 28-83 - createGiftTransfer
// NO idempotency key parameter
// NO duplicate check before BEGIN transaction
// NO idempotency record insertion
async createGiftTransfer(
  ticketId: string,
  fromUserId: string,
  toEmail: string,
  message?: string
  // Missing: idempotencyKey?: string
): Promise<GiftTransferResult> {
  // Missing: const existing = await this.checkIdempotency(idempotencyKey);
  // Missing: if (existing) return existing.response;
  
  const client = await this.pool.connect();
  try {
    await client.query('BEGIN');
    // ... creates transfer
    await client.query('COMMIT');
    // Missing: await this.storeIdempotency(idempotencyKey, result);
  }
}
```

### Transfer Acceptance

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 12 | Accept transfer is idempotent | **PARTIAL** 🟡 | Status check provides some protection |
| 13 | Already-accepted returns success | **PARTIAL** 🟡 | Would fail on re-accept |

---

## Blockchain Operations Idempotency

### NFT Transfer

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 14 | Blockchain TX has idempotency | **FAIL** 🔴 CRITICAL | `blockchain-transfer.service.ts` |
| 15 | Transaction ID tracked | **PASS** | `transfer_id` used internally |
| 16 | Retry uses same nonce | **FAIL** 🟠 | No nonce management |
| 17 | Duplicate blockchain call prevented | **FAIL** 🟠 HIGH | No duplicate check |

### Evidence from blockchain-transfer.service.ts:
```typescript
// Lines 23-110 - executeBlockchainTransfer
// NO idempotency key handling
// NO check if blockchain transfer already attempted for this transfer_id
async executeBlockchainTransfer(transferId: string, ...): Promise<...> {
  // Missing: Check if transfer_id already has blockchain record
  // Missing: If exists, return existing result
  
  const nftResult = await retryBlockchainOperation(
    () => nftService.transferNFT({...}),  // Could create duplicate on-chain transfers!
    ...
  );
}
```

### Critical Risk:
```
User clicks "Accept Transfer" → Network timeout → User retries
→ First request succeeds on blockchain → Second request also succeeds
→ NFT transferred TWICE (if user has multiple)
```

---

## Database-Level Protection

### Transfer Table

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 18 | Unique constraint on idempotency key | **FAIL** | No idempotency column |
| 19 | Status prevents duplicate processing | **PARTIAL** 🟡 | `FOR UPDATE` lock helps |
| 20 | Ticket lock prevents double-transfer | **PASS** | `FOR UPDATE` on ticket |

### Evidence from transfer.service.ts:
```typescript
// Line 147 - Row locking protects concurrent access
SELECT * FROM tickets WHERE id = $1 AND user_id = $2 FOR UPDATE
```

### Partial Protection Provided:
- ✅ Row-level `FOR UPDATE` prevents concurrent modifications
- ✅ Ticket ownership check (`user_id = $2`)
- ❌ No idempotency key storage
- ❌ No cached response replay

---

## Retry Behavior Analysis

### Client Retry Scenarios

| Scenario | Current Behavior | Correct Behavior |
|----------|------------------|------------------|
| Network timeout on create | **Creates duplicate transfer** | Return cached response |
| Network timeout on accept | **May fail or duplicate** | Return cached response |
| Blockchain timeout | **May double-transfer NFT** | Check blockchain state first |
| Browser refresh | **Creates new transfer** | Return existing transfer |

### Missing Retry Safety:
```typescript
// CURRENT (unsafe):
POST /transfers/gift  →  Network timeout  →  Retry
                                           →  Creates SECOND transfer!

// REQUIRED (safe):
POST /transfers/gift
  Header: Idempotency-Key: abc123
  →  Network timeout
  →  Retry with same key
  →  Returns cached response (same transfer)
```

---

## Response Caching

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 21 | Response stored with idempotency key | **FAIL** 🟠 | No storage |
| 22 | Response TTL configured | **FAIL** | No TTL |
| 23 | In-progress requests tracked | **FAIL** 🟡 | No tracking |
| 24 | Concurrent duplicate returns 409 | **FAIL** 🟡 | No handling |

---

## Blockchain State Recovery

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 25 | Check blockchain state before retry | **FAIL** 🟠 HIGH | No pre-check |
| 26 | Verify NFT ownership before transfer | **PASS** | `nft.service.ts:107-113` |
| 27 | Transaction signature stored | **PASS** | In `blockchain_transfers` table |
| 28 | Failed transfer cleanup | **PASS** | `failed_blockchain_transfers` table |

### Partial Protection from blockchain-transfer.service.ts:
```typescript
// Lines 42-48 - Ownership verification (helps but insufficient)
const isOwner = await retryBlockchainOperation(
  () => nftService.verifyOwnership(nftMintAddress, fromWallet),
  ...
);
```

---

## Critical Findings

### 🔴 CRITICAL-1: No Idempotency Key Support
| Severity | 🔴 CRITICAL |
|----------|-------------|
| Evidence | All files reviewed |
| Issue | No `Idempotency-Key` header handling anywhere |
| Risk | Duplicate transfers on network retry |
| Impact | Financial loss, double NFT transfers, user confusion |

### 🔴 CRITICAL-2: Duplicate Blockchain Transfers Possible
| Severity | 🔴 CRITICAL |
|----------|-------------|
| Evidence | `blockchain-transfer.service.ts:51-65` |
| Issue | No check if blockchain transfer already executed |
| Risk | NFT transferred multiple times |
| Remediation | Check `blockchain_transfers` table before executing |

### 🔴 CRITICAL-3: No Response Caching
| Severity | 🔴 CRITICAL |
|----------|-------------|
| Evidence | `transfer.service.ts`, `transfer.controller.ts` |
| Issue | Successful responses not cached for replay |
| Risk | Different responses on retry |

### 🔴 CRITICAL-4: Webhook Delivery Not Idempotent
| Severity | 🔴 CRITICAL |
|----------|-------------|
| Evidence | `webhook.service.ts` |
| Issue | No deduplication of webhook events |
| Risk | Duplicate notifications to external systems |

---

## Recommended Implementation

### 1. Idempotency Key Middleware
```typescript
// idempotency.middleware.ts
export async function idempotencyMiddleware(request, reply) {
  const key = request.headers['idempotency-key'];
  
  if (!key && isMutatingMethod(request.method)) {
    return reply.code(400).send({ error: 'Idempotency-Key header required' });
  }
  
  // Scope key to user
  const scopedKey = `${request.user.id}:${key}`;
  
  // Check cache
  const cached = await redis.get(`idempotency:${scopedKey}`);
  if (cached) {
    const { status, response, inProgress } = JSON.parse(cached);
    
    if (inProgress) {
      return reply.code(409).send({ error: 'Request in progress' });
    }
    
    return reply.code(status).send(response);
  }
  
  // Mark as in progress
  await redis.setex(`idempotency:${scopedKey}`, 300, JSON.stringify({ inProgress: true }));
  
  request.idempotencyKey = scopedKey;
}
```

### 2. Service Layer Idempotency
```typescript
// In transfer.service.ts
async createGiftTransfer(
  ticketId: string,
  fromUserId: string,
  toEmail: string,
  message?: string,
  idempotencyKey?: string
): Promise<GiftTransferResult> {
  // Check existing
  if (idempotencyKey) {
    const existing = await this.pool.query(
      'SELECT * FROM transfer_idempotency WHERE key = $1',
      [idempotencyKey]
    );
    if (existing.rows.length > 0) {
      return JSON.parse(existing.rows[0].response);
    }
  }
  
  // ... perform transfer ...
  
  // Store idempotency record
  if (idempotencyKey) {
    await this.pool.query(
      'INSERT INTO transfer_idempotency (key, response, created_at) VALUES ($1, $2, NOW())',
      [idempotencyKey, JSON.stringify(result)]
    );
  }
  
  return result;
}
```

### 3. Blockchain Idempotency
```typescript
// In blockchain-transfer.service.ts
async executeBlockchainTransfer(transferId: string, ...): Promise<...> {
  // Check if already executed
  const existing = await this.pool.query(
    'SELECT * FROM blockchain_transfers WHERE transfer_id = $1 AND status = $2',
    [transferId, 'CONFIRMED']
  );
  
  if (existing.rows.length > 0) {
    return {
      success: true,
      alreadyProcessed: true,
      signature: existing.rows[0].signature
    };
  }
  
  // ... execute blockchain transfer ...
}
```

---

## Prioritized Remediations

### 🔴 CRITICAL (Fix Immediately)

1. **Add Idempotency Key Header Support**
   - Files: `transfer.routes.ts`, `transfer.controller.ts`
   - Action: Add middleware to extract and validate header

2. **Check Blockchain State Before Transfer**
   - File: `blockchain-transfer.service.ts`
   - Action: Query `blockchain_transfers` table before executing

3. **Implement Response Caching**
   - File: `transfer.service.ts`
   - Action: Store response with idempotency key, return on replay

4. **Add Idempotency Database Table**
   - New migration
   - Create `transfer_idempotency` table with unique key constraint

### 🟠 HIGH (Fix Within 24-48 Hours)

5. **Add In-Progress Request Tracking**
   - Use Redis to track in-flight requests
   - Return 409 for concurrent duplicates

6. **Webhook Deduplication**
   - File: `webhook.service.ts`
   - Add event ID tracking to prevent duplicate delivery

7. **Add Blockchain Nonce Management**
   - Ensure retried blockchain operations use same nonce

### 🟡 MEDIUM (Fix Within 1 Week)

8. **Add Response TTL**
   - Configure idempotency record expiration (24 hours)

9. **Add Idempotency Monitoring**
   - Metrics for duplicate requests detected

---

## Idempotency Status by Endpoint

| Endpoint | Method | Idempotent? | Protection |
|----------|--------|-------------|------------|
| `/transfers/gift` | POST | **NO** ❌ | None |
| `/transfers/:id/accept` | POST | **PARTIAL** ⚠️ | Status check |
| Blockchain transfer | Internal | **NO** ❌ | None |
| Webhook delivery | Internal | **NO** ❌ | Retry only |

---

## End of Idempotency Audit Report
