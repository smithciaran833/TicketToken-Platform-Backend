/**
 * Unit tests for BaseModel
 * Tests the generic data access layer with CRUD operations
 */

import { BaseModel } from '../../../src/models/base.model';
import { createKnexMock, configureMockReturn, configureMockArray, configureMockError } from '../../__mocks__/knex.mock';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

describe('BaseModel', () => {
  let mockDb: any;
  let model: BaseModel;

  beforeEach(() => {
    mockDb = createKnexMock();
    model = new BaseModel('test_table', mockDb);
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with table name and db connection', () => {
      expect(model).toBeInstanceOf(BaseModel);
      expect((model as any).tableName).toBe('test_table');
      expect((model as any).db).toBe(mockDb);
    });

    it('should initialize selectColumns as null by default', () => {
      expect((model as any).selectColumns).toBeNull();
    });
  });

  describe('getSelectColumns', () => {
    it('should return "*" when selectColumns is null', () => {
      const result = (model as any).getSelectColumns();
      expect(result).toBe('*');
    });

    it('should return "*" when selectColumns is empty array', () => {
      (model as any).selectColumns = [];
      const result = (model as any).getSelectColumns();
      expect(result).toBe('*');
    });

    it('should return selectColumns when defined', () => {
      (model as any).selectColumns = ['id', 'name', 'created_at'];
      const result = (model as any).getSelectColumns();
      expect(result).toEqual(['id', 'name', 'created_at']);
    });
  });

  describe('findAll', () => {
    const mockRecords = [
      { id: '1', name: 'Record 1', deleted_at: null },
      { id: '2', name: 'Record 2', deleted_at: null },
    ];

    it('should find all records with conditions', async () => {
      configureMockArray(mockDb, mockRecords);

      const result = await model.findAll({ tenant_id: 'tenant-1' });

      expect(mockDb).toHaveBeenCalledWith('test_table');
      expect(mockDb._mockChain.where).toHaveBeenCalledWith({ tenant_id: 'tenant-1' });
      expect(mockDb._mockChain.whereNull).toHaveBeenCalledWith('deleted_at');
      expect(result).toEqual(mockRecords);
    });

    it('should find all records without conditions', async () => {
      configureMockArray(mockDb, mockRecords);

      const result = await model.findAll();

      expect(mockDb).toHaveBeenCalledWith('test_table');
      expect(mockDb._mockChain.where).toHaveBeenCalledWith({});
      expect(result).toEqual(mockRecords);
    });

    it('should apply limit option', async () => {
      configureMockArray(mockDb, mockRecords);

      await model.findAll({}, { limit: 10 });

      expect(mockDb._mockChain.limit).toHaveBeenCalledWith(10);
    });

    it('should apply offset option', async () => {
      configureMockArray(mockDb, mockRecords);

      await model.findAll({}, { offset: 20 });

      expect(mockDb._mockChain.offset).toHaveBeenCalledWith(20);
    });

    it('should apply both limit and offset options', async () => {
      configureMockArray(mockDb, mockRecords);

      await model.findAll({}, { limit: 10, offset: 20 });

      expect(mockDb._mockChain.limit).toHaveBeenCalledWith(10);
      expect(mockDb._mockChain.offset).toHaveBeenCalledWith(20);
    });

    it('should include deleted records when includeDeleted option is true', async () => {
      configureMockArray(mockDb, mockRecords);

      await model.findAll({}, { includeDeleted: true });

      expect(mockDb._mockChain.whereNull).not.toHaveBeenCalled();
    });

    it('should use custom columns when provided', async () => {
      configureMockArray(mockDb, mockRecords);

      await model.findAll({}, { columns: ['id', 'name'] });

      expect(mockDb._mockChain.select).toHaveBeenCalledWith(['id', 'name']);
    });

    it('should throw error on database failure', async () => {
      const dbError = new Error('Database connection failed');
      configureMockError(mockDb, dbError);

      await expect(model.findAll()).rejects.toThrow('Database connection failed');
    });
  });

  describe('findOne', () => {
    const mockRecord = { id: '1', name: 'Test Record', deleted_at: null };

    it('should find one record by conditions', async () => {
      configureMockReturn(mockDb, mockRecord);

      const result = await model.findOne({ id: '1' });

      expect(mockDb).toHaveBeenCalledWith('test_table');
      expect(mockDb._mockChain.where).toHaveBeenCalledWith({ id: '1' });
      expect(mockDb._mockChain.whereNull).toHaveBeenCalledWith('deleted_at');
      expect(mockDb._mockChain.first).toHaveBeenCalled();
      expect(result).toEqual(mockRecord);
    });

    it('should return null when record not found', async () => {
      configureMockReturn(mockDb, null);

      const result = await model.findOne({ id: 'non-existent' });

      expect(result).toBeNull();
    });

    it('should return null when first() returns undefined', async () => {
      mockDb._mockChain.first.mockResolvedValue(undefined);

      const result = await model.findOne({ id: '1' });

      expect(result).toBeNull();
    });

    it('should throw error on database failure', async () => {
      const dbError = new Error('Query failed');
      configureMockError(mockDb, dbError);

      await expect(model.findOne({ id: '1' })).rejects.toThrow('Query failed');
    });
  });

  describe('findById', () => {
    const mockRecord = { id: '123', name: 'Test Record', deleted_at: null };

    it('should find record by ID', async () => {
      configureMockReturn(mockDb, mockRecord);

      const result = await model.findById('123');

      expect(mockDb).toHaveBeenCalledWith('test_table');
      expect(mockDb._mockChain.where).toHaveBeenCalledWith({ id: '123' });
      expect(mockDb._mockChain.whereNull).toHaveBeenCalledWith('deleted_at');
      expect(mockDb._mockChain.first).toHaveBeenCalled();
      expect(result).toEqual(mockRecord);
    });

    it('should return null when ID not found', async () => {
      configureMockReturn(mockDb, null);

      const result = await model.findById('non-existent');

      expect(result).toBeNull();
    });

    it('should throw error on database failure', async () => {
      const dbError = new Error('Connection timeout');
      configureMockError(mockDb, dbError);

      await expect(model.findById('123')).rejects.toThrow('Connection timeout');
    });
  });

  describe('create', () => {
    const mockData = { name: 'New Record', tenant_id: 'tenant-1' };
    const mockCreated = { id: '123', ...mockData, created_at: new Date() };

    it('should create a new record', async () => {
      mockDb._mockChain.returning.mockResolvedValue([mockCreated]);

      const result = await model.create(mockData);

      expect(mockDb).toHaveBeenCalledWith('test_table');
      expect(mockDb._mockChain.insert).toHaveBeenCalledWith(mockData);
      expect(mockDb._mockChain.returning).toHaveBeenCalledWith('*');
      expect(result).toEqual(mockCreated);
    });

    it('should handle empty data', async () => {
      const emptyCreated = { id: '123', created_at: new Date() };
      mockDb._mockChain.returning.mockResolvedValue([emptyCreated]);

      const result = await model.create({});

      expect(mockDb._mockChain.insert).toHaveBeenCalledWith({});
      expect(result).toEqual(emptyCreated);
    });

    it('should throw error on database failure', async () => {
      const dbError = new Error('Duplicate key violation');
      mockDb._mockChain.returning.mockRejectedValue(dbError);

      await expect(model.create(mockData)).rejects.toThrow('Duplicate key violation');
    });
  });

  describe('update', () => {
    const mockUpdated = { id: '123', name: 'Updated Record', updated_at: new Date() };

    it('should update a record by ID', async () => {
      mockDb._mockChain.returning.mockResolvedValue([mockUpdated]);

      const result = await model.update('123', { name: 'Updated Record' });

      expect(mockDb).toHaveBeenCalledWith('test_table');
      expect(mockDb._mockChain.where).toHaveBeenCalledWith({ id: '123' });
      expect(mockDb._mockChain.whereNull).toHaveBeenCalledWith('deleted_at');
      expect(mockDb._mockChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Updated Record',
          updated_at: expect.any(Date),
        })
      );
      expect(mockDb._mockChain.returning).toHaveBeenCalledWith('*');
      expect(result).toEqual(mockUpdated);
    });

    it('should return null when record not found', async () => {
      mockDb._mockChain.returning.mockResolvedValue([]);

      const result = await model.update('non-existent', { name: 'Test' });

      expect(result).toBeNull();
    });

    it('should automatically set updated_at timestamp', async () => {
      mockDb._mockChain.returning.mockResolvedValue([mockUpdated]);
      const beforeUpdate = new Date();

      await model.update('123', { name: 'Test' });

      const updateCall = mockDb._mockChain.update.mock.calls[0][0];
      expect(updateCall.updated_at).toBeInstanceOf(Date);
      expect(updateCall.updated_at.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
    });

    it('should throw error on database failure', async () => {
      const dbError = new Error('Update failed');
      mockDb._mockChain.returning.mockRejectedValue(dbError);

      await expect(model.update('123', { name: 'Test' })).rejects.toThrow('Update failed');
    });
  });

  describe('delete (soft delete)', () => {
    it('should soft delete a record by ID', async () => {
      mockDb._mockChain.update.mockResolvedValue(1);

      const result = await model.delete('123');

      expect(mockDb).toHaveBeenCalledWith('test_table');
      expect(mockDb._mockChain.where).toHaveBeenCalledWith({ id: '123' });
      expect(mockDb._mockChain.whereNull).toHaveBeenCalledWith('deleted_at');
      expect(mockDb._mockChain.update).toHaveBeenCalledWith({
        deleted_at: expect.any(Date),
      });
      expect(result).toBe(true);
    });

    it('should return false when record not found', async () => {
      mockDb._mockChain.update.mockResolvedValue(0);

      const result = await model.delete('non-existent');

      expect(result).toBe(false);
    });

    it('should set deleted_at timestamp', async () => {
      mockDb._mockChain.update.mockResolvedValue(1);
      const beforeDelete = new Date();

      await model.delete('123');

      const updateCall = mockDb._mockChain.update.mock.calls[0][0];
      expect(updateCall.deleted_at).toBeInstanceOf(Date);
      expect(updateCall.deleted_at.getTime()).toBeGreaterThanOrEqual(beforeDelete.getTime());
    });

    it('should throw error on database failure', async () => {
      const dbError = new Error('Delete failed');
      mockDb._mockChain.update.mockRejectedValue(dbError);

      await expect(model.delete('123')).rejects.toThrow('Delete failed');
    });
  });

  describe('hardDelete', () => {
    it('should permanently delete a record by ID', async () => {
      mockDb._mockChain.delete.mockResolvedValue(1);

      const result = await model.hardDelete('123');

      expect(mockDb).toHaveBeenCalledWith('test_table');
      expect(mockDb._mockChain.where).toHaveBeenCalledWith({ id: '123' });
      expect(mockDb._mockChain.delete).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when record not found', async () => {
      mockDb._mockChain.delete.mockResolvedValue(0);

      const result = await model.hardDelete('non-existent');

      expect(result).toBe(false);
    });

    it('should throw error on database failure', async () => {
      const dbError = new Error('Foreign key constraint');
      mockDb._mockChain.delete.mockRejectedValue(dbError);

      await expect(model.hardDelete('123')).rejects.toThrow('Foreign key constraint');
    });
  });

  describe('count', () => {
    it('should count records with conditions', async () => {
      mockDb._mockChain.first.mockResolvedValue({ count: '42' });

      const result = await model.count({ tenant_id: 'tenant-1' });

      expect(mockDb).toHaveBeenCalledWith('test_table');
      expect(mockDb._mockChain.where).toHaveBeenCalledWith({ tenant_id: 'tenant-1' });
      expect(mockDb._mockChain.whereNull).toHaveBeenCalledWith('deleted_at');
      expect(mockDb._mockChain.count).toHaveBeenCalledWith('* as count');
      expect(result).toBe(42);
    });

    it('should count all records without conditions', async () => {
      mockDb._mockChain.first.mockResolvedValue({ count: '100' });

      const result = await model.count();

      expect(mockDb._mockChain.where).toHaveBeenCalledWith({});
      expect(result).toBe(100);
    });

    it('should return 0 when no records found', async () => {
      mockDb._mockChain.first.mockResolvedValue({ count: '0' });

      const result = await model.count({ status: 'archived' });

      expect(result).toBe(0);
    });

    it('should handle null count result', async () => {
      mockDb._mockChain.first.mockResolvedValue(null);

      const result = await model.count();

      expect(result).toBe(0);
    });

    it('should handle undefined count in result', async () => {
      mockDb._mockChain.first.mockResolvedValue({});

      const result = await model.count();

      expect(result).toBe(0);
    });

    it('should throw error on database failure', async () => {
      const dbError = new Error('Count query failed');
      mockDb._mockChain.first.mockRejectedValue(dbError);

      await expect(model.count()).rejects.toThrow('Count query failed');
    });
  });

  describe('exists', () => {
    it('should return true when record exists', async () => {
      mockDb._mockChain.first.mockResolvedValue({ id: '123' });

      const result = await model.exists({ id: '123' });

      expect(mockDb).toHaveBeenCalledWith('test_table');
      expect(mockDb._mockChain.where).toHaveBeenCalledWith({ id: '123' });
      expect(mockDb._mockChain.whereNull).toHaveBeenCalledWith('deleted_at');
      expect(mockDb._mockChain.first).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when record does not exist', async () => {
      mockDb._mockChain.first.mockResolvedValue(null);

      const result = await model.exists({ id: 'non-existent' });

      expect(result).toBe(false);
    });

    it('should return false when first() returns undefined', async () => {
      mockDb._mockChain.first.mockResolvedValue(undefined);

      const result = await model.exists({ id: '123' });

      expect(result).toBe(false);
    });

    it('should check existence with multiple conditions', async () => {
      mockDb._mockChain.first.mockResolvedValue({ id: '123' });

      const result = await model.exists({
        tenant_id: 'tenant-1',
        status: 'active',
      });

      expect(mockDb._mockChain.where).toHaveBeenCalledWith({
        tenant_id: 'tenant-1',
        status: 'active',
      });
      expect(result).toBe(true);
    });

    it('should throw error on database failure', async () => {
      const dbError = new Error('Query execution failed');
      mockDb._mockChain.first.mockRejectedValue(dbError);

      await expect(model.exists({ id: '123' })).rejects.toThrow('Query execution failed');
    });
  });

  describe('edge cases', () => {
    it('should handle concurrent operations', async () => {
      mockDb._mockChain.first.mockResolvedValue({ id: '1' });
      mockDb._mockChain.returning.mockResolvedValue([{ id: '2', name: 'Created' }]);

      const [findResult, createResult] = await Promise.all([
        model.findById('1'),
        model.create({ name: 'New Record' }),
      ]);

      expect(findResult).toEqual({ id: '1' });
      expect(createResult).toEqual({ id: '2', name: 'Created' });
    });

    it('should work with transaction db instance', async () => {
      const trxMock = createKnexMock();
      const trxModel = new BaseModel('test_table', trxMock);

      configureMockReturn(trxMock, { id: '1', name: 'Test' });

      const result = await trxModel.findById('1');

      expect(result).toEqual({ id: '1', name: 'Test' });
    });
  });

  describe('inheritance', () => {
    class TestModel extends BaseModel<{ id: string; name: string }> {
      protected selectColumns = ['id', 'name', 'created_at'];

      constructor(db: any) {
        super('test_entities', db);
      }

      async findByName(name: string) {
        return this.findOne({ name } as any);
      }
    }

    it('should allow subclass with custom selectColumns', async () => {
      const testModel = new TestModel(mockDb);
      
      expect((testModel as any).selectColumns).toEqual(['id', 'name', 'created_at']);
      expect((testModel as any).getSelectColumns()).toEqual(['id', 'name', 'created_at']);
    });

    it('should allow subclass with custom methods', async () => {
      const testModel = new TestModel(mockDb);
      configureMockReturn(mockDb, { id: '1', name: 'Test Record' });

      const result = await testModel.findByName('Test Record');

      expect(mockDb._mockChain.where).toHaveBeenCalledWith({ name: 'Test Record' });
      expect(result).toEqual({ id: '1', name: 'Test Record' });
    });

    it('should allow subclass to use different table name', () => {
      const testModel = new TestModel(mockDb);
      
      expect((testModel as any).tableName).toBe('test_entities');
    });
  });
});
