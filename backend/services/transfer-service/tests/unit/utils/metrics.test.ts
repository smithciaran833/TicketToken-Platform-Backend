/**
 * Unit Tests for Metrics Utility
 *
 * Tests Prometheus metrics collection and recording
 */

import { register } from 'prom-client';

describe('Metrics - Prometheus Integration', () => {
  let metrics: any;

  beforeEach(() => {
    register.clear();
    jest.resetModules();
    
    metrics = require('../../../src/utils/metrics');
  });

  afterEach(() => {
    register.clear();
  });

  describe('Metric Initialization', () => {
    it('should export a registry', () => {
      expect(metrics.register).toBeDefined();
      expect(metrics.register.constructor.name).toBe('Registry');
    });

    it('should include default metrics', async () => {
      const output = await metrics.register.metrics();
      
      expect(output).toContain('process_cpu');
      expect(output).toContain('nodejs_');
    });

    it('should export getMetrics function', () => {
      expect(typeof metrics.getMetrics).toBe('function');
    });

    it('should export getContentType function', () => {
      expect(typeof metrics.getContentType).toBe('function');
    });
  });

  describe('HTTP Metrics', () => {
    it('should record HTTP request duration', async () => {
      metrics.recordHttpRequest('GET', '/api/transfers', 200, 0.150, 'tenant-123');

      const output = await metrics.register.metrics();
      
      expect(output).toContain('transfer_service_http_request_duration_seconds');
      expect(output).toContain('method="GET"');
      expect(output).toContain('route="/api/transfers"');
      expect(output).toContain('status_code="200"');
      expect(output).toContain('tenant_id="tenant-123"');
    });

    it('should increment HTTP request counter', async () => {
      metrics.recordHttpRequest('POST', '/api/transfers', 201, 0.250, 'tenant-456');
      metrics.recordHttpRequest('POST', '/api/transfers', 201, 0.300, 'tenant-456');

      const output = await metrics.register.metrics();
      
      expect(output).toContain('transfer_service_http_requests_total');
      expect(output).toContain('method="POST"');
    });

    it('should handle missing tenantId', async () => {
      metrics.recordHttpRequest('GET', '/health', 200, 0.010);

      const output = await metrics.register.metrics();
      
      expect(output).toContain('tenant_id="unknown"');
    });

    it('should track different status codes separately', async () => {
      metrics.recordHttpRequest('GET', '/api/transfers', 200, 0.1, 'tenant-1');
      metrics.recordHttpRequest('GET', '/api/transfers', 404, 0.05, 'tenant-1');
      metrics.recordHttpRequest('GET', '/api/transfers', 500, 0.2, 'tenant-1');

      const output = await metrics.register.metrics();
      
      expect(output).toContain('status_code="200"');
      expect(output).toContain('status_code="404"');
      expect(output).toContain('status_code="500"');
    });
  });

  describe('Transfer Event Recording', () => {
    it('should record transfer initiated event', async () => {
      metrics.recordTransferEvent('initiated', 'ticket', 'tenant-123');

      const output = await metrics.register.metrics();
      
      expect(output).toContain('transfer_service_transfers_initiated_total');
      expect(output).toContain('type="ticket"');
      expect(output).toContain('tenant_id="tenant-123"');
    });

    it('should record transfer accepted event', async () => {
      metrics.recordTransferEvent('accepted', 'ticket', 'tenant-456');

      const output = await metrics.register.metrics();
      
      expect(output).toContain('transfer_service_transfers_accepted_total');
    });

    it('should record transfer rejected event with reason', async () => {
      metrics.recordTransferEvent('rejected', 'ticket', 'tenant-789', { reason: 'invalid_code' });

      const output = await metrics.register.metrics();
      
      expect(output).toContain('transfer_service_transfers_rejected_total');
      expect(output).toContain('reason="invalid_code"');
    });

    it('should record transfer cancelled event with reason', async () => {
      metrics.recordTransferEvent('cancelled', 'ticket', 'tenant-123', { reason: 'user_request' });

      const output = await metrics.register.metrics();
      
      expect(output).toContain('transfer_service_transfers_cancelled_total');
      expect(output).toContain('reason="user_request"');
    });

    it('should record transfer completed event', async () => {
      metrics.recordTransferEvent('completed', 'ticket', 'tenant-456');

      const output = await metrics.register.metrics();
      
      expect(output).toContain('transfer_service_transfers_completed_total');
    });

    it('should record transfer failed event with error code', async () => {
      metrics.recordTransferEvent('failed', 'ticket', 'tenant-789', { error_code: 'BLOCKCHAIN_ERROR' });

      const output = await metrics.register.metrics();
      
      expect(output).toContain('transfer_service_transfers_failed_total');
      expect(output).toContain('error_code="BLOCKCHAIN_ERROR"');
    });

    it('should record transfer expired event', async () => {
      metrics.recordTransferEvent('expired', 'ticket', 'tenant-123');

      const output = await metrics.register.metrics();
      
      expect(output).toContain('transfer_service_transfers_expired_total');
    });

    it('should default to unknown reason/error_code when not provided', async () => {
      metrics.recordTransferEvent('rejected', 'ticket', 'tenant-123');
      metrics.recordTransferEvent('failed', 'ticket', 'tenant-123');

      const output = await metrics.register.metrics();
      
      expect(output).toContain('reason="unknown"');
      expect(output).toContain('error_code="unknown"');
    });
  });

  describe('Blockchain Operation Recording', () => {
    it('should record successful blockchain operation', async () => {
      metrics.recordBlockchainOp('success', 'https://api.mainnet-beta.solana.com', 5.5);

      const output = await metrics.register.metrics();
      
      expect(output).toContain('transfer_service_blockchain_transfers_total');
      expect(output).toContain('status="success"');
      expect(output).toContain('endpoint="https://api.mainnet-beta.solana.com"');
      expect(output).toContain('transfer_service_blockchain_transfer_duration_seconds');
    });

    it('should record failed blockchain operation', async () => {
      metrics.recordBlockchainOp('failure', 'https://api.devnet.solana.com', 10.2);

      const output = await metrics.register.metrics();
      
      expect(output).toContain('status="failure"');
      expect(output).toContain('endpoint="https://api.devnet.solana.com"');
    });

    it('should track duration in histogram', async () => {
      metrics.recordBlockchainOp('success', 'rpc-endpoint', 2.5);
      metrics.recordBlockchainOp('success', 'rpc-endpoint', 7.8);
      metrics.recordBlockchainOp('success', 'rpc-endpoint', 15.3);

      const output = await metrics.register.metrics();
      
      // Check that the count shows 3 (with labels)
      expect(output).toMatch(/blockchain_transfer_duration_seconds_count\{[^}]*\}\s+3/);
    });
  });

  describe('RPC Request Recording', () => {
    it('should record successful RPC request', async () => {
      metrics.recordRpcRequest('sendTransaction', 'https://api.mainnet.com', 'success', 0.5);

      const output = await metrics.register.metrics();
      
      expect(output).toContain('transfer_service_rpc_requests_total');
      expect(output).toContain('method="sendTransaction"');
      expect(output).toContain('status="success"');
      expect(output).toContain('transfer_service_rpc_request_duration_seconds');
    });

    it('should record failed RPC request', async () => {
      metrics.recordRpcRequest('getBalance', 'https://api.devnet.com', 'failure', 2.0);

      const output = await metrics.register.metrics();
      
      expect(output).toContain('method="getBalance"');
      expect(output).toContain('status="failure"');
    });

    it('should track different RPC methods separately', async () => {
      metrics.recordRpcRequest('sendTransaction', 'endpoint1', 'success', 0.1);
      metrics.recordRpcRequest('getTransaction', 'endpoint1', 'success', 0.2);
      metrics.recordRpcRequest('getBalance', 'endpoint1', 'success', 0.3);

      const output = await metrics.register.metrics();
      
      expect(output).toContain('method="sendTransaction"');
      expect(output).toContain('method="getTransaction"');
      expect(output).toContain('method="getBalance"');
    });
  });

  describe('Circuit Breaker Metrics', () => {
    it('should update circuit breaker state to closed', async () => {
      metrics.updateCircuitBreakerState('solana-rpc', 'closed');

      const output = await metrics.register.metrics();
      
      expect(output).toContain('transfer_service_circuit_breaker_state');
      expect(output).toContain('name="solana-rpc"');
      expect(output).toMatch(/circuit_breaker_state\{name="solana-rpc"\}\s+0/);
    });

    it('should update circuit breaker state to half_open', async () => {
      metrics.updateCircuitBreakerState('database', 'half_open');

      const output = await metrics.register.metrics();
      
      expect(output).toContain('name="database"');
      expect(output).toMatch(/circuit_breaker_state\{name="database"\}\s+1/);
    });

    it('should update circuit breaker state to open and increment trips', async () => {
      metrics.updateCircuitBreakerState('external-api', 'open');

      const output = await metrics.register.metrics();
      
      expect(output).toContain('name="external-api"');
      expect(output).toMatch(/circuit_breaker_state\{name="external-api"\}\s+2/);
      expect(output).toContain('transfer_service_circuit_breaker_trips_total');
    });

    it('should not increment trips for non-open states', async () => {
      const beforeOutput = await metrics.register.metrics();
      const beforeMatch = beforeOutput.match(/circuit_breaker_trips_total[^\n]*\s+(\d+)/);
      const beforeCount = beforeMatch ? parseInt(beforeMatch[1]) : 0;

      metrics.updateCircuitBreakerState('test-cb', 'closed');
      metrics.updateCircuitBreakerState('test-cb', 'half_open');

      const afterOutput = await metrics.register.metrics();
      const afterMatch = afterOutput.match(/circuit_breaker_trips_total[^\n]*\s+(\d+)/);
      const afterCount = afterMatch ? parseInt(afterMatch[1]) : 0;

      expect(afterCount).toBe(beforeCount);
    });
  });

  describe('Cache Operation Recording', () => {
    it('should record cache hit', async () => {
      metrics.recordCacheOp('get', true);

      const output = await metrics.register.metrics();
      
      expect(output).toContain('transfer_service_cache_operations_total');
      expect(output).toContain('operation="get"');
      expect(output).toContain('status="hit"');
    });

    it('should record cache miss', async () => {
      metrics.recordCacheOp('get', false);

      const output = await metrics.register.metrics();
      
      expect(output).toContain('operation="get"');
      expect(output).toContain('status="miss"');
    });

    it('should record cache set operation', async () => {
      metrics.recordCacheOp('set', true);

      const output = await metrics.register.metrics();
      
      expect(output).toContain('operation="set"');
      expect(output).toContain('status="success"');
    });

    it('should record cache delete operation', async () => {
      metrics.recordCacheOp('delete', true);

      const output = await metrics.register.metrics();
      
      expect(output).toContain('operation="delete"');
      expect(output).toContain('status="success"');
    });
  });

  describe('Metrics Endpoint Functions', () => {
    it('should return metrics as string', async () => {
      metrics.recordHttpRequest('GET', '/test', 200, 0.1);

      const output = await metrics.getMetrics();
      
      expect(typeof output).toBe('string');
      expect(output.length).toBeGreaterThan(0);
      expect(output).toContain('# HELP');
      expect(output).toContain('# TYPE');
    });

    it('should return content type for Prometheus', () => {
      const contentType = metrics.getContentType();
      
      expect(typeof contentType).toBe('string');
      expect(contentType).toContain('text/plain');
    });

    it('should handle errors in getMetrics gracefully', async () => {
      const originalMetrics = metrics.register.metrics;
      metrics.register.metrics = jest.fn().mockRejectedValue(new Error('Metrics error'));

      await expect(metrics.getMetrics()).rejects.toThrow('Metrics error');

      metrics.register.metrics = originalMetrics;
    });
  });

  describe('Metric Export Verification', () => {
    it('should export all HTTP metrics', () => {
      expect(metrics.httpRequestDuration).toBeDefined();
      expect(metrics.httpRequestCounter).toBeDefined();
      expect(metrics.httpRequestSize).toBeDefined();
      expect(metrics.httpResponseSize).toBeDefined();
    });

    it('should export all transfer metrics', () => {
      expect(metrics.transfersInitiated).toBeDefined();
      expect(metrics.transfersAccepted).toBeDefined();
      expect(metrics.transfersRejected).toBeDefined();
      expect(metrics.transfersCancelled).toBeDefined();
      expect(metrics.transfersCompleted).toBeDefined();
      expect(metrics.transfersFailed).toBeDefined();
      expect(metrics.transfersExpired).toBeDefined();
      expect(metrics.transferAcceptanceTime).toBeDefined();
      expect(metrics.pendingTransfers).toBeDefined();
      expect(metrics.batchTransferSize).toBeDefined();
    });

    it('should export all blockchain metrics', () => {
      expect(metrics.blockchainTransferDuration).toBeDefined();
      expect(metrics.blockchainTransfers).toBeDefined();
      expect(metrics.rpcRequestDuration).toBeDefined();
      expect(metrics.rpcRequests).toBeDefined();
      expect(metrics.txConfirmationTime).toBeDefined();
      expect(metrics.priorityFeePaid).toBeDefined();
    });

    it('should export circuit breaker metrics', () => {
      expect(metrics.circuitBreakerState).toBeDefined();
      expect(metrics.circuitBreakerTrips).toBeDefined();
    });

    it('should export cache metrics', () => {
      expect(metrics.cacheOperations).toBeDefined();
      expect(metrics.cacheHitRate).toBeDefined();
    });

    it('should export database metrics', () => {
      expect(metrics.dbQueryDuration).toBeDefined();
      expect(metrics.dbPoolSize).toBeDefined();
    });

    it('should export rate limiting metrics', () => {
      expect(metrics.rateLimitHits).toBeDefined();
    });

    it('should export helper functions', () => {
      expect(typeof metrics.recordHttpRequest).toBe('function');
      expect(typeof metrics.recordTransferEvent).toBe('function');
      expect(typeof metrics.recordBlockchainOp).toBe('function');
      expect(typeof metrics.recordRpcRequest).toBe('function');
      expect(typeof metrics.updateCircuitBreakerState).toBe('function');
      expect(typeof metrics.recordCacheOp).toBe('function');
    });
  });

  describe('Real-World Patterns', () => {
    it('should track complete transfer lifecycle', async () => {
      metrics.recordTransferEvent('initiated', 'ticket', 'tenant-123');
      metrics.recordHttpRequest('POST', '/api/transfers', 201, 0.5, 'tenant-123');
      
      metrics.recordTransferEvent('accepted', 'ticket', 'tenant-123');
      metrics.recordHttpRequest('POST', '/api/transfers/:id/accept', 200, 0.3, 'tenant-123');
      
      metrics.recordBlockchainOp('success', 'mainnet', 8.5);
      metrics.recordRpcRequest('sendTransaction', 'mainnet', 'success', 2.0);
      
      metrics.recordTransferEvent('completed', 'ticket', 'tenant-123');

      const output = await metrics.register.metrics();
      
      expect(output).toContain('transfers_initiated_total');
      expect(output).toContain('transfers_accepted_total');
      expect(output).toContain('transfers_completed_total');
      expect(output).toContain('blockchain_transfers_total');
      expect(output).toContain('rpc_requests_total');
    });

    it('should track failed transfer with retries', async () => {
      metrics.recordTransferEvent('initiated', 'ticket', 'tenant-456');
      
      metrics.recordBlockchainOp('failure', 'devnet', 5.0);
      metrics.recordRpcRequest('sendTransaction', 'devnet', 'failure', 1.5);
      
      metrics.recordBlockchainOp('failure', 'devnet', 7.0);
      metrics.recordRpcRequest('sendTransaction', 'devnet', 'failure', 2.0);
      
      metrics.recordTransferEvent('failed', 'ticket', 'tenant-456', { error_code: 'MAX_RETRIES' });

      const output = await metrics.register.metrics();
      
      expect(output).toContain('transfers_failed_total');
      expect(output).toContain('error_code="MAX_RETRIES"');
    });

    it('should track cache effectiveness', async () => {
      for (let i = 0; i < 7; i++) {
        metrics.recordCacheOp('get', true);
      }
      for (let i = 0; i < 3; i++) {
        metrics.recordCacheOp('get', false);
      }

      const output = await metrics.register.metrics();
      
      expect(output).toContain('cache_operations_total');
      expect(output).toContain('status="hit"');
      expect(output).toContain('status="miss"');
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent metric recording', async () => {
      const promises = [];
      
      for (let i = 0; i < 100; i++) {
        promises.push(
          Promise.resolve(metrics.recordHttpRequest('GET', '/api', 200, 0.1, 'tenant-1'))
        );
      }

      await Promise.all(promises);

      const output = await metrics.register.metrics();
      
      expect(output).toContain('http_requests_total');
      expect(output).toMatch(/http_requests_total\{[^}]*\}\s+100/);
    });
  });
});
