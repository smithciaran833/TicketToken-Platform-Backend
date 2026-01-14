# Transfer Service - Test Plan

---

## Test Categories

| Category | Count | Priority |
|----------|-------|----------|
| Unit Tests | ~485 | High |
| Integration Tests | ~130 | High |
| E2E Tests | ~20 | Medium |

---

## Critical Issues to Address

Before testing, these critical issues from audit findings should be verified as resolved:

| Issue | Severity | Impact on Testing |
|-------|----------|-------------------|
| JWT algorithm whitelist (SEC-H1) - must enforce RS256/HS256, reject `none` | 🔴 Critical | Auth tests must verify algorithm restriction |
| Crypto-secure acceptance codes (SEC-1) - use crypto.randomBytes not Math.random | 🔴 Critical | Transfer service tests must verify randomness |
| Treasury key from secrets manager (SEC-2/CFG-1/BC-1) - no plaintext in env | 🔴 Critical | Config tests must verify secrets manager in prod |
| Blockchain transfer deduplication (IDP-4) - prevent double execution | 🔴 Critical | Blockchain transfer tests must verify idempotency |
| HMAC signature verification (S2S-2) - timing-safe comparison | 🔴 High | Internal auth tests must verify constant-time compare |
| Tenant context enforcement (MT-1/DB-1) - no default tenant fallback | 🔴 High | Multi-tenancy tests must verify rejection without tenant |
| Redis-backed idempotency (IDP-1/IDP-2) - request deduplication | 🔴 High | Idempotency tests require Redis mock |
| Rate limiting per-user/per-tenant (RL-H1/RL-H2) | 🟠 Medium | Rate limit tests need both key modes |
| Circuit breaker states (GD-H1/GD-H2) | 🟠 Medium | External service failure simulation |
| SQL injection in analytics (transfer-analytics.service.ts) | 🟠 Medium | Parameterized query verification |
| Sensitive data redaction in logs (LOG-1/LOG-2/LOG-3) | 🟠 Medium | Logger tests must verify no secrets in output |

---

## File-by-File Test Specifications

### 1. Entry Points

#### `src/index.ts` - Server Entry Point

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should load dotenv config` | Environment variables loaded |
| 🧪 Unit | `should call validateConfig on startup` | Config validation runs |
| 🧪 Unit | `should log configuration summary` | Startup logging |
| 🧪 Unit | `should create database pool with correct config` | Pool creation |
| 🧪 Unit | `should exit with code 1 on pool error` | Pool error handling |
| 🔗 Integration | `should handle SIGTERM with graceful shutdown` | Clean shutdown |
| 🔗 Integration | `should handle SIGINT with graceful shutdown` | Clean shutdown |
| 🔗 Integration | `should close database pool on shutdown` | DB cleanup |
| 🧪 Unit | `should log unhandledRejection errors` | Promise rejection handling |
| 🧪 Unit | `should exit on uncaughtException` | Exception handling |
| 🔗 Integration | `should start server on configured PORT and HOST` | Server binding |
| 🔗 Integration | `should log successful startup with health endpoint` | Startup success |

#### `src/app.ts` - Fastify App Factory

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `should create Fastify instance` | App instantiation |
| 🧪 Unit | `should set trustProxy to true` | Proxy trust setting |
| 🧪 Unit | `should generate UUID for request IDs` | Request tracing |
| 🔗 Integration | `should decorate app with database pool` | DB decoration |
| 🔗 Integration | `should register helmet plugin` | Security headers |
| 🔗 Integration | `should register rate limit plugin` | Rate limiting |
| 🧪 Unit | `should set error handler BEFORE routes` | Error handler order |
| 🧪 Unit | `should map validation errors to 400` | Validation error mapping |
| 🧪 Unit | `should map FST_ERR_NOT_FOUND to 404` | Not found mapping |
| 🧪 Unit | `should map FST_ERR_RATE_LIMIT to 429` | Rate limit mapping |
| 🧪 Unit | `should include requestId in error responses` | Error context |
| 🧪 Unit | `should hide stack trace in production` | Prod error safety |
| 🧪 Unit | `should include stack trace in development` | Dev debugging |
| 🧪 Unit | `should log 5xx errors as error level` | Error logging |
| 🧪 Unit | `should log 4xx errors as warn level` | Warning logging |
| 🔗 Integration | `should set tenant context on each request` | Multi-tenancy |
| 🔗 Integration | `should apply rate limit middleware` | Rate limiting |
| 🔗 Integration | `should apply idempotency middleware` | Idempotency |
| 🧪 Unit | `should add X-Request-ID header to responses` | Response headers |
| 🔗 Integration | `should register transfer routes` | Route mounting |
| 🔗 Integration | `should register health routes` | Health endpoints |
| 🔗 Integration | `should register metrics route` | Metrics endpoint |

---

### 2. Configuration Files

#### `src/config/database.ts` - PostgreSQL Pool Configuration

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `getSSLConfig should return false in dev without DB_SSL` | Dev SSL config |
| 🧪 Unit | `getSSLConfig should return SSL object in production` | Prod SSL config |
| 🧪 Unit | `getSSLConfig should include CA when DB_SSL_CA set` | Custom CA |
| 🧪 Unit | `getSSLConfig should respect DB_SSL_REJECT_UNAUTHORIZED` | Cert validation |
| 🔗 Integration | `createPool should create pool with correct config` | Pool creation |
| 🔗 Integration | `createPool should register error event handler` | Error handling |
| 🔗 Integration | `createPool should register connect event handler` | Connection events |
| 🔗 Integration | `createPool should initialize circuit breaker` | Circuit breaker init |
| 🧪 Unit | `getPool should return existing pool` | Pool singleton |
| 🧪 Unit | `getPool should create pool if not exists` | Lazy creation |
| 🔗 Integration | `query should execute query and return result` | Query execution |
| 🧪 Unit | `query should throw DatabaseConnectionError when circuit open` | Circuit breaker |
| 🧪 Unit | `query should record success on circuit breaker` | Success tracking |
| 🧪 Unit | `query should record failure on circuit breaker` | Failure tracking |
| 🧪 Unit | `query should log slow queries over 1000ms` | Slow query logging |
| 🧪 Unit | `query should apply custom timeout when provided` | Custom timeout |
| 🧪 Unit | `query should wrap errors in DatabaseError` | Error wrapping |
| 🔗 Integration | `getClient should return pooled client` | Client acquisition |
| 🧪 Unit | `getClient should throw when circuit open` | Circuit breaker |
| 🔗 Integration | `withTransaction should begin transaction` | Transaction start |
| 🔗 Integration | `withTransaction should commit on success` | Transaction commit |
| 🔗 Integration | `withTransaction should rollback on error` | Transaction rollback |
| 🔗 Integration | `withTransaction should always release client` | Client release |
| 🔗 Integration | `checkHealth should return healthy when DB responds` | Health check pass |
| 🔗 Integration | `checkHealth should return unhealthy on error` | Health check fail |
| 🧪 Unit | `getPoolStats should return pool statistics` | Stats retrieval |
| 🔗 Integration | `closePool should end pool gracefully` | Pool cleanup |

#### `src/config/redis.ts` - Redis Connection Manager

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `createRedisOptions should use REDIS_URL when provided` | URL config |
| 🧪 Unit | `createRedisOptions should use host/port/password fallback` | Param config |
| 🧪 Unit | `createRedisOptions should include TLS when enabled` | TLS config |
| 🧪 Unit | `createRedisOptions should set correct timeouts` | Timeout config |
| 🔗 Integration | `initRedis should create client with options` | Client creation |
| 🔗 Integration | `initRedis should register event handlers` | Event setup |
| 🔗 Integration | `initRedis should connect successfully` | Connection |
| 🧪 Unit | `initRedis should return existing client on second call` | Singleton |
| 🧪 Unit | `getRedis should return client or null` | Client getter |
| 🔗 Integration | `getSubscriberClient should create separate pub/sub client` | Subscriber |
| 🧪 Unit | `getSubscriberClient should not use keyPrefix` | Subscriber config |
| 🔗 Integration | `closeRedis should quit main client` | Main cleanup |
| 🔗 Integration | `closeRedis should quit subscriber client` | Subscriber cleanup |
| 🔗 Integration | `checkRedisHealth should return healthy on PING success` | Health pass |
| 🔗 Integration | `checkRedisHealth should return unhealthy with error` | Health fail |
| 🧪 Unit | `checkRedisHealth should measure latency` | Latency tracking |
| 🔗 Integration | `getRedisInfo should parse INFO command output` | Info parsing |
| 🧪 Unit | `retryStrategy should return increasing delays` | Backoff |
| 🧪 Unit | `retryStrategy should cap at 3000ms` | Max delay |
| 🧪 Unit | `retryStrategy should return null after 10 retries` | Retry limit |

#### `src/config/secrets.ts` - Secrets Management

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `fetchFromSecretsManager should fetch from AWS` | AWS fetch |
| 🧪 Unit | `fetchFromSecretsManager should parse JSON secret` | JSON parsing |
| 🧪 Unit | `fetchFromSecretsManager should return null on error` | Error handling |
| 🔗 Integration | `fetchFromVault should fetch from HashiCorp Vault` | Vault fetch |
| 🧪 Unit | `fetchFromVault should return null if not configured` | Missing config |
| 🧪 Unit | `loadSecrets should use env in dev without secrets manager` | Dev mode |
| 🧪 Unit | `loadSecrets should require secrets manager in prod` | Prod enforcement |
| 🧪 Unit | `loadSecrets should try AWS first, fallback to Vault` | Fallback chain |
| 🧪 Unit | `loadSecrets should throw in prod if no secrets loaded` | Prod failure |
| 🧪 Unit | `getSecret should return secret value` | Secret retrieval |
| 🧪 Unit | `getSecret should throw if required and missing` | Required check |
| 🧪 Unit | `validateTreasuryKeyConfig should throw if plaintext in prod` | Prod security |
| 🧪 Unit | `validateTreasuryKeyConfig should validate key length 64-100` | Length validation |
| 🧪 Unit | `validateJwtSecret should throw if missing` | Required check |
| 🧪 Unit | `validateJwtSecret should throw if less than 32 chars` | Length check |
| 🧪 Unit | `validateJwtSecret should throw in prod if weak secret` | Weak secret detection |
| 🧪 Unit | `validateJwtSecret should warn in dev if weak secret` | Dev warning |
| 🧪 Unit | `validateInternalServiceSecret should throw in prod if missing` | Prod requirement |
| 🧪 Unit | `validateInternalServiceSecret should warn in dev if missing` | Dev warning |
| 🧪 Unit | `getJwtSecret should return secret` | JWT retrieval |
| 🧪 Unit | `getJwtSecret should throw if not configured` | Missing check |
| 🧪 Unit | `getTreasuryPrivateKey should return key` | Key retrieval |
| 🧪 Unit | `hasSecret should return true if exists` | Existence check |
| 🧪 Unit | `getMissingSecrets should return list of missing required` | Missing list |
| 🔗 Integration | `validateRequiredSecrets should throw in prod if any missing` | Prod validation |

#### `src/config/solana.config.ts` - Solana Configuration

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should throw if SOLANA_RPC_URL missing` | Required check |
| 🧪 Unit | `should throw if SOLANA_TREASURY_PRIVATE_KEY missing` | Required check |
| 🧪 Unit | `should throw if SOLANA_COLLECTION_MINT missing` | Required check |
| 🧪 Unit | `should create connection with confirmed commitment` | Commitment config |
| 🧪 Unit | `should create connection with 60s timeout` | Timeout config |
| 🧪 Unit | `should decode treasury keypair from base58` | Key decoding |
| 🧪 Unit | `should throw on invalid treasury key format` | Invalid key |
| 🧪 Unit | `should create PublicKey for collection mint` | Mint parsing |
| 🧪 Unit | `should initialize Metaplex with connection` | Metaplex init |
| 🧪 Unit | `should use treasury keypair identity` | Identity config |
| 🧪 Unit | `getClusterName should return devnet for devnet URL` | Cluster detection |
| 🧪 Unit | `getClusterName should return testnet for testnet URL` | Cluster detection |
| 🧪 Unit | `getClusterName should return mainnet-beta for mainnet URL` | Cluster detection |
| 🧪 Unit | `getClusterName should return localnet for unknown` | Default cluster |
| 🧪 Unit | `getExplorerUrl should return correct explorer URL` | Explorer URL |
| 🧪 Unit | `getExplorerUrl should include cluster param for non-mainnet` | Cluster param |

