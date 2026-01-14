import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';
import { logger } from '../utils/logger';

/**
 * Metrics Service for Prometheus integration
 * Tracks operational metrics for file service
 */
export class MetricsService {
  private registry: Registry;
  
  // Upload metrics
  public uploadCounter!: Counter;
  public uploadDuration!: Histogram;
  public uploadSizeHistogram!: Histogram;
  
  // Download metrics
  public downloadCounter!: Counter;
  public downloadDuration!: Histogram;
  
  // Processing metrics
  public processingDuration!: Histogram;
  public processingCounter!: Counter;
  
  // Virus scan metrics
  public virusScanCounter!: Counter;
  public virusScanDuration!: Histogram;
  public infectedFilesCounter!: Counter;
  
  // Storage metrics
  public storageOperationDuration!: Histogram;
  public storageErrorCounter!: Counter;
  
  // Authentication metrics
  public authAttempts!: Counter;
  public authFailures!: Counter;
  
  // Rate limit metrics
  public rateLimitExceeded!: Counter;
  
  // Error metrics
  public errorCounter!: Counter;
  public http4xxCounter!: Counter;
  public http5xxCounter!: Counter;
  
  // Resource metrics
  public activeConnections!: Gauge;
  public queueSize!: Gauge;
  public cacheHitRate!: Gauge;
  
  // File metrics
  public totalFiles!: Gauge;
  public totalFileSize!: Gauge;
  public filesByType!: Counter;
  
  // Storage quota metrics
  public storageQuotaAlert!: Counter;

  constructor() {
    // Create a new registry
    this.registry = new Registry();
    
    // Set default labels
    this.registry.setDefaultLabels({
      service: 'file-service',
      environment: process.env.NODE_ENV || 'development'
    });
    
    // Initialize all metrics
    this.initializeMetrics();
    
    // Collect default Node.js metrics
    collectDefaultMetrics({ 
      register: this.registry,
      prefix: 'file_service_'
    });
    
    logger.info('Metrics service initialized');
  }

