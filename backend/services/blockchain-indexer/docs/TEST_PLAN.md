# Blockchain Indexer Service - Test Plan

---

## Test Categories

| Category | Count | Priority |
|----------|-------|----------|
| Unit Tests | ~1,439 | High |
| Integration Tests | ~146 | High |
| E2E Tests | ~59 | Medium |

---

## Critical Issues to Address

Before testing, these critical issues from audit findings should be verified as resolved:

| Issue | Severity | Impact on Testing |
|-------|----------|-------------------|
| JWT algorithm whitelist (SEC-4) - must enforce RS256/HS256, reject `none` | 🔴 Critical | Auth tests must verify algorithm restriction |
| JWT issuer/audience validation (S2S-4/S2S-5) - validate iss and aud claims | 🔴 Critical | Auth tests must verify claim validation |
| Tenant context enforcement (MT-1/SEC-1) - no default tenant fallback | 🔴 Critical | Multi-tenancy tests must verify rejection without tenant |
| MongoDB write error handling (ERR-1/DB-1) - don't swallow write errors | 🔴 Critical | Transaction processor tests must verify error propagation |
| RPC failover (ERR-7/GD-2/EXT-1) - handle Solana RPC failures | 🔴 Critical | Indexer tests must verify failover behavior |
| Distributed locking (IDP-2/IDP-3) - prevent duplicate processing | 🔴 Critical | Transaction tests must verify lock acquisition |
| PII sanitization in logs (LOG-1/LOG-2/LOG-4/LOG-5) - redact sensitive data | 🔴 High | Logger tests must verify no secrets in output |
| Redis-backed rate limiting (SEC-6/RL-1/RL-2) - distributed rate limits | 🔴 High | Rate limit tests require Redis mock |
| Circuit breaker states (S2S-9/ERR-13) - external service failure handling | 🟠 Medium | RPC/database failure simulation |
| Base58 input validation (INP-2) - validate Solana addresses/signatures | 🟠 Medium | Schema tests must verify pattern matching |
| Bounded pagination (INP-3) - prevent DoS via large offset | 🟠 Medium | Query route tests must verify max offset |
| Config validation (CFG-2/CFG-3) - Zod schema validation | 🟠 Medium | Config tests must verify all env vars validated |
| Graceful shutdown (GD-5) - complete in-flight jobs | 🟠 Medium | Shutdown tests must verify job completion |

---

## File-by-File Test Specifications

### 1. Entry Points

#### `src/index.ts` - Server Entry Point

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should load dotenv config` | Environment variables loaded |
| 🧪 Unit | `should call validateConfigOrExit on startup` | Config validation runs |
| 🧪 Unit | `should log configuration summary` | Startup logging with getConfigSummary |
| 🧪 Unit | `should call testAllConnections before starting` | Connection testing |
| 🧪 Unit | `should warn if some connections fail` | Non-fatal connection failures |
| 🔗 Integration | `should connect to MongoDB on startup` | MongoDB connection |
| 🔗 Integration | `should initialize BlockchainIndexer` | Indexer initialization |
| 🧪 Unit | `should throw if indexer fails to initialize` | Initialization failure handling |
| 🔗 Integration | `should start indexer after initialization` | Indexer startup |
| 🔗 Integration | `should create Fastify instance with correct options` | App instantiation |
| 🔗 Integration | `should register helmet with HSTS enabled` | Security headers |
| 🔗 Integration | `should register CORS plugin` | CORS configuration |
| 🔗 Integration | `should register rate limit plugin` | Rate limiting |
| 🧪 Unit | `should skip tenant context for public paths` | Public path bypass |
| 🧪 Unit | `should call setTenantContext for protected paths` | Tenant middleware |
| 🧪 Unit | `should return 401 when tenant context fails` | Tenant error handling |
| 🧪 Unit | `should log tenant context errors` | Error logging |
| 🔗 Integration | `should register query routes` | Route mounting |
| 🔗 Integration | `should register health endpoint` | Health endpoint |
| 🔗 Integration | `should register info endpoint` | Info endpoint |
| 🔗 Integration | `should register metrics endpoint` | Metrics endpoint |
| 🧪 Unit | `should check METRICS_AUTH_TOKEN if configured` | Metrics auth |
| 🧪 Unit | `should allow internal IPs without metrics auth` | Internal IP bypass |
| 🧪 Unit | `should return 401 for missing metrics auth` | Auth enforcement |
| 🧪 Unit | `should return 403 for invalid metrics token` | Invalid token rejection |
| 🧪 Unit | `should set 404 handler with RFC 7807 format` | Not found handling |
| 🧪 Unit | `should set error handler with RFC 7807 format` | Error handling |
| 🧪 Unit | `should add Retry-After header for 429 errors` | Rate limit headers |
| 🔗 Integration | `should listen on configured PORT and HOST` | Server binding |
| 🔗 Integration | `should handle SIGTERM with graceful shutdown` | Clean shutdown |
| 🔗 Integration | `should handle SIGINT with graceful shutdown` | Clean shutdown |
| 🧪 Unit | `should close Fastify app on shutdown` | App cleanup |
| 🧪 Unit | `should stop cache metrics on shutdown` | Cache cleanup |
| 🧪 Unit | `should shutdown job tracker on shutdown` | Job cleanup |
| 🧪 Unit | `should stop indexer on shutdown` | Indexer cleanup |
| 🧪 Unit | `should disconnect MongoDB on shutdown` | DB cleanup |
| 🧪 Unit | `should log unhandledRejection errors` | Promise rejection handling |
| 🧪 Unit | `should exit in development on unhandledRejection` | Dev mode exit |
| 🧪 Unit | `should continue in production on unhandledRejection` | Prod mode continue |
| 🧪 Unit | `should exit on uncaughtException after delay` | Exception handling |

#### `src/indexer.ts` - Main Blockchain Indexer

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should create RPCFailoverManager with multiple endpoints` | Failover setup |
| 🧪 Unit | `should create RPCFailoverManager with single endpoint` | Single RPC fallback |
| 🧪 Unit | `should create direct Connection for WebSocket` | WS connection |
| 🧪 Unit | `should set programId from config` | Program ID setup |
| 🧪 Unit | `should initialize lastProcessedSlot to 0` | Initial state |
| 🧪 Unit | `should initialize isRunning to false` | Initial state |
| 🧪 Unit | `should use default polling interval of 5000ms` | Default config |
| 🧪 Unit | `should use default batch size of 10` | Default config |
| 🧪 Unit | `should accept custom polling config` | Custom config |
| 🧪 Unit | `should create TransactionProcessor` | Processor creation |
| 🔗 Integration | `initialize should query indexer_state` | State loading |
| 🧪 Unit | `initialize should resume from saved slot` | State resume |
| 🧪 Unit | `initialize should resume from saved signature` | State resume |
| 🧪 Unit | `initialize should create new state if none exists` | First run |
| 🧪 Unit | `initialize should get current slot via failover` | RPC failover |
| 🧪 Unit | `initialize should calculate lag` | Lag calculation |
| 🧪 Unit | `initialize should set indexerLag metric` | Metrics |
| 🧪 Unit | `initialize should return true on success` | Success case |
| 🧪 Unit | `initialize should return false on error` | Error case |
| 🧪 Unit | `start should return early if already running` | Duplicate start |
| 🧪 Unit | `start should set isRunning to true` | State change |
| 🧪 Unit | `start should record startTime` | Timing |
| 🔗 Integration | `start should update indexer_state in database` | State persistence |
| 🧪 Unit | `start should warn if lag exceeds 1000` | Lag warning |
| 🧪 Unit | `start should call startRealtimeIndexing` | Indexing start |
| 🧪 Unit | `stop should set isRunning to false` | State change |
| 🧪 Unit | `stop should clear polling timer` | Timer cleanup |
| 🧪 Unit | `stop should wait for pollingInProgress to complete` | Graceful stop |
| 🧪 Unit | `stop should remove WebSocket subscription` | WS cleanup |
| 🧪 Unit | `stop should stop RPC manager` | RPC cleanup |
| 🔗 Integration | `stop should update indexer_state in database` | State persistence |
| 🧪 Unit | `startRealtimeIndexing should return early without programId` | No program skip |
| 🧪 Unit | `startRealtimeIndexing should subscribe to program changes` | WS subscription |
| 🧪 Unit | `startRealtimeIndexing should call startPolling` | Polling start |
| 🧪 Unit | `startPolling should skip if not running` | Guard check |
| 🧪 Unit | `startPolling should skip if pollingInProgress` | Overlap protection |
| 🧪 Unit | `startPolling should set pollingInProgress true` | Flag set |
| 🧪 Unit | `startPolling should reset pollingInProgress in finally` | Flag reset |
| 🧪 Unit | `pollRecentTransactions should return early without programId` | Guard check |
| 🧪 Unit | `pollRecentTransactions should use RPC failover for signatures` | Failover |
| 🧪 Unit | `pollRecentTransactions should record rpcCallDuration metric` | Metrics |
| 🧪 Unit | `pollRecentTransactions should process each signature` | Processing |
| 🧪 Unit | `pollRecentTransactions should increment processed on success` | Counter |
| 🧪 Unit | `pollRecentTransactions should increment failed on error` | Counter |
| 🧪 Unit | `pollRecentTransactions should update lastProcessedSlot` | State update |
| 🧪 Unit | `pollRecentTransactions should call saveProgress` | Persistence |
| 🧪 Unit | `pollRecentTransactions should update currentSlot via failover` | Failover |
| 🧪 Unit | `pollRecentTransactions should calculate and set lag metric` | Metrics |
| 🧪 Unit | `processSlot should use RPC failover for getBlock` | Failover |
| 🧪 Unit | `processSlot should return early if no block` | Guard check |
| 🧪 Unit | `processSlot should skip failed transactions` | Error filter |
| 🧪 Unit | `processSlot should process each transaction` | Processing |
| 🔗 Integration | `saveProgress should update indexer_state` | State persistence |
| 🧪 Unit | `getRpcStatus should return rpcManager status` | Status retrieval |
| 🌐 E2E | `should process real transactions end-to-end` | Full flow |
| 🌐 E2E | `should recover state after restart` | Recovery |

