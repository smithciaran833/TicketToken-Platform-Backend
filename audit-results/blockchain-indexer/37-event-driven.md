# Blockchain-Indexer Service - 37 Event-Driven Architecture Audit

**Service:** blockchain-indexer
**Document:** 37-event-driven.md
**Date:** 2025-12-26
**Auditor:** Cline AI
**Pass Rate:** 60% (12/20 applicable checks)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 1 | No event bus/message queue for cross-service communication |
| HIGH | 2 | No outbound event publishing, no event schema versioning |
| MEDIUM | 3 | WebSocket reconnection not handled, no event replay capability |
| LOW | 2 | No event deduplication at consumer level, limited event metadata |

---

## Event Sources Overview

| Source | Type | Events Generated |
|--------|------|------------------|
| Solana RPC | WebSocket | Account changes (program subscriptions) |
| Solana RPC | Polling | New transactions (backup) |
| Marketplace Programs | WebSocket | Sales, listings, delistings |

---

## Section 3.1: Inbound Event Consumption (WebSocket)

### WS1: WebSocket subscription to Solana
**Status:** PASS
**Evidence:** `src/indexer.ts:45-53`
```typescript
async start(): Promise<void> {
  const programId = new PublicKey(config.solana.programId!);
  
  this.subscription = this.connection.onProgramAccountChange(
    programId,
    async (accountInfo, context) => {
      await this.handleAccountChange(accountInfo, context);
    },
    config.solana.commitment as any
  );
}
```

### WS2: Marketplace WebSocket subscriptions
**Status:** PASS
**Evidence:** `src/processors/marketplaceTracker.ts:46-62`
```typescript
async startTracking(): Promise<void> {
  for (const [key, marketplace] of Object.entries(this.marketplaces)) {
    await this.subscribeToMarketplace(key, marketplace);
  }
}

private async subscribeToMarketplace(key: string, marketplace: MarketplaceConfig): Promise<void> {
  const subscriptionId = this.connection.onAccountChange(
    new PublicKey(marketplace.programId),
    (accountInfo, context) => {
      this.processMarketplaceActivity(marketplace, accountInfo, context);
    },
    { commitment: 'confirmed' }
  );
  this.subscriptions.set(key, subscriptionId);
}
```

### WS3: Subscription cleanup on shutdown
**Status:** PASS
**Evidence:** `src/indexer.ts:109-116`
```typescript
async stop(): Promise<void> {
  if (this.subscription) {
    await this.connection.removeAccountChangeListener(this.subscription);
    this.subscription = null;
  }
}
```

### WS4: Reconnection handling
**Status:** FAIL
**Evidence:** No reconnection logic for WebSocket disconnection.
**Issue:** If WebSocket disconnects, service relies only on polling fallback.
**Remediation:**
```typescript
this.connection.on('accountNotification', callback);
this.connection.on('error', async (error) => {
  logger.error({ error }, 'WebSocket error, reconnecting...');
  await this.reconnect();
});
```

---

## Section 3.2: Event Processing

### EP1: Transaction event processing
**Status:** PASS
**Evidence:** `src/processors/transactionProcessor.ts:42-90`
```typescript
async processTransaction(tx: any, signature: string, slot: number, blockTime: number): Promise<void> {
  // Check if already processed
  const exists = await this.checkDuplicate(signature);
  if (exists) {
    logger.debug({ signature }, 'Transaction already processed');
    return;
  }
  
  // Parse instruction type
  const instructionType = this.parseInstructionType(tx);
  
  // Process based on type
  switch (instructionType) {
    case 'MINT_NFT':
      await this.processMint(tx, signature, slot, blockTime);
      break;
    case 'TRANSFER':
      await this.processTransfer(tx, signature, slot, blockTime);
      break;
    case 'BURN':
      await this.processBurn(tx, signature, slot, blockTime);
      break;
  }
  
  // Record in PostgreSQL
  await this.recordTransaction(signature, slot, blockTime, instructionType);
  
  // Save to MongoDB
  await this.saveToMongoDB(tx, signature, slot, blockTime);
}
```

### EP2: Marketplace event processing
**Status:** PASS
**Evidence:** `src/processors/marketplaceTracker.ts:84-120`
```typescript
private async processMarketplaceActivity(marketplace: MarketplaceConfig, accountInfo: any, context: any): Promise<void> {
  try {
    const tx = await this.connection.getParsedTransaction(context.signature);
    const activity = await this.parseMarketplaceTransaction(marketplace, tx);
    
    if (activity) {
      await this.recordActivity(marketplace, activity, context);
      await this.updateTicketStatus(activity);
    }
  } catch (error) {
    logger.error({ error, marketplace }, 'Failed to process marketplace activity');
  }
}
```

