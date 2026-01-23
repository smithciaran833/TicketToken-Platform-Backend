# Queue Standardization - Phase 3 Findings

## Overview

Phase 3 (P2) cleanup and validation for Decision #4 Queue Standards.

**Date**: January 2025
**Status**: COMPLETE

---

## Issue 7: Orphaned mint.success Event

### Finding

The `mint.success` event is **ORPHANED** - published but never consumed.

**Publisher**: `blockchain-service/src/workers/mint-worker.ts:119-128`
```typescript
await this.channel.publish('events', 'mint.success', Buffer.from(JSON.stringify({
  orderId: job.orderId,
  mintAddress: mintResult.mintAddress,
  transactionSignature: mintResult.transactionSignature,
  metadataUri: mintResult.metadataUri,
  venueId: job.venueId,
  creators,
  timestamp: new Date().toISOString()
})));
```

**Consumers**: **NONE**

**Expected Consumer**: `ticket-service` should update ticket NFT fields when mint completes:
- Endpoint exists: `POST /internal/tickets/:ticketId/update-nft`
- Fields ready: `nft_minted_at`, `nft_token_id`, `nft_metadata_uri`, `wallet_address`

### Decision

**Document as Gap** - This is tracked as future work. The mint.success event IS useful for the workflow but requires additional implementation:

1. A consumer (likely in minting-service or blockchain-indexer) needs to:
   - Subscribe to `mint.success` events
   - Map orderId to ticketIds
   - Call ticket-service `/internal/tickets/:ticketId/update-nft` endpoint

### Recommendation

Create a follow-up task to implement the mint.success consumer. Priority: Medium.

---

## Issue 8: BullMQ Documentation

### Finding

Per STANDARDIZATION_DECISIONS.md, the standard is **Bull** (not BullMQ).

**Current State**:
- Most services use `bull` package
- `notification-service` uses `bullmq` package (newer API)

**Migration Status**:
- BullMQ → Bull migration for notification-service is **PENDING** (P2 priority)
- Documentation references both Bull and BullMQ

### Decision

Keep documentation accurate to current implementation:
- Services using `bull` → document as "Bull"
- Services using `bullmq` → document as "BullMQ (pending migration to Bull)"

The notification-service BullMQ→Bull migration is a separate task tracked in STANDARDIZATION_DECISIONS.md.

---

## Issue 9: Unused amqplib Dependencies

### Finding

Checked all 13 services with amqplib in package.json:

| Service | Uses amqplib? | Action |
|---------|--------------|--------|
| auth-service | YES | Keep |
| event-service | YES | Keep |
| minting-service | YES | Keep |
| marketplace-service | YES | Keep |
| blockchain-service | YES | Keep |
| venue-service | YES | Keep |
| search-service | YES | Keep |
| ticket-service | YES | Keep |
| analytics-service | YES | Keep |
| payment-service | YES | Keep |
| order-service | YES | Keep |
| notification-service | YES | Keep |
| **integration-service** | **NO** | **REMOVED** |

### Action Taken

Removed unused `amqplib` and `@types/amqplib` from `integration-service/package.json`.

---

## Queue Technology Summary

Per Decision #4:

### RabbitMQ (Inter-Service Events)
- **Purpose**: Pub/sub events across services
- **Used By**: All services that publish or consume events
- **Exchange Types**: topic (durable)
- **Package**: `amqplib`

### Bull (Internal Background Jobs)
- **Purpose**: Background job processing within a single service
- **Used By**: minting-service, blockchain-service, most services
- **Backend**: Redis
- **Package**: `bull`

### BullMQ (Legacy - Pending Migration)
- **Used By**: notification-service only
- **Status**: Pending migration to Bull
- **Package**: `bullmq`

### pg-boss (Exception)
- **Purpose**: Financial/payment jobs requiring ACID guarantees
- **Used By**: queue-service only
- **Rationale**: See `/queue-service/docs/QUEUE_ARCHITECTURE.md`
- **Status**: APPROVED exception - will NOT migrate to Bull

---

## Event Flow Summary

```
                          RabbitMQ Exchanges
                    ┌─────────────────────────────┐
                    │  tickettoken_events (topic) │
                    │  marketplace-events (topic) │
                    │  auth-events (topic)        │
                    │  event-lifecycle (topic)    │
                    └─────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
   ┌─────────┐          ┌─────────┐          ┌─────────┐
   │ Service │          │ Service │          │ Service │
   │   A     │          │   B     │          │   C     │
   └────┬────┘          └────┬────┘          └────┬────┘
        │                    │                    │
        ▼                    ▼                    ▼
   ┌─────────┐          ┌─────────┐          ┌─────────┐
   │  Bull   │          │  Bull   │          │  Bull   │
   │ (Redis) │          │ (Redis) │          │ (Redis) │
   └─────────┘          └─────────┘          └─────────┘
   Internal Jobs        Internal Jobs        Internal Jobs
```

---

## Completed Work

### 1. mint.success Consumer - IMPLEMENTED
Added observability consumer in minting-service for mint.success events:
- **File**: `minting-service/src/config/rabbitmq.ts`
- **Queue**: `minting.mint-success`
- **Routing Keys**: `mint.success`, `mint.completed`
- **Purpose**: Observability, metrics, and audit logging

Note: The ticket-service NFT update is already handled directly by blockchain-service
via `ticketServiceClient.updateNft()`. The mint.success consumer provides visibility
into the minting flow without duplicating the update logic.

### 2. BullMQ → Bull Migration - COMPLETED
Migrated notification-service from BullMQ to Bull:
- **File**: `notification-service/src/services/queue.service.ts`
- **Changes**:
  - Replaced `bullmq` imports with `bull`
  - Updated Queue/Worker API to Bull format
  - Removed `bullmq` from package.json
- **API Compatibility**: Maintained same public interface

---

## Validation Checklist

- [x] All services with RabbitMQ publish use real amqplib (not stubs)
- [x] All services with RabbitMQ consume use real amqplib (not stubs)
- [x] minting-service bridges RabbitMQ → Bull correctly
- [x] minting-service consumes mint.success for observability
- [x] ticket-service consumes from RabbitMQ correctly
- [x] marketplace-service publishes to RabbitMQ correctly
- [x] auth-service publishes to RabbitMQ correctly
- [x] event-service publishes to RabbitMQ correctly
- [x] queue-service pg-boss exception documented
- [x] integration-service unused amqplib removed
- [x] mint.success consumer implemented
- [x] notification-service BullMQ → Bull migration complete
