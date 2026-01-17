/**
 * Attribution Service Unit Tests
 */

// Mock dependencies before imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
    }),
  },
}));

const mockTrackTouchpoint = jest.fn().mockResolvedValue(undefined);
const mockGetCustomerTouchpoints = jest.fn().mockResolvedValue([]);
const mockGetCampaignPerformance = jest.fn().mockResolvedValue([]);

jest.mock('../../../src/models', () => ({
  CampaignSchema: {
    trackTouchpoint: mockTrackTouchpoint,
    getCustomerTouchpoints: mockGetCustomerTouchpoints,
    getCampaignPerformance: mockGetCampaignPerformance,
  },
  CacheModel: {
    getCacheKey: jest.fn((type, venue, id) => `${type}:${venue}:${id}`),
    set: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../../src/config/constants', () => ({
  CONSTANTS: {
    CACHE_TTL: {
      INSIGHTS: 3600,
    },
  },
}));

import { AttributionService } from '../../../src/services/attribution.service';
import { TouchPoint } from '../../../src/types';

describe('AttributionService', () => {
  let service: AttributionService;

  const mockTouchpoints: TouchPoint[] = [
    {
      timestamp: new Date('2024-01-01'),
      channel: 'organic',
      action: 'visit',
      value: 0,
      campaign: 'none',
      customerId: 'cust-1',
    },
    {
      timestamp: new Date('2024-01-05'),
      channel: 'email',
      action: 'click',
      value: 0,
      campaign: 'newsletter',
      customerId: 'cust-1',
    },
    {
      timestamp: new Date('2024-01-07'),
      channel: 'paid_search',
      action: 'click',
      value: 0,
      campaign: 'brand',
      customerId: 'cust-1',
    },
    {
      timestamp: new Date('2024-01-08'),
      channel: 'direct',
      action: 'conversion',
      value: 100,
      campaign: 'none',
      customerId: 'cust-1',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    service = AttributionService.getInstance();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = AttributionService.getInstance();
      const instance2 = AttributionService.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('trackTouchpoint', () => {
    it('should track touchpoint with venue and customer', async () => {
      const touchpoint: TouchPoint = {
        timestamp: new Date(),
        channel: 'organic',
        action: 'visit',
        value: 0,
        campaign: 'none',
      };

      await service.trackTouchpoint('venue-123', 'cust-456', touchpoint);

      expect(mockTrackTouchpoint).toHaveBeenCalledWith(
        expect.objectContaining({
          venueId: 'venue-123',
          customerId: 'cust-456',
          channel: 'organic',
        })
      );
    });

    it('should throw on tracking error', async () => {
      mockTrackTouchpoint.mockRejectedValueOnce(new Error('DB error'));

      await expect(
        service.trackTouchpoint('venue-123', 'cust-456', {} as TouchPoint)
      ).rejects.toThrow('DB error');
    });
  });

  describe('getCustomerJourney', () => {
    it('should return customer touchpoints', async () => {
      mockGetCustomerTouchpoints.mockResolvedValueOnce(mockTouchpoints);

      const result = await service.getCustomerJourney('venue-123', 'cust-456');

      expect(result).toEqual(mockTouchpoints);
      expect(mockGetCustomerTouchpoints).toHaveBeenCalledWith(
        'venue-123',
        'cust-456',
        undefined,
        undefined
      );
    });

    it('should pass date filters', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      await service.getCustomerJourney('venue-123', 'cust-456', startDate, endDate);

      expect(mockGetCustomerTouchpoints).toHaveBeenCalledWith(
        'venue-123',
        'cust-456',
        startDate,
        endDate
      );
    });
  });

  describe('calculateAttribution', () => {
    beforeEach(() => {
      // Mock getConversionTouchpoints to return our test data
      jest.spyOn(service as any, 'getConversionTouchpoints').mockResolvedValue(mockTouchpoints);
    });

    it('should throw for no touchpoints', async () => {
      jest.spyOn(service as any, 'getConversionTouchpoints').mockResolvedValueOnce([]);

      await expect(
        service.calculateAttribution('venue-123', 'conv-1', 100, 'last_touch')
      ).rejects.toThrow('No touchpoints found');
    });

    it('should return attribution path', async () => {
      const result = await service.calculateAttribution('venue-123', 'conv-1', 100, 'last_touch');

      expect(result.conversionId).toBe('conv-1');
      expect(result.revenue).toBe(100);
      expect(result.touchpoints).toEqual(mockTouchpoints);
      expect(result.attribution).toBeDefined();
    });
  });

  describe('applyAttributionModel', () => {
    describe('first_touch', () => {
      it('should give 100% credit to first touchpoint', () => {
        const result = (service as any).applyAttributionModel(mockTouchpoints, 100, 'first_touch');

        expect(result).toHaveLength(1);
        expect(result[0].touchpointIndex).toBe(0);
        expect(result[0].credit).toBe(1.0);
        expect(result[0].revenue).toBe(100);
      });
    });

    describe('last_touch', () => {
      it('should give 100% credit to last touchpoint', () => {
        const result = (service as any).applyAttributionModel(mockTouchpoints, 100, 'last_touch');

        expect(result).toHaveLength(1);
        expect(result[0].touchpointIndex).toBe(3);
        expect(result[0].credit).toBe(1.0);
        expect(result[0].revenue).toBe(100);
      });
    });

    describe('linear', () => {
      it('should distribute credit equally', () => {
        const result = (service as any).applyAttributionModel(mockTouchpoints, 100, 'linear');

        expect(result).toHaveLength(4);
        result.forEach((attr: any) => {
          expect(attr.credit).toBe(0.25);
          expect(attr.revenue).toBe(25);
        });
      });

      it('should handle single touchpoint', () => {
        const result = (service as any).applyAttributionModel([mockTouchpoints[0]], 100, 'linear');

        expect(result).toHaveLength(1);
        expect(result[0].credit).toBe(1.0);
        expect(result[0].revenue).toBe(100);
      });
    });

    describe('time_decay', () => {
      it('should give more credit to recent touchpoints', () => {
        const result = (service as any).applyAttributionModel(mockTouchpoints, 100, 'time_decay');

        expect(result).toHaveLength(4);

        // Last touchpoint should have highest credit
        const lastCredit = result.find((r: any) => r.touchpointIndex === 3).credit;
        const firstCredit = result.find((r: any) => r.touchpointIndex === 0).credit;

        expect(lastCredit).toBeGreaterThan(firstCredit);
      });

      it('should sum to 100% credit', () => {
        const result = (service as any).applyAttributionModel(mockTouchpoints, 100, 'time_decay');

        const totalCredit = result.reduce((sum: number, r: any) => sum + r.credit, 0);
        expect(totalCredit).toBeCloseTo(1.0);
      });

      it('should sum to total revenue', () => {
        const result = (service as any).applyAttributionModel(mockTouchpoints, 100, 'time_decay');

        const totalRevenue = result.reduce((sum: number, r: any) => sum + r.revenue, 0);
        expect(totalRevenue).toBeCloseTo(100);
      });
    });

    describe('data_driven', () => {
      it('should weight by channel', () => {
        const result = (service as any).applyAttributionModel(mockTouchpoints, 100, 'data_driven');

        expect(result).toHaveLength(4);

        // Organic should have high weight (0.3)
        const organicCredit = result.find((r: any) => r.touchpointIndex === 0).credit;
        // Direct should have low weight (0.1)
        const directCredit = result.find((r: any) => r.touchpointIndex === 3).credit;

        expect(organicCredit).toBeGreaterThan(directCredit);
      });

      it('should sum to 100% credit', () => {
        const result = (service as any).applyAttributionModel(mockTouchpoints, 100, 'data_driven');

        const totalCredit = result.reduce((sum: number, r: any) => sum + r.credit, 0);
        expect(totalCredit).toBeCloseTo(1.0);
      });
    });
  });

  describe('getChannelPerformance', () => {
    it('should return channel metrics', async () => {
      jest.spyOn(service as any, 'getConversions').mockResolvedValue([
        { id: 'conv-1', revenue: 100, customerId: 'cust-1' },
      ]);
      jest.spyOn(service, 'calculateAttribution').mockResolvedValue({
        customerId: 'cust-1',
        conversionId: 'conv-1',
        revenue: 100,
        touchpoints: mockTouchpoints,
        attribution: [
          { touchpointIndex: 0, credit: 0.25, revenue: 25 },
          { touchpointIndex: 1, credit: 0.25, revenue: 25 },
          { touchpointIndex: 2, credit: 0.25, revenue: 25 },
          { touchpointIndex: 3, credit: 0.25, revenue: 25 },
        ],
      });

      const result = await service.getChannelPerformance(
        'venue-123',
        new Date('2024-01-01'),
        new Date('2024-01-31')
      );

      expect(result.channels).toBeDefined();
      expect(result.multiTouchAttribution).toBeDefined();
    });
  });

  describe('getCampaignROI', () => {
    it('should calculate ROI', async () => {
      mockGetCampaignPerformance.mockResolvedValueOnce([
        { revenue: 1000, conversions: 10, cost: 200 },
        { revenue: 500, conversions: 5, cost: 100 },
      ]);

      const result = await service.getCampaignROI('venue-123', 'campaign-1');

      expect(result.revenue).toBe(1500);
      expect(result.conversions).toBe(15);
      expect(result.cost).toBe(300);
      expect(result.roi).toBe(400); // ((1500-300)/300)*100
      expect(result.costPerAcquisition).toBe(20); // 300/15
    });

    it('should handle zero cost', async () => {
      mockGetCampaignPerformance.mockResolvedValueOnce([
        { revenue: 1000, conversions: 10, cost: 0 },
      ]);

      const result = await service.getCampaignROI('venue-123', 'campaign-1');

      expect(result.roi).toBe(0);
    });

    it('should handle zero conversions', async () => {
      mockGetCampaignPerformance.mockResolvedValueOnce([
        { revenue: 0, conversions: 0, cost: 100 },
      ]);

      const result = await service.getCampaignROI('venue-123', 'campaign-1');

      expect(result.costPerAcquisition).toBe(0);
    });
  });
});
