/**
 * RESPONSE SECURITY INTEGRATION TESTS
 *
 * These tests verify that sensitive user data is NEVER leaked in API responses.
 * This is a critical security test suite - all tests must pass before deployment.
 *
 * Tests are organized into:
 * 1. Positive Tests - Verify safe fields ARE returned
 * 2. Negative Tests - Verify sensitive fields are NEVER returned
 * 3. Edge Cases - Verify serialization works under various conditions
 */

import request from 'supertest';
import {
  testPool,
  TEST_TENANT_ID,
  cleanupAll,
  closeConnections,
  createTestUser,
  initAppRedis,
} from './setup';

// Import serializer utilities for test assertions
import {
  SAFE_USER_FIELDS,
  FORBIDDEN_USER_FIELDS,
  findForbiddenFields,
  findMissingSafeFields,
} from '../../src/serializers/user.serializer';

// Mock email service
jest.mock('../../src/services/email.service', () => ({
  EmailService: jest.fn().mockImplementation(() => ({
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  })),
}));

import { buildApp } from '../../src/app';

let app: any;

// ============================================
// FIELDS THAT MUST BE TESTED
// ============================================

/**
 * SAFE FIELDS - These SHOULD be present in responses
 */
const EXPECTED_SAFE_FIELDS = [
  'id',
  'email',
  'email_verified',
  'mfa_enabled',
  'role',
  'tenant_id',
  'created_at',
  'updated_at',
];

/**
 * CRITICAL FORBIDDEN FIELDS - Authentication secrets
 * If ANY of these appear in a response, it's a critical security vulnerability
 */
const CRITICAL_FORBIDDEN_FIELDS = [
  'password_hash',
  'two_factor_secret',
  'mfa_secret',
  'backup_codes',
  'email_verification_token',
  'email_verification_expires',
  'password_reset_token',
  'password_reset_expires',
];

/**
 * HIGH RISK FORBIDDEN FIELDS - Security/tracking data
 */
const HIGH_RISK_FORBIDDEN_FIELDS = [
  'failed_login_attempts',
  'locked_until',
  'last_login_ip',
  'last_login_device',
  'stripe_connect_account_id',
  'stripe_customer_id',
  'stripe_connect_status',
  'stripe_connect_charges_enabled',
  'stripe_connect_payouts_enabled',
];

/**
 * MEDIUM RISK FORBIDDEN FIELDS - Internal/financial data
 */
const MEDIUM_RISK_FORBIDDEN_FIELDS = [
  'deleted_at',
  'lifetime_value',
  'total_spent',
  'loyalty_points',
  'referral_code',
  'referred_by',
  'referral_count',
  'login_count',
];

/**
 * ALL FORBIDDEN FIELDS - Combined list
 */
const ALL_FORBIDDEN_FIELDS = [
  ...CRITICAL_FORBIDDEN_FIELDS,
  ...HIGH_RISK_FORBIDDEN_FIELDS,
  ...MEDIUM_RISK_FORBIDDEN_FIELDS,
];

// ============================================
// TEST SETUP
// ============================================

beforeAll(async () => {
  await initAppRedis();
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  if (app) {
    await app.close();
  }
  await closeConnections();
});

beforeEach(async () => {
  await cleanupAll();
});

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Register a user and return access token + user data
 */
async function registerAndLogin(overrides: Partial<any> = {}): Promise<{
  accessToken: string;
  refreshToken: string;
  user: any;
  rawResponse: any;
}> {
  const userData = createTestUser(overrides);

  const registerResponse = await request(app.server)
    .post('/auth/register')
    .send(userData)
    .expect(201);

  return {
    accessToken: registerResponse.body.tokens.accessToken,
    refreshToken: registerResponse.body.tokens.refreshToken,
    user: registerResponse.body.user,
    rawResponse: registerResponse.body,
  };
}

/**
 * Check if an object contains any forbidden fields
 */
function assertNoForbiddenFields(obj: any, context: string): void {
  const forbiddenFound = findForbiddenFields(obj);
  if (forbiddenFound.length > 0) {
    throw new Error(
      `SECURITY VIOLATION in ${context}: Found forbidden fields: ${forbiddenFound.join(', ')}`
    );
  }
}

