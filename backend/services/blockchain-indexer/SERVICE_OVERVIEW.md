# Blockchain Indexer Service - Complete Overview

## Service Purpose
The Blockchain Indexer is a critical infrastructure service that monitors Solana blockchain activity, indexes all transactions related to TicketToken NFTs, tracks marketplace activity, and maintains data consistency between blockchain state and the database through automated reconciliation.

---

## Routes (`src/routes/`)

### Query Routes (`query.routes.ts`)
All routes require JWT authentication via `verifyJWT` middleware.

| Method | Path | Description | Query Parameters |
|--------|------|-------------|------------------|
| GET | `/api/v1/transactions/:signature` | Get transaction details by signature | - |
| GET | `/api/v1/wallets/:address/activity` | Get wallet activity history | `limit`, `offset`, `activityType` |
| GET | `/api/v1/transactions/by-slot/:slot` | Get all transactions for a specific slot | - |
| GET | `/api/v1/nfts/:tokenId/history` | Get NFT transfer history | - |
| GET | `/api/v1/marketplace/activity` | Get marketplace activity | `marketplace`, `limit`, `offset` |
| GET | `/api/v1/sync/status` | Get indexer sync status | - |
| GET | `/api/v1/reconciliation/discrepancies` | Get reconciliation discrepancies | `resolved`, `limit`, `offset` |

**Validation Schemas:**
- `transactionSignatureSchema` - Validates 88-character signatures
- `walletAddressSchema` - Validates 32-44 character addresses
- `walletActivityQuerySchema` - Validates pagination and activity type filters
- `slotSchema` - Validates numeric slot numbers
- `tokenIdSchema` - Validates token IDs
- `marketplaceQuerySchema` - Validates marketplace filters
- `discrepanciesQuerySchema` - Validates resolved status filters

### Health Routes (`health.routes.ts`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Basic health check |
| GET | `/health/db` | Database connectivity check |

---

## Services (`src/services/`)

### `cache-integration.ts`
- **Purpose:** Integrates with shared Redis cache system
- **Configuration:** Uses shared cache library with `blockchain:` key prefix
- **Connection:** Redis at configured host/port with authentication

---

## Controllers

❌ **No dedicated controller layer** - Route handlers directly implement business logic and call services/repositories.

---

## Repositories

❌ **No dedicated repository layer** - Data access is handled directly through:
- `src/utils/database.ts` for PostgreSQL queries
- Mongoose models for MongoDB operations

---

## Middleware (`src/middleware/`)

### `auth.ts`
- **Function:** `verifyJWT(request, reply)`
- **Purpose:** JWT token validation for protected routes
- **Features:**
  - Bearer token extraction from Authorization header
  - JWT verification using `JWT_SECRET`
  - Token expiration handling
  - Attaches decoded user data to `request.user`

### `tenant-context.ts`
- **Function:** `setTenantContext(request, reply)`
- **Purpose:** Multi-tenancy support via Row Level Security (RLS)
- **Features:**
  - Extracts tenant ID from JWT or defaults to system tenant
  - Sets PostgreSQL session variable `app.current_tenant`
  - Ensures data isolation per tenant
  - Attaches `tenantId` to request object

---

## Configuration (`src/config/`)

### `index.ts` - Main Configuration
Exports centralized configuration object:

```typescript
{
  database: {
    host, port, database, user, password
  },
  solana: {
    network, rpcUrl, wsUrl, commitment, programId
  },
  indexer: {
    port, batchSize, maxConcurrent, 
    reconciliationInterval, syncLagThreshold
  },
  marketplaces: {
    magicEden, tensor
  },
  redis: {
    host, port, password
  },
  logLevel, nodeEnv
}
```

**Configured External Services:**
- **PostgreSQL** (via PgBouncer) - Relational data storage
- **MongoDB** - Full transaction data and document storage
- **Redis** - Caching layer
- **Solana RPC** - Blockchain data retrieval
- **Solana WebSocket** - Real-time blockchain updates
- **Marketplace APIs** - Magic Eden, Tensor tracking

### `mongodb.ts`
- **Purpose:** MongoDB connection management
- **Functions:** `connectMongoDB()`, `disconnectMongoDB()`
- **Database:** Stores full transaction details, NFT metadata, wallet activity

