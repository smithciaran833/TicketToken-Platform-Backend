EVENT SERVICE - TESTING GUIDEService: event-service
Version: 1.0
Last Updated: October 22, 2025📋 OVERVIEWThis directory contains all tests for the event service, including unit tests, integration tests, and end-to-end tests. This README provides guidance on running tests, writing new tests, and maintaining test coverage.📁 DIRECTORY STRUCTUREtests/
├── 00-MASTER-DOCUMENTATION.md   # Master test coverage tracker
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
│   │   ├── events.controller.test.ts
│   │   ├── schedule.controller.test.ts
│   │   ├── capacity.controller.test.ts
│   │   ├── tickets.controller.test.ts
│   │   ├── pricing.controller.test.ts
│   │   ├── customer-analytics.controller.test.ts
│   │   ├── report-analytics.controller.test.ts
│   │   ├── venue-analytics.controller.test.ts
│   │   └── notification.controller.test.ts
│   ├── services/
│   │   ├── event.service.test.ts
│   │   ├── capacity.service.test.ts
│   │   ├── pricing.service.test.ts
│   │   ├── cache-integration.test.ts
│   │   ├── reservation-cleanup.service.test.ts
│   │   ├── venue-service.client.test.ts
│   │   ├── databaseService.test.ts
│   │   └── redisService.test.ts
│   ├── middleware/
│   │   ├── auth.middleware.test.ts
│   │   ├── authenticate.middleware.test.ts
│   │   ├── tenant.middleware.test.ts
│   │   └── error-handler.middleware.test.ts
│   ├── models/
│   │   ├── event.model.test.ts
│   │   ├── event-schedule.model.test.ts
│   │   ├── event-capacity.model.test.ts
│   │   ├── event-pricing.model.test.ts
│   │   ├── event-category.model.test.ts
│   │   ├── event-metadata.model.test.ts
│   │   └── base.model.test.ts
│   └── utils/
│       ├── audit-logger.test.ts
│       ├── error-response.test.ts
│       ├── errors.test.ts
│       ├── logger.test.ts
│       └── metrics.test.ts
│
├── integration/                  # Integration tests (multi-component)
│   ├── event-flows/
│   │   ├── event-lifecycle.test.ts
│   │   ├── event-publishing.test.ts
│   │   └── event-cancellation.test.ts
│   ├── capacity-management/
│   │   ├── reservation-flow.test.ts
│   │   ├── concurrent-reservations.test.ts
│   │   └── capacity-locks.test.ts
│   ├── pricing/
│   │   ├── dynamic-pricing.test.ts
│   │   ├── price-locking.test.ts
│   │   └── discount-codes.test.ts
│   └── ticket-flows/
│       ├── ticket-generation.test.ts
│       ├── ticket-validation.test.ts
│       └── ticket-transfers.test.ts
│
└── e2e/                          # End-to-end tests (full API)
    ├── event-crud.test.ts
    ├── ticket-purchase-flow.test.ts
    ├── event-checkin.test.ts
    └── refund-workflow.test.ts🚀 RUNNING TESTSPrerequisitesbash# Install dependencies
npm install

# Setup test database
npm run db:test:setup

# Seed test data
npm run db:test:seed

# Start Redis test instance
docker-compose up -d redis-testRun All Testsbashnpm testRun Specific Test Suitesbash# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# E2E tests only
npm run test:e2e

# Specific file
npm test -- events.controller.test.ts

# Specific test suite
npm test -- --testNamePattern="createEvent"Run with Coveragebash# Generate coverage report
npm run test:coverage

# View HTML coverage report
open coverage/lcov-report/index.htmlWatch Modebash# Watch for changes and re-run tests
npm run test:watch

# Watch specific file
npm test -- --watch events.controller.test.ts📝 WRITING TESTSTest StructureFollow this standard structure for all tests:typescriptimport { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { createMockRequest, createMockReply, TEST_EVENTS } from '../fixtures/test-data';

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
});Naming ConventionsTest Files:

{module}.test.ts - Unit tests
{feature}.test.ts - Integration tests
{flow}.test.ts - E2E tests
Test Case IDs:

Format: TC-{MODULE}-{FUNCTION}-{NUMBER}
Example: TC-EC-CE-001 (Events Controller - createEvent - test 001)
Module codes defined in 02-TEST-SPECIFICATIONS.md
Test Names:

Start with test case ID
Use "should" statements
Be specific and descriptive
Example: TC-EC-CE-001: should create event with valid data
AAA PatternUse the Arrange-Act-Assert (AAA) pattern:typescripttest('should reserve capacity with distributed lock', async () => {
  // Arrange (Given)
  const event = TEST_EVENTS.CONCERT;
  const quantity = 5;
  
  // Act (When)
  const reservation = await capacityService.reserveCapacity({
    event_id: event.id,
    quantity
  });
  
  // Assert (Then)
  expect(reservation.id).toBeDefined();
  expect(reservation.quantity).toBe(5);
  expect(reservation.expires_at).toBeDefined();
});🎯 TEST CATEGORIESUnit TestsPurpose: Test individual functions in isolation
Location: tests/unit/
Characteristics:

