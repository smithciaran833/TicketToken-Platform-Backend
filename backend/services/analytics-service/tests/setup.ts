/**
 * Jest Test Setup - Analytics Service
 */

import { closeRedisConnections } from '../src/config/redis';
import { closePool } from '../src/config/database';

// =============================================================================
// Environment Setup
// =============================================================================

process.env.NODE_ENV = 'test';
process.env.SERVICE_NAME = 'analytics-service';
process.env.LOG_LEVEL = 'silent';

// JWT / Auth secrets (test only)
process.env.JWT_SECRET = 'test-jwt-secret-for-unit-tests-minimum-32-chars';
process.env.JWT_ALGORITHM = 'HS256';
process.env.JWT_ISSUER = 'tickettoken-test';
process.env.JWT_AUDIENCE = 'analytics-service-test';
process.env.INTERNAL_AUTH_SECRET = 'test-internal-secret-for-unit-tests-only';
process.env.PRIVACY_SALT = 'test-privacy-salt-for-unit-tests-only';

// Database
process.env.DATABASE_HOST = process.env.DATABASE_HOST || 'localhost';
process.env.DATABASE_PORT = process.env.DATABASE_PORT || '5432';
process.env.DATABASE_NAME = process.env.DATABASE_NAME || 'analytics_test';
process.env.DATABASE_USER = process.env.DATABASE_USER || 'postgres';
process.env.DATABASE_PASSWORD = process.env.DATABASE_PASSWORD || 'postgres';
process.env.DATABASE_SSL = 'false';

// Redis
process.env.REDIS_HOST = process.env.REDIS_HOST || 'localhost';
process.env.REDIS_PORT = process.env.REDIS_PORT || '6379';

// MongoDB
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/analytics_test';

// InfluxDB
process.env.INFLUXDB_URL = process.env.INFLUXDB_URL || 'http://localhost:8086';
process.env.INFLUXDB_TOKEN = process.env.INFLUXDB_TOKEN || 'test-token';
process.env.INFLUXDB_ORG = process.env.INFLUXDB_ORG || 'test-org';
process.env.INFLUXDB_BUCKET = process.env.INFLUXDB_BUCKET || 'analytics_test';

// RabbitMQ
process.env.RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost:5672';

// =============================================================================
// Jest Timeout
// =============================================================================

jest.setTimeout(10000);

// =============================================================================
// Custom Matchers
// =============================================================================

expect.extend({
  toBeWithinRange(received: number, floor: number, ceiling: number) {
    const pass = received >= floor && received <= ceiling;
    return {
      message: () =>
        pass
          ? `expected ${received} not to be within range ${floor} - ${ceiling}`
          : `expected ${received} to be within range ${floor} - ${ceiling}`,
      pass,
    };
  },
});

// =============================================================================
// Global Hooks
// =============================================================================

beforeEach(() => {
  jest.clearAllMocks();
});

afterAll(async () => {
  try {
    await closeRedisConnections();
  } catch (e) {
    // Ignore cleanup errors
  }

  try {
    await closePool();
  } catch (e) {
    // Ignore cleanup errors
  }
});

// =============================================================================
// Type Extensions
// =============================================================================

declare global {
  namespace jest {
    interface Matchers<R> {
      toBeWithinRange(floor: number, ceiling: number): R;
    }
  }
}
