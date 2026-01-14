/**
 * Configuration Validation for Integration Service
 * 
 * AUDIT FIX CV-1: No config validation on startup
 * 
 * Validates all configuration at startup to fail fast on misconfiguration.
 */

import { config, isProduction } from './index';
import { logger } from '../utils/logger';

// =============================================================================
// TYPES
// =============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// =============================================================================
// VALIDATION RULES
// =============================================================================

/**
 * Validate server configuration
 */
function validateServerConfig(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (config.server.port < 1 || config.server.port > 65535) {
    errors.push(`Invalid PORT: ${config.server.port}`);
  }
  
  if (config.server.host !== '0.0.0.0' && config.server.host !== 'localhost') {
    warnings.push(`Host is set to ${config.server.host} (typically 0.0.0.0 for containers)`);
  }
  
  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate database configuration
 */
function validateDatabaseConfig(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (!config.database.host) {
    errors.push('DATABASE_HOST is required');
  }
  
  if (!config.database.name) {
    errors.push('DATABASE_NAME is required');
  }
  
  if (!config.database.user) {
    errors.push('DATABASE_USER is required');
  }
  
  if (isProduction() && !config.database.password) {
    errors.push('DATABASE_PASSWORD is required in production');
  }
  
  if (config.database.poolMin > config.database.poolMax) {
    errors.push(`DATABASE_POOL_MIN (${config.database.poolMin}) cannot exceed DATABASE_POOL_MAX (${config.database.poolMax})`);
  }
  
  if (!isProduction() && config.database.ssl) {
    warnings.push('SSL is enabled in non-production environment');
  }
  
  if (isProduction() && !config.database.ssl) {
    errors.push('Database SSL must be enabled in production');
  }
  
  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate Redis configuration
 */
function validateRedisConfig(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (!config.redis.host) {
    if (isProduction()) {
      errors.push('REDIS_HOST is required in production');
    } else {
      warnings.push('REDIS_HOST not set, rate limiting and idempotency will be disabled');
    }
  }
  
  if (config.redis.host && (config.redis.port < 1 || config.redis.port > 65535)) {
    errors.push(`Invalid REDIS_PORT: ${config.redis.port}`);
  }
  
  if (isProduction() && config.redis.host && !config.redis.password) {
    warnings.push('REDIS_PASSWORD not set in production');
  }
  
  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate JWT configuration
 */
function validateJwtConfig(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (!config.jwt.secret) {
    errors.push('JWT_SECRET is required');
  } else if (config.jwt.secret.length < 32) {
    errors.push('JWT_SECRET should be at least 32 characters');
  }
  
  const validAlgorithms = ['HS256', 'HS384', 'HS512', 'RS256', 'RS384', 'RS512'];
  if (!validAlgorithms.includes(config.jwt.algorithm)) {
    errors.push(`Invalid JWT_ALGORITHM: ${config.jwt.algorithm}. Must be one of: ${validAlgorithms.join(', ')}`);
  }
  
  if (!config.jwt.issuer) {
    warnings.push('JWT_ISSUER not set');
  }
  
  if (!config.jwt.audience) {
    warnings.push('JWT_AUDIENCE not set');
  }
  
  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate OAuth provider configuration
 */
function validateOAuthConfig(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check each provider with proper type handling
  const providers = ['stripe', 'square', 'ticketmaster', 'eventbrite', 'mailchimp', 'quickbooks'] as const;
  
  for (const provider of providers) {
    const providerConfig = config.providers[provider] as Record<string, unknown>;
    
    // For production, at least one provider should be configured
    if (isProduction()) {
      const hasClientId = providerConfig.clientId && providerConfig.clientId !== '';
      const hasClientSecret = 'clientSecret' in providerConfig && providerConfig.clientSecret && providerConfig.clientSecret !== '';
      
      if (hasClientId && !hasClientSecret) {
        errors.push(`${provider.toUpperCase()}_CLIENT_SECRET required when CLIENT_ID is set`);
      }
      
      if (provider === 'stripe' && hasClientSecret && !('webhookSecret' in providerConfig && providerConfig.webhookSecret)) {
        warnings.push(`${provider.toUpperCase()}_WEBHOOK_SECRET not set - webhook verification disabled`);
      }
    }
  }
  
  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate service URLs
 */
function validateServiceUrls(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  const serviceUrls = [
    { name: 'AUTH_SERVICE_URL', url: config.services.authServiceUrl },
    { name: 'EVENT_SERVICE_URL', url: config.services.eventServiceUrl },
    { name: 'TICKET_SERVICE_URL', url: config.services.ticketServiceUrl },
    { name: 'PAYMENT_SERVICE_URL', url: config.services.paymentServiceUrl }
  ];
  
  for (const { name, url } of serviceUrls) {
    if (!url) {
      if (isProduction()) {
        warnings.push(`${name} not configured`);
      }
      continue;
    }
    
    try {
      new URL(url);
    } catch {
      errors.push(`Invalid ${name}: ${url}`);
    }
  }
  
  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate security settings
 */
function validateSecurityConfig(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (config.server.corsOrigin === '*' && isProduction()) {
    warnings.push('CORS_ORIGIN is set to * in production (should be restricted)');
  }
  
  if (config.security.requestSizeLimit !== '10mb') {
    warnings.push(`Non-standard request size limit: ${config.security.requestSizeLimit}`);
  }
  
  return { valid: errors.length === 0, errors, warnings };
}

// =============================================================================
// MAIN VALIDATION
// =============================================================================

/**
 * Validate all configuration
 */
export function validateConfig(): ValidationResult {
  const results: ValidationResult[] = [
    validateServerConfig(),
    validateDatabaseConfig(),
    validateRedisConfig(),
    validateJwtConfig(),
    validateOAuthConfig(),
    validateServiceUrls(),
    validateSecurityConfig()
  ];
  
  const errors = results.flatMap(r => r.errors);
  const warnings = results.flatMap(r => r.warnings);
  const valid = results.every(r => r.valid);
  
  return { valid, errors, warnings };
}

/**
 * Validate configuration and log results
 * Call this during startup before starting the server
 */
export function validateConfigOnStartup(): void {
  const result = validateConfig();
  
  // Log warnings
  for (const warning of result.warnings) {
    logger.warn('Configuration warning', { warning });
  }
  
  // Log errors and exit if invalid
  if (!result.valid) {
    for (const error of result.errors) {
      logger.error('Configuration error', { error });
    }
    
    if (isProduction()) {
      logger.error('Configuration validation failed, exiting');
      process.exit(1);
    } else {
      logger.warn('Configuration validation failed (non-production mode, continuing)');
    }
  } else {
    logger.info('Configuration validation passed', {
      warnings: result.warnings.length,
      environment: process.env.NODE_ENV || 'development'
    });
  }
}

/**
 * Get config summary (safe to log)
 */
export function getConfigSummary(): Record<string, unknown> {
  return {
    environment: process.env.NODE_ENV || 'development',
    server: {
      port: config.server.port,
      host: config.server.host,
      logLevel: config.server.logLevel
    },
    database: {
      host: config.database.host,
      name: config.database.name,
      ssl: config.database.ssl,
      poolMin: config.database.poolMin,
      poolMax: config.database.poolMax
    },
    redis: {
      host: config.redis.host || 'not configured',
      port: config.redis.port
    },
    providers: {
      stripe: !!config.providers.stripe.clientId,
      square: !!config.providers.square.clientId,
      ticketmaster: !!config.providers.ticketmaster.clientId,
      eventbrite: !!config.providers.eventbrite.clientId,
      mailchimp: !!config.providers.mailchimp.clientId,
      quickbooks: !!config.providers.quickbooks.clientId
    },
    features: {
      rateLimiting: !!config.redis.host,
      idempotency: !!config.redis.host,
      circuitBreaker: true
    }
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  validateConfig,
  validateConfigOnStartup,
  getConfigSummary
};
