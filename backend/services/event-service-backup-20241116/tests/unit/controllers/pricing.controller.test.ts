// Mock dependencies BEFORE imports
jest.mock('../../../src/config/database', () => ({
  db: jest.fn(),
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
import * as pricingController from '../../../src/controllers/pricing.controller';
import { PricingService } from '../../../src/services/pricing.service';

// Mock PricingService
jest.mock('../../../src/services/pricing.service');

describe('Pricing Controller', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockPricingService: jest.Mocked<PricingService>;

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

    // Mock PricingService instance
    mockPricingService = {
      getEventPricing: jest.fn(),
      getPricingById: jest.fn(),
      createPricing: jest.fn(),
      updatePricing: jest.fn(),
      calculatePrice: jest.fn(),
      getActivePricing: jest.fn(),
    } as any;

    (PricingService as jest.MockedClass<typeof PricingService>).mockImplementation(() => mockPricingService);
  });

  describe('getEventPricing', () => {
    it('should return event pricing tiers', async () => {
      const mockPricing = [
        { id: '1', name: 'General', base_price: 50 },
        { id: '2', name: 'VIP', base_price: 100 },
      ];

      mockRequest.params = { eventId: 'event-1' };
      (mockRequest as any).tenantId = 'tenant-1';
      mockPricingService.getEventPricing.mockResolvedValue(mockPricing as any);

      await pricingController.getEventPricing(
        mockRequest as FastifyRequest<{ Params: { eventId: string } }>,
        mockReply as FastifyReply
      );

      expect(mockPricingService.getEventPricing).toHaveBeenCalledWith('event-1', 'tenant-1');
      expect(mockReply.send).toHaveBeenCalledWith({ pricing: mockPricing });
    });

    it('should handle errors', async () => {
      mockRequest.params = { eventId: 'event-1' };
      (mockRequest as any).tenantId = 'tenant-1';
      mockPricingService.getEventPricing.mockRejectedValue(new Error('Database error'));

      await pricingController.getEventPricing(
        mockRequest as FastifyRequest<{ Params: { eventId: string } }>,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Failed to get pricing',
        message: 'Database error',
      });
    });
  });

  describe('getPricingById', () => {
    it('should return pricing by id', async () => {
      const mockPricing = { id: 'pricing-1', name: 'VIP', base_price: 100 };

      mockRequest.params = { id: 'pricing-1' };
      (mockRequest as any).tenantId = 'tenant-1';
      mockPricingService.getPricingById.mockResolvedValue(mockPricing as any);

      await pricingController.getPricingById(
        mockRequest as FastifyRequest<{ Params: { id: string } }>,
        mockReply as FastifyReply
      );

      expect(mockPricingService.getPricingById).toHaveBeenCalledWith('pricing-1', 'tenant-1');
      expect(mockReply.send).toHaveBeenCalledWith({ pricing: mockPricing });
    });

    it('should return 404 if pricing not found', async () => {
      mockRequest.params = { id: 'pricing-999' };
      (mockRequest as any).tenantId = 'tenant-1';
      mockPricingService.getPricingById.mockRejectedValue(new Error('Pricing not found'));

      await pricingController.getPricingById(
        mockRequest as FastifyRequest<{ Params: { id: string } }>,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Pricing not found' });
    });
  });

  describe('createPricing', () => {
    it('should create pricing tier', async () => {
      const mockPricing = { id: 'pricing-1', name: 'General', base_price: 50 };
      const requestBody = { name: 'General', base_price: 50 };

      mockRequest.params = { eventId: 'event-1' };
      mockRequest.body = requestBody;
      (mockRequest as any).tenantId = 'tenant-1';
      mockPricingService.createPricing.mockResolvedValue(mockPricing as any);

      await pricingController.createPricing(
        mockRequest as any,
        mockReply as FastifyReply
      );

      expect(mockPricingService.createPricing).toHaveBeenCalledWith(
        { ...requestBody, event_id: 'event-1' },
        'tenant-1'
      );
      expect(mockReply.status).toHaveBeenCalledWith(201);
      expect(mockReply.send).toHaveBeenCalledWith({ pricing: mockPricing });
    });

    it('should handle creation errors', async () => {
      mockRequest.params = { eventId: 'event-1' };
      mockRequest.body = { name: 'Test', base_price: 50 };
      (mockRequest as any).tenantId = 'tenant-1';
      mockPricingService.createPricing.mockRejectedValue(new Error('Database error'));

      await pricingController.createPricing(
        mockRequest as any,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  describe('updatePricing', () => {
    it('should update pricing', async () => {
      const mockPricing = { id: 'pricing-1', name: 'VIP Updated', base_price: 120 };

      mockRequest.params = { id: 'pricing-1' };
      mockRequest.body = { name: 'VIP Updated', base_price: 120 };
      (mockRequest as any).tenantId = 'tenant-1';
      mockPricingService.updatePricing.mockResolvedValue(mockPricing as any);

      await pricingController.updatePricing(
        mockRequest as any,
        mockReply as FastifyReply
      );

      expect(mockPricingService.updatePricing).toHaveBeenCalledWith(
        'pricing-1',
        mockRequest.body,
        'tenant-1'
      );
      expect(mockReply.send).toHaveBeenCalledWith({ pricing: mockPricing });
    });

    it('should return 404 if pricing not found', async () => {
      mockRequest.params = { id: 'pricing-999' };
      mockRequest.body = { base_price: 120 };
      (mockRequest as any).tenantId = 'tenant-1';
      mockPricingService.updatePricing.mockRejectedValue(new Error('Pricing not found'));

      await pricingController.updatePricing(
        mockRequest as any,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });
  });

  describe('calculatePrice', () => {
    it('should calculate price for quantity', async () => {
      const mockCalculation = {
        base_price: 100,
        service_fee: 10,
        facility_fee: 5,
        tax: 11.5,
        subtotal: 115,
        total: 126.5,
        per_ticket: 63.25,
      };

      mockRequest.params = { id: 'pricing-1' };
      mockRequest.body = { quantity: 2 };
      (mockRequest as any).tenantId = 'tenant-1';
      mockPricingService.calculatePrice.mockResolvedValue(mockCalculation as any);

      await pricingController.calculatePrice(
        mockRequest as any,
        mockReply as FastifyReply
      );

      expect(mockPricingService.calculatePrice).toHaveBeenCalledWith('pricing-1', 2, 'tenant-1');
      expect(mockReply.send).toHaveBeenCalledWith(mockCalculation);
    });

    it('should return 400 for invalid quantity', async () => {
      mockRequest.params = { id: 'pricing-1' };
      mockRequest.body = { quantity: 0 };
      (mockRequest as any).tenantId = 'tenant-1';

      await pricingController.calculatePrice(
        mockRequest as any,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid quantity' });
    });

    it('should return 404 if pricing not found', async () => {
      mockRequest.params = { id: 'pricing-999' };
      mockRequest.body = { quantity: 1 };
      (mockRequest as any).tenantId = 'tenant-1';
      mockPricingService.calculatePrice.mockRejectedValue(new Error('Pricing not found'));

      await pricingController.calculatePrice(
        mockRequest as any,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });
  });

  describe('getActivePricing', () => {
    it('should return active pricing', async () => {
      const mockPricing = [
        { id: '1', name: 'General', base_price: 50, is_active: true },
      ];

      mockRequest.params = { eventId: 'event-1' };
      (mockRequest as any).tenantId = 'tenant-1';
      mockPricingService.getActivePricing.mockResolvedValue(mockPricing as any);

      await pricingController.getActivePricing(
        mockRequest as FastifyRequest<{ Params: { eventId: string } }>,
        mockReply as FastifyReply
      );

      expect(mockPricingService.getActivePricing).toHaveBeenCalledWith('event-1', 'tenant-1');
      expect(mockReply.send).toHaveBeenCalledWith({ pricing: mockPricing });
    });
  });
});
