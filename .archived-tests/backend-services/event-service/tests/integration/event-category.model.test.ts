/**
 * EventCategoryModel Integration Tests
 */

import {
  setupTestApp,
  teardownTestApp,
  cleanDatabase,
  TestContext,
  db,
  pool,
  redis,
} from './setup';
import { EventCategoryModel, IEventCategory } from '../../src/models/event-category.model';
import { v4 as uuidv4 } from 'uuid';

const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';

describe('EventCategoryModel', () => {
  let context: TestContext;
  let categoryModel: EventCategoryModel;

  beforeAll(async () => {
    context = await setupTestApp();
    categoryModel = new EventCategoryModel(context.db);
  }, 30000);

  afterAll(async () => {
    await teardownTestApp(context);
  });

  beforeEach(async () => {
    await redis.flushdb();
    // Clean categories but preserve seeded ones - delete test categories only
    await pool.query(`DELETE FROM event_categories WHERE slug LIKE 'test-%'`);
  });

  // Helper to create category directly
  async function createCategoryDirect(overrides: Partial<IEventCategory> = {}): Promise<any> {
    const id = overrides.id || uuidv4();
    const slug = overrides.slug || `test-cat-${id.slice(0, 8)}`;

    const result = await pool.query(
      `INSERT INTO event_categories (
        id, parent_id, name, slug, description, icon, color,
        display_order, is_active, is_featured, meta_title, meta_description, event_count
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        id,
        overrides.parent_id || null,
        overrides.name || 'Test Category',
        slug,
        overrides.description || null,
        overrides.icon || null,
        overrides.color || null,
        overrides.display_order ?? 0,
        overrides.is_active ?? true,
        overrides.is_featured ?? false,
        overrides.meta_title || null,
        overrides.meta_description || null,
        overrides.event_count ?? 0,
      ]
    );

    return result.rows[0];
  }

  // ==========================================================================
  // findById (inherited from BaseModel)
  // ==========================================================================
  describe('findById', () => {
    it('should find category by id', async () => {
      const created = await createCategoryDirect({ name: 'Find Test' });

      const category = await categoryModel.findById(created.id);

      expect(category).toBeDefined();
      expect(category!.id).toBe(created.id);
      expect(category!.name).toBe('Find Test');
    });

    it('should return null for non-existent category', async () => {
      const category = await categoryModel.findById(uuidv4());

      expect(category).toBeNull();
    });
  });

  // ==========================================================================
  // findBySlug
  // ==========================================================================
  describe('findBySlug', () => {
    it('should find active category by slug', async () => {
      await createCategoryDirect({ name: 'Slug Test', slug: 'test-slug-category', is_active: true });

      const category = await categoryModel.findBySlug('test-slug-category');

      expect(category).toBeDefined();
      expect(category!.slug).toBe('test-slug-category');
    });

    it('should return null for inactive category', async () => {
      await createCategoryDirect({ name: 'Inactive', slug: 'test-inactive-cat', is_active: false });

      const category = await categoryModel.findBySlug('test-inactive-cat');

      expect(category).toBeNull();
    });

    it('should return null for non-existent slug', async () => {
      const category = await categoryModel.findBySlug('non-existent-slug');

      expect(category).toBeNull();
    });
  });

  // ==========================================================================
  // findTopLevel
  // ==========================================================================
  describe('findTopLevel', () => {
    it('should return categories with no parent', async () => {
      const parent = await createCategoryDirect({ name: 'Parent', slug: 'test-parent' });
      await createCategoryDirect({ name: 'Child', slug: 'test-child', parent_id: parent.id });

      const topLevel = await categoryModel.findTopLevel();

      const testCategories = topLevel.filter(c => c.slug.startsWith('test-'));
      expect(testCategories.length).toBe(1);
      expect(testCategories[0].name).toBe('Parent');
    });

    it('should only return active categories', async () => {
      await createCategoryDirect({ name: 'Active Parent', slug: 'test-active-parent', is_active: true });
      await createCategoryDirect({ name: 'Inactive Parent', slug: 'test-inactive-parent', is_active: false });

      const topLevel = await categoryModel.findTopLevel();

      const testCategories = topLevel.filter(c => c.slug.startsWith('test-'));
      expect(testCategories.length).toBe(1);
      expect(testCategories[0].name).toBe('Active Parent');
    });

    it('should order by display_order then name', async () => {
      await createCategoryDirect({ name: 'Zebra', slug: 'test-zebra', display_order: 1 });
      await createCategoryDirect({ name: 'Alpha', slug: 'test-alpha', display_order: 1 });
      await createCategoryDirect({ name: 'First', slug: 'test-first', display_order: 0 });

      const topLevel = await categoryModel.findTopLevel();

      const testCategories = topLevel.filter(c => c.slug.startsWith('test-'));
      expect(testCategories[0].name).toBe('First');
      expect(testCategories[1].name).toBe('Alpha');
      expect(testCategories[2].name).toBe('Zebra');
    });
  });

  // ==========================================================================
  // findByParentId
  // ==========================================================================
  describe('findByParentId', () => {
    it('should find children of a parent category', async () => {
      const parent = await createCategoryDirect({ name: 'Parent', slug: 'test-parent-for-children' });
      await createCategoryDirect({ name: 'Child 1', slug: 'test-child-1', parent_id: parent.id });
      await createCategoryDirect({ name: 'Child 2', slug: 'test-child-2', parent_id: parent.id });

      const children = await categoryModel.findByParentId(parent.id);

      expect(children.length).toBe(2);
    });

    it('should only return active children', async () => {
      const parent = await createCategoryDirect({ name: 'Parent', slug: 'test-parent-active' });
      await createCategoryDirect({ name: 'Active Child', slug: 'test-active-child', parent_id: parent.id, is_active: true });
      await createCategoryDirect({ name: 'Inactive Child', slug: 'test-inactive-child', parent_id: parent.id, is_active: false });

      const children = await categoryModel.findByParentId(parent.id);

      expect(children.length).toBe(1);
      expect(children[0].name).toBe('Active Child');
    });

    it('should order by display_order', async () => {
      const parent = await createCategoryDirect({ name: 'Parent', slug: 'test-parent-order' });
      await createCategoryDirect({ name: 'Second', slug: 'test-second', parent_id: parent.id, display_order: 2 });
      await createCategoryDirect({ name: 'First', slug: 'test-first-child', parent_id: parent.id, display_order: 1 });

      const children = await categoryModel.findByParentId(parent.id);

      expect(children[0].name).toBe('First');
      expect(children[1].name).toBe('Second');
    });

    it('should return empty array for parent with no children', async () => {
      const parent = await createCategoryDirect({ name: 'Childless', slug: 'test-childless' });

      const children = await categoryModel.findByParentId(parent.id);

      expect(children).toEqual([]);
    });
  });

  // ==========================================================================
  // findFeatured
  // ==========================================================================
  describe('findFeatured', () => {
    it('should return featured active categories', async () => {
      await createCategoryDirect({ name: 'Featured', slug: 'test-featured', is_featured: true, is_active: true });
      await createCategoryDirect({ name: 'Not Featured', slug: 'test-not-featured', is_featured: false, is_active: true });

      const featured = await categoryModel.findFeatured();

      const testCategories = featured.filter(c => c.slug.startsWith('test-'));
      expect(testCategories.length).toBe(1);
      expect(testCategories[0].name).toBe('Featured');
    });

    it('should not return inactive featured categories', async () => {
      await createCategoryDirect({ name: 'Inactive Featured', slug: 'test-inactive-featured', is_featured: true, is_active: false });

      const featured = await categoryModel.findFeatured();

      const testCategories = featured.filter(c => c.slug.startsWith('test-'));
      expect(testCategories.length).toBe(0);
    });

    it('should order by display_order', async () => {
      await createCategoryDirect({ name: 'Second Featured', slug: 'test-second-featured', is_featured: true, display_order: 2 });
      await createCategoryDirect({ name: 'First Featured', slug: 'test-first-featured', is_featured: true, display_order: 1 });

      const featured = await categoryModel.findFeatured();

      const testCategories = featured.filter(c => c.slug.startsWith('test-'));
      expect(testCategories[0].name).toBe('First Featured');
    });

    it('should limit to 10 results', async () => {
      // Create 12 featured categories
      for (let i = 0; i < 12; i++) {
        await createCategoryDirect({
          name: `Featured ${i}`,
          slug: `test-featured-${i}`,
          is_featured: true,
        });
      }

      const featured = await categoryModel.findFeatured();

      expect(featured.length).toBeLessThanOrEqual(10);
    });
  });

  // ==========================================================================
  // getCategoryTree
  // ==========================================================================
  describe('getCategoryTree', () => {
    it('should return hierarchical category structure', async () => {
      const parent1 = await createCategoryDirect({ name: 'Parent 1', slug: 'test-tree-parent-1' });
      const parent2 = await createCategoryDirect({ name: 'Parent 2', slug: 'test-tree-parent-2' });
      await createCategoryDirect({ name: 'Child 1.1', slug: 'test-tree-child-1-1', parent_id: parent1.id });
      await createCategoryDirect({ name: 'Child 1.2', slug: 'test-tree-child-1-2', parent_id: parent1.id });
      await createCategoryDirect({ name: 'Child 2.1', slug: 'test-tree-child-2-1', parent_id: parent2.id });

      const tree = await categoryModel.getCategoryTree();

      const testParents = tree.filter(c => c.slug.startsWith('test-tree-parent'));
      expect(testParents.length).toBe(2);

      const parent1InTree = testParents.find(p => p.slug === 'test-tree-parent-1');
      expect(parent1InTree.children.length).toBe(2);

      const parent2InTree = testParents.find(p => p.slug === 'test-tree-parent-2');
      expect(parent2InTree.children.length).toBe(1);
    });

    it('should only include active categories', async () => {
      const parent = await createCategoryDirect({ name: 'Active Parent', slug: 'test-tree-active', is_active: true });
      await createCategoryDirect({ name: 'Active Child', slug: 'test-tree-active-child', parent_id: parent.id, is_active: true });
      await createCategoryDirect({ name: 'Inactive Child', slug: 'test-tree-inactive-child', parent_id: parent.id, is_active: false });

      const tree = await categoryModel.getCategoryTree();

      const testParent = tree.find(c => c.slug === 'test-tree-active');
      expect(testParent.children.length).toBe(1);
      expect(testParent.children[0].name).toBe('Active Child');
    });

    it('should order by display_order', async () => {
      await createCategoryDirect({ name: 'Second', slug: 'test-tree-second', display_order: 2 });
      await createCategoryDirect({ name: 'First', slug: 'test-tree-first', display_order: 1 });

      const tree = await categoryModel.getCategoryTree();

      const testCategories = tree.filter(c => c.slug.startsWith('test-tree-'));
      expect(testCategories[0].name).toBe('First');
      expect(testCategories[1].name).toBe('Second');
    });
  });

  // ==========================================================================
  // create (inherited from BaseModel)
  // ==========================================================================
  describe('create', () => {
    it('should create a new category', async () => {
      const category = await categoryModel.create({
        name: 'New Category',
        slug: 'test-new-category',
      });

      expect(category.id).toBeDefined();
      expect(category.name).toBe('New Category');
      expect(category.slug).toBe('test-new-category');

      // Verify in database
      const dbResult = await pool.query('SELECT * FROM event_categories WHERE id = $1', [category.id]);
      expect(dbResult.rows.length).toBe(1);
    });

    it('should set default values', async () => {
      const category = await categoryModel.create({
        name: 'Defaults Test',
        slug: 'test-defaults',
      });

      const dbResult = await pool.query('SELECT * FROM event_categories WHERE id = $1', [category.id]);
      expect(dbResult.rows[0].is_active).toBe(true);
      expect(dbResult.rows[0].is_featured).toBe(false);
      expect(dbResult.rows[0].display_order).toBe(0);
      expect(dbResult.rows[0].event_count).toBe(0);
    });
  });

  // ==========================================================================
  // Unique constraint
  // ==========================================================================
  describe('unique constraint', () => {
    it('should enforce unique slug', async () => {
      await createCategoryDirect({ name: 'First', slug: 'test-unique-slug' });

      await expect(
        createCategoryDirect({ name: 'Second', slug: 'test-unique-slug' })
      ).rejects.toThrow();
    });
  });

  // ==========================================================================
  // Self-referential FK (parent_id)
  // ==========================================================================
  describe('self-referential FK', () => {
    it('should allow setting parent_id to another category', async () => {
      const parent = await createCategoryDirect({ name: 'Parent', slug: 'test-self-ref-parent' });
      const child = await createCategoryDirect({ name: 'Child', slug: 'test-self-ref-child', parent_id: parent.id });

      expect(child.parent_id).toBe(parent.id);
    });

    it('should set parent_id to null when parent is deleted', async () => {
      const parent = await createCategoryDirect({ name: 'Parent', slug: 'test-delete-parent' });
      const child = await createCategoryDirect({ name: 'Child', slug: 'test-orphan-child', parent_id: parent.id });

      await pool.query('DELETE FROM event_categories WHERE id = $1', [parent.id]);

      const dbResult = await pool.query('SELECT parent_id FROM event_categories WHERE id = $1', [child.id]);
      expect(dbResult.rows[0].parent_id).toBeNull();
    });
  });
});
