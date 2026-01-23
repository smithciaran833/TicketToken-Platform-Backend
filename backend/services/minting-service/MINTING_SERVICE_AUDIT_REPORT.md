# Minting Service Comprehensive Audit Report

**Service**: minting-service
**Audit Date**: 2026-01-23
**Auditor**: Claude Code
**Version**: 1.0.0
**Location**: `backend/services/minting-service/`

---

## Executive Summary

The minting-service is a well-architected Solana NFT minting microservice responsible for:
- Creating compressed NFTs for tickets on Solana blockchain
- Bridging RabbitMQ messages to Bull job queues for processing
- Managing wallet balances, spending limits, and reconciliation
- Providing comprehensive health, metrics, and admin endpoints

**Overall Assessment**: Strong implementation with sophisticated blockchain integration, comprehensive security measures, and excellent observability. A few areas need attention around hardcoded credentials and production SSL configuration.

### Key Metrics
| Metric | Value |
|--------|-------|
| Source Files | 56 TypeScript files |
| Test Files | 45 test files |
| Database Tables | 6 (5 tenant-scoped, 1 audit) |
| External Services | Solana RPC, RabbitMQ, Redis, PostgreSQL, IPFS/Pinata |
| API Routes | 5 route groups (health, metrics, admin, webhook, internal) |

---

## 1. Service Capabilities

### 1.1 Core Functionality

1. **NFT Minting**
   - Compressed NFT minting via Metaplex Bubblegum protocol
   - Batch minting support (up to 100 tickets per batch)
   - Automatic metadata upload to IPFS via Pinata
   - Dynamic priority fee calculation for transaction success

2. **Queue Management**
   - RabbitMQ-to-Bull queue bridge pattern
   - Dead Letter Queue (DLQ) for failed jobs
   - Stale job detection and recovery
   - Load shedding during capacity overflow

3. **Reconciliation**
   - Periodic mint status verification
   - On-chain vs. database state reconciliation
   - Automated stale mint recovery
   - Comprehensive reconciliation reports

4. **Monitoring & Observability**
   - Prometheus metrics (50+ custom metrics)
   - Structured JSON logging with PII sanitization
   - Health check endpoints (live, ready, startup, detailed)
   - Circuit breaker status reporting

### 1.2 API Endpoints

| Route Group | Prefix | Purpose |
|-------------|--------|---------|
| Health | `/health/*` | Kubernetes probes, service health |
| Metrics | `/metrics` | Prometheus scraping |
| Admin | `/admin/*` | Queue management, reconciliation |
| Webhook | `/api/webhooks/*` | External event triggers |
| Internal | `/internal/*` | Service-to-service minting |

---

## 2. Database Schema

### 2.1 Tables (6 Total)

#### Tenant-Scoped Tables (5)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `collections` | NFT collection metadata | name, symbol, contract_address, max_supply |
| `nft_mints` | Mint operation tracking | ticket_id, status, transaction_signature, asset_id |
| `nfts` | Minted NFT records | token_id, owner_address, metadata_uri |
| `ticket_mints` | Ticket-to-mint mapping | venue_id, status, mint_duration |
| `minting_reconciliation_reports` | Reconciliation results | discrepancy_count, confirmed, errors |

#### Global Table (1)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `nft_mints_audit` | Audit trail for all mint operations | operation, old_data, new_data, changed_at |

### 2.2 Row-Level Security (RLS)

All tenant-scoped tables implement proper RLS:

```sql
CREATE POLICY {table}_tenant_isolation ON {table}
  FOR ALL
  USING (
    tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    OR current_setting('app.is_system_user', true) = 'true'
  )
  WITH CHECK (...)
```

**Strengths**:
- `FORCE ROW LEVEL SECURITY` enabled on all tenant tables
- System user bypass properly implemented
- No default zero UUID on tenant_id (security hole fixed)

### 2.3 CHECK Constraints

The `nft_mints` table has comprehensive constraints:

