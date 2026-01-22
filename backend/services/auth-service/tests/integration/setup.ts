import path from 'path';
import dotenv from 'dotenv';

// Load test environment FIRST
dotenv.config({ path: path.join(__dirname, '../../.env.test') });

import { Pool } from 'pg';
import Redis from 'ioredis';
import { initRedis, closeRedisConnections } from '../../src/config/redis';

// Test database pool (separate from app's pool, for direct DB queries in tests)
// Increased pool size to handle parallel test execution
export const testPool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'tickettoken_test',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: 20, // Increased from 5 to handle parallel tests
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Test Redis client (separate from app's Redis, for direct Redis queries in tests)
export const testRedis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '1'),
  maxRetriesPerRequest: 3,
});

// Default tenant ID from migration
export const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';

// Initialize app's Redis (call this before buildApp)
export async function initAppRedis(): Promise<void> {
  await initRedis();
}

// Clean up tables between tests (order matters due to foreign keys)
export async function cleanupDatabase(): Promise<void> {
  const tables = [
    'audit_logs',
    'user_addresses',
    'trusted_devices',
    'biometric_credentials',
    'wallet_connections',
    'oauth_connections',
    'token_refresh_log',
    'invalidated_tokens',
    'user_venue_roles',
    'user_sessions',
    'users',
    // Don't delete tenants - we need the default one
  ];

  for (const table of tables) {
    try {
      await testPool.query(`TRUNCATE TABLE ${table} CASCADE`);
    } catch (e: any) {
      // Ignore errors if table doesn't exist
      if (e.code !== '42P01') {
        throw e;
      }
    }
  }
}

// Clean up Redis between tests
export async function cleanupRedis(): Promise<void> {
  try {
    await testRedis.flushdb();
  } catch (e) {
    // Ignore Redis cleanup errors in tests
  }
}

// Full cleanup
export async function cleanupAll(): Promise<void> {
  await cleanupDatabase();
  await cleanupRedis();
}

// Close connections after all tests
export async function closeConnections(): Promise<void> {
  // Close test pool
  try {
    await testPool.end();
  } catch (e) {
    // Ignore errors during cleanup
  }

  // Close test Redis
  try {
    await testRedis.quit();
  } catch (e) {
    // Ignore errors during cleanup
  }

  // Close app's Redis connections
  try {
    await closeRedisConnections();
  } catch (e) {
    // Ignore errors during cleanup
  }

  // Close app's database pool
  try {
    const { pool } = await import('../../src/config/database');
    await pool.end();
  } catch (e) {
    // Ignore errors during cleanup
  }
}

// Test user factory
export function createTestUser(overrides: Partial<any> = {}) {
  const timestamp = Date.now();
  return {
    email: `test-${timestamp}@example.com`,
    password: 'TestPassword123!',
    firstName: 'Test',
    lastName: 'User',
    tenant_id: TEST_TENANT_ID,
    ...overrides,
  };
}
