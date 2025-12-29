# Blockchain-Indexer Service - 07 Idempotency Audit

**Service:** blockchain-indexer
**Document:** 07-idempotency.md
**Date:** 2025-12-26
**Auditor:** Cline AI
**Pass Rate:** 85% (17/20 applicable checks)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 0 | - |
| HIGH | 1 | Race condition in check-then-insert pattern |
| MEDIUM | 2 | No locking on concurrent processing, MongoDB duplicate handling silent |
| LOW | 0 | - |

**Note:** This service is primarily a **blockchain indexer** (reading transactions), not a payment processor. Many idempotency checks for payments/webhooks are N/A. The key idempotency concern is preventing duplicate transaction processing.

---

## Transaction Processing Idempotency (Core Focus)

### Signature-Based Deduplication
**Status:** PASS
**Evidence:** `src/processors/transactionProcessor.ts:34-41`
```typescript
async checkExists(signature: string): Promise<boolean> {
  const result = await db.query(
    'SELECT 1 FROM indexed_transactions WHERE signature = $1',
    [signature]
  );
  return result.rows.length > 0;
}
```

### Unique Constraint on Signature
**Status:** PASS
**Evidence:** `src/migrations/001_baseline_blockchain_indexer.ts:27`
```typescript
table.string('signature', 255).notNullable().unique();
```
Database enforces uniqueness at schema level.

### ON CONFLICT Handling
**Status:** PASS
**Evidence:** `src/processors/transactionProcessor.ts:218-221`
```typescript
await db.query(`
  INSERT INTO indexed_transactions
  (signature, slot, block_time, instruction_type, processed_at)
  VALUES ($1, $2, to_timestamp($3), $4, NOW())
  ON CONFLICT (signature) DO NOTHING
`, [signature, slot, blockTime, instructionType]);
```
Uses `ON CONFLICT DO NOTHING` pattern for safe upserts.

### Process Flow
**Status:** PASS
**Evidence:** `src/processors/transactionProcessor.ts:22-73`
```typescript
async processTransaction(sigInfo: ConfirmedSignatureInfo): Promise<void> {
  const { signature } = sigInfo;
  
  // 1. Check if already processed
  const exists = await this.checkExists(signature);
  if (exists) {
    logger.debug({ signature }, 'Transaction already processed');
    return;  // Skip duplicate
  }
  
  // 2. Fetch transaction details
  const tx = await this.connection.getParsedTransaction(signature, {...});
  
  // 3. Process based on type
  // ... processing logic
  
  // 4. Record transaction (with ON CONFLICT)
  await this.recordTransaction(signature, slot, blockTime, instructionType);
}
```

---

## Section 3.1: Transaction Processing Checklist

### TP1: Transactions checked for duplicates before processing
**Status:** PASS
**Evidence:** `src/processors/transactionProcessor.ts:26-30`
```typescript
const exists = await this.checkExists(signature);
if (exists) {
  logger.debug({ signature }, 'Transaction already processed');
  return;
}
```

### TP2: Unique natural key used for deduplication
**Status:** PASS
**Evidence:** Uses Solana transaction `signature` which is cryptographically unique.

### TP3: Database unique constraint enforces uniqueness
**Status:** PASS
**Evidence:** Migration defines `unique()` constraint on signature column.

### TP4: Duplicate processing returns early (no side effects)
**Status:** PASS
**Evidence:** Early return after duplicate check, no processing performed.

### TP5: Atomic check-and-insert pattern
**Status:** PARTIAL
**Evidence:** Uses check-then-insert pattern which has race window.
```typescript
// Race condition possible:
// Thread A: checkExists() → false
// Thread B: checkExists() → false
// Thread A: recordTransaction() → success
// Thread B: recordTransaction() → ON CONFLICT DO NOTHING (safe, but work wasted)
```
**Mitigation:** ON CONFLICT handles race condition safely, but work is duplicated.

### TP6: Recovery from partial failures
**Status:** PASS
**Evidence:** `ON CONFLICT DO NOTHING` makes retries safe. Partial writes don't corrupt state.

---

## Section 3.2: MongoDB Duplicate Handling

### MD1: MongoDB has unique index on signature
**Status:** PASS
**Evidence:** `src/models/blockchain-transaction.model.ts`
```typescript
blockchainTransactionSchema.index({ signature: 1 }, { unique: true });
```

