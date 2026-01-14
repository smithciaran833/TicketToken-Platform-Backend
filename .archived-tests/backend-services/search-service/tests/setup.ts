/**
 * Jest Test Setup
 * Global configuration and utilities for testing
 */

import { FastifyInstance } from 'fastify';
import { Client as ElasticsearchClient } from '@elastic/elasticsearch';
import Redis from 'ioredis';

// Mock Elasticsearch client
export const mockElasticsearchClient = {
  search: jest.fn(),
  index: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  indices: {
    create: jest.fn(),
    exists: jest.fn(),
    delete: jest.fn(),
  },
} as unknown as ElasticsearchClient;

// Mock Redis client
export const mockRedisClient = {
  set: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
  incr: jest.fn(),
  expire: jest.fn(),
  pexpire: jest.fn(),
  keys: jest.fn(),
  multi: jest.fn().mockReturnThis(),
  exec: jest.fn(),
} as unknown as Redis;

// Mock Logger
export const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  trace: jest.fn(),
  fatal: jest.fn(),
  child: jest.fn().mockReturnThis(),
};

// Test user fixtures
export const testUsers = {
  admin: {
    id: 'admin-123',
    venueId: 'venue-1',
    role: 'admin',
    email: 'admin@test.com',
  },
  regularUser: {
    id: 'user-456',
    venueId: 'venue-1',
    role: 'user',
    email: 'user@test.com',
  },
  otherVenueUser: {
    id: 'user-789',
    venueId: 'venue-2',
    role: 'user',
    email: 'other@test.com',
  },
};

// Test JWT tokens
export const testTokens = {
  admin: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImFkbWluLTEyMyIsInZlbnVlSWQiOiJ2ZW51ZS0xIiwicm9sZSI6ImFkbWluIn0.test',
  regularUser: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6InVzZXItNDU2IiwidmVudWVJZCI6InZlbnVlLTEiLCJyb2xlIjoidXNlciJ9.test',
  otherVenueUser: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6InVzZXItNzg5IiwidmVudWVJZCI6InZlbnVlLTIiLCJyb2xlIjoidXNlciJ9.test',
  expired: 'expired.token.here',
};

// Test data fixtures
export const testVenues = [
  {
    id: 'venue-1',
    name: 'Test Arena',
    city: 'New York',
    capacity: 20000,
    venue_id: 'venue-1',
  },
  {
    id: 'venue-2',
    name: 'Concert Hall',
    city: 'Los Angeles',
    capacity: 5000,
    venue_id: 'venue-2',
  },
];

export const testEvents = [
  {
    id: 'event-1',
    name: 'Rock Concert',
    date: '2024-06-15T20:00:00Z',
    venue_id: 'venue-1',
    venue_name: 'Test Arena',
  },
  {
    id: 'event-2',
    name: 'Jazz Night',
    date: '2024-07-20T19:00:00Z',
    venue_id: 'venue-2',
    venue_name: 'Concert Hall',
  },
];

// Helper to create mock Fastify request
export function createMockRequest(overrides: any = {}) {
  return {
    headers: {},
    query: {},
    params: {},
    body: {},
    user: null,
    ...overrides,
  };
}

// Helper to create mock Fastify reply
export function createMockReply() {
  const reply = {
    code: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    header: jest.fn().mockReturnThis(),
    headers: jest.fn().mockReturnThis(),
  };
  return reply;
}

// Helper functions for integration tests
export function createTestUser(overrides: any = {}) {
  return {
    id: 'test-user-123',
    venueId: 'test-venue-123',
    role: 'user',
    email: 'test@example.com',
    ...overrides,
  };
}

export function generateAuthToken(user: any) {
  const jwt = require('jsonwebtoken');
  return jwt.sign(
    {
      id: user.id,
      userId: user.id,
      venueId: user.venueId,
      role: user.role,
    },
    process.env.JWT_SECRET || 'test-secret-key-for-testing-purposes-only',
    { expiresIn: '1h' }
  );
}

export async function createTestApp(): Promise<FastifyInstance> {
  const Fastify = require('fastify');
  const app = Fastify({ logger: false });
  
  // Mock the services for testing
  app.decorate('elasticsearch', mockElasticsearchClient);
  app.decorate('redis', mockRedisClient);
  
  // Register basic plugins
  await app.register(require('@fastify/cors'));
  await app.register(require('@fastify/helmet'));
  
  // Mock search routes for testing
  app.post('/api/search/tickets', async (request: any, reply: any) => {
    return { results: [], total: 0 };
  });
  
  app.post('/api/search/events', async (request: any, reply: any) => {
    return { results: [], total: 0 };
  });
  
  app.post('/api/search/venues', async (request: any, reply: any) => {
    return { results: [], total: 0 };
  });
  
  await app.ready();
  return app;
}

// Reset all mocks between tests
beforeEach(() => {
  jest.clearAllMocks();
});

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-for-testing-purposes-only';
process.env.ELASTICSEARCH_NODE = 'http://localhost:9200';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
process.env.DATABASE_HOST = 'localhost';
process.env.DATABASE_PORT = '5432';
process.env.DATABASE_NAME = 'test_db';
process.env.DATABASE_USER = 'test_user';
process.env.DATABASE_PASSWORD = 'test_password';
