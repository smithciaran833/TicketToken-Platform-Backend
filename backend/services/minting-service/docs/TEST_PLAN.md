# Minting Service - Test Plan

---

## Test Categories

| Category | Count | Priority |
|----------|-------|----------|
| Unit Tests | ~660 | High |
| Integration Tests | ~691 | High |
| E2E Tests | ~36 | Medium |

---

## Critical Issues to Address

Before testing, these critical issues from audit findings should be verified as resolved:

| Issue | Severity | Impact on Testing |
|-------|----------|-------------------|
| Tenant isolation in RLS (tenant-context.ts) - no cross-tenant data access | 🔴 Critical | All model/route tests must verify tenant isolation |
| Immutable field protection (Mint.ts) - tenant_id cannot be modified | 🔴 Critical | Model update tests must verify stripImmutableFields |
| JWT algorithm whitelist (admin-auth.ts) - must enforce secure algorithms | 🔴 Critical | Auth middleware tests must verify algorithm restriction |
| HMAC timing-safe comparison (internal-auth.ts) - prevent timing attacks | 🔴 Critical | Internal auth tests must verify crypto.timingSafeEqual |
| Distributed locking for mints (MintingOrchestrator.ts) - prevent duplicate mints | 🔴 Critical | Orchestrator tests must verify lock acquisition |
| Webhook signature validation (webhook.ts) - validate HMAC signatures | 🔴 Critical | Webhook tests must verify signature validation |
| PII sanitization in logs (logger.ts) - redact sensitive data | 🔴 High | Logger tests must verify no secrets in output |
| Spending limits enforcement (spending-limits.ts) - prevent overspending | 🔴 High | Spending limit tests must verify enforcement |
| Circuit breaker states (circuit-breaker.ts) - external service failure handling | 🟠 Medium | RPC/IPFS failure simulation |
| Wallet balance monitoring (BalanceMonitor.ts) - alert on low balance | 🟠 Medium | Balance tests must verify threshold alerts |
| Queue idempotency (mintQueue.ts) - deterministic job IDs | 🟠 Medium | Queue tests must verify duplicate job prevention |
| Graceful shutdown (index.ts) - complete in-flight jobs | 🟠 Medium | Shutdown tests must verify job completion |
| Health endpoint security (health.ts) - protect detailed health info | 🟠 Medium | Health tests must verify HEALTH_API_KEY enforcement |

---

## File-by-File Test Specifications

### 1. Entry Points

#### `src/index.ts` - Server Entry Point

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should load dotenv config` | Environment variables loaded |
| 🧪 Unit | `RATE_LIMIT_BYPASS_PATHS should include health endpoints` | Bypass config |
| 🧪 Unit | `RATE_LIMIT_BYPASS_PATHS should include metrics` | Bypass config |
| 🧪 Unit | `getRateLimitRedis should create Redis client with correct config` | Redis setup |
| 🧪 Unit | `getRateLimitRedis should return singleton instance` | Singleton pattern |
| 🧪 Unit | `getRateLimitRedis should log warning on error` | Error handling |
| 🔗 Integration | `unhandledRejection handler should log error details` | Error logging |
| 🔗 Integration | `unhandledRejection handler should not crash process` | Resilience |
| 🔗 Integration | `uncaughtException handler should log error details` | Error logging |
| 🔗 Integration | `uncaughtException handler should exit after delay` | Exit behavior |
| 🔗 Integration | `warning handler should log warning details` | Warning logging |
| 🔗 Integration | `gracefulShutdown should set isShuttingDown flag` | State management |
| 🔗 Integration | `gracefulShutdown should ignore duplicate signals` | Duplicate handling |
| 🔗 Integration | `gracefulShutdown should close HTTP server first` | Order of operations |
| 🔗 Integration | `gracefulShutdown should stop balance monitoring` | Cleanup |
| 🔗 Integration | `gracefulShutdown should close mint queue` | Queue cleanup |
| 🔗 Integration | `gracefulShutdown should close retry queue` | Queue cleanup |
| 🔗 Integration | `gracefulShutdown should close database connections` | DB cleanup |
| 🔗 Integration | `gracefulShutdown should exit with 0 on success` | Exit code |
| 🔗 Integration | `gracefulShutdown should exit with 1 on error` | Exit code |
| 🔗 Integration | `gracefulShutdown should force exit after 30s timeout` | Timeout |
| 🔗 Integration | `process should handle SIGTERM` | Signal handling |
| 🔗 Integration | `process should handle SIGINT` | Signal handling |
| 🔗 Integration | `app should create Fastify instance` | App creation |
| 🔗 Integration | `app should disable default request logging` | Logging config |
| 🔗 Integration | `app should enable trust proxy` | Proxy config |
| 🔗 Integration | `global error handler should log BaseError with full context` | Error logging |
| 🔗 Integration | `global error handler should return appropriate status code` | Status codes |
| 🔗 Integration | `global error handler should return error code` | Error codes |
| 🔗 Integration | `global error handler should return requestId` | Request context |
| 🔗 Integration | `global error handler should include validation errors for ValidationError` | Validation errors |
| 🔗 Integration | `global error handler should include retryAfter for RateLimitError` | Rate limit info |
| 🔗 Integration | `global error handler should set Retry-After header` | Headers |
| 🔗 Integration | `global error handler should filter sensitive context keys` | Security |
| 🔗 Integration | `global error handler should hide internal details for 5xx` | Security |
| 🔗 Integration | `global error handler should handle Fastify errors` | Fastify errors |
| 🔗 Integration | `not found handler should log warning` | Logging |
| 🔗 Integration | `not found handler should return 404` | Status code |
| 🔗 Integration | `not found handler should return NOT_FOUND code` | Error code |
| 🔗 Integration | `main should load secrets first` | Startup order |
| 🔗 Integration | `main should validate configuration` | Config validation |
| 🔗 Integration | `main should initialize database` | DB init |
| 🔗 Integration | `main should initialize Solana` | Solana init |
| 🔗 Integration | `main should initialize queues` | Queue init |
| 🔗 Integration | `main should start minting worker` | Worker start |
| 🔗 Integration | `main should start balance monitoring` | Monitoring start |
| 🔗 Integration | `main should register request ID middleware` | Middleware |
| 🔗 Integration | `main should register request logger middleware` | Middleware |
| 🔗 Integration | `main should register helmet` | Security |
| 🔗 Integration | `main should register rate limiter` | Rate limiting |
| 🔗 Integration | `main should register all routes` | Routes |
| 🔗 Integration | `main should listen on configured port` | Server start |
| 🔗 Integration | `main should exit on startup failure` | Error handling |
| 🔗 Integration | `rate limiter should use tenant_id as key when available` | Key generation |
| 🔗 Integration | `rate limiter should fall back to IP` | Fallback |
| 🔗 Integration | `rate limiter should bypass for health endpoints` | Bypass |
| 🔗 Integration | `rate limiter should bypass for metrics` | Bypass |
| 🔗 Integration | `rate limiter should increment rateLimitHits counter` | Metrics |
| 🔗 Integration | `rate limiter should log rate limit exceeded` | Logging |
| 🔗 Integration | `rate limiter should return custom error response` | Error response |
| 🌐 E2E | `should start service and accept requests` | Full startup |
| 🌐 E2E | `should shut down gracefully on SIGTERM` | Graceful shutdown |
| 🌐 E2E | `health endpoints should work after startup` | Health checks |

---

### 2. Configuration

#### `config/env.types.ts` - Environment Types

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `Environment enum should have development value` | Enum value |
| 🧪 Unit | `Environment enum should have production value` | Enum value |
| 🧪 Unit | `Environment enum should have test value` | Enum value |
| 🧪 Unit | `LogLevel enum should have all log levels` | Enum values |
| 🧪 Unit | `SolanaCluster enum should have devnet` | Enum value |
| 🧪 Unit | `SolanaCluster enum should have mainnet-beta` | Enum value |
| 🧪 Unit | `SolanaCluster enum should have testnet` | Enum value |

#### `config/env.development.ts` - Development Config

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should export development configuration` | Export check |
| 🧪 Unit | `should set NODE_ENV to development` | Env value |
| 🧪 Unit | `should set appropriate log level` | Log config |
| 🧪 Unit | `should configure local database URL` | DB config |
| 🧪 Unit | `should configure local Redis` | Redis config |
| 🧪 Unit | `should set Solana cluster to devnet` | Solana config |

#### `config/env.production.ts` - Production Config

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should export production configuration` | Export check |
| 🧪 Unit | `should set NODE_ENV to production` | Env value |
| 🧪 Unit | `should require all secrets from environment` | Secret requirement |
| 🧪 Unit | `should enable TLS for database` | TLS config |
| 🧪 Unit | `should configure appropriate pool sizes` | Pool config |
| 🔗 Integration | `should load TLS certificates from filesystem` | TLS loading |
| 🔗 Integration | `should validate certificate paths exist` | File validation |

#### `src/config/database.ts` - Database Configuration

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should use default DATABASE_URL` | Default value |
| 🧪 Unit | `should read DATABASE_URL from env` | Env override |
| 🧪 Unit | `should configure connection pool min/max` | Pool config |
| 🧪 Unit | `should configure acquire/idle timeouts` | Timeout config |
| 🧪 Unit | `should enable SSL in production` | SSL config |
| 🧪 Unit | `getPool should return singleton pool` | Singleton |
| 🔗 Integration | `initializeDatabase should establish connection` | Connection |
| 🔗 Integration | `initializeDatabase should run SELECT 1 test` | Health check |
| 🔗 Integration | `initializeDatabase should handle connection failure` | Error handling |
| 🔗 Integration | `db.query should execute SQL with parameters` | Query execution |
| 🔗 Integration | `db.query should use Knex query builder` | Knex integration |
| 🔗 Integration | `db.transaction should commit on success` | Transaction commit |
| 🔗 Integration | `db.transaction should rollback on error` | Transaction rollback |

