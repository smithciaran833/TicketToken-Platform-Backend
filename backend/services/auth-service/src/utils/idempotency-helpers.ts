/**
 * Idempotency Helpers for Auth Operations
 * 
 * Prevents duplicate operations within time windows
 */

import { getRedis } from '../config/redis';
import { logger } from './logger';

const PASSWORD_RESET_WINDOW = 300; // 5 minutes
const MFA_SETUP_WINDOW = 600; // 10 minutes

/**
 * Check if password reset was recently requested for this email
 * Returns existing token if within window, null otherwise
 */
export async function getRecentPasswordReset(email: string): Promise<string | null> {
  try {
    const redis = getRedis();
    const key = `idempotent:password-reset:${email.toLowerCase()}`;
    return await redis.get(key);
  } catch (error) {
    logger.warn('Failed to check recent password reset', { error });
    return null; // Fail open - allow new request
  }
}

/**
 * Store password reset token for idempotency
 */
export async function storePasswordResetIdempotency(email: string, token: string): Promise<void> {
  try {
    const redis = getRedis();
    const key = `idempotent:password-reset:${email.toLowerCase()}`;
    await redis.setex(key, PASSWORD_RESET_WINDOW, token);
  } catch (error) {
    logger.warn('Failed to store password reset idempotency', { error });
    // Non-fatal - continue without idempotency
  }
}

/**
 * Check if MFA setup was recently initiated for this user
 * Returns existing setup data if within window
 */
export async function getRecentMFASetup(userId: string): Promise<{ secret: string; qrCode: string } | null> {
  try {
    const redis = getRedis();
    const key = `idempotent:mfa-setup:${userId}`;
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    logger.warn('Failed to check recent MFA setup', { error });
    return null;
  }
}

/**
 * Store MFA setup for idempotency
 */
export async function storeMFASetupIdempotency(
  userId: string, 
  data: { secret: string; qrCode: string }
): Promise<void> {
  try {
    const redis = getRedis();
    const key = `idempotent:mfa-setup:${userId}`;
    await redis.setex(key, MFA_SETUP_WINDOW, JSON.stringify(data));
  } catch (error) {
    logger.warn('Failed to store MFA setup idempotency', { error });
  }
}

/**
 * Clear MFA setup idempotency (on successful enable)
 */
export async function clearMFASetupIdempotency(userId: string): Promise<void> {
  try {
    const redis = getRedis();
    const key = `idempotent:mfa-setup:${userId}`;
    await redis.del(key);
  } catch (error) {
    logger.warn('Failed to clear MFA setup idempotency', { error });
  }
}
