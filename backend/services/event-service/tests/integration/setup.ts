/**
 * Event Service Integration Test Setup
 *
 * Supports THREE test patterns found in the codebase:
 * Pattern A: createTestPricing(db, { tenant_id, event_id, ... })
 * Pattern B: createTestPricing(tenantId, eventId, overrides?)
 * Pattern C: createTestPricing(db, eventId, tenantId, overrides?)
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load env FIRST before any other imports that might use process.env
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
  database: process.env.DB_NAME || 'tickettoken_db',
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
    // Delete in FK dependency order (children first)
    await database.raw('DELETE FROM event_metadata').catch(() => {});
    await database.raw('DELETE FROM event_pricing').catch(() => {});
    await database.raw('DELETE FROM event_capacity').catch(() => {});
    await database.raw('DELETE FROM event_schedules').catch(() => {});
    await database.raw('DELETE FROM events').catch(() => {});
    // Don't delete event_categories - they're seeded data
    await clearRedisKeys();
  } catch (error) {
    console.warn('cleanDatabase warning:', error);
  }
}

export async function cleanupEventData(): Promise<void> {
  try {
    await pool.query('DELETE FROM event_metadata').catch(() => {});
    await pool.query('DELETE FROM event_pricing').catch(() => {});
    await pool.query('DELETE FROM event_capacity').catch(() => {});
    await pool.query('DELETE FROM event_schedules').catch(() => {});
    await pool.query('DELETE FROM events').catch(() => {});
    await clearRedisKeys();
  } catch (e) {
    console.warn('cleanupEventData warning:', e);
  }
}

async function clearRedisKeys(): Promise<void> {
  const patterns = ['event:*', 'capacity:*', 'price:*', 'reservation:*', 'cache:*', 'ratelimit:*'];
  for (const pattern of patterns) {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }
}

export async function cleanRedis(redisClient: Redis): Promise<void> {
  const patterns = ['event:*', 'capacity:*', 'price:*', 'reservation:*', 'lock:*', 'cache:*', 'ratelimit:*'];
  for (const pattern of patterns) {
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(...keys);
    }
  }
}

// ============================================================================
// TENANT/USER/VENUE HELPERS
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

export async function ensureTestVenue(
  database: Knex,
  venueId: string,
  createdBy: string,
  name?: string
): Promise<void> {
  const slug = `test-venue-${venueId.slice(0, 8)}`;
  await pool.query(
    `INSERT INTO venues (id, tenant_id, name, slug, email, address_line1, city, state_province, country_code, venue_type, max_capacity, created_by, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (id) DO NOTHING`,
    [venueId, TEST_TENANT_ID, name || 'Test Venue', slug, `venue-${venueId.slice(0, 8)}@test.com`, '123 Test St', 'Test City', 'TS', 'US', 'theater', 1000, createdBy, 'ACTIVE']
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
    userRole = roleOrTenantId || 'organizer';
  } else {
    userId = tenantIdOrUserId;
    tenantId = roleOrTenantId!;
    userRole = role || 'organizer';
  }

  const payload = {
    id: userId,
    sub: userId,
    type: 'access',
    jti: crypto.randomUUID(),
    tenant_id: tenantId,
    email: `test-${userId.slice(0, 8)}@example.com`,
    permissions: ['*'],
    role: userRole,
  };

  return jwt.sign(payload, privateKey, {
    expiresIn: '1h',
    issuer: process.env.JWT_ISSUER || 'tickettoken',
    audience: process.env.JWT_AUDIENCE || 'tickettoken',
    algorithm: 'RS256',
    keyid: '1',
  });
}

// ============================================================================
// DATA HELPERS - Support all three patterns
// ============================================================================

export async function createTestEvent(
  arg1: Knex | string,
  arg2: Record<string, any> | string,
  arg3?: string | Record<string, any>,
  arg4?: Record<string, any>
): Promise<any> {
  let tenantId: string;
  let venueId: string;
  let userId: string;
  let opts: Record<string, any>;

  if (typeof arg1 === 'string') {
    // Pattern B: createTestEvent(tenantId, venueId, createdBy, overrides?)
    tenantId = arg1;
    venueId = arg2 as string;
    userId = arg3 as string;
    opts = arg4 || {};
  } else if (typeof arg2 === 'string') {
    // Pattern C: createTestEvent(db, eventId, tenantId, overrides?) - but eventId doesn't make sense for create
    // More likely: createTestEvent(db, tenantId, userId, overrides?) - not used, skip
    // Actually this pattern isn't used for createTestEvent based on grep results
    throw new Error('Unsupported createTestEvent signature');
  } else {
    // Pattern A: createTestEvent(db, { tenant_id, created_by, ... })
    const options = arg2 as Record<string, any>;
    tenantId = options.tenant_id;
    userId = options.created_by;
    venueId = options.venue_id || TEST_VENUE_ID;
    opts = options;
  }

  const eventId = opts.id || crypto.randomUUID();
  const slug = opts.slug || `test-event-${crypto.randomUUID().slice(0, 8)}`;

  await pool.query(
    `INSERT INTO events (id, tenant_id, venue_id, name, slug, description, status, event_type, created_by, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    [
      eventId,
      tenantId,
      venueId,
      opts.name || 'Test Event',
      slug,
      opts.description || 'Test event description',
      opts.status || 'DRAFT',
      opts.event_type || 'single',
      userId,
    ]
  );

  await pool.query(
    `INSERT INTO event_capacity (id, tenant_id, event_id, section_name, total_capacity, available_capacity, reserved_capacity, sold_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      crypto.randomUUID(),
      tenantId,
      eventId,
      opts.section_name || 'General Admission',
      opts.capacity || 100,
      opts.capacity || 100,
      0,
      0,
    ]
  );

  await pool.query(
    `INSERT INTO event_metadata (id, tenant_id, event_id) VALUES ($1, $2, $3)`,
    [crypto.randomUUID(), tenantId, eventId]
  );

  const result = await pool.query('SELECT * FROM events WHERE id = $1', [eventId]);
  return result.rows[0];
}

export async function createTestPricing(
  arg1: Knex | string,
  arg2: Record<string, any> | string,
  arg3?: string | Record<string, any>,
  arg4?: Record<string, any>
): Promise<any> {
  let tenantId: string;
  let eventId: string;
  let opts: Record<string, any>;

  if (typeof arg1 === 'string') {
    // Pattern B: createTestPricing(tenantId, eventId, overrides?)
    tenantId = arg1;
    eventId = arg2 as string;
    opts = (arg3 as Record<string, any>) || {};
  } else if (typeof arg2 === 'string') {
    // Pattern C: createTestPricing(db, eventId, tenantId, overrides?)
    eventId = arg2;
    tenantId = arg3 as string;
    opts = arg4 || {};
  } else {
    // Pattern A: createTestPricing(db, { tenant_id, event_id, ... })
    const options = arg2 as Record<string, any>;
    tenantId = options.tenant_id;
    eventId = options.event_id;
    opts = options;
  }

  const pricingId = opts.id || crypto.randomUUID();
  const basePrice = opts.base_price ?? (opts.base_price_cents ? opts.base_price_cents / 100 : 50.0);
  const currentPrice = opts.current_price ?? (opts.current_price_cents ? opts.current_price_cents / 100 : basePrice);

  await pool.query(
    `INSERT INTO event_pricing (id, tenant_id, event_id, name, base_price, current_price, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      pricingId,
      tenantId,
      eventId,
      opts.name || opts.tier_name || 'General Admission',
      basePrice,
      currentPrice,
      opts.is_active ?? true,
    ]
  );

  const result = await pool.query('SELECT * FROM event_pricing WHERE id = $1', [pricingId]);
  return result.rows[0];
}

export async function createTestCapacity(
  arg1: Knex | string,
  arg2: Record<string, any> | string,
  arg3?: string | Record<string, any>,
  arg4?: Record<string, any>
): Promise<any> {
  let tenantId: string;
  let eventId: string;
  let opts: Record<string, any>;

  if (typeof arg1 === 'string') {
    // Pattern B: createTestCapacity(tenantId, eventId, overrides?)
    tenantId = arg1;
    eventId = arg2 as string;
    opts = (arg3 as Record<string, any>) || {};
  } else if (typeof arg2 === 'string') {
    // Pattern C: createTestCapacity(db, eventId, tenantId, overrides?)
    eventId = arg2;
    tenantId = arg3 as string;
    opts = arg4 || {};
  } else {
    // Pattern A: createTestCapacity(db, { tenant_id, event_id, ... })
    const options = arg2 as Record<string, any>;
    tenantId = options.tenant_id;
    eventId = options.event_id;
    opts = options;
  }

  const capacityId = opts.id || crypto.randomUUID();

  await pool.query(
    `INSERT INTO event_capacity (id, tenant_id, event_id, section_name, total_capacity, available_capacity, reserved_capacity, sold_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      capacityId,
      tenantId,
      eventId,
      opts.section_name || 'Test Section',
      opts.total_capacity ?? 100,
      opts.available_capacity ?? opts.total_capacity ?? 100,
      opts.reserved_capacity ?? 0,
      opts.sold_count ?? 0,
    ]
  );

  const result = await pool.query('SELECT * FROM event_capacity WHERE id = $1', [capacityId]);
  return result.rows[0];
}

export async function createTestSchedule(
  arg1: Knex | string,
  arg2: Record<string, any> | string,
  arg3?: string | Record<string, any>,
  arg4?: Record<string, any>
): Promise<any> {
  let tenantId: string;
  let eventId: string;
  let opts: Record<string, any>;

  if (typeof arg1 === 'string') {
    tenantId = arg1;
    eventId = arg2 as string;
    opts = (arg3 as Record<string, any>) || {};
  } else if (typeof arg2 === 'string') {
    eventId = arg2;
    tenantId = arg3 as string;
    opts = arg4 || {};
  } else {
    const options = arg2 as Record<string, any>;
    tenantId = options.tenant_id;
    eventId = options.event_id;
    opts = options;
  }

  const scheduleId = opts.id || crypto.randomUUID();
  const startsAt = opts.starts_at || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const endsAt = opts.ends_at || new Date(startsAt.getTime() + 4 * 60 * 60 * 1000);

  await pool.query(
    `INSERT INTO event_schedules (id, tenant_id, event_id, starts_at, ends_at, timezone)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [scheduleId, tenantId, eventId, startsAt, endsAt, opts.timezone || 'UTC']
  );

  const result = await pool.query('SELECT * FROM event_schedules WHERE id = $1', [scheduleId]);
  return result.rows[0];
}

// ============================================================================
// EXPORTS
// ============================================================================

export { db, redis };

// ============================================================================
// GENERATE TEST TOKEN (flexible payload)
// ============================================================================

export function generateTestToken(payload: {
  sub: string;
  tenant_id?: string;
  type?: 'access' | 'refresh';
  email?: string;
  role?: string;
  permissions?: string[];
  exp?: number;
  iat?: number;
}): string {
  const tokenPayload = {
    sub: payload.sub,
    type: payload.type || 'access',
    jti: crypto.randomUUID(),
    tenant_id: payload.tenant_id,
    email: payload.email || `test-${payload.sub.slice(0, 8)}@example.com`,
    permissions: payload.permissions || ['*'],
    role: payload.role || 'organizer',
    iat: payload.iat || Math.floor(Date.now() / 1000),
    exp: payload.exp || Math.floor(Date.now() / 1000) + 3600,
  };

  return jwt.sign(tokenPayload, privateKey, {
    issuer: process.env.JWT_ISSUER || 'tickettoken',
    audience: process.env.JWT_AUDIENCE || 'tickettoken',
    algorithm: 'RS256',
    keyid: '1',
  });
}