| Constraint | Validation |
|------------|------------|
| `ck_nft_mints_status` | IN ('pending', 'minting', 'completed', 'failed', 'cancelled') |
| `ck_nft_mints_retry_count` | 0 <= retry_count <= 10 |
| `ck_nft_mints_blockchain` | IN ('solana', 'solana-devnet', 'solana-testnet') |
| `ck_nft_mints_mint_address_length` | 32-64 characters |
| `ck_nft_mints_signature_length` | 64-128 characters |
| `ck_nft_mints_metadata_uri_format` | Must match `^(https?://|ipfs://|ar://)` |
| `ck_nft_mints_completed_at` | completed_at NOT NULL when status = 'completed' |
| `ck_nft_mints_timestamps` | created_at <= updated_at |

### 2.4 Indexes

Well-indexed for common query patterns:
- Partial index on `asset_id` (WHERE NOT NULL)
- Composite indexes: `(tenant_id, ticket_id)`, `(venue_id, status)`
- Audit table indexes on `mint_id`, `tenant_id`, `changed_at`

---

## 3. Security Analysis

### 3.1 Authentication Mechanisms

| Mechanism | Location | Implementation |
|-----------|----------|----------------|
| HMAC-SHA256 | `internal-auth.middleware.ts` | Request signing for internal services |
| Admin Auth | `admin-auth.ts` | Shared secret verification |
| Webhook Auth | `webhook.ts` | Signature verification with idempotency |

#### HMAC Implementation (Lines 20-50)
```typescript
const hmac = crypto.createHmac('sha256', internalSecret);
hmac.update(`${method}${path}${body}${timestamp}`);
const expectedSignature = hmac.digest('hex');
```

**Strengths**:
- Timestamp validation (5-minute tolerance)
- Path-based replay prevention
- Body included in signature

**Findings**:
- **[CRITICAL]** Hardcoded fallback credential in `admin-auth.ts`:
  ```typescript
  const adminSecret = process.env.ADMIN_SECRET || 'admin-secret';
  ```
  **Recommendation**: Remove fallback, fail if not configured.

### 3.2 Secrets Management

**Location**: `src/config/secrets.ts`

Supports:
- AWS Secrets Manager
- HashiCorp Vault
- Environment variables (development)

**Required Secrets** (validated at startup):
| Secret | Min Length | Purpose |
|--------|------------|---------|
| `JWT_SECRET` | 32 | JWT signing |
| `INTERNAL_SERVICE_SECRET` | 32 | HMAC auth |
| `WEBHOOK_SECRET` | 32 | Webhook verification |
| `DB_PASSWORD` | 8 | Database access |

**Validation**: `validate-config.ts` enforces 64+ characters in production.

### 3.3 Input Validation

**Framework**: Zod schemas in `src/schemas/validation.ts`

| Schema | Validation Rules |
|--------|-----------------|
| `internalMintRequestSchema` | UUID format, address length 32-64 |
| `batchMintSchema` | Max 100 tickets per batch |
| `nftMetadataSchema` | Metaplex standard compliance |
| `ticketMetadataSchema` | String length limits enforced |

**String Length Limits**:
```typescript
const STRING_LIMITS = {
  SHORT: 50,      // Seat numbers, sections
  NAME: 100,      // Names, titles
  DESCRIPTION: 1000,
  URL: 2048,
  SYMBOL: 10
}
```

### 3.4 Response Filtering

**Location**: `src/utils/response-filter.ts`

Sensitive fields automatically redacted:
```typescript
const SENSITIVE_FIELDS = [
  'password', 'privateKey', 'api_key', 'token',
  'jwt', 'secret', 'credential', 'ssn', 'creditCard'
]
```

### 3.5 Log Sanitization

**Location**: `src/utils/logger.ts`

