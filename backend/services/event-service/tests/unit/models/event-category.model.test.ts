/**
 * Unit tests for EventCategoryModel
 * Tests category hierarchy and tree operations
 */

import { EventCategoryModel, IEventCategory } from '../../../src/models/event-category.model';
import { createKnexMock, configureMockReturn, configureMockArray } from '../../__mocks__/knex.mock';

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

describe('EventCategoryModel', () => {
  let mockDb: any;
  let model: EventCategoryModel;

  const mockCategory: IEventCategory = {
    id: 'cat-123',
    name: 'Music',
    slug: 'music',
    description: 'Live music events',
    icon: 'music-note',
    color: '#FF5722',
    display_order: 1,
    is_active: true,
    is_featured: true,
    meta_title: 'Music Events',
    meta_description: 'Find live music events',
    event_count: 150,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockSubCategory: IEventCategory = {
    id: 'cat-456',
    parent_id: 'cat-123',
    name: 'Rock',
    slug: 'rock',
    description: 'Rock music events',
    display_order: 1,
    is_active: true,
    is_featured: false,
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(() => {
    mockDb = createKnexMock();
    model = new EventCategoryModel(mockDb);
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with event_categories table', () => {
      expect(model).toBeInstanceOf(EventCategoryModel);
      expect((model as any).tableName).toBe('event_categories');
    });
  });

  describe('findBySlug', () => {
    it('should find category by slug', async () => {
      configureMockReturn(mockDb, mockCategory);

      const result = await model.findBySlug('music');

      expect(mockDb).toHaveBeenCalledWith('event_categories');
      expect(mockDb._mockChain.where).toHaveBeenCalledWith({
        slug: 'music',
        is_active: true,
      });
      expect(mockDb._mockChain.first).toHaveBeenCalled();
      expect(result?.name).toBe('Music');
    });

    it('should return null when slug not found', async () => {
      configureMockReturn(mockDb, null);

      const result = await model.findBySlug('non-existent');

      expect(result).toBeNull();
    });

    it('should only return active categories', async () => {
      configureMockReturn(mockDb, mockCategory);

      await model.findBySlug('music');

      expect(mockDb._mockChain.where).toHaveBeenCalledWith(
        expect.objectContaining({ is_active: true })
      );
    });
  });

  describe('findTopLevel', () => {
    it('should find top-level categories without parent', async () => {
      const topCategories = [
        { ...mockCategory, id: 'cat-1', name: 'Music' },
        { ...mockCategory, id: 'cat-2', name: 'Sports' },
        { ...mockCategory, id: 'cat-3', name: 'Arts' },
      ];
      configureMockArray(mockDb, topCategories);

      const result = await model.findTopLevel();

      expect(mockDb).toHaveBeenCalledWith('event_categories');
      expect(mockDb._mockChain.whereNull).toHaveBeenCalledWith('parent_id');
      expect(mockDb._mockChain.where).toHaveBeenCalledWith({ is_active: true });
      expect(result).toHaveLength(3);
    });

    it('should order by display_order and name', async () => {
      configureMockArray(mockDb, [mockCategory]);

      await model.findTopLevel();

      expect(mockDb._mockChain.orderBy).toHaveBeenCalledWith('display_order', 'asc');
      expect(mockDb._mockChain.orderBy).toHaveBeenCalledWith('name', 'asc');
    });

    it('should return empty array when no top-level categories', async () => {
      configureMockArray(mockDb, []);

      const result = await model.findTopLevel();

      expect(result).toEqual([]);
    });
  });

  describe('findByParentId', () => {
    it('should find child categories by parent ID', async () => {
      const subCategories = [
        { ...mockSubCategory, id: 'sub-1', name: 'Rock' },
        { ...mockSubCategory, id: 'sub-2', name: 'Jazz' },
        { ...mockSubCategory, id: 'sub-3', name: 'Pop' },
      ];
      configureMockArray(mockDb, subCategories);

      const result = await model.findByParentId('cat-123');

      expect(mockDb).toHaveBeenCalledWith('event_categories');
      expect(mockDb._mockChain.where).toHaveBeenCalledWith({
        parent_id: 'cat-123',
        is_active: true,
      });
      expect(result).toHaveLength(3);
    });

    it('should order by display_order', async () => {
      configureMockArray(mockDb, [mockSubCategory]);

      await model.findByParentId('cat-123');

      expect(mockDb._mockChain.orderBy).toHaveBeenCalledWith('display_order', 'asc');
    });

    it('should return empty array when no children', async () => {
      configureMockArray(mockDb, []);

      const result = await model.findByParentId('cat-123');

      expect(result).toEqual([]);
    });
  });

  describe('findFeatured', () => {
    it('should find featured categories', async () => {
      const featured = [
        { ...mockCategory, id: 'cat-1', is_featured: true },
        { ...mockCategory, id: 'cat-2', is_featured: true },
      ];
      configureMockArray(mockDb, featured);

      const result = await model.findFeatured();

      expect(mockDb).toHaveBeenCalledWith('event_categories');
      expect(mockDb._mockChain.where).toHaveBeenCalledWith({
        is_active: true,
        is_featured: true,
      });
      expect(result).toHaveLength(2);
    });

    it('should order by display_order', async () => {
      configureMockArray(mockDb, [mockCategory]);

      await model.findFeatured();

      expect(mockDb._mockChain.orderBy).toHaveBeenCalledWith('display_order', 'asc');
    });

    it('should limit to 10 results', async () => {
      configureMockArray(mockDb, [mockCategory]);

      await model.findFeatured();

      expect(mockDb._mockChain.limit).toHaveBeenCalledWith(10);
    });

    it('should return empty array when no featured categories', async () => {
      configureMockArray(mockDb, []);

      const result = await model.findFeatured();

      expect(result).toEqual([]);
    });
  });

  describe('getCategoryTree', () => {
    it('should build category tree with children', async () => {
      const allCategories = [
        { ...mockCategory, id: 'cat-1', parent_id: null, name: 'Music' },
        { ...mockSubCategory, id: 'sub-1', parent_id: 'cat-1', name: 'Rock' },
        { ...mockSubCategory, id: 'sub-2', parent_id: 'cat-1', name: 'Jazz' },
        { ...mockCategory, id: 'cat-2', parent_id: null, name: 'Sports' },
        { ...mockSubCategory, id: 'sub-3', parent_id: 'cat-2', name: 'Football' },
      ];
      configureMockArray(mockDb, allCategories);

      const result = await model.getCategoryTree();

      expect(mockDb).toHaveBeenCalledWith('event_categories');
      expect(mockDb._mockChain.where).toHaveBeenCalledWith({ is_active: true });
      expect(mockDb._mockChain.orderBy).toHaveBeenCalledWith('display_order', 'asc');
      
      // Should return top-level with children nested
      expect(result).toHaveLength(2);
      expect(result[0].children).toBeDefined();
    });

    it('should handle categories with no children', async () => {
      const categories = [
        { ...mockCategory, id: 'cat-1', parent_id: null, name: 'Music' },
        { ...mockCategory, id: 'cat-2', parent_id: null, name: 'Sports' },
      ];
      configureMockArray(mockDb, categories);

      const result = await model.getCategoryTree();

      expect(result).toHaveLength(2);
      expect(result[0].children).toEqual([]);
      expect(result[1].children).toEqual([]);
    });

    it('should return empty array when no categories', async () => {
      configureMockArray(mockDb, []);

      const result = await model.getCategoryTree();

      expect(result).toEqual([]);
    });

    it('should correctly nest children under parents', async () => {
      const allCategories = [
        { id: 'cat-1', parent_id: null, name: 'Music', is_active: true },
        { id: 'sub-1', parent_id: 'cat-1', name: 'Rock', is_active: true },
        { id: 'sub-2', parent_id: 'cat-1', name: 'Jazz', is_active: true },
      ];
      configureMockArray(mockDb, allCategories);

      const result = await model.getCategoryTree();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Music');
      expect(result[0].children).toHaveLength(2);
    });
  });

  describe('inherited BaseModel methods', () => {
    describe('findById', () => {
      it('should find category by ID', async () => {
        configureMockReturn(mockDb, mockCategory);

        const result = await model.findById('cat-123');

        expect(mockDb._mockChain.where).toHaveBeenCalledWith({ id: 'cat-123' });
        expect(result?.name).toBe('Music');
      });
    });

    describe('create', () => {
      it('should create new category', async () => {
        mockDb._mockChain.returning.mockResolvedValue([mockCategory]);

        const result = await model.create({
          name: 'Theater',
          slug: 'theater',
        });

        expect(mockDb._mockChain.insert).toHaveBeenCalled();
        expect(result.name).toBe('Music');
      });
    });

    describe('update', () => {
      it('should update category', async () => {
        const updated = { ...mockCategory, name: 'Updated Music' };
        mockDb._mockChain.returning.mockResolvedValue([updated]);

        const result = await model.update('cat-123', { name: 'Updated Music' });

        expect(result?.name).toBe('Updated Music');
      });
    });

    describe('count', () => {
      it('should count categories', async () => {
        mockDb._mockChain.first.mockResolvedValue({ count: '25' });

        const result = await model.count();

        expect(result).toBe(25);
      });
    });
  });

  describe('category scenarios', () => {
    it('should handle multi-level hierarchy', async () => {
      const hierarchicalCategories = [
        { id: 'lvl-1', parent_id: null, name: 'Level 1', is_active: true },
        { id: 'lvl-2', parent_id: 'lvl-1', name: 'Level 2', is_active: true },
        // Note: getCategoryTree only supports 2 levels in current implementation
      ];
      configureMockArray(mockDb, hierarchicalCategories);

      const result = await model.getCategoryTree();

      expect(result[0].children).toHaveLength(1);
    });

    it('should handle category with SEO metadata', async () => {
      const seoCategory: IEventCategory = {
        ...mockCategory,
        meta_title: 'Best Music Events | TicketToken',
        meta_description: 'Discover and book the best music events in your area',
      };
      configureMockReturn(mockDb, seoCategory);

      const result = await model.findBySlug('music');

      expect(result?.meta_title).toBe('Best Music Events | TicketToken');
      expect(result?.meta_description).toBeDefined();
    });

    it('should handle category with styling (icon and color)', async () => {
      const styledCategory: IEventCategory = {
        ...mockCategory,
        icon: 'music-note',
        color: '#FF5722',
      };
      configureMockReturn(mockDb, styledCategory);

      const result = await model.findBySlug('music');

      expect(result?.icon).toBe('music-note');
      expect(result?.color).toBe('#FF5722');
    });

    it('should handle category with event count', async () => {
      const categoryWithCount: IEventCategory = {
        ...mockCategory,
        event_count: 250,
      };
      configureMockReturn(mockDb, categoryWithCount);

      const result = await model.findBySlug('music');

      expect(result?.event_count).toBe(250);
    });
  });

  describe('edge cases', () => {
    it('should handle category with minimal fields', async () => {
      const minimalCategory: IEventCategory = {
        id: 'cat-min',
        name: 'Minimal',
        slug: 'minimal',
      };
      configureMockReturn(mockDb, minimalCategory);

      const result = await model.findById('cat-min');

      expect(result?.name).toBe('Minimal');
      expect(result?.description).toBeUndefined();
      expect(result?.icon).toBeUndefined();
    });

    it('should handle empty slug search', async () => {
      configureMockReturn(mockDb, null);

      const result = await model.findBySlug('');

      expect(result).toBeNull();
    });

    it('should handle special characters in slug', async () => {
      const specialCategory: IEventCategory = {
        ...mockCategory,
        slug: 'rock-roll-80s',
      };
      configureMockReturn(mockDb, specialCategory);

      const result = await model.findBySlug('rock-roll-80s');

      expect(result?.slug).toBe('rock-roll-80s');
    });

    it('should handle category with display_order = 0', async () => {
      const firstCategory: IEventCategory = {
        ...mockCategory,
        display_order: 0,
      };
      configureMockReturn(mockDb, firstCategory);

      const result = await model.findById('cat-123');

      expect(result?.display_order).toBe(0);
    });

    it('should handle inactive parent with active children', async () => {
      // This scenario tests data integrity - active children with inactive parent
      const categories = [
        { id: 'cat-1', parent_id: null, name: 'Inactive', is_active: false },
        { id: 'sub-1', parent_id: 'cat-1', name: 'Active Child', is_active: true },
      ];
      // Since findTopLevel filters by is_active, inactive parent won't appear
      configureMockArray(mockDb, [categories[1]]);

      const result = await model.findByParentId('cat-1');

      expect(result).toHaveLength(1);
    });

    it('should handle category with zero event count', async () => {
      const emptyCategory: IEventCategory = {
        ...mockCategory,
        event_count: 0,
      };
      configureMockReturn(mockDb, emptyCategory);

      const result = await model.findBySlug('empty-category');

      expect(result?.event_count).toBe(0);
    });
  });
});
