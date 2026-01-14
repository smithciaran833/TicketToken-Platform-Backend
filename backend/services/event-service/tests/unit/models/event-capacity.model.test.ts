/**
 * Unit tests for EventCapacityModel
 * Tests capacity management operations
 */

import { EventCapacityModel, IEventCapacity } from '../../../src/models/event-capacity.model';
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

describe('EventCapacityModel', () => {
  let mockDb: any;
  let model: EventCapacityModel;

  const mockCapacity: IEventCapacity = {
    id: 'cap-123',
    tenant_id: 'tenant-1',
    event_id: 'event-123',
    schedule_id: 'schedule-1',
    section_name: 'General Admission',
    section_code: 'GA',
    tier: 'standard',
    total_capacity: 1000,
    available_capacity: 800,
    reserved_capacity: 50,
    buffer_capacity: 50,
    sold_count: 150,
    pending_count: 0,
    is_active: true,
    is_visible: true,
    minimum_purchase: 1,
    maximum_purchase: 10,
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(() => {
    mockDb = createKnexMock();
    model = new EventCapacityModel(mockDb);
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with event_capacity table', () => {
      expect(model).toBeInstanceOf(EventCapacityModel);
      expect((model as any).tableName).toBe('event_capacity');
    });
  });

  describe('findByEventId', () => {
    it('should find capacities by event ID', async () => {
      configureMockArray(mockDb, [mockCapacity]);

      const result = await model.findByEventId('event-123');

      expect(mockDb).toHaveBeenCalledWith('event_capacity');
      expect(mockDb._mockChain.where).toHaveBeenCalledWith({
        event_id: 'event-123',
        is_active: true,
      });
      expect(mockDb._mockChain.orderBy).toHaveBeenCalledWith('section_name', 'asc');
      expect(result).toHaveLength(1);
      expect(result[0].section_name).toBe('General Admission');
    });

    it('should return empty array when no capacities found', async () => {
      configureMockArray(mockDb, []);

      const result = await model.findByEventId('non-existent');

      expect(result).toEqual([]);
    });

    it('should only return active capacities', async () => {
      configureMockArray(mockDb, [mockCapacity]);

      await model.findByEventId('event-123');

      expect(mockDb._mockChain.where).toHaveBeenCalledWith(
        expect.objectContaining({ is_active: true })
      );
    });
  });

  describe('findByScheduleId', () => {
    it('should find capacities by schedule ID', async () => {
      configureMockArray(mockDb, [mockCapacity]);

      const result = await model.findByScheduleId('schedule-1');

      expect(mockDb).toHaveBeenCalledWith('event_capacity');
      expect(mockDb._mockChain.where).toHaveBeenCalledWith({
        schedule_id: 'schedule-1',
        is_active: true,
      });
      expect(mockDb._mockChain.orderBy).toHaveBeenCalledWith('section_name', 'asc');
      expect(result).toHaveLength(1);
    });

    it('should return empty array when no capacities found', async () => {
      configureMockArray(mockDb, []);

      const result = await model.findByScheduleId('non-existent');

      expect(result).toEqual([]);
    });
  });

  describe('getTotalCapacity', () => {
    it('should sum total capacity for an event', async () => {
      mockDb._mockChain.first.mockResolvedValue({ total: '1500' });

      const result = await model.getTotalCapacity('event-123');

      expect(mockDb).toHaveBeenCalledWith('event_capacity');
      expect(mockDb._mockChain.where).toHaveBeenCalledWith({
        event_id: 'event-123',
        is_active: true,
      });
      expect(mockDb._mockChain.sum).toHaveBeenCalledWith('total_capacity as total');
      expect(result).toBe(1500);
    });

    it('should filter by schedule ID when provided', async () => {
      mockDb._mockChain.first.mockResolvedValue({ total: '500' });

      const result = await model.getTotalCapacity('event-123', 'schedule-1');

      expect(mockDb._mockChain.where).toHaveBeenCalledWith({ schedule_id: 'schedule-1' });
      expect(result).toBe(500);
    });

    it('should return 0 when no capacity records exist', async () => {
      mockDb._mockChain.first.mockResolvedValue({ total: null });

      const result = await model.getTotalCapacity('event-123');

      expect(result).toBe(0);
    });

    it('should return 0 when result is undefined', async () => {
      mockDb._mockChain.first.mockResolvedValue(undefined);

      const result = await model.getTotalCapacity('event-123');

      expect(result).toBe(0);
    });

    it('should parse string total correctly', async () => {
      mockDb._mockChain.first.mockResolvedValue({ total: '2500' });

      const result = await model.getTotalCapacity('event-123');

      expect(result).toBe(2500);
    });
  });

  describe('getAvailableCapacity', () => {
    it('should sum available capacity for an event', async () => {
      mockDb._mockChain.first.mockResolvedValue({ available: '800' });

      const result = await model.getAvailableCapacity('event-123');

      expect(mockDb).toHaveBeenCalledWith('event_capacity');
      expect(mockDb._mockChain.where).toHaveBeenCalledWith({
        event_id: 'event-123',
        is_active: true,
      });
      expect(mockDb._mockChain.sum).toHaveBeenCalledWith('available_capacity as available');
      expect(result).toBe(800);
    });

    it('should filter by schedule ID when provided', async () => {
      mockDb._mockChain.first.mockResolvedValue({ available: '300' });

      const result = await model.getAvailableCapacity('event-123', 'schedule-1');

      expect(mockDb._mockChain.where).toHaveBeenCalledWith({ schedule_id: 'schedule-1' });
      expect(result).toBe(300);
    });

    it('should return 0 when no available capacity', async () => {
      mockDb._mockChain.first.mockResolvedValue({ available: '0' });

      const result = await model.getAvailableCapacity('event-123');

      expect(result).toBe(0);
    });

    it('should return 0 when result is null', async () => {
      mockDb._mockChain.first.mockResolvedValue({ available: null });

      const result = await model.getAvailableCapacity('event-123');

      expect(result).toBe(0);
    });
  });

  describe('updateSoldCount', () => {
    it('should increment sold_count by quantity', async () => {
      await model.updateSoldCount('cap-123', 5);

      expect(mockDb).toHaveBeenCalledWith('event_capacity');
      expect(mockDb._mockChain.where).toHaveBeenCalledWith({ id: 'cap-123' });
      expect(mockDb._mockChain.increment).toHaveBeenCalledWith('sold_count', 5);
    });

    it('should increment sold_count by 1', async () => {
      await model.updateSoldCount('cap-123', 1);

      expect(mockDb._mockChain.increment).toHaveBeenCalledWith('sold_count', 1);
    });

    it('should increment sold_count by large quantity', async () => {
      await model.updateSoldCount('cap-123', 100);

      expect(mockDb._mockChain.increment).toHaveBeenCalledWith('sold_count', 100);
    });
  });

  describe('updatePendingCount', () => {
    it('should increment pending_count by quantity', async () => {
      await model.updatePendingCount('cap-123', 3);

      expect(mockDb).toHaveBeenCalledWith('event_capacity');
      expect(mockDb._mockChain.where).toHaveBeenCalledWith({ id: 'cap-123' });
      expect(mockDb._mockChain.increment).toHaveBeenCalledWith('pending_count', 3);
    });

    it('should increment pending_count by 1', async () => {
      await model.updatePendingCount('cap-123', 1);

      expect(mockDb._mockChain.increment).toHaveBeenCalledWith('pending_count', 1);
    });
  });

  describe('decrementPendingCount', () => {
    it('should decrement pending_count by quantity', async () => {
      await model.decrementPendingCount('cap-123', 2);

      expect(mockDb).toHaveBeenCalledWith('event_capacity');
      expect(mockDb._mockChain.where).toHaveBeenCalledWith({ id: 'cap-123' });
      expect(mockDb._mockChain.decrement).toHaveBeenCalledWith('pending_count', 2);
    });

    it('should decrement pending_count by 1', async () => {
      await model.decrementPendingCount('cap-123', 1);

      expect(mockDb._mockChain.decrement).toHaveBeenCalledWith('pending_count', 1);
    });
  });

  describe('inherited BaseModel methods', () => {
    describe('findById', () => {
      it('should find capacity by ID', async () => {
        configureMockReturn(mockDb, mockCapacity);

        const result = await model.findById('cap-123');

        expect(mockDb._mockChain.where).toHaveBeenCalledWith({ id: 'cap-123' });
        expect(result?.section_name).toBe('General Admission');
      });

      it('should return null when not found', async () => {
        configureMockReturn(mockDb, null);

        const result = await model.findById('non-existent');

        expect(result).toBeNull();
      });
    });

    describe('create', () => {
      it('should create new capacity record', async () => {
        mockDb._mockChain.returning.mockResolvedValue([mockCapacity]);

        const result = await model.create({
          event_id: 'event-123',
          section_name: 'VIP Section',
          total_capacity: 100,
          available_capacity: 100,
        });

        expect(mockDb._mockChain.insert).toHaveBeenCalled();
        expect(result.section_name).toBe('General Admission');
      });
    });

    describe('update', () => {
      it('should update capacity record', async () => {
        const updatedCapacity = { ...mockCapacity, available_capacity: 750 };
        mockDb._mockChain.returning.mockResolvedValue([updatedCapacity]);

        const result = await model.update('cap-123', { available_capacity: 750 });

        expect(mockDb._mockChain.where).toHaveBeenCalledWith({ id: 'cap-123' });
        expect(result?.available_capacity).toBe(750);
      });
    });

    describe('delete', () => {
      it('should soft delete capacity record', async () => {
        mockDb._mockChain.update.mockResolvedValue(1);

        const result = await model.delete('cap-123');

        expect(mockDb._mockChain.update).toHaveBeenCalledWith({
          deleted_at: expect.any(Date),
        });
        expect(result).toBe(true);
      });
    });
  });

  describe('capacity scenarios', () => {
    it('should handle multiple sections for an event', async () => {
      const sections = [
        { ...mockCapacity, id: 'cap-1', section_name: 'Floor', total_capacity: 500 },
        { ...mockCapacity, id: 'cap-2', section_name: 'Balcony', total_capacity: 300 },
        { ...mockCapacity, id: 'cap-3', section_name: 'VIP', total_capacity: 50 },
      ];
      configureMockArray(mockDb, sections);

      const result = await model.findByEventId('event-123');

      expect(result).toHaveLength(3);
    });

    it('should calculate correct total capacity with multiple sections', async () => {
      mockDb._mockChain.first.mockResolvedValue({ total: '850' });

      const result = await model.getTotalCapacity('event-123');

      expect(result).toBe(850);
    });

    it('should handle sold out section (available = 0)', async () => {
      const soldOutCapacity = { ...mockCapacity, available_capacity: 0 };
      configureMockArray(mockDb, [soldOutCapacity]);

      const result = await model.findByEventId('event-123');

      expect(result[0].available_capacity).toBe(0);
    });

    it('should handle capacity with locked price data', async () => {
      const lockedCapacity: IEventCapacity = {
        ...mockCapacity,
        locked_price_data: {
          pricing_id: 'price-1',
          locked_price: 100.00,
          locked_at: new Date(),
          service_fee: 10.00,
          facility_fee: 5.00,
          tax_rate: 0.08,
        },
      };
      configureMockReturn(mockDb, lockedCapacity);

      const result = await model.findById('cap-123');

      expect(result?.locked_price_data).toBeDefined();
      expect(result?.locked_price_data?.locked_price).toBe(100.00);
    });

    it('should handle capacity with row and seat configuration', async () => {
      const seatedCapacity: IEventCapacity = {
        ...mockCapacity,
        row_config: { rows: ['A', 'B', 'C'], seats_per_row: 20 },
        seat_map: { A1: 'available', A2: 'sold', A3: 'reserved' },
      };
      configureMockReturn(mockDb, seatedCapacity);

      const result = await model.findById('cap-123');

      expect(result?.row_config).toBeDefined();
      expect(result?.seat_map).toBeDefined();
    });

    it('should handle reserved capacity with expiration', async () => {
      const reservedCapacity: IEventCapacity = {
        ...mockCapacity,
        reserved_at: new Date(),
        reserved_expires_at: new Date(Date.now() + 600000), // 10 minutes
      };
      configureMockReturn(mockDb, reservedCapacity);

      const result = await model.findById('cap-123');

      expect(result?.reserved_at).toBeDefined();
      expect(result?.reserved_expires_at).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle very large capacity numbers', async () => {
      mockDb._mockChain.first.mockResolvedValue({ total: '100000' });

      const result = await model.getTotalCapacity('event-123');

      expect(result).toBe(100000);
    });

    it('should handle zero total capacity', async () => {
      mockDb._mockChain.first.mockResolvedValue({ total: '0' });

      const result = await model.getTotalCapacity('event-123');

      expect(result).toBe(0);
    });

    it('should handle capacity with all optional fields null', async () => {
      const minimalCapacity: IEventCapacity = {
        id: 'cap-min',
        event_id: 'event-123',
        section_name: 'Minimal Section',
        total_capacity: 100,
        available_capacity: 100,
      };
      configureMockReturn(mockDb, minimalCapacity);

      const result = await model.findById('cap-min');

      expect(result?.schedule_id).toBeUndefined();
      expect(result?.tier).toBeUndefined();
    });

    it('should handle capacity with purchase limits', async () => {
      const limitedCapacity: IEventCapacity = {
        ...mockCapacity,
        minimum_purchase: 2,
        maximum_purchase: 4,
      };
      configureMockReturn(mockDb, limitedCapacity);

      const result = await model.findById('cap-123');

      expect(result?.minimum_purchase).toBe(2);
      expect(result?.maximum_purchase).toBe(4);
    });

    it('should handle hidden capacity (is_visible = false)', async () => {
      const hiddenCapacity = { ...mockCapacity, is_visible: false };
      configureMockArray(mockDb, [hiddenCapacity]);

      const result = await model.findByEventId('event-123');

      expect(result[0].is_visible).toBe(false);
    });
  });
});