PII/secret patterns detected and redacted:
- JWT tokens: `eyJ...` → `[TOKEN_REDACTED]`
- Email addresses → `[EMAIL_REDACTED]`
- Base58 private keys (87-88 chars)
- API key patterns (`sk_*`, `pk_*`, etc.)

### 3.6 Security Issues Found

| Severity | Issue | Location | Recommendation |
|----------|-------|----------|----------------|
| **CRITICAL** | Hardcoded admin secret fallback | `admin-auth.ts:11` | Remove fallback |
| **HIGH** | No SSL verification for RabbitMQ | `rabbitmq.ts` | Add TLS configuration |
| **MEDIUM** | knexfile.ts SSL `rejectUnauthorized: false` | `knexfile.ts:42` | Verify CA in production |

---

## 4. Code Quality

### 4.1 Architecture Patterns

**Strengths**:
1. **Clean Separation**: Routes → Services → Models → Database
2. **Error Hierarchy**: Custom error classes with codes and status
3. **Singleton Pattern**: Properly implemented for Redis, Redlock clients
4. **Circuit Breaker**: Opossum for Solana RPC and IPFS calls

### 4.2 Error Handling

**Error Class Hierarchy** (in `src/errors/index.ts`):
```
BaseError
├── MintingError
├── SolanaError
├── ValidationError
├── TenantError
├── IPFSError
├── AuthenticationError
└── RateLimitError
```

Each error includes:
- `code`: Enum for programmatic handling
- `statusCode`: HTTP status
- `context`: Debugging details
- `isOperational`: Flag for graceful handling

### 4.3 TypeScript Quality

**Strengths**:
- Strict typing throughout
- Zod schema inference: `z.infer<typeof schema>`
- Type guards for error checking
- Proper async/await patterns

**Minor Issues**:
- Some `any` types in RabbitMQ message parsing
- Could benefit from stricter `unknown` handling

### 4.4 Code Organization

```
src/
├── config/          # 7 files - Environment, connections
├── controllers/     # (empty - logic in routes)
├── errors/          # 1 file - Error classes
├── jobs/            # 1 file - Scheduled tasks
├── middleware/      # 7 files - Request processing
├── migrations/      # 7 files - Database schema
├── models/          # 3 files - Data models
├── queues/          # 1 file - Bull queue management
├── routes/          # 8 files - HTTP endpoints
├── schemas/         # 1 file - Zod validation
├── services/        # 11 files - Business logic
├── utils/           # 8 files - Helpers
├── validators/      # 1 file - Request validation
├── workers/         # 1 file - Job processors
└── index.ts         # Entry point
```

---

## 5. Service Integration

### 5.1 Inter-Service Communication

| Service | Protocol | Purpose |
|---------|----------|---------|
| blockchain-service | RabbitMQ | Receives mint requests |
| ticket-service | HTTP/HMAC | Updates ticket NFT status |
| event-service | HTTP/HMAC | Fetches event metadata |
| venue-service | HTTP/HMAC | Validates venue for minting |

### 5.2 RabbitMQ Bridge Pattern

**Problem Solved**: blockchain-service publishes to RabbitMQ, but minting worker uses Bull.

**Solution** (`src/config/rabbitmq.ts`):
```
blockchain-service --RabbitMQ--> [Bridge Consumer] --Bull--> mintingWorker
```

**Queue Bindings**:
| Queue | Routing Keys |
|-------|--------------|
| `ticket.mint` | `ticket.mint`, `mint.request`, `ticket.mint.*` |
| `minting.mint-success` | `mint.success`, `mint.completed` |

### 5.3 External Services

| Service | Library | Configuration |
|---------|---------|---------------|
| Solana RPC | `@solana/web3.js` | Multiple endpoints with failover |
| Metaplex | `@metaplex-foundation/*` | Bubblegum for cNFTs |
| IPFS | Pinata API | Metadata storage |
| Redis | `ioredis` | Rate limiting, caching, locks |
| PostgreSQL | `knex` | Primary data storage |

---

## 6. Application Setup

