# ADR-001: Blockchain vs Database Source of Truth

**Status:** Accepted  
**Date:** 2025-12-31  
**Authors:** Security Team

## Context

The ticket-service needs clear guidelines on what data lives where and which system is authoritative for each type of data. Without this clarity, we risk:
- Data inconsistencies between blockchain and database
- Security vulnerabilities from trusting the wrong source
- Confusion during incident response

## Decision

We define explicit source of truth boundaries between the blockchain (Solana) and the database (PostgreSQL).

## Source of Truth Definitions

### Blockchain is Authoritative For:

| Data Type | Description | Why Blockchain? |
|-----------|-------------|-----------------|
| **NFT Ownership** | Current owner of each ticket NFT | Immutable, cryptographically verified, prevents double-spending |
| **Transfer History** | Complete chain of custody for each ticket | Immutable audit trail, cannot be modified retroactively |
| **Token Existence** | Whether an NFT was actually minted | Only the blockchain can prove a token exists |
| **Burn Status** | Whether a ticket has been burned/invalidated | Prevents resurrection of burned tokens |

**Verification Rule:** For ownership operations (transfers, validations), ALWAYS verify against blockchain before trusting database.

### Database is Authoritative For:

| Data Type | Description | Why Database? |
|-----------|-------------|---------------|
| **User Profiles** | User account details, preferences, contact info | Mutable user data, no need for blockchain immutability |
| **Event Metadata** | Event name, date, venue, description | Frequently updated, no ownership implications |
| **Pricing Information** | Ticket prices, discounts, tax calculations | Business logic, needs fast updates |
| **Purchase Intent** | Shopping carts, reservations | Temporary data, not ownership |
| **Check-in Status** | Whether ticket was scanned at venue | Operational data, needs low latency |

**Verification Rule:** These can be trusted from database alone, no blockchain verification needed.

### Hybrid Data (Both Systems):

| Data Type | Primary Source | Secondary Cache | Sync Strategy |
|-----------|----------------|-----------------|---------------|
| **Ticket Status** | Blockchain (for ownership-related) | DB (for display) | Webhook + polling |
| **Mint Status** | Blockchain | DB | Confirmation callback |
| **Token Metadata URI** | Blockchain | DB | Sync on change |

## Consistency Rules

### Rule 1: Write Blockchain First
For any operation that affects NFT state:
1. Submit blockchain transaction
2. Record as "pending" in database
3. Wait for blockchain confirmation
4. ONLY THEN update database state to "confirmed"

```typescript
// CORRECT: Wait for blockchain
const tx = await submitBlockchainTransaction();
await waitForConfirmation(tx.signature);
await updateDatabaseState('confirmed');

// WRONG: Update DB immediately
await updateDatabaseState('confirmed'); // DON'T DO THIS
await submitBlockchainTransaction();    // What if this fails?
```

### Rule 2: Verify Before Trust
For critical operations, verify blockchain state:

```typescript
// Before allowing transfer
const onChainOwner = await blockchain.getOwner(tokenId);
const dbOwner = await db.getOwner(tokenId);

if (onChainOwner !== dbOwner) {
  await logReconciliationMismatch(tokenId, onChainOwner, dbOwner);
  // Trust blockchain, fix database
  await db.updateOwner(tokenId, onChainOwner);
}
```

### Rule 3: Handle Failures Gracefully
If blockchain operation fails:
1. Mark DB record as "failed"
2. DO NOT proceed with dependent operations
3. Alert operators
4. Enable manual retry

## Reconciliation Process

### Scheduled Reconciliation (Every 5 minutes)
1. Fetch all "pending" transactions older than 2 minutes
2. Check blockchain for confirmation
3. Update status accordingly
4. Log mismatches

### On-Demand Reconciliation
Trigger for:
- Before high-value transfers
- On check-in validation
- Customer support requests

## Consequences

### Positive
- Clear ownership of data
- Consistent error handling
- Easier debugging
- Regulatory compliance

### Negative
- Higher latency for blockchain-verified operations
- More complex code paths
- Need for reconciliation infrastructure

## Related Documents
- `docs/runbooks/blockchain-incidents.md` - Incident response
- `src/services/solanaService.ts` - Implementation
- `src/migrations/003_add_blockchain_tracking.ts` - Database schema
