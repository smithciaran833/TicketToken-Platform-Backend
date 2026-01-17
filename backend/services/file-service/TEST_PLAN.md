# File Service - Unit Test Plan

## Overview
This document outlines the comprehensive unit test plan for the file-service. We are creating **unit verification tests** (not smoke tests) that test all functionality of each file.

**Total Files to Test: 63**

---

## Test Categories & File Breakdown

### 1. Core Application Files (2 files)
- [ ] `src/app.ts` - Express app setup, middleware registration, route mounting
- [ ] `src/index.ts` - Server initialization, graceful shutdown, error handling

### 2. Configuration Files (5 files)
- [ ] `src/config/constants.ts` - File constants, size limits, allowed types
- [ ] `src/config/database.config.ts` - Database connection pool, initialization, closing
- [ ] `src/config/database.ts` - Knex instance configuration
- [ ] `src/config/secrets.ts` - AWS Secrets Manager integration, secret loading
- [ ] `src/config/validate.ts` - Environment variable validation

### 3. Utility Files (6 files)
- [ ] `src/utils/circuit-breaker.ts` - Circuit breaker pattern implementation
- [ ] `src/utils/database-optimization.util.ts` - Database optimization utilities
- [ ] `src/utils/errors.ts` - Custom error classes
- [ ] `src/utils/file-helpers.ts` - File utility functions
- [ ] `src/utils/logger.ts` - Winston logger configuration
- [ ] `src/utils/sanitize.ts` - Input sanitization utilities

### 4. Middleware Files (8 files)
- [ ] `src/middleware/auth.middleware.ts` - JWT authentication, role-based access
- [ ] `src/middleware/bulkhead.ts` - Bulkhead pattern for resource isolation
- [ ] `src/middleware/correlation-id.ts` - Request correlation ID generation
- [ ] `src/middleware/error.middleware.ts` - Global error handler
- [ ] `src/middleware/file-ownership.middleware.ts` - File access control verification
- [ ] `src/middleware/idempotency.ts` - Idempotent request handling
- [ ] `src/middleware/load-shedding.ts` - Load shedding under high load
- [ ] `src/middleware/rate-limit.middleware.ts` - Rate limiting (uploads, downloads, processing)
- [ ] `src/middleware/rate-limit.ts` - Rate limit utilities
- [ ] `src/middleware/tenant-context.ts` - Tenant context management

### 5. Service Files (23 files)
- [ ] `src/services/access-log.service.ts` - File access logging
- [ ] `src/services/antivirus.service.ts` - Virus scanning with ClamAV
- [ ] `src/services/batch-operations.service.ts` - Batch file operations
- [ ] `src/services/batch-processor.service.ts` - Batch job processing
- [ ] `src/services/cache-integration.ts` - Cache integration functions
- [ ] `src/services/cache.service.ts` - Cache service (Redis)
- [ ] `src/services/cdn.service.ts` - CDN URL generation and cache invalidation
- [ ] `src/services/chunked-upload.service.ts` - Chunked upload sessions
- [ ] `src/services/cleanup.service.ts` - Orphaned file cleanup
- [ ] `src/services/duplicate-detector.service.ts` - Duplicate file detection
- [ ] `src/services/file-search.service.ts` - File search functionality
- [ ] `src/services/file-version.service.ts` - File versioning
- [ ] `src/services/image.service.ts` - Image processing
- [ ] `src/services/metrics.service.ts` - Metrics collection
- [ ] `src/services/qr-code.service.ts` - QR code generation
- [ ] `src/services/qr.service.ts` - QR service wrapper
- [ ] `src/services/s3.service.ts` - S3 upload/delete operations
- [ ] `src/services/storage-quota.service.ts` - Storage quota management
- [ ] `src/services/storage.s3.ts` - S3 storage service
- [ ] `src/services/ticket-pdf.service.ts` - Ticket PDF generation
- [ ] `src/services/upload.service.ts` - File upload operations
- [ ] `src/services/virus-scan.service.ts` - Virus scan orchestration

