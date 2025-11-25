// Mock dependencies BEFORE imports
jest.mock('../../../src/config/database', () => ({
  db: jest.fn(),
}));

jest.mock('../../../src/services/venue-service.client', () => ({
  VenueServiceClient: jest.fn().mockImplementation(() => ({
    getVenue: jest.fn(),
    validateVenueAccess: jest.fn(),
  })),
}));

jest.mock('pino', () => ({
  pino: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  })),
}));

import { FastifyRequest, FastifyReply } from 'fastify';
import * as capacityController from '../../../src/controllers/capacity.controller';
import { CapacityService } from '../../../src/services/capacity.service';
import { db } from '../../../src/config/database';

// Mock CapacityService
jest.mock('../../../src/services/capacity.service');

describe('Capacity Controller', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockCapacityService: jest.Mocked<CapacityService>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      params: {},
      body: {},
      headers: {},
      log: {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
      } as any,
    };

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };

    // Mock CapacityService instance
    mockCapacityService = {
      getEventCapacity: jest.fn(),
      getCapacityById: jest.fn(),
      createCapacity: jest.fn(),
      updateCapacity: jest.fn(),
      checkAvailability: jest.fn(),
      reserveCapacity: jest.fn(),
      getLockedPrice: jest.fn(),
    } as any;

    (CapacityService as jest.MockedClass<typeof CapacityService>).mockImplementation(() => mockCapacityService);
  });

  describe('getEventCapacity', () => {
    it('should return event capacity sections', async () => {
      const mockSections = [
        { id: '1', section_name: 'VIP', total_capacity: 100 },
        { id: '2', section_name: 'General', total_capacity: 500 },
      ];

      mockRequest.params = { eventId: 'event-1' };
      (mockRequest as any).tenantId = 'tenant-1';
      mockCapacityService.getEventCapacity.mockResolvedValue(mockSections as any);

      await capacityController.getEventCapacity(
        mockRequest as FastifyRequest<{ Params: { eventId: string } }>,
        mockReply as FastifyReply
      );

      expect(mockCapacityService.getEventCapacity).toHaveBeenCalledWith('event-1', 'tenant-1');
      expect(mockReply.send).toHaveBeenCalledWith({ capacity: mockSections });
    });

    it('should handle errors', async () => {
      mockRequest.params = { eventId: 'event-1' };
      (mockRequest as any).tenantId = 'tenant-1';
      mockCapacityService.getEventCapacity.mockRejectedValue(new Error('Database error'));

      await capacityController.getEventCapacity(
        mockRequest as FastifyRequest<{ Params: { eventId: string } }>,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Failed to get event capacity',
        message: 'Database error',
      });
    });
  });

  describe('getTotalCapacity', () => {
    it('should return total capacity aggregates', async () => {
      const mockSections = [
        { total_capacity: 100, available_capacity: 50, reserved_capacity: 30, sold_count: 20 },
        { total_capacity: 500, available_capacity: 200, reserved_capacity: 150, sold_count: 150 },
      ];

      mockRequest.params = { eventId: 'event-1' };
      (mockRequest as any).tenantId = 'tenant-1';
      mockCapacityService.getEventCapacity.mockResolvedValue(mockSections as any);

      await capacityController.getTotalCapacity(
        mockRequest as FastifyRequest<{ Params: { eventId: string } }>,
        mockReply as FastifyReply
      );

      expect(mockReply.send).toHaveBeenCalledWith({
        total_capacity: 600,
        available_capacity: 250,
        reserved_capacity: 180,
        sold_count: 170,
      });
    });
  });

  describe('getCapacityById', () => {
    it('should return capacity by id', async () => {
      const mockCapacity = { id: 'cap-1', section_name: 'VIP', total_capacity: 100 };

      mockRequest.params = { id: 'cap-1' };
      (mockRequest as any).tenantId = 'tenant-1';
      mockCapacityService.getCapacityById.mockResolvedValue(mockCapacity as any);

      await capacityController.getCapacityById(
        mockRequest as FastifyRequest<{ Params: { id: string } }>,
        mockReply as FastifyReply
      );

      expect(mockCapacityService.getCapacityById).toHaveBeenCalledWith('cap-1', 'tenant-1');
      expect(mockReply.send).toHaveBeenCalledWith({ capacity: mockCapacity });
    });

    it('should return 404 if capacity not found', async () => {
      mockRequest.params = { id: 'cap-999' };
      (mockRequest as any).tenantId = 'tenant-1';
      mockCapacityService.getCapacityById.mockRejectedValue(new Error('Capacity not found'));

      await capacityController.getCapacityById(
        mockRequest as FastifyRequest<{ Params: { id: string } }>,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Capacity not found' });
    });
  });

  describe('createCapacity', () => {
    it('should create capacity', async () => {
      const mockCapacity = { id: 'cap-1', section_name: 'VIP', total_capacity: 100 };
      const requestBody = { section_name: 'VIP', total_capacity: 100 };

      mockRequest.params = { eventId: 'event-1' };
      mockRequest.body = requestBody;
      mockRequest.headers = { authorization: 'Bearer token' };
      (mockRequest as any).tenantId = 'tenant-1';
      mockCapacityService.createCapacity.mockResolvedValue(mockCapacity as any);

      await capacityController.createCapacity(
        mockRequest as any,
        mockReply as FastifyReply
      );

      expect(mockCapacityService.createCapacity).toHaveBeenCalledWith(
        { ...requestBody, event_id: 'event-1' },
        'tenant-1',
        'Bearer token'
      );
      expect(mockReply.status).toHaveBeenCalledWith(201);
      expect(mockReply.send).toHaveBeenCalledWith({ capacity: mockCapacity });
    });

    it('should return 422 for validation errors', async () => {
      mockRequest.params = { eventId: 'event-1' };
      mockRequest.body = { section_name: 'VIP', total_capacity: -10 };
      (mockRequest as any).tenantId = 'tenant-1';

      const validationError: any = new Error('Validation failed');
      validationError.details = [{ field: 'total_capacity', message: 'Must be positive' }];
      mockCapacityService.createCapacity.mockRejectedValue(validationError);

      await capacityController.createCapacity(
        mockRequest as any,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(422);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Must be positive',
        details: validationError.details,
      });
    });
  });

  describe('updateCapacity', () => {
    it('should update capacity', async () => {
      const mockCapacity = { id: 'cap-1', section_name: 'VIP Updated', total_capacity: 150 };

      mockRequest.params = { id: 'cap-1' };
      mockRequest.body = { section_name: 'VIP Updated', total_capacity: 150 };
      (mockRequest as any).tenantId = 'tenant-1';
      mockCapacityService.updateCapacity.mockResolvedValue(mockCapacity as any);

      await capacityController.updateCapacity(
        mockRequest as any,
        mockReply as FastifyReply
      );

      expect(mockCapacityService.updateCapacity).toHaveBeenCalledWith(
        'cap-1',
        mockRequest.body,
        'tenant-1'
      );
      expect(mockReply.send).toHaveBeenCalledWith({ capacity: mockCapacity });
    });
  });

  describe('checkAvailability', () => {
    it('should check capacity availability', async () => {
      mockRequest.params = { id: 'cap-1' };
      mockRequest.body = { quantity: 10 };
      (mockRequest as any).tenantId = 'tenant-1';
      mockCapacityService.checkAvailability.mockResolvedValue(true);

      await capacityController.checkAvailability(
        mockRequest as any,
        mockReply as FastifyReply
      );

      expect(mockCapacityService.checkAvailability).toHaveBeenCalledWith('cap-1', 10, 'tenant-1');
      expect(mockReply.send).toHaveBeenCalledWith({ available: true, quantity: 10 });
    });
  });

  describe('reserveCapacity', () => {
    it('should reserve capacity', async () => {
      const mockCapacity = { id: 'cap-1', reserved_capacity: 10 };

      mockRequest.params = { id: 'cap-1' };
      mockRequest.body = { quantity: 10, reservation_minutes: 15 };
      mockRequest.headers = { authorization: 'Bearer token' };
      (mockRequest as any).tenantId = 'tenant-1';
      mockCapacityService.reserveCapacity.mockResolvedValue(mockCapacity as any);

      await capacityController.reserveCapacity(
        mockRequest as any,
        mockReply as FastifyReply
      );

      expect(mockCapacityService.reserveCapacity).toHaveBeenCalledWith(
        'cap-1',
        10,
        'tenant-1',
        15,
        undefined,
        'Bearer token'
      );
      expect(mockReply.send).toHaveBeenCalledWith({
        message: 'Capacity reserved successfully',
        capacity: mockCapacity,
        locked_price: null,
      });
    });

    it('should return 400 for insufficient capacity', async () => {
      mockRequest.params = { id: 'cap-1' };
      mockRequest.body = { quantity: 100 };
      (mockRequest as any).tenantId = 'tenant-1';

      const validationError: any = new Error('Insufficient capacity');
      validationError.details = [{ field: 'quantity', message: 'Insufficient capacity available' }];
      mockCapacityService.reserveCapacity.mockRejectedValue(validationError);

      await capacityController.reserveCapacity(
        mockRequest as any,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Insufficient capacity available',
        details: validationError.details,
      });
    });
  });
});
