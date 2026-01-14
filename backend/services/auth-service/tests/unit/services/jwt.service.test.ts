import { TokenError } from '../../../src/errors';

// Mocks defined before jest.mock calls
const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
};

const mockScanner = {
  scanKeys: jest.fn(),
};

const mockPool = {
  query: jest.fn(),
};

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

jest.mock('jsonwebtoken', () => {
  class TokenExpiredError extends Error {
    constructor() {
      super('jwt expired');
      this.name = 'TokenExpiredError';
    }
  }
  return {
    sign: jest.fn().mockReturnValue('mock-token'),
    verify: jest.fn(),
    decode: jest.fn(),
    TokenExpiredError,
  };
});

jest.mock('fs', () => ({
  readFileSync: jest.fn().mockReturnValue(`-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEAtestkey
-----END RSA PRIVATE KEY-----`),
}));

jest.mock('../../../src/config/redis', () => ({
  getRedis: jest.fn(() => mockRedis),
}));

jest.mock('../../../src/config/database', () => ({
  pool: mockPool,
}));

jest.mock('../../../src/config/env', () => ({
  env: {
    isProduction: false,
    JWT_PRIVATE_KEY: `-----BEGIN RSA PRIVATE KEY-----
PLACEHOLDER_FOR_TESTING
-----END RSA PRIVATE KEY-----`,
    JWT_PUBLIC_KEY: `-----BEGIN PUBLIC KEY-----
PLACEHOLDER_FOR_TESTING
-----END PUBLIC KEY-----`,
    JWT_PRIVATE_KEY_PATH: '/fake/path/private.pem',
    JWT_PUBLIC_KEY_PATH: '/fake/path/public.pem',
    JWT_ISSUER: 'test-issuer',
    JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '7d',
    DEFAULT_TENANT_ID: 'default-tenant',
  },
}));

jest.mock('@tickettoken/shared', () => ({
  getScanner: jest.fn(() => mockScanner),
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: mockLogger,
}));

jest.mock('../../../src/utils/redisKeys', () => ({
  redisKeys: {
    refreshToken: (id: string, tenantId: string) => `tenant:${tenantId}:refresh_token:${id}`,
  },
}));

// Import AFTER mocks
import { JWTService } from '../../../src/services/jwt.service';
import jwt from 'jsonwebtoken';