### 6. Controller Files (8 files)
- [ ] `src/controllers/admin.controller.ts` - Admin operations
- [ ] `src/controllers/document.controller.ts` - Document processing
- [ ] `src/controllers/download.controller.ts` - File download/streaming
- [ ] `src/controllers/health.controller.ts` - Health checks
- [ ] `src/controllers/image.controller.ts` - Image manipulation
- [ ] `src/controllers/metrics.controller.ts` - Metrics endpoints
- [ ] `src/controllers/qr.controller.ts` - QR code generation
- [ ] `src/controllers/upload.controller.ts` - File upload management

### 7. Validator Files (3 files)
- [ ] `src/validators/file.validator.ts` - File validation (size, MIME type)
- [ ] `src/validators/image.validator.ts` - Image operation validation
- [ ] `src/validators/upload.validator.ts` - Upload request validation

### 8. Model Files (1 file)
- [ ] `src/models/file.model.ts` - File CRUD operations

### 9. Route Files (4 files)
- [ ] `src/routes/cache.routes.ts` - Cache management routes
- [ ] `src/routes/health.routes.ts` - Health check routes
- [ ] `src/routes/index.ts` - Main route registration
- [ ] `src/routes/ticket-pdf.routes.ts` - Ticket PDF routes

### 10. Schema/Validation Files (1 file)
- [ ] `src/schemas/validation.ts` - Joi validation schemas

### 11. Processor Files (5 files)
- [ ] `src/processors/document/document.processor.ts` - Document processing
- [ ] `src/processors/image/image.processor.ts` - Image processing pipeline
- [ ] `src/processors/image/optimize.processor.ts` - Image optimization
- [ ] `src/processors/image/thumbnail.generator.ts` - Thumbnail generation
- [ ] `src/processors/image/watermark.processor.ts` - Watermark application

### 12. Storage Files (4 files)
- [ ] `src/storage/storage.service.ts` - Storage abstraction layer
- [ ] `src/storage/storage.setup.ts` - Storage initialization
- [ ] `src/storage/providers/local.provider.ts` - Local filesystem provider
- [ ] `src/storage/providers/s3.provider.ts` - AWS S3 provider

### 13. Type/Error/Constant Files (3 files)
- [ ] `src/types/file.types.ts` - TypeScript type definitions
- [ ] `src/errors/index.ts` - Error definitions and exports
- [ ] `src/constants/file-status.ts` - File status constants

### 14. Worker Files (1 file)
- [ ] `src/workers/index.ts` - Background worker initialization

---

## Test Coverage Requirements

### Each Unit Test Must Cover:

1. **Happy Path** - All primary functionality works as expected
2. **Error Paths** - All error conditions are handled properly
3. **Edge Cases** - Boundary conditions, empty inputs, null values
4. **Validation** - Input validation works correctly
5. **Mocking** - External dependencies are properly mocked
6. **Async Operations** - Promises and async/await are tested properly
7. **State Management** - State changes are verified
8. **Side Effects** - Database calls, API calls, file operations are verified

### Test Structure for Each File:

```typescript
describe('[FileName]', () => {
  // Setup and teardown
  beforeEach(() => { /* Reset mocks and state */ });
  afterEach(() => { /* Cleanup */ });

  describe('[FunctionName]', () => {
    it('should [expected behavior] when [condition]', async () => {
      // Arrange
      // Act
      // Assert
    });

    it('should throw error when [error condition]', async () => {
      // Test error handling
    });

    it('should handle [edge case]', async () => {
      // Test edge cases
    });
  });
});
```

---

## Priority Order

### Phase 1: Foundation (Must Test First)
1. Utils & Errors
2. Config files
3. Constants & Types
4. Middleware

### Phase 2: Core Business Logic
5. Models
6. Services
7. Validators

### Phase 3: API Layer
8. Controllers
9. Routes
10. Processors

### Phase 4: Storage & Workers
11. Storage providers
12. Workers
13. App & Index

---

## Testing Tools & Setup

