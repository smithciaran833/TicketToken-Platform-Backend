# Minting Service - Service Overview

**Last Updated:** December 21, 2025  
**Service:** minting-service  
**Port:** 3004  
**Purpose:** NFT minting operations for ticket tokenization on Solana blockchain

---

## 📁 Directory Structure

```
backend/services/minting-service/src/
├── routes/           # API route definitions
├── services/         # Business logic services
├── middleware/       # Request middleware
├── config/           # Configuration modules
├── migrations/       # Database migrations
├── validators/       # Request validation schemas
├── models/           # Database models
├── queues/           # Bull queue configurations
├── workers/          # Background job workers
└── utils/            # Utility functions
```

---

## 🛣️ Routes

### 1. `/routes/admin.ts`
**Purpose:** Administrative operations and dashboard management

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/dashboard` | Get dashboard overview statistics |
| `POST` | `/admin/batch-mint` | Batch mint multiple NFTs |
| `GET` | `/admin/batch-mint/estimate` | Estimate batch minting cost |
| `POST` | `/admin/reconcile/:venueId` | Reconcile all tickets for a venue |
| `POST` | `/admin/reconcile/:venueId/fix` | Fix discrepancies for specific tickets |
| `GET` | `/admin/reconcile/:venueId/history` | Get reconciliation history |
| `GET` | `/admin/cache/stats` | Get cache statistics |
| `DELETE` | `/admin/cache/:ticketId` | Invalidate cache for specific ticket |
| `DELETE` | `/admin/cache/clear` | Clear all cache |
| `GET` | `/admin/mints` | Get all mints (last 100) |
| `GET` | `/admin/mints/:ticketId` | Get mint details for specific ticket |
| `GET` | `/admin/system/status` | Get system health status |
| `GET` | `/admin/stats/:venueId` | Get venue-specific statistics |

### 2. `/routes/health.routes.ts`
**Purpose:** Health check endpoints for monitoring

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Basic health check (fast response) |
| `GET` | `/health/full` | Detailed health check (all dependencies) |
| `GET` | `/health/ready` | Readiness probe (K8s compatible) |
| `GET` | `/health/live` | Liveness probe (K8s compatible) |

**Health Check Components:**
- PostgreSQL connection
- Solana RPC connection
- Wallet balance verification
- IPFS/Pinata connectivity (if configured)

### 3. `/routes/internal-mint.ts`
**Purpose:** Internal service-to-service minting endpoint

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/internal/mint` | Mint NFTs (protected by internal auth) |

**Authentication:** Requires `x-internal-service`, `x-internal-signature`, and `x-timestamp` headers

### 4. `/routes/metrics.routes.ts`
**Purpose:** Prometheus metrics exposure

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/metrics` | Prometheus metrics endpoint |

### 5. `/routes/webhook.ts`
**Purpose:** Payment webhook integration

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/webhook/payment-complete` | Payment completion webhook |

**Security:** Validates webhook signatures using HMAC-SHA256

---

## 🔧 Services

### 1. `BalanceMonitor.ts`
**Purpose:** Monitor Solana wallet balance and alert on low funds

**Key Methods:**
- `start()` - Start periodic balance monitoring
- `stop()` - Stop monitoring
- `getCurrentBalance()` - Get current SOL balance
- `isBalanceSufficient()` - Check if balance meets minimum threshold
- `getBalanceStatus()` - Get balance status for health checks

**Features:**
- Periodic balance checks (configurable interval)
- Low balance alerts with cooldown period
- Configurable minimum balance threshold

### 2. `BatchMintingService.ts`
**Purpose:** Batch mint multiple NFTs with optimized performance

**Key Methods:**
- `batchMint(request)` - Mint multiple tickets in batches
- `estimateBatchCost(ticketCount)` - Estimate SOL cost and time

**Configuration:**
- Max batch size: 10 tickets
- Batch delay: 100ms between batches
- Parallel processing within batches

### 3. `blockchain.service.ts`
**Purpose:** Blockchain integration for ticket registration

**Key Methods:**
- `registerTicketOnChain(ticketData)` - Register ticket on blockchain after minting

**Uses:** `@tickettoken/shared` BlockchainClient wrapper

### 4. `MetadataCache.ts`
**Purpose:** Redis-based caching for metadata and transactions

