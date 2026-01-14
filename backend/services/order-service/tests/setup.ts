/**
 * Jest Test Setup
 * Runs before all tests
 */

import type { Config } from 'jest';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5433/order_service_test';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6380';
process.env.RABBITMQ_URL = 'amqp://localhost:5673';
process.env.JWT_SECRET = 'test-secret-minimum-32-characters-long';
process.env.INTERNAL_SERVICE_SECRET = 'test-internal-secret-minimum-32-chars';
process.env.EVENT_SERVICE_URL = 'http://localhost:3001';
process.env.TICKET_SERVICE_URL = 'http://localhost:3002';
process.env.PAYMENT_SERVICE_URL = 'http://localhost:3003';

// Export empty object to make this a module
export {};
