import { EventCategoryModel } from '../../../src/models/event-category.model';
import { Knex } from 'knex';

describe('Event Category Model', () => {
  let mockDb: any;
  let categoryModel: EventCategoryModel;
  let mockQueryBuilder: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      whereNull: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(null),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
    };

    // Make orderBy resolve on the last call
    mockQueryBuilder.orderBy.mockImplementation(function(this: any) {
      return this;
    });

    mockDb = jest.fn(() => mockQueryBuilder);
    categoryModel = new EventCategoryModel(mockDb as any);
  });

  describe('findBySlug', () => {
    it('should find category by slug', async () => {
      const mockCategory = { id: '1', slug: 'concerts', name: 'Concerts' };
      mockQueryBuilder.first.mockResolvedValue(mockCategory);

      const result = await categoryModel.findBySlug('concerts');

      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ slug: 'concerts', is_active: true });
      expect(result).toEqual(mockCategory);
    });
  });

  describe('findTopLevel', () => {
    it('should find top level categories', async () => {
      const mockCategories = [{ id: '1', name: 'Music' }];
      
      // Mock the final orderBy to return the result
      let orderByCallCount = 0;
      mockQueryBuilder.orderBy.mockImplementation(function(this: any) {
        orderByCallCount++;
        if (orderByCallCount === 2) {
          return Promise.resolve(mockCategories);
        }
        return this;
      });

      const result = await categoryModel.findTopLevel();

      expect(mockQueryBuilder.whereNull).toHaveBeenCalledWith('parent_id');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ is_active: true });
      expect(result).toEqual(mockCategories);
    });
  });

  describe('findByParentId', () => {
    it('should find subcategories by parent id', async () => {
      const mockCategories = [{ id: '2', parent_id: 'parent-1' }];
      mockQueryBuilder.orderBy.mockResolvedValue(mockCategories);

      const result = await categoryModel.findByParentId('parent-1');

      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ parent_id: 'parent-1', is_active: true });
      expect(result).toEqual(mockCategories);
    });
  });

  describe('findFeatured', () => {
    it('should find featured categories', async () => {
      const mockCategories = [{ id: '1', is_featured: true }];
      mockQueryBuilder.limit.mockResolvedValue(mockCategories);

      const result = await categoryModel.findFeatured();

      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ is_active: true, is_featured: true });
      expect(mockQueryBuilder.limit).toHaveBeenCalledWith(10);
      expect(result).toEqual(mockCategories);
    });
  });

  describe('getCategoryTree', () => {
    it('should build category tree', async () => {
      const mockCategories = [
        { id: '1', name: 'Music', parent_id: null },
        { id: '2', name: 'Rock', parent_id: '1' },
      ];
      mockQueryBuilder.orderBy.mockResolvedValue(mockCategories);

      const result = await categoryModel.getCategoryTree();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Music');
      expect(result[0].children).toHaveLength(1);
    });
  });
});
