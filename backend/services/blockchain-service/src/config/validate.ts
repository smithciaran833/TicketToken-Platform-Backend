import { logger } from '../utils/logger';
import { validateServiceUrls, logServiceConfiguration, internalServices } from './services';
import bs58 from 'bs58';

/**
 * CONFIGURATION VALIDATION
 * 
 * Validates all required environment variables on startup
 * 
 * AUDIT FIX #27: Validates HTTPS is used for internal service URLs in production
 * AUDIT FIX #55: Add wallet key format validation
 */

interface ValidationResult {
  valid: boolean;
  missing: string[];
  invalid: string[];
}

const REQUIRED_ENV_VARS = [
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD',
  'REDIS_HOST',
  'REDIS_PORT',
  'JWT_SECRET',
  'SOLANA_RPC_URL',
  'SOLANA_NETWORK',
  'SOLANA_PROGRAM_ID',
  'SOLANA_WALLET_PRIVATE_KEY',
];

/**
 * Validate required environment variables
 */
export function validateConfig(): ValidationResult {
  const missing: string[] = [];
  const invalid: string[] = [];

  // Check required variables
  for (const varName of REQUIRED_ENV_VARS) {
    const value = process.env[varName];
    
    if (!value || value.trim() === '') {
      missing.push(varName);
      continue;
    }

    // Specific validations
    if (varName === 'DB_PORT' || varName === 'REDIS_PORT') {
      const port = parseInt(value, 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        invalid.push(`${varName} (must be valid port number)`);
      }
    }

    if (varName === 'SOLANA_NETWORK') {
      const validNetworks = ['mainnet-beta', 'devnet', 'testnet', 'localnet'];
      if (!validNetworks.includes(value)) {
        invalid.push(`${varName} (must be one of: ${validNetworks.join(', ')})`);
      }
    }

    if (varName === 'SOLANA_RPC_URL') {
      try {
        new URL(value);
      } catch {
        invalid.push(`${varName} (must be valid URL)`);
      }
    }

    if (varName === 'JWT_SECRET' && value.length < 32) {
      invalid.push(`${varName} (must be at least 32 characters)`);
    }
  }

  return {
    valid: missing.length === 0 && invalid.length === 0,
    missing,
    invalid
  };
}

/**
 * Validate and exit if configuration is invalid
 */
export function validateConfigOrExit(): void {
  logger.info('Validating configuration...');

  const result = validateConfig();

  if (!result.valid) {
    logger.error('Configuration validation failed!');

    if (result.missing.length > 0) {
      logger.error('Missing required environment variables:', {
        missing: result.missing
      });
    }

    if (result.invalid.length > 0) {
      logger.error('Invalid environment variable values:', {
        invalid: result.invalid
      });
    }

    logger.error('Please check your .env file or environment configuration');
    process.exit(1);
  }

  logger.info('Configuration validation passed');
}

/**
 * Test Solana connection
 */
export async function testSolanaConnection(): Promise<boolean> {
  try {
    const { Connection } = await import('@solana/web3.js');
    const connection = new Connection(process.env.SOLANA_RPC_URL!, {
      commitment: 'confirmed'
    });

    const version = await connection.getVersion();
    
    logger.info('Solana connection successful', {
      network: process.env.SOLANA_NETWORK,
      rpcUrl: process.env.SOLANA_RPC_URL,
      version: version['solana-core']
    });

    return true;
  } catch (error) {
    logger.error('Failed to connect to Solana RPC', {
      error: (error as Error).message,
      rpcUrl: process.env.SOLANA_RPC_URL
    });
    return false;
  }
}

/**
 * Get configuration summary for logging
 */
export function getConfigSummary() {
  return {
    service: 'blockchain-service',
    port: process.env.PORT || '3015',
    nodeEnv: process.env.NODE_ENV || 'development',
    solanaNetwork: process.env.SOLANA_NETWORK,
    solanaRpcUrl: process.env.SOLANA_RPC_URL,
    dbHost: process.env.DB_HOST,
    dbName: process.env.DB_NAME,
    redisHost: process.env.REDIS_HOST,
    bundlrAddress: process.env.BUNDLR_ADDRESS || 'https://devnet.bundlr.network',
    logLevel: process.env.LOG_LEVEL || 'info'
  };
}