#### `src/config/validate.ts` - Configuration Validation

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `envSchema should validate PORT range 1-65535` | Port validation |
| 🧪 Unit | `envSchema should default PORT to 3019` | Default port |
| 🧪 Unit | `envSchema should validate NODE_ENV enum` | Env validation |
| 🧪 Unit | `envSchema should require DB_HOST` | Required field |
| 🧪 Unit | `envSchema should require DB_NAME` | Required field |
| 🧪 Unit | `envSchema should require DB_USER` | Required field |
| 🧪 Unit | `envSchema should require DB_PASSWORD` | Required field |
| 🧪 Unit | `envSchema should validate SOLANA_RPC_URL as URL` | URL validation |
| 🧪 Unit | `envSchema should validate SOLANA_NETWORK enum` | Enum validation |
| 🧪 Unit | `envSchema should validate TRANSFER_EXPIRY_HOURS 1-168` | Range validation |
| 🧪 Unit | `envSchema should validate TRANSFER_MAX_BATCH_SIZE 1-100` | Range validation |
| 🧪 Unit | `validateConfig should return validated config` | Validation pass |
| 🧪 Unit | `validateConfig should cache result on second call` | Caching |
| 🧪 Unit | `validateConfig should exit process on failure` | Failure handling |
| 🧪 Unit | `validateProductionRequirements should fail if SECRETS_PROVIDER=env in prod` | Prod check |
| 🧪 Unit | `validateProductionRequirements should fail if DB_SSL=false in prod` | Prod check |
| 🧪 Unit | `validateProductionRequirements should fail if CORS_ORIGIN=* in prod` | Prod check |
| 🧪 Unit | `getConfig should call validateConfig if not cached` | Lazy validation |
| 🧪 Unit | `isProduction should return true when NODE_ENV=production` | Env check |
| 🧪 Unit | `isDevelopment should return true when NODE_ENV=development` | Env check |
| 🧪 Unit | `isTest should return true when NODE_ENV=test` | Env check |

---

### 3. Services

#### `src/services/transfer.service.ts` - Core Transfer Logic

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `generateAcceptanceCode should return correct length from env` | Code length |
| 🧪 Unit | `generateAcceptanceCode should use only allowed charset` | Charset validation |
| 🧪 Unit | `generateAcceptanceCode should use crypto.randomBytes` | Crypto secure |
| 🧪 Unit | `generateAcceptanceCode should not have duplicates in batch` | Uniqueness |
| 🧪 Unit | `createGiftTransfer should throw TicketNotFoundError when ticket missing` | Missing ticket |
| 🧪 Unit | `createGiftTransfer should throw TicketNotFoundError when not owned` | Ownership check |
| 🧪 Unit | `createGiftTransfer should throw TicketNotTransferableError when not transferable` | Transferability |
| 🧪 Unit | `createGiftTransfer should calculate correct expiry from env` | Expiry calculation |
| 🧪 Unit | `createGiftTransfer should return correct response shape` | Response format |
| 🔗 Integration | `createGiftTransfer should insert transfer record` | DB insert |
| 🔗 Integration | `createGiftTransfer should get or create recipient user` | User creation |
| 🔗 Integration | `createGiftTransfer should rollback on error` | Transaction rollback |
| 🧪 Unit | `acceptTransfer should throw TransferNotFoundError for invalid transfer` | Invalid transfer |
| 🧪 Unit | `acceptTransfer should throw TransferNotFoundError for invalid code` | Invalid code |
| 🧪 Unit | `acceptTransfer should throw TransferExpiredError when expired` | Expiry check |
| 🔗 Integration | `acceptTransfer should update ticket ownership` | Ownership transfer |
| 🔗 Integration | `acceptTransfer should mark transfer as completed` | Status update |
| 🔗 Integration | `acceptTransfer should create transaction record` | Transaction record |
| 🔗 Integration | `acceptTransfer should rollback on error` | Transaction rollback |
| 🔗 Integration | `getTicketForUpdate should lock row with FOR UPDATE` | Row locking |
| 🔗 Integration | `getOrCreateUser should return existing user` | Existing user |
| 🔗 Integration | `getOrCreateUser should create pending user for new email` | New user |
| 🎭 E2E | `full gift transfer flow - create to accept` | Complete flow |
| 🎭 E2E | `concurrent transfers same ticket - only one succeeds` | Race condition |