### `secrets.ts`
- **Purpose:** AWS Secrets Manager integration
- **Loads:** PostgreSQL credentials, Redis password, database names
- **Integration:** Uses shared secrets manager utility

### `validate.ts`
- **Purpose:** Startup configuration validation and connection testing
- **Functions:**
  - `validateConfig()` - Validates all required environment variables
  - `validateConfigOrExit()` - Exits process if validation fails
  - `testMongoDBConnection()` - MongoDB connectivity test
  - `testPostgresConnection()` - PostgreSQL connectivity test
  - `testSolanaConnection()` - Solana RPC connectivity test
  - `testAllConnections()` - Comprehensive connection test
  - `getConfigSummary()` - Configuration logging

**Required Environment Variables:**
- DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
- MONGODB_URL, MONGODB_DB_NAME
- REDIS_HOST, REDIS_PORT
- SOLANA_RPC_URL, SOLANA_NETWORK, SOLANA_PROGRAM_ID
- JWT_SECRET

---

## Migrations (`src/migrations/`)

### `001_baseline_blockchain_indexer.ts`
Creates 6 tables owned by this service:

#### Tables Created:

1. **`indexer_state`** (singleton pattern)
   - Tracks current indexing progress
   - Fields: `last_processed_slot`, `last_processed_signature`, `indexer_version`, `is_running`, `started_at`
   - Single row (id=1) stores current state

2. **`indexed_transactions`**
   - Stores processed transaction metadata
   - Fields: `signature`, `slot`, `block_time`, `instruction_type`, `processed_at`
   - Indexes: signature, slot, instruction_type, processed_at
   - Queries: All indexed Solana transactions

3. **`marketplace_activity`**
   - Tracks NFT marketplace events
   - Fields: `token_id`, `ticket_id`, `marketplace`, `activity_type`, `price`, `seller`, `buyer`, `transaction_signature`, `block_time`
   - Activity Types: LIST, SALE, DELIST, BID
   - Marketplaces: Magic Eden, Tensor, Solanart, etc.
   - Foreign Key: `ticket_id` → `tickets.id`

4. **`reconciliation_runs`**
   - Tracks reconciliation job executions
   - Fields: `started_at`, `completed_at`, `status`, `tickets_checked`, `discrepancies_found`, `discrepancies_resolved`, `duration_ms`, `error_message`
   - Statuses: RUNNING, COMPLETED, FAILED

5. **`ownership_discrepancies`**
   - Records database vs blockchain mismatches
   - Fields: `ticket_id`, `discrepancy_type`, `database_value`, `blockchain_value`, `resolved`, `detected_at`, `resolved_at`
   - Types: OWNERSHIP_MISMATCH, TOKEN_NOT_FOUND, BURN_NOT_RECORDED, TOKEN_BURNED
   - Foreign Key: `ticket_id` → `tickets.id`

6. **`reconciliation_log`**
   - Audit log of reconciliation changes
   - Fields: `reconciliation_run_id`, `ticket_id`, `field_name`, `old_value`, `new_value`, `source`, `changed_at`
   - Foreign Keys: 
     - `reconciliation_run_id` → `reconciliation_runs.id` (CASCADE)
     - `ticket_id` → `tickets.id` (CASCADE)

**Row Level Security (RLS):**
- All tables have RLS enabled
- Tenant isolation policy: `tenant_id = current_setting('app.current_tenant')`

---

## Validators

❌ **No dedicated validator folder** - Validation schemas are defined inline within route files using Fastify's JSON schema validation.

---

## Models (`src/models/`) - MongoDB Schemas

### `blockchain-transaction.model.ts`
- **Collection:** `BlockchainTransaction`
- **Purpose:** Stores complete transaction data from Solana
- **Fields:**
  - `signature` (unique, indexed)
  - `slot`, `blockTime`
  - `accounts[]` - Array of account keys with signer/writable flags
  - `instructions[]` - Parsed instruction data
  - `logs[]` - Transaction log messages
  - `fee`, `status`, `errorMessage`
  - `indexedAt`
- **Indexes:**
  - `signature`, `slot`, `blockTime`
  - Compound: `blockTime + slot`, `accounts.pubkey + blockTime`, `instructions.programId + blockTime`

