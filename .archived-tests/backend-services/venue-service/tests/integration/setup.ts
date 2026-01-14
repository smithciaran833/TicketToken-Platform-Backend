/**
 * Venue Service Integration Test Setup
 *
 * Mirrors ticket-service setup pattern for consistency.
 * Uses in-process Fastify app with app.inject() for isolated testing.
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load env FIRST before any other imports
const envPath = resolve(__dirname, '../../.env.test');
config({ path: envPath });

import { FastifyInstance } from 'fastify';
import knex, { Knex } from 'knex';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { buildApp } from '../../src/app';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// ============================================================================
// DATABASE CONNECTIONS
// ============================================================================

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'tickettoken_test',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
};

const db = knex({
  client: 'postgresql',
  connection: dbConfig,
  pool: { min: 1, max: 5 },
});

export const pool = new Pool({
  host: dbConfig.host,
  port: dbConfig.port,
  database: dbConfig.database,
  user: dbConfig.user,
  password: dbConfig.password,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// ============================================================================
// REDIS CONNECTION
// ============================================================================

const redisPassword = process.env.REDIS_PASSWORD;

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: redisPassword && redisPassword.length > 0 ? redisPassword : undefined,
  maxRetriesPerRequest: 3,
});

// ============================================================================
// JWT SETUP
// ============================================================================

const privateKeyPath = process.env.JWT_PRIVATE_KEY_PATH ||
  path.join(process.env.HOME!, 'tickettoken-secrets', 'jwt-private.pem');

let privateKey: string;
try {
  privateKey = fs.readFileSync(privateKeyPath, 'utf8');
  console.log('✓ Test setup: JWT private key loaded');
} catch (error) {
  console.error('✗ Test setup: Failed to load JWT private key:', error);
  throw new Error('JWT private key required for tests: ' + privateKeyPath);
}

// ============================================================================
// TEST CONTEXT & CONSTANTS
// ============================================================================

export interface TestContext {
  app: FastifyInstance;
  db: Knex;
  redis: Redis;
  testTenantId: string;
  testUserId: string;
  testVenueId: string;
}

export const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
export const TEST_USER_ID = '00000000-0000-0000-0000-000000000088';
export const TEST_VENUE_ID = '00000000-0000-0000-0000-000000000077';

// ============================================================================
// SETUP & TEARDOWN
// ============================================================================

export async function setupTestApp(): Promise<TestContext> {
  const app = await buildApp();
  await app.ready();

  // 1. Ensure tenant exists
  await pool.query(
    `INSERT INTO tenants (id, name, slug, status, settings)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO NOTHING`,
    [TEST_TENANT_ID, 'Test Tenant', 'test-tenant', 'active', JSON.stringify({})]
  );

  // 2. Ensure test user exists (email must be lowercase per CHECK constraint)
  await pool.query(
    `INSERT INTO users (id, email, password_hash, email_verified, status, role, tenant_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO NOTHING`,
    [TEST_USER_ID, 'test@example.com', '$2b$10$dummyhash', true, 'ACTIVE', 'organizer', TEST_TENANT_ID]
  );

  // 3. Ensure test venue exists (with all NOT NULL columns)
  await pool.query(
    `INSERT INTO venues (id, tenant_id, name, slug, email, address_line1, city, state_province, country_code, venue_type, max_capacity, created_by, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (id) DO NOTHING`,
    [TEST_VENUE_ID, TEST_TENANT_ID, 'Test Venue', 'test-venue', 'venue@test.com', '123 Test St', 'Test City', 'TS', 'US', 'theater', 1000, TEST_USER_ID, 'ACTIVE']
  );

  return {
    app,
    db,
    redis,
    testTenantId: TEST_TENANT_ID,
    testUserId: TEST_USER_ID,
    testVenueId: TEST_VENUE_ID,
  };
}

export async function teardownTestApp(context: { app?: FastifyInstance; db?: Knex; redis?: Redis }): Promise<void> {
  try { if (context?.app) await context.app.close(); } catch (e) { /* ignore */ }
  try { await db.destroy(); } catch (e) { /* ignore */ }
  try { await pool.end(); } catch (e) { /* ignore */ }
  try { await redis.quit(); } catch (e) { /* ignore */ }
}

// ============================================================================
// DATABASE CLEANUP
// ============================================================================

