import { RuleEngine } from '../../../src/alerting/rules/rule.engine';

describe('RuleEngine', () => {
  let engine: RuleEngine;

  beforeEach(() => {
    engine = new RuleEngine();
  });

  describe('loadRules', () => {
    it('should load default rules', () => {
      const rules = engine.getRules();
      
      expect(rules.length).toBeGreaterThan(0);
      expect(rules.some(r => r.id === 'high_response_time')).toBe(true);
      expect(rules.some(r => r.id === 'high_error_rate')).toBe(true);
    });
  });

  describe('addRule', () => {
    it('should add a new rule', () => {
      const rule = {
        id: 'test_rule',
        name: 'Test Rule',
        description: 'Test description',
        condition: 'metric > threshold',
        threshold: 100,
        severity: 'warning' as const,
        enabled: true,
      };

      engine.addRule(rule);
      const rules = engine.getRules();
      
      expect(rules.find(r => r.id === 'test_rule')).toEqual(rule);
    });

    it('should not add duplicate rule IDs', () => {
      const rule = {
        id: 'test_rule',
        name: 'Test Rule',
        description: 'Test',
        condition: 'test',
        threshold: 100,
        severity: 'warning' as const,
        enabled: true,
      };

      engine.addRule(rule);
      const initialCount = engine.getRules().length;
      
      engine.addRule(rule);
      
      expect(engine.getRules().length).toBe(initialCount);
    });
  });

  describe('getEnabledRules', () => {
    it('should return only enabled rules', () => {
      engine.addRule({
        id: 'enabled_rule',
        name: 'Enabled',
        description: 'Test',
        condition: 'test',
        threshold: 100,
        severity: 'warning' as const,
        enabled: true,
      });

      engine.addRule({
        id: 'disabled_rule',
        name: 'Disabled',
        description: 'Test',
        condition: 'test',
        threshold: 100,
        severity: 'warning' as const,
        enabled: false,
      });

      const enabledRules = engine.getEnabledRules();
      
      expect(enabledRules.some(r => r.id === 'enabled_rule')).toBe(true);
      expect(enabledRules.some(r => r.id === 'disabled_rule')).toBe(false);
    });
  });

  describe('updateRule', () => {
    it('should update existing rule', () => {
      const ruleId = 'high_response_time';
      
      engine.updateRule(ruleId, { threshold: 5000 });
      
      const rule = engine.getRules().find(r => r.id === ruleId);
      expect(rule?.threshold).toBe(5000);
    });

    it('should not update non-existent rule', () => {
      const initialRules = engine.getRules();
      
      engine.updateRule('non_existent', { threshold: 5000 });
      
      expect(engine.getRules()).toEqual(initialRules);
    });
  });

  describe('deleteRule', () => {
    it('should delete existing rule', () => {
      const testRule = {
        id: 'test_delete',
        name: 'Test Delete',
        description: 'Test',
        condition: 'test',
        threshold: 100,
        severity: 'warning' as const,
        enabled: true,
      };
      
      engine.addRule(testRule);
      expect(engine.getRules().some(r => r.id === 'test_delete')).toBe(true);
      
      engine.deleteRule('test_delete');
      expect(engine.getRules().some(r => r.id === 'test_delete')).toBe(false);
    });
  });
});
