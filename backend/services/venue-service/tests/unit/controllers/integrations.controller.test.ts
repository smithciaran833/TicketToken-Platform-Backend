import { integrationRoutes } from '../../../src/controllers/integrations.controller';
import { ForbiddenError, NotFoundError, ConflictError } from '../../../src/utils/errors';

// Mock dependencies
jest.mock('../../../src/services/cache-integration', () => ({
  cache: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  },
}));

jest.mock('../../../src/utils/metrics', () => ({
  venueOperations: {
    inc: jest.fn(),
  },
}));

describe('Integrations Controller', () => {
  let mockFastify: any;
  let mockIntegrationService: any;
  let mockVenueService: any;
  let mockLogger: any;
  let mockRedis: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock services
    mockIntegrationService = {
      listVenueIntegrations: jest.fn(),
      createIntegration: jest.fn(),
      getIntegration: jest.fn(),
      updateIntegration: jest.fn(),
      deleteIntegration: jest.fn(),
      testIntegration: jest.fn(),
    };

    mockVenueService = {
      checkVenueAccess: jest.fn(),
      getAccessDetails: jest.fn(),
    };

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    mockRedis = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    // Mock Fastify instance
    mockFastify = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      container: {
        cradle: {
          integrationService: mockIntegrationService,
          venueService: mockVenueService,
          logger: mockLogger,
          redis: mockRedis,
        },
      },
    };
  });

  // Helper to create mock reply
  const createMockReply = () => ({
    send: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
    code: jest.fn().mockReturnThis(),
  });

  // =============================================================================
  // GET / - List Venue Integrations - 4 test cases
  // =============================================================================

  describe('GET / - List Venue Integrations', () => {
    let handler: any;
    let mockRequest: any;
    let mockReply: any;

    beforeEach(async () => {
      await integrationRoutes(mockFastify as any);
      handler = mockFastify.get.mock.calls.find(
        (call: any) => call[0] === '/'
      )[2];

      mockRequest = {
        params: { venueId: 'venue-1' },
        user: { id: 'user-1' },
        tenantId: 'tenant-1',
      };

      mockReply = createMockReply();
      mockVenueService.checkVenueAccess.mockResolvedValue(true);
    });

    it('should list integrations successfully', async () => {
      const mockIntegrations = [
        {
          id: 'int-1',
          venue_id: 'venue-1',
          type: 'stripe',
          config_data: '{"webhook_url":"https://example.com"}',
          api_key_encrypted: 'encrypted_key',
          api_secret_encrypted: 'encrypted_secret',
        },
      ];
      mockIntegrationService.listVenueIntegrations.mockResolvedValue(mockIntegrations);

      await handler(mockRequest, mockReply);

      expect(mockVenueService.checkVenueAccess).toHaveBeenCalledWith(
        'venue-1',
        'user-1',
        'tenant-1'
      );
      expect(mockIntegrationService.listVenueIntegrations).toHaveBeenCalledWith('venue-1');
      expect(mockReply.send).toHaveBeenCalledWith([
        expect.objectContaining({
          id: 'int-1',
          type: 'stripe',
          config: expect.objectContaining({
            webhook_url: 'https://example.com',
            apiKey: '***',
            secretKey: '***',
          }),
        }),
      ]);
    });

    it('should mask sensitive credentials', async () => {
      const mockIntegrations = [
        {
          id: 'int-1',
          venue_id: 'venue-1',
          type: 'square',
          config_data: JSON.stringify({
            apiKey: 'real_key',
            secretKey: 'real_secret',
            api_key: 'another_key',
            secret_key: 'another_secret',
          }),
          encrypted_credentials: 'encrypted',
        },
      ];
      mockIntegrationService.listVenueIntegrations.mockResolvedValue(mockIntegrations);

      await handler(mockRequest, mockReply);

      const result = mockReply.send.mock.calls[0][0][0];
      expect(result.config.apiKey).toBe('***');
      expect(result.config.secretKey).toBe('***');
      expect(result.config.api_key).toBe('***');
      expect(result.config.secret_key).toBe('***');
      expect(result.encrypted_credentials).toBeUndefined();
    });

    it('should return 403 for forbidden access', async () => {
      mockVenueService.checkVenueAccess.mockResolvedValue(false);

      await expect(handler(mockRequest, mockReply)).rejects.toThrow(ForbiddenError);
    });

    it('should handle errors gracefully', async () => {
      mockIntegrationService.listVenueIntegrations.mockRejectedValue(
        new Error('Database error')
      );

      await expect(handler(mockRequest, mockReply)).rejects.toThrow();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // POST / - Create Integration - 4 test cases
  // =============================================================================

  describe('POST / - Create Integration', () => {
    let handler: any;
    let mockRequest: any;
    let mockReply: any;

    beforeEach(async () => {
      await integrationRoutes(mockFastify as any);
      handler = mockFastify.post.mock.calls.find(
        (call: any) => call[0] === '/'
      )[2];

      mockRequest = {
        params: { venueId: 'venue-1' },
        user: { id: 'user-1' },
        tenantId: 'tenant-1',
        body: {
          type: 'stripe',
          config: { webhook_url: 'https://example.com' },
          credentials: { apiKey: 'key', secretKey: 'secret' },
        },
      };

      mockReply = createMockReply();
      mockVenueService.checkVenueAccess.mockResolvedValue(true);
      mockVenueService.getAccessDetails.mockResolvedValue({ role: 'owner' });
    });

    it('should create integration successfully', async () => {
      const mockIntegration = {
        id: 'int-1',
        venue_id: 'venue-1',
        type: 'stripe',
        status: 'active',
      };
      mockIntegrationService.createIntegration.mockResolvedValue(mockIntegration);

      await handler(mockRequest, mockReply);

      expect(mockIntegrationService.createIntegration).toHaveBeenCalledWith(
        'venue-1',
        {
          type: 'stripe',
          config: { webhook_url: 'https://example.com' },
          encrypted_credentials: { apiKey: 'key', secretKey: 'secret' },
          status: 'active',
        }
      );
      expect(mockReply.status).toHaveBeenCalledWith(201);
      expect(mockReply.send).toHaveBeenCalledWith(mockIntegration);
    });

    it('should return 403 for insufficient permissions', async () => {
      mockVenueService.getAccessDetails.mockResolvedValue({ role: 'staff' });

      await expect(handler(mockRequest, mockReply)).rejects.toThrow(ForbiddenError);
    });

    it('should handle duplicate integration error', async () => {
      const dbError: any = new Error('Duplicate');
      dbError.code = '23505';
      dbError.constraint = 'idx_venue_integrations_unique';
      mockIntegrationService.createIntegration.mockRejectedValue(dbError);

      await expect(handler(mockRequest, mockReply)).rejects.toThrow(ConflictError);
    });

    it('should log integration creation', async () => {
      mockIntegrationService.createIntegration.mockResolvedValue({ id: 'int-1' });

      await handler(mockRequest, mockReply);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          venueId: 'venue-1',
          integrationType: 'stripe',
          userId: 'user-1',
        }),
        'Integration created'
      );
    });
  });

  // =============================================================================
  // GET /:integrationId - Get Integration - 3 test cases
  // =============================================================================

  describe('GET /:integrationId - Get Integration', () => {
    let handler: any;
    let mockRequest: any;
    let mockReply: any;

    beforeEach(async () => {
      await integrationRoutes(mockFastify as any);
      handler = mockFastify.get.mock.calls.find(
        (call: any) => call[0] === '/:integrationId'
      )[2];

      mockRequest = {
        params: { venueId: 'venue-1', integrationId: 'int-1' },
        user: { id: 'user-1' },
        tenantId: 'tenant-1',
      };

      mockReply = createMockReply();
      mockVenueService.checkVenueAccess.mockResolvedValue(true);
    });

    it('should get integration successfully', async () => {
      const mockIntegration = {
        id: 'int-1',
        venue_id: 'venue-1',
        type: 'stripe',
        config: { apiKey: 'real_key', secretKey: 'real_secret' },
      };
      mockIntegrationService.getIntegration.mockResolvedValue(mockIntegration);

      await handler(mockRequest, mockReply);

      expect(mockIntegrationService.getIntegration).toHaveBeenCalledWith('int-1');
      const result = mockReply.send.mock.calls[0][0];
      expect(result.config.apiKey).toBe('***');
      expect(result.config.secretKey).toBe('***');
    });

    it('should return 404 if integration not found', async () => {
      mockIntegrationService.getIntegration.mockResolvedValue(null);

      await expect(handler(mockRequest, mockReply)).rejects.toThrow(NotFoundError);
    });

    it('should return 403 if integration belongs to different venue', async () => {
      const mockIntegration = {
        id: 'int-1',
        venue_id: 'venue-2',
        type: 'stripe',
      };
      mockIntegrationService.getIntegration.mockResolvedValue(mockIntegration);

      await expect(handler(mockRequest, mockReply)).rejects.toThrow(ForbiddenError);
    });
  });

  // =============================================================================
  // PUT /:integrationId - Update Integration - 3 test cases
  // =============================================================================

  describe('PUT /:integrationId - Update Integration', () => {
    let handler: any;
    let mockRequest: any;
    let mockReply: any;

    beforeEach(async () => {
      await integrationRoutes(mockFastify as any);
      handler = mockFastify.put.mock.calls.find(
        (call: any) => call[0] === '/:integrationId'
      )[2];

      mockRequest = {
        params: { venueId: 'venue-1', integrationId: 'int-1' },
        user: { id: 'user-1' },
        tenantId: 'tenant-1',
        body: { config: { webhook_url: 'https://new.example.com' } },
      };

      mockReply = createMockReply();
      mockVenueService.checkVenueAccess.mockResolvedValue(true);
      mockVenueService.getAccessDetails.mockResolvedValue({ role: 'owner' });
    });

    it('should update integration successfully', async () => {
      const mockExisting = { id: 'int-1', venue_id: 'venue-1', type: 'stripe' };
      const mockUpdated = { ...mockExisting, config: { webhook_url: 'https://new.example.com' } };
      mockIntegrationService.getIntegration.mockResolvedValue(mockExisting);
      mockIntegrationService.updateIntegration.mockResolvedValue(mockUpdated);

      await handler(mockRequest, mockReply);

      expect(mockIntegrationService.updateIntegration).toHaveBeenCalledWith(
        'int-1',
        { config: { webhook_url: 'https://new.example.com' } }
      );
      expect(mockReply.send).toHaveBeenCalledWith(mockUpdated);
    });

    it('should return 403 for insufficient permissions', async () => {
      mockVenueService.getAccessDetails.mockResolvedValue({ role: 'staff' });
      mockIntegrationService.getIntegration.mockResolvedValue({ 
        id: 'int-1', 
        venue_id: 'venue-1' 
      });

      await expect(handler(mockRequest, mockReply)).rejects.toThrow(ForbiddenError);
    });

    it('should return 404 if integration not found', async () => {
      mockIntegrationService.getIntegration.mockResolvedValue(null);

      await expect(handler(mockRequest, mockReply)).rejects.toThrow(NotFoundError);
    });
  });

  // =============================================================================
  // DELETE /:integrationId - Delete Integration - 2 test cases
  // =============================================================================

  describe('DELETE /:integrationId - Delete Integration', () => {
    let handler: any;
    let mockRequest: any;
    let mockReply: any;

    beforeEach(async () => {
      await integrationRoutes(mockFastify as any);
      handler = mockFastify.delete.mock.calls.find(
        (call: any) => call[0] === '/:integrationId'
      )[2];

      mockRequest = {
        params: { venueId: 'venue-1', integrationId: 'int-1' },
        user: { id: 'user-1' },
        tenantId: 'tenant-1',
      };

      mockReply = createMockReply();
      mockVenueService.checkVenueAccess.mockResolvedValue(true);
      mockVenueService.getAccessDetails.mockResolvedValue({ role: 'owner' });
    });

    it('should delete integration successfully', async () => {
      const mockExisting = { id: 'int-1', venue_id: 'venue-1' };
      mockIntegrationService.getIntegration.mockResolvedValue(mockExisting);
      mockIntegrationService.deleteIntegration.mockResolvedValue(true);

      await handler(mockRequest, mockReply);

      expect(mockIntegrationService.deleteIntegration).toHaveBeenCalledWith('int-1');
      expect(mockReply.status).toHaveBeenCalledWith(204);
    });

    it('should return 403 for insufficient permissions', async () => {
      mockVenueService.getAccessDetails.mockResolvedValue({ role: 'staff' });
      mockIntegrationService.getIntegration.mockResolvedValue({ 
        id: 'int-1', 
        venue_id: 'venue-1' 
      });

      await expect(handler(mockRequest, mockReply)).rejects.toThrow(ForbiddenError);
    });
  });

  // =============================================================================
  // POST /:integrationId/test - Test Integration - 3 test cases
  // =============================================================================

  describe('POST /:integrationId/test - Test Integration', () => {
    let handler: any;
    let mockRequest: any;
    let mockReply: any;

    beforeEach(async () => {
      await integrationRoutes(mockFastify as any);
      handler = mockFastify.post.mock.calls.find(
        (call: any) => call[0] === '/:integrationId/test'
      )[2];

      mockRequest = {
        params: { venueId: 'venue-1', integrationId: 'int-1' },
        user: { id: 'user-1' },
        tenantId: 'tenant-1',
      };

      mockReply = createMockReply();
      mockVenueService.checkVenueAccess.mockResolvedValue(true);
    });

    it('should test integration successfully', async () => {
      const mockExisting = { id: 'int-1', venue_id: 'venue-1' };
      mockIntegrationService.getIntegration.mockResolvedValue(mockExisting);
      mockIntegrationService.testIntegration.mockResolvedValue({
        success: true,
        message: 'Connection successful',
      });

      await handler(mockRequest, mockReply);

      expect(mockIntegrationService.testIntegration).toHaveBeenCalledWith('int-1');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        message: 'Connection successful',
      });
    });

    it('should return 404 if integration not found', async () => {
      mockIntegrationService.getIntegration.mockResolvedValue(null);

      await expect(handler(mockRequest, mockReply)).rejects.toThrow(NotFoundError);
    });

    it('should return 404 if integration belongs to different venue', async () => {
      mockIntegrationService.getIntegration.mockResolvedValue({
        id: 'int-1',
        venue_id: 'venue-2',
      });

      await expect(handler(mockRequest, mockReply)).rejects.toThrow(NotFoundError);
    });
  });
});
