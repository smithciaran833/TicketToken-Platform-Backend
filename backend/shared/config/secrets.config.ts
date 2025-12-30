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

  // JWT RSA Keys (base64 encoded PEM)
  JWT_PRIVATE_KEY: {
    secretName: 'tickettoken/production/jwt-private-key',
    envVarName: 'JWT_PRIVATE_KEY',
  },
  JWT_PUBLIC_KEY: {
    secretName: 'tickettoken/production/jwt-public-key',
    envVarName: 'JWT_PUBLIC_KEY',
  },
  // Rotated keys (for seamless rotation)
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

  // Email (Resend)
  RESEND_API_KEY: {
    secretName: 'tickettoken/production/resend-api-key',
    envVarName: 'RESEND_API_KEY',
  },

  // SendGrid (legacy)
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

  // Internal
  INTERNAL_SERVICE_SECRET: {
    secretName: 'tickettoken/production/internal-service-secret',
    envVarName: 'INTERNAL_SERVICE_SECRET',
  },
};

export type SecretKey = keyof typeof SECRETS_CONFIG;
