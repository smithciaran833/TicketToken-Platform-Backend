import { OAuthService } from '../../../src/services/oauth.service';
import { AuthenticationError } from '../../../src/errors';

// Mock dependencies
jest.mock('google-auth-library');
jest.mock('apple-signin-auth');
jest.mock('crypto');
jest.mock('../../../src/config/database', () => ({
  db: jest.fn(() => ({
    where: jest.fn().mockReturnThis(),
    first: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
  })),
}));
jest.mock('../../../src/services/jwt.service');
jest.mock('../../../src/config/env', () => ({
  env: {
    GOOGLE_CLIENT_ID: 'test-google-client-id',
    GOOGLE_CLIENT_SECRET: 'test-google-secret',
    GOOGLE_REDIRECT_URI: 'http://localhost/callback',
    APPLE_CLIENT_ID: 'com.test.app',
  },
}));

import { OAuth2Client } from 'google-auth-library';
import * as AppleAuth from 'apple-signin-auth';
import crypto from 'crypto';
import { db } from '../../../src/config/database';
import { JWTService } from '../../../src/services/jwt.service';

describe('OAuthService', () => {
  let service: OAuthService;
  let mockGoogleClient: any;
  let mockDb: any;

  beforeEach(() => {
    mockGoogleClient = {
      verifyIdToken: jest.fn(),
    };

    (OAuth2Client as any) = jest.fn(() => mockGoogleClient);

    (JWTService as jest.MockedClass<typeof JWTService>).mockImplementation(() => ({
      generateTokenPair: jest.fn(),
    } as any));

    mockDb = db as jest.MockedFunction<typeof db>;
    service = new OAuthService();
    jest.clearAllMocks();
  });

  describe('verifyGoogleToken', () => {
    const idToken = 'google-id-token';

    it('should verify and return Google profile', async () => {
      const mockPayload = {
        sub: 'google-user-123',
        email: 'user@gmail.com',
        given_name: 'John',
        family_name: 'Doe',
        picture: 'https://example.com/photo.jpg',
        email_verified: true,
      };

      mockGoogleClient.verifyIdToken.mockResolvedValue({
        getPayload: () => mockPayload,
      });

      const profile = await service.verifyGoogleToken(idToken);

      expect(profile).toEqual({
        id: 'google-user-123',
        email: 'user@gmail.com',
        firstName: 'John',
        lastName: 'Doe',
        picture: 'https://example.com/photo.jpg',
        provider: 'google',
        verified: true,
      });
    });

    it('should throw error when payload is null', async () => {
      mockGoogleClient.verifyIdToken.mockResolvedValue({
        getPayload: () => null,
      });

      await expect(service.verifyGoogleToken(idToken))
        .rejects.toThrow(AuthenticationError);
    });

    it('should throw error when verification fails', async () => {
      mockGoogleClient.verifyIdToken.mockRejectedValue(new Error('Invalid token'));

      await expect(service.verifyGoogleToken(idToken))
        .rejects.toThrow('Google token verification failed');
    });
  });

  describe('verifyAppleToken', () => {
    const idToken = 'apple-id-token';

    it('should verify and return Apple profile', async () => {
      const mockToken = {
        sub: 'apple-user-123',
        email: 'user@icloud.com',
        email_verified: 'true',
      };

      (AppleAuth.verifyIdToken as jest.Mock).mockResolvedValue(mockToken);

      const profile = await service.verifyAppleToken(idToken);

      expect(profile).toEqual({
        id: 'apple-user-123',
        email: 'user@icloud.com',
        provider: 'apple',
        verified: true,
      });
    });

    it('should handle missing email', async () => {
      (AppleAuth.verifyIdToken as jest.Mock).mockResolvedValue({
        sub: 'apple-user-123',
        email_verified: 'false',
      });

      const profile = await service.verifyAppleToken(idToken);

      expect(profile.email).toBe('');
      expect(profile.verified).toBe(false);
    });

    it('should throw error when verification fails', async () => {
      (AppleAuth.verifyIdToken as jest.Mock).mockRejectedValue(new Error('Invalid token'));

      await expect(service.verifyAppleToken(idToken))
        .rejects.toThrow('Apple token verification failed');
    });
  });

  describe('findOrCreateUser', () => {
    const profile = {
      id: 'oauth-123',
      email: 'user@example.com',
      firstName: 'John',
      lastName: 'Doe',
      provider: 'google' as const,
      verified: true,
    };

    it('should return existing user if found', async () => {
      const existingUser = { id: 'user-123', email: 'user@example.com' };
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(existingUser),
        insert: jest.fn(),
        update: jest.fn().mockResolvedValue(1),
      };
      mockDb.mockReturnValue(mockQuery);

      const user = await service.findOrCreateUser(profile);

      expect(user).toEqual(existingUser);
      expect(mockQuery.where).toHaveBeenCalledWith({ email: profile.email });
    });

    it('should create new user if not found', async () => {
      const newUserId = 'new-user-123';
      (crypto.randomUUID as jest.Mock).mockReturnValue(newUserId);

      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: newUserId }),
        insert: jest.fn().mockResolvedValue([1]),
        update: jest.fn().mockResolvedValue(1),
      };
      mockDb.mockReturnValue(mockQuery);

      const user = await service.findOrCreateUser(profile);

      expect(mockQuery.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: newUserId,
          email: profile.email,
          first_name: profile.firstName,
          last_name: profile.lastName,
          email_verified: profile.verified,
          password_hash: null,
        })
      );
      expect(user.id).toBe(newUserId);
    });

    it('should store OAuth connection for new provider', async () => {
      const existingUser = { id: 'user-123', email: 'user@example.com' };
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn()
          .mockResolvedValueOnce(existingUser)
          .mockResolvedValueOnce(null),
        insert: jest.fn().mockResolvedValue([1]),
        update: jest.fn().mockResolvedValue(1),
      };
      mockDb.mockReturnValue(mockQuery);

      await service.findOrCreateUser(profile);

      expect(mockQuery.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: existingUser.id,
          provider: profile.provider,
          provider_user_id: profile.id,
        })
      );
    });

    it('should update existing OAuth connection', async () => {
      const existingUser = { id: 'user-123', email: 'user@example.com' };
      const existingConnection = { id: 'conn-123', user_id: 'user-123' };
      
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn()
          .mockResolvedValueOnce(existingUser)
          .mockResolvedValueOnce(existingConnection),
        update: jest.fn().mockResolvedValue(1),
      };
      mockDb.mockReturnValue(mockQuery);

      await service.findOrCreateUser(profile);

      expect(mockQuery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          profile_data: expect.any(String),
        })
      );
    });
  });

  describe('handleOAuthLogin', () => {
    const token = 'oauth-token-123';

    it('should handle Google OAuth login', async () => {
      const mockPayload = {
        sub: 'google-123',
        email: 'user@gmail.com',
        given_name: 'John',
        family_name: 'Doe',
        email_verified: true,
      };

      mockGoogleClient.verifyIdToken.mockResolvedValue({
        getPayload: () => mockPayload,
      });

      const existingUser = { 
        id: 'user-123', 
        email: 'user@gmail.com',
        first_name: 'John',
        last_name: 'Doe',
        email_verified: true,
      };

      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(existingUser),
        insert: jest.fn(),
        update: jest.fn().mockResolvedValue(1),
      };
      mockDb.mockReturnValue(mockQuery);

      const mockJWT = (service as any).jwtService;
      mockJWT.generateTokenPair.mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });

      const result = await service.handleOAuthLogin('google', token);

      expect(result.success).toBe(true);
      expect(result.user.id).toBe('user-123');
      expect(result.provider).toBe('google');
      expect(result.tokens).toBeDefined();
    });

    it('should handle Apple OAuth login', async () => {
      (AppleAuth.verifyIdToken as jest.Mock).mockResolvedValue({
        sub: 'apple-123',
        email: 'user@icloud.com',
        email_verified: 'true',
      });

      const existingUser = { 
        id: 'user-123', 
        email: 'user@icloud.com',
        email_verified: true,
      };

      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(existingUser),
        insert: jest.fn(),
        update: jest.fn().mockResolvedValue(1),
      };
      mockDb.mockReturnValue(mockQuery);

      const mockJWT = (service as any).jwtService;
      mockJWT.generateTokenPair.mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });

      const result = await service.handleOAuthLogin('apple', token);

      expect(result.success).toBe(true);
      expect(result.provider).toBe('apple');
    });

    it('should throw error for unsupported provider', async () => {
      await expect(service.handleOAuthLogin('facebook' as any, token))
        .rejects.toThrow('Unsupported OAuth provider');
    });
  });

  describe('linkOAuthProvider', () => {
    const userId = 'user-123';
    const token = 'oauth-token-123';

    it('should link Google provider to existing account', async () => {
      const mockPayload = {
        sub: 'google-123',
        email: 'user@gmail.com',
        email_verified: true,
      };

      mockGoogleClient.verifyIdToken.mockResolvedValue({
        getPayload: () => mockPayload,
      });

      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null),
        insert: jest.fn().mockResolvedValue([1]),
      };
      mockDb.mockReturnValue(mockQuery);

      const result = await service.linkOAuthProvider(userId, 'google', token);

      expect(result.success).toBe(true);
      expect(result.provider).toBe('google');
      expect(mockQuery.insert).toHaveBeenCalled();
    });

    it('should throw error if provider already linked', async () => {
      const mockPayload = {
        sub: 'google-123',
        email: 'user@gmail.com',
        email_verified: true,
      };

      mockGoogleClient.verifyIdToken.mockResolvedValue({
        getPayload: () => mockPayload,
      });

      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ id: 'conn-123' }),
      };
      mockDb.mockReturnValue(mockQuery);

      await expect(service.linkOAuthProvider(userId, 'google', token))
        .rejects.toThrow('google account already linked');
    });

    it('should throw error if OAuth account linked to another user', async () => {
      const mockPayload = {
        sub: 'google-123',
        email: 'user@gmail.com',
        email_verified: true,
      };

      mockGoogleClient.verifyIdToken.mockResolvedValue({
        getPayload: () => mockPayload,
      });

      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ user_id: 'other-user' }),
      };
      mockDb.mockReturnValue(mockQuery);

      await expect(service.linkOAuthProvider(userId, 'google', token))
        .rejects.toThrow('This OAuth account is already linked to another user');
    });
  });
});
