import { IntegrationService } from '../../../src/services/integration.service';
import { IntegrationModel } from '../../../src/models/integration.model';

// =============================================================================
// MOCKS
// =============================================================================

jest.mock('../../../src/models/integration.model');

describe('IntegrationService', () => {
  let integrationService: IntegrationService;
  let mockDb: any;
  let mockLogger: any;
  let mockIntegrationModel: jest.Mocked<IntegrationModel>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockDb = {} as any;
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    };

    mockIntegrationModel = {
      findById: jest.fn(),
      findByVenue: jest.fn(),
      findByVenueAndType: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as any;

    (IntegrationModel as jest.MockedClass<typeof IntegrationModel>).mockImplementation(
      () => mockIntegrationModel
    );

    integrationService = new IntegrationService({ db: mockDb, logger: mockLogger });
  });

  // =============================================================================
  // getIntegration() - 3 test cases
  // =============================================================================

  describe('getIntegration()', () => {
    it('should get integration by ID', async () => {
      const mockIntegration = {
        id: 'int-123',
        venue_id: 'venue-123',
        integration_type: 'stripe',
      };
      mockIntegrationModel.findById.mockResolvedValue(mockIntegration as any);

      const result = await integrationService.getIntegration('int-123');

      expect(result).toEqual(mockIntegration);
      expect(mockIntegrationModel.findById).toHaveBeenCalledWith('int-123');
    });

    it('should return null if integration not found', async () => {
      mockIntegrationModel.findById.mockResolvedValue(null);

      const result = await integrationService.getIntegration('non-existent');

      expect(result).toBeNull();
    });

    it('should handle errors', async () => {
      mockIntegrationModel.findById.mockRejectedValue(new Error('DB error'));

      await expect(integrationService.getIntegration('int-123')).rejects.toThrow(
        'DB error'
      );
    });
  });

  // =============================================================================
  // getVenueIntegrationByType() - 3 test cases
  // =============================================================================

  describe('getVenueIntegrationByType()', () => {
    it('should get integration by venue and type', async () => {
      const mockIntegration = {
        id: 'int-123',
        venue_id: 'venue-123',
        integration_type: 'stripe',
      };
      mockIntegrationModel.findByVenueAndType.mockResolvedValue(mockIntegration as any);

      const result = await integrationService.getVenueIntegrationByType(
        'venue-123',
        'stripe'
      );

      expect(result).toEqual(mockIntegration);
      expect(mockIntegrationModel.findByVenueAndType).toHaveBeenCalledWith(
        'venue-123',
        'stripe'
      );
    });

    it('should return null if not found', async () => {
      mockIntegrationModel.findByVenueAndType.mockResolvedValue(undefined as any);

      const result = await integrationService.getVenueIntegrationByType(
        'venue-123',
        'square'
      );

      expect(result).toBeUndefined();
    });

    it('should handle errors', async () => {
      mockIntegrationModel.findByVenueAndType.mockRejectedValue(
        new Error('DB error')
      );

      await expect(
        integrationService.getVenueIntegrationByType('venue-123', 'stripe')
      ).rejects.toThrow('DB error');
    });
  });

  // =============================================================================
  // listVenueIntegrations() - 2 test cases
  // =============================================================================

  describe('listVenueIntegrations()', () => {
    it('should list all venue integrations', async () => {
      const mockIntegrations = [
        { id: 'int-1', integration_type: 'stripe' },
        { id: 'int-2', integration_type: 'square' },
      ];
      mockIntegrationModel.findByVenue.mockResolvedValue(mockIntegrations as any);

      const result = await integrationService.listVenueIntegrations('venue-123');

      expect(result).toEqual(mockIntegrations);
      expect(mockIntegrationModel.findByVenue).toHaveBeenCalledWith('venue-123');
    });

    it('should return empty array if no integrations', async () => {
      mockIntegrationModel.findByVenue.mockResolvedValue([]);

      const result = await integrationService.listVenueIntegrations('venue-123');

      expect(result).toEqual([]);
    });
  });

  // =============================================================================
  // createIntegration() - 4 test cases
  // =============================================================================

  describe('createIntegration()', () => {
    const venueId = 'venue-123';
    const data = {
      type: 'stripe',
      config: { apiVersion: '2023-10-16' },
      encrypted_credentials: 'encrypted-key',
    };

    it('should create new integration', async () => {
      const mockIntegration = { id: 'int-123', ...data };
      mockIntegrationModel.create.mockResolvedValue(mockIntegration as any);

      const result = await integrationService.createIntegration(venueId, data);

      expect(result).toEqual(mockIntegration);
      expect(mockIntegrationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          venue_id: venueId,
          type: data.type,
          config: data.config,
        })
      );
    });

    it('should use default config if not provided', async () => {
      const minimalData = { type: 'square' };
      mockIntegrationModel.create.mockResolvedValue({ id: 'int-123' } as any);

      await integrationService.createIntegration(venueId, minimalData);

      expect(mockIntegrationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          config: {},
        })
      );
    });

    it('should use default status if not provided', async () => {
      const dataWithoutStatus = { type: 'stripe', config: {} };
      mockIntegrationModel.create.mockResolvedValue({ id: 'int-123' } as any);

      await integrationService.createIntegration(venueId, dataWithoutStatus);

      expect(mockIntegrationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'active',
        })
      );
    });

    it('should handle errors', async () => {
      mockIntegrationModel.create.mockRejectedValue(new Error('Create failed'));

      await expect(
        integrationService.createIntegration(venueId, data)
      ).rejects.toThrow('Create failed');
    });
  });

  // =============================================================================
  // updateIntegration() - 2 test cases
  // =============================================================================

  describe('updateIntegration()', () => {
    it('should update integration', async () => {
      const updates = { status: 'inactive', config: { updated: true } };
      const mockUpdated = { id: 'int-123', ...updates };
      mockIntegrationModel.update.mockResolvedValue(mockUpdated as any);

      const result = await integrationService.updateIntegration('int-123', updates);

      expect(result).toEqual(mockUpdated);
      expect(mockIntegrationModel.update).toHaveBeenCalledWith('int-123', updates);
    });

    it('should handle errors', async () => {
      mockIntegrationModel.update.mockRejectedValue(new Error('Update failed'));

      await expect(
        integrationService.updateIntegration('int-123', {})
      ).rejects.toThrow('Update failed');
    });
  });

  // =============================================================================
  // deleteIntegration() - 2 test cases
  // =============================================================================

  describe('deleteIntegration()', () => {
    it('should delete integration', async () => {
      mockIntegrationModel.delete.mockResolvedValue(1 as any);

      await integrationService.deleteIntegration('int-123');

      expect(mockIntegrationModel.delete).toHaveBeenCalledWith('int-123');
    });

    it('should handle errors', async () => {
      mockIntegrationModel.delete.mockRejectedValue(new Error('Delete failed'));

      await expect(integrationService.deleteIntegration('int-123')).rejects.toThrow(
        'Delete failed'
      );
    });
  });

  // =============================================================================
  // testIntegration() - 5 test cases
  // =============================================================================

  describe('testIntegration()', () => {
    it('should throw error if integration not found', async () => {
      mockIntegrationModel.findById.mockResolvedValue(null);

      await expect(integrationService.testIntegration('int-123')).rejects.toThrow(
        'Integration not found'
      );
    });

    it('should test Stripe integration', async () => {
      const mockIntegration = {
        id: 'int-123',
        integration_type: 'stripe',
        api_key_encrypted: 'encrypted-key',
      };
      mockIntegrationModel.findById.mockResolvedValue(mockIntegration as any);

      const result = await integrationService.testIntegration('int-123');

      expect(result.success).toBe(true);
      expect(result.message).toContain('Stripe');
    });

    it('should test Square integration', async () => {
      const mockIntegration = {
        id: 'int-123',
        integration_type: 'square',
        api_secret_encrypted: 'encrypted-secret',
      };
      mockIntegrationModel.findById.mockResolvedValue(mockIntegration as any);

      const result = await integrationService.testIntegration('int-123');

      expect(result.success).toBe(true);
      expect(result.message).toContain('Square');
    });

    it('should return failure for unsupported integration type', async () => {
      const mockIntegration = {
        id: 'int-123',
        integration_type: 'unsupported',
      };
      mockIntegrationModel.findById.mockResolvedValue(mockIntegration as any);

      const result = await integrationService.testIntegration('int-123');

      expect(result.success).toBe(false);
      expect(result.message).toContain('not supported');
    });

    it('should handle errors during test', async () => {
      mockIntegrationModel.findById.mockRejectedValue(new Error('Test error'));

      await expect(integrationService.testIntegration('int-123')).rejects.toThrow(
        'Test error'
      );
    });
  });

  // =============================================================================
  // syncWithExternalSystem() - 3 test cases
  // =============================================================================

  describe('syncWithExternalSystem()', () => {
    it('should throw error if integration not found', async () => {
      mockIntegrationModel.findById.mockResolvedValue(null);

      await expect(
        integrationService.syncWithExternalSystem('int-123')
      ).rejects.toThrow('Integration not found');
    });

    it('should log sync info', async () => {
      const mockIntegration = {
        id: 'int-123',
        integration_type: 'stripe',
        api_key_encrypted: 'encrypted-key',
      };
      mockIntegrationModel.findById.mockResolvedValue(mockIntegration as any);

      await integrationService.syncWithExternalSystem('int-123');

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          integrationId: 'int-123',
          type: 'stripe',
        }),
        'Syncing with external system'
      );
    });

    it('should handle errors', async () => {
      mockIntegrationModel.findById.mockRejectedValue(new Error('Sync error'));

      await expect(
        integrationService.syncWithExternalSystem('int-123')
      ).rejects.toThrow('Sync error');
    });
  });
});
