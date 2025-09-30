import { query } from '../../config/database';
import { createClient } from 'redis';
import { config } from '../../config';

export class VelocityCheckerService {
  private redis: any;
  private isConnected: boolean = false;
  private connectionPromise: Promise<void> | null = null;

  constructor() {
    this.initRedis();
  }

  private initRedis() {
    this.connectionPromise = this.connectRedis();
  }

  private async connectRedis(): Promise<void> {
    this.redis = createClient({
      socket: {
        host: config.redis.host,
        port: config.redis.port
      }
    });

    this.redis.on('error', (err: any) => {
      console.error('Redis Client Error (Velocity):', err);
      this.isConnected = false;
    });

    this.redis.on('connect', () => {
      console.log('Redis connected (Velocity)');
      this.isConnected = true;
    });

    try {
      await this.redis.connect();
      this.isConnected = true;
    } catch (err) {
      console.error('Failed to connect to Redis (Velocity):', err);
      this.isConnected = false;
    }
  }

  private async ensureConnection(): Promise<boolean> {
    if (this.connectionPromise) {
      await this.connectionPromise;
    }
    return this.isConnected;
  }

  async checkVelocity(
    userId: string,
    eventId: string,
    ipAddress: string,
    cardFingerprint?: string
  ): Promise<{
    allowed: boolean;
    reason?: string;
    limits: any;
  }> {
    const connected = await this.ensureConnection();
    
    if (!connected) {
      console.warn('Redis not connected, bypassing velocity checks');
      return { allowed: true, limits: {} };
    }

    const checks = await Promise.all([
      this.checkUserVelocity(userId),
      this.checkEventVelocity(userId, eventId),
      this.checkIPVelocity(ipAddress),
      cardFingerprint ? this.checkCardVelocity(cardFingerprint) : null
    ]);

    const failedCheck = checks.find(check => check && !check.allowed);

    if (failedCheck) {
      return failedCheck;
    }

    return {
      allowed: true,
      limits: {
        user: checks[0]?.limits,
        event: checks[1]?.limits,
        ip: checks[2]?.limits,
        card: checks[3]?.limits
      }
    };
  }

  private async checkUserVelocity(userId: string): Promise<any> {
    const limits = {
      perHour: 5,
      perDay: 20,
      perWeek: 50
    };

    const counts = await this.getVelocityCounts(
      `velocity:user:${userId}`,
      [3600, 86400, 604800]
    );

    if (counts.hour && counts.hour >= limits.perHour) {
      return {
        allowed: false,
        reason: 'Too many purchases in the last hour',
        limits: {
          current: counts.hour,
          limit: limits.perHour,
          resetIn: await this.getResetTime(`velocity:user:${userId}:hour`)
        }
      };
    }

    if (counts.day && counts.day >= limits.perDay) {
      return {
        allowed: false,
        reason: 'Daily purchase limit reached',
        limits: {
          current: counts.day,
          limit: limits.perDay,
          resetIn: await this.getResetTime(`velocity:user:${userId}:day`)
        }
      };
    }

    if (counts.week && counts.week >= limits.perWeek) {
      return {
        allowed: false,
        reason: 'Weekly purchase limit reached',
        limits: {
          current: counts.week,
          limit: limits.perWeek,
          resetIn: await this.getResetTime(`velocity:user:${userId}:week`)
        }
      };
    }

    return {
      allowed: true,
      limits: {
        hourly: { used: counts.hour || 0, limit: limits.perHour },
        daily: { used: counts.day || 0, limit: limits.perDay },
        weekly: { used: counts.week || 0, limit: limits.perWeek }
      }
    };
  }

  private async checkEventVelocity(userId: string, eventId: string): Promise<any> {
    const key = `velocity:event:${eventId}:user:${userId}`;
    const eventPurchaseLimit = 4;

    const count = await this.getCount(key);

    if (count >= eventPurchaseLimit) {
      return {
        allowed: false,
        reason: `Maximum ${eventPurchaseLimit} tickets per event already purchased`,
        limits: {
          current: count,
          limit: eventPurchaseLimit
        }
      };
    }

    return {
      allowed: true,
      limits: {
        used: count,
        limit: eventPurchaseLimit
      }
    };
  }

  private async checkIPVelocity(ipAddress: string): Promise<any> {
    const limits = {
      perMinute: 10,
      perHour: 50
    };

    const counts = await this.getVelocityCounts(
      `velocity:ip:${ipAddress}`,
      [60, 3600]
    );

    if (counts.minute && counts.minute >= limits.perMinute) {
      return {
        allowed: false,
        reason: 'Too many requests from this IP address',
        limits: {
          current: counts.minute,
          limit: limits.perMinute,
          resetIn: 60 - (Date.now() / 1000 % 60)
        }
      };
    }

    if (counts.hour && counts.hour >= limits.perHour) {
      return {
        allowed: false,
        reason: 'Hourly IP limit exceeded',
        limits: {
          current: counts.hour,
          limit: limits.perHour,
          resetIn: await this.getResetTime(`velocity:ip:${ipAddress}:hour`)
        }
      };
    }

    return {
      allowed: true,
      limits: {
        perMinute: { used: counts.minute || 0, limit: limits.perMinute },
        perHour: { used: counts.hour || 0, limit: limits.perHour }
      }
    };
  }

