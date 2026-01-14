/**
 * Unit Tests for utils/metrics.ts
 * 
 * Tests Prometheus metrics for monitoring minting operations.
 * Priority: 🟡 Medium (22 tests)
 */

// Mock prom-client before imports
jest.mock('prom-client', () => {
  const mockCounter = {
    inc: jest.fn(),
    labels: jest.fn().mockReturnThis(),
  };
  const mockHistogram = {
    observe: jest.fn(),
    startTimer: jest.fn().mockReturnValue(jest.fn()),
    labels: jest.fn().mockReturnThis(),
  };
  const mockGauge = {
    set: jest.fn(),
    inc: jest.fn(),
    dec: jest.fn(),
    labels: jest.fn().mockReturnThis(),
  };
  const mockRegistry = {
    metrics: jest.fn().mockResolvedValue('# HELP test metrics\n'),
    getMetricsAsJSON: jest.fn().mockResolvedValue([{ name: 'test_metric' }]),
    registerMetric: jest.fn(),
  };

  return {
    Registry: jest.fn().mockImplementation(() => mockRegistry),
    Counter: jest.fn().mockImplementation((config) => ({ ...mockCounter, name: config.name, labelNames: config.labelNames })),
    Histogram: jest.fn().mockImplementation((config) => ({ ...mockHistogram, name: config.name, buckets: config.buckets })),
    Gauge: jest.fn().mockImplementation((config) => ({ ...mockGauge, name: config.name, labelNames: config.labelNames })),
    collectDefaultMetrics: jest.fn(),
  };
});

jest.mock('../../../src/utils/logger', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }
}));

import {
  mintsTotal,
  mintsSuccessTotal,
  mintsFailedTotal,
  mintDuration,
  ipfsUploadDuration,
  solanaTxConfirmationDuration,
  queueDepth,
  walletBalanceSOL,
  activeWorkers,
  databaseConnections,
  errors,
  httpRequestDuration,
  httpRequestsTotal,
  cacheHits,
  cacheMisses,
  systemHealth,
  updateSystemHealth,
  recordMintSuccess,
  recordMintFailure,
  getMetrics,
  getMetricsJSON,
  startTimer,
} from '../../../src/utils/metrics';

// =============================================================================
// Test Suite
// =============================================================================

