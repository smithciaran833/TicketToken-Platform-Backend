// Mock dependencies BEFORE imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../src/config/database.config', () => ({
  getPool: jest.fn(),
}));

jest.mock('../../../src/queues/factories/queue.factory', () => ({
  QueueFactory: {
    getQueue: jest.fn(),
  },
}));

// Mock prom-client
const mockGaugeSet = jest.fn();
const mockCounterInc = jest.fn();
const mockHistogramObserve = jest.fn();
const mockRegisterMetrics = jest.fn().mockReturnValue('prometheus_metrics');

jest.mock('prom-client', () => ({
  Registry: jest.fn().mockImplementation(() => ({
    metrics: mockRegisterMetrics,
  })),
  Gauge: jest.fn().mockImplementation(() => ({
    set: mockGaugeSet,
  })),
  Counter: jest.fn().mockImplementation(() => ({
    inc: mockCounterInc,
  })),
  Histogram: jest.fn().mockImplementation(() => ({
    observe: mockHistogramObserve,
  })),
  collectDefaultMetrics: jest.fn(),
}));

// Mock Twilio
const mockTwilioMessagesCreate = jest.fn();
const mockTwilioCallsCreate = jest.fn();

jest.mock('twilio', () => {
  return jest.fn().mockImplementation(() => ({
    messages: { create: mockTwilioMessagesCreate },
    calls: { create: mockTwilioCallsCreate },
  }));
});

import { MonitoringService } from '../../../src/services/monitoring.service';
import { QueueFactory } from '../../../src/queues/factories/queue.factory';
import { getPool } from '../../../src/config/database.config';
import { logger } from '../../../src/utils/logger';
import twilio from 'twilio';

