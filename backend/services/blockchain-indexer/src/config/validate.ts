import logger from '../utils/logger';

/**
 * CONFIGURATION VALIDATION
 * 
 * Validates all required environment variables on startup for blockchain-indexer
 */

interface ValidationResult {
  valid: boolean;
  missing: string[];
  invalid: string[];
}

const REQUIRED_ENV_VARS = [
  // PostgreSQL
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD',
  // MongoDB
  'MONGODB_URL',
  'MONGODB_DB_NAME',
  // Redis
  'REDIS_HOST',
  'REDIS_PORT',
  // Solana
  'SOLANA_RPC_URL',
  'SOLANA_NETWORK',
  'SOLANA_PROGRAM_ID',
  // JWT
  'JWT_SECRET',
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

    if (varName === 'SOLANA_RPC_URL' || varName === 'MONGODB_URL') {
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
      logger.error({
        missing: result.missing
      }, 'Missing required environment variables');
    }

    if (result.invalid.length > 0) {
      logger.error({
        invalid: result.invalid
      }, 'Invalid environment variable values');
    }

    logger.error('Please check your .env file or environment configuration');
    process.exit(1);
  }

  logger.info('Configuration validation passed');
}

/**
 * Test MongoDB connection
 */
export async function testMongoDBConnection(): Promise<boolean> {
  try {
    const mongoose = await import('mongoose');
    
    // Create test connection
    const conn = await mongoose.connect(process.env.MONGODB_URL!, {
      dbName: process.env.MONGODB_DB_NAME,
      serverSelectionTimeoutMS: 5000
    });

    logger.info({
      url: process.env.MONGODB_URL,
      database: process.env.MONGODB_DB_NAME,
      host: conn.connection.host
    }, 'MongoDB connection successful');

    // Close test connection
    await conn.connection.close();
    return true;
  } catch (error) {
    logger.error({
      error: (error as Error).message,
      url: process.env.MONGODB_URL
    }, 'Failed to connect to MongoDB');
    return false;
  }
}

/**
 * Test PostgreSQL connection
 */
export async function testPostgresConnection(): Promise<boolean> {
  try {
    const { Pool } = await import('pg');
    
    const pool = new Pool({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      connectionTimeoutMillis: 5000
    });

    // Test query
    const result = await pool.query('SELECT NOW()');
    
    logger.info({
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
      serverTime: result.rows[0].now
    }, 'PostgreSQL connection successful');

    await pool.end();
    return true;
  } catch (error) {
    logger.error({
      error: (error as Error).message,
      host: process.env.DB_HOST,
      database: process.env.DB_NAME
    }, 'Failed to connect to PostgreSQL');
    return false;
  }
}

/**
 * Test Solana RPC connection
 */
export async function testSolanaConnection(): Promise<boolean> {
  try {
    const { Connection } = await import('@solana/web3.js');
    const connection = new Connection(process.env.SOLANA_RPC_URL!, {
      commitment: 'confirmed'
    });

    const version = await connection.getVersion();
    
    logger.info({
      network: process.env.SOLANA_NETWORK,
      rpcUrl: process.env.SOLANA_RPC_URL,
      version: version['solana-core']
    }, 'Solana RPC connection successful');

    return true;
  } catch (error) {
    logger.error({
      error: (error as Error).message,
      rpcUrl: process.env.SOLANA_RPC_URL
    }, 'Failed to connect to Solana RPC');
    return false;
  }
}

/**
 * Test all connections
 */
export async function testAllConnections(): Promise<boolean> {
  logger.info('Testing all service connections...');

  const [mongoOk, pgOk, solanaOk] = await Promise.all([
    testMongoDBConnection(),
    testPostgresConnection(),
    testSolanaConnection()
  ]);

  if (!mongoOk || !pgOk || !solanaOk) {
    logger.error({
      mongodb: mongoOk,
      postgresql: pgOk,
      solana: solanaOk
    }, 'Some connections failed');
    return false;
  }

  logger.info('All service connections successful');
  return true;
}

/**
 * Get configuration summary for logging
 */
export function getConfigSummary() {
  return {
    service: 'blockchain-indexer',
    port: process.env.PORT || '3012',
    nodeEnv: process.env.NODE_ENV || 'development',
    solanaNetwork: process.env.SOLANA_NETWORK,
    solanaRpcUrl: process.env.SOLANA_RPC_URL,
    postgresHost: process.env.DB_HOST,
    postgresDb: process.env.DB_NAME,
    mongodbUrl: process.env.MONGODB_URL?.replace(/:[^:@]+@/, ':****@'), // Hide password
    mongodbDb: process.env.MONGODB_DB_NAME,
    redisHost: process.env.REDIS_HOST,
    logLevel: process.env.LOG_LEVEL || 'info',
    metricsEnabled: process.env.METRICS_ENABLED !== 'false'
  };
}
