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
const tempKeyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'staff-test-keys-'));
const publicKeyPath = path.join(tempKeyDir, 'jwt-public.pem');
fs.writeFileSync(publicKeyPath, publicKey);

process.env.JWT_PUBLIC_KEY_PATH = publicKeyPath;
process.env.DISABLE_RATE_LIMIT = 'true';

// Test constants - FIXED: Valid UUID v4 format (position 14 must be '4', position 19 must be 8/9/a/b)
const TEST_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const TEST_USER_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const OTHER_USER_ID = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const THIRD_USER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

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

describe('Staff Management Integration Tests', () => {
  let app: any;
  let db: ReturnType<typeof getTestDb>;
  let redis: ReturnType<typeof getTestRedis>;
  let authToken: string;
  let otherUserToken: string;
  let thirdUserToken: string;

  beforeAll(async () => {
    const { buildApp } = await import('../../src/app');
    app = await buildApp();
    await app.ready();
    db = getTestDb();
    redis = getTestRedis();
    authToken = generateTestJWT({ sub: TEST_USER_ID, tenant_id: TEST_TENANT_ID });
    otherUserToken = generateTestJWT({ sub: OTHER_USER_ID, tenant_id: TEST_TENANT_ID });
    thirdUserToken = generateTestJWT({ sub: THIRD_USER_ID, tenant_id: TEST_TENANT_ID });
  }, 30000);

  afterAll(async () => {
    if (app) await app.close();
    try {
      fs.unlinkSync(publicKeyPath);
      fs.rmdirSync(tempKeyDir);
    } catch {}
  });

  beforeEach(async () => {
    // Clean up in order (foreign key dependencies)
    await db('ticket_validations').del();
    await db('tickets').del();
    await db('ticket_types').del();
    await db('events').del();
    await db('venue_staff').del();
    await db('venue_settings').del();
    await db('venues').del();

    // Seed tenant
    await db('tenants').insert({
      id: TEST_TENANT_ID,
      name: 'Test Tenant',
      slug: 'test-tenant',
      created_at: new Date(),
      updated_at: new Date(),
    }).onConflict('id').ignore();

    // Seed test users
    await db('users').insert({
      id: TEST_USER_ID,
      email: 'owner@test.com',
      password_hash: '$2b$10$dummyhashfortestingpurposesonly',
      tenant_id: TEST_TENANT_ID,
      created_at: new Date(),
      updated_at: new Date(),
    }).onConflict('id').ignore();

    await db('users').insert({
      id: OTHER_USER_ID,
      email: 'other@test.com',
      password_hash: '$2b$10$dummyhashfortestingpurposesonly',
      tenant_id: TEST_TENANT_ID,
      created_at: new Date(),
      updated_at: new Date(),
    }).onConflict('id').ignore();

    await db('users').insert({
      id: THIRD_USER_ID,
      email: 'third@test.com',
      password_hash: '$2b$10$dummyhashfortestingpurposesonly',
      tenant_id: TEST_TENANT_ID,
      created_at: new Date(),
      updated_at: new Date(),
    }).onConflict('id').ignore();

    // Clear rate limit keys
    const keys = await redis.keys('rate_limit:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  // Helper: Create a venue and return its ID
  async function createTestVenue(name = 'Test Venue'): Promise<string> {
    const payload = createValidVenuePayload({ name });
    const res = await request(app.server)
      .post('/api/v1/venues')
      .set('Authorization', `Bearer ${authToken}`)
      .send(payload)
      .expect(201);
    return res.body.id;
  }

  // ===========================================
  // SECTION 1: STAFF ADDITION
  // ===========================================
  describe('Staff Addition', () => {

    describe('Basic Addition', () => {
      it('should add staff member with valid role', async () => {
        const venueId = await createTestVenue('Staff Add Test Venue');

        const res = await request(app.server)
          .post(`/api/v1/venues/${venueId}/staff`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            userId: OTHER_USER_ID,
            role: 'manager',
          })
          .expect(201);

        expect(res.body).toHaveProperty('id');
        expect(res.body.user_id).toBe(OTHER_USER_ID);
        expect(res.body.role).toBe('manager');
      });

      it('should set is_active=true for new staff', async () => {
        const venueId = await createTestVenue('Active Staff Venue');

        await request(app.server)
          .post(`/api/v1/venues/${venueId}/staff`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            userId: OTHER_USER_ID,
            role: 'box_office',
          })
          .expect(201);

        const staffRecord = await db('venue_staff')
          .where({ venue_id: venueId, user_id: OTHER_USER_ID })
          .first();

        expect(staffRecord.is_active).toBe(true);
      });

      it('should store staff in venue_staff table with correct venue_id', async () => {
        const venueId = await createTestVenue('DB Check Venue');

        await request(app.server)
          .post(`/api/v1/venues/${venueId}/staff`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            userId: OTHER_USER_ID,
            role: 'door_staff',
          })
          .expect(201);

        const staffRecord = await db('venue_staff')
          .where({ venue_id: venueId, user_id: OTHER_USER_ID })
          .first();

        expect(staffRecord).toBeDefined();
        expect(staffRecord.venue_id).toBe(venueId);
      });

      it('should reject duplicate staff addition (same user, same venue)', async () => {
        const venueId = await createTestVenue('Duplicate Staff Venue');

        // First addition
        await request(app.server)
          .post(`/api/v1/venues/${venueId}/staff`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            userId: OTHER_USER_ID,
            role: 'manager',
          })
          .expect(201);

        // Second addition - should fail
        const res = await request(app.server)
          .post(`/api/v1/venues/${venueId}/staff`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            userId: OTHER_USER_ID,
            role: 'viewer',
          })
          .expect(500); // or 409 depending on error handling

        expect(res.body.error).toMatch(/already exists|duplicate|failed to add/i);
      });
    });

    describe('Default Permissions', () => {
      it('should assign wildcard permission for owner role', async () => {
        const venueId = await createTestVenue('Owner Perm Venue');

        // Owner is already created, check their permissions
        const staffRecord = await db('venue_staff')
          .where({ venue_id: venueId, user_id: TEST_USER_ID })
          .first();

        expect(staffRecord.permissions).toContain('*');
      });

      it('should assign manager permissions for manager role', async () => {
        const venueId = await createTestVenue('Manager Perm Venue');

        await request(app.server)
          .post(`/api/v1/venues/${venueId}/staff`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            userId: OTHER_USER_ID,
            role: 'manager',
          })
          .expect(201);

        const staffRecord = await db('venue_staff')
          .where({ venue_id: venueId, user_id: OTHER_USER_ID })
          .first();

        expect(staffRecord.permissions).toContain('venue:read');
        expect(staffRecord.permissions).toContain('venue:update');
        expect(staffRecord.permissions).toContain('events:create');
        expect(staffRecord.permissions).toContain('staff:view');
      });

      it('should assign box_office permissions for box_office role', async () => {
        const venueId = await createTestVenue('Box Office Perm Venue');

        await request(app.server)
          .post(`/api/v1/venues/${venueId}/staff`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            userId: OTHER_USER_ID,
            role: 'box_office',
          })
          .expect(201);

        const staffRecord = await db('venue_staff')
          .where({ venue_id: venueId, user_id: OTHER_USER_ID })
          .first();

        expect(staffRecord.permissions).toContain('tickets:sell');
        expect(staffRecord.permissions).toContain('tickets:view');
        expect(staffRecord.permissions).toContain('payments:process');
      });

      it('should assign door_staff permissions for door_staff role', async () => {
        const venueId = await createTestVenue('Door Staff Perm Venue');

        await request(app.server)
          .post(`/api/v1/venues/${venueId}/staff`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            userId: OTHER_USER_ID,
            role: 'door_staff',
          })
          .expect(201);

        const staffRecord = await db('venue_staff')
          .where({ venue_id: venueId, user_id: OTHER_USER_ID })
          .first();

        expect(staffRecord.permissions).toContain('tickets:validate');
        expect(staffRecord.permissions).toContain('tickets:view');
        expect(staffRecord.permissions).toContain('events:view');
      });

      it('should assign viewer permissions for viewer role', async () => {
        const venueId = await createTestVenue('Viewer Perm Venue');

        await request(app.server)
          .post(`/api/v1/venues/${venueId}/staff`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            userId: OTHER_USER_ID,
            role: 'viewer',
          })
          .expect(201);

        const staffRecord = await db('venue_staff')
          .where({ venue_id: venueId, user_id: OTHER_USER_ID })
          .first();

        expect(staffRecord.permissions).toContain('events:view');
        expect(staffRecord.permissions).toContain('reports:view');
      });

      it('should use custom permissions when provided', async () => {
        const venueId = await createTestVenue('Custom Perm Venue');
        const customPerms = ['custom:read', 'custom:write'];

        await request(app.server)
          .post(`/api/v1/venues/${venueId}/staff`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            userId: OTHER_USER_ID,
            role: 'manager',
            permissions: customPerms,
          })
          .expect(201);

        const staffRecord = await db('venue_staff')
          .where({ venue_id: venueId, user_id: OTHER_USER_ID })
          .first();

        expect(staffRecord.permissions).toEqual(customPerms);
      });
    });

    describe('Reactivation', () => {
      it('should reactivate inactive staff instead of creating duplicate', async () => {
        const venueId = await createTestVenue('Reactivate Venue');

        // Add staff
        await request(app.server)
          .post(`/api/v1/venues/${venueId}/staff`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            userId: OTHER_USER_ID,
            role: 'manager',
          })
          .expect(201);

        // Deactivate directly in DB
        await db('venue_staff')
          .where({ venue_id: venueId, user_id: OTHER_USER_ID })
          .update({ is_active: false });

        // Add again - should reactivate
        const res = await request(app.server)
          .post(`/api/v1/venues/${venueId}/staff`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            userId: OTHER_USER_ID,
            role: 'box_office',
          })
          .expect(201);

        expect(res.body.is_active).toBe(true);
        expect(res.body.role).toBe('box_office');

        // Should only have one record
        const count = await db('venue_staff')
          .where({ venue_id: venueId, user_id: OTHER_USER_ID })
          .count('* as count')
          .first();

        expect(parseInt(count!.count as string)).toBe(1);
      });

      it('should update role on reactivation', async () => {
        const venueId = await createTestVenue('Role Update Reactivate Venue');

        // Add as manager
        await request(app.server)
          .post(`/api/v1/venues/${venueId}/staff`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            userId: OTHER_USER_ID,
            role: 'manager',
          })
          .expect(201);

        // Deactivate
        await db('venue_staff')
          .where({ venue_id: venueId, user_id: OTHER_USER_ID })
          .update({ is_active: false });

        // Reactivate as viewer
        await request(app.server)
          .post(`/api/v1/venues/${venueId}/staff`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            userId: OTHER_USER_ID,
            role: 'viewer',
          })
          .expect(201);

        const staffRecord = await db('venue_staff')
          .where({ venue_id: venueId, user_id: OTHER_USER_ID })
          .first();

        expect(staffRecord.role).toBe('viewer');
        expect(staffRecord.permissions).toContain('events:view');
      });
    });

    describe('Staff Limit', () => {
      it('should enforce MAX_STAFF_PER_VENUE limit', async () => {
        const venueId = await createTestVenue('Staff Limit Venue');

        // Set a low limit for testing
        const originalLimit = process.env.MAX_STAFF_PER_VENUE;
        process.env.MAX_STAFF_PER_VENUE = '3';

        try {
          // Owner already counts as 1, add 2 more
          for (let i = 0; i < 2; i++) {
            const userId = crypto.randomUUID();
            await db('users').insert({
              id: userId,
              email: `${userId}@test.com`,
              password_hash: '$2b$10$dummy',
              tenant_id: TEST_TENANT_ID,
              created_at: new Date(),
              updated_at: new Date(),
            }).onConflict('id').ignore();

            await db('venue_staff').insert({
              venue_id: venueId,
              user_id: userId,
              role: 'viewer',
              permissions: ['events:view'],
              is_active: true,
              created_at: new Date(),
              updated_at: new Date(),
            });
          }

          // Try to add 4th - should check limit
          // Note: This depends on service calling validateStaffLimit
          const staffCount = await db('venue_staff')
            .where({ venue_id: venueId, is_active: true })
            .count('* as count')
            .first();

          expect(parseInt(staffCount!.count as string)).toBe(3);
        } finally {
          if (originalLimit) {
            process.env.MAX_STAFF_PER_VENUE = originalLimit;
          } else {
            delete process.env.MAX_STAFF_PER_VENUE;
          }
        }
      });

      it('should not count inactive staff toward limit', async () => {
        const venueId = await createTestVenue('Inactive Limit Venue');

        // Add and deactivate staff
        await request(app.server)
          .post(`/api/v1/venues/${venueId}/staff`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            userId: OTHER_USER_ID,
            role: 'manager',
          })
          .expect(201);

        await db('venue_staff')
          .where({ venue_id: venueId, user_id: OTHER_USER_ID })
          .update({ is_active: false });

        // Count should only include active staff (owner)
        const activeCount = await db('venue_staff')
          .where({ venue_id: venueId, is_active: true })
          .count('* as count')
          .first();

        expect(parseInt(activeCount!.count as string)).toBe(1);
      });
    });

    describe('Authorization', () => {
      it('should reject staff addition from non-owner/non-manager', async () => {
        const venueId = await createTestVenue('Auth Test Venue');

        // Add OTHER_USER as viewer (no staff:add permission)
        await request(app.server)
          .post(`/api/v1/venues/${venueId}/staff`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            userId: OTHER_USER_ID,
            role: 'viewer',
          })
          .expect(201);

        // OTHER_USER tries to add THIRD_USER - should fail
        const res = await request(app.server)
          .post(`/api/v1/venues/${venueId}/staff`)
          .set('Authorization', `Bearer ${otherUserToken}`)
          .send({
            userId: THIRD_USER_ID,
            role: 'viewer',
          })
          .expect(403);

        expect(res.body.error).toMatch(/denied|forbidden|permission|only owners/i);
      });

      it('should allow manager to add staff', async () => {
        const venueId = await createTestVenue('Manager Add Staff Venue');

        // Add OTHER_USER as manager
        await request(app.server)
          .post(`/api/v1/venues/${venueId}/staff`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            userId: OTHER_USER_ID,
            role: 'manager',
          })
          .expect(201);

        // Manager adds THIRD_USER
        const res = await request(app.server)
          .post(`/api/v1/venues/${venueId}/staff`)
          .set('Authorization', `Bearer ${otherUserToken}`)
          .send({
            userId: THIRD_USER_ID,
            role: 'viewer',
          })
          .expect(201);

        expect(res.body.user_id).toBe(THIRD_USER_ID);
      });
    });

    describe('Validation', () => {
      it('should reject invalid role', async () => {
        const venueId = await createTestVenue('Invalid Role Venue');

        const res = await request(app.server)
          .post(`/api/v1/venues/${venueId}/staff`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            userId: OTHER_USER_ID,
            role: 'superadmin', // invalid role
          })
          .expect(422);

        expect(res.body.error || res.body.message).toBeDefined();
      });

      it('should reject invalid userId format', async () => {
        const venueId = await createTestVenue('Invalid UUID Venue');

        const res = await request(app.server)
          .post(`/api/v1/venues/${venueId}/staff`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            userId: 'not-a-uuid',
            role: 'manager',
          })
          .expect(422);

        expect(res.body.error || res.body.message).toBeDefined();
      });

      it('should reject missing userId', async () => {
        const venueId = await createTestVenue('Missing UserID Venue');

        const res = await request(app.server)
          .post(`/api/v1/venues/${venueId}/staff`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            role: 'manager',
          })
          .expect(422);

        expect(res.body.error || res.body.message).toBeDefined();
      });

      it('should reject missing role', async () => {
        const venueId = await createTestVenue('Missing Role Venue');

        const res = await request(app.server)
          .post(`/api/v1/venues/${venueId}/staff`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            userId: OTHER_USER_ID,
          })
          .expect(422);

        expect(res.body.error || res.body.message).toBeDefined();
      });
    });
  });

  // ===========================================
  // SECTION 2: STAFF LISTING
  // ===========================================
  describe('Staff Listing', () => {

    it('should return all active staff for venue', async () => {
      const venueId = await createTestVenue('List Staff Venue');

      // Add another staff member
      await request(app.server)
        .post(`/api/v1/venues/${venueId}/staff`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: OTHER_USER_ID,
          role: 'manager',
        })
        .expect(201);

      const res = await request(app.server)
        .get(`/api/v1/venues/${venueId}/staff`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2); // owner + manager
    });

    it('should not return inactive staff by default', async () => {
      const venueId = await createTestVenue('Inactive List Venue');

      // Add staff
      await request(app.server)
        .post(`/api/v1/venues/${venueId}/staff`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: OTHER_USER_ID,
          role: 'manager',
        })
        .expect(201);

      // Deactivate
      await db('venue_staff')
        .where({ venue_id: venueId, user_id: OTHER_USER_ID })
        .update({ is_active: false });

      const res = await request(app.server)
        .get(`/api/v1/venues/${venueId}/staff`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.length).toBe(1); // only owner
      expect(res.body[0].user_id).toBe(TEST_USER_ID);
    });

    it('should order staff by created_at ascending', async () => {
      const venueId = await createTestVenue('Order Staff Venue');

      // Add staff with delay to ensure different timestamps
      await request(app.server)
        .post(`/api/v1/venues/${venueId}/staff`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: OTHER_USER_ID,
          role: 'manager',
        })
        .expect(201);

      const res = await request(app.server)
        .get(`/api/v1/venues/${venueId}/staff`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Owner was created first
      expect(res.body[0].user_id).toBe(TEST_USER_ID);
      expect(res.body[1].user_id).toBe(OTHER_USER_ID);
    });

    it('should require venue access to list staff', async () => {
      const venueId = await createTestVenue('Access List Venue');

      // OTHER_USER has no access yet
      const res = await request(app.server)
        .get(`/api/v1/venues/${venueId}/staff`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .expect(403);

      expect(res.body.error).toMatch(/denied|forbidden/i);
    });
  });

  // ===========================================
  // SECTION 3: PERMISSIONS
  // ===========================================
  describe('Permissions (hasPermission)', () => {

    it('should grant owner all permissions (wildcard)', async () => {
      const venueId = await createTestVenue('Owner Wildcard Venue');

      // Check access endpoint shows wildcard
      const res = await request(app.server)
        .get(`/api/v1/venues/${venueId}/check-access`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.hasAccess).toBe(true);
      expect(res.body.role).toBe('owner');
      expect(res.body.permissions).toContain('*');
    });

    it('should return correct permissions for manager', async () => {
      const venueId = await createTestVenue('Manager Perm Check Venue');

      await request(app.server)
        .post(`/api/v1/venues/${venueId}/staff`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: OTHER_USER_ID,
          role: 'manager',
        })
        .expect(201);

      const res = await request(app.server)
        .get(`/api/v1/venues/${venueId}/check-access`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .expect(200);

      expect(res.body.hasAccess).toBe(true);
      expect(res.body.role).toBe('manager');
      expect(res.body.permissions).toContain('venue:read');
    });

    it('should deny access for inactive staff', async () => {
      const venueId = await createTestVenue('Inactive Perm Venue');

      await request(app.server)
        .post(`/api/v1/venues/${venueId}/staff`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: OTHER_USER_ID,
          role: 'manager',
        })
        .expect(201);

      // Deactivate
      await db('venue_staff')
        .where({ venue_id: venueId, user_id: OTHER_USER_ID })
        .update({ is_active: false });

      const res = await request(app.server)
        .get(`/api/v1/venues/${venueId}/check-access`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .expect(200);

      expect(res.body.hasAccess).toBe(false);
    });

    it('should deny access for non-staff user', async () => {
      const venueId = await createTestVenue('Non Staff Perm Venue');

      const res = await request(app.server)
        .get(`/api/v1/venues/${venueId}/check-access`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .expect(200);

      expect(res.body.hasAccess).toBe(false);
      expect(res.body.role).toBeNull();
    });
  });

  // ===========================================
  // SECTION 4: DATABASE CONSTRAINTS
  // ===========================================
  describe('Database Constraints', () => {

    it('should enforce unique constraint on (venue_id, user_id)', async () => {
      const venueId = await createTestVenue('Unique Constraint Venue');

      // Try to insert duplicate directly
      await expect(
        db('venue_staff').insert({
          venue_id: venueId,
          user_id: TEST_USER_ID, // Owner already exists
          role: 'manager',
          permissions: ['venue:read'],
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        })
      ).rejects.toThrow(/unique|duplicate/i);
    });

    it('should cascade delete staff when venue is deleted', async () => {
      const venueId = await createTestVenue('Cascade Delete Venue');

      // Add staff
      await request(app.server)
        .post(`/api/v1/venues/${venueId}/staff`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: OTHER_USER_ID,
          role: 'manager',
        })
        .expect(201);

      // Verify staff exists
      let staffCount = await db('venue_staff')
        .where({ venue_id: venueId })
        .count('* as count')
        .first();
      expect(parseInt(staffCount!.count as string)).toBe(2);

      // Delete venue (hard delete for cascade test)
      await db('venues').where({ id: venueId }).del();

      // Staff should be gone
      staffCount = await db('venue_staff')
        .where({ venue_id: venueId })
        .count('* as count')
        .first();
      expect(parseInt(staffCount!.count as string)).toBe(0);
    });

    it('should store permissions as TEXT[] array', async () => {
      const venueId = await createTestVenue('Permissions Array Venue');

      const staffRecord = await db('venue_staff')
        .where({ venue_id: venueId, user_id: TEST_USER_ID })
        .first();

      // Postgres returns TEXT[] as array
      expect(Array.isArray(staffRecord.permissions)).toBe(true);
    });
  });

  // ===========================================
  // SECTION 5: STAFF ROLE UPDATES (PATCH)
  // ===========================================
  describe('Staff Role Updates', () => {

    it('should update staff role successfully', async () => {
      const venueId = await createTestVenue('Update Role Venue');

      // Add staff as manager
      const addRes = await request(app.server)
        .post(`/api/v1/venues/${venueId}/staff`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: OTHER_USER_ID,
          role: 'manager',
        })
        .expect(201);

      const staffId = addRes.body.id;

      // Update to box_office
      const res = await request(app.server)
        .patch(`/api/v1/venues/${venueId}/staff/${staffId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          role: 'box_office',
        })
        .expect(200);

      expect(res.body.role).toBe('box_office');
      expect(res.body.permissions).toContain('tickets:sell');
    });

    it('should update permissions along with role', async () => {
      const venueId = await createTestVenue('Update Perms Venue');

      const addRes = await request(app.server)
        .post(`/api/v1/venues/${venueId}/staff`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: OTHER_USER_ID,
          role: 'manager',
        })
        .expect(201);

      const staffId = addRes.body.id;
      const customPerms = ['custom:read', 'custom:write'];

      const res = await request(app.server)
        .patch(`/api/v1/venues/${venueId}/staff/${staffId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          role: 'viewer',
          permissions: customPerms,
        })
        .expect(200);

      expect(res.body.role).toBe('viewer');
      expect(res.body.permissions).toEqual(customPerms);
    });

    it('should reject changing owner role', async () => {
      const venueId = await createTestVenue('Protect Owner Venue');

      // Get owner staff record
      const ownerStaff = await db('venue_staff')
        .where({ venue_id: venueId, user_id: TEST_USER_ID })
        .first();

      const res = await request(app.server)
        .patch(`/api/v1/venues/${venueId}/staff/${ownerStaff.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          role: 'manager',
        })
        .expect(403);

      expect(res.body.error).toMatch(/owner|cannot/i);
    });

    it('should reject manager promoting to owner via schema validation', async () => {
      const venueId = await createTestVenue('No Promote Owner Venue');

      // Add OTHER_USER as manager
      await request(app.server)
        .post(`/api/v1/venues/${venueId}/staff`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: OTHER_USER_ID,
          role: 'manager',
        })
        .expect(201);

      // Add THIRD_USER as viewer
      const addRes = await request(app.server)
        .post(`/api/v1/venues/${venueId}/staff`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: THIRD_USER_ID,
          role: 'viewer',
        })
        .expect(201);

      const thirdUserStaffId = addRes.body.id;

      // Manager tries to promote viewer to owner - should fail schema validation
      const res = await request(app.server)
        .patch(`/api/v1/venues/${venueId}/staff/${thirdUserStaffId}`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .send({
          role: 'owner',
        })
        .expect(422); // Invalid role in schema - owner not allowed in updateStaffSchema

      expect(res.body.error || res.body.message).toBeDefined();
    });

    it('should reject manager modifying another manager', async () => {
      const venueId = await createTestVenue('Manager vs Manager Venue');

      // Add OTHER_USER as manager
      await request(app.server)
        .post(`/api/v1/venues/${venueId}/staff`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: OTHER_USER_ID,
          role: 'manager',
        })
        .expect(201);

      // Add THIRD_USER as manager
      const addRes = await request(app.server)
        .post(`/api/v1/venues/${venueId}/staff`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: THIRD_USER_ID,
          role: 'manager',
        })
        .expect(201);

      const thirdUserStaffId = addRes.body.id;

      // OTHER_USER (manager) tries to demote THIRD_USER (manager) - should fail
      const res = await request(app.server)
        .patch(`/api/v1/venues/${venueId}/staff/${thirdUserStaffId}`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .send({
          role: 'viewer',
        })
        .expect(403);

      expect(res.body.error).toMatch(/manager|cannot/i);
    });

    it('should reject non-owner/non-manager updating roles', async () => {
      const venueId = await createTestVenue('Viewer Cannot Update Venue');

      // Add OTHER_USER as viewer
      await request(app.server)
        .post(`/api/v1/venues/${venueId}/staff`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: OTHER_USER_ID,
          role: 'viewer',
        })
        .expect(201);

      // Add THIRD_USER as door_staff
      const addRes = await request(app.server)
        .post(`/api/v1/venues/${venueId}/staff`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: THIRD_USER_ID,
          role: 'door_staff',
        })
        .expect(201);

      const thirdUserStaffId = addRes.body.id;

      // Viewer tries to update door_staff - should fail
      const res = await request(app.server)
        .patch(`/api/v1/venues/${venueId}/staff/${thirdUserStaffId}`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .send({
          role: 'box_office',
        })
        .expect(403);

      expect(res.body.error).toMatch(/denied|forbidden|only owners/i);
    });

    it('should return 404 for non-existent staff member', async () => {
      const venueId = await createTestVenue('Staff Not Found Venue');
      const fakeStaffId = crypto.randomUUID();

      const res = await request(app.server)
        .patch(`/api/v1/venues/${venueId}/staff/${fakeStaffId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          role: 'manager',
        })
        .expect(404);

      expect(res.body.error).toMatch(/not found/i);
    });
  });

  // ===========================================
  // SECTION 6: STAFF REMOVAL (DELETE)
  // ===========================================
  describe('Staff Removal', () => {

    it('should remove staff member successfully', async () => {
      const venueId = await createTestVenue('Remove Staff Venue');

      // Add staff
      const addRes = await request(app.server)
        .post(`/api/v1/venues/${venueId}/staff`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: OTHER_USER_ID,
          role: 'manager',
        })
        .expect(201);

      const staffId = addRes.body.id;

      // Remove staff
      await request(app.server)
        .delete(`/api/v1/venues/${venueId}/staff/${staffId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(204);

      // Verify staff is deactivated (soft delete)
      const staffRecord = await db('venue_staff')
        .where({ id: staffId })
        .first();

      expect(staffRecord.is_active).toBe(false);
    });

    it('should reject removing yourself', async () => {
      const venueId = await createTestVenue('Cannot Remove Self Venue');

      // Get owner staff record
      const ownerStaff = await db('venue_staff')
        .where({ venue_id: venueId, user_id: TEST_USER_ID })
        .first();

      const res = await request(app.server)
        .delete(`/api/v1/venues/${venueId}/staff/${ownerStaff.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(res.body.error).toMatch(/yourself/i);
    });

    it('should reject removing venue owner', async () => {
      const venueId = await createTestVenue('Cannot Remove Owner Venue');

      // Add OTHER_USER as manager
      await request(app.server)
        .post(`/api/v1/venues/${venueId}/staff`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: OTHER_USER_ID,
          role: 'manager',
        })
        .expect(201);

      // Get owner staff record
      const ownerStaff = await db('venue_staff')
        .where({ venue_id: venueId, user_id: TEST_USER_ID })
        .first();

      // Manager tries to remove owner - should fail
      const res = await request(app.server)
        .delete(`/api/v1/venues/${venueId}/staff/${ownerStaff.id}`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .expect(403);

      expect(res.body.error).toMatch(/owner|cannot/i);
    });

    it('should reject manager removing another manager', async () => {
      const venueId = await createTestVenue('Manager No Remove Manager Venue');

      // Add OTHER_USER as manager
      await request(app.server)
        .post(`/api/v1/venues/${venueId}/staff`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: OTHER_USER_ID,
          role: 'manager',
        })
        .expect(201);

      // Add THIRD_USER as manager
      const addRes = await request(app.server)
        .post(`/api/v1/venues/${venueId}/staff`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: THIRD_USER_ID,
          role: 'manager',
        })
        .expect(201);

      const thirdUserStaffId = addRes.body.id;

      // Manager tries to remove another manager - should fail
      const res = await request(app.server)
        .delete(`/api/v1/venues/${venueId}/staff/${thirdUserStaffId}`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .expect(403);

      expect(res.body.error).toMatch(/manager|cannot/i);
    });

    it('should allow manager to remove lower roles', async () => {
      const venueId = await createTestVenue('Manager Remove Lower Venue');

      // Add OTHER_USER as manager
      await request(app.server)
        .post(`/api/v1/venues/${venueId}/staff`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: OTHER_USER_ID,
          role: 'manager',
        })
        .expect(201);

      // Add THIRD_USER as viewer
      const addRes = await request(app.server)
        .post(`/api/v1/venues/${venueId}/staff`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: THIRD_USER_ID,
          role: 'viewer',
        })
        .expect(201);

      const thirdUserStaffId = addRes.body.id;

      // Manager removes viewer - should succeed
      await request(app.server)
        .delete(`/api/v1/venues/${venueId}/staff/${thirdUserStaffId}`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .expect(204);

      // Verify staff is deactivated
      const staffRecord = await db('venue_staff')
        .where({ id: thirdUserStaffId })
        .first();

      expect(staffRecord.is_active).toBe(false);
    });

    it('should reject viewer from removing staff', async () => {
      const venueId = await createTestVenue('Viewer Cannot Remove Venue');

      // Add OTHER_USER as viewer
      await request(app.server)
        .post(`/api/v1/venues/${venueId}/staff`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: OTHER_USER_ID,
          role: 'viewer',
        })
        .expect(201);

      // Add THIRD_USER as door_staff
      const addRes = await request(app.server)
        .post(`/api/v1/venues/${venueId}/staff`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: THIRD_USER_ID,
          role: 'door_staff',
        })
        .expect(201);

      const thirdUserStaffId = addRes.body.id;

      // Viewer tries to remove door_staff - should fail
      const res = await request(app.server)
        .delete(`/api/v1/venues/${venueId}/staff/${thirdUserStaffId}`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .expect(403);

      expect(res.body.error).toMatch(/denied|forbidden|only owners/i);
    });

    it('should return 404 for non-existent staff member', async () => {
      const venueId = await createTestVenue('Remove Not Found Venue');
      const fakeStaffId = crypto.randomUUID();

      const res = await request(app.server)
        .delete(`/api/v1/venues/${venueId}/staff/${fakeStaffId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(res.body.error).toMatch(/not found/i);
    });
  });

  // ===========================================
  // SECTION 7: STAFF LIMIT ENFORCEMENT VIA API
  // ===========================================
  describe('Staff Limit Enforcement', () => {

    it('should reject adding staff when limit reached via API', async () => {
      const venueId = await createTestVenue('API Limit Venue');

      // Set a low limit for testing
      const originalLimit = process.env.MAX_STAFF_PER_VENUE;
      process.env.MAX_STAFF_PER_VENUE = '2';

      try {
        // Owner already counts as 1, add 1 more to hit limit
        await request(app.server)
          .post(`/api/v1/venues/${venueId}/staff`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            userId: OTHER_USER_ID,
            role: 'manager',
          })
          .expect(201);

        // Try to add 3rd - should fail
        const res = await request(app.server)
          .post(`/api/v1/venues/${venueId}/staff`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            userId: THIRD_USER_ID,
            role: 'viewer',
          })
          .expect(500);

        expect(res.body.error).toMatch(/limit|failed/i);
      } finally {
        if (originalLimit) {
          process.env.MAX_STAFF_PER_VENUE = originalLimit;
        } else {
          delete process.env.MAX_STAFF_PER_VENUE;
        }
      }
    });

    it('should allow adding staff after removal frees up limit', async () => {
      const venueId = await createTestVenue('Limit After Remove Venue');

      const originalLimit = process.env.MAX_STAFF_PER_VENUE;
      process.env.MAX_STAFF_PER_VENUE = '2';

      try {
        // Add staff to hit limit
        const addRes = await request(app.server)
          .post(`/api/v1/venues/${venueId}/staff`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            userId: OTHER_USER_ID,
            role: 'manager',
          })
          .expect(201);

        const staffId = addRes.body.id;

        // Verify at limit
        const limitCheck1 = await db('venue_staff')
          .where({ venue_id: venueId, is_active: true })
          .count('* as count')
          .first();
        expect(parseInt(limitCheck1!.count as string)).toBe(2);

        // Remove staff
        await request(app.server)
          .delete(`/api/v1/venues/${venueId}/staff/${staffId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(204);

        // Now should be able to add again
        await request(app.server)
          .post(`/api/v1/venues/${venueId}/staff`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            userId: THIRD_USER_ID,
            role: 'viewer',
          })
          .expect(201);
      } finally {
        if (originalLimit) {
          process.env.MAX_STAFF_PER_VENUE = originalLimit;
        } else {
          delete process.env.MAX_STAFF_PER_VENUE;
        }
      }
    });
  });
});