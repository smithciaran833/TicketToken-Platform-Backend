describe('Config - Workers Configuration', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    jest.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const getModule = () => {
    return require('../../../src/config/workers.config');
  };

  describe('WORKER_CONFIGS structure', () => {
    it('should be defined', () => {
      const { WORKER_CONFIGS } = getModule();
      expect(WORKER_CONFIGS).toBeDefined();
    });

    it('should have all worker configurations', () => {
      const { WORKER_CONFIGS } = getModule();
      expect(WORKER_CONFIGS['payment.process']).toBeDefined();
      expect(WORKER_CONFIGS['payment.retry']).toBeDefined();
      expect(WORKER_CONFIGS['order.fulfill']).toBeDefined();
      expect(WORKER_CONFIGS['ticket.mint']).toBeDefined();
      expect(WORKER_CONFIGS['email.send']).toBeDefined();
      expect(WORKER_CONFIGS['webhook.process']).toBeDefined();
    });

    it('should have exactly 6 worker configurations', () => {
      const { WORKER_CONFIGS } = getModule();
      expect(Object.keys(WORKER_CONFIGS)).toHaveLength(6);
    });

    it('should have required properties for all workers', () => {
      const { WORKER_CONFIGS } = getModule();
      Object.values(WORKER_CONFIGS).forEach((config: any) => {
        expect(config).toHaveProperty('name');
        expect(config).toHaveProperty('concurrency');
        expect(config).toHaveProperty('maxStalledCount');
        expect(config).toHaveProperty('stalledInterval');
      });
    });

    it('should have exactly 4 properties per worker', () => {
      const { WORKER_CONFIGS } = getModule();
      Object.values(WORKER_CONFIGS).forEach((config: any) => {
        expect(Object.keys(config)).toHaveLength(4);
      });
    });
  });

  describe('Payment process worker', () => {
    it('should have correct name', () => {
      const { WORKER_CONFIGS } = getModule();
      expect(WORKER_CONFIGS['payment.process'].name).toBe('payment-processor');
    });

    it('should have concurrency of 5', () => {
      const { WORKER_CONFIGS } = getModule();
      expect(WORKER_CONFIGS['payment.process'].concurrency).toBe(5);
    });

    it('should have maxStalledCount of 3', () => {
      const { WORKER_CONFIGS } = getModule();
      expect(WORKER_CONFIGS['payment.process'].maxStalledCount).toBe(3);
    });

    it('should have stalledInterval of 30000ms (30 seconds)', () => {
      const { WORKER_CONFIGS } = getModule();
      expect(WORKER_CONFIGS['payment.process'].stalledInterval).toBe(30000);
    });

    it('should have all numeric values', () => {
      const { WORKER_CONFIGS } = getModule();
      expect(typeof WORKER_CONFIGS['payment.process'].concurrency).toBe('number');
      expect(typeof WORKER_CONFIGS['payment.process'].maxStalledCount).toBe('number');
      expect(typeof WORKER_CONFIGS['payment.process'].stalledInterval).toBe('number');
    });
  });

  describe('Payment retry worker', () => {
    it('should have correct name', () => {
      const { WORKER_CONFIGS } = getModule();
      expect(WORKER_CONFIGS['payment.retry'].name).toBe('payment-retry');
    });

    it('should have concurrency of 3', () => {
      const { WORKER_CONFIGS } = getModule();
      expect(WORKER_CONFIGS['payment.retry'].concurrency).toBe(3);
    });

    it('should have maxStalledCount of 2', () => {
      const { WORKER_CONFIGS } = getModule();
      expect(WORKER_CONFIGS['payment.retry'].maxStalledCount).toBe(2);
    });

    it('should have stalledInterval of 60000ms (1 minute)', () => {
      const { WORKER_CONFIGS } = getModule();
      expect(WORKER_CONFIGS['payment.retry'].stalledInterval).toBe(60000);
    });
  });

  describe('Order fulfill worker', () => {
    it('should have correct name', () => {
      const { WORKER_CONFIGS } = getModule();
      expect(WORKER_CONFIGS['order.fulfill'].name).toBe('order-fulfillment');
    });

    it('should have concurrency of 10', () => {
      const { WORKER_CONFIGS } = getModule();
      expect(WORKER_CONFIGS['order.fulfill'].concurrency).toBe(10);
    });

    it('should have maxStalledCount of 3', () => {
      const { WORKER_CONFIGS } = getModule();
      expect(WORKER_CONFIGS['order.fulfill'].maxStalledCount).toBe(3);
    });

    it('should have stalledInterval of 30000ms', () => {
      const { WORKER_CONFIGS } = getModule();
      expect(WORKER_CONFIGS['order.fulfill'].stalledInterval).toBe(30000);
    });
  });

  describe('Ticket mint worker', () => {
    it('should have correct name', () => {
      const { WORKER_CONFIGS } = getModule();
      expect(WORKER_CONFIGS['ticket.mint'].name).toBe('ticket-minting');
    });

    it('should have concurrency of 3', () => {
      const { WORKER_CONFIGS } = getModule();
      expect(WORKER_CONFIGS['ticket.mint'].concurrency).toBe(3);
    });

    it('should have maxStalledCount of 1', () => {
      const { WORKER_CONFIGS } = getModule();
      expect(WORKER_CONFIGS['ticket.mint'].maxStalledCount).toBe(1);
    });

    it('should have stalledInterval of 120000ms (2 minutes)', () => {
      const { WORKER_CONFIGS } = getModule();
      expect(WORKER_CONFIGS['ticket.mint'].stalledInterval).toBe(120000);
    });

    it('should have longest stalled interval (most expensive operation)', () => {
      const { WORKER_CONFIGS } = getModule();
      const allIntervals = Object.values(WORKER_CONFIGS).map((c: any) => c.stalledInterval);
      const maxInterval = Math.max(...allIntervals);
      expect(WORKER_CONFIGS['ticket.mint'].stalledInterval).toBe(maxInterval);
    });
  });

  describe('Email send worker', () => {
    it('should have correct name', () => {
      const { WORKER_CONFIGS } = getModule();
      expect(WORKER_CONFIGS['email.send'].name).toBe('email-sender');
    });

    it('should have concurrency of 20', () => {
      const { WORKER_CONFIGS } = getModule();
      expect(WORKER_CONFIGS['email.send'].concurrency).toBe(20);
    });

    it('should have maxStalledCount of 5', () => {
      const { WORKER_CONFIGS } = getModule();
      expect(WORKER_CONFIGS['email.send'].maxStalledCount).toBe(5);
    });

    it('should have stalledInterval of 15000ms (15 seconds)', () => {
      const { WORKER_CONFIGS } = getModule();
      expect(WORKER_CONFIGS['email.send'].stalledInterval).toBe(15000);
    });

    it('should have highest concurrency (high volume)', () => {
      const { WORKER_CONFIGS } = getModule();
      const allConcurrency = Object.values(WORKER_CONFIGS).map((c: any) => c.concurrency);
      const maxConcurrency = Math.max(...allConcurrency);
      expect(WORKER_CONFIGS['email.send'].concurrency).toBe(maxConcurrency);
    });
  });

  describe('Webhook process worker', () => {
    it('should have correct name', () => {
      const { WORKER_CONFIGS } = getModule();
      expect(WORKER_CONFIGS['webhook.process'].name).toBe('webhook-processor');
    });

    it('should have concurrency of 10', () => {
      const { WORKER_CONFIGS } = getModule();
      expect(WORKER_CONFIGS['webhook.process'].concurrency).toBe(10);
    });

    it('should have maxStalledCount of 3', () => {
      const { WORKER_CONFIGS } = getModule();
      expect(WORKER_CONFIGS['webhook.process'].maxStalledCount).toBe(3);
    });

    it('should have stalledInterval of 30000ms', () => {
      const { WORKER_CONFIGS } = getModule();
      expect(WORKER_CONFIGS['webhook.process'].stalledInterval).toBe(30000);
    });
  });

  describe('Configuration patterns', () => {
    it('should have all positive concurrency values', () => {
      const { WORKER_CONFIGS } = getModule();
      Object.values(WORKER_CONFIGS).forEach((config: any) => {
        expect(config.concurrency).toBeGreaterThan(0);
      });
    });

    it('should have all positive maxStalledCount values', () => {
      const { WORKER_CONFIGS } = getModule();
      Object.values(WORKER_CONFIGS).forEach((config: any) => {
        expect(config.maxStalledCount).toBeGreaterThan(0);
      });
    });

    it('should have all positive stalledInterval values', () => {
      const { WORKER_CONFIGS } = getModule();
      Object.values(WORKER_CONFIGS).forEach((config: any) => {
        expect(config.stalledInterval).toBeGreaterThan(0);
      });
    });

    it('should have all integer values', () => {
      const { WORKER_CONFIGS } = getModule();
      Object.values(WORKER_CONFIGS).forEach((config: any) => {
        expect(Number.isInteger(config.concurrency)).toBe(true);
        expect(Number.isInteger(config.maxStalledCount)).toBe(true);
        expect(Number.isInteger(config.stalledInterval)).toBe(true);
      });
    });

    it('should have string names', () => {
      const { WORKER_CONFIGS } = getModule();
      Object.values(WORKER_CONFIGS).forEach((config: any) => {
        expect(typeof config.name).toBe('string');
        expect(config.name.length).toBeGreaterThan(0);
      });
    });

    it('should have kebab-case worker names', () => {
      const { WORKER_CONFIGS } = getModule();
      Object.values(WORKER_CONFIGS).forEach((config: any) => {
        expect(config.name).toMatch(/^[a-z]+(-[a-z]+)*$/);
      });
    });

    it('should have dot-notation queue keys', () => {
      const { WORKER_CONFIGS } = getModule();
      Object.keys(WORKER_CONFIGS).forEach(key => {
        expect(key).toMatch(/^[a-z]+\.[a-z]+$/);
      });
    });

    it('should have stalledInterval in milliseconds (>= 1000)', () => {
      const { WORKER_CONFIGS } = getModule();
      Object.values(WORKER_CONFIGS).forEach((config: any) => {
        expect(config.stalledInterval).toBeGreaterThanOrEqual(1000);
      });
    });
  });

  describe('getWorkerConfig function', () => {
    it('should be defined', () => {
      const { getWorkerConfig } = getModule();
      expect(getWorkerConfig).toBeDefined();
      expect(typeof getWorkerConfig).toBe('function');
    });

    it('should return config for known queue', () => {
      const { getWorkerConfig, WORKER_CONFIGS } = getModule();
      const config = getWorkerConfig('payment.process');
      expect(config).toEqual(WORKER_CONFIGS['payment.process']);
    });

    it('should return config for all known queues', () => {
      const { getWorkerConfig, WORKER_CONFIGS } = getModule();
      Object.keys(WORKER_CONFIGS).forEach(queueName => {
        const config = getWorkerConfig(queueName);
        expect(config).toEqual(WORKER_CONFIGS[queueName]);
      });
    });

    it('should return default config for unknown queue', () => {
      const { getWorkerConfig } = getModule();
      const config = getWorkerConfig('unknown.queue');
      expect(config.name).toBe('default-worker');
      expect(config.concurrency).toBe(5);
      expect(config.maxStalledCount).toBe(3);
      expect(config.stalledInterval).toBe(30000);
    });

    it('should return default config for empty string', () => {
      const { getWorkerConfig } = getModule();
      const config = getWorkerConfig('');
      expect(config.name).toBe('default-worker');
    });

    it('should return consistent default config', () => {
      const { getWorkerConfig } = getModule();
      const config1 = getWorkerConfig('unknown1');
      const config2 = getWorkerConfig('unknown2');
      expect(config1).toEqual(config2);
    });

    it('should handle case-sensitive queue names', () => {
      const { getWorkerConfig } = getModule();
      const config = getWorkerConfig('Payment.Process');
      expect(config.name).toBe('default-worker');
    });

    it('should return same reference for known queues', () => {
      const { getWorkerConfig, WORKER_CONFIGS } = getModule();
      const config = getWorkerConfig('payment.process');
      expect(config).toBe(WORKER_CONFIGS['payment.process']);
    });

    it('should return new object for default config', () => {
      const { getWorkerConfig } = getModule();
      const config1 = getWorkerConfig('unknown1');
      const config2 = getWorkerConfig('unknown2');
      expect(config1).not.toBe(config2);
      expect(config1).toEqual(config2);
    });
  });

  describe('Concurrency patterns', () => {
    it('should have lower concurrency for expensive operations', () => {
      const { WORKER_CONFIGS } = getModule();
      expect(WORKER_CONFIGS['ticket.mint'].concurrency).toBeLessThan(WORKER_CONFIGS['email.send'].concurrency);
    });

    it('should have higher concurrency for communication operations', () => {
      const { WORKER_CONFIGS } = getModule();
      expect(WORKER_CONFIGS['email.send'].concurrency).toBeGreaterThan(WORKER_CONFIGS['payment.process'].concurrency);
    });

    it('should have moderate concurrency for payment operations', () => {
      const { WORKER_CONFIGS } = getModule();
      expect(WORKER_CONFIGS['payment.process'].concurrency).toBeGreaterThanOrEqual(3);
      expect(WORKER_CONFIGS['payment.process'].concurrency).toBeLessThanOrEqual(10);
    });
  });

  describe('Module exports', () => {
    it('should export WORKER_CONFIGS', () => {
      const module = getModule();
      expect(module).toHaveProperty('WORKER_CONFIGS');
    });

    it('should export getWorkerConfig', () => {
      const module = getModule();
      expect(module).toHaveProperty('getWorkerConfig');
    });
  });
});