  private async checkCardVelocity(cardFingerprint: string): Promise<any> {
    const limits = {
      perDay: 10,
      uniqueUsers: 3
    };

    const key = `velocity:card:${cardFingerprint}`;
    const count = await this.getCount(`${key}:day`);

    if (count >= limits.perDay) {
      return {
        allowed: false,
        reason: 'Daily limit for this payment method reached',
        limits: {
          current: count,
          limit: limits.perDay
        }
      };
    }

    const uniqueUsers = await this.getSetSize(`${key}:users:day`);

    if (uniqueUsers >= limits.uniqueUsers) {
      return {
        allowed: false,
        reason: 'Payment method used by too many accounts',
        limits: {
          current: uniqueUsers,
          limit: limits.uniqueUsers
        }
      };
    }

    return {
      allowed: true,
      limits: {
        dailyUsage: { used: count, limit: limits.perDay },
        uniqueUsers: { used: uniqueUsers, limit: limits.uniqueUsers }
      }
    };
  }

  async recordPurchase(
    userId: string,
    eventId: string,
    ipAddress: string,
    cardFingerprint?: string
  ): Promise<void> {
    const connected = await this.ensureConnection();
    if (!connected) return;

    const now = Date.now();
    const nowSeconds = Math.floor(now / 1000);

    await this.incrementCounter(`velocity:user:${userId}:hour`, 3600);
    await this.incrementCounter(`velocity:user:${userId}:day`, 86400);
    await this.incrementCounter(`velocity:user:${userId}:week`, 604800);
    await this.incrementCounter(`velocity:event:${eventId}:user:${userId}`, 86400 * 30);
    await this.incrementCounter(`velocity:ip:${ipAddress}:minute`, 60);
    await this.incrementCounter(`velocity:ip:${ipAddress}:hour`, 3600);

    if (cardFingerprint) {
      await this.incrementCounter(`velocity:card:${cardFingerprint}:day`, 86400);
      await this.addToSet(`velocity:card:${cardFingerprint}:users:day`, userId, 86400);
    }

    await this.storePurchaseEvent(userId, eventId, ipAddress, now);
  }

  private async incrementCounter(key: string, ttl: number): Promise<void> {
    try {
      await this.redis.incr(key);
      await this.redis.expire(key, ttl);
    } catch (err) {
      console.error(`Failed to increment counter ${key}:`, err);
    }
  }

  private async getCount(key: string): Promise<number> {
    try {
      const count = await this.redis.get(key);
      return parseInt(count || '0');
    } catch (err) {
      console.error(`Failed to get count for ${key}:`, err);
      return 0;
    }
  }

  private async getSetSize(key: string): Promise<number> {
    try {
      const count = await this.redis.sCard(key);
      return count || 0;
    } catch (err) {
      console.error(`Failed to get set size for ${key}:`, err);
      return 0;
    }
  }

  private async addToSet(key: string, member: string, ttl: number): Promise<void> {
    try {
      await this.redis.sAdd(key, member);
      await this.redis.expire(key, ttl);
    } catch (err) {
      console.error(`Failed to add to set ${key}:`, err);
    }
  }

  private async getVelocityCounts(
    baseKey: string,
    periods: number[]
  ): Promise<{ minute?: number; hour?: number; day?: number; week?: number }> {
    const counts: any = {};

    if (periods.includes(60)) {
      counts.minute = await this.getCount(`${baseKey}:minute`);
    }
    if (periods.includes(3600)) {
      counts.hour = await this.getCount(`${baseKey}:hour`);
    }
    if (periods.includes(86400)) {
      counts.day = await this.getCount(`${baseKey}:day`);
    }
    if (periods.includes(604800)) {
      counts.week = await this.getCount(`${baseKey}:week`);
    }

    return counts;
  }

  private async getResetTime(key: string): Promise<number> {
    try {
      const ttl = await this.redis.ttl(key);
      return ttl || 0;
    } catch (err) {
      console.error(`Failed to get TTL for ${key}:`, err);
      return 0;
    }
  }

  private async storePurchaseEvent(
    userId: string,
    eventId: string,
    ipAddress: string,
    timestamp: number
  ): Promise<void> {
    try {
      const event = JSON.stringify({
        userId,
        eventId,
        ipAddress,
        timestamp
      });

      await this.redis.zAdd('purchase_events', {
        score: timestamp,
        value: event
      });

      const sevenDaysAgo = timestamp - (7 * 24 * 60 * 60 * 1000);
      await this.redis.zRemRangeByScore('purchase_events', '-inf', sevenDaysAgo);
    } catch (err) {
      console.error('Failed to store purchase event:', err);
    }
  }
}
