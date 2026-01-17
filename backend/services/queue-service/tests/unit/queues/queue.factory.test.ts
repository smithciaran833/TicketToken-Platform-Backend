// Mock logger BEFORE imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock PgBoss
const mockBossInstance = {
  on: jest.fn(),
  start: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn().mockResolvedValue(undefined),
};

jest.mock('pg-boss', () => {
  return jest.fn().mockImplementation(() => mockBossInstance);
});

// Mock PersistenceService
jest.mock('../../../src/services/persistence.service', () => ({
  PersistenceService: jest.fn().mockImplementation((tier) => ({
    tier,
    save: jest.fn(),
    get: jest.fn(),
  })),
}));

// Mock BullQueueAdapter
jest.mock('../../../src/adapters/bull-queue-adapter', () => ({
  BullQueueAdapter: jest.fn().mockImplementation((name) => ({
    name,
    add: jest.fn(),
    process: jest.fn(),
  })),
}));

jest.mock('../../../src/config/queues.config', () => ({
  QUEUE_CONFIGS: {
    MONEY_QUEUE: { retryLimit: 3 },
    COMMUNICATION_QUEUE: { retryLimit: 5 },
    BACKGROUND_QUEUE: { retryLimit: 2 },
  },
  PG_BOSS_CONFIG: {
    connectionString: 'postgres://test:test@localhost:5432/test',
    retryLimit: 3,
  },
}));

jest.mock('../../../src/config/constants', () => ({
  PERSISTENCE_TIERS: {
    TIER_1: 'tier1',
    TIER_2: 'tier2',
    TIER_3: 'tier3',
  },
}));

import PgBoss from 'pg-boss';
import { QueueFactory } from '../../../src/queues/factories/queue.factory';
import { PersistenceService } from '../../../src/services/persistence.service';
import { logger } from '../../../src/utils/logger';
import { PERSISTENCE_TIERS } from '../../../src/config/constants';