#### `src/api/server.ts` - Indexer API Server

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should create Fastify instance` | App creation |
| 🧪 Unit | `should store indexer reference` | Dependency injection |
| 🧪 Unit | `should store reconciliation reference` | Dependency injection |
| 🧪 Unit | `should use default port 3456` | Default config |
| 🧪 Unit | `should accept custom port` | Custom config |
| 🧪 Unit | `setupMiddleware should add onRequest hook` | Middleware setup |
| 🧪 Unit | `setupMiddleware should log method and path` | Request logging |
| 🧪 Unit | `GET /health should return 200 when healthy` | Health check pass |
| 🧪 Unit | `GET /health should return 503 when unhealthy` | Health check fail |
| 🧪 Unit | `GET /health should call getHealth` | Health delegation |
| 🧪 Unit | `GET /metrics should set Content-Type header` | Metrics headers |
| 🧪 Unit | `GET /metrics should return Prometheus metrics` | Metrics output |
| 🧪 Unit | `GET /stats should call getStats` | Stats delegation |
| 🧪 Unit | `GET /recent-activity should call getRecentActivity` | Activity delegation |
| 🧪 Unit | `GET /reconciliation/status should call getReconciliationStatus` | Status delegation |
| 🧪 Unit | `POST /reconciliation/run should trigger manual reconciliation` | Manual trigger |
| 🧪 Unit | `POST /reconciliation/run should return result` | Result return |
| 🧪 Unit | `POST /control/stop should call indexer.stop` | Control action |
| 🧪 Unit | `POST /control/start should call indexer.start` | Control action |
| 🧪 Unit | `getHealth should check database with SELECT 1` | DB health |
| 🧪 Unit | `getHealth should query indexer_state with explicit columns` | Explicit columns |
| 🧪 Unit | `getHealth should set indexer status from is_running` | Status mapping |
| 🧪 Unit | `getHealth should include lag from syncStats` | Lag reporting |
| 🧪 Unit | `getHealth should mark lagging when lag exceeds 10000` | Lag threshold |
| 🧪 Unit | `getStats should query indexer_state with explicit columns` | Explicit columns |
| 🧪 Unit | `getStats should query transaction count` | Stats query |
| 🧪 Unit | `getStats should query recent transactions by type` | Type breakdown |
| 🧪 Unit | `getRecentActivity should query last hour of transactions` | Time filter |
| 🧪 Unit | `getRecentActivity should group by instruction_type` | Grouping |
| 🧪 Unit | `getReconciliationStatus should query with explicit columns` | Explicit columns |
| 🧪 Unit | `getReconciliationStatus should return unresolved discrepancies` | Discrepancy query |
| 🔗 Integration | `start should listen on port and host` | Server binding |
| 🔗 Integration | `stop should close Fastify app` | Server cleanup |

---

### 2. Configuration

#### `src/config/index.ts` - Main Configuration

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should export config object` | Export check |
| 🧪 Unit | `should read DATABASE_URL from env` | Env reading |
| 🧪 Unit | `should read MONGODB_URL from env` | Env reading |
| 🧪 Unit | `should read REDIS_URL from env` | Env reading |
| 🧪 Unit | `should read SOLANA_RPC_URL from env` | Env reading |
| 🧪 Unit | `should use default port 3012` | Default value |
| 🧪 Unit | `should parse PORT as integer` | Type parsing |
| 🧪 Unit | `should handle invalid PORT` | Error handling |

#### `src/config/mongodb.ts` - MongoDB Connection

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should use default MONGODB_URL` | Default value |
| 🧪 Unit | `should read MONGODB_URL from env` | Env override |
| 🔗 Integration | `connectMongoDB should establish connection` | Connection success |
| 🔗 Integration | `connectMongoDB should handle connection failure` | Connection failure |
| 🔗 Integration | `disconnectMongoDB should close connection` | Cleanup |
| 🧪 Unit | `should not reconnect if already connected` | Connection reuse |

#### `src/config/secrets.ts` - Secrets Manager

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should use correct service name` | Service identification |
| 🧪 Unit | `should request correct secrets` | Secret list |
| 🧪 Unit | `should log secret loading` | Logging |
| 🧪 Unit | `should handle missing secrets` | Error handling |
| 🔗 Integration | `should integrate with secrets manager` | Real secrets manager |

#### `src/config/validate.ts` - Configuration Validation

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `DatabaseConfigSchema should require DATABASE_URL` | Required field |
| 🧪 Unit | `DatabaseConfigSchema should validate URL format` | Format validation |
| 🧪 Unit | `DatabaseConfigSchema should accept valid pool size` | Pool size |
| 🧪 Unit | `DatabaseConfigSchema should reject invalid pool size` | Validation |
| 🧪 Unit | `MongoConfigSchema should require MONGODB_URL` | Required field |
| 🧪 Unit | `MongoConfigSchema should validate URL format` | Format validation |
| 🧪 Unit | `RedisConfigSchema should validate host` | Host validation |
| 🧪 Unit | `RedisConfigSchema should validate port range` | Port validation |
| 🧪 Unit | `SolanaConfigSchema should require rpcUrl` | Required field |
| 🧪 Unit | `SolanaConfigSchema should validate commitment levels` | Enum validation |
| 🧪 Unit | `AuthConfigSchema should require JWT_SECRET` | Required field |
| 🧪 Unit | `AuthConfigSchema should enforce minimum secret length` | Length check |
| 🧪 Unit | `AuthConfigSchema should reject weak secrets in prod` | Security check |
| 🧪 Unit | `RateLimitConfigSchema should validate max requests` | Range validation |
| 🧪 Unit | `IndexerConfigSchema should validate polling interval` | Range validation |
| 🧪 Unit | `IndexerConfigSchema should validate batch size` | Range validation |
| 🧪 Unit | `ServerConfigSchema should validate port range` | Port validation |
| 🧪 Unit | `LoggingConfigSchema should validate log levels` | Enum validation |
| 🧪 Unit | `safeParseInt should return number for valid input` | Parsing |
| 🧪 Unit | `safeParseInt should return default for NaN` | Fallback |
| 🧪 Unit | `safeParseInt should return default for undefined` | Fallback |
| 🧪 Unit | `safeParseBool should return true for 'true'` | Parsing |
| 🧪 Unit | `safeParseBool should return false for 'false'` | Parsing |
| 🧪 Unit | `safeParseBool should be case insensitive` | Flexibility |
| 🧪 Unit | `buildConfigFromEnv should build complete config` | Config building |
| 🧪 Unit | `validateRequiredEnvVars should return missing vars` | Validation |
| 🧪 Unit | `validateRequiredEnvVars should return empty for complete` | Success case |
| 🧪 Unit | `validateConfigOrExit should exit on invalid config` | Exit on failure |
| 🧪 Unit | `validateConfigOrExit should return on valid config` | Success case |
| 🧪 Unit | `getConfigSummary should mask sensitive values` | Security |
| 🧪 Unit | `getConfigSummary should show partial DATABASE_URL` | Partial reveal |
| 🔗 Integration | `testAllConnections should test PostgreSQL` | DB test |
| 🔗 Integration | `testAllConnections should test MongoDB` | Mongo test |
| 🔗 Integration | `testAllConnections should test Redis` | Redis test |
| 🔗 Integration | `testAllConnections should return false if any fail` | Aggregation |

---

### 3. Errors

#### `src/errors/index.ts` - Error Classes

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `ErrorCode enum should have unique values` | Enum uniqueness |
| 🧪 Unit | `BaseError should set name property` | Error name |
| 🧪 Unit | `BaseError should set message property` | Error message |
| 🧪 Unit | `BaseError should set statusCode property` | Status code |
| 🧪 Unit | `BaseError should set code property` | Error code |
| 🧪 Unit | `BaseError should capture stack trace` | Stack trace |
| 🧪 Unit | `BaseError.toProblemDetails should return RFC 7807 format` | Format compliance |
| 🧪 Unit | `BaseError.toProblemDetails should include type URI` | Type field |
| 🧪 Unit | `BaseError.toProblemDetails should include title` | Title field |
| 🧪 Unit | `BaseError.toProblemDetails should include status` | Status field |
| 🧪 Unit | `BaseError.toProblemDetails should include detail` | Detail field |
| 🧪 Unit | `BaseError.toProblemDetails should include instance` | Instance field |
| 🧪 Unit | `BaseError.toProblemDetails should include timestamp` | Timestamp field |
| 🧪 Unit | `BaseError.toJSON should serialize correctly` | Serialization |
| 🧪 Unit | `IndexerError should extend BaseError` | Inheritance |
| 🧪 Unit | `IndexerError.slotProcessingFailed should create correct error` | Factory method |
| 🧪 Unit | `IndexerError.transactionParsingFailed should create correct error` | Factory method |
| 🧪 Unit | `SolanaError should extend BaseError` | Inheritance |
| 🧪 Unit | `SolanaError.rpcError should create correct error` | Factory method |
| 🧪 Unit | `SolanaError.connectionFailed should create correct error` | Factory method |
| 🧪 Unit | `SolanaError.transactionNotFound should create correct error` | Factory method |
| 🧪 Unit | `DatabaseError should extend BaseError` | Inheritance |
| 🧪 Unit | `DatabaseError.connectionFailed should create correct error` | Factory method |
| 🧪 Unit | `DatabaseError.queryFailed should create correct error` | Factory method |
| 🧪 Unit | `DatabaseError.transactionFailed should create correct error` | Factory method |
| 🧪 Unit | `ValidationError should extend BaseError` | Inheritance |
| 🧪 Unit | `ValidationError should have statusCode 400` | Status code |
| 🧪 Unit | `ValidationError.invalidInput should create correct error` | Factory method |
| 🧪 Unit | `ValidationError.invalidSignature should create correct error` | Factory method |
| 🧪 Unit | `ValidationError.invalidAddress should create correct error` | Factory method |
| 🧪 Unit | `TenantError should extend BaseError` | Inheritance |
| 🧪 Unit | `TenantError.missingTenant should create correct error` | Factory method |
| 🧪 Unit | `TenantError.invalidTenant should create correct error` | Factory method |
| 🧪 Unit | `AuthenticationError should extend BaseError` | Inheritance |
| 🧪 Unit | `AuthenticationError should have statusCode 401` | Status code |
| 🧪 Unit | `AuthenticationError.missingToken should create correct error` | Factory method |
| 🧪 Unit | `AuthenticationError.invalidToken should create correct error` | Factory method |
| 🧪 Unit | `AuthenticationError.tokenExpired should create correct error` | Factory method |
| 🧪 Unit | `AuthenticationError.insufficientPermissions should have 403` | Status code |
| 🧪 Unit | `RateLimitError should extend BaseError` | Inheritance |
| 🧪 Unit | `RateLimitError should have statusCode 429` | Status code |
| 🧪 Unit | `RateLimitError.forTenant should include retryAfter` | Retry info |
| 🧪 Unit | `NotFoundError should extend BaseError` | Inheritance |
| 🧪 Unit | `NotFoundError should have statusCode 404` | Status code |
| 🧪 Unit | `isBaseError should return true for BaseError instances` | Type guard |
| 🧪 Unit | `isBaseError should return false for plain Error` | Type guard |
| 🧪 Unit | `isOperationalError should identify operational errors` | Type guard |
| 🧪 Unit | `toProblemDetails should handle BaseError` | Conversion |
| 🧪 Unit | `toProblemDetails should handle plain Error` | Conversion |
| 🧪 Unit | `toProblemDetails should handle unknown error` | Conversion |