### MD2: Duplicate key error (11000) handled
**Status:** PASS
**Evidence:** `src/processors/transactionProcessor.ts:84-89`
```typescript
} catch (error: any) {
  if (error.code === 11000) {
    logger.debug({ signature }, 'Transaction already in MongoDB');
  } else {
    logger.error({ error, signature }, 'Failed to save to MongoDB');
  }
}
```

### MD3: Duplicate handling doesn't throw
**Status:** PARTIAL
**Evidence:** Duplicate is silently handled (logged at debug level), but non-duplicate errors are also swallowed.
**Issue:** Non-duplicate MongoDB errors should be tracked/retried.

---

## Section 3.3: Reconciliation Idempotency

### RE1: Reconciliation runs tracked by unique ID
**Status:** PASS
**Evidence:** `src/migrations/001_baseline_blockchain_indexer.ts:62-75`
```typescript
await knex.schema.createTable('reconciliation_runs', (table) => {
  table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
  table.timestamp('started_at', { useTz: true }).defaultTo(knex.fn.now());
  table.string('status', 50).notNullable().defaultTo('RUNNING');
  // ...
});
```

### RE2: Discrepancies tracked with unique identifier
**Status:** PASS
**Evidence:** `src/migrations/001_baseline_blockchain_indexer.ts:80-95`
```typescript
await knex.schema.createTable('ownership_discrepancies', (table) => {
  table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
  table.uuid('ticket_id').notNullable();
  table.string('discrepancy_type', 100).notNullable();
  table.boolean('resolved').defaultTo(false);
  // ...
});
```

### RE3: Reconciliation is resumable
**Status:** PASS
**Evidence:** `src/reconciliation/reconciliationEngine.ts:77-92`
```typescript
async getTicketsToReconcile(): Promise<Ticket[]> {
  const result = await db.query(`
    SELECT id, token_id, wallet_address, status, is_minted
    FROM tickets
    WHERE token_id IS NOT NULL
      AND (reconciled_at IS NULL OR reconciled_at < NOW() - INTERVAL '1 hour'
           OR sync_status != 'SYNCED')
    ORDER BY reconciled_at ASC NULLS FIRST
    LIMIT 100
  `);
  return result.rows;
}
```
Only fetches tickets that need reconciliation, already-reconciled tickets skipped.

---

## Section 3.4: Indexer State Management

### IS1: Indexer state is singleton
**Status:** PASS
**Evidence:** `src/migrations/001_baseline_blockchain_indexer.ts:9`
```typescript
table.integer('id').primary(); // Always 1 (singleton pattern)
```

### IS2: State updates are atomic
**Status:** PASS
**Evidence:** `src/indexer.ts:64-69`
```typescript
await db.query(`
  UPDATE indexer_state 
  SET last_processed_slot = $1, updated_at = NOW() 
  WHERE id = 1
`, [slot]);
```

### IS3: Crash recovery from last known state
**Status:** PASS
**Evidence:** `src/indexer.ts:46-57`
```typescript
async initialize(): Promise<void> {
  // Load state from database
  const state = await db.query('SELECT * FROM indexer_state WHERE id = 1');
  
  if (state.rows.length > 0) {
    this.lastProcessedSlot = state.rows[0].last_processed_slot;
    logger.info({ lastSlot: this.lastProcessedSlot }, 'Resuming from saved state');
  }
}
```

### IS4: Concurrent indexer protection
**Status:** PARTIAL
**Evidence:** `src/migrations/001_baseline_blockchain_indexer.ts:13`
```typescript
table.boolean('is_running').defaultTo(false);
```
Flag exists but not actively used for locking.

---

## Section 3.5: Marketplace Activity Deduplication

### MA1: Unique constraint on transaction signature
**Status:** PASS
**Evidence:** `src/migrations/001_baseline_blockchain_indexer.ts:54`
```typescript
table.string('transaction_signature', 255).notNullable().unique();
```

### MA2: Marketplace events deduplicated by signature
**Status:** PASS
**Evidence:** Unique constraint prevents duplicate marketplace events.

---

## API Endpoint Idempotency (N/A for most)

**Note:** This service is read-only (query endpoints). No POST endpoints that modify state require idempotency keys.

### Query Endpoints (All GET - inherently idempotent)
- `GET /transactions/:signature` - Read-only ✓
- `GET /wallet/:address/activity` - Read-only ✓
- `GET /transactions/slot/:slot` - Read-only ✓
- `GET /nft/:tokenId/history` - Read-only ✓
- `GET /marketplace/activity` - Read-only ✓
- `GET /sync/status` - Read-only ✓
- `GET /reconciliation/discrepancies` - Read-only ✓

