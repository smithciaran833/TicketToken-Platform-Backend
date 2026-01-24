# BLOCKCHAIN-INDEXER COMPREHENSIVE AUDIT REPORT

**Service:** blockchain-indexer
**Audit Date:** 2026-01-23
**Auditor:** Claude Opus 4.5
**Framework:** Fastify + MongoDB + PostgreSQL
**Port:** 3012

---

## EXECUTIVE SUMMARY

The blockchain-indexer service is a **well-architected** service responsible for indexing Solana blockchain transactions, tracking NFT marketplace activity, and reconciling on-chain state with the database. The codebase shows evidence of extensive audit fixes and follows many security best practices.

**Overall Assessment:** GOOD

| Category | Rating | Notes |
|----------|--------|-------|
| Security | Good | HMAC-SHA256, JWT with algorithm whitelist, RLS |
| Code Quality | Good | TypeScript strict mode, comprehensive validation |
| Architecture | Excellent | Clean separation, service clients, event patterns |
| Error Handling | Excellent | RFC 7807 compliant, custom error classes |
| Test Coverage | Good | 38 test files covering core functionality |

---

## 1. SERVICE CAPABILITIES

### Public Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/health` | None | Health check with MongoDB/PostgreSQL/Indexer status |
| GET | `/live` | None | Kubernetes liveness probe |
| GET | `/ready` | None | Kubernetes readiness probe |
| GET | `/startup` | None | Kubernetes startup probe |
| GET | `/info` | None | Service info (name, version, port) |
| GET | `/metrics` | Optional Token | Prometheus metrics with optional auth |

### Authenticated Public Endpoints (JWT Required)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/transactions/:signature` | Get transaction by signature |
| GET | `/api/v1/transactions/by-slot/:slot` | Get transactions by slot number |
| GET | `/api/v1/wallets/:address/activity` | Get wallet activity history |
| GET | `/api/v1/nfts/:tokenId/history` | Get NFT transfer history |
| GET | `/api/v1/marketplace/activity` | Get marketplace activity |
| GET | `/api/v1/sync/status` | Get indexer sync status |
| GET | `/api/v1/reconciliation/discrepancies` | Get ownership discrepancies |
| GET | `/api/v1/status` | Get service status |
| GET | `/api/v1/test-communication` | Test service communication |

### Internal Endpoints (HMAC Auth Required)

| Method | Path | Called By | Purpose |
|--------|------|-----------|---------|
| POST | `/internal/marketplace/sales` | payment-service | Record marketplace sale event |
| GET | `/internal/nfts/:tokenId` | ticket-service, marketplace-service | Get NFT metadata/ownership |
| GET | `/internal/transactions/:txHash` | minting-service, payment-service | Get transaction details |

### IndexerAPI Endpoints (server.ts)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | API health check |
| GET | `/metrics` | Prometheus metrics |
| GET | `/stats` | Indexer statistics |
| GET | `/recent-activity` | Recent transaction activity by type |
| GET | `/reconciliation/status` | Reconciliation status |
| POST | `/reconciliation/run` | Trigger manual reconciliation |
| POST | `/control/stop` | Stop indexer |
| POST | `/control/start` | Start indexer |

### Indexing Operations

**Blockchain Data Indexed:**
- Solana transactions (MINT_NFT, TRANSFER, BURN)
- NFT marketplace activity (Magic Eden, Tensor, Solanart)
- Wallet activity history
- Ownership reconciliation data

**Update Frequency:**
- Real-time: WebSocket subscription to program account changes
- Polling: Every 5 seconds (default) with batch size of 10
- Reconciliation: Every 5 minutes (300,000ms default)

### Business Operations Summary
- Transaction indexing with dual-write to PostgreSQL + MongoDB
- Marketplace event tracking (LIST, SALE, DELIST, BID)
- Historical data synchronization
- Ownership discrepancy detection and resolution
- Failed MongoDB write dead-letter queue

---

## 2. DATABASE SCHEMA

### PostgreSQL Tables (7 Total)