describe('MonitoringService', () => {
  let service: MonitoringService;
  let mockPool: { query: jest.Mock };
  let mockMoneyQueue: any;
  let mockCommQueue: any;
  let mockBackgroundQueue: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Reset singleton
    (MonitoringService as any).instance = undefined;

    // Setup mocks
    mockPool = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };
    (getPool as jest.Mock).mockReturnValue(mockPool);

    // Create separate mocks for each queue type
    mockMoneyQueue = {
      name: 'money-queue',
      getJobCounts: jest.fn().mockResolvedValue({
        waiting: 5,
        active: 2,
        completed: 100,
        failed: 1,
      }),
      getWaiting: jest.fn().mockResolvedValue([]),
    };

    mockCommQueue = {
      name: 'communication-queue',
      getJobCounts: jest.fn().mockResolvedValue({
        waiting: 100,
        active: 5,
        completed: 500,
        failed: 2,
      }),
      getWaiting: jest.fn().mockResolvedValue([]),
    };

    mockBackgroundQueue = {
      name: 'background-queue',
      getJobCounts: jest.fn().mockResolvedValue({
        waiting: 1000,
        active: 10,
        completed: 5000,
        failed: 5,
      }),
      getWaiting: jest.fn().mockResolvedValue([]),
    };

    (QueueFactory.getQueue as jest.Mock).mockImplementation((type: string) => {
      switch (type) {
        case 'money': return mockMoneyQueue;
        case 'communication': return mockCommQueue;
        case 'background': return mockBackgroundQueue;
        default: return mockMoneyQueue;
      }
    });

    // Set environment variables
    process.env.TWILIO_ACCOUNT_SID = 'test_sid';
    process.env.TWILIO_AUTH_TOKEN = 'test_token';
    process.env.TWILIO_PHONE = '+1234567890';
    process.env.ONCALL_PHONE = '+0987654321';

    mockTwilioMessagesCreate.mockResolvedValue({ sid: 'msg_123' });
    mockTwilioCallsCreate.mockResolvedValue({ sid: 'call_123' });

    service = new MonitoringService();
  });

  afterEach(() => {
    jest.useRealTimers();
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_PHONE;
    delete process.env.ONCALL_PHONE;
  });

  describe('constructor', () => {
    it('should initialize with default thresholds', () => {
      expect(service).toBeInstanceOf(MonitoringService);
    });

    it('should setup Prometheus metrics', () => {
      expect(logger.info).toHaveBeenCalledWith('Prometheus metrics initialized');
    });

    it('should setup Twilio client when credentials are provided', () => {
      expect(twilio).toHaveBeenCalledWith('test_sid', 'test_token');
      expect(logger.info).toHaveBeenCalledWith('Twilio client initialized');
    });

    it('should warn when Twilio credentials are not provided', () => {
      delete process.env.TWILIO_ACCOUNT_SID;
      delete process.env.TWILIO_AUTH_TOKEN;
      (MonitoringService as any).instance = undefined;

      jest.isolateModules(() => {
        const { MonitoringService: FreshService } = require('../../../src/services/monitoring.service');
        new FreshService();
      });

      expect(logger.warn).toHaveBeenCalledWith('Twilio credentials not configured - alerts will be logged only');
    });

    it('should load thresholds from environment variables', () => {
      process.env.ALERT_THRESHOLD_MONEY_QUEUE = '100';
      process.env.ALERT_THRESHOLD_MONEY_AGE_MINUTES = '20';
      process.env.ALERT_THRESHOLD_COMM_QUEUE = '10000';
      process.env.ALERT_THRESHOLD_BACKGROUND_QUEUE = '100000';
      process.env.ALERT_THRESHOLD_FAILURE_RATE = '15';

      (MonitoringService as any).instance = undefined;
      const newService = new MonitoringService();

      expect(logger.info).toHaveBeenCalledWith('Alert thresholds loaded:', expect.objectContaining({
        moneyQueueDepth: 100,
        moneyQueueAge: 20,
        commQueueDepth: 10000,
        backgroundQueueDepth: 100000,
        failureRate: 15,
      }));
    });
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = MonitoringService.getInstance();
      const instance2 = MonitoringService.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('start', () => {
    it('should start monitoring and perform initial check', async () => {
      await service.start();

      expect(logger.info).toHaveBeenCalledWith('Starting monitoring service...');
      expect(QueueFactory.getQueue).toHaveBeenCalled();
    });

    it('should set up interval for queue health checks', async () => {
      await service.start();

      expect(jest.getTimerCount()).toBeGreaterThan(0);
    });
  });

  describe('stop', () => {
    it('should stop monitoring service', async () => {
      await service.start();
      await service.stop();

      expect(logger.info).toHaveBeenCalledWith('Monitoring service stopped');
    });

    it('should clear interval when stopped', async () => {
      await service.start();
      const timerCountBefore = jest.getTimerCount();

      await service.stop();

      expect(jest.getTimerCount()).toBeLessThanOrEqual(timerCountBefore);
    });
  });

  describe('queue health checks', () => {
    it('should update Prometheus metrics for queue depths', async () => {
      await service.start();

      expect(mockGaugeSet).toHaveBeenCalledWith(
        { queue_name: 'money-queue', status: 'waiting' },
        5
      );
      expect(mockGaugeSet).toHaveBeenCalledWith(
        { queue_name: 'money-queue', status: 'active' },
        2
      );
    });

    it('should check oldest job age and update metric', async () => {
      const oldJob = {
        id: 'job-123',
        timestamp: Date.now() - 60000, // 1 minute ago
      };
      mockMoneyQueue.getWaiting.mockResolvedValue([oldJob]);

      await service.start();

      expect(mockGaugeSet).toHaveBeenCalledWith(
        { queue_name: 'money-queue' },
        expect.any(Number)
      );
    });

    it('should store metrics in database', async () => {
      await service.start();

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO queue_metrics'),
        expect.arrayContaining(['money-queue'])
      );
    });

    it('should handle errors when checking queues', async () => {
      mockMoneyQueue.getJobCounts.mockRejectedValue(new Error('Queue error'));

      await service.start();

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error checking'),
        expect.any(Error)
      );
    });
  });

  describe('alerts for high failure count', () => {
    it('should send critical alert for high failure count on money queue', async () => {
      mockMoneyQueue.getJobCounts.mockResolvedValue({
        waiting: 5,
        active: 2,
        completed: 100,
        failed: 15, // Exceeds threshold of 10
      });

      await service.start();

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('15 payment jobs failed'),
        expect.any(Object)
      );
    });

    it('should respect alert cooldown to prevent spam', async () => {
      mockMoneyQueue.getJobCounts.mockResolvedValue({
        waiting: 5,
        active: 2,
        completed: 100,
        failed: 15,
      });

      await service.start();

      // Clear mocks and trigger another check
      mockTwilioMessagesCreate.mockClear();
      (logger.error as jest.Mock).mockClear();

      // Advance time but stay within cooldown (5 minutes for critical)
      jest.advanceTimersByTime(60000); // 1 minute

      // Manually trigger queue check
      await (service as any).checkAllQueues();

      // The same alert should not be logged again due to cooldown
      const criticalAlertCalls = (logger.error as jest.Mock).mock.calls.filter(
        (call: any[]) => call[0].includes('payment jobs failed')
      );
      expect(criticalAlertCalls.length).toBe(0);
    });
  });

  describe('getPrometheusMetrics', () => {
    it('should return Prometheus metrics string', () => {
      const metrics = service.getPrometheusMetrics();

      expect(metrics).toBe('prometheus_metrics');
    });
  });

  describe('getMetricsSummary', () => {
    it('should return metrics summary from database', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            { queue_name: 'money-queue', avg_waiting: 10, max_waiting: 50 },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ severity: 'critical', count: 5 }],
        });

      const summary = await service.getMetricsSummary();

      expect(summary).toEqual({
        queues: [{ queue_name: 'money-queue', avg_waiting: 10, max_waiting: 50 }],
        alerts: [{ severity: 'critical', count: 5 }],
        timestamp: expect.any(Date),
      });
    });
  });

  describe('recordJobSuccess', () => {
    it('should record job success metrics', () => {
      service.recordJobSuccess('money-queue', 'payment', 2.5);

      expect(mockHistogramObserve).toHaveBeenCalledWith(
        { queue_name: 'money-queue', job_type: 'payment' },
        2.5
      );
      expect(mockCounterInc).toHaveBeenCalledWith({
        queue_name: 'money-queue',
        job_type: 'payment',
        result: 'success',
      });
    });
  });

  describe('recordJobFailure', () => {
    it('should record job failure metrics', () => {
      service.recordJobFailure('money-queue', 'payment', new Error('Failed'));

      expect(mockCounterInc).toHaveBeenCalledWith({
        queue_name: 'money-queue',
        job_type: 'payment',
        result: 'failure',
      });
    });
  });
});
