# BLOCKCHAIN INTEGRATION REMEDIATION PLAN

## Document Information

| Field | Value |
|-------|-------|
| Created | December 31, 2024 |
| Author | Kevin + Claude |
| Status | Planning |
| Priority | Critical |

---

## Executive Summary

During a comprehensive audit of the TicketToken blockchain integration, we discovered that while significant infrastructure exists, critical pieces are not connected. The smart contract has limited functionality compared to the product vision, and services that should interact with the blockchain either don't, or use fake/mock implementations.

---

## Part 1: Business Requirements

### What TicketToken Should Do

#### Primary Sale
1. Fan buys ticket
2. Payment processed
3. Real NFT minted on Solana
4. Ticket registered on blockchain
5. Fan owns verifiable NFT ticket

#### Resale (Secondary Sale)
1. Fan A lists ticket
2. Fan B purchases
3. Payment processed, money split (85% seller, 5% platform, 10% venue)
4. NFT ownership transferred on blockchain
5. If blockchain fails, system retries until successful

#### Gift Transfer
1. Fan A sends ticket to Fan B
2. Database updated
3. NFT ownership transferred on blockchain

#### Scanning at Venue
1. Fan shows QR code
2. Scanner validates ticket
3. Scan recorded on blockchain with:
   - Scan type (entry, exit, VIP, re-entry)
   - Location/zone
   - Timestamp
   - Device ID
4. Ticket location state updated (enforces: can't exit before entry, can't re-enter without exiting)
5. Venues get immutable record of all foot traffic

#### Refunds
1. Fan requests refund
2. Refund approved
3. Money returned via Stripe
4. Ticket status set to REFUNDED
5. NFT invalidated on blockchain
6. Ticket cannot be scanned

#### Event Cancellation
1. Venue cancels event
2. All tickets invalidated
3. All refunds triggered
4. All NFTs invalidated on blockchain
5. Resale listings cancelled

---

## Part 2: Current State vs Required State

### Smart Contract

| Feature | Current State | Required State |
|---------|---------------|----------------|
| Initialize Platform | ✅ Exists | ✅ Good |
| Create Venue | ✅ Exists | ✅ Good |
| Verify Venue | ✅ Exists | ✅ Good |
| Create Event | ✅ Exists | ✅ Good |
| Register Ticket | ✅ Exists | ✅ Good |
| Transfer Ticket | ✅ Exists | ✅ Good |
| Verify Ticket | ⚠️ One-time only | ❌ Need multi-scan with location state |
| List on Marketplace | ✅ Exists | ✅ Good |
| Record Scan | ❌ Missing | ❌ Need new instruction |
| Cancel/Invalidate Ticket | ❌ Missing | ❌ Need new instruction |
| Cancel Event | ❌ Missing | ❌ Need new instruction |

### Ticket State On-Chain

| Field | Current | Required |
|-------|---------|----------|
| event | ✅ Exists | ✅ Good |
| ticket_id | ✅ Exists | ✅ Good |
| nft_asset_id | ✅ Exists | ✅ Good |
| current_owner_id | ✅ Exists | ✅ Good |
| used | ⚠️ Boolean | ❌ Replace with location state |
| verified_at | ⚠️ Single timestamp | ❌ Replace with first_scan_at, last_scan_at |
| transfer_count | ✅ Exists | ✅ Good |
| bump | ✅ Exists | ✅ Good |
| current_location | ❌ Missing | ❌ Need (Outside/Inside/VIP/Backstage) |
| scan_count | ❌ Missing | ❌ Need |
| is_valid | ❌ Missing | ❌ Need (for cancellation/refund) |

### Service Connections

| Service | Current State | Required State |
|---------|---------------|----------------|
| ticket-service → minting-service | ❌ Uses fake minting | ❌ Must call real minting-service |
| ticket-service (gift transfer) → blockchain | ❌ Never calls | ❌ Must call transferTicket |
| ticket-service (refund) → blockchain | ❌ Never calls | ❌ Must call invalidateTicket |
| marketplace-service → blockchain | ⚠️ Calls but no retry | ❌ Need retry mechanism |
| scanning-service → blockchain | ❌ Never calls | ❌ Must call recordScan |
| event-service (cancellation) → blockchain | ❌ Never calls | ❌ Must call cancelEvent |

