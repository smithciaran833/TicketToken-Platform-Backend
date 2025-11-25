# VENUE SERVICE - TESTING GUIDE

**Service:** venue-service  
**Version:** 1.0  
**Last Updated:** October 22, 2025

---

## 📋 OVERVIEW

This directory contains all tests for the venue service, including unit tests, integration tests, and end-to-end tests. This README provides guidance on running tests, writing new tests, and maintaining test coverage.

---

## 📁 DIRECTORY STRUCTURE

```
tests/
├── 00-MASTER-COVERAGE.md        # Master test coverage tracker
├── 01-FUNCTION-INVENTORY.md     # Complete function inventory
├── 02-TEST-SPECIFICATIONS.md    # Detailed test specifications
├── README.md                     # This file
│
├── fixtures/                     # Test data and helpers
│   ├── test-data.ts             # Test fixtures and data
│   ├── test-helpers.ts          # Test utility functions
│   └── mock-services.ts         # Service mocks
│
├── unit/                         # Unit tests (isolated)
│   ├── controllers/
│   │   ├── venues.controller.test.ts
│   │   ├── settings.controller.test.ts
│   │   ├── integrations.controller.test.ts
│   │   ├── analytics.controller.test.ts
│   │   └── compliance.controller.test.ts
│   ├── services/
│   │   ├── venue.service.test.ts
│   │   ├── onboarding.service.test.ts
│   │   ├── verification.service.test.ts
│   │   ├── integration.service.test.ts
│   │   ├── analytics.service.test.ts
│   │   └── compliance.service.test.ts
│   ├── middleware/
│   │   ├── auth.middleware.test.ts
│   │   ├── validation.middleware.test.ts
│   │   ├── rate-limit.middleware.test.ts
│   │   └── error-handler.middleware.test.ts
│   ├── models/
│   │   ├── venue.model.test.ts
│   │   ├── staff.model.test.ts
│   │   └── settings.model.test.ts
│   └── utils/
│       ├── circuitBreaker.test.ts
│       ├── retry.test.ts
│       └── httpClient.test.ts
│
├── integration/                  # Integration tests (multi-component)
│   ├── venue-flows/
│   │   ├── venue-lifecycle.test.ts
│   │   ├── venue-staff-management.test.ts
│   │   └── venue-settings.test.ts
│   ├── integrations/
│   │   ├── ticketmaster-sync.test.ts
│   │   ├── eventbrite-sync.test.ts
│   │   └── stripe-payments.test.ts
│   ├── analytics/
│   │   └── venue-analytics.test.ts
│   └── caching/
│       └── cache-integration.test.ts
│
└── e2e/                          # End-to-end tests (full API)
    ├── venue-crud.test.ts
    ├── staff-management.test.ts
    └── integration-workflows.test.ts
```

---

## 🚀 RUNNING TESTS

### Prerequisites

```bash
# Install dependencies
npm install

# Setup test database
npm run db:test:setup

# Seed test data
npm run db:test:seed
```

### Run All Tests

```bash
npm test
```

### Run Specific Test Suites

```bash
# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# E2E tests only
npm run test:e2e

# Specific file
npm test -- venues.controller.test.ts

# Specific test suite
npm test -- --testNamePattern="createVenue"
```

### Run with Coverage

```bash
# Generate coverage report
npm run test:coverage

# View HTML coverage report
open coverage/lcov-report/index.html
```

### Watch Mode

```bash
# Watch for changes and re-run tests
npm run test:watch

# Watch specific file
npm test -- --watch venues.controller.test.ts
```

---

## 📝 WRITING TESTS

### Test Structure

Follow this standard structure for all tests:

```typescript
import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { createMockRequest, createMockReply, TEST_VENUES } from '../fixtures/test-data';

describe('Controller/Service/Function Name', () => {
  // Setup
  beforeEach(async () => {
    // Clear database
    // Reset mocks
    // Seed test data
  });

  afterEach(async () => {
    // Cleanup
  });

  // Test cases
  test('TC-XX-YYY: should do something successfully', async () => {
    // Arrange (Given)
    const input = { /* ... */ };
    const expected = { /* ... */ };

    // Act (When)
    const result = await functionUnderTest(input);

    // Assert (Then)
    expect(result).toEqual(expected);
  });

  test('TC-XX-YYY: should handle error case', async () => {
    // Arrange
    const invalidInput = { /* ... */ };

    // Act & Assert
    await expect(
      functionUnderTest(invalidInput)
    ).rejects.toThrow(ExpectedError);
  });
});
```

### Naming Conventions

