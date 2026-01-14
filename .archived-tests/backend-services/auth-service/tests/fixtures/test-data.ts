// AUTH SERVICE - TEST FIXTURES
// Test data, mock services, and helper functions

import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

// ==========================================
// TEST CONSTANTS
// ==========================================

export const TEST_TENANT_ID = 'test-tenant-001';
export const TEST_JWT_SECRET = 'test-jwt-secret-key';
export const TEST_JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-key';

// ==========================================
// TEST USERS
// ==========================================

export const TEST_USERS = {
  // Standard user
  VALID_USER: {
    id: 'user-001',
    email: 'testuser@test.com',
    password: 'TestPass123!',  // Plain text for testing
    password_hash: '', // Will be filled in setup
    full_name: 'Test User',
    first_name: 'Test',
    last_name: 'User',
    role: 'user',
    email_verified: true,
    mfa_enabled: false,
    tenant_id: TEST_TENANT_ID,
    is_active: true,
    created_at: new Date('2025-01-01'),
    updated_at: new Date('2025-01-01')
  },

  // User with MFA enabled
  MFA_USER: {
    id: 'user-002',
    email: 'mfauser@test.com',
    password: 'MFAPass123!',
    password_hash: '',
    full_name: 'MFA User',
    first_name: 'MFA',
    last_name: 'User',
    role: 'user',
    email_verified: true,
    mfa_enabled: true,
    mfa_secret: 'JBSWY3DPEHPK3PXP', // Base32 encoded secret for testing
    tenant_id: TEST_TENANT_ID,
    is_active: true,
    created_at: new Date('2025-01-01'),
    updated_at: new Date('2025-01-01')
  },

  // Admin user
  ADMIN_USER: {
    id: 'user-003',
    email: 'admin@test.com',
    password: 'AdminPass123!',
    password_hash: '',
    full_name: 'Admin User',
    first_name: 'Admin',
    last_name: 'User',
    role: 'admin',
    email_verified: true,
    mfa_enabled: false,
    tenant_id: TEST_TENANT_ID,
    is_active: true,
    created_at: new Date('2025-01-01'),
    updated_at: new Date('2025-01-01')
  },

  // Unverified email
  UNVERIFIED_USER: {
    id: 'user-004',
    email: 'unverified@test.com',
    password: 'UnverifiedPass123!',
    password_hash: '',
    full_name: 'Unverified User',
    role: 'user',
    email_verified: false,
    mfa_enabled: false,
    tenant_id: TEST_TENANT_ID,
    is_active: true,
    created_at: new Date('2025-01-01'),
    updated_at: new Date('2025-01-01')
  },

  // Locked account
  LOCKED_USER: {
    id: 'user-005',
    email: 'locked@test.com',
    password: 'LockedPass123!',
    password_hash: '',
    full_name: 'Locked User',
    role: 'user',
    email_verified: true,
    mfa_enabled: false,
    tenant_id: TEST_TENANT_ID,
    is_active: true,
    locked_until: new Date(Date.now() + 3600000), // Locked for 1 hour
    created_at: new Date('2025-01-01'),
    updated_at: new Date('2025-01-01')
  },

  // Deleted user (soft delete)
  DELETED_USER: {
    id: 'user-006',
    email: 'deleted@test.com',
    password: 'DeletedPass123!',
    password_hash: '',
    full_name: 'Deleted User',
    role: 'user',
    email_verified: true,
    mfa_enabled: false,
    tenant_id: TEST_TENANT_ID,
    is_active: false,
    deleted_at: new Date('2025-01-15'),
    created_at: new Date('2025-01-01'),
    updated_at: new Date('2025-01-15')
  },

  // Event organizer
  ORGANIZER_USER: {
    id: 'user-007',
    email: 'organizer@test.com',
    password: 'OrganizerPass123!',
    password_hash: '',
    full_name: 'Event Organizer',
    role: 'event_organizer',
    email_verified: true,
    mfa_enabled: false,
    tenant_id: TEST_TENANT_ID,
    is_active: true,
    created_at: new Date('2025-01-01'),
    updated_at: new Date('2025-01-01')
  },

  // Venue manager
  VENUE_MANAGER_USER: {
    id: 'user-008',
    email: 'venuemanager@test.com',
    password: 'VenuePass123!',
    password_hash: '',
    full_name: 'Venue Manager',
    role: 'venue_manager',
    email_verified: true,
    mfa_enabled: false,
    tenant_id: TEST_TENANT_ID,
    is_active: true,
    created_at: new Date('2025-01-01'),
    updated_at: new Date('2025-01-01')
  }
};

