# Minting Service - 31 NFT Minting Operations Audit

**Service:** minting-service
**Document:** 31-nft-minting-operations.md
**Date:** 2024-12-26
**Auditor:** Cline
**Pass Rate:** 42% (19/45 checks)

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 4 | No pre-mint check, No idempotency key, No race protection, Centralized URL fallback |
| HIGH | 4 | Not finalized commitment, No CID verification, No DLQ, No user notification |
| MEDIUM | 3 | HTTP image URLs, No metadata validation, Improper asset ID derivation |
| LOW | 0 | None |

## 1. Double Minting Prevention (3/6)

- External asset IDs mapped - PASS
- Unique constraints - PASS
- Idempotency keys - FAIL
- Pre-mint validation - FAIL
- Race condition locking - FAIL
- Batch unique names - PASS

## 2. Transaction Confirmation (2/7)

- Finalized commitment - PARTIAL
- Exponential backoff - PASS
- Timeout handling - FAIL
- Tx hash stored immediately - PARTIAL
- Complete after finality - PARTIAL
- Post-confirmation verify - FAIL
- State machine tracking - PASS

## 3. Failure Handling (5/8)

- Retry with backoff - PASS
- Gas adjustment - PARTIAL
- Max retries - PASS (3)
- Failed tx logged - PASS
- User notification - FAIL
- Dead letter queue - FAIL
- 429 handling - PASS

## 4. Metadata Integrity (3/8)

- IPFS URIs used - PASS
- Reliable pinning - PASS
- Multiple providers - PARTIAL
- Metaplex standard - PASS
- Validated before mint - PARTIAL
- CID verified - FAIL
- Media on IPFS - PARTIAL
- No centralized URLs - FAIL

## 5. Access Control (1/3)

- Mint has access control - PARTIAL
- RBAC implemented - PARTIAL
- No public mint - PASS

## 6. Queue/Batch Operations (2/5)

- Rate limiting - PARTIAL
- Batch size limits - PASS
- DLQ handling - FAIL
- Progress tracking - PASS
- Resumable batches - PARTIAL

## 7. cNFT Specifics (3/7)

- Merkle tree sized - REQUIRES VERIFICATION
- DAS-compatible RPC - PARTIAL
- Canopy depth - REQUIRES VERIFICATION
- Fresh blockhash - FAIL
- Simultaneous mints limited - PASS
- Robust retry - PASS
- Asset ID derivation - PARTIAL

## Critical Remediations

### P0: Add Pre-Mint Check
```typescript
async mintCompressedNFT(ticketData: TicketData) {
  const existing = await db('nft_mints')
    .where({ ticket_id: ticketData.ticketId, tenant_id: ticketData.tenantId })
    .first();
  if (existing?.status === 'completed') {
    return { success: true, ...existing };
  }
  // Continue with minting...
}
```

### P0: Add Idempotency Key to Jobs
```typescript
await mintQueue.add('mint-ticket', ticketData, {
  jobId: `mint-${ticketData.ticketId}-${ticketData.tenantId}`,
});
```

### P0: Add Row-Level Locking
```typescript
await db.raw('SELECT * FROM nft_mints WHERE ticket_id = ? FOR UPDATE NOWAIT', [ticketId]);
```

### P0: Remove Centralized URL Fallback
```typescript
// RealCompressedNFT.ts - Remove this:
uri: metadata.uri // Must be IPFS, no fallback
```

### P1: Wait for Finalized
```typescript
await transaction.sendAndConfirm(this.umi, { commitment: 'finalized' });
```

### P1: Verify CID Accessibility
```typescript
const response = await fetch(`https://gateway.pinata.cloud/ipfs/${cid}`);
if (!response.ok) throw new Error('CID not accessible');
```

### P1: Add User Notification
```typescript
if (job.attemptsMade >= 3) {
  await notificationService.sendMintFailure(userId, ticketId);
}
```

## Strengths

- Database unique constraint (ticket_id + tenant_id)
- IPFS URIs returned (ipfs://...)
- Pinata pinning service
- Metaplex metadata standard
- Exponential backoff on retries
- Rate limit handling
- Queue-based minting
- Full error logging
- Metrics tracking
- 5% royalty configured

NFT Minting Operations Score: 42/100
