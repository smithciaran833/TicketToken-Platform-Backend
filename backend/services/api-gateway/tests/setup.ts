// Test setup
process.env.NODE_ENV = 'test';
process.env.AUTH_SERVICE_URL = 'http://auth:3001';
process.env.VENUE_SERVICE_URL = 'http://venue:3002';
process.env.EVENT_SERVICE_URL = 'http://event:3003';
process.env.TICKET_SERVICE_URL = 'http://ticket:3004';
process.env.PAYMENT_SERVICE_URL = 'http://payment:3005';
process.env.MARKETPLACE_SERVICE_URL = 'http://marketplace:3006';
process.env.NOTIFICATION_SERVICE_URL = 'http://notification:3007';
process.env.ANALYTICS_SERVICE_URL = 'http://analytics:3008';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.JWT_SECRET = 'test-secret';
process.env.API_GATEWAY_PORT = '3000';

// Silence console during tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
