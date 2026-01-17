// Mock config FIRST
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
const mockLoggerWarn = jest.fn();
const mockLoggerDebug = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
    debug: mockLoggerDebug,
    error: mockLoggerError,
  },
}));

jest.mock('../../../../src/services/metrics.service', () => ({
  metricsService: {
    pushMetrics: mockPushMetrics,
  },
}));

const originalMathRandom = Math.random;

import { FraudDetectionCollector } from '../../../../src/collectors/blockchain/fraud.collector';

describe('FraudDetectionCollector', () => {
  let collector: FraudDetectionCollector;
  let mockSetInterval: jest.SpyInstance;
  let mockClearInterval: jest.SpyInstance;
  let mockMathRandom: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockSetInterval = jest.spyOn(global, 'setInterval');
    mockClearInterval = jest.spyOn(global, 'clearInterval');
    mockMathRandom = jest.spyOn(Math, 'random').mockReturnValue(0.5);

    collector = new FraudDetectionCollector();
  });

  afterEach(() => {
    jest.useRealTimers();
    mockMathRandom.mockRestore();
  });

  describe('getName', () => {
    it('should return collector name', () => {
      expect(collector.getName()).toBe('FraudDetectionCollector');
    });
  });

  describe('start', () => {
    it('should log start message', async () => {
      await collector.start();

      expect(mockLoggerInfo).toHaveBeenCalledWith('Starting FraudDetectionCollector...');
    });

    it('should set up interval for detection every 10 seconds', async () => {
      await collector.start();

      expect(mockSetInterval).toHaveBeenCalledWith(expect.any(Function), 10000);
    });

    it('should detect fraud immediately on start', async () => {
      await collector.start();

      expect(mockPushMetrics).toHaveBeenCalled();
    });

    it('should collect all 11 fraud detection metrics', async () => {
      await collector.start();

      expect(mockPushMetrics).toHaveBeenCalledTimes(11);
    });
  });

  describe('stop', () => {
    it('should clear interval when stopped', async () => {
      await collector.start();
      await collector.stop();

      expect(mockClearInterval).toHaveBeenCalled();
    });

    it('should handle stop when not started', async () => {
      await collector.stop();

      expect(mockClearInterval).not.toHaveBeenCalled();
    });
  });

  describe('detectFraud - fraud metrics', () => {
    it('should collect bot attempt metrics', async () => {
      await collector.start();

      const botAttemptsCall = mockPushMetrics.mock.calls.find(
        call => call[0].metric_name === 'fraud_bot_attempts'
      );

      expect(botAttemptsCall).toBeDefined();
      expect(botAttemptsCall[0]).toMatchObject({
        metric_name: 'fraud_bot_attempts',
        service_name: 'fraud-detection',
        type: 'gauge',
      });
      expect(Number.isInteger(botAttemptsCall[0].value)).toBe(true);
    });

    it('should collect scalper pattern metrics', async () => {
      await collector.start();

      const scalperPatternsCall = mockPushMetrics.mock.calls.find(
        call => call[0].metric_name === 'fraud_scalper_patterns'
      );

      expect(scalperPatternsCall).toBeDefined();
      expect(Number.isInteger(scalperPatternsCall[0].value)).toBe(true);
    });

    it('should collect suspicious IP metrics', async () => {
      await collector.start();

      const suspiciousIpsCall = mockPushMetrics.mock.calls.find(
        call => call[0].metric_name === 'fraud_suspicious_ips'
      );

      expect(suspiciousIpsCall).toBeDefined();
    });

    it('should collect velocity violation metrics', async () => {
      await collector.start();

      const velocityCall = mockPushMetrics.mock.calls.find(
        call => call[0].metric_name === 'fraud_velocity_violations'
      );

      expect(velocityCall).toBeDefined();
    });

    it('should collect duplicate payment metrics', async () => {
      await collector.start();

      const duplicatePaymentsCall = mockPushMetrics.mock.calls.find(
        call => call[0].metric_name === 'fraud_duplicate_payments'
      );

      expect(duplicatePaymentsCall).toBeDefined();
    });

    it('should collect account takeover metrics', async () => {
      await collector.start();

      const accountTakeoverCall = mockPushMetrics.mock.calls.find(
        call => call[0].metric_name === 'fraud_account_takeover_attempts'
      );

      expect(accountTakeoverCall).toBeDefined();
    });

    it('should collect bulk purchase metrics', async () => {
      await collector.start();

      const bulkPurchasesCall = mockPushMetrics.mock.calls.find(
        call => call[0].metric_name === 'fraud_bulk_purchases'
      );

      expect(bulkPurchasesCall).toBeDefined();
    });

    it('should collect reseller score metrics', async () => {
      await collector.start();

      const resellerScoreCall = mockPushMetrics.mock.calls.find(
        call => call[0].metric_name === 'fraud_reseller_score'
      );

      expect(resellerScoreCall).toBeDefined();
      expect(resellerScoreCall[0].value).toBeGreaterThanOrEqual(0);
      expect(resellerScoreCall[0].value).toBeLessThanOrEqual(100);
    });

    it('should collect geographic anomaly metrics', async () => {
      await collector.start();

      const geoAnomaliesCall = mockPushMetrics.mock.calls.find(
        call => call[0].metric_name === 'fraud_geographic_anomalies'
      );

      expect(geoAnomaliesCall).toBeDefined();
    });

    it('should collect blocked count metrics', async () => {
      await collector.start();

      const blockedCountCall = mockPushMetrics.mock.calls.find(
        call => call[0].metric_name === 'fraud_blocked_count'
      );

      expect(blockedCountCall).toBeDefined();
    });

    it('should collect detection accuracy metrics', async () => {
      await collector.start();

      const accuracyCall = mockPushMetrics.mock.calls.find(
        call => call[0].metric_name === 'fraud_detection_accuracy'
      );

      expect(accuracyCall).toBeDefined();
      expect(accuracyCall[0].value).toBeGreaterThanOrEqual(95);
      expect(accuracyCall[0].value).toBeLessThanOrEqual(100);
    });

    it('should log debug message after detection', async () => {
      await collector.start();

      expect(mockLoggerDebug).toHaveBeenCalledWith(
        'Fraud detection completed: 11 metrics collected'
      );
    });
  });

  describe('alerting on high fraud activity', () => {
    it('should warn when scalper patterns exceed 2', async () => {
      Math.random = jest.fn()
        .mockReturnValueOnce(0.1) // bot_attempts: 1
        .mockReturnValueOnce(0.8); // scalper_patterns: 4 (exceeds threshold)

      await collector.start();

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining('High scalper activity detected')
      );
    });

    it('should not warn when scalper patterns are at threshold (2)', async () => {
      Math.random = jest.fn()
        .mockReturnValueOnce(0.1) // bot_attempts: 1
        .mockReturnValueOnce(0.4); // scalper_patterns: 2 (at threshold, not exceeding)

      await collector.start();

      const scalperWarnings = mockLoggerWarn.mock.calls.filter(call =>
        call[0].includes('scalper')
      );
      expect(scalperWarnings.length).toBe(0);
    });

    it('should warn when bot attempts exceed 5', async () => {
      Math.random = jest.fn()
        .mockReturnValueOnce(0.7) // bot_attempts: 7 (exceeds threshold)
        .mockReturnValueOnce(0.1); // scalper_patterns: 0

      await collector.start();

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining('High bot activity detected: 7 attempts')
      );
    });

    it('should not warn when bot attempts are at threshold (5)', async () => {
      Math.random = jest.fn()
        .mockReturnValueOnce(0.5) // bot_attempts: 5 (at threshold, not exceeding)
        .mockReturnValueOnce(0.1); // scalper_patterns: 0

      await collector.start();

      const botWarnings = mockLoggerWarn.mock.calls.filter(call =>
        call[0].includes('bot')
      );
      expect(botWarnings.length).toBe(0);
    });

    it('should warn for both high bot and scalper activity', async () => {
      Math.random = jest.fn()
        .mockReturnValueOnce(0.8) // bot_attempts: 8
        .mockReturnValueOnce(0.8); // scalper_patterns: 4

      await collector.start();

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining('High bot activity detected')
      );
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining('High scalper activity detected')
      );
    });
  });

  describe('error handling', () => {
    it('should handle pushMetrics errors gracefully', async () => {
      mockPushMetrics.mockRejectedValue(new Error('Metrics service unavailable'));

      await collector.start();

      expect(mockLoggerError).toHaveBeenCalledWith(
        'Error in fraud detection:',
        expect.any(Error)
      );
    });
  });

  describe('edge cases', () => {
    it('should handle Math.random returning 0', async () => {
      Math.random = jest.fn().mockReturnValue(0);

      await collector.start();

      expect(mockPushMetrics).toHaveBeenCalled();
      expect(mockLoggerWarn).not.toHaveBeenCalled(); // No warnings with 0 values
    });

    it('should handle Math.random returning maximum values', async () => {
      Math.random = jest.fn().mockReturnValue(0.999999);

      await collector.start();

      // Should not throw and should generate maximum values
      expect(mockPushMetrics).toHaveBeenCalled();
      // Warnings will be triggered - that's expected and tested in alerting section
    });
  });
});