**Key Methods:**
- `get(key)` / `set(key, value, ttl)` - Basic cache operations
- `getOrSet(key, fetcher, ttl)` - Get from cache or compute
- `cacheIPFSMetadata(ticketId, metadataUri)` - Cache IPFS URIs
- `cacheMintTransaction(ticketId, signature)` - Cache transaction signatures
- `invalidateTicket(ticketId)` - Invalidate ticket cache
- `clearAll()` - Clear all cache
- `getStats()` - Get cache statistics

**TTLs:**
- Default: 1 hour
- IPFS metadata: 24 hours
- Transactions: 1 hour

### 5. `MetadataService.ts`
**Purpose:** IPFS metadata upload and preparation

**Key Functions:**
- `uploadToIPFS(metadata)` - Upload ticket metadata to IPFS
- `uploadMetadata(metadata)` - Upload raw metadata

**Metadata Format:**
- NFT standard attributes (name, symbol, description, image)
- Custom ticket attributes (event, venue, tier, seat)
- Retry logic with exponential backoff

### 6. `MintingOrchestrator.ts`
**Purpose:** Main orchestration service for NFT minting workflow

**Key Methods:**
- `mintCompressedNFT(ticketData)` - Complete minting workflow

**Workflow:**
1. Check wallet balance
2. Prepare and upload metadata to IPFS
3. Mint compressed NFT using RealCompressedNFT
4. Save mint record to database
5. Register ticket on blockchain (if applicable)

**Metrics:** Tracks duration, success/failure, and reasons for failures

### 7. `PaymentIntegration.ts`
**Purpose:** Integration with payment service for automatic minting

**Key Methods:**
- `onPaymentComplete(orderData)` - Trigger minting after payment

**Behavior:** Adds mint jobs to queue for each ticket in completed order

### 8. `RealCompressedNFT.ts`
**Purpose:** Solana Bubblegum compressed NFT minting implementation

**Key Methods:**
- `initialize()` - Load wallet, merkle tree, and collection configs
- `mintNFT(ticketData)` - Mint compressed NFT using Metaplex Bubblegum
- `getMerkleTreeAddress()` - Get configured merkle tree address
- `getCollectionAddress()` - Get configured collection address

**Technology:**
- Metaplex Bubblegum (MPL Bubblegum)
- UMI framework
- Compressed NFTs on Solana

**Configuration Files:**
- `real-merkle-tree-config.json` - Merkle tree configuration
- `collection-config.json` - Collection configuration

### 9. `ReconciliationService.ts`
**Purpose:** Reconcile database state with blockchain state

**Key Methods:**
- `reconcileAll(venueId)` - Check all minted tickets against blockchain
- `fixDiscrepancies(venueId, ticketIds)` - Reset tickets for re-minting
- `getReconciliationHistory(venueId)` - Get past reconciliation reports
- `getReconciliationMetrics(venueId)` - Get reconciliation metrics

**Checks:**
- Transaction existence on blockchain
- Transaction success/failure status
- Time consistency between DB and blockchain

### 10. `RPCManager.ts`
**Purpose:** Multi-endpoint RPC management with failover

**Key Methods:**
- `initialize()` - Setup multiple RPC endpoints
- `getConnection()` - Get current connection
- `sendTransactionWithRetry(transaction, signers)` - Send with automatic failover

**Features:**
- Multiple RPC endpoints
- Automatic failover on rate limiting
- Exponential backoff retry logic
- Compute budget optimization

---

## 🛡️ Middleware

### 1. `internal-auth.ts`
**Purpose:** Authentication for internal service-to-service communication

**Validation:**
- Checks `x-internal-service` header (allowed services: payment-service, ticket-service, order-service, blockchain-service)
- Verifies HMAC-SHA256 signature using `INTERNAL_SERVICE_SECRET`
- Validates timestamp (must be within 5 minutes)

**Signature Algorithm:**
```
payload = service:timestamp:body
signature = HMAC-SHA256(INTERNAL_SERVICE_SECRET, payload)
```

---

## ⚙️ Config

### 1. `database.ts`
**Purpose:** PostgreSQL connection management

**Configuration:**
- Uses `pg` Pool for connection pooling
- Also provides Knex instance for query building
- Connection details from environment variables

