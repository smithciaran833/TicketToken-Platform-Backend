/**
 * VENUE SERVICE - TEST DATA & FIXTURES
 * 
 * Comprehensive test data for all venue service tests
 * Includes: venues, staff, settings, integrations, and helpers
 */

import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcrypt';

// ==========================================
// TYPE DEFINITIONS
// ==========================================

export interface TestVenue {
  id: string;
  tenant_id: string;
  owner_id: string;
  name: string;
  slug: string;
  type: 'theater' | 'stadium' | 'arena' | 'club' | 'conference_center' | 'outdoor';
  description?: string;
  capacity: number;
  address: {
    street: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
  location?: {
    latitude: number;
    longitude: number;
  };
  contact: {
    phone?: string;
    email?: string;
    website?: string;
  };
  amenities?: string[];
  accessibility_features?: string[];
  images?: {
    main?: string;
    gallery?: string[];
  };
  is_active: boolean;
  is_verified: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date | null;
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
  password_hash?: string;
  full_name: string;
  role: 'admin' | 'venue_owner' | 'staff' | 'customer';
  tenant_id: string;
  email_verified: boolean;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface TestStaff {
  id: string;
  venue_id: string;
  user_id: string;
  role: 'manager' | 'coordinator' | 'security' | 'box_office';
  permissions: string[];
  is_active: boolean;
  hired_date: Date;
  created_at: Date;
}

export interface TestIntegration {
  id: string;
  venue_id: string;
  provider: 'ticketmaster' | 'eventbrite' | 'stripe' | 'square' | 'mailchimp';
  config: Record<string, any>;
  credentials: {
    api_key?: string;
    api_secret?: string;
    access_token?: string;
    refresh_token?: string;
  };
  is_active: boolean;
  last_sync_at?: Date;
  created_at: Date;
  updated_at: Date;
}

// ==========================================
// CONSTANTS
// ==========================================

export const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';
export const SECONDARY_TENANT_ID = '00000000-0000-0000-0000-000000000002';

export const TEST_DATE_PAST = new Date('2024-01-01T00:00:00Z');
export const TEST_DATE_NOW = new Date('2025-10-22T00:00:00Z');
export const TEST_DATE_FUTURE = new Date('2026-01-01T00:00:00Z');

// ==========================================
// TEST USERS
// ==========================================

export const TEST_USERS: Record<string, TestUser> = {
  OWNER: {
    id: 'user-owner-001',
    email: 'venue.owner@test.com',
    password: 'VenueOwner123!',
    full_name: 'John Venue Owner',
    role: 'venue_owner',
    tenant_id: DEFAULT_TENANT_ID,
    email_verified: true,
    is_active: true,
    created_at: TEST_DATE_PAST,
    updated_at: TEST_DATE_NOW
  },

  MANAGER: {
    id: 'user-manager-001',
    email: 'venue.manager@test.com',
    password: 'Manager123!',
    full_name: 'Jane Manager',
    role: 'staff',
    tenant_id: DEFAULT_TENANT_ID,
    email_verified: true,
    is_active: true,
    created_at: TEST_DATE_PAST,
    updated_at: TEST_DATE_NOW
  },

  STAFF: {
    id: 'user-staff-001',
    email: 'venue.staff@test.com',
    password: 'Staff123!',
    full_name: 'Bob Staff',
    role: 'staff',
    tenant_id: DEFAULT_TENANT_ID,
    email_verified: true,
    is_active: true,
    created_at: TEST_DATE_PAST,
    updated_at: TEST_DATE_NOW
  },

  OTHER_TENANT: {
    id: 'user-other-001',
    email: 'other.owner@test.com',
    password: 'OtherOwner123!',
    full_name: 'Alice Other',
    role: 'venue_owner',
    tenant_id: SECONDARY_TENANT_ID,
    email_verified: true,
    is_active: true,
    created_at: TEST_DATE_PAST,
    updated_at: TEST_DATE_NOW
  }
};

// ==========================================
// TEST VENUES
// ==========================================

export const TEST_VENUES: Record<string, TestVenue> = {
  THEATER: {
    id: 'venue-theater-001',
    tenant_id: DEFAULT_TENANT_ID,
    owner_id: TEST_USERS.OWNER.id,
    name: 'Historic Theater',
    slug: 'historic-theater',
    type: 'theater',
    description: 'A beautiful historic theater in downtown',
    capacity: 500,
    address: {
      street: '123 Broadway St',
      city: 'New York',
      state: 'NY',
      zip: '10001',
      country: 'USA'
    },
    location: {
      latitude: 40.7589,
      longitude: -73.9851
    },
    contact: {
      phone: '+1-212-555-0100',
      email: 'info@historictheater.com',
      website: 'https://historictheater.com'
    },
    amenities: ['parking', 'wifi', 'bar', 'coat_check', 'wheelchair_access'],
    accessibility_features: ['wheelchair_ramps', 'accessible_restrooms', 'assisted_listening'],
    images: {
      main: 'https://example.com/theater-main.jpg',
      gallery: [
        'https://example.com/theater-1.jpg',
        'https://example.com/theater-2.jpg'
      ]
    },
    is_active: true,
    is_verified: true,
    created_at: TEST_DATE_PAST,
    updated_at: TEST_DATE_NOW
  },

  STADIUM: {
    id: 'venue-stadium-001',
    tenant_id: DEFAULT_TENANT_ID,
    owner_id: TEST_USERS.OWNER.id,
    name: 'City Stadium',
    slug: 'city-stadium',
    type: 'stadium',
    description: 'Large outdoor stadium for sports and concerts',
    capacity: 50000,
    address: {
      street: '456 Sports Complex Dr',
      city: 'Los Angeles',
      state: 'CA',
      zip: '90001',
      country: 'USA'
    },
    location: {
      latitude: 34.0522,
      longitude: -118.2437
    },
    contact: {
      phone: '+1-323-555-0200',
      email: 'info@citystadium.com',
      website: 'https://citystadium.com'
    },
    amenities: ['parking', 'wifi', 'food_vendors', 'merchandise', 'wheelchair_access'],
    accessibility_features: ['wheelchair_seating', 'accessible_parking', 'elevators'],
    is_active: true,
    is_verified: true,
    created_at: TEST_DATE_PAST,
    updated_at: TEST_DATE_NOW
  },

  ARENA: {
    id: 'venue-arena-001',
    tenant_id: DEFAULT_TENANT_ID,
    owner_id: TEST_USERS.OWNER.id,
    name: 'Metro Arena',
    slug: 'metro-arena',
    type: 'arena',
    description: 'Indoor arena for concerts and sporting events',
    capacity: 20000,
    address: {
      street: '789 Arena Blvd',
      city: 'Chicago',
      state: 'IL',
      zip: '60601',
      country: 'USA'
    },
    location: {
      latitude: 41.8781,
      longitude: -87.6298
    },
    contact: {
      phone: '+1-312-555-0300',
      email: 'info@metroarena.com',
      website: 'https://metroarena.com'
    },
    amenities: ['parking', 'wifi', 'restaurants', 'vip_suites', 'wheelchair_access'],
    accessibility_features: ['wheelchair_seating', 'sign_language_interpreters', 'sensory_rooms'],
    is_active: true,
    is_verified: true,
    created_at: TEST_DATE_PAST,
    updated_at: TEST_DATE_NOW
  },

  CLUB: {
    id: 'venue-club-001',
    tenant_id: DEFAULT_TENANT_ID,
    owner_id: TEST_USERS.OWNER.id,
    name: 'Underground Club',
    slug: 'underground-club',
    type: 'club',
    description: 'Intimate music venue and nightclub',
    capacity: 300,
    address: {
      street: '321 Music Row',
      city: 'Nashville',
      state: 'TN',
      zip: '37201',
      country: 'USA'
    },
    location: {
      latitude: 36.1627,
      longitude: -86.7816
    },
    contact: {
      phone: '+1-615-555-0400',
      email: 'bookings@undergroundclub.com',
      website: 'https://undergroundclub.com'
    },
    amenities: ['bar', 'sound_system', 'lighting', 'vip_area'],
    is_active: true,
    is_verified: true,
    created_at: TEST_DATE_PAST,
    updated_at: TEST_DATE_NOW
  },

  UNVERIFIED: {
    id: 'venue-unverified-001',
    tenant_id: DEFAULT_TENANT_ID,
    owner_id: TEST_USERS.OWNER.id,
    name: 'Unverified Venue',
    slug: 'unverified-venue',
    type: 'conference_center',
    capacity: 1000,
    address: {
      street: '555 Conference Pkwy',
      city: 'Austin',
      state: 'TX',
      zip: '78701',
      country: 'USA'
    },
    contact: {},
    is_active: true,
    is_verified: false,
    created_at: TEST_DATE_NOW,
    updated_at: TEST_DATE_NOW
  },

  DELETED: {
    id: 'venue-deleted-001',
    tenant_id: DEFAULT_TENANT_ID,
    owner_id: TEST_USERS.OWNER.id,
    name: 'Deleted Venue',
    slug: 'deleted-venue',
    type: 'theater',
    capacity: 200,
    address: {
      street: '999 Closed St',
      city: 'Boston',
      state: 'MA',
      zip: '02101',
      country: 'USA'
    },
    contact: {},
    is_active: false,
    is_verified: true,
    created_at: TEST_DATE_PAST,
    updated_at: TEST_DATE_NOW,
    deleted_at: TEST_DATE_NOW
  },

  OTHER_TENANT: {
    id: 'venue-other-001',
    tenant_id: SECONDARY_TENANT_ID,
    owner_id: TEST_USERS.OTHER_TENANT.id,
    name: 'Other Tenant Venue',
    slug: 'other-tenant-venue',
    type: 'arena',
    capacity: 15000,
    address: {
      street: '111 Other St',
      city: 'Seattle',
      state: 'WA',
      zip: '98101',
      country: 'USA'
    },
    contact: {},
    is_active: true,
    is_verified: true,
    created_at: TEST_DATE_PAST,
    updated_at: TEST_DATE_NOW
  }
};

// ==========================================
// TEST STAFF
// ==========================================

export const TEST_STAFF: Record<string, TestStaff> = {
  MANAGER: {
    id: 'staff-manager-001',
    venue_id: TEST_VENUES.THEATER.id,
    user_id: TEST_USERS.MANAGER.id,
    role: 'manager',
    permissions: [
      'venue.read',
      'venue.update',
      'event.create',
      'event.update',
      'staff.read',
      'reports.view'
    ],
    is_active: true,
    hired_date: TEST_DATE_PAST,
    created_at: TEST_DATE_PAST
  },

  COORDINATOR: {
    id: 'staff-coordinator-001',
    venue_id: TEST_VENUES.THEATER.id,
    user_id: TEST_USERS.STAFF.id,
    role: 'coordinator',
    permissions: [
      'venue.read',
      'event.read',
      'event.update'
    ],
    is_active: true,
    hired_date: TEST_DATE_PAST,
    created_at: TEST_DATE_PAST
  },

  SECURITY: {
    id: 'staff-security-001',
    venue_id: TEST_VENUES.STADIUM.id,
    user_id: TEST_USERS.STAFF.id,
    role: 'security',
    permissions: [
      'venue.read',
      'ticket.validate'
    ],
    is_active: true,
    hired_date: TEST_DATE_PAST,
    created_at: TEST_DATE_PAST
  }
};

// ==========================================
// TEST VENUE SETTINGS
// ==========================================

export const TEST_SETTINGS: Record<string, any> = {
  THEATER_SETTINGS: {
    venue_id: TEST_VENUES.THEATER.id,
    settings: {
      booking: {
        advance_booking_days: 180,
        min_notice_hours: 24,
        allow_same_day: false,
        require_deposit: true,
        deposit_percentage: 25
      },
      pricing: {
        currency: 'USD',
        tax_rate: 0.08,
        service_fee_percentage: 5,
        allow_discounts: true
      },
      notifications: {
        email_confirmations: true,
        sms_reminders: true,
        reminder_hours_before: 24
      },
      policies: {
        cancellation_policy: '48 hours notice required',
        refund_policy: 'Full refund if cancelled 7 days prior',
        age_restriction: '18+',
        dress_code: 'Smart casual'
      }
    }
  },

  STADIUM_SETTINGS: {
    venue_id: TEST_VENUES.STADIUM.id,
    settings: {
      booking: {
        advance_booking_days: 365,
        min_notice_hours: 72,
        allow_same_day: false,
        require_deposit: true,
        deposit_percentage: 50
      },
      pricing: {
        currency: 'USD',
        tax_rate: 0.0925,
        service_fee_percentage: 10,
        allow_discounts: false
      },
      parking: {
        available: true,
        capacity: 5000,
        price_per_day: 25
      }
    }
  }
};

// ==========================================
// TEST INTEGRATIONS
// ==========================================

export const TEST_INTEGRATIONS: Record<string, TestIntegration> = {
  TICKETMASTER: {
    id: 'integration-tm-001',
    venue_id: TEST_VENUES.THEATER.id,
    provider: 'ticketmaster',
    config: {
      venue_id_external: 'TM-VENUE-12345',
      auto_sync: true,
      sync_frequency: 'hourly'
    },
    credentials: {
      api_key: 'tm_api_key_encrypted_12345',
      api_secret: 'tm_api_secret_encrypted_67890'
    },
    is_active: true,
    last_sync_at: TEST_DATE_NOW,
    created_at: TEST_DATE_PAST,
    updated_at: TEST_DATE_NOW
  },

  EVENTBRITE: {
    id: 'integration-eb-001',
    venue_id: TEST_VENUES.STADIUM.id,
    provider: 'eventbrite',
    config: {
      organization_id: 'eb_org_12345',
      auto_publish: false,
      webhook_url: 'https://api.venue-service.com/webhooks/eventbrite'
    },
    credentials: {
      access_token: 'eb_access_token_encrypted',
      refresh_token: 'eb_refresh_token_encrypted'
    },
    is_active: true,
    last_sync_at: TEST_DATE_NOW,
    created_at: TEST_DATE_PAST,
    updated_at: TEST_DATE_NOW
  },

  STRIPE: {
    id: 'integration-stripe-001',
    venue_id: TEST_VENUES.THEATER.id,
    provider: 'stripe',
    config: {
      account_id: 'acct_stripe_12345',
      capture_method: 'automatic',
      statement_descriptor: 'HISTORIC THEATER'
    },
    credentials: {
      api_key: 'sk_test_stripe_encrypted',
      webhook_secret: 'whsec_stripe_encrypted'
    },
    is_active: true,
    created_at: TEST_DATE_PAST,
    updated_at: TEST_DATE_NOW
  }
};

// ==========================================
// TEST TOKENS
// ==========================================

export const TEST_TOKENS = {
  VALID_ACCESS_TOKEN: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.test.signature',
  EXPIRED_ACCESS_TOKEN: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.expired.signature',
  INVALID_TOKEN: 'invalid.token.format',
  
  VALID_API_KEY: 'vk_test_abc123def456ghi789',
  EXPIRED_API_KEY: 'vk_test_expired_123',
  INVALID_API_KEY: 'invalid_api_key'
};

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Create test venue with custom data
 */
export function createTestVenue(overrides: Partial<TestVenue> = {}): TestVenue {
  return {
    id: uuidv4(),
    tenant_id: DEFAULT_TENANT_ID,
    owner_id: TEST_USERS.OWNER.id,
    name: 'Test Venue',
    slug: 'test-venue-' + Date.now(),
    type: 'theater',
    capacity: 500,
    address: {
      street: '123 Test St',
      city: 'Test City',
      state: 'NY',
      zip: '10001',
      country: 'USA'
    },
    contact: {},
    is_active: true,
    is_verified: true,
    created_at: TEST_DATE_NOW,
    updated_at: TEST_DATE_NOW,
    ...overrides
  };
}

/**
 * Create test user with custom data
 */
export function createTestUser(overrides: Partial<TestUser> = {}): TestUser {
  const randomId = Math.random().toString(36).substring(7);
  return {
    id: uuidv4(),
    email: `test.user.${randomId}@test.com`,
    password: 'TestUser123!',
    full_name: 'Test User',
    role: 'venue_owner',
    tenant_id: DEFAULT_TENANT_ID,
    email_verified: true,
    is_active: true,
    created_at: TEST_DATE_NOW,
    updated_at: TEST_DATE_NOW,
    ...overrides
  };
}

/**
 * Create test staff member
 */
export function createTestStaff(overrides: Partial<TestStaff> = {}): TestStaff {
  return {
    id: uuidv4(),
    venue_id: TEST_VENUES.THEATER.id,
    user_id: TEST_USERS.STAFF.id,
    role: 'coordinator',
    permissions: ['venue.read'],
    is_active: true,
    hired_date: TEST_DATE_NOW,
    created_at: TEST_DATE_NOW,
    ...overrides
  };
}

/**
 * Generate unique venue ID
 */
export function generateVenueId(): string {
  return `venue-test-${uuidv4()}`;
}

/**
 * Generate unique user ID
 */
export function generateUserId(): string {
  return `user-test-${uuidv4()}`;
}

/**
 * Generate unique email
 */
export function generateTestEmail(): string {
  const randomStr = Math.random().toString(36).substring(7);
  return `test.${randomStr}@venue-test.com`;
}

/**
 * Hash password for test users
 */
export async function hashTestPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, 10);
}

