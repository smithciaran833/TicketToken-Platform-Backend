# Audit Report: blockchain-indexer Internal Endpoints

**Date:** January 21, 2026
**Service:** blockchain-indexer
**Port:** 3012
**Purpose:** Determine if blockchain-indexer needs `/internal/` endpoints

---

## Executive Summary

**RECOMMENDATION: blockchain-indexer SHOULD have internal endpoints**

The blockchain-indexer is a critical data provider that indexes Solana blockchain data. Other services (payment-service) need to query it for on-chain data. Currently, all routes are under `/api/v1/` but there is a **critical missing endpoint** that payment-service expects.

### Key Issues Found:
1. **CRITICAL: Missing endpoint** - `POST /api/v1/marketplace/sales` is called by payment-service but does NOT exist
2. **Auth migration needed** - Currently uses JWT, needs to switch to HMAC for S2S (per standardization doc)
3. **Route reorganization recommended** - Move S2S endpoints to `/internal/` prefix

---

## 1. HTTP Calls TO blockchain-indexer

### Search Methodology
Searched the entire codebase (21 services) for:
- `BLOCKCHAIN_INDEXER_URL` or `INDEXER_URL` environment variables
- `http://blockchain-indexer` URL patterns
- `indexerClient` or indexer HTTP client references
- Port references (`:3012`, `:3019`)

### Findings

| Service | Endpoint Called | Purpose | Status |
|---------|----------------|---------|--------|
| **payment-service** | `POST /api/v1/marketplace/sales` | Get secondary sales for royalty reconciliation | **MISSING** |
| **payment-service** | `GET /api/v1/transactions/:signature` | Get transaction details | **EXISTS** |
| **monitoring-service** | `GET /health` | Health monitoring | **EXISTS** |

### Critical Finding: Missing Endpoint

**File:** `payment-service/src/services/reconciliation/royalty-reconciliation.service.ts:72`
```typescript
const response = await axios.post(`${this.blockchainIndexerUrl}/api/v1/marketplace/sales`, {
  startDate: startDate.toISOString(),
  endDate: endDate.toISOString(),
  eventType: 'sale'
});
```

This endpoint does **NOT exist** in blockchain-indexer's routes. The payment-service's royalty reconciliation will fail when trying to fetch secondary sales data.

### Port Confusion
Different documentation references different ports:
- Dockerfile healthcheck: `localhost:3012`
- monitoring-service DEPLOYMENT.md: `http://blockchain-indexer:3019`
- payment-service default: `http://blockchain-indexer:3012`

**Recommendation:** Standardize to port 3012 as per Dockerfile.

---

## 2. Queue Messages FROM blockchain-indexer

### Search Methodology
Searched blockchain-indexer source code for:
- `publish`, `emit`, `sendToQueue`, `channel.`
- `amqp`, `rabbitmq`, `bull`, `redis.*queue`

### Findings

**blockchain-indexer does NOT use message queues.**

It uses a **synchronous HTTP model**:
1. Polls Solana blockchain for transactions
2. Writes to PostgreSQL (indexer state) and MongoDB (full data)
3. Calls ticket-service HTTP API to update ticket state

### Event Types (Local Only)

blockchain-indexer defines these event types but they are **NOT published to queues**:

| Event Type | Description | How It's Used |
|------------|-------------|---------------|
| `blockchain.transaction.processed` | Transaction indexed | Local deduplication |
| `blockchain.nft.minted` | NFT mint detected | Triggers ticket-service HTTP call |
| `blockchain.nft.transferred` | NFT transfer detected | Triggers ticket-service HTTP call |
| `blockchain.nft.burned` | NFT burn detected | Triggers ticket-service HTTP call |
| `blockchain.marketplace.activity` | Marketplace event | Triggers ticket-service HTTP call |
| `blockchain.discrepancy.detected` | Ownership mismatch found | Local logging |

### Redis Usage (Not Queue)
- Event deduplication (24-hour TTL)
- Caching
- Distributed locking for indexer coordination

### Conclusion
**blockchain-indexer communicates state changes via HTTP to ticket-service, not via message queues.**

---

## 3. Current Routes

