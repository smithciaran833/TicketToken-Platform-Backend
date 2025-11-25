import { EventPricingModel } from '../../../src/models/event-pricing.model';
import { Knex } from 'knex';

describe('Event Pricing Model', () => {
  let mockDb: any;
  let pricingModel: EventPricingModel;
  let mockQueryBuilder: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      whereNull: jest.fn().mockReturnThis(),
      orWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(null),
    };

    mockDb = jest.fn(() => mockQueryBuilder);
    pricingModel = new EventPricingModel(mockDb as any);
  });

  describe('findByEventId', () => {
    it('should find pricing by event id', async () => {
      const mockPricing = [{ id: '1', event_id: 'event-123', base_price: 50 }];
      
      let orderByCallCount = 0;
      mockQueryBuilder.orderBy.mockImplementation(function(this: any) {
        orderByCallCount++;
        if (orderByCallCount === 2) {
          return Promise.resolve(mockPricing);
        }
        return this;
      });

      const result = await pricingModel.findByEventId('event-123');

      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ event_id: 'event-123', is_active: true });
      expect(result).toEqual(mockPricing);
    });
  });

  describe('findByScheduleId', () => {
    it('should find pricing by schedule id', async () => {
      const mockPricing = [{ id: '1', schedule_id: 'schedule-123' }];
      mockQueryBuilder.orderBy.mockResolvedValue(mockPricing);

      const result = await pricingModel.findByScheduleId('schedule-123');

      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ schedule_id: 'schedule-123', is_active: true });
      expect(result).toEqual(mockPricing);
    });
  });

  describe('findByCapacityId', () => {
    it('should find pricing by capacity id', async () => {
      const mockPricing = [{ id: '1', capacity_id: 'cap-123' }];
      mockQueryBuilder.orderBy.mockResolvedValue(mockPricing);

      const result = await pricingModel.findByCapacityId('cap-123');

      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ capacity_id: 'cap-123', is_active: true });
      expect(result).toEqual(mockPricing);
    });
  });

  describe('getActivePricing', () => {
    it('should get active pricing for event', async () => {
      const mockPricing = [{ id: '1', event_id: 'event-123', is_visible: true }];
      mockQueryBuilder.orderBy.mockResolvedValue(mockPricing);

      const result = await pricingModel.getActivePricing('event-123');

      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ 
        event_id: 'event-123', 
        is_active: true, 
        is_visible: true 
      });
      expect(result).toEqual(mockPricing);
    });
  });

  describe('calculateTotalPrice', () => {
    it('should calculate total price with fees and tax', async () => {
      const mockPricing = {
        id: '1',
        base_price: 100,
        service_fee: 10,
        facility_fee: 5,
        tax_rate: 0.1,
        is_dynamic: false,
      };
      mockQueryBuilder.first.mockResolvedValue(mockPricing);

      const result = await pricingModel.calculateTotalPrice('pricing-123', 2);

      expect(result).toBe(253);
    });

    it('should return 0 if pricing not found', async () => {
      mockQueryBuilder.first.mockResolvedValue(null);

      const result = await pricingModel.calculateTotalPrice('pricing-123');

      expect(result).toBe(0);
    });

    it('should use current_price if dynamic', async () => {
      const mockPricing = {
        id: '1',
        base_price: 100,
        current_price: 120,
        service_fee: 10,
        facility_fee: 5,
        tax_rate: 0.1,
        is_dynamic: true,
      };
      mockQueryBuilder.first.mockResolvedValue(mockPricing);

      const result = await pricingModel.calculateTotalPrice('pricing-123', 1);

      expect(result).toBe(148.5);
    });
  });
});
