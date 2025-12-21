# Transfer Service - Complete Overview

## Service Purpose
The Transfer Service manages ticket ownership transfers between users, including gift transfers, sales, and trades. It provides blockchain integration for NFT transfers on Solana, comprehensive business rule enforcement, fee calculation, batch operations, and real-time notifications.

---

## 📁 Directory Structure

```
transfer-service/
├── src/
│   ├── routes/          # API endpoint definitions
│   ├── controllers/     # HTTP request handlers
│   ├── services/        # Business logic layer
│   ├── models/          # Data models and types
│   ├── middleware/      # Request processing middleware
│   ├── config/          # Configuration management
│   ├── migrations/      # Database schema migrations
│   ├── validators/      # Input validation schemas
│   └── utils/           # Utility functions and helpers
├── tests/              # Unit, integration, and e2e tests
└── package.json
```

---

## 🛣️ Routes (`routes/`)

### **transfer.routes.ts**
Core transfer endpoints:

| Method | Path | Purpose | Middleware |
|--------|------|---------|------------|
| POST | `/api/v1/transfers/gift` | Create gift transfer | authenticate, validate |
| POST | `/api/v1/transfers/:transferId/accept` | Accept transfer | authenticate, validate |

### **health.routes.ts**
Health check and monitoring endpoints:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Basic liveness probe |
| GET | `/health/ready` | Readiness check (DB + Redis) |
| GET | `/health/detailed` | Comprehensive health with circuit breakers |
| GET | `/health/db-pool` | Database pool statistics |
| GET | `/health/memory` | Memory usage statistics |

---

## 🎯 Controllers (`controllers/`)

### **transfer.controller.ts**
HTTP request handlers for transfer operations.

**Methods:**
- `createGiftTransfer(request, reply)` - Handle POST `/api/v1/transfers/gift`
  - Extracts user ID from JWT token
  - Validates ticket ownership
  - Creates gift transfer record
  - Returns transfer ID and acceptance code

- `acceptTransfer(request, reply)` - Handle POST `/api/v1/transfers/:transferId/accept`
  - Validates acceptance code
  - Transfers ticket ownership
  - Updates transfer status
  - Returns success and new ownership info

- `handleError(error, reply)` - Centralized error handling
  - Maps custom errors to HTTP status codes
  - Provides consistent error responses

---

## 🧩 Services (`services/`)

### **transfer.service.ts**
Core transfer business logic.

**Key Methods:**
- `createGiftTransfer(fromUserId, request)` - Create gift transfer
  - Verifies ticket ownership with row lock
  - Checks if ticket type is transferable
  - Gets or creates recipient user by email
  - Generates acceptance code
  - Sets 48-hour expiry
  - Creates transfer record

- `acceptTransfer(transferId, request)` - Accept pending transfer
  - Validates acceptance code
  - Checks expiry
  - Updates ticket ownership
  - Creates transaction record
  - Marks transfer complete

**Private Helpers:**
- `getTicketForUpdate()` - Get ticket with FOR UPDATE lock
- `getTicketType()` - Fetch ticket type configuration
- `getOrCreateUser()` - Find or create user by email
- `getTransferForUpdate()` - Get transfer with row lock
- `expireTransfer()` - Mark transfer as expired
- `createTransferTransaction()` - Record transaction history
- `generateAcceptanceCode()` - Generate random 8-character code

### **batch-transfer.service.ts**
Handles bulk transfer operations.

**Key Methods:**
- `executeBatchTransfer(fromUserId, items)` - Process multiple transfers
  - Creates batch record
  - Processes each transfer sequentially
  - Tracks success/failure counts
  - Updates batch status
  - Returns detailed results

- `getBatchStatus(batchId)` - Get batch execution status
  - Returns batch metadata
  - Lists all item statuses

- `cancelBatch(batchId)` - Cancel pending batch

**Tables Used:**
- `batch_transfers` - Batch metadata
- `batch_transfer_items` - Individual item results

