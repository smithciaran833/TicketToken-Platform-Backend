import { defaultAlertRules } from '../../../src/alerting/default-rules';

describe('Default Alert Rules', () => {
  describe('structure validation', () => {
    it('should export an array of rules', () => {
      expect(Array.isArray(defaultAlertRules)).toBe(true);
      expect(defaultAlertRules.length).toBeGreaterThan(0);
    });

    it('should have all required fields for each rule', () => {
      const requiredFields = [
        'name',
        'metric',
        'condition',
        'threshold',
        'severity',
        'for_duration',
        'annotations',
      ];

      defaultAlertRules.forEach((rule, index) => {
        requiredFields.forEach(field => {
          expect(rule).toHaveProperty(field);
        });
      });
    });

    it('should have valid annotations with summary and description', () => {
      defaultAlertRules.forEach(rule => {
        expect(rule.annotations).toHaveProperty('summary');
        expect(rule.annotations).toHaveProperty('description');
        expect(typeof rule.annotations.summary).toBe('string');
        expect(typeof rule.annotations.description).toBe('string');
      });
    });

    it('should have valid condition operators', () => {
      const validConditions = ['>', '<', '==', '>=', '<=', '!='];

      defaultAlertRules.forEach(rule => {
        expect(validConditions).toContain(rule.condition);
      });
    });

    it('should have valid severity levels', () => {
      const validSeverities = ['info', 'warning', 'error', 'critical'];

      defaultAlertRules.forEach(rule => {
        expect(validSeverities).toContain(rule.severity);
      });
    });

    it('should have positive threshold values', () => {
      defaultAlertRules.forEach(rule => {
        expect(rule.threshold).toBeGreaterThanOrEqual(0);
      });
    });

    it('should have positive for_duration values', () => {
      defaultAlertRules.forEach(rule => {
        expect(rule.for_duration).toBeGreaterThan(0);
      });
    });

    it('should have unique rule names', () => {
      const names = defaultAlertRules.map(rule => rule.name);
      const uniqueNames = new Set(names);

      expect(uniqueNames.size).toBe(names.length);
    });
  });

  describe('high_cpu_usage rule', () => {
    const rule = defaultAlertRules.find(r => r.name === 'high_cpu_usage');

    it('should exist', () => {
      expect(rule).toBeDefined();
    });

    it('should monitor system_cpu_usage_percent metric', () => {
      expect(rule?.metric).toBe('system_cpu_usage_percent');
    });

    it('should trigger when CPU > 80%', () => {
      expect(rule?.condition).toBe('>');
      expect(rule?.threshold).toBe(80);
    });

    it('should be warning severity', () => {
      expect(rule?.severity).toBe('warning');
    });

    it('should have 5 minute duration (300 seconds)', () => {
      expect(rule?.for_duration).toBe(300);
    });
  });

  describe('high_memory_usage rule', () => {
    const rule = defaultAlertRules.find(r => r.name === 'high_memory_usage');

    it('should exist', () => {
      expect(rule).toBeDefined();
    });

    it('should monitor system_memory_usage_percent metric', () => {
      expect(rule?.metric).toBe('system_memory_usage_percent');
    });

    it('should trigger when memory > 90%', () => {
      expect(rule?.condition).toBe('>');
      expect(rule?.threshold).toBe(90);
    });

    it('should be warning severity', () => {
      expect(rule?.severity).toBe('warning');
    });

    it('should have 5 minute duration', () => {
      expect(rule?.for_duration).toBe(300);
    });
  });

  describe('service_down rule', () => {
    const rule = defaultAlertRules.find(r => r.name === 'service_down');

    it('should exist', () => {
      expect(rule).toBeDefined();
    });

    it('should monitor service_up metric', () => {
      expect(rule?.metric).toBe('service_up');
    });

    it('should trigger when service_up == 0', () => {
      expect(rule?.condition).toBe('==');
      expect(rule?.threshold).toBe(0);
    });

    it('should be critical severity', () => {
      expect(rule?.severity).toBe('critical');
    });

    it('should have 1 minute duration (60 seconds)', () => {
      expect(rule?.for_duration).toBe(60);
    });
  });

  describe('high_response_time rule', () => {
    const rule = defaultAlertRules.find(r => r.name === 'high_response_time');

    it('should exist', () => {
      expect(rule).toBeDefined();
    });

    it('should monitor http_response_time_ms metric', () => {
      expect(rule?.metric).toBe('http_response_time_ms');
    });

    it('should trigger when response time > 1000ms', () => {
      expect(rule?.condition).toBe('>');
      expect(rule?.threshold).toBe(1000);
    });

    it('should be warning severity', () => {
      expect(rule?.severity).toBe('warning');
    });

    it('should have 3 minute duration (180 seconds)', () => {
      expect(rule?.for_duration).toBe(180);
    });
  });

  describe('database_connection_pool_exhausted rule', () => {
    const rule = defaultAlertRules.find(r => r.name === 'database_connection_pool_exhausted');

    it('should exist', () => {
      expect(rule).toBeDefined();
    });

    it('should monitor postgres_pool_waiting metric', () => {
      expect(rule?.metric).toBe('postgres_pool_waiting');
    });

    it('should trigger when waiting connections > 5', () => {
      expect(rule?.condition).toBe('>');
      expect(rule?.threshold).toBe(5);
    });

    it('should be critical severity', () => {
      expect(rule?.severity).toBe('critical');
    });

    it('should have 1 minute duration', () => {
      expect(rule?.for_duration).toBe(60);
    });
  });

  describe('rule thresholds sanity checks', () => {
    it('should have reasonable CPU threshold (between 50-95)', () => {
      const rule = defaultAlertRules.find(r => r.name === 'high_cpu_usage');
      expect(rule?.threshold).toBeGreaterThanOrEqual(50);
      expect(rule?.threshold).toBeLessThanOrEqual(95);
    });

    it('should have reasonable memory threshold (between 70-99)', () => {
      const rule = defaultAlertRules.find(r => r.name === 'high_memory_usage');
      expect(rule?.threshold).toBeGreaterThanOrEqual(70);
      expect(rule?.threshold).toBeLessThanOrEqual(99);
    });

    it('should have reasonable response time threshold (between 500-5000ms)', () => {
      const rule = defaultAlertRules.find(r => r.name === 'high_response_time');
      expect(rule?.threshold).toBeGreaterThanOrEqual(500);
      expect(rule?.threshold).toBeLessThanOrEqual(5000);
    });
  });
});
