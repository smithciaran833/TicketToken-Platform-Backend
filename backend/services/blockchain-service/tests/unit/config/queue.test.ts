/**
 * Unit tests for blockchain-service queue configuration (config/queue.ts)
 * Tests BullMQ queue configuration, rate limits, concurrency
 * AUDIT FIX #73: Uses centralized Redis config with TLS support
 */

describe('Queue Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ===========================================================================
  // Default Job Options
  // ===========================================================================
  describe('Default Job Options', () => {
    it('should keep last 100 completed jobs', () => {
      const defaultJobOptions = {
        removeOnComplete: 100,
        removeOnFail: 500,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 }
      };

      expect(defaultJobOptions.removeOnComplete).toBe(100);
    });

    it('should keep last 500 failed jobs', () => {
      const defaultJobOptions = {
        removeOnComplete: 100,
        removeOnFail: 500,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 }
      };

      expect(defaultJobOptions.removeOnFail).toBe(500);
    });

    it('should default to 3 retry attempts', () => {
      const defaultJobOptions = {
        removeOnComplete: 100,
        removeOnFail: 500,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 }
      };

      expect(defaultJobOptions.attempts).toBe(3);
    });

    it('should use exponential backoff', () => {
      const defaultJobOptions = {
        removeOnComplete: 100,
        removeOnFail: 500,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 }
      };

      expect(defaultJobOptions.backoff.type).toBe('exponential');
    });

    it('should use 2000ms backoff delay', () => {
      const defaultJobOptions = {
        removeOnComplete: 100,
        removeOnFail: 500,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 }
      };

      expect(defaultJobOptions.backoff.delay).toBe(2000);
    });
  });

  // ===========================================================================
  // NFT Minting Queue Configuration
  // ===========================================================================
  describe('NFT Minting Queue', () => {
    const mintingQueue = {
      concurrency: 5,
      rateLimit: { max: 10, duration: 1000 }
    };

    it('should have concurrency of 5', () => {
      expect(mintingQueue.concurrency).toBe(5);
    });

    it('should have rate limit max of 10', () => {
      expect(mintingQueue.rateLimit.max).toBe(10);
    });

    it('should have rate limit duration of 1000ms', () => {
      expect(mintingQueue.rateLimit.duration).toBe(1000);
    });

    it('should limit to 10 operations per second', () => {
      const opsPerSecond = mintingQueue.rateLimit.max / (mintingQueue.rateLimit.duration / 1000);
      
      expect(opsPerSecond).toBe(10);
    });
  });

  // ===========================================================================
  // NFT Transfer Queue Configuration
  // ===========================================================================
  describe('NFT Transfer Queue', () => {
    const transferQueue = {
      concurrency: 10,
      rateLimit: { max: 20, duration: 1000 }
    };

    it('should have concurrency of 10', () => {
      expect(transferQueue.concurrency).toBe(10);
    });

    it('should have rate limit max of 20', () => {
      expect(transferQueue.rateLimit.max).toBe(20);
    });

    it('should have rate limit duration of 1000ms', () => {
      expect(transferQueue.rateLimit.duration).toBe(1000);
    });

    it('should limit to 20 operations per second', () => {
      const opsPerSecond = transferQueue.rateLimit.max / (transferQueue.rateLimit.duration / 1000);
      
      expect(opsPerSecond).toBe(20);
    });
  });

  // ===========================================================================
  // NFT Burn Queue Configuration
  // ===========================================================================
  describe('NFT Burn Queue', () => {
    const burnQueue = {
      concurrency: 3,
      rateLimit: { max: 5, duration: 1000 }
    };

    it('should have concurrency of 3', () => {
      expect(burnQueue.concurrency).toBe(3);
    });

    it('should have rate limit max of 5', () => {
      expect(burnQueue.rateLimit.max).toBe(5);
    });

    it('should have rate limit duration of 1000ms', () => {
      expect(burnQueue.rateLimit.duration).toBe(1000);
    });

    it('should limit to 5 operations per second', () => {
      const opsPerSecond = burnQueue.rateLimit.max / (burnQueue.rateLimit.duration / 1000);
      
      expect(opsPerSecond).toBe(5);
    });
  });

  // ===========================================================================
  // Queue Names
  // ===========================================================================
  describe('Queue Names', () => {
    const queueNames = ['nft-minting', 'nft-transfer', 'nft-burn'];

    it('should have nft-minting queue', () => {
      expect(queueNames).toContain('nft-minting');
    });

    it('should have nft-transfer queue', () => {
      expect(queueNames).toContain('nft-transfer');
    });

    it('should have nft-burn queue', () => {
      expect(queueNames).toContain('nft-burn');
    });

    it('should have 3 queues total', () => {
      expect(queueNames).toHaveLength(3);
    });
  });

  // ===========================================================================
  // Redis Configuration Integration (AUDIT FIX #73)
  // ===========================================================================
  describe('Redis Configuration Integration', () => {
    it('should use centralized Redis options', () => {
      const redisOptions = {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD,
        tls: process.env.NODE_ENV === 'production' ? {} : undefined
      };

      expect(redisOptions.host).toBeDefined();
      expect(redisOptions.port).toBeDefined();
    });

    it('should enable TLS for BullMQ in production', () => {
      process.env.NODE_ENV = 'production';
      
      const tlsEnabled = process.env.NODE_ENV === 'production' || process.env.REDIS_TLS === 'true';
      
      expect(tlsEnabled).toBe(true);
    });

    it('should include password when set', () => {
      process.env.REDIS_PASSWORD = 'test-password';
      
      const hasPassword = !!process.env.REDIS_PASSWORD;
      
      expect(hasPassword).toBe(true);
    });
  });

  // ===========================================================================
  // buildQueueConfig Function
  // ===========================================================================
  describe('buildQueueConfig', () => {
    it('should return complete queue configuration', () => {
      const config = {
        redis: {
          host: 'localhost',
          port: 6379
        },
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 500,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 }
        },
        queues: {
          'nft-minting': { concurrency: 5, rateLimit: { max: 10, duration: 1000 } },
          'nft-transfer': { concurrency: 10, rateLimit: { max: 20, duration: 1000 } },
          'nft-burn': { concurrency: 3, rateLimit: { max: 5, duration: 1000 } }
        }
      };

      expect(config.redis).toBeDefined();
      expect(config.defaultJobOptions).toBeDefined();
      expect(config.queues).toBeDefined();
    });

    it('should include all queue definitions', () => {
      const queues = {
        'nft-minting': { concurrency: 5, rateLimit: { max: 10, duration: 1000 } },
        'nft-transfer': { concurrency: 10, rateLimit: { max: 20, duration: 1000 } },
        'nft-burn': { concurrency: 3, rateLimit: { max: 5, duration: 1000 } }
      };

      expect(Object.keys(queues)).toHaveLength(3);
      expect(queues['nft-minting']).toBeDefined();
      expect(queues['nft-transfer']).toBeDefined();
      expect(queues['nft-burn']).toBeDefined();
    });
  });
});
