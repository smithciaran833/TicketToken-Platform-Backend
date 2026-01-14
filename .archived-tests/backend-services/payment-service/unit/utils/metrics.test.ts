// =============================================================================
// MOCKS
// =============================================================================

const mockCounter = jest.fn();
const mockHistogram = jest.fn();
const mockGauge = jest.fn();
const mockCollectDefaultMetrics = jest.fn();

jest.mock('prom-client', () => ({
  Registry: jest.fn().mockImplementation(() => ({})),
  collectDefaultMetrics: mockCollectDefaultMetrics,
  Counter: jest.fn().mockImplementation((config) => {
    mockCounter(config);
    return {
      inc: jest.fn(),
      labels: jest.fn().mockReturnThis(),
    };
  }),
  Histogram: jest.fn().mockImplementation((config) => {
    mockHistogram(config);
    return {
      observe: jest.fn(),
      labels: jest.fn().mockReturnThis(),
    };
  }),
  Gauge: jest.fn().mockImplementation((config) => {
    mockGauge(config);
    return {
      set: jest.fn(),
      inc: jest.fn(),
      dec: jest.fn(),
    };
  }),
}));

// =============================================================================
// TEST SUITE
// =============================================================================

describe('metrics utility', () => {
  let metrics: any;

  beforeAll(() => {
    metrics = require('../../../src/utils/metrics');
  });

  // ===========================================================================
  // Registry - 2 test cases
  // ===========================================================================

  describe('Registry', () => {
    it('should export register', () => {
      expect(metrics.register).toBeDefined();
    });

    it('should collect default metrics', () => {
      expect(mockCollectDefaultMetrics).toHaveBeenCalledWith({
        register: expect.any(Object),
      });
    });
  });

  // ===========================================================================
  // paymentTotal Counter - 3 test cases
  // ===========================================================================

  describe('paymentTotal Counter', () => {
    it('should create paymentTotal counter', () => {
      expect(metrics.paymentTotal).toBeDefined();
    });

    it('should have correct name and help text', () => {
      const counterConfig = mockCounter.mock.calls.find(
        (call) => call[0].name === 'payment_transactions_total'
      );
      
      expect(counterConfig).toBeDefined();
      expect(counterConfig[0].help).toBe('Total number of payment transactions');
    });

    it('should have status and method labels', () => {
      const counterConfig = mockCounter.mock.calls.find(
        (call) => call[0].name === 'payment_transactions_total'
      );
      
      expect(counterConfig[0].labelNames).toEqual(['status', 'method']);
    });
  });

  // ===========================================================================
  // paymentAmount Histogram - 3 test cases
  // ===========================================================================

  describe('paymentAmount Histogram', () => {
    it('should create paymentAmount histogram', () => {
      expect(metrics.paymentAmount).toBeDefined();
    });

    it('should have correct name and help text', () => {
      const histogramConfig = mockHistogram.mock.calls.find(
        (call) => call[0].name === 'payment_amount_dollars'
      );
      
      expect(histogramConfig).toBeDefined();
      expect(histogramConfig[0].help).toBe('Payment amounts in dollars');
    });

    it('should have amount buckets', () => {
      const histogramConfig = mockHistogram.mock.calls.find(
        (call) => call[0].name === 'payment_amount_dollars'
      );
      
      expect(histogramConfig[0].buckets).toEqual([10, 50, 100, 500, 1000, 5000]);
    });
  });

  // ===========================================================================
  // refundTotal Counter - 2 test cases
  // ===========================================================================

  describe('refundTotal Counter', () => {
    it('should create refundTotal counter', () => {
      expect(metrics.refundTotal).toBeDefined();
    });

    it('should have status label', () => {
      const counterConfig = mockCounter.mock.calls.find(
        (call) => call[0].name === 'payment_refunds_total'
      );
      
      expect(counterConfig[0].labelNames).toEqual(['status']);
    });
  });

  // ===========================================================================
  // paymentDuration Histogram - 2 test cases
  // ===========================================================================

  describe('paymentDuration Histogram', () => {
    it('should create paymentDuration histogram', () => {
      expect(metrics.paymentDuration).toBeDefined();
    });

    it('should have method label', () => {
      const histogramConfig = mockHistogram.mock.calls.find(
        (call) => call[0].name === 'payment_processing_duration_seconds'
      );
      
      expect(histogramConfig[0].labelNames).toEqual(['method']);
    });
  });

  // ===========================================================================
  // activeTransactions Gauge - 2 test cases
  // ===========================================================================

  describe('activeTransactions Gauge', () => {
    it('should create activeTransactions gauge', () => {
      expect(metrics.activeTransactions).toBeDefined();
    });

    it('should have correct name and help text', () => {
      const gaugeConfig = mockGauge.mock.calls.find(
        (call) => call[0].name === 'payment_active_transactions'
      );
      
      expect(gaugeConfig).toBeDefined();
      expect(gaugeConfig[0].help).toBe('Number of active transactions');
    });
  });

  // ===========================================================================
  // All Metrics - 2 test cases
  // ===========================================================================

  describe('All Metrics', () => {
    it('should export all metric instances', () => {
      expect(metrics.paymentTotal).toBeDefined();
      expect(metrics.paymentAmount).toBeDefined();
      expect(metrics.refundTotal).toBeDefined();
      expect(metrics.paymentDuration).toBeDefined();
      expect(metrics.activeTransactions).toBeDefined();
    });

    it('should register all metrics with registry', () => {
      const allConfigs = [
        ...mockCounter.mock.calls,
        ...mockHistogram.mock.calls,
        ...mockGauge.mock.calls,
      ];

      allConfigs.forEach((config) => {
        expect(config[0].registers).toEqual([expect.any(Object)]);
      });
    });
  });
});
