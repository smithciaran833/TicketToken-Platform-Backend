// @ts-nocheck
/**
 * Jest Setup File
 * Runs before all tests
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

// Set default test database configuration
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '6432';
process.env.DB_NAME = 'test_db';
process.env.DB_USER = 'test_user';
process.env.DB_PASSWORD = 'test_password';

// Set default test MongoDB configuration
process.env.MONGODB_URI = 'mongodb://localhost:27017/test_db';

// Set default test Elasticsearch configuration
process.env.ELASTICSEARCH_NODE = 'http://localhost:9200';

// Set default test Redis configuration
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';

// Set default test RabbitMQ configuration
process.env.RABBITMQ_URL = 'amqp://localhost:5672';

// Set default JWT configuration
process.env.JWT_SECRET = 'test-secret-key-minimum-32-chars-long!';
process.env.JWT_ISSUER = 'tickettoken-auth-service';
process.env.JWT_AUDIENCE = 'search-service';

// Increase test timeout for integration tests
jest.setTimeout(30000);

// Global test utilities
global.console = {
  ...console,
  // Suppress console logs in tests unless LOG_LEVEL is set
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
