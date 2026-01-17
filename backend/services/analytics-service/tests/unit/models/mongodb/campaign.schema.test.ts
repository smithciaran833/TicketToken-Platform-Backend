/**
 * Campaign Schema Unit Tests
 */

import { CampaignSchema } from '../../../../src/models/mongodb/campaign.schema';
import { Campaign, TouchPoint } from '../../../../src/types';

// Mock MongoDB
const mockInsertOne = jest.fn();
const mockInsertMany = jest.fn();
const mockFindOneAndUpdate = jest.fn();
const mockFind = jest.fn();
const mockAggregate = jest.fn();

const mockCollection = {
  insertOne: mockInsertOne,
  insertMany: mockInsertMany,
  findOneAndUpdate: mockFindOneAndUpdate,
  find: mockFind,
  aggregate: mockAggregate,
};

jest.mock('../../../../src/config/mongodb', () => ({
  getMongoDB: jest.fn(() => ({
    collection: jest.fn(() => mockCollection),
  })),
}));

// Mock UUID
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-1234'),
}));

describe('CampaignSchema', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFind.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      toArray: jest.fn().mockResolvedValue([]),
    });
    mockAggregate.mockReturnValue({
      toArray: jest.fn().mockResolvedValue([]),
    });
  });

  describe('createCampaign', () => {
    it('should create campaign with generated ID and timestamp', async () => {
      const campaignData: Omit<Campaign, 'id'> = {
        venueId: 'venue-1',
        name: 'Summer Sale',
        type: 'email',
        status: 'active',
        startDate: new Date('2024-06-01'),
        endDate: new Date('2024-08-31'),
        budget: 5000,
        targetAudience: ['segment-1'],
      } as any;

      mockInsertOne.mockResolvedValue({ acknowledged: true });

      const result = await CampaignSchema.createCampaign(campaignData);

      expect(result.id).toBe('test-uuid-1234');
      expect(result.name).toBe('Summer Sale');
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(mockInsertOne).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-uuid-1234',
          name: 'Summer Sale',
          venueId: 'venue-1',
          createdAt: expect.any(Date),
        })
      );
    });

    it('should preserve all campaign properties', async () => {
      const campaignData: Omit<Campaign, 'id'> = {
        venueId: 'venue-2',
        name: 'Black Friday',
        type: 'sms',
        status: 'draft',
        startDate: new Date('2024-11-25'),
        endDate: new Date('2024-11-29'),
        budget: 10000,
        targetAudience: ['segment-2', 'segment-3'],
        channels: ['sms', 'email'],
      } as any;

      mockInsertOne.mockResolvedValue({ acknowledged: true });

      const result = await CampaignSchema.createCampaign(campaignData);

      expect(result).toMatchObject(campaignData);
      expect(result.channels).toEqual(['sms', 'email']);
    });
  });

  describe('updateCampaign', () => {
    it('should update campaign and return updated document', async () => {
      const updates = {
        name: 'Updated Campaign',
        status: 'paused' as const,
      };

      const updatedCampaign = {
        id: 'campaign-1',
        name: 'Updated Campaign',
        status: 'paused',
        venueId: 'venue-1',
      };

      mockFindOneAndUpdate.mockResolvedValue(updatedCampaign);

      const result = await CampaignSchema.updateCampaign('campaign-1', updates);

      expect(result).toEqual(updatedCampaign);
      expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
        { id: 'campaign-1' },
        { $set: updates },
        { returnDocument: 'after' }
      );
    });

    it('should return null if campaign not found', async () => {
      mockFindOneAndUpdate.mockResolvedValue(null);

      const result = await CampaignSchema.updateCampaign('non-existent', {
        name: 'Test',
      });

      expect(result).toBeNull();
    });

    it('should allow partial updates', async () => {
      const updates = { budget: 15000 };
      mockFindOneAndUpdate.mockResolvedValue({ id: 'campaign-1', ...updates });

      await CampaignSchema.updateCampaign('campaign-1', updates);

      expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
        { id: 'campaign-1' },
        { $set: { budget: 15000 } },
        { returnDocument: 'after' }
      );
    });
  });

  describe('getCampaigns', () => {
    it('should get all campaigns for venue', async () => {
      const campaigns = [
        { id: 'c1', name: 'Campaign 1', venueId: 'venue-1' },
        { id: 'c2', name: 'Campaign 2', venueId: 'venue-1' },
      ];

      mockFind.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        toArray: jest.fn().mockResolvedValue(campaigns),
      });

      const result = await CampaignSchema.getCampaigns('venue-1');

      expect(result).toEqual(campaigns);
      expect(mockFind).toHaveBeenCalledWith({ venueId: 'venue-1' });
    });

    it('should filter by status', async () => {
      mockFind.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        toArray: jest.fn().mockResolvedValue([]),
      });

      await CampaignSchema.getCampaigns('venue-1', { status: 'active' });

      expect(mockFind).toHaveBeenCalledWith({
        venueId: 'venue-1',
        status: 'active',
      });
    });

    it('should filter by type', async () => {
      mockFind.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        toArray: jest.fn().mockResolvedValue([]),
      });

      await CampaignSchema.getCampaigns('venue-1', { type: 'email' });

      expect(mockFind).toHaveBeenCalledWith({
        venueId: 'venue-1',
        type: 'email',
      });
    });

    it('should filter by date range - overlapping campaigns', async () => {
      const startDate = new Date('2024-06-01');
      const endDate = new Date('2024-06-30');

      mockFind.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        toArray: jest.fn().mockResolvedValue([]),
      });

      await CampaignSchema.getCampaigns('venue-1', { startDate, endDate });

      expect(mockFind).toHaveBeenCalledWith({
        venueId: 'venue-1',
        endDate: { $gte: startDate },
        startDate: { $lte: endDate },
      });
    });

    it('should filter by start date only', async () => {
      const startDate = new Date('2024-06-01');

      mockFind.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        toArray: jest.fn().mockResolvedValue([]),
      });

      await CampaignSchema.getCampaigns('venue-1', { startDate });

      expect(mockFind).toHaveBeenCalledWith({
        venueId: 'venue-1',
        endDate: { $gte: startDate },
      });
    });

    it('should filter by end date only', async () => {
      const endDate = new Date('2024-12-31');

      mockFind.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        toArray: jest.fn().mockResolvedValue([]),
      });

      await CampaignSchema.getCampaigns('venue-1', { endDate });

      expect(mockFind).toHaveBeenCalledWith({
        venueId: 'venue-1',
        startDate: { $lte: endDate },
      });
    });

    it('should combine multiple filters', async () => {
      mockFind.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        toArray: jest.fn().mockResolvedValue([]),
      });

      await CampaignSchema.getCampaigns('venue-1', {
        status: 'active',
        type: 'email',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
      });

      expect(mockFind).toHaveBeenCalledWith(
        expect.objectContaining({
          venueId: 'venue-1',
          status: 'active',
          type: 'email',
        })
      );
    });

    it('should sort by createdAt descending', async () => {
      const mockSort = jest.fn().mockReturnThis();
      mockFind.mockReturnValue({
        sort: mockSort,
        toArray: jest.fn().mockResolvedValue([]),
      });

      await CampaignSchema.getCampaigns('venue-1');

      expect(mockSort).toHaveBeenCalledWith({ createdAt: -1 });
    });
  });

  describe('trackTouchpoint', () => {
    it('should insert touchpoint with timestamp', async () => {
      const touchpoint: TouchPoint = {
        venueId: 'venue-1',
        customerId: 'customer-1',
        campaign: 'campaign-1',
        channel: 'email',
        action: 'click',
        timestamp: new Date(),
      };

      mockInsertOne.mockResolvedValue({ acknowledged: true });

      await CampaignSchema.trackTouchpoint(touchpoint);

      expect(mockInsertOne).toHaveBeenCalledWith(
        expect.objectContaining({
          ...touchpoint,
          timestamp: expect.any(Date),
        })
      );
    });

    it('should track touchpoint with value', async () => {
      const touchpoint: TouchPoint = {
        venueId: 'venue-1',
        customerId: 'customer-1',
        campaign: 'campaign-1',
        channel: 'email',
        action: 'conversion',
        value: 99.99,
        timestamp: new Date(),
      };

      mockInsertOne.mockResolvedValue({ acknowledged: true });

      await CampaignSchema.trackTouchpoint(touchpoint);

      expect(mockInsertOne).toHaveBeenCalledWith(
        expect.objectContaining({
          value: 99.99,
        })
      );
    });
  });

  describe('bulkTrackTouchpoints', () => {
    it('should insert multiple touchpoints', async () => {
      const touchpoints: TouchPoint[] = [
        {
          venueId: 'venue-1',
          customerId: 'customer-1',
          campaign: 'campaign-1',
          channel: 'email',
          action: 'impression',
          timestamp: new Date(),
        },
        {
          venueId: 'venue-1',
          customerId: 'customer-2',
          campaign: 'campaign-1',
          channel: 'email',
          action: 'click',
          timestamp: new Date(),
        },
      ];

      mockInsertMany.mockResolvedValue({ acknowledged: true });

      await CampaignSchema.bulkTrackTouchpoints(touchpoints);

      expect(mockInsertMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ customerId: 'customer-1' }),
          expect.objectContaining({ customerId: 'customer-2' }),
        ])
      );
    });

    it('should add timestamps to all touchpoints', async () => {
      const touchpoints: TouchPoint[] = [
        {
          venueId: 'venue-1',
          customerId: 'customer-1',
          campaign: 'campaign-1',
          channel: 'sms',
          action: 'impression',
          timestamp: new Date(),
        },
      ];

      mockInsertMany.mockResolvedValue({ acknowledged: true });

      await CampaignSchema.bulkTrackTouchpoints(touchpoints);

      const insertedData = mockInsertMany.mock.calls[0][0];
      insertedData.forEach((tp: any) => {
        expect(tp.timestamp).toBeInstanceOf(Date);
      });
    });
  });

  describe('getCustomerTouchpoints', () => {
    it('should get touchpoints for customer', async () => {
      const touchpoints = [
        { customerId: 'customer-1', action: 'click' },
        { customerId: 'customer-1', action: 'conversion' },
      ];

      mockFind.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        toArray: jest.fn().mockResolvedValue(touchpoints),
      });

      const result = await CampaignSchema.getCustomerTouchpoints(
        'venue-1',
        'customer-1'
      );

      expect(result).toEqual(touchpoints);
      expect(mockFind).toHaveBeenCalledWith({
        venueId: 'venue-1',
        customerId: 'customer-1',
      });
    });

    it('should filter by date range', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      mockFind.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        toArray: jest.fn().mockResolvedValue([]),
      });

      await CampaignSchema.getCustomerTouchpoints(
        'venue-1',
        'customer-1',
        startDate,
        endDate
      );

      expect(mockFind).toHaveBeenCalledWith({
        venueId: 'venue-1',
        customerId: 'customer-1',
        timestamp: {
          $gte: startDate,
          $lte: endDate,
        },
      });
    });

    it('should sort by timestamp ascending', async () => {
      const mockSort = jest.fn().mockReturnThis();
      mockFind.mockReturnValue({
        sort: mockSort,
        toArray: jest.fn().mockResolvedValue([]),
      });

      await CampaignSchema.getCustomerTouchpoints('venue-1', 'customer-1');

      expect(mockSort).toHaveBeenCalledWith({ timestamp: 1 });
    });
  });

  describe('getCampaignPerformance', () => {
    it('should aggregate campaign performance by channel', async () => {
      const performanceData = [
        {
          _id: 'email',
          impressions: 1000,
          clicks: 100,
          conversions: 10,
          revenue: 999,
        },
        {
          _id: 'sms',
          impressions: 500,
          clicks: 50,
          conversions: 5,
          revenue: 499,
        },
      ];

      mockAggregate.mockReturnValue({
        toArray: jest.fn().mockResolvedValue(performanceData),
      });

      const result = await CampaignSchema.getCampaignPerformance('campaign-1');

      expect(result).toEqual(performanceData);
      expect(mockAggregate).toHaveBeenCalledWith(
        expect.arrayContaining([
          { $match: { campaign: 'campaign-1' } },
          expect.objectContaining({ $group: expect.any(Object) }),
        ])
      );
    });

    it('should calculate correct aggregations', async () => {
      mockAggregate.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([]),
      });

      await CampaignSchema.getCampaignPerformance('campaign-1');

      const pipeline = mockAggregate.mock.calls[0][0];
      const groupStage = pipeline.find((stage: any) => stage.$group);

      expect(groupStage.$group).toHaveProperty('impressions');
      expect(groupStage.$group).toHaveProperty('clicks');
      expect(groupStage.$group).toHaveProperty('conversions');
      expect(groupStage.$group).toHaveProperty('revenue');
    });
  });
});