### **blockchain-transfer.service.ts**
Integrates blockchain NFT transfers with database transfers.

**Key Methods:**
- `executeBlockchainTransfer(params)` - Full blockchain transfer flow
  - Verifies NFT ownership with retry
  - Executes Solana NFT transfer with retry
  - Polls for transaction confirmation
  - Updates database with signature and explorer URL
  - Records blockchain metadata

- `getBlockchainTransferDetails(transferId)` - Get blockchain tx info
- `verifyBlockchainTransfer(nftMintAddress, expectedOwner)` - Verify current owner
- `getTicketNFTMetadata(ticketId)` - Fetch NFT metadata

**Features:**
- Retry logic with exponential backoff
- Transaction confirmation polling
- Failed transfer tracking for retry queue
- Blockchain metrics recording

### **nft.service.ts**
Handles NFT operations on Solana blockchain.

**Key Methods:**
- `transferNFT(params)` - Transfer NFT between wallets
  - Uses Metaplex SDK
  - Returns transaction signature and explorer URL

- `getNFTMetadata(mintAddress)` - Fetch NFT metadata
- `verifyOwnership(mintAddress, walletAddress)` - Check if wallet owns NFT
- `getNFTOwner(mintAddress)` - Get current owner address
- `nftExists(mintAddress)` - Check if NFT exists

**Dependencies:**
- `@solana/web3.js` - Solana blockchain client
- `@metaplex-foundation/js` - Metaplex NFT SDK

### **cache.service.ts**
Redis-based caching for performance optimization.

**Key Methods:**
- `get<T>(key, options)` - Get cached value
- `set(key, value, options)` - Set cached value with optional TTL
- `del(key, options)` - Delete cached value
- `delPattern(pattern, options)` - Delete all keys matching pattern
- `getOrSet<T>(key, fetchFn, options)` - Cache-aside pattern
- `incr(key, options)` - Increment counter
- `exists(key, options)` - Check if key exists
- `ttl(key, options)` - Get remaining TTL

**Namespaces:**
- `TRANSFER` - Transfer data
- `USER` - User data
- `TICKET` - Ticket data
- `ANALYTICS` - Analytics data
- `RULES` - Business rules

**TTL Constants:**
- SHORT: 60s
- MEDIUM: 5min
- LONG: 1hr
- DAY: 24hrs

### **pricing.service.ts**
Calculates transfer fees and handles pricing logic.

**Key Methods:**
- `calculateTransferFee(params)` - Calculate all fees
  - Base transfer fee
  - Platform fee (percentage of sale price)
  - Service fee (flat)
  - Transfer type multipliers (Gift: 0.5x, Sale: 1.0x, Trade: 0.75x)
  - Returns detailed breakdown

- `applyPromotionalDiscount(fee, promoCode)` - Apply discount
  - Validates promo code
  - Applies percentage or flat discount

- `recordFeePayment(transferId, fee, paymentMethod)` - Record payment

**Tables Used:**
- `ticket_types` - Fee configuration
- `promotional_codes` - Discount codes
- `transfer_fees` - Payment records

### **transfer-rules.service.ts**
Enforces transfer restrictions and business rules.

**Key Methods:**
- `validateTransfer(params)` - Validate against all active rules
  - Checks all rules in priority order
  - Supports blocking and non-blocking rules
  - Returns allowed/denied with reasons

**Rule Types:**
- `MAX_TRANSFERS_PER_TICKET` - Limit transfers per ticket
- `MAX_TRANSFERS_PER_USER_PER_DAY` - Daily user limit
- `BLACKLIST_CHECK` - Check user blacklist
- `COOLING_PERIOD` - Time between transfers
- `EVENT_DATE_PROXIMITY` - Block transfers near event
- `IDENTITY_VERIFICATION` - Require verified users

**Tables Used:**
- `transfer_rules` - Rule definitions
- `user_blacklist` - Blacklisted users
- `ticket_transfers` - Transfer history

