import os from 'os';

// Mock dependencies BEFORE imports
const mockPushMetrics = jest.fn();
const mockLoggerWarn = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('../../../../src/services/metrics.service', () => ({
  metricsService: {
    pushMetrics: mockPushMetrics,
  },
}));

jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    warn: mockLoggerWarn,
    error: mockLoggerError,
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../../src/config', () => ({
  config: {
    intervals: {
      metricCollection: 5000,
    },
    thresholds: {
      cpu: 80,
      memory: 85,
    },
  },
}));

jest.mock('os');

import { MemoryCollector } from '../../../../src/collectors/system/memory.collector';

describe('MemoryCollector', () => {
  let collector: MemoryCollector;
  let mockSetInterval: jest.SpyInstance;
  let mockClearInterval: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockSetInterval = jest.spyOn(global, 'setInterval');
    mockClearInterval = jest.spyOn(global, 'clearInterval');

    (os.totalmem as jest.Mock).mockReturnValue(16 * 1024 * 1024 * 1024); // 16GB
    (os.freemem as jest.Mock).mockReturnValue(8 * 1024 * 1024 * 1024); // 8GB free
    (os.hostname as jest.Mock).mockReturnValue('test-host');

    collector = new MemoryCollector();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('getName', () => {
    it('should return collector name', () => {
      expect(collector.getName()).toBe('MemoryCollector');
    });
  });

  describe('start', () => {
    it('should set up interval for metric collection', async () => {
      await collector.start();

      expect(mockSetInterval).toHaveBeenCalledWith(expect.any(Function), 5000);
    });

    it('should collect metrics immediately on start', async () => {
      await collector.start();

      expect(mockPushMetrics).toHaveBeenCalled();
      expect(mockPushMetrics).toHaveBeenCalledTimes(2); // bytes and percent
    });

    it('should push memory usage in bytes', async () => {
      await collector.start();

      const bytesCall = mockPushMetrics.mock.calls.find(
        (call) => call[0].name === 'system_memory_usage_bytes'
      );

      expect(bytesCall).toBeDefined();
      expect(bytesCall[0]).toMatchObject({
        name: 'system_memory_usage_bytes',
        type: 'gauge',
        service: 'monitoring-service',
        value: 8 * 1024 * 1024 * 1024, // 8GB used
        labels: { hostname: 'test-host' },
      });
    });

    it('should push memory usage in percent', async () => {
      await collector.start();

      const percentCall = mockPushMetrics.mock.calls.find(
        (call) => call[0].name === 'system_memory_usage_percent'
      );

      expect(percentCall).toBeDefined();
      expect(percentCall[0]).toMatchObject({
        name: 'system_memory_usage_percent',
        type: 'gauge',
        service: 'monitoring-service',
        value: 50, // 50% used
        labels: { hostname: 'test-host' },
      });
    });

    it('should calculate memory usage percentage correctly', async () => {
      (os.totalmem as jest.Mock).mockReturnValue(10000);
      (os.freemem as jest.Mock).mockReturnValue(3000);

      await collector.start();

      const percentCall = mockPushMetrics.mock.calls.find(
        (call) => call[0].name === 'system_memory_usage_percent'
      );

      expect(percentCall[0].value).toBe(70); // (7000/10000) * 100
    });

    it('should warn when memory usage exceeds threshold', async () => {
      (os.totalmem as jest.Mock).mockReturnValue(10000);
      (os.freemem as jest.Mock).mockReturnValue(1000); // 90% used

      await collector.start();

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining('High memory usage detected: 90.00%')
      );
    });

    it('should not warn when memory usage is below threshold', async () => {
      (os.totalmem as jest.Mock).mockReturnValue(10000);
      (os.freemem as jest.Mock).mockReturnValue(5000); // 50% used

      await collector.start();

      expect(mockLoggerWarn).not.toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('should clear interval when stopped', async () => {
      await collector.start();
      await collector.stop();

      expect(mockClearInterval).toHaveBeenCalled();
    });

    it('should handle stop when not started', async () => {
      await expect(collector.stop()).resolves.not.toThrow();
      expect(mockClearInterval).not.toHaveBeenCalled();
    });

    it('should prevent further metric collection after stop', async () => {
      await collector.start();
      mockPushMetrics.mockClear();

      await collector.stop();
      jest.advanceTimersByTime(10000);

      expect(mockPushMetrics).not.toHaveBeenCalled();
    });
  });

  describe('collect (via interval)', () => {
    it('should collect metrics on each interval tick', async () => {
      await collector.start();
      mockPushMetrics.mockClear();

      jest.advanceTimersByTime(5000);
      await Promise.resolve();

      expect(mockPushMetrics).toHaveBeenCalledTimes(2);
    });

    it('should continue collecting after errors', async () => {
      mockPushMetrics.mockRejectedValueOnce(new Error('Metrics service down'));

      await collector.start();
      expect(mockLoggerError).toHaveBeenCalled();

      mockPushMetrics.mockClear();
      mockLoggerError.mockClear();

      jest.advanceTimersByTime(5000);
      await Promise.resolve();

      expect(mockPushMetrics).toHaveBeenCalled();
    });

    it('should handle os.totalmem() errors gracefully', async () => {
      (os.totalmem as jest.Mock).mockImplementation(() => {
        throw new Error('Memory info unavailable');
      });

      await collector.start();

      expect(mockLoggerError).toHaveBeenCalledWith(
        'Error collecting memory metrics:',
        expect.any(Error)
      );
    });
  });

  describe('edge cases', () => {
    it('should handle zero free memory (100% usage)', async () => {
      (os.totalmem as jest.Mock).mockReturnValue(10000);
      (os.freemem as jest.Mock).mockReturnValue(0);

      await collector.start();

      const percentCall = mockPushMetrics.mock.calls.find(
        (call) => call[0].name === 'system_memory_usage_percent'
      );

      expect(percentCall[0].value).toBe(100);
      expect(mockLoggerWarn).toHaveBeenCalled();
    });

    it('should handle all memory free (0% usage)', async () => {
      (os.totalmem as jest.Mock).mockReturnValue(10000);
      (os.freemem as jest.Mock).mockReturnValue(10000);

      await collector.start();

      const percentCall = mockPushMetrics.mock.calls.find(
        (call) => call[0].name === 'system_memory_usage_percent'
      );

      expect(percentCall[0].value).toBe(0);
    });

    it('should format warning message with 2 decimal places', async () => {
      (os.totalmem as jest.Mock).mockReturnValue(10000);
      (os.freemem as jest.Mock).mockReturnValue(1234); // 87.66% used

      await collector.start();

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining('87.66%')
      );
    });

    it('should handle very large memory values', async () => {
      const largeMemory = 1024 * 1024 * 1024 * 1024; // 1TB
      (os.totalmem as jest.Mock).mockReturnValue(largeMemory);
      (os.freemem as jest.Mock).mockReturnValue(largeMemory / 2);

      await collector.start();

      const bytesCall = mockPushMetrics.mock.calls.find(
        (call) => call[0].name === 'system_memory_usage_bytes'
      );

      expect(bytesCall[0].value).toBe(largeMemory / 2);
    });
  });
});
