# TEST FIXTURES & HELPERS 🛠️

**Create these FIRST before writing any tests!**

---

## FILES TO CREATE

### `test-data.ts`
**Main fixture file**
```typescript
import { Pool } from 'pg';

// Test constants
export const DEFAULT_TENANT_ID = 'test-tenant-001';

// Test venues
export const TEST_VENUES = {
  STADIUM: {
    id: 'venue-stadium-001',
    name: 'Test Stadium',
    max_capacity: 50000,
    address: '123 Stadium Way',
    city: 'Los Angeles',
    state: 'CA',
    zip_code: '90001',
    country: 'US',
  },
  THEATER: {
    id: 'venue-theater-001',
    name: 'Test Theater',
    max_capacity: 500,
    address: '456 Theater St',
    city: 'New York',
    state: 'NY',
    zip_code: '10001',
    country: 'US',
  },
  CLUB: {
    id: 'venue-club-001',
    name: 'Test Club',
    max_capacity: 200,
    address: '789 Club Rd',
    city: 'Miami',
    state: 'FL',
    zip_code: '33101',
    country: 'US',
  },
};

// Test staff
export const TEST_STAFF = {
  MANAGER: {
    id: 'staff-manager-001',
    user_id: 'user-001',
    role: 'manager',
    permissions: ['manage_staff', 'update_venue', 'view_analytics'],
  },
  STAFF: {
    id: 'staff-001',
    user_id: 'user-002',
    role: 'staff',
    permissions: ['view_venue', 'scan_tickets'],
  },
};

// Test data helper class
export class VenueTestHelper {
  constructor(private pool: Pool) {}

  async seedDatabase() {
    // Create test venues
    // Create test staff
    // Create test settings
  }

  async cleanDatabase() {
    // Clean up all test data
  }

  async createTestVenue(venueData: any) {
    // Create venue in DB
  }

  async addStaffToVenue(venueId: string, staffData: any) {
    // Add staff member
  }
}
```

---

## SETUP

Create these fixture files FIRST, then use them across all test phases!
