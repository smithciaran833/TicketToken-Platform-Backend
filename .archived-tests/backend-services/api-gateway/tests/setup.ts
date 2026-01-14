// Test setup - All environment variables required for tests
process.env.NODE_ENV = 'test';

// Server configuration
process.env.PORT = '3000';
process.env.HOST = '0.0.0.0';
process.env.LOG_LEVEL = 'error'; // Suppress logs during tests

// JWT configuration
process.env.JWT_SECRET = 'test-secret-key-at-least-32-characters-long!';
process.env.JWT_ACCESS_TOKEN_EXPIRY = '15m';
process.env.JWT_REFRESH_TOKEN_EXPIRY = '7d';
process.env.JWT_ISSUER = 'tickettoken-api-gateway-test';

// Redis configuration
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
process.env.REDIS_DB = '15'; // Use separate DB for tests

// All 19 service URLs
process.env.AUTH_SERVICE_URL = 'http://localhost:4001';
process.env.VENUE_SERVICE_URL = 'http://localhost:4002';
process.env.EVENT_SERVICE_URL = 'http://localhost:4003';
process.env.TICKET_SERVICE_URL = 'http://localhost:4004';
process.env.PAYMENT_SERVICE_URL = 'http://localhost:4005';
process.env.MARKETPLACE_SERVICE_URL = 'http://localhost:4006';
process.env.ANALYTICS_SERVICE_URL = 'http://localhost:4007';
process.env.NOTIFICATION_SERVICE_URL = 'http://localhost:4008';
process.env.INTEGRATION_SERVICE_URL = 'http://localhost:4009';
process.env.COMPLIANCE_SERVICE_URL = 'http://localhost:4010';
process.env.QUEUE_SERVICE_URL = 'http://localhost:4011';
process.env.SEARCH_SERVICE_URL = 'http://localhost:4012';
process.env.FILE_SERVICE_URL = 'http://localhost:4013';
process.env.MONITORING_SERVICE_URL = 'http://localhost:4014';
process.env.BLOCKCHAIN_SERVICE_URL = 'http://localhost:4015';
process.env.ORDER_SERVICE_URL = 'http://localhost:4016';
process.env.SCANNING_SERVICE_URL = 'http://localhost:4017';
process.env.MINTING_SERVICE_URL = 'http://localhost:4018';
process.env.TRANSFER_SERVICE_URL = 'http://localhost:4019';

// Optional configuration
process.env.RATE_LIMIT_MAX = '100';
process.env.RATE_LIMIT_WINDOW_MS = '60000';
process.env.MAX_REQUEST_SIZE = '10mb';
process.env.CORS_ORIGIN = '*';
process.env.ENABLE_SWAGGER = 'false';

// Silence console during tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
