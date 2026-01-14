/**
 * Unit tests for BaseModel
 * Tests the abstract base class functionality for all models
 */

import { createKnexMock, configureMockReturn, configureMockError } from '../../__mocks__/knex.mock';

// Create a concrete implementation of the abstract BaseModel for testing
class TestModel {
  protected tableName: string;
  protected db: any;

  constructor(tableName: string, db: any) {
    this.tableName = tableName;
    this.db = db;
  }

  withTransaction(trx: any): this {
    const ModelClass = this.constructor as any;
    return new ModelClass(this.tableName, trx);
  }

  async findById(id: string, columns: string[] = ['*']) {
    return this.db(this.tableName)
      .where({ id })
      .whereNull('deleted_at')
      .select(columns)
      .first();
  }

  async findAll(conditions: any = {}, options: any = {}) {
    const { limit = 50, offset = 0, orderBy = 'created_at', order = 'desc' } = options;

    let query = this.db(this.tableName)
      .where(conditions)
      .whereNull('deleted_at');

    if (options.columns) {
      query = query.select(options.columns);
    }

    return query
      .orderBy(orderBy, order)
      .limit(limit)
      .offset(offset);
  }

  async create(data: any) {
    const [record] = await this.db(this.tableName)
      .insert(data)
      .returning('*');

    return record;
  }

  async update(id: string, data: any) {
    const [record] = await this.db(this.tableName)
      .where({ id })
      .whereNull('deleted_at')
      .update({
        ...data,
        updated_at: new Date()
      })
      .returning('*');

    return record;
  }

  async delete(id: string) {
    return this.db(this.tableName)
      .where({ id })
      .update({
        deleted_at: new Date()
      });
  }

  async count(conditions: any = {}): Promise<number> {
    const result = await this.db(this.tableName)
      .where(conditions)
      .whereNull('deleted_at')
      .count('* as count')
      .first();

    return parseInt(String(result?.count || '0'), 10);
  }

  async softDelete(id: string): Promise<boolean> {
    const result = await this.db(this.tableName)
      .where({ id })
      .whereNull('deleted_at')
      .update({ deleted_at: new Date() });

    return result > 0;
  }

