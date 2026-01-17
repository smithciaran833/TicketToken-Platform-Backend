// Mock CryptoJS BEFORE imports
const mockEncrypt = jest.fn();
const mockDecrypt = jest.fn();
const mockToString = jest.fn();

jest.mock('crypto-js', () => ({
  AES: {
    encrypt: mockEncrypt,
    decrypt: mockDecrypt,
  },
  enc: {
    Utf8: 'utf8',
  },
}));

// Mock database
const mockFirst = jest.fn();
const mockUpdate = jest.fn();
const mockInsert = jest.fn();
const mockWhere = jest.fn();

const mockQueryBuilder = {
  where: mockWhere,
  first: mockFirst,
  update: mockUpdate,
  insert: mockInsert,
};

mockWhere.mockReturnValue(mockQueryBuilder);

const mockDb = jest.fn(() => mockQueryBuilder);

jest.mock('../../../src/config/database', () => ({
  db: mockDb,
}));

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock config - default to development with mock KMS
const mockConfig = {
  security: {
    encryptionKey: 'test-encryption-key-32-chars-long',
    mockKms: true,
  },
  server: {
    nodeEnv: 'development',
  },
};

jest.mock('../../../src/config', () => ({
  config: mockConfig,
}));

import { TokenVaultService } from '../../../src/services/token-vault.service';
import { logger } from '../../../src/utils/logger';