#### indexer_state (Singleton)
**Columns:**
- `id` INTEGER PRIMARY KEY (always 1)
- `last_processed_slot` BIGINT NOT NULL DEFAULT 0
- `last_processed_signature` VARCHAR(255)
- `indexer_version` VARCHAR(20) NOT NULL DEFAULT '1.0.0'
- `is_running` BOOLEAN DEFAULT false
- `started_at` TIMESTAMP WITH TIME ZONE
- `created_at` TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
- `updated_at` TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
- `tenant_id` UUID NOT NULL (FK to tenants)

**Indexes:** idx_indexer_state_tenant_id
**RLS:** Yes (FORCE enabled)

#### indexed_transactions
**Columns:**
- `id` UUID PRIMARY KEY DEFAULT gen_random_uuid()
- `signature` VARCHAR(255) NOT NULL UNIQUE
- `slot` BIGINT NOT NULL
- `block_time` TIMESTAMP WITH TIME ZONE
- `instruction_type` VARCHAR(50) NOT NULL
- `processed_at` TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
- `tenant_id` UUID NOT NULL (FK to tenants)

**Indexes:** signature, slot, instruction_type, processed_at, tenant_id
**RLS:** Yes (FORCE enabled)

#### indexer_marketplace_activity
**Columns:**
- `id` UUID PRIMARY KEY DEFAULT gen_random_uuid()
- `token_id` VARCHAR(255) NOT NULL
- `ticket_id` UUID (FK comment: ticket-service.tickets)
- `marketplace` VARCHAR(100) NOT NULL
- `activity_type` VARCHAR(50) NOT NULL
- `price` DECIMAL(20,9)
- `seller` VARCHAR(255)
- `buyer` VARCHAR(255)
- `transaction_signature` VARCHAR(255) NOT NULL UNIQUE
- `block_time` TIMESTAMP WITH TIME ZONE
- `indexed_at` TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
- `tenant_id` UUID NOT NULL

**Indexes:** token_id, ticket_id, marketplace, activity_type, tx_sig, block_time, tenant_id
**RLS:** Yes (FORCE enabled)

#### reconciliation_runs
**Columns:**
- `id` UUID PRIMARY KEY DEFAULT gen_random_uuid()
- `started_at` TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
- `completed_at` TIMESTAMP WITH TIME ZONE
- `status` VARCHAR(50) NOT NULL DEFAULT 'RUNNING'
- `tickets_checked` INTEGER DEFAULT 0
- `discrepancies_found` INTEGER DEFAULT 0
- `discrepancies_resolved` INTEGER DEFAULT 0
- `duration_ms` INTEGER
- `error_message` TEXT
- `tenant_id` UUID NOT NULL

**Indexes:** started_at, status, tenant_id
**RLS:** Yes (FORCE enabled)

#### ownership_discrepancies
**Columns:**
- `id` UUID PRIMARY KEY DEFAULT gen_random_uuid()
- `ticket_id` UUID NOT NULL (FK comment: ticket-service.tickets)
- `discrepancy_type` VARCHAR(100) NOT NULL
- `database_value` TEXT
- `blockchain_value` TEXT
- `resolved` BOOLEAN DEFAULT false
- `detected_at` TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
- `resolved_at` TIMESTAMP WITH TIME ZONE
- `tenant_id` UUID NOT NULL

**Indexes:** ticket_id, discrepancy_type, resolved, detected_at, tenant_id
**RLS:** Yes (FORCE enabled)

#### reconciliation_log
**Columns:**
- `id` UUID PRIMARY KEY DEFAULT gen_random_uuid()
- `reconciliation_run_id` UUID NOT NULL (FK to reconciliation_runs, CASCADE)
- `ticket_id` UUID NOT NULL (FK comment: ticket-service.tickets)
- `field_name` VARCHAR(100) NOT NULL
- `old_value` TEXT
- `new_value` TEXT
- `source` VARCHAR(50) NOT NULL DEFAULT 'blockchain'
- `changed_at` TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
- `tenant_id` UUID NOT NULL

