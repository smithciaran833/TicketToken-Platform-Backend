# Blockchain Service - Service Overview

## Service Purpose
The blockchain service handles all Solana blockchain interactions including NFT querying, transaction monitoring, RPC failover, and blockchain event listening. It provides a robust interface for querying blockchain state and coordinating with the minting service.

---

## 📁 Directory Structure

```
backend/services/blockchain-service/src/
├── routes/           # API endpoint definitions
├── services/         # Business logic and blockchain operations
├── controllers/      # ❌ Not present (logic in routes)
├── repositories/     # ❌ Not present
├── middleware/       # Request validation and authentication
├── config/           # Configuration files
├── migrations/       # Database schema migrations
├── validators/       # ❌ Not present (validation in middleware)
├── listeners/        # Blockchain event listeners
├── queues/           # Queue management (BullMQ)
├── utils/            # Utility functions (logger, metrics, etc.)
├── wallets/          # Wallet management
└── workers/          # Background workers
```

---

## 🛤️ Routes (API Endpoints)

### 1. **blockchain.routes.ts**
Main blockchain query endpoints:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/blockchain/balance/:address` | Get SOL balance for address |
| `GET` | `/blockchain/tokens/:address` | Get all token accounts for address |
| `GET` | `/blockchain/nfts/:address` | Get NFTs owned by address |
| `GET` | `/blockchain/transaction/:signature` | Get transaction details |
| `GET` | `/blockchain/transactions/:address` | Get recent transactions for address |
| `POST` | `/blockchain/confirm-transaction` | Confirm a transaction |
| `GET` | `/blockchain/account/:address` | Get account info |
| `GET` | `/blockchain/token-supply/:mint` | Get token supply |
| `GET` | `/blockchain/slot` | Get current slot |
| `GET` | `/blockchain/blockhash` | Get latest blockhash |

**Middleware Used:**
- `validateAddressParam` - Validates Solana addresses
- `validateSignatureParam` - Validates transaction signatures
- `validateMintParam` - Validates mint addresses
- `validateConfirmationRequest` - Validates confirmation requests

---

### 2. **health.routes.ts**
Health check endpoints:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Basic health check |
| `GET` | `/health/detailed` | Comprehensive health check (DB, Solana, Treasury, Listeners, Queues, RPC) |
| `GET` | `/health/db` | Database health check |
| `GET` | `/health/solana` | Solana RPC health check |
| `GET` | `/health/treasury` | Treasury wallet health check |

**Dependencies Checked:**
- PostgreSQL database connection
- Solana RPC connection
- Treasury wallet balance (warns if < 0.01 SOL)
- Event listener system
- Queue system
- RPC failover endpoints

---

### 3. **internal-mint.routes.ts**
Internal service-to-service endpoints:

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/internal/mint-tickets` | Proxy mint requests to minting service |

**Middleware Used:**
- `internalAuthMiddleware` - HMAC-based service authentication
- `validateMintRequest` - Validates mint request body

**Functionality:**
- Forwards mint requests to minting-service with proper authentication
- Adds internal service signature using HMAC-SHA256
- Validates timestamp to prevent replay attacks (5-minute window)

---

