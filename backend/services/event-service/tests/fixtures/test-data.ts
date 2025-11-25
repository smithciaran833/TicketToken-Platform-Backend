/**
 * EVENT SERVICE - TEST FIXTURES AND DATA
 * 
 * This file contains all test data, fixtures, and factory functions for the event service tests.
 * Use these fixtures in your tests instead of creating data inline.
 */

import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// CONSTANTS
// ============================================================================

export const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
export const TEST_TENANT_ID_2 = '00000000-0000-0000-0000-000000000002';

export const TEST_USER_ID = '10000000-0000-0000-0000-000000000001';
export const TEST_USER_ID_2 = '10000000-0000-0000-0000-000000000002';

export const TEST_VENUE_ID = '20000000-0000-0000-0000-000000000001';
export const TEST_VENUE_ID_2 = '20000000-0000-0000-0000-000000000002';

export const TEST_EVENT_ID = '30000000-0000-0000-0000-000000000001';
export const TEST_EVENT_ID_2 = '30000000-0000-0000-0000-000000000002';

export const TEST_SCHEDULE_ID = '40000000-0000-0000-0000-000000000001';
export const TEST_PRICING_ID = '50000000-0000-0000-0000-000000000001';
export const TEST_TICKET_ID = '60000000-0000-0000-0000-000000000001';
export const TEST_CAPACITY_ID = '70000000-0000-0000-0000-000000000001';

// ============================================================================
// TEST USERS
// ============================================================================

export const TEST_USERS = {
  ORGANIZER: {
    id: TEST_USER_ID,
    tenant_id: TEST_TENANT_ID,
    email: 'organizer@test.com',
    name: 'Test Organizer',
    role: 'organizer',
    permissions: ['events:create', 'events:read', 'events:update', 'events:delete']
  },
  CUSTOMER: {
    id: TEST_USER_ID_2,
    tenant_id: TEST_TENANT_ID,
    email: 'customer@test.com',
    name: 'Test Customer',
    role: 'customer',
    permissions: ['events:read', 'tickets:purchase']
  },
  ADMIN: {
    id: uuidv4(),
    tenant_id: TEST_TENANT_ID,
    email: 'admin@test.com',
    name: 'Test Admin',
    role: 'admin',
    permissions: ['*']
  }
};

// ============================================================================
// TEST VENUES
// ============================================================================

export const TEST_VENUES = {
  ARENA: {
    id: TEST_VENUE_ID,
    tenant_id: TEST_TENANT_ID,
    name: 'Madison Square Garden',
    slug: 'madison-square-garden',
    type: 'arena',
    capacity: 20000,
    address: {
      street: '4 Pennsylvania Plaza',
      city: 'New York',
      state: 'NY',
      zip: '10001',
      country: 'USA'
    },
    is_active: true,
    owner_id: TEST_USER_ID
  },
  THEATER: {
    id: TEST_VENUE_ID_2,
    tenant_id: TEST_TENANT_ID,
    name: 'Broadway Theater',
    slug: 'broadway-theater',
    type: 'theater',
    capacity: 1500,
    address: {
      street: '1681 Broadway',
      city: 'New York',
      state: 'NY',
      zip: '10019',
      country: 'USA'
    },
    is_active: true,
    owner_id: TEST_USER_ID
  },
  CLUB: {
    id: uuidv4(),
    tenant_id: TEST_TENANT_ID,
    name: 'Blue Note Jazz Club',
    slug: 'blue-note-jazz-club',
    type: 'club',
    capacity: 300,
    address: {
      street: '131 W 3rd St',
      city: 'New York',
      state: 'NY',
      zip: '10012',
      country: 'USA'
    },
    is_active: true,
    owner_id: TEST_USER_ID
  }
};

// ============================================================================
// TEST EVENT CATEGORIES
// ============================================================================