### `marketplace-event.model.ts`
- **Collection:** `MarketplaceEvent`
- **Purpose:** NFT marketplace activity tracking
- **Fields:**
  - `eventType` - sale, listing, delisting, price_change
  - `marketplace` - magic_eden, tensor, solanart, tickettoken, other
  - `signature` (unique)
  - `tokenId`, `price`, `seller`, `buyer`
  - `royaltiesPaid[]`, `marketplaceFee`
  - `timestamp`
- **Indexes:**
  - Single: `eventType`, `marketplace`, `signature`, `tokenId`, `seller`, `buyer`, `timestamp`
  - Compound: `tokenId + timestamp`, `marketplace + eventType + timestamp`, `seller + timestamp`, `buyer + timestamp`

### `nft-metadata.model.ts`
- **Collection:** `NFTMetadata`
- **Purpose:** Compressed NFT metadata storage
- **Fields:**
  - `assetId` (unique)
  - `tree`, `leafIndex`
  - `metadata` - name, symbol, uri, sellerFeeBasisPoints, creators[]
  - `merkleProof[]`
  - `owner`, `delegate`
  - `compressed`, `eventId`, `ticketNumber`
  - `mintedAt`
- **Indexes:**
  - Single: `assetId`, `tree`, `owner`, `delegate`, `eventId`, `mintedAt`
  - Compound: `eventId + ticketNumber`, `owner + mintedAt`, `tree + leafIndex` (unique)

### `wallet-activity.model.ts`
- **Collection:** `WalletActivity`
- **Purpose:** User wallet activity feed
- **Fields:**
  - `walletAddress`
  - `activityType` - purchase, sale, transfer, mint, burn, listing
  - `eventId`, `ticketId`, `assetId`
  - `transactionSignature`
  - `amount`, `fromAddress`, `toAddress`
  - `timestamp`
- **Indexes:**
  - Single: `walletAddress`, `activityType`, `eventId`, `ticketId`, `assetId`, `transactionSignature`, `timestamp`
  - Compound: `walletAddress + timestamp`, `walletAddress + activityType + timestamp`, `eventId + timestamp`

---

## Processors (`src/processors/`)

### `transactionProcessor.ts`
- **Class:** `TransactionProcessor`
- **Purpose:** Core transaction processing engine
- **Dependencies:** Solana Connection, Metaplex SDK
- **Key Methods:**
  - `processTransaction(sigInfo)` - Main processing pipeline
  - `saveToMongoDB(tx, signature, slot, blockTime)` - Dual-write to MongoDB
  - `processMint(tx, ...)` - Handles NFT minting
  - `processTransfer(tx, ...)` - Handles NFT transfers
  - `processBurn(tx, ...)` - Handles NFT burns
  - `parseInstructionType(tx)` - Determines transaction type from logs
  - `recordTransaction(...)` - Records to PostgreSQL

**Processing Flow:**
1. Check if transaction already processed (deduplication)
2. Fetch full transaction from Solana RPC
3. Parse instruction type (MINT_NFT, TRANSFER, BURN, UNKNOWN)
4. **Dual Write:**
   - Save full transaction to MongoDB
   - Process specific logic based on type
   - Update PostgreSQL tables (tickets, ticket_transfers)
   - Create WalletActivity records in MongoDB
5. Record in `indexed_transactions` table

### `marketplaceTracker.ts`
- **Class:** `MarketplaceTracker`
- **Purpose:** Real-time marketplace activity monitoring
- **Tracked Marketplaces:**
  - **Magic Eden** - `M2mx93ekt1fmXSVkTrUL9xVFHkmME8HTUi5Cyc5aF7K`
  - **Tensor** - `TCMPhJdwDryooaGtiocG1u3xcYbRpiJzb283XfCZsDp`
  - **Solanart** - `CJsLwbP1iu5DuUikHEJnLfANgKy6stB2uFgvBBHoyxwz`

