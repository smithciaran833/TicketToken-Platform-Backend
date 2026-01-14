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

// Test events
export const TEST_EVENTS = {
  CONCERT: {
    id: 'event-concert-001',
    name: 'Test Rock Concert',
    description: 'Amazing rock concert',
    venue_id: 'venue-stadium-001',
    category_id: 'category-music-001',
    start_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days future
    end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000), // +3 hours
    total_capacity: 50000,
    status: 'published',
  },
  SPORTS: {
    id: 'event-sports-001',
    name: 'Championship Game',
    description: 'Finals game',
    venue_id: 'venue-stadium-001',
    category_id: 'category-sports-001',
    start_date: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days future
    end_date: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000),
    total_capacity: 45000,
    status: 'published',
  },
  THEATER: {
    id: 'event-theater-001',
    name: 'Broadway Show',
    description: 'Musical performance',
    venue_id: 'venue-theater-001',
    category_id: 'category-theater-001',
    start_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days future
    end_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000),
    total_capacity: 500,
    status: 'published',
  },
};

// Test pricing tiers
export const TEST_PRICING = {
  EARLY_BIRD: {
    id: 'price-early-001',
    tier_name: 'Early Bird',
    price_cents: 5000, // $50.00
    available_from: new Date(),
    available_until: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  },
  REGULAR: {
    id: 'price-regular-001',
    tier_name: 'Regular',
    price_cents: 7500, // $75.00
    available_from: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    available_until: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000),
  },
  VIP: {
    id: 'price-vip-001',
    tier_name: 'VIP',
    price_cents: 15000, // $150.00
    available_from: new Date(),
    available_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  },
};

// Test data helper class
export class EventTestHelper {
  constructor(private pool: Pool) {}

  async seedDatabase() {
    // Create test categories
    // Create test venues (or mock venue service)
    // Create test events
    // Create test pricing tiers
  }

  async cleanDatabase() {
    // Clean up all test data
  }

  async createTestEvent(eventData: any) {
    // Create event in DB
  }

  async reserveCapacity(eventId: string, quantity: number) {
    // Reserve capacity for testing
  }

  async releaseCapacity(eventId: string, quantity: number) {
    // Release capacity
  }
}
```

### `mock-venue-service.ts`
**Mock venue service calls**
- Mock venue validation
- Mock capacity checks
- Mock venue availability

---

## SETUP

Create these fixture files FIRST, then use them across all test phases!
