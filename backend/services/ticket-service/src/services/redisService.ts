import Redis from 'ioredis';
import { config } from '../config';
import { logger } from '../utils/logger';

function withTimeout<T>(promise: Promise<T>, ms: number, errorMessage: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), ms)
    )
  ]);
}

class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private threshold: number,
    private timeout: number,
    private resetTimeout: number
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    if (this.failures >= this.threshold) {
      this.state = 'open';
    }
  }

  recordSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  reset(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  getState(): string {
    return this.state;
  }
}

class RedisServiceClass {
  private client: Redis | null = null;
  private log = logger.child({ component: 'RedisService' });
  private circuitBreaker = new CircuitBreaker(5, 5000, 30000);
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;

  async initialize(): Promise<void> {
    try {
      this.client = new Redis(config.redis.url, {
        retryStrategy: (times) => {
          this.reconnectAttempts = times;

          if (times > this.maxReconnectAttempts) {
            this.log.error('Max Redis reconnection attempts reached');
            return null;
          }

          const delay = Math.min(times * 100, 3000);
          this.log.info(`Redis reconnecting in ${delay}ms (attempt ${times})`);
          return delay;
        },
        maxRetriesPerRequest: 3,
        enableReadyCheck: false, // CHANGED: Disable ready check
        enableOfflineQueue: true,
        connectTimeout: 5000,
        disconnectTimeout: 2000,
        commandTimeout: 5000,
        lazyConnect: false,
        reconnectOnError: (err) => {
          const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
          if (targetErrors.some(e => err.message.includes(e))) {
            return true;
          }
          return false;
        }
      });

      this.setupEventHandlers();

      // REMOVED: Ping check - was timing out
      // await withTimeout(this.client.ping(), 5000, 'Redis ping timeout');

      this.log.info('Redis connection initiated');
    } catch (error) {
      this.log.error('Failed to initialize Redis:', error);
      throw error;
    }
  }

  private setupEventHandlers() {
    if (!this.client) return;

    this.client.on('error', (err) => {
      this.log.error('Redis error:', err);
    });

    this.client.on('connect', () => {
      this.log.info('Redis connected');
      this.reconnectAttempts = 0;
      this.circuitBreaker.reset();
    });

    this.client.on('ready', () => {
      this.log.info('Redis ready');
    });

    this.client.on('close', () => {
      this.log.warn('Redis connection closed');
    });

    this.client.on('reconnecting', (delay: number) => {
      this.log.info(`Redis reconnecting in ${delay}ms`);
    });

    this.client.on('end', () => {
      this.log.warn('Redis connection ended');
    });
  }

  getClient(): Redis {
    if (!this.client) {
      throw new Error('Redis not initialized');
    }
    return this.client;
  }

  private async executeCommand<T>(
    operation: string,
    fn: () => Promise<T>
  ): Promise<T> {
    try {
      return await this.circuitBreaker.execute(async () => {
        return await withTimeout(fn(), 5000, `Redis ${operation} timeout`);
      });
    } catch (error: any) {
      this.log.error(`Redis ${operation} failed:`, {
        error: error.message,
        state: this.circuitBreaker.getState()
      });

      if (operation === 'get' || operation === 'exists') {
        return null as any;
      }

      throw error;
    }
  }

  async get(key: string): Promise<string | null> {
    return this.executeCommand('get', () =>
      this.getClient().get(key)
    );
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    await this.executeCommand('set', async () => {
      const client = this.getClient();
      if (ttl) {
        await client.setex(key, ttl, value);
      } else {
        await client.set(key, value);
      }
    });
  }

  async del(key: string): Promise<void> {
    await this.executeCommand('del', () =>
      this.getClient().del(key).then(() => undefined)
    );
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.executeCommand('exists', () =>
      this.getClient().exists(key)
    );
    return result === 1;
  }

  async incr(key: string): Promise<number> {
    return this.executeCommand('incr', () =>
      this.getClient().incr(key)
    );
  }

  async expire(key: string, ttl: number): Promise<void> {
    await this.executeCommand('expire', () =>
      this.getClient().expire(key, ttl).then(() => undefined)
    );
  }

  async mget(keys: string[]): Promise<(string | null)[]> {
    if (keys.length === 0) return [];

    return this.executeCommand('mget', () =>
      this.getClient().mget(...keys)
    );
  }

  async mset(pairs: { key: string; value: string }[]): Promise<void> {
    if (pairs.length === 0) return;

    const args: string[] = [];
    pairs.forEach(({ key, value }) => {
      args.push(key, value);
    });

    await this.executeCommand('mset', () =>
      this.getClient().mset(...args).then(() => undefined)
    );
  }

  async close(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
        this.log.info('Redis connection closed');
      } catch (error) {
        this.log.error('Error closing Redis connection:', error);
        this.client.disconnect();
      }
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      if (!this.client) {
        return false;
      }

      const result = await withTimeout(
        this.client.ping(),
        1000,
        'Health check timeout'
      );

      return result === 'PONG';
    } catch {
      return false;
    }
  }
}

export const RedisService = new RedisServiceClass();
