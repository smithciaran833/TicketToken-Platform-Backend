/**
 * Payment Service Integration Test Setup
 */

import { config } from 'dotenv';
import { resolve } from 'path';

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

const redisPassword = process.env.REDIS_PASSWORD;

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: redisPassword && redisPassword.length > 0 ? redisPassword : undefined,
  maxRetriesPerRequest: 3,
});

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

export interface TestContext {
  app: FastifyInstance;
  db: Knex;
  redis: Redis;
  testTenantId: string;
  testUserId: string;
  testVenueId: string;
  testEventId: string;
  testOrderId: string;
}

const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000088';
const TEST_VENUE_ID = '00000000-0000-0000-0000-000000000077';
const TEST_EVENT_ID = '00000000-0000-0000-0000-000000000066';
const TEST_ORDER_ID = '00000000-0000-0000-0000-000000000055';

export async function setupTestApp(): Promise<TestContext> {
  const app = await buildApp();
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
    [TEST_USER_ID, 'test@example.com', '$2b$10$dummyhash', true, 'ACTIVE', 'organizer', TEST_TENANT_ID]
  );

  await pool.query(
    `INSERT INTO venues (id, name, slug, created_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO NOTHING`,
    [TEST_VENUE_ID, 'Test Venue', 'test-venue', TEST_USER_ID]
  );

  await pool.query(
    `INSERT INTO events (id, tenant_id, venue_id, name, slug, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO NOTHING`,
    [TEST_EVENT_ID, TEST_TENANT_ID, TEST_VENUE_ID, 'Test Event', 'test-event', 'PUBLISHED', TEST_USER_ID]
  );

  await pool.query(
    `INSERT INTO orders (id, tenant_id, user_id, event_id, order_number, status, subtotal_cents, total_cents, ticket_quantity)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (id) DO NOTHING`,
    [TEST_ORDER_ID, TEST_TENANT_ID, TEST_USER_ID, TEST_EVENT_ID, 'TEST-ORDER-001', 'PENDING', 10000, 10000, 2]
  );

  return {
    app,
    db,
    redis,
    testTenantId: TEST_TENANT_ID,
    testUserId: TEST_USER_ID,
    testVenueId: TEST_VENUE_ID,
    testEventId: TEST_EVENT_ID,
    testOrderId: TEST_ORDER_ID,
  };
}

export async function teardownTestApp(context: { app?: FastifyInstance; db?: Knex; redis?: Redis }): Promise<void> {
  try { if (context?.app) await context.app.close(); } catch (e) { /* ignore */ }
  try { await db.destroy(); } catch (e) { /* ignore */ }
  try { await pool.end(); } catch (e) { /* ignore */ }
  try { await redis.quit(); } catch (e) { /* ignore */ }
}

export async function cleanDatabase(database: Knex): Promise<void> {
  try {
    await database.raw('DELETE FROM payment_retries').catch(() => {});
    await database.raw('DELETE FROM settlement_batches').catch(() => {});
    await database.raw('DELETE FROM reconciliation_reports').catch(() => {});
    await database.raw('DELETE FROM payment_idempotency').catch(() => {});
    await database.raw('DELETE FROM webhook_events').catch(() => {});
    await database.raw('DELETE FROM webhook_inbox').catch(() => {});
    await database.raw('DELETE FROM payment_state_transitions').catch(() => {});
    await database.raw('DELETE FROM payment_event_sequence').catch(() => {});
    await database.raw('DELETE FROM nft_mint_queue').catch(() => {});
    await database.raw('DELETE FROM waiting_room_activity').catch(() => {});
    await database.raw('DELETE FROM scalper_reports').catch(() => {});
    await database.raw('DELETE FROM account_takeover_signals').catch(() => {});
    await database.raw('DELETE FROM ml_fraud_predictions').catch(() => {});
    await database.raw('DELETE FROM fraud_review_queue').catch(() => {});
    await database.raw('DELETE FROM fraud_checks').catch(() => {});
    await database.raw('DELETE FROM device_activity').catch(() => {});
    await database.raw('DELETE FROM bot_detections').catch(() => {});
    await database.raw('DELETE FROM known_scalpers').catch(() => {});
    await database.raw('DELETE FROM user_tax_info').catch(() => {});
    await database.raw('DELETE FROM tax_forms_1099da').catch(() => {});
    await database.raw('DELETE FROM tax_collections').catch(() => {});
    await database.raw('DELETE FROM group_payment_members').catch(() => {});
    await database.raw('DELETE FROM group_payments').catch(() => {});
    await database.raw('DELETE FROM royalty_discrepancies').catch(() => {});
    await database.raw('DELETE FROM royalty_payouts').catch(() => {});
    await database.raw('DELETE FROM royalty_distributions').catch(() => {});
    await database.raw('DELETE FROM payment_refunds').catch(() => {});
    await database.raw('DELETE FROM payment_intents').catch(() => {});
    await database.raw('DELETE FROM venue_balances').catch(() => {});
    await database.raw('DELETE FROM payment_transactions').catch(() => {});
    await clearRedisKeys();
  } catch (error) {
    console.warn('cleanDatabase warning:', error);
  }
}