#### `src/services/blockchain-transfer.service.ts` - Blockchain Integration

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `checkExistingBlockchainTransfer should return alreadyExecuted when signature exists` | Duplicate check |
| 🧪 Unit | `checkExistingBlockchainTransfer should return inProgress when status IN_PROGRESS` | In-progress check |
| 🧪 Unit | `checkExistingBlockchainTransfer should handle stale in-progress over 5min` | Stale detection |
| 🧪 Unit | `checkExistingBlockchainTransfer should throw when transfer not found` | Missing transfer |
| 🧪 Unit | `markBlockchainTransferInProgress should set correct status` | Status update |
| 🧪 Unit | `recordFailedTransfer should insert new failed record` | Failure recording |
| 🧪 Unit | `recordFailedTransfer should increment retry_count on conflict` | Retry tracking |
| 🔗 Integration | `executeBlockchainTransfer should return existing signature for duplicate` | Idempotency |
| 🔗 Integration | `executeBlockchainTransfer should verify NFT ownership before transfer` | Ownership verify |
| 🔗 Integration | `executeBlockchainTransfer should fail if ownership verification fails` | Verify failure |
| 🔗 Integration | `executeBlockchainTransfer should execute NFT transfer with retry` | Transfer execution |
| 🔗 Integration | `executeBlockchainTransfer should poll for confirmation` | Confirmation polling |
| 🔗 Integration | `executeBlockchainTransfer should update DB with signature` | DB update |
| 🔗 Integration | `executeBlockchainTransfer should record metrics on success` | Success metrics |
| 🔗 Integration | `executeBlockchainTransfer should record metrics on failure` | Failure metrics |
| 🔗 Integration | `executeBlockchainTransfer should record failed transfer for retry queue` | Failure queue |
| 🧪 Unit | `getBlockchainTransferDetails should return transfer details` | Details retrieval |
| 🔗 Integration | `verifyBlockchainTransfer should check NFT owner matches expected` | Owner verification |
| 🎭 E2E | `full blockchain transfer flow` | Complete blockchain flow |

#### `src/services/batch-transfer.service.ts` - Bulk Operations

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `generateBatchId should return correct format` | ID format |
| 🔗 Integration | `executeBatchTransfer should create batch record` | Batch creation |
| 🔗 Integration | `executeBatchTransfer should process each transfer` | Item processing |
| 🔗 Integration | `executeBatchTransfer should handle mixed success/failure` | Partial success |
| 🔗 Integration | `executeBatchTransfer should return correct counts` | Count accuracy |
| 🔗 Integration | `executeBatchTransfer should update batch item status` | Item status |
| 🔗 Integration | `executeBatchTransfer should complete batch record` | Batch completion |
| 🔗 Integration | `getBatchStatus should return batch with items` | Status retrieval |
| 🔗 Integration | `getBatchStatus should return null for missing batch` | Missing batch |
| 🔗 Integration | `cancelBatch should only cancel PROCESSING batches` | Cancel logic |

#### `src/services/nft.service.ts` - Solana NFT Operations

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `transferNFT should return success with signature` | Success response |
| 🧪 Unit | `transferNFT should return error on failure` | Failure response |
| 🧪 Unit | `verifyOwnership should return true when wallet has token account` | Ownership true |
| 🧪 Unit | `verifyOwnership should return false when no token account` | Ownership false |
| 🧪 Unit | `verifyOwnership should return false on error` | Error handling |
| 🧪 Unit | `getNFTOwner should return address on success` | Owner retrieval |
| 🧪 Unit | `getNFTOwner should return null on failure` | Owner failure |
| 🧪 Unit | `getNFTMetadata should return metadata` | Metadata retrieval |
| 🧪 Unit | `getNFTMetadata should return null on failure` | Metadata failure |
| 🧪 Unit | `nftExists should return true when NFT found` | Existence true |
| 🧪 Unit | `nftExists should return false when not found` | Existence false |
| 🔗 Integration | `transferNFT should execute on devnet` | Devnet transfer |

#### `src/services/pricing.service.ts` - Fee Calculations

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `getTransferTypeMultiplier should return 0.5 for GIFT` | Gift multiplier |
| 🧪 Unit | `getTransferTypeMultiplier should return 1.0 for SALE` | Sale multiplier |
| 🧪 Unit | `getTransferTypeMultiplier should return 0.75 for TRADE` | Trade multiplier |
| 🧪 Unit | `getTransferTypeMultiplier should return 1.0 for unknown` | Default multiplier |
| 🔗 Integration | `calculateTransferFee should return zeros for free transfer` | Free transfer |
| 🔗 Integration | `calculateTransferFee should apply GIFT discount` | Gift discount |
| 🔗 Integration | `calculateTransferFee should calculate platform fee for SALE` | Platform fee |
| 🔗 Integration | `calculateTransferFee should return correct breakdown` | Fee breakdown |
| 🔗 Integration | `applyPromotionalDiscount should return original if no promo` | No promo |
| 🔗 Integration | `applyPromotionalDiscount should apply percentage discount` | Percentage discount |
| 🔗 Integration | `applyPromotionalDiscount should apply flat discount` | Flat discount |
| 🔗 Integration | `applyPromotionalDiscount should ignore invalid promo` | Invalid promo |
| 🔗 Integration | `applyPromotionalDiscount should ignore expired promo` | Expired promo |
| 🔗 Integration | `recordFeePayment should insert fee record` | Fee recording |

#### `src/services/transfer-rules.service.ts` - Business Rules Engine

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `checkMaxTransfersPerTicket should allow when under limit` | Under limit |
| 🧪 Unit | `checkMaxTransfersPerTicket should block when at limit` | At limit |
| 🧪 Unit | `checkMaxTransfersPerUserPerDay should allow when under limit` | Under limit |
| 🧪 Unit | `checkMaxTransfersPerUserPerDay should block when at limit` | At limit |
| 🧪 Unit | `checkBlacklist should allow when no blacklist match` | No match |
| 🧪 Unit | `checkBlacklist should block sender if blacklisted` | Sender blocked |
| 🧪 Unit | `checkBlacklist should block recipient if blacklisted` | Recipient blocked |
| 🧪 Unit | `checkCoolingPeriod should allow after cooling period` | After cooling |
| 🧪 Unit | `checkCoolingPeriod should block during cooling period` | During cooling |
| 🧪 Unit | `checkCoolingPeriod should allow if no prior transfers` | First transfer |
| 🧪 Unit | `checkEventDateProximity should allow when event is far` | Far event |
| 🧪 Unit | `checkEventDateProximity should block when too close` | Near event |
| 🧪 Unit | `checkIdentityVerification should allow when not required` | Not required |
| 🧪 Unit | `checkIdentityVerification should allow when all verified` | All verified |
| 🧪 Unit | `checkIdentityVerification should block when unverified` | Unverified |
| 🔗 Integration | `validateTransfer should evaluate rules in priority order` | Rule ordering |
| 🔗 Integration | `validateTransfer should stop on blocking rule` | Blocking rules |
| 🔗 Integration | `validateTransfer should continue on non-blocking rule` | Non-blocking |

