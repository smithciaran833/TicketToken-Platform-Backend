# Blockchain Service - Test Plan

---

## Test Categories

| Category | Count | Priority |
|----------|-------|----------|
| Unit Tests | ~1,247 | High |
| Integration Tests | ~158 | High |
| E2E Tests | ~67 | Medium |

---

## Critical Issues to Address

Before testing, these critical issues from audit findings should be verified as resolved:

| Issue | Severity | Impact on Testing |
|-------|----------|-------------------|
| Treasury whitelist enforcement (AUDIT #85) - system programs only | 🔴 Critical | Config tests must verify whitelist enforcement |
| RLS tenant isolation (AUDIT #2, #105) - no default tenant fallback | 🔴 Critical | Multi-tenancy tests must verify rejection without tenant |
| Secrets manager integration (AUDIT #1, #69) - AWS + Vault | 🔴 Critical | Config tests must verify secrets loading |
| JWT validation (AUDIT #57) - minimum 32 chars | 🔴 Critical | Auth tests must verify JWT strength |
| Redis TLS configuration (AUDIT #73) - enforce rediss:// in prod | 🔴 Critical | Connection tests must verify TLS |
| Internal auth HMAC (AUDIT #16, #24-30) - 60s replay window | 🔴 Critical | Auth tests must verify signature verification |
| Idempotency enforcement (AUDIT #16, #17, #26) - 24hr TTL | 🔴 Critical | Mint tests must verify deduplication |
| Distributed locking (AUDIT #86, #87) - prevent duplicate mints | 🔴 Critical | Queue tests must verify lock acquisition |
| Load shedding priority (AUDIT #53) - never shed CRITICAL | 🔴 Critical | Load tests must verify priority preservation |
| Bulkhead isolation (AUDIT #51) - separate concurrency limits | 🔴 Critical | Middleware tests must verify resource isolation |
| Rate limiting (AUDIT #15, #28, #29, #40) - distributed + fallback | 🔴 High | Rate limit tests require Redis mock |
| Blockchain-first pattern (AUDIT #86, #87, #89) - confirm THEN DB | 🔴 High | Mint tests must verify confirmation before DB write |
| Sensitive data redaction (AUDIT #14, #38) - PII/secrets in logs | 🔴 High | Logger tests must verify no secrets in output |
| CHECK constraints (AUDIT #105) - status enums, non-negative amounts | 🟠 Medium | Migration tests must verify constraints |
| Soft delete (AUDIT #80) - deleted_at, no cascading deletes | 🟠 Medium | Wallet tests must verify soft delete behavior |
| Priority fees (AUDIT #82) - dynamic network-based calculation | 🟠 Medium | Metaplex tests must verify fee calculation |
| Fresh blockhash (AUDIT #84) - new blockhash on retry | 🟠 Medium | Retry tests must verify blockhash refresh |

---

## File-by-File Test Specifications

### 1. Entry Point

#### `src/index.ts` - Server Entry Point

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should load environment variables from .env` | dotenv configuration |
| 🧪 Unit | `should call validateConfigOrExit on startup` | Config validation |
| 🧪 Unit | `should log startup configuration summary` | Startup logging |
| 🔗 Integration | `should connect to PostgreSQL database` | Database connection |
| 🔗 Integration | `should connect to Redis` | Redis connection |
| 🔗 Integration | `should initialize secrets manager` | Secrets loading |
| 🔗 Integration | `should load treasury keypair from secrets` | Treasury initialization |
| 🔗 Integration | `should validate treasury whitelist on startup` | Whitelist verification |
| 🧪 Unit | `should create Fastify instance with correct options` | App instantiation |
| 🧪 Unit | `should register helmet plugin with HSTS` | Security headers |
| 🧪 Unit | `should register CORS plugin` | CORS configuration |
| 🧪 Unit | `should register rate limit middleware` | Rate limiting |
| 🧪 Unit | `should register tenant context middleware` | Multi-tenancy |
| 🧪 Unit | `should register internal auth middleware` | Service auth |
| 🧪 Unit | `should register validation middleware` | Input validation |
| 🧪 Unit | `should register idempotency middleware` | Idempotency |
| 🧪 Unit | `should register bulkhead middleware` | Resource isolation |
| 🧪 Unit | `should register load shedding middleware` | Load management |
| 🔗 Integration | `should mount blockchain routes` | Route registration |
| 🔗 Integration | `should mount health routes` | Health endpoints |
| 🔗 Integration | `should mount internal mint routes` | Internal endpoints |
| 🔗 Integration | `should mount metrics routes` | Metrics endpoints |
| 🧪 Unit | `should set 404 handler with RFC 7807 format` | Not found handling |
| 🧪 Unit | `should set error handler with RFC 7807 format` | Error handling |
| 🧪 Unit | `should add Retry-After header for 429 errors` | Rate limit headers |
| 🔗 Integration | `should listen on configured PORT and HOST` | Server binding |
| 🧪 Unit | `should initialize QueueManager singleton` | Queue initialization |
| 🧪 Unit | `should initialize ListenerManager singleton` | Listener initialization |
| 🔗 Integration | `should handle SIGTERM with graceful shutdown` | Clean shutdown |
| 🔗 Integration | `should handle SIGINT with graceful shutdown` | Clean shutdown |
| 🧪 Unit | `should wait for in-flight jobs to complete` | Job completion |
| 🧪 Unit | `should shutdown queue manager` | Queue cleanup |
| 🧪 Unit | `should shutdown listener manager` | Listener cleanup |
| 🧪 Unit | `should close Fastify app` | App cleanup |
| 🧪 Unit | `should disconnect from database` | DB cleanup |
| 🧪 Unit | `should disconnect from Redis` | Redis cleanup |
| 🧪 Unit | `should log unhandledRejection errors` | Promise rejection handling |
| 🧪 Unit | `should exit on uncaughtException after delay` | Exception handling |

---

### 2. Configuration

#### `src/config/database.ts` - Database Configuration

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should read DATABASE_URL from env` | Env reading |
| 🧪 Unit | `should require DATABASE_URL in production` | Production validation |
| 🧪 Unit | `should use default pool size 20` | Default value |
| 🧪 Unit | `should read POOL_SIZE from env` | Env override |
| 🧪 Unit | `getSSLConfig should return false in development` | Dev config |
| 🧪 Unit | `getSSLConfig should return SSL object in production` | Prod config |
| 🧪 Unit | `getSSLConfig should set rejectUnauthorized=false if env set` | SSL bypass |
| 🧪 Unit | `query should execute SQL and return result` | Query execution |
| 🧪 Unit | `query should apply statement_timeout when provided` | Timeout |
| 🧪 Unit | `query should log slow queries over threshold` | Slow query log |
| 🧪 Unit | `query should wrap errors in DatabaseError` | Error wrapping |
| 🧪 Unit | `withTransaction should begin transaction` | Transaction start |
| 🧪 Unit | `withTransaction should commit on success` | Commit |
| 🧪 Unit | `withTransaction should rollback on error` | Rollback |
| 🧪 Unit | `withTransaction should always release client` | Cleanup |
| 🧪 Unit | `withTenantContext should validate UUID format` | UUID validation |
| 🧪 Unit | `withTenantContext should SET app.current_tenant_id` | RLS setup |
| 🧪 Unit | `withTenantContext should reject invalid tenant ID` | Rejection |
| 🧪 Unit | `withTenantContext should use helper function current_tenant_id()` | Helper usage |
| 🧪 Unit | `getDatabaseHealth should return healthy status` | Health check |
| 🧪 Unit | `closeDatabase should end pool gracefully` | Cleanup |
| 🔗 Integration | `should connect to PostgreSQL` | Connection |
| 🔗 Integration | `should execute transaction with commit` | Transaction |
| 🔗 Integration | `should execute transaction with rollback` | Rollback |
| 🔗 Integration | `should set RLS tenant context` | RLS |
| 🔗 Integration | `should enforce RLS policies` | Tenant isolation |
| 🌐 E2E | `should return database health in health endpoint` | Health |

#### `src/config/index.ts` - Main Configuration

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should export config object` | Export check |
| 🧪 Unit | `should read SOLANA_NETWORK from env` | Env reading |
| 🧪 Unit | `should default to devnet` | Default value |
| 🧪 Unit | `should read SOLANA_RPC_URL from env` | Env reading |
| 🧪 Unit | `should reject public RPCs in production` | Security check |
| 🧪 Unit | `should read DEFAULT_PRIORITY_FEE from env` | Fee config |
| 🧪 Unit | `should read MIN_PRIORITY_FEE from env` | Fee config |
| 🧪 Unit | `should read MAX_PRIORITY_FEE from env` | Fee config |
| 🧪 Unit | `should read BUNDLR_ADDRESS from env` | Bundlr config |
| 🧪 Unit | `should read BUNDLR_PROVIDER_URL from env` | Bundlr config |
| 🧪 Unit | `should validate priority fee bounds` | Validation |

#### `src/config/queue.ts` - Queue Configuration

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should read REDIS_URL from env` | Env reading |
| 🧪 Unit | `should default to localhost:6379` | Default value |
| 🧪 Unit | `should parse redis:// URLs` | URL parsing |
| 🧪 Unit | `should parse rediss:// URLs` | TLS parsing |
| 🧪 Unit | `should require rediss:// in production` | Production security |
| 🧪 Unit | `should configure TLS with certificates` | TLS config |
| 🧪 Unit | `should set job options correctly` | Job config |
| 🧪 Unit | `should set concurrency limits` | Concurrency |

#### `src/config/redis.ts` - Redis Configuration

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should parse redis:// URLs correctly` | URL parsing |
| 🧪 Unit | `should parse rediss:// URLs correctly` | TLS URL parsing |
| 🧪 Unit | `should extract host from URL` | Host extraction |
| 🧪 Unit | `should extract port from URL` | Port extraction |
| 🧪 Unit | `should extract password from URL` | Password extraction |
| 🧪 Unit | `should configure TLS for rediss://` | TLS config |
| 🧪 Unit | `should set retry strategy` | Retry config |
| 🧪 Unit | `should set reconnectOnError callback` | Reconnection |
| 🔗 Integration | `should connect to Redis` | Connection |
| 🔗 Integration | `should handle connection errors` | Error handling |
| 🔗 Integration | `should reconnect on disconnect` | Reconnection |

#### `src/config/secrets.ts` - Secrets Manager

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should request TREASURY_PRIVATE_KEY from AWS` | AWS integration |
| 🧪 Unit | `should request JWT_SECRET from Vault` | Vault integration |
| 🧪 Unit | `should validate JWT_SECRET minimum 32 chars` | JWT validation |
| 🧪 Unit | `should throw in production with weak JWT_SECRET` | Production enforcement |
| 🧪 Unit | `should validate TREASURY_PRIVATE_KEY format` | Key validation |
| 🧪 Unit | `should not log secret values` | Security |
| 🔗 Integration | `should load secrets from AWS Secrets Manager` | AWS integration |
| 🔗 Integration | `should load secrets from Vault` | Vault integration |
| 🔗 Integration | `should cache loaded secrets` | Caching |

#### `src/config/services.ts` - Service URLs

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should read MINTING_SERVICE_URL from env` | Env reading |
| 🧪 Unit | `should enforce HTTPS in production` | HTTPS enforcement |
| 🧪 Unit | `should allow localhost in development` | Dev mode |
| 🧪 Unit | `should reject HTTP URLs in production` | Security |

#### `src/config/treasury-whitelist.ts` - Treasury Whitelist

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should include system programs only` | Whitelist content |
| 🧪 Unit | `should include Token Program` | Program inclusion |
| 🧪 Unit | `should include Metaplex programs` | Program inclusion |
| 🧪 Unit | `should allow runtime additions` | Dynamic additions |
| 🧪 Unit | `should log security events on violations` | Security logging |
| 🧪 Unit | `isWhitelisted should return true for allowed` | Validation |
| 🧪 Unit | `isWhitelisted should return false for denied` | Validation |

#### `src/config/validate.ts` - Configuration Validation

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `validateSolanaKey should accept valid Base58` | Key validation |
| 🧪 Unit | `validateSolanaKey should reject invalid format` | Format validation |
| 🧪 Unit | `validateSolanaKey should reject too short` | Length validation |
| 🧪 Unit | `validateSolanaKey should reject too long` | Length validation |
| 🧪 Unit | `validateServiceUrl should accept HTTPS in prod` | URL validation |
| 🧪 Unit | `validateServiceUrl should reject HTTP in prod` | Security check |
| 🧪 Unit | `validateServiceUrl should allow localhost in dev` | Dev mode |
| 🧪 Unit | `validateConfigOrExit should exit on invalid` | Exit on failure |
| 🧪 Unit | `validateConfigOrExit should return on valid` | Success case |
| 🧪 Unit | `getConfigSummary should mask sensitive values` | Security |

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
| 🧪 Unit | `BaseError.toJSON should serialize correctly` | Serialization |
| 🧪 Unit | `SolanaError should extend BaseError` | Inheritance |
| 🧪 Unit | `SolanaError.rpcError should create correct error` | Factory method |
| 🧪 Unit | `MintingError should extend BaseError` | Inheritance |
| 🧪 Unit | `MintingError.mintFailed should create correct error` | Factory method |
| 🧪 Unit | `WalletError should extend BaseError` | Inheritance |
| 🧪 Unit | `WalletError.connectionFailed should create correct error` | Factory method |
| 🧪 Unit | `ValidationError should extend BaseError` | Inheritance |
| 🧪 Unit | `ValidationError.invalidInput should create correct error` | Factory method |
| 🧪 Unit | `TenantError should extend BaseError` | Inheritance |
| 🧪 Unit | `TenantError.missingTenant should create correct error` | Factory method |
| 🧪 Unit | `AuthenticationError should extend BaseError` | Inheritance |
| 🧪 Unit | `AuthenticationError.invalidToken should create correct error` | Factory method |
| 🧪 Unit | `RateLimitError should extend BaseError` | Inheritance |
| 🧪 Unit | `RateLimitError.forTenant should include retryAfter` | Retry info |
| 🧪 Unit | `NotFoundError should extend BaseError` | Inheritance |
| 🧪 Unit | `NotFoundError should have statusCode 404` | Status code |

---

### 4. Listeners

#### `src/listeners/baseListener.ts` - Base Listener

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should extend EventEmitter` | Inheritance |
| 🧪 Unit | `subscribe should mark subscribed` | State change |
| 🧪 Unit | `unsubscribe should mark unsubscribed` | State change |
| 🧪 Unit | `unsubscribe should remove subscriptionId` | Cleanup |
| 🧪 Unit | `isSubscribed should return correct state` | State check |
| 🧪 Unit | `handleError should emit error event` | Error handling |

#### `src/listeners/index.ts` - Listener Manager

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should be singleton` | Singleton pattern |
| 🧪 Unit | `initialize should create ProgramListener` | Listener creation |
| 🧪 Unit | `initialize should create TransactionMonitor` | Monitor creation |
| 🧪 Unit | `initialize should subscribe to program` | Subscription |
| 🧪 Unit | `shutdown should unsubscribe all` | Cleanup |
| 🧪 Unit | `shutdown should clear monitor` | Cleanup |

#### `src/listeners/programListener.ts` - Program Listener

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `parseLogs should extract TicketMinted event` | Event parsing |
| 🧪 Unit | `parseLogs should extract TicketTransferred event` | Event parsing |
| 🧪 Unit | `parseLogs should extract TicketUsed event` | Event parsing |
| 🧪 Unit | `handleAccountChange should parse logs` | Log handling |
| 🧪 Unit | `handleAccountChange should update database` | DB update |
| 🧪 Unit | `handleAccountChange should emit event` | Event emission |
| 🔗 Integration | `should subscribe to program account changes` | Subscription |
| 🔗 Integration | `should process events and update DB` | Event processing |

#### `src/listeners/transactionMonitor.ts` - Transaction Monitor

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `addPendingTransaction should store transaction` | Storage |
| 🧪 Unit | `addPendingTransaction should start polling` | Polling start |
| 🧪 Unit | `checkTransaction should call getSignatureStatus` | Status check |
| 🧪 Unit | `checkTransaction should retry on failure` | Retry logic |
| 🧪 Unit | `checkTransaction should timeout after max attempts` | Timeout |
| 🧪 Unit | `checkTransaction should finalize ticket on confirmation` | Finalization |
| 🧪 Unit | `removePendingTransaction should delete entry` | Cleanup |
| 🧪 Unit | `stop should clear all pending` | Shutdown |
| 🔗 Integration | `should monitor transaction confirmation` | Monitoring |
| 🔗 Integration | `should finalize ticket after confirmation` | Finalization |

---

### 5. Middleware

#### `src/middleware/bulkhead.ts` - Bulkhead Pattern

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should have separate bulkheads for each operation type` | Isolation |
| 🧪 Unit | `MINT bulkhead should have limit 10` | Concurrency limit |
| 🧪 Unit | `WALLET bulkhead should have limit 20` | Concurrency limit |
| 🧪 Unit | `BLOCKCHAIN_QUERY bulkhead should have limit 50` | Concurrency limit |
| 🧪 Unit | `ADMIN bulkhead should have limit 5` | Concurrency limit |
| 🧪 Unit | `should return 503 when bulkhead full` | Rejection |
| 🧪 Unit | `should allow request when capacity available` | Acceptance |
| 🧪 Unit | `should release slot after completion` | Cleanup |
| 🧪 Unit | `should release slot after error` | Error cleanup |
| 🔗 Integration | `should prevent cascade failures` | Isolation |
| 🌐 E2E | `heavy load on one operation should not block others` | Isolation |

#### `src/middleware/idempotency.ts` - Idempotency Middleware

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should require Idempotency-Key header` | Header requirement |
| 🧪 Unit | `should validate key format (UUID)` | Key validation |
| 🧪 Unit | `should store request in Redis` | Storage |
| 🧪 Unit | `should return cached response for duplicate` | Cache hit |
| 🧪 Unit | `should set X-Idempotent-Replayed header` | Header |
| 🧪 Unit | `should store recovery point` | Recovery tracking |
| 🧪 Unit | `should use 24 hour TTL` | TTL |
| 🧪 Unit | `should fall back to memory if Redis down` | Fallback |
| 🔗 Integration | `duplicate requests should return same response` | Deduplication |
| 🌐 E2E | `mint retry should not create duplicate NFTs` | Mint idempotency |

#### `src/middleware/internal-auth.ts` - Internal Authentication

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should verify x-internal-service header` | Service check |
| 🧪 Unit | `should verify x-timestamp header` | Timestamp check |
| 🧪 Unit | `should verify x-internal-signature header` | Signature check |
| 🧪 Unit | `should use HMAC-SHA256 for verification` | Algorithm |
| 🧪 Unit | `should reject replay attacks (60s window)` | Replay protection |
| 🧪 Unit | `should use timing-safe comparison` | Security |
| 🧪 Unit | `should check allowed services whitelist` | Whitelist |
| 🧪 Unit | `should return 401 for missing headers` | Missing auth |
| 🧪 Unit | `should return 401 for invalid signature` | Invalid signature |
| 🧪 Unit | `should return 401 for expired timestamp` | Expiration |
| 🔗 Integration | `valid internal request should be allowed` | Auth success |
| 🔗 Integration | `replay attack should be blocked` | Replay block |

#### `src/middleware/load-shedding.ts` - Load Shedding

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should monitor event loop lag` | Lag monitoring |
| 🧪 Unit | `should monitor memory usage` | Memory monitoring |
| 🧪 Unit | `should never shed CRITICAL priority` | Priority preservation |
| 🧪 Unit | `should shed LOW priority first` | Shedding order |
| 🧪 Unit | `should shed NORMAL priority next` | Shedding order |
| 🧪 Unit | `should shed HIGH priority last` | Shedding order |
| 🧪 Unit | `should return 503 when shedding` | Rejection |
| 🧪 Unit | `should include Retry-After header` | Header |
| 🔗 Integration | `high load should shed low priority requests` | Load shedding |
| 🌐 E2E | `health checks should always succeed` | Critical preservation |

#### `src/middleware/rate-limit.ts` - Rate Limiting

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should use Redis for distributed limiting` | Redis backend |
| 🧪 Unit | `should fall back to memory on Redis failure` | Fallback |
| 🧪 Unit | `should fail open when skipOnError=true` | Fail open |
| 🧪 Unit | `should limit per tenant` | Tenant isolation |
| 🧪 Unit | `should have separate mint limits` | Mint limits |
| 🧪 Unit | `should enforce 10/min mint limit` | Mint rate |
| 🧪 Unit | `should enforce 100/hour mint limit` | Mint rate |
| 🧪 Unit | `should log detailed violations` | Logging |
| 🧪 Unit | `should set X-RateLimit-Limit header` | Header |
| 🧪 Unit | `should set X-RateLimit-Remaining header` | Header |
| 🧪 Unit | `should set Retry-After header when blocked` | Header |
| 🔗 Integration | `should enforce Redis-backed rate limits` | Redis limiting |
| 🔗 Integration | `should fall back to memory on failure` | Fallback |
| 🌐 E2E | `rate limit should be enforced across instances` | Distribution |

#### `src/middleware/request-logger.ts` - Request Logging

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should redact authorization header` | Redaction |
| 🧪 Unit | `should redact cookie header` | Redaction |
| 🧪 Unit | `should redact x-api-key header` | Redaction |
| 🧪 Unit | `should redact x-internal-signature header` | Redaction |
| 🧪 Unit | `should truncate body to 2000 chars` | Truncation |
| 🧪 Unit | `should log request duration` | Duration tracking |
| 🧪 Unit | `should log status code` | Status logging |
| 🔗 Integration | `logs should never contain sensitive data` | Security |

#### `src/middleware/tenant-context.ts` - Tenant Context

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should extract tenant_id from JWT` | Extraction |
| 🧪 Unit | `should validate UUID format` | Validation |
| 🧪 Unit | `should set RLS context with SET LOCAL` | RLS setup |
| 🧪 Unit | `should use current_tenant_id() helper` | Helper usage |
| 🧪 Unit | `should allow platform admin cross-tenant queries` | Admin access |
| 🧪 Unit | `should reject invalid tenant ID` | Rejection |
| 🔗 Integration | `should enforce tenant isolation` | RLS enforcement |
| 🌐 E2E | `cross-tenant access should be blocked` | Security |

#### `src/middleware/validation.ts` - Input Validation

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `validateAddressParam should validate Base58` | Address validation |
| 🧪 Unit | `validateAddressParam should validate length` | Length check |
| 🧪 Unit | `validateSignatureParam should validate format` | Signature validation |
| 🧪 Unit | `validateMintParam should validate mint address` | Mint validation |
| 🧪 Unit | `validateQueryParams should validate limit range` | Limit validation |
| 🧪 Unit | `validateConfirmationRequest should validate body` | Body validation |
| 🧪 Unit | `should sanitize input strings` | Sanitization |
| 🧪 Unit | `should prevent SQL injection` | Security |

---

### 6. Migrations

#### `src/migrations/*.ts` - Database Migrations

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `001 should create all core tables` | Table creation |
| 🧪 Unit | `001 should create foreign keys` | FK creation |
| 🧪 Unit | `001 should create RLS policies` | RLS creation |
| 🧪 Unit | `002 should harden RLS with FORCE` | RLS hardening |
| 🧪 Unit | `002 should create current_tenant_id() helper` | Helper creation |
| 🧪 Unit | `002 should create separate policies per action` | Policy granularity |
| 🧪 Unit | `003 should add CHECK constraints` | Constraint creation |
| 🧪 Unit | `003 should validate status enums` | Enum validation |
| 🧪 Unit | `003 should enforce non-negative amounts` | Amount validation |
| 🧪 Unit | `004 should add migration safety helpers` | Helper creation |
| 🧪 Unit | `004 should set statement timeouts` | Timeout config |
| 🧪 Unit | `005 should add soft delete columns` | Column addition |
| 🧪 Unit | `005 should add disconnection tracking` | Audit columns |
| 🧪 Unit | `006 should create partial unique indexes` | Index creation |
| 🧪 Unit | `006 should include tenant_id in indexes` | Multi-tenant indexes |
| 🧪 Unit | `007 should change FK actions to RESTRICT` | FK hardening |
| 🧪 Unit | `008 should create PostgreSQL extensions` | Extension creation |
| 🔗 Integration | `up migrations should execute in sequence` | Full migration |
| 🔗 Integration | `down migrations should rollback correctly` | Rollback |
| 🔗 Integration | `migrations should be idempotent` | Idempotency |
| 🔗 Integration | `RLS policies should enforce isolation` | RLS enforcement |
| 🔗 Integration | `soft delete should allow duplicate deleted records` | Soft delete |
| 🔗 Integration | `FK RESTRICT should prevent cascading deletes` | FK protection |

---

### 7. Queues

#### `src/queues/baseQueue.ts` - Base Queue

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should extend EventEmitter` | Inheritance |
| 🧪 Unit | `addJob should add job to queue` | Job addition |
| 🧪 Unit | `getJob should retrieve job by ID` | Job retrieval |
| 🧪 Unit | `getJobStatus should return status` | Status check |
| 🧪 Unit | `retryJob should move job back to queue` | Retry |
| 🧪 Unit | `removeJob should delete job` | Removal |
| 🧪 Unit | `getQueueStats should return metrics` | Stats |
| 🧪 Unit | `pause should pause queue` | Pause |
| 🧪 Unit | `resume should resume queue` | Resume |
| 🧪 Unit | `close should cleanup resources` | Cleanup |

#### `src/queues/dlq-processor.ts` - Dead Letter Queue Processor

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should categorize RETRYABLE errors` | Categorization |
| 🧪 Unit | `should categorize NON_RETRYABLE errors` | Categorization |
| 🧪 Unit | `should categorize UNKNOWN errors` | Categorization |
| 🧪 Unit | `should retry with exponential backoff` | Backoff |
| 🧪 Unit | `should use 30s base delay` | Delay |
| 🧪 Unit | `should cap at 1 hour max delay` | Max delay |
| 🧪 Unit | `should retry max 5 times` | Max retries |
| 🧪 Unit | `should archive after 7 days` | Archival |
| 🧪 Unit | `should process every 5 minutes` | Periodic processing |
| 🧪 Unit | `should track metrics by category` | Metrics |
| 🔗 Integration | `failed jobs should move to DLQ` | DLQ movement |
| 🔗 Integration | `retryable jobs should be retried` | Retry logic |

#### `src/queues/index.ts` - Queue Manager

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should be singleton` | Singleton pattern |
| 🧪 Unit | `initialize should create MintQueue` | Queue creation |
| 🧪 Unit | `getMintQueue should return instance` | Queue retrieval |
| 🧪 Unit | `getStats should aggregate all queues` | Stats aggregation |
| 🧪 Unit | `shutdown should close all queues` | Cleanup |

#### `src/queues/job-history.ts` - Job History Tracker

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should store job outcome` | Storage |
| 🧪 Unit | `should store duration` | Duration tracking |
| 🧪 Unit | `should retain for 24 hours` | Retention |
| 🧪 Unit | `should limit to 10k entries` | Limit |
| 🧪 Unit | `should index by jobId` | Indexing |
| 🧪 Unit | `should index by ticketId` | Indexing |
| 🧪 Unit | `should cleanup hourly` | Cleanup |
| 🧪 Unit | `hasSuccessfulMint should check for success` | Success check |
| 🧪 Unit | `getMintAddress should return address` | Address retrieval |
| 🧪 Unit | `getTenantSuccessRate should calculate rate` | Success rate |

#### `src/queues/mintQueue.ts` - Mint Queue

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should use distributed locking per ticketId` | Locking |
| 🧪 Unit | `should use 60s lock TTL` | Lock TTL |
| 🧪 Unit | `should check idempotency before minting` | Idempotency |
| 🧪 Unit | `should mark status MINTING before mint` | Status update |
| 🧪 Unit | `should call MetaplexService.mintNFT()` | Mint call |
| 🧪 Unit | `should wait for FINALIZED confirmation` | Confirmation |
| 🧪 Unit | `should timeout after 60s` | Timeout |
| 🧪 Unit | `should save to DB only after confirmation` | Blockchain-first |
| 🧪 Unit | `should mark MINTED with real data` | Success state |
| 🧪 Unit | `should mark MINT_FAILED on error` | Failure state |
| 🧪 Unit | `should NOT write fake data on failure` | Data integrity |
| 🧪 Unit | `should release lock in finally` | Lock release |
| 🧪 Unit | `should retry with exponential backoff` | Retry logic |
| 🧪 Unit | `should use concurrency=3` | Concurrency limit |
| 🧪 Unit | `should use circuit breaker` | Circuit breaker |
| 🧪 Unit | `should support RPC failover` | Failover |
| 🔗 Integration | `should mint NFT end-to-end` | Full flow |
| 🔗 Integration | `should handle confirmation timeout` | Timeout handling |
| 🔗 Integration | `distributed lock should prevent duplicates` | Lock enforcement |
| 🌐 E2E | `concurrent mints should not conflict` | Concurrency |

---

### 8. Routes

#### `src/routes/blockchain.routes.ts` - Blockchain Routes

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `GET /blockchain/balance/:address should validate address` | Validation |
| 🧪 Unit | `GET /blockchain/balance/:address should return SOL balance` | Balance query |
| 🧪 Unit | `GET /blockchain/tokens/:address should validate address` | Validation |
| 🧪 Unit | `GET /blockchain/tokens/:address should return token accounts` | Token query |
| 🧪 Unit | `GET /blockchain/nfts/:address should return NFTs` | NFT query |
| 🧪 Unit | `GET /blockchain/transaction/:signature should validate signature` | Validation |
| 🧪 Unit | `GET /blockchain/transactions/:address should limit to 100` | Limit |
| 🧪 Unit | `POST /blockchain/confirm-transaction should validate request` | Validation |
| 🧪 Unit | `GET /blockchain/account/:address should return account info` | Account query |
| 🧪 Unit | `GET /blockchain/slot should return current slot` | Slot query |
| 🧪 Unit | `GET /blockchain/blockhash should return latest blockhash` | Blockhash query |

#### `src/routes/health.routes.ts` - Health Routes

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `GET /health/live should always return 200` | Liveness |
| 🧪 Unit | `GET /health/ready should check DB, Solana, Treasury` | Readiness |
| 🧪 Unit | `GET /health/ready should return 503 if unhealthy` | Unhealthy |
| 🧪 Unit | `GET /health/ready should use 2s timeout per check` | Timeout |
| 🧪 Unit | `GET /health should cache for 10s` | Caching |
| 🧪 Unit | `GET /health/detailed should show treasury balance` | Detailed health |
| 🧪 Unit | `GET /health/treasury should not expose balance publicly` | Security |
| 🧪 Unit | `GET /health/treasury should detect low balance` | Low balance |
| 🧪 Unit | `GET /health/treasury should use threshold 1.0 SOL` | Threshold |
| 🧪 Unit | `POST /health/cache/clear should clear cache` | Cache clear |

#### `src/routes/internal-mint.routes.ts` - Internal Mint Routes

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `POST /internal/mint-tickets should require internal auth` | Auth |
| 🧪 Unit | `POST /internal/mint-tickets should validate request body` | Validation |
| 🧪 Unit | `POST /internal/mint-tickets should limit to 100 tickets` | Bulk limit |
| 🧪 Unit | `POST /internal/mint-tickets should generate HMAC signature` | Signature |
| 🧪 Unit | `POST /internal/mint-tickets should forward to minting-service` | Proxy |
| 🧪 Unit | `POST /internal/mint-tickets should include auth headers` | Headers |
| 🔗 Integration | `should proxy mint request correctly` | Proxy |

#### `src/routes/metrics.routes.ts` - Metrics Routes

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `GET /metrics should return Prometheus format` | Metrics |
| 🧪 Unit | `GET /metrics/circuit-breakers should return all breakers` | Circuit status |
| 🧪 Unit | `GET /metrics/circuit-breakers/:name should validate name` | Validation |
| 🧪 Unit | `GET /metrics/circuit-breakers/:name should use allowlist` | Security |
| 🧪 Unit | `POST /metrics/circuit-breakers/:name/reset should reset` | Reset |
| 🧪 Unit | `GET /metrics/load should return bulkhead stats` | Load metrics |

---

### 9. Schemas

#### `src/schemas/validation.ts` - Validation Schemas

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `SolanaAddressSchema should validate Base58` | Pattern |
| 🧪 Unit | `SolanaAddressSchema should validate length 32-44` | Length |
| 🧪 Unit | `TransactionSignatureSchema should validate 64-128` | Length |
| 🧪 Unit | `UUIDSchema should validate UUID v4` | UUID |
| 🧪 Unit | `TenantIdSchema should validate tenant UUID` | Tenant |
| 🧪 Unit | `ErrorResponseSchema should enforce RFC 7807` | RFC 7807 |
| 🧪 Unit | `ConfirmTransactionRequestSchema should have additionalProperties false` | Strict |
| 🧪 Unit | `MintTicketsRequestSchema should limit to 100 items` | Bulk limit |
| 🧪 Unit | `MintTicketsRequestSchema should have additionalProperties false` | Strict |
| 🧪 Unit | `buildRouteSchema should add standard error responses` | Builder |

---

### 10. Services

#### `src/services/BlockchainQueryService.ts` - Blockchain Query Service

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `getBalance should return lamports` | Balance query |
| 🧪 Unit | `getBalance should handle invalid address` | Error handling |
| 🧪 Unit | `getTokenAccounts should filter by SPL Token program` | Token query |
| 🧪 Unit | `getNFTsByOwner should filter amount=1 decimals=0` | NFT filtering |
| 🧪 Unit | `getTransaction should fetch parsed transaction` | TX query |
| 🧪 Unit | `getRecentTransactions should limit results` | Limit |
| 🧪 Unit | `getAccountInfo should return account data` | Account query |
| 🧪 Unit | `getLatestBlockhash should return blockhash` | Blockhash query |
| 🔗 Integration | `should query real Solana RPC` | Real query |

#### `src/services/MetaplexService.ts` - Metaplex Service

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `getPriorityFee should fetch recent fees` | Fee query |
| 🧪 Unit | `getPriorityFee should calculate median` | Median calculation |
| 🧪 Unit | `getPriorityFee should add 20% buffer` | Buffer |
| 🧪 Unit | `getPriorityFee should clamp to min/max` | Clamping |
| 🧪 Unit | `getPriorityFee should cache for 10s` | Caching |
| 🧪 Unit | `addPriorityFeeInstructions should create instructions` | Instructions |
| 🧪 Unit | `getFreshBlockhash should fetch new blockhash` | Blockhash |
| 🧪 Unit | `isBlockhashValid should check validity` | Validation |
| 🧪 Unit | `uploadMetadata should upload to Bundlr` | Upload |
| 🧪 Unit | `uploadMetadata should retry on failure` | Retry |
| 🧪 Unit | `mintNFT should upload metadata first` | Metadata upload |
| 🧪 Unit | `mintNFT should get fresh blockhash on retry` | Fresh blockhash |
| 🧪 Unit | `mintNFT should use priority fees` | Priority fees |
| 🧪 Unit | `mintNFT should retry 3 times` | Retry count |
| 🧪 Unit | `mintNFT should record metrics` | Metrics |
| 🔗 Integration | `should mint real NFT on devnet` | Real mint |

#### `src/services/RPCFailoverService.ts` - RPC Failover Service

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should create Connection for each endpoint` | Connection creation |
| 🧪 Unit | `getConnection should return current Connection` | Connection access |
| 🧪 Unit | `getCurrentEndpoint should return active endpoint` | Endpoint access |
| 🧪 Unit | `executeWithFailover should try primary first` | Primary first |
| 🧪 Unit | `executeWithFailover should failover on error` | Failover |
| 🧪 Unit | `executeWithFailover should try all endpoints` | Full failover |
| 🧪 Unit | `rotateToNextEndpoint should switch endpoint` | Rotation |
| 🧪 Unit | `performHealthChecks should check all endpoints` | Health checks |
| 🧪 Unit | `performHealthChecks should run every 30s` | Interval |
| 🧪 Unit | `markEndpointHealthy should update status` | Manual control |
| 🧪 Unit | `stop should clear interval` | Cleanup |
| 🔗 Integration | `should failover on RPC failure` | Failover |
| 🔗 Integration | `should recover to primary when healthy` | Recovery |

#### `src/services/TransactionConfirmationService.ts` - Transaction Confirmation Service

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `confirmTransaction should use built-in confirm` | Confirmation |
| 🧪 Unit | `confirmTransaction should use finalized by default` | Default commitment |
| 🧪 Unit | `confirmTransaction should timeout after 60s` | Timeout |
| 🧪 Unit | `confirmTransaction should return error if failed` | Error detection |
| 🧪 Unit | `getTransactionStatus should return status` | Status query |
| 🧪 Unit | `confirmTransactions should batch confirm` | Batch |
| 🧪 Unit | `pollForConfirmation should poll every 2s` | Polling |
| 🧪 Unit | `checkCommitmentLevel should verify commitment` | Verification |
| 🧪 Unit | `getTransaction should retry 3 times` | Retry |
| 🔗 Integration | `should confirm real transaction` | Real confirmation |

---

### 11. Utils

#### `src/utils/blockchain-metrics.ts` - Blockchain Metrics

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `recordMintSuccess should increment counter` | Counter |
| 🧪 Unit | `recordMintSuccess should observe duration` | Histogram |
| 🧪 Unit | `recordMintFailure should increment with reason` | Label |
| 🧪 Unit | `recordMetadataUpload should track uploads` | Upload metrics |
| 🧪 Unit | `recordCollectionCreation should increment` | Collection metrics |
| 🧪 Unit | `recordRPCCall should track RPC calls` | RPC metrics |
| 🧪 Unit | `recordQueueJob should track queue jobs` | Queue metrics |

#### `src/utils/circuit-breaker.ts` - Circuit Breaker

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `withCircuitBreaker should start CLOSED` | Initial state |
| 🧪 Unit | `withCircuitBreaker should open after threshold` | State transition |
| 🧪 Unit | `withCircuitBreaker should transition to HALF_OPEN` | Recovery |
| 🧪 Unit | `withCircuitBreaker should close from HALF_OPEN` | Recovery success |
| 🧪 Unit | `withCircuitBreaker should use rolling window` | Window reset |
| 🧪 Unit | `withRetry should use exponential backoff` | Backoff |
| 🧪 Unit | `solana-rpc circuit should have threshold=5` | Pre-config |
| 🧪 Unit | `treasury-wallet circuit should have threshold=3` | Pre-config |
| 🔗 Integration | `should complete full state cycle` | Full cycle |

#### `src/utils/distributed-lock.ts` - Distributed Lock

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `withLock should acquire Redis lock` | Lock acquisition |
| 🧪 Unit | `withLock should use Lua script for release` | Atomic release |
| 🧪 Unit | `withLock should fall back to memory` | Fallback |
| 🧪 Unit | `withLock should retry 3 times` | Retry |
| 🧪 Unit | `withLock should use 30s default TTL` | TTL |
| 🧪 Unit | `createMintLockKey should format correctly` | Key format |
| 🔗 Integration | `should prevent concurrent access` | Mutual exclusion |
| 🔗 Integration | `lock should expire after TTL` | Expiration |

#### `src/utils/logger.ts` - Logger

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `should detect sensitive field password` | Field detection |
| 🧪 Unit | `should detect JWT pattern` | Pattern detection |
| 🧪 Unit | `should detect Solana key pattern` | Pattern detection |
| 🧪 Unit | `should detect email pattern` | Pattern detection |
| 🧪 Unit | `sanitizeValue should redact JWT` | Redaction |
| 🧪 Unit | `sanitizeValue should redact Solana keys` | Redaction |
| 🧪 Unit | `sanitizeObject should redact nested` | Deep redaction |
| 🧪 Unit | `sanitizeObject should respect max depth` | Depth limit |
| 🧪 Unit | `sanitizeObject should truncate long strings` | Truncation |
| 🔗 Integration | `logs should never contain secrets` | Security |

#### `src/utils/metrics.ts` - Metrics

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `rpcRequestsTotal should be Counter` | Metric type |
| 🧪 Unit | `rpcRequestDuration should be Histogram` | Metric type |
| 🧪 Unit | `transactionsSubmitted should be Counter` | Metric type |
| 🧪 Unit | `mintsInitiated should be Counter` | Metric type |
| 🧪 Unit | `treasuryBalance should be Gauge` | Metric type |
| 🧪 Unit | `circuitBreakerState should be Gauge` | Metric type |
| 🧪 Unit | `queueJobsAdded should be Counter` | Metric type |
| 🧪 Unit | `recordHttpRequest should update metrics` | Helper |
| 🧪 Unit | `recordRpcRequest should update metrics` | Helper |
| 🧪 Unit | `trackMintOperation should update metrics` | Helper |

#### `src/utils/retry.ts` - Retry

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `retryOperation should retry on failure` | Retry |
| 🧪 Unit | `retryOperation should use exponential backoff` | Backoff |
| 🧪 Unit | `retryOperation should respect maxAttempts` | Limit |
| 🧪 Unit | `retryOperation should check retryable errors` | Error filtering |
| 🧪 Unit | `retryOperation should log retries` | Logging |

---

### 12. Wallets

#### `src/wallets/feeManager.ts` - Fee Manager

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `calculateMintingFee should include rent exemption` | Fee calculation |
| 🧪 Unit | `calculateTransferFee should exclude rent` | Fee calculation |
| 🧪 Unit | `getOptimalPriorityFee should fetch recent fees` | Fee query |
| 🧪 Unit | `getOptimalPriorityFee should calculate median` | Median |
| 🧪 Unit | `getOptimalPriorityFee should cap at max` | Capping |
| 🧪 Unit | `ensureSufficientBalance should check balance` | Balance check |

#### `src/wallets/treasury.ts` - Treasury Wallet

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `initialize should load wallet from file` | Load |
| 🧪 Unit | `initialize should generate new wallet if missing` | Generation |
| 🧪 Unit | `initialize should save to database` | DB storage |
| 🧪 Unit | `initialize should check balance` | Balance check |
| 🧪 Unit | `initialize should warn if balance < 0.1 SOL` | Low balance |
| 🧪 Unit | `initialize should be idempotent` | Idempotency |
| 🧪 Unit | `getBalance should return SOL balance` | Balance |
| 🧪 Unit | `signTransaction should sign with keypair` | Signing |

#### `src/wallets/userWallet.ts` - User Wallet Manager

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `isValidSolanaAddress should validate Base58` | Validation |
| 🧪 Unit | `isValidSolanaAddress should validate length` | Length |
| 🧪 Unit | `isValidSolanaAddress should use PublicKey` | PublicKey check |
| 🧪 Unit | `generateConnectionNonce should create 32-byte nonce` | Nonce generation |
| 🧪 Unit | `generateConnectionNonce should store in Redis` | Redis storage |
| 🧪 Unit | `generateConnectionNonce should set 5min TTL` | TTL |
| 🧪 Unit | `verifyAndConsumeNonce should verify and delete` | One-time use |
| 🧪 Unit | `verifyAndConsumeNonce should check user match` | User validation |
| 🧪 Unit | `verifyAndConsumeNonce should check expiry` | Expiration |
| 🧪 Unit | `checkWalletConnectionRateLimit should limit user` | User rate limit |
| 🧪 Unit | `checkWalletConnectionRateLimit should limit IP` | IP rate limit |
| 🧪 Unit | `checkWalletConnectionRateLimit should use 60s window` | Window |
| 🧪 Unit | `connectWallet should verify rate limits` | Rate limiting |
| 🧪 Unit | `connectWallet should validate address` | Address validation |
| 🧪 Unit | `connectWallet should verify nonce` | Nonce verification |
| 🧪 Unit | `connectWallet should verify signature` | Signature verification |
| 🧪 Unit | `connectWallet should restore soft-deleted wallet` | Restoration |
| 🧪 Unit | `connectWallet should set as primary` | Primary management |
| 🧪 Unit | `disconnectWallet should soft delete` | Soft delete |
| 🧪 Unit | `disconnectWallet should set deleted_at` | Timestamp |
| 🧪 Unit | `disconnectWallet should log in audit table` | Audit |
| 🧪 Unit | `disconnectWallet should promote new primary` | Primary promotion |
| 🔗 Integration | `nonce replay should be blocked` | Replay protection |
| 🔗 Integration | `rate limit should be enforced` | Rate limiting |
| 🔗 Integration | `soft delete should work correctly` | Soft delete |
| 🌐 E2E | `full wallet connection flow` | Full flow |

---

### 13. Workers

#### `src/workers/mint-worker.ts` - Mint Worker

| Test Type | Test Name | Description |
|-----------|-----------|-------------|
| 🧪 Unit | `initializeWallet should load from env` | Wallet loading |
| 🧪 Unit | `initializeWallet should generate if missing` | Generation |
| 🧪 Unit | `start should connect to RabbitMQ` | RabbitMQ |
| 🧪 Unit | `start should fall back to polling` | Polling fallback |
| 🧪 Unit | `processMintJob should fetch ticket details` | Ticket query |
| 🧪 Unit | `processMintJob should get venue wallet` | Venue wallet |
| 🧪 Unit | `processMintJob should configure creators 50/50` | Royalty split |
| 🧪 Unit | `processMintJob should build NFT metadata` | Metadata |
| 🧪 Unit | `processMintJob should mint via Metaplex` | Minting |
| 🧪 Unit | `processMintJob should confirm transaction` | Confirmation |
| 🧪 Unit | `processMintJob should update ticket in DB` | DB update |
| 🧪 Unit | `processMintJob should update job status` | Job update |
| 🧪 Unit | `processMintJob should publish success event` | Event |
| 🔗 Integration | `should process mint job end-to-end` | Full flow |
| 🌐 E2E | `should mint real NFT with royalties` | Real mint |

---

## Summary

| Section | Unit | Integration | E2E |
|---------|------|-------------|-----|
| 1. Entry Point | ~35 | ~12 | ~0 |
| 2. Configuration | ~85 | ~18 | ~2 |
| 3. Errors | ~45 | ~0 | ~0 |
| 4. Listeners | ~35 | ~5 | ~0 |
| 5. Middleware | ~155 | ~12 | ~8 |
| 6. Migrations | ~45 | ~12 | ~0 |
| 7. Queues | ~95 | ~8 | ~4 |
| 8. Routes | ~65 | ~3 | ~0 |
| 9. Schemas | ~25 | ~0 | ~0 |
| 10. Services | ~85 | ~8 | ~2 |
| 11. Utils | ~125 | ~10 | ~0 |
| 12. Wallets | ~85 | ~10 | ~2 |
| 13. Workers | ~25 | ~2 | ~2 |
| **Total** | **~905** | **~100** | **~20** |

**Grand Total: ~1,025 Tests**

---

## Testing Dependencies

### Required Mocks

- `@solana/web3.js` - Connection, PublicKey, Keypair, Transaction
- `@metaplex-foundation/js` - Metaplex, keypairIdentity, bundlrStorage
- `pg` - PostgreSQL Pool and Client
- `ioredis` - Redis client
- `bull` - BullMQ for job queues
- `jsonwebtoken` - JWT signing/verification
- `winston` - Logger
- `nacl` - Ed25519 signature verification

### Required Test Infrastructure

- PostgreSQL test instance (with RLS support)
- Redis test instance (with TLS support)
- Solana devnet connection for integration tests
- RabbitMQ (optional, for queue tests)

### Environment Variables for Testing
```bash
NODE_ENV=test
DATABASE_URL=postgresql://test:test@localhost:5432/blockchain_test
REDIS_URL=redis://localhost:6379
SOLANA_NETWORK=devnet
SOLANA_RPC_URL=https://api.devnet.solana.com
JWT_SECRET=test-secret-minimum-32-characters-long
TREASURY_PRIVATE_KEY=[test-keypair-array]
BUNDLR_ADDRESS=https://devnet.bundlr.network
DEFAULT_PRIORITY_FEE=1000
MIN_PRIORITY_FEE=100
MAX_PRIORITY_FEE=100000
```

---

## Test Execution Order

1. **Unit Tests** - Fast, isolated, no external dependencies
2. **Integration Tests** - Database, Redis, RPC connections
3. **E2E Tests** - Full system tests with real blockchain

---

## Coverage Goals

| Component | Target Coverage |
|-----------|----------------|
| Critical Paths (Minting, Auth, RLS) | 100% |
| Business Logic | 95% |
| Utils & Helpers | 90% |
| Routes & Controllers | 85% |
| Overall | 90%+ |