**Test Files:**
- `{module}.test.ts` - Unit tests
- `{feature}.test.ts` - Integration tests
- `{flow}.test.ts` - E2E tests

**Test Case IDs:**
- Format: `TC-{MODULE}-{FUNCTION}-{NUMBER}`
- Example: `TC-VC-001` (Venue Controller test 001)
- Module codes defined in 02-TEST-SPECIFICATIONS.md

**Test Names:**
- Start with test case ID
- Use "should" statements
- Be specific and descriptive
- Example: `TC-VC-001: should create venue with valid data`

### AAA Pattern

Use the Arrange-Act-Assert (AAA) pattern:

```typescript
test('should calculate venue capacity correctly', async () => {
  // Arrange (Given)
  const venue = TEST_VENUES.THEATER;
  const events = [/* ... */];
  
  // Act (When)
  const capacity = await calculateCapacity(venue, events);
  
  // Assert (Then)
  expect(capacity.available).toBe(450);
  expect(capacity.reserved).toBe(50);
  expect(capacity.utilized).toBe(500);
});
```

---

## 🎯 TEST CATEGORIES

### Unit Tests

**Purpose:** Test individual functions in isolation  
**Location:** `tests/unit/`  
**Characteristics:**
- No external dependencies
- Use mocks for services/databases
- Fast execution (<1ms per test)
- High coverage (aim for 90%+)

**Example:**
```typescript
test('TC-VS-001: should validate venue name length', () => {
  const shortName = 'AB';
  expect(() => validateVenueName(shortName)).toThrow(ValidationError);
  
  const validName = 'Madison Square Garden';
  expect(() => validateVenueName(validName)).not.toThrow();
});
```

### Integration Tests

**Purpose:** Test multiple components working together  
**Location:** `tests/integration/`  
**Characteristics:**
- Real database connections (test DB)
- Real Redis connections
- Multiple services interacting
- Medium execution time (100ms-1s per test)

**Example:**
```typescript
test('TC-INT-VL-001: should create venue and update cache', async () => {
  // Given
  const venueData = { /* ... */ };
  
  // When
  const venue = await venueService.createVenue(venueData);
  
  // Then
  expect(venue.id).toBeDefined();
  
  // Verify cache
  const cached = await redis.get(`venue:${venue.id}`);
  expect(cached).toBeDefined();
  expect(JSON.parse(cached)).toMatchObject(venue);
});
```

### End-to-End Tests

**Purpose:** Test complete user workflows via API  
**Location:** `tests/e2e/`  
**Characteristics:**
- Full HTTP requests/responses
- Complete authentication flow
- Database + cache + external services
- Slower execution (1s+ per test)

**Example:**
```typescript
test('TC-E2E-VC-001: complete venue creation flow', async () => {
  // 1. Login
  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'owner@test.com', password: 'password' });
  
  const token = loginRes.body.accessToken;
  
  // 2. Create venue
  const venueRes = await request(app)
    .post('/api/v1/venues')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Test Venue', capacity: 500 });
  
  expect(venueRes.status).toBe(201);
  
  // 3. Verify venue exists
  const getRes = await request(app)
    .get(`/api/v1/venues/${venueRes.body.venue.id}`)
    .set('Authorization', `Bearer ${token}`);
  
  expect(getRes.status).toBe(200);
  expect(getRes.body.venue.name).toBe('Test Venue');
});
```

---

## 🛠️ TEST UTILITIES

### Test Data

Import test fixtures from `fixtures/test-data.ts`:

```typescript
import { 
  TEST_VENUES,
  TEST_USERS,
  TEST_STAFF,
  TEST_INTEGRATIONS,
  createTestVenue,
  createTestUser
} from '../fixtures/test-data';

// Use predefined fixtures
const venue = TEST_VENUES.THEATER;

// Create custom test data
const customVenue = createTestVenue({
  name: 'Custom Arena',
  capacity: 10000
});
```

### Mock Services

Use service mocks from `fixtures/mock-services.ts`:

```typescript
import { createMockVenueService } from '../fixtures/mock-services';

const mockVenueService = createMockVenueService({
  createVenue: jest.fn().mockResolvedValue(TEST_VENUES.THEATER)
});
```

### Database Helpers

```typescript
import { 
  seedTestDatabase,
  cleanTestDatabase,
  createTestConnection 
} from '../fixtures/test-helpers';

beforeEach(async () => {
  await cleanTestDatabase();
  await seedTestDatabase();
});
```

---

## 🔍 TEST COVERAGE

### Coverage Goals

