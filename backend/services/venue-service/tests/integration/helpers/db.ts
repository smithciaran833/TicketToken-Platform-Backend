import knex, { Knex } from 'knex';

let testDb: Knex | null = null;

export function getTestDb(): Knex {
  if (testDb) {
    return testDb;
  }

  testDb = knex({
    client: 'postgresql',
    connection: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'tickettoken_db',
    },
    pool: { min: 0, max: 10 },
    migrations: {
      directory: './src/migrations',
      tableName: 'knex_migrations_venue',
    },
  });

  return testDb;
}

export async function runMigrations(): Promise<void> {
  const db = getTestDb();
  console.log('[DB] Running migrations...');
  await db.migrate.latest();
  console.log('[DB] Migrations complete');
}

export async function rollbackMigrations(): Promise<void> {
  const db = getTestDb();
  await db.migrate.rollback(undefined, true);
}

async function getAllTables(): Promise<string[]> {
  const db = getTestDb();
  const result = await db.raw(`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename NOT LIKE 'knex_%'
  `);
  return result.rows.map((row: { tablename: string }) => row.tablename);
}

export async function truncateAllTables(): Promise<void> {
  const db = getTestDb();
  const tables = await getAllTables();
  if (tables.length === 0) return;

  await db.raw('SET session_replication_role = replica');
  for (const table of tables) {
    await db.raw(`TRUNCATE TABLE "${table}" CASCADE`);
  }
  await db.raw('SET session_replication_role = DEFAULT');
}

export async function seedTestData(
  table: string,
  data: Record<string, any> | Record<string, any>[]
): Promise<void> {
  const db = getTestDb();
  const rows = Array.isArray(data) ? data : [data];
  await db(table).insert(rows);
}

export async function closeDb(): Promise<void> {
  if (testDb) {
    await testDb.destroy();
    testDb = null;
    console.log('[DB] Connection closed');
  }
}

export async function setTenantContext(tenantId: string): Promise<void> {
  const db = getTestDb();
  await db.raw(`SET app.current_tenant_id = '${tenantId}'`);
}

export async function clearTenantContext(): Promise<void> {
  const db = getTestDb();
  await db.raw('RESET app.current_tenant_id');
}
