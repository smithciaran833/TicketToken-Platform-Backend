// Mock dependencies BEFORE imports
jest.mock('prom-client');
jest.mock('../../../src/utils/logger');

import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';
import { MetricsService, metricsService } from '../../../src/services/metrics.service';

describe('services/metrics.service', () => {
  let service: MetricsService;
  let mockRegistry: jest.Mocked<Registry>;
  let mockCounter: jest.Mocked<Counter>;
  let mockHistogram: jest.Mocked<Histogram>;
  let mockGauge: jest.Mocked<Gauge>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Counter
    mockCounter = {
      inc: jest.fn(),
      reset: jest.fn(),
      labels: jest.fn().mockReturnThis(),
    } as any;

    // Mock Histogram
    mockHistogram = {
      observe: jest.fn(),
      reset: jest.fn(),
      labels: jest.fn().mockReturnThis(),
    } as any;

    // Mock Gauge
    mockGauge = {
      set: jest.fn(),
      inc: jest.fn(),
      dec: jest.fn(),
      reset: jest.fn(),
      labels: jest.fn().mockReturnThis(),
    } as any;

    // Mock Registry
    mockRegistry = {
      setDefaultLabels: jest.fn(),
      metrics: jest.fn().mockResolvedValue('# Metrics output'),
      getMetricsAsJSON: jest.fn().mockResolvedValue([]),
      resetMetrics: jest.fn(),
    } as any;

    (Registry as jest.MockedClass<typeof Registry>).mockImplementation(() => mockRegistry);
    (Counter as jest.MockedClass<typeof Counter>).mockImplementation(() => mockCounter);
    (Histogram as jest.MockedClass<typeof Histogram>).mockImplementation(() => mockHistogram);
    (Gauge as jest.MockedClass<typeof Gauge>).mockImplementation(() => mockGauge);
    (collectDefaultMetrics as jest.MockedFunction<typeof collectDefaultMetrics>).mockImplementation(() => {});

    service = new MetricsService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize registry with default labels', () => {
      expect(Registry).toHaveBeenCalled();
      expect(mockRegistry.setDefaultLabels).toHaveBeenCalledWith({
        service: 'file-service',
        environment: expect.any(String)
      });
    });

    it('should collect default Node.js metrics', () => {
      expect(collectDefaultMetrics).toHaveBeenCalledWith({
        register: mockRegistry,
        prefix: 'file_service_'
      });
    });

    it('should initialize all metric types', () => {
      // Verify Counter metrics were created
      expect(Counter).toHaveBeenCalledWith(expect.objectContaining({
        name: 'file_uploads_total'
      }));
      
      // Verify Histogram metrics were created
      expect(Histogram).toHaveBeenCalledWith(expect.objectContaining({
        name: 'file_upload_duration_seconds'
      }));
      
      // Verify Gauge metrics were created
      expect(Gauge).toHaveBeenCalledWith(expect.objectContaining({
        name: 'active_connections'
      }));
    });

    it('should create upload metrics with correct configuration', () => {
      expect(Counter).toHaveBeenCalledWith(expect.objectContaining({
        name: 'file_uploads_total',
        help: 'Total number of file uploads',
        labelNames: ['status', 'file_type', 'user_type']
      }));
    });

    it('should create histogram with appropriate buckets', () => {
      expect(Histogram).toHaveBeenCalledWith(expect.objectContaining({
        name: 'file_upload_duration_seconds',
        buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60]
      }));
    });
  });

  describe('recordUpload', () => {
    it('should record successful file upload', () => {
      // Act
      service.recordUpload('success', 'image/jpeg', 'user', 2.5, 1024000);

      // Assert
      expect(mockCounter.inc).toHaveBeenCalledWith({
        status: 'success',
        file_type: 'image/jpeg',
        user_type: 'user'
      });
      expect(mockHistogram.observe).toHaveBeenCalledWith({ file_type: 'image/jpeg' }, 2.5);
      expect(mockHistogram.observe).toHaveBeenCalledWith({ file_type: 'image/jpeg' }, 1024000);
    });

    it('should record failed upload', () => {
      // Act
      service.recordUpload('failure', 'application/pdf', 'admin', 0.5, 0);

      // Assert
      expect(mockCounter.inc).toHaveBeenCalledWith({
        status: 'failure',
        file_type: 'application/pdf',
        user_type: 'admin'
      });
    });

    it('should increment files by type counter', () => {
      // Act
      service.recordUpload('success', 'video/mp4', 'user', 10.2, 52428800);

      // Assert
      expect(mockCounter.inc).toHaveBeenCalledWith({ content_type: 'video/mp4' });
    });

    it('should handle various file sizes', () => {
      const sizes = [1024, 1048576, 104857600]; // 1KB, 1MB, 100MB
      
      sizes.forEach(size => {
        mockHistogram.observe.mockClear();
        service.recordUpload('success', 'image/png', 'user', 1.0, size);
        
        expect(mockHistogram.observe).toHaveBeenCalledWith({ file_type: 'image/png' }, size);
      });
    });
  });

  describe('recordDownload', () => {
    it('should record successful download', () => {
      // Act
      service.recordDownload('success', 'image/jpeg', 1.5);

      // Assert
      expect(mockCounter.inc).toHaveBeenCalledWith({
        status: 'success',
        file_type: 'image/jpeg'
      });
      expect(mockHistogram.observe).toHaveBeenCalledWith({ file_type: 'image/jpeg' }, 1.5);
    });

    it('should record failed download', () => {
      // Act
      service.recordDownload('failure', 'application/pdf', 0.2);

      // Assert
      expect(mockCounter.inc).toHaveBeenCalledWith({
        status: 'failure',
        file_type: 'application/pdf'
      });
    });

    it('should track download duration', () => {
      // Act
      service.recordDownload('success', 'video/mp4', 5.7);

      // Assert
      expect(mockHistogram.observe).toHaveBeenCalledWith({ file_type: 'video/mp4' }, 5.7);
    });
  });

  describe('recordProcessing', () => {
    it('should record image processing', () => {
      // Act
      service.recordProcessing('resize', 'success', 2.1);

      // Assert
      expect(mockCounter.inc).toHaveBeenCalledWith({
        operation: 'resize',
        status: 'success'
      });
      expect(mockHistogram.observe).toHaveBeenCalledWith({ operation: 'resize' }, 2.1);
    });

    it('should record thumbnail generation', () => {
      // Act
      service.recordProcessing('thumbnail', 'success', 0.8);

      // Assert
      expect(mockCounter.inc).toHaveBeenCalledWith({
        operation: 'thumbnail',
        status: 'success'
      });
    });

    it('should record failed processing', () => {
      // Act
      service.recordProcessing('compress', 'failure', 1.2);

      // Assert
      expect(mockCounter.inc).toHaveBeenCalledWith({
        operation: 'compress',
        status: 'failure'
      });
    });
  });

  describe('recordVirusScan', () => {
    it('should record clean scan result', () => {
      // Act
      service.recordVirusScan('clean', 1.5);

      // Assert
      expect(mockCounter.inc).toHaveBeenCalledWith({ result: 'clean' });
      expect(mockHistogram.observe).toHaveBeenCalledWith(1.5);
    });

    it('should record infected file with virus name', () => {
      // Act
      service.recordVirusScan('infected', 2.3, 'Trojan.Generic');

      // Assert
      expect(mockCounter.inc).toHaveBeenCalledWith({ result: 'infected' });
      expect(mockCounter.inc).toHaveBeenCalledWith({ virus_name: 'Trojan.Generic' });
      expect(mockHistogram.observe).toHaveBeenCalledWith(2.3);
    });

    it('should record failed scan', () => {
      // Act
      service.recordVirusScan('failed', 0.5);

      // Assert
      expect(mockCounter.inc).toHaveBeenCalledWith({ result: 'failed' });
    });

    it('should not increment infected counter for clean files', () => {
      // Arrange
      const incCallCount = mockCounter.inc.mock.calls.length;

      // Act
      service.recordVirusScan('clean', 1.0);

      // Assert - should only be called once for result, not for virus_name
      expect(mockCounter.inc).toHaveBeenCalledTimes(incCallCount + 1);
    });
  });

  describe('recordStorageOperation', () => {
    it('should record S3 upload operation', () => {
      // Act
      service.recordStorageOperation('upload', 's3', 1.2);

      // Assert
      expect(mockHistogram.observe).toHaveBeenCalledWith(
        { operation: 'upload', provider: 's3' },
        1.2
      );
    });

    it('should record local storage operation', () => {
      // Act
      service.recordStorageOperation('download', 'local', 0.5);

      // Assert
      expect(mockHistogram.observe).toHaveBeenCalledWith(
        { operation: 'download', provider: 'local' },
        0.5
      );
    });

    it('should record delete operation', () => {
      // Act
      service.recordStorageOperation('delete', 's3', 0.3);

      // Assert
      expect(mockHistogram.observe).toHaveBeenCalledWith(
        { operation: 'delete', provider: 's3' },
        0.3
      );
    });
  });

  describe('recordStorageError', () => {
    it('should record S3 connection error', () => {
      // Act
      service.recordStorageError('upload', 's3', 'connection_timeout');

      // Assert
      expect(mockCounter.inc).toHaveBeenCalledWith({
        operation: 'upload',
        provider: 's3',
        error_type: 'connection_timeout'
      });
    });

    it('should record permission error', () => {
      // Act
      service.recordStorageError('download', 's3', 'permission_denied');

      // Assert
      expect(mockCounter.inc).toHaveBeenCalledWith({
        operation: 'download',
        provider: 's3',
        error_type: 'permission_denied'
      });
    });
  });

  describe('recordAuthAttempt', () => {
    it('should record successful authentication', () => {
      // Act
      service.recordAuthAttempt(true);

      // Assert
      expect(mockCounter.inc).toHaveBeenCalledWith({ status: 'success' });
    });

    it('should record failed authentication with reason', () => {
      // Act
      service.recordAuthAttempt(false, 'invalid_token');

      // Assert
      expect(mockCounter.inc).toHaveBeenCalledWith({ status: 'failure' });
      expect(mockCounter.inc).toHaveBeenCalledWith({ reason: 'invalid_token' });
    });

    it('should record expired token failure', () => {
      // Act
      service.recordAuthAttempt(false, 'expired_token');

      // Assert
      expect(mockCounter.inc).toHaveBeenCalledWith({ reason: 'expired_token' });
    });

    it('should not record failure reason for successful auth', () => {
      // Arrange
      const incCallCount = mockCounter.inc.mock.calls.length;

      // Act
      service.recordAuthAttempt(true, 'should_not_be_recorded');

      // Assert - only one call for success status
      expect(mockCounter.inc).toHaveBeenCalledTimes(incCallCount + 1);
    });
  });

  describe('recordRateLimitExceeded', () => {
    it('should record rate limit for specific endpoint', () => {
      // Act
      service.recordRateLimitExceeded('/api/upload', 'user');

      // Assert
      expect(mockCounter.inc).toHaveBeenCalledWith({
        endpoint: '/api/upload',
        user_type: 'user'
      });
    });

    it('should record rate limit for admin user', () => {
      // Act
      service.recordRateLimitExceeded('/api/download', 'admin');

      // Assert
      expect(mockCounter.inc).toHaveBeenCalledWith({
        endpoint: '/api/download',
        user_type: 'admin'
      });
    });
  });

  describe('recordError', () => {
    it('should record general error', () => {
      // Act
      service.recordError('validation_error', '/api/upload');

      // Assert
      expect(mockCounter.inc).toHaveBeenCalledWith({
        error_type: 'validation_error',
        endpoint: '/api/upload'
      });
    });

    it('should record 4xx error', () => {
      // Act
      service.recordError('not_found', '/api/files/123', 404);

      // Assert
      expect(mockCounter.inc).toHaveBeenCalledWith({
        error_type: 'not_found',
        endpoint: '/api/files/123'
      });
      expect(mockCounter.inc).toHaveBeenCalledWith({
        status_code: '404',
        endpoint: '/api/files/123'
      });
    });

    it('should record 5xx error', () => {
      // Act
      service.recordError('internal_error', '/api/upload', 500);

      // Assert
      expect(mockCounter.inc).toHaveBeenCalledWith({
        error_type: 'internal_error',
        endpoint: '/api/upload'
      });
      expect(mockCounter.inc).toHaveBeenCalledWith({
        status_code: '500',
        endpoint: '/api/upload'
      });
    });

    it('should not record HTTP counter for 2xx status', () => {
      // Arrange
      const incCallCount = mockCounter.inc.mock.calls.length;

      // Act
      service.recordError('some_error', '/api/test', 200);

      // Assert - only one call for error_type
      expect(mockCounter.inc).toHaveBeenCalledTimes(incCallCount + 1);
    });
  });

  describe('updateResourceMetrics', () => {
    it('should update all resource gauges', () => {
      // Act
      service.updateResourceMetrics(50, 100, 85.5);

      // Assert
      expect(mockGauge.set).toHaveBeenCalledWith(50);
      expect(mockGauge.set).toHaveBeenCalledWith(100);
      expect(mockGauge.set).toHaveBeenCalledWith(85.5);
    });

    it('should handle zero values', () => {
      // Act
      service.updateResourceMetrics(0, 0, 0);

      // Assert
      expect(mockGauge.set).toHaveBeenCalledWith(0);
    });

    it('should update cache hit rate percentage', () => {
      // Act
      service.updateResourceMetrics(10, 5, 92.3);

      // Assert
      expect(mockGauge.set).toHaveBeenCalledWith(92.3);
    });
  });

  describe('updateFileStats', () => {
    it('should update file statistics', () => {
      // Act
      service.updateFileStats(10000, 524288000);

      // Assert
      expect(mockGauge.set).toHaveBeenCalledWith(10000);
      expect(mockGauge.set).toHaveBeenCalledWith(524288000);
    });

    it('should handle zero files', () => {
      // Act
      service.updateFileStats(0, 0);

      // Assert
      expect(mockGauge.set).toHaveBeenCalledWith(0);
    });

    it('should handle large file counts', () => {
      // Act
      service.updateFileStats(1000000, 10737418240); // 10GB

      // Assert
      expect(mockGauge.set).toHaveBeenCalledWith(1000000);
      expect(mockGauge.set).toHaveBeenCalledWith(10737418240);
    });
  });

  describe('getMetrics', () => {
    it('should return metrics in Prometheus format', async () => {
      // Act
      const result = await service.getMetrics();

      // Assert
      expect(result).toBe('# Metrics output');
      expect(mockRegistry.metrics).toHaveBeenCalled();
    });

    it('should be async', async () => {
      // Act
      const promise = service.getMetrics();

      // Assert
      expect(promise).toBeInstanceOf(Promise);
      await promise;
    });
  });

  describe('getMetricsJSON', () => {
    it('should return metrics as JSON', async () => {
      // Arrange
      const mockJSON = [
        { name: 'file_uploads_total', type: 'counter', help: 'Total uploads' }
      ];
      mockRegistry.getMetricsAsJSON.mockResolvedValue(mockJSON as any);

      // Act
      const result = await service.getMetricsJSON();

      // Assert
      expect(result).toEqual(mockJSON);
      expect(mockRegistry.getMetricsAsJSON).toHaveBeenCalled();
    });
  });

  describe('reset', () => {
    it('should reset all metrics', () => {
      // Act
      service.reset();

      // Assert
      expect(mockRegistry.resetMetrics).toHaveBeenCalled();
    });
  });

  describe('singleton instance', () => {
    it('should export a singleton instance', () => {
      expect(metricsService).toBeInstanceOf(MetricsService);
    });

    it('should be the same instance across imports', () => {
      const instance1 = metricsService;
      const instance2 = metricsService;
      expect(instance1).toBe(instance2);
    });
  });

  describe('metric properties', () => {
    it('should have all required counter metrics', () => {
      expect(service.uploadCounter).toBeDefined();
      expect(service.downloadCounter).toBeDefined();
      expect(service.processingCounter).toBeDefined();
      expect(service.virusScanCounter).toBeDefined();
      expect(service.infectedFilesCounter).toBeDefined();
      expect(service.storageErrorCounter).toBeDefined();
      expect(service.authAttempts).toBeDefined();
      expect(service.authFailures).toBeDefined();
      expect(service.rateLimitExceeded).toBeDefined();
      expect(service.errorCounter).toBeDefined();
      expect(service.http4xxCounter).toBeDefined();
      expect(service.http5xxCounter).toBeDefined();
      expect(service.filesByType).toBeDefined();
      expect(service.storageQuotaAlert).toBeDefined();
    });

    it('should have all required histogram metrics', () => {
      expect(service.uploadDuration).toBeDefined();
      expect(service.uploadSizeHistogram).toBeDefined();
      expect(service.downloadDuration).toBeDefined();
      expect(service.processingDuration).toBeDefined();
      expect(service.virusScanDuration).toBeDefined();
      expect(service.storageOperationDuration).toBeDefined();
    });

    it('should have all required gauge metrics', () => {
      expect(service.activeConnections).toBeDefined();
      expect(service.queueSize).toBeDefined();
      expect(service.cacheHitRate).toBeDefined();
      expect(service.totalFiles).toBeDefined();
      expect(service.totalFileSize).toBeDefined();
    });
  });
});
