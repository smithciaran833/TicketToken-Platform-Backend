import { AuthenticationError, ValidationError } from '../../../src/errors';

// Mocks
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

// Mock axios
jest.mock('axios', () => ({
  post: jest.fn(),
  get: jest.fn(),
}));

// Mock google-auth-library
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => mockGoogleClient),
}));

// Mock database
jest.mock('../../../src/config/database', () => ({
  pool: mockPool,
}));

// Mock env
jest.mock('../../../src/config/env', () => ({
  env: {
    GOOGLE_CLIENT_ID: 'google-client-id',
    GOOGLE_CLIENT_SECRET: 'google-client-secret',
    GOOGLE_REDIRECT_URI: 'http://localhost/callback/google',
    GITHUB_CLIENT_ID: 'github-client-id',
    GITHUB_CLIENT_SECRET: 'github-client-secret',
    GITHUB_REDIRECT_URI: 'http://localhost/callback/github',
  },
}));

// Mock audit service
jest.mock('../../../src/services/audit.service', () => ({
  auditService: mockAuditService,
}));

// Mock circuit breaker to just call the function directly
jest.mock('../../../src/utils/circuit-breaker', () => ({
  withCircuitBreaker: jest.fn((name, fn) => fn),
}));

import axios from 'axios';
import { OAuthService } from '../../../src/services/oauth.service';

