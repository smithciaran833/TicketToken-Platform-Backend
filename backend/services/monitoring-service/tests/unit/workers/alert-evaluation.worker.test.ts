// Mock dependencies BEFORE imports
jest.mock('../../../src/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('../../../src/alerting/rules/rule.engine');
jest.mock('../../../src/alerting/alert.manager');

import { AlertEvaluationWorker } from '../../../src/workers/alert-evaluation.worker';
import { RuleEngine } from '../../../src/alerting/rules/rule.engine';
import { AlertManager } from '../../../src/alerting/alert.manager';
import { logger } from '../../../src/logger';

describe('AlertEvaluationWorker', () => {
  let worker: AlertEvaluationWorker;
  let mockRuleEngine: jest.Mocked<RuleEngine>;
  let mockAlertManager: jest.Mocked<AlertManager>;

  const createMockRule = (overrides = {}) => ({
    id: 'rule-123',
    name: 'Test Rule',
    description: 'A test rule',
    condition: '>',
    threshold: 80,
    severity: 'warning' as const,
    channels: ['email', 'slack'],
    enabled: true,
    cooldownMinutes: 5,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockRuleEngine = {
      getAllRules: jest.fn().mockReturnValue([]),
      getRule: jest.fn(),
      addRule: jest.fn(),
      removeRule: jest.fn(),
    } as any;

    mockAlertManager = {
      sendNotification: jest.fn().mockResolvedValue(undefined),
      processAlert: jest.fn().mockResolvedValue(undefined),
    } as any;

    (RuleEngine as jest.Mock).mockImplementation(() => mockRuleEngine);
    (AlertManager as jest.Mock).mockImplementation(() => mockAlertManager);

    worker = new AlertEvaluationWorker();
  });

  afterEach(async () => {
    await worker.stop();
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize RuleEngine', () => {
      expect(RuleEngine).toHaveBeenCalledTimes(1);
    });

    it('should initialize AlertManager', () => {
      expect(AlertManager).toHaveBeenCalledTimes(1);
    });
  });

  describe('start', () => {
    it('should log starting message', async () => {
      await worker.start();

      expect(logger.info).toHaveBeenCalledWith('Starting Alert Evaluation Worker...');
    });

    it('should run initial evaluation immediately', async () => {
      mockRuleEngine.getAllRules.mockReturnValue([createMockRule()]);

      await worker.start();

      expect(mockRuleEngine.getAllRules).toHaveBeenCalled();
    });

    it('should log success message after starting', async () => {
      await worker.start();

      expect(logger.info).toHaveBeenCalledWith('Alert Evaluation Worker started successfully');
    });

    it('should set up interval for periodic evaluation', async () => {
      await worker.start();

      expect(jest.getTimerCount()).toBe(1);
    });

    it('should evaluate rules every 60 seconds', async () => {
      mockRuleEngine.getAllRules.mockReturnValue([createMockRule()]);

      await worker.start();
      jest.clearAllMocks();

      // Advance 60 seconds
      jest.advanceTimersByTime(60000);

      // Wait for async evaluation
      await Promise.resolve();

      expect(mockRuleEngine.getAllRules).toHaveBeenCalled();
    });

    it('should handle evaluation errors without crashing', async () => {
      mockRuleEngine.getAllRules.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      await expect(worker.start()).rejects.toThrow('Database connection failed');

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to start Alert Evaluation Worker:',
        expect.any(Error)
      );
    });

    it('should log error if evaluation cycle fails', async () => {
      await worker.start();

      mockRuleEngine.getAllRules.mockImplementation(() => {
        throw new Error('Evaluation error');
      });

      // Advance to next evaluation cycle
      jest.advanceTimersByTime(60000);
      await Promise.resolve();

      expect(logger.error).toHaveBeenCalledWith(
        'Alert evaluation cycle failed:',
        expect.any(Error)
      );
    });
  });

  describe('evaluate', () => {
    it('should get all rules from rule engine', async () => {
      mockRuleEngine.getAllRules.mockReturnValue([]);

      await worker.start();

      expect(mockRuleEngine.getAllRules).toHaveBeenCalled();
    });

    it('should log number of rules being evaluated', async () => {
      const rules = [
        createMockRule({ id: 'rule-1' }),
        createMockRule({ id: 'rule-2' }),
        createMockRule({ id: 'rule-3' }),
      ];
      mockRuleEngine.getAllRules.mockReturnValue(rules);

      await worker.start();

      expect(logger.debug).toHaveBeenCalledWith('Evaluating 3 alert rules...');
    });

    it('should log evaluation for each rule', async () => {
      const rules = [
        createMockRule({ id: 'rule-1', name: 'CPU Alert' }),
        createMockRule({ id: 'rule-2', name: 'Memory Alert' }),
      ];
      mockRuleEngine.getAllRules.mockReturnValue(rules);

      await worker.start();

      expect(logger.debug).toHaveBeenCalledWith('Evaluating rule: CPU Alert');
      expect(logger.debug).toHaveBeenCalledWith('Evaluating rule: Memory Alert');
    });

    it('should handle empty rules array', async () => {
      mockRuleEngine.getAllRules.mockReturnValue([]);

      await worker.start();

      expect(logger.debug).toHaveBeenCalledWith('Evaluating 0 alert rules...');
    });

    it('should continue evaluating other rules if one fails', async () => {
      const rules = [
        createMockRule({ id: 'rule-1', name: 'Rule 1' }),
        createMockRule({ id: 'rule-2', name: 'Rule 2' }),
      ];
      mockRuleEngine.getAllRules.mockReturnValue(rules);

      // Make first rule evaluation fail by throwing when logging
      let callCount = 0;
      (logger.debug as jest.Mock).mockImplementation((msg: string) => {
        if (msg === 'Evaluating rule: Rule 1') {
          callCount++;
          if (callCount === 1) {
            throw new Error('Rule 1 failed');
          }
        }
      });

      await worker.start();

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to evaluate rule rule-1:',
        expect.any(Error)
      );
    });

    it('should throw error if getAllRules fails', async () => {
      mockRuleEngine.getAllRules.mockImplementation(() => {
        throw new Error('Database error');
      });

      await expect(worker.start()).rejects.toThrow('Database error');
    });
  });

  describe('stop', () => {
    it('should clear the interval', async () => {
      await worker.start();

      expect(jest.getTimerCount()).toBe(1);

      await worker.stop();

      expect(jest.getTimerCount()).toBe(0);
    });

    it('should log stopped message', async () => {
      await worker.start();
      jest.clearAllMocks();

      await worker.stop();

      expect(logger.info).toHaveBeenCalledWith('Alert Evaluation Worker stopped');
    });

    it('should handle stop when not started', async () => {
      await worker.stop();

      expect(logger.info).toHaveBeenCalledWith('Alert Evaluation Worker stopped');
    });

    it('should be idempotent (multiple stops)', async () => {
      await worker.start();

      await worker.stop();
      await worker.stop();
      await worker.stop();

      expect(logger.info).toHaveBeenCalledWith('Alert Evaluation Worker stopped');
    });
  });

  describe('cooldown logic', () => {
    it('should initialize with empty cooldowns map', () => {
      // Access private property for testing - worker was created in beforeEach
      expect((worker as any).cooldowns).toBeDefined();
      expect((worker as any).cooldowns.size).toBe(0);
    });

    it('should track cooldowns correctly via isInCooldown', () => {
      // Test private method indirectly
      const isInCooldown = (worker as any).isInCooldown.bind(worker);

      // Should return false for rule not in cooldown
      expect(isInCooldown('rule-123', 5)).toBe(false);
    });

    it('should record cooldown and respect it', () => {
      const isInCooldown = (worker as any).isInCooldown.bind(worker);
      const recordCooldown = (worker as any).recordCooldown.bind(worker);

      // Record cooldown
      recordCooldown('rule-123', 5);

      // Should be in cooldown immediately after
      expect(isInCooldown('rule-123', 5)).toBe(true);
    });

    it('should clear cooldown after expiration', () => {
      const isInCooldown = (worker as any).isInCooldown.bind(worker);
      const recordCooldown = (worker as any).recordCooldown.bind(worker);

      recordCooldown('rule-123', 5);
      expect(isInCooldown('rule-123', 5)).toBe(true);

      // Advance past cooldown period (5 minutes)
      jest.advanceTimersByTime(5 * 60 * 1000 + 1);

      // Cooldown should be cleared
      expect(isInCooldown('rule-123', 5)).toBe(false);
    });

    it('should handle multiple rules with different cooldowns', () => {
      const isInCooldown = (worker as any).isInCooldown.bind(worker);
      const recordCooldown = (worker as any).recordCooldown.bind(worker);

      recordCooldown('rule-1', 5);
      recordCooldown('rule-2', 10);

      expect(isInCooldown('rule-1', 5)).toBe(true);
      expect(isInCooldown('rule-2', 10)).toBe(true);

      // Advance 6 minutes - rule-1 should expire, rule-2 should not
      jest.advanceTimersByTime(6 * 60 * 1000);

      expect(isInCooldown('rule-1', 5)).toBe(false);
      expect(isInCooldown('rule-2', 10)).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle very large number of rules', async () => {
      const rules = Array.from({ length: 1000 }, (_, i) =>
        createMockRule({ id: `rule-${i}`, name: `Rule ${i}` })
      );
      mockRuleEngine.getAllRules.mockReturnValue(rules);

      await worker.start();

      expect(logger.debug).toHaveBeenCalledWith('Evaluating 1000 alert rules...');
    });

    it('should handle rules with special characters in names', async () => {
      const rules = [
        createMockRule({ id: 'rule-1', name: 'CPU > 80% Alert' }),
        createMockRule({ id: 'rule-2', name: 'Memory: Critical!' }),
      ];
      mockRuleEngine.getAllRules.mockReturnValue(rules);

      await worker.start();

      expect(logger.debug).toHaveBeenCalledWith('Evaluating rule: CPU > 80% Alert');
      expect(logger.debug).toHaveBeenCalledWith('Evaluating rule: Memory: Critical!');
    });

    it('should handle restart after stop', async () => {
      await worker.start();
      await worker.stop();

      jest.clearAllMocks();

      await worker.start();

      expect(logger.info).toHaveBeenCalledWith('Starting Alert Evaluation Worker...');
      expect(logger.info).toHaveBeenCalledWith('Alert Evaluation Worker started successfully');
    });
  });
});
