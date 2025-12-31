# BLOCKCHAIN FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | December 31, 2024 |
| Status | Complete - Ready for remediation planning |
| Author | Kevin + Claude |

---

## EXECUTIVE SUMMARY

The blockchain integration has significant gaps. The infrastructure exists but pieces aren't connected properly.

**The core problems:**

1. **Primary minting uses fake code** - Real minting service exists but isn't called
2. **Two different queue systems** - ticket-service uses RabbitMQ, minting-service uses Bull/Redis
3. **Resale blockchain transfers have no retry** - If they fail, they stay failed
4. **Gift transfers never touch blockchain** - Only database is updated
5. **Refunds don't invalidate tickets** - Refunded tickets could still work
6. **Reconciliation exists but isn't automatic** - Must be triggered manually via admin API

---

## WHAT EXISTS (Good News)

### Real Minting System (minting-service)
- `MintingOrchestrator.ts` - Real Solana compressed NFT minting
- `mintingWorker.ts` - Bull queue worker that processes mints
- `mintQueue.ts` - Bull queue with retry logic (3 attempts, exponential backoff)
- `ReconciliationService.ts` - Can check tickets against blockchain and fix discrepancies
- `internal-mint.ts` route - HTTP API for other services to call

### Minting Client (ticket-service)
- `MintingServiceClient.ts` - Fully built HTTP client with:
  - Retries with exponential backoff
  - Circuit breaker pattern
  - Batch minting support
  - Health checks

### Blockchain Client (shared)
- `client.ts` - Real Solana integration with:
  - Event creation
  - Ticket registration
  - Ticket transfer
  - Ticket verification

### Reconciliation Systems
- **Minting Service**: `ReconciliationService.ts` - Checks minted tickets against blockchain
- **Blockchain Indexer**: `reconciliationEngine.ts` - Auto-syncs database with blockchain state

---

## WHAT'S BROKEN (The Problems)

### Problem 1: Fake Minting in ticket-service

**Location:** `ticket-service/src/workers/mintWorker.ts`

**What happens:**
```
mintWorker.mintNFT() generates:
  mockAddress = "mock_nft_" + random
  mockSignature = "sig_" + random
```

**Should use:** `MintingServiceClient` which is built and ready but never called.

---

### Problem 2: Queue System Mismatch

**ticket-service publishes to:**
- RabbitMQ queue: `'ticket.mint'` (via QueueService)
- RabbitMQ queue: `QUEUES.TICKET_MINT` (via shared config)

**minting-service listens to:**
- Bull/Redis queue: `'ticket-minting'` (via mintQueue)

**These don't talk to each other.**

The minting-service also has an HTTP endpoint (`/internal/mint`) that ticket-service's `MintingServiceClient` knows how to call, but nothing calls it.

---

### Problem 3: Resale Blockchain Transfer Has No Safety Net

**Location:** `marketplace-service/src/services/transfer.service.ts`

**What happens:**
1. Payment completes ✅
2. Money distributed ✅
3. `syncBlockchainOwnership()` called
4. If it fails → error logged, marked as failed, **no retry**

**Missing:**
- Retry job for failed blockchain syncs
- Alerts when blockchain sync fails
- Automatic reconciliation

---

### Problem 4: Gift Transfers Skip Blockchain

**Location:** `ticket-service/src/services/transferService.ts`

**What happens:**
1. Validates transfer ✅
2. Updates database ownership ✅
3. Creates transfer record ✅
4. Sends notifications ✅
5. Updates blockchain ❌ **NEVER CALLED**

---

### Problem 5: Refunds Don't Invalidate Tickets

**Location:** `ticket-service/src/services/refundHandler.ts`

**What happens:**
1. Updates order status to 'REFUND_INITIATED' ✅
2. Queues message to outbox ✅
3. Updates ticket status ❌ **NEVER**
4. Invalidates NFT ❌ **NEVER**

**Impact:** The scanning service checks for 'REFUNDED' status, but nothing ever sets it. Refunded tickets could still scan at the door.

---

### Problem 6: Reconciliation is Manual Only

**Minting reconciliation:**
- Only runs when someone calls `POST /admin/reconcile/:venueId`
- Not scheduled
- Not automatic

**Blockchain indexer reconciliation:**
- Has automatic scheduling (every 5 minutes)
- But only checks ownership mismatches
- Doesn't check for failed mints or failed transfers

---

## THE COMPLETE PICTURE