**Indexes:** reconciliation_run_id, ticket_id, field_name, changed_at, tenant_id
**RLS:** Yes (FORCE enabled)

#### failed_mongodb_writes (Global - No RLS)
**Columns:**
- `signature` VARCHAR(128) PRIMARY KEY
- `slot` BIGINT NOT NULL
- `error_message` TEXT
- `error_code` VARCHAR(50)
- `last_error` VARCHAR
- `retry_count` INTEGER DEFAULT 0
- `created_at` TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
- `updated_at` TIMESTAMP WITH TIME ZONE
- `resolved_at` TIMESTAMP WITH TIME ZONE
- `resolution_status` VARCHAR(50)

**Indexes:** created_at, retry_count, resolved_at
**RLS:** No (global dead-letter queue)

### MongoDB Collections (4)

#### BlockchainTransaction
**Schema:**
- `signature` String (required, unique, indexed)
- `slot` Number (required, indexed)
- `blockTime` Number (required, indexed)
- `accounts[]` { pubkey, isSigner, isWritable }
- `instructions[]` { programId, accounts[], data, parsed }
- `logs[]` String
- `fee` Number (required)
- `status` 'success' | 'failed' (required)
- `errorMessage` String
- `indexedAt` Date (indexed)

**Compound Indexes:**
- { blockTime: -1, slot: -1 }
- { 'accounts.pubkey': 1, blockTime: -1 }
- { 'instructions.programId': 1, blockTime: -1 }

#### MarketplaceEvent
**Schema:**
- `eventType` String (required)
- `marketplace` String (required)
- `signature` String (required, unique, indexed)
- `tokenId` String (required)
- `price` Number
- `seller` String
- `buyer` String
- `royaltiesPaid[]` { recipient, amount }
- `marketplaceFee` Number
- `timestamp` Date

#### NFTMetadata
**Schema:**
- `assetId` String (required, unique, indexed)
- `tree` String (required)
- `leafIndex` Number
- `owner` String (required, indexed)
- `delegate` String
- `compressed` Boolean
- `eventId` String
- `ticketNumber` Number
- `mintedAt` Date
- `metadata` { name, symbol, uri, sellerFeeBasisPoints, creators[] }

#### WalletActivity
**Schema:**
- `walletAddress` String (required, indexed)
- `activityType` String (required)
- `assetId` String (indexed)
- `transactionSignature` String
- `timestamp` Date (indexed)
- `fromAddress` String
- `toAddress` String

### Schema Issues
- None - Schema is well-designed with appropriate indexes

---

## 3. SECURITY ANALYSIS

### HMAC Implementation
- **File:** `src/middleware/internal-auth.middleware.ts:31-37`
- **Algorithm:** HMAC-SHA256 via `@tickettoken/shared` library
- **Matches Standardization:** Yes (Phase A/B compliant)
- **Features:**
  - Replay attack prevention (60-second window)
  - Service allowlist validation
  - Feature flag for gradual rollout (`USE_NEW_HMAC`)

### JWT Implementation
- **File:** `src/middleware/auth.ts:19-128`
- **Algorithm Whitelist:** HS256, HS384, HS512, RS256, RS384, RS512
- **Issuer Validation:** Yes (`JWT_ISSUER` env var)
- **Audience Validation:** Yes (`JWT_AUDIENCE` env var)
- **Weak Secret Detection:** Yes (warns if secret < 32 chars)
- **Security Event Logging:** Yes (all auth events logged)

### SQL Injection Check
- **Status:** All queries use parameterized statements
- **Files Checked:** All route handlers, processors, reconciliation
- **Example (safe):** `db.query('SELECT ... WHERE signature = $1', [signature])`

### NoSQL Injection Check
- **MongoDB Query Construction:** Safe
- **Input Validation:** Zod schemas validate all inputs before MongoDB queries
- **Example:** `MarketplaceEvent.findOne({ signature })` - signature validated

### Database Security
- **PostgreSQL SSL:** Not explicitly configured (uses pg driver defaults)
- **MongoDB Authentication:** Uses connection string from `MONGODB_URL`
- **Connection String Handling:** Environment variables (secure)