#### `src/services/transfer-analytics.service.ts` - Analytics

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `getTransferMetrics should return correct aggregations` | Metric aggregation |
| 🔗 Integration | `getTransferMetrics should return top tickets` | Top tickets |
| 🔗 Integration | `getUserTransferStats should return sent/received counts` | User stats |
| 🔗 Integration | `getUserTransferStats should calculate success rate` | Success rate |
| 🔗 Integration | `getTransferTrends should group by hour` | Hourly grouping |
| 🔗 Integration | `getTransferTrends should group by day` | Daily grouping |
| 🔗 Integration | `getTransferTrends should group by week` | Weekly grouping |
| 🔗 Integration | `getTransferTrends should group by month` | Monthly grouping |
| 🔗 Integration | `getTransferFeeAnalytics should return fee totals` | Fee totals |
| 🔗 Integration | `getBlockchainTransferAnalytics should return blockchain metrics` | Blockchain metrics |
| 🔗 Integration | `getTransferVelocity should calculate transfers per hour` | Velocity calc |
| 🧪 Unit | `getTransferVelocity should use parameterized query` | SQL injection prevention |

#### `src/services/webhook.service.ts` - Webhook Delivery

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `generateSignature should return correct HMAC-SHA256` | Signature generation |
| 🧪 Unit | `verifySignature should return true for valid signature` | Valid signature |
| 🧪 Unit | `verifySignature should return false for invalid signature` | Invalid signature |
| 🧪 Unit | `verifySignature should use timing-safe comparison` | Timing safe |
| 🔗 Integration | `sendWebhook should fetch active subscriptions` | Subscription fetch |
| 🔗 Integration | `sendWebhook should deliver to all subscriptions` | Multi-delivery |
| 🔗 Integration | `deliverWebhook should retry 3 times with backoff` | Retry logic |
| 🔗 Integration | `deliverWebhook should log successful delivery` | Success logging |
| 🔗 Integration | `deliverWebhook should log failed delivery` | Failure logging |
| 🔗 Integration | `testWebhook should send test payload` | Test delivery |
| 🔗 Integration | `testWebhook should return status` | Test result |
| 🔗 Integration | `logWebhookDelivery should insert delivery record` | Delivery logging |
| 🎭 E2E | `full webhook flow - transfer event to delivery` | Complete flow |

#### `src/services/event-stream.service.ts` - WebSocket Streaming

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `createStreamEvent should return correct structure` | Event structure |
| 🧪 Unit | `createStreamEvent should include timestamp` | Timestamp |
| 🔗 Integration | `socket authentication should join user room on valid token` | Auth success |
| 🔗 Integration | `socket authentication should disconnect on invalid token` | Auth failure |
| 🔗 Integration | `subscribe:transfer should join transfer room` | Room join |
| 🔗 Integration | `unsubscribe:transfer should leave transfer room` | Room leave |
| 🔗 Integration | `Redis pub/sub should broadcast events across instances` | Distributed events |
| 🔗 Integration | `sendToUser should deliver to user room only` | User targeting |
| 🔗 Integration | `sendToTransfer should deliver to transfer room only` | Transfer targeting |
| 🔗 Integration | `broadcast should deliver to all connected` | Broadcast |
| 🧪 Unit | `getConnectedCount should return authenticated socket count` | Connection count |
| 🔗 Integration | `close should quit Redis and close socket.io` | Cleanup |

#### `src/services/cache.service.ts` - Redis/Memory Cache

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `get should return value when exists in Redis` | Redis get |
| 🧪 Unit | `get should return value from memory when Redis fails` | Memory fallback |
| 🧪 Unit | `get should return null when missing` | Missing key |
| 🧪 Unit | `get should return null when expired in memory` | Expired key |
| 🧪 Unit | `set should store value with TTL in Redis` | Redis set |
| 🧪 Unit | `set should store in memory when Redis fails` | Memory fallback |
| 🧪 Unit | `delete should remove from both Redis and memory` | Delete both |
| 🧪 Unit | `exists should return true when key exists` | Exists true |
| 🧪 Unit | `exists should return false when missing or expired` | Exists false |
| 🧪 Unit | `setNX should return true on new key` | SetNX new |
| 🧪 Unit | `setNX should return false on existing key` | SetNX existing |
| 🧪 Unit | `incr should increment existing value` | Increment |
| 🧪 Unit | `incr should start at 1 for new key` | Increment new |
| 🧪 Unit | `expire should update TTL` | TTL update |
| 🔗 Integration | `Redis connection should connect and disconnect` | Connection lifecycle |
| 🔗 Integration | `setNX should work across multiple instances` | Distributed lock |

#### `src/services/search.service.ts` - Search & Filtering

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `buildSearchQuery should create correct WHERE for status filter` | Status filter |
| 🧪 Unit | `buildSearchQuery should create correct WHERE for user filters` | User filters |
| 🧪 Unit | `buildSearchQuery should create correct WHERE for date range` | Date range |
| 🧪 Unit | `buildSearchQuery should create correct WHERE for amount range` | Amount range |
| 🧪 Unit | `buildSearchQuery should handle blockchain signature filter` | Signature filter |
| 🧪 Unit | `buildSearchQuery should handle full-text search` | Full-text search |
| 🧪 Unit | `buildSearchQuery should enforce sort column whitelist` | Sort whitelist |
| 🧪 Unit | `buildSearchQuery should use parameterized queries` | SQL injection prevention |
| 🔗 Integration | `searchTransfers should return paginated results` | Pagination |
| 🔗 Integration | `searchTransfers should filter by all criteria` | Full filtering |
| 🔗 Integration | `getTransferSuggestions should return autocomplete results` | Autocomplete |
| 🔗 Integration | `getFacets should return status counts` | Status facets |
| 🔗 Integration | `getFacets should return transfer type counts` | Type facets |

---

### 4. Controllers

#### `src/controllers/transfer.controller.ts` - HTTP Handlers

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `createGiftTransfer should extract fromUserId from request.user.id` | User extraction |
| 🧪 Unit | `createGiftTransfer should pass correct params to service` | Param passing |
| 🧪 Unit | `createGiftTransfer should return 201 with result` | Success response |
| 🧪 Unit | `createGiftTransfer should call handleError on exception` | Error handling |
| 🧪 Unit | `acceptTransfer should extract transferId from params` | Param extraction |
| 🧪 Unit | `acceptTransfer should extract acceptanceCode from body` | Body extraction |
| 🧪 Unit | `acceptTransfer should return 200 with result` | Success response |
| 🧪 Unit | `handleError should return correct status for TransferError` | Error mapping |
| 🧪 Unit | `handleError should return 500 for unknown errors` | Unknown errors |
| 🧪 Unit | `handleError should log unknown errors` | Error logging |
| 🔗 Integration | `POST /api/v1/transfers/gift full flow` | Gift creation |
| 🔗 Integration | `POST /api/v1/transfers/:transferId/accept full flow` | Acceptance |
| 🎭 E2E | `gift transfer flow - auth to accept to verify` | Complete flow |

---

### 5. Middleware

#### `src/middleware/auth.middleware.ts` - JWT Authentication

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `extractBearerToken should return token from valid Bearer header` | Valid header |
| 🧪 Unit | `extractBearerToken should return null for missing header` | Missing header |
| 🧪 Unit | `extractBearerToken should return null for malformed header` | Malformed header |
| 🧪 Unit | `verifyToken should reject tokens with algorithm none` | None algorithm |
| 🧪 Unit | `verifyToken should reject tokens with disallowed algorithms` | Algorithm whitelist |
| 🧪 Unit | `verifyToken should reject expired tokens` | Expired token |
| 🧪 Unit | `verifyToken should reject tokens not yet valid` | NotBefore check |
| 🧪 Unit | `verifyToken should reject invalid signatures` | Invalid signature |
| 🧪 Unit | `verifyToken should reject missing sub claim` | Missing sub |
| 🧪 Unit | `verifyToken should reject missing tenant_id claim` | Missing tenant |
| 🧪 Unit | `verifyToken should return correct AuthenticatedUser shape` | User shape |
| 🧪 Unit | `getSecretOrKey should return JWKS function for RS256` | RS256 key |
| 🧪 Unit | `getSecretOrKey should return secret string for HS256` | HS256 secret |
| 🧪 Unit | `getSecretOrKey should throw if JWT_SECRET not configured` | Missing secret |
| 🧪 Unit | `authenticate should return 401 if no token` | No token |
| 🧪 Unit | `authenticate should attach user to request on success` | User attachment |
| 🧪 Unit | `optionalAuth should not fail if no token` | Optional pass |
| 🧪 Unit | `optionalAuth should attach user if valid token` | Optional attach |
| 🧪 Unit | `requireRole should return 401 if no user` | No user |
| 🧪 Unit | `requireRole should return 403 if role mismatch` | Role mismatch |
| 🧪 Unit | `requireRole should pass if role matches` | Role match |
| 🧪 Unit | `requirePermission should return 401 if no user` | No user |
| 🧪 Unit | `requirePermission should return 403 if permission missing` | Missing permission |
| 🧪 Unit | `requirePermission should pass if any permission matches` | Permission match |
| 🧪 Unit | `requireOwnerOrAdmin should return 401 if no user` | No user |
| 🧪 Unit | `requireOwnerOrAdmin should return 403 if not owner and not admin` | Not owner/admin |
| 🧪 Unit | `requireOwnerOrAdmin should pass if owner` | Owner pass |
| 🧪 Unit | `requireOwnerOrAdmin should pass if admin` | Admin pass |
| 🔗 Integration | `RS256 token verification with JWKS` | JWKS integration |
| 🔗 Integration | `HS256 token verification` | HS256 integration |
| 🔒 Security | `algorithm confusion attack should fail` | Security test |
| 🔒 Security | `none algorithm should be rejected` | Security test |

