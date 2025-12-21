# Testing Standards for Production Systems
## Comprehensive Audit Guide for TicketToken Platform

**Version:** 1.0  
**Date:** December 2025  
**Stack:** Jest, Fastify, Knex, Stripe, Solana

---

## Table of Contents

1. [Standards & Best Practices](#1-standards--best-practices)
2. [Common Vulnerabilities & Mistakes](#2-common-vulnerabilities--mistakes)
3. [Audit Checklist](#3-audit-checklist)
4. [Sources & References](#4-sources--references)

---

## 1. Standards & Best Practices

### 1.1 Test Pyramid (Unit, Integration, E2E Ratios)

The test pyramid is a strategic model that optimizes testing efficiency by emphasizing fast, reliable tests at the base while reserving expensive E2E tests for critical paths.

#### Recommended Distribution

| Test Type | Ratio | Characteristics |
|-----------|-------|-----------------|
| Unit Tests | 70% | Fast (ms), isolated, test single functions/modules |
| Integration Tests | 20% | Medium speed, test component interactions |
| E2E Tests | 10% | Slow, expensive, test complete user journeys |

**Source:** [Devzery - Software Testing Pyramid Guide 2025](https://www.devzery.com/post/software-testing-pyramid-guide-2025)

#### Microservices Adjustment

For microservices architectures like TicketToken, adjust to **60-30-10** ratio:

- More integration tests needed to validate service communication
- Contract tests supplement the integration layer
- E2E tests focus only on critical business flows

**Source:** [VirtuosoQA - Testing Pyramid Explained](https://www.virtuosoqa.com/post/what-is-the-testing-pyramid)

#### Anti-Pattern: Ice Cream Cone

Avoid inverting the pyramid (many E2E tests, few unit tests) which leads to:
- Slow feedback loops
- Brittle test suites
- Expensive maintenance
- Developer frustration

**Source:** [HeadSpin - Testing Pyramid Simplified](https://www.headspin.io/blog/the-testing-pyramid-simplified-for-one-and-all)

---

### 1.2 Coverage Requirements and What to Measure

#### Industry Standard Coverage Targets

| Metric | Target | Critical Systems |
|--------|--------|------------------|
| Statement Coverage | 80% | 90%+ |
| Branch Coverage | 75% | 85%+ |
| Function Coverage | 80% | 90%+ |
| Line Coverage | 80% | 90%+ |

**Source:** [TechTarget - Unit Test Coverage Percentage](https://www.techtarget.com/searchsoftwarequality/tip/What-unit-test-coverage-percentage-should-teams-aim-for)

#### What to Measure (Beyond Line Coverage)

1. **Branch Coverage**: Ensures all conditional paths are tested
2. **MC/DC Coverage**: Required for safety-critical systems (ISO 26262, DO-178C)
3. **Mutation Testing Score**: Validates test effectiveness
4. **Test Execution Time**: Track for CI/CD optimization
5. **Flakiness Rate**: Should be < 5%

**Source:** [Bullseye - Minimum Acceptable Code Coverage](https://www.bullseye.com/minimum.html)

#### Coverage by Component Priority

```
Critical (90%+ coverage):
├── Payment processing (Stripe integration)
├── Authentication/Authorization
├── Ticket validation (QR codes)
├── NFT minting operations
└── Multi-tenant data isolation

Standard (80%+ coverage):
├── Business logic
├── API endpoints
├── Data transformations
└── Background jobs

Lower Priority (70%+ coverage):
├── Configuration
├── Utilities
└── Logging
```

**Source:** [LaunchDarkly - Code Coverage What It Is and Why It Matters](https://launchdarkly.com/blog/code-coverage-what-it-is-and-why-it-matters/)

---

### 1.3 Testing Microservices

#### Testing Strategy for 23-Service Architecture

```
                    ┌─────────────────┐
                    │   E2E Tests     │  ← Critical user journeys only
                    │   (Cypress)     │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
       ┌──────▼──────┐ ┌─────▼─────┐ ┌──────▼──────┐
       │  Contract   │ │Integration│ │  Component  │
       │   Tests     │ │   Tests   │ │   Tests     │
       │   (Pact)    │ │           │ │             │
       └──────┬──────┘ └─────┬─────┘ └──────┬──────┘
              │              │              │
              └──────────────┼──────────────┘
                             │
                    ┌────────▼────────┐
                    │   Unit Tests    │  ← Foundation (Jest)
                    │                 │
                    └─────────────────┘
```

#### Microservices Testing Principles

1. **Test in Isolation**: Each service should be testable independently
2. **Mock External Services**: Use stubs for dependencies during unit tests
3. **Real Database for Integration**: Use testcontainers or dedicated test DB
4. **Contract Testing**: Validate API contracts between services
5. **Chaos Engineering**: Test failure scenarios

**Source:** [Hypertest - Contract Testing for Microservices](https://www.hypertest.co/contract-testing/contract-testing-for-microservices)

---

### 1.4 Contract Testing Between Services

#### Consumer-Driven Contract Testing (Recommended)

Contract testing validates that services can communicate correctly without requiring all services to be running simultaneously.

**Workflow:**
```
1. Consumer defines expected interactions
2. Consumer generates contract file
3. Contract is shared (via Pact Broker or Git)
4. Provider verifies contract
5. CI/CD validates contracts on each build
```

#### Tools

| Tool | Best For | Language Support |
|------|----------|------------------|
| Pact | Consumer-driven contracts | JavaScript, Java, Ruby, Python, Go |
| Spring Cloud Contract | JVM ecosystems | Java, Kotlin |
| WireMock | HTTP stubbing | Any (HTTP-based) |

**Source:** [Softwaremill - Testing Microservices Contract Tests](https://softwaremill.com/testing-microservices-contract-tests/)

#### Implementation Example (Pact + Jest)

```javascript
// Consumer test (ticket-service consuming event-service)
const { Pact } = require('@pact-foundation/pact');

describe('Event Service Contract', () => {
  const provider = new Pact({
    consumer: 'TicketService',
    provider: 'EventService',
  });

  beforeAll(() => provider.setup());
  afterAll(() => provider.finalize());

  it('should return event details', async () => {
    await provider.addInteraction({
      state: 'event exists',
      uponReceiving: 'a request for event details',
      withRequest: {
        method: 'GET',
        path: '/events/123',
        headers: { 'Authorization': 'Bearer token' }
      },
      willRespondWith: {
        status: 200,
        body: {
          id: '123',
          name: Matchers.string('Concert'),
          tenant_id: Matchers.uuid()
        }
      }
    });

    const response = await eventClient.getEvent('123');
    expect(response.name).toBeDefined();
  });
});
```

**Source:** [Discover Technology - End-to-End Contract Testing](https://technology.discover.com/posts/end-to-end-contract-testing)

---

### 1.5 Testing Payment Integrations (Stripe)

#### Stripe Test Mode Best Practices

1. **Use Test API Keys**: Always use `sk_test_` and `pk_test_` keys
2. **Dedicated Sandbox**: Create separate test accounts per environment
3. **Test Card Numbers**: Use Stripe-provided test cards

**Source:** [Stripe Documentation - Testing Use Cases](https://docs.stripe.com/testing-use-cases)

#### Essential Test Card Numbers

| Card Number | Scenario |
|-------------|----------|
| 4242 4242 4242 4242 | Successful payment |
| 4000 0000 0000 0341 | Card declined (attach then charge fails) |
| 4000 0000 0000 9995 | Insufficient funds |
| 4000 0027 6000 3184 | Requires 3D Secure authentication |
| 4000 0000 0000 3220 | 3D Secure 2 required |

**Source:** [Stripe Documentation - Testing Billing](https://docs.stripe.com/billing/testing)

#### Webhook Testing

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login and forward webhooks to local
stripe login
stripe listen --forward-to localhost:3000/webhooks/stripe

# Trigger test events
stripe trigger payment_intent.succeeded
stripe trigger customer.subscription.created
stripe trigger invoice.payment_failed
```

**Source:** [Stripe Documentation - Handle Payment Events with Webhooks](https://docs.stripe.com/webhooks/handling-payment-events)

#### Test Clocks for Billing

Use test clocks to simulate time-based events without waiting:

```javascript
// Create test clock
const testClock = await stripe.testHelpers.testClocks.create({
  frozen_time: Math.floor(Date.now() / 1000),
});

// Create customer with test clock
const customer = await stripe.customers.create({
  test_clock: testClock.id,
});

// Advance time by 1 month
await stripe.testHelpers.testClocks.advance(testClock.id, {
  frozen_time: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
});
```

**Source:** [Stripe Documentation - Test Clocks](https://docs.stripe.com/billing/testing/test-clocks)

#### Stripe Integration Test Checklist

- [ ] Successful payment flow
- [ ] Failed payment handling
- [ ] 3D Secure authentication
- [ ] Webhook signature verification
- [ ] Webhook replay attack prevention
- [ ] Connect account creation
- [ ] Payout processing
- [ ] Refund handling
- [ ] Subscription lifecycle (trial → active → cancelled)
- [ ] Invoice generation

**Source:** [Stripe Documentation - Best Practices for Webhooks](https://stripe.com/docs/webhooks/best-practices)

---

### 1.6 Testing Blockchain Interactions (Solana)

#### Solana Testing Environments

| Environment | Purpose | Token Value | Reset Frequency |
|-------------|---------|-------------|-----------------|
| Localhost | Local development | None | On demand |
| Devnet | Integration testing | None (free via faucet) | Periodic |
| Testnet | Stress testing | None | Periodic |
| Mainnet Beta | Production | Real SOL | Never |

**Source:** [Solana Documentation - Clusters](https://solana.com/docs/references/clusters)

#### Devnet Testing Best Practices

1. **Local Validator First**: Test with `solana-test-validator` for speed
2. **Devnet for Integration**: Use Devnet for realistic network conditions
3. **Airdrop Test SOL**: Use faucet for test tokens

```bash
# Start local validator
solana-test-validator

# Configure for Devnet
solana config set --url https://api.devnet.solana.com

# Request test SOL
solana airdrop 2 <wallet_address>
```

**Source:** [Quicknode - Airdropping Test SOL on Solana](https://www.quicknode.com/guides/solana-development/getting-started/a-complete-guide-to-airdropping-test-sol-on-solana)

#### NFT Testing Strategy

```javascript
// Jest test for NFT minting
describe('NFT Minting', () => {
  let connection;
  let payer;

  beforeAll(async () => {
    // Connect to Devnet
    connection = new Connection('https://api.devnet.solana.com');
    
    // Load test wallet
    payer = Keypair.fromSecretKey(/* test key */);
    
    // Ensure balance
    await connection.requestAirdrop(payer.publicKey, LAMPORTS_PER_SOL);
  });

  it('should mint ticket NFT', async () => {
    const mint = await createTicketNFT({
      connection,
      payer,
      eventId: 'test-event-123',
      ticketId: 'ticket-456',
      metadata: {
        name: 'Test Concert Ticket',
        symbol: 'TCKT',
        uri: 'https://metadata.test/ticket.json'
      }
    });

    expect(mint.address).toBeDefined();
    
    // Verify on-chain
    const mintInfo = await getMint(connection, mint.address);
    expect(mintInfo.supply).toBe(1n);
  });
});
```

**Source:** [Helius - Guide to Testing Solana Programs](https://www.helius.dev/blog/a-guide-to-testing-solana-programs)

#### Blockchain Test Isolation

- Use unique keypairs per test
- Create fresh accounts for each test suite
- Clean up accounts in `afterAll` hooks
- Mock blockchain for unit tests, use Devnet for integration

**Source:** [Alchemy - Solana Devnet Overview](https://www.alchemy.com/overviews/solana-devnet)

---

### 1.7 Test Data Management

#### Principles

1. **Never Use Production Data in Tests**: Privacy, compliance, security risks
2. **Synthetic Data for Most Tests**: Generated, compliant, customizable
3. **Masked Production Data**: Only when production-like distribution is required
4. **Data Isolation**: Each test environment has isolated data

**Source:** [K2View - Test Data Management Best Practices](https://www.k2view.com/blog/7-test-data-management-best-practices/)

#### Test Data Strategy

```
┌─────────────────────────────────────────────────────────┐
│                    Test Data Sources                     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
│  │  Synthetic  │  │   Masked    │  │   Subset    │      │
│  │    Data     │  │ Production  │  │  Production │      │
│  │             │  │    Data     │  │    Data     │      │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘      │
│         │                │                │              │
│         ▼                ▼                ▼              │
│  ┌─────────────────────────────────────────────────┐    │
│  │           Test Data Management Layer            │    │
│  │  • De-identification  • Referential Integrity   │    │
│  │  • Version Control    • On-demand Provisioning  │    │
│  └──────────────────────┬──────────────────────────┘    │
│                         │                                │
│         ┌───────────────┼───────────────┐               │
│         ▼               ▼               ▼               │
│    Unit Tests    Integration Tests   E2E Tests          │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Source:** [TestRail - Test Data Management Best Practices](https://www.testrail.com/blog/test-data-management-best-practices/)

#### Implementation for TicketToken

```javascript
// test/factories/event.factory.js
const { faker } = require('@faker-js/faker');

function createTestEvent(overrides = {}) {
  return {
    id: faker.string.uuid(),
    tenant_id: faker.string.uuid(),
    name: faker.music.songName() + ' Concert',
    venue: faker.location.city() + ' Arena',
    date: faker.date.future(),
    capacity: faker.number.int({ min: 100, max: 50000 }),
    price_cents: faker.number.int({ min: 1000, max: 50000 }),
    ...overrides
  };
}

// test/factories/ticket.factory.js
function createTestTicket(overrides = {}) {
  return {
    id: faker.string.uuid(),
    event_id: faker.string.uuid(),
    tenant_id: faker.string.uuid(),
    holder_email: faker.internet.email(),
    seat_number: `${faker.string.alpha(1).toUpperCase()}${faker.number.int({ min: 1, max: 100 })}`,
    status: 'valid',
    qr_code: faker.string.alphanumeric(32),
    ...overrides
  };
}
```

**Source:** [Testim - Leader's Guide to Test Data Management](https://www.testim.io/blog/test-data-management/)

---

### 1.8 CI/CD Test Strategies

#### Pipeline Test Organization

```yaml
# .github/workflows/test.yml
name: Test Pipeline

on: [push, pull_request]

jobs:
  # Stage 1: Fast feedback (< 2 min)
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Unit Tests
        run: npm run test:unit -- --coverage
      - name: Upload Coverage
        uses: codecov/codecov-action@v4

  # Stage 2: Integration (< 10 min)
  integration-tests:
    needs: unit-tests
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:14
        env:
          POSTGRES_DB: test_db
          POSTGRES_PASSWORD: test
    steps:
      - uses: actions/checkout@v4
      - name: Run Integration Tests
        run: npm run test:integration

  # Stage 3: Contract Tests (< 5 min)
  contract-tests:
    needs: unit-tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Contract Tests
        run: npm run test:contract
      - name: Publish Pacts
        run: npm run pact:publish

  # Stage 4: E2E (< 20 min, on main/release only)
  e2e-tests:
    if: github.ref == 'refs/heads/main'
    needs: [integration-tests, contract-tests]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run E2E Tests
        run: npm run test:e2e

  # Stage 5: Security Scans
  security-tests:
    needs: unit-tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Security Scan
        run: npm audit && npm run test:security
```

**Source:** [Datadog - Best Practices for Monitoring Software Testing](https://www.datadoghq.com/blog/best-practices-for-monitoring-software-testing/)

#### Test Parallelization

```javascript
// jest.config.js
module.exports = {
  // Run tests in parallel
  maxWorkers: '50%',
  
  // Separate projects for different test types
  projects: [
    {
      displayName: 'unit',
      testMatch: ['**/*.unit.test.js'],
      testEnvironment: 'node',
    },
    {
      displayName: 'integration',
      testMatch: ['**/*.integration.test.js'],
      testEnvironment: 'node',
      globalSetup: './test/setup/db-setup.js',
      globalTeardown: './test/setup/db-teardown.js',
    }
  ],
};
```

---

## 2. Common Vulnerabilities & Mistakes

### 2.1 No Integration Tests

**Problem**: Unit tests pass but components fail when integrated.

**Signs**:
- Bugs discovered only in staging/production
- "Works on my machine" syndrome
- Fear of refactoring

**Impact**: IBM research shows bugs found in production cost **100x more** to fix than bugs found during development.

**Solution**:
```javascript
// Bad: Only unit tests with mocks
describe('OrderService', () => {
  it('creates order', async () => {
    const mockDb = { insert: jest.fn() };
    const service = new OrderService(mockDb);
    await service.create(orderData);
    expect(mockDb.insert).toHaveBeenCalled();
  });
});

// Good: Integration test with real database
describe('OrderService Integration', () => {
  beforeAll(async () => {
    await knex.migrate.latest();
  });

  afterEach(async () => {
    await knex('orders').truncate();
  });

  it('creates order in database', async () => {
    const service = new OrderService(knex);
    const order = await service.create(orderData);
    
    const saved = await knex('orders').where('id', order.id).first();
    expect(saved).toBeDefined();
    expect(saved.total).toBe(orderData.total);
  });
});
```

**Source:** [VirtuosoQA - Testing Pyramid](https://www.virtuosoqa.com/post/what-is-the-testing-pyramid)

---

### 2.2 Mocking Everything (Missing Real Integration Bugs)

**Problem**: Over-mocking creates false confidence; tests pass but real integrations fail.

**Anti-pattern "Mockery"**: Tests contain so many mocks that the system under test isn't actually being tested.

**Source:** [Yegor256 - Unit Testing Anti-Patterns](https://www.yegor256.com/2018/12/11/unit-testing-anti-patterns.html)

**What to Mock vs. What to Use Real**:

| Mock | Use Real |
|------|----------|
| External APIs (Stripe, Solana mainnet) | Database (use test DB) |
| Email services | Redis (use test instance) |
| SMS providers | Elasticsearch (use test instance) |
| Third-party webhooks | File system (use temp directories) |

**Solution**:

```javascript
// Bad: Mocking database
const mockKnex = {
  select: jest.fn().mockReturnThis(),
  where: jest.fn().mockResolvedValue([{ id: 1 }])
};

// Good: Use real database with transaction rollback
describe('EventRepository', () => {
  let trx;

  beforeEach(async () => {
    trx = await knex.transaction();
  });

  afterEach(async () => {
    await trx.rollback();
  });

  it('finds events by tenant', async () => {
    // Insert test data
    await trx('events').insert({
      tenant_id: 'tenant-1',
      name: 'Test Event'
    });

    // Test with real query
    const repo = new EventRepository(trx);
    const events = await repo.findByTenant('tenant-1');
    
    expect(events).toHaveLength(1);
  });
});
```

**Source:** [Codepipes - Software Testing Anti-patterns](https://blog.codepipes.com/testing/software-testing-antipatterns.html)

---

### 2.3 Flaky Tests

**Problem**: Tests that randomly pass or fail without code changes.

**Statistics**: Google found that ~84% of test transitions from pass to fail were due to flaky tests, not actual bugs.

**Source:** [Aqua Cloud - Flaky Tests](https://aqua-cloud.io/flaky-tests/)

**Common Causes**:

| Cause | Solution |
|-------|----------|
| Race conditions | Use proper async/await, add explicit waits |
| Shared state | Isolate tests, clean up in beforeEach/afterEach |
| Time dependencies | Mock Date.now(), use deterministic values |
| Network flakiness | Retry logic, mock external services |
| Test order dependency | Ensure tests are independent |
| Resource contention | Run database tests serially or use transactions |

**Detection Strategy**:

```javascript
// jest.config.js - Run tests multiple times to detect flakiness
module.exports = {
  // Retry failed tests
  retry: 2,
  
  // Run each test multiple times (for flakiness detection)
  // Only enable during flakiness audits
  // repeat: 10,
};

// CI Configuration
// Run flaky test detection weekly
// npm run test -- --repeat=10 --json > test-results.json
```

**Quarantine Strategy**:

```javascript
// Mark known flaky tests
describe.skip('Flaky: WebSocket reconnection', () => {
  // TODO: Fix race condition in reconnection logic
  // Tracking: JIRA-1234
});
```

**Source:** [Testlio - Flaky Tests Best Practices](https://testlio.com/blog/flaky-tests-best-practices/)

---

### 2.4 Testing Implementation Instead of Behavior

**Problem**: Tests break when implementation changes, even if behavior is correct.

**Source:** [LaunchScout - Testing Behavior vs Testing Implementation](https://launchscout.com/blog/testing-behavior-vs-testing-implementation)

**Anti-pattern Example**:

```javascript
// BAD: Testing implementation
it('calls database with correct SQL', () => {
  const spy = jest.spyOn(knex, 'raw');
  await ticketService.getTicket('123');
  expect(spy).toHaveBeenCalledWith(
    'SELECT * FROM tickets WHERE id = ?',
    ['123']
  );
});

// GOOD: Testing behavior
it('returns ticket with correct data', async () => {
  // Arrange: Insert test data
  await knex('tickets').insert({
    id: '123',
    event_id: 'event-1',
    status: 'valid'
  });

  // Act: Call service
  const ticket = await ticketService.getTicket('123');

  // Assert: Verify behavior
  expect(ticket.id).toBe('123');
  expect(ticket.status).toBe('valid');
});
```

**Behavior-First Mindset**:

- "I don't care HOW you get the answer, just make sure it's correct"
- Test public API, not internal methods
- Focus on inputs and outputs
- Allow refactoring without test changes

**Source:** [Enterprise Craftsmanship - Structural Inspection Anti-pattern](https://enterprisecraftsmanship.com/posts/structural-inspection)

---

### 2.5 Missing Edge Case Tests

**Problem**: Happy path tests pass, but edge cases cause production failures.

**Critical Edge Cases for TicketToken**:

```javascript
describe('Ticket Purchase Edge Cases', () => {
  // Concurrent purchases
  it('handles race condition for last ticket', async () => {
    const event = await createEventWithCapacity(1);
    
    // Simulate concurrent purchases
    const results = await Promise.allSettled([
      purchaseTicket(event.id, 'user1'),
      purchaseTicket(event.id, 'user2'),
    ]);

    const succeeded = results.filter(r => r.status === 'fulfilled');
    const failed = results.filter(r => r.status === 'rejected');

    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
  });

  // Boundary conditions
  it('rejects purchase at exactly capacity limit', async () => {
    const event = await createEventWithCapacity(100);
    await sellTickets(event.id, 100);

    await expect(purchaseTicket(event.id, 'user'))
      .rejects.toThrow('Event sold out');
  });

  // Invalid inputs
  it('handles malformed UUID', async () => {
    await expect(getTicket('not-a-uuid'))
      .rejects.toThrow('Invalid ticket ID format');
  });

  // Timezone edge cases
  it('validates event date in user timezone', async () => {
    const event = await createEvent({
      date: '2025-01-01T00:00:00-12:00' // Earliest timezone
    });

    // User in latest timezone
    const result = await validateEventDate(event.id, 'Pacific/Kiritimati');
    expect(result.isValid).toBe(true);
  });
});
```

**Source:** [Codepipes - Software Testing Anti-patterns](https://blog.codepipes.com/testing/software-testing-antipatterns.html)

---

### 2.6 No Load/Stress Testing

**Problem**: System fails under production load despite passing functional tests.

**Why It Matters**:
- Ticket sales have predictable traffic spikes (on-sale events)
- Payment processing must handle bursts
- Database connections can be exhausted

**Source:** [Grafana k6 Documentation](https://grafana.com/docs/k6/latest/)

**Load Testing Strategy**:

```javascript
// k6/ticket-purchase-load.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    // Smoke test
    smoke: {
      executor: 'constant-vus',
      vus: 5,
      duration: '1m',
    },
    // Average load
    average_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 50 },   // Ramp up
        { duration: '5m', target: 50 },   // Hold
        { duration: '2m', target: 0 },    // Ramp down
      ],
    },
    // Spike test (ticket on-sale scenario)
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 500 },  // Spike
        { duration: '1m', target: 500 },   // Hold
        { duration: '10s', target: 0 },    // Drop
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const res = http.post(`${__ENV.BASE_URL}/api/tickets/purchase`, {
    event_id: 'load-test-event',
    quantity: 1,
  });

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });

  sleep(1);
}
```

**Source:** [Baeldung - Load Testing with k6](https://www.baeldung.com/k6-framework-load-testing)

---

### 2.7 Production Data in Tests

**Problem**: Using real customer data in tests creates compliance and security risks.

**Risks**:
- GDPR/CCPA violations
- PCI-DSS non-compliance (payment data)
- Data breach exposure
- 64% of organizations rank data quality as critically important (World Quality Report 2025)
- Only 7% fully comply with data privacy in test environments (K2View Report)

**Source:** [QAlified - Synthetic vs Production Data](https://qalified.com/blog/test-data-synthetic-vs-production/)

**Solution - Synthetic Data**:

```javascript
// test/factories/user.factory.js
const { faker } = require('@faker-js/faker');

function createTestUser() {
  return {
    id: faker.string.uuid(),
    email: faker.internet.email({ provider: 'test.tickettoken.com' }),
    name: faker.person.fullName(),
    // NEVER use real card numbers
    stripe_customer_id: `cus_test_${faker.string.alphanumeric(14)}`,
    wallet_address: faker.string.hexadecimal({ length: 40 }),
  };
}

// For realistic distribution without PII
function createMaskedProductionLikeData() {
  // Use faker with consistent seed for reproducibility
  faker.seed(12345);
  
  return {
    // Preserves distribution patterns without real data
    age_distribution: generateAgeDistribution(),
    location_distribution: generateLocationDistribution(),
    purchase_patterns: generatePurchasePatterns(),
  };
}
```

**Source:** [DataStealth - Test Data Management Best Practices](https://www.datastealth.io/blogs/test-data-management-best-practices)

---

## 3. Audit Checklist

### 3.1 Jest Configuration Checklist

| Item | Required | Check |
|------|----------|-------|
| `jest.config.js` exists and properly configured | ✓ | ☐ |
| Test files use `.test.js` or `.spec.js` naming | ✓ | ☐ |
| Coverage thresholds configured (min 80%) | ✓ | ☐ |
| Coverage reports output to CI-readable format | ✓ | ☐ |
| `testEnvironment` set to `node` for backend tests | ✓ | ☐ |
| `setupFilesAfterEnv` configured for global setup | ✓ | ☐ |
| `maxWorkers` configured for CI performance | ✓ | ☐ |
| `testTimeout` appropriate (default 5000ms) | ✓ | ☐ |

**Recommended Jest Configuration**:

```javascript
// jest.config.js
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/*.test.js', '**/*.spec.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/migrations/**',
    '!src/seeds/**',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
    './src/services/payment/**': {
      branches: 90,
      functions: 90,
      lines: 90,
    },
  },
  setupFilesAfterEnv: ['./test/setup.js'],
  testTimeout: 10000,
  maxWorkers: process.env.CI ? 2 : '50%',
  // Prevent open handle issues
  forceExit: true,
  detectOpenHandles: true,
};
```

**Source:** [Fastify Documentation - Testing](https://fastify.dev/docs/latest/Guides/Testing/)

---

### 3.2 Fastify Testing Checklist

| Item | Required | Check |
|------|----------|-------|
| Uses `fastify.inject()` for HTTP testing | ✓ | ☐ |
| App is exportable without calling `listen()` | ✓ | ☐ |
| Server closes properly in `afterAll` | ✓ | ☐ |
| All routes have corresponding tests | ✓ | ☐ |
| Error responses tested (400, 401, 403, 404, 500) | ✓ | ☐ |
| Request validation tested | ✓ | ☐ |
| Response schema validated | ✓ | ☐ |
| Authentication/authorization tested | ✓ | ☐ |

**Fastify Test Pattern**:

```javascript
// test/routes/events.test.js
const { build } = require('../helper');

describe('GET /events/:id', () => {
  let app;

  beforeAll(async () => {
    app = await build();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns event for valid ID', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events/test-event-id',
      headers: {
        Authorization: 'Bearer valid-token',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: 'test-event-id',
      name: expect.any(String),
    });
  });

  it('returns 401 without auth header', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events/test-event-id',
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns 404 for non-existent event', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/events/non-existent',
      headers: { Authorization: 'Bearer valid-token' },
    });

    expect(response.statusCode).toBe(404);
  });
});
```

**Source:** [Fastify GitHub - Testing Guide](https://github.com/fastify/fastify/blob/main/docs/Guides/Testing.md)

---

### 3.3 Knex Database Testing Checklist

| Item | Required | Check |
|------|----------|-------|
| Separate test database configured | ✓ | ☐ |
| Migrations run before tests | ✓ | ☐ |
| Database cleaned between tests | ✓ | ☐ |
| Connection properly destroyed after tests | ✓ | ☐ |
| Transactions used for test isolation | ◐ | ☐ |
| Seeds available for test data | ◐ | ☐ |
| Multi-tenant queries tested | ✓ | ☐ |
| RLS policies verified | ✓ | ☐ |

**Database Test Setup**:

```javascript
// test/setup/database.js
const Knex = require('knex');
const config = require('../../knexfile').test;

let knex;

async function setupTestDatabase() {
  knex = Knex(config);
  await knex.migrate.latest();
  return knex;
}

async function teardownTestDatabase() {
  await knex.migrate.rollback(undefined, true);
  await knex.destroy();
}

async function cleanTables() {
  const tables = [
    'tickets',
    'orders',
    'events',
    'users',
    'tenants',
  ];
  
  for (const table of tables) {
    await knex(table).truncate();
  }
}

module.exports = {
  setupTestDatabase,
  teardownTestDatabase,
  cleanTables,
  getKnex: () => knex,
};
```

**Transaction-based Test Isolation**:

```javascript
// test/repositories/ticket.repository.test.js
describe('TicketRepository', () => {
  let trx;

  beforeEach(async () => {
    trx = await knex.transaction();
  });

  afterEach(async () => {
    await trx.rollback();
  });

  it('creates ticket with tenant isolation', async () => {
    // Set tenant context
    await trx.raw('SET app.current_tenant_id = ?', ['tenant-1']);

    await trx('tickets').insert({
      id: 'ticket-1',
      tenant_id: 'tenant-1',
      event_id: 'event-1',
      status: 'valid',
    });

    const tickets = await trx('tickets').select('*');
    expect(tickets).toHaveLength(1);
  });
});
```

**Source:** [Dev.to - End-to-end API Testing with Knex](https://dev.to/dinosa/end-to-end-api-testing-using-knex-migrations-4bje)

---

### 3.4 Stripe Test Mode Checklist

| Item | Required | Check |
|------|----------|-------|
| Using test API keys (`sk_test_`) | ✓ | ☐ |
| Test mode indicator in dashboard | ✓ | ☐ |
| Webhook signing secret for test mode | ✓ | ☐ |
| Stripe CLI installed for local testing | ✓ | ☐ |
| Test card scenarios covered | ✓ | ☐ |
| Webhook event handling tested | ✓ | ☐ |
| 3D Secure flows tested | ✓ | ☐ |
| Connect account flows tested | ✓ | ☐ |
| Subscription lifecycle tested | ◐ | ☐ |
| Refund handling tested | ✓ | ☐ |

**Stripe Test Scenarios**:

```javascript
describe('Stripe Payment Integration', () => {
  describe('Successful Payments', () => {
    it('processes payment with test card', async () => {
      const paymentIntent = await createPayment({
        amount: 5000,
        currency: 'usd',
        payment_method: 'pm_card_visa',
      });

      expect(paymentIntent.status).toBe('succeeded');
    });
  });

  describe('Failed Payments', () => {
    it('handles declined card', async () => {
      await expect(createPayment({
        amount: 5000,
        payment_method: 'pm_card_visa_chargeDeclined',
      })).rejects.toThrow('card_declined');
    });

    it('handles insufficient funds', async () => {
      await expect(createPayment({
        amount: 5000,
        payment_method: 'pm_card_visa_chargeDeclinedInsufficientFunds',
      })).rejects.toThrow('insufficient_funds');
    });
  });

  describe('Webhooks', () => {
    it('verifies webhook signature', async () => {
      const payload = JSON.stringify({ type: 'payment_intent.succeeded' });
      const signature = stripe.webhooks.generateTestHeaderString({
        payload,
        secret: process.env.STRIPE_WEBHOOK_SECRET,
      });

      const event = stripe.webhooks.constructEvent(
        payload,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );

      expect(event.type).toBe('payment_intent.succeeded');
    });

    it('rejects invalid signature', () => {
      expect(() => {
        stripe.webhooks.constructEvent(
          '{}',
          'invalid-signature',
          process.env.STRIPE_WEBHOOK_SECRET
        );
      }).toThrow('Webhook signature verification failed');
    });
  });
});
```

**Source:** [Stripe Documentation - Testing](https://docs.stripe.com/testing/overview)

---

### 3.5 Solana Devnet Checklist

| Item | Required | Check |
|------|----------|-------|
| Devnet RPC endpoint configured | ✓ | ☐ |
| Test wallet with devnet SOL | ✓ | ☐ |
| Separate keypairs for tests | ✓ | ☐ |
| NFT minting tested | ✓ | ☐ |
| Token transfers tested | ✓ | ☐ |
| Program deployment tested | ◐ | ☐ |
| Transaction confirmation tested | ✓ | ☐ |
| Error handling tested | ✓ | ☐ |
| Local validator for unit tests | ◐ | ☐ |

**Solana Test Configuration**:

```javascript
// test/setup/solana.js
const { Connection, Keypair, LAMPORTS_PER_SOL } = require('@solana/web3.js');

const DEVNET_URL = 'https://api.devnet.solana.com';

async function setupSolanaTest() {
  const connection = new Connection(DEVNET_URL, 'confirmed');
  const payer = Keypair.generate();

  // Airdrop SOL for test transactions
  const airdropSig = await connection.requestAirdrop(
    payer.publicKey,
    2 * LAMPORTS_PER_SOL
  );
  await connection.confirmTransaction(airdropSig);

  return { connection, payer };
}

module.exports = { setupSolanaTest };
```

**NFT Minting Test**:

```javascript
describe('NFT Ticket Minting', () => {
  let connection;
  let payer;

  beforeAll(async () => {
    ({ connection, payer } = await setupSolanaTest());
  }, 30000);

  it('mints NFT ticket on devnet', async () => {
    const ticketData = {
      eventId: 'test-event-123',
      ticketId: 'ticket-456',
      seat: 'A1',
    };

    const { mint, metadata } = await mintTicketNFT({
      connection,
      payer,
      ticketData,
    });

    expect(mint).toBeDefined();
    
    // Verify on-chain
    const mintInfo = await getMint(connection, mint);
    expect(mintInfo.supply).toBe(1n);
    expect(mintInfo.decimals).toBe(0);
  }, 60000);

  it('prevents double-minting same ticket', async () => {
    const ticketData = { ticketId: 'unique-ticket' };
    
    await mintTicketNFT({ connection, payer, ticketData });
    
    await expect(
      mintTicketNFT({ connection, payer, ticketData })
    ).rejects.toThrow('Ticket already minted');
  });
});
```

**Source:** [Solana Cookbook - Getting Test SOL](https://solana.com/developers/cookbook/development/test-sol)

---

### 3.6 Coverage Requirements

#### Minimum Coverage by Service Type

| Service Category | Line | Branch | Function |
|-----------------|------|--------|----------|
| Payment Services | 90% | 85% | 90% |
| Authentication | 90% | 85% | 90% |
| Ticket Operations | 85% | 80% | 85% |
| NFT/Blockchain | 80% | 75% | 80% |
| Event Management | 80% | 75% | 80% |
| User Management | 80% | 75% | 80% |
| Notifications | 75% | 70% | 75% |
| Reporting | 70% | 65% | 70% |

#### Coverage Verification Commands

```bash
# Generate coverage report
npm run test -- --coverage

# Check coverage thresholds
npm run test -- --coverage --coverageThreshold='{"global":{"lines":80}}'

# Generate detailed HTML report
npm run test -- --coverage --coverageReporters=html

# Get uncovered lines
npm run test -- --coverage --coverageReporters=text-summary
```

---

### 3.7 Critical Integration Tests

These integration tests MUST exist and pass for each service:

#### Authentication Service

| Test | Priority |
|------|----------|
| Login with valid credentials | P0 |
| Login with invalid credentials | P0 |
| JWT token generation and validation | P0 |
| Token refresh flow | P0 |
| Multi-tenant authentication | P0 |
| Rate limiting on login attempts | P1 |
| Session invalidation on logout | P1 |

#### Ticket Service

| Test | Priority |
|------|----------|
| Purchase ticket (happy path) | P0 |
| Purchase ticket (sold out) | P0 |
| Purchase ticket (concurrent last ticket) | P0 |
| QR code generation | P0 |
| QR code validation | P0 |
| Ticket transfer between users | P1 |
| Ticket resale flow | P1 |
| Cross-tenant ticket access blocked | P0 |

#### Payment Service

| Test | Priority |
|------|----------|
| Successful payment | P0 |
| Payment failure handling | P0 |
| Webhook processing | P0 |
| Refund processing | P0 |
| Connect account payout | P1 |
| Payment reconciliation | P1 |

#### NFT Service

| Test | Priority |
|------|----------|
| NFT minting on purchase | P0 |
| NFT metadata correctness | P0 |
| NFT transfer on ticket transfer | P1 |
| Devnet/Mainnet environment isolation | P0 |

---

### 3.8 Security Tests Checklist

Based on OWASP API Security Top 10 2023:

| Vulnerability | Test Required | Check |
|---------------|---------------|-------|
| **API1:2023 - BOLA** | Verify user can't access other users' resources | ☐ |
| **API2:2023 - Broken Auth** | Test auth bypass attempts | ☐ |
| **API3:2023 - BOPLA** | Test property-level access control | ☐ |
| **API4:2023 - Unrestricted Resource** | Test rate limiting, file upload limits | ☐ |
| **API5:2023 - Broken Function Auth** | Test admin function access by regular users | ☐ |
| **API6:2023 - Mass Assignment** | Test unexpected property modification | ☐ |
| **API7:2023 - SSRF** | Test URL parameter validation | ☐ |
| **API8:2023 - Security Misconfig** | Test error messages, headers, CORS | ☐ |
| **API9:2023 - Improper Inventory** | Test deprecated endpoint access | ☐ |
| **API10:2023 - Unsafe API Consumption** | Test third-party data validation | ☐ |

**Source:** [OWASP API Security Top 10](https://owasp.org/API-Security/)

**Security Test Examples**:

```javascript
describe('API Security', () => {
  describe('BOLA (Broken Object Level Authorization)', () => {
    it('prevents access to other tenant events', async () => {
      const tenant1Token = await getTokenForTenant('tenant-1');
      const tenant2Event = await createEventForTenant('tenant-2');

      const response = await app.inject({
        method: 'GET',
        url: `/events/${tenant2Event.id}`,
        headers: { Authorization: `Bearer ${tenant1Token}` },
      });

      expect(response.statusCode).toBe(404);
    });

    it('prevents access to other user tickets', async () => {
      const user1Token = await getTokenForUser('user-1');
      const user2Ticket = await createTicketForUser('user-2');

      const response = await app.inject({
        method: 'GET',
        url: `/tickets/${user2Ticket.id}`,
        headers: { Authorization: `Bearer ${user1Token}` },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('Broken Authentication', () => {
    it('rejects expired JWT tokens', async () => {
      const expiredToken = generateToken({ exp: Date.now() / 1000 - 3600 });

      const response = await app.inject({
        method: 'GET',
        url: '/events',
        headers: { Authorization: `Bearer ${expiredToken}` },
      });

      expect(response.statusCode).toBe(401);
    });

    it('rate limits login attempts', async () => {
      const attempts = Array(10).fill().map(() =>
        app.inject({
          method: 'POST',
          url: '/auth/login',
          payload: { email: 'test@test.com', password: 'wrong' },
        })
      );

      const responses = await Promise.all(attempts);
      const rateLimited = responses.filter(r => r.statusCode === 429);
      
      expect(rateLimited.length).toBeGreaterThan(0);
    });
  });

  describe('SQL Injection', () => {
    it('sanitizes user input in queries', async () => {
      const response = await app.inject({
        method: 'GET',
        url: "/events?search='; DROP TABLE events; --",
        headers: { Authorization: `Bearer ${validToken}` },
      });

      // Should not error or expose SQL
      expect(response.statusCode).not.toBe(500);
      
      // Verify table still exists
      const events = await knex('events').select('*');
      expect(events).toBeDefined();
    });
  });
});
```

**Source:** [OWASP API Security Testing Framework](https://owasp.org/www-project-api-security-testing-framework/)

---

### 3.9 Per-Service Audit Template

Use this template for each of the 23 microservices:

```markdown
## Service: [SERVICE_NAME]

### Overview
- **Purpose**: 
- **Dependencies**: 
- **Criticality**: [P0/P1/P2]

### Test Inventory

| Test Type | Count | Passing | Coverage |
|-----------|-------|---------|----------|
| Unit | | | |
| Integration | | | |
| E2E | | | |

### Coverage Analysis

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Line | | 80% | |
| Branch | | 75% | |
| Function | | 80% | |

### Critical Tests Present

| Test | Status |
|------|--------|
| Happy path flow | ☐ |
| Error handling | ☐ |
| Auth/authz | ☐ |
| Input validation | ☐ |
| Multi-tenant isolation | ☐ |
| Rate limiting | ☐ |

### Integration Tests

| Dependency | Test Exists | Uses Real/Mock |
|------------|-------------|----------------|
| Database | ☐ | |
| Redis | ☐ | |
| Stripe | ☐ | |
| Solana | ☐ | |
| Other services | ☐ | |

### Security Tests

| OWASP Risk | Tested | Result |
|------------|--------|--------|
| BOLA | ☐ | |
| Broken Auth | ☐ | |
| Injection | ☐ | |

### Gaps Identified

1. 
2. 
3. 

### Remediation Plan

| Gap | Priority | Assignee | Due Date |
|-----|----------|----------|----------|
| | | | |
```

---

## 4. Sources & References

### Standards & Best Practices

1. **Test Pyramid**
   - [Devzery - Software Testing Pyramid Guide 2025](https://www.devzery.com/post/software-testing-pyramid-guide-2025)
   - [HeadSpin - Testing Pyramid Simplified](https://www.headspin.io/blog/the-testing-pyramid-simplified-for-one-and-all)
   - [VirtuosoQA - Testing Pyramid Explained](https://www.virtuosoqa.com/post/what-is-the-testing-pyramid)
   - [UK Home Office - Test Pyramid Standards](https://engineering.homeoffice.gov.uk/standards/test-pyramid/)

2. **Code Coverage**
   - [TechTarget - Unit Test Coverage Percentage](https://www.techtarget.com/searchsoftwarequality/tip/What-unit-test-coverage-percentage-should-teams-aim-for)
   - [Bullseye - Minimum Acceptable Code Coverage](https://www.bullseye.com/minimum.html)
   - [LaunchDarkly - Code Coverage Guide](https://launchdarkly.com/blog/code-coverage-what-it-is-and-why-it-matters/)
   - [Parasoft - Code Coverage Guide](https://www.parasoft.com/learning-center/code-coverage-guide/)

3. **Contract Testing**
   - [Hypertest - Contract Testing for Microservices](https://www.hypertest.co/contract-testing/contract-testing-for-microservices)
   - [Softwaremill - Contract Tests](https://softwaremill.com/testing-microservices-contract-tests/)
   - [Discover Technology - Contract Testing](https://technology.discover.com/posts/end-to-end-contract-testing)
   - [Microservices.io - Consumer-side Contract Test](https://microservices.io/patterns/testing/consumer-side-contract-test.html)

4. **Stripe Testing**
   - [Stripe Documentation - Testing Use Cases](https://docs.stripe.com/testing-use-cases)
   - [Stripe Documentation - Billing Testing](https://docs.stripe.com/billing/testing)
   - [Stripe Documentation - Test Clocks](https://docs.stripe.com/billing/testing/test-clocks)
   - [Stripe Documentation - Webhook Best Practices](https://stripe.com/docs/webhooks/best-practices)

5. **Solana Testing**
   - [Solana Documentation - Clusters](https://solana.com/docs/references/clusters)
   - [Helius - Guide to Testing Solana Programs](https://www.helius.dev/blog/a-guide-to-testing-solana-programs)
   - [Quicknode - Airdropping Test SOL](https://www.quicknode.com/guides/solana-development/getting-started/a-complete-guide-to-airdropping-test-sol-on-solana)
   - [Alchemy - Solana Devnet Overview](https://www.alchemy.com/overviews/solana-devnet)

### Testing Frameworks

6. **Jest & Fastify**
   - [Fastify Documentation - Testing Guide](https://fastify.dev/docs/latest/Guides/Testing/)
   - [Fastify GitHub - Testing.md](https://github.com/fastify/fastify/blob/main/docs/Guides/Testing.md)
   - [AST Consulting - Testing Fastify with Jest](https://astconsulting.in/java-script/nodejs/fastify/testing-fastify-applications-with-jest)

7. **Knex Database Testing**
   - [Dev.to - E2E Testing with Knex](https://dev.to/dinosa/end-to-end-api-testing-using-knex-migrations-4bje)
   - [Tania Rascia - Integration Tests with Jest and Knex](https://www.taniarascia.com/integration-testing-with-jest-typescript-objection/)
   - [Traveling Coderman - Testing Knex with Testcontainers](https://traveling-coderman.net/code/node-architecture/testing-queries/)

8. **Load Testing**
   - [Grafana k6 Documentation](https://grafana.com/docs/k6/latest/)
   - [k6.io - Load Testing Manifesto](https://k6.io/our-beliefs/)
   - [Baeldung - Load Testing with k6](https://www.baeldung.com/k6-framework-load-testing)
   - [Artillery - Load Testing in Production](https://www.artillery.io/blog/load-testing-in-production)

### Anti-Patterns & Common Mistakes

9. **Testing Anti-Patterns**
   - [Codepipes - Software Testing Anti-patterns](https://blog.codepipes.com/testing/software-testing-antipatterns.html)
   - [Yegor256 - Unit Testing Anti-Patterns](https://www.yegor256.com/2018/12/11/unit-testing-anti-patterns.html)
   - [Enterprise Craftsmanship - Structural Inspection](https://enterprisecraftsmanship.com/posts/structural-inspection)
   - [LaunchScout - Testing Behavior vs Implementation](https://launchscout.com/blog/testing-behavior-vs-testing-implementation)

10. **Flaky Tests**
    - [Aqua Cloud - Flaky Tests Guide](https://aqua-cloud.io/flaky-tests/)
    - [TestRail - Flaky Tests](https://www.testrail.com/blog/flaky-tests/)
    - [Datadog - Flaky Tests Knowledge Center](https://www.datadoghq.com/knowledge-center/flaky-tests/)
    - [JetBrains - What Are Flaky Tests](https://www.jetbrains.com/teamcity/ci-cd-guide/concepts/flaky-tests/)

### Test Data Management

11. **Test Data**
    - [K2View - Test Data Management Best Practices](https://www.k2view.com/blog/7-test-data-management-best-practices/)
    - [TestRail - Test Data Management](https://www.testrail.com/blog/test-data-management-best-practices/)
    - [QAlified - Synthetic vs Production Data](https://qalified.com/blog/test-data-synthetic-vs-production/)
    - [DataStealth - Test Data Best Practices](https://www.datastealth.io/blogs/test-data-management-best-practices)

### Security Testing

12. **API Security**
    - [OWASP API Security Project](https://owasp.org/www-project-api-security/)
    - [OWASP API Security Top 10](https://owasp.org/API-Security/)
    - [OWASP Web Security Testing Guide - API Testing](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/12-API_Testing/00-API_Testing_Overview)
    - [OWASP API Security Testing Framework](https://owasp.org/www-project-api-security-testing-framework/)
    - [Aptori - API Security Checklist](https://www.aptori.com/blog/the-api-security-checklist)

---

## Quick Reference Commands

```bash
# Run all tests
npm test

# Run with coverage
npm run test -- --coverage

# Run specific test file
npm run test -- path/to/test.js

# Run tests matching pattern
npm run test -- --testNamePattern="payment"

# Run only changed tests
npm run test -- --onlyChanged

# Run in watch mode
npm run test -- --watch

# Run with verbose output
npm run test -- --verbose

# Generate coverage report
npm run test -- --coverage --coverageReporters=html

# Run integration tests only
npm run test:integration

# Run contract tests
npm run test:contract

# Run security tests
npm run test:security

# Run load tests
npm run test:load

# Stripe webhook testing
stripe listen --forward-to localhost:3000/webhooks/stripe
stripe trigger payment_intent.succeeded

# Solana devnet
solana config set --url https://api.devnet.solana.com
solana airdrop 2 <wallet_address>
```

---

**Document prepared for TicketToken Production Readiness Audit**  
**Last Updated:** December 2025