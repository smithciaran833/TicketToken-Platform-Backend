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
  
  // RabbitMQ
  RABBITMQ_USER: {
    secretName: 'tickettoken/production/rabbitmq-user',
    envVarName: 'RABBITMQ_USER',
  },
  RABBITMQ_PASSWORD: {
    secretName: 'tickettoken/production/rabbitmq-password',
    envVarName: 'RABBITMQ_PASSWORD',
  },
  
  // MongoDB
  MONGO_ROOT_USER: {
    secretName: 'tickettoken/production/mongo-root-user',
    envVarName: 'MONGO_ROOT_USER',
  },
  MONGO_ROOT_PASSWORD: {
    secretName: 'tickettoken/production/mongo-root-password',
    envVarName: 'MONGO_ROOT_PASSWORD',
  },
  
  // InfluxDB
  INFLUXDB_ADMIN_PASSWORD: {
    secretName: 'tickettoken/production/influxdb-admin-password',
    envVarName: 'INFLUXDB_ADMIN_PASSWORD',
  },
  INFLUXDB_ADMIN_TOKEN: {
    secretName: 'tickettoken/production/influxdb-admin-token',
    envVarName: 'INFLUXDB_ADMIN_TOKEN',
  },
  
  // JWT
  JWT_ACCESS_SECRET: {
    secretName: 'tickettoken/production/jwt-access-secret',
    envVarName: 'JWT_ACCESS_SECRET',
  },
  JWT_REFRESH_SECRET: {
    secretName: 'tickettoken/production/jwt-refresh-secret',
    envVarName: 'JWT_REFRESH_SECRET',
  },
  
  // Stripe
  STRIPE_SECRET_KEY: {
    secretName: 'tickettoken/production/stripe-secret-key',
    envVarName: 'STRIPE_SECRET_KEY',
  },
  STRIPE_PUBLISHABLE_KEY: {
    secretName: 'tickettoken/production/stripe-publishable-key',
    envVarName: 'STRIPE_PUBLISHABLE_KEY',
  },
  STRIPE_WEBHOOK_SECRET: {
    secretName: 'tickettoken/production/stripe-webhook-secret',
    envVarName: 'STRIPE_WEBHOOK_SECRET',
  },
  
  // SendGrid
  SENDGRID_API_KEY: {
    secretName: 'tickettoken/production/sendgrid-api-key',
    envVarName: 'SENDGRID_API_KEY',
  },
  
  // Twilio
  TWILIO_ACCOUNT_SID: {
    secretName: 'tickettoken/production/twilio-account-sid',
    envVarName: 'TWILIO_ACCOUNT_SID',
  },
  TWILIO_AUTH_TOKEN: {
    secretName: 'tickettoken/production/twilio-auth-token',
    envVarName: 'TWILIO_AUTH_TOKEN',
  },
  
  // Internal
  INTERNAL_SERVICE_SECRET: {
    secretName: 'tickettoken/production/internal-service-secret',
    envVarName: 'INTERNAL_SERVICE_SECRET',
  },
};

export type SecretKey = keyof typeof SECRETS_CONFIG;