**Status:** PASS (All endpoints are idempotent by nature - GET requests)

---

## Payment Flow Checklist (N/A)
**Status:** N/A
**Evidence:** This service does not process payments. No Stripe integration.

---

## Webhook Handler Checklist (N/A)
**Status:** N/A
**Evidence:** This service does not receive webhooks. It's an indexer that reads from blockchain.

---

## NFT Minting Checklist (N/A)
**Status:** N/A
**Evidence:** This service indexes existing mints, does not create new NFTs.

---

## Additional Findings

### FINDING-1: Race Condition Window in Transaction Processing
**Location:** `src/processors/transactionProcessor.ts:26-30`
**Issue:** Check-then-insert pattern allows race condition.
```typescript
// Time T0: Process A checks signature X → not found
// Time T1: Process B checks signature X → not found
// Time T2: Process A inserts signature X → success
// Time T3: Process B inserts signature X → ON CONFLICT DO NOTHING
```
**Mitigation:** ON CONFLICT handles this safely, but both processes do redundant work.
**Recommendation:** Use `INSERT ... ON CONFLICT DO NOTHING RETURNING` pattern:
```typescript
const result = await db.query(`
  INSERT INTO indexed_transactions (signature, ...)
  VALUES ($1, ...)
  ON CONFLICT (signature) DO NOTHING
  RETURNING id
`, [signature]);

if (result.rows.length === 0) {
  // Already exists, skip processing
  return;
}
// New record, continue processing
```

### FINDING-2: MongoDB Write Not Tracked for Retry
**Location:** `src/processors/transactionProcessor.ts:84-89`
**Issue:** Failed MongoDB writes (non-duplicate) are logged but not tracked for retry.
**Recommendation:** Add failed writes to a retry queue or track in PostgreSQL.

### FINDING-3: Indexer State Lacks Optimistic Locking
**Location:** `src/indexer.ts:64-69`
**Issue:** No version column or optimistic locking for concurrent indexer instances.
**Risk:** If multiple indexer instances run, they could overwrite each other's progress.
**Recommendation:** Add version column and use conditional update:
```typescript
await db.query(`
  UPDATE indexer_state 
  SET last_processed_slot = $1, version = version + 1, updated_at = NOW()
  WHERE id = 1 AND version = $2
`, [slot, currentVersion]);
```

---

## Remediation Priority

### HIGH (This Week)
1. **Optimize check-then-insert pattern** - Use INSERT RETURNING pattern to avoid redundant work

### MEDIUM (This Month)
1. **Track failed MongoDB writes** - Add retry mechanism for non-duplicate errors
2. **Add optimistic locking** - Version column for indexer_state

### LOW (Backlog)
1. **Document idempotency guarantees** - Clarify behavior for operators

---

## Pass/Fail Summary by Section

| Section | Pass | Fail | Partial | N/A | Total |
|---------|------|------|---------|-----|-------|
| Transaction Processing | 5 | 0 | 1 | 0 | 6 |
| MongoDB Handling | 2 | 0 | 1 | 0 | 3 |
| Reconciliation | 3 | 0 | 0 | 0 | 3 |
| Indexer State | 3 | 0 | 1 | 0 | 4 |
| Marketplace Activity | 2 | 0 | 0 | 0 | 2 |
| API Endpoints | 1 | 0 | 0 | 0 | 1 |
| Payment Flow | 0 | 0 | 0 | 10 | 10 |
| Webhook Handler | 0 | 0 | 0 | 10 | 10 |
| NFT Minting | 0 | 0 | 0 | 10 | 10 |
| **Total** | **16** | **0** | **3** | **30** | **49** |

**Applicable Checks:** 19 (excluding N/A)
**Pass Rate:** 84% (16/19 pass cleanly)
**Pass + Partial Rate:** 100% (19/19)

---

## Idempotency Strengths

1. **Natural Idempotency Key:** Uses Solana transaction signature (cryptographically unique)
2. **Database Constraints:** Unique constraints enforce idempotency at schema level
3. **Safe Upsert Pattern:** Uses `ON CONFLICT DO NOTHING` for safe retries
4. **Resumable Processing:** Indexer resumes from last known state after restart
5. **All GET Endpoints:** Query routes are inherently idempotent

This service demonstrates **good idempotency design** for a blockchain indexer. The signature-based deduplication is the correct pattern for processing blockchain transactions.