export const TEST_CATEGORIES = {
  MUSIC: {
    id: uuidv4(),
    tenant_id: TEST_TENANT_ID,
    name: 'Music',
    slug: 'music',
    description: 'Live music performances',
    icon: '🎵',
    color: '#FF6B6B',
    is_active: true
  },
  SPORTS: {
    id: uuidv4(),
    tenant_id: TEST_TENANT_ID,
    name: 'Sports',
    slug: 'sports',
    description: 'Sporting events',
    icon: '⚽',
    color: '#4ECDC4',
    is_active: true
  },
  THEATER: {
    id: uuidv4(),
    tenant_id: TEST_TENANT_ID,
    name: 'Theater',
    slug: 'theater',
    description: 'Theatrical performances',
    icon: '🎭',
    color: '#95E1D3',
    is_active: true
  },
  COMEDY: {
    id: uuidv4(),
    tenant_id: TEST_TENANT_ID,
    name: 'Comedy',
    slug: 'comedy',
    description: 'Stand-up comedy shows',
    icon: '😂',
    color: '#F38181',
    is_active: true
  }
};

// ============================================================================
// TEST EVENTS
// ============================================================================

export const TEST_EVENTS = {
  CONCERT: {
    id: TEST_EVENT_ID,
    tenant_id: TEST_TENANT_ID,
    name: 'Summer Music Festival 2025',
    slug: 'summer-music-festival-2025',
    description: 'The biggest music festival of the summer',
    venue_id: TEST_VENUE_ID,
    category_id: TEST_CATEGORIES.MUSIC.id,
    event_date: new Date('2025-07-15T00:00:00Z'),
    starts_at: new Date('2025-07-15T18:00:00Z'),
    ends_at: new Date('2025-07-15T23:00:00Z'),
    doors_open: new Date('2025-07-15T17:00:00Z'),
    timezone: 'America/New_York',
    status: 'published',
    is_published: true,
    capacity: 15000,
    featured_image: 'https://example.com/images/summer-fest.jpg',
    tags: ['music', 'festival', 'outdoor'],
    age_restriction: '18+',
    created_by: TEST_USER_ID,
    created_at: new Date('2025-01-01T00:00:00Z'),
    updated_at: new Date('2025-01-01T00:00:00Z')
  },
  THEATER_SHOW: {
    id: TEST_EVENT_ID_2,
    tenant_id: TEST_TENANT_ID,
    name: 'Hamilton on Broadway',
    slug: 'hamilton-on-broadway',
    description: 'The revolutionary Broadway musical',
    venue_id: TEST_VENUE_ID_2,
    category_id: TEST_CATEGORIES.THEATER.id,
    event_date: new Date('2025-08-20T00:00:00Z'),
    starts_at: new Date('2025-08-20T20:00:00Z'),
    ends_at: new Date('2025-08-20T22:30:00Z'),
    doors_open: new Date('2025-08-20T19:30:00Z'),
    timezone: 'America/New_York',
    status: 'published',
    is_published: true,
    capacity: 1400,
    featured_image: 'https://example.com/images/hamilton.jpg',
    tags: ['theater', 'musical', 'broadway'],
    age_restriction: 'All Ages',
    created_by: TEST_USER_ID,
    created_at: new Date('2025-01-15T00:00:00Z'),
    updated_at: new Date('2025-01-15T00:00:00Z')
  },
  DRAFT_EVENT: {
    id: uuidv4(),
    tenant_id: TEST_TENANT_ID,
    name: 'Upcoming Comedy Show',
    slug: 'upcoming-comedy-show',
    description: 'TBD',
    venue_id: TEST_VENUE_ID,
    category_id: TEST_CATEGORIES.COMEDY.id,
    event_date: new Date('2025-12-01T00:00:00Z'),
    starts_at: new Date('2025-12-01T20:00:00Z'),
    ends_at: new Date('2025-12-01T22:00:00Z'),
    timezone: 'America/New_York',
    status: 'draft',
    is_published: false,
    capacity: 500,
    created_by: TEST_USER_ID,
    created_at: new Date(),
    updated_at: new Date()
  },
  CANCELLED_EVENT: {
    id: uuidv4(),
    tenant_id: TEST_TENANT_ID,
    name: 'Cancelled Concert',
    slug: 'cancelled-concert',
    description: 'This event has been cancelled',
    venue_id: TEST_VENUE_ID,
    category_id: TEST_CATEGORIES.MUSIC.id,
    event_date: new Date('2025-06-01T00:00:00Z'),
    starts_at: new Date('2025-06-01T19:00:00Z'),
    ends_at: new Date('2025-06-01T23:00:00Z'),
    timezone: 'America/New_York',
    status: 'cancelled',
    is_published: false,
    capacity: 10000,
    created_by: TEST_USER_ID,
    created_at: new Date('2025-02-01T00:00:00Z'),
    updated_at: new Date('2025-05-01T00:00:00Z')
  }
};