---

### 4. Utilities

#### `src/utils/logger.ts` - Pino Logger

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should detect sensitive field 'password'` | Field detection |
| 🧪 Unit | `should detect sensitive field 'apiKey'` | Field detection |
| 🧪 Unit | `should detect sensitive field case-insensitively` | Case handling |
| 🧪 Unit | `should detect JWT pattern in values` | Pattern detection |
| 🧪 Unit | `should detect email pattern in values` | Pattern detection |
| 🧪 Unit | `should detect Solana key pattern in values` | Pattern detection |
| 🧪 Unit | `should detect API key pattern in values` | Pattern detection |
| 🧪 Unit | `sanitizeValue should redact sensitive strings` | Value sanitization |
| 🧪 Unit | `sanitizeValue should pass through safe values` | Safe values |
| 🧪 Unit | `sanitizeObject should redact sensitive fields` | Object sanitization |
| 🧪 Unit | `sanitizeObject should handle nested objects` | Deep sanitization |
| 🧪 Unit | `sanitizeObject should respect max depth` | Depth limit |
| 🧪 Unit | `sanitizeObject should handle arrays` | Array handling |
| 🧪 Unit | `createRequestLogger should include requestId` | Context |
| 🧪 Unit | `createRequestLogger should include method` | Context |
| 🧪 Unit | `createRequestLogger should include path` | Context |
| 🧪 Unit | `createJobLogger should include jobId` | Context |
| 🧪 Unit | `createTransactionLogger should include signature` | Context |
| 🧪 Unit | `createRpcLogger should include endpoint` | Context |
| 🧪 Unit | `logSecurityEvent should log with security flag` | Security logging |
| 🔗 Integration | `should output valid JSON format` | Output format |
| 🔗 Integration | `should use pretty print in development` | Dev mode |
| 🔗 Integration | `should redact configured paths` | Redaction |

#### `src/utils/redis.ts` - Redis Client

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should use default host localhost` | Default config |
| 🧪 Unit | `should use default port 6379` | Default config |
| 🧪 Unit | `should read REDIS_HOST from env` | Env override |
| 🧪 Unit | `should read REDIS_PORT from env` | Env override |
| 🧪 Unit | `should include password when REDIS_PASSWORD set` | Auth config |
| 🧪 Unit | `should configure retry strategy` | Retry config |
| 🔗 Integration | `should connect to Redis` | Connection |
| 🔗 Integration | `should handle connection errors` | Error handling |
| 🔗 Integration | `should reconnect on disconnect` | Reconnection |

#### `src/utils/cache.ts` - Cache Manager

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `CacheManager.get should return cached value` | Get operation |
| 🧪 Unit | `CacheManager.get should return null for missing key` | Cache miss |
| 🧪 Unit | `CacheManager.set should store value with TTL` | Set operation |
| 🧪 Unit | `CacheManager.del should remove key` | Delete operation |
| 🧪 Unit | `CacheManager.delPattern should remove matching keys` | Pattern delete |
| 🧪 Unit | `CacheManager.exists should return true for existing key` | Existence check |
| 🧪 Unit | `CacheManager.exists should return false for missing key` | Existence check |
| 🧪 Unit | `CacheManager.getOrSet should return cached value` | Cache hit |
| 🧪 Unit | `CacheManager.getOrSet should call factory on miss` | Cache miss |
| 🧪 Unit | `CacheManager.getOrSet should cache factory result` | Set on miss |
| 🧪 Unit | `CacheManager.incr should increment counter` | Increment |
| 🧪 Unit | `CacheManager.mget should return multiple values` | Multi get |
| 🧪 Unit | `CacheManager.mset should store multiple values` | Multi set |
| 🧪 Unit | `CacheManager.getStats should return cache statistics` | Stats |
| 🧪 Unit | `initializeCache should create singleton` | Singleton |
| 🧪 Unit | `getCache should return existing instance` | Singleton |
| 🧪 Unit | `getCache should throw if not initialized` | Guard |
| 🧪 Unit | `CacheKeys.transaction should include tenantId` | Key format |
| 🧪 Unit | `CacheKeys.walletActivity should include tenantId` | Key format |
| 🧪 Unit | `CacheInvalidation.onTransactionProcessed should clear keys` | Invalidation |
| 🧪 Unit | `CacheInvalidation.onWalletActivityChanged should clear keys` | Invalidation |
| 🧪 Unit | `CacheWarming.warmSyncStatus should pre-populate cache` | Warming |
| 🧪 Unit | `updateCacheMetrics should update Prometheus metrics` | Metrics |
| 🔗 Integration | `should perform full cache cycle` | Full cycle |
| 🔗 Integration | `should delete by pattern` | Pattern delete |
| 🔗 Integration | `should handle TTL expiration` | Expiration |
| 🌐 E2E | `should improve response time on cache hit` | Performance |
| 🌐 E2E | `should invalidate on data change` | Invalidation |

#### `src/utils/database.ts` - PostgreSQL Database

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `validateDatabaseConfig should require DATABASE_URL` | Validation |
| 🧪 Unit | `getSSLConfig should return false in development` | Dev config |
| 🧪 Unit | `getSSLConfig should return SSL object in production` | Prod config |
| 🧪 Unit | `query should execute SQL and return result` | Query execution |
| 🧪 Unit | `query should apply timeout when provided` | Timeout |
| 🧪 Unit | `query should log slow queries over threshold` | Slow query log |
| 🧪 Unit | `query should wrap errors in DatabaseError` | Error wrapping |
| 🧪 Unit | `withTransaction should begin transaction` | Transaction start |
| 🧪 Unit | `withTransaction should commit on success` | Commit |
| 🧪 Unit | `withTransaction should rollback on error` | Rollback |
| 🧪 Unit | `withTransaction should always release client` | Cleanup |
| 🧪 Unit | `withTenantContext should validate UUID format` | UUID validation |
| 🧪 Unit | `withTenantContext should set RLS context` | RLS setup |
| 🧪 Unit | `withTenantContext should reject invalid tenant ID` | Rejection |
| 🧪 Unit | `getDatabaseHealth should return healthy status` | Health check |
| 🧪 Unit | `closeDatabase should end pool gracefully` | Cleanup |
| 🔗 Integration | `should connect to PostgreSQL` | Connection |
| 🔗 Integration | `should execute transaction with commit` | Transaction |
| 🔗 Integration | `should execute transaction with rollback` | Rollback |
| 🔗 Integration | `should set RLS tenant context` | RLS |
| 🌐 E2E | `should return database health in health endpoint` | Health |
| 🌐 E2E | `should handle concurrent queries` | Concurrency |

#### `src/utils/circuit-breaker.ts` - Circuit Breaker

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `constructor should initialize in CLOSED state` | Initial state |
| 🧪 Unit | `execute should call function when CLOSED` | Normal operation |
| 🧪 Unit | `execute should throw when OPEN` | Open rejection |
| 🧪 Unit | `execute should allow single call in HALF_OPEN` | Half-open test |
| 🧪 Unit | `execute should transition to OPEN on failure threshold` | State transition |
| 🧪 Unit | `execute should transition to HALF_OPEN after timeout` | Recovery |
| 🧪 Unit | `execute should transition to CLOSED on success in HALF_OPEN` | Recovery success |
| 🧪 Unit | `executeWithTimeout should respect timeout` | Timeout |
| 🧪 Unit | `executeWithTimeout should count timeout as failure` | Timeout failure |
| 🧪 Unit | `getMetrics should return failure count` | Metrics |
| 🧪 Unit | `getMetrics should return success count` | Metrics |
| 🧪 Unit | `getState should return current state` | State access |
| 🧪 Unit | `forceState should change state` | Force transition |
| 🧪 Unit | `reset should clear counters and close` | Reset |
| 🧪 Unit | `CircuitBreakerOpenError should have correct message` | Error class |
| 🧪 Unit | `getCircuitBreaker should return or create breaker` | Registry |
| 🧪 Unit | `getAllCircuitBreakerMetrics should return all metrics` | Registry |
| 🧪 Unit | `solanaRpcBreaker should have correct config` | Pre-configured |
| 🧪 Unit | `mongoBreaker should have correct config` | Pre-configured |
| 🧪 Unit | `postgresBreaker should have correct config` | Pre-configured |
| 🔗 Integration | `should complete full state cycle` | Full cycle |
| 🔗 Integration | `should handle concurrent calls` | Concurrency |
| 🌐 E2E | `should protect RPC calls from failures` | Protection |
| 🌐 E2E | `should show status in health endpoint` | Health |

