import knex, { Knex } from 'knex';
import { getContainerUrls } from './containers';

let testDb: Knex | null = null;

/**
 * Get or create the test database connection
 */
export function getTestDb(): Knex {
  if (testDb) {
    return testDb;
  }

  const urls = getContainerUrls();

  testDb = knex({
    client: 'postgresql',
    connection: {
      host: urls.postgres.host,
      port: urls.postgres.port,
      user: urls.postgres.user,
      password: urls.postgres.password,
      database: urls.postgres.database,
    },
    pool: {
      min: 0,
      max: 5,
    },
    migrations: {
      directory: './src/migrations',
      tableName: 'knex_migrations_venue',
    },
  });

  return testDb;
}

/**
 * Run all migrations
 */
export async function runMigrations(): Promise<void> {
  const db = getTestDb();
  console.log('[DB] Running migrations...');
  await db.migrate.latest();
  console.log('[DB] Migrations complete');
}

/**
 * Rollback all migrations
 */
export async function rollbackMigrations(): Promise<void> {
  const db = getTestDb();
  console.log('[DB] Rolling back migrations...');
  await db.migrate.rollback(undefined, true);
  console.log('[DB] Rollback complete');
}

/**
 * Get all table names (excluding migration tables)
 */
async function getAllTables(): Promise<string[]> {
  const db = getTestDb();
  
  const result = await db.raw(`
    SELECT tablename FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename NOT LIKE 'knex_%'
  `);

  return result.rows.map((row: { tablename: string }) => row.tablename);
}

/**
 * Truncate all tables (preserve schema, delete data)
 * Uses TRUNCATE CASCADE to handle foreign keys
 */
export async function truncateAllTables(): Promise<void> {
  const db = getTestDb();
  const tables = await getAllTables();

  if (tables.length === 0) {
    return;
  }

  // Disable triggers temporarily for faster truncation
  await db.raw('SET session_replication_role = replica');
  
  for (const table of tables) {
    await db.raw(`TRUNCATE TABLE "${table}" CASCADE`);
  }

  // Re-enable triggers
  await db.raw('SET session_replication_role = DEFAULT');
}

/**
 * Seed test data using fixture objects
 */
export async function seedTestData(
  table: string,
  data: Record<string, any> | Record<string, any>[]
): Promise<void> {
  const db = getTestDb();
  const rows = Array.isArray(data) ? data : [data];
  await db(table).insert(rows);
}

/**
 * Delete specific records from a table
 */
export async function deleteFromTable(
  table: string,
  where: Record<string, any>
): Promise<void> {
  const db = getTestDb();
  await db(table).where(where).delete();
}

/**
 * Get records from a table
 */
export async function getFromTable<T = any>(
  table: string,
  where?: Record<string, any>
): Promise<T[]> {
  const db = getTestDb();
  const query = db(table);
  
  if (where) {
    query.where(where);
  }

  return query.select('*');
}

/**
 * Close the database connection
 */
export async function closeDb(): Promise<void> {
  if (testDb) {
    await testDb.destroy();
    testDb = null;
    console.log('[DB] Connection closed');
  }
}

/**
 * Check database connectivity
 */
export async function checkDbConnection(): Promise<boolean> {
  try {
    const db = getTestDb();
    await db.raw('SELECT 1');
    return true;
  } catch (error) {
    console.error('[DB] Connection check failed:', error);
    return false;
  }
}

/**
 * Set tenant context for RLS (Row Level Security)
 */
export async function setTenantContext(tenantId: string): Promise<void> {
  const db = getTestDb();
  await db.raw(`SET app.current_tenant_id = '${tenantId}'`);
}

/**
 * Clear tenant context
 */
export async function clearTenantContext(): Promise<void> {
  const db = getTestDb();
  await db.raw('RESET app.current_tenant_id');
}
