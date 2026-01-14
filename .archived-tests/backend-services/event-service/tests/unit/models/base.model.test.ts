import { BaseModel } from '../../../src/models/base.model';
import { Knex } from 'knex';

describe('Base Model', () => {
  let mockDb: any;
  let model: BaseModel;
  let mockQueryBuilder: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      whereNull: jest.fn().mockReturnThis(),
      select: jest.fn().mockResolvedValue([]),
      first: jest.fn().mockResolvedValue(null),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockResolvedValue(1),
      returning: jest.fn().mockResolvedValue([]),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      count: jest.fn().mockReturnThis(),
    };

    mockDb = jest.fn(() => mockQueryBuilder);
    model = new BaseModel('test_table', mockDb as any);
  });

  describe('constructor', () => {
    it('should initialize with table name and db', () => {
      expect(model['tableName']).toBe('test_table');
      expect(model['db']).toBe(mockDb);
    });
  });

  describe('findAll', () => {
    it('should find all records', async () => {
      const mockRecords = [{ id: '1' }, { id: '2' }];
      mockQueryBuilder.select.mockResolvedValue(mockRecords);

      const result = await model.findAll();

      expect(mockDb).toHaveBeenCalledWith('test_table');
      expect(mockQueryBuilder.whereNull).toHaveBeenCalledWith('deleted_at');
      expect(result).toEqual(mockRecords);
    });

    it('should apply conditions', async () => {
      await model.findAll({ status: 'active' });

      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ status: 'active' });
    });

    it('should apply limit and offset', async () => {
      await model.findAll({}, { limit: 10, offset: 5 });

      expect(mockQueryBuilder.limit).toHaveBeenCalledWith(10);
      expect(mockQueryBuilder.offset).toHaveBeenCalledWith(5);
    });
  });

  describe('findOne', () => {
    it('should find one record', async () => {
      const mockRecord = { id: '1', name: 'Test' };
      mockQueryBuilder.first.mockResolvedValue(mockRecord);

      const result = await model.findOne({ name: 'Test' });

      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ name: 'Test' });
      expect(result).toEqual(mockRecord);
    });

    it('should return null when not found', async () => {
      mockQueryBuilder.first.mockResolvedValue(null);

      const result = await model.findOne({ id: '999' });

      expect(result).toBeNull();
    });
  });

  describe('findById', () => {
    it('should find record by id', async () => {
      const mockRecord = { id: '123', name: 'Test' };
      mockQueryBuilder.first.mockResolvedValue(mockRecord);

      const result = await model.findById('123');

      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ id: '123' });
      expect(result).toEqual(mockRecord);
    });
  });

  describe('create', () => {
    it('should create a new record', async () => {
      const newData = { name: 'New Item' };
      const mockCreated = { id: '123', ...newData };
      mockQueryBuilder.returning.mockResolvedValue([mockCreated]);

      const result = await model.create(newData);

      expect(mockQueryBuilder.insert).toHaveBeenCalledWith(newData);
      expect(result).toEqual(mockCreated);
    });
  });

  describe('update', () => {
    it('should update a record', async () => {
      const updates = { name: 'Updated' };
      const mockUpdated = { id: '123', name: 'Updated' };
      mockQueryBuilder.returning.mockResolvedValue([mockUpdated]);

      const result = await model.update('123', updates);

      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ id: '123' });
      expect(mockQueryBuilder.update).toHaveBeenCalled();
      expect(result).toEqual(mockUpdated);
    });
  });

  describe('delete', () => {
    it('should soft delete a record', async () => {
      mockQueryBuilder.update.mockResolvedValue(1);

      const result = await model.delete('123');

      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ id: '123' });
      expect(mockQueryBuilder.update).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when no record deleted', async () => {
      mockQueryBuilder.update.mockResolvedValue(0);

      const result = await model.delete('999');

      expect(result).toBe(false);
    });
  });

  describe('hardDelete', () => {
    it('should hard delete a record', async () => {
      mockQueryBuilder.delete.mockResolvedValue(1);

      const result = await model.hardDelete('123');

      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ id: '123' });
      expect(result).toBe(true);
    });
  });

  describe('count', () => {
    it('should count records', async () => {
      mockQueryBuilder.first.mockResolvedValue({ count: '5' });

      const result = await model.count();

      expect(mockQueryBuilder.count).toHaveBeenCalledWith('* as count');
      expect(result).toBe(5);
    });
  });

  describe('exists', () => {
    it('should return true if record exists', async () => {
      mockQueryBuilder.first.mockResolvedValue({ id: '1' });

      const result = await model.exists({ id: '1' });

      expect(result).toBe(true);
    });

    it('should return false if record does not exist', async () => {
      mockQueryBuilder.first.mockResolvedValue(null);

      const result = await model.exists({ id: '999' });

      expect(result).toBe(false);
    });
  });
});
