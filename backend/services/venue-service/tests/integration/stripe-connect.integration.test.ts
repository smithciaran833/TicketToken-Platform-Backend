/**
 * Stripe Connect Integration Tests
 *
 * Uses REAL Stripe sandbox - requires valid test keys in .env.test:
 *   - STRIPE_SECRET_KEY=sk_test_...
 *   - STRIPE_WEBHOOK_SECRET_VENUE=whsec_...
 *
 * For webhook tests, run: stripe listen --forward-to localhost:3004/api/webhooks/stripe/venue-connect
 */

import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '../../.env.test') });

import request from 'supertest';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import Stripe from 'stripe';
import { getTestDb } from './helpers/db';
import { getTestRedis } from './helpers/redis';

// =============================================================================
// RSA KEYPAIR FOR JWT SIGNING
// =============================================================================
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

import fs from 'fs';
import os from 'os';
const tempKeyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stripe-connect-test-keys-'));
const publicKeyPath = path.join(tempKeyDir, 'jwt-public.pem');
fs.writeFileSync(publicKeyPath, publicKey);
process.env.JWT_PUBLIC_KEY_PATH = publicKeyPath;

// =============================================================================
// TEST CONSTANTS
// =============================================================================
const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const VENUE_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

// Second tenant for isolation tests
const TENANT_B_ID = '22222222-2222-2222-2222-222222222222';
const USER_B_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const VENUE_B_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee02';

// =============================================================================
// STRIPE CLIENT FOR TEST VERIFICATION
// =============================================================================
const stripeSecretKey = process.env.STRIPE_SECRET_KEY!;
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET_VENUE!;

if (!stripeSecretKey || !stripeSecretKey.startsWith('sk_test_')) {
  throw new Error('Valid STRIPE_SECRET_KEY (sk_test_...) required in .env.test');
}

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2024-11-20.acacia' as any,
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================
function generateTestJWT(payload: {
  sub: string;
  tenant_id: string;
  email: string;
  permissions?: string[];
}): string {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      sub: payload.sub,
      email: payload.email,
      tenant_id: payload.tenant_id,
      permissions: payload.permissions || ['*'],
      iat: now,
      exp: now + 3600,
    },
    privateKey,
    { algorithm: 'RS256' }
  );
}

/**
 * Generate a Stripe webhook signature for testing
 */
function generateWebhookSignature(payload: string, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${payload}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

/**
 * Create a mock Stripe account.updated webhook event
 */
function createAccountUpdatedEvent(
  accountId: string,
  venueId: string,
  tenantId: string,
  overrides: Partial<Stripe.Account> = {}
): Stripe.Event {
  return {
    id: `evt_test_${Date.now()}`,
    object: 'event',
    type: 'account.updated',
    api_version: '2024-11-20.acacia' as any,
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: accountId,
        object: 'account',
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false,
        capabilities: {},
        country: 'US',
        metadata: {
          venue_id: venueId,
          tenant_id: tenantId,
        },
        requirements: {
          currently_due: [],
          eventually_due: [],
          past_due: [],
          disabled_reason: null,
        },
        ...overrides,
      } as Stripe.Account,
    },
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
  } as Stripe.Event;
}

// =============================================================================
// CLEANUP HELPER - Delete test Connect accounts
// =============================================================================
async function cleanupStripeAccount(accountId: string): Promise<void> {
  try {
    await stripe.accounts.del(accountId);
  } catch (error: any) {
    // Ignore if already deleted
    if (error.code !== 'resource_missing') {
      console.warn(`Failed to cleanup Stripe account ${accountId}:`, error.message);
    }
  }
}

// Track created accounts for cleanup
const createdStripeAccounts: string[] = [];

