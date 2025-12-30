import { secretsManager } from '@tickettoken/shared';
import { logger } from '../utils/logger';

// Local secrets config for auth-service specific secrets
// These extend the base SECRETS_CONFIG from shared
const AUTH_SECRETS_CONFIG = {
  // Database
  POSTGRES_PASSWORD: {
    secretName: 'tickettoken/production/postgres-password',
    envVarName: 'POSTGRES_PASSWORD',
  },
  POSTGRES_USER: {
    secretName: 'tickettoken/production/postgres-user',
    envVarName: 'POSTGRES_USER',
  },
  POSTGRES_DB: {
    secretName: 'tickettoken/production/postgres-db',
    envVarName: 'POSTGRES_DB',
  },
  
  // Redis
  REDIS_PASSWORD: {
    secretName: 'tickettoken/production/redis-password',
    envVarName: 'REDIS_PASSWORD',
  },
  
  // JWT RSA Keys
  JWT_PRIVATE_KEY: {
    secretName: 'tickettoken/production/jwt-private-key',
    envVarName: 'JWT_PRIVATE_KEY',
  },
  JWT_PUBLIC_KEY: {
    secretName: 'tickettoken/production/jwt-public-key',
    envVarName: 'JWT_PUBLIC_KEY',
  },
  JWT_PRIVATE_KEY_PREVIOUS: {
    secretName: 'tickettoken/production/jwt-private-key-previous',
    envVarName: 'JWT_PRIVATE_KEY_PREVIOUS',
  },
  JWT_PUBLIC_KEY_PREVIOUS: {
    secretName: 'tickettoken/production/jwt-public-key-previous',
    envVarName: 'JWT_PUBLIC_KEY_PREVIOUS',
  },
  
  // Encryption
  ENCRYPTION_KEY: {
    secretName: 'tickettoken/production/encryption-key',
    envVarName: 'ENCRYPTION_KEY',
  },
  
  // OAuth - Google
  GOOGLE_CLIENT_ID: {
    secretName: 'tickettoken/production/google-client-id',
    envVarName: 'GOOGLE_CLIENT_ID',
  },
  GOOGLE_CLIENT_SECRET: {
    secretName: 'tickettoken/production/google-client-secret',
    envVarName: 'GOOGLE_CLIENT_SECRET',
  },
  
  // OAuth - GitHub
  GITHUB_CLIENT_ID: {
    secretName: 'tickettoken/production/github-client-id',
    envVarName: 'GITHUB_CLIENT_ID',
  },
  GITHUB_CLIENT_SECRET: {
    secretName: 'tickettoken/production/github-client-secret',
    envVarName: 'GITHUB_CLIENT_SECRET',
  },
  
  // OAuth - Apple
  APPLE_CLIENT_ID: {
    secretName: 'tickettoken/production/apple-client-id',
    envVarName: 'APPLE_CLIENT_ID',
  },
  APPLE_TEAM_ID: {
    secretName: 'tickettoken/production/apple-team-id',
    envVarName: 'APPLE_TEAM_ID',
  },
  APPLE_KEY_ID: {
    secretName: 'tickettoken/production/apple-key-id',
    envVarName: 'APPLE_KEY_ID',
  },
  APPLE_PRIVATE_KEY: {
    secretName: 'tickettoken/production/apple-private-key',
    envVarName: 'APPLE_PRIVATE_KEY',
  },
  
  // Email
  RESEND_API_KEY: {
    secretName: 'tickettoken/production/resend-api-key',
    envVarName: 'RESEND_API_KEY',
  },
};

export interface LoadedSecrets {
  POSTGRES_PASSWORD: string;
  POSTGRES_USER: string;
  POSTGRES_DB: string;
  REDIS_PASSWORD?: string;
  JWT_PRIVATE_KEY?: string;
  JWT_PUBLIC_KEY?: string;
  JWT_PRIVATE_KEY_PREVIOUS?: string;
  JWT_PUBLIC_KEY_PREVIOUS?: string;
  ENCRYPTION_KEY?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  APPLE_CLIENT_ID?: string;
  APPLE_TEAM_ID?: string;
  APPLE_KEY_ID?: string;
  APPLE_PRIVATE_KEY?: string;
  RESEND_API_KEY?: string;
}