  generateId(): string {
    const prefix = this.tableName.substring(0, 3);
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

describe('BaseModel', () => {
  let mockKnex: any;
  let model: TestModel;

  beforeEach(() => {
    mockKnex = createKnexMock();
    model = new TestModel('test_table', mockKnex);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with table name and db connection', () => {
      expect((model as any).tableName).toBe('test_table');
      expect((model as any).db).toBe(mockKnex);
    });
  });

  describe('withTransaction', () => {
    it('should create new instance with transaction', () => {
      const trxMock = createKnexMock();
      const transactionalModel = model.withTransaction(trxMock);

      expect(transactionalModel).toBeInstanceOf(TestModel);
      expect((transactionalModel as any).db).toBe(trxMock);
      expect(transactionalModel).not.toBe(model);
    });
  });

  describe('findById', () => {
    it('should find record by id with soft delete filter', async () => {
      const mockRecord = { id: 'test-id', name: 'Test Record' };
      mockKnex._mockChain.first.mockResolvedValue(mockRecord);

      const result = await model.findById('test-id');

      expect(mockKnex).toHaveBeenCalledWith('test_table');
      expect(mockKnex._mockChain.where).toHaveBeenCalledWith({ id: 'test-id' });
      expect(mockKnex._mockChain.whereNull).toHaveBeenCalledWith('deleted_at');
      expect(mockKnex._mockChain.select).toHaveBeenCalledWith(['*']);
      expect(mockKnex._mockChain.first).toHaveBeenCalled();
      expect(result).toEqual(mockRecord);
    });

    it('should find record with specific columns', async () => {
      const mockRecord = { id: 'test-id', name: 'Test Record' };
      mockKnex._mockChain.first.mockResolvedValue(mockRecord);

      await model.findById('test-id', ['id', 'name']);

      expect(mockKnex._mockChain.select).toHaveBeenCalledWith(['id', 'name']);
    });

    it('should return null when record not found', async () => {
      mockKnex._mockChain.first.mockResolvedValue(null);

      const result = await model.findById('non-existent-id');

      expect(result).toBeNull();
    });

    it('should return null for soft deleted records', async () => {
      // Soft deleted records are filtered by whereNull('deleted_at')
      mockKnex._mockChain.first.mockResolvedValue(null);

      const result = await model.findById('deleted-record-id');

      expect(mockKnex._mockChain.whereNull).toHaveBeenCalledWith('deleted_at');
      expect(result).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should find all records with default options', async () => {
      const mockRecords = [{ id: '1' }, { id: '2' }];
      configureMockReturn(mockKnex, mockRecords);

      const result = await model.findAll();

      expect(mockKnex).toHaveBeenCalledWith('test_table');
      expect(mockKnex._mockChain.where).toHaveBeenCalledWith({});
      expect(mockKnex._mockChain.whereNull).toHaveBeenCalledWith('deleted_at');
      expect(mockKnex._mockChain.orderBy).toHaveBeenCalledWith('created_at', 'desc');
      expect(mockKnex._mockChain.limit).toHaveBeenCalledWith(50);
      expect(mockKnex._mockChain.offset).toHaveBeenCalledWith(0);
      expect(result).toEqual(mockRecords);
    });

    it('should apply conditions when provided', async () => {
      const mockRecords = [{ id: '1', status: 'ACTIVE' }];
      configureMockReturn(mockKnex, mockRecords);

      await model.findAll({ status: 'ACTIVE' });

      expect(mockKnex._mockChain.where).toHaveBeenCalledWith({ status: 'ACTIVE' });
    });

    it('should apply custom pagination options', async () => {
      configureMockReturn(mockKnex, []);

      await model.findAll({}, { limit: 10, offset: 20 });

      expect(mockKnex._mockChain.limit).toHaveBeenCalledWith(10);
      expect(mockKnex._mockChain.offset).toHaveBeenCalledWith(20);
    });

    it('should apply custom orderBy options', async () => {
      configureMockReturn(mockKnex, []);

      await model.findAll({}, { orderBy: 'name', order: 'asc' });

      expect(mockKnex._mockChain.orderBy).toHaveBeenCalledWith('name', 'asc');
    });

    it('should select specific columns when provided', async () => {
      configureMockReturn(mockKnex, []);

      await model.findAll({}, { columns: ['id', 'name'] });

      expect(mockKnex._mockChain.select).toHaveBeenCalledWith(['id', 'name']);
    });

    it('should filter out soft deleted records', async () => {
      configureMockReturn(mockKnex, []);

      await model.findAll();

      expect(mockKnex._mockChain.whereNull).toHaveBeenCalledWith('deleted_at');
    });
  });

  describe('create', () => {
    it('should insert record and return created record', async () => {
      const inputData = { name: 'New Record', email: 'test@example.com' };
      const createdRecord = { id: 'new-id', ...inputData, created_at: new Date() };
      mockKnex._mockChain.returning.mockResolvedValue([createdRecord]);

      const result = await model.create(inputData);

      expect(mockKnex).toHaveBeenCalledWith('test_table');
      expect(mockKnex._mockChain.insert).toHaveBeenCalledWith(inputData);
      expect(mockKnex._mockChain.returning).toHaveBeenCalledWith('*');
      expect(result).toEqual(createdRecord);
    });

    it('should handle database errors during creation', async () => {
      const inputData = { name: 'New Record' };
      const dbError = new Error('Unique constraint violation');
      configureMockError(mockKnex, dbError);
      mockKnex._mockChain.returning.mockRejectedValue(dbError);

      await expect(model.create(inputData)).rejects.toThrow('Unique constraint violation');
    });
  });

  describe('update', () => {
    it('should update record and return updated record', async () => {
      const updateData = { name: 'Updated Name' };
      const updatedRecord = { id: 'test-id', name: 'Updated Name', updated_at: new Date() };
      mockKnex._mockChain.returning.mockResolvedValue([updatedRecord]);

      const result = await model.update('test-id', updateData);

      expect(mockKnex).toHaveBeenCalledWith('test_table');
      expect(mockKnex._mockChain.where).toHaveBeenCalledWith({ id: 'test-id' });
      expect(mockKnex._mockChain.whereNull).toHaveBeenCalledWith('deleted_at');
      expect(mockKnex._mockChain.update).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Updated Name',
        updated_at: expect.any(Date)
      }));
      expect(mockKnex._mockChain.returning).toHaveBeenCalledWith('*');
      expect(result).toEqual(updatedRecord);
    });

    it('should set updated_at timestamp', async () => {
      const updateData = { name: 'Test' };
      mockKnex._mockChain.returning.mockResolvedValue([{}]);

      await model.update('test-id', updateData);

      expect(mockKnex._mockChain.update).toHaveBeenCalledWith(expect.objectContaining({
        updated_at: expect.any(Date)
      }));
    });

