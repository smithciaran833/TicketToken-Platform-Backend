/**
 * Unit tests for EventPricingModel
 * Tests pricing operations and calculations
 */

import { EventPricingModel, IEventPricing } from '../../../src/models/event-pricing.model';
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

describe('EventPricingModel', () => {
  let mockDb: any;
  let model: EventPricingModel;

  const mockPricing: IEventPricing = {
    id: 'price-123',
    event_id: 'event-123',
    schedule_id: 'schedule-1',
    capacity_id: 'cap-123',
    tier_name: 'General Admission',
    tier_code: 'GA',
    base_price: 50.00,
    currency: 'USD',
    service_fee: 5.00,
    facility_fee: 2.50,
    tax_rate: 0.08,
    tax_included: false,
    face_value: 50.00,
    min_price: 25.00,
    max_price: 100.00,
    dynamic_pricing_enabled: true,
    dynamic_pricing_config: {
      algorithm: 'demand_based',
      floor_multiplier: 0.5,
      ceiling_multiplier: 2.0,
    },
    early_bird_price: 40.00,
    early_bird_ends_at: new Date('2026-01-15'),
    last_minute_price: 75.00,
    last_minute_starts_at: new Date('2026-02-28'),
    group_discount_threshold: 10,
    group_discount_percentage: 15,
    resale_floor_price: 25.00,
    resale_ceiling_price: 150.00,
    resale_royalty_percentage: 10,
    sales_start_at: new Date('2026-01-01'),
    sales_end_at: new Date('2026-03-01'),
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(() => {
    mockDb = createKnexMock();
    model = new EventPricingModel(mockDb);
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with event_pricing table', () => {
      expect(model).toBeInstanceOf(EventPricingModel);
      expect((model as any).tableName).toBe('event_pricing');
    });
  });

  describe('findByEventId', () => {
    it('should find pricing by event ID', async () => {
      configureMockArray(mockDb, [mockPricing]);

      const result = await model.findByEventId('event-123');

      expect(mockDb).toHaveBeenCalledWith('event_pricing');
      expect(mockDb._mockChain.where).toHaveBeenCalledWith({ event_id: 'event-123', is_active: true });
      expect(result).toHaveLength(1);
      expect(result[0].tier_name).toBe('General Admission');
    });

    it('should return empty array when no pricing found', async () => {
      configureMockArray(mockDb, []);

      const result = await model.findByEventId('non-existent');

      expect(result).toEqual([]);
    });

    it('should return multiple pricing tiers', async () => {
      const tiers = [
        { ...mockPricing, id: 'price-1', tier_name: 'GA', base_price: 50 },
        { ...mockPricing, id: 'price-2', tier_name: 'VIP', base_price: 150 },
        { ...mockPricing, id: 'price-3', tier_name: 'Premium', base_price: 250 },
      ];
      configureMockArray(mockDb, tiers);

      const result = await model.findByEventId('event-123');

      expect(result).toHaveLength(3);
    });
  });

  describe('findByScheduleId', () => {
    it('should find pricing by schedule ID', async () => {
      configureMockArray(mockDb, [mockPricing]);

      const result = await model.findByScheduleId('schedule-1');

      expect(mockDb._mockChain.where).toHaveBeenCalledWith({ schedule_id: 'schedule-1', is_active: true });
      expect(result).toHaveLength(1);
    });

    it('should return empty array when no pricing for schedule', async () => {
      configureMockArray(mockDb, []);

      const result = await model.findByScheduleId('non-existent');

      expect(result).toEqual([]);
    });
  });

  describe('findByCapacityId', () => {
    it('should find pricing by capacity ID', async () => {
      configureMockArray(mockDb, [mockPricing]);

      const result = await model.findByCapacityId('cap-123');

      expect(mockDb._mockChain.where).toHaveBeenCalledWith({ capacity_id: 'cap-123', is_active: true });
      expect(result).toHaveLength(1);
    });
  });

  describe('getActivePricing', () => {
    it('should find active pricing for current date', async () => {
      configureMockArray(mockDb, [mockPricing]);

      const result = await model.getActivePricing('event-123');

      expect(mockDb).toHaveBeenCalledWith('event_pricing');
      expect(mockDb._mockChain.where).toHaveBeenCalledWith({ event_id: 'event-123', is_active: true });
      expect(result).toHaveLength(1);
    });

    it('should filter by sales_start_at and sales_end_at', async () => {
      configureMockArray(mockDb, [mockPricing]);

      await model.getActivePricing('event-123');

      // Should check for current date being within sales window
      expect(mockDb._mockChain.where).toHaveBeenCalled();
    });

    it('should return empty when outside sales window', async () => {
      configureMockArray(mockDb, []);

      const result = await model.getActivePricing('event-123');

      expect(result).toEqual([]);
    });
  });

  describe('calculateTotalPrice', () => {
    it('should calculate total price with all fees', async () => {
      configureMockReturn(mockDb, mockPricing);

      const result = await model.calculateTotalPrice('price-123', 2);

      expect(mockDb._mockChain.where).toHaveBeenCalledWith({ id: 'price-123' });
      expect(result).toBeDefined();
      expect(result.quantity).toBe(2);
    });

    it('should include base price in calculation', async () => {
      configureMockReturn(mockDb, mockPricing);

      const result = await model.calculateTotalPrice('price-123', 1);

      expect(result.base_total).toBe(50.00);
    });

    it('should include service fee', async () => {
      configureMockReturn(mockDb, mockPricing);

      const result = await model.calculateTotalPrice('price-123', 1);

      expect(result.service_fee_total).toBe(5.00);
    });

    it('should include facility fee', async () => {
      configureMockReturn(mockDb, mockPricing);

      const result = await model.calculateTotalPrice('price-123', 1);

      expect(result.facility_fee_total).toBe(2.50);
    });

    it('should calculate tax correctly', async () => {
      configureMockReturn(mockDb, mockPricing);

      const result = await model.calculateTotalPrice('price-123', 1);

      // Tax on (50 + 5 + 2.50) * 0.08 = 4.60
      expect(result.tax_total).toBeCloseTo(4.60, 2);
    });

    it('should multiply by quantity', async () => {
      configureMockReturn(mockDb, mockPricing);

      const result = await model.calculateTotalPrice('price-123', 5);

      expect(result.quantity).toBe(5);
      expect(result.base_total).toBe(250.00);
    });

    it('should return null for non-existent pricing', async () => {
      configureMockReturn(mockDb, null);

      const result = await model.calculateTotalPrice('non-existent', 1);

      expect(result).toBeNull();
    });

    it('should handle tax_included = true', async () => {
      const taxIncludedPricing = { ...mockPricing, tax_included: true };
      configureMockReturn(mockDb, taxIncludedPricing);

      const result = await model.calculateTotalPrice('price-123', 1);

      expect(result.tax_included).toBe(true);
    });
  });

  describe('inherited BaseModel methods', () => {
    describe('findById', () => {
      it('should find pricing by ID', async () => {
        configureMockReturn(mockDb, mockPricing);

        const result = await model.findById('price-123');

        expect(mockDb._mockChain.where).toHaveBeenCalledWith({ id: 'price-123' });
        expect(result?.tier_name).toBe('General Admission');
      });
    });

    describe('create', () => {
      it('should create new pricing record', async () => {
        mockDb._mockChain.returning.mockResolvedValue([mockPricing]);

        const result = await model.create({
          event_id: 'event-123',
          tier_name: 'VIP',
          base_price: 150.00,
        });

        expect(mockDb._mockChain.insert).toHaveBeenCalled();
        expect(result.tier_name).toBe('General Admission');
      });
    });

    describe('update', () => {
      it('should update pricing record', async () => {
        const updated = { ...mockPricing, base_price: 75.00 };
        mockDb._mockChain.returning.mockResolvedValue([updated]);

        const result = await model.update('price-123', { base_price: 75.00 });

        expect(result?.base_price).toBe(75.00);
      });
    });
  });

  describe('pricing scenarios', () => {
    it('should handle early bird pricing', async () => {
      const earlyBird: IEventPricing = {
        ...mockPricing,
        early_bird_price: 35.00,
        early_bird_ends_at: new Date(Date.now() + 86400000), // Tomorrow
      };
      configureMockReturn(mockDb, earlyBird);

      const result = await model.findById('price-123');

      expect(result?.early_bird_price).toBe(35.00);
      expect(result?.early_bird_ends_at).toBeDefined();
    });

    it('should handle last minute pricing', async () => {
      const lastMinute: IEventPricing = {
        ...mockPricing,
        last_minute_price: 80.00,
        last_minute_starts_at: new Date(Date.now() - 86400000), // Yesterday
      };
      configureMockReturn(mockDb, lastMinute);

      const result = await model.findById('price-123');

      expect(result?.last_minute_price).toBe(80.00);
    });

    it('should handle dynamic pricing config', async () => {
      const dynamic: IEventPricing = {
        ...mockPricing,
        dynamic_pricing_enabled: true,
        dynamic_pricing_config: {
          algorithm: 'surge',
          base_multiplier: 1.0,
          demand_factor: 0.1,
          time_factor: 0.05,
        },
      };
      configureMockReturn(mockDb, dynamic);

      const result = await model.findById('price-123');

      expect(result?.dynamic_pricing_enabled).toBe(true);
      expect(result?.dynamic_pricing_config?.algorithm).toBe('surge');
    });

    it('should handle group discounts', async () => {
      const groupDiscount: IEventPricing = {
        ...mockPricing,
        group_discount_threshold: 5,
        group_discount_percentage: 20,
      };
      configureMockReturn(mockDb, groupDiscount);

      const result = await model.findById('price-123');

      expect(result?.group_discount_threshold).toBe(5);
      expect(result?.group_discount_percentage).toBe(20);
    });

    it('should handle resale pricing constraints', async () => {
      const resale: IEventPricing = {
        ...mockPricing,
        resale_floor_price: 30.00,
        resale_ceiling_price: 200.00,
        resale_royalty_percentage: 15,
      };
      configureMockReturn(mockDb, resale);

      const result = await model.findById('price-123');

      expect(result?.resale_floor_price).toBe(30.00);
      expect(result?.resale_ceiling_price).toBe(200.00);
      expect(result?.resale_royalty_percentage).toBe(15);
    });

    it('should handle different currencies', async () => {
      const currencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'];
      
      for (const currency of currencies) {
        const currencyPricing = { ...mockPricing, currency };
        configureMockReturn(mockDb, currencyPricing);

        const result = await model.findById('price-123');
        expect(result?.currency).toBe(currency);
      }
    });
  });

  describe('edge cases', () => {
    it('should handle zero base price (free events)', async () => {
      const freePricing: IEventPricing = {
        ...mockPricing,
        base_price: 0,
        service_fee: 0,
        facility_fee: 0,
      };
      configureMockReturn(mockDb, freePricing);

      const result = await model.calculateTotalPrice('price-123', 1);

      expect(result.base_total).toBe(0);
      expect(result.grand_total).toBe(0);
    });

    it('should handle zero tax rate', async () => {
      const noTax: IEventPricing = {
        ...mockPricing,
        tax_rate: 0,
      };
      configureMockReturn(mockDb, noTax);

      const result = await model.calculateTotalPrice('price-123', 1);

      expect(result.tax_total).toBe(0);
    });

    it('should handle pricing with no dynamic config', async () => {
      const staticPricing: IEventPricing = {
        ...mockPricing,
        dynamic_pricing_enabled: false,
        dynamic_pricing_config: null as any,
      };
      configureMockReturn(mockDb, staticPricing);

      const result = await model.findById('price-123');

      expect(result?.dynamic_pricing_enabled).toBe(false);
    });

    it('should handle high precision decimal prices', async () => {
      const precisionPricing: IEventPricing = {
        ...mockPricing,
        base_price: 49.99,
        service_fee: 4.99,
        facility_fee: 2.49,
      };
      configureMockReturn(mockDb, precisionPricing);

      const result = await model.findById('price-123');

      expect(result?.base_price).toBe(49.99);
    });

    it('should handle minimum/maximum price constraints', async () => {
      const constrained: IEventPricing = {
        ...mockPricing,
        min_price: 10.00,
        max_price: 500.00,
      };
      configureMockReturn(mockDb, constrained);

      const result = await model.findById('price-123');

      expect(result?.min_price).toBe(10.00);
      expect(result?.max_price).toBe(500.00);
    });

    it('should handle inactive pricing', async () => {
      const inactive: IEventPricing = {
        ...mockPricing,
        is_active: false,
      };
      configureMockReturn(mockDb, inactive);

      const result = await model.findById('price-123');

      expect(result?.is_active).toBe(false);
    });
  });
});