describe('QueueFactory', () => {
  beforeEach(async () => {
    // Reset the factory state between tests
    await QueueFactory.shutdown();
    jest.clearAllMocks();
  });

  describe('initialize', () => {
    it('should create a new PgBoss instance with config', async () => {
      await QueueFactory.initialize();

      expect(PgBoss).toHaveBeenCalledWith({
        connectionString: 'postgres://test:test@localhost:5432/test',
        retryLimit: 3,
      });
    });

    it('should register error event handler', async () => {
      await QueueFactory.initialize();

      expect(mockBossInstance.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should register maintenance event handler', async () => {
      await QueueFactory.initialize();

      expect(mockBossInstance.on).toHaveBeenCalledWith('maintenance', expect.any(Function));
    });

    it('should start pg-boss', async () => {
      await QueueFactory.initialize();

      expect(mockBossInstance.start).toHaveBeenCalledTimes(1);
    });

    it('should create persistence services for all tiers', async () => {
      await QueueFactory.initialize();

      expect(PersistenceService).toHaveBeenCalledWith(PERSISTENCE_TIERS.TIER_1);
      expect(PersistenceService).toHaveBeenCalledWith(PERSISTENCE_TIERS.TIER_2);
      expect(PersistenceService).toHaveBeenCalledWith(PERSISTENCE_TIERS.TIER_3);
    });

    it('should log initialization messages', async () => {
      await QueueFactory.initialize();

      expect(logger.info).toHaveBeenCalledWith('Initializing pg-boss queue system...');
      expect(logger.info).toHaveBeenCalledWith('✅ pg-boss started successfully');
      expect(logger.info).toHaveBeenCalledWith('✅ All queues initialized with pg-boss');
    });

    it('should only initialize once when called multiple times', async () => {
      await QueueFactory.initialize();
      await QueueFactory.initialize();
      await QueueFactory.initialize();

      expect(PgBoss).toHaveBeenCalledTimes(1);
      expect(mockBossInstance.start).toHaveBeenCalledTimes(1);
    });

    describe('error event handler', () => {
      it('should log errors from pg-boss', async () => {
        await QueueFactory.initialize();

        const errorHandler = mockBossInstance.on.mock.calls.find(
          (call: any[]) => call[0] === 'error'
        )[1];

        const testError = new Error('pg-boss connection lost');
        errorHandler(testError);

        expect(logger.error).toHaveBeenCalledWith('pg-boss error:', testError);
      });
    });

    describe('maintenance event handler', () => {
      it('should log maintenance events', async () => {
        await QueueFactory.initialize();

        const maintenanceHandler = mockBossInstance.on.mock.calls.find(
          (call: any[]) => call[0] === 'maintenance'
        )[1];

        maintenanceHandler();

        expect(logger.debug).toHaveBeenCalledWith('pg-boss maintenance running');
      });
    });
  });

  describe('getBoss', () => {
    it('should throw error when not initialized', () => {
      expect(() => QueueFactory.getBoss()).toThrow('pg-boss not initialized');
    });

    it('should return boss instance when initialized', async () => {
      await QueueFactory.initialize();

      const boss = QueueFactory.getBoss();

      expect(boss).toBe(mockBossInstance);
    });

    it('should return same instance on multiple calls', async () => {
      await QueueFactory.initialize();

      const boss1 = QueueFactory.getBoss();
      const boss2 = QueueFactory.getBoss();

      expect(boss1).toBe(boss2);
    });
  });

  describe('getPersistenceService', () => {
    it('should throw error for unknown queue type', async () => {
      await QueueFactory.initialize();

      expect(() => QueueFactory.getPersistenceService('unknown' as any)).toThrow(
        'No persistence service for queue type: unknown'
      );
    });

    it('should return persistence service for money queue', async () => {
      await QueueFactory.initialize();

      const service = QueueFactory.getPersistenceService('money');

      expect(service).toBeDefined();
      expect(service.tier).toBe(PERSISTENCE_TIERS.TIER_1);
    });

    it('should return persistence service for communication queue', async () => {
      await QueueFactory.initialize();

      const service = QueueFactory.getPersistenceService('communication');

      expect(service).toBeDefined();
      expect(service.tier).toBe(PERSISTENCE_TIERS.TIER_2);
    });

    it('should return persistence service for background queue', async () => {
      await QueueFactory.initialize();

      const service = QueueFactory.getPersistenceService('background');

      expect(service).toBeDefined();
      expect(service.tier).toBe(PERSISTENCE_TIERS.TIER_3);
    });
  });

  describe('getQueue', () => {
    it('should return a BullQueueAdapter with the given name', async () => {
      await QueueFactory.initialize();

      const { BullQueueAdapter } = require('../../../src/adapters/bull-queue-adapter');
      const queue = QueueFactory.getQueue('test-queue');

      expect(BullQueueAdapter).toHaveBeenCalledWith('test-queue');
      expect(queue.name).toBe('test-queue');
    });

    it('should create new adapter for each call', async () => {
      await QueueFactory.initialize();

      const { BullQueueAdapter } = require('../../../src/adapters/bull-queue-adapter');
      
      QueueFactory.getQueue('queue-1');
      QueueFactory.getQueue('queue-2');

      expect(BullQueueAdapter).toHaveBeenCalledWith('queue-1');
      expect(BullQueueAdapter).toHaveBeenCalledWith('queue-2');
    });
  });

  describe('shutdown', () => {
    it('should stop pg-boss when initialized', async () => {
      await QueueFactory.initialize();
      jest.clearAllMocks();

      await QueueFactory.shutdown();

      expect(mockBossInstance.stop).toHaveBeenCalledTimes(1);
    });

    it('should log shutdown messages', async () => {
      await QueueFactory.initialize();
      jest.clearAllMocks();

      await QueueFactory.shutdown();

      expect(logger.info).toHaveBeenCalledWith('Shutting down pg-boss...');
      expect(logger.info).toHaveBeenCalledWith('pg-boss stopped');
    });

    it('should clear persistence services', async () => {
      await QueueFactory.initialize();

      await QueueFactory.shutdown();

      expect(() => QueueFactory.getPersistenceService('money')).toThrow();
    });

    it('should allow re-initialization after shutdown', async () => {
      await QueueFactory.initialize();
      await QueueFactory.shutdown();

      jest.clearAllMocks();
      await QueueFactory.initialize();

      expect(PgBoss).toHaveBeenCalledTimes(1);
      expect(mockBossInstance.start).toHaveBeenCalledTimes(1);
    });

    it('should handle shutdown when not initialized', async () => {
      await expect(QueueFactory.shutdown()).resolves.not.toThrow();
    });

    it('should reset boss to null after shutdown', async () => {
      await QueueFactory.initialize();
      await QueueFactory.shutdown();

      expect(() => QueueFactory.getBoss()).toThrow('pg-boss not initialized');
    });
  });

  describe('getQueueMetrics', () => {
    it('should throw error when not initialized', async () => {
      await expect(QueueFactory.getQueueMetrics('test-queue')).rejects.toThrow(
        'pg-boss not initialized'
      );
    });

    it('should return metrics object with queue name', async () => {
      await QueueFactory.initialize();

      const metrics = await QueueFactory.getQueueMetrics('payment-queue');

      expect(metrics.name).toBe('payment-queue');
    });

    it('should return metrics with all expected fields', async () => {
      await QueueFactory.initialize();

      const metrics = await QueueFactory.getQueueMetrics('test-queue');

      expect(metrics).toEqual({
        name: 'test-queue',
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
      });
    });

    it('should return placeholder metrics for different queue names', async () => {
      await QueueFactory.initialize();

      const metrics1 = await QueueFactory.getQueueMetrics('money');
      const metrics2 = await QueueFactory.getQueueMetrics('communication');
      const metrics3 = await QueueFactory.getQueueMetrics('background');

      expect(metrics1.name).toBe('money');
      expect(metrics2.name).toBe('communication');
      expect(metrics3.name).toBe('background');
    });
  });
});
