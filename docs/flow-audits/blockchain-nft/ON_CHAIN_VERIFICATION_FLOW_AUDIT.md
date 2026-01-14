# ON-CHAIN VERIFICATION FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | On-Chain Verification |

---

## Executive Summary

**WORKING - Comprehensive blockchain verification and reconciliation**

| Component | Status |
|-----------|--------|
| blockchain-service query endpoints | ✅ Working |
| Transaction confirmation | ✅ Working |
| NFT ownership lookup | ✅ Working |
| Ownership verification | ✅ Working |
| Blockchain reconciliation worker | ✅ Working |
| DB-blockchain sync tracking | ✅ Working |
| blockchain_sync_log table | ✅ Exists |
| Discrepancy detection | ✅ Working |

**Bottom Line:** Comprehensive on-chain verification system exists across blockchain-service and ticket-service. Includes real-time transaction confirmation, ownership verification, and a reconciliation worker that periodically compares database state with blockchain state to detect discrepancies.

---

## API Endpoints (blockchain-service)

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/blockchain/balance/:address` | GET | Get SOL balance | ✅ Working |
| `/blockchain/tokens/:address` | GET | Get token accounts | ✅ Working |
| `/blockchain/nfts/:address` | GET | Get NFTs owned | ✅ Working |
| `/blockchain/transaction/:signature` | GET | Get transaction details | ✅ Working |
| `/blockchain/transactions/:address` | GET | Recent transactions | ✅ Working |
| `/blockchain/confirm-transaction` | POST | Confirm transaction | ✅ Working |
| `/blockchain/account/:address` | GET | Get account info | ✅ Working |
| `/blockchain/token-supply/:mint` | GET | Get token supply | ✅ Working |
| `/blockchain/slot` | GET | Current slot | ✅ Working |
| `/blockchain/blockhash` | GET | Latest blockhash | ✅ Working |

---

## Ownership Verification

### ticket-service SolanaService

**File:** `backend/services/ticket-service/src/services/solanaService.ts`
```typescript
async verifyOwnership(tokenMint: string, expectedOwner: string): Promise<boolean> {
  const result = await this.reconciliationService.compareOwnership(
    this.connection,
    tokenMint,
    expectedOwner
  );
  return result.matches;
}
```

### Response Type
```typescript
interface OwnershipResult {
  matches: boolean;
  onChainOwner?: string;
}
```

---

## Blockchain Reconciliation Worker

**File:** `backend/services/ticket-service/src/workers/blockchain-reconciliation.worker.ts`

### What It Does

1. **Reconcile Pending Transactions**: Check if pending blockchain transactions have confirmed
2. **Detect Ownership Discrepancies**: Compare database ownership with on-chain ownership
3. **Log Discrepancies**: Record any mismatches for investigation
4. **Update Status**: Mark transactions as confirmed/failed

### Key Methods
```typescript
class BlockchainReconciliationWorker {
  // Check pending transactions
  async reconcilePendingTransactions() {
    // Find tickets with pending blockchain status
    // Check each transaction on chain
    // Update status to confirmed/failed
  }

  // Check ownership matches
  async checkOwnershipDiscrepancies() {
    // For each minted ticket
    // Compare DB owner with on-chain owner
    // Log any discrepancies
  }
}
```

### Metrics
```
blockchain_reconciliation_last_run_timestamp
blockchain_reconciliation_runs_total{status="completed|failed"}
blockchain_reconciliation_transactions_total
blockchain_reconciliation_confirmed_total
blockchain_reconciliation_failed_total
blockchain_reconciliation_discrepancies_total
blockchain_reconciliation_is_running
```

---

## Database Tracking

### blockchain_transactions Table

**File:** `backend/services/ticket-service/src/migrations/003_add_blockchain_tracking.ts`
```sql
CREATE TABLE blockchain_transactions (
  id UUID PRIMARY KEY,
  ticket_id UUID,
  signature VARCHAR(100),
  status VARCHAR(20),  -- 'pending', 'confirmed', 'failed'
  submitted_at TIMESTAMP,
  confirmed_at TIMESTAMP,
  slot BIGINT,
  error TEXT
);
```

### blockchain_sync_log Table
```sql
CREATE TABLE blockchain_sync_log (
  id UUID PRIMARY KEY,
  ticket_id UUID,
  event_type VARCHAR(50),
  database_state JSONB,
  blockchain_state JSONB,
  severity VARCHAR(20),
  message TEXT,
  created_at TIMESTAMP
);
```

### ticket_transfers Table
```sql
CREATE TABLE ticket_transfers (
  id UUID PRIMARY KEY,
  ticket_id UUID,
  from_user_id UUID,
  to_user_id UUID,
  transfer_type VARCHAR(30),
  blockchain_confirmed BOOLEAN DEFAULT FALSE,
  blockchain_confirmed_at TIMESTAMP,
  transaction_signature VARCHAR(100)
);
```

---

## Ticket States
```typescript
enum TicketStatus {
  RESERVED = 'reserved',
  PURCHASED = 'purchased',
  MINTED = 'minted',      // After NFT is minted on blockchain
  TRANSFERRED = 'transferred',
  USED = 'used',
  CANCELLED = 'cancelled'
}
```

---

## Health Check

**File:** `backend/services/ticket-service/src/routes/health.routes.ts`

Health checks include blockchain connectivity:
```typescript
const components = ['database', 'redis', 'rabbitmq', 'blockchain'];
```

---

## Files Involved

| File | Purpose |
|------|---------|
| `blockchain-service/src/routes/blockchain.routes.ts` | Query endpoints |
| `ticket-service/src/services/solanaService.ts` | Ownership verification |
| `ticket-service/src/workers/blockchain-reconciliation.worker.ts` | Reconciliation |
| `ticket-service/src/migrations/003_add_blockchain_tracking.ts` | Tables |
| `ticket-service/src/migrations/006_add_ticket_state_machine.ts` | Transfer tracking |

---

## Related Documents

- `NFT_MINTING_LIFECYCLE_FLOW_AUDIT.md` - Minting process
- `TICKET_TRANSFER_FLOW_AUDIT.md` - Transfer verification
- `BLOCKCHAIN_FLOW_AUDIT.md` - General blockchain status
