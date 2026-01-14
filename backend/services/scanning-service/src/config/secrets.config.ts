/**
 * Secrets Configuration
 * Maps AWS Secrets Manager secret names to environment variable names
 */
export const SECRETS_CONFIG = {
  // Database secrets
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
};

export type SecretKey = keyof typeof SECRETS_CONFIG;
