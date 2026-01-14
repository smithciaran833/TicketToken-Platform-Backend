/**
 * Unit tests for LayoutModel
 * Tests venue layout management (extends BaseModel with deleted_at)
 */

import { createKnexMock, configureMockReturn } from '../../__mocks__/knex.mock';
import { LayoutModel, ILayout } from '../../../src/models/layout.model';

describe('LayoutModel', () => {
  let mockKnex: any;
  let layoutModel: LayoutModel;

  const sampleLayout: ILayout = {
    id: 'layout-123',
    venue_id: 'venue-456',
    name: 'Main Floor Layout',
    type: 'general_admission',
    sections: [
      { id: 'section-1', name: 'VIP', rows: 5, seatsPerRow: 20, pricing: { basePrice: 100 } },
      { id: 'section-2', name: 'General', rows: 10, seatsPerRow: 30, pricing: { basePrice: 50 } },
    ],
    capacity: 500,
    is_default: true,
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-06-01'),
  };

  beforeEach(() => {
    mockKnex = createKnexMock();
    layoutModel = new LayoutModel(mockKnex);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with venue_layouts table name', () => {
      expect((layoutModel as any).tableName).toBe('venue_layouts');
    });
  });

  describe('findById (inherited from BaseModel)', () => {
    it('should find layout by id with soft delete filter', async () => {
      mockKnex._mockChain.first.mockResolvedValue(sampleLayout);

      const result = await layoutModel.findById('layout-123');

      expect(mockKnex).toHaveBeenCalledWith('venue_layouts');
      expect(mockKnex._mockChain.where).toHaveBeenCalledWith({ id: 'layout-123' });
      expect(mockKnex._mockChain.whereNull).toHaveBeenCalledWith('deleted_at');
      expect(result).toEqual(sampleLayout);
    });

    it('should return null when layout not found', async () => {
      mockKnex._mockChain.first.mockResolvedValue(null);

      const result = await layoutModel.findById('non-existent');

      expect(result).toBeNull();
    });

    it('should find layout with specific columns', async () => {
      mockKnex._mockChain.first.mockResolvedValue({ id: 'layout-123', name: 'Main' });

      await layoutModel.findById('layout-123', ['id', 'name']);

      expect(mockKnex._mockChain.select).toHaveBeenCalledWith(['id', 'name']);
    });
  });

  describe('findByVenue', () => {
    it('should find layouts for venue with soft delete filter', async () => {
      configureMockReturn(mockKnex, [sampleLayout, { ...sampleLayout, id: 'layout-456' }]);

      const result = await layoutModel.findByVenue('venue-456');

      expect(mockKnex).toHaveBeenCalledWith('venue_layouts');
      expect(mockKnex._mockChain.where).toHaveBeenCalledWith({ venue_id: 'venue-456' });
      expect(mockKnex._mockChain.whereNull).toHaveBeenCalledWith('deleted_at');
      expect(mockKnex._mockChain.orderBy).toHaveBeenCalledWith('is_default', 'desc');
      expect(mockKnex._mockChain.orderBy).toHaveBeenCalledWith('created_at', 'desc');
      expect(result).toHaveLength(2);
    });

    it('should return empty array when no layouts', async () => {
      configureMockReturn(mockKnex, []);

      const result = await layoutModel.findByVenue('venue-999');

      expect(result).toEqual([]);
    });
  });

  describe('getDefaultLayout', () => {
    it('should find default layout for venue', async () => {
      mockKnex._mockChain.first.mockResolvedValue(sampleLayout);

      const result = await layoutModel.getDefaultLayout('venue-456');

      expect(mockKnex).toHaveBeenCalledWith('venue_layouts');
      expect(mockKnex._mockChain.where).toHaveBeenCalledWith({ venue_id: 'venue-456', is_default: true });
      expect(mockKnex._mockChain.whereNull).toHaveBeenCalledWith('deleted_at');
      expect(result).toEqual(sampleLayout);
    });

    it('should return undefined when no default layout', async () => {
      mockKnex._mockChain.first.mockResolvedValue(undefined);

      const result = await layoutModel.getDefaultLayout('venue-999');

      expect(result).toBeUndefined();
    });
  });

  describe('setAsDefault', () => {
    it('should unset all defaults and set new default in transaction', async () => {
      const mockTrx = jest.fn((tableName: string) => mockKnex(tableName));
      mockKnex.transaction = jest.fn((callback: any) => callback(mockTrx));
      mockKnex._mockChain.update.mockResolvedValue(1);

      await layoutModel.setAsDefault('layout-123', 'venue-456');

      expect(mockKnex.transaction).toHaveBeenCalled();
    });
  });

  describe('create (inherited from BaseModel)', () => {
    it('should create layout', async () => {
      mockKnex._mockChain.returning.mockResolvedValue([sampleLayout]);

      const result = await layoutModel.create({
        venue_id: 'venue-456',
        name: 'New Layout',
        type: 'fixed',
        capacity: 200,
        is_default: false,
      });

      expect(mockKnex._mockChain.insert).toHaveBeenCalled();
      expect(result).toEqual(sampleLayout);
    });
  });

  describe('update (inherited from BaseModel)', () => {
    it('should update layout and return result', async () => {
      const updatedLayout = { ...sampleLayout, name: 'Updated Layout' };
      mockKnex._mockChain.returning.mockResolvedValue([updatedLayout]);

      const result = await layoutModel.update('layout-123', { name: 'Updated Layout' });

      expect(mockKnex._mockChain.where).toHaveBeenCalledWith({ id: 'layout-123' });
      expect(mockKnex._mockChain.whereNull).toHaveBeenCalledWith('deleted_at');
      expect(result.name).toBe('Updated Layout');
    });

    it('should set updated_at timestamp', async () => {
      mockKnex._mockChain.returning.mockResolvedValue([sampleLayout]);

      await layoutModel.update('layout-123', { name: 'Test' });

      const updateCall = mockKnex._mockChain.update.mock.calls[0][0];
      expect(updateCall.updated_at).toBeInstanceOf(Date);
    });
  });

  describe('softDelete (inherited from BaseModel)', () => {
    it('should set deleted_at timestamp', async () => {
      mockKnex._mockChain.update.mockResolvedValue(1);

      const result = await layoutModel.softDelete('layout-123');

      expect(mockKnex._mockChain.where).toHaveBeenCalledWith({ id: 'layout-123' });
      expect(mockKnex._mockChain.whereNull).toHaveBeenCalledWith('deleted_at');
      expect(mockKnex._mockChain.update).toHaveBeenCalledWith(expect.objectContaining({
        deleted_at: expect.any(Date),
      }));
      expect(result).toBe(true);
    });

    it('should return false when layout not found', async () => {
      mockKnex._mockChain.update.mockResolvedValue(0);

      const result = await layoutModel.softDelete('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('delete (inherited from BaseModel)', () => {
    it('should soft delete via deleted_at', async () => {
      mockKnex._mockChain.update.mockResolvedValue(1);

      await layoutModel.delete('layout-123');

      expect(mockKnex._mockChain.where).toHaveBeenCalledWith({ id: 'layout-123' });
      expect(mockKnex._mockChain.update).toHaveBeenCalledWith(expect.objectContaining({
        deleted_at: expect.any(Date),
      }));
    });
  });

  describe('count (inherited from BaseModel)', () => {
    it('should count layouts for venue', async () => {
      mockKnex._mockChain.first.mockResolvedValue({ count: '5' });

      const result = await layoutModel.count({ venue_id: 'venue-456' });

      expect(mockKnex._mockChain.where).toHaveBeenCalledWith({ venue_id: 'venue-456' });
      expect(mockKnex._mockChain.whereNull).toHaveBeenCalledWith('deleted_at');
      expect(result).toBe(5);
    });
  });

  describe('withTransaction', () => {
    it('should create new instance with transaction', () => {
      const trxMock = createKnexMock();
      const transactionalModel = layoutModel.withTransaction(trxMock);

      expect(transactionalModel).toBeInstanceOf(LayoutModel);
      expect((transactionalModel as any).db).toBe(trxMock);
    });
  });

  describe('ILayout interface', () => {
    it('should have correct structure', () => {
      const layout: ILayout = {
        venue_id: 'venue-123',
        name: 'Test Layout',
        type: 'fixed',
        capacity: 100,
        is_default: false,
      };

      expect(layout.venue_id).toBe('venue-123');
      expect(layout.name).toBe('Test Layout');
      expect(layout.type).toBe('fixed');
      expect(layout.capacity).toBe(100);
      expect(layout.is_default).toBe(false);
    });

    it('should support optional sections', () => {
      const layoutWithSections: ILayout = {
        venue_id: 'venue-123',
        name: 'Test Layout',
        type: 'fixed',
        capacity: 100,
        is_default: false,
        sections: [
          { id: 's1', name: 'Section A', rows: 10, seatsPerRow: 20 },
        ],
      };

      expect(layoutWithSections.sections).toBeDefined();
      expect(layoutWithSections.sections?.[0].name).toBe('Section A');
    });

    it('should support type enum values', () => {
      const fixedLayout: ILayout = { venue_id: 'v', name: 'n', type: 'fixed', capacity: 1, is_default: false };
      const gaLayout: ILayout = { venue_id: 'v', name: 'n', type: 'general_admission', capacity: 1, is_default: false };
      const mixedLayout: ILayout = { venue_id: 'v', name: 'n', type: 'mixed', capacity: 1, is_default: false };

      expect(fixedLayout.type).toBe('fixed');
      expect(gaLayout.type).toBe('general_admission');
      expect(mixedLayout.type).toBe('mixed');
    });
  });
});
