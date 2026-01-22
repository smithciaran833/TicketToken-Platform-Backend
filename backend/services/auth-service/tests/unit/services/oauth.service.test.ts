import { AuthenticationError, ValidationError } from '../../../src/errors';

const mockPool = {
  query: jest.fn(),
  connect: jest.fn(),
};

const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

const mockJwtService = {
  generateTokenPair: jest.fn().mockResolvedValue({
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
  }),
  initialize: jest.fn(),
};

const mockGoogleClient = {
  getToken: jest.fn(),
  verifyIdToken: jest.fn(),
};

const mockAuditService = {
  logSessionCreated: jest.fn().mockResolvedValue(undefined),
  log: jest.fn().mockResolvedValue(undefined),
};

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    getToken: jest.fn(),
    verifyIdToken: jest.fn(),
  })),
}));

jest.mock('../../../src/config/database', () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
}));

jest.mock('../../../src/config/env', () => ({
  env: {
    GOOGLE_CLIENT_ID: 'google-client-id',
    GOOGLE_CLIENT_SECRET: 'google-client-secret',
    GOOGLE_REDIRECT_URI: 'http://localhost/callback/google',
  },
}));

jest.mock('../../../src/services/audit.service', () => ({
  auditService: {
    logSessionCreated: jest.fn().mockResolvedValue(undefined),
    log: jest.fn().mockResolvedValue(undefined),
  },
}));

import { OAuth2Client } from 'google-auth-library';
import { pool } from '../../../src/config/database';
import { auditService } from '../../../src/services/audit.service';
import { OAuthService } from '../../../src/services/oauth.service';

