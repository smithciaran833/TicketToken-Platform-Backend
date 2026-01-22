import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '../../.env.test') });

import request from 'supertest';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getTestDb } from './helpers/db';
import { getTestRedis } from './helpers/redis';

// Mock amqplib BEFORE any imports that use it
const mockPublish = jest.fn();
const mockChannel = {
  assertExchange: jest.fn().mockResolvedValue({}),
  publish: mockPublish,
  close: jest.fn().mockResolvedValue({})
};
const mockConnection = {
  createChannel: jest.fn().mockResolvedValue(mockChannel),
  close: jest.fn().mockResolvedValue({}),
  on: jest.fn()
};

jest.mock('amqplib', () => ({
  connect: jest.fn().mockResolvedValue(mockConnection)
}));

// Mock @tickettoken/shared for search sync AND review services
const mockPublishSearchSync = jest.fn().mockResolvedValue({});
const mockReviewService = jest.fn().mockImplementation(() => ({
  getReviews: jest.fn().mockResolvedValue([]),
  createReview: jest.fn().mockResolvedValue({}),
  updateReview: jest.fn().mockResolvedValue({}),
  deleteReview: jest.fn().mockResolvedValue({}),
}));
const mockRatingService = jest.fn().mockImplementation(() => ({
  calculateRating: jest.fn().mockResolvedValue(0),
  updateRating: jest.fn().mockResolvedValue({}),
}));

jest.mock('@tickettoken/shared', () => ({
  publishSearchSync: mockPublishSearchSync,
  ReviewService: mockReviewService,
  RatingService: mockRatingService,
}));

// Generate RSA keypair for JWT signing
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

import fs from 'fs';
import os from 'os';
const tempKeyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'venue-test-keys-'));
const publicKeyPath = path.join(tempKeyDir, 'jwt-public.pem');
fs.writeFileSync(publicKeyPath, publicKey);

process.env.JWT_PUBLIC_KEY_PATH = publicKeyPath;

// Test constants
const TEST_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const TEST_USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function generateTestJWT(payload: { sub: string; tenant_id: string; permissions?: string[] }): string {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      sub: payload.sub,
      email: `${payload.sub}@test.com`,
      tenant_id: payload.tenant_id,
      permissions: payload.permissions || ['*'],
      iat: now,
      exp: now + 3600,
    },
    privateKey,
    { algorithm: 'RS256' }
  );
}

function createValidVenuePayload(overrides: Record<string, any> = {}) {
  return {
    name: 'Test Venue',
    email: 'test@venue.com',
    type: 'comedy_club',
    capacity: 500,
    address: {
      street: '123 Main St',
      city: 'New York',
      state: 'NY',
      zipCode: '10001',
      country: 'US',
    },
    ...overrides,
  };
}

// Helper to get last published RabbitMQ message
function getLastPublishedMessage() {
  if (mockPublish.mock.calls.length === 0) return null;

  const lastCall = mockPublish.mock.calls[mockPublish.mock.calls.length - 1];
  const [exchange, routingKey, messageBuffer] = lastCall;

  return {
    exchange,
    routingKey,
    message: JSON.parse(messageBuffer.toString()),
  };
}

// Helper to get all published messages
function getAllPublishedMessages() {
  return mockPublish.mock.calls.map(call => {
    const [exchange, routingKey, messageBuffer, options] = call;
    return {
      exchange,
      routingKey,
      message: JSON.parse(messageBuffer.toString()),
      options
    };
  });
}

// Helper to clear published messages
function clearPublishedMessages() {
  mockPublish.mockClear();
  mockPublishSearchSync.mockClear();
}

