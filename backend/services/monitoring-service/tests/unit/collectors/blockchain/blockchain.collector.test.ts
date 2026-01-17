// Mock config FIRST to avoid validation errors
jest.mock('../../../../src/config', () => ({
  config: {
    env: 'test',
    logging: { level: 'info' },
    serviceName: 'monitoring-service-test',
  },
}));

// Mock dependencies BEFORE imports
const mockPushMetrics = jest.fn();
const mockLoggerInfo = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    info: mockLoggerInfo,
    error: mockLoggerError,
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('../../../../src/services/metrics.service', () => ({
  metricsService: {
    pushMetrics: mockPushMetrics,
  },
}));

const originalMathRandom = Math.random;

import { BlockchainMetricsCollector } from '../../../../src/collectors/blockchain/blockchain.collector';

describe('BlockchainMetricsCollector', () => {
  let collector: BlockchainMetricsCollector;
  let mockSetInterval: jest.SpyInstance;
  let mockClearInterval: jest.SpyInstance;
  let mockMathRandom: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockSetInterval = jest.spyOn(global, 'setInterval');
    mockClearInterval = jest.spyOn(global, 'clearInterval');
    mockMathRandom = jest.spyOn(Math, 'random').mockReturnValue(0.5);

    collector = new BlockchainMetricsCollector();
  });

  afterEach(() => {
    jest.useRealTimers();
    mockMathRandom.mockRestore();
  });

  describe('getName', () => {
    it('should return collector name', () => {
      expect(collector.getName()).toBe('BlockchainMetricsCollector');
    });
  });

  describe('start', () => {
    it('should log start message', async () => {
      await collector.start();

      expect(mockLoggerInfo).toHaveBeenCalledWith('Starting BlockchainMetricsCollector...');
    });

    it('should set up interval for metric collection every 30 seconds', async () => {
      await collector.start();

      expect(mockSetInterval).toHaveBeenCalledWith(expect.any(Function), 30000);
    });

    it('should collect metrics immediately on start', async () => {
      await collector.start();

      expect(mockPushMetrics).toHaveBeenCalled();
    });

    it('should collect all 17 blockchain metrics', async () => {
      await collector.start();

      expect(mockPushMetrics).toHaveBeenCalledTimes(17);
    });
  });

  describe('stop', () => {
    it('should clear interval and log message', async () => {
      await collector.start();
      await collector.stop();

      expect(mockClearInterval).toHaveBeenCalled();
      expect(mockLoggerInfo).toHaveBeenCalledWith('Stopped BlockchainMetricsCollector');
    });

    it('should handle stop when not started', async () => {
      await collector.stop();

      expect(mockClearInterval).not.toHaveBeenCalled();
      expect(mockLoggerInfo).toHaveBeenCalledWith('Stopped BlockchainMetricsCollector');
    });
  });

  describe('collect - blockchain metrics', () => {
    it('should collect gas price metrics', async () => {
      await collector.start();

      expect(mockPushMetrics).toHaveBeenCalledWith({
        metric_name: 'blockchain_gas_price_gwei',
        service_name: 'blockchain',
        value: expect.any(Number),
        type: 'gauge',
        labels: {
          network: 'ethereum',
          environment: 'test',
        },
      });

      expect(mockPushMetrics).toHaveBeenCalledWith({
        metric_name: 'blockchain_gas_price_usd',
        service_name: 'blockchain',
        value: expect.any(Number),
        type: 'gauge',
        labels: {
          network: 'ethereum',
          environment: 'test',
        },
      });
    });

    it('should collect transaction metrics', async () => {
      await collector.start();

      const pendingTxCall = mockPushMetrics.mock.calls.find(
        call => call[0].metric_name === 'blockchain_pending_transactions'
      );
      const confirmedTxCall = mockPushMetrics.mock.calls.find(
        call => call[0].metric_name === 'blockchain_confirmed_transactions'
      );

      expect(pendingTxCall).toBeDefined();
      expect(confirmedTxCall).toBeDefined();
    });

    it('should collect NFT mint metrics', async () => {
      await collector.start();

      const pendingMintsCall = mockPushMetrics.mock.calls.find(
        call => call[0].metric_name === 'blockchain_nft_mints_pending'
      );
      const failedMintsCall = mockPushMetrics.mock.calls.find(
        call => call[0].metric_name === 'blockchain_nft_mints_failed'
      );
      const successRateCall = mockPushMetrics.mock.calls.find(
        call => call[0].metric_name === 'blockchain_nft_mint_success_rate'
      );

      expect(pendingMintsCall).toBeDefined();
      expect(failedMintsCall).toBeDefined();
      expect(successRateCall).toBeDefined();
    });

    it('should collect contract metrics', async () => {
      await collector.start();

      const contractCallsCall = mockPushMetrics.mock.calls.find(
        call => call[0].metric_name === 'blockchain_contract_calls_per_minute'
      );
      const gasUsedCall = mockPushMetrics.mock.calls.find(
        call => call[0].metric_name === 'blockchain_contract_gas_used'
      );

      expect(contractCallsCall).toBeDefined();
      expect(gasUsedCall).toBeDefined();
    });

    it('should collect network metrics', async () => {
      await collector.start();

      const hashrateCall = mockPushMetrics.mock.calls.find(
        call => call[0].metric_name === 'blockchain_network_hashrate'
      );
      const difficultyCall = mockPushMetrics.mock.calls.find(
        call => call[0].metric_name === 'blockchain_network_difficulty'
      );
      const peerCountCall = mockPushMetrics.mock.calls.find(
        call => call[0].metric_name === 'blockchain_peer_count'
      );

      expect(hashrateCall).toBeDefined();
      expect(difficultyCall).toBeDefined();
      expect(peerCountCall).toBeDefined();
    });

    it('should collect wallet metrics', async () => {
      await collector.start();

      const activeWalletsCall = mockPushMetrics.mock.calls.find(
        call => call[0].metric_name === 'blockchain_active_wallets'
      );
      const newWalletsCall = mockPushMetrics.mock.calls.find(
        call => call[0].metric_name === 'blockchain_new_wallets_24h'
      );

      expect(activeWalletsCall).toBeDefined();
      expect(newWalletsCall).toBeDefined();
    });

    it('should collect IPFS metrics', async () => {
      await collector.start();

      const availabilityCall = mockPushMetrics.mock.calls.find(
        call => call[0].metric_name === 'blockchain_ipfs_availability'
      );
      const responseTimeCall = mockPushMetrics.mock.calls.find(
        call => call[0].metric_name === 'blockchain_ipfs_response_time_ms'
      );

      expect(availabilityCall).toBeDefined();
      expect(responseTimeCall).toBeDefined();
    });

    it('should include network and environment labels', async () => {
      await collector.start();

      mockPushMetrics.mock.calls.forEach(call => {
        expect(call[0].labels).toEqual({
          network: 'ethereum',
          environment: 'test',
        });
      });
    });

    it('should log success message with metric count', async () => {
      await collector.start();

      expect(mockLoggerInfo).toHaveBeenCalledWith('Collected 17 blockchain metrics');
    });
  });

  describe('collect - value ranges', () => {
    it('should generate gas prices in expected ranges', async () => {
      Math.random = jest.fn().mockReturnValue(0.5);
      
      await collector.start();

      const gasPriceGweiCall = mockPushMetrics.mock.calls.find(
        call => call[0].metric_name === 'blockchain_gas_price_gwei'
      );
      const gasPriceUsdCall = mockPushMetrics.mock.calls.find(
        call => call[0].metric_name === 'blockchain_gas_price_usd'
      );

      expect(gasPriceGweiCall[0].value).toBeGreaterThanOrEqual(20);
      expect(gasPriceGweiCall[0].value).toBeLessThanOrEqual(120);

      expect(gasPriceUsdCall[0].value).toBeGreaterThanOrEqual(1);
      expect(gasPriceUsdCall[0].value).toBeLessThanOrEqual(6);
    });

    it('should generate integer values for count metrics', async () => {
      await collector.start();

      const integerMetrics = [
        'blockchain_pending_transactions',
        'blockchain_confirmed_transactions',
        'blockchain_nft_mints_pending',
        'blockchain_nft_mints_failed',
        'blockchain_contract_calls_per_minute',
        'blockchain_contract_gas_used',
        'blockchain_peer_count',
        'blockchain_active_wallets',
        'blockchain_new_wallets_24h',
      ];

      integerMetrics.forEach(metricName => {
        const call = mockPushMetrics.mock.calls.find(
          c => c[0].metric_name === metricName
        );
        expect(Number.isInteger(call[0].value)).toBe(true);
      });
    });

    it('should generate success rate above 95%', async () => {
      await collector.start();

      const successRateCall = mockPushMetrics.mock.calls.find(
        call => call[0].metric_name === 'blockchain_nft_mint_success_rate'
      );

      expect(successRateCall[0].value).toBeGreaterThanOrEqual(95);
      expect(successRateCall[0].value).toBeLessThanOrEqual(100);
    });

    it('should generate IPFS availability above 99%', async () => {
      await collector.start();

      const availabilityCall = mockPushMetrics.mock.calls.find(
        call => call[0].metric_name === 'blockchain_ipfs_availability'
      );

      expect(availabilityCall[0].value).toBeGreaterThanOrEqual(99);
      expect(availabilityCall[0].value).toBeLessThanOrEqual(100);
    });
  });

  describe('error handling', () => {
    it('should handle pushMetrics errors gracefully', async () => {
      mockPushMetrics.mockRejectedValue(new Error('Metrics service unavailable'));

      await collector.start();

      expect(mockLoggerError).toHaveBeenCalledWith(
        'Error collecting blockchain metrics:',
        expect.any(Error)
      );
    });
  });

  describe('edge cases', () => {
    it('should handle Math.random returning 0', async () => {
      Math.random = jest.fn().mockReturnValue(0);

      await collector.start();

      expect(mockPushMetrics).toHaveBeenCalled();
    });

    it('should handle Math.random returning 1', async () => {
      Math.random = jest.fn().mockReturnValue(0.999999);

      await collector.start();

      expect(mockPushMetrics).toHaveBeenCalled();
    });
  });
});