#### `src/config/ipfs.ts` - IPFS Configuration

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should read PINATA_JWT from env` | Env reading |
| 🧪 Unit | `should read PINATA_API_KEY from env` | Env reading |
| 🧪 Unit | `should read NFT_STORAGE_KEY from env` | Env reading |
| 🧪 Unit | `should configure primary provider` | Provider config |
| 🧪 Unit | `should configure fallback provider` | Fallback config |
| 🧪 Unit | `should configure upload timeout` | Timeout config |
| 🧪 Unit | `getIPFSConfig should return current config` | Config access |
| 🔗 Integration | `should upload to Pinata` | Pinata upload |
| 🔗 Integration | `should failover to NFT.Storage on Pinata failure` | Failover |
| 🔗 Integration | `should return IPFS CID on success` | CID return |
| 🌐 E2E | `should upload real metadata to IPFS` | Real upload |

#### `src/config/redis.ts` - Redis Configuration

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should use default host localhost` | Default host |
| 🧪 Unit | `should use default port 6379` | Default port |
| 🧪 Unit | `should read REDIS_HOST from env` | Env override |
| 🧪 Unit | `should read REDIS_PORT from env` | Env override |
| 🧪 Unit | `should include password when REDIS_PASSWORD set` | Auth config |
| 🧪 Unit | `should configure retry strategy` | Retry config |
| 🧪 Unit | `should configure key prefix for tenant scoping` | Key prefix |
| 🔗 Integration | `should connect to Redis` | Connection |
| 🔗 Integration | `should handle connection errors` | Error handling |
| 🔗 Integration | `should reconnect on disconnect` | Reconnection |
| 🔗 Integration | `should execute basic commands` | Commands |

#### `src/config/secrets.ts` - Secrets Manager

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should detect AWS environment` | Provider detection |
| 🧪 Unit | `should detect Vault environment` | Provider detection |
| 🧪 Unit | `should fall back to env vars` | Fallback |
| 🧪 Unit | `loadSecrets should load required secrets` | Secret loading |
| 🧪 Unit | `loadSecrets should set process.env values` | Env setting |
| 🧪 Unit | `loadSecrets should handle missing secrets` | Error handling |
| 🔗 Integration | `should load from AWS Secrets Manager` | AWS integration |
| 🔗 Integration | `should load from HashiCorp Vault` | Vault integration |
| 🔗 Integration | `should cache loaded secrets` | Caching |

#### `src/config/solana.ts` - Solana Configuration

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should read SOLANA_RPC_URL from env` | Env reading |
| 🧪 Unit | `should read SOLANA_WS_URL from env` | Env reading |
| 🧪 Unit | `should default to devnet URL` | Default value |
| 🧪 Unit | `should configure commitment level` | Commitment config |
| 🧪 Unit | `should configure confirm options` | Confirm config |
| 🧪 Unit | `getConnection should return singleton` | Singleton |
| 🧪 Unit | `getWallet should load from WALLET_PATH` | Wallet loading |
| 🧪 Unit | `getWallet should parse JSON keypair` | Keypair parsing |
| 🔗 Integration | `initializeSolana should establish connection` | Connection |
| 🔗 Integration | `initializeSolana should verify RPC health` | Health check |
| 🔗 Integration | `initializeSolana should load wallet` | Wallet loading |
| 🌐 E2E | `should connect to devnet` | Real connection |
| 🌐 E2E | `should get current slot` | RPC call |

#### `src/config/wallet-provider.ts` - Wallet Provider

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should detect file-based wallet` | Provider detection |
| 🧪 Unit | `should detect AWS KMS wallet` | Provider detection |
| 🧪 Unit | `should generate ephemeral wallet in test mode` | Test mode |
| 🧪 Unit | `loadWallet should load from file path` | File loading |
| 🧪 Unit | `loadWallet should validate keypair format` | Validation |
| 🔗 Integration | `should sign transaction with loaded wallet` | Signing |
| 🔗 Integration | `should derive public key correctly` | Key derivation |

---

### 3. Errors

#### `src/errors/index.ts` - Error Classes

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `ErrorCode enum should have unique values` | Enum uniqueness |
| 🧪 Unit | `ErrorCode enum should include MINTING_FAILED` | Enum value |
| 🧪 Unit | `ErrorCode enum should include SOLANA_RPC_ERROR` | Enum value |
| 🧪 Unit | `ErrorCode enum should include IPFS_UPLOAD_FAILED` | Enum value |
| 🧪 Unit | `ErrorCode enum should include TENANT_NOT_FOUND` | Enum value |
| 🧪 Unit | `ErrorCode enum should include RATE_LIMIT_EXCEEDED` | Enum value |
| 🧪 Unit | `BaseError should set name property` | Error name |
| 🧪 Unit | `BaseError should set message property` | Error message |
| 🧪 Unit | `BaseError should set statusCode property` | Status code |
| 🧪 Unit | `BaseError should set code property` | Error code |
| 🧪 Unit | `BaseError should set isOperational property` | Operational flag |
| 🧪 Unit | `BaseError should capture stack trace` | Stack trace |
| 🧪 Unit | `BaseError should accept context object` | Context |
| 🧪 Unit | `BaseError.toJSON should serialize correctly` | Serialization |
| 🧪 Unit | `MintingError should extend BaseError` | Inheritance |
| 🧪 Unit | `MintingError should have statusCode 500` | Status code |
| 🧪 Unit | `MintingError.insufficientBalance should create correct error` | Factory method |
| 🧪 Unit | `MintingError.transactionFailed should create correct error` | Factory method |
| 🧪 Unit | `MintingError.metadataUploadFailed should create correct error` | Factory method |
| 🧪 Unit | `SolanaError should extend BaseError` | Inheritance |
| 🧪 Unit | `SolanaError.rpcError should create correct error` | Factory method |
| 🧪 Unit | `SolanaError.connectionFailed should create correct error` | Factory method |
| 🧪 Unit | `SolanaError.transactionTimeout should create correct error` | Factory method |
| 🧪 Unit | `ValidationError should extend BaseError` | Inheritance |
| 🧪 Unit | `ValidationError should have statusCode 400` | Status code |
| 🧪 Unit | `ValidationError.invalidInput should create correct error` | Factory method |
| 🧪 Unit | `ValidationError.invalidTicketId should create correct error` | Factory method |
| 🧪 Unit | `ValidationError.invalidMetadata should create correct error` | Factory method |
| 🧪 Unit | `TenantError should extend BaseError` | Inheritance |
| 🧪 Unit | `TenantError.missingTenant should create correct error` | Factory method |
| 🧪 Unit | `TenantError.invalidTenant should create correct error` | Factory method |
| 🧪 Unit | `TenantError.tenantMismatch should create correct error` | Factory method |
| 🧪 Unit | `IPFSError should extend BaseError` | Inheritance |
| 🧪 Unit | `IPFSError.uploadFailed should create correct error` | Factory method |
| 🧪 Unit | `IPFSError.pinningFailed should create correct error` | Factory method |
| 🧪 Unit | `IPFSError.gatewayTimeout should create correct error` | Factory method |
| 🧪 Unit | `AuthenticationError should extend BaseError` | Inheritance |
| 🧪 Unit | `AuthenticationError should have statusCode 401` | Status code |
| 🧪 Unit | `AuthenticationError.missingToken should create correct error` | Factory method |
| 🧪 Unit | `AuthenticationError.invalidToken should create correct error` | Factory method |
| 🧪 Unit | `AuthenticationError.tokenExpired should create correct error` | Factory method |
| 🧪 Unit | `AuthenticationError.insufficientPermissions should have 403` | Status code |
| 🧪 Unit | `RateLimitError should extend BaseError` | Inheritance |
| 🧪 Unit | `RateLimitError should have statusCode 429` | Status code |
| 🧪 Unit | `RateLimitError should include retryAfter` | Retry info |
| 🧪 Unit | `isBaseError should return true for BaseError instances` | Type guard |
| 🧪 Unit | `isBaseError should return false for plain Error` | Type guard |
| 🧪 Unit | `isMintingError should identify MintingError` | Type guard |
| 🧪 Unit | `isValidationError should identify ValidationError` | Type guard |
| 🧪 Unit | `isRateLimitError should identify RateLimitError` | Type guard |
| 🧪 Unit | `isOperationalError should identify operational errors` | Type guard |
| 🧪 Unit | `createError factory should create correct error type` | Factory |

---

### 4. Utilities

#### `src/utils/logger.ts` - Pino Logger

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should detect sensitive field 'password'` | Field detection |
| 🧪 Unit | `should detect sensitive field 'apiKey'` | Field detection |
| 🧪 Unit | `should detect sensitive field 'secret'` | Field detection |
| 🧪 Unit | `should detect sensitive field 'token'` | Field detection |
| 🧪 Unit | `should detect sensitive field 'privateKey'` | Field detection |
| 🧪 Unit | `should detect sensitive field case-insensitively` | Case handling |
| 🧪 Unit | `should detect JWT pattern in values` | Pattern detection |
| 🧪 Unit | `should detect Solana keypair pattern in values` | Pattern detection |
| 🧪 Unit | `should detect API key pattern in values` | Pattern detection |
| 🧪 Unit | `sanitizeValue should redact sensitive strings` | Value sanitization |
| 🧪 Unit | `sanitizeValue should pass through safe values` | Safe values |
| 🧪 Unit | `sanitizeObject should redact sensitive fields` | Object sanitization |
| 🧪 Unit | `sanitizeObject should handle nested objects` | Deep sanitization |
| 🧪 Unit | `sanitizeObject should handle arrays` | Array handling |
| 🧪 Unit | `createChildLogger should include context` | Context |
| 🧪 Unit | `createChildLogger should include requestId` | Request context |
| 🔗 Integration | `should output valid JSON format` | Output format |
| 🔗 Integration | `should use pretty print in development` | Dev mode |
| 🔗 Integration | `should redact configured paths` | Redaction |

