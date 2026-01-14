/**
 * CAPTCHA Service
 *
 * Verifies CAPTCHA tokens after N failed login attempts.
 * Supports Google reCAPTCHA v2/v3 and hCaptcha.
 */

import { env } from '../config/env';
import { logger } from '../utils/logger';
import { getRedis } from '../config/redis';

interface CaptchaVerifyResponse {
  success: boolean;
  score?: number;  // reCAPTCHA v3 score (0.0 - 1.0)
  action?: string;
  errorCodes?: string[];
}

// Number of failed attempts before requiring CAPTCHA
const CAPTCHA_THRESHOLD = 3;
const CAPTCHA_WINDOW = 15 * 60; // 15 minutes

export class CaptchaService {
  private secretKey: string;
  private provider: 'recaptcha' | 'hcaptcha';
  private minScore: number;

  constructor() {
    this.secretKey = env.CAPTCHA_SECRET_KEY || '';
    this.provider = env.CAPTCHA_PROVIDER;
    this.minScore = env.CAPTCHA_MIN_SCORE;
  }

  /**
   * Check if CAPTCHA is required for this identifier (IP or email)
   */
  async isCaptchaRequired(identifier: string): Promise<boolean> {
    // Skip in development/test unless explicitly enabled
    if (!env.isProduction && !env.CAPTCHA_ENABLED) {
      return false;
    }

    if (!this.secretKey) {
      logger.warn('CAPTCHA secret key not configured');
      return false;
    }

    const redis = getRedis();
    const key = `captcha:failures:${identifier}`;
    const failures = await redis.get(key);

    return parseInt(failures || '0') >= CAPTCHA_THRESHOLD;
  }

  /**
   * Record a failed attempt (call on login failure)
   */
  async recordFailure(identifier: string): Promise<{ requiresCaptcha: boolean; attempts: number }> {
    const redis = getRedis();
    const key = `captcha:failures:${identifier}`;

    const attempts = await redis.incr(key);

    // Set expiry on first failure
    if (attempts === 1) {
      await redis.expire(key, CAPTCHA_WINDOW);
    }

    return {
      requiresCaptcha: attempts >= CAPTCHA_THRESHOLD,
      attempts
    };
  }

  /**
   * Clear failures on successful login
   */
  async clearFailures(identifier: string): Promise<void> {
    const redis = getRedis();
    const key = `captcha:failures:${identifier}`;
    await redis.del(key);
  }

  /**
   * Verify CAPTCHA token
   */
  async verify(token: string, ipAddress?: string): Promise<CaptchaVerifyResponse> {
    if (!this.secretKey) {
      logger.warn('CAPTCHA verification skipped - no secret key configured');
      return { success: true };
    }

    if (!token) {
      return { success: false, errorCodes: ['missing-input-response'] };
    }

    try {
      const verifyUrl = this.provider === 'hcaptcha'
        ? 'https://hcaptcha.com/siteverify'
        : 'https://www.google.com/recaptcha/api/siteverify';

      const params = new URLSearchParams({
        secret: this.secretKey,
        response: token,
        ...(ipAddress && { remoteip: ipAddress }),
      });

      const response = await fetch(verifyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      const data = await response.json();

      // For reCAPTCHA v3, check score
      if (this.provider === 'recaptcha' && data.score !== undefined) {
        const passed = data.success && data.score >= this.minScore;

        logger.info('reCAPTCHA v3 verification', {
          success: passed,
          score: data.score,
          action: data.action,
        });

        return {
          success: passed,
          score: data.score,
          action: data.action,
          errorCodes: data['error-codes'],
        };
      }

      // reCAPTCHA v2 or hCaptcha
      return {
        success: data.success,
        errorCodes: data['error-codes'],
      };
    } catch (error) {
      logger.error('CAPTCHA verification failed', { error });

      // Fail open in case of network issues (configurable)
      if (env.CAPTCHA_FAIL_OPEN) {
        return { success: true };
      }

      return { success: false, errorCodes: ['verification-failed'] };
    }
  }
}

export const captchaService = new CaptchaService();
