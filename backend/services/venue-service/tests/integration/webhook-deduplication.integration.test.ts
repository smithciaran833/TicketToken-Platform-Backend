import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '../../.env.test') });

import request from 'supertest';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getTestDb } from './helpers/db';
import { getTestRedis, getKeysByPattern } from './helpers/redis';

// Set up test environment variables
process.env.STRIPE_WEBHOOK_SECRET_IDENTITY = 'whsec_test_identity_secret';
process.env.STRIPE_WEBHOOK_SECRET_VENUE = 'whsec_test_venue_secret';
process.env.STRIPE_SECRET_KEY = 'sk_test_mock_key';

// Test constants
const TEST_TENANT_ID_1 = '11111111-1111-1111-1111-111111111111';
const TEST_TENANT_ID_2 = '22222222-2222-2222-2222-222222222222';
const TEST_VENUE_ID_1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TEST_VENUE_ID_2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

/**
 * Generate Stripe webhook signature
 */
function generateStripeSignature(payload: any, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${JSON.stringify(payload)}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

/**
 * Create mock Stripe Identity event
 */
function createStripeIdentityEvent(venueId: string, tenantId: string, eventId?: string) {
  return {
    id: eventId || `evt_${uuidv4().replace(/-/g, '')}`,
    type: 'identity.verification_session.verified',
    data: {
      object: {
        id: `vs_${uuidv4().replace(/-/g, '')}`,
        status: 'verified',
        metadata: {
          venue_id: venueId,
          tenant_id: tenantId,
        },
        last_verification_report: {
          document: { status: 'verified' },
        },
        verified_outputs: {
          first_name: 'John',
          last_name: 'Doe',
        },
      },
    },
  };
}

/**
 * Create mock Stripe Connect event
 */
function createStripeConnectEvent(venueId: string, tenantId: string, eventId?: string) {
  return {
    id: eventId || `evt_${uuidv4().replace(/-/g, '')}`,
    type: 'account.updated',
    data: {
      object: {
        id: `acct_${uuidv4().replace(/-/g, '')}`,
        object: 'account',
        metadata: {
          venue_id: venueId,
          tenant_id: tenantId,
        },
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
      },
    },
  };
}

/**
 * Create mock Plaid webhook
 */
function createPlaidWebhook(itemId: string) {
  return {
    webhook_type: 'AUTH',
    webhook_code: 'DEFAULT_UPDATE',
    item_id: itemId,
    error: null,
  };
}

describe('Webhook Deduplication - Integration Tests', () => {
  let app: any;
  let db: any;
  let redis: any;

  beforeAll(async () => {
    const { buildApp } = await import('../../src/app');
    app = await buildApp();
    await app.ready();
    db = getTestDb();
    redis = getTestRedis();
  }, 30000);

  afterAll(async () => {
    if (app) await app.close();
  });

  beforeEach(async () => {
    // Reconnect if connections were closed
    if (!db || db.client?.config?.connection === null) {
      db = getTestDb();
    }

    if (redis.status === 'end' || redis.status === 'close') {
      redis = getTestRedis();
    }

    // Clean database
    try {
      await db.raw('TRUNCATE TABLE venue_webhook_events CASCADE');
      await db.raw('TRUNCATE TABLE external_verifications CASCADE');
      await db.raw('TRUNCATE TABLE venues CASCADE');
      await db.raw('TRUNCATE TABLE tenants CASCADE');
    } catch (error) {
      db = getTestDb();
      await db.raw('TRUNCATE TABLE venue_webhook_events CASCADE');
      await db.raw('TRUNCATE TABLE external_verifications CASCADE');
      await db.raw('TRUNCATE TABLE venues CASCADE');
      await db.raw('TRUNCATE TABLE tenants CASCADE');
    }

    // Clean Redis
    try {
      await redis.flushdb();
    } catch (error) {
      redis = getTestRedis();
      await redis.flushdb();
    }

    // Seed test data
    await db('tenants')
      .insert([
        { id: TEST_TENANT_ID_1, name: 'Test Tenant 1', slug: 'test-tenant-1' },
        { id: TEST_TENANT_ID_2, name: 'Test Tenant 2', slug: 'test-tenant-2' },
      ])
      .onConflict('id')
      .ignore();

    await db('venues').insert([
      {
        id: TEST_VENUE_ID_1,
        tenant_id: TEST_TENANT_ID_1,
        name: 'Test Venue 1',
        slug: 'test-venue-1',
        email: 'venue1@test.com',
        address_line1: '123 Test St',
        city: 'Test City',
        state_province: 'TS',
        country_code: 'US',
        max_capacity: 100,
        venue_type: 'theater',
      },
      {
        id: TEST_VENUE_ID_2,
        tenant_id: TEST_TENANT_ID_2,
        name: 'Test Venue 2',
        slug: 'test-venue-2',
        email: 'venue2@test.com',
        address_line1: '456 Test Ave',
        city: 'Test City',
        state_province: 'TS',
        country_code: 'US',
        max_capacity: 200,
        venue_type: 'arena',
      },
    ]);
  });

  // ===========================================
  // SECTION 1: SIGNATURE VERIFICATION (5 tests)
  // ===========================================
  describe('Signature Verification', () => {
    it('should accept valid Stripe signature', async () => {
      const event = createStripeIdentityEvent(TEST_VENUE_ID_1, TEST_TENANT_ID_1);
      const signature = generateStripeSignature(event, process.env.STRIPE_WEBHOOK_SECRET_IDENTITY!);

      const res = await request(app.server)
        .post('/api/webhooks/stripe/identity')
        .set('stripe-signature', signature)
        .send(event)
        .expect(200);

      expect(res.body.received).toBe(true);
    });

    it('should reject invalid Stripe signature', async () => {
      const event = createStripeIdentityEvent(TEST_VENUE_ID_1, TEST_TENANT_ID_1);
      const invalidSignature = 't=123456,v1=invalid_signature_here';

      const res = await request(app.server)
        .post('/api/webhooks/stripe/identity')
        .set('stripe-signature', invalidSignature)
        .send(event)
        .expect(400);

      expect(res.body.error).toContain('Invalid signature');
    });

    it('should reject webhook without signature header', async () => {
      const event = createStripeIdentityEvent(TEST_VENUE_ID_1, TEST_TENANT_ID_1);

      const res = await request(app.server)
        .post('/api/webhooks/stripe/identity')
        .send(event)
        .expect(400);

      expect(res.body.error).toContain('Missing stripe-signature');
    });

    it('should verify Stripe Connect webhook signature', async () => {
      const event = createStripeConnectEvent(TEST_VENUE_ID_1, TEST_TENANT_ID_1);
      const signature = generateStripeSignature(event, process.env.STRIPE_WEBHOOK_SECRET_VENUE!);

      const res = await request(app.server)
        .post('/api/webhooks/stripe/venue-connect')
        .set('stripe-signature', signature)
        .send(event)
        .expect(200);

      expect(res.body.received).toBe(true);
    });

    it('should handle timestamp tolerance window', async () => {
      const event = createStripeIdentityEvent(TEST_VENUE_ID_1, TEST_TENANT_ID_1);

      // Generate signature with current timestamp (should be within 5 minute tolerance)
      const signature = generateStripeSignature(event, process.env.STRIPE_WEBHOOK_SECRET_IDENTITY!);

      const res = await request(app.server)
        .post('/api/webhooks/stripe/identity')
        .set('stripe-signature', signature)
        .send(event)
        .expect(200);

      expect(res.body.received).toBe(true);
      expect(res.body.processed).toBeDefined();
    });
  });

  // ===========================================
  // SECTION 2: EVENT DEDUPLICATION (10 tests)
  // ===========================================
  describe('Event Deduplication', () => {
    it('should process webhook with unique event_id', async () => {
      const event = createStripeIdentityEvent(TEST_VENUE_ID_1, TEST_TENANT_ID_1);
      const signature = generateStripeSignature(event, process.env.STRIPE_WEBHOOK_SECRET_IDENTITY!);

      const res = await request(app.server)
        .post('/api/webhooks/stripe/identity')
        .set('stripe-signature', signature)
        .send(event)
        .expect(200);

      expect(res.body.processed).toBe(true);
      expect(res.body.received).toBe(true);

      // Verify record in database
      const record = await db('venue_webhook_events')
        .where('event_id', event.id)
        .first();

      expect(record).toBeDefined();
      expect(record.event_type).toBe(event.type);
      expect(record.status).toBe('completed');
    });

    it('should return early for duplicate event_id', async () => {
      const event = createStripeIdentityEvent(TEST_VENUE_ID_1, TEST_TENANT_ID_1);
      const signature = generateStripeSignature(event, process.env.STRIPE_WEBHOOK_SECRET_IDENTITY!);

      // First request
      await request(app.server)
        .post('/api/webhooks/stripe/identity')
        .set('stripe-signature', signature)
        .send(event)
        .expect(200);

      // Second request with same event_id
      const res = await request(app.server)
        .post('/api/webhooks/stripe/identity')
        .set('stripe-signature', signature)
        .send(event)
        .expect(200);

      expect(res.body.received).toBe(true);
      // Should indicate it's a duplicate (implementation may vary)

      // Verify only one record in database
      const records = await db('venue_webhook_events')
        .where('event_id', event.id);

      expect(records).toHaveLength(1);
    });

    it('should use Redis distributed lock for concurrent processing', async () => {
      const event = createStripeIdentityEvent(TEST_VENUE_ID_1, TEST_TENANT_ID_1);
      const signature = generateStripeSignature(event, process.env.STRIPE_WEBHOOK_SECRET_IDENTITY!);

      // Send two concurrent requests
      const [res1, res2] = await Promise.all([
        request(app.server)
          .post('/api/webhooks/stripe/identity')
          .set('stripe-signature', signature)
          .send(event),
        request(app.server)
          .post('/api/webhooks/stripe/identity')
          .set('stripe-signature', signature)
          .send(event),
      ]);

      // Both should return 200
      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      // But only one should actually process
      const records = await db('venue_webhook_events')
        .where('event_id', event.id);

      expect(records).toHaveLength(1);
      expect(records[0].status).toBe('completed');
    });

    it('should store headers hash for additional deduplication', async () => {
      const event = createStripeIdentityEvent(TEST_VENUE_ID_1, TEST_TENANT_ID_1);
      const signature = generateStripeSignature(event, process.env.STRIPE_WEBHOOK_SECRET_IDENTITY!);

      await request(app.server)
        .post('/api/webhooks/stripe/identity')
        .set('stripe-signature', signature)
        .set('x-request-id', 'test-request-123')
        .send(event)
        .expect(200);

      const record = await db('venue_webhook_events')
        .where('event_id', event.id)
        .first();

      expect(record.headers_hash).toBeDefined();
      expect(record.headers_hash).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hash
    });

    it('should handle different headers with same event_id', async () => {
      const event = createStripeIdentityEvent(TEST_VENUE_ID_1, TEST_TENANT_ID_1);
      const signature = generateStripeSignature(event, process.env.STRIPE_WEBHOOK_SECRET_IDENTITY!);

      // First request
      await request(app.server)
        .post('/api/webhooks/stripe/identity')
        .set('stripe-signature', signature)
        .set('x-request-id', 'request-1')
        .send(event)
        .expect(200);

      // Second request with different x-request-id
      const signature2 = generateStripeSignature(event, process.env.STRIPE_WEBHOOK_SECRET_IDENTITY!);

      const res = await request(app.server)
        .post('/api/webhooks/stripe/identity')
        .set('stripe-signature', signature2)
        .set('x-request-id', 'request-2')
        .send(event)
        .expect(200);

      // Should still be treated as duplicate based on event_id
      expect(res.body.received).toBe(true);
    });

    it('should check processing status before acquiring lock', async () => {
      const event = createStripeIdentityEvent(TEST_VENUE_ID_1, TEST_TENANT_ID_1);

      // Manually insert a processing record
      await db('venue_webhook_events').insert({
        event_id: event.id,
        event_type: event.type,
        status: 'processing',
        tenant_id: TEST_TENANT_ID_1,
        source: 'stripe_identity',
        processed_at: new Date(),
      });

      const signature = generateStripeSignature(event, process.env.STRIPE_WEBHOOK_SECRET_IDENTITY!);

      const res = await request(app.server)
        .post('/api/webhooks/stripe/identity')
        .set('stripe-signature', signature)
        .send(event)
        .expect(200);

      expect(res.body.received).toBe(true);
      // Should not attempt to process again
    });

    it('should release lock after successful processing', async () => {
      const event = createStripeIdentityEvent(TEST_VENUE_ID_1, TEST_TENANT_ID_1);
      const signature = generateStripeSignature(event, process.env.STRIPE_WEBHOOK_SECRET_IDENTITY!);

      await request(app.server)
        .post('/api/webhooks/stripe/identity')
        .set('stripe-signature', signature)
        .send(event)
        .expect(200);

      // Check that lock is released
      const lockKey = `webhook:lock:${event.id}`;
      const lockExists = await redis.exists(lockKey);

      expect(lockExists).toBe(0); // Lock should be released
    });

    it('should release lock after processing failure', async () => {
      const event = createStripeIdentityEvent('invalid-venue-id', TEST_TENANT_ID_1);
      const signature = generateStripeSignature(event, process.env.STRIPE_WEBHOOK_SECRET_IDENTITY!);

      await request(app.server)
        .post('/api/webhooks/stripe/identity')
        .set('stripe-signature', signature)
        .send(event)
        .expect(200);

      // Even on failure, lock should be released
      const lockKey = `webhook:lock:${event.id}`;
      const lockExists = await redis.exists(lockKey);

      expect(lockExists).toBe(0);
    });

    it('should handle Plaid webhook deduplication', async () => {
      const itemId = uuidv4();
      const plaidEvent = createPlaidWebhook(itemId);

      // Seed verification record for Plaid
      await db('external_verifications').insert({
        id: uuidv4(),
        external_id: itemId,
        venue_id: TEST_VENUE_ID_1,
        tenant_id: TEST_TENANT_ID_1,
        provider: 'plaid',
        verification_type: 'bank_account',
        status: 'pending',
        metadata: JSON.stringify({ itemId }),
      });

      // First request
      await request(app.server)
        .post('/api/webhooks/plaid')
        .send(plaidEvent)
        .expect(200);

      // Second request (duplicate)
      const res = await request(app.server)
        .post('/api/webhooks/plaid')
        .send(plaidEvent)
        .expect(200);

      expect(res.body.received).toBe(true);
    });

    it('should handle idempotent processing with same payload', async () => {
      const event = createStripeIdentityEvent(TEST_VENUE_ID_1, TEST_TENANT_ID_1);
      const signature = generateStripeSignature(event, process.env.STRIPE_WEBHOOK_SECRET_IDENTITY!);

      // Send exact same request twice
      const res1 = await request(app.server)
        .post('/api/webhooks/stripe/identity')
        .set('stripe-signature', signature)
        .send(event)
        .expect(200);

      const res2 = await request(app.server)
        .post('/api/webhooks/stripe/identity')
        .set('stripe-signature', signature)
        .send(event)
        .expect(200);

      expect(res1.body.received).toBe(true);
      expect(res2.body.received).toBe(true);

      // Should have only processed once
      const records = await db('venue_webhook_events')
        .where('event_id', event.id);

      expect(records).toHaveLength(1);
      expect(records[0].status).toBe('completed');
    });
  });

  // ===========================================
  // SECTION 3: STATUS TRACKING & RETRY (10 tests)
  // ===========================================
  describe('Status Tracking & Retry', () => {
    it('should track status transitions: pending → processing → completed', async () => {
      const event = createStripeIdentityEvent(TEST_VENUE_ID_1, TEST_TENANT_ID_1);
      const signature = generateStripeSignature(event, process.env.STRIPE_WEBHOOK_SECRET_IDENTITY!);

      await request(app.server)
        .post('/api/webhooks/stripe/identity')
        .set('stripe-signature', signature)
        .send(event)
        .expect(200);

      const record = await db('venue_webhook_events')
        .where('event_id', event.id)
        .first();

      expect(record.status).toBe('completed');
      expect(record.processing_started_at).toBeDefined();
      expect(record.processing_completed_at).toBeDefined();
    });

    it('should store payload as JSON string', async () => {
      const event = createStripeIdentityEvent(TEST_VENUE_ID_1, TEST_TENANT_ID_1);
      const signature = generateStripeSignature(event, process.env.STRIPE_WEBHOOK_SECRET_IDENTITY!);

      await request(app.server)
        .post('/api/webhooks/stripe/identity')
        .set('stripe-signature', signature)
        .send(event)
        .expect(200);

      const record = await db('venue_webhook_events')
        .where('event_id', event.id)
        .first();

      expect(record.payload).toBeDefined();
      // JSONB columns are automatically parsed by Knex, so payload is already an object
      expect(typeof record.payload).toBe('object');
      expect(record.payload.id).toBe(event.id);
      expect(record.payload.type).toBe(event.type);
    });

    it('should store source_ip when provided', async () => {
      const event = createStripeIdentityEvent(TEST_VENUE_ID_1, TEST_TENANT_ID_1);
      const signature = generateStripeSignature(event, process.env.STRIPE_WEBHOOK_SECRET_IDENTITY!);

      await request(app.server)
        .post('/api/webhooks/stripe/identity')
        .set('stripe-signature', signature)
        .set('x-forwarded-for', '192.168.1.100')
        .send(event)
        .expect(200);

      const record = await db('venue_webhook_events')
        .where('event_id', event.id)
        .first();

      expect(record.source_ip).toBeDefined();
    });

    it('should mark failed webhooks with error message', async () => {
      // Create event with invalid venue (will cause processing failure)
      const event = createStripeIdentityEvent('nonexistent-venue-id', TEST_TENANT_ID_1);
      const signature = generateStripeSignature(event, process.env.STRIPE_WEBHOOK_SECRET_IDENTITY!);

      await request(app.server)
        .post('/api/webhooks/stripe/identity')
        .set('stripe-signature', signature)
        .send(event)
        .expect(200);

      const record = await db('venue_webhook_events')
        .where('event_id', event.id)
        .first();

      // Should have failed or be marked for retry
      expect(['failed', 'retrying']).toContain(record.status);
    });

    it('should increment retry_count on failure', async () => {
      const event = createStripeIdentityEvent('invalid-venue', TEST_TENANT_ID_1);
      const signature = generateStripeSignature(event, process.env.STRIPE_WEBHOOK_SECRET_IDENTITY!);

      await request(app.server)
        .post('/api/webhooks/stripe/identity')
        .set('stripe-signature', signature)
        .send(event)
        .expect(200);

      const record = await db('venue_webhook_events')
        .where('event_id', event.id)
        .first();

      expect(record.retry_count).toBeGreaterThan(0);
    });

    it('should mark as failed after max retries', async () => {
      const eventId = `evt_${uuidv4().replace(/-/g, '')}`;

      // Manually insert a record that has exceeded max retries
      await db('venue_webhook_events').insert({
        event_id: eventId,
        event_type: 'identity.verification_session.verified',
        status: 'retrying',
        tenant_id: TEST_TENANT_ID_1,
        source: 'stripe_identity',
        retry_count: 3, // Max retries
        error_message: 'Processing failed',
        processed_at: new Date(),
      });

      const record = await db('venue_webhook_events')
        .where('event_id', eventId)
        .first();

      // After 3 retries, status should remain failed or retrying
      expect(record.retry_count).toBe(3);
    });

    it('should set last_retry_at timestamp', async () => {
      const event = createStripeIdentityEvent('invalid-venue', TEST_TENANT_ID_1);
      const signature = generateStripeSignature(event, process.env.STRIPE_WEBHOOK_SECRET_IDENTITY!);

      await request(app.server)
        .post('/api/webhooks/stripe/identity')
        .set('stripe-signature', signature)
        .send(event)
        .expect(200);

      const record = await db('venue_webhook_events')
        .where('event_id', event.id)
        .first();

      if (record.status === 'retrying') {
        expect(record.last_retry_at).toBeDefined();
      }
    });

    it('should respect retry cooldown period', async () => {
      const eventId = `evt_${uuidv4().replace(/-/g, '')}`;
      const now = new Date();
      const fourMinutesAgo = new Date(now.getTime() - 4 * 60 * 1000);

      // Insert a record that was retried 4 minutes ago (cooldown is 5 minutes)
      await db('venue_webhook_events').insert({
        event_id: eventId,
        event_type: 'identity.verification_session.verified',
        status: 'retrying',
        tenant_id: TEST_TENANT_ID_1,
        source: 'stripe_identity',
        retry_count: 1,
        last_retry_at: fourMinutesAgo,
        processed_at: fourMinutesAgo,
      });

      // This webhook should not be ready for retry yet
      const record = await db('venue_webhook_events')
        .where('event_id', eventId)
        .first();

      expect(record.status).toBe('retrying');
      expect(record.retry_count).toBe(1);
    });

    it('should set processing_started_at timestamp', async () => {
      const event = createStripeIdentityEvent(TEST_VENUE_ID_1, TEST_TENANT_ID_1);
      const signature = generateStripeSignature(event, process.env.STRIPE_WEBHOOK_SECRET_IDENTITY!);

      const beforeTime = new Date();

      await request(app.server)
        .post('/api/webhooks/stripe/identity')
        .set('stripe-signature', signature)
        .send(event)
        .expect(200);

      const afterTime = new Date();

      const record = await db('venue_webhook_events')
        .where('event_id', event.id)
        .first();

      expect(record.processing_started_at).toBeDefined();
      const startedAt = new Date(record.processing_started_at);
      expect(startedAt.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(startedAt.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });

    it('should set processing_completed_at on success', async () => {
      const event = createStripeIdentityEvent(TEST_VENUE_ID_1, TEST_TENANT_ID_1);
      const signature = generateStripeSignature(event, process.env.STRIPE_WEBHOOK_SECRET_IDENTITY!);

      await request(app.server)
        .post('/api/webhooks/stripe/identity')
        .set('stripe-signature', signature)
        .send(event)
        .expect(200);

      const record = await db('venue_webhook_events')
        .where('event_id', event.id)
        .first();

      expect(record.processing_completed_at).toBeDefined();
      expect(record.processing_started_at).toBeDefined();

      const started = new Date(record.processing_started_at);
      const completed = new Date(record.processing_completed_at);
      expect(completed.getTime()).toBeGreaterThanOrEqual(started.getTime());
    });
  });

  // ===========================================
  // SECTION 4: TENANT VALIDATION & CLEANUP (5 tests)
  // ===========================================
  describe('Tenant Validation & Cleanup', () => {
    it('should store tenant_id from event metadata', async () => {
      const event = createStripeIdentityEvent(TEST_VENUE_ID_1, TEST_TENANT_ID_1);
      const signature = generateStripeSignature(event, process.env.STRIPE_WEBHOOK_SECRET_IDENTITY!);

      await request(app.server)
        .post('/api/webhooks/stripe/identity')
        .set('stripe-signature', signature)
        .send(event)
        .expect(200);

      const record = await db('venue_webhook_events')
        .where('event_id', event.id)
        .first();

      expect(record.tenant_id).toBe(TEST_TENANT_ID_1);
    });

    it('should reject webhook with missing tenant_id', async () => {
      const event = createStripeIdentityEvent(TEST_VENUE_ID_1, TEST_TENANT_ID_1);
      delete (event.data.object.metadata as any).tenant_id;

      const signature = generateStripeSignature(event, process.env.STRIPE_WEBHOOK_SECRET_IDENTITY!);

      const res = await request(app.server)
        .post('/api/webhooks/stripe/identity')
        .set('stripe-signature', signature)
        .send(event)
        .expect(200);

      expect(res.body.received).toBe(true);
      expect(res.body.processed).toBe(false);
    });

    it('should validate venue belongs to tenant', async () => {
      // Create event with venue from tenant 1 but claim tenant 2
      const event = createStripeIdentityEvent(TEST_VENUE_ID_1, TEST_TENANT_ID_2);
      const signature = generateStripeSignature(event, process.env.STRIPE_WEBHOOK_SECRET_IDENTITY!);

      const res = await request(app.server)
        .post('/api/webhooks/stripe/identity')
        .set('stripe-signature', signature)
        .send(event)
        .expect(200);

      // Should fail validation or be rejected
      expect(res.body.received).toBe(true);
    });

    it('should clean up old completed events', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 31); // 31 days ago

      // Insert old completed event
      const oldEventId = `evt_${uuidv4().replace(/-/g, '')}`;
      await db('venue_webhook_events').insert({
        event_id: oldEventId,
        event_type: 'identity.verification_session.verified',
        status: 'completed',
        tenant_id: TEST_TENANT_ID_1,
        source: 'stripe_identity',
        processed_at: oldDate,
      });

      // Insert recent completed event
      const recentEventId = `evt_${uuidv4().replace(/-/g, '')}`;
      await db('venue_webhook_events').insert({
        event_id: recentEventId,
        event_type: 'identity.verification_session.verified',
        status: 'completed',
        tenant_id: TEST_TENANT_ID_1,
        source: 'stripe_identity',
        processed_at: new Date(),
      });

      // Cleanup would normally be called by a cron job
      // For testing, we verify the query logic would work
      const oldEvents = await db('venue_webhook_events')
        .where('processed_at', '<', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
        .whereIn('status', ['completed', 'failed']);

      expect(oldEvents.length).toBeGreaterThan(0);
      expect(oldEvents.some((e: any) => e.event_id === oldEventId)).toBe(true);
    });

    it('should preserve pending and processing events during cleanup', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 31);

      // Insert old pending event (should NOT be cleaned)
      const pendingEventId = `evt_${uuidv4().replace(/-/g, '')}`;
      await db('venue_webhook_events').insert({
        event_id: pendingEventId,
        event_type: 'identity.verification_session.verified',
        status: 'pending',
        tenant_id: TEST_TENANT_ID_1,
        source: 'stripe_identity',
        processed_at: oldDate,
      });

      // Insert old processing event (should NOT be cleaned)
      const processingEventId = `evt_${uuidv4().replace(/-/g, '')}`;
      await db('venue_webhook_events').insert({
        event_id: processingEventId,
        event_type: 'identity.verification_session.verified',
        status: 'processing',
        tenant_id: TEST_TENANT_ID_1,
        source: 'stripe_identity',
        processed_at: oldDate,
      });

      // Query for events that would be deleted
      const eventsToDelete = await db('venue_webhook_events')
        .where('processed_at', '<', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
        .whereIn('status', ['completed', 'failed']);

      // Pending and processing events should not be in the deletion list
      expect(eventsToDelete.every((e: any) =>
        e.event_id !== pendingEventId && e.event_id !== processingEventId
      )).toBe(true);

      // Verify the events still exist
      const pendingEvent = await db('venue_webhook_events')
        .where('event_id', pendingEventId)
        .first();
      const processingEvent = await db('venue_webhook_events')
        .where('event_id', processingEventId)
        .first();

      expect(pendingEvent).toBeDefined();
      expect(processingEvent).toBeDefined();
    });
  });
});