#### `src/utils/circuit-breaker.ts` - Circuit Breaker

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `constructor should initialize in CLOSED state` | Initial state |
| 🧪 Unit | `constructor should accept failure threshold` | Config |
| 🧪 Unit | `constructor should accept reset timeout` | Config |
| 🧪 Unit | `execute should call function when CLOSED` | Normal operation |
| 🧪 Unit | `execute should throw when OPEN` | Open rejection |
| 🧪 Unit | `execute should allow single call in HALF_OPEN` | Half-open test |
| 🧪 Unit | `execute should transition to OPEN on failure threshold` | State transition |
| 🧪 Unit | `execute should transition to HALF_OPEN after timeout` | Recovery |
| 🧪 Unit | `execute should transition to CLOSED on success in HALF_OPEN` | Recovery success |
| 🧪 Unit | `getState should return current state` | State access |
| 🧪 Unit | `getMetrics should return failure count` | Metrics |
| 🧪 Unit | `getMetrics should return success count` | Metrics |
| 🧪 Unit | `reset should clear counters and close` | Reset |
| 🧪 Unit | `solanaCircuitBreaker should have correct config` | Pre-configured |
| 🧪 Unit | `ipfsCircuitBreaker should have correct config` | Pre-configured |
| 🧪 Unit | `getCircuitBreakerHealth should return all breaker states` | Health check |
| 🔗 Integration | `should complete full state cycle` | Full cycle |
| 🔗 Integration | `should handle concurrent calls` | Concurrency |

#### `src/utils/distributed-lock.ts` - Distributed Locking

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `createMintLockKey should format correctly` | Key format |
| 🧪 Unit | `createMintLockKey should include tenantId` | Tenant scoping |
| 🧪 Unit | `createMintLockKey should include ticketId` | Ticket scoping |
| 🧪 Unit | `withLock should acquire lock before execution` | Lock acquisition |
| 🧪 Unit | `withLock should release lock after success` | Cleanup |
| 🧪 Unit | `withLock should release lock after error` | Cleanup |
| 🧪 Unit | `withLock should throw if lock not acquired` | Lock failure |
| 🧪 Unit | `withLock should respect TTL` | TTL |
| 🧪 Unit | `Redlock should use configured retry count` | Retry config |
| 🧪 Unit | `Redlock should use configured retry delay` | Delay config |
| 🔗 Integration | `should prevent concurrent access` | Mutual exclusion |
| 🔗 Integration | `should auto-expire locks` | Expiration |
| 🔗 Integration | `should handle Redis failures gracefully` | Error handling |

#### `src/utils/metrics.ts` - Prometheus Metrics

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `mintsTotal should be Counter` | Metric type |
| 🧪 Unit | `mintsTotal should have status and tenant_id labels` | Labels |
| 🧪 Unit | `mintsSuccessTotal should be Counter` | Metric type |
| 🧪 Unit | `mintsFailedTotal should be Counter with reason label` | Labels |
| 🧪 Unit | `mintDuration should be Histogram` | Metric type |
| 🧪 Unit | `mintDuration should have correct buckets` | Buckets |
| 🧪 Unit | `ipfsUploadDuration should be Histogram` | Metric type |
| 🧪 Unit | `walletBalanceSOL should be Gauge` | Metric type |
| 🧪 Unit | `queueDepth should be Gauge` | Metric type |
| 🧪 Unit | `getMetrics should return Prometheus format` | Format |
| 🧪 Unit | `getMetricsJSON should return JSON format` | Format |
| 🧪 Unit | `updateSystemHealth should update health gauge` | Health metric |
| 🔗 Integration | `should expose metrics endpoint` | Endpoint |
| 🔗 Integration | `should produce valid Prometheus format` | Format |

