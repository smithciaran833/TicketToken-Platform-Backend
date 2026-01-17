import { testPool, testRedis, cleanupAll, closeConnections, createTestUser, TEST_TENANT_ID } from './setup';
import { JWTService } from '../../src/services/jwt.service';
import jwt from 'jsonwebtoken';

// Override the pool and redis imports in the services
jest.mock('../../src/config/database', () => ({
  pool: require('./setup').testPool,
}));

jest.mock('../../src/config/redis', () => ({
  getRedis: () => require('./setup').testRedis,
  initRedis: jest.fn(),
}));

describe('JWTService Integration Tests', () => {
  let jwtService: JWTService;

  beforeAll(async () => {
    jwtService = new JWTService();
    await jwtService.initialize();
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
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE', false)
       RETURNING id, email, tenant_id, permissions, role`,
      [userData.email, 'hashed_password', userData.firstName, userData.lastName, userData.tenant_id]
    );
    return result.rows[0];
  }

  describe('generateTokenPair', () => {
    it('should generate access and refresh tokens', async () => {
      const user = await createDbUser();

      const tokens = await jwtService.generateTokenPair(user);

      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();
      expect(typeof tokens.accessToken).toBe('string');
      expect(typeof tokens.refreshToken).toBe('string');
    });

    it('should include correct claims in access token', async () => {
      const user = await createDbUser();

      const tokens = await jwtService.generateTokenPair(user);
      const decoded = jwt.decode(tokens.accessToken) as any;

      expect(decoded.sub).toBe(user.id);
      expect(decoded.type).toBe('access');
      expect(decoded.tenant_id).toBe(TEST_TENANT_ID);
      expect(decoded.email).toBe(user.email);
      expect(decoded.jti).toBeDefined();
      expect(decoded.iat).toBeDefined();
      expect(decoded.exp).toBeDefined();
    });

    it('should include correct claims in refresh token', async () => {
      const user = await createDbUser();

      const tokens = await jwtService.generateTokenPair(user);
      const decoded = jwt.decode(tokens.refreshToken) as any;

      expect(decoded.sub).toBe(user.id);
      expect(decoded.type).toBe('refresh');
      expect(decoded.tenant_id).toBe(TEST_TENANT_ID);
      expect(decoded.family).toBeDefined();
      expect(decoded.jti).toBeDefined();
    });

    it('should store refresh token data in Redis', async () => {
      const user = await createDbUser();

      const tokens = await jwtService.generateTokenPair(user);
      const decoded = jwt.decode(tokens.refreshToken) as any;

      // Check Redis for the refresh token
      const redisKey = `tenant:${TEST_TENANT_ID}:refresh_token:${decoded.jti}`;
      const storedData = await testRedis.get(redisKey);

      expect(storedData).not.toBeNull();
      const parsed = JSON.parse(storedData!);
      expect(parsed.userId).toBe(user.id);
      expect(parsed.tenantId).toBe(TEST_TENANT_ID);
      expect(parsed.family).toBe(decoded.family);
    });

    it('should set TTL on refresh token in Redis', async () => {
      const user = await createDbUser();

      const tokens = await jwtService.generateTokenPair(user);
      const decoded = jwt.decode(tokens.refreshToken) as any;

      const redisKey = `tenant:${TEST_TENANT_ID}:refresh_token:${decoded.jti}`;
      const ttl = await testRedis.ttl(redisKey);

      // Should be approximately 7 days (604800 seconds), allow some variance
      expect(ttl).toBeGreaterThan(604700);
      expect(ttl).toBeLessThanOrEqual(604800);
    });

    it('should lookup tenant_id from database if not provided', async () => {
      const user = await createDbUser();

      // Pass user without tenant_id
      const tokens = await jwtService.generateTokenPair({ id: user.id, email: user.email });
      const decoded = jwt.decode(tokens.accessToken) as any;

      expect(decoded.tenant_id).toBe(TEST_TENANT_ID);
    });
  });

  describe('verifyAccessToken', () => {
    it('should verify valid access token', async () => {
      const user = await createDbUser();
      const tokens = await jwtService.generateTokenPair(user);

      const payload = await jwtService.verifyAccessToken(tokens.accessToken);

      expect(payload.sub).toBe(user.id);
      expect(payload.type).toBe('access');
      expect(payload.tenant_id).toBe(TEST_TENANT_ID);
    });

    it('should reject refresh token used as access token', async () => {
      const user = await createDbUser();
      const tokens = await jwtService.generateTokenPair(user);

      // The service throws "Invalid access token" because the issuer/audience check fails
      // before it gets to the type check (refresh tokens don't have issuer/audience)
      await expect(jwtService.verifyAccessToken(tokens.refreshToken))
        .rejects.toThrow('Invalid access token');
    });

    it('should reject malformed token', async () => {
      await expect(jwtService.verifyAccessToken('not-a-valid-token'))
        .rejects.toThrow('Invalid access token');
    });
  });

  describe('refreshTokens', () => {
    it('should return new token pair', async () => {
      const user = await createDbUser();
      const tokens = await jwtService.generateTokenPair(user);

      const newTokens = await jwtService.refreshTokens(
        tokens.refreshToken,
        '127.0.0.1',
        'Jest Test'
      );

      expect(newTokens.accessToken).toBeDefined();
      expect(newTokens.refreshToken).toBeDefined();
      expect(newTokens.accessToken).not.toBe(tokens.accessToken);
      expect(newTokens.refreshToken).not.toBe(tokens.refreshToken);
    });

    it('should delete old refresh token from Redis', async () => {
      const user = await createDbUser();
      const tokens = await jwtService.generateTokenPair(user);
      const decoded = jwt.decode(tokens.refreshToken) as any;

      const oldRedisKey = `tenant:${TEST_TENANT_ID}:refresh_token:${decoded.jti}`;

      // Verify it exists first
      expect(await testRedis.get(oldRedisKey)).not.toBeNull();

      await jwtService.refreshTokens(tokens.refreshToken, '127.0.0.1', 'Jest Test');

      // Old token should be gone
      expect(await testRedis.get(oldRedisKey)).toBeNull();
    });

    it('should store new refresh token in Redis', async () => {
      const user = await createDbUser();
      const tokens = await jwtService.generateTokenPair(user);

      const newTokens = await jwtService.refreshTokens(
        tokens.refreshToken,
        '127.0.0.1',
        'Jest Test'
      );

      const newDecoded = jwt.decode(newTokens.refreshToken) as any;
      const newRedisKey = `tenant:${TEST_TENANT_ID}:refresh_token:${newDecoded.jti}`;

      const storedData = await testRedis.get(newRedisKey);
      expect(storedData).not.toBeNull();
    });

    it('should reject reused refresh token (token theft detection)', async () => {
      const user = await createDbUser();
      const tokens = await jwtService.generateTokenPair(user);

      // First refresh - should succeed
      await jwtService.refreshTokens(tokens.refreshToken, '127.0.0.1', 'Jest Test');

      // Second refresh with same token - should fail
      await expect(
        jwtService.refreshTokens(tokens.refreshToken, '127.0.0.1', 'Jest Test')
      ).rejects.toThrow('Token reuse detected');
    });

    it('should reject access token used as refresh token', async () => {
      const user = await createDbUser();
      const tokens = await jwtService.generateTokenPair(user);

      await expect(
        jwtService.refreshTokens(tokens.accessToken, '127.0.0.1', 'Jest Test')
      ).rejects.toThrow('Invalid token type');
    });
  });

  describe('revokeAllUserTokens', () => {
    it('should remove all user tokens from Redis', async () => {
      const user = await createDbUser();

      // Generate multiple token pairs
      const tokens1 = await jwtService.generateTokenPair(user);
      const tokens2 = await jwtService.generateTokenPair(user);
      const tokens3 = await jwtService.generateTokenPair(user);

      const decoded1 = jwt.decode(tokens1.refreshToken) as any;
      const decoded2 = jwt.decode(tokens2.refreshToken) as any;
      const decoded3 = jwt.decode(tokens3.refreshToken) as any;

      // Verify all exist
      expect(await testRedis.get(`tenant:${TEST_TENANT_ID}:refresh_token:${decoded1.jti}`)).not.toBeNull();
      expect(await testRedis.get(`tenant:${TEST_TENANT_ID}:refresh_token:${decoded2.jti}`)).not.toBeNull();
      expect(await testRedis.get(`tenant:${TEST_TENANT_ID}:refresh_token:${decoded3.jti}`)).not.toBeNull();

      await jwtService.revokeAllUserTokens(user.id, TEST_TENANT_ID);

      // All should be gone
      expect(await testRedis.get(`tenant:${TEST_TENANT_ID}:refresh_token:${decoded1.jti}`)).toBeNull();
      expect(await testRedis.get(`tenant:${TEST_TENANT_ID}:refresh_token:${decoded2.jti}`)).toBeNull();
      expect(await testRedis.get(`tenant:${TEST_TENANT_ID}:refresh_token:${decoded3.jti}`)).toBeNull();
    });

    it('should not affect other users tokens', async () => {
      const user1 = await createDbUser({ email: 'user1@test.com' });
      const user2 = await createDbUser({ email: 'user2@test.com' });

      const tokens1 = await jwtService.generateTokenPair(user1);
      const tokens2 = await jwtService.generateTokenPair(user2);

      const decoded1 = jwt.decode(tokens1.refreshToken) as any;
      const decoded2 = jwt.decode(tokens2.refreshToken) as any;

      await jwtService.revokeAllUserTokens(user1.id, TEST_TENANT_ID);

      // User1 token gone
      expect(await testRedis.get(`tenant:${TEST_TENANT_ID}:refresh_token:${decoded1.jti}`)).toBeNull();
      // User2 token still exists
      expect(await testRedis.get(`tenant:${TEST_TENANT_ID}:refresh_token:${decoded2.jti}`)).not.toBeNull();
    });
  });

  describe('verifyRefreshToken', () => {
    it('should verify valid refresh token', async () => {
      const user = await createDbUser();
      const tokens = await jwtService.generateTokenPair(user);

      const payload = await jwtService.verifyRefreshToken(tokens.refreshToken);

      expect(payload.sub).toBe(user.id);
      expect(payload.type).toBe('refresh');
    });

    it('should reject malformed token', async () => {
      await expect(jwtService.verifyRefreshToken('not-a-valid-token'))
        .rejects.toThrow('Invalid refresh token');
    });
  });

  describe('decode', () => {
    it('should decode token without verification', async () => {
      const user = await createDbUser();
      const tokens = await jwtService.generateTokenPair(user);

      const decoded = jwtService.decode(tokens.accessToken);

      expect(decoded.sub).toBe(user.id);
      expect(decoded.type).toBe('access');
    });

    it('should return null for invalid token', () => {
      const decoded = jwtService.decode('not-a-token');
      expect(decoded).toBeNull();
    });
  });

  describe('getJWKS', () => {
    it('should return JWKS with public keys', () => {
      const jwks = jwtService.getJWKS();

      expect(jwks.keys).toBeDefined();
      expect(Array.isArray(jwks.keys)).toBe(true);
      expect(jwks.keys.length).toBeGreaterThan(0);
      expect(jwks.keys[0].kty).toBe('RSA');
      expect(jwks.keys[0].use).toBe('sig');
      expect(jwks.keys[0].alg).toBe('RS256');
      expect(jwks.keys[0].kid).toBeDefined();
      expect(jwks.keys[0].pem).toBeDefined();
    });
  });

  describe('getPublicKey', () => {
    it('should return public key string', () => {
      const publicKey = jwtService.getPublicKey();

      expect(publicKey).toBeDefined();
      expect(publicKey).toContain('-----BEGIN PUBLIC KEY-----');
    });
  });
});