describe('TokenVaultService', () => {
  let service: TokenVaultService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockWhere.mockReturnValue(mockQueryBuilder);
    mockEncrypt.mockReturnValue('encrypted-value');
    mockDecrypt.mockReturnValue({ toString: mockToString });
    mockToString.mockReturnValue('decrypted-value');

    // Reset config to defaults
    mockConfig.security.encryptionKey = 'test-encryption-key-32-chars-long';
    mockConfig.security.mockKms = true;
    mockConfig.server.nodeEnv = 'development';

    service = new TokenVaultService();
  });

  describe('constructor', () => {
    it('should use encryption key from config', () => {
      const svc = new TokenVaultService();
      expect(svc).toBeInstanceOf(TokenVaultService);
    });

    it('should use default key when not configured', () => {
      mockConfig.security.encryptionKey = '';
      const svc = new TokenVaultService();
      expect(svc).toBeInstanceOf(TokenVaultService);
    });

    it('should warn when using mock KMS in production', () => {
      mockConfig.server.nodeEnv = 'production';
      mockConfig.security.mockKms = true;

      new TokenVaultService();

      expect(logger.warn).toHaveBeenCalledWith(
        'Using mock KMS in production - this is not secure!'
      );
    });

    it('should not warn in development', () => {
      mockConfig.server.nodeEnv = 'development';
      mockConfig.security.mockKms = true;

      new TokenVaultService();

      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  describe('storeToken', () => {
    const venueId = 'venue-123';
    const integration = 'stripe';
    const token = {
      access_token: 'access_xxx',
      refresh_token: 'refresh_xxx',
      expires_at: new Date('2025-12-31'),
      scopes: ['read', 'write'],
      token_type: 'Bearer',
    };

    it('should insert new token when none exists', async () => {
      mockFirst.mockResolvedValue(null);
      mockInsert.mockResolvedValue([1]);

      await service.storeToken(venueId, integration, token);

      expect(mockDb).toHaveBeenCalledWith('oauth_tokens');
      expect(mockWhere).toHaveBeenCalledWith({
        venue_id: venueId,
        integration_type: integration,
      });
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          venue_id: venueId,
          integration_type: integration,
          encrypted_access_token: 'encrypted-value',
          encrypted_refresh_token: 'encrypted-value',
          expires_at: token.expires_at,
          scopes: token.scopes,
          token_type: 'Bearer',
        })
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Token stored securely',
        expect.objectContaining({ venueId, integration, hasRefreshToken: true })
      );
    });

    it('should update existing token', async () => {
      mockFirst.mockResolvedValue({ id: 'existing-token-id' });
      mockUpdate.mockResolvedValue(1);

      await service.storeToken(venueId, integration, token);

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          encrypted_access_token: 'encrypted-value',
          encrypted_refresh_token: 'encrypted-value',
          expires_at: token.expires_at,
          scopes: token.scopes,
          last_refreshed_at: expect.any(Date),
          updated_at: expect.any(Date),
        })
      );
    });

    it('should handle token without refresh_token', async () => {
      const tokenWithoutRefresh = {
        access_token: 'access_xxx',
        expires_at: new Date(),
      };

      mockFirst.mockResolvedValue(null);
      mockInsert.mockResolvedValue([1]);

      await service.storeToken(venueId, integration, tokenWithoutRefresh);

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          encrypted_refresh_token: null,
        })
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Token stored securely',
        expect.objectContaining({ hasRefreshToken: false })
      );
    });

    it('should use default token_type when not provided', async () => {
      const tokenWithoutType = {
        access_token: 'access_xxx',
      };

      mockFirst.mockResolvedValue(null);
      mockInsert.mockResolvedValue([1]);

      await service.storeToken(venueId, integration, tokenWithoutType);

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          token_type: 'Bearer',
        })
      );
    });

    it('should propagate database errors', async () => {
      const error = new Error('Database connection failed');
      mockFirst.mockRejectedValue(error);

      await expect(service.storeToken(venueId, integration, token)).rejects.toThrow(
        'Database connection failed'
      );

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to store token',
        expect.objectContaining({ error, venueId, integration })
      );
    });

    it('should encrypt access token', async () => {
      mockFirst.mockResolvedValue(null);
      mockInsert.mockResolvedValue([1]);

      await service.storeToken(venueId, integration, token);

      expect(mockEncrypt).toHaveBeenCalledWith(
        token.access_token,
        expect.any(String)
      );
    });
  });

  describe('getToken', () => {
    const venueId = 'venue-123';
    const integration = 'stripe';

    it('should return decrypted token when found', async () => {
      const record = {
        id: 'token-id',
        encrypted_access_token: 'encrypted-access',
        encrypted_refresh_token: 'encrypted-refresh',
        expires_at: new Date('2025-12-31'),
        scopes: ['read'],
        token_type: 'Bearer',
      };

      mockFirst.mockResolvedValue(record);
      mockUpdate.mockResolvedValue(1);
      mockToString.mockReturnValue('decrypted-token');

      const result = await service.getToken(venueId, integration);

      expect(mockDb).toHaveBeenCalledWith('oauth_tokens');
      expect(mockWhere).toHaveBeenCalledWith({
        venue_id: venueId,
        integration_type: integration,
      });
      expect(result).toEqual({
        access_token: 'decrypted-token',
        refresh_token: 'decrypted-token',
        expires_at: record.expires_at,
        scopes: record.scopes,
        token_type: record.token_type,
      });
    });

    it('should return null when token not found', async () => {
      mockFirst.mockResolvedValue(null);

      const result = await service.getToken(venueId, integration);

      expect(result).toBeNull();
    });

    it('should update last_used_at timestamp', async () => {
      const record = {
        id: 'token-id',
        encrypted_access_token: 'encrypted',
        encrypted_refresh_token: null,
      };

      mockFirst.mockResolvedValue(record);
      mockUpdate.mockResolvedValue(1);

      await service.getToken(venueId, integration);

      expect(mockWhere).toHaveBeenCalledWith({ id: 'token-id' });
      expect(mockUpdate).toHaveBeenCalledWith({
        last_used_at: expect.any(Date),
      });
    });

    it('should handle token without refresh_token', async () => {
      const record = {
        id: 'token-id',
        encrypted_access_token: 'encrypted',
        encrypted_refresh_token: null,
        expires_at: null,
        scopes: null,
        token_type: 'Bearer',
      };

      mockFirst.mockResolvedValue(record);
      mockUpdate.mockResolvedValue(1);

      const result = await service.getToken(venueId, integration);

      expect(result.refresh_token).toBeNull();
    });

    it('should propagate database errors', async () => {
      const error = new Error('Query failed');
      mockFirst.mockRejectedValue(error);

      await expect(service.getToken(venueId, integration)).rejects.toThrow('Query failed');

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to retrieve token',
        expect.objectContaining({ error, venueId, integration })
      );
    });
  });

  describe('storeApiKey', () => {
    const venueId = 'venue-123';
    const integration = 'stripe';
    const apiKey = 'sk_test_xxx';
    const apiSecret = 'whsec_xxx';

    it('should insert new API key when none exists', async () => {
      mockFirst.mockResolvedValue(null);
      mockInsert.mockResolvedValue([1]);

      await service.storeApiKey(venueId, integration, apiKey, apiSecret);

      expect(mockDb).toHaveBeenCalledWith('venue_api_keys');
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          venue_id: venueId,
          integration_type: integration,
          encrypted_api_key: 'encrypted-value',
          encrypted_api_secret: 'encrypted-value',
          environment: 'sandbox',
          is_valid: true,
        })
      );
      expect(logger.info).toHaveBeenCalledWith(
        'API key stored securely',
        { venueId, integration }
      );
    });

    it('should update existing API key', async () => {
      mockFirst.mockResolvedValue({ id: 'existing-key-id' });
      mockUpdate.mockResolvedValue(1);

      await service.storeApiKey(venueId, integration, apiKey, apiSecret);

      expect(mockWhere).toHaveBeenCalledWith({ id: 'existing-key-id' });
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          encrypted_api_key: 'encrypted-value',
          encrypted_api_secret: 'encrypted-value',
          is_valid: true,
          updated_at: expect.any(Date),
        })
      );
    });

    it('should handle API key without secret', async () => {
      mockFirst.mockResolvedValue(null);
      mockInsert.mockResolvedValue([1]);

      await service.storeApiKey(venueId, integration, apiKey);

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          encrypted_api_secret: null,
        })
      );
    });

    it('should use production environment in production', async () => {
      mockConfig.server.nodeEnv = 'production';
      service = new TokenVaultService();

      mockFirst.mockResolvedValue(null);
      mockInsert.mockResolvedValue([1]);

      await service.storeApiKey(venueId, integration, apiKey);

      expect(mockWhere).toHaveBeenCalledWith(
        expect.objectContaining({
          environment: 'production',
        })
      );
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          environment: 'production',
        })
      );
    });

    it('should use sandbox environment in development', async () => {
      mockConfig.server.nodeEnv = 'development';
      service = new TokenVaultService();

      mockFirst.mockResolvedValue(null);
      mockInsert.mockResolvedValue([1]);

      await service.storeApiKey(venueId, integration, apiKey);

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          environment: 'sandbox',
        })
      );
    });

    it('should propagate database errors', async () => {
      const error = new Error('Insert failed');
      mockFirst.mockRejectedValue(error);

      await expect(
        service.storeApiKey(venueId, integration, apiKey)
      ).rejects.toThrow('Insert failed');

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to store API key',
        expect.objectContaining({ error, venueId, integration })
      );
    });
  });

  describe('getApiKey', () => {
    const venueId = 'venue-123';
    const integration = 'stripe';

    it('should return decrypted API key when found', async () => {
      const record = {
        encrypted_api_key: 'encrypted-key',
        encrypted_api_secret: 'encrypted-secret',
      };

      mockFirst.mockResolvedValue(record);
      mockToString.mockReturnValue('decrypted-value');

      const result = await service.getApiKey(venueId, integration);

      expect(mockDb).toHaveBeenCalledWith('venue_api_keys');
      expect(mockWhere).toHaveBeenCalledWith({
        venue_id: venueId,
        integration_type: integration,
        environment: 'sandbox',
      });
      expect(result).toEqual({
        api_key: 'decrypted-value',
        api_secret: 'decrypted-value',
      });
    });

    it('should return null when API key not found', async () => {
      mockFirst.mockResolvedValue(null);

      const result = await service.getApiKey(venueId, integration);

      expect(result).toBeNull();
    });

    it('should handle API key without secret', async () => {
      const record = {
        encrypted_api_key: 'encrypted-key',
        encrypted_api_secret: null,
      };

      mockFirst.mockResolvedValue(record);

      const result = await service.getApiKey(venueId, integration);

      expect(result.api_secret).toBeNull();
    });

    it('should use production environment in production', async () => {
      mockConfig.server.nodeEnv = 'production';
      service = new TokenVaultService();

      mockFirst.mockResolvedValue(null);

      await service.getApiKey(venueId, integration);

      expect(mockWhere).toHaveBeenCalledWith(
        expect.objectContaining({
          environment: 'production',
        })
      );
    });

    it('should propagate database errors', async () => {
      const error = new Error('Query failed');
      mockFirst.mockRejectedValue(error);

      await expect(service.getApiKey(venueId, integration)).rejects.toThrow('Query failed');

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to retrieve API key',
        expect.objectContaining({ error, venueId, integration })
      );
    });
  });

  describe('refreshTokenIfNeeded', () => {
    const venueId = 'venue-123';
    const integration = 'stripe';

    it('should return token as-is when not expired', async () => {
      const futureDate = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
      const record = {
        id: 'token-id',
        encrypted_access_token: 'encrypted',
        encrypted_refresh_token: 'encrypted-refresh',
        expires_at: futureDate,
        scopes: ['read'],
        token_type: 'Bearer',
      };

      mockFirst.mockResolvedValue(record);
      mockUpdate.mockResolvedValue(1);

      const result = await service.refreshTokenIfNeeded(venueId, integration);

      expect(result).toBeDefined();
      expect(logger.info).not.toHaveBeenCalledWith(
        'Token needs refresh',
        expect.any(Object)
      );
    });

    it('should return null when no token exists', async () => {
      mockFirst.mockResolvedValue(null);

      const result = await service.refreshTokenIfNeeded(venueId, integration);

      expect(result).toBeNull();
    });

    it('should return token when expires_at is null', async () => {
      const record = {
        id: 'token-id',
        encrypted_access_token: 'encrypted',
        encrypted_refresh_token: null,
        expires_at: null,
        scopes: null,
        token_type: 'Bearer',
      };

      mockFirst.mockResolvedValue(record);
      mockUpdate.mockResolvedValue(1);

      const result = await service.refreshTokenIfNeeded(venueId, integration);

      expect(result).toBeDefined();
    });

    it('should log when token needs refresh (expires in < 5 minutes)', async () => {
      const soonDate = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes from now
      const record = {
        id: 'token-id',
        encrypted_access_token: 'encrypted',
        encrypted_refresh_token: 'encrypted-refresh',
        expires_at: soonDate,
        scopes: ['read'],
        token_type: 'Bearer',
      };

      mockFirst.mockResolvedValue(record);
      mockUpdate.mockResolvedValue(1);

      await service.refreshTokenIfNeeded(venueId, integration);

      expect(logger.info).toHaveBeenCalledWith(
        'Token needs refresh',
        expect.objectContaining({ venueId, integration })
      );
    });

    it('should return existing token even when refresh needed (placeholder behavior)', async () => {
      const soonDate = new Date(Date.now() + 1 * 60 * 1000); // 1 minute from now
      const record = {
        id: 'token-id',
        encrypted_access_token: 'encrypted',
        encrypted_refresh_token: null,
        expires_at: soonDate,
        scopes: null,
        token_type: 'Bearer',
      };

      mockFirst.mockResolvedValue(record);
      mockUpdate.mockResolvedValue(1);

      const result = await service.refreshTokenIfNeeded(venueId, integration);

      // Current implementation returns token as-is (refresh not implemented yet)
      expect(result).toBeDefined();
    });
  });

  describe('encryption', () => {
    it('should throw error when mockKms is false', async () => {
      mockConfig.security.mockKms = false;
      service = new TokenVaultService();

      mockFirst.mockResolvedValue(null);

      await expect(
        service.storeToken('venue', 'stripe', { access_token: 'test' })
      ).rejects.toThrow('Real KMS not implemented yet');
    });

    it('should use CryptoJS AES encryption when mockKms is true', async () => {
      mockConfig.security.mockKms = true;
      service = new TokenVaultService();

      mockFirst.mockResolvedValue(null);
      mockInsert.mockResolvedValue([1]);

      await service.storeToken('venue', 'stripe', { access_token: 'test-token' });

      expect(mockEncrypt).toHaveBeenCalledWith('test-token', expect.any(String));
    });
  });

  describe('decryption', () => {
    it('should throw error when mockKms is false', async () => {
      mockConfig.security.mockKms = false;
      service = new TokenVaultService();

      const record = {
        id: 'token-id',
        encrypted_access_token: 'encrypted',
        encrypted_refresh_token: null,
      };

      mockFirst.mockResolvedValue(record);
      mockUpdate.mockResolvedValue(1);

      await expect(service.getToken('venue', 'stripe')).rejects.toThrow(
        'Real KMS not implemented yet'
      );
    });
  });
});

describe('tokenVault singleton', () => {
  it('should export tokenVault instance', async () => {
    // Re-import to test singleton
    const { tokenVault } = await import('../../../src/services/token-vault.service');
    expect(tokenVault).toBeInstanceOf(TokenVaultService);
  });
});
