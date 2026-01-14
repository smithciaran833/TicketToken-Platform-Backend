/**
 * Pricing Controller Unit Tests
 * 
 * Tests the pricing controller handlers for:
 * - getEventPricing: Get all pricing for an event
 * - getPricingById: Get specific pricing
 * - createPricing: Create new pricing
 * - updatePricing: Update pricing
 * - calculatePrice: Calculate total price with fees
 * - getActivePricing: Get currently active pricing
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import {
  getEventPricing,
  getPricingById,
  createPricing,
  updatePricing,
  calculatePrice,
  getActivePricing
} from '../../../src/controllers/pricing.controller';

// Mock dependencies
jest.mock('../../../src/config/database', () => ({
  db: {}
}));

jest.mock('../../../src/services/pricing.service', () => ({
  PricingService: jest.fn().mockImplementation(() => ({
    getEventPricing: jest.fn(),
    getPricingById: jest.fn(),
    createPricing: jest.fn(),
    updatePricing: jest.fn(),
    calculatePrice: jest.fn(),
    getActivePricing: jest.fn()
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

import { PricingService } from '../../../src/services/pricing.service';

describe('Pricing Controller', () => {
  let mockPricingService: any;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockPricingService = {
      getEventPricing: jest.fn(),
      getPricingById: jest.fn(),
      createPricing: jest.fn(),
      updatePricing: jest.fn(),
      calculatePrice: jest.fn(),
      getActivePricing: jest.fn()
    };

    (PricingService as jest.Mock).mockImplementation(() => mockPricingService);

    mockRequest = {
      params: {},
      body: {},
      headers: {}
    };
    (mockRequest as any).tenantId = 'tenant-123';

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };
  });

  describe('getEventPricing', () => {
    it('should return pricing for an event', async () => {
      const pricing = [
        { id: 'price-1', name: 'VIP', base_price: 100.00 },
        { id: 'price-2', name: 'GA', base_price: 50.00 }
      ];
      mockPricingService.getEventPricing.mockResolvedValue(pricing);
      (mockRequest.params as any) = { eventId: 'event-123' };

      await getEventPricing(mockRequest as FastifyRequest<any>, mockReply as FastifyReply);

      expect(mockPricingService.getEventPricing).toHaveBeenCalledWith('event-123', 'tenant-123');
      expect(mockReply.send).toHaveBeenCalledWith({ pricing });
    });

    it('should return empty array when no pricing exists', async () => {
      mockPricingService.getEventPricing.mockResolvedValue([]);
      (mockRequest.params as any) = { eventId: 'event-123' };

      await getEventPricing(mockRequest as FastifyRequest<any>, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith({ pricing: [] });
    });
  });

  describe('getPricingById', () => {
    it('should return pricing when found', async () => {
      const pricing = { id: 'price-123', name: 'VIP', base_price: 100.00 };
      mockPricingService.getPricingById.mockResolvedValue(pricing);
      (mockRequest.params as any) = { id: 'price-123' };

      await getPricingById(mockRequest as FastifyRequest<any>, mockReply as FastifyReply);

      expect(mockPricingService.getPricingById).toHaveBeenCalledWith('price-123', 'tenant-123');
      expect(mockReply.send).toHaveBeenCalledWith({ pricing });
    });

    it('should throw NOT_FOUND when pricing does not exist', async () => {
      mockPricingService.getPricingById.mockResolvedValue(null);
      (mockRequest.params as any) = { id: 'nonexistent-123' };

      await expect(
        getPricingById(mockRequest as FastifyRequest<any>, mockReply as FastifyReply)
      ).rejects.toThrow('Pricing not found');
    });
  });

  describe('createPricing', () => {
    const validPricingData = {
      name: 'VIP Ticket',
      base_price: 100.00,
      service_fee: 5.00,
      facility_fee: 3.00,
      tax_rate: 0.08
    };

    it('should create pricing successfully', async () => {
      const createdPricing = { id: 'price-123', ...validPricingData };
      mockPricingService.createPricing.mockResolvedValue(createdPricing);
      (mockRequest.params as any) = { eventId: 'event-123' };
      mockRequest.body = validPricingData;

      await createPricing(mockRequest as FastifyRequest<any>, mockReply as FastifyReply);

      expect(mockPricingService.createPricing).toHaveBeenCalledWith(
        { ...validPricingData, event_id: 'event-123' },
        'tenant-123'
      );
      expect(mockReply.status).toHaveBeenCalledWith(201);
      expect(mockReply.send).toHaveBeenCalledWith({ pricing: createdPricing });
    });

    it('should create pricing with capacity_id and schedule_id', async () => {
      const pricingWithRefs = {
        ...validPricingData,
        capacity_id: 'cap-123',
        schedule_id: 'sched-123'
      };
      mockPricingService.createPricing.mockResolvedValue({ id: 'price-123', ...pricingWithRefs });
      (mockRequest.params as any) = { eventId: 'event-123' };
      mockRequest.body = pricingWithRefs;

      await createPricing(mockRequest as FastifyRequest<any>, mockReply as FastifyReply);

      expect(mockPricingService.createPricing).toHaveBeenCalledWith(
        expect.objectContaining({
          capacity_id: 'cap-123',
          schedule_id: 'sched-123'
        }),
        'tenant-123'
      );
    });

    it('should create pricing with tier designation', async () => {
      const tieredPricing = { ...validPricingData, tier: 'premium' };
      mockPricingService.createPricing.mockResolvedValue({ id: 'price-123', ...tieredPricing });
      (mockRequest.params as any) = { eventId: 'event-123' };
      mockRequest.body = tieredPricing;

      await createPricing(mockRequest as FastifyRequest<any>, mockReply as FastifyReply);

      expect(mockPricingService.createPricing).toHaveBeenCalledWith(
        expect.objectContaining({ tier: 'premium' }),
        'tenant-123'
      );
    });
  });

  describe('updatePricing', () => {
    const updateData = { name: 'Updated VIP', base_price: 120.00 };

    it('should update pricing successfully', async () => {
      const updatedPricing = { id: 'price-123', ...updateData };
      mockPricingService.updatePricing.mockResolvedValue(updatedPricing);
      (mockRequest.params as any) = { id: 'price-123' };
      mockRequest.body = updateData;

      await updatePricing(mockRequest as FastifyRequest<any>, mockReply as FastifyReply);

      expect(mockPricingService.updatePricing).toHaveBeenCalledWith(
        'price-123',
        updateData,
        'tenant-123'
      );
      expect(mockReply.send).toHaveBeenCalledWith({ pricing: updatedPricing });
    });

    it('should throw NOT_FOUND when pricing does not exist', async () => {
      mockPricingService.updatePricing.mockResolvedValue(null);
      (mockRequest.params as any) = { id: 'nonexistent-123' };
      mockRequest.body = updateData;

      await expect(
        updatePricing(mockRequest as FastifyRequest<any>, mockReply as FastifyReply)
      ).rejects.toThrow('Pricing not found');
    });

    it('should update is_active flag', async () => {
      mockPricingService.updatePricing.mockResolvedValue({ id: 'price-123', is_active: false });
      (mockRequest.params as any) = { id: 'price-123' };
      mockRequest.body = { is_active: false };

      await updatePricing(mockRequest as FastifyRequest<any>, mockReply as FastifyReply);

      expect(mockPricingService.updatePricing).toHaveBeenCalledWith(
        'price-123',
        { is_active: false },
        'tenant-123'
      );
    });

    it('should update current_price for dynamic pricing', async () => {
      mockPricingService.updatePricing.mockResolvedValue({ id: 'price-123', current_price: 95.00 });
      (mockRequest.params as any) = { id: 'price-123' };
      mockRequest.body = { current_price: 95.00 };

      await updatePricing(mockRequest as FastifyRequest<any>, mockReply as FastifyReply);

      expect(mockPricingService.updatePricing).toHaveBeenCalledWith(
        'price-123',
        { current_price: 95.00 },
        'tenant-123'
      );
    });
  });

  describe('calculatePrice', () => {
    it('should calculate price for quantity', async () => {
      const calculation = {
        base_total: 200.00,
        service_fee_total: 10.00,
        facility_fee_total: 6.00,
        tax_total: 17.28,
        grand_total: 233.28
      };
      mockPricingService.calculatePrice.mockResolvedValue(calculation);
      (mockRequest.params as any) = { id: 'price-123' };
      mockRequest.body = { quantity: 2 };

      await calculatePrice(mockRequest as FastifyRequest<any>, mockReply as FastifyReply);

      expect(mockPricingService.calculatePrice).toHaveBeenCalledWith('price-123', 2, 'tenant-123');
      expect(mockReply.send).toHaveBeenCalledWith(calculation);
    });

    it('should throw INVALID_QUANTITY when quantity is less than 1', async () => {
      (mockRequest.params as any) = { id: 'price-123' };
      mockRequest.body = { quantity: 0 };

      await expect(
        calculatePrice(mockRequest as FastifyRequest<any>, mockReply as FastifyReply)
      ).rejects.toThrow('Quantity must be at least 1');
    });

    it('should throw INVALID_QUANTITY when quantity is negative', async () => {
      (mockRequest.params as any) = { id: 'price-123' };
      mockRequest.body = { quantity: -1 };

      await expect(
        calculatePrice(mockRequest as FastifyRequest<any>, mockReply as FastifyReply)
      ).rejects.toThrow('Quantity must be at least 1');
    });

    it('should throw INVALID_QUANTITY when quantity is missing', async () => {
      (mockRequest.params as any) = { id: 'price-123' };
      mockRequest.body = {};

      await expect(
        calculatePrice(mockRequest as FastifyRequest<any>, mockReply as FastifyReply)
      ).rejects.toThrow('Quantity must be at least 1');
    });

    it('should throw NOT_FOUND when pricing does not exist', async () => {
      mockPricingService.calculatePrice.mockResolvedValue(null);
      (mockRequest.params as any) = { id: 'nonexistent-123' };
      mockRequest.body = { quantity: 1 };

      await expect(
        calculatePrice(mockRequest as FastifyRequest<any>, mockReply as FastifyReply)
      ).rejects.toThrow('Pricing not found');
    });
  });

  describe('getActivePricing', () => {
    it('should return active pricing for an event', async () => {
      const activePricing = [
        { id: 'price-1', name: 'VIP', is_active: true },
        { id: 'price-2', name: 'GA', is_active: true }
      ];
      mockPricingService.getActivePricing.mockResolvedValue(activePricing);
      (mockRequest.params as any) = { eventId: 'event-123' };

      await getActivePricing(mockRequest as FastifyRequest<any>, mockReply as FastifyReply);

      expect(mockPricingService.getActivePricing).toHaveBeenCalledWith('event-123', 'tenant-123');
      expect(mockReply.send).toHaveBeenCalledWith({ pricing: activePricing });
    });

    it('should return empty array when no active pricing exists', async () => {
      mockPricingService.getActivePricing.mockResolvedValue([]);
      (mockRequest.params as any) = { eventId: 'event-123' };

      await getActivePricing(mockRequest as FastifyRequest<any>, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith({ pricing: [] });
    });
  });

  describe('Edge Cases', () => {
    it('should handle service errors', async () => {
      mockPricingService.getEventPricing.mockRejectedValue(new Error('Database error'));
      (mockRequest.params as any) = { eventId: 'event-123' };

      await expect(
        getEventPricing(mockRequest as FastifyRequest<any>, mockReply as FastifyReply)
      ).rejects.toThrow('Database error');
    });

    it('should create new PricingService instance for each request', async () => {
      mockPricingService.getEventPricing.mockResolvedValue([]);
      (mockRequest.params as any) = { eventId: 'event-123' };

      await getEventPricing(mockRequest as FastifyRequest<any>, mockReply as FastifyReply);
      await getEventPricing(mockRequest as FastifyRequest<any>, mockReply as FastifyReply);

      expect(PricingService).toHaveBeenCalledTimes(2);
    });
  });
});
