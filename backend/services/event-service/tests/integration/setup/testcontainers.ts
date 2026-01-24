/**
 * Testcontainers Setup for Event Service Integration Tests
 *
 * Provides real PostgreSQL and Redis containers for testing.
 * Creates necessary stub tables for cross-service foreign keys.
 */

import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { Pool, PoolClient } from 'pg';
import Redis from 'ioredis';

let postgresContainer: StartedTestContainer | null = null;
let redisContainer: StartedTestContainer | null = null;
let dbPool: Pool | null = null;
let redisClient: Redis | null = null;

// Track initialization state
let isInitialized = false;

/**
 * Setup test containers - PostgreSQL and Redis
 */
export async function setupTestContainers(): Promise<{ dbPool: Pool; redisClient: Redis }> {
  if (isInitialized && dbPool && redisClient) {
    return { dbPool, redisClient };
  }

  console.log('Starting test containers...');

  // Start PostgreSQL with proper wait strategy
  postgresContainer = await new GenericContainer('postgres:15-alpine')
    .withEnvironment({
      POSTGRES_DB: 'event_service_test',
      POSTGRES_USER: 'test',
      POSTGRES_PASSWORD: 'test',
    })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/))
    .start();

  console.log('PostgreSQL container started');

  // Start Redis
  redisContainer = await new GenericContainer('redis:7-alpine')
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/))
    .start();

  console.log('Redis container started');

  // Create DB pool (superuser for migrations)
  const superuserPool = new Pool({
    host: postgresContainer.getHost(),
    port: postgresContainer.getMappedPort(5432),
    database: 'event_service_test',
    user: 'test',
    password: 'test',
    max: 10,
  });

  // Create Redis client
  redisClient = new Redis({
    host: redisContainer.getHost(),
    port: redisContainer.getMappedPort(6379),
    maxRetriesPerRequest: 3,
  });

  // Wait for PostgreSQL to be fully ready with retry logic
  let retries = 10;
  while (retries > 0) {
    try {
      await superuserPool.query('SELECT 1');
      break;
    } catch (error) {
      retries--;
      if (retries === 0) throw error;
      console.log(`Waiting for PostgreSQL... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  await redisClient.ping();

  console.log('Connections established');

  // Run migrations with superuser
  await runMigrations(superuserPool);

  // Create non-superuser application role for testing RLS
  console.log('Creating non-superuser application role...');
  await createApplicationRole(superuserPool);

  // Close the superuser pool
  await superuserPool.end();

  // Create NEW pool using the non-superuser application role
  dbPool = new Pool({
    host: postgresContainer.getHost(),
    port: postgresContainer.getMappedPort(5432),
    database: 'event_service_test',
    user: 'tickettoken_app',        // Non-superuser application role
    password: 'test_password',
    max: 10,
  });

  // Verify new connection works
  await dbPool.query('SELECT 1');
  console.log('Application role pool established');

  isInitialized = true;
  return { dbPool, redisClient };
}

/**
 * Run database migrations for tests
 * Creates stub tables for cross-service dependencies, then event-service tables
 */
async function runMigrations(pool: Pool): Promise<void> {
  console.log('Running migrations...');

  const client = await pool.connect();
  try {
    // Create UUID extension
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    // Create stub tables for cross-service foreign keys
    await createStubTables(client);

    // Create event-service tables
    await createEventServiceTables(client);

    console.log('Migrations completed');
  } finally {
    client.release();
  }
}

/**
 * Create non-superuser application role for RLS testing
 * This role does NOT have SUPERUSER or BYPASSRLS, so RLS policies are enforced.
 */
async function createApplicationRole(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      -- Create application role (non-superuser)
      CREATE ROLE tickettoken_app
        NOSUPERUSER           -- NOT a superuser (critical for RLS)
        NOCREATEDB            -- Cannot create databases
        NOCREATEROLE          -- Cannot create roles
        NOINHERIT             -- Doesn't inherit permissions
        LOGIN                 -- Can log in
        PASSWORD 'test_password';

      -- Grant connection permission
      GRANT CONNECT ON DATABASE event_service_test TO tickettoken_app;

      -- Grant schema usage
      GRANT USAGE ON SCHEMA public TO tickettoken_app;

      -- Grant table permissions (SELECT, INSERT, UPDATE, DELETE)
      GRANT SELECT, INSERT, UPDATE, DELETE
        ON ALL TABLES IN SCHEMA public
        TO tickettoken_app;

      -- Grant TRUNCATE permission (needed for test cleanup)
      GRANT TRUNCATE ON ALL TABLES IN SCHEMA public TO tickettoken_app;

      -- Grant sequence permissions (for auto-generated IDs)
      GRANT USAGE, SELECT
        ON ALL SEQUENCES IN SCHEMA public
        TO tickettoken_app;

      -- Grant default privileges for any future tables
      ALTER DEFAULT PRIVILEGES IN SCHEMA public
        GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON TABLES TO tickettoken_app;

      ALTER DEFAULT PRIVILEGES IN SCHEMA public
        GRANT USAGE, SELECT ON SEQUENCES TO tickettoken_app;
    `);

    console.log('Application role created: tickettoken_app (NOSUPERUSER, no BYPASSRLS)');
  } finally {
    client.release();
  }
}