describe('OAuthService', () => {
  let service: OAuthService;
  let mockGoogleClientInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockGoogleClientInstance = {
      getToken: jest.fn(),
      verifyIdToken: jest.fn(),
    };

    (OAuth2Client as jest.Mock).mockImplementation(() => mockGoogleClientInstance);

    (pool.connect as jest.Mock).mockResolvedValue({
      query: jest.fn(),
      release: jest.fn(),
    });

    service = new OAuthService(mockJwtService as any);
  });

  describe('constructor', () => {
    it('should create OAuth2Client with config', () => {
      expect(service).toBeDefined();
    });

    it('should use provided JWTService', () => {
      const customJwt = { generateTokenPair: jest.fn() };
      const svc = new OAuthService(customJwt as any);
      expect(svc).toBeDefined();
    });
  });

  describe('authenticate', () => {
    describe('Google OAuth', () => {
      const mockGoogleProfile = {
        sub: 'google-user-123',
        email: 'test@gmail.com',
        given_name: 'John',
        family_name: 'Doe',
        picture: 'https://google.com/avatar.jpg',
        email_verified: true,
      };

      const setupGoogleSuccess = () => {
        mockGoogleClientInstance.getToken.mockResolvedValue({
          tokens: { id_token: 'mock-id-token' },
        });
        mockGoogleClientInstance.verifyIdToken.mockResolvedValue({
          getPayload: () => mockGoogleProfile,
        });

        const mockClientInstance = {
          query: jest.fn()
            .mockResolvedValueOnce({ rows: [] }) // BEGIN
            .mockResolvedValueOnce({ rows: [] }) // SET LOCAL
            .mockResolvedValueOnce({ rows: [] }) // Check oauth_connections
            .mockResolvedValueOnce({ rows: [] }) // Check users by email
            .mockResolvedValueOnce({ rows: [] }) // Insert user
            .mockResolvedValueOnce({ rows: [] }) // Insert oauth_connection
            .mockResolvedValueOnce({ rows: [{
              id: 'new-user-id',
              email: 'test@gmail.com',
              first_name: 'John',
              last_name: 'Doe',
              email_verified: true,
              tenant_id: 'tenant-123',
            }] })
            .mockResolvedValueOnce({ rows: [] }), // COMMIT
          release: jest.fn(),
        };

        (pool.connect as jest.Mock).mockResolvedValue(mockClientInstance);
        (pool.query as jest.Mock).mockResolvedValue({ rows: [] });
      };

      it('should authenticate with Google successfully', async () => {
        setupGoogleSuccess();

        const result = await service.authenticate('google', 'auth-code', 'tenant-123', '127.0.0.1', 'Chrome');

        expect(mockGoogleClientInstance.getToken).toHaveBeenCalledWith('auth-code');
        expect(mockGoogleClientInstance.verifyIdToken).toHaveBeenCalled();
        expect(result).toHaveProperty('user');
        expect(result).toHaveProperty('tokens');
        expect(result).toHaveProperty('sessionId');
        expect(result.provider).toBe('google');
      });

      it('should throw AuthenticationError if no id_token from Google', async () => {
        mockGoogleClientInstance.getToken.mockResolvedValue({ tokens: {} });

        await expect(service.authenticate('google', 'bad-code'))
          .rejects.toThrow(AuthenticationError);
      });

      it('should throw AuthenticationError if invalid Google payload', async () => {
        mockGoogleClientInstance.getToken.mockResolvedValue({
          tokens: { id_token: 'mock-id-token' },
        });
        mockGoogleClientInstance.verifyIdToken.mockResolvedValue({
          getPayload: () => null,
        });

        await expect(service.authenticate('google', 'bad-code'))
          .rejects.toThrow(AuthenticationError);
      });

      it('should throw AuthenticationError if Google payload has no email', async () => {
        mockGoogleClientInstance.getToken.mockResolvedValue({
          tokens: { id_token: 'mock-id-token' },
        });
        mockGoogleClientInstance.verifyIdToken.mockResolvedValue({
          getPayload: () => ({ sub: 'user-123' }),
        });

        await expect(service.authenticate('google', 'bad-code'))
          .rejects.toThrow(AuthenticationError);
      });

      it('should handle Google API errors', async () => {
        mockGoogleClientInstance.getToken.mockRejectedValue(new Error('Google API error'));

        await expect(service.authenticate('google', 'bad-code'))
          .rejects.toThrow(AuthenticationError);
      });
    });

    describe('Unsupported provider', () => {
      it('should throw ValidationError for github', async () => {
        await expect(service.authenticate('github', 'code'))
          .rejects.toThrow(ValidationError);
      });

      it('should throw ValidationError for facebook', async () => {
        await expect(service.authenticate('facebook', 'code'))
          .rejects.toThrow(ValidationError);
      });

      it('should throw ValidationError for apple (not yet implemented)', async () => {
        await expect(service.authenticate('apple', 'code'))
          .rejects.toThrow(ValidationError);
      });
    });
  });

  describe('linkProvider', () => {
    const setupGoogleMock = () => {
      mockGoogleClientInstance.getToken.mockResolvedValue({
        tokens: { id_token: 'mock-id-token' },
      });
      mockGoogleClientInstance.verifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: 'google-user-456',
          email: 'test@gmail.com',
          email_verified: true,
        }),
      });
    };

    it('should link Google account to existing user', async () => {
      setupGoogleMock();

      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ tenant_id: 'tenant-123' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.linkProvider('user-123', 'google', 'auth-code');

      expect(result.success).toBe(true);
      expect(result.provider).toBe('google');
    });

    it('should throw ValidationError if user not found', async () => {
      setupGoogleMock();
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await expect(service.linkProvider('invalid-user', 'google', 'code'))
        .rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError if provider already linked', async () => {
      setupGoogleMock();

      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ tenant_id: 'tenant-123' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'existing-connection' }] });

      await expect(service.linkProvider('user-123', 'google', 'code'))
        .rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError if OAuth account linked to another user', async () => {
      setupGoogleMock();

      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ tenant_id: 'tenant-123' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ user_id: 'other-user' }] });

      await expect(service.linkProvider('user-123', 'google', 'code'))
        .rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for unsupported provider', async () => {
      await expect(service.linkProvider('user-123', 'github', 'code'))
        .rejects.toThrow(ValidationError);
    });
  });

  describe('unlinkProvider', () => {
    it('should unlink provider successfully', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [{ id: 'connection-id' }] });

      const result = await service.unlinkProvider('user-123', 'google');

      expect(result.success).toBe(true);
      expect(result.message).toContain('unlinked successfully');
    });

    it('should throw ValidationError if no connection exists', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await expect(service.unlinkProvider('user-123', 'google'))
        .rejects.toThrow(ValidationError);
    });
  });

  describe('handleOAuthLogin', () => {
    it('should call authenticate', async () => {
      const spy = jest.spyOn(service, 'authenticate').mockResolvedValue({
        user: {},
        tokens: {},
        sessionId: 'session-123',
        provider: 'google',
      });

      await service.handleOAuthLogin('google', 'token');

      expect(spy).toHaveBeenCalledWith('google', 'token');
      spy.mockRestore();
    });
  });

  describe('linkOAuthProvider', () => {
    it('should call linkProvider', async () => {
      const spy = jest.spyOn(service, 'linkProvider').mockResolvedValue({
        success: true,
        message: 'Linked',
        provider: 'google',
      });

      await service.linkOAuthProvider('user-123', 'google', 'token');

      expect(spy).toHaveBeenCalledWith('user-123', 'google', 'token');
      spy.mockRestore();
    });
  });
});