### **transfer-analytics.service.ts**
Provides analytics and insights on transfer patterns.

**Key Methods:**
- `getTransferMetrics(params)` - Get metrics for time period
  - Total transfers
  - Completed/pending/failed counts
  - Average transfer time
  - Top transferred tickets

- `getUserTransferStats(userId)` - User-specific stats
  - Total sent/received
  - Success rate
  - Average acceptance time

- `getTransferTrends(params)` - Time-series trends
  - Aggregated by hour/day/week/month

- `getTransferFeeAnalytics(params)` - Fee analytics
  - Total fees collected
  - Average fee
  - Fee breakdown

- `getBlockchainTransferAnalytics(params)` - Blockchain stats
  - Blockchain transfer counts
  - Average confirmation time

- `getTransferVelocity(tenantId, hours)` - Transfers per hour

**Tables Used:**
- `ticket_transfers` - Transfer data
- `transfer_fees` - Fee data
- All queries are tenant-scoped

### **event-stream.service.ts**
Real-time event streaming using WebSocket (Socket.IO).

**Key Features:**
- User authentication via JWT
- Room-based subscriptions (user rooms, transfer rooms)
- Redis pub/sub for distributed events
- Real-time notifications

**Event Types:**
- `TRANSFER_UPDATE` - Transfer status changes
- `TRANSFER_STATUS` - Transfer state updates
- `BLOCKCHAIN_UPDATE` - Blockchain tx updates
- `NOTIFICATION` - General notifications

**Methods:**
- `publishEvent(event)` - Publish to Redis channel
- `sendToUser(userId, event)` - Send to specific user
- `sendToTransfer(transferId, event)` - Send to transfer subscribers
- `broadcast(event)` - Send to all connected clients
- `getConnectedCount()` - Get connected client count

### **webhook.service.ts**
Sends real-time webhook notifications for transfer events.

**Key Methods:**
- `sendWebhook(tenantId, eventType, data)` - Send webhook
  - Finds active subscriptions
  - Delivers to all endpoints
  - Retries up to 3 times with backoff
  - Generates HMAC signature
  - Logs delivery status

- `testWebhook(subscriptionId)` - Test webhook endpoint

**Webhook Event Types:**
- `transfer.created` - Transfer initiated
- `transfer.accepted` - Transfer accepted
- `transfer.rejected` - Transfer rejected
- `transfer.completed` - Transfer completed
- `transfer.failed` - Transfer failed
- `transfer.cancelled` - Transfer cancelled
- `blockchain.confirmed` - Blockchain tx confirmed

**Tables Used:**
- `webhook_subscriptions` - Webhook endpoints
- `webhook_deliveries` - Delivery logs

**Security:**
- HMAC-SHA256 signature verification
- Custom headers for event type

### **search.service.ts**
Advanced search and filtering for transfers.

**Key Methods:**
- `searchTransfers(tenantId, filters, options)` - Full-text search
  - Status filter
  - User filters (from/to)
  - Ticket/event filters
  - Transfer type filter
  - Date range filter
  - Amount range filter
  - Blockchain signature filter
  - Full-text search on codes/emails
  - Pagination and sorting
  - Returns paginated results with total count

- `getTransferSuggestions(tenantId, searchTerm, limit)` - Autocomplete
- `getFacets(tenantId, filters)` - Get faceted counts

**Supported Sort Fields:**
- created_at
- updated_at
- status
- transfer_type
- sale_price

---

## 📊 Models (`models/`)

### **transfer.model.ts**
Data models and type definitions.

**Interfaces:**
- `Transfer` - Transfer record
- `Ticket` - Ticket record
- `TicketType` - Ticket type configuration
- `User` - User record
- `TransferTransaction` - Transaction history

**DTOs:**
- `CreateGiftTransferRequest` - Gift transfer input
- `CreateGiftTransferResponse` - Gift transfer output
- `AcceptTransferRequest` - Accept transfer input
- `AcceptTransferResponse` - Accept transfer output