---

## Part 3: Smart Contract Changes

### Files to Modify

| File | Change |
|------|--------|
| `smart-contracts/programs/tickettoken/src/state/ticket.rs` | Add location state, scan_count, is_valid fields |
| `smart-contracts/programs/tickettoken/src/instructions/verify_ticket.rs` | Rename to record_scan, add state machine logic |
| `smart-contracts/programs/tickettoken/src/instructions/mod.rs` | Export new instructions |
| `smart-contracts/programs/tickettoken/src/errors.rs` | Add new error types |

### Files to Create

| File | Purpose |
|------|---------|
| `smart-contracts/programs/tickettoken/src/instructions/record_scan.rs` | Multi-scan with location state machine |
| `smart-contracts/programs/tickettoken/src/instructions/invalidate_ticket.rs` | Mark ticket invalid (refund/cancel) |
| `smart-contracts/programs/tickettoken/src/instructions/cancel_event.rs` | Batch invalidate all event tickets |
| `smart-contracts/programs/tickettoken/src/state/scan_record.rs` | Individual scan event account |
| `smart-contracts/programs/tickettoken/src/state/location.rs` | Location enum and state machine |

### New Ticket State Structure
```
Ticket {
    event: Pubkey
    ticket_id: u64
    nft_asset_id: Pubkey
    current_owner_id: String
    current_location: u8        // NEW: 0=Outside, 1=Inside, 2=VIP, 3=Backstage
    scan_count: u32             // NEW: Total scans
    first_entry_at: Option<i64> // NEW: First entry timestamp
    last_scan_at: Option<i64>   // NEW: Most recent scan
    transfer_count: u32
    is_valid: bool              // NEW: False if refunded/cancelled
    bump: u8
}
```

### New Scan Record Structure
```
ScanRecord {
    ticket: Pubkey
    event: Pubkey
    scan_type: u8           // 0=Entry, 1=Exit, 2=VIP_In, 3=VIP_Out, 4=Reentry
    zone: String            // "Main Gate", "VIP Section", etc.
    device_id: String       // Scanner device identifier
    scanned_at: i64         // Timestamp
    scanned_by: Pubkey      // Validator wallet
    previous_location: u8   // Location before scan
    new_location: u8        // Location after scan
}
```

### Location State Machine
```
Valid Transitions:
    Outside (0) + ENTRY (0)     → Inside (1)
    Inside (1)  + EXIT (1)      → Outside (0)
    Inside (1)  + VIP_IN (2)    → VIP (2)
    VIP (2)     + VIP_OUT (3)   → Inside (1)
    Inside (1)  + BACKSTAGE_IN  → Backstage (3)
    Backstage   + BACKSTAGE_OUT → Inside (1)
    Outside (0) + REENTRY (4)   → Inside (1)

Invalid (will error):
    Outside + EXIT
    Inside + ENTRY
    Inside + REENTRY
    VIP + ENTRY
```

---

## Part 4: Shared Blockchain Client Changes

### Files to Modify

| File | Change |
|------|--------|
| `backend/shared/src/blockchain/client.ts` | Add recordScan(), invalidateTicket(), cancelEvent() methods |
| `backend/shared/src/blockchain/types.ts` | Add ScanType enum, LocationState enum, new param/result types |
| `backend/shared/src/blockchain/index.ts` | Export new types |

### New Methods for BlockchainClient
```
recordScan(params: RecordScanParams): Promise<RecordScanResult>
invalidateTicket(params: InvalidateTicketParams): Promise<string>
cancelEvent(params: CancelEventParams): Promise<string>
getTicketLocation(ticketPda: string): Promise<LocationState>
```

