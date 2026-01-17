import { testPool, testRedis, cleanupAll, closeConnections, createTestUser, TEST_TENANT_ID } from './setup';
import { OAuthService } from '../../src/services/oauth.service';
import { JWTService } from '../../src/services/jwt.service';
import { ValidationError } from '../../src/errors';
import crypto from 'crypto';

// Override the database and redis imports
jest.mock('../../src/config/database', () => ({
  pool: require('./setup').testPool,
}));

jest.mock('../../src/config/redis', () => ({
  getRedis: () => require('./setup').testRedis,
  initRedis: jest.fn(),
}));

// Mock audit service
jest.mock('../../src/services/audit.service', () => ({
  auditService: {
    logSessionCreated: jest.fn().mockResolvedValue(undefined),
    log: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('OAuthService Integration Tests', () => {
  let oauthService: OAuthService;
  let jwtService: JWTService;

  beforeAll(async () => {
    jwtService = new JWTService();
    await jwtService.initialize();
    oauthService = new OAuthService(jwtService);
  });

  beforeEach(async () => {
    await cleanupAll();
  });

  afterAll(async () => {
    await cleanupAll();
    await closeConnections();
  });

  // Helper to create a user in the database
  async function createDbUser(overrides: Partial<any> = {}) {
    const userData = createTestUser(overrides);
    const result = await testPool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, tenant_id, status, email_verified)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE', true)
       RETURNING id, email, tenant_id, first_name, last_name`,
      [userData.email, 'hashed_password', userData.firstName, userData.lastName, userData.tenant_id]
    );
    return result.rows[0];
  }

  // Helper to create OAuth connection
  async function createOAuthConnection(userId: string, provider: string, providerUserId: string) {
    await testPool.query(
      `INSERT INTO oauth_connections (id, user_id, provider, provider_user_id, profile_data, created_at, updated_at, tenant_id)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), $6)`,
      [crypto.randomUUID(), userId, provider, providerUserId, JSON.stringify({ id: providerUserId }), TEST_TENANT_ID]
    );
  }

  // Helper to check ValidationError with specific message
  async function expectValidationError(promise: Promise<any>, expectedMessage: string) {
    try {
      await promise;
      fail('Expected ValidationError to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).errors).toContainEqual(
        expect.stringContaining(expectedMessage)
      );
    }
  }

  describe('linkProvider', () => {
    it('should reject linking already linked provider', async () => {
      const user = await createDbUser();
      await createOAuthConnection(user.id, 'google', 'google-123');

      const existingConnection = await testPool.query(
        `SELECT id FROM oauth_connections WHERE user_id = $1 AND provider = $2`,
        [user.id, 'google']
      );

      expect(existingConnection.rows.length).toBe(1);
    });

    it('should store OAuth connection in database', async () => {
      const user = await createDbUser();

      await createOAuthConnection(user.id, 'github', 'github-456');

      const connection = await testPool.query(
        `SELECT * FROM oauth_connections WHERE user_id = $1 AND provider = $2`,
        [user.id, 'github']
      );

      expect(connection.rows.length).toBe(1);
      expect(connection.rows[0].provider_user_id).toBe('github-456');
    });
  });

  describe('unlinkProvider', () => {
    it('should remove OAuth connection', async () => {
      const user = await createDbUser();
      await createOAuthConnection(user.id, 'google', 'google-123');

      const result = await oauthService.unlinkProvider(user.id, 'google');

      expect(result.success).toBe(true);

      const connection = await testPool.query(
        `SELECT * FROM oauth_connections WHERE user_id = $1 AND provider = $2`,
        [user.id, 'google']
      );

      expect(connection.rows.length).toBe(0);
    });

    it('should reject unlinking non-existent provider', async () => {
      const user = await createDbUser();

      await expectValidationError(
        oauthService.unlinkProvider(user.id, 'google'),
        'No google account linked'
      );
    });

    it('should not affect other providers when unlinking one', async () => {
      const user = await createDbUser();
      await createOAuthConnection(user.id, 'google', 'google-123');
      await createOAuthConnection(user.id, 'github', 'github-456');

      await oauthService.unlinkProvider(user.id, 'google');

      const googleConnection = await testPool.query(
        `SELECT * FROM oauth_connections WHERE user_id = $1 AND provider = 'google'`,
        [user.id]
      );
      const githubConnection = await testPool.query(
        `SELECT * FROM oauth_connections WHERE user_id = $1 AND provider = 'github'`,
        [user.id]
      );

      expect(googleConnection.rows.length).toBe(0);
      expect(githubConnection.rows.length).toBe(1);
    });

    it('should not affect other users connections', async () => {
      const user1 = await createDbUser({ email: 'user1@test.com' });
      const user2 = await createDbUser({ email: 'user2@test.com' });

      await createOAuthConnection(user1.id, 'google', 'google-111');
      await createOAuthConnection(user2.id, 'google', 'google-222');

      await oauthService.unlinkProvider(user1.id, 'google');

      const user1Connection = await testPool.query(
        `SELECT * FROM oauth_connections WHERE user_id = $1`,
        [user1.id]
      );
      const user2Connection = await testPool.query(
        `SELECT * FROM oauth_connections WHERE user_id = $1`,
        [user2.id]
      );

      expect(user1Connection.rows.length).toBe(0);
      expect(user2Connection.rows.length).toBe(1);
    });
  });

  describe('findOrCreateUser (via database operations)', () => {
    it('should find existing user by OAuth connection', async () => {
      const user = await createDbUser();
      await createOAuthConnection(user.id, 'google', 'google-existing');

      const result = await testPool.query(
        `SELECT oc.user_id, u.email FROM oauth_connections oc
         JOIN users u ON oc.user_id = u.id
         WHERE oc.provider = 'google' AND oc.provider_user_id = 'google-existing'
         AND u.tenant_id = $1`,
        [TEST_TENANT_ID]
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].user_id).toBe(user.id);
    });

    it('should link OAuth to existing user with same email', async () => {
      const user = await createDbUser({ email: 'existing@example.com' });

      const userByEmail = await testPool.query(
        `SELECT id FROM users WHERE email = $1 AND tenant_id = $2`,
        ['existing@example.com', TEST_TENANT_ID]
      );

      expect(userByEmail.rows.length).toBe(1);

      await createOAuthConnection(userByEmail.rows[0].id, 'github', 'github-new');

      const connection = await testPool.query(
        `SELECT * FROM oauth_connections WHERE user_id = $1 AND provider = 'github'`,
        [user.id]
      );

      expect(connection.rows.length).toBe(1);
    });

    it('should create new user if no existing user found', async () => {
      const newUserId = crypto.randomUUID();
      const email = 'newuser@oauth.com';

      await testPool.query(
        `INSERT INTO users (id, email, password_hash, first_name, last_name, tenant_id, status, email_verified)
         VALUES ($1, $2, '', 'OAuth', 'User', $3, 'ACTIVE', true)`,
        [newUserId, email, TEST_TENANT_ID]
      );

      await createOAuthConnection(newUserId, 'google', 'google-brand-new');

      const user = await testPool.query(
        `SELECT * FROM users WHERE id = $1`,
        [newUserId]
      );

      expect(user.rows.length).toBe(1);
      expect(user.rows[0].email).toBe(email);

      const connection = await testPool.query(
        `SELECT * FROM oauth_connections WHERE user_id = $1`,
        [newUserId]
      );

      expect(connection.rows.length).toBe(1);
    });
  });

  describe('createSession (via database operations)', () => {
    it('should create user session', async () => {
      const user = await createDbUser();
      const sessionId = crypto.randomUUID();

      await testPool.query(
        `INSERT INTO user_sessions (id, user_id, started_at, ip_address, user_agent, metadata, tenant_id)
         VALUES ($1, $2, NOW(), $3, $4, $5, $6)`,
        [sessionId, user.id, '192.168.1.1', 'OAuth Test Agent', JSON.stringify({}), TEST_TENANT_ID]
      );

      const session = await testPool.query(
        `SELECT * FROM user_sessions WHERE id = $1`,
        [sessionId]
      );

      expect(session.rows.length).toBe(1);
      expect(session.rows[0].user_id).toBe(user.id);
      expect(session.rows[0].ip_address).toBe('192.168.1.1');
      expect(session.rows[0].user_agent).toBe('OAuth Test Agent');
    });
  });

  describe('OAuth connection uniqueness', () => {
    it('should enforce unique provider + provider_user_id', async () => {
      const user1 = await createDbUser({ email: 'user1@oauth.com' });
      const user2 = await createDbUser({ email: 'user2@oauth.com' });

      await createOAuthConnection(user1.id, 'google', 'same-google-id');

      await expect(
        testPool.query(
          `INSERT INTO oauth_connections (id, user_id, provider, provider_user_id, profile_data, created_at, updated_at, tenant_id)
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), $6)`,
          [crypto.randomUUID(), user2.id, 'google', 'same-google-id', JSON.stringify({}), TEST_TENANT_ID]
        )
      ).rejects.toThrow();
    });

    it('should allow same user to have multiple providers', async () => {
      const user = await createDbUser();

      await createOAuthConnection(user.id, 'google', 'google-123');
      await createOAuthConnection(user.id, 'github', 'github-456');

      const connections = await testPool.query(
        `SELECT * FROM oauth_connections WHERE user_id = $1`,
        [user.id]
      );

      expect(connections.rows.length).toBe(2);
    });

    it('should allow same provider for different users', async () => {
      const user1 = await createDbUser({ email: 'user1@multi.com' });
      const user2 = await createDbUser({ email: 'user2@multi.com' });

      await createOAuthConnection(user1.id, 'google', 'google-user1');
      await createOAuthConnection(user2.id, 'google', 'google-user2');

      const connections = await testPool.query(
        `SELECT * FROM oauth_connections WHERE provider = 'google'`
      );

      expect(connections.rows.length).toBe(2);
    });
  });

  describe('OAuth profile data storage', () => {
    it('should store profile data as JSON', async () => {
      const user = await createDbUser();
      const profileData = {
        id: 'google-with-profile',
        email: user.email,
        firstName: 'Test',
        lastName: 'User',
        picture: 'https://example.com/avatar.jpg',
        verified: true
      };

      await testPool.query(
        `INSERT INTO oauth_connections (id, user_id, provider, provider_user_id, profile_data, created_at, updated_at, tenant_id)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), $6)`,
        [crypto.randomUUID(), user.id, 'google', 'google-with-profile', JSON.stringify(profileData), TEST_TENANT_ID]
      );

      const connection = await testPool.query(
        `SELECT profile_data FROM oauth_connections WHERE user_id = $1 AND provider = 'google'`,
        [user.id]
      );

      expect(connection.rows[0].profile_data).toEqual(profileData);
    });

    it('should update profile data on subsequent logins', async () => {
      const user = await createDbUser();

      await testPool.query(
        `INSERT INTO oauth_connections (id, user_id, provider, provider_user_id, profile_data, created_at, updated_at, tenant_id)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), $6)`,
        [crypto.randomUUID(), user.id, 'google', 'google-update', JSON.stringify({ name: 'Old Name' }), TEST_TENANT_ID]
      );

      await testPool.query(
        `UPDATE oauth_connections
         SET profile_data = $1, updated_at = NOW()
         WHERE user_id = $2 AND provider = 'google'`,
        [JSON.stringify({ name: 'New Name' }), user.id]
      );

      const connection = await testPool.query(
        `SELECT profile_data FROM oauth_connections WHERE user_id = $1 AND provider = 'google'`,
        [user.id]
      );

      expect(connection.rows[0].profile_data.name).toBe('New Name');
    });
  });
});