export async function cleanDatabase(database: Knex): Promise<void> {
  try {
    // Delete in reverse FK dependency order
    // Child tables first (those that reference venues)
    await database.raw('DELETE FROM venue_audit_log WHERE venue_id IN (SELECT id FROM venues WHERE tenant_id = ?)', [TEST_TENANT_ID]).catch(() => {});
    await database.raw('DELETE FROM venue_tier_history WHERE venue_id IN (SELECT id FROM venues WHERE tenant_id = ?)', [TEST_TENANT_ID]).catch(() => {});
    await database.raw('DELETE FROM custom_domains WHERE venue_id IN (SELECT id FROM venues WHERE tenant_id = ?)', [TEST_TENANT_ID]).catch(() => {});
    await database.raw('DELETE FROM venue_branding WHERE venue_id IN (SELECT id FROM venues WHERE tenant_id = ?)', [TEST_TENANT_ID]).catch(() => {});
    await database.raw('DELETE FROM venue_layouts WHERE venue_id IN (SELECT id FROM venues WHERE tenant_id = ?)', [TEST_TENANT_ID]).catch(() => {});
    await database.raw('DELETE FROM venue_integrations WHERE venue_id IN (SELECT id FROM venues WHERE tenant_id = ?)', [TEST_TENANT_ID]).catch(() => {});
    await database.raw('DELETE FROM venue_settings WHERE venue_id IN (SELECT id FROM venues WHERE tenant_id = ?)', [TEST_TENANT_ID]).catch(() => {});
    await database.raw('DELETE FROM venue_staff WHERE venue_id IN (SELECT id FROM venues WHERE tenant_id = ?)', [TEST_TENANT_ID]).catch(() => {});
    
    // Now delete venues (but keep the base test venue)
    await database.raw('DELETE FROM venues WHERE tenant_id = ? AND id != ?', [TEST_TENANT_ID, TEST_VENUE_ID]).catch(() => {});
    
    // Clear Redis keys
    await clearRedisKeys();
  } catch (error) {
    console.warn('cleanDatabase warning:', error);
  }
}

async function clearRedisKeys(): Promise<void> {
  const patterns = ['venue:*', 'cache:*', 'ratelimit:*'];
  for (const pattern of patterns) {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }
}

export async function cleanRedis(redisClient: Redis): Promise<void> {
  await clearRedisKeys();
}

// ============================================================================
// TENANT/USER HELPERS
// ============================================================================

export async function ensureTestTenant(
  database: Knex,
  tenantId: string,
  name?: string
): Promise<void> {
  const slug = `test-tenant-${tenantId.slice(0, 8)}`;
  await pool.query(
    `INSERT INTO tenants (id, name, slug, status, settings)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO NOTHING`,
    [tenantId, name || 'Test Tenant', slug, 'active', JSON.stringify({})]
  );
}

export async function ensureTestUser(
  database: Knex,
  userId: string,
  email?: string,
  tenantId?: string
): Promise<void> {
  const tid = tenantId || TEST_TENANT_ID;
  await ensureTestTenant(database, tid);

  // Email must be lowercase per CHECK constraint
  const userEmail = (email || `test-${userId.slice(0, 8)}@example.com`).toLowerCase();

  await pool.query(
    `INSERT INTO users (id, email, password_hash, email_verified, status, role, tenant_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO NOTHING`,
    [userId, userEmail, '$2b$10$dummyhashfortesting', true, 'ACTIVE', 'organizer', tid]
  );
}

// ============================================================================
// TOKEN HELPERS
// ============================================================================

export function createTestToken(
  userIdOrApp: string | FastifyInstance,
  tenantIdOrUserId: string,
  roleOrTenantId?: string,
  role?: string
): string {
  let userId: string;
  let tenantId: string;
  let userRole: string;

  if (typeof userIdOrApp === 'string') {
    userId = userIdOrApp;
    tenantId = tenantIdOrUserId;
    userRole = roleOrTenantId || 'user';
  } else {
    userId = tenantIdOrUserId;
    tenantId = roleOrTenantId!;
    userRole = role || 'user';
  }

  const payload = {
    id: userId,
    sub: userId,
    type: 'access',
    jti: crypto.randomUUID(),
    tenant_id: tenantId,
    email: `test-${userId.slice(0, 8)}@example.com`,
    permissions: userRole === 'admin' || userRole === 'owner' ? ['*'] : ['venue:read', 'venue:update'],
    role: userRole,
  };

  return jwt.sign(payload, privateKey, {
    expiresIn: '1h',
    issuer: process.env.JWT_ISSUER || 'tickettoken-auth',
    audience: process.env.JWT_AUDIENCE || 'tickettoken-auth',
    algorithm: 'RS256',
    keyid: '1',
  });
}