**Key Methods:**
- `startTracking()` - Subscribe to marketplace program changes
- `stopTracking()` - Unsubscribe from all marketplaces
- `subscribeToMarketplace(key, marketplace)` - WebSocket subscription
- `processMarketplaceActivity(marketplace, accountInfo, context)` - Activity handler
- `parseMarketplaceTransaction(marketplace, tx)` - Parse marketplace-specific events
- `parseMagicEdenTransaction(tx, logs)` - Magic Eden event parsing
- `parseTensorTransaction(tx, logs)` - Tensor event parsing
- `isOurNFT(tokenId)` - Check if NFT belongs to TicketToken
- `recordActivity(marketplace, activity, sigInfo)` - Save to database
- `updateTicketStatus(activity)` - Update ticket ownership/listing status
- `startPolling()` - Backup polling mechanism (30s intervals)

**Activity Types:** SALE, LIST, DELIST, BID

---

## Reconciliation (`src/reconciliation/`)

### `reconciliationEngine.ts`
- **Class:** `ReconciliationEngine`
- **Purpose:** Basic reconciliation between database and blockchain
- **Interval:** Configurable (default: 300,000ms = 5 minutes)

**Key Methods:**
- `start(intervalMs)` - Start periodic reconciliation
- `stop()` - Stop reconciliation engine
- `runReconciliation()` - Execute reconciliation run
- `createRun()` - Create reconciliation_runs record
- `completeRun(runId, results, duration)` - Mark run complete
- `failRun(runId, errorMessage)` - Mark run failed
- `getTicketsToReconcile()` - Fetch tickets needing reconciliation (100 at a time)
- `checkTicket(ticket)` - Compare database vs blockchain state
- `getOnChainState(tokenId)` - Fetch blockchain state (placeholder)
- `resolveDiscrepancy(runId, ticket, discrepancy)` - Fix mismatches
- `markTicketReconciled(ticketId)` - Update reconciled_at timestamp

**Discrepancy Types:**
- `TOKEN_NOT_FOUND` - Minted in DB but not on chain
- `OWNERSHIP_MISMATCH` - Different owner in DB vs chain
- `BURN_NOT_RECORDED` - Burned on chain but not in DB

### `reconciliationEnhanced.ts`
- **Class:** `EnhancedReconciliationEngine`
- **Purpose:** Advanced reconciliation with on-chain queries
- **Dependencies:** OnChainQuery utility

**Enhanced Features:**
- `checkTicket(ticket)` - Returns array of discrepancies
- `detectBurns()` - Proactive burn detection scan (50 tickets)
- `verifyMarketplaceActivity()` - Verify recent marketplace sales (20 records)
- Real on-chain state verification via RPC calls
- Multiple discrepancy detection per ticket
- Auto-healing of discrepancies

---

## Sync (`src/sync/`)

### `historicalSync.ts`
- **Class:** `HistoricalSync`
- **Purpose:** Backfill historical blockchain data
- **Configuration:**
  - `batchSize` - 1000 slots per batch
  - `maxConcurrent` - 5 parallel batches

**Key Methods:**
- `syncRange(startSlot, endSlot)` - Sync slot range
- `processBatch(batch)` - Process batch of slots
- `getSignaturesInRange(startSlot, endSlot)` - Fetch signatures for slot range
- `saveProgress(slot)` - Update indexer_state with progress
- `estimateTimeRemaining(startSlot, endSlot, slotsPerSecond)` - Time estimate

**Features:**
- Parallel batch processing (5 concurrent)
- Progress tracking and logging
- Automatic retry on batch failures
- Rate limiting with 100ms delays between batches
- Handles Promise.allSettled for error resilience

---

## Utils (`src/utils/`)

### `database.ts`
- **Purpose:** PostgreSQL connection pool management
- **Exports:**
  - `query(text, params)` - Execute parameterized query
  - `getClient()` - Get pooled client for transactions
  - `pool` - Direct pool access
- **Configuration:**
  - Max connections: 20
  - Idle timeout: 30s
  - Connection timeout: 2s
- **Features:**
  - Slow query detection (>1s)
  - Connection event logging
  - Error handling

### `logger.ts`
- **Library:** Pino
- **Configuration:**
  - Log level from `LOG_LEVEL` env (default: info)
  - Pretty print in development
  - Service name: 'blockchain-indexer'
- **Usage:** Centralized logging throughout service