### EP3: Event type detection
**Status:** PASS
**Evidence:** `src/processors/transactionProcessor.ts:92-112`
```typescript
private parseInstructionType(tx: any): InstructionType {
  const logs = tx?.meta?.logMessages || [];
  
  for (const log of logs) {
    if (log.includes('MintNFT') || log.includes('Instruction: Mint')) {
      return 'MINT_NFT';
    }
    if (log.includes('Transfer') || log.includes('Instruction: Transfer')) {
      return 'TRANSFER';
    }
    if (log.includes('Burn') || log.includes('Instruction: Burn')) {
      return 'BURN';
    }
  }
  
  return 'UNKNOWN';
}
```

---

## Section 3.3: Outbound Event Publishing

### OP1: Event bus/message queue integration
**Status:** FAIL
**Evidence:** No RabbitMQ, Kafka, or Redis pub/sub integration.
**Issue:** Service processes events but doesn't publish them to other services.
**Impact:** Other services can't react to blockchain events in real-time.
**Remediation:**
```typescript
import { Channel, connect } from 'amqplib';

class EventPublisher {
  private channel: Channel;
  
  async publishEvent(event: BlockchainEvent): Promise<void> {
    await this.channel.publish(
      'blockchain-events',
      event.type,
      Buffer.from(JSON.stringify(event))
    );
  }
}

// In transactionProcessor
await this.eventPublisher.publishEvent({
  type: 'TRANSFER',
  signature,
  tokenId,
  fromOwner,
  toOwner,
  timestamp: new Date()
});
```

### OP2: Event schema definition
**Status:** FAIL
**Evidence:** No formal event schema or contract.
**Issue:** No typed event interfaces for external consumers.
**Remediation:**
```typescript
interface BlockchainEvent {
  version: string;  // Schema version
  type: 'MINT' | 'TRANSFER' | 'BURN' | 'SALE' | 'LISTING';
  signature: string;
  tokenId: string;
  timestamp: Date;
  metadata: Record<string, any>;
}

interface TransferEvent extends BlockchainEvent {
  type: 'TRANSFER';
  fromOwner: string;
  toOwner: string;
}
```

### OP3: Event versioning
**Status:** FAIL
**Evidence:** No event version field in stored data.
**Issue:** Schema evolution not supported.

---

## Section 3.4: Event Storage (MongoDB)

### ES1: Event document model
**Status:** PASS
**Evidence:** `src/models/blockchain-transaction.model.ts`
```typescript
const blockchainTransactionSchema = new Schema({
  signature: { type: String, required: true, unique: true },
  slot: { type: Number, required: true, index: true },
  blockTime: { type: Date, required: true, index: true },
  accounts: [{
    pubkey: String,
    isSigner: Boolean,
    isWritable: Boolean
  }],
  instructions: [{
    programId: String,
    data: String,
    accounts: [String]
  }],
  logs: [String],
  fee: Number,
  status: String,
  errorMessage: String,
  indexedAt: { type: Date, default: Date.now }
});
```

### ES2: Compound indexes
**Status:** PASS
**Evidence:** `src/models/blockchain-transaction.model.ts`
```typescript
blockchainTransactionSchema.index({ blockTime: -1, slot: -1 });
blockchainTransactionSchema.index({ 'accounts.pubkey': 1, blockTime: -1 });
blockchainTransactionSchema.index({ 'instructions.programId': 1, blockTime: -1 });
```

### ES3: Event metadata
**Status:** PARTIAL
**Evidence:** Basic metadata stored but no correlation IDs or trace context.
```typescript
// Missing fields:
// - correlationId for request tracing
// - causationId for event chain
// - version for schema evolution
```

---

## Section 3.5: Event Deduplication

### ED1: Signature-based deduplication
**Status:** PASS
**Evidence:** `src/processors/transactionProcessor.ts:45-51`
```typescript
private async checkDuplicate(signature: string): Promise<boolean> {
  const result = await db.query(
    'SELECT 1 FROM indexed_transactions WHERE signature = $1',
    [signature]
  );
  return result.rows.length > 0;
}
```