// ============================================================================
// DATA FACTORIES
// ============================================================================

export async function createTestVenue(
  database: Knex,
  options: {
    tenant_id?: string;
    name?: string;
    slug?: string;
    email?: string;
    venue_type?: string;
    max_capacity?: number;
    created_by?: string;
    status?: string;
  } = {}
): Promise<any> {
  const id = crypto.randomUUID();
  const tenantId = options.tenant_id || TEST_TENANT_ID;
  const createdBy = options.created_by || TEST_USER_ID;
  const slug = options.slug || `venue-${id.slice(0, 8)}`;

  await pool.query(
    `INSERT INTO venues (
      id, tenant_id, name, slug, email, address_line1, city, state_province,
      country_code, venue_type, max_capacity, created_by, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      id,
      tenantId,
      options.name || 'Test Venue',
      slug,
      options.email || `venue-${id.slice(0, 8)}@test.com`,
      '123 Test Street',
      'Test City',
      'TS',
      'US',
      options.venue_type || 'theater',
      options.max_capacity ?? 1000,
      createdBy,
      options.status || 'ACTIVE',
    ]
  );

  const result = await pool.query('SELECT * FROM venues WHERE id = $1', [id]);
  return result.rows[0];
}

export async function createTestStaffMember(
  database: Knex,
  options: {
    venue_id?: string;
    user_id?: string;
    role?: 'owner' | 'manager' | 'box_office' | 'door_staff' | 'viewer';
    permissions?: string[];
    is_active?: boolean;
    added_by?: string;
  }
): Promise<any> {
  const id = crypto.randomUUID();
  const venueId = options.venue_id || TEST_VENUE_ID;
  const userId = options.user_id || TEST_USER_ID;
  const role = options.role || 'manager';

  // Default permissions based on role
  const defaultPermissions: Record<string, string[]> = {
    owner: ['*'],
    manager: ['venue:read', 'venue:update', 'events:create', 'events:update', 'staff:view'],
    box_office: ['tickets:sell', 'tickets:view', 'tickets:validate'],
    door_staff: ['tickets:validate', 'tickets:view'],
    viewer: ['events:view', 'reports:view'],
  };

  const permissions = options.permissions || defaultPermissions[role] || [];

  await pool.query(
    `INSERT INTO venue_staff (
      id, venue_id, user_id, role, permissions, is_active, added_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      venueId,
      userId,
      role,
      permissions,
      options.is_active ?? true,
      options.added_by || null,
    ]
  );

  const result = await pool.query('SELECT * FROM venue_staff WHERE id = $1', [id]);
  return result.rows[0];
}

export async function createTestVenueSettings(
  database: Knex,
  options: {
    venue_id: string;
    max_tickets_per_order?: number;
    ticket_resale_allowed?: boolean;
    service_fee_percentage?: number;
  }
): Promise<any> {
  const id = crypto.randomUUID();

  await pool.query(
    `INSERT INTO venue_settings (
      id, venue_id, max_tickets_per_order, ticket_resale_allowed, service_fee_percentage
    ) VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (venue_id) DO UPDATE SET
      max_tickets_per_order = EXCLUDED.max_tickets_per_order,
      ticket_resale_allowed = EXCLUDED.ticket_resale_allowed,
      service_fee_percentage = EXCLUDED.service_fee_percentage`,
    [
      id,
      options.venue_id,
      options.max_tickets_per_order ?? 10,
      options.ticket_resale_allowed ?? true,
      options.service_fee_percentage ?? 10.00,
    ]
  );

  const result = await pool.query('SELECT * FROM venue_settings WHERE venue_id = $1', [options.venue_id]);
  return result.rows[0];
}

export async function createTestVenueAuditLog(
  database: Knex,
  options: {
    venue_id?: string;
    action: string;
    user_id?: string;
    changes?: Record<string, any>;
    metadata?: Record<string, any>;
  }
): Promise<any> {
  const id = crypto.randomUUID();

  await pool.query(
    `INSERT INTO venue_audit_log (
      id, venue_id, action, user_id, changes, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      id,
      options.venue_id || TEST_VENUE_ID,
      options.action,
      options.user_id || TEST_USER_ID,
      JSON.stringify(options.changes || {}),
      JSON.stringify(options.metadata || {}),
    ]
  );

  const result = await pool.query('SELECT * FROM venue_audit_log WHERE id = $1', [id]);
  return result.rows[0];
}

// ============================================================================
// EXPORTS
// ============================================================================

export { db, redis };