/**
 * Create stub tables for cross-service dependencies
 */
async function createStubTables(client: PoolClient): Promise<void> {
  // Tenants table (from auth-service)
  await client.query(`
    CREATE TABLE IF NOT EXISTS tenants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(255) UNIQUE NOT NULL,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Venues table (from venue-service)
  await client.query(`
    CREATE TABLE IF NOT EXISTS venues (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id),
      name VARCHAR(255) NOT NULL,
      capacity INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Venue layouts table (from venue-service)
  await client.query(`
    CREATE TABLE IF NOT EXISTS venue_layouts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      venue_id UUID REFERENCES venues(id),
      name VARCHAR(255) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Users table (from auth-service)
  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id),
      email VARCHAR(255) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Insert test data
  await client.query(`
    INSERT INTO tenants (id, name, slug) VALUES
      ('11111111-1111-1111-1111-111111111111', 'Test Tenant 1', 'test-tenant-1'),
      ('22222222-2222-2222-2222-222222222222', 'Test Tenant 2', 'test-tenant-2')
    ON CONFLICT (id) DO NOTHING
  `);

  await client.query(`
    INSERT INTO venues (id, tenant_id, name, capacity) VALUES
      ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Test Venue 1', 1000),
      ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'Test Venue 2', 500)
    ON CONFLICT (id) DO NOTHING
  `);

  await client.query(`
    INSERT INTO users (id, tenant_id, email) VALUES
      ('cccccccc-cccc-cccc-cccc-cccccccccccc', '11111111-1111-1111-1111-111111111111', 'user1@test.com'),
      ('dddddddd-dddd-dddd-dddd-dddddddddddd', '22222222-2222-2222-2222-222222222222', 'user2@test.com')
    ON CONFLICT (id) DO NOTHING
  `);
}

/**
 * Create event-service tables (simplified from migration)
 */
async function createEventServiceTables(client: PoolClient): Promise<void> {
  // Functions
  await client.query(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);

  await client.query(`
    CREATE OR REPLACE FUNCTION increment_version()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.version = OLD.version + 1;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);

  // Event categories (global table)
  await client.query(`
    CREATE TABLE IF NOT EXISTS event_categories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      parent_id UUID REFERENCES event_categories(id) ON DELETE SET NULL,
      name VARCHAR(100) NOT NULL,
      slug VARCHAR(100) NOT NULL UNIQUE,
      description TEXT,
      icon VARCHAR(50),
      color VARCHAR(7),
      display_order INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT true,
      is_featured BOOLEAN DEFAULT false,
      meta_title VARCHAR(70),
      meta_description VARCHAR(160),
      event_count INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Seed categories
  await client.query(`
    INSERT INTO event_categories (name, slug, display_order) VALUES
      ('Music', 'music', 1),
      ('Sports', 'sports', 2),
      ('Theater', 'theater', 3)
    ON CONFLICT (slug) DO NOTHING
  `);

  // Events table
  await client.query(`
    CREATE TABLE IF NOT EXISTS events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
      venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE RESTRICT,
      venue_layout_id UUID REFERENCES venue_layouts(id) ON DELETE SET NULL,
      name VARCHAR(300) NOT NULL,
      slug VARCHAR(300) NOT NULL,
      description TEXT,
      short_description VARCHAR(500),
      event_type VARCHAR(50) NOT NULL DEFAULT 'single',
      primary_category_id UUID REFERENCES event_categories(id),
      secondary_category_ids UUID[],
      tags TEXT[],
      status VARCHAR(50) DEFAULT 'DRAFT',
      visibility VARCHAR(50) DEFAULT 'PUBLIC',
      is_featured BOOLEAN DEFAULT false,
      priority_score INTEGER DEFAULT 0,
      status_reason VARCHAR(500),
      status_changed_by VARCHAR(100),
      status_changed_at TIMESTAMPTZ,
      banner_image_url TEXT,
      thumbnail_image_url TEXT,
      image_gallery JSONB,
      video_url TEXT,
      virtual_event_url TEXT,
      age_restriction INTEGER DEFAULT 0,
      dress_code VARCHAR(100),
      special_requirements TEXT[],
      accessibility_info JSONB,
      collection_address VARCHAR(44),
      mint_authority VARCHAR(44),
      royalty_percentage DECIMAL(5,2),
      is_virtual BOOLEAN DEFAULT false,
      is_hybrid BOOLEAN DEFAULT false,
      streaming_platform VARCHAR(50),
      streaming_config JSONB,
      cancellation_policy TEXT,
      refund_policy TEXT,
      cancellation_deadline_hours INTEGER DEFAULT 24,
      start_date TIMESTAMPTZ,
      allow_transfers BOOLEAN DEFAULT true,
      max_transfers_per_ticket INTEGER,
      transfer_blackout_start TIMESTAMPTZ,
      transfer_blackout_end TIMESTAMPTZ,
      require_identity_verification BOOLEAN DEFAULT false,
      meta_title VARCHAR(70),
      meta_description VARCHAR(160),
      meta_keywords TEXT[],
      view_count INTEGER DEFAULT 0,
      interest_count INTEGER DEFAULT 0,
      share_count INTEGER DEFAULT 0,
      external_id VARCHAR(100),
      metadata JSONB DEFAULT '{}',
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      deleted_at TIMESTAMPTZ,
      cancelled_at TIMESTAMPTZ,
      version INTEGER NOT NULL DEFAULT 1,

      CONSTRAINT events_status_check CHECK (status IN ('DRAFT', 'REVIEW', 'PENDING_REVIEW', 'APPROVED', 'PUBLISHED', 'ON_SALE', 'SOLD_OUT', 'PAUSED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'POSTPONED', 'RESCHEDULED', 'SALES_PAUSED', 'ARCHIVED')),
      CONSTRAINT events_visibility_check CHECK (visibility IN ('PUBLIC', 'PRIVATE', 'UNLISTED')),
      CONSTRAINT events_event_type_check CHECK (event_type IN ('single', 'recurring', 'series')),
      CONSTRAINT events_royalty_percentage_check CHECK (royalty_percentage IS NULL OR (royalty_percentage >= 0 AND royalty_percentage <= 100))
    )
  `);

  // Events indexes
  await client.query('CREATE INDEX IF NOT EXISTS idx_events_tenant_id ON events(tenant_id)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_events_venue_id ON events(venue_id)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_events_slug ON events(slug)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_events_status ON events(status)');
  await client.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_events_tenant_slug ON events(tenant_id, slug) WHERE deleted_at IS NULL');

  // Event schedules
  await client.query(`
    CREATE TABLE IF NOT EXISTS event_schedules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
      event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      starts_at TIMESTAMPTZ NOT NULL,
      ends_at TIMESTAMPTZ NOT NULL,
      doors_open_at TIMESTAMPTZ,
      is_recurring BOOLEAN DEFAULT false,
      recurrence_rule TEXT,
      recurrence_end_date DATE,
      occurrence_number INTEGER,
      timezone VARCHAR(50) DEFAULT 'UTC',
      utc_offset INTEGER,
      status VARCHAR(50) DEFAULT 'SCHEDULED',
      status_reason TEXT,
      capacity_override INTEGER,
      check_in_opens_at TIMESTAMPTZ,
      check_in_closes_at TIMESTAMPTZ,
      notes TEXT,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      deleted_at TIMESTAMPTZ,
      version INTEGER NOT NULL DEFAULT 1
    )
  `);

  // Event capacity
  await client.query(`
    CREATE TABLE IF NOT EXISTS event_capacity (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
      event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      schedule_id UUID REFERENCES event_schedules(id) ON DELETE SET NULL,
      section_name VARCHAR(100) NOT NULL,
      section_code VARCHAR(20),
      tier VARCHAR(50),
      total_capacity INTEGER NOT NULL,
      available_capacity INTEGER NOT NULL,
      reserved_capacity INTEGER DEFAULT 0,
      buffer_capacity INTEGER DEFAULT 0,
      sold_count INTEGER DEFAULT 0,
      pending_count INTEGER DEFAULT 0,
      reserved_at TIMESTAMPTZ,
      reserved_expires_at TIMESTAMPTZ,
      locked_price_data JSONB,
      row_config JSONB,
      seat_map JSONB,
      is_active BOOLEAN DEFAULT true,
      is_visible BOOLEAN DEFAULT true,
      minimum_purchase INTEGER DEFAULT 1,
      maximum_purchase INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      deleted_at TIMESTAMPTZ,
      version INTEGER NOT NULL DEFAULT 1,

      CONSTRAINT event_capacity_total_check CHECK (total_capacity > 0),
      CONSTRAINT event_capacity_available_check CHECK (available_capacity >= 0),
      CONSTRAINT event_capacity_reserved_check CHECK (reserved_capacity >= 0),
      CONSTRAINT event_capacity_sold_check CHECK (sold_count >= 0)
    )
  `);

  await client.query('CREATE INDEX IF NOT EXISTS idx_event_capacity_tenant_id ON event_capacity(tenant_id)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_event_capacity_event_id ON event_capacity(event_id)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_event_capacity_reserved_expires ON event_capacity(reserved_expires_at)');

  // Event pricing
  await client.query(`
    CREATE TABLE IF NOT EXISTS event_pricing (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
      event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      schedule_id UUID REFERENCES event_schedules(id) ON DELETE SET NULL,
      capacity_id UUID REFERENCES event_capacity(id) ON DELETE SET NULL,
      name VARCHAR(100) NOT NULL,
      description TEXT,
      tier VARCHAR(50),
      base_price DECIMAL(10,2) NOT NULL,
      service_fee DECIMAL(10,2) DEFAULT 0,
      facility_fee DECIMAL(10,2) DEFAULT 0,
      tax_rate DECIMAL(5,4) DEFAULT 0,
      is_dynamic BOOLEAN DEFAULT false,
      min_price DECIMAL(10,2),
      max_price DECIMAL(10,2),
      price_adjustment_rules JSONB,
      current_price DECIMAL(10,2),
      early_bird_price DECIMAL(10,2),
      early_bird_ends_at TIMESTAMPTZ,
      last_minute_price DECIMAL(10,2),
      last_minute_starts_at TIMESTAMPTZ,
      group_size_min INTEGER,
      group_discount_percentage DECIMAL(5,2),
      currency VARCHAR(3) DEFAULT 'USD',
      sales_start_at TIMESTAMPTZ,
      sales_end_at TIMESTAMPTZ,
      max_per_order INTEGER,
      max_per_customer INTEGER,
      is_active BOOLEAN DEFAULT true,
      is_visible BOOLEAN DEFAULT true,
      display_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      deleted_at TIMESTAMPTZ,
      version INTEGER NOT NULL DEFAULT 1,

      CONSTRAINT event_pricing_base_price_check CHECK (base_price >= 0)
    )
  `);

  // Event metadata
  await client.query(`
    CREATE TABLE IF NOT EXISTS event_metadata (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
      event_id UUID NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
      performers JSONB,
      headliner VARCHAR(200),
      supporting_acts TEXT[],
      production_company VARCHAR(200),
      technical_requirements JSONB,
      stage_setup_time_hours INTEGER,
      sponsors JSONB,
      primary_sponsor VARCHAR(200),
      performance_rights_org VARCHAR(100),
      licensing_requirements TEXT[],
      insurance_requirements JSONB,
      press_release TEXT,
      marketing_copy JSONB,
      social_media_copy JSONB,
      sound_requirements JSONB,
      lighting_requirements JSONB,
      video_requirements JSONB,
      catering_requirements JSONB,
      rider_requirements JSONB,
      production_budget DECIMAL(12,2),
      marketing_budget DECIMAL(12,2),
      projected_revenue DECIMAL(12,2),
      break_even_capacity INTEGER,
      previous_events JSONB,
      custom_fields JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    )
  `);

  // Event status history for audit trail
  await client.query(`
    CREATE TABLE IF NOT EXISTS event_status_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
      from_status VARCHAR(50),
      to_status VARCHAR(50) NOT NULL,
      transition_type VARCHAR(50),
      changed_by VARCHAR(100),
      reason TEXT,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await client.query('CREATE INDEX IF NOT EXISTS idx_event_status_history_event ON event_status_history(event_id)');

  // Create triggers
  const tablesWithUpdatedAt = ['event_categories', 'events', 'event_schedules', 'event_capacity', 'event_pricing', 'event_metadata'];
  for (const table of tablesWithUpdatedAt) {
    await client.query(`DROP TRIGGER IF EXISTS trigger_update_${table}_timestamp ON ${table}`);
    await client.query(`
      CREATE TRIGGER trigger_update_${table}_timestamp
      BEFORE UPDATE ON ${table}
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column()
    `);
  }

  const tablesWithVersion = ['events', 'event_schedules', 'event_capacity', 'event_pricing'];
  for (const table of tablesWithVersion) {
    await client.query(`DROP TRIGGER IF EXISTS ${table}_version_trigger ON ${table}`);
    await client.query(`
      CREATE TRIGGER ${table}_version_trigger
      BEFORE UPDATE ON ${table}
      FOR EACH ROW
      EXECUTE FUNCTION increment_version()
    `);
  }

  // Enable RLS on event tables
  const rlsTables = ['events', 'event_schedules', 'event_capacity', 'event_pricing', 'event_metadata', 'event_status_history'];
  for (const table of rlsTables) {
    await client.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    await client.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);

    // Drop existing policies if they exist
    await client.query(`DROP POLICY IF EXISTS ${table}_tenant_isolation_select ON ${table}`);
    await client.query(`DROP POLICY IF EXISTS ${table}_tenant_isolation_insert ON ${table}`);
    await client.query(`DROP POLICY IF EXISTS ${table}_tenant_isolation_update ON ${table}`);
    await client.query(`DROP POLICY IF EXISTS ${table}_tenant_isolation_delete ON ${table}`);

    // Create RLS policies
    await client.query(`
      CREATE POLICY ${table}_tenant_isolation_select ON ${table}
      FOR SELECT
      USING (
        tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
        OR current_setting('app.is_system_user', true) = 'true'
      )
    `);

    await client.query(`
      CREATE POLICY ${table}_tenant_isolation_insert ON ${table}
      FOR INSERT
      WITH CHECK (
        tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
        OR current_setting('app.is_system_user', true) = 'true'
      )
    `);

    await client.query(`
      CREATE POLICY ${table}_tenant_isolation_update ON ${table}
      FOR UPDATE
      USING (
        tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
        OR current_setting('app.is_system_user', true) = 'true'
      )
    `);

    await client.query(`
      CREATE POLICY ${table}_tenant_isolation_delete ON ${table}
      FOR DELETE
      USING (
        tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
        OR current_setting('app.is_system_user', true) = 'true'
      )
    `);
  }
}

/**
 * Teardown test containers
 */
export async function teardownTestContainers(): Promise<void> {
  console.log('Tearing down test containers...');

  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }

  if (dbPool) {
    await dbPool.end();
    dbPool = null;
  }

  if (redisContainer) {
    await redisContainer.stop();
    redisContainer = null;
  }

  if (postgresContainer) {
    await postgresContainer.stop();
    postgresContainer = null;
  }

  isInitialized = false;
  console.log('Test containers stopped');
}

/**
 * Get the database pool
 */
export function getDbPool(): Pool {
  if (!dbPool) {
    throw new Error('Database pool not initialized. Call setupTestContainers() first.');
  }
  return dbPool;
}

/**
 * Get the Redis client
 */
export function getRedis(): Redis {
  if (!redisClient) {
    throw new Error('Redis client not initialized. Call setupTestContainers() first.');
  }
  return redisClient;
}

/**
 * Get test data constants
 */
export const TEST_DATA = {
  TENANT_1_ID: '11111111-1111-1111-1111-111111111111',
  TENANT_2_ID: '22222222-2222-2222-2222-222222222222',
  VENUE_1_ID: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  VENUE_2_ID: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  USER_1_ID: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  USER_2_ID: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
};