#### `src/utils/distributed-lock.ts` - Distributed Locking

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `acquire should obtain lock` | Lock acquisition |
| 🧪 Unit | `acquire should retry on failure` | Retry logic |
| 🧪 Unit | `acquire should return false after max retries` | Retry limit |
| 🧪 Unit | `acquire should set TTL on lock` | TTL |
| 🧪 Unit | `release should remove lock` | Release |
| 🧪 Unit | `release should use Lua script for atomicity` | Atomic release |
| 🧪 Unit | `release should only release own lock` | Ownership |
| 🧪 Unit | `extend should increase TTL` | Extension |
| 🧪 Unit | `isLocked should return true when locked` | Status check |
| 🧪 Unit | `isLocked should return false when unlocked` | Status check |
| 🧪 Unit | `withLock should execute function with lock` | Helper |
| 🧪 Unit | `withLock should release lock after success` | Cleanup |
| 🧪 Unit | `withLock should release lock after error` | Cleanup |
| 🧪 Unit | `transactionLockKey should format correctly` | Key format |
| 🧪 Unit | `slotLockKey should format correctly` | Key format |
| 🧪 Unit | `initializeLockManager should create singleton` | Singleton |
| 🧪 Unit | `getLockManager should return instance` | Singleton |
| 🔗 Integration | `should prevent concurrent access` | Mutual exclusion |
| 🔗 Integration | `should auto-expire locks` | Expiration |
| 🔗 Integration | `should atomically release` | Atomic release |
| 🌐 E2E | `transaction processing should use locks` | TX locking |
| 🌐 E2E | `slot processing should use locks` | Slot locking |

#### `src/utils/retry.ts` - Retry with Backoff

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `retry should return on success` | Success case |
| 🧪 Unit | `retry should retry on failure` | Retry |
| 🧪 Unit | `retry should respect maxRetries` | Limit |
| 🧪 Unit | `retry should calculate exponential backoff` | Backoff |
| 🧪 Unit | `retry should add jitter` | Jitter |
| 🧪 Unit | `retry should use shouldRetry callback` | Conditional retry |
| 🧪 Unit | `retry should detect rate limiting` | Rate limit detection |
| 🧪 Unit | `retry should respect Retry-After header` | Header respect |
| 🧪 Unit | `retryWithResult should return success result` | Result wrapper |
| 🧪 Unit | `retryWithResult should return failure result` | Result wrapper |
| 🧪 Unit | `retryWithResult should include attempt count` | Attempt tracking |
| 🧪 Unit | `withRetry should wrap function` | Wrapper |
| 🧪 Unit | `calculateBackoff should use exponential formula` | Calculation |
| 🧪 Unit | `solanaRpcRetry should have correct config` | Pre-configured |
| 🧪 Unit | `databaseRetry should have correct config` | Pre-configured |
| 🔗 Integration | `should wait correct delay between retries` | Timing |
| 🔗 Integration | `should complete full retry cycle` | Full cycle |

#### `src/utils/rpcFailover.ts` - RPC Failover Manager

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `constructor should accept multiple endpoints` | Multi-endpoint |
| 🧪 Unit | `constructor should create circuit breaker per endpoint` | Circuit breakers |
| 🧪 Unit | `constructor should start health checks` | Health checks |
| 🧪 Unit | `getConnection should return current connection` | Connection access |
| 🧪 Unit | `executeWithFailover should try primary first` | Primary first |
| 🧪 Unit | `executeWithFailover should failover on error` | Failover |
| 🧪 Unit | `executeWithFailover should try all endpoints` | Full failover |
| 🧪 Unit | `executeWithFailover should throw after all fail` | Complete failure |
| 🧪 Unit | `failoverToNext should switch endpoint` | Endpoint switch |
| 🧪 Unit | `failoverToNext should wrap around` | Wrap around |
| 🧪 Unit | `getCurrentEndpoint should return active endpoint` | Status |
| 🧪 Unit | `stop should clear health check interval` | Cleanup |
| 🧪 Unit | `getStatus should return all endpoint status` | Status |
| 🔗 Integration | `should failover to secondary endpoint` | Failover |
| 🔗 Integration | `should recover to primary when healthy` | Recovery |
| 🔗 Integration | `should run health checks periodically` | Health checks |
| 🌐 E2E | `service should survive RPC outage` | Resilience |
| 🌐 E2E | `status endpoint should show RPC health` | Status |

#### `src/utils/events.ts` - Event Management

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `generateEventId should be deterministic` | ID generation |
| 🧪 Unit | `generateEventId should produce unique IDs for different inputs` | Uniqueness |
| 🧪 Unit | `createEventMetadata should include timestamp` | Metadata |
| 🧪 Unit | `createEventMetadata should include version` | Metadata |
| 🧪 Unit | `createEventMetadata should include source` | Metadata |
| 🧪 Unit | `createTransactionProcessedEvent should have correct type` | Event factory |
| 🧪 Unit | `createNFTMintedEvent should have correct type` | Event factory |
| 🧪 Unit | `createNFTTransferredEvent should have correct type` | Event factory |
| 🧪 Unit | `createNFTBurnedEvent should have correct type` | Event factory |
| 🧪 Unit | `EventDeduplicator.isDuplicate should return true for duplicate` | Duplicate check |
| 🧪 Unit | `EventDeduplicator.isDuplicate should return false for new` | New event |
| 🧪 Unit | `EventDeduplicator.markProcessed should store event` | Mark processed |
| 🧪 Unit | `EventDeduplicator.checkAndMark should be atomic` | Atomic operation |
| 🧪 Unit | `EventDeduplicator.processWithDeduplication should skip duplicate` | Skip duplicate |
| 🧪 Unit | `EventDeduplicator.getStats should return statistics` | Stats |
| 🧪 Unit | `serializeEvent should JSON stringify` | Serialization |
| 🧪 Unit | `deserializeEvent should parse and validate` | Deserialization |
| 🧪 Unit | `isValidEvent should return true for valid event` | Type guard |
| 🔗 Integration | `should deduplicate with real Redis` | Real deduplication |
| 🔗 Integration | `should expire entries after TTL` | TTL |
| 🌐 E2E | `events should be deduplicated in processing pipeline` | Pipeline |

#### `src/utils/job-tracker.ts` - Job Tracking

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `registerJob should store job` | Registration |
| 🧪 Unit | `registerJob should return job ID` | ID return |
| 🧪 Unit | `completeJob should mark completed` | Completion |
| 🧪 Unit | `completeJob should remove from active` | Cleanup |
| 🧪 Unit | `failJob should increment retry count` | Retry tracking |
| 🧪 Unit | `failJob should move to DLQ after max retries` | DLQ |
| 🧪 Unit | `cancelJob should mark cancelled` | Cancellation |
| 🧪 Unit | `getJob should return job details` | Job retrieval |
| 🧪 Unit | `getActiveJobs should return all active` | Active jobs |
| 🧪 Unit | `getJobsByType should filter by type` | Filtering |
| 🧪 Unit | `getActiveJobCount should return count` | Counting |
| 🧪 Unit | `hasActiveJobs should return true when active` | Status check |
| 🧪 Unit | `getMetrics should return job metrics` | Metrics |
| 🧪 Unit | `timeout checker should detect timed out jobs` | Timeout detection |
| 🧪 Unit | `shutdown should wait for active jobs` | Graceful shutdown |
| 🧪 Unit | `shutdown should cancel after grace period` | Forced cancel |
| 🧪 Unit | `initializeJobTracker should create singleton` | Singleton |
| 🧪 Unit | `shutdownJobTracker should shutdown gracefully` | Shutdown |
| 🔗 Integration | `should track full job lifecycle` | Full cycle |
| 🔗 Integration | `should detect timeout correctly` | Timeout |
| 🔗 Integration | `should shutdown gracefully` | Shutdown |
| 🌐 E2E | `jobs should be tracked during indexing` | Indexing |
| 🌐 E2E | `graceful shutdown should wait for jobs` | Shutdown |

#### `src/utils/metrics.ts` - Prometheus Metrics

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `transactionsProcessedTotal should be Counter` | Metric type |
| 🧪 Unit | `transactionsProcessedTotal should have correct labels` | Labels |
| 🧪 Unit | `transactionProcessingDuration should be Histogram` | Metric type |
| 🧪 Unit | `transactionProcessingDuration should have correct buckets` | Buckets |
| 🧪 Unit | `indexerLag should be Gauge` | Metric type |
| 🧪 Unit | `rpcCallDuration should be Histogram` | Metric type |
| 🧪 Unit | `mongodbWrites should be Counter` | Metric type |
| 🧪 Unit | `postgresqlQueries should be Counter` | Metric type |
| 🧪 Unit | `processingErrorsTotal should be Counter` | Metric type |
| 🧪 Unit | `isHealthy should be Gauge` | Metric type |
| 🧪 Unit | `JobMetrics.recordJobStart should increment counter` | Job metrics |
| 🧪 Unit | `JobMetrics.recordJobComplete should increment counter` | Job metrics |
| 🧪 Unit | `JobMetrics.recordJobRetry should increment counter` | Job metrics |
| 🧪 Unit | `JobMetrics.startJobTimer should return timer function` | Timer |
| 🔗 Integration | `should expose metrics endpoint` | Endpoint |
| 🔗 Integration | `should include default metrics` | Default metrics |
| 🔗 Integration | `should produce valid Prometheus format` | Format |
| 🌐 E2E | `Prometheus should be able to scrape metrics` | Scraping |

#### `src/utils/onChainQuery.ts` - On-Chain Queries

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `getTokenState should return exists: true for valid token` | Token state |
| 🧪 Unit | `getTokenState should return exists: false for non-existent` | Non-existent |
| 🧪 Unit | `getTokenState should detect burned tokens` | Burn detection |
| 🧪 Unit | `getTokenState should detect frozen tokens` | Freeze detection |
| 🧪 Unit | `getTokenState should return owner` | Owner |
| 🧪 Unit | `getNFTMetadata should return metadata` | Metadata |
| 🧪 Unit | `getNFTMetadata should handle missing metadata` | Missing data |
| 🧪 Unit | `getTransactionHistory should return transactions` | History |
| 🧪 Unit | `parseTransactionType should identify mint` | Type parsing |
| 🧪 Unit | `parseTransactionType should identify transfer` | Type parsing |
| 🧪 Unit | `parseTransactionType should identify burn` | Type parsing |
| 🧪 Unit | `verifyOwnership should return valid: true for owner` | Verification |
| 🧪 Unit | `verifyOwnership should return valid: false for non-owner` | Verification |
| 🔗 Integration | `should query real devnet token` | Real query |
| 🔗 Integration | `should get real NFT metadata` | Real metadata |
| 🔗 Integration | `should verify real ownership` | Real verification |
| 🌐 E2E | `reconciliation should use OnChainQuery` | Reconciliation |
| 🌐 E2E | `query results should match indexed data` | Consistency |

