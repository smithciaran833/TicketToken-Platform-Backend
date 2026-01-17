import Knex from 'knex';

/**
 * Integration Service - Consolidated Baseline Migration
 *
 * Generated: January 13, 2026
 * Consolidates: 001, 002, 20260103 migrations
 *
 * Tables: 13 (all tenant-scoped)
 *
 * Standards Applied:
 * - gen_random_uuid() for all UUIDs
 * - tenant_id NOT NULL on all tables (no default)
 * - RLS with app.current_tenant_id + app.is_system_user
 * - External FKs converted to comments
 * - Internal FKs preserved
 */

export async function up(knex: Knex): Promise<void> {
  // ============================================================================
  // TENANT-SCOPED TABLES (13) - All with tenant_id and RLS
  // ============================================================================

  // ---------------------------------------------------------------------------
  // 1. integrations - Master catalog of available integrations
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('integrations', (table: Knex.CreateTableBuilder) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('name', 255).notNullable();
    table.string('provider', 100).notNullable();
    table.string('category', 100).notNullable();
    table.string('status', 50).notNullable().defaultTo('active');
    table.jsonb('config').defaultTo('{}');
    table.text('credentials_encrypted');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_integrations_tenant ON integrations(tenant_id)');
  await knex.raw('CREATE INDEX idx_integrations_provider ON integrations(provider)');
  await knex.raw('CREATE INDEX idx_integrations_category ON integrations(category)');
  await knex.raw('CREATE INDEX idx_integrations_status ON integrations(status)');
  await knex.raw('CREATE UNIQUE INDEX idx_integrations_name_provider ON integrations(tenant_id, name, provider)');

  // ---------------------------------------------------------------------------
  // 2. connections - User/venue connections to integrations
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('connections', (table: Knex.CreateTableBuilder) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('integration_id').notNullable();
    table.uuid('user_id').comment('FK: users.id');
    table.uuid('venue_id').comment('FK: venues.id');
    table.string('status', 50).notNullable().defaultTo('active');
    table.text('access_token_encrypted');
    table.text('refresh_token_encrypted');
    table.timestamp('token_expires_at');
    table.specificType('scopes', 'text[]').defaultTo('{}');
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('last_sync_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.foreign('integration_id').references('integrations.id').onDelete('CASCADE');
  });

  await knex.raw('CREATE INDEX idx_connections_tenant ON connections(tenant_id)');
  await knex.raw('CREATE INDEX idx_connections_integration ON connections(integration_id)');
  await knex.raw('CREATE INDEX idx_connections_user ON connections(user_id)');
  await knex.raw('CREATE INDEX idx_connections_venue ON connections(venue_id)');
  await knex.raw('CREATE INDEX idx_connections_status ON connections(status)');
  await knex.raw('CREATE INDEX idx_connections_last_sync ON connections(last_sync_at)');

  // ---------------------------------------------------------------------------
  // 3. field_mappings - Field mapping rules for data transformation
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('field_mappings', (table: Knex.CreateTableBuilder) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('connection_id').notNullable();
    table.string('source_field', 255).notNullable();
    table.string('target_field', 255).notNullable();
    table.jsonb('transform_rule').defaultTo('{}');
    table.boolean('is_active').defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.foreign('connection_id').references('connections.id').onDelete('CASCADE');
    table.unique(['connection_id', 'source_field', 'target_field']);
  });

  await knex.raw('CREATE INDEX idx_field_mappings_tenant ON field_mappings(tenant_id)');
  await knex.raw('CREATE INDEX idx_field_mappings_connection ON field_mappings(connection_id)');
  await knex.raw('CREATE INDEX idx_field_mappings_active ON field_mappings(is_active)');

  // ---------------------------------------------------------------------------
  // 4. webhooks - Webhook event queue and log
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('webhooks', (table: Knex.CreateTableBuilder) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('connection_id').notNullable();
    table.string('event_type', 255).notNullable();
    table.jsonb('payload').notNullable();
    table.string('status', 50).notNullable().defaultTo('pending');
    table.integer('retry_count').defaultTo(0);
    table.timestamp('processed_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.foreign('connection_id').references('connections.id').onDelete('CASCADE');
  });

  await knex.raw('CREATE INDEX idx_webhooks_tenant ON webhooks(tenant_id)');
  await knex.raw('CREATE INDEX idx_webhooks_connection ON webhooks(connection_id)');
  await knex.raw('CREATE INDEX idx_webhooks_event_type ON webhooks(event_type)');
  await knex.raw('CREATE INDEX idx_webhooks_status ON webhooks(status)');
  await knex.raw('CREATE INDEX idx_webhooks_created ON webhooks(created_at)');

  // ---------------------------------------------------------------------------
  // 5. integration_configs - Venue-specific integration configurations
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('integration_configs', (table: Knex.CreateTableBuilder) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('venue_id').notNullable().comment('FK: venues.id');
    table.string('integration_type', 100).notNullable();
    table.string('status', 50).notNullable().defaultTo('active');
    table.string('health_status', 50).defaultTo('healthy');
    table.text('access_token_encrypted');
    table.text('refresh_token_encrypted');
    table.text('api_key_encrypted');
    table.text('api_secret_encrypted');
    table.timestamp('token_expires_at');
    table.timestamp('last_token_refresh');
    table.jsonb('config').defaultTo('{}');
    table.jsonb('field_mappings').defaultTo('{}');
    table.string('template_id', 100);
    table.timestamp('template_applied_at');
    table.specificType('scopes', 'text[]').defaultTo('{}');
    table.string('oauth_state', 255);
    table.timestamp('last_sync_at');
    table.string('last_sync_status', 50);
    table.jsonb('last_sync_error');
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.unique(['venue_id', 'integration_type']);
  });

  await knex.raw('CREATE INDEX idx_integration_configs_tenant ON integration_configs(tenant_id)');
  await knex.raw('CREATE INDEX idx_integration_configs_venue ON integration_configs(venue_id)');
  await knex.raw('CREATE INDEX idx_integration_configs_type ON integration_configs(integration_type)');
  await knex.raw('CREATE INDEX idx_integration_configs_status ON integration_configs(status)');
  await knex.raw('CREATE INDEX idx_integration_configs_health ON integration_configs(health_status)');
  await knex.raw('CREATE INDEX idx_integration_configs_last_sync ON integration_configs(last_sync_at)');

  // ---------------------------------------------------------------------------
  // 6. integration_health - Health monitoring metrics
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('integration_health', (table: Knex.CreateTableBuilder) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('venue_id').notNullable().comment('FK: venues.id');
    table.string('integration_type', 100).notNullable();
    table.string('status', 50).notNullable().defaultTo('unknown');
    table.integer('success_rate').defaultTo(100);
    table.integer('avg_response_time').defaultTo(0);
    table.integer('error_count_24h').defaultTo(0);
    table.integer('total_requests_24h').defaultTo(0);
    table.timestamp('last_check_at');
    table.jsonb('last_error');
    table.string('last_error_type', 100);
    table.decimal('uptime_percentage', 5, 2).defaultTo(100.00);
    table.timestamp('last_outage_at');
    table.integer('outage_count_30d').defaultTo(0);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.unique(['venue_id', 'integration_type']);
  });

  await knex.raw('CREATE INDEX idx_integration_health_tenant ON integration_health(tenant_id)');
  await knex.raw('CREATE INDEX idx_integration_health_venue ON integration_health(venue_id)');
  await knex.raw('CREATE INDEX idx_integration_health_type ON integration_health(integration_type)');
  await knex.raw('CREATE INDEX idx_integration_health_status ON integration_health(status)');
  await knex.raw('CREATE INDEX idx_integration_health_last_check ON integration_health(last_check_at)');

  // ---------------------------------------------------------------------------
  // 7. integration_webhooks - Integration webhook event storage
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('integration_webhooks', (table: Knex.CreateTableBuilder) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('venue_id').comment('FK: venues.id');
    table.string('integration_type', 100).notNullable();
    table.string('event_type', 255).notNullable();
    table.string('event_id', 255);
    table.string('external_id', 255);
    table.jsonb('payload').notNullable();
    table.jsonb('headers');
    table.string('signature', 500);
    table.string('status', 50).notNullable().defaultTo('pending');
    table.integer('retry_count').defaultTo(0);
    table.jsonb('processing_error');
    table.timestamp('processed_at');
    table.timestamp('received_at').defaultTo(knex.fn.now());
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_integration_webhooks_tenant ON integration_webhooks(tenant_id)');
  await knex.raw('CREATE INDEX idx_integration_webhooks_venue ON integration_webhooks(venue_id)');
  await knex.raw('CREATE INDEX idx_integration_webhooks_type ON integration_webhooks(integration_type)');
  await knex.raw('CREATE INDEX idx_integration_webhooks_event_type ON integration_webhooks(event_type)');
  await knex.raw('CREATE INDEX idx_integration_webhooks_status ON integration_webhooks(status)');
  await knex.raw('CREATE INDEX idx_integration_webhooks_received ON integration_webhooks(received_at)');
  await knex.raw('CREATE INDEX idx_integration_webhooks_external ON integration_webhooks(external_id)');

  // ---------------------------------------------------------------------------
  // 8. sync_queue - Queue for sync operations
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('sync_queue', (table: Knex.CreateTableBuilder) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('venue_id').notNullable().comment('FK: venues.id');
    table.string('integration_type', 100).notNullable();
    table.string('sync_type', 100).notNullable();
    table.string('direction', 50).notNullable();
    table.string('status', 50).notNullable().defaultTo('pending');
    table.string('priority', 20).notNullable().defaultTo('normal');
    table.integer('attempts').defaultTo(0);
    table.integer('max_attempts').defaultTo(3);
    table.timestamp('scheduled_for');
    table.timestamp('started_at');
    table.timestamp('completed_at');
    table.integer('duration_ms');
    table.integer('records_processed').defaultTo(0);
    table.integer('records_succeeded').defaultTo(0);
    table.integer('records_failed').defaultTo(0);
    table.jsonb('errors').defaultTo('[]');
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_sync_queue_tenant ON sync_queue(tenant_id)');
  await knex.raw('CREATE INDEX idx_sync_queue_venue ON sync_queue(venue_id)');
  await knex.raw('CREATE INDEX idx_sync_queue_type ON sync_queue(integration_type)');
  await knex.raw('CREATE INDEX idx_sync_queue_status ON sync_queue(status)');
  await knex.raw('CREATE INDEX idx_sync_queue_priority ON sync_queue(priority)');
  await knex.raw('CREATE INDEX idx_sync_queue_scheduled ON sync_queue(scheduled_for)');
  await knex.raw('CREATE INDEX idx_sync_queue_composite ON sync_queue(status, priority, scheduled_for)');

  // ---------------------------------------------------------------------------
  // 9. sync_logs - Historical log of sync operations
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('sync_logs', (table: Knex.CreateTableBuilder) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('venue_id').notNullable().comment('FK: venues.id');
    table.string('integration_type', 100).notNullable();
    table.string('sync_type', 100).notNullable();
    table.string('direction', 50).notNullable();
    table.string('status', 50).notNullable();
    table.timestamp('started_at').notNullable();
    table.timestamp('completed_at');
    table.integer('duration_ms');
    table.integer('success_count').defaultTo(0);
    table.integer('error_count').defaultTo(0);
    table.integer('skip_count').defaultTo(0);
    table.jsonb('errors').defaultTo('[]');
    table.string('triggered_by', 100);
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_sync_logs_tenant ON sync_logs(tenant_id)');
  await knex.raw('CREATE INDEX idx_sync_logs_venue ON sync_logs(venue_id)');
  await knex.raw('CREATE INDEX idx_sync_logs_type ON sync_logs(integration_type)');
  await knex.raw('CREATE INDEX idx_sync_logs_status ON sync_logs(status)');
  await knex.raw('CREATE INDEX idx_sync_logs_started ON sync_logs(started_at)');
  await knex.raw('CREATE INDEX idx_sync_logs_created ON sync_logs(created_at)');

  // ---------------------------------------------------------------------------
  // 10. integration_costs - API usage and cost tracking
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('integration_costs', (table: Knex.CreateTableBuilder) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('venue_id').notNullable().comment('FK: venues.id');
    table.string('integration_type', 100).notNullable();
    table.date('period_start').notNullable();
    table.date('period_end').notNullable();
    table.integer('api_calls').defaultTo(0);
    table.decimal('data_synced_mb', 12, 2).defaultTo(0);
    table.integer('webhook_events').defaultTo(0);
    table.decimal('api_cost', 10, 2).defaultTo(0);
    table.decimal('storage_cost', 10, 2).defaultTo(0);
    table.decimal('webhook_cost', 10, 2).defaultTo(0);
    table.decimal('total_cost', 10, 2).defaultTo(0);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_integration_costs_tenant ON integration_costs(tenant_id)');
  await knex.raw('CREATE INDEX idx_integration_costs_venue ON integration_costs(venue_id)');
  await knex.raw('CREATE INDEX idx_integration_costs_type ON integration_costs(integration_type)');
  await knex.raw('CREATE INDEX idx_integration_costs_period ON integration_costs(period_start)');
  await knex.raw('CREATE INDEX idx_integration_costs_composite ON integration_costs(venue_id, integration_type, period_start)');

  // ---------------------------------------------------------------------------
  // 11. oauth_tokens - Dedicated OAuth token storage with KMS encryption
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('oauth_tokens', (table: Knex.CreateTableBuilder) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('venue_id').notNullable().comment('FK: venues.id');
    table.string('integration_type', 100).notNullable();
    table.string('provider', 100).notNullable();
    table.text('access_token_encrypted').notNullable();
    table.text('refresh_token_encrypted');
    table.text('id_token_encrypted');
    table.timestamp('access_token_expires_at');
    table.timestamp('refresh_token_expires_at');
    table.specificType('scopes', 'text[]').defaultTo('{}');
    table.string('token_type', 50).defaultTo('Bearer');
    table.string('oauth_state', 500);
    table.timestamp('oauth_state_expires_at');
    table.string('kms_key_id', 500).notNullable();
    table.string('encryption_context', 500);
    table.integer('token_version').defaultTo(1);
    table.timestamp('last_rotated_at');
    table.timestamp('last_validated_at');
    table.string('validation_status', 50).defaultTo('valid');
    table.jsonb('provider_metadata').defaultTo('{}');
    table.jsonb('rate_limit_info').defaultTo('{}');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.unique(['venue_id', 'integration_type']);
  });

  await knex.raw('CREATE INDEX idx_oauth_tokens_tenant ON oauth_tokens(tenant_id)');
  await knex.raw('CREATE INDEX idx_oauth_tokens_venue ON oauth_tokens(venue_id)');
  await knex.raw('CREATE INDEX idx_oauth_tokens_type ON oauth_tokens(integration_type)');
  await knex.raw('CREATE INDEX idx_oauth_tokens_provider ON oauth_tokens(provider)');
  await knex.raw('CREATE INDEX idx_oauth_tokens_expires ON oauth_tokens(access_token_expires_at)');
  await knex.raw('CREATE INDEX idx_oauth_tokens_validation ON oauth_tokens(validation_status)');
  await knex.raw('CREATE INDEX idx_oauth_tokens_state ON oauth_tokens(oauth_state) WHERE oauth_state IS NOT NULL');

  // ---------------------------------------------------------------------------
  // 12. venue_api_keys - API key storage for non-OAuth integrations
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('venue_api_keys', (table: Knex.CreateTableBuilder) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.uuid('venue_id').notNullable().comment('FK: venues.id');
    table.string('integration_type', 100).notNullable();
    table.string('provider', 100).notNullable();
    table.string('key_name', 255).notNullable();
    table.text('api_key_encrypted').notNullable();
    table.text('api_secret_encrypted');
    table.text('webhook_secret_encrypted');
    table.string('key_type', 50).notNullable();
    table.string('environment', 50).defaultTo('production');
    table.string('status', 50).notNullable().defaultTo('active');
    table.string('kms_key_id', 500).notNullable();
    table.string('encryption_context', 500);
    table.integer('key_version').defaultTo(1);
    table.timestamp('last_rotated_at');
    table.timestamp('last_used_at');
    table.timestamp('last_validated_at');
    table.string('validation_status', 50).defaultTo('valid');
    table.specificType('allowed_ip_ranges', 'text[]').defaultTo('{}');
    table.specificType('allowed_endpoints', 'text[]').defaultTo('{}');
    table.timestamp('expires_at');
    table.integer('usage_count_24h').defaultTo(0);
    table.integer('usage_count_30d').defaultTo(0);
    table.integer('error_count_24h').defaultTo(0);
    table.timestamp('usage_count_reset_at');
    table.jsonb('provider_metadata').defaultTo('{}');
    table.jsonb('rate_limit_info').defaultTo('{}');
    table.text('notes');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.unique(['venue_id', 'integration_type', 'key_name']);
  });

  await knex.raw('CREATE INDEX idx_venue_api_keys_tenant ON venue_api_keys(tenant_id)');
  await knex.raw('CREATE INDEX idx_venue_api_keys_venue ON venue_api_keys(venue_id)');
  await knex.raw('CREATE INDEX idx_venue_api_keys_type ON venue_api_keys(integration_type)');
  await knex.raw('CREATE INDEX idx_venue_api_keys_provider ON venue_api_keys(provider)');
  await knex.raw('CREATE INDEX idx_venue_api_keys_status ON venue_api_keys(status)');
  await knex.raw('CREATE INDEX idx_venue_api_keys_environment ON venue_api_keys(environment)');
  await knex.raw('CREATE INDEX idx_venue_api_keys_validation ON venue_api_keys(validation_status)');
  await knex.raw('CREATE INDEX idx_venue_api_keys_expires ON venue_api_keys(expires_at) WHERE expires_at IS NOT NULL');
  await knex.raw('CREATE INDEX idx_venue_api_keys_last_used ON venue_api_keys(last_used_at)');

  // ---------------------------------------------------------------------------
  // 13. field_mapping_templates - Reusable field mapping templates
  // ---------------------------------------------------------------------------
  await knex.schema.createTable('field_mapping_templates', (table: Knex.CreateTableBuilder) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('tenant_id').notNullable();
    table.string('name', 255).notNullable();
    table.text('description');
    table.string('venue_type', 100);
    table.string('integration_type', 100).notNullable();
    table.jsonb('mappings').notNullable();
    table.jsonb('validation_rules');
    table.boolean('is_active').defaultTo(true);
    table.boolean('is_default').defaultTo(false);
    table.integer('usage_count').defaultTo(0);
    table.timestamp('last_used_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_field_mapping_templates_tenant ON field_mapping_templates(tenant_id)');
  await knex.raw('CREATE INDEX idx_field_mapping_templates_type ON field_mapping_templates(integration_type)');
  await knex.raw('CREATE INDEX idx_field_mapping_templates_venue_type ON field_mapping_templates(venue_type)');
  await knex.raw('CREATE INDEX idx_field_mapping_templates_active ON field_mapping_templates(is_active)');
  await knex.raw('CREATE INDEX idx_field_mapping_templates_default ON field_mapping_templates(is_default)');
  await knex.raw('CREATE INDEX idx_field_mapping_templates_usage ON field_mapping_templates(usage_count)');
  await knex.raw('CREATE INDEX idx_field_mapping_templates_composite ON field_mapping_templates(venue_type, integration_type, is_active)');

  // ============================================================================
  // ROW LEVEL SECURITY - All 13 Tables
  // ============================================================================

  const tenantTables = [
    'integrations',
    'connections',
    'field_mappings',
    'webhooks',
    'integration_configs',
    'integration_health',
    'integration_webhooks',
    'sync_queue',
    'sync_logs',
    'integration_costs',
    'oauth_tokens',
    'venue_api_keys',
    'field_mapping_templates',
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

  console.log('✅ Integration Service consolidated migration complete');
}

export async function down(knex: Knex): Promise<void> {
  const tenantTables = [
    'integrations',
    'connections',
    'field_mappings',
    'webhooks',
    'integration_configs',
    'integration_health',
    'integration_webhooks',
    'sync_queue',
    'sync_logs',
    'integration_costs',
    'oauth_tokens',
    'venue_api_keys',
    'field_mapping_templates',
  ];

  // Drop RLS policies
  for (const tableName of tenantTables) {
    await knex.raw(`DROP POLICY IF EXISTS ${tableName}_tenant_isolation ON ${tableName}`);
    await knex.raw(`ALTER TABLE ${tableName} DISABLE ROW LEVEL SECURITY`);
  }

  // Drop tables in reverse dependency order
  await knex.schema.dropTableIfExists('field_mapping_templates');
  await knex.schema.dropTableIfExists('venue_api_keys');
  await knex.schema.dropTableIfExists('oauth_tokens');
  await knex.schema.dropTableIfExists('integration_costs');
  await knex.schema.dropTableIfExists('sync_logs');
  await knex.schema.dropTableIfExists('sync_queue');
  await knex.schema.dropTableIfExists('integration_webhooks');
  await knex.schema.dropTableIfExists('integration_health');
  await knex.schema.dropTableIfExists('integration_configs');
  await knex.schema.dropTableIfExists('webhooks');
  await knex.schema.dropTableIfExists('field_mappings');
  await knex.schema.dropTableIfExists('connections');
  await knex.schema.dropTableIfExists('integrations');

  console.log('✅ Integration Service rollback complete');
}
