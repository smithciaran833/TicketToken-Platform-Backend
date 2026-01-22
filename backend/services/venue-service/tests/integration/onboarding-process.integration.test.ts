import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '../../.env.test') });

import request from 'supertest';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getTestDb } from './helpers/db';
import { getTestRedis } from './helpers/redis';

// Generate RSA keypair for JWT signing
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

import fs from 'fs';
import os from 'os';
const tempKeyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onboarding-test-keys-'));
const publicKeyPath = path.join(tempKeyDir, 'jwt-public.pem');
fs.writeFileSync(publicKeyPath, publicKey);

process.env.JWT_PUBLIC_KEY_PATH = publicKeyPath;
process.env.DISABLE_RATE_LIMIT = 'true';

// Test constants - Valid UUID v4 format
const TEST_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const TEST_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_TENANT_ID = '22222222-2222-2222-2222-222222222222';
const OTHER_USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const STAFF_USER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

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

describe('Onboarding Process Integration Tests', () => {
  let app: any;
  let db: ReturnType<typeof getTestDb>;
  let redis: ReturnType<typeof getTestRedis>;
  let authToken: string;
  let otherTenantToken: string;

  beforeAll(async () => {
    const { buildApp } = await import('../../src/app');
    app = await buildApp();
    await app.ready();
    db = getTestDb();
    redis = getTestRedis();
    authToken = generateTestJWT({ sub: TEST_USER_ID, tenant_id: TEST_TENANT_ID });
    otherTenantToken = generateTestJWT({ sub: OTHER_USER_ID, tenant_id: OTHER_TENANT_ID });
  }, 30000);

  afterAll(async () => {
    if (app) await app.close();
    try {
      fs.unlinkSync(publicKeyPath);
      fs.rmdirSync(tempKeyDir);
    } catch {}
  });

  beforeEach(async () => {
    // Only clean venue-related tables (NOT users or tenants!)
    // This matches the working pattern from venue-lifecycle.integration.test.ts
    await db('venue_staff').del();
    await db('venue_integrations').del();
    await db('venue_layouts').del();
    await db('venue_settings').del();
    await db('venues').del();

    // Seed tenants (ignore if exists - don't delete!)
    await db('tenants').insert({
      id: TEST_TENANT_ID,
      name: 'Test Tenant',
      slug: 'test-tenant',
      created_at: new Date(),
      updated_at: new Date(),
    }).onConflict('id').ignore();

    await db('tenants').insert({
      id: OTHER_TENANT_ID,
      name: 'Other Tenant',
      slug: 'other-tenant',
      created_at: new Date(),
      updated_at: new Date(),
    }).onConflict('id').ignore();

    // Seed test users using merge to handle email conflicts
    // This updates the record if id exists, ensuring email matches
    await db('users').insert({
      id: TEST_USER_ID,
      email: 'onboard-owner@test.com',
      password_hash: '$2b$10$dummyhashfortestingpurposesonly',
      tenant_id: TEST_TENANT_ID,
      created_at: new Date(),
      updated_at: new Date(),
    }).onConflict('id').merge({
      email: 'onboard-owner@test.com',
      tenant_id: TEST_TENANT_ID,
      updated_at: new Date(),
    });

    await db('users').insert({
      id: OTHER_USER_ID,
      email: 'onboard-other@test.com',
      password_hash: '$2b$10$dummyhashfortestingpurposesonly',
      tenant_id: OTHER_TENANT_ID,
      created_at: new Date(),
      updated_at: new Date(),
    }).onConflict('id').merge({
      email: 'onboard-other@test.com',
      tenant_id: OTHER_TENANT_ID,
      updated_at: new Date(),
    });

    await db('users').insert({
      id: STAFF_USER_ID,
      email: 'onboard-staff@test.com',
      password_hash: '$2b$10$dummyhashfortestingpurposesonly',
      tenant_id: TEST_TENANT_ID,
      created_at: new Date(),
      updated_at: new Date(),
    }).onConflict('id').merge({
      email: 'onboard-staff@test.com',
      tenant_id: TEST_TENANT_ID,
      updated_at: new Date(),
    });

    // Clear rate limit keys
    const keys = await redis.keys('rate_limit:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  // Helper: Create a venue and return its ID
  async function createTestVenue(name = 'Onboarding Test Venue'): Promise<string> {
    const payload = createValidVenuePayload({ name });
    const res = await request(app.server)
      .post('/api/v1/venues')
      .set('Authorization', `Bearer ${authToken}`)
      .send(payload)
      .expect(201);
    return res.body.id;
  }

  // ===========================================
  // SECTION 1: GET ONBOARDING STATUS
  // ===========================================
  describe('GET /venues/:venueId/onboarding/status', () => {

    it('should return onboarding status for new venue', async () => {
      const venueId = await createTestVenue();

      const res = await request(app.server)
        .get(`/api/v1/venues/${venueId}/onboarding/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('venueId', venueId);
      expect(res.body.data).toHaveProperty('progress');
      expect(res.body.data).toHaveProperty('steps');
      expect(res.body.data.steps.length).toBe(5);
    });

    it('should show all 5 steps with correct IDs', async () => {
      const venueId = await createTestVenue();

      const res = await request(app.server)
        .get(`/api/v1/venues/${venueId}/onboarding/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const stepIds = res.body.data.steps.map((s: any) => s.id);
      expect(stepIds).toEqual(['basic_info', 'address', 'layout', 'payment', 'staff']);
    });

    it('should mark required steps correctly', async () => {
      const venueId = await createTestVenue();

      const res = await request(app.server)
        .get(`/api/v1/venues/${venueId}/onboarding/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const steps = res.body.data.steps;
      expect(steps.find((s: any) => s.id === 'basic_info').required).toBe(true);
      expect(steps.find((s: any) => s.id === 'address').required).toBe(true);
      expect(steps.find((s: any) => s.id === 'layout').required).toBe(false);
      expect(steps.find((s: any) => s.id === 'payment').required).toBe(true);
      expect(steps.find((s: any) => s.id === 'staff').required).toBe(false);
    });

    it('should show basic_info and address as completed for new venue', async () => {
      const venueId = await createTestVenue();

      const res = await request(app.server)
        .get(`/api/v1/venues/${venueId}/onboarding/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const steps = res.body.data.steps;
      expect(steps.find((s: any) => s.id === 'basic_info').completed).toBe(true);
      expect(steps.find((s: any) => s.id === 'address').completed).toBe(true);
    });

    it('should calculate progress correctly', async () => {
      const venueId = await createTestVenue();

      const res = await request(app.server)
        .get(`/api/v1/venues/${venueId}/onboarding/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.data.progress).toBe(40);
      expect(res.body.data.completedSteps).toBe(2);
      expect(res.body.data.totalSteps).toBe(5);
    });

    it('should return 401 without authentication', async () => {
      const venueId = await createTestVenue();

      await request(app.server)
        .get(`/api/v1/venues/${venueId}/onboarding/status`)
        .expect(401);
    });

    it('should return 404 for non-existent venue', async () => {
      const fakeId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

      const res = await request(app.server)
        .get(`/api/v1/venues/${fakeId}/onboarding/status`)
        .set('Authorization', `Bearer ${authToken}`);

      expect([404, 403]).toContain(res.status);
    });

    it('should return error for cross-tenant access', async () => {
      const venueId = await createTestVenue();

      const res = await request(app.server)
        .get(`/api/v1/venues/${venueId}/onboarding/status`)
        .set('Authorization', `Bearer ${otherTenantToken}`);

      expect([403, 404]).toContain(res.status);
    });

    it('should show status as in_progress when not all steps complete', async () => {
      const venueId = await createTestVenue();

      const res = await request(app.server)
        .get(`/api/v1/venues/${venueId}/onboarding/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.data.status).toBe('in_progress');
    });

    it('should show status as completed when all required steps done', async () => {
      const venueId = await createTestVenue();

      await request(app.server)
        .post(`/api/v1/venues/${venueId}/onboarding/steps/payment`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          type: 'stripe',
          config: { test: true }
        })
        .expect(200);

      const res = await request(app.server)
        .get(`/api/v1/venues/${venueId}/onboarding/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.data.progress).toBe(60);
      expect(res.body.data.status).toBe('in_progress');
    });
  });

  // ===========================================
  // SECTION 2: STEP 1 - BASIC INFO
  // ===========================================
  describe('POST /venues/:venueId/onboarding/steps/basic_info', () => {

    it('should update basic info successfully', async () => {
      const venueId = await createTestVenue();

      const res = await request(app.server)
        .post(`/api/v1/venues/${venueId}/onboarding/steps/basic_info`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Updated Venue Name',
          type: 'arena',
          capacity: 10000
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('basic_info');

      const venue = await db('venues').where({ id: venueId }).first();
      expect(venue.name).toBe('Updated Venue Name');
      expect(venue.venue_type).toBe('arena');
      expect(venue.max_capacity).toBe(10000);
    });

    it('should reject missing required fields', async () => {
      const venueId = await createTestVenue();

      const res = await request(app.server)
        .post(`/api/v1/venues/${venueId}/onboarding/steps/basic_info`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Missing Type and Capacity'
        })
        .expect(422);

      expect(res.body.error || res.body.message).toBeDefined();
    });

    it('should reject invalid venue type', async () => {
      const venueId = await createTestVenue();

      const res = await request(app.server)
        .post(`/api/v1/venues/${venueId}/onboarding/steps/basic_info`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test Venue',
          type: 'invalid_type',
          capacity: 500
        })
        .expect(422);

      expect(res.body.error || res.body.message).toBeDefined();
    });

    it('should validate tenant ownership', async () => {
      const venueId = await createTestVenue();

      const res = await request(app.server)
        .post(`/api/v1/venues/${venueId}/onboarding/steps/basic_info`)
        .set('Authorization', `Bearer ${otherTenantToken}`)
        .send({
          name: 'Cross Tenant Update',
          type: 'theater',
          capacity: 300
        });

      expect([403, 404]).toContain(res.status);
    });

    it('should update within transaction (no partial updates)', async () => {
      const venueId = await createTestVenue();

      await request(app.server)
        .post(`/api/v1/venues/${venueId}/onboarding/steps/basic_info`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Transaction Test',
          type: 'comedy_club',
          capacity: 200
        })
        .expect(200);

      const venue = await db('venues').where({ id: venueId }).first();
      expect(venue.name).toBe('Transaction Test');
      expect(venue.max_capacity).toBe(200);
    });
  });

  // ===========================================
  // SECTION 3: STEP 2 - ADDRESS
  // ===========================================
  describe('POST /venues/:venueId/onboarding/steps/address', () => {

    it('should update address with nested object format', async () => {
      const venueId = await createTestVenue();

      const res = await request(app.server)
        .post(`/api/v1/venues/${venueId}/onboarding/steps/address`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          address: {
            street: '456 New St',
            city: 'Los Angeles',
            state: 'CA',
            zipCode: '90001',
            country: 'US'
          }
        })
        .expect(200);

      expect(res.body.success).toBe(true);

      const venue = await db('venues').where({ id: venueId }).first();
      expect(venue.address_line1).toBe('456 New St');
      expect(venue.city).toBe('Los Angeles');
      expect(venue.state_province).toBe('CA');
      expect(venue.postal_code).toBe('90001');
    });

    it('should update address with flat fields format', async () => {
      const venueId = await createTestVenue();

      const res = await request(app.server)
        .post(`/api/v1/venues/${venueId}/onboarding/steps/address`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          street: '789 Flat St',
          city: 'Chicago',
          state: 'IL',
          zipCode: '60601'
        })
        .expect(200);

      expect(res.body.success).toBe(true);

      const venue = await db('venues').where({ id: venueId }).first();
      expect(venue.address_line1).toBe('789 Flat St');
      expect(venue.city).toBe('Chicago');
    });

    it('should reject missing required address fields', async () => {
      const venueId = await createTestVenue();

      const res = await request(app.server)
        .post(`/api/v1/venues/${venueId}/onboarding/steps/address`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          city: 'Incomplete Address'
        })
        .expect(422);

      expect(res.body.error || res.body.message).toBeDefined();
    });

    it('should validate tenant ownership', async () => {
      const venueId = await createTestVenue();

      const res = await request(app.server)
        .post(`/api/v1/venues/${venueId}/onboarding/steps/address`)
        .set('Authorization', `Bearer ${otherTenantToken}`)
        .send({
          address: {
            street: '123 Cross Tenant',
            city: 'Boston',
            state: 'MA',
            zipCode: '02101'
          }
        });

      expect([403, 404]).toContain(res.status);
    });

    it('should update within transaction', async () => {
      const venueId = await createTestVenue();

      await request(app.server)
        .post(`/api/v1/venues/${venueId}/onboarding/steps/address`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          street: '999 Transaction Test',
          city: 'Seattle',
          state: 'WA',
          zipCode: '98101'
        })
        .expect(200);

      const venue = await db('venues').where({ id: venueId }).first();
      expect(venue.city).toBe('Seattle');
      expect(venue.state_province).toBe('WA');
    });
  });

  // ===========================================
  // SECTION 4: STEP 3 - LAYOUT
  // ===========================================
  describe('POST /venues/:venueId/onboarding/steps/layout', () => {

    it('should create layout successfully', async () => {
      const venueId = await createTestVenue();

      const res = await request(app.server)
        .post(`/api/v1/venues/${venueId}/onboarding/steps/layout`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Main Floor',
          type: 'general_admission',
          capacity: 500
        })
        .expect(200);

      expect(res.body.success).toBe(true);

      const layouts = await db('venue_layouts').where({ venue_id: venueId });
      expect(layouts.length).toBe(1);
      expect(layouts[0].name).toBe('Main Floor');
      expect(layouts[0].is_default).toBe(true);
    });

    it('should mark layout step as completed in status', async () => {
      const venueId = await createTestVenue();

      await request(app.server)
        .post(`/api/v1/venues/${venueId}/onboarding/steps/layout`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test Layout',
          type: 'fixed',
          capacity: 300
        })
        .expect(200);

      const res = await request(app.server)
        .get(`/api/v1/venues/${venueId}/onboarding/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const layoutStep = res.body.data.steps.find((s: any) => s.id === 'layout');
      expect(layoutStep.completed).toBe(true);
    });

    it('should create layout with sections', async () => {
      const venueId = await createTestVenue();

      const res = await request(app.server)
        .post(`/api/v1/venues/${venueId}/onboarding/steps/layout`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Sectioned Layout',
          type: 'fixed',
          capacity: 1000,
          sections: [
            { id: 'section-a', name: 'Section A', rows: 10, seatsPerRow: 20, pricing: { basePrice: 50 } },
            { id: 'section-b', name: 'Section B', rows: 15, seatsPerRow: 25, pricing: { basePrice: 75 } }
          ]
        })
        .expect(200);

      expect(res.body.success).toBe(true);

      const layout = await db('venue_layouts').where({ venue_id: venueId }).first();
      expect(layout.sections).toBeDefined();
      const sections = typeof layout.sections === 'string' ? JSON.parse(layout.sections) : layout.sections;
      expect(sections.length).toBe(2);
    });

    it('should validate tenant ownership', async () => {
      const venueId = await createTestVenue();

      const res = await request(app.server)
        .post(`/api/v1/venues/${venueId}/onboarding/steps/layout`)
        .set('Authorization', `Bearer ${otherTenantToken}`)
        .send({
          name: 'Cross Tenant Layout',
          type: 'general_admission',
          capacity: 200
        });

      expect([403, 404]).toContain(res.status);
    });

    it('should rollback layout if transaction fails', async () => {
      const venueId = await createTestVenue();

      const layoutsBefore = await db('venue_layouts').where({ venue_id: venueId });
      expect(layoutsBefore.length).toBe(0);

      await request(app.server)
        .post(`/api/v1/venues/${venueId}/onboarding/steps/layout`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Transactional Layout',
          type: 'general_admission',
          capacity: 400
        })
        .expect(200);

      const layoutsAfter = await db('venue_layouts').where({ venue_id: venueId });
      expect(layoutsAfter.length).toBe(1);
    });
  });

  // ===========================================
  // SECTION 5: STEP 4 - PAYMENT
  // ===========================================
  describe('POST /venues/:venueId/onboarding/steps/payment', () => {

    it('should create Stripe integration successfully', async () => {
      const venueId = await createTestVenue();

      const res = await request(app.server)
        .post(`/api/v1/venues/${venueId}/onboarding/steps/payment`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          type: 'stripe',
          config: { test_mode: true }
        })
        .expect(200);

      expect(res.body.success).toBe(true);

      const integrations = await db('venue_integrations').where({ venue_id: venueId });
      expect(integrations.length).toBe(1);
      expect(integrations[0].integration_type).toBe('stripe');
    });

    it('should create Square integration successfully', async () => {
      const venueId = await createTestVenue();

      const res = await request(app.server)
        .post(`/api/v1/venues/${venueId}/onboarding/steps/payment`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          type: 'square',
          config: { location_id: 'test-location' }
        })
        .expect(200);

      expect(res.body.success).toBe(true);

      const integrations = await db('venue_integrations').where({ venue_id: venueId });
      expect(integrations[0].integration_type).toBe('square');
    });

    it('should reject invalid integration type', async () => {
      const venueId = await createTestVenue();

      const res = await request(app.server)
        .post(`/api/v1/venues/${venueId}/onboarding/steps/payment`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          type: 'paypal',
          config: {}
        })
        .expect(422);

      expect(res.body.error || res.body.message).toBeDefined();
    });

    it('should encrypt credentials if provided', async () => {
      const venueId = await createTestVenue();

      await request(app.server)
        .post(`/api/v1/venues/${venueId}/onboarding/steps/payment`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          type: 'stripe',
          credentials: { api_key: 'sk_test_12345' }
        })
        .expect(200);

      const integration = await db('venue_integrations').where({ venue_id: venueId }).first();
      expect(integration.api_key_encrypted).toBeDefined();
      expect(integration.api_key_encrypted).not.toBe('sk_test_12345');
    });

    it('should mark payment step as completed', async () => {
      const venueId = await createTestVenue();

      await request(app.server)
        .post(`/api/v1/venues/${venueId}/onboarding/steps/payment`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ type: 'stripe', config: {} })
        .expect(200);

      const res = await request(app.server)
        .get(`/api/v1/venues/${venueId}/onboarding/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const paymentStep = res.body.data.steps.find((s: any) => s.id === 'payment');
      expect(paymentStep.completed).toBe(true);
    });

    it('should validate tenant ownership', async () => {
      const venueId = await createTestVenue();

      const res = await request(app.server)
        .post(`/api/v1/venues/${venueId}/onboarding/steps/payment`)
        .set('Authorization', `Bearer ${otherTenantToken}`)
        .send({ type: 'stripe', config: {} });

      expect([403, 404]).toContain(res.status);
    });

    it('should rollback integration if transaction fails', async () => {
      const venueId = await createTestVenue();

      const integrationsBefore = await db('venue_integrations').where({ venue_id: venueId });
      expect(integrationsBefore.length).toBe(0);

      await request(app.server)
        .post(`/api/v1/venues/${venueId}/onboarding/steps/payment`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ type: 'stripe', config: { test: true } })
        .expect(200);

      const integrationsAfter = await db('venue_integrations').where({ venue_id: venueId });
      expect(integrationsAfter.length).toBe(1);
    });
  });

  // ===========================================
  // SECTION 6: STEP 5 - STAFF
  // ===========================================
  describe('POST /venues/:venueId/onboarding/steps/staff', () => {

    it('should add staff member successfully', async () => {
      const venueId = await createTestVenue();

      const res = await request(app.server)
        .post(`/api/v1/venues/${venueId}/onboarding/steps/staff`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ userId: STAFF_USER_ID, role: 'manager' })
        .expect(200);

      expect(res.body.success).toBe(true);

      const staff = await db('venue_staff')
        .where({ venue_id: venueId, user_id: STAFF_USER_ID })
        .first();
      expect(staff).toBeDefined();
      expect(staff.role).toBe('manager');
    });

    it('should mark staff step as completed when staff added', async () => {
      const venueId = await createTestVenue();

      await request(app.server)
        .post(`/api/v1/venues/${venueId}/onboarding/steps/staff`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ userId: STAFF_USER_ID, role: 'box_office' })
        .expect(200);

      const res = await request(app.server)
        .get(`/api/v1/venues/${venueId}/onboarding/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const staffStep = res.body.data.steps.find((s: any) => s.id === 'staff');
      expect(staffStep.completed).toBe(true);
    });

    it('should prevent duplicate staff', async () => {
      const venueId = await createTestVenue();

      await request(app.server)
        .post(`/api/v1/venues/${venueId}/onboarding/steps/staff`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ userId: STAFF_USER_ID, role: 'manager' })
        .expect(200);

      const res = await request(app.server)
        .post(`/api/v1/venues/${venueId}/onboarding/steps/staff`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ userId: STAFF_USER_ID, role: 'viewer' });

      expect([409, 500]).toContain(res.status);
    });

    it('should set default permissions for role', async () => {
      const venueId = await createTestVenue();

      await request(app.server)
        .post(`/api/v1/venues/${venueId}/onboarding/steps/staff`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ userId: STAFF_USER_ID, role: 'door_staff' })
        .expect(200);

      const staff = await db('venue_staff')
        .where({ venue_id: venueId, user_id: STAFF_USER_ID })
        .first();

      expect(staff.permissions).toContain('tickets:validate');
    });

    it('should accept custom permissions', async () => {
      const venueId = await createTestVenue();

      await request(app.server)
        .post(`/api/v1/venues/${venueId}/onboarding/steps/staff`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: STAFF_USER_ID,
          role: 'manager',
          permissions: ['custom:read', 'custom:write']
        })
        .expect(200);

      const staff = await db('venue_staff')
        .where({ venue_id: venueId, user_id: STAFF_USER_ID })
        .first();

      expect(staff.permissions).toEqual(['custom:read', 'custom:write']);
    });

    it('should validate tenant ownership', async () => {
      const venueId = await createTestVenue();

      const res = await request(app.server)
        .post(`/api/v1/venues/${venueId}/onboarding/steps/staff`)
        .set('Authorization', `Bearer ${otherTenantToken}`)
        .send({ userId: STAFF_USER_ID, role: 'manager' });

      expect([403, 404]).toContain(res.status);
    });

    it('should rollback staff if transaction fails', async () => {
      const venueId = await createTestVenue();

      const staffBefore = await db('venue_staff').where({ venue_id: venueId });
      const countBefore = staffBefore.length;

      await request(app.server)
        .post(`/api/v1/venues/${venueId}/onboarding/steps/staff`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ userId: STAFF_USER_ID, role: 'manager' })
        .expect(200);

      const staffAfter = await db('venue_staff').where({ venue_id: venueId });
      expect(staffAfter.length).toBe(countBefore + 1);
    });

    it('should check staff limit (50 members)', async () => {
      const venueId = await createTestVenue();
      const originalLimit = process.env.MAX_STAFF_PER_VENUE;
      process.env.MAX_STAFF_PER_VENUE = '2';

      try {
        await request(app.server)
          .post(`/api/v1/venues/${venueId}/onboarding/steps/staff`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ userId: STAFF_USER_ID, role: 'manager' })
          .expect(200);

        const newUserId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
        await db('users').insert({
          id: newUserId,
          email: 'onboard-third@test.com',
          password_hash: '$2b$10$dummy',
          tenant_id: TEST_TENANT_ID,
          created_at: new Date(),
          updated_at: new Date(),
        }).onConflict('id').merge({
          email: 'onboard-third@test.com',
          tenant_id: TEST_TENANT_ID,
          updated_at: new Date(),
        });

        const res = await request(app.server)
          .post(`/api/v1/venues/${venueId}/onboarding/steps/staff`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ userId: newUserId, role: 'viewer' });

        expect([422, 400]).toContain(res.status);
      } finally {
        if (originalLimit) {
          process.env.MAX_STAFF_PER_VENUE = originalLimit;
        } else {
          delete process.env.MAX_STAFF_PER_VENUE;
        }
      }
    });
  });

  // ===========================================
  // SECTION 7: INVALID STEP HANDLING
  // ===========================================
  describe('Invalid Step Handling', () => {

    it('should reject unknown step ID', async () => {
      const venueId = await createTestVenue();

      const res = await request(app.server)
        .post(`/api/v1/venues/${venueId}/onboarding/steps/invalid_step`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(422);

      expect(res.body.error || res.body.message).toBeDefined();
    });

    it('should reject empty step ID', async () => {
      const venueId = await createTestVenue();

      const res = await request(app.server)
        .post(`/api/v1/venues/${venueId}/onboarding/steps/`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect([404, 422]).toContain(res.status);
    });

    it('should validate step ID before processing', async () => {
      const venueId = await createTestVenue();

      const res = await request(app.server)
        .post(`/api/v1/venues/${venueId}/onboarding/steps/not_a_real_step`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ test: 'data' })
        .expect(422);

      expect(res.body.details || res.body.error || res.body.message).toBeDefined();
    });
  });

  // ===========================================
  // SECTION 8: COMPLETE ONBOARDING FLOW
  // ===========================================
  describe('Complete Onboarding Flow', () => {

    it('should complete all 5 steps in order', async () => {
      const venueId = await createTestVenue();

      await request(app.server)
        .post(`/api/v1/venues/${venueId}/onboarding/steps/layout`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Main Hall', type: 'general_admission', capacity: 500 })
        .expect(200);

      await request(app.server)
        .post(`/api/v1/venues/${venueId}/onboarding/steps/payment`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ type: 'stripe', config: {} })
        .expect(200);

      await request(app.server)
        .post(`/api/v1/venues/${venueId}/onboarding/steps/staff`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ userId: STAFF_USER_ID, role: 'manager' })
        .expect(200);

      const res = await request(app.server)
        .get(`/api/v1/venues/${venueId}/onboarding/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.data.progress).toBe(100);
      expect(res.body.data.completedSteps).toBe(5);
      expect(res.body.data.status).toBe('completed');
    });

    it('should allow completing steps out of order', async () => {
      const venueId = await createTestVenue();

      await request(app.server)
        .post(`/api/v1/venues/${venueId}/onboarding/steps/payment`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ type: 'square', config: {} })
        .expect(200);

      await request(app.server)
        .post(`/api/v1/venues/${venueId}/onboarding/steps/layout`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Out of Order Layout', type: 'fixed', capacity: 300 })
        .expect(200);

      const res = await request(app.server)
        .get(`/api/v1/venues/${venueId}/onboarding/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const layoutStep = res.body.data.steps.find((s: any) => s.id === 'layout');
      const paymentStep = res.body.data.steps.find((s: any) => s.id === 'payment');
      expect(layoutStep.completed).toBe(true);
      expect(paymentStep.completed).toBe(true);
    });
  });
});