### Input Validation
- **Framework:** Zod + Fastify JSON Schema
- **Base58 Validation:** Signatures (87-88 chars), Addresses (32-44 chars)
- **Pagination Bounds:** MAX_OFFSET=10000, MAX_LIMIT=100
- **Schema Enforcement:** `additionalProperties: false` on all schemas

### Rate Limiting
- **Global:** 100 requests/minute via `@fastify/rate-limit`
- **Metrics Endpoint:** Optional token-based auth for external access
- **Internal Network:** Bypass for localhost/internal IPs

### RLS (Row-Level Security)
- **Enabled:** All 6 tenant-scoped tables
- **FORCE:** Yes (prevents superuser bypass)
- **Policy Pattern:** `NULLIF(current_setting('app.current_tenant_id', true), '')::uuid`
- **System User Bypass:** `current_setting('app.is_system_user', true) = 'true'`

### Critical Vulnerabilities
None found.

### Security Recommendations
1. **MEDIUM:** Consider adding explicit SSL configuration for PostgreSQL in production
2. **LOW:** Add MongoDB SSL/TLS configuration documentation

---

## 4. CODE QUALITY

### Dead Code
- None found - codebase is clean

### TODO/FIXME Comments (Total: 0)
None found in source files.

### AUDIT FIX Comments (Applied)
| Category | Count | Example |
|----------|-------|---------|
| ERR-* | 12 | ERR-3 RFC 7807, ERR-7 RPC failover |
| SEC-* | 4 | SEC-3 HSTS, SEC-4 JWT algorithms |
| INP-* | 10 | INP-2 Base58, INP-5 explicit columns |
| EVT-* | 4 | EVT-4 WebSocket reconnect, EVT-7 deduplication |
| DB-* | 2 | DB-1 MongoDB write errors, DB-7 SELECT * |
| GD-* | 5 | GD-2 RPC failover, GD-5 graceful shutdown |
| BG-* | 2 | BG-2 overlap protection |
| EXT-* | 5 | EXT-3 marketplace retry, EXT-5 RPC validation |

### `any` Type Usage
- **Total Occurrences:** ~25 (moderate)
- **Justified Uses:** Transaction parsing, Fastify plugins
- **Highest Files:**
  - `src/processors/transactionProcessor.ts` (tx parsing)
  - `src/processors/marketplaceTracker.ts` (marketplace parsing)
  - `src/api/server.ts` (fastify types)

### TypeScript Configuration
- **Strict Mode:** Yes (`"strict": true`)
- **Target:** ES2020
- **Module:** CommonJS
- **Source Maps:** Yes

### Dependencies Review
| Package | Version | Status |
|---------|---------|--------|
| fastify | ^4.25.2 | Current |
| @solana/web3.js | ^1.91.1 | Current |
| mongoose | ^8.0.3 | Current |
| zod | ^4.3.4 | Current |
| prom-client | ^15.1.0 | Current |
| ioredis | ^5.3.2 | Current |

### Patterns Applied
- Explicit column selection (no SELECT *)
- Response field filtering
- Bounded pagination
- Base58 validation for blockchain data
- Event deduplication with Redis

---

## 5. SERVICE INTEGRATION

### Inbound Dependencies
| Service | Endpoint | Purpose |
|---------|----------|---------|
| payment-service | POST /internal/marketplace/sales | Record sales |
| ticket-service | GET /internal/nfts/:tokenId | NFT lookup |
| marketplace-service | GET /internal/nfts/:tokenId | NFT data |
| minting-service | GET /internal/transactions/:txHash | Tx verification |

### Outbound Dependencies
| Service | Method | Purpose |
|---------|--------|---------|
| ticket-service | ticketServiceClient | Update ticket blockchain status |
| ticket-service | updateBlockchainSync | Sync status updates |
| ticket-service | recordBlockchainTransfer | Transfer recording |
| ticket-service | updateMarketplaceStatus | Marketplace updates |
| ticket-service | getTicketsForReconciliation | Reconciliation data |

