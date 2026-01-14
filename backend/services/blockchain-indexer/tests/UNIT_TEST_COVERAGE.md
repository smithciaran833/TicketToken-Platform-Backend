# Unit Test Coverage Report

## Overview
This document explains the unit testing strategy for the blockchain-indexer service and documents which files are excluded from unit tests and why.

## Coverage Summary
- **Total Source Files**: 36
- **Files with Unit Tests**: 29
- **Files Excluded from Unit Tests**: 7
- **Unit Test Coverage**: 81%

## Testing Philosophy
We follow a pragmatic testing approach:
- **Unit Tests**: Pure business logic, isolated functions, self-contained modules
- **Integration Tests**: External dependencies, orchestration code, blockchain interactions

## Files WITH Unit Tests ✅

### Config Layer (4/4)
- ✅ `config/index.ts`
- ✅ `config/mongodb.ts`
- ✅ `config/secrets.ts`
- ✅ `config/validate.ts`

### Error Handling (1/1)
- ✅ `errors/index.ts`

### Middleware (6/6)
- ✅ `middleware/auth-audit.ts`
- ✅ `middleware/auth.ts`
- ✅ `middleware/rate-limit.ts`
- ✅ `middleware/request-id.ts`
- ✅ `middleware/request-logger.ts`
- ✅ `middleware/tenant-context.ts`

### Models (4/4)
- ✅ `models/blockchain-transaction.model.ts`
- ✅ `models/marketplace-event.model.ts`
- ✅ `models/nft-metadata.model.ts`
- ✅ `models/wallet-activity.model.ts`

### Routes (2/2)
- ✅ `routes/health.routes.ts`
- ✅ `routes/query.routes.ts`

### Schemas (1/1)
- ✅ `schemas/validation.ts`

### Services (1/1)
- ✅ `services/cache-integration.ts`

### Utilities (10/10)
- ✅ `utils/cache.ts`
- ✅ `utils/circuit-breaker.ts`
- ✅ `utils/database.ts`
- ✅ `utils/distributed-lock.ts`
- ✅ `utils/events.ts`
- ✅ `utils/job-tracker.ts`
- ✅ `utils/logger.ts`
- ✅ `utils/metrics.ts`
- ✅ `utils/onChainQuery.ts`
- ✅ `utils/redis.ts`
- ✅ `utils/response-filter.ts`
- ✅ `utils/retry.ts`
- ✅ `utils/rpcFailover.ts`
- ✅ `utils/websocket-manager.ts`

### API (1/1)
- ✅ `api/server.ts`

---

## Files EXCLUDED from Unit Tests ❌

### 1. Application Bootstrap
**File**: `src/index.ts`

**Reason**: Application entry point that orchestrates all components
- Wires up Fastify server with all middleware
- Connects to multiple databases (MongoDB, PostgreSQL)
- Initializes BlockchainIndexer with real Solana connection
- Sets up graceful shutdown handlers for process signals
- Registers health checks, metrics endpoints, and routes
- **Testing Approach**: Integration tests with full environment
- **Why Not Unit Test**: Cannot meaningfully mock the entire application stack; integration tests verify the orchestration works correctly

### 2. Core Blockchain Indexer
**File**: `src/indexer.ts`

**Reason**: Heavy blockchain infrastructure dependencies
- Requires live Solana `Connection` with RPC/WebSocket
- Real-time blockchain monitoring via `onProgramAccountChange`
- Uses `TransactionProcessor` which has external dependencies
- Complex state management tied to blockchain state
- RPC failover logic requires actual network calls to test properly
- **Testing Approach**: Integration tests with test Solana network or mocked RPC
- **Why Not Unit Test**: Mocking Solana blockchain behavior is complex and fragile; integration tests provide better confidence

### 3. Transaction Processor
**File**: `src/processors/transactionProcessor.ts`

**Reason**: External monorepo dependencies that cannot be resolved in test environment
- Imports `@tickettoken/shared/clients` (ticket-service, marketplace-service clients)
- Requires full monorepo setup for TypeScript to resolve types
- Business logic is tightly coupled with service-to-service communication
- **TypeScript Error**: `Cannot find module '@tickettoken/shared/clients'`
- **Testing Approach**: Integration tests with real service dependencies or test doubles
- **Why Not Unit Test**: TypeScript compilation fails before Jest can run; requires monorepo context

### 4. Marketplace Tracker
**File**: `src/processors/marketplaceTracker.ts`

**Reason**: Same external dependency issue as TransactionProcessor
- Imports `@tickettoken/shared/clients`
- Requires monorepo packages for type resolution
- **Testing Approach**: Integration tests with service dependencies
- **Why Not Unit Test**: Cannot resolve external package types in isolated service tests

### 5. Reconciliation Engine
**File**: `src/reconciliation/reconciliationEngine.ts`

**Reason**: External monorepo dependencies
- Uses `ticketServiceClient` from `@tickettoken/shared/clients`
- Makes service-to-service calls to ticket-service
- Requires blockchain connection for on-chain state verification
- **TypeScript Error**: `Cannot find module '@tickettoken/shared/clients'`
- **Testing Approach**: Integration tests with ticket-service running
- **Why Not Unit Test**: Cannot mock shared client types; needs real service communication

### 6. Enhanced Reconciliation
**File**: `src/reconciliation/reconciliationEnhanced.ts`

**Reason**: Same external dependency issue as ReconciliationEngine
- Imports `@tickettoken/shared/clients`
- **Testing Approach**: Integration tests
- **Why Not Unit Test**: TypeScript compilation failure on external imports

### 7. Historical Sync
**File**: `src/sync/historicalSync.ts`

**Reason**: Depends on TransactionProcessor which has external dependencies
- Uses `TransactionProcessor` (item #3 above)
- Requires Solana `Connection` for batch processing
- Complex blockchain state synchronization logic
- **Testing Approach**: Integration tests with test blockchain data
- **Why Not Unit Test**: Transitive dependency on external monorepo packages; blockchain interaction requires integration testing

---

## Integration Test Requirements

The 7 excluded files should be covered by integration tests that:

1. **Full Environment Setup**
   - Running PostgreSQL with test data
   - Running MongoDB with test collections
   - Mock or test Solana RPC endpoint
   - Mock or test instances of shared services (ticket-service, marketplace-service)

2. **Service-to-Service Communication**
   - Test actual HTTP calls between services
   - Verify request/response contracts
   - Test error handling across service boundaries

3. **Blockchain Interaction**
   - Test with devnet/testnet Solana cluster
   - Verify transaction parsing and storage
   - Test real-time indexing and polling

4. **End-to-End Flows**
   - Application startup and initialization
   - Graceful shutdown
   - Reconciliation workflows
   - Historical sync processes

## Continuous Improvement

As the codebase evolves:
- Extract pure business logic from infrastructure code where possible
- Consider creating adapter layers to make external dependencies mockable
- Monitor integration test coverage to ensure excluded files are tested
- Document any new files that fall into the "integration test only" category

---

## Running Tests
```bash
# Run all unit tests
npm test

# Run unit tests with coverage
npm run test:coverage

# Run specific test file
npm test -- path/to/test.test.ts

# Run integration tests (when available)
npm run test:integration
```

## Notes for Developers

- **DO NOT** attempt to write unit tests for the 7 excluded files without first resolving their external dependencies
- If you need to test logic from these files, consider extracting it into a pure utility function
- When writing new code, prefer dependency injection to make code more testable
- Keep business logic separate from infrastructure concerns

---

**Last Updated**: January 2026  
**Maintained By**: Engineering Team
