# NFT MINTING LIFECYCLE FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | NFT Minting Lifecycle |

---

## Executive Summary

**SPLIT IMPLEMENTATION - Real minting service exists, payment-service uses mock**

| Component | Status |
|-----------|--------|
| minting-service (real) | ✅ Comprehensive implementation |
| payment-service NFTQueueService | ⚠️ Uses mock minting |
| Queue infrastructure | ✅ Bull queues working |
| IPFS metadata upload | ✅ Implemented |
| Solana compressed NFTs | ✅ Implemented (minting-service) |
| Merkle tree management | ✅ Implemented |
| Ticket → NFT linking | ✅ Implemented |
| Integration between services | ❌ Not connected |

**Bottom Line:** There are TWO minting implementations:
1. **minting-service**: Real Solana compressed NFT minting with IPFS, merkle trees, proper wallet management
2. **payment-service NFTQueueService**: Mock implementation returning fake transaction hashes

The payment controller queues to NFTQueueService (mock), while the real minting-service exists but is not called from the purchase flow.

---

## Real Implementation (minting-service)

### MintingOrchestrator

**File:** `backend/services/minting-service/src/services/MintingOrchestrator.ts`

**Full Flow:**
```typescript
async mintCompressedNFT(ticketData) {
  // 1. Check wallet balance
  const balanceCheck = await checkWalletBalance(connection, wallet, minBalance);
  
  // 2. Prepare and upload metadata to IPFS
  const metadataUri = await this.prepareAndUploadMetadata(ticketData);
  
  // 3. Mint compressed NFT using Bubblegum
  const mintResult = await this.nftService.mintNFT({
    ticketId,
    ownerAddress,
    metadata: { name, uri: metadataUri }
  });
  
  // 4. Save to database
  await this.saveMintRecord({
    ticketId, tenantId, signature, mintAddress, metadataUri, assetId
  });
  
  // 5. Register ticket on blockchain
  await this.blockchainService.registerTicketOnChain(blockchainData);
  
  // 6. Update ticket status
  await pool.query(`
    UPDATE tickets SET 
      mint_address = $1,
      blockchain_status = 'minted',
      transaction_signature = $2
    WHERE id = $3
  `);
  
  return { success: true, signature, mintAddress, metadataUri, assetId };
}
```

### Features

| Feature | Status |
|---------|--------|
| Solana compressed NFTs (Bubblegum) | ✅ Implemented |
| IPFS metadata upload | ✅ Implemented |
| Merkle tree management | ✅ Implemented |
| Balance monitoring | ✅ Implemented |
| Retry with backoff | ✅ Implemented |
| Metrics (Prometheus) | ✅ Implemented |
| Database persistence | ✅ Implemented |

### Worker

**File:** `backend/services/minting-service/src/workers/mintingWorker.ts`
```typescript
mintQueue.process('mint-ticket', async (job) => {
  const result = await orchestrator.mintCompressedNFT(job.data);
  return result;
});
```

---

## Mock Implementation (payment-service)

### NFTQueueService

**File:** `backend/services/payment-service/src/services/blockchain/nft-queue.service.ts`
```typescript
private async mintNFTs(request: NFTMintRequest): Promise<any> {
  // In production, this would call your Solana program
  // For now, simulate the minting process

  log.info('Minting NFTs', { ticketCount: request.ticketIds.length });

  // Simulate blockchain interaction
  await new Promise(resolve => setTimeout(resolve, 2000));

  return {
    success: true,
    transactionHash: `mock_tx_${Date.now()}`,  // MOCK!
    ticketIds: request.ticketIds,
    gasUsed: 0.001 * request.ticketIds.length
  };
}
```

**This is what's actually called during purchase!**

---

## The Gap

### Payment Controller Calls Mock

**File:** `backend/services/payment-service/src/controllers/payment.controller.ts`
```typescript
// Line 16-34
private nftQueue: NFTQueueService;  // This is the MOCK service

// Line 176-187
const mintJobId = await this.nftQueue.queueMinting({
  paymentId: transaction.id,
  ticketIds,
  eventId,
  blockchain: 'solana',
  priority: 'standard'
});
```

### Should Call Real Minting Service

Options to fix:
1. Direct integration: Call minting-service API
2. Shared queue: Both services use same Bull queue
3. Event-driven: Payment publishes event, minting-service consumes

---

## Recommendations

### P1 - Connect Real Minting

| Task | Effort |
|------|--------|
| Replace mock with real minting-service call | 1 day |
| Add internal API to minting-service | 0.5 day |
| Update payment controller | 0.5 day |
| Test end-to-end | 1 day |
| **Total** | **3 days** |

### Quick Fix

Replace NFTQueueService in payment-service with HTTP call to minting-service:
```typescript
// Instead of mock
const result = await axios.post(`${MINTING_SERVICE_URL}/internal/mint`, {
  ticketId, orderId, eventId, tenantId, metadata
});
```

---

## Files Involved

| File | Purpose | Status |
|------|---------|--------|
| `minting-service/src/services/MintingOrchestrator.ts` | Real minting | ✅ Complete |
| `minting-service/src/services/RealCompressedNFT.ts` | Solana integration | ✅ Complete |
| `minting-service/src/workers/mintingWorker.ts` | Queue worker | ✅ Complete |
| `payment-service/src/services/blockchain/nft-queue.service.ts` | Mock minting | ⚠️ Mock |
| `payment-service/src/controllers/payment.controller.ts` | Uses mock | ⚠️ Wrong service |

---

## Related Documents

- `BLOCKCHAIN_FLOW_AUDIT.md` - General blockchain status
- `PRIMARY_PURCHASE_FLOW_AUDIT.md` - Where minting is triggered
- `NFT_METADATA_COLLECTIBLES_FLOW_AUDIT.md` - Metadata handling