describe('OAuthService', () => {
  let service: OAuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset all mock implementations
    mockPool.query.mockReset();
    mockPool.connect.mockReset();
    mockClient.query.mockReset();
    mockClient.release.mockReset();
    mockGoogleClient.getToken.mockReset();
    mockGoogleClient.verifyIdToken.mockReset();
    (axios.post as jest.Mock).mockReset();
    (axios.get as jest.Mock).mockReset();
    
    mockPool.connect.mockResolvedValue(mockClient);
    
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
        mockGoogleClient.getToken.mockResolvedValue({
          tokens: { id_token: 'mock-id-token' },
        });
        mockGoogleClient.verifyIdToken.mockResolvedValue({
          getPayload: () => mockGoogleProfile,
        });

        // Mock findOrCreateUser transaction
        mockClient.query
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
          .mockResolvedValueOnce({ rows: [] }); // COMMIT

        mockPool.query.mockResolvedValue({ rows: [] });
      };

      it('should authenticate with Google successfully', async () => {
        setupGoogleSuccess();

        const result = await service.authenticate('google', 'auth-code', 'tenant-123', '127.0.0.1', 'Chrome');

        expect(mockGoogleClient.getToken).toHaveBeenCalledWith('auth-code');
        expect(mockGoogleClient.verifyIdToken).toHaveBeenCalled();
        expect(result).toHaveProperty('user');
        expect(result).toHaveProperty('tokens');
        expect(result).toHaveProperty('sessionId');
        expect(result.provider).toBe('google');
      });

      it('should throw AuthenticationError if no id_token from Google', async () => {
        mockGoogleClient.getToken.mockResolvedValue({ tokens: {} });

        await expect(service.authenticate('google', 'bad-code'))
          .rejects.toThrow(AuthenticationError);
      });

      it('should throw AuthenticationError if invalid Google payload', async () => {
        mockGoogleClient.getToken.mockResolvedValue({
          tokens: { id_token: 'mock-id-token' },
        });
        mockGoogleClient.verifyIdToken.mockResolvedValue({
          getPayload: () => null,
        });

        await expect(service.authenticate('google', 'bad-code'))
          .rejects.toThrow(AuthenticationError);
      });

      it('should throw AuthenticationError if Google payload has no email', async () => {
        mockGoogleClient.getToken.mockResolvedValue({
          tokens: { id_token: 'mock-id-token' },
        });
        mockGoogleClient.verifyIdToken.mockResolvedValue({
          getPayload: () => ({ sub: 'user-123' }),
        });

        await expect(service.authenticate('google', 'bad-code'))
          .rejects.toThrow(AuthenticationError);
      });

      it('should handle Google API errors', async () => {
        mockGoogleClient.getToken.mockRejectedValue(new Error('Google API error'));

        await expect(service.authenticate('google', 'bad-code'))
          .rejects.toThrow(AuthenticationError);
      });
    });

    describe('GitHub OAuth', () => {
      const mockGitHubProfile = {
        id: 12345,
        login: 'johndoe',
        name: 'John Doe',
        email: 'john@github.com',
        avatar_url: 'https://github.com/avatar.jpg',
      };

      const setupGitHubSuccess = () => {
        (axios.post as jest.Mock).mockResolvedValue({
          data: { access_token: 'github-access-token' },
        });
        (axios.get as jest.Mock).mockImplementation((url: string) => {
          if (url === 'https://api.github.com/user') {
            return Promise.resolve({ data: mockGitHubProfile });
          }
          if (url === 'https://api.github.com/user/emails') {
            return Promise.resolve({
              data: [{ email: 'john@github.com', primary: true, verified: true }],
            });
          }
          return Promise.reject(new Error('Unknown URL'));
        });

        mockClient.query
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({ rows: [] }) // SET LOCAL
          .mockResolvedValueOnce({ rows: [] }) // Check oauth_connections
          .mockResolvedValueOnce({ rows: [] }) // Check users by email
          .mockResolvedValueOnce({ rows: [] }) // Insert user
          .mockResolvedValueOnce({ rows: [] }) // Insert oauth_connection
          .mockResolvedValueOnce({ rows: [{
            id: 'new-user-id',
            email: 'john@github.com',
            first_name: 'John',
            last_name: 'Doe',
            email_verified: true,
            tenant_id: 'tenant-123',
          }] })
          .mockResolvedValueOnce({ rows: [] }); // COMMIT

        mockPool.query.mockResolvedValue({ rows: [] });
      };

      it('should authenticate with GitHub successfully', async () => {
        setupGitHubSuccess();

        const result = await service.authenticate('github', 'auth-code', 'tenant-123');

        expect(axios.post).toHaveBeenCalledWith(
          'https://github.com/login/oauth/access_token',
          expect.objectContaining({ code: 'auth-code' }),
          expect.any(Object)
        );
        expect(result).toHaveProperty('user');
        expect(result).toHaveProperty('tokens');
        expect(result.provider).toBe('github');
      });

      it('should fetch email from /user/emails if not in profile', async () => {
        const profileWithoutEmail = { ...mockGitHubProfile, email: null };
        (axios.post as jest.Mock).mockResolvedValue({
          data: { access_token: 'github-access-token' },
        });
        (axios.get as jest.Mock).mockImplementation((url: string) => {
          if (url === 'https://api.github.com/user') {
            return Promise.resolve({ data: profileWithoutEmail });
          }
          if (url === 'https://api.github.com/user/emails') {
            return Promise.resolve({
              data: [{ email: 'private@github.com', primary: true }],
            });
          }
          return Promise.reject(new Error('Unknown URL'));
        });

        mockClient.query
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [{
            id: 'user-id',
            email: 'private@github.com',
            tenant_id: 'tenant-123',
          }] })
          .mockResolvedValueOnce({ rows: [] });

        mockPool.query.mockResolvedValue({ rows: [] });

        await service.authenticate('github', 'auth-code');

        expect(axios.get).toHaveBeenCalledWith(
          'https://api.github.com/user/emails',
          expect.any(Object)
        );
      });

      it('should throw AuthenticationError if no email found', async () => {
        (axios.post as jest.Mock).mockResolvedValue({
          data: { access_token: 'github-access-token' },
        });
        (axios.get as jest.Mock).mockImplementation((url: string) => {
          if (url === 'https://api.github.com/user') {
            return Promise.resolve({ data: { ...mockGitHubProfile, email: null } });
          }
          if (url === 'https://api.github.com/user/emails') {
            return Promise.resolve({ data: [] });
          }
          return Promise.reject(new Error('Unknown URL'));
        });

        await expect(service.authenticate('github', 'auth-code'))
          .rejects.toThrow(AuthenticationError);
      });

      it('should handle GitHub API errors', async () => {
        (axios.post as jest.Mock).mockRejectedValue(new Error('GitHub API error'));

        await expect(service.authenticate('github', 'bad-code'))
          .rejects.toThrow(AuthenticationError);
      });
    });

    describe('Unsupported provider', () => {
      it('should throw ValidationError for unsupported provider', async () => {
        await expect(service.authenticate('facebook', 'code'))
          .rejects.toThrow(ValidationError);
      });
    });
  });

  describe('linkProvider', () => {
    const setupGoogleMock = () => {
      mockGoogleClient.getToken.mockResolvedValue({
        tokens: { id_token: 'mock-id-token' },
      });
      mockGoogleClient.verifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: 'google-user-456',
          email: 'test@gmail.com',
          email_verified: true,
        }),
      });
    };

    it('should link Google account to existing user', async () => {
      setupGoogleMock();
      
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ tenant_id: 'tenant-123' }] }) // User check
        .mockResolvedValueOnce({ rows: [] }) // Existing connection check
        .mockResolvedValueOnce({ rows: [] }) // Other user check
        .mockResolvedValueOnce({ rows: [] }); // Insert connection

      const result = await service.linkProvider('user-123', 'google', 'auth-code');

      expect(result.success).toBe(true);
      expect(result.provider).toBe('google');
    });

    it('should throw ValidationError if user not found', async () => {
      setupGoogleMock();
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await expect(service.linkProvider('invalid-user', 'google', 'code'))
        .rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError if provider already linked', async () => {
      setupGoogleMock();
      
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ tenant_id: 'tenant-123' }] }) // User exists
        .mockResolvedValueOnce({ rows: [{ id: 'existing-connection' }] }); // Already linked

      try {
        await service.linkProvider('user-123', 'google', 'code');
        fail('Expected ValidationError');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).errors).toContainEqual(
          expect.stringContaining('already linked to your account')
        );
      }
    });

    it('should throw ValidationError if OAuth account linked to another user', async () => {
      setupGoogleMock();
      
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ tenant_id: 'tenant-123' }] }) // User exists
        .mockResolvedValueOnce({ rows: [] }) // Not linked to this user
        .mockResolvedValueOnce({ rows: [{ user_id: 'other-user' }] }); // Linked to another

      try {
        await service.linkProvider('user-123', 'google', 'code');
        fail('Expected ValidationError');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).errors).toContainEqual(
          expect.stringContaining('already linked to another user')
        );
      }
    });

    it('should throw ValidationError for unsupported provider', async () => {
      await expect(service.linkProvider('user-123', 'facebook', 'code'))
        .rejects.toThrow(ValidationError);
    });
  });

  describe('unlinkProvider', () => {
    it('should unlink provider successfully', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'connection-id' }] });

      const result = await service.unlinkProvider('user-123', 'google');

      expect(result.success).toBe(true);
      expect(result.message).toContain('unlinked successfully');
    });

    it('should throw ValidationError if no connection exists', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      try {
        await service.unlinkProvider('user-123', 'google');
        fail('Expected ValidationError');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).errors).toContainEqual(
          expect.stringContaining('No google account linked')
        );
      }
    });
  });

  describe('findOrCreateUser', () => {
    it('should return existing user if OAuth connection exists', async () => {
      mockGoogleClient.getToken.mockResolvedValue({
        tokens: { id_token: 'mock-id-token' },
      });
      mockGoogleClient.verifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: 'oauth-123',
          email: 'existing@example.com',
          email_verified: true,
        }),
      });

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SET LOCAL
        .mockResolvedValueOnce({ rows: [{ user_id: 'existing-user' }] }) // OAuth found
        .mockResolvedValueOnce({ rows: [] }) // Update oauth_connections
        .mockResolvedValueOnce({ rows: [] }) // Update users
        .mockResolvedValueOnce({ rows: [{ 
          id: 'existing-user', 
          email: 'existing@example.com',
          tenant_id: 'tenant-123',
        }] })
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      mockPool.query.mockResolvedValue({ rows: [] });

      const result = await service.authenticate('google', 'code');

      expect(result.user.email).toBe('existing@example.com');
    });

    it('should link to existing user by email', async () => {
      mockGoogleClient.getToken.mockResolvedValue({
        tokens: { id_token: 'mock-id-token' },
      });
      mockGoogleClient.verifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: 'new-oauth-id',
          email: 'emailuser@example.com',
          email_verified: true,
        }),
      });

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SET LOCAL
        .mockResolvedValueOnce({ rows: [] }) // No OAuth connection
        .mockResolvedValueOnce({ rows: [{ id: 'email-user' }] }) // User by email
        .mockResolvedValueOnce({ rows: [] }) // Insert oauth_connection
        .mockResolvedValueOnce({ rows: [{ 
          id: 'email-user', 
          email: 'emailuser@example.com',
          tenant_id: 'tenant-123',
        }] })
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      mockPool.query.mockResolvedValue({ rows: [] });

      const result = await service.authenticate('google', 'code');

      expect(result.user.email).toBe('emailuser@example.com');
    });

    it('should create new user if no existing user', async () => {
      mockGoogleClient.getToken.mockResolvedValue({
        tokens: { id_token: 'mock-id-token' },
      });
      mockGoogleClient.verifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: 'brand-new-oauth',
          email: 'newuser@example.com',
          email_verified: true,
        }),
      });

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SET LOCAL
        .mockResolvedValueOnce({ rows: [] }) // No OAuth connection
        .mockResolvedValueOnce({ rows: [] }) // No user by email
        .mockResolvedValueOnce({ rows: [] }) // Insert user
        .mockResolvedValueOnce({ rows: [] }) // Insert oauth_connection
        .mockResolvedValueOnce({ rows: [{ 
          id: 'new-user', 
          email: 'newuser@example.com', 
          tenant_id: 'tenant-123',
        }] })
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      mockPool.query.mockResolvedValue({ rows: [] });

      const result = await service.authenticate('google', 'code');

      expect(result.user.email).toBe('newuser@example.com');
    });

    it('should rollback transaction on error', async () => {
      mockGoogleClient.getToken.mockResolvedValue({
        tokens: { id_token: 'mock-id-token' },
      });
      mockGoogleClient.verifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: 'oauth-123',
          email: 'test@example.com',
          email_verified: true,
        }),
      });

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SET LOCAL
        .mockRejectedValueOnce(new Error('Database error')); // Query fails

      await expect(service.authenticate('google', 'code')).rejects.toThrow('Database error');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should use default tenant if not provided', async () => {
      mockGoogleClient.getToken.mockResolvedValue({
        tokens: { id_token: 'mock-id-token' },
      });
      mockGoogleClient.verifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: 'oauth-123',
          email: 'test@example.com',
          email_verified: true,
        }),
      });

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SET LOCAL
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ 
          id: 'user', 
          email: 'test@example.com', 
          tenant_id: '00000000-0000-0000-0000-000000000001',
        }] })
        .mockResolvedValueOnce({ rows: [] });

      mockPool.query.mockResolvedValue({ rows: [] });

      await service.authenticate('google', 'code');

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('00000000-0000-0000-0000-000000000001')
      );
    });
  });

  describe('createSession', () => {
    it('should create session and call audit service', async () => {
      mockGoogleClient.getToken.mockResolvedValue({
        tokens: { id_token: 'mock-id-token' },
      });
      mockGoogleClient.verifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: 'oauth-123',
          email: 'test@example.com',
          email_verified: true,
        }),
      });

      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ user_id: 'user-123' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ 
          id: 'user-123', 
          email: 'test@example.com', 
          tenant_id: 'tenant-123',
        }] })
        .mockResolvedValueOnce({ rows: [] });

      mockPool.query.mockResolvedValue({ rows: [] });

      await service.authenticate('google', 'code', 'tenant-123', '192.168.1.1', 'Test Agent');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO user_sessions'),
        expect.arrayContaining(['192.168.1.1', 'Test Agent'])
      );
      expect(mockAuditService.logSessionCreated).toHaveBeenCalled();
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
        provider: 'github',
      });

      await service.linkOAuthProvider('user-123', 'github', 'token');

      expect(spy).toHaveBeenCalledWith('user-123', 'github', 'token');
      spy.mockRestore();
    });
  });
});
