import { JWTService } from '../../../src/services/jwt.service';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { redis } from '../../../src/config/redis';
import { pool } from '../../../src/config/database';
import { TokenError } from '../../../src/errors';

// =============================================================================
// MOCKS
// =============================================================================

jest.mock('jsonwebtoken');
jest.mock('crypto');
jest.mock('../../../src/config/redis', () => ({
  redis: {
    get: jest.fn(),
    setex: jest.fn(),
    del: jest.fn(),
    keys: jest.fn(),
  }
}));

jest.mock('../../../src/config/database', () => ({
  pool: {
    query: jest.fn(),
  }
}));

jest.mock('fs', () => ({
  readFileSync: jest.fn(() => {
    if (jest.requireActual('fs').readFileSync.mock?.calls[0]?.[0]?.includes('private')) {
      return '-----BEGIN RSA PRIVATE KEY-----\nMOCK_PRIVATE_KEY\n-----END RSA PRIVATE KEY-----';
    }
    return '-----BEGIN PUBLIC KEY-----\nMOCK_PUBLIC_KEY\n-----END PUBLIC KEY-----';
  }),
}));

jest.mock('../../../src/config/env', () => ({
  env: {
    JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '7d',
    JWT_ISSUER: 'test-issuer',
  }
}));

// =============================================================================
// TEST SUITE
// =============================================================================