| Category | Target | Current |
|----------|--------|---------|
| Statements | 90% | TBD |
| Branches | 85% | TBD |
| Functions | 90% | TBD |
| Lines | 90% | TBD |

### Critical Paths

These must have 100% coverage:
- ✅ Authentication & authorization
- ✅ Venue creation & updates
- ✅ Staff management
- ✅ Tenant isolation
- ✅ Payment processing

### Checking Coverage

```bash
# Generate coverage report
npm run test:coverage

# View specific file coverage
npm run test:coverage -- venues.service.ts

# View coverage for changed files only
npm run test:coverage -- --changedSince=main
```

---

## 🐛 DEBUGGING TESTS

### Debug in VS Code

Add to `.vscode/launch.json`:

```json
{
  "type": "node",
  "request": "launch",
  "name": "Jest Debug",
  "program": "${workspaceFolder}/node_modules/.bin/jest",
  "args": ["--runInBand", "--no-cache"],
  "console": "integratedTerminal",
  "internalConsoleOptions": "neverOpen"
}
```

### Debug Specific Test

```bash
# Run with debugging
node --inspect-brk node_modules/.bin/jest --runInBand venues.controller.test.ts
```

### Verbose Output

```bash
# Show all console.log statements
npm test -- --verbose

# Show test names
npm test -- --verbose --listTests
```

---

## ⚡ PERFORMANCE

### Test Execution Time

Monitor slow tests:

```bash
# Show slowest tests
npm test -- --verbose | grep -E "PASS|FAIL" | sort -k2 -n

# Set timeout for slow tests
jest.setTimeout(10000); // 10 seconds
```

### Parallel Execution

```bash
# Run tests in parallel (default)
npm test

# Run serially (for debugging)
npm test -- --runInBand

# Limit workers
npm test -- --maxWorkers=4
```

---

## 🔄 CONTINUOUS INTEGRATION

### Pre-commit Hooks

Tests run automatically before commits:

```bash
# Configured in .husky/pre-commit
npm run test:changed
npm run test:lint
```

### CI Pipeline

Tests run on every push/PR:

```yaml
# .github/workflows/test.yml
- name: Run tests
  run: |
    npm run test:ci
    npm run test:coverage
    
- name: Upload coverage
  uses: codecov/codecov-action@v3
```

---

## 📊 TEST METRICS

Track these metrics:

- **Test Count:** ~436 total tests planned
- **Execution Time:** Target <5 min for all tests
- **Flakiness:** <1% flaky tests
- **Coverage:** 90%+ code coverage
- **Maintenance:** Update tests with code changes

---

## 🚨 COMMON ISSUES

### Database Connection Errors

```bash
# Ensure test database is running
docker-compose up -d postgres-test

# Reset test database
npm run db:test:reset
```

### Redis Connection Errors

```bash
# Start Redis test instance
docker-compose up -d redis-test

# Clear Redis cache
npm run cache:clear:test
```

### Port Already in Use

```bash
# Kill process on port
lsof -ti:3002 | xargs kill -9

# Or use different port for tests
TEST_PORT=3003 npm test
```

### Timeout Errors

```typescript
// Increase timeout for slow tests
jest.setTimeout(10000);

// Or per test
test('slow test', async () => {
  // ...
}, 10000);
```

---

## 📚 RESOURCES

### Documentation

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest API](https://github.com/visionmedia/supertest#readme)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)

### Internal Docs

- `00-MASTER-COVERAGE.md` - Coverage tracker
- `01-FUNCTION-INVENTORY.md` - Function listing
- `02-TEST-SPECIFICATIONS.md` - Detailed test specs

### Related Services

- Auth Service: `/services/auth-service/tests/`
- Event Service: `/services/event-service/tests/`

---

## 🤝 CONTRIBUTING

### Adding New Tests

1. Check `00-MASTER-COVERAGE.md` for test case assignments
2. Follow naming conventions
3. Use existing fixtures when possible
4. Update coverage tracker when complete
5. Ensure tests pass before committing

### Test Review Checklist

Before submitting tests for review:

- [ ] Tests follow AAA pattern
- [ ] Test names are descriptive
- [ ] Fixtures used instead of hardcoded data
- [ ] No console.log statements
- [ ] Tests are independent (no order dependency)
- [ ] Cleanup (afterEach) implemented
- [ ] Edge cases covered
- [ ] Error cases tested
- [ ] Coverage >90% for new code
- [ ] Tests pass in CI

---

## 📞 SUPPORT

Questions about tests? Contact:

- **Test Lead:** [Name]
- **Slack Channel:** #venue-service-testing
- **Documentation:** This README and linked docs

---

**Happy Testing! 🧪**