### 6.1 Startup Sequence

**Location**: `src/index.ts:347-465`

```
1. Load secrets (AWS/Vault/env)
2. Validate configuration
3. Initialize database
4. Initialize Solana connection
5. Initialize Bull queues
6. Start minting worker
7. Initialize RabbitMQ consumer (bridge)
8. Start balance monitoring
9. Register middleware
10. Register routes
11. Start HTTP server
```

### 6.2 Middleware Stack

| Order | Middleware | Purpose |
|-------|------------|---------|
| 1 | request-id | UUID tracking |
| 2 | request-logger | Structured logging |
| 3 | helmet | Security headers |
| 4 | rate-limit | Redis-backed limiting |
| 5 | route handlers | Business logic |

### 6.3 Graceful Shutdown

**Location**: `src/index.ts:129-201`

Shutdown order:
1. Stop accepting new requests (close HTTP)
2. Stop balance monitoring
3. Close RabbitMQ consumer
4. Close Bull queue workers
5. Close database connections

**Timeout**: 30 seconds before forced exit.

### 6.4 Rate Limiting

**Configuration**:
```typescript
{
  global: true,
  max: 100,
  timeWindow: '1 minute',
  redis: redisClient,
  keyGenerator: (req) => req.user?.tenant_id || req.ip
}
```

**Bypass Paths**: `/health/*`, `/metrics`

---

## 7. Background Jobs

### 7.1 Bull Queue Configuration

**Location**: `src/queues/mintQueue.ts`

| Queue | Purpose | Concurrency |
|-------|---------|-------------|
| `ticket-minting` | NFT minting jobs | 5 (configurable) |
| `ticket-minting-retry` | Failed job retries | 2 |
| `ticket-minting-dlq` | Dead letter storage | N/A |

**Job Options**:
```typescript
{
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 5000
  },
  removeOnComplete: 100,
  removeOnFail: 1000,
  timeout: 5 * 60 * 1000  // 5 minutes
}
```

### 7.2 Stale Job Detection

**Location**: `src/queues/mintQueue.ts:200-250`

- Jobs older than 30 minutes in 'active' status
- Automatically moved to retry queue
- Metrics tracked: `minting_stale_jobs_detected_total`

### 7.3 Load Shedding

**Location**: `src/middleware/load-shedding.ts`

**Thresholds**:
| Metric | Shed at | Reject at |
|--------|---------|-----------|
| Queue Depth | 500 | 1000 |
| Memory Usage | 80% | 90% |
| CPU Usage | 80% | N/A |

### 7.4 Reconciliation Job

**Location**: `src/jobs/reconciliation.ts`

Scheduled via admin endpoint or external cron:
1. Find mints stuck in 'pending' > 1 hour
2. Check on-chain status via DAS
3. Update database to match chain
4. Generate reconciliation report

---

## 8. Blockchain Integration

### 8.1 Solana Connection Management

**Location**: `src/utils/solana.ts`

**RPC Failover**:
```typescript
interface RpcEndpoint {
  url: string;
  name: string;
  weight: number;      // Higher = preferred
  healthy: boolean;
  consecutiveFailures: number;
}
```

- Primary + fallback endpoints
- 3 consecutive failures → mark unhealthy
- 5-minute cooldown before retry
- Metrics: `minting_solana_rpc_failover_total`

### 8.2 Dynamic Priority Fees

**Location**: `src/utils/solana.ts:282-378`

```typescript
const MIN_PRIORITY_FEE = 1000;      // microlamports
const MAX_PRIORITY_FEE = 1000000;   // microlamports
const DEFAULT_PRIORITY_FEE = 50000;
```

Calculation:
1. Query `getRecentPrioritizationFees`
2. Calculate median of recent fees
3. Add 20% buffer
4. Clamp to min/max range
5. Cache for 10 seconds

### 8.3 Compressed NFT Minting

**Location**: `src/services/RealCompressedNFT.ts`