**Custom Errors:**
- `TransferError` - Base transfer error (400)
- `TransferNotFoundError` - Transfer not found (404)
- `TransferExpiredError` - Transfer expired (400)
- `TicketNotFoundError` - Ticket not found (404)
- `TicketNotTransferableError` - Not transferable (400)

---

## 🛡️ Middleware (`middleware/`)

### **auth.middleware.ts**
JWT authentication and authorization.

**Functions:**
- `authenticate(request, reply)` - Verify JWT token
  - Extracts Bearer token
  - Validates JWT signature
  - Extracts user and tenant info
  - Attaches to request object

- `requireTenant(request, reply)` - Ensure tenant context
- `requireAdmin(request, reply)` - Admin role required
- `requireVenueManager(request, reply)` - Venue manager role required

**JWT Claims:**
- `id` - User ID (required)
- `email` - User email
- `roles` - User roles array
- `tenant_id` - Tenant ID

### **validation.middleware.ts**
Zod-based request validation.

**Functions:**
- `validateBody(schema)` - Validate request body
- `validateQuery(schema)` - Validate query parameters
- `validateParams(schema)` - Validate URL parameters
- `validate(schemas)` - Combined validation (body + query + params)
- `formatZodError(error)` - Format validation errors
- `setupValidationErrorHandler(app)` - Global error handler

**Features:**
- Type-safe validation with Zod
- Automatic error formatting
- Detailed field-level error messages

### **rate-limit.middleware.ts**
Redis-based rate limiting.

**Class: RateLimiter**
- Sliding window algorithm
- Redis-backed for distributed systems
- Configurable window and max requests

**Function:**
- `createRateLimitMiddleware(redis, config)` - Create middleware

**Presets:**
- `strict` - 10 req/min
- `standard` - 100 req/min
- `lenient` - 1000 req/min
- `transferCreation` - 5 req/min
- `transferAcceptance` - 10 req/min

**Response Headers:**
- `X-RateLimit-Limit` - Max requests
- `X-RateLimit-Remaining` - Remaining requests
- `X-RateLimit-Reset` - Reset timestamp

### **tenant-context.ts**
Multi-tenancy Row Level Security (RLS) support.

**Functions:**
- `setTenantContext(request, reply)` - Set PostgreSQL session variable
  - Extracts tenant_id from JWT
  - Executes `SET LOCAL app.current_tenant = ?`
  - Required for RLS policies to work

- `requireTenantContext(request, reply)` - Ensure tenant is set

**Important:**
- Must run AFTER auth middleware
- Sets PostgreSQL session variable for RLS
- All tables use RLS for tenant isolation

### **requestId.ts**
Request ID middleware (compatibility wrapper).

- Fastify has built-in request ID support
- This file kept for backward compatibility

---

## ⚙️ Config (`config/`)

### **solana.config.ts**
Solana blockchain connection and Metaplex setup.

**Configuration:**
- `connection` - Solana RPC connection
- `metaplex` - Metaplex SDK instance
- `treasury` - Treasury keypair for transactions
- `collectionMint` - NFT collection mint address

**Required Environment Variables:**
- `SOLANA_RPC_URL` - RPC endpoint URL
- `SOLANA_TREASURY_PRIVATE_KEY` - Base58 private key
- `SOLANA_COLLECTION_MINT` - Collection mint address

**Helper Functions:**
- `getClusterName()` - Detect cluster (devnet/testnet/mainnet/localnet)
- `getExplorerUrl(signature)` - Generate Solana Explorer URL

### **secrets.ts**
Secrets management integration.

**Function:**
- `loadSecrets()` - Load secrets from AWS Secrets Manager
  - PostgreSQL credentials
  - Redis password
  - Other common secrets

**Uses:**
- Shared secrets manager from `backend/shared/`

### **validate.ts**
Environment variable validation.

**Functions:**
- `validateConfig()` - Validate all required env vars
  - Returns missing and invalid variables

