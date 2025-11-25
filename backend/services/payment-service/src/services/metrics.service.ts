/**
 * Prometheus Metrics Service
 * Collects and exposes metrics for monitoring
 */

import { Registry, Counter, Histogram, Gauge } from 'prom-client';
import { SafeLogger } from '../utils/pci-log-scrubber.util';

const logger = new SafeLogger('MetricsService');

export class MetricsService {
  private register: Registry;

  // Payment metrics
  public paymentTotal!: Counter;
  public paymentAmount!: Histogram;
  public paymentDuration!: Histogram;
  public paymentErrors!: Counter;

  // Fee calculation metrics
  public feeCalculationDuration!: Histogram;
  public feeCalculationTotal!: Counter;
  public feeCalculationErrors!: Counter;

  // Tax calculation metrics
  public taxCalculationDuration!: Histogram;
  public taxCalculationTotal!: Counter;
  public taxCalculationErrors!: Counter;
  public taxJarApiCalls!: Counter;

  // Gas fee estimation metrics
  public gasFeeEstimationDuration!: Histogram;
  public gasFeeEstimationTotal!: Counter;
  public gasFeeEstimationErrors!: Counter;
  public blockchainRpcCalls!: Counter;

  // Cache metrics
  public cacheHits!: Counter;
  public cacheMisses!: Counter;
  public cacheErrors!: Counter;

  // Circuit breaker metrics
  public circuitBreakerState!: Gauge;
  public circuitBreakerTrips!: Counter;

  // Venue metrics
  public venuesByTier!: Gauge;
  public monthlyVolumeByVenue!: Gauge;

  constructor() {
    this.register = new Registry();

    // Initialize all metrics
    this.initPaymentMetrics();
    this.initFeeMetrics();
    this.initTaxMetrics();
    this.initGasFeeMetrics();
    this.initCacheMetrics();
    this.initCircuitBreakerMetrics();
    this.initVenueMetrics();

    logger.info('Metrics service initialized');
  }

  private initPaymentMetrics(): void {
    this.paymentTotal = new Counter({
      name: 'payment_total',
      help: 'Total number of payment transactions',
      labelNames: ['status', 'payment_method'],
      registers: [this.register],
    });

    this.paymentAmount = new Histogram({
      name: 'payment_amount_cents',
      help: 'Payment amounts in cents',
      labelNames: ['payment_method'],
      buckets: [100, 500, 1000, 5000, 10000, 50000, 100000, 500000],
      registers: [this.register],
    });

    this.paymentDuration = new Histogram({
      name: 'payment_duration_seconds',
      help: 'Payment processing duration in seconds',
      labelNames: ['payment_method'],
      buckets: [0.1, 0.5, 1, 2, 5, 10],
      registers: [this.register],
    });

    this.paymentErrors = new Counter({
      name: 'payment_errors_total',
      help: 'Total number of payment errors',
      labelNames: ['error_type', 'payment_method'],
      registers: [this.register],
    });
  }

  private initFeeMetrics(): void {
    this.feeCalculationDuration = new Histogram({
      name: 'fee_calculation_duration_seconds',
      help: 'Fee calculation duration in seconds',
      labelNames: ['venue_tier'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1],
      registers: [this.register],
    });

    this.feeCalculationTotal = new Counter({
      name: 'fee_calculation_total',
      help: 'Total number of fee calculations',
      labelNames: ['venue_tier'],
      registers: [this.register],
    });

    this.feeCalculationErrors = new Counter({
      name: 'fee_calculation_errors_total',
      help: 'Total number of fee calculation errors',
      labelNames: ['error_type'],
      registers: [this.register],
    });
  }

  private initTaxMetrics(): void {
    this.taxCalculationDuration = new Histogram({
      name: 'tax_calculation_duration_seconds',
      help: 'Tax calculation duration in seconds',
      labelNames: ['state', 'source'],
      buckets: [0.1, 0.5, 1, 2, 5],
      registers: [this.register],
    });

    this.taxCalculationTotal = new Counter({
      name: 'tax_calculation_total',
      help: 'Total number of tax calculations',
      labelNames: ['state', 'source'],
      registers: [this.register],
    });

    this.taxCalculationErrors = new Counter({
      name: 'tax_calculation_errors_total',
      help: 'Total number of tax calculation errors',
      labelNames: ['state', 'error_type'],
      registers: [this.register],
    });

    this.taxJarApiCalls = new Counter({
      name: 'taxjar_api_calls_total',
      help: 'Total number of TaxJar API calls',
      labelNames: ['status'],
      registers: [this.register],
    });
  }

  private initGasFeeMetrics(): void {
    this.gasFeeEstimationDuration = new Histogram({
      name: 'gas_fee_estimation_duration_seconds',
      help: 'Gas fee estimation duration in seconds',
      labelNames: ['network'],
      buckets: [0.1, 0.5, 1, 2, 5],
      registers: [this.register],
    });

    this.gasFeeEstimationTotal = new Counter({
      name: 'gas_fee_estimation_total',
      help: 'Total number of gas fee estimations',
      labelNames: ['network'],
      registers: [this.register],
    });

    this.gasFeeEstimationErrors = new Counter({
      name: 'gas_fee_estimation_errors_total',
      help: 'Total number of gas fee estimation errors',
      labelNames: ['network', 'error_type'],
      registers: [this.register],
    });

    this.blockchainRpcCalls = new Counter({
      name: 'blockchain_rpc_calls_total',
      help: 'Total number of blockchain RPC calls',
      labelNames: ['network', 'method', 'status'],
      registers: [this.register],
    });
  }

