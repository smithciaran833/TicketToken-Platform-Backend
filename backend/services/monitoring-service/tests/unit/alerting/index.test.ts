import { logger } from '../../../src/logger';

jest.mock('../../../src/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

// We need to mock these BEFORE importing the index module
jest.mock('../../../src/alerting/alert.manager');
jest.mock('../../../src/alerting/rules/rule.engine');
jest.mock('../../../src/alerting/channels/notification.manager');

describe('Alerting Module', () => {
  // Store original module state
  let originalModule: any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initializeAlerting', () => {
    beforeEach(() => {
      // Reset module registry to get fresh state
      jest.resetModules();

      // Re-apply mocks after reset
      jest.doMock('../../../src/logger', () => ({
        logger: {
          info: jest.fn(),
          error: jest.fn(),
          debug: jest.fn(),
          warn: jest.fn(),
        },
      }));

      jest.doMock('../../../src/alerting/alert.manager', () => ({
        AlertManager: jest.fn().mockImplementation(() => ({
          processAlert: jest.fn(),
          sendNotification: jest.fn(),
        })),
      }));

      jest.doMock('../../../src/alerting/rules/rule.engine', () => ({
        RuleEngine: jest.fn().mockImplementation(() => ({
          getRule: jest.fn(),
          addRule: jest.fn(),
          removeRule: jest.fn(),
          getAllRules: jest.fn(),
        })),
      }));

      jest.doMock('../../../src/alerting/channels/notification.manager', () => ({
        NotificationManager: jest.fn().mockImplementation(() => ({
          send: jest.fn(),
        })),
      }));
    });

    it('should log initialization start', () => {
      const { logger } = require('../../../src/logger');
      const { initializeAlerting } = require('../../../src/alerting/index');

      initializeAlerting();

      expect(logger.info).toHaveBeenCalledWith('Initializing alerting system');
    });

    it('should create NotificationManager instance', () => {
      const { NotificationManager } = require('../../../src/alerting/channels/notification.manager');
      const { initializeAlerting } = require('../../../src/alerting/index');

      initializeAlerting();

      expect(NotificationManager).toHaveBeenCalledTimes(1);
    });

    it('should create RuleEngine instance', () => {
      const { RuleEngine } = require('../../../src/alerting/rules/rule.engine');
      const { initializeAlerting } = require('../../../src/alerting/index');

      initializeAlerting();

      expect(RuleEngine).toHaveBeenCalledTimes(1);
    });

    it('should create AlertManager instance', () => {
      const { AlertManager } = require('../../../src/alerting/alert.manager');
      const { initializeAlerting } = require('../../../src/alerting/index');

      initializeAlerting();

      expect(AlertManager).toHaveBeenCalledTimes(1);
    });

    it('should log success message after initialization', () => {
      const { logger } = require('../../../src/logger');
      const { initializeAlerting } = require('../../../src/alerting/index');

      initializeAlerting();

      expect(logger.info).toHaveBeenCalledWith('Alerting system initialized successfully');
    });

    it('should throw and log error when initialization fails', () => {
      jest.resetModules();

      const error = new Error('Initialization failed');

      jest.doMock('../../../src/logger', () => ({
        logger: {
          info: jest.fn(),
          error: jest.fn(),
          debug: jest.fn(),
          warn: jest.fn(),
        },
      }));

      jest.doMock('../../../src/alerting/channels/notification.manager', () => ({
        NotificationManager: jest.fn().mockImplementation(() => {
          throw error;
        }),
      }));

      jest.doMock('../../../src/alerting/alert.manager', () => ({
        AlertManager: jest.fn(),
      }));

      jest.doMock('../../../src/alerting/rules/rule.engine', () => ({
        RuleEngine: jest.fn(),
      }));

      const { logger } = require('../../../src/logger');
      const { initializeAlerting } = require('../../../src/alerting/index');

      expect(() => initializeAlerting()).toThrow('Initialization failed');
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to initialize alerting system:',
        error
      );
    });
  });

  describe('evaluateRules', () => {
    it('should throw error when alerting system not initialized', async () => {
      jest.resetModules();

      jest.doMock('../../../src/logger', () => ({
        logger: {
          info: jest.fn(),
          error: jest.fn(),
          debug: jest.fn(),
          warn: jest.fn(),
        },
      }));

      jest.doMock('../../../src/alerting/alert.manager', () => ({
        AlertManager: jest.fn(),
      }));

      jest.doMock('../../../src/alerting/rules/rule.engine', () => ({
        RuleEngine: jest.fn(),
      }));

      jest.doMock('../../../src/alerting/channels/notification.manager', () => ({
        NotificationManager: jest.fn(),
      }));

      const { evaluateRules } = require('../../../src/alerting/index');

      await expect(evaluateRules()).rejects.toThrow('Alerting system not initialized');
    });

    it('should log debug message when evaluating rules', async () => {
      jest.resetModules();

      jest.doMock('../../../src/logger', () => ({
        logger: {
          info: jest.fn(),
          error: jest.fn(),
          debug: jest.fn(),
          warn: jest.fn(),
        },
      }));

      jest.doMock('../../../src/alerting/alert.manager', () => ({
        AlertManager: jest.fn().mockImplementation(() => ({})),
      }));

      jest.doMock('../../../src/alerting/rules/rule.engine', () => ({
        RuleEngine: jest.fn().mockImplementation(() => ({})),
      }));

      jest.doMock('../../../src/alerting/channels/notification.manager', () => ({
        NotificationManager: jest.fn().mockImplementation(() => ({})),
      }));

      const { logger } = require('../../../src/logger');
      const { initializeAlerting, evaluateRules } = require('../../../src/alerting/index');

      initializeAlerting();
      await evaluateRules();

      expect(logger.debug).toHaveBeenCalledWith('Evaluating alert rules');
    });

    it('should not throw when system is initialized', async () => {
      jest.resetModules();

      jest.doMock('../../../src/logger', () => ({
        logger: {
          info: jest.fn(),
          error: jest.fn(),
          debug: jest.fn(),
          warn: jest.fn(),
        },
      }));

      jest.doMock('../../../src/alerting/alert.manager', () => ({
        AlertManager: jest.fn().mockImplementation(() => ({})),
      }));

      jest.doMock('../../../src/alerting/rules/rule.engine', () => ({
        RuleEngine: jest.fn().mockImplementation(() => ({})),
      }));

      jest.doMock('../../../src/alerting/channels/notification.manager', () => ({
        NotificationManager: jest.fn().mockImplementation(() => ({})),
      }));

      const { initializeAlerting, evaluateRules } = require('../../../src/alerting/index');

      initializeAlerting();

      await expect(evaluateRules()).resolves.not.toThrow();
    });
  });

  describe('getAlertManager', () => {
    it('should throw error when alerting system not initialized', () => {
      jest.resetModules();

      jest.doMock('../../../src/logger', () => ({
        logger: {
          info: jest.fn(),
          error: jest.fn(),
          debug: jest.fn(),
          warn: jest.fn(),
        },
      }));

      jest.doMock('../../../src/alerting/alert.manager', () => ({
        AlertManager: jest.fn(),
      }));

      jest.doMock('../../../src/alerting/rules/rule.engine', () => ({
        RuleEngine: jest.fn(),
      }));

      jest.doMock('../../../src/alerting/channels/notification.manager', () => ({
        NotificationManager: jest.fn(),
      }));

      const { getAlertManager } = require('../../../src/alerting/index');

      expect(() => getAlertManager()).toThrow('Alerting system not initialized');
    });

    it('should return AlertManager instance after initialization', () => {
      jest.resetModules();

      const mockAlertManagerInstance = {
        processAlert: jest.fn(),
        sendNotification: jest.fn(),
      };

      jest.doMock('../../../src/logger', () => ({
        logger: {
          info: jest.fn(),
          error: jest.fn(),
          debug: jest.fn(),
          warn: jest.fn(),
        },
      }));

      jest.doMock('../../../src/alerting/alert.manager', () => ({
        AlertManager: jest.fn().mockImplementation(() => mockAlertManagerInstance),
      }));

      jest.doMock('../../../src/alerting/rules/rule.engine', () => ({
        RuleEngine: jest.fn().mockImplementation(() => ({})),
      }));

      jest.doMock('../../../src/alerting/channels/notification.manager', () => ({
        NotificationManager: jest.fn().mockImplementation(() => ({})),
      }));

      const { initializeAlerting, getAlertManager } = require('../../../src/alerting/index');

      initializeAlerting();
      const result = getAlertManager();

      expect(result).toBe(mockAlertManagerInstance);
    });
  });

  describe('getRuleEngine', () => {
    it('should throw error when alerting system not initialized', () => {
      jest.resetModules();

      jest.doMock('../../../src/logger', () => ({
        logger: {
          info: jest.fn(),
          error: jest.fn(),
          debug: jest.fn(),
          warn: jest.fn(),
        },
      }));

      jest.doMock('../../../src/alerting/alert.manager', () => ({
        AlertManager: jest.fn(),
      }));

      jest.doMock('../../../src/alerting/rules/rule.engine', () => ({
        RuleEngine: jest.fn(),
      }));

      jest.doMock('../../../src/alerting/channels/notification.manager', () => ({
        NotificationManager: jest.fn(),
      }));

      const { getRuleEngine } = require('../../../src/alerting/index');

      expect(() => getRuleEngine()).toThrow('Alerting system not initialized');
    });

    it('should return RuleEngine instance after initialization', () => {
      jest.resetModules();

      const mockRuleEngineInstance = {
        getRule: jest.fn(),
        addRule: jest.fn(),
        removeRule: jest.fn(),
        getAllRules: jest.fn(),
      };

      jest.doMock('../../../src/logger', () => ({
        logger: {
          info: jest.fn(),
          error: jest.fn(),
          debug: jest.fn(),
          warn: jest.fn(),
        },
      }));

      jest.doMock('../../../src/alerting/alert.manager', () => ({
        AlertManager: jest.fn().mockImplementation(() => ({})),
      }));

      jest.doMock('../../../src/alerting/rules/rule.engine', () => ({
        RuleEngine: jest.fn().mockImplementation(() => mockRuleEngineInstance),
      }));

      jest.doMock('../../../src/alerting/channels/notification.manager', () => ({
        NotificationManager: jest.fn().mockImplementation(() => ({})),
      }));

      const { initializeAlerting, getRuleEngine } = require('../../../src/alerting/index');

      initializeAlerting();
      const result = getRuleEngine();

      expect(result).toBe(mockRuleEngineInstance);
    });
  });

  describe('initialization order', () => {
    beforeEach(() => {
      jest.resetModules();

      jest.doMock('../../../src/logger', () => ({
        logger: {
          info: jest.fn(),
          error: jest.fn(),
          debug: jest.fn(),
          warn: jest.fn(),
        },
      }));

      jest.doMock('../../../src/alerting/alert.manager', () => ({
        AlertManager: jest.fn().mockImplementation(() => ({
          processAlert: jest.fn(),
        })),
      }));

      jest.doMock('../../../src/alerting/rules/rule.engine', () => ({
        RuleEngine: jest.fn().mockImplementation(() => ({
          getRule: jest.fn(),
        })),
      }));

      jest.doMock('../../../src/alerting/channels/notification.manager', () => ({
        NotificationManager: jest.fn().mockImplementation(() => ({
          send: jest.fn(),
        })),
      }));
    });

    it('should allow getAlertManager after initializeAlerting', () => {
      const { initializeAlerting, getAlertManager } = require('../../../src/alerting/index');

      initializeAlerting();

      expect(() => getAlertManager()).not.toThrow();
    });

    it('should allow getRuleEngine after initializeAlerting', () => {
      const { initializeAlerting, getRuleEngine } = require('../../../src/alerting/index');

      initializeAlerting();

      expect(() => getRuleEngine()).not.toThrow();
    });

    it('should allow evaluateRules after initializeAlerting', async () => {
      const { initializeAlerting, evaluateRules } = require('../../../src/alerting/index');

      initializeAlerting();

      await expect(evaluateRules()).resolves.not.toThrow();
    });
  });
});