### `cache.ts`
- **Class:** `CacheManager`
- **Purpose:** Redis caching abstraction
- **Features:**
  - Get/Set with TTL support (default 300s)
  - Pattern-based deletion
  - Get-or-set pattern (fetch if miss)
  - Multi-get/set operations
  - Counter increment
  - Cache statistics
  - Key prefix support

**Cache Key Builders:**
- `CacheKeys.transaction(signature)`
- `CacheKeys.walletActivity(address, offset, limit)`
- `CacheKeys.nftHistory(tokenId)`
- `CacheKeys.syncStatus()`
- `CacheKeys.slotTransactions(slot)`
- `CacheKeys.marketplaceActivity(marketplace, offset, limit)`

### `redis.ts`
- **Purpose:** Simple Redis client instance
- **Configuration:** Host, port, password from environment
- **Features:** Auto-reconnect with exponential backoff, max 3 retries

### `retry.ts`
- **Purpose:** Retry logic with exponential backoff and circuit breaker
- **Exports:**
  - `retryWithBackoff<T>(fn, options, context)` - Retry function
  - `CircuitBreaker` class - Circuit breaker pattern

**Retry Options:**
- Max retries: 3
- Initial delay: 1000ms
- Max delay: 30000ms
- Backoff factor: 2x
- Retryable errors: ECONNREFUSED, ETIMEDOUT, ENOTFOUND, EAI_AGAIN

**Circuit Breaker:**
- States: CLOSED, OPEN, HALF_OPEN
- Failure threshold: 5
- Reset timeout: 60000ms
- Half-open test requests: 3

### `rpcFailover.ts`
- **Class:** `RPCFailoverManager`
- **Purpose:** Multi-RPC endpoint management with automatic failover
- **Features:**
  - Multiple endpoint support with priority
  - Health checks every 30s (configurable)
  - Circuit breaker per endpoint
  - Automatic failover on RPC errors
  - Consecutive failure tracking
  - Endpoint status reporting

**Key Methods:**
- `getConnection()` - Get current active connection
- `executeWithFailover(fn, context)` - Execute with auto-failover
- `getStatus()` - Get all endpoint statuses
- `stop()` - Stop health checks

### `onChainQuery.ts`
- **Class:** `OnChainQuery`
- **Purpose:** On-chain state verification utilities
- **Dependencies:** Solana Connection, Metaplex SDK

**Key Methods:**
- `getTokenState(tokenId)` - Get complete token state
  - Returns: `{ exists, burned, owner, supply, frozen }`
- `getNFTMetadata(tokenId)` - Fetch NFT metadata
- `getTransactionHistory(tokenId, limit)` - Get transaction history
- `parseTransactionType(tx)` - Parse transaction type from logs
- `verifyOwnership(tokenId, expectedOwner)` - Verify current owner
  - Returns: `{ valid, reason, actualOwner }`

**State Detection:**
- Checks mint account existence
- Detects burned tokens (supply = 0)
- Finds largest token account
- Determines current owner
- Identifies frozen accounts

### `metrics.ts`
- **Library:** prom-client (Prometheus metrics)
- **Purpose:** Application metrics collection
- **Metrics Exported:**

**Counters:**
- `transactionsProcessedTotal` - by instruction_type, status
- `blocksProcessedTotal`
- `rpcErrorsTotal` - by error_type
- `databaseErrorsTotal` - by database, operation
- `processingErrorsTotal` - by error_type
- `mongodbWrites` - by collection, status
- `postgresqlQueries` - by operation, status
- `reconciliationRuns` - by status
- `discrepanciesFound` - by discrepancy_type

**Gauges:**
- `currentSlot` - Current slot being processed
- `indexerLag` - Slots behind blockchain tip
- `lastProcessedSlot` - Last processed slot
- `indexerUptime` - Uptime in seconds
- `isHealthy` - Health status (0/1)

**Histograms:**
- `transactionProcessingDuration` - by instruction_type
- `rpcCallDuration` - by method
- `databaseWriteDuration` - by database, operation

---

## Metrics (`src/metrics/`)

### `metricsCollector.ts`
- **Class:** `MetricsCollector`
- **Purpose:** Metrics collection facade
- **Features:**
  - Custom Prometheus registry
  - Default system metrics (CPU, memory)
  - Convenience methods for recording metrics

