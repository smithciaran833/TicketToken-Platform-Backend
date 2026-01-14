import logger from './logger';

// =============================================================================
// SECRET VALIDATION CONFIGURATION
// =============================================================================

interface RequiredSecret {
  name: string;
  minLength?: number;
  pattern?: RegExp;
  description?: string;
}

interface RequiredConfig {
  name: string;
  required?: boolean;
  defaultValue?: string;
  description?: string;
}

// Critical secrets that MUST be present in production
const REQUIRED_SECRETS: RequiredSecret[] = [
  {
    name: 'JWT_SECRET',
    minLength: 32,
    description: 'JWT signing secret for authentication'
  },
  {
    name: 'INTERNAL_SERVICE_SECRET',
    minLength: 32,
    description: 'HMAC secret for internal service authentication'
  },
  {
    name: 'WEBHOOK_SECRET',
    minLength: 32,
    description: 'HMAC secret for webhook signature verification'
  },
  {
    name: 'DB_PASSWORD',
    minLength: 8,
    description: 'Database password'
  }
];

// Secrets that should be present but have defaults or are optional
const RECOMMENDED_SECRETS: RequiredSecret[] = [
  {
    name: 'PINATA_API_KEY',
    description: 'Pinata IPFS API key'
  },
  {
    name: 'PINATA_JWT',
    description: 'Pinata JWT token for IPFS uploads'
  },
  {
    name: 'REDIS_PASSWORD',
    description: 'Redis password (optional for local dev)'
  },
  {
    name: 'STRIPE_WEBHOOK_SECRET',
    description: 'Stripe webhook signing secret'
  }
];

// Required configuration values (not secrets)
const REQUIRED_CONFIG: RequiredConfig[] = [
  {
    name: 'SOLANA_RPC_URL',
    required: true,
    description: 'Solana RPC endpoint URL'
  },
  {
    name: 'SOLANA_NETWORK',
    defaultValue: 'devnet',
    description: 'Solana network (mainnet-beta, devnet, testnet)'
  },
  {
    name: 'DB_HOST',
    required: true,
    description: 'Database host'
  },
  {
    name: 'DB_NAME',
    defaultValue: 'tickettoken',
    description: 'Database name'
  },
  {
    name: 'REDIS_HOST',
    defaultValue: 'redis',
    description: 'Redis host'
  }
];

// =============================================================================
// VALIDATION FUNCTIONS
// =============================================================================

/**
 * Validate all required secrets are present and meet criteria
 * In production, throws on validation failure
 * In development, logs warnings
 */
export function validateSecrets(): void {
  const isProduction = process.env.NODE_ENV === 'production';
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required secrets
  for (const secret of REQUIRED_SECRETS) {
    const value = process.env[secret.name];

    if (!value) {
      errors.push(`Missing required secret: ${secret.name} - ${secret.description}`);
      continue;
    }

    if (secret.minLength && value.length < secret.minLength) {
      errors.push(
        `${secret.name} must be at least ${secret.minLength} characters ` +
        `(current: ${value.length})`
      );
    }

    if (secret.pattern && !secret.pattern.test(value)) {
      errors.push(`${secret.name} does not match required format`);
    }

    // Warn about weak secrets in production
    if (isProduction && value.length < 64) {
      warnings.push(`${secret.name} should be at least 64 characters for production`);
    }
  }

  // Check recommended secrets (warnings only)
  for (const secret of RECOMMENDED_SECRETS) {
    const value = process.env[secret.name];

    if (!value) {
      warnings.push(`Missing recommended secret: ${secret.name} - ${secret.description}`);
    }
  }

  // Log warnings
  if (warnings.length > 0) {
    logger.warn('Secret validation warnings', {
      warnings,
      count: warnings.length
    });
  }

  // Handle errors
  if (errors.length > 0) {
    const errorMessage = `Secret validation failed:\n  - ${errors.join('\n  - ')}`;

    if (isProduction) {
      logger.error('Secret validation failed in production', { errors });
      throw new Error(errorMessage);
    } else {
      logger.warn('Secret validation errors (non-production)', { errors });
    }
  } else {
    logger.info('✅ Secret validation passed', {
      requiredCount: REQUIRED_SECRETS.length,
      warningCount: warnings.length
    });
  }
}

/**
 * Validate required configuration values
 */
export function validateConfig(): void {
  const isProduction = process.env.NODE_ENV === 'production';
  const errors: string[] = [];
  const applied: string[] = [];

  for (const config of REQUIRED_CONFIG) {
    const value = process.env[config.name];

    if (!value) {
      if (config.required) {
        errors.push(`Missing required config: ${config.name} - ${config.description}`);
      } else if (config.defaultValue) {
        process.env[config.name] = config.defaultValue;
        applied.push(`${config.name}=${config.defaultValue}`);
      }
    }
  }

  if (applied.length > 0) {
    logger.info('Applied default configuration values', { applied });
  }

  if (errors.length > 0) {
    const errorMessage = `Configuration validation failed:\n  - ${errors.join('\n  - ')}`;

    if (isProduction) {
      throw new Error(errorMessage);
    } else {
      logger.warn('Configuration validation errors (non-production)', { errors });
    }
  } else {
    logger.info('✅ Configuration validation passed');
  }
}

/**
 * Run all validations
 * Call this after loadSecrets() in the startup sequence
 */
export function validateAll(): void {
  logger.info('Running configuration validation...');
  
  validateSecrets();
  validateConfig();
  
  logger.info('✅ All configuration validations passed');
}

/**
 * Get validation status for health checks
 */
export function getValidationStatus(): {
  valid: boolean;
  missingSecrets: string[];
  missingConfig: string[];
} {
  const missingSecrets = REQUIRED_SECRETS
    .filter(s => !process.env[s.name])
    .map(s => s.name);

  const missingConfig = REQUIRED_CONFIG
    .filter(c => c.required && !process.env[c.name])
    .map(c => c.name);

  return {
    valid: missingSecrets.length === 0 && missingConfig.length === 0,
    missingSecrets,
    missingConfig
  };
}

/**
 * Check if running in production mode
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Check if a specific feature is enabled
 */
export function isFeatureEnabled(featureName: string, defaultValue: boolean = false): boolean {
  const value = process.env[`FEATURE_${featureName.toUpperCase()}`];
  if (!value) return defaultValue;
  return value === 'true' || value === '1';
}
