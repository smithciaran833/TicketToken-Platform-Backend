/**
 * Configuration Validation for Marketplace Service
 * 
 * Issues Fixed:
 * - CFG-1: No config validation at startup → Fail fast on missing config
 * - CFG-2: Silent failures for missing env vars → Explicit validation
 * - SEC-H4: Secrets not validated → Required secret validation
 */

import { logger } from '../utils/logger';

interface ConfigRequirement {
  name: string;
  required: boolean;
  sensitive?: boolean;
  validator?: (value: string) => boolean;
  default?: string;
  description: string;
}

// AUDIT FIX CFG-1: Define all required configuration
const CONFIG_REQUIREMENTS: ConfigRequirement[] = [
  // Database
  {
    name: 'DATABASE_URL',
    required: true,
    sensitive: true,
    validator: (v) => v.startsWith('postgres://') || v.startsWith('postgresql://'),
    description: 'PostgreSQL connection string'
  },
  
  // Redis
  {
    name: 'REDIS_URL',
    required: true,
    sensitive: true,
    validator: (v) => v.startsWith('redis://') || v.startsWith('rediss://'),
    description: 'Redis connection string'
  },
  
  // JWT Secret
  {
    name: 'JWT_SECRET',
    required: true,
    sensitive: true,
    validator: (v) => v.length >= 32,
    description: 'JWT signing secret (min 32 chars)'
  },
  
  // Internal Service Auth
  {
    name: 'INTERNAL_SERVICE_SECRET',
    required: true,
    sensitive: true,
    validator: (v) => v.length >= 32,
    description: 'Secret for S2S HMAC authentication (min 32 chars)'
  },
  
  // Stripe
  {
    name: 'STRIPE_SECRET_KEY',
    required: true,
    sensitive: true,
    validator: (v) => v.startsWith('sk_'),
    description: 'Stripe secret API key'
  },
  {
    name: 'STRIPE_WEBHOOK_SECRET',
    required: true,
    sensitive: true,
    validator: (v) => v.startsWith('whsec_'),
    description: 'Stripe webhook signing secret'
  },
  
  // Service URLs
  {
    name: 'BLOCKCHAIN_SERVICE_URL',
    required: true,
    sensitive: false,
    validator: (v) => v.startsWith('http://') || v.startsWith('https://'),
    description: 'URL for blockchain service'
  },
  {
    name: 'TICKET_SERVICE_URL',
    required: true,
    sensitive: false,
    validator: (v) => v.startsWith('http://') || v.startsWith('https://'),
    description: 'URL for ticket service'
  },
  
  // Application
  {
    name: 'NODE_ENV',
    required: false,
    default: 'development',
    validator: (v) => ['development', 'staging', 'production', 'test'].includes(v),
    description: 'Runtime environment'
  },
  {
    name: 'PORT',
    required: false,
    default: '3006',
    validator: (v) => /^\d+$/.test(v) && parseInt(v) > 0 && parseInt(v) < 65536,
    description: 'HTTP port to listen on'
  },
  {
    name: 'LOG_LEVEL',
    required: false,
    default: 'info',
    validator: (v) => ['trace', 'debug', 'info', 'warn', 'error', 'fatal'].includes(v),
    description: 'Logging level'
  },
  
  // Rate Limiting
  {
    name: 'RATE_LIMIT_MAX',
    required: false,
    default: '100',
    validator: (v) => /^\d+$/.test(v) && parseInt(v) > 0,
    description: 'Max requests per window'
  },
  {
    name: 'RATE_LIMIT_WINDOW',
    required: false,
    default: '1 minute',
    description: 'Rate limit time window'
  },
  
  // External Service Timeout
  {
    name: 'EXTERNAL_SERVICE_TIMEOUT',
    required: false,
    default: '10000',
    validator: (v) => /^\d+$/.test(v) && parseInt(v) > 0,
    description: 'External service call timeout (ms)'
  }
];

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  config: Record<string, string>;
}

/**
 * AUDIT FIX CFG-1: Validate all configuration at startup
 */
export function validateConfig(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const config: Record<string, string> = {};

  for (const requirement of CONFIG_REQUIREMENTS) {
    const value = process.env[requirement.name];
    
    if (!value && requirement.required) {
      errors.push(`Missing required config: ${requirement.name} (${requirement.description})`);
      continue;
    }
    
    if (!value && !requirement.required) {
      if (requirement.default) {
        config[requirement.name] = requirement.default;
        warnings.push(`Using default for ${requirement.name}: ${requirement.sensitive ? '[REDACTED]' : requirement.default}`);
      }
      continue;
    }
    
    if (value && requirement.validator && !requirement.validator(value)) {
      errors.push(`Invalid config: ${requirement.name} - value doesn't pass validation (${requirement.description})`);
      continue;
    }
    
    config[requirement.name] = value!;
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    config
  };
}

/**
 * AUDIT FIX CFG-1: Run validation and fail fast if invalid
 */
export function validateAndFail(): Record<string, string> {
  const log = logger.child({ component: 'ConfigValidation' });
  const result = validateConfig();
  
  if (result.warnings.length > 0) {
    for (const warning of result.warnings) {
      log.warn(warning);
    }
  }
  
  if (!result.valid) {
    log.error('Configuration validation failed', { 
      errors: result.errors 
    });
    
    // In production, fail fast. In development, allow startup but warn
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Configuration validation failed:\n${result.errors.join('\n')}`);
    } else {
      log.warn('Continuing with invalid configuration (development mode)');
      log.warn('Fix these issues before deploying to production:');
      for (const error of result.errors) {
        log.warn(`  - ${error}`);
      }
    }
  } else {
    log.info('Configuration validation passed', {
      configuredKeys: Object.keys(result.config).length
    });
  }
  
  return result.config;
}

/**
 * Get a validated config value with type safety
 */
export function getConfigValue<T = string>(
  key: string, 
  transform?: (value: string) => T,
  defaultValue?: T
): T {
  const value = process.env[key];
  
  if (!value) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Missing required configuration: ${key}`);
  }
  
  if (transform) {
    return transform(value);
  }
  
  return value as unknown as T;
}

/**
 * Common transformers for config values
 */
export const ConfigTransformers = {
  toInt: (v: string) => parseInt(v, 10),
  toFloat: (v: string) => parseFloat(v),
  toBool: (v: string) => v.toLowerCase() === 'true' || v === '1',
  toArray: (v: string, delimiter = ',') => v.split(delimiter).map(s => s.trim()),
  toUrl: (v: string) => new URL(v)
};