### 4. **metrics.routes.ts**
Prometheus metrics endpoints:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/metrics` | Prometheus metrics endpoint |
| `GET` | `/metrics/circuit-breakers` | Get circuit breaker statistics |
| `POST` | `/metrics/circuit-breakers/:name/reset` | Reset specific circuit breaker |

---

## 🔧 Services

### 1. **BlockchainQueryService.ts**
Provides blockchain query operations using Solana Web3.js

**Methods:**
- `getBalance(address)` - Get SOL balance
- `getTokenAccounts(address)` - Get all token accounts
- `getNFTsByOwner(address)` - Get NFTs (tokens with amount=1, decimals=0)
- `getTransaction(signature)` - Get parsed transaction
- `getRecentTransactions(address, limit)` - Get recent transactions
- `getAccountInfo(address)` - Get account info
- `getTokenSupply(mintAddress)` - Get token supply
- `getCurrentSlot()` - Get current slot
- `getBlockTime(slot)` - Get block timestamp
- `accountExists(address)` - Check if account exists
- `getLatestBlockhash()` - Get latest blockhash
- `getMinimumBalanceForRentExemption(dataLength)` - Calculate rent exemption
- `getMultipleAccounts(addresses)` - Batch get accounts

---

### 2. **MetaplexService.ts**
Metaplex NFT operations (Note: Bundlr storage currently commented out)

**Methods:**
- `uploadMetadata(metadata)` - Upload metadata to Arweave via Bundlr (with retry)
- `mintNFT(params)` - Mint new NFT with Metaplex
- `createCollection(params)` - Create collection NFT
- `verifyCollectionItem(nftMint, collectionMint)` - Verify collection membership
- `findNFTByMint(mintAddress)` - Find NFT by mint address
- `getNFTMetadata(mintAddress)` - Get NFT metadata

**Features:**
- Automatic retry on failures (3 attempts)
- Metrics tracking for mints and uploads
- Creator royalty configuration support
- Collection support

---

### 3. **RPCFailoverService.ts**
RPC endpoint failover and health monitoring

**Methods:**
- `getConnection()` - Get current healthy connection
- `executeWithFailover(operation, retries)` - Execute with automatic failover
- `getHealthStatus()` - Get health status of all endpoints
- `markEndpointHealthy(url)` - Manually mark endpoint healthy
- `markEndpointUnhealthy(url)` - Manually mark endpoint unhealthy
- `stop()` - Stop health checks

**Features:**
- Automatic health checks every 30 seconds
- Tracks latency and failure count per endpoint
- Automatic rotation to next healthy endpoint on failure
- Circuit breaker pattern for failing endpoints
- Max 3 failures before marking unhealthy

---

### 4. **TransactionConfirmationService.ts**
Transaction confirmation and status tracking

**Methods:**
- `confirmTransaction(signature, config)` - Wait for transaction confirmation
- `getTransactionStatus(signature)` - Get current transaction status
- `confirmTransactions(signatures, config)` - Batch confirm transactions
- `pollForConfirmation(signature, commitment, timeout)` - Poll for confirmation with custom logic
- `getTransaction(signature, maxRetries)` - Get transaction with retries

**Features:**
- Supports processed, confirmed, and finalized commitment levels
- Configurable timeout (default 60s)
- Polling interval for custom confirmation logic
- Retry logic for network issues

---

### 5. **cache-integration.ts**
⚠️ **Status:** Disabled - shared cache module incompatible

---

## 🔐 Middleware

### 1. **internal-auth.ts**
Internal service-to-service authentication

**Functions:**
- `internalAuthMiddleware(request, reply)` - Validates internal service requests
- `generateInternalAuthHeaders(serviceName, body)` - Helper to generate auth headers

**Security Features:**
- HMAC-SHA256 signature verification
- Timestamp validation (5-minute window)
- Replay attack prevention
- Timing-safe comparison

**Required Headers:**
- `x-internal-service` - Service name
- `x-timestamp` - Request timestamp
- `x-internal-signature` - HMAC signature

---

### 2. **validation.ts**
Request validation middleware

**Validators:**
- `validateAddressParam` - Validates Solana address format
- `validateSignatureParam` - Validates transaction signature format
- `validateMintParam` - Validates mint address
- `validateQueryParams` - Validates query parameters (limit)
- `validateMintRequest` - Validates mint request body
- `validateConfirmationRequest` - Validates confirmation request

**Helper Functions:**
- `isValidSolanaAddress(address)` - Check if valid Solana address
- `isValidSignature(signature)` - Check if valid signature (base58, 87-88 chars)
- `sanitizeString(input)` - Sanitize input strings

---

### 3. **tenant-context.ts**
Multi-tenant context management

**Functions:**
- `setTenantContext(request, reply)` - Set PostgreSQL tenant context

**Features:**
- Sets `app.current_tenant` session variable
- Supports tenant ID from user object or request
- Defaults to `00000000-0000-0000-0000-000000000001`

---

## ⚙️ Config

### 1. **index.ts**
Main configuration file

**Configuration Sections:**
- **Solana:** RPC URL, WS URL, commitment level, network, program ID
- **Database:** PostgreSQL connection (host, port, database, user, password, pool settings)
- **Redis:** Redis connection (host, port, password, db)
- **Service:** Service name, port, environment

---

### 2. **database.ts**
Knex database connection

**Configuration:**
- Client: PostgreSQL
- Connection: Uses `DATABASE_URL` or defaults
- Pool: Min 2, Max 10 connections

---

### 3. **queue.ts**
Queue configuration (referenced but file not examined in detail)

---

### 4. **secrets.ts**
Secrets management (referenced but file not examined in detail)

---

### 5. **validate.ts**
Environment variable validation (referenced but file not examined in detail)

---

## 🗄️ Migrations

### 1. **001_baseline_blockchain_service.ts**

**Tables Created:**

#### `wallet_addresses`
User wallet registry with balances and verification status
- **Columns:** id, user_id, wallet_address, blockchain_type, is_primary, balance, last_sync_at, verified_at, timestamps, tenant_id
- **Indexes:** user_id, wallet_address, blockchain_type, deleted_at, tenant_id
- **Foreign Keys:** user_id → users.id

#### `user_wallet_connections`
Wallet connection history with signature proofs
- **Columns:** id, user_id, wallet_address, signature_proof, connected_at, is_primary, disconnected_at, tenant_id
- **Indexes:** user_id, wallet_address, connected_at, tenant_id
- **Foreign Keys:** user_id → users.id

#### `treasury_wallets`
Platform treasury wallets
- **Columns:** id, wallet_address, blockchain_type, purpose, is_active, balance, last_balance_update, timestamps, tenant_id
- **Indexes:** blockchain_type, purpose, is_active, tenant_id
- **Unique:** wallet_address

#### `blockchain_events`
Blockchain event log from program listeners
- **Columns:** id, event_type, program_id, transaction_signature, slot, event_data (jsonb), processed, processed_at, created_at, tenant_id
- **Indexes:** event_type, program_id, transaction_signature, processed, created_at, (event_type + processed), tenant_id

#### `blockchain_transactions`
Transaction records for tickets
- **Columns:** id, ticket_id, type, status, transaction_signature, slot_number, metadata (jsonb), error_message, timestamps, tenant_id
- **Indexes:** ticket_id, type, status, transaction_signature, created_at, tenant_id
- **Foreign Keys:** ticket_id → tickets.id

#### `mint_jobs`
NFT minting queue jobs
- **Columns:** id, order_id, ticket_id, status, nft_address, error, metadata (jsonb), timestamps, completed_at, tenant_id
- **Indexes:** order_id, ticket_id, status, created_at, (status + created_at), tenant_id
- **Foreign Keys:** order_id → orders.id, ticket_id → tickets.id

**Row Level Security:**
- All tables have RLS enabled
- Tenant isolation policy using `app.current_tenant` session variable

---

## 🎧 Listeners

### 1. **baseListener.ts**
Base class for blockchain event listeners (abstract)

**Features:**
- EventEmitter for event emission
- Subscription management
- Error handling
- Database integration

---

### 2. **programListener.ts**
Listens to Solana program logs for events

**Events Monitored:**
- `TICKET_MINTED` - Ticket NFT minted
- `TICKET_TRANSFERRED` - Ticket transferred
- `TICKET_USED` - Ticket used/validated

**Functionality:**
- Subscribes to program logs via `connection.onLogs()`
- Parses events from log messages
- Stores events in `blockchain_events` table
- Stores raw logs for debugging
- Updates ticket status on events
- Emits events via EventEmitter

---

### 3. **transactionMonitor.ts**
Monitors pending transactions until finalized

**Functionality:**
- Tracks pending transactions in memory
- Polls transaction status every 2 seconds
- Updates `blockchain_transactions` table
- Detects finalized or failed transactions
- Updates related ticket records on finalization
- Timeout after 30 attempts (~1 minute)
- Emits `transaction:finalized` and `transaction:timeout` events

---

### 4. **index.ts**
Listener manager and exports

---

## 📦 Queues

### 1. **baseQueue.ts**
Base class for BullMQ queue management (abstract)

**Features:**
- BullMQ integration
- Job lifecycle management
- Event handlers (completed, failed, progress)
- Error handling

---

### 2. **mintQueue.ts**
NFT minting queue (Note: Currently uses simulation, not real blockchain)

**Queue Name:** `nft-minting`

**Configuration:**
- Concurrency: 5 jobs
- Attempts: 5
- Backoff: Exponential, 3s initial delay
- Keeps 50 completed, 100 failed jobs

**Job Processing:**
1. Check idempotency (already minted)
2. Update ticket status to RESERVED
3. Store job record (commented out - no queue_jobs table)
4. **Simulate mint** (placeholder for actual blockchain call)
5. Store transaction in `blockchain_transactions`
6. Update ticket as minted
7. Update job status

**Methods:**
- `addMintJob(ticketId, userId, eventId, metadata, options)` - Add mint job to queue

**Note:** Job status tracking in PostgreSQL removed - BullMQ uses Redis for job tracking.

---

### 3. **index.ts**
Queue manager and exports

---

## 💼 Wallets

### 1. **treasury.ts**
Treasury wallet management

**Functionality:**
- Loads wallet from `/.wallet/treasury.json`
- Generates new wallet if not exists
- Stores wallet in `treasury_wallets` table
- Checks balance on initialization
- Warns if balance < 0.1 SOL

**Methods:**
- `initialize()` - Load or create treasury wallet
- `getBalance()` - Get current balance in SOL
- `signTransaction(transaction)` - Sign transaction with treasury keypair

---

### 2. **feeManager.ts**
Fee calculation and balance checking

**Methods:**
- `calculateMintingFee()` - Calculate mint fees (rent + tx + priority)
- `calculateTransferFee()` - Calculate transfer fees
- `calculateBurnFee()` - Calculate burn fees
- `getOptimalPriorityFee()` - Get dynamic priority fee from network
- `ensureSufficientBalance(publicKey, requiredSol)` - Check if wallet has enough SOL
- `formatFeeBreakdown(fees)` - Format fees for display

**Features:**
- Dynamic priority fee based on network conditions
- Caps priority fee at 0.001 SOL
- Balance checking with shortfall calculation

---

### 3. **userWallet.ts**
User wallet connection and management

**Methods:**
- `connectWallet(userId, walletAddress, signatureBase64, message)` - Connect wallet with signature verification
- `verifySignature(publicKey, signature, message)` - Verify signature using nacl
- `getUserWallets(userId)` - Get all wallets for user
- `getPrimaryWallet(userId)` - Get primary wallet
- `verifyOwnership(userId, walletAddress)` - Verify user owns wallet
- `disconnectWallet(userId, walletAddress)` - Disconnect wallet
- `updateLastUsed(userId, walletAddress)` - Update last used timestamp

**Features:**
- Signature verification using NaCl (Ed25519)
- Primary wallet management (one per user)
- Connection history in `user_wallet_connections`

---

## 👷 Workers

### 1. **mint-worker.ts**
Background worker for NFT minting

**Queues Consumed:**
- `ticket.mint` (RabbitMQ)
- `blockchain.mint` (RabbitMQ)
- Falls back to PostgreSQL polling if RabbitMQ unavailable

**Job Processing:**
1. Fetch ticket details from database
2. Get venue wallet for royalties
3. Configure creators (50% venue, 50% platform if venue has wallet)
4. Prepare NFT metadata with ticket attributes
5. Mint NFT using MetaplexService
6. Confirm transaction
7. Update ticket with mint_address and metadata_uri
8. Update mint_jobs status
9. Publish success event

**Features:**
- Automatic wallet initialization (or generates test wallet)
- Venue royalty support
- 10% seller fee (1000 basis points)
- Collection support (optional)
- RabbitMQ event publishing
- Polling fallback (5s interval) if RabbitMQ unavailable

---

## 🛠️ Utils

### 1. **logger.ts**
Winston logger configuration

**Features:**
- Development: Colorized console output with pretty formatting
- Production: Structured JSON logging
- Error stack trace capture
- Service name and environment in metadata
- Separate stderr for errors/warnings

**Functions:**
- `logger` - Main logger instance
- `createLoggerWithContext(requestId)` - Logger with request ID

---

### 2. **retry.ts**
Retry logic with exponential backoff

**Configuration:**
- Max attempts: 3
- Initial delay: 1000ms
- Max delay: 10000ms
- Backoff multiplier: 2x

**Retryable Errors:**
- timeout, network, ECONNRESET, ETIMEDOUT, ENOTFOUND
- HTTP 429 (rate limit), 503 (service unavailable), 504 (gateway timeout)
- fetch failed, blockhash errors

**Function:**
- `retryOperation<T>(operation, operationName, config)` - Execute operation with retry

---

### 3. **circuitBreaker.ts**
Circuit breaker implementation to prevent cascading failures

**States:**
- `CLOSED` - Normal operation
- `OPEN` - Failing, reject requests
- `HALF_OPEN` - Testing if service recovered

**Classes:**
- `CircuitBreaker` - Individual circuit breaker
- `CircuitBreakerManager` - Manages multiple breakers

**Configuration:**
- Failure threshold: 5 failures to open
- Success threshold: 2 successes to close from half-open
- Reset timeout: 30s before attempting recovery
- Monitoring period: 10s for auto-recovery checks

**Pre-configured Breakers:**
- `rpcCall` - 5 failures, 30s timeout, 60s reset
- `transactionSubmission` - 3 failures, 60s timeout, 120s reset
- `mintOperation` - 3 failures, 120s timeout, 180s reset
- `externalService` - 5 failures, 10s timeout, 30s reset

---

### 4. **metrics.ts**
Prometheus metrics definitions

**Metric Categories:**

**RPC Metrics:**
- `blockchain_rpc_requests_total` - Total RPC requests
- `blockchain_rpc_request_duration_seconds` - RPC request duration
- `blockchain_rpc_failures_total` - RPC failures
- `blockchain_rpc_health_status` - RPC endpoint health
- `blockchain_rpc_latency_ms` - RPC latency

**Transaction Metrics:**
- `blockchain_transactions_submitted_total` - Transactions submitted
- `blockchain_transactions_confirmed_total` - Transactions confirmed
- `blockchain_transactions_failed_total` - Failed transactions
- `blockchain_transaction_confirmation_seconds` - Confirmation time

**Mint Metrics:**
- `blockchain_mints_initiated_total` - Mints initiated
- `blockchain_mints_completed_total` - Mints completed
- `blockchain_mints_failed_total` - Mints failed
- `blockchain_mint_duration_seconds` - Mint duration

**Wallet Metrics:**
- `blockchain_treasury_balance_sol` - Treasury balance
- `blockchain_treasury_balance_checks_total` - Balance checks
- `blockchain_low_balance_alerts_total` - Low balance alerts

**Circuit Breaker Metrics:**
- `blockchain_circuit_breaker_state` - Breaker state
- `blockchain_circuit_breaker_trips_total` - Breaker trips

**Queue Metrics:**
- `blockchain_queue_jobs_added_total` - Jobs added
- `blockchain_queue_jobs_completed_total` - Jobs completed
- `blockchain_queue_jobs_failed_total` - Jobs failed
- `blockchain_queue_size` - Current queue size
- `blockchain_queue_job_duration_seconds` - Job duration

**HTTP Metrics:**
- `blockchain_http_requests_total` - HTTP requests
- `blockchain_http_request_duration_seconds` - Request duration

**System Metrics:**
- `blockchain_service_uptime_seconds` - Service uptime
- `blockchain_active_connections` - Active connections

**Helper Functions:**
- `recordHttpRequest()` - Record HTTP request metrics
- `recordRpcRequest()` - Record RPC request metrics
- `trackMintOperation()` - Track mint operation metrics

---

### 5. **blockchain-metrics.ts**
Blockchain-specific metrics helper (referenced, content not examined in detail)

---

## 📊 Summary

### Total Files Analyzed: 33

| Category | Count | Files |
|----------|-------|-------|
| **Routes** | 4 | blockchain, health, internal-mint, metrics |
| **Services** | 4 | BlockchainQuery, Metaplex, RPCFailover, TransactionConfirmation |
| **Controllers** | 0 | ❌ Logic in routes |
| **Repositories** | 0 | ❌ Not present |
| **Middleware** | 3 | internal-auth, validation, tenant-context |
| **Config** | 5 | index, database, queue, secrets, validate |
| **Migrations** | 1 | 001_baseline (7 tables) |
| **Validators** | 0 | ❌ Validation in middleware |
| **Listeners** | 3 | base, program, transactionMonitor |
| **Queues** | 2 | base, mintQueue |
| **Utils** | 5 | logger, retry, circuitBreaker, metrics, blockchain-metrics |
| **Wallets** | 3 | treasury, feeManager, userWallet |
| **Workers** | 1 | mint-worker |

---

## 🔗 External Services & Dependencies

### Blockchain/Web3
- **Solana Web3.js** - Solana blockchain interactions
- **Metaplex Foundation JS** - NFT minting and metadata
- **Bundlr** - Arweave metadata storage (currently disabled)

### Databases
- **PostgreSQL** - Primary database (via Knex)
- **Redis** - Queue storage (BullMQ)

### Queues & Messaging
- **BullMQ** - Job queue management
- **RabbitMQ** - Event messaging (fallback to polling if unavailable)

### Monitoring
- **Prometheus** - Metrics collection
- **Winston** - Logging

### Security
- **TweetNaCl** - Ed25519 signature verification

---

## 🎯 Key Features

1. **RPC Failover** - Automatic failover between multiple RPC endpoints with health monitoring
2. **Circuit Breakers** - Prevent cascading failures with configurable circuit breakers
3. **Retry Logic** - Exponential backoff retry for blockchain operations
4. **Multi-tenant** - Row-level security and tenant context management
5. **Comprehensive Metrics** - Prometheus metrics for monitoring
6. **Transaction Monitoring** - Automatic transaction confirmation tracking
7. **Event Listening** - Real-time blockchain event processing
8. **Wallet Management** - Treasury, user wallet, and fee management
9. **Queue Processing** - BullMQ for async job processing with RabbitMQ fallback
10. **Internal Auth** - HMAC-based service-to-service authentication

---

## ⚠️ Notable Items

1. **Metaplex Bundlr Storage** - Currently commented out/disabled
2. **Mint Queue Simulation** - Uses simulated minting, not actual blockchain calls
3. **Cache Integration** - Disabled due to incompatibility
4. **Queue Job Tracking** - Removed PostgreSQL tracking, relies on BullMQ/Redis
5. **Worker Mode** - Can operate with RabbitMQ or fall back to PostgreSQL polling

---

## 🔮 Database Tables Owned

This service creates and manages 7 tables:

1. `wallet_addresses` - User wallet registry
2. `user_wallet_connections` - Wallet connection history
3. `treasury_wallets` - Platform treasury wallets
4. `blockchain_events` - Blockchain event log
5. `blockchain_transactions` - Transaction records
6. `mint_jobs` - NFT minting queue jobs
7. All tables have **tenant_id** with RLS policies

---

_Generated: 2025-12-21_
