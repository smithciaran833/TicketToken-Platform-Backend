// Mock database BEFORE imports
const mockFirst = jest.fn();
const mockSelect = jest.fn().mockReturnValue({ first: mockFirst });
const mockWhereRaw = jest.fn().mockReturnValue({ select: mockSelect });
const mockWhere = jest.fn().mockImplementation(() => ({
  first: mockFirst,
  where: mockWhereRaw,
  select: mockSelect,
}));

const mockRaw = jest.fn();

const mockDb = jest.fn(() => ({
  where: mockWhere,
  first: mockFirst,
  select: mockSelect,
}));
mockDb.raw = mockRaw;

jest.mock('../../../src/config/database', () => ({
  db: mockDb,
}));

// Mock token vault
const mockGetToken = jest.fn();
const mockGetApiKey = jest.fn();

jest.mock('../../../src/services/token-vault.service', () => ({
  tokenVault: {
    getToken: mockGetToken,
    getApiKey: mockGetApiKey,
  },
}));

// Mock providers
const mockProviderInitialize = jest.fn();
const mockProviderTestConnection = jest.fn();

const createMockProvider = () => ({
  initialize: mockProviderInitialize,
  testConnection: mockProviderTestConnection,
});

jest.mock('../../../src/providers/square/square.provider', () => ({
  SquareProvider: jest.fn().mockImplementation(createMockProvider),
}));

jest.mock('../../../src/providers/stripe/stripe.provider', () => ({
  StripeProvider: jest.fn().mockImplementation(createMockProvider),
}));

jest.mock('../../../src/providers/mailchimp/mailchimp.provider', () => ({
  MailchimpProvider: jest.fn().mockImplementation(createMockProvider),
}));

jest.mock('../../../src/providers/quickbooks/quickbooks.provider', () => ({
  QuickBooksProvider: jest.fn().mockImplementation(createMockProvider),
}));

import { HealthController } from '../../../src/controllers/health.controller';
import { FastifyRequest, FastifyReply } from 'fastify';