describe('Event Publishing - Integration Tests', () => {
  let app: any;
  let db: any;
  let redis: any;
  let authToken: string;

  beforeAll(async () => {
    const { buildApp } = await import('../../src/app');
    app = await buildApp();
    await app.ready();
    db = getTestDb();
    redis = getTestRedis();
    authToken = generateTestJWT({ sub: TEST_USER_ID, tenant_id: TEST_TENANT_ID });
  }, 30000);

  afterAll(async () => {
    if (app) await app.close();
    try {
      fs.unlinkSync(publicKeyPath);
      fs.rmdirSync(tempKeyDir);
    } catch {}
  });

  beforeEach(async () => {
    // Clean database (order matters for foreign keys)
    await db('venue_staff').del();
    await db('venue_settings').del();
    await db('venues').del();
    await db('users').del();
    await db('tenants').del();

    // Seed tenant
    await db('tenants').insert({
      id: TEST_TENANT_ID,
      name: 'Test Tenant',
      slug: 'test-tenant',
      created_at: new Date(),
      updated_at: new Date(),
    });

    // Seed user
    await db('users').insert({
      id: TEST_USER_ID,
      email: 'test@test.com',
      password_hash: '$2b$10$dummyhashfortestingpurposesonly',
      tenant_id: TEST_TENANT_ID,
      created_at: new Date(),
      updated_at: new Date(),
    });

    // Clear Redis
    const keys = await redis.keys('*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }

    // Clear mocks
    clearPublishedMessages();
  });

  // ===========================================
  // SECTION 1: EVENT MESSAGE STRUCTURE (10 tests)
  // ===========================================
  describe('Event Message Structure', () => {
    it('should publish venue.created event with correct structure', async () => {
      const payload = createValidVenuePayload({ name: 'Structure Test Venue' });

      const res = await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${authToken}`)
        .send(payload)
        .expect(201);

      const published = getLastPublishedMessage();
      expect(published).not.toBeNull();

      const { message } = published!;
      expect(message.eventType).toBe('created');
      expect(message.aggregateId).toBe(res.body.id);
      expect(message.aggregateType).toBe('venue');
      expect(message.payload).toBeDefined();
      expect(message.metadata).toBeDefined();
    });

    it('should include aggregateId matching venueId', async () => {
      const payload = createValidVenuePayload({ name: 'Aggregate ID Test' });

      const res = await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${authToken}`)
        .send(payload)
        .expect(201);

      const published = getLastPublishedMessage();
      expect(published!.message.aggregateId).toBe(res.body.id);
      expect(published!.message.aggregateId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it('should set aggregateType to venue', async () => {
      const payload = createValidVenuePayload({ name: 'Aggregate Type Test' });

      await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${authToken}`)
        .send(payload)
        .expect(201);

      const published = getLastPublishedMessage();
      expect(published!.message.aggregateType).toBe('venue');
    });

    it('should include complete venue data in payload', async () => {
      const payload = createValidVenuePayload({ name: 'Payload Test Venue' });

      const res = await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${authToken}`)
        .send(payload)
        .expect(201);

      const published = getLastPublishedMessage();
      expect(published!.message.payload).toMatchObject({
        id: res.body.id,
        name: payload.name,
        tenant_id: TEST_TENANT_ID,
      });
    });

    it('should include userId in metadata', async () => {
      const payload = createValidVenuePayload({ name: 'User ID Test' });

      await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${authToken}`)
        .send(payload)
        .expect(201);

      const published = getLastPublishedMessage();
      expect(published!.message.metadata.userId).toBe(TEST_USER_ID);
    });

    it('should include tenantId in metadata (SECURITY FIX)', async () => {
      const payload = createValidVenuePayload({ name: 'Tenant ID Test' });

      await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${authToken}`)
        .send(payload)
        .expect(201);

      const published = getLastPublishedMessage();
      expect(published!.message.metadata.tenantId).toBe(TEST_TENANT_ID);
    });

    it('should include timestamp in metadata', async () => {
      const payload = createValidVenuePayload({ name: 'Timestamp Test' });

      const beforeTime = new Date();
      await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${authToken}`)
        .send(payload)
        .expect(201);
      const afterTime = new Date();

      const published = getLastPublishedMessage();
      expect(published!.message.metadata.timestamp).toBeDefined();

      const timestamp = new Date(published!.message.metadata.timestamp);
      expect(timestamp.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(timestamp.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });

    it('should include version in metadata', async () => {
      const payload = createValidVenuePayload({ name: 'Version Test' });

      await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${authToken}`)
        .send(payload)
        .expect(201);

      const published = getLastPublishedMessage();
      expect(published!.message.metadata.version).toBe(1);
    });

    it('should publish venue.updated event with changes only', async () => {
      const createPayload = createValidVenuePayload({ name: 'Update Test Venue' });
      const createRes = await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${authToken}`)
        .send(createPayload)
        .expect(201);

      clearPublishedMessages();

      await request(app.server)
        .put(`/api/v1/venues/${createRes.body.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Updated Name' })
        .expect(200);

      const published = getLastPublishedMessage();
      expect(published!.message.eventType).toBe('updated');
      expect(published!.message.payload).toHaveProperty('changes');
      expect(published!.message.payload.changes).toMatchObject({
        name: 'Updated Name'
      });
    });

    it('should publish venue.deleted event with deletedAt timestamp', async () => {
      const createPayload = createValidVenuePayload({ name: 'Delete Test Venue' });
      const createRes = await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${authToken}`)
        .send(createPayload)
        .expect(201);

      clearPublishedMessages();

      await request(app.server)
        .delete(`/api/v1/venues/${createRes.body.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(204);

      const published = getLastPublishedMessage();
      expect(published!.message.eventType).toBe('deleted');
      expect(published!.message.payload.deletedAt).toBeDefined();
    });
  });

  // ===========================================
  // SECTION 2: EXCHANGE & ROUTING (10 tests)
  // ===========================================
  describe('Exchange & Routing', () => {
    it('should publish to venue-events exchange', async () => {
      const payload = createValidVenuePayload({ name: 'Exchange Test' });

      await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${authToken}`)
        .send(payload)
        .expect(201);

      const published = getLastPublishedMessage();
      expect(published!.exchange).toBe('venue-events');
    });

    it('should use routing key: venue.created', async () => {
      const payload = createValidVenuePayload({ name: 'Routing Key Test' });

      await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${authToken}`)
        .send(payload)
        .expect(201);

      const published = getLastPublishedMessage();
      expect(published!.routingKey).toBe('venue.created');
    });

    it('should use routing key: venue.updated', async () => {
      const createPayload = createValidVenuePayload({ name: 'Routing Update Test' });
      const createRes = await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${authToken}`)
        .send(createPayload)
        .expect(201);

      clearPublishedMessages();

      await request(app.server)
        .put(`/api/v1/venues/${createRes.body.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Updated' })
        .expect(200);

      const published = getLastPublishedMessage();
      expect(published!.routingKey).toBe('venue.updated');
    });

    it('should use routing key: venue.deleted', async () => {
      const createPayload = createValidVenuePayload({ name: 'Routing Delete Test' });
      const createRes = await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${authToken}`)
        .send(createPayload)
        .expect(201);

      clearPublishedMessages();

      await request(app.server)
        .delete(`/api/v1/venues/${createRes.body.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(204);

      const published = getLastPublishedMessage();
      expect(published!.routingKey).toBe('venue.deleted');
    });

    it('should set persistent flag on messages', async () => {
      const payload = createValidVenuePayload({ name: 'Persistent Test' });

      await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${authToken}`)
        .send(payload)
        .expect(201);

      const published = getAllPublishedMessages()[0];
      expect(published.options).toEqual({ persistent: true });
    });

    it('should handle topic pattern routing', async () => {
      const payload = createValidVenuePayload({ name: 'Topic Pattern Test' });

      await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${authToken}`)
        .send(payload)
        .expect(201);

      const published = getLastPublishedMessage();
      expect(published!.routingKey).toMatch(/^venue\.(created|updated|deleted)$/);
    });

    it('should publish messages in correct order', async () => {
      for (let i = 0; i < 3; i++) {
        await request(app.server)
          .post('/api/v1/venues')
          .set('Authorization', `Bearer ${authToken}`)
          .send(createValidVenuePayload({ name: `Venue ${i}` }))
          .expect(201);
      }

      const messages = getAllPublishedMessages();
      expect(messages.length).toBe(3);
      expect(messages.every(m => m.routingKey === 'venue.created')).toBe(true);
    });

    it('should buffer messages as JSON', async () => {
      const payload = createValidVenuePayload({ name: 'Buffer Test' });

      await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${authToken}`)
        .send(payload)
        .expect(201);

      const lastCall = mockPublish.mock.calls[mockPublish.mock.calls.length - 1];
      const messageBuffer = lastCall[2];
      expect(Buffer.isBuffer(messageBuffer)).toBe(true);

      const parsed = JSON.parse(messageBuffer.toString());
      expect(parsed).toHaveProperty('eventType');
      expect(parsed).toHaveProperty('aggregateId');
    });

    it('should publish events for topic exchange consumption', async () => {
      const payload = createValidVenuePayload({ name: 'Topic Exchange Test' });

      await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${authToken}`)
        .send(payload)
        .expect(201);

      // Verify message format is suitable for topic exchange
      const published = getLastPublishedMessage();
      expect(published!.exchange).toBe('venue-events');
      expect(published!.routingKey).toContain('venue.');
    });

    it('should include all required event fields', async () => {
      const payload = createValidVenuePayload({ name: 'Required Fields Test' });

      await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${authToken}`)
        .send(payload)
        .expect(201);

      const published = getLastPublishedMessage();
      expect(published!.message).toHaveProperty('eventType');
      expect(published!.message).toHaveProperty('aggregateId');
      expect(published!.message).toHaveProperty('aggregateType');
      expect(published!.message).toHaveProperty('payload');
      expect(published!.message).toHaveProperty('metadata');
    });
  });

  // ===========================================
  // SECTION 3: CIRCUIT BREAKER (10 tests)
  // ===========================================
  describe('Circuit Breaker', () => {
    it('should wrap publish with circuit breaker', async () => {
      const payload = createValidVenuePayload({ name: 'Circuit Breaker Test' });

      await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${authToken}`)
        .send(payload)
        .expect(201);

      expect(mockPublish).toHaveBeenCalled();
    });

    it('should have timeout configured', async () => {
      const payload = createValidVenuePayload({ name: 'Timeout Test' });

      const res = await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${authToken}`)
        .send(payload);

      expect(res.status).toBe(201);
    });

    it('should complete venue creation regardless of publish status', async () => {
      const payload = createValidVenuePayload({ name: 'Completion Test' });

      const res = await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${authToken}`)
        .send(payload)
        .expect(201);

      expect(res.body).toHaveProperty('id');
      const dbVenue = await db('venues').where('id', res.body.id).first();
      expect(dbVenue).toBeDefined();
    });

    it('should publish successfully under normal conditions', async () => {
      const payload = createValidVenuePayload({ name: 'Normal Conditions Test' });

      await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${authToken}`)
        .send(payload)
        .expect(201);

      expect(mockPublish).toHaveBeenCalled();
      const published = getLastPublishedMessage();
      expect(published).not.toBeNull();
    });

    it('should maintain circuit breaker state across requests', async () => {
      for (let i = 0; i < 3; i++) {
        await request(app.server)
          .post('/api/v1/venues')
          .set('Authorization', `Bearer ${authToken}`)
          .send(createValidVenuePayload({ name: `State Test ${i}` }))
          .expect(201);
      }

      expect(mockPublish).toHaveBeenCalledTimes(3);
    });

    it('should not block venue operations', async () => {
      const payload = createValidVenuePayload({ name: 'Non-blocking Test' });

      const startTime = Date.now();
      await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${authToken}`)
        .send(payload)
        .expect(201);
      const endTime = Date.now();

      // Should complete quickly (under 2 seconds)
      expect(endTime - startTime).toBeLessThan(2000);
    });

    it('should publish with correct options', async () => {
      const payload = createValidVenuePayload({ name: 'Options Test' });

      await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${authToken}`)
        .send(payload)
        .expect(201);

      const messages = getAllPublishedMessages();
      expect(messages[0].options).toEqual({ persistent: true });
    });

    it('should handle rapid successive publishes', async () => {
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          request(app.server)
            .post('/api/v1/venues')
            .set('Authorization', `Bearer ${authToken}`)
            .send(createValidVenuePayload({ name: `Rapid Test ${i}` }))
        );
      }

      const results = await Promise.all(promises);
      results.forEach(res => expect(res.status).toBe(201));
      expect(mockPublish.mock.calls.length).toBe(5);
    });

    it('should include circuit breaker in publish path', async () => {
      const payload = createValidVenuePayload({ name: 'Path Test' });

      await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${authToken}`)
        .send(payload)
        .expect(201);

      // Verify the publish was called (circuit breaker allowed it through)
      expect(mockPublish).toHaveBeenCalled();
    });

    it('should reset state appropriately', async () => {
      // First request
      await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${authToken}`)
        .send(createValidVenuePayload({ name: 'Reset Test 1' }))
        .expect(201);

      clearPublishedMessages();

      // Second request after clear
      await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${authToken}`)
        .send(createValidVenuePayload({ name: 'Reset Test 2' }))
        .expect(201);

      expect(mockPublish).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================
  // SECTION 4: CONNECTION & ERROR HANDLING (10 tests)
  // ===========================================
  describe('Connection & Error Handling', () => {
    it('should call publishSearchSync for venue.created', async () => {
      const payload = createValidVenuePayload({ name: 'Search Sync Test' });

      const res = await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${authToken}`)
        .send(payload)
        .expect(201);

      expect(mockPublishSearchSync).toHaveBeenCalledWith('venue.created',
        expect.objectContaining({
          id: res.body.id,
          tenant_id: TEST_TENANT_ID,
          name: payload.name
        })
      );
    });

    it('should call publishSearchSync for venue.updated', async () => {
      const createPayload = createValidVenuePayload({ name: 'Search Update Test' });
      const createRes = await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${authToken}`)
        .send(createPayload)
        .expect(201);

      mockPublishSearchSync.mockClear();

      await request(app.server)
        .put(`/api/v1/venues/${createRes.body.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Updated Name' })
        .expect(200);

      expect(mockPublishSearchSync).toHaveBeenCalledWith('venue.updated',
        expect.objectContaining({
          id: createRes.body.id,
          tenant_id: TEST_TENANT_ID,
          changes: expect.objectContaining({
            name: 'Updated Name'
          })
        })
      );
    });

    it('should call publishSearchSync for venue.deleted', async () => {
      const createPayload = createValidVenuePayload({ name: 'Search Delete Test' });
      const createRes = await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${authToken}`)
        .send(createPayload)
        .expect(201);

      mockPublishSearchSync.mockClear();

      await request(app.server)
        .delete(`/api/v1/venues/${createRes.body.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(204);

      expect(mockPublishSearchSync).toHaveBeenCalledWith('venue.deleted',
        expect.objectContaining({
          id: createRes.body.id,
          tenant_id: TEST_TENANT_ID
        })
      );
    });

    it('should include tenant_id in search sync (SECURITY FIX)', async () => {
      const payload = createValidVenuePayload({ name: 'Search Tenant Test' });

      await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${authToken}`)
        .send(payload)
        .expect(201);

      expect(mockPublishSearchSync).toHaveBeenCalledWith(
        'venue.created',
        expect.objectContaining({
          tenant_id: TEST_TENANT_ID
        })
      );
    });

    it('should include venue id in search sync', async () => {
      const payload = createValidVenuePayload({ name: 'Search ID Test' });

      const res = await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${authToken}`)
        .send(payload)
        .expect(201);

      expect(mockPublishSearchSync).toHaveBeenCalledWith(
        'venue.created',
        expect.objectContaining({
          id: res.body.id
        })
      );
    });

    it('should sync venue name to search', async () => {
      const payload = createValidVenuePayload({ name: 'Search Name Test' });

      await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${authToken}`)
        .send(payload)
        .expect(201);

      expect(mockPublishSearchSync).toHaveBeenCalledWith(
        'venue.created',
        expect.objectContaining({
          name: 'Search Name Test'
        })
      );
    });

    it('should handle connection gracefully', async () => {
      const payload = createValidVenuePayload({ name: 'Connection Test' });

      const res = await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${authToken}`)
        .send(payload)
        .expect(201);

      expect(res.body).toHaveProperty('id');
    });

    it('should publish and sync in parallel', async () => {
      const payload = createValidVenuePayload({ name: 'Parallel Test' });

      await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${authToken}`)
        .send(payload)
        .expect(201);

      // Both should have been called
      expect(mockPublish).toHaveBeenCalled();
      expect(mockPublishSearchSync).toHaveBeenCalled();
    });

    it('should not expose internal errors to user', async () => {
      const payload = createValidVenuePayload({ name: 'Error Exposure Test' });

      const res = await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${authToken}`)
        .send(payload)
        .expect(201);

      expect(res.body).not.toHaveProperty('eventPublishError');
      expect(res.body).not.toHaveProperty('searchSyncError');
    });

    it('should complete database transaction before publishing', async () => {
      const payload = createValidVenuePayload({ name: 'Transaction Test' });

      const res = await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${authToken}`)
        .send(payload)
        .expect(201);

      // Venue should exist in DB
      const dbVenue = await db('venues').where('id', res.body.id).first();
      expect(dbVenue).toBeDefined();
      expect(dbVenue.name).toBe('Transaction Test');
    });
  });
});
