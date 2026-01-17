# File Service - Services Review & Test Setup

## Overview
This document reviews 5 service files from the file-service and documents the test infrastructure setup for writing unit tests.

**Date:** January 15, 2026  
**Services Reviewed:**
1. `access-log.service.ts`
2. `cache.service.ts`
3. `file-version.service.ts`
4. `qr-code.service.ts`
5. `storage-quota.service.ts`

---

## 1. Access Log Service (`access-log.service.ts`)

### Purpose
Logs and retrieves file access information including views, downloads, shares, and streams.

### Key Methods
- `logAccess()` - Records file access events with metadata
- `getAccessLogs()` - Retrieves access logs for a specific file
- `getUserAccessHistory()` - Gets access history for a user
- `getFileAccessStats()` - Provides aggregate statistics for a file

### Dependencies
- `getPool()` from `config/database.config`
- `logger` from `utils/logger`

### Database Tables
- `file_access_logs` - Stores access records

### Testing Considerations
- Mock database pool and query methods
- Test error handling when pool is unavailable
- Verify SQL queries are correctly formed
- Test aggregation logic for statistics
- Handle null/undefined parameters gracefully

---

## 2. Cache Service (`cache.service.ts`)

### Purpose
Redis-backed caching service for improving performance on frequently accessed data.

### Key Features
- Connection management with auto-retry
- Hit/miss tracking with metrics
- TTL support
- Pattern-based deletion
- Batch operations (mset/mget)
- Health checks

### Key Methods
- `get<T>()` - Retrieve cached value
- `set<T>()` - Store value with TTL
- `delete()` - Remove cached value
- `deletePattern()` - Bulk delete by pattern
- `getOrSet<T>()` - Cache-aside pattern
- `increment()` - Atomic counter
- `mset()/mget()` - Batch operations
- `getStats()` - Cache hit rate metrics
- `isHealthy()` - Health check
- `close()` - Cleanup

### Dependencies
- `ioredis` (Redis client)
- `logger` from `utils/logger`
- `metricsService` from `services/metrics.service`

### Testing Considerations
- Mock Redis client (ioredis)
- Test connection error scenarios
- Verify serialization/deserialization
- Test TTL functionality
- Verify cache key building with prefixes
- Test metrics updates
- Handle disconnected state gracefully

---

## 3. File Version Service (`file-version.service.ts`)

### Purpose
Manages file versioning system - create, restore, and delete file versions.

### Key Methods
- `createVersion()` - Creates new version with buffer and metadata
- `getVersions()` - Lists all versions for a file
- `restoreVersion()` - Restores file to a specific version
- `deleteVersion()` - Removes a version

### Dependencies
- `getPool()` from `config/database.config`
- `storageService` from `storage/storage.service`
- `fileModel` from `models/file.model`
- `generateFileHash()` from `utils/file-helpers`
- `logger` from `utils/logger`

### Database Tables
- `file_versions` - Stores version metadata
- `files` - Main file table

### Testing Considerations
- Mock database pool
- Mock storage service (upload/download/delete)
- Mock file model
- Mock file hash generation
- Test version number incrementing
- Verify tenant access control
- Test storage path manipulation
- Handle missing files gracefully

---

## 4. QR Code Service (`qr-code.service.ts`)

### Purpose
Generates QR codes for various purposes, especially ticket QR codes.

### Key Methods
- `generateQRCode()` - Generic QR code generation with options
- `generateTicketQR()` - Specialized ticket QR code with standard format

### Dependencies
- `qrcode` library
- `logger` from `utils/logger`

### Testing Considerations
- Mock qrcode library
- Test default options application
- Verify ticket data structure
- Test error handling on generation failure
- Validate buffer output
- Test custom options override

---

## 5. Storage Quota Service (`storage-quota.service.ts`)

### Purpose
Comprehensive storage quota management with usage tracking, alerts, and enforcement.

### Key Features
- Multi-level quotas (user, tenant, venue)
- Usage calculation and caching
- Soft/hard limits
- Alert system for approaching quotas
- File type-specific limits

### Key Methods
- `setQuota()` - Create/update quota
- `getQuota()` - Retrieve quota (with caching)
- `calculateUsage()` - Real-time usage calculation
- `checkQuota()` - Validate if upload allowed
- `getUsageSummary()` - Complete quota/usage overview
- `deleteQuota()` - Deactivate quota

### Dependencies
- `db` (Knex instance) from `config/database`
- `logger` from `utils/logger`
- `cacheService` from `services/cache.service`

### Database Tables
- `storage_quotas` - Quota definitions
- `storage_usage` - Cached usage stats
- `quota_alerts` - Alert history
- `files` - Source of usage data

### Testing Considerations
- Mock Knex database interface
- Mock cache service
- Test quota enforcement logic
- Verify percentage calculations
- Test alert creation and deduplication
- Handle multi-level quota hierarchy
- Test usage aggregation queries
- Verify cache invalidation

---

## Test Infrastructure

### Jest Configuration (`jest.config.js`)
```javascript
{
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  coverageThreshold: {
    global: { branches: 80, functions: 80, lines: 80, statements: 80 }
  },
  testTimeout: 10000,
  maxWorkers: '50%'
}
```

