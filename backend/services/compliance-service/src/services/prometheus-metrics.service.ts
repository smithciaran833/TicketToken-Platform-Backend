import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';
import { logger } from '../utils/logger';

/**
 * PROMETHEUS METRICS SERVICE
 * 
 * Exposes custom business metrics for monitoring
 * Phase 5: Production Infrastructure
 */

export class PrometheusMetricsService {
  public registry: Registry;

  // HTTP metrics
  public httpRequestDuration: Histogram;
  public httpRequestTotal: Counter;
  public httpRequestErrors: Counter;

  // Business metrics - Venue Verification
  public verificationStarted: Counter;
  public verificationCompleted: Counter;
  public verificationFailed: Counter;
  public verificationDuration: Histogram;

  // Business metrics - Tax Reporting
  public taxCalculations: Counter;
  public form1099Generated: Counter;
  public taxReportErrors: Counter;

  // Business metrics - OFAC Screening
  public ofacChecks: Counter;
  public ofacMatches: Counter;
  public ofacCheckDuration: Histogram;
  public ofacCacheHits: Counter;
  public ofacCacheMisses: Counter;

  // Business metrics - Risk Assessment
  public riskScoresCalculated: Counter;
  public highRiskVenues: Gauge;
  public flaggedVenues: Gauge;

  // Business metrics - Document Management
  public documentsUploaded: Counter;
  public documentsDownloaded: Counter;
  public documentUploadSize: Histogram;

  // Business metrics - GDPR
  public gdprDeletionRequests: Counter;
  public gdprExportRequests: Counter;

  // Database metrics
  public dbQueryDuration: Histogram;
  public dbConnectionPoolSize: Gauge;
  public dbActiveConnections: Gauge;

  // Cache metrics
  public cacheHits: Counter;
  public cacheMisses: Counter;
  public cacheSize: Gauge;

