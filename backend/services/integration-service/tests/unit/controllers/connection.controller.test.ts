// Mock services BEFORE imports
const mockGetIntegrationStatus = jest.fn();
const mockConnectIntegration = jest.fn();
const mockDisconnectIntegration = jest.fn();

jest.mock('../../../src/services/integration.service', () => ({
  integrationService: {
    getIntegrationStatus: mockGetIntegrationStatus,
    connectIntegration: mockConnectIntegration,
    disconnectIntegration: mockDisconnectIntegration,
  },
}));

const mockInitiateOAuth = jest.fn();
const mockRefreshToken = jest.fn();

jest.mock('../../../src/services/oauth.service', () => ({
  oauthService: {
    initiateOAuth: mockInitiateOAuth,
    refreshToken: mockRefreshToken,
  },
}));

// Mock providers for validateApiKey
const mockProviderInitialize = jest.fn();
const mockProviderTestConnection = jest.fn();

jest.mock('../../../src/providers/stripe/stripe.provider', () => ({
  StripeProvider: jest.fn().mockImplementation(() => ({
    initialize: mockProviderInitialize,
    testConnection: mockProviderTestConnection,
  })),
}));

import { ConnectionController } from '../../../src/controllers/connection.controller';
import { FastifyRequest, FastifyReply } from 'fastify';