describe('JWTService', () => {
  let service: JWTService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new JWTService();
    
    // Default mock setups
    (jwt.sign as jest.Mock).mockReturnValue('mock-token');
    (jwt.decode as jest.Mock).mockReturnValue({ header: { kid: 'dev' } });
    mockPool.query.mockResolvedValue({ rows: [{ tenant_id: 'tenant-456' }] });
  });

  describe('initialize', () => {
    it('should load keys from filesystem in development mode', async () => {
      await service.initialize();
      // Keys are loaded - service should work
      expect(service).toBeDefined();
    });

    it('should be idempotent - multiple calls work', async () => {
      await service.initialize();
      await service.initialize();
      await service.initialize();
      // Should not throw
      expect(service).toBeDefined();
    });
  });

  describe('generateTokenPair', () => {
    const mockUser = {
      id: 'user-123',
      tenant_id: 'tenant-456',
      email: 'test@example.com',
      permissions: ['read', 'write'],
      role: 'admin',
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
    };

    beforeEach(async () => {
      await service.initialize();
    });

    it('should generate access and refresh tokens', async () => {
      const result = await service.generateTokenPair(mockUser);

      expect(result).toHaveProperty('accessToken', 'mock-token');
      expect(result).toHaveProperty('refreshToken', 'mock-token');
      expect(jwt.sign).toHaveBeenCalledTimes(2);
    });

    it('should sign access token with correct payload', async () => {
      await service.generateTokenPair(mockUser);

      const accessCall = (jwt.sign as jest.Mock).mock.calls[0];
      const payload = accessCall[0];

      expect(payload.sub).toBe('user-123');
      expect(payload.type).toBe('access');
      expect(payload.tenant_id).toBe('tenant-456');
      expect(payload.email).toBe('test@example.com');
      expect(payload.permissions).toEqual(['read', 'write']);
      expect(payload.role).toBe('admin');
      expect(payload.jti).toBeDefined();
    });

    it('should sign refresh token with correct payload', async () => {
      await service.generateTokenPair(mockUser);

      const refreshCall = (jwt.sign as jest.Mock).mock.calls[1];
      const payload = refreshCall[0];

      expect(payload.sub).toBe('user-123');
      expect(payload.type).toBe('refresh');
      expect(payload.tenant_id).toBe('tenant-456');
      expect(payload.family).toBeDefined();
      expect(payload.jti).toBeDefined();
    });

    it('should use RS256 algorithm', async () => {
      await service.generateTokenPair(mockUser);

      const accessOptions = (jwt.sign as jest.Mock).mock.calls[0][2];
      const refreshOptions = (jwt.sign as jest.Mock).mock.calls[1][2];

      expect(accessOptions.algorithm).toBe('RS256');
      expect(refreshOptions.algorithm).toBe('RS256');
    });

    it('should store refresh token in Redis with tenant prefix', async () => {
      await service.generateTokenPair(mockUser);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        expect.stringContaining('tenant:tenant-456:refresh_token:'),
        7 * 24 * 60 * 60,
        expect.any(String)
      );

      const storedData = JSON.parse(mockRedis.setex.mock.calls[0][2]);
      expect(storedData.userId).toBe('user-123');
      expect(storedData.tenantId).toBe('tenant-456');
      expect(storedData.ipAddress).toBe('192.168.1.1');
      expect(storedData.userAgent).toBe('Mozilla/5.0');
    });

    it('should fetch tenant_id from DB if not provided', async () => {
      const userWithoutTenant = { id: 'user-123', email: 'test@example.com' };
      mockPool.query.mockResolvedValue({ rows: [{ tenant_id: 'db-tenant' }] });

      await service.generateTokenPair(userWithoutTenant);

      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT tenant_id FROM users WHERE id = $1',
        ['user-123']
      );
    });

    it('should use DEFAULT_TENANT_ID if not in user or DB', async () => {
      const userWithoutTenant = { id: 'user-123', email: 'test@example.com' };
      mockPool.query.mockResolvedValue({ rows: [] });

      await service.generateTokenPair(userWithoutTenant);

      const accessCall = (jwt.sign as jest.Mock).mock.calls[0];
      expect(accessCall[0].tenant_id).toBe('default-tenant');
    });

    it('should use default permissions if not provided', async () => {
      const userWithoutPermissions = { id: 'user-123', tenant_id: 'tenant-456' };

      await service.generateTokenPair(userWithoutPermissions);

      const accessCall = (jwt.sign as jest.Mock).mock.calls[0];
      expect(accessCall[0].permissions).toEqual(['buy:tickets', 'view:events', 'transfer:tickets']);
    });

    it('should use default role if not provided', async () => {
      const userWithoutRole = { id: 'user-123', tenant_id: 'tenant-456' };

      await service.generateTokenPair(userWithoutRole);

      const accessCall = (jwt.sign as jest.Mock).mock.calls[0];
      expect(accessCall[0].role).toBe('customer');
    });

    it('should use default ipAddress and userAgent if not provided', async () => {
      const userWithoutMeta = { id: 'user-123', tenant_id: 'tenant-456' };

      await service.generateTokenPair(userWithoutMeta);

      const storedData = JSON.parse(mockRedis.setex.mock.calls[0][2]);
      expect(storedData.ipAddress).toBe('unknown');
      expect(storedData.userAgent).toBe('unknown');
    });
  });

  describe('verifyAccessToken', () => {
    const validPayload = {
      sub: 'user-123',
      type: 'access',
      jti: 'token-id',
      tenant_id: 'tenant-456',
      email: 'test@example.com',
    };

    beforeEach(async () => {
      await service.initialize();
      (jwt.verify as jest.Mock).mockReturnValue(validPayload);
    });

    it('should return payload for valid token', async () => {
      const result = await service.verifyAccessToken('valid-token');

      expect(result).toEqual(validPayload);
      expect(jwt.verify).toHaveBeenCalledWith(
        'valid-token',
        expect.any(String),
        expect.objectContaining({
          issuer: 'test-issuer',
          audience: 'test-issuer',
          algorithms: ['RS256'],
        })
      );
    });

    it('should throw TokenError for expired token', async () => {
      const { TokenExpiredError } = jest.requireMock('jsonwebtoken');
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new TokenExpiredError();
      });

      await expect(service.verifyAccessToken('expired-token')).rejects.toThrow(TokenError);
      await expect(service.verifyAccessToken('expired-token')).rejects.toThrow('Access token expired');
    });

    it('should throw TokenError if type is not access', async () => {
      (jwt.verify as jest.Mock).mockReturnValue({ ...validPayload, type: 'refresh' });

      await expect(service.verifyAccessToken('wrong-type')).rejects.toThrow(TokenError);
      await expect(service.verifyAccessToken('wrong-type')).rejects.toThrow('Invalid token type');
    });

    it('should throw TokenError if tenant_id is missing', async () => {
      (jwt.verify as jest.Mock).mockReturnValue({ ...validPayload, tenant_id: undefined });

      await expect(service.verifyAccessToken('no-tenant')).rejects.toThrow(TokenError);
      await expect(service.verifyAccessToken('no-tenant')).rejects.toThrow('missing tenant context');
    });

    it('should re-throw TokenError as-is', async () => {
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new TokenError('Custom token error');
      });

      await expect(service.verifyAccessToken('token')).rejects.toThrow('Custom token error');
    });

    it('should throw generic error for other errors', async () => {
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('Some other error');
      });

      await expect(service.verifyAccessToken('invalid')).rejects.toThrow('Invalid access token');
    });
  });

  describe('refreshTokens', () => {
    const validRefreshPayload = {
      sub: 'user-123',
      type: 'refresh',
      jti: 'refresh-token-id',
      tenant_id: 'tenant-456',
      family: 'token-family',
    };

    const storedTokenData = {
      userId: 'user-123',
      tenantId: 'tenant-456',
      family: 'token-family',
      createdAt: Date.now(),
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
    };

    beforeEach(async () => {
      await service.initialize();
      (jwt.verify as jest.Mock).mockReturnValue(validRefreshPayload);
      mockRedis.get.mockResolvedValue(JSON.stringify(storedTokenData));
      mockPool.query.mockResolvedValue({
        rows: [{
          id: 'user-123',
          tenant_id: 'tenant-456',
          email: 'test@example.com',
          permissions: ['read'],
          role: 'customer',
        }],
      });
      mockScanner.scanKeys.mockResolvedValue([]);
    });

    it('should return new token pair on valid refresh', async () => {
      const result = await service.refreshTokens('valid-refresh', '127.0.0.1', 'agent');

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    it('should delete old refresh token from Redis', async () => {
      await service.refreshTokens('valid-refresh', '127.0.0.1', 'agent');

      expect(mockRedis.del).toHaveBeenCalledWith(
        'tenant:tenant-456:refresh_token:refresh-token-id'
      );
    });

    it('should throw TokenError if type is not refresh', async () => {
      (jwt.verify as jest.Mock).mockReturnValue({ ...validRefreshPayload, type: 'access' });

      await expect(service.refreshTokens('wrong-type', '127.0.0.1', 'agent')).rejects.toThrow(TokenError);
      await expect(service.refreshTokens('wrong-type', '127.0.0.1', 'agent')).rejects.toThrow('Invalid token type');
    });

    it('should detect token reuse and invalidate family', async () => {
      mockRedis.get.mockResolvedValue(null);

      await expect(service.refreshTokens('reused-token', '127.0.0.1', 'agent')).rejects.toThrow('Token reuse detected');
    });

    it('should throw TokenError if user not found', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await expect(service.refreshTokens('valid-refresh', '127.0.0.1', 'agent')).rejects.toThrow('User not found');
    });

    it('should re-throw TokenError as-is', async () => {
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new TokenError('Custom error');
      });

      await expect(service.refreshTokens('token', '127.0.0.1', 'agent')).rejects.toThrow('Custom error');
    });

    it('should throw generic error for other errors', async () => {
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('Some JWT error');
      });

      await expect(service.refreshTokens('invalid', '127.0.0.1', 'agent')).rejects.toThrow('Invalid refresh token');
    });
  });

  describe('invalidateTokenFamily', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should use tenant-prefixed pattern when tenantId provided', async () => {
      mockScanner.scanKeys.mockResolvedValue([]);

      await service.invalidateTokenFamily('family-123', 'tenant-456');

      expect(mockScanner.scanKeys).toHaveBeenCalledWith('tenant:tenant-456:refresh_token:*');
    });

    it('should use non-tenant pattern when tenantId not provided', async () => {
      mockScanner.scanKeys.mockResolvedValue([]);

      await service.invalidateTokenFamily('family-123');

      expect(mockScanner.scanKeys).toHaveBeenCalledWith('refresh_token:*');
    });

    it('should delete tokens matching the family', async () => {
      const keys = ['tenant:t1:refresh_token:a', 'tenant:t1:refresh_token:b', 'tenant:t1:refresh_token:c'];
      mockScanner.scanKeys.mockResolvedValue(keys);
      mockRedis.get.mockImplementation((key: string) => {
        if (key.includes(':a')) return JSON.stringify({ family: 'target-family' });
        if (key.includes(':b')) return JSON.stringify({ family: 'target-family' });
        return JSON.stringify({ family: 'other-family' });
      });

      await service.invalidateTokenFamily('target-family', 't1');

      expect(mockRedis.del).toHaveBeenCalledWith('tenant:t1:refresh_token:a');
      expect(mockRedis.del).toHaveBeenCalledWith('tenant:t1:refresh_token:b');
      expect(mockRedis.del).not.toHaveBeenCalledWith('tenant:t1:refresh_token:c');
    });

    it('should skip keys with no data', async () => {
      mockScanner.scanKeys.mockResolvedValue(['key1', 'key2']);
      mockRedis.get.mockResolvedValue(null);

      await service.invalidateTokenFamily('family', 'tenant');

      expect(mockRedis.del).not.toHaveBeenCalled();
    });
  });

  describe('revokeAllUserTokens', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should use tenant-prefixed pattern when tenantId provided', async () => {
      mockScanner.scanKeys.mockResolvedValue([]);

      await service.revokeAllUserTokens('user-123', 'tenant-456');

      expect(mockScanner.scanKeys).toHaveBeenCalledWith('tenant:tenant-456:refresh_token:*');
    });

    it('should use non-tenant pattern when tenantId not provided', async () => {
      mockScanner.scanKeys.mockResolvedValue([]);

      await service.revokeAllUserTokens('user-123');

      expect(mockScanner.scanKeys).toHaveBeenCalledWith('refresh_token:*');
    });

    it('should delete tokens matching the userId', async () => {
      const keys = ['tenant:t1:refresh_token:a', 'tenant:t1:refresh_token:b'];
      mockScanner.scanKeys.mockResolvedValue(keys);
      mockRedis.get.mockImplementation((key: string) => {
        if (key.includes(':a')) return JSON.stringify({ userId: 'user-123' });
        return JSON.stringify({ userId: 'other-user' });
      });

      await service.revokeAllUserTokens('user-123', 't1');

      expect(mockRedis.del).toHaveBeenCalledWith('tenant:t1:refresh_token:a');
      expect(mockRedis.del).not.toHaveBeenCalledWith('tenant:t1:refresh_token:b');
    });
  });

  describe('decode', () => {
    it('should decode token without verification', () => {
      const mockPayload = { sub: 'user-123', type: 'access' };
      (jwt.decode as jest.Mock).mockReturnValue(mockPayload);

      const result = service.decode('any-token');

      expect(result).toEqual(mockPayload);
      expect(jwt.decode).toHaveBeenCalledWith('any-token');
    });
  });

  describe('verifyRefreshToken', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should return verified payload', async () => {
      const payload = { sub: 'user-123', type: 'refresh' };
      (jwt.verify as jest.Mock).mockReturnValue(payload);

      const result = await service.verifyRefreshToken('valid-token');

      expect(result).toEqual(payload);
      expect(jwt.verify).toHaveBeenCalledWith(
        'valid-token',
        expect.any(String),
        { algorithms: ['RS256'] }
      );
    });

    it('should throw error for invalid token', async () => {
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('invalid');
      });

      await expect(service.verifyRefreshToken('invalid')).rejects.toThrow('Invalid refresh token');
    });
  });

  describe('getJWKS', () => {
    it('should return JWKS format with all public keys', async () => {
      await service.initialize();

      const result = service.getJWKS();

      expect(result).toHaveProperty('keys');
      expect(Array.isArray(result.keys)).toBe(true);
      expect(result.keys.length).toBeGreaterThan(0);
      expect(result.keys[0]).toMatchObject({
        kty: 'RSA',
        use: 'sig',
        alg: 'RS256',
      });
      expect(result.keys[0]).toHaveProperty('kid');
      expect(result.keys[0]).toHaveProperty('pem');
    });
  });

  describe('getPublicKey', () => {
    it('should return current public key', async () => {
      await service.initialize();

      const result = service.getPublicKey();

      expect(typeof result).toBe('string');
      expect(result).toContain('-----BEGIN');
    });
  });
});
