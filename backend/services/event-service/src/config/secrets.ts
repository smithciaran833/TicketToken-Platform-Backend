import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

import { secretsManager } from '@tickettoken/shared/utils/secrets-manager';
import { SECRETS_CONFIG } from '@tickettoken/shared/config/secrets.config';
import { logger } from '../utils/logger';

/**
 * LOW FIX (Issue #8): Expanded secrets loading
 * 
 * Loads all sensitive configuration from secrets manager instead of environment variables.
 * Secrets are then mapped to process.env for consistent access across the application.
 * 
 * Loaded secrets:
 * - Database: POSTGRES_PASSWORD, POSTGRES_USER, POSTGRES_DB
 * - Redis: REDIS_PASSWORD
 * - Authentication: JWT_SECRET
 * - Service-to-Service: SERVICE_SECRET, SERVICE_SECRET_PREVIOUS
 */
export async function loadSecrets() {
  const serviceName = process.env.SERVICE_NAME || 'unknown-service';
  logger.info({ serviceName }, 'Loading secrets from secrets manager');

  try {
    // LOW FIX (Issue #8): Expanded secret list to include JWT and service authentication
    const requiredSecrets: string[] = [
      // Database secrets
      SECRETS_CONFIG.POSTGRES_PASSWORD,
      SECRETS_CONFIG.POSTGRES_USER,
      SECRETS_CONFIG.POSTGRES_DB,
      // Redis secrets
      SECRETS_CONFIG.REDIS_PASSWORD,
      // JWT secrets for user authentication
      'JWT_SECRET',
      // Service-to-service authentication secrets
      'SERVICE_SECRET',
      // Service secret rotation support (optional - may not exist)
      'SERVICE_SECRET_PREVIOUS',
    ];

    const secrets = await secretsManager.getSecrets(requiredSecrets);

    // Map loaded secrets to environment variables for consistent access
    // This allows the rest of the application to use process.env.* as usual
    if (secrets.POSTGRES_PASSWORD) process.env.DB_PASSWORD = secrets.POSTGRES_PASSWORD;
    if (secrets.POSTGRES_USER) process.env.DB_USER = secrets.POSTGRES_USER;
    if (secrets.POSTGRES_DB) process.env.DB_NAME = secrets.POSTGRES_DB;
    if (secrets.REDIS_PASSWORD) process.env.REDIS_PASSWORD = secrets.REDIS_PASSWORD;
    if (secrets.JWT_SECRET) process.env.JWT_SECRET = secrets.JWT_SECRET;
    if (secrets.SERVICE_SECRET) process.env.SERVICE_SECRET = secrets.SERVICE_SECRET;
    // Previous secret is optional (only during rotation)
    if (secrets.SERVICE_SECRET_PREVIOUS) {
      process.env.SERVICE_SECRET_PREVIOUS = secrets.SERVICE_SECRET_PREVIOUS;
    }

    logger.info({
      serviceName,
      databaseCredentials: true,
      redisCredentials: true,
      jwtSecret: !!secrets.JWT_SECRET,
      serviceSecret: !!secrets.SERVICE_SECRET,
      serviceSecretPrevious: !!secrets.SERVICE_SECRET_PREVIOUS,
    }, 'Secrets loaded and mapped to environment variables');

    return secrets;
  } catch (error: any) {
    logger.error({ serviceName, error: error.message }, 'Failed to load secrets');
    throw new Error('Cannot start service without required secrets');
  }
}