Uses Metaplex Bubblegum protocol:
- State compression for low-cost NFTs
- Merkle tree for ownership proofs
- ~0.00001 SOL per mint vs ~0.01 SOL for regular NFTs

### 8.4 Transaction Confirmation

**Commitment Levels**:
| Operation | Commitment | Timeout |
|-----------|------------|---------|
| Regular mints | `confirmed` | 60s |
| Critical mints | `finalized` | 90s |

**Retry Strategy**:
- Fresh blockhash per attempt
- Jitter on retry delays
- Max 3 attempts before DLQ

### 8.5 Wallet Management

**Location**: `src/config/wallet-provider.ts`

Supports multiple wallet types:
| Type | Use Case | Configuration |
|------|----------|---------------|
| File | Development | `WALLET_PATH` |
| KMS | Production | `WALLET_KMS_KEY_ID` |
| Hardware | High-security | `WALLET_HARDWARE_PATH` |

### 8.6 Spending Limits

**Location**: `src/utils/spending-limits.ts`

| Limit | Default | Env Var |
|-------|---------|---------|
| Per Transaction | 0.5 SOL | `TX_LIMIT_SOL` |
| Daily | 10.0 SOL | `DAILY_LIMIT_SOL` |
| Hourly | 2.0 SOL | `HOURLY_LIMIT_SOL` |

Stored in Redis with automatic expiry.

### 8.7 Balance Monitoring

**Location**: `src/services/BalanceMonitor.ts`

- Periodic balance checks (configurable interval)
- Alerts at threshold (default: 0.5 SOL)
- Metrics: `wallet_balance_sol`

---

## 9. Test Coverage

### 9.1 Test Summary

| Category | Files | Coverage Areas |
|----------|-------|----------------|
| Utils | 9 | logger, circuit-breaker, distributed-lock, metrics, response-filter, solana, spending-limits, validate-config |
| Models | 3 | Mint, Collection, NFT |
| Middleware | 7 | admin-auth, internal-auth, tenant-context, load-shedding, request-id, request-logger, webhook-idempotency |
| Services | 9 | MintingOrchestrator, MetadataService, DASClient, RealCompressedNFT, BalanceMonitor, BatchMintingService, MetadataCache, PaymentIntegration, RPCManager, ReconciliationService, blockchain.service |
| Config | 6 | database, redis, secrets, ipfs, wallet-provider, solana |
| Queues/Workers | 2 | mintQueue, mintingWorker |
| Jobs | 1 | reconciliation |
| Schemas | 2 | validation, mint.schemas |
| Integration | 2 | hmac-integration, rabbitmq-bull-bridge |

**Total Test Files**: 45

### 9.2 Coverage Gaps

| Area | Gap | Priority |
|------|-----|----------|
| Routes | No direct route tests | Medium |
| Integration | Limited end-to-end tests | High |
| Error Paths | Some blockchain error scenarios | Medium |

### 9.3 Test Patterns

- Jest with `@swc/jest` for fast compilation
- Mocked external services (Solana, IPFS, Redis)
- Test helpers in `tests/setup.ts`

---

## 10. Type Safety

### 10.1 Type Definitions

**Zod-Inferred Types**:
```typescript
export type InternalMintRequest = z.infer<typeof internalMintRequestSchema>;
export type BatchMintRequest = z.infer<typeof batchMintSchema>;
export type NFTMetadata = z.infer<typeof nftMetadataSchema>;
```

**Interface Definitions**:
```typescript
interface IMint {
  id?: string;
  tenant_id?: string;
  ticket_id: string;
  status: 'pending' | 'minting' | 'completed' | 'failed';
  transaction_hash?: string;
  // ...
}
```

### 10.2 Type Guards

**Location**: `src/errors/index.ts:552-599`

```typescript
export function isBaseError(error: unknown): error is BaseError
export function isMintingError(error: unknown): error is MintingError
export function isSolanaError(error: unknown): error is SolanaError
// ... etc
```