// ============================================================================
// TEST SCHEDULES
// ============================================================================

export const TEST_SCHEDULES = {
  CONCERT_FRIDAY: {
    id: TEST_SCHEDULE_ID,
    tenant_id: TEST_TENANT_ID,
    event_id: TEST_EVENT_ID,
    starts_at: new Date('2025-07-15T18:00:00Z'),
    ends_at: new Date('2025-07-15T23:00:00Z'),
    doors_open: new Date('2025-07-15T17:00:00Z'),
    timezone: 'America/New_York',
    is_primary: true,
    status: 'active',
    notes: 'Main event day'
  },
  CONCERT_SATURDAY: {
    id: uuidv4(),
    tenant_id: TEST_TENANT_ID,
    event_id: TEST_EVENT_ID,
    starts_at: new Date('2025-07-16T18:00:00Z'),
    ends_at: new Date('2025-07-16T23:00:00Z'),
    doors_open: new Date('2025-07-16T17:00:00Z'),
    timezone: 'America/New_York',
    is_primary: false,
    status: 'active',
    notes: 'Day 2'
  },
  THEATER_MATINEE: {
    id: uuidv4(),
    tenant_id: TEST_TENANT_ID,
    event_id: TEST_EVENT_ID_2,
    starts_at: new Date('2025-08-20T14:00:00Z'),
    ends_at: new Date('2025-08-20T16:30:00Z'),
    doors_open: new Date('2025-08-20T13:30:00Z'),
    timezone: 'America/New_York',
    is_primary: false,
    status: 'active',
    notes: 'Matinee show'
  },
  THEATER_EVENING: {
    id: uuidv4(),
    tenant_id: TEST_TENANT_ID,
    event_id: TEST_EVENT_ID_2,
    starts_at: new Date('2025-08-20T20:00:00Z'),
    ends_at: new Date('2025-08-20T22:30:00Z'),
    doors_open: new Date('2025-08-20T19:30:00Z'),
    timezone: 'America/New_York',
    is_primary: true,
    status: 'active',
    notes: 'Evening show'
  }
};

// ============================================================================
// TEST CAPACITY
// ============================================================================

export const TEST_CAPACITY = {
  CONCERT_CAPACITY: {
    id: TEST_CAPACITY_ID,
    tenant_id: TEST_TENANT_ID,
    event_id: TEST_EVENT_ID,
    schedule_id: TEST_SCHEDULE_ID,
    total_capacity: 15000,
    sold_count: 8500,
    pending_count: 250,
    reserved_capacity: 100,
    available_capacity: 6150, // 15000 - 8500 - 250 - 100
    locked_price_data: null
  },
  THEATER_CAPACITY: {
    id: uuidv4(),
    tenant_id: TEST_TENANT_ID,
    event_id: TEST_EVENT_ID_2,
    schedule_id: null,
    total_capacity: 1400,
    sold_count: 950,
    pending_count: 50,
    reserved_capacity: 0,
    available_capacity: 400,
    locked_price_data: null
  },
  NEARLY_SOLD_OUT: {
    id: uuidv4(),
    tenant_id: TEST_TENANT_ID,
    event_id: TEST_EVENT_ID,
    schedule_id: TEST_SCHEDULE_ID,
    total_capacity: 1000,
    sold_count: 980,
    pending_count: 15,
    reserved_capacity: 5,
    available_capacity: 0,
    locked_price_data: null
  }
};

// ============================================================================
// TEST PRICING
// ============================================================================