// =============================================================================
// TEST SUITE
// =============================================================================
describe('Stripe Connect Integration Tests', () => {
  let app: any;
  let db: ReturnType<typeof getTestDb>;
  let redis: ReturnType<typeof getTestRedis>;
  let token: string;
  let tokenB: string;

  beforeAll(async () => {
    const { buildApp } = await import('../../src/app');
    app = await buildApp();
    await app.ready();
    db = getTestDb();
    redis = getTestRedis();

    token = generateTestJWT({
      sub: USER_ID,
      tenant_id: TENANT_ID,
      email: 'owner@venue-a.com',
    });

    tokenB = generateTestJWT({
      sub: USER_B_ID,
      tenant_id: TENANT_B_ID,
      email: 'owner@venue-b.com',
    });
  }, 60000);

  afterAll(async () => {
    // Cleanup all created Stripe accounts
    for (const accountId of createdStripeAccounts) {
      await cleanupStripeAccount(accountId);
    }

    if (app) await app.close();

    try {
      fs.unlinkSync(publicKeyPath);
      fs.rmdirSync(tempKeyDir);
    } catch {}
  });

  beforeEach(async () => {
    // Clean database
    await db.raw('TRUNCATE TABLE venue_webhook_events CASCADE');
    await db.raw('TRUNCATE TABLE venue_staff CASCADE');
    await db.raw('TRUNCATE TABLE venue_settings CASCADE');
    await db.raw('TRUNCATE TABLE venues CASCADE');
    await db.raw('TRUNCATE TABLE users CASCADE');
    await db.raw('TRUNCATE TABLE tenants CASCADE');

    // Clear Redis
    const keys = await redis.keys('*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }

    // Seed Tenant A
    await db('tenants').insert({
      id: TENANT_ID,
      name: 'Tenant A',
      slug: 'tenant-a',
      created_at: new Date(),
      updated_at: new Date(),
    });

    await db('users').insert({
      id: USER_ID,
      tenant_id: TENANT_ID,
      email: 'owner@venue-a.com',
      password_hash: '$2b$10$dummyhashfortesting',
      created_at: new Date(),
      updated_at: new Date(),
    });

    await db('venues').insert({
      id: VENUE_ID,
      tenant_id: TENANT_ID,
      name: 'Test Venue A',
      slug: 'test-venue-a',
      email: 'venue@test-a.com',
      address_line1: '123 Main St',
      city: 'New York',
      state_province: 'NY',
      country_code: 'US',
      venue_type: 'theater',
      max_capacity: 500,
      status: 'active',
      created_by: USER_ID,
      created_at: new Date(),
      updated_at: new Date(),
    });

    await db('venue_staff').insert({
      venue_id: VENUE_ID,
      tenant_id: TENANT_ID,
      user_id: USER_ID,
      role: 'owner',
      permissions: ['*'],
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });

    // Seed Tenant B
    await db('tenants').insert({
      id: TENANT_B_ID,
      name: 'Tenant B',
      slug: 'tenant-b',
      created_at: new Date(),
      updated_at: new Date(),
    });

    await db('users').insert({
      id: USER_B_ID,
      tenant_id: TENANT_B_ID,
      email: 'owner@venue-b.com',
      password_hash: '$2b$10$dummyhashfortesting',
      created_at: new Date(),
      updated_at: new Date(),
    });

    await db('venues').insert({
      id: VENUE_B_ID,
      tenant_id: TENANT_B_ID,
      name: 'Test Venue B',
      slug: 'test-venue-b',
      email: 'venue@test-b.com',
      address_line1: '456 Oak Ave',
      city: 'Los Angeles',
      state_province: 'CA',
      country_code: 'US',
      venue_type: 'arena',
      max_capacity: 1000,
      status: 'active',
      created_by: USER_B_ID,
      created_at: new Date(),
      updated_at: new Date(),
    });

    await db('venue_staff').insert({
      venue_id: VENUE_B_ID,
      tenant_id: TENANT_B_ID,
      user_id: USER_B_ID,
      role: 'owner',
      permissions: ['*'],
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });
  });

  // ===========================================================================
  // STRIPE ACCOUNT CREATION TESTS
  // ===========================================================================
  describe('POST /api/venues/:venueId/stripe/connect', () => {
    it('should create a real Stripe Connect account and return onboarding URL', async () => {
      const response = await request(app.server)
        .post(`/api/venues/${VENUE_ID}/stripe/connect`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: 'stripe-test@venue-a.com',
          returnUrl: 'https://example.com/return',
          refreshUrl: 'https://example.com/refresh',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.accountId).toMatch(/^acct_/);
      expect(response.body.data.onboardingUrl).toContain('connect.stripe.com');
      expect(response.body.data.accountStatus).toBe('pending');

      // Track for cleanup
      createdStripeAccounts.push(response.body.data.accountId);

      // Verify database was updated
      const venue = await db('venues').where('id', VENUE_ID).first();
      expect(venue.stripe_connect_account_id).toBe(response.body.data.accountId);
      expect(venue.stripe_connect_status).toBe('pending');
      expect(venue.stripe_connect_charges_enabled).toBe(false);
      expect(venue.stripe_connect_payouts_enabled).toBe(false);

      // Verify account exists in Stripe with correct metadata
      const stripeAccount = await stripe.accounts.retrieve(response.body.data.accountId);
      expect(stripeAccount.metadata?.venue_id).toBe(VENUE_ID);
      expect(stripeAccount.metadata?.tenant_id).toBe(TENANT_ID);
    });

    it('should return existing account if venue already has one', async () => {
      // Create first account
      const response1 = await request(app.server)
        .post(`/api/venues/${VENUE_ID}/stripe/connect`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: 'stripe-test@venue-a.com',
          returnUrl: 'https://example.com/return',
          refreshUrl: 'https://example.com/refresh',
        });

      expect(response1.status).toBe(200);
      const accountId = response1.body.data.accountId;
      createdStripeAccounts.push(accountId);

      // Try to create again
      const response2 = await request(app.server)
        .post(`/api/venues/${VENUE_ID}/stripe/connect`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: 'different-email@venue-a.com',
          returnUrl: 'https://example.com/return',
          refreshUrl: 'https://example.com/refresh',
        });

      expect(response2.status).toBe(200);
      expect(response2.body.data.accountId).toBe(accountId); // Same account
    });

    it('should reject invalid email format with 422', async () => {
      const response = await request(app.server)
        .post(`/api/venues/${VENUE_ID}/stripe/connect`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: 'not-an-email',
          returnUrl: 'https://example.com/return',
          refreshUrl: 'https://example.com/refresh',
        });

      expect(response.status).toBe(422);  // 422 is correct for validation errors
      expect(response.body.error).toContain('Validation failed');
    });

    it('should reject non-HTTPS URLs with 400', async () => {
      const response = await request(app.server)
        .post(`/api/venues/${VENUE_ID}/stripe/connect`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: 'test@example.com',
          returnUrl: 'http://insecure.com/return',
          refreshUrl: 'https://example.com/refresh',
        });

      expect(response.status).toBe(400);  // 400 is correct for business rule validation
      expect(response.body.error).toContain('HTTPS');
    });

    it('should allow localhost URLs for development', async () => {
      const response = await request(app.server)
        .post(`/api/venues/${VENUE_ID}/stripe/connect`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: 'test@example.com',
          returnUrl: 'http://localhost:3000/return',
          refreshUrl: 'http://localhost:3000/refresh',
        });

      expect(response.status).toBe(200);
      createdStripeAccounts.push(response.body.data.accountId);
    });

    it('should reject unauthenticated requests with 401', async () => {
      const response = await request(app.server)
        .post(`/api/venues/${VENUE_ID}/stripe/connect`)
        .send({
          email: 'test@example.com',
          returnUrl: 'https://example.com/return',
          refreshUrl: 'https://example.com/refresh',
        });

      expect(response.status).toBe(401);
    });

    it('should reject requests from different tenant with 403 or venue not found', async () => {
      // User B trying to access Venue A
      const response = await request(app.server)
        .post(`/api/venues/${VENUE_ID}/stripe/connect`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          email: 'test@example.com',
          returnUrl: 'https://example.com/return',
          refreshUrl: 'https://example.com/refresh',
        });

      // Should fail - either 403 Forbidden or 500 with "access denied"
      expect([403, 500]).toContain(response.status);
    });
  });

  // ===========================================================================
  // STRIPE STATUS TESTS
  // ===========================================================================
  describe('GET /api/venues/:venueId/stripe/status', () => {
    it('should return not_started for venue without Connect account', async () => {
      const response = await request(app.server)
        .get(`/api/venues/${VENUE_ID}/stripe/status`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.accountId).toBeNull();
      expect(response.body.data.status).toBe('not_started');
      expect(response.body.data.chargesEnabled).toBe(false);
      expect(response.body.data.payoutsEnabled).toBe(false);
    });

    it('should return real status from Stripe for existing account', async () => {
      // First create an account
      const createResponse = await request(app.server)
        .post(`/api/venues/${VENUE_ID}/stripe/connect`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: 'status-test@venue-a.com',
          returnUrl: 'https://example.com/return',
          refreshUrl: 'https://example.com/refresh',
        });

      createdStripeAccounts.push(createResponse.body.data.accountId);

      // Get status
      const response = await request(app.server)
        .get(`/api/venues/${VENUE_ID}/stripe/status`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data.accountId).toBe(createResponse.body.data.accountId);
      expect(response.body.data.status).toBe('pending');
      expect(response.body.data.detailsSubmitted).toBe(false);
    });
  });

  // ===========================================================================
  // WEBHOOK TESTS
  // ===========================================================================
  describe('POST /api/webhooks/stripe/venue-connect', () => {
    it('should reject requests without stripe-signature header', async () => {
      const response = await request(app.server)
        .post('/api/webhooks/stripe/venue-connect')
        .send({ type: 'account.updated' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('signature');
    });

    it('should reject invalid webhook signatures', async () => {
      const payload = JSON.stringify(createAccountUpdatedEvent(
        'acct_fake',
        VENUE_ID,
        TENANT_ID
      ));

      const response = await request(app.server)
        .post('/api/webhooks/stripe/venue-connect')
        .set('Content-Type', 'application/json')
        .set('Stripe-Signature', 'invalid_signature')
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('signature');
    });

    it('should process valid account.updated webhook and update database', async () => {
      // First create a real account
      const createResponse = await request(app.server)
        .post(`/api/venues/${VENUE_ID}/stripe/connect`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: 'webhook-test@venue-a.com',
          returnUrl: 'https://example.com/return',
          refreshUrl: 'https://example.com/refresh',
        });

      const accountId = createResponse.body.data.accountId;
      createdStripeAccounts.push(accountId);

      // Create webhook event
      const event = createAccountUpdatedEvent(accountId, VENUE_ID, TENANT_ID, {
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
        country: 'US',
      });

      const payload = JSON.stringify(event);
      const signature = generateWebhookSignature(payload, stripeWebhookSecret);

      const response = await request(app.server)
        .post('/api/webhooks/stripe/venue-connect')
        .set('Content-Type', 'application/json')
        .set('Stripe-Signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.received).toBe(true);

      // Verify database was updated
      const venue = await db('venues').where('id', VENUE_ID).first();
      expect(venue.stripe_connect_status).toBe('enabled');
      expect(venue.stripe_connect_charges_enabled).toBe(true);
      expect(venue.stripe_connect_payouts_enabled).toBe(true);
      expect(venue.stripe_connect_details_submitted).toBe(true);
      expect(venue.stripe_connect_country).toBe('US');
    });

    it('should deduplicate webhook events', async () => {
      // Create a real account first
      const createResponse = await request(app.server)
        .post(`/api/venues/${VENUE_ID}/stripe/connect`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: 'dedup-test@venue-a.com',
          returnUrl: 'https://example.com/return',
          refreshUrl: 'https://example.com/refresh',
        });

      const accountId = createResponse.body.data.accountId;
      createdStripeAccounts.push(accountId);

      // Create event with fixed ID
      const event = createAccountUpdatedEvent(accountId, VENUE_ID, TENANT_ID);
      event.id = 'evt_dedup_test_12345';

      const payload = JSON.stringify(event);
      const signature = generateWebhookSignature(payload, stripeWebhookSecret);

      // Send first time
      const response1 = await request(app.server)
        .post('/api/webhooks/stripe/venue-connect')
        .set('Content-Type', 'application/json')
        .set('Stripe-Signature', signature)
        .send(payload);

      expect(response1.status).toBe(200);
      expect(response1.body.duplicate).toBeFalsy();

      // Send second time with same event ID
      const signature2 = generateWebhookSignature(payload, stripeWebhookSecret);
      const response2 = await request(app.server)
        .post('/api/webhooks/stripe/venue-connect')
        .set('Content-Type', 'application/json')
        .set('Stripe-Signature', signature2)
        .send(payload);

      expect(response2.status).toBe(200);
      expect(response2.body.duplicate).toBe(true);
    });

    it('should reject webhook with mismatched tenant_id', async () => {
      // Create account for Tenant A
      const createResponse = await request(app.server)
        .post(`/api/venues/${VENUE_ID}/stripe/connect`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: 'tenant-mismatch@venue-a.com',
          returnUrl: 'https://example.com/return',
          refreshUrl: 'https://example.com/refresh',
        });

      const accountId = createResponse.body.data.accountId;
      createdStripeAccounts.push(accountId);

      // Create webhook with WRONG tenant_id
      const event = createAccountUpdatedEvent(accountId, VENUE_ID, TENANT_B_ID); // Wrong tenant!
      const payload = JSON.stringify(event);
      const signature = generateWebhookSignature(payload, stripeWebhookSecret);

      const response = await request(app.server)
        .post('/api/webhooks/stripe/venue-connect')
        .set('Content-Type', 'application/json')
        .set('Stripe-Signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.processed).toBe(false);
      expect(response.body.reason).toContain('Tenant validation failed');
    });

    it('should handle webhook for non-existent venue gracefully', async () => {
      const fakeVenueId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
      const event = createAccountUpdatedEvent('acct_fake123', fakeVenueId, TENANT_ID);
      const payload = JSON.stringify(event);
      const signature = generateWebhookSignature(payload, stripeWebhookSecret);

      const response = await request(app.server)
        .post('/api/webhooks/stripe/venue-connect')
        .set('Content-Type', 'application/json')
        .set('Stripe-Signature', signature)
        .send(payload);

      // Should return 200 (don't retry) but not process
      expect(response.status).toBe(200);
    });
  });

  // ===========================================================================
  // CIRCUIT BREAKER TESTS
  // ===========================================================================
  describe('Circuit Breaker', () => {
    it('should track circuit breaker state', async () => {
      // Import the circuit breaker
      const { stripeCircuitBreaker } = await import('../../src/services/venue-stripe-onboarding.service');

      const state = stripeCircuitBreaker.getState();
      expect(state).toHaveProperty('isOpen');
      expect(state).toHaveProperty('failures');
      expect(state).toHaveProperty('lastFailure');
    });
  });

  // ===========================================================================
  // REFRESH LINK TESTS
  // ===========================================================================
  describe('POST /api/venues/:venueId/stripe/refresh', () => {
    it('should generate new onboarding link for existing account', async () => {
      // First create an account
      const createResponse = await request(app.server)
        .post(`/api/venues/${VENUE_ID}/stripe/connect`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: 'refresh-test@venue-a.com',
          returnUrl: 'https://example.com/return',
          refreshUrl: 'https://example.com/refresh',
        });

      createdStripeAccounts.push(createResponse.body.data.accountId);

      // Refresh the link
      const response = await request(app.server)
        .post(`/api/venues/${VENUE_ID}/stripe/refresh`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          returnUrl: 'https://example.com/new-return',
          refreshUrl: 'https://example.com/new-refresh',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.onboardingUrl).toContain('connect.stripe.com');
    });

    it('should fail for venue without Connect account', async () => {
      const response = await request(app.server)
        .post(`/api/venues/${VENUE_ID}/stripe/refresh`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          returnUrl: 'https://example.com/return',
          refreshUrl: 'https://example.com/refresh',
        });

      expect(response.status).toBe(500);
      expect(response.body.message).toContain('does not have');
    });
  });
});
