# MINTING SERVICE - COMPLETE DOCUMENTATION

**Last Updated:** October 13, 2025  
**Version:** 1.0.0  
**Status:** DEVELOPMENT (NOT PRODUCTION READY) ⚠️

---

## EXECUTIVE SUMMARY

**Minting-service is the blockchain backbone of the TicketToken platform.**

This service demonstrates:
- ✅ Solana compressed NFT minting (Metaplex Bubblegum)
- ✅ Queue-based async processing (Bull + Redis)
- ✅ Retry mechanisms with exponential backoff
- ✅ Reconciliation service (blockchain ↔ database sync)
- ✅ Internal service authentication (HMAC)
- ⚠️ RPC management with failover
- ⚠️ Merkle tree management (16,384 capacity)
- ⚠️ Gas estimation
- ❌ INCOMPLETE: Mock implementations, placeholder code
- ❌ INCOMPLETE: Production-ready security
- ❌ INCOMPLETE: Type safety (mixed TS/JS)

**This is a PROTOTYPE with production patterns but incomplete implementation.**

---

## QUICK REFERENCE

- **Service:** minting-service
- **Port:** 3018 (configurable via MINTING_SERVICE_PORT)
- **Framework:** Express.js
- **Database:** PostgreSQL (tickettoken_db)
- **Cache:** Redis
- **Message Queue:** Bull (Redis-backed)
- **Blockchain:** Solana Devnet (Metaplex Bubblegum)
- **Files:** 32 files across 11 directories

---

## BUSINESS PURPOSE

### What This Service Does

**Core Responsibilities:**
1. Mint compressed NFTs on Solana for purchased tickets
2. Queue minting jobs from payment-service
3. Manage merkle trees for compressed NFT storage
4. Handle minting retries on failure
5. Reconcile blockchain state with database
6. Track minting status and transaction hashes
7. Estimate and manage gas fees
8. Store NFT metadata (IPFS placeholders)
9. Process internal service requests (payment → mint)
10. Provide webhook endpoints for payment completion

**Business Value:**
- Tickets become tradeable NFTs after payment
- Buyers receive blockchain-verified ownership
- Resale marketplace enabled by NFT transfers
- Low-cost minting via Solana compression (16,384 NFTs per tree)
- Automated minting reduces manual work
- Retry logic ensures eventual consistency

---

## ARCHITECTURE OVERVIEW

### Technology Stack

```
Runtime: Node.js 20 + TypeScript/JavaScript (mixed)
Framework: Express.js
Database: PostgreSQL (via pg pool + Knex.js)
Cache: Redis (Bull queue backing)
Queue: Bull (Redis-backed)
Blockchain: Solana web3.js v1.91.0
NFT Standard: Metaplex Bubblegum (compressed NFTs)
Compression: SPL Account Compression
Validation: None (missing)
Monitoring: Winston logger + Prometheus metrics
Testing: Jest (minimal tests)
Security: Helmet + express-rate-limit
```

### Service Architecture Layers

```
┌─────────────────────────────────────────────────────────┐
│                    API LAYER (Express)                   │
│  Routes → Middleware → Services                          │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                   MIDDLEWARE LAYER                       │
│  • Internal Auth (HMAC signature validation)             │
│  • Rate Limiting (express-rate-limit)                    │
│  • Security Headers (Helmet)                             │
│  • NO request validation (missing Joi/Zod)               │
│  • NO idempotency (missing)                              │
│  • NO authentication for public endpoints (incomplete)   │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                    BUSINESS LOGIC                        │
│                                                          │
│  ORCHESTRATION:                                          │
│  └─ MintingOrchestrator                                  │
│     ├─ Prepares metadata (mock IPFS)                     │
│     ├─ Creates transactions (incomplete)                 │
│     ├─ Sends with retry (mock signatures)                │
│     ├─ Saves to database                                 │
│     └─ Updates ticket status                             │
│                                                          │
│  NFT SERVICES (unused/incomplete):                       │
│  ├─ CompressedNFTService (old implementation)            │
│  ├─ RealCompressedNFT (newer implementation)             │
│  └─ Neither fully integrated                             │
│                                                          │
│  METADATA:                                               │
│  └─ MetadataService (stub - returns mock IPFS)           │
│                                                          │
│  BLOCKCHAIN:                                             │
│  ├─ RPCManager (RPC failover with retry)                 │
│  └─ GasEstimator (missing)                               │
│                                                          │
│  RECONCILIATION:                                         │
│  └─ ReconciliationService                                │
│     ├─ DB → Chain validation                             │
│     ├─ Chain → DB validation (placeholder)               │
│     └─ Runs every 60 seconds                             │
│                                                          │
│  PAYMENT INTEGRATION:                                    │
│  └─ PaymentIntegration (webhook handler)                 │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                    DATA LAYER                            │
│  • Collection Model (Knex - unused)                      │
│  • Mint Model (Knex - unused)                            │
│  • NFT Model (Knex - unused)                             │
│  • Raw SQL queries (pg pool - actively used)             │
│  • Tables created on-the-fly (no migrations)             │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                   ASYNC PROCESSING                       │
│  • Bull Queue (mintQueue, retryQueue)                    │
│  • Minting Worker (processes queue jobs)                 │
│  • Reconciliation Service (cron-like)                    │
│  • NO outbox pattern                                     │
│  • NO event publishing                                   │
└─────────────────────────────────────────────────────────┘
```

---

## DATABASE SCHEMA

### Current Tables (Created On-The-Fly)

**nft_mints** (main minting ledger)
```sql
CREATE TABLE IF NOT EXISTS nft_mints (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id VARCHAR(255) UNIQUE NOT NULL,
  transaction_signature VARCHAR(255),
  mint_address VARCHAR(255),
  metadata_uri TEXT,
  merkle_tree VARCHAR(255),
  retry_count INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Created in: src/services/MintingOrchestrator.js (saveMintRecord)

Issues:
❌ No foreign keys to tickets table
❌ ticket_id is VARCHAR (should be UUID)
❌ No indexes except PRIMARY KEY
❌ status is VARCHAR (should be ENUM)
❌ No tenant_id (multi-tenancy missing)
```

**tickets** (updated by minting-service)
```sql
-- Assumed to exist in ticket-service database
-- Updated fields:
UPDATE tickets SET
  mint_address = $1,
  blockchain_status = 'minted',
  updated_at = NOW()
WHERE id = $2::uuid

Issues:
❌ Cross-service database updates (coupling)
❌ No verification that ticket exists first
❌ Creates mock tickets if not found
```

**reconciliation_reports** (reconciliation tracking)
```sql
CREATE TABLE IF NOT EXISTS reconciliation_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  timestamp TIMESTAMP DEFAULT NOW(),
  report_data JSONB,
  db_to_chain_count INTEGER,
  chain_to_db_count INTEGER,
  mismatch_count INTEGER,
  success_count INTEGER
);

-- Created in: src/services/ReconciliationService.js

Issues:
❌ No retention policy (grows forever)
❌ No indexes on timestamp
❌ JSONB report_data (hard to query)
```

### Missing Tables (Should Exist)

**collections** (defined in model, never created)
```sql
-- Defined in: src/models/Collection.ts
-- NEVER CREATED IN DATABASE

CREATE TABLE collections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  symbol VARCHAR(10) NOT NULL,
  contract_address VARCHAR(255) UNIQUE NOT NULL,
  blockchain VARCHAR(50) NOT NULL,
  max_supply INTEGER,
  current_supply INTEGER DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**nfts** (defined in model, never created)
```sql
-- Defined in: src/models/NFT.ts
-- NEVER CREATED IN DATABASE

CREATE TABLE nfts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  token_id VARCHAR(255) NOT NULL,
  contract_address VARCHAR(255) NOT NULL,
  owner_address VARCHAR(255) NOT NULL,
  metadata_uri TEXT,
  metadata JSONB,
  blockchain VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(token_id, contract_address)
);
```

**mints** (defined in model, different from nft_mints)
```sql
-- Defined in: src/models/Mint.ts
-- NEVER CREATED IN DATABASE

CREATE TABLE mints (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id VARCHAR(255) NOT NULL,
  nft_id UUID REFERENCES nfts(id),
  status VARCHAR(50) DEFAULT 'pending',
  transaction_hash VARCHAR(255),
  blockchain VARCHAR(50) NOT NULL,
  error TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);
```

### Recommended Schema (Production-Ready)

```sql
-- 1. Collections (merkle trees)
CREATE TABLE nft_collections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  symbol VARCHAR(10) NOT NULL,
  merkle_tree_address VARCHAR(255) UNIQUE NOT NULL,
  tree_authority_address VARCHAR(255) NOT NULL,
  max_depth INTEGER NOT NULL DEFAULT 14,
  max_buffer_size INTEGER NOT NULL DEFAULT 64,
  current_supply INTEGER DEFAULT 0,
  max_supply INTEGER DEFAULT 16384,
  blockchain VARCHAR(50) DEFAULT 'solana',
  status VARCHAR(50) DEFAULT 'active',
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. NFT Mints (main ledger)
CREATE TABLE nft_mints (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id UUID NOT NULL,  -- Foreign key to tickets
  collection_id UUID REFERENCES nft_collections(id),
  mint_address VARCHAR(255),
  transaction_signature VARCHAR(255) UNIQUE,
  metadata_uri TEXT,
  metadata JSONB,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  blockchain VARCHAR(50) DEFAULT 'solana',
  priority VARCHAR(20) DEFAULT 'standard' CHECK (priority IN ('standard', 'high', 'urgent')),
  gas_fee_paid DECIMAL(20, 10),
  retry_count INTEGER DEFAULT 0,
  error_message TEXT,
  mint_batch_id UUID,
  idempotency_key UUID UNIQUE,
  tenant_id UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_nft_mints_ticket_id ON nft_mints(ticket_id);
CREATE INDEX idx_nft_mints_status ON nft_mints(status);
CREATE INDEX idx_nft_mints_created_at ON nft_mints(created_at);
CREATE INDEX idx_nft_mints_collection ON nft_mints(collection_id);

-- 3. Mint Batches (for gas optimization)
CREATE TABLE nft_mint_batches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  collection_id UUID REFERENCES nft_collections(id),
  mint_count INTEGER DEFAULT 0,
  transaction_signature VARCHAR(255) UNIQUE,
  status VARCHAR(50) DEFAULT 'pending',
  gas_fee_paid DECIMAL(20, 10),
  created_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP
);

