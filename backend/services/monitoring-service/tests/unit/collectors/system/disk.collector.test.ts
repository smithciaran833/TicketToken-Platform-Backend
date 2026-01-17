import * as os from 'os';
import { execSync } from 'child_process';

// Mock dependencies BEFORE imports
const mockPushMetrics = jest.fn();
const mockLoggerInfo = jest.fn();
const mockLoggerWarn = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('../../../../src/logger', () => ({
  logger: {
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
    error: mockLoggerError,
    debug: jest.fn(),
  },
}));

jest.mock('../../../../src/services/metrics.service', () => ({
  metricsService: {
    pushMetrics: mockPushMetrics,
  },
}));

jest.mock('os');
jest.mock('child_process');

import { DiskCollector } from '../../../../src/collectors/system/disk.collector';

describe('DiskCollector', () => {
  let collector: DiskCollector;
  let mockSetInterval: jest.SpyInstance;
  let mockClearInterval: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockSetInterval = jest.spyOn(global, 'setInterval');
    mockClearInterval = jest.spyOn(global, 'clearInterval');

    (os.hostname as jest.Mock).mockReturnValue('test-host');
    (os.platform as jest.Mock).mockReturnValue('linux');

    collector = new DiskCollector(30000);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with default interval', () => {
      const defaultCollector = new DiskCollector();
      expect(defaultCollector.getName()).toBe('DiskCollector');
    });

    it('should initialize with custom interval', () => {
      const customCollector = new DiskCollector(60000);
      expect(customCollector.getName()).toBe('DiskCollector');
    });
  });

  describe('getName', () => {
    it('should return collector name', () => {
      expect(collector.getName()).toBe('DiskCollector');
    });
  });

  describe('start', () => {
    it('should log start message', async () => {
      // Mock df output - only the data line (like tail -1 would return)
      (execSync as jest.Mock).mockReturnValue(
        Buffer.from('/dev/sda1 104857600 52428800 52428800 50% /')
      );

      await collector.start();

      expect(mockLoggerInfo).toHaveBeenCalledWith('Starting DiskCollector...');
      expect(mockLoggerInfo).toHaveBeenCalledWith('DiskCollector started, collecting every 30000ms');
    });

    it('should collect metrics immediately on start', async () => {
      (execSync as jest.Mock).mockReturnValue(
        Buffer.from('/dev/sda1 104857600 52428800 52428800 50% /')
      );

      await collector.start();

      expect(mockPushMetrics).toHaveBeenCalled();
    });

    it('should set up interval for metric collection', async () => {
      (execSync as jest.Mock).mockReturnValue(
        Buffer.from('/dev/sda1 104857600 52428800 52428800 50% /')
      );

      await collector.start();

      expect(mockSetInterval).toHaveBeenCalledWith(expect.any(Function), 30000);
    });
  });

  describe('stop', () => {
    it('should clear interval and log message', async () => {
      (execSync as jest.Mock).mockReturnValue(
        Buffer.from('/dev/sda1 104857600 52428800 52428800 50% /')
      );

      await collector.start();
      await collector.stop();

      expect(mockClearInterval).toHaveBeenCalled();
      expect(mockLoggerInfo).toHaveBeenCalledWith('DiskCollector stopped');
    });

    it('should handle stop when not started', async () => {
      await collector.stop();

      expect(mockClearInterval).not.toHaveBeenCalled();
      expect(mockLoggerInfo).toHaveBeenCalledWith('DiskCollector stopped');
    });
  });

  describe('collectUnixDiskMetrics (Linux/macOS)', () => {
    beforeEach(() => {
      (os.platform as jest.Mock).mockReturnValue('linux');
    });

    it('should collect Unix disk metrics successfully', async () => {
      // Mock df output: 100GB total, 50GB used, 50GB available, 50% usage
      // Format: /dev/sda1 104857600 52428800 52428800 50% /
      (execSync as jest.Mock).mockReturnValue(
        Buffer.from('/dev/sda1 104857600 52428800 52428800 50% /')
      );

      await collector.start();

      expect(execSync).toHaveBeenCalledWith('df -k / | tail -1');
      expect(mockPushMetrics).toHaveBeenCalledTimes(4);

      // Check total GB metric
      expect(mockPushMetrics).toHaveBeenCalledWith({
        name: 'system_disk_total_gb',
        type: 'gauge',
        service: 'monitoring-service',
        value: 100,
        labels: { hostname: 'test-host', mount: '/' },
      });

      // Check used GB metric
      expect(mockPushMetrics).toHaveBeenCalledWith({
        name: 'system_disk_used_gb',
        type: 'gauge',
        service: 'monitoring-service',
        value: 50,
        labels: { hostname: 'test-host', mount: '/' },
      });

      // Check available GB metric
      expect(mockPushMetrics).toHaveBeenCalledWith({
        name: 'system_disk_available_gb',
        type: 'gauge',
        service: 'monitoring-service',
        value: 50,
        labels: { hostname: 'test-host', mount: '/' },
      });

      // Check usage percent metric
      expect(mockPushMetrics).toHaveBeenCalledWith({
        name: 'system_disk_usage_percent',
        type: 'gauge',
        service: 'monitoring-service',
        value: 50,
        labels: { hostname: 'test-host', mount: '/' },
      });
    });

    it('should warn when disk usage exceeds 85%', async () => {
      (execSync as jest.Mock).mockReturnValue(
        Buffer.from('/dev/sda1 104857600 94371840 10485760 90% /')
      );

      await collector.start();

      expect(mockLoggerWarn).toHaveBeenCalledWith('High disk usage detected: 90% on test-host');
    });

    it('should not warn when disk usage is below 85%', async () => {
      (execSync as jest.Mock).mockReturnValue(
        Buffer.from('/dev/sda1 104857600 52428800 52428800 50% /')
      );

      await collector.start();

      expect(mockLoggerWarn).not.toHaveBeenCalled();
    });

    it('should handle macOS platform', async () => {
      (os.platform as jest.Mock).mockReturnValue('darwin');
      (execSync as jest.Mock).mockReturnValue(
        Buffer.from('/dev/disk1 209715200 104857600 104857600 50% /')
      );

      await collector.start();

      expect(mockPushMetrics).toHaveBeenCalledTimes(4);
    });

    it('should handle errors in Unix disk collection', async () => {
      (execSync as jest.Mock).mockImplementation(() => {
        throw new Error('df command failed');
      });

      await collector.start();

      expect(mockLoggerError).toHaveBeenCalledWith('Failed to collect Unix disk metrics:', expect.any(Error));
      expect(mockLoggerError).toHaveBeenCalledWith('Failed to collect disk metrics:', expect.any(Error));
    });
  });

  describe('collectWindowsDiskMetrics', () => {
    beforeEach(() => {
      (os.platform as jest.Mock).mockReturnValue('win32');
    });

    it('should collect Windows disk metrics successfully', async () => {
      // Mock wmic output: 500GB total, 250GB free
      const wmicOutput = 'Node,FreeSpace,Size\nTEST-PC,268435456000,536870912000';
      (execSync as jest.Mock).mockReturnValue(Buffer.from(wmicOutput));

      await collector.start();

      expect(execSync).toHaveBeenCalledWith("wmic logicaldisk where \"DeviceID='C:'\" get Size,FreeSpace /format:csv");
      expect(mockPushMetrics).toHaveBeenCalledTimes(4);

      // Should push metrics with mount: 'C:'
      const callsWithC = mockPushMetrics.mock.calls.filter(call => 
        call[0].labels && call[0].labels.mount === 'C:'
      );
      expect(callsWithC.length).toBe(4);
    });

    it('should calculate Windows disk usage correctly', async () => {
      // 1TB total, 200GB free, 800GB used = ~80.47% usage
      const wmicOutput = 'Node,FreeSpace,Size\nTEST-PC,214748364800,1099511627776';
      (execSync as jest.Mock).mockReturnValue(Buffer.from(wmicOutput));

      await collector.start();

      const usageCall = mockPushMetrics.mock.calls.find(
        call => call[0].name === 'system_disk_usage_percent'
      );
      // Expect approximately 80% (actual is 80.468...)
      expect(usageCall[0].value).toBeGreaterThan(80);
      expect(usageCall[0].value).toBeLessThan(81);
    });

    it('should warn when Windows disk usage exceeds 85%', async () => {
      // 1TB total, 50GB free, 950GB used = 95% usage
      const wmicOutput = 'Node,FreeSpace,Size\nTEST-PC,53687091200,1099511627776';
      (execSync as jest.Mock).mockReturnValue(Buffer.from(wmicOutput));

      await collector.start();

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining('High disk usage detected')
      );
    });

    it('should handle no disk information found error', async () => {
      (execSync as jest.Mock).mockReturnValue(Buffer.from('Node\n'));

      await collector.start();

      expect(mockLoggerError).toHaveBeenCalledWith(
        'Failed to collect Windows disk metrics:',
        expect.objectContaining({ message: 'No disk information found' })
      );
    });

    it('should handle wmic command errors', async () => {
      (execSync as jest.Mock).mockImplementation(() => {
        throw new Error('wmic command not found');
      });

      await collector.start();

      expect(mockLoggerError).toHaveBeenCalledWith('Failed to collect Windows disk metrics:', expect.any(Error));
    });
  });

  describe('unsupported platforms', () => {
    it('should warn for unsupported platforms', async () => {
      (os.platform as jest.Mock).mockReturnValue('freebsd');

      await collector.start();

      expect(mockLoggerWarn).toHaveBeenCalledWith('Disk metrics not supported on platform: freebsd');
      expect(mockPushMetrics).not.toHaveBeenCalled();
    });
  });

  describe('interval collection', () => {
    it('should collect metrics on each interval', async () => {
      (execSync as jest.Mock).mockReturnValue(
        Buffer.from('/dev/sda1 104857600 52428800 52428800 50% /')
      );

      await collector.start();
      mockPushMetrics.mockClear();

      jest.advanceTimersByTime(30000);
      await Promise.resolve();

      expect(mockPushMetrics).toHaveBeenCalled();
    });

    it('should handle errors during interval collection', async () => {
      (execSync as jest.Mock).mockReturnValue(
        Buffer.from('/dev/sda1 104857600 52428800 52428800 50% /')
      );

      await collector.start();
      
      // Make next collection fail
      (execSync as jest.Mock).mockImplementation(() => {
        throw new Error('Collection failed');
      });

      mockLoggerError.mockClear();
      jest.advanceTimersByTime(30000);
      await Promise.resolve();

      // The error is caught in the interval handler and logged with this message
      expect(mockLoggerError).toHaveBeenCalled();
      const errorCalls = mockLoggerError.mock.calls;
      const hasCollectionError = errorCalls.some(call => 
        call[0] === 'DiskCollector collection error:' || 
        call[0] === 'Failed to collect disk metrics:' ||
        call[0] === 'Failed to collect Unix disk metrics:'
      );
      expect(hasCollectionError).toBe(true);
    });

    it('should continue collecting after errors', async () => {
      (execSync as jest.Mock).mockReturnValue(
        Buffer.from('/dev/sda1 104857600 52428800 52428800 50% /')
      );

      await collector.start();
      
      // First interval - fail
      (execSync as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Temporary failure');
      });
      jest.advanceTimersByTime(30000);
      await Promise.resolve();

      // Second interval - succeed
      (execSync as jest.Mock).mockReturnValue(
        Buffer.from('/dev/sda1 104857600 52428800 52428800 50% /')
      );
      mockPushMetrics.mockClear();
      jest.advanceTimersByTime(30000);
      await Promise.resolve();

      expect(mockPushMetrics).toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle zero free space', async () => {
      (execSync as jest.Mock).mockReturnValue(
        Buffer.from('/dev/sda1 104857600 104857600 0 100% /')
      );

      await collector.start();

      const availableCall = mockPushMetrics.mock.calls.find(
        call => call[0].name === 'system_disk_available_gb'
      );
      expect(availableCall[0].value).toBe(0);

      const usageCall = mockPushMetrics.mock.calls.find(
        call => call[0].name === 'system_disk_usage_percent'
      );
      expect(usageCall[0].value).toBe(100);
    });

    it('should handle very large disk sizes', async () => {
      // 10TB disk (10485760000 KB = 10TB)
      (execSync as jest.Mock).mockReturnValue(
        Buffer.from('/dev/sda1 10485760000 5242880000 5242880000 50% /')
      );

      await collector.start();

      const totalCall = mockPushMetrics.mock.calls.find(
        call => call[0].name === 'system_disk_total_gb'
      );
      expect(totalCall[0].value).toBeCloseTo(10000, 0);
    });

    it('should handle malformed df output', async () => {
      (execSync as jest.Mock).mockReturnValue(Buffer.from('invalid output'));

      await collector.start();

      expect(mockLoggerError).toHaveBeenCalled();
    });
  });
});
