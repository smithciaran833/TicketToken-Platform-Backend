# Blockchain Indexer Testing Guide

**AUDIT FIX: TST-10 - No test documentation**

This document provides comprehensive guidance for testing the blockchain-indexer service.

## Table of Contents

- [Overview](#overview)
- [Test Structure](#test-structure)
- [Running Tests](#running-tests)
- [Test Types](#test-types)
- [Writing Tests](#writing-tests)
- [Test Utilities](#test-utilities)
- [Mocking Strategies](#mocking-strategies)
- [Test Data](#test-data)
- [Coverage Requirements](#coverage-requirements)
- [CI/CD Integration](#cicd-integration)
- [Troubleshooting](#troubleshooting)

## Overview

The blockchain-indexer uses Jest as the testing framework with the following features:

- **Unit Tests**: Fast, isolated tests for individual functions/classes
- **Integration Tests**: Tests with actual database connections
- **E2E Tests**: Full API tests with all dependencies
- **Security Tests**: Specific tests for authentication and authorization

## Test Structure

```
tests/
├── setup.ts              # Global test setup
├── fixtures/             # Test data and factories
│   └── index.ts
├── helpers/              # Test utilities
│   └── index.ts
├── unit/                 # Unit tests
│   ├── errors.test.ts
│   ├── cache.test.ts
│   └── ...
├── integration/          # Integration tests
│   ├── api.integration.test.ts
│   ├── database.integration.test.ts
│   └── ...
├── e2e/                  # End-to-end tests
│   └── indexer.e2e.test.ts
└── security/             # Security-focused tests
    └── auth.security.test.ts
```

## Running Tests

### Basic Commands

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run unit tests only
npm run test:unit

# Run integration tests
npm run test:integration

# Run e2e tests
npm run test:e2e

# Run security tests
npm run test:security

# Watch mode for development
npm run test:watch

# Run specific test file
npm test -- tests/unit/errors.test.ts

# Run tests matching pattern
npm test -- --testNamePattern="circuit breaker"
```

### Environment Setup

```bash
# Create test environment file
cp .env.example .env.test

# Required test environment variables
NODE_ENV=test
DATABASE_HOST=localhost
DATABASE_NAME=blockchain_indexer_test
DATABASE_USER=test_user
DATABASE_PASSWORD=test_password
MONGODB_URI=mongodb://localhost:27017/blockchain_indexer_test
REDIS_HOST=localhost
SOLANA_RPC_URL=http://localhost:8899  # Local validator
JWT_SECRET=test-jwt-secret-at-least-32-characters-long
```

### Using Docker for Tests

```bash
# Start test infrastructure
docker-compose -f docker-compose.test.yml up -d

# Run tests
npm test

# Tear down
docker-compose -f docker-compose.test.yml down -v
```

## Test Types

### Unit Tests

Unit tests are fast, isolated, and mock all dependencies.

```typescript
// tests/unit/errors.test.ts
import { describe, it, expect } from '@jest/globals';
import { BlockchainError, ErrorCode } from '../../src/errors';

describe('BlockchainError', () => {
  it('should create error with correct properties', () => {
    const error = new BlockchainError(
      ErrorCode.TRANSACTION_NOT_FOUND,
      'Transaction not found'
    );
    
    expect(error.code).toBe(ErrorCode.TRANSACTION_NOT_FOUND);
    expect(error.statusCode).toBe(404);
    expect(error.message).toBe('Transaction not found');
  });
});
```

### Integration Tests

Integration tests use real databases in test mode.

```typescript
// tests/integration/database.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { getPool, closePool } from '../../src/utils/database';

describe('Database Integration', () => {
  beforeAll(async () => {
    await getPool(); // Initialize connection
  });

  afterAll(async () => {
    await closePool();
  });

  it('should execute queries with RLS', async () => {
    const pool = await getPool();
    await pool.query("SET app.current_tenant = 'test-tenant-id'");
    // Test queries...
  });
});
```

### E2E Tests

E2E tests verify complete workflows.

```typescript
// tests/e2e/indexer.e2e.test.ts
import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import { createTestApp } from '../helpers';

describe('Indexer E2E', () => {
  let app: Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it('should index transaction and query it', async () => {
    // Index a transaction
    // Query via API
    // Verify response
  });
});
```

### Security Tests

Security tests verify authentication and authorization.

```typescript
// tests/security/auth.security.test.ts
import { describe, it, expect } from '@jest/globals';
import request from 'supertest';

describe('Authentication Security', () => {
  it('should reject expired tokens', async () => {
    const expiredToken = generateExpiredToken();
    
    const response = await request(app)
      .get('/api/v1/transactions/abc')
      .set('Authorization', `Bearer ${expiredToken}`)
      .expect(401);
      
    expect(response.body.error).toBe('Token expired');
  });

  it('should prevent tenant isolation bypass', async () => {
    // Test that tenant A cannot access tenant B data
  });
});
```

## Writing Tests

### Test Structure Best Practices

```typescript
describe('ComponentName', () => {
  // Setup/teardown at appropriate scope
  beforeAll(async () => { /* one-time setup */ });
  afterAll(async () => { /* cleanup */ });
  
  beforeEach(() => { /* per-test setup */ });
  afterEach(() => { /* per-test cleanup */ });

  describe('methodName', () => {
    it('should do X when given Y', async () => {
      // Arrange
      const input = createTestInput();
      
      // Act
      const result = await component.method(input);
      
      // Assert
      expect(result).toEqual(expectedOutput);
    });

    it('should throw error when given invalid input', async () => {
      await expect(component.method(invalidInput))
        .rejects.toThrow('Expected error message');
    });
  });
});
```

### Naming Conventions

```typescript
// Describe blocks: Component/class name
describe('TransactionProcessor', () => {
  // Nested describes: method name or feature
  describe('processTransaction', () => {
    // Test names: should + behavior + condition
    it('should store transaction when valid', () => {});
    it('should retry on network error', () => {});
    it('should skip duplicate transactions', () => {});
  });
});
```

### Async Testing

```typescript
// Use async/await
it('should process async operation', async () => {
  const result = await asyncOperation();
  expect(result).toBe('expected');
});

// Test rejections
it('should reject with error', async () => {
  await expect(failingOperation())
    .rejects.toThrow('Error message');
});

// Use done callback for event-based tests
it('should emit event', (done) => {
  emitter.on('event', (data) => {
    expect(data).toBe('expected');
    done();
  });
  emitter.trigger();
});
```

## Test Utilities

See [tests/helpers/index.ts](../tests/helpers/index.ts) for all available utilities.

### Creating Test Data

```typescript
import { 
  createTransactionFixture,
  createWalletActivityFixture,
  createMarketplaceEventFixture,
  TEST_TENANT_ID,
  TEST_USER_ID
} from '../fixtures';

// Create fixtures with overrides
const tx = createTransactionFixture({ 
  signature: 'custom-signature',
  slot: 12345
});
```

### Authentication Helpers

```typescript
import { generateTestToken, createAuthHeaders } from '../helpers';

// Generate token with custom claims
const token = generateTestToken({
  userId: 'user-123',
  tenantId: 'tenant-456',
  roles: ['admin']
});

// Create authorization header
const headers = createAuthHeaders(token);
```

### Database Helpers

```typescript
import { 
  setupTestDatabase,
  teardownTestDatabase,
  seedTestData,
  clearTestData
} from '../helpers';

beforeAll(async () => {
  await setupTestDatabase();
  await seedTestData();
});

afterAll(async () => {
  await clearTestData();
  await teardownTestDatabase();
});
```

### Mock Helpers

```typescript
import { 
  mockSolanaRpc,
  mockMarketplaceApi,
  mockRedis,
  mockMongoDB
} from '../helpers';

beforeEach(() => {
  mockSolanaRpc.reset();
  mockSolanaRpc.onGetSlot().returns(12345);
  mockSolanaRpc.onGetTransaction('sig').returns(txData);
});
```

## Mocking Strategies

### Mocking External Services

```typescript
// Mock Solana RPC
jest.mock('@solana/web3.js', () => ({
  Connection: jest.fn().mockImplementation(() => ({
    getSlot: jest.fn().mockResolvedValue(12345),
    getTransaction: jest.fn().mockResolvedValue(mockTransaction)
  }))
}));

// Mock Redis
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn()
  }));
});
```

### Mocking Internal Modules

```typescript
// Mock logger to avoid console output
jest.mock('../../src/utils/logger', () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));
```

### Using jest.spyOn

```typescript
import * as cache from '../../src/utils/cache';

it('should use cache', async () => {
  const cacheSpy = jest.spyOn(cache, 'get').mockResolvedValue(cachedData);
  
  const result = await service.getData('key');
  
  expect(cacheSpy).toHaveBeenCalledWith('key');
  expect(result).toEqual(cachedData);
  
  cacheSpy.mockRestore();
});
```

## Test Data

### Fixtures

Fixtures are defined in `tests/fixtures/index.ts`:

```typescript
// Transaction fixture
export const createTransactionFixture = (overrides = {}) => ({
  signature: 'default-signature-abc123',
  slot: 100000000,
  blockTime: Date.now() / 1000,
  ...overrides
});

// Wallet fixture
export const createWalletActivityFixture = (overrides = {}) => ({
  address: 'default-wallet-address',
  action: 'transfer',
  ...overrides
});
```

### Test Constants

```typescript
// Valid test data
export const TEST_TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';
export const TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440001';
export const VALID_WALLET_ADDRESS = 'DummyWallet11111111111111111111111111111';
export const VALID_SIGNATURE = 'DummySig111111111111111111111111111111111111111111111111111111111111111111111111111111';

// Invalid test data
export const INVALID_WALLET_ADDRESS = 'not-a-valid-address';
export const INVALID_SIGNATURE = 'too-short';
```

## Coverage Requirements

### Thresholds

```json
{
  "coverageThreshold": {
    "global": {
      "statements": 80,
      "branches": 75,
      "functions": 80,
      "lines": 80
    }
  }
}
```

### Coverage Commands

```bash
# Generate coverage report
npm run test:coverage

# Open HTML report
open coverage/lcov-report/index.html

# Check coverage without generating report
npm test -- --coverage --coverageReporters="text-summary"
```

### Excluded from Coverage

Files excluded from coverage (in jest.config.js):
- `src/migrations/*`
- `src/types/*`
- `tests/*`
- Configuration files

## CI/CD Integration

### GitHub Actions

```yaml
# .github/workflows/ci.yml
test:
  runs-on: ubuntu-latest
  services:
    postgres:
      image: postgres:14
    mongodb:
      image: mongo:6
    redis:
      image: redis:7
      
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
    - run: npm ci
    - run: npm test -- --coverage
    - uses: codecov/codecov-action@v3
```

### Running in CI

```bash
# CI-optimized test command
npm run test:ci

# With coverage upload
npm run test:coverage -- --coverageReporters="lcov"
```

## Troubleshooting

### Common Issues

#### Tests Timing Out

```typescript
// Increase timeout for slow tests
jest.setTimeout(30000);

// Or per-test
it('slow test', async () => {
  // ...
}, 30000);
```

#### Database Connection Issues

```bash
# Ensure test database exists
createdb blockchain_indexer_test

# Check connection
psql -h localhost -U test_user -d blockchain_indexer_test
```

#### Mock Not Working

```typescript
// Ensure mock is before import
jest.mock('./module');
import { something } from './module';

// Reset mocks between tests
beforeEach(() => {
  jest.clearAllMocks();
});
```

#### Async Issues

```typescript
// Always await async operations
it('async test', async () => {
  await expect(asyncFn()).resolves.toBe('value');
});

// Use act() for React/state updates
await act(async () => {
  await trigger();
});
```

### Debugging Tests

```bash
# Run single test with verbose output
npm test -- --verbose tests/unit/specific.test.ts

# Run with debugger
node --inspect-brk node_modules/.bin/jest --runInBand

# Print test names
npm test -- --verbose
```

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Testing Library](https://testing-library.com/)
- [Supertest](https://github.com/ladjs/supertest)
- [Nock - HTTP Mocking](https://github.com/nock/nock)
