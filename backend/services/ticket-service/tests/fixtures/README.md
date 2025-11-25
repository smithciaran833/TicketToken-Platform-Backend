# Test Fixtures

Shared test data and utilities for all test suites.

---

## Files

- **test-data.ts** - Main fixture file with helpers
- **tickets.ts** - Legacy ticket fixtures (archived)

---

## Test Data Constants
```typescript
DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001'

TEST_USERS = {
  BUYER_1: uuid,
  BUYER_2: uuid,
  ADMIN: uuid,
  VENUE_MANAGER: uuid,
  VALIDATOR: uuid,
}

TEST_VENUE = {
  id: '4eb55219-c3e2-4bec-8035-8bec590b4765' // Existing venue
}

TEST_EVENT = {
  id: uuid,
  name: 'Test Concert Event',
  venue_id: TEST_VENUE.id,
}

TEST_TICKET_TYPES = {
  GA: { price_cents: 5000, quantity: 100 },
  VIP: { price_cents: 15000, quantity: 50 },
}

TEST_DISCOUNT = {
  code: 'TEST10',
  type: 'percentage',
  value_percentage: 10.0,
}
```

---

## TestDataHelper Class

### Methods

**seedDatabase()** - Insert all base test data
- Creates event (doesn't create venue - already exists)
- Creates ticket types
- Creates discount

**cleanDatabase()** - Delete all test data
- Deletes in reverse dependency order
- Doesn't delete venue (not owned by ticket-service)

**createTestOrder(userId, customData?)** - Create test order
**createTestTicket(userId, customData?)** - Create test ticket
**createTestReservation(userId, customData?)** - Create test reservation

**getTicketTypeInventory(ticketTypeId)** - Check inventory levels
**resetTicketTypeInventory(ticketTypeId)** - Reset to full quantity

---

## Helper Functions

**createTestJWT(userId, role, tenantId)** - Generate JWT token for auth
- Reads JWT private key from ~/tickettoken-secrets/jwt-private.pem
- Creates RS256 signed token
- Includes permissions based on role

**wait(ms)** - Async delay utility

---

## Usage Pattern
```typescript
import { TestDataHelper, TEST_USERS, createTestJWT } from './fixtures/test-data';

let pool: Pool;
let testHelper: TestDataHelper;
let buyerToken: string;

beforeAll(async () => {
  pool = new Pool({ /* config */ });
  testHelper = new TestDataHelper(pool);
  await testHelper.seedDatabase();
  
  buyerToken = createTestJWT(TEST_USERS.BUYER_1, 'user');
});

afterAll(async () => {
  await testHelper.cleanDatabase();
  await pool.end();
});
```
