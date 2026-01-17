// Mock queue definitions
jest.mock('../../../src/queues/definitions/money.queue', () => ({
  MoneyQueue: jest.fn(),
}));

jest.mock('../../../src/queues/definitions/communication.queue', () => ({
  CommunicationQueue: jest.fn(),
}));

jest.mock('../../../src/queues/definitions/background.queue', () => ({
  BackgroundQueue: jest.fn(),
}));

import { QueueRegistry } from '../../../src/services/queue-registry.service';

describe('QueueRegistry', () => {
  let mockMoneyQueue: any;
  let mockCommunicationQueue: any;
  let mockBackgroundQueue: any;

  beforeEach(() => {
    // Reset singleton between tests
    (QueueRegistry as any).instance = null;

    mockMoneyQueue = {
      name: 'money',
      add: jest.fn(),
      process: jest.fn(),
    };

    mockCommunicationQueue = {
      name: 'communication',
      add: jest.fn(),
      process: jest.fn(),
    };

    mockBackgroundQueue = {
      name: 'background',
      add: jest.fn(),
      process: jest.fn(),
    };
  });

  describe('Singleton Pattern', () => {
    it('should return same instance', () => {
      const instance1 = QueueRegistry.getInstance();
      const instance2 = QueueRegistry.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should create instance only once', () => {
      const instance1 = QueueRegistry.getInstance();
      const instance2 = QueueRegistry.getInstance();
      const instance3 = QueueRegistry.getInstance();

      expect(instance1).toBe(instance2);
      expect(instance2).toBe(instance3);
    });
  });

  describe('initialize', () => {
    it('should initialize all queues', () => {
      const registry = QueueRegistry.getInstance();

      registry.initialize(
        mockMoneyQueue,
        mockCommunicationQueue,
        mockBackgroundQueue
      );

      expect(() => registry.getMoneyQueue()).not.toThrow();
      expect(() => registry.getCommunicationQueue()).not.toThrow();
      expect(() => registry.getBackgroundQueue()).not.toThrow();
    });

    it('should allow re-initialization', () => {
      const registry = QueueRegistry.getInstance();

      registry.initialize(
        mockMoneyQueue,
        mockCommunicationQueue,
        mockBackgroundQueue
      );

      const newMoneyQueue = { name: 'money-new' };
      const newCommunicationQueue = { name: 'communication-new' };
      const newBackgroundQueue = { name: 'background-new' };

      registry.initialize(
        newMoneyQueue as any,
        newCommunicationQueue as any,
        newBackgroundQueue as any
      );

      expect(registry.getMoneyQueue()).toBe(newMoneyQueue);
      expect(registry.getCommunicationQueue()).toBe(newCommunicationQueue);
      expect(registry.getBackgroundQueue()).toBe(newBackgroundQueue);
    });
  });

  describe('getMoneyQueue', () => {
    it('should return money queue after initialization', () => {
      const registry = QueueRegistry.getInstance();
      registry.initialize(
        mockMoneyQueue,
        mockCommunicationQueue,
        mockBackgroundQueue
      );

      const queue = registry.getMoneyQueue();

      expect(queue).toBe(mockMoneyQueue);
    });

    it('should throw error if not initialized', () => {
      const registry = QueueRegistry.getInstance();

      expect(() => registry.getMoneyQueue()).toThrow('Money queue not initialized');
    });

    it('should return correct queue instance', () => {
      const registry = QueueRegistry.getInstance();
      registry.initialize(
        mockMoneyQueue,
        mockCommunicationQueue,
        mockBackgroundQueue
      );

      const queue = registry.getMoneyQueue();

      expect(queue.name).toBe('money');
    });
  });

  describe('getCommunicationQueue', () => {
    it('should return communication queue after initialization', () => {
      const registry = QueueRegistry.getInstance();
      registry.initialize(
        mockMoneyQueue,
        mockCommunicationQueue,
        mockBackgroundQueue
      );

      const queue = registry.getCommunicationQueue();

      expect(queue).toBe(mockCommunicationQueue);
    });

    it('should throw error if not initialized', () => {
      const registry = QueueRegistry.getInstance();

      expect(() => registry.getCommunicationQueue()).toThrow(
        'Communication queue not initialized'
      );
    });

    it('should return correct queue instance', () => {
      const registry = QueueRegistry.getInstance();
      registry.initialize(
        mockMoneyQueue,
        mockCommunicationQueue,
        mockBackgroundQueue
      );

      const queue = registry.getCommunicationQueue();

      expect(queue.name).toBe('communication');
    });
  });

  describe('getBackgroundQueue', () => {
    it('should return background queue after initialization', () => {
      const registry = QueueRegistry.getInstance();
      registry.initialize(
        mockMoneyQueue,
        mockCommunicationQueue,
        mockBackgroundQueue
      );

      const queue = registry.getBackgroundQueue();

      expect(queue).toBe(mockBackgroundQueue);
    });

    it('should throw error if not initialized', () => {
      const registry = QueueRegistry.getInstance();

      expect(() => registry.getBackgroundQueue()).toThrow(
        'Background queue not initialized'
      );
    });

    it('should return correct queue instance', () => {
      const registry = QueueRegistry.getInstance();
      registry.initialize(
        mockMoneyQueue,
        mockCommunicationQueue,
        mockBackgroundQueue
      );

      const queue = registry.getBackgroundQueue();

      expect(queue.name).toBe('background');
    });
  });

  describe('Error Handling', () => {
    it('should throw specific error for each uninitialized queue', () => {
      const registry = QueueRegistry.getInstance();

      expect(() => registry.getMoneyQueue()).toThrow('Money queue not initialized');
      expect(() => registry.getCommunicationQueue()).toThrow(
        'Communication queue not initialized'
      );
      expect(() => registry.getBackgroundQueue()).toThrow(
        'Background queue not initialized'
      );
    });

    it('should allow partial initialization and fail appropriately', () => {
      const registry = QueueRegistry.getInstance();
      
      // Manually set only money queue for this test
      (registry as any).moneyQueue = mockMoneyQueue;

      expect(() => registry.getMoneyQueue()).not.toThrow();
      expect(() => registry.getCommunicationQueue()).toThrow();
      expect(() => registry.getBackgroundQueue()).toThrow();
    });
  });

  describe('Multiple Access', () => {
    it('should return same queue instance on multiple calls', () => {
      const registry = QueueRegistry.getInstance();
      registry.initialize(
        mockMoneyQueue,
        mockCommunicationQueue,
        mockBackgroundQueue
      );

      const queue1 = registry.getMoneyQueue();
      const queue2 = registry.getMoneyQueue();
      const queue3 = registry.getMoneyQueue();

      expect(queue1).toBe(queue2);
      expect(queue2).toBe(queue3);
    });

    it('should maintain separate queue instances', () => {
      const registry = QueueRegistry.getInstance();
      registry.initialize(
        mockMoneyQueue,
        mockCommunicationQueue,
        mockBackgroundQueue
      );

      const moneyQueue = registry.getMoneyQueue();
      const commQueue = registry.getCommunicationQueue();
      const bgQueue = registry.getBackgroundQueue();

      expect(moneyQueue).not.toBe(commQueue);
      expect(commQueue).not.toBe(bgQueue);
      expect(bgQueue).not.toBe(moneyQueue);
    });
  });
});