/**
 * Create test access token
 */
export function createTestAccessToken(userId: string, permissions: string[] = []): string {
  // Simple mock token - in real tests, use actual JWT signing
  const payload = {
    sub: userId,
    permissions,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600
  };
  return `test.token.${Buffer.from(JSON.stringify(payload)).toString('base64')}`;
}

/**
 * Get role permissions mapping
 */
export function getRolePermissions(role: string): string[] {
  const permissions: Record<string, string[]> = {
    'owner': ['*'],
    'manager': [
      'venue.read', 'venue.update', 
      'event.create', 'event.read', 'event.update', 'event.delete',
      'staff.read', 'staff.create', 
      'reports.view'
    ],
    'coordinator': [
      'venue.read',
      'event.read', 'event.update'
    ],
    'security': [
      'venue.read',
      'ticket.validate'
    ],
    'box_office': [
      'venue.read',
      'ticket.sell', 'ticket.validate', 'ticket.refund'
    ]
  };
  return permissions[role] || [];
}

// ==========================================
// VALIDATION TEST DATA
// ==========================================

export const INVALID_VENUE_DATA = {
  MISSING_NAME: {
    capacity: 500,
    type: 'theater',
    address: TEST_VENUES.THEATER.address
  },
  
  NEGATIVE_CAPACITY: {
    name: 'Invalid Venue',
    capacity: -100,
    type: 'theater',
    address: TEST_VENUES.THEATER.address
  },
  
  INVALID_TYPE: {
    name: 'Invalid Venue',
    capacity: 500,
    type: 'invalid_type',
    address: TEST_VENUES.THEATER.address
  },
  
  MISSING_ADDRESS: {
    name: 'Invalid Venue',
    capacity: 500,
    type: 'theater'
  }
};

