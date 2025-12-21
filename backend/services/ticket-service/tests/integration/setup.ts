/**
 * Ticket Service Integration Test Setup
 *
 * Mirrors event-service setup pattern for consistency.
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
  testEventId: string;
  testVenueId: string;
}

export const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
export const TEST_USER_ID = '00000000-0000-0000-0000-000000000088';
export const TEST_VENUE_ID = '00000000-0000-0000-0000-000000000077';
export const TEST_EVENT_ID = '00000000-0000-0000-0000-000000000066';

// ============================================================================
// SETUP & TEARDOWN
// ============================================================================

export async function setupTestApp(): Promise<TestContext> {
  const app = await buildApp();
  await app.ready();

  // 1. Ensure tenant exists
  await pool.query(
    `INSERT INTO tenants (id, name, slug, settings)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO NOTHING`,
    [TEST_TENANT_ID, 'Test Tenant', 'test-tenant', JSON.stringify({})]
  );

  // 2. Ensure test user exists
  await pool.query(
    `INSERT INTO users (id, email, password_hash, email_verified, status, role, tenant_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO NOTHING`,
    [TEST_USER_ID, 'test@example.com', '$2b$10$dummyhash', true, 'ACTIVE', 'organizer', TEST_TENANT_ID]
  );

  // 3. Ensure test venue exists (with all required columns)
  await pool.query(
    `INSERT INTO venues (id, tenant_id, name, slug, email, address_line1, city, state_province, country_code, venue_type, max_capacity, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (id) DO NOTHING`,
    [TEST_VENUE_ID, TEST_TENANT_ID, 'Test Venue', 'test-venue', 'venue@test.com', '123 Test St', 'Test City', 'TS', 'US', 'theater', 1000, TEST_USER_ID]
  );

  // 4. Ensure test event exists
  await pool.query(
    `INSERT INTO events (id, tenant_id, venue_id, name, slug, status, created_by, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    [TEST_EVENT_ID, TEST_TENANT_ID, TEST_VENUE_ID, 'Test Event', 'test-event', 'PUBLISHED', TEST_USER_ID]
  );

  return {
    app,
    db,
    redis,
    testTenantId: TEST_TENANT_ID,
    testUserId: TEST_USER_ID,
    testEventId: TEST_EVENT_ID,
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
    // Delete in reverse dependency order
    await database.raw('DELETE FROM ticket_notifications WHERE tenant_id = ?', [TEST_TENANT_ID]).catch(() => {});
    await database.raw('DELETE FROM ticket_audit_log WHERE tenant_id = ?', [TEST_TENANT_ID]).catch(() => {});
    await database.raw('DELETE FROM ticket_bundle_items WHERE bundle_id IN (SELECT id FROM ticket_bundles WHERE tenant_id = ?)', [TEST_TENANT_ID]).catch(() => {});
    await database.raw('DELETE FROM ticket_bundles WHERE tenant_id = ?', [TEST_TENANT_ID]).catch(() => {});
    await database.raw('DELETE FROM ticket_holds WHERE tenant_id = ?', [TEST_TENANT_ID]).catch(() => {});
    await database.raw('DELETE FROM ticket_price_history WHERE ticket_type_id IN (SELECT id FROM ticket_types WHERE tenant_id = ?)', [TEST_TENANT_ID]).catch(() => {});
    await database.raw('DELETE FROM waitlist WHERE tenant_id = ?', [TEST_TENANT_ID]).catch(() => {});
    await database.raw('DELETE FROM refunds WHERE order_id IN (SELECT id FROM orders WHERE tenant_id = ?)', [TEST_TENANT_ID]).catch(() => {});
    await database.raw('DELETE FROM ticket_validations WHERE ticket_id IN (SELECT id FROM tickets WHERE tenant_id = ?)', [TEST_TENANT_ID]).catch(() => {});
    await database.raw('DELETE FROM ticket_transfers WHERE tenant_id = ?', [TEST_TENANT_ID]).catch(() => {});
    await database.raw('DELETE FROM tickets WHERE tenant_id = ?', [TEST_TENANT_ID]).catch(() => {});
    await database.raw('DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE tenant_id = ?)', [TEST_TENANT_ID]).catch(() => {});
    await database.raw('DELETE FROM orders WHERE tenant_id = ?', [TEST_TENANT_ID]).catch(() => {});
    await database.raw('DELETE FROM reservations WHERE tenant_id = ?', [TEST_TENANT_ID]).catch(() => {});
    await database.raw('DELETE FROM discounts WHERE tenant_id = ?', [TEST_TENANT_ID]).catch(() => {});
    await database.raw('DELETE FROM ticket_types WHERE tenant_id = ?', [TEST_TENANT_ID]).catch(() => {});
    await clearRedisKeys();
  } catch (error) {
    console.warn('cleanDatabase warning:', error);
  }
}

async function clearRedisKeys(): Promise<void> {
  const patterns = ['ticket:*', 'reservation:*', 'inventory:*', 'lock:*', 'cache:*', 'qr:*', 'ratelimit:*', 'idempotency:*'];
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
// USER/TENANT HELPERS
// ============================================================================

export async function ensureTestTenant(
  database: Knex,
  tenantId: string,
  name?: string
): Promise<void> {
  const exists = await database('tenants').where({ id: tenantId }).first();
  if (!exists) {
    await database('tenants').insert({
      id: tenantId,
      name: name || 'Test Tenant',
      slug: `test-tenant-${tenantId.slice(0, 8)}`,
      settings: JSON.stringify({}),
    });
  }
}

export async function ensureTestUser(
  database: Knex,
  userId: string,
  email?: string,
  tenantId?: string
): Promise<void> {
  const tid = tenantId || TEST_TENANT_ID;
  await ensureTestTenant(database, tid);

  const exists = await database('users').where({ id: userId }).first();
  if (!exists) {
    await database('users').insert({
      id: userId,
      email: email || `test-${userId.slice(0, 8)}@example.com`,
      password_hash: '$2b$10$dummyhashfortesting',
      email_verified: true,
      status: 'ACTIVE',
      role: 'organizer',
      tenant_id: tid,
    });
  }
}

export async function ensureTestEvent(
  database: Knex,
  eventId: string,
  tenantId?: string,
  venueId?: string,
  createdBy?: string
): Promise<void> {
  const tid = tenantId || TEST_TENANT_ID;
  const vid = venueId || TEST_VENUE_ID;
  const uid = createdBy || TEST_USER_ID;

  const exists = await database('events').where({ id: eventId }).first();
  if (!exists) {
    await database('events').insert({
      id: eventId,
      tenant_id: tid,
      venue_id: vid,
      name: 'Test Event',
      slug: `test-event-${eventId.slice(0, 8)}`,
      status: 'PUBLISHED',
      created_by: uid,
    });
  }
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
    permissions: userRole === 'admin' ? ['*'] : ['buy:tickets', 'view:events', 'transfer:tickets'],
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
// DATA HELPERS
// ============================================================================

export async function createTestTicketType(
  database: Knex,
  options: {
    tenant_id?: string;
    event_id?: string;
    name?: string;
    price?: number;
    quantity?: number;
    available_quantity?: number;
  }
): Promise<any> {
  const id = crypto.randomUUID();
  const tenantId = options.tenant_id || TEST_TENANT_ID;
  const eventId = options.event_id || TEST_EVENT_ID;
  const quantity = options.quantity ?? 100;

  await pool.query(
    `INSERT INTO ticket_types (
      id, tenant_id, event_id, name, price, quantity, available_quantity,
      sold_quantity, reserved_quantity, min_purchase, max_purchase,
      sale_start, sale_end, is_active
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      id,
      tenantId,
      eventId,
      options.name || 'General Admission',
      options.price ?? 50.00,
      quantity,
      options.available_quantity ?? quantity,
      0, // sold_quantity
      0, // reserved_quantity
      1, // min_purchase
      10, // max_purchase
      new Date(), // sale_start
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // sale_end (30 days)
      true,
    ]
  );

  const result = await pool.query('SELECT * FROM ticket_types WHERE id = $1', [id]);
  return result.rows[0];
}

export async function createTestTicket(
  database: Knex,
  options: {
    tenant_id?: string;
    event_id?: string;
    ticket_type_id: string;
    user_id?: string;
    status?: string;
  }
): Promise<any> {
  const id = crypto.randomUUID();
  const ticketNumber = `TKT-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  // Normalize status to lowercase (schema only allows lowercase)
  let status = options.status || 'active';
  status = status.toLowerCase();

  // Map invalid statuses to valid ones
  if (status === 'sold') {
    status = 'active';
  }

  await pool.query(
    `INSERT INTO tickets (
      id, tenant_id, event_id, ticket_type_id, user_id,
      ticket_number, qr_code, status, is_transferable, transfer_count
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      id,
      options.tenant_id || TEST_TENANT_ID,
      options.event_id || TEST_EVENT_ID,
      options.ticket_type_id,
      options.user_id || TEST_USER_ID,
      ticketNumber,
      `QR-${ticketNumber}`,
      status,
      true,
      0,
    ]
  );

  const result = await pool.query('SELECT * FROM tickets WHERE id = $1', [id]);
  return result.rows[0];
}

export async function createTestReservation(
  database: Knex,
  options: {
    tenant_id?: string;
    event_id?: string;
    ticket_type_id: string;
    user_id?: string;
    quantity?: number;
    status?: string;
    expires_at?: Date;
  }
): Promise<any> {
  const id = crypto.randomUUID();
  const quantity = options.quantity ?? 2;

  await pool.query(
    `INSERT INTO reservations (
      id, tenant_id, event_id, ticket_type_id, user_id,
      quantity, total_quantity, tickets, status, expires_at, type_name
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      id,
      options.tenant_id || TEST_TENANT_ID,
      options.event_id || TEST_EVENT_ID,
      options.ticket_type_id,
      options.user_id || TEST_USER_ID,
      quantity,
      quantity,
      JSON.stringify([{ ticketTypeId: options.ticket_type_id, quantity }]),
      options.status || 'pending',
      options.expires_at || new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      'General Admission',
    ]
  );

  const result = await pool.query('SELECT * FROM reservations WHERE id = $1', [id]);
  return result.rows[0];
}

export async function createTestOrder(
  database: Knex,
  options: {
    tenant_id?: string;
    event_id?: string;
    user_id?: string;
    status?: string;
    total_cents?: number;
  }
): Promise<any> {
  const id = crypto.randomUUID();
  const orderNumber = `ORD-${Date.now().toString().slice(-8)}`;

  await pool.query(
    `INSERT INTO orders (
      id, tenant_id, user_id, event_id, order_number,
      status, subtotal_cents, platform_fee_cents, processing_fee_cents,
      tax_cents, discount_cents, total_cents, ticket_quantity, currency
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      id,
      options.tenant_id || TEST_TENANT_ID,
      options.user_id || TEST_USER_ID,
      options.event_id || TEST_EVENT_ID,
      orderNumber,
      options.status || 'PENDING',
      options.total_cents ?? 5000,
      375,
      145,
      0,
      0,
      options.total_cents ?? 5520,
      1,
      'USD',
    ]
  );

  const result = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
  return result.rows[0];
}

export async function createTestTransfer(
  database: Knex,
  options: {
    tenant_id?: string;
    ticket_id: string;
    from_user_id?: string;
    to_email: string;
    status?: string;
  }
): Promise<any> {
  const id = crypto.randomUUID();
  const acceptanceCode = crypto.randomBytes(6).toString('hex').toUpperCase();

  await pool.query(
    `INSERT INTO ticket_transfers (
      id, tenant_id, ticket_id, from_user_id, to_email,
      transfer_method, status, acceptance_code, is_gift, expires_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      id,
      options.tenant_id || TEST_TENANT_ID,
      options.ticket_id,
      options.from_user_id || TEST_USER_ID,
      options.to_email,
      'email',
      options.status || 'pending',
      acceptanceCode,
      true,
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    ]
  );

  const result = await pool.query('SELECT * FROM ticket_transfers WHERE id = $1', [id]);
  return result.rows[0];
}

// ============================================================================
// EXPORTS
// ============================================================================

export { db, redis };
