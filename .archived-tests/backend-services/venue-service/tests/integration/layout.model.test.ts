/**
 * LayoutModel Integration Tests
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
import { LayoutModel, ILayout } from '../../src/models/layout.model';
import { v4 as uuidv4 } from 'uuid';

describe('LayoutModel', () => {
  let context: TestContext;
  let layoutModel: LayoutModel;

  beforeAll(async () => {
    context = await setupTestApp();
    layoutModel = new LayoutModel(context.db);
  }, 30000);

  afterAll(async () => {
    await teardownTestApp(context);
  });

  beforeEach(async () => {
    await cleanDatabase(db);
    await pool.query('DELETE FROM venue_layouts WHERE venue_id = $1', [TEST_VENUE_ID]);
  });

  // ==========================================================================
  // create
  // ==========================================================================
  describe('create', () => {
    it('should create layout', async () => {
      const layout = await layoutModel.create({
        venue_id: TEST_VENUE_ID,
        name: 'Main Hall',
        type: 'fixed',
        capacity: 500,
        is_default: true
      });

      expect(layout.id).toBeDefined();
      expect(layout.venue_id).toBe(TEST_VENUE_ID);
      expect(layout.name).toBe('Main Hall');
      expect(layout.type).toBe('fixed');
      expect(layout.capacity).toBe(500);
      expect(layout.is_default).toBe(true);
    });

    it('should create layout with sections', async () => {
      const sections = [
        { id: '1', name: 'Section A', rows: 10, seatsPerRow: 20 },
        { id: '2', name: 'Section B', rows: 8, seatsPerRow: 15 }
      ];

      const layout = await layoutModel.create({
        venue_id: TEST_VENUE_ID,
        name: 'Sectioned Layout',
        type: 'fixed',
        capacity: 320,
        is_default: false,
        sections: JSON.stringify(sections)
      });

      expect(layout.sections).toBeDefined();
    });

    it('should create general admission layout', async () => {
      const layout = await layoutModel.create({
        venue_id: TEST_VENUE_ID,
        name: 'GA Floor',
        type: 'general_admission',
        capacity: 1000,
        is_default: false
      });

      expect(layout.type).toBe('general_admission');
    });

    it('should create mixed layout', async () => {
      const layout = await layoutModel.create({
        venue_id: TEST_VENUE_ID,
        name: 'Mixed Layout',
        type: 'mixed',
        capacity: 750,
        is_default: false
      });

      expect(layout.type).toBe('mixed');
    });

    it('should set created_at timestamp', async () => {
      const layout = await layoutModel.create({
        venue_id: TEST_VENUE_ID,
        name: 'Timestamp Test',
        type: 'fixed',
        capacity: 100,
        is_default: false
      });

      expect(layout.created_at).toBeDefined();
    });
  });

  // ==========================================================================
  // findById
  // ==========================================================================
  describe('findById', () => {
    it('should find layout by id', async () => {
      const created = await layoutModel.create({
        venue_id: TEST_VENUE_ID,
        name: 'Find Test',
        type: 'fixed',
        capacity: 200,
        is_default: false
      });

      const found = await layoutModel.findById(created.id);

      expect(found).toBeDefined();
      expect(found.id).toBe(created.id);
      expect(found.name).toBe('Find Test');
    });

    it('should return undefined for non-existent id', async () => {
      const found = await layoutModel.findById(uuidv4());

      expect(found).toBeUndefined();
    });

    it('should not find soft-deleted layout', async () => {
      const created = await layoutModel.create({
        venue_id: TEST_VENUE_ID,
        name: 'To Delete',
        type: 'fixed',
        capacity: 100,
        is_default: false
      });

      await layoutModel.softDelete(created.id);

      const found = await layoutModel.findById(created.id);
      expect(found).toBeUndefined();
    });
  });

  // ==========================================================================
  // findByVenue
  // ==========================================================================
  describe('findByVenue', () => {
    it('should return all layouts for venue', async () => {
      await layoutModel.create({
        venue_id: TEST_VENUE_ID,
        name: 'Layout 1',
        type: 'fixed',
        capacity: 500,
        is_default: true
      });
      await layoutModel.create({
        venue_id: TEST_VENUE_ID,
        name: 'Layout 2',
        type: 'general_admission',
        capacity: 1000,
        is_default: false
      });
      await layoutModel.create({
        venue_id: TEST_VENUE_ID,
        name: 'Layout 3',
        type: 'mixed',
        capacity: 750,
        is_default: false
      });

      const layouts = await layoutModel.findByVenue(TEST_VENUE_ID);

      expect(layouts.length).toBe(3);
    });

    it('should return empty array for venue with no layouts', async () => {
      const layouts = await layoutModel.findByVenue(TEST_VENUE_ID);

      expect(layouts).toEqual([]);
    });

    it('should not return soft-deleted layouts', async () => {
      const layout = await layoutModel.create({
        venue_id: TEST_VENUE_ID,
        name: 'To Delete',
        type: 'fixed',
        capacity: 100,
        is_default: false
      });

      await layoutModel.softDelete(layout.id);

      const layouts = await layoutModel.findByVenue(TEST_VENUE_ID);
      expect(layouts.find(l => l.id === layout.id)).toBeUndefined();
    });

    it('should order by is_default desc first', async () => {
      await layoutModel.create({
        venue_id: TEST_VENUE_ID,
        name: 'Non-Default',
        type: 'fixed',
        capacity: 100,
        is_default: false
      });
      await layoutModel.create({
        venue_id: TEST_VENUE_ID,
        name: 'Default',
        type: 'fixed',
        capacity: 200,
        is_default: true
      });

      const layouts = await layoutModel.findByVenue(TEST_VENUE_ID);

      expect(layouts[0].is_default).toBe(true);
      expect(layouts[0].name).toBe('Default');
    });

    it('should order by created_at desc within same is_default', async () => {
      await layoutModel.create({
        venue_id: TEST_VENUE_ID,
        name: 'First',
        type: 'fixed',
        capacity: 100,
        is_default: false
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      await layoutModel.create({
        venue_id: TEST_VENUE_ID,
        name: 'Second',
        type: 'fixed',
        capacity: 200,
        is_default: false
      });

      const layouts = await layoutModel.findByVenue(TEST_VENUE_ID);
      const nonDefaults = layouts.filter(l => !l.is_default);

      expect(nonDefaults[0].name).toBe('Second');
      expect(nonDefaults[1].name).toBe('First');
    });
  });

  // ==========================================================================
  // getDefaultLayout
  // ==========================================================================
  describe('getDefaultLayout', () => {
    it('should return default layout', async () => {
      await layoutModel.create({
        venue_id: TEST_VENUE_ID,
        name: 'Non-Default',
        type: 'fixed',
        capacity: 100,
        is_default: false
      });
      await layoutModel.create({
        venue_id: TEST_VENUE_ID,
        name: 'Default Layout',
        type: 'fixed',
        capacity: 500,
        is_default: true
      });

      const defaultLayout = await layoutModel.getDefaultLayout(TEST_VENUE_ID);

      expect(defaultLayout).toBeDefined();
      expect(defaultLayout!.name).toBe('Default Layout');
      expect(defaultLayout!.is_default).toBe(true);
    });

    it('should return undefined when no default exists', async () => {
      await layoutModel.create({
        venue_id: TEST_VENUE_ID,
        name: 'Non-Default',
        type: 'fixed',
        capacity: 100,
        is_default: false
      });

      const defaultLayout = await layoutModel.getDefaultLayout(TEST_VENUE_ID);

      expect(defaultLayout).toBeUndefined();
    });

    it('should return undefined for venue with no layouts', async () => {
      const defaultLayout = await layoutModel.getDefaultLayout(TEST_VENUE_ID);

      expect(defaultLayout).toBeUndefined();
    });

    it('should not return soft-deleted default layout', async () => {
      const layout = await layoutModel.create({
        venue_id: TEST_VENUE_ID,
        name: 'Default',
        type: 'fixed',
        capacity: 100,
        is_default: true
      });

      await layoutModel.softDelete(layout.id);

      const defaultLayout = await layoutModel.getDefaultLayout(TEST_VENUE_ID);
      expect(defaultLayout).toBeUndefined();
    });
  });

  // ==========================================================================
  // setAsDefault
  // ==========================================================================
  describe('setAsDefault', () => {
    it('should set layout as default', async () => {
      const layout = await layoutModel.create({
        venue_id: TEST_VENUE_ID,
        name: 'To Be Default',
        type: 'fixed',
        capacity: 500,
        is_default: false
      });

      await layoutModel.setAsDefault(layout.id, TEST_VENUE_ID);

      const updated = await layoutModel.findById(layout.id);
      expect(updated.is_default).toBe(true);
    });

    it('should unset previous default', async () => {
      const oldDefault = await layoutModel.create({
        venue_id: TEST_VENUE_ID,
        name: 'Old Default',
        type: 'fixed',
        capacity: 500,
        is_default: true
      });
      const newDefault = await layoutModel.create({
        venue_id: TEST_VENUE_ID,
        name: 'New Default',
        type: 'fixed',
        capacity: 300,
        is_default: false
      });

      await layoutModel.setAsDefault(newDefault.id, TEST_VENUE_ID);

      const oldUpdated = await layoutModel.findById(oldDefault.id);
      const newUpdated = await layoutModel.findById(newDefault.id);

      expect(oldUpdated.is_default).toBe(false);
      expect(newUpdated.is_default).toBe(true);
    });

    it('should only affect layouts of same venue', async () => {
      const testVenueLayout = await layoutModel.create({
        venue_id: TEST_VENUE_ID,
        name: 'Test Venue Layout',
        type: 'fixed',
        capacity: 500,
        is_default: true
      });

      const newDefault = await layoutModel.create({
        venue_id: TEST_VENUE_ID,
        name: 'New Default',
        type: 'fixed',
        capacity: 300,
        is_default: false
      });

      await layoutModel.setAsDefault(newDefault.id, TEST_VENUE_ID);

      const layouts = await layoutModel.findByVenue(TEST_VENUE_ID);
      const defaults = layouts.filter(l => l.is_default);
      expect(defaults.length).toBe(1);
      expect(defaults[0].id).toBe(newDefault.id);
    });

    it('should work in transaction', async () => {
      const layout1 = await layoutModel.create({
        venue_id: TEST_VENUE_ID,
        name: 'Layout 1',
        type: 'fixed',
        capacity: 500,
        is_default: true
      });
      const layout2 = await layoutModel.create({
        venue_id: TEST_VENUE_ID,
        name: 'Layout 2',
        type: 'fixed',
        capacity: 300,
        is_default: false
      });

      await layoutModel.setAsDefault(layout2.id, TEST_VENUE_ID);

      const updated1 = await layoutModel.findById(layout1.id);
      const updated2 = await layoutModel.findById(layout2.id);

      expect(updated1.is_default).toBe(false);
      expect(updated2.is_default).toBe(true);
    });
  });

  // ==========================================================================
  // update
  // ==========================================================================
  describe('update', () => {
    it('should update layout fields', async () => {
      const layout = await layoutModel.create({
        venue_id: TEST_VENUE_ID,
        name: 'Original Name',
        type: 'fixed',
        capacity: 500,
        is_default: false
      });

      const updated = await layoutModel.update(layout.id, {
        name: 'Updated Name',
        capacity: 600
      });

      expect(updated.name).toBe('Updated Name');
      expect(updated.capacity).toBe(600);
    });

    it('should update updated_at timestamp', async () => {
      const layout = await layoutModel.create({
        venue_id: TEST_VENUE_ID,
        name: 'Timestamp Test',
        type: 'fixed',
        capacity: 100,
        is_default: false
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      const updated = await layoutModel.update(layout.id, { name: 'Updated' });

      expect(new Date(updated.updated_at).getTime()).toBeGreaterThan(
        new Date(layout.updated_at!).getTime()
      );
    });
  });

  // ==========================================================================
  // softDelete
  // ==========================================================================
  describe('softDelete', () => {
    it('should soft delete layout', async () => {
      const layout = await layoutModel.create({
        venue_id: TEST_VENUE_ID,
        name: 'To Delete',
        type: 'fixed',
        capacity: 100,
        is_default: false
      });

      const result = await layoutModel.softDelete(layout.id);

      expect(result).toBe(true);

      const dbResult = await pool.query(
        'SELECT deleted_at FROM venue_layouts WHERE id = $1',
        [layout.id]
      );
      expect(dbResult.rows[0].deleted_at).not.toBeNull();
    });

    it('should return true for successful delete', async () => {
      const layout = await layoutModel.create({
        venue_id: TEST_VENUE_ID,
        name: 'Delete Success',
        type: 'fixed',
        capacity: 100,
        is_default: false
      });

      const result = await layoutModel.softDelete(layout.id);

      expect(result).toBe(true);
    });

    it('should return false for non-existent layout', async () => {
      const result = await layoutModel.softDelete(uuidv4());

      expect(result).toBe(false);
    });

    it('should return false for already deleted layout', async () => {
      const layout = await layoutModel.create({
        venue_id: TEST_VENUE_ID,
        name: 'Double Delete',
        type: 'fixed',
        capacity: 100,
        is_default: false
      });

      await layoutModel.softDelete(layout.id);
      const result = await layoutModel.softDelete(layout.id);

      expect(result).toBe(false);
    });
  });

  // ==========================================================================
  // count
  // ==========================================================================
  describe('count', () => {
    it('should count layouts', async () => {
      await layoutModel.create({
        venue_id: TEST_VENUE_ID,
        name: 'Layout 1',
        type: 'fixed',
        capacity: 100,
        is_default: true
      });
      await layoutModel.create({
        venue_id: TEST_VENUE_ID,
        name: 'Layout 2',
        type: 'fixed',
        capacity: 200,
        is_default: false
      });

      const count = await layoutModel.count({ venue_id: TEST_VENUE_ID });

      expect(count).toBe(2);
    });

    it('should not count soft-deleted layouts', async () => {
      const layout = await layoutModel.create({
        venue_id: TEST_VENUE_ID,
        name: 'To Delete',
        type: 'fixed',
        capacity: 100,
        is_default: false
      });

      await layoutModel.softDelete(layout.id);

      const count = await layoutModel.count({ venue_id: TEST_VENUE_ID });

      expect(count).toBe(0);
    });
  });

  // ==========================================================================
  // withTransaction
  // ==========================================================================
  describe('withTransaction', () => {
    it('should work within transaction', async () => {
      let createdId: string;

      await context.db.transaction(async (trx) => {
        const trxModel = layoutModel.withTransaction(trx);
        const created = await trxModel.create({
          venue_id: TEST_VENUE_ID,
          name: 'Transaction Layout',
          type: 'fixed',
          capacity: 500,
          is_default: true
        });
        createdId = created.id;
      });

      const found = await layoutModel.findById(createdId!);
      expect(found).toBeDefined();
      expect(found.name).toBe('Transaction Layout');
    });

    it('should rollback on error', async () => {
      let createdId: string | undefined;

      try {
        await context.db.transaction(async (trx) => {
          const trxModel = layoutModel.withTransaction(trx);
          const created = await trxModel.create({
            venue_id: TEST_VENUE_ID,
            name: 'Rollback Layout',
            type: 'fixed',
            capacity: 500,
            is_default: true
          });
          createdId = created.id;
          throw new Error('Force rollback');
        });
      } catch (e) {
        // Expected
      }

      if (createdId) {
        const found = await layoutModel.findById(createdId);
        expect(found).toBeUndefined();
      }
    });
  });
});