export const INVALID_INPUTS = {
  SQL_INJECTION: [
    "'; DROP TABLE venues; --",
    "1' OR '1'='1",
    "venue' OR 1=1--"
  ],
  
  XSS_ATTEMPTS: [
    "<script>alert('xss')</script>",
    "<img src=x onerror=alert('xss')>",
    "javascript:alert('xss')"
  ],
  
  INVALID_EMAILS: [
    'notanemail',
    '@test.com',
    'test@',
    'test..test@test.com'
  ]
};

// ==========================================
// DATABASE SEED HELPER
// ==========================================

/**
 * Seed test database with venues
 */
export async function seedTestVenues(db: any) {
  const venuesToInsert = Object.values(TEST_VENUES).map(venue => ({
    ...venue,
    address: JSON.stringify(venue.address),
    location: venue.location ? JSON.stringify(venue.location) : null,
    contact: JSON.stringify(venue.contact),
    amenities: venue.amenities || null,
    accessibility_features: venue.accessibility_features || null,
    images: venue.images ? JSON.stringify(venue.images) : null
  }));

  await db('venues').insert(venuesToInsert);
}

/**
 * Seed test users
 */
export async function seedTestUsers(db: any) {
  for (const key of Object.keys(TEST_USERS)) {
    const user = TEST_USERS[key as keyof typeof TEST_USERS];
    user.password_hash = await hashTestPassword(user.password);
  }

  const usersToInsert = Object.values(TEST_USERS).map(user => ({
    id: user.id,
    email: user.email,
    password: user.password_hash,
    full_name: user.full_name,
    role: user.role,
    tenant_id: user.tenant_id,
    email_verified: user.email_verified,
    is_active: user.is_active,
    created_at: user.created_at,
    updated_at: user.updated_at
  }));

  await db('users').insert(usersToInsert);
}

