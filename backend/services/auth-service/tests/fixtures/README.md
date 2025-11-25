# TEST FIXTURES & HELPERS 🛠️

**Create these FIRST before writing any tests!**

---

## FILES TO CREATE

### `test-data.ts`
**Main fixture file - similar to ticket-service pattern**
```typescript
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';

// Test constants
export const DEFAULT_TENANT_ID = 'test-tenant-001';

// Test users
export const TEST_USERS = {
  ADMIN: {
    id: 'admin-user-001',
    email: 'admin@test.com',
    password: 'Admin123!@#',
    full_name: 'Test Admin',
    role: 'admin',
  },
  USER_1: {
    id: 'user-001',
    email: 'user1@test.com',
    password: 'User123!@#',
    full_name: 'Test User 1',
    role: 'user',
  },
  ORGANIZER: {
    id: 'organizer-001',
    email: 'organizer@test.com',
    password: 'Org123!@#',
    full_name: 'Test Organizer',
    role: 'event_organizer',
  },
  VENUE_MANAGER: {
    id: 'venue-mgr-001',
    email: 'venue@test.com',
    password: 'Venue123!@#',
    full_name: 'Venue Manager',
    role: 'venue_manager',
  },
};

// JWT helper
export function createTestJWT(user: any, role: string) {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: role,
      tenantId: DEFAULT_TENANT_ID,
    },
    process.env.JWT_ACCESS_SECRET || 'test-secret',
    { expiresIn: '1h' }
  );
}

// Test data helper class
export class TestDataHelper {
  constructor(private pool: Pool) {}

  async seedDatabase() {
    // Create test users
    // Create test sessions
    // Create test devices
  }

  async cleanDatabase() {
    // Clean up all test data
  }

  async createTestUser(userData: any) {
    // Create user in DB
  }

  async createTestSession(userId: string) {
    // Create session for user
  }
}
```

### `mock-services.ts`
**Mock external services**
- Mock email service
- Mock OAuth providers
- Mock Redis
- Mock external APIs

### `test-tokens.ts`
**Pre-generated test tokens**
- Valid tokens
- Expired tokens
- Malformed tokens
- Admin tokens
- User tokens

---

## SETUP

Create these fixture files FIRST, then use them across all test phases!