#### `src/middleware/idempotency.ts` - Request Deduplication

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `getCacheKey should build correct key with prefix` | Key format |
| 🧪 Unit | `idempotencyMiddleware should skip GET requests` | GET skip |
| 🧪 Unit | `idempotencyMiddleware should skip DELETE requests` | DELETE skip |
| 🧪 Unit | `idempotencyMiddleware should skip when no header` | No header |
| 🧪 Unit | `idempotencyMiddleware should return 400 for key < 16 chars` | Short key |
| 🧪 Unit | `idempotencyMiddleware should return 400 for key > 128 chars` | Long key |
| 🧪 Unit | `idempotencyMiddleware should return 409 when processing` | In-progress |
| 🧪 Unit | `idempotencyMiddleware should return cached response when completed` | Cached response |
| 🧪 Unit | `idempotencyMiddleware should set X-Idempotent-Replayed header` | Replay header |
| 🧪 Unit | `idempotencyMiddleware should allow retry when failed` | Failed retry |
| 🧪 Unit | `captureIdempotencyResponse should store response` | Response capture |
| 🧪 Unit | `captureIdempotencyResponse should update metrics` | Metrics update |
| 🧪 Unit | `markIdempotencyFailed should set status to failed` | Failed status |
| 🧪 Unit | `clearIdempotencyEntry should delete entry` | Entry deletion |
| 🧪 Unit | `generateTransferIdempotencyKey should return correct format` | Key format |
| 🔗 Integration | `Redis cache operations` | Redis integration |
| 🔗 Integration | `memory fallback when Redis down` | Fallback |
| 🔗 Integration | `TTL expiration after 24 hours` | Expiration |

#### `src/middleware/internal-auth.ts` - Service-to-Service Auth

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `validateInternalRequest should return 401 if missing x-internal-service` | Missing service |
| 🧪 Unit | `validateInternalRequest should return 401 if missing x-internal-signature` | Missing signature |
| 🧪 Unit | `validateInternalRequest should return 403 if service not in ALLOWED_SERVICES` | Unknown service |
| 🧪 Unit | `validateInternalRequest should return 500 if secret not configured` | Missing secret |
| 🧪 Unit | `validateInternalRequest should return 401 if missing timestamp` | Missing timestamp |
| 🧪 Unit | `validateInternalRequest should return 401 if timestamp expired` | Expired timestamp |
| 🧪 Unit | `validateInternalRequest should return 401 for invalid signature format` | Invalid format |
| 🧪 Unit | `validateInternalRequest should return 401 for signature length mismatch` | Length mismatch |
| 🧪 Unit | `validateInternalRequest should return 401 for incorrect signature` | Wrong signature |
| 🧪 Unit | `validateInternalRequest should set request.internalService on success` | Success decoration |
| 🧪 Unit | `generateInternalSignature should return correct HMAC-SHA256` | Signature gen |
| 🧪 Unit | `generateInternalSignature should return current timestamp` | Timestamp gen |
| 🧪 Unit | `generateInternalSignature should throw if secret not configured` | Missing secret |
| 🧪 Unit | `buildInternalHeaders should include all required headers` | Header building |
| 🧪 Unit | `buildInternalHeaders should propagate request ID` | Request ID |
| 🧪 Unit | `validateInternalAuthConfig should throw in prod if secret missing` | Prod validation |
| 🧪 Unit | `validateInternalAuthConfig should warn if secret < 32 chars` | Weak secret |
| 🔒 Security | `timing attack resistance - constant time comparison` | Security test |
| 🔒 Security | `replay attack prevention - expired timestamps rejected` | Security test |

#### `src/middleware/rate-limit.ts` - Enhanced Rate Limiting

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `getRouteKey should normalize UUID paths to :id` | Path normalization |
| 🧪 Unit | `getRouteKey should strip query strings` | Query strip |
| 🧪 Unit | `getRateLimitConfig should return endpoint-specific config` | Endpoint config |
| 🧪 Unit | `getRateLimitConfig should return default for unknown routes` | Default config |
| 🧪 Unit | `checkRateLimit should work with Redis` | Redis check |
| 🧪 Unit | `checkRateLimit should work with memory fallback` | Memory check |
| 🧪 Unit | `checkRateLimit should set expiry on first request` | First request |
| 🧪 Unit | `rateLimitMiddleware should skip health routes` | Health skip |
| 🧪 Unit | `rateLimitMiddleware should check user limit` | User limit |
| 🧪 Unit | `rateLimitMiddleware should check tenant limit` | Tenant limit |
| 🧪 Unit | `rateLimitMiddleware should return 429 with Retry-After` | Rate limited |
| 🧪 Unit | `transferRateLimitMiddleware should enforce 50/hour limit` | Transfer limit |
| 🧪 Unit | `blockchainRateLimitMiddleware should enforce 3/min limit` | Blockchain limit |
| 🔗 Integration | `per-endpoint limits work correctly` | Endpoint limits |
| 🔗 Integration | `tenant isolation - one tenant doesn't affect others` | Tenant isolation |

#### `src/middleware/tenant-context.ts` - Multi-Tenancy

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `extractTenantId should extract from JWT tenantId` | JWT extraction |
| 🧪 Unit | `extractTenantId should extract from JWT tenant_id` | JWT extraction |
| 🧪 Unit | `extractTenantId should extract from x-tenant-id header` | Header extraction |
| 🧪 Unit | `extractTenantId should extract from query param` | Query extraction |
| 🧪 Unit | `extractTenantId should return undefined if none` | No default |
| 🧪 Unit | `validateTenantIdFormat should return true for valid UUID` | Valid UUID |
| 🧪 Unit | `validateTenantIdFormat should return false for invalid` | Invalid format |
| 🧪 Unit | `setTenantContext should skip exempt routes` | Exempt routes |
| 🧪 Unit | `setTenantContext should return 400 if no tenant ID` | Missing tenant |
| 🧪 Unit | `setTenantContext should return 400 if invalid UUID format` | Invalid format |
| 🧪 Unit | `setTenantContext should set request.tenantId` | Tenant set |
| 🔗 Integration | `setPostgresRlsContext should set session variable` | RLS context |
| 🔗 Integration | `AsyncLocalStorage propagation in async operations` | Context propagation |
| 🧪 Unit | `getCurrentTenantId should return tenant from context` | Context retrieval |
| 🧪 Unit | `getTenantCacheKey should return prefixed key` | Cache key |
| 🧪 Unit | `getTenantCacheKey should throw if no tenant context` | Missing context |
| 🔒 Security | `no default tenant - missing tenant rejected` | Security test |
| 🔒 Security | `tenant isolation - can't access other tenant data` | Security test |

