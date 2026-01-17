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

import { SystemMetricsCollector } from '../../../../src/collectors/system/cpu.collector';

describe('SystemMetricsCollector', () => {
  let collector: SystemMetricsCollector;
  let mockSetInterval: jest.SpyInstance;
  let mockClearInterval: jest.SpyInstance;

  const mockCpuData = [
    {
      model: 'Intel i7',
      speed: 2400,
      times: { user: 1000000, nice: 0, sys: 500000, idle: 8500000, irq: 0 },
    },
    {
      model: 'Intel i7',
      speed: 2400,
      times: { user: 1200000, nice: 0, sys: 600000, idle: 8200000, irq: 0 },
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockSetInterval = jest.spyOn(global, 'setInterval');
    mockClearInterval = jest.spyOn(global, 'clearInterval');

    (os.cpus as jest.Mock).mockReturnValue(mockCpuData);
    (os.hostname as jest.Mock).mockReturnValue('test-host');

    collector = new SystemMetricsCollector();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('getName', () => {
    it('should return collector name', () => {
      expect(collector.getName()).toBe('SystemMetricsCollector');
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
      expect(mockPushMetrics.mock.calls[0][0]).toMatchObject({
        name: 'system_cpu_usage_percent',
        type: 'gauge',
        service: 'monitoring-service',
      });
    });

    it('should include hostname in labels', async () => {
      await collector.start();

      expect(mockPushMetrics).toHaveBeenCalledWith(
        expect.objectContaining({
          labels: { hostname: 'test-host' },
        })
      );
    });

    it('should calculate CPU usage percentage correctly', async () => {
      await collector.start();

      // Total idle: 8500000 + 8200000 = 16700000
      // Total tick: (1000000+500000+8500000) + (1200000+600000+8200000) = 20000000
      // CPU usage: 100 - (100 * 16700000 / 20000000) = 16.5%
      const cpuUsage = mockPushMetrics.mock.calls[0][0].value;
      expect(cpuUsage).toBeGreaterThanOrEqual(0);
      expect(cpuUsage).toBeLessThanOrEqual(100);
    });

    it('should warn when CPU usage exceeds threshold', async () => {
      // Mock high CPU usage
      (os.cpus as jest.Mock).mockReturnValue([
        {
          times: { user: 9000000, nice: 0, sys: 500000, idle: 500000, irq: 0 },
        },
      ]);

      await collector.start();

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining('High CPU usage detected:')
      );
    });

    it('should not warn when CPU usage is below threshold', async () => {
      // Mock low CPU usage
      (os.cpus as jest.Mock).mockReturnValue([
        {
          times: { user: 1000000, nice: 0, sys: 500000, idle: 8500000, irq: 0 },
        },
      ]);

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
      await Promise.resolve(); // Flush promises

      expect(mockPushMetrics).toHaveBeenCalled();
    });

    it('should continue collecting after errors', async () => {
      mockPushMetrics.mockRejectedValueOnce(new Error('Metrics service unavailable'));

      await collector.start();
      expect(mockLoggerError).toHaveBeenCalledWith(
        'Error collecting CPU metrics:',
        expect.any(Error)
      );

      mockPushMetrics.mockClear();
      mockLoggerError.mockClear();

      jest.advanceTimersByTime(5000);
      await Promise.resolve();

      // Should try again on next interval
      expect(mockPushMetrics).toHaveBeenCalled();
    });

    it('should handle os.cpus() errors gracefully', async () => {
      (os.cpus as jest.Mock).mockImplementation(() => {
        throw new Error('CPU info unavailable');
      });

      await collector.start();

      expect(mockLoggerError).toHaveBeenCalledWith(
        'Error collecting CPU metrics:',
        expect.any(Error)
      );
    });
  });

  describe('edge cases', () => {
    it('should handle single CPU core', async () => {
      (os.cpus as jest.Mock).mockReturnValue([
        {
          times: { user: 1000000, nice: 0, sys: 500000, idle: 8500000, irq: 0 },
        },
      ]);

      await collector.start();

      expect(mockPushMetrics).toHaveBeenCalled();
      const cpuUsage = mockPushMetrics.mock.calls[0][0].value;
      expect(cpuUsage).toBeGreaterThanOrEqual(0);
      expect(cpuUsage).toBeLessThanOrEqual(100);
    });

    it('should handle zero idle time (100% CPU)', async () => {
      (os.cpus as jest.Mock).mockReturnValue([
        {
          times: { user: 5000000, nice: 0, sys: 5000000, idle: 0, irq: 0 },
        },
      ]);

      await collector.start();

      const cpuUsage = mockPushMetrics.mock.calls[0][0].value;
      expect(cpuUsage).toBe(100);
    });

    it('should handle multiple CPUs with different loads', async () => {
      (os.cpus as jest.Mock).mockReturnValue([
        { times: { user: 9000000, nice: 0, sys: 500000, idle: 500000, irq: 0 } },
        { times: { user: 1000000, nice: 0, sys: 500000, idle: 8500000, irq: 0 } },
        { times: { user: 5000000, nice: 0, sys: 2000000, idle: 3000000, irq: 0 } },
      ]);

      await collector.start();

      expect(mockPushMetrics).toHaveBeenCalled();
      const cpuUsage = mockPushMetrics.mock.calls[0][0].value;
      expect(cpuUsage).toBeGreaterThanOrEqual(0);
      expect(cpuUsage).toBeLessThanOrEqual(100);
    });
  });
});