#### `src/utils/response-filter.ts` - Response Filtering

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should remove password field` | Sensitive removal |
| 🧪 Unit | `should remove privateKey field` | Sensitive removal |
| 🧪 Unit | `should remove secretKey field` | Sensitive removal |
| 🧪 Unit | `should remove apiKey field` | Sensitive removal |
| 🧪 Unit | `should redact wallet keypair data` | Redaction |
| 🧪 Unit | `should handle nested objects` | Deep filtering |
| 🧪 Unit | `should handle arrays` | Array filtering |
| 🧪 Unit | `should preserve safe fields` | Safe fields |
| 🧪 Unit | `filterResponse should return null for null` | Null handling |

#### `src/utils/solana.ts` - Solana Utilities

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `checkWalletBalance should return balance in SOL` | Balance check |
| 🧪 Unit | `checkWalletBalance should return sufficient flag` | Threshold check |
| 🧪 Unit | `formatSOL should convert lamports to SOL` | Conversion |
| 🧪 Unit | `formatSOL should handle decimal places` | Formatting |
| 🧪 Unit | `isValidPublicKey should return true for valid key` | Validation |
| 🧪 Unit | `isValidPublicKey should return false for invalid key` | Validation |
| 🧪 Unit | `isValidSignature should return true for valid signature` | Validation |
| 🧪 Unit | `isValidSignature should return false for invalid signature` | Validation |
| 🧪 Unit | `createRetryableTransaction should configure retry options` | Retry config |
| 🔗 Integration | `should check real wallet balance on devnet` | Real balance |
| 🔗 Integration | `should validate real public keys` | Real validation |
| 🌐 E2E | `should send transaction on devnet` | Real transaction |

#### `src/utils/spending-limits.ts` - Spending Limits

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `checkSpendingLimits should read limits from config` | Config reading |
| 🧪 Unit | `checkSpendingLimits should check daily limit` | Daily check |
| 🧪 Unit | `checkSpendingLimits should check monthly limit` | Monthly check |
| 🧪 Unit | `checkSpendingLimits should return allowed=true when under limit` | Under limit |
| 🧪 Unit | `checkSpendingLimits should return allowed=false when over limit` | Over limit |
| 🧪 Unit | `checkSpendingLimits should include remaining amount` | Remaining |
| 🧪 Unit | `recordSpending should increment daily counter` | Daily recording |
| 🧪 Unit | `recordSpending should increment monthly counter` | Monthly recording |
| 🧪 Unit | `recordSpending should set TTL on counters` | TTL |
| 🧪 Unit | `getSpendingStatus should return current spending` | Status |
| 🔗 Integration | `should enforce limits with Redis` | Redis enforcement |
| 🔗 Integration | `should reset daily limits at midnight` | Daily reset |

#### `src/utils/validate-config.ts` - Config Validation

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `validateAll should check DATABASE_URL` | Required field |
| 🧪 Unit | `validateAll should check REDIS_HOST` | Required field |
| 🧪 Unit | `validateAll should check SOLANA_RPC_URL` | Required field |
| 🧪 Unit | `validateAll should check JWT_SECRET` | Required field |
| 🧪 Unit | `validateAll should check INTERNAL_SERVICE_SECRET` | Required field |
| 🧪 Unit | `validateAll should throw on missing required vars` | Validation |
| 🧪 Unit | `validateAll should pass with all vars present` | Success |
| 🧪 Unit | `validatePort should accept valid port numbers` | Port validation |
| 🧪 Unit | `validatePort should reject invalid ports` | Port validation |
| 🧪 Unit | `validateUrl should accept valid URLs` | URL validation |
| 🧪 Unit | `validateUrl should reject invalid URLs` | URL validation |

---

### 5. Models

#### `src/models/Collection.ts` - Collection Model

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `CollectionInterface should define required fields` | Interface |
| 🧪 Unit | `CollectionInterface should include tenant_id` | Tenant field |
| 🧪 Unit | `CollectionInterface should include merkle_tree_address` | Solana field |
| 🧪 Unit | `CollectionInterface should include collection_mint` | Solana field |
| 🔗 Integration | `should create collection with required fields` | Create |
| 🔗 Integration | `should enforce unique merkle_tree_address per tenant` | Unique |
| 🔗 Integration | `should query collections by tenant_id` | Tenant query |

#### `src/models/Mint.ts` - Mint Model

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `MintInterface should define required fields` | Interface |
| 🧪 Unit | `MintInterface should include ticket_id` | Field |
| 🧪 Unit | `MintInterface should include tenant_id` | Field |
| 🧪 Unit | `MintInterface should include status enum` | Enum field |
| 🧪 Unit | `MintInterface should include soft delete fields` | Soft delete |
| 🧪 Unit | `stripImmutableFields should remove tenant_id` | Security |
| 🧪 Unit | `stripImmutableFields should remove id` | Security |
| 🧪 Unit | `stripImmutableFields should remove created_at` | Security |
| 🧪 Unit | `stripImmutableFields should preserve mutable fields` | Safety |
| 🔗 Integration | `should create mint record` | Create |
| 🔗 Integration | `should enforce unique ticket_id + tenant_id` | Unique |
| 🔗 Integration | `should soft delete with deleted_at` | Soft delete |
| 🔗 Integration | `should record deleted_by on soft delete` | Audit |
| 🔗 Integration | `should exclude soft deleted from queries` | Query filter |
| 🔗 Integration | `should update status correctly` | Status update |
| 🔗 Integration | `should use RETURNING clause for updates` | RETURNING |
| 🔗 Integration | `tenant A should not see tenant B mints` | Tenant isolation |
| 🔗 Integration | `tenant A should not update tenant B mints` | Tenant isolation |
| 🔗 Integration | `tenant A should not delete tenant B mints` | Tenant isolation |

#### `src/models/NFT.ts` - NFT Model

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `NFTInterface should define required fields` | Interface |
| 🧪 Unit | `NFTInterface should include asset_id` | Field |
| 🧪 Unit | `NFTInterface should include owner_address` | Field |
| 🧪 Unit | `NFTInterface should include metadata_uri` | Field |
| 🔗 Integration | `should create NFT record` | Create |
| 🔗 Integration | `should query NFTs by owner_address` | Owner query |
| 🔗 Integration | `should query NFTs by collection` | Collection query |

---

### 6. Schemas & Validators

#### `src/schemas/validation.ts` - Validation Helpers

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `validate should return parsed data on success` | Success |
| 🧪 Unit | `validate should throw ValidationError on failure` | Failure |
| 🧪 Unit | `safeValidate should return success result` | Success |
| 🧪 Unit | `safeValidate should return error result` | Failure |
| 🧪 Unit | `formatValidationErrors should format Zod errors` | Formatting |

#### `src/validators/mint.schemas.ts` - Mint Schemas

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `ticketMetadataSchema should require eventName` | Required field |
| 🧪 Unit | `ticketMetadataSchema should require eventDate` | Required field |
| 🧪 Unit | `ticketMetadataSchema should accept optional venue` | Optional field |
| 🧪 Unit | `ticketMetadataSchema should accept optional tier` | Optional field |
| 🧪 Unit | `ticketMetadataSchema should accept optional seatNumber` | Optional field |
| 🧪 Unit | `ticketMetadataSchema should accept optional image` | Optional field |
| 🧪 Unit | `ticketMintDataSchema should require ticketId` | Required field |
| 🧪 Unit | `ticketMintDataSchema should require tenantId as UUID` | UUID validation |
| 🧪 Unit | `ticketMintDataSchema should require eventId` | Required field |
| 🧪 Unit | `ticketMintDataSchema should accept optional userId` | Optional field |
| 🧪 Unit | `ticketMintDataSchema should accept optional ownerAddress` | Optional field |
| 🧪 Unit | `batchMintSchema should require tickets array` | Required field |
| 🧪 Unit | `batchMintSchema should validate each ticket` | Array validation |
| 🧪 Unit | `batchMintSchema should limit array length` | Max length |
| 🧪 Unit | `mintQuerySchema should validate status enum` | Enum validation |
| 🧪 Unit | `mintQuerySchema should validate pagination` | Pagination |
| 🧪 Unit | `reconcileSchema should require ticketIds array` | Required field |
| 🧪 Unit | `dlqRequeueSchema should require jobIds array` | Required field |
| 🧪 Unit | `nftMetadataSchema should follow Metaplex standard` | Standard compliance |
| 🧪 Unit | `nftMetadataSchema should require name` | Required field |
| 🧪 Unit | `nftMetadataSchema should require symbol` | Required field |
| 🧪 Unit | `nftMetadataSchema should require uri` | Required field |
| 🧪 Unit | `nftMetadataSchema should validate seller_fee_basis_points` | Range validation |
| 🧪 Unit | `webhookMintPayloadSchema should require orderId` | Required field |
| 🧪 Unit | `webhookMintPayloadSchema should require tenantId` | Required field |
| 🧪 Unit | `webhookMintPayloadSchema should require tickets array` | Required field |
| 🧪 Unit | `internalMintSchema should require ticketIds array` | Required field |
| 🧪 Unit | `internalMintSchema should require eventId` | Required field |

---

### 7. Middleware

#### `src/middleware/admin-auth.ts` - Admin Authentication

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `authMiddleware should return 401 when no header` | Missing auth |
| 🧪 Unit | `authMiddleware should return 401 for non-Bearer token` | Invalid format |
| 🧪 Unit | `authMiddleware should return 401 for invalid token` | Invalid token |
| 🧪 Unit | `authMiddleware should return 401 for expired token` | Expiration |
| 🧪 Unit | `authMiddleware should attach user to request on success` | Request decoration |
| 🧪 Unit | `authMiddleware should extract tenant_id from token` | Tenant extraction |
| 🧪 Unit | `authMiddleware should verify with algorithm whitelist` | Algorithm check |
| 🧪 Unit | `requireAdmin should return 403 for non-admin` | Role check |
| 🧪 Unit | `requireAdmin should allow admin role` | Admin access |
| 🧪 Unit | `requireAdmin should allow super_admin role` | Super admin access |
| 🧪 Unit | `requireAdmin should allow platform_admin role` | Platform admin access |
| 🧪 Unit | `checkPermission should verify specific permissions` | Permission check |
| 🔗 Integration | `should complete full auth flow with valid token` | Auth flow |
| 🔗 Integration | `should reject expired token` | Expiration |
| 🌐 E2E | `protected endpoints should require auth` | Protection |

#### `src/middleware/internal-auth.ts` - Internal Service Auth

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `validateInternalRequest should return 401 without signature` | Missing signature |
| 🧪 Unit | `validateInternalRequest should return 401 without timestamp` | Missing timestamp |
| 🧪 Unit | `validateInternalRequest should return 401 for expired timestamp` | Expiration |
| 🧪 Unit | `validateInternalRequest should use 5-minute timestamp window` | Window |
| 🧪 Unit | `validateInternalRequest should return 401 for invalid signature` | Invalid signature |
| 🧪 Unit | `validateInternalRequest should use HMAC-SHA256` | Algorithm |
| 🧪 Unit | `validateInternalRequest should use timing-safe comparison` | Security |
| 🧪 Unit | `validateInternalRequest should extract service name` | Service extraction |
| 🧪 Unit | `validateInternalRequest should attach internalService to request` | Request decoration |
| 🧪 Unit | `validateInternalRequest should return 500 without INTERNAL_SERVICE_SECRET` | Config error |
| 🧪 Unit | `generateInternalSignature should create valid signature` | Signature generation |
| 🔗 Integration | `should validate real service-to-service call` | S2S validation |

#### `src/middleware/load-shedding.ts` - Load Shedding

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `determinePriority should return CRITICAL for health checks` | Priority |
| 🧪 Unit | `determinePriority should return HIGH for minting` | Priority |
| 🧪 Unit | `determinePriority should return NORMAL for webhooks` | Priority |
| 🧪 Unit | `determinePriority should return LOW for admin` | Priority |
| 🧪 Unit | `loadSheddingMiddleware should allow CRITICAL at any load` | CRITICAL handling |
| 🧪 Unit | `loadSheddingMiddleware should shed LOW first` | Priority shedding |
| 🧪 Unit | `loadSheddingMiddleware should shed NORMAL at high load` | Load-based |
| 🧪 Unit | `loadSheddingMiddleware should shed HIGH only at critical load` | Critical load |
| 🧪 Unit | `loadSheddingMiddleware should return 503 when shedding` | Response |
| 🧪 Unit | `loadSheddingMiddleware should include Retry-After header` | Headers |
| 🧪 Unit | `bulkhead pattern should have separate pools` | Pool separation |
| 🧪 Unit | `bulkhead should limit mint pool` | Mint pool |
| 🧪 Unit | `bulkhead should limit webhook pool` | Webhook pool |
| 🧪 Unit | `bulkhead should limit admin pool` | Admin pool |
| 🧪 Unit | `getLoadStatus should return current load metrics` | Metrics |
| 🔗 Integration | `should enforce load shedding under pressure` | Load test |

#### `src/middleware/request-id.ts` - Request ID

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `registerRequestIdMiddleware should extract X-Request-ID` | Header extraction |
| 🧪 Unit | `registerRequestIdMiddleware should extract X-Correlation-ID` | Header extraction |
| 🧪 Unit | `registerRequestIdMiddleware should generate UUID if none present` | Generation |
| 🧪 Unit | `registerRequestIdMiddleware should set request.id` | Request decoration |
| 🧪 Unit | `registerRequestIdMiddleware should set response header` | Response header |
| 🔗 Integration | `should propagate request ID through request` | Propagation |

#### `src/middleware/request-logger.ts` - Request Logging

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `registerRequestLogger should log request start` | Start logging |
| 🧪 Unit | `registerRequestLogger should log request completion` | Completion logging |
| 🧪 Unit | `registerRequestLogger should include method and path` | Context |
| 🧪 Unit | `registerRequestLogger should include response time` | Timing |
| 🧪 Unit | `registerRequestLogger should include status code` | Status |
| 🧪 Unit | `registerRequestLogger should sanitize sensitive headers` | Sanitization |
| 🧪 Unit | `registerRequestLogger should exclude health check paths` | Exclusion |
| 🧪 Unit | `sanitizeUrl should remove sensitive query params` | URL sanitization |
| 🧪 Unit | `sanitizeUrl should preserve safe query params` | Safe params |
| 🔗 Integration | `should log full request lifecycle` | Lifecycle |

#### `src/middleware/tenant-context.ts` - Tenant Context

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `setTenantContext should extract tenant_id from user` | Extraction |
| 🧪 Unit | `setTenantContext should validate UUID format` | UUID validation |
| 🧪 Unit | `setTenantContext should return 401 without tenant` | Rejection |
| 🧪 Unit | `setTenantContext should call SET LOCAL for RLS` | RLS setup |
| 🧪 Unit | `setTenantContext should set app.current_tenant_id` | Context var |
| 🧪 Unit | `setTenantContext should attach tenantId to request` | Request decoration |
| 🧪 Unit | `getTenantIdFromRequest should return tenant from request` | Retrieval |
| 🧪 Unit | `isPlatformAdmin should return true for platform admin` | Admin check |
| 🧪 Unit | `isPlatformAdmin should return false for regular user` | Admin check |
| 🧪 Unit | `isPlatformAdmin should allow cross-tenant queries` | Cross-tenant |
| 🔗 Integration | `should set RLS context in database` | RLS |
| 🔗 Integration | `should enforce tenant isolation` | Isolation |
| 🌐 E2E | `queries should return only tenant data` | Filtering |
| 🌐 E2E | `cross-tenant access should be blocked` | Security |

#### `src/middleware/webhook-idempotency.ts` - Webhook Idempotency

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `webhookIdempotencyMiddleware should extract event ID from body` | Extraction |
| 🧪 Unit | `webhookIdempotencyMiddleware should extract event ID from header` | Header extraction |
| 🧪 Unit | `webhookIdempotencyMiddleware should generate ID if none present` | Generation |
| 🧪 Unit | `webhookIdempotencyMiddleware should check Redis for duplicate` | Duplicate check |
| 🧪 Unit | `webhookIdempotencyMiddleware should return 200 for duplicate` | Duplicate response |
| 🧪 Unit | `webhookIdempotencyMiddleware should allow new events` | New event |
| 🧪 Unit | `webhookIdempotencyMiddleware should set 24-hour TTL` | TTL |
| 🧪 Unit | `markWebhookProcessed should store event in Redis` | Storage |
| 🧪 Unit | `markWebhookProcessed should include result data` | Result storage |
| 🧪 Unit | `getWebhookStatus should return processing status` | Status check |
| 🔗 Integration | `should deduplicate webhooks with Redis` | Deduplication |
| 🔗 Integration | `should expire entries after TTL` | Expiration |

---

### 8. Queues & Workers

#### `src/queues/mintQueue.ts` - Mint Queue

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `generateMintJobId should be deterministic` | Deterministic ID |
| 🧪 Unit | `generateMintJobId should include tenantId` | Tenant scoping |
| 🧪 Unit | `generateMintJobId should include ticketId` | Ticket scoping |
| 🧪 Unit | `calculateBackoff should use exponential formula` | Backoff |
| 🧪 Unit | `calculateBackoff should add jitter` | Jitter |
| 🧪 Unit | `calculateBackoff should cap at max delay` | Cap |
| 🧪 Unit | `categorizeError should identify retryable errors` | Error categorization |
| 🧪 Unit | `categorizeError should identify non-retryable errors` | Error categorization |
| 🧪 Unit | `addMintJob should use deterministic job ID` | Idempotency |
| 🧪 Unit | `addMintJob should set job options` | Options |
| 🧪 Unit | `addMintJob should respect queue size limits` | Size limit |
| 🧪 Unit | `moveToDLQ should transfer failed job` | DLQ transfer |
| 🧪 Unit | `moveToDLQ should include error reason` | Error tracking |
| 🧪 Unit | `getStaleJobs should find active jobs > 10min` | Stale detection |
| 🧪 Unit | `getStaleJobs should find waiting jobs > 30min` | Stale detection |
| 🧪 Unit | `getStaleJobDetectionStatus should return status` | Status |
| 🧪 Unit | `initializeQueues should create mint queue` | Initialization |
| 🧪 Unit | `initializeQueues should create retry queue` | Initialization |
| 🧪 Unit | `initializeQueues should create DLQ` | Initialization |
| 🧪 Unit | `getMintQueue should return queue instance` | Access |
| 🧪 Unit | `getRetryQueue should return queue instance` | Access |
| 🧪 Unit | `getDLQ should return queue instance` | Access |
| 🧪 Unit | `getQueueMetrics should return depth` | Metrics |
| 🧪 Unit | `getQueueMetrics should return stalled count` | Metrics |
| 🧪 Unit | `getQueueMetrics should return DLQ by reason` | Metrics |
| 🔗 Integration | `should add job to queue` | Job addition |
| 🔗 Integration | `should prevent duplicate job IDs` | Idempotency |
| 🔗 Integration | `should move job to DLQ after max retries` | DLQ flow |
| 🔗 Integration | `should detect stale jobs` | Stale detection |
| 🔗 Integration | `should enforce queue size limits` | Size limits |
| 🌐 E2E | `should process job end-to-end` | Full flow |

#### `src/workers/mintingWorker.ts` - Minting Worker

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `categorizeError should return insufficient_balance` | Error type |
| 🧪 Unit | `categorizeError should return ipfs_error` | Error type |
| 🧪 Unit | `categorizeError should return rpc_error` | Error type |
| 🧪 Unit | `categorizeError should return transaction_failed` | Error type |
| 🧪 Unit | `categorizeError should return unknown` | Default type |
| 🧪 Unit | `isRetryableError should return true for RPC errors` | Retryable |
| 🧪 Unit | `isRetryableError should return true for timeout errors` | Retryable |
| 🧪 Unit | `isRetryableError should return false for validation errors` | Non-retryable |
| 🧪 Unit | `getConcurrencyLimit should read from config` | Config |
| 🧪 Unit | `getConcurrencyLimit should have default value` | Default |
| 🧪 Unit | `processJob should call MintingOrchestrator` | Processing |
| 🧪 Unit | `processJob should record metrics on success` | Metrics |
| 🧪 Unit | `processJob should record metrics on failure` | Metrics |
| 🔗 Integration | `should process mint job` | Job processing |
| 🔗 Integration | `should retry on retryable error` | Retry |
| 🔗 Integration | `should move to DLQ on non-retryable error` | DLQ |
| 🔗 Integration | `should respect concurrency limit` | Concurrency |
| 🌐 E2E | `should mint NFT on devnet` | Real minting |

---

### 9. Jobs

#### `src/jobs/reconciliation.ts` - Reconciliation Job

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `RECONCILIATION_INTERVAL should be 15 minutes` | Constant |
| 🧪 Unit | `STALE_MINTING_THRESHOLD should be 30 minutes` | Constant |
| 🧪 Unit | `STALE_PENDING_THRESHOLD should be 1 hour` | Constant |
| 🧪 Unit | `STARTUP_DELAY should be 5 seconds` | Constant |
| 🔗 Integration | `should find stale minting records` | Query |
| 🔗 Integration | `should verify asset existence via DAS` | DAS query |
| 🔗 Integration | `should update status for confirmed assets` | Status update |
| 🔗 Integration | `should re-queue stuck pending mints` | Re-queue |
| 🔗 Integration | `should check for existing queue jobs` | Duplicate prevention |
| 🔗 Integration | `startReconciliation should run periodically` | Scheduling |
| 🔗 Integration | `stopReconciliation should clear interval` | Cleanup |
| 🔗 Integration | `runReconciliationNow should trigger manual run` | Manual trigger |
| 🔗 Integration | `should log reconciliation summary` | Logging |
| 🔗 Integration | `should handle DAS errors gracefully` | Error handling |

---

### 10. Services

#### `src/services/BalanceMonitor.ts` - Balance Monitor

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `POLL_INTERVAL should be 5 minutes` | Constant |
| 🧪 Unit | `ALERT_COOLDOWN should be 1 hour` | Constant |
| 🧪 Unit | `MIN_SOL_BALANCE should read from env` | Config |
| 🧪 Unit | `MIN_SOL_BALANCE should default to 0.1` | Default |
| 🧪 Unit | `getCurrentBalance should return SOL balance` | Balance |
| 🧪 Unit | `isBalanceSufficient should compare to threshold` | Comparison |
| 🧪 Unit | `getBalanceStatus should return comprehensive status` | Status |
| 🔗 Integration | `startBalanceMonitoring should start polling` | Start |
| 🔗 Integration | `startBalanceMonitoring should check immediately` | Immediate check |
| 🔗 Integration | `stopBalanceMonitoring should stop polling` | Stop |
| 🔗 Integration | `should trigger alert when balance low` | Alert |
| 🔗 Integration | `should respect alert cooldown` | Cooldown |
| 🔗 Integration | `should update walletBalanceSOL metric` | Metrics |
| 🔗 Integration | `getBalanceMonitor should return singleton` | Singleton |

#### `src/services/BatchMintingService.ts` - Batch Minting

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `MAX_BATCH_SIZE should be 10` | Constant |
| 🧪 Unit | `BATCH_DELAY_MS should be 100` | Constant |
| 🧪 Unit | `batchMint should validate batch size` | Validation |
| 🧪 Unit | `batchMint should process tickets in batches` | Batching |
| 🧪 Unit | `batchMint should process batch in parallel` | Parallelism |
| 🧪 Unit | `batchMint should add delay between batches` | Rate limiting |
| 🧪 Unit | `batchMint should collect results` | Results |
| 🧪 Unit | `batchMint should count successful/failed` | Counting |
| 🧪 Unit | `estimateBatchCost should calculate SOL cost` | Estimation |
| 🧪 Unit | `estimateBatchCost should include transaction fees` | Fee calculation |
| 🔗 Integration | `should process batch of tickets` | Batch processing |
| 🔗 Integration | `should handle partial failures` | Partial failure |

#### `src/services/DASClient.ts` - DAS Client

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `constructor should set RPC URL` | Config |
| 🧪 Unit | `constructor should set 10-second timeout` | Timeout |
| 🧪 Unit | `getAsset should make JSON-RPC call` | RPC call |
| 🧪 Unit | `getAsset should return asset data` | Return |
| 🧪 Unit | `getAssetProof should return merkle proof` | Proof |
| 🧪 Unit | `getAssetBatch should fetch multiple assets` | Batch |
| 🧪 Unit | `getAssetsByOwner should paginate results` | Pagination |
| 🧪 Unit | `getAssetsByGroup should filter by collection` | Filtering |
| 🧪 Unit | `getAssetsByCreator should filter by creator` | Filtering |
| 🧪 Unit | `verifyOwnership should return true for owner` | Verification |
| 🧪 Unit | `verifyOwnership should return false for non-owner` | Verification |
| 🧪 Unit | `assetExists should return true for existing` | Existence |
| 🧪 Unit | `assetExists should return false for non-existing` | Existence |
| 🧪 Unit | `getCompressionInfo should return tree and leaf` | Compression info |
| 🧪 Unit | `getDASClient should return singleton` | Singleton |
| 🔗 Integration | `should fetch real asset from devnet` | Real query |
| 🔗 Integration | `should handle RPC errors` | Error handling |
| 🌐 E2E | `should verify ownership on devnet` | Real verification |

#### `src/services/MetadataCache.ts` - Metadata Cache

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `KEY_PREFIX should be minting:` | Prefix |
| 🧪 Unit | `DEFAULT_TTL should be 1 hour` | TTL |
| 🧪 Unit | `get should return cached value` | Get |
| 🧪 Unit | `get should return null for miss` | Cache miss |
| 🧪 Unit | `set should store with TTL` | Set |
| 🧪 Unit | `delete should remove key` | Delete |
| 🧪 Unit | `getOrSet should return cached on hit` | Cache hit |
| 🧪 Unit | `getOrSet should call factory on miss` | Factory |
| 🧪 Unit | `getOrSet should cache factory result` | Cache set |
| 🧪 Unit | `cacheIPFSMetadata should use 24hr TTL` | IPFS TTL |
| 🧪 Unit | `cacheMintTransaction should use 1hr TTL` | Mint TTL |
| 🧪 Unit | `invalidateTicket should clear ticket keys` | Invalidation |
| 🧪 Unit | `clearAll should flush cache` | Clear |
| 🧪 Unit | `getStats should return hit/miss counts` | Stats |
| 🧪 Unit | `should degrade gracefully on Redis error` | Error handling |
| 🔗 Integration | `should cache and retrieve data` | Full cycle |
| 🔗 Integration | `should expire after TTL` | Expiration |

#### `src/services/MetadataService.ts` - Metadata Service

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `uploadToIPFS should prepare metadata` | Preparation |
| 🧪 Unit | `uploadToIPFS should check ticket-based cache` | Cache check |
| 🧪 Unit | `uploadToIPFS should check content-based cache` | Content cache |
| 🧪 Unit | `uploadToIPFS should upload via primary provider` | Upload |
| 🧪 Unit | `uploadToIPFS should fallback on primary failure` | Failover |
| 🧪 Unit | `uploadToIPFS should cache result` | Caching |
| 🧪 Unit | `uploadToIPFS should return IPFS URI` | Return |
| 🧪 Unit | `verifyCidExists should check gateway` | Verification |
| 🧪 Unit | `verifyCidContent should validate content hash` | Content verification |
| 🧪 Unit | `isValidCid should accept CIDv0` | CID validation |
| 🧪 Unit | `isValidCid should accept CIDv1` | CID validation |
| 🧪 Unit | `isValidCid should reject invalid CID` | CID validation |
| 🧪 Unit | `MintStatusEmitter should emit events` | Events |
| 🧪 Unit | `MintStatusEmitter.subscribeTenant should filter by tenant` | Subscription |
| 🧪 Unit | `MintStatusEmitter.subscribeUser should filter by user` | Subscription |
| 🧪 Unit | `MintStatusEmitter.subscribeTicket should filter by ticket` | Subscription |
| 🔗 Integration | `should upload to real IPFS` | Real upload |
| 🔗 Integration | `should emit status events` | Event emission |
| 🌐 E2E | `should upload and verify on IPFS` | Full flow |

#### `src/services/MintingOrchestrator.ts` - Minting Orchestrator

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `categorizeError should return insufficient_balance` | Error type |
| 🧪 Unit | `categorizeError should return ipfs_upload_failed` | Error type |
| 🧪 Unit | `categorizeError should return transaction_failed` | Error type |
| 🧪 Unit | `categorizeError should return timeout` | Error type |
| 🧪 Unit | `categorizeError should return bubblegum_error` | Error type |
| 🧪 Unit | `categorizeError should return unknown` | Default |
| 🧪 Unit | `getMerkleTreeAddress should return address from nftService` | Access |
| 🧪 Unit | `getMerkleTreeAddress should return null when not initialized` | Guard |
| 🧪 Unit | `getCollectionAddress should return address from nftService` | Access |
| 🔗 Integration | `ensureInitialized should initialize connection` | Initialization |
| 🔗 Integration | `ensureInitialized should initialize wallet` | Initialization |
| 🔗 Integration | `ensureInitialized should initialize nftService` | Initialization |
| 🔗 Integration | `ensureInitialized should only initialize once` | Singleton |
| 🔗 Integration | `mintCompressedNFT should acquire distributed lock` | Locking |
| 🔗 Integration | `mintCompressedNFT should release lock after completion` | Cleanup |
| 🔗 Integration | `mintCompressedNFT should release lock on error` | Cleanup |
| 🔗 Integration | `executeMint should return cached result for completed` | Idempotency |
| 🔗 Integration | `executeMint should throw for in-progress mint` | Guard |
| 🔗 Integration | `executeMint should retry pending/failed mints` | Retry |
| 🔗 Integration | `executeMint should check wallet balance` | Balance check |
| 🔗 Integration | `executeMint should throw on insufficient balance` | Balance error |
| 🔗 Integration | `executeMint should upload metadata to IPFS` | IPFS upload |
| 🔗 Integration | `executeMint should call nftService.mintNFT` | NFT minting |
| 🔗 Integration | `executeMint should save mint record` | Persistence |
| 🔗 Integration | `executeMint should register on blockchain` | Blockchain |
| 🔗 Integration | `executeMint should skip registration without userId` | Skip |
| 🔗 Integration | `executeMint should verify asset via DAS` | Verification |
| 🔗 Integration | `executeMint should record metrics` | Metrics |
| 🔗 Integration | `checkExistingMint should return record if found` | Query |
| 🔗 Integration | `checkExistingMint should return null if not found` | Query |
| 🔗 Integration | `markMintingStarted should create table if not exists` | DDL |
| 🔗 Integration | `markMintingStarted should upsert with minting status` | Upsert |
| 🔗 Integration | `saveMintRecord should use transaction` | Transaction |
| 🔗 Integration | `saveMintRecord should update both tables` | Multi-table |
| 🔗 Integration | `saveMintRecord should rollback on error` | Rollback |
| 🔗 Integration | `verifyMintedAsset should wait for indexing` | Delay |
| 🔗 Integration | `verifyMintedAsset should check existence` | Existence |
| 🔗 Integration | `verifyMintedAsset should verify ownership` | Ownership |
| 🔗 Integration | `verifyMintedAsset should log mismatch` | Logging |
| 🌐 E2E | `should mint real cNFT on devnet` | Real minting |
| 🌐 E2E | `should verify minted asset via DAS` | Verification |
| 🌐 E2E | `should handle idempotent retry` | Idempotency |

#### `src/services/PaymentIntegration.ts` - Payment Integration

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `onPaymentComplete should extract order data` | Extraction |
| 🧪 Unit | `onPaymentComplete should map ticket fields` | Mapping |
| 🧪 Unit | `onPaymentComplete should include metadata` | Metadata |
| 🔗 Integration | `onPaymentComplete should create job per ticket` | Job creation |
| 🔗 Integration | `onPaymentComplete should pass correct data` | Data passing |
| 🔗 Integration | `onPaymentComplete should log completion` | Logging |
| 🔗 Integration | `onPaymentComplete should return job array` | Return |

#### `src/services/RPCManager.ts` - RPC Manager

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `constructor should configure multiple endpoints` | Config |
| 🧪 Unit | `constructor should set maxRetries to 3` | Config |
| 🧪 Unit | `constructor should set baseDelay to 1000ms` | Config |
| 🧪 Unit | `endpoint rotation should rotate on rate limit` | Rotation |
| 🧪 Unit | `endpoint rotation should wrap around` | Wrap |
| 🔗 Integration | `initialize should create Connection per endpoint` | Initialization |
| 🔗 Integration | `getConnection should return current connection` | Access |
| 🔗 Integration | `sendTransactionWithRetry should add compute budget` | Compute budget |
| 🔗 Integration | `sendTransactionWithRetry should confirm transaction` | Confirmation |
| 🔗 Integration | `sendTransactionWithRetry should switch on 429` | Rate limit |
| 🔗 Integration | `sendTransactionWithRetry should use exponential backoff` | Backoff |
| 🔗 Integration | `sendTransactionWithRetry should throw after max retries` | Max retries |

#### `src/services/RealCompressedNFT.ts` - Compressed NFT Service

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `getMerkleTreeAddress should return address when initialized` | Access |
| 🧪 Unit | `getMerkleTreeAddress should return null when not initialized` | Guard |
| 🧪 Unit | `getCollectionAddress should return address when initialized` | Access |
| 🔗 Integration | `initialize should create Umi instance` | Umi creation |
| 🔗 Integration | `initialize should load wallet from file` | Wallet loading |
| 🔗 Integration | `initialize should throw if wallet missing` | Error |
| 🔗 Integration | `initialize should load merkle tree config` | Config loading |
| 🔗 Integration | `initialize should throw if tree config missing` | Error |
| 🔗 Integration | `initialize should load collection config` | Config loading |
| 🔗 Integration | `initialize should set up signer` | Signer |
| 🔗 Integration | `mintNFT should throw if not initialized` | Guard |
| 🔗 Integration | `mintNFT should use ownerAddress as leafOwner` | Owner |
| 🔗 Integration | `mintNFT should default to wallet as leafOwner` | Default |
| 🔗 Integration | `mintNFT should call mintToCollectionV1` | Minting |
| 🔗 Integration | `mintNFT should return signature and tree` | Return |
| 🌐 E2E | `should initialize with real config` | Real init |
| 🌐 E2E | `should mint cNFT to devnet` | Real minting |

#### `src/services/ReconciliationService.ts` - Reconciliation Service

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `status categorization should identify confirmed` | Status |
| 🧪 Unit | `status categorization should identify not found` | Status |
| 🧪 Unit | `status categorization should identify pending` | Status |
| 🧪 Unit | `status categorization should identify error` | Status |
| 🔗 Integration | `reconcileAll should fetch minted tickets` | Query |
| 🔗 Integration | `reconcileAll should check each on blockchain` | Checking |
| 🔗 Integration | `reconcileAll should count by status` | Counting |
| 🔗 Integration | `reconcileAll should collect discrepancies` | Collection |
| 🔗 Integration | `reconcileAll should store report` | Persistence |
| 🔗 Integration | `checkTicket should detect not_found on missing signature` | Detection |
| 🔗 Integration | `checkTicket should detect not_found on missing tx` | Detection |
| 🔗 Integration | `checkTicket should detect error on failed tx` | Detection |
| 🔗 Integration | `checkTicket should detect time discrepancy` | Detection |
| 🔗 Integration | `fixDiscrepancies should reset status` | Reset |
| 🔗 Integration | `fixDiscrepancies should clear signature` | Clear |
| 🔗 Integration | `getReconciliationHistory should return ordered results` | Query |
| 🔗 Integration | `getReconciliationMetrics should calculate averages` | Metrics |

#### `src/services/blockchain.service.ts` - Blockchain Service

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `getClient should create with correct config` | Config |
| 🧪 Unit | `getClient should use env vars` | Env |
| 🧪 Unit | `getClient should use defaults when env not set` | Defaults |
| 🧪 Unit | `getClient should return singleton` | Singleton |
| 🔗 Integration | `registerTicketOnChain should log start` | Logging |
| 🔗 Integration | `registerTicketOnChain should call client.registerTicket` | Registration |
| 🔗 Integration | `registerTicketOnChain should log success` | Logging |
| 🔗 Integration | `registerTicketOnChain should re-throw BlockchainError` | Error |
| 🔗 Integration | `registerTicketOnChain should wrap other errors` | Wrapping |
| 🔗 Integration | `close should close client` | Cleanup |
| 🔗 Integration | `close should nullify client` | Cleanup |

---

### 11. Routes

#### `src/routes/admin.ts` - Admin Routes

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `getDashboardStats should query all tenants when null` | Query |
| 🧪 Unit | `getDashboardStats should filter by tenantId` | Filtering |
| 🧪 Unit | `getDashboardStats should return counts` | Counts |
| 🧪 Unit | `getVenueStats should filter by venueId` | Filtering |
| 🧪 Unit | `getVenueStats should calculate successRate` | Calculation |
| 🧪 Unit | `getVenueStats should handle zero total` | Edge case |
| 🔗 Integration | `preHandler should require JWT auth` | Auth |
| 🔗 Integration | `preHandler should require admin role` | Role |
| 🔗 Integration | `GET /admin/dashboard should return stats` | Dashboard |
| 🔗 Integration | `GET /admin/dashboard should filter by tenant` | Tenant filter |
| 🔗 Integration | `POST /admin/batch-mint should validate body` | Validation |
| 🔗 Integration | `POST /admin/batch-mint should call service` | Service call |
| 🔗 Integration | `GET /admin/batch-mint/estimate should return cost` | Estimation |
| 🔗 Integration | `POST /admin/reconcile/:venueId should run reconciliation` | Reconciliation |
| 🔗 Integration | `POST /admin/reconcile/:venueId/fix should fix discrepancies` | Fix |
| 🔗 Integration | `GET /admin/reconcile/:venueId/history should return history` | History |
| 🔗 Integration | `GET /admin/cache/stats should return stats` | Cache stats |
| 🔗 Integration | `DELETE /admin/cache/:ticketId should invalidate` | Invalidation |
| 🔗 Integration | `DELETE /admin/cache/clear should clear all` | Clear |
| 🔗 Integration | `GET /admin/mints should return list` | List |
| 🔗 Integration | `GET /admin/mints/:ticketId should return details` | Details |
| 🔗 Integration | `GET /admin/system/status should return status` | Status |
| 🔗 Integration | `GET /admin/stats/:venueId should return stats` | Stats |

#### `src/routes/bull-board.ts` - Bull Board Routes

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `ENABLE_BULL_BOARD should be true in non-production` | Config |
| 🧪 Unit | `ENABLE_BULL_BOARD should respect env var` | Config |
| 🧪 Unit | `BULL_BOARD_BASE_PATH should be /admin/queues` | Config |
| 🧪 Unit | `getBullBoardStatus should return enabled flag` | Status |
| 🔗 Integration | `should return 404 when disabled` | Disabled |
| 🔗 Integration | `should register plugin when enabled` | Enabled |
| 🔗 Integration | `should serve UI at base path` | UI serving |

#### `src/routes/health.routes.ts` - Legacy Health Routes

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `GET /health should return healthy` | Health |
| 🔗 Integration | `GET /health/full should check database` | DB check |
| 🔗 Integration | `GET /health/full should check Solana` | Solana check |
| 🔗 Integration | `GET /health/full should check wallet` | Wallet check |
| 🔗 Integration | `GET /health/full should check IPFS` | IPFS check |
| 🔗 Integration | `GET /health/full should return degraded status` | Degraded |
| 🔗 Integration | `GET /health/ready should check critical deps` | Ready check |
| 🔗 Integration | `GET /health/live should always return alive` | Liveness |

#### `src/routes/health.ts` - Health Routes

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `startEventLoopMonitoring should measure lag` | Monitoring |
| 🧪 Unit | `startEventLoopMonitoring should update gauge` | Metrics |
| 🧪 Unit | `startEventLoopMonitoring should log high lag` | Warning |
| 🧪 Unit | `stopEventLoopMonitoring should clear interval` | Cleanup |
| 🧪 Unit | `getEventLoopStatus should return lagMs` | Status |
| 🧪 Unit | `getEventLoopStatus should return healthy flag` | Status |
| 🧪 Unit | `getEventLoopStatus should return memory stats` | Memory |
| 🧪 Unit | `verifyHealthAuth should return true without config` | No config |
| 🧪 Unit | `verifyHealthAuth should return false without key` | Missing key |
| 🧪 Unit | `verifyHealthAuth should return false for mismatch` | Invalid key |
| 🧪 Unit | `verifyHealthAuth should return true for match` | Valid key |
| 🧪 Unit | `verifyHealthAuth should use timing-safe comparison` | Security |
| 🧪 Unit | `verifyHealthAuth should accept X-Health-API-Key` | Header |
| 🧪 Unit | `verifyHealthAuth should accept Bearer token` | Header |
| 🧪 Unit | `withTimeout should resolve within timeout` | Success |
| 🧪 Unit | `withTimeout should reject on timeout` | Timeout |
| 🔗 Integration | `GET /health should return ok status` | Health |
| 🔗 Integration | `GET /health should NOT include uptime` | Security |
| 🔗 Integration | `GET /health should NOT include version` | Security |
| 🔗 Integration | `GET /health/startup should check all deps` | Startup |
| 🔗 Integration | `GET /health/startup should return 503 on failure` | Failure |
| 🔗 Integration | `GET /health/detailed should require auth` | Auth |
| 🔗 Integration | `GET /health/detailed should return 401 without key` | Auth |
| 🔗 Integration | `GET /health/detailed should include all components` | Components |
| 🔗 Integration | `GET /health/detailed should include uptime` | Auth only |
| 🔗 Integration | `GET /health/live should always return alive` | Liveness |
| 🔗 Integration | `GET /health/ready should check internal deps` | Ready |
| 🔗 Integration | `GET /health/ready should NOT check Solana` | External |
| 🔗 Integration | `GET /health/solana should return RPC status` | Solana |
| 🌐 E2E | `startup probe should pass with real deps` | Startup |
| 🌐 E2E | `readiness probe should reflect state` | Readiness |
| 🌐 E2E | `Solana endpoint should connect to devnet` | Devnet |

#### `src/routes/internal-mint.ts` - Internal Mint Routes

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `SINGLE_MINT_RATE_LIMIT should be 10/min` | Config |
| 🧪 Unit | `BATCH_MINT_RATE_LIMIT should be 5/min` | Config |
| 🧪 Unit | `STATUS_RATE_LIMIT should be 60/min` | Config |
| 🧪 Unit | `MAX_BATCH_SIZE should be 100` | Constant |
| 🧪 Unit | `MAX_SINGLE_MINT_TICKETS should be 10` | Constant |
| 🔗 Integration | `preHandler should require internal auth` | Auth |
| 🔗 Integration | `preHandler should require JWT auth` | Auth |
| 🔗 Integration | `POST /internal/mint should validate schema` | Validation |
| 🔗 Integration | `POST /internal/mint should reject over max tickets` | Limit |
| 🔗 Integration | `POST /internal/mint should extract tenant from JWT` | Tenant |
| 🔗 Integration | `POST /internal/mint should warn on tenant mismatch` | Warning |
| 🔗 Integration | `POST /internal/mint should mint each ticket` | Minting |
| 🔗 Integration | `POST /internal/mint should collect results` | Results |
| 🔗 Integration | `POST /internal/mint/batch should validate array` | Validation |
| 🔗 Integration | `POST /internal/mint/batch should reject over max` | Limit |
| 🔗 Integration | `POST /internal/mint/batch should process all` | Processing |
| 🔗 Integration | `POST /internal/mint/batch should return summary` | Summary |
| 🔗 Integration | `GET /internal/mint/status/:ticketId should require tenant` | Tenant |
| 🔗 Integration | `GET /internal/mint/status/:ticketId should return status` | Status |
| 🌐 E2E | `should mint via internal endpoint` | Minting |
| 🌐 E2E | `should batch mint multiple tickets` | Batch |

#### `src/routes/metrics.ts` - Metrics Routes

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `GET /metrics should return Prometheus format` | Format |
| 🔗 Integration | `GET /metrics should set Content-Type` | Headers |
| 🔗 Integration | `GET /metrics/json should return JSON` | JSON format |

#### `src/routes/webhook.ts` - Webhook Routes

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `validateWebhookSignature should return false without signature` | Validation |
| 🧪 Unit | `validateWebhookSignature should return false without timestamp` | Validation |
| 🧪 Unit | `validateWebhookSignature should return false without secret` | Validation |
| 🧪 Unit | `validateWebhookSignature should return false for expired` | Expiration |
| 🧪 Unit | `validateWebhookSignature should return false for invalid sig` | Validation |
| 🧪 Unit | `validateWebhookSignature should return true for valid` | Success |
| 🧪 Unit | `validateWebhookSignature should use timing-safe comparison` | Security |
| 🧪 Unit | `validateWebhookSignature should use HMAC-SHA256` | Algorithm |
| 🧪 Unit | `validateStripeSignature should parse signature header` | Parsing |
| 🧪 Unit | `validateStripeSignature should check timestamp` | Timestamp |
| 🧪 Unit | `validateStripeSignature should validate signature` | Validation |
| 🧪 Unit | `validateStripeSignature should use timing-safe comparison` | Security |
| 🔗 Integration | `POST /webhook/payment-complete should use idempotency` | Idempotency |
| 🔗 Integration | `POST /webhook/payment-complete should validate signature` | Validation |
| 🔗 Integration | `POST /webhook/payment-complete should return 401 invalid sig` | Auth |
| 🔗 Integration | `POST /webhook/payment-complete should call PaymentIntegration` | Integration |
| 🔗 Integration | `POST /webhook/payment-complete should mark processed` | Marking |
| 🔗 Integration | `POST /webhook/payment-complete should not mark on failure` | Error handling |
| 🔗 Integration | `POST /webhook/stripe should validate Stripe signature` | Validation |
| 🔗 Integration | `POST /webhook/stripe should handle payment_intent.succeeded` | Event handling |
| 🔗 Integration | `POST /webhook/stripe should handle payment_intent.failed` | Event handling |
| 🔗 Integration | `POST /webhook/stripe should handle checkout.session.completed` | Event handling |
| 🔗 Integration | `GET /webhook/health should return ok` | Health |

---

### 12. Migrations

#### `migrations/20260102_add_check_constraints.ts`

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `up should skip if table not exists` | Guard |
| 🔗 Integration | `up should add status CHECK constraint` | Constraint |
| 🔗 Integration | `up should allow valid status values` | Validation |
| 🔗 Integration | `up should reject invalid status` | Validation |
| 🔗 Integration | `up should add retry_count CHECK` | Constraint |
| 🔗 Integration | `up should allow retry_count 0-10` | Range |
| 🔗 Integration | `up should reject retry_count out of range` | Validation |
| 🔗 Integration | `up should add mint_address CHECK` | Constraint |
| 🔗 Integration | `up should add signature CHECK` | Constraint |
| 🔗 Integration | `up should add metadata_uri CHECK` | Constraint |
| 🔗 Integration | `up should add completed_at consistency CHECK` | Constraint |
| 🔗 Integration | `up should add timestamps CHECK` | Constraint |
| 🔗 Integration | `up should be idempotent` | Idempotency |
| 🔗 Integration | `down should drop all constraints` | Rollback |

#### `migrations/20260102_add_foreign_keys.ts`

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `up should skip if tickets table not exists` | Guard |
| 🔗 Integration | `up should create nft_mints if not exists` | DDL |
| 🔗 Integration | `up should add ticket_id FK` | FK |
| 🔗 Integration | `up should cascade delete` | Cascade |
| 🔗 Integration | `up should cascade update` | Cascade |
| 🔗 Integration | `up should add tenant_id FK if tenants exists` | Conditional FK |
| 🔗 Integration | `up should prevent invalid ticket_id` | Integrity |
| 🔗 Integration | `down should drop FKs` | Rollback |

#### `migrations/20260102_add_rls_policies.ts`

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `up should skip for non-PostgreSQL` | Guard |
| 🔗 Integration | `up should enable RLS` | RLS |
| 🔗 Integration | `up should force RLS for owner` | Security |
| 🔗 Integration | `up should create current_tenant_id function` | Function |
| 🔗 Integration | `up should create is_admin_user function` | Function |
| 🔗 Integration | `up should create SELECT policy` | Policy |
| 🔗 Integration | `up should create INSERT policy` | Policy |
| 🔗 Integration | `up should create UPDATE policy` | Policy |
| 🔗 Integration | `up should create DELETE policy` | Policy |
| 🔗 Integration | `up should grant permissions to minting_app` | Grants |
| 🔗 Integration | `up should create audit table` | Audit |
| 🔗 Integration | `up should create audit trigger` | Trigger |
| 🔗 Integration | `up should be idempotent` | Idempotency |
| 🔗 Integration | `down should drop policies` | Rollback |
| 🔗 Integration | `down should disable RLS` | Rollback |
| 🌐 E2E | `tenant A should not SELECT tenant B` | Isolation |
| 🌐 E2E | `tenant A should not INSERT to tenant B` | Isolation |
| 🌐 E2E | `admin should access all tenants` | Admin bypass |
| 🌐 E2E | `audit log should capture operations` | Audit |

#### `migrations/20260102_create_app_user_role.ts`

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `up should create minting_app role` | Role creation |
| 🔗 Integration | `up should configure role as non-superuser` | Security |
| 🔗 Integration | `up should set connection limit` | Limits |
| 🔗 Integration | `up should grant CONNECT` | Grants |
| 🔗 Integration | `up should grant schema usage` | Grants |
| 🔗 Integration | `up should grant table permissions` | Grants |
| 🔗 Integration | `up should grant sequence permissions` | Grants |
| 🔗 Integration | `up should set default privileges` | Defaults |
| 🔗 Integration | `up should enable row_security` | RLS |
| 🔗 Integration | `up should set statement_timeout` | Timeout |
| 🔗 Integration | `up should set lock_timeout` | Timeout |
| 🔗 Integration | `up should be idempotent` | Idempotency |
| 🔗 Integration | `up should handle permission denied` | Error handling |
| 🔗 Integration | `down should log instructions` | Rollback |

#### `migrations/20260102_migration_best_practices.ts`

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🔗 Integration | `up should set lock_timeout` | Config |
| 🔗 Integration | `up should create pgcrypto extension` | Extension |
| 🔗 Integration | `up should create uuid-ossp extension` | Extension |
| 🔗 Integration | `up should create tenant_id index` | Index |
| 🔗 Integration | `up should create status index` | Index |
| 🔗 Integration | `up should create composite index` | Index |
| 🔗 Integration | `up should create created_at index` | Index |
| 🔗 Integration | `up should create ticket_id index` | Index |
| 🔗 Integration | `up should create asset_id partial index` | Index |
| 🔗 Integration | `up should handle CONCURRENTLY failure` | Error handling |
| 🔗 Integration | `up should reset lock_timeout` | Cleanup |
| 🔗 Integration | `down should drop indexes` | Rollback |

---

## Summary

| Section | Unit | Integration | E2E |
|---------|------|-------------|-----|
| 1. Entry Points | 6 | 56 | 3 |
| 2. Configuration | 45 | 30 | 4 |
| 3. Errors | 55 | 0 | 0 |
|Utilities | 95 | 35 | 2 |
| 5. Models | 16 | 20 | 0 |
| 6. Schemas & Validators | 35 | 0 | 0 |
| 7. Middleware | 75 | 20 | 4 |
| 8. Queues & Workers | 30 | 15 | 3 |
| 9. Jobs | 4 | 10 | 0 |
| 10. Services | 85 | 100 | 12 |
| 11. Routes | 50 | 75 | 8 |
| 12. Migrations | 0 | 76 | 5 |
| Total | 496 | 437 | 41 |


Testing Dependencies
Required Mocks

@solana/web3.js - Connection, PublicKey, Keypair, transaction types
@metaplex-foundation/umi - Umi instance, Bubblegum
pg / knex - PostgreSQL pool and query builder
ioredis - Redis client
bull - Queue and job types
jsonwebtoken - JWT signing/verification
pino - Logger
node-fetch - HTTP requests for IPFS

Required Test Infrastructure

PostgreSQL test instance (or pg-mem)
Redis test instance (or ioredis-mock)
Bull queue test instance
Solana devnet connection for E2E tests
IPFS test gateway (or mock)

Environment Variables for Testing
bashNODE_ENV=test
DATABASE_URL=postgresql://test:test@localhost:5432/minting_test
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=test-secret-minimum-32-characters-long
INTERNAL_SERVICE_SECRET=test-internal-secret-32-chars-min
WEBHOOK_SECRET=test-webhook-secret-32-chars-minimum
SOLANA_RPC_URL=https://api.devnet.solana.com
WALLET_PATH=./test-wallet.json
PINATA_JWT=test-pinata-jwt
MIN_SOL_BALANCE=0.01
MINTING_SERVICE_PORT=3018
```