No external dependencies
Use mocks for services/databases
Fast execution (<1ms per test)
High coverage (aim for 90%+)
Example:
typescripttest('TC-ES-VE-001: should validate event dates', () => {
  const invalidEvent = {
    starts_at: new Date('2025-12-31T20:00:00Z'),
    ends_at: new Date('2025-12-31T18:00:00Z')
  };
  
  expect(() => validateEventData(invalidEvent)).toThrow(ValidationError);
  expect(() => validateEventData(invalidEvent)).toThrow('starts_at must be before ends_at');
});Integration TestsPurpose: Test multiple components working together
Location: tests/integration/
Characteristics:

Real database connections (test DB)
Real Redis connections
Multiple services interacting
Medium execution time (100ms-1s per test)
Example:
typescripttest('TC-INT-RES-001: should reserve capacity with Redis lock', async () => {
  // Given
  const event = await createTestEvent({ capacity: 100 });
  
  // When
  const reservation = await capacityService.reserveCapacity({
    event_id: event.id,
    quantity: 10
  });
  
  // Then
  expect(reservation.id).toBeDefined();
  
  // Verify Redis
  const capacity = await redis.get(`capacity:${event.id}`);
  expect(JSON.parse(capacity).pending_count).toBe(10);
  
  // Verify database
  const dbReservation = await db.query(
    'SELECT * FROM reservations WHERE id = $1',
    [reservation.id]
  );
  expect(dbReservation.rows[0]).toBeDefined();
});End-to-End TestsPurpose: Test complete user workflows via API
Location: tests/e2e/
Characteristics:

Full HTTP requests/responses
Complete authentication flow
Database + cache + external services
Slower execution (1s+ per test)
Example:
typescripttest('TC-E2E-TICKET-001: complete ticket purchase flow', async () => {
  // 1. Login
  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'customer@test.com', password: 'password' });
  
  const token = loginRes.body.accessToken;
  
  // 2. Reserve capacity
  const reserveRes = await request(app)
    .post('/api/v1/capacity/reserve')
    .set('Authorization', `Bearer ${token}`)
    .send({ event_id: testEvent.id, quantity: 2 });
  
  expect(reserveRes.status).toBe(200);
  const reservationId = reserveRes.body.reservation_id;
  
  // 3. Confirm purchase
  const confirmRes = await request(app)
    .post('/api/v1/capacity/confirm')
    .set('Authorization', `Bearer ${token}`)
    .send({ reservation_id: reservationId });
  
  expect(confirmRes.status).toBe(200);
  
  // 4. Generate tickets
  const ticketsRes = await request(app)
    .post('/api/v1/tickets/generate')
    .set('Authorization', `Bearer ${token}`)
    .send({ order_id: confirmRes.body.order_id });
  
  expect(ticketsRes.status).toBe(201);
  expect(ticketsRes.body.tickets).toHaveLength(2);
  expect(ticketsRes.body.tickets[0].qr_code).toBeDefined();
});🛠️ TEST UTILITIESTest DataImport test fixtures from fixtures/test-data.ts:typescriptimport { 
  TEST_EVENTS,
  TEST_SCHEDULES,
  TEST_PRICING,
  TEST_TICKETS,
  TEST_USERS,
  createTestEvent,
  createTestSchedule,
  createTestPricing
} from '../fixtures/test-data';

// Use predefined fixtures
const event = TEST_EVENTS.CONCERT;
const schedule = TEST_SCHEDULES.CONCERT_FRIDAY;

// Create custom test data
const customEvent = createTestEvent({
  name: 'Custom Music Festival',
  capacity: 5000,
  status: 'published'
});Mock ServicesUse service mocks from fixtures/mock-services.ts:typescriptimport { 
  createMockEventService,
  createMockVenueServiceClient 
} from '../fixtures/mock-services';

const mockEventService = createMockEventService({
  createEvent: jest.fn().mockResolvedValue(TEST_EVENTS.CONCERT)
});

const mockVenueClient = createMockVenueServiceClient({
  getVenue: jest.fn().mockResolvedValue(TEST_VENUES.ARENA)
});Database Helperstypescriptimport { 
  seedTestDatabase,
  cleanTestDatabase,
  createTestConnection 
} from '../fixtures/test-helpers';

beforeEach(async () => {
  await cleanTestDatabase();
  await seedTestDatabase();
});Redis Helperstypescriptimport { 
  clearRedisCache,
  setTestCapacity,
  getTestReservation 
} from '../fixtures/test-helpers';