### 10.3 Type Issues

| Issue | Location | Impact |
|-------|----------|--------|
| `any` in message parsing | `rabbitmq.ts:415` | Type safety reduced |
| Implicit `any` returns | Some service methods | IDE assistance reduced |

---

## 11. Findings Summary

### 11.1 Critical Issues

| # | Issue | Location | Recommendation |
|---|-------|----------|----------------|
| 1 | Hardcoded admin secret fallback | `admin-auth.ts:11` | Remove fallback, require env var |

### 11.2 High Priority

| # | Issue | Location | Recommendation |
|---|-------|----------|----------------|
| 1 | No TLS for RabbitMQ | `rabbitmq.ts` | Add SSL/TLS configuration |
| 2 | SSL verification disabled | `knexfile.ts:42` | Verify CA in production |

### 11.3 Medium Priority

| # | Issue | Location | Recommendation |
|---|-------|----------|----------------|
| 1 | No route-level tests | `tests/` | Add integration tests |
| 2 | `any` types in message parsing | `rabbitmq.ts` | Add proper types |
| 3 | Missing error handling metrics | Various | Add failure counters |

### 11.4 Low Priority / Improvements

| # | Improvement | Recommendation |
|---|-------------|----------------|
| 1 | Documentation | Add JSDoc to public APIs |
| 2 | Circuit breaker metrics | Expose to Prometheus |
| 3 | Queue visualization | Bull Board already present, ensure accessible |

---

## 12. Comparison with Venue Service Audit

| Aspect | Minting Service | Venue Service | Notes |
|--------|-----------------|---------------|-------|
| RLS Implementation | ✅ FORCE enabled | ✅ FORCE enabled | Equal |
| CHECK Constraints | ✅ 8 constraints | ✅ Comprehensive | Minting slightly better |
| Audit Logging | ✅ Dedicated table | ✅ Trigger-based | Equal |
| Secret Management | ✅ AWS/Vault/Env | ⚠️ Env only | Minting better |
| Circuit Breakers | ✅ Solana + IPFS | ✅ External services | Equal |
| Metrics | ✅ 50+ metrics | ✅ 30+ metrics | Minting more comprehensive |
| Test Coverage | 45 test files | 35 test files | Minting better |
| Hardcoded Secrets | ⚠️ 1 found | ⚠️ 1 found | Both need fixes |

---

## FILES ANALYZED

### Configuration Files (2)
- `package.json`
- `knexfile.ts`

### Source Files by Directory

#### src/config/ (7 files)
- `database.ts`
- `ipfs.ts`
- `rabbitmq.ts`
- `redis.ts`
- `secrets.ts`
- `solana.ts`
- `wallet-provider.ts`

#### src/errors/ (1 file)
- `index.ts`

#### src/jobs/ (1 file)
- `reconciliation.ts`

#### src/middleware/ (7 files)
- `admin-auth.ts`
- `internal-auth.middleware.ts`
- `load-shedding.ts`
- `request-id.ts`
- `request-logger.ts`
- `tenant-context.ts`
- `webhook-idempotency.ts`

#### src/migrations/ (7 files)
- `001_consolidated_baseline.ts`
- `archived/001_baseline_minting.ts`
- `archived/20260102_add_check_constraints.ts`
- `archived/20260102_add_foreign_keys.ts`
- `archived/20260102_add_rls_policies.ts`
- `archived/20260102_create_app_user_role.ts`
- `archived/20260102_migration_best_practices.ts`

#### src/models/ (3 files)
- `Collection.ts`
- `Mint.ts`
- `NFT.ts`

#### src/queues/ (1 file)
- `mintQueue.ts`

#### src/routes/ (8 files)
- `admin.ts`
- `bull-board.ts`
- `health.routes.ts`
- `health.ts`
- `internal-mint.ts`
- `metrics.routes.ts`
- `metrics.ts`
- `webhook.ts`

