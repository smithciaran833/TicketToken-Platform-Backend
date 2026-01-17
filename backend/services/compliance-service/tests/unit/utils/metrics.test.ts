/**
 * Unit Tests for Metrics Utility
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('Metrics Utility', () => {
  let registry: any;
  let form1099Generated: any;
  let form1099Amount: any;
  let ofacScreenings: any;
  let ofacScreeningDuration: any;
  let ofacMatches: any;
  let riskAssessments: any;
  let riskScore: any;
  let verifications: any;
  let verificationDuration: any;
  let gdprRequests: any;
  let bankVerifications: any;
  let pendingVerifications: any;
  let activeScreenings: any;
  let circuitBreakerState: any;
  let record1099Generation: any;
  let recordOFACScreening: any;
  let recordRiskAssessment: any;
  let recordVerification: any;
  let metricsHandler: any;
  let incrementMetric: any;
  let setGauge: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.resetModules();

    const module = await import('../../../src/utils/metrics');
    registry = module.registry;
    form1099Generated = module.form1099Generated;
    form1099Amount = module.form1099Amount;
    ofacScreenings = module.ofacScreenings;
    ofacScreeningDuration = module.ofacScreeningDuration;
    ofacMatches = module.ofacMatches;
    riskAssessments = module.riskAssessments;
    riskScore = module.riskScore;
    verifications = module.verifications;
    verificationDuration = module.verificationDuration;
    gdprRequests = module.gdprRequests;
    bankVerifications = module.bankVerifications;
    pendingVerifications = module.pendingVerifications;
    activeScreenings = module.activeScreenings;
    circuitBreakerState = module.circuitBreakerState;
    record1099Generation = module.record1099Generation;
    recordOFACScreening = module.recordOFACScreening;
    recordRiskAssessment = module.recordRiskAssessment;
    recordVerification = module.recordVerification;
    metricsHandler = module.metricsHandler;
    incrementMetric = module.incrementMetric;
    setGauge = module.setGauge;

    // Reset registry before each test
    registry.reset();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('MetricsRegistry', () => {
    describe('counter', () => {
      it('should create a counter', () => {
        const counter = registry.counter('test_counter', 'Test counter');
        expect(counter).toBeDefined();
      });

      it('should increment counter', () => {
        const counter = registry.counter('test_counter', 'Test counter');
        counter.inc({ status: 'success' });
        counter.inc({ status: 'success' });
        counter.inc({ status: 'failure' });

        const json = registry.toJSON();
        expect(json.counters.test_counter['status="success"']).toBe(2);
        expect(json.counters.test_counter['status="failure"']).toBe(1);
      });

      it('should increment by custom value', () => {
        const counter = registry.counter('test_counter', 'Test counter');
        counter.inc({}, 5);

        const json = registry.toJSON();
        expect(json.counters.test_counter['']).toBe(5);
      });
    });

    describe('gauge', () => {
      it('should create a gauge', () => {
        const gauge = registry.gauge('test_gauge', 'Test gauge');
        expect(gauge).toBeDefined();
      });

      it('should set gauge value', () => {
        const gauge = registry.gauge('test_gauge', 'Test gauge');
        gauge.set({ type: 'active' }, 42);

        const json = registry.toJSON();
        expect(json.gauges.test_gauge['type="active"']).toBe(42);
      });

      it('should increment gauge', () => {
        const gauge = registry.gauge('test_gauge', 'Test gauge');
        gauge.inc({ type: 'pending' }, 1);
        gauge.inc({ type: 'pending' }, 2);

        const json = registry.toJSON();
        expect(json.gauges.test_gauge['type="pending"']).toBe(3);
      });

      it('should decrement gauge', () => {
        const gauge = registry.gauge('test_gauge', 'Test gauge');
        gauge.set({ type: 'count' }, 10);
        gauge.dec({ type: 'count' }, 3);

        const json = registry.toJSON();
        expect(json.gauges.test_gauge['type="count"']).toBe(7);
      });
    });

    describe('histogram', () => {
      it('should create a histogram', () => {
        const histogram = registry.histogram('test_histogram', 'Test histogram');
        expect(histogram).toBeDefined();
      });

      it('should observe values', () => {
        const histogram = registry.histogram('test_histogram', 'Test histogram', [1, 5, 10]);
        histogram.observe({ method: 'GET' }, 2);
        histogram.observe({ method: 'GET' }, 7);

        const json = registry.toJSON();
        const data = json.histograms.test_histogram['method="GET"'];
        expect(data.count).toBe(2);
        expect(data.sum).toBe(9);
      });

      it('should update bucket counts', () => {
        const histogram = registry.histogram('test_histogram', 'Test histogram', [1, 5, 10]);
        histogram.observe({}, 0.5); // <= 1
        histogram.observe({}, 3);   // <= 5
        histogram.observe({}, 8);   // <= 10
        histogram.observe({}, 15);  // > 10

        const json = registry.toJSON();
        const data = json.histograms.test_histogram[''];
        expect(data.buckets.get(1)).toBe(1);
        expect(data.buckets.get(5)).toBe(2);
        expect(data.buckets.get(10)).toBe(3);
      });

      it('should provide startTimer helper', () => {
        jest.useFakeTimers();
        
        const histogram = registry.histogram('test_duration', 'Test duration', [0.1, 0.5, 1]);
        const stopTimer = histogram.startTimer({ endpoint: '/test' });

        jest.advanceTimersByTime(500);
        stopTimer();

        const json = registry.toJSON();
        const data = json.histograms.test_duration['endpoint="/test"'];
        expect(data.count).toBe(1);
        expect(data.sum).toBeCloseTo(0.5, 1);

        jest.useRealTimers();
      });
    });

    describe('export', () => {
      it('should export metrics in Prometheus format', () => {
        const counter = registry.counter('test_requests', 'Total requests');
        counter.inc({ status: '200' }, 10);

        const output = registry.export();

        expect(output).toContain('# HELP test_requests Total requests');
        expect(output).toContain('# TYPE test_requests counter');
        expect(output).toContain('test_requests{status="200"} 10');
      });

      it('should export gauges', () => {
        const gauge = registry.gauge('active_connections', 'Active connections');
        gauge.set({}, 5);

        const output = registry.export();

        expect(output).toContain('# TYPE active_connections gauge');
        expect(output).toContain('active_connections 5');
      });

      it('should export histograms with buckets', () => {
        const histogram = registry.histogram('request_duration', 'Request duration', [0.1, 1, 10]);
        histogram.observe({}, 0.5);

        const output = registry.export();

        expect(output).toContain('# TYPE request_duration histogram');
        expect(output).toContain('request_duration_bucket{le="0.1"}');
        expect(output).toContain('request_duration_bucket{le="1"}');
        expect(output).toContain('request_duration_bucket{le="+Inf"}');
        expect(output).toContain('request_duration_sum');
        expect(output).toContain('request_duration_count');
      });
    });

    describe('toJSON', () => {
      it('should return metrics as JSON', () => {
        const counter = registry.counter('test', 'Test');
        counter.inc({}, 1);

        const json = registry.toJSON();

        expect(json).toHaveProperty('counters');
        expect(json).toHaveProperty('gauges');
        expect(json).toHaveProperty('histograms');
      });
    });

    describe('reset', () => {
      it('should reset all metrics', () => {
        const counter = registry.counter('test', 'Test');
        counter.inc({}, 10);

        registry.reset();

        const json = registry.toJSON();
        expect(json.counters.test).toEqual({});
      });
    });
  });

  describe('Compliance-specific metrics', () => {
    it('should have form1099Generated counter', () => {
      expect(form1099Generated).toBeDefined();
    });

    it('should have form1099Amount histogram', () => {
      expect(form1099Amount).toBeDefined();
    });

    it('should have ofacScreenings counter', () => {
      expect(ofacScreenings).toBeDefined();
    });

    it('should have ofacScreeningDuration histogram', () => {
      expect(ofacScreeningDuration).toBeDefined();
    });

    it('should have riskAssessments counter', () => {
      expect(riskAssessments).toBeDefined();
    });

    it('should have verifications counter', () => {
      expect(verifications).toBeDefined();
    });

    it('should have gdprRequests counter', () => {
      expect(gdprRequests).toBeDefined();
    });

    it('should have pendingVerifications gauge', () => {
      expect(pendingVerifications).toBeDefined();
    });

    it('should have circuitBreakerState gauge', () => {
      expect(circuitBreakerState).toBeDefined();
    });
  });

  describe('record1099Generation', () => {
    it('should increment 1099 counter', () => {
      record1099Generation('success', 2024);

      const json = registry.toJSON();
      expect(json.counters.compliance_1099_generated_total['status="success",year="2024"']).toBe(1);
    });

    it('should record amount in histogram', () => {
      record1099Generation('success', 2024, 5000);

      const json = registry.toJSON();
      const histogram = json.histograms.compliance_1099_amount_dollars;
      expect(histogram['year="2024"'].count).toBe(1);
      expect(histogram['year="2024"'].sum).toBe(5000);
    });

    it('should not record amount if not provided', () => {
      record1099Generation('failure', 2024);

      const json = registry.toJSON();
      expect(json.histograms.compliance_1099_amount_dollars['year="2024"']).toBeUndefined();
    });
  });

  describe('recordOFACScreening', () => {
    it('should record screening result and duration', () => {
      recordOFACScreening('clear', 'individual', 1.5);

      const json = registry.toJSON();
      expect(json.counters.compliance_ofac_screenings_total['result="clear",type="individual"']).toBe(1);
      expect(json.histograms.compliance_ofac_screening_duration_seconds['type="individual"'].sum).toBe(1.5);
    });

    it('should record match severity when provided', () => {
      recordOFACScreening('match', 'entity', 2.0, 'high');

      const json = registry.toJSON();
      expect(json.counters.compliance_ofac_matches_total['severity="high"']).toBe(1);
    });

    it('should not record severity for non-matches', () => {
      recordOFACScreening('clear', 'individual', 1.0, 'high');

      const json = registry.toJSON();
      expect(json.counters.compliance_ofac_matches_total['severity="high"']).toBeUndefined();
    });
  });

  describe('recordRiskAssessment', () => {
    it('should record risk level and score', () => {
      recordRiskAssessment('high', 85, 'transaction');

      const json = registry.toJSON();
      expect(json.counters.compliance_risk_assessments_total['level="high"']).toBe(1);
      expect(json.histograms.compliance_risk_score['type="transaction"'].sum).toBe(85);
    });
  });

  describe('recordVerification', () => {
    it('should record verification status', () => {
      recordVerification('identity', 'approved');

      const json = registry.toJSON();
      expect(json.counters.compliance_verifications_total['type="identity",status="approved"']).toBe(1);
    });

    it('should record duration when provided', () => {
      recordVerification('bank', 'pending', 30);

      const json = registry.toJSON();
      expect(json.histograms.compliance_verification_duration_seconds['type="bank"'].sum).toBe(30);
    });
  });

  describe('metricsHandler', () => {
    it('should set content type header and send metrics', () => {
      const mockReply = {
        header: jest.fn<(name: string, value: string) => any>().mockReturnThis(),
        send: jest.fn<(body: string) => void>()
      };

      metricsHandler({}, mockReply);

      expect(mockReply.header).toHaveBeenCalledWith('Content-Type', 'text/plain; charset=utf-8');
      expect(mockReply.send).toHaveBeenCalledWith(expect.any(String));
    });
  });

  describe('incrementMetric', () => {
    it('should create and increment counter', () => {
      incrementMetric('custom_counter', { action: 'test' });

      const json = registry.toJSON();
      expect(json.counters.custom_counter['action="test"']).toBe(1);
    });

    it('should increment by custom value', () => {
      incrementMetric('custom_counter', {}, 5);

      const json = registry.toJSON();
      expect(json.counters.custom_counter['']).toBe(5);
    });
  });

  describe('setGauge', () => {
    it('should create and set gauge', () => {
      setGauge('custom_gauge', 42, { type: 'test' });

      const json = registry.toJSON();
      expect(json.gauges.custom_gauge['type="test"']).toBe(42);
    });
  });

  describe('default export', () => {
    it('should export all components', async () => {
      const module = await import('../../../src/utils/metrics');

      expect(module.default).toHaveProperty('registry');
      expect(module.default).toHaveProperty('form1099Generated');
      expect(module.default).toHaveProperty('ofacScreenings');
      expect(module.default).toHaveProperty('record1099Generation');
      expect(module.default).toHaveProperty('recordOFACScreening');
      expect(module.default).toHaveProperty('recordRiskAssessment');
      expect(module.default).toHaveProperty('recordVerification');
      expect(module.default).toHaveProperty('metricsHandler');
    });
  });
});
