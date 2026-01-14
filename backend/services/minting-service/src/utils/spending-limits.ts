import Redis from 'ioredis';
import logger from './logger';

// =============================================================================
// CONFIGURATION
// =============================================================================

// Per-transaction limit in SOL
const TX_LIMIT_SOL = parseFloat(process.env.TX_LIMIT_SOL || '0.5');

// Daily spending limit in SOL
const DAILY_LIMIT_SOL = parseFloat(process.env.DAILY_LIMIT_SOL || '10.0');

// Hourly spending limit in SOL (optional burst protection)
const HOURLY_LIMIT_SOL = parseFloat(process.env.HOURLY_LIMIT_SOL || '2.0');

// Redis key prefixes
const DAILY_SPEND_PREFIX = 'spending:daily:';
const HOURLY_SPEND_PREFIX = 'spending:hourly:';

// =============================================================================
// REDIS CLIENT
// =============================================================================

let redisClient: Redis | null = null;

function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis({
      host: process.env.REDIS_HOST || 'redis',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      retryStrategy: (times: number) => {
        if (times > 3) return null;
        return Math.min(times * 100, 3000);
      }
    });

    redisClient.on('error', (error) => {
      logger.error('Spending limits Redis error', { error: error.message });
    });
  }
  return redisClient;
}

// =============================================================================
// KEY GENERATION
// =============================================================================

function getDailyKey(date?: Date): string {
  const d = date || new Date();
  const dateStr = d.toISOString().split('T')[0]; // YYYY-MM-DD
  return `${DAILY_SPEND_PREFIX}${dateStr}`;
}

function getHourlyKey(date?: Date): string {
  const d = date || new Date();
  const hourStr = d.toISOString().substring(0, 13); // YYYY-MM-DDTHH
  return `${HOURLY_SPEND_PREFIX}${hourStr}`;
}

// =============================================================================
// SPENDING CHECKS
// =============================================================================

/**
 * Check if a transaction is within spending limits
 * Throws an error if limits would be exceeded
 */
export async function checkSpendingLimits(amountSol: number): Promise<void> {
  // Check per-transaction limit
  if (amountSol > TX_LIMIT_SOL) {
    logger.error('Transaction exceeds per-tx limit', {
      amount: amountSol,
      limit: TX_LIMIT_SOL
    });
    throw new Error(
      `Transaction exceeds per-transaction limit: ${amountSol.toFixed(4)} > ${TX_LIMIT_SOL} SOL`
    );
  }

  try {
    const redis = getRedisClient();

    // Get current spending totals
    const [dailySpentStr, hourlySpentStr] = await Promise.all([
      redis.get(getDailyKey()),
      redis.get(getHourlyKey())
    ]);

    const dailySpent = parseFloat(dailySpentStr || '0');
    const hourlySpent = parseFloat(hourlySpentStr || '0');

    // Check daily limit
    if (dailySpent + amountSol > DAILY_LIMIT_SOL) {
      logger.error('Transaction would exceed daily limit', {
        amount: amountSol,
        currentDaily: dailySpent,
        limit: DAILY_LIMIT_SOL,
        wouldBe: dailySpent + amountSol
      });
      throw new Error(
        `Transaction would exceed daily limit: ${(dailySpent + amountSol).toFixed(4)} > ${DAILY_LIMIT_SOL} SOL`
      );
    }

    // Check hourly limit
    if (hourlySpent + amountSol > HOURLY_LIMIT_SOL) {
      logger.warn('Transaction would exceed hourly limit', {
        amount: amountSol,
        currentHourly: hourlySpent,
        limit: HOURLY_LIMIT_SOL,
        wouldBe: hourlySpent + amountSol
      });
      throw new Error(
        `Transaction would exceed hourly limit: ${(hourlySpent + amountSol).toFixed(4)} > ${HOURLY_LIMIT_SOL} SOL`
      );
    }

    logger.debug('Spending limits check passed', {
      amount: amountSol,
      dailySpent,
      hourlySpent,
      dailyLimit: DAILY_LIMIT_SOL,
      hourlyLimit: HOURLY_LIMIT_SOL
    });

  } catch (error) {
    // If Redis fails, allow the transaction but log warning
    if ((error as Error).message.includes('Connection')) {
      logger.warn('Could not verify spending limits - Redis unavailable', {
        amount: amountSol,
        error: (error as Error).message
      });
      return;
    }
    throw error;
  }
}

/**
 * Record spending after a successful transaction
 */
export async function recordSpending(amountSol: number): Promise<void> {
  try {
    const redis = getRedisClient();

    const dailyKey = getDailyKey();
    const hourlyKey = getHourlyKey();

    // Record in daily and hourly buckets
    await Promise.all([
      redis.incrbyfloat(dailyKey, amountSol),
      redis.incrbyfloat(hourlyKey, amountSol),
      // Set expiry on keys
      redis.expire(dailyKey, 86400 * 2),  // 2 days
      redis.expire(hourlyKey, 7200)        // 2 hours
    ]);

    logger.info('Recorded spending', {
      amount: amountSol,
      dailyKey,
      hourlyKey
    });

  } catch (error) {
    // Log but don't throw - spending was already done
    logger.error('Failed to record spending', {
      amount: amountSol,
      error: (error as Error).message
    });
  }
}

/**
 * Get current spending totals
 */
export async function getCurrentSpending(): Promise<{
  daily: number;
  hourly: number;
  dailyLimit: number;
  hourlyLimit: number;
  txLimit: number;
  dailyRemaining: number;
  hourlyRemaining: number;
}> {
  try {
    const redis = getRedisClient();

    const [dailySpentStr, hourlySpentStr] = await Promise.all([
      redis.get(getDailyKey()),
      redis.get(getHourlyKey())
    ]);

    const daily = parseFloat(dailySpentStr || '0');
    const hourly = parseFloat(hourlySpentStr || '0');

    return {
      daily,
      hourly,
      dailyLimit: DAILY_LIMIT_SOL,
      hourlyLimit: HOURLY_LIMIT_SOL,
      txLimit: TX_LIMIT_SOL,
      dailyRemaining: Math.max(0, DAILY_LIMIT_SOL - daily),
      hourlyRemaining: Math.max(0, HOURLY_LIMIT_SOL - hourly)
    };

  } catch (error) {
    logger.error('Failed to get spending totals', {
      error: (error as Error).message
    });

    return {
      daily: 0,
      hourly: 0,
      dailyLimit: DAILY_LIMIT_SOL,
      hourlyLimit: HOURLY_LIMIT_SOL,
      txLimit: TX_LIMIT_SOL,
      dailyRemaining: DAILY_LIMIT_SOL,
      hourlyRemaining: HOURLY_LIMIT_SOL
    };
  }
}

/**
 * Reset spending counters (for testing or emergency)
 */
export async function resetSpending(): Promise<void> {
  try {
    const redis = getRedisClient();
    
    await Promise.all([
      redis.del(getDailyKey()),
      redis.del(getHourlyKey())
    ]);

    logger.warn('Spending counters reset');

  } catch (error) {
    logger.error('Failed to reset spending', {
      error: (error as Error).message
    });
  }
}

// Export configuration for reference
export const SpendingConfig = {
  TX_LIMIT_SOL,
  DAILY_LIMIT_SOL,
  HOURLY_LIMIT_SOL
};