export async function loadSecrets(): Promise<LoadedSecrets> {
  const isProduction = process.env.NODE_ENV === 'production';
  
  logger.info('Loading secrets...', { environment: process.env.NODE_ENV });

  const secrets: Record<string, string> = {};

  try {
    // Core secrets (always required)
    const coreSecrets = [
      AUTH_SECRETS_CONFIG.POSTGRES_PASSWORD,
      AUTH_SECRETS_CONFIG.POSTGRES_USER,
      AUTH_SECRETS_CONFIG.POSTGRES_DB,
      AUTH_SECRETS_CONFIG.REDIS_PASSWORD,
    ];

    const coreLoaded = await secretsManager.getSecrets(coreSecrets);
    Object.assign(secrets, coreLoaded);

    // JWT secrets (required in production)
    if (isProduction) {
      const jwtSecrets = [
        AUTH_SECRETS_CONFIG.JWT_PRIVATE_KEY,
        AUTH_SECRETS_CONFIG.JWT_PUBLIC_KEY,
      ];
      const jwtLoaded = await secretsManager.getSecrets(jwtSecrets);
      Object.assign(secrets, jwtLoaded);

      // Optional rotation keys
      try {
        const rotationSecrets = [
          AUTH_SECRETS_CONFIG.JWT_PRIVATE_KEY_PREVIOUS,
          AUTH_SECRETS_CONFIG.JWT_PUBLIC_KEY_PREVIOUS,
        ];
        const rotationLoaded = await secretsManager.getSecrets(rotationSecrets);
        Object.assign(secrets, rotationLoaded);
        logger.info('JWT rotation keys loaded');
      } catch {
        logger.info('No JWT rotation keys found (optional)');
      }

      // Encryption key
      const encryptionSecrets = [AUTH_SECRETS_CONFIG.ENCRYPTION_KEY];
      const encryptionLoaded = await secretsManager.getSecrets(encryptionSecrets);
      Object.assign(secrets, encryptionLoaded);
    }

    // OAuth secrets (optional)
    try {
      const oauthSecrets = [
        AUTH_SECRETS_CONFIG.GOOGLE_CLIENT_ID,
        AUTH_SECRETS_CONFIG.GOOGLE_CLIENT_SECRET,
        AUTH_SECRETS_CONFIG.GITHUB_CLIENT_ID,
        AUTH_SECRETS_CONFIG.GITHUB_CLIENT_SECRET,
        AUTH_SECRETS_CONFIG.APPLE_CLIENT_ID,
        AUTH_SECRETS_CONFIG.APPLE_TEAM_ID,
        AUTH_SECRETS_CONFIG.APPLE_KEY_ID,
        AUTH_SECRETS_CONFIG.APPLE_PRIVATE_KEY,
      ];
      const oauthLoaded = await secretsManager.getSecrets(oauthSecrets);
      Object.assign(secrets, oauthLoaded);
      logger.info('OAuth secrets loaded');
    } catch {
      logger.warn('Some OAuth secrets not found - OAuth providers may be unavailable');
    }

    // Email secrets
    try {
      const emailSecrets = [AUTH_SECRETS_CONFIG.RESEND_API_KEY];
      const emailLoaded = await secretsManager.getSecrets(emailSecrets);
      Object.assign(secrets, emailLoaded);
    } catch {
      if (isProduction) {
        throw new Error('RESEND_API_KEY is required in production');
      }
      logger.warn('Email secrets not found - email functionality unavailable');
    }

    // Set secrets as environment variables
    for (const [key, value] of Object.entries(secrets)) {
      if (value && !process.env[key]) {
        process.env[key] = value;
      }
    }

    logger.info('Secrets loaded successfully');
    return secrets as unknown as LoadedSecrets;

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to load secrets', { error: message });
    throw new Error(`Cannot start service without required secrets: ${message}`);
  }
}