describe('ConnectionController', () => {
  let controller: ConnectionController;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockSend: jest.Mock;
  let mockCode: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    controller = new ConnectionController();

    mockSend = jest.fn().mockReturnThis();
    mockCode = jest.fn().mockReturnValue({ send: mockSend });

    mockReply = {
      send: mockSend,
      code: mockCode,
    };

    mockRequest = {
      params: {},
      query: {},
      body: {},
    };
  });

  describe('listIntegrations', () => {
    it('should return 400 when venueId is missing', async () => {
      mockRequest.query = {};

      await controller.listIntegrations(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCode).toHaveBeenCalledWith(400);
      expect(mockSend).toHaveBeenCalledWith({
        success: false,
        error: 'Venue ID is required',
      });
    });

    it('should return integrations for valid venueId', async () => {
      const integrations = [
        { id: 'int-1', type: 'stripe', status: 'connected' },
        { id: 'int-2', type: 'square', status: 'disconnected' },
      ];

      mockRequest.query = { venueId: 'venue-123' };
      mockGetIntegrationStatus.mockResolvedValue(integrations);

      await controller.listIntegrations(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockGetIntegrationStatus).toHaveBeenCalledWith('venue-123');
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: integrations,
      });
    });

    it('should return empty array when no integrations exist', async () => {
      mockRequest.query = { venueId: 'venue-456' };
      mockGetIntegrationStatus.mockResolvedValue([]);

      await controller.listIntegrations(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: [],
      });
    });

    it('should propagate service errors', async () => {
      mockRequest.query = { venueId: 'venue-123' };
      const error = new Error('Database connection failed');
      mockGetIntegrationStatus.mockRejectedValue(error);

      await expect(
        controller.listIntegrations(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        )
      ).rejects.toThrow('Database connection failed');
    });
  });

  describe('getIntegration', () => {
    it('should return 400 when venueId is missing', async () => {
      mockRequest.params = { provider: 'stripe' };
      mockRequest.query = {};

      await controller.getIntegration(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCode).toHaveBeenCalledWith(400);
      expect(mockSend).toHaveBeenCalledWith({
        success: false,
        error: 'Venue ID is required',
      });
    });

    it('should return 404 when integration not found', async () => {
      mockRequest.params = { provider: 'stripe' };
      mockRequest.query = { venueId: 'venue-123' };
      mockGetIntegrationStatus.mockResolvedValue(null);

      await controller.getIntegration(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockGetIntegrationStatus).toHaveBeenCalledWith('venue-123', 'stripe');
      expect(mockCode).toHaveBeenCalledWith(404);
      expect(mockSend).toHaveBeenCalledWith({
        success: false,
        error: 'Integration not found',
      });
    });

    it('should return 404 when integration is undefined', async () => {
      mockRequest.params = { provider: 'square' };
      mockRequest.query = { venueId: 'venue-123' };
      mockGetIntegrationStatus.mockResolvedValue(undefined);

      await controller.getIntegration(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCode).toHaveBeenCalledWith(404);
    });

    it('should return integration when found', async () => {
      const integration = {
        id: 'int-123',
        type: 'stripe',
        status: 'connected',
        config: { webhookUrl: 'https://example.com' },
      };

      mockRequest.params = { provider: 'stripe' };
      mockRequest.query = { venueId: 'venue-123' };
      mockGetIntegrationStatus.mockResolvedValue(integration);

      await controller.getIntegration(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: integration,
      });
    });

    it('should pass provider to service correctly', async () => {
      mockRequest.params = { provider: 'quickbooks' };
      mockRequest.query = { venueId: 'venue-456' };
      mockGetIntegrationStatus.mockResolvedValue({ id: 'int-1' });

      await controller.getIntegration(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockGetIntegrationStatus).toHaveBeenCalledWith('venue-456', 'quickbooks');
    });
  });

  describe('connectIntegration', () => {
    it('should return 400 when venueId is missing', async () => {
      mockRequest.params = { provider: 'stripe' };
      mockRequest.body = { credentials: { apiKey: 'sk_test' } };

      await controller.connectIntegration(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCode).toHaveBeenCalledWith(400);
      expect(mockSend).toHaveBeenCalledWith({
        success: false,
        error: 'Venue ID and credentials are required',
      });
    });

    it('should return 400 when credentials are missing', async () => {
      mockRequest.params = { provider: 'stripe' };
      mockRequest.body = { venueId: 'venue-123' };

      await controller.connectIntegration(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCode).toHaveBeenCalledWith(400);
      expect(mockSend).toHaveBeenCalledWith({
        success: false,
        error: 'Venue ID and credentials are required',
      });
    });

    it('should return 400 when both venueId and credentials are missing', async () => {
      mockRequest.params = { provider: 'stripe' };
      mockRequest.body = {};

      await controller.connectIntegration(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCode).toHaveBeenCalledWith(400);
    });

    it('should initiate OAuth flow for square provider', async () => {
      const authUrl = 'https://connect.squareup.com/oauth2/authorize?client_id=xxx';
      mockRequest.params = { provider: 'square' };
      mockRequest.body = {
        venueId: 'venue-123',
        credentials: { clientId: 'xxx' },
        userId: 'user-456',
      };
      mockInitiateOAuth.mockResolvedValue(authUrl);

      await controller.connectIntegration(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockInitiateOAuth).toHaveBeenCalledWith('venue-123', 'square', 'user-456');
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: {
          authUrl,
          message: 'Please complete OAuth authorization',
        },
      });
    });

    it('should initiate OAuth flow for mailchimp provider', async () => {
      const authUrl = 'https://login.mailchimp.com/oauth2/authorize';
      mockRequest.params = { provider: 'mailchimp' };
      mockRequest.body = {
        venueId: 'venue-123',
        credentials: { clientId: 'xxx' },
      };
      mockInitiateOAuth.mockResolvedValue(authUrl);

      await controller.connectIntegration(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockInitiateOAuth).toHaveBeenCalledWith('venue-123', 'mailchimp', 'system');
    });

    it('should initiate OAuth flow for quickbooks provider', async () => {
      const authUrl = 'https://appcenter.intuit.com/connect/oauth2';
      mockRequest.params = { provider: 'quickbooks' };
      mockRequest.body = {
        venueId: 'venue-123',
        credentials: { clientId: 'xxx' },
        userId: 'user-789',
      };
      mockInitiateOAuth.mockResolvedValue(authUrl);

      await controller.connectIntegration(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockInitiateOAuth).toHaveBeenCalledWith('venue-123', 'quickbooks', 'user-789');
    });

    it('should use "system" as default userId for OAuth providers', async () => {
      mockRequest.params = { provider: 'square' };
      mockRequest.body = {
        venueId: 'venue-123',
        credentials: { clientId: 'xxx' },
        // userId intentionally omitted
      };
      mockInitiateOAuth.mockResolvedValue('https://auth.url');

      await controller.connectIntegration(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockInitiateOAuth).toHaveBeenCalledWith('venue-123', 'square', 'system');
    });

    it('should connect API key-based integration for stripe', async () => {
      const result = {
        success: true,
        message: 'Integration connected successfully',
        integrationType: 'stripe',
      };
      mockRequest.params = { provider: 'stripe' };
      mockRequest.body = {
        venueId: 'venue-123',
        credentials: { apiKey: 'sk_test_123' },
        config: { webhookEnabled: true },
      };
      mockConnectIntegration.mockResolvedValue(result);

      await controller.connectIntegration(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockConnectIntegration).toHaveBeenCalledWith(
        'venue-123',
        'stripe',
        { apiKey: 'sk_test_123', config: { webhookEnabled: true } }
      );
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: result,
      });
    });

    it('should connect API key-based integration without config', async () => {
      const result = { success: true };
      mockRequest.params = { provider: 'stripe' };
      mockRequest.body = {
        venueId: 'venue-123',
        credentials: { apiKey: 'sk_test_123' },
      };
      mockConnectIntegration.mockResolvedValue(result);

      await controller.connectIntegration(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockConnectIntegration).toHaveBeenCalledWith(
        'venue-123',
        'stripe',
        { apiKey: 'sk_test_123', config: undefined }
      );
    });

    it('should propagate connection errors', async () => {
      mockRequest.params = { provider: 'stripe' };
      mockRequest.body = {
        venueId: 'venue-123',
        credentials: { apiKey: 'invalid_key' },
      };
      const error = new Error('Invalid API key');
      mockConnectIntegration.mockRejectedValue(error);

      await expect(
        controller.connectIntegration(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        )
      ).rejects.toThrow('Invalid API key');
    });
  });

  describe('disconnectIntegration', () => {
    it('should return 400 when venueId is missing', async () => {
      mockRequest.params = { provider: 'stripe' };
      mockRequest.body = {};

      await controller.disconnectIntegration(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCode).toHaveBeenCalledWith(400);
      expect(mockSend).toHaveBeenCalledWith({
        success: false,
        error: 'Venue ID is required',
      });
    });

    it('should disconnect integration successfully', async () => {
      mockRequest.params = { provider: 'stripe' };
      mockRequest.body = { venueId: 'venue-123' };
      mockDisconnectIntegration.mockResolvedValue(undefined);

      await controller.disconnectIntegration(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockDisconnectIntegration).toHaveBeenCalledWith('venue-123', 'stripe');
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        message: 'stripe integration disconnected successfully',
      });
    });

    it('should include provider name in success message', async () => {
      mockRequest.params = { provider: 'square' };
      mockRequest.body = { venueId: 'venue-123' };
      mockDisconnectIntegration.mockResolvedValue(undefined);

      await controller.disconnectIntegration(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        message: 'square integration disconnected successfully',
      });
    });

    it('should propagate disconnect errors', async () => {
      mockRequest.params = { provider: 'stripe' };
      mockRequest.body = { venueId: 'venue-123' };
      const error = new Error('Failed to revoke tokens');
      mockDisconnectIntegration.mockRejectedValue(error);

      await expect(
        controller.disconnectIntegration(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        )
      ).rejects.toThrow('Failed to revoke tokens');
    });
  });

  describe('reconnectIntegration', () => {
    it('should return 400 when venueId is missing', async () => {
      mockRequest.params = { provider: 'stripe' };
      mockRequest.body = {};

      await controller.reconnectIntegration(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCode).toHaveBeenCalledWith(400);
      expect(mockSend).toHaveBeenCalledWith({
        success: false,
        error: 'Venue ID is required',
      });
    });

    it('should return success when token refresh succeeds', async () => {
      mockRequest.params = { provider: 'square' };
      mockRequest.body = { venueId: 'venue-123' };
      mockRefreshToken.mockResolvedValue(true);

      await controller.reconnectIntegration(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRefreshToken).toHaveBeenCalledWith('venue-123', 'square');
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        message: 'Integration reconnected successfully',
      });
    });

    it('should return 400 when token refresh fails', async () => {
      mockRequest.params = { provider: 'mailchimp' };
      mockRequest.body = { venueId: 'venue-123' };
      mockRefreshToken.mockResolvedValue(false);

      await controller.reconnectIntegration(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCode).toHaveBeenCalledWith(400);
      expect(mockSend).toHaveBeenCalledWith({
        success: false,
        error: 'Reconnection failed - please reconnect manually',
      });
    });

    it('should return 400 when token refresh returns null', async () => {
      mockRequest.params = { provider: 'quickbooks' };
      mockRequest.body = { venueId: 'venue-123' };
      mockRefreshToken.mockResolvedValue(null);

      await controller.reconnectIntegration(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCode).toHaveBeenCalledWith(400);
    });

    it('should propagate refresh errors', async () => {
      mockRequest.params = { provider: 'square' };
      mockRequest.body = { venueId: 'venue-123' };
      const error = new Error('Token expired and cannot be refreshed');
      mockRefreshToken.mockRejectedValue(error);

      await expect(
        controller.reconnectIntegration(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        )
      ).rejects.toThrow('Token expired and cannot be refreshed');
    });
  });

  describe('validateApiKey', () => {
    it('should return 400 for unsupported provider', async () => {
      mockRequest.params = { provider: 'square' };
      mockRequest.body = { apiKey: 'test_key' };

      await controller.validateApiKey(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCode).toHaveBeenCalledWith(400);
      expect(mockSend).toHaveBeenCalledWith({
        success: false,
        error: 'Provider does not support API key validation',
      });
    });

    it('should return 400 for unknown provider', async () => {
      mockRequest.params = { provider: 'unknown_provider' };
      mockRequest.body = { apiKey: 'test_key' };

      await controller.validateApiKey(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCode).toHaveBeenCalledWith(400);
      expect(mockSend).toHaveBeenCalledWith({
        success: false,
        error: 'Provider does not support API key validation',
      });
    });

    it('should validate stripe API key successfully', async () => {
      mockRequest.params = { provider: 'stripe' };
      mockRequest.body = { apiKey: 'sk_test_valid', apiSecret: 'whsec_xxx' };
      mockProviderInitialize.mockResolvedValue(undefined);
      mockProviderTestConnection.mockResolvedValue(true);

      await controller.validateApiKey(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockProviderInitialize).toHaveBeenCalledWith({
        apiKey: 'sk_test_valid',
        apiSecret: 'whsec_xxx',
      });
      expect(mockProviderTestConnection).toHaveBeenCalled();
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: { valid: true },
      });
    });

    it('should return invalid when connection test fails', async () => {
      mockRequest.params = { provider: 'stripe' };
      mockRequest.body = { apiKey: 'sk_test_invalid' };
      mockProviderInitialize.mockResolvedValue(undefined);
      mockProviderTestConnection.mockResolvedValue(false);

      await controller.validateApiKey(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: { valid: false },
      });
    });

    it('should propagate provider initialization errors', async () => {
      mockRequest.params = { provider: 'stripe' };
      mockRequest.body = { apiKey: 'sk_test_bad' };
      const error = new Error('Invalid API key format');
      mockProviderInitialize.mockRejectedValue(error);

      await expect(
        controller.validateApiKey(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        )
      ).rejects.toThrow('Invalid API key format');
    });

    it('should handle missing apiSecret', async () => {
      mockRequest.params = { provider: 'stripe' };
      mockRequest.body = { apiKey: 'sk_test_123' };
      mockProviderInitialize.mockResolvedValue(undefined);
      mockProviderTestConnection.mockResolvedValue(true);

      await controller.validateApiKey(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockProviderInitialize).toHaveBeenCalledWith({
        apiKey: 'sk_test_123',
        apiSecret: undefined,
      });
    });
  });
});