  constructor() {
    this.registry = new Registry();

    // Collect default Node.js metrics
    collectDefaultMetrics({ register: this.registry });

    // HTTP Metrics
    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10],
      registers: [this.registry],
    });

    this.httpRequestTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });

    this.httpRequestErrors = new Counter({
      name: 'http_request_errors_total',
      help: 'Total number of HTTP request errors',
      labelNames: ['method', 'route', 'error_type'],
      registers: [this.registry],
    });

    // Venue Verification Metrics
    this.verificationStarted = new Counter({
      name: 'verifications_started_total',
      help: 'Total number of venue verifications started',
      labelNames: ['venue_id'],
      registers: [this.registry],
    });

    this.verificationCompleted = new Counter({
      name: 'verifications_completed_total',
      help: 'Total number of venue verifications completed',
      labelNames: ['venue_id', 'status'],
      registers: [this.registry],
    });

    this.verificationFailed = new Counter({
      name: 'verifications_failed_total',
      help: 'Total number of venue verifications failed',
      labelNames: ['venue_id', 'reason'],
      registers: [this.registry],
    });

    this.verificationDuration = new Histogram({
      name: 'verification_duration_seconds',
      help: 'Duration of venue verification process',
      labelNames: ['venue_id'],
      buckets: [1, 5, 10, 30, 60, 300, 600],
      registers: [this.registry],
    });

    // Tax Reporting Metrics
    this.taxCalculations = new Counter({
      name: 'tax_calculations_total',
      help: 'Total number of tax calculations performed',
      labelNames: ['venue_id'],
      registers: [this.registry],
    });

    this.form1099Generated = new Counter({
      name: 'form_1099_generated_total',
      help: 'Total number of 1099 forms generated',
      labelNames: ['year', 'venue_id'],
      registers: [this.registry],
    });

    this.taxReportErrors = new Counter({
      name: 'tax_report_errors_total',
      help: 'Total number of tax reporting errors',
      labelNames: ['error_type'],
      registers: [this.registry],
    });

    // OFAC Screening Metrics
    this.ofacChecks = new Counter({
      name: 'ofac_checks_total',
      help: 'Total number of OFAC checks performed',
      labelNames: ['result'],
      registers: [this.registry],
    });

    this.ofacMatches = new Counter({
      name: 'ofac_matches_total',
      help: 'Total number of OFAC matches found',
      labelNames: ['confidence_level'],
      registers: [this.registry],
    });

    this.ofacCheckDuration = new Histogram({
      name: 'ofac_check_duration_seconds',
      help: 'Duration of OFAC checks',
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
      registers: [this.registry],
    });

    this.ofacCacheHits = new Counter({
      name: 'ofac_cache_hits_total',
      help: 'Total number of OFAC cache hits',
      registers: [this.registry],
    });

    this.ofacCacheMisses = new Counter({
      name: 'ofac_cache_misses_total',
      help: 'Total number of OFAC cache misses',
      registers: [this.registry],
    });

    // Risk Assessment Metrics
    this.riskScoresCalculated = new Counter({
      name: 'risk_scores_calculated_total',
      help: 'Total number of risk scores calculated',
      labelNames: ['venue_id', 'risk_level'],
      registers: [this.registry],
    });

    this.highRiskVenues = new Gauge({
      name: 'high_risk_venues_count',
      help: 'Current number of high-risk venues',
      registers: [this.registry],
    });

    this.flaggedVenues = new Gauge({
      name: 'flagged_venues_count',
      help: 'Current number of flagged venues',
      registers: [this.registry],
    });

    // Document Management Metrics
    this.documentsUploaded = new Counter({
      name: 'documents_uploaded_total',
      help: 'Total number of documents uploaded',
      labelNames: ['document_type', 'venue_id'],
      registers: [this.registry],
    });

    this.documentsDownloaded = new Counter({
      name: 'documents_downloaded_total',
      help: 'Total number of documents downloaded',
      labelNames: ['document_type'],
      registers: [this.registry],
    });

    this.documentUploadSize = new Histogram({
      name: 'document_upload_size_bytes',
      help: 'Size of uploaded documents in bytes',
      buckets: [1024, 10240, 102400, 1048576, 10485760],
      registers: [this.registry],
    });

    // GDPR Metrics
    this.gdprDeletionRequests = new Counter({
      name: 'gdpr_deletion_requests_total',
      help: 'Total number of GDPR deletion requests',
      labelNames: ['status'],
      registers: [this.registry],
    });

    this.gdprExportRequests = new Counter({
      name: 'gdpr_export_requests_total',
      help: 'Total number of GDPR export requests',
      labelNames: ['format'],
      registers: [this.registry],
    });

    // Database Metrics
    this.dbQueryDuration = new Histogram({
      name: 'db_query_duration_seconds',
      help: 'Duration of database queries',
      labelNames: ['query_type', 'table'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
      registers: [this.registry],
    });

    this.dbConnectionPoolSize = new Gauge({
      name: 'db_connection_pool_size',
      help: 'Size of database connection pool',
      registers: [this.registry],
    });

    this.dbActiveConnections = new Gauge({
      name: 'db_active_connections',
      help: 'Number of active database connections',
      registers: [this.registry],
    });

    // Cache Metrics
    this.cacheHits = new Counter({
      name: 'cache_hits_total',
      help: 'Total number of cache hits',
      labelNames: ['cache_type'],
      registers: [this.registry],
    });

    this.cacheMisses = new Counter({
      name: 'cache_misses_total',
      help: 'Total number of cache misses',
      labelNames: ['cache_type'],
      registers: [this.registry],
    });

    this.cacheSize = new Gauge({
      name: 'cache_size_bytes',
      help: 'Current size of cache in bytes',
      labelNames: ['cache_type'],
      registers: [this.registry],
    });

    logger.info('Prometheus metrics service initialized');
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
  async getMetricsJSON(): Promise<any[]> {
    return this.registry.getMetricsAsJSON();
  }

  /**
   * Reset all metrics (useful for testing)
   */
  resetMetrics(): void {
    this.registry.resetMetrics();
    logger.info('All metrics reset');
  }

  /**
   * Record HTTP request
   */
  recordHttpRequest(method: string, route: string, statusCode: number, duration: number): void {
    this.httpRequestDuration.labels(method, route, statusCode.toString()).observe(duration);
    this.httpRequestTotal.labels(method, route, statusCode.toString()).inc();
    
    if (statusCode >= 400) {
      this.httpRequestErrors.labels(method, route, this.getErrorType(statusCode)).inc();
    }
  }

  /**
   * Record database query
   */
  recordDbQuery(queryType: string, table: string, duration: number): void {
    this.dbQueryDuration.labels(queryType, table).observe(duration);
  }

  /**
   * Update database connection metrics
   */
  updateDbMetrics(poolSize: number, activeConnections: number): void {
    this.dbConnectionPoolSize.set(poolSize);
    this.dbActiveConnections.set(activeConnections);
  }

  /**
   * Record cache operation
   */
  recordCacheOperation(cacheType: string, hit: boolean, size?: number): void {
    if (hit) {
      this.cacheHits.labels(cacheType).inc();
    } else {
      this.cacheMisses.labels(cacheType).inc();
    }
    
    if (size !== undefined) {
      this.cacheSize.labels(cacheType).set(size);
    }
  }

  /**
   * Get error type from status code
   */
  private getErrorType(statusCode: number): string {
    if (statusCode >= 400 && statusCode < 500) {
      return 'client_error';
    } else if (statusCode >= 500) {
      return 'server_error';
    }
    return 'unknown';
  }
}

export const prometheusMetrics = new PrometheusMetricsService();