-- 4. Reconciliation Reports
CREATE TABLE nft_reconciliation_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  report_type VARCHAR(50) DEFAULT 'scheduled',
  db_to_chain_issues INTEGER DEFAULT 0,
  chain_to_db_issues INTEGER DEFAULT 0,
  mismatches INTEGER DEFAULT 0,
  successes INTEGER DEFAULT 0,
  details JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_reconciliation_created ON nft_reconciliation_reports(created_at);

-- 5. Idempotency (like payment-service)
CREATE TABLE nft_mint_idempotency (
  idempotency_key UUID PRIMARY KEY,
  operation VARCHAR(100) NOT NULL,
  request_hash VARCHAR(64),
  response JSONB,
  status_code INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '24 hours'
);

CREATE INDEX idx_idempotency_expires ON nft_mint_idempotency(expires_at);

-- 6. RPC Health Tracking
CREATE TABLE solana_rpc_health (
  endpoint VARCHAR(255) PRIMARY KEY,
  last_success_at TIMESTAMP,
  last_failure_at TIMESTAMP,
  failure_count INTEGER DEFAULT 0,
  average_latency_ms INTEGER,
  status VARCHAR(20) DEFAULT 'healthy',
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## API ENDPOINTS

### Internal Endpoints (Service-to-Service)

#### **1. Mint NFT (Internal)**
```
POST /internal/mint
Headers:
  x-internal-service: payment-service | ticket-service | order-service | blockchain-service
  x-internal-timestamp: <unix-timestamp>
  x-internal-signature: <hmac-sha256>

Body:
{
  "ticketIds": ["uuid1", "uuid2"],
  "eventId": "uuid",
  "userId": "uuid",
  "queue": "standard" | "high" | "urgent"  // optional
}

Response: 200
{
  "success": true,
  "results": [
    {
      "ticketId": "uuid1",
      "success": true,
      "result": {
        "success": true,
        "ticketId": "uuid1",
        "signature": "mock-sig-...",
        "mintAddress": "...",
        "metadataUri": "https://ipfs.io/ipfs/mock-uuid1"
      },
      "mintAddress": "..."
    },
    {
      "ticketId": "uuid2",
      "success": false,
      "error": "Transaction failed: ..."
    }
  ],
  "mintedBy": "payment-service",
  "timestamp": "2025-10-13T..."
}

Security Checks:
1. HMAC signature validation
2. Timestamp within 5 minutes
3. Service name in allowed list
4. Request body included in signature

Errors:
- 401: Missing/invalid headers, expired timestamp
- 403: Service not authorized
- 500: Minting failed

Code: src/routes/internal-mint.js
```

**HMAC Signature Calculation:**
```javascript
const crypto = require('crypto');

const payload = `${serviceName}:${timestamp}:${JSON.stringify(body)}`;
const signature = crypto
  .createHmac('sha256', INTERNAL_SERVICE_SECRET)
  .update(payload)
  .digest('hex');
```

#### **2. Payment Complete Webhook (Internal)**
```
POST /api/webhook/payment-complete
Headers:
  (No authentication - SECURITY ISSUE ⚠️)

Body:
{
  "orderId": "uuid",
  "userId": "uuid",
  "tickets": [
    {
      "id": "uuid",
      "eventName": "Concert Name",
      "venue": "Venue Name",
      "eventDate": "2025-12-01",
      "tier": "VIP",
      "seatNumber": "A1",
      "price": 10000  // cents
    }
  ],
  "eventId": "uuid"
}

Response: 200
{
  "success": true,
  "message": "Minting initiated for 1 tickets",
  "jobIds": ["job_123"]
}

Issues:
❌ No webhook signature validation
❌ Anyone can call this endpoint
❌ No idempotency protection
❌ Doesn't match payment-service webhook format

Code: src/routes/webhook.js
```

### Public Endpoints

#### **3. Health Check**
```
GET /health

Response: 200
{
  "status": "healthy",
  "service": "minting-service",
  "timestamp": "2025-10-13T..."
}

Issues:
❌ Doesn't check database connection
❌ Doesn't check Redis connection
❌ Doesn't check Solana RPC
❌ Too basic for production
```

#### **4. Health Check (Database)**
```
GET /health/db
Headers: None

Response: 200
{
  "status": "ok",
  "database": "connected",
  "service": "minting-service"
}

Response: 503 (if database down)
{
  "status": "error",
  "database": "disconnected",
  "error": "connection timeout",
  "service": "minting-service"
}

Code: src/routes/health.routes.ts
```

### Missing Endpoints (Should Exist)

```
❌ GET /api/v1/mints/:ticketId
   - Get mint status for a ticket
   
❌ GET /api/v1/mints/transaction/:signature
   - Get mint by transaction signature
   
❌ POST /api/v1/mints/retry/:mintId
   - Manual retry for failed mints
   
❌ GET /api/v1/collections
   - List available merkle trees
   
❌ POST /api/v1/collections/create
   - Create new merkle tree
   
❌ GET /api/v1/reconciliation/reports
   - View reconciliation history
   
❌ GET /admin/queue/stats
   - Bull queue dashboard
   
❌ GET /metrics
   - Prometheus metrics endpoint
```

---

## DEPENDENCIES

### What This Service NEEDS (Upstream)

```
REQUIRED (Service fails without these):
├── PostgreSQL (localhost:5432)
│   └── Database: tickettoken_db
│   └── Tables: nft_mints, reconciliation_reports (created on-the-fly)
│   └── Breaking: Service starts but minting fails
│
├── Redis (localhost:6379)
│   └── Bull queue backing
│   └── Breaking: Queue jobs not processed
│
├── Solana RPC (api.devnet.solana.com)
│   └── Blockchain transactions
│   └── Breaking: Minting fails, retries queued
│
└── Wallet File (./devnet-wallet.json)
    └── Signing authority for mints
    └── Breaking: Service won't initialize

OPTIONAL (Service works without these):
├── Internal Service Secret
│   └── INTERNAL_SERVICE_SECRET env var
│   └── Breaking: Internal endpoints fail auth
│   └── Default: 'internal-service-secret-key-minimum-32-chars'
│
└── Merkle Tree Config (./real-merkle-tree-config.json)
    └── Pre-created merkle tree addresses
    └── Breaking: Uses fallback or creates new
```

### What DEPENDS On This Service (Downstream)

```
DIRECT DEPENDENCIES:
├── Payment Service (port 3005)
│   └── Triggers minting after successful payment
│   └── Calls: POST /internal/mint
│   └── Webhook: POST /api/webhook/payment-complete
│   └── Expects: Async minting job creation
│
├── Ticket Service (port 3004)
│   └── Expects tickets.mint_address to be updated
│   └── ISSUE: minting-service updates ticket-service's DB directly
│   └── COUPLING: Should use API/events instead
│
├── Blockchain Service (port 3015)
│   └── May query mint status
│   └── No current integration
│
└── Frontend/Mobile Apps
    └── Display NFT mint status
    └── Show blockchain transaction links
    └── No direct API (goes through ticket-service)

BLAST RADIUS: MEDIUM
- If minting-service is down:
  ✓ Payments still process
  ✓ Tickets still created
  ✗ NFTs not minted (queued for retry)
  ✗ No blockchain verification
  ✗ Resale marketplace limited
  ~ Users notified of minting delay
```

---

## CRITICAL FEATURES

### 1. Compressed NFT Minting ⚠️

**What Are Compressed NFTs?**
```
Traditional Solana NFT:
- 1 NFT = 1 account = ~0.01 SOL rent (~$0.30)
- 1,000 NFTs = ~$300 in rent

Compressed NFT (Metaplex Bubblegum):
- 1 Merkle Tree = 16,384 NFTs = ~0.15 SOL rent (~$4.50)
- 1,000 NFTs = ~$0.27 total
- 99% cost savings!

How it works:
1. Create merkle tree (one-time)
2. Mint NFTs into tree (cheap)
3. Store proof on-chain (tiny)
4. Full NFT data off-chain (IPFS)
5. Transfer by updating tree leaf
```

**Current Implementation:**
```javascript
// src/services/MintingOrchestrator.js

async mintCompressedNFT(ticketData) {
  // 1. Prepare metadata (MOCK)
  const metadataUri = await this.prepareMetadata(ticketData);
  // Returns: `https://ipfs.io/ipfs/mock-${ticketId}`
  // ISSUE: Not real IPFS upload

  // 2. Create transaction (INCOMPLETE)
  const mintTx = await this.createMintTransaction(ticketData, metadataUri);
  // Returns mock mintAddress
  // ISSUE: No actual Solana instruction

  // 3. Send with retry (MOCK)
  const signature = await this.sendWithRetry(mintTx);
  // Returns: bs58.encode(Buffer.from(`mock-sig-${Date.now()}`))
  // ISSUE: Not a real transaction

  // 4. Save to database
  await this.saveMintRecord({...});

  // 5. Update ticket
  await this.updateTicketStatus(ticketId, 'SOLD');
}
```

**Issues:**
- ❌ Mock IPFS uploads
- ❌ Mock transaction signatures
- ❌ No actual blockchain minting
- ❌ No Bubblegum instruction creation
- ⚠️ Has retry logic but nothing to retry
- ⚠️ Updates ticket-service database directly

**What It SHOULD Do:**
```javascript
const {
  createMintToCollectionV1Instruction,
  PROGRAM_ID as BUBBLEGUM_PROGRAM_ID
} = require('@metaplex-foundation/mpl-bubblegum');