- `validateConfigOrExit()` - Validate and exit if invalid
  - Called on startup
  - Exits with error if validation fails

- `testSolanaConnection()` - Test Solana RPC connection
- `getConfigSummary()` - Get config summary for logging

**Required Variables:**
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- `JWT_SECRET` (min 32 chars)
- `SOLANA_RPC_URL` (valid URL)
- `SOLANA_NETWORK` (mainnet-beta/devnet/testnet/localnet)
- `SOLANA_TREASURY_PRIVATE_KEY`
- `SOLANA_COLLECTION_MINT`

**Optional Variables:**
- `PORT`, `HOST`, `NODE_ENV`
- `REDIS_URL`, `REDIS_HOST`, `REDIS_PORT`
- `LOG_LEVEL`

---

## 🗄️ Migrations (`migrations/`)

### **001_baseline_transfer.ts**
Creates all transfer-service tables.

**Tables Created:**

#### 1. **ticket_transactions**
Transaction history for tickets.
- Tracks all ticket events (transfers, purchases, sales)
- Includes metadata JSON field
- Foreign keys: tickets, users

#### 2. **ticket_transfers** (inherited from earlier migration)
Main transfer records.
- Transfer metadata (acceptance code, message, expiry)
- Status tracking (PENDING, COMPLETED, EXPIRED, CANCELLED)
- Blockchain integration fields

#### 3. **batch_transfers**
Bulk transfer operations.
- Batch metadata
- Success/failure counts
- Status tracking

#### 4. **batch_transfer_items**
Individual items in batch transfers.
- Links to batch and transfer records
- Per-item status and errors
- Foreign keys: batch_transfers, ticket_transfers

#### 5. **promotional_codes**
Discount codes for transfer fees.
- Percentage or flat discounts
- Usage tracking
- Expiry support

#### 6. **transfer_fees**
Fee payment records.
- Base, platform, and service fees
- Payment method tracking
- Foreign key: ticket_transfers

#### 7. **transfer_rules**
Business rules engine.
- Rule types (MAX_TRANSFERS, BLACKLIST, etc.)
- Configurable per ticket type or event
- Priority and blocking flags
- JSON configuration

#### 8. **user_blacklist**
Fraud prevention.
- Blacklisted users
- Reason and notes
- Optional expiry

#### 9. **webhook_subscriptions**
Webhook endpoint configuration.
- Per-tenant webhook URLs
- Event type filters
- HMAC secret

**Row Level Security:**
- RLS enabled on all tables
- Tenant isolation policy: `tenant_id = current_setting('app.current_tenant')`
- All tables have `tenant_id` column with foreign key to `tenants` table

**Foreign Keys:**
- Within service: 3 FK constraints
- Cross-service: 2 FK constraints (tickets, users)

**Indexes:**
- tenant_id on all tables
- Status, date, and relationship indexes
- Composite indexes for common queries

---

## ✅ Validators (`validators/`)

### **schemas.ts**
Zod validation schemas for all endpoints.

**Common Validators:**
- `uuidSchema` - UUID v4 validation
- `emailSchema` - Email format (max 255 chars)
- `acceptanceCodeSchema` - 6-12 chars, alphanumeric uppercase
- `messageSchema` - Optional message (max 500 chars)

**Request Schemas:**
- `giftTransferBodySchema` - Create gift transfer
  - ticketId (required)
  - toEmail (required)
  - message (optional)

- `acceptTransferBodySchema` - Accept transfer
  - acceptanceCode (required)
  - userId (required, will be removed in future)

- `acceptTransferParamsSchema` - Accept URL params
  - transferId (required)

**Query Schemas:**
- `paginationSchema` - Page and limit
- `transferListQuerySchema` - List transfers with filters
- `transferIdParamSchema` - Transfer ID param
- `ticketIdParamSchema` - Ticket ID param

**Helper Functions:**
- `validateBody<T>()` - Validate body
- `validateQuery<T>()` - Validate query
- `validateParams<T>()` - Validate params
- `safeValidate<T>()` - Safe validation (no throw)
- `formatZodError()` - Format errors