**Methods:**
- `updateSyncLag(lag)` - Update sync lag gauge
- `recordTransaction(type, status, duration)` - Record transaction processing
- `recordReconciliation(status)` - Record reconciliation run
- `recordDiscrepancy(type)` - Record discrepancy found
- `recordRPCLatency(method, duration)` - Record RPC call timing
- `recordError(type, severity)` - Record error
- `getMetrics()` - Get Prometheus metrics string
- `getContentType()` - Get Prometheus content type

---

## API (`src/api/`)

### `server.ts`
- **Class:** `IndexerAPI`
- **Framework:** Fastify
- **Port:** 3456 (configurable)
- **Purpose:** REST API for indexer management and monitoring

**Routes:**

| Method | Path | Description | Authentication |
|--------|------|-------------|----------------|
| GET | `/health` | Service health check | None |
| GET | `/metrics` | Prometheus metrics endpoint | None |
| GET | `/stats` | Indexer statistics | None |
| GET | `/recent-activity` | Recent blockchain activity | None |
| GET | `/reconciliation/status` | Reconciliation status | None |
| POST | `/reconciliation/run` | Trigger manual reconciliation | None |
| POST | `/control/stop` | Stop indexer | None |
| POST | `/control/start` | Start indexer | None |

**Health Check Response:**
```json
{
  "status": "healthy|unhealthy",
  "checks": {
    "database": { "status": "healthy|unhealthy" },
    "indexer": {
      "status": "running|stopped|lagging",
      "lastProcessedSlot": 123456789,
      "lag": 10
    }
  },
  "timestamp": "2025-12-21T12:00:00.000Z"
}
```

**Stats Response:**
```json
{
  "indexer": {
    "isRunning": true,
    "lastProcessedSlot": 123456789,
    "currentSlot": 123456790,
    "lag": 1,
    "startedAt": "2025-12-21T10:00:00.000Z"
  },
  "transactions": {
    "total": 50000,
    "processed": 49000,
    "failed": 50,
    "recentByType": [
      { "instruction_type": "TRANSFER", "count": 120 },
      { "instruction_type": "MINT_NFT", "count": 45 }
    ]
  },
  "uptime": 7200000
}
```

---

## Other Folders

### `tests/` - Unit & Integration Tests
- **Setup:** `tests/setup.ts` - Test environment configuration
- **Unit Tests:**
  - `auth.test.ts` - JWT authentication middleware tests
  - `indexer.test.ts` - Core indexer functionality tests
  - `transactionProcessor.test.ts` - Transaction processing tests
- **Integration Tests:** `tests/integration/`
- **Coverage:** Reports generated in `coverage/` folder

---

## Architecture Summary

### Data Flow
```
Solana Blockchain
      ↓ (WebSocket subscription + RPC polling)
TransactionProcessor
      ↓
   ┌──────┴──────┐
   ↓             ↓
PostgreSQL    MongoDB
(relational)   (documents)
   ↓             ↓
  ┌──────────────┘
  ↓
Query API
  ↓
Clients
```

### Dual-Write Strategy
- **PostgreSQL:** Normalized relational data, tickets, transfers, reconciliation
- **MongoDB:** Full transaction data, NFT metadata, wallet activity, marketplace events
- **Why:** Balance between relational queries and document storage for complex blockchain data

### Reconciliation Strategy
1. **Periodic Scans:** Every 5 minutes (configurable)
2. **Ticket Selection:** Oldest reconciled_at first, 100 per batch
3. **State Comparison:** Database vs blockchain via RPC
4. **Auto-Healing:** Update database to match blockchain truth
5. **Audit Trail:** All changes logged in reconciliation_log

### Marketplace Tracking Strategy
1. **WebSocket Subscriptions:** Real-time program account changes
2. **Polling Backup:** Every 30 seconds for reliability
3. **Transaction Parsing:** Marketplace-specific log parsing
4. **Ownership Updates:** Auto-update ticket ownership on sales
5. **Activity Recording:** Store in marketplace_activity table

---

## External Dependencies

### Required Services
- **PostgreSQL** (via PgBouncer on port 6432) - Primary database
- **MongoDB** - Document storage
- **Redis** - Caching layer
- **Solana RPC** - Blockchain data access
- **Solana WebSocket** - Real-time updates