describe('JWTService', () => {
  let jwtService: JWTService;
  let mockUser: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jwtService = new JWTService();

    mockUser = {
      id: 'user-123',
      email: 'user@example.com',
      tenant_id: 'tenant-456',
      role: 'customer',
      permissions: ['buy:tickets', 'view:events'],
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
    };

    // Default mock for crypto.randomUUID
    (crypto.randomUUID as jest.Mock).mockReturnValue('mock-uuid-123');
  });

  // =============================================================================
  // GROUP 1: generateTokenPair() - 11 test cases
  // =============================================================================

  describe('generateTokenPair()', () => {
    beforeEach(() => {
      (jwt.sign as jest.Mock).mockImplementation((payload, secret, options) => {
        return `mocked-token-${payload.type}`;
      });

      (redis.setex as jest.Mock).mockResolvedValue('OK');

      (pool.query as jest.Mock).mockResolvedValue({
        rows: [{ tenant_id: 'tenant-456' }],
      });
    });

    it('should generate both access and refresh tokens', async () => {
      const result = await jwtService.generateTokenPair(mockUser);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.accessToken).toBe('mocked-token-access');
      expect(result.refreshToken).toBe('mocked-token-refresh');
    });

    it('should call jwt.sign twice (once for each token)', async () => {
      await jwtService.generateTokenPair(mockUser);

      expect(jwt.sign).toHaveBeenCalledTimes(2);
    });

    it('should use RS256 algorithm for both tokens', async () => {
      await jwtService.generateTokenPair(mockUser);

      // First call - access token
      expect(jwt.sign).toHaveBeenNthCalledWith(
        1,
        expect.any(Object),
        expect.any(String),
        expect.objectContaining({ algorithm: 'RS256' })
      );

      // Second call - refresh token
      expect(jwt.sign).toHaveBeenNthCalledWith(
        2,
        expect.any(Object),
        expect.any(String),
        expect.objectContaining({ algorithm: 'RS256' })
      );
    });

    it('should include user id as "sub" in access token', async () => {
      await jwtService.generateTokenPair(mockUser);

      expect(jwt.sign).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ sub: 'user-123' }),
        expect.any(String),
        expect.any(Object)
      );
    });

    it('should include tenant_id in both tokens', async () => {
      await jwtService.generateTokenPair(mockUser);

      // Access token should have tenant_id
      expect(jwt.sign).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ tenant_id: 'tenant-456' }),
        expect.any(String),
        expect.any(Object)
      );

      // Refresh token should also have tenant_id
      expect(jwt.sign).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ tenant_id: 'tenant-456' }),
        expect.any(String),
        expect.any(Object)
      );
    });

    it('should fetch tenant_id from database if not provided', async () => {
      const userWithoutTenant = { id: 'user-123' };

      await jwtService.generateTokenPair(userWithoutTenant);

      expect(pool.query).toHaveBeenCalledWith(
        'SELECT tenant_id FROM users WHERE id = $1',
        ['user-123']
      );

      expect(jwt.sign).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ tenant_id: 'tenant-456' }),
        expect.any(String),
        expect.any(Object)
      );
    });

    it('should use default tenant_id if database returns none', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [],
      });

      const userWithoutTenant = { id: 'user-123' };
      await jwtService.generateTokenPair(userWithoutTenant);

      expect(jwt.sign).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ tenant_id: '00000000-0000-0000-0000-000000000001' }),
        expect.any(String),
        expect.any(Object)
      );
    });

    it('should include permissions in access token', async () => {
      await jwtService.generateTokenPair(mockUser);

      expect(jwt.sign).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ permissions: ['buy:tickets', 'view:events'] }),
        expect.any(String),
        expect.any(Object)
      );
    });

    it('should include role in access token', async () => {
      await jwtService.generateTokenPair(mockUser);

      expect(jwt.sign).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ role: 'customer' }),
        expect.any(String),
        expect.any(Object)
      );
    });

    it('should set correct expiry times', async () => {
      await jwtService.generateTokenPair(mockUser);

      // Access token - 15 minutes
      expect(jwt.sign).toHaveBeenNthCalledWith(
        1,
        expect.any(Object),
        expect.any(String),
        expect.objectContaining({ expiresIn: '15m' })
      );

      // Refresh token - 7 days
      expect(jwt.sign).toHaveBeenNthCalledWith(
        2,
        expect.any(Object),
        expect.any(String),
        expect.objectContaining({ expiresIn: '7d' })
      );
    });

    it('should store refresh token metadata in Redis', async () => {
      await jwtService.generateTokenPair(mockUser);

      expect(redis.setex).toHaveBeenCalledWith(
        expect.stringContaining('refresh_token:'),
        7 * 24 * 60 * 60, // 7 days in seconds
        expect.stringContaining('"userId":"user-123"')
      );
    });

    it('should include token family in refresh token', async () => {
      (crypto.randomUUID as jest.Mock)
        .mockReturnValueOnce('jti-123')         // Access token jti
        .mockReturnValueOnce('refresh-jti-456') // Refresh token jti
        .mockReturnValueOnce('family-456');     // Family

      await jwtService.generateTokenPair(mockUser);

      // Second jwt.sign call is refresh token
      expect(jwt.sign).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ family: 'family-456' }),
        expect.any(String),
        expect.any(Object)
      );
    });
  });

  // =============================================================================
  // GROUP 2: verifyAccessToken() - 8 test cases
  // =============================================================================

  describe('verifyAccessToken()', () => {
    it('should verify valid access token', async () => {
      const mockPayload = {
        sub: 'user-123',
        type: 'access',
        jti: 'token-123',
        tenant_id: 'tenant-456',
        permissions: ['buy:tickets'],
        role: 'customer',
      };

      (jwt.verify as jest.Mock).mockReturnValue(mockPayload);

      const result = await jwtService.verifyAccessToken('valid-token');

      expect(jwt.verify).toHaveBeenCalledWith(
        'valid-token',
        expect.any(String),
        expect.objectContaining({
          issuer: 'test-issuer',
          audience: 'test-issuer',
          algorithms: ['RS256'],
        })
      );

      expect(result).toEqual(mockPayload);
    });

    it('should use public key and RS256 algorithm', async () => {
      const mockPayload = {
        sub: 'user-123',
        type: 'access',
        tenant_id: 'tenant-456',
      };

      (jwt.verify as jest.Mock).mockReturnValue(mockPayload);

      await jwtService.verifyAccessToken('token');

      expect(jwt.verify).toHaveBeenCalledWith(
        'token',
        expect.stringContaining('PUBLIC KEY'),
        expect.objectContaining({ algorithms: ['RS256'] })
      );
    });

    it('should verify issuer and audience', async () => {
      const mockPayload = {
        sub: 'user-123',
        type: 'access',
        tenant_id: 'tenant-456',
      };

      (jwt.verify as jest.Mock).mockReturnValue(mockPayload);

      await jwtService.verifyAccessToken('token');

      expect(jwt.verify).toHaveBeenCalledWith(
        'token',
        expect.any(String),
        expect.objectContaining({
          issuer: 'test-issuer',
          audience: 'test-issuer',
        })
      );
    });

    it('should reject token with wrong type', async () => {
      (jwt.verify as jest.Mock).mockReturnValue({
        sub: 'user-123',
        type: 'refresh',  // Wrong type
        tenant_id: 'tenant-456',
      });

      await expect(jwtService.verifyAccessToken('token'))
        .rejects.toThrow('Invalid token type');
    });

    it('should reject token without tenant_id', async () => {
      (jwt.verify as jest.Mock).mockReturnValue({
        sub: 'user-123',
        type: 'access',
        // Missing tenant_id
      });

      await expect(jwtService.verifyAccessToken('token'))
        .rejects.toThrow('missing tenant context');
    });

    it('should reject expired token', async () => {
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new jwt.TokenExpiredError('jwt expired', new Date());
      });

      await expect(jwtService.verifyAccessToken('expired-token'))
        .rejects.toThrow('Access token expired');
    });

    it('should reject invalid token', async () => {
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('invalid signature');
      });

      await expect(jwtService.verifyAccessToken('invalid-token'))
        .rejects.toThrow('Invalid access token');
    });

    it('should reject malformed token', async () => {
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new jwt.JsonWebTokenError('jwt malformed');
      });

      await expect(jwtService.verifyAccessToken('malformed-token'))
        .rejects.toThrow('Invalid access token');
    });
  });

  // =============================================================================
  // GROUP 3: verifyRefreshToken() - 6 test cases
  // =============================================================================

  describe('verifyRefreshToken()', () => {
    it('should verify valid refresh token', async () => {
      const mockPayload = {
        sub: 'user-123',
        type: 'refresh',
        jti: 'token-123',
        tenant_id: 'tenant-456',
        family: 'family-123',
      };

      (jwt.verify as jest.Mock).mockReturnValue(mockPayload);

      const result = await jwtService.verifyRefreshToken('valid-refresh-token');

      expect(result).toEqual(mockPayload);
    });

    it('should use RS256 algorithm', async () => {
      (jwt.verify as jest.Mock).mockReturnValue({ sub: 'user-123' });

      await jwtService.verifyRefreshToken('token');

      expect(jwt.verify).toHaveBeenCalledWith(
        'token',
        expect.any(String),
        expect.objectContaining({ algorithms: ['RS256'] })
      );
    });

    it('should reject expired refresh token', async () => {
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new jwt.TokenExpiredError('jwt expired', new Date());
      });

      await expect(jwtService.verifyRefreshToken('expired-token'))
        .rejects.toThrow('Invalid refresh token');
    });

    it('should reject invalid refresh token', async () => {
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('invalid signature');
      });

      await expect(jwtService.verifyRefreshToken('invalid-token'))
        .rejects.toThrow('Invalid refresh token');
    });

    it('should reject malformed refresh token', async () => {
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new jwt.JsonWebTokenError('jwt malformed');
      });

      await expect(jwtService.verifyRefreshToken('malformed'))
        .rejects.toThrow('Invalid refresh token');
    });

    it('should handle null or empty token', async () => {
      await expect(jwtService.verifyRefreshToken(''))
        .rejects.toThrow('Invalid refresh token');
    });
  });

  // =============================================================================
  // GROUP 4: refreshTokens() - 12 test cases
  // =============================================================================

  describe('refreshTokens()', () => {
    const validRefreshToken = 'valid-refresh-token';
    const ipAddress = '192.168.1.1';
    const userAgent = 'Mozilla/5.0';

    beforeEach(() => {
      // Setup default successful flow
      (jwt.verify as jest.Mock).mockReturnValue({
        sub: 'user-123',
        type: 'refresh',
        jti: 'refresh-123',
        tenant_id: 'tenant-456',
        family: 'family-123',
      });

      (redis.get as jest.Mock).mockResolvedValue(JSON.stringify({
        userId: 'user-123',
        tenantId: 'tenant-456',
        family: 'family-123',
        createdAt: Date.now(),
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      }));

      (pool.query as jest.Mock).mockResolvedValue({
        rows: [{
          id: 'user-123',
          tenant_id: 'tenant-789',
          permissions: ['buy:tickets', 'view:events'],
          role: 'customer',
        }],
      });

      (jwt.sign as jest.Mock).mockImplementation((payload) => {
        return `new-token-${payload.type}`;
      });

      (redis.del as jest.Mock).mockResolvedValue(1);
      (redis.setex as jest.Mock).mockResolvedValue('OK');
    });

    it('should generate new token pair with valid refresh token', async () => {
      const result = await jwtService.refreshTokens(validRefreshToken, ipAddress, userAgent);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.accessToken).toBe('new-token-access');
      expect(result.refreshToken).toBe('new-token-refresh');
    });

    it('should verify the refresh token', async () => {
      await jwtService.refreshTokens(validRefreshToken, ipAddress, userAgent);

      expect(jwt.verify).toHaveBeenCalledWith(
        validRefreshToken,
        expect.any(String),
        expect.objectContaining({ algorithms: ['RS256'] })
      );
    });

    it('should check if token exists in Redis', async () => {
      await jwtService.refreshTokens(validRefreshToken, ipAddress, userAgent);

      expect(redis.get).toHaveBeenCalledWith('refresh_token:refresh-123');
    });

    it('should reject if token not found in Redis (already used)', async () => {
      (redis.get as jest.Mock).mockResolvedValue(null);

      await expect(
        jwtService.refreshTokens(validRefreshToken, ipAddress, userAgent)
      ).rejects.toThrow('Token reuse detected - possible theft');
    });

    it('should invalidate token family on reuse detection', async () => {
      (redis.get as jest.Mock).mockResolvedValue(null);

      const invalidateSpy = jest.spyOn(jwtService, 'invalidateTokenFamily');

      try {
        await jwtService.refreshTokens(validRefreshToken, ipAddress, userAgent);
      } catch (error) {
        // Expected to throw
      }

      expect(invalidateSpy).toHaveBeenCalledWith('family-123');
    });

    it('should fetch fresh user data from database', async () => {
      await jwtService.refreshTokens(validRefreshToken, ipAddress, userAgent);

      expect(pool.query).toHaveBeenCalledWith(
        'SELECT id, tenant_id, permissions, role FROM users WHERE id = $1',
        ['user-123']
      );
    });

    it('should reject if user not found in database', async () => {
      (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

      await expect(
        jwtService.refreshTokens(validRefreshToken, ipAddress, userAgent)
      ).rejects.toThrow('User not found');
    });

    it('should delete old refresh token from Redis', async () => {
      await jwtService.refreshTokens(validRefreshToken, ipAddress, userAgent);

      expect(redis.del).toHaveBeenCalledWith('refresh_token:refresh-123');
    });

    it('should reject token with wrong type', async () => {
      (jwt.verify as jest.Mock).mockReturnValue({
        sub: 'user-123',
        type: 'access',  // Wrong type
        jti: 'token-123',
        tenant_id: 'tenant-456',
      });

      await expect(
        jwtService.refreshTokens(validRefreshToken, ipAddress, userAgent)
      ).rejects.toThrow('Invalid token type');
    });

    it('should include new IP and user agent in token metadata', async () => {
      await jwtService.refreshTokens(validRefreshToken, ipAddress, userAgent);

      // Check that generateTokenPair was called with IP and user agent
      expect(jwt.sign).toHaveBeenCalled();
      expect(redis.setex).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Number),
        expect.stringContaining('"ipAddress":"192.168.1.1"')
      );
    });

    it('should handle token verification errors', async () => {
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      await expect(
        jwtService.refreshTokens(validRefreshToken, ipAddress, userAgent)
      ).rejects.toThrow('Invalid refresh token');
    });

    it('should generate tokens with current tenant_id from database', async () => {
      await jwtService.refreshTokens(validRefreshToken, ipAddress, userAgent);

      // Should use tenant-789 from database, not tenant-456 from token
      expect(jwt.sign).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ tenant_id: 'tenant-789' }),
        expect.any(String),
        expect.any(Object)
      );
    });
  });

  // =============================================================================
  // GROUP 5: invalidateTokenFamily() - 5 test cases
  // =============================================================================

  describe('invalidateTokenFamily()', () => {
    beforeEach(() => {
      (redis.keys as jest.Mock).mockResolvedValue([
        'refresh_token:token-1',
        'refresh_token:token-2',
        'refresh_token:token-3',
      ]);

      (redis.del as jest.Mock).mockResolvedValue(1);
    });

    it('should find all refresh tokens', async () => {
      (redis.get as jest.Mock)
        .mockResolvedValueOnce(JSON.stringify({ family: 'family-123' }))
        .mockResolvedValueOnce(JSON.stringify({ family: 'family-456' }))
        .mockResolvedValueOnce(JSON.stringify({ family: 'family-123' }));

      await jwtService.invalidateTokenFamily('family-123');

      expect(redis.keys).toHaveBeenCalledWith('refresh_token:*');
    });

    it('should delete tokens matching the family', async () => {
      (redis.get as jest.Mock)
        .mockResolvedValueOnce(JSON.stringify({ family: 'family-123' }))
        .mockResolvedValueOnce(JSON.stringify({ family: 'family-456' }))
        .mockResolvedValueOnce(JSON.stringify({ family: 'family-123' }));

      await jwtService.invalidateTokenFamily('family-123');

      expect(redis.del).toHaveBeenCalledTimes(2);
      expect(redis.del).toHaveBeenCalledWith('refresh_token:token-1');
      expect(redis.del).toHaveBeenCalledWith('refresh_token:token-3');
    });

    it('should not delete tokens from other families', async () => {
      (redis.get as jest.Mock)
        .mockResolvedValueOnce(JSON.stringify({ family: 'family-123' }))
        .mockResolvedValueOnce(JSON.stringify({ family: 'family-456' }))
        .mockResolvedValueOnce(JSON.stringify({ family: 'family-789' }));

      await jwtService.invalidateTokenFamily('family-123');

      expect(redis.del).toHaveBeenCalledTimes(1);
      expect(redis.del).not.toHaveBeenCalledWith('refresh_token:token-2');
      expect(redis.del).not.toHaveBeenCalledWith('refresh_token:token-3');
    });

    it('should handle tokens with no data gracefully', async () => {
      (redis.get as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(JSON.stringify({ family: 'family-123' }))
        .mockResolvedValueOnce(null);

      await jwtService.invalidateTokenFamily('family-123');

      expect(redis.del).toHaveBeenCalledTimes(1);
      expect(redis.del).toHaveBeenCalledWith('refresh_token:token-2');
    });

    it('should handle empty token list', async () => {
      (redis.keys as jest.Mock).mockResolvedValue([]);

      await jwtService.invalidateTokenFamily('family-123');

      expect(redis.get).not.toHaveBeenCalled();
      expect(redis.del).not.toHaveBeenCalled();
    });
  });

  // =============================================================================
  // GROUP 6: revokeAllUserTokens() - 4 test cases
  // =============================================================================

  describe('revokeAllUserTokens()', () => {
    beforeEach(() => {
      (redis.keys as jest.Mock).mockResolvedValue([
        'refresh_token:token-1',
        'refresh_token:token-2',
        'refresh_token:token-3',
      ]);

      (redis.del as jest.Mock).mockResolvedValue(1);
    });

    it('should find all refresh tokens', async () => {
      (redis.get as jest.Mock)
        .mockResolvedValueOnce(JSON.stringify({ userId: 'user-123' }))
        .mockResolvedValueOnce(JSON.stringify({ userId: 'user-456' }))
        .mockResolvedValueOnce(JSON.stringify({ userId: 'user-123' }));

      await jwtService.revokeAllUserTokens('user-123');

      expect(redis.keys).toHaveBeenCalledWith('refresh_token:*');
    });

    it('should delete all tokens for the user', async () => {
      (redis.get as jest.Mock)
        .mockResolvedValueOnce(JSON.stringify({ userId: 'user-123' }))
        .mockResolvedValueOnce(JSON.stringify({ userId: 'user-456' }))
        .mockResolvedValueOnce(JSON.stringify({ userId: 'user-123' }));

      await jwtService.revokeAllUserTokens('user-123');

      expect(redis.del).toHaveBeenCalledTimes(2);
      expect(redis.del).toHaveBeenCalledWith('refresh_token:token-1');
      expect(redis.del).toHaveBeenCalledWith('refresh_token:token-3');
    });

    it('should not delete tokens for other users', async () => {
      (redis.get as jest.Mock)
        .mockResolvedValueOnce(JSON.stringify({ userId: 'user-123' }))
        .mockResolvedValueOnce(JSON.stringify({ userId: 'user-456' }))
        .mockResolvedValueOnce(JSON.stringify({ userId: 'user-789' }));

      await jwtService.revokeAllUserTokens('user-123');

      expect(redis.del).toHaveBeenCalledTimes(1);
      expect(redis.del).not.toHaveBeenCalledWith('refresh_token:token-2');
      expect(redis.del).not.toHaveBeenCalledWith('refresh_token:token-3');
    });

    it('should handle empty token list', async () => {
      (redis.keys as jest.Mock).mockResolvedValue([]);

      await jwtService.revokeAllUserTokens('user-123');

      expect(redis.get).not.toHaveBeenCalled();
      expect(redis.del).not.toHaveBeenCalled();
    });
  });

  // =============================================================================
  // GROUP 7: decode() - 4 test cases
  // =============================================================================

  describe('decode()', () => {
    it('should decode valid token without verification', () => {
      const mockPayload = {
        sub: 'user-123',
        type: 'access',
        tenant_id: 'tenant-456',
      };

      (jwt.decode as jest.Mock).mockReturnValue(mockPayload);

      const result = jwtService.decode('valid-token');

      expect(jwt.decode).toHaveBeenCalledWith('valid-token');
      expect(result).toEqual(mockPayload);
    });

    it('should return null for invalid token', () => {
      (jwt.decode as jest.Mock).mockReturnValue(null);

      const result = jwtService.decode('invalid-token');

      expect(result).toBeNull();
    });

    it('should decode expired token without throwing', () => {
      const expiredPayload = {
        sub: 'user-123',
        exp: Math.floor(Date.now() / 1000) - 3600,  // Expired 1 hour ago
      };

      (jwt.decode as jest.Mock).mockReturnValue(expiredPayload);

      const result = jwtService.decode('expired-token');

      expect(result).toEqual(expiredPayload);
    });

    it('should not verify signature when decoding', () => {
      jwtService.decode('token');

      expect(jwt.decode).toHaveBeenCalledWith('token');
      expect(jwt.verify).not.toHaveBeenCalled();
    });
  });

  // =============================================================================
  // GROUP 8: getPublicKey() - 2 test cases
  // =============================================================================

  describe('getPublicKey()', () => {
    it('should return the public key', () => {
      const publicKey = jwtService.getPublicKey();

      expect(publicKey).toBeDefined();
      expect(typeof publicKey).toBe('string');
    });

    it('should return a string', () => {
      const publicKey = jwtService.getPublicKey();

      expect(publicKey).toContain('PUBLIC KEY');
    });
  });

  // =============================================================================
  // GROUP 9: Token Security Attacks - 6 test cases
  // =============================================================================

  describe('Token Security Attacks', () => {
    it('should reject token with wrong issuer', async () => {
      // Create token with different issuer
      const maliciousPayload = {
        sub: 'user-123',
        type: 'access',
        jti: 'token-123',
        tenant_id: 'tenant-456',
      };

      const maliciousToken = jwt.sign(maliciousPayload, 'fake-key', {
        issuer: 'evil-issuer',
        audience: 'test-issuer',
        algorithm: 'HS256',
      });

      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('jwt issuer invalid');
      });

      await expect(jwtService.verifyAccessToken(maliciousToken))
        .rejects.toThrow('Invalid access token');
    });

    it('should reject token with wrong audience', async () => {
      // Create token with different audience
      const maliciousPayload = {
        sub: 'user-123',
        type: 'access',
        jti: 'token-123',
        tenant_id: 'tenant-456',
      };

      const maliciousToken = jwt.sign(maliciousPayload, 'fake-key', {
        issuer: 'test-issuer',
        audience: 'wrong-audience',
        algorithm: 'HS256',
      });

      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('jwt audience invalid');
      });

      await expect(jwtService.verifyAccessToken(maliciousToken))
        .rejects.toThrow('Invalid access token');
    });

    it('should reject algorithm confusion attack (HS256 instead of RS256)', async () => {
      // Simulate HS256 token when RS256 is expected
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('invalid algorithm');
      });

      await expect(jwtService.verifyAccessToken('hs256-token'))
        .rejects.toThrow('Invalid access token');
    });

    it('should reject tampered token payload', async () => {
      // Mock a token where payload was modified
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('invalid signature');
      });

      await expect(jwtService.verifyAccessToken('tampered-token'))
        .rejects.toThrow('Invalid access token');
    });

    it('should reject token with "none" algorithm', async () => {
      // "none" algorithm attack - no signature verification
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('invalid algorithm');
      });

      await expect(jwtService.verifyAccessToken('none-algorithm-token'))
        .rejects.toThrow('Invalid access token');
    });

    it('should reject token with missing signature', async () => {
      // Token with header.payload but no signature
      const headerPayload = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEyMyJ9';

      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new jwt.JsonWebTokenError('jwt malformed');
      });

      await expect(jwtService.verifyAccessToken(headerPayload))
        .rejects.toThrow('Invalid access token');
    });
  });

  // =============================================================================
  // GROUP 10: Edge Cases & Robustness - 8 test cases
  // =============================================================================

  describe('Edge Cases & Robustness', () => {
    beforeEach(() => {
      (jwt.sign as jest.Mock).mockImplementation((payload) => {
        return `mocked-token-${payload.type}-${JSON.stringify(payload).length}`;
      });

      (jwt.verify as jest.Mock).mockImplementation((token) => {
        // Return mock payload that's being verified
        return {
          sub: 'user-123',
          type: 'access',
          jti: 'token-123',
          tenant_id: 'tenant-456',
          permissions: [],
        };
      });

      (pool.query as jest.Mock).mockResolvedValue({
        rows: [{ tenant_id: 'tenant-456' }],
      });
    });

    it('should handle very long permission arrays (100+ items)', async () => {
      // Create 150 permissions
      const permissions = Array.from({ length: 150 }, (_, i) => `permission:${i}`);

      const user = {
        id: 'user-123',
        tenant_id: 'tenant-456',
        permissions,
        role: 'super-admin',
      };

      const result = await jwtService.generateTokenPair(user);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');

      // Verify jwt.sign was called with the large permissions array
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({ permissions }),
        expect.any(String),
        expect.any(Object)
      );
    });

    it('should handle special characters in claims', async () => {
      const user = {
        id: 'user-123',
        tenant_id: 'tenant-456',
        permissions: [
          'read:tickets<script>',
          'write:events"\'',
          'delete:users;DROP TABLE',
        ],
        role: 'admin<>',
      };

      const result = await jwtService.generateTokenPair(user);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    it('should handle unicode and emoji in claims', async () => {
      const user = {
        id: 'user-123',
        tenant_id: 'tenant-456',
        permissions: ['🎫:buy', '测试:read', 'مرحبا:write'],
        role: 'customer-😊',
      };

      const result = await jwtService.generateTokenPair(user);

      expect(result).toHaveProperty('accessToken');
    });

    it('should handle concurrent token generation', async () => {
      (crypto.randomUUID as jest.Mock)
        .mockReturnValueOnce('uuid-1')
        .mockReturnValueOnce('uuid-2')
        .mockReturnValueOnce('uuid-3')
        .mockReturnValueOnce('uuid-4')
        .mockReturnValueOnce('uuid-5')
        .mockReturnValueOnce('uuid-6');

      (redis.setex as jest.Mock).mockResolvedValue('OK');

      const user1 = { id: 'user-1', tenant_id: 'tenant-1' };
      const user2 = { id: 'user-2', tenant_id: 'tenant-2' };
      const user3 = { id: 'user-3', tenant_id: 'tenant-3' };

      // Generate tokens concurrently
      const results = await Promise.all([
        jwtService.generateTokenPair(user1),
        jwtService.generateTokenPair(user2),
        jwtService.generateTokenPair(user3),
      ]);

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result).toHaveProperty('accessToken');
        expect(result).toHaveProperty('refreshToken');
      });
    });

    it('should handle malformed JWT structure', async () => {
      const malformedTokens = [
        'not.a.token',
        'only-one-part',
        '',
        'too.many.parts.here.invalid',
      ];

      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new jwt.JsonWebTokenError('jwt malformed');
      });

      for (const token of malformedTokens) {
        await expect(jwtService.verifyAccessToken(token))
          .rejects.toThrow('Invalid access token');
      }
    });

    it('should prevent token reuse after user revocation', async () => {
      const userId = 'user-123';

      // Setup initial tokens
      (redis.keys as jest.Mock).mockResolvedValue([
        'refresh_token:token-1',
        'refresh_token:token-2',
      ]);

      (redis.get as jest.Mock)
        .mockResolvedValueOnce(JSON.stringify({ userId: 'user-123' }))
        .mockResolvedValueOnce(JSON.stringify({ userId: 'user-123' }));

      (redis.del as jest.Mock).mockResolvedValue(1);

      // Revoke all user tokens
      await jwtService.revokeAllUserTokens(userId);

      // Verify both tokens were deleted
      expect(redis.del).toHaveBeenCalledTimes(2);
      expect(redis.del).toHaveBeenCalledWith('refresh_token:token-1');
      expect(redis.del).toHaveBeenCalledWith('refresh_token:token-2');
    });

    it('should handle token generation with null/undefined values', async () => {
      const user = {
        id: 'user-123',
        tenant_id: null,
        permissions: undefined,
        role: null,
      };

      (pool.query as jest.Mock).mockResolvedValue({
        rows: [{ tenant_id: 'tenant-456' }],
      });

      const result = await jwtService.generateTokenPair(user);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');

      // Should use default values
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: 'tenant-456',
          permissions: expect.any(Array),
        }),
        expect.any(String),
        expect.any(Object)
      );
    });

    it('should handle Redis connection failures gracefully', async () => {
      const user = {
        id: 'user-123',
        tenant_id: 'tenant-456',
      };

      (redis.setex as jest.Mock).mockRejectedValue(new Error('Redis connection failed'));

      // Should still generate tokens but fail on storage
      await expect(jwtService.generateTokenPair(user))
        .rejects.toThrow('Redis connection failed');
    });
  });

  // =============================================================================
  // GROUP 11: Token Validation Edge Cases - 5 test cases
  // =============================================================================

  describe('Token Validation Edge Cases', () => {
    it('should validate token expiration time is in future', async () => {
      const mockPayload = {
        sub: 'user-123',
        type: 'access',
        jti: 'token-123',
        tenant_id: 'tenant-456',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 900, // 15 minutes in future
      };

      (jwt.verify as jest.Mock).mockReturnValue(mockPayload);

      const result = await jwtService.verifyAccessToken('valid-token');

      expect(result.exp).toBeGreaterThan(result.iat!);
    });

    it('should reject token with expired timestamp', async () => {
      (jwt.verify as jest.Mock).mockImplementation(() => {
        const expiredError = new jwt.TokenExpiredError('jwt expired', new Date(Date.now() - 1000));
        throw expiredError;
      });

      await expect(jwtService.verifyAccessToken('expired-token'))
        .rejects.toThrow('Access token expired');
    });

    it('should verify token has all required claims', async () => {
      const minimalPayload = {
        sub: 'user-123',
        type: 'access',
        tenant_id: 'tenant-456',
      };

      (jwt.verify as jest.Mock).mockReturnValue(minimalPayload);

      const result = await jwtService.verifyAccessToken('token');

      expect(result).toHaveProperty('sub');
      expect(result).toHaveProperty('type');
      expect(result).toHaveProperty('tenant_id');
    });

    it('should handle token with extra unknown claims', async () => {
      const payloadWithExtras = {
        sub: 'user-123',
        type: 'access',
        jti: 'token-123',
        tenant_id: 'tenant-456',
        // Extra claims that should be ignored
        admin: true,
        superUser: true,
        customClaim: 'value',
      };

      (jwt.verify as jest.Mock).mockReturnValue(payloadWithExtras);

      const result = await jwtService.verifyAccessToken('token');

      // Extra claims are present but shouldn't escalate privileges
      expect(result).toHaveProperty('sub', 'user-123');
      expect(result).toHaveProperty('tenant_id', 'tenant-456');
    });

    it('should handle concurrent token verification', async () => {
      const mockPayload = {
        sub: 'user-123',
        type: 'access',
        jti: 'token-123',
        tenant_id: 'tenant-456',
      };

      (jwt.verify as jest.Mock).mockReturnValue(mockPayload);

      // Verify multiple tokens concurrently
      const verifications = await Promise.all([
        jwtService.verifyAccessToken('token-1'),
        jwtService.verifyAccessToken('token-2'),
        jwtService.verifyAccessToken('token-3'),
      ]);

      expect(verifications).toHaveLength(3);
      verifications.forEach(result => {
        expect(result).toHaveProperty('sub');
        expect(result).toHaveProperty('tenant_id');
      });
    });
  });
});
