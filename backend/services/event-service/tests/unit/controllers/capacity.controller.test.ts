/**
 * Capacity Controller Unit Tests
 * 
 * Tests the capacity controller handlers for:
 * - getEventCapacity: Get all capacity sections for an event
 * - getTotalCapacity: Get aggregated capacity totals
 * - getCapacityById: Get specific capacity section
 * - createCapacity: Create new capacity section
 * - updateCapacity: Update capacity section
 * - checkAvailability: Check if quantity is available
 * - reserveCapacity: Reserve capacity with optional price lock
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import {
  getEventCapacity,
  getTotalCapacity,
  getCapacityById,
  createCapacity,
  updateCapacity,
  checkAvailability,
  reserveCapacity
} from '../../../src/controllers/capacity.controller';

// Mock dependencies
jest.mock('../../../src/config/database', () => ({
  db: {}
}));

jest.mock('../../../src/services/capacity.service', () => ({
  CapacityService: jest.fn().mockImplementation(() => ({
    getEventCapacity: jest.fn(),
    getCapacityById: jest.fn(),
    createCapacity: jest.fn(),
    updateCapacity: jest.fn(),
    checkAvailability: jest.fn(),
    reserveCapacity: jest.fn(),
    getLockedPrice: jest.fn()
  }))
}));

jest.mock('../../../src/middleware/error-handler', () => ({
  createProblemError: jest.fn((status: number, code: string, detail: string) => {
    const error = new Error(detail) as any;
    error.statusCode = status;
    error.code = code;
    return error;
  })
}));

import { CapacityService } from '../../../src/services/capacity.service';

describe('Capacity Controller', () => {
  let mockCapacityService: any;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock capacity service
    mockCapacityService = {
      getEventCapacity: jest.fn(),
      getCapacityById: jest.fn(),
      createCapacity: jest.fn(),
      updateCapacity: jest.fn(),
      checkAvailability: jest.fn(),
      reserveCapacity: jest.fn(),
      getLockedPrice: jest.fn()
    };

    // Mock the CapacityService constructor
    (CapacityService as jest.Mock).mockImplementation(() => mockCapacityService);

    // Setup mock request
    mockRequest = {
      params: {},
      body: {},
      headers: { authorization: 'Bearer test-token' }
    };
    (mockRequest as any).tenantId = 'tenant-123';

    // Setup mock reply
    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };
  });

  describe('getEventCapacity', () => {
    it('should return capacity sections for an event', async () => {
      const capacitySections = [
        { id: 'cap-1', section_name: 'VIP', total_capacity: 100, available_capacity: 80 },
        { id: 'cap-2', section_name: 'GA', total_capacity: 500, available_capacity: 450 }
      ];
      mockCapacityService.getEventCapacity.mockResolvedValue(capacitySections);
      (mockRequest.params as any) = { eventId: 'event-123' };

      await getEventCapacity(mockRequest as FastifyRequest<any>, mockReply as FastifyReply);

      expect(mockCapacityService.getEventCapacity).toHaveBeenCalledWith('event-123', 'tenant-123');
      expect(mockReply.send).toHaveBeenCalledWith({ capacity: capacitySections });
    });

    it('should return empty array when no capacity sections exist', async () => {
      mockCapacityService.getEventCapacity.mockResolvedValue([]);
      (mockRequest.params as any) = { eventId: 'event-123' };

      await getEventCapacity(mockRequest as FastifyRequest<any>, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith({ capacity: [] });
    });
  });

  describe('getTotalCapacity', () => {
    it('should return aggregated capacity totals', async () => {
      const capacitySections = [
        { total_capacity: 100, available_capacity: 80, reserved_capacity: 10, sold_count: 10 },
        { total_capacity: 500, available_capacity: 450, reserved_capacity: 20, sold_count: 30 }
      ];
      mockCapacityService.getEventCapacity.mockResolvedValue(capacitySections);
      (mockRequest.params as any) = { eventId: 'event-123' };

      await getTotalCapacity(mockRequest as FastifyRequest<any>, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        total_capacity: 600,
        available_capacity: 530,
        reserved_capacity: 30,
        sold_count: 40
      });
    });

    it('should return zeros when no capacity exists', async () => {
      mockCapacityService.getEventCapacity.mockResolvedValue([]);
      (mockRequest.params as any) = { eventId: 'event-123' };

      await getTotalCapacity(mockRequest as FastifyRequest<any>, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        total_capacity: 0,
        available_capacity: 0,
        reserved_capacity: 0,
        sold_count: 0
      });
    });

    it('should handle null values in capacity data', async () => {
      const capacitySections = [
        { total_capacity: null, available_capacity: 80, reserved_capacity: null, sold_count: 10 }
      ];
      mockCapacityService.getEventCapacity.mockResolvedValue(capacitySections);
      (mockRequest.params as any) = { eventId: 'event-123' };

      await getTotalCapacity(mockRequest as FastifyRequest<any>, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        total_capacity: 0,
        available_capacity: 80,
        reserved_capacity: 0,
        sold_count: 10
      });
    });
  });

  describe('getCapacityById', () => {
    it('should return capacity section when found', async () => {
      const capacity = { id: 'cap-123', section_name: 'VIP', total_capacity: 100 };
      mockCapacityService.getCapacityById.mockResolvedValue(capacity);
      (mockRequest.params as any) = { id: 'cap-123' };

      await getCapacityById(mockRequest as FastifyRequest<any>, mockReply as FastifyReply);

      expect(mockCapacityService.getCapacityById).toHaveBeenCalledWith('cap-123', 'tenant-123');
      expect(mockReply.send).toHaveBeenCalledWith({ capacity });
    });

    it('should throw NOT_FOUND when capacity does not exist', async () => {
      mockCapacityService.getCapacityById.mockResolvedValue(null);
      (mockRequest.params as any) = { id: 'nonexistent-123' };

      await expect(
        getCapacityById(mockRequest as FastifyRequest<any>, mockReply as FastifyReply)
      ).rejects.toThrow('Capacity not found');
    });
  });

  describe('createCapacity', () => {
    const validCapacityData = {
      section_name: 'VIP Section',
      section_code: 'VIP',
      total_capacity: 100
    };

    it('should create capacity successfully', async () => {
      const createdCapacity = { id: 'cap-123', ...validCapacityData };
      mockCapacityService.createCapacity.mockResolvedValue(createdCapacity);
      (mockRequest.params as any) = { eventId: 'event-123' };
      mockRequest.body = validCapacityData;

      await createCapacity(mockRequest as FastifyRequest<any>, mockReply as FastifyReply);

      expect(mockCapacityService.createCapacity).toHaveBeenCalledWith(
        { ...validCapacityData, event_id: 'event-123' },
        'tenant-123',
        'Bearer test-token'
      );
      expect(mockReply.status).toHaveBeenCalledWith(201);
      expect(mockReply.send).toHaveBeenCalledWith({ capacity: createdCapacity });
    });

    it('should create capacity with schedule_id', async () => {
      const capacityWithSchedule = { ...validCapacityData, schedule_id: 'sched-123' };
      const createdCapacity = { id: 'cap-123', ...capacityWithSchedule };
      mockCapacityService.createCapacity.mockResolvedValue(createdCapacity);
      (mockRequest.params as any) = { eventId: 'event-123' };
      mockRequest.body = capacityWithSchedule;

      await createCapacity(mockRequest as FastifyRequest<any>, mockReply as FastifyReply);

      expect(mockCapacityService.createCapacity).toHaveBeenCalledWith(
        expect.objectContaining({ schedule_id: 'sched-123' }),
        'tenant-123',
        expect.any(String)
      );
    });
  });

  describe('updateCapacity', () => {
    const updateData = { section_name: 'Updated VIP', total_capacity: 150 };

    it('should update capacity successfully', async () => {
      const updatedCapacity = { id: 'cap-123', ...updateData };
      mockCapacityService.updateCapacity.mockResolvedValue(updatedCapacity);
      (mockRequest.params as any) = { id: 'cap-123' };
      mockRequest.body = updateData;

      await updateCapacity(mockRequest as FastifyRequest<any>, mockReply as FastifyReply);

      expect(mockCapacityService.updateCapacity).toHaveBeenCalledWith(
        'cap-123',
        updateData,
        'tenant-123'
      );
      expect(mockReply.send).toHaveBeenCalledWith({ capacity: updatedCapacity });
    });

    it('should throw NOT_FOUND when capacity does not exist', async () => {
      mockCapacityService.updateCapacity.mockResolvedValue(null);
      (mockRequest.params as any) = { id: 'nonexistent-123' };
      mockRequest.body = updateData;

      await expect(
        updateCapacity(mockRequest as FastifyRequest<any>, mockReply as FastifyReply)
      ).rejects.toThrow('Capacity not found');
    });

    it('should update is_active flag', async () => {
      const deactivateData = { is_active: false };
      mockCapacityService.updateCapacity.mockResolvedValue({ id: 'cap-123', is_active: false });
      (mockRequest.params as any) = { id: 'cap-123' };
      mockRequest.body = deactivateData;

      await updateCapacity(mockRequest as FastifyRequest<any>, mockReply as FastifyReply);

      expect(mockCapacityService.updateCapacity).toHaveBeenCalledWith(
        'cap-123',
        { is_active: false },
        'tenant-123'
      );
    });
  });

  describe('checkAvailability', () => {
    it('should return true when quantity is available', async () => {
      mockCapacityService.checkAvailability.mockResolvedValue(true);
      (mockRequest.params as any) = { id: 'cap-123' };
      mockRequest.body = { quantity: 5 };

      await checkAvailability(mockRequest as FastifyRequest<any>, mockReply as FastifyReply);

      expect(mockCapacityService.checkAvailability).toHaveBeenCalledWith('cap-123', 5, 'tenant-123');
      expect(mockReply.send).toHaveBeenCalledWith({ available: true, quantity: 5 });
    });

    it('should return false when quantity is not available', async () => {
      mockCapacityService.checkAvailability.mockResolvedValue(false);
      (mockRequest.params as any) = { id: 'cap-123' };
      mockRequest.body = { quantity: 100 };

      await checkAvailability(mockRequest as FastifyRequest<any>, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith({ available: false, quantity: 100 });
    });

    it('should throw INVALID_QUANTITY when quantity is less than 1', async () => {
      (mockRequest.params as any) = { id: 'cap-123' };
      mockRequest.body = { quantity: 0 };

      await expect(
        checkAvailability(mockRequest as FastifyRequest<any>, mockReply as FastifyReply)
      ).rejects.toThrow('Quantity must be at least 1');
    });

    it('should throw INVALID_QUANTITY when quantity is negative', async () => {
      (mockRequest.params as any) = { id: 'cap-123' };
      mockRequest.body = { quantity: -5 };

      await expect(
        checkAvailability(mockRequest as FastifyRequest<any>, mockReply as FastifyReply)
      ).rejects.toThrow('Quantity must be at least 1');
    });

    it('should throw INVALID_QUANTITY when quantity is missing', async () => {
      (mockRequest.params as any) = { id: 'cap-123' };
      mockRequest.body = {};

      await expect(
        checkAvailability(mockRequest as FastifyRequest<any>, mockReply as FastifyReply)
      ).rejects.toThrow('Quantity must be at least 1');
    });
  });

  describe('reserveCapacity', () => {
    it('should reserve capacity successfully', async () => {
      const reservedCapacity = {
        id: 'cap-123',
        reserved_capacity: 5,
        available_capacity: 95
      };
      mockCapacityService.reserveCapacity.mockResolvedValue(reservedCapacity);
      (mockRequest.params as any) = { id: 'cap-123' };
      mockRequest.body = { quantity: 5 };

      await reserveCapacity(mockRequest as FastifyRequest<any>, mockReply as FastifyReply);

      expect(mockCapacityService.reserveCapacity).toHaveBeenCalledWith(
        'cap-123',
        5,
        'tenant-123',
        15, // default reservation_minutes
        undefined, // pricing_id
        'Bearer test-token'
      );
      expect(mockReply.send).toHaveBeenCalledWith({
        message: 'Capacity reserved successfully',
        capacity: reservedCapacity,
        locked_price: null
      });
    });

    it('should reserve capacity with custom reservation time', async () => {
      mockCapacityService.reserveCapacity.mockResolvedValue({ id: 'cap-123' });
      (mockRequest.params as any) = { id: 'cap-123' };
      mockRequest.body = { quantity: 5, reservation_minutes: 30 };

      await reserveCapacity(mockRequest as FastifyRequest<any>, mockReply as FastifyReply);

      expect(mockCapacityService.reserveCapacity).toHaveBeenCalledWith(
        'cap-123',
        5,
        'tenant-123',
        30,
        undefined,
        'Bearer test-token'
      );
    });

    it('should reserve capacity with price lock', async () => {
      const reservedCapacity = {
        id: 'cap-123',
        locked_price_data: { base_price: 50.00 }
      };
      const lockedPrice = { base_price: 50.00, locked_until: new Date() };
      mockCapacityService.reserveCapacity.mockResolvedValue(reservedCapacity);
      mockCapacityService.getLockedPrice.mockResolvedValue(lockedPrice);
      (mockRequest.params as any) = { id: 'cap-123' };
      mockRequest.body = { quantity: 5, pricing_id: 'price-123' };

      await reserveCapacity(mockRequest as FastifyRequest<any>, mockReply as FastifyReply);

      expect(mockCapacityService.reserveCapacity).toHaveBeenCalledWith(
        'cap-123',
        5,
        'tenant-123',
        15,
        'price-123',
        'Bearer test-token'
      );
      expect(mockCapacityService.getLockedPrice).toHaveBeenCalledWith('cap-123', 'tenant-123');
      expect(mockReply.send).toHaveBeenCalledWith({
        message: 'Capacity reserved successfully',
        capacity: reservedCapacity,
        locked_price: lockedPrice
      });
    });

    it('should throw NOT_FOUND when capacity does not exist', async () => {
      mockCapacityService.reserveCapacity.mockResolvedValue(null);
      (mockRequest.params as any) = { id: 'nonexistent-123' };
      mockRequest.body = { quantity: 5 };

      await expect(
        reserveCapacity(mockRequest as FastifyRequest<any>, mockReply as FastifyReply)
      ).rejects.toThrow('Capacity not found');
    });

    it('should throw INVALID_QUANTITY when quantity is invalid', async () => {
      (mockRequest.params as any) = { id: 'cap-123' };
      mockRequest.body = { quantity: 0 };

      await expect(
        reserveCapacity(mockRequest as FastifyRequest<any>, mockReply as FastifyReply)
      ).rejects.toThrow('Quantity must be at least 1');
    });

    it('should handle missing authorization header', async () => {
      mockRequest.headers = {};
      mockCapacityService.reserveCapacity.mockResolvedValue({ id: 'cap-123' });
      (mockRequest.params as any) = { id: 'cap-123' };
      mockRequest.body = { quantity: 5 };

      await reserveCapacity(mockRequest as FastifyRequest<any>, mockReply as FastifyReply);

      expect(mockCapacityService.reserveCapacity).toHaveBeenCalledWith(
        'cap-123',
        5,
        'tenant-123',
        15,
        undefined,
        ''
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle service errors gracefully', async () => {
      mockCapacityService.getEventCapacity.mockRejectedValue(new Error('Database error'));
      (mockRequest.params as any) = { eventId: 'event-123' };

      await expect(
        getEventCapacity(mockRequest as FastifyRequest<any>, mockReply as FastifyReply)
      ).rejects.toThrow('Database error');
    });

    it('should create new CapacityService instance for each request', async () => {
      mockCapacityService.getEventCapacity.mockResolvedValue([]);
      (mockRequest.params as any) = { eventId: 'event-123' };

      await getEventCapacity(mockRequest as FastifyRequest<any>, mockReply as FastifyReply);
      await getEventCapacity(mockRequest as FastifyRequest<any>, mockReply as FastifyReply);

      expect(CapacityService).toHaveBeenCalledTimes(2);
    });
  });
});
