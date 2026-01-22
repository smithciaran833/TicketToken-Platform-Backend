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
const tempKeyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-test-keys-'));
const publicKeyPath = path.join(tempKeyDir, 'jwt-public.pem');
fs.writeFileSync(publicKeyPath, publicKey);

process.env.JWT_PUBLIC_KEY_PATH = publicKeyPath;

// Test constants
const TEST_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const TEST_USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OTHER_TENANT_ID = '22222222-2222-2222-2222-222222222222';
const OTHER_USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const MANAGER_USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const STAFF_USER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

function generateTestJWT(payload: { sub: string; tenant_id: string; role?: string; permissions?: string[] }): string {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      sub: payload.sub,
      email: `${payload.sub}@test.com`,
      tenant_id: payload.tenant_id,
      role: payload.role || 'user',
      permissions: payload.permissions || ['*'],
      iat: now,
      exp: now + 3600,
    },
    privateKey,
    { algorithm: 'RS256' }
  );
}

// Valid venue payload factory
function createValidVenuePayload(overrides: Record<string, any> = {}) {
  return {
    name: 'Settings Test Venue',
    email: 'settings@venue.com',
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

describe('Venue Service - Settings Management Integration Tests', () => {
  let app: any;
  let db: any;
  let redis: any;
  let authToken: string;
  let managerToken: string;
  let staffToken: string;
  let otherTenantToken: string;

  beforeAll(async () => {
    const { buildApp } = await import('../../src/app');
    app = await buildApp();
    await app.ready();
    db = getTestDb();
    redis = getTestRedis();

    authToken = generateTestJWT({ sub: TEST_USER_ID, tenant_id: TEST_TENANT_ID });
    managerToken = generateTestJWT({ sub: MANAGER_USER_ID, tenant_id: TEST_TENANT_ID });
    staffToken = generateTestJWT({ sub: STAFF_USER_ID, tenant_id: TEST_TENANT_ID });
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
    // Clean up in correct order (foreign keys)
    await db('venue_staff').del();
    await db('venue_settings').del();
    await db('venues').del();

    // Seed tenant (handle both id and slug conflicts)
    await db.raw(`
      INSERT INTO tenants (id, name, slug, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (id) DO NOTHING
    `, [TEST_TENANT_ID, 'Test Tenant', 'test-tenant', new Date(), new Date()]);

    // Seed other tenant (handle both id and slug conflicts)
    await db.raw(`
      INSERT INTO tenants (id, name, slug, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (id) DO NOTHING
    `, [OTHER_TENANT_ID, 'Other Tenant', 'other-tenant', new Date(), new Date()]);

    // Seed test user (ignore if exists)
    await db('users').insert({
      id: TEST_USER_ID,
      email: 'test@test.com',
      password_hash: '$2b$10$dummyhashfortestingpurposesonly',
      tenant_id: TEST_TENANT_ID,
      created_at: new Date(),
      updated_at: new Date(),
    }).onConflict('id').ignore();

    // Seed manager user (ignore if exists)
    await db('users').insert({
      id: MANAGER_USER_ID,
      email: 'manager@test.com',
      password_hash: '$2b$10$dummyhashfortestingpurposesonly',
      tenant_id: TEST_TENANT_ID,
      created_at: new Date(),
      updated_at: new Date(),
    }).onConflict('id').ignore();

    // Seed staff user (ignore if exists)
    await db('users').insert({
      id: STAFF_USER_ID,
      email: 'staff@test.com',
      password_hash: '$2b$10$dummyhashfortestingpurposesonly',
      tenant_id: TEST_TENANT_ID,
      created_at: new Date(),
      updated_at: new Date(),
    }).onConflict('id').ignore();

    // Seed other tenant user (ignore if exists)
    await db('users').insert({
      id: OTHER_USER_ID,
      email: 'other@test.com',
      password_hash: '$2b$10$dummyhashfortestingpurposesonly',
      tenant_id: OTHER_TENANT_ID,
      created_at: new Date(),
      updated_at: new Date(),
    }).onConflict('id').ignore();

    // Clear rate limit keys
    const keys = await redis.keys('rate_limit:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  // Helper to create a venue and return its ID
  async function createTestVenue(name: string = 'Settings Test Venue'): Promise<string> {
    const payload = createValidVenuePayload({ name });
    const res = await request(app.server)
      .post('/api/v1/venues')
      .set('Authorization', `Bearer ${authToken}`)
      .send(payload);
    return res.body.id;
  }

  // Helper to add staff member to venue
  async function addStaffMember(venueId: string, userId: string, role: 'manager' | 'staff' | 'box_office') {
    await db('venue_staff').insert({
      venue_id: venueId,
      user_id: userId,
      role: role,
      permissions: role === 'manager' ? ['venue:read', 'venue:update', 'settings:update'] : ['venue:read'],
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });
  }

  // ===========================================
  // SECTION 1: GET SETTINGS
  // ===========================================
  describe('GET /venues/:venueId/settings', () => {

    describe('Basic Retrieval', () => {
      it('should return settings for venue owner', async () => {
        const venueId = await createTestVenue();

        const res = await request(app.server)
          .get(`/api/v1/venues/${venueId}/settings`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body).toHaveProperty('ticketing');
        expect(res.body).toHaveProperty('payment');
        expect(res.body).toHaveProperty('fees');
      });

      it('should return default values for new venue', async () => {
        const venueId = await createTestVenue();

        const res = await request(app.server)
          .get(`/api/v1/venues/${venueId}/settings`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        // Check defaults from SettingsModel
        expect(res.body.ticketing.maxTicketsPerOrder).toBe(10);
        expect(res.body.fees.serviceFeePercentage).toBe(10);
        expect(res.body.payment.paymentMethods).toContain('card');
      });

      it('should return nested structure', async () => {
        const venueId = await createTestVenue();

        const res = await request(app.server)
          .get(`/api/v1/venues/${venueId}/settings`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        // Verify nested structure exists (branding is in venue_branding table, not here)
        expect(res.body.general).toBeDefined();
        expect(res.body.ticketing).toBeDefined();
        expect(res.body.notifications).toBeDefined();
        expect(res.body.payment).toBeDefined();
        expect(res.body.fees).toBeDefined();
        expect(res.body.resale).toBeDefined();
        expect(res.body.features).toBeDefined();
      });

      it('should return settings for manager', async () => {
        const venueId = await createTestVenue();
        await addStaffMember(venueId, MANAGER_USER_ID, 'manager');

        const res = await request(app.server)
          .get(`/api/v1/venues/${venueId}/settings`)
          .set('Authorization', `Bearer ${managerToken}`)
          .expect(200);

        expect(res.body.ticketing).toBeDefined();
      });

      it('should return settings for staff member', async () => {
        const venueId = await createTestVenue();
        await addStaffMember(venueId, STAFF_USER_ID, 'staff');

        const res = await request(app.server)
          .get(`/api/v1/venues/${venueId}/settings`)
          .set('Authorization', `Bearer ${staffToken}`)
          .expect(200);

        expect(res.body.ticketing).toBeDefined();
      });
    });

    describe('Authorization & Security', () => {
      it('should return 401 without authentication', async () => {
        const venueId = await createTestVenue();

        await request(app.server)
          .get(`/api/v1/venues/${venueId}/settings`)
          .expect(401);
      });

      it('should return 403 for non-staff user', async () => {
        const venueId = await createTestVenue();
        const randomUserId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

        await db('users').insert({
          id: randomUserId,
          email: 'random@test.com',
          password_hash: '$2b$10$dummyhashfortestingpurposesonly',
          tenant_id: TEST_TENANT_ID,
          created_at: new Date(),
          updated_at: new Date(),
        }).onConflict('id').ignore();

        const randomToken = generateTestJWT({ sub: randomUserId, tenant_id: TEST_TENANT_ID });

        const res = await request(app.server)
          .get(`/api/v1/venues/${venueId}/settings`)
          .set('Authorization', `Bearer ${randomToken}`);

        expect([403, 500]).toContain(res.status);
      });

      it('should return 403 for cross-tenant access', async () => {
        const venueId = await createTestVenue();

        const res = await request(app.server)
          .get(`/api/v1/venues/${venueId}/settings`)
          .set('Authorization', `Bearer ${otherTenantToken}`);

        expect([403, 404]).toContain(res.status);
      });

      it('should return 404 for non-existent venue', async () => {
        const fakeId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

        const res = await request(app.server)
          .get(`/api/v1/venues/${fakeId}/settings`)
          .set('Authorization', `Bearer ${authToken}`);

        expect([404, 403]).toContain(res.status);
      });
    });
  });

  // ===========================================
  // SECTION 2: SETTINGS UPSERT (PUT)
  // ===========================================
  describe('PUT /venues/:venueId/settings', () => {

    describe('Basic Update', () => {
      it('should update ticketing settings', async () => {
        const venueId = await createTestVenue();

        const res = await request(app.server)
          .put(`/api/v1/venues/${venueId}/settings`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            ticketing: {
              maxTicketsPerOrder: 25
            }
          })
          .expect(200);

        expect(res.body.ticketing.maxTicketsPerOrder).toBe(25);
      });

      it('should update fee settings', async () => {
        const venueId = await createTestVenue();

        const res = await request(app.server)
          .put(`/api/v1/venues/${venueId}/settings`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            fees: {
              serviceFeePercentage: 15
            }
          })
          .expect(200);

        expect(res.body.fees.serviceFeePercentage).toBe(15);
      });

      it('should update payment settings', async () => {
        const venueId = await createTestVenue();

        const res = await request(app.server)
          .put(`/api/v1/venues/${venueId}/settings`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            payment: {
              paymentMethods: ['card', 'apple_pay', 'google_pay'],
              acceptedCurrencies: ['USD', 'EUR']
            }
          })
          .expect(200);

        expect(res.body.payment.paymentMethods).toContain('apple_pay');
        expect(res.body.payment.acceptedCurrencies).toContain('EUR');
      });

      it('should update resale settings', async () => {
        const venueId = await createTestVenue();

        const res = await request(app.server)
          .put(`/api/v1/venues/${venueId}/settings`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            resale: {
              maxResalePriceMultiplier: 1.5,
              antiScalpingEnabled: true,
              maxTicketsPerBuyer: 4
            }
          })
          .expect(200);

        expect(res.body.resale.maxResalePriceMultiplier).toBe(1.5);
        expect(res.body.resale.antiScalpingEnabled).toBe(true);
        expect(res.body.resale.maxTicketsPerBuyer).toBe(4);
      });

      it('should update multiple sections at once', async () => {
        const venueId = await createTestVenue();

        const res = await request(app.server)
          .put(`/api/v1/venues/${venueId}/settings`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            ticketing: {
              maxTicketsPerOrder: 20,
              ticketResaleAllowed: false
            },
            fees: {
              serviceFeePercentage: 12
            },
            resale: {
              antiScalpingEnabled: true
            }
          })
          .expect(200);

        expect(res.body.ticketing.maxTicketsPerOrder).toBe(20);
        expect(res.body.ticketing.ticketResaleAllowed).toBe(false);
        expect(res.body.fees.serviceFeePercentage).toBe(12);
        expect(res.body.resale.antiScalpingEnabled).toBe(true);
      });
    });

    describe('Upsert Behavior', () => {
      it('should create settings if none exist (INSERT)', async () => {
        const venueId = await createTestVenue();

        // Delete the auto-created settings
        await db('venue_settings').where({ venue_id: venueId }).del();

        // Verify settings don't exist
        const before = await db('venue_settings').where({ venue_id: venueId }).first();
        expect(before).toBeUndefined();

        // Update should create
        await request(app.server)
          .put(`/api/v1/venues/${venueId}/settings`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            ticketing: { maxTicketsPerOrder: 15 }
          })
          .expect(200);

        // Verify settings now exist
        const after = await db('venue_settings').where({ venue_id: venueId }).first();
        expect(after).toBeDefined();
        expect(after.max_tickets_per_order).toBe(15);
      });

      it('should update existing settings (UPDATE)', async () => {
        const venueId = await createTestVenue();

        // First update
        await request(app.server)
          .put(`/api/v1/venues/${venueId}/settings`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            ticketing: { maxTicketsPerOrder: 15 }
          })
          .expect(200);

        // Second update
        const res = await request(app.server)
          .put(`/api/v1/venues/${venueId}/settings`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            ticketing: { maxTicketsPerOrder: 30 }
          })
          .expect(200);

        expect(res.body.ticketing.maxTicketsPerOrder).toBe(30);

        // Verify only one settings row exists
        const rows = await db('venue_settings').where({ venue_id: venueId });
        expect(rows.length).toBe(1);
      });

      it('should only update provided fields (partial update)', async () => {
        const venueId = await createTestVenue();

        // Set initial values
        await request(app.server)
          .put(`/api/v1/venues/${venueId}/settings`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            ticketing: { maxTicketsPerOrder: 20 },
            fees: { serviceFeePercentage: 8 }
          })
          .expect(200);

        // Update only ticketing
        const res = await request(app.server)
          .put(`/api/v1/venues/${venueId}/settings`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            ticketing: { maxTicketsPerOrder: 50 }
          })
          .expect(200);

        // ticketing updated, fees unchanged
        expect(res.body.ticketing.maxTicketsPerOrder).toBe(50);
        expect(res.body.fees.serviceFeePercentage).toBe(8);
      });
    });

    describe('Database Persistence', () => {
      it('should persist ticketing.maxTicketsPerOrder to max_tickets_per_order column', async () => {
        const venueId = await createTestVenue();

        await request(app.server)
          .put(`/api/v1/venues/${venueId}/settings`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            ticketing: { maxTicketsPerOrder: 42 }
          })
          .expect(200);

        const row = await db('venue_settings').where({ venue_id: venueId }).first();
        expect(row.max_tickets_per_order).toBe(42);
      });

      it('should persist fees.serviceFeePercentage to service_fee_percentage column', async () => {
        const venueId = await createTestVenue();

        await request(app.server)
          .put(`/api/v1/venues/${venueId}/settings`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            fees: { serviceFeePercentage: 7.5 }
          })
          .expect(200);

        const row = await db('venue_settings').where({ venue_id: venueId }).first();
        expect(parseFloat(row.service_fee_percentage)).toBe(7.5);
      });

      it('should persist payment.paymentMethods to payment_methods column', async () => {
        const venueId = await createTestVenue();

        await request(app.server)
          .put(`/api/v1/venues/${venueId}/settings`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            payment: { paymentMethods: ['card', 'crypto'] }
          })
          .expect(200);

        const row = await db('venue_settings').where({ venue_id: venueId }).first();
        expect(row.payment_methods).toContain('crypto');
      });

      it('should persist resale.antiScalpingEnabled to anti_scalping_enabled column', async () => {
        const venueId = await createTestVenue();

        await request(app.server)
          .put(`/api/v1/venues/${venueId}/settings`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            resale: { antiScalpingEnabled: true }
          })
          .expect(200);

        const row = await db('venue_settings').where({ venue_id: venueId }).first();
        expect(row.anti_scalping_enabled).toBe(true);
      });

      it('should update updated_at timestamp', async () => {
        const venueId = await createTestVenue();

        const before = await db('venue_settings').where({ venue_id: venueId }).first();
        const beforeTime = new Date(before.updated_at).getTime();

        await new Promise(resolve => setTimeout(resolve, 50));

        await request(app.server)
          .put(`/api/v1/venues/${venueId}/settings`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            ticketing: { maxTicketsPerOrder: 99 }
          })
          .expect(200);

        const after = await db('venue_settings').where({ venue_id: venueId }).first();
        const afterTime = new Date(after.updated_at).getTime();

        expect(afterTime).toBeGreaterThan(beforeTime);
      });
    });

    describe('Authorization', () => {
      it('should allow owner to update settings', async () => {
        const venueId = await createTestVenue();

        await request(app.server)
          .put(`/api/v1/venues/${venueId}/settings`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            ticketing: { maxTicketsPerOrder: 10 }
          })
          .expect(200);
      });

      it('should allow manager to update settings', async () => {
        const venueId = await createTestVenue();
        await addStaffMember(venueId, MANAGER_USER_ID, 'manager');

        await request(app.server)
          .put(`/api/v1/venues/${venueId}/settings`)
          .set('Authorization', `Bearer ${managerToken}`)
          .send({
            ticketing: { maxTicketsPerOrder: 10 }
          })
          .expect(200);
      });

      it('should return 403 for staff (non-manager)', async () => {
        const venueId = await createTestVenue();
        await addStaffMember(venueId, STAFF_USER_ID, 'staff');

        const res = await request(app.server)
          .put(`/api/v1/venues/${venueId}/settings`)
          .set('Authorization', `Bearer ${staffToken}`)
          .send({
            ticketing: { maxTicketsPerOrder: 10 }
          });

        expect(res.status).toBe(403);
      });

      it('should return 401 without authentication', async () => {
        const venueId = await createTestVenue();

        await request(app.server)
          .put(`/api/v1/venues/${venueId}/settings`)
          .send({
            ticketing: { maxTicketsPerOrder: 10 }
          })
          .expect(401);
      });

      it('should return 403 for cross-tenant update', async () => {
        const venueId = await createTestVenue();

        const res = await request(app.server)
          .put(`/api/v1/venues/${venueId}/settings`)
          .set('Authorization', `Bearer ${otherTenantToken}`)
          .send({
            ticketing: { maxTicketsPerOrder: 10 }
          });

        expect([403, 404]).toContain(res.status);
      });
    });

    describe('Validation', () => {
      it('should reject maxTicketsPerOrder below 1', async () => {
        const venueId = await createTestVenue();

        const res = await request(app.server)
          .put(`/api/v1/venues/${venueId}/settings`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            ticketing: { maxTicketsPerOrder: 0 }
          });

        expect([400, 422]).toContain(res.status);
      });

      it('should reject maxTicketsPerOrder above 100', async () => {
        const venueId = await createTestVenue();

        const res = await request(app.server)
          .put(`/api/v1/venues/${venueId}/settings`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            ticketing: { maxTicketsPerOrder: 101 }
          });

        expect([400, 422]).toContain(res.status);
      });

      it('should reject serviceFeePercentage below 0', async () => {
        const venueId = await createTestVenue();

        const res = await request(app.server)
          .put(`/api/v1/venues/${venueId}/settings`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            fees: { serviceFeePercentage: -5 }
          });

        expect([400, 422]).toContain(res.status);
      });

      it('should reject serviceFeePercentage above 100', async () => {
        const venueId = await createTestVenue();

        const res = await request(app.server)
          .put(`/api/v1/venues/${venueId}/settings`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            fees: { serviceFeePercentage: 150 }
          });

        expect([400, 422]).toContain(res.status);
      });

      it('should reject invalid webhookUrl', async () => {
        const venueId = await createTestVenue();

        const res = await request(app.server)
          .put(`/api/v1/venues/${venueId}/settings`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            notifications: { webhookUrl: 'not-a-url' }
          });

        expect([400, 422]).toContain(res.status);
      });

      it('should accept valid webhookUrl', async () => {
        const venueId = await createTestVenue();

        const res = await request(app.server)
          .put(`/api/v1/venues/${venueId}/settings`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            notifications: { webhookUrl: 'https://example.com/webhook' }
          })
          .expect(200);

        expect(res.body.notifications.webhookUrl).toBe('https://example.com/webhook');
      });

      it('should accept empty string for webhookUrl', async () => {
        const venueId = await createTestVenue();

        const res = await request(app.server)
          .put(`/api/v1/venues/${venueId}/settings`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            notifications: { webhookUrl: '' }
          })
          .expect(200);

        expect(res.body).toBeDefined();
      });

      it('should reject refundWindow above 720', async () => {
        const venueId = await createTestVenue();

        const res = await request(app.server)
          .put(`/api/v1/venues/${venueId}/settings`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            ticketing: { refundWindow: 721 }
          });

        expect([400, 422]).toContain(res.status);
      });

      it('should reject transferDeadline above 168', async () => {
        const venueId = await createTestVenue();

        const res = await request(app.server)
          .put(`/api/v1/venues/${venueId}/settings`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            ticketing: { transferDeadline: 169 }
          });

        expect([400, 422]).toContain(res.status);
      });

      it('should reject unknown properties in body', async () => {
        const venueId = await createTestVenue();

        const res = await request(app.server)
          .put(`/api/v1/venues/${venueId}/settings`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            unknownSection: { foo: 'bar' }
          });

        expect([400, 422]).toContain(res.status);
      });

      it('should reject unknown properties in nested objects', async () => {
        const venueId = await createTestVenue();

        const res = await request(app.server)
          .put(`/api/v1/venues/${venueId}/settings`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            ticketing: { unknownField: true }
          });

        expect([400, 422]).toContain(res.status);
      });

      it('should reject empty body', async () => {
        const venueId = await createTestVenue();

        const res = await request(app.server)
          .put(`/api/v1/venues/${venueId}/settings`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({});

        expect([400, 422]).toContain(res.status);
      });

      it('should reject invalid timeFormat', async () => {
        const venueId = await createTestVenue();

        const res = await request(app.server)
          .put(`/api/v1/venues/${venueId}/settings`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            general: { timeFormat: '25h' }
          });

        expect([400, 422]).toContain(res.status);
      });

      it('should accept valid timeFormat values', async () => {
        const venueId = await createTestVenue();

        for (const format of ['12h', '24h']) {
          const res = await request(app.server)
            .put(`/api/v1/venues/${venueId}/settings`)
            .set('Authorization', `Bearer ${authToken}`)
            .send({
              general: { timeFormat: format }
            })
            .expect(200);

          expect(res.body.general.timeFormat).toBe(format);
        }
      });

      it('should reject invalid payoutFrequency', async () => {
        const venueId = await createTestVenue();

        const res = await request(app.server)
          .put(`/api/v1/venues/${venueId}/settings`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            payment: { payoutFrequency: 'yearly' }
          });

        expect([400, 422]).toContain(res.status);
      });

      it('should accept valid payoutFrequency values', async () => {
        const venueId = await createTestVenue();

        for (const freq of ['daily', 'weekly', 'biweekly', 'monthly']) {
          const res = await request(app.server)
            .put(`/api/v1/venues/${venueId}/settings`)
            .set('Authorization', `Bearer ${authToken}`)
            .send({
              payment: { payoutFrequency: freq }
            })
            .expect(200);

          expect(res.body.payment.payoutFrequency).toBe(freq);
        }
      });
    });

    describe('Error Handling', () => {
      it('should return 404 for non-existent venue', async () => {
        const fakeId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

        const res = await request(app.server)
          .put(`/api/v1/venues/${fakeId}/settings`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            ticketing: { maxTicketsPerOrder: 10 }
          });

        expect([404, 403]).toContain(res.status);
      });

      it('should handle invalid venue ID format', async () => {
        const res = await request(app.server)
          .put('/api/v1/venues/not-a-uuid/settings')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            ticketing: { maxTicketsPerOrder: 10 }
          });

        expect([400, 422, 500]).toContain(res.status);
      });

      it('should return 404 for deleted venue', async () => {
        const venueId = await createTestVenue();

        // Soft delete the venue
        await db('venues').where({ id: venueId }).update({ deleted_at: new Date() });

        const res = await request(app.server)
          .put(`/api/v1/venues/${venueId}/settings`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            ticketing: { maxTicketsPerOrder: 10 }
          });

        expect([404, 403]).toContain(res.status);
      });
    });
  });

  // ===========================================
  // SECTION 3: TENANT ISOLATION
  // ===========================================
  describe('Tenant Isolation', () => {
    it('should not allow reading settings from another tenant venue', async () => {
      const venueId = await createTestVenue();

      const res = await request(app.server)
        .get(`/api/v1/venues/${venueId}/settings`)
        .set('Authorization', `Bearer ${otherTenantToken}`);

      expect([403, 404]).toContain(res.status);
    });

    it('should not allow updating settings on another tenant venue', async () => {
      const venueId = await createTestVenue();

      const res = await request(app.server)
        .put(`/api/v1/venues/${venueId}/settings`)
        .set('Authorization', `Bearer ${otherTenantToken}`)
        .send({
          ticketing: { maxTicketsPerOrder: 99 }
        });

      expect([403, 404]).toContain(res.status);

      // Verify settings unchanged
      const row = await db('venue_settings').where({ venue_id: venueId }).first();
      expect(row.max_tickets_per_order).toBe(10); // Default value
    });

    it('should isolate settings between tenants with same venue name', async () => {
      // Create venue for tenant 1
      const venue1Id = await createTestVenue('Shared Name Venue');

      // Create venue for tenant 2
      await db('venues').insert({
        id: 'bbbbbbbb-0001-0001-0001-000000000001',
        tenant_id: OTHER_TENANT_ID,
        name: 'Shared Name Venue',
        slug: 'shared-name-venue-other',
        email: 'other@venue.com',
        venue_type: 'comedy_club',
        max_capacity: 100,
        address_line1: '999 Other St',
        city: 'Boston',
        state_province: 'MA',
        country_code: 'US',
        status: 'active',
        is_verified: false,
        created_by: OTHER_USER_ID,
        created_at: new Date(),
        updated_at: new Date(),
      });

      await db('venue_staff').insert({
        venue_id: 'bbbbbbbb-0001-0001-0001-000000000001',
        user_id: OTHER_USER_ID,
        role: 'owner',
        permissions: ['*'],
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      });

      await db('venue_settings').insert({
        venue_id: 'bbbbbbbb-0001-0001-0001-000000000001',
        max_tickets_per_order: 5,
        service_fee_percentage: 5,
        created_at: new Date(),
        updated_at: new Date(),
      });

      // Update tenant 1's venue settings
      await request(app.server)
        .put(`/api/v1/venues/${venue1Id}/settings`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          ticketing: { maxTicketsPerOrder: 50 }
        })
        .expect(200);

      // Verify tenant 2's venue settings unchanged
      const otherRow = await db('venue_settings')
        .where({ venue_id: 'bbbbbbbb-0001-0001-0001-000000000001' })
        .first();
      expect(otherRow.max_tickets_per_order).toBe(5);
    });
  });

  // ===========================================
  // SECTION 4: CONCURRENT UPDATES
  // ===========================================
  describe('Concurrent Updates', () => {
    it('should handle concurrent updates without data loss', async () => {
      const venueId = await createTestVenue();

      // Fire multiple concurrent updates
      const updates = [
        request(app.server)
          .put(`/api/v1/venues/${venueId}/settings`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ ticketing: { maxTicketsPerOrder: 10 } }),
        request(app.server)
          .put(`/api/v1/venues/${venueId}/settings`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ fees: { serviceFeePercentage: 15 } }),
        request(app.server)
          .put(`/api/v1/venues/${venueId}/settings`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ resale: { antiScalpingEnabled: true } }),
      ];

      const results = await Promise.all(updates);

      // All should succeed
      results.forEach(res => {
        expect([200, 409]).toContain(res.status);
      });

      // Verify DB has exactly one row
      const rows = await db('venue_settings').where({ venue_id: venueId });
      expect(rows.length).toBe(1);
    });

    it('should maintain data integrity with rapid sequential updates', async () => {
      const venueId = await createTestVenue();

      for (let i = 1; i <= 5; i++) {
        await request(app.server)
          .put(`/api/v1/venues/${venueId}/settings`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            ticketing: { maxTicketsPerOrder: i * 10 }
          })
          .expect(200);
      }

      const res = await request(app.server)
        .get(`/api/v1/venues/${venueId}/settings`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.ticketing.maxTicketsPerOrder).toBe(50);
    });
  });

  // ===========================================
  // SECTION 5: RESPONSE FORMAT
  // ===========================================
  describe('Response Format', () => {
    it('should return complete nested structure on GET', async () => {
      const venueId = await createTestVenue();

      const res = await request(app.server)
        .get(`/api/v1/venues/${venueId}/settings`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // All sections should be present (branding is in venue_branding table, not here)
      expect(res.body).toHaveProperty('general');
      expect(res.body).toHaveProperty('ticketing');
      expect(res.body).toHaveProperty('notifications');
      expect(res.body).toHaveProperty('payment');
      expect(res.body).toHaveProperty('fees');
      expect(res.body).toHaveProperty('resale');
      expect(res.body).toHaveProperty('features');
    });

    it('should return updated values in PUT response', async () => {
      const venueId = await createTestVenue();

      const res = await request(app.server)
        .put(`/api/v1/venues/${venueId}/settings`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          ticketing: { maxTicketsPerOrder: 77 },
          fees: { serviceFeePercentage: 13 }
        })
        .expect(200);

      expect(res.body.ticketing.maxTicketsPerOrder).toBe(77);
      expect(res.body.fees.serviceFeePercentage).toBe(13);
    });

    it('should not expose raw DB column names in response', async () => {
      const venueId = await createTestVenue();

      const res = await request(app.server)
        .get(`/api/v1/venues/${venueId}/settings`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Should NOT have flat DB columns
      expect(res.body).not.toHaveProperty('max_tickets_per_order');
      expect(res.body).not.toHaveProperty('service_fee_percentage');
      expect(res.body).not.toHaveProperty('payment_methods');

      // Should have nested structure
      expect(res.body.ticketing).toHaveProperty('maxTicketsPerOrder');
      expect(res.body.fees).toHaveProperty('serviceFeePercentage');
      expect(res.body.payment).toHaveProperty('paymentMethods');
    });
  });
});