export async function cleanupPaymentData(): Promise<void> {
  try {
    await pool.query('DELETE FROM payment_retries').catch(() => {});
    await pool.query('DELETE FROM webhook_events').catch(() => {});
    await pool.query('DELETE FROM webhook_inbox').catch(() => {});
    await pool.query('DELETE FROM payment_state_transitions').catch(() => {});
    await pool.query('DELETE FROM fraud_checks').catch(() => {});
    await pool.query('DELETE FROM group_payment_members').catch(() => {});
    await pool.query('DELETE FROM group_payments').catch(() => {});
    await pool.query('DELETE FROM royalty_distributions').catch(() => {});
    await pool.query('DELETE FROM payment_refunds').catch(() => {});
    await pool.query('DELETE FROM payment_intents').catch(() => {});
    await pool.query('DELETE FROM payment_transactions').catch(() => {});
    await clearRedisKeys();
  } catch (e) {
    console.warn('cleanupPaymentData warning:', e);
  }
}

async function clearRedisKeys(): Promise<void> {
  const patterns = ['payment:*', 'idempotency:*', 'webhook:*', 'fraud:*', 'rate:*'];
  for (const pattern of patterns) {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }
}

export async function cleanRedis(redisClient: Redis): Promise<void> {
  const patterns = ['payment:*', 'idempotency:*', 'webhook:*', 'fraud:*', 'rate:*', 'lock:*'];
  for (const pattern of patterns) {
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(...keys);
    }
  }
}