### New Types
```
enum ScanType {
    Entry = 0
    Exit = 1
    VipIn = 2
    VipOut = 3
    Reentry = 4
    BackstageIn = 5
    BackstageOut = 6
}

enum LocationState {
    Outside = 0
    Inside = 1
    VIP = 2
    Backstage = 3
}

interface RecordScanParams {
    ticketPda: string
    eventPda: string
    scanType: ScanType
    zone: string
    deviceId: string
}

interface RecordScanResult {
    signature: string
    scanRecordPda: string
    previousLocation: LocationState
    newLocation: LocationState
    scanCount: number
}

interface InvalidateTicketParams {
    ticketPda: string
    eventPda: string
    reason: 'refund' | 'event_cancelled' | 'admin'
}

interface CancelEventParams {
    eventPda: string
    reason: string
}
```

---

## Part 5: Service Changes

### ticket-service

| File | Current Problem | Required Change |
|------|-----------------|-----------------|
| `src/workers/mintWorker.ts` | Uses fake minting | Call MintingServiceClient or minting-service API |
| `src/services/transferService.ts` | No blockchain call | Add blockchainClient.transferTicket() after DB update |
| `src/services/refundHandler.ts` | Doesn't invalidate ticket | Update ticket status, call blockchainClient.invalidateTicket() |
| `src/clients/MintingServiceClient.ts` | Built but never used | Import and use in mintWorker |
| `src/clients/index.ts` | Doesn't export MintingServiceClient | Add export |

### minting-service

| File | Current Problem | Required Change |
|------|-----------------|-----------------|
| `src/index.ts` | Reconciliation not scheduled | Add cron job for automatic reconciliation |
| `src/workers/mintingWorker.ts` | Only listens to Bull queue | Also listen to RabbitMQ OR have ticket-service call HTTP endpoint |

### marketplace-service

| File | Current Problem | Required Change |
|------|-----------------|-----------------|
| `src/services/transfer.service.ts` | No retry on blockchain failure | Add retry queue/job for failed syncs |

### scanning-service

| File | Current Problem | Required Change |
|------|-----------------|-----------------|
| `src/services/QRValidator.ts` | Never calls blockchain | Add blockchainClient.recordScan() after validation |
| `src/services/BlockchainService.ts` | ❌ Doesn't exist | Create - wrapper for blockchain calls |
| `src/config/blockchain.ts` | ❌ Doesn't exist | Create - blockchain configuration |

### event-service

| File | Current Problem | Required Change |
|------|-----------------|-----------------|
| `src/services/event-cancellation.service.ts` | Blockchain calls are placeholders | Implement actual blockchain calls |
| `src/services/blockchain.service.ts` | No cancelEvent method | Add cancelEvent() method |

---

## Part 6: New Files to Create

### Backend Services

| File | Purpose |
|------|---------|
| `backend/services/scanning-service/src/services/blockchain.service.ts` | Blockchain integration for scanning |
| `backend/services/scanning-service/src/config/blockchain.ts` | Blockchain config for scanning service |
| `backend/shared/src/jobs/blockchain-retry.job.ts` | Retry failed blockchain operations |
| `backend/shared/src/jobs/blockchain-reconciliation.job.ts` | Periodic reconciliation |

### Smart Contracts

| File | Purpose |
|------|---------|
| `smart-contracts/programs/tickettoken/src/instructions/record_scan.rs` | Multi-scan instruction |
| `smart-contracts/programs/tickettoken/src/instructions/invalidate_ticket.rs` | Invalidate ticket instruction |
| `smart-contracts/programs/tickettoken/src/instructions/cancel_event.rs` | Cancel event instruction |
| `smart-contracts/programs/tickettoken/src/state/scan_record.rs` | Scan record account |
| `smart-contracts/programs/tickettoken/src/state/location.rs` | Location state machine |

---

## Part 7: Files Summary

### Smart Contract Files

