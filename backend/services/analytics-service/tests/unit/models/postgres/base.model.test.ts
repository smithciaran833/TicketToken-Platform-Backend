/**
 * Base Model Unit Tests
 */

const mockFirst = jest.fn();
const mockLimit = jest.fn().mockReturnThis();
const mockOffset = jest.fn();
const mockOrderBy = jest.fn().mockReturnThis();
const mockWhere = jest.fn().mockReturnThis();
const mockInsert = jest.fn().mockReturnThis();
const mockUpdate = jest.fn().mockReturnThis();
const mockDelete = jest.fn();
const mockReturning = jest.fn();
const mockCount = jest.fn().mockReturnThis();

const mockDb = jest.fn(() => ({
  where: mockWhere,
  first: mockFirst,
  limit: mockLimit,
  offset: mockOffset,
  orderBy: mockOrderBy,
  insert: mockInsert,
  update: mockUpdate,
  delete: mockDelete,
  returning: mockReturning,
  count: mockCount,
}));

jest.mock('../../../../src/config/database', () => ({
  getDb: () => mockDb,
}));

import { BaseModel, BaseEntity } from '../../../../src/models/postgres/base.model';

// Concrete implementation for testing
interface TestEntity extends BaseEntity {
  name: string;
}

class TestModel extends BaseModel<TestEntity> {
  protected tableName = 'test_table';
}

describe('BaseModel', () => {
  let model: TestModel;

  beforeEach(() => {
    jest.clearAllMocks();
    model = new TestModel();

    // Reset chain methods
    mockWhere.mockReturnThis();
    mockOrderBy.mockReturnThis();
    mockLimit.mockReturnThis();
    mockInsert.mockReturnThis();
    mockUpdate.mockReturnThis();
    mockCount.mockReturnThis();
  });

  describe('findById', () => {
    it('should find entity by id and tenant', async () => {
      const entity = { id: 'entity-1', tenant_id: 'tenant-1', name: 'Test' };
      mockFirst.mockResolvedValue(entity);

      const result = await model.findById('entity-1', 'tenant-1');

      expect(result).toEqual(entity);
      expect(mockDb).toHaveBeenCalledWith('test_table');
      expect(mockWhere).toHaveBeenCalledWith({ id: 'entity-1', tenant_id: 'tenant-1' });
      expect(mockFirst).toHaveBeenCalled();
    });

    it('should return null if entity not found', async () => {
      mockFirst.mockResolvedValue(undefined);

      const result = await model.findById('non-existent', 'tenant-1');

      expect(result).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should find all entities for tenant', async () => {
      const entities = [
        { id: 'e1', tenant_id: 'tenant-1', name: 'Entity 1' },
        { id: 'e2', tenant_id: 'tenant-1', name: 'Entity 2' },
      ];
      // When no limit/offset, orderBy is terminal - make it resolve to data
      mockOrderBy.mockResolvedValue(entities);

      const result = await model.findAll('tenant-1');

      expect(result).toEqual(entities);
      expect(mockWhere).toHaveBeenCalledWith({ tenant_id: 'tenant-1' });
      expect(mockOrderBy).toHaveBeenCalledWith('created_at', 'desc');
    });

    it('should apply limit option', async () => {
      mockLimit.mockResolvedValue([]);

      await model.findAll('tenant-1', { limit: 10 });

      expect(mockLimit).toHaveBeenCalledWith(10);
    });

    it('should apply offset option', async () => {
      mockOffset.mockResolvedValue([]);

      await model.findAll('tenant-1', { offset: 20 });

      expect(mockOffset).toHaveBeenCalledWith(20);
    });

    it('should apply both limit and offset', async () => {
      mockOffset.mockResolvedValue([]);

      await model.findAll('tenant-1', { limit: 10, offset: 20 });

      expect(mockLimit).toHaveBeenCalledWith(10);
      expect(mockOffset).toHaveBeenCalledWith(20);
    });
  });

  describe('create', () => {
    it('should create entity and return it', async () => {
      const newEntity = { tenant_id: 'tenant-1', name: 'New Entity' };
      const createdEntity = { id: 'new-id', ...newEntity, created_at: new Date(), updated_at: new Date() };
      mockReturning.mockResolvedValue([createdEntity]);

      const result = await model.create(newEntity as any);

      expect(result).toEqual(createdEntity);
      expect(mockInsert).toHaveBeenCalledWith(newEntity);
      expect(mockReturning).toHaveBeenCalledWith('*');
    });
  });

  describe('update', () => {
    it('should update entity and return updated record', async () => {
      const updates = { name: 'Updated Name' };
      const updatedEntity = { id: 'entity-1', tenant_id: 'tenant-1', name: 'Updated Name' };
      mockReturning.mockResolvedValue([updatedEntity]);

      const result = await model.update('entity-1', 'tenant-1', updates);

      expect(result).toEqual(updatedEntity);
      expect(mockWhere).toHaveBeenCalledWith({ id: 'entity-1', tenant_id: 'tenant-1' });
      expect(mockUpdate).toHaveBeenCalledWith(updates);
      expect(mockReturning).toHaveBeenCalledWith('*');
    });

    it('should return null if entity not found', async () => {
      mockReturning.mockResolvedValue([]);

      const result = await model.update('non-existent', 'tenant-1', { name: 'Test' });

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete entity and return true', async () => {
      mockDelete.mockResolvedValue(1);

      const result = await model.delete('entity-1', 'tenant-1');

      expect(result).toBe(true);
      expect(mockWhere).toHaveBeenCalledWith({ id: 'entity-1', tenant_id: 'tenant-1' });
      expect(mockDelete).toHaveBeenCalled();
    });

    it('should return false if entity not found', async () => {
      mockDelete.mockResolvedValue(0);

      const result = await model.delete('non-existent', 'tenant-1');

      expect(result).toBe(false);
    });
  });

  describe('count', () => {
    it('should count entities for tenant', async () => {
      mockFirst.mockResolvedValue({ count: '42' });

      const result = await model.count('tenant-1');

      expect(result).toBe(42);
      expect(mockWhere).toHaveBeenCalledWith({ tenant_id: 'tenant-1' });
      expect(mockCount).toHaveBeenCalledWith('* as count');
    });

    it('should apply additional conditions', async () => {
      mockFirst.mockResolvedValue({ count: '10' });

      const result = await model.count('tenant-1', { name: 'Test' } as any);

      expect(result).toBe(10);
      expect(mockWhere).toHaveBeenCalledWith({ tenant_id: 'tenant-1', name: 'Test' });
    });

    it('should return 0 if no results', async () => {
      mockFirst.mockResolvedValue(undefined);

      const result = await model.count('tenant-1');

      expect(result).toBe(0);
    });

    it('should handle null count', async () => {
      mockFirst.mockResolvedValue({ count: null });

      const result = await model.count('tenant-1');

      expect(result).toBe(0);
    });
  });
});
