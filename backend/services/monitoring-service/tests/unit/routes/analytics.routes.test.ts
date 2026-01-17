// Mock analytics services BEFORE imports
const mockGetEventMetrics = jest.fn();
const mockTrackSale = jest.fn();
const mockDetectFraud = jest.fn();
const mockGetFraudMetrics = jest.fn();

jest.mock('../../../src/analytics/sales-tracker', () => ({
  salesTracker: {
    getEventMetrics: mockGetEventMetrics,
    trackSale: mockTrackSale,
  },
}));

jest.mock('../../../src/analytics/advanced-fraud-ml', () => ({
  fraudDetector: {
    detectFraud: mockDetectFraud,
    getFraudMetrics: mockGetFraudMetrics,
  },
}));

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import analyticsRoutes from '../../../src/routes/analytics.routes';

describe('analyticsRoutes', () => {
  let mockServer: Partial<FastifyInstance>;
  let registeredRoutes: Map<string, Function>;
  let getSpy: jest.Mock;
  let postSpy: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    registeredRoutes = new Map();

    getSpy = jest.fn((path, handler) => {
      registeredRoutes.set(`GET ${path}`, handler);
    });

    postSpy = jest.fn((path, handler) => {
      registeredRoutes.set(`POST ${path}`, handler);
    });

    mockServer = {
      get: getSpy,
      post: postSpy,
    };
  });

  describe('route registration', () => {
    it('should register GET /sales/:eventId', async () => {
      await analyticsRoutes(mockServer as FastifyInstance);

      expect(getSpy).toHaveBeenCalledWith('/sales/:eventId', expect.any(Function));
      expect(registeredRoutes.has('GET /sales/:eventId')).toBe(true);
    });

    it('should register POST /sales/track', async () => {
      await analyticsRoutes(mockServer as FastifyInstance);

      expect(postSpy).toHaveBeenCalledWith('/sales/track', expect.any(Function));
      expect(registeredRoutes.has('POST /sales/track')).toBe(true);
    });

    it('should register POST /fraud/check', async () => {
      await analyticsRoutes(mockServer as FastifyInstance);

      expect(postSpy).toHaveBeenCalledWith('/fraud/check', expect.any(Function));
      expect(registeredRoutes.has('POST /fraud/check')).toBe(true);
    });

    it('should register GET /fraud/metrics', async () => {
      await analyticsRoutes(mockServer as FastifyInstance);

      expect(getSpy).toHaveBeenCalledWith('/fraud/metrics', expect.any(Function));
      expect(registeredRoutes.has('GET /fraud/metrics')).toBe(true);
    });

    it('should register GET /dashboard', async () => {
      await analyticsRoutes(mockServer as FastifyInstance);

      expect(getSpy).toHaveBeenCalledWith('/dashboard', expect.any(Function));
      expect(registeredRoutes.has('GET /dashboard')).toBe(true);
    });

    it('should register all 5 routes', async () => {
      await analyticsRoutes(mockServer as FastifyInstance);

      expect(getSpy).toHaveBeenCalledTimes(3);
      expect(postSpy).toHaveBeenCalledTimes(2);
      expect(registeredRoutes.size).toBe(5);
    });
  });

  describe('GET /sales/:eventId handler', () => {
    let handler: Function;
    let mockRequest: Partial<FastifyRequest>;
    let mockReply: Partial<FastifyReply>;
    let mockSend: jest.Mock;

    beforeEach(async () => {
      await analyticsRoutes(mockServer as FastifyInstance);
      handler = registeredRoutes.get('GET /sales/:eventId')!;

      mockSend = jest.fn().mockReturnThis();
      mockReply = { send: mockSend };
      mockRequest = { params: { eventId: 'event-123' } };
    });

    it('should call salesTracker.getEventMetrics with eventId', async () => {
      const metrics = { totalSales: 150, revenue: 45000 };
      mockGetEventMetrics.mockResolvedValue(metrics);

      await handler(mockRequest, mockReply);

      expect(mockGetEventMetrics).toHaveBeenCalledWith('event-123');
      expect(mockSend).toHaveBeenCalledWith(metrics);
    });

    it('should handle different event IDs', async () => {
      mockRequest.params = { eventId: 'event-456' };
      const metrics = { totalSales: 200, revenue: 60000 };
      mockGetEventMetrics.mockResolvedValue(metrics);

      await handler(mockRequest, mockReply);

      expect(mockGetEventMetrics).toHaveBeenCalledWith('event-456');
      expect(mockSend).toHaveBeenCalledWith(metrics);
    });

    it('should propagate errors from salesTracker', async () => {
      const error = new Error('Event not found');
      mockGetEventMetrics.mockRejectedValue(error);

      await expect(handler(mockRequest, mockReply)).rejects.toThrow('Event not found');
    });
  });

  describe('POST /sales/track handler', () => {
    let handler: Function;
    let mockRequest: Partial<FastifyRequest>;
    let mockReply: Partial<FastifyReply>;
    let mockSend: jest.Mock;

    beforeEach(async () => {
      await analyticsRoutes(mockServer as FastifyInstance);
      handler = registeredRoutes.get('POST /sales/track')!;

      mockSend = jest.fn().mockReturnThis();
      mockReply = { send: mockSend };
      mockRequest = {
        body: {
          eventId: 'event-123',
          ticketData: { quantity: 2, price: 150 },
        },
      };
    });

    it('should call salesTracker.trackSale with event and ticket data', async () => {
      const result = { success: true, saleId: 'sale-789' };
      mockTrackSale.mockResolvedValue(result);

      await handler(mockRequest, mockReply);

      expect(mockTrackSale).toHaveBeenCalledWith('event-123', { quantity: 2, price: 150 });
      expect(mockSend).toHaveBeenCalledWith(result);
    });

    it('should handle bulk ticket purchases', async () => {
      mockRequest.body = {
        eventId: 'event-456',
        ticketData: { quantity: 10, price: 100 },
      };
      const result = { success: true, saleId: 'sale-999' };
      mockTrackSale.mockResolvedValue(result);

      await handler(mockRequest, mockReply);

      expect(mockTrackSale).toHaveBeenCalledWith('event-456', { quantity: 10, price: 100 });
    });

    it('should propagate errors from trackSale', async () => {
      const error = new Error('Invalid ticket data');
      mockTrackSale.mockRejectedValue(error);

      await expect(handler(mockRequest, mockReply)).rejects.toThrow('Invalid ticket data');
    });
  });

  describe('POST /fraud/check handler', () => {
    let handler: Function;
    let mockRequest: Partial<FastifyRequest>;
    let mockReply: Partial<FastifyReply>;
    let mockSend: jest.Mock;

    beforeEach(async () => {
      await analyticsRoutes(mockServer as FastifyInstance);
      handler = registeredRoutes.get('POST /fraud/check')!;

      mockSend = jest.fn().mockReturnThis();
      mockReply = { send: mockSend };
      mockRequest = {
        body: {
          userId: 'user-123',
          purchaseAmount: 500,
          ipAddress: '192.168.1.1',
        },
      };
    });

    it('should call fraudDetector.detectFraud with user data', async () => {
      const result = { isFraud: false, score: 0.2 };
      mockDetectFraud.mockResolvedValue(result);

      await handler(mockRequest, mockReply);

      expect(mockDetectFraud).toHaveBeenCalledWith({
        userId: 'user-123',
        purchaseAmount: 500,
        ipAddress: '192.168.1.1',
      });
      expect(mockSend).toHaveBeenCalledWith(result);
    });

    it('should detect fraudulent activity', async () => {
      const result = { isFraud: true, score: 0.95, reasons: ['Suspicious IP', 'High velocity'] };
      mockDetectFraud.mockResolvedValue(result);

      await handler(mockRequest, mockReply);

      expect(mockSend).toHaveBeenCalledWith(result);
    });

    it('should propagate errors from fraud detection', async () => {
      const error = new Error('ML model unavailable');
      mockDetectFraud.mockRejectedValue(error);

      await expect(handler(mockRequest, mockReply)).rejects.toThrow('ML model unavailable');
    });
  });

  describe('GET /fraud/metrics handler', () => {
    let handler: Function;
    let mockRequest: Partial<FastifyRequest>;
    let mockReply: Partial<FastifyReply>;
    let mockSend: jest.Mock;

    beforeEach(async () => {
      await analyticsRoutes(mockServer as FastifyInstance);
      handler = registeredRoutes.get('GET /fraud/metrics')!;

      mockSend = jest.fn().mockReturnThis();
      mockReply = { send: mockSend };
      mockRequest = {};
    });

    it('should call fraudDetector.getFraudMetrics', async () => {
      const metrics = {
        totalChecks: 1500,
        fraudDetected: 45,
        falsePositives: 5,
        accuracy: 0.97,
      };
      mockGetFraudMetrics.mockResolvedValue(metrics);

      await handler(mockRequest, mockReply);

      expect(mockGetFraudMetrics).toHaveBeenCalled();
      expect(mockSend).toHaveBeenCalledWith(metrics);
    });

    it('should propagate errors from getFraudMetrics', async () => {
      const error = new Error('Metrics aggregation failed');
      mockGetFraudMetrics.mockRejectedValue(error);

      await expect(handler(mockRequest, mockReply)).rejects.toThrow('Metrics aggregation failed');
    });
  });

  describe('GET /dashboard handler', () => {
    let handler: Function;
    let mockRequest: Partial<FastifyRequest>;
    let mockReply: Partial<FastifyReply>;
    let mockSend: jest.Mock;

    beforeEach(async () => {
      await analyticsRoutes(mockServer as FastifyInstance);
      handler = registeredRoutes.get('GET /dashboard')!;

      mockSend = jest.fn().mockReturnThis();
      mockReply = { send: mockSend };
      mockRequest = {};
    });

    it('should combine fraud metrics and sales events', async () => {
      const fraudMetrics = { fraudDetected: 10, accuracy: 0.95 };
      const salesEvents = { totalSales: 500, revenue: 150000 };

      mockGetFraudMetrics.mockResolvedValue(fraudMetrics);
      mockGetEventMetrics.mockResolvedValue(salesEvents);

      await handler(mockRequest, mockReply);

      expect(mockGetFraudMetrics).toHaveBeenCalled();
      expect(mockGetEventMetrics).toHaveBeenCalledWith('all');
      expect(mockSend).toHaveBeenCalledWith({
        fraud: fraudMetrics,
        sales: salesEvents,
        timestamp: expect.any(Date),
      });
    });

    it('should fetch both metrics in parallel', async () => {
      mockGetFraudMetrics.mockResolvedValue({});
      mockGetEventMetrics.mockResolvedValue({});

      await handler(mockRequest, mockReply);

      // Both should be called
      expect(mockGetFraudMetrics).toHaveBeenCalled();
      expect(mockGetEventMetrics).toHaveBeenCalled();
    });

    it('should include timestamp in response', async () => {
      mockGetFraudMetrics.mockResolvedValue({});
      mockGetEventMetrics.mockResolvedValue({});

      const beforeTime = new Date();
      await handler(mockRequest, mockReply);
      const afterTime = new Date();

      const callArgs = mockSend.mock.calls[0][0];
      expect(callArgs.timestamp).toBeInstanceOf(Date);
      expect(callArgs.timestamp.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(callArgs.timestamp.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });

    it('should propagate errors from fraud metrics', async () => {
      const error = new Error('Fraud metrics failed');
      mockGetFraudMetrics.mockRejectedValue(error);
      mockGetEventMetrics.mockResolvedValue({});

      await expect(handler(mockRequest, mockReply)).rejects.toThrow('Fraud metrics failed');
    });

    it('should propagate errors from sales metrics', async () => {
      const error = new Error('Sales metrics failed');
      mockGetFraudMetrics.mockResolvedValue({});
      mockGetEventMetrics.mockRejectedValue(error);

      await expect(handler(mockRequest, mockReply)).rejects.toThrow('Sales metrics failed');
    });
  });
});
