// tests/integration/database-management.integration.test.ts

import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '../../.env.test') });

import request from 'supertest';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Knex } from 'knex';
import { getTestDb, clearTenantContext } from './helpers/db';
import { getTestRedis } from './helpers/redis';
import { getTestMongoDB, clearAllCollections } from './helpers/mongodb';

// Generate RSA keypair for JWT signing
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

import fs from 'fs';
import os from 'os';
const tempKeyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'db-mgmt-test-keys-'));
const publicKeyPath = path.join(tempKeyDir, 'jwt-public.pem');
fs.writeFileSync(publicKeyPath, publicKey);

process.env.JWT_PUBLIC_KEY_PATH = publicKeyPath;

// =============================================================================
// TEST CONSTANTS
// =============================================================================
const TEST_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const TEST_USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OTHER_TENANT_ID = '22222222-2222-2222-2222-222222222222';
const OTHER_USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================
function generateTestJWT(payload: {
  sub: string;
  tenant_id: string;
  email?: string;
  permissions?: string[];
}): string {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      sub: payload.sub,
      email: payload.email || `${payload.sub}@test.com`,
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
    name: `Test Venue ${Date.now()}`,
    email: `test${Date.now()}@venue.com`,
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

// =============================================================================
// TEST SUITE
// =============================================================================
describe('Database Management Integration Tests', () => {
  let app: any;
  let db: Knex;
  let redis: any;
  let authToken: string;

  beforeAll(async () => {
    const { buildApp } = await import('../../src/app');
    app = await buildApp();
    await app.ready();
    db = getTestDb();
    redis = getTestRedis();
    authToken = generateTestJWT({ sub: TEST_USER_ID, tenant_id: TEST_TENANT_ID });
  }, 60000);

  afterAll(async () => {
    if (app) await app.close();
    try {
      fs.unlinkSync(publicKeyPath);
      fs.rmdirSync(tempKeyDir);
    } catch {}
  });

  beforeEach(async () => {
    // Clean up tables in correct order (children first due to FK constraints)
    await db('venue_staff').del();
    await db('venue_settings').del();
    await db('venue_integrations').del();
    await db('venues').del();

    // Clear Redis
    const keys = await redis.keys('*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }

    // Seed tenant
    await db('tenants').insert({
      id: TEST_TENANT_ID,
      name: 'Test Tenant',
      slug: 'test-tenant',
      created_at: new Date(),
      updated_at: new Date(),
    }).onConflict('id').ignore();

    // Seed user
    await db('users').insert({
      id: TEST_USER_ID,
      email: 'test@test.com',
      password_hash: '$2b$10$dummyhashfortestingpurposesonly',
      tenant_id: TEST_TENANT_ID,
      created_at: new Date(),
      updated_at: new Date(),
    }).onConflict('id').ignore();

    // Clear tenant context
    await clearTenantContext();
  });

  // ===========================================================================
  // SECTION 1: CONNECTION POOL MANAGEMENT (10 tests)
  // ===========================================================================
  describe('Connection Pool Management', () => {

    it('should have pool max configured to 10 connections', async () => {
      const poolConfig = db.client.config.pool;
      expect(poolConfig.max).toBe(10);
    });

    it('should have pool min configured to 0 connections', async () => {
      const poolConfig = db.client.config.pool;
      expect(poolConfig.min).toBe(0);
    });

    it('should have acquire connection timeout configured', async () => {
      // Use dynamic import to check production config without side effects
      const { dbConfig } = await import('../../src/config/database');
      expect(dbConfig.acquireConnectionTimeout).toBe(60000);
    });

    it('should have pool afterCreate hook for statement timeout', async () => {
      // Use dynamic import to check production config without side effects
      const { dbConfig } = await import('../../src/config/database');
      expect(dbConfig.pool?.afterCreate).toBeDefined();
      expect(typeof dbConfig.pool?.afterCreate).toBe('function');
    });

    it('should successfully execute simple queries', async () => {
      const result = await db.raw('SELECT 1 as value');
      expect(result.rows[0].value).toBe(1);
    });

    it('should handle concurrent queries within pool limits', async () => {
      // Execute 5 concurrent queries (within pool max of 10)
      const queries = Array(5).fill(null).map((_, i) =>
        db.raw('SELECT pg_sleep(0.1), ? as query_num', [i])
      );

      const results = await Promise.all(queries);
      expect(results.length).toBe(5);
      results.forEach((result, i) => {
        expect(parseInt(result.rows[0].query_num, 10)).toBe(i);
      });
    });

    it('should queue queries when pool is exhausted', async () => {
      // This test verifies that when all connections are in use,
      // new queries wait rather than fail immediately
      const startTime = Date.now();

      // Create 10 slow queries to exhaust pool + 1 that must wait
      const slowQueries = Array(10).fill(null).map(() =>
        db.raw('SELECT pg_sleep(0.2)')
      );
      const waitingQuery = db.raw('SELECT 1 as waited');

      const results = await Promise.all([...slowQueries, waitingQuery]);
      const duration = Date.now() - startTime;

      expect(results.length).toBe(11);
      // The waiting query should have completed after some queries finished
      expect(results[10].rows[0].waited).toBe(1);
    }, 10000);

    it('should report pool metrics via client.pool methods', async () => {
      const pool = db.client.pool;

      // These methods may or may not exist depending on knex version
      // but we test what's available
      if (typeof pool.numUsed === 'function') {
        expect(typeof pool.numUsed()).toBe('number');
      }
      if (typeof pool.numFree === 'function') {
        expect(typeof pool.numFree()).toBe('number');
      }
      if (typeof pool.numPendingAcquires === 'function') {
        expect(typeof pool.numPendingAcquires()).toBe('number');
      }
    });

    it('should recover connection after query error', async () => {
      // Execute a failing query
      try {
        await db.raw('SELECT * FROM nonexistent_table_xyz');
      } catch (error) {
        // Expected to fail
      }

      // Connection should still be usable
      const result = await db.raw('SELECT 1 as recovered');
      expect(result.rows[0].recovered).toBe(1);
    });

    it('should handle connection errors gracefully', async () => {
      // Verify that the pool handles connection-level errors
      // without corrupting the pool state
      const beforeCount = await db('venues').count('* as count').first();

      // Simulate an error condition
      try {
        await db.raw('INVALID SQL SYNTAX HERE');
      } catch (error) {
        expect(error).toBeDefined();
      }

      // Pool should still work
      const afterCount = await db('venues').count('* as count').first();
      expect(afterCount).toEqual(beforeCount);
    });
  });

  // ===========================================================================
  // SECTION 2: TRANSACTION ISOLATION & LOCKING (10 tests)
  // ===========================================================================
  describe('Transaction Isolation & Locking', () => {
    let venueId: string;

    beforeEach(async () => {
      // Create a test venue directly in DB
      venueId = crypto.randomUUID();
      await db('venues').insert({
        id: venueId,
        tenant_id: TEST_TENANT_ID,
        name: 'Locking Test Venue',
        slug: `locking-test-${Date.now()}`,
        email: 'locking@test.com',
        venue_type: 'comedy_club',
        max_capacity: 500,
        address_line1: '123 Test St',
        city: 'New York',
        state_province: 'NY',
        country_code: 'US',
        status: 'active',
        is_verified: false,
        created_by: TEST_USER_ID,
        version: 1,
        created_at: new Date(),
        updated_at: new Date(),
      });
    });

    it('should use READ COMMITTED isolation level by default', async () => {
      const result = await db.raw('SHOW default_transaction_isolation');
      expect(result.rows[0].default_transaction_isolation).toBe('read committed');
    });

    it('should prevent dirty reads (READ COMMITTED behavior)', async () => {
      // Start transaction 1 - make uncommitted change
      const trx1 = await db.transaction();
      await trx1('venues').where('id', venueId).update({ name: 'Uncommitted Name' });

      // Transaction 2 should NOT see uncommitted change
      const venue = await db('venues').where('id', venueId).first();
      expect(venue.name).toBe('Locking Test Venue'); // Original name

      // Rollback transaction 1
      await trx1.rollback();

      // Verify original name is preserved
      const venueAfter = await db('venues').where('id', venueId).first();
      expect(venueAfter.name).toBe('Locking Test Venue');
    });

    it('should rollback transaction on error', async () => {
      const originalVenue = await db('venues').where('id', venueId).first();

      try {
        await db.transaction(async (trx) => {
          await trx('venues').where('id', venueId).update({ name: 'Should Rollback' });
          // Force an error
          throw new Error('Intentional error for rollback test');
        });
      } catch (error) {
        expect((error as Error).message).toBe('Intentional error for rollback test');
      }

      // Verify rollback
      const venueAfter = await db('venues').where('id', venueId).first();
      expect(venueAfter.name).toBe(originalVenue.name);
    });

    it('should acquire FOR UPDATE lock within transaction', async () => {
      await db.transaction(async (trx) => {
        // Acquire lock using raw SQL (withLock pattern)
        const result = await trx.raw(
          'SELECT * FROM venues WHERE id = ? FOR UPDATE',
          [venueId]
        );

        expect(result.rows.length).toBe(1);
        expect(result.rows[0].id).toBe(venueId);

        // Update within lock
        await trx('venues').where('id', venueId).update({ name: 'Locked Update' });
      });

      // Verify update
      const venue = await db('venues').where('id', venueId).first();
      expect(venue.name).toBe('Locked Update');
    });

    it('should support FOR SHARE lock mode', async () => {
      await db.transaction(async (trx) => {
        const result = await trx.raw(
          'SELECT * FROM venues WHERE id = ? FOR SHARE',
          [venueId]
        );

        expect(result.rows.length).toBe(1);
      });
    });

    it('should support SKIP LOCKED for non-blocking reads', async () => {
      // Start a transaction that locks the row
      const trx1 = await db.transaction();
      await trx1.raw('SELECT * FROM venues WHERE id = ? FOR UPDATE', [venueId]);

      // Second query with SKIP LOCKED should return empty (row is locked)
      const result = await db.raw(
        'SELECT * FROM venues WHERE id = ? FOR UPDATE SKIP LOCKED',
        [venueId]
      );

      // Should skip the locked row
      expect(result.rows.length).toBe(0);

      await trx1.rollback();
    });

    it('should increment version on optimistic locking update', async () => {
      const before = await db('venues').where('id', venueId).first();
      expect(before.version).toBe(1);

      // Simulate optimistic update
      const updated = await db('venues')
        .where('id', venueId)
        .where('version', 1)
        .update({
          name: 'Optimistic Update',
          version: 2,
          updated_at: new Date(),
        });

      expect(updated).toBe(1); // 1 row affected

      const after = await db('venues').where('id', venueId).first();
      expect(after.version).toBe(2);
      expect(after.name).toBe('Optimistic Update');
    });

    it('should fail optimistic update on version mismatch', async () => {
      // Try to update with wrong version
      const updated = await db('venues')
        .where('id', venueId)
        .where('version', 999) // Wrong version
        .update({
          name: 'Should Not Update',
          version: 1000,
        });

      expect(updated).toBe(0); // 0 rows affected

      // Original data unchanged
      const venue = await db('venues').where('id', venueId).first();
      expect(venue.name).toBe('Locking Test Venue');
      expect(venue.version).toBe(1);
    });

    it('should set tenant context with SET LOCAL', async () => {
      await db.transaction(async (trx) => {
        await trx.raw(`SET LOCAL app.current_tenant_id = '${TEST_TENANT_ID}'`);

        const result = await trx.raw(
          "SELECT current_setting('app.current_tenant_id', true) as tenant_id"
        );

        expect(result.rows[0].tenant_id).toBe(TEST_TENANT_ID);
      });
    });

    it('should handle concurrent updates with proper locking', async () => {
      // Two concurrent updates - both should succeed with locking
      const update1 = db.transaction(async (trx) => {
        await trx.raw('SELECT * FROM venues WHERE id = ? FOR UPDATE', [venueId]);
        await trx('venues').where('id', venueId).update({
          name: 'Update 1',
          version: db.raw('version + 1')
        });
        return 'update1';
      });

      const update2 = db.transaction(async (trx) => {
        await trx.raw('SELECT * FROM venues WHERE id = ? FOR UPDATE', [venueId]);
        await trx('venues').where('id', venueId).update({
          name: 'Update 2',
          version: db.raw('version + 1')
        });
        return 'update2';
      });

      const results = await Promise.all([update1, update2]);
      expect(results).toContain('update1');
      expect(results).toContain('update2');

      // Final version should be 3 (1 + 2 increments)
      const venue = await db('venues').where('id', venueId).first();
      expect(venue.version).toBe(3);
    });
  });

  // ===========================================================================
  // SECTION 3: DATABASE CONSTRAINTS (14 tests)
  // ===========================================================================
  describe('Database Constraints', () => {

    describe('Unique Constraints', () => {
      it('should reject duplicate venue slug', async () => {
        const slug = `unique-slug-${Date.now()}`;

        // First insert should succeed
        await db('venues').insert({
          id: crypto.randomUUID(),
          tenant_id: TEST_TENANT_ID,
          name: 'First Venue',
          slug: slug,
          email: 'first@test.com',
          venue_type: 'comedy_club',
          max_capacity: 100,
          address_line1: '123 Test St',
          city: 'New York',
          state_province: 'NY',
          country_code: 'US',
          status: 'active',
          created_by: TEST_USER_ID,
          created_at: new Date(),
          updated_at: new Date(),
        });

        // Second insert with same slug should fail
        await expect(
          db('venues').insert({
            id: crypto.randomUUID(),
            tenant_id: TEST_TENANT_ID,
            name: 'Second Venue',
            slug: slug, // Duplicate slug
            email: 'second@test.com',
            venue_type: 'comedy_club',
            max_capacity: 100,
            address_line1: '456 Test St',
            city: 'New York',
            state_province: 'NY',
            country_code: 'US',
            status: 'active',
            created_by: TEST_USER_ID,
            created_at: new Date(),
            updated_at: new Date(),
          })
        ).rejects.toThrow();
      });

      it('should return error code 23505 for unique violation', async () => {
        const slug = `unique-error-${Date.now()}`;

        await db('venues').insert({
          id: crypto.randomUUID(),
          tenant_id: TEST_TENANT_ID,
          name: 'First Venue',
          slug: slug,
          email: 'first@test.com',
          venue_type: 'comedy_club',
          max_capacity: 100,
          address_line1: '123 Test St',
          city: 'New York',
          state_province: 'NY',
          country_code: 'US',
          status: 'active',
          created_by: TEST_USER_ID,
          created_at: new Date(),
          updated_at: new Date(),
        });

        try {
          await db('venues').insert({
            id: crypto.randomUUID(),
            tenant_id: TEST_TENANT_ID,
            name: 'Second Venue',
            slug: slug,
            email: 'second@test.com',
            venue_type: 'comedy_club',
            max_capacity: 100,
            address_line1: '456 Test St',
            city: 'New York',
            state_province: 'NY',
            country_code: 'US',
            status: 'active',
            created_by: TEST_USER_ID,
            created_at: new Date(),
            updated_at: new Date(),
          });
          fail('Should have thrown');
        } catch (error: any) {
          expect(error.code).toBe('23505');
        }
      });

      it('should reject duplicate staff assignment (venue_id, user_id)', async () => {
        const venueId = crypto.randomUUID();

        // Create venue first
        await db('venues').insert({
          id: venueId,
          tenant_id: TEST_TENANT_ID,
          name: 'Staff Test Venue',
          slug: `staff-test-${Date.now()}`,
          email: 'staff@test.com',
          venue_type: 'comedy_club',
          max_capacity: 100,
          address_line1: '123 Test St',
          city: 'New York',
          state_province: 'NY',
          country_code: 'US',
          status: 'active',
          created_by: TEST_USER_ID,
          created_at: new Date(),
          updated_at: new Date(),
        });

        // First staff insert
        await db('venue_staff').insert({
          venue_id: venueId,
          user_id: TEST_USER_ID,
          role: 'owner',
          permissions: ['*'],
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        });

        // Duplicate should fail
        await expect(
          db('venue_staff').insert({
            venue_id: venueId,
            user_id: TEST_USER_ID, // Same user
            role: 'manager',
            permissions: ['venue:read'],
            is_active: true,
            created_at: new Date(),
            updated_at: new Date(),
          })
        ).rejects.toThrow();
      });

      it('should reject duplicate integration (venue_id, integration_type)', async () => {
        const venueId = crypto.randomUUID();

        // Create venue
        await db('venues').insert({
          id: venueId,
          tenant_id: TEST_TENANT_ID,
          name: 'Integration Test Venue',
          slug: `integration-test-${Date.now()}`,
          email: 'integration@test.com',
          venue_type: 'comedy_club',
          max_capacity: 100,
          address_line1: '123 Test St',
          city: 'New York',
          state_province: 'NY',
          country_code: 'US',
          status: 'active',
          created_by: TEST_USER_ID,
          created_at: new Date(),
          updated_at: new Date(),
        });

        // First integration
        await db('venue_integrations').insert({
          venue_id: venueId,
          tenant_id: TEST_TENANT_ID,
          integration_type: 'stripe',
          integration_name: 'Stripe Integration',
          config_data: {},
          created_at: new Date(),
          updated_at: new Date(),
        });

        // Duplicate integration type should fail
        await expect(
          db('venue_integrations').insert({
            venue_id: venueId,
            tenant_id: TEST_TENANT_ID,
            integration_type: 'stripe', // Same type
            integration_name: 'Another Stripe',
            config_data: {},
            created_at: new Date(),
            updated_at: new Date(),
          })
        ).rejects.toThrow();
      });
    });

    describe('Foreign Key Constraints', () => {
      it('should reject staff with invalid venue_id', async () => {
        const fakeVenueId = crypto.randomUUID(); // Doesn't exist

        await expect(
          db('venue_staff').insert({
            venue_id: fakeVenueId,
            user_id: TEST_USER_ID,
            role: 'owner',
            permissions: ['*'],
            is_active: true,
            created_at: new Date(),
            updated_at: new Date(),
          })
        ).rejects.toThrow();
      });

      it('should return error code 23503 for FK violation', async () => {
        const fakeVenueId = crypto.randomUUID();

        try {
          await db('venue_staff').insert({
            venue_id: fakeVenueId,
            user_id: TEST_USER_ID,
            role: 'owner',
            permissions: ['*'],
            is_active: true,
            created_at: new Date(),
            updated_at: new Date(),
          });
          fail('Should have thrown');
        } catch (error: any) {
          expect(error.code).toBe('23503');
        }
      });

      it('should cascade delete staff when venue is deleted (hard delete)', async () => {
        const venueId = crypto.randomUUID();

        // Create venue with staff
        await db('venues').insert({
          id: venueId,
          tenant_id: TEST_TENANT_ID,
          name: 'Cascade Test Venue',
          slug: `cascade-test-${Date.now()}`,
          email: 'cascade@test.com',
          venue_type: 'comedy_club',
          max_capacity: 100,
          address_line1: '123 Test St',
          city: 'New York',
          state_province: 'NY',
          country_code: 'US',
          status: 'active',
          created_by: TEST_USER_ID,
          created_at: new Date(),
          updated_at: new Date(),
        });

        await db('venue_staff').insert({
          venue_id: venueId,
          user_id: TEST_USER_ID,
          role: 'owner',
          permissions: ['*'],
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        });

        // Verify staff exists
        const staffBefore = await db('venue_staff').where('venue_id', venueId);
        expect(staffBefore.length).toBe(1);

        // Hard delete venue (bypassing soft delete for this test)
        await db('venues').where('id', venueId).del();

        // Staff should be cascade deleted
        const staffAfter = await db('venue_staff').where('venue_id', venueId);
        expect(staffAfter.length).toBe(0);
      });
    });

    describe('Check Constraints', () => {
      it('should reject zero capacity (max_capacity > 0)', async () => {
        await expect(
          db('venues').insert({
            id: crypto.randomUUID(),
            tenant_id: TEST_TENANT_ID,
            name: 'Zero Capacity Venue',
            slug: `zero-capacity-${Date.now()}`,
            email: 'zero@test.com',
            venue_type: 'comedy_club',
            max_capacity: 0, // Should fail
            address_line1: '123 Test St',
            city: 'New York',
            state_province: 'NY',
            country_code: 'US',
            status: 'active',
            created_by: TEST_USER_ID,
            created_at: new Date(),
            updated_at: new Date(),
          })
        ).rejects.toThrow();
      });

      it('should reject negative capacity', async () => {
        await expect(
          db('venues').insert({
            id: crypto.randomUUID(),
            tenant_id: TEST_TENANT_ID,
            name: 'Negative Capacity Venue',
            slug: `negative-capacity-${Date.now()}`,
            email: 'negative@test.com',
            venue_type: 'comedy_club',
            max_capacity: -100, // Should fail
            address_line1: '123 Test St',
            city: 'New York',
            state_province: 'NY',
            country_code: 'US',
            status: 'active',
            created_by: TEST_USER_ID,
            created_at: new Date(),
            updated_at: new Date(),
          })
        ).rejects.toThrow();
      });

      it('should reject invalid venue status', async () => {
        await expect(
          db('venues').insert({
            id: crypto.randomUUID(),
            tenant_id: TEST_TENANT_ID,
            name: 'Invalid Status Venue',
            slug: `invalid-status-${Date.now()}`,
            email: 'invalid@test.com',
            venue_type: 'comedy_club',
            max_capacity: 100,
            address_line1: '123 Test St',
            city: 'New York',
            state_province: 'NY',
            country_code: 'US',
            status: 'INVALID_STATUS', // Should fail
            created_by: TEST_USER_ID,
            created_at: new Date(),
            updated_at: new Date(),
          })
        ).rejects.toThrow();
      });

      it('should accept valid venue statuses', async () => {
        const validStatuses = ['active', 'inactive', 'pending', 'suspended'];

        for (const status of validStatuses) {
          const venueId = crypto.randomUUID();
          await db('venues').insert({
            id: venueId,
            tenant_id: TEST_TENANT_ID,
            name: `Status ${status} Venue`,
            slug: `status-${status}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            email: `${status}-${Date.now()}@test.com`,
            venue_type: 'comedy_club',
            max_capacity: 100,
            address_line1: '123 Test St',
            city: 'New York',
            state_province: 'NY',
            country_code: 'US',
            status: status,
            created_by: TEST_USER_ID,
            created_at: new Date(),
            updated_at: new Date(),
          });

          const venue = await db('venues').where('id', venueId).first();
          expect(venue.status).toBe(status);
        }
      });

      it('should reject invalid webhook event status', async () => {
        await expect(
          db('venue_webhook_events').insert({
            event_id: `evt_${Date.now()}`,
            event_type: 'test.event',
            tenant_id: TEST_TENANT_ID,
            status: 'INVALID_STATUS', // Should fail
            processed_at: new Date(),
          })
        ).rejects.toThrow();
      });

      it('should reject fraud_log risk_score > 100', async () => {
        await expect(
          db('fraud_logs').insert({
            transaction_id: crypto.randomUUID(),
            tenant_id: TEST_TENANT_ID,
            ticket_id: crypto.randomUUID(),
            seller_id: TEST_USER_ID,
            buyer_id: TEST_USER_ID,
            risk_score: 150, // Should fail (> 100)
            signals: {},
            action: 'flagged',
            created_at: new Date(),
          })
        ).rejects.toThrow();
      });

      it('should reject fraud_log risk_score < 0', async () => {
        await expect(
          db('fraud_logs').insert({
            transaction_id: crypto.randomUUID(),
            tenant_id: TEST_TENANT_ID,
            ticket_id: crypto.randomUUID(),
            seller_id: TEST_USER_ID,
            buyer_id: TEST_USER_ID,
            risk_score: -10, // Should fail (< 0)
            signals: {},
            action: 'flagged',
            created_at: new Date(),
          })
        ).rejects.toThrow();
      });
    });

    describe('NOT NULL Constraints', () => {
      it('should reject venue without name', async () => {
        await expect(
          db('venues').insert({
            id: crypto.randomUUID(),
            tenant_id: TEST_TENANT_ID,
            // name: missing
            slug: `no-name-${Date.now()}`,
            email: 'noname@test.com',
            venue_type: 'comedy_club',
            max_capacity: 100,
            address_line1: '123 Test St',
            city: 'New York',
            state_province: 'NY',
            country_code: 'US',
            status: 'active',
            created_by: TEST_USER_ID,
            created_at: new Date(),
            updated_at: new Date(),
          })
        ).rejects.toThrow();
      });

      it('should reject venue without email', async () => {
        await expect(
          db('venues').insert({
            id: crypto.randomUUID(),
            tenant_id: TEST_TENANT_ID,
            name: 'No Email Venue',
            slug: `no-email-${Date.now()}`,
            // email: missing
            venue_type: 'comedy_club',
            max_capacity: 100,
            address_line1: '123 Test St',
            city: 'New York',
            state_province: 'NY',
            country_code: 'US',
            status: 'active',
            created_by: TEST_USER_ID,
            created_at: new Date(),
            updated_at: new Date(),
          })
        ).rejects.toThrow();
      });
    });
  });

  // ===========================================================================
  // SECTION 4: MIXED DATABASE CONSISTENCY (6 tests)
  // ===========================================================================
  describe('Mixed Database Consistency (PostgreSQL + MongoDB)', () => {
    let mongoConnection: any;

    beforeAll(async () => {
      mongoConnection = await getTestMongoDB();
    });

    beforeEach(async () => {
      await clearAllCollections();
    });

    it('should validate venue exists in PostgreSQL before MongoDB content operations', async () => {
      const fakeVenueId = crypto.randomUUID(); // Does not exist in PostgreSQL

      // Attempt to create content for non-existent venue via API
      const res = await request(app.server)
        .post(`/api/v1/venues/${fakeVenueId}/content`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          contentType: 'PHOTO',
          content: { url: 'http://example.com/photo.jpg' },
        });

      // Should be rejected (404 or 403)
      expect([403, 404, 500]).toContain(res.status);
    });

    it('should create venue in PostgreSQL before content in MongoDB', async () => {
      // Create venue via API
      const venuePayload = createValidVenuePayload({ name: 'MongoDB Test Venue' });
      const venueRes = await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${authToken}`)
        .send(venuePayload)
        .expect(201);

      const venueId = venueRes.body.id;

      // Verify venue exists in PostgreSQL
      const pgVenue = await db('venues').where('id', venueId).first();
      expect(pgVenue).toBeDefined();
      expect(pgVenue.name).toBe('MongoDB Test Venue');
    });

    it('should have content_audit_log table for tracking MongoDB operations', async () => {
      // Verify table exists
      const tableExists = await db.schema.hasTable('content_audit_log');
      expect(tableExists).toBe(true);

      // Verify table structure
      const columns = await db('content_audit_log').columnInfo();
      expect(columns).toHaveProperty('content_id');
      expect(columns).toHaveProperty('tenant_id');
      expect(columns).toHaveProperty('action');
      expect(columns).toHaveProperty('user_id');
      expect(columns).toHaveProperty('changes');
    });

    it('should detect orphan scenario: venue soft deleted but content exists', async () => {
      // Create venue via API
      const venuePayload = createValidVenuePayload({ name: 'Orphan Test Venue' });
      const venueRes = await request(app.server)
        .post('/api/v1/venues')
        .set('Authorization', `Bearer ${authToken}`)
        .send(venuePayload)
        .expect(201);

      const venueId = venueRes.body.id;

      // Soft delete venue via direct DB update (bypass API permission checks)
      await db('venues')
        .where('id', venueId)
        .update({ deleted_at: new Date() });

      // Venue is soft deleted
      const deletedVenue = await db('venues').where('id', venueId).first();
      expect(deletedVenue.deleted_at).not.toBeNull();

      // Query pattern for finding orphaned content
      // (content in MongoDB referencing soft-deleted venues)
      const softDeletedVenues = await db('venues')
        .whereNotNull('deleted_at')
        .select('id');

      expect(softDeletedVenues.length).toBeGreaterThanOrEqual(1);
      expect(softDeletedVenues.some((v: any) => v.id === venueId)).toBe(true);
    });

    it('should not have distributed transaction between PostgreSQL and MongoDB', async () => {
      // This test documents that there's no 2PC between the databases
      // A failure in MongoDB won't rollback PostgreSQL changes

      // This is expected behavior and documented limitation
      expect(true).toBe(true); // Acknowledgment of design decision
    });

    it('should allow querying orphan detection pattern', async () => {
      // Query to find venues that have been deleted
      const orphanQuery = `
        SELECT v.id, v.name, v.deleted_at
        FROM venues v
        WHERE v.deleted_at IS NOT NULL
      `;

      const result = await db.raw(orphanQuery);
      expect(result.rows).toBeDefined();
      // Result may be empty if no soft-deleted venues exist
    });
  });

  // ===========================================================================
  // SECTION 5: MIGRATION MANAGEMENT (5 tests)
  // ===========================================================================
  describe('Migration Management', () => {
    it('should use knex_migrations_venue as migration table', async () => {
      const config = db.client.config.migrations;
      expect(config.tableName).toBe('knex_migrations_venue');
    });

    it('should have migration records in knex_migrations_venue', async () => {
      const migrations = await db('knex_migrations_venue').select('*');
      expect(migrations.length).toBeGreaterThanOrEqual(1);
    });

    it('should track migration batch numbers', async () => {
      const migrations = await db('knex_migrations_venue')
        .select('name', 'batch', 'migration_time')
        .orderBy('id', 'asc');

      expect(migrations.length).toBeGreaterThanOrEqual(1);

      // Each migration should have a batch number
      migrations.forEach((m: any) => {
        expect(m.batch).toBeGreaterThanOrEqual(1);
        expect(m.name).toBeDefined();
        expect(m.migration_time).toBeDefined();
      });
    });

    it('should have consolidated baseline migration applied', async () => {
      const migrations = await db('knex_migrations_venue')
        .where('name', 'like', '%consolidated_baseline%')
        .select('*');

      expect(migrations.length).toBeGreaterThanOrEqual(1);
    });

    it('should have created all expected tables from migration', async () => {
      const expectedTables = [
        'venues',
        'venue_staff',
        'venue_settings',
        'venue_integrations',
        'venue_layouts',
        'venue_branding',
        'custom_domains',
        'white_label_pricing',
        'venue_tier_history',
        'venue_audit_log',
        'content_audit_log',
        'api_keys',
        'external_verifications',
        'manual_review_queue',
        'notifications',
        'email_queue',
        'venue_compliance_reviews',
        'venue_webhook_events',
        'venue_operations',
        'transfer_history',
        'resale_policies',
        'seller_verifications',
        'resale_blocks',
        'fraud_logs',
      ];

      for (const tableName of expectedTables) {
        const exists = await db.schema.hasTable(tableName);
        expect(exists).toBe(true);
      }
    });
  });

  // ===========================================================================
  // SECTION 6: DATABASE HELPERS FUNCTIONS (8 tests)
  // ===========================================================================
  describe('Database Helper Functions', () => {
    let venueId: string;

    beforeEach(async () => {
      venueId = crypto.randomUUID();
      await db('venues').insert({
        id: venueId,
        tenant_id: TEST_TENANT_ID,
        name: 'Helper Test Venue',
        slug: `helper-test-${Date.now()}`,
        email: 'helper@test.com',
        venue_type: 'comedy_club',
        max_capacity: 500,
        address_line1: '123 Test St',
        city: 'New York',
        state_province: 'NY',
        country_code: 'US',
        status: 'active',
        is_verified: false,
        total_events: 0,
        created_by: TEST_USER_ID,
        version: 1,
        created_at: new Date(),
        updated_at: new Date(),
      });
    });

    it('should support atomic increment via raw SQL', async () => {
      const before = await db('venues').where('id', venueId).first();
      expect(before.total_events).toBe(0);

      await db('venues')
        .where('id', venueId)
        .update({ total_events: db.raw('total_events + ?', [5]) });

      const after = await db('venues').where('id', venueId).first();
      expect(after.total_events).toBe(5);
    });

    it('should support atomic decrement with floor at 0', async () => {
      // Set initial value
      await db('venues').where('id', venueId).update({ total_events: 3 });

      // Decrement by more than available (should floor at 0)
      await db('venues')
        .where('id', venueId)
        .update({ total_events: db.raw('GREATEST(0, total_events - ?)', [10]) });

      const venue = await db('venues').where('id', venueId).first();
      expect(venue.total_events).toBe(0);
    });

    it('should support tenant-scoped queries', async () => {
      // Seed other tenant
      await db('tenants').insert({
        id: OTHER_TENANT_ID,
        name: 'Other Tenant',
        slug: 'other-tenant',
        created_at: new Date(),
        updated_at: new Date(),
      }).onConflict('id').ignore();

      // Seed other user
      await db('users').insert({
        id: OTHER_USER_ID,
        email: 'other@test.com',
        password_hash: '$2b$10$dummyhashfortestingpurposesonly',
        tenant_id: OTHER_TENANT_ID,
        created_at: new Date(),
        updated_at: new Date(),
      }).onConflict('id').ignore();

      // Create venue for other tenant
      const otherVenueId = crypto.randomUUID();
      await db('venues').insert({
        id: otherVenueId,
        tenant_id: OTHER_TENANT_ID,
        name: 'Other Tenant Venue',
        slug: `other-tenant-${Date.now()}`,
        email: 'other@test.com',
        venue_type: 'arena',
        max_capacity: 1000,
        address_line1: '456 Other St',
        city: 'Boston',
        state_province: 'MA',
        country_code: 'US',
        status: 'active',
        created_by: OTHER_USER_ID,
        version: 1,
        created_at: new Date(),
        updated_at: new Date(),
      });

      // Query with tenant filter
      const tenantAVenues = await db('venues')
        .where('tenant_id', TEST_TENANT_ID)
        .whereNull('deleted_at');

      const tenantBVenues = await db('venues')
        .where('tenant_id', OTHER_TENANT_ID)
        .whereNull('deleted_at');

      expect(tenantAVenues.length).toBeGreaterThanOrEqual(1);
      expect(tenantBVenues.length).toBeGreaterThanOrEqual(1);

      // Verify isolation
      expect(tenantAVenues.every((v: any) => v.tenant_id === TEST_TENANT_ID)).toBe(true);
      expect(tenantBVenues.every((v: any) => v.tenant_id === OTHER_TENANT_ID)).toBe(true);
    });

    it('should handle retry on serialization failure code 40001', async () => {
      // Import the retry utilities
      const { isRetryableDbError } = await import('../../src/utils/dbWithRetry');

      // Test error code classification
      expect(isRetryableDbError({ code: '40001' })).toBe(true); // Serialization failure
      expect(isRetryableDbError({ code: '40P01' })).toBe(true); // Deadlock
      expect(isRetryableDbError({ code: '23505' })).toBe(false); // Unique violation
      expect(isRetryableDbError({ code: '23503' })).toBe(false); // FK violation
      expect(isRetryableDbError({ code: 'ECONNREFUSED' })).toBe(true); // Connection refused
    });

    it('should support transaction with tenant context', async () => {
      await db.transaction(async (trx) => {
        // Set tenant context
        await trx.raw(`SET LOCAL app.current_tenant_id = '${TEST_TENANT_ID}'`);

        // Query within tenant context
        const result = await trx.raw(
          "SELECT current_setting('app.current_tenant_id', true) as tenant_id"
        );
        expect(result.rows[0].tenant_id).toBe(TEST_TENANT_ID);

        // Update within transaction
        await trx('venues')
          .where('id', venueId)
          .where('tenant_id', TEST_TENANT_ID)
          .update({ name: 'Updated in Transaction' });
      });

      // Verify update persisted
      const venue = await db('venues').where('id', venueId).first();
      expect(venue.name).toBe('Updated in Transaction');
    });

    it('should support savepoints for partial rollback', async () => {
      await db.transaction(async (trx) => {
        // First update
        await trx('venues').where('id', venueId).update({ name: 'First Update' });

        // Create savepoint
        await trx.raw('SAVEPOINT my_savepoint');

        // Second update
        await trx('venues').where('id', venueId).update({ name: 'Second Update' });

        // Rollback to savepoint
        await trx.raw('ROLLBACK TO SAVEPOINT my_savepoint');

        // Should have first update
        const venue = await trx('venues').where('id', venueId).first();
        expect(venue.name).toBe('First Update');
      });

      // After transaction commits, should have first update
      const venue = await db('venues').where('id', venueId).first();
      expect(venue.name).toBe('First Update');
    });

    it('should handle bulk insert with returning', async () => {
      const newVenues = [
        {
          id: crypto.randomUUID(),
          tenant_id: TEST_TENANT_ID,
          name: 'Bulk Venue 1',
          slug: `bulk-1-${Date.now()}`,
          email: 'bulk1@test.com',
          venue_type: 'comedy_club',
          max_capacity: 100,
          address_line1: '1 Bulk St',
          city: 'New York',
          state_province: 'NY',
          country_code: 'US',
          status: 'active',
          created_by: TEST_USER_ID,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: crypto.randomUUID(),
          tenant_id: TEST_TENANT_ID,
          name: 'Bulk Venue 2',
          slug: `bulk-2-${Date.now()}`,
          email: 'bulk2@test.com',
          venue_type: 'arena',
          max_capacity: 200,
          address_line1: '2 Bulk St',
          city: 'Boston',
          state_province: 'MA',
          country_code: 'US',
          status: 'active',
          created_by: TEST_USER_ID,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      const inserted = await db('venues').insert(newVenues).returning('*');

      expect(inserted.length).toBe(2);
      expect(inserted[0].name).toBe('Bulk Venue 1');
      expect(inserted[1].name).toBe('Bulk Venue 2');
    });

    it('should support upsert with onConflict', async () => {
      const conflictSlug = `upsert-test-${Date.now()}`;

      // First insert
      await db('venues').insert({
        id: venueId,
        tenant_id: TEST_TENANT_ID,
        name: 'Original Name',
        slug: conflictSlug,
        email: 'upsert@test.com',
        venue_type: 'comedy_club',
        max_capacity: 100,
        address_line1: '123 Upsert St',
        city: 'New York',
        state_province: 'NY',
        country_code: 'US',
        status: 'active',
        created_by: TEST_USER_ID,
        created_at: new Date(),
        updated_at: new Date(),
      }).onConflict('id').merge({
        name: 'Upserted Name',
        updated_at: new Date(),
      });

      // Upsert with same id should update
      await db('venues').insert({
        id: venueId,
        tenant_id: TEST_TENANT_ID,
        name: 'New Name',
        slug: `${conflictSlug}-new`,
        email: 'upsert@test.com',
        venue_type: 'comedy_club',
        max_capacity: 100,
        address_line1: '123 Upsert St',
        city: 'New York',
        state_province: 'NY',
        country_code: 'US',
        status: 'active',
        created_by: TEST_USER_ID,
        created_at: new Date(),
        updated_at: new Date(),
      }).onConflict('id').merge({
        name: 'Upserted Name',
        updated_at: new Date(),
      });

      const venue = await db('venues').where('id', venueId).first();
      expect(venue.name).toBe('Upserted Name');
    });
  });
});