**Tables Queried:**
- Managed by migrations (see Migrations section)

### 2. `ipfs.ts`
**Purpose:** IPFS service configuration (Pinata or NFT.Storage)

**Providers:**
- **Pinata** (default) - Via JWT or API keys
- **NFT.Storage** - Via API key

**Key Functions:**
- `getIPFSService()` - Get configured IPFS provider
- `validateIPFSConfig()` - Validate IPFS credentials
- `testIPFSConnection()` - Test connectivity

**Environment Variables:**
- `IPFS_PROVIDER` - pinata | nft.storage
- `PINATA_JWT` or `PINATA_API_KEY` + `PINATA_SECRET_API_KEY`
- `NFT_STORAGE_API_KEY`
- `IPFS_GATEWAY` - Custom gateway URL

### 3. `solana.ts`
**Purpose:** Solana blockchain connection and wallet management

**Configuration:**
- RPC connection setup
- Wallet keypair loading from file
- Program ID configuration
- Collection mint address (optional)
- Merkle tree address (optional)

**Key Functions:**
- `initializeSolana()` - Initialize all Solana connections
- `getConnection()` / `getWallet()` / `getProgramId()` - Getters
- `loadCollectionConfig()` - Load collection from file
- `loadMerkleTreeConfig()` - Load merkle tree from file

**Environment Variables:**
- `SOLANA_RPC_URL`
- `SOLANA_NETWORK` (devnet/mainnet)
- `WALLET_PATH`
- `PROGRAM_ID`
- `COLLECTION_MINT` (optional)
- `MERKLE_TREE_ADDRESS` (optional)
- `MIN_SOL_BALANCE` (default: 0.1)
- `CONFIRMATION_COMMITMENT` (default: confirmed)

### 4. `secrets.ts`
**Purpose:** Load secrets from shared secrets manager

**Secrets Loaded:**
- `POSTGRES_PASSWORD`
- `POSTGRES_USER`
- `POSTGRES_DB`
- `REDIS_PASSWORD`

Uses `@tickettoken/shared` secretsManager

---

## 🗄️ Migrations

### 1. `001_baseline_minting.ts`
**Purpose:** Create baseline minting database schema

**Tables Created:**

#### `collections`
- Collection metadata for NFT collections
- Fields: id, tenant_id, name, symbol, contract_address, blockchain, max_supply, current_supply, metadata
- Indexes: contract_address, blockchain, tenant_id
- RLS enabled with tenant isolation

#### `nft_mints`
- Mint job tracking
- Fields: id, tenant_id, ticket_id, nft_id, status, transaction_hash, blockchain, error, retry_count
- Indexes: ticket_id, nft_id, status, transaction_hash, tenant_id
- Unique: (ticket_id, tenant_id)
- RLS enabled

#### `nfts`
- Minted NFT records
- Fields: id, tenant_id, token_id, contract_address, owner_address, metadata_uri, metadata, blockchain
- Indexes: (token_id, contract_address), owner_address, blockchain, tenant_id
- Unique: (token_id, contract_address)
- RLS enabled

#### `ticket_mints`
- Ticket-specific mint tracking
- Fields: id, tenant_id, ticket_id, venue_id, status, transaction_signature, mint_duration
- Indexes: ticket_id, venue_id, status, tenant_id
- RLS enabled

#### `minting_reconciliation_reports`
- Reconciliation reports storage
- Fields: id, tenant_id, venue_id, report_date, total_checked, confirmed, not_found, pending, errors, discrepancy_count, discrepancy_rate, report_data
- Indexes: venue_id, report_date, tenant_id
- RLS enabled

**Security:**
- Row Level Security (RLS) enabled on all tables
- Tenant isolation policies using `app.current_tenant` setting

---

## ✅ Validators

### 1. `mint.schemas.ts`
**Purpose:** Zod validation schemas for mint requests

**Schemas:**

#### `internalMintSchema`
Validates internal mint requests:
- `ticketIds` - Array of UUIDs (1-100 tickets)
- `eventId` - UUID
- `userId` - UUID
- `tenantId` - UUID
- `queue` - Boolean (optional)
- `orderId` - UUID (optional)

**Type Export:** `InternalMintRequest`

---

## 📊 Models

### 1. `Collection.ts`
**Purpose:** Collection data model