beforeEach(async () => {
  await clearRedisCache();
});🔍 TEST COVERAGECoverage GoalsCategoryTargetCurrentStatements90%TBDBranches85%TBDFunctions90%TBDLines90%TBDCritical PathsThese must have 100% coverage:

✅ Authentication & authorization
✅ Event creation & publishing
✅ Capacity management & reservations
✅ Ticket generation & validation
✅ Price locking & dynamic pricing
✅ Tenant isolation
✅ Distributed locking (Redis)
Checking Coveragebash# Generate coverage report
npm run test:coverage

# View specific file coverage
npm run test:coverage -- events.service.ts

# View coverage for changed files only
npm run test:coverage -- --changedSince=main🐛 DEBUGGING TESTSDebug in VS CodeAdd to .vscode/launch.json:json{
  "type": "node",
  "request": "launch",
  "name": "Jest Debug",
  "program": "${workspaceFolder}/node_modules/.bin/jest",
  "args": ["--runInBand", "--no-cache"],
  "console": "integratedTerminal",
  "internalConsoleOptions": "neverOpen"
}Debug Specific Testbash# Run with debugging
node --inspect-brk node_modules/.bin/jest --runInBand events.controller.test.tsVerbose Outputbash# Show all console.log statements
npm test -- --verbose

# Show test names
npm test -- --verbose --listTests⚡ PERFORMANCETest Execution TimeMonitor slow tests:bash# Show slowest tests
npm test -- --verbose | grep -E "PASS|FAIL" | sort -k2 -n

# Set timeout for slow tests
jest.setTimeout(10000); // 10 secondsParallel Executionbash# Run tests in parallel (default)
npm test

# Run serially (for debugging)
npm test -- --runInBand

# Limit workers
npm test -- --maxWorkers=4🔄 CONTINUOUS INTEGRATIONPre-commit HooksTests run automatically before commits:bash# Configured in .husky/pre-commit
npm run test:changed
npm run test:lintCI PipelineTests run on every push/PR:yaml# .github/workflows/test.yml
- name: Run tests
  run: |
    npm run test:ci
    npm run test:coverage
    
- name: Upload coverage
  uses: codecov/codecov-action@v3📊 TEST METRICSTrack these metrics:
Test Count: ~530 total tests planned
Execution Time: Target <5 min for all tests
Flakiness: <1% flaky tests
Coverage: 90%+ code coverage
Maintenance: Update tests with code changes
🚨 COMMON ISSUESDatabase Connection Errorsbash# Ensure test database is running
docker-compose up -d postgres-test

# Reset test database
npm run db:test:resetRedis Connection Errorsbash# Start Redis test instance
docker-compose up -d redis-test

# Clear Redis cache
npm run cache:clear:testPort Already in Usebash# Kill process on port
lsof -ti:3003 | xargs kill -9

# Or use different port for tests
TEST_PORT=3004 npm testTimeout Errorstypescript// Increase timeout for slow tests
jest.setTimeout(10000);

// Or per test
test('slow test', async () => {
  // ...
}, 10000);Race Conditions in Capacity Teststypescript// Use proper async/await and locks
test('should handle concurrent reservations', async () => {
  // Run reservations in parallel
  const results = await Promise.allSettled([
    reserveCapacity({ quantity: 10 }),
    reserveCapacity({ quantity: 10 })
  ]);
  
  // One should succeed, one should fail
  const succeeded = results.filter(r => r.status === 'fulfilled');
  expect(succeeded).toHaveLength(1);
});📚 RESOURCESDocumentation
Jest Documentation
Supertest API
Testing Best Practices
Internal Docs
00-MASTER-DOCUMENTATION.md - Coverage tracker
01-FUNCTION-INVENTORY.md - Function listing
02-TEST-SPECIFICATIONS.md - Detailed test specs
Related Services
Auth Service: /services/auth-service/tests/
Venue Service: /services/venue-service/tests/
Order Service: /services/order-service/tests/
🤝 CONTRIBUTINGAdding New Tests
Check 00-MASTER-DOCUMENTATION.md for test case assignments
Follow naming conventions
Use existing fixtures when possible
Update coverage tracker when complete
Ensure tests pass before committing
Test Review ChecklistBefore submitting tests for review:
 Tests follow AAA pattern
 Test names are descriptive
 Fixtures used instead of hardcoded data
 No console.log statements
 Tests are independent (no order dependency)
 Cleanup (afterEach) implemented
 Edge cases covered
 Error cases tested
 Tenant isolation tested
 Race conditions tested (for capacity/locking)
 Coverage >90% for new code
 Tests pass in CI
📞 SUPPORTQuestions about tests? Contact:
Test Lead: [Name]
Slack Channel: #event-service-testing
Documentation: This README and linked docs