### NPM Packages (Key Dependencies)
- `@solana/web3.js` - Solana blockchain interaction
- `@metaplex-foundation/js` - NFT metadata handling
- `fastify` - Web framework
- `mongoose` - MongoDB ODM
- `pg` - PostgreSQL client
- `ioredis` - Redis client
- `pino` - Logging
- `prom-client` - Prometheus metrics
- `jsonwebtoken` - JWT authentication
- `knex` - Database migrations

---

## Environment Variables

### Database
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- `MONGODB_URL`, `MONGODB_DB_NAME`

### Redis
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`

### Solana
- `SOLANA_RPC_URL`, `SOLANA_WS_URL`
- `SOLANA_NETWORK` (mainnet-beta, devnet, testnet, localnet)
- `SOLANA_COMMITMENT` (confirmed, finalized)
- `PROGRAM_ID`, `SOLANA_PROGRAM_ID`

### Service Configuration
- `INDEXER_PORT` (default: 3456)
- `INDEXER_BATCH_SIZE` (default: 1000)
- `INDEXER_MAX_CONCURRENT` (default: 5)
- `RECONCILIATION_INTERVAL` (default: 300000ms)
- `SYNC_LAG_THRESHOLD` (default: 1000 slots)

### Marketplace
- `MARKETPLACE_MAGIC_EDEN`
- `MARKETPLACE_TENSOR`

### Security
- `JWT_SECRET` (minimum 32 characters)

### General
- `NODE_ENV` (development, production)
- `LOG_LEVEL` (debug, info, warn, error)
- `SERVICE_NAME` (blockchain-indexer)
- `METRICS_ENABLED` (default: true)

---

## Key Features

### ✅ Real-Time Indexing
- WebSocket subscriptions to Solana programs
- Continuous transaction processing
- Sub-second latency from blockchain to database

### ✅ Historical Sync
- Backfill capability for historical data
- Parallel batch processing
- Progress tracking and resumability

### ✅ Marketplace Integration
- Multi-marketplace support (Magic Eden, Tensor, Solanart)
- Real-time activity tracking
- Automatic ownership updates on sales

### ✅ Reconciliation Engine
- Periodic database vs blockchain consistency checks
- Auto-healing of discrepancies
- Comprehensive audit logging

### ✅ High Availability
- RPC failover with multiple endpoints
- Circuit breakers for fault tolerance
- Health checks and monitoring

### ✅ Observability
- Prometheus metrics export
- Structured logging with Pino
- Performance histograms
- Error tracking

### ✅ Multi-Tenancy
- Row Level Security (RLS) support
- Tenant context isolation
- Shared infrastructure, isolated data

---

## Performance Considerations

### Optimizations
- Connection pooling (PostgreSQL, MongoDB, Redis)
- Dual-write strategy for optimal query patterns
- Caching layer for frequently accessed data
- Batch processing for historical sync
- Concurrent transaction processing

### Monitoring
- Sync lag tracking (alerts if >10,000 slots)
- RPC latency monitoring
- Database query performance
- Error rates and types
- Circuit breaker states

---

## Security

### Authentication
- JWT token validation on all API routes
- Service-to-service authentication support

### Data Isolation
- Row Level Security (RLS) on all tables
- Tenant context enforcement
- Secure credential management via AWS Secrets Manager

### Input Validation
- Fastify JSON schema validation
- Parameter sanitization
- Type safety with TypeScript

---

## Deployment

### Docker Support
- `Dockerfile` included for containerization
- Health check endpoints for orchestration
- Graceful shutdown handling

### Database Migrations
- Knex.js migration system
- Version-controlled schema changes
- Rollback support

### Monitoring
- Prometheus metrics on `/metrics`
- Health endpoints for liveness/readiness probes
- Structured JSON logs for centralized logging

---

## Future Enhancements

### Potential Improvements
- [ ] GraphQL API layer for flexible queries
- [ ] Event streaming (Kafka/RabbitMQ) for real-time updates
- [ ] Enhanced marketplace support (additional platforms)
- [ ] Advanced analytics and reporting
- [ ] Configurable reconciliation strategies
- [ ] Webhook notifications for critical events
- [ ] Admin dashboard for monitoring