export const TEST_PRICING = {
  GENERAL_ADMISSION: {
    id: TEST_PRICING_ID,
    tenant_id: TEST_TENANT_ID,
    event_id: TEST_EVENT_ID,
    schedule_id: TEST_SCHEDULE_ID,
    capacity_id: TEST_CAPACITY_ID,
    tier_name: 'General Admission',
    tier_description: 'Standard entry',
    base_price_cents: 7500, // $75.00
    current_price_cents: 7500,
    currency: 'USD',
    total_qty: 10000,
    sold_qty: 6000,
    min_qty_per_order: 1,
    max_qty_per_order: 10,
    is_active: true,
    is_visible: true,
    display_order: 1
  },
  VIP: {
    id: uuidv4(),
    tenant_id: TEST_TENANT_ID,
    event_id: TEST_EVENT_ID,
    schedule_id: TEST_SCHEDULE_ID,
    capacity_id: TEST_CAPACITY_ID,
    tier_name: 'VIP',
    tier_description: 'VIP experience with backstage access',
    base_price_cents: 25000, // $250.00
    current_price_cents: 25000,
    currency: 'USD',
    total_qty: 500,
    sold_qty: 400,
    min_qty_per_order: 1,
    max_qty_per_order: 4,
    is_active: true,
    is_visible: true,
    display_order: 2
  },
  EARLY_BIRD: {
    id: uuidv4(),
    tenant_id: TEST_TENANT_ID,
    event_id: TEST_EVENT_ID,
    schedule_id: TEST_SCHEDULE_ID,
    capacity_id: TEST_CAPACITY_ID,
    tier_name: 'Early Bird',
    tier_description: 'Limited early bird pricing',
    base_price_cents: 5000, // $50.00
    current_price_cents: 5000,
    currency: 'USD',
    early_bird_price_cents: 5000,
    early_bird_ends_at: new Date('2025-05-01T00:00:00Z'),
    total_qty: 1000,
    sold_qty: 1000, // Sold out
    min_qty_per_order: 1,
    max_qty_per_order: 8,
    is_active: true,
    is_visible: true,
    display_order: 0
  },
  DYNAMIC_PRICING: {
    id: uuidv4(),
    tenant_id: TEST_TENANT_ID,
    event_id: TEST_EVENT_ID,
    schedule_id: TEST_SCHEDULE_ID,
    capacity_id: TEST_CAPACITY_ID,
    tier_name: 'Dynamic Pricing',
    tier_description: 'Price varies with demand',
    base_price_cents: 10000, // $100.00
    current_price_cents: 15000, // $150.00 (surged)
    currency: 'USD',
    total_qty: 2000,
    sold_qty: 1800, // 90% sold - triggering surge
    min_qty_per_order: 1,
    max_qty_per_order: 6,
    is_active: true,
    is_visible: true,
    display_order: 3
  }
};

// ============================================================================
// TEST TICKETS
// ============================================================================

export const TEST_TICKETS = {
  VALID_TICKET: {
    id: TEST_TICKET_ID,
    tenant_id: TEST_TENANT_ID,
    event_id: TEST_EVENT_ID,
    schedule_id: TEST_SCHEDULE_ID,
    order_id: uuidv4(),
    customer_id: TEST_USER_ID_2,
    pricing_tier_id: TEST_PRICING_ID,
    ticket_number: 'EVT-123456',
    qr_code: 'encrypted_qr_code_data_here',
    status: 'valid',
    price_paid_cents: 7500,
    currency: 'USD',
    seat_info: { section: 'A', row: 10, seat: 15 },
    scanned_at: null,
    scanned_by: null,
    created_at: new Date('2025-03-01T00:00:00Z')
  },
  SCANNED_TICKET: {
    id: uuidv4(),
    tenant_id: TEST_TENANT_ID,
    event_id: TEST_EVENT_ID,
    schedule_id: TEST_SCHEDULE_ID,
    order_id: uuidv4(),
    customer_id: TEST_USER_ID_2,
    pricing_tier_id: TEST_PRICING_ID,
    ticket_number: 'EVT-123457',
    qr_code: 'encrypted_qr_code_data_here_2',
    status: 'valid',
    price_paid_cents: 7500,
    currency: 'USD',
    scanned_at: new Date('2025-07-15T17:30:00Z'),
    scanned_by: TEST_USER_ID,
    created_at: new Date('2025-03-01T00:00:00Z')
  },
  REFUNDED_TICKET: {
    id: uuidv4(),
    tenant_id: TEST_TENANT_ID,
    event_id: TEST_EVENT_ID,
    schedule_id: TEST_SCHEDULE_ID,
    order_id: uuidv4(),
    customer_id: TEST_USER_ID_2,
    pricing_tier_id: TEST_PRICING_ID,
    ticket_number: 'EVT-123458',
    qr_code: 'encrypted_qr_code_data_here_3',
    status: 'refunded',
    price_paid_cents: 7500,
    currency: 'USD',
    refunded_at: new Date('2025-06-01T00:00:00Z'),
    refund_amount_cents: 6000, // 80% refund
    created_at: new Date('2025-03-01T00:00:00Z')
  },
  VIP_TICKET: {
    id: uuidv4(),
    tenant_id: TEST_TENANT_ID,
    event_id: TEST_EVENT_ID,
    schedule_id: TEST_SCHEDULE_ID,
    order_id: uuidv4(),
    customer_id: TEST_USER_ID_2,
    pricing_tier_id: TEST_PRICING.VIP.id,
    ticket_number: 'EVT-VIP001',
    qr_code: 'encrypted_vip_qr_code',
    status: 'valid',
    price_paid_cents: 25000,
    currency: 'USD',
    seat_info: { section: 'VIP', row: 1, seat: 5 },
    created_at: new Date('2025-03-01T00:00:00Z')
  }
};

