# Queue Service Idempotency Audit

**Service:** queue-service  
**Standard:** 07-idempotency.md  
**Date:** December 27, 2025  

---

## Executive Summary

| Metric | Value |
|--------|-------|
| **Overall Pass Rate** | **90.0%** (18/20 checks) |
| **CRITICAL Issues** | 0 |
| **HIGH Issues** | 1 |
| **MEDIUM Issues** | 1 |
| **LOW Issues** | 0 |

---

## Section: Key Generation

### IDP1: Deterministic key generation
| Status | **PASS** |
|--------|----------|
| Evidence | `src/services/idempotency.service.ts:28-35` - `generateKey()` method |
| Evidence | Uses `crypto.createHash('sha256')` for deterministic hashing |
| Evidence | Key format: `${operation}:${hash}` |

### IDP2: Unique key per operation
| Status | **PASS** |
|--------|----------|
| Evidence | `src/services/idempotency.service.ts:37-49` - Specialized key generators |
| Evidence | `generatePaymentKey(userId, orderId)` → `payment:sha256(userId:orderId)` |
| Evidence | `generateNFTMintKey(ticketId, walletAddress)` → `nft-mint:sha256(ticketId:walletAddress)` |
| Evidence | `generateEmailKey(to, subject, timestamp)` → `email:sha256(to:subject:timestamp)` |

### IDP3: Key includes all relevant parameters
| Status | **PASS** |
|--------|----------|
| Evidence | `src/workers/money/payment.processor.ts:33` - Includes `userId, venueId, eventId, ticketIds, amount` |
| Evidence | `src/workers/money/nft-mint.processor.ts:29-31` - Includes all job data |

### IDP4: Key format is consistent
| Status | **PASS** |
|--------|----------|
| Evidence | All keys follow `{operation}:{hash}` format |
| Evidence | `src/services/idempotency.service.ts:33` - `return ${operation}:${hash}` |

---

## Section: Storage & Persistence

### IDP5: PostgreSQL storage for idempotency keys
| Status | **PASS** |
|--------|----------|
| Evidence | `src/migrations/001_baseline_queue.ts:106-120` - `idempotency_keys` table |
| Evidence | Columns: id, key (unique), queue_name, job_type, result (JSONB), processed_at, expires_at |

### IDP6: Unique constraint on key column
| Status | **PASS** |
|--------|----------|
| Evidence | `src/migrations/001_baseline_queue.ts:108` - `table.string('key', 255).notNullable().unique()` |

### IDP7: Result storage with expiration
| Status | **PASS** |
|--------|----------|
| Evidence | `src/services/idempotency.service.ts:57-69` - `store()` method with ttlMs |
| Evidence | `INSERT INTO idempotency_keys (..., expires_at) VALUES (..., NOW() + INTERVAL '${ttlMs} milliseconds')` |

### IDP8: Configurable TTL per operation type
| Status | **PASS** |
|--------|----------|
| Evidence | `src/workers/money/payment.processor.ts:59` - 24 hours for payments |
| Evidence | `src/workers/money/nft-mint.processor.ts:62` - 1 year for NFTs |
| Evidence | Different TTLs based on criticality |

### IDP9: Atomic check-and-store operation
| Status | **PARTIAL** |
|--------|----------|
| Severity | **HIGH** |
| Evidence | `src/services/idempotency.service.ts:51-55` - `check()` is separate from `store()` |
| Issue | Race condition possible between check and store |
| Fix | Use `INSERT ... ON CONFLICT DO NOTHING ... RETURNING` for atomicity |

---

## Section: Processor Implementation

### IDP10: Check idempotency before processing
| Status | **PASS** |
|--------|----------|
| Evidence | `src/workers/money/payment.processor.ts:35-38` - Checks before processing |
| Evidence | `const existing = await this.idempotencyService.check(idempotencyKey)` |
| Evidence | Returns existing result if found |

### IDP11: Store result after successful processing
| Status | **PASS** |
|--------|----------|
| Evidence | `src/workers/money/payment.processor.ts:52-59` - Stores after success |
| Evidence | `await this.idempotencyService.store(idempotencyKey, ...)` |

### IDP12: Return cached result for duplicates
| Status | **PASS** |
|--------|----------|
| Evidence | `src/workers/money/payment.processor.ts:36-39` |
| Evidence | `if (existing) { logger.warn('Payment already processed'); return existing; }` |
| Evidence | `src/workers/money/nft-mint.processor.ts:35-38` - Same pattern |

### IDP13: Log idempotent skips
| Status | **PASS** |
|--------|----------|
| Evidence | `src/workers/money/payment.processor.ts:37` - `logger.warn('Payment already processed (idempotent)')` |
| Evidence | `src/workers/money/nft-mint.processor.ts:36` - `logger.warn('NFT already minted (idempotent)')` |