// ==========================================
// TEST TOKENS
// ==========================================

export const TEST_TOKENS = {
  // Valid access token (15 min expiry)
  VALID_ACCESS: createTestAccessToken(TEST_USERS.VALID_USER),
  
  // Expired access token
  EXPIRED_ACCESS: jwt.sign(
    {
      sub: TEST_USERS.VALID_USER.id,
      email: TEST_USERS.VALID_USER.email,
      role: TEST_USERS.VALID_USER.role
    },
    TEST_JWT_SECRET,
    { expiresIn: '-1h' } // Expired 1 hour ago
  ),

  // Invalid signature
  INVALID_SIGNATURE: jwt.sign(
    {
      sub: TEST_USERS.VALID_USER.id,
      email: TEST_USERS.VALID_USER.email,
      role: TEST_USERS.VALID_USER.role
    },
    'wrong-secret',
    { expiresIn: '15m' }
  ),

  // Malformed token
  MALFORMED: 'this.is.not.a.valid.jwt.token',

  // Valid refresh token (7 day expiry)
  VALID_REFRESH: createTestRefreshToken(TEST_USERS.VALID_USER, 'session-001'),

  // Admin token
  ADMIN_ACCESS: createTestAccessToken(TEST_USERS.ADMIN_USER)
};

// ==========================================
// TEST SESSIONS
// ==========================================

export const TEST_SESSIONS = {
  ACTIVE_SESSION: {
    id: 'session-001',
    user_id: TEST_USERS.VALID_USER.id,
    tenant_id: TEST_TENANT_ID,
    device_name: 'Chrome on MacOS',
    device_fingerprint: 'abc123xyz789',
    ip_address: '192.168.1.100',
    user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    is_active: true,
    revoked_at: null,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    created_at: new Date(),
    last_activity_at: new Date()
  },

  REVOKED_SESSION: {
    id: 'session-002',
    user_id: TEST_USERS.VALID_USER.id,
    tenant_id: TEST_TENANT_ID,
    device_name: 'Firefox on Windows',
    device_fingerprint: 'def456uvw123',
    ip_address: '192.168.1.101',
    user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    is_active: false,
    revoked_at: new Date(),
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    created_at: new Date(),
    last_activity_at: new Date()
  }
};

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Create test access token
 */
export function createTestAccessToken(user: any, expiresIn: string = '15m'): string {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenant_id,
      permissions: getRolePermissions(user.role)
    },
    TEST_JWT_SECRET,
    { expiresIn }
  );
}

/**
 * Create test refresh token
 */
export function createTestRefreshToken(user: any, sessionId: string, expiresIn: string = '7d'): string {
  return jwt.sign(
    {
      sub: user.id,
      sessionId: sessionId,
      tenantId: user.tenant_id,
      type: 'refresh'
    },
    TEST_JWT_REFRESH_SECRET,
    { expiresIn }
  );
}

/**
 * Create test user with custom overrides
 */
export function createTestUser(overrides: Partial<typeof TEST_USERS.VALID_USER> = {}) {
  return {
    ...TEST_USERS.VALID_USER,
    id: `user-${Date.now()}`,
    email: `testuser-${Date.now()}@test.com`,
    ...overrides
  };
}

/**
 * Create test session
 */
export function createTestSession(userId: string, overrides: any = {}) {
  return {
    ...TEST_SESSIONS.ACTIVE_SESSION,
    id: `session-${Date.now()}`,
    user_id: userId,
    ...overrides
  };
}