async mintCompressedNFT(ticketData) {
  // 1. Upload metadata to IPFS (REAL)
  const metadataUri = await uploadToIPFS({
    name: `Ticket #${ticketId}`,
    description: eventName,
    image: eventImage,
    attributes: [...]
  });

  // 2. Create Bubblegum mint instruction (REAL)
  const mintIx = createMintToCollectionV1Instruction({
    merkleTree: this.merkleTree,
    treeAuthority: this.treeAuthority,
    leafOwner: buyerWallet,  // NOT service wallet
    // ... other accounts
  }, {
    metadataArgs: {
      name, symbol, uri: metadataUri,
      creators: [{address: venue, share: 100}],
      ...
    }
  });

  // 3. Send transaction (REAL)
  const tx = new Transaction().add(mintIx);
  const signature = await connection.sendTransaction(tx, [wallet]);
  await connection.confirmTransaction(signature);

  // 4. Save to database
  await this.saveMintRecord({signature, mintAddress, ...});

  // 5. Publish event (not update DB)
  await publishEvent('nft.minted', {ticketId, mintAddress});
}
```

### 2. Queue-Based Processing ✅

**Implementation:**
```javascript
// src/queues/mintQueue.js

// Initialize Bull queues
const mintQueue = new Bull('ticket-minting', { redis: redisConfig });
const retryQueue = new Bull('ticket-minting-retry', { redis: redisConfig });

// Add job
await mintQueue.add('mint-ticket', ticketData, {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000  // 2s, 4s, 8s
  },
  removeOnComplete: false,  // Keep for tracking
  removeOnFail: false
});

// Worker processes jobs
mintQueue.process('mint-ticket', async (job) => {
  const orchestrator = new MintingOrchestrator();
  const result = await orchestrator.mintCompressedNFT(job.data);
  return result;
});
```

**Strengths:**
- ✅ Exponential backoff on retry
- ✅ Job persistence (Redis)
- ✅ Separate retry queue
- ✅ Job tracking (removeOnComplete: false)

**Missing:**
- ❌ No priority queues (should have urgent/high/standard)
- ❌ No batch processing (should batch Solana txs)
- ❌ No rate limiting (could overwhelm RPC)
- ❌ No dead letter queue (DLQ)
- ❌ No job metrics/monitoring

### 3. Retry Mechanism ✅

**Implementation:**
```javascript
// src/services/MintingOrchestrator.js

async sendWithRetry(mintTx) {
  const maxRetries = 3;
  const baseDelay = 2000;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Send transaction
      const signature = await this.connection.sendTransaction(...);
      return signature;
    } catch (error) {
      lastError = error;
      
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(`Failed after ${maxRetries} attempts: ${lastError?.message}`);
}
```

**Strengths:**
- ✅ Exponential backoff (2s, 4s, 8s)
- ✅ Configurable max retries
- ✅ Error propagation

**Missing:**
- ❌ No retry reason categorization
- ❌ No circuit breaker
- ❌ No jitter (thundering herd)
- ❌ Doesn't distinguish transient vs permanent errors

### 4. Reconciliation Service ✅

**What It Does:**
```javascript
// src/services/ReconciliationService.js

// Runs every 60 seconds
setInterval(() => {
  this.reconcile();
}, 60000);

async reconcile() {
  const report = {
    dbToChain: [],     // DB says minted but not on chain
    chainToDb: [],     // On chain but not in DB
    mismatches: [],    // State conflicts
    success: []        // Correctly synced
  };

  // 1. Check all DB mints exist on chain
  const dbMints = await getCompletedMints();
  for (const mint of dbMints) {
    const tx = await connection.getTransaction(mint.signature);
    if (!tx) {
      report.dbToChain.push({
        ticketId: mint.ticket_id,
        reasonCode: 'MINT_MISSING'
      });
      // Update status to 'missing_on_chain'
    }
  }

  // 2. Check chain for orphaned mints
  // (Placeholder - would query merkle tree events)

  // 3. Save report
  await saveReport(report);
}
```

**Strengths:**
- ✅ Automated reconciliation
- ✅ Detects missing transactions
- ✅ Updates database status
- ✅ Generates reports

**Issues:**
- ⚠️ DB → Chain only (Chain → DB placeholder)
- ⚠️ No automatic remediation
- ⚠️ No alerting on discrepancies
- ❌ No reconciliation for metadata
- ❌ Reports grow unbounded

### 5. RPC Failover ⚠️

**Implementation:**
```javascript
// src/services/RPCManager.js

class RPCManager {
  constructor() {
    this.endpoints = [
      'https://api.devnet.solana.com',
      'https://devnet.helius-rpc.com/?api-key=YOUR_KEY',
      'https://devnet.genesysgo.net/'
    ];
    this.currentEndpoint = 0;
  }

  async sendTransactionWithRetry(tx, signers) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const connection = this.connections[this.currentEndpoint];
        const sig = await connection.sendTransaction(tx, signers);
        return sig;
      } catch (error) {
        if (error.message?.includes('429')) {
          // Rate limited, switch endpoint
          this.currentEndpoint = (this.currentEndpoint + 1) % this.endpoints.length;
        }
        // Retry with backoff
        await delay(1000 * Math.pow(2, attempt - 1));
      }
    }
    throw new Error('All RPC endpoints failed');
  }
}
```

**Strengths:**
- ✅ Multiple RPC endpoints
- ✅ Automatic failover on rate limit
- ✅ Retry logic

**Issues:**
- ⚠️ Hardcoded API keys (YOUR_KEY)
- ❌ No health checking
- ❌ No latency tracking
- ❌ No persistent endpoint status
- ❌ Not actually used (RPCManager not integrated)

### 6. Internal Service Authentication ✅

**Implementation:**
```javascript
// src/middleware/internal-auth.js

function validateInternalRequest(req, res, next) {
  const internalService = req.headers['x-internal-service'];
  const signature = req.headers['x-internal-signature'];
  const timestamp = req.headers['x-timestamp'];

  // 1. Validate headers present
  if (!internalService || !signature || !timestamp) {
    return res.status(401).json({error: 'UNAUTHORIZED'});
  }

  // 2. Check service is allowed
  const allowedServices = [
    'payment-service',
    'ticket-service',
    'order-service',
    'blockchain-service'
  ];
  if (!allowedServices.includes(internalService)) {
    return res.status(403).json({error: 'FORBIDDEN'});
  }

  // 3. Verify timestamp (5 min window)
  const requestTime = parseInt(timestamp);
  if (Math.abs(Date.now() - requestTime) > 5 * 60 * 1000) {
    return res.status(401).json({error: 'Request expired'});
  }

  // 4. Verify HMAC signature
  const secret = process.env.INTERNAL_SERVICE_SECRET || 'internal-service-secret-key-minimum-32-chars';
  const body = JSON.stringify(req.body);
  const payload = `${internalService}:${timestamp}:${body}`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  if (signature !== expectedSignature) {
    return res.status(401).json({error: 'Invalid signature'});
  }

  // 5. Add service to request
  req.internalService = internalService;
  next();
}
```

**Strengths:**
- ✅ HMAC-SHA256 signature
- ✅ Timestamp validation (replay protection)
- ✅ Service whitelist
- ✅ Includes request body in signature

**Issues:**
- ⚠️ Default secret is insecure
- ❌ No nonce (replay still possible in 5min window)
- ❌ No rate limiting per service
- ❌ Not applied to webhook endpoint

### 7. Merkle Tree Management ⚠️

**Current State:**
```javascript
// Merkle tree created manually via script
// create-merkle-tree.js

// Tree config stored in JSON file
// real-merkle-tree-config.json
{
  "merkleTree": "4Zp86Wv5ds72L6Hx5rexMBTxRWuavncZSjJM2jKcbpXV",
  "treeAuthority": "4eidE2LamvDGKFbJMNQ1H7uNGyg59Qc8vfM5mUJdDdp8",
  "maxDepth": 14,
  "maxBufferSize": 64,
  "compressionProgram": "cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK",
  "noopProgram": "noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV"
}