**Methods:**
- `create(data)` - Create new collection
- `findById(id)` - Find by ID
- `findByContract(contractAddress)` - Find by contract address
- `update(id, data)` - Update collection
- `incrementSupply(id)` - Increment current supply
- `delete(id)` - Delete collection

### 2. `Mint.ts`
**Purpose:** Mint job data model

**Methods:**
- `create(data)` - Create mint job
- `findById(id)` - Find by ID
- `findPending(limit)` - Find pending mints (with retry limit)
- `update(id, data)` - Update mint job
- `delete(id)` - Delete mint job

**Statuses:** `pending`, `minting`, `completed`, `failed`

### 3. `NFT.ts`
**Purpose:** NFT data model

**Methods:**
- `create(data)` - Create NFT record
- `findById(id)` - Find by ID
- `findByTokenId(tokenId, contractAddress)` - Find by token ID
- `findByOwner(ownerAddress)` - Find NFTs by owner
- `update(id, data)` - Update NFT
- `delete(id)` - Delete NFT

---

## 📬 Queues

### 1. `mintQueue.ts`
**Purpose:** Bull queue configuration for minting jobs

**Queues:**
- `ticket-minting` - Main minting queue
- `ticket-minting-retry` - Retry queue for failed mints

**Configuration:**
- Redis-backed
- 3 retry attempts with exponential backoff
- Jobs retained after completion/failure for auditing

**Functions:**
- `initializeQueues()` - Initialize both queues
- `addMintJob(ticketData)` - Add mint job to queue
- `getMintQueue()` / `getRetryQueue()` - Get queue instances

---

## 👷 Workers

### 1. `mintingWorker.ts`
**Purpose:** Background worker for processing mint jobs

**Job Processing:**
- Processes `mint-ticket` jobs from queue
- Uses `MintingOrchestrator` for minting workflow
- Automatic retry on failure (handled by queue config)
- Detailed logging for success/failure

**Function:**
- `startMintingWorker()` - Start processing queue

---

## 🔨 Utils

### 1. `logger.ts`
**Purpose:** Winston logger configuration

**Configuration:**
- JSON format for production
- Colorized console output
- Timestamp and error stack traces
- Default metadata: `service: minting-service`
- Configurable log level via `LOG_LEVEL` env var

### 2. `metrics.ts`
**Purpose:** Prometheus metrics definitions

**Business Metrics:**
- `mints_total` - Total mint attempts by status and tenant
- `mints_success_total` - Successful mints
- `mints_failed_total` - Failed mints by reason
- `mint_duration_seconds` - Mint duration histogram
- `ipfs_upload_duration_seconds` - IPFS upload duration
- `solana_tx_confirmation_duration_seconds` - TX confirmation time

**Resource Metrics:**
- `queue_depth` - Current queue depth
- `wallet_balance_sol` - Current wallet balance
- `active_workers` - Active worker count
- `database_connections` - DB connection count

**Cache Metrics:**
- `cache_hits_total` - Cache hits
- `cache_misses_total` - Cache misses

**API Metrics:**
- `http_request_duration_seconds` - HTTP request duration
- `http_requests_total` - Total HTTP requests

**System Health:**
- `system_health` - Component health status (1=healthy, 0=unhealthy)

**Helper Functions:**
- `recordMintSuccess()` / `recordMintFailure()` - Record mint outcomes
- `updateSystemHealth()` - Update component health
- `getMetrics()` / `getMetricsJSON()` - Export metrics

### 3. `solana.ts`
**Purpose:** Solana utility functions

**Key Functions:**
- `confirmTransaction()` - Confirm transaction with timeout
- `sendAndConfirmTransactionWithRetry()` - Send and confirm with retries
- `extractMintAddressFromTransaction()` - Extract mint address from logs
- `checkWalletBalance()` - Check wallet SOL balance
- `isValidPublicKey()` - Validate Solana address
- `getAssetId()` - Get compressed NFT asset ID
- `retryAsync()` - Generic retry wrapper
- `formatSOL()` - Format lamports to SOL
- `validateSolanaConfig()` - Validate environment configuration

**Transaction Handling:**
- Automatic retry with exponential backoff
- Recent blockhash management
- Transaction confirmation with timeout
- Log parsing for asset IDs

---

## 🔄 Other Folders

