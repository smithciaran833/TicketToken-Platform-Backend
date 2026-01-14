/**
 * Jest Test Setup
 * 
 * AUDIT FIX TEST-L2: Proper test setup with mocking
 */

import { jest } from '@jest/globals';

// Extend Jest matchers
expect.extend({
  toBeWithinRange(received: number, floor: number, ceiling: number) {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () =>
          `expected ${received} not to be within range ${floor} - ${ceiling}`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `expected ${received} to be within range ${floor} - ${ceiling}`,
        pass: false,
      };
    }
  },
});

// Mock environment variables for tests
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Suppress logs during tests
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.INTERNAL_SERVICE_SECRET = 'test-internal-secret';
process.env.DATABASE_URL = 'postgresql://localhost:5432/notification_service_test';
process.env.REDIS_URL = 'redis://localhost:6379/1';
process.env.RABBITMQ_URL = 'amqp://localhost:5672';

// Mock Redis
jest.mock('../src/config/redis', () => ({
  redisClient: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    exists: jest.fn().mockResolvedValue(0),
    incr: jest.fn().mockResolvedValue(1),
    incrbyfloat: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    ttl: jest.fn().mockResolvedValue(-2),
    pttl: jest.fn().mockResolvedValue(-2),
    keys: jest.fn().mockResolvedValue([]),
    lpush: jest.fn().mockResolvedValue(1),
    ltrim: jest.fn().mockResolvedValue('OK'),
    lrange: jest.fn().mockResolvedValue([]),
    eval: jest.fn().mockResolvedValue(1),
    quit: jest.fn().mockResolvedValue('OK'),
  },
  closeRedisConnections: jest.fn().mockResolvedValue(undefined),
}));

// Mock RabbitMQ
jest.mock('../src/config/rabbitmq', () => ({
  rabbitmqService: {
    connect: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    publish: jest.fn().mockResolvedValue(true),
    consume: jest.fn().mockResolvedValue(undefined),
  },
}));

// Mock MongoDB
jest.mock('../src/config/mongodb', () => ({
  initializeMongoDB: jest.fn().mockResolvedValue(undefined),
  closeMongoDB: jest.fn().mockResolvedValue(undefined),
  getMongoDb: jest.fn().mockReturnValue({
    collection: jest.fn().mockReturnValue({
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue([]),
      }),
      insertOne: jest.fn().mockResolvedValue({ insertedId: 'test-id' }),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    }),
  }),
}));

// Mock SendGrid
jest.mock('@sendgrid/mail', () => ({
  setApiKey: jest.fn(),
  send: jest.fn().mockResolvedValue([{ statusCode: 202 }]),
}));

// Mock Twilio
jest.mock('twilio', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        sid: 'SM123',
        status: 'queued',
      }),
    },
    validate: jest.fn().mockReturnValue(true),
  }));
});

// Global test utilities
global.testUtils = {
  /**
   * Create a mock user for testing
   */
  createMockUser: (overrides = {}) => ({
    id: 'test-user-id',
    email: 'test@example.com',
    tenantId: 'test-tenant-id',
    roles: ['user'],
    ...overrides,
  }),

  /**
   * Create a mock notification request
   */
  createMockNotificationRequest: (overrides = {}) => ({
    type: 'email',
    template: 'test_template',
    recipients: [
      {
        userId: 'user-1',
        email: 'recipient@example.com',
      },
    ],
    data: {
      subject: 'Test Subject',
      body: 'Test Body',
    },
    ...overrides,
  }),

  /**
   * Create a mock JWT token
   */
  createMockToken: (payload = {}) => {
    const defaultPayload = {
      sub: 'test-user-id',
      email: 'test@example.com',
      tenantId: 'test-tenant-id',
      roles: ['user'],
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    return Buffer.from(JSON.stringify({ ...defaultPayload, ...payload })).toString('base64');
  },

  /**
   * Wait for a specified number of milliseconds
   */
  wait: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),

  /**
   * Generate a random UUID
   */
  randomUUID: () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  }),
};

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});

// Type declarations for global test utilities
declare global {
  var testUtils: {
    createMockUser: (overrides?: Record<string, any>) => any;
    createMockNotificationRequest: (overrides?: Record<string, any>) => any;
    createMockToken: (payload?: Record<string, any>) => string;
    wait: (ms: number) => Promise<void>;
    randomUUID: () => string;
  };

  namespace jest {
    interface Matchers<R> {
      toBeWithinRange(floor: number, ceiling: number): R;
    }
  }
}