| Action | File |
|--------|------|
| MODIFY | `smart-contracts/programs/tickettoken/src/state/ticket.rs` |
| MODIFY | `smart-contracts/programs/tickettoken/src/state/mod.rs` |
| MODIFY | `smart-contracts/programs/tickettoken/src/instructions/verify_ticket.rs` |
| MODIFY | `smart-contracts/programs/tickettoken/src/instructions/mod.rs` |
| MODIFY | `smart-contracts/programs/tickettoken/src/errors.rs` |
| MODIFY | `smart-contracts/programs/tickettoken/src/lib.rs` |
| CREATE | `smart-contracts/programs/tickettoken/src/instructions/record_scan.rs` |
| CREATE | `smart-contracts/programs/tickettoken/src/instructions/invalidate_ticket.rs` |
| CREATE | `smart-contracts/programs/tickettoken/src/instructions/cancel_event.rs` |
| CREATE | `smart-contracts/programs/tickettoken/src/state/scan_record.rs` |
| CREATE | `smart-contracts/programs/tickettoken/src/state/location.rs` |

### Shared Library Files

| Action | File |
|--------|------|
| MODIFY | `backend/shared/src/blockchain/client.ts` |
| MODIFY | `backend/shared/src/blockchain/types.ts` |
| MODIFY | `backend/shared/src/blockchain/index.ts` |
| CREATE | `backend/shared/src/jobs/blockchain-retry.job.ts` |
| CREATE | `backend/shared/src/jobs/blockchain-reconciliation.job.ts` |

### ticket-service Files

| Action | File |
|--------|------|
| MODIFY | `backend/services/ticket-service/src/workers/mintWorker.ts` |
| MODIFY | `backend/services/ticket-service/src/services/transferService.ts` |
| MODIFY | `backend/services/ticket-service/src/services/refundHandler.ts` |
| MODIFY | `backend/services/ticket-service/src/clients/index.ts` |

### minting-service Files

| Action | File |
|--------|------|
| MODIFY | `backend/services/minting-service/src/index.ts` |

### marketplace-service Files

| Action | File |
|--------|------|
| MODIFY | `backend/services/marketplace-service/src/services/transfer.service.ts` |

### scanning-service Files

| Action | File |
|--------|------|
| MODIFY | `backend/services/scanning-service/src/services/QRValidator.ts` |
| CREATE | `backend/services/scanning-service/src/services/blockchain.service.ts` |
| CREATE | `backend/services/scanning-service/src/config/blockchain.ts` |

### event-service Files

| Action | File |
|--------|------|
| MODIFY | `backend/services/event-service/src/services/event-cancellation.service.ts` |
| MODIFY | `backend/services/event-service/src/services/blockchain.service.ts` |

---

## Part 8: Implementation Order

### Phase 1: Smart Contract Foundation
1. Add new fields to ticket state
2. Create location state machine
3. Create record_scan instruction
4. Create invalidate_ticket instruction
5. Create cancel_event instruction
6. Update tests
7. Deploy to devnet

### Phase 2: Shared Library Updates
8. Add new types to blockchain/types.ts
9. Add new methods to blockchain/client.ts
10. Update exports

### Phase 3: Fix Primary Minting
11. Update mintWorker.ts to use MintingServiceClient
12. Export MintingServiceClient from clients/index.ts
13. Add automatic reconciliation to minting-service

### Phase 4: Fix Transfers
14. Add blockchain call to ticket-service transferService.ts (gifts)
15. Add retry mechanism to marketplace-service transfer.service.ts (resales)

### Phase 5: Fix Refunds & Cancellation
16. Update refundHandler.ts to invalidate tickets
17. Update event-cancellation.service.ts to call blockchain

### Phase 6: Implement Scanning
18. Create blockchain.service.ts in scanning-service
19. Create blockchain.ts config in scanning-service
20. Update QRValidator.ts to call blockchain

### Phase 7: Background Jobs
21. Create blockchain-retry.job.ts
22. Create blockchain-reconciliation.job.ts
23. Schedule jobs in services

### Phase 8: Testing
24. Update all affected tests
25. Integration testing
26. End-to-end testing

---

## Part 9: Summary

| Category | Count |
|----------|-------|
| Smart contract files to modify | 6 |
| Smart contract files to create | 5 |
| Backend files to modify | 12 |
| Backend files to create | 5 |
| **Total files affected** | **28** |

---

## Related Documents

- `BLOCKCHAIN_FLOW_AUDIT.md` - Detailed audit findings
- `FEE_STRUCTURE_REMEDIATION.md` - Fee structure fixes (in payment-service/docs)