/**
 * Seed test staff
 */
export async function seedTestStaff(db: any) {
  const staffToInsert = Object.values(TEST_STAFF);
  await db('venue_staff').insert(staffToInsert);
}

/**
 * Clean test database
 */
export async function cleanTestDatabase(db: any) {
  // Delete in order to respect foreign keys
  await db('venue_integrations').del();
  await db('venue_staff').del();
  await db('venue_settings').del();
  await db('venues').del();
  await db('users').del();
}

// ==========================================
// MOCK REQUEST/RESPONSE
// ==========================================

/**
 * Create mock Fastify request
 */
export function createMockRequest(overrides: any = {}) {
  return {
    body: {},
    query: {},
    params: {},
    headers: {},
    user: null,
    tenantId: DEFAULT_TENANT_ID,
    ...overrides
  };
}

/**
 * Create mock Fastify reply
 */
export function createMockReply() {
  const reply: any = {
    code: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
    header: jest.fn().mockReturnThis(),
  };
  return reply;
}

/**
 * Create authenticated request
 */
export function createAuthenticatedRequest(
  user: Partial<TestUser> = TEST_USERS.OWNER,
  overrides: any = {}
) {
  return createMockRequest({
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenant_id
    },
    headers: {
      authorization: `Bearer ${createTestAccessToken(user.id!)}`
    },
    ...overrides
  });
}