#### `src/utils/response-filter.ts` - Response Filtering

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should remove __v field` | MongoDB version |
| 🧪 Unit | `should remove password field` | Sensitive removal |
| 🧪 Unit | `should remove apiKey field` | Sensitive removal |
| 🧪 Unit | `should remove privateKey field` | Sensitive removal |
| 🧪 Unit | `should remove accessToken field` | Sensitive removal |
| 🧪 Unit | `should redact ssn to [REDACTED]` | Redaction |
| 🧪 Unit | `should redact creditCard to [REDACTED]` | Redaction |
| 🧪 Unit | `transaction entity should allow defined fields` | Whitelist |
| 🧪 Unit | `walletActivity entity should allow defined fields` | Whitelist |
| 🧪 Unit | `marketplaceEvent entity should allow defined fields` | Whitelist |
| 🧪 Unit | `should remove non-whitelisted fields for entity` | Whitelist |
| 🧪 Unit | `deep: true should filter nested objects` | Deep filter |
| 🧪 Unit | `maxDepth should limit recursion` | Depth limit |
| 🧪 Unit | `should filter arrays of objects` | Array filter |
| 🧪 Unit | `filterResponse should return null for null` | Null handling |
| 🧪 Unit | `createEntityFilter should return filter function` | Factory |
| 🧪 Unit | `paginateResponse should return correct structure` | Pagination |
| 🧪 Unit | `paginateResponse should set hasMore correctly` | Has more |
| 🧪 Unit | `selectFields should return only specified fields` | Field selection |
| 🧪 Unit | `selectFieldsArray should apply to each element` | Array selection |
| 🔗 Integration | `blocked fields should never appear in response` | Security |
| 🌐 E2E | `API responses should never contain sensitive fields` | Security |

#### `src/utils/websocket-manager.ts` - WebSocket Manager

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `constructor should set default options` | Defaults |
| 🧪 Unit | `constructor should default autoReconnect to true` | Auto reconnect |
| 🧪 Unit | `connect should set state to CONNECTING` | State change |
| 🧪 Unit | `connect should return immediately if already connected` | Guard |
| 🧪 Unit | `connect should create WebSocket` | WS creation |
| 🧪 Unit | `connect should set connection timeout` | Timeout |
| 🧪 Unit | `connect should resolve on open event` | Success |
| 🧪 Unit | `connect should reject on timeout` | Timeout failure |
| 🧪 Unit | `disconnect should set autoReconnect to false` | Disable reconnect |
| 🧪 Unit | `disconnect should clear all timers` | Timer cleanup |
| 🧪 Unit | `disconnect should close WebSocket with code 1000` | Close |
| 🧪 Unit | `send should return false if not connected` | Guard |
| 🧪 Unit | `send should stringify objects` | Serialization |
| 🧪 Unit | `send should increment messagesSent` | Counter |
| 🧪 Unit | `addSubscription should store subscription` | Storage |
| 🧪 Unit | `removeSubscription should remove subscription` | Removal |
| 🧪 Unit | `getState should return current state` | State access |
| 🧪 Unit | `isConnected should return true when CONNECTED` | Status |
| 🧪 Unit | `getMetrics should return all metrics` | Metrics |
| 🧪 Unit | `onOpen should set state to CONNECTED` | State change |
| 🧪 Unit | `onOpen should reset reconnectAttempts` | Reset |
| 🧪 Unit | `onOpen should start ping interval` | Ping |
| 🧪 Unit | `onOpen should restore subscriptions` | Restoration |
| 🧪 Unit | `onMessage should parse JSON if valid` | Parsing |
| 🧪 Unit | `onClose should schedule reconnect if enabled` | Reconnect |
| 🧪 Unit | `onClose should not reconnect if code 1000` | Normal close |
| 🧪 Unit | `scheduleReconnect should calculate exponential backoff` | Backoff |
| 🧪 Unit | `scheduleReconnect should cap at maxReconnectDelay` | Cap |
| 🧪 Unit | `scheduleReconnect should set state to FAILED after max` | Max attempts |
| 🧪 Unit | `restoreSubscriptions should send each subscription` | Restoration |
| 🧪 Unit | `initializeSolanaWebSocket should create manager` | Factory |
| 🧪 Unit | `initializeMarketplaceWebSocket should create manager` | Factory |
| 🔗 Integration | `should connect to real WebSocket server` | Connection |
| 🔗 Integration | `should reconnect after disconnect` | Reconnection |
| 🔗 Integration | `should restore subscriptions on reconnect` | Restoration |
| 🌐 E2E | `Solana WS should reconnect on RPC restart` | Resilience |
| 🌐 E2E | `should not lose data during reconnection` | Data integrity |

---

### 5. Models

#### `src/models/blockchain-transaction.model.ts` - Transaction Model

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `signature should be required` | Required field |
| 🧪 Unit | `signature should be unique` | Unique constraint |
| 🧪 Unit | `slot should be required` | Required field |
| 🧪 Unit | `blockTime should be required` | Required field |
| 🧪 Unit | `fee should be required` | Required field |
| 🧪 Unit | `status should be required` | Required field |
| 🧪 Unit | `status should accept success` | Enum value |
| 🧪 Unit | `status should accept failed` | Enum value |
| 🧪 Unit | `status should reject other values` | Enum validation |
| 🧪 Unit | `indexedAt should default to Date.now` | Default value |
| 🧪 Unit | `should have index on signature` | Index |
| 🧪 Unit | `should have index on slot` | Index |
| 🧪 Unit | `should have compound index on blockTime, slot` | Compound index |
| 🔗 Integration | `should create valid transaction` | Create |
| 🔗 Integration | `should query by signature` | Query |
| 🔗 Integration | `should query by slot range` | Range query |
| 🔗 Integration | `should reject duplicate signature` | Unique |

#### `src/models/marketplace-event.model.ts` - Marketplace Event Model

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `eventType should be required` | Required field |
| 🧪 Unit | `eventType should accept sale, listing, delisting, price_change` | Enum values |
| 🧪 Unit | `eventType should reject invalid` | Enum validation |
| 🧪 Unit | `marketplace should be required` | Required field |
| 🧪 Unit | `marketplace should accept magic_eden, tensor, solanart, tickettoken, other` | Enum values |
| 🧪 Unit | `signature should be required and unique` | Required/unique |
| 🧪 Unit | `tokenId should be required` | Required field |
| 🧪 Unit | `price should be required` | Required field |
| 🧪 Unit | `seller should be required` | Required field |
| 🧪 Unit | `buyer should be optional` | Optional field |
| 🧪 Unit | `timestamp should be required` | Required field |
| 🧪 Unit | `should have compound index on tokenId, timestamp` | Compound index |
| 🔗 Integration | `should create valid marketplace event` | Create |
| 🔗 Integration | `should query by tokenId` | Query |
| 🔗 Integration | `should query by marketplace and eventType` | Query |

#### `src/models/nft-metadata.model.ts` - NFT Metadata Model

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `assetId should be required and unique` | Required/unique |
| 🧪 Unit | `tree should be required` | Required field |
| 🧪 Unit | `leafIndex should be required` | Required field |
| 🧪 Unit | `metadata.name should be required` | Nested required |
| 🧪 Unit | `metadata.symbol should be required` | Nested required |
| 🧪 Unit | `metadata.uri should be required` | Nested required |
| 🧪 Unit | `owner should be required` | Required field |
| 🧪 Unit | `compressed should default to true` | Default value |
| 🧪 Unit | `mintedAt should default to Date.now` | Default value |
| 🧪 Unit | `should have unique compound index on tree, leafIndex` | Compound unique |
| 🔗 Integration | `should create valid NFT metadata` | Create |
| 🔗 Integration | `should query by owner` | Query |
| 🔗 Integration | `should reject duplicate assetId` | Unique |
| 🔗 Integration | `should reject duplicate tree+leafIndex` | Compound unique |

#### `src/models/wallet-activity.model.ts` - Wallet Activity Model

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `walletAddress should be required` | Required field |
| 🧪 Unit | `activityType should be required` | Required field |
| 🧪 Unit | `activityType should accept purchase, sale, transfer, mint, burn, listing` | Enum values |
| 🧪 Unit | `activityType should reject invalid` | Enum validation |
| 🧪 Unit | `transactionSignature should be required` | Required field |
| 🧪 Unit | `timestamp should be required` | Required field |
| 🧪 Unit | `should have compound index on walletAddress, timestamp` | Compound index |
| 🔗 Integration | `should create valid wallet activity` | Create |
| 🔗 Integration | `should query by walletAddress` | Query |
| 🔗 Integration | `should query wallet history sorted by timestamp` | Sorted query |

---

### 6. Middleware

#### `src/middleware/auth.ts` - JWT Authentication

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `ALLOWED_ALGORITHMS should only contain secure algorithms` | Security |
| 🧪 Unit | `ALLOWED_ALGORITHMS should not contain none` | Security |
| 🧪 Unit | `EXPECTED_ISSUER should read from env` | Config |
| 🧪 Unit | `EXPECTED_AUDIENCE should read from env` | Config |
| 🧪 Unit | `logSecurityEvent should log with security flag` | Logging |
| 🧪 Unit | `verifyJWT should return 401 when no header` | Missing auth |
| 🧪 Unit | `verifyJWT should log AUTH_MISSING_HEADER event` | Logging |
| 🧪 Unit | `verifyJWT should return RFC 7807 error format` | Error format |
| 🧪 Unit | `verifyJWT should return 401 for non-Bearer` | Invalid format |
| 🧪 Unit | `verifyJWT should return 500 when JWT_SECRET not configured` | Config error |
| 🧪 Unit | `verifyJWT should warn for short secrets` | Weak secret |
| 🧪 Unit | `verifyJWT should verify with algorithm whitelist` | Algorithm check |
| 🧪 Unit | `verifyJWT should verify issuer claim` | Issuer check |
| 🧪 Unit | `verifyJWT should verify audience claim` | Audience check |
| 🧪 Unit | `verifyJWT should reject token without userId or serviceId` | Identity check |
| 🧪 Unit | `verifyJWT should accept token with userId` | Valid token |
| 🧪 Unit | `verifyJWT should accept token with serviceId` | Valid token |
| 🧪 Unit | `verifyJWT should attach decoded payload to request.user` | Request decoration |
| 🧪 Unit | `verifyJWT should return 401 for expired token` | Expiration |
| 🧪 Unit | `verifyJWT should return 401 for invalid token` | Invalid token |
| 🧪 Unit | `optionalJWT should skip validation if no header` | Optional auth |
| 🧪 Unit | `optionalJWT should call verifyJWT if header present` | Conditional verify |
| 🧪 Unit | `verifyServiceJWT should return 401 when no header` | Missing auth |
| 🧪 Unit | `verifyServiceJWT should NOT verify issuer/audience` | Permissive |
| 🧪 Unit | `verifyServiceJWT should return 403 if no serviceId` | Service token check |
| 🔗 Integration | `should complete full auth flow with valid token` | Auth flow |
| 🔗 Integration | `should reject expired token` | Expiration |
| 🔗 Integration | `should reject wrong issuer` | Issuer |
| 🔗 Integration | `should reject wrong audience` | Audience |
| 🌐 E2E | `protected endpoints should require auth` | Protection |
| 🌐 E2E | `valid token should grant access` | Access |

#### `src/middleware/auth-audit.ts` - Auth Audit Logging

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `logAuthAuditEvent should log at info level for success` | Log level |
| 🧪 Unit | `logAuthAuditEvent should log at warn level for failure` | Log level |
| 🧪 Unit | `logSuspiciousActivity should create SUSPICIOUS_ACTIVITY event` | Event type |
| 🧪 Unit | `authAuditMiddleware should skip health endpoints` | Skip health |
| 🧪 Unit | `authAuditMiddleware should log TOKEN_MISSING for unauthenticated` | Missing token |
| 🧪 Unit | `authAuditMiddleware should log PERMISSION_GRANTED on success` | Success audit |
| 🧪 Unit | `authAuditMiddleware should log PERMISSION_DENIED on failure` | Failure audit |
| 🧪 Unit | `authAuditMiddleware should return 403 on authorization failure` | Rejection |
| 🧪 Unit | `isHealthEndpoint should return true for /health, /live, /ready` | Health check |
| 🧪 Unit | `normalizeEndpoint should remove query string` | Normalization |
| 🧪 Unit | `normalizeEndpoint should replace UUIDs with /*` | UUID replacement |
| 🧪 Unit | `getAuthRule should return exact match first` | Rule matching |
| 🧪 Unit | `getAuthRule should fall back to wildcard match` | Wildcard |
| 🧪 Unit | `checkAuthorization should return true for allowAnonymous` | Anonymous |
| 🧪 Unit | `checkAuthorization should check required roles` | Role check |
| 🧪 Unit | `checkAuthorization should check required scopes` | Scope check |
| 🔗 Integration | `should write audit logs for auth events` | Audit logging |
| 🌐 E2E | `admin endpoints should block non-admin` | Admin protection |

#### `src/middleware/rate-limit.ts` - Rate Limiting

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `DEFAULT_LIMITS should read from env` | Config |
| 🧪 Unit | `DEFAULT_LIMITS should have fallback values` | Defaults |
| 🧪 Unit | `SKIP_ON_ERROR should default to true` | Fail open |
| 🧪 Unit | `getRateLimitMetrics should return copy of metrics` | Metrics |
| 🧪 Unit | `checkMemoryLimit should create new entry if none exists` | New entry |
| 🧪 Unit | `checkMemoryLimit should return allowed=false when limit reached` | Limit |
| 🧪 Unit | `checkMemoryLimit should reset after window expires` | Window reset |
| 🧪 Unit | `initializeRateLimitRedis should set redisClient` | Initialization |
| 🧪 Unit | `checkRedisLimit should fall back to memory if no client` | Fallback |
| 🧪 Unit | `checkRedisLimit should use INCR for atomic increment` | Atomic |
| 🧪 Unit | `checkRedisLimit should fail open when SKIP_ON_ERROR=true` | Fail open |
| 🧪 Unit | `rateLimitMiddleware should use internal key for service requests` | Key selection |
| 🧪 Unit | `rateLimitMiddleware should use tenant key for tenant requests` | Key selection |
| 🧪 Unit | `rateLimitMiddleware should use IP key for unauthenticated` | Key selection |
| 🧪 Unit | `rateLimitMiddleware should set X-RateLimit-Limit header` | Header |
| 🧪 Unit | `rateLimitMiddleware should set X-RateLimit-Remaining header` | Header |
| 🧪 Unit | `rateLimitMiddleware should set Retry-After when blocked` | Header |
| 🧪 Unit | `rateLimitMiddleware should throw RateLimitError when blocked` | Rejection |
| 🧪 Unit | `queryRateLimitMiddleware should use query-specific limit` | Query limit |
| 🔗 Integration | `should enforce Redis-backed limiting` | Redis |
| 🔗 Integration | `should fall back to memory on Redis failure` | Fallback |
| 🌐 E2E | `should include rate limit headers in response` | Headers |
| 🌐 E2E | `should return 429 when exceeded` | Rejection |

#### `src/middleware/request-id.ts` - Request ID

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `extractRequestId should extract x-request-id` | Header extraction |
| 🧪 Unit | `extractRequestId should extract x-correlation-id` | Header extraction |
| 🧪 Unit | `extractRequestId should generate UUID if none present` | Generation |
| 🧪 Unit | `registerRequestId should set request.requestId` | Request decoration |
| 🧪 Unit | `registerRequestId should set X-Request-ID response header` | Response header |
| 🧪 Unit | `getCorrelationHeaders should return X-Request-ID` | Header generation |
| 🔗 Integration | `should propagate request ID through request` | Propagation |
| 🌐 E2E | `request ID in logs should match response header` | Correlation |

#### `src/middleware/request-logger.ts` - Request Logging

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `createRequestLogger should create child logger` | Child logger |
| 🧪 Unit | `createRequestLogger should include requestId` | Context |
| 🧪 Unit | `redactHeaders should redact authorization` | Redaction |
| 🧪 Unit | `redactHeaders should redact cookie` | Redaction |
| 🧪 Unit | `redactHeaders should redact x-api-key` | Redaction |
| 🧪 Unit | `shouldLog should return false for /health` | Exclusion |
| 🧪 Unit | `onRequest hook should log request_start event` | Logging |
| 🧪 Unit | `onResponse hook should log at error level for 5xx` | Log level |
| 🧪 Unit | `onResponse hook should log at warn level for 4xx` | Log level |
| 🧪 Unit | `onError hook should identify rate limit errors` | Detection |
| 🧪 Unit | `onError hook should include stack in development only` | Stack trace |
| 🔗 Integration | `should log request lifecycle` | Lifecycle |
| 🌐 E2E | `logs should not contain sensitive headers` | Security |

#### `src/middleware/tenant-context.ts` - Tenant Context

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should extract tenant_id from user` | Extraction |
| 🧪 Unit | `should extract tenantId from user (camelCase)` | Extraction |
| 🧪 Unit | `should fall back to DEFAULT_TENANT_ID` | Fallback |
| 🧪 Unit | `should set RLS context via db.raw` | RLS setup |
| 🧪 Unit | `should set RLS context via db.query` | RLS setup |
| 🧪 Unit | `should set request.tenantId` | Request decoration |
| 🧪 Unit | `should throw on db error` | Error propagation |
| 🧪 Unit | `DEFAULT_TENANT_ID should be valid UUID format` | Format |
| 🔗 Integration | `should set RLS context in database` | RLS |
| 🔗 Integration | `should enforce tenant isolation` | Isolation |
| 🌐 E2E | `queries should return only tenant data` | Filtering |
| 🌐 E2E | `cross-tenant access should be blocked` | Security |

---

### 7. Processors

#### `src/processors/transactionProcessor.ts` - Transaction Processor

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `constructor should store connection` | Setup |
| 🧪 Unit | `constructor should create Metaplex instance` | Setup |
| 🧪 Unit | `processTransaction should skip if already processed` | Deduplication |
| 🧪 Unit | `processTransaction should fetch parsed transaction` | Fetching |
| 🧪 Unit | `processTransaction should parse instruction type` | Parsing |
| 🧪 Unit | `processTransaction should call saveToMongoDB` | MongoDB write |
| 🧪 Unit | `processTransaction should call processMint for MINT_NFT` | Type routing |
| 🧪 Unit | `processTransaction should call processTransfer for TRANSFER` | Type routing |
| 🧪 Unit | `processTransaction should call processBurn for BURN` | Type routing |
| 🧪 Unit | `processTransaction should increment success metric` | Metrics |
| 🧪 Unit | `processTransaction should increment error metric on failure` | Metrics |
| 🧪 Unit | `saveToMongoDB should extract accounts with validation` | Extraction |
| 🧪 Unit | `saveToMongoDB should mark invalid addresses as invalid` | Validation |
| 🧪 Unit | `saveToMongoDB should retry up to 3 times` | Retry |
| 🧪 Unit | `saveToMongoDB should use exponential backoff` | Backoff |
| 🧪 Unit | `saveToMongoDB should return without error on duplicate` | Duplicate handling |
| 🧪 Unit | `saveToMongoDB should call trackFailedWrite on failure` | Failure tracking |
| 🧪 Unit | `saveToMongoDB should throw after retries exhausted` | Error propagation |
| 🧪 Unit | `trackFailedWrite should insert into failed_mongodb_writes` | Tracking |
| 🧪 Unit | `checkExists should return true if signature exists` | Existence check |
| 🧪 Unit | `checkExists should return false if not found` | Existence check |
| 🧪 Unit | `parseInstructionType should return MINT_NFT for mint log` | Parsing |
| 🧪 Unit | `parseInstructionType should return TRANSFER for transfer log` | Parsing |
| 🧪 Unit | `parseInstructionType should return BURN for burn log` | Parsing |
| 🧪 Unit | `parseInstructionType should return UNKNOWN for no match` | Default |
| 🧪 Unit | `processMint should call validateMintData` | Validation |
| 🧪 Unit | `processMint should update tickets table` | PostgreSQL |
| 🧪 Unit | `processMint should create WalletActivity` | MongoDB |
| 🧪 Unit | `processTransfer should call validateTransferData` | Validation |
| 🧪 Unit | `processTransfer should update tickets table` | PostgreSQL |
| 🧪 Unit | `processTransfer should insert ticket_transfers` | PostgreSQL |
| 🧪 Unit | `processTransfer should create WalletActivity for both parties` | MongoDB |
| 🧪 Unit | `processBurn should call validateBurnData` | Validation |
| 🧪 Unit | `processBurn should update tickets status to BURNED` | PostgreSQL |
| 🧪 Unit | `recordTransaction should insert into indexed_transactions` | Recording |
| 🧪 Unit | `recordTransaction should use ON CONFLICT DO NOTHING` | Idempotency |
| 🔗 Integration | `should process full mint transaction` | Full flow |
| 🔗 Integration | `should process full transfer transaction` | Full flow |
| 🔗 Integration | `should process full burn transaction` | Full flow |
| 🔗 Integration | `MongoDB and PostgreSQL should be consistent` | Consistency |
| 🌐 E2E | `indexer should process real transactions` | Real processing |
| 🌐 E2E | `data should be queryable after processing` | Query |

#### `src/processors/marketplaceTracker.ts` - Marketplace Tracker

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `constructor should store connection` | Setup |
| 🧪 Unit | `constructor should initialize marketplaces config` | Config |
| 🧪 Unit | `startTracking should subscribe to all marketplaces` | Subscription |
| 🧪 Unit | `startTracking should call startPolling` | Polling |
| 🧪 Unit | `stopTracking should remove all listeners` | Cleanup |
| 🧪 Unit | `stopTracking should clear polling interval` | Cleanup |
| 🧪 Unit | `subscribeToMarketplace should create PublicKey` | Key creation |
| 🧪 Unit | `subscribeToMarketplace should call onProgramAccountChange` | Subscription |
| 🧪 Unit | `processMarketplaceActivity should fetch recent signatures` | Fetching |
| 🧪 Unit | `processMarketplaceActivity should parse transaction` | Parsing |
| 🧪 Unit | `processMarketplaceActivity should check if our NFT` | Filtering |
| 🧪 Unit | `parseMarketplaceTransaction should route to correct parser` | Routing |
| 🧪 Unit | `parseMagicEdenTransaction should detect SALE` | Parsing |
| 🧪 Unit | `parseMagicEdenTransaction should detect LIST` | Parsing |
| 🧪 Unit | `parseMagicEdenTransaction should detect DELIST` | Parsing |
| 🧪 Unit | `parseMagicEdenTransaction should extract tokenId` | Extraction |
| 🧪 Unit | `parseMagicEdenTransaction should extract price` | Extraction |
| 🧪 Unit | `parseTensorTransaction should detect tcomp::buy` | Parsing |
| 🧪 Unit | `parseTensorTransaction should detect tcomp::list` | Parsing |
| 🧪 Unit | `isOurNFT should return true for known token` | Check |
| 🧪 Unit | `isOurNFT should return false for unknown token` | Check |
| 🧪 Unit | `recordActivity should insert into marketplace_activity` | Recording |
| 🧪 Unit | `updateTicketStatus should update wallet_address on SALE` | Update |
| 🧪 Unit | `updateTicketStatus should set marketplace_listed on LIST` | Update |
| 🧪 Unit | `updateTicketStatus should clear marketplace_listed on DELIST` | Update |
| 🧪 Unit | `startPolling should set 30 second interval` | Interval |
| 🧪 Unit | `pollMarketplace should fetch 20 recent signatures` | Fetching |
| 🔗 Integration | `should subscribe to marketplace programs` | Subscription |
| 🔗 Integration | `should process real marketplace transaction` | Processing |
| 🌐 E2E | `marketplace sale should update ticket owner` | Sale flow |
| 🌐 E2E | `listing status should be tracked` | Listing |

---

### 8. Reconciliation

#### `src/reconciliation/reconciliationEngine.ts` - Reconciliation Engine

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `constructor should store connection` | Setup |
| 🧪 Unit | `constructor should initialize isRunning to false` | Initial state |
| 🧪 Unit | `start should return early if already running` | Guard |
| 🧪 Unit | `start should set isRunning to true` | State change |
| 🧪 Unit | `start should call runReconciliation immediately` | Immediate run |
| 🧪 Unit | `start should set interval for periodic runs` | Scheduling |
| 🧪 Unit | `stop should set isRunning to false` | State change |
| 🧪 Unit | `stop should clear interval` | Cleanup |
| 🧪 Unit | `runReconciliation should create new run` | Run creation |
| 🧪 Unit | `runReconciliation should get tickets to reconcile` | Ticket fetch |
| 🧪 Unit | `runReconciliation should check each ticket` | Checking |
| 🧪 Unit | `runReconciliation should resolve discrepancies` | Resolution |
| 🧪 Unit | `runReconciliation should mark tickets reconciled` | Marking |
| 🧪 Unit | `runReconciliation should complete run with results` | Completion |
| 🧪 Unit | `runReconciliation should fail run on error` | Error handling |
| 🧪 Unit | `createRun should insert into reconciliation_runs` | DB insert |
| 🧪 Unit | `completeRun should update run with results` | DB update |
| 🧪 Unit | `failRun should set status to FAILED` | DB update |
| 🧪 Unit | `getTicketsToReconcile should filter unreconciled` | Filtering |
| 🧪 Unit | `getTicketsToReconcile should filter stale` | Filtering |
| 🧪 Unit | `getTicketsToReconcile should limit to 100` | Pagination |
| 🧪 Unit | `checkTicket should return null for no token_id` | Guard |
| 🧪 Unit | `checkTicket should detect TOKEN_NOT_FOUND` | Detection |
| 🧪 Unit | `checkTicket should detect OWNERSHIP_MISMATCH` | Detection |
| 🧪 Unit | `checkTicket should detect BURN_NOT_RECORDED` | Detection |
| 🧪 Unit | `resolveDiscrepancy should insert ownership_discrepancies` | Recording |
| 🧪 Unit | `resolveDiscrepancy should update wallet_address` | Resolution |
| 🧪 Unit | `resolveDiscrepancy should update status` | Resolution |
| 🧪 Unit | `resolveDiscrepancy should insert reconciliation_log` | Logging |
| 🔗 Integration | `should complete full reconciliation run` | Full run |
| 🔗 Integration | `should detect and resolve discrepancies` | Detection |
| 🌐 E2E | `ownership mismatch should be auto-corrected` | Correction |
| 🌐 E2E | `burn detection should work` | Burns |

#### `src/reconciliation/reconciliationEnhanced.ts` - Enhanced Reconciliation

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `constructor should create OnChainQuery instance` | Setup |
| 🧪 Unit | `checkTicket should return null for no token_id` | Guard |
| 🧪 Unit | `checkTicket should call onChainQuery.getTokenState` | On-chain query |
| 🧪 Unit | `checkTicket should return array of discrepancies` | Multiple |
| 🧪 Unit | `checkTicket should detect TOKEN_NOT_FOUND` | Detection |
| 🧪 Unit | `checkTicket should detect TOKEN_BURNED` | Detection |
| 🧪 Unit | `checkTicket should detect OWNERSHIP_MISMATCH` | Detection |
| 🧪 Unit | `checkTicket should update sync_status on no discrepancies` | Update |
| 🧪 Unit | `checkTicket should set sync_status to ERROR on failure` | Error handling |
| 🧪 Unit | `detectBurns should query minted non-burned tickets` | Query |
| 🧪 Unit | `detectBurns should check token state for each` | Checking |
| 🧪 Unit | `detectBurns should update status to BURNED` | Update |
| 🧪 Unit | `detectBurns should insert ownership_discrepancy` | Recording |
| 🧪 Unit | `detectBurns should return detected and errors count` | Results |
| 🧪 Unit | `verifyMarketplaceActivity should query recent SALE activity` | Query |
| 🧪 Unit | `verifyMarketplaceActivity should call verifyOwnership` | Verification |
| 🧪 Unit | `verifyMarketplaceActivity should update wallet on mismatch` | Correction |
| 🔗 Integration | `should detect burns with real RPC` | Real detection |
| 🔗 Integration | `should verify marketplace activity` | Verification |
| 🌐 E2E | `periodic burn scans should work` | Scanning |

---

### 9. Routes

#### `src/routes/health.routes.ts` - Health Routes

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `HEALTH_CHECK_TIMEOUT_MS should read from env` | Config |
| 🧪 Unit | `HEALTH_CHECK_TIMEOUT_MS should default to 5000` | Default |
| 🧪 Unit | `withTimeout should resolve if promise completes in time` | Success |
| 🧪 Unit | `withTimeout should reject on timeout` | Timeout |
| 🧪 Unit | `checkPostgres should return ok on success` | Success |
| 🧪 Unit | `checkPostgres should return failed on error` | Failure |
| 🧪 Unit | `checkMongoDB should return ok when connected` | Success |
| 🧪 Unit | `checkMongoDB should return failed when not connected` | Failure |
| 🧪 Unit | `checkRedis should return degraded if not initialized` | Degraded |
| 🧪 Unit | `checkRedis should return ok if read/write works` | Success |
| 🧪 Unit | `checkIndexer should return failed if null` | Null check |
| 🧪 Unit | `checkIndexer should return ok if running` | Running |
| 🧪 Unit | `checkIndexer should return degraded if lag high` | Lag |
| 🧪 Unit | `GET /live should return 200` | Liveness |
| 🧪 Unit | `GET /startup should return 200 if PG and Mongo ok` | Startup |
| 🧪 Unit | `GET /startup should return 503 if PG fails` | Failure |
| 🧪 Unit | `GET /ready should return 200 if all ok` | Ready |
| 🧪 Unit | `GET /ready should return 503 if any fails` | Not ready |
| 🧪 Unit | `GET /ready should allow Redis degraded` | Tolerance |
| 🧪 Unit | `GET /health should check all components` | Full check |
| 🧪 Unit | `GET /health should query indexer_state with explicit columns` | Explicit columns |
| 🧪 Unit | `GET /health should return 503 if unhealthy` | Unhealthy |
| 🧪 Unit | `GET /health should update isHealthy metric` | Metrics |
| 🔗 Integration | `health endpoints should respond correctly` | Responses |
| 🌐 E2E | `Kubernetes probes should work` | K8s |

#### `src/routes/query.routes.ts` - Query Routes

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `GET /api/v1/transactions/:signature should require JWT` | Auth |
| 🧪 Unit | `GET /api/v1/transactions/:signature should validate signature format` | Validation |
| 🧪 Unit | `GET /api/v1/transactions/:signature should reject invalid signature` | Rejection |
| 🧪 Unit | `GET /api/v1/transactions/:signature should query with explicit columns` | Explicit columns |
| 🧪 Unit | `GET /api/v1/transactions/:signature should return 404 if not found` | Not found |
| 🧪 Unit | `GET /api/v1/transactions/:signature should query MongoDB for full data` | MongoDB |
| 🧪 Unit | `GET /api/v1/wallets/:address/activity should require JWT` | Auth |
| 🧪 Unit | `GET /api/v1/wallets/:address/activity should validate address format` | Validation |
| 🧪 Unit | `GET /api/v1/wallets/:address/activity should use default limit=50` | Default |
| 🧪 Unit | `GET /api/v1/wallets/:address/activity should filter by activityType` | Filtering |
| 🧪 Unit | `GET /api/v1/wallets/:address/activity should return pagination info` | Pagination |
| 🧪 Unit | `GET /api/v1/transactions/by-slot/:slot should validate slot is numeric` | Validation |
| 🧪 Unit | `GET /api/v1/transactions/by-slot/:slot should return 400 for non-numeric` | Rejection |
| 🧪 Unit | `GET /api/v1/nfts/:tokenId/history should validate tokenId format` | Validation |
| 🧪 Unit | `GET /api/v1/marketplace/activity should validate marketplace pattern` | Validation |
| 🧪 Unit | `GET /api/v1/sync/status should query with explicit columns` | Explicit columns |
| 🧪 Unit | `GET /api/v1/sync/status should return 404 if no state` | Not found |
| 🧪 Unit | `GET /api/v1/reconciliation/discrepancies should filter by resolved` | Filtering |
| 🧪 Unit | `GET /api/v1/reconciliation/discrepancies should use explicit columns` | Explicit columns |
| 🔗 Integration | `auth rejection should work` | Auth |
| 🔗 Integration | `pagination should work end-to-end` | Pagination |
| 🌐 E2E | `full query flow with real data` | Full flow |

---

### 10. Schemas

#### `src/schemas/validation.ts` - Validation Schemas

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `MAX_OFFSET should be 10000` | Constant |
| 🧪 Unit | `MAX_LIMIT should be 100` | Constant |
| 🧪 Unit | `DEFAULT_LIMIT should be 50` | Constant |
| 🧪 Unit | `SIGNATURE_PATTERN should match 87-88 chars` | Pattern |
| 🧪 Unit | `ADDRESS_PATTERN should match 32-44 chars` | Pattern |
| 🧪 Unit | `transactionSignatureSchema should require signature` | Required |
| 🧪 Unit | `transactionSignatureSchema should have additionalProperties false` | Strict |
| 🧪 Unit | `walletAddressSchema should validate address format` | Validation |
| 🧪 Unit | `slotSchema should require numeric string` | Validation |
| 🧪 Unit | `tokenIdSchema should use ADDRESS_PATTERN` | Pattern |
| 🧪 Unit | `paginationSchema should validate limit range` | Range |
| 🧪 Unit | `paginationSchema should validate offset range` | Range |
| 🧪 Unit | `walletActivityQuerySchema should validate activityType enum` | Enum |
| 🧪 Unit | `marketplaceQuerySchema should validate marketplace pattern` | Pattern |
| 🧪 Unit | `isValidBase58 should return true for valid base58` | Validation |
| 🧪 Unit | `isValidBase58 should return false for invalid chars` | Validation |
| 🧪 Unit | `isValidSignature should validate length 87-88` | Length |
| 🧪 Unit | `isValidAddress should validate length 32-44` | Length |
| 🧪 Unit | `sanitizePagination should clamp to MAX_LIMIT` | Clamping |
| 🧪 Unit | `sanitizePagination should clamp to MAX_OFFSET` | Clamping |
| 🧪 Unit | `validateMintData should extract tokenId and owner` | Extraction |
| 🧪 Unit | `validateMintData should return null if missing fields` | Validation |
| 🧪 Unit | `validateMintData should return null if invalid base58` | Validation |
| 🧪 Unit | `validateTransferData should extract all fields` | Extraction |
| 🧪 Unit | `validateTransferData should allow undefined previousOwner` | Optional |
| 🧪 Unit | `validateBurnData should extract tokenId` | Extraction |
| 🧪 Unit | `validateTransactionAccounts should validate array` | Validation |
| 🧪 Unit | `validateOwnerAddress should return null for invalid` | Validation |
| 🧪 Unit | `ZodBase58Address should validate correctly` | Zod |
| 🧪 Unit | `ZodBase58Signature should validate correctly` | Zod |
| 🧪 Unit | `ZodPagination should apply defaults` | Defaults |
| 🧪 Unit | `ZodRpcGetSlotResponse should accept non-negative int` | Validation |
| 🧪 Unit | `ZodParsedTransaction should validate structure` | Validation |
| 🧪 Unit | `validateRpcResponse should return typed result` | Success |
| 🧪 Unit | `validateRpcResponse should throw on failure` | Failure |
| 🧪 Unit | `safeValidateRpcResponse should return null on failure` | Safe |
| 🔗 Integration | `schema validation should work in routes` | Integration |
| 🌐 E2E | `invalid input should be rejected` | Rejection |

---

### 11. Services

#### `src/services/cache-integration.ts` - Cache Integration

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `initializeCacheService should return existing instance` | Singleton |
| 🧪 Unit | `initializeCacheService should read REDIS_HOST from env` | Config |
| 🧪 Unit | `initializeCacheService should read REDIS_PORT from env` | Config |
| 🧪 Unit | `initializeCacheService should read REDIS_PASSWORD from env` | Config |
| 🧪 Unit | `initializeCacheService should set keyPrefix` | Config |
| 🧪 Unit | `initializeCacheService should set defaultTTL to 300` | Config |
| 🧪 Unit | `initializeCacheService should call initializeCache` | Initialization |
| 🧪 Unit | `initializeCacheService should throw on error` | Error handling |
| 🧪 Unit | `getCacheService should call initializeCacheService if null` | Lazy init |
| 🧪 Unit | `getCacheService should return existing instance` | Singleton |
| 🧪 Unit | `default export should have initialize function` | Export |
| 🧪 Unit | `default export should have get function` | Export |
| 🔗 Integration | `should connect to Redis` | Connection |

---

### 12. Sync

#### `src/sync/historicalSync.ts` - Historical Sync

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `constructor should store connection` | Setup |
| 🧪 Unit | `constructor should store processor` | Setup |
| 🧪 Unit | `constructor should set default batchSize to 1000` | Default |
| 🧪 Unit | `constructor should set default maxConcurrent to 5` | Default |
| 🧪 Unit | `syncRange should log start with slot range` | Logging |
| 🧪 Unit | `syncRange should create batches up to maxConcurrent` | Batching |
| 🧪 Unit | `syncRange should process batches in parallel` | Parallelism |
| 🧪 Unit | `syncRange should use Promise.allSettled` | Error handling |
| 🧪 Unit | `syncRange should count succeeded and failed` | Counting |
| 🧪 Unit | `syncRange should log warning for failures` | Logging |
| 🧪 Unit | `syncRange should calculate progress percentage` | Progress |
| 🧪 Unit | `syncRange should call saveProgress` | Persistence |
| 🧪 Unit | `syncRange should sleep between iterations` | Throttling |
| 🧪 Unit | `processBatch should call getSignaturesInRange` | Fetching |
| 🧪 Unit | `processBatch should process each signature` | Processing |
| 🧪 Unit | `processBatch should return BatchResult` | Return |
| 🧪 Unit | `processBatch should throw on complete failure` | Error |
| 🧪 Unit | `getSignaturesInRange should fetch from connection` | Fetching |
| 🧪 Unit | `getSignaturesInRange should filter by slot range` | Filtering |
| 🧪 Unit | `getSignaturesInRange should return empty on error` | Error handling |
| 🧪 Unit | `saveProgress should update indexer_state` | Persistence |
| 🧪 Unit | `sleep should return promise` | Utility |
| 🧪 Unit | `sleep should resolve after ms` | Timing |
| 🧪 Unit | `estimateTimeRemaining should calculate total slots` | Calculation |
| 🧪 Unit | `estimateTimeRemaining should use default slotsPerSecond` | Default |
| 🧪 Unit | `estimateTimeRemaining should return hours and minutes` | Format |
| 🔗 Integration | `should sync historical slot range` | Full sync |
| 🔗 Integration | `should save progress correctly` | Progress |
| 🌐 E2E | `should handle large historical sync` | Large sync |

---

## Summary

| Section | Unit | Integration | E2E |
|---------|------|-------------|-----|
| 1. Entry Points | ~95 | ~18 | ~4 |
| 2. Configuration | ~45 | ~8 | ~0 |
| 3. Errors | ~55 | ~0 | ~0 |
| 4. Utilities | ~350 | ~45 | ~25 |
| 5. Models | ~45 | ~15 | ~0 |
| 6. Middleware | ~120 | ~15 | ~12 |
| 7. Processors | ~70 | ~5 | ~4 |
| 8. Reconciliation | ~45 | ~4 | ~4 |
| 9. Routes | ~45 | ~3 | ~2 |
| 10. Schemas | ~45 | ~2 | ~2 |
| 11. Services | ~12 | ~1 | ~0 |
| 12. Sync | ~25 | ~2 | ~1 |
| **Total** | **~952** | **~118** | **~54** |

---

## Testing Dependencies

### Required Mocks

- `@solana/web3.js` - Connection, PublicKey, transaction types
- `mongoose` - MongoDB models and connection
- `pg` - PostgreSQL pool and client
- `ioredis` - Redis client
- `jsonwebtoken` - JWT signing/verification
- `pino` - Logger

### Required Test Infrastructure

- MongoDB test instance (or mongodb-memory-server)
- PostgreSQL test instance (or pg-mem)
- Redis test instance (or ioredis-mock)
- Solana devnet connection for integration tests

### Environment Variables for Testing
```bash
NODE_ENV=test
DATABASE_URL=postgresql://test:test@localhost:5432/test
MONGODB_URL=mongodb://localhost:27017/test
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=test-secret-minimum-32-characters-long
SOLANA_RPC_URL=https://api.devnet.solana.com
```