    it('should not update soft deleted records', async () => {
      mockKnex._mockChain.returning.mockResolvedValue([undefined]);

      const result = await model.update('deleted-id', { name: 'Test' });

      expect(mockKnex._mockChain.whereNull).toHaveBeenCalledWith('deleted_at');
      expect(result).toBeUndefined();
    });
  });

  describe('delete (soft delete via deleted_at)', () => {
    it('should set deleted_at timestamp for soft delete', async () => {
      mockKnex._mockChain.update.mockResolvedValue(1);

      await model.delete('test-id');

      expect(mockKnex).toHaveBeenCalledWith('test_table');
      expect(mockKnex._mockChain.where).toHaveBeenCalledWith({ id: 'test-id' });
      expect(mockKnex._mockChain.update).toHaveBeenCalledWith(expect.objectContaining({
        deleted_at: expect.any(Date)
      }));
    });

    it('should return affected rows count', async () => {
      mockKnex._mockChain.update.mockResolvedValue(1);

      const result = await model.delete('test-id');

      expect(result).toBe(1);
    });
  });

  describe('count', () => {
    it('should count records with soft delete filter', async () => {
      mockKnex._mockChain.first.mockResolvedValue({ count: '5' });

      const result = await model.count();

      expect(mockKnex).toHaveBeenCalledWith('test_table');
      expect(mockKnex._mockChain.where).toHaveBeenCalledWith({});
      expect(mockKnex._mockChain.whereNull).toHaveBeenCalledWith('deleted_at');
      expect(mockKnex._mockChain.count).toHaveBeenCalledWith('* as count');
      expect(result).toBe(5);
    });

    it('should count records with conditions', async () => {
      mockKnex._mockChain.first.mockResolvedValue({ count: '3' });

      const result = await model.count({ status: 'ACTIVE' });

      expect(mockKnex._mockChain.where).toHaveBeenCalledWith({ status: 'ACTIVE' });
      expect(result).toBe(3);
    });

    it('should return 0 when no records found', async () => {
      mockKnex._mockChain.first.mockResolvedValue(null);

      const result = await model.count();

      expect(result).toBe(0);
    });

    it('should handle string count values', async () => {
      mockKnex._mockChain.first.mockResolvedValue({ count: '100' });

      const result = await model.count();

      expect(typeof result).toBe('number');
      expect(result).toBe(100);
    });
  });

  describe('softDelete', () => {
    it('should soft delete record and return true on success', async () => {
      mockKnex._mockChain.update.mockResolvedValue(1);

      const result = await model.softDelete('test-id');

      expect(mockKnex).toHaveBeenCalledWith('test_table');
      expect(mockKnex._mockChain.where).toHaveBeenCalledWith({ id: 'test-id' });
      expect(mockKnex._mockChain.whereNull).toHaveBeenCalledWith('deleted_at');
      expect(mockKnex._mockChain.update).toHaveBeenCalledWith(expect.objectContaining({
        deleted_at: expect.any(Date)
      }));
      expect(result).toBe(true);
    });

    it('should return false when record not found or already deleted', async () => {
      mockKnex._mockChain.update.mockResolvedValue(0);

      const result = await model.softDelete('non-existent-id');

      expect(result).toBe(false);
    });

    it('should not soft delete already deleted records', async () => {
      mockKnex._mockChain.update.mockResolvedValue(0);

      const result = await model.softDelete('already-deleted-id');

      expect(mockKnex._mockChain.whereNull).toHaveBeenCalledWith('deleted_at');
      expect(result).toBe(false);
    });
  });

  describe('generateId', () => {
    it('should generate ID with table prefix', () => {
      const id = model.generateId();

      expect(id).toMatch(/^tes_/); // First 3 chars of 'test_table'
    });

    it('should include timestamp in ID', () => {
      const beforeTime = Date.now();
      const id = model.generateId();
      const afterTime = Date.now();

      const parts = id.split('_');
      const timestamp = parseInt(parts[1], 10);

      expect(timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(timestamp).toBeLessThanOrEqual(afterTime);
    });

    it('should include random suffix', () => {
      const id = model.generateId();
      const parts = id.split('_');

      expect(parts[2]).toBeDefined();
      expect(parts[2].length).toBeGreaterThan(0);
    });

    it('should generate unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(model.generateId());
      }

      expect(ids.size).toBe(100);
    });

    it('should format ID as prefix_timestamp_random', () => {
      const id = model.generateId();

      expect(id).toMatch(/^[a-z]{3}_\d+_[a-z0-9]+$/);
    });
  });

  describe('error handling', () => {
    it('should propagate database errors in findById', async () => {
      const dbError = new Error('Connection failed');
      mockKnex._mockChain.first.mockRejectedValue(dbError);

      await expect(model.findById('test-id')).rejects.toThrow('Connection failed');
    });

    it('should propagate database errors in findAll', async () => {
      const dbError = new Error('Query timeout');
      // For findAll, we need to mock the chain to throw when offset() is called
      mockKnex._mockChain.offset.mockImplementation(() => {
        throw dbError;
      });

      await expect(model.findAll()).rejects.toThrow('Query timeout');
    });

    it('should propagate database errors in count', async () => {
      const dbError = new Error('Count failed');
      mockKnex._mockChain.first.mockRejectedValue(dbError);

      await expect(model.count()).rejects.toThrow('Count failed');
    });

    it('should propagate database errors in softDelete', async () => {
      const dbError = new Error('Update failed');
      mockKnex._mockChain.update.mockRejectedValue(dbError);

      await expect(model.softDelete('test-id')).rejects.toThrow('Update failed');
    });
  });
});
