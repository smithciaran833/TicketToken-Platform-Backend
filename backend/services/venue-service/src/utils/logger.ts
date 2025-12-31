import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

// SECURITY FIX (LS1-LS3): Comprehensive secret sanitization in logs
// List of sensitive field patterns to redact
const SENSITIVE_PATHS = [
  // Authentication
  'password',
  'pass',
  'passwd',
  'token',
  'apiKey',
  'api_key',
  'secret',
  'secretKey',
  'secret_key',
  'authorization',
  'accessToken',
  'refreshToken',
  'access_token',
  'refresh_token',
  'jwt',
  'bearer',
  'sessionId',
  'session_id',
  
  // HTTP Headers
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'req.headers["x-auth-token"]',
  'req.headers["x-session-id"]',
  'res.headers["set-cookie"]',
  
  // Credentials & Keys
  'credentials',
  'encrypted_credentials',
  'privateKey',
  'private_key',
  'publicKey',
  'public_key',
  'signingKey',
  'signing_key',
  'encryptionKey',
  'encryption_key',
  'webhookSecret',
  'webhook_secret',
  
  // Stripe & Payment
  'stripe_account_id',
  'stripeAccountId',
  'stripe_secret_key',
  'stripeSecretKey',
  'card_number',
  'cardNumber',
  'cvv',
  'cvc',
  'expiry',
  'bank_account',
  'bankAccount',
  'routing_number',
  'routingNumber',
  
  // PII (Personally Identifiable Information)
  'email',
  'phone',
  'ssn',
  'social_security',
  'socialSecurity',
  'date_of_birth',
  'dateOfBirth',
  'dob',
  'address',
  'ip',
  'ipAddress',
  'ip_address',
  
  // Database & Connection Strings
  'connectionString',
  'connection_string',
  'databaseUrl',
  'database_url',
  'DATABASE_URL',
  'REDIS_URL',
  'MONGODB_URI',
  
  // Nested object patterns
  '*.password',
  '*.token',
  '*.secret',
  '*.apiKey',
  '*.credentials',
];

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  // SECURITY FIX (LC6): Use ISO 8601 timestamps for log standardization
  timestamp: pino.stdTimeFunctions.isoTime,
  // SECURITY FIX (LS1-LS3): Comprehensive secret sanitization
  redact: {
    paths: SENSITIVE_PATHS,
    censor: '[REDACTED]', // Show that value was redacted, not just removed
  },
  transport: !isProduction
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          ignore: 'pid,hostname',
          translateTime: 'HH:MM:ss.l',
        },
      }
    : undefined,
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      venueId: req.headers['x-venue-id'],
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
  base: {
    service: process.env.SERVICE_NAME || 'venue-service',
    env: process.env.NODE_ENV || 'development',
  },
});