/**
 * Check if an object has all required safe fields
 */
function assertHasSafeFields(obj: any, context: string): void {
  const missing = findMissingSafeFields(obj);
  if (missing.length > 0) {
    throw new Error(
      `Missing required safe fields in ${context}: ${missing.join(', ')}`
    );
  }
}

/**
 * Insert a user directly into the database with ALL fields populated
 * This tests that even if a DB query returns all fields, the serializer strips them
 */
async function insertUserWithAllFields(email: string): Promise<string> {
  const bcrypt = await import('bcrypt');
  const passwordHash = await bcrypt.hash('TestPassword123!', 10);
  const timestamp = new Date().toISOString();

  const result = await testPool.query(
    `INSERT INTO users (
      email, password_hash, tenant_id, status, role,
      email_verified, mfa_enabled,
      -- Sensitive fields that should NEVER leak
      two_factor_secret, mfa_secret, backup_codes,
      email_verification_token, password_reset_token,
      failed_login_attempts, locked_until, last_login_ip,
      -- Financial/internal fields
      lifetime_value, total_spent, loyalty_points,
      referral_code, referral_count,
      stripe_connect_account_id, stripe_connect_status,
      -- Normal fields
      first_name, last_name, created_at, updated_at
    ) VALUES (
      $1, $2, $3, 'ACTIVE', 'user',
      false, false,
      'JBSWY3DPEHPK3PXP', 'JBSWY3DPEHPK3PXP', ARRAY['backup1', 'backup2'],
      'verify-token-123', 'reset-token-456',
      3, $4, '192.168.1.1',
      1234.56, 567.89, 100,
      'REF123', 5,
      'acct_1234567890', 'enabled',
      'Test', 'User', $4, $4
    ) RETURNING id`,
    [email, passwordHash, TEST_TENANT_ID, timestamp]
  );

  return result.rows[0].id;
}

// ============================================
// POSITIVE TESTS - Safe fields ARE returned
// ============================================

