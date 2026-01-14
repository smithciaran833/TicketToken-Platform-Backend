/**
 * Configuration Validation for Notification Service
 * 
 * AUDIT FIX:
 * - CFG-H1: No formal validation library → Comprehensive validation
 * 
 * Features:
 * - Validates all required environment variables
 * - Type checking for numeric values
 * - URL format validation
 * - Production mode strict checks
 */

import { env } from './env';
import { logger } from '../utils/logger';

// =============================================================================
// VALIDATION TYPES
// =============================================================================

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 0 && port <= 65535;
}

// =============================================================================
// MAIN VALIDATION - AUDIT FIX CFG-H1
// =============================================================================

/**
 * Validate all configuration at startup
 */
export function validateConfig(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const isProduction = env.NODE_ENV === 'production';

  // ===========================================================================
  // REQUIRED VARIABLES (always)
  // ===========================================================================

  if (!env.NODE_ENV) {
    errors.push('NODE_ENV is required');
  }

  if (!env.PORT || !isValidPort(env.PORT)) {
    errors.push('PORT must be a valid port number');
  }

  // ===========================================================================
  // DATABASE CONFIGURATION
  // ===========================================================================

  if (!env.DATABASE_URL) {
    errors.push('DATABASE_URL is required');
  } else {
    if (!env.DATABASE_URL.startsWith('postgres://') && 
        !env.DATABASE_URL.startsWith('postgresql://')) {
      errors.push('DATABASE_URL must be a PostgreSQL connection string');
    }
    
    // AUDIT FIX SEC-H3: Database SSL in production
    if (isProduction && !env.DATABASE_URL.includes('sslmode=')) {
      warnings.push('DATABASE_URL should include sslmode=require in production');
    }
  }

  // ===========================================================================
  // REDIS CONFIGURATION
  // ===========================================================================

  if (!env.REDIS_HOST) {
    warnings.push('REDIS_HOST not set, rate limiting may use memory fallback');
  }

  // AUDIT FIX SEC-H4: Redis SSL in production
  if (isProduction && env.REDIS_HOST && !env.REDIS_TLS) {
    warnings.push('Redis should use TLS in production (REDIS_TLS=true)');
  }

  // ===========================================================================
  // RABBITMQ CONFIGURATION
  // ===========================================================================

  if (!env.RABBITMQ_URL) {
    errors.push('RABBITMQ_URL is required for event processing');
  } else {
    // AUDIT FIX S2S-1: Already enforced in rabbitmq.ts
    if (isProduction && !env.RABBITMQ_URL.startsWith('amqps://')) {
      errors.push('RABBITMQ_URL must use amqps:// in production');
    }
  }

  // ===========================================================================
  // EMAIL PROVIDER CONFIGURATION
  // ===========================================================================

  if (!env.SENDGRID_API_KEY && !env.AWS_ACCESS_KEY_ID) {
    if (isProduction) {
      errors.push('Either SENDGRID_API_KEY or AWS SES credentials required');
    } else {
      warnings.push('No email provider configured');
    }
  }

  if (env.SENDGRID_API_KEY && !env.SENDGRID_API_KEY.startsWith('SG.')) {
    warnings.push('SENDGRID_API_KEY should start with "SG."');
  }

  // ===========================================================================
  // SMS PROVIDER CONFIGURATION
  // ===========================================================================

  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
    if (isProduction) {
      warnings.push('Twilio credentials not configured, SMS disabled');
    }
  }

  if (env.TWILIO_ACCOUNT_SID && !env.TWILIO_ACCOUNT_SID.startsWith('AC')) {
    warnings.push('TWILIO_ACCOUNT_SID should start with "AC"');
  }

  // ===========================================================================
  // JWT CONFIGURATION
  // ===========================================================================

  if (!env.JWT_SECRET) {
    errors.push('JWT_SECRET is required');
  } else if (env.JWT_SECRET.length < 32) {
    warnings.push('JWT_SECRET should be at least 32 characters');
  }

  // ===========================================================================
  // URL CONFIGURATION
  // ===========================================================================

  if (env.APP_URL && !isValidUrl(env.APP_URL)) {
    errors.push('APP_URL must be a valid URL');
  }

  if (env.FRONTEND_URL && !isValidUrl(env.FRONTEND_URL)) {
    errors.push('FRONTEND_URL must be a valid URL');
  }

  // ===========================================================================
  // EMAIL DEFAULTS
  // ===========================================================================

  if (env.DEFAULT_FROM_EMAIL && !isValidEmail(env.DEFAULT_FROM_EMAIL)) {
    errors.push('DEFAULT_FROM_EMAIL must be a valid email');
  }

  // ===========================================================================
  // NUMERIC VALIDATION
  // ===========================================================================

  const numericChecks = [
    { name: 'REDIS_PORT', value: env.REDIS_PORT, min: 0, max: 65535 },
    { name: 'REDIS_DB', value: env.REDIS_DB, min: 0, max: 15 },
    { name: 'RATE_LIMIT_WINDOW_MS', value: env.RATE_LIMIT_WINDOW_MS, min: 1000 },
    { name: 'RATE_LIMIT_MAX_REQUESTS', value: env.RATE_LIMIT_MAX_REQUESTS, min: 1 },
    { name: 'QUEUE_CONCURRENCY', value: env.QUEUE_CONCURRENCY, min: 1, max: 100 },
  ];

  for (const check of numericChecks) {
    if (check.value !== undefined) {
      const val = Number(check.value);
      if (isNaN(val)) {
        errors.push(`${check.name} must be a number`);
      } else {
        if (check.min !== undefined && val < check.min) {
          errors.push(`${check.name} must be >= ${check.min}`);
        }
        if (check.max !== undefined && val > check.max) {
          errors.push(`${check.name} must be <= ${check.max}`);
        }
      }
    }
  }

  // ===========================================================================
  // RESULT
  // ===========================================================================

  const valid = errors.length === 0;
  
  return { valid, errors, warnings };
}

/**
 * Validate configuration and throw if invalid
 */
export function assertValidConfig(): void {
  const result = validateConfig();
  
  // Log warnings
  for (const warning of result.warnings) {
    logger.warn(`Configuration warning: ${warning}`);
  }
  
  // Fail on errors
  if (!result.valid) {
    const errorMsg = `Configuration errors:\n${result.errors.map(e => `  - ${e}`).join('\n')}`;
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }
  
  logger.info('Configuration validated successfully');
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  validateConfig,
  assertValidConfig
};
