/**
 * Configuration Validation
 * 
 * AUDIT FIX: HIGH Priority
 * - Validates all required environment variables at startup
 * - Fails fast if critical configuration is missing
 * - No default credentials allowed
 */

import { logger } from '../utils/logger';

// =============================================================================
// Types
// =============================================================================

interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

interface RequiredConfig {
  name: string;
  envVar: string;
  description: string;
  validator?: (value: string) => boolean;
}

// =============================================================================
// Required Configuration
// =============================================================================

const REQUIRED_CONFIG: RequiredConfig[] = [
  {
    name: 'JWT Secret',
    envVar: 'JWT_SECRET',
    description: 'Secret key for JWT token verification',
    validator: (value) => value.length >= 32 // Minimum 32 characters
  },
  {
    name: 'JWT Public Key',
    envVar: 'JWT_PUBLIC_KEY',
    description: 'Public key for JWT RS256 verification (alternative to JWT_SECRET)'
  },
  {
    name: 'Database URL',
    envVar: 'DATABASE_URL',
    description: 'PostgreSQL connection string',
    validator: (value) => value.startsWith('postgres://') || value.startsWith('postgresql://')
  },
  {
    name: 'S3 Bucket',
    envVar: 'S3_BUCKET',
    description: 'S3 bucket name for file storage'
  },
  {
    name: 'AWS Region',
    envVar: 'AWS_REGION',
    description: 'AWS region for S3 operations'
  }
];

const OPTIONAL_CONFIG: RequiredConfig[] = [
  {
    name: 'Redis Host',
    envVar: 'REDIS_HOST',
    description: 'Redis host for rate limiting and caching'
  },
  {
    name: 'Redis Port',
    envVar: 'REDIS_PORT',
    description: 'Redis port'
  },
  {
    name: 'S3 Endpoint',
    envVar: 'S3_ENDPOINT',
    description: 'Custom S3 endpoint (for MinIO)'
  },
  {
    name: 'AWS Access Key',
    envVar: 'AWS_ACCESS_KEY_ID',
    description: 'AWS access key ID'
  },
  {
    name: 'AWS Secret Key',
    envVar: 'AWS_SECRET_ACCESS_KEY',
    description: 'AWS secret access key'
  }
];

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * AUDIT FIX: Validate required configuration at startup
 * Fails fast if critical configuration is missing
 */
export function validateConfig(): ConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check if we're in test mode
  const isTest = process.env.NODE_ENV === 'test';
  
  // Validate JWT configuration - need either secret or public key
  const hasJwtSecret = !!process.env.JWT_SECRET;
  const hasJwtPublicKey = !!process.env.JWT_PUBLIC_KEY;
  
  if (!hasJwtSecret && !hasJwtPublicKey) {
    if (!isTest) {
      errors.push('AUTH: JWT_SECRET or JWT_PUBLIC_KEY must be set');
    }
  }

  // Validate JWT secret length if provided
  if (hasJwtSecret && process.env.JWT_SECRET!.length < 32) {
    warnings.push('AUTH: JWT_SECRET should be at least 32 characters for security');
  }

  // Validate Database URL - required in all environments
  if (!process.env.DATABASE_URL) {
    if (!isTest) {
      errors.push('DATABASE: DATABASE_URL must be set (no defaults allowed)');
    }
  } else {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl.startsWith('postgres://') && !dbUrl.startsWith('postgresql://')) {
      errors.push('DATABASE: DATABASE_URL must be a valid PostgreSQL connection string');
    }
    
    // Warn if using default credentials (check for common defaults)
    const defaultCredentials = ['postgres:postgres', 'user:password', 'admin:admin'];
    for (const cred of defaultCredentials) {
      if (dbUrl.includes(cred)) {
        warnings.push(`DATABASE: DATABASE_URL appears to use default credentials (${cred})`);
      }
    }
  }

  // Validate S3 configuration
  if (!process.env.S3_BUCKET) {
    if (!isTest) {
      errors.push('STORAGE: S3_BUCKET must be set');
    }
  }

  // Warn about missing optional but recommended config
  if (!process.env.REDIS_HOST) {
    warnings.push('CACHE: REDIS_HOST not set - rate limiting will be in-memory only');
  }

  // Validate node environment
  if (!process.env.NODE_ENV) {
    warnings.push('ENV: NODE_ENV not set - defaulting to development');
  }

  // Validate port
  if (process.env.PORT) {
    const port = parseInt(process.env.PORT);
    if (isNaN(port) || port < 1 || port > 65535) {
      errors.push('SERVER: PORT must be a valid port number (1-65535)');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * AUDIT FIX: Validate and throw on startup if config is invalid
 */
export function validateConfigOrDie(): void {
  const result = validateConfig();
  
  // Log warnings
  for (const warning of result.warnings) {
    logger.warn({ warning }, 'Configuration warning');
  }

  // If not valid, log errors and exit
  if (!result.valid) {
    logger.error({ errors: result.errors }, 'Configuration validation failed');
    
    console.error('\n❌ CONFIGURATION ERRORS:');
    for (const error of result.errors) {
      console.error(`   - ${error}`);
    }
    console.error('\nPlease set the required environment variables and restart.\n');
    
    // Exit with error code
    process.exit(1);
  }

  logger.info('Configuration validation passed');
}

/**
 * Get configuration status for health checks
 */
export function getConfigStatus(): Record<string, { set: boolean; valid: boolean }> {
  const status: Record<string, { set: boolean; valid: boolean }> = {};

  for (const config of [...REQUIRED_CONFIG, ...OPTIONAL_CONFIG]) {
    const value = process.env[config.envVar];
    const isSet = !!value;
    const isValid = isSet && (!config.validator || config.validator(value!));
    
    status[config.envVar] = { set: isSet, valid: isValid };
  }

  return status;
}

/**
 * Mask sensitive values for logging
 */
export function getConfigSummary(): Record<string, string> {
  const summary: Record<string, string> = {};
  
  const sensitiveVars = ['JWT_SECRET', 'JWT_PUBLIC_KEY', 'AWS_SECRET_ACCESS_KEY', 'DATABASE_URL'];

  for (const config of [...REQUIRED_CONFIG, ...OPTIONAL_CONFIG]) {
    const value = process.env[config.envVar];
    
    if (!value) {
      summary[config.envVar] = '(not set)';
    } else if (sensitiveVars.includes(config.envVar)) {
      summary[config.envVar] = '***masked***';
    } else {
      summary[config.envVar] = value;
    }
  }

  return summary;
}
