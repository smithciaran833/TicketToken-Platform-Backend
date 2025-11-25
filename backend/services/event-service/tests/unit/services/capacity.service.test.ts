// Mock venue-service.client BEFORE importing
jest.mock('../../../src/services/venue-service.client', () => {
  return {
    VenueServiceClient: jest.fn().mockImplementation(() => ({
      getVenue: jest.fn(),
    })),
  };
});

jest.mock('pino', () => ({
  pino: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  })),
}));

import { CapacityService } from '../../../src/services/capacity.service';
import { NotFoundError, ValidationError } from '../../../src/types';
import { VenueServiceClient } from '../../../src/services/venue-service.client';

describe('Capacity Service', () => {
  let capacityService: CapacityService;
  let mockDb: any;
  let mockQueryBuilder: any;
  let mockVenueClient: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      whereNotNull: jest.fn().mockReturnThis(),
      select: jest.fn().mockResolvedValue([]),
      first: jest.fn().mockResolvedValue(null),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([]),
      sum: jest.fn().mockReturnThis(),
    };

    mockDb = jest.fn(() => mockQueryBuilder);
    mockDb.raw = jest.fn((sql: string, values?: any[]) => ({ sql, values }));

    capacityService = new CapacityService(mockDb as any);
    
    // Get the mocked instance
    mockVenueClient = (capacityService as any).venueClient;
  });

  describe('getEventCapacity', () => {
    it('should get capacity for event', async () => {
      const mockCapacity = [{ id: '1', event_id: 'event-123' }];
      mockQueryBuilder.select.mockResolvedValue(mockCapacity);

      const result = await capacityService.getEventCapacity('event-123', 'tenant-1');

      expect(mockDb).toHaveBeenCalledWith('event_capacity');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ event_id: 'event-123', tenant_id: 'tenant-1' });
      expect(result).toEqual(mockCapacity);
    });
  });

  describe('getCapacityById', () => {
    it('should get capacity by id', async () => {
      const mockCapacity = { id: 'cap-1', section_name: 'VIP' };
      mockQueryBuilder.first.mockResolvedValue(mockCapacity);

      const result = await capacityService.getCapacityById('cap-1', 'tenant-1');

      expect(result).toEqual(mockCapacity);
    });

    it('should throw NotFoundError if not found', async () => {
      mockQueryBuilder.first.mockResolvedValue(null);

      await expect(
        capacityService.getCapacityById('cap-999', 'tenant-1')
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('createCapacity', () => {
    it('should create capacity', async () => {
      const data = {
        event_id: 'event-1',
        section_name: 'General',
        total_capacity: 100,
      };
      const mockCreated = { id: 'cap-1', ...data };
      
      mockQueryBuilder.select.mockResolvedValue([]);
      mockQueryBuilder.first.mockResolvedValue({ venue_id: 'venue-1' });
      mockVenueClient.getVenue.mockResolvedValue({ max_capacity: 500 });
      mockQueryBuilder.returning.mockResolvedValue([mockCreated]);

      const result = await capacityService.createCapacity(data, 'tenant-1', 'auth-token');

      expect(mockQueryBuilder.insert).toHaveBeenCalled();
      expect(result).toEqual(mockCreated);
    });

    it('should throw ValidationError for missing fields', async () => {
      await expect(
        capacityService.createCapacity({}, 'tenant-1', 'auth-token')
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for negative capacity', async () => {
      await expect(
        capacityService.createCapacity(
          { section_name: 'Test', total_capacity: -10 },
          'tenant-1',
          'auth-token'
        )
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('updateCapacity', () => {
    it('should update capacity', async () => {
      const existing = { id: 'cap-1', total_capacity: 100, event_id: 'event-1' };
      const updated = { ...existing, section_name: 'Updated' };
      
      mockQueryBuilder.first
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce({ venue_id: 'venue-1' });
      mockQueryBuilder.returning.mockResolvedValue([updated]);

      const result = await capacityService.updateCapacity('cap-1', { section_name: 'Updated' }, 'tenant-1');

      expect(mockQueryBuilder.update).toHaveBeenCalled();
      expect(result).toEqual(updated);
    });
  });

  describe('checkAvailability', () => {
    it('should return true if capacity available', async () => {
      mockQueryBuilder.first.mockResolvedValue({ available_capacity: 50 });

      const result = await capacityService.checkAvailability('cap-1', 20, 'tenant-1');

      expect(result).toBe(true);
    });

    it('should return false if insufficient capacity', async () => {
      mockQueryBuilder.first.mockResolvedValue({ available_capacity: 10 });

      const result = await capacityService.checkAvailability('cap-1', 20, 'tenant-1');

      expect(result).toBe(false);
    });
  });

  describe('reserveCapacity', () => {
    it('should reserve capacity', async () => {
      const mockCapacity = { id: 'cap-1', available_capacity: 50 };
      const mockUpdated = { ...mockCapacity, available_capacity: 45 };
      
      mockQueryBuilder.first.mockResolvedValue(mockCapacity);
      mockQueryBuilder.returning.mockResolvedValue([mockUpdated]);

      const result = await capacityService.reserveCapacity('cap-1', 5, 'tenant-1');

      expect(mockQueryBuilder.update).toHaveBeenCalled();
      expect(result).toEqual(mockUpdated);
    });

    it('should throw ValidationError if insufficient capacity', async () => {
      mockQueryBuilder.first.mockResolvedValue({ available_capacity: 2 });

      await expect(
        capacityService.reserveCapacity('cap-1', 10, 'tenant-1')
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('releaseReservation', () => {
    it('should release reservation', async () => {
      const mockUpdated = { id: 'cap-1', available_capacity: 55 };
      mockQueryBuilder.returning.mockResolvedValue([mockUpdated]);

      const result = await capacityService.releaseReservation('cap-1', 5, 'tenant-1');

      expect(mockQueryBuilder.update).toHaveBeenCalled();
      expect(result).toEqual(mockUpdated);
    });
  });

  describe('confirmReservation', () => {
    it('should confirm reservation as sold', async () => {
      const mockUpdated = { id: 'cap-1', sold_count: 5 };
      mockQueryBuilder.returning.mockResolvedValue([mockUpdated]);

      const result = await capacityService.confirmReservation('cap-1', 5, 'tenant-1');

      expect(mockQueryBuilder.update).toHaveBeenCalled();
      expect(result).toEqual(mockUpdated);
    });
  });

  describe('releaseExpiredReservations', () => {
    it('should release expired reservations', async () => {
      const expiredSections = [
        { id: 'cap-1', reserved_capacity: 10 },
        { id: 'cap-2', reserved_capacity: 5 },
      ];
      
      mockQueryBuilder.select.mockResolvedValue(expiredSections);

      const result = await capacityService.releaseExpiredReservations();

      expect(result).toBe(15);
      expect(mockQueryBuilder.update).toHaveBeenCalledTimes(2);
    });

    it('should return 0 if no expired reservations', async () => {
      mockQueryBuilder.select.mockResolvedValue([]);

      const result = await capacityService.releaseExpiredReservations();

      expect(result).toBe(0);
    });
  });

  describe('getTotalEventCapacity', () => {
    it('should get total event capacity', async () => {
      mockQueryBuilder.first.mockResolvedValue({
        total_capacity: '200',
        available_capacity: '150',
        reserved_capacity: '30',
        sold_count: '20',
      });

      const result = await capacityService.getTotalEventCapacity('event-1', 'tenant-1');

      expect(result).toEqual({
        total_capacity: 200,
        available_capacity: 150,
        reserved_capacity: 30,
        sold_count: 20,
      });
    });
  });

  describe('getLockedPrice', () => {
    it('should get locked price for capacity', async () => {
      const mockCapacity = {
        id: 'cap-1',
        locked_price_data: {
          locked_price: '50.00',
          service_fee: '5.00',
        },
      };
      mockQueryBuilder.first.mockResolvedValue(mockCapacity);

      const result = await capacityService.getLockedPrice('cap-1', 'tenant-1');

      expect(result.locked_price).toBe(50);
      expect(result.service_fee).toBe(5);
    });
  });
});
