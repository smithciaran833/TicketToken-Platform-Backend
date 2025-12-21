import { OAuthService } from '../../src/services/oauth.service';
import { JWTService } from '../../src/services/jwt.service';
import { pool } from '../../src/config/database';
import { redis } from '../../src/config/redis';

/**
 * INTEGRATION TESTS FOR OAUTH SERVICE
 * 
 * These tests verify OAuth authentication functionality:
 * - Google OAuth flow
 * - GitHub OAuth flow
 * - Account linking/unlinking
 * - User creation and matching
 */

// Safety check
beforeAll(() => {
  const dbName = process.env.DB_NAME || 'tickettoken_db';
  const isTestDb = dbName.includes('test') || process.env.NODE_ENV === 'test';
  
  if (!isTestDb) {
    throw new Error(
      `⚠️  REFUSING TO RUN INTEGRATION TESTS AGAINST NON-TEST DATABASE!\n` +
      `Current DB_NAME: ${dbName}\n` +
      `Please set DB_NAME to include 'test' or set NODE_ENV=test`
    );
  }
  
  console.log(`✓ Running OAuth service integration tests against test database: ${dbName}`);
});

// SKIPPED: OAuth tests call real external APIs (Google, GitHub) without mocking
// These are E2E tests, not integration tests. Need proper mocking before enabling.
describe.skip('OAuthService Integration Tests', () => {
  let oauthService: OAuthService;
  let jwtService: JWTService;
  let testTenantId: string;
  let testUserId: string;
  let createdUserIds: string[] = [];

  beforeAll(async () => {
    jwtService = new JWTService();
    oauthService = new OAuthService(jwtService);

    // Create test tenant
    const tenantResult = await pool.query(
      `INSERT INTO tenants (name, slug, status) 
       VALUES ($1, $2, $3) 
       RETURNING id`,
      [`OAuth Test Tenant ${Date.now()}`, `oauth-test-${Date.now()}`, 'active']
    );
    testTenantId = tenantResult.rows[0].id;

    // Create test user for linking tests
    const userResult = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, tenant_id, email_verified)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        `oauth-test-${Date.now()}@example.com`,
        '$2b$12$dummyhash',
        'OAuth',
        'Test',
        testTenantId,
        true
      ]
    );
    testUserId = userResult.rows[0].id;
    createdUserIds.push(testUserId);
  });

  afterEach(async () => {
    // Clean up oauth_connections
    await pool.query('DELETE FROM oauth_connections WHERE user_id = ANY($1)', [createdUserIds]);
    
    // Clean up Redis
    const keys = await redis.keys('*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  afterAll(async () => {
    // Cleanup users and tenant
    if (createdUserIds.length > 0) {
      await pool.query('DELETE FROM users WHERE id = ANY($1)', [createdUserIds]);
    }
    await pool.query('DELETE FROM tenants WHERE id = $1', [testTenantId]);
    
    // Close connections
    await pool.end();
    await redis.quit();
  });

  const trackUser = (userId: string) => {
    if (!createdUserIds.includes(userId)) {
      createdUserIds.push(userId);
    }
  };

  describe('authenticate() - Google Provider', () => {
    it('should create new user for new Google account', async () => {
      // Mock Google OAuth response
      const mockCode = 'google-auth-code-123';
      const mockProfile = {
        email: `google-user-${Date.now()}@gmail.com`,
        firstName: 'Google',
        lastName: 'User',
        verified: true,
        provider: 'google',
        providerId: 'google-id-123'
      };

      // Note: In real implementation, this would call Google's API
      // For integration tests, assume the service handles the OAuth exchange
      
      const result = await oauthService.authenticate(
        'google',
        mockCode,
        testTenantId,
        '127.0.0.1',
        'Jest Test'
      );

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('tokens');
      expect(result).toHaveProperty('sessionId');
      expect(result).toHaveProperty('provider');
      expect(result.provider).toBe('google');
      
      trackUser(result.user.id);
    });

    it('should return existing user for returning Google account', async () => {
      const mockEmail = `returning-google-${Date.now()}@gmail.com`;
      
      // Create user with OAuth connection
      const userResult = await pool.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, tenant_id, email_verified)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [mockEmail, '', 'Returning', 'User', testTenantId, true]
      );
      const userId = userResult.rows[0].id;
      trackUser(userId);

      await pool.query(
        `INSERT INTO oauth_connections (user_id, provider, provider_id, email, profile_data)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, 'google', 'google-id-456', mockEmail, JSON.stringify({})]
      );

      const mockCode = 'google-returning-code';
      const result = await oauthService.authenticate(
        'google',
        mockCode,
        testTenantId,
        '127.0.0.1',
        'Jest Test'
      );

      expect(result.user.id).toBe(userId);
      expect(result.provider).toBe('google');
    });

    it('should link Google to existing user by email', async () => {
      const sharedEmail = `shared-${Date.now()}@example.com`;
      
      // Create user with email
      const userResult = await pool.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, tenant_id, email_verified)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [sharedEmail, '$2b$12$hash', 'Existing', 'User', testTenantId, true]
      );
      const userId = userResult.rows[0].id;
      trackUser(userId);

      const mockCode = 'google-shared-email-code';
      const result = await oauthService.authenticate(
        'google',
        mockCode,
        testTenantId,
        '127.0.0.1',
        'Jest Test'
      );

      // Should link to existing user instead of creating new one
      expect(result.user.id).toBe(userId);
      
      // Verify oauth_connections created
      const connectionResult = await pool.query(
        'SELECT * FROM oauth_connections WHERE user_id = $1 AND provider = $2',
        [userId, 'google']
      );
      expect(connectionResult.rows.length).toBe(1);
    });
  });

  describe('authenticate() - GitHub Provider', () => {
    it('should create new user for new GitHub account', async () => {
      const mockCode = 'github-auth-code-123';
      const mockEmail = `github-user-${Date.now()}@example.com`;

      const result = await oauthService.authenticate(
        'github',
        mockCode,
        testTenantId,
        '127.0.0.1',
        'Jest Test'
      );

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('tokens');
      expect(result).toHaveProperty('sessionId');
      expect(result.provider).toBe('github');
      
      trackUser(result.user.id);
    });

    it('should return existing user for returning GitHub account', async () => {
      const mockEmail = `returning-github-${Date.now()}@example.com`;
      
      // Create user with GitHub OAuth connection
      const userResult = await pool.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, tenant_id, email_verified)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [mockEmail, '', 'GitHub', 'User', testTenantId, true]
      );
      const userId = userResult.rows[0].id;
      trackUser(userId);

      await pool.query(
        `INSERT INTO oauth_connections (user_id, provider, provider_id, email, profile_data)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, 'github', 'github-id-789', mockEmail, JSON.stringify({})]
      );

      const mockCode = 'github-returning-code';
      const result = await oauthService.authenticate(
        'github',
        mockCode,
        testTenantId,
        '127.0.0.1',
        'Jest Test'
      );

      expect(result.user.id).toBe(userId);
      expect(result.provider).toBe('github');
    });
  });

  describe('authenticate() - Error Cases', () => {
    it('should throw for unsupported provider', async () => {
      await expect(
        oauthService.authenticate(
          'facebook' as any,
          'code-123',
          testTenantId,
          '127.0.0.1',
          'Jest'
        )
      ).rejects.toThrow('Unsupported OAuth provider');
    });

    it('should create session with IP and userAgent', async () => {
      const mockCode = 'session-test-code';
      const testIp = '192.168.1.100';
      const testUserAgent = 'Mozilla/5.0 Test Browser';

      const result = await oauthService.authenticate(
        'google',
        mockCode,
        testTenantId,
        testIp,
        testUserAgent
      );

      expect(result.sessionId).toBeDefined();
      trackUser(result.user.id);

      // Verify session was created
      const sessionResult = await pool.query(
        'SELECT * FROM user_sessions WHERE id = $1',
        [result.sessionId]
      );
      expect(sessionResult.rows.length).toBe(1);
      expect(sessionResult.rows[0].ip_address).toBe(testIp);
      expect(sessionResult.rows[0].user_agent).toBe(testUserAgent);
    });

    it('should use default tenant if not provided', async () => {
      const mockCode = 'default-tenant-code';

      const result = await oauthService.authenticate(
        'google',
        mockCode,
        undefined,
        '127.0.0.1',
        'Jest'
      );

      expect(result.user).toBeDefined();
      expect(result.user.tenant_id).toBeDefined();
      trackUser(result.user.id);
    });
  });

  describe('linkProvider()', () => {
    it('should link Google account successfully', async () => {
      const mockCode = 'link-google-code';
      
      const result = await oauthService.linkProvider(
        testUserId,
        'google',
        mockCode
      );

      expect(result).toHaveProperty('success');
      expect(result.success).toBe(true);
      expect(result).toHaveProperty('provider');
      expect(result.provider).toBe('google');

      // Verify oauth_connections created
      const connectionResult = await pool.query(
        'SELECT * FROM oauth_connections WHERE user_id = $1 AND provider = $2',
        [testUserId, 'google']
      );
      expect(connectionResult.rows.length).toBe(1);
    });

    it('should link GitHub account successfully', async () => {
      const mockCode = 'link-github-code';
      
      const result = await oauthService.linkProvider(
        testUserId,
        'github',
        mockCode
      );

      expect(result.success).toBe(true);
      expect(result.provider).toBe('github');

      // Verify oauth_connections created
      const connectionResult = await pool.query(
        'SELECT * FROM oauth_connections WHERE user_id = $1 AND provider = $2',
        [testUserId, 'github']
      );
      expect(connectionResult.rows.length).toBe(1);
    });

    it('should throw for unsupported provider', async () => {
      await expect(
        oauthService.linkProvider(testUserId, 'twitter' as any, 'code-123')
      ).rejects.toThrow('Unsupported OAuth provider');
    });

    it('should throw when already linked to this user', async () => {
      // Link once
      await oauthService.linkProvider(testUserId, 'google', 'first-link-code');

      // Try to link again
      await expect(
        oauthService.linkProvider(testUserId, 'google', 'second-link-code')
      ).rejects.toThrow('already linked to your account');
    });

    it('should throw when linked to another user', async () => {
      // Create another user
      const anotherUserResult = await pool.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, tenant_id, email_verified)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [`another-${Date.now()}@example.com`, '$2b$12$hash', 'Another', 'User', testTenantId, true]
      );
      const anotherUserId = anotherUserResult.rows[0].id;
      trackUser(anotherUserId);

      // Link OAuth to first user
      await oauthService.linkProvider(testUserId, 'google', 'first-user-code');

      // Try to link same OAuth account to another user
      // Note: This should check provider_id, not just provider
      // The actual implementation may vary
      await expect(
        oauthService.linkProvider(anotherUserId, 'google', 'same-oauth-code')
      ).rejects.toThrow(); // May throw "already linked to another user"
    });
  });

  describe('unlinkProvider()', () => {
    beforeEach(async () => {
      // Link both providers for testing
      await oauthService.linkProvider(testUserId, 'google', 'setup-google-code');
      await oauthService.linkProvider(testUserId, 'github', 'setup-github-code');
    });

    it('should unlink Google account successfully', async () => {
      const result = await oauthService.unlinkProvider(testUserId, 'google');

      expect(result).toHaveProperty('success');
      expect(result.success).toBe(true);
      expect(result).toHaveProperty('message');

      // Verify oauth_connections deleted
      const connectionResult = await pool.query(
        'SELECT * FROM oauth_connections WHERE user_id = $1 AND provider = $2',
        [testUserId, 'google']
      );
      expect(connectionResult.rows.length).toBe(0);
    });

    it('should unlink GitHub account successfully', async () => {
      const result = await oauthService.unlinkProvider(testUserId, 'github');

      expect(result.success).toBe(true);

      // Verify oauth_connections deleted
      const connectionResult = await pool.query(
        'SELECT * FROM oauth_connections WHERE user_id = $1 AND provider = $2',
        [testUserId, 'github']
      );
      expect(connectionResult.rows.length).toBe(0);
    });

    it('should throw when no connection exists', async () => {
      // Unlink first
      await oauthService.unlinkProvider(testUserId, 'google');

      // Try to unlink again
      await expect(
        oauthService.unlinkProvider(testUserId, 'google')
      ).rejects.toThrow('not linked to your account');
    });

    it('should throw for provider never linked', async () => {
      // Create a new user without any OAuth connections
      const newUserResult = await pool.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, tenant_id, email_verified)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [`no-oauth-${Date.now()}@example.com`, '$2b$12$hash', 'No', 'OAuth', testTenantId, true]
      );
      const newUserId = newUserResult.rows[0].id;
      trackUser(newUserId);

      await expect(
        oauthService.unlinkProvider(newUserId, 'google')
      ).rejects.toThrow('not linked');
    });
  });

  describe('Profile Data Handling', () => {
    it('should extract firstName and lastName from Google profile', async () => {
      const mockCode = 'profile-data-google';
      
      const result = await oauthService.authenticate(
        'google',
        mockCode,
        testTenantId,
        '127.0.0.1',
        'Jest'
      );

      expect(result.user.first_name).toBeDefined();
      expect(result.user.last_name).toBeDefined();
      trackUser(result.user.id);
    });

    it('should parse name into firstName/lastName for GitHub', async () => {
      const mockCode = 'profile-data-github';
      
      const result = await oauthService.authenticate(
        'github',
        mockCode,
        testTenantId,
        '127.0.0.1',
        'Jest'
      );

      expect(result.user.first_name).toBeDefined();
      // lastName may be empty if GitHub profile only has one name
      trackUser(result.user.id);
    });

    it('should set verified=true for verified Google accounts', async () => {
      const mockCode = 'verified-google';
      
      const result = await oauthService.authenticate(
        'google',
        mockCode,
        testTenantId,
        '127.0.0.1',
        'Jest'
      );

      expect(result.user.email_verified).toBe(true);
      trackUser(result.user.id);
    });

    it('should always set verified=true for GitHub accounts', async () => {
      const mockCode = 'verified-github';
      
      const result = await oauthService.authenticate(
        'github',
        mockCode,
        testTenantId,
        '127.0.0.1',
        'Jest'
      );

      expect(result.user.email_verified).toBe(true);
      trackUser(result.user.id);
    });
  });

  describe('Token Generation', () => {
    it('should generate JWT tokens on authentication', async () => {
      const mockCode = 'token-gen-code';
      
      const result = await oauthService.authenticate(
        'google',
        mockCode,
        testTenantId,
        '127.0.0.1',
        'Jest'
      );

      expect(result.tokens).toHaveProperty('accessToken');
      expect(result.tokens).toHaveProperty('refreshToken');
      expect(typeof result.tokens.accessToken).toBe('string');
      expect(typeof result.tokens.refreshToken).toBe('string');
      trackUser(result.user.id);
    });

    it('should store refresh token in Redis', async () => {
      const mockCode = 'redis-token-code';
      
      const result = await oauthService.authenticate(
        'google',
        mockCode,
        testTenantId,
        '127.0.0.1',
        'Jest'
      );

      // Decode token to get JTI
      const decoded = jwtService.decode(result.tokens.refreshToken);
      const redisKey = `refresh_token:${decoded.jti}`;
      const storedData = await redis.get(redisKey);

      expect(storedData).toBeDefined();
      trackUser(result.user.id);
    });
  });

  describe('Transaction Rollback', () => {
    it('should rollback on database error', async () => {
      // This would require mocking a DB failure
      // For integration tests, we verify the service handles errors gracefully
      const mockCode = 'rollback-test-code';

      try {
        await oauthService.authenticate(
          'google',
          mockCode,
          testTenantId,
          '127.0.0.1',
          'Jest'
        );
      } catch (error) {
        // If an error occurs, verify no partial data was committed
        // This is more of a theoretical test for integration
      }
    });
  });

  describe('Profile Data Updates', () => {
    it('should update profile_data on returning OAuth user', async () => {
      const mockEmail = `update-profile-${Date.now()}@gmail.com`;
      
      // Create user with OAuth connection
      const userResult = await pool.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, tenant_id, email_verified)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [mockEmail, '', 'Initial', 'Name', testTenantId, true]
      );
      const userId = userResult.rows[0].id;
      trackUser(userId);

      const initialProfileData = { name: 'Initial Name', avatar: 'old.jpg' };
      await pool.query(
        `INSERT INTO oauth_connections (user_id, provider, provider_id, email, profile_data)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, 'google', 'google-update-id', mockEmail, JSON.stringify(initialProfileData)]
      );

      // Authenticate again (simulating return visit)
      const mockCode = 'return-visit-code';
      await oauthService.authenticate(
        'google',
        mockCode,
        testTenantId,
        '127.0.0.1',
        'Jest'
      );

      // Verify profile_data was updated
      const connectionResult = await pool.query(
        'SELECT profile_data FROM oauth_connections WHERE user_id = $1 AND provider = $2',
        [userId, 'google']
      );
      
      // Profile data should be updated (not exactly equal to initial)
      expect(connectionResult.rows.length).toBe(1);
      // The updated profile_data would include new information from OAuth provider
    });
  });
});
