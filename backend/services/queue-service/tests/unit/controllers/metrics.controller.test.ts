// Mock logger BEFORE imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock database config
jest.mock('../../../src/config/database.config', () => ({
  getPool: jest.fn(),
}));

// Mock MonitoringService
const mockGetPrometheusMetrics = jest.fn();
const mockGetMetricsSummary = jest.fn();

jest.mock('../../../src/services/monitoring.service', () => ({
  MonitoringService: {
    getInstance: jest.fn(() => ({
      getPrometheusMetrics: mockGetPrometheusMetrics,
      getMetricsSummary: mockGetMetricsSummary,
    })),
  },
}));

// Mock cache integration
jest.mock('../../../src/services/cache-integration', () => ({
  serviceCache: {},
}));

import { FastifyRequest, FastifyReply } from 'fastify';
import { MetricsController } from '../../../src/controllers/metrics.controller';
import { getPool } from '../../../src/config/database.config';
import { logger } from '../../../src/utils/logger';

describe('MetricsController', () => {
  let controller: MetricsController;
  let mockReply: Partial<FastifyReply>;
  let mockPool: any;

  beforeEach(() => {
    controller = new MetricsController();

    mockReply = {
      code: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      header: jest.fn().mockReturnThis(),
    };

    mockPool = {
      query: jest.fn(),
    };

    (getPool as jest.Mock).mockReturnValue(mockPool);
    mockGetPrometheusMetrics.mockReset();
    mockGetMetricsSummary.mockReset();
  });

  describe('getPrometheusMetrics', () => {
    it('should return prometheus metrics with correct content type', async () => {
      const prometheusMetrics = `# HELP queue_jobs_total Total jobs processed
# TYPE queue_jobs_total counter
queue_jobs_total{queue="money"} 1000
queue_jobs_total{queue="communication"} 5000`;

      mockGetPrometheusMetrics.mockReturnValue(prometheusMetrics);

      const mockRequest = {} as FastifyRequest;

      await controller.getPrometheusMetrics(mockRequest, mockReply as FastifyReply);

      expect(mockGetPrometheusMetrics).toHaveBeenCalled();
      expect(mockReply.header).toHaveBeenCalledWith('Content-Type', 'text/plain');
      expect(mockReply.send).toHaveBeenCalledWith(prometheusMetrics);
    });

    it('should return empty string when no metrics available', async () => {
      mockGetPrometheusMetrics.mockReturnValue('');

      const mockRequest = {} as FastifyRequest;

      await controller.getPrometheusMetrics(mockRequest, mockReply as FastifyReply);

      expect(mockReply.header).toHaveBeenCalledWith('Content-Type', 'text/plain');
      expect(mockReply.send).toHaveBeenCalledWith('');
    });

    it('should return 500 when getPrometheusMetrics throws', async () => {
      mockGetPrometheusMetrics.mockImplementation(() => {
        throw new Error('Metrics collection failed');
      });

      const mockRequest = {} as FastifyRequest;

      await controller.getPrometheusMetrics(mockRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Failed to get metrics' });
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to get Prometheus metrics:',
        expect.any(Error)
      );
    });

    it('should set content type header before sending response', async () => {
      mockGetPrometheusMetrics.mockReturnValue('metrics');

      const mockRequest = {} as FastifyRequest;

      await controller.getPrometheusMetrics(mockRequest, mockReply as FastifyReply);

      // Verify header was called before send
      const headerCallOrder = (mockReply.header as jest.Mock).mock.invocationCallOrder[0];
      const sendCallOrder = (mockReply.send as jest.Mock).mock.invocationCallOrder[0];
      expect(headerCallOrder).toBeLessThan(sendCallOrder);
    });
  });

  describe('getMetricsSummary', () => {
    it('should return metrics summary', async () => {
      const summary = {
        queues: {
          money: { waiting: 5, active: 2, completed: 100, failed: 1 },
          communication: { waiting: 10, active: 1, completed: 500, failed: 5 },
          background: { waiting: 20, active: 0, completed: 1000, failed: 10 },
        },
        system: {
          uptime: 3600,
          memoryUsage: 512000000,
        },
      };

      mockGetMetricsSummary.mockResolvedValue(summary);

      const mockRequest = {} as FastifyRequest;

      await controller.getMetricsSummary(mockRequest, mockReply as FastifyReply);

      expect(mockGetMetricsSummary).toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith(summary);
    });

    it('should return empty summary when no data available', async () => {
      mockGetMetricsSummary.mockResolvedValue({});

      const mockRequest = {} as FastifyRequest;

      await controller.getMetricsSummary(mockRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith({});
    });

    it('should return 500 when getMetricsSummary fails', async () => {
      mockGetMetricsSummary.mockRejectedValue(new Error('Database connection failed'));

      const mockRequest = {} as FastifyRequest;

      await controller.getMetricsSummary(mockRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Failed to get metrics summary' });
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to get metrics summary:',
        expect.any(Error)
      );
    });

    it('should handle partial data in summary', async () => {
      const partialSummary = {
        queues: { money: { waiting: 5 } },
      };

      mockGetMetricsSummary.mockResolvedValue(partialSummary);

      const mockRequest = {} as FastifyRequest;

      await controller.getMetricsSummary(mockRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith(partialSummary);
    });
  });

  describe('getThroughput', () => {
    it('should return throughput data with timestamp', async () => {
      const throughputRows = [
        { queue_name: 'money', minute: '2024-01-15T10:00:00Z', jobs_per_minute: 50 },
        { queue_name: 'money', minute: '2024-01-15T09:59:00Z', jobs_per_minute: 45 },
        { queue_name: 'communication', minute: '2024-01-15T10:00:00Z', jobs_per_minute: 200 },
      ];

      mockPool.query.mockResolvedValue({ rows: throughputRows });

      const mockRequest = {} as FastifyRequest;

      await controller.getThroughput(mockRequest, mockReply as FastifyReply);

      expect(getPool).toHaveBeenCalled();
      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('DATE_TRUNC'));
      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('queue_metrics'));
      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining("INTERVAL '1 hour'"));

      expect(mockReply.send).toHaveBeenCalledWith({
        throughput: throughputRows,
        timestamp: expect.any(Date),
      });
    });

    it('should return empty array when no throughput data', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const mockRequest = {} as FastifyRequest;

      await controller.getThroughput(mockRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        throughput: [],
        timestamp: expect.any(Date),
      });
    });

    it('should query with proper aggregation and ordering', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const mockRequest = {} as FastifyRequest;

      await controller.getThroughput(mockRequest, mockReply as FastifyReply);

      const queryCall = mockPool.query.mock.calls[0][0];
      expect(queryCall).toContain('GROUP BY queue_name, minute');
      expect(queryCall).toContain('ORDER BY minute DESC');
      expect(queryCall).toContain('MAX(completed_count) - MIN(completed_count)');
    });

    it('should return 500 when database query fails', async () => {
      mockPool.query.mockRejectedValue(new Error('Database error'));

      const mockRequest = {} as FastifyRequest;

      await controller.getThroughput(mockRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Failed to get throughput' });
      expect(logger.error).toHaveBeenCalledWith('Failed to get throughput:', expect.any(Error));
    });

    it('should return 500 when getPool throws', async () => {
      (getPool as jest.Mock).mockImplementation(() => {
        throw new Error('Pool not initialized');
      });

      const mockRequest = {} as FastifyRequest;

      await controller.getThroughput(mockRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Failed to get throughput' });
    });

    it('should include current timestamp in response', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });
      const beforeCall = new Date();

      const mockRequest = {} as FastifyRequest;

      await controller.getThroughput(mockRequest, mockReply as FastifyReply);

      const afterCall = new Date();
      const sendCall = (mockReply.send as jest.Mock).mock.calls[0][0];

      expect(sendCall.timestamp.getTime()).toBeGreaterThanOrEqual(beforeCall.getTime());
      expect(sendCall.timestamp.getTime()).toBeLessThanOrEqual(afterCall.getTime());
    });
  });

  describe('getFailureAnalysis', () => {
    it('should return failure trends and top failures', async () => {
      const failureTrends = [
        { queue_name: 'money', hour: '2024-01-15T10:00:00Z', avg_failures: 2.5 },
        { queue_name: 'communication', hour: '2024-01-15T10:00:00Z', avg_failures: 5.0 },
      ];

      const deadLetterJobs = [
        { queue_name: 'money', job_type: 'payment', count: 10, last_failure: '2024-01-15T10:30:00Z' },
        { queue_name: 'communication', job_type: 'email', count: 5, last_failure: '2024-01-15T10:25:00Z' },
      ];

      mockPool.query
        .mockResolvedValueOnce({ rows: failureTrends })
        .mockResolvedValueOnce({ rows: deadLetterJobs });

      const mockRequest = {} as FastifyRequest;

      await controller.getFailureAnalysis(mockRequest, mockReply as FastifyReply);

      expect(mockPool.query).toHaveBeenCalledTimes(2);
      expect(mockReply.send).toHaveBeenCalledWith({
        trends: failureTrends,
        topFailures: deadLetterJobs,
        timestamp: expect.any(Date),
      });
    });

    it('should query failure trends with 24 hour window', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const mockRequest = {} as FastifyRequest;

      await controller.getFailureAnalysis(mockRequest, mockReply as FastifyReply);

      const firstQuery = mockPool.query.mock.calls[0][0];
      expect(firstQuery).toContain("INTERVAL '24 hours'");
      expect(firstQuery).toContain('queue_metrics');
      expect(firstQuery).toContain('AVG(failed_count)');
      expect(firstQuery).toContain("DATE_TRUNC('hour'");
    });

    it('should query dead letter jobs with limit 10', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const mockRequest = {} as FastifyRequest;

      await controller.getFailureAnalysis(mockRequest, mockReply as FastifyReply);

      const secondQuery = mockPool.query.mock.calls[1][0];
      expect(secondQuery).toContain('dead_letter_jobs');
      expect(secondQuery).toContain('LIMIT 10');
      expect(secondQuery).toContain('ORDER BY count DESC');
      expect(secondQuery).toContain("INTERVAL '24 hours'");
    });

    it('should return empty arrays when no failures', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const mockRequest = {} as FastifyRequest;

      await controller.getFailureAnalysis(mockRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        trends: [],
        topFailures: [],
        timestamp: expect.any(Date),
      });
    });

    it('should return 500 when first query fails', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('Database error'));

      const mockRequest = {} as FastifyRequest;

      await controller.getFailureAnalysis(mockRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Failed to get failure analysis' });
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to get failure analysis:',
        expect.any(Error)
      );
    });

    it('should return 500 when second query fails', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(new Error('Dead letter table error'));

      const mockRequest = {} as FastifyRequest;

      await controller.getFailureAnalysis(mockRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Failed to get failure analysis' });
    });

    it('should return 500 when getPool throws', async () => {
      (getPool as jest.Mock).mockImplementation(() => {
        throw new Error('Pool unavailable');
      });

      const mockRequest = {} as FastifyRequest;

      await controller.getFailureAnalysis(mockRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Failed to get failure analysis' });
    });

    it('should include timestamp in response', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const beforeCall = new Date();
      const mockRequest = {} as FastifyRequest;

      await controller.getFailureAnalysis(mockRequest, mockReply as FastifyReply);

      const afterCall = new Date();
      const sendCall = (mockReply.send as jest.Mock).mock.calls[0][0];

      expect(sendCall.timestamp).toBeInstanceOf(Date);
      expect(sendCall.timestamp.getTime()).toBeGreaterThanOrEqual(beforeCall.getTime());
      expect(sendCall.timestamp.getTime()).toBeLessThanOrEqual(afterCall.getTime());
    });

    it('should handle large result sets', async () => {
      const manyTrends = Array(100).fill(null).map((_, i) => ({
        queue_name: 'money',
        hour: new Date(Date.now() - i * 3600000).toISOString(),
        avg_failures: Math.random() * 10,
      }));

      const topFailures = Array(10).fill(null).map((_, i) => ({
        queue_name: i % 2 === 0 ? 'money' : 'communication',
        job_type: `job-type-${i}`,
        count: 100 - i * 10,
        last_failure: new Date().toISOString(),
      }));

      mockPool.query
        .mockResolvedValueOnce({ rows: manyTrends })
        .mockResolvedValueOnce({ rows: topFailures });

      const mockRequest = {} as FastifyRequest;

      await controller.getFailureAnalysis(mockRequest, mockReply as FastifyReply);

      const sendCall = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(sendCall.trends).toHaveLength(100);
      expect(sendCall.topFailures).toHaveLength(10);
    });
  });
});