---

## Test File Structure
```
tests/
├── unit/
│   ├── config/
│   │   ├── database.test.ts
│   │   ├── redis.test.ts
│   │   ├── solana.test.ts
│   │   └── secrets.test.ts
│   ├── errors/
│   │   └── index.test.ts
│   ├── utils/
│   │   ├── logger.test.ts
│   │   ├── circuit-breaker.test.ts
│   │   ├── distributed-lock.test.ts
│   │   ├── metrics.test.ts
│   │   ├── solana.test.ts
│   │   └── spending-limits.test.ts
│   ├── models/
│   │   ├── Collection.test.ts
│   │   ├── Mint.test.ts
│   │   └── NFT.test.ts
│   ├── schemas/
│   │   └── mint.schemas.test.ts
│   ├── middleware/
│   │   ├── admin-auth.test.ts
│   │   ├── internal-auth.test.ts
│   │   ├── load-shedding.test.ts
│   │   ├── tenant-context.test.ts
│   │   └── webhook-idempotency.test.ts
│   ├── queues/
│   │   └── mintQueue.test.ts
│   ├── workers/
│   │   └── mintingWorker.test.ts
│   └── services/
│       ├── BalanceMonitor.test.ts
│       ├── BatchMintingService.test.ts
│       ├── DASClient.test.ts
│       ├── MetadataCache.test.ts
│       ├── MetadataService.test.ts
│       ├── MintingOrchestrator.test.ts
│       └── RealCompressedNFT.test.ts
├── integration/
│   ├── config/
│   │   ├── database.integration.test.ts
│   │   ├── redis.integration.test.ts
│   │   └── solana.integration.test.ts
│   ├── middleware/
│   │   ├── auth.integration.test.ts
│   │   └── tenant-context.integration.test.ts
│   ├── queues/
│   │   └── mintQueue.integration.test.ts
│   ├── services/
│   │   ├── MintingOrchestrator.integration.test.ts
│   │   └── ReconciliationService.integration.test.ts
│   ├── routes/
│   │   ├── admin.integration.test.ts
│   │   ├── health.integration.test.ts
│   │   ├── internal-mint.integration.test.ts
│   │   └── webhook.integration.test.ts
│   └── migrations/
│       ├── check-constraints.integration.test.ts
│       ├── foreign-keys.integration.test.ts
│       └── rls-policies.integration.test.ts
├── e2e/
│   ├── minting.e2e.test.ts
│   ├── health.e2e.test.ts
│   ├── tenant-isolation.e2e.test.ts
│   └── graceful-shutdown.e2e.test.ts
├── fixtures/
│   ├── tickets.ts
│   ├── tenants.ts
│   ├── mints.ts
│   └── wallets.ts
├── mocks/
│   ├── solana.ts
│   ├── ipfs.ts
│   ├── redis.ts
│   └── database.ts
└── helpers/
    ├── database.ts
    ├── queue.ts
    ├── auth.ts
    └── setup.ts