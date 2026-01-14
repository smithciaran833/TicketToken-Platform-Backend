/**
 * Unit Tests: Alerts Configuration
 *
 * Tests alert thresholds and metric evaluation
 */

import {
  alertsConfig,
  evaluateMetric,
  Alert,
  AlertLevel,
} from '../../../src/config/alerts.config';

describe('Alerts Configuration', () => {
  // ============================================
  // Configuration Values
  // ============================================
  describe('Configuration Values', () => {
    describe('Expiration Rate Thresholds', () => {
      it('should have warning threshold of 20%', () => {
        expect(alertsConfig.expirationRate.warning).toBe(20);
      });

      it('should have critical threshold of 40%', () => {
        expect(alertsConfig.expirationRate.critical).toBe(40);
      });
    });

    describe('Conversion Rate Thresholds', () => {
      it('should have warning threshold of 50%', () => {
        expect(alertsConfig.conversionRate.warning).toBe(50);
      });

      it('should have critical threshold of 30%', () => {
        expect(alertsConfig.conversionRate.critical).toBe(30);
      });
    });

    describe('Refund Rate Thresholds', () => {
      it('should have warning threshold of 5%', () => {
        expect(alertsConfig.refundRate.warning).toBe(5);
      });

      it('should have critical threshold of 10%', () => {
        expect(alertsConfig.refundRate.critical).toBe(10);
      });
    });

    describe('Fulfillment Time Thresholds', () => {
      it('should have warning threshold of 30 minutes', () => {
        expect(alertsConfig.fulfillmentTime.warning).toBe(30);
      });

      it('should have critical threshold of 60 minutes', () => {
        expect(alertsConfig.fulfillmentTime.critical).toBe(60);
      });
    });

    describe('DB Pool Usage Thresholds', () => {
      it('should have warning threshold of 70%', () => {
        expect(alertsConfig.dbPoolUsage.warning).toBe(70);
      });

      it('should have critical threshold of 90%', () => {
        expect(alertsConfig.dbPoolUsage.critical).toBe(90);
      });
    });

    describe('Redis Memory Usage Thresholds', () => {
      it('should have warning threshold of 75%', () => {
        expect(alertsConfig.redisMemoryUsage.warning).toBe(75);
      });

      it('should have critical threshold of 90%', () => {
        expect(alertsConfig.redisMemoryUsage.critical).toBe(90);
      });
    });

    describe('API Response Time Thresholds', () => {
      it('should have warning threshold of 1000ms', () => {
        expect(alertsConfig.apiResponseTime.warning).toBe(1000);
      });

      it('should have critical threshold of 3000ms', () => {
        expect(alertsConfig.apiResponseTime.critical).toBe(3000);
      });
    });

    describe('Error Rate Thresholds', () => {
      it('should have warning threshold of 1%', () => {
        expect(alertsConfig.errorRate.warning).toBe(1);
      });

      it('should have critical threshold of 5%', () => {
        expect(alertsConfig.errorRate.critical).toBe(5);
      });
    });
  });

  // ============================================
  // evaluateMetric - Higher is Worse (default)
  // ============================================
  describe('evaluateMetric - Higher is Worse', () => {
    const config = { warning: 50, critical: 80 };

    it('should return null when value is below warning', () => {
      const result = evaluateMetric('test-metric', 30, config);
      expect(result).toBeNull();
    });

    it('should return null when value equals warning (not exceeds)', () => {
      const result = evaluateMetric('test-metric', 50, config);
      expect(result).toBeNull();
    });

    it('should return warning when value exceeds warning but not critical', () => {
      const result = evaluateMetric('test-metric', 60, config);

      expect(result).not.toBeNull();
      expect(result!.level).toBe('warning');
      expect(result!.metric).toBe('test-metric');
      expect(result!.value).toBe(60);
      expect(result!.threshold).toBe(50);
    });

    it('should return critical when value exceeds critical', () => {
      const result = evaluateMetric('test-metric', 90, config);

      expect(result).not.toBeNull();
      expect(result!.level).toBe('critical');
      expect(result!.metric).toBe('test-metric');
      expect(result!.value).toBe(90);
      expect(result!.threshold).toBe(80);
    });

    it('should return critical when value equals critical + 1', () => {
      const result = evaluateMetric('test-metric', 81, config);
      expect(result!.level).toBe('critical');
    });

    it('should include timestamp in alert', () => {
      const before = new Date();
      const result = evaluateMetric('test-metric', 90, config);
      const after = new Date();

      expect(result!.timestamp).toBeInstanceOf(Date);
      expect(result!.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result!.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should include descriptive message', () => {
      const result = evaluateMetric('error-rate', 60, config);
      expect(result!.message).toContain('error-rate');
      expect(result!.message).toContain('60');
    });
  });

  // ============================================
  // evaluateMetric - Higher is Better
  // ============================================
  describe('evaluateMetric - Higher is Better', () => {
    const config = { warning: 50, critical: 30 };

    it('should return null when value is above warning', () => {
      const result = evaluateMetric('conversion-rate', 70, config, true);
      expect(result).toBeNull();
    });

    it('should return warning when value is below warning but above critical', () => {
      const result = evaluateMetric('conversion-rate', 40, config, true);

      expect(result).not.toBeNull();
      expect(result!.level).toBe('warning');
      expect(result!.value).toBe(40);
      expect(result!.threshold).toBe(50);
    });

    it('should return critical when value is below critical', () => {
      const result = evaluateMetric('conversion-rate', 20, config, true);

      expect(result).not.toBeNull();
      expect(result!.level).toBe('critical');
      expect(result!.value).toBe(20);
      expect(result!.threshold).toBe(30);
    });

    it('should return null when value exactly equals warning (not below)', () => {
      const result = evaluateMetric('conversion-rate', 50, config, true);
      expect(result).toBeNull();
    });

    it('should return warning when value is just below warning', () => {
      const result = evaluateMetric('conversion-rate', 49, config, true);
      expect(result!.level).toBe('warning');
    });

    it('should return critical when value is just below critical', () => {
      const result = evaluateMetric('conversion-rate', 29, config, true);
      expect(result!.level).toBe('critical');
    });
  });

  // ============================================
  // Real-world Scenarios
  // ============================================
  describe('Real-world Scenarios', () => {
    it('should detect high expiration rate warning', () => {
      const result = evaluateMetric(
        'order-expiration-rate',
        25, // 25% expiration rate
        alertsConfig.expirationRate
      );

      expect(result).not.toBeNull();
      expect(result!.level).toBe('warning');
    });

    it('should detect critical expiration rate', () => {
      const result = evaluateMetric(
        'order-expiration-rate',
        45, // 45% expiration rate
        alertsConfig.expirationRate
      );

      expect(result).not.toBeNull();
      expect(result!.level).toBe('critical');
    });

    it('should detect low conversion rate warning', () => {
      const result = evaluateMetric(
        'order-conversion-rate',
        45, // 45% conversion (below 50% warning)
        alertsConfig.conversionRate,
        true // Higher is better
      );

      expect(result).not.toBeNull();
      expect(result!.level).toBe('warning');
    });

    it('should detect critical low conversion rate', () => {
      const result = evaluateMetric(
        'order-conversion-rate',
        25, // 25% conversion (below 30% critical)
        alertsConfig.conversionRate,
        true
      );

      expect(result).not.toBeNull();
      expect(result!.level).toBe('critical');
    });

    it('should detect high error rate', () => {
      const result = evaluateMetric(
        'api-error-rate',
        3, // 3% error rate
        alertsConfig.errorRate
      );

      expect(result).not.toBeNull();
      expect(result!.level).toBe('warning');
    });

    it('should detect slow API response times', () => {
      const result = evaluateMetric(
        'api-response-time-p95',
        2500, // 2.5 seconds
        alertsConfig.apiResponseTime
      );

      expect(result).not.toBeNull();
      expect(result!.level).toBe('warning');
    });

    it('should detect critical API response times', () => {
      const result = evaluateMetric(
        'api-response-time-p95',
        5000, // 5 seconds
        alertsConfig.apiResponseTime
      );

      expect(result).not.toBeNull();
      expect(result!.level).toBe('critical');
    });

    it('should not alert for healthy metrics', () => {
      const expirationResult = evaluateMetric(
        'expiration-rate',
        5, // 5% - healthy
        alertsConfig.expirationRate
      );

      const conversionResult = evaluateMetric(
        'conversion-rate',
        75, // 75% - healthy
        alertsConfig.conversionRate,
        true
      );

      expect(expirationResult).toBeNull();
      expect(conversionResult).toBeNull();
    });
  });

  // ============================================
  // Edge Cases
  // ============================================
  describe('Edge Cases', () => {
    it('should handle zero value', () => {
      const result = evaluateMetric(
        'error-rate',
        0,
        { warning: 1, critical: 5 }
      );
      expect(result).toBeNull();
    });

    it('should handle negative values', () => {
      const result = evaluateMetric(
        'metric',
        -10,
        { warning: 50, critical: 80 }
      );
      expect(result).toBeNull();
    });

    it('should handle very large values', () => {
      const result = evaluateMetric(
        'metric',
        1000000,
        { warning: 50, critical: 80 }
      );
      expect(result!.level).toBe('critical');
    });

    it('should handle decimal values', () => {
      const result = evaluateMetric(
        'error-rate',
        1.5,
        { warning: 1, critical: 5 }
      );
      expect(result!.level).toBe('warning');
      expect(result!.value).toBe(1.5);
    });

    it('should handle equal warning and critical thresholds', () => {
      const result = evaluateMetric(
        'metric',
        60,
        { warning: 50, critical: 50 }
      );
      expect(result!.level).toBe('critical');
    });
  });

  // ============================================
  // Alert Structure
  // ============================================
  describe('Alert Structure', () => {
    it('should have correct alert structure', () => {
      const result = evaluateMetric(
        'test-metric',
        100,
        { warning: 50, critical: 80 }
      );

      expect(result).toMatchObject({
        level: expect.stringMatching(/^(info|warning|critical)$/),
        metric: expect.any(String),
        message: expect.any(String),
        value: expect.any(Number),
        threshold: expect.any(Number),
        timestamp: expect.any(Date),
      });
    });
  });
});
