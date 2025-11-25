import { LayoutModel } from '../../../src/models/layout.model';

describe('LayoutModel', () => {
  let layoutModel: LayoutModel;
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();

    const mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      whereNull: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      first: jest.fn(),
    };

    mockDb = Object.assign(jest.fn().mockReturnValue(mockQueryBuilder), {
      _mockQueryBuilder: mockQueryBuilder,
      transaction: jest.fn(),
    });

    layoutModel = new LayoutModel(mockDb);
  });

  // =============================================================================
  // constructor() - 1 test case
  // =============================================================================

  describe('constructor()', () => {
    it('should set table name to venue_layouts', () => {
      expect((layoutModel as any).tableName).toBe('venue_layouts');
    });
  });

  // =============================================================================
  // findByVenue() - 3 test cases
  // =============================================================================

  describe('findByVenue()', () => {
    const mockLayouts = [
      { id: '1', venue_id: 'venue-1', is_default: true },
      { id: '2', venue_id: 'venue-1', is_default: false },
    ];

    it('should find all layouts for venue', async () => {
      // Second orderBy returns the final result
      mockDb._mockQueryBuilder.orderBy
        .mockReturnValueOnce(mockDb._mockQueryBuilder)
        .mockReturnValue(mockLayouts);

      const result = await layoutModel.findByVenue('venue-1');

      expect(result).toEqual(mockLayouts);
      expect(mockDb._mockQueryBuilder.where).toHaveBeenCalledWith({ venue_id: 'venue-1' });
    });

    it('should exclude soft-deleted layouts', async () => {
      mockDb._mockQueryBuilder.orderBy
        .mockReturnValueOnce(mockDb._mockQueryBuilder)
        .mockReturnValue(mockLayouts);

      await layoutModel.findByVenue('venue-1');

      expect(mockDb._mockQueryBuilder.whereNull).toHaveBeenCalledWith('deleted_at');
    });

    it('should order by is_default desc then created_at desc', async () => {
      mockDb._mockQueryBuilder.orderBy
        .mockReturnValueOnce(mockDb._mockQueryBuilder)
        .mockReturnValue(mockLayouts);

      await layoutModel.findByVenue('venue-1');

      expect(mockDb._mockQueryBuilder.orderBy).toHaveBeenCalledWith('is_default', 'desc');
      expect(mockDb._mockQueryBuilder.orderBy).toHaveBeenCalledWith('created_at', 'desc');
    });
  });

  // =============================================================================
  // getDefaultLayout() - 2 test cases
  // =============================================================================

  describe('getDefaultLayout()', () => {
    it('should find default layout for venue', async () => {
      const mockLayout = { id: '1', venue_id: 'venue-1', is_default: true };
      mockDb._mockQueryBuilder.first.mockResolvedValue(mockLayout);

      const result = await layoutModel.getDefaultLayout('venue-1');

      expect(result).toEqual(mockLayout);
      expect(mockDb._mockQueryBuilder.where).toHaveBeenCalledWith({
        venue_id: 'venue-1',
        is_default: true,
      });
    });

    it('should return undefined if no default layout', async () => {
      mockDb._mockQueryBuilder.first.mockResolvedValue(undefined);

      const result = await layoutModel.getDefaultLayout('venue-1');

      expect(result).toBeUndefined();
    });
  });

  // =============================================================================
  // setAsDefault() - 3 test cases
  // =============================================================================

  describe('setAsDefault()', () => {
    it('should use transaction', async () => {
      const mockTrxQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockResolvedValue(1),
      };
      const mockTrx = Object.assign(jest.fn().mockReturnValue(mockTrxQueryBuilder), {
        _mockQueryBuilder: mockTrxQueryBuilder,
      });

      mockDb.transaction.mockImplementation(async (callback: any) => {
        return callback(mockTrx);
      });

      await layoutModel.setAsDefault('layout-1', 'venue-1');

      expect(mockDb.transaction).toHaveBeenCalled();
    });

    it('should unset all default layouts for venue', async () => {
      const mockTrxQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockResolvedValue(1),
      };
      const mockTrx = Object.assign(jest.fn().mockReturnValue(mockTrxQueryBuilder), {
        _mockQueryBuilder: mockTrxQueryBuilder,
      });

      mockDb.transaction.mockImplementation(async (callback: any) => {
        return callback(mockTrx);
      });

      await layoutModel.setAsDefault('layout-1', 'venue-1');

      expect(mockTrxQueryBuilder.where).toHaveBeenCalledWith({ venue_id: 'venue-1' });
      expect(mockTrxQueryBuilder.update).toHaveBeenCalledWith({ is_default: false });
    });

    it('should set specified layout as default', async () => {
      const mockTrxQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockResolvedValue(1),
      };
      const mockTrx = Object.assign(jest.fn().mockReturnValue(mockTrxQueryBuilder), {
        _mockQueryBuilder: mockTrxQueryBuilder,
      });

      mockDb.transaction.mockImplementation(async (callback: any) => {
        return callback(mockTrx);
      });

      await layoutModel.setAsDefault('layout-1', 'venue-1');

      expect(mockTrxQueryBuilder.where).toHaveBeenCalledWith({
        id: 'layout-1',
        venue_id: 'venue-1',
      });
      expect(mockTrxQueryBuilder.update).toHaveBeenCalledWith({ is_default: true });
    });
  });
});
