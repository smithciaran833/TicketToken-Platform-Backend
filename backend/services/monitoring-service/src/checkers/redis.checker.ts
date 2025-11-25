import Redis from 'ioredis';
import { logger } from '../logger';

export class RedisHealthChecker {
  private client: Redis;

  constructor() {
    this.client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      connectTimeout: 5000,
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      lazyConnect: true,
    });
  }

  getName(): string {
    return 'RedisHealthChecker';
  }
  
  async check(): Promise<any> {
    const start = Date.now();
    
    try {
      // Ensure connection is established
      if (this.client.status !== 'ready') {
        await this.client.connect();
      }

      // Test Redis with PING command
      const pingResult = await this.client.ping();
      const latency = Date.now() - start;

      if (pingResult !== 'PONG') {
        return {
          status: 'unhealthy',
          error: 'Invalid PING response',
          response: pingResult,
          latency,
        };
      }

      // Get Redis info
      const info = await this.client.info('server');
      const memoryInfo = await this.client.info('memory');
      
      // Parse key metrics from info string
      const version = info.match(/redis_version:([^\r\n]+)/)?.[1];
      const uptime = info.match(/uptime_in_seconds:([^\r\n]+)/)?.[1];
      const usedMemory = memoryInfo.match(/used_memory_human:([^\r\n]+)/)?.[1];

      // Test SET/GET operations
      const testKey = '__health_check__';
      const testValue = Date.now().toString();
      await this.client.set(testKey, testValue, 'EX', 60);
      const getValue = await this.client.get(testKey);
      
      if (getValue !== testValue) {
        return {
          status: 'degraded',
          warning: 'SET/GET test failed',
          latency,
        };
      }

      // Clean up test key
      await this.client.del(testKey);

      return {
        status: latency < 500 ? 'healthy' : 'degraded',
        latency,
        version,
        uptime: uptime ? `${uptime}s` : 'unknown',
        memory: usedMemory || 'unknown',
        message: latency < 500 ? 'Redis responsive' : 'Redis slow',
      };
    } catch (error: any) {
      const latency = Date.now() - start;
      logger.error('Redis health check failed:', error);

      return {
        status: 'unhealthy',
        error: error.message,
        code: error.code,
        latency,
        message: 'Redis connection failed',
      };
    }
  }

  async close(): Promise<void> {
    await this.client.quit();
  }
}