---

## 🔧 Utils (`utils/`)

### **logger.ts**
Pino logger configuration.

**Configuration:**
- Log level from `LOG_LEVEL` env var (default: info)
- Pretty print in development
- Service name: `transfer-service`

### **circuit-breaker.ts**
Circuit breaker pattern for fault tolerance.

**Classes:**

#### **CircuitBreaker**
Prevents cascading failures.

**States:**
- `CLOSED` - Normal operation
- `OPEN` - Blocking requests
- `HALF_OPEN` - Testing recovery

**Configuration:**
- `failureThreshold` - Failures before opening
- `successThreshold` - Successes to close from half-open
- `timeout` - Wait time before retry (ms)
- `monitoringPeriod` - Failure window (ms)

**Methods:**
- `execute<T>(fn)` - Execute function with circuit breaker
- `getState()` - Get current state
- `getStats()` - Get statistics
- `reset()` - Manually reset

#### **CircuitBreakerRegistry**
Manages multiple circuit breakers.

**Methods:**
- `getOrCreate(name, config)` - Get or create breaker
- `get(name)` - Get existing breaker
- `getAllStats()` - Get all breaker stats
- `reset(name?)` - Reset one or all breakers

### **blockchain-retry.ts**
Retry logic for blockchain operations.

**Functions:**
- `retryBlockchainOperation<T>(operation, name, config)` - Retry with backoff
  - Exponential backoff
  - Configurable max attempts
  - Retryable error detection

- `pollForConfirmation(checkFn, options)` - Poll for transaction confirmation
  - Configurable max attempts and interval
  - Timeout support

**Retry Configuration:**
- `maxAttempts` - Max retry attempts (default: 3)
- `initialDelayMs` - Initial delay (default: 1000ms)
- `maxDelayMs` - Max delay (default: 10000ms)
- `backoffMultiplier` - Backoff multiplier (default: 2)
- `retryableErrors` - List of retryable error patterns

**Retryable Errors:**
- timeout, network, ECONNRESET, ETIMEDOUT, ENOTFOUND
- 429 (rate limit), 503 (service unavailable), 504 (gateway timeout)

### **metrics.ts**
Prometheus metrics for monitoring.

**Metrics:**
- `transfersInitiatedTotal` - Counter: Total transfers initiated
- `transfersCompletedTotal` - Counter: Total transfers completed
- `transferLatency` - Histogram: Transfer operation latency

**Exports:**
- Counter, Histogram, Gauge from prom-client
- Prometheus registry

### **blockchain-metrics.ts**
Blockchain-specific Prometheus metrics.

**Class: BlockchainMetrics**

**Metrics:**
- `blockchain_transfers_success_total` - Successful transfers
- `blockchain_transfers_failure_total` - Failed transfers (by reason)
- `blockchain_transfer_duration_ms` - Transfer duration histogram
- `blockchain_confirmation_time_ms` - Confirmation time histogram
- `blockchain_confirmation_timeout_total` - Confirmation timeouts
- `blockchain_rpc_calls_total` - RPC calls (by method)
- `blockchain_rpc_errors_total` - RPC errors (by method and type)

**Methods:**
- `recordTransferSuccess(durationMs)` - Record success
- `recordTransferFailure(reason)` - Record failure
- `recordConfirmationTime(durationMs)` - Record confirmation time
- `recordConfirmationTimeout()` - Record timeout
- `recordRPCCall(method)` - Record RPC call
- `recordRPCError(method, errorType)` - Record RPC error

### **graceful-shutdown.ts**
Graceful shutdown handler.

**Function:**
- `createShutdownManager(server, resources)` - Create shutdown manager
  - Handles SIGTERM, SIGINT
  - 30-second shutdown timeout
  - Ordered cleanup:
    1. Stop accepting new connections
    2. Wait for ongoing requests (5s grace period)
    3. Close database connections
    4. Close Redis connections
    5. Additional cleanup
  - Exits cleanly or forces shutdown

