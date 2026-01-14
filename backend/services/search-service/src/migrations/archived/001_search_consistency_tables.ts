import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema
    // ====================================
    // Track index versions for consistency
    // ====================================
    .createTable('index_versions', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('entity_type', 50).notNullable();
      table.string('entity_id', 255).notNullable();
      table.bigInteger('version').notNullable().defaultTo(1);
      table.timestamp('indexed_at').nullable();
      table.string('index_status', 50).defaultTo('PENDING');
      table.integer('retry_count').defaultTo(0);
      table.text('last_error').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());

      // Tenant isolation
      table.uuid('tenant_id')
        .notNullable()
        .defaultTo('00000000-0000-0000-0000-000000000001')
        .references('id')
        .inTable('tenants')
        .onDelete('RESTRICT');

      table.unique(['entity_type', 'entity_id']);
      table.index(['index_status', 'created_at'], 'idx_index_versions_status');
      table.index(['entity_type', 'entity_id'], 'idx_index_versions_entity');
      table.index('tenant_id'); // Tenant isolation index
    })
    // Track pending index operations
    .createTable('index_queue', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('entity_type', 50).notNullable();
      table.string('entity_id', 255).notNullable();
      table.string('operation', 20).notNullable(); // CREATE, UPDATE, DELETE
      table.jsonb('payload').notNullable();
      table.integer('priority').defaultTo(5);
      table.bigInteger('version').nullable();
      table.string('idempotency_key', 255).unique();
      table.timestamp('processed_at').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());

      // Tenant isolation
      table.uuid('tenant_id')
        .notNullable()
        .defaultTo('00000000-0000-0000-0000-000000000001')
        .references('id')
        .inTable('tenants')
        .onDelete('RESTRICT');

      table.index('processed_at', 'idx_index_queue_unprocessed');
      table.index(['priority', 'created_at'], 'idx_index_queue_priority');
      table.index('tenant_id'); // Tenant isolation index
    })
    // Client read tracking for consistency
    .createTable('read_consistency_tokens', function(table) {
      table.string('token', 255).primary();
      table.string('client_id', 255).notNullable();
      table.jsonb('required_versions').notNullable(); // { "events": { "id1": 2, "id2": 3 }, "venues": { "id3": 1 } }
      table.timestamp('expires_at').notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());

      // Tenant isolation
      table.uuid('tenant_id')
        .notNullable()
        .defaultTo('00000000-0000-0000-0000-000000000001')
        .references('id')
        .inTable('tenants')
        .onDelete('RESTRICT');

      table.index('expires_at', 'idx_read_consistency_expires');
      table.index('tenant_id'); // Tenant isolation index
    });

  // ====================================
  // ROW LEVEL SECURITY (RLS)
  // ====================================
  console.log('Enabling Row Level Security...');

  await knex.raw('ALTER TABLE index_versions ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE index_queue ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE read_consistency_tokens ENABLE ROW LEVEL SECURITY');

  await knex.raw(`
    CREATE POLICY tenant_isolation_policy ON index_versions
    USING (tenant_id::text = current_setting('app.current_tenant', true))
  `);

  await knex.raw(`
    CREATE POLICY tenant_isolation_policy ON index_queue
    USING (tenant_id::text = current_setting('app.current_tenant', true))
  `);

  await knex.raw(`
    CREATE POLICY tenant_isolation_policy ON read_consistency_tokens
    USING (tenant_id::text = current_setting('app.current_tenant', true))
  `);

  console.log('✅ Search Service migration complete with tenant isolation!');
  console.log('📊 Tables created: 4 (tenants + 3 search tables)');
  console.log('🔒 Tenant isolation enabled on all tables');
  console.log('⚠️  IMPORTANT: Deploy tenant context middleware with this migration!');
}

export async function down(knex: Knex): Promise<void> {
  // Drop RLS policies
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON read_consistency_tokens');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON index_queue');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON index_versions');

  // Disable RLS
  await knex.raw('ALTER TABLE read_consistency_tokens DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE index_queue DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE index_versions DISABLE ROW LEVEL SECURITY');

  // Drop tables
  await knex.schema
    .dropTableIfExists('read_consistency_tokens')
    .dropTableIfExists('index_queue')
    .dropTableIfExists('index_versions');

  console.log('✅ Search Service migration rolled back');
}