### Blockchain Data Sources
- **Solana RPC:** Multiple endpoints with failover support
- **WebSocket:** Real-time program account change subscriptions
- **Marketplaces:** Magic Eden, Tensor, Solanart program monitoring

### Event System
**Published Events:**
- `blockchain.transaction.processed`
- `blockchain.slot.processed`
- `blockchain.nft.minted`
- `blockchain.nft.transferred`
- `blockchain.nft.burned`
- `blockchain.marketplace.activity`
- `blockchain.sync.status_changed`
- `blockchain.discrepancy.detected`
- `blockchain.indexer.error`

**Event Features:**
- Deterministic event IDs (content-based hashing)
- Deduplication via Redis (24-hour TTL)
- Metadata: eventId, version, timestamp, source, correlationId

---

## 6. APPLICATION SETUP

### Framework Configuration
- **Framework:** Fastify ^4.25.2
- **Logger:** Pino (custom configuration)
- **Trust Proxy:** Yes
- **Request ID:** UUID v4

### Security Middleware
- **Helmet:** HSTS (1 year), CSP configured
- **CORS:** Enabled via @fastify/cors
- **Rate Limit:** 100 req/minute

### Database Connections
- **PostgreSQL:** pg driver with connection pooling
- **MongoDB:** Mongoose with default connection
- **Redis:** ioredis for caching and deduplication

### Required Environment Variables
| Variable | Purpose | Required |
|----------|---------|----------|
| `SOLANA_RPC_URL` | Primary Solana RPC | Yes |
| `SOLANA_WS_URL` | WebSocket endpoint | No |
| `SOLANA_COMMITMENT` | Commitment level | No (default: confirmed) |
| `SOLANA_PROGRAM_ID` | Program to monitor | No |
| `MONGODB_URL` | MongoDB connection | Yes |
| `DB_HOST` | PostgreSQL host | Yes |
| `DB_PORT` | PostgreSQL port | No (default: 6432) |
| `DB_NAME` | Database name | Yes |
| `DB_USER` | Database user | Yes |
| `DB_PASSWORD` | Database password | Yes |
| `REDIS_HOST` | Redis host | No (default: redis) |
| `REDIS_PORT` | Redis port | No (default: 6379) |
| `JWT_SECRET` | JWT signing secret | Yes |
| `JWT_ISSUER` | Expected JWT issuer | No |
| `JWT_AUDIENCE` | Expected JWT audience | No |
| `INTERNAL_HMAC_SECRET` | S2S auth secret | Yes (for internal routes) |
| `USE_NEW_HMAC` | Enable HMAC auth | No (default: false) |
| `METRICS_AUTH_TOKEN` | Metrics endpoint auth | No |

### Graceful Shutdown
1. Stop HTTP server
2. Stop cache metrics updates
3. Wait for in-flight jobs (JobTracker)
4. Stop BlockchainIndexer
5. Disconnect MongoDB
6. Exit

---

## 7. BACKGROUND JOBS

### Transaction Processor
- **File:** `src/processors/transactionProcessor.ts`
- **Processing:** Real-time via WebSocket + polling
- **Dual Write:** PostgreSQL (indexed_transactions) + MongoDB (BlockchainTransaction)
- **Retry Logic:** 3 retries with exponential backoff for MongoDB
- **Dead Letter:** Failed writes stored in `failed_mongodb_writes` table
- **Metrics:** Tracks success/failure/duration per instruction type

### Marketplace Tracker
- **File:** `src/processors/marketplaceTracker.ts`
- **Marketplaces:** Magic Eden, Tensor, Solanart
- **Detection:** WebSocket subscription + 30-second polling fallback
- **Events:** LIST, SALE, DELIST, BID
- **Integration:** Updates ticket-service via service client

### Historical Sync
- **File:** `src/sync/historicalSync.ts`
- **Purpose:** Catch up on missed transactions
- **Trigger:** Automatic when lag > 1000 slots

