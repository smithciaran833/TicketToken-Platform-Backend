import { RuleEngine } from '../../../../src/alerting/rules/rule.engine';

jest.mock('../../../../src/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

import { logger } from '../../../../src/logger';

describe('RuleEngine', () => {
  let ruleEngine: RuleEngine;

  const createMockRule = (overrides = {}) => ({
    id: 'rule-123',
    name: 'Test Rule',
    description: 'A test rule',
    condition: '>',
    threshold: 80,
    severity: 'warning' as const,
    channels: ['email', 'slack'],
    enabled: true,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    ruleEngine = new RuleEngine();
  });

  describe('constructor', () => {
    it('should log loading default rules', () => {
      expect(logger.info).toHaveBeenCalledWith('Loaded default alert rules');
    });

    it('should initialize with empty rules map', () => {
      const rules = ruleEngine.getAllRules();
      expect(rules).toEqual([]);
    });
  });

  describe('addRule', () => {
    it('should add a rule to the engine', () => {
      const rule = createMockRule();

      ruleEngine.addRule(rule);

      expect(ruleEngine.getRule('rule-123')).toEqual(rule);
    });

    it('should allow adding multiple rules', () => {
      const rule1 = createMockRule({ id: 'rule-1', name: 'Rule 1' });
      const rule2 = createMockRule({ id: 'rule-2', name: 'Rule 2' });
      const rule3 = createMockRule({ id: 'rule-3', name: 'Rule 3' });

      ruleEngine.addRule(rule1);
      ruleEngine.addRule(rule2);
      ruleEngine.addRule(rule3);

      expect(ruleEngine.getAllRules().length).toBe(3);
    });

    it('should overwrite existing rule with same id', () => {
      const originalRule = createMockRule({ id: 'rule-1', name: 'Original' });
      const updatedRule = createMockRule({ id: 'rule-1', name: 'Updated' });

      ruleEngine.addRule(originalRule);
      ruleEngine.addRule(updatedRule);

      expect(ruleEngine.getRule('rule-1')?.name).toBe('Updated');
      expect(ruleEngine.getAllRules().length).toBe(1);
    });

    it('should handle rules with all severity levels', () => {
      const severities: Array<'info' | 'warning' | 'error' | 'critical'> = [
        'info',
        'warning',
        'error',
        'critical',
      ];

      severities.forEach((severity, index) => {
        const rule = createMockRule({
          id: `rule-${index}`,
          severity,
        });
        ruleEngine.addRule(rule);
      });

      expect(ruleEngine.getAllRules().length).toBe(4);
    });
  });

  describe('getRule', () => {
    it('should return undefined for non-existent rule', () => {
      const result = ruleEngine.getRule('non-existent-rule');

      expect(result).toBeUndefined();
    });

    it('should return the correct rule by id', () => {
      const rule = createMockRule({ id: 'specific-rule' });
      ruleEngine.addRule(rule);

      const result = ruleEngine.getRule('specific-rule');

      expect(result).toEqual(rule);
    });

    it('should return exact rule object (not a copy)', () => {
      const rule = createMockRule();
      ruleEngine.addRule(rule);

      const result = ruleEngine.getRule('rule-123');

      expect(result).toBe(rule);
    });
  });

  describe('removeRule', () => {
    it('should return false when removing non-existent rule', () => {
      const result = ruleEngine.removeRule('non-existent');

      expect(result).toBe(false);
    });

    it('should return true when removing existing rule', () => {
      const rule = createMockRule();
      ruleEngine.addRule(rule);

      const result = ruleEngine.removeRule('rule-123');

      expect(result).toBe(true);
    });

    it('should actually remove the rule', () => {
      const rule = createMockRule();
      ruleEngine.addRule(rule);

      ruleEngine.removeRule('rule-123');

      expect(ruleEngine.getRule('rule-123')).toBeUndefined();
    });

    it('should not affect other rules when removing one', () => {
      const rule1 = createMockRule({ id: 'rule-1' });
      const rule2 = createMockRule({ id: 'rule-2' });
      const rule3 = createMockRule({ id: 'rule-3' });

      ruleEngine.addRule(rule1);
      ruleEngine.addRule(rule2);
      ruleEngine.addRule(rule3);

      ruleEngine.removeRule('rule-2');

      expect(ruleEngine.getRule('rule-1')).toBeDefined();
      expect(ruleEngine.getRule('rule-2')).toBeUndefined();
      expect(ruleEngine.getRule('rule-3')).toBeDefined();
      expect(ruleEngine.getAllRules().length).toBe(2);
    });

    it('should return false on second removal of same rule', () => {
      const rule = createMockRule();
      ruleEngine.addRule(rule);

      ruleEngine.removeRule('rule-123');
      const secondRemoval = ruleEngine.removeRule('rule-123');

      expect(secondRemoval).toBe(false);
    });
  });

  describe('getAllRules', () => {
    it('should return empty array when no rules exist', () => {
      const rules = ruleEngine.getAllRules();

      expect(rules).toEqual([]);
      expect(Array.isArray(rules)).toBe(true);
    });

    it('should return all added rules', () => {
      const rule1 = createMockRule({ id: 'rule-1', name: 'Rule 1' });
      const rule2 = createMockRule({ id: 'rule-2', name: 'Rule 2' });

      ruleEngine.addRule(rule1);
      ruleEngine.addRule(rule2);

      const rules = ruleEngine.getAllRules();

      expect(rules.length).toBe(2);
      expect(rules).toContainEqual(rule1);
      expect(rules).toContainEqual(rule2);
    });

    it('should return array (not map values iterator)', () => {
      const rule = createMockRule();
      ruleEngine.addRule(rule);

      const rules = ruleEngine.getAllRules();

      expect(Array.isArray(rules)).toBe(true);
    });

    it('should reflect changes after add/remove operations', () => {
      const rule1 = createMockRule({ id: 'rule-1' });
      const rule2 = createMockRule({ id: 'rule-2' });

      ruleEngine.addRule(rule1);
      expect(ruleEngine.getAllRules().length).toBe(1);

      ruleEngine.addRule(rule2);
      expect(ruleEngine.getAllRules().length).toBe(2);

      ruleEngine.removeRule('rule-1');
      expect(ruleEngine.getAllRules().length).toBe(1);

      ruleEngine.removeRule('rule-2');
      expect(ruleEngine.getAllRules().length).toBe(0);
    });
  });

  describe('rule structure validation', () => {
    it('should store rule with all properties intact', () => {
      const rule = {
        id: 'complete-rule',
        name: 'Complete Rule',
        description: 'A fully specified rule',
        condition: '>=',
        threshold: 95.5,
        severity: 'critical' as const,
        channels: ['email', 'slack', 'pagerduty'],
        enabled: false,
      };

      ruleEngine.addRule(rule);
      const retrieved = ruleEngine.getRule('complete-rule');

      expect(retrieved).toEqual(rule);
      expect(retrieved?.threshold).toBe(95.5);
      expect(retrieved?.channels).toEqual(['email', 'slack', 'pagerduty']);
      expect(retrieved?.enabled).toBe(false);
    });

    it('should handle rules with empty channels array', () => {
      const rule = createMockRule({ channels: [] });

      ruleEngine.addRule(rule);
      const retrieved = ruleEngine.getRule('rule-123');

      expect(retrieved?.channels).toEqual([]);
    });

    it('should handle rules with negative threshold', () => {
      const rule = createMockRule({ threshold: -10 });

      ruleEngine.addRule(rule);
      const retrieved = ruleEngine.getRule('rule-123');

      expect(retrieved?.threshold).toBe(-10);
    });

    it('should handle rules with zero threshold', () => {
      const rule = createMockRule({ threshold: 0 });

      ruleEngine.addRule(rule);
      const retrieved = ruleEngine.getRule('rule-123');

      expect(retrieved?.threshold).toBe(0);
    });

    it('should handle rules with special characters in id', () => {
      const rule = createMockRule({ id: 'rule-with_special.chars:123' });

      ruleEngine.addRule(rule);
      const retrieved = ruleEngine.getRule('rule-with_special.chars:123');

      expect(retrieved).toBeDefined();
    });
  });

  describe('concurrent operations', () => {
    it('should handle rapid add/remove operations', () => {
      for (let i = 0; i < 100; i++) {
        ruleEngine.addRule(createMockRule({ id: `rule-${i}` }));
      }

      expect(ruleEngine.getAllRules().length).toBe(100);

      for (let i = 0; i < 50; i++) {
        ruleEngine.removeRule(`rule-${i}`);
      }

      expect(ruleEngine.getAllRules().length).toBe(50);
    });

    it('should maintain consistency with interleaved operations', () => {
      ruleEngine.addRule(createMockRule({ id: 'rule-1' }));
      ruleEngine.addRule(createMockRule({ id: 'rule-2' }));
      ruleEngine.removeRule('rule-1');
      ruleEngine.addRule(createMockRule({ id: 'rule-3' }));
      ruleEngine.addRule(createMockRule({ id: 'rule-1' })); // Re-add rule-1
      ruleEngine.removeRule('rule-2');

      const rules = ruleEngine.getAllRules();
      const ruleIds = rules.map(r => r.id);

      expect(ruleIds).toContain('rule-1');
      expect(ruleIds).not.toContain('rule-2');
      expect(ruleIds).toContain('rule-3');
      expect(rules.length).toBe(2);
    });
  });
});
