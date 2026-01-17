// Mock crypto BEFORE imports
const mockRandomBytes = jest.fn();
jest.mock('crypto', () => ({
  randomBytes: mockRandomBytes,
}));

// Mock Redis BEFORE imports
const mockSetex = jest.fn();
const mockGet = jest.fn();
const mockDel = jest.fn();

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    setex: mockSetex,
    get: mockGet,
    del: mockDel,
  }));
});

// Mock axios
const mockAxiosPost = jest.fn();
jest.mock('axios', () => ({
  post: mockAxiosPost,
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

// Mock tokenVault
const mockStoreToken = jest.fn();
const mockGetToken = jest.fn();

jest.mock('../../../src/services/token-vault.service', () => ({
  tokenVault: {
    storeToken: mockStoreToken,
    getToken: mockGetToken,
  },
}));

// Mock config
const mockConfig = {
  redis: {
    host: 'localhost',
    port: 6379,
    password: undefined,
    db: 0,
  },
  server: {
    apiUrl: 'https://api.example.com',
  },
  providers: {
    square: {
      clientId: 'square-client-id',
      clientSecret: 'square-client-secret',
      sandbox: true,
    },
    mailchimp: {
      clientId: 'mailchimp-client-id',
      clientSecret: 'mailchimp-client-secret',
    },
    quickbooks: {
      clientId: 'quickbooks-client-id',
      clientSecret: 'quickbooks-client-secret',
    },
  },
};

jest.mock('../../../src/config', () => ({
  config: mockConfig,
}));

import { OAuthService } from '../../../src/services/oauth.service';
import { logger } from '../../../src/utils/logger';
import { tokenVault } from '../../../src/services/token-vault.service';
import Redis from 'ioredis';

describe('OAuthService', () => {
  let service: OAuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockWhere.mockReturnValue(mockQueryBuilder);
    mockRandomBytes.mockReturnValue({
      toString: jest.fn().mockReturnValue('mock-state-token-12345'),
    });

    // Reset config to defaults
    mockConfig.providers.square.sandbox = true;

    service = new OAuthService();
  });

  describe('constructor', () => {
    it('should initialize Redis with config', () => {
      expect(Redis).toHaveBeenCalledWith({
        host: 'localhost',
        port: 6379,
        password: undefined,
        db: 0,
      });
    });
  });

  describe('initiateOAuth', () => {
    const venueId = 'venue-123';
    const integrationType = 'square';
    const userId = 'user-456';

    it('should generate state token and store in Redis', async () => {
      mockSetex.mockResolvedValue('OK');
      mockInsert.mockResolvedValue([1]);

      await service.initiateOAuth(venueId, integrationType, userId);

      expect(mockRandomBytes).toHaveBeenCalledWith(32);
      expect(mockSetex).toHaveBeenCalledWith(
        'oauth:state:mock-state-token-12345',
        600,
        expect.stringContaining(venueId)
      );
    });

    it('should store correct state data in Redis', async () => {
      mockSetex.mockResolvedValue('OK');
      mockInsert.mockResolvedValue([1]);

      await service.initiateOAuth(venueId, integrationType, userId);

      const stateDataArg = mockSetex.mock.calls[0][2];
      const stateData = JSON.parse(stateDataArg);

      expect(stateData.venueId).toBe(venueId);
      expect(stateData.integrationType).toBe(integrationType);
      expect(stateData.userId).toBe(userId);
      expect(stateData.createdAt).toBeDefined();
    });

    it('should log OAuth initiation to sync_logs', async () => {
      mockSetex.mockResolvedValue('OK');
      mockInsert.mockResolvedValue([1]);

      await service.initiateOAuth(venueId, integrationType, userId);

      expect(mockDb).toHaveBeenCalledWith('sync_logs');
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          venue_id: venueId,
          integration_type: integrationType,
          operation: 'oauth_initiated',
          status: 'pending',
          started_at: expect.any(Date),
        })
      );
    });

    it('should return Square OAuth URL for sandbox', async () => {
      mockSetex.mockResolvedValue('OK');
      mockInsert.mockResolvedValue([1]);

      const url = await service.initiateOAuth(venueId, 'square', userId);

      expect(url).toContain('https://connect.squareupsandbox.com');
      expect(url).toContain('client_id=square-client-id');
      expect(url).toContain('state=mock-state-token-12345');
    });

    it('should return Square OAuth URL for production', async () => {
      mockConfig.providers.square.sandbox = false;
      service = new OAuthService();

      mockSetex.mockResolvedValue('OK');
      mockInsert.mockResolvedValue([1]);

      const url = await service.initiateOAuth(venueId, 'square', userId);

      expect(url).toContain('https://connect.squareup.com');
    });

    it('should return Mailchimp OAuth URL', async () => {
      mockSetex.mockResolvedValue('OK');
      mockInsert.mockResolvedValue([1]);

      const url = await service.initiateOAuth(venueId, 'mailchimp', userId);

      expect(url).toContain('https://login.mailchimp.com');
      expect(url).toContain('client_id=mailchimp-client-id');
      expect(url).toContain('response_type=code');
    });

    it('should return QuickBooks OAuth URL', async () => {
      mockSetex.mockResolvedValue('OK');
      mockInsert.mockResolvedValue([1]);

      const url = await service.initiateOAuth(venueId, 'quickbooks', userId);

      expect(url).toContain('https://appcenter.intuit.com');
      expect(url).toContain('/connect/oauth2');
      expect(url).toContain('client_id=quickbooks-client-id');
      expect(url).toContain('redirect_uri=');
    });

    it('should log info on success', async () => {
      mockSetex.mockResolvedValue('OK');
      mockInsert.mockResolvedValue([1]);

      await service.initiateOAuth(venueId, integrationType, userId);

      expect(logger.info).toHaveBeenCalledWith('OAuth initiated', {
        venueId,
        integrationType,
        userId,
      });
    });

    it('should propagate errors and log', async () => {
      const error = new Error('Redis connection failed');
      mockSetex.mockRejectedValue(error);

      await expect(
        service.initiateOAuth(venueId, integrationType, userId)
      ).rejects.toThrow('Redis connection failed');

      expect(logger.error).toHaveBeenCalledWith('Failed to initiate OAuth', {
        venueId,
        integrationType,
        error,
      });
    });
  });

  describe('handleCallback', () => {
    const provider = 'square';
    const code = 'auth-code-123';
    const state = 'valid-state-token';

    const stateData = {
      venueId: 'venue-123',
      integrationType: 'square',
      userId: 'user-456',
      createdAt: new Date().toISOString(),
    };

    const tokenResponse = {
      access_token: 'access-token-xyz',
      refresh_token: 'refresh-token-xyz',
      expires_in: 3600,
      scope: 'ITEMS_READ ITEMS_WRITE',
    };

    beforeEach(() => {
      mockGet.mockResolvedValue(JSON.stringify(stateData));
      mockAxiosPost.mockResolvedValue({ data: tokenResponse });
      mockStoreToken.mockResolvedValue(undefined);
      mockFirst.mockResolvedValue(null);
      mockInsert.mockResolvedValue([1]);
      mockDel.mockResolvedValue(1);
    });

    it('should verify state from Redis', async () => {
      await service.handleCallback(provider, code, state);

      expect(mockGet).toHaveBeenCalledWith(`oauth:state:${state}`);
    });

    it('should throw error for invalid state', async () => {
      mockGet.mockResolvedValue(null);

      await expect(
        service.handleCallback(provider, code, state)
      ).rejects.toThrow('Invalid or expired state token');
    });

    it('should exchange code for token - Square', async () => {
      await service.handleCallback('square', code, state);

      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://connect.squareupsandbox.com/oauth2/token',
        expect.objectContaining({
          client_id: 'square-client-id',
          client_secret: 'square-client-secret',
          code,
          grant_type: 'authorization_code',
        })
      );
    });

    it('should exchange code for token - Square production', async () => {
      mockConfig.providers.square.sandbox = false;
      service = new OAuthService();

      await service.handleCallback('square', code, state);

      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://connect.squareup.com/oauth2/token',
        expect.any(Object)
      );
    });

    it('should exchange code for token - Mailchimp', async () => {
      const mailchimpStateData = { ...stateData, integrationType: 'mailchimp' };
      mockGet.mockResolvedValue(JSON.stringify(mailchimpStateData));

      await service.handleCallback('mailchimp', code, state);

      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://login.mailchimp.com/oauth2/token',
        expect.any(URLSearchParams)
      );
    });

    it('should exchange code for token - QuickBooks', async () => {
      const qbStateData = { ...stateData, integrationType: 'quickbooks' };
      mockGet.mockResolvedValue(JSON.stringify(qbStateData));

      await service.handleCallback('quickbooks', code, state);

      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
        expect.any(URLSearchParams),
        expect.objectContaining({
          auth: {
            username: 'quickbooks-client-id',
            password: 'quickbooks-client-secret',
          },
        })
      );
    });

    it('should throw error for unknown provider', async () => {
      await expect(
        service.handleCallback('unknown', code, state)
      ).rejects.toThrow('Unknown provider: unknown');
    });

    it('should store tokens securely', async () => {
      await service.handleCallback(provider, code, state);

      expect(mockStoreToken).toHaveBeenCalledWith(
        stateData.venueId,
        provider,
        expect.objectContaining({
          access_token: tokenResponse.access_token,
          refresh_token: tokenResponse.refresh_token,
          expires_at: expect.any(Date),
          scopes: ['ITEMS_READ', 'ITEMS_WRITE'],
        })
      );
    });

    it('should handle tokens without scope', async () => {
      mockAxiosPost.mockResolvedValue({
        data: { access_token: 'token', refresh_token: 'refresh' },
      });

      await service.handleCallback(provider, code, state);

      expect(mockStoreToken).toHaveBeenCalledWith(
        stateData.venueId,
        provider,
        expect.objectContaining({
          scopes: [],
        })
      );
    });

    it('should insert new integration config when none exists', async () => {
      mockFirst.mockResolvedValue(null);

      await service.handleCallback(provider, code, state);

      expect(mockDb).toHaveBeenCalledWith('integration_configs');
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          venue_id: stateData.venueId,
          integration_type: provider,
          status: 'connected',
          connected_at: expect.any(Date),
          config: {
            syncEnabled: true,
            syncInterval: 300,
          },
        })
      );
    });

    it('should update existing integration config', async () => {
      mockFirst.mockResolvedValue({ id: 'existing-config-id' });
      mockUpdate.mockResolvedValue(1);

      await service.handleCallback(provider, code, state);

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'connected',
          connected_at: expect.any(Date),
          updated_at: expect.any(Date),
        })
      );
    });

    it('should clean up state from Redis', async () => {
      await service.handleCallback(provider, code, state);

      expect(mockDel).toHaveBeenCalledWith(`oauth:state:${state}`);
    });

    it('should log OAuth completion to sync_logs', async () => {
      await service.handleCallback(provider, code, state);

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          venue_id: stateData.venueId,
          integration_type: provider,
          operation: 'oauth_completed',
          status: 'completed',
        })
      );
    });

    it('should return success response', async () => {
      const result = await service.handleCallback(provider, code, state);

      expect(result).toEqual({
        success: true,
        venueId: stateData.venueId,
        provider,
      });
    });

    it('should log info on success', async () => {
      await service.handleCallback(provider, code, state);

      expect(logger.info).toHaveBeenCalledWith('OAuth completed successfully', {
        venueId: stateData.venueId,
        provider,
      });
    });

    it('should propagate errors and log', async () => {
      const error = new Error('Token exchange failed');
      mockAxiosPost.mockRejectedValue(error);

      await expect(
        service.handleCallback(provider, code, state)
      ).rejects.toThrow('Token exchange failed');

      expect(logger.error).toHaveBeenCalledWith('OAuth callback failed', {
        provider,
        error: error.message,
      });
    });

    it('should throw error when Mailchimp credentials not configured', async () => {
      const originalClientId = mockConfig.providers.mailchimp.clientId;
      mockConfig.providers.mailchimp.clientId = '';

      const mailchimpStateData = { ...stateData, integrationType: 'mailchimp' };
      mockGet.mockResolvedValue(JSON.stringify(mailchimpStateData));

      await expect(
        service.handleCallback('mailchimp', code, state)
      ).rejects.toThrow('Mailchimp OAuth credentials not configured');

      mockConfig.providers.mailchimp.clientId = originalClientId;
    });

    it('should throw error when QuickBooks credentials not configured', async () => {
      const originalClientId = mockConfig.providers.quickbooks.clientId;
      mockConfig.providers.quickbooks.clientId = '';

      const qbStateData = { ...stateData, integrationType: 'quickbooks' };
      mockGet.mockResolvedValue(JSON.stringify(qbStateData));

      await expect(
        service.handleCallback('quickbooks', code, state)
      ).rejects.toThrow('QuickBooks OAuth credentials not configured');

      mockConfig.providers.quickbooks.clientId = originalClientId;
    });
  });

  describe('refreshToken', () => {
    const venueId = 'venue-123';

    const existingToken = {
      access_token: 'old-access-token',
      refresh_token: 'refresh-token-xyz',
      expires_at: new Date(),
      scopes: ['read', 'write'],
    };

    const newTokenResponse = {
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
      expires_in: 3600,
      scope: 'read write',
    };

    beforeEach(() => {
      mockGetToken.mockResolvedValue(existingToken);
      mockAxiosPost.mockResolvedValue({ data: newTokenResponse });
      mockStoreToken.mockResolvedValue(undefined);
    });

    it('should get existing token from vault', async () => {
      await service.refreshToken(venueId, 'square');

      expect(mockGetToken).toHaveBeenCalledWith(venueId, 'square');
    });

    it('should throw error when no token exists', async () => {
      mockGetToken.mockResolvedValue(null);

      await expect(service.refreshToken(venueId, 'square')).rejects.toThrow(
        'No refresh token available'
      );
    });

    it('should throw error when no refresh token', async () => {
      mockGetToken.mockResolvedValue({ access_token: 'access', refresh_token: null });

      await expect(service.refreshToken(venueId, 'square')).rejects.toThrow(
        'No refresh token available'
      );
    });

    it('should refresh Square token', async () => {
      await service.refreshToken(venueId, 'square');

      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://connect.squareupsandbox.com/oauth2/token',
        expect.objectContaining({
          client_id: 'square-client-id',
          client_secret: 'square-client-secret',
          refresh_token: existingToken.refresh_token,
          grant_type: 'refresh_token',
        })
      );
    });

    it('should refresh Square token in production', async () => {
      mockConfig.providers.square.sandbox = false;
      service = new OAuthService();

      await service.refreshToken(venueId, 'square');

      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://connect.squareup.com/oauth2/token',
        expect.any(Object)
      );
    });

    it('should refresh QuickBooks token', async () => {
      await service.refreshToken(venueId, 'quickbooks');

      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
        expect.any(URLSearchParams),
        expect.objectContaining({
          auth: {
            username: 'quickbooks-client-id',
            password: 'quickbooks-client-secret',
          },
        })
      );
    });

    it('should return existing token for Mailchimp (no expiry)', async () => {
      const result = await service.refreshToken(venueId, 'mailchimp');

      expect(mockAxiosPost).not.toHaveBeenCalled();
      expect(result).toEqual(existingToken);
    });

    it('should throw error for unsupported provider', async () => {
      await expect(service.refreshToken(venueId, 'stripe')).rejects.toThrow(
        'Refresh not supported for stripe'
      );
    });

    it('should store new tokens', async () => {
      await service.refreshToken(venueId, 'square');

      expect(mockStoreToken).toHaveBeenCalledWith(
        venueId,
        'square',
        expect.objectContaining({
          access_token: newTokenResponse.access_token,
          refresh_token: newTokenResponse.refresh_token,
          expires_at: expect.any(Date),
          scopes: ['read', 'write'],
        })
      );
    });

    it('should keep old refresh token if new one not provided', async () => {
      mockAxiosPost.mockResolvedValue({
        data: { access_token: 'new-access', expires_in: 3600 },
      });

      await service.refreshToken(venueId, 'square');

      expect(mockStoreToken).toHaveBeenCalledWith(
        venueId,
        'square',
        expect.objectContaining({
          refresh_token: existingToken.refresh_token,
        })
      );
    });

    it('should keep old scopes if new scope not provided', async () => {
      mockAxiosPost.mockResolvedValue({
        data: { access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600 },
      });

      await service.refreshToken(venueId, 'square');

      expect(mockStoreToken).toHaveBeenCalledWith(
        venueId,
        'square',
        expect.objectContaining({
          scopes: existingToken.scopes,
        })
      );
    });

    it('should log success', async () => {
      await service.refreshToken(venueId, 'square');

      expect(logger.info).toHaveBeenCalledWith('Token refreshed successfully', {
        venueId,
        integrationType: 'square',
      });
    });

    it('should return new tokens', async () => {
      const result = await service.refreshToken(venueId, 'square');

      expect(result).toEqual(newTokenResponse);
    });

    it('should mark integration as error on failure', async () => {
      const error = new Error('Refresh failed');
      mockAxiosPost.mockRejectedValue(error);
      mockUpdate.mockResolvedValue(1);

      await expect(service.refreshToken(venueId, 'square')).rejects.toThrow(
        'Refresh failed'
      );

      expect(mockDb).toHaveBeenCalledWith('integration_configs');
      expect(mockWhere).toHaveBeenCalledWith({
        venue_id: venueId,
        integration_type: 'square',
      });
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'error',
          last_error: 'Token refresh failed',
          last_error_at: expect.any(Date),
          updated_at: expect.any(Date),
        })
      );
    });

    it('should log error on failure', async () => {
      const error = new Error('Refresh failed');
      mockAxiosPost.mockRejectedValue(error);
      mockUpdate.mockResolvedValue(1);

      await expect(service.refreshToken(venueId, 'square')).rejects.toThrow();

      expect(logger.error).toHaveBeenCalledWith('Token refresh failed', {
        venueId,
        integrationType: 'square',
        error,
      });
    });

    it('should throw error when QuickBooks credentials not configured', async () => {
      const originalClientId = mockConfig.providers.quickbooks.clientId;
      mockConfig.providers.quickbooks.clientId = '';

      mockUpdate.mockResolvedValue(1);

      await expect(service.refreshToken(venueId, 'quickbooks')).rejects.toThrow(
        'QuickBooks OAuth credentials not configured'
      );

      mockConfig.providers.quickbooks.clientId = originalClientId;
    });
  });

  describe('calculateExpiry', () => {
    it('should calculate expiry correctly', async () => {
      mockGet.mockResolvedValue(
        JSON.stringify({
          venueId: 'venue-123',
          integrationType: 'square',
          userId: 'user-456',
          createdAt: new Date().toISOString(),
        })
      );
      mockAxiosPost.mockResolvedValue({
        data: { access_token: 'token', expires_in: 3600 },
      });
      mockFirst.mockResolvedValue(null);
      mockInsert.mockResolvedValue([1]);
      mockDel.mockResolvedValue(1);

      const before = Date.now();
      await service.handleCallback('square', 'code', 'state');
      const after = Date.now();

      const storeCall = mockStoreToken.mock.calls[0];
      const expiresAt = storeCall[2].expires_at;

      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 3600 * 1000);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(after + 3600 * 1000);
    });

    it('should return null for undefined expires_in', async () => {
      mockGet.mockResolvedValue(
        JSON.stringify({
          venueId: 'venue-123',
          integrationType: 'square',
          userId: 'user-456',
          createdAt: new Date().toISOString(),
        })
      );
      mockAxiosPost.mockResolvedValue({
        data: { access_token: 'token' },
      });
      mockFirst.mockResolvedValue(null);
      mockInsert.mockResolvedValue([1]);
      mockDel.mockResolvedValue(1);

      await service.handleCallback('square', 'code', 'state');

      const storeCall = mockStoreToken.mock.calls[0];
      expect(storeCall[2].expires_at).toBeNull();
    });
  });
});

describe('oauthService singleton', () => {
  it('should export oauthService instance', async () => {
    const { oauthService } = await import('../../../src/services/oauth.service');
    expect(oauthService).toBeInstanceOf(OAuthService);
  });
});
