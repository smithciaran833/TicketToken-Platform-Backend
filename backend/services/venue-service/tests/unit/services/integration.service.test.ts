/**
 * Unit tests for IntegrationService
 * Tests third-party integration management with connection testing
 */

import { IntegrationService } from '../../../src/services/integration.service';
import { createKnexMock } from '../../__mocks__/knex.mock';

// Mock logger
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

// Mock IntegrationModel
jest.mock('../../../src/models/integration.model', () => ({
  IntegrationModel: jest.fn().mockImplementation(() => ({
    findById: jest.fn(),
    findByVenue: jest.fn(),
    findByVenueAndType: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  })),
}));

describe('IntegrationService', () => {
  let service: IntegrationService;
  let mockDb: ReturnType<typeof createKnexMock>;
  let mockIntegrationModel: any;

  const mockIntegrationId = '123e4567-e89b-12d3-a456-426614174000';
  const mockVenueId = 'venue-123e4567-e89b-12d3-a456-426614174001';

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createKnexMock();
    
    service = new IntegrationService({
      db: mockDb,
      logger: mockLogger,
    });

    // Get reference to mocked model
    const { IntegrationModel } = require('../../../src/models/integration.model');
    mockIntegrationModel = IntegrationModel.mock.results[IntegrationModel.mock.results.length - 1]?.value;
  });

  describe('getIntegration', () => {
    it('should return integration when found', async () => {
      const mockIntegration = {
        id: mockIntegrationId,
        venue_id: mockVenueId,
        integration_type: 'stripe',
        api_key_encrypted: 'encrypted_key',
      };
      mockIntegrationModel.findById.mockResolvedValue(mockIntegration);

      const result = await service.getIntegration(mockIntegrationId);

      expect(result).toEqual(mockIntegration);
      expect(mockIntegrationModel.findById).toHaveBeenCalledWith(mockIntegrationId);
    });

    it('should return null when not found', async () => {
      mockIntegrationModel.findById.mockResolvedValue(null);

      const result = await service.getIntegration(mockIntegrationId);

      expect(result).toBeNull();
    });
  });

  describe('getVenueIntegrationByType', () => {
    it('should return integration for venue and type', async () => {
      const mockIntegration = {
        id: mockIntegrationId,
        venue_id: mockVenueId,
        integration_type: 'stripe',
      };
      mockIntegrationModel.findByVenueAndType.mockResolvedValue(mockIntegration);

      const result = await service.getVenueIntegrationByType(mockVenueId, 'stripe');

      expect(result).toEqual(mockIntegration);
      expect(mockIntegrationModel.findByVenueAndType).toHaveBeenCalledWith(mockVenueId, 'stripe');
    });

    it('should return null when no integration found', async () => {
      mockIntegrationModel.findByVenueAndType.mockResolvedValue(null);

      const result = await service.getVenueIntegrationByType(mockVenueId, 'stripe');

      expect(result).toBeNull();
    });
  });

  describe('listVenueIntegrations', () => {
    it('should return all integrations for venue', async () => {
      const mockIntegrations = [
        { id: 'int-1', integration_type: 'stripe' },
        { id: 'int-2', integration_type: 'square' },
      ];
      mockIntegrationModel.findByVenue.mockResolvedValue(mockIntegrations);

      const result = await service.listVenueIntegrations(mockVenueId);

      expect(result).toHaveLength(2);
      expect(mockIntegrationModel.findByVenue).toHaveBeenCalledWith(mockVenueId);
    });

    it('should return empty array when no integrations', async () => {
      mockIntegrationModel.findByVenue.mockResolvedValue([]);

      const result = await service.listVenueIntegrations(mockVenueId);

      expect(result).toEqual([]);
    });
  });

  describe('createIntegration', () => {
    it('should create integration with provided data', async () => {
      const createData = {
        type: 'stripe',
        config: { webhookEnabled: true },
        status: 'active',
        encrypted_credentials: 'encrypted_creds',
      };
      const createdIntegration = {
        id: mockIntegrationId,
        venue_id: mockVenueId,
        ...createData,
      };
      mockIntegrationModel.create.mockResolvedValue(createdIntegration);

      const result = await service.createIntegration(mockVenueId, createData);

      expect(result).toEqual(createdIntegration);
      expect(mockIntegrationModel.create).toHaveBeenCalledWith({
        venue_id: mockVenueId,
        type: createData.type,
        config: createData.config,
        status: createData.status,
        encrypted_credentials: createData.encrypted_credentials,
      });
    });

    it('should use default status when not provided', async () => {
      const createData = {
        type: 'square',
        config: {},
      };
      mockIntegrationModel.create.mockResolvedValue({ id: mockIntegrationId });

      await service.createIntegration(mockVenueId, createData);

      expect(mockIntegrationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'active',
        })
      );
    });

    it('should use empty config when not provided', async () => {
      const createData = {
        type: 'stripe',
      };
      mockIntegrationModel.create.mockResolvedValue({ id: mockIntegrationId });

      await service.createIntegration(mockVenueId, createData);

      expect(mockIntegrationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          config: {},
        })
      );
    });
  });

  describe('updateIntegration', () => {
    it('should update integration with provided data', async () => {
      const updates = {
        config: { newSetting: true },
        status: 'inactive',
      };
      const updatedIntegration = {
        id: mockIntegrationId,
        ...updates,
      };
      mockIntegrationModel.update.mockResolvedValue(updatedIntegration);

      const result = await service.updateIntegration(mockIntegrationId, updates);

      expect(result).toEqual(updatedIntegration);
      expect(mockIntegrationModel.update).toHaveBeenCalledWith(mockIntegrationId, updates);
    });
  });

  describe('deleteIntegration', () => {
    it('should delete integration', async () => {
      mockIntegrationModel.delete.mockResolvedValue(undefined);

      await service.deleteIntegration(mockIntegrationId);

      expect(mockIntegrationModel.delete).toHaveBeenCalledWith(mockIntegrationId);
    });
  });

  describe('testIntegration', () => {
    it('should return success for stripe integration', async () => {
      const mockIntegration = {
        id: mockIntegrationId,
        integration_type: 'stripe',
        api_key_encrypted: 'encrypted_key',
      };
      mockIntegrationModel.findById.mockResolvedValue(mockIntegration);

      const result = await service.testIntegration(mockIntegrationId);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Stripe connection successful');
    });

    it('should return success for square integration', async () => {
      const mockIntegration = {
        id: mockIntegrationId,
        integration_type: 'square',
        api_key_encrypted: 'encrypted_key',
      };
      mockIntegrationModel.findById.mockResolvedValue(mockIntegration);

      const result = await service.testIntegration(mockIntegrationId);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Square connection successful');
    });

    it('should return not supported for unknown integration type', async () => {
      const mockIntegration = {
        id: mockIntegrationId,
        integration_type: 'unknown_provider',
        api_key_encrypted: 'encrypted_key',
      };
      mockIntegrationModel.findById.mockResolvedValue(mockIntegration);

      const result = await service.testIntegration(mockIntegrationId);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Integration type not supported');
    });

    it('should throw error when integration not found', async () => {
      mockIntegrationModel.findById.mockResolvedValue(null);

      await expect(service.testIntegration(mockIntegrationId)).rejects.toThrow('Integration not found');
    });
  });

  describe('syncWithExternalSystem', () => {
    it('should log sync attempt for stripe', async () => {
      const mockIntegration = {
        id: mockIntegrationId,
        integration_type: 'stripe',
        api_key_encrypted: 'encrypted_key',
      };
      mockIntegrationModel.findById.mockResolvedValue(mockIntegration);

      await service.syncWithExternalSystem(mockIntegrationId);

      expect(mockLogger.info).toHaveBeenCalledWith(
        { integrationId: mockIntegrationId, type: 'stripe' },
        'Syncing with external system'
      );
    });

    it('should log sync attempt for square', async () => {
      const mockIntegration = {
        id: mockIntegrationId,
        integration_type: 'square',
        api_secret_encrypted: 'encrypted_secret',
      };
      mockIntegrationModel.findById.mockResolvedValue(mockIntegration);

      await service.syncWithExternalSystem(mockIntegrationId);

      expect(mockLogger.info).toHaveBeenCalledWith(
        { integrationId: mockIntegrationId, type: 'square' },
        'Syncing with external system'
      );
    });

    it('should throw error when integration not found', async () => {
      mockIntegrationModel.findById.mockResolvedValue(null);

      await expect(service.syncWithExternalSystem(mockIntegrationId)).rejects.toThrow('Integration not found');
    });
  });
});