describe('HealthController', () => {
  let controller: HealthController;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockSend: jest.Mock;
  let mockCode: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    controller = new HealthController();

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

  describe('getIntegrationHealth', () => {
    it('should return 400 when venueId is missing', async () => {
      mockRequest.params = { provider: 'stripe' };
      mockRequest.query = {};

      await controller.getIntegrationHealth(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCode).toHaveBeenCalledWith(400);
      expect(mockSend).toHaveBeenCalledWith({
        success: false,
        error: 'Venue ID is required',
      });
    });

    it('should return health data when found', async () => {
      const healthData = {
        id: 'health-123',
        venue_id: 'venue-123',
        integration_type: 'stripe',
        status: 'healthy',
        last_check: new Date(),
        uptime_percent: 99.9,
      };

      mockRequest.params = { provider: 'stripe' };
      mockRequest.query = { venueId: 'venue-123' };
      mockFirst.mockResolvedValue(healthData);

      await controller.getIntegrationHealth(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockDb).toHaveBeenCalledWith('integration_health');
      expect(mockWhere).toHaveBeenCalledWith({
        venue_id: 'venue-123',
        integration_type: 'stripe',
      });
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: healthData,
      });
    });

    it('should return unknown status when no health data exists', async () => {
      mockRequest.params = { provider: 'square' };
      mockRequest.query = { venueId: 'venue-456' };
      mockFirst.mockResolvedValue(undefined);

      await controller.getIntegrationHealth(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: { status: 'unknown' },
      });
    });

    it('should return unknown status when health data is null', async () => {
      mockRequest.params = { provider: 'mailchimp' };
      mockRequest.query = { venueId: 'venue-789' };
      mockFirst.mockResolvedValue(null);

      await controller.getIntegrationHealth(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: { status: 'unknown' },
      });
    });

    it('should query correct provider type', async () => {
      mockRequest.params = { provider: 'quickbooks' };
      mockRequest.query = { venueId: 'venue-123' };
      mockFirst.mockResolvedValue({ status: 'healthy' });

      await controller.getIntegrationHealth(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockWhere).toHaveBeenCalledWith({
        venue_id: 'venue-123',
        integration_type: 'quickbooks',
      });
    });

    it('should propagate database errors', async () => {
      mockRequest.params = { provider: 'stripe' };
      mockRequest.query = { venueId: 'venue-123' };
      const error = new Error('Database connection lost');
      mockFirst.mockRejectedValue(error);

      await expect(
        controller.getIntegrationHealth(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        )
      ).rejects.toThrow('Database connection lost');
    });
  });

  describe('getMetrics', () => {
    beforeEach(() => {
      // Reset mock chain for metrics queries
      mockSelect.mockReturnValue({ first: mockFirst });
      mockWhereRaw.mockReturnValue({ select: mockSelect });
      mockWhere.mockReturnValue({ where: mockWhereRaw, select: mockSelect, first: mockFirst });
    });

    it('should return 400 when venueId is missing', async () => {
      mockRequest.params = { provider: 'stripe' };
      mockRequest.query = {};

      await controller.getMetrics(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCode).toHaveBeenCalledWith(400);
      expect(mockSend).toHaveBeenCalledWith({
        success: false,
        error: 'Venue ID is required',
      });
    });

    it('should return metrics with default 24h period', async () => {
      const metrics = {
        total_syncs: '50',
        successful: '48',
        failed: '2',
        avg_duration: 1234.5,
        total_success_count: '500',
        total_error_count: '10',
      };

      mockRequest.params = { provider: 'stripe' };
      mockRequest.query = { venueId: 'venue-123' };
      mockFirst.mockResolvedValue(metrics);

      await controller.getMetrics(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockDb).toHaveBeenCalledWith('sync_logs');
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: metrics,
      });
    });

    it('should handle 7d period', async () => {
      mockRequest.params = { provider: 'stripe' };
      mockRequest.query = { venueId: 'venue-123', period: '7d' };
      mockFirst.mockResolvedValue({ total_syncs: '100' });

      await controller.getMetrics(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: { total_syncs: '100' },
      });
    });

    it('should handle 30d period', async () => {
      mockRequest.params = { provider: 'square' };
      mockRequest.query = { venueId: 'venue-123', period: '30d' };
      mockFirst.mockResolvedValue({ total_syncs: '500' });

      await controller.getMetrics(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: { total_syncs: '500' },
      });
    });

    it('should return null metrics when no data exists', async () => {
      mockRequest.params = { provider: 'mailchimp' };
      mockRequest.query = { venueId: 'venue-new' };
      mockFirst.mockResolvedValue(null);

      await controller.getMetrics(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: null,
      });
    });

    it('should propagate database errors', async () => {
      mockRequest.params = { provider: 'stripe' };
      mockRequest.query = { venueId: 'venue-123' };
      const error = new Error('Query timeout');
      mockFirst.mockRejectedValue(error);

      await expect(
        controller.getMetrics(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        )
      ).rejects.toThrow('Query timeout');
    });
  });

  describe('testConnection', () => {
    it('should return 400 when venueId is missing', async () => {
      mockRequest.params = { provider: 'stripe' };
      mockRequest.body = {};

      await controller.testConnection(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCode).toHaveBeenCalledWith(400);
      expect(mockSend).toHaveBeenCalledWith({
        success: false,
        error: 'Venue ID is required',
      });
    });

    it('should return 400 for invalid provider', async () => {
      mockRequest.params = { provider: 'invalid_provider' };
      mockRequest.body = { venueId: 'venue-123' };

      await controller.testConnection(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCode).toHaveBeenCalledWith(400);
      expect(mockSend).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid provider',
      });
    });

    it('should return 404 when no credentials found', async () => {
      mockRequest.params = { provider: 'stripe' };
      mockRequest.body = { venueId: 'venue-123' };
      mockGetToken.mockResolvedValue(null);
      mockGetApiKey.mockResolvedValue(null);

      await controller.testConnection(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockGetToken).toHaveBeenCalledWith('venue-123', 'stripe');
      expect(mockGetApiKey).toHaveBeenCalledWith('venue-123', 'stripe');
      expect(mockCode).toHaveBeenCalledWith(404);
      expect(mockSend).toHaveBeenCalledWith({
        success: false,
        error: 'No credentials found',
      });
    });

    it('should test connection with OAuth token', async () => {
      const token = {
        access_token: 'access_xxx',
        refresh_token: 'refresh_xxx',
      };

      mockRequest.params = { provider: 'square' };
      mockRequest.body = { venueId: 'venue-123' };
      mockGetToken.mockResolvedValue(token);
      mockProviderInitialize.mockResolvedValue(undefined);
      mockProviderTestConnection.mockResolvedValue(true);

      await controller.testConnection(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockProviderInitialize).toHaveBeenCalledWith(token);
      expect(mockProviderTestConnection).toHaveBeenCalled();
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: {
          connected: true,
          timestamp: expect.any(Date),
        },
      });
    });

    it('should test connection with API key when no OAuth token', async () => {
      const apiKey = {
        api_key: 'sk_test_123',
        api_secret: 'whsec_xxx',
      };

      mockRequest.params = { provider: 'stripe' };
      mockRequest.body = { venueId: 'venue-123' };
      mockGetToken.mockResolvedValue(null);
      mockGetApiKey.mockResolvedValue(apiKey);
      mockProviderInitialize.mockResolvedValue(undefined);
      mockProviderTestConnection.mockResolvedValue(true);

      await controller.testConnection(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockProviderInitialize).toHaveBeenCalledWith(apiKey);
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: {
          connected: true,
          timestamp: expect.any(Date),
        },
      });
    });

    it('should return connected false when test fails', async () => {
      mockRequest.params = { provider: 'mailchimp' };
      mockRequest.body = { venueId: 'venue-123' };
      mockGetToken.mockResolvedValue({ access_token: 'xxx' });
      mockProviderInitialize.mockResolvedValue(undefined);
      mockProviderTestConnection.mockResolvedValue(false);

      await controller.testConnection(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: {
          connected: false,
          timestamp: expect.any(Date),
        },
      });
    });

    it('should test connection for quickbooks provider', async () => {
      mockRequest.params = { provider: 'quickbooks' };
      mockRequest.body = { venueId: 'venue-123' };
      mockGetToken.mockResolvedValue({ access_token: 'qb_token' });
      mockProviderInitialize.mockResolvedValue(undefined);
      mockProviderTestConnection.mockResolvedValue(true);

      await controller.testConnection(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: {
          connected: true,
          timestamp: expect.any(Date),
        },
      });
    });

    it('should propagate provider initialization errors', async () => {
      mockRequest.params = { provider: 'stripe' };
      mockRequest.body = { venueId: 'venue-123' };
      mockGetToken.mockResolvedValue({ access_token: 'xxx' });
      const error = new Error('Invalid credentials');
      mockProviderInitialize.mockRejectedValue(error);

      await expect(
        controller.testConnection(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        )
      ).rejects.toThrow('Invalid credentials');
    });

    it('should propagate connection test errors', async () => {
      mockRequest.params = { provider: 'square' };
      mockRequest.body = { venueId: 'venue-123' };
      mockGetToken.mockResolvedValue({ access_token: 'xxx' });
      mockProviderInitialize.mockResolvedValue(undefined);
      const error = new Error('Network timeout');
      mockProviderTestConnection.mockRejectedValue(error);

      await expect(
        controller.testConnection(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        )
      ).rejects.toThrow('Network timeout');
    });
  });
});
