/**
 * BaseModel Integration Tests
 */

import {
  setupTestApp,
  teardownTestApp,
  cleanDatabase,
  TestContext,
  TEST_VENUE_ID,
  db,
  pool
} from './setup';
import { BaseModel } from '../../src/models/base.model';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';

// Concrete implementation for testing abstract BaseModel
class TestModel extends BaseModel {
  constructor(db: Knex | Knex.Transaction) {
    super('venues', db);
  }
}

describe('BaseModel', () => {
  let context: TestContext;
  let testModel: TestModel;

  beforeAll(async () => {
    context = await setupTestApp();
    testModel = new TestModel(context.db);
  }, 30000);

  afterAll(async () => {
    await teardownTestApp(context);
  });

  beforeEach(async () => {
    await cleanDatabase(db);
  });

  describe('findById', () => {
    it('should find record by id', async () => {
      const record = await testModel.findById(TEST_VENUE_ID);

      expect(record).toBeDefined();
      expect(record.id).toBe(TEST_VENUE_ID);
    });

    it('should return undefined for non-existent id', async () => {
      const record = await testModel.findById(uuidv4());

      expect(record).toBeUndefined();
    });

    it('should select specific columns', async () => {
      const record = await testModel.findById(TEST_VENUE_ID, ['id', 'name']);

      expect(record.id).toBe(TEST_VENUE_ID);
      expect(record.name).toBeDefined();
      expect(record.email).toBeUndefined();
    });

    it('should not find soft-deleted records', async () => {
      await pool.query('UPDATE venues SET deleted_at = NOW() WHERE id = $1', [TEST_VENUE_ID]);

      const record = await testModel.findById(TEST_VENUE_ID);

      expect(record).toBeUndefined();

      // Restore
      await pool.query('UPDATE venues SET deleted_at = NULL WHERE id = $1', [TEST_VENUE_ID]);
    });
  });

  describe('findAll', () => {
    it('should find all records matching conditions', async () => {
      const records = await testModel.findAll({ status: 'ACTIVE' });

      expect(records.length).toBeGreaterThan(0);
      records.forEach(r => expect(r.status).toBe('ACTIVE'));
    });

    it('should respect limit option', async () => {
      const records = await testModel.findAll({}, { limit: 1 });

      expect(records.length).toBeLessThanOrEqual(1);
    });

    it('should respect offset option', async () => {
      const all = await testModel.findAll({});
      const withOffset = await testModel.findAll({}, { offset: 1 });

      if (all.length > 1) {
        expect(withOffset.length).toBe(all.length - 1);
      }
    });

    it('should order by specified column', async () => {
      const records = await testModel.findAll({}, { orderBy: 'name', order: 'asc' });

      for (let i = 1; i < records.length; i++) {
        expect(records[i].name >= records[i - 1].name).toBe(true);
      }
    });

    it('should select specific columns', async () => {
      const records = await testModel.findAll({}, { columns: ['id', 'name'] });

      expect(records.length).toBeGreaterThan(0);
      expect(records[0].id).toBeDefined();
      expect(records[0].name).toBeDefined();
    });

    it('should not return soft-deleted records', async () => {
      await pool.query('UPDATE venues SET deleted_at = NOW() WHERE id = $1', [TEST_VENUE_ID]);

      const records = await testModel.findAll({});

      expect(records.find(r => r.id === TEST_VENUE_ID)).toBeUndefined();

      // Restore
      await pool.query('UPDATE venues SET deleted_at = NULL WHERE id = $1', [TEST_VENUE_ID]);
    });
  });

  describe('update', () => {
    it('should update record', async () => {
      const updated = await testModel.update(TEST_VENUE_ID, { name: 'Updated Name' });

      expect(updated.name).toBe('Updated Name');
      expect(updated.updated_at).toBeDefined();
    });

    it('should set updated_at timestamp', async () => {
      const before = await testModel.findById(TEST_VENUE_ID);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const updated = await testModel.update(TEST_VENUE_ID, { name: 'Time Test' });

      expect(new Date(updated.updated_at).getTime()).toBeGreaterThan(
        new Date(before.updated_at).getTime()
      );
    });

    it('should not update soft-deleted records', async () => {
      await pool.query('UPDATE venues SET deleted_at = NOW() WHERE id = $1', [TEST_VENUE_ID]);

      const updated = await testModel.update(TEST_VENUE_ID, { name: 'Should Not Update' });

      expect(updated).toBeUndefined();

      // Restore
      await pool.query('UPDATE venues SET deleted_at = NULL WHERE id = $1', [TEST_VENUE_ID]);
    });
  });

  describe('delete (soft delete)', () => {
    it('should soft delete record', async () => {
      await testModel.delete(TEST_VENUE_ID);

      const record = await pool.query('SELECT deleted_at FROM venues WHERE id = $1', [TEST_VENUE_ID]);

      expect(record.rows[0].deleted_at).not.toBeNull();

      // Restore
      await pool.query('UPDATE venues SET deleted_at = NULL WHERE id = $1', [TEST_VENUE_ID]);
    });
  });

  describe('count', () => {
    it('should count records', async () => {
      const count = await testModel.count({ status: 'ACTIVE' });

      expect(count).toBeGreaterThan(0);
    });

    it('should not count soft-deleted records', async () => {
      const beforeCount = await testModel.count({});
      
      await pool.query('UPDATE venues SET deleted_at = NOW() WHERE id = $1', [TEST_VENUE_ID]);
      
      const afterCount = await testModel.count({});

      expect(afterCount).toBe(beforeCount - 1);

      // Restore
      await pool.query('UPDATE venues SET deleted_at = NULL WHERE id = $1', [TEST_VENUE_ID]);
    });
  });

  describe('softDelete', () => {
    it('should return true on successful soft delete', async () => {
      const result = await testModel.softDelete(TEST_VENUE_ID);

      expect(result).toBe(true);

      // Restore
      await pool.query('UPDATE venues SET deleted_at = NULL WHERE id = $1', [TEST_VENUE_ID]);
    });

    it('should return false for non-existent record', async () => {
      const result = await testModel.softDelete(uuidv4());

      expect(result).toBe(false);
    });

    it('should return false for already deleted record', async () => {
      await testModel.softDelete(TEST_VENUE_ID);
      const result = await testModel.softDelete(TEST_VENUE_ID);

      expect(result).toBe(false);

      // Restore
      await pool.query('UPDATE venues SET deleted_at = NULL WHERE id = $1', [TEST_VENUE_ID]);
    });
  });

  describe('generateId', () => {
    it('should generate unique id with table prefix', () => {
      const id1 = testModel.generateId();
      const id2 = testModel.generateId();

      expect(id1).toMatch(/^ven_/);
      expect(id2).toMatch(/^ven_/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('withTransaction', () => {
    it('should create model with transaction context', async () => {
      await context.db.transaction(async (trx) => {
        const trxModel = testModel.withTransaction(trx);
        
        const record = await trxModel.findById(TEST_VENUE_ID);
        expect(record).toBeDefined();
      });
    });

    it('should rollback on transaction failure', async () => {
      const originalName = (await testModel.findById(TEST_VENUE_ID)).name;

      try {
        await context.db.transaction(async (trx) => {
          const trxModel = testModel.withTransaction(trx);
          await trxModel.update(TEST_VENUE_ID, { name: 'Transaction Name' });
          throw new Error('Force rollback');
        });
      } catch (e) {
        // Expected
      }

      const record = await testModel.findById(TEST_VENUE_ID);
      expect(record.name).toBe(originalName);
    });
  });
});
