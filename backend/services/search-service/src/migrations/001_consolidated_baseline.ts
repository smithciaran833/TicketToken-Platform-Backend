import { Knex } from 'knex';

/**
 * Search Service - Consolidated Baseline Migration
 *
 * Consolidated from 1 migration on January 2025
 *
 * Tables (3 total):
 *   Tenant-scoped (3): index_versions, index_queue, read_consistency_tokens
 *
 * Key fixes applied:
 *   - Removed zero UUID default on tenant_id
 *   - Standardized RLS pattern with NULLIF + app.is_system_user
 *   - Added FORCE RLS to all tenant tables
 *   - Added WITH CHECK clause to all policies
 */

export async function up(knex: Knex): Promise<void> {
  // ==========================================================================
  // TENANT-SCOPED TABLES (3)
  // ==========================================================================

  // --------------------------------------------------------------------------
  // 1. INDEX_VERSIONS - Track index versions for consistency
  // --------------------------------------------------------------------------
  await knex.schema.createTable('index_versions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('entity_type', 50).notNullable();
    table.string('entity_id', 255).notNullable();
    table.bigInteger('version').notNullable().defaultTo(1);
    table.timestamp('indexed_at', { useTz: true });
    table.string('index_status', 50).defaultTo('PENDING');
    table.integer('retry_count').defaultTo(0);
    table.text('last_error');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');

    table.unique(['entity_type', 'entity_id'], 'uq_index_versions_entity');
    table.index(['index_status', 'created_at'], 'idx_index_versions_status');
    table.index(['entity_type', 'entity_id'], 'idx_index_versions_entity');
    table.index('tenant_id', 'idx_index_versions_tenant_id');
  });

  // --------------------------------------------------------------------------
  // 2. INDEX_QUEUE - Track pending index operations
  // --------------------------------------------------------------------------
  await knex.schema.createTable('index_queue', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('entity_type', 50).notNullable();
    table.string('entity_id', 255).notNullable();
    table.string('operation', 20).notNullable();
    table.jsonb('payload').notNullable();
    table.integer('priority').defaultTo(5);
    table.bigInteger('version');
    table.string('idempotency_key', 255).unique();
    table.timestamp('processed_at', { useTz: true });
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');

    table.index('processed_at', 'idx_index_queue_unprocessed');
    table.index(['priority', 'created_at'], 'idx_index_queue_priority');
    table.index('tenant_id', 'idx_index_queue_tenant_id');
  });

  // --------------------------------------------------------------------------
  // 3. READ_CONSISTENCY_TOKENS - Client read tracking for consistency
  // --------------------------------------------------------------------------
  await knex.schema.createTable('read_consistency_tokens', (table) => {
    table.string('token', 255).primary();
    table.uuid('tenant_id').notNullable();
    table.string('client_id', 255).notNullable();
    table.jsonb('required_versions').notNullable();
    table.timestamp('expires_at', { useTz: true }).notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.foreign('tenant_id').references('id').inTable('tenants').onDelete('RESTRICT');

    table.index('expires_at', 'idx_read_consistency_expires');
    table.index('tenant_id', 'idx_read_consistency_tokens_tenant_id');
  });

  // ==========================================================================
  // ROW LEVEL SECURITY (3 Tenant Tables)
  // ==========================================================================

  const tenantTables = [
    'index_versions',
    'index_queue',
    'read_consistency_tokens'
  ];

  for (const tableName of tenantTables) {
    await knex.raw(`ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY`);
    await knex.raw(`ALTER TABLE ${tableName} FORCE ROW LEVEL SECURITY`);

    await knex.raw(`
      CREATE POLICY ${tableName}_tenant_isolation ON ${tableName}
        FOR ALL
        USING (
          tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
          OR current_setting('app.is_system_user', true) = 'true'
        )
        WITH CHECK (
          tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
          OR current_setting('app.is_system_user', true) = 'true'
        )
    `);
  }

  // ==========================================================================
  // COMPLETION
  // ==========================================================================

  console.log('✅ Search Service consolidated baseline migration complete');
  console.log('📊 Tables created: 3 (all tenant-scoped)');
  console.log('🔒 RLS enabled on all tables');
}

export async function down(knex: Knex): Promise<void> {
  // Drop RLS policies
  const tenantTables = [
    'read_consistency_tokens',
    'index_queue',
    'index_versions'
  ];

  for (const tableName of tenantTables) {
    await knex.raw(`DROP POLICY IF EXISTS ${tableName}_tenant_isolation ON ${tableName}`);
  }

  // Drop tables in reverse order
  await knex.schema.dropTableIfExists('read_consistency_tokens');
  await knex.schema.dropTableIfExists('index_queue');
  await knex.schema.dropTableIfExists('index_versions');

  console.log('✅ Search Service consolidated baseline rolled back');
}
