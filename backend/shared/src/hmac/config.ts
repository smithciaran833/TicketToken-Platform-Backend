/**
 * HMAC Configuration
 *
 * Handles configuration loading, validation, and feature flag management.
 */

import { HmacConfig, DEFAULT_HMAC_CONFIG } from './types';

/**
 * Feature flag for enabling HMAC authentication
 * When false, falls back to legacy X-Internal-API-Key
 */
export function isHmacEnabled(): boolean {
  return process.env.USE_NEW_HMAC === 'true';
}

/**
 * Get HMAC secret from environment
 * Throws if not configured when HMAC is enabled
 */
export function getHmacSecret(): string {
  const secret = process.env.INTERNAL_HMAC_SECRET || process.env.INTERNAL_SERVICE_SECRET;

  if (!secret && isHmacEnabled()) {
    throw new Error(
      'INTERNAL_HMAC_SECRET or INTERNAL_SERVICE_SECRET must be set when USE_NEW_HMAC=true'
    );
  }

  return secret || '';
}

/**
 * Get the current service name
 */
export function getServiceName(): string {
  return process.env.SERVICE_NAME || 'unknown-service';
}

/**
 * Validate HMAC configuration
 */
export function validateConfig(config: Partial<HmacConfig>): HmacConfig {
  const secret = config.secret || getHmacSecret();
  const serviceName = config.serviceName || getServiceName();

  if (!secret) {
    throw new Error('HMAC secret is required');
  }

  if (secret.length < 32) {
    throw new Error('HMAC secret must be at least 32 characters');
  }

  if (!serviceName) {
    throw new Error('Service name is required');
  }

  return {
    secret,
    serviceName,
    replayWindowMs: config.replayWindowMs ?? DEFAULT_HMAC_CONFIG.replayWindowMs,
    requireBodyHash: config.requireBodyHash ?? DEFAULT_HMAC_CONFIG.requireBodyHash,
    nonceKeyPrefix: config.nonceKeyPrefix ?? DEFAULT_HMAC_CONFIG.nonceKeyPrefix,
    algorithm: config.algorithm ?? DEFAULT_HMAC_CONFIG.algorithm,
  };
}

/**
 * Create a validated HMAC configuration
 */
export function createHmacConfig(overrides?: Partial<HmacConfig>): HmacConfig {
  return validateConfig(overrides || {});
}

/**
 * Get replay window from environment or default
 */
export function getReplayWindowMs(): number {
  const envValue = process.env.HMAC_REPLAY_WINDOW_MS;
  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_HMAC_CONFIG.replayWindowMs;
}
