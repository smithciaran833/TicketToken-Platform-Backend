/**
 * Insights Controller Unit Tests
 */

import { FastifyRequest, FastifyReply } from 'fastify';

// Mock dependencies
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

const mockCustomerIntelligenceService = {
  getCustomerSegments: jest.fn(),
  generateCustomerInsights: jest.fn(),
};

const mockDbQuery = {
  where: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  groupBy: jest.fn().mockReturnThis(),
  count: jest.fn().mockReturnThis(),
  first: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  catch: jest.fn().mockReturnThis(),
  raw: jest.fn().mockReturnThis(),
};

const mockDb = jest.fn(() => mockDbQuery);

jest.mock('../../../src/services/customer-intelligence.service', () => ({
  customerIntelligenceService: mockCustomerIntelligenceService,
}));

jest.mock('../../../src/config/database', () => ({
  getDb: jest.fn(() => mockDb),
}));

import { insightsController } from '../../../src/controllers/insights.controller';

describe('InsightsController', () => {
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    mockRequest = {
      params: {},
      query: {},
      body: {},
      user: { id: 'user-123', tenantId: 'tenant-123' },
    };

    mockReply = {
      code: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };

    jest.clearAllMocks();

    // Reset mock chain
    mockDbQuery.where.mockReturnThis();
    mockDbQuery.orderBy.mockReturnThis();
    mockDbQuery.limit.mockReturnThis();
    mockDbQuery.catch.mockImplementation((handler) => {
      // By default, resolve successfully
      return Promise.resolve([
        {
          id: 'insight-1',
          type: 'revenue_decline',
          title: 'Revenue declining',
          priority: 'high',
        },
      ]);
    });

    mockDbQuery.first.mockImplementation(() =>
      mockDbQuery.catch.mockResolvedValue({
        id: 'insight-1',
        type: 'revenue_decline',
      })
    );

    mockDbQuery.update.mockImplementation(() =>
      mockDbQuery.catch.mockResolvedValue(1)
    );

    mockDbQuery.insert.mockImplementation(() =>
      mockDbQuery.catch.mockResolvedValue([1])
    );

    // Mock customer intelligence service
    mockCustomerIntelligenceService.getCustomerSegments.mockResolvedValue([
      { segment: 'at_risk', count: 25, avgValue: 1000 },
      { segment: 'dormant', count: 50, avgValue: 500 },
      { segment: 'vip', count: 10, avgValue: 10000 },
    ]);

    mockCustomerIntelligenceService.generateCustomerInsights.mockResolvedValue({
      insights: ['High value customer', 'Prefers music events'],
      recommendations: ['Send VIP offers'],
    });
  });

  describe('getInsights', () => {
    it('should get insights for venue', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.query = {};

      await insightsController.getInsights(mockRequest, mockReply);

      expect(mockDb).toHaveBeenCalledWith('venue_insights');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          insights: expect.any(Array),
          total: expect.any(Number),
        }),
      });
    });

    it('should filter by type', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.query = { type: 'revenue_decline' };

      await insightsController.getInsights(mockRequest, mockReply);

      expect(mockDbQuery.where).toHaveBeenCalledWith('insight_type', 'revenue_decline');
    });

    it('should filter by priority', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.query = { priority: 'high' };

      await insightsController.getInsights(mockRequest, mockReply);

      expect(mockDbQuery.where).toHaveBeenCalledWith('priority', 'high');
    });

    it('should filter by actionable', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.query = { actionable: true };

      await insightsController.getInsights(mockRequest, mockReply);

      expect(mockDbQuery.where).toHaveBeenCalledWith('is_actionable', true);
    });

    it('should use custom limit', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.query = { limit: 100 };

      await insightsController.getInsights(mockRequest, mockReply);

      expect(mockDbQuery.limit).toHaveBeenCalledWith(100);
    });

    it('should include segment-based insights', async () => {
      mockRequest.params = { venueId: 'venue-123' };

      await insightsController.getInsights(mockRequest, mockReply);

      const sendCall = mockReply.send.mock.calls[0][0];
      const segmentInsights = sendCall.data.insights.filter((i: any) =>
        i.id?.startsWith('segment_')
      );
      expect(segmentInsights.length).toBeGreaterThan(0);
    });

    it('should handle database errors gracefully', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockDbQuery.catch.mockImplementation((handler) => {
        handler(new Error('Database error'));
        return Promise.resolve([]);
      });

      await insightsController.getInsights(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalled();
    });
  });

  describe('getCustomerInsights', () => {
    it('should generate customer insights', async () => {
      mockRequest.params = { venueId: 'venue-123', customerId: 'customer-456' };

      await insightsController.getCustomerInsights(mockRequest, mockReply);

      expect(mockCustomerIntelligenceService.generateCustomerInsights).toHaveBeenCalledWith(
        'venue-123',
        'customer-456'
      );

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: {
          insights: expect.any(Object),
        },
      });
    });
  });

  describe('getInsight', () => {
    it('should get specific insight', async () => {
      mockRequest.params = { insightId: 'insight-1' };

      await insightsController.getInsight(mockRequest, mockReply);

      expect(mockDb).toHaveBeenCalledWith('venue_insights');
      expect(mockDbQuery.where).toHaveBeenCalledWith({ id: 'insight-1' });
    });

    it('should return 404 if insight not found', async () => {
      mockRequest.params = { insightId: 'nonexistent' };
      mockDbQuery.catch.mockResolvedValue(null);

      await insightsController.getInsight(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(404);
    });

    it('should handle database errors', async () => {
      mockRequest.params = { insightId: 'insight-1' };
      mockDbQuery.catch.mockImplementation((handler) => {
        handler(new Error('Database error'));
        return Promise.resolve(null);
      });

      await insightsController.getInsight(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(404);
    });
  });

  describe('dismissInsight', () => {
    it('should dismiss insight with reason', async () => {
      mockRequest.params = { insightId: 'insight-1' };
      mockRequest.body = { reason: 'Not relevant' };

      await insightsController.dismissInsight(mockRequest, mockReply);

      expect(mockDbQuery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          is_dismissed: true,
          dismissed_by: 'user-123',
          dismissed_reason: 'Not relevant',
        })
      );
    });

    it('should dismiss insight without reason', async () => {
      mockRequest.params = { insightId: 'insight-1' };
      mockRequest.body = {};

      await insightsController.dismissInsight(mockRequest, mockReply);

      expect(mockDbQuery.update).toHaveBeenCalled();
    });

    it('should use system as default user', async () => {
      mockRequest.user = undefined;
      mockRequest.params = { insightId: 'insight-1' };
      mockRequest.body = {};

      await insightsController.dismissInsight(mockRequest, mockReply);

      expect(mockDbQuery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          dismissed_by: 'system',
        })
      );
    });
  });

  describe('takeAction', () => {
    it('should record action on insight', async () => {
      mockRequest.params = { insightId: 'insight-1' };
      mockRequest.body = {
        action: 'send_email_campaign',
        parameters: { segment: 'at_risk' },
      };

      await insightsController.takeAction(mockRequest, mockReply);

      expect(mockDb).toHaveBeenCalledWith('insight_actions');
      expect(mockDbQuery.insert).toHaveBeenCalled();
    });

    it('should execute send_email_campaign action', async () => {
      mockRequest.params = { insightId: 'insight-1' };
      mockRequest.body = { action: 'send_email_campaign' };

      await insightsController.takeAction(mockRequest, mockReply);

      const sendCall = mockReply.send.mock.calls[0][0];
      expect(sendCall.data.result.message).toContain('Email campaign queued');
    });

    it('should execute create_segment action', async () => {
      mockRequest.params = { insightId: 'insight-1' };
      mockRequest.body = { action: 'create_segment' };

      await insightsController.takeAction(mockRequest, mockReply);

      const sendCall = mockReply.send.mock.calls[0][0];
      expect(sendCall.data.result.message).toContain('Customer segment created');
    });

    it('should execute schedule_followup action', async () => {
      mockRequest.params = { insightId: 'insight-1' };
      mockRequest.body = { action: 'schedule_followup' };

      await insightsController.takeAction(mockRequest, mockReply);

      const sendCall = mockReply.send.mock.calls[0][0];
      expect(sendCall.data.result.message).toContain('Follow-up scheduled');
    });

    it('should handle unknown actions', async () => {
      mockRequest.params = { insightId: 'insight-1' };
      mockRequest.body = { action: 'unknown_action' };

      await insightsController.takeAction(mockRequest, mockReply);

      const sendCall = mockReply.send.mock.calls[0][0];
      expect(sendCall.data.result.message).toBe('Action recorded');
    });
  });

  describe('getInsightStats', () => {
    it('should get insight statistics', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockDbQuery.catch.mockResolvedValueOnce({
        total: 100,
        active: 75,
        dismissed: 25,
        actioned: 50,
        high_priority: 20,
      });

      mockDbQuery.catch.mockResolvedValueOnce([
        { type: 'revenue_decline', count: 10 },
        { type: 'customer_churn', count: 15 },
      ]);

      await insightsController.getInsightStats(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: {
          stats: expect.objectContaining({
            total: 100,
            active: 75,
            byType: expect.any(Array),
          }),
        },
      });
    });

    it('should handle database errors gracefully', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockDbQuery.catch.mockImplementation((handler) => {
        handler(new Error('Database error'));
        return Promise.resolve({
          total: 0,
          active: 0,
          dismissed: 0,
          actioned: 0,
          high_priority: 0,
        });
      });

      await insightsController.getInsightStats(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalled();
    });
  });

  describe('refreshInsights', () => {
    it('should queue insight refresh', async () => {
      mockRequest.params = { venueId: 'venue-123' };

      await insightsController.refreshInsights(mockRequest, mockReply);

      expect(mockCustomerIntelligenceService.getCustomerSegments).toHaveBeenCalledWith(
        'venue-123'
      );

      expect(mockReply.code).toHaveBeenCalledWith(202);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          message: 'Insights refresh initiated',
          status: 'processing',
        }),
      });
    });

    it('should estimate new insights', async () => {
      mockRequest.params = { venueId: 'venue-123' };

      await insightsController.refreshInsights(mockRequest, mockReply);

      const sendCall = mockReply.send.mock.calls[0][0];
      expect(sendCall.data.estimatedNewInsights).toBe(2); // at_risk + dormant
    });
  });
});
