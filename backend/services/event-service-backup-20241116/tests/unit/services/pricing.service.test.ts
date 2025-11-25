jest.mock('pino', () => ({
  pino: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  })),
}));

import { PricingService } from '../../../src/services/pricing.service';
import { NotFoundError, ValidationError } from '../../../src/types';

describe('Pricing Service', () => {
  let pricingService: PricingService;
  let mockDb: any;
  let mockQueryBuilder: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      whereNull: jest.fn().mockReturnThis(),
      whereNotNull: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      orWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockResolvedValue([]),
      first: jest.fn().mockResolvedValue(null),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([]),
      orderBy: jest.fn().mockReturnThis(),
    };

    mockDb = jest.fn(() => mockQueryBuilder);

    pricingService = new PricingService(mockDb as any);
  });

  describe('getEventPricing', () => {
    it('should get pricing for event', async () => {
      const mockPricing = [
        { id: '1', event_id: 'event-1', base_price: '50' },
        { id: '2', event_id: 'event-1', base_price: '100' },
      ];
      // FIXED: select() returns the data, not orderBy()
      mockQueryBuilder.select.mockResolvedValue(mockPricing);

      const result = await pricingService.getEventPricing('event-1', 'tenant-1');

      expect(mockQueryBuilder.where).toHaveBeenCalledWith({
        event_id: 'event-1',
        tenant_id: 'tenant-1'
      });
      expect(result).toHaveLength(2);
    });
  });

  describe('getPricingById', () => {
    it('should get pricing by id', async () => {
      const mockPricing = { id: 'pricing-1', base_price: '50' };
      mockQueryBuilder.first.mockResolvedValue(mockPricing);

      const result = await pricingService.getPricingById('pricing-1', 'tenant-1');

      expect(result).toBeDefined();
    });

    it('should throw NotFoundError if not found', async () => {
      mockQueryBuilder.first.mockResolvedValue(null);

      await expect(
        pricingService.getPricingById('pricing-999', 'tenant-1')
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('createPricing', () => {
    it('should create pricing tier', async () => {
      const data = {
        event_id: 'event-1',
        name: 'General Admission',
        base_price: 50,
      };
      const mockCreated = { id: 'pricing-1', ...data };

      mockQueryBuilder.returning.mockResolvedValue([mockCreated]);

      const result = await pricingService.createPricing(data, 'tenant-1');

      expect(mockQueryBuilder.insert).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw ValidationError for negative price', async () => {
      await expect(
        pricingService.createPricing({
          event_id: 'event-1',
          name: 'Test',
          base_price: -10,
        }, 'tenant-1')
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when min_price exceeds max_price', async () => {
      await expect(
        pricingService.createPricing({
          event_id: 'event-1',
          name: 'Test',
          base_price: 50,
          is_dynamic: true,
          min_price: 100,
          max_price: 50,
        }, 'tenant-1')
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('updatePricing', () => {
    it('should update pricing', async () => {
      const existing = { id: 'pricing-1', base_price: '50', event_id: 'event-1', name: 'Test' };
      const updated = { ...existing, base_price: '60' };

      mockQueryBuilder.first.mockResolvedValue(existing);
      mockQueryBuilder.returning.mockResolvedValue([updated]);

      const result = await pricingService.updatePricing('pricing-1', { base_price: 60 }, 'tenant-1');

      expect(mockQueryBuilder.update).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('calculatePrice', () => {
    it('should calculate total price with fees', async () => {
      const mockPricing = {
        id: 'pricing-1',
        base_price: '100',
        service_fee: '10',
        facility_fee: '5',
        tax_rate: '0.1',
        is_dynamic: false,
      };
      mockQueryBuilder.first.mockResolvedValue(mockPricing);

      const result = await pricingService.calculatePrice('pricing-1', 2, 'tenant-1');

      // (100 + 10 + 5) * 2 = 230, * 1.1 = 253
      expect(result.total).toBe(253);
    });

    it('should use current_price for dynamic pricing', async () => {
      const mockPricing = {
        id: 'pricing-1',
        base_price: '100',
        current_price: '120',
        service_fee: '10',
        facility_fee: '5',
        tax_rate: '0.1',
        is_dynamic: true,
      };
      mockQueryBuilder.first.mockResolvedValue(mockPricing);

      const result = await pricingService.calculatePrice('pricing-1', 1, 'tenant-1');

      // (120 + 10 + 5) * 1.1 = 148.5
      expect(result.total).toBe(148.5);
    });

    it('should throw NotFoundError if pricing not found', async () => {
      mockQueryBuilder.first.mockResolvedValue(null);

      await expect(
        pricingService.calculatePrice('pricing-999', 1, 'tenant-1')
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('getActivePricing', () => {
    it('should get active pricing for event', async () => {
      const mockPricing = [{ id: '1', is_active: true, is_visible: true }];
      mockQueryBuilder.select.mockResolvedValue(mockPricing);

      const result = await pricingService.getActivePricing('event-1', 'tenant-1');

      expect(result).toBeDefined();
    });
  });

  describe('updateDynamicPrice', () => {
    it('should update dynamic price', async () => {
      const existing = { id: 'pricing-1', is_dynamic: true, base_price: '100' };
      const updated = { ...existing, current_price: '120' };

      mockQueryBuilder.first
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(existing);
      mockQueryBuilder.returning.mockResolvedValue([updated]);

      const result = await pricingService.updateDynamicPrice('pricing-1', 120, 'tenant-1');

      expect(mockQueryBuilder.update).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });
});
