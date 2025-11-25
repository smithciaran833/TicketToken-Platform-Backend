import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create indexes for frequent query patterns
  
  // 1. Events table indexes
  await knex.schema.alterTable('events', (table) => {
    // Composite index for tenant + status queries
    table.index(['tenant_id', 'status'], 'idx_events_tenant_status');
    
    // Composite index for tenant + date range queries
    table.index(['tenant_id', 'start_date', 'end_date'], 'idx_events_tenant_dates');
    
    // Index for venue queries
    table.index(['venue_id', 'status'], 'idx_events_venue_status');
    
    // Index for time-based queries
    table.index(['start_date'], 'idx_events_start_date');
    table.index(['created_at'], 'idx_events_created_at');
  });

  // 2. Event categories table indexes (if exists)
  const hasCategoryTable = await knex.schema.hasTable('event_categories');
  if (hasCategoryTable) {
    await knex.schema.alterTable('event_categories', (table) => {
      table.index(['tenant_id', 'category'], 'idx_categories_tenant_category');
    });
  }

  // 3. Reservations table indexes (if exists)
  const hasReservationsTable = await knex.schema.hasTable('reservations');
  if (hasReservationsTable) {
    await knex.schema.alterTable('reservations', (table) => {
      // Composite index for cleanup job
      table.index(['status', 'expires_at'], 'idx_reservations_status_expires');
      
      // Index for user queries
      table.index(['tenant_id', 'user_id', 'status'], 'idx_reservations_tenant_user_status');
      
      // Index for event queries
      table.index(['event_id', 'status'], 'idx_reservations_event_status');
    });
  }

  // 4. Analytics tables indexes (if exists)
  const hasAnalyticsTable = await knex.schema.hasTable('event_analytics');
  if (hasAnalyticsTable) {
    await knex.schema.alterTable('event_analytics', (table) => {
      // Time-series indexes for analytics queries
      table.index(['tenant_id', 'event_id', 'date'], 'idx_analytics_tenant_event_date');
      table.index(['venue_id', 'date'], 'idx_analytics_venue_date');
    });
  }

  // 5. Create partial indexes for active records only (PostgreSQL specific)
  await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_active
    ON events(tenant_id, venue_id, start_date)
    WHERE status = 'active';
  `);

  await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_upcoming
    ON events(tenant_id, start_date)
    WHERE status = 'active' AND start_date > NOW();
  `);

  // 6. Create GIN index for JSONB columns if they exist
  const eventColumns = await knex('information_schema.columns')
    .where({ table_name: 'events', table_schema: 'public' })
    .select('column_name', 'data_type');

  const hasMetadataColumn = eventColumns.some(
    col => col.column_name === 'metadata' && col.data_type === 'jsonb'
  );

  if (hasMetadataColumn) {
    await knex.raw(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_metadata_gin
      ON events USING GIN (metadata);
    `);
  }

  console.log('✅ Performance indexes created successfully');
}

export async function down(knex: Knex): Promise<void> {
  // Drop indexes in reverse order
  
  // Drop GIN indexes
  await knex.raw('DROP INDEX CONCURRENTLY IF EXISTS idx_events_metadata_gin');
  
  // Drop partial indexes
  await knex.raw('DROP INDEX CONCURRENTLY IF EXISTS idx_events_upcoming');
  await knex.raw('DROP INDEX CONCURRENTLY IF EXISTS idx_events_active');

  // Drop analytics indexes
  const hasAnalyticsTable = await knex.schema.hasTable('event_analytics');
  if (hasAnalyticsTable) {
    await knex.schema.alterTable('event_analytics', (table) => {
      table.dropIndex([], 'idx_analytics_tenant_event_date');
      table.dropIndex([], 'idx_analytics_venue_date');
    });
  }

  // Drop reservation indexes
  const hasReservationsTable = await knex.schema.hasTable('reservations');
  if (hasReservationsTable) {
    await knex.schema.alterTable('reservations', (table) => {
      table.dropIndex([], 'idx_reservations_status_expires');
      table.dropIndex([], 'idx_reservations_tenant_user_status');
      table.dropIndex([], 'idx_reservations_event_status');
    });
  }

  // Drop category indexes
  const hasCategoryTable = await knex.schema.hasTable('event_categories');
  if (hasCategoryTable) {
    await knex.schema.alterTable('event_categories', (table) => {
      table.dropIndex([], 'idx_categories_tenant_category');
    });
  }

  // Drop event indexes
  await knex.schema.alterTable('events', (table) => {
    table.dropIndex([], 'idx_events_tenant_status');
    table.dropIndex([], 'idx_events_tenant_dates');
    table.dropIndex([], 'idx_events_venue_status');
    table.dropIndex([], 'idx_events_start_date');
    table.dropIndex([], 'idx_events_created_at');
  });

  console.log('✅ Performance indexes dropped successfully');
}
