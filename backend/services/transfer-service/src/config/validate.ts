import logger from '../utils/logger';

/**
 * CONFIGURATION VALIDATION
 * 
 * Validates all required environment variables on startup
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
  'JWT_SECRET',
  'SOLANA_RPC_URL',
  'SOLANA_NETWORK',
  'SOLANA_TREASURY_PRIVATE_KEY',
  'SOLANA_COLLECTION_MINT',
];

const OPTIONAL_ENV_VARS = [
  'PORT',
  'HOST',
  'NODE_ENV',
  'REDIS_URL',
  'REDIS_HOST',
  'REDIS_PORT',
  'LOG_LEVEL',
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
    if (varName === 'DB_PORT') {
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

  logger.info('Configuration validation passed', {
    required: REQUIRED_ENV_VARS.length,
    optional: OPTIONAL_ENV_VARS.length
  });
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

    // Try to get version to test connection
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
    service: 'transfer-service',
    port: process.env.PORT || '3019',
    nodeEnv: process.env.NODE_ENV || 'development',
    solanaNetwork: process.env.SOLANA_NETWORK,
    solanaRpcUrl: process.env.SOLANA_RPC_URL,
    dbHost: process.env.DB_HOST,
    dbName: process.env.DB_NAME,
    logLevel: process.env.LOG_LEVEL || 'info'
  };
}