  /**
   * Initialize all custom metrics
   */
  private initializeMetrics() {
    // Upload metrics
    this.uploadCounter = new Counter({
      name: 'file_uploads_total',
      help: 'Total number of file uploads',
      labelNames: ['status', 'file_type', 'user_type'],
      registers: [this.registry]
    });

    this.uploadDuration = new Histogram({
      name: 'file_upload_duration_seconds',
      help: 'File upload duration in seconds',
      labelNames: ['file_type'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
      registers: [this.registry]
    });

    this.uploadSizeHistogram = new Histogram({
      name: 'file_upload_size_bytes',
      help: 'File upload size distribution',
      labelNames: ['file_type'],
      buckets: [1024, 10240, 102400, 1048576, 10485760, 104857600], // 1KB to 100MB
      registers: [this.registry]
    });

    // Download metrics
    this.downloadCounter = new Counter({
      name: 'file_downloads_total',
      help: 'Total number of file downloads',
      labelNames: ['status', 'file_type'],
      registers: [this.registry]
    });

    this.downloadDuration = new Histogram({
      name: 'file_download_duration_seconds',
      help: 'File download duration in seconds',
      labelNames: ['file_type'],
      buckets: [0.1, 0.5, 1, 2, 5, 10],
      registers: [this.registry]
    });

    // Processing metrics
    this.processingCounter = new Counter({
      name: 'file_processing_total',
      help: 'Total number of file processing operations',
      labelNames: ['operation', 'status'],
      registers: [this.registry]
    });

    this.processingDuration = new Histogram({
      name: 'file_processing_duration_seconds',
      help: 'File processing duration in seconds',
      labelNames: ['operation'],
      buckets: [0.5, 1, 2, 5, 10, 30, 60],
      registers: [this.registry]
    });

    // Virus scan metrics
    this.virusScanCounter = new Counter({
      name: 'virus_scans_total',
      help: 'Total number of virus scans',
      labelNames: ['result'], // clean, infected, failed
      registers: [this.registry]
    });

    this.virusScanDuration = new Histogram({
      name: 'virus_scan_duration_seconds',
      help: 'Virus scan duration in seconds',
      buckets: [0.5, 1, 2, 5, 10, 30],
      registers: [this.registry]
    });

    this.infectedFilesCounter = new Counter({
      name: 'infected_files_total',
      help: 'Total number of infected files detected',
      labelNames: ['virus_name'],
      registers: [this.registry]
    });

    // Storage metrics
    this.storageOperationDuration = new Histogram({
      name: 'storage_operation_duration_seconds',
      help: 'Storage operation duration in seconds',
      labelNames: ['operation', 'provider'], // upload, download, delete | s3, local
      buckets: [0.1, 0.5, 1, 2, 5, 10],
      registers: [this.registry]
    });

    this.storageErrorCounter = new Counter({
      name: 'storage_errors_total',
      help: 'Total number of storage errors',
      labelNames: ['operation', 'provider', 'error_type'],
      registers: [this.registry]
    });

    // Authentication metrics
    this.authAttempts = new Counter({
      name: 'auth_attempts_total',
      help: 'Total authentication attempts',
      labelNames: ['status'], // success, failure
      registers: [this.registry]
    });

    this.authFailures = new Counter({
      name: 'auth_failures_total',
      help: 'Total authentication failures',
      labelNames: ['reason'], // invalid_token, expired_token, missing_token
      registers: [this.registry]
    });

    // Rate limit metrics
    this.rateLimitExceeded = new Counter({
      name: 'rate_limit_exceeded_total',
      help: 'Total rate limit exceeded events',
      labelNames: ['endpoint', 'user_type'],
      registers: [this.registry]
    });

    // Error metrics
    this.errorCounter = new Counter({
      name: 'errors_total',
      help: 'Total number of errors',
      labelNames: ['error_type', 'endpoint'],
      registers: [this.registry]
    });

    this.http4xxCounter = new Counter({
      name: 'http_4xx_errors_total',
      help: 'Total HTTP 4xx errors',
      labelNames: ['status_code', 'endpoint'],
      registers: [this.registry]
    });

    this.http5xxCounter = new Counter({
      name: 'http_5xx_errors_total',
      help: 'Total HTTP 5xx errors',
      labelNames: ['status_code', 'endpoint'],
      registers: [this.registry]
    });

    // Resource metrics
    this.activeConnections = new Gauge({
      name: 'active_connections',
      help: 'Number of active connections',
      registers: [this.registry]
    });

    this.queueSize = new Gauge({
      name: 'processing_queue_size',
      help: 'Number of items in processing queue',
      registers: [this.registry]
    });

    this.cacheHitRate = new Gauge({
      name: 'cache_hit_rate',
      help: 'Cache hit rate percentage',
      registers: [this.registry]
    });

    // File metrics
    this.totalFiles = new Gauge({
      name: 'total_files',
      help: 'Total number of files stored',
      registers: [this.registry]
    });

    this.totalFileSize = new Gauge({
      name: 'total_file_size_bytes',
      help: 'Total size of all files in bytes',
      registers: [this.registry]
    });

    this.filesByType = new Counter({
      name: 'files_by_type_total',
      help: 'Total files by content type',
      labelNames: ['content_type'],
      registers: [this.registry]
    });

    // Storage quota metrics
    this.storageQuotaAlert = new Counter({
      name: 'storage_quota_alerts_total',
      help: 'Total storage quota alerts',
      labelNames: ['type'], // warning, critical, exceeded
      registers: [this.registry]
    });
  }

  /**
   * Record file upload
   */
  recordUpload(status: string, fileType: string, userType: string, duration: number, size: number) {
    this.uploadCounter.inc({ status, file_type: fileType, user_type: userType });
    this.uploadDuration.observe({ file_type: fileType }, duration);
    this.uploadSizeHistogram.observe({ file_type: fileType }, size);
    this.filesByType.inc({ content_type: fileType });
  }

  /**
   * Record file download
   */
  recordDownload(status: string, fileType: string, duration: number) {
    this.downloadCounter.inc({ status, file_type: fileType });
    this.downloadDuration.observe({ file_type: fileType }, duration);
  }

  /**
   * Record file processing
   */
  recordProcessing(operation: string, status: string, duration: number) {
    this.processingCounter.inc({ operation, status });
    this.processingDuration.observe({ operation }, duration);
  }

  /**
   * Record virus scan
   */
  recordVirusScan(result: 'clean' | 'infected' | 'failed', duration: number, virusName?: string) {
    this.virusScanCounter.inc({ result });
    this.virusScanDuration.observe(duration);
    
    if (result === 'infected' && virusName) {
      this.infectedFilesCounter.inc({ virus_name: virusName });
    }
  }

  /**
   * Record storage operation
   */
  recordStorageOperation(operation: string, provider: string, duration: number) {
    this.storageOperationDuration.observe({ operation, provider }, duration);
  }

  /**
   * Record storage error
   */
  recordStorageError(operation: string, provider: string, errorType: string) {
    this.storageErrorCounter.inc({ operation, provider, error_type: errorType });
  }

  /**
   * Record authentication attempt
   */
  recordAuthAttempt(success: boolean, reason?: string) {
    this.authAttempts.inc({ status: success ? 'success' : 'failure' });
    
    if (!success && reason) {
      this.authFailures.inc({ reason });
    }
  }

  /**
   * Record rate limit exceeded
   */
  recordRateLimitExceeded(endpoint: string, userType: string) {
    this.rateLimitExceeded.inc({ endpoint, user_type: userType });
  }

  /**
   * Record error
   */
  recordError(errorType: string, endpoint: string, statusCode?: number) {
    this.errorCounter.inc({ error_type: errorType, endpoint });
    
    if (statusCode) {
      if (statusCode >= 400 && statusCode < 500) {
        this.http4xxCounter.inc({ status_code: statusCode.toString(), endpoint });
      } else if (statusCode >= 500) {
        this.http5xxCounter.inc({ status_code: statusCode.toString(), endpoint });
      }
    }
  }

  /**
   * Update resource gauges
   */
  updateResourceMetrics(activeConnections: number, queueSize: number, cacheHitRate: number) {
    this.activeConnections.set(activeConnections);
    this.queueSize.set(queueSize);
    this.cacheHitRate.set(cacheHitRate);
  }

  /**
   * Update file statistics
   */
  updateFileStats(totalFiles: number, totalSize: number) {
    this.totalFiles.set(totalFiles);
    this.totalFileSize.set(totalSize);
  }

  /**
   * Get metrics in Prometheus format
   */
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  /**
   * Get metrics as JSON
   */
  async getMetricsJSON() {
    const metrics = await this.registry.getMetricsAsJSON();
    return metrics;
  }

  /**
   * Reset all metrics (useful for testing)
   */
  reset() {
    this.registry.resetMetrics();
  }
}

// Export singleton instance
export const metricsService = new MetricsService();