### ED2: MongoDB upsert pattern
**Status:** PASS
**Evidence:** `src/processors/transactionProcessor.ts:84-89`
```typescript
try {
  await this.saveToMongoDB(tx, signature, slot, blockTime);
} catch (error: any) {
  if (error.code === 11000) {  // Duplicate key
    logger.debug({ signature }, 'Transaction already in MongoDB');
  }
}
```

### ED3: Idempotent processing
**Status:** PASS
**Evidence:** Duplicate transactions are detected and skipped.

---

## Section 3.6: Event Ordering

### EO1: Slot-based ordering
**Status:** PASS
**Evidence:** Events processed in slot order:
```typescript
const signatures = await this.connection.getSignaturesForAddress(programId, {
  limit: 100,
  before: this.lastProcessedSignature
});
// Signatures returned in reverse slot order
```

### EO2: Ordering guarantees
**Status:** PARTIAL
**Evidence:** No strict ordering guarantees for concurrent events.
**Issue:** Parallel processing could result in out-of-order handling.

---

## Section 3.7: Missing Event-Driven Patterns

### MED1: Event replay capability
**Status:** FAIL
**Evidence:** No mechanism to replay events from a specific point.
**Issue:** Cannot re-process events after bug fix or new subscriber.
**Remediation:** Store events in append-only log or use Kafka.

### MED2: Dead letter queue
**Status:** FAIL
**Evidence:** Failed events logged but not queued for retry.

### MED3: Event streaming to consumers
**Status:** FAIL
**Evidence:** No SSE, WebSocket, or message queue for consumers.
**Issue:** Other services must poll database for updates.

### MED4: Event aggregation
**Status:** FAIL
**Evidence:** No event aggregation (e.g., hourly summaries).

---

## Remediation Priority

### CRITICAL (Immediate)
1. **Implement event publishing** - RabbitMQ or Redis pub/sub
```typescript
// Publish events for other services
await eventBus.publish('blockchain.transaction.transfer', {
  signature,
  tokenId,
  fromOwner,
  toOwner,
  timestamp
});
```

### HIGH (This Week)
1. **Define event schemas** - TypeScript interfaces for all event types
2. **Add event versioning** - Include version field in all events

### MEDIUM (This Month)
1. **Add WebSocket reconnection** - Auto-reconnect on disconnect
2. **Add correlation IDs** - For event chain tracing
3. **Implement event replay** - From specific slot or timestamp

### LOW (Backlog)
1. **Event streaming API** - SSE or WebSocket for consumers
2. **Dead letter queue** - For failed event processing
3. **Event aggregation jobs** - Hourly/daily summaries

---

## Pass/Fail Summary by Section

| Section | Pass | Fail | Partial | N/A | Total |
|---------|------|------|---------|-----|-------|
| WebSocket Consumption | 3 | 1 | 0 | 0 | 4 |
| Event Processing | 3 | 0 | 0 | 0 | 3 |
| Outbound Publishing | 0 | 3 | 0 | 0 | 3 |
| Event Storage | 2 | 0 | 1 | 0 | 3 |
| Event Deduplication | 3 | 0 | 0 | 0 | 3 |
| Event Ordering | 1 | 0 | 1 | 0 | 2 |
| Missing Patterns | 0 | 4 | 0 | 0 | 4 |
| **Total** | **12** | **8** | **2** | **0** | **22** |

**Applicable Checks:** 22
**Pass Rate:** 55% (12/22 pass cleanly)
**Pass + Partial Rate:** 64% (14/22)

---

## Event Flow Diagram
```
Solana Blockchain
       │
       ▼
┌──────────────────┐
│   WebSocket      │ ◄── onProgramAccountChange
│   Subscriptions  │ ◄── onAccountChange (Marketplaces)
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│   Event Handler  │ ─── transactionProcessor.processTransaction()
│   (Processing)   │ ─── marketplaceTracker.processMarketplaceActivity()
└────────┬─────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌────────┐  ┌────────┐
│PostgreSQL│ │MongoDB │ ◄── Dual-write storage
└────────┘  └────────┘
         │
         ▼
    ❌ NO EVENT BUS ❌
    (Other services cannot subscribe)
```

---

## Positive Findings

1. **WebSocket subscriptions** - Real-time blockchain event consumption
2. **Polling fallback** - Backup mechanism if WebSocket fails
3. **Deduplication** - Signature-based duplicate detection
4. **MongoDB indexing** - Efficient event querying
5. **Marketplace tracking** - Multi-marketplace support
6. **Event type detection** - Log parsing for event classification
7. **Dual-write storage** - PostgreSQL + MongoDB for different query patterns