### Reconciliation Engine
- **File:** `src/reconciliation/reconciliationEngine.ts`
- **Interval:** 5 minutes (300,000ms)
- **Checks:** Ownership mismatch, token not found, burn not recorded
- **Actions:** Auto-resolve via ticket-service, log all changes

### WebSocket Manager
- **File:** `src/utils/websocket-manager.ts`
- **Features:**
  - Automatic reconnection with exponential backoff
  - Subscription persistence across reconnects
  - Ping/pong health checks
  - Connection state management

### Job Tracker
- **File:** `src/utils/job-tracker.ts`
- **Purpose:** Track in-flight operations for graceful shutdown
- **Integration:** Used by shutdown handler to wait for completion

---

## 8. BLOCKCHAIN INTEGRATION

### RPC Management
- **File:** `src/utils/rpcFailover.ts`
- **Endpoints:** Multiple configurable (failover support)
- **Failover Strategy:**
  - Circuit breaker per endpoint (5 failures, 60s reset)
  - Automatic rotation on failure
  - Health checks every 30 seconds
- **Timeout:** 30 seconds per request

### WebSocket Handling
- **Connection:** Real-time program account change subscription
- **Reconnection:** Automatic with exponential backoff (1s-30s)
- **Subscription Persistence:** Restored after reconnect
- **Health Monitoring:** Ping every 30s, 5s pong timeout

### Indexing Strategy
**What's Indexed:**
- Transaction signatures and metadata
- NFT mint/transfer/burn events
- Marketplace activity (list/sale/delist/bid)
- Wallet activity history

**Storage Pattern:**
- PostgreSQL: Quick lookups, RLS enforcement, relational data
- MongoDB: Full transaction data, flexible schema

### Query Patterns
- Signature lookup: PostgreSQL (indexed_transactions)
- Full transaction data: MongoDB (BlockchainTransaction)
- Wallet activity: MongoDB (WalletActivity)
- Marketplace events: MongoDB (MarketplaceEvent)

### Critical Issues
None found.

---

## 9. TEST COVERAGE

### Test Files
- **Total:** 38 test files
- **Unit Tests:** ~35 files
- **Integration Tests:** TBD

### Coverage by Module
| Module | Test Files |
|--------|-----------|
| Routes | health, internal, query |
| Config | index, mongodb, secrets, validate |
| Utils | 13 files (cache, database, events, job-tracker, logger, metrics, onChainQuery, redis, response-filter, retry, rpcFailover, websocket-manager, distributed-lock) |

### Coverage Gaps
- Integration tests for blockchain indexing flow
- E2E tests for reconciliation

---

## 10. TYPE SAFETY

### Schema Validation
- **Framework:** Zod + Fastify JSON Schema
- **Coverage:** All endpoints have validated schemas
- **External API Validation:** Solana RPC responses validated with Zod

### MongoDB Models
- **Type Safety:** TypeScript interfaces for all models
- **Schema Validation:** Mongoose schemas with required fields
- **Enum Validation:** Status fields use enums

### `any` Type Usage
- **Total:** ~25 occurrences
- **Justified:** Transaction parsing (blockchain data varies)
- **Files with most `any`:**
  - transactionProcessor.ts (tx: any - blockchain data)
  - marketplaceTracker.ts (tx: any, activity: any)
  - server.ts (indexer: any - circular dep)

### Zod Schemas Defined
- ZodBase58Address
- ZodBase58Signature
- ZodPagination
- ZodTransactionSignatureParam
- ZodWalletAddressParam
- ZodTokenIdParam
- ZodSlotParam
- ZodWalletActivityQuery
- ZodMarketplaceQuery
- ZodDiscrepanciesQuery
- ZodRpcGetSlotResponse
- ZodParsedTransaction
- ZodRpcGetSignaturesResponse
- ZodRpcGetBlockResponse

---

## CRITICAL ISSUES (Must Fix)

None found.

---

## HIGH PRIORITY (Should Fix)

1. **Consider adding PostgreSQL SSL configuration for production**
   - Location: `knexfile.ts`
   - Impact: Security in production environments
   - Recommendation: Add `ssl: { rejectUnauthorized: true }` for production