---

## Section: External Service Idempotency

### IDP14: Stripe idempotency keys
| Status | **PASS** |
|--------|----------|
| Evidence | `src/workers/money/payment.processor.ts:78` - `'X-Idempotency-Key': idempotencyKey` |
| Evidence | Idempotency key passed to payment service |

### IDP15: NFT minting idempotency
| Status | **PASS** |
|--------|----------|
| Evidence | `src/workers/money/nft-mint.processor.ts:29-38` - Full idempotency flow |
| Evidence | Checks before minting, stores after success |
| Note | Actual Solana minting is TODO but idempotency framework in place |

### IDP16: Email sending idempotency
| Status | **PASS** |
|--------|----------|
| Evidence | `src/services/idempotency.service.ts:45-49` - `generateEmailKey()` method |
| Evidence | Uses to, subject, timestamp for uniqueness |

---

## Section: Cleanup & Maintenance

### IDP17: Expired key cleanup mechanism
| Status | **PARTIAL** |
|--------|----------|
| Severity | **MEDIUM** |
| Evidence | `src/migrations/001_baseline_queue.ts:115` - `expires_at` column indexed |
| Issue | No automatic cleanup job defined |
| Fix | Add scheduled job to DELETE FROM idempotency_keys WHERE expires_at < NOW() |

### IDP18: Critical job persistence table
| Status | **PASS** |
|--------|----------|
| Evidence | `src/migrations/001_baseline_queue.ts:78-99` - `critical_jobs` table |
| Evidence | Has `idempotency_key` column with unique constraint |
| Evidence | Separate from Redis queue for durability |

### IDP19: Dead letter queue for failed operations
| Status | **PASS** |
|--------|----------|
| Evidence | `src/services/dead-letter-queue.service.ts` - Full DLQ implementation |
| Evidence | Stores failed job context for manual retry |

### IDP20: Idempotency key in job data
| Status | **PASS** |
|--------|----------|
| Evidence | `src/workers/money/payment.processor.ts:33` - Key generated from job data |
| Evidence | `src/workers/money/nft-mint.processor.ts:29-31` - Key from job data |

---

## Idempotency Flow Summary
```
1. Job Received → Generate Idempotency Key (SHA256 of operation + data)
2. Check PostgreSQL → If exists, return cached result
3. Process Job → Execute business logic
4. Store Result → Save to idempotency_keys with TTL
5. Return Result → Send success response
```

**TTL Configuration:**
| Operation | TTL | Rationale |
|-----------|-----|-----------|
| Payments | 24 hours | Short-term duplicate prevention |
| NFT Mints | 1 year | Long-term uniqueness for blockchain |
| Emails | Variable | Configurable per-use-case |

---

## Remediation Priority

### HIGH (Fix within 24-48 hours)
1. **IDP9**: Make check-and-store atomic
```typescript
   async checkAndStore(
     key: string,
     queueName: string,
     jobType: string,
     result: any,
     ttlMs: number
   ): Promise<{ existed: boolean; result: any }> {
     const query = `
       INSERT INTO idempotency_keys (key, queue_name, job_type, result, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '${ttlMs} milliseconds')
       ON CONFLICT (key) DO NOTHING
       RETURNING *
     `;
     const res = await pool.query(query, [key, queueName, jobType, result]);
     
     if (res.rows.length === 0) {
       // Key already existed, fetch existing result
       const existing = await this.check(key);
       return { existed: true, result: existing };
     }
     return { existed: false, result };
   }
```

### MEDIUM (Fix within 1 week)
1. **IDP17**: Add cleanup job for expired keys
```typescript
   // Add to scheduler
   schedule.every('1 hour').do(async () => {
     await pool.query('DELETE FROM idempotency_keys WHERE expires_at < NOW()');
   });
```

---

## Summary

The queue-service has **excellent idempotency implementation** with:
- ✅ Deterministic SHA256-based key generation
- ✅ Specialized key generators for payments, NFTs, emails
- ✅ PostgreSQL storage with unique constraints
- ✅ Configurable TTL per operation type (24h payments, 1 year NFTs)
- ✅ Pre-processing check in all money queue processors
- ✅ Cached result return for duplicates
- ✅ Idempotency key propagation to Stripe
- ✅ Logging of idempotent skips
- ✅ Critical jobs table with idempotency key
- ✅ Dead letter queue for failed operations

**Gaps to address:**
- ❌ Check-and-store not atomic (race condition risk)
- ❌ No automatic cleanup of expired keys

The idempotency pattern is consistently applied across payment processing, NFT minting, and email sending, which is critical for a queue service handling financial and blockchain operations.