### From `src/routes/query.routes.ts` (All require JWT)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/transactions/:signature` | GET | Get transaction by signature |
| `/api/v1/transactions/by-slot/:slot` | GET | Get transactions by slot |
| `/api/v1/wallets/:address/activity` | GET | Get wallet activity |
| `/api/v1/nfts/:tokenId/history` | GET | Get NFT transfer history |
| `/api/v1/marketplace/activity` | GET | Get marketplace activity |
| `/api/v1/sync/status` | GET | Get indexer sync status |
| `/api/v1/reconciliation/discrepancies` | GET | Get ownership discrepancies |

### From `src/api/server.ts` (Internal API)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/metrics` | GET | Prometheus metrics |
| `/stats` | GET | Indexer statistics |
| `/recent-activity` | GET | Recent blockchain activity |
| `/reconciliation/status` | GET | Reconciliation status |
| `/reconciliation/run` | POST | Trigger reconciliation |
| `/control/stop` | POST | Stop indexer |
| `/control/start` | POST | Start indexer |

### Internal Routes
**None** - No `/internal/` routes exist.

---

## 4. Missing Endpoints

### Critical: POST /internal/marketplace/sales

**Required by:** payment-service (royalty-reconciliation.service.ts)
**Purpose:** Query secondary sales data for royalty calculation

**Proposed Implementation:**
```typescript
// POST /internal/marketplace/sales
{
  body: {
    startDate: string,    // ISO 8601
    endDate: string,      // ISO 8601
    eventType?: 'sale' | 'listing' | 'delisting'
  },
  response: {
    sales: Array<{
      signature: string,
      tokenId: string,
      price: number,
      seller: string,
      buyer: string,
      timestamp: Date,
      eventId?: string,
      venueId?: string
    }>
  }
}
```

### Recommended: Migrate Existing Routes to /internal/

Since these endpoints are only called by other services (not external users), they should be under `/internal/`:

| Current Route | Proposed Route |
|---------------|----------------|
| `GET /api/v1/transactions/:signature` | `GET /internal/transactions/:signature` |
| `GET /api/v1/transactions/by-slot/:slot` | `GET /internal/transactions/by-slot/:slot` |
| `GET /api/v1/wallets/:address/activity` | `GET /internal/wallets/:address/activity` |
| `GET /api/v1/nfts/:tokenId/history` | `GET /internal/nfts/:tokenId/history` |
| `GET /api/v1/marketplace/activity` | `GET /internal/marketplace/activity` |
| `GET /api/v1/sync/status` | `GET /internal/sync/status` |
| `GET /api/v1/reconciliation/discrepancies` | `GET /internal/reconciliation/discrepancies` |

### Additional Useful Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /internal/nfts/:tokenId` | Get NFT on-chain data (ownership, status) |
| `GET /internal/blocks/latest` | Get latest indexed block |
| `POST /internal/reindex/:tokenId` | Trigger reindex for specific NFT |
| `GET /internal/health/deep` | Deep health check including RPC connectivity |

---

## 5. Architecture Analysis

### Current Data Flow

```
┌───────────────────┐      ┌────────────────────────────────────┐
│  Solana Blockchain │──poll──│     blockchain-indexer            │
└───────────────────┘         │                                    │
                              │  ┌────────────────┐                │
                              │  │ Transaction    │                │
                              │  │ Processor      │                │
                              │  └───────┬────────┘                │
                              │          │                          │
                              │          ▼                          │
                              │  ┌────────────────┐                │
                              │  │ ticket-service │◄───HTTP CALL──│
                              │  │ Client         │                │
                              │  └────────────────┘                │
                              │          │                          │
                              │          ▼                          │
                              │  ┌────────────────┐                │
                              │  │ Dual Write:    │                │
                              │  │ PostgreSQL +   │                │
                              │  │ MongoDB        │                │
                              │  └────────────────┘                │
                              └────────────────────────────────────┘
                                         ▲
                                         │ HTTP query
                                         │
                              ┌──────────┴───────────┐
                              │   payment-service    │
                              │ (royalty reconcil.)  │
                              └──────────────────────┘
```

### Key Relationships

| Direction | From | To | Method |
|-----------|------|-----|--------|
| **Outgoing** | blockchain-indexer | ticket-service | HTTP (via shared client) |
| **Incoming** | payment-service | blockchain-indexer | HTTP |
| **Incoming** | monitoring-service | blockchain-indexer | HTTP (health check) |

### blockchain-indexer CALLS ticket-service

blockchain-indexer uses `@tickettoken/shared/clients` to call ticket-service:

```typescript
// From transactionProcessor.ts
await ticketServiceClient.updateBlockchainSyncByToken(tokenId, {
  isMinted: true,
  mintTransactionId: signature,
  walletAddress: owner,
  syncStatus: 'SYNCED',
}, ctx);

await ticketServiceClient.recordBlockchainTransfer({
  tokenId,
  fromWallet,
  toWallet,
  transactionSignature,
  slot,
}, ctx);
```

---

## 6. Authentication Migration Required

### Current State
blockchain-indexer uses **JWT authentication** with:
- Algorithm whitelist: `HS256, HS384, HS512, RS256, RS384, RS512`
- Issuer validation: `tickettoken-auth-service`
- Audience validation: `blockchain-indexer`

### Required Migration (Per Standardization Doc)
Switch to **HMAC-SHA256** for S2S authentication:

| Current | Target |
|---------|--------|
| JWT in Authorization header | HMAC signature in `X-Request-Signature` |
| Algorithm whitelist validation | SHA256 HMAC validation |
| Audience/Issuer claims | Service ID in `X-Service-ID` header |

**Priority:** P1 (from standardization decisions)

---

## 7. Final Recommendation

### Decision: YES - Internal Endpoints Needed

| Criterion | Assessment |
|-----------|------------|
| Services calling blockchain-indexer | **1** (payment-service) |
| Missing endpoints | **1 critical** (marketplace/sales) |
| Current internal routes | **None** |
| Needs migration to /internal/ | **Yes** (7 endpoints) |

### Action Items

#### P0: Critical (Blocking)
1. **Implement `POST /internal/marketplace/sales`** - payment-service cannot function without this

#### P1: High Priority
2. **Migrate JWT to HMAC** for S2S authentication
3. **Move existing endpoints to `/internal/` prefix**
4. **Standardize port to 3012**

#### P2: Medium Priority
5. **Add `GET /internal/nfts/:tokenId`** for on-chain NFT data
6. **Add `GET /internal/blocks/latest`** for sync monitoring
7. **Add `POST /internal/reindex/:tokenId`** for recovery operations

### Proposed Internal Routes Structure

```
/internal/
├── transactions/
│   ├── GET /:signature          # Get transaction by signature
│   └── GET /by-slot/:slot       # Get transactions by slot
├── wallets/
│   └── GET /:address/activity   # Get wallet activity
├── nfts/
│   ├── GET /:tokenId            # Get NFT data
│   ├── GET /:tokenId/history    # Get NFT transfer history
│   └── POST /:tokenId/reindex   # Trigger reindex
├── marketplace/
│   ├── GET /activity            # Get marketplace activity
│   └── POST /sales              # Query sales (NEW - CRITICAL)
├── sync/
│   └── GET /status              # Get indexer sync status
├── blocks/
│   └── GET /latest              # Get latest indexed block
└── reconciliation/
    ├── GET /discrepancies       # Get ownership discrepancies
    └── POST /run                # Trigger reconciliation
```

---

## Appendix: Search Results Summary

### Files Examined
- All 21 services in `backend/services/`
- `backend/services/blockchain-indexer/src/routes/*.ts`
- `backend/services/blockchain-indexer/src/api/server.ts`
- `backend/services/payment-service/src/services/reconciliation/`

### Search Patterns Used
```bash
# Pattern 1: Environment variables
BLOCKCHAIN_INDEXER_URL|INDEXER_URL|blockchain-indexer|indexerClient

# Pattern 2: Port references
localhost:3012|localhost:3019|:3012|:3019

# Pattern 3: Queue publishing
publish|emit|sendToQueue|channel\.|amqp|rabbitmq

# Pattern 4: Missing endpoint
/marketplace/sales
```

### References Found
- payment-service: 2 HTTP calls to blockchain-indexer (1 endpoint MISSING)
- monitoring-service: Health check only (docs reference)
- ticket-service: Receives HTTP calls FROM blockchain-indexer (not TO)

---

## Conclusion

**blockchain-indexer is a critical data provider that other services query for blockchain state.**

Current issues:
1. **Critical missing endpoint** - `POST /api/v1/marketplace/sales`
2. **Auth model mismatch** - Uses JWT, needs HMAC
3. **No `/internal/` prefix** - Routes should be reorganized

**Status: ACTION REQUIRED - Implement missing endpoint and migrate to internal route pattern**