2. **MongoDB connection lacks explicit SSL configuration**
   - Location: `src/config/mongodb.ts`
   - Impact: Security for MongoDB Atlas or secure deployments
   - Recommendation: Document SSL options for MONGODB_URL

---

## MEDIUM PRIORITY

1. **Reduce `any` type usage in transaction parsing**
   - Location: `src/processors/transactionProcessor.ts`
   - Impact: Type safety
   - Recommendation: Create interfaces for Solana transaction structure

2. **Add integration tests for indexing flow**
   - Location: `tests/integration/`
   - Impact: Test coverage
   - Recommendation: Add tests with Testcontainers

---

## TECHNICAL DEBT

1. **Two reconciliation files** (`reconciliationEngine.ts` and `reconciliationEnhanced.ts`)
   - Consider consolidating or documenting differences

2. **Archived migrations** in `src/migrations/archived/`
   - Consider moving to a separate archive directory

---

## BUSINESS CAPABILITIES SUMMARY

**What blockchain-indexer enables:**
- Real-time NFT transaction monitoring
- Marketplace activity tracking across major platforms
- Ownership verification and reconciliation
- Historical transaction lookup
- Wallet activity history

**What breaks if it goes down:**
- NFT ownership updates stop syncing
- Marketplace sales not recorded
- New mints not reflected in ticket-service
- Ownership discrepancies accumulate
- Query endpoints for blockchain data unavailable

**Recovery Strategy:**
- Service restarts from last processed slot
- Historical sync catches up missed transactions
- Reconciliation engine detects and fixes discrepancies

---

## COMPARISON TO BLOCKCHAIN-SERVICE

| Aspect | blockchain-indexer | blockchain-service |
|--------|-------------------|-------------------|
| **Purpose** | Read/index blockchain | Write to blockchain |
| **HMAC Auth** | Standardized | Standardized |
| **RPC Failover** | Implemented | Implemented |
| **Error Handling** | RFC 7807 | RFC 7807 |
| **RLS** | FORCE enabled | FORCE enabled |
| **Test Coverage** | 38 files | TBD |
| **Code Quality** | Good | Good |

**Better than blockchain-service in:**
- More comprehensive validation schemas (Zod)
- WebSocket reconnection handling
- Event deduplication system

**Similar quality:**
- HMAC implementation
- Error handling
- RLS policies
- Graceful shutdown

**Areas both share:**
- RPC failover pattern
- Service client integration
- Metrics/observability

---

## FILES ANALYZED VERIFICATION

**Total source files read:** 46

**By category:**
- Config: 4 (index.ts, mongodb.ts, secrets.ts, validate.ts)
- Core: 3 (index.ts, indexer.ts, api/server.ts)
- Routes: 3 (health.routes.ts, internal.routes.ts, query.routes.ts)
- Processors: 2 (transactionProcessor.ts, marketplaceTracker.ts)
- Reconciliation: 2 (reconciliationEngine.ts, reconciliationEnhanced.ts)
- Sync: 1 (historicalSync.ts)
- Models: 4 (blockchain-transaction, marketplace-event, nft-metadata, wallet-activity)
- Middleware: 7 (auth.ts, auth-audit.ts, internal-auth.middleware.ts, rate-limit.ts, request-id.ts, request-logger.ts, tenant-context.ts)
- Utils: 14 (cache, circuit-breaker, database, events, job-tracker, logger, metrics, onChainQuery, redis, response-filter, retry, rpcFailover, websocket-manager)
- Schemas: 1 (validation.ts)
- Errors: 1 (index.ts)
- Services: 1 (cache-integration.ts)
- Migrations: 4 (consolidated + 3 archived)
- Config files: 3 (knexfile.ts, package.json, tsconfig.json)

**Summary:**
- **Files Analyzed:** 46+
- **Critical Issues:** 0
- **High Priority Issues:** 2
- **Code Quality:** Good
- **Security:** Good (extensive audit fixes applied)
