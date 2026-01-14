import Knex = require('knex');

export async function up(knex: Knex): Promise<void> {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  // 1. INTEGRATIONS - Master catalog of available integrations
  await knex.schema.createTable('integrations', (table: any) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name', 255).notNullable();
    table.string('provider', 100).notNullable();
    table.string('category', 100).notNullable();
    table.string('status', 50).notNullable().defaultTo('active');
    table.jsonb('config').defaultTo('{}');
    table.text('credentials_encrypted');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    table.uuid('tenant_id').notNullable().defaultTo('00000000-0000-0000-0000-000000000001').references('id').inTable('tenants').onDelete('RESTRICT');
  });

  await knex.raw('CREATE INDEX integrations_tenant_id_index ON integrations(tenant_id)');
  await knex.raw('CREATE INDEX integrations_provider_index ON integrations(provider)');
  await knex.raw('CREATE INDEX integrations_category_index ON integrations(category)');
  await knex.raw('CREATE INDEX integrations_status_index ON integrations(status)');
  await knex.raw('CREATE UNIQUE INDEX integrations_name_provider_unique ON integrations(name, provider)');

  // 2. CONNECTIONS - User/venue connections to integrations
  await knex.schema.createTable('connections', (table: any) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('integration_id').notNullable().references('id').inTable('integrations').onDelete('CASCADE');
    table.uuid('user_id');
    table.uuid('venue_id');
    table.string('status', 50).notNullable().defaultTo('active');
    table.text('access_token_encrypted');
    table.text('refresh_token_encrypted');
    table.timestamp('token_expires_at', { useTz: true });
    table.specificType('scopes', 'text[]').defaultTo('{}');
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('last_sync_at', { useTz: true });
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    table.uuid('tenant_id').notNullable().defaultTo('00000000-0000-0000-0000-000000000001').references('id').inTable('tenants').onDelete('RESTRICT');
  });

  await knex.raw('CREATE INDEX connections_tenant_id_index ON connections(tenant_id)');
  await knex.raw('CREATE INDEX connections_integration_id_index ON connections(integration_id)');
  await knex.raw('CREATE INDEX connections_user_id_index ON connections(user_id)');
  await knex.raw('CREATE INDEX connections_venue_id_index ON connections(venue_id)');
  await knex.raw('CREATE INDEX connections_status_index ON connections(status)');
  await knex.raw('CREATE INDEX connections_last_sync_at_index ON connections(last_sync_at)');

  // 3. FIELD_MAPPINGS - Field mapping rules for data transformation
  await knex.schema.createTable('field_mappings', (table: any) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('connection_id').notNullable().references('id').inTable('connections').onDelete('CASCADE');
    table.string('source_field', 255).notNullable();
    table.string('target_field', 255).notNullable();
    table.jsonb('transform_rule').defaultTo('{}');
    table.boolean('is_active').defaultTo(true);
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    table.uuid('tenant_id').notNullable().defaultTo('00000000-0000-0000-0000-000000000001').references('id').inTable('tenants').onDelete('RESTRICT');
  });

  await knex.raw('CREATE INDEX field_mappings_tenant_id_index ON field_mappings(tenant_id)');
  await knex.raw('CREATE INDEX field_mappings_connection_id_index ON field_mappings(connection_id)');
  await knex.raw('CREATE INDEX field_mappings_is_active_index ON field_mappings(is_active)');
  await knex.raw('CREATE UNIQUE INDEX field_mappings_connection_id_source_field_target_field_unique ON field_mappings(connection_id, source_field, target_field)');

  // 4. WEBHOOKS - Webhook event queue and log
  await knex.schema.createTable('webhooks', (table: any) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('connection_id').notNullable().references('id').inTable('connections').onDelete('CASCADE');
    table.string('event_type', 255).notNullable();
    table.jsonb('payload').notNullable();
    table.string('status', 50).notNullable().defaultTo('pending');
    table.integer('retry_count').defaultTo(0);
    table.timestamp('processed_at', { useTz: true });
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.uuid('tenant_id').notNullable().defaultTo('00000000-0000-0000-0000-000000000001').references('id').inTable('tenants').onDelete('RESTRICT');
  });

  await knex.raw('CREATE INDEX webhooks_tenant_id_index ON webhooks(tenant_id)');
  await knex.raw('CREATE INDEX webhooks_connection_id_index ON webhooks(connection_id)');
  await knex.raw('CREATE INDEX webhooks_event_type_index ON webhooks(event_type)');
  await knex.raw('CREATE INDEX webhooks_status_index ON webhooks(status)');
  await knex.raw('CREATE INDEX webhooks_created_at_index ON webhooks(created_at)');

  // 5. INTEGRATION_CONFIGS - Venue-specific integration configurations
  await knex.schema.createTable('integration_configs', (table: any) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').notNullable();
    table.string('integration_type', 100).notNullable();
    table.string('status', 50).notNullable().defaultTo('active');
    table.string('health_status', 50).defaultTo('healthy');
    table.text('access_token_encrypted');
    table.text('refresh_token_encrypted');
    table.text('api_key_encrypted');
    table.text('api_secret_encrypted');
    table.timestamp('token_expires_at', { useTz: true });
    table.timestamp('last_token_refresh', { useTz: true });
    table.jsonb('config').defaultTo('{}');
    table.jsonb('field_mappings').defaultTo('{}');
    table.string('template_id', 100);
    table.timestamp('template_applied_at', { useTz: true });
    table.specificType('scopes', 'text[]').defaultTo('{}');
    table.string('oauth_state', 255);
    table.timestamp('last_sync_at', { useTz: true });
    table.string('last_sync_status', 50);
    table.jsonb('last_sync_error');
    table.jsonb('metadata').defaultTo('{}');
    table.timestamps(true, true);
    table.uuid('tenant_id').notNullable().defaultTo('00000000-0000-0000-0000-000000000001').references('id').inTable('tenants').onDelete('RESTRICT');
  });

  await knex.raw('CREATE INDEX integration_configs_tenant_id_idx ON integration_configs(tenant_id)');
  await knex.raw('CREATE INDEX integration_configs_venue_id_idx ON integration_configs(venue_id)');
  await knex.raw('CREATE INDEX integration_configs_integration_type_idx ON integration_configs(integration_type)');
  await knex.raw('CREATE INDEX integration_configs_status_idx ON integration_configs(status)');
  await knex.raw('CREATE INDEX integration_configs_health_status_idx ON integration_configs(health_status)');
  await knex.raw('CREATE INDEX integration_configs_last_sync_at_idx ON integration_configs(last_sync_at)');
  await knex.raw('CREATE UNIQUE INDEX integration_configs_venue_integration_unique ON integration_configs(venue_id, integration_type)');

  // 6. INTEGRATION_HEALTH - Health monitoring metrics
  await knex.schema.createTable('integration_health', (table: any) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').notNullable();
    table.string('integration_type', 100).notNullable();
    table.string('status', 50).notNullable().defaultTo('unknown');
    table.integer('success_rate').defaultTo(100);
    table.integer('avg_response_time').defaultTo(0);
    table.integer('error_count_24h').defaultTo(0);
    table.integer('total_requests_24h').defaultTo(0);
    table.timestamp('last_check_at', { useTz: true });
    table.jsonb('last_error');
    table.string('last_error_type', 100);
    table.decimal('uptime_percentage', 5, 2).defaultTo(100.00);
    table.timestamp('last_outage_at', { useTz: true });
    table.integer('outage_count_30d').defaultTo(0);
    table.timestamps(true, true);
    table.uuid('tenant_id').notNullable().defaultTo('00000000-0000-0000-0000-000000000001').references('id').inTable('tenants').onDelete('RESTRICT');
  });

  await knex.raw('CREATE INDEX integration_health_tenant_id_idx ON integration_health(tenant_id)');
  await knex.raw('CREATE INDEX integration_health_venue_id_idx ON integration_health(venue_id)');
  await knex.raw('CREATE INDEX integration_health_integration_type_idx ON integration_health(integration_type)');
  await knex.raw('CREATE INDEX integration_health_status_idx ON integration_health(status)');
  await knex.raw('CREATE INDEX integration_health_last_check_at_idx ON integration_health(last_check_at)');
  await knex.raw('CREATE UNIQUE INDEX integration_health_venue_integration_unique ON integration_health(venue_id, integration_type)');

  // 7. INTEGRATION_WEBHOOKS - Integration webhook event storage
  await knex.schema.createTable('integration_webhooks', (table: any) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id');
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
    table.timestamp('processed_at', { useTz: true });
    table.timestamp('received_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.uuid('tenant_id').notNullable().defaultTo('00000000-0000-0000-0000-000000000001').references('id').inTable('tenants').onDelete('RESTRICT');
  });

  await knex.raw('CREATE INDEX integration_webhooks_tenant_id_idx ON integration_webhooks(tenant_id)');
  await knex.raw('CREATE INDEX integration_webhooks_venue_id_idx ON integration_webhooks(venue_id)');
  await knex.raw('CREATE INDEX integration_webhooks_integration_type_idx ON integration_webhooks(integration_type)');
  await knex.raw('CREATE INDEX integration_webhooks_event_type_idx ON integration_webhooks(event_type)');
  await knex.raw('CREATE INDEX integration_webhooks_status_idx ON integration_webhooks(status)');
  await knex.raw('CREATE INDEX integration_webhooks_received_at_idx ON integration_webhooks(received_at)');
  await knex.raw('CREATE INDEX integration_webhooks_external_id_idx ON integration_webhooks(external_id)');

  // 8. SYNC_QUEUE - Queue for sync operations
  await knex.schema.createTable('sync_queue', (table: any) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').notNullable();
    table.string('integration_type', 100).notNullable();
    table.string('sync_type', 100).notNullable();
    table.string('direction', 50).notNullable();
    table.string('status', 50).notNullable().defaultTo('pending');
    table.string('priority', 20).notNullable().defaultTo('normal');
    table.integer('attempts').defaultTo(0);
    table.integer('max_attempts').defaultTo(3);
    table.timestamp('scheduled_for', { useTz: true });
    table.timestamp('started_at', { useTz: true });
    table.timestamp('completed_at', { useTz: true });
    table.integer('duration_ms');
    table.integer('records_processed').defaultTo(0);
    table.integer('records_succeeded').defaultTo(0);
    table.integer('records_failed').defaultTo(0);
    table.jsonb('errors').defaultTo('[]');
    table.jsonb('metadata').defaultTo('{}');
    table.timestamps(true, true);
    table.uuid('tenant_id').notNullable().defaultTo('00000000-0000-0000-0000-000000000001').references('id').inTable('tenants').onDelete('RESTRICT');
  });

  await knex.raw('CREATE INDEX sync_queue_tenant_id_idx ON sync_queue(tenant_id)');
  await knex.raw('CREATE INDEX sync_queue_venue_id_idx ON sync_queue(venue_id)');
  await knex.raw('CREATE INDEX sync_queue_integration_type_idx ON sync_queue(integration_type)');
  await knex.raw('CREATE INDEX sync_queue_status_idx ON sync_queue(status)');
  await knex.raw('CREATE INDEX sync_queue_priority_idx ON sync_queue(priority)');
  await knex.raw('CREATE INDEX sync_queue_scheduled_for_idx ON sync_queue(scheduled_for)');
  await knex.raw('CREATE INDEX sync_queue_composite_idx ON sync_queue(status, priority, scheduled_for)');

  // 9. SYNC_LOGS - Historical log of sync operations
  await knex.schema.createTable('sync_logs', (table: any) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').notNullable();
    table.string('integration_type', 100).notNullable();
    table.string('sync_type', 100).notNullable();
    table.string('direction', 50).notNullable();
    table.string('status', 50).notNullable();
    table.timestamp('started_at', { useTz: true }).notNullable();
    table.timestamp('completed_at', { useTz: true });
    table.integer('duration_ms');
    table.integer('success_count').defaultTo(0);
    table.integer('error_count').defaultTo(0);
    table.integer('skip_count').defaultTo(0);
    table.jsonb('errors').defaultTo('[]');
    table.string('triggered_by', 100);
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.uuid('tenant_id').notNullable().defaultTo('00000000-0000-0000-0000-000000000001').references('id').inTable('tenants').onDelete('RESTRICT');
  });

  await knex.raw('CREATE INDEX sync_logs_tenant_id_idx ON sync_logs(tenant_id)');
  await knex.raw('CREATE INDEX sync_logs_venue_id_idx ON sync_logs(venue_id)');
  await knex.raw('CREATE INDEX sync_logs_integration_type_idx ON sync_logs(integration_type)');
  await knex.raw('CREATE INDEX sync_logs_status_idx ON sync_logs(status)');
  await knex.raw('CREATE INDEX sync_logs_started_at_idx ON sync_logs(started_at)');
  await knex.raw('CREATE INDEX sync_logs_created_at_idx ON sync_logs(created_at)');

  // 10. INTEGRATION_COSTS - API usage and cost tracking
  await knex.schema.createTable('integration_costs', (table: any) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').notNullable();
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
    table.timestamps(true, true);
    table.uuid('tenant_id').notNullable().defaultTo('00000000-0000-0000-0000-000000000001').references('id').inTable('tenants').onDelete('RESTRICT');
  });

  await knex.raw('CREATE INDEX integration_costs_tenant_id_idx ON integration_costs(tenant_id)');
  await knex.raw('CREATE INDEX integration_costs_venue_id_idx ON integration_costs(venue_id)');
  await knex.raw('CREATE INDEX integration_costs_integration_type_idx ON integration_costs(integration_type)');
  await knex.raw('CREATE INDEX integration_costs_period_start_idx ON integration_costs(period_start)');
  await knex.raw('CREATE INDEX integration_costs_composite_idx ON integration_costs(venue_id, integration_type, period_start)');

  // RLS
  await knex.raw('ALTER TABLE integrations ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE connections ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE field_mappings ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE integration_configs ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE integration_health ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE integration_webhooks ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE sync_queue ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE integration_costs ENABLE ROW LEVEL SECURITY');

  await knex.raw(`CREATE POLICY tenant_isolation_policy ON integrations USING (tenant_id::text = current_setting('app.current_tenant', true))`);
  await knex.raw(`CREATE POLICY tenant_isolation_policy ON connections USING (tenant_id::text = current_setting('app.current_tenant', true))`);
  await knex.raw(`CREATE POLICY tenant_isolation_policy ON field_mappings USING (tenant_id::text = current_setting('app.current_tenant', true))`);
  await knex.raw(`CREATE POLICY tenant_isolation_policy ON webhooks USING (tenant_id::text = current_setting('app.current_tenant', true))`);
  await knex.raw(`CREATE POLICY tenant_isolation_policy ON integration_configs USING (tenant_id::text = current_setting('app.current_tenant', true))`);
  await knex.raw(`CREATE POLICY tenant_isolation_policy ON integration_health USING (tenant_id::text = current_setting('app.current_tenant', true))`);
  await knex.raw(`CREATE POLICY tenant_isolation_policy ON integration_webhooks USING (tenant_id::text = current_setting('app.current_tenant', true))`);
  await knex.raw(`CREATE POLICY tenant_isolation_policy ON sync_queue USING (tenant_id::text = current_setting('app.current_tenant', true))`);
  await knex.raw(`CREATE POLICY tenant_isolation_policy ON sync_logs USING (tenant_id::text = current_setting('app.current_tenant', true))`);
  await knex.raw(`CREATE POLICY tenant_isolation_policy ON integration_costs USING (tenant_id::text = current_setting('app.current_tenant', true))`);

  // ==========================================
  // FOREIGN KEY CONSTRAINTS
  // ==========================================
  console.log('');
  console.log('🔗 Adding foreign key constraints...');

  // connections FKs
  await knex.schema.alterTable('connections', (table: any) => {
    table.foreign('user_id').references('id').inTable('users').onDelete('SET NULL');
    table.foreign('venue_id').references('id').inTable('venues').onDelete('SET NULL');
  });
  console.log('✅ connections → users, venues');

  // integration_configs FKs
  await knex.schema.alterTable('integration_configs', (table: any) => {
    table.foreign('venue_id').references('id').inTable('venues').onDelete('CASCADE');
  });
  console.log('✅ integration_configs → venues');

  // integration_health FKs
  await knex.schema.alterTable('integration_health', (table: any) => {
    table.foreign('venue_id').references('id').inTable('venues').onDelete('CASCADE');
  });
  console.log('✅ integration_health → venues');

  // integration_webhooks FKs
  await knex.schema.alterTable('integration_webhooks', (table: any) => {
    table.foreign('venue_id').references('id').inTable('venues').onDelete('SET NULL');
  });
  console.log('✅ integration_webhooks → venues');

  // sync_queue FKs
  await knex.schema.alterTable('sync_queue', (table: any) => {
    table.foreign('venue_id').references('id').inTable('venues').onDelete('CASCADE');
  });
  console.log('✅ sync_queue → venues');

  // sync_logs FKs
  await knex.schema.alterTable('sync_logs', (table: any) => {
    table.foreign('venue_id').references('id').inTable('venues').onDelete('CASCADE');
  });
  console.log('✅ sync_logs → venues');

  // integration_costs FKs
  await knex.schema.alterTable('integration_costs', (table: any) => {
    table.foreign('venue_id').references('id').inTable('venues').onDelete('CASCADE');
  });
  console.log('✅ integration_costs → venues');

  console.log('✅ All FK constraints added (8 total)');

  console.log('✅ Integration Service migration complete - 11 tables created with RLS');
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON integration_costs');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON sync_logs');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON sync_queue');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON integration_webhooks');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON integration_health');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON integration_configs');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON webhooks');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON field_mappings');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON connections');
  await knex.raw('DROP POLICY IF EXISTS tenant_isolation_policy ON integrations');

  await knex.raw('ALTER TABLE integration_costs DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE sync_logs DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE sync_queue DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE integration_webhooks DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE integration_health DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE integration_configs DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE webhooks DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE field_mappings DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE connections DISABLE ROW LEVEL SECURITY');
  await knex.raw('ALTER TABLE integrations DISABLE ROW LEVEL SECURITY');

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
}
