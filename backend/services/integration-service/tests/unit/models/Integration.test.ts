// Mock database config BEFORE imports
const mockReturning = jest.fn();
const mockUpdate = jest.fn(() => ({ returning: mockReturning }));
const mockDel = jest.fn();
const mockFirst = jest.fn();
const mockWhere = jest.fn();
const mockInsert = jest.fn(() => ({ returning: mockReturning }));

// The query builder object that gets returned from db('tableName')
const mockQueryBuilder = {
  insert: mockInsert,
  where: mockWhere,
  first: mockFirst,
  update: mockUpdate,
  del: mockDel,
};

// Make where() return the same query builder for chaining
mockWhere.mockReturnValue(mockQueryBuilder);

const mockDb = jest.fn(() => mockQueryBuilder);

jest.mock('../../../src/config/database', () => ({
  db: mockDb,
}));

import { IntegrationModel, IIntegration } from '../../../src/models/Integration';

describe('IntegrationModel', () => {
  let model: IntegrationModel;

  beforeEach(() => {
    jest.clearAllMocks();
    mockWhere.mockReturnValue(mockQueryBuilder);
    model = new IntegrationModel();
  });

  describe('constructor', () => {
    it('should use default db when no db provided', () => {
      const instance = new IntegrationModel();
      expect(instance).toBeInstanceOf(IntegrationModel);
    });

    it('should use provided db when passed', () => {
      const customDb = jest.fn() as any;
      const instance = new IntegrationModel(customDb);
      expect(instance).toBeInstanceOf(IntegrationModel);
    });
  });

  describe('create', () => {
    it('should insert integration and return created record', async () => {
      const integrationData: IIntegration = {
        name: 'Stripe Payment',
        provider: 'stripe',
        status: 'active',
      };

      const createdIntegration = {
        id: 'int-123',
        ...integrationData,
        created_at: new Date(),
      };

      mockReturning.mockResolvedValue([createdIntegration]);

      const result = await model.create(integrationData);

      expect(mockDb).toHaveBeenCalledWith('integrations');
      expect(mockInsert).toHaveBeenCalledWith(integrationData);
      expect(mockReturning).toHaveBeenCalledWith('*');
      expect(result).toEqual(createdIntegration);
    });

    it('should insert integration with config', async () => {
      const integrationData: IIntegration = {
        name: 'Stripe',
        provider: 'stripe',
        status: 'active',
        config: { webhookUrl: 'https://example.com/webhook' },
      };

      mockReturning.mockResolvedValue([{ id: 'int-1', ...integrationData }]);

      await model.create(integrationData);

      expect(mockInsert).toHaveBeenCalledWith(integrationData);
    });

    it('should insert integration with credentials', async () => {
      const integrationData: IIntegration = {
        name: 'Stripe',
        provider: 'stripe',
        status: 'active',
        credentials: { apiKey: 'sk_test_123' },
      };

      mockReturning.mockResolvedValue([{ id: 'int-1', ...integrationData }]);

      await model.create(integrationData);

      expect(mockInsert).toHaveBeenCalledWith(integrationData);
    });

    it('should handle inactive status', async () => {
      const integrationData: IIntegration = {
        name: 'Old Integration',
        provider: 'legacy',
        status: 'inactive',
      };

      mockReturning.mockResolvedValue([{ id: 'int-1', ...integrationData }]);

      const result = await model.create(integrationData);

      expect(result.status).toBe('inactive');
    });

    it('should handle error status', async () => {
      const integrationData: IIntegration = {
        name: 'Failed Integration',
        provider: 'test',
        status: 'error',
      };

      mockReturning.mockResolvedValue([{ id: 'int-1', ...integrationData }]);

      const result = await model.create(integrationData);

      expect(result.status).toBe('error');
    });
  });

  describe('findById', () => {
    it('should return integration when found', async () => {
      const integration: IIntegration = {
        id: 'int-123',
        name: 'Stripe',
        provider: 'stripe',
        status: 'active',
      };

      mockFirst.mockResolvedValue(integration);

      const result = await model.findById('int-123');

      expect(mockDb).toHaveBeenCalledWith('integrations');
      expect(mockWhere).toHaveBeenCalledWith({ id: 'int-123' });
      expect(mockFirst).toHaveBeenCalled();
      expect(result).toEqual(integration);
    });

    it('should return null when integration not found', async () => {
      mockFirst.mockResolvedValue(undefined);

      const result = await model.findById('non-existent');

      expect(mockWhere).toHaveBeenCalledWith({ id: 'non-existent' });
      expect(result).toBeNull();
    });

    it('should return null when first returns null', async () => {
      mockFirst.mockResolvedValue(null);

      const result = await model.findById('int-123');

      expect(result).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should return all integrations when no filters provided', async () => {
      const integrations: IIntegration[] = [
        {
          id: 'int-1',
          name: 'Stripe',
          provider: 'stripe',
          status: 'active',
        },
        {
          id: 'int-2',
          name: 'Square',
          provider: 'square',
          status: 'active',
        },
      ];

      mockWhere.mockResolvedValue(integrations);

      const result = await model.findAll();

      expect(mockDb).toHaveBeenCalledWith('integrations');
      expect(mockWhere).toHaveBeenCalledWith({});
      expect(result).toEqual(integrations);
    });

    it('should filter by status', async () => {
      const activeIntegrations: IIntegration[] = [
        {
          id: 'int-1',
          name: 'Stripe',
          provider: 'stripe',
          status: 'active',
        },
      ];

      mockWhere.mockResolvedValue(activeIntegrations);

      const result = await model.findAll({ status: 'active' });

      expect(mockWhere).toHaveBeenCalledWith({ status: 'active' });
      expect(result).toEqual(activeIntegrations);
    });

    it('should filter by provider', async () => {
      const stripeIntegrations: IIntegration[] = [
        {
          id: 'int-1',
          name: 'Stripe Payment',
          provider: 'stripe',
          status: 'active',
        },
      ];

      mockWhere.mockResolvedValue(stripeIntegrations);

      const result = await model.findAll({ provider: 'stripe' });

      expect(mockWhere).toHaveBeenCalledWith({ provider: 'stripe' });
      expect(result).toEqual(stripeIntegrations);
    });

    it('should filter by multiple criteria', async () => {
      mockWhere.mockResolvedValue([]);

      await model.findAll({ status: 'active', provider: 'stripe' });

      expect(mockWhere).toHaveBeenCalledWith({
        status: 'active',
        provider: 'stripe',
      });
    });

    it('should return empty array when no integrations match', async () => {
      mockWhere.mockResolvedValue([]);

      const result = await model.findAll({ status: 'inactive' });

      expect(result).toEqual([]);
    });
  });

  describe('update', () => {
    beforeEach(() => {
      // Reset where to return query builder for update tests
      mockWhere.mockReturnValue(mockQueryBuilder);
    });

    it('should update integration and return updated record', async () => {
      const updateData: Partial<IIntegration> = {
        status: 'inactive',
        config: { enabled: false },
      };

      const updatedIntegration = {
        id: 'int-123',
        name: 'Stripe',
        provider: 'stripe',
        status: 'inactive',
        config: { enabled: false },
        updated_at: expect.any(Date),
      };

      mockReturning.mockResolvedValue([updatedIntegration]);

      const result = await model.update('int-123', updateData);

      expect(mockDb).toHaveBeenCalledWith('integrations');
      expect(mockWhere).toHaveBeenCalledWith({ id: 'int-123' });
      expect(mockUpdate).toHaveBeenCalledWith({
        ...updateData,
        updated_at: expect.any(Date),
      });
      expect(mockReturning).toHaveBeenCalledWith('*');
      expect(result).toEqual(updatedIntegration);
    });

    it('should return null when integration not found', async () => {
      mockReturning.mockResolvedValue([]);

      const result = await model.update('non-existent', { status: 'error' });

      expect(result).toBeNull();
    });

    it('should automatically set updated_at', async () => {
      mockReturning.mockResolvedValue([{ id: 'int-123', status: 'active' }]);

      await model.update('int-123', { status: 'active' });

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          updated_at: expect.any(Date),
        })
      );
    });

    it('should update last_sync', async () => {
      const lastSync = new Date();
      mockReturning.mockResolvedValue([{ id: 'int-123', last_sync: lastSync }]);

      await model.update('int-123', { last_sync: lastSync });

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          last_sync: lastSync,
        })
      );
    });

    it('should handle credential updates', async () => {
      const credentials = { apiKey: 'sk_new_key' };
      mockReturning.mockResolvedValue([{ id: 'int-123', credentials }]);

      await model.update('int-123', { credentials });

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          credentials,
        })
      );
    });

    it('should handle config updates', async () => {
      const config = { webhookUrl: 'https://new.example.com' };
      mockReturning.mockResolvedValue([{ id: 'int-123', config }]);

      await model.update('int-123', { config });

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          config,
        })
      );
    });
  });

  describe('delete', () => {
    beforeEach(() => {
      // Reset where to return query builder for delete tests
      mockWhere.mockReturnValue(mockQueryBuilder);
    });

    it('should return true when integration deleted', async () => {
      mockDel.mockResolvedValue(1);

      const result = await model.delete('int-123');

      expect(mockDb).toHaveBeenCalledWith('integrations');
      expect(mockWhere).toHaveBeenCalledWith({ id: 'int-123' });
      expect(mockDel).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when integration not found', async () => {
      mockDel.mockResolvedValue(0);

      const result = await model.delete('non-existent');

      expect(result).toBe(false);
    });

    it('should return true when multiple rows deleted', async () => {
      mockDel.mockResolvedValue(2);

      const result = await model.delete('int-123');

      expect(result).toBe(true);
    });
  });
});