// Capacity: 2^14 = 16,384 NFTs per tree
```

**Issues:**
- ❌ Single merkle tree (what happens at 16,384?)
- ❌ Manual tree creation
- ❌ No tree rotation strategy
- ❌ No tree health monitoring
- ❌ No multi-tree support
- ❌ Config file (should be in database)

**What It Should Have:**
```javascript
// Auto-create new trees when current fills up
async getAvailableMerkleTree() {
  let tree = await getCurrentTree();
  
  if (tree.currentSupply >= tree.maxSupply * 0.9) {
    // 90% full, create new tree
    tree = await createNewMerkleTree();
  }
  
  return tree;
}

// Track multiple trees in database
// nft_collections table with status
```

### 8. Metadata Service ❌

**Current Implementation:**
```javascript
// src/services/MetadataService.js

async function uploadToIPFS(metadata) {
  logger.info('📤 Uploading metadata to IPFS (mock)');
  return `ipfs://mock-hash-${Date.now()}`;
}
```

**Issues:**
- ❌ Not implemented (stub)
- ❌ Returns mock IPFS URIs
- ❌ No actual IPFS upload
- ❌ No Pinata/NFT.Storage/Arweave integration
- ❌ No retry on upload failure
- ❌ No metadata validation

**What It Should Do:**
```javascript
// Use Pinata or NFT.Storage
const pinataSDK = require('@pinata/sdk');
const pinata = new pinataSDK(PINATA_KEY, PINATA_SECRET);

async function uploadToIPFS(metadata) {
  // 1. Validate metadata
  validateMetadata(metadata);
  
  // 2. Upload to IPFS
  const result = await pinata.pinJSONToIPFS(metadata, {
    pinataMetadata: {
      name: `ticket-${metadata.ticketId}`,
      keyvalues: {
        eventId: metadata.eventId,
        ticketId: metadata.ticketId
      }
    }
  });
  
  // 3. Return IPFS URI
  return `ipfs://${result.IpfsHash}`;
}
```

---

## SECURITY

### 1. Authentication ❌

**Current State:**
```
❌ NO JWT authentication on public endpoints
⚠️ Internal endpoints have HMAC auth
❌ Webhook endpoint has NO authentication
❌ Health endpoints are public (should be)
```

**Issues:**
- Anyone can call `/api/webhook/payment-complete`
- No user context in requests
- No authorization checks
- No API keys

**What It Should Have:**
```javascript
// JWT authentication (like payment-service)
const authenticateJWT = require('@tickettoken/shared/middleware/auth');

app.use('/api/v1', authenticateJWT);
```

### 2. Secrets Management ❌

**Current State:**
```javascript
// Hardcoded default secrets
const secret = process.env.INTERNAL_SERVICE_SECRET || 
  'internal-service-secret-key-minimum-32-chars';

// Wallet file committed to repo (CRITICAL!)
./devnet-wallet.json  // Should be in .gitignore

// Merkle tree config in JSON file
./real-merkle-tree-config.json  // Should be in database
```

**Issues:**
- ❌ Default secrets are insecure
- ❌ Wallet private key in repository
- ❌ No secrets rotation
- ❌ No env var validation
- ❌ Config files not encrypted

### 3. Input Validation ❌

**Current State:**
```javascript
// NO request validation
// Body parsing without schema validation
app.use(express.json());

// Example from internal-mint.js
const { ticketIds, eventId, userId, queue } = req.body;

// Basic checks only
if (!ticketIds || !Array.isArray(ticketIds) || ticketIds.length === 0) {
  return res.status(400).json({error: 'ticketIds array is required'});
}
```

**Missing:**
- ❌ No Joi/Zod schemas
- ❌ No type validation
- ❌ No sanitization
- ❌ No max length checks
- ❌ No SQL injection protection (uses parameterized queries, so OK)

### 4. Rate Limiting ⚠️

**Current State:**
```javascript
// Basic rate limiting via express-rate-limit
const rateLimit = require('express-rate-limit');

