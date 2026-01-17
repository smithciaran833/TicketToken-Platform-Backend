/**
 * Unit Tests for Blockchain Metrics
 */

describe('Blockchain Metrics - Domain-Specific Tracking', () => {
  let blockchainMetrics: any;
  let register: any;

  beforeEach(() => {
    // Clear module cache
    jest.resetModules();
    
    // Import fresh instances - they share the same register
    const promClient = require('prom-client');
    register = promClient.register;
    register.clear();
    
    const metricsModule = require('../../../src/utils/blockchain-metrics');
    blockchainMetrics = metricsModule.blockchainMetrics;
  });

  afterEach(() => {
    if (register) {
      register.clear();
    }
  });

  describe('Transfer Success Tracking', () => {
    it('should record successful transfer with duration', async () => {
      blockchainMetrics.recordTransferSuccess(1500);

      const metrics = await register.metrics();
      
      expect(metrics).toContain('blockchain_transfers_success_total');
      expect(metrics).toContain('blockchain_transfer_duration_ms');
    });

    it('should increment success counter on each call', async () => {
      blockchainMetrics.recordTransferSuccess(100);
      blockchainMetrics.recordTransferSuccess(200);
      blockchainMetrics.recordTransferSuccess(300);

      const metrics = await register.metrics();
      
      expect(metrics).toContain('blockchain_transfers_success_total 3');
    });

    it('should observe duration in histogram buckets', async () => {
      blockchainMetrics.recordTransferSuccess(50);
      blockchainMetrics.recordTransferSuccess(750);
      blockchainMetrics.recordTransferSuccess(2500);
      blockchainMetrics.recordTransferSuccess(15000);

      const metrics = await register.metrics();
      
      expect(metrics).toContain('blockchain_transfer_duration_ms_bucket');
      expect(metrics).toContain('blockchain_transfer_duration_ms_count 4');
    });

    it('should track sum of all durations', async () => {
      blockchainMetrics.recordTransferSuccess(1000);
      blockchainMetrics.recordTransferSuccess(2000);
      blockchainMetrics.recordTransferSuccess(3000);

      const metrics = await register.metrics();
      
      expect(metrics).toContain('blockchain_transfer_duration_ms_sum 6000');
    });
  });

  describe('Transfer Failure Tracking', () => {
    it('should record failure with reason label', async () => {
      blockchainMetrics.recordTransferFailure('insufficient_funds');

      const metrics = await register.metrics();
      
      expect(metrics).toContain('blockchain_transfers_failure_total');
      expect(metrics).toContain('reason="insufficient_funds"');
    });

    it('should track different failure reasons separately', async () => {
      blockchainMetrics.recordTransferFailure('timeout');
      blockchainMetrics.recordTransferFailure('timeout');
      blockchainMetrics.recordTransferFailure('insufficient_funds');
      blockchainMetrics.recordTransferFailure('network_error');
      blockchainMetrics.recordTransferFailure('timeout');

      const metrics = await register.metrics();
      
      expect(metrics).toContain('reason="timeout"');
      expect(metrics).toContain('reason="insufficient_funds"');
      expect(metrics).toContain('reason="network_error"');
    });

    it('should handle various error reason formats', async () => {
      blockchainMetrics.recordTransferFailure('NETWORK_TIMEOUT');
      blockchainMetrics.recordTransferFailure('Invalid Signature');
      blockchainMetrics.recordTransferFailure('simulation-failed');

      const metrics = await register.metrics();
      
      expect(metrics).toContain('NETWORK_TIMEOUT');
      expect(metrics).toContain('Invalid Signature');
      expect(metrics).toContain('simulation-failed');
    });
  });

  describe('Confirmation Timing', () => {
    it('should track confirmation duration', async () => {
      blockchainMetrics.recordConfirmationTime(5000);

      const metrics = await register.metrics();
      
      expect(metrics).toContain('blockchain_confirmation_time_ms');
      expect(metrics).toContain('blockchain_confirmation_time_ms_count 1');
    });

    it('should observe confirmation times in appropriate buckets', async () => {
      blockchainMetrics.recordConfirmationTime(1500);
      blockchainMetrics.recordConfirmationTime(7500);
      blockchainMetrics.recordConfirmationTime(25000);
      blockchainMetrics.recordConfirmationTime(45000);

      const metrics = await register.metrics();
      
      expect(metrics).toContain('blockchain_confirmation_time_ms_bucket');
      expect(metrics).toContain('blockchain_confirmation_time_ms_count 4');
    });

    it('should track average confirmation time via sum and count', async () => {
      blockchainMetrics.recordConfirmationTime(10000);
      blockchainMetrics.recordConfirmationTime(20000);
      blockchainMetrics.recordConfirmationTime(30000);

      const metrics = await register.metrics();
      
      expect(metrics).toContain('blockchain_confirmation_time_ms_sum 60000');
      expect(metrics).toContain('blockchain_confirmation_time_ms_count 3');
    });
  });

  describe('Confirmation Timeout Tracking', () => {
    it('should record confirmation timeouts', async () => {
      blockchainMetrics.recordConfirmationTimeout();

      const metrics = await register.metrics();
      
      expect(metrics).toContain('blockchain_confirmation_timeout_total 1');
    });

    it('should increment timeout counter', async () => {
      blockchainMetrics.recordConfirmationTimeout();
      blockchainMetrics.recordConfirmationTimeout();
      blockchainMetrics.recordConfirmationTimeout();

      const metrics = await register.metrics();
      
      expect(metrics).toContain('blockchain_confirmation_timeout_total 3');
    });
  });

  describe('RPC Call Tracking', () => {
    it('should track RPC calls by method', async () => {
      blockchainMetrics.recordRPCCall('getTransaction');

      const metrics = await register.metrics();
      
      expect(metrics).toContain('blockchain_rpc_calls_total');
      expect(metrics).toContain('method="getTransaction"');
    });

    it('should track different RPC methods separately', async () => {
      blockchainMetrics.recordRPCCall('sendTransaction');
      blockchainMetrics.recordRPCCall('sendTransaction');
      blockchainMetrics.recordRPCCall('getBalance');
      blockchainMetrics.recordRPCCall('getTransaction');
      blockchainMetrics.recordRPCCall('sendTransaction');

      const metrics = await register.metrics();
      
      expect(metrics).toContain('method="sendTransaction"');
      expect(metrics).toContain('method="getBalance"');
      expect(metrics).toContain('method="getTransaction"');
    });

    it('should handle all common RPC methods', async () => {
      const methods = [
        'getAccountInfo',
        'getBalance',
        'getBlock',
        'getTransaction',
        'sendTransaction',
        'simulateTransaction',
        'getRecentBlockhash',
        'confirmTransaction'
      ];

      methods.forEach(method => {
        blockchainMetrics.recordRPCCall(method);
      });

      const metrics = await register.metrics();
      
      methods.forEach(method => {
        expect(metrics).toContain(`method="${method}"`);
      });
    });
  });

  describe('RPC Error Tracking', () => {
    it('should track RPC errors with method and error type', async () => {
      blockchainMetrics.recordRPCError('sendTransaction', 'timeout');

      const metrics = await register.metrics();
      
      expect(metrics).toContain('blockchain_rpc_errors_total');
      expect(metrics).toContain('method="sendTransaction"');
      expect(metrics).toContain('error_type="timeout"');
    });

    it('should track errors by method and type combination', async () => {
      blockchainMetrics.recordRPCError('sendTransaction', 'timeout');
      blockchainMetrics.recordRPCError('sendTransaction', 'timeout');
      blockchainMetrics.recordRPCError('sendTransaction', 'rate_limit');
      blockchainMetrics.recordRPCError('getBalance', 'timeout');

      const metrics = await register.metrics();
      
      expect(metrics).toContain('method="sendTransaction"');
      expect(metrics).toContain('error_type="timeout"');
      expect(metrics).toContain('error_type="rate_limit"');
      expect(metrics).toContain('method="getBalance"');
    });

    it('should categorize different error types', async () => {
      const errorTypes = [
        'timeout',
        'rate_limit',
        'network_error',
        'invalid_params',
        'insufficient_funds',
        'simulation_failed'
      ];

      errorTypes.forEach(errorType => {
        blockchainMetrics.recordRPCError('sendTransaction', errorType);
      });

      const metrics = await register.metrics();
      
      errorTypes.forEach(errorType => {
        expect(metrics).toContain(`error_type="${errorType}"`);
      });
    });
  });

  describe('Real-World Usage Patterns', () => {
    it('should track complete successful transfer flow', async () => {
      blockchainMetrics.recordRPCCall('getRecentBlockhash');
      blockchainMetrics.recordRPCCall('sendTransaction');
      blockchainMetrics.recordTransferSuccess(1500);
      blockchainMetrics.recordConfirmationTime(8000);

      const metrics = await register.metrics();
      
      expect(metrics).toContain('blockchain_rpc_calls_total');
      expect(metrics).toContain('blockchain_transfers_success_total 1');
      expect(metrics).toContain('blockchain_transfer_duration_ms_count 1');
      expect(metrics).toContain('blockchain_confirmation_time_ms_count 1');
    });

    it('should track failed transfer with retries', async () => {
      blockchainMetrics.recordRPCCall('sendTransaction');
      blockchainMetrics.recordRPCError('sendTransaction', 'network_error');
      blockchainMetrics.recordRPCCall('sendTransaction');
      blockchainMetrics.recordRPCError('sendTransaction', 'rate_limit');
      blockchainMetrics.recordRPCCall('sendTransaction');
      blockchainMetrics.recordRPCError('sendTransaction', 'timeout');
      blockchainMetrics.recordTransferFailure('max_retries_exceeded');

      const metrics = await register.metrics();
      
      expect(metrics).toContain('blockchain_rpc_calls_total');
      expect(metrics).toContain('blockchain_rpc_errors_total');
      expect(metrics).toContain('blockchain_transfers_failure_total');
    });

    it('should track confirmation timeout scenario', async () => {
      blockchainMetrics.recordRPCCall('sendTransaction');
      blockchainMetrics.recordTransferSuccess(1000);
      blockchainMetrics.recordConfirmationTimeout();
      blockchainMetrics.recordTransferFailure('confirmation_timeout');

      const metrics = await register.metrics();
      
      expect(metrics).toContain('blockchain_transfers_success_total 1');
      expect(metrics).toContain('blockchain_confirmation_timeout_total 1');
      expect(metrics).toContain('blockchain_transfers_failure_total');
    });

    it('should track batch transfer metrics', async () => {
      for (let i = 0; i < 10; i++) {
        blockchainMetrics.recordRPCCall('sendTransaction');
        blockchainMetrics.recordTransferSuccess(1000 + i * 100);
        blockchainMetrics.recordConfirmationTime(5000 + i * 500);
      }

      const metrics = await register.metrics();
      
      expect(metrics).toContain('blockchain_transfers_success_total 10');
      expect(metrics).toContain('blockchain_transfer_duration_ms_count 10');
      expect(metrics).toContain('blockchain_confirmation_time_ms_count 10');
    });
  });

  describe('Histogram Bucket Configuration', () => {
    it('should have appropriate transfer duration buckets', async () => {
      blockchainMetrics.recordTransferSuccess(150);

      const metrics = await register.metrics();
      
      expect(metrics).toContain('le="100"');
      expect(metrics).toContain('le="500"');
      expect(metrics).toContain('le="1000"');
      expect(metrics).toContain('le="2000"');
      expect(metrics).toContain('le="5000"');
      expect(metrics).toContain('le="10000"');
      expect(metrics).toContain('le="30000"');
      expect(metrics).toContain('le="60000"');
      expect(metrics).toContain('le="+Inf"');
    });

    it('should have appropriate confirmation time buckets', async () => {
      blockchainMetrics.recordConfirmationTime(3000);

      const metrics = await register.metrics();
      
      expect(metrics).toContain('le="1000"');
      expect(metrics).toContain('le="2000"');
      expect(metrics).toContain('le="5000"');
      expect(metrics).toContain('le="10000"');
      expect(metrics).toContain('le="20000"');
      expect(metrics).toContain('le="30000"');
      expect(metrics).toContain('le="60000"');
      expect(metrics).toContain('le="+Inf"');
    });

    it('should categorize observations into correct buckets', async () => {
      blockchainMetrics.recordTransferSuccess(250);

      const metrics = await register.metrics();
      
      expect(metrics).toContain('le="500"');
      expect(metrics).toContain('blockchain_transfer_duration_ms_count 1');
    });
  });

  describe('Concurrent Metric Recording', () => {
    it('should handle concurrent success recordings', async () => {
      const promises = Array(50).fill(null).map((_, i) =>
        Promise.resolve(blockchainMetrics.recordTransferSuccess(1000 + i))
      );

      await Promise.all(promises);

      const metrics = await register.metrics();
      
      expect(metrics).toContain('blockchain_transfers_success_total 50');
    });

    it('should handle concurrent failure recordings with different reasons', async () => {
      const reasons = ['timeout', 'network_error', 'insufficient_funds'];
      
      const promises = Array(30).fill(null).map((_, i) =>
        Promise.resolve(
          blockchainMetrics.recordTransferFailure(reasons[i % 3])
        )
      );

      await Promise.all(promises);

      const metrics = await register.metrics();
      
      reasons.forEach(reason => {
        expect(metrics).toContain(`reason="${reason}"`);
      });
    });

    it('should handle concurrent RPC call and error recordings', async () => {
      const promises = [];
      
      for (let i = 0; i < 100; i++) {
        promises.push(
          Promise.resolve(blockchainMetrics.recordRPCCall('sendTransaction'))
        );
        
        if (i % 10 === 0) {
          promises.push(
            Promise.resolve(blockchainMetrics.recordRPCError('sendTransaction', 'timeout'))
          );
        }
      }

      await Promise.all(promises);

      const metrics = await register.metrics();
      
      expect(metrics).toContain('blockchain_rpc_calls_total');
      expect(metrics).toContain('blockchain_rpc_errors_total');
    });
  });

  describe('Edge Cases and Boundaries', () => {
    it('should handle zero duration', async () => {
      blockchainMetrics.recordTransferSuccess(0);

      const metrics = await register.metrics();
      
      expect(metrics).toContain('blockchain_transfer_duration_ms_sum 0');
      expect(metrics).toContain('blockchain_transfer_duration_ms_count 1');
    });

    it('should handle very large durations', async () => {
      blockchainMetrics.recordTransferSuccess(999999);

      const metrics = await register.metrics();
      
      expect(metrics).toContain('blockchain_transfer_duration_ms_sum 999999');
    });

    it('should handle empty error reason', async () => {
      blockchainMetrics.recordTransferFailure('');

      const metrics = await register.metrics();
      
      expect(metrics).toContain('reason=""');
    });

    it('should handle special characters in labels', async () => {
      blockchainMetrics.recordTransferFailure('error: timeout (network)');
      blockchainMetrics.recordRPCError('sendTransaction', 'rate_limit_429');

      const metrics = await register.metrics();
      
      expect(metrics).toContain('blockchain_transfers_failure_total');
      expect(metrics).toContain('blockchain_rpc_errors_total');
    });
  });

  describe('Metric Metadata', () => {
    it('should include help text for all metrics', async () => {
      blockchainMetrics.recordTransferSuccess(1000);
      blockchainMetrics.recordTransferFailure('test');
      blockchainMetrics.recordConfirmationTime(5000);
      blockchainMetrics.recordConfirmationTimeout();
      blockchainMetrics.recordRPCCall('test');
      blockchainMetrics.recordRPCError('test', 'error');

      const metrics = await register.metrics();
      
      expect(metrics).toContain('# HELP blockchain_transfers_success_total');
      expect(metrics).toContain('# HELP blockchain_transfers_failure_total');
      expect(metrics).toContain('# HELP blockchain_transfer_duration_ms');
      expect(metrics).toContain('# HELP blockchain_confirmation_time_ms');
      expect(metrics).toContain('# HELP blockchain_confirmation_timeout_total');
      expect(metrics).toContain('# HELP blockchain_rpc_calls_total');
      expect(metrics).toContain('# HELP blockchain_rpc_errors_total');
    });

    it('should include type information for all metrics', async () => {
      blockchainMetrics.recordTransferSuccess(1000);

      const metrics = await register.metrics();
      
      expect(metrics).toContain('# TYPE blockchain_transfers_success_total counter');
      expect(metrics).toContain('# TYPE blockchain_transfer_duration_ms histogram');
    });
  });
});
