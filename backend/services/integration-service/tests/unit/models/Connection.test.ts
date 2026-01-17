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

import { ConnectionModel, IConnection } from '../../../src/models/Connection';

describe('ConnectionModel', () => {
  let model: ConnectionModel;

  beforeEach(() => {
    jest.clearAllMocks();
    mockWhere.mockReturnValue(mockQueryBuilder);
    model = new ConnectionModel();
  });

  describe('constructor', () => {
    it('should use default db when no db provided', () => {
      const instance = new ConnectionModel();
      expect(instance).toBeInstanceOf(ConnectionModel);
    });

    it('should use provided db when passed', () => {
      const customDb = jest.fn() as any;
      const instance = new ConnectionModel(customDb);
      expect(instance).toBeInstanceOf(ConnectionModel);
    });
  });

  describe('create', () => {
    it('should insert connection and return created record', async () => {
      const connectionData: IConnection = {
        integration_id: 'int-123',
        external_id: 'ext-456',
        status: 'connected',
      };

      const createdConnection = {
        id: 'conn-789',
        ...connectionData,
        created_at: new Date(),
      };

      mockReturning.mockResolvedValue([createdConnection]);

      const result = await model.create(connectionData);

      expect(mockDb).toHaveBeenCalledWith('connections');
      expect(mockInsert).toHaveBeenCalledWith(connectionData);
      expect(mockReturning).toHaveBeenCalledWith('*');
      expect(result).toEqual(createdConnection);
    });

    it('should insert connection with metadata', async () => {
      const connectionData: IConnection = {
        integration_id: 'int-123',
        external_id: 'ext-456',
        status: 'connected',
        metadata: { provider: 'stripe', version: '2.0' },
      };

      mockReturning.mockResolvedValue([{ id: 'conn-1', ...connectionData }]);

      await model.create(connectionData);

      expect(mockInsert).toHaveBeenCalledWith(connectionData);
    });

    it('should handle disconnected status', async () => {
      const connectionData: IConnection = {
        integration_id: 'int-123',
        external_id: 'ext-456',
        status: 'disconnected',
      };

      mockReturning.mockResolvedValue([{ id: 'conn-1', ...connectionData }]);

      const result = await model.create(connectionData);

      expect(result.status).toBe('disconnected');
    });

    it('should handle error status', async () => {
      const connectionData: IConnection = {
        integration_id: 'int-123',
        external_id: 'ext-456',
        status: 'error',
      };

      mockReturning.mockResolvedValue([{ id: 'conn-1', ...connectionData }]);

      const result = await model.create(connectionData);

      expect(result.status).toBe('error');
    });
  });

  describe('findById', () => {
    it('should return connection when found', async () => {
      const connection: IConnection = {
        id: 'conn-123',
        integration_id: 'int-456',
        external_id: 'ext-789',
        status: 'connected',
      };

      mockFirst.mockResolvedValue(connection);

      const result = await model.findById('conn-123');

      expect(mockDb).toHaveBeenCalledWith('connections');
      expect(mockWhere).toHaveBeenCalledWith({ id: 'conn-123' });
      expect(mockFirst).toHaveBeenCalled();
      expect(result).toEqual(connection);
    });

    it('should return null when connection not found', async () => {
      mockFirst.mockResolvedValue(undefined);

      const result = await model.findById('non-existent');

      expect(mockWhere).toHaveBeenCalledWith({ id: 'non-existent' });
      expect(result).toBeNull();
    });

    it('should return null when first returns null', async () => {
      mockFirst.mockResolvedValue(null);

      const result = await model.findById('conn-123');

      expect(result).toBeNull();
    });
  });

  describe('findByIntegrationId', () => {
    it('should return all connections for integration', async () => {
      const connections: IConnection[] = [
        {
          id: 'conn-1',
          integration_id: 'int-123',
          external_id: 'ext-1',
          status: 'connected',
        },
        {
          id: 'conn-2',
          integration_id: 'int-123',
          external_id: 'ext-2',
          status: 'connected',
        },
      ];

      mockWhere.mockResolvedValue(connections);

      const result = await model.findByIntegrationId('int-123');

      expect(mockDb).toHaveBeenCalledWith('connections');
      expect(mockWhere).toHaveBeenCalledWith({ integration_id: 'int-123' });
      expect(result).toEqual(connections);
    });

    it('should return empty array when no connections found', async () => {
      mockWhere.mockResolvedValue([]);

      const result = await model.findByIntegrationId('int-456');

      expect(result).toEqual([]);
    });

    it('should handle connections with different statuses', async () => {
      const connections: IConnection[] = [
        {
          id: 'conn-1',
          integration_id: 'int-123',
          external_id: 'ext-1',
          status: 'connected',
        },
        {
          id: 'conn-2',
          integration_id: 'int-123',
          external_id: 'ext-2',
          status: 'error',
        },
      ];

      mockWhere.mockResolvedValue(connections);

      const result = await model.findByIntegrationId('int-123');

      expect(result).toHaveLength(2);
      expect(result[0].status).toBe('connected');
      expect(result[1].status).toBe('error');
    });
  });

  describe('update', () => {
    beforeEach(() => {
      // Reset where to return query builder for update tests
      mockWhere.mockReturnValue(mockQueryBuilder);
    });

    it('should update connection and return updated record', async () => {
      const updateData: Partial<IConnection> = {
        status: 'disconnected',
        metadata: { reason: 'user disconnected' },
      };

      const updatedConnection = {
        id: 'conn-123',
        integration_id: 'int-456',
        external_id: 'ext-789',
        status: 'disconnected',
        metadata: { reason: 'user disconnected' },
        updated_at: expect.any(Date),
      };

      mockReturning.mockResolvedValue([updatedConnection]);

      const result = await model.update('conn-123', updateData);

      expect(mockDb).toHaveBeenCalledWith('connections');
      expect(mockWhere).toHaveBeenCalledWith({ id: 'conn-123' });
      expect(mockUpdate).toHaveBeenCalledWith({
        ...updateData,
        updated_at: expect.any(Date),
      });
      expect(mockReturning).toHaveBeenCalledWith('*');
      expect(result).toEqual(updatedConnection);
    });

    it('should return null when connection not found', async () => {
      mockReturning.mockResolvedValue([]);

      const result = await model.update('non-existent', { status: 'error' });

      expect(result).toBeNull();
    });

    it('should automatically set updated_at', async () => {
      mockReturning.mockResolvedValue([{ id: 'conn-123', status: 'error' }]);

      await model.update('conn-123', { status: 'error' });

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          updated_at: expect.any(Date),
        })
      );
    });

    it('should update last_activity', async () => {
      const lastActivity = new Date();
      mockReturning.mockResolvedValue([{ id: 'conn-123', last_activity: lastActivity }]);

      await model.update('conn-123', { last_activity: lastActivity });

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          last_activity: lastActivity,
        })
      );
    });

    it('should handle partial updates', async () => {
      mockReturning.mockResolvedValue([{ id: 'conn-123', status: 'connected' }]);

      await model.update('conn-123', { status: 'connected' });

      expect(mockUpdate).toHaveBeenCalledWith({
        status: 'connected',
        updated_at: expect.any(Date),
      });
    });
  });

  describe('delete', () => {
    beforeEach(() => {
      // Reset where to return query builder for delete tests
      mockWhere.mockReturnValue(mockQueryBuilder);
    });

    it('should return true when connection deleted', async () => {
      mockDel.mockResolvedValue(1);

      const result = await model.delete('conn-123');

      expect(mockDb).toHaveBeenCalledWith('connections');
      expect(mockWhere).toHaveBeenCalledWith({ id: 'conn-123' });
      expect(mockDel).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when connection not found', async () => {
      mockDel.mockResolvedValue(0);

      const result = await model.delete('non-existent');

      expect(result).toBe(false);
    });

    it('should return true when multiple rows deleted', async () => {
      mockDel.mockResolvedValue(3);

      const result = await model.delete('conn-123');

      expect(result).toBe(true);
    });
  });
});
