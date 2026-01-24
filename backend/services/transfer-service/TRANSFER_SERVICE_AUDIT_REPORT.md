# Transfer Service Comprehensive Audit Report

**Service**: transfer-service
**Version**: 1.0.0
**Audit Date**: 2026-01-23
**Auditor**: Claude Code

---

## Table of Contents

1. [Service Capabilities](#1-service-capabilities)
2. [Database Schema](#2-database-schema)
3. [Security Analysis](#3-security-analysis)
4. [Code Quality](#4-code-quality)
5. [Service Integration](#5-service-integration)
6. [Application Setup](#6-application-setup)
7. [Services Deep Dive](#7-services-deep-dive)
8. [Blockchain Integration](#8-blockchain-integration)
9. [Test Coverage](#9-test-coverage)
10. [Type Safety](#10-type-safety)
11. [Files Analyzed Verification](#11-files-analyzed-verification)

---

## 1. Service Capabilities

### Business Purpose
The Transfer Service handles ticket ownership transfers for the TicketToken NFT ticketing platform, including:
- Gift transfers between users
- Sale/marketplace transfers with pricing
- Blockchain-based NFT transfers on Solana
- Batch transfer operations
- Transfer analytics and reporting

### API Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/api/transfers/gift` | Create gift transfer | JWT |
| POST | `/api/transfers/sale` | Create sale transfer | JWT |
| POST | `/api/transfers/:id/accept` | Accept pending transfer | JWT |
| POST | `/api/transfers/:id/cancel` | Cancel pending transfer | JWT |
| GET | `/api/transfers/:id` | Get transfer by ID | JWT |
| GET | `/api/transfers` | List user's transfers | JWT |
| POST | `/internal/transfers/batch` | Batch transfer (internal) | HMAC |
| POST | `/internal/transfers/:id/complete-blockchain` | Complete blockchain transfer | HMAC |
| POST | `/internal/transfers/:id/verify` | Verify transfer | HMAC |
| GET | `/internal/transfers/pending-blockchain` | Get pending blockchain transfers | HMAC |
| GET | `/health` | Health check | None |
| GET | `/health/ready` | Readiness check | None |
| GET | `/metrics` | Prometheus metrics | None |

### Transfer Types Supported
1. **GIFT** - Free transfer between users (email-based recipient)
2. **SALE** - Transfer with payment (marketplace)
3. **RESALE** - Secondary market transfer
4. **PROMOTIONAL** - Promotional/marketing transfers

### Transfer Statuses
- `PENDING` - Transfer initiated, awaiting acceptance
- `ACCEPTED` - Recipient accepted the transfer
- `COMPLETED` - Transfer fully completed (including blockchain)
- `CANCELLED` - Sender cancelled before acceptance
- `EXPIRED` - Transfer expired before acceptance
- `REJECTED` - Recipient rejected the transfer
- `FAILED` - Transfer failed during processing

---

## 2. Database Schema

### Tables Used (Inferred from Code)

#### ticket_transfers
```sql
-- Primary transfer record table
CREATE TABLE ticket_transfers (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    ticket_id UUID NOT NULL,
    from_user_id UUID NOT NULL,
    to_user_id UUID,
    to_email VARCHAR(255),
    to_wallet VARCHAR(255),
    transfer_type VARCHAR(50) NOT NULL,
    transfer_code VARCHAR(50),
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    acceptance_code VARCHAR(50),
    acceptance_code_hash VARCHAR(255),
    message TEXT,
    sale_price DECIMAL(18,2),
    currency VARCHAR(10),
    requires_acceptance BOOLEAN DEFAULT true,
    blockchain_signature VARCHAR(255),
    expires_at TIMESTAMP WITH TIME ZONE,
    accepted_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### ticket_transactions
```sql
-- Transaction history for audit trail
CREATE TABLE ticket_transactions (
    id UUID PRIMARY KEY,
    ticket_id UUID NOT NULL,
    user_id UUID NOT NULL,
    transaction_type VARCHAR(50) NOT NULL,
    amount DECIMAL(18,2),
    status VARCHAR(50),
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Database Access Patterns

| Pattern | Location | Usage |
|---------|----------|-------|
| Direct Pool Query | `search.service.ts:87` | Search operations with JOINs |
| Transaction (BEGIN/COMMIT) | `transfer.service.ts` | Transfer creation/acceptance |
| SELECT FOR UPDATE | `transfer.service.ts` | Locking for concurrent access |
| Parameterized Queries | All services | SQL injection prevention |

### Data Validation
- All database inputs use parameterized queries
- Sort columns validated against whitelist (`search.service.ts:216-223`)
- Pagination limits enforced (default 50, configurable)

---

## 3. Security Analysis

### Authentication & Authorization

| Component | Implementation | Location |
|-----------|---------------|----------|
| JWT Authentication | RS256 via JWKS | `src/middleware/auth.middleware.ts` |
| Internal Auth | HMAC-SHA256 | `src/middleware/internal-auth.middleware.ts` |
| Tenant Isolation | Request context | `src/middleware/tenant-context.ts` |

### Security Issues Found

#### Critical

| ID | Issue | Location | Line | Recommendation |
|----|-------|----------|------|----------------|
| SEC-C1 | Private key in environment variable | `solana.config.ts` | 27 | Use AWS Secrets Manager for all environments |

#### High

| ID | Issue | Location | Line | Recommendation |
|----|-------|----------|------|----------------|
| SEC-H1 | HMAC secret from env (fallback) | `internal-auth.middleware.ts` | 31-34 | Remove env fallback, require secrets manager |
| SEC-H2 | JWT_SECRET in env variable | `app.ts` | implied | Use secrets manager consistently |
| SEC-H3 | Rate limit bypass potential | `rate-limit.ts` | 16-25 | Add rate limit per tenant, not just IP |

#### Medium

| ID | Issue | Location | Line | Recommendation |
|----|-------|----------|------|----------------|
| SEC-M1 | No request signature validation | `transfer.routes.ts` | - | Add request body signing |
| SEC-M2 | Transfer code predictability | `transfer.service.ts` | - | Use cryptographically secure random codes |
| SEC-M3 | No audit logging for cancellations | `transfer.service.ts` | - | Add audit log entry on cancel |

### Input Validation

| Endpoint | Validation | Schema Location |
|----------|------------|-----------------|
| POST /gift | Zod schema | `schemas/validation.ts:13-36` |
| POST /sale | Zod schema | `schemas/validation.ts:38-66` |
| POST /accept | Zod schema | `schemas/validation.ts:68-72` |
| All routes | Request validation middleware | `middleware/validation.middleware.ts` |

### Sensitive Data Handling

**Logger Redaction** (`src/utils/logger.ts:28-111`):
- Passwords, tokens, API keys: REDACTED
- PII (email, phone, SSN): REDACTED
- Blockchain private keys: REDACTED
- Database credentials: REDACTED

**Response Filtering** (`src/utils/response-filter.ts`):
- Sensitive fields removed from responses
- Stack traces removed in production
- Email/wallet addresses masked
- User data filtered for public exposure

---

## 4. Code Quality

### Code Style & Patterns

| Aspect | Assessment | Notes |
|--------|------------|-------|
| TypeScript Usage | Strong | Consistent type annotations, interfaces |
| Error Handling | Good | Custom error classes with status codes |
| Async/Await | Consistent | No callback hell, proper promise handling |
| Code Organization | Good | Clear separation of concerns |
| Comments | Adequate | Business logic documented, audit fix comments |

### Issues Found

#### Medium

| ID | Issue | Location | Line | Impact |
|----|-------|----------|------|--------|
| CQ-M1 | `any` type usage | `search.service.ts` | 64, 118, 269 | Type safety reduced |
| CQ-M2 | Unused parameter `_filters` | `search.service.ts` | 298 | Dead code |
| CQ-M3 | Magic numbers | `graceful-shutdown.ts` | 38, 52 | Should be constants |
| CQ-M4 | Missing error specificity | `circuit-breaker.ts` | 48-52 | Generic error catching |

#### Low

| ID | Issue | Location | Line | Impact |
|----|-------|----------|------|--------|
| CQ-L1 | Console.log in production code | `graceful-shutdown.ts` | 30, 35, etc | Use logger instead |
| CQ-L2 | Inconsistent quote style | Various | - | Minor style issue |
| CQ-L3 | Long functions | `buildSearchQuery` | 111-260 | Consider splitting |

### Complexity Analysis

| File | Cyclomatic Complexity | Notes |
|------|----------------------|-------|
| `search.service.ts:buildSearchQuery` | High (~15) | Many conditional filters |
| `transfer.service.ts:createGiftTransfer` | Medium (~8) | Transaction handling |
| `blockchain-transfer.service.ts` | Medium (~10) | Multiple retry paths |
| `rpc-failover.ts` | High (~12) | Failover logic with health checks |

### Documentation Quality

| Component | Documentation Level |
|-----------|-------------------|
| Public APIs | Good - JSDoc present |
| Internal services | Adequate |
| Utility functions | Good - Clear descriptions |
| Configuration | Good - Inline comments |

---

## 5. Service Integration

### External Service Dependencies

| Service | Client | Protocol | Location |
|---------|--------|----------|----------|
| Ticket Service | `ticketServiceClient` | HTTP | `services/transfer.service.ts` |
| Auth Service | `authServiceClient` | HTTP | `services/transfer.service.ts` |
| Solana RPC | `@solana/web3.js` | JSON-RPC | `services/blockchain-transfer.service.ts` |
| Metaplex | `@metaplex-foundation/js` | HTTP | `services/nft.service.ts` |

### Internal Communication

| Method | Use Case | Location |
|--------|----------|----------|
| HTTP + HMAC | Service-to-service calls | `middleware/internal-auth.middleware.ts` |
| Circuit Breaker | Fault tolerance | `utils/circuit-breaker.ts` |
| Webhook Delivery | External notifications | `services/webhook.service.ts` |

### Message Queue Integration
- **Not implemented**: No RabbitMQ/event bus integration found
- **Recommendation**: Add async event publishing for transfer state changes

### Circuit Breaker Configuration

```typescript
// From src/utils/circuit-breaker.ts
const DEFAULT_OPTIONS = {
  timeout: 10000,          // 10 second timeout
  errorThresholdPercentage: 50,
  resetTimeout: 30000,     // 30 second reset
  volumeThreshold: 10
};
```

### Health Check Dependencies

| Dependency | Health Check | Location |
|------------|--------------|----------|
| PostgreSQL | Pool status check | `health.routes.ts` |
| Redis | Ping check | `health.routes.ts` |
| Solana RPC | Via failover | `utils/rpc-failover.ts` |

---

## 6. Application Setup

### Entry Point (`src/index.ts`)

```typescript
// Server startup flow:
1. Load environment variables
2. Create Fastify server
3. Register plugins and middleware
4. Register routes
5. Setup graceful shutdown
6. Start listening on port
```

### Fastify Configuration (`src/app.ts`)

| Feature | Implementation |
|---------|---------------|
| CORS | Via `@fastify/cors` |
| Helmet | Security headers via `@fastify/helmet` |
| Rate Limiting | Via `@fastify/rate-limit` |
| Request Logging | Custom middleware |
| Error Handling | Custom error handler |

### Middleware Registration Order

1. Request ID generation (`request-id.ts`)
2. Request logging (`request-logger.ts`)
3. Tenant context (`tenant-context.ts`)
4. Rate limiting (`rate-limit.ts`)
5. Authentication (`auth.middleware.ts`)
6. Validation (`validation.middleware.ts`)

### Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `PORT` | No | 3000 | Server port |
| `NODE_ENV` | No | development | Environment |
| `DATABASE_URL` | Yes | - | PostgreSQL connection |
| `REDIS_URL` | Yes | - | Redis connection |
| `JWT_SECRET` | Yes | - | JWT signing |
| `HMAC_SECRET` | Yes | - | Internal auth |
| `TRANSFER_EXPIRY_HOURS` | No | 48 | Transfer expiration |
| `ACCEPTANCE_CODE_LENGTH` | No | 8 | Code length |
| `SOLANA_RPC_URL` | Yes | - | Primary Solana RPC |
| `SOLANA_TREASURY_PRIVATE_KEY` | Yes | - | Treasury wallet key |

### Graceful Shutdown (`src/utils/graceful-shutdown.ts`)

```
Shutdown sequence:
1. Stop accepting new requests
2. Wait 5 seconds for in-flight requests
3. Close database connections
4. Close Redis connections
5. Run additional cleanup
6. Exit process
```

Timeout: 30 seconds maximum shutdown time

---

## 7. Services Deep Dive

### TransferService (`src/services/transfer.service.ts`)

**Responsibilities**:
- Create gift/sale transfers
- Accept/reject transfers
- Cancel pending transfers
- Verify transfer status

**Key Methods**:
| Method | Purpose | Transaction |
|--------|---------|-------------|
| `createGiftTransfer` | Initiate gift transfer | Yes |
| `createSaleTransfer` | Initiate sale transfer | Yes |
| `acceptTransfer` | Complete transfer acceptance | Yes |
| `cancelTransfer` | Cancel pending transfer | Yes |
| `getTransfer` | Retrieve transfer details | No |

**Transaction Handling**:
- All state-changing operations use BEGIN/COMMIT/ROLLBACK
- SELECT FOR UPDATE used for concurrent access protection
- Client always released in finally block

### BlockchainTransferService (`src/services/blockchain-transfer.service.ts`)

**Responsibilities**:
- Execute NFT transfers on Solana
- Handle blockchain transaction signing
- Manage retry logic for failed transactions

**Key Features**:
- Automatic retry with exponential backoff
- RPC failover on endpoint failures
- Transaction confirmation waiting
- Gas estimation

### BatchTransferService (`src/services/batch-transfer.service.ts`)

**Responsibilities**:
- Process multiple transfers in batch
- Optimize blockchain operations
- Handle partial failures

**Batch Processing**:
- Validates all transfers before execution
- Continues on individual failures
- Returns detailed status per transfer

### CacheService (`src/services/cache.service.ts`)

**Responsibilities**:
- Redis-based caching
- Transfer data caching
- Cache invalidation

**Cache Keys**:
- `transfer:{id}` - Individual transfer data
- `user:{id}:transfers` - User's transfer list
- `tenant:{id}:stats` - Tenant statistics

### SearchService (`src/services/search.service.ts`)

**Responsibilities**:
- Advanced transfer search with filters
- Faceted search counts
- Autocomplete suggestions

**Filters Supported**:
- Status (multiple)
- User ID (from/to)
- Ticket ID
- Event ID
- Transfer type
- Date range
- Amount range
- Blockchain signature presence
- Full-text search

**Note**: Uses cross-table JOINs for performance (documented exception to service boundaries)

### TransferRulesService (`src/services/transfer-rules.service.ts`)

**Responsibilities**:
- Enforce transfer policies
- Validate transfer eligibility
- Check blacklists/whitelists

### TransferAnalyticsService (`src/services/transfer-analytics.service.ts`)

**Responsibilities**:
- Track transfer metrics
- Generate reports
- Monitor transfer patterns

### WebhookService (`src/services/webhook.service.ts`)

**Responsibilities**:
- Send webhook notifications
- Retry failed deliveries
- Track delivery status

### EventStreamService (`src/services/event-stream.service.ts`)

**Responsibilities**:
- Real-time transfer updates via WebSocket
- Server-Sent Events support
- Connection management

---

## 8. Blockchain Integration

### Solana Configuration (`src/config/solana.config.ts`)

| Setting | Value | Source |
|---------|-------|--------|
| Network | Mainnet-beta/Devnet | Environment |
| RPC Endpoint | Multiple with failover | Environment |
| Treasury Wallet | From private key | Environment/Secrets Manager |

### NFT Service (`src/services/nft.service.ts`)

**Capabilities**:
- Create NFT transfers via Metaplex
- Verify NFT ownership
- Handle transfer metadata

**Dependencies**:
- `@metaplex-foundation/js` for NFT operations
- `@solana/web3.js` for Solana interaction

### RPC Failover (`src/utils/rpc-failover.ts`)

**Architecture**:
```
Primary RPC → Secondary RPC → Tertiary RPC → Error
     ↓              ↓               ↓
 Health Check  Health Check   Health Check
```

**Features**:
- Automatic health monitoring
- Rate limit detection
- Exponential backoff on failures
- Configurable endpoint priorities

### Blockchain Retry (`src/utils/blockchain-retry.ts`)

**Strategy**:
- Maximum 3 attempts (configurable)
- Exponential backoff: 1s, 2s, 4s
- Different handling for transient vs permanent errors

### Blockchain Metrics (`src/utils/blockchain-metrics.ts`)

| Metric | Type | Purpose |
|--------|------|---------|
| `transfer_blockchain_transactions_total` | Counter | Total blockchain transactions |
| `transfer_blockchain_transaction_duration` | Histogram | Transaction timing |
| `transfer_blockchain_failures_total` | Counter | Failed transactions |
| `transfer_rpc_requests_total` | Counter | RPC call count |
| `transfer_rpc_latency` | Histogram | RPC response time |

---

## 9. Test Coverage

### Test Files Found

| File | Type | Coverage |
|------|------|----------|
| `tests/unit/services/transfer.service.test.ts` | Unit | TransferService core logic |

### Test Quality Assessment

**Strengths**:
- Comprehensive mock setup
- Tests both success and error paths
- Edge cases covered (expiry, boundaries)
- Transaction rollback verification
- Service client interaction verification

**Test Categories Covered**:
1. `createGiftTransfer()` - 20+ test cases
2. `acceptTransfer()` - 15+ test cases
3. `generateAcceptanceCode()` - 6 test cases
4. Transaction Handling - 5 test cases
5. Request Context Creation - 2 test cases
6. Edge Cases - 8 test cases

**Key Test Patterns**:
```typescript
// Mock setup with dependency injection
let mockPool: jest.Mocked<Pool>;
let mockClient: jest.Mocked<PoolClient>;

// Transaction verification
expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
expect(mockClient.query).toHaveBeenCalledWith('COMMIT');

// Error path testing
await expect(service.method()).rejects.toThrow(CustomError);
expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
```

### Coverage Gaps

| Component | Status | Recommendation |
|-----------|--------|----------------|
| BlockchainTransferService | Not tested | Add integration tests |
| BatchTransferService | Not tested | Add unit tests |
| SearchService | Not tested | Add query builder tests |
| CacheService | Not tested | Add Redis mock tests |
| WebhookService | Not tested | Add delivery tests |
| Controllers | Not tested | Add route handler tests |
| Middleware | Not tested | Add auth/validation tests |

### Integration Test Infrastructure

- **Not found**: No `tests/integration/` directory
- **Recommendation**: Add Testcontainers-based integration tests for:
  - Database transactions
  - Redis caching
  - Full API flow

---

## 10. Type Safety

### TypeScript Configuration

| Setting | Value | Impact |
|---------|-------|--------|
| `strict` | Assumed true | Full type checking |
| `target` | ES2020+ | Modern JS features |
| `module` | CommonJS | Node.js compatibility |

### Type Definitions (`src/models/transfer.model.ts`)

**Interfaces Defined**:
```typescript
interface Transfer {
  id: string;
  tenantId: string;
  ticketId: string;
  fromUserId: string;
  toUserId?: string;
  toEmail?: string;
  toWallet?: string;
  transferType: TransferType;
  status: TransferStatus;
  // ...additional fields
}

interface Ticket {
  id: string;
  userId: string;
  eventId: string;
  // ...
}

interface User {
  id: string;
  email: string;
  wallet?: string;
  // ...
}
```

**Custom Error Classes**:
```typescript
class TransferNotFoundError extends Error { statusCode = 404 }
class TransferExpiredError extends Error { statusCode = 410 }
class TicketNotFoundError extends Error { statusCode = 404 }
class TicketNotTransferableError extends Error { statusCode = 400 }
class UnauthorizedError extends Error { statusCode = 401 }
class InsufficientPermissionsError extends Error { statusCode = 403 }
```

### Validation Schemas (`src/schemas/validation.ts`)

**Zod Schemas**:
```typescript
createGiftTransferSchema = z.object({
  ticketId: z.string().uuid(),
  toEmail: z.string().email(),
  message: z.string().max(500).optional()
});

createSaleTransferSchema = z.object({
  ticketId: z.string().uuid(),
  toEmail: z.string().email().optional(),
  toWallet: z.string().optional(),
  price: z.number().positive(),
  currency: z.string().length(3)
});

acceptTransferSchema = z.object({
  acceptanceCode: z.string().min(6).max(12)
});
```

### Type Safety Issues

| ID | Issue | Location | Line | Severity |
|----|-------|----------|------|----------|
| TS-1 | `any` in search results | `search.service.ts` | 64 | Medium |
| TS-2 | `any` in query builder | `search.service.ts` | 118 | Medium |
| TS-3 | `any` in suggestions | `search.service.ts` | 269 | Medium |
| TS-4 | `any` in facets return | `search.service.ts` | 298 | Medium |
| TS-5 | Type assertion in errors | `response-filter.ts` | 263-264 | Low |
| TS-6 | Missing return types | Various services | - | Low |

### Generic Type Usage

| Pattern | Example | Assessment |
|---------|---------|------------|
| Generic response filter | `filterResponse<T>(data: T): T` | Good |
| Search result generic | `SearchResult<T>` | Good |
| Circuit breaker | `CircuitBreaker<T>` | Good |

---

## 11. Files Analyzed Verification

### Source Files Analyzed (44 total)

#### Routes (3 files)
1. `src/routes/transfer.routes.ts`
2. `src/routes/internal.routes.ts`
3. `src/routes/health.routes.ts`

#### Controllers (1 file)
4. `src/controllers/transfer.controller.ts`

#### Application Setup (2 files)
5. `src/app.ts`
6. `src/index.ts`

#### Middleware (8 files)
7. `src/middleware/auth.middleware.ts`
8. `src/middleware/internal-auth.middleware.ts`
9. `src/middleware/rate-limit.ts`
10. `src/middleware/idempotency.ts`
11. `src/middleware/tenant-context.ts`
12. `src/middleware/validation.middleware.ts`
13. `src/middleware/request-id.ts`
14. `src/middleware/request-logger.ts`

#### Configuration (5 files)
15. `src/config/database.ts`
16. `src/config/redis.ts`
17. `src/config/secrets.ts`
18. `src/config/solana.config.ts`
19. `src/config/validate.ts`

#### Services (11 files)
20. `src/services/transfer.service.ts`
21. `src/services/blockchain-transfer.service.ts`
22. `src/services/batch-transfer.service.ts`
23. `src/services/nft.service.ts`
24. `src/services/cache.service.ts`
25. `src/services/pricing.service.ts`
26. `src/services/transfer-rules.service.ts`
27. `src/services/transfer-analytics.service.ts`
28. `src/services/webhook.service.ts`
29. `src/services/search.service.ts`
30. `src/services/event-stream.service.ts`

#### Utilities (10 files)
31. `src/utils/logger.ts`
32. `src/utils/circuit-breaker.ts`
33. `src/utils/blockchain-retry.ts`
34. `src/utils/rpc-failover.ts`
35. `src/utils/metrics.ts`
36. `src/utils/blockchain-metrics.ts`
37. `src/utils/distributed-lock.ts`
38. `src/utils/graceful-shutdown.ts`
39. `src/utils/base-metrics.ts`
40. `src/utils/response-filter.ts`

#### Models & Schemas (2 files)
41. `src/models/transfer.model.ts`
42. `src/schemas/validation.ts`

#### Configuration Files (1 file)
43. `package.json`

#### Test Files (1 file)
44. `tests/unit/services/transfer.service.test.ts`

### Summary Statistics

| Category | Count |
|----------|-------|
| Source files | 42 |
| Test files | 1 |
| Config files | 1 |
| **Total** | **44** |

---

## Executive Summary

### Critical Issues (1)
1. **SEC-C1**: Solana private key stored in environment variable without consistent secrets manager usage

### High Priority Issues (3)
1. **SEC-H1**: HMAC secret fallback to environment variable
2. **SEC-H2**: JWT_SECRET in environment variable
3. **SEC-H3**: Rate limit bypass potential (IP-only)

### Medium Priority Issues (7)
1. **SEC-M1**: No request body signing
2. **SEC-M2**: Transfer code predictability
3. **SEC-M3**: Missing audit logging for cancellations
4. **CQ-M1**: `any` type usage in search service
5. **CQ-M2**: Unused parameter in getFacets
6. **CQ-M3**: Magic numbers in graceful shutdown
7. **CQ-M4**: Generic error catching in circuit breaker

### Strengths
1. **Security**: Good sensitive data redaction in logging
2. **Reliability**: Circuit breaker and RPC failover patterns
3. **Testing**: Comprehensive unit tests for core service
4. **Validation**: Zod schemas for input validation
5. **Architecture**: Clean separation of concerns
6. **Monitoring**: Prometheus metrics integration

### Recommendations

1. **Immediate**: Move all secrets to AWS Secrets Manager, remove env fallbacks
2. **Short-term**: Add integration tests, increase test coverage to >80%
3. **Medium-term**: Add event bus integration for async notifications
4. **Long-term**: Consider materialized views or Elasticsearch for search

---

*Report generated by Claude Code audit system*