**Features:**
- Prevents new requests during shutdown
- Handles uncaught exceptions and unhandled rejections
- Comprehensive logging
- Forced shutdown timeout

### **base-metrics.ts**
Prometheus metrics registry setup.

**Exports:**
- `register` - Prometheus registry
- `Counter` - Counter metric
- `Histogram` - Histogram metric
- `Gauge` - Gauge metric
- Collects default Node.js metrics

---

## 📊 Database Tables Owned

From `001_baseline_transfer.ts`:

| Table | Purpose | Key Fields |
|-------|---------|------------|
| **ticket_transactions** | Transaction history | ticket_id, user_id, transaction_type, amount, status |
| **ticket_transfers** | Transfer records | from_user_id, to_user_id, status, acceptance_code, blockchain_signature |
| **batch_transfers** | Bulk operations | user_id, total_items, success_count, failure_count |
| **batch_transfer_items** | Batch item details | batch_id, ticket_id, transfer_id, status |
| **promotional_codes** | Discount codes | code, discount_percentage, discount_flat, usage_count |
| **transfer_fees** | Fee tracking | transfer_id, base_fee, platform_fee, service_fee, total_fee |
| **transfer_rules** | Business rules | rule_name, rule_type, ticket_type_id, event_id, config |
| **user_blacklist** | Fraud prevention | user_id, reason, is_active, expires_at |
| **webhook_subscriptions** | Webhook config | tenant_id, url, events, secret |

**All tables include:**
- `tenant_id` for multi-tenancy
- Row Level Security (RLS) enabled
- Tenant isolation policies
- Appropriate indexes for performance

---

## 🔌 External Services Configured

### **Solana Blockchain** (`config/solana.config.ts`)
- **Purpose:** NFT transfer execution
- **SDK:** @solana/web3.js, @metaplex-foundation/js
- **Configuration:**
  - RPC URL (devnet/testnet/mainnet)
  - Treasury keypair for signing transactions
  - Collection mint address
  - Commitment level: confirmed
  - Timeout: 60 seconds

### **PostgreSQL Database**
- **Purpose:** Primary data storage
- **Features:**
  - Row Level Security for tenant isolation
  - Foreign key constraints
  - Transactional integrity
  - Connection pooling via pg.Pool

### **Redis**
- **Purpose:** Caching and rate limiting
- **Features:**
  - Cache service with TTL support
  - Rate limiting with sliding window
  - Real-time event pub/sub
  - Atomic operations

### **AWS Secrets Manager** (`config/secrets.ts`)
- **Purpose:** Secure credential storage
- **Secrets:**
  - Database credentials
  - Redis password
  - JWT secrets

---

## 🔐 Security Features

### **Authentication & Authorization**
- JWT-based authentication
- Role-based access control (admin, venue_manager)
- Tenant isolation via RLS

### **Rate Limiting**
- Redis-backed sliding window
- Per-user and per-IP limits
- Configurable presets

### **Input Validation**
- Zod schemas for all endpoints
- Type-safe validation
- Detailed error messages

### **Fraud Prevention**
- User blacklist
- Transfer rules engine
- Cooling periods
- Maximum transfer limits

### **Data Isolation**
- Multi-tenant architecture
- Row Level Security on all tables
- Tenant context middleware

---

## 🔄 Integration Points

### **Dependencies on Other Services:**
- **Ticket Service** - Ticket ownership and metadata
- **User Service** - User authentication and profiles
- **Event Service** - Event information for transfer rules

### **Provides to Other Services:**
- Transfer status and history
- Blockchain transaction signatures
- Transfer analytics and metrics

### **External Integrations:**
- **Solana Blockchain** - NFT transfers via Metaplex
- **Webhook Subscribers** - Event notifications
- **WebSocket Clients** - Real-time updates

---

## 📈 Monitoring & Observability