// ============================================================================
// TEST RESERVATIONS
// ============================================================================

export const TEST_RESERVATIONS = {
  ACTIVE_RESERVATION: {
    id: uuidv4(),
    tenant_id: TEST_TENANT_ID,
    event_id: TEST_EVENT_ID,
    schedule_id: TEST_SCHEDULE_ID,
    customer_id: TEST_USER_ID_2,
    quantity: 2,
    pricing_tier_id: TEST_PRICING_ID,
    status: 'pending',
    expires_at: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes from now
    created_at: new Date()
  },
  EXPIRED_RESERVATION: {
    id: uuidv4(),
    tenant_id: TEST_TENANT_ID,
    event_id: TEST_EVENT_ID,
    schedule_id: TEST_SCHEDULE_ID,
    customer_id: TEST_USER_ID_2,
    quantity: 3,
    pricing_tier_id: TEST_PRICING_ID,
    status: 'expired',
    expires_at: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
    created_at: new Date(Date.now() - 15 * 60 * 1000)
  },
  CONFIRMED_RESERVATION: {
    id: uuidv4(),
    tenant_id: TEST_TENANT_ID,
    event_id: TEST_EVENT_ID,
    schedule_id: TEST_SCHEDULE_ID,
    customer_id: TEST_USER_ID_2,
    quantity: 4,
    pricing_tier_id: TEST_PRICING_ID,
    status: 'confirmed',
    confirmed_at: new Date(),
    created_at: new Date(Date.now() - 5 * 60 * 1000)
  }
};

// ============================================================================
// TEST EVENT METADATA
// ============================================================================

export const TEST_METADATA = {
  CONCERT_METADATA: {
    id: uuidv4(),
    tenant_id: TEST_TENANT_ID,
    event_id: TEST_EVENT_ID,
    performers: [
      { name: 'Headliner Band', type: 'band', bio: 'Famous rock band' },
      { name: 'Opening Act', type: 'band', bio: 'Up and coming artists' }
    ],
    headliner: 'Headliner Band',
    supporting_acts: ['Opening Act'],
    sponsors: [
      { name: 'Sponsor Corp', logo: 'https://example.com/sponsor.png', tier: 'platinum' }
    ],
    marketing_copy: {
      short: 'The biggest concert of the year!',
      long: 'Join us for an unforgettable night of music...'
    },
    custom_fields: {
      parking_info: 'Parking available in Lot A',
      food_vendors: ['Tacos', 'Pizza', 'BBQ']
    }
  }
};

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Creates a test event with optional overrides
 */
export function createTestEvent(overrides: Partial<any> = {}): any {
  return {
    id: uuidv4(),
    tenant_id: TEST_TENANT_ID,
    name: 'Test Event',
    slug: 'test-event',
    description: 'A test event',
    venue_id: TEST_VENUE_ID,
    category_id: TEST_CATEGORIES.MUSIC.id,
    event_date: new Date('2025-12-01T00:00:00Z'),
    starts_at: new Date('2025-12-01T19:00:00Z'),
    ends_at: new Date('2025-12-01T22:00:00Z'),
    doors_open: new Date('2025-12-01T18:30:00Z'),
    timezone: 'America/New_York',
    status: 'draft',
    is_published: false,
    capacity: 1000,
    created_by: TEST_USER_ID,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides
  };
}

/**
 * Creates a test schedule with optional overrides
 */
export function createTestSchedule(overrides: Partial<any> = {}): any {
  return {
    id: uuidv4(),
    tenant_id: TEST_TENANT_ID,
    event_id: TEST_EVENT_ID,
    starts_at: new Date('2025-12-01T19:00:00Z'),
    ends_at: new Date('2025-12-01T22:00:00Z'),
    doors_open: new Date('2025-12-01T18:30:00Z'),
    timezone: 'America/New_York',
    is_primary: true,
    status: 'active',
    ...overrides
  };
}

