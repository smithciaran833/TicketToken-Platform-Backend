/**
 * Test Database Configuration
 * 
 * AUDIT FIX: TST-M2 - No test database config
 * 
 * Provides isolated test database configuration with proper cleanup
 */
import knex, { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';

// =============================================================================
// TYPES
// =============================================================================

export interface TestDatabaseConfig {
  client: 'postgresql';
  connection: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
  };
  pool: {
    min: number;
    max: number;
  };
  migrations: {
    directory: string;
    tableName: string;
  };
  seeds?: {
    directory: string;
  };
}

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Get test database configuration
 */
export function getTestDatabaseConfig(): TestDatabaseConfig {
  return {
    client: 'postgresql',
    connection: {
      host: process.env.TEST_DB_HOST || 'localhost',
      port: parseInt(process.env.TEST_DB_PORT || '5432', 10),
      user: process.env.TEST_DB_USER || 'postgres',
      password: process.env.TEST_DB_PASSWORD || 'postgres',
      database: process.env.TEST_DB_NAME || 'compliance_test'
    },
    pool: {
      min: 1,
      max: 5
    },
    migrations: {
      directory: '../migrations',
      tableName: 'knex_migrations'
    },
    seeds: {
      directory: './seeds'
    }
  };
}

// =============================================================================
// TEST DATABASE MANAGER
// =============================================================================

let testDb: Knex | null = null;

/**
 * Create and connect to test database
 */
export async function createTestDatabase(): Promise<Knex> {
  const config = getTestDatabaseConfig();
  
  // First connect to postgres to create test database
  const adminConfig = {
    ...config,
    connection: {
      ...config.connection,
      database: 'postgres'
    }
  };
  
  const adminDb = knex(adminConfig);
  
  try {
    // Check if test database exists
    const result = await adminDb.raw(
      `SELECT 1 FROM pg_database WHERE datname = ?`,
      [config.connection.database]
    );
    
    // Create database if it doesn't exist
    if (result.rows.length === 0) {
      await adminDb.raw(`CREATE DATABASE ${config.connection.database}`);
      console.log(`Created test database: ${config.connection.database}`);
    }
  } finally {
    await adminDb.destroy();
  }
  
  // Connect to test database
  testDb = knex(config);
  
  // Run migrations
  await testDb.migrate.latest();
  
  return testDb;
}

/**
 * Get existing test database connection
 */
export function getTestDatabase(): Knex {
  if (!testDb) {
    throw new Error('Test database not initialized. Call createTestDatabase() first.');
  }
  return testDb;
}

/**
 * Destroy test database connection
 */
export async function destroyTestDatabase(): Promise<void> {
  if (testDb) {
    await testDb.destroy();
    testDb = null;
  }
}

/**
 * Clean up test database (truncate all tables)
 */
export async function cleanupTestDatabase(): Promise<void> {
  if (!testDb) {
    return;
  }
  
  // Get all tables except migrations
  const tables = await testDb.raw(`
    SELECT tablename FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename NOT LIKE 'knex_%'
  `);
  
  // Disable triggers and truncate
  for (const { tablename } of tables.rows) {
    await testDb.raw(`TRUNCATE TABLE "${tablename}" CASCADE`);
  }
}

/**
 * Reset database to clean state with fresh migrations
 */
export async function resetTestDatabase(): Promise<void> {
  if (!testDb) {
    await createTestDatabase();
    return;
  }
  
  // Rollback all migrations
  await testDb.migrate.rollback(undefined, true);
  
  // Run all migrations again
  await testDb.migrate.latest();
}

// =============================================================================
// TEST TENANT ISOLATION
// =============================================================================

/**
 * Set up RLS context for test tenant
 */
export async function setupTestTenant(tenantId: string): Promise<void> {
  const db = getTestDatabase();
  await db.raw(`SET app.current_tenant_id = ?`, [tenantId]);
}

/**
 * Clear RLS context
 */
export async function clearTestTenant(): Promise<void> {
  const db = getTestDatabase();
  await db.raw(`RESET app.current_tenant_id`);
}

/**
 * Create isolated test transaction
 */
export async function withTestTransaction<T>(
  tenantId: string,
  callback: (trx: Knex.Transaction) => Promise<T>
): Promise<T> {
  const db = getTestDatabase();
  
  return db.transaction(async (trx) => {
    // Set tenant context
    await trx.raw(`SET app.current_tenant_id = ?`, [tenantId]);
    
    try {
      return await callback(trx);
    } finally {
      // Clear tenant context
      await trx.raw(`RESET app.current_tenant_id`);
    }
  });
}

// =============================================================================
// TEST DATA HELPERS
// =============================================================================

/**
 * Insert test user
 */
export async function insertTestUser(
  tenantId: string,
  overrides: Partial<{
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  }> = {}
): Promise<{ id: string }> {
  const db = getTestDatabase();
  const id = overrides.id || uuidv4();
  
  await db('users').insert({
    id,
    tenant_id: tenantId,
    email: overrides.email || `test-${id.slice(0, 8)}@test.com`,
    first_name: overrides.firstName || 'Test',
    last_name: overrides.lastName || 'User',
    created_at: new Date(),
    updated_at: new Date()
  });
  
  return { id };
}

/**
 * Insert test venue
 */
export async function insertTestVenue(
  tenantId: string,
  ownerId: string,
  overrides: Partial<{
    id: string;
    name: string;
    totalEarnings: number;
    riskScore: number;
  }> = {}
): Promise<{ id: string }> {
  const db = getTestDatabase();
  const id = overrides.id || uuidv4();
  
  await db('venues').insert({
    id,
    tenant_id: tenantId,
    owner_id: ownerId,
    name: overrides.name || `Test Venue ${id.slice(0, 8)}`,
    total_earnings: overrides.totalEarnings || 0,
    risk_score: overrides.riskScore || 0,
    created_at: new Date(),
    updated_at: new Date()
  });
  
  return { id };
}

/**
 * Insert test GDPR request
 */
export async function insertTestGdprRequest(
  tenantId: string,
  userId: string,
  overrides: Partial<{
    id: string;
    requestType: string;
    status: string;
  }> = {}
): Promise<{ id: string }> {
  const db = getTestDatabase();
  const id = overrides.id || uuidv4();
  
  await db('gdpr_requests').insert({
    id,
    tenant_id: tenantId,
    user_id: userId,
    request_type: overrides.requestType || 'export',
    status: overrides.status || 'pending',
    created_at: new Date(),
    updated_at: new Date()
  });
  
  return { id };
}

// =============================================================================
// JEST HOOKS
// =============================================================================

/**
 * Global setup for Jest
 */
export async function globalSetup(): Promise<void> {
  await createTestDatabase();
}

/**
 * Global teardown for Jest
 */
export async function globalTeardown(): Promise<void> {
  await destroyTestDatabase();
}

/**
 * Before each test hook
 */
export async function beforeEachTest(): Promise<void> {
  await cleanupTestDatabase();
}

/**
 * After each test hook
 */
export async function afterEachTest(): Promise<void> {
  await clearTestTenant();
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  getTestDatabaseConfig,
  createTestDatabase,
  getTestDatabase,
  destroyTestDatabase,
  cleanupTestDatabase,
  resetTestDatabase,
  setupTestTenant,
  clearTestTenant,
  withTestTransaction,
  insertTestUser,
  insertTestVenue,
  insertTestGdprRequest,
  globalSetup,
  globalTeardown,
  beforeEachTest,
  afterEachTest
};
