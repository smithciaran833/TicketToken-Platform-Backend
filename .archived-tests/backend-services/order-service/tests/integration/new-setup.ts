/**
 * Order Service Integration Test Setup
 *
 * Provides test infrastructure for order service integration tests.
 * Supports flexible patterns for creating test data.
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
import { createApp } from '../../src/app';
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
// TEST CONTEXT
// ============================================================================

export interface TestContext {
  app: FastifyInstance;
  db: Knex;
  redis: Redis;
  testTenantId: string;
  testUserId: string;
  testEventId: string;
}

const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000088';
const TEST_EVENT_ID = '00000000-0000-0000-0000-000000000099';

// ============================================================================
// SETUP & TEARDOWN
// ============================================================================

export async function setupTestApp(): Promise<TestContext> {
  const app = await createApp();
  await app.ready();

  await pool.query(
    `INSERT INTO tenants (id, name, slug, settings)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO NOTHING`,
    [TEST_TENANT_ID, 'Test Tenant', 'test-tenant', JSON.stringify({})]
  );

  await pool.query(
    `INSERT INTO users (id, email, password_hash, email_verified, status, role, tenant_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO NOTHING`,
    [TEST_USER_ID, 'test@example.com', '$2b$10$dummyhash', true, 'ACTIVE', 'customer', TEST_TENANT_ID]
  );

  // Create test event for orders
  await pool.query(
    `INSERT INTO events (id, tenant_id, name, slug, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO NOTHING`,
    [TEST_EVENT_ID, TEST_TENANT_ID, 'Test Event', 'test-event', 'PUBLISHED', TEST_USER_ID]
  );

  return {
    app,
    db,
    redis,
    testTenantId: TEST_TENANT_ID,
    testUserId: TEST_USER_ID,
    testEventId: TEST_EVENT_ID,
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
    await database.raw('DELETE FROM order_refunds').catch(() => {});
    await database.raw('DELETE FROM order_events').catch(() => {});
    await database.raw('DELETE FROM order_items').catch(() => {});
    await database.raw('DELETE FROM orders').catch(() => {});
    await clearRedisKeys();
  } catch (error) {
    console.warn('cleanDatabase warning:', error);
  }
}

export async function cleanupOrderData(): Promise<void> {
  try {
    await pool.query('DELETE FROM order_refunds').catch(() => {});
    await pool.query('DELETE FROM order_events').catch(() => {});
    await pool.query('DELETE FROM order_items').catch(() => {});
    await pool.query('DELETE FROM orders').catch(() => {});
    await clearRedisKeys();
  } catch (e) {
    console.warn('cleanupOrderData warning:', e);
  }
}

async function clearRedisKeys(): Promise<void> {
  const patterns = ['order:*', 'lock:*', 'idempotency:*', 'cache:*'];
  for (const pattern of patterns) {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }
}

export async function cleanRedis(redisClient: Redis): Promise<void> {
  const patterns = ['order:*', 'lock:*', 'idempotency:*', 'cache:*', 'audit:*'];
  for (const pattern of patterns) {
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(...keys);
    }
  }
}

// ============================================================================
// USER HELPERS
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
      role: 'customer',
      tenant_id: tid,
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
    userRole = roleOrTenantId || 'customer';
  } else {
    userId = tenantIdOrUserId;
    tenantId = roleOrTenantId!;
    userRole = role || 'customer';
  }

  const payload = {
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
// DATA HELPERS - Support flexible patterns
// ============================================================================

export async function createTestOrder(
  arg1: Knex | string,
  arg2: Record<string, any> | string,
  arg3?: string | Record<string, any>,
  arg4?: Record<string, any>
): Promise<any> {
  let tenantId: string;
  let userId: string;
  let eventId: string;
  let opts: Record<string, any>;

  if (typeof arg1 === 'string') {
    // Pattern B: createTestOrder(tenantId, userId, eventId, overrides?)
    tenantId = arg1;
    userId = arg2 as string;
    eventId = arg3 as string;
    opts = arg4 || {};
  } else if (typeof arg2 === 'string') {
    // Pattern C: createTestOrder(db, orderId, tenantId, overrides?)
    const orderId = arg2;
    tenantId = arg3 as string;
    opts = arg4 || {};
    opts.id = orderId;
    userId = opts.user_id || TEST_USER_ID;
    eventId = opts.event_id || TEST_EVENT_ID;
  } else {
    // Pattern A: createTestOrder(db, { tenant_id, user_id, ... })
    const options = arg2 as Record<string, any>;
    tenantId = options.tenant_id;
    userId = options.user_id;
    eventId = options.event_id || TEST_EVENT_ID;
    opts = options;
  }

  const orderId = opts.id || crypto.randomUUID();
  const totalCents = opts.total_cents || 5000; // $50.00
  const status = opts.status || 'PENDING';
  const expiresAt = opts.expires_at || new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  await pool.query(
    `INSERT INTO orders (id, tenant_id, user_id, event_id, status, total_cents, currency, expires_at, idempotency_key, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    [
      orderId,
      tenantId,
      userId,
      eventId,
      status,
      totalCents,
      opts.currency || 'USD',
      expiresAt,
      opts.idempotency_key || crypto.randomUUID(),
    ]
  );

  const result = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
  return result.rows[0];
}

export async function createTestOrderItem(
  arg1: Knex | string,
  arg2: Record<string, any> | string,
  arg3?: string | Record<string, any>,
  arg4?: Record<string, any>
): Promise<any> {
  let tenantId: string;
  let orderId: string;
  let opts: Record<string, any>;

  if (typeof arg1 === 'string') {
    // Pattern B: createTestOrderItem(tenantId, orderId, overrides?)
    tenantId = arg1;
    orderId = arg2 as string;
    opts = (arg3 as Record<string, any>) || {};
  } else if (typeof arg2 === 'string') {
    // Pattern C: createTestOrderItem(db, orderId, tenantId, overrides?)
    orderId = arg2;
    tenantId = arg3 as string;
    opts = arg4 || {};
  } else {
    // Pattern A: createTestOrderItem(db, { tenant_id, order_id, ... })
    const options = arg2 as Record<string, any>;
    tenantId = options.tenant_id;
    orderId = options.order_id;
    opts = options;
  }

  const itemId = opts.id || crypto.randomUUID();
  const ticketId = opts.ticket_id || crypto.randomUUID();
  const priceCents = opts.price_cents || 5000; // $50.00
  const quantity = opts.quantity || 1;

  await pool.query(
    `INSERT INTO order_items (id, tenant_id, order_id, ticket_id, ticket_type, price_cents, quantity, subtotal_cents)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      itemId,
      tenantId,
      orderId,
      ticketId,
      opts.ticket_type || 'GENERAL_ADMISSION',
      priceCents,
      quantity,
      priceCents * quantity,
    ]
  );

  const result = await pool.query('SELECT * FROM order_items WHERE id = $1', [itemId]);
  return result.rows[0];
}

export async function createTestOrderEvent(
  arg1: Knex | string,
  arg2: Record<string, any> | string,
  arg3?: string | Record<string, any>,
  arg4?: Record<string, any>
): Promise<any> {
  let tenantId: string;
  let orderId: string;
  let opts: Record<string, any>;

  if (typeof arg1 === 'string') {
    tenantId = arg1;
    orderId = arg2 as string;
    opts = (arg3 as Record<string, any>) || {};
  } else if (typeof arg2 === 'string') {
    orderId = arg2;
    tenantId = arg3 as string;
    opts = arg4 || {};
  } else {
    const options = arg2 as Record<string, any>;
    tenantId = options.tenant_id;
    orderId = options.order_id;
    opts = options;
  }

  const eventId = opts.id || crypto.randomUUID();

  await pool.query(
    `INSERT INTO order_events (id, tenant_id, order_id, event_type, event_data, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [
      eventId,
      tenantId,
      orderId,
      opts.event_type || 'ORDER_CREATED',
      JSON.stringify(opts.event_data || {}),
    ]
  );

  const result = await pool.query('SELECT * FROM order_events WHERE id = $1', [eventId]);
  return result.rows[0];
}

export async function createTestOrderRefund(
  arg1: Knex | string,
  arg2: Record<string, any> | string,
  arg3?: string | Record<string, any>,
  arg4?: Record<string, any>
): Promise<any> {
  let tenantId: string;
  let orderId: string;
  let opts: Record<string, any>;

  if (typeof arg1 === 'string') {
    tenantId = arg1;
    orderId = arg2 as string;
    opts = (arg3 as Record<string, any>) || {};
  } else if (typeof arg2 === 'string') {
    orderId = arg2;
    tenantId = arg3 as string;
    opts = arg4 || {};
  } else {
    const options = arg2 as Record<string, any>;
    tenantId = options.tenant_id;
    orderId = options.order_id;
    opts = options;
  }

  const refundId = opts.id || crypto.randomUUID();
  const amountCents = opts.amount_cents || 5000; // $50.00

  await pool.query(
    `INSERT INTO order_refunds (id, tenant_id, order_id, amount_cents, reason, status, refund_method, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
    [
      refundId,
      tenantId,
      orderId,
      amountCents,
      opts.reason || 'Customer requested',
      opts.status || 'PENDING',
      opts.refund_method || 'ORIGINAL_PAYMENT',
    ]
  );

  const result = await pool.query('SELECT * FROM order_refunds WHERE id = $1', [refundId]);
  return result.rows[0];
}

// ============================================================================
// EXPORTS
// ============================================================================

export { db, redis };