app.use(rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 100,              // 100 requests
  message: 'Too many requests'
}));
```

**Issues:**
- ⚠️ Applied globally (not per-endpoint)
- ⚠️ In-memory (not distributed via Redis)
- ❌ No per-user limits
- ❌ No per-service limits
- ❌ Too permissive (100/min is high)

### 5. Error Information Disclosure ⚠️

**Current State:**
```javascript
// Errors expose internal details
catch (error) {
  logger.error('Webhook processing failed:', error);
  res.status(500).json({
    success: false,
    error: error.message  // Exposes stack trace in dev
  });
}
```

**Issues:**
- ⚠️ Full error messages in responses
- ⚠️ No error sanitization
- ⚠️ Stack traces in development

---

## MISSING FEATURES

### Critical Missing Features

1. **Idempotency ❌**
   - No idempotency key handling
   - Duplicate mints possible
   - Should copy from payment-service

2. **Event Publishing ❌**
   - No outbox pattern
   - No event broadcasting
   - Other services don't know about mints

3. **Monitoring ❌**
   - No Prometheus metrics
   - No health check depth
   - No alerting

4. **Batch Minting ❌**
   - Mints one-by-one (expensive)
   - Should batch up to 50-100
   - Gas optimization missing

5. **Gas Estimation ❌**
   - No dynamic gas pricing
   - No congestion detection
   - Fixed estimates only

6. **IPFS Upload ❌**
   - Mock implementation
   - No actual metadata storage
   - Breaks NFT standard

7. **Multi-Blockchain ❌**
   - Only Solana (Polygon mentioned but not implemented)
   - No blockchain selection logic
   - No cross-chain support

8. **Dead Letter Queue ❌**
   - Failed jobs lost after 3 retries
   - No manual intervention path
   - No failure analysis

9. **Admin Dashboard ❌**
   - No queue monitoring UI
   - No manual retry interface
   - No reconciliation reports view

10. **API Documentation ❌**
    - No OpenAPI/Swagger spec
    - No request/response examples
    - No error code reference

---

## CODE QUALITY ISSUES

### 1. Mixed TypeScript/JavaScript ⚠️

```
TypeScript Files:
- src/config/database.ts
- src/models/*.ts
- src/routes/health.routes.ts
- tsconfig.json

JavaScript Files:
- src/index.js
- src/config/database.js (duplicate!)
- src/config/solana.js
- src/services/*.js
- src/routes/internal-mint.js
- src/routes/webhook.js
- src/middleware/internal-auth.js
- src/workers/mintingWorker.js

Issues:
❌ Duplicate database config (TS and JS)
❌ Models are TS but never used
❌ No type safety in services
❌ No interface definitions
❌ Build process unclear
```

**Recommendation:**
- Convert everything to TypeScript
- Delete duplicate files
- Use models consistently
- Add strict type checking

### 2. Unused Code ❌

```javascript
// Multiple NFT service implementations, none fully used:

1. CompressedNFTService.js
   - Has initialize(), mintCompressedNFT()
   - Creates merkle trees
   - NEVER IMPORTED OR USED

2. RealCompressedNFT.js
   - Has initialize(), mintNFT()
   - Uses Bubblegum instructions
   - NEVER IMPORTED OR USED

3. MintingOrchestrator.js
   - Actually used
   - But returns mock data
   - Should integrate one of the above

// Unused models
- Collection.ts (never imported)
- Mint.ts (never imported)
- NFT.ts (never imported)

// Database config duplication
- database.js (used)
- database.ts (never used)
```

**Recommendation:**
- Delete unused files
- Pick one NFT service implementation
- Integrate models or delete them
- Clean up database config

### 3. Incomplete Implementations ❌

```javascript
// Mock IPFS
async uploadToIPFS(metadata) {
  logger.info('📤 Uploading metadata to IPFS (mock)');
  return `ipfs://mock-hash-${Date.now()}`;
}

// Mock transaction
async createMintTransaction(ticketData, metadataUri) {
  const mintAddress = Keypair.generate().publicKey;
  // In production, add your actual mint instruction here
  return {
    transaction,
    mintAddress: mintAddress.toString()
  };
}

// Mock signature
const mockSignature = bs58.encode(Buffer.from(`mock-sig-${Date.now()}`));

// Commented-out code
// const signature = await this.connection.sendTransaction(...);
```

**Recommendation:**
- Implement or remove mocks
- Uncomment and fix real code
- Add feature flags for dev/prod

### 4. Database Coupling ❌

```javascript
// minting-service updates ticket-service's database directly
await client.query(`
  UPDATE tickets
  SET
    mint_address = $1,
    blockchain_status = 'minted',
    updated_at = NOW()
  WHERE id = $2::uuid
`, [mintData.mintAddress, mintData.ticketId]);
```

**Issues:**
- ❌ Violates service boundaries
- ❌ Tight coupling
- ❌ No API contract
- ❌ Hard to test
- ❌ Breaks if ticket schema changes

**Recommendation:**
- Publish `nft.minted` event
- Let ticket-service subscribe and update itself
- Or call ticket-service API

### 5. Error Handling Gaps ⚠️

```javascript
// Silent failures
try {
  await client.query(...);
} catch (error) {
  await client.query('ROLLBACK');
  logger.error(`Failed to save: ${error.message}`);
  throw error;  // Thrown but not categorized
}

// No error types
throw new Error('Failed after retries');  // Generic error

// Missing validation
const { ticketIds } = req.body;
// What if ticketIds is undefined? null? string?
for (const ticketId of ticketIds) {  // Could crash
```

**Recommendation:**
- Create AppError classes
- Categorize errors (transient, permanent, validation)
- Add proper validation
- Circuit breakers for external calls

---

## TESTING

### Current Test Coverage

```
tests/
├── setup.ts                      # Basic test setup
├── test-mint-compressed.js       # Manual test script
└── test-wallet.js                # Wallet verification

Issues:
❌ Only 3 test files
❌ No unit tests for services
❌ No integration tests
❌ No endpoint tests
❌ No mocking
❌ Manual test scripts (not automated)
```

### Missing Tests

```
Should Have:
❌ Unit tests for MintingOrchestrator
❌ Unit tests for ReconciliationService
❌ Unit tests for RPCManager
❌ Integration test for internal-mint endpoint
❌ Integration test for webhook endpoint
❌ Queue processing tests
❌ Retry logic tests
❌ HMAC signature tests
❌ Database operation tests
❌ Mock Solana RPC responses
```

### Test Examples Needed

```javascript
// Example: Unit test for retry logic
describe('MintingOrchestrator', () => {
  describe('sendWithRetry', () => {
    it('should retry 3 times on failure', async () => {
      const orchestrator = new MintingOrchestrator();
      const mockConnection = {
        sendTransaction: jest.fn()
          .mockRejectedValueOnce(new Error('Network error'))
          .mockRejectedValueOnce(new Error('Network error'))
          .mockResolvedValueOnce('signature123')
      };
      
      orchestrator.connection = mockConnection;
      
      const result = await orchestrator.sendWithRetry(mockTx);
      
      expect(result).toBe('signature123');
      expect(mockConnection.sendTransaction).toHaveBeenCalledTimes(3);
    });
  });
});

// Example: Integration test for internal mint
describe('POST /internal/mint', () => {
  it('should require valid HMAC signature', async () => {
    const response = await request(app)
      .post('/internal/mint')
      .send({ticketIds: ['uuid']})
      .set('x-internal-service', 'payment-service')
      .set('x-timestamp', Date.now())
      .set('x-internal-signature', 'invalid');
    
    expect(response.status).toBe(401);
  });
});
```

---

## DEPLOYMENT

### Environment Variables

```bash
# Database
DB_HOST=postgres
DB_PORT=5432
DB_NAME=tickettoken_db
DB_USER=postgres
DB_PASSWORD=TicketToken2024Secure!

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=

# Solana
SOLANA_RPC_URL=https://api.devnet.solana.com
WALLET_PATH=./devnet-wallet.json

# Internal Auth
INTERNAL_SERVICE_SECRET=your-secret-here-minimum-32-chars

# Service Config
MINTING_SERVICE_PORT=3018
NODE_ENV=development
LOG_LEVEL=info
```

### Missing Environment Variables

```bash
# Should have but missing:
IPFS_PROVIDER=pinata|nftstorage|arweave
PINATA_API_KEY=
PINATA_SECRET_KEY=
NFT_STORAGE_API_KEY=

POLYGON_RPC_URL=
POLYGON_CHAIN_ID=

MAX_RETRIES=3
RETRY_BASE_DELAY=2000
QUEUE_CONCURRENCY=5

RECONCILIATION_INTERVAL=60000
HEALTH_CHECK_TIMEOUT=5000

SENTRY_DSN=
PROMETHEUS_PORT=9090
```

### Docker Setup

```dockerfile
# Dockerfile
FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache dumb-init

# Copy shared module
COPY backend/shared ./backend/shared
WORKDIR /app/backend/shared
RUN npm install

# Copy cache module
WORKDIR /app/backend/shared/cache
RUN npm install

# Copy service
WORKDIR /app
COPY backend/services/minting-service ./
RUN npm install

# Copy sensitive files (SHOULD NOT BE IN REPO!)
COPY backend/services/minting-service/devnet-wallet.json ./devnet-wallet.json
COPY backend/services/minting-service/real-merkle-tree-config.json ./real-merkle-tree-config.json

# Create logs directory
RUN mkdir -p /app/logs && \
    addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs
EXPOSE 3018
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/index.js"]
```

**Issues:**
- ❌ Copies wallet file into image (CRITICAL SECURITY ISSUE)
- ❌ Config file in image (should be in database/secrets)
- ⚠️ No health check in Dockerfile
- ⚠️ No multi-stage build

### Startup Sequence

```javascript
// src/index.js

async function main() {
  // 1. Initialize database
  await initializeDatabase();
  
  // 2. Initialize Solana connection
  await initializeSolana();
  
  // 3. Initialize queues
  await initializeQueues();
  
  // 4. Start worker
  await startMintingWorker();
  
  // 5. Start Express server
  app.listen(port);
}
```

**Issues:**
- ❌ No graceful shutdown
- ❌ No connection retry logic
- ⚠️ Partial graceful shutdown (SIGTERM handler exists but incomplete)

---

## MONITORING

### Logging ✅

```javascript
// Winston logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'minting-service' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});
```

**Strengths:**
- ✅ Structured JSON logging
- ✅ Timestamps
- ✅ Service name in metadata
- ✅ Configurable log level

**Missing:**
- ❌ No log aggregation (ELK, Datadog)
- ❌ No PII sanitization
- ❌ No request ID tracing
- ❌ No file transport (only console)

### Metrics ⚠️

```javascript
// src/utils/metrics.js
const { Counter, Histogram, Gauge } = require('prom-client');

const mintsSucceededTotal = new Counter({
  name: 'mints_succeeded_total',
  help: 'Total number of successful mints'
});

const mintsFailedTotal = new Counter({
  name: 'mints_failed_total',
  help: 'Total number of failed mints'
});

const mintRetriesTotal = new Counter({
  name: 'mint_retries_total',
  help: 'Total number of mint retry attempts'
});

const mintDuration = new Histogram({
  name: 'mint_duration_seconds',
  help: 'Minting operation duration in seconds'
});

const mintQueueDepth = new Gauge({
  name: 'mint_queue_depth',
  help: 'Current depth of the minting queue'
});
```

**Issues:**
- ⚠️ Metrics defined but NEVER USED
- ❌ No /metrics endpoint
- ❌ Not incremented anywhere
- ❌ No Prometheus scraping

**Should Have:**
```javascript
// In MintingOrchestrator
const end = mintDuration.startTimer();
try {
  const result = await this.mint(...);
  mintsSucceededTotal.inc();
  return result;
} catch (error) {
  mintsFailedTotal.inc();
  throw error;
} finally {
  end();
}
```

### Health Checks ⚠️

```javascript
// Basic health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'minting-service',
    timestamp: new Date().toISOString()
  });
});

// Database health check
app.get('/health/db', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({status: 'ok', database: 'connected'});
  } catch (error) {
    res.status(503).json({status: 'error', database: 'disconnected'});
  }
});
```

**Missing:**
- ❌ No Redis health check
- ❌ No Solana RPC health check
- ❌ No queue health check
- ❌ No liveness vs readiness distinction

**Should Have (like payment-service):**
```javascript
app.get('/health/liveness', (req, res) => {
  // Just checks if process is running
  res.json({status: 'alive'});
});

app.get('/health/readiness', async (req, res) => {
  // Checks all dependencies
  const checks = {
    database: await checkDatabase(),
    redis: await checkRedis(),
    solana: await checkSolana()
  };
  
  const healthy = Object.values(checks).every(c => c.healthy);
  
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ready' : 'not ready',
    checks
  });
});
```

---

## COMPARISON: Minting vs Payment Service

| Feature | Minting Service | Payment Service |
|---------|----------------|-----------------|
| **Architecture** | | |
| Framework | Express ✅ | Express ✅ |
| Language | Mixed TS/JS ⚠️ | TS + JS ✅ |
| DI Container | None ❌ | Manual ⚠️ |
| Code Organization | Good ✅ | Excellent ✅ |
| **Security** | | |
| Authentication | None ❌ | JWT (RS256) ✅ |
| Internal Auth | HMAC ✅ | HMAC ✅ |
| Input Validation | None ❌ | Joi ✅ |
| Rate Limiting | Basic ⚠️ | Multi-level ✅ |
| Idempotency | None ❌ | Redis-backed ✅ |
| PCI Compliance | N/A | Yes ✅ |
| **Data** | | |
| Database | PostgreSQL ✅ | PostgreSQL ✅ |
| Migrations | None ❌ | Knex ✅ |
| Models | Unused ⚠️ | Active ✅ |
| Caching | Redis (queue) ⚠️ | Redis ✅ |
| **Async** | | |
| Queue | Bull ✅ | Bull ✅ |
| Workers | Yes ✅ | Yes ✅ |
| Outbox | None ❌ | Yes ✅ |
| Event Publishing | None ❌ | RabbitMQ ✅ |
| **Resilience** | | |
| Retry Logic | Yes ✅ | Yes ✅ |
| Circuit Breakers | None ❌ | No ❌ |
| Timeouts | None ❌ | Basic ⚠️ |
| Reconciliation | Yes ✅ | Yes ✅ |
| **Monitoring** | | |
| Logging | Winston ✅ | Pino ✅ |
| Metrics | Defined ⚠️ | Prometheus ✅ |
| Health Checks | Basic ⚠️ | Basic ⚠️ |
| Tracing | None ❌ | None ❌ |
| **Testing** | | |
| Unit Tests | None ❌ | Some ⚠️ |
| Integration Tests | None ❌ | Yes ✅ |
| Coverage | 0% ❌ | ~60% ⚠️ |
| **Documentation** | | |
| API Docs | None ❌ | Complete ✅ |
| Code Comments | Minimal ⚠️ | Good ✅ |
| README | Minimal ❌ | Complete ✅ |
| **Maturity** | | |
| Production Ready | No ❌ | Yes ✅ |
| Feature Complete | No ❌ | Yes ✅ |
| Complexity | Low 🟢 | Very High 🔴 |

**Summary:**
- Minting-service has good architecture patterns
- But missing critical production features
- Payment-service is the gold standard
- Minting needs significant work before production

---

## CRITICAL ISSUES (Must Fix Before Production)

### P0 - Blockers 🔴

1. **Wallet Private Key in Repository**
   - File: `devnet-wallet.json`
   - Contains: Unencrypted private key
   - Risk: Complete loss of funds if leaked
   - Fix: Remove from repo, use secrets manager

2. **Mock IPFS Uploads**
   - File: `MetadataService.js`
   - Returns: Fake IPFS URIs
   - Risk: NFTs have no metadata (broken)
   - Fix: Implement real IPFS upload

3. **Mock Transaction Signatures**
   - File: `MintingOrchestrator.js`
   - Returns: Fake signatures
   - Risk: Nothing actually minted on blockchain
   - Fix: Implement real Solana transactions

4. **No Authentication**
   - File: `index.js`, `webhook.js`
   - Issue: Public endpoints unprotected
   - Risk: Anyone can trigger mints
   - Fix: Add JWT authentication

5. **Cross-Service Database Updates**
   - File: `MintingOrchestrator.js` (updateTicketStatus)
   - Issue: Updates ticket-service database directly
   - Risk: Tight coupling, breaks if schema changes
   - Fix: Publish events, let ticket-service update itself

### P1 - High Priority 🟠

6. **No Idempotency**
   - Issue: Duplicate mints possible
   - Risk: Double minting costs money
   - Fix: Add idempotency middleware (copy from payment-service)

7. **No Input Validation**
   - Issue: No Joi/Zod schemas
   - Risk: Invalid data crashes service
   - Fix: Add validation middleware

8. **Mixed TypeScript/JavaScript**
   - Issue: No type safety
   - Risk: Runtime type errors
   - Fix: Convert everything to TypeScript

9. **Unused Code**
   - Files: `CompressedNFTService.js`, `RealCompressedNFT.js`, models
   - Issue: Dead code, confusing
   - Risk: Maintenance burden
   - Fix: Delete or integrate

10. **Single Merkle Tree**
    - Config: `real-merkle-tree-config.json`
    - Capacity: 16,384 NFTs
    - Risk: Stops working after 16,384 mints
    - Fix: Auto-create new trees

### P2 - Medium Priority 🟡

11. **No Event Publishing**
    - Issue: No outbox pattern
    - Risk: Other services don't know about mints
    - Fix: Add outbox table + processor

12. **No Monitoring**
    - Issue: Metrics defined but never used
    - Risk: No visibility into failures
    - Fix: Add /metrics endpoint, increment counters

13. **Incomplete Health Checks**
    - Issue: Doesn't check Redis, Solana
    - Risk: Service reports healthy when broken
    - Fix: Add deep health checks

14. **No Batch Minting**
    - Issue: Mints one-by-one
    - Risk: High gas costs
    - Fix: Batch transactions (50-100 at a time)

15. **Weak Rate Limiting**
    - Issue: In-memory, not distributed
    - Risk: Abuse via multiple instances
    - Fix: Use Redis-backed rate limiting

### P3 - Low Priority 🟢

16. **No Tests**
    - Issue: 0% coverage
    - Risk: Breaks on changes
    - Fix: Add unit + integration tests

17. **No Admin Dashboard**
    - Issue: No UI for queue monitoring
    - Risk: Hard to debug
    - Fix: Add Bull Board dashboard

18. **Hardcoded Secrets**
    - Issue: Default secrets in code
    - Risk: Insecure in production
    - Fix: Require all secrets via env vars

19. **No Circuit Breakers**
    - Issue: No protection from cascade failures
    - Risk: One slow RPC breaks everything
    - Fix: Add circuit breakers (opossum library)

20. **No Alerting**
    - Issue: Silent failures
    - Risk: Mint failures go unnoticed
    - Fix: Add Sentry, PagerDuty integration

---

## TROUBLESHOOTING

### Common Issues

**1. "Database not initialized"**
```
Cause: PostgreSQL not running or connection failed
Fix: 
  - Check PostgreSQL is running: docker ps | grep postgres
  - Check connection string: echo $DATABASE_URL
  - Test connection: psql -h localhost -U postgres -d tickettoken_db
```

**2. "Mint queue not initialized"**
```
Cause: Redis not running
Fix:
  - Check Redis: docker ps | grep redis
  - Test connection: redis-cli ping
  - Check REDIS_HOST env var
```

**3. "Wallet not found. Run get-devnet-sol.js first"**
```
Cause: devnet-wallet.json missing
Fix:
  - Check file exists: ls -la devnet-wallet.json
  - If missing, create wallet:
    solana-keygen new --outfile devnet-wallet.json
  - Fund wallet:
    solana airdrop 2 <PUBLIC_KEY> --url devnet
```

**4. "Failed to create merkle tree"**
```
Cause: Insufficient SOL in wallet, or RPC failure
Fix:
  - Check balance: solana balance --url devnet
  - Request airdrop if needed
  - Try different RPC endpoint
  - Check Solana devnet status
```

**5. "Transaction signature verification failed"**
```
Cause: Mock signature not accepted by blockchain
Fix:
  - This is expected - service uses mock signatures
  - Implement real transactions first
  - See RealCompressedNFT.js for example
```

**6. "Webhook processing failed"**
```
Cause: Invalid webhook payload or missing signature
Fix:
  - Check logs for error details
  - Verify webhook payload format matches expected
  - Add signature validation (currently missing)
```

**7. "Ticket not found in database"**
```
Cause: Ticket doesn't exist or wrong ID format
Fix:
  - Verify ticket ID is valid UUID
  - Check tickets table: SELECT id FROM tickets WHERE id = '...'
  - Service creates mock ticket (bad - fix in production)
```

**8. "HMAC signature mismatch"**
```
Cause: Wrong secret, wrong payload, or clock skew
Fix:
  - Verify INTERNAL_SERVICE_SECRET matches calling service
  - Check timestamp is current (within 5 minutes)
  - Ensure payload format: "{service}:{timestamp}:{body}"
  - Body must be exact JSON string, no whitespace changes
```

**9. "Reconciliation report shows DB→Chain issues"**
```
Cause: Database has completed mints not found on chain
Reasons:
  - Mock signatures never existed on chain
  - Transaction failed but marked as completed
  - Chain reorg (rare)
Fix:
  - Check transaction in Solana explorer
  - If mock: Re-mint with real transaction
  - If failed: Update status to 'failed' and retry
  - If reorg: Wait for finalization
```

**10. "Queue stuck, jobs not processing"**
```
Cause: Worker crashed, Redis connection lost
Fix:
  - Check worker status: docker logs minting-service
  - Restart service: docker restart minting-service
  - Check Redis: redis-cli INFO
  - View queue: npm install -g bull-repl && bull-repl
```

---

## FUTURE IMPROVEMENTS

### Phase 1: Production Readiness (Must Have)

- [ ] **Remove wallet from repository**
  - Use secrets manager (AWS Secrets Manager, HashiCorp Vault)
  - Rotate keys regularly
  - Separate keys per environment

- [ ] **Implement real IPFS uploads**
  - Integrate Pinata or NFT.Storage
  - Add retry logic
  - Cache URIs in database
  - Validate metadata before upload

- [ ] **Implement real Solana minting**
  - Use RealCompressedNFT or CompressedNFTService
  - Create actual Bubblegum instructions
  - Sign and send transactions
  - Confirm on-chain

- [ ] **Add authentication**
  - JWT middleware (copy from payment-service)
  - Protect all endpoints except health
  - Add authorization (role checks)

- [ ] **Add idempotency**
  - Redis-backed idempotency keys
  - 24-hour TTL
  - Prevent duplicate mints

- [ ] **Fix cross-service coupling**
  - Remove direct database updates
  - Publish `nft.minted` events
  - Let ticket-service subscribe and update

- [ ] **Add input validation**
  - Joi schemas for all endpoints
  - Type validation
  - Sanitization

- [ ] **Convert to TypeScript**
  - Migrate all .js to .ts
  - Add strict type checking
  - Use models consistently
  - Delete duplicate files

- [ ] **Add database migrations**
  - Create proper schema
  - Foreign key constraints
  - Indexes for performance
  - Multi-tenancy support

- [ ] **Implement metrics**
  - Add /metrics endpoint
  - Increment counters in code
  - Add Prometheus scraping
  - Dashboard in Grafana

### Phase 2: Reliability & Scale

- [ ] **Multi-tree management**
  - Auto-create trees at 90% capacity
  - Track trees in database
  - Balance mints across trees
  - Archive full trees

- [ ] **Batch minting**
  - Group mints into batches (50-100)
  - Single transaction for multiple NFTs
  - Reduce gas costs by 90%+
  - Optimize queue processing

- [ ] **Event publishing**
  - Add outbox table
  - Background processor
  - RabbitMQ integration
  - Event versioning

- [ ] **Circuit breakers**
  - Protect RPC calls
  - Automatic failover
  - Health tracking
  - Graceful degradation

- [ ] **Dead letter queue**
  - Move failed jobs after max retries
  - Manual intervention interface
  - Failure analysis
  - Replay capability

- [ ] **Enhanced reconciliation**
  - Chain → DB validation (implement placeholder)
  - Metadata verification
  - Automatic remediation
  - Alerting on discrepancies

- [ ] **RPC health tracking**
  - Monitor endpoint latency
  - Track failure rates
  - Automatic endpoint rotation
  - Persist health in database

### Phase 3: Features & Optimization

- [ ] **Polygon support**
  - Add Polygon minting
  - Blockchain selection logic
  - Gas price comparison
  - Cross-chain metadata

- [ ] **Dynamic gas pricing**
  - Real-time congestion detection
  - Priority fee calculation
  - Optimal blockchain selection
  - Cost estimation API

- [ ] **Admin dashboard**
  - Bull Board integration
  - Queue monitoring UI
  - Manual mint retry
  - Reconciliation reports
  - RPC health status

- [ ] **Advanced monitoring**
  - OpenTelemetry tracing
  - Distributed tracing
  - Error tracking (Sentry)
  - Log aggregation (ELK)

- [ ] **Testing suite**
  - Unit tests (80% coverage)
  - Integration tests
  - E2E tests
  - Load testing
  - Chaos engineering

- [ ] **Performance optimization**
  - Database query optimization
  - Redis caching for metadata
  - Connection pooling
  - Parallel processing

- [ ] **API improvements**
  - OpenAPI/Swagger docs
  - Rate limiting per user
  - Pagination
  - Filtering & sorting
  - Webhook subscriptions

### Phase 4: Advanced Features

- [ ] **Multi-signature support**
  - DAO treasury integration
  - Multi-sig wallet support
  - Approval workflows

- [ ] **Lazy minting**
  - Mint on first transfer
  - Reduce upfront costs
  - On-demand minting

- [ ] **NFT metadata updates**
  - Update metadata post-mint
  - Immutable vs mutable fields
  - Version history

- [ ] **Bulk operations**
  - Bulk mint endpoint
  - CSV upload
  - Batch status queries

- [ ] **Analytics**
  - Minting statistics
  - Cost analysis
  - Blockchain distribution
  - Performance metrics

- [ ] **Compliance**
  - Audit logging
  - GDPR compliance
  - Data retention policies
  - Export capabilities

---

## MIGRATION PATH TO PRODUCTION

### Step 1: Critical Security (Week 1)

```bash
# 1. Remove wallet from repository
git rm devnet-wallet.json
echo "devnet-wallet.json" >> .gitignore
git commit -m "Remove wallet from repo"

# 2. Move secrets to environment
export WALLET_PRIVATE_KEY="base64_encoded_key"
export INTERNAL_SERVICE_SECRET="generate_strong_secret"
export IPFS_API_KEY="your_pinata_or_nftstorage_key"

# 3. Update code to use env vars
# src/config/solana.js
const wallet = Keypair.fromSecretKey(
  Buffer.from(process.env.WALLET_PRIVATE_KEY, 'base64')
);
```

### Step 2: Core Functionality (Week 2-3)

```bash
# 1. Implement real IPFS
npm install @pinata/sdk
# Implement uploadToIPFS() in MetadataService.js

# 2. Implement real minting
# Choose: RealCompressedNFT or CompressedNFTService
# Integrate into MintingOrchestrator
# Remove mock signatures

# 3. Add authentication
npm install jsonwebtoken
# Copy JWT middleware from payment-service
# Apply to all endpoints

# 4. Add validation
npm install joi
# Create validation schemas
# Apply to all routes
```

### Step 3: Reliability (Week 4-5)

```bash
# 1. Add idempotency
# Copy idempotency middleware from payment-service
# Add Redis-backed storage

# 2. Fix cross-service coupling
# Remove direct ticket DB updates
# Add outbox table
# Publish nft.minted events

# 3. Add proper migrations
npm install knex -g
knex init
# Create migrations for all tables
knex migrate:latest

# 4. Add monitoring
# Implement /metrics endpoint
# Add counters to code
# Set up Prometheus scraping
```

### Step 4: Testing & Documentation (Week 6)

```bash
# 1. Add tests
npm install --save-dev jest @types/jest ts-jest
# Write unit tests
# Write integration tests
npm test

# 2. Add health checks
# Implement deep health checks
# Add liveness/readiness endpoints

# 3. Update documentation
# OpenAPI spec
# API examples
# Troubleshooting guide

# 4. Load testing
# Test queue under load
# Test RPC failover
# Measure throughput
```

### Step 5: Production Deployment (Week 7)

```bash
# 1. Environment setup
# Mainnet RPC endpoints
# Production secrets
# Monitoring alerts

# 2. Gradual rollout
# Deploy to staging
# Test with real payments
# Monitor metrics

# 3. Blue-green deployment
# Run old and new in parallel
# Route 10% traffic to new
# Increase gradually

# 4. Post-deployment
# Monitor error rates
# Check reconciliation reports
# Verify all mints successful
```

---

## RUNBOOKS

### Runbook: Failed Mint Recovery

```
SCENARIO: Mint job failed after 3 retries

DIAGNOSIS:
1. Check logs:
   docker logs minting-service | grep "Failed to mint"

2. Check database:
   SELECT * FROM nft_mints 
   WHERE status = 'failed' 
   ORDER BY created_at DESC;

3. Identify failure reason:
   - RPC timeout: Check Solana status
   - Insufficient funds: Check wallet balance
   - Invalid metadata: Check metadata_uri
   - Wrong signature: Mock implementation issue

RECOVERY:
A. If RPC timeout:
   - Wait for RPC recovery
   - Manually retry:
     UPDATE nft_mints SET status = 'pending', retry_count = 0 WHERE id = '...';
   - Worker will pick up

B. If insufficient funds:
   - Fund wallet:
     solana transfer <WALLET> 1 --url mainnet-beta
   - Retry as above

C. If invalid metadata:
   - Fix metadata
   - Re-upload to IPFS
   - Update metadata_uri
   - Retry

D. If mock implementation:
   - MUST implement real minting first
   - Cannot recover without real code

POST-RECOVERY:
- Verify on-chain:
  solana confirm <SIGNATURE> --url mainnet-beta
- Update ticket status
- Notify user
```

### Runbook: Reconciliation Discrepancy

```
SCENARIO: Reconciliation report shows mismatches

DIAGNOSIS:
1. View latest report:
   SELECT * FROM reconciliation_reports 
   ORDER BY created_at DESC 
   LIMIT 1;

2. Check specific issues:
   SELECT report_data FROM reconciliation_reports 
   WHERE id = '...';

3. Categorize issues:
   - db_to_chain: DB says minted, chain says no
   - chain_to_db: Chain has mint, DB doesn't
   - mismatches: Status conflicts

RESOLUTION:
A. DB → Chain missing (most common):
   - Query transaction:
     solana confirm <SIGNATURE>
   
   - If not found:
     * Mock signature (development): Expected
     * Real signature (production): Transaction lost
   
   - Action:
     * Development: Implement real minting
     * Production: Re-mint and update DB

B. Chain → DB orphaned:
   - Query merkle tree for unknown mints
   - Check if ticket exists
   - Create DB record if legitimate
   - Investigate unauthorized mints

C. Status mismatch:
   - Compare DB status vs chain status
   - Trust chain as source of truth
   - Update DB to match
   - Investigate sync failure

POST-RESOLUTION:
- Run reconciliation again
- Verify discrepancies resolved
- Update monitoring alerts
```

### Runbook: Queue Backlog

```
SCENARIO: Queue depth > 1000, jobs not processing

DIAGNOSIS:
1. Check queue stats:
   redis-cli
   > LLEN bull:ticket-minting:wait
   > LLEN bull:ticket-minting:active

2. Check worker:
   docker logs minting-service | grep -i worker

3. Identify bottleneck:
   - Worker crashed: No "Processing mint" logs
   - RPC slow: High "Attempt X" logs
   - Database slow: Connection timeout errors

RESOLUTION:
A. Worker crashed:
   - Restart service:
     docker restart minting-service
   
   - Check why:
     docker logs minting-service | grep -i error
   
   - Fix root cause:
     * OOM: Increase memory
     * Uncaught exception: Fix bug
     * Connection lost: Check network

B. RPC slow:
   - Check RPC health:
     curl -X POST https://api.mainnet-beta.solana.com \
       -H "Content-Type: application/json" \
       -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'
   
   - Switch endpoint if needed
   - Increase concurrency:
     QUEUE_CONCURRENCY=10 (from default 5)

C. Database slow:
   - Check connections:
     SELECT count(*) FROM pg_stat_activity;
   
   - Check slow queries:
     SELECT query, state, wait_event_type 
     FROM pg_stat_activity 
     WHERE state != 'idle';
   
   - Add indexes if needed
   - Increase connection pool

PREVENTION:
- Set queue depth alerts (>500)
- Monitor worker health
- Scale workers horizontally
- Implement batch processing
```

---

## API REFERENCE CARD

### Quick Reference

```
BASE URL: http://localhost:3018

INTERNAL ENDPOINTS (HMAC Auth Required):
  POST   /internal/mint              Mint NFTs for tickets

PUBLIC ENDPOINTS (No Auth - ISSUE!):
  POST   /api/webhook/payment-complete   Payment webhook
  
HEALTH ENDPOINTS (Public):
  GET    /health                      Basic health
  GET    /health/db                   Database health

MISSING ENDPOINTS (Should Exist):
  GET    /metrics                     Prometheus metrics
  GET    /admin/queue                 Queue dashboard
  GET    /api/v1/mints/:ticketId      Mint status
  POST   /api/v1/mints/retry/:id      Retry failed mint
```

### Authentication Examples

```bash
# Internal service call
SERVICE="payment-service"
TIMESTAMP=$(date +%s)000
BODY='{"ticketIds":["uuid"],"eventId":"uuid","userId":"uuid"}'
SIGNATURE=$(echo -n "${SERVICE}:${TIMESTAMP}:${BODY}" | \
  openssl dgst -sha256 -hmac "$INTERNAL_SERVICE_SECRET" | \
  awk '{print $2}')

curl -X POST http://localhost:3018/internal/mint \
  -H "Content-Type: application/json" \
  -H "x-internal-service: $SERVICE" \
  -H "x-internal-timestamp: $TIMESTAMP" \
  -H "x-internal-signature: $SIGNATURE" \
  -d "$BODY"
```

### Response Codes

```
200 - Success
400 - Bad Request (validation failed)
401 - Unauthorized (missing/invalid auth)
403 - Forbidden (service not allowed)
500 - Internal Server Error (minting failed)
503 - Service Unavailable (dependency down)
```

---

## APPENDIX

### A. File Structure Reference

```
backend/services/minting-service/
├── Dockerfile                          # Container definition
├── package.json                        # Dependencies
├── tsconfig.json                       # TypeScript config
├── jest.config.js                      # Test config
├── create-merkle-tree.js               # Manual tree creation script
├── real-merkle-tree-config.json        # Merkle tree addresses
├── devnet-wallet.json                  # WALLET (REMOVE FROM REPO!)
│
├── src/
│   ├── index.js                        # Main entry point
│   │
│   ├── config/
│   │   ├── database.js                 # PostgreSQL config (used)
│   │   ├── database.ts                 # Knex config (unused)
│   │   └── solana.js                   # Solana connection
│   │
│   ├── middleware/
│   │   └── internal-auth.js            # HMAC authentication
│   │
│   ├── models/                         # UNUSED TypeScript models
│   │   ├── Collection.ts
│   │   ├── Mint.ts
│   │   └── NFT.ts
│   │
│   ├── routes/
│   │   ├── health.routes.ts            # Health checks
│   │   ├── internal-mint.js            # Internal mint endpoint
│   │   └── webhook.js                  # Payment webhook
│   │
│   ├── services/
│   │   ├── CompressedNFTService.js     # Old NFT service (unused)
│   │   ├── RealCompressedNFT.js        # Newer NFT service (unused)
│   │   ├── MintingOrchestrator.js      # Main orchestrator (used)
│   │   ├── MetadataService.js          # IPFS stub
│   │   ├── PaymentIntegration.js       # Payment webhook handler
│   │   ├── ReconciliationService.js    # Blockchain sync
│   │   └── RPCManager.js               # RPC failover (unused)
│   │
│   ├── queues/
│   │   └── mintQueue.js                # Bull queue setup
│   │
│   ├── workers/
│   │   └── mintingWorker.js            # Queue processor
│   │
│   └── utils/
│       ├── logger.js                   # Winston logging
│       └── metrics.js                  # Prometheus (unused)
│
└── tests/
    ├── setup.ts                        # Test setup
    ├── test-mint-compressed.js         # Manual test
    └── test-wallet.js                  # Wallet verification
```

### B. Environment Variables Reference

```bash
# Required
DB_HOST=postgres                        # PostgreSQL host
DB_PORT=5432                           # PostgreSQL port
DB_NAME=tickettoken_db                 # Database name
DB_USER=postgres                       # Database user
DB_PASSWORD=TicketToken2024Secure!     # Database password
REDIS_HOST=redis                       # Redis host
REDIS_PORT=6379                        # Redis port
SOLANA_RPC_URL=https://api.devnet.solana.com  # Solana RPC
WALLET_PATH=./devnet-wallet.json       # Wallet file (CHANGE!)
INTERNAL_SERVICE_SECRET=your-secret    # HMAC secret
MINTING_SERVICE_PORT=3018              # Service port

# Optional
NODE_ENV=development                   # Environment
LOG_LEVEL=info                         # Log level
REDIS_PASSWORD=                        # Redis password
RECONCILIATION_INTERVAL=60000          # Reconciliation (ms)

# Missing (Should Add)
IPFS_PROVIDER=pinata                   # IPFS provider
PINATA_API_KEY=                        # Pinata key
PINATA_SECRET_KEY=                     # Pinata secret
POLYGON_RPC_URL=                       # Polygon RPC
MAX_RETRIES=3                          # Max retry attempts
RETRY_BASE_DELAY=2000                  # Base retry delay (ms)
QUEUE_CONCURRENCY=5                    # Worker concurrency
SENTRY_DSN=                            # Error tracking
PROMETHEUS_PORT=9090                   # Metrics port
```

### C. Database Queries Reference

```sql
-- View all mints
SELECT 
  ticket_id,
  status,
  transaction_signature,
  mint_address,
  retry_count,
  created_at
FROM nft_mints
ORDER BY created_at DESC
LIMIT 100;

-- View failed mints
SELECT * FROM nft_mints 
WHERE status = 'failed'
ORDER BY created_at DESC;

-- View pending mints
SELECT * FROM nft_mints 
WHERE status = 'pending'
ORDER BY created_at ASC;

-- View reconciliation reports
SELECT 
  created_at,
  db_to_chain_count,
  chain_to_db_count,
  mismatch_count,
  success_count
FROM reconciliation_reports
ORDER BY created_at DESC
LIMIT 10;

-- Count mints by status
SELECT 
  status,
  COUNT(*) as count
FROM nft_mints
GROUP BY status;

-- Recent activity
SELECT 
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as mints,
  COUNT(*) FILTER (WHERE status = 'completed') as successful,
  COUNT(*) FILTER (WHERE status = 'failed') as failed
FROM nft_mints
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;
```

### D. Redis Commands Reference

```bash
# View queue depth
redis-cli LLEN bull:ticket-minting:wait
redis-cli LLEN bull:ticket-minting:active
redis-cli LLEN bull:ticket-minting:completed
redis-cli LLEN bull:ticket-minting:failed

# View queue jobs
redis-cli LRANGE bull:ticket-minting:wait 0 10

# Clear queue (DANGER!)
redis-cli DEL bull:ticket-minting:wait
redis-cli DEL bull:ticket-minting:active

# View all keys
redis-cli KEYS bull:*

# Monitor Redis activity
redis-cli MONITOR
```

### E. Solana CLI Reference

```bash
# Check wallet balance
solana balance --url devnet

# Get wallet address
solana-keygen pubkey devnet-wallet.json

# Request airdrop (devnet only)
solana airdrop 2 <PUBLIC_KEY> --url devnet

# Confirm transaction
solana confirm <SIGNATURE> --url devnet

# Get transaction details
solana transaction <SIGNATURE> --url devnet

# Get account info
solana account <ADDRESS> --url devnet

# Check cluster health
solana cluster-version --url devnet
```

---

## GLOSSARY

**Compressed NFT**: Solana NFT using state compression to reduce storage costs by 99%. Metadata stored in merkle tree instead of individual accounts.

**Merkle Tree**: Data structure that allows efficient verification of large datasets. Used to store compressed NFT proofs.

**Bubblegum**: Metaplex protocol for creating compressed NFTs on Solana.

**SPL Account Compression**: Solana program for state compression, enables merkle tree storage.

**IPFS**: InterPlanetary File System, decentralized storage for NFT metadata.

**Bull Queue**: Redis-backed job queue for Node.js, used for async minting.

**Idempotency**: Property where operation produces same result when called multiple times. Prevents duplicate charges.

**HMAC**: Hash-based Message Authentication Code, used for internal service authentication.

**Reconciliation**: Process of syncing database state with blockchain state.

**RPC**: Remote Procedure Call, interface to interact with Solana blockchain.

**Devnet**: Solana test network, separate from mainnet, uses test SOL.

**Mainnet**: Solana production network, uses real SOL.

**Gas Fee**: Transaction cost on blockchain.

**Outbox Pattern**: Ensures reliable event publishing by storing events in database before publishing.

**Dead Letter Queue (DLQ)**: Queue for messages that failed processing after max retries.

**Circuit Breaker**: Pattern that prevents cascade failures by stopping requests to failing services.

---

## CONTACT & SUPPORT

**Service Owner:** Platform Team  
**Repository:** backend/services/minting-service  
**Documentation:** This file  
**Critical Issues:** Page on-call immediately  
**Non-Critical:** Project tracker  

---

## CHANGELOG

### Version 1.0.0 (Current - Development)
- Initial service structure
- Bull queue implementation
- Retry mechanism with exponential backoff
- Reconciliation service
- Internal service authentication
- Mock implementations for IPFS and minting
- Basic health checks

### Known Issues
- Mock IPFS uploads (not real)
- Mock transaction signatures (not real)
- No authentication on public endpoints
- Mixed TypeScript/JavaScript
- Wallet in repository (security risk)
- No idempotency
- Unused code and models
- No tests

### Planned Changes (Pre-Production)
- Remove wallet from repository
- Implement real IPFS uploads
- Implement real Solana minting
- Add JWT authentication
- Add idempotency
- Convert to TypeScript
- Add tests
- Add monitoring
- Fix cross-service coupling
- Add database migrations

---

**END OF DOCUMENTATION**

*This documentation follows the same structure as payment-service documentation. It provides a complete picture of minting-service's current state (prototype with good patterns but incomplete implementation) and the path to production readiness.*
