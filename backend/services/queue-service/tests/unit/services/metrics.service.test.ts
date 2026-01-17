// Mock dependencies BEFORE imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock prom-client
const mockInc = jest.fn();
const mockSet = jest.fn();
const mockObserve = jest.fn();
const mockMetrics = jest.fn().mockResolvedValue('metrics_output');
const mockGetMetricsAsJSON = jest.fn().mockResolvedValue([]);
const mockResetMetrics = jest.fn();

jest.mock('prom-client', () => ({
  Registry: jest.fn().mockImplementation(() => ({
    metrics: mockMetrics,
    getMetricsAsJSON: mockGetMetricsAsJSON,
    resetMetrics: mockResetMetrics,
  })),
  Counter: jest.fn().mockImplementation(() => ({
    inc: mockInc,
  })),
  Gauge: jest.fn().mockImplementation(() => ({
    set: mockSet,
  })),
  Histogram: jest.fn().mockImplementation(() => ({
    observe: mockObserve,
  })),
}));

describe('MetricsService', () => {
  let MetricsService: any;
  let service: any;
  let logger: any;
  let mockIntervalId: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Mock setInterval to prevent actual intervals
    mockIntervalId = 123;
    jest.spyOn(global, 'setInterval').mockReturnValue(mockIntervalId as any);

    // Re-mock after reset
    jest.doMock('../../../src/utils/logger', () => ({
      logger: {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
      },
    }));

    jest.doMock('prom-client', () => ({
      Registry: jest.fn().mockImplementation(() => ({
        metrics: mockMetrics,
        getMetricsAsJSON: mockGetMetricsAsJSON,
        resetMetrics: mockResetMetrics,
      })),
      Counter: jest.fn().mockImplementation(() => ({
        inc: mockInc,
      })),
      Gauge: jest.fn().mockImplementation(() => ({
        set: mockSet,
      })),
      Histogram: jest.fn().mockImplementation(() => ({
        observe: mockObserve,
      })),
    }));

    const metricsModule = require('../../../src/services/metrics.service');
    MetricsService = metricsModule.MetricsService;
    logger = require('../../../src/utils/logger').logger;
    service = new MetricsService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize and log', () => {
      expect(logger.info).toHaveBeenCalledWith('Metrics service initialized');
    });

    it('should start system metrics collection', () => {
      expect(global.setInterval).toHaveBeenCalledWith(expect.any(Function), 10000);
    });
  });

  describe('recordJobProcessed', () => {
    it('should increment jobs processed counter with success status', () => {
      service.recordJobProcessed('money', 'success');

      expect(mockInc).toHaveBeenCalledWith({ queue: 'money', status: 'success' });
    });

    it('should increment jobs processed counter with failed status', () => {
      service.recordJobProcessed('communication', 'failed');

      expect(mockInc).toHaveBeenCalledWith({ queue: 'communication', status: 'failed' });
    });
  });

  describe('recordJobFailed', () => {
    it('should increment jobs failed counter with reason', () => {
      service.recordJobFailed('money', 'timeout');

      expect(mockInc).toHaveBeenCalledWith({ queue: 'money', reason: 'timeout' });
    });

    it('should handle various failure reasons', () => {
      service.recordJobFailed('background', 'database_error');

      expect(mockInc).toHaveBeenCalledWith({ queue: 'background', reason: 'database_error' });
    });
  });

  describe('recordJobDuration', () => {
    it('should observe job processing duration', () => {
      service.recordJobDuration('money', 2.5);

      expect(mockObserve).toHaveBeenCalledWith({ queue: 'money' }, 2.5);
    });

    it('should handle small durations', () => {
      service.recordJobDuration('communication', 0.05);

      expect(mockObserve).toHaveBeenCalledWith({ queue: 'communication' }, 0.05);
    });

    it('should handle large durations', () => {
      service.recordJobDuration('background', 120.5);

      expect(mockObserve).toHaveBeenCalledWith({ queue: 'background' }, 120.5);
    });
  });

  describe('setActiveJobs', () => {
    it('should set active jobs gauge', () => {
      service.setActiveJobs('money', 5);

      expect(mockSet).toHaveBeenCalledWith({ queue: 'money' }, 5);
    });

    it('should handle zero active jobs', () => {
      service.setActiveJobs('communication', 0);

      expect(mockSet).toHaveBeenCalledWith({ queue: 'communication' }, 0);
    });
  });

  describe('setQueueSize', () => {
    it('should set queue size gauge', () => {
      service.setQueueSize('money', 100);

      expect(mockSet).toHaveBeenCalledWith({ queue: 'money' }, 100);
    });

    it('should handle large queue sizes', () => {
      service.setQueueSize('background', 50000);

      expect(mockSet).toHaveBeenCalledWith({ queue: 'background' }, 50000);
    });
  });

  describe('recordPayment', () => {
    it('should increment payment counter and amount on success', () => {
      service.recordPayment('usd', 5000, 'success');

      expect(mockInc).toHaveBeenCalledWith({ currency: 'usd', status: 'success' });
      expect(mockInc).toHaveBeenCalledWith({ currency: 'usd' }, 5000);
    });

    it('should only increment counter on failure (not amount)', () => {
      mockInc.mockClear();
      service.recordPayment('eur', 3000, 'failed');

      expect(mockInc).toHaveBeenCalledTimes(1);
      expect(mockInc).toHaveBeenCalledWith({ currency: 'eur', status: 'failed' });
    });
  });

  describe('recordRefund', () => {
    it('should increment refund counter and amount on success', () => {
      service.recordRefund('usd', 2500, 'success');

      expect(mockInc).toHaveBeenCalledWith({ currency: 'usd', status: 'success' });
      expect(mockInc).toHaveBeenCalledWith({ currency: 'usd' }, 2500);
    });

    it('should only increment counter on failure (not amount)', () => {
      mockInc.mockClear();
      service.recordRefund('gbp', 1500, 'failed');

      expect(mockInc).toHaveBeenCalledTimes(1);
      expect(mockInc).toHaveBeenCalledWith({ currency: 'gbp', status: 'failed' });
    });
  });

  describe('recordNFTMint', () => {
    it('should increment NFT minted counter on success', () => {
      service.recordNFTMint('success');

      expect(mockInc).toHaveBeenCalledWith({ status: 'success' });
    });

    it('should increment NFT minted counter on failure', () => {
      service.recordNFTMint('failed');

      expect(mockInc).toHaveBeenCalledWith({ status: 'failed' });
    });
  });

  describe('recordNFTTransfer', () => {
    it('should increment NFT transfer counter on success', () => {
      service.recordNFTTransfer('success');

      expect(mockInc).toHaveBeenCalledWith({ status: 'success' });
    });

    it('should increment NFT transfer counter on failure', () => {
      service.recordNFTTransfer('failed');

      expect(mockInc).toHaveBeenCalledWith({ status: 'failed' });
    });
  });

  describe('setSolanaBalance', () => {
    it('should set Solana balance gauge', () => {
      service.setSolanaBalance(10.5);

      expect(mockSet).toHaveBeenCalledWith(10.5);
    });

    it('should handle zero balance', () => {
      service.setSolanaBalance(0);

      expect(mockSet).toHaveBeenCalledWith(0);
    });
  });

  describe('recordEmail', () => {
    it('should increment emails sent counter on success', () => {
      service.recordEmail('payment_confirmation', true);

      expect(mockInc).toHaveBeenCalledWith({ type: 'payment_confirmation' });
    });

    it('should increment emails failed counter on failure', () => {
      service.recordEmail('refund_notification', false);

      expect(mockInc).toHaveBeenCalledWith({ type: 'refund_notification' });
    });
  });

  describe('recordWebhook', () => {
    it('should increment webhooks sent counter on success', () => {
      service.recordWebhook('payment.completed', true);

      expect(mockInc).toHaveBeenCalledWith({ event: 'payment.completed' });
    });

    it('should increment webhooks failed counter on failure', () => {
      service.recordWebhook('nft.minted', false);

      expect(mockInc).toHaveBeenCalledWith({ event: 'nft.minted' });
    });
  });

  describe('getMetrics', () => {
    it('should return Prometheus format metrics', async () => {
      const result = await service.getMetrics();

      expect(mockMetrics).toHaveBeenCalled();
      expect(result).toBe('metrics_output');
    });
  });

  describe('getMetricsJSON', () => {
    it('should return metrics as JSON', async () => {
      mockGetMetricsAsJSON.mockResolvedValue([{ name: 'test_metric', value: 1 }]);

      const result = await service.getMetricsJSON();

      expect(mockGetMetricsAsJSON).toHaveBeenCalled();
      expect(result).toEqual([{ name: 'test_metric', value: 1 }]);
    });
  });

  describe('reset', () => {
    it('should reset all metrics', () => {
      service.reset();

      expect(mockResetMetrics).toHaveBeenCalled();
    });
  });

  describe('system metrics collection callback', () => {
    it('should update metrics when callback is invoked', () => {
      const setIntervalCall = (global.setInterval as jest.Mock).mock.calls[0];
      const callback = setIntervalCall[0];

      jest.spyOn(process, 'uptime').mockReturnValue(3600);
      jest.spyOn(process, 'memoryUsage').mockReturnValue({
        rss: 100000000,
        heapTotal: 80000000,
        heapUsed: 60000000,
        external: 5000000,
        arrayBuffers: 1000000,
      });
      jest.spyOn(process, 'cpuUsage').mockReturnValue({ user: 1000000, system: 500000 });

      callback();

      expect(mockSet).toHaveBeenCalledWith(3600); // uptime
      expect(mockSet).toHaveBeenCalledWith({ type: 'rss' }, 100000000);
      expect(mockSet).toHaveBeenCalledWith({ type: 'heapTotal' }, 80000000);
      expect(mockSet).toHaveBeenCalledWith({ type: 'heapUsed' }, 60000000);
      expect(mockSet).toHaveBeenCalledWith({ type: 'external' }, 5000000);
    });

    it('should handle errors in system metrics collection', () => {
      const setIntervalCall = (global.setInterval as jest.Mock).mock.calls[0];
      const callback = setIntervalCall[0];

      jest.spyOn(process, 'uptime').mockImplementation(() => {
        throw new Error('Uptime error');
      });

      callback();

      expect(logger.error).toHaveBeenCalledWith('Failed to collect system metrics', {
        error: 'Uptime error',
      });
    });
  });
});