describe('Response Security - Positive Tests (Safe Fields)', () => {
  describe('POST /auth/register', () => {
    it('should return all expected safe fields after registration', async () => {
      const userData = createTestUser();

      const response = await request(app.server)
        .post('/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body.user).toBeDefined();
      const user = response.body.user;

      // Verify safe fields are present
      expect(user.id).toBeDefined();
      expect(user.email).toBe(userData.email.toLowerCase());
      expect(typeof user.email_verified).toBe('boolean');
      expect(typeof user.mfa_enabled).toBe('boolean');
      expect(user.role).toBeDefined();
      expect(user.tenant_id).toBe(TEST_TENANT_ID);
      expect(user.created_at).toBeDefined();
    });

    it('should return tokens after registration', async () => {
      const userData = createTestUser();

      const response = await request(app.server)
        .post('/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body.tokens).toBeDefined();
      expect(response.body.tokens.accessToken).toBeDefined();
      expect(response.body.tokens.refreshToken).toBeDefined();
    });
  });

  describe('POST /auth/login', () => {
    it('should return all expected safe fields after login', async () => {
      const { accessToken, user: registeredUser } = await registerAndLogin();

      // Login again
      const loginResponse = await request(app.server)
        .post('/auth/login')
        .send({
          email: registeredUser.email,
          password: 'TestPassword123!',
        })
        .expect(200);

      const user = loginResponse.body.user;

      // Verify safe fields are present
      expect(user.id).toBe(registeredUser.id);
      expect(user.email).toBe(registeredUser.email);
      expect(typeof user.email_verified).toBe('boolean');
      expect(typeof user.mfa_enabled).toBe('boolean');
      expect(user.role).toBeDefined();
      expect(user.tenant_id).toBe(TEST_TENANT_ID);
    });
  });

  describe('GET /auth/me', () => {
    it('should return all expected safe fields for current user', async () => {
      const { accessToken, user: registeredUser } = await registerAndLogin();

      const response = await request(app.server)
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const user = response.body.user;

      // Verify safe fields are present
      expect(user.id).toBe(registeredUser.id);
      expect(user.email).toBe(registeredUser.email);
      expect(typeof user.email_verified).toBe('boolean');
      expect(typeof user.mfa_enabled).toBe('boolean');
      expect(user.role).toBeDefined();
      expect(user.tenant_id).toBe(TEST_TENANT_ID);
      expect(user.created_at).toBeDefined();
      expect(user.updated_at).toBeDefined();
    });
  });

  describe('GET /auth/verify', () => {
    it('should return valid=true and safe user fields', async () => {
      const { accessToken, user: registeredUser } = await registerAndLogin();

      const response = await request(app.server)
        .get('/auth/verify')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.valid).toBe(true);
      expect(response.body.user).toBeDefined();

      const user = response.body.user;
      expect(user.id).toBe(registeredUser.id);
      expect(user.email).toBe(registeredUser.email);
      expect(user.tenant_id).toBe(TEST_TENANT_ID);
    });
  });
});

// ============================================
// NEGATIVE TESTS - Sensitive fields MUST NOT be returned
// ============================================

describe('Response Security - Negative Tests (Forbidden Fields)', () => {
  describe('POST /auth/register - No sensitive data leakage', () => {
    it('should NEVER return password_hash', async () => {
      const userData = createTestUser();

      const response = await request(app.server)
        .post('/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body.user.password_hash).toBeUndefined();
      expect(response.body.user.passwordHash).toBeUndefined();
    });

    it('should NEVER return any CRITICAL forbidden fields', async () => {
      const userData = createTestUser();

      const response = await request(app.server)
        .post('/auth/register')
        .send(userData)
        .expect(201);

      const user = response.body.user;

      for (const field of CRITICAL_FORBIDDEN_FIELDS) {
        expect(user[field]).toBeUndefined();
      }
    });

    it('should NEVER return any HIGH RISK forbidden fields', async () => {
      const userData = createTestUser();

      const response = await request(app.server)
        .post('/auth/register')
        .send(userData)
        .expect(201);

      const user = response.body.user;

      for (const field of HIGH_RISK_FORBIDDEN_FIELDS) {
        expect(user[field]).toBeUndefined();
      }
    });
  });

  describe('POST /auth/login - No sensitive data leakage', () => {
    it('should NEVER return password_hash after login', async () => {
      const { user: registeredUser } = await registerAndLogin();

      const loginResponse = await request(app.server)
        .post('/auth/login')
        .send({
          email: registeredUser.email,
          password: 'TestPassword123!',
        })
        .expect(200);

      expect(loginResponse.body.user.password_hash).toBeUndefined();
      expect(loginResponse.body.user.passwordHash).toBeUndefined();
    });

    it('should NEVER return MFA secrets after login', async () => {
      const { user: registeredUser } = await registerAndLogin();

      const loginResponse = await request(app.server)
        .post('/auth/login')
        .send({
          email: registeredUser.email,
          password: 'TestPassword123!',
        })
        .expect(200);

      const user = loginResponse.body.user;
      expect(user.two_factor_secret).toBeUndefined();
      expect(user.mfa_secret).toBeUndefined();
      expect(user.backup_codes).toBeUndefined();
    });

    it('should NEVER return failed_login_attempts', async () => {
      const { user: registeredUser } = await registerAndLogin();

      // Try wrong password a few times
      for (let i = 0; i < 2; i++) {
        await request(app.server)
          .post('/auth/login')
          .send({
            email: registeredUser.email,
            password: 'WrongPassword!',
          });
      }

      // Now login successfully
      const loginResponse = await request(app.server)
        .post('/auth/login')
        .send({
          email: registeredUser.email,
          password: 'TestPassword123!',
        })
        .expect(200);

      expect(loginResponse.body.user.failed_login_attempts).toBeUndefined();
      expect(loginResponse.body.user.locked_until).toBeUndefined();
    });
  });

  describe('GET /auth/me - No sensitive data leakage', () => {
    it('should NEVER return any forbidden fields', async () => {
      const { accessToken } = await registerAndLogin();

      const response = await request(app.server)
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const user = response.body.user;

      // Use the serializer's validation function
      assertNoForbiddenFields(user, 'GET /auth/me');
    });

    it('should NEVER return password_hash even if DB has it', async () => {
      // Insert user with all fields populated directly in DB
      const email = `security-test-${Date.now()}@example.com`;
      const userId = await insertUserWithAllFields(email);

      // Login to get token
      const loginResponse = await request(app.server)
        .post('/auth/login')
        .send({
          email,
          password: 'TestPassword123!',
        })
        .expect(200);

      const accessToken = loginResponse.body.tokens.accessToken;

      // Get user via /auth/me
      const meResponse = await request(app.server)
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const user = meResponse.body.user;

      // Verify NONE of the sensitive DB fields leak
      expect(user.password_hash).toBeUndefined();
      expect(user.two_factor_secret).toBeUndefined();
      expect(user.mfa_secret).toBeUndefined();
      expect(user.backup_codes).toBeUndefined();
      expect(user.email_verification_token).toBeUndefined();
      expect(user.password_reset_token).toBeUndefined();
      expect(user.failed_login_attempts).toBeUndefined();
      expect(user.locked_until).toBeUndefined();
      expect(user.last_login_ip).toBeUndefined();
      expect(user.lifetime_value).toBeUndefined();
      expect(user.total_spent).toBeUndefined();
      expect(user.loyalty_points).toBeUndefined();
      expect(user.stripe_connect_account_id).toBeUndefined();
    });
  });

  describe('GET /auth/verify - No sensitive data leakage', () => {
    it('should NEVER return any forbidden fields', async () => {
      const { accessToken } = await registerAndLogin();

      const response = await request(app.server)
        .get('/auth/verify')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const user = response.body.user;

      // Use the serializer's validation function
      assertNoForbiddenFields(user, 'GET /auth/verify');
    });

    it('should NEVER return password_hash even if DB has all fields', async () => {
      // Insert user with all fields populated directly in DB
      const email = `verify-test-${Date.now()}@example.com`;
      await insertUserWithAllFields(email);

      // Login to get token
      const loginResponse = await request(app.server)
        .post('/auth/login')
        .send({
          email,
          password: 'TestPassword123!',
        })
        .expect(200);

      const accessToken = loginResponse.body.tokens.accessToken;

      // Verify token
      const verifyResponse = await request(app.server)
        .get('/auth/verify')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const user = verifyResponse.body.user;

      // Check all critical fields are NOT present
      for (const field of CRITICAL_FORBIDDEN_FIELDS) {
        expect(user[field]).toBeUndefined();
      }
    });
  });
});

// ============================================
// COMPREHENSIVE FIELD-BY-FIELD TESTS
// ============================================

describe('Response Security - Field-by-Field Validation', () => {
  let accessToken: string;
  let testEmail: string;

  beforeEach(async () => {
    // Insert a user with ALL database fields populated
    testEmail = `fieldtest-${Date.now()}@example.com`;
    await insertUserWithAllFields(testEmail);

    // Login to get token
    const loginResponse = await request(app.server)
      .post('/auth/login')
      .send({
        email: testEmail,
        password: 'TestPassword123!',
      })
      .expect(200);

    accessToken = loginResponse.body.tokens.accessToken;
  });

  describe('GET /auth/me - Individual field checks', () => {
    // CRITICAL FIELDS
    it('should NEVER return password_hash', async () => {
      const response = await request(app.server)
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.user).not.toHaveProperty('password_hash');
    });

    it('should NEVER return two_factor_secret', async () => {
      const response = await request(app.server)
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.user).not.toHaveProperty('two_factor_secret');
    });

    it('should NEVER return mfa_secret', async () => {
      const response = await request(app.server)
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.user).not.toHaveProperty('mfa_secret');
    });

    it('should NEVER return backup_codes', async () => {
      const response = await request(app.server)
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.user).not.toHaveProperty('backup_codes');
    });

    it('should NEVER return email_verification_token', async () => {
      const response = await request(app.server)
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.user).not.toHaveProperty('email_verification_token');
    });

    it('should NEVER return password_reset_token', async () => {
      const response = await request(app.server)
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.user).not.toHaveProperty('password_reset_token');
    });

    // HIGH RISK FIELDS
    it('should NEVER return failed_login_attempts', async () => {
      const response = await request(app.server)
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.user).not.toHaveProperty('failed_login_attempts');
    });

    it('should NEVER return locked_until', async () => {
      const response = await request(app.server)
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.user).not.toHaveProperty('locked_until');
    });

    it('should NEVER return last_login_ip', async () => {
      const response = await request(app.server)
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.user).not.toHaveProperty('last_login_ip');
    });

    it('should NEVER return stripe_connect_account_id', async () => {
      const response = await request(app.server)
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.user).not.toHaveProperty('stripe_connect_account_id');
    });

    // MEDIUM RISK FIELDS
    it('should NEVER return deleted_at', async () => {
      const response = await request(app.server)
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.user).not.toHaveProperty('deleted_at');
    });

    it('should NEVER return lifetime_value', async () => {
      const response = await request(app.server)
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.user).not.toHaveProperty('lifetime_value');
    });

    it('should NEVER return total_spent', async () => {
      const response = await request(app.server)
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.user).not.toHaveProperty('total_spent');
    });

    it('should NEVER return loyalty_points', async () => {
      const response = await request(app.server)
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.user).not.toHaveProperty('loyalty_points');
    });

    it('should NEVER return referral_code', async () => {
      const response = await request(app.server)
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.user).not.toHaveProperty('referral_code');
    });
  });

  describe('POST /auth/login - Individual field checks', () => {
    it('should NEVER return password_hash after login', async () => {
      const response = await request(app.server)
        .post('/auth/login')
        .send({
          email: testEmail,
          password: 'TestPassword123!',
        })
        .expect(200);

      expect(response.body.user).not.toHaveProperty('password_hash');
    });

    it('should NEVER return mfa_secret after login', async () => {
      const response = await request(app.server)
        .post('/auth/login')
        .send({
          email: testEmail,
          password: 'TestPassword123!',
        })
        .expect(200);

      expect(response.body.user).not.toHaveProperty('mfa_secret');
    });

    it('should NEVER return stripe_connect_account_id after login', async () => {
      const response = await request(app.server)
        .post('/auth/login')
        .send({
          email: testEmail,
          password: 'TestPassword123!',
        })
        .expect(200);

      expect(response.body.user).not.toHaveProperty('stripe_connect_account_id');
    });
  });

  describe('GET /auth/verify - Individual field checks', () => {
    it('should NEVER return password_hash in verify response', async () => {
      const response = await request(app.server)
        .get('/auth/verify')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.user).not.toHaveProperty('password_hash');
    });

    it('should NEVER return mfa_secret in verify response', async () => {
      const response = await request(app.server)
        .get('/auth/verify')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.user).not.toHaveProperty('mfa_secret');
    });
  });
});

