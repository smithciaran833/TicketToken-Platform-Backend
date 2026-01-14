import { BaseModel } from '../../../src/models/base.model';
import { Knex } from 'knex';

// Create a concrete implementation for testing
class TestModel extends BaseModel {
  constructor(db: Knex | Knex.Transaction) {
    super('test_table', db);
  }
}

describe('BaseModel', () => {
  let testModel: TestModel;
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock query builder with proper chaining
    const mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      whereNull: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      first: jest.fn(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      returning: jest.fn(),
      update: jest.fn().mockReturnThis(),
      count: jest.fn().mockReturnThis(),
    };

    // Mock offset to return the mock records
    const mockRecords = [
      { id: '1', name: 'Test 1' },
      { id: '2', name: 'Test 2' },
    ];
    mockQueryBuilder.offset.mockResolvedValue(mockRecords);

    mockDb = Object.assign(jest.fn().mockReturnValue(mockQueryBuilder), {
      _mockQueryBuilder: mockQueryBuilder,
    });

    testModel = new TestModel(mockDb);
  });

  // =============================================================================
  // constructor() - 2 test cases
  // =============================================================================

  describe('constructor()', () => {
    it('should set table name', () => {
      expect((testModel as any).tableName).toBe('test_table');
    });

    it('should set database connection', () => {
      expect((testModel as any).db).toBe(mockDb);
    });
  });

  // =============================================================================
  // withTransaction() - 2 test cases
  // =============================================================================

  describe('withTransaction()', () => {
    it('should create new instance with transaction', () => {
      const mockTrx = {} as Knex.Transaction;
      const newInstance = testModel.withTransaction(mockTrx);

      expect(newInstance).toBeInstanceOf(TestModel);
      expect((newInstance as any).db).toBe(mockTrx);
    });

    it('should preserve table name', () => {
      const mockTrx = {} as Knex.Transaction;
      const newInstance = testModel.withTransaction(mockTrx);

      expect((newInstance as any).tableName).toBe('test_table');
    });
  });

  // =============================================================================
  // findById() - 4 test cases
  // =============================================================================

  describe('findById()', () => {
    const mockRecord = { id: '123', name: 'Test', deleted_at: null };

    it('should find record by id', async () => {
      mockDb._mockQueryBuilder.first.mockResolvedValue(mockRecord);

      const result = await testModel.findById('123');

      expect(result).toEqual(mockRecord);
      expect(mockDb._mockQueryBuilder.where).toHaveBeenCalledWith({ id: '123' });
      expect(mockDb._mockQueryBuilder.whereNull).toHaveBeenCalledWith('deleted_at');
    });

    it('should select specific columns when provided', async () => {
      mockDb._mockQueryBuilder.first.mockResolvedValue(mockRecord);

      await testModel.findById('123', ['id', 'name']);

      expect(mockDb._mockQueryBuilder.select).toHaveBeenCalledWith(['id', 'name']);
    });

    it('should return null if not found', async () => {
      mockDb._mockQueryBuilder.first.mockResolvedValue(null);

      const result = await testModel.findById('non-existent');

      expect(result).toBeNull();
    });

    it('should exclude soft-deleted records', async () => {
      mockDb._mockQueryBuilder.first.mockResolvedValue(null);

      await testModel.findById('deleted-123');

      expect(mockDb._mockQueryBuilder.whereNull).toHaveBeenCalledWith('deleted_at');
    });
  });

  // =============================================================================
  // findAll() - 6 test cases
  // =============================================================================

  describe('findAll()', () => {
    const mockRecords = [
      { id: '1', name: 'Test 1' },
      { id: '2', name: 'Test 2' },
    ];

    it('should find all records with conditions', async () => {
      const result = await testModel.findAll({ status: 'active' });

      expect(result).toEqual(mockRecords);
      expect(mockDb._mockQueryBuilder.where).toHaveBeenCalledWith({ status: 'active' });
    });

    it('should use default pagination', async () => {
      await testModel.findAll();

      expect(mockDb._mockQueryBuilder.limit).toHaveBeenCalledWith(50);
      expect(mockDb._mockQueryBuilder.offset).toHaveBeenCalledWith(0);
    });

    it('should use custom pagination', async () => {
      await testModel.findAll({}, { limit: 20, offset: 10 });

      expect(mockDb._mockQueryBuilder.limit).toHaveBeenCalledWith(20);
      expect(mockDb._mockQueryBuilder.offset).toHaveBeenCalledWith(10);
    });

    it('should use default ordering', async () => {
      await testModel.findAll();

      expect(mockDb._mockQueryBuilder.orderBy).toHaveBeenCalledWith('created_at', 'desc');
    });

    it('should use custom ordering', async () => {
      await testModel.findAll({}, { orderBy: 'name', order: 'asc' });

      expect(mockDb._mockQueryBuilder.orderBy).toHaveBeenCalledWith('name', 'asc');
    });

    it('should select specific columns when provided', async () => {
      await testModel.findAll({}, { columns: ['id', 'name'] });

      expect(mockDb._mockQueryBuilder.select).toHaveBeenCalledWith(['id', 'name']);
    });
  });

  // =============================================================================
  // create() - 3 test cases
  // =============================================================================

  describe('create()', () => {
    const newData = { name: 'New Record', status: 'active' };
    const createdRecord = { id: '123', ...newData };

    it('should create new record', async () => {
      mockDb._mockQueryBuilder.returning.mockResolvedValue([createdRecord]);

      const result = await testModel.create(newData);

      expect(result).toEqual(createdRecord);
      expect(mockDb._mockQueryBuilder.insert).toHaveBeenCalledWith(newData);
    });

    it('should return created record with generated id', async () => {
      mockDb._mockQueryBuilder.returning.mockResolvedValue([createdRecord]);

      const result = await testModel.create(newData);

      expect(result.id).toBeDefined();
    });

    it('should handle creation errors', async () => {
      mockDb._mockQueryBuilder.returning.mockRejectedValue(new Error('DB error'));

      await expect(testModel.create(newData)).rejects.toThrow('DB error');
    });
  });

  // =============================================================================
  // update() - 4 test cases
  // =============================================================================

  describe('update()', () => {
    const updateData = { name: 'Updated Name' };
    const updatedRecord = { id: '123', name: 'Updated Name', updated_at: new Date() };

    it('should update record by id', async () => {
      mockDb._mockQueryBuilder.returning.mockResolvedValue([updatedRecord]);

      const result = await testModel.update('123', updateData);

      expect(result).toEqual(updatedRecord);
      expect(mockDb._mockQueryBuilder.where).toHaveBeenCalledWith({ id: '123' });
    });

    it('should set updated_at timestamp', async () => {
      mockDb._mockQueryBuilder.returning.mockResolvedValue([updatedRecord]);

      await testModel.update('123', updateData);

      expect(mockDb._mockQueryBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          ...updateData,
          updated_at: expect.any(Date),
        })
      );
    });

    it('should not update soft-deleted records', async () => {
      mockDb._mockQueryBuilder.returning.mockResolvedValue([]);

      await testModel.update('deleted-123', updateData);

      expect(mockDb._mockQueryBuilder.whereNull).toHaveBeenCalledWith('deleted_at');
    });

    it('should handle update errors', async () => {
      mockDb._mockQueryBuilder.returning.mockRejectedValue(new Error('Update failed'));

      await expect(testModel.update('123', updateData)).rejects.toThrow('Update failed');
    });
  });

  // =============================================================================
  // delete() - 2 test cases
  // =============================================================================

  describe('delete()', () => {
    it('should soft delete record', async () => {
      mockDb._mockQueryBuilder.update.mockResolvedValue(1);

      await testModel.delete('123');

      expect(mockDb._mockQueryBuilder.where).toHaveBeenCalledWith({ id: '123' });
      expect(mockDb._mockQueryBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          deleted_at: expect.any(Date),
        })
      );
    });

    it('should return affected rows count', async () => {
      mockDb._mockQueryBuilder.update.mockResolvedValue(1);

      const result = await testModel.delete('123');

      expect(result).toBe(1);
    });
  });

  // =============================================================================
  // count() - 3 test cases
  // =============================================================================

  describe('count()', () => {
    it('should count records with conditions', async () => {
      mockDb._mockQueryBuilder.first.mockResolvedValue({ count: '5' });

      const result = await testModel.count({ status: 'active' });

      expect(result).toBe(5);
      expect(mockDb._mockQueryBuilder.where).toHaveBeenCalledWith({ status: 'active' });
    });

    it('should return 0 when no records found', async () => {
      mockDb._mockQueryBuilder.first.mockResolvedValue({ count: '0' });

      const result = await testModel.count();

      expect(result).toBe(0);
    });

    it('should exclude soft-deleted records', async () => {
      mockDb._mockQueryBuilder.first.mockResolvedValue({ count: '3' });

      await testModel.count();

      expect(mockDb._mockQueryBuilder.whereNull).toHaveBeenCalledWith('deleted_at');
    });
  });

  // =============================================================================
  // softDelete() - 3 test cases
  // =============================================================================

  describe('softDelete()', () => {
    it('should soft delete record and return true', async () => {
      mockDb._mockQueryBuilder.update.mockResolvedValue(1);

      const result = await testModel.softDelete('123');

      expect(result).toBe(true);
      expect(mockDb._mockQueryBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          deleted_at: expect.any(Date),
        })
      );
    });

    it('should return false if record not found', async () => {
      mockDb._mockQueryBuilder.update.mockResolvedValue(0);

      const result = await testModel.softDelete('non-existent');

      expect(result).toBe(false);
    });

    it('should not delete already deleted records', async () => {
      mockDb._mockQueryBuilder.update.mockResolvedValue(0);

      const result = await testModel.softDelete('deleted-123');

      expect(result).toBe(false);
      expect(mockDb._mockQueryBuilder.whereNull).toHaveBeenCalledWith('deleted_at');
    });
  });

  // =============================================================================
  // generateId() - 3 test cases
  // =============================================================================

  describe('generateId()', () => {
    it('should generate id with table prefix', () => {
      const id = testModel.generateId();

      expect(id).toMatch(/^tes_\d+_[a-z0-9]+$/);
    });

    it('should generate unique ids', () => {
      const id1 = testModel.generateId();
      const id2 = testModel.generateId();

      expect(id1).not.toBe(id2);
    });

    it('should use first 3 characters of table name', () => {
      const id = testModel.generateId();

      expect(id.startsWith('tes_')).toBe(true);
    });
  });
});