### Test Setup (`tests/setup.ts`)
- Sets NODE_ENV='test'
- Configures environment variables for file sizes, allowed types, storage paths
- Console mocking (currently disabled but available)

### Mock Patterns (from existing tests)

#### 1. PostgreSQL Pool Mocking
```typescript
jest.mock('pg');
const mockPool = {
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  connect: jest.fn(),
  end: jest.fn(),
  on: jest.fn()
};
(Pool as jest.MockedClass<typeof Pool>).mockImplementation(() => mockPool);
```

#### 2. Module Mocking
```typescript
jest.mock('../../../src/utils/logger');
jest.mock('../../../src/config/database.config');
jest.mock('../../../src/services/cache.service');
```

#### 3. Test Structure
- `beforeEach()` - Setup mocks and environment
- `afterEach()` - Cleanup and restore
- `describe()` blocks for logical grouping
- Clear, descriptive test names

---

## Required Mocks for Services Tests

### For All Services
```typescript
jest.mock('../../src/utils/logger');
```

### For access-log.service.ts
```typescript
jest.mock('../../src/config/database.config');
// Mock getPool() to return mock pool with query method
```

### For cache.service.ts
```typescript
jest.mock('ioredis');
jest.mock('../../src/services/metrics.service');
// Mock Redis constructor and instance methods
```

### For file-version.service.ts
```typescript
jest.mock('../../src/config/database.config');
jest.mock('../../src/storage/storage.service');
jest.mock('../../src/models/file.model');
jest.mock('../../src/utils/file-helpers');
```

### For qr-code.service.ts
```typescript
jest.mock('qrcode');
// Mock QRCode.toBuffer() method
```

### For storage-quota.service.ts
```typescript
jest.mock('../../src/config/database');
jest.mock('../../src/services/cache.service');
// Mock Knex instance (db) methods
```

---

## Test File Structure Template

```typescript
// Mock dependencies BEFORE imports
jest.mock('../../src/utils/logger');
jest.mock('../../src/config/database.config');

import { ServiceClass } from '../../src/services/service-name.service';

describe('services/service-name.service', () => {
  let service: ServiceClass;
  let mockDependency: jest.Mocked<DependencyType>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup mock implementations
    mockDependency = {
      method: jest.fn()
    };
    
    // Create service instance
    service = new ServiceClass();
  });

  afterEach(() => {
    // Cleanup
    jest.restoreAllMocks();
  });

  describe('methodName', () => {
    it('should handle success case', async () => {
      // Arrange
      mockDependency.method.mockResolvedValue(mockData);
      
      // Act
      const result = await service.methodName(params);
      
      // Assert
      expect(result).toEqual(expectedResult);
      expect(mockDependency.method).toHaveBeenCalledWith(expectedParams);
    });

    it('should handle error case', async () => {
      // Arrange
      mockDependency.method.mockRejectedValue(new Error('Test error'));
      
      // Act & Assert
      await expect(service.methodName(params)).rejects.toThrow('Test error');
    });
  });
});
```

---

## Next Steps

1. **Create test directory structure:**
   ```
   tests/unit/services/
   ├── access-log.service.test.ts
   ├── cache.service.test.ts
   ├── file-version.service.test.ts
   ├── qr-code.service.test.ts
   └── storage-quota.service.test.ts
   ```

2. **Create shared mock utilities** (optional):
   ```
   tests/mocks/
   ├── database.mock.ts
   ├── redis.mock.ts
   └── storage.mock.ts
   ```

3. **Write comprehensive tests** covering:
   - Happy path scenarios
   - Error handling
   - Edge cases
   - Null/undefined inputs
   - Database failures
   - Network errors
   - Permission checks

4. **Achieve coverage targets:**
   - Branches: 80%
   - Functions: 80%
   - Lines: 80%
   - Statements: 80%

---

## Key Testing Principles

1. **Isolation**: Each test should be independent
2. **Mocking**: Mock all external dependencies
3. **Coverage**: Test success, failure, and edge cases
4. **Clarity**: Use descriptive test names
5. **Speed**: Keep tests fast (< 10s timeout)
6. **Determinism**: Tests should be predictable
7. **AAA Pattern**: Arrange, Act, Assert

---

## Dependencies to Mock

### External Libraries
- `pg` (PostgreSQL driver)
- `ioredis` (Redis client)
- `qrcode` (QR code generator)
- `knex` (Query builder)

### Internal Modules
- `logger` (logging utility)
- `database.config` (database pool)
- `database` (Knex instance)
- `cache.service` (caching layer)
- `metrics.service` (metrics collection)
- `storage.service` (file storage)
- `file.model` (file model)
- `file-helpers` (utility functions)

---

## Summary

All 5 service files have been reviewed and documented. The test infrastructure is well-established with:
- ✅ Jest configured with TypeScript
- ✅ Test setup file with environment variables
- ✅ Clear mock patterns from existing tests
- ✅ 80% coverage threshold requirement
- ✅ Consistent test structure

Ready to proceed with writing comprehensive unit tests for all 5 services.
