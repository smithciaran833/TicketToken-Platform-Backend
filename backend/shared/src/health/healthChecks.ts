import { Pool } from 'pg';
import Redis from 'ioredis';
import amqp from 'amqplib';

export interface HealthCheck {
  name: string;
  check: () => Promise<boolean>;
}

export const createDatabaseHealthCheck = (pool: Pool): HealthCheck => ({
  name: 'database',
  check: async () => {
    try {
      await pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
});

export const createRedisHealthCheck = (redis: Redis): HealthCheck => ({
  name: 'redis',
  check: async () => {
    try {
      await redis.ping();
      return true;
    } catch {
      return false;
    }
  }
});

export const createRabbitMQHealthCheck = (url: string): HealthCheck => ({
  name: 'rabbitmq',
  check: async () => {
    try {
      const conn = await amqp.connect(url);
      await conn.close();
      return true;
    } catch {
      return false;
    }
  }
});

export const runHealthChecks = async (checks: HealthCheck[]) => {
  const results = await Promise.all(
    checks.map(async (check) => ({
      name: check.name,
      healthy: await check.check()
    }))
  );
  
  return {
    healthy: results.every(r => r.healthy),
    checks: results
  };
};