### `/scripts/`
Contains utility scripts:
- `create-collection.ts` - Create NFT collection
- `create-merkle-tree-umi.ts` - Create merkle tree for compressed NFTs

### `/tests/`
Test suite:
- `setup.ts` - Test configuration
- `test-mint-compressed.ts` - Compressed NFT minting tests
- `test-wallet.ts` - Wallet functionality tests
- `/unit/` - Unit tests for services
- `/integration/` - Integration tests

### `/docs/`
Documentation:
- `SETUP.md` - Setup instructions
- `TESTING.md` - Testing guide

---

## 🌐 External Services

### 1. **Solana Blockchain**
- **Purpose:** NFT minting on blockchain
- **Network:** Devnet/Mainnet configurable
- **Programs:** Metaplex Bubblegum (Compressed NFTs)

### 2. **IPFS (Pinata/NFT.Storage)**
- **Purpose:** Decentralized metadata storage
- **Providers:** Pinata (primary), NFT.Storage (alternative)
- **Content:** NFT metadata JSON files

### 3. **PostgreSQL**
- **Purpose:** Persistent data storage
- **Tables:** collections, nft_mints, nfts, ticket_mints, reconciliation_reports
- **Features:** Multi-tenancy with RLS

### 4. **Redis**
- **Purpose:** Queue management and caching
- **Usage:** Bull queues, metadata cache
- **Optional:** Can be disabled via `REDIS_ENABLED`

### 5. **Internal Services**
- **payment-service** - Triggers minting after payment
- **ticket-service** - Provides ticket data
- **order-service** - Order management
- **blockchain-service** - Blockchain registration

---

## 📈 Key Features

### ✨ Compressed NFTs
- Uses Solana's State Compression (Bubblegum)
- Cost-effective at scale (fraction of cost vs regular NFTs)
- Merkle tree-based storage

### 🔄 Queue-Based Processing
- Asynchronous minting via Bull queues
- Automatic retry with exponential backoff
- Job tracking and monitoring

### 🎯 Multi-Tenancy
- Tenant isolation via Row Level Security
- Tenant-specific metrics and tracking
- Secure data separation

### 📊 Monitoring & Observability
- Prometheus metrics export
- Comprehensive health checks
- Detailed logging with Winston
- Balance monitoring and alerts

### 🔐 Security
- Internal service authentication
- Webhook signature verification
- HMAC-SHA256 signatures
- Replay attack prevention (timestamp validation)

### 🔁 Reconciliation
- Blockchain state verification
- Discrepancy detection and reporting
- Automatic retry for failed mints

### 💾 Caching
- Redis-based metadata caching
- Reduced IPFS load
- Configurable TTLs

---

## 🔑 Critical Environment Variables

```env
# Solana Configuration
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_NETWORK=devnet
WALLET_PATH=./devnet-wallet.json
PROGRAM_ID=<program_id>
MIN_SOL_BALANCE=0.1
CONFIRMATION_COMMITMENT=confirmed

# IPFS Configuration
IPFS_PROVIDER=pinata
PINATA_JWT=<jwt_token>
# OR
PINATA_API_KEY=<api_key>
PINATA_SECRET_API_KEY=<secret_key>

# Database
DB_HOST=postgres
DB_PORT=6432
DB_NAME=tickettoken_db
DB_USER=postgres
DB_PASSWORD=<password>

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=<password>
REDIS_ENABLED=true

# Security
INTERNAL_SERVICE_SECRET=<secret>
WEBHOOK_SECRET=<secret>

# Monitoring
LOG_LEVEL=info
BALANCE_CHECK_INTERVAL=300000
```

---

## 📋 Summary

The **minting-service** is a comprehensive NFT minting solution that:

1. **Mints compressed NFTs** on Solana blockchain using Metaplex Bubblegum
2. **Manages metadata** on IPFS (Pinata/NFT.Storage)
3. **Processes jobs asynchronously** via Bull queues with Redis
4. **Monitors system health** with Prometheus metrics
5. **Ensures data integrity** through reconciliation
6. **Supports multi-tenancy** with Row Level Security
7. **Integrates with payment service** for automatic minting
8. **Provides admin tools** for batch operations and monitoring

**Architecture:** Queue-based, event-driven microservice with robust error handling, monitoring, and blockchain integration.