#### `src/middleware/validation.middleware.ts` - Zod Validation

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `formatZodError should return correct structure` | Error format |
| 🧪 Unit | `formatZodError should include field paths` | Field paths |
| 🧪 Unit | `validateBody should pass valid body` | Valid body |
| 🧪 Unit | `validateBody should return 400 for invalid body` | Invalid body |
| 🧪 Unit | `validateBody should replace request.body with parsed data` | Body replacement |
| 🧪 Unit | `validateQuery should pass valid query` | Valid query |
| 🧪 Unit | `validateQuery should return 400 for invalid query` | Invalid query |
| 🧪 Unit | `validateParams should pass valid params` | Valid params |
| 🧪 Unit | `validateParams should return 400 for invalid params` | Invalid params |
| 🧪 Unit | `validate should validate body, query, and params together` | Combined validation |
| 🧪 Unit | `validate should only validate provided schemas` | Optional schemas |

#### `src/middleware/request-logger.ts` - Request Logging

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `shouldSkipLogging should return true for health routes` | Health skip |
| 🧪 Unit | `shouldSkipLogging should return false for normal routes` | Normal log |
| 🧪 Unit | `filterHeaders should redact authorization` | Auth redaction |
| 🧪 Unit | `filterHeaders should redact cookie` | Cookie redaction |
| 🧪 Unit | `filterHeaders should preserve safe headers` | Safe headers |
| 🧪 Unit | `redactBody should redact password` | Password redaction |
| 🧪 Unit | `redactBody should redact token` | Token redaction |
| 🧪 Unit | `redactBody should redact acceptanceCode` | Code redaction |
| 🧪 Unit | `redactBody should handle nested objects` | Nested redaction |
| 🧪 Unit | `redactBody should handle arrays` | Array redaction |
| 🧪 Unit | `getLogLevel should return error for 5xx` | Error level |
| 🧪 Unit | `getLogLevel should return warn for 4xx` | Warn level |
| 🧪 Unit | `getLogLevel should return info for 2xx/3xx` | Info level |
| 🔗 Integration | `slow request detection over 3s` | Slow detection |

---

### 6. Routes

#### `src/routes/health.routes.ts` - Health Check Endpoints

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `checkDatabase should return healthy with latency` | DB healthy |
| 🧪 Unit | `checkDatabase should return unhealthy on error` | DB unhealthy |
| 🧪 Unit | `checkRedis should return healthy when responds` | Redis healthy |
| 🧪 Unit | `checkRedis should return degraded when not configured` | Redis degraded |
| 🧪 Unit | `checkSolanaRpc should return healthy when responds` | RPC healthy |
| 🧪 Unit | `checkSolanaRpc should return degraded when not configured` | RPC degraded |
| 🧪 Unit | `calculateOverallStatus should return unhealthy if any unhealthy` | Overall unhealthy |
| 🧪 Unit | `calculateOverallStatus should return degraded if any degraded` | Overall degraded |
| 🧪 Unit | `calculateOverallStatus should return healthy if all healthy` | Overall healthy |
| 🔗 Integration | `GET /health should return 200 when healthy` | Health pass |
| 🔗 Integration | `GET /health should return 503 when unhealthy` | Health fail |
| 🔗 Integration | `GET /health should include version and uptime` | Health metadata |
| 🔗 Integration | `GET /health/live should always return 200` | Liveness |
| 🔗 Integration | `GET /health/ready should return 200 when DB healthy` | Ready pass |
| 🔗 Integration | `GET /health/ready should return 503 when DB unhealthy` | Ready fail |

#### `src/routes/transfer.routes.ts` - Transfer API Routes

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `POST /api/v1/transfers/gift should require authentication` | Auth required |
| 🔗 Integration | `POST /api/v1/transfers/gift should validate body schema` | Body validation |
| 🔗 Integration | `POST /api/v1/transfers/gift should call controller` | Controller call |
| 🔗 Integration | `POST /api/v1/transfers/:transferId/accept should require auth` | Auth required |
| 🔗 Integration | `POST /api/v1/transfers/:transferId/accept should validate params` | Params validation |
| 🔗 Integration | `POST /api/v1/transfers/:transferId/accept should validate body` | Body validation |
| 🔗 Integration | `invalid body should return 400` | Validation error |
| 🔗 Integration | `missing auth should return 401` | Auth error |
| 🎭 E2E | `full gift transfer flow` | Complete flow |

---

### 7. Utilities

#### `src/utils/circuit-breaker.ts` - Circuit Breaker Pattern

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `canExecute should return true when CLOSED` | Closed state |
| 🧪 Unit | `canExecute should return false when OPEN` | Open state |
| 🧪 Unit | `canExecute should transition to HALF_OPEN after resetTimeout` | Timeout transition |
| 🧪 Unit | `canExecute should limit requests in HALF_OPEN` | Half-open limit |
| 🧪 Unit | `recordSuccess should reset consecutiveFailures` | Success reset |
| 🧪 Unit | `recordSuccess in HALF_OPEN should close after threshold` | Half-open close |
| 🧪 Unit | `recordFailure should increment consecutiveFailures` | Failure increment |
| 🧪 Unit | `recordFailure should open circuit at threshold` | Threshold open |
| 🧪 Unit | `recordFailure in HALF_OPEN should open immediately` | Half-open fail |
| 🧪 Unit | `getState should return current state` | State getter |
| 🧪 Unit | `getStats should return all statistics` | Stats getter |
| 🧪 Unit | `forceOpen should force state to OPEN` | Force open |
| 🧪 Unit | `forceClosed should force state to CLOSED` | Force closed |
| 🧪 Unit | `reset should reset counters and close` | Reset |
| 🧪 Unit | `execute should throw CircuitOpenError when open` | Execute open |
| 🧪 Unit | `execute should record success on success` | Execute success |
| 🧪 Unit | `execute should record failure on failure` | Execute failure |
| 🧪 Unit | `executeWithFallback should use fallback when open` | Fallback open |
| 🧪 Unit | `executeWithFallback should use fallback on failure that opens` | Fallback fail |
| 🧪 Unit | `getCircuitBreaker should create new with config` | Registry create |
| 🧪 Unit | `getCircuitBreaker should return existing by name` | Registry get |
| 🧪 Unit | `getAllCircuitBreakerStats should return all stats` | Registry stats |
| 🧪 Unit | `databaseCircuitBreaker should have correct config` | DB breaker |
| 🧪 Unit | `blockchainCircuitBreaker should have correct config` | Blockchain breaker |

#### `src/utils/distributed-lock.ts` - Redis Distributed Locking

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `generateLockValue should return unique value` | Unique value |
| 🧪 Unit | `getLockKey should return prefixed key` | Key prefix |
| 🧪 Unit | `acquire should return lock on success` | Acquire success |
| 🧪 Unit | `acquire should return null after retries exhausted` | Acquire fail |
| 🧪 Unit | `acquire should respect TTL` | TTL respect |
| 🧪 Unit | `release should release with Lua script` | Lua release |
| 🧪 Unit | `release should only release own lock` | Own lock only |
| 🧪 Unit | `release should stop auto-extend` | Stop extend |
| 🧪 Unit | `extend should extend TTL with Lua script` | Lua extend |
| 🧪 Unit | `extend should only extend own lock` | Own lock only |
| 🧪 Unit | `startAutoExtend should start interval` | Start interval |
| 🧪 Unit | `startAutoExtend should stop on extension failure` | Stop on fail |
| 🧪 Unit | `stopAutoExtend should clear interval` | Clear interval |
| 🧪 Unit | `isLocked should return true when not expired` | Not expired |
| 🧪 Unit | `isLocked should return false when expired` | Expired |
| 🧪 Unit | `withLock should acquire before execution` | With acquire |
| 🧪 Unit | `withLock should release after execution` | With release |
| 🧪 Unit | `withLock should release on error` | Release on error |
| 🔗 Integration | `Redis locking acquire/release` | Redis integration |
| 🔗 Integration | `two processes competing for same lock` | Contention |
| 🔗 Integration | `lock expires after TTL` | TTL expiration |

