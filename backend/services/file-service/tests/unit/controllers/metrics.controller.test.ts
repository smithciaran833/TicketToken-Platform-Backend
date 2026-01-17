// Mock dependencies BEFORE imports
jest.mock('../../../src/services/metrics.service');
jest.mock('../../../src/config/database');
jest.mock('../../../src/services/virus-scan.service');
jest.mock('../../../src/utils/logger');

import { FastifyRequest, FastifyReply } from 'fastify';
import { MetricsController } from '../../../src/controllers/metrics.controller';
import { metricsService } from '../../../src/services/metrics.service';
import { db } from '../../../src/config/database';
import { virusScanService } from '../../../src/services/virus-scan.service';

describe('controllers/metrics.controller', () => {
  let controller: MetricsController;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockMetricsService: jest.Mocked<typeof metricsService>;
  let mockDb: any;
  let mockVirusScanService: jest.Mocked<typeof virusScanService>;

  beforeEach(() => {
    jest.clearAllMocks();

    controller = new MetricsController();

    mockRequest = {};

    mockReply = {
      send: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      header: jest.fn().mockReturnThis(),
    };

    mockMetricsService = metricsService as jest.Mocked<typeof metricsService>;
    mockDb = db as any;
    mockVirusScanService = virusScanService as jest.Mocked<typeof virusScanService>;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getMetrics', () => {
    it('should return Prometheus format metrics', async () => {
      const prometheusMetrics = '# HELP file_uploads_total Total file uploads\nfile_uploads_total 100';
      mockMetricsService.getMetrics = jest.fn().mockResolvedValue(prometheusMetrics);

      await controller.getMetrics(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockMetricsService.getMetrics).toHaveBeenCalled();
      expect(mockReply.header).toHaveBeenCalledWith('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      expect(mockReply.send).toHaveBeenCalledWith(prometheusMetrics);
    });

    it('should handle metrics service errors', async () => {
      mockMetricsService.getMetrics = jest.fn().mockRejectedValue(new Error('Metrics unavailable'));

      await controller.getMetrics(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Failed to retrieve metrics' });
    });
  });

  describe('getMetricsJSON', () => {
    it('should return JSON format metrics wrapped in metrics object', async () => {
      const jsonMetrics = {
        fileUploads: 100,
        totalBytes: 1048576,
        activeUsers: 10,
      };
      mockMetricsService.getMetricsJSON = jest.fn().mockResolvedValue(jsonMetrics);

      await controller.getMetricsJSON(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockMetricsService.getMetricsJSON).toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({ metrics: jsonMetrics });
    });

    it('should handle JSON metrics errors', async () => {
      mockMetricsService.getMetricsJSON = jest.fn().mockRejectedValue(new Error('JSON error'));

      await controller.getMetricsJSON(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getStats', () => {

    it('should handle database query errors gracefully', async () => {
      const mockQueryBuilder = {
        whereNull: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        first: jest.fn().mockRejectedValue(new Error('Database error')),
      };

      mockDb.mockReturnValue(mockQueryBuilder);
      mockDb.raw = jest.fn().mockImplementation((sql: string) => sql);

      await controller.getStats(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Failed to retrieve statistics' });
    });
  });

  describe('getDetailedHealth', () => {
    beforeEach(() => {
      // Mock db.raw for database health check
      mockDb.raw = jest.fn().mockResolvedValue({ rows: [{ result: 1 }] });
    });

    it('should return healthy when all components healthy', async () => {
      mockVirusScanService.getHealth = jest.fn().mockResolvedValue({
        healthy: true,
        version: '1.0.0',
      });

      await controller.getDetailedHealth(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'healthy',
          timestamp: expect.any(String),
          uptime: expect.any(Number),
          memory: expect.any(Object),
          components: expect.objectContaining({
            database: expect.objectContaining({ status: 'healthy' }),
            storage: expect.objectContaining({ status: 'healthy' }),
            virusScanner: expect.objectContaining({ status: 'healthy' }),
          }),
        })
      );
    });

    it('should return degraded when virus scanner fails', async () => {
      mockVirusScanService.getHealth = jest.fn().mockRejectedValue(new Error('Scanner down'));

      await controller.getDetailedHealth(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(503);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'degraded',
          components: expect.objectContaining({
            virusScanner: expect.objectContaining({ 
              status: 'unknown',
              error: 'Scanner down',
            }),
          }),
        })
      );
    });

    it('should include uptime and memory metrics', async () => {
      mockVirusScanService.getHealth = jest.fn().mockResolvedValue({ healthy: true });

      await controller.getDetailedHealth(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          uptime: expect.any(Number),
          memory: expect.objectContaining({
            rss: expect.any(Number),
            heapTotal: expect.any(Number),
            heapUsed: expect.any(Number),
          }),
        })
      );
    });

    it('should measure database latency', async () => {
      mockVirusScanService.getHealth = jest.fn().mockResolvedValue({ healthy: true });

      await controller.getDetailedHealth(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          components: expect.objectContaining({
            database: expect.objectContaining({
              latency_ms: expect.any(Number),
            }),
          }),
        })
      );
    });

    it('should handle database failures', async () => {
      mockDb.raw = jest.fn().mockRejectedValue(new Error('Connection timeout'));
      mockVirusScanService.getHealth = jest.fn().mockResolvedValue({ healthy: true });

      await controller.getDetailedHealth(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'degraded',
          components: expect.objectContaining({
            database: expect.objectContaining({
              status: 'unhealthy',
              error: 'Connection timeout',
            }),
          }),
        })
      );
    });
  });

  describe('checkStorage (private method behavior)', () => {
    it('should detect storage provider type', async () => {
      mockDb.raw = jest.fn().mockResolvedValue({ rows: [{ result: 1 }] });
      mockVirusScanService.getHealth = jest.fn().mockResolvedValue({ healthy: true });

      process.env.STORAGE_PROVIDER = 's3';

      await controller.getDetailedHealth(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          components: expect.objectContaining({
            storage: expect.objectContaining({
              provider: 's3',
            }),
          }),
        })
      );

      delete process.env.STORAGE_PROVIDER;
    });
  });

  describe('checkVirusScanner (private method behavior)', () => {
    beforeEach(() => {
      mockDb.raw = jest.fn().mockResolvedValue({ rows: [{ result: 1 }] });
    });

    it('should check virus scanner version and health', async () => {
      mockVirusScanService.getHealth = jest.fn().mockResolvedValue({
        healthy: true,
        version: 'ClamAV 0.103.8',
      });

      await controller.getDetailedHealth(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          components: expect.objectContaining({
            virusScanner: expect.objectContaining({
              status: 'healthy',
              version: 'ClamAV 0.103.8',
            }),
          }),
        })
      );
    });

    it('should handle scanner unavailable gracefully', async () => {
      mockVirusScanService.getHealth = jest.fn().mockRejectedValue(new Error('Scanner not responding'));

      await controller.getDetailedHealth(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'degraded',
          components: expect.objectContaining({
            virusScanner: expect.objectContaining({
              status: 'unknown',
              error: 'Scanner not responding',
            }),
          }),
        })
      );
    });
  });
});