/**
 * Creates test pricing with optional overrides
 */
export function createTestPricing(overrides: Partial<any> = {}): any {
  return {
    id: uuidv4(),
    tenant_id: TEST_TENANT_ID,
    event_id: TEST_EVENT_ID,
    schedule_id: TEST_SCHEDULE_ID,
    tier_name: 'Test Tier',
    tier_description: 'Test pricing tier',
    base_price_cents: 5000,
    current_price_cents: 5000,
    currency: 'USD',
    total_qty: 100,
    sold_qty: 0,
    min_qty_per_order: 1,
    max_qty_per_order: 10,
    is_active: true,
    is_visible: true,
    display_order: 1,
    ...overrides
  };
}

/**
 * Creates a test ticket with optional overrides
 */
export function createTestTicket(overrides: Partial<any> = {}): any {
  return {
    id: uuidv4(),
    tenant_id: TEST_TENANT_ID,
    event_id: TEST_EVENT_ID,
    schedule_id: TEST_SCHEDULE_ID,
    order_id: uuidv4(),
    customer_id: TEST_USER_ID_2,
    pricing_tier_id: TEST_PRICING_ID,
    ticket_number: `EVT-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
    qr_code: `encrypted_qr_${uuidv4()}`,
    status: 'valid',
    price_paid_cents: 5000,
    currency: 'USD',
    created_at: new Date(),
    ...overrides
  };
}

/**
 * Creates test capacity with optional overrides
 */
export function createTestCapacity(overrides: Partial<any> = {}): any {
  return {
    id: uuidv4(),
    tenant_id: TEST_TENANT_ID,
    event_id: TEST_EVENT_ID,
    schedule_id: TEST_SCHEDULE_ID,
    total_capacity: 1000,
    sold_count: 0,
    pending_count: 0,
    reserved_capacity: 0,
    available_capacity: 1000,
    locked_price_data: null,
    ...overrides
  };
}

/**
 * Creates a test reservation with optional overrides
 */
export function createTestReservation(overrides: Partial<any> = {}): any {
  return {
    id: uuidv4(),
    tenant_id: TEST_TENANT_ID,
    event_id: TEST_EVENT_ID,
    schedule_id: TEST_SCHEDULE_ID,
    customer_id: TEST_USER_ID_2,
    quantity: 2,
    pricing_tier_id: TEST_PRICING_ID,
    status: 'pending',
    expires_at: new Date(Date.now() + 10 * 60 * 1000),
    created_at: new Date(),
    ...overrides
  };
}

/**
 * Creates a mock Fastify request
 */
export function createMockRequest(overrides: any = {}): any {
  return {
    user: TEST_USERS.ORGANIZER,
    params: {},
    query: {},
    body: {},
    headers: {},
    ip: '127.0.0.1',
    ...overrides
  };
}

/**
 * Creates a mock Fastify reply
 */
export function createMockReply(): any {
  const reply: any = {
    code: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    header: jest.fn().mockReturnThis(),
    headers: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis()
  };
  return reply;
}

/**
 * Creates a mock venue from venue service
 */
export function createMockVenue(overrides: Partial<any> = {}): any {
  return {
    ...TEST_VENUES.ARENA,
    ...overrides
  };
}

// ============================================================================
// REDIS TEST DATA
// ============================================================================

export const REDIS_TEST_KEYS = {
  EVENT: (id: string) => `event:${id}`,
  CAPACITY: (id: string) => `capacity:${id}`,
  RESERVATION: (id: string) => `reservation:${id}`,
  PRICING: (id: string) => `pricing:${id}`,
  LOCK: (resource: string) => `lock:${resource}`
};

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  TEST_USERS,
  TEST_VENUES,
  TEST_CATEGORIES,
  TEST_EVENTS,
  TEST_SCHEDULES,
  TEST_CAPACITY,
  TEST_PRICING,
  TEST_TICKETS,
  TEST_RESERVATIONS,
  TEST_METADATA,
  createTestEvent,
  createTestSchedule,
  createTestPricing,
  createTestTicket,
  createTestCapacity,
  createTestReservation,
  createMockRequest,
  createMockReply,
  createMockVenue,
  REDIS_TEST_KEYS
};