import axios from 'axios';

// Mock dependencies BEFORE imports
const mockPushMetrics = jest.fn();
const mockLoggerWarn = jest.fn();
const mockLoggerDebug = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('../../../../src/services/metrics.service', () => ({
  metricsService: {
    pushMetrics: mockPushMetrics,
  },
}));

jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    warn: mockLoggerWarn,
    debug: mockLoggerDebug,
    error: mockLoggerError,
    info: jest.fn(),
  },
}));

jest.mock('../../../../src/config', () => ({
  config: {
    services: {
      apiGateway: 'http://localhost:3000',
      auth: 'http://localhost:3001',
      venue: 'http://localhost:3002',
      event: 'http://localhost:3003',
      ticket: 'http://localhost:3004',
      payment: 'http://localhost:3005',
      marketplace: 'http://localhost:3006',
      analytics: 'http://localhost:3007',
    },
  },
}));

jest.mock('axios');

import { HTTPMetricsCollector } from '../../../../src/collectors/application/http.collector';

describe('HTTPMetricsCollector', () => {
  let collector: HTTPMetricsCollector;
  let mockSetInterval: jest.SpyInstance;
  let mockClearInterval: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockSetInterval = jest.spyOn(global, 'setInterval');
    mockClearInterval = jest.spyOn(global, 'clearInterval');

    (axios.get as jest.Mock).mockResolvedValue({
      status: 200,
      data: { status: 'healthy' },
    });

    collector = new HTTPMetricsCollector();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('getName', () => {
    it('should return collector name', () => {
      expect(collector.getName()).toBe('HTTPMetricsCollector');
    });
  });

  describe('start', () => {
    it('should set up interval for metric collection', async () => {
      await collector.start();

      expect(mockSetInterval).toHaveBeenCalledWith(expect.any(Function), 30000);
    });

    it('should collect metrics immediately on start', async () => {
      await collector.start();

      expect(axios.get).toHaveBeenCalled();
      expect(mockPushMetrics).toHaveBeenCalled();
    });

    it('should check all configured services', async () => {
      await collector.start();

      expect(axios.get).toHaveBeenCalledTimes(8);
      expect(axios.get).toHaveBeenCalledWith('http://localhost:3000/health', expect.any(Object));
      expect(axios.get).toHaveBeenCalledWith('http://localhost:3001/health', expect.any(Object));
      expect(axios.get).toHaveBeenCalledWith('http://localhost:3007/health', expect.any(Object));
    });

    it('should use 5 second timeout for health checks', async () => {
      await collector.start();

      expect(axios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ timeout: 5000 })
      );
    });

    it('should accept any status code (validateStatus)', async () => {
      await collector.start();

      const call = (axios.get as jest.Mock).mock.calls[0];
      const config = call[1];
      expect(config.validateStatus()).toBe(true);
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
  });

  describe('collect - successful health checks', () => {
    it('should record response time for healthy service', async () => {
      (axios.get as jest.Mock).mockResolvedValue({ status: 200 });

      await collector.start();

      const responseTimeCall = mockPushMetrics.mock.calls.find(
        call => call[0].name === 'http_response_time_ms'
      );

      expect(responseTimeCall).toBeDefined();
      expect(responseTimeCall[0]).toMatchObject({
        name: 'http_response_time_ms',
        type: 'histogram',
        labels: {
          endpoint: '/health',
          status: '200',
        },
      });
      expect(responseTimeCall[0].value).toBeGreaterThanOrEqual(0);
    });

    it('should record service as up for 2xx status', async () => {
      (axios.get as jest.Mock).mockResolvedValue({ status: 200 });

      await collector.start();

      const serviceUpCalls = mockPushMetrics.mock.calls.filter(
        call => call[0].name === 'service_up'
      );

      expect(serviceUpCalls.length).toBe(8);
      serviceUpCalls.forEach(call => {
        expect(call[0].value).toBe(1);
      });
    });

    it('should record service as up for 3xx status', async () => {
      (axios.get as jest.Mock).mockResolvedValue({ status: 301 });

      await collector.start();

      const serviceUpCall = mockPushMetrics.mock.calls.find(
        call => call[0].name === 'service_up' && call[0].value === 1
      );

      expect(serviceUpCall).toBeDefined();
    });

    it('should record service as up for 4xx status', async () => {
      (axios.get as jest.Mock).mockResolvedValue({ status: 404 });

      await collector.start();

      const serviceUpCall = mockPushMetrics.mock.calls.find(
        call => call[0].name === 'service_up' && call[0].value === 1
      );

      expect(serviceUpCall).toBeDefined();
    });

    it('should include port in service_up labels', async () => {
      await collector.start();

      const authServiceCall = mockPushMetrics.mock.calls.find(
        call => call[0].name === 'service_up' && call[0].service === 'auth'
      );

      expect(authServiceCall[0].labels.port).toBe('3001');
    });
  });

  describe('collect - service errors', () => {
    it('should record service as down for 5xx status', async () => {
      (axios.get as jest.Mock).mockResolvedValue({ status: 500 });

      await collector.start();

      const serviceUpCall = mockPushMetrics.mock.calls.find(
        call => call[0].name === 'service_up' && call[0].value === 0
      );

      expect(serviceUpCall).toBeDefined();
    });

    it('should warn when service returns 5xx status', async () => {
      (axios.get as jest.Mock).mockResolvedValue({ status: 503 });

      await collector.start();

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining('returned error status: 503')
      );
    });

    it('should record response time even for error status', async () => {
      (axios.get as jest.Mock).mockResolvedValue({ status: 500 });

      await collector.start();

      const responseTimeCall = mockPushMetrics.mock.calls.find(
        call => call[0].name === 'http_response_time_ms'
      );

      expect(responseTimeCall).toBeDefined();
      expect(responseTimeCall[0].labels.status).toBe('500');
    });

    it('should handle connection refused errors', async () => {
      const error = new Error('connect ECONNREFUSED');
      (axios.get as jest.Mock).mockRejectedValue(error);

      await collector.start();

      const serviceUpCalls = mockPushMetrics.mock.calls.filter(
        call => call[0].name === 'service_up' && call[0].value === 0
      );

      expect(serviceUpCalls.length).toBe(8);
    });

    it('should log debug message for failed health check', async () => {
      const error = new Error('Network timeout');
      (axios.get as jest.Mock).mockRejectedValue(error);

      await collector.start();

      expect(mockLoggerDebug).toHaveBeenCalledWith(
        expect.stringContaining('health check failed: Network timeout')
      );
    });

    it('should handle errors without message', async () => {
      (axios.get as jest.Mock).mockRejectedValue({});

      await collector.start();

      expect(mockLoggerDebug).toHaveBeenCalledWith(
        expect.stringContaining('Unknown error')
      );
    });

    it('should continue checking other services after one fails', async () => {
      (axios.get as jest.Mock)
        .mockRejectedValueOnce(new Error('Service 1 down'))
        .mockResolvedValue({ status: 200 });

      await collector.start();

      expect(axios.get).toHaveBeenCalledTimes(8);
      const serviceUpCalls = mockPushMetrics.mock.calls.filter(
        call => call[0].name === 'service_up'
      );
      expect(serviceUpCalls.length).toBe(8);
    });
  });

  describe('collect - mixed service health', () => {
    it('should handle mix of healthy and unhealthy services', async () => {
      (axios.get as jest.Mock)
        .mockResolvedValueOnce({ status: 200 }) // api-gateway
        .mockResolvedValueOnce({ status: 500 }) // auth
        .mockRejectedValueOnce(new Error('Connection refused')) // venue
        .mockResolvedValueOnce({ status: 200 }) // event
        .mockResolvedValueOnce({ status: 404 }) // ticket
        .mockResolvedValueOnce({ status: 503 }) // payment
        .mockResolvedValueOnce({ status: 200 }) // marketplace
        .mockResolvedValueOnce({ status: 200 }); // analytics

      await collector.start();

      const upServices = mockPushMetrics.mock.calls.filter(
        call => call[0].name === 'service_up' && call[0].value === 1
      );

      const downServices = mockPushMetrics.mock.calls.filter(
        call => call[0].name === 'service_up' && call[0].value === 0
      );

      expect(upServices.length).toBe(5); // api-gateway, event, ticket, marketplace, analytics
      expect(downServices.length).toBe(3); // auth, venue, payment
    });
  });

  describe('interval collection', () => {
    it('should collect metrics on each interval tick', async () => {
      await collector.start();
      (axios.get as jest.Mock).mockClear();
      mockPushMetrics.mockClear();

      jest.advanceTimersByTime(30000);
      await Promise.resolve();

      expect(axios.get).toHaveBeenCalled();
      expect(mockPushMetrics).toHaveBeenCalled();
    });

    it('should continue collecting after errors', async () => {
      await collector.start();

      (axios.get as jest.Mock).mockRejectedValue(new Error('Temporary failure'));
      jest.advanceTimersByTime(30000);
      await Promise.resolve();

      (axios.get as jest.Mock).mockResolvedValue({ status: 200 });
      mockPushMetrics.mockClear();
      jest.advanceTimersByTime(30000);
      await Promise.resolve();

      expect(mockPushMetrics).toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle very slow response times', async () => {
      // Keep fake timers but mock Date.now to simulate time passing
      const originalDateNow = Date.now;
      let callCount = 0;
      Date.now = jest.fn(() => {
        callCount++;
        // First call is start time, second is end time (100ms later)
        return callCount === 1 ? 1000 : 1100;
      });

      (axios.get as jest.Mock).mockResolvedValue({ status: 200 });

      await collector.start();

      const responseTimeCall = mockPushMetrics.mock.calls.find(
        call => call[0].name === 'http_response_time_ms'
      );

      expect(responseTimeCall[0].value).toBeGreaterThanOrEqual(90);

      Date.now = originalDateNow;
    });

    it('should handle status codes at boundaries', async () => {
      const statusCodes = [199, 200, 299, 300, 399, 400, 499, 500, 599];

      for (const status of statusCodes) {
        (axios.get as jest.Mock).mockResolvedValue({ status });
        mockPushMetrics.mockClear();

        await collector.start();
        await collector.stop();

        const serviceUpCall = mockPushMetrics.mock.calls.find(
          call => call[0].name === 'service_up'
        );

        if (status >= 500) {
          expect(serviceUpCall[0].value).toBe(0);
        } else {
          expect(serviceUpCall[0].value).toBe(1);
        }
      }
    });
  });
});