/**
 * AUDIT FIX #27: Validate internal service URLs use HTTPS in production
 * 
 * This should be called at startup to fail fast if HTTP URLs are configured
 */
export function validateInternalServiceUrls(): void {
  const isProduction = process.env.NODE_ENV === 'production';
  
  logger.info('Validating internal service URLs...');
  
  const result = validateServiceUrls();
  
  if (!result.valid) {
    if (isProduction) {
      // In production, fail fast
      logger.error('Internal service URL validation failed (SECURITY)', {
        errors: result.errors
      });
      throw new Error(
        `SECURITY: Internal service URL validation failed:\n${result.errors.join('\n')}`
      );
    } else {
      // In development, warn but continue
      logger.warn('Internal service URL validation warnings', {
        errors: result.errors,
        hint: 'HTTP is allowed in development but will fail in production'
      });
    }
  }
  
  // Log service configuration
  logServiceConfiguration();
  
  // Warn about TLS verification disabled
  if (process.env.INTERNAL_TLS_REJECT_UNAUTHORIZED === 'false') {
    logger.warn('TLS certificate verification is DISABLED', {
      security: 'WARNING',
      hint: 'This should never be disabled in production!',
      env: 'INTERNAL_TLS_REJECT_UNAUTHORIZED=false'
    });
  }
  
  logger.info('Internal service URL validation passed', {
    servicesConfigured: Object.keys(internalServices).length,
    httpsRequired: isProduction
  });
}

/**
 * AUDIT FIX #55: Validate Solana private key format
 * 
 * Validates that a Solana private key is properly formatted:
 * - Must be valid base58 encoding
 * - Decoded length must be 64 bytes (keypair) or 32 bytes (seed)
 * 
 * SECURITY: Never logs the actual key value
 * 
 * @param key - The base58-encoded private key to validate
 * @returns Object with valid flag and error message if invalid
 */
export function validateSolanaPrivateKey(key: string): { valid: boolean; error?: string } {
  if (!key || key.trim() === '') {
    return { valid: false, error: 'Private key is empty' };
  }

  try {
    // Check base58 encoding
    const decoded = bs58.decode(key);
    
    // Check length - 64 bytes for keypair (private + public), 32 bytes for seed only
    if (decoded.length === 64) {
      // Full keypair format (private key + public key)
      logger.debug('Solana key validated', { format: 'keypair', length: 64 });
      return { valid: true };
    }
    
    if (decoded.length === 32) {
      // Seed format (just the private key seed)
      logger.debug('Solana key validated', { format: 'seed', length: 32 });
      return { valid: true };
    }
    
    // Invalid length
    return {
      valid: false,
      error: `Invalid key length: expected 64 bytes (keypair) or 32 bytes (seed), got ${decoded.length} bytes`
    };
    
  } catch (error) {
    // Invalid base58 encoding
    return {
      valid: false,
      error: 'Invalid base58 encoding in private key'
    };
  }
}

/**
 * Validate Solana wallet key at startup
 * AUDIT FIX #55: Fail fast with clear error message
 */
export function validateSolanaWalletKey(): void {
  const key = process.env.SOLANA_WALLET_PRIVATE_KEY;
  
  if (!key) {
    throw new Error(
      'SOLANA_WALLET_PRIVATE_KEY is not configured. ' +
      'Please set it in your environment or secrets manager.'
    );
  }
  
  const result = validateSolanaPrivateKey(key);
  
  if (!result.valid) {
    // SECURITY: Never log the actual key
    throw new Error(
      `SOLANA_WALLET_PRIVATE_KEY validation failed: ${result.error}. ` +
      'Please verify the key format is correct (base58-encoded keypair or seed).'
    );
  }
  
  logger.info('Solana wallet key validated', {
    // Don't log the key itself, just confirmation
    valid: true,
    security: 'Key value not logged'
  });
}

/**
 * Full startup validation
 * Validates all configuration including HTTPS requirements
 */
export function validateAllConfigOrExit(): void {
  try {
    // Basic config validation
    validateConfigOrExit();
    
    // AUDIT FIX #27: Internal service HTTPS validation
    validateInternalServiceUrls();
    
    // AUDIT FIX #55: Solana wallet key format validation
    validateSolanaWalletKey();
    
    logger.info('All configuration validation passed');
  } catch (error) {
    logger.error('Configuration validation failed', {
      error: (error as Error).message
    });
    process.exit(1);
  }
}