// ============================================
// SERIALIZER UNIT TESTS (In integration context)
// ============================================

describe('User Serializer - Defense in Depth', () => {
  it('should export SAFE_USER_FIELDS constant', () => {
    expect(SAFE_USER_FIELDS).toBeDefined();
    expect(Array.isArray(SAFE_USER_FIELDS)).toBe(true);
    expect(SAFE_USER_FIELDS.length).toBeGreaterThan(0);
  });

  it('should export FORBIDDEN_USER_FIELDS constant', () => {
    expect(FORBIDDEN_USER_FIELDS).toBeDefined();
    expect(Array.isArray(FORBIDDEN_USER_FIELDS)).toBe(true);
    expect(FORBIDDEN_USER_FIELDS).toContain('password_hash');
    expect(FORBIDDEN_USER_FIELDS).toContain('mfa_secret');
  });

  it('SAFE_USER_FIELDS should NOT contain any FORBIDDEN fields', () => {
    for (const safeField of SAFE_USER_FIELDS) {
      expect(FORBIDDEN_USER_FIELDS).not.toContain(safeField);
    }
  });

  it('findForbiddenFields should detect password_hash', () => {
    const obj = { id: '123', password_hash: 'hash' };
    const found = findForbiddenFields(obj);
    expect(found).toContain('password_hash');
  });

  it('findForbiddenFields should return empty for clean object', () => {
    const obj = { id: '123', email: 'test@example.com' };
    const found = findForbiddenFields(obj);
    expect(found).toHaveLength(0);
  });

  it('findMissingSafeFields should detect missing required fields', () => {
    const obj = { id: '123' }; // Missing email, email_verified, etc.
    const missing = findMissingSafeFields(obj);
    expect(missing).toContain('email');
    expect(missing).toContain('email_verified');
  });
});