  private initCacheMetrics(): void {
    this.cacheHits = new Counter({
      name: 'cache_hits_total',
      help: 'Total number of cache hits',
      labelNames: ['cache_key_prefix'],
      registers: [this.register],
    });

    this.cacheMisses = new Counter({
      name: 'cache_misses_total',
      help: 'Total number of cache misses',
      labelNames: ['cache_key_prefix'],
      registers: [this.register],
    });

    this.cacheErrors = new Counter({
      name: 'cache_errors_total',
      help: 'Total number of cache errors',
      labelNames: ['operation', 'error_type'],
      registers: [this.register],
    });
  }

  private initCircuitBreakerMetrics(): void {
    this.circuitBreakerState = new Gauge({
      name: 'circuit_breaker_state',
      help: 'Circuit breaker state (0=closed, 1=open, 2=half-open)',
      labelNames: ['breaker_name'],
      registers: [this.register],
    });

    this.circuitBreakerTrips = new Counter({
      name: 'circuit_breaker_trips_total',
      help: 'Total number of circuit breaker trips',
      labelNames: ['breaker_name'],
      registers: [this.register],
    });
  }

  private initVenueMetrics(): void {
    this.venuesByTier = new Gauge({
      name: 'venues_by_tier',
      help: 'Number of venues by tier',
      labelNames: ['tier'],
      registers: [this.register],
    });

    this.monthlyVolumeByVenue = new Gauge({
      name: 'monthly_volume_by_venue_cents',
      help: 'Monthly transaction volume by venue in cents',
      labelNames: ['venue_id', 'tier'],
      registers: [this.register],
    });
  }

  /**
   * Get metrics in Prometheus format
   */
  async getMetrics(): Promise<string> {
    return this.register.metrics();
  }

  /**
   * Get metrics as JSON
   */
  async getMetricsJSON(): Promise<any> {
    return this.register.getMetricsAsJSON();
  }

  /**
   * Reset all metrics (useful for testing)
   */
  resetMetrics(): void {
    this.register.resetMetrics();
    logger.info('All metrics reset');
  }

  /**
   * Record payment transaction
   */
  recordPayment(
    status: 'success' | 'failed',
    amountCents: number,
    durationSeconds: number,
    paymentMethod: string
  ): void {
    this.paymentTotal.inc({ status, payment_method: paymentMethod });
    this.paymentAmount.observe({ payment_method: paymentMethod }, amountCents);
    this.paymentDuration.observe({ payment_method: paymentMethod }, durationSeconds);
  }

  /**
   * Record payment error
   */
  recordPaymentError(errorType: string, paymentMethod: string): void {
    this.paymentErrors.inc({ error_type: errorType, payment_method: paymentMethod });
  }

  /**
   * Record fee calculation
   */
  recordFeeCalculation(
    venueTier: string,
    durationSeconds: number,
    success: boolean = true
  ): void {
    this.feeCalculationTotal.inc({ venue_tier: venueTier });
    this.feeCalculationDuration.observe({ venue_tier: venueTier }, durationSeconds);

    if (!success) {
      this.feeCalculationErrors.inc({ error_type: 'calculation_failed' });
    }
  }

  /**
   * Record tax calculation
   */
  recordTaxCalculation(
    state: string,
    source: 'taxjar' | 'fallback',
    durationSeconds: number,
    success: boolean = true
  ): void {
    this.taxCalculationTotal.inc({ state, source });
    this.taxCalculationDuration.observe({ state, source }, durationSeconds);

    if (source === 'taxjar') {
      this.taxJarApiCalls.inc({ status: success ? 'success' : 'failed' });
    }

    if (!success) {
      this.taxCalculationErrors.inc({ state, error_type: 'calculation_failed' });
    }
  }

  /**
   * Record gas fee estimation
   */
  recordGasFeeEstimation(
    network: string,
    durationSeconds: number,
    success: boolean = true
  ): void {
    this.gasFeeEstimationTotal.inc({ network });
    this.gasFeeEstimationDuration.observe({ network }, durationSeconds);

    if (!success) {
      this.gasFeeEstimationErrors.inc({ network, error_type: 'estimation_failed' });
    }
  }

  /**
   * Record blockchain RPC call
   */
  recordBlockchainRpcCall(
    network: string,
    method: string,
    status: 'success' | 'failed'
  ): void {
    this.blockchainRpcCalls.inc({ network, method, status });
  }

  /**
   * Record cache operation
   */
  recordCacheOperation(
    operation: 'hit' | 'miss' | 'error',
    keyPrefix: string
  ): void {
    if (operation === 'hit') {
      this.cacheHits.inc({ cache_key_prefix: keyPrefix });
    } else if (operation === 'miss') {
      this.cacheMisses.inc({ cache_key_prefix: keyPrefix });
    } else {
      this.cacheErrors.inc({ operation: 'get', error_type: 'redis_error' });
    }
  }

  /**
   * Update circuit breaker state
   */
  updateCircuitBreakerState(
    breakerName: string,
    state: 'closed' | 'open' | 'half-open'
  ): void {
    const stateValue = state === 'closed' ? 0 : state === 'open' ? 1 : 2;
    this.circuitBreakerState.set({ breaker_name: breakerName }, stateValue);

    if (state === 'open') {
      this.circuitBreakerTrips.inc({ breaker_name: breakerName });
    }
  }

  /**
   * Update venue metrics
   */
  updateVenueMetrics(venueId: string, tier: string, monthlyVolumeCents: number): void {
    this.monthlyVolumeByVenue.set({ venue_id: venueId, tier }, monthlyVolumeCents);
  }

  /**
   * Update venue tier counts
   */
  updateVenueTierCounts(counts: Record<string, number>): void {
    Object.entries(counts).forEach(([tier, count]) => {
      this.venuesByTier.set({ tier }, count);
    });
  }
}

// Export singleton instance
export const metricsService = new MetricsService();