#### `src/utils/blockchain-retry.ts` - Retry Logic

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `isRetryableError should return true for timeout` | Timeout retry |
| 🧪 Unit | `isRetryableError should return true for network` | Network retry |
| 🧪 Unit | `isRetryableError should return true for ECONNRESET` | Connection retry |
| 🧪 Unit | `isRetryableError should return true for 429` | Rate limit retry |
| 🧪 Unit | `isRetryableError should return true for 503` | Service unavail retry |
| 🧪 Unit | `isRetryableError should return false for non-retryable` | Non-retryable |
| 🧪 Unit | `calculateDelay should use exponential backoff` | Backoff calc |
| 🧪 Unit | `calculateDelay should cap at maxDelay` | Max delay |
| 🧪 Unit | `retryBlockchainOperation should return on first success` | First success |
| 🧪 Unit | `retryBlockchainOperation should retry on retryable error` | Retry on error |
| 🧪 Unit | `retryBlockchainOperation should stop on non-retryable` | Stop non-retryable |
| 🧪 Unit | `retryBlockchainOperation should stop at maxAttempts` | Max attempts |
| 🧪 Unit | `pollForConfirmation should return true when check succeeds` | Poll success |
| 🧪 Unit | `pollForConfirmation should return false on timeout` | Poll timeout |
| 🧪 Unit | `pollForConfirmation should return false after maxAttempts` | Poll max |
| 🧪 Unit | `pollForConfirmation should handle errors during polling` | Poll errors |

#### `src/utils/rpc-failover.ts` - Solana RPC Failover

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `parseRPCEndpoints should parse primary URL` | Primary URL |
| 🧪 Unit | `parseRPCEndpoints should parse secondary/tertiary` | Multi endpoints |
| 🧪 Unit | `parseRPCEndpoints should parse JSON config` | JSON config |
| 🧪 Unit | `parseRPCEndpoints should default to devnet` | Default devnet |
| 🧪 Unit | `parseRPCEndpoints should sort by priority` | Priority sort |
| 🧪 Unit | `recordSuccess should update health metrics` | Success metrics |
| 🧪 Unit | `recordSuccess should reset consecutiveFailures` | Reset failures |
| 🧪 Unit | `recordFailure should increment failure counters` | Failure counters |
| 🧪 Unit | `recordFailure should mark unhealthy after 3 failures` | Unhealthy mark |
| 🧪 Unit | `recordFailure should detect rate limiting` | Rate limit detect |
| 🧪 Unit | `getAvailableEndpoints should filter unhealthy` | Filter unhealthy |
| 🧪 Unit | `getAvailableEndpoints should filter rate-limited` | Filter rate limited |
| 🧪 Unit | `selectEndpoint should return highest priority` | Priority select |
| 🧪 Unit | `selectEndpoint should fallback when all unhealthy` | All unhealthy |
| 🧪 Unit | `getConnection should cache connections` | Connection cache |
| 🧪 Unit | `executeWithFailover should succeed on first try` | First success |
| 🧪 Unit | `executeWithFailover should failover to next endpoint` | Failover |
| 🧪 Unit | `executeWithFailover should respect maxRetries` | Max retries |
| 🧪 Unit | `executeWithFailover should use exponential backoff` | Backoff |
| 🧪 Unit | `executeWithFailover should timeout long requests` | Timeout |
| 🔗 Integration | `real RPC failover` | Failover integration |
| 🔗 Integration | `rate limit handling with backoff` | Rate limit handling |