describe('Metrics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =============================================================================
  // Counter Metrics Tests
  // =============================================================================

  describe('Counter Metrics', () => {
    it('mintsTotal should be Counter type', () => {
      expect(mintsTotal).toBeDefined();
      expect(mintsTotal.name).toBe('mints_total');
    });

    it('mintsTotal should have labels: status, tenant_id', () => {
      expect(mintsTotal.labelNames).toEqual(['status', 'tenant_id']);
    });

    it('mintsSuccessTotal should be Counter type', () => {
      expect(mintsSuccessTotal).toBeDefined();
      expect(mintsSuccessTotal.name).toBe('mints_success_total');
    });

    it('mintsSuccessTotal should have label: tenant_id', () => {
      expect(mintsSuccessTotal.labelNames).toEqual(['tenant_id']);
    });

    it('mintsFailedTotal should be Counter type', () => {
      expect(mintsFailedTotal).toBeDefined();
      expect(mintsFailedTotal.name).toBe('mints_failed_total');
    });

    it('mintsFailedTotal should have labels: reason, tenant_id', () => {
      expect(mintsFailedTotal.labelNames).toEqual(['reason', 'tenant_id']);
    });

    it('errors should be Counter with labels: error_type, service', () => {
      expect(errors).toBeDefined();
      expect(errors.name).toBe('errors_total');
      expect(errors.labelNames).toEqual(['error_type', 'service']);
    });

    it('httpRequestsTotal should be Counter', () => {
      expect(httpRequestsTotal).toBeDefined();
      expect(httpRequestsTotal.name).toBe('http_requests_total');
    });

    it('cacheHits should be Counter', () => {
      expect(cacheHits).toBeDefined();
      expect(cacheHits.name).toBe('cache_hits_total');
    });

    it('cacheMisses should be Counter', () => {
      expect(cacheMisses).toBeDefined();
      expect(cacheMisses.name).toBe('cache_misses_total');
    });
  });

  // =============================================================================
  // Histogram Metrics Tests
  // =============================================================================

  describe('Histogram Metrics', () => {
    it('mintDuration should be Histogram type', () => {
      expect(mintDuration).toBeDefined();
      expect(mintDuration.name).toBe('mint_duration_seconds');
    });

    it('mintDuration should have buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60]', () => {
      expect(mintDuration.buckets).toEqual([0.1, 0.5, 1, 2, 5, 10, 30, 60]);
    });

    it('ipfsUploadDuration should be Histogram', () => {
      expect(ipfsUploadDuration).toBeDefined();
      expect(ipfsUploadDuration.name).toBe('ipfs_upload_duration_seconds');
    });

    it('solanaTxConfirmationDuration should be Histogram', () => {
      expect(solanaTxConfirmationDuration).toBeDefined();
      expect(solanaTxConfirmationDuration.name).toBe('solana_tx_confirmation_duration_seconds');
    });

    it('httpRequestDuration should be Histogram', () => {
      expect(httpRequestDuration).toBeDefined();
      expect(httpRequestDuration.name).toBe('http_request_duration_seconds');
    });
  });

  // =============================================================================
  // Gauge Metrics Tests
  // =============================================================================

  describe('Gauge Metrics', () => {
    it('queueDepth should be Gauge type', () => {
      expect(queueDepth).toBeDefined();
      expect(queueDepth.name).toBe('queue_depth');
    });

    it('walletBalanceSOL should be Gauge type', () => {
      expect(walletBalanceSOL).toBeDefined();
      expect(walletBalanceSOL.name).toBe('wallet_balance_sol');
    });

    it('activeWorkers should be Gauge', () => {
      expect(activeWorkers).toBeDefined();
      expect(activeWorkers.name).toBe('active_workers');
    });

    it('databaseConnections should be Gauge', () => {
      expect(databaseConnections).toBeDefined();
      expect(databaseConnections.name).toBe('database_connections');
    });

    it('systemHealth should be Gauge with component label', () => {
      expect(systemHealth).toBeDefined();
      expect(systemHealth.name).toBe('system_health');
      expect(systemHealth.labelNames).toEqual(['component']);
    });
  });

  // =============================================================================
  // Helper Functions Tests
  // =============================================================================

  describe('Helper Functions', () => {
    it('getMetrics should return Prometheus format string', async () => {
      const metrics = await getMetrics();
      expect(typeof metrics).toBe('string');
    });

    it('getMetricsJSON should return JSON object', async () => {
      const metricsJson = await getMetricsJSON();
      expect(typeof metricsJson).toBe('object');
      expect(Array.isArray(metricsJson)).toBe(true);
    });

    it('updateSystemHealth should set gauge value', () => {
      updateSystemHealth('database', true);
      expect(systemHealth.set).toHaveBeenCalledWith({ component: 'database' }, 1);
      
      updateSystemHealth('redis', false);
      expect(systemHealth.set).toHaveBeenCalledWith({ component: 'redis' }, 0);
    });

    it('recordMintSuccess should increment counter', () => {
      recordMintSuccess('tenant-123');
      expect(mintsSuccessTotal.inc).toHaveBeenCalledWith({ tenant_id: 'tenant-123' });
    });

    it('recordMintFailure should increment counter with reason', () => {
      recordMintFailure('insufficient_balance', 'tenant-123');
      expect(mintsFailedTotal.inc).toHaveBeenCalledWith({
        reason: 'insufficient_balance',
        tenant_id: 'tenant-123'
      });
    });

    it('startTimer should return timer function', () => {
      const timer = startTimer(mintDuration);
      expect(typeof timer).toBe('function');
    });
  });
});