export async function ensureTestTenant(database: Knex, tenantId: string, name?: string): Promise<void> {
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

export async function ensureTestUser(database: Knex, userId: string, email?: string, tenantId?: string): Promise<void> {
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

export async function ensureTestVenue(database: Knex, venueId: string, createdBy: string, name?: string): Promise<void> {
  const exists = await database('venues').where({ id: venueId }).first();
  if (!exists) {
    await database('venues').insert({
      id: venueId,
      name: name || 'Test Venue',
      slug: `test-venue-${venueId.slice(0, 8)}`,
      created_by: createdBy,
    });
  }
}

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

export async function createTestPaymentIntent(
  tenantId: string,
  orderId: string,
  venueId: string,
  opts: Record<string, any> = {}
): Promise<any> {
  const id = opts.id || crypto.randomUUID();
  const amount = opts.amount ?? 100.00;
  const stripeIntentId = opts.stripe_intent_id || `pi_test_${crypto.randomUUID().slice(0, 8)}`;

  await pool.query(
    `INSERT INTO payment_intents
     (id, order_id, venue_id, tenant_id, amount, currency, status, stripe_intent_id, client_secret, processor)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [id, orderId, venueId, tenantId, amount, opts.currency || 'USD', opts.status || 'pending',
     stripeIntentId, opts.client_secret || `${stripeIntentId}_secret_test`, opts.processor || 'stripe']
  );

  const result = await pool.query('SELECT * FROM payment_intents WHERE id = $1', [id]);
  return result.rows[0];
}

export async function createTestPaymentTransaction(
  tenantId: string,
  userId: string,
  venueId: string,
  eventId: string,
  opts: Record<string, any> = {}
): Promise<any> {
  const id = opts.id || crypto.randomUUID();
  const amount = opts.amount ?? 100.00;
  const platformFee = opts.platform_fee ?? (amount * 0.05);
  const venuePayout = opts.venue_payout ?? (amount - platformFee);

  await pool.query(
    `INSERT INTO payment_transactions
     (id, tenant_id, user_id, venue_id, event_id, type, amount, currency, status,
      platform_fee, venue_payout, stripe_payment_intent_id, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [id, tenantId, userId, venueId, eventId, opts.type || 'ticket_purchase', amount,
     opts.currency || 'USD', opts.status || 'completed', platformFee, venuePayout,
     opts.stripe_payment_intent_id || `pi_test_${crypto.randomUUID().slice(0, 8)}`, opts.idempotency_key || null]
  );

  const result = await pool.query('SELECT * FROM payment_transactions WHERE id = $1', [id]);
  return result.rows[0];
}

export async function createTestRefund(
  transactionId: string,
  tenantId: string,
  opts: Record<string, any> = {}
): Promise<any> {
  const id = opts.id || crypto.randomUUID();
  const amount = opts.amount ?? 50.00;

  await pool.query(
    `INSERT INTO payment_refunds
     (id, transaction_id, tenant_id, amount, reason, status, stripe_refund_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, transactionId, tenantId, amount, opts.reason || 'Customer request',
     opts.status || 'pending', opts.stripe_refund_id || `re_test_${crypto.randomUUID().slice(0, 8)}`]
  );

  const result = await pool.query('SELECT * FROM payment_refunds WHERE id = $1', [id]);
  return result.rows[0];
}

export async function createTestVenueBalance(venueId: string, opts: Record<string, any> = {}): Promise<any> {
  const id = opts.id || crypto.randomUUID();

  await pool.query(
    `INSERT INTO venue_balances
     (id, venue_id, balance_type, amount, currency)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (venue_id, balance_type) DO UPDATE SET amount = EXCLUDED.amount`,
    [id, venueId, opts.balance_type || 'available', opts.amount ?? 1000.00, opts.currency || 'USD']
  );

  const result = await pool.query(
    'SELECT * FROM venue_balances WHERE venue_id = $1 AND balance_type = $2',
    [venueId, opts.balance_type || 'available']
  );
  return result.rows[0];
}

export async function createTestGroupPayment(
  organizerId: string,
  eventId: string,
  opts: Record<string, any> = {}
): Promise<any> {
  const id = opts.id || crypto.randomUUID();

  await pool.query(
    `INSERT INTO group_payments
     (id, organizer_id, event_id, total_amount, ticket_selections, status, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, organizerId, eventId, opts.total_amount ?? 400.00,
     JSON.stringify(opts.ticket_selections || [{ tier: 'GA', quantity: 4, price: 100 }]),
     opts.status || 'collecting', opts.expires_at || new Date(Date.now() + 24 * 60 * 60 * 1000)]
  );

  const result = await pool.query('SELECT * FROM group_payments WHERE id = $1', [id]);
  return result.rows[0];
}

export async function createTestGroupMember(
  groupPaymentId: string,
  opts: Record<string, any> = {}
): Promise<any> {
  const id = opts.id || crypto.randomUUID();

  await pool.query(
    `INSERT INTO group_payment_members
     (id, group_payment_id, user_id, email, name, amount_due, ticket_count, paid, status, reminders_sent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [id, groupPaymentId, opts.user_id || null, opts.email || 'member@example.com',
     opts.name || 'Test Member', opts.amount_due ?? 100.00, opts.ticket_count ?? 1,
     opts.paid ?? false, opts.status || 'pending', opts.reminders_sent ?? 0]
  );

  const result = await pool.query('SELECT * FROM group_payment_members WHERE id = $1', [id]);
  return result.rows[0];
}

export async function createTestWebhookEvent(
  provider: string,
  eventType: string,
  payload: Record<string, any>,
  opts: Record<string, any> = {}
): Promise<any> {
  const id = opts.id || crypto.randomUUID();
  const eventId = opts.event_id || `evt_test_${crypto.randomUUID().slice(0, 8)}`;

  await pool.query(
    `INSERT INTO webhook_inbox
     (id, provider, event_id, event_type, payload, status, tenant_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, provider, eventId, eventType, JSON.stringify(payload), opts.status || 'pending', opts.tenant_id || null]
  );

  const result = await pool.query('SELECT * FROM webhook_inbox WHERE id = $1', [id]);
  return result.rows[0];
}

export async function createTestFraudCheck(userId: string, opts: Record<string, any> = {}): Promise<any> {
  const id = opts.id || crypto.randomUUID();

  await pool.query(
    `INSERT INTO fraud_checks
     (id, user_id, payment_id, device_fingerprint, decision, risk_score, check_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, userId, opts.payment_id || null,
     opts.device_fingerprint || `fp_test_${crypto.randomUUID().slice(0, 8)}`,
     opts.decision || 'approve', opts.risk_score ?? 0.15, opts.check_type || 'purchase']
  );

  const result = await pool.query('SELECT * FROM fraud_checks WHERE id = $1', [id]);
  return result.rows[0];
}

export async function createTestOrder(
  tenantId: string,
  userId: string,
  eventId: string,
  opts: Record<string, any> = {}
): Promise<any> {
  const id = opts.id || crypto.randomUUID();
  const orderNumber = opts.order_number || `ORD-${Date.now().toString().slice(-8)}`;

  await pool.query(
    `INSERT INTO orders (id, tenant_id, user_id, event_id, order_number, status, subtotal_cents, total_cents, ticket_quantity)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (id) DO NOTHING`,
    [id, tenantId, userId, eventId, orderNumber, opts.status || 'PENDING',
     opts.subtotal_cents ?? 10000, opts.total_cents ?? 10000, opts.ticket_quantity ?? 2]
  );

  const result = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
  return result.rows[0];
}

export function createMockStripeWebhookPayload(
  type: string,
  data: Record<string, any>
): { body: string; signature: string } {
  const payload = {
    id: `evt_test_${crypto.randomUUID().slice(0, 8)}`,
    object: 'event',
    type,
    data: { object: data },
    created: Math.floor(Date.now() / 1000),
    livemode: false,
  };

  return {
    body: JSON.stringify(payload),
    signature: 't=12345,v1=fake_signature_for_testing',
  };
}

export { db, redis };