### **Health Checks**
- Liveness probe (`/health`)
- Readiness probe (`/health/ready`)
- Detailed health with dependencies (`/health/detailed`)
- Database pool metrics (`/health/db-pool`)
- Memory metrics (`/health/memory`)

### **Prometheus Metrics**
- Transfer operations (initiated, completed)
- Transfer latency
- Blockchain transfer success/failure
- Blockchain confirmation times
- RPC call tracking
- Circuit breaker states

### **Logging**
- Structured logging with Pino
- Request ID tracking
- Service name tagging
- Configurable log levels
- Pretty print in development

### **Error Tracking**
- Custom error types with status codes
- Error aggregation by type
- Failed operation recording
- Retry queue for failed blockchain transfers

---

## 🚀 Key Features

### **Core Functionality**
- ✅ Gift transfers with acceptance codes
- ✅ Sale and trade transfers
- ✅ Batch transfer operations
- ✅ Transfer expiry management
- ✅ Transfer history and analytics

### **Blockchain Integration**
- ✅ Solana NFT transfer execution
- ✅ Transaction confirmation polling
- ✅ Retry logic with exponential backoff
- ✅ Explorer URL generation
- ✅ Blockchain metrics

### **Business Logic**
- ✅ Transfer fee calculation with discounts
- ✅ Business rules engine (8+ rule types)
- ✅ User blacklist management
- ✅ Transfer velocity tracking
- ✅ Advanced search and filtering

### **Real-time Features**
- ✅ WebSocket event streaming
- ✅ Webhook notifications
- ✅ Live transfer status updates

### **Reliability**
- ✅ Circuit breakers for external services
- ✅ Rate limiting protection
- ✅ Graceful shutdown handling
- ✅ Redis-based caching
- ✅ Retry mechanisms

### **Multi-tenancy**
- ✅ Row Level Security on all tables
- ✅ Tenant context middleware
- ✅ Complete data isolation

---

## 📝 Notes

### **Design Patterns**
- **Repository Pattern** - Data access via services
- **Circuit Breaker** - Fault tolerance
- **Retry Pattern** - Resilient blockchain operations
- **Cache-Aside** - Performance optimization
- **Observer Pattern** - Real-time events via WebSocket
- **Strategy Pattern** - Pluggable transfer rules

### **Best Practices**
- Input validation with Zod
- Error handling with custom error types
- Structured logging
- Metrics collection
- Graceful degradation
- Transaction management with row locks

### **Future Enhancements**
- Remove userId from accept transfer request (use JWT)
- Add transfer cancellation endpoint
- Add transfer history endpoint
- Implement transfer scheduling
- Add transfer notifications via email/SMS
- Expand analytics capabilities

---

## 🏗️ Development Phases

Based on code comments, the service was built in phases:

1. **Phase 1:** Input Validation (Zod schemas, validation middleware)
2. **Phase 2:** Service Layer Separation (controllers, services, models)
3. **Phase 5:** Blockchain Integration (Solana, Metaplex)
4. **Phase 6:** Enhanced Features (batch transfers, pricing, rules, analytics)
5. **Phase 7:** Production Readiness (health checks, rate limiting, circuit breakers, graceful shutdown)
6. **Phase 8:** Advanced Features (caching, WebSocket, webhooks, search)

---

## 📚 API Summary

### **Transfer Operations**
- `POST /api/v1/transfers/gift` - Create gift transfer
- `POST /api/v1/transfers/:transferId/accept` - Accept transfer

### **Health & Monitoring**
- `GET /health` - Liveness probe
- `GET /health/ready` - Readiness probe
- `GET /health/detailed` - Detailed health
- `GET /health/db-pool` - Database pool stats
- `GET /health/memory` - Memory stats

### **Metrics** (via Prometheus registry)
- Transfer operations metrics
- Blockchain metrics
- RPC call metrics
- System metrics (CPU, memory, etc.)

---

**Last Updated:** 2025-12-21
**Service Version:** 1.0.0
**Maintainer:** TicketToken Platform Team
