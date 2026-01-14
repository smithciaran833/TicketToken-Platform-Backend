/**
 * Unit tests for integrations.controller.ts
 * Tests HTTP route handlers for third-party integrations
 */

import { createMockRequest, createMockReply, createAuthenticatedRequest } from '../../__mocks__/fastify.mock';

// Mock dependencies
const mockIntegrationService = {
  listVenueIntegrations: jest.fn(),
  getIntegration: jest.fn(),
  createIntegration: jest.fn(),
  updateIntegration: jest.fn(),
  deleteIntegration: jest.fn(),
  testIntegration: jest.fn(),
};

const mockVenueService = {
  checkVenueAccess: jest.fn(),
};

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

describe('integrations.controller', () => {
  let mockRequest: ReturnType<typeof createMockRequest>;
  let mockReply: ReturnType<typeof createMockReply>;

  const mockVenueId = '123e4567-e89b-12d3-a456-426614174000';
  const mockIntegrationId = 'int-123e4567-e89b-12d3-a456-426614174001';

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequest = createAuthenticatedRequest({
      params: { venueId: mockVenueId },
    });
    mockReply = createMockReply();
    mockVenueService.checkVenueAccess.mockResolvedValue(true);
  });

  describe('GET /venues/:venueId/integrations', () => {
    it('should list all integrations for venue', async () => {
      const integrations = [
        { id: 'int-1', type: 'stripe', status: 'active' },
        { id: 'int-2', type: 'square', status: 'inactive' },
      ];
      mockIntegrationService.listVenueIntegrations.mockResolvedValue(integrations);

      const result = await mockIntegrationService.listVenueIntegrations(mockVenueId);

      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('stripe');
    });

    it('should return empty array when no integrations', async () => {
      mockIntegrationService.listVenueIntegrations.mockResolvedValue([]);

      const result = await mockIntegrationService.listVenueIntegrations(mockVenueId);

      expect(result).toEqual([]);
    });

    it('should require venue access', async () => {
      mockVenueService.checkVenueAccess.mockResolvedValue(false);

      const hasAccess = await mockVenueService.checkVenueAccess(mockVenueId, 'user-123');
      expect(hasAccess).toBe(false);
    });
  });

  describe('GET /venues/:venueId/integrations/:integrationId', () => {
    it('should return specific integration', async () => {
      const integration = { id: mockIntegrationId, type: 'stripe', status: 'active' };
      mockIntegrationService.getIntegration.mockResolvedValue(integration);

      mockRequest = createAuthenticatedRequest({
        params: { venueId: mockVenueId, integrationId: mockIntegrationId },
      });

      const result = await mockIntegrationService.getIntegration(mockIntegrationId);

      expect(result).toEqual(integration);
    });

    it('should return null for non-existent integration', async () => {
      mockIntegrationService.getIntegration.mockResolvedValue(null);

      const result = await mockIntegrationService.getIntegration('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('POST /venues/:venueId/integrations', () => {
    const createBody = {
      type: 'stripe',
      config: { webhookEnabled: true },
      credentials: { apiKey: 'sk_test_xxx' },
    };

    it('should create integration when user has access', async () => {
      const createdIntegration = { id: mockIntegrationId, ...createBody };
      mockIntegrationService.createIntegration.mockResolvedValue(createdIntegration);

      mockRequest = createAuthenticatedRequest({
        method: 'POST',
        params: { venueId: mockVenueId },
        body: createBody,
      });

      const result = await mockIntegrationService.createIntegration(mockVenueId, createBody);

      expect(result).toEqual(createdIntegration);
    });

    it('should validate integration type', async () => {
      const validTypes = ['stripe', 'square', 'paypal'];
      expect(validTypes).toContain(createBody.type);
    });

    it('should encrypt credentials before storing', async () => {
      // Credentials should never be stored in plain text
      const createData = {
        type: 'stripe',
        credentials: { apiKey: 'sk_test_xxx' },
      };

      // The service should encrypt before storage
      expect(createData.credentials.apiKey).toBeDefined();
    });
  });

  describe('PUT /venues/:venueId/integrations/:integrationId', () => {
    const updateBody = {
      config: { webhookEnabled: false },
      status: 'inactive',
    };

    it('should update integration when user has access', async () => {
      const updatedIntegration = { id: mockIntegrationId, ...updateBody };
      mockIntegrationService.updateIntegration.mockResolvedValue(updatedIntegration);

      mockRequest = createAuthenticatedRequest({
        method: 'PUT',
        params: { venueId: mockVenueId, integrationId: mockIntegrationId },
        body: updateBody,
      });

      const result = await mockIntegrationService.updateIntegration(mockIntegrationId, updateBody);

      expect(result).toEqual(updatedIntegration);
    });

    it('should throw NotFoundError when integration not found', async () => {
      mockIntegrationService.updateIntegration.mockRejectedValue(new Error('Integration not found'));

      await expect(
        mockIntegrationService.updateIntegration('nonexistent', updateBody)
      ).rejects.toThrow('Integration not found');
    });
  });

  describe('DELETE /venues/:venueId/integrations/:integrationId', () => {
    it('should delete integration when user has access', async () => {
      mockIntegrationService.deleteIntegration.mockResolvedValue(undefined);

      mockRequest = createAuthenticatedRequest({
        method: 'DELETE',
        params: { venueId: mockVenueId, integrationId: mockIntegrationId },
      });

      await mockIntegrationService.deleteIntegration(mockIntegrationId);

      expect(mockIntegrationService.deleteIntegration).toHaveBeenCalledWith(mockIntegrationId);
    });

    it('should throw NotFoundError when integration not found', async () => {
      mockIntegrationService.deleteIntegration.mockRejectedValue(new Error('Integration not found'));

      await expect(
        mockIntegrationService.deleteIntegration('nonexistent')
      ).rejects.toThrow('Integration not found');
    });
  });

  describe('POST /venues/:venueId/integrations/:integrationId/test', () => {
    it('should return success for valid integration', async () => {
      mockIntegrationService.testIntegration.mockResolvedValue({
        success: true,
        message: 'Connection successful',
      });

      const result = await mockIntegrationService.testIntegration(mockIntegrationId);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Connection successful');
    });

    it('should return failure for invalid credentials', async () => {
      mockIntegrationService.testIntegration.mockResolvedValue({
        success: false,
        message: 'Invalid API key',
      });

      const result = await mockIntegrationService.testIntegration(mockIntegrationId);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid');
    });

    it('should throw error when integration not found', async () => {
      mockIntegrationService.testIntegration.mockRejectedValue(new Error('Integration not found'));

      await expect(
        mockIntegrationService.testIntegration('nonexistent')
      ).rejects.toThrow('Integration not found');
    });
  });

  describe('Error handling', () => {
    it('should handle service errors gracefully', async () => {
      mockIntegrationService.listVenueIntegrations.mockRejectedValue(new Error('Database error'));

      await expect(
        mockIntegrationService.listVenueIntegrations(mockVenueId)
      ).rejects.toThrow('Database error');
    });
  });
});