### Dependencies Required:
- `jest` - Test framework
- `@types/jest` - TypeScript types
- `ts-jest` - TypeScript support
- `supertest` - HTTP testing
- `@faker-js/faker` - Test data generation
- `jest-mock-extended` - Enhanced mocking

### Mock Requirements:
- **Database**: Mock pg pool and Knex
- **Redis**: Mock Redis client
- **AWS SDK**: Mock S3, Secrets Manager
- **Sharp**: Mock image processing
- **pdf-parse**: Mock PDF parsing
- **qrcode**: Mock QR generation
- **ClamAV**: Mock virus scanner
- **HTTP Clients**: Mock axios/fetch
- **File System**: Mock fs operations

### Jest Configuration:
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/migrations/**',
    '!src/types/**'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  }
};
```

---

## Coverage Goals

- **Line Coverage**: 80%+
- **Branch Coverage**: 80%+
- **Function Coverage**: 80%+
- **Statement Coverage**: 80%+

---

## Test File Naming Convention

Source file: `src/services/upload.service.ts`
Test file: `tests/unit/services/upload.service.test.ts`

**Pattern**: Mirror the source structure in `tests/unit/` directory

---

## Key Testing Scenarios by Category

### Config Tests
- Environment variable validation
- Database connection success/failure
- Secret loading from AWS/env
- Configuration validation

### Middleware Tests
- Authentication (valid/invalid/missing tokens)
- Authorization (role checks)
- File ownership verification
- Rate limiting (within/exceeded limits)
- Error handling middleware
- Tenant context extraction

### Service Tests
- CRUD operations
- Business logic validation
- External service integration (mocked)
- Error handling
- Retry logic
- Caching behavior

### Controller Tests
- Request handling
- Response formatting
- Error responses
- Status codes
- Middleware integration
- Input validation

### Validator Tests
- Valid inputs pass
- Invalid inputs rejected
- Edge cases handled
- Error messages correct

### Model Tests
- Database queries
- Data mapping
- CRUD operations
- Relationships

### Storage Tests
- File upload/download
- S3 operations
- Local storage operations
- Error handling
- Presigned URL generation

### Processor Tests
- Image processing (resize, crop, rotate, watermark)
- Document processing (PDF parsing, text extraction)
- Thumbnail generation
- Video processing

---

## Mock Data Standards

### Mock User
```typescript
const mockUser = {
  id: 'user-123',
  email: 'test@example.com',
  role: 'user',
  tenant_id: 'tenant-123'
};
```

### Mock File
```typescript
const mockFile = {
  id: 'file-123',
  filename: 'test-image.jpg',
  mime_type: 'image/jpeg',
  size_bytes: 102400,
  storage_path: 'uploads/test-image.jpg',
  uploaded_by: 'user-123',
  entity_type: 'ticket',
  entity_id: 'ticket-123',
  access_level: 'private',
  status: 'ready'
};
```

### Mock Request
```typescript
const mockReq = {
  user: mockUser,
  params: { fileId: 'file-123' },
  body: {},
  headers: {},
  query: {}
};
```

### Mock Response
```typescript
const mockRes = {
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
  send: jest.fn().mockReturnThis()
};
```

---

## Anti-Patterns to Avoid

1. ❌ Testing implementation details instead of behavior
2. ❌ Not mocking external dependencies
3. ❌ Writing tests that depend on other tests
4. ❌ Using real database/network connections
5. ❌ Not testing error conditions
6. ❌ Ignoring edge cases
7. ❌ Tests that are too slow (>100ms per test)
8. ❌ Not cleaning up after tests

---

## Success Criteria

✅ All 63 source files have corresponding test files  
✅ All functions/methods have unit tests  
✅ All error paths are tested  
✅ All edge cases are covered  
✅ 80%+ code coverage achieved  
✅ All tests pass consistently  
✅ Tests run in <30 seconds total  
✅ No real external dependencies used  
✅ All async operations properly tested  
✅ Mock data is realistic and consistent  

---

**Status**: Ready to begin implementation  
**Last Updated**: 2026-01-15
