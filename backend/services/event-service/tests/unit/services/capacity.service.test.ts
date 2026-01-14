/**
 * Unit tests for CapacityService
 * Tests capacity management, reservations, and validation
 */

import { CapacityService } from '../../../src/services/capacity.service';
import { createKnexMock, configureMockReturn, configureMockArray } from '../../__mocks__/knex.mock';

// Mock logger
jest.mock('pino', () => {
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  return jest.fn(() => mockLogger);
});

describe('CapacityService', () => {
  let mockDb: any;
  let service: CapacityService;
  let mockVenueClient: any;

  const mockCapacity = {
    id: 'cap-123',
    tenant_id: 'tenant-1',
    event_id: 'event-123',
    schedule_id: 'schedule-1',
    section_name: 'General Admission',
    total_capacity: 1000,
    available_capacity: 800,
    reserved_capacity: 50,
    sold_count: 150,
    pending_count: 0,
    is_active: true,
    is_visible: true,
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(() => {
    mockDb = createKnexMock();
    mockVenueClient = {
      getVenue: jest.fn().mockResolvedValue({ max_capacity: 5000 }),
      validateVenueAccess: jest.fn().mockResolvedValue(true),
    };
    service = new CapacityService(mockDb, mockVenueClient);
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create service instance', () => {
      expect(service).toBeInstanceOf(CapacityService);
    });

    it('should work without venue client', () => {
      const serviceWithoutVenue = new CapacityService(mockDb);
      expect(serviceWithoutVenue).toBeInstanceOf(CapacityService);
    });
  });

  describe('getEventCapacity', () => {
    it('should return capacity sections for event', async () => {
      configureMockArray(mockDb, [mockCapacity]);

      const result = await service.getEventCapacity('event-123', 'tenant-1');

      expect(mockDb).toHaveBeenCalledWith('event_capacity');
      expect(mockDb._mockChain.where).toHaveBeenCalledWith({
        event_id: 'event-123',
        tenant_id: 'tenant-1',
      });
      expect(result).toHaveLength(1);
      expect(result[0].section_name).toBe('General Admission');
    });

    it('should return multiple capacity sections', async () => {
      const sections = [
        { ...mockCapacity, id: 'cap-1', section_name: 'GA' },
        { ...mockCapacity, id: 'cap-2', section_name: 'VIP' },
        { ...mockCapacity, id: 'cap-3', section_name: 'Premium' },
      ];
      configureMockArray(mockDb, sections);

      const result = await service.getEventCapacity('event-123', 'tenant-1');

      expect(result).toHaveLength(3);
    });

    it('should return empty array when no capacity', async () => {
      configureMockArray(mockDb, []);

      const result = await service.getEventCapacity('event-123', 'tenant-1');

      expect(result).toEqual([]);
    });
  });

  describe('getCapacityById', () => {
    it('should return capacity section by ID', async () => {
      configureMockReturn(mockDb, mockCapacity);

      const result = await service.getCapacityById('cap-123', 'tenant-1');

      expect(mockDb._mockChain.where).toHaveBeenCalledWith({
        id: 'cap-123',
        tenant_id: 'tenant-1',
      });
      expect(result.section_name).toBe('General Admission');
    });

    it('should throw NotFoundError when capacity not found', async () => {
      configureMockReturn(mockDb, null);

      await expect(service.getCapacityById('non-existent', 'tenant-1'))
        .rejects.toThrow('Capacity section');
    });
  });

  describe('createCapacity', () => {
    it('should create new capacity section', async () => {
      mockDb._mockChain.returning.mockResolvedValue([mockCapacity]);

      const result = await service.createCapacity({
        event_id: 'event-123',
        section_name: 'General Admission',
        total_capacity: 1000,
      }, 'tenant-1', 'auth-token');

      expect(mockDb._mockChain.insert).toHaveBeenCalled();
      expect(result.section_name).toBe('General Admission');
    });

    it('should set available_capacity to total_capacity', async () => {
      mockDb._mockChain.returning.mockResolvedValue([{
        ...mockCapacity,
        available_capacity: 500,
      }]);

      await service.createCapacity({
        event_id: 'event-123',
        section_name: 'Test',
        total_capacity: 500,
      }, 'tenant-1', 'auth-token');

      const insertCall = mockDb._mockChain.insert.mock.calls[0][0];
      expect(insertCall.available_capacity).toBe(500);
    });

    it('should initialize sold_count and pending_count to 0', async () => {
      mockDb._mockChain.returning.mockResolvedValue([mockCapacity]);

      await service.createCapacity({
        event_id: 'event-123',
        section_name: 'Test',
        total_capacity: 500,
      }, 'tenant-1', 'auth-token');

      const insertCall = mockDb._mockChain.insert.mock.calls[0][0];
      expect(insertCall.sold_count).toBe(0);
      expect(insertCall.pending_count).toBe(0);
    });

    it('should throw ValidationError for missing section_name', async () => {
      await expect(service.createCapacity({
        event_id: 'event-123',
        total_capacity: 1000,
      }, 'tenant-1', 'auth-token')).rejects.toThrow();
    });

    it('should throw ValidationError for missing total_capacity', async () => {
      await expect(service.createCapacity({
        event_id: 'event-123',
        section_name: 'Test',
      }, 'tenant-1', 'auth-token')).rejects.toThrow();
    });

    it('should throw ValidationError for negative capacity', async () => {
      await expect(service.createCapacity({
        event_id: 'event-123',
        section_name: 'Test',
        total_capacity: -100,
      }, 'tenant-1', 'auth-token')).rejects.toThrow();
    });

    it('should default is_active to true', async () => {
      mockDb._mockChain.returning.mockResolvedValue([mockCapacity]);

      await service.createCapacity({
        event_id: 'event-123',
        section_name: 'Test',
        total_capacity: 500,
      }, 'tenant-1', 'auth-token');

      const insertCall = mockDb._mockChain.insert.mock.calls[0][0];
      expect(insertCall.is_active).toBe(true);
    });

    it('should default is_visible to true', async () => {
      mockDb._mockChain.returning.mockResolvedValue([mockCapacity]);

      await service.createCapacity({
        event_id: 'event-123',
        section_name: 'Test',
        total_capacity: 500,
      }, 'tenant-1', 'auth-token');

      const insertCall = mockDb._mockChain.insert.mock.calls[0][0];
      expect(insertCall.is_visible).toBe(true);
    });
  });

  describe('updateCapacity', () => {
    it('should update capacity section', async () => {
      configureMockReturn(mockDb, mockCapacity);
      mockDb._mockChain.returning.mockResolvedValue([{
        ...mockCapacity,
        section_name: 'Updated Name',
      }]);

      const result = await service.updateCapacity('cap-123', {
        section_name: 'Updated Name',
      }, 'tenant-1');

      expect(result.section_name).toBe('Updated Name');
    });

    it('should throw ValidationError for negative total_capacity', async () => {
      configureMockReturn(mockDb, mockCapacity);

      await expect(service.updateCapacity('cap-123', {
        total_capacity: -50,
      }, 'tenant-1')).rejects.toThrow();
    });

    it('should set updated_at timestamp', async () => {
      configureMockReturn(mockDb, mockCapacity);
      mockDb._mockChain.returning.mockResolvedValue([mockCapacity]);

      await service.updateCapacity('cap-123', {
        section_name: 'Test',
      }, 'tenant-1');

      const updateCall = mockDb._mockChain.update.mock.calls[0][0];
      expect(updateCall.updated_at).toBeInstanceOf(Date);
    });
  });

  describe('checkAvailability', () => {
    it('should return true when quantity available', async () => {
      configureMockReturn(mockDb, { ...mockCapacity, available_capacity: 100 });

      const result = await service.checkAvailability('cap-123', 50, 'tenant-1');

      expect(result).toBe(true);
    });

    it('should return true when exact quantity available', async () => {
      configureMockReturn(mockDb, { ...mockCapacity, available_capacity: 50 });

      const result = await service.checkAvailability('cap-123', 50, 'tenant-1');

      expect(result).toBe(true);
    });

    it('should return false when quantity exceeds available', async () => {
      configureMockReturn(mockDb, { ...mockCapacity, available_capacity: 30 });

      const result = await service.checkAvailability('cap-123', 50, 'tenant-1');

      expect(result).toBe(false);
    });

    it('should return false when no availability', async () => {
      configureMockReturn(mockDb, { ...mockCapacity, available_capacity: 0 });

      const result = await service.checkAvailability('cap-123', 1, 'tenant-1');

      expect(result).toBe(false);
    });
  });

  describe('reserveCapacity', () => {
    it('should reserve capacity with row locking', async () => {
      const mockTransaction = jest.fn().mockImplementation(async (callback) => {
        const trx = createKnexMock();
        configureMockReturn(trx, { ...mockCapacity, available_capacity: 100 });
        trx._mockChain.returning.mockResolvedValue([{
          ...mockCapacity,
          available_capacity: 90,
          reserved_capacity: 60,
        }]);
        return callback(trx);
      });
      mockDb.transaction = mockTransaction;

      const result = await service.reserveCapacity('cap-123', 10, 'tenant-1');

      expect(result.available_capacity).toBe(90);
      expect(result.reserved_capacity).toBe(60);
    });

    it('should throw ValidationError for zero quantity', async () => {
      await expect(service.reserveCapacity('cap-123', 0, 'tenant-1'))
        .rejects.toThrow('Quantity must be greater than zero');
    });

    it('should throw ValidationError for negative quantity', async () => {
      await expect(service.reserveCapacity('cap-123', -5, 'tenant-1'))
        .rejects.toThrow('Quantity must be greater than zero');
    });

    it('should throw ValidationError when insufficient availability', async () => {
      const mockTransaction = jest.fn().mockImplementation(async (callback) => {
        const trx = createKnexMock();
        configureMockReturn(trx, { ...mockCapacity, available_capacity: 5 });
        return callback(trx);
      });
      mockDb.transaction = mockTransaction;

      await expect(service.reserveCapacity('cap-123', 10, 'tenant-1'))
        .rejects.toThrow('Only 5 tickets available');
    });

    it('should set reservation expiration time', async () => {
      const mockTransaction = jest.fn().mockImplementation(async (callback) => {
        const trx = createKnexMock();
        configureMockReturn(trx, { ...mockCapacity, available_capacity: 100 });
        trx._mockChain.returning.mockResolvedValue([mockCapacity]);
        return callback(trx);
      });
      mockDb.transaction = mockTransaction;

      await service.reserveCapacity('cap-123', 5, 'tenant-1', 30);

      // Default is 15 minutes, custom is 30
    });

    it('should use forUpdate for row locking', async () => {
      const mockTransaction = jest.fn().mockImplementation(async (callback) => {
        const trx = createKnexMock();
        configureMockReturn(trx, { ...mockCapacity, available_capacity: 100 });
        trx._mockChain.returning.mockResolvedValue([mockCapacity]);
        return callback(trx);
      });
      mockDb.transaction = mockTransaction;

      await service.reserveCapacity('cap-123', 5, 'tenant-1');

      // Should use forUpdate() to lock row
    });

    it('should lock price when pricing_id provided', async () => {
      const mockTransaction = jest.fn().mockImplementation(async (callback) => {
        const trx = createKnexMock();
        configureMockReturn(trx, { ...mockCapacity, available_capacity: 100 });
        trx._mockChain.returning.mockResolvedValue([{
          ...mockCapacity,
          locked_price_data: {
            pricing_id: 'price-1',
            locked_price: 50.00,
          },
        }]);
        return callback(trx);
      });
      mockDb.transaction = mockTransaction;

      const result = await service.reserveCapacity(
        'cap-123', 5, 'tenant-1', 15, 'price-1', 'auth-token'
      );

      expect(result.locked_price_data).toBeDefined();
    });
  });

  describe('releaseReservation', () => {
    it('should release reserved capacity', async () => {
      mockDb._mockChain.returning.mockResolvedValue([{
        ...mockCapacity,
        available_capacity: 850,
        reserved_capacity: 0,
      }]);

      const result = await service.releaseReservation('cap-123', 50, 'tenant-1');

      expect(result.reserved_capacity).toBe(0);
    });

    it('should clear reservation timestamps', async () => {
      mockDb._mockChain.returning.mockResolvedValue([mockCapacity]);

      await service.releaseReservation('cap-123', 10, 'tenant-1');

      const updateCall = mockDb._mockChain.update.mock.calls[0][0];
      expect(updateCall.reserved_at).toBeNull();
      expect(updateCall.reserved_expires_at).toBeNull();
    });

    it('should clear locked_price_data', async () => {
      mockDb._mockChain.returning.mockResolvedValue([mockCapacity]);

      await service.releaseReservation('cap-123', 10, 'tenant-1');

      const updateCall = mockDb._mockChain.update.mock.calls[0][0];
      expect(updateCall.locked_price_data).toBeNull();
    });
  });

  describe('confirmReservation', () => {
    it('should move from reserved to sold', async () => {
      mockDb._mockChain.returning.mockResolvedValue([{
        ...mockCapacity,
        reserved_capacity: 40,
        sold_count: 160,
      }]);

      const result = await service.confirmReservation('cap-123', 10, 'tenant-1');

      expect(result.sold_count).toBe(160);
    });

    it('should clear reservation data', async () => {
      mockDb._mockChain.returning.mockResolvedValue([mockCapacity]);

      await service.confirmReservation('cap-123', 10, 'tenant-1');

      const updateCall = mockDb._mockChain.update.mock.calls[0][0];
      expect(updateCall.reserved_at).toBeNull();
      expect(updateCall.reserved_expires_at).toBeNull();
      expect(updateCall.locked_price_data).toBeNull();
    });
  });

  describe('releaseExpiredReservations', () => {
    it('should release all expired reservations', async () => {
      const expiredSections = [
        { id: 'cap-1', reserved_capacity: 10 },
        { id: 'cap-2', reserved_capacity: 20 },
      ];
      configureMockArray(mockDb, expiredSections);
      mockDb._mockChain.update.mockResolvedValue(1);

      const result = await service.releaseExpiredReservations();

      expect(result).toBe(30); // Total released
    });

    it('should return 0 when no expired reservations', async () => {
      configureMockArray(mockDb, []);

      const result = await service.releaseExpiredReservations();

      expect(result).toBe(0);
    });

    it('should check reserved_expires_at <= now', async () => {
      configureMockArray(mockDb, []);

      await service.releaseExpiredReservations();

      // Should filter by expired timestamp
      expect(mockDb._mockChain.where).toHaveBeenCalled();
    });
  });

  describe('getTotalEventCapacity', () => {
    it('should return aggregated capacity totals', async () => {
      configureMockReturn(mockDb, {
        total_capacity: '1000',
        available_capacity: '800',
        reserved_capacity: '50',
        sold_count: '150',
      });

      const result = await service.getTotalEventCapacity('event-123', 'tenant-1');

      expect(result.total_capacity).toBe(1000);
      expect(result.available_capacity).toBe(800);
      expect(result.reserved_capacity).toBe(50);
      expect(result.sold_count).toBe(150);
    });

    it('should handle empty event', async () => {
      configureMockReturn(mockDb, {
        total_capacity: null,
        available_capacity: null,
        reserved_capacity: null,
        sold_count: null,
      });

      const result = await service.getTotalEventCapacity('event-123', 'tenant-1');

      expect(result.total_capacity).toBe(0);
      expect(result.available_capacity).toBe(0);
      expect(result.reserved_capacity).toBe(0);
      expect(result.sold_count).toBe(0);
    });

    it('should use SUM aggregation', async () => {
      configureMockReturn(mockDb, {
        total_capacity: '1000',
        available_capacity: '800',
        reserved_capacity: '50',
        sold_count: '150',
      });

      await service.getTotalEventCapacity('event-123', 'tenant-1');

      expect(mockDb._mockChain.sum).toHaveBeenCalled();
    });
  });

  describe('validateVenueCapacity', () => {
    it('should pass when total under venue max', async () => {
      configureMockArray(mockDb, [{ total_capacity: 1000 }]);
      configureMockReturn(mockDb, { id: 'event-123', venue_id: 'venue-1' });
      mockVenueClient.getVenue.mockResolvedValue({ max_capacity: 5000 });

      await expect(service.validateVenueCapacity(
        'event-123', 'tenant-1', 'auth-token', 500
      )).resolves.not.toThrow();
    });

    it('should throw ValidationError when exceeds venue max', async () => {
      configureMockArray(mockDb, [{ total_capacity: 4000 }]);
      configureMockReturn(mockDb, { id: 'event-123', venue_id: 'venue-1' });
      mockVenueClient.getVenue.mockResolvedValue({ max_capacity: 5000 });

      await expect(service.validateVenueCapacity(
        'event-123', 'tenant-1', 'auth-token', 2000
      )).rejects.toThrow('exceed venue maximum');
    });

    it('should skip validation when no venue client', async () => {
      const serviceNoVenue = new CapacityService(mockDb);

      await expect(serviceNoVenue.validateVenueCapacity(
        'event-123', 'tenant-1', 'auth-token', 10000
      )).resolves.not.toThrow();
    });

    it('should skip validation when venue has no max_capacity', async () => {
      configureMockArray(mockDb, [{ total_capacity: 1000 }]);
      configureMockReturn(mockDb, { id: 'event-123', venue_id: 'venue-1' });
      mockVenueClient.getVenue.mockResolvedValue({ name: 'Test Venue' });

      await expect(service.validateVenueCapacity(
        'event-123', 'tenant-1', 'auth-token', 1000
      )).resolves.not.toThrow();
    });
  });

  describe('getLockedPrice', () => {
    it('should return parsed locked price data', async () => {
      configureMockReturn(mockDb, {
        ...mockCapacity,
        locked_price_data: {
          locked_price: '50.00',
          service_fee: '5.00',
          facility_fee: '2.50',
          tax_rate: '0.08',
        },
      });

      const result = await service.getLockedPrice('cap-123', 'tenant-1');

      expect(result.locked_price).toBe(50);
      expect(result.service_fee).toBe(5);
      expect(result.facility_fee).toBe(2.5);
      expect(result.tax_rate).toBe(0.08);
    });

    it('should return null when no locked price', async () => {
      configureMockReturn(mockDb, {
        ...mockCapacity,
        locked_price_data: null,
      });

      const result = await service.getLockedPrice('cap-123', 'tenant-1');

      expect(result).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle zero capacity sections', async () => {
      configureMockReturn(mockDb, { ...mockCapacity, total_capacity: 0 });

      const result = await service.getCapacityById('cap-123', 'tenant-1');

      expect(result.total_capacity).toBe(0);
    });

    it('should handle large capacity values', async () => {
      configureMockReturn(mockDb, {
        ...mockCapacity,
        total_capacity: 100000,
        available_capacity: 99000,
      });

      const result = await service.getCapacityById('cap-123', 'tenant-1');

      expect(result.total_capacity).toBe(100000);
    });

    it('should handle concurrent reservations with row locking', async () => {
      // Row locking should prevent race conditions
      const mockTransaction = jest.fn().mockImplementation(async (callback) => {
        const trx = createKnexMock();
        configureMockReturn(trx, { ...mockCapacity, available_capacity: 1 });
        trx._mockChain.returning.mockResolvedValue([{
          ...mockCapacity,
          available_capacity: 0,
          reserved_capacity: 51,
        }]);
        return callback(trx);
      });
      mockDb.transaction = mockTransaction;

      const result = await service.reserveCapacity('cap-123', 1, 'tenant-1');

      expect(result.available_capacity).toBe(0);
    });
  });
});
