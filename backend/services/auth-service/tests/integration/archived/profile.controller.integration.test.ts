import { testPool, testRedis, cleanupAll, closeConnections, createTestUser, TEST_TENANT_ID } from './setup';
import { ProfileController } from '../../src/controllers/profile.controller';
import bcrypt from 'bcrypt';

// Override the database import to use test instance
jest.mock('../../src/config/database', () => ({
  pool: require('./setup').testPool,
  db: require('knex')({
    client: 'pg',
    connection: {
      host: process.env.TEST_DB_HOST || 'localhost',
      port: parseInt(process.env.TEST_DB_PORT || '5432'),
      database: process.env.TEST_DB_NAME || 'tickettoken_test',
      user: process.env.TEST_DB_USER || 'postgres',
      password: process.env.TEST_DB_PASSWORD || 'postgres',
    },
  }),
}));

jest.mock('../../src/config/redis', () => ({
  getRedis: () => require('./setup').testRedis,
  initRedis: jest.fn(),
}));

// Mock cache fallback service to simplify tests
jest.mock('../../src/services/cache-fallback.service', () => ({
  cacheFallbackService: {
    withFallback: jest.fn().mockImplementation(async (_name, dbOp, _cacheOp, _userId) => {
      const data = await dbOp();
      return { data, fromCache: false };
    }),
    cacheUserProfile: jest.fn().mockResolvedValue(undefined),
    getCachedUserProfile: jest.fn().mockResolvedValue(null),
    invalidateUserCache: jest.fn().mockResolvedValue(undefined),
    getCacheAge: jest.fn().mockReturnValue(0),
  },
}));