// ==========================================
// MOCK SERVICES
// ==========================================

/**
 * Create mock venue service
 */
export function createMockVenueService(overrides: any = {}) {
  return {
    createVenue: jest.fn(),
    getVenue: jest.fn(),
    listVenues: jest.fn(),
    updateVenue: jest.fn(),
    deleteVenue: jest.fn(),
    checkVenueAccess: jest.fn(),
    ...overrides
  };
}

/**
 * Create mock cache service
 */
export function createMockCacheService(overrides: any = {}) {
  return {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    clear: jest.fn(),
    ...overrides
  };
}

// ==========================================
// EXPORTS
// ==========================================

export default {
  TEST_VENUES,
  TEST_USERS,
  TEST_STAFF,
  TEST_SETTINGS,
  TEST_INTEGRATIONS,
  TEST_TOKENS,
  INVALID_VENUE_DATA,
  INVALID_INPUTS,
  createTestVenue,
  createTestUser,
  createTestStaff,
  generateVenueId,
  generateUserId,
  generateTestEmail,
  createTestAccessToken,
  getRolePermissions,
  seedTestVenues,
  seedTestUsers,
  seedTestStaff,
  cleanTestDatabase,
  createMockRequest,
  createMockReply,
  createAuthenticatedRequest,
  createMockVenueService,
  createMockCacheService
};