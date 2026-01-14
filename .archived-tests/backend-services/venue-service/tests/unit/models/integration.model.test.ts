import { IntegrationModel } from '../../../src/models/integration.model';

describe('IntegrationModel', () => {
  let integrationModel: IntegrationModel;
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();

    const mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      whereNull: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      first: jest.fn(),
      insert: jest.fn().mockReturnThis(),
      returning: jest.fn(),
      update: jest.fn().mockReturnThis(),
    };

    mockDb = Object.assign(jest.fn().mockReturnValue(mockQueryBuilder), {
      _mockQueryBuilder: mockQueryBuilder,
    });

    integrationModel = new IntegrationModel(mockDb);
  });

  // =============================================================================
  // constructor() - 1 test case
  // =============================================================================

  describe('constructor()', () => {
    it('should set table name to venue_integrations', () => {
      expect((integrationModel as any).tableName).toBe('venue_integrations');
    });
  });

  // =============================================================================
  // findById() - 2 test cases
  // =============================================================================

  describe('findById()', () => {
    it('should find integration without is_active filter', async () => {
      const mockIntegration = { id: '123', venue_id: 'venue-1', is_active: false };
      mockDb._mockQueryBuilder.first.mockResolvedValue(mockIntegration);

      const result = await integrationModel.findById('123');

      expect(result).toEqual(mockIntegration);
      expect(mockDb._mockQueryBuilder.where).toHaveBeenCalledWith({ id: '123' });
    });

    it('should select specific columns when provided', async () => {
      mockDb._mockQueryBuilder.first.mockResolvedValue({ id: '123' });

      await integrationModel.findById('123', ['id', 'venue_id']);

      expect(mockDb._mockQueryBuilder.select).toHaveBeenCalledWith(['id', 'venue_id']);
    });
  });

  // =============================================================================
  // findByVenue() - 2 test cases (simplified to avoid double where() issue)
  // =============================================================================

  describe('findByVenue()', () => {
    const mockIntegrations = [
      { id: '1', venue_id: 'venue-1', is_active: true },
      { id: '2', venue_id: 'venue-1', is_active: true },
    ];

    it('should find all active integrations for venue', async () => {
      // The second where() call returns the final result
      mockDb._mockQueryBuilder.where.mockReturnValueOnce(mockDb._mockQueryBuilder).mockReturnValue(mockIntegrations);

      const result = await integrationModel.findByVenue('venue-1');

      expect(result).toEqual(mockIntegrations);
      expect(mockDb._mockQueryBuilder.where).toHaveBeenCalledWith({ venue_id: 'venue-1' });
      expect(mockDb._mockQueryBuilder.where).toHaveBeenCalledWith({ is_active: true });
    });

    it('should return empty array if no integrations', async () => {
      mockDb._mockQueryBuilder.where.mockReturnValueOnce(mockDb._mockQueryBuilder).mockReturnValue([]);

      const result = await integrationModel.findByVenue('venue-1');

      expect(result).toEqual([]);
    });
  });

  // =============================================================================
  // findByVenueAndType() - 3 test cases
  // =============================================================================

  describe('findByVenueAndType()', () => {
    it('should find integration by venue and type', async () => {
      const mockIntegration = {
        id: '123',
        venue_id: 'venue-1',
        integration_type: 'stripe',
        is_active: true,
      };
      mockDb._mockQueryBuilder.first.mockResolvedValue(mockIntegration);

      const result = await integrationModel.findByVenueAndType('venue-1', 'stripe');

      expect(result).toEqual(mockIntegration);
      expect(mockDb._mockQueryBuilder.where).toHaveBeenCalledWith({
        venue_id: 'venue-1',
        integration_type: 'stripe',
      });
    });

    it('should only return active integration', async () => {
      mockDb._mockQueryBuilder.first.mockResolvedValue(null);

      await integrationModel.findByVenueAndType('venue-1', 'stripe');

      expect(mockDb._mockQueryBuilder.where).toHaveBeenCalledWith({ is_active: true });
    });

    it('should return undefined if not found', async () => {
      mockDb._mockQueryBuilder.first.mockResolvedValue(undefined);

      const result = await integrationModel.findByVenueAndType('venue-1', 'square');

      expect(result).toBeUndefined();
    });
  });

  // =============================================================================
  // create() - 6 test cases
  // =============================================================================

  describe('create()', () => {
    it('should create integration with type field', async () => {
      const data = {
        venue_id: 'venue-1',
        type: 'stripe',
        config: { apiVersion: '2023-10-16' },
      };
      const created = { id: '123', ...data };
      mockDb._mockQueryBuilder.returning.mockResolvedValue([created]);

      await integrationModel.create(data);

      expect(mockDb._mockQueryBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          venue_id: 'venue-1',
          integration_type: 'stripe',
        })
      );
    });

    it('should create integration with integration_type field', async () => {
      const data = {
        venue_id: 'venue-1',
        integration_type: 'square',
        config: {},
      };
      mockDb._mockQueryBuilder.returning.mockResolvedValue([{ id: '123' }]);

      await integrationModel.create(data);

      expect(mockDb._mockQueryBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          integration_type: 'square',
        })
      );
    });

    it('should map config to config_data', async () => {
      const data = {
        venue_id: 'venue-1',
        type: 'stripe',
        config: { test: 'value' },
      };
      mockDb._mockQueryBuilder.returning.mockResolvedValue([{ id: '123' }]);

      await integrationModel.create(data);

      expect(mockDb._mockQueryBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          config_data: { test: 'value' },
        })
      );
    });

    it('should set default integration_name', async () => {
      const data = {
        venue_id: 'venue-1',
        type: 'stripe',
      };
      mockDb._mockQueryBuilder.returning.mockResolvedValue([{ id: '123' }]);

      await integrationModel.create(data);

      expect(mockDb._mockQueryBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          integration_name: 'stripe Integration',
        })
      );
    });

    it('should map encrypted_credentials', async () => {
      const data = {
        venue_id: 'venue-1',
        type: 'stripe',
        encrypted_credentials: {
          apiKey: 'encrypted-key',
          secretKey: 'encrypted-secret',
        },
      };
      mockDb._mockQueryBuilder.returning.mockResolvedValue([{ id: '123' }]);

      await integrationModel.create(data);

      expect(mockDb._mockQueryBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          api_key_encrypted: 'encrypted-key',
          api_secret_encrypted: 'encrypted-secret',
        })
      );
    });

    it('should set is_active to true by default', async () => {
      const data = {
        venue_id: 'venue-1',
        type: 'stripe',
      };
      mockDb._mockQueryBuilder.returning.mockResolvedValue([{ id: '123' }]);

      await integrationModel.create(data);

      expect(mockDb._mockQueryBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          is_active: true,
        })
      );
    });
  });

  // =============================================================================
  // update() - 4 test cases
  // =============================================================================

  describe('update()', () => {
    it('should map config to config_data', async () => {
      const updates = { config: { updated: true } };
      mockDb._mockQueryBuilder.returning.mockResolvedValue([{ id: '123' }]);

      await integrationModel.update('123', updates);

      expect(mockDb._mockQueryBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          config_data: { updated: true },
        })
      );
    });

    it('should map status to is_active', async () => {
      const updates = { status: 'active' };
      mockDb._mockQueryBuilder.returning.mockResolvedValue([{ id: '123' }]);

      await integrationModel.update('123', updates);

      expect(mockDb._mockQueryBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          is_active: true,
        })
      );
    });

    it('should set is_active to false when status is not active', async () => {
      const updates = { status: 'inactive' };
      mockDb._mockQueryBuilder.returning.mockResolvedValue([{ id: '123' }]);

      await integrationModel.update('123', updates);

      expect(mockDb._mockQueryBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          is_active: false,
        })
      );
    });

    it('should set updated_at timestamp', async () => {
      mockDb._mockQueryBuilder.returning.mockResolvedValue([{ id: '123' }]);

      await integrationModel.update('123', {});

      expect(mockDb._mockQueryBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          updated_at: expect.any(Date),
        })
      );
    });
  });

  // =============================================================================
  // delete() - 2 test cases
  // =============================================================================

  describe('delete()', () => {
    it('should soft delete by setting is_active to false', async () => {
      mockDb._mockQueryBuilder.update.mockResolvedValue(1);

      await integrationModel.delete('123');

      expect(mockDb._mockQueryBuilder.where).toHaveBeenCalledWith({ id: '123' });
      expect(mockDb._mockQueryBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          is_active: false,
        })
      );
    });

    it('should set updated_at on delete', async () => {
      mockDb._mockQueryBuilder.update.mockResolvedValue(1);

      await integrationModel.delete('123');

      expect(mockDb._mockQueryBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          updated_at: expect.any(Date),
        })
      );
    });
  });
});