// Mock audit service
jest.mock('../../src/services/audit.service', () => ({
  auditService: {
    log: jest.fn().mockResolvedValue(undefined),
    logDataExport: jest.fn().mockResolvedValue(undefined),
  },
}));

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('ProfileController Integration Tests', () => {
  let profileController: ProfileController;

  beforeAll(async () => {
    profileController = new ProfileController();
  });

  beforeEach(async () => {
    await cleanupAll();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await cleanupAll();
    await closeConnections();
  });

  // Helper to create a user in the database
  async function createDbUser(overrides: Partial<any> = {}) {
    const userData = createTestUser(overrides);
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    const result = await testPool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, tenant_id, status, email_verified, phone, marketing_consent)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE', true, $6, $7)
       RETURNING id, email, tenant_id, first_name, last_name, phone`,
      [
        userData.email,
        hashedPassword,
        userData.firstName,
        userData.lastName,
        userData.tenant_id,
        overrides.phone || null,
        overrides.marketing_consent || false,
      ]
    );
    return { ...result.rows[0], password: userData.password };
  }

  // Helper to create mock request
  function createMockRequest(user: any, overrides: Partial<any> = {}) {
    return {
      user: {
        id: user.id,
        tenant_id: user.tenant_id,
        ...overrides.user,
      },
      body: overrides.body || {},
      params: overrides.params || {},
      ip: overrides.ip || '10.0.0.1',
      headers: {
        'user-agent': 'Jest Test Agent',
        ...overrides.headers,
      },
      log: {
        error: jest.fn(),
        info: jest.fn(),
      },
      ...overrides,
    };
  }

  // Helper to create mock reply
  function createMockReply() {
    const reply: any = {
      statusCode: 200,
      body: null,
      headers: {},
      status: jest.fn().mockImplementation((code) => {
        reply.statusCode = code;
        return reply;
      }),
      send: jest.fn().mockImplementation((body) => {
        reply.body = body;
        return reply;
      }),
      header: jest.fn().mockImplementation((key, value) => {
        reply.headers[key] = value;
        return reply;
      }),
    };
    return reply;
  }

  describe('getProfile', () => {
    it('should return user profile', async () => {
      const user = await createDbUser({ phone: '+1234567890' });

      const request = createMockRequest(user);
      const reply = createMockReply();

      await profileController.getProfile(request as any, reply as any);

      expect(reply.body.success).toBe(true);
      expect(reply.body.user).toBeDefined();
      expect(reply.body.user.email).toBe(user.email);
      expect(reply.body.user.first_name).toBe(user.first_name);
    });

    it('should return 404 for non-existent user', async () => {
      const user = await createDbUser();

      const request = createMockRequest(user, {
        user: { id: '00000000-0000-0000-0000-000000000099' },
      });
      const reply = createMockReply();

      await profileController.getProfile(request as any, reply as any);

      expect(reply.statusCode).toBe(404);
      expect(reply.body.code).toBe('USER_NOT_FOUND');
    });

    it('should filter by tenant', async () => {
      const user = await createDbUser();

      const request = createMockRequest(user, {
        user: { tenant_id: '00000000-0000-0000-0000-000000000099' },
      });
      const reply = createMockReply();

      await profileController.getProfile(request as any, reply as any);

      expect(reply.statusCode).toBe(404);
    });

    it('should not return deleted user', async () => {
      const user = await createDbUser();

      // Soft delete the user
      await testPool.query(
        'UPDATE users SET deleted_at = NOW() WHERE id = $1',
        [user.id]
      );

      const request = createMockRequest(user);
      const reply = createMockReply();

      await profileController.getProfile(request as any, reply as any);

      expect(reply.statusCode).toBe(404);
    });
  });

  describe('updateProfile', () => {
    it('should update allowed fields', async () => {
      const user = await createDbUser();

      const request = createMockRequest(user, {
        body: {
          firstName: 'Updated',
          lastName: 'Name',
          phone: '+9876543210',
        },
      });
      const reply = createMockReply();

      await profileController.updateProfile(request as any, reply as any);

      expect(reply.body.success).toBe(true);

      // Verify in DB
      const result = await testPool.query(
        'SELECT first_name, last_name, phone FROM users WHERE id = $1',
        [user.id]
      );
      expect(result.rows[0].first_name).toBe('Updated');
      expect(result.rows[0].last_name).toBe('Name');
      expect(result.rows[0].phone).toBe('+9876543210');
    });

    it('should sanitize HTML from name fields', async () => {
      const user = await createDbUser();

      const request = createMockRequest(user, {
        body: {
          firstName: '<script>alert("xss")</script>John',
        },
      });
      const reply = createMockReply();

      await profileController.updateProfile(request as any, reply as any);

      const result = await testPool.query(
        'SELECT first_name FROM users WHERE id = $1',
        [user.id]
      );
      expect(result.rows[0].first_name).not.toContain('<script>');
    });

    it('should lowercase email and unverify', async () => {
      const user = await createDbUser();

      const request = createMockRequest(user, {
        body: {
          email: 'NEW.EMAIL@EXAMPLE.COM',
        },
      });
      const reply = createMockReply();

      await profileController.updateProfile(request as any, reply as any);

      const result = await testPool.query(
        'SELECT email, email_verified FROM users WHERE id = $1',
        [user.id]
      );
      expect(result.rows[0].email).toBe('new.email@example.com');
      expect(result.rows[0].email_verified).toBe(false);
    });

    it('should return 422 for empty update', async () => {
      const user = await createDbUser();

      const request = createMockRequest(user, {
        body: {},
      });
      const reply = createMockReply();

      await profileController.updateProfile(request as any, reply as any);

      expect(reply.statusCode).toBe(422);
      expect(reply.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('exportData', () => {
    it('should export all user data', async () => {
      const user = await createDbUser();

      // Create some related data
      await testPool.query(
        `INSERT INTO user_sessions (tenant_id, user_id, ip_address, user_agent, started_at)
         VALUES ($1, $2, '1.2.3.4', 'Browser', NOW())`,
        [TEST_TENANT_ID, user.id]
      );

      await testPool.query(
        `INSERT INTO user_addresses (tenant_id, user_id, address_type, address_line1, city, postal_code, country_code)
         VALUES ($1, $2, 'billing', '123 Main St', 'City', '12345', 'US')`,
        [TEST_TENANT_ID, user.id]
      );

      const request = createMockRequest(user);
      const reply = createMockReply();

      await profileController.exportData(request as any, reply as any);

      expect(reply.body.exportFormat).toBe('GDPR_ARTICLE_15_20');
      expect(reply.body.user).toBeDefined();
      expect(reply.body.sessions).toBeDefined();
      expect(reply.body.addresses).toBeDefined();
      expect(reply.headers['Content-Type']).toBe('application/json');
      expect(reply.headers['Content-Disposition']).toContain('attachment');
    });

    it('should return 404 for non-existent user', async () => {
      const user = await createDbUser();

      const request = createMockRequest(user, {
        user: { id: '00000000-0000-0000-0000-000000000099' },
      });
      const reply = createMockReply();

      await profileController.exportData(request as any, reply as any);

      expect(reply.statusCode).toBe(404);
    });
  });

  describe('updateConsent', () => {
    it('should update marketing consent to true', async () => {
      const user = await createDbUser({ marketing_consent: false });

      const request = createMockRequest(user, {
        body: { marketingConsent: true },
      });
      const reply = createMockReply();

      await profileController.updateConsent(request as any, reply as any);

      expect(reply.body.success).toBe(true);
      expect(reply.body.consent.marketingConsent).toBe(true);

      const result = await testPool.query(
        'SELECT marketing_consent, marketing_consent_date FROM users WHERE id = $1',
        [user.id]
      );
      expect(result.rows[0].marketing_consent).toBe(true);
      expect(result.rows[0].marketing_consent_date).not.toBeNull();
    });

    it('should update marketing consent to false', async () => {
      const user = await createDbUser({ marketing_consent: true });

      const request = createMockRequest(user, {
        body: { marketingConsent: false },
      });
      const reply = createMockReply();

      await profileController.updateConsent(request as any, reply as any);

      expect(reply.body.success).toBe(true);
      expect(reply.body.consent.marketingConsent).toBe(false);
    });

    it('should return 400 for missing consent data', async () => {
      const user = await createDbUser();

      const request = createMockRequest(user, {
        body: {},
      });
      const reply = createMockReply();

      await profileController.updateConsent(request as any, reply as any);

      expect(reply.statusCode).toBe(400);
      expect(reply.body.code).toBe('MISSING_CONSENT_DATA');
    });
  });

  describe('requestDeletion', () => {
    it('should soft delete user with correct email confirmation', async () => {
      const user = await createDbUser();

      const request = createMockRequest(user, {
        body: {
          confirmEmail: user.email,
          reason: 'No longer needed',
        },
      });
      const reply = createMockReply();

      await profileController.requestDeletion(request as any, reply as any);

      expect(reply.body.success).toBe(true);
      expect(reply.body.details.anonymizationScheduled).toBe('30 days');

      // Verify user is soft deleted
      const result = await testPool.query(
        'SELECT deleted_at, status FROM users WHERE id = $1',
        [user.id]
      );
      expect(result.rows[0].deleted_at).not.toBeNull();
      expect(result.rows[0].status).toBe('DELETED');
    });

    it('should revoke all sessions on deletion', async () => {
      const user = await createDbUser();

      // Create sessions
      await testPool.query(
        `INSERT INTO user_sessions (tenant_id, user_id, ip_address, started_at) VALUES ($1, $2, '1.1.1.1', NOW())`,
        [TEST_TENANT_ID, user.id]
      );
      await testPool.query(
        `INSERT INTO user_sessions (tenant_id, user_id, ip_address, started_at) VALUES ($1, $2, '2.2.2.2', NOW())`,
        [TEST_TENANT_ID, user.id]
      );

      const request = createMockRequest(user, {
        body: { confirmEmail: user.email },
      });
      const reply = createMockReply();

      await profileController.requestDeletion(request as any, reply as any);

      // Verify sessions are revoked
      const result = await testPool.query(
        'SELECT * FROM user_sessions WHERE user_id = $1 AND revoked_at IS NULL',
        [user.id]
      );
      expect(result.rows.length).toBe(0);
    });

    it('should return 400 for email mismatch', async () => {
      const user = await createDbUser();

      const request = createMockRequest(user, {
        body: {
          confirmEmail: 'wrong@email.com',
        },
      });
      const reply = createMockReply();

      await profileController.requestDeletion(request as any, reply as any);

      expect(reply.statusCode).toBe(400);
      expect(reply.body.code).toBe('EMAIL_MISMATCH');
    });

    it('should be case-insensitive for email confirmation', async () => {
      const user = await createDbUser();

      const request = createMockRequest(user, {
        body: {
          confirmEmail: user.email.toUpperCase(),
        },
      });
      const reply = createMockReply();

      await profileController.requestDeletion(request as any, reply as any);

      expect(reply.body.success).toBe(true);
    });

    it('should return 404 for non-existent user', async () => {
      const user = await createDbUser();

      const request = createMockRequest(user, {
        user: { id: '00000000-0000-0000-0000-000000000099' },
        body: { confirmEmail: 'any@email.com' },
      });
      const reply = createMockReply();

      await profileController.requestDeletion(request as any, reply as any);

      expect(reply.statusCode).toBe(404);
    });
  });

  describe('getConsent', () => {
    it('should return consent status', async () => {
      const user = await createDbUser({ marketing_consent: true });

      // Update with consent dates
      await testPool.query(
        `UPDATE users SET
          marketing_consent_date = NOW(),
          terms_accepted_at = NOW(),
          terms_version = '1.0',
          privacy_accepted_at = NOW(),
          privacy_version = '1.0'
         WHERE id = $1`,
        [user.id]
      );

      const request = createMockRequest(user);
      const reply = createMockReply();

      await profileController.getConsent(request as any, reply as any);

      expect(reply.body.success).toBe(true);
      expect(reply.body.consent.marketing.granted).toBe(true);
      expect(reply.body.consent.terms.version).toBe('1.0');
      expect(reply.body.consent.privacy.version).toBe('1.0');
    });

    it('should return 404 for non-existent user', async () => {
      const user = await createDbUser();

      const request = createMockRequest(user, {
        user: { id: '00000000-0000-0000-0000-000000000099' },
      });
      const reply = createMockReply();

      await profileController.getConsent(request as any, reply as any);

      expect(reply.statusCode).toBe(404);
    });
  });
});