#### `src/utils/logger.ts` - Logging with Redaction

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should redact password in logs` | Password redaction |
| 🧪 Unit | `should redact token in logs` | Token redaction |
| 🧪 Unit | `should redact privateKey in logs` | Private key redaction |
| 🧪 Unit | `should redact email in logs` | Email redaction |
| 🧪 Unit | `should redact apiKey in logs` | API key redaction |
| 🧪 Unit | `should redact nested paths` | Nested redaction |
| 🧪 Unit | `createChildLogger should return child with context` | Child logger |
| 🧪 Unit | `createRequestLogger should return child with requestId` | Request logger |
| 🧪 Unit | `safeLog should redact sensitive keys in dynamic objects` | Dynamic redaction |
| 🧪 Unit | `safeLog should handle nested objects` | Nested handling |
| 🧪 Unit | `safeLog should preserve non-sensitive keys` | Non-sensitive |
| 🧪 Unit | `logAuditEvent should log with audit flag` | Audit logging |
| 🔒 Security | `no secrets in log output` | Security test |

#### `src/utils/response-filter.ts` - Response Sanitization

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `maskEmail should show first 3 chars and domain` | Email masking |
| 🧪 Unit | `maskEmail should handle short local parts` | Short email |
| 🧪 Unit | `maskWallet should show first 4 and last 4` | Wallet masking |
| 🧪 Unit | `maskWallet should handle short addresses` | Short wallet |
| 🧪 Unit | `shouldRemoveField should return true for sensitive` | Sensitive removal |
| 🧪 Unit | `shouldRemoveField should return true for prod-only in prod` | Prod-only |
| 🧪 Unit | `truncateString should truncate at maxLength` | Truncation |
| 🧪 Unit | `filterObject should remove sensitive fields` | Sensitive removal |
| 🧪 Unit | `filterObject should mask maskable fields` | Field masking |
| 🧪 Unit | `filterObject should truncate long strings` | String truncation |
| 🧪 Unit | `filterObject should handle nested objects` | Nested handling |
| 🧪 Unit | `filterObject should handle arrays` | Array handling |
| 🧪 Unit | `filterObject should respect maxDepth` | Depth limit |
| 🧪 Unit | `filterError should exclude stack in production` | Prod stack |
| 🧪 Unit | `filterError should include stack in development` | Dev stack |
| 🧪 Unit | `createErrorResponse should follow RFC 7807` | RFC 7807 |
| 🧪 Unit | `filterUserData should only include public fields` | Public fields |
| 🧪 Unit | `filterTransferData should hide acceptanceCode from non-sender` | Code hiding |
| 🔒 Security | `no sensitive data in filtered output` | Security test |

#### `src/utils/metrics.ts` - Prometheus Metrics

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `recordHttpRequest should observe duration` | Duration observation |
| 🧪 Unit | `recordHttpRequest should increment counter` | Counter increment |
| 🧪 Unit | `recordHttpRequest should set correct labels` | Label setting |
| 🧪 Unit | `recordTransferEvent should handle all event types` | Event types |
| 🧪 Unit | `recordTransferEvent should include extra labels` | Extra labels |
| 🧪 Unit | `recordBlockchainOp should record counter and histogram` | Blockchain metrics |
| 🧪 Unit | `recordRpcRequest should record with labels` | RPC metrics |
| 🧪 Unit | `updateCircuitBreakerState should map state to number` | State mapping |
| 🧪 Unit | `updateCircuitBreakerState should increment trips on OPEN` | Trip counting |
| 🧪 Unit | `recordCacheOp should record hit/miss for get` | Cache hit/miss |
| 🧪 Unit | `getMetrics should return Prometheus format` | Metrics format |
| 🧪 Unit | `getContentType should return correct type` | Content type |

#### `src/utils/graceful-shutdown.ts` - Shutdown Management

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `createShutdownManager should return manager interface` | Manager creation |
| 🧪 Unit | `isShuttingDown should start false` | Initial state |
| 🧪 Unit | `shutdown should set isShuttingDown to true` | Shutdown flag |
| 🧪 Unit | `shutdown should close server` | Server close |
| 🧪 Unit | `shutdown should close database pool` | DB close |
| 🧪 Unit | `shutdown should close Redis` | Redis close |
| 🧪 Unit | `shutdown should run additional cleanup` | Additional cleanup |
| 🧪 Unit | `shutdown should ignore duplicate calls` | Duplicate handling |
| 🧪 Unit | `shutdown should force exit after timeout` | Timeout exit |
| 🧪 Unit | `createShutdownMiddleware should return 503 when shutting down` | Shutdown response |
| 🧪 Unit | `createShutdownMiddleware should pass through when not shutting down` | Normal passthrough |

---

### 8. Schemas & Validators

#### `src/schemas/validation.ts` - Zod Schemas

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `uuidSchema should pass valid UUID` | UUID valid |
| 🧪 Unit | `uuidSchema should fail invalid format` | UUID invalid |
| 🧪 Unit | `solanaPublicKeySchema should pass valid 32-44 char Base58` | Pubkey valid |
| 🧪 Unit | `solanaPublicKeySchema should fail too short` | Pubkey short |
| 🧪 Unit | `solanaPublicKeySchema should fail too long` | Pubkey long |
| 🧪 Unit | `solanaPublicKeySchema should fail invalid chars` | Pubkey chars |
| 🧪 Unit | `solanaSignatureSchema should pass valid 87-88 char` | Sig valid |
| 🧪 Unit | `emailSchema should pass valid email` | Email valid |
| 🧪 Unit | `emailSchema should normalize to lowercase` | Email lowercase |
| 🧪 Unit | `emailSchema should fail invalid format` | Email invalid |
| 🧪 Unit | `sanitizedStringSchema should trim whitespace` | Trim whitespace |
| 🧪 Unit | `sanitizedStringSchema should reject script tags` | Script rejection |
| 🧪 Unit | `paginationSchema should apply defaults` | Pagination defaults |
| 🧪 Unit | `paginationSchema should enforce max limit 100` | Pagination max |
| 🧪 Unit | `initiateTransferSchema should require one recipient` | Recipient required |
| 🧪 Unit | `initiateTransferSchema should validate all fields` | Field validation |
| 🧪 Unit | `batchTransferSchema should enforce min 1 transfer` | Batch min |
| 🧪 Unit | `batchTransferSchema should enforce max 50 transfers` | Batch max |
| 🧪 Unit | `validateInput should return parsed data on success` | Validate success |
| 🧪 Unit | `validateInput should throw ValidationError on failure` | Validate failure |

#### `src/validators/schemas.ts` - Route Schemas

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `acceptanceCodeSchema should require 6-12 chars` | Code length |
| 🧪 Unit | `acceptanceCodeSchema should require uppercase alphanumeric` | Code format |
| 🧪 Unit | `giftTransferBodySchema should use strict mode` | Strict mode |
| 🧪 Unit | `giftTransferBodySchema should require ticketId` | Ticket required |
| 🧪 Unit | `giftTransferBodySchema should require toEmail` | Email required |
| 🧪 Unit | `acceptTransferBodySchema should require acceptanceCode` | Code required |
| 🧪 Unit | `acceptTransferParamsSchema should require transferId` | Transfer required |
| 🧪 Unit | `safeValidate should return success object` | Safe success |
| 🧪 Unit | `safeValidate should return error object` | Safe error |
| 🧪 Unit | `formatZodError should group by field` | Error grouping |

---

### 9. Models & Errors

#### `src/models/transfer.model.ts` - Types and Errors

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `TransferError should set message, code, statusCode` | Error properties |
| 🧪 Unit | `TransferError should default statusCode to 400` | Default status |
| 🧪 Unit | `TransferNotFoundError should have code TRANSFER_NOT_FOUND` | Error code |
| 🧪 Unit | `TransferNotFoundError should have statusCode 404` | Error status |
| 🧪 Unit | `TransferExpiredError should have code TRANSFER_EXPIRED` | Error code |
| 🧪 Unit | `TicketNotFoundError should have code TICKET_NOT_FOUND` | Error code |
| 🧪 Unit | `TicketNotTransferableError should have code TICKET_NOT_TRANSFERABLE` | Error code |

#### `src/errors/index.ts` - Comprehensive Error Classes

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `BaseError should set all properties` | Property setting |
| 🧪 Unit | `BaseError should capture stack trace` | Stack capture |
| 🧪 Unit | `BaseError.toRFC7807 should return correct format` | RFC 7807 format |
| 🧪 Unit | `ValidationError should have statusCode 400` | Status code |
| 🧪 Unit | `ValidationError should include validationErrors` | Validation errors |
| 🧪 Unit | `UnauthorizedError should have statusCode 401` | Status code |
| 🧪 Unit | `ForbiddenError should have statusCode 403` | Status code |
| 🧪 Unit | `NotFoundError should have statusCode 404` | Status code |
| 🧪 Unit | `NotFoundError should include resource and resourceId` | Resource info |
| 🧪 Unit | `ConflictError should have statusCode 409` | Status code |
| 🧪 Unit | `RateLimitError should have statusCode 429` | Status code |
| 🧪 Unit | `RateLimitError should include retryAfter` | Retry after |
| 🧪 Unit | `BlockchainError should handle all categories` | All categories |
| 🧪 Unit | `BlockchainError should determine retryable correctly` | Retryable logic |
| 🧪 Unit | `BlockchainErrors.networkError should be retryable` | Network retryable |
| 🧪 Unit | `BlockchainErrors.transactionError should not be retryable` | Transaction not retryable |
| 🧪 Unit | `BlockchainErrors.rateLimitError should have statusCode 429` | Rate limit status |
| 🧪 Unit | `DatabaseError should have statusCode 500` | Status code |
| 🧪 Unit | `DatabaseConnectionError should have statusCode 503` | Status code |
| 🧪 Unit | `InternalError should have isOperational false` | Non-operational |
| 🧪 Unit | `TransferExpiredError should have statusCode 410` | Status code |
| 🧪 Unit | `isOperationalError should return true for BaseError` | Operational check |
| 🧪 Unit | `isOperationalError should return false for non-BaseError` | Non-operational |
| 🧪 Unit | `isErrorType should return true for matching class` | Type match |
| 🧪 Unit | `toBaseError should return BaseError as-is` | BaseError passthrough |
| 🧪 Unit | `toBaseError should wrap Error in InternalError` | Error wrapping |
| 🧪 Unit | `categorizeBlockchainError should detect timeout` | Timeout detection |
| 🧪 Unit | `categorizeBlockchainError should detect rate limit` | Rate limit detection |
| 🧪 Unit | `categorizeBlockchainError should detect balance issues` | Balance detection |
| 🧪 Unit | `categorizeBlockchainError should detect signature errors` | Signature detection |
| 🧪 Unit | `categorizeBlockchainError should detect network errors` | Network detection |

---

## Test Implementation Priority

### Phase 1 - Critical Security & Core (Week 1-2)
1. `auth.middleware.ts` - JWT validation, algorithm enforcement
2. `internal-auth.ts` - HMAC verification, timing attacks
3. `tenant-context.ts` - Multi-tenancy enforcement
4. `secrets.ts` - Secrets validation
5. `transfer.service.ts` - Core transfer logic
6. `errors/index.ts` - Error handling

### Phase 2 - Business Logic (Week 2-3)
7. `blockchain-transfer.service.ts` - Blockchain operations
8. `transfer-rules.service.ts` - Business rules
9. `idempotency.ts` - Deduplication
10. `transfer.controller.ts` - HTTP handlers
11. `validation.ts` - Schema validation
12. `schemas.ts` - Route schemas

### Phase 3 - Infrastructure (Week 3-4)
13. `circuit-breaker.ts` - Fault tolerance
14. `distributed-lock.ts` - Distributed locking
15. `database.ts` - DB connection management
16. `redis.ts` - Redis connection
17. `cache.service.ts` - Caching
18. `rate-limit.ts` - Rate limiting
19. `app.ts` - App factory

### Phase 4 - Supporting Features (Week 4-5)
20. `batch-transfer.service.ts` - Bulk operations
21. `webhook.service.ts` - Webhook delivery
22. `pricing.service.ts` - Fee calculations
23. `health.routes.ts` - Health checks
24. `transfer.routes.ts` - API routes
25. `nft.service.ts` - NFT operations

### Phase 5 - Observability & Utils (Week 5-6)
26. `metrics.ts` - Prometheus metrics
27. `logger.ts` - Logging & redaction
28. `response-filter.ts` - Response sanitization
29. `blockchain-retry.ts` - Retry logic
30. `rpc-failover.ts` - RPC failover
31. `graceful-shutdown.ts` - Shutdown handling

---

## Notes

- 🧪 Unit = Unit test (mocked dependencies)
- 🔗 Integration = Integration test (real dependencies)
- 🎭 E2E = End-to-end test (full system)
- 🔒 Security = Security-focused test

All tests should be written using Jest with the existing test setup in `tests/` directory.