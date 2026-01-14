import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add tenant_id to files table for multi-tenancy
  await knex.schema.alterTable('files', (table) => {
    table.uuid('tenant_id').nullable().index();
    table.uuid('venue_id').nullable().index();
  });

  // Create storage_quotas table
  await knex.schema.createTable('storage_quotas', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    
    // Quota can be for user, tenant, or venue
    table.uuid('user_id').nullable().index();
    table.uuid('tenant_id').nullable().index();
    table.uuid('venue_id').nullable().index();
    
    // Quota limits
    table.bigInteger('max_storage_bytes').notNullable();
    table.integer('max_files').nullable();
    table.bigInteger('max_file_size_bytes').nullable();
    
    // File type specific limits
    table.jsonb('limits_by_type').defaultTo('{}');
    
    // Soft limits (warnings)
    table.integer('soft_limit_percentage').defaultTo(80);
    table.boolean('send_warnings').defaultTo(true);
    
    // Status
    table.boolean('is_active').defaultTo(true);
    table.text('notes').nullable();
    
    table.timestamps(true, true);
    
    // Ensure only one quota per entity
    table.unique(['user_id', 'tenant_id', 'venue_id']);
  });

  // Create storage_usage table for tracking
  await knex.schema.createTable('storage_usage', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    
    // Usage can be for user, tenant, or venue
    table.uuid('user_id').nullable().index();
    table.uuid('tenant_id').nullable().index();
    table.uuid('venue_id').nullable().index();
    
    // Current usage
    table.bigInteger('total_storage_bytes').notNullable().defaultTo(0);
    table.integer('total_files').notNullable().defaultTo(0);
    
    // Usage by file type
    table.jsonb('usage_by_type').defaultTo('{}');
    
    // Historical data
    table.bigInteger('peak_storage_bytes').defaultTo(0);
    table.timestamp('peak_storage_at').nullable();
    
    // Last calculation
    table.timestamp('last_calculated_at').defaultTo(knex.fn.now());
    
    table.timestamps(true, true);
    
    // Ensure only one usage record per entity
    table.unique(['user_id', 'tenant_id', 'venue_id']);
  });

  // Create quota_alerts table for notifications
  await knex.schema.createTable('quota_alerts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    
    table.uuid('quota_id').notNullable()
      .references('id').inTable('storage_quotas').onDelete('CASCADE');
    
    table.uuid('user_id').nullable();
    table.uuid('tenant_id').nullable();
    table.uuid('venue_id').nullable();
    
    // Alert details
    table.string('alert_type').notNullable(); // warning, exceeded, critical
    table.integer('usage_percentage').notNullable();
    table.bigInteger('current_usage_bytes').notNullable();
    table.bigInteger('quota_limit_bytes').notNullable();
    
    // Notification status
    table.boolean('notification_sent').defaultTo(false);
    table.timestamp('notification_sent_at').nullable();
    
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    table.index(['quota_id', 'created_at']);
    table.index(['alert_type', 'notification_sent']);
  });

  // Create indexes for performance
  await knex.raw(`
    CREATE INDEX idx_files_tenant_storage ON files(tenant_id, size_bytes) WHERE deleted_at IS NULL;
    CREATE INDEX idx_files_user_storage ON files(uploaded_by, size_bytes) WHERE deleted_at IS NULL;
    CREATE INDEX idx_files_venue_storage ON files(venue_id, size_bytes) WHERE deleted_at IS NULL;
  `);

  // Add check constraints
  await knex.raw(`
    ALTER TABLE storage_quotas ADD CONSTRAINT chk_at_least_one_entity 
    CHECK (user_id IS NOT NULL OR tenant_id IS NOT NULL OR venue_id IS NOT NULL);
    
    ALTER TABLE storage_usage ADD CONSTRAINT chk_at_least_one_entity_usage
    CHECK (user_id IS NOT NULL OR tenant_id IS NOT NULL OR venue_id IS NOT NULL);
    
    ALTER TABLE storage_quotas ADD CONSTRAINT chk_positive_limits
    CHECK (max_storage_bytes > 0);
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Drop tables in reverse order
  await knex.schema.dropTableIfExists('quota_alerts');
  await knex.schema.dropTableIfExists('storage_usage');
  await knex.schema.dropTableIfExists('storage_quotas');
  
  // Remove columns from files table
  await knex.schema.alterTable('files', (table) => {
    table.dropColumn('tenant_id');
    table.dropColumn('venue_id');
  });
}