#### src/schemas/ (1 file)
- `validation.ts`

#### src/services/ (11 files)
- `BalanceMonitor.ts`
- `BatchMintingService.ts`
- `blockchain.service.ts`
- `DASClient.ts`
- `MetadataCache.ts`
- `MetadataService.ts`
- `MintingOrchestrator.ts`
- `PaymentIntegration.ts`
- `RealCompressedNFT.ts`
- `ReconciliationService.ts`
- `RPCManager.ts`

#### src/utils/ (8 files)
- `circuit-breaker.ts`
- `distributed-lock.ts`
- `logger.ts`
- `metrics.ts`
- `response-filter.ts`
- `solana.ts`
- `spending-limits.ts`
- `validate-config.ts`

#### src/validators/ (1 file)
- `mint.schemas.ts`

#### src/workers/ (1 file)
- `mintingWorker.ts`

#### src/ (1 file)
- `index.ts`

### Test Files (45 files)
- `tests/hmac-integration.test.ts`
- `tests/setup.ts`
- `tests/unit/config/*.test.ts` (6 files)
- `tests/unit/errors/index.test.ts`
- `tests/unit/jobs/reconciliation.test.ts`
- `tests/unit/middleware/*.test.ts` (7 files)
- `tests/unit/models/*.test.ts` (3 files)
- `tests/unit/queues/mintQueue.test.ts`
- `tests/unit/rabbitmq-bull-bridge.test.ts`
- `tests/unit/schemas/validation.test.ts`
- `tests/unit/services/*.test.ts` (11 files)
- `tests/unit/utils/*.test.ts` (9 files)
- `tests/unit/validators/mint.schemas.test.ts`
- `tests/unit/workers/mintingWorker.test.ts`
- `tests/unit/index.test.ts`

**Total Files Analyzed**: 100+ files (56 source, 45 tests, 2 config)

---

## Appendix A: Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MINTING_SERVICE_PORT` | No | 3018 | HTTP port |
| `NODE_ENV` | Yes | development | Environment |
| `DB_HOST` | Yes | localhost | Database host |
| `DB_PORT` | No | 6432 | Database port (PgBouncer) |
| `DB_NAME` | No | tickettoken_db | Database name |
| `DB_USER` | No | postgres | Database user |
| `DB_PASSWORD` | Yes | - | Database password |
| `REDIS_HOST` | No | redis | Redis host |
| `REDIS_PORT` | No | 6379 | Redis port |
| `REDIS_PASSWORD` | No | - | Redis password |
| `RABBITMQ_URL` | No | amqp://admin:admin@rabbitmq:5672 | RabbitMQ connection |
| `SOLANA_RPC_URL` | Yes | - | Primary Solana RPC |
| `SOLANA_RPC_FALLBACK_URLS` | No | - | Comma-separated fallbacks |
| `SOLANA_NETWORK` | No | devnet | Network name |
| `WALLET_PATH` | Conditional | - | Path to wallet keypair |
| `WALLET_KMS_KEY_ID` | Conditional | - | AWS KMS key ID |
| `JWT_SECRET` | Yes | - | JWT signing secret |
| `INTERNAL_SERVICE_SECRET` | Yes | - | HMAC secret |
| `WEBHOOK_SECRET` | Yes | - | Webhook verification |
| `ADMIN_SECRET` | Yes | - | Admin endpoint auth |
| `PINATA_API_KEY` | Yes | - | Pinata API key |
| `PINATA_JWT` | Yes | - | Pinata JWT token |
| `TX_LIMIT_SOL` | No | 0.5 | Per-TX spending limit |
| `DAILY_LIMIT_SOL` | No | 10.0 | Daily spending limit |
| `HOURLY_LIMIT_SOL` | No | 2.0 | Hourly spending limit |
| `MINT_CONCURRENCY` | No | 5 | Parallel mint jobs |

---

*Report generated by Claude Code Audit Tool*
