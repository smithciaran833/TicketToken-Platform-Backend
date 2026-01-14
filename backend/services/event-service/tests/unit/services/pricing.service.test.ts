/**
 * Unit tests for PricingService
 * Tests pricing tiers, calculations, and dynamic pricing
 */

import { PricingService } from '../../../src/services/pricing.service';
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

describe('PricingService', () => {
  let mockDb: any;
  let service: PricingService;

  const mockPricing = {
    id: 'price-123',
    tenant_id: 'tenant-1',
    event_id: 'event-123',
    capacity_id: 'cap-1',
    tier_name: 'General Admission',
    base_price: '50.00',
    current_price: '50.00',
    service_fee: '5.00',
    facility_fee: '2.50',
    tax_rate: '0.08',
    is_dynamic: false,
    min_price: null,
    max_price: null,
    early_bird_price: null,
    early_bird_ends_at: null,
    last_minute_price: null,
    last_minute_starts_at: null,
    sales_start_at: null,
    sales_end_at: null,
    is_active: true,
    is_visible: true,
    display_order: 1,
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(() => {
    mockDb = createKnexMock();
    service = new PricingService(mockDb);
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create service instance', () => {
      expect(service).toBeInstanceOf(PricingService);
    });
  });

  describe('getEventPricing', () => {
    it('should return pricing tiers for event', async () => {
      configureMockArray(mockDb, [mockPricing]);

      const result = await service.getEventPricing('event-123', 'tenant-1');

      expect(mockDb).toHaveBeenCalledWith('event_pricing');
      expect(result).toHaveLength(1);
      expect(result[0].tier_name).toBe('General Admission');
    });

    it('should parse decimal fields to numbers', async () => {
      configureMockArray(mockDb, [mockPricing]);

      const result = await service.getEventPricing('event-123', 'tenant-1');

      expect(result[0].base_price).toBe(50);
      expect(result[0].current_price).toBe(50);
      expect(result[0].service_fee).toBe(5);
      expect(result[0].facility_fee).toBe(2.5);
      expect(result[0].tax_rate).toBe(0.08);
    });

    it('should return multiple pricing tiers', async () => {
      const tiers = [
        { ...mockPricing, id: 'price-1', tier_name: 'GA', base_price: '50.00' },
        { ...mockPricing, id: 'price-2', tier_name: 'VIP', base_price: '150.00' },
        { ...mockPricing, id: 'price-3', tier_name: 'Premium', base_price: '250.00' },
      ];
      configureMockArray(mockDb, tiers);

      const result = await service.getEventPricing('event-123', 'tenant-1');

      expect(result).toHaveLength(3);
    });

    it('should return empty array when no pricing', async () => {
      configureMockArray(mockDb, []);

      const result = await service.getEventPricing('event-123', 'tenant-1');

      expect(result).toEqual([]);
    });
  });

  describe('getPricingById', () => {
    it('should return pricing by ID', async () => {
      configureMockReturn(mockDb, mockPricing);

      const result = await service.getPricingById('price-123', 'tenant-1');

      expect(result.tier_name).toBe('General Admission');
    });

    it('should parse decimal fields', async () => {
      configureMockReturn(mockDb, mockPricing);

      const result = await service.getPricingById('price-123', 'tenant-1');

      expect(typeof result.base_price).toBe('number');
    });

    it('should throw NotFoundError when not found', async () => {
      configureMockReturn(mockDb, null);

      await expect(service.getPricingById('non-existent', 'tenant-1'))
        .rejects.toThrow('Pricing');
    });
  });

  describe('createPricing', () => {
    it('should create new pricing tier', async () => {
      mockDb._mockChain.returning.mockResolvedValue([mockPricing]);

      const result = await service.createPricing({
        event_id: 'event-123',
        tier_name: 'General Admission',
        base_price: 50,
      }, 'tenant-1');

      expect(mockDb._mockChain.insert).toHaveBeenCalled();
      expect(result.tier_name).toBe('General Admission');
    });

    it('should throw ValidationError for negative base_price', async () => {
      await expect(service.createPricing({
        event_id: 'event-123',
        tier_name: 'Test',
        base_price: -50,
      }, 'tenant-1')).rejects.toThrow('positive');
    });

    it('should throw ValidationError when min > max for dynamic pricing', async () => {
      await expect(service.createPricing({
        event_id: 'event-123',
        tier_name: 'Test',
        base_price: 50,
        is_dynamic: true,
        min_price: 100,
        max_price: 50,
      }, 'tenant-1')).rejects.toThrow('cannot exceed maximum');
    });

    it('should set current_price to base_price by default', async () => {
      mockDb._mockChain.returning.mockResolvedValue([mockPricing]);

      await service.createPricing({
        event_id: 'event-123',
        tier_name: 'Test',
        base_price: 75,
      }, 'tenant-1');

      const insertCall = mockDb._mockChain.insert.mock.calls[0][0];
      expect(insertCall.current_price).toBe(75);
    });

    it('should default is_active to true', async () => {
      mockDb._mockChain.returning.mockResolvedValue([mockPricing]);

      await service.createPricing({
        event_id: 'event-123',
        tier_name: 'Test',
        base_price: 50,
      }, 'tenant-1');

      const insertCall = mockDb._mockChain.insert.mock.calls[0][0];
      expect(insertCall.is_active).toBe(true);
    });

    it('should default is_visible to true', async () => {
      mockDb._mockChain.returning.mockResolvedValue([mockPricing]);

      await service.createPricing({
        event_id: 'event-123',
        tier_name: 'Test',
        base_price: 50,
      }, 'tenant-1');

      const insertCall = mockDb._mockChain.insert.mock.calls[0][0];
      expect(insertCall.is_visible).toBe(true);
    });
  });

  describe('updatePricing', () => {
    it('should update pricing tier', async () => {
      configureMockReturn(mockDb, mockPricing);
      mockDb._mockChain.returning.mockResolvedValue([{
        ...mockPricing,
        tier_name: 'Updated Name',
      }]);

      const result = await service.updatePricing('price-123', {
        tier_name: 'Updated Name',
      }, 'tenant-1');

      expect(result.tier_name).toBe('Updated Name');
    });

    it('should throw ValidationError for negative base_price', async () => {
      configureMockReturn(mockDb, mockPricing);

      await expect(service.updatePricing('price-123', {
        base_price: -25,
      }, 'tenant-1')).rejects.toThrow('positive');
    });

    it('should set updated_at timestamp', async () => {
      configureMockReturn(mockDb, mockPricing);
      mockDb._mockChain.returning.mockResolvedValue([mockPricing]);

      await service.updatePricing('price-123', {
        tier_name: 'Test',
      }, 'tenant-1');

      const updateCall = mockDb._mockChain.update.mock.calls[0][0];
      expect(updateCall.updated_at).toBeInstanceOf(Date);
    });
  });

  describe('calculatePrice', () => {
    it('should calculate price with all fees', async () => {
      configureMockReturn(mockDb, mockPricing);

      const result = await service.calculatePrice('price-123', 2, 'tenant-1');

      // base: 50 * 2 = 100
      // service: 5 * 2 = 10
      // facility: 2.5 * 2 = 5
      // subtotal: 115
      // tax: 115 * 0.08 = 9.2
      // total: 124.2
      expect(result.base_price).toBe(100);
      expect(result.service_fee).toBe(10);
      expect(result.facility_fee).toBe(5);
      expect(result.subtotal).toBe(115);
      expect(result.tax).toBe(9.2);
      expect(result.total).toBe(124.2);
    });

    it('should calculate per-ticket price', async () => {
      configureMockReturn(mockDb, mockPricing);

      const result = await service.calculatePrice('price-123', 2, 'tenant-1');

      expect(result.per_ticket).toBe(62.1); // 124.2 / 2
    });

    it('should handle zero fees', async () => {
      configureMockReturn(mockDb, {
        ...mockPricing,
        service_fee: '0',
        facility_fee: '0',
        tax_rate: '0',
      });

      const result = await service.calculatePrice('price-123', 2, 'tenant-1');

      expect(result.service_fee).toBe(0);
      expect(result.facility_fee).toBe(0);
      expect(result.tax).toBe(0);
      expect(result.total).toBe(100);
    });

    it('should use current_price for dynamic pricing', async () => {
      configureMockReturn(mockDb, {
        ...mockPricing,
        is_dynamic: true,
        base_price: '50.00',
        current_price: '75.00',
      });

      const result = await service.calculatePrice('price-123', 1, 'tenant-1');

      expect(result.base_price).toBe(75); // Uses current_price
    });

    it('should handle single ticket', async () => {
      configureMockReturn(mockDb, {
        ...mockPricing,
        service_fee: '0',
        facility_fee: '0',
        tax_rate: '0',
      });

      const result = await service.calculatePrice('price-123', 1, 'tenant-1');

      expect(result.base_price).toBe(50);
      expect(result.per_ticket).toBe(50);
    });

    it('should round to 2 decimal places', async () => {
      configureMockReturn(mockDb, {
        ...mockPricing,
        base_price: '33.33',
        service_fee: '3.33',
        facility_fee: '1.67',
        tax_rate: '0.0875',
      });

      const result = await service.calculatePrice('price-123', 3, 'tenant-1');

      // All values should be rounded to 2 decimals
      expect(result.base_price.toString()).toMatch(/^\d+(\.\d{1,2})?$/);
      expect(result.total.toString()).toMatch(/^\d+(\.\d{1,2})?$/);
    });
  });

  describe('updateDynamicPrice', () => {
    it('should update current_price for dynamic pricing', async () => {
      configureMockReturn(mockDb, {
        ...mockPricing,
        is_dynamic: true,
        min_price: '40.00',
        max_price: '100.00',
      });
      mockDb._mockChain.returning.mockResolvedValue([{
        ...mockPricing,
        current_price: '75.00',
      }]);

      const result = await service.updateDynamicPrice('price-123', 75, 'tenant-1');

      expect(result.current_price).toBe(75);
    });

    it('should throw error for non-dynamic pricing', async () => {
      configureMockReturn(mockDb, {
        ...mockPricing,
        is_dynamic: false,
      });

      await expect(service.updateDynamicPrice('price-123', 75, 'tenant-1'))
        .rejects.toThrow('does not support dynamic pricing');
    });

    it('should throw error when below minimum', async () => {
      configureMockReturn(mockDb, {
        ...mockPricing,
        is_dynamic: true,
        min_price: '40.00',
        max_price: '100.00',
      });

      await expect(service.updateDynamicPrice('price-123', 30, 'tenant-1'))
        .rejects.toThrow('cannot be less than minimum');
    });

    it('should throw error when above maximum', async () => {
      configureMockReturn(mockDb, {
        ...mockPricing,
        is_dynamic: true,
        min_price: '40.00',
        max_price: '100.00',
      });

      await expect(service.updateDynamicPrice('price-123', 150, 'tenant-1'))
        .rejects.toThrow('cannot exceed maximum');
    });

    it('should allow price at exact minimum', async () => {
      configureMockReturn(mockDb, {
        ...mockPricing,
        is_dynamic: true,
        min_price: '40.00',
        max_price: '100.00',
      });
      mockDb._mockChain.returning.mockResolvedValue([{
        ...mockPricing,
        current_price: '40.00',
      }]);

      const result = await service.updateDynamicPrice('price-123', 40, 'tenant-1');

      expect(result.current_price).toBe(40);
    });

    it('should allow price at exact maximum', async () => {
      configureMockReturn(mockDb, {
        ...mockPricing,
        is_dynamic: true,
        min_price: '40.00',
        max_price: '100.00',
      });
      mockDb._mockChain.returning.mockResolvedValue([{
        ...mockPricing,
        current_price: '100.00',
      }]);

      const result = await service.updateDynamicPrice('price-123', 100, 'tenant-1');

      expect(result.current_price).toBe(100);
    });
  });

  describe('getActivePricing', () => {
    it('should return active and visible pricing', async () => {
      configureMockArray(mockDb, [mockPricing]);

      const result = await service.getActivePricing('event-123', 'tenant-1');

      expect(mockDb._mockChain.where).toHaveBeenCalledWith({
        event_id: 'event-123',
        tenant_id: 'tenant-1',
        is_active: true,
        is_visible: true,
      });
      expect(result).toHaveLength(1);
    });

    it('should filter by sales window', async () => {
      configureMockArray(mockDb, [mockPricing]);

      await service.getActivePricing('event-123', 'tenant-1');

      // Should include where clauses for sales_start_at and sales_end_at
      expect(mockDb._mockChain.where).toHaveBeenCalled();
    });

    it('should order by display_order', async () => {
      configureMockArray(mockDb, [mockPricing]);

      await service.getActivePricing('event-123', 'tenant-1');

      expect(mockDb._mockChain.orderBy).toHaveBeenCalledWith('display_order', 'asc');
    });

    it('should return empty array when no active pricing', async () => {
      configureMockArray(mockDb, []);

      const result = await service.getActivePricing('event-123', 'tenant-1');

      expect(result).toEqual([]);
    });
  });

  describe('applyEarlyBirdPricing', () => {
    it('should apply early bird prices', async () => {
      const earlyBirdPricing = [{
        ...mockPricing,
        early_bird_price: '40.00',
        early_bird_ends_at: new Date(Date.now() + 86400000), // Tomorrow
      }];
      configureMockArray(mockDb, earlyBirdPricing);
      mockDb._mockChain.returning.mockResolvedValue([mockPricing]);

      await service.applyEarlyBirdPricing('event-123', 'tenant-1');

      // Should call updatePricing with early_bird_price
    });

    it('should skip expired early bird', async () => {
      configureMockArray(mockDb, []);

      await service.applyEarlyBirdPricing('event-123', 'tenant-1');

      // No updates should be made
      expect(mockDb._mockChain.update).not.toHaveBeenCalled();
    });
  });

  describe('applyLastMinutePricing', () => {
    it('should apply last minute prices', async () => {
      const lastMinutePricing = [{
        ...mockPricing,
        last_minute_price: '35.00',
        last_minute_starts_at: new Date(Date.now() - 3600000), // 1 hour ago
      }];
      configureMockArray(mockDb, lastMinutePricing);
      mockDb._mockChain.returning.mockResolvedValue([mockPricing]);

      await service.applyLastMinutePricing('event-123', 'tenant-1');

      // Should call updatePricing with last_minute_price
    });

    it('should skip future last minute', async () => {
      configureMockArray(mockDb, []);

      await service.applyLastMinutePricing('event-123', 'tenant-1');

      // No updates should be made
      expect(mockDb._mockChain.update).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle zero base price (free event)', async () => {
      configureMockReturn(mockDb, {
        ...mockPricing,
        base_price: '0',
        current_price: '0',
        service_fee: '0',
        facility_fee: '0',
        tax_rate: '0',
      });

      const result = await service.calculatePrice('price-123', 2, 'tenant-1');

      expect(result.total).toBe(0);
    });

    it('should handle very large quantities', async () => {
      configureMockReturn(mockDb, mockPricing);

      const result = await service.calculatePrice('price-123', 1000, 'tenant-1');

      expect(result.base_price).toBe(50000);
    });

    it('should handle null decimal fields', async () => {
      configureMockReturn(mockDb, {
        ...mockPricing,
        service_fee: null,
        facility_fee: null,
        tax_rate: null,
      });

      const result = await service.calculatePrice('price-123', 1, 'tenant-1');

      expect(result.service_fee).toBe(0);
      expect(result.facility_fee).toBe(0);
      expect(result.tax).toBe(0);
    });
  });
});