### Primary Sale Flow (Current State)
```
Fan buys ticket
    ↓
ticketService.confirmPurchase()
    ↓
Ticket created in database ✅
    ↓
queueService.publish(QUEUES.TICKET_MINT) → RabbitMQ
    ↓
??? Nothing listening ???
    ↓
mintRoutes /process-mint exists but nothing calls it
    ↓
Even if called, mintWorker.mintNFT() is FAKE
    ↓
MintingServiceClient exists but UNUSED
    ↓
minting-service has REAL code but NEVER REACHED
```

### Resale Flow (Current State)
```
Fan A lists ticket
    ↓
Fan B buys
    ↓
Stripe payment ✅
    ↓
completeFiatTransfer()
    ↓
Money distributed ✅
    ↓
syncBlockchainOwnership()
    ↓
If success → NFT transferred ✅
If failure → Logged, marked failed, NO RETRY ❌
```

### Gift Transfer Flow (Current State)
```
Fan A transfers to Fan B
    ↓
transferService.transferTicket()
    ↓
Database updated ✅
Transfer record created ✅
Notifications sent ✅
    ↓
Blockchain updated ❌ NEVER
```

### Refund Flow (Current State)
```
Fan requests refund
    ↓
refundHandler.initiateRefund()
    ↓
Order status = 'REFUND_INITIATED' ✅
Outbox message queued ✅
    ↓
Ticket status updated ❌ NEVER
NFT invalidated ❌ NEVER
    ↓
Ticket could still scan at door
```

---

## FILES THAT NEED CHANGES

### Must Fix (Core Functionality)

| File | Problem | Fix Needed |
|------|---------|------------|
| `ticket-service/src/workers/mintWorker.ts` | Fake minting | Use MintingServiceClient or call minting-service |
| `ticket-service/src/services/transferService.ts` | No blockchain call | Add blockchain transfer after database update |
| `ticket-service/src/services/refundHandler.ts` | Doesn't invalidate ticket | Update ticket status, optionally burn NFT |
| `marketplace-service/src/services/transfer.service.ts` | No retry for failed syncs | Add retry job or queue |

### Should Fix (Reliability)

| File | Problem | Fix Needed |
|------|---------|------------|
| `minting-service/src/index.ts` | Reconciliation not scheduled | Add cron job for automatic reconciliation |
| New file needed | No retry job for blockchain failures | Create background worker |
| New file needed | No alerts for failures | Add alerting |

### May Need Changes (To Connect Systems)

| File | Reason |
|------|--------|
| `ticket-service/src/services/queueService.ts` | May need to publish to Bull instead of RabbitMQ |
| `ticket-service/src/services/paymentEventHandler.ts` | Publishes to wrong queue |
| `ticket-service/src/clients/index.ts` | MintingServiceClient not exported/used |

---

## WHAT RECONCILIATION ALREADY EXISTS

### In minting-service (Manual)

**Trigger:** `POST /admin/reconcile/:venueId`

**What it does:**
1. Gets all minted tickets from database
2. Checks each transaction signature on Solana
3. Reports discrepancies (not found, failed, time mismatch)
4. Can fix by resetting tickets for re-minting

**Limitation:** Must be called manually per venue

### In blockchain-indexer (Automatic)

**Trigger:** Runs every 5 minutes automatically

**What it does:**
1. Gets tickets that haven't been reconciled recently
2. Checks on-chain ownership vs database
3. Auto-updates database to match blockchain
4. Logs all changes

**What it checks:**
- Ownership mismatches
- Burn status not recorded
- Token not found

**Limitation:** Only checks ownership, not mint status or transfer completion

---

## SERVICES INVOLVED

| Service | Role | Status |
|---------|------|--------|
| ticket-service | Creates tickets, queues minting | Has fake minting |
| minting-service | Real NFT minting | Works but not called |
| marketplace-service | Resales, transfers | No retry on blockchain fail |
| blockchain-service | Solana interactions | Works |
| blockchain-indexer | Syncs state, reconciliation | Works for ownership |
| scanning-service | Validates tickets at door | Only checks database |
| payment-service | Stripe processing | Works |
| order-service | Order management | Works |

---

## NEXT STEPS

1. Decide how to connect ticket-service to minting-service:
   - Option A: Make ticket-service publish to Bull queue (minting-service already listens)
   - Option B: Make ticket-service call HTTP endpoint (MintingServiceClient already exists)
   - Option C: Make minting-service listen to RabbitMQ (ticket-service already publishes)

2. Add blockchain call to gift transfers

3. Fix refund handler to invalidate tickets

4. Add retry mechanism for failed blockchain operations

5. Schedule automatic minting reconciliation

6. Add alerting for blockchain failures