/**
 * Hash password for testing
 */
export async function hashTestPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

/**
 * Get role permissions
 */
export function getRolePermissions(role: string): string[] {
  const permissionMap: Record<string, string[]> = {
    admin: ['*'], // All permissions
    event_organizer: [
      'events:create',
      'events:read',
      'events:update',
      'events:delete',
      'tickets:create',
      'tickets:read'
    ],
    venue_manager: [
      'venues:create',
      'venues:read',
      'venues:update',
      'venues:delete'
    ],
    user: [
      'tickets:read',
      'profile:read',
      'profile:update'
    ]
  };

  return permissionMap[role] || permissionMap.user;
}

// ==========================================
// MOCK DATA GENERATORS
// ==========================================

/**
 * Generate random email
 */
export function generateTestEmail(): string {
  return `test-${Date.now()}-${Math.random().toString(36).substring(7)}@test.com`;
}

/**
 * Generate random user ID
 */
export function generateUserId(): string {
  return `user-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

/**
 * Generate random session ID
 */
export function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

// ==========================================
// TEST API KEYS
// ==========================================

export const TEST_API_KEYS = {
  VALID_KEY: {
    id: 'apikey-001',
    key: 'test_api_key_valid_123456789',
    key_hash: '', // Will be filled in setup
    user_id: TEST_USERS.VALID_USER.id,
    name: 'Test API Key',
    permissions: ['events:read', 'venues:read'],
    is_active: true,
    expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
    created_at: new Date(),
    last_used_at: null
  },

  EXPIRED_KEY: {
    id: 'apikey-002',
    key: 'test_api_key_expired_987654321',
    key_hash: '',
    user_id: TEST_USERS.VALID_USER.id,
    name: 'Expired API Key',
    permissions: ['events:read'],
    is_active: true,
    expires_at: new Date('2024-01-01'), // Already expired
    created_at: new Date('2023-01-01'),
    last_used_at: null
  },

  INACTIVE_KEY: {
    id: 'apikey-003',
    key: 'test_api_key_inactive_abcdefghi',
    key_hash: '',
    user_id: TEST_USERS.VALID_USER.id,
    name: 'Inactive API Key',
    permissions: ['events:read'],
    is_active: false,
    expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    created_at: new Date(),
    last_used_at: null
  }
};

// ==========================================
// MFA TEST DATA
// ==========================================

export const TEST_MFA = {
  // Valid TOTP secret for testing
  SECRET: 'JBSWY3DPEHPK3PXP',
  
  // Test backup codes
  BACKUP_CODES: [
    'backup-code-001-abc123',
    'backup-code-002-def456',
    'backup-code-003-ghi789',
    'backup-code-004-jkl012',
    'backup-code-005-mno345',
    'backup-code-006-pqr678',
    'backup-code-007-stu901',
    'backup-code-008-vwx234',
    'backup-code-009-yza567',
    'backup-code-010-bcd890'
  ],

  // Used backup code (for testing)
  USED_BACKUP_CODE: {
    id: 'backup-001',
    user_id: TEST_USERS.MFA_USER.id,
    code_hash: '', // Will be filled
    used_at: new Date(),
    created_at: new Date('2025-01-01')
  }
};

// ==========================================
// OAUTH TEST DATA
// ==========================================

export const TEST_OAUTH = {
  GOOGLE: {
    provider: 'google',
    provider_user_id: 'google-user-123456',
    email: 'oauth-google@test.com',
    name: 'Google OAuth User',
    access_token: 'google-access-token-abc123',
    refresh_token: 'google-refresh-token-def456',
    expires_at: new Date(Date.now() + 3600000) // 1 hour
  },

  APPLE: {
    provider: 'apple',
    provider_user_id: 'apple-user-789012',
    email: 'oauth-apple@test.com',
    name: 'Apple OAuth User',
    access_token: 'apple-access-token-ghi789',
    id_token: 'apple-id-token-jkl012',
    expires_at: new Date(Date.now() + 3600000)
  }
};

// ==========================================
// WALLET TEST DATA
// ==========================================

export const TEST_WALLETS = {
  ETHEREUM: {
    address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
    chain: 'ethereum',
    nonce: 'test-nonce-eth-123456',
    signature: 'test-signature-eth-abc123'
  },

  SOLANA: {
    address: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
    chain: 'solana',
    nonce: 'test-nonce-sol-789012',
    signature: 'test-signature-sol-def456'
  }
};

// ==========================================
// VALIDATION TEST DATA
// ==========================================

export const INVALID_INPUTS = {
  EMAILS: [
    'notanemail',
    '@test.com',
    'test@',
    'test..test@test.com',
    'test@test',
    ''
  ],

  PASSWORDS: [
    'weak',           // Too short
    'alllowercase',   // No uppercase
    'ALLUPPERCASE',   // No lowercase
    'NoNumbers!',     // No numbers
    'NoSpecial123',   // No special chars
    'password',       // Common password
    '12345678'        // Common password
  ],

  SQL_INJECTION: [
    "'; DROP TABLE users; --",
    "1' OR '1'='1",
    "admin'--",
    "' UNION SELECT * FROM users--"
  ],

  XSS_ATTEMPTS: [
    "<script>alert('xss')</script>",
    "<img src=x onerror=alert('xss')>",
    "javascript:alert('xss')",
    "<iframe src='javascript:alert(1)'>"
  ]
};

// ==========================================
// RATE LIMIT TEST DATA
// ==========================================

export const RATE_LIMITS = {
  LOGIN: {
    max: 5,
    windowMs: 60000 // 1 minute
  },

  REGISTER: {
    max: 3,
    windowMs: 3600000 // 1 hour
  },

  PASSWORD_RESET: {
    max: 3,
    windowMs: 3600000 // 1 hour
  }
};

// ==========================================
// DATABASE SEED HELPER
// ==========================================

/**
 * Seed test database with users
 */
export async function seedTestUsers(db: any) {
  // Hash passwords
  for (const key of Object.keys(TEST_USERS)) {
    const user = TEST_USERS[key as keyof typeof TEST_USERS];
    user.password_hash = await hashTestPassword(user.password);
  }

  // Insert users
  const usersToInsert = Object.values(TEST_USERS).map(user => ({
    id: user.id,
    email: user.email,
    password: user.password_hash,
    full_name: user.full_name,
    role: user.role,
    email_verified: user.email_verified,
    mfa_enabled: user.mfa_enabled,
    mfa_secret: user.mfa_secret || null,
    tenant_id: user.tenant_id,
    is_active: user.is_active,
    locked_until: user.locked_until || null,
    deleted_at: user.deleted_at || null,
    created_at: user.created_at,
    updated_at: user.updated_at
  }));

  await db('users').insert(usersToInsert);
}

/**
 * Seed test sessions
 */
export async function seedTestSessions(db: any) {
  const sessionsToInsert = Object.values(TEST_SESSIONS);
  await db('sessions').insert(sessionsToInsert);
}

/**
 * Clean test database
 */
export async function cleanTestDatabase(db: any) {
  // Delete in order to respect foreign keys
  await db('sessions').del();
  await db('mfa_backup_codes').del();
  await db('oauth_connections').del();
  await db('api_keys').del();
  await db('audit_logs').del();
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

// ==========================================
// EXPORTS
// ==========================================

export default {
  TEST_USERS,
  TEST_TOKENS,
  TEST_SESSIONS,
  TEST_API_KEYS,
  TEST_MFA,
  TEST_OAUTH,
  TEST_WALLETS,
  INVALID_INPUTS,
  RATE_LIMITS,
  createTestAccessToken,
  createTestRefreshToken,
  createTestUser,
  createTestSession,
  generateTestEmail,
  generateUserId,
  generateSessionId,
  getRolePermissions,
  seedTestUsers,
  seedTestSessions,
  cleanTestDatabase,
  createMockRequest,
  createMockReply
};
