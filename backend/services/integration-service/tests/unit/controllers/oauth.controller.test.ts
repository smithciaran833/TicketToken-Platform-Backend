// Mock oauth service BEFORE imports
const mockHandleCallback = jest.fn();
const mockRefreshToken = jest.fn();

jest.mock('../../../src/services/oauth.service', () => ({
  oauthService: {
    handleCallback: mockHandleCallback,
    refreshToken: mockRefreshToken,
  },
}));

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

import { OAuthController } from '../../../src/controllers/oauth.controller';
import { FastifyRequest, FastifyReply } from 'fastify';

describe('OAuthController', () => {
  let controller: OAuthController;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockSend: jest.Mock;
  let mockCode: jest.Mock;
  let mockRedirect: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    controller = new OAuthController();

    mockSend = jest.fn().mockReturnThis();
    mockCode = jest.fn().mockReturnValue({ send: mockSend });
    mockRedirect = jest.fn().mockReturnThis();

    mockReply = {
      send: mockSend,
      code: mockCode,
      redirect: mockRedirect,
    };

    mockRequest = {
      params: {},
      query: {},
      body: {},
      headers: {},
    };
  });

  describe('handleCallback', () => {
    it('should redirect to error page when OAuth error is present', async () => {
      mockRequest.params = { provider: 'square' };
      mockRequest.query = { error: 'access_denied' };

      await controller.handleCallback(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRedirect).toHaveBeenCalledWith(
        '/integrations/error?message=access_denied'
      );
    });

    it('should return 400 when code is missing', async () => {
      mockRequest.params = { provider: 'square' };
      mockRequest.query = { state: 'some-state' };

      await controller.handleCallback(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCode).toHaveBeenCalledWith(400);
      expect(mockSend).toHaveBeenCalledWith({
        success: false,
        error: 'Missing code or state parameter',
      });
    });

    it('should return 400 when state is missing', async () => {
      mockRequest.params = { provider: 'square' };
      mockRequest.query = { code: 'auth-code' };

      await controller.handleCallback(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCode).toHaveBeenCalledWith(400);
      expect(mockSend).toHaveBeenCalledWith({
        success: false,
        error: 'Missing code or state parameter',
      });
    });

    it('should return 400 when both code and state are missing', async () => {
      mockRequest.params = { provider: 'square' };
      mockRequest.query = {};

      await controller.handleCallback(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCode).toHaveBeenCalledWith(400);
    });

    it('should redirect to success page for HTML requests', async () => {
      const result = { venueId: 'venue-123', provider: 'square' };

      mockRequest.params = { provider: 'square' };
      mockRequest.query = { code: 'auth-code', state: 'state-token' };
      mockRequest.headers = { accept: 'text/html,application/xhtml+xml' };
      mockHandleCallback.mockResolvedValue(result);

      await controller.handleCallback(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockHandleCallback).toHaveBeenCalledWith(
        'square',
        'auth-code',
        'state-token'
      );
      expect(mockRedirect).toHaveBeenCalledWith(
        '/integrations/success?provider=square&venueId=venue-123'
      );
    });

    it('should return JSON for non-HTML requests', async () => {
      const result = {
        venueId: 'venue-123',
        provider: 'mailchimp',
        accessToken: 'token-xxx',
      };

      mockRequest.params = { provider: 'mailchimp' };
      mockRequest.query = { code: 'auth-code', state: 'state-token' };
      mockRequest.headers = { accept: 'application/json' };
      mockHandleCallback.mockResolvedValue(result);

      await controller.handleCallback(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: result,
      });
    });

    it('should return JSON when no accept header is present', async () => {
      const result = { venueId: 'venue-123' };

      mockRequest.params = { provider: 'quickbooks' };
      mockRequest.query = { code: 'auth-code', state: 'state-token' };
      mockRequest.headers = {};
      mockHandleCallback.mockResolvedValue(result);

      await controller.handleCallback(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: result,
      });
    });

    it('should redirect to error page on failure for HTML requests', async () => {
      mockRequest.params = { provider: 'square' };
      mockRequest.query = { code: 'invalid-code', state: 'state-token' };
      mockRequest.headers = { accept: 'text/html' };
      mockHandleCallback.mockRejectedValue(new Error('Invalid authorization code'));

      await controller.handleCallback(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRedirect).toHaveBeenCalledWith(
        '/integrations/error?message=Invalid%20authorization%20code'
      );
    });

    it('should throw error on failure for JSON requests', async () => {
      mockRequest.params = { provider: 'square' };
      mockRequest.query = { code: 'invalid-code', state: 'state-token' };
      mockRequest.headers = { accept: 'application/json' };
      const error = new Error('Token exchange failed');
      mockHandleCallback.mockRejectedValue(error);

      await expect(
        controller.handleCallback(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        )
      ).rejects.toThrow('Token exchange failed');
    });

    it('should handle special characters in error messages', async () => {
      mockRequest.params = { provider: 'square' };
      mockRequest.query = { code: 'code', state: 'state' };
      mockRequest.headers = { accept: 'text/html' };
      mockHandleCallback.mockRejectedValue(new Error('Error with special chars: &?=#'));

      await controller.handleCallback(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRedirect).toHaveBeenCalledWith(
        expect.stringContaining('/integrations/error?message=')
      );
    });

    it('should process callback for different providers', async () => {
      const providers = ['square', 'mailchimp', 'quickbooks'];

      for (const provider of providers) {
        jest.clearAllMocks();
        mockRequest.params = { provider };
        mockRequest.query = { code: 'code', state: 'state' };
        mockRequest.headers = {};
        mockHandleCallback.mockResolvedValue({ venueId: 'v1' });

        await controller.handleCallback(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockHandleCallback).toHaveBeenCalledWith(provider, 'code', 'state');
      }
    });
  });

  describe('refreshToken', () => {
    it('should return 400 when venueId is missing', async () => {
      mockRequest.params = { provider: 'square' };
      mockRequest.body = {};

      await controller.refreshToken(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCode).toHaveBeenCalledWith(400);
      expect(mockSend).toHaveBeenCalledWith({
        success: false,
        error: 'Venue ID is required',
      });
    });

    it('should refresh token successfully', async () => {
      const newTokens = {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expires_at: new Date('2025-01-01'),
      };

      mockRequest.params = { provider: 'square' };
      mockRequest.body = { venueId: 'venue-123' };
      mockRefreshToken.mockResolvedValue(newTokens);

      await controller.refreshToken(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRefreshToken).toHaveBeenCalledWith('venue-123', 'square');
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        message: 'Token refreshed successfully',
        data: {
          expiresAt: newTokens.expires_at,
        },
      });
    });

    it('should refresh token for different providers', async () => {
      const newTokens = { expires_at: new Date() };

      mockRequest.params = { provider: 'mailchimp' };
      mockRequest.body = { venueId: 'venue-456' };
      mockRefreshToken.mockResolvedValue(newTokens);

      await controller.refreshToken(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRefreshToken).toHaveBeenCalledWith('venue-456', 'mailchimp');
    });

    it('should propagate refresh errors', async () => {
      mockRequest.params = { provider: 'square' };
      mockRequest.body = { venueId: 'venue-123' };
      const error = new Error('Refresh token expired');
      mockRefreshToken.mockRejectedValue(error);

      await expect(
        controller.refreshToken(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        )
      ).rejects.toThrow('Refresh token expired');
    });

    it('should propagate errors when no refresh token exists', async () => {
      mockRequest.params = { provider: 'quickbooks' };
      mockRequest.body = { venueId: 'venue-789' };
      const error = new Error('No refresh token found');
      mockRefreshToken.mockRejectedValue(error);

      await expect(
        controller.refreshToken(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        )
      ).rejects.toThrow('No refresh token found');
    });
  });